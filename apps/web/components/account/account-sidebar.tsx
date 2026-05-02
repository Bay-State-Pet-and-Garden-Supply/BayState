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
        <nav className="flex flex-row overflow-x-auto md:flex-col border-b md:border-b-0 md:border-l border-[oklch(85%_0.03_160)] pb-2 md:pb-0 scrollbar-hide bg-card rounded-sm">
            {items.map((item) => {
                const isActive = pathname === item.href
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors flex-shrink-0",
                            isActive
                                ? "bg-[oklch(72%_0.14_85)] text-[oklch(25%_0.02_90)] font-semibold"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted",
                            "min-h-[48px]"
                        )}
                    >
                        <item.icon className={cn("h-4 w-4", isActive ? "text-[oklch(25%_0.02_90)]" : "text-muted-foreground")} />
                        {item.label}
                    </Link>
                )
            })}
            <form action={signOutAction} className="flex-shrink-0 md:mt-2">
                <button
                    type="submit"
                    className="flex w-full items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap min-h-[48px] border-t border-[oklch(90%_0.02_160)]"
                >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                </button>
            </form>
        </nav>
    )

}
