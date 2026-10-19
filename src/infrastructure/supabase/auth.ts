import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "./server";
import { isSupabaseNetworkFailure } from "./network";

type AuthLookupOptions = { networkFailure?: "throw" | "anonymous" };

/** Verifies the current request's identity on the server. Public pages may opt
 * into a network-failure fallback; protected workflows retain fail-closed auth. */
export async function getAuthenticatedUser(options: AuthLookupOptions = {}): Promise<User | null> {
  const supabase = await createSupabaseServerClient();
  let result: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    result = await supabase.auth.getUser();
  } catch (error) {
    if (isSupabaseNetworkFailure(error)) {
      if (options.networkFailure === "anonymous") {
      console.warn("Supabase Auth unavailable; continuing public request as anonymous.", { name: (error as { name?: string }).name, message: (error as { message?: string }).message, cause: (error as { cause?: { code?: string } }).cause?.code });
      return null;
      }
      try {
        const fallback = await supabase.auth.getSession();
        if (fallback.data.session?.user) {
          console.warn("Supabase Auth verification unavailable; preserving the existing local session for this request.", { cause: (error as { cause?: { code?: string } }).cause?.code });
          return fallback.data.session.user;
        }
      } catch (fallbackError) {
        console.error("Supabase Auth network failure and local session fallback failed.", { cause: (error as { cause?: { code?: string } }).cause?.code, fallback: (fallbackError as { message?: string }).message });
      }
      return null;
    }
    throw error;
  }
  const { data: { user }, error } = result;
  if (error) {
    if (error.name === "AuthSessionMissingError") return null;
    if (isSupabaseNetworkFailure(error)) {
      if (options.networkFailure === "anonymous") {
      console.warn("Supabase Auth unavailable; continuing public request as anonymous.", { name: error.name, message: error.message });
      return null;
      }
      try {
        const fallback = await supabase.auth.getSession();
        if (fallback.data.session?.user) return fallback.data.session.user;
      } catch (fallbackError) {
        console.error("Supabase Auth network failure and local session fallback failed.", { message: (fallbackError as { message?: string }).message });
      }
      return null;
    }
    throw error;
  }
  return user;
}
