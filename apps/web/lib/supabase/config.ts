export const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  ''

export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  ''

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  ''

export function requireSupabaseConfig(): { url: string; anonKey: string } {
  const url = SUPABASE_URL.trim()
  const anonKey = SUPABASE_ANON_KEY.trim()

  if (!url || !anonKey) {
    throw new Error('Supabase configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY.')
  }

  return { url, anonKey }
}
