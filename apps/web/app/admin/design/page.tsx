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
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Site Design</h1>
                <p className="text-muted-foreground">
                    Customize banners, homepage sections, and site appearance
                </p>
            </div>

            <DesignTabs
                initialBannerSettings={campaignBanner}
                initialHomepageSettings={homepageSettings}
            />
        </div>
    );
}

