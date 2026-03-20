"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { PipelineStage, StatusCount } from "@/lib/pipeline/types";
import { STAGE_CONFIG } from "@/lib/pipeline/types";

interface StageTabsProps {
  currentStage: PipelineStage;
  counts: StatusCount[];
  onStageChange: (stage: PipelineStatus) => void;
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
    if (stage === "consolidating" || stage === "monitoring") {
      return 0;
    }
    const countData = counts.find((c) => c.status === stage);
    return countData?.count ?? 0;
  };

  return (
    <Tabs
      value={currentStage}
      onValueChange={(value) => onStageChange(value as PipelineStatus)}
    >
      <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1">
        {STAGE_ORDER.map((stage) => {
          const config = STAGE_CONFIG[stage];
          const count = getCount(stage);
          const isActive = currentStage === stage;

          return (
            <TabsTrigger
              key={stage}
              value={stage}
              className="flex items-center gap-2 data-[state=active]:shadow-sm"
              style={
                {
                  "--stage-color": config.color,
                } as React.CSSProperties
              }
            >
              <span>{config.label}</span>
              {count > 0 && (
                <Badge
                  variant={isActive ? "default" : "secondary"}
                  className={`ml-1 ${
                    isActive ? "bg-white/20 text-white hover:bg-white/30" : ""
                  }`}
                >
                  {count}
                </Badge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
