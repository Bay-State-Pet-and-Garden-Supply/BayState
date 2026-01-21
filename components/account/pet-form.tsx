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
        } catch (error) {
            toast.error('Error', {
                description: 'Something went wrong. Please try again.',
            })
        } finally {
            setLoading(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Basic Info</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Pet's name" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="pet_type_id"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {petTypes.map((type) => (
                                                <SelectItem key={type.id} value={type.id}>
                                                    {type.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="breed"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Breed (Optional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="e.g. Golden Retriever" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="birth_date"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Birth Date (Optional)</FormLabel>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <FormControl>
                                                <Button
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full pl-3 text-left font-normal",
                                                        !field.value && "text-muted-foreground"
                                                    )}
                                                >
                                                    {field.value ? (
                                                        format(field.value, "PPP")
                                                    ) : (
                                                        <span>Pick a date</span>
                                                    )}
                                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                </Button>
                                            </FormControl>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={field.value}
                                                onSelect={field.onChange}
                                                disabled={(date) =>
                                                    date > new Date() || date < new Date("1900-01-01")
                                                }
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="weight_lbs"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Weight (lbs)</FormLabel>
                                    <FormControl>
                                        <Input type="number" step="0.1" placeholder="e.g. 15.5" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground">Details</h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="gender"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Gender</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select gender" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="male">Male</SelectItem>
                                            <SelectItem value="female">Female</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="is_fixed"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <div className="space-y-1 leading-none">
                                        <FormLabel>
                                            Spayed/Neutered
                                        </FormLabel>
                                    </div>
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="life_stage"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Life Stage</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select stage" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {PET_LIFE_STAGES.map((stage) => (
                                                <SelectItem key={stage.value} value={stage.value}>
                                                    {stage.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="size_class"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Size Category</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select size" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {PET_SIZE_CLASSES.map((size) => (
                                                <SelectItem key={size.value} value={size.value}>
                                                    {size.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="activity_level"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Activity Level</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select activity level" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {PET_ACTIVITY_LEVELS.map((level) => (
                                            <SelectItem key={level.value} value={level.value}>
                                                {level.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="special_needs"
                        render={() => (
                            <FormItem>
                                <div className="mb-4">
                                    <FormLabel className="text-base">Special Needs / Diet</FormLabel>
                                    <FormDescription>
                                        Select all that apply for better recommendations.
                                    </FormDescription>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {PET_SPECIAL_NEEDS.map((item) => (
                                        <FormField
                                            key={item.value}
                                            control={form.control}
                                            name="special_needs"
                                            render={({ field }) => {
                                                return (
                                                    <FormItem
                                                        key={item.value}
                                                        className="flex flex-row items-start space-x-3 space-y-0"
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
                                                            />
                                                        </FormControl>
                                                        <FormLabel className="font-normal text-xs">
                                                            {item.label}
                                                        </FormLabel>
                                                    </FormItem>
                                                )
                                            }}
                                        />
                                    ))}
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="dietary_notes"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Additional Notes</FormLabel>
                            <FormControl>
                                <Textarea
                                    placeholder="Any other allergies or preferences..."
                                    className="resize-none"
                                    {...field}
                                />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="flex gap-4 pt-2">
                    <Button type="submit" className="flex-1" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {pet ? 'Save Changes' : 'Add Pet'}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
