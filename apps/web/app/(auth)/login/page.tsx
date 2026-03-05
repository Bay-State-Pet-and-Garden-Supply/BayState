import React from "react"
import Link from "next/link"
import { LoginForm } from "@/components/auth/login-form"
import { OAuthButtons } from "@/components/auth/oauth-buttons"

export default function LoginPage() {
    return (
        <div className="bg-white p-8 rounded-lg shadow border">
            <div className="mb-6 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-gray-900">Sign in</h2>
                <p className="mt-2 text-sm text-gray-600">
                    Or{" "}
                    <Link href="/signup" className="font-medium text-primary hover:text-primary/90 hover:underline underline-offset-4">
                        create an account
                    </Link>
                </p>
            </div>
            <React.Suspense fallback={<div className="h-[300px] flex items-center justify-center">Loading...</div>}>
                <LoginForm />
                <div className="mt-6">
                    <OAuthButtons />
                </div>
            </React.Suspense>
        </div>
    )
}
