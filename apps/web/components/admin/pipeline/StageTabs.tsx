"use client";

import { Fragment, type CSSProperties } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ChevronRight } from "lucide-react";
import type { PipelineStage, StatusCount } from "@/lib/pipeline/types";
import { STAGE_CONFIG } from "@/lib/pipeline/types";

interface StageTabsProps {
  currentStage: PipelineStage;
  counts: StatusCount[];
  onStageChange: (stage: PipelineStage) => void;
}

const STAGE_ORDER: PipelineStage[] = [
  "imported",
  "monitoring",
  "scraped",
  "consolidating",
  "consolidated",
  "finalized",
  "published",
];

export function StageTabs({
  currentStage,
  counts,
  onStageChange,
}: StageTabsProps) {
  const getCount = (stage: PipelineStage): number => {
    const countData = counts.find((c) => c.status === stage);
    return countData?.count ?? 0;
  };

  return (
    <Tabs
      value={currentStage}
      onValueChange={(value) => {
        const nextStage = STAGE_ORDER.find((stage) => stage === value);
        if (nextStage) {
          onStageChange(nextStage);
        }
      }}
    >
      <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-0">
        {STAGE_ORDER.map((stage, index) => {
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
              {index < STAGE_ORDER.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
              )}
            </Fragment>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
