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
    { href: '/account/favorites', label: 'Favorites', icon: Heart },
]

export function AccountSidebar() {
    const pathname = usePathname()

    return (
        <nav className="flex flex-row overflow-x-auto md:flex-col border-b border-zinc-200 md:border-b-0 scrollbar-hide bg-white rounded-2xl md:shadow-sm overflow-hidden">
            {items.map((item) => {
                const isActive = pathname === item.href
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            "flex items-center gap-3 px-6 py-4 text-sm font-medium transition-all flex-shrink-0",
                            isActive 
                                 ? "bg-primary/5 text-primary border-b-2 border-primary md:border-b-0 md:border-l-4" 
                                 : "text-zinc-600 hover:text-primary hover:bg-zinc-50 border-b-2 border-transparent md:border-b-0",
                            "min-h-[56px]"
                        )}
                    >
                        <item.icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-zinc-400")} />
                        <span className="font-body">{item.label}</span>
                    </Link>
                )
            })}
            <form action={signOutAction} className="flex-shrink-0 md:mt-4">
                <button 
                    type="submit" 
                    className="flex w-full items-center gap-3 px-6 py-4 text-sm font-medium text-zinc-500 hover:bg-red-50 hover:text-red-600 transition-all whitespace-nowrap min-h-[56px] border-t border-zinc-100 md:border-t-0 font-body"
                >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                </button>
            </form>
        </nav>
    )
}
