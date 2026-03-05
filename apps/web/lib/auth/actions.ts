'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { getSafeRedirectUrl, isValidRedirectUrl } from '@/lib/auth/redirect-validation'
import { getURL } from '@/lib/auth/url-utils'

export async function loginAction(values: { email: string, password: string }, redirectTo?: string) {
    const supabase = await createClient()

    const { error } = await supabase.auth.signInWithPassword(values)

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/', 'layout')

    // SECURITY: Validate redirect URL to prevent open redirect attacks
    redirect(getSafeRedirectUrl(redirectTo))
}

export async function signupAction(values: { email: string, password: string, fullName: string }) {
    const supabase = await createClient()

    const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
            data: {
                full_name: values.fullName,
            },
        },
    })

    if (error) {
        return { error: error.message }
    }

    // If email verification is enabled, user will not be signed in immediately
    // unless we use auto-confirm. For now assume verification required or handled.
    // If session created, redirect. Else show success.

    // Check if session established (sign in successful immediately? happens if email confirmation off)
    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
        revalidatePath('/', 'layout')
        redirect('/account')
    }

    // If no session (email confirmation required), return success message
    // But our UI expects { error: null }. We should specific success logic?
    // Current UI just clears error.
    // Ideally we redirect to a "Check your email" page.
    // redirect('/auth/verify-email') 
    // Wait, I haven't created /auth/verify-email page.
    // For now let's redirect to /login?message=check-email
    // ... existing code ...
    redirect('/login?message=check-email')
}

export async function loginWithOAuth(provider: 'google' | 'apple' | 'facebook', next?: string) {
    const supabase = await createClient()

    const siteUrl = getURL()
    const callbackUrl = new URL(`${siteUrl}auth/callback`)

    // SECURITY: Validate next URL before passing to callback
    if (isValidRedirectUrl(next)) {
        callbackUrl.searchParams.set('next', next)
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: callbackUrl.toString(),
        },
    })

    if (error) {
        return { error: error.message }
    }

    if (data.url) {
        redirect(data.url)
    }
}

export async function resetPassword(email: string) {
    const supabase = await createClient()
    const siteUrl = getURL()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${siteUrl}auth/callback?next=/update-password`,
    })
    if (error) return { error: error.message }
    return { success: true }
}

export async function updatePassword(password: string) {
    const supabase = await createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { error: error.message }
    revalidatePath('/account')
    redirect('/account')
}

export async function signOutAction() {
    const supabase = await createClient()
    await supabase.auth.signOut()
    revalidatePath('/', 'layout')
    redirect('/')
}
