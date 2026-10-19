import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { oauthConfig, type EmailProvider } from "@/infrastructure/email/providers";

export async function GET(_request: Request, context: { params: Promise<{ provider: string }> }) {
  const user = await getAuthenticatedUser(); if (!user) return NextResponse.json({ error: "Не сте најавени." }, { status: 401 });
  const { provider: raw } = await context.params; if (raw !== "gmail" && raw !== "outlook") return NextResponse.json({ error: "Неподдржан провајдер." }, { status: 400 });
  const provider = raw as EmailProvider; const config = oauthConfig(provider); const state = randomBytes(32).toString("base64url");
  (await cookies()).set("email_oauth_state", `${provider}.${state}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/" });
  const url = new URL(config.authorize); url.searchParams.set("client_id", config.clientId); url.searchParams.set("redirect_uri", config.redirectUri); url.searchParams.set("response_type", "code"); url.searchParams.set("scope", config.scope); url.searchParams.set("state", state); url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent");
  return NextResponse.redirect(url);
}
