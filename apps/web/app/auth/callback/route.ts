import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSafeRedirectUrl } from '@/lib/auth/redirect-validation'
import { getURL } from '@/lib/auth/url-utils'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    // SECURITY: Validate the next parameter to prevent open redirect attacks
    const next = getSafeRedirectUrl(searchParams.get('next'))

    if (code) {
        const supabase = await createClient()
        const { error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error) {
            // Smart redirect: if next is default /account, check for admin/staff roles
            let finalNext = next
            if (finalNext === '/account') {
                const { data: { user } } = await supabase.auth.getUser()
                if (user) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('role')
                        .eq('id', user.id)
                        .single()

                    const role = profile?.role || 'customer'
                    if (role === 'admin' || role === 'staff') {
                        finalNext = '/admin'
                    }
                }
            }

            // Base URL for redirect
            const siteUrl = getURL();
            return NextResponse.redirect(`${siteUrl}${finalNext.startsWith('/') ? finalNext.slice(1) : finalNext}`);
        }
    }

    // return the user to an error page with instructions
    const siteUrl = getURL();
    return NextResponse.redirect(`${siteUrl}login?detail=auth_error`)
}
