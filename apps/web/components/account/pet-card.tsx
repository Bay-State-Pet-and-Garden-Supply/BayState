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
            <Card>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                    <div className="flex items-center space-x-3">
                        <div className="p-2 bg-primary/10 rounded-full text-primary">
                            {getIcon(pet.pet_type?.icon || null)}
                        </div>
                        <div>
                            <CardTitle className="text-lg">{pet.name}</CardTitle>
                            <CardDescription>{pet.pet_type?.name}{pet.breed ? ` • ${pet.breed}` : ''}</CardDescription>
                        </div>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="-mr-2" aria-label="Open pet menu">
                                <MoreVertical className="h-4 w-4" />
                                <span className="sr-only">Open menu</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setOpen(true)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => setShowDeleteAlert(true)}
                                className="text-destructive focus:text-destructive"
                            >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </CardHeader>
                <CardContent className="space-y-2 text-sm pt-4">
                    <div className="flex items-center text-muted-foreground">
                        <Calendar className="mr-2 h-4 w-4 opacity-70" />
                        {age || 'Age not specified'}
                    </div>
                    <div className="flex items-center text-muted-foreground">
                        <Scale className="mr-2 h-4 w-4 opacity-70" />
                        {pet.weight_lbs ? `${pet.weight_lbs} lbs` : 'Weight not specified'}
                    </div>
                    {pet.dietary_notes && (
                        <div className="mt-3 p-3 bg-muted rounded-md text-xs">
                            <span className="font-semibold block mb-1">Dietary Notes:</span>
                            {pet.dietary_notes}
                        </div>
                    )}

                    <div className="pt-2 space-y-2">
                        {(lifeStageLabel || sizeClassLabel || genderLabel) && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                {lifeStageLabel && (
                                    <div className="flex items-center gap-2">
                                        <span><span className="text-muted-foreground">Stage:</span> {lifeStageLabel}</span>
                                        {(sizeClassLabel || genderLabel) && <span className="text-muted-foreground/30">•</span>}
                                    </div>
                                )}
                                {sizeClassLabel && (
                                    <div className="flex items-center gap-2">
                                        <span><span className="text-muted-foreground">Size:</span> {sizeClassLabel}</span>
                                        {genderLabel && <span className="text-muted-foreground/30">•</span>}
                                    </div>
                                )}
                                {genderLabel && (
                                    <span>{genderLabel}</span>
                                )}
                            </div>
                        )}

                        {(activityLevelLabel || pet.is_fixed) && (
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                                {activityLevelLabel && (
                                    <div className="flex items-center gap-2">
                                        <span><span className="text-muted-foreground">Activity:</span> {activityLevelLabel}</span>
                                        {pet.is_fixed && <span className="text-muted-foreground/30">•</span>}
                                    </div>
                                )}
                                {pet.is_fixed && (
                                    <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground border-muted-foreground/30">
                                        Spayed/Neutered
                                    </Badge>
                                )}
                            </div>
                        )}

                        {pet.special_needs && pet.special_needs.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {pet.special_needs.map(need => {
                                    const label = PET_SPECIAL_NEEDS.find(n => n.value === need)?.label || need
                                    return (
                                        <Badge key={need} variant="secondary" className="text-[10px] h-5 px-2 font-normal">
                                            {label}
                                        </Badge>
                                    )
                                })}
                            </div>
                        )}
                    </div>


                </CardContent>
            </Card>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Edit {pet.name}</DialogTitle>
                        <DialogDescription>
                            Update your pet's details.
                        </DialogDescription>
                    </DialogHeader>
                    <PetForm
                        pet={pet}
                        petTypes={petTypes}
                        onSuccess={() => setOpen(false)}
                    />
                </DialogContent>
            </Dialog>

            <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will remove {pet.name} from your profile. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                            Delete Pet
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
