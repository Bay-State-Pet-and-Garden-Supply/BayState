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
import { CheckCircle2, AlertCircle } from 'lucide-react'

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
        <div className="space-y-8 max-w-2xl">
            {message && (
                <div className={`p-4 rounded-xl border flex items-center gap-3 font-medium text-sm ${
                    message.type === 'success' 
                        ? 'bg-green-50 border-green-100 text-green-700' 
                        : 'bg-red-50 border-red-100 text-red-700'
                    }`}>
                    {message.type === 'success' ? <CheckCircle2 className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
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
                                <FormLabel className="text-sm font-semibold text-zinc-700">Full Name</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="Your Name" 
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
                        name="phone"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-sm font-semibold text-zinc-700">Phone Number</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="(555) 123-4567" 
                                        {...field} 
                                        disabled={loading} 
                                        className="rounded-xl border-zinc-200 focus-visible:ring-primary h-11" 
                                    />
                                </FormControl>
                                <FormMessage className="text-xs text-red-600" />
                            </FormItem>
                        )}
                    />

                    <div className="pt-4">
                        <Button 
                            type="submit" 
                            disabled={loading} 
                            size="lg"
                            className="w-full sm:w-auto px-8 rounded-xl font-semibold shadow-sm"
                        >
                            {loading ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    )
}
