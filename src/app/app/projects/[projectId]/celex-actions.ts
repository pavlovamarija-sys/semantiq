"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registerPersistedSourcePdf } from "@/infrastructure/artifacts/source-pdf-registration";
import { analyzePdf, runShadowReconstruction } from "@/infrastructure/document-conversion/pdf-to-docx";
import { downloadEnglishCelexPdf, parseCelexInput, resolveCorrigenda, resolveEnglishCelexPdf, type CelexResolution } from "@/infrastructure/eu-publications/celex";
import { extractCelexFromScreenshot, type OcrCelexCandidate } from "@/infrastructure/eu-publications/celex-ocr";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

const SOURCE_BUCKET = "source-documents";
const uuid = z.uuid();

export type ResolveCelexState = {
  status: "idle" | "success" | "error";
  message?: string;
  results: CelexResolution[];
};

export type ImportCelexState = {
  status: "idle" | "success" | "error";
  message?: string;
  imported?: string[];
  importedDocuments?: Array<{ celex:string; documentId:string }>;
  skipped?: string[];
};

function logImportSkip(celex: string, reason: string, details?: Record<string, unknown>) {
  console.error("CELEX import skipped.", { celex, reason, ...details });
}

export type OcrCelexState = {
  status: "idle" | "success" | "error";
  message?: string;
  candidates: OcrCelexCandidate[];
};

async function ownedProject(projectId: FormDataEntryValue | null) {
  const parsed = uuid.safeParse(projectId);
  if (!parsed.success) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("projects").select("id").eq("id", parsed.data).maybeSingle();
  return data;
}

export async function recognizeCelexScreenshot(_state: OcrCelexState, formData: FormData): Promise<OcrCelexState> {
  if (!await getAuthenticatedUser()) return { status: "error", message: "Your session has expired. Sign in and try again.", candidates: [] };
  if (!await ownedProject(formData.get("projectId"))) return { status: "error", message: "Project not found or access was denied.", candidates: [] };
  const screenshot = formData.get("screenshot");
  if (!(screenshot instanceof File)) return { status: "error", message: "Choose a screenshot to scan.", candidates: [] };

  try {
    const candidates = await extractCelexFromScreenshot(screenshot);
    if (process.env.NODE_ENV !== "production") {
      console.info("Screenshot CELEX server action candidates.", { candidateCount: candidates.length, candidates });
    }
    if (candidates.length === 0) return { status: "success", message: "No CELEX numbers were detected. Try a clearer crop or enter them manually.", candidates };
    const reviewCount = candidates.filter((candidate) => candidate.status === "review").length;
    return {
      status: "success",
      message: `Detected ${candidates.length} possible CELEX number${candidates.length === 1 ? "" : "s"}.${reviewCount ? ` ${reviewCount} need${reviewCount === 1 ? "s" : ""} manual review.` : " Review them before confirming."}`,
      candidates,
    };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "The screenshot could not be processed.", candidates: [] };
  }
}

export async function resolveCelexDocuments(_state: ResolveCelexState, formData: FormData): Promise<ResolveCelexState> {
  if (!await getAuthenticatedUser()) return { status: "error", message: "Your session has expired. Sign in and try again.", results: [] };
  if (!await ownedProject(formData.get("projectId"))) return { status: "error", message: "Project not found or access was denied.", results: [] };

  const { valid, invalid } = parseCelexInput(String(formData.get("celexNumbers") ?? ""));
  if (invalid.length > 0 || valid.length === 0) return { status: "error", message: invalid.length ? `Invalid CELEX format: ${invalid.join(", ")}` : "Enter at least one CELEX number.", results: [] };
  if (valid.length > 25) return { status: "error", message: "Resolve up to 25 CELEX numbers at a time.", results: [] };

  const results = await Promise.all(valid.map(resolveEnglishCelexPdf));
  return { status: "success", results, message: `${results.filter((item) => item.found).length} of ${results.length} official English PDFs found.` };
}

export async function importCelexDocuments(_state: ImportCelexState, formData: FormData): Promise<ImportCelexState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };
  const project = await ownedProject(formData.get("projectId"));
  if (!project) return { status: "error", message: "Project not found or access was denied." };

  const { valid, invalid } = parseCelexInput(formData.getAll("celex").map(String).join(" "));
  if (invalid.length > 0 || valid.length === 0) return { status: "error", message: "Select at least one valid resolved CELEX document." };
  if (valid.length > 25) return { status: "error", message: "Import up to 25 CELEX documents at a time." };

  const requestedCorrigenda = formData.getAll("corrigendum").map(String).flatMap((value) => {
    const [parentCelex, corrigendumCelex] = value.split("|");
    return parentCelex && corrigendumCelex && valid.includes(parentCelex) ? [{ parentCelex, corrigendumCelex }] : [];
  });
  const resolvedPdfByCelex = new Map<string, string>();
  for (const value of formData.getAll("resolvedPdf")) {
    try {
      const parsed = JSON.parse(String(value)) as { celex?: string; url?: string };
      if (parsed.celex && parsed.url) resolvedPdfByCelex.set(parsed.celex, parsed.url);
    } catch {
      logImportSkip("unknown", "invalid-resolved-metadata", { value: String(value).slice(0, 200) });
    }
  }

  const supabase = await createSupabaseServerClient();
  const allRequestedCelex = [...valid, ...requestedCorrigenda.map((item) => item.corrigendumCelex)];
  const { data: existing } = await supabase.from("documents").select("id, celex_number, document_versions(id, version_number, source_storage_path)").eq("project_id", project.id).in("celex_number", allRequestedCelex);
  const completedByCelex = new Map((existing ?? []).filter((item) => item.document_versions.some((version) => Boolean(version.source_storage_path))).map((item) => [item.celex_number, item.id]));
  const recoverableByCelex = new Map((existing ?? []).filter((item) => !item.document_versions.some((version) => Boolean(version.source_storage_path))).map((item) => [item.celex_number, item]));
  const imported: string[] = [];
  const importedDocuments: Array<{celex:string;documentId:string}> = [];
  const skipped = valid.filter((celex) => completedByCelex.has(celex));
  for (const celex of skipped) logImportSkip(celex, "already-imported");
  const originalDocumentIds = new Map<string, string>(valid.flatMap((celex) => {
    const id = completedByCelex.get(celex);
    return id ? [[celex, id] as const] : [];
  }));

  for (const celex of valid.filter((value) => !completedByCelex.has(value))) {
    let official;
    try {
      official = await downloadEnglishCelexPdf(celex, resolvedPdfByCelex.get(celex));
    } catch (error) {
      logImportSkip(celex, "download-failed", { error: error instanceof Error ? error.message : String(error) });
      skipped.push(celex);
      continue;
    }
    let pdfAnalysis;
    try {
      pdfAnalysis = await analyzePdf(official.bytes, `${celex}_EN.pdf`);
    } catch (error) {
      logImportSkip(celex, "pdf-analysis-failed", { error: error instanceof Error ? error.message : String(error) });
      skipped.push(celex);
      continue;
    }

    const recoverable = recoverableByCelex.get(celex);
    const existingDocumentId = recoverable?.id;
    const existingVersion = recoverable?.document_versions[0];
    const documentId = existingDocumentId ?? crypto.randomUUID();
    const versionId = existingVersion?.id ?? crypto.randomUUID();
    const filename = `${celex}_EN.pdf`;
    const storagePath = `${user.id}/${project.id}/${documentId}/${versionId}.pdf`;
    const retrievedAt = new Date().toISOString();
    const { error: documentError } = existingDocumentId ? { error: null } : await supabase.from("documents").insert({
      id: documentId,
      project_id: project.id,
      title: `CELEX ${celex}`,
      document_type: "pdf",
      celex_number: celex,
      source_language: "en",
      source_filename: filename,
      source_reference: official.sourceUrl,
      source_retrieved_at: retrievedAt,
      provenance_metadata: {
        provider: "Publications Office of the European Union",
        service: "CELLAR RESTful API",
        requested_url: official.sourceUrl,
        resolved_url: official.resolvedUrl,
        language: "eng",
        format: "application/pdf",
        retrieved_at: retrievedAt,
      },
    });
    if (documentError) {
      logImportSkip(celex, "document-insert-failed", { error: documentError.message });
      skipped.push(celex);
      continue;
    }

    const versionValues = {
      id: versionId,
      document_id: documentId,
      version_number: existingVersion?.version_number ?? 1,
      extraction_status: pdfAnalysis.sourceText === null ? "failed" : "completed",
      source_storage_bucket: SOURCE_BUCKET,
      source_storage_path: storagePath,
      source_filename: filename,
      source_mime_type: "application/pdf",
      source_file_size_bytes: official.bytes.byteLength,
      characters_without_spaces: pdfAnalysis.charactersWithoutSpaces,
      characters_with_spaces: pdfAnalysis.charactersWithSpaces,
      character_count_error: pdfAnalysis.countError,
      raw_text: pdfAnalysis.sourceText,
      extraction_diagnostics: pdfAnalysis.diagnostics,
    };
    const { error: uploadError } = await supabase.storage.from(SOURCE_BUCKET).upload(storagePath, official.bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      logImportSkip(celex, "storage-upload-failed", { error: uploadError.message, storagePath });
      if (!existingDocumentId) await supabase.from("documents").delete().eq("id", documentId);
      skipped.push(celex);
      continue;
    }
    const { error: versionError } = existingVersion
      ? await supabase.from("document_versions").update(versionValues).eq("id", versionId)
      : await supabase.from("document_versions").insert(versionValues);
    if (versionError) {
      logImportSkip(celex, "document-version-write-failed", { error: versionError.message });
      await supabase.storage.from(SOURCE_BUCKET).remove([storagePath]);
      if (!existingDocumentId) await supabase.from("documents").delete().eq("id", documentId);
      skipped.push(celex);
      continue;
    }
    try {
      await registerPersistedSourcePdf(supabase, {
        projectId: project.id, documentId, documentVersionId: versionId, userId: user.id,
        storageBucket: SOURCE_BUCKET, storagePath, originalFilename: filename,
        expectedByteSize: official.bytes.byteLength, producerKind: "celex_import",
      });
    } catch (error) {
      logImportSkip(celex, "source-artifact-registration-failed", {
        error: error instanceof Error ? error.message : String(error), documentId, versionId, storagePath,
      });
    }
    await runShadowReconstruction(official.bytes, filename, { documentId, importId: versionId, celex });
    originalDocumentIds.set(celex, documentId);
    imported.push(celex);
    importedDocuments.push({celex,documentId});
  }

  for (const requested of requestedCorrigenda) {
    if (completedByCelex.has(requested.corrigendumCelex)) {
      logImportSkip(requested.corrigendumCelex, "corrigendum-already-imported");
      skipped.push(requested.corrigendumCelex);
      continue;
    }
    const parentDocumentId = originalDocumentIds.get(requested.parentCelex);
    if (!parentDocumentId) {
      logImportSkip(requested.corrigendumCelex, "parent-document-not-imported");
      skipped.push(requested.corrigendumCelex);
      continue;
    }
    const officialMetadata = await resolveCorrigenda(requested.parentCelex);
    const corrigendum = officialMetadata.corrigenda.find((item) => item.celex === requested.corrigendumCelex && item.affectsEnglish);
    if (!corrigendum) {
      logImportSkip(requested.corrigendumCelex, "english-corrigendum-not-found");
      skipped.push(requested.corrigendumCelex);
      continue;
    }

    let official;
    try {
      official = await downloadEnglishCelexPdf(corrigendum.celex, corrigendum.pdfUrl);
    } catch (error) {
      logImportSkip(corrigendum.celex, "corrigendum-download-failed", { error: error instanceof Error ? error.message : String(error) });
      skipped.push(corrigendum.celex);
      continue;
    }
    let pdfAnalysis;
    try {
      pdfAnalysis = await analyzePdf(official.bytes, `${corrigendum.celex}_EN.pdf`);
    } catch (error) {
      logImportSkip(corrigendum.celex, "corrigendum-pdf-analysis-failed", { error: error instanceof Error ? error.message : String(error) });
      skipped.push(corrigendum.celex);
      continue;
    }
    const recoverable = recoverableByCelex.get(corrigendum.celex);
    const existingDocumentId = recoverable?.id;
    const existingVersion = recoverable?.document_versions[0];
    const documentId = existingDocumentId ?? crypto.randomUUID();
    const versionId = existingVersion?.id ?? crypto.randomUUID();
    const filename = `${corrigendum.celex}_EN.pdf`;
    const storagePath = `${user.id}/${project.id}/${documentId}/${versionId}.pdf`;
    const retrievedAt = new Date().toISOString();
    const { error: documentError } = existingDocumentId ? { error: null } : await supabase.from("documents").insert({
      id: documentId, project_id: project.id, parent_document_id: parentDocumentId, relation_type: "corrigendum",
      title: `Corrigendum ${corrigendum.celex}`, document_type: "pdf", celex_number: corrigendum.celex,
      source_language: "en", source_filename: filename, source_reference: official.sourceUrl,
      source_retrieved_at: retrievedAt, publication_date: corrigendum.publicationDate ?? null,
      affected_languages: corrigendum.affectedLanguages, affects_english: true,
      provenance_metadata: { provider: "Publications Office of the European Union", service: "CELLAR RESTful API",
        relation: "corrigendum", corrects_celex: requested.parentCelex, metadata_source: corrigendum.sourceUrl,
        requested_url: official.sourceUrl, resolved_url: official.resolvedUrl, language: "eng", format: "application/pdf", retrieved_at: retrievedAt },
    });
    if (documentError) {
      logImportSkip(corrigendum.celex, "corrigendum-document-insert-failed", { error: documentError.message });
      skipped.push(corrigendum.celex);
      continue;
    }
    const versionValues = {
      id: versionId, document_id: documentId, version_number: existingVersion?.version_number ?? 1,
      extraction_status: pdfAnalysis.sourceText === null ? "failed" : "completed",
      source_storage_bucket: SOURCE_BUCKET, source_storage_path: storagePath, source_filename: filename,
      source_mime_type: "application/pdf", source_file_size_bytes: official.bytes.byteLength,
      characters_without_spaces: pdfAnalysis.charactersWithoutSpaces,
      characters_with_spaces: pdfAnalysis.charactersWithSpaces,
      character_count_error: pdfAnalysis.countError,
      raw_text: pdfAnalysis.sourceText,
      extraction_diagnostics: pdfAnalysis.diagnostics,
    };
    const { error: uploadError } = await supabase.storage.from(SOURCE_BUCKET).upload(storagePath, official.bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      logImportSkip(corrigendum.celex, "corrigendum-storage-upload-failed", { error: uploadError.message, storagePath });
      if (!existingDocumentId) await supabase.from("documents").delete().eq("id", documentId);
      skipped.push(corrigendum.celex);
      continue;
    }
    const { error: versionError } = existingVersion
      ? await supabase.from("document_versions").update(versionValues).eq("id", versionId)
      : await supabase.from("document_versions").insert(versionValues);
    if (versionError) {
      logImportSkip(corrigendum.celex, "corrigendum-document-version-write-failed", { error: versionError.message });
      await supabase.storage.from(SOURCE_BUCKET).remove([storagePath]);
      if (!existingDocumentId) await supabase.from("documents").delete().eq("id", documentId);
      skipped.push(corrigendum.celex);
      continue;
    }
    try {
      await registerPersistedSourcePdf(supabase, {
        projectId: project.id, documentId, documentVersionId: versionId, userId: user.id,
        storageBucket: SOURCE_BUCKET, storagePath, originalFilename: filename,
        expectedByteSize: official.bytes.byteLength, producerKind: "corrigendum_import",
      });
    } catch (error) {
      logImportSkip(corrigendum.celex, "source-artifact-registration-failed", {
        error: error instanceof Error ? error.message : String(error), documentId, versionId, storagePath,
      });
    }
    await runShadowReconstruction(official.bytes, filename, { documentId, importId: versionId, celex: corrigendum.celex });
    imported.push(corrigendum.celex);
    importedDocuments.push({celex:corrigendum.celex,documentId});
  }

  revalidatePath(`/app/projects/${project.id}`);
  if (imported.length === 0) return { status: "error", message: skipped.length ? "No documents were imported. They may already exist or no longer be available." : "No documents were imported.", imported, importedDocuments, skipped };
  return { status: "success", message: `Imported ${imported.length} official English PDF${imported.length === 1 ? "" : "s"}.${skipped.length ? ` Skipped ${skipped.length}.` : ""}`, imported, importedDocuments, skipped };
}
