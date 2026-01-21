'use client'

import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { signOutAction } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { User as UserIcon } from 'lucide-react'

export function UserMenu({ user }: { user: User | null }) {
    if (!user) {
        return (
            <Button asChild variant="ghost" size="sm">
                <Link href="/login" className="hover:underline underline-offset-4">
                    Sign In
                </Link>
            </Button>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/account" className="hover:underline underline-offset-4">Account</Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="sm:hidden" aria-label="Account">
                <Link href="/account"><UserIcon className="h-5 w-5" /></Link>
            </Button>
            <form action={signOutAction}>
                <Button variant="ghost" size="sm" type="submit">
                    Sign Out
                </Button>
            </form>
        </div>
    )
}
