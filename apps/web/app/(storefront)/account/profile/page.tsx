import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/roles'
import { redirect } from 'next/navigation'
import { ProfileForm } from '@/components/account/profile-form'
import { CreateProfileCard } from '@/components/account/create-profile-card'
import { User } from 'lucide-react'

export default async function ProfilePage() {
    /**
     * ARCHITECTURE NOTE: This is a Server Component.
     * It MUST remain idempotent and free of side-effects during render.
     * Profile creation/updates are handled via Client Components (ProfileForm/CreateProfileCard)
     * as a user-triggered action, never automatically during render.
     */
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const profile = await getProfile(user.id)

    // If profile doesn't exist (legacy user), show the create profile card
    if (!profile) {
        return (
            <div className="space-y-12">
                <div className="border-b border-[var(--surface-storefront-border)] pb-5">
                    <p className="storefront-kicker mb-2">Account settings</p>
                    <h1 className="storefront-section-title">Profile</h1>
                    <p className="storefront-section-copy mt-3">Manage your personal information.</p>
                </div>

                <CreateProfileCard 
                    userEmail={user.email || ''} 
                    userName={user.user_metadata?.full_name || user.user_metadata?.name}
                />
            </div>
        )
    }

    return (
        <div className="space-y-12">
            <div className="border-b border-[var(--surface-storefront-border)] pb-5">
                <p className="storefront-kicker mb-2">Account settings</p>
                <h1 className="storefront-section-title">Profile</h1>
                <p className="storefront-section-copy mt-3">Manage your personal information.</p>
            </div>

            <div className="storefront-panel overflow-hidden">
                <div className="flex items-center justify-between border-b border-[var(--surface-storefront-border)] bg-[var(--surface-storefront-muted)] p-4 text-zinc-900">
                    <div className="flex flex-col">
                        <h2 className="font-display text-2xl font-bold">Personal information</h2>
                        <p className="text-sm font-medium text-zinc-500">Update your name and contact details.</p>
                    </div>
                    <User className="h-6 w-6 text-primary" />
                </div>
                <div className="p-8">
                    <ProfileForm profile={profile} />
                </div>
            </div>
        </div>
    )
}
