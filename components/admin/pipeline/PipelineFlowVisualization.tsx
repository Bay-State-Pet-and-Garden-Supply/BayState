'use client';

import { PipelineStatus } from '@/lib/pipeline';
import { 
  Upload, 
  Sparkles, 
  Brain, 
  CheckCircle2, 
  Globe,
  ArrowRight,
  Package
} from 'lucide-react';

interface PipelineFlowVisualizationProps {
  currentStage: PipelineStatus;
  counts: { status: PipelineStatus; count: number }[];
}

const stages: { status: PipelineStatus; label: string; icon: React.ElementType; description: string }[] = [
  { 
    status: 'staging', 
    label: 'Imported', 
    icon: Upload,
    description: 'Raw product data imported'
  },
  { 
    status: 'scraped', 
    label: 'Enhanced', 
    icon: Sparkles,
    description: 'Web scraped & enriched'
  },
  { 
    status: 'consolidated', 
    label: 'Ready for Review', 
    icon: Brain,
    description: 'AI consolidated & normalized'
  },
  { 
    status: 'approved', 
    label: 'Verified', 
    icon: CheckCircle2,
    description: 'Human verified'
  },
  { 
    status: 'published', 
    label: 'Live', 
    icon: Globe,
    description: 'Published to store'
  },
];

export function PipelineFlowVisualization({ currentStage, counts }: PipelineFlowVisualizationProps) {
  const currentIndex = stages.findIndex(s => s.status === currentStage);
  
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Package className="h-5 w-5 text-blue-600" />
          ETL Pipeline Flow
        </h3>
        <span className="text-sm text-gray-500">
          Current Stage: <span className="font-medium text-blue-600">{stages[currentIndex]?.label}</span>
        </span>
      </div>
      
      {/* Flow Diagram */}
      <div className="relative">
        {/* Connecting Line */}
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 -translate-y-1/2 rounded-full" />
        
        {/* Active Progress Line */}
        <div 
          className="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-blue-500 to-green-500 -translate-y-1/2 rounded-full transition-all duration-500"
          style={{ width: `${(currentIndex / (stages.length - 1)) * 100}%` }}
        />
        
        {/* Stage Nodes */}
        <div className="relative flex justify-between">
          {stages.map((stage, index) => {
            const count = counts.find(c => c.status === stage.status)?.count ?? 0;
            const isActive = index === currentIndex;
            const isCompleted = index < currentIndex;
            const isPending = index > currentIndex;
            
            return (
              <div key={stage.status} className="flex flex-col items-center">
                {/* Node */}
                <div 
                  className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center border-3 transition-all duration-300 ${
                    isActive 
                      ? 'bg-blue-600 border-blue-600 text-white ring-4 ring-blue-200 scale-110' 
                      : isCompleted
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-white border-gray-300 text-gray-400'
                  }`}
                >
                  <stage.icon className="h-5 w-5" />
                  
                  {/* Count Badge */}
                  {count > 0 && (
                    <span className={`absolute -top-2 -right-2 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      isActive || isCompleted 
                        ? 'bg-gray-900 text-white' 
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      {count}
                    </span>
                  )}
                </div>
                
                {/* Label */}
                <div className="mt-3 text-center">
                  <p className={`text-sm font-semibold ${
                    isActive ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-gray-400'
                  }`}>
                    {stage.label}
                  </p>
                  <p className="text-xs text-gray-500 max-w-[100px] mt-1 leading-tight">
                    {stage.description}
                  </p>
                </div>
                
                {/* Arrow (except for last item) */}
                {index < stages.length - 1 && (
                  <div className="absolute top-6 left-0 right-0 flex justify-center pointer-events-none">
                    <div 
                      className="flex items-center"
                      style={{ 
                        position: 'absolute', 
                        left: `${((index + 0.5) / stages.length) * 100}%`,
                        right: `${((stages.length - index - 1.5) / stages.length) * 100}%`
                      }}
                    >
                      <ArrowRight className={`h-4 w-4 ${
                        isCompleted ? 'text-green-500' : 'text-gray-300'
                      }`} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Stage Explanation */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <p className="text-sm text-gray-600">
          <span className="font-medium text-gray-900">Current Stage:</span>{' '}
          {stages[currentIndex]?.description}.{' '}
          {currentIndex < stages.length - 1 && (
            <span>
              Next: {stages[currentIndex + 1]?.label} — {stages[currentIndex + 1]?.description}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
