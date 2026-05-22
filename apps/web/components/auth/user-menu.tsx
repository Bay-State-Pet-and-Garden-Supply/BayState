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

export function UserMenu({ user }: { user: User | null }) {
    if (!user) {
        return (
            <Button asChild variant="ghost" size="sm" className="h-10 border border-white/20 px-4 text-xs font-semibold uppercase tracking-wider text-white hover:bg-white/20 rounded-sm">
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
    
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 group outline-none focus:outline-none">
                    <div className="hidden lg:flex flex-col items-end text-white/90 group-hover:text-white transition-colors">
                        <span className="text-[10px] font-semibold tracking-[0.1em] opacity-70 leading-none mb-1 uppercase">Account</span>
                        <span className="text-sm font-bold leading-none tracking-tight">{displayName}</span>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold border-2 border-brand-forest-green shadow-sm group-hover:shadow-sm group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all overflow-hidden">
                        {user.user_metadata?.avatar_url ? (
                            <img src={user.user_metadata.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-sm">{initials}</span>
                        )}
                    </div>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2 rounded-lg border border-zinc-200 shadow-md">
                <DropdownMenuLabel className="px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Account Dashboard
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-100" />
                
                <DropdownMenuItem asChild className="cursor-pointer py-2.5 rounded-md focus:bg-zinc-50 focus:text-zinc-950">
                    <Link href="/account" className="flex w-full items-center gap-2 text-sm font-medium text-zinc-700">
                        <UserIcon className="h-4 w-4 text-zinc-400" />
                        My Profile
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuItem asChild className="cursor-pointer py-2.5 rounded-md focus:bg-zinc-50 focus:text-zinc-950">
                    <Link href="/account/orders" className="flex w-full items-center gap-2 text-sm font-medium text-zinc-700">
                        <Settings className="h-4 w-4 text-zinc-400" />
                        Order History
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-zinc-100" />
                
                <DropdownMenuItem asChild className="cursor-pointer py-2.5 rounded-md focus:bg-zinc-50 focus:text-zinc-950">
                    <form action={signOutAction} className="w-full">
                        <button type="submit" className="flex w-full items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                            <LogOut className="h-4 w-4 text-zinc-400" />
                            Sign Out
                        </button>
                    </form>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
