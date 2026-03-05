import Link from "next/link"
import { UpdatePasswordForm } from "@/components/auth/update-password-form"

export default function UpdatePasswordPage() {
    return (
        <div className="bg-white p-8 rounded-lg shadow border">
            <div className="mb-6 text-center">
                <h2 className="text-3xl font-bold tracking-tight text-gray-900">Set New Password</h2>
                <p className="mt-2 text-sm text-gray-600">
                    Choose a strong password for your account.
                </p>
            </div>
            <UpdatePasswordForm />
            <div className="mt-6 text-center text-sm">
                <Link href="/login" className="font-medium text-primary hover:text-primary/90 hover:underline">
                    Back to Sign In
                </Link>
            </div>
        </div>
    )
}
