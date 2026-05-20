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
            <div className="space-y-10">
                <div className="border-b border-zinc-200 pb-6">
                    <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 font-display">Profile</h1>
                    <p className="text-zinc-500 font-body mt-1">Manage your personal information.</p>
                </div>

                <CreateProfileCard 
                    userEmail={user.email || ''} 
                    userName={user.user_metadata?.full_name || user.user_metadata?.name}
                />
            </div>
        )
    }

    return (
        <div className="space-y-10">
            <div className="border-b border-zinc-200 pb-6">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 font-display">Profile</h1>
                <p className="text-zinc-500 font-body mt-1">Manage your personal information.</p>
            </div>

            <div className="border border-zinc-200 rounded-2xl bg-white shadow-sm overflow-hidden">
                <div className="p-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                    <div className="flex flex-col">
                        <h2 className="text-xl font-bold font-display text-zinc-900">Personal Information</h2>
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Update your name and contact details.</p>
                    </div>
                    <User className="h-6 w-6 text-zinc-400" />
                </div>
                <div className="p-8">
                    <ProfileForm profile={profile} />
                </div>
            </div>
        </div>
    )
}
