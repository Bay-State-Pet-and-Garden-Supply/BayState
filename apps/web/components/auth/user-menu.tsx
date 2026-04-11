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
            <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/20 rounded-none border border-white/20 px-4 h-10 font-bold uppercase tracking-wider text-xs">
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
                        <span className="text-[10px] uppercase font-black tracking-[0.1em] opacity-70 leading-none mb-1">Account</span>
                        <span className="text-sm font-bold leading-none tracking-tight">{displayName}</span>
                    </div>
                    <div className="h-10 w-10 rounded-full bg-accent text-secondary flex items-center justify-center font-black border-2 border-primary shadow-[2px_2px_0px_rgba(0,0,0,0.2)] group-hover:shadow-[4px_4px_0px_rgba(0,0,0,0.2)] group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 transition-all overflow-hidden">
                        {user.user_metadata?.avatar_url ? (
                            <img src={user.user_metadata.avatar_url} alt={displayName} className="h-full w-full object-cover" />
                        ) : (
                            <span className="text-sm">{initials}</span>
                        )}
                    </div>
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-none border-2 border-zinc-900 shadow-[8px_8px_0px_rgba(0,0,0,0.1)] p-2">
                <DropdownMenuLabel className="font-black uppercase tracking-widest text-[10px] text-zinc-400 py-2 px-2">
                    Account Dashboard
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-zinc-100" />
                
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-primary/5 rounded-none py-3">
                    <Link href="/account" className="flex w-full items-center gap-2 font-bold uppercase tracking-tight text-sm">
                        <UserIcon className="h-4 w-4 text-primary" />
                        My Profile
                    </Link>
                </DropdownMenuItem>

                {isAdmin && (
                    <DropdownMenuItem asChild className="cursor-pointer focus:bg-red-50 rounded-none py-3">
                        <Link href="/admin" className="flex w-full items-center gap-2 font-bold uppercase tracking-tight text-sm text-red-700">
                            <LayoutDashboard className="h-4 w-4" />
                            Admin Panel
                        </Link>
                    </DropdownMenuItem>
                )}

                <DropdownMenuItem asChild className="cursor-pointer focus:bg-primary/5 rounded-none py-3">
                    <Link href="/account/orders" className="flex w-full items-center gap-2 font-bold uppercase tracking-tight text-sm">
                        <Settings className="h-4 w-4 text-primary" />
                        Order History
                    </Link>
                </DropdownMenuItem>

                <DropdownMenuSeparator className="bg-zinc-100" />
                
                <DropdownMenuItem asChild className="cursor-pointer focus:bg-zinc-100 rounded-none py-3">
                    <form action={signOutAction} className="w-full">
                        <button type="submit" className="flex w-full items-center gap-2 font-black uppercase tracking-widest text-[10px] text-zinc-500 hover:text-zinc-900 transition-colors">
                            <LogOut className="h-4 w-4" />
                            Sign Out
                        </button>
                    </form>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
