import { createServerClient } from '@supabase/ssr'
import type { User } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

type AppRole = 'admin' | 'staff' | 'customer'

type SupabaseConfig = {
  url: string
  publishableKey: string
}

const PLACEHOLDER_SUPABASE_URL = 'https://your-project.supabase.co'
const PLACEHOLDER_SUPABASE_PUBLISHABLE_KEY = 'your-anon-key'

function resolveSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

  if (!url || !publishableKey) {
    return null
  }

  if (url === PLACEHOLDER_SUPABASE_URL || publishableKey === PLACEHOLDER_SUPABASE_PUBLISHABLE_KEY) {
    return null
  }

  try {
    const parsed = new URL(url)
    if (!parsed.protocol.startsWith('http')) {
      return null
    }
  } catch {
    return null
  }

  return { url, publishableKey }
}

function normalizeRole(value: unknown): AppRole | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.toLowerCase()
  if (normalized === 'admin' || normalized === 'staff' || normalized === 'customer') {
    return normalized
  }

  return null
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabaseConfig = resolveSupabaseConfig()

  // Routes that bypass auth check
  const isPublicRoute =
    request.nextUrl.pathname === '/' ||
    request.nextUrl.pathname.startsWith('/products') ||
    request.nextUrl.pathname.startsWith('/brands') ||
    request.nextUrl.pathname.startsWith('/services') ||
    request.nextUrl.pathname.startsWith('/about') ||
    request.nextUrl.pathname.startsWith('/contact') ||
    request.nextUrl.pathname.startsWith('/cart') ||
    request.nextUrl.pathname.startsWith('/checkout') ||
    request.nextUrl.pathname.startsWith('/api/scraper/') ||
    request.nextUrl.pathname === '/api/health' ||
    request.nextUrl.pathname.startsWith('/api/internal/scraper-configs/') ||
    request.nextUrl.pathname.startsWith('/api/internal/scraper-configs') ||
    request.nextUrl.pathname.startsWith('/api/cron/') ||
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname.startsWith('/auth/') ||
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/forgot-password') ||
    request.nextUrl.pathname.startsWith('/update-password')

  if (!supabaseConfig) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY')
    }

    return response
  }

  if (isPublicRoute) {
    return response
  }

  const supabase = createServerClient(
    supabaseConfig.url,
    supabaseConfig.publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Attempt to refresh session first
  let user: User | null = null

  try {
    const { data, error: authError } = await supabase.auth.getUser()
    if (authError) {
      throw authError
    }
    user = data.user
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Auth Middleware] Failed to reach Supabase auth service. Treating request as unauthenticated.', error)
    }

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // If no user and not on a public route, redirect to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Preserve the current path as 'next' param for redirect after login
    url.search = ''
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Check admin role for admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    let role = normalizeRole(user.app_metadata?.role) ?? normalizeRole(user.user_metadata?.role)

    if (role !== 'admin' && role !== 'staff') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      role = normalizeRole((profile as { role?: unknown } | null)?.role) ?? role ?? 'customer'
    }

    if (role !== 'admin' && role !== 'staff') {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'unauthorized')
      url.searchParams.set('message', 'Admin access required.')
      return NextResponse.redirect(url)
    }

    // Staff restrictions
    if (role === 'staff') {
      const path = request.nextUrl.pathname
      const restricted = ['/admin/users', '/admin/settings']
      if (restricted.some(r => path.startsWith(r))) {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
    }
  }

  return response
}
