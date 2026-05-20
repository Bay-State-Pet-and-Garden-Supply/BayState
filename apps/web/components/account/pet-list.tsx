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
                    className="border-dashed border-2 border-zinc-200 bg-white"
                />
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent className="max-h-[90vh] overflow-y-auto border border-zinc-200 rounded-2xl shadow-sm p-0 overflow-hidden">
                        <DialogHeader className="bg-zinc-50/50 p-6 border-b border-zinc-100">
                            <DialogTitle className="text-2xl font-bold font-display text-zinc-900">Add a Pet</DialogTitle>
                            <DialogDescription className="text-zinc-500 font-medium">
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
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {pets.map((pet) => (
                <PetCard key={pet.id} pet={pet} petTypes={petTypes} />
            ))}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <div className="flex h-full min-h-[240px] cursor-pointer flex-col items-center justify-center border-2 border-dashed border-zinc-200 bg-white hover:bg-zinc-50 hover:border-primary/50 transition-all rounded-2xl p-8 text-center group">
                        <div className="bg-zinc-50 border border-zinc-200 p-4 shadow-sm mb-4 group-hover:border-primary transition-all rounded-full">
                            <Plus className="h-8 w-8 text-zinc-400 group-hover:text-primary transition-colors" />
                        </div>
                        <h3 className="font-bold text-xl tracking-tight mb-1 font-display text-zinc-900">Add a Pet</h3>
                        <p className="text-sm font-medium text-zinc-500 font-body">
                            Get better recommendations
                        </p>
                    </div>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto border border-zinc-200 rounded-2xl shadow-sm p-0 overflow-hidden">
                    <DialogHeader className="bg-zinc-50/50 p-6 border-b border-zinc-100">
                        <DialogTitle className="text-2xl font-bold font-display text-zinc-900">Add a Pet</DialogTitle>
                        <DialogDescription className="text-zinc-500 font-medium font-body">
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
