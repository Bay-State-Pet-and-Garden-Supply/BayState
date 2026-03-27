import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProductStorefrontSettingsRecord {
    is_featured: boolean | null;
    pickup_only: boolean | null;
}

export type ProductStorefrontSettingsRelation =
    | ProductStorefrontSettingsRecord
    | ProductStorefrontSettingsRecord[]
    | null
    | undefined;

export interface ProductStorefrontSettings {
    is_featured: boolean;
    pickup_only: boolean;
}

export const PRODUCT_STOREFRONT_SETTINGS_SELECT =
    'storefront_settings:product_storefront_settings(is_featured, pickup_only)';

export function normalizeProductStorefrontSettings(
    relation: ProductStorefrontSettingsRelation
): ProductStorefrontSettings {
    const record = Array.isArray(relation) ? relation[0] ?? null : relation ?? null;

    return {
        is_featured: Boolean(record?.is_featured),
        pickup_only: Boolean(record?.pickup_only),
    };
}

export async function updateProductPickupOnlySetting(
    supabase: SupabaseClient,
    productId: string,
    pickupOnly: boolean
) {
    const { data: existingSettings, error: fetchError } = await supabase
        .from('product_storefront_settings')
        .select('product_id')
        .eq('product_id', productId)
        .maybeSingle();

    if (fetchError) {
        throw new Error(`Failed to load product storefront settings: ${fetchError.message}`);
    }

    if (existingSettings) {
        const { error: updateError } = await supabase
            .from('product_storefront_settings')
            .update({ pickup_only: pickupOnly })
            .eq('product_id', productId);

        if (updateError) {
            throw new Error(`Failed to update pickup-only setting: ${updateError.message}`);
        }

        return;
    }

    const { error: insertError } = await supabase
        .from('product_storefront_settings')
        .insert({
            product_id: productId,
            pickup_only: pickupOnly,
        });

    if (insertError) {
        throw new Error(`Failed to create pickup-only setting: ${insertError.message}`);
    }
}
