import { PropsWithChildren, useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { trpc, trpcClient, queryClient } from '../lib/trpc'

export function AppProvider({ children }: PropsWithChildren) {
  const [client] = useState(() => trpcClient)
  const [queries] = useState(() => queryClient)

  return (
    <trpc.Provider client={client} queryClient={queries}>
      <QueryClientProvider client={queries}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
