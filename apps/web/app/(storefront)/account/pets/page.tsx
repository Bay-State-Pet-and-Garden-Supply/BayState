import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getPetTypes, getUserPets } from '@/lib/account/pets'
import { PetList } from '@/components/account/pet-list'

export const metadata = {
    title: 'My Pets - Bay State Pet & Garden Supply',
    description: 'Manage your pets for personalized recommendations',
}

export default async function PetsPage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const [pets, petTypes] = await Promise.all([
        getUserPets(),
        getPetTypes()
    ])

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold tracking-tight">My Pets</h2>
                <p className="text-muted-foreground">
                    Tell us about your pets to get personalized product recommendations and care tips.
                </p>
            </div>

            <PetList pets={pets} petTypes={petTypes} />
        </div>
    )
}
