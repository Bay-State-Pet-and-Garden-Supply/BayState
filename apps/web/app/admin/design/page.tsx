import { Brush } from 'lucide-react';
import { AdminPageShell } from '@/components/admin/admin-page-shell';
import { getCampaignBanner, getHomepageSettings } from '@/lib/settings';
import { DesignTabs } from './design-tabs';

export const metadata = {
  title: 'Site Design | Bay State Pet & Garden',
  description: 'Customize banners, homepage, and site appearance',
};

export default async function DesignPage() {
  const [campaignBanner, homepageSettings] = await Promise.all([
    getCampaignBanner(),
    getHomepageSettings(),
  ]);

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
      />
    </AdminPageShell>
  );
}
