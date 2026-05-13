import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
export type { SupabaseClient }
import { cookies } from 'next/headers'
import {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_SECRET_KEY,
  requireSupabaseConfig,
} from './config'

function requireAdminKey() {
  const secretKey = SUPABASE_SECRET_KEY.trim()
  if (secretKey) return secretKey

  const serviceRoleKey = SUPABASE_SERVICE_ROLE_KEY.trim()
  if (!serviceRoleKey) {
    throw new Error('Supabase admin key missing. Set SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY.')
  }

  return serviceRoleKey
}

export async function createClient() {
  const cookieStore = await cookies()
  const { url, anonKey } = requireSupabaseConfig()

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            // This works in middleware and API routes
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch (error) {
            // The `setAll` method was called from a Server Component without
            // the `await cookies()` pattern, or in a context where cookies
            // can't be modified (e.g., after headers have been sent).
            // In Server Actions, this should work if called correctly.
            console.warn('Could not set cookies:', error)
          }
        },
      },
    }
  )
}

export function createPublicClient() {
  const { url, anonKey } = requireSupabaseConfig()

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {
        },
      },
    }
  )
}

export async function createAdminClient() {
  const { url } = requireSupabaseConfig()

  return createServerClient(
    url,
    requireAdminKey(),
    {
      cookies: {
        getAll() {
          return []
        },
        setAll() {
        },
      },
    }
  )
}

export function createClientFromRequest(request: Request) {
  // For use in contexts where we don't have access to cookies() async
  // This is a fallback that reads cookies from the request header
  const { url, anonKey } = requireSupabaseConfig()
  const cookieHeader = request.headers.get('cookie') || ''
  const cookieMap = new Map<string, string>()

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...valueParts] = cookie.trim().split('=')
    if (name && valueParts.length) {
      cookieMap.set(name, valueParts.join('='))
    }
  })

  return createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return Array.from(cookieMap.entries()).map(([name, value]) => ({
            name,
            value,
          }))
        },
        setAll() {
          // Can't set cookies from a non-middleware context without access to response
          // This is a no-op in Server Components
        },
      },
    }
  )
}

export function createClientFromBearerToken(token: string): SupabaseClient {
  const { url, anonKey } = requireSupabaseConfig()

  return createSupabaseClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  })
}
