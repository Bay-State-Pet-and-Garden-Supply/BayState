import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type AppRole = 'admin' | 'staff' | 'customer'

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
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
  const { data: { user }, error: authError } = await supabase.auth.getUser()

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
    request.nextUrl.pathname.startsWith('/api/cron/') ||
    request.nextUrl.pathname.startsWith('/api/admin/scraper-network/') ||
    request.nextUrl.pathname.startsWith('/api/admin/scraper-configs/') ||
    request.nextUrl.pathname.startsWith('/api/admin/scraping/') ||
    request.nextUrl.pathname.startsWith('/api/admin/scraper-configs') ||
    request.nextUrl.pathname.startsWith('/admin/scraper-lab') ||
    request.nextUrl.pathname.startsWith('/admin/scrapers/configs') ||
    request.nextUrl.pathname.match(/^\/admin\/scrapers\/[^\/]+\/test-lab/) ||
    request.nextUrl.pathname.startsWith('/admin/scrapers/configs') ||
    request.nextUrl.pathname.startsWith('/admin/scrapers/test-lab') ||
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname.startsWith('/auth/') ||
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/forgot-password') ||
    request.nextUrl.pathname.startsWith('/update-password')

  if (isPublicRoute) {
    return response
  }

  // If no user and not on a public route, redirect to login
  if (authError || !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Preserve the current path as 'next' param for redirect after login
    url.search = ''
    url.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Check admin role for admin routes
  if (request.nextUrl.pathname.startsWith('/admin') && !request.nextUrl.pathname.startsWith('/admin/scraper-lab')) {
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
