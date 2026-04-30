import { initTRPC, TRPCError } from '@trpc/server'
import type { MobileApiContext } from './types'

const t = initTRPC.context<MobileApiContext>().create()

const publicProcedure = t.procedure

const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' })
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  })
})

export { t, publicProcedure, protectedProcedure }
