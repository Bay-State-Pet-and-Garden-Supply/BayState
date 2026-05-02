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
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
    Dog,
    Cat,
    Fish,
    Bird,
    Rabbit,
    Calendar,
    Scale,
    Pencil,
    Trash2,
    MoreVertical,
    PawPrint
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
            case 'dog': return <Dog className="h-5 w-5" />
            case 'cat': return <Cat className="h-5 w-5" />
            case 'bird': return <Bird className="h-5 w-5" />
            case 'fish': return <Fish className="h-5 w-5" />
            case 'rabbit': return <Rabbit className="h-5 w-5" />
            case 'horse':
            case 'farm': return <PawPrint className="h-5 w-5" />
            default: return <Dog className="h-5 w-5" />
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
            <div className="border border-[oklch(85%_0.03_160)] bg-card shadow-sm flex flex-col overflow-hidden rounded-sm">
                <div className="bg-primary p-4 border-b border-[oklch(85%_0.03_160)] flex flex-row items-center justify-between text-primary-foreground">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-primary-foreground/20 rounded-sm text-primary-foreground">
                            {getIcon(pet.pet_type?.icon || null)}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold tracking-tight font-display">{pet.name}</h2>
                            <p className="text-[11px] font-medium tracking-wide text-primary-foreground/80">
                                {pet.pet_type?.name}{pet.breed ? ` • ${pet.breed}` : ''}
                            </p>
                        </div>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="hover:bg-primary-foreground/10 text-primary-foreground" aria-label="Open pet menu">
                                <MoreVertical className="h-5 w-5" />
                                <span className="sr-only">Open menu</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40 rounded-sm border border-[oklch(85%_0.03_160)] shadow-md p-1">
                            <DropdownMenuItem onClick={() => setOpen(true)} className="cursor-pointer rounded-sm text-sm">
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setShowDeleteAlert(true)}
                                className="cursor-pointer rounded-sm text-sm text-red-600 focus:text-red-700"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <div className="p-5 space-y-4 flex-1">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center text-sm text-muted-foreground">
                            <Calendar className="mr-2 h-4 w-4 text-foreground" />
                            {age || 'Age N/A'}
                        </div>
                        <div className="flex items-center text-sm text-muted-foreground">
                            <Scale className="mr-2 h-4 w-4 text-foreground" />
                            {pet.weight_lbs ? `${pet.weight_lbs} lbs` : 'Weight N/A'}
                        </div>
                    </div>

                    {pet.dietary_notes && (
                        <div className="p-3 bg-muted border border-[oklch(90%_0.02_160)] rounded-sm text-sm leading-relaxed">
                            <span className="font-semibold text-xs text-foreground block mb-1">Dietary Notes</span>
                            {pet.dietary_notes}
                        </div>
                    )}

                    <div className="pt-1 space-y-2">
                        {(lifeStageLabel || sizeClassLabel || genderLabel) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {lifeStageLabel && (
                                    <Badge variant="outline" className="text-[10px] font-medium tracking-wide">
                                        {lifeStageLabel}
                                    </Badge>
                                )}
                                {sizeClassLabel && (
                                    <Badge variant="outline" className="text-[10px] font-medium tracking-wide">
                                        {sizeClassLabel}
                                    </Badge>
                                )}
                                {genderLabel && (
                                    <Badge variant="outline" className="text-[10px] font-medium tracking-wide">
                                        {genderLabel}
                                    </Badge>
                                )}
                            </div>
                        )}

                        {(activityLevelLabel || pet.is_fixed) && (
                            <div className="flex flex-wrap items-center gap-2">
                                {activityLevelLabel && (
                                    <Badge variant="outline" className="text-[10px] font-medium tracking-wide">
                                        {activityLevelLabel}
                                    </Badge>
                                )}
                                {pet.is_fixed && (
                                    <Badge className="text-[10px] font-medium tracking-wide bg-green-600 hover:bg-green-700 text-white">
                                        Fixed
                                    </Badge>
                                )}
                            </div>
                        )}

                        {pet.special_needs && pet.special_needs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {pet.special_needs.map(need => {
                                    const label = PET_SPECIAL_NEEDS.find(n => n.value === need)?.label || need
                                    return (
                                        <Badge key={need} className="text-[10px] font-medium tracking-wide bg-[oklch(25%_0.02_90)] text-white hover:bg-[oklch(25%_0.02_90)]">
                                            {label}
                                        </Badge>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto rounded-sm border border-[oklch(85%_0.03_160)] shadow-lg p-0">
                    <DialogHeader className="bg-[oklch(25%_0.02_90)] text-white p-6 border-b border-[oklch(85%_0.03_160)]">
                        <DialogTitle className="text-xl font-bold tracking-tight font-display">Edit {pet.name}</DialogTitle>
                        <DialogDescription className="text-white/70 text-sm">
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
                <AlertDialogContent className="rounded-sm border border-[oklch(85%_0.03_160)] shadow-lg">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-bold tracking-tight font-display">Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription className="text-muted-foreground">
                            This will remove {pet.name} from your profile. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-3">
                        <AlertDialogCancel className="rounded-sm border border-[oklch(85%_0.03_160)] font-medium">Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 rounded-sm font-medium">
                            Delete Pet
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
