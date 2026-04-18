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
                <div className="border-b-8 border-zinc-900 pb-4">
                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase font-display leading-none text-zinc-900">Profile</h1>
                    <p className="text-zinc-600 font-bold uppercase tracking-widest text-sm mt-2">Manage your personal information.</p>
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
            <div className="border-b-8 border-zinc-900 pb-4">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase font-display leading-none text-zinc-900">Profile</h1>
                <p className="text-zinc-600 font-bold uppercase tracking-widest text-sm mt-2">Manage your personal information.</p>
            </div>

            <div className="border-2 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(59,130,246,1)]">
                <div className="bg-blue-600 p-4 border-b-2 border-zinc-900 text-white flex items-center justify-between">
                    <div className="flex flex-col">
                        <h2 className="text-2xl font-black uppercase tracking-tight font-display">Personal Information</h2>
                        <p className="text-xs font-bold uppercase tracking-widest text-blue-100">Update your name and contact details.</p>
                    </div>
                    <User className="h-6 w-6" />
                </div>
                <div className="p-8">
                    <ProfileForm profile={profile} />
                </div>
            </div>
        </div>
    )
}

