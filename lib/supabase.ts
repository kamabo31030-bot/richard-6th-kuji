import { createClient } from "@supabase/supabase-js";

/**
 * Client-side / browser 用（NEXT_PUBLIC_* を使う）
 * Turbopack が静的解析するので、export supabase を必ず用意する。
 */
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * もし getSupabase を参照してる箇所があっても壊れないように残す保険
 */
export function getSupabase() {
  return supabase;
}
