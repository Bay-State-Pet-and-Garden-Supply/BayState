'use client'

import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { signOutAction } from '@/lib/auth/actions'
import { Button } from '@/components/ui/button'
import { User as UserIcon, LayoutDashboard, LogOut, Settings } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu({ user, userRole }: { user: User | null; userRole: string | null }) {
    if (!user) {
        return (
            <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10 rounded-sm border border-white/20 px-4 h-10 font-medium tracking-wide text-xs">
                <Link href="/login" className="flex items-center gap-2">
                    <UserIcon className="h-4 w-4" />
                    <span>Sign In</span>
                </Link>
            </Button>
        )
    }

    const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Member';
    const initials = displayName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    
    const isAdmin = userRole === 'admin' || userRole === 'staff';

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 group outline-none focus:outline-none">
                    <div className="hidden lg:flex flex-col items-end text-white/90 group-hover:text-white transition-colors">
                        <span className="text-[10px] font-medium tracking-wide opacity-70 leading-none mb-1">Account</span>
                        <span className="text-sm font-semibold leading-none">{displayName}</span>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-primary-foreground text-primary flex items-center justify-center font-bold border border-white/30 shadow-sm transition-all overflow-hidden">
                        {user.user_metadata?.avatar_url ? (
                            <img src={user.user_metadata.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-sm">{initials}</span>
                        )}
                    </div>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-sm border border-[oklch(85%_0.03_160)] shadow-md p-2">
                <DropdownMenuLabel className="font-medium tracking-wide text-[10px] text-muted-foreground py-2 px-2">
                    Account Dashboard
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[oklch(90%_0.02_160)]" />

                <DropdownMenuItem asChild className="cursor-pointer rounded-sm py-3">
                    <Link href="/account" className="flex w-full items-center gap-2 font-semibold text-sm">
                        <UserIcon className="h-4 w-4 text-primary" />
                        My Profile
                    </Link>
                </DropdownMenuItem>

                {isAdmin && (
                    <DropdownMenuItem asChild className="cursor-pointer rounded-sm py-3">
                        <Link href="/admin" className="flex w-full items-center gap-2 font-semibold text-sm text-red-700">
                            <LayoutDashboard className="h-4 w-4" />
                            Admin Panel
                        </Link>
                    </DropdownMenuItem>
                )}

                <DropdownMenuItem asChild className="cursor-pointer rounded-sm py-3">
                    <Link href="/account/orders" className="flex w-full items-center gap-2 font-semibold text-sm">
                        <Settings className="h-4 w-4 text-primary" />
                        Order History
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-[oklch(90%_0.02_160)]" />

                <DropdownMenuItem asChild className="cursor-pointer rounded-sm py-3">
                    <form action={signOutAction} className="w-full">
                        <button type="submit" className="flex w-full items-center gap-2 font-medium text-[10px] text-muted-foreground">
                            <LogOut className="h-4 w-4" />
                            Sign Out
                        </button>
                    </form>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
