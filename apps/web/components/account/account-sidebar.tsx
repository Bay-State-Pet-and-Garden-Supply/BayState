'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { User, MapPin, Heart, Package, LayoutDashboard, LogOut, Dog } from 'lucide-react'
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
        <nav className="flex flex-row overflow-x-auto md:flex-col border-b md:border-b-0 md:border-l-4 border-zinc-200 pb-2 md:pb-0 scrollbar-hide">
            {items.map((item) => {
                const isActive = pathname === item.href
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 text-sm font-semibold transition-all flex-shrink-0",
                            isActive 
                                 ? "bg-brand-forest-dark text-white md:-ml-1 md:border-l-4 md:border-brand-burgundy" 
                                 : "text-zinc-600 hover:text-brand-forest-green hover:bg-zinc-50",
                            "min-h-[48px]"
                        )}
                    >
                        <item.icon className={cn("h-4 w-4", isActive ? "text-white" : "text-zinc-400")} />
                        {item.label}
                    </Link>
                )
            })}
            <form action={signOutAction} className="flex-shrink-0 md:mt-8">
                <button 
                    type="submit" 
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm font-semibold text-brand-burgundy hover:bg-zinc-50 transition-colors whitespace-nowrap min-h-[48px] border-t border-zinc-100 md:border-t-0"
                >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                </button>
            </form>
        </nav>
    )

}
