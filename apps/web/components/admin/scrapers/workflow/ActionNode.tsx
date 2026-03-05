'use client';

import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import {
  Globe,
  Clock,
  Search,
  MousePointer,
  MousePointer2,
  Type,
  FileOutput,
  Wand2,
  RefreshCw,
  SearchX,
  SkipForward,
  GitBranch,
  ArrowDown,
  CheckCircle,
  LogIn,
  Code,
  Image,
  Merge,
  Scale,
  Braces,
} from 'lucide-react';

import { ActionNodeData } from '@/lib/admin/scrapers/types';
import { actionDefinitions } from '@/lib/admin/scrapers/action-definitions';
import { cn } from '@/lib/utils';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Globe,
  Clock,
  Search,
  MousePointer,
  MousePointer2,
  Type,
  FileOutput,
  Wand2,
  RefreshCw,
  SearchX,
  SkipForward,
  GitBranch,
  ArrowDown,
  CheckCircle,
  LogIn,
  Code,
  Image,
  Merge,
  Scale,
  Braces,
};

const colorMap: Record<string, string> = {
  blue: 'bg-blue-100 border-blue-300 text-blue-700',
  gray: 'bg-gray-100 border-gray-300 text-gray-700',
  purple: 'bg-purple-100 border-purple-300 text-purple-700',
  green: 'bg-green-100 border-green-300 text-green-700',
  teal: 'bg-teal-100 border-teal-300 text-teal-700',
  orange: 'bg-orange-100 border-orange-300 text-orange-700',
  cyan: 'bg-cyan-100 border-cyan-300 text-cyan-700',
  indigo: 'bg-indigo-100 border-indigo-300 text-indigo-700',
  yellow: 'bg-yellow-100 border-yellow-300 text-yellow-700',
  red: 'bg-red-100 border-red-300 text-red-700',
  slate: 'bg-slate-100 border-slate-300 text-slate-700',
  violet: 'bg-violet-100 border-violet-300 text-violet-700',
  stone: 'bg-stone-100 border-stone-300 text-stone-700',
  emerald: 'bg-emerald-100 border-emerald-300 text-emerald-700',
  amber: 'bg-amber-100 border-amber-300 text-amber-700',
  zinc: 'bg-zinc-100 border-zinc-300 text-zinc-700',
  pink: 'bg-pink-100 border-pink-300 text-pink-700',
  rose: 'bg-rose-100 border-rose-300 text-rose-700',
  lime: 'bg-lime-100 border-lime-300 text-lime-700',
  sky: 'bg-sky-100 border-sky-300 text-sky-700',
};

interface ActionNodeProps {
  data: ActionNodeData;
  selected?: boolean;
}

function ActionNodeComponent({ data, selected }: ActionNodeProps) {
  const actionDef = actionDefinitions[data.actionType as keyof typeof actionDefinitions];
  const IconComponent = actionDef ? iconMap[actionDef.icon] : Globe;
  const colorClass = actionDef ? colorMap[actionDef.color] : colorMap.gray;

  const getParamSummary = () => {
    const params = data.step.params;
    if (!params) return null;

    if (params.url) return params.url as string;
    if (params.selector) return params.selector as string;
    if (params.seconds) return `${params.seconds}s`;
    if (params.fields && Array.isArray(params.fields)) {
      return `${params.fields.length} fields`;
    }
    return null;
  };

  const summary = getParamSummary();

  return (
    <div
      className={cn(
        'rounded-lg border-2 shadow-sm min-w-[200px] max-w-[280px]',
        colorClass,
        selected && 'ring-2 ring-offset-2 ring-blue-500'
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 !bg-gray-400"
      />
      
      <div className="p-3">
        <div className="flex items-center gap-2">
          {IconComponent && <IconComponent className="h-4 w-4 flex-shrink-0" />}
          <span className="font-medium text-sm truncate">
            {actionDef?.label || data.actionType}
          </span>
          <span className="text-xs opacity-60 ml-auto">#{data.index + 1}</span>
        </div>
        
        {summary && (
          <div className="mt-1 text-xs opacity-70 truncate font-mono">
            {summary}
          </div>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 !bg-gray-400"
      />
    </div>
  );
}

export const ActionNode = memo(ActionNodeComponent);
