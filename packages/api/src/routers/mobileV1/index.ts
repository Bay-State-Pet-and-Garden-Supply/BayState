import { t } from '../../trpc'
import { accountRouter } from './account'
import { catalogRouter } from './catalog'
import { checkoutRouter } from './checkout'
import { promotionsRouter } from './promotions'

export const mobileV1Router = t.router({
  catalog: catalogRouter,
  account: accountRouter,
  checkout: checkoutRouter,
  promotions: promotionsRouter,
})
