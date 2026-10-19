const CELEX_PATTERN = /^[0-9][0-9]{4}[A-Z]{1,2}[0-9A-Z]{1,8}(?:\([0-9]{2}\))?(?:-[0-9]{8})?$/;
const EXTRACT_VALID_CELEX = /(?:^|[^0-9A-Z])([0-9][0-9]{4}[A-Z]{1,2}[0-9A-Z]{1,8}(?:\([0-9]{2}\))?(?:-[0-9]{8})?)(?=$|[^0-9A-Z])/gm;
const OCR_TOKEN = /(?:^|[^0-9A-Z])([0-9OIL][0-9A-Z]{4,20}(?:\([0-9OIL]{2}\))?(?:-[0-9OIL]{8})?)(?=$|[^0-9A-Z])/gm;
const SECONDARY_LEGISLATION_PATTERN = /^3(?:19|20)[0-9]{2}[RLD][0-9]{4}$/;
const EXTRACT_SECONDARY_LEGISLATION = /(3(?:19|20)[0-9]{2}[RLD][0-9]{4})/g;
const EXTRACT_MISSING_SECTOR = /((?:19|20)[0-9]{2}[\t \u200B\u200C\u200D\uFEFF]*[RLD][\t \u200B\u200C\u200D\uFEFF]*[0-9]{4})/g;

export type OcrCelexCandidate = {
  value: string;
  status: "detected" | "review";
  original?: string;
  correction: "none" | "ambiguous_digits" | "missing_sector" | "structure_recovery";
};

export type RejectedOcrToken = { token: string; reason: string };

export type CelexOcrAnalysis = {
  rawTokens: string[];
  candidates: OcrCelexCandidate[];
  rejectedTokens: RejectedOcrToken[];
};

function isValidCelex(value: string) {
  return value.length <= 30 && CELEX_PATTERN.test(value);
}

function normalizeOcrText(value: string) {
  return value.normalize("NFKC").toUpperCase().replace(/[‐‑‒–—−]/g, "-");
}

function normalizeDigit(value: string) {
  if (value === "O") return "0";
  if (value === "I" || value === "L") return "1";
  return /^[0-9]$/.test(value) ? value : null;
}

function normalizeSecondaryLegislationShape(value: string) {
  if (value.length !== 10) return null;

  const sector = normalizeDigit(value[0]);
  const year = [...value.slice(1, 5)].map(normalizeDigit);
  const type = value[5] === "1" || value[5] === "I" ? "L" : value[5];
  const number = [...value.slice(6)].map(normalizeDigit);
  if (sector === null || year.includes(null) || number.includes(null)) return null;

  const candidate = `${sector}${year.join("")}${type}${number.join("")}`;
  return SECONDARY_LEGISLATION_PATTERN.test(candidate) && isValidCelex(candidate) ? candidate : null;
}

function recoverSecondaryLegislation(value: string) {
  const recovered = new Set<string>();
  const add = (possible: string) => {
    const candidate = normalizeSecondaryLegislationShape(possible);
    if (candidate) recovered.add(candidate);
  };

  add(value);

  // One surplus OCR character is accepted only when every plausible deletion
  // resolves to the same structure-aware CELEX value.
  if (value.length === 11) {
    for (let index = 0; index < value.length; index += 1) {
      add(`${value.slice(0, index)}${value.slice(index + 1)}`);
    }
  }

  // A dropped sector is the only generally unambiguous one-character
  // insertion: sector 3 denotes the secondary legislation represented here.
  if (value.length === 9) add(`3${value}`);

  return recovered.size === 1 ? [...recovered][0] : null;
}

function possibleDigitCorrection(value: string) {
  if (value.length < 7) return null;
  const prefix = value.slice(0, 5);
  if (!/^[0-9OIL]{5}$/.test(prefix) || !/[OIL]/.test(prefix)) return null;
  const corrected = `${prefix.replaceAll("O", "0").replaceAll("I", "1").replaceAll("L", "1")}${value.slice(5)}`;
  return isValidCelex(corrected) ? corrected : null;
}

export function analyzeCelexOcr(ocrText: string): CelexOcrAnalysis {
  const candidates = new Map<string, OcrCelexCandidate>();
  const normalizedText = normalizeOcrText(ocrText);
  const nearValidTokens = [...normalizedText.matchAll(EXTRACT_MISSING_SECTOR)]
    .map((match) => match[1].replace(/[\t \u200B\u200C\u200D\uFEFF]/g, ""));
  const boundaryTokens = [...normalizedText.matchAll(OCR_TOKEN)].map((match) => match[1]);
  const rawTokens = [...new Set(boundaryTokens.concat(nearValidTokens))];
  const acceptedTokens = new Set<string>();

  // Preserve complete, valid identifiers unchanged after uppercase text
  // normalization. Recovery is never applied in place of a valid value.
  for (const match of normalizedText.matchAll(EXTRACT_VALID_CELEX)) {
    const value = match[1];
    if (isValidCelex(value)) {
      candidates.set(value, { value, status: "detected", correction: "none" });
      acceptedTokens.add(value);
    }
  }

  // Also find the fixed secondary-legislation shape inside OCR labels such as
  // `CELEX:31990L0426`; valid identifiers are preserved exactly.
  for (const match of normalizedText.matchAll(EXTRACT_SECONDARY_LEGISLATION)) {
    const value = match[1];
    if (isValidCelex(value)) {
      candidates.set(value, { value, status: "detected", correction: "none" });
      acceptedTokens.add(value);
    }
  }

  // Recover a dropped sector before the generic token recovery pass. Only the
  // narrow YYYY+[RLD]+NNNN form is normalized, then strictly validated.
  for (const original of nearValidTokens) {
    const value = `3${original}`;
    if (SECONDARY_LEGISLATION_PATTERN.test(value) && isValidCelex(value) && !candidates.has(value)) {
      candidates.set(value, { value, original, status: "review", correction: "missing_sector" });
      acceptedTokens.add(original);
    }
  }

  for (const original of rawTokens) {
    if (acceptedTokens.has(original) || isValidCelex(original)) continue;

    const structured = recoverSecondaryLegislation(original);
    if (structured) {
      if (!candidates.has(structured)) {
        candidates.set(structured, {
          value: structured,
          original,
          status: "review",
          correction: original.length === 9 ? "missing_sector" : "structure_recovery",
        });
      }
      acceptedTokens.add(original);
      continue;
    }

    const digitCorrection = possibleDigitCorrection(original);
    if (digitCorrection) {
      if (!candidates.has(digitCorrection)) {
        candidates.set(digitCorrection, { value: digitCorrection, original, status: "review", correction: "ambiguous_digits" });
      }
      acceptedTokens.add(original);
    }
  }

  const rejectedTokens = rawTokens
    .filter((token) => !acceptedTokens.has(token) && !isValidCelex(token))
    .map((token) => ({ token, reason: "No unique valid CELEX-shaped recovery" }));

  return { rawTokens, candidates: [...candidates.values()], rejectedTokens };
}

export function detectCelexCandidates(ocrText: string): OcrCelexCandidate[] {
  return analyzeCelexOcr(ocrText).candidates;
}
