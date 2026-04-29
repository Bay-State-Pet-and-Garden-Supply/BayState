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
        <div className="space-y-12">
            <div className="border-b border-[var(--surface-storefront-border)] pb-5">
                <p className="storefront-kicker mb-2">Companions</p>
                <h1 className="storefront-section-title">My pets</h1>
                <p className="storefront-section-copy mt-3">
                    Tell us about your pets for personalized recommendations and care tips.
                </p>
            </div>

            <PetList pets={pets} petTypes={petTypes} />
        </div>
    )
}
