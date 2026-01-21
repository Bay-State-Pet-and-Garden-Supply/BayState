import { SkipLink } from '@/components/ui/skip-link'

export default function AuthLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <>
            <SkipLink />
            <main id="main-content" className="flex min-h-screen items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gray-50">
                <div className="w-full max-w-md space-y-6">
                    {children}
                </div>
            </main>
        </>
    )
}
