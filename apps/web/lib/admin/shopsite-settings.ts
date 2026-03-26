import { createAdminClient } from '@/lib/supabase/server';
import type { ShopSiteConfig } from '@/lib/admin/migration/types';

const SETTINGS_KEY = 'shopsite_migration';

interface StoredShopSiteSettings {
    storeUrl?: string;
    merchantId?: string;
    password?: string;
}

export async function getStoredShopSiteConfig(): Promise<ShopSiteConfig | null> {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', SETTINGS_KEY)
        .maybeSingle();

    if (error) {
        throw new Error(`Failed to load ShopSite settings: ${error.message}`);
    }

    const value = (data?.value ?? {}) as StoredShopSiteSettings;
    const storeUrl = value.storeUrl?.trim() ?? '';
    const merchantId = value.merchantId?.trim() ?? '';
    const password = value.password ?? '';

    if (!storeUrl || !merchantId || !password) {
        return null;
    }

    return {
        storeUrl,
        merchantId,
        password,
    };
}
