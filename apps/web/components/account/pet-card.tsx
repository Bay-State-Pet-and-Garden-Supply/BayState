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
            <div className="border border-zinc-200 rounded-lg bg-white shadow-sm flex flex-col overflow-hidden transition-all hover:shadow-md">
                <div className="bg-brand-forest-dark p-4 border-b-2 border-brand-burgundy flex flex-row items-center justify-between text-white">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-white border border-zinc-200 text-brand-forest-dark shadow-sm rounded-md">
                            {getIcon(pet.pet_type?.icon || null)}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold font-display">{pet.name}</h2>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-200/80">
                                {pet.pet_type?.name}{pet.breed ? ` • ${pet.breed}` : ''}
                            </p>
                        </div>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="hover:bg-white/10 text-white" aria-label="Open pet menu">
                                <MoreVertical className="h-5 w-5" />
                                <span className="sr-only">Open menu</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="border border-zinc-200 rounded-lg shadow-sm p-1">
                            <DropdownMenuItem onClick={() => setOpen(true)} className="font-bold text-xs uppercase tracking-widest focus:bg-zinc-100 cursor-pointer p-3">
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setShowDeleteAlert(true)}
                                className="text-brand-burgundy focus:text-white focus:bg-brand-burgundy font-bold text-xs uppercase tracking-widest cursor-pointer p-3"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="p-6 space-y-4 flex-1">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center text-xs font-bold uppercase tracking-widest text-zinc-500">
                            <Calendar className="mr-2 h-4 w-4 text-brand-forest-green" />
                            {age || 'Age N/A'}
                        </div>
                        <div className="flex items-center text-xs font-bold uppercase tracking-widest text-zinc-500">
                            <Scale className="mr-2 h-4 w-4 text-brand-forest-green" />
                            {pet.weight_lbs ? `${pet.weight_lbs} lbs` : 'Weight N/A'}
                        </div>
                    </div>
                    
                    {pet.dietary_notes && (
                        <div className="p-3 bg-zinc-50 border border-zinc-100 text-[10px] font-medium leading-relaxed rounded-md">
                            <span className="font-bold block mb-1 text-zinc-900 uppercase tracking-widest">Dietary Notes:</span>
                            {pet.dietary_notes}
                        </div>
                    )}

                    <div className="pt-2 space-y-3">
                        {(lifeStageLabel || sizeClassLabel || genderLabel) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {lifeStageLabel && (
                                    <div className="bg-zinc-100 border border-zinc-200 px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-sm">
                                        Stage: {lifeStageLabel}
                                    </div>
                                )}
                                {sizeClassLabel && (
                                    <div className="bg-zinc-100 border border-zinc-200 px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-sm">
                                        Size: {sizeClassLabel}
                                    </div>
                                )}
                                {genderLabel && (
                                    <div className="bg-zinc-100 border border-zinc-200 px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-sm">
                                        {genderLabel}
                                    </div>
                                )}
                            </div>
                        )}

                        {(activityLevelLabel || pet.is_fixed) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {activityLevelLabel && (
                                    <div className="bg-zinc-100 border border-zinc-200 px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-sm">
                                        Activity: {activityLevelLabel}
                                    </div>
                                )}
                                {pet.is_fixed && (
                                    <div className="bg-green-50 border border-green-200 text-green-800 px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-sm">
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
                                        <div key={need} className="bg-brand-burgundy text-white px-2 py-1 text-[9px] font-bold uppercase tracking-widest rounded-sm">
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
                <DialogContent className="max-h-[90vh] overflow-y-auto border border-zinc-200 rounded-lg shadow-sm p-0 overflow-hidden">
                    <DialogHeader className="bg-brand-forest-dark text-white p-6 border-b-2 border-brand-burgundy">
                        <DialogTitle className="text-2xl font-bold font-display">Edit {pet.name}</DialogTitle>
                        <DialogDescription className="text-zinc-200/80 font-bold uppercase tracking-widest text-[10px]">
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
                <AlertDialogContent className="border border-zinc-200 rounded-lg shadow-sm p-0 overflow-hidden">
                    <AlertDialogHeader className="p-6">
                        <AlertDialogTitle className="text-2xl font-bold font-display">Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription className="font-medium text-zinc-600">
                            This will remove {pet.name} from your profile. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="p-6 bg-zinc-50 gap-4 border-t border-zinc-100">
                        <AlertDialogCancel className="border border-zinc-200 rounded-md font-bold uppercase tracking-widest text-xs h-12">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-brand-burgundy hover:bg-brand-burgundy/90 text-white rounded-md font-bold uppercase tracking-widest text-xs h-12 shadow-sm">
                            Delete Pet
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )

}
