'use client'

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"

import { Button } from "@/components/ui/button"
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { useSearchParams } from "next/navigation"
import { loginAction } from "@/lib/auth/actions"

const formSchema = z.object({
    email: z.string().email({ message: "Invalid email address" }),
    password: z.string().min(1, { message: "Password is required" }),
})

export function LoginForm() {
    const searchParams = useSearchParams()
    const next = searchParams.get('next') || undefined
    const urlError = searchParams.get('error')
    const urlMessage = searchParams.get('message')

    const [error, setError] = useState<string | null>(urlError ? urlMessage || "Authentication error" : null)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setError(null)
        const result = await loginAction(values, next)

        if (result?.error) {
            setError(result.error)
        }
    }

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {error && (
                    <div 
                        role="alert" 
                        aria-live="polite" 
                        className="p-3 text-sm text-destructive bg-destructive/10 rounded-md"
                    >
                        {error}
                    </div>
                )}
                <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                              Email <span className="text-destructive" aria-hidden="true">*</span>
                            </FormLabel>
                            <FormControl>
                                <Input 
                                    placeholder="name@example.com" 
                                    {...field} 
                                    autoComplete="email"
                                    required
                                    aria-invalid={!!form.formState.errors.email}
                                    aria-describedby={form.formState.errors.email ? "email-error" : undefined}
                                />
                            </FormControl>
                            <FormMessage id="email-error" />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                              Password <span className="text-destructive" aria-hidden="true">*</span>
                            </FormLabel>
                            <FormControl>
                                <Input 
                                    type="password" 
                                    {...field} 
                                    autoComplete="current-password"
                                    required
                                    aria-invalid={!!form.formState.errors.password}
                                    aria-describedby={form.formState.errors.password ? "password-error" : undefined}
                                />
                            </FormControl>
                            <FormMessage id="password-error" />
                        </FormItem>
                    )}
                />
                <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting ? "Signing in..." : "Sign In"}
                </Button>
            </form>
        </Form>
    )
}
