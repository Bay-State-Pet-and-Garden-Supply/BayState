import { AdminPageShell } from '@/components/admin/admin-page-shell';
import {
    getCampaignBanner,
    getHomepageSettings,
} from '@/lib/settings';
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
            title="Site Design"
            description="Customize banners, homepage sections, and site appearance"
        >
            <DesignTabs
                initialBannerSettings={campaignBanner}
                initialHomepageSettings={homepageSettings}
            />
        </AdminPageShell>
    );
}

