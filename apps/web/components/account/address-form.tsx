'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form'
import { addAddressAction } from '@/lib/account/actions'

// Replicate schema from server for client validation
const formSchema = z.object({
    fullName: z.string().min(2, "Full Name is required"),
    addressLine1: z.string().min(5, "Address Line 1 is required"),
    addressLine2: z.string().optional(),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State is required"),
    zipCode: z.string().min(5, "Zip Code is required"),
    phone: z.string().optional(),
    isDefault: z.boolean(),
})

export function AddressForm({ onSuccess }: { onSuccess: () => void }) {
    const [loading, setLoading] = useState(false)
    const [serverError, setServerError] = useState<string | null>(null)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            fullName: "",
            addressLine1: "",
            addressLine2: "",
            city: "",
            state: "",
            zipCode: "",
            phone: "",
            isDefault: false,
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)
        setServerError(null)

        try {
            const result = await addAddressAction(values)
            if (result.error) {
                setServerError(result.error)
            } else {
                form.reset()
                onSuccess()
            }
        } catch {
            setServerError("An unexpected error occurred.")
        } finally {
            setLoading(false)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {serverError && (
                    <div className="p-4 border-2 border-red-600 bg-red-50 text-red-700 font-black uppercase tracking-tight text-xs">
                        {serverError}
                    </div>
                )}
                <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Full Name</FormLabel>
                            <FormControl>
                                <Input 
                                    placeholder="John Doe" 
                                    {...field} 
                                    disabled={loading} 
                                    className="h-14 text-lg font-bold border-2 border-zinc-900 rounded-none focus-visible:ring-0 focus-visible:border-primary transition-all" 
                                />
                            </FormControl>
                            <FormMessage className="text-xs font-bold uppercase tracking-tight" />
                        </FormItem>
                    )}
                />

                <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="addressLine1"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Address Line 1</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="123 Main St" 
                                        {...field} 
                                        disabled={loading} 
                                        className="h-14 text-lg font-bold border-2 border-zinc-900 rounded-none focus-visible:ring-0 focus-visible:border-primary transition-all" 
                                    />
                                </FormControl>
                                <FormMessage className="text-xs font-bold uppercase tracking-tight" />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="addressLine2"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Address Line 2 (Optional)</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="Apt 4B" 
                                        {...field} 
                                        disabled={loading} 
                                        className="h-14 text-lg font-bold border-2 border-zinc-900 rounded-none focus-visible:ring-0 focus-visible:border-primary transition-all" 
                                    />
                                </FormControl>
                                <FormMessage className="text-xs font-bold uppercase tracking-tight" />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid gap-6 grid-cols-1 sm:grid-cols-3">
                    <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">City</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="Anytown" 
                                        {...field} 
                                        disabled={loading} 
                                        className="h-14 text-lg font-bold border-2 border-zinc-900 rounded-none focus-visible:ring-0 focus-visible:border-primary transition-all" 
                                    />
                                </FormControl>
                                <FormMessage className="text-xs font-bold uppercase tracking-tight" />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">State</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="MA" 
                                        {...field} 
                                        disabled={loading} 
                                        className="h-14 text-lg font-bold border-2 border-zinc-900 rounded-none focus-visible:ring-0 focus-visible:border-primary transition-all" 
                                    />
                                </FormControl>
                                <FormMessage className="text-xs font-bold uppercase tracking-tight" />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Zip Code</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="01234" 
                                        {...field} 
                                        disabled={loading} 
                                        className="h-14 text-lg font-bold border-2 border-zinc-900 rounded-none focus-visible:ring-0 focus-visible:border-primary transition-all" 
                                    />
                                </FormControl>
                                <FormMessage className="text-xs font-bold uppercase tracking-tight" />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-xs font-black uppercase tracking-widest text-zinc-500">Phone (Optional)</FormLabel>
                            <FormControl>
                                <Input 
                                    placeholder="" 
                                    {...field} 
                                    disabled={loading} 
                                    className="h-14 text-lg font-bold border-2 border-zinc-900 rounded-none focus-visible:ring-0 focus-visible:border-primary transition-all" 
                                />
                            </FormControl>
                            <FormDescription className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">For delivery updates.</FormDescription>
                            <FormMessage className="text-xs font-bold uppercase tracking-tight" />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 border-2 border-zinc-900 bg-zinc-50 p-4 min-h-[64px]">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="h-6 w-6 border-2 border-zinc-900 rounded-none data-[state=checked]:bg-zinc-900 data-[state=checked]:text-white"
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel className="text-sm font-black uppercase tracking-tight">Set as default address</FormLabel>
                            </div>
                        </FormItem>
                    )}
                />

                <div className="pt-4 flex justify-end">
                    <Button 
                        type="submit" 
                        disabled={loading} 
                        className="w-full sm:w-auto h-14 px-10 text-lg font-black uppercase tracking-widest border-b-4 border-black/20 rounded-none shadow-lg active:translate-y-1 active:border-b-0 transition-all"
                    >
                        {loading ? "Saving..." : "Save Address"}
                    </Button>
                </div>
            </form>
        </Form>
    )

}
