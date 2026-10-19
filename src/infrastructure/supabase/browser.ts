import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
export function createSupabaseBrowserClient(): SupabaseClient { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; if (!url || !key) throw new Error("Missing public Supabase environment variables."); return createBrowserClient(url, key); }
