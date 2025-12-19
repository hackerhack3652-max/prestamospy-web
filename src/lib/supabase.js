import { createClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase seguro para Next.js (Vercel compatible)
 * No rompe en build si faltan env vars
 */

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Supabase env vars faltantes. Verificá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel."
    );
  }

  return createClient(url, anonKey);
}
