export type LegalQaStatus = "PASS" | "WARNING" | "ERROR";
export type LegalQaCategory =
  | "ARTICLE_PARAGRAPH"
  | "LEGAL_INSTRUMENT"
  | "CELEX_LEGAL_REFERENCE"
  | "DATE"
  | "AMOUNT_CURRENCY"
  | "PERCENTAGE"
  | "COUNTRY_NAMED_ENTITY"
  | "ENUMERATED_POINT";

export type LegalQaFinding = {
  status: LegalQaStatus;
  category: LegalQaCategory;
  sourceValue: string | null;
  targetValue: string | null;
  message: string;
};

export type LegalQaResult = { status: LegalQaStatus; findings: LegalQaFinding[] };
type Anchor = { canonical: string; value: string };

const months: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  јануари: "01", февруари: "02", март: "03", април: "04", мај: "05", јуни: "06",
  јули: "07", август: "08", септември: "09", октомври: "10", ноември: "11", декември: "12",
};

const entities: Array<[string, string[]]> = [
  ["austria", ["Austria", "Австрија"]], ["belgium", ["Belgium", "Белгија"]],
  ["bulgaria", ["Bulgaria", "Бугарија"]], ["croatia", ["Croatia", "Хрватска"]],
  ["cyprus", ["Cyprus", "Кипар"]], ["czechia", ["Czech Republic", "Czechia", "Чешка Република", "Чешка"]],
  ["denmark", ["Denmark", "Данска"]], ["estonia", ["Estonia", "Естонија"]],
  ["finland", ["Finland", "Финска"]], ["france", ["France", "Франција"]],
  ["germany", ["Germany", "Германија"]], ["greece", ["Greece", "Грција"]],
  ["hungary", ["Hungary", "Унгарија"]], ["ireland", ["Ireland", "Ирска"]],
  ["italy", ["Italy", "Италија"]], ["latvia", ["Latvia", "Латвија"]],
  ["lithuania", ["Lithuania", "Литванија"]], ["luxembourg", ["Luxembourg", "Луксембург"]],
  ["malta", ["Malta", "Малта"]], ["netherlands", ["Netherlands", "Холандија"]],
  ["poland", ["Poland", "Полска"]], ["portugal", ["Portugal", "Португалија"]],
  ["romania", ["Romania", "Романија"]], ["slovakia", ["Slovakia", "Словачка"]],
  ["slovenia", ["Slovenia", "Словенија"]], ["spain", ["Spain", "Шпанија"]],
  ["sweden", ["Sweden", "Шведска"]], ["united-kingdom", ["United Kingdom", "Обединетото Кралство"]],
  ["north-macedonia", ["North Macedonia", "Северна Македонија"]],
  ["european-commission", ["European Commission", "Европската комисија", "Европска комисија"]],
  ["council", ["Council of the European Union", "Council", "Советот на Европската Унија", "Советот"]],
  ["european-parliament", ["European Parliament", "Европскиот парламент", "Европски парламент"]],
  ["court-of-justice", ["Court of Justice of the European Union", "Court of Justice", "Судот на правдата на Европската Унија", "Судот на правдата"]],
];

function escaped(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function anchors(regex: RegExp, text: string, canonical: (match: RegExpExecArray) => string): Anchor[] {
  return [...text.matchAll(regex)].map((match) => ({ canonical: canonical(match), value: match[0] }));
}
function normalizeNumber(value: string) { return value.replace(/[\s,.](?=\d{3}(?:\D|$))/g, "").replace(",", "."); }

function extract(text: string): Record<LegalQaCategory, Anchor[]> {
  const articleEn = anchors(/\b(Article|paragraph)\s+(\d+[a-z]?)/giu, text, (m) => `${m[1].toLowerCase()}:${m[2].toLowerCase()}`);
  const articleMk = anchors(/(?<!\p{L})(член(?:от)?|став)\s+(\d+[а-яa-z]?)/giu, text, (m) => `${m[1].toLowerCase().startsWith("член") ? "article" : "paragraph"}:${m[2].toLowerCase()}`);
  const instruments = anchors(/(?<!\p{L})(Regulation|Directive|Decision|Регулатива(?:та)?|Директива(?:та)?|Одлука(?:та)?)\s*(?:\((?:EU|EC|EEC|ЕУ|ЕЗ|ЕЕЗ)\)\s*)?(?:No\.?\s*)?(\d{1,4}\s*\/\s*\d{2,4}|\d{2,4})(?!\d)/giu, text, (m) => {
    const kind = /Regulation|Регулатива/iu.test(m[1]) ? "regulation" : /Directive|Директива/iu.test(m[1]) ? "directive" : "decision";
    return `${kind}:${m[2].replace(/\s/g, "")}`;
  });
  const celex = anchors(/\b(?:CELEX\s*:?\s*)?([0-9]\d{4}[A-Z]\d{4}(?:\(\d{2}\))?)\b/giu, text, (m) => m[1].toUpperCase());
  const numericDates = anchors(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/gu, text, (m) => `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  const namedDates = anchors(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|јануари|февруари|март|април|мај|јуни|јули|август|септември|октомври|ноември|декември)\s+(\d{4})\b/giu, text, (m) => `${m[3]}-${months[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`);
  const amounts = anchors(/(?:\b(?:EUR|USD|GBP|MKD)\s*|[€$£]\s*)\d[\d\s.,]*(?:\b|(?=\s))|\b\d[\d\s.,]*\s*(?:EUR|USD|GBP|MKD|евра?|денари)\b/giu, text, (m) => {
    const currency = /EUR|€|евр/iu.test(m[0]) ? "EUR" : /USD|\$/iu.test(m[0]) ? "USD" : /GBP|£/iu.test(m[0]) ? "GBP" : "MKD";
    const number = m[0].match(/\d[\d\s.,]*/u)?.[0] ?? "";
    return `${currency}:${normalizeNumber(number.trim())}`;
  });
  const percentages = anchors(/\b\d+(?:[.,]\d+)?\s*%/gu, text, (m) => normalizeNumber(m[0].replace("%", "").trim()));
  const namedEntities: Anchor[] = [];
  for (const [canonical, variants] of entities) for (const variant of variants) {
    const regex = new RegExp(`(?<![\\p{L}])${escaped(variant)}(?![\\p{L}])`, "giu");
    for (const match of text.matchAll(regex)) namedEntities.push({ canonical, value: match[0] });
  }
  // Do not treat every all-caps token as a named entity. Legal documents use
  // all-caps extensively for headings, labels, form fields and translated
  // institutional text (for example COUNCIL, CHAPTER and ANNEX). Those are
  // not stable cross-language anchors. Concrete entities above, plus strict
  // legal-instrument/number/date checks, remain validated.
  const enumMap: Record<string, string> = {
    "\u0430": "a", "\u0431": "b", "\u0432": "c", "\u0433": "d", "\u0434": "e",
    "\u0453": "f", "\u0435": "g", "\u0436": "h",
    "\u00b9": "1", "\u00b2": "2", "\u00b3": "3",
  };
  const enumerated = [...text.matchAll(/\(\s*([a-z\u0400-\u04ff]|\d{1,3}|[\u00b9\u00b2\u00b3])\s*\)/giu)]
    .filter((m) => /[a-z\u0400-\u04ff]/iu.test(m[1]) || !/(?:Article|paragraph|член|став)\s*\d{0,4}\s*$/iu.test(text.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0)))
    .map((m) => ({ canonical: enumMap[m[1].toLowerCase()] ?? m[1].toLowerCase(), value: m[0] }));
  return {
    ARTICLE_PARAGRAPH: [...articleEn, ...articleMk], LEGAL_INSTRUMENT: instruments,
    CELEX_LEGAL_REFERENCE: celex, DATE: [...numericDates, ...namedDates], AMOUNT_CURRENCY: amounts,
    PERCENTAGE: percentages, COUNTRY_NAMED_ENTITY: namedEntities, ENUMERATED_POINT: enumerated,
  };
}

export function runDeterministicLegalQa(sourceEn: string, targetMk: string): LegalQaResult {
  const source = extract(sourceEn), target = extract(targetMk), findings: LegalQaFinding[] = [];
  for (const category of Object.keys(source) as LegalQaCategory[]) {
    const remaining = [...target[category]];
    const missing: Anchor[] = [];
    for (const anchor of source[category]) {
      const index = remaining.findIndex((candidate) => candidate.canonical === anchor.canonical);
      if (index >= 0) {
        const [matched] = remaining.splice(index, 1);
        findings.push({ status: "PASS", category, sourceValue: anchor.value, targetValue: matched.value, message: "Legal anchor preserved." });
      } else missing.push(anchor);
    }
    for (const anchor of missing) {
      const changed = remaining.shift();
      findings.push({ status: "ERROR", category, sourceValue: anchor.value, targetValue: changed?.value ?? null, message: changed ? "Legal anchor changed in MK1." : "Legal anchor is missing from MK1." });
    }
    for (const anchor of remaining) findings.push({ status: "WARNING", category, sourceValue: null, targetValue: anchor.value, message: "MK1 contains an additional legal anchor not found in the source segment." });
  }
  const status: LegalQaStatus = findings.some((finding) => finding.status === "ERROR") ? "ERROR"
    : findings.some((finding) => finding.status === "WARNING") ? "WARNING" : "PASS";
  return { status, findings };
}
