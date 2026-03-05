'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { resetPassword } from '@/lib/auth/actions'

const formSchema = z.object({
    email: z.string().email({ message: "Invalid email address." }),
})

export function ForgotPasswordForm() {
    const [serverError, setServerError] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [loading, setLoading] = useState(false)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true)
        setServerError(null)
        setSuccess(false)

        try {
            const result = await resetPassword(values.email)
            if (result.error) {
                setServerError(result.error)
            } else {
                setSuccess(true)
            }
        } catch {
            setServerError("An unexpected error occurred.")
        } finally {
            setLoading(false)
        }
    }

    if (success) {
        return (
            <div className="text-center space-y-4">
                <h3 className="text-lg font-medium text-green-600">Check your email</h3>
                <p className="text-sm text-muted-foreground">
                    If an account exists for <strong>{form.getValues('email')}</strong>, we have sent a password reset link.
                </p>
                <Button variant="outline" onClick={() => setSuccess(false)}>Send another link</Button>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {serverError && (
                <div className="p-3 text-sm font-medium text-destructive bg-destructive/10 rounded-md">
                    {serverError}
                </div>
            )}
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                    <Input placeholder="you@example.com" {...field} disabled={loading} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading ? "Sending..." : "Send Reset Link"}
                    </Button>
                </form>
            </Form>
        </div>
    )
}
