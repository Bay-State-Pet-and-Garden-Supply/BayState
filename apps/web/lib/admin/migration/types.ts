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
    // Brand and Category from ProductFields
    brandName?: string;               // <ProductField16> or <Brand>
    categoryName?: string;            // <ProductField24> - Department/Category
    productTypeName?: string;         // <ProductField25> - Subcategory/Product Type
    // Status fields
    isDisabled?: boolean;             // <ProductDisabled> === 'checked'
    availability?: string;            // <Availability> ('in stock', 'out of stock', etc.)
    isSpecialOrder?: boolean;         // <ProductField11> === 'yes'
    // SEO and content
    fileName?: string;                // <FileName> - legacy URL slug
    moreInfoText?: string;            // <MoreInformationText> - HTML product details
    searchKeywords?: string;          // <SearchKeywords>
    // Inventory and Categorization
    outOfStockLimit?: number;         // <OutOfStockLimit>
    minimumQuantity?: number;         // <MinimumQuantity>
    googleProductCategory?: string;   // <GoogleProductCategory>
    shopsitePages?: string[];         // <ProductOnPages>
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

export type SyncType = 'products' | 'customers' | 'orders';

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
