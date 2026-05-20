import { Brush } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { 
  getCampaignBanner, 
  getHomepageSettings, 
  getNavigationSettings, 
  getBrandingSettings 
} from '@/lib/settings';
import { DesignTabs } from './design-tabs';
import { getNavCategories, getBrands, getProductsByIds } from '@/lib/data';

export const metadata = {
  title: 'Site Design | Bay State Pet & Garden',
  description: 'Customize banners, homepage, and site appearance',
};

export default async function DesignPage() {
  const [
    campaignBanner, 
    homepageSettings, 
    navigationSettings, 
    brandingSettings,
    categories,
    brands
  ] = await Promise.all([
    getCampaignBanner(),
    getHomepageSettings(),
    getNavigationSettings(),
    getBrandingSettings(),
    getNavCategories(),
    getBrands(),
  ]);

  const initialFeaturedProducts = homepageSettings.featuredProductIds && homepageSettings.featuredProductIds.length > 0
    ? await getProductsByIds(homepageSettings.featuredProductIds)
    : [];

  return (
    <AdminPageShell
      title="Site design"
      description="Adjust homepage sections, promotional banners, and visual storefront settings from one workspace."
      icon={<Brush className="h-5 w-5" />}
      eyebrow="Workspace view"
    >
      <DesignTabs
        initialBannerSettings={campaignBanner}
        initialHomepageSettings={homepageSettings}
        initialNavigationSettings={navigationSettings}
        initialBrandingSettings={brandingSettings}
        categories={categories}
        brands={brands}
        initialFeaturedProducts={initialFeaturedProducts}
      />
    </AdminPageShell>
  );
}
