/**
 * Customer Synchronization Utilities
 * 
 * Handles transformation and sync of customers from ShopSite to Supabase profiles.
 */

import { ShopSiteCustomer } from './types';

/**
 * Transform a ShopSite customer into the Supabase profiles table format.
 * Note: These are "legacy" profiles without auth users - customers will need to reset passwords.
 */
interface TransformedCustomer {
    email: string;
    full_name: string;
    legacy_customer_id: string;
    shopsite_data: Record<string, unknown>;
}

export function transformShopSiteCustomer(customer: ShopSiteCustomer): TransformedCustomer {
    const fullName = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'ShopSite Customer';

    return {
        email: customer.email.toLowerCase().trim(),
        full_name: fullName,
        legacy_customer_id: customer.email, // Use email as the legacy ID
        shopsite_data: customer.rawXml ? { raw_xml: customer.rawXml } : {},
    };
}
