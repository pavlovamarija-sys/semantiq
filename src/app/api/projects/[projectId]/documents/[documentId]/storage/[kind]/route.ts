import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

const uuid = z.uuid();
const kindSchema = z.enum(["source", "mk1", "report"]);
const SIGNED_URL_SECONDS = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string; documentId: string; kind: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const value = await params;
  const projectId = uuid.safeParse(value.projectId);
  const documentId = uuid.safeParse(value.documentId);
  const kind = kindSchema.safeParse(value.kind);
  if (!projectId.success || !documentId.success || !kind.success) return NextResponse.json({ error: "Invalid storage reference." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: document } = await supabase.from("documents").select("id,project_id").eq("id", documentId.data).eq("project_id", projectId.data).maybeSingle();
  if (!document) return NextResponse.json({ error: "Document not found or access denied." }, { status: 404 });
  const { data: versions } = await supabase.from("document_versions").select("id,version_number,source_storage_bucket,source_storage_path").eq("document_id", document.id).order("version_number", { ascending: false });
  const version = versions?.find((item) => item.source_storage_bucket && item.source_storage_path);
  if (!version?.source_storage_bucket || !version.source_storage_path) return NextResponse.json({ error: "Stored document is unavailable." }, { status: 404 });

  let bucket = version.source_storage_bucket;
  let objectPath = version.source_storage_path;
  if (kind.data !== "source") {
    const artifactType = kind.data === "mk1" ? "mk1_docx" : "translation_report_docx";
    const { data: artifact } = await supabase.from("document_translation_artifacts").select("storage_bucket,storage_path").eq("document_version_id", version.id).eq("artifact_type", artifactType).eq("status", "completed").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!artifact?.storage_bucket || !artifact.storage_path) return NextResponse.json({ error: "Artifact is unavailable." }, { status: 404 });
    bucket = artifact.storage_bucket;
    objectPath = artifact.storage_path;
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(objectPath, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Stored file is unavailable." }, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 307 });
}
