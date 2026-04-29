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
        <nav className="storefront-panel flex flex-row gap-1 overflow-x-auto p-2 scrollbar-hide md:flex-col">
            {items.map((item) => {
                const isActive = pathname === item.href
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex min-h-[48px] flex-shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                            isActive 
                                ? "bg-primary text-white shadow-sm" 
                                : "text-zinc-600 hover:bg-white hover:text-zinc-900"
                        )}
                    >
                        <item.icon className={cn("h-4 w-4", isActive ? "text-white" : "text-zinc-400")} />
                        {item.label}
                    </Link>
                )
            })}
            <form action={signOutAction} className="flex-shrink-0 md:mt-4">
                <button 
                    type="submit" 
                    className="flex min-h-[48px] w-full items-center gap-3 whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                </button>
            </form>
        </nav>
    )

}
