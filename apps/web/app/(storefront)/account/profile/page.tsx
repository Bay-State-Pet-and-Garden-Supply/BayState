import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth/roles'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProfileForm } from '@/components/account/profile-form'
import { CreateProfileCard } from '@/components/account/create-profile-card'

export default async function ProfilePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const profile = await getProfile(user.id)

    // If profile doesn't exist (legacy user), show the create profile card
    // This moves the side-effect (INSERT) to a user-triggered action
    if (!profile) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
                    <p className="text-muted-foreground">Manage your personal information.</p>
                </div>

                <CreateProfileCard 
                    userEmail={user.email || ''} 
                    userName={user.user_metadata?.full_name || user.user_metadata?.name}
                />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">Profile</h2>
                <p className="text-muted-foreground">Manage your personal information.</p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Personal Information</CardTitle>
                    <CardDescription>Update your name and contact details.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ProfileForm profile={profile} />
                </CardContent>
            </Card>
        </div>
    )
}
