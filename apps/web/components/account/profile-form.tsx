'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { updateProfileAction } from '@/lib/account/actions'
import { Profile } from '@/lib/auth/roles'

const formSchema = z.object({
    fullName: z.string().min(2, "Name must be at least 2 characters").max(100),
    phone: z.string().optional(),
})

export function ProfileForm({ profile }: { profile: Profile }) {
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            fullName: profile.full_name || '',
            phone: profile.phone || '',
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)
        setMessage(null)

        try {
            const result = await updateProfileAction(values)
            if (result.error) {
                setMessage({ type: 'error', text: result.error })
            } else {
                setMessage({ type: 'success', text: 'Profile updated successfully' })
            }
        } catch {
            setMessage({ type: 'error', text: 'An unexpected error occurred.' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            {message && (
                <div className={`p-4 border font-semibold tracking-wide text-sm rounded-sm ${
                    message.type === 'success' 
                        ? 'bg-green-50 border-green-600 text-green-700' 
                        : 'bg-red-50 border-red-600 text-red-700'
                    }`}>
                    {message.text}
                </div>
            )}
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-medium tracking-wide text-muted-foreground">Full Name</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="Your Name" 
                                        {...field} 
                                        disabled={loading} 
                                        className="h-14 text-lg font-semibold border border-[oklch(85%_0.03_160)] rounded-sm focus-visible:ring-0 focus-visible:border-primary transition-all" 
                                    />
                                </FormControl>
                                <FormMessage className="text-sm font-medium" />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-medium tracking-wide text-muted-foreground">Phone Number</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="(555) 123-4567" 
                                        {...field} 
                                        disabled={loading} 
                                        className="h-14 text-lg font-semibold border border-[oklch(85%_0.03_160)] rounded-sm focus-visible:ring-0 focus-visible:border-primary transition-all" 
                                    />
                                </FormControl>
                                <FormMessage className="text-sm font-medium" />
                            </FormItem>
                        )}
                    />

                    <div className="pt-4">
                        <Button 
                            type="submit" 
                            disabled={loading} 
                            className="w-full sm:w-auto h-14 px-10 text-lg font-semibold tracking-wide rounded-sm shadow-sm bg-[oklch(72%_0.14_85)] text-[oklch(25%_0.02_90)] hover:bg-[oklch(65%_0.14_85)]"
                        >
                            {loading ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    )

}
