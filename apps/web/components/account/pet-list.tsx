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
                    <DialogContent className="max-h-[90vh] overflow-y-auto border-4 border-zinc-900 rounded-none shadow-[12px_12px_0px_rgba(0,0,0,1)] p-0">
                        <DialogHeader className="bg-zinc-900 text-white p-6 border-b-4 border-zinc-900">
                            <DialogTitle className="text-2xl font-black uppercase tracking-tight font-display">Add a Pet</DialogTitle>
                            <DialogDescription className="text-zinc-400 font-bold uppercase tracking-widest text-[10px]">
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
                    <div className="flex h-full min-h-[200px] cursor-pointer flex-col items-center justify-center border-4 border-dashed border-zinc-200 bg-zinc-50 hover:bg-zinc-100 transition-all shadow-[4px_4px_0px_rgba(0,0,0,0.05)] hover:shadow-[8px_8px_0px_rgba(0,0,0,0.1)] p-8 text-center group">
                        <div className="bg-white border-2 border-zinc-200 p-4 shadow-sm mb-4 group-hover:border-zinc-900 transition-colors">
                            <Plus className="h-8 w-8 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                        </div>
                        <h3 className="font-black text-xl uppercase tracking-tight mb-1 font-display">Add a Pet</h3>
                        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                            Get better recommendations
                        </p>
                    </div>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto border-4 border-zinc-900 rounded-none shadow-[12px_12px_0px_rgba(0,0,0,1)] p-0">
                    <DialogHeader className="bg-zinc-900 text-white p-6 border-b-4 border-zinc-900">
                        <DialogTitle className="text-2xl font-black uppercase tracking-tight font-display">Add a Pet</DialogTitle>
                        <DialogDescription className="text-zinc-400 font-bold uppercase tracking-widest text-[10px]">
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
