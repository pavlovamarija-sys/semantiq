import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.redirect(new URL("/login?error=confirmation", request.url));

  const recovery = request.nextUrl.searchParams.get("next") === "/reset-password" || request.nextUrl.searchParams.get("type") === "recovery";
  const destination = recovery ? "/reset-password" : "/app";
  const response = NextResponse.redirect(new URL(destination, request.url));
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
  } });

  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const result = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type === "recovery"
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
      : { error: { name: "AuthCallbackError", code: "missing_auth_token", status: 400, message: "No supported authentication token was provided." } };

  if (!result.error) return response;
  console.error(`[Auth] callback failed ${JSON.stringify({ name: result.error.name, code: result.error.code ?? "unknown", status: result.error.status ?? null, message: result.error.message })}`);
  return NextResponse.redirect(new URL(recovery ? "/reset-password?error=invalid-link" : "/login?error=confirmation", request.url));
}
