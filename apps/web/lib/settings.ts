import { createClient } from '@/lib/supabase/server';
import type { PostgrestError } from '@supabase/supabase-js';

export interface BannerMessage {
  text: string;
  linkText?: string;
  linkHref?: string;
}

export interface CampaignBannerSettings {
  enabled: boolean;
  messages: BannerMessage[];
  variant: 'info' | 'promo' | 'seasonal';
  cycleInterval: number; // Milliseconds between transitions
  // Legacy field for backwards compatibility
  message?: string;
  link_text?: string;
  link_href?: string;
}

export interface HeroSettings {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  ctaText?: string;
  ctaLink?: string;
}

export interface HeroSlide {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string;
  linkUrl: string;
  linkText?: string;
}

export interface HomepageSettings {
  hero: HeroSettings;
  heroSlides: HeroSlide[];
  heroSlideInterval: number; // ms between slides
  featuredProductIds: string[];
  storeHours: string; // Markdown or simple text
}

export interface NavLink {
  label: string;
  href: string;
  openInNewTab?: boolean;
}

export interface NavigationSettings {
  headerLinks: NavLink[];
  footerShopLinks: NavLink[];
  footerServiceLinks: NavLink[];
  footerLegalLinks: NavLink[];
}

export interface SocialLink {
  platform: 'facebook' | 'twitter' | 'instagram' | 'youtube' | 'tiktok';
  url: string;
}

export interface BrandingSettings {
  siteName: string;
  tagline: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  contactAddress: string;
  contactEmail: string;
  contactPhones: string[];
  socialLinks: SocialLink[];
}

export interface SiteSettings {
  campaign_banner: CampaignBannerSettings;
  homepage: HomepageSettings;
  navigation: NavigationSettings;
  branding: BrandingSettings;
}

const defaultSettings: SiteSettings = {
  campaign_banner: {
    enabled: false,
    messages: [],
    variant: 'info',
    cycleInterval: 5000,
  },
  homepage: {
    hero: {
      title: 'Welcome to Bay State Pet & Garden',
      subtitle: 'Your local source for pet supplies and garden needs.',
      imageUrl: '/hero-placeholder.jpg',
      ctaText: 'Shop Now',
      ctaLink: '/products',
    },
    featuredProductIds: [],
    heroSlides: [],
    heroSlideInterval: 5000,
    storeHours: 'Mon-Fri: 9am - 6pm\nSat: 9am - 5pm\nSun: 10am - 4pm',
  },
  navigation: {
    headerLinks: [
      { label: 'Products', href: '/products' },
      { label: 'Brands', href: '/brands' },
      { label: 'Services', href: '/services' },
      { label: 'About', href: '/about' },
    ],
    footerShopLinks: [
      { label: 'All Products', href: '/products' },
      { label: 'Services', href: '/services' },
      { label: 'Brands', href: '/brands' },
    ],
    footerServiceLinks: [
      { label: 'Propane Refill', href: '/services/propane' },
      { label: 'Equipment Rentals', href: '/services/rentals' },
    ],
    footerLegalLinks: [
      { label: 'Shipping', href: '/shipping' },
      { label: 'Returns', href: '/returns' },
      { label: 'Privacy / Security', href: '/privacy' },
      { label: 'Career Opportunities', href: '/careers' },
    ],
  },
  branding: {
    siteName: 'Bay State Pet & Garden',
    tagline: 'From big to small, we feed them all!',
    logoUrl: '/logo.png',
    primaryColor: '#1e3a5f',
    accentColor: '#22c55e',
    contactAddress: '429 Winthrop Street\nTaunton, MA 02780',
    contactEmail: 'sales@baystatepet.com',
    contactPhones: ['(508) 821-3704', '(774) 226-9845'],
    socialLinks: [
      { platform: 'facebook', url: 'https://www.facebook.com/baystatepet' },
      { platform: 'twitter', url: 'https://twitter.com/BayStatePet' },
      { platform: 'instagram', url: 'https://www.instagram.com/baystatepet/' },
    ],
  },
};

/**
 * Normalizes campaign banner settings for backwards compatibility.
 * Converts legacy single-message format to new array format.
 */
function normalizeCampaignBanner(settings: CampaignBannerSettings): CampaignBannerSettings {
  // Ensure default values are present
  const normalized: CampaignBannerSettings = {
    ...defaultSettings.campaign_banner,
    ...settings,
  };

  // If messages array exists and has items, use it
  if (normalized.messages && normalized.messages.length > 0) {
    return normalized;
  }

  // Convert legacy single-message format to array format
  if (normalized.message) {
    return {
      ...normalized,
      messages: [{
        text: normalized.message,
        linkText: normalized.link_text,
        linkHref: normalized.link_href,
      }],
    };
  }

  return normalized;
}

/**
 * Fetches a site setting by key.
 */
export async function getSetting<K extends keyof SiteSettings>(
  key: K
): Promise<SiteSettings[K]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .single();

  if (error) {
    // PGRST116: JSON object requested, multiple (or no) rows returned
    // This typically means the setting row doesn't exist yet
    if (error.code === 'PGRST116') {
      return defaultSettings[key];
    }

    console.error(`Error fetching setting ${key}:`, JSON.stringify(error, null, 2));
    return defaultSettings[key];
  }

  if (!data) {
    return defaultSettings[key];
  }

  return data.value as SiteSettings[K];
}

/**
 * Updates a site setting.
 */
export async function updateSetting<K extends keyof SiteSettings>(
  key: K,
  value: SiteSettings[K]
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('site_settings')
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (error) {
    console.error(`Error updating setting ${key}:`, error.message, error.details, error.hint);
    return false;
  }

  return true;
}

/**
 * Fetches the campaign banner settings.
 */
export async function getCampaignBanner(): Promise<CampaignBannerSettings> {
  const settings = await getSetting('campaign_banner');
  return normalizeCampaignBanner(settings);
}

/**
 * Updates the campaign banner settings.
 */
export async function updateCampaignBanner(
  settings: CampaignBannerSettings
): Promise<boolean> {
  return updateSetting('campaign_banner', settings);
}

/**
 * Fetches the homepage settings.
 */
export async function getHomepageSettings(): Promise<HomepageSettings> {
  const settings = await getSetting('homepage');
  // Merge with defaults to ensure all fields exist
  return {
    ...defaultSettings.homepage,
    ...settings,
    hero: { ...defaultSettings.homepage.hero, ...settings?.hero },
  };
}

/**
 * Updates the homepage settings.
 */
export async function updateHomepageSettings(
  settings: HomepageSettings
): Promise<boolean> {
  return updateSetting('homepage', settings);
}

/**
 * Fetches the navigation settings.
 */
export async function getNavigationSettings(): Promise<NavigationSettings> {
  const settings = await getSetting('navigation');
  return {
    ...defaultSettings.navigation,
    ...settings,
  };
}

/**
 * Updates the navigation settings.
 */
export async function updateNavigationSettings(
  settings: NavigationSettings
): Promise<boolean> {
  return updateSetting('navigation', settings);
}

/**
 * Fetches the branding settings.
 */
export async function getBrandingSettings(): Promise<BrandingSettings> {
  const settings = await getSetting('branding');
  return {
    ...defaultSettings.branding,
    ...settings,
  };
}

/**
 * Updates the branding settings.
 */
export async function updateBrandingSettings(
  settings: BrandingSettings
): Promise<boolean> {
  return updateSetting('branding', settings);
}
