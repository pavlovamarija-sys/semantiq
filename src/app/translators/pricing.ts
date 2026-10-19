export function parseGrossPrice(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function calculateNetPrice(gross: number | null | undefined, tax: number | null | undefined): number | null {
  if (gross === null || gross === undefined || tax === null || tax === undefined) return null;
  return Math.round(gross * (1 - tax / 100) * 100) / 100;
}
