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
        <div className="space-y-12">
            <div className="border-b-8 border-zinc-900 pb-4">
                <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase font-display leading-none text-zinc-900">My Pets</h1>
                <p className="text-zinc-600 font-bold uppercase tracking-widest text-sm mt-2">
                    Tell us about your pets for personalized recommendations and care tips.
                </p>
            </div>

            <PetList pets={pets} petTypes={petTypes} />
        </div>
    )
}

