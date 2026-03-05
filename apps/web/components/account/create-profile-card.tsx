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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Complete Your Profile
        </CardTitle>
        <CardDescription>
          We need to set up your profile to continue. This only takes a moment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <p><span className="font-medium">Email:</span> {userEmail}</p>
          {userName && <p><span className="font-medium">Name:</span> {userName}</p>}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <Button 
          onClick={handleCreateProfile} 
          disabled={isPending}
          className="w-full"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating Profile...
            </>
          ) : (
            'Create My Profile'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
