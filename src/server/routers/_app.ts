import 'server-only'
import { router } from '../trpc'
import { ibgeRouter } from './ibge'

export const appRouter = router({
  ibge: ibgeRouter,
})

export type AppRouter = typeof appRouter
