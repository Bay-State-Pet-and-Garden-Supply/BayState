'use client'

import { Input } from "@/components/ui/input"
import { useRouter, useSearchParams } from "next/navigation"

export function UserSearch() {
    const router = useRouter()
    const searchParams = useSearchParams()

    function handleSearch(term: string) {
        const params = new URLSearchParams(searchParams)
        if (term) {
            params.set('q', term)
        } else {
            params.delete('q')
        }
        params.set('page', '1')
        router.replace(`?${params.toString()}`)
    }

    return (
        <Input
            placeholder="Search users..."
            defaultValue={searchParams.get('q')?.toString()}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    handleSearch(e.currentTarget.value)
                }
            }}
            className="max-w-sm"
        />
    )
}
