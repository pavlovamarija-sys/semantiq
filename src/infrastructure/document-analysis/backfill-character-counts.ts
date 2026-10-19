import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { countDocxCharacters, type CharacterCounts } from "./character-counts";
import { analyzePdf } from "@/infrastructure/document-conversion/pdf-to-docx";

const SOURCE_BUCKET = "source-documents";
const MAX_REASON_LENGTH = 500;

type VersionForBackfill = {
  id: string;
  source_storage_bucket: string | null;
  source_storage_path: string | null;
  source_mime_type: string | null;
  characters_without_spaces: number | null;
  characters_with_spaces: number | null;
  documents: { document_type: string | null; source_filename: string | null };
};

export type CharacterCountBackfillResult = {
  versionId: string;
  counts?: CharacterCounts;
  error?: string;
};

function fileKind(version: VersionForBackfill): "pdf" | "docx" | null {
  const mime = version.source_mime_type?.toLowerCase();
  const filename = version.documents.source_filename?.toLowerCase();
  const storagePath = version.source_storage_path?.toLowerCase();
  const documentType = version.documents.document_type?.toLowerCase();
  if (mime === "application/pdf" || documentType === "pdf" || filename?.endsWith(".pdf") || storagePath?.endsWith(".pdf")) return "pdf";
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || documentType === "docx"
    || filename?.endsWith(".docx") || storagePath?.endsWith(".docx")) return "docx";
  return null;
}

function reason(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, MAX_REASON_LENGTH);
}

/** Backfills only missing values, always from the exact version's immutable stored file. */
export async function backfillProjectCharacterCounts(supabase: SupabaseClient, projectId: string): Promise<CharacterCountBackfillResult[]> {
  const { data, error } = await supabase.from("document_versions")
    .select("id, source_storage_bucket, source_storage_path, source_mime_type, characters_without_spaces, characters_with_spaces, documents!inner(document_type, source_filename, project_id)")
    .eq("documents.project_id", projectId)
    .or("characters_without_spaces.is.null,characters_with_spaces.is.null");
  if (error) throw new Error(`Unable to load document versions for character-count backfill: ${error.message}`);

  const versions = (data ?? []) as unknown as Array<VersionForBackfill>;
  const results: CharacterCountBackfillResult[] = [];
  for (const version of versions) {
    try {
      if (version.source_storage_bucket !== SOURCE_BUCKET || !version.source_storage_path) {
        throw new Error("The stored source file is missing, so character counts are unavailable.");
      }
      const kind = fileKind(version);
      if (!kind) throw new Error("The stored file type is not supported for character counting.");
      const { data: storedFile, error: downloadError } = await supabase.storage.from(SOURCE_BUCKET).download(version.source_storage_path);
      if (downloadError) throw new Error(`The stored file could not be downloaded: ${downloadError.message}`);
      if (!storedFile) throw new Error("Private Storage returned no file data.");
      const bytes = new Uint8Array(await storedFile.arrayBuffer());
      const analysis = kind === "pdf" ? await analyzePdf(bytes, version.documents.source_filename ?? "source.pdf") : null;
      const counts = kind === "pdf"
        ? analysis?.charactersWithoutSpaces === null || analysis?.charactersWithSpaces === null ? null : {
          charactersWithoutSpaces: analysis?.charactersWithoutSpaces as number,
          charactersWithSpaces: analysis?.charactersWithSpaces as number,
        }
        : await countDocxCharacters(bytes);
      if (!counts) {
        const countError = analysis?.countError ?? "The PDF worker did not return character counts.";
        const { error: extractionUpdateError } = await supabase.from("document_versions").update({
          raw_text: analysis?.sourceText ?? null,
          extraction_status: "failed",
          extraction_diagnostics: analysis?.diagnostics ?? null,
          character_count_error: countError,
        }).eq("id", version.id);
        if (extractionUpdateError) throw new Error(`PDF extraction diagnostics could not be saved: ${extractionUpdateError.message}`);
        results.push({ versionId: version.id, error: countError });
        continue;
      }
      const { error: updateError } = await supabase.from("document_versions").update({
        characters_without_spaces: counts.charactersWithoutSpaces,
        characters_with_spaces: counts.charactersWithSpaces,
        character_count_error: null,
        ...(analysis ? { raw_text: analysis.sourceText, extraction_status: "completed", extraction_diagnostics: analysis.diagnostics } : {}),
      }).eq("id", version.id);
      if (updateError) throw new Error(`Character counts could not be saved: ${updateError.message}`);
      results.push({ versionId: version.id, counts });
    } catch (error) {
      const message = reason(error);
      const { error: updateError } = await supabase.from("document_versions")
        .update({ character_count_error: message }).eq("id", version.id);
      results.push({ versionId: version.id, error: updateError ? `${message} (The reason could not be saved: ${updateError.message})` : message });
    }
  }
  return results;
}
