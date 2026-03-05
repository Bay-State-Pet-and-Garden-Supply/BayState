'use client';

import { PipelineTab, TAB_CONFIG, getTabOrder } from '@/lib/pipeline-tabs';
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
    currentTab: PipelineTab;
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

export function PipelineFlowVisualization({ currentTab, counts }: PipelineFlowVisualizationProps) {
    const flowOrder = getTabOrder();
    const currentIndex = flowOrder.indexOf(currentTab);
    const currentConfig = TAB_CONFIG[currentTab];

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Package className="h-5 w-5 text-[#008850]" />
                    Pipeline Flow
                </h3>
                <span className="text-sm text-gray-500">
                    Current: <span className="font-medium text-[#008850]">{currentConfig.label}</span>
                </span>
            </div>

            <div className="relative overflow-x-auto pb-4">
                <div className="flex items-center justify-between min-w-max px-2">
                    {flowOrder.map((tab, index) => {
                        const config = TAB_CONFIG[tab];
                        const count = counts.find(c => c.status === tab)?.count ?? 0;
                        const isActive = index === currentIndex;
                        const isCompleted = index < currentIndex;
                        const Icon = iconMap[config.icon] || Upload;

                        return (
                            <div key={tab} className="flex items-center">
                                <div className="flex flex-col items-center">
                                    <div 
                                        className={`relative w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                                            isActive 
                                                ? 'bg-[#008850] border-[#008850] text-white ring-4 ring-[#008850]/20 scale-110' 
                                                : isCompleted
                                                    ? 'bg-[#008850] border-[#008850] text-white'
                                                    : 'bg-white border-gray-300 text-gray-400'
                                        }`}
                                    >
                                        <Icon className="h-4 w-4" />
                                        {count > 0 && (
                                            <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
                                                isActive || isCompleted 
                                                    ? 'bg-gray-900 text-white' 
                                                    : 'bg-gray-200 text-gray-600'
                                            }`}>
                                                {count > 99 ? '99+' : count}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`mt-2 text-xs font-medium whitespace-nowrap ${
                                        isActive ? 'text-[#008850]' : isCompleted ? 'text-[#008850]' : 'text-gray-400'
                                    }`}>
                                        {config.label}
                                    </span>
                                </div>
                                
                                {index < flowOrder.length - 1 && (
                                    <ArrowRight className={`h-4 w-4 mx-2 flex-shrink-0 ${
                                        isCompleted ? 'text-[#008850]' : 'text-gray-200'
                                    }`} />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: currentConfig.bgColor }}>
                <p className="text-sm">
                    <span className="font-medium" style={{ color: currentConfig.color }}>{currentConfig.label}:</span>{' '}
                    <span style={{ color: currentConfig.color }}>{currentConfig.description}</span>
                </p>            </div>
        </div>
    );
}
