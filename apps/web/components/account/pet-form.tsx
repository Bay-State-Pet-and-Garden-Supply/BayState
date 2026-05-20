'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { format } from 'date-fns'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { 
    Pet, 
    PetType,
    PetLifeStage,
    PetSizeClass,
    PetSpecialNeed,
    PetActivityLevel,
    PetGender,
    PET_LIFE_STAGES,
    PET_SIZE_CLASSES,
    PET_SPECIAL_NEEDS,
    PET_ACTIVITY_LEVELS
} from '@/lib/types'
import { createPet, updatePet } from '@/lib/account/pets'
import { toast } from 'sonner'
import { BirthDatePicker } from './birth-date-picker'

const petFormSchema = z.object({
    name: z.string().min(1, 'Name is required').max(50),
    pet_type_id: z.string().min(1, 'Pet type is required'),
    breed: z.string().max(100).optional(),
    birth_date: z.date().optional(),
    weight_lbs: z.string().refine((val) => !val || !isNaN(parseFloat(val)), {
        message: 'Weight must be a number',
    }).optional(),
    dietary_notes: z.string().max(500).optional(),
    life_stage: z.enum(['puppy', 'kitten', 'juvenile', 'adult', 'senior', 'chick', 'layer', 'starter-grower', 'all-life-stages']).optional(),
    size_class: z.enum(['small', 'medium', 'large', 'giant']).optional(),
    special_needs: z.array(z.string()),
    gender: z.enum(['male', 'female']).optional(),
    is_fixed: z.boolean(),
    activity_level: z.enum(['low', 'moderate', 'high', 'very_high']).optional(),
})

type PetFormValues = z.infer<typeof petFormSchema>

interface PetFormProps {
    pet?: Pet
    petTypes: PetType[]
    onSuccess?: () => void
}

export function PetForm({ pet, petTypes, onSuccess }: PetFormProps) {
    const [loading, setLoading] = useState(false)

    const defaultValues: PetFormValues = {
        name: pet?.name || '',
        pet_type_id: pet?.pet_type_id || '',
        breed: pet?.breed || '',
        birth_date: pet?.birth_date ? new Date(pet.birth_date) : undefined,
        weight_lbs: pet?.weight_lbs?.toString() || '',
        dietary_notes: pet?.dietary_notes || '',
        life_stage: pet?.life_stage || undefined,
        size_class: pet?.size_class || undefined,
        special_needs: pet?.special_needs || [],
        gender: pet?.gender || undefined,
        is_fixed: pet?.is_fixed || false,
        activity_level: pet?.activity_level || undefined,
    }

    const form = useForm<PetFormValues>({
        resolver: zodResolver(petFormSchema),
        defaultValues,
    })

    async function onSubmit(data: PetFormValues) {
        setLoading(true)
        try {
            const formattedData = {
                ...data,
                weight_lbs: data.weight_lbs ? parseFloat(data.weight_lbs) : null,
                birth_date: data.birth_date ? format(data.birth_date, 'yyyy-MM-dd') : null,
                life_stage: data.life_stage as PetLifeStage,
                size_class: data.size_class as PetSizeClass,
                gender: data.gender as PetGender,
                activity_level: data.activity_level as PetActivityLevel,
                special_needs: data.special_needs as PetSpecialNeed[],
            }

            if (pet) {
                await updatePet(pet.id, formattedData)
                toast.success('Pet updated', {
                    description: `${data.name}'s profile has been updated.`,
                })
            } else {
                await createPet(formattedData)
                toast.success('Pet added', {
                    description: `${data.name} has been added to your profile.`,
                })
            }
            onSuccess?.()
        } catch {
            toast.error('Error', {
                description: 'Something went wrong. Please try again.',
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
                <div className="space-y-6">
                    <div className="flex items-center gap-2 border-l-4 border-primary pl-3">
                        <h3 className="text-sm font-semibold text-zinc-900 font-display">1. Basic Information</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-zinc-600 font-body">Pet Name</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="e.g. Buddy" 
                                            {...field} 
                                            className="h-12 border border-zinc-200 rounded-xl font-medium focus-visible:ring-0 focus-visible:border-primary"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs font-medium text-red-500 font-body" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="pet_type_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-zinc-600 font-body">Pet Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-12 border border-zinc-200 rounded-xl font-medium focus:ring-0">
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="border border-zinc-200 rounded-xl shadow-sm">
                                            {petTypes.map((type) => (
                                                <SelectItem key={type.id} value={type.id} className="font-medium">
                                                    {type.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage className="text-xs font-medium text-red-500 font-body" />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="breed"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-medium text-zinc-600 font-body">Breed (Optional)</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="e.g. Golden Retriever" 
                                        {...field} 
                                        className="h-12 border border-zinc-200 rounded-xl font-medium focus-visible:ring-0 focus-visible:border-primary"
                                    />
                                </FormControl>
                                <FormMessage className="text-xs font-medium text-red-500 font-body" />
                            </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                        <FormField
                            control={form.control}
                            name="birth_date"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel className="text-sm font-medium text-zinc-600 font-body mb-2">Birth Date (Optional)</FormLabel>
                                    <FormControl>
                                        <BirthDatePicker 
                                            value={field.value} 
                                            onChange={field.onChange} 
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs font-medium text-red-500 font-body" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="weight_lbs"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-zinc-600 font-body">Weight (lbs)</FormLabel>
                                    <FormControl>
                                        <Input 
                                            type="number" 
                                            step="0.1" 
                                            placeholder="e.g. 15.5" 
                                            {...field} 
                                            className="h-12 border border-zinc-200 rounded-xl font-medium focus-visible:ring-0 focus-visible:border-primary"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs font-medium text-red-500 font-body" />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                <div className="space-y-6 pt-4 border-t border-zinc-100">
                    <div className="flex items-center gap-2 border-l-4 border-primary pl-3">
                        <h3 className="text-sm font-semibold text-zinc-900 font-display">2. Physical Details</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="gender"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-zinc-600 font-body">Gender</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-12 border border-zinc-200 rounded-xl font-medium focus:ring-0">
                                                <SelectValue placeholder="Select gender" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="border border-zinc-200 rounded-xl shadow-sm">
                                            <SelectItem value="male" className="font-medium">Male</SelectItem>
                                            <SelectItem value="female" className="font-medium">Female</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage className="text-xs font-medium text-red-500 font-body" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="is_fixed"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 border border-zinc-200 rounded-xl bg-zinc-50/50 p-4 min-h-[48px] mt-auto">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            className="h-5 w-5 border border-zinc-300 rounded data-[state=checked]:bg-primary data-[state=checked]:text-white data-[state=checked]:border-primary"
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel className="text-sm font-medium font-body cursor-pointer">
                                            Spayed/Neutered
                                        </FormLabel>
                                    </div>
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="life_stage"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-zinc-600 font-body">Life Stage</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-12 border border-zinc-200 rounded-xl font-medium focus:ring-0">
                                                <SelectValue placeholder="Select stage" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="border border-zinc-200 rounded-xl shadow-sm">
                                            {PET_LIFE_STAGES.map((stage) => (
                                                <SelectItem key={stage.value} value={stage.value} className="font-medium">
                                                    {stage.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage className="text-xs font-medium text-red-500 font-body" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="size_class"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-medium text-zinc-600 font-body">Size Category</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-12 border border-zinc-200 rounded-xl font-medium focus:ring-0">
                                                <SelectValue placeholder="Select size" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="border border-zinc-200 rounded-xl shadow-sm">
                                            {PET_SIZE_CLASSES.map((size) => (
                                                <SelectItem key={size.value} value={size.value} className="font-medium">
                                                    {size.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage className="text-xs font-medium text-red-500 font-body" />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="activity_level"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-medium text-zinc-600 font-body">Activity Level</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="h-12 border border-zinc-200 rounded-xl font-medium focus:ring-0">
                                            <SelectValue placeholder="Select activity level" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="border border-zinc-200 rounded-xl shadow-sm">
                                        {PET_ACTIVITY_LEVELS.map((level) => (
                                            <SelectItem key={level.value} value={level.value} className="font-medium">
                                                {level.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage className="text-xs font-medium text-red-500 font-body" />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="space-y-6 pt-4 border-t border-zinc-100">
                    <div className="flex items-center gap-2 border-l-4 border-primary pl-3">
                        <h3 className="text-sm font-semibold text-zinc-900 font-display">3. Special Needs & Notes</h3>
                    </div>

                    <FormField
                        control={form.control}
                        name="special_needs"
                        render={() => (
                            <FormItem>
                                <div className="mb-4">
                                    <FormLabel className="text-sm font-medium text-zinc-600 font-body">Select all that apply:</FormLabel>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {PET_SPECIAL_NEEDS.map((item) => (
                                        <FormField
                                            key={item.value}
                                            control={form.control}
                                            name="special_needs"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem
                                                        key={item.value}
                                                        className="flex flex-row items-center space-x-3 space-y-0 border border-zinc-200 rounded-xl p-3 hover:bg-zinc-50 transition-colors"
                                                    >
                                                        <FormControl>
                                                            <Checkbox
                                                                checked={field.value?.includes(item.value)}
                                                                onCheckedChange={(checked) => {
                                                                    return checked
                                                                        ? field.onChange([...field.value, item.value])
                                                                        : field.onChange(
                                                                            field.value?.filter(
                                                                                (value) => value !== item.value
                                                                            )
                                                                        )
                                                                }}
                                                                className="h-5 w-5 border border-zinc-300 rounded data-[state=checked]:bg-primary data-[state=checked]:text-white data-[state=checked]:border-primary"
                                                            />
                                                        </FormControl>
                                                        <FormLabel className="font-medium text-sm font-body cursor-pointer">
                                                            {item.label}
                                                        </FormLabel>
                                                    </FormItem>
                                                )
                                            }}
                                        />
                                    ))}
                                </div>
                                <FormMessage className="text-xs font-medium text-red-500 font-body" />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="dietary_notes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-medium text-zinc-600 font-body">Additional Notes</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Any other allergies or preferences..."
                                        className="min-h-[120px] border border-zinc-200 rounded-xl font-medium focus-visible:ring-0 focus-visible:border-primary resize-none p-4"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage className="text-xs font-medium text-red-500 font-body" />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="pt-6">
                    <Button 
                        type="submit" 
                        size="lg"
                        className="w-full rounded-xl font-semibold shadow-sm transition-all" 
                        disabled={loading}
                    >
                        {loading && <Loader2 className="mr-3 h-5 w-5 animate-spin" />}
                        {pet ? 'Update Pet Profile' : 'Add Pet to Profile'}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
