'use client';

import { STAGE_CONFIG } from '@/lib/pipeline/types';
import type { PipelineStage } from '@/lib/pipeline/types';
import { 
    Upload, 
    Sparkles, 
    Brain, 
    CheckCircle2, 
    Globe,
    ArrowRight,
    Package,
    Play,
    Image as ImageIcon,
    Download,
    AlertCircle
} from 'lucide-react';

interface PipelineFlowVisualizationProps {
    currentTab: PipelineStage;
    counts: { status: string; count: number }[];
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

// Stage to icon mapping (STAGE_CONFIG doesn't have icon property)
const stageIconMap: Record<string, string> = {
    imported: "Inbox",
    scraping: "Download",
    consolidating: "Merge",
    finalizing: "CheckCircle",
    published: "Store",
    failed: "AlertCircle",
};

const WORKFLOW_ORDER: PipelineStage[] = [
    "imported",
    "scraping",
    "consolidating",
    "finalizing",
    "published",
    "failed",
];

export function PipelineFlowVisualization({ currentTab, counts }: PipelineFlowVisualizationProps) {
    const currentIndex = WORKFLOW_ORDER.indexOf(currentTab);
    const currentConfig = STAGE_CONFIG[currentTab];
    // Fallback bgColor - use lightened version of color or default gray
    const currentBgColor = currentConfig ? `${currentConfig.color}15` : "#f3f4f6";
    return (
        <div className="bg-card rounded-xl border border-border p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    Pipeline Flow
                </h3>
                <span className="text-sm text-muted-foreground">
                    Current: <span className="font-medium text-primary">{currentConfig.label}</span>
                </span>
            </div>

            <div className="relative overflow-x-auto pb-4">
                <div className="flex items-center justify-between min-w-max px-2">
                    {WORKFLOW_ORDER.map((tab, index) => {
                        const config = STAGE_CONFIG[tab];
                        const count = counts.find(c => c.status === tab)?.count ?? 0;
                        const isActive = index === currentIndex;
                        const isCompleted = index < currentIndex;
                        const Icon = iconMap[stageIconMap[tab]] || Upload;

                        return (
                            <div key={tab} className="flex items-center">
                                <div className="flex flex-col items-center">
                                    <div 
                                        className={`relative w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                                            isActive 
                                                ? 'bg-primary border-primary text-white ring-4 ring-primary/20 scale-110' 
                                                : isCompleted
                                                    ? 'bg-primary border-primary text-white'
                                                    : 'bg-card border-border text-muted-foreground'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {count > 0 && (
                                            <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                                                isActive || isCompleted 
                                                    ? 'bg-gray-900 text-white' 
                                                    : 'bg-muted text-muted-foreground'
                                            }`}>
                                                {count > 99 ? '99+' : count}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`mt-2 text-xs font-medium whitespace-nowrap ${
                                        isActive ? 'text-primary' : isCompleted ? 'text-primary' : 'text-muted-foreground'
                                    }`}>
                                        {config.label}
                                    </span>
                                </div>
                                
                                {index < WORKFLOW_ORDER.length - 1 && (
                                    <ArrowRight className={`h-4 w-4 mx-2 flex-shrink-0 ${
                                        isCompleted ? 'text-primary' : 'text-gray-200'
                                    }`} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: currentBgColor }}>
                <p className="text-sm">
                    <span className="font-medium" style={{ color: currentConfig.color }}>{currentConfig.label}:</span>{' '}
                    <span style={{ color: currentConfig.color }}>{currentConfig.description}</span>
                </p>            </div>
        </div>
    );
}
