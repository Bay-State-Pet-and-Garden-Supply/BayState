"use client";

import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PIPELINE_TABS, STAGE_CONFIG } from '@/lib/pipeline/types';
import type { PipelineStage, StatusCount } from '@/lib/pipeline/types';

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
    <div className="admin-panel flex flex-col gap-4 p-4">
      <Tabs
        value={currentStage}
        onValueChange={(value) => {
          const nextStage = PIPELINE_TABS.find((stage) => stage === value);
          if (nextStage) {
            onStageChange(nextStage);
          }
        }}
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
          {PIPELINE_TABS.map((stage) => {
            const config = STAGE_CONFIG[stage];
            const active = currentStage === stage;

            return (
              <TabsTrigger
                key={stage}
                value={stage}
                className="flex h-auto items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors data-[state=active]:border-primary/20 data-[state=active]:bg-primary/10 data-[state=active]:text-foreground"
              >
                <span>{config.label}</span>
                <Badge variant={active ? 'default' : 'outline'} className="min-w-[1.75rem] justify-center px-1.5 py-0.5 text-[11px]">
                  {getCount(stage)}
                </Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {PIPELINE_TABS.map((stage) => (
          <TabsContent key={stage} value={stage} forceMount className="sr-only">
            {STAGE_CONFIG[stage].description}
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-[52rem] space-y-1">
          <p className="text-sm font-medium text-foreground">{currentConfig.label}</p>
          <p className="text-sm leading-6 text-muted-foreground">{currentConfig.description}</p>
        </div>

        {actions ? <div className="flex flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
      </div>
    </div>
  );
}
