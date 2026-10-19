"use server";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { countDocxCharacters } from "@/infrastructure/document-analysis/character-counts";
import { analyzePdf, convertPdfToDocx, DocxValidationError, PdfToDocxConversionError, runShadowReconstruction, validateDocx } from "@/infrastructure/document-conversion/pdf-to-docx";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

const SOURCE_BUCKET = "source-documents";
const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024;
const uuid = z.uuid();
const allowedFiles = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type DocumentActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  refresh?: boolean;
  documentId?: string;
};

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type TransformationStage =
  | "prepare-derived-document"
  | "download-source-pdf"
  | "validate-source-pdf"
  | "extract-convert-content"
  | "generate-validate-docx"
  | "save-generated-docx"
  | "create-document-version"
  | "mark-ready";

function logTransformation(
  event: "started" | "completed" | "failed",
  stage: TransformationStage,
  context: Record<string, unknown>,
  error?: unknown,
) {
  const exception = error instanceof Error ? {
    name: error.name,
    message: error.message,
    ...(error instanceof PdfToDocxConversionError || error instanceof DocxValidationError ? error.details : {}),
    ...(error instanceof PdfToDocxConversionError ? {
      workerCode: error.workerCode,
      responseStatus: error.responseStatus,
      responseBody: error.responseBody,
    } : {}),
  } : error === undefined ? undefined : { name: "UnknownError", message: String(error) };
  const payload = { component: "TransformerV1", event, stage, ...context, ...(exception ? { exception } : {}) };
  if (event === "failed") console.error("Transformer V1 stage failed.", payload);
  else console.info("Transformer V1 stage update.", payload);
}

function transformationFailureMessage(stage: TransformationStage, error: unknown) {
  if (error instanceof PdfToDocxConversionError) {
    const status = error.responseStatus ? `HTTP ${error.responseStatus}` : "request failure";
    const code = error.workerCode ? ` [${error.workerCode}]` : "";
    const body = error.responseBody ? ` Response body: ${error.responseBody}` : "";
    return `${stage}: Worker ${status}${code}: ${error.message}.${body}`.slice(0, 2_000);
  }
  return `${stage}: ${error instanceof Error ? error.message : "Unknown transformation failure"}`.slice(0, 2_000);
}

type SupabaseError = {
  name?: string;
  message: string;
  status?: number;
  statusCode?: string;
  code?: string;
  details?: string;
  hint?: string;
};

function logSupabaseError(operation: string, error: SupabaseError, context: Record<string, unknown>) {
  console.error(`Source document ${operation} failed in Supabase.`, {
    ...context,
    name: error.name,
    message: error.message,
    status: error.status,
    statusCode: error.statusCode,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

function isExpectedSignature(bytes: Uint8Array, extension: keyof typeof allowedFiles) {
  if (extension === "pdf") return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
    && ((bytes[2] === 0x03 && bytes[3] === 0x04) || (bytes[2] === 0x05 && bytes[3] === 0x06) || (bytes[2] === 0x07 && bytes[3] === 0x08));
}

function getValidatedSourceFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return { error: "Choose a PDF or DOCX file to upload." } as const;
  if (value.size > MAX_SOURCE_FILE_BYTES) return { error: "The source document must be 50 MB or smaller." } as const;

  const extension = value.name.split(".").pop()?.toLocaleLowerCase();
  if (extension !== "pdf" && extension !== "docx") return { error: "Only PDF and DOCX source documents are supported." } as const;
  if (value.type && value.type !== allowedFiles[extension]) return { error: `The selected file is not a valid ${extension.toUpperCase()} document.` } as const;
  if (value.name.length > 255) return { error: "The source filename must be 255 characters or fewer." } as const;

  return { file: value, extension, mimeType: allowedFiles[extension] } as const;
}

export async function uploadSourceDocument(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };

  const projectId = uuid.safeParse(formData.get("projectId"));
  if (!projectId.success) return { status: "error", message: "Unable to identify this project." };

  const validated = getValidatedSourceFile(formData.get("sourceFile"));
  if ("error" in validated) return { status: "error", message: validated.error };

  const signature = new Uint8Array(await validated.file.slice(0, 8).arrayBuffer());
  if (!isExpectedSignature(signature, validated.extension)) {
    return { status: "error", message: `The selected file does not contain a valid ${validated.extension.toUpperCase()} file signature.` };
  }

  let characterCounts: { charactersWithoutSpaces: number | null; charactersWithSpaces: number | null };
  let pdfAnalysis: Awaited<ReturnType<typeof analyzePdf>> | null = null;
  try {
    const fileBytes = new Uint8Array(await validated.file.arrayBuffer());
    if (validated.extension === "pdf") {
      pdfAnalysis = await analyzePdf(fileBytes, validated.file.name);
      characterCounts = { charactersWithoutSpaces: pdfAnalysis.charactersWithoutSpaces, charactersWithSpaces: pdfAnalysis.charactersWithSpaces };
    } else {
      characterCounts = await countDocxCharacters(fileBytes);
    }
  } catch (error) {
    console.error("Source document character counting failed.", { filename: validated.file.name, error });
    return { status: "error", message: `The ${validated.extension.toUpperCase()} text could not be read, so the document was not uploaded.` };
  }


  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase.from("projects").select("id, source_language").eq("id", projectId.data).maybeSingle();
  if (!project) return { status: "error", message: "Project not found or you do not have permission to upload to it." };

  const documentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const storagePath = `${user.id}/${project.id}/${documentId}/${versionId}.${validated.extension}`;
  const title = validated.file.name.replace(/\.(pdf|docx)$/i, "").trim() || validated.file.name;

  const { error: uploadError } = await supabase.storage.from(SOURCE_BUCKET).upload(storagePath, validated.file, {
    contentType: validated.mimeType,
    upsert: false,
  });
  if (uploadError) {
    logSupabaseError("storage upload", uploadError, { bucket: SOURCE_BUCKET, storagePath, projectId: project.id });
    return { status: "error", message: "The source file could not be uploaded. No document was created." };
  }

  const removeUploadedSource = async (failedOperation: string) => {
    const { error: cleanupError } = await supabase.storage.from(SOURCE_BUCKET).remove([storagePath]);
    if (cleanupError) {
      logSupabaseError("rollback storage cleanup", cleanupError, {
        bucket: SOURCE_BUCKET,
        storagePath,
        projectId: project.id,
        failedOperation,
      });
    }
  };

  const { error: documentError } = await supabase.from("documents").insert({
    id: documentId,
    project_id: project.id,
    title,
    document_type: validated.extension,
    source_language: project.source_language,
    source_filename: validated.file.name,
    source_reference: `storage://${SOURCE_BUCKET}/${storagePath}`,
  });
  if (documentError) {
    logSupabaseError("document insert", documentError, { documentId, projectId: project.id, storagePath });
    await removeUploadedSource("document insert");
    return { status: "error", message: "Unable to create the document record. Please try again." };
  }

  const { error: versionError } = await supabase.from("document_versions").insert({
    id: versionId,
    document_id: documentId,
    version_number: 1,
    source_storage_bucket: SOURCE_BUCKET,
    source_storage_path: storagePath,
    source_filename: validated.file.name,
    source_mime_type: validated.mimeType,
    source_file_size_bytes: validated.file.size,
    characters_without_spaces: characterCounts.charactersWithoutSpaces,
    characters_with_spaces: characterCounts.charactersWithSpaces,
    character_count_error: pdfAnalysis?.countError ?? null,
    raw_text: pdfAnalysis?.sourceText ?? null,
    extraction_status: pdfAnalysis?.sourceText === null ? "failed" : pdfAnalysis ? "completed" : "pending",
    extraction_diagnostics: pdfAnalysis?.diagnostics ?? null,
  });
  if (versionError) {
    logSupabaseError("document version insert", versionError, { documentId, versionId, projectId: project.id, storagePath });
    const { error: documentCleanupError } = await supabase.from("documents").delete().eq("id", documentId);
    if (documentCleanupError) {
      logSupabaseError("rollback document cleanup", documentCleanupError, { documentId, versionId, projectId: project.id });
    }
    await removeUploadedSource("document version insert");
    return { status: "error", message: "Unable to create the initial document version. Please try again." };
  }

  revalidatePath(`/app/projects/${project.id}`);
  return { status: "success", message: "Source document uploaded.", documentId };
}

export async function transformPdfToWorkingDocument(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };
  const projectId = uuid.safeParse(formData.get("projectId"));
  const documentId = uuid.safeParse(formData.get("documentId"));
  if (!projectId.success || !documentId.success) return { status: "error", message: "Unable to identify this PDF." };
  const regenerate = formData.get("regenerate") === "true";
  const recover = formData.get("recover") === "true";

  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase.from("projects").select("id, source_language").eq("id", projectId.data).maybeSingle();
  if (!project) return { status: "error", message: "Project not found or you do not have permission to transform its documents." };
  const { data: source, error: sourceError } = await supabase.from("documents")
    .select("id, title, source_filename, document_type, parent_document_id, derived_from_document_id, document_versions(id, version_number, source_storage_bucket, source_storage_path, source_filename, characters_without_spaces, characters_with_spaces)")
    .eq("id", documentId.data).eq("project_id", project.id).maybeSingle();
  if (sourceError || !source || source.parent_document_id || source.derived_from_document_id || source.document_type?.toLowerCase() !== "pdf") {
    return { status: "error", message: "Only an owned parent PDF can be transformed." };
  }
  const sourceVersion = [...source.document_versions]
    .sort((a, b) => b.version_number - a.version_number)
    .find((version) => version.source_storage_bucket === SOURCE_BUCKET && version.source_storage_path);
  if (!sourceVersion?.source_storage_path) return { status: "error", message: "The original PDF is not available in private storage." };

  const { data: existing, error: existingError } = await supabase.from("documents")
    .select("id, transformation_status, document_versions(id, version_number, source_storage_bucket, source_storage_path)")
    .eq("derived_from_document_id", source.id).eq("derivation_type", "pdf_to_docx").maybeSingle();
  if (existingError) return { status: "error", message: "Unable to check the existing working document." };
  if (existing?.transformation_status === "processing") return { status: "error", message: "This PDF is already being transformed.", refresh: true };
  if (existing && !regenerate) return { status: "error", message: "A working document already exists. Use Regenerate to create a new version.", refresh: true };
  const staleVersion = existing?.document_versions.slice().sort((a, b) => b.version_number - a.version_number).find((version) => version.source_storage_bucket === SOURCE_BUCKET && version.source_storage_path) ?? null;
  let recoveryVersionId: string | null = null;
  if (recover) {
    if (!existing || !staleVersion?.source_storage_path) return { status: "error", message: "No stale converted DOCX metadata is available for recovery.", refresh: true };
    const { data: existingObject, error: objectCheckError } = await supabase.storage.from(SOURCE_BUCKET).download(staleVersion.source_storage_path);
    if (existingObject || !objectCheckError) return { status: "error", message: "The converted DOCX is present. Refresh the project before recovering it.", refresh: true };
    recoveryVersionId = staleVersion.id;
  }

  const derivedDocumentId = existing?.id ?? crypto.randomUUID();
  const versionId = recoveryVersionId ?? crypto.randomUUID();
  const nextVersion = recoveryVersionId ? staleVersion?.version_number ?? 1 : existing ? Math.max(0, ...existing.document_versions.map((version) => version.version_number)) + 1 : 1;
  const sourceName = sourceVersion.source_filename ?? source.source_filename ?? `${source.title}.pdf`;
  const outputName = `${sourceName.replace(/\.pdf$/i, "") || source.title}.docx`;

  const transformationContext = {
    projectId: project.id,
    sourceDocumentId: source.id,
    sourceVersionId: sourceVersion.id,
    derivedDocumentId,
    outputVersionId: versionId,
  };
  logTransformation("started", "prepare-derived-document", transformationContext);
  if (existing) {
    const { error } = await supabase.from("documents").update({
      transformation_status: "processing", transformation_error: null,
      transformation_started_at: new Date().toISOString(), transformation_completed_at: null,
    }).eq("id", derivedDocumentId).eq("project_id", project.id);
    if (error) {
      logTransformation("failed", "prepare-derived-document", transformationContext, error);
      return { status: "error", message: "Unable to start DOCX regeneration." };
    }
  } else {
    const { error } = await supabase.from("documents").insert({
      id: derivedDocumentId, project_id: project.id, title: `${source.title} — Working document`,
      document_type: "docx", source_language: project.source_language, source_filename: outputName,
      source_reference: `derived-from://${source.id}/${sourceVersion.id}`,
      derived_from_document_id: source.id, derivation_type: "pdf_to_docx", transformation_status: "processing",
      transformation_started_at: new Date().toISOString(),
    });
    if (error) {
      logTransformation("failed", "prepare-derived-document", transformationContext, error);
      return { status: "error", message: "Unable to create the working-document record." };
    }
  }
  logTransformation("completed", "prepare-derived-document", transformationContext);
  revalidatePath(`/app/projects/${project.id}`);

  const storagePath = `${user.id}/${project.id}/${derivedDocumentId}/${versionId}.docx`;
  let temporaryDirectory: string | null = null;
  let generatedDocxUploaded = false;
  let generatedVersionRecorded = false;
  let activeStage: TransformationStage = "download-source-pdf";
  try {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "eu-acquis-transform-"));
    const inputPath = path.join(temporaryDirectory, "source.pdf");
    const outputPath = path.join(temporaryDirectory, "working.docx");
    logTransformation("started", activeStage, { ...transformationContext, bucket: SOURCE_BUCKET, sourceStoragePath: sourceVersion.source_storage_path });
    const { data: sourceFile, error: downloadError } = await supabase.storage.from(SOURCE_BUCKET).download(sourceVersion.source_storage_path);
    if (downloadError) throw downloadError;
    if (!sourceFile) throw new Error("Private Storage returned no PDF data.");
    const pdf = new Uint8Array(await sourceFile.arrayBuffer());
    logTransformation("completed", activeStage, { ...transformationContext, sourceBytes: pdf.byteLength });

    activeStage = "validate-source-pdf";
    logTransformation("started", activeStage, transformationContext);
    if (!isExpectedSignature(pdf, "pdf")) throw new Error("The stored source does not have a valid PDF signature.");
    await writeFile(inputPath, pdf);
    const persistedPdf = await readFile(inputPath);
    if (persistedPdf.length !== pdf.byteLength) throw new Error("The temporary PDF size does not match the downloaded source.");
    const sourceAnalysis = await analyzePdf(pdf, sourceName);
    const sourceAnalysisUpdate = {
      character_count_error: sourceAnalysis.countError,
      raw_text: sourceAnalysis.sourceText,
      extraction_status: sourceAnalysis.sourceText === null ? "failed" : "completed",
      extraction_diagnostics: sourceAnalysis.diagnostics,
      ...(sourceAnalysis.charactersWithoutSpaces !== null && sourceAnalysis.charactersWithSpaces !== null ? {
        characters_without_spaces: sourceAnalysis.charactersWithoutSpaces,
        characters_with_spaces: sourceAnalysis.charactersWithSpaces,
      } : {}),
    };
    const { error: countUpdateError } = await supabase.from("document_versions").update(sourceAnalysisUpdate).eq("id", sourceVersion.id);
    if (countUpdateError) logSupabaseError("PDF analysis persistence", countUpdateError, { ...transformationContext, sourceVersionId: sourceVersion.id });
    logTransformation("completed", activeStage, { ...transformationContext, sourceBytes: persistedPdf.length });

    activeStage = "extract-convert-content";
    logTransformation("started", activeStage, { ...transformationContext, engine: "dedicated-pdf-to-docx-worker" });
    const conversion = await convertPdfToDocx(inputPath, outputPath);
    logTransformation("completed", activeStage, { ...transformationContext, ...conversion });

    activeStage = "generate-validate-docx";
    logTransformation("started", activeStage, transformationContext);
    const docx = await readFile(outputPath);
    if (docx.length < 4 || docx[0] !== 0x50 || docx[1] !== 0x4b) throw new Error("The converter produced an invalid DOCX file.");
    const generatedValidation = await validateDocx(outputPath);
    const generatedCounts = await countDocxCharacters(docx);
    const generatedHash = createHash("sha256").update(docx).digest("hex");
    if (generatedValidation.bytes !== docx.length || generatedValidation.sha256 !== generatedHash) {
      throw new Error("The generated DOCX changed while it was being validated.");
    }
    logTransformation("completed", activeStage, { ...transformationContext, validation: generatedValidation });

    // Strictly non-authoritative observation. The helper catches transport,
    // timeout, validation and worker failures and never throws into this path.
    await runShadowReconstruction(pdf, sourceName, { documentId: derivedDocumentId, activeDocxSha256: generatedHash });

    activeStage = "save-generated-docx";
    logTransformation("started", activeStage, { ...transformationContext, bucket: SOURCE_BUCKET, storagePath, mimeType: DOCX_MIME_TYPE, generatedHash });
    const { error: uploadError } = await supabase.storage.from(SOURCE_BUCKET).upload(storagePath, docx, { contentType: DOCX_MIME_TYPE, upsert: false });
    if (uploadError) throw uploadError;
    generatedDocxUploaded = true;
    const { data: storedFile, error: storedDownloadError } = await supabase.storage.from(SOURCE_BUCKET).download(storagePath);
    if (storedDownloadError) throw storedDownloadError;
    if (!storedFile) throw new Error("Private Storage returned no generated DOCX during verification.");
    if (storedFile.type && storedFile.type !== DOCX_MIME_TYPE) throw new Error(`Stored DOCX has unexpected MIME type ${storedFile.type}.`);
    const storedDocx = Buffer.from(await storedFile.arrayBuffer());
    const storedHash = createHash("sha256").update(storedDocx).digest("hex");
    if (storedDocx.length !== docx.length || storedHash !== generatedHash) {
      throw new Error(`Stored DOCX byte verification failed: generated ${docx.length}/${generatedHash}, stored ${storedDocx.length}/${storedHash}.`);
    }
    const storedVerificationPath = path.join(temporaryDirectory, "stored-working.docx");
    await writeFile(storedVerificationPath, storedDocx);
    const storedValidation = await validateDocx(storedVerificationPath);
    if (storedValidation.sha256 !== generatedHash) throw new Error("Stored DOCX validation hash does not match the generated package.");
    logTransformation("completed", activeStage, { ...transformationContext, mimeType: storedFile.type || DOCX_MIME_TYPE, validation: storedValidation });

    activeStage = "create-document-version";
    logTransformation("started", activeStage, { ...transformationContext, versionNumber: nextVersion });
    const versionValues = {
      id: versionId, document_id: derivedDocumentId, version_number: nextVersion, extraction_status: "pending",
      source_storage_bucket: SOURCE_BUCKET, source_storage_path: storagePath, source_filename: outputName,
      source_mime_type: DOCX_MIME_TYPE, source_file_size_bytes: docx.length, derived_from_version_id: sourceVersion.id,
      characters_without_spaces: generatedCounts.charactersWithoutSpaces,
      characters_with_spaces: generatedCounts.charactersWithSpaces,
    };
    const { error: versionError } = recoveryVersionId
      ? await supabase.from("document_versions").update(versionValues).eq("id", recoveryVersionId)
      : await supabase.from("document_versions").insert(versionValues);
    if (versionError) {
      await supabase.storage.from(SOURCE_BUCKET).remove([storagePath]);
      generatedDocxUploaded = false;
      throw versionError;
    }
    generatedVersionRecorded = true;
    logTransformation("completed", activeStage, { ...transformationContext, versionNumber: nextVersion });

    activeStage = "mark-ready";
    logTransformation("started", activeStage, transformationContext);
    const { error: readyError } = await supabase.from("documents").update({
      transformation_status: "ready", transformation_error: null, transformation_completed_at: new Date().toISOString(),
    }).eq("id", derivedDocumentId).eq("project_id", project.id);
    if (readyError) throw readyError;
    logTransformation("completed", activeStage, transformationContext);
  } catch (error) {
    const needsReview = error instanceof PdfToDocxConversionError && error.workerCode === "footnotes_need_review";
    const failureMessage = transformationFailureMessage(activeStage, error);
    logTransformation("failed", activeStage, transformationContext, error);
    if (generatedDocxUploaded && !generatedVersionRecorded) {
      const { error: corruptObjectCleanupError } = await supabase.storage.from(SOURCE_BUCKET).remove([storagePath]);
      if (corruptObjectCleanupError) logTransformation("failed", "save-generated-docx", { ...transformationContext, cleanup: true }, corruptObjectCleanupError);
    }
    const { error: failedStatusError } = await supabase.from("documents").update({ transformation_status: needsReview ? "needs_review" : "failed", transformation_error: failureMessage })
      .eq("id", derivedDocumentId).eq("project_id", project.id);
    if (failedStatusError) logTransformation("failed", "mark-ready", { ...transformationContext, intendedStatus: "failed" }, failedStatusError);
    revalidatePath(`/app/projects/${project.id}`);
    return { status: "error", message: failureMessage, refresh: true };
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }

  revalidatePath(`/app/projects/${project.id}`);
  return { status: "success", message: regenerate ? "Working document regenerated." : "Working document created.", refresh: true };
}

export async function deleteSourceDocument(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };

  const projectId = uuid.safeParse(formData.get("projectId"));
  const documentId = uuid.safeParse(formData.get("documentId"));
  if (!projectId.success || !documentId.success) return { status: "error", message: "Unable to identify this document." };

  const supabase = await createSupabaseServerClient();
  const { data: project, error: projectError } = await supabase.from("projects").select("id").eq("id", projectId.data).maybeSingle();
  if (projectError) {
    logSupabaseError("delete ownership check", projectError, { projectId: projectId.data, documentId: documentId.data });
    return { status: "error", message: "Unable to verify permission to delete this document." };
  }
  if (!project) return { status: "error", message: "Project not found or you do not have permission to delete this document." };

  const { data: document, error: documentError } = await supabase.from("documents").select("id, parent_document_id").eq("id", documentId.data).eq("project_id", project.id).maybeSingle();
  if (documentError) {
    logSupabaseError("delete document lookup", documentError, { projectId: project.id, documentId: documentId.data });
    return { status: "error", message: "Unable to load this document for deletion." };
  }
  if (!document) return { status: "error", message: "Document not found or you do not have permission to delete it." };

  const { data: relatedDocuments, error: relatedError } = document.parent_document_id
    ? await supabase.from("documents").select("id").eq("id", document.id)
    : await supabase.from("documents").select("id").or(`id.eq.${document.id},parent_document_id.eq.${document.id},derived_from_document_id.eq.${document.id}`).eq("project_id", project.id);
  if (relatedError) {
    logSupabaseError("related-document lookup", relatedError, { projectId: project.id, documentId: document.id });
    return { status: "error", message: "Unable to load related documents for deletion." };
  }
  const relatedIds = (relatedDocuments ?? []).map((item) => item.id);
  const { data: versions, error: versionsError } = await supabase.from("document_versions")
    .select("id, source_storage_bucket, source_storage_path").in("document_id", relatedIds);
  if (versionsError) {
    logSupabaseError("version lookup for deletion", versionsError, { projectId: project.id, documentId: document.id, relatedIds });
    return { status: "error", message: "Unable to load the document versions for deletion." };
  }

  const paths = versions.filter((version) => version.source_storage_bucket === SOURCE_BUCKET && version.source_storage_path).map((version) => version.source_storage_path as string);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(SOURCE_BUCKET).remove(paths);
    if (storageError) {
      logSupabaseError("storage deletion", storageError, { bucket: SOURCE_BUCKET, projectId: project.id, documentId: document.id, paths });
      return { status: "error", message: "Unable to remove the document's private source files. No records were deleted." };
    }
  }

  const { data: deleted, error: deleteError } = await supabase.rpc("delete_owned_document_tree", {
    requested_project_id: project.id,
    requested_document_id: document.id,
  });
  if (deleteError) {
    logSupabaseError("database tree deletion", deleteError, { projectId: project.id, documentId: document.id, relatedIds, storagePathsRemoved: paths.length });
    return { status: "error", message: "The private files were removed, but the document records could not be deleted. Please try again." };
  }
  if (!deleted) return { status: "error", message: "Document not found or you do not have permission to delete it." };

  revalidatePath(`/app/projects/${project.id}`);
  return { status: "success", message: "Document deleted." };
}

export async function deleteWorkingDocument(_state: DocumentActionState, formData: FormData): Promise<DocumentActionState> {
  const user = await getAuthenticatedUser();
  if (!user) return { status: "error", message: "Your session has expired. Sign in and try again." };

  const projectId = uuid.safeParse(formData.get("projectId"));
  const documentId = uuid.safeParse(formData.get("documentId"));
  if (!projectId.success || !documentId.success) return { status: "error", message: "Unable to identify this working document." };

  const supabase = await createSupabaseServerClient();
  const { data: project, error: projectError } = await supabase.from("projects").select("id").eq("id", projectId.data).maybeSingle();
  if (projectError) {
    logSupabaseError("working-document delete ownership check", projectError, { projectId: projectId.data, documentId: documentId.data });
    return { status: "error", message: "Unable to verify permission to delete this working document." };
  }
  if (!project) return { status: "error", message: "Project not found or you do not have permission to delete this working document." };

  const { data: document, error: documentError } = await supabase.from("documents")
    .select("id, derived_from_document_id, derivation_type, transformation_status")
    .eq("id", documentId.data).eq("project_id", project.id).maybeSingle();
  if (documentError) {
    logSupabaseError("working-document delete lookup", documentError, { projectId: project.id, documentId: documentId.data });
    return { status: "error", message: "Unable to load this working document for deletion." };
  }
  if (!document || !document.derived_from_document_id || document.derivation_type !== "pdf_to_docx"
    || !["ready", "failed", "needs_review"].includes(document.transformation_status ?? "")) {
    return { status: "error", message: "Only an owned Ready or Failed working document can be deleted." };
  }

  const { data: versions, error: versionsError } = await supabase.from("document_versions")
    .select("source_storage_bucket, source_storage_path, source_mime_type")
    .eq("document_id", document.id);
  if (versionsError) {
    logSupabaseError("working-document version lookup for deletion", versionsError, { projectId: project.id, documentId: document.id });
    return { status: "error", message: "Unable to load the working-document versions for deletion." };
  }

  const storedVersions = versions.filter((version) => version.source_storage_bucket === SOURCE_BUCKET && version.source_storage_path);
  const backups: Array<{ path: string; file: Blob; contentType?: string }> = [];
  for (const version of storedVersions) {
    const storagePath = version.source_storage_path as string;
    const { data: file, error: downloadError } = await supabase.storage.from(SOURCE_BUCKET).download(storagePath);
    if (downloadError || !file) {
      if (downloadError) logSupabaseError("working-document backup download", downloadError, { projectId: project.id, documentId: document.id, storagePath });
      return { status: "error", message: "Unable to verify the private DOCX before deletion. Nothing was deleted." };
    }
    backups.push({ path: storagePath, file, contentType: version.source_mime_type ?? undefined });
  }

  const paths = backups.map((backup) => backup.path);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(SOURCE_BUCKET).remove(paths);
    if (storageError) {
      logSupabaseError("working-document storage deletion", storageError, { bucket: SOURCE_BUCKET, projectId: project.id, documentId: document.id, paths });
      return { status: "error", message: "Unable to remove the private DOCX. No records were deleted." };
    }
  }

  const { data: deleted, error: deleteError } = await supabase.rpc("delete_owned_working_document", {
    requested_project_id: project.id,
    requested_document_id: document.id,
  });
  if (deleteError || !deleted) {
    for (const backup of backups) {
      const { error: restoreError } = await supabase.storage.from(SOURCE_BUCKET).upload(backup.path, backup.file, {
        contentType: backup.contentType,
        upsert: false,
      });
      if (restoreError) logSupabaseError("working-document storage restore", restoreError, {
        bucket: SOURCE_BUCKET, projectId: project.id, documentId: document.id, storagePath: backup.path,
      });
    }
    if (deleteError) logSupabaseError("working-document database deletion", deleteError, {
      projectId: project.id, documentId: document.id, storagePathsRestored: paths.length,
    });
    return { status: "error", message: "The working document could not be deleted. Its private files were restored." };
  }

  revalidatePath(`/app/projects/${project.id}`);
  return { status: "success", message: "Working document deleted.", refresh: true };
}
