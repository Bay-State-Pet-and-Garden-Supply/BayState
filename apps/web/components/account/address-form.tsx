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
import { Loader2 } from 'lucide-react'

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
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
                {serverError && (
                    <div className="p-4 border border-red-600 bg-red-50 text-red-700 font-medium text-sm rounded-sm">
                        {serverError}
                    </div>
                )}

                <div className="space-y-6">
                    <div className="flex items-center gap-2 pl-3">
                        <h3 className="text-sm font-semibold text-foreground">Delivery Information</h3>
                    </div>

                    <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-medium text-muted-foreground">Full Name</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder="John Doe"
                                        {...field}
                                        disabled={loading}
                                        className="h-12 text-base border border-[oklch(85%_0.03_160)] rounded-sm font-medium focus-visible:ring-0 focus-visible:border-primary transition-all"
                                    />
                                </FormControl>
                                <FormMessage className="text-xs font-medium" />
                            </FormItem>
                        )}
                    />

                    <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
                        <FormField
                            control={form.control}
                            name="addressLine1"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-medium text-muted-foreground">Address Line 1</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="123 Main St"
                                            {...field}
                                            disabled={loading}
                                            className="h-12 text-base border border-[oklch(85%_0.03_160)] rounded-sm font-medium focus-visible:ring-0 focus-visible:border-primary transition-all"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs font-medium" />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="addressLine2"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-medium text-muted-foreground">Address Line 2 (Optional)</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Apt 4B"
                                            {...field}
                                            disabled={loading}
                                            className="h-12 text-base border border-[oklch(85%_0.03_160)] rounded-sm font-medium focus-visible:ring-0 focus-visible:border-primary transition-all"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs font-medium" />
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
                                    <FormLabel className="text-xs font-medium text-muted-foreground">City</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="Anytown"
                                            {...field}
                                            disabled={loading}
                                            className="h-12 text-base border border-[oklch(85%_0.03_160)] rounded-sm font-medium focus-visible:ring-0 focus-visible:border-primary transition-all"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs font-medium" />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="state"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-medium text-muted-foreground">State</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="MA"
                                            {...field}
                                            disabled={loading}
                                            className="h-12 text-base border border-[oklch(85%_0.03_160)] rounded-sm font-medium focus-visible:ring-0 focus-visible:border-primary transition-all"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs font-medium" />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="zipCode"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-medium text-muted-foreground">Zip Code</FormLabel>
                                    <FormControl>
                                        <Input
                                            placeholder="01234"
                                            {...field}
                                            disabled={loading}
                                            className="h-12 text-base border border-[oklch(85%_0.03_160)] rounded-sm font-medium focus-visible:ring-0 focus-visible:border-primary transition-all"
                                        />
                                    </FormControl>
                                    <FormMessage className="text-xs font-medium" />
                                </FormItem>
                            )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-medium text-muted-foreground">Phone (Optional)</FormLabel>
                                <FormControl>
                                    <Input
                                        placeholder=""
                                        {...field}
                                        disabled={loading}
                                        className="h-12 text-base border border-[oklch(85%_0.03_160)] rounded-sm font-medium focus-visible:ring-0 focus-visible:border-primary transition-all"
                                    />
                                </FormControl>
                                <FormDescription className="text-[10px] font-medium text-muted-foreground">For delivery updates.</FormDescription>
                                <FormMessage className="text-xs font-medium" />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="isDefault"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-3 space-y-0 border border-[oklch(85%_0.03_160)] bg-muted p-4 min-h-[64px] rounded-sm">
                                <FormControl>
                                    <Checkbox
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                        className="h-6 w-6 border border-[oklch(85%_0.03_160)] rounded-sm data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                                    />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                    <FormLabel className="text-sm font-medium">Set as default address</FormLabel>
                                </div>
                            </FormItem>
                        )}
                    />
                </div>

                <div className="pt-4 flex justify-end">
                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full sm:w-auto h-14 px-8 text-base font-semibold tracking-wide bg-[oklch(72%_0.14_85)] text-[oklch(25%_0.02_90)] hover:bg-[oklch(65%_0.14_85)]"
                    >
                        {loading && <Loader2 className="mr-3 h-5 w-5 animate-spin" />}
                        {loading ? "Saving..." : "Save Address"}
                    </Button>
                </div>
            </form>
        </Form>
    )
}
