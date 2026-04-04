/**
 * ShopSite Migration Types
 * 
 * Type definitions for handling ShopSite data import into Supabase.
 */

import * as z from 'zod';

// ============================================================================
// ShopSite API Configuration
// ============================================================================

export const ShopSiteConfigSchema = z.object({
    storeUrl: z.string().url().min(1, 'Store URL is required'),
    merchantId: z.string().min(1, 'Merchant ID is required'),
    password: z.string().min(1, 'Password is required'),
});

export type ShopSiteConfig = z.infer<typeof ShopSiteConfigSchema>;

// ============================================================================
// ShopSite Data Types (parsed from XML)
// ============================================================================

export interface ShopSiteProduct {
    sku: string;
    name: string;
    price: number;
    saleAmount?: number;              // <SaleAmount> - sale price when on sale
    description: string;
    quantityOnHand: number;
    lowStockThreshold?: number;       // <LowStockThreshold>
    imageUrl: string;
    additionalImages?: string[];      // MoreInfoImage1-20 (non-"none" values)
    weight?: number;
    taxable?: boolean;
    cost?: number;                    // shopsite_cost
    fulfillmentType?: string;         // <ProductType> e.g., "Tangible", "Digital", "Service"
    // ShopSite-specific identifiers
    productId?: string;               // <ProductID> - ShopSite internal ID
    productGuid?: string;             // <ProductGUID> - ShopSite UUID
    gtin?: string;                    // <GTIN> - barcode (UPC/EAN)
    // Operational ProductFields
    shortName?: string;               // <ProductField7> - Child / Short Name
    isSpecialOrder?: boolean;         // <ProductField11> - special order flag
    inStorePickup?: boolean;          // <ProductField15> - in-store pickup flag
    // Brand and taxonomy ProductFields
    brandName?: string;               // <ProductField16> or <Brand>
    petTypeName?: string;             // <ProductField17> - canonical pet type input
    lifeStage?: string;               // <ProductField18>
    petSize?: string;                 // <ProductField19>
    specialDiet?: string;             // <ProductField20>
    healthFeature?: string;           // <ProductField21>
    foodForm?: string;                // <ProductField22>
    flavor?: string;                  // <ProductField23>
    categoryName?: string;            // <ProductField24> - Department/Category
    productTypeName?: string;         // <ProductField25> - Subcategory/Product Type
    productFeature?: string;          // <ProductField26>
    size?: string;                    // <ProductField27>
    color?: string;                   // <ProductField29>
    packagingType?: string;           // <ProductField30>
    crossSellSkus?: string[];         // <ProductField32> - pipe-delimited related SKUs
    // Status fields
    isDisabled?: boolean;             // <ProductDisabled> === 'checked'
    availability?: string;            // <Availability> ('in stock', 'out of stock', etc.)
    // SEO and content
    fileName?: string;                // <FileName> - legacy URL slug
    moreInfoText?: string;            // <MoreInformationText> - HTML product details
    searchKeywords?: string;          // <SearchKeywords>
    // Inventory and Categorization
    outOfStockLimit?: number;         // <OutOfStockLimit>
    minimumQuantity?: number;         // <MinimumQuantity>
    googleProductCategory?: string;   // <GoogleProductCategory>
    shopsitePages?: string[];         // <ProductOnPages>
    // Raw payload may still contain audit-only fields like ProductField31.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawXml?: any;                     // To store in shopsite_data
}

export interface ShopSiteOrderItem {
    sku: string;
    quantity: number;
    price: number;
}

export interface AddressInfo {
    fullName: string;
    company?: string;
    phone?: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
}

export interface ShopSiteOrder {
    orderNumber: string;
    transactionId?: string; // ShopSiteTransactionID
    orderDate: string;
    grandTotal: number;
    tax: number;
    shippingTotal: number;
    customerEmail: string;
    billingAddress?: AddressInfo;
    shippingAddress?: AddressInfo;
    paymentMethod?: string; // From Payment section
    items: ShopSiteOrderItem[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawXml?: any; // To store in shopsite_data
}

export interface ShopSiteCustomer {
    email: string;
    firstName: string;
    lastName: string;
    billingAddress: string;
    billingCity: string;
    billingState: string;
    billingZip: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawXml?: any; // To store in shopsite_data
}

// ============================================================================
// Migration Log Types
// ============================================================================

export type SyncType = 'products' | 'customers';

export interface MigrationLog {
    id: string;
    syncType: SyncType;
    startedAt: string;
    completedAt: string | null;
    recordsProcessed: number;
    recordsCreated: number;
    recordsUpdated: number;
    recordsFailed: number;
    errorDetails: MigrationError[] | null;
    triggeredBy: string | null;
}

export interface MigrationError {
    record: string;
    error: string;
    timestamp: string;
}

// ============================================================================
// Sync Result Types
// ============================================================================

export interface SyncResult {
    success: boolean;
    processed: number;
    created: number;
    updated: number;
    failed: number;
    errors: MigrationError[];
    duration: number;
}

export interface ConnectionTestResult {
    success: boolean;
    error?: string;
}
