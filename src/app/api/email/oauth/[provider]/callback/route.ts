import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/infrastructure/supabase/auth";
import { createSupabaseServerClient } from "@/infrastructure/supabase/server";
import { oauthConfig, type EmailProvider } from "@/infrastructure/email/providers";
import { encryptToken } from "@/infrastructure/email/token-crypto";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const user = await getAuthenticatedUser(); if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const { provider: raw } = await context.params; if (raw !== "gmail" && raw !== "outlook") return NextResponse.redirect(new URL("/translators?email=provider-error", request.url));
  const provider = raw as EmailProvider; const url = new URL(request.url); const state = url.searchParams.get("state"); const code = url.searchParams.get("code"); const jar = await cookies();
  if (!state || !code || jar.get("email_oauth_state")?.value !== `${provider}.${state}`) return NextResponse.redirect(new URL("/translators?email=oauth-error", request.url));
  jar.delete("email_oauth_state"); const config = oauthConfig(provider);
  const tokenResponse = await fetch(config.token, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code, redirect_uri: config.redirectUri, grant_type: "authorization_code" }) });
  if (!tokenResponse.ok) { console.error("Email OAuth token exchange failed", { provider, status: tokenResponse.status }); return NextResponse.redirect(new URL("/translators?email=oauth-error", request.url)); }
  const token = await tokenResponse.json() as { access_token:string; refresh_token?:string; expires_in?:number; id_token?:string };
  const profileResponse = await fetch(provider === "gmail" ? "https://openidconnect.googleapis.com/v1/userinfo" : "https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName", { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!profileResponse.ok) return NextResponse.redirect(new URL("/translators?email=profile-error", request.url));
  const profile = await profileResponse.json() as { sub?:string; id?:string; email?:string; mail?:string; userPrincipalName?:string }; const sender = profile.email ?? profile.mail ?? profile.userPrincipalName;
  if (!sender) return NextResponse.redirect(new URL("/translators?email=profile-error", request.url));
  const supabase = await createSupabaseServerClient(); const { error } = await supabase.rpc("save_email_provider_connection", { p_provider:provider, p_account_id:profile.sub ?? profile.id!, p_sender_email:sender.toLowerCase(), p_access_token:encryptToken(token.access_token), p_refresh_token:token.refresh_token ? encryptToken(token.refresh_token) : null, p_expires_at:token.expires_in ? new Date(Date.now()+token.expires_in*1000).toISOString() : null });
  if (error) { console.error("Email connection save failed", error); return NextResponse.redirect(new URL("/translators?email=save-error", request.url)); }
  return NextResponse.redirect(new URL("/translators?email=connected", request.url));
}
