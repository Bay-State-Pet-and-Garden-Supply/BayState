'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { format } from 'date-fns'
import { CalendarIcon, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
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
    life_stage: z.enum(['puppy', 'kitten', 'juvenile', 'adult', 'senior']).optional(),
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
                    <div className="flex items-center gap-2 border-l-4 border-zinc-900 pl-3">
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900">1. Basic Information</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Pet Name</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="e.g. Buddy" 
                                            {...field} 
                                            className="h-14 border-2 border-zinc-900 rounded-none font-bold focus-visible:ring-0 focus-visible:border-primary"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-[10px] font-bold uppercase" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="pet_type_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Pet Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-14 border-2 border-zinc-900 rounded-none font-bold focus:ring-0">
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="border-2 border-zinc-900 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                                            {petTypes.map((type) => (
                                                <SelectItem key={type.id} value={type.id} className="font-bold">
                                                    {type.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage className="text-[10px] font-bold uppercase" />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="breed"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Breed (Optional)</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="e.g. Golden Retriever" 
                                        {...field} 
                                        className="h-14 border-2 border-zinc-900 rounded-none font-bold focus-visible:ring-0 focus-visible:border-primary"
                                    />
                                </FormControl>
                                <FormMessage className="text-[10px] font-bold uppercase" />
                            </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                        <FormField
                            control={form.control}
                            name="birth_date"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-2">Birth Date (Optional)</FormLabel>
                                    <FormControl>
                                        <BirthDatePicker 
                                            value={field.value} 
                                            onChange={field.onChange} 
                                        />
                                    </FormControl>
                                    <FormMessage className="text-[10px] font-bold uppercase" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="weight_lbs"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Weight (lbs)</FormLabel>
                                    <FormControl>
                                        <Input 
                                            type="number" 
                                            step="0.1" 
                                            placeholder="e.g. 15.5" 
                                            {...field} 
                                            className="h-14 border-2 border-zinc-900 rounded-none font-bold focus-visible:ring-0 focus-visible:border-primary"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-[10px] font-bold uppercase" />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                <div className="space-y-6 pt-4 border-t-4 border-zinc-100">
                    <div className="flex items-center gap-2 border-l-4 border-zinc-900 pl-3">
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900">2. Physical Details</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="gender"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Gender</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-14 border-2 border-zinc-900 rounded-none font-bold focus:ring-0">
                                                <SelectValue placeholder="Select gender" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="border-2 border-zinc-900 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                                            <SelectItem value="male" className="font-bold">Male</SelectItem>
                                            <SelectItem value="female" className="font-bold">Female</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage className="text-[10px] font-bold uppercase" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="is_fixed"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-3 space-y-0 border-2 border-zinc-900 bg-zinc-50 p-4 min-h-[56px] mt-auto">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            className="h-6 w-6 border-2 border-zinc-900 rounded-none data-[state=checked]:bg-zinc-900 data-[state=checked]:text-white"
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel className="text-sm font-black uppercase tracking-tight">
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
                                    <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Life Stage</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-14 border-2 border-zinc-900 rounded-none font-bold focus:ring-0">
                                                <SelectValue placeholder="Select stage" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="border-2 border-zinc-900 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                                            {PET_LIFE_STAGES.map((stage) => (
                                                <SelectItem key={stage.value} value={stage.value} className="font-bold">
                                                    {stage.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage className="text-[10px] font-bold uppercase" />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="size_class"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Size Category</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger className="h-14 border-2 border-zinc-900 rounded-none font-bold focus:ring-0">
                                                <SelectValue placeholder="Select size" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent className="border-2 border-zinc-900 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                                            {PET_SIZE_CLASSES.map((size) => (
                                                <SelectItem key={size.value} value={size.value} className="font-bold">
                                                    {size.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage className="text-[10px] font-bold uppercase" />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="activity_level"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Activity Level</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger className="h-14 border-2 border-zinc-900 rounded-none font-bold focus:ring-0">
                                            <SelectValue placeholder="Select activity level" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent className="border-2 border-zinc-900 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)]">
                                        {PET_ACTIVITY_LEVELS.map((level) => (
                                            <SelectItem key={level.value} value={level.value} className="font-bold">
                                                {level.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage className="text-[10px] font-bold uppercase" />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="space-y-6 pt-4 border-t-4 border-zinc-100">
                    <div className="flex items-center gap-2 border-l-4 border-zinc-900 pl-3">
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900">3. Special Needs & Notes</h3>
                    </div>

                    <FormField
                        control={form.control}
                        name="special_needs"
                        render={() => (
                            <FormItem>
                                <div className="mb-4">
                                    <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Select all that apply:</FormLabel>
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
                                                        className="flex flex-row items-center space-x-3 space-y-0 border-2 border-zinc-100 p-3 hover:bg-zinc-50 transition-colors"
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
                                                                className="h-5 w-5 border-2 border-zinc-900 rounded-none data-[state=checked]:bg-zinc-900 data-[state=checked]:text-white"
                                                            />
                                                        </FormControl>
                                                        <FormLabel className="font-bold text-xs uppercase tracking-tight cursor-pointer">
                                                            {item.label}
                                                        </FormLabel>
                                                    </FormItem>
                                                )
                                            }}
                                        />
                                    ))}
                                </div>
                                <FormMessage className="text-[10px] font-bold uppercase" />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="dietary_notes"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Additional Notes</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Any other allergies or preferences..."
                                        className="min-h-[120px] border-2 border-zinc-900 rounded-none font-bold focus-visible:ring-0 focus-visible:border-primary resize-none"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage className="text-[10px] font-bold uppercase" />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="pt-6">
                    <Button 
                        type="submit" 
                        className="w-full h-16 text-xl font-black uppercase tracking-widest border-b-4 border-black/20 rounded-none shadow-lg active:translate-y-1 active:border-b-0 transition-all bg-zinc-900 hover:bg-zinc-800 text-white" 
                        disabled={loading}
                    >
                        {loading && <Loader2 className="mr-3 h-6 w-6 animate-spin text-accent" />}
                        {pet ? 'Update Pet Profile' : 'Add Pet to Profile'}
                    </Button>
                </div>
            </form>
        </Form>
    )
}

