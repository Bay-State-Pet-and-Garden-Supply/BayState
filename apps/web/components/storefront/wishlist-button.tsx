'use client'

import { Heart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toggleWishlistAction } from '@/lib/account/actions'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export function WishlistButton({ productId, initialState = false }: { productId: string, initialState?: boolean }) {
    const [active, setActive] = useState(initialState)

    async function onClick(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()

        // Optimistic update
        const newState = !active
        setActive(newState)

        try {
            // Note: Action toggles based on DB state, so if sync is off, it might flip wrong way?
            // Best to verify action response 'added' or 'removed'.
            const res = await toggleWishlistAction(productId)

            if (res.error) {
                setActive(!newState) // Revert
                console.error(res.error)
            } else {
                // Sync precise state if action returns it
                if (res.action === 'added') setActive(true)
                if (res.action === 'removed') setActive(false)
            }
        } catch {
            setActive(!newState)
        }
    }

    return (
        <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-full bg-white shadow-sm hover:bg-zinc-100 hover:scale-110 transition-all"
            onClick={onClick}
        >
            <Heart className={cn("h-5 w-5 transition-colors", active ? "fill-red-500 text-red-500" : "text-zinc-700")} />
            <span className="sr-only">Wishlist</span>
        </Button>
    )
}
