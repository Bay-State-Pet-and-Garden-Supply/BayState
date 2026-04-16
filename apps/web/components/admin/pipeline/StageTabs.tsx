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

  return (
    <div className="space-y-1.5">
      <Tabs
        value={currentStage}
        onValueChange={(value) => {
          const nextStage = PIPELINE_TABS.find((stage) => stage === value);
          if (nextStage) {
            onStageChange(nextStage);
          }
        }}
        className="space-y-1.5"
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0 border-b-2 border-zinc-950">
          {PIPELINE_TABS.map((stage, index) => {
            const config = STAGE_CONFIG[stage];
            const count = getCount(stage);
            const isActive = currentStage === stage;

            return (
              <Fragment key={stage}>
                <TabsTrigger
                  value={stage}
                  className="flex items-center gap-2 data-[state=active]:shadow-[2px_2px_0px_rgba(0,0,0,1)] data-[state=active]:bg-white data-[state=active]:text-zinc-950 data-[state=active]:border-2 data-[state=active]:border-zinc-950 px-4 py-1.5 h-10 transition-all rounded-none relative after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-transparent data-[state=active]:after:bg-zinc-950 border-2 border-transparent"
                  style={
                    {
                      "--stage-color": config.color,
                    } as CSSProperties
                  }
                >
                  <span className="text-xs font-black uppercase tracking-tighter">{config.label}</span>
                  <Badge
                    variant={isActive ? "default" : "secondary"}
                    className="ml-1 px-1.5 py-0 min-w-[20px] h-5 text-[10px] justify-center font-black uppercase tracking-tighter rounded-none border border-zinc-950"
                  >
                    {count}
                  </Badge>
                </TabsTrigger>
                {index < PIPELINE_TABS.length - 1 && (
                  <div className="flex items-center px-1">
                    <ChevronRight className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                  </div>
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

      <div className="flex flex-col gap-1.5 xl:flex-row xl:items-center xl:justify-end">
        {actions ? (
          <div className="flex flex-wrap items-center gap-2 xl:shrink-0">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
