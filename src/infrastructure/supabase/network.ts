export function isSupabaseNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: string; message?: string; cause?: { code?: string } };
  return candidate.name === "AuthRetryableFetchError"
    || candidate.message === "fetch failed"
    || candidate.message?.toLowerCase().includes("fetch failed") === true
    || ["EACCES", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN"].includes(candidate.cause?.code ?? "");
}
