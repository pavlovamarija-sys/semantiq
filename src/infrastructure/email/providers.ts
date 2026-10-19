export type EmailProvider = "gmail" | "outlook";
export function oauthConfig(provider: EmailProvider) {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) throw new Error("NEXT_PUBLIC_APP_URL is not configured.");
  if (provider === "gmail") return { clientId: process.env.GOOGLE_EMAIL_CLIENT_ID!, clientSecret: process.env.GOOGLE_EMAIL_CLIENT_SECRET!, authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", redirectUri: `${origin}/api/email/oauth/gmail/callback`, scope: "openid email https://www.googleapis.com/auth/gmail.send" };
  return { clientId: process.env.MICROSOFT_EMAIL_CLIENT_ID!, clientSecret: process.env.MICROSOFT_EMAIL_CLIENT_SECRET!, authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", redirectUri: `${origin}/api/email/oauth/outlook/callback`, scope: "openid email offline_access User.Read Mail.Send" };
}
