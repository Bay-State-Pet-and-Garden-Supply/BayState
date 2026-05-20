import { createClient, createPublicClient } from '@/lib/supabase/server';

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

interface HeroSettings {
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

export interface PromoGridItem {
  title: string;
  imageUrl: string;
  linkUrl: string;
}

export interface PromoGridSettings {
  leftBanner: PromoGridItem;
  rightCard1: PromoGridItem;
  rightCard2: PromoGridItem;
}

export interface MidBannerSettings {
  enabled: boolean;
  title: string;
  imageUrl: string;
  linkUrl: string;
}

export interface DepartmentItem {
  id: string;
  name: string;
  slug: string;
}

export interface DepartmentSettings {
  enabled: boolean;
  title: string;
  items: DepartmentItem[];
}

export interface BrandsSettings {
  enabled: boolean;
  title: string;
  limit: number;
}

export interface HomepageSettings {
  hero: HeroSettings;
  heroSlides: HeroSlide[];
  heroSlideInterval: number; // ms between slides
  heroMode?: 'carousel' | 'single' | 'hidden';
  featuredProductIds: string[];
  featuredTitle?: string;
  storeHours: string; // Markdown or simple text
  promoGrid?: PromoGridSettings;
  midBanner?: MidBannerSettings;
  departments?: DepartmentSettings;
  brandsSection?: BrandsSettings;
}

export interface NavLink {
  label: string;
  href: string;
  openInNewTab?: boolean;
}

interface NavigationSettings {
  headerLinks: NavLink[];
  footerShopLinks: NavLink[];
  footerServiceLinks: NavLink[];
  footerLegalLinks: NavLink[];
}

export interface SocialLink {
  platform: 'facebook' | 'twitter' | 'instagram' | 'youtube' | 'tiktok';
  url: string;
}

interface BrandingSettings {
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

interface SiteSettings {
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
      imageUrl: '/images/legacy/baby-chicks-are-here-s-ider.png',
      ctaText: 'Shop Now',
      ctaLink: '/products',
    },
    heroMode: 'carousel',
    featuredTitle: 'Featured Products',
    featuredProductIds: [],
    heroSlides: [
      {
        id: '1',
        title: 'Baby Chicks',
        subtitle: 'In stock today',
        imageUrl: '/images/legacy/baby-chicks-are-here-s-ider.png',
        linkUrl: '/c/chicken-poultry',
        linkText: 'Shop Now'
      },
      {
        id: '2',
        title: 'Mulch & Loam',
        subtitle: 'In stock now',
        imageUrl: '/images/legacy/in-stock-mulch-slider.png',
        linkUrl: '/c/lawn-garden',
        linkText: 'Shop Now'
      },
      {
        id: '3',
        title: 'Seed Starting Supplies',
        subtitle: 'Get ready for spring',
        imageUrl: '/images/legacy/seed-starting-supplies.png',
        linkUrl: '/c/lawn-garden',
        linkText: 'Shop Now'
      },
      {
        id: '4',
        title: 'Jonathan Green',
        subtitle: 'Lawn Care',
        imageUrl: '/images/legacy/choose-jonathan-green.png',
        linkUrl: '/b/jonathan-green',
        linkText: 'Shop Now'
      },
      {
        id: '5',
        title: 'Budget Friendly',
        subtitle: 'Pet Supplies',
        imageUrl: '/images/legacy/budget-friendly-pet-supplies.png',
        linkUrl: '/c/dog',
        linkText: 'Shop Now'
      }
    ],
    heroSlideInterval: 5000,
    storeHours: 'Mon-Fri: 9am - 6pm\nSat: 9am - 5pm\nSun: 10am - 4pm',
    promoGrid: {
      leftBanner: {
        title: 'Winter Essentials',
        imageUrl: '/images/legacy/img1.png',
        linkUrl: '/c/lawn-garden-seasonal-outdoor-utility',
      },
      rightCard1: {
        title: 'Bee Nuc Pre-Order',
        imageUrl: '/images/legacy/img2.png',
        linkUrl: '/c/farm-animal',
      },
      rightCard2: {
        title: 'Wood Pellets Sale',
        imageUrl: '/images/legacy/img3.png',
        linkUrl: '/c/home',
      },
    },
    midBanner: {
      enabled: true,
      title: 'Country Gift Shop',
      imageUrl: '/images/legacy/img4.png',
      linkUrl: '/c/home',
    },
    departments: {
      enabled: true,
      title: 'Shop by department',
      items: [
        { id: 'dog', name: 'Pet Supplies', slug: 'dog' },
        { id: 'farm-animal', name: 'Farm & Livestock', slug: 'farm-animal' },
        { id: 'lawn-garden', name: 'Lawn & Garden', slug: 'lawn-garden' },
        { id: 'home', name: 'Home & Fuel', slug: 'home' },
        { id: 'lawn-garden-seasonal-outdoor-utility', name: 'Seasonal Shoppe', slug: 'lawn-garden-seasonal-outdoor-utility' },
      ],
    },
    brandsSection: {
      enabled: true,
      title: 'Brands we carry',
      limit: 10,
    },
  },
  navigation: {
    headerLinks: [
      { label: 'Products', href: '/products' },
      { label: 'Brands', href: '/brands' },
      { label: 'About', href: '/about' },
    ],
    footerShopLinks: [
      { label: 'All Products', href: '/products' },

      { label: 'Brands', href: '/brands' },
    ],
    footerServiceLinks: [],
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
async function getSetting<K extends keyof SiteSettings>(
  key: K
): Promise<SiteSettings[K]> {
  const supabase = createPublicClient();
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
async function updateSetting<K extends keyof SiteSettings>(
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
  const defaultHome = defaultSettings.homepage;

  return {
    ...defaultHome,
    ...settings,
    hero: { ...defaultHome.hero, ...settings?.hero },
    promoGrid: settings?.promoGrid 
      ? {
          leftBanner: {
            title: settings.promoGrid.leftBanner?.title ?? defaultHome.promoGrid!.leftBanner.title,
            imageUrl: settings.promoGrid.leftBanner?.imageUrl ?? defaultHome.promoGrid!.leftBanner.imageUrl,
            linkUrl: settings.promoGrid.leftBanner?.linkUrl ?? defaultHome.promoGrid!.leftBanner.linkUrl,
          },
          rightCard1: {
            title: settings.promoGrid.rightCard1?.title ?? defaultHome.promoGrid!.rightCard1.title,
            imageUrl: settings.promoGrid.rightCard1?.imageUrl ?? defaultHome.promoGrid!.rightCard1.imageUrl,
            linkUrl: settings.promoGrid.rightCard1?.linkUrl ?? defaultHome.promoGrid!.rightCard1.linkUrl,
          },
          rightCard2: {
            title: settings.promoGrid.rightCard2?.title ?? defaultHome.promoGrid!.rightCard2.title,
            imageUrl: settings.promoGrid.rightCard2?.imageUrl ?? defaultHome.promoGrid!.rightCard2.imageUrl,
            linkUrl: settings.promoGrid.rightCard2?.linkUrl ?? defaultHome.promoGrid!.rightCard2.linkUrl,
          },
        }
      : defaultHome.promoGrid,
    midBanner: settings?.midBanner
      ? {
          enabled: settings.midBanner.enabled ?? defaultHome.midBanner!.enabled,
          title: settings.midBanner.title ?? defaultHome.midBanner!.title,
          imageUrl: settings.midBanner.imageUrl ?? defaultHome.midBanner!.imageUrl,
          linkUrl: settings.midBanner.linkUrl ?? defaultHome.midBanner!.linkUrl,
        }
      : defaultHome.midBanner,
    departments: settings?.departments
      ? {
          enabled: settings.departments.enabled ?? defaultHome.departments!.enabled,
          title: settings.departments.title ?? defaultHome.departments!.title,
          items: settings.departments.items ?? defaultHome.departments!.items,
        }
      : defaultHome.departments,
    brandsSection: settings?.brandsSection
      ? {
          enabled: settings.brandsSection.enabled ?? defaultHome.brandsSection!.enabled,
          title: settings.brandsSection.title ?? defaultHome.brandsSection!.title,
          limit: settings.brandsSection.limit ?? defaultHome.brandsSection!.limit,
        }
      : defaultHome.brandsSection,
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
