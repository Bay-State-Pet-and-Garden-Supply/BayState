export const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) ?? ''
export const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ?? ''
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
export const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ''

export function requireSupabaseConfig(): { url: string; anonKey: string } {
  const url = SUPABASE_URL.trim()
  const anonKey = SUPABASE_ANON_KEY.trim()

  if (!url || !anonKey) {
    throw new Error('Supabase configuration missing. Set SUPABASE_URL and SUPABASE_ANON_KEY (or SUPABASE_PUBLISHABLE_KEY).')
  }

  if (anonKey.startsWith('ey') && !process.env.SUPABASE_ALLOW_LEGACY_KEYS) {
     // Optional: Warning or error if using JWT key when legacy keys are disabled
  }

  return { url, anonKey }
}
