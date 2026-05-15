// Modern Supabase API keys (v2+) with smart priority for 'sb_' prefixed keys

// Helper to find the modern key in a list of potential variables
const pickModernKey = (keys: (string | undefined)[], label: string) => {
  const modernKey = keys.find(k => k?.startsWith('sb_'))
  if (modernKey) {
    console.log(`[Supabase Config] Picked modern 'sb_' prefixed key for ${label}`)
    return modernKey
  }

  const legacyKey = keys.find(k => !!k)
  if (legacyKey) {
    console.warn(`[Supabase Config] Using legacy key for ${label} (no 'sb_' prefixed key found)`)
    return legacyKey
  }

  console.error(`[Supabase Config] No key found for ${label}`)
  return ''
}

export const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) ?? ''
export const SUPABASE_ANON_KEY = pickModernKey([
  process.env.SUPABASE_PUBLISHABLE_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  process.env.SUPABASE_ANON_KEY,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
], 'SUPABASE_ANON_KEY')
export const SUPABASE_SECRET_KEY = pickModernKey([
  process.env.SUPABASE_SECRET_KEY,
  process.env.SUPABASE_SERVICE_ROLE_KEY
], 'SUPABASE_SECRET_KEY')

/**
 * Required configuration for standard client initialization
 */
export function requireSupabaseConfig(): { url: string; anonKey: string } {
  const url = SUPABASE_URL.trim()
  const anonKey = SUPABASE_ANON_KEY.trim()

  if (!url || !anonKey) {
    throw new Error('Supabase configuration missing. Ensure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_ANON_KEY) are set.')
  }

  return { url, anonKey }
}
