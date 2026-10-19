import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

const SOURCE_BUCKET = "source-documents";
const uuid = z.uuid();

type ZipEntry = { name: string; data: Uint8Array };

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function write32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }
function write16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }

// Store entries without compression: PDFs/DOCX files are already compressed,
// and this keeps the server-side archive implementation dependency-free.
function createZip(entries: ZipEntry[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    write32(localView, 0, 0x04034b50); write16(localView, 4, 20); write16(localView, 6, 0x800);
    write32(localView, 14, crc); write32(localView, 18, entry.data.length); write32(localView, 22, entry.data.length);
    write16(localView, 26, name.length); write16(localView, 28, 0); local.set(name, 30);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    write32(centralView, 0, 0x02014b50); write16(centralView, 4, 20); write16(centralView, 6, 20); write16(centralView, 8, 0x800);
    write32(centralView, 16, crc); write32(centralView, 20, entry.data.length); write32(centralView, 24, entry.data.length);
    write16(centralView, 28, name.length); write16(centralView, 30, 0); write16(centralView, 32, 0); write16(centralView, 34, 0); write16(centralView, 36, 0);
    write32(centralView, 42, offset); central.set(name, 46); centralParts.push(central);
    offset += local.length + entry.data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  write32(endView, 0, 0x06054b50); write16(endView, 8, entries.length); write16(endView, 10, entries.length);
  write32(endView, 12, centralSize); write32(endView, 16, centralOffset);

  const result = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (let index = 0; index < entries.length; index += 1) { result.set(localParts[index], cursor); cursor += localParts[index].length; result.set(entries[index].data, cursor); cursor += entries[index].data.length; }
  for (const part of centralParts) { result.set(part, cursor); cursor += part.length; }
  result.set(end, cursor);
  return result;
}

function safeFilename(value: string | null, fallback: string) {
  const name = (value ?? fallback).replaceAll("\\", "/").split("/").pop()?.trim();
  return name && name !== "." && name !== ".." ? name : null;
}

export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Your session has expired. Sign in and try again." }, { status: 401 });
  const parsedProjectId = uuid.safeParse((await context.params).projectId);
  if (!parsedProjectId.success) return NextResponse.json({ error: "Unable to identify this project." }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const { data: project, error: projectError } = await supabase.from("projects").select("id").eq("id", parsedProjectId.data).maybeSingle();
  if (projectError) return NextResponse.json({ error: "Unable to verify project ownership." }, { status: 500 });
  if (!project) return NextResponse.json({ error: "Project not found or access was denied." }, { status: 404 });

  const { data: documents, error: documentsError } = await supabase.from("documents")
    .select("id, title, source_filename, celex_number, parent_document_id, derived_from_document_id, document_versions(source_storage_bucket, source_storage_path, source_filename, version_number)")
    .eq("project_id", project.id).order("created_at", { ascending: true });
  if (documentsError) return NextResponse.json({ error: "Unable to load the project documents." }, { status: 500 });
  if (!documents?.length) return NextResponse.json({ error: "This project has no stored documents." }, { status: 404 });

  const byId = new Map(documents.map((document) => [document.id, document]));
  const entries: ZipEntry[] = [];
  for (const document of documents) {
    const versions = [...document.document_versions].sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0));
    const version = versions.find((item) => item.source_storage_bucket === SOURCE_BUCKET && item.source_storage_path);
    const sourceId = document.parent_document_id ?? document.derived_from_document_id;
    const parent = sourceId ? byId.get(sourceId) : document;
    const folder = safeFilename(parent?.celex_number ?? null, "documents") ?? "documents";
    const filename = safeFilename(version?.source_filename ?? document.source_filename, `${document.celex_number ?? document.id}.bin`);
    if (!version?.source_storage_path || !filename) return NextResponse.json({ error: `Stored file is missing for ${document.title}. ZIP creation aborted.` }, { status: 409 });
    const { data, error } = await supabase.storage.from(SOURCE_BUCKET).download(version.source_storage_path);
    if (error || !data) return NextResponse.json({ error: `Stored file could not be read for ${filename}. ZIP creation aborted.` }, { status: 409 });
    entries.push({ name: `${folder}/${filename}`, data: new Uint8Array(await data.arrayBuffer()) });
  }

  const zip = createZip(entries);
  return new NextResponse(zip, { headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${project.id}-documents.zip"`,
    "Cache-Control": "private, no-store",
  } });
}
