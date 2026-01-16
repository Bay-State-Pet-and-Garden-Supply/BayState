'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCcw, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AccountError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Account page error:', error)
  }, [error])

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-4 rounded-full bg-red-100 p-3">
        <AlertCircle className="h-8 w-8 text-red-600" />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-zinc-900">
        Account Error
      </h2>
      <p className="mb-6 max-w-md text-zinc-600">
        We had trouble loading your account information. Please try again.
      </p>
      <div className="flex gap-4">
        <Button onClick={reset} variant="default">
          <RefreshCcw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Store
          </Link>
        </Button>
      </div>
      {error.digest && (
        <p className="mt-4 text-xs text-zinc-600">Error ID: {error.digest}</p>
      )}
    </div>
  )
}
