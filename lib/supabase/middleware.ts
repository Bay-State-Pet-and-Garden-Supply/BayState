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
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  // Skip auth redirect for API routes that use their own authentication (API keys)
  const isScraperApi = request.nextUrl.pathname.startsWith('/api/scraper/')
  const isCronApi = request.nextUrl.pathname.startsWith('/api/cron/')
  const isAdminScraperApi = request.nextUrl.pathname.startsWith('/api/admin/scraper-network/')
  
  if (isScraperApi || isCronApi || isAdminScraperApi) {
    // Let these routes handle their own auth via API keys
    return response
  }

  // Handle auth errors (e.g., expired refresh token, session invalidated)
  if (authError) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', 'session_expired')
    url.searchParams.set('message', 'Your session has expired. Please log in again.')
    return NextResponse.redirect(url)
  }

  // Protect /account routes
  if (request.nextUrl.pathname.startsWith('/account')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  // Protect /admin routes
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('next', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }

    // Check role from profiles table (source of truth)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const role = (profile?.role as string) || 'customer'

    // 1. Non-admin/staff should not access any admin route
    if (role !== 'admin' && role !== 'staff') {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'unauthorized')
      url.searchParams.set('message', `Role ${role} is not allowed to access the admin area`)
      return NextResponse.redirect(url)
    }

    // 2. Staff restrictions
    if (role === 'staff') {
      const path = request.nextUrl.pathname
      // Restricted areas for staff
      const restricted = ['/admin/users', '/admin/settings']
      if (restricted.some(r => path.startsWith(r))) {
        const url = request.nextUrl.clone()
        url.pathname = '/admin'
        return NextResponse.redirect(url)
      }
    }
  }

  return response
}
