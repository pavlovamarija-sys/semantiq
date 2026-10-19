import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { LegalQaFinding, LegalQaStatus } from "@/application/translation/deterministic-legal-qa";
import { signOut } from "@/app/auth/actions";
import { Brand, Icon } from "@/app/ui/brand";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
import { WorkspaceEditor } from "./workspace-editor";

export const dynamic = "force-dynamic";
type EvidenceRow = { evidence_type: string; source_reference: string | null; source_text: string | null; target_text: string | null; metadata: Record<string, unknown> };
function qaFromEvidence(evidence: EvidenceRow[]): { status: LegalQaStatus; findings: LegalQaFinding[] } {
  const metadata = evidence.find((row) => row.evidence_type === "deterministic_qa")?.metadata;
  if (!metadata || !["PASS", "WARNING", "ERROR"].includes(String(metadata.status)) || !Array.isArray(metadata.findings)) return { status: "PASS", findings: [] };
  return { status: metadata.status as LegalQaStatus, findings: metadata.findings as LegalQaFinding[] };
}

export default async function SegmentWorkspacePage({ params }: { params: Promise<{ projectId: string; segmentId: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const { projectId, segmentId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: project } = await supabase.from("projects").select("id,name,source_language,target_language").eq("id", projectId).maybeSingle();
  const { data: segment } = await supabase.from("document_segments").select("id,document_version_id,segment_index,segment_type,source_text,article_number,paragraph_number,point_number").eq("id", segmentId).maybeSingle();
  if (!project || !segment) notFound();
  const { data: version } = await supabase.from("document_versions").select("id,document_id").eq("id", segment.document_version_id).maybeSingle();
  if (!version) notFound();
  const { data: document } = await supabase.from("documents").select("id,project_id,title,celex_number").eq("id", version.document_id).eq("project_id", project.id).maybeSingle();
  if (!document) notFound();
  const { data: neighbors } = await supabase.from("document_segments").select("id,segment_index,source_text").eq("document_version_id", segment.document_version_id).in("segment_index", [segment.segment_index - 1, segment.segment_index + 1]);
  const previous = neighbors?.find((row) => row.segment_index === segment.segment_index - 1) ?? null;
  const next = neighbors?.find((row) => row.segment_index === segment.segment_index + 1) ?? null;
  const { data: translation } = await supabase.from("translations").select("id,status").eq("segment_id", segment.id).eq("target_language", project.target_language).maybeSingle();
  const { data: versions } = translation ? await supabase.from("translation_versions").select("id,target_text,origin,model_name,prompt_version,review_status,approved_at,created_at").eq("translation_id", translation.id).order("created_at", { ascending: false }) : { data: [] };
  const latest = versions?.[0] ?? null;
  const latestAi = versions?.find((item) => item.origin === "ai") ?? null;
  const evidenceVersionIds = [...new Set([latest?.id, latestAi?.id].filter((id): id is string => Boolean(id)))];
  const { data: evidenceRows } = evidenceVersionIds.length ? await supabase.from("translation_evidence").select("translation_version_id,evidence_type,source_reference,source_text,target_text,metadata").in("translation_version_id", evidenceVersionIds) : { data: [] };
  const currentEvidence = (evidenceRows ?? []).filter((row) => row.translation_version_id === latest?.id) as EvidenceRow[];
  const aiEvidence = (evidenceRows ?? []).filter((row) => row.translation_version_id === latestAi?.id) as EvidenceRow[];
  const qa = qaFromEvidence(currentEvidence);
  const tmEvidence = aiEvidence.filter((row) => row.evidence_type === "exact_approved_tm" || row.evidence_type === "fuzzy_approved_tm");
  const displayName = user.user_metadata?.full_name && typeof user.user_metadata.full_name === "string" ? user.user_metadata.full_name : user.email?.split("@")[0] ?? "Account";
  const initials = displayName.split(/[\s._-]+/).map((part: string) => part[0]).slice(0, 2).join("").toUpperCase();
  const structure = [segment.article_number && `Article ${segment.article_number}`, segment.paragraph_number && `paragraph ${segment.paragraph_number}`, segment.point_number && `point ${segment.point_number}`].filter(Boolean).join(" · ");

  return <main className="site-shell dashboard-shell translator-shell">
    <aside className="dashboard-sidebar"><div className="sidebar-brand"><Brand /></div><nav aria-label="Workspace navigation" className="sidebar-nav"><Link className="sidebar-link active" href="/app"><Icon name="folder" />Projects</Link><span className="sidebar-link unavailable" aria-disabled="true"><Icon name="shield" />Terminology <small>Later</small></span><span className="sidebar-link unavailable" aria-disabled="true"><Icon name="file" />References <small>Later</small></span></nav><div className="sidebar-bottom"><form action={signOut}><button className="sidebar-link" type="submit"><Icon name="logout" />Sign out</button></form></div></aside>
    <div className="dashboard-body"><header className="dashboard-top"><div className="mobile-brand"><Brand compact /></div><div className="account-pill" title={user.email}><span className="account-avatar">{initials}</span><span className="account-name">{displayName}</span></div></header>
      <section className="translator-workspace">
        <header className="translator-header"><div><Link href={`/app/projects/${project.id}`} className="project-back-link">← {project.name}</Link><h1>{document.title}</h1><p>{document.celex_number ?? "Project document"} · Segment {segment.segment_index + 1}{structure ? ` · ${structure}` : ""}</p></div><span className="translator-draft-label">No approval workflow yet</span></header>
        <div className="translator-context-strip"><div><span>Previous EN</span><p>{previous?.source_text ?? "No previous segment."}</p></div><div><span>Next EN</span><p>{next?.source_text ?? "No next segment."}</p></div></div>
        <div className="translator-grid">
          <div className="translator-source-column">
            <section className="translator-panel translator-source-panel"><div className="translator-panel-heading"><div><span className="translator-language">EN</span><h2>Source segment</h2></div><span className="translator-segment-type">{segment.segment_type}</span></div><p className="translator-source-text">{segment.source_text}</p></section>
            <section className="translator-panel translator-evidence-panel"><div className="translator-panel-heading"><div><span className="translator-kicker">Generation evidence</span><h2>Approved TM used</h2></div></div>{tmEvidence.length === 0 ? <p className="translator-empty-note">No exact or strong fuzzy TM evidence was supplied.</p> : <ul>{tmEvidence.map((row, index) => <li key={`${row.evidence_type}-${row.source_reference}-${index}`}><div><span className={`tm-kind ${row.evidence_type.startsWith("exact") ? "exact" : "fuzzy"}`}>{row.evidence_type.startsWith("exact") ? "Exact" : "Fuzzy"}</span><strong>{row.source_reference ?? "Approved TM"}</strong></div>{row.source_text && <p>{row.source_text}</p>}<p className="tm-target">{row.target_text}</p></li>)}</ul>}</section>
            <section className="translator-panel translator-metadata"><span>AI metadata</span><div><strong>{latestAi?.model_name ?? "Not generated"}</strong><small>{latestAi ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(latestAi.created_at)) : "Generate MK1 to create an AI draft."}</small></div></section>
          </div>
          <WorkspaceEditor key={latest?.id ?? "empty"} projectId={project.id} segmentId={segment.id} initialTarget={latest?.target_text ?? ""} versionKey={latest?.id ?? "empty"} qaFindings={qa.findings} qaStatus={qa.status} versionOrigin={latest?.origin ?? null} versionReviewStatus={latest?.review_status ?? null} approvedAt={latest?.approved_at ?? null} />
        </div>
      </section>
    </div>
  </main>;
}
