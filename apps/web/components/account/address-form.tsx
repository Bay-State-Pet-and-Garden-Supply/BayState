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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {serverError && (
                    <div className="p-4 text-base font-medium text-destructive bg-destructive/10 rounded-md">
                        {serverError}
                    </div>
                )}
                <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-base">Full Name</FormLabel>
                            <FormControl>
                                <Input placeholder="John Doe" {...field} disabled={loading} className="h-12 text-base" />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                    <FormField
                        control={form.control}
                        name="addressLine1"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">Address Line 1</FormLabel>
                                <FormControl>
                                    <Input placeholder="123 Main St" {...field} disabled={loading} className="h-12 text-base" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="addressLine2"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">Address Line 2 (Optional)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Apt 4B" {...field} disabled={loading} className="h-12 text-base" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                    <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">City</FormLabel>
                                <FormControl>
                                    <Input placeholder="Anytown" {...field} disabled={loading} className="h-12 text-base" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">State</FormLabel>
                                <FormControl>
                                    <Input placeholder="MA" {...field} disabled={loading} className="h-12 text-base" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">Zip Code</FormLabel>
                                <FormControl>
                                    <Input placeholder="01234" {...field} disabled={loading} className="h-12 text-base" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>

                <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel className="text-base">Phone (Optional)</FormLabel>
                            <FormControl>
                                <Input placeholder="" {...field} disabled={loading} className="h-12 text-base" />
                            </FormControl>
                            <FormDescription>For delivery updates.</FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={form.control}
                    name="isDefault"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-4 min-h-[56px]">
                            <FormControl>
                                <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="h-5 w-5"
                                />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                                <FormLabel className="text-base font-medium">Set as default address</FormLabel>
                            </div>
                        </FormItem>
                    )}
                />

                <div className="pt-2 flex justify-end">
                    <Button type="submit" disabled={loading} className="w-full sm:w-auto h-12 text-base">
                        {loading ? "Saving..." : "Save Address"}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
