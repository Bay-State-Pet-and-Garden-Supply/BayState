'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, Home, RefreshCw } from 'lucide-react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 rounded-full bg-red-50 p-4 ring-1 ring-red-100">
        <AlertCircle className="h-10 w-10 text-red-600" />
      </div>
      
      <h2 className="mb-3 text-3xl font-bold tracking-tight text-foreground">
        Something went wrong
      </h2>
      
      <p className="mb-8 max-w-[500px] text-muted-foreground leading-relaxed">
        We encountered an unexpected error. Please try again, or return to the homepage if the problem persists.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={() => reset()} size="lg" className="gap-2 font-medium">
          <RefreshCw className="h-4 w-4" />
          Try Again
        </Button>
        
        <Button asChild variant="outline" size="lg" className="gap-2">
          <Link href="/" className="hover:underline underline-offset-4">
            <Home className="h-4 w-4" />
            Go Home
          </Link>
        </Button>
      </div>

      {error.digest && (
        <p className="mt-12 font-mono text-xs text-muted-foreground/50">
          Error ID: {error.digest}
        </p>
      )}
    </div>
  )
}
