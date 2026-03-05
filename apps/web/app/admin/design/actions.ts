'use server';

import { revalidatePath } from 'next/cache';
import {
    updateCampaignBanner,
    type CampaignBannerSettings,
    type BannerMessage,
    updateHomepageSettings,
    type HomepageSettings,
    type NavLink,
    type SocialLink
} from '@/lib/settings';

export async function updateCampaignBannerAction(formData: FormData) {
    // Parse messages from JSON string
    const messagesJson = formData.get('messages') as string;
    let messages: BannerMessage[] = [];

    try {
        messages = messagesJson ? JSON.parse(messagesJson) : [];
    } catch {
        messages = [];
    }

    const settings: CampaignBannerSettings = {
        enabled: formData.get('enabled') === 'on',
        messages,
        variant: (formData.get('variant') as 'info' | 'promo' | 'seasonal') || 'info',
        cycleInterval: parseInt(formData.get('cycleInterval') as string, 10) || 5000,
    };

    try {
        const success = await updateCampaignBanner(settings);

        if (!success) {
            return { success: false, error: 'Failed to update settings in database' };
        }

        revalidatePath('/admin/design');
        revalidatePath('/'); // Revalidate storefront to show updated banner
        return { success: true };
    } catch (error: unknown) {
        console.error('Action error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
        return { success: false, error: errorMessage };
    }
}

export async function updateHomepageSettingsAction(formData: FormData) {
    const featuredProductIdsJson = formData.get('featuredProductIds') as string;
    let featuredProductIds: string[] = [];
    try {
        featuredProductIds = featuredProductIdsJson ? JSON.parse(featuredProductIdsJson) : [];
    } catch {
        featuredProductIds = [];
    }

    const heroSlidesJson = formData.get('heroSlides') as string;
    let heroSlides = [];
    try {
        heroSlides = heroSlidesJson ? JSON.parse(heroSlidesJson) : [];
    } catch {
        heroSlides = [];
    }

    const heroSlideInterval = parseInt(formData.get('heroSlideInterval') as string, 10) || 5000;

    const settings: HomepageSettings = {
        hero: {
            title: formData.get('hero.title') as string,
            subtitle: formData.get('hero.subtitle') as string,
            imageUrl: formData.get('hero.imageUrl') as string,
            ctaText: formData.get('hero.ctaText') as string,
            ctaLink: formData.get('hero.ctaLink') as string,
        },
        heroSlides,
        heroSlideInterval,
        featuredProductIds,
        storeHours: formData.get('storeHours') as string,
    };

    try {
        const success = await updateHomepageSettings(settings);

        if (!success) {
            return { success: false, error: 'Failed to update homepage settings' };
        }

        revalidatePath('/admin/design');
        revalidatePath('/'); // Revalidate homepage
        return { success: true };
    } catch (error: unknown) {
        console.error('Action error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
        return { success: false, error: errorMessage };
    }
}

export async function updateNavigationSettingsAction(formData: FormData) {
    const parseJson = <T>(key: string): T[] => {
        try {
            const value = formData.get(key) as string;
            return value ? JSON.parse(value) : [];
        } catch {
            return [];
        }
    };

    const settings = {
        headerLinks: parseJson<NavLink>('headerLinks'),
        footerShopLinks: parseJson<NavLink>('footerShopLinks'),
        footerServiceLinks: parseJson<NavLink>('footerServiceLinks'),
        footerLegalLinks: parseJson<NavLink>('footerLegalLinks'),
    };

    try {
        const { updateNavigationSettings } = await import('@/lib/settings');
        const success = await updateNavigationSettings(settings);

        if (!success) {
            return { success: false, error: 'Failed to update navigation settings' };
        }

        revalidatePath('/admin/design');
        revalidatePath('/'); // Revalidate storefront
        return { success: true };
    } catch (error: unknown) {
        console.error('Action error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
        return { success: false, error: errorMessage };
    }
}

export async function updateBrandingSettingsAction(formData: FormData) {
    const parseJson = <T>(key: string): T[] => {
        try {
            const value = formData.get(key) as string;
            return value ? JSON.parse(value) : [];
        } catch {
            return [];
        }
    };

    const settings = {
        siteName: formData.get('siteName') as string,
        tagline: formData.get('tagline') as string,
        logoUrl: formData.get('logoUrl') as string,
        primaryColor: formData.get('primaryColor') as string,
        accentColor: formData.get('accentColor') as string,
        contactAddress: formData.get('contactAddress') as string,
        contactEmail: formData.get('contactEmail') as string,
        contactPhones: parseJson<string>('contactPhones'),
        socialLinks: parseJson<SocialLink>('socialLinks'),
    };

    try {
        const { updateBrandingSettings } = await import('@/lib/settings');
        const success = await updateBrandingSettings(settings);

        if (!success) {
            return { success: false, error: 'Failed to update branding settings' };
        }

        revalidatePath('/admin/design');
        revalidatePath('/'); // Revalidate storefront
        return { success: true };
    } catch (error: unknown) {
        console.error('Action error:', error);
        const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
        return { success: false, error: errorMessage };
    }
}

