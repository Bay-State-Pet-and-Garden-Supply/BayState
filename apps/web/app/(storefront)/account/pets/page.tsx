import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getUserPets } from '@/lib/account/pets'
import { getPetTypes } from '@/lib/pet-types'
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
        <div className="space-y-10">
            <div className="border-b border-zinc-200 pb-6">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900 font-display">My Pets</h1>
                <p className="text-zinc-500 font-body mt-1">
                    Tell us about your pets for personalized recommendations and care tips.
                </p>
            </div>

            <PetList pets={pets} petTypes={petTypes} />
        </div>
    )
}
