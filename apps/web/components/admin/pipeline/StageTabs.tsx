"use client";

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PIPELINE_TABS, STAGE_CONFIG } from '@/lib/pipeline/types';
import type { PipelineStage, StatusCount } from '@/lib/pipeline/types';
import { Activity } from 'lucide-react';

interface StageTabsProps {
  currentStage: PipelineStage;
  counts: StatusCount[];
  onStageChange: (stage: PipelineStage) => void;
  actions?: ReactNode;
}

export function StageTabs({
  currentStage,
  counts,
  onStageChange,
  actions,
}: StageTabsProps) {
  const currentConfig = STAGE_CONFIG[currentStage];

  const getCount = (stage: PipelineStage): number => {
    return counts.find((count) => count.status === stage)?.count ?? 0;
  };

  return (
    <div className="admin-panel flex flex-col gap-2 p-2">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-2">
            <Activity className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-bold uppercase tracking-tight text-foreground/80">
              Pipeline
            </h1>
          </div>

          <Tabs
            value={currentStage}
            onValueChange={(value) => {
              const nextStage = PIPELINE_TABS.find((stage) => stage === value);
              if (nextStage) {
                onStageChange(nextStage);
              }
            }}
            className="w-full sm:w-auto"
          >
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
              {PIPELINE_TABS.map((stage) => {
                const config = STAGE_CONFIG[stage];
                const active = currentStage === stage;

                return (
                  <TabsTrigger
                    key={stage}
                    value={stage}
                    className="flex h-auto items-center gap-2 rounded-lg border border-border/50 bg-card px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors data-[state=active]:border-primary/20 data-[state=active]:bg-primary/5 data-[state=active]:text-primary"
                  >
                    <span>{config.label}</span>
                    <Badge variant={active ? 'default' : 'outline'} className="min-w-[1.25rem] h-3.5 justify-center px-1 py-0 text-[9px] font-bold">
                      {getCount(stage)}
                    </Badge>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
