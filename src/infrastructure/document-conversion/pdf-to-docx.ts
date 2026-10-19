import "server-only";

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
export { runShadowReconstruction } from "./shadow-reconstruction";

const execFileAsync = promisify(execFile);
const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOCX_BYTES = 150 * 1024 * 1024;

type ExternalFailure = Error & { code?: number | string; signal?: NodeJS.Signals | null; killed?: boolean; stdout?: string; stderr?: string };

export class PdfToDocxConversionError extends Error {
  constructor(
    message: string,
    readonly details: Record<string, unknown> = {},
    cause?: unknown,
    readonly workerCode?: string,
    readonly responseStatus?: number,
    readonly responseBody?: string,
  ) {
    super(message, { cause });
    this.name = "PdfToDocxConversionError";
  }
}

export type DocxValidationReport = {
  bytes: number;
  sha256: string;
  parts: number;
  relationships: number;
  paragraphs: number;
  tables: number;
  footnotes: number;
  editableCharacters: number;
  charactersWithoutSpaces: number;
  charactersWithSpaces: number;
  mimeType: typeof DOCX_MIME_TYPE;
};

export type PdfAnalysisReport = {
  integrityValidated: true;
  sourceText: string | null;
  charactersWithoutSpaces: number | null;
  charactersWithSpaces: number | null;
  diagnostics: Record<string, unknown>;
  countError: string | null;
};

export class DocxValidationError extends Error {
  constructor(message: string, readonly details: Record<string, unknown> = {}, cause?: unknown) {
    super(message, { cause });
    this.name = "DocxValidationError";
  }
}

function requiredEnvironment(name: "PDF_TO_DOCX_SERVICE_URL" | "PDF_TO_DOCX_SERVICE_TOKEN") {
  const value = process.env[name]?.trim();
  if (!value) throw new PdfToDocxConversionError(`${name} is required. High-fidelity conversion must run in the dedicated document worker.`);
  return value;
}

function workerUrl(pathname: "/convert/pdf-to-docx" | "/analyze/pdf" | "/shadow/reconstruct") {
  const configured = requiredEnvironment("PDF_TO_DOCX_SERVICE_URL").replace(/\/$/, "");
  const root = configured.endsWith("/convert/pdf-to-docx") ? configured.slice(0, -"/convert/pdf-to-docx".length)
    : configured.endsWith("/analyze/pdf") ? configured.slice(0, -"/analyze/pdf".length) : configured;
  return `${root}${pathname}`;
}

async function workerFailure(response: Response, serviceUrl: string) {
  const responseText = (await response.text()).slice(0, 2_000);
  let workerCode: string | undefined;
  let workerMessage: string | undefined;
  try {
    const payload = JSON.parse(responseText) as { error?: { code?: unknown; message?: unknown } };
    workerCode = typeof payload.error?.code === "string" ? payload.error.code : undefined;
    workerMessage = typeof payload.error?.message === "string" ? payload.error.message : undefined;
  } catch { /* retain the bounded raw response for diagnostics */ }
  return new PdfToDocxConversionError(
    workerMessage ?? `The document worker failed with HTTP ${response.status}.`,
    { serviceUrl }, undefined, workerCode, response.status, responseText,
  );
}

/** Validates and extracts PDF text in the Python worker; never loads PDF.js in Next.js. */
export async function analyzePdf(source: Uint8Array, filename = "source.pdf"): Promise<PdfAnalysisReport> {
  const serviceUrl = workerUrl("/analyze/pdf");
  const request = new FormData();
  request.set("document", new Blob([Uint8Array.from(source).buffer], { type: "application/pdf" }), filename);
  let response: Response;
  try {
    response = await fetch(serviceUrl, {
      method: "POST", headers: { Authorization: `Bearer ${requiredEnvironment("PDF_TO_DOCX_SERVICE_TOKEN")}`, Accept: "application/json" },
      body: request, cache: "no-store", signal: AbortSignal.timeout(10 * 60 * 1000),
    });
  } catch (error) {
    throw new PdfToDocxConversionError("The PDF analysis worker could not be reached.", { serviceUrl }, error);
  }
  if (!response.ok) throw await workerFailure(response, serviceUrl);
  const value: unknown = await response.json();
  if (!value || typeof value !== "object") throw new PdfToDocxConversionError("The PDF analysis worker returned no report.", { serviceUrl });
  const report = value as Partial<PdfAnalysisReport>;
  const countsValid = report.charactersWithoutSpaces === null && report.charactersWithSpaces === null && typeof report.countError === "string"
    || Number.isSafeInteger(report.charactersWithoutSpaces) && Number.isSafeInteger(report.charactersWithSpaces)
      && (report.charactersWithoutSpaces as number) >= 0 && (report.charactersWithSpaces as number) >= (report.charactersWithoutSpaces as number);
  if (report.integrityValidated !== true || (typeof report.sourceText !== "string" && report.sourceText !== null)
    || !report.diagnostics || typeof report.diagnostics !== "object" || !countsValid) {
    throw new PdfToDocxConversionError("The PDF analysis worker returned an invalid integrity report.", { serviceUrl });
  }
  return report as PdfAnalysisReport;
}

/** Calls the isolated high-fidelity worker. There is deliberately no degraded local fallback. */
export async function convertPdfToDocx(sourcePath: string, targetPath: string) {
  const serviceUrl = workerUrl("/convert/pdf-to-docx");
  const token = requiredEnvironment("PDF_TO_DOCX_SERVICE_TOKEN");
  const source = await readFile(sourcePath);
  const request = new FormData();
  request.set("document", new Blob([source], { type: "application/pdf" }), path.basename(sourcePath));
  request.set("profile", JSON.stringify({
    output: "docx",
    editableText: true,
    preserve: ["legal-structure", "tables", "footnotes"],
    page: { columns: 1, marginsCm: { top: 2.54, bottom: 2.54, left: 3.17, right: 3.17 } },
    body: { alignment: "justified", beforePt: 6, afterPt: 6, lineSpacing: "single" },
    footnotes: { fontSizePt: 9, beforePt: 0, afterPt: 0, lineSpacing: "single" },
    literalLegalLabels: true,
  }));

  let response: Response;
  try {
    response = await fetch(serviceUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: DOCX_MIME_TYPE },
      body: request,
      cache: "no-store",
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
  } catch (error) {
    throw new PdfToDocxConversionError("The document-conversion worker could not be reached.", { serviceUrl }, error);
  }
  if (!response.ok) {
    throw await workerFailure(response, serviceUrl);
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== DOCX_MIME_TYPE) throw new PdfToDocxConversionError(`The worker returned ${contentType || "no content type"}, not DOCX.`);
  if (response.headers.get("x-ooxml-validated")?.toLowerCase() !== "true") {
    throw new PdfToDocxConversionError("The worker did not attest to an OOXML reopen/validation round-trip.");
  }
  if (response.headers.get("x-normalization-validated")?.toLowerCase() !== "true") {
    throw new PdfToDocxConversionError("The worker did not attest that the final DOCX satisfies the normalization contract.");
  }
  if (response.headers.get("x-reading-order-validated")?.toLowerCase() !== "true") {
    throw new PdfToDocxConversionError("The worker did not attest that legal reading order was validated.");
  }
  const engine = response.headers.get("x-converter-engine")?.trim();
  if (!engine) throw new PdfToDocxConversionError("The worker did not identify its conversion engine.");
  const conversionPath = response.headers.get("x-conversion-path")?.trim();
  if (!conversionPath) throw new PdfToDocxConversionError("The worker did not identify the conversion path used for this DOCX.");
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_DOCX_BYTES) throw new PdfToDocxConversionError("The worker returned an oversized DOCX.");
  const output = Buffer.from(await response.arrayBuffer());
  if (output.length === 0 || output.length > MAX_DOCX_BYTES) throw new PdfToDocxConversionError("The worker returned an empty or oversized DOCX.");
  await writeFile(targetPath, output);
  return { engine, conversionPath, serviceUrl, bytes: output.length } as const;
}

function pythonExecutable() {
  return process.env.DOCX_VALIDATOR_PYTHON ?? (process.platform === "win32" ? "py" : "python3");
}

export async function validateDocx(documentPath: string): Promise<DocxValidationReport> {
  const python = pythonExecutable();
  const script = path.join(process.cwd(), "scripts", "docx_validator.py");
  try {
    const result = await execFileAsync(python, [script, documentPath], { timeout: 60_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    const report: unknown = JSON.parse(result.stdout);
    if (!report || typeof report !== "object") throw new Error("Validator returned no report.");
    const value = report as Partial<DocxValidationReport>;
    if (typeof value.bytes !== "number" || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256)
      || typeof value.parts !== "number" || typeof value.relationships !== "number" || typeof value.paragraphs !== "number"
      || typeof value.tables !== "number" || typeof value.footnotes !== "number" || typeof value.editableCharacters !== "number"
      || typeof value.charactersWithoutSpaces !== "number" || typeof value.charactersWithSpaces !== "number"
      || value.editableCharacters < 1 || value.mimeType !== DOCX_MIME_TYPE) {
      throw new Error("Validator returned an invalid report.");
    }
    return value as DocxValidationReport;
  } catch (error) {
    const failure = error as ExternalFailure;
    const message = error instanceof Error ? error.message : "Unknown DOCX validation failure";
    throw new DocxValidationError(`DOCX structural validation failed: ${message}`, {
      executable: python, exitCode: failure.code, signal: failure.signal, killed: failure.killed,
      stdout: failure.stdout?.trim(), stderr: failure.stderr?.trim(),
    }, error);
  }
}

export async function countDocxCharacters(documentPath: string): Promise<{ charactersWithoutSpaces: number; charactersWithSpaces: number }> {
  const python = pythonExecutable();
  const script = path.join(process.cwd(), "scripts", "docx_validator.py");
  try {
    const result = await execFileAsync(python, [script, documentPath, "--counts-only"], { timeout: 60_000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
    const value: unknown = JSON.parse(result.stdout);
    if (!value || typeof value !== "object") throw new Error("Counter returned no report.");
    const counts = value as Partial<{ charactersWithoutSpaces: number; charactersWithSpaces: number }>;
    if (!Number.isSafeInteger(counts.charactersWithoutSpaces) || !Number.isSafeInteger(counts.charactersWithSpaces)
      || (counts.charactersWithoutSpaces as number) < 0 || (counts.charactersWithSpaces as number) < (counts.charactersWithoutSpaces as number)) {
      throw new Error("Counter returned invalid character counts.");
    }
    return counts as { charactersWithoutSpaces: number; charactersWithSpaces: number };
  } catch (error) {
    throw new DocxValidationError(`DOCX character counting failed: ${error instanceof Error ? error.message : "Unknown failure"}`, { executable: python }, error);
  }
}
