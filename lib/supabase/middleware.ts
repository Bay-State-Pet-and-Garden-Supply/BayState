import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
    request.nextUrl.pathname.startsWith('/api/scraper/') ||
    request.nextUrl.pathname.startsWith('/api/cron/') ||
    request.nextUrl.pathname.startsWith('/api/admin/scraper-network/') ||
    request.nextUrl.pathname.startsWith('/api/admin/scraper-configs/') ||
    request.nextUrl.pathname.startsWith('/api/admin/scraping/') ||
    request.nextUrl.pathname.startsWith('/api/admin/scraper-configs') ||
    request.nextUrl.pathname.startsWith('/admin/scraper-lab') ||
    request.nextUrl.pathname.startsWith('/admin/scrapers/configs') ||
    request.nextUrl.pathname.startsWith('/admin/scrapers/test-lab') ||
    request.nextUrl.pathname === '/login' ||
    request.nextUrl.pathname === '/auth/'

  if (isPublicRoute) {
    return response
  }

  // If no user and not on a public route, redirect to login
  if (authError || !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', authError?.name || 'session_expired')
    url.searchParams.set('message', authError?.message || 'Please log in to continue.')
    return NextResponse.redirect(url)
  }

  // Check admin role for admin routes
  if (request.nextUrl.pathname.startsWith('/admin') && !request.nextUrl.pathname.startsWith('/admin/scraper-lab')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = (profile?.role as string) || 'customer'

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
