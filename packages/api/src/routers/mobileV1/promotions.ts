import { promoValidateInputSchema } from '../../schemas'
import { publicProcedure, t } from '../../trpc'

export const promotionsRouter = t.router({
  validate: publicProcedure.input(promoValidateInputSchema).query(async ({ ctx, input }) => {
    const result = await ctx.services.promotions.validate({
      code: input.code,
      subtotal: input.subtotal,
      userId: ctx.user?.id ?? null,
      email: input.email,
    })

    if (!result.valid) {
      return {
        valid: false,
        error: result.error ?? 'Invalid promo code',
      }
    }

    return {
      valid: true,
      code: result.promo?.code ?? input.code,
      promoCodeId: result.promo?.id ?? null,
      discount: result.discount ?? 0,
      discountType: result.discountType ?? null,
      description: result.promo?.description ?? null,
    }
  }),
})
