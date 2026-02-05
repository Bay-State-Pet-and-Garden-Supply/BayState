import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // First, update the session (authentication)
  const response = await updateSession(request)

  const pathname = request.nextUrl.pathname

  // Legacy route redirects for scraper-lab consolidation
  // Redirect /admin/scrapers/configs/* to /admin/scraper-lab/*
  if (pathname.startsWith('/admin/scrapers/configs')) {
    const newPath = pathname.replace('/admin/scrapers/configs', '/admin/scraper-lab')
    const url = new URL(newPath, request.url)
    // Explicitly preserve query parameters from original request
    url.search = request.nextUrl.search
    return NextResponse.redirect(url)
  }

  // Redirect /admin/scrapers/test-lab to /admin/scraper-lab
  if (pathname === '/admin/scrapers/test-lab') {
    const url = new URL('/admin/scraper-lab', request.url)
    // Preserve query parameters for test-lab redirect as well
    url.search = request.nextUrl.search
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
