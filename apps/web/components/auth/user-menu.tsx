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
            <Button asChild variant="ghost" size="sm" className="h-10 rounded-full border border-zinc-200 bg-white px-4 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900">
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
                    <div className="hidden lg:flex flex-col items-end text-zinc-500 transition-colors group-hover:text-zinc-900">
                        <span className="mb-1 text-[10px] font-medium tracking-[0.12em] opacity-70 leading-none">Account</span>
                        <span className="text-sm font-medium leading-none">{displayName}</span>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-white text-brand-forest-green shadow-sm transition-all group-hover:shadow-md">
                        {user.user_metadata?.avatar_url ? (
                            <img src={user.user_metadata.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-sm">{initials}</span>
                        )}
                    </div>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-2">
                <DropdownMenuLabel className="px-2 py-2 text-[11px] font-medium tracking-[0.08em] text-zinc-400">
                    Account Dashboard
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-100" />
                
                <DropdownMenuItem asChild className="cursor-pointer py-3 focus:bg-primary/5">
                    <Link href="/account" className="flex w-full items-center gap-2 text-sm font-medium">
                        <UserIcon className="h-4 w-4 text-primary" />
                        My Profile
                    </Link>
                </DropdownMenuItem>

                {isAdmin && (
                    <DropdownMenuItem asChild className="cursor-pointer py-3 focus:bg-red-50">
                        <Link href="/admin" className="flex w-full items-center gap-2 text-sm font-medium text-red-700">
                            <LayoutDashboard className="h-4 w-4" />
                            Admin Panel
                        </Link>
                    </DropdownMenuItem>
                )}

                <DropdownMenuItem asChild className="cursor-pointer py-3 focus:bg-primary/5">
                    <Link href="/account/orders" className="flex w-full items-center gap-2 text-sm font-medium">
                        <Settings className="h-4 w-4 text-primary" />
                        Order History
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-zinc-100" />
                
                <DropdownMenuItem asChild className="cursor-pointer py-3 focus:bg-zinc-100">
                    <form action={signOutAction} className="w-full">
                        <button type="submit" className="flex w-full items-center gap-2 text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-900">
                            <LogOut className="h-4 w-4" />
                            Sign Out
                        </button>
                    </form>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
