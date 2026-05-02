'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw, Home, AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ProductsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Products page error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mb-6 rounded-full bg-red-50 p-4 ring-1 ring-red-100">
        <AlertCircle className="h-10 w-10 text-red-600" />
      </div>
      
      <h2 className="mb-3 text-2xl font-bold tracking-tight text-foreground">
        Product Loading Error
      </h2>
      
      <p className="mb-8 max-w-[450px] text-muted-foreground leading-relaxed">
        We had trouble displaying the catalog. Please check your connection or try reloading.
      </p>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button onClick={reset} size="lg" className="gap-2 font-medium">
          <RefreshCw className="h-4 w-4" />
          Reload Catalog
        </Button>
        
        <Button variant="outline" size="lg" asChild className="gap-2">
          <Link href="/">
            <Home className="h-4 w-4" />
            Go Home
          </Link>
        </Button>
      </div>
      
      {error.digest && (
        <p className="mt-12 font-mono text-xs text-muted-foreground/40">
          Ref: {error.digest}
        </p>
      )}
    </div>
  )
}
