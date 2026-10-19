import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseNetworkFailure } from "./network";

export async function updateSupabaseSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing public Supabase environment variables.");

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet, headers) => {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      if (headers) for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
    },
  } });

  try {
    await supabase.auth.getClaims();
  } catch (error) {
    if (isSupabaseNetworkFailure(error)) {
      console.warn("Supabase Auth unavailable in proxy; preserving request cookies.", { name: (error as { name?: string }).name, message: (error as { message?: string }).message, cause: (error as { cause?: { code?: string } }).cause?.code });
    } else {
      throw error;
    }
  }
  return response;
}
