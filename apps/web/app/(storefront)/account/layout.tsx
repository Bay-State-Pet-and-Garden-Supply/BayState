import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AccountSidebar } from '@/components/account/account-sidebar'
import { SkipLink } from '@/components/ui/skip-link'

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    return (
        <>
            <SkipLink />
            <div className="container mx-auto px-4 py-6 md:px-6 md:py-10">
                <div className="flex flex-col md:flex-row gap-4 md:gap-8">
                    <aside className="w-full md:w-64 shrink-0">
                        <div className="md:sticky md:top-24">
                            <AccountSidebar />
                        </div>
                    </aside>
                    <main id="main-content" className="flex-1 min-w-0">
                        {children}
                    </main>
                </div>
            </div>
        </>
    )
}
