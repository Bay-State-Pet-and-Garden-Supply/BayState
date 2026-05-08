export type PaymentMethod = 'pickup' | 'credit_card' | 'paypal' | 'in_store'

export type DiscountType = 'percentage' | 'fixed_amount' | 'free_shipping'

export type DeliveryServiceType = 'pallet_jack' | 'lift_gate' | 'forklift' | 'garage_placement'

export interface Brand {
  id: string
  name: string
  slug: string
  logo_url: string | null
}

export interface Category {
  id: string
  name: string
  slug: string
  parent_id: string | null
  description: string | null
  image_url: string | null
  created_at: string
}

export interface Product {
  id: string
  sku?: string | null
  brand_id: string | null
  name: string
  slug: string
  description: string | null
  long_description?: string | null
  price: number
  stock_status: 'in_stock' | 'out_of_stock' | 'pre_order'
  images: string[]
  is_featured: boolean
  is_special_order?: boolean
  pickup_only?: boolean
  weight?: number | null
  search_keywords?: string | null
  category_ids?: string[]
  created_at: string
  updated_at?: string
  quantity?: number
  low_stock_threshold?: number
  is_taxable?: boolean
  published_at?: string | null
  gtin?: string | null
  availability?: string | null
  minimum_quantity?: number | null
  shopsite_pages?: string[] | null
  brand?: Brand
  primary_category?: Category
}

export interface Address {
  id: string
  user_id: string
  full_name: string
  address_line1: string
  address_line2: string | null
  city: string
  state: string
  zip_code: string
  phone: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ProductSummary {
  id: string
  name: string
  slug: string
  price: number
  images: string[]
  stock_status: string
}

export interface PromoCode {
  id: string
  code: string
  description: string | null
  discount_type: DiscountType
  discount_value: number
  minimum_order: number
  maximum_discount: number | null
  max_uses: number | null
  current_uses: number
  max_uses_per_user: number
  starts_at: string
  expires_at: string | null
  is_active: boolean
  first_order_only: boolean
  requires_account: boolean
  created_at: string
  updated_at: string
}

export interface OrderItemInput {
  id: string
  name: string
  slug: string
  price: number
  quantity: number
  imageUrl?: string | null
  preorderBatchId?: string | null
  pickup_only?: boolean
}

export interface CheckoutProductLookup {
  id: string
  name: string
  slug: string
  price: number
  imageUrl?: string | null
  pickup_only?: boolean
}

export interface OrderItem {
  id: string
  order_id: string
  item_type: 'product' | 'service'
  item_id: string
  item_name: string
  item_slug: string
  quantity: number
  unit_price: number
  total_price: number
  preorder_batch_id: string | null
  created_at: string
}

export interface Order {
  id: string
  order_number: string
  user_id: string | null
  customer_name: string
  customer_email: string
  customer_phone: string | null
  status: 'pending' | 'processing' | 'completed' | 'cancelled'
  payment_method: PaymentMethod
  payment_status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'partially_refunded'
  subtotal: number
  discount_amount: number
  promo_code: string | null
  promo_code_id: string | null
  tax: number
  total: number
  stripe_payment_intent_id: string | null
  stripe_customer_id: string | null
  paid_at: string | null
  refunded_amount: number
  notes: string | null
  fulfillment_method: 'pickup' | 'delivery'
  delivery_address_id: string | null
  delivery_distance_miles: number | null
  delivery_fee: number
  delivery_services: Array<{ service: string; fee: number }>
  delivery_notes: string | null
  created_at: string
  updated_at: string
  items?: OrderItem[]
}

export interface DeliveryFeeBreakdown {
  subtotal: number
  distanceMiles: number
  distanceFee: number
  serviceFees: number
  total: number
  isOutOfRange: boolean
  outOfRangeMessage?: string
}

export interface CheckoutQuote {
  subtotal: number
  discountAmount: number
  tax: number
  deliveryFee: number
  total: number
  promoCode: string | null
  promoCodeId: string | null
  discountType: DiscountType | null
  fulfillmentMethod: 'pickup' | 'delivery'
  deliveryBreakdown?: DeliveryFeeBreakdown | null
}

export interface StripePaymentSheetParams {
  paymentIntentClientSecret: string
  ephemeralKeySecret: string
  customerId: string
  publishableKey: string
  paymentIntentId: string
  amount: number
  currency: string
}

export interface AuthUser {
  id: string
  email?: string | null
}

export interface MobileApiContext {
  user: AuthUser | null
  authType: 'bearer' | 'cookie' | 'none'
  services: {
    catalog: {
      listProducts: (options: {
        brandSlug?: string
        brandId?: string
        categoryId?: string
        categorySlug?: string
        petTypeId?: string
        stockStatus?: string
        minPrice?: number
        maxPrice?: number
        search?: string
        featured?: boolean
        facets?: string
        limit?: number
        offset?: number
      }) => Promise<{ products: Product[]; count: number }>
      getProductBySlug: (slug: string) => Promise<Product | null>
      listBrands: () => Promise<Brand[]>
      listCategories: () => Promise<Array<{ id: string; name: string; slug: string; parent_id: string | null; image_url: string | null }>>
      getProductsByIds: (ids: string[]) => Promise<CheckoutProductLookup[]>
    }
    account: {
      getProfile: (userId: string) => Promise<{ id: string; full_name: string | null; email: string | null; phone: string | null } | null>
      updateProfile: (userId: string, values: { fullName: string; phone?: string | null }) => Promise<boolean>
      listAddresses: (userId: string) => Promise<Address[]>
      createAddress: (userId: string, values: {
        fullName: string
        addressLine1: string
        addressLine2?: string | null
        city: string
        state: string
        zipCode: string
        phone?: string | null
        isDefault?: boolean
      }) => Promise<Address | null>
      deleteAddress: (userId: string, id: string) => Promise<boolean>
      setDefaultAddress: (userId: string, id: string) => Promise<boolean>
      listFavorites: (userId: string) => Promise<ProductSummary[]>
      toggleFavorites: (userId: string, productId: string) => Promise<'added' | 'removed'>
      listOrders: (options: { userId?: string; customerEmail?: string; limit?: number; offset?: number }) => Promise<{ orders: Order[]; count: number }>
      getOrderById: (id: string) => Promise<Order | null>
    }
    promotions: {
      validate: (input: {
        code: string
        subtotal: number
        userId?: string | null
        email?: string
      }) => Promise<{ valid: boolean; error?: string; promo?: PromoCode; discount?: number; discountType?: DiscountType }>
    }
    checkout: {
      getDeliveryQuote: (address: string, selectedServices: string[]) => Promise<DeliveryFeeBreakdown>
      createOrder: (input: {
        userId?: string | null
        customerName: string
        customerEmail: string
        customerPhone?: string
        notes?: string
        items: OrderItemInput[]
        promoCode?: string | null
        promoCodeId?: string | null
        discountAmount?: number
        paymentMethod?: PaymentMethod
        paymentStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded' | 'partially_refunded'
        stripePaymentIntentId?: string
        stripeCustomerId?: string
        fulfillmentMethod?: 'pickup' | 'delivery'
        deliveryAddress?: {
          street: string
          city: string
          state: string
          zip: string
        } | null
        deliveryDistanceMiles?: number | null
        deliveryFee?: number | null
        deliveryServices?: string[]
        deliveryNotes?: string | null
      }) => Promise<Order | null>
      updateOrderPaymentComplete: (orderId: string, paymentIntentId: string, paymentMethod: PaymentMethod) => Promise<boolean>
      setOrderPaymentIntent: (input: {
        orderId: string
        paymentIntentId: string
        stripeCustomerId: string
        paymentMethod: PaymentMethod
      }) => Promise<boolean>
      createPaymentIntent: (input: {
        amount: number
        currency?: string
        customerEmail: string
        customerName: string
        customerId?: string
        orderId?: string
        metadata?: Record<string, string>
      }) => Promise<{
        id: string
        client_secret: string | null
        amount: number
        currency: string
      }>
      getOrCreateStripeCustomer: (input: { email: string; name: string }) => Promise<{ id: string }>
      createEphemeralKey: (customerId: string) => Promise<{ secret: string }>
      getStripePublishableKey: () => string
      getTaxRate: () => number
      deliveryServiceFees: Record<DeliveryServiceType, number>
    }
  }
}
