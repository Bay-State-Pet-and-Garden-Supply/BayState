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
    { href: '/account/autoship', label: 'Autoship', icon: RefreshCw },
    { href: '/account/addresses', label: 'Addresses', icon: MapPin },
    { href: '/account/orders', label: 'Orders', icon: Package },
    { href: '/account/wishlist', label: 'Wishlist', icon: Heart },
]

export function AccountSidebar() {
    const pathname = usePathname()

    return (
        <nav className="flex flex-row overflow-x-auto md:flex-col space-x-2 md:space-x-0 md:space-y-1 pb-2 md:pb-0 scrollbar-hide">
            {items.map((item) => {
                const isActive = pathname === item.href
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-colors flex-shrink-0",
                            isActive ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:text-zinc-900",
                            // Mobile specific adjustments for touch targets
                            "min-h-[44px]"
                        )}
                    >
                        <item.icon className={cn("h-4 w-4", isActive ? "text-zinc-900" : "text-zinc-500")} />
                        {item.label}
                    </Link>
                )
            })}
            <form action={signOutAction} className="flex-shrink-0 md:pt-4 md:mt-4 md:border-t">
                <button type="submit" className="flex w-full items-center gap-3 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors whitespace-nowrap min-h-[44px]">
                    <LogOut className="h-4 w-4" />
                    Sign Out
                </button>
            </form>
        </nav>
    )
}
