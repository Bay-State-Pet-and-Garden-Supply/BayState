import { DELIVERY_SERVICE_OPTIONS, TAX_RATE, type DeliveryServiceType } from '@/lib/types'
import { getBrands } from '@/lib/data'
import { getFilteredProducts, getProductBySlug } from '@/lib/products'
import { createOrderWithClient, type CreateOrderInput } from '@/lib/orders'
import {
  createEphemeralKey,
  createPaymentIntent,
  getOrCreateStripeCustomer,
  getStripePublishableKey,
  retrievePaymentIntent,
} from '@/lib/payments/stripe'
import { getDeliveryQuote } from '@/lib/storefront/delivery'
import {
  createAdminClient,
  createClientFromBearerToken,
  createClientFromRequest,
  createPublicClient,
  type SupabaseClient,
} from '@/lib/supabase/server'
import type { MobileApiContext, PromoCode, DiscountType } from '@baystate/api'

interface PromoValidationInput {
  code: string
  subtotal: number
  userId?: string | null
  email?: string
}

type PromoValidationResult = {
  valid: boolean
  error?: string
  promo?: PromoCode
  discount?: number
  discountType?: DiscountType
}

function parseImages(images: unknown): string[] {
  if (!images) return []

  if (Array.isArray(images)) {
    return images.filter((entry): entry is string => typeof entry === 'string')
  }

  if (typeof images === 'string') {
    return [images]
  }

  return []
}

function getPickupOnlyFromRelation(
  storefrontSettings:
    | {
        pickup_only?: boolean | null
      }
    | Array<{
        pickup_only?: boolean | null
      }>
    | null
    | undefined,
): boolean {
  if (Array.isArray(storefrontSettings)) {
    return Boolean(storefrontSettings[0]?.pickup_only)
  }

  return Boolean(storefrontSettings?.pickup_only)
}

function extractBearerToken(request: Request): string | null {
  const headerValue = request.headers.get('authorization')
  if (!headerValue) {
    return null
  }

  if (!headerValue.toLowerCase().startsWith('bearer ')) {
    return null
  }

  const token = headerValue.slice(7).trim()
  return token || null
}

function calculatePromoDiscount(promo: PromoCode, subtotal: number): number {
  let discount = 0

  switch (promo.discount_type) {
    case 'percentage':
      discount = subtotal * (promo.discount_value / 100)
      if (promo.maximum_discount) {
        discount = Math.min(discount, promo.maximum_discount)
      }
      break
    case 'fixed_amount':
      discount = Math.min(promo.discount_value, subtotal)
      break
    case 'free_shipping':
      discount = 0
      break
  }

  return Math.round(discount * 100) / 100
}

async function validatePromoCodeWithAdmin(
  adminClient: SupabaseClient,
  input: PromoValidationInput,
): Promise<PromoValidationResult> {
  const codeUpper = input.code.toUpperCase().trim()

  if (!codeUpper) {
    return { valid: false, error: 'Please enter a promo code' }
  }

  const { data: promo, error } = await adminClient
    .from('promo_codes')
    .select('*')
    .ilike('code', codeUpper)
    .eq('is_active', true)
    .single()

  if (error || !promo) {
    return { valid: false, error: 'Invalid promo code' }
  }

  const now = new Date()
  const startsAt = new Date(promo.starts_at)
  const expiresAt = promo.expires_at ? new Date(promo.expires_at) : null

  if (now < startsAt) {
    return { valid: false, error: 'This promo code is not yet active' }
  }

  if (expiresAt && now > expiresAt) {
    return { valid: false, error: 'This promo code has expired' }
  }

  if (promo.max_uses && promo.current_uses >= promo.max_uses) {
    return { valid: false, error: 'This promo code has reached its usage limit' }
  }

  if (promo.minimum_order > 0 && input.subtotal < promo.minimum_order) {
    return {
      valid: false,
      error: `Minimum order of $${promo.minimum_order.toFixed(2)} required`,
    }
  }

  if (promo.requires_account && !input.userId) {
    return { valid: false, error: 'Please sign in to use this promo code' }
  }

  if (promo.first_order_only) {
    if (input.userId) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('first_order_completed')
        .eq('id', input.userId)
        .single()

      if (profile?.first_order_completed) {
        return { valid: false, error: 'This code is only valid for first-time orders' }
      }
    }

    let firstOrderLookup = adminClient
      .from('promo_redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('promo_code_id', promo.id)

    if (input.userId) {
      firstOrderLookup = firstOrderLookup.eq('user_id', input.userId)
    } else if (input.email) {
      firstOrderLookup = firstOrderLookup.ilike('guest_email', input.email)
    }

    const { count: redemptionCount } = await firstOrderLookup
    if (redemptionCount && redemptionCount > 0) {
      return { valid: false, error: 'This code is only valid for first-time orders' }
    }
  }

  if (input.userId && promo.max_uses_per_user > 0) {
    const { count } = await adminClient
      .from('promo_redemptions')
      .select('*', { count: 'exact', head: true })
      .eq('promo_code_id', promo.id)
      .eq('user_id', input.userId)

    if (count && count >= promo.max_uses_per_user) {
      return { valid: false, error: 'You have already used this promo code' }
    }
  }

  const promoRow = promo as PromoCode
  const discount = calculatePromoDiscount(promoRow, input.subtotal)

  return {
    valid: true,
    promo: promoRow,
    discount,
    discountType: promoRow.discount_type,
  }
}

export async function createTRPCContext(request: Request): Promise<MobileApiContext> {
  const publicClient = createPublicClient()
  const adminClient = await createAdminClient()

  const bearerToken = extractBearerToken(request)
  let userClient: SupabaseClient
  let authType: MobileApiContext['authType'] = 'none'

  if (bearerToken) {
    userClient = createClientFromBearerToken(bearerToken)
    authType = 'bearer'
  } else {
    userClient = createClientFromRequest(request)
    authType = 'cookie'
  }

  const {
    data: { user: supabaseUser },
  } = await userClient.auth.getUser()

  if (!supabaseUser) {
    authType = 'none'
  }

  const deliveryServiceFees = DELIVERY_SERVICE_OPTIONS.reduce<Record<DeliveryServiceType, number>>(
    (result, service) => {
      result[service.service] = service.fee
      return result
    },
    {
      pallet_jack: 0,
      lift_gate: 0,
      forklift: 0,
      garage_placement: 0,
    },
  )

  return {
    user: supabaseUser
      ? {
          id: supabaseUser.id,
          email: supabaseUser.email,
        }
      : null,
    authType,
    services: {
      catalog: {
        listProducts: async (options) => getFilteredProducts(options),
        getProductBySlug: async (slug) => getProductBySlug(slug),
        listBrands: async () => getBrands(),
        listCategories: async () => {
          const { data, error } = await publicClient
            .from('categories')
            .select('id, name, slug, parent_id, image_url')
            .order('display_order')

          if (error) {
            console.error('Failed to list categories:', error)
            return []
          }

          return data ?? []
        },
        getProductsByIds: async (ids) => {
          if (ids.length === 0) {
            return []
          }

          const { data, error } = await publicClient
            .from('products')
            .select('id, name, slug, price, images, storefront_settings:product_storefront_settings(pickup_only)')
            .in('id', ids)
            .in('stock_status', ['in_stock', 'pre_order'])

          if (error) {
            console.error('Failed to list products by ids:', error)
            return []
          }

          const mapped = (data ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            slug: row.slug,
            price: Number(row.price),
            imageUrl: parseImages(row.images)[0] ?? null,
            pickup_only: getPickupOnlyFromRelation(
              row.storefront_settings as
                | { pickup_only?: boolean | null }
                | Array<{ pickup_only?: boolean | null }>
                | null
                | undefined,
            ),
          }))

          const byId = new Map(mapped.map((item) => [item.id, item]))
          return ids
            .map((id) => byId.get(id))
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
        },
      },
      account: {
        getProfile: async (userId) => {
          const { data, error } = await userClient
            .from('profiles')
            .select('id, full_name, email, phone')
            .eq('id', userId)
            .single()

          if (error || !data) {
            return null
          }

          return data
        },
        updateProfile: async (userId, values) => {
          const { error } = await userClient
            .from('profiles')
            .update({
              full_name: values.fullName,
              phone: values.phone ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId)

          return !error
        },
        listAddresses: async (userId) => {
          const { data, error } = await userClient
            .from('addresses')
            .select('*')
            .eq('user_id', userId)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false })

          if (error) {
            return []
          }

          return data ?? []
        },
        createAddress: async (userId, values) => {
          const { data, error } = await userClient
            .from('addresses')
            .insert({
              user_id: userId,
              full_name: values.fullName,
              address_line1: values.addressLine1,
              address_line2: values.addressLine2 ?? null,
              city: values.city,
              state: values.state,
              zip_code: values.zipCode,
              phone: values.phone ?? null,
              is_default: values.isDefault ?? false,
            })
            .select('*')
            .single()

          if (error || !data) {
            return null
          }

          return data
        },
        deleteAddress: async (userId, id) => {
          const { error } = await userClient
            .from('addresses')
            .delete()
            .eq('id', id)
            .eq('user_id', userId)

          return !error
        },
        setDefaultAddress: async (userId, id) => {
          const { error } = await userClient
            .from('addresses')
            .update({ is_default: true })
            .eq('id', id)
            .eq('user_id', userId)

          return !error
        },
        listFavorites: async (userId) => {
          const { data, error } = await userClient
            .from('wishlists')
            .select('products!inner(id, name, slug, price, images, stock_status)')
            .eq('user_id', userId)
            .in('products.stock_status', ['in_stock', 'pre_order'])
            .order('created_at', { ascending: false })

          if (error) {
            return []
          }

          const rows = (data ?? []) as Array<{
            products:
              | {
                  id: string
                  name: string
                  slug: string
                  price: number
                  images: unknown
                  stock_status: string
                }
              | Array<{
                  id: string
                  name: string
                  slug: string
                  price: number
                  images: unknown
                  stock_status: string
                }>
              | null
          }>

          return rows
            .map((row) => (Array.isArray(row.products) ? row.products[0] : row.products))
            .filter(
              (product): product is NonNullable<typeof product> => {
                if (!product) return false
                return product.stock_status === 'in_stock' || product.stock_status === 'pre_order'
              },
            )
            .map((product) => ({
              ...product,
              images: parseImages(product.images),
            }))
        },
        toggleFavorites: async (userId, productId) => {
          const { data: existing, error: existingError } = await userClient
            .from('wishlists')
            .select('product_id')
            .eq('user_id', userId)
            .eq('product_id', productId)

          if (existingError) {
            throw new Error(existingError.message)
          }

          if (existing && existing.length > 0) {
            const { error } = await userClient
              .from('wishlists')
              .delete()
              .eq('user_id', userId)
              .eq('product_id', productId)

            if (error) {
              throw new Error(error.message)
            }

            return 'removed'
          }

          const { error } = await userClient
            .from('wishlists')
            .insert({ user_id: userId, product_id: productId })

          if (error) {
            throw new Error(error.message)
          }

          return 'added'
        },
        listOrders: async ({ userId, customerEmail, limit, offset }) => {
          if (!userId && !customerEmail) {
            return { orders: [], count: 0 }
          }

          const sourceClient = userId ? userClient : adminClient
          let query = sourceClient.from('orders').select('*', { count: 'exact' })

          if (userId) {
            query = query.eq('user_id', userId)
          }

          if (customerEmail) {
            query = query.eq('customer_email', customerEmail)
          }

          query = query.order('created_at', { ascending: false })
          if (limit) {
            query = query.range(offset ?? 0, (offset ?? 0) + limit - 1)
          } else {
            query = query.limit(200)
          }

          const { data, error, count } = await query
          if (error) {
            console.error('Failed to list orders:', error)
            return { orders: [], count: 0 }
          }

          return {
            orders: data ?? [],
            count: count ?? 0,
          }
        },
        getOrderById: async (id) => {
          const { data, error } = await adminClient
            .from('orders')
            .select('*, items:order_items(*)')
            .eq('id', id)
            .single()

          if (error || !data) {
            return null
          }

          return data
        },
      },
      promotions: {
        validate: async (input) => validatePromoCodeWithAdmin(adminClient, input),
      },
      checkout: {
        getDeliveryQuote: async (address, selectedServices) => getDeliveryQuote(address, selectedServices),
        createOrder: async (input) => createOrderWithClient(adminClient, input as CreateOrderInput),
        updateOrderPaymentComplete: async (orderId, paymentIntentId, paymentMethod) => {
          const paymentIntent = await retrievePaymentIntent(paymentIntentId)
          const paymentStatus = paymentIntent.status === 'succeeded' ? 'paid' : 'authorized'

          const { error } = await adminClient
            .from('orders')
            .update({
              stripe_payment_intent_id: paymentIntentId,
              payment_method: paymentMethod,
              payment_status: paymentStatus,
              paid_at: paymentIntent.status === 'succeeded' ? new Date().toISOString() : null,
            })
            .eq('id', orderId)

          return !error
        },
        setOrderPaymentIntent: async ({ orderId, paymentIntentId, stripeCustomerId, paymentMethod }) => {
          const { error } = await adminClient
            .from('orders')
            .update({
              stripe_payment_intent_id: paymentIntentId,
              stripe_customer_id: stripeCustomerId,
              payment_method: paymentMethod,
              payment_status: 'authorized',
            })
            .eq('id', orderId)

          return !error
        },
        createPaymentIntent: async (input) => {
          const paymentIntent = await createPaymentIntent(input)
          return {
            id: paymentIntent.id,
            client_secret: paymentIntent.client_secret,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
          }
        },
        getOrCreateStripeCustomer: async ({ email, name }) => {
          const customer = await getOrCreateStripeCustomer({ email, name })
          return { id: customer.id }
        },
        createEphemeralKey: async (customerId) => {
          const key = await createEphemeralKey(customerId)
          return { secret: key.secret ?? '' }
        },
        getStripePublishableKey: () => getStripePublishableKey(),
        getTaxRate: () => TAX_RATE,
        deliveryServiceFees,
      },
    },
  }
}
