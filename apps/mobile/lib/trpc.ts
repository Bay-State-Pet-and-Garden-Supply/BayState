import { QueryClient } from '@tanstack/react-query'
import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@baystate/api'
import { supabase } from './supabase'

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000'

export const trpc = createTRPCReact<AppRouter>()

export const queryClient = new QueryClient()

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${apiBaseUrl}/api/trpc`,
      async headers() {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session?.access_token) {
          return {}
        }

        return {
          Authorization: `Bearer ${session.access_token}`,
        }
      },
    }),
  ],
})
