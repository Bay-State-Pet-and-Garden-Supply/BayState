import React from "react"
import Link from "next/link"
import { SignupForm } from "@/components/auth/signup-form"
import { OAuthButtons } from "@/components/auth/oauth-buttons"

export default function SignupPage() {
    return (
        <div className="bg-white p-8 rounded-lg shadow border">
            <div className="mb-6 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-gray-900">Create an account</h2>
                <p className="mt-2 text-sm text-gray-600">
                    Already have an account?{" "}
                    <Link href="/login" className="font-medium text-primary hover:text-primary/90 hover:underline underline-offset-4">
                        Sign in
                    </Link>
                </p>
            </div>
            <SignupForm />
            <div className="mt-6">
                <React.Suspense fallback={null}>
                    <OAuthButtons />
                </React.Suspense>
            </div>
        </div>
    )
}
