'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createMissingProfileAction } from '@/lib/account/actions'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { AlertCircle, Loader2, UserPlus } from 'lucide-react'

interface CreateProfileCardProps {
  userEmail: string;
  userName?: string;
}

export function CreateProfileCard({ userEmail, userName }: CreateProfileCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleCreateProfile = () => {
    setError(null)
    startTransition(async () => {
      const result = await createMissingProfileAction()
      if (result.error) {
        setError(result.error)
      } else {
        // Refresh the page to show the newly created profile
        router.refresh()
      }
    })
  }

  return (
    <div className="border border-[oklch(85%_0.03_160)] bg-card shadow-md rounded-sm">
      <div className="bg-[oklch(25%_0.02_90)] p-4 border-b border-[oklch(85%_0.03_160)] text-white flex items-center gap-3">
        <UserPlus className="h-6 w-6 text-[oklch(72%_0.14_85)]" />
        <div className="flex flex-col">
            <h2 className="text-2xl font-bold tracking-tight font-display">Complete Your Profile</h2>
            <p className="text-xs font-medium tracking-wide text-white/70">We need to set up your profile to continue.</p>
        </div>
      </div>
      <div className="p-8 space-y-6">
        <div className="space-y-3 bg-muted border border-[oklch(90%_0.02_160)] p-4">
          <p className="text-xs font-semibold text-muted-foreground">ACCOUNT DETAILS</p>
          <div className="grid gap-2">
            <p className="text-sm font-semibold"><span className="text-muted-foreground mr-2 text-[10px]">Email:</span> {userEmail}</p>
            {userName && <p className="text-sm font-semibold"><span className="text-muted-foreground mr-2 text-[10px]">Name:</span> {userName}</p>}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 border border-red-600 bg-red-50 text-red-700 font-medium text-sm rounded-sm">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        <Button
          onClick={handleCreateProfile}
          disabled={isPending}
          className="w-full h-14 text-lg font-semibold tracking-wide bg-[oklch(72%_0.14_85)] text-[oklch(25%_0.02_90)] hover:bg-[oklch(65%_0.14_85)]"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Creating Profile...
            </>
          ) : (
            'Create My Profile'
          )}
        </Button>
      </div>
    </div>
  )

}
