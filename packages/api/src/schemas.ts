import { z } from 'zod'

export const paymentMethodSchema = z.enum(['pickup', 'credit_card', 'paypal', 'in_store'])

export const paginationSchema = z.object({
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().min(0).optional(),
})

export const listProductsInputSchema = z.object({
  brandSlug: z.string().optional(),
  brandId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  categorySlug: z.string().optional(),
  petTypeId: z.string().uuid().optional(),
  stockStatus: z.string().optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  search: z.string().optional(),
  featured: z.boolean().optional(),
  facets: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
  offset: z.number().int().min(0).optional(),
})

export const productSlugInputSchema = z.object({
  slug: z.string().min(1),
})

export const profileUpdateInputSchema = z.object({
  fullName: z.string().min(2).max(100),
  phone: z.string().nullable().optional(),
})

export const addressCreateInputSchema = z.object({
  fullName: z.string().min(2),
  addressLine1: z.string().min(5),
  addressLine2: z.string().nullable().optional(),
  city: z.string().min(2),
  state: z.string().min(2),
  zipCode: z.string().min(5),
  phone: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
})

export const idInputSchema = z.object({
  id: z.string().uuid(),
})

export const productIdInputSchema = z.object({
  productId: z.string().uuid(),
})

export const promoValidateInputSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().min(0),
  email: z.string().email().optional(),
})

export const checkoutItemRequestSchema = z.object({
  id: z.string().min(1),
  quantity: z.number().int().positive(),
  preorderBatchId: z.string().uuid().nullable().optional(),
})

export const deliveryAddressSchema = z.object({
  street: z.string().min(3),
  city: z.string().min(2),
  state: z.string().min(2),
  zip: z.string().min(5),
})

export const checkoutQuoteInputSchema = z.object({
  items: z.array(checkoutItemRequestSchema).min(1),
  promoCode: z.string().nullable().optional(),
  fulfillmentMethod: z.enum(['pickup', 'delivery']).default('pickup'),
  deliveryAddress: deliveryAddressSchema.nullable().optional(),
  deliveryServices: z.array(z.enum(['pallet_jack', 'lift_gate', 'forklift', 'garage_placement'])).optional(),
  customerEmail: z.string().email().optional(),
})

export const createOrderInputSchema = z.object({
  customerName: z.string().min(1),
  customerEmail: z.string().email(),
  customerPhone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  items: z.array(checkoutItemRequestSchema).min(1),
  promoCode: z.string().nullable().optional(),
  fulfillmentMethod: z.enum(['pickup', 'delivery']).default('pickup'),
  deliveryAddress: deliveryAddressSchema.nullable().optional(),
  deliveryServices: z.array(z.enum(['pallet_jack', 'lift_gate', 'forklift', 'garage_placement'])).optional(),
  deliveryNotes: z.string().nullable().optional(),
  paymentMethod: paymentMethodSchema.default('pickup'),
})

export const createPaymentSheetInputSchema = z.object({
  orderId: z.string().uuid(),
  customerEmail: z.string().email(),
  customerName: z.string().min(1).optional(),
})

export const completePaymentInputSchema = z.object({
  orderId: z.string().uuid(),
  paymentIntentId: z.string().min(1),
  paymentMethod: paymentMethodSchema.default('credit_card'),
  customerEmail: z.string().email().optional(),
})

export const guestOrderLookupInputSchema = z.object({
  orderId: z.string().uuid(),
  token: z.string().min(20),
})
