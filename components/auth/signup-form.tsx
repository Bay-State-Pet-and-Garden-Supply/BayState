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
import { signupAction } from "@/lib/auth/actions"

const formSchema = z.object({
    fullName: z.string().min(2, { message: "Full name is required" }),
    email: z.string().email({ message: "Invalid email address" }),
    password: z.string().min(8, { message: "Password must be at least 8 characters" }),
})

export function SignupForm() {
    const [error, setError] = useState<string | null>(null)

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            fullName: "",
            email: "",
            password: "",
        },
    })

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setError(null)
        const result = await signupAction(values)

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
                    name="fullName"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>
                              Full Name <span className="text-destructive" aria-hidden="true">*</span>
                            </FormLabel>
                            <FormControl>
                                <Input 
                                    placeholder="John Doe" 
                                    {...field} 
                                    autoComplete="name"
                                    required
                                    aria-invalid={!!form.formState.errors.fullName}
                                    aria-describedby={form.formState.errors.fullName ? "fullName-error" : undefined}
                                />
                            </FormControl>
                            <FormMessage id="fullName-error" />
                        </FormItem>
                    )}
                />
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
                                    autoComplete="new-password"
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
                    {form.formState.isSubmitting ? "Creating account..." : "Create Account"}
                </Button>
            </form>
        </Form>
    )
}
