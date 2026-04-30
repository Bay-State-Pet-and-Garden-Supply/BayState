import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@baystate/api'
import { createTRPCContext } from '@/lib/mobile-api/context'

const endpoint = '/api/trpc'

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint,
    req,
    router: appRouter,
    createContext: () => createTRPCContext(req),
  })

export { handler as GET, handler as POST }
