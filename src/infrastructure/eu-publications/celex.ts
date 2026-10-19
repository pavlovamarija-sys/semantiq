import "server-only";
import { z } from "zod";

const CELLAR_CELEX_BASE = "https://publications.europa.eu/resource/celex";
const ELI_BASE = "https://data.europa.eu/eli";
export const MAX_CELEX_PDF_BYTES = 50 * 1024 * 1024;

// CELEX identifiers start with a sector, a four-digit year and a document-type
// code. The final component varies by collection, so it is deliberately
// broader than the common four-digit legal-act number.
const CELEX_PATTERN = /^[0-9][0-9]{4}[A-Z]{1,2}[0-9A-Z]{1,8}(?:\([0-9]{2}\))?(?:-[0-9]{8})?$/;

export function normalizeCelex(value: string) {
  return value.trim().toUpperCase().replace(/^CELEX:/, "");
}

export function isValidCelex(value: string) {
  const normalized = normalizeCelex(value);
  return normalized.length <= 30 && CELEX_PATTERN.test(normalized);
}

export function parseCelexInput(value: string) {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const token of value.split(/[\s,;]+/).filter(Boolean)) {
    const celex = normalizeCelex(token);
    if (seen.has(celex)) continue;
    seen.add(celex);
    (isValidCelex(celex) ? valid : invalid).push(celex);
  }
  return { valid, invalid };
}

export type CelexResolution = {
  celex: string;
  found: boolean;
  sourceUrl: string;
  resolvedUrl?: string;
  error?: string;
  corrigendumStatus?: CorrigendumStatus;
  corrigenda?: CorrigendumMetadata[];
};

export type CorrigendumStatus = "none" | "non_english" | "english" | "unavailable";
export type CorrigendumMetadata = {
  celex: string;
  publicationDate?: string;
  affectedLanguages: string[];
  sourceUrl: string;
  pdfUrl?: string;
  affectsEnglish: boolean;
};

const sparqlResults = z.object({ results: z.object({ bindings: z.array(z.object({
  corr: z.object({ value: z.string() }),
  corrCelex: z.object({ value: z.string() }),
  date: z.object({ value: z.string() }).optional(),
  language: z.object({ value: z.string() }).optional(),
  englishPdf: z.object({ value: z.string() }).optional(),
})) }) });
const pdfManifestationResults = z.object({ results: z.object({ bindings: z.array(z.object({
  pdf: z.object({ value: z.string() }),
})) }) });

const SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const LANGUAGE_URI_PREFIX = "http://publications.europa.eu/resource/authority/language/";

type OfficialPdfCandidate = { service: "CELLAR" | "CELLAR_STREAM" | "ELI"; url: string };
type FailedAttempt = { service: OfficialPdfCandidate["service"]; url: string; status?: number; finalUrl?: string; contentType?: string; location?: string; error?: string };

function cellarUrl(celex: string) {
  return `${CELLAR_CELEX_BASE}/${encodeURIComponent(celex)}`;
}

function eliPdfUrl(celex: string) {
  const match = /^3(\d{4})([RLD])(\d+)$/.exec(celex);
  if (!match) return null;
  const type = { R: "reg", L: "dir", D: "dec" }[match[2]];
  return `${ELI_BASE}/${type}/${match[1]}/${Number(match[3])}/oj/eng/pdf`;
}

function officialCandidates(celex: string): OfficialPdfCandidate[] {
  const candidates: OfficialPdfCandidate[] = [{ service: "CELLAR", url: cellarUrl(celex) }];
  const eliUrl = eliPdfUrl(celex);
  if (eliUrl) candidates.push({ service: "ELI", url: eliUrl });
  return candidates;
}

function requestHeaders(service: OfficialPdfCandidate["service"]): Record<string, string> {
  if (service === "CELLAR_STREAM") return { "User-Agent": "EU-Acquis-AI/1.0 (official-document-import)" };
  return {
    Accept: "application/pdf",
    "Accept-Language": service === "CELLAR" ? "eng" : "en",
    "Accept-Max-Cs-Size": String(MAX_CELEX_PDF_BYTES),
    "User-Agent": "EU-Acquis-AI/1.0 (official-document-import)",
  };
}

function logResolutionFailure(celex: string, attempts: FailedAttempt[]) {
  if (process.env.NODE_ENV !== "production") console.error("Official English CELEX PDF resolution failed.", { celex, attempts });
}

async function requestCandidate(candidate: OfficialPdfCandidate, timeoutMs: number) {
  return fetch(candidate.url, { headers: requestHeaders(candidate.service), redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
}

function failedAttempt(candidate: OfficialPdfCandidate, response: Response): FailedAttempt {
  return { service: candidate.service, url: candidate.url, status: response.status, finalUrl: response.url,
    contentType: response.headers.get("content-type") ?? undefined, location: response.headers.get("location") ?? undefined };
}

async function resolveParentPdfManifestation(celex: string): Promise<string | null> {
  const query = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?pdf WHERE {
  ?work cdm:resource_legal_id_celex ?storedCelex .
  FILTER(STR(?storedCelex) = ${JSON.stringify(celex)})
  ?expression cdm:expression_belongs_to_work ?work ;
              cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  ?manifestation cdm:manifestation_manifests_expression ?expression ;
                 cdm:manifestation_type ?format .
  FILTER(STRSTARTS(LCASE(STR(?format)), "pdf"))
  BIND(IRI(CONCAT(STR(?manifestation), "/DOC_1")) AS ?pdf)
} LIMIT 1`;
  try {
    const response = await fetch(SPARQL_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "EU-Acquis-AI/1.0 (official-document-import)" },
      body: new URLSearchParams({ query }), cache: "no-store", signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`SPARQL parent PDF request returned HTTP ${response.status}.`);
    const parsed = pdfManifestationResults.safeParse(await response.json());
    if (!parsed.success) throw new Error(`SPARQL parent PDF response was invalid: ${z.prettifyError(parsed.error)}`);
    return parsed.data.results.bindings[0]?.pdf.value.replace(/^http:/, "https:") ?? null;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Official parent PDF manifestation lookup failed.", {
      celex, endpoint: SPARQL_ENDPOINT, error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function resolveCorrigenda(celex: string): Promise<{ status: CorrigendumStatus; corrigenda: CorrigendumMetadata[] }> {
  const query = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?corr ?corrCelex ?date ?language ?englishPdf WHERE {
  ?corr cdm:work_has_resource-type <http://publications.europa.eu/resource/authority/resource-type/CORRIGENDUM> ;
        cdm:resource_legal_id_celex ?corrCelex .
  FILTER(STRSTARTS(STR(?corrCelex), ${JSON.stringify(`${celex}R(`)}))
  OPTIONAL { ?corr cdm:work_date_document ?date }
  OPTIONAL { ?expression cdm:expression_belongs_to_work ?corr ; cdm:expression_uses_language ?language }
  OPTIONAL {
    ?englishExpression cdm:expression_belongs_to_work ?corr ;
                       cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
    ?englishManifestation cdm:manifestation_manifests_expression ?englishExpression ;
                          cdm:manifestation_type ?format .
    FILTER(STRSTARTS(LCASE(STR(?format)), "pdf"))
    BIND(IRI(CONCAT(STR(?englishManifestation), "/DOC_1")) AS ?englishPdf)
  }
}`;
  try {
    const response = await fetch(SPARQL_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "EU-Acquis-AI/1.0 (official-document-import)" },
      body: new URLSearchParams({ query }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`SPARQL metadata request returned HTTP ${response.status}.`);
    const parsed = sparqlResults.safeParse(await response.json());
    if (!parsed.success) throw new Error(`SPARQL metadata response was invalid: ${z.prettifyError(parsed.error)}`);

    const byCelex = new Map<string, CorrigendumMetadata>();
    for (const row of parsed.data.results.bindings) {
      const item = byCelex.get(row.corrCelex.value) ?? { celex: row.corrCelex.value, publicationDate: row.date?.value,
        affectedLanguages: [], sourceUrl: row.corr.value.replace(/^http:/, "https:"), pdfUrl: row.englishPdf?.value.replace(/^http:/, "https:"), affectsEnglish: false };
      const language = row.language?.value.startsWith(LANGUAGE_URI_PREFIX) ? row.language.value.slice(LANGUAGE_URI_PREFIX.length) : undefined;
      if (language && !item.affectedLanguages.includes(language)) item.affectedLanguages.push(language);
      item.affectsEnglish = item.affectedLanguages.includes("ENG");
      byCelex.set(item.celex, item);
    }
    const corrigenda = [...byCelex.values()].sort((a, b) => a.celex.localeCompare(b.celex));
    return { status: corrigenda.length === 0 ? "none" : corrigenda.some((item) => item.affectsEnglish) ? "english" : "non_english", corrigenda };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("Official corrigendum metadata resolution failed.", { celex, endpoint: SPARQL_ENDPOINT,
      error: error instanceof Error ? error.message : String(error) });
    return { status: "unavailable", corrigenda: [] };
  }
}

function isPdfResponse(response: Response) {
  return response.ok && Boolean(response.headers.get("content-type")?.toLowerCase().includes("application/pdf"));
}

export async function resolveEnglishCelexPdf(celex: string): Promise<CelexResolution> {
  const candidates = officialCandidates(celex);
  const attempts: FailedAttempt[] = [];
  for (const candidate of candidates) {
    try {
      const response = await requestCandidate(candidate, 20_000);
      if (isPdfResponse(response)) {
        await response.body?.cancel();
        const corrigenda = await resolveCorrigenda(celex);
        return { celex, found: true, sourceUrl: candidate.url, resolvedUrl: response.url, corrigendumStatus: corrigenda.status, corrigenda: corrigenda.corrigenda };
      }
      attempts.push(failedAttempt(candidate, response));
      await response.body?.cancel();
    } catch (error) {
      attempts.push({ service: candidate.service, url: candidate.url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  const manifestationUrl = await resolveParentPdfManifestation(celex);
  if (manifestationUrl) {
    const candidate: OfficialPdfCandidate = { service: "CELLAR_STREAM", url: manifestationUrl };
    try {
      const response = await requestCandidate(candidate, 20_000);
      if (isPdfResponse(response)) {
        await response.body?.cancel();
        const corrigenda = await resolveCorrigenda(celex);
        return { celex, found: true, sourceUrl: candidate.url, resolvedUrl: response.url, corrigendumStatus: corrigenda.status, corrigenda: corrigenda.corrigenda };
      }
      attempts.push(failedAttempt(candidate, response));
      await response.body?.cancel();
    } catch (error) {
      attempts.push({ service: candidate.service, url: candidate.url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  logResolutionFailure(celex, attempts);
  const allNotFound = attempts.length >= candidates.length && attempts.every((attempt) => attempt.status === 404);
  const sourceUnavailable = attempts.every((attempt) => attempt.status === undefined || (attempt.status >= 500));
  const corrigenda = await resolveCorrigenda(celex);
  return { celex, found: false, sourceUrl: candidates[0].url, corrigendumStatus: corrigenda.status, corrigenda: corrigenda.corrigenda,
    error: allNotFound ? "CELEX not found" : sourceUnavailable ? "Official source unavailable" : "English PDF representation unavailable" };
}

export async function downloadEnglishCelexPdf(celex: string, officialPdfUrl?: string) {
  const candidates: OfficialPdfCandidate[] = officialPdfUrl ? [{ service: "CELLAR_STREAM", url: officialPdfUrl }, ...officialCandidates(celex)] : officialCandidates(celex);
  if (!officialPdfUrl) {
    const manifestationUrl = await resolveParentPdfManifestation(celex);
    if (manifestationUrl && !candidates.some((candidate) => candidate.url === manifestationUrl)) candidates.push({ service: "CELLAR_STREAM", url: manifestationUrl });
  }
  const attempts: FailedAttempt[] = [];
  for (const candidate of candidates) {
    try {
      const response = await requestCandidate(candidate, 30_000);
      if (!isPdfResponse(response)) {
        attempts.push(failedAttempt(candidate, response));
        await response.body?.cancel();
        continue;
      }
      const declaredSize = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredSize) && declaredSize > MAX_CELEX_PDF_BYTES) throw new Error("The official PDF exceeds the 50 MB source-file limit.");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > MAX_CELEX_PDF_BYTES) throw new Error("The official PDF exceeds the 50 MB source-file limit.");
      if (bytes.byteLength < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") {
        attempts.push({ ...failedAttempt(candidate, response), error: "Response body did not have a PDF signature." });
        continue;
      }
      return { bytes, sourceUrl: candidate.url, resolvedUrl: response.url };
    } catch (error) {
      attempts.push({ service: candidate.service, url: candidate.url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  logResolutionFailure(celex, attempts);
  throw new Error("The official English PDF is unavailable.");
}
