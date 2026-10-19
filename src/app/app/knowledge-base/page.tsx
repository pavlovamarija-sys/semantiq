import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand, Icon } from "@/app/ui/brand";
import { signOut } from "@/app/auth/actions";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;
const tabs = ["tm", "terminology", "corpus"] as const;
type Tab = (typeof tabs)[number];

function pageNumber(value: string | undefined) { const page = Number(value); return Number.isInteger(page) && page > 0 ? page : 1; }

export default async function KnowledgeBasePage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const tab: Tab = tabs.includes(params.tab as Tab) ? params.tab as Tab : "tm";
  const query = (params.q ?? "").trim().slice(0, 200);
  const page = pageNumber(params.page);
  const supabase = await createSupabaseServerClient();
  const { data: knowledgeBase } = await supabase.from("translation_knowledge_bases").select("id, name").eq("owner_id", user.id).maybeSingle();
  if (!knowledgeBase) throw new Error("Unable to load the owner Knowledge Base.");

  let rows: Array<Record<string, unknown>> = [];
  let total = 0;
  if (tab === "tm") {
    let request = supabase.from("approved_translation_memory_units").select("id,source_text,target_text,celex,source_document,trust_status,alignment_confidence,original_tmx_tu_id", { count: "exact" }).eq("knowledge_base_id", knowledgeBase.id).eq("source_kind", "legacy_import").eq("trust_status", "approved");
    if (query) request = request.or(`source_text.ilike.%${query}%,target_text.ilike.%${query}%,celex.ilike.%${query}%`);
    const result = await request.order("celex", { ascending: true }).order("id", { ascending: true }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (result.error) throw new Error("Unable to load Translation Memory.");
    rows = result.data ?? []; total = result.count ?? 0;
  } else if (tab === "terminology") {
    let request = supabase.from("terminology_entries").select("id,source_term,target_term,status,source_type,provenance", { count: "exact" }).eq("knowledge_base_id", knowledgeBase.id).eq("source_type", "corpus_supported").eq("audit_status", "valid").eq("alignment_support_audit_status", "trusted");
    if (query) request = request.or(`source_term.ilike.%${query}%,target_term.ilike.%${query}%`);
    const result = await request.order("source_term", { ascending: true }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (result.error) throw new Error("Unable to load terminology.");
    rows = result.data ?? []; total = result.count ?? 0;
  }
  const displayName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : user.email?.split("@")[0] ?? "Account";
  const initials = displayName.split(/[\s._-]+/).map((part: string) => part[0]).slice(0, 2).join("").toUpperCase();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (nextPage: number) => `/app/knowledge-base?tab=${tab}${query ? `&q=${encodeURIComponent(query)}` : ""}${nextPage > 1 ? `&page=${nextPage}` : ""}`;
  return <main className="site-shell dashboard-shell">
    <aside className="dashboard-sidebar"><div className="sidebar-brand"><Brand /></div><nav aria-label="Навигација на работниот простор" className="sidebar-nav"><Link className="sidebar-link" href="/app"><Icon name="home" />Контролна табла</Link><Link className="sidebar-link" href="/app"><Icon name="folder" />Проекти</Link><Link className="sidebar-link active" href="/app/knowledge-base" aria-current="page"><Icon name="book" />База на знаење</Link></nav><div className="sidebar-bottom"><span className="sidebar-link unavailable" aria-disabled="true"><Icon name="settings" />Поставки <small>Подоцна</small></span><form action={signOut}><button className="sidebar-link" type="submit"><Icon name="logout" />Одјави се</button></form></div></aside>
    <div className="dashboard-body"><header className="dashboard-top"><div className="mobile-brand"><Brand compact /></div><div className="account-pill" title={user.email}><span className="account-avatar">{initials}</span><span className="account-name">{displayName}</span></div></header>
      <section className="knowledge-content"><div className="knowledge-heading"><div><p className="eyebrow">Сопственичка база на знаење</p><h1>База на знаење</h1><p>Доверливи јазични докази за вашата работа на правни преводи на ЕУ.</p></div><span className="knowledge-scope">EN <b>→</b> MK</span></div>
        <nav className="knowledge-tabs" aria-label="Оддели на базата на знаење"><Link className={tab === "tm" ? "selected" : ""} href="/app/knowledge-base?tab=tm">Преведувачка меморија <span>4,029</span></Link><Link className={tab === "terminology" ? "selected" : ""} href="/app/knowledge-base?tab=terminology">Терминологија <span>143</span></Link><Link className={tab === "corpus" ? "selected" : ""} href="/app/knowledge-base?tab=corpus">Референтен корпус</Link></nav>
        {tab === "corpus" ? <CorpusPanel /> : <><form className="knowledge-search" method="get"><input type="hidden" name="tab" value={tab} /><Icon name="search" className="h-4 w-4" /><input name="q" defaultValue={query} placeholder={tab === "tm" ? "Search English, Macedonian or CELEX..." : "Search terms..."} aria-label="Search Knowledge Base" /><button className="button button-outline" type="submit">Search</button></form><div className="knowledge-table-wrap"><table className="knowledge-table"><thead><tr>{tab === "tm" ? <><th>English</th><th>Macedonian</th><th>CELEX</th><th>Source</th><th>Status</th><th>Confidence</th></> : <><th>English term</th><th>Macedonian equivalent</th><th>Status</th><th>Evidence</th></>}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={tab === "tm" ? 6 : 4} className="knowledge-empty">{query ? "No matching records." : "No records available."}</td></tr> : rows.map((row) => tab === "tm" ? <tr key={String(row.id)}><td className="cell-primary">{String(row.source_text)}</td><td>{String(row.target_text)}</td><td><span className="celex-chip">{String(row.celex ?? "—")}</span></td><td className="cell-muted">{String(row.source_document ?? "—")}</td><td><span className="status-badge status-completed"><span className="status-dot" />Approved</span></td><td>{Number(row.alignment_confidence).toFixed(2)}</td></tr> : <tr key={String(row.id)}><td className="cell-primary">{String(row.source_term)}</td><td>{String(row.target_term)}</td><td><span className="status-badge status-draft">Corpus-supported</span></td><td className="evidence-cell">{String((row.provenance as { document_count?: number })?.document_count ?? "—")} documents</td></tr>)}</tbody></table></div><div className="knowledge-pagination"><span>Showing {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}</span><div><Link className={`button button-outline ${page <= 1 ? "disabled" : ""}`} aria-disabled={page <= 1} href={page <= 1 ? href(1) : href(page - 1)}>Previous</Link><Link className={`button button-outline ${page >= totalPages ? "disabled" : ""}`} aria-disabled={page >= totalPages} href={page >= totalPages ? href(totalPages) : href(page + 1)}>Next</Link></div></div></>}
      </section></div>
  </main>;
}

function CorpusPanel() { return <div className="corpus-panel"><div className="corpus-status"><span className="corpus-status-dot" /><div><strong>Prepared, not yet indexed</strong><p>The trusted contextual corpus is ready for a later retrieval phase. It is separate from approved Translation Memory and is not currently imported into the Knowledge Base.</p></div></div><div className="corpus-metrics"><div><strong>102</strong><span>documents</span></div><div><strong>5,116,942</strong><span>MK2 characters</span></div><div><strong>17,792</strong><span>context chunks</span></div></div><div className="corpus-note"><Icon name="shield" /><span>Source files remain preserved with CELEX and paragraph-level provenance. Indexing and embeddings are not enabled yet.</span></div></div>; }
