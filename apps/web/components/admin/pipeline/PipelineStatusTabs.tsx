'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import type { PipelineStatus, StatusCount } from '@/lib/pipeline';
import { 
    PipelineTab,
    TAB_CONFIG,
    getTabOrder,
    isStatusTab,
    isMonitoringTab,
    isActionTab
} from '@/lib/pipeline-tabs';
import { 
    Upload, 
    Sparkles, 
    Brain, 
    CheckCircle2, 
    Globe,
    ArrowRight,
    AlertCircle,
    Play,
    Image as ImageIcon,
    Download
} from 'lucide-react';

interface PipelineStatusTabsProps {
    counts: StatusCount[];
    activeTab: PipelineTab;
    onTabChange: (tab: PipelineTab) => void;
    monitoringCounts?: {
        'active-runs': number;
        'active-consolidations': number;
    };
    actionCounts?: {
        'images': number;
    };
}

const iconMap: Record<string, React.ElementType> = {
    Inbox: Upload,
    Play: Play,
    Download: Download,
    Brain: Brain,
    Merge: Sparkles,
    CheckCircle: CheckCircle2,
    Image: ImageIcon,
    Upload: Download,
    Store: Globe,
    AlertCircle: AlertCircle,
};

const flowOrder = getTabOrder();

export function PipelineStatusTabs({ 
    counts, 
    activeTab, 
    onTabChange,
    monitoringCounts = { 'active-runs': 0, 'active-consolidations': 0 },
    actionCounts = { 'images': 0 }
}: PipelineStatusTabsProps) {
    const activeIndex = flowOrder.indexOf(activeTab);
    const [showLegend, setShowLegend] = useState(false);
    const activeConfig = TAB_CONFIG[activeTab] ?? TAB_CONFIG.registered;

    const getCount = (tab: PipelineTab): number => {
        if (isMonitoringTab(tab)) {
            return monitoringCounts[tab as 'active-runs' | 'active-consolidations'] || 0;
        }
        if (isActionTab(tab)) {
            return actionCounts[tab as 'images'] || 0;
        }
        const countData = counts.find((c) => c.status === tab);
        return countData?.count ?? 0;
    };

    const renderTabButton = (tab: PipelineTab, index: number) => {
        const config = TAB_CONFIG[tab];
        const count = getCount(tab);
        const isActive = activeTab === tab;
        const isCompleted = index < activeIndex && isStatusTab(tab);
        const Icon = iconMap[config.icon] || Upload;

        return (
            <button
                key={tab}
                role="tab"
                aria-selected={isActive}
                aria-controls="main-content"
                id={`tab-${tab}`}
                onClick={() => onTabChange(tab)}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#008850] focus:ring-offset-2 whitespace-nowrap ${
                    isActive
                        ? `bg-[#008850] text-white shadow-lg scale-105`
                        : isCompleted
                            ? 'bg-[#008850]/10 text-[#008850] border border-[#008850]/20 hover:bg-[#008850]/20'
                            : config.bgColor + ' ' + config.color + ' border hover:opacity-80'
                }`}
                style={{
                    borderColor: isActive ? 'transparent' : undefined
                }}
            >
                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : ''}`} />
                <span>{config.label}</span>
                {count > 0 && (
                    <Badge
                        variant="secondary"
                        className={`px-2 py-0.5 text-xs ml-1 ${
                            isActive 
                                ? 'bg-white/20 text-white' 
                                : 'bg-current/10'
                        }`}
                    >
                        {count}
                    </Badge>
                )}
            </button>
        );
    };

    const monitoringTabs = flowOrder.filter(isMonitoringTab);
    const statusTabs = flowOrder.filter(isStatusTab);
    const actionTabs = flowOrder.filter(isActionTab);

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                        Pipeline
                    </h3>
                    <button
                        onClick={() => setShowLegend(!showLegend)}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                        {showLegend ? 'Hide' : 'Show'} legend
                    </button>
                </div>
                {showLegend && (
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-blue-400" />
                            Monitoring
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-gray-400" />
                            Status
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-purple-400" />
                            Action
                        </span>
                    </div>
                )}
            </div>

            {/* All Tabs - Horizontal Scroll */}
            <div 
                className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin" 
                role="tablist" 
                aria-label="Pipeline Tabs"
            >
                {monitoringTabs.map((tab, idx) => (
                    <div key={tab} className="flex items-center">
                        {renderTabButton(tab, flowOrder.indexOf(tab))}
                        {idx < monitoringTabs.length - 1 && (
                            <span className="w-px h-6 bg-gray-200 mx-1" />
                        )}
                    </div>
                ))}
                
                <span className="w-px h-6 bg-gray-300 mx-2" />
                
                {statusTabs.map((tab, idx) => (
                    <div key={tab} className="flex items-center">
                        {renderTabButton(tab, flowOrder.indexOf(tab))}
                        {idx < statusTabs.length - 1 && (
                            <ArrowRight className={`h-4 w-4 mx-1 ${
                                flowOrder.indexOf(tab) < activeIndex ? 'text-[#008850]' : 'text-gray-300'
                            }`} />
                        )}
                    </div>
                ))}
                
                <span className="w-px h-6 bg-gray-300 mx-2" />
                
                {actionTabs.map((tab, idx) => (
                    <div key={tab} className="flex items-center">
                        {renderTabButton(tab, flowOrder.indexOf(tab))}
                        {idx < actionTabs.length - 1 && (
                            <span className="w-px h-6 bg-gray-200 mx-1" />
                        )}
                    </div>
                ))}
            </div>

            {/* Current Tab Description */}
            <div 
                className={`mt-4 p-3 rounded-lg text-sm ${activeConfig.bgColor} ${activeConfig.color}`}
            >
                <div className="flex items-center gap-2">
                    {(() => {
                        const Icon = iconMap[activeConfig.icon] || Upload;
                        return <Icon className="h-4 w-4" />;
                    })()}
                    <span className="font-medium">{activeConfig.label}:</span>
                    <span>{activeConfig.description}</span>
                </div>
            </div>
        </div>
    );
}
