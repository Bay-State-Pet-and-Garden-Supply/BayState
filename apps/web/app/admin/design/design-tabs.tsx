'use client';

import { useState } from 'react';
import { Megaphone, Home, Navigation, Paintbrush, Clock } from 'lucide-react';
import { BannersTab } from './banners-tab';
import { HomepageTab } from './homepage-tab';
import type {
    CampaignBannerSettings,
    HomepageSettings,
} from '@/lib/settings';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DesignTabsProps {
    initialBannerSettings: CampaignBannerSettings;
    initialHomepageSettings: HomepageSettings;
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
    { id: 'navigation', label: 'Navigation', icon: <Navigation className="h-4 w-4" />, available: false },
    { id: 'branding', label: 'Branding', icon: <Paintbrush className="h-4 w-4" />, available: false },
];

function ComingSoonTab({ tabId }: { tabId: TabId }) {
    const tabLabel = tabs.find(t => t.id === tabId)?.label || 'This section';
    
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Clock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                        <CardTitle>{tabLabel} Settings</CardTitle>
                        <CardDescription>
                            This feature is coming soon
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4 mb-4">
                        <Clock className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">Coming Soon</h3>
                    <p className="text-muted-foreground max-w-md">
                        The {tabLabel.toLowerCase()} settings feature is currently under development. 
                        Check back soon for updates.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

export function DesignTabs({
    initialBannerSettings,
    initialHomepageSettings,
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
                                flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors
                                ${activeTab === tab.id
                                    ? 'border-primary text-primary'
                                    : tab.available
                                        ? 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground'
                                        : 'border-transparent text-muted-foreground/50 cursor-not-allowed'
                                }
                            `}
                        >
                            {tab.icon}
                            {tab.label}
                            {!tab.available && (
                                <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded">Soon</span>
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
                {activeTab === 'homepage' && <HomepageTab initialSettings={initialHomepageSettings} />}
                {(activeTab === 'navigation' || activeTab === 'branding') && (
                    <ComingSoonTab tabId={activeTab} />
                )}
            </div>
        </div>
    );
}
