'use client'

import { Button } from "@/components/ui/button"
import { useSearchParams } from "next/navigation"
import { loginWithOAuth } from "@/lib/auth/actions"

/**
 * OAuthButtons Component
 * Simplified to only show Google authentication.
 */
export function OAuthButtons() {
    const searchParams = useSearchParams()
    const next = searchParams.get('next') || undefined

    return (
        <div className="flex flex-col gap-3">
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                        Or continue with
                    </span>
                </div>
            </div>

            <Button
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                onClick={() => loginWithOAuth('google', next)}
                aria-label="Sign in with Google"
            >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                    />
                    <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1.01.68-2.33 1.09-3.71 1.09-2.85 0-5.27-1.92-6.13-4.51H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                    />
                    <path
                        d="M5.87 14.11c-.22-.68-.35-1.41-.35-2.11s.13-1.43.35-2.11V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.69-2.83z"
                        fill="#FBBC05"
                    />
                    <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.69 2.83c.86-2.59 3.28-4.51 6.13-4.51z"
                        fill="#EA4335"
                    />
                </svg>
                Google
            </Button>
        </div>
    )
}
