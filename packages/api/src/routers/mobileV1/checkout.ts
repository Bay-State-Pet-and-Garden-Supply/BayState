import { TRPCError } from '@trpc/server'
import {
  checkoutQuoteInputSchema,
  createOrderInputSchema,
  createPaymentSheetInputSchema,
  completePaymentInputSchema,
  guestOrderLookupInputSchema,
} from '../../schemas'
import { protectedProcedure, publicProcedure, t } from '../../trpc'
import type { CheckoutProductLookup, CheckoutQuote, DeliveryServiceType, OrderItemInput } from '../../types'
import { createGuestOrderToken, verifyGuestOrderToken } from '../../guest-order-token'

function toServiceKey(service: string): DeliveryServiceType | null {
  if (service === 'pallet_jack' || service === 'lift_gate' || service === 'forklift' || service === 'garage_placement') {
    return service
  }

  return null
}

function coerceItemLookup(items: CheckoutProductLookup[], requests: Array<{ id: string; quantity: number; preorderBatchId?: string | null }>): OrderItemInput[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const mapped: Array<OrderItemInput | null> = requests.map((request): OrderItemInput | null => {
      const product = byId.get(request.id)
      if (!product) {
        return null
      }

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        quantity: request.quantity,
        imageUrl: product.imageUrl ?? null,
        preorderBatchId: request.preorderBatchId ?? null,
        pickup_only: product.pickup_only ?? false,
      }
    })

  return mapped.filter((item): item is OrderItemInput => item !== null)
}

async function buildQuote(args: {
  items: Array<{ id: string; quantity: number; preorderBatchId?: string | null }>
  promoCode?: string | null
  fulfillmentMethod: 'pickup' | 'delivery'
  deliveryAddress?: { street: string; city: string; state: string; zip: string } | null
  deliveryServices?: string[]
  userId?: string | null
  customerEmail?: string
  services: {
    catalog: {
      getProductsByIds: (ids: string[]) => Promise<CheckoutProductLookup[]>
    }
    promotions: {
      validate: (input: {
        code: string
        subtotal: number
        userId?: string | null
        email?: string
      }) => Promise<{ valid: boolean; error?: string; promo?: { id: string; code: string }; discount?: number; discountType?: 'percentage' | 'fixed_amount' | 'free_shipping' }>
    }
    checkout: {
      getDeliveryQuote: (address: string, selectedServices: string[]) => Promise<{
        subtotal: number
        distanceMiles: number
        distanceFee: number
        serviceFees: number
        total: number
        isOutOfRange: boolean
        outOfRangeMessage?: string
      }>
      getTaxRate: () => number
      deliveryServiceFees: Record<DeliveryServiceType, number>
    }
  }
}): Promise<CheckoutQuote & { orderItems: OrderItemInput[] }> {
  const products = await args.services.catalog.getProductsByIds(args.items.map((item) => item.id))
  const orderItems = coerceItemLookup(products, args.items)

  if (orderItems.length !== args.items.length) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'One or more items are invalid' })
  }

  if (orderItems.some((item) => item.quantity < 1)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Item quantity must be at least 1' })
  }

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

  let discountAmount = 0
  let promoCode: string | null = null
  let promoCodeId: string | null = null
  let discountType: 'percentage' | 'fixed_amount' | 'free_shipping' | null = null

  if (args.promoCode) {
    const promoResult = await args.services.promotions.validate({
      code: args.promoCode,
      subtotal,
      userId: args.userId ?? null,
      email: args.customerEmail,
    })

    if (!promoResult.valid) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: promoResult.error ?? 'Invalid promo code' })
    }

    discountAmount = promoResult.discount ?? 0
    promoCode = promoResult.promo?.code ?? args.promoCode
    promoCodeId = promoResult.promo?.id ?? null
    discountType = promoResult.discountType ?? null
  }

  let deliveryFee = 0
  let deliveryBreakdown: CheckoutQuote['deliveryBreakdown'] = null

  if (args.fulfillmentMethod === 'delivery') {
    if (orderItems.some((item) => item.pickup_only)) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Pickup-only items cannot be delivered' })
    }

    if (!args.deliveryAddress) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Delivery address is required for delivery orders' })
    }

    const address = `${args.deliveryAddress.street}, ${args.deliveryAddress.city}, ${args.deliveryAddress.state} ${args.deliveryAddress.zip}`
    const quote = await args.services.checkout.getDeliveryQuote(address, args.deliveryServices ?? [])

    if (quote.isOutOfRange) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: quote.outOfRangeMessage ?? 'Delivery is unavailable for this address' })
    }

    deliveryFee = quote.total
    deliveryBreakdown = quote
  }

  if (discountType === 'free_shipping') {
    deliveryFee = 0
  }

  const discountedSubtotal = Math.max(0, subtotal - discountAmount)
  const tax = discountedSubtotal * args.services.checkout.getTaxRate()
  const total = discountedSubtotal + tax + deliveryFee

  return {
    subtotal,
    discountAmount,
    tax,
    deliveryFee,
    total,
    promoCode,
    promoCodeId,
    discountType,
    fulfillmentMethod: args.fulfillmentMethod,
    deliveryBreakdown,
    orderItems,
  }
}

export const checkoutRouter = t.router({
  quote: publicProcedure.input(checkoutQuoteInputSchema).query(async ({ ctx, input }) => {
    const quote = await buildQuote({
      items: input.items,
      promoCode: input.promoCode ?? null,
      fulfillmentMethod: input.fulfillmentMethod,
      deliveryAddress: input.deliveryAddress ?? null,
      deliveryServices: input.deliveryServices,
      userId: ctx.user?.id ?? null,
      customerEmail: input.customerEmail,
      services: {
        catalog: {
          getProductsByIds: ctx.services.catalog.getProductsByIds,
        },
        promotions: {
          validate: ctx.services.promotions.validate,
        },
        checkout: {
          getDeliveryQuote: ctx.services.checkout.getDeliveryQuote,
          getTaxRate: ctx.services.checkout.getTaxRate,
          deliveryServiceFees: ctx.services.checkout.deliveryServiceFees,
        },
      },
    })

    return quote
  }),

  createOrder: publicProcedure.input(createOrderInputSchema).mutation(async ({ ctx, input }) => {
    const quote = await buildQuote({
      items: input.items,
      promoCode: input.promoCode ?? null,
      fulfillmentMethod: input.fulfillmentMethod,
      deliveryAddress: input.deliveryAddress ?? null,
      deliveryServices: input.deliveryServices,
      userId: ctx.user?.id ?? null,
      customerEmail: input.customerEmail,
      services: {
        catalog: {
          getProductsByIds: ctx.services.catalog.getProductsByIds,
        },
        promotions: {
          validate: ctx.services.promotions.validate,
        },
        checkout: {
          getDeliveryQuote: ctx.services.checkout.getDeliveryQuote,
          getTaxRate: ctx.services.checkout.getTaxRate,
          deliveryServiceFees: ctx.services.checkout.deliveryServiceFees,
        },
      },
    })

    const order = await ctx.services.checkout.createOrder({
      userId: ctx.user?.id ?? null,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone ?? undefined,
      notes: input.notes ?? undefined,
      items: quote.orderItems,
      promoCode: quote.promoCode,
      promoCodeId: quote.promoCodeId,
      discountAmount: quote.discountAmount,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentMethod === 'pickup' ? 'pending' : 'processing',
      fulfillmentMethod: input.fulfillmentMethod,
      deliveryAddress: input.deliveryAddress ?? null,
      deliveryDistanceMiles: quote.deliveryBreakdown?.distanceMiles ?? null,
      deliveryFee: quote.deliveryFee,
      deliveryServices: (input.deliveryServices ?? []).filter((service): service is DeliveryServiceType => Boolean(toServiceKey(service))),
      deliveryNotes: input.deliveryNotes ?? null,
    })

    if (!order) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create order' })
    }

    return {
      order,
      quote,
      guestAccessToken: ctx.user ? null : createGuestOrderToken({ orderId: order.id, email: order.customer_email }),
    }
  }),

  createPaymentSheet: publicProcedure.input(createPaymentSheetInputSchema).mutation(async ({ ctx, input }) => {
    const order = await ctx.services.account.getOrderById(input.orderId)
    if (!order) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' })
    }

    if (ctx.user && order.user_id && ctx.user.id !== order.user_id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Order does not belong to current user' })
    }

    if (!ctx.user && order.user_id) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required for this order' })
    }

    if (!ctx.user && order.customer_email.toLowerCase() !== input.customerEmail.toLowerCase()) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Order email does not match guest checkout' })
    }

    const customer = await ctx.services.checkout.getOrCreateStripeCustomer({
      email: input.customerEmail,
      name: input.customerName ?? order.customer_name,
    })
    const ephemeralKey = await ctx.services.checkout.createEphemeralKey(customer.id)
    const paymentIntent = await ctx.services.checkout.createPaymentIntent({
      amount: order.total,
      currency: 'usd',
      customerEmail: input.customerEmail,
      customerName: input.customerName ?? order.customer_name,
      customerId: customer.id,
      orderId: order.id,
      metadata: {
        order_id: order.id,
      },
    })

    if (!paymentIntent.client_secret) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Stripe did not return a client secret' })
    }

    await ctx.services.checkout.setOrderPaymentIntent({
      orderId: order.id,
      paymentIntentId: paymentIntent.id,
      stripeCustomerId: customer.id,
      paymentMethod: 'credit_card',
    })

    return {
      paymentIntentClientSecret: paymentIntent.client_secret,
      ephemeralKeySecret: ephemeralKey.secret,
      customerId: customer.id,
      publishableKey: ctx.services.checkout.getStripePublishableKey(),
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
    }
  }),

  completePayment: publicProcedure.input(completePaymentInputSchema).mutation(async ({ ctx, input }) => {
    const order = await ctx.services.account.getOrderById(input.orderId)
    if (!order) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' })
    }

    if (ctx.user && order.user_id && ctx.user.id !== order.user_id) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Order does not belong to current user' })
    }

    if (!ctx.user && input.customerEmail && order.customer_email.toLowerCase() !== input.customerEmail.toLowerCase()) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Order email does not match guest checkout' })
    }

    const success = await ctx.services.checkout.updateOrderPaymentComplete(
      input.orderId,
      input.paymentIntentId,
      input.paymentMethod,
    )

    if (!success) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to complete payment' })
    }

    return { success: true }
  }),

  getGuestOrder: publicProcedure.input(guestOrderLookupInputSchema).query(async ({ ctx, input }) => {
    const payload = verifyGuestOrderToken(input.token)
    if (!payload) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or expired guest access token' })
    }

    if (payload.orderId !== input.orderId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Guest access token does not match order' })
    }

    const result = await ctx.services.account.listOrders({
      customerEmail: payload.email,
      limit: 20,
      offset: 0,
    })

    const order = result.orders.find((candidate) => candidate.id === input.orderId)
    if (!order) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' })
    }

    return { order }
  }),

  myOrder: protectedProcedure.input(guestOrderLookupInputSchema.pick({ orderId: true })).query(async ({ ctx, input }) => {
    const order = await ctx.services.account.getOrderById(input.orderId)
    if (!order || order.user_id !== ctx.user.id) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' })
    }

    return { order }
  }),
})
