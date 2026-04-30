import { t } from '../trpc'
import { mobileV1Router } from './mobileV1'

export const appRouter = t.router({
  mobileV1: mobileV1Router,
})

export type AppRouter = typeof appRouter
