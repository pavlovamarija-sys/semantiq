export type TranslatorImportRow = {
  fullName: string;
  email: string;
  sourceLanguage: string;
  targetLanguage: string;
  specialization: string;
  availability: "Available" | "Busy" | "Unavailable";
  notes: string;
  grossPrice?: string;
  rowNumber: number;
};

export type ImportField = "fullName" | "firstName" | "lastName" | "email" | "languagePair" | "sourceLanguage" | "targetLanguage" | "specialization" | "availability" | "notes" | "grossPrice";

const aliases: Record<ImportField, string[]> = {
  fullName: ["име и презиме", "целосно име", "full name", "name"],
  firstName: ["име", "first name", "firstname", "given name"],
  lastName: ["презиме", "last name", "lastname", "surname", "family name"],
  email: ["е-пошта", "епошта", "електронска пошта", "email", "email address", "e-mail"],
  languagePair: ["јазична комбинација", "јазичен пар", "language pair", "languages"],
  sourceLanguage: ["изворен јазик", "source language", "source"],
  targetLanguage: ["целен јазик", "target language", "target"],
  specialization: ["специјализација", "област", "specialization", "specialisation"],
  availability: ["достапност", "статус", "availability", "status"],
  notes: ["белешки", "забелешки", "notes", "note"],
  grossPrice: ["цена по страница (бруто)", "цена по страница бруто", "gross price per page", "gross_price_per_page_mkd", "gross price"],
};

export function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLocaleLowerCase("mk-MK").replace(/[._-]+/g, " ").replace(/\s+/g, " ");
}

export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const rows: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (char === '"' && quoted && source[index + 1] === '"') { value += '"'; index++; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value.trim()); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(value.trim()); value = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else value += char;
  }
  row.push(value.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export function detectColumns(headers: string[]) {
  const normalized = headers.map(normalizeHeader);
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, normalized.findIndex((header) => names.map(normalizeHeader).includes(header))])) as Record<ImportField, number>;
}

export function splitLanguagePair(value: string): [string, string] | null {
  const parts = value.split(/\s*(?:→|->|–|—|\/|\bto\b)\s*/iu).map((part) => part.trim()).filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

export function mapImportRows(rows: string[][]): TranslatorImportRow[] {
  const columns = detectColumns(rows[0] ?? []);
  return rows.slice(1).map((values, index) => {
    const get = (field: ImportField) => columns[field] >= 0 ? (values[columns[field]] ?? "").trim() : "";
    const pair = splitLanguagePair(get("languagePair"));
    const fullName = get("fullName") || [get("firstName"), get("lastName")].filter(Boolean).join(" ");
    const availabilityValue = normalizeHeader(get("availability"));
    const availability = availabilityValue === "busy" || availabilityValue === "зафатен" ? "Busy" : availabilityValue === "unavailable" || availabilityValue === "недостапен" ? "Unavailable" : "Available";
    return { fullName, email: get("email"), sourceLanguage: get("sourceLanguage") || pair?.[0] || "", targetLanguage: get("targetLanguage") || pair?.[1] || "", specialization: get("specialization") || "Правен превод", availability, notes: get("notes"), grossPrice: get("grossPrice"), rowNumber: index + 2 };
  });
}

export function normalizeSubmittedImportRow(row: unknown, index: number) {
  const value = row && typeof row === "object" ? row as Record<string, unknown> : {};
  return { fullName:value.fullName??value.full_name??"", email:value.email??"", sourceLanguage:value.sourceLanguage??value.source_language??"", targetLanguage:value.targetLanguage??value.target_language??"", specialization:value.specialization??"Правен превод", availability:value.availability??"Available", notes:value.notes??"", grossPrice:value.grossPrice??value.gross_price_per_page_mkd??"", rowNumber:value.rowNumber??value.row_number??index+2 };
}
