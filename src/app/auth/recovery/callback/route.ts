import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function recoveryFailure(request: NextRequest, reason: string) {
  const url = new URL("/reset-password", request.url);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return recoveryFailure(request, "unavailable");

  const providerError = request.nextUrl.searchParams.get("error_code") ?? request.nextUrl.searchParams.get("error");
  if (providerError) {
    console.error(`[Auth] recovery provider redirect failed ${JSON.stringify({ code: providerError, description: request.nextUrl.searchParams.get("error_description") })}`);
    return recoveryFailure(request, providerError === "otp_expired" ? "expired" : "invalid-link");
  }

  const successUrl = new URL("/reset-password", request.url);
  const response = NextResponse.redirect(successUrl);
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type === "recovery"
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
      : { error: { name: "RecoveryPayloadError", code: "missing_recovery_token", status: 400, message: "No supported recovery token was provided." } };

  if (!result.error) return response;
  console.error(`[Auth] recovery callback failed ${JSON.stringify({ name: result.error.name, code: result.error.code ?? "unknown", status: result.error.status ?? null, message: result.error.message })}`);
  return recoveryFailure(request, result.error.code === "otp_expired" ? "expired" : "invalid-link");
}
