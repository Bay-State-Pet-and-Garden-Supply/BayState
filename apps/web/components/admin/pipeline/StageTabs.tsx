"use client";

import { Fragment, type CSSProperties, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PIPELINE_TABS, STAGE_CONFIG } from "@/lib/pipeline/types";
import type { PipelineStage, StatusCount } from "@/lib/pipeline/types";

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
  const getCount = (stage: PipelineStage): number => {
    return counts.find((count) => count.status === stage)?.count ?? 0;
  };

  const currentConfig = STAGE_CONFIG[currentStage];

  return (
    <div className="space-y-3">
      <Tabs
        value={currentStage}
        onValueChange={(value) => {
          const nextStage = PIPELINE_TABS.find((stage) => stage === value);
          if (nextStage) {
            onStageChange(nextStage);
          }
        }}
        className="space-y-3"
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-0.5 bg-muted/30 p-0">
          {PIPELINE_TABS.map((stage, index) => {
            const config = STAGE_CONFIG[stage];
            const count = getCount(stage);
            const isActive = currentStage === stage;

            return (
              <Fragment key={stage}>
                <TabsTrigger
                  value={stage}
                  className="flex items-center gap-1.5 data-[state=active]:shadow-sm px-2 py-1 h-8"
                  style={
                    {
                      "--stage-color": config.color,
                    } as CSSProperties
                  }
                >
                  <span className="text-xs font-medium">{config.label}</span>
                  <Badge
                    variant={isActive ? "default" : "secondary"}
                    className="ml-0.5 px-1 py-0 min-w-[18px] h-4 text-[10px] justify-center"
                  >
                    {count}
                  </Badge>
                </TabsTrigger>
                {index < PIPELINE_TABS.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                )}
              </Fragment>
            );
          })}
        </TabsList>
        {PIPELINE_TABS.map((stage) => (
          <TabsContent
            key={stage}
            value={stage}
            forceMount
            className="sr-only"
          >
            {STAGE_CONFIG[stage].description}
          </TabsContent>
        ))}
      </Tabs>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <p className="max-w-3xl text-sm text-muted-foreground">
          {currentConfig.description}
        </p>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 xl:shrink-0">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
