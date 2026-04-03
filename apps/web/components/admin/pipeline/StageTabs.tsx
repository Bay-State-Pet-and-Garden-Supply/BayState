"use client";

import { Fragment, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PIPELINE_TABS, STAGE_CONFIG } from "@/lib/pipeline/types";
import type { PipelineStage, StatusCount } from "@/lib/pipeline/types";

interface StageTabsProps {
  currentStage: PipelineStage;
  counts: StatusCount[];
  onStageChange: (stage: PipelineStage) => void;
}

export function StageTabs({
  currentStage,
  counts,
  onStageChange,
}: StageTabsProps) {
  const getCount = (stage: PipelineStage): number => {
    if (stage === "scraping" || stage === "consolidating") {
      return 0;
    }

    if (stage === "finalizing") {
      return counts.find((count) => count.status === "finalized")?.count ?? 0;
    }

    return counts.find((count) => count.status === stage)?.count ?? 0;
  };

  return (
    <Tabs
      value={currentStage}
      onValueChange={(value) => {
        const nextStage = PIPELINE_TABS.find((stage) => stage === value);
        if (nextStage) {
          onStageChange(nextStage);
        }
      }}
    >
      <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-0">
        {PIPELINE_TABS.map((stage, index) => {
          const config = STAGE_CONFIG[stage];
          const count = getCount(stage);
          const isActive = currentStage === stage;

          return (
            <Fragment key={stage}>
              <TabsTrigger
                value={stage}
                className="flex items-center gap-2 data-[state=active]:shadow-sm"
                style={
                  {
                    "--stage-color": config.color,
                  } as CSSProperties
                }
              >
                <span>{config.label}</span>
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className="ml-1"
                >
                  {count}
                </Badge>
              </TabsTrigger>
              {index < PIPELINE_TABS.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
              )}
            </Fragment>
          );
        })}
      </TabsList>
      {PIPELINE_TABS.map((stage) => (
        <TabsContent key={stage} value={stage} className="sr-only mt-0">
          {STAGE_CONFIG[stage].description}
        </TabsContent>
      ))}
    </Tabs>
  );
}
