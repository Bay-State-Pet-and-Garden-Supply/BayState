'use client';

import { useState } from 'react';
import { Megaphone, Home, Navigation, Paintbrush } from 'lucide-react';
import { BannersTab } from './banners-tab';
import { HomepageTab } from './homepage-tab';
import { NavigationTab } from './navigation-tab';
import { BrandingTab } from './branding-tab';
import type {
 CampaignBannerSettings,
 HomepageSettings,
 NavLink,
 SocialLink,
} from '@/lib/settings';

interface DesignTabsProps {
 initialBannerSettings: CampaignBannerSettings;
 initialHomepageSettings: HomepageSettings;
 initialNavigationSettings: {
   headerLinks: NavLink[];
   footerShopLinks: NavLink[];
   footerServiceLinks: NavLink[];
   footerLegalLinks: NavLink[];
 };
 initialBrandingSettings: {
   siteName: string;
   tagline: string;
   logoUrl: string;
   primaryColor: string;
   accentColor: string;
   contactAddress: string;
   contactEmail: string;
   contactPhones: string[];
   socialLinks: SocialLink[];
 };
 categories: any[];
 brands: any[];
 initialFeaturedProducts: any[];
}

type TabId = 'banners' | 'homepage' | 'navigation' | 'branding';

interface Tab {
 id: TabId;
 label: string;
 icon: React.ReactNode;
 available: boolean;
}

const tabs: Tab[] = [
 { id: 'banners', label: 'Banners', icon: <Megaphone className="h-4 w-4" />, available: true },
 { id: 'homepage', label: 'Homepage', icon: <Home className="h-4 w-4" />, available: true },
 { id: 'navigation', label: 'Navigation', icon: <Navigation className="h-4 w-4" />, available: true },
 { id: 'branding', label: 'Branding', icon: <Paintbrush className="h-4 w-4" />, available: true },
 ];

export function DesignTabs({
 initialBannerSettings,
 initialHomepageSettings,
 initialNavigationSettings,
 initialBrandingSettings,
 categories,
 brands,
 initialFeaturedProducts,
}: DesignTabsProps) {
 const [activeTab, setActiveTab] = useState<TabId>('banners');

 return (
 <div className="space-y-6">
 {/* Tab Navigation */}
 <div className="border-b">
 <nav className="-mb-px flex space-x-6">
 {tabs.map((tab) => (
 <button
 key={tab.id}
 onClick={() => tab.available && setActiveTab(tab.id)}
 disabled={!tab.available}
 className={`
 flex items-center gap-2 border-b px-1 py-3 text-sm font-medium transition-colors
 ${activeTab === tab.id
 ? 'border-primary text-primary'
 : tab.available
 ? 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
 : 'border-transparent text-muted-foreground/50 cursor-not-allowed'
 }
 `}
 >
 {tab.icon}
 {tab.label}
 {!tab.available && (
 <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded-none">Soon</span>
 )}
 </button>
 ))}
 </nav>
 </div>

 {/* Tab Content */}
 <div>
 {activeTab === 'banners' && (
 <BannersTab initialSettings={initialBannerSettings} />
 )}
 {activeTab === 'homepage' && (
 <HomepageTab 
   initialSettings={initialHomepageSettings} 
   categories={categories}
   brands={brands}
   initialFeaturedProducts={initialFeaturedProducts}
 />
 )}
 {activeTab === 'navigation' && <NavigationTab initialSettings={initialNavigationSettings} />}
 {activeTab === 'branding' && <BrandingTab initialSettings={initialBrandingSettings} />}
 </div>
 </div>
 );
}
