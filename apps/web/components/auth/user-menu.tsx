'use client'

import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { signOutAction } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { User as UserIcon, LayoutDashboard, LogOut } from 'lucide-react'

export function UserMenu({ user, userRole }: { user: User | null; userRole: string | null }) {
    if (!user) {
        return (
            <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/20">
                <Link href="/login" className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    <span>Sign In</span>
                </Link>
            </Button>
        )
    }

    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Member';
    const isAdmin = userRole === 'admin' || userRole === 'staff';

    return (
        <div className="flex items-center gap-1 sm:gap-2">
            <div className="hidden lg:flex flex-col items-end mr-2 text-white/90">
                <span className="text-[10px] uppercase font-bold tracking-tighter opacity-70">Welcome back</span>
                <span className="text-sm font-bold leading-none">{displayName}</span>
            </div>

            {isAdmin && (
                <Button asChild variant="ghost" size="sm" className="text-red-200 hover:bg-white/20 hover:text-red-100">
                    <Link href="/admin" className="flex items-center gap-2">
                        <LayoutDashboard className="h-4 w-4" />
                        <span className="hidden xl:inline">Admin</span>
                    </Link>
                </Button>
            )}

            <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/20">
                <Link href="/account" className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4 hidden sm:inline" />
                    <span>Account</span>
                </Link>
            </Button>

            <form action={signOutAction}>
                <Button variant="ghost" size="icon" type="submit" className="text-white/70 hover:bg-white/20 hover:text-white" title="Sign Out">
                    <LogOut className="h-4 w-4" />
                </Button>
            </form>
        </div>
    )
}
