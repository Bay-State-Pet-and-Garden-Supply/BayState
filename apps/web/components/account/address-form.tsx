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
import { Loader2, AlertCircle } from 'lucide-react'

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
                    <div className="p-4 rounded-xl border border-red-100 bg-red-50 text-red-700 flex items-center gap-3 font-medium text-sm">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        {serverError}
                    </div>
                )}

                <div className="space-y-6">
                    <div className="border-l-4 border-primary pl-4">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-900">Delivery Information</h3>
                    </div>
                    
                    <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-semibold text-zinc-700">Full Name</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="John Doe" 
                                        {...field} 
                                        disabled={loading} 
                                        className="rounded-xl border-zinc-200 focus-visible:ring-primary h-11" 
                                    />
                                </FormControl>
                                <FormMessage className="text-xs text-red-600" />
                            </FormItem>
                        )}
                    />

                    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
                        <FormField
                            control={form.control}
                            name="addressLine1"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-semibold text-zinc-700">Address Line 1</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="123 Main St" 
                                            {...field} 
                                            disabled={loading} 
                                            className="rounded-xl border-zinc-200 focus-visible:ring-primary h-11" 
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs text-red-600" />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="addressLine2"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-semibold text-zinc-700">Address Line 2 (Optional)</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="Apt 4B" 
                                            {...field} 
                                            disabled={loading} 
                                            className="rounded-xl border-zinc-200 focus-visible:ring-primary h-11" 
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs text-red-600" />
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
                                    <FormLabel className="text-sm font-semibold text-zinc-700">City</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="Anytown" 
                                            {...field} 
                                            disabled={loading} 
                                            className="rounded-xl border-zinc-200 focus-visible:ring-primary h-11" 
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs text-red-600" />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="state"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-semibold text-zinc-700">State</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="MA" 
                                            {...field} 
                                            disabled={loading} 
                                            className="rounded-xl border-zinc-200 focus-visible:ring-primary h-11" 
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs text-red-600" />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="zipCode"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-sm font-semibold text-zinc-700">Zip Code</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="01234" 
                                            {...field} 
                                            disabled={loading} 
                                            className="rounded-xl border-zinc-200 focus-visible:ring-primary h-11" 
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs text-red-600" />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-semibold text-zinc-700">Phone (Optional)</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="" 
                                        {...field} 
                                        disabled={loading} 
                                        className="rounded-xl border-zinc-200 focus-visible:ring-primary h-11" 
                                    />
                                </FormControl>
                                <FormDescription className="text-xs text-zinc-400">For delivery updates.</FormDescription>
                                <FormMessage className="text-xs text-red-600" />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="isDefault"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 border border-zinc-100 rounded-2xl bg-zinc-50/50 p-4">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        className="h-5 w-5 rounded-md border-zinc-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                    />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel className="text-sm font-medium text-zinc-700">Set as default address</FormLabel>
                                </div>
                            </FormItem>
                        )}
                    />
                </div>

                <div className="pt-4 flex justify-end">
                    <Button 
                        type="submit" 
                        disabled={loading} 
                        size="lg"
                        className="w-full sm:w-auto px-12 rounded-xl font-semibold shadow-sm"
                    >
                        {loading && <Loader2 className="mr-3 h-5 w-5 animate-spin" />}
                        {loading ? "Saving..." : "Save Address"}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
