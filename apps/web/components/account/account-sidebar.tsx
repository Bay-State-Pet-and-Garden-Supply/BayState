'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { User, MapPin, Heart, Package, LayoutDashboard, LogOut, Dog, RefreshCw } from 'lucide-react'
import { signOutAction } from '@/lib/auth/actions'

const items = [
    { href: '/account', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/account/profile', label: 'Profile', icon: User },
    { href: '/account/pets', label: 'My Pets', icon: Dog },
    { href: '/account/addresses', label: 'Addresses', icon: MapPin },
    { href: '/account/orders', label: 'Orders', icon: Package },
    { href: '/account/wishlist', label: 'Wishlist', icon: Heart },
]

export function AccountSidebar() {
    const pathname = usePathname()

    return (
        <nav className="flex flex-row overflow-x-auto md:flex-col border-b-4 md:border-b-0 md:border-l-4 border-zinc-900 pb-2 md:pb-0 scrollbar-hide">
            {items.map((item) => {
                const isActive = pathname === item.href
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 text-xs font-black uppercase tracking-widest transition-all flex-shrink-0",
                            isActive 
                                ? "bg-zinc-900 text-white md:-ml-1 md:border-l-8 md:border-primary" 
                                : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50",
                            "min-h-[48px]"
                        )}
                    >
                        <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-zinc-400")} />
                        {item.label}
                    </Link>
                )
            })}
            <form action={signOutAction} className="flex-shrink-0 md:mt-8">
                <button 
                    type="submit" 
                    className="flex w-full items-center gap-3 px-4 py-3 text-xs font-black uppercase tracking-widest text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap min-h-[48px] border-t-2 md:border-t-4 border-zinc-100 md:border-zinc-900"
                >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                </button>
            </form>
        </nav>
    )

}
