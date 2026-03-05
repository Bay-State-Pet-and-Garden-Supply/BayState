import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

export async function createAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
  const cookieHeader = request.headers.get('cookie') || ''
  const cookieMap = new Map<string, string>()

  cookieHeader.split(';').forEach((cookie) => {
    const [name, ...valueParts] = cookie.trim().split('=')
    if (name && valueParts.length) {
      cookieMap.set(name, valueParts.join('='))
    }
  })

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return Array.from(cookieMap.entries()).map(([name, value]) => ({
            name,
            value,
          }))
        },
        setAll(cookiesToSet) {
          // Can't set cookies from a non-middleware context without access to response
          // This is a no-op in Server Components
        },
      },
    }
  )
}
