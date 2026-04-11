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
    <div className="border-4 border-zinc-900 bg-white shadow-[8px_8px_0px_rgba(0,0,0,1)]">
      <div className="bg-zinc-900 p-4 border-b-4 border-zinc-900 text-white flex items-center gap-3">
        <UserPlus className="h-6 w-6 text-accent" />
        <div className="flex flex-col">
            <h2 className="text-2xl font-black uppercase tracking-tight font-display">Complete Your Profile</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">We need to set up your profile to continue.</p>
        </div>
      </div>
      <div className="p-8 space-y-6">
        <div className="space-y-3 bg-zinc-50 border-2 border-zinc-100 p-4">
          <p className="text-xs font-black uppercase tracking-widest text-zinc-500">ACCOUNT DETAILS</p>
          <div className="grid gap-2">
            <p className="text-sm font-bold"><span className="uppercase text-zinc-400 mr-2 text-[10px]">Email:</span> {userEmail}</p>
            {userName && <p className="text-sm font-bold"><span className="uppercase text-zinc-400 mr-2 text-[10px]">Name:</span> {userName}</p>}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 border-2 border-red-600 bg-red-50 text-red-700 font-black uppercase tracking-tight text-xs">
            <AlertCircle className="h-5 w-5" />
            {error}
          </div>
        )}

        <Button 
          onClick={handleCreateProfile} 
          disabled={isPending}
          className="w-full h-14 text-lg font-black uppercase tracking-widest border-b-4 border-black/20 rounded-none shadow-lg active:translate-y-1 active:border-b-0 transition-all"
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
