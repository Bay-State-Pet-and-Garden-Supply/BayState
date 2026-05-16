/**
 * Supabase Configuration
 * 
 * Strictly uses modern 'sb_' prefixed keys.
 * Legacy keys (v1) are no longer supported in this beta app.
 */

const isServer = typeof window === 'undefined'

// Helper to validate and warn if keys are not modern
const validateModernKey = (key: string | undefined, label: string) => {
  if (!key) return ''
  
  if (!key.startsWith('sb_')) {
    if (isServer) {
      console.warn(`[Supabase Config] ⚠️ WARNING: '${label}' does not have the modern 'sb_' prefix. Please update your environment variables.`)
    }
  }
  return key
}

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

export const SUPABASE_PUBLISHABLE_KEY = validateModernKey(
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, 
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
)

export const SUPABASE_SECRET_KEY = validateModernKey(
  process.env.SUPABASE_SECRET_KEY, 
  'SUPABASE_SECRET_KEY'
)

/**
 * Required configuration for standard client initialization
 */
export function requireSupabaseConfig(): { url: string; publishableKey: string } {
  const url = SUPABASE_URL.trim()
  const publishableKey = SUPABASE_PUBLISHABLE_KEY.trim()

  if (!url || !publishableKey) {
    if (isServer) {
      console.error('[Supabase Config] ❌ Missing Supabase configuration. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set.')
    }
    throw new Error('Supabase configuration missing.')
  }

  return { url, publishableKey }
}
