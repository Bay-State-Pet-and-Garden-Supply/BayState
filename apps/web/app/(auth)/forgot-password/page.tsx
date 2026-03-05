import Link from "next/link"
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"

export default function ForgotPasswordPage() {
    return (
        <div className="bg-white p-8 rounded-lg shadow border">
            <div className="mb-6 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-gray-900">Reset Password</h2>
                <p className="mt-2 text-sm text-gray-600">
                    Enter your email to receive a password reset link.
                </p>
            </div>
            <ForgotPasswordForm />
            <div className="mt-6 text-center text-sm">
                <Link href="/login" className="font-medium text-primary hover:text-primary/90 hover:underline underline-offset-4">
                    Back to Sign In
                </Link>
            </div>
        </div>
    )
}
