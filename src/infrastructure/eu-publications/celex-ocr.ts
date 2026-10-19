import "server-only";

import path from "node:path";
import { createWorker, PSM } from "tesseract.js";
import { analyzeCelexOcr } from "./celex-ocr-candidates";
export type { OcrCelexCandidate } from "./celex-ocr-candidates";

export const MAX_CELEX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
export const CELEX_SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

function hasSupportedSignature(bytes: Uint8Array) {
  const png = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  return png || jpeg || webp;
}

export async function extractCelexFromScreenshot(file: File) {
  if (!CELEX_SCREENSHOT_TYPES.includes(file.type as (typeof CELEX_SCREENSHOT_TYPES)[number])) {
    throw new Error("Upload a PNG, JPG, JPEG or WebP image.");
  }
  if (file.size === 0 || file.size > MAX_CELEX_SCREENSHOT_BYTES) {
    throw new Error("The screenshot must be smaller than 10 MB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasSupportedSignature(bytes)) throw new Error("The uploaded file is not a valid PNG, JPG, JPEG or WebP image.");

  const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "eng", "4.0.0_best_int");
  const worker = await createWorker("eng", 1, { langPath, gzip: true, cacheMethod: "none" });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const result = await worker.recognize(Buffer.from(bytes));
    const analysis = analyzeCelexOcr(result.data.text);
    if (process.env.NODE_ENV !== "production") {
      console.info("Screenshot CELEX OCR result.", {
        rawText: result.data.text,
        rawTokens: analysis.rawTokens,
        normalizedCandidates: analysis.candidates,
        rejectedTokens: analysis.rejectedTokens,
      });
    }
    return analysis.candidates;
  } finally {
    await worker.terminate();
  }
}
