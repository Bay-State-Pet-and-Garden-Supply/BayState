'use client'

import { Button } from '@/components/ui/button'
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
    <div className="border border-zinc-200 bg-white rounded-2xl shadow-sm overflow-hidden max-w-2xl mx-auto">
      <div className="p-6 border-b border-zinc-100 flex items-center gap-4 bg-zinc-50/50">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <UserPlus className="h-6 w-6 text-primary" />
        </div>
        <div className="flex flex-col">
            <h2 className="text-xl font-bold font-display text-zinc-900">Complete Your Profile</h2>
            <p className="text-sm text-zinc-500 font-body">We need to set up your profile to continue.</p>
        </div>
      </div>
      <div className="p-8 space-y-8">
        <div className="space-y-4 bg-zinc-50/50 rounded-xl border border-zinc-100 p-6">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Account Details</p>
          <div className="grid gap-3">
            <div className="flex items-center">
                <span className="text-sm text-zinc-400 w-20">Email:</span>
                <span className="text-sm font-medium text-zinc-900">{userEmail}</span>
            </div>
            {userName && (
                <div className="flex items-center">
                    <span className="text-sm text-zinc-400 w-20">Name:</span>
                    <span className="text-sm font-medium text-zinc-900">{userName}</span>
                </div>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-red-100 bg-red-50 text-red-700 font-medium text-sm">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        <Button 
          onClick={handleCreateProfile} 
          disabled={isPending}
          size="lg"
          className="w-full rounded-xl font-semibold shadow-sm"
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
