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
                <div className={`p-4 border-l-4 font-bold text-sm uppercase tracking-widest ${
                    message.type === 'success' 
                        ? 'bg-green-50 border-brand-forest-green text-brand-forest-green' 
                        : 'bg-red-50 border-brand-burgundy text-brand-burgundy'
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
                                <FormLabel className="text-xs font-bold uppercase tracking-widest text-zinc-500">Full Name</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="Your Name" 
                                        {...field} 
                                        disabled={loading} 
                                        className="h-14 text-lg font-bold border border-zinc-200 rounded-md focus-visible:ring-2 focus-visible:ring-brand-forest-green focus-visible:border-transparent transition-all px-6" 
                                    />
                                </FormControl>
                                <FormMessage className="text-xs font-bold uppercase tracking-tight text-brand-burgundy" />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="phone"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel className="text-xs font-bold uppercase tracking-widest text-zinc-500">Phone Number</FormLabel>
                                <FormControl>
                                    <Input 
                                        placeholder="(555) 123-4567" 
                                        {...field} 
                                        disabled={loading} 
                                        className="h-14 text-lg font-bold border border-zinc-200 rounded-md focus-visible:ring-2 focus-visible:ring-brand-forest-green focus-visible:border-transparent transition-all px-6" 
                                    />
                                </FormControl>
                                <FormMessage className="text-xs font-bold uppercase tracking-tight text-brand-burgundy" />
                            </FormItem>
                        )}
                    />

                    <div className="pt-4">
                        <Button 
                            type="submit" 
                            disabled={loading} 
                            className="w-full sm:w-auto h-14 px-12 text-lg font-bold bg-brand-forest-dark hover:bg-brand-forest-green text-white border-b-4 border-black/20 rounded-md shadow-lg active:translate-y-1 active:border-b-0 transition-all font-display uppercase tracking-widest"
                        >
                            {loading ? "Saving..." : "Save Changes"}
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    )

}
