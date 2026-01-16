'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCcw, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AdminError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Admin page error:', error)
  }, [error])

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 rounded-full bg-amber-100 p-3">
        <AlertTriangle className="h-8 w-8 text-amber-600" />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-zinc-900">
        Admin Error
      </h2>
      <p className="mb-6 max-w-md text-zinc-600">
        An error occurred while loading this admin page. 
        If this persists, please contact support.
      </p>
      <div className="flex gap-4">
        <Button onClick={reset} variant="default">
          <RefreshCcw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/admin">
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </Link>
        </Button>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-zinc-500">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
