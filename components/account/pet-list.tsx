'use client'

import { useState } from 'react'
import { Pet, PetType } from '@/lib/types'
import { PetCard } from './pet-card'
import { PetForm } from './pet-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
                    <DialogContent className="max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>Add a Pet</DialogTitle>
                            <DialogDescription>
                                Tell us about your pet to get personalized recommendations.
                            </DialogDescription>
                        </DialogHeader>
                        <PetForm
                            petTypes={petTypes}
                            onSuccess={() => setOpen(false)}
                        />
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
                    <Card className="flex h-full min-h-[200px] cursor-pointer flex-col items-center justify-center border-dashed bg-muted/40 hover:bg-muted/60 transition-colors">
                        <CardContent className="flex flex-col items-center justify-center p-6 text-center">
                            <div className="rounded-full bg-background p-4 shadow-sm mb-4">
                                <Plus className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="font-semibold text-lg mb-1">Add a Pet</h3>
                            <p className="text-sm text-muted-foreground">
                                Get better recommendations
                            </p>
                        </CardContent>
                    </Card>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Add a Pet</DialogTitle>
                        <DialogDescription>
                            Tell us about your pet to get personalized recommendations.
                        </DialogDescription>
                    </DialogHeader>
                    <PetForm
                        petTypes={petTypes}
                        onSuccess={() => setOpen(false)}
                    />
                </DialogContent>
            </Dialog>
        </div>
    )
}
