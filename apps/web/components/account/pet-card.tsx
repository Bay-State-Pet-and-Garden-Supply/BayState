'use client'

import { useState } from 'react'
import { 
    Pet, 
    PetType,
    PET_LIFE_STAGES,
    PET_SIZE_CLASSES,
    PET_SPECIAL_NEEDS,
    PET_ACTIVITY_LEVELS
} from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    Dog,
    Cat,
    Fish,
    Bird,
    Rabbit, // For Small Animal
    Calendar,
    Scale,
    Pencil,
    Trash2,
    MoreVertical,
    PawPrint // For Horse/Livestock fallback
} from 'lucide-react'
import { PetForm } from './pet-form'
import { deletePet } from '@/lib/account/pets'
import { toast } from 'sonner'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { formatDistanceToNow } from 'date-fns'

interface PetCardProps {
    pet: Pet
    petTypes: PetType[]
}

export function PetCard({ pet, petTypes }: PetCardProps) {
    const [open, setOpen] = useState(false)
    const [showDeleteAlert, setShowDeleteAlert] = useState(false)

    const getIcon = (iconName: string | null) => {
        switch (iconName) {
            case 'dog': return <Dog className="h-6 w-6" />
            case 'cat': return <Cat className="h-6 w-6" />
            case 'bird': return <Bird className="h-6 w-6" />
            case 'fish': return <Fish className="h-6 w-6" />
            case 'rabbit': return <Rabbit className="h-6 w-6" />
            case 'horse':
            case 'farm': return <PawPrint className="h-6 w-6" />
            default: return <Dog className="h-6 w-6" />
        }
    }

    const handleDelete = async () => {
        try {
            await deletePet(pet.id)
            toast.success("Pet removed", {
                description: "Pet profile has been deleted.",
            })
        } catch {
            toast.error("Error", {
                description: "Failed to delete pet.",
            })
        }
    }

    const age = pet.birth_date
        ? formatDistanceToNow(new Date(pet.birth_date), { addSuffix: false }) + ' old'
        : null

    const lifeStageLabel = PET_LIFE_STAGES.find(s => s.value === pet.life_stage)?.label
    const sizeClassLabel = PET_SIZE_CLASSES.find(s => s.value === pet.size_class)?.label
    const activityLevelLabel = PET_ACTIVITY_LEVELS.find(a => a.value === pet.activity_level)?.label
    const genderLabel = pet.gender ? (pet.gender.charAt(0).toUpperCase() + pet.gender.slice(1)) : null

    return (
        <>
            <div className="border border-zinc-200 rounded-2xl bg-white shadow-sm flex flex-col overflow-hidden transition-all hover:shadow-md">
                <div className="bg-zinc-50/50 p-4 border-b border-zinc-100 flex flex-row items-center justify-between text-zinc-900">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white border border-zinc-200 text-primary shadow-sm rounded-xl">
                            {getIcon(pet.pet_type?.icon || null)}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold font-display">{pet.name}</h2>
                            <p className="text-sm font-medium text-zinc-500 font-body">
                                {pet.pet_type?.name}{pet.breed ? ` • ${pet.breed}` : ''}
                            </p>
                        </div>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="hover:bg-zinc-100 text-zinc-500 rounded-xl" aria-label="Open pet menu">
                                <MoreVertical className="h-5 w-5" />
                                <span className="sr-only">Open menu</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border border-zinc-200 rounded-xl shadow-sm p-1">
                            <DropdownMenuItem onClick={() => setOpen(true)} className="font-semibold text-sm focus:bg-zinc-100 cursor-pointer p-3 rounded-lg">
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setShowDeleteAlert(true)}
                                className="text-red-600 focus:text-red-700 focus:bg-red-50 font-semibold text-sm cursor-pointer p-3 rounded-lg"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="p-6 space-y-4 flex-1">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center text-sm font-medium text-zinc-600 font-body">
                            <Calendar className="mr-2 h-4 w-4 text-primary" />
                            {age || 'Age N/A'}
                        </div>
                        <div className="flex items-center text-sm font-medium text-zinc-600 font-body">
                            <Scale className="mr-2 h-4 w-4 text-primary" />
                            {pet.weight_lbs ? `${pet.weight_lbs} lbs` : 'Weight N/A'}
                        </div>
                    </div>
                    
                    {pet.dietary_notes && (
                        <div className="p-4 bg-zinc-50 border border-zinc-100 text-sm font-medium leading-relaxed rounded-xl font-body">
                            <span className="font-semibold block mb-1 text-zinc-900">Dietary Notes:</span>
                            {pet.dietary_notes}
                        </div>
                    )}

                    <div className="pt-2 space-y-3">
                        {(lifeStageLabel || sizeClassLabel || genderLabel) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {lifeStageLabel && (
                                    <div className="bg-zinc-100 border border-zinc-200 px-3 py-1 text-xs font-semibold rounded-xl text-zinc-700 font-body">
                                        Stage: {lifeStageLabel}
                                    </div>
                                )}
                                {sizeClassLabel && (
                                    <div className="bg-zinc-100 border border-zinc-200 px-3 py-1 text-xs font-semibold rounded-xl text-zinc-700 font-body">
                                        Size: {sizeClassLabel}
                                    </div>
                                )}
                                {genderLabel && (
                                    <div className="bg-zinc-100 border border-zinc-200 px-3 py-1 text-xs font-semibold rounded-xl text-zinc-700 font-body">
                                        {genderLabel}
                                    </div>
                                )}
                            </div>
                        )}

                        {(activityLevelLabel || pet.is_fixed) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {activityLevelLabel && (
                                    <div className="bg-zinc-100 border border-zinc-200 px-3 py-1 text-xs font-semibold rounded-xl text-zinc-700 font-body">
                                        Activity: {activityLevelLabel}
                                    </div>
                                )}
                                {pet.is_fixed && (
                                    <div className="bg-primary/10 border border-primary/20 text-primary px-3 py-1 text-xs font-semibold rounded-xl font-body">
                                        Fixed
                                    </div>
                                )}
                            </div>
                        )}

                        {pet.special_needs && pet.special_needs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {pet.special_needs.map(need => {
                                    const label = PET_SPECIAL_NEEDS.find(n => n.value === need)?.label || need
                                    return (
                                        <div key={need} className="bg-primary text-white px-3 py-1 text-xs font-semibold rounded-xl font-body shadow-sm">
                                            {label}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto border border-zinc-200 rounded-2xl shadow-sm p-0 overflow-hidden">
                    <DialogHeader className="bg-zinc-50/50 p-6 border-b border-zinc-100">
                        <DialogTitle className="text-2xl font-bold font-display text-zinc-900">Edit {pet.name}</DialogTitle>
                        <DialogDescription className="text-zinc-500 font-medium font-body">
                            Update your pet&apos;s details.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="p-8">
                        <PetForm
                            pet={pet}
                            petTypes={petTypes}
                            onSuccess={() => setOpen(false)}
                        />
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
                <AlertDialogContent className="border border-zinc-200 rounded-2xl shadow-sm p-0 overflow-hidden">
                    <AlertDialogHeader className="p-6">
                        <AlertDialogTitle className="text-2xl font-bold font-display text-zinc-900">Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription className="font-medium text-zinc-500 font-body">
                            This will remove {pet.name} from your profile. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="p-6 bg-zinc-50/50 gap-4 border-t border-zinc-100">
                        <AlertDialogCancel className="border border-zinc-200 rounded-xl font-semibold h-12">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold h-12 shadow-sm">
                            Delete Pet
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )

}
