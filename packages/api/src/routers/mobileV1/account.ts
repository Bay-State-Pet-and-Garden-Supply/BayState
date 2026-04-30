import { TRPCError } from '@trpc/server'
import { idInputSchema, addressCreateInputSchema, profileUpdateInputSchema, productIdInputSchema, paginationSchema } from '../../schemas'
import { protectedProcedure, t } from '../../trpc'

export const accountRouter = t.router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const profile = await ctx.services.account.getProfile(ctx.user.id)
    return { profile }
  }),

  updateProfile: protectedProcedure.input(profileUpdateInputSchema).mutation(async ({ ctx, input }) => {
    const success = await ctx.services.account.updateProfile(ctx.user.id, input)
    if (!success) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update profile' })
    }

    return { success: true }
  }),

  listAddresses: protectedProcedure.query(async ({ ctx }) => {
    const addresses = await ctx.services.account.listAddresses(ctx.user.id)
    return { addresses }
  }),

  createAddress: protectedProcedure.input(addressCreateInputSchema).mutation(async ({ ctx, input }) => {
    const address = await ctx.services.account.createAddress(ctx.user.id, input)
    if (!address) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create address' })
    }

    return { address }
  }),

  deleteAddress: protectedProcedure.input(idInputSchema).mutation(async ({ ctx, input }) => {
    const success = await ctx.services.account.deleteAddress(ctx.user.id, input.id)
    if (!success) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete address' })
    }

    return { success: true }
  }),

  setDefaultAddress: protectedProcedure.input(idInputSchema).mutation(async ({ ctx, input }) => {
    const success = await ctx.services.account.setDefaultAddress(ctx.user.id, input.id)
    if (!success) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to set default address' })
    }

    return { success: true }
  }),

  listWishlist: protectedProcedure.query(async ({ ctx }) => {
    const products = await ctx.services.account.listWishlist(ctx.user.id)
    return { products }
  }),

  toggleWishlist: protectedProcedure.input(productIdInputSchema).mutation(async ({ ctx, input }) => {
    const action = await ctx.services.account.toggleWishlist(ctx.user.id, input.productId)
    return { success: true, action }
  }),

  listOrders: protectedProcedure.input(paginationSchema.optional()).query(async ({ ctx, input }) => {
    const result = await ctx.services.account.listOrders({
      userId: ctx.user.id,
      limit: input?.limit,
      offset: input?.offset,
    })

    return result
  }),

  getOrder: protectedProcedure.input(idInputSchema).query(async ({ ctx, input }) => {
    const order = await ctx.services.account.getOrderById(input.id)
    if (!order || order.user_id !== ctx.user.id) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' })
    }

    return { order }
  }),
})
