'use client';

import { Badge } from '@/components/ui/badge';
import type { PipelineStatus, StatusCount } from '@/lib/pipeline';
import { 
  Upload, 
  Sparkles, 
  Brain, 
  CheckCircle2, 
  Globe,
  ArrowRight,
  AlertCircle
} from 'lucide-react';

interface PipelineStatusTabsProps {
    counts: StatusCount[];
    activeStatus: PipelineStatus;
    onStatusChange: (status: PipelineStatus) => void;
}

const statusConfig: Record<PipelineStatus, { 
    label: string; 
    color: string; 
    bgColor: string;
    icon: React.ElementType;
    readOnly?: boolean;
    description: string;
}> = {
    staging: { 
        label: 'Imported', 
        color: 'text-gray-600', 
        bgColor: 'bg-gray-100',
        icon: Upload,
        readOnly: true,
        description: 'New imports ready for enhancement'
    },
    scraped: { 
        label: 'Enhanced', 
        color: 'text-blue-600', 
        bgColor: 'bg-blue-50',
        icon: Sparkles,
        description: 'Web scraped & AI enriched'
    },
    consolidated: { 
        label: 'Ready for Review', 
        color: 'text-yellow-600', 
        bgColor: 'bg-yellow-50',
        icon: Brain,
        description: 'AI consolidated, needs approval'
    },
    approved: { 
        label: 'Verified', 
        color: 'text-green-600', 
        bgColor: 'bg-green-50',
        icon: CheckCircle2,
        description: 'Human verified, ready to publish'
    },
    published: { 
        label: 'Live', 
        color: 'text-emerald-600', 
        bgColor: 'bg-emerald-50',
        icon: Globe,
        description: 'Published to storefront'
    },
    failed: { 
        label: 'Failed', 
        color: 'text-red-600', 
        bgColor: 'bg-red-50',
        icon: AlertCircle,
        description: 'Processing failed, needs retry'
    },
};

const flowOrder: PipelineStatus[] = ['staging', 'scraped', 'consolidated', 'approved', 'published'];

export function PipelineStatusTabs({ counts, activeStatus, onStatusChange }: PipelineStatusTabsProps) {
    const activeIndex = flowOrder.indexOf(activeStatus);

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                    Pipeline Stages
                </h3>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-gray-400" />
                        In Progress
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        Complete
                    </span>
                </div>
            </div>

            {/* Flow Steps */}
            <div className="flex items-center gap-2" role="tablist" aria-label="Pipeline Stages">
                {flowOrder.map((status, index) => {
                    const config = statusConfig[status];
                    const countData = counts.find((c) => c.status === status);
                    const count = countData?.count ?? 0;
                    const isActive = activeStatus === status;
                    const isCompleted = index < activeIndex;
                    const Icon = config.icon;

                    return (
                        <div key={status} className="flex items-center">
                            <button
                                role="tab"
                                aria-selected={isActive}
                                aria-controls="main-content"
                                id={`tab-${status}`}
                                onClick={() => onStatusChange(status)}
                                className={`group flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                    isActive
                                        ? `bg-gray-900 text-white shadow-lg scale-105`
                                        : isCompleted
                                            ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                                            : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                                }`}
                            >
                                <Icon className={`h-4 w-4 ${isActive ? 'text-white' : isCompleted ? 'text-green-600' : 'text-gray-400'}`} />
                                <span>{config.label}</span>
                                <Badge
                                    variant="secondary"
                                    className={`px-2 py-0.5 text-xs ml-1 ${
                                        isActive 
                                            ? 'bg-white/20 text-white' 
                                            : isCompleted
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-gray-200 text-gray-600'
                                    }`}
                                >
                                    {count}
                                </Badge>
                            </button>
                            
                            {/* Arrow connector */}
                            {index < flowOrder.length - 1 && (
                                <ArrowRight className={`h-4 w-4 mx-1 ${
                                    isCompleted ? 'text-green-400' : 'text-gray-300'
                                }`} />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Current Stage Description */}
            <div className={`mt-4 p-3 rounded-lg text-sm ${statusConfig[activeStatus].bgColor} ${statusConfig[activeStatus].color}`}>
                <div className="flex items-center gap-2">
                    {(() => {
                        const Icon = statusConfig[activeStatus].icon;
                        return <Icon className="h-4 w-4" />;
                    })()}
                    <span className="font-medium">{statusConfig[activeStatus].label}:</span>
                    <span>{statusConfig[activeStatus].description}</span>
                </div>
            </div>
        </div>
    );
}
