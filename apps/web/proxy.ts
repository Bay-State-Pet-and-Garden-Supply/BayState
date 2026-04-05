import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  // First, update the session (authentication)
  const response = await updateSession(request)

  return response
}

export const config = {
  matcher: [
    '/account/:path*',
    '/checkout/:path*',
    '/order-confirmation/:path*',
    '/products/:path+',
    '/admin/:path*',
    '/api/admin/:path*',
    '/api/orders/:path*',
  ],
}
