"use client";

import { Fragment, type CSSProperties } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import type {
  PersistedPipelineStatus,
  PipelineTab,
  PipelineStage,
  StatusCount,
} from "@/lib/pipeline/types";
import { STAGE_CONFIG, PIPELINE_TABS } from '@/lib/pipeline/types';

interface StageTabsProps {
  currentStage: PipelineStage;
  counts: StatusCount[];
  onStageChange: (stage: PipelineStage) => void;
  variant?: 'legacy' | 'pipeline';
}

const LEGACY_PERSISTED_STAGE_ORDER: PersistedPipelineStatus[] = [
  'imported',
  'scraped',
  'finalized',
  'failed',
];

const LEGACY_OPERATIONAL_STAGE_ORDER: PipelineTab[] = [
  'monitoring',
  'consolidating',
  'published',
  'images',
  'export',
];

const LEGACY_TAB_ORDER: PipelineStage[] = [
  ...LEGACY_PERSISTED_STAGE_ORDER,
  ...LEGACY_OPERATIONAL_STAGE_ORDER,
];

const PIPELINE_TAB_ORDER: PipelineStage[] = [...PIPELINE_TABS];

export function StageTabs({
  currentStage,
  counts,
  onStageChange,
  variant = 'pipeline',
}: StageTabsProps) {
  const tabOrder = variant === 'legacy' ? LEGACY_TAB_ORDER : PIPELINE_TAB_ORDER;
  const isLegacy = variant === 'legacy';

  const getCount = (stage: PipelineStage): number => {
    if (isLegacy) {
      if (stage === 'monitoring' || stage === 'consolidating' || stage === 'images' || stage === 'export') {
        return 0;
      }
      if (stage === 'published') {
        return counts.find((c) => c.status === 'published')?.count ?? 0;
      }
      if (stage === 'finalized') {
        return counts.find((c) => c.status === 'finalized')?.count ?? 0;
      }
    }

    // Pipeline variant counts
    if (stage === 'scraping') {
      // scraping is derived - show 0 as counts come from different sources
      return 0;
    }
    if (stage === 'consolidating') {
      // consolidating is derived - show 0
      return 0;
    }
    if (stage === 'finalizing') {
      // finalizing is derived - show count of finalized products
      return counts.find((c) => c.status === 'finalized')?.count ?? 0;
    }

    const countData = counts.find((c) => c.status === stage);
    return countData?.count ?? 0;
  };

  const renderTab = (stage: PipelineStage, index: number, showDivider: boolean) => {
    const config = STAGE_CONFIG[stage];
    const count = getCount(stage);
    const isActive = currentStage === stage;

    return (
      <Fragment key={stage}>
        <TabsTrigger
          value={stage}
          className="flex items-center gap-2 data-[state=active]:shadow-sm"
          style={{
            '--stage-color': config.color,
          } as CSSProperties}
        >
          <span>{config.label}</span>
          <Badge
            variant={isActive ? 'default' : 'secondary'}
            className="ml-1"
          >
            {count}
          </Badge>
        </TabsTrigger>
        {showDivider && index < tabOrder.length - 1 && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
        )}
      </Fragment>
    );
  };

  if (isLegacy) {
    return (
      <Tabs
        value={currentStage}
        onValueChange={(value) => {
          const nextStage = tabOrder.find((stage) => stage === value);
          if (nextStage) {
            onStageChange(nextStage);
          }
        }}
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Workflow
            </p>
            <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-0">
              {LEGACY_PERSISTED_STAGE_ORDER.map((stage, index) =>
                renderTab(stage, index, index < LEGACY_PERSISTED_STAGE_ORDER.length - 1)
              )}
            </TabsList>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Operational
            </p>
            <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-0">
              {LEGACY_OPERATIONAL_STAGE_ORDER.map((stage, index) =>
                renderTab(stage, index, index < LEGACY_OPERATIONAL_STAGE_ORDER.length - 1)
              )}
            </TabsList>
          </div>
        </div>
      </Tabs>
    );
  }

  // Pipeline variant - single unified tab bar
  return (
    <Tabs
      value={currentStage}
      onValueChange={(value) => {
        const nextStage = tabOrder.find((stage) => stage === value);
        if (nextStage) {
          onStageChange(nextStage);
        }
      }}
    >
      <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-0">
        {tabOrder.map((stage, index) =>
          renderTab(stage, index, index < tabOrder.length - 1)
        )}
      </TabsList>
    </Tabs>
  );
}
