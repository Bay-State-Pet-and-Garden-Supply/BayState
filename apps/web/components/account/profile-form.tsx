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
        <div className="space-y-4">
            {message && (
                <div className={`p-4 text-base font-medium rounded-md ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-destructive/10 text-destructive'
                    }`}>
                    {message.text}
                </div>
            )}
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="fullName"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">Full Name</FormLabel>
                                <FormControl>
                                    <Input placeholder="Your Name" {...field} disabled={loading} className="h-12 text-base" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-base">Phone Number</FormLabel>
                                <FormControl>
                                    <Input placeholder="(555) 123-4567" {...field} disabled={loading} className="h-12 text-base" />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="pt-2">
                        <Button type="submit" disabled={loading} className="w-full sm:w-auto h-12 text-base">
                            {loading ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    )
}
