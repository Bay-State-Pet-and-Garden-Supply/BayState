'use client'

import { useState } from 'react'
import { Pet, PetType } from '@/lib/types'
import { PetCard } from './pet-card'
import { PetForm } from './pet-form'
import { Plus, PawPrint } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'

interface PetListProps {
    pets: Pet[]
    petTypes: PetType[]
}

export function PetList({ pets, petTypes }: PetListProps) {
    const [open, setOpen] = useState(false)

    if (pets.length === 0) {
        return (
            <>
                <EmptyState
                    icon={PawPrint}
                    title="No pets added"
                    description="Tell us about your pets to get personalized recommendations and care tips."
                    actionLabel="Add a Pet"
                    onAction={() => setOpen(true)}
                    className="border-dashed"
                />
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent className="max-h-[90vh] overflow-y-auto rounded-sm border border-[oklch(85%_0.03_160)] shadow-lg p-0">
                        <DialogHeader className="bg-[oklch(25%_0.02_90)] text-white p-6 border-b border-[oklch(85%_0.03_160)]">
                            <DialogTitle className="text-xl font-bold tracking-tight font-display">Add a Pet</DialogTitle>
                            <DialogDescription className="text-white/70 text-sm">
                                Tell us about your pet to get personalized recommendations.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="p-8">
                            <PetForm
                                petTypes={petTypes}
                                onSuccess={() => setOpen(false)}
                            />
                        </div>
                    </DialogContent>
                </Dialog>
            </>
        )
    }

    return (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {pets.map((pet) => (
                <PetCard key={pet.id} pet={pet} petTypes={petTypes} />
            ))}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <button className="flex h-full min-h-[200px] cursor-pointer flex-col items-center justify-center border border-dashed border-[oklch(85%_0.03_160)] bg-card hover:bg-muted transition-colors p-8 text-center group rounded-sm">
                        <div className="bg-[oklch(72%_0.14_85)]/10 border border-[oklch(72%_0.14_85)]/30 p-3 rounded-sm mb-4 group-hover:bg-[oklch(72%_0.14_85)]/20 transition-colors">
                            <Plus className="h-6 w-6 text-[oklch(55%_0.12_85)] group-hover:text-[oklch(45%_0.12_85)] transition-colors" />
                        </div>
                        <h3 className="font-semibold text-lg tracking-tight mb-1 font-display">Add a Pet</h3>
                        <p className="text-xs font-medium tracking-wide text-muted-foreground">
                            Get better recommendations
                        </p>
                    </button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto rounded-sm border border-[oklch(85%_0.03_160)] shadow-lg p-0">
                    <DialogHeader className="bg-[oklch(25%_0.02_90)] text-white p-6 border-b border-[oklch(85%_0.03_160)]">
                        <DialogTitle className="text-xl font-bold tracking-tight font-display">Add a Pet</DialogTitle>
                        <DialogDescription className="text-white/70 text-sm">
                            Tell us about your pet to get personalized recommendations.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-8">
                        <PetForm
                            petTypes={petTypes}
                            onSuccess={() => setOpen(false)}
                        />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
