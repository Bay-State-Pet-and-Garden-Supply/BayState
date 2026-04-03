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
import { STAGE_CONFIG } from "@/lib/pipeline/types";

interface StageTabsProps {
  currentStage: PipelineStage;
  counts: StatusCount[];
  onStageChange: (stage: PipelineStage) => void;
}

const PERSISTED_STAGE_ORDER: PersistedPipelineStatus[] = [
  "imported",
  "scraped",
  "finalized",
  "failed",
];

const OPERATIONAL_STAGE_ORDER: PipelineTab[] = [
  "monitoring",
  "consolidating",
  "published",
  "images",
  "export",
];

const TAB_ORDER: PipelineStage[] = [
  ...PERSISTED_STAGE_ORDER,
  ...OPERATIONAL_STAGE_ORDER,
];

export function StageTabs({
  currentStage,
  counts,
  onStageChange,
}: StageTabsProps) {
  const getCount = (stage: PipelineStage): number => {
    if (stage === "monitoring" || stage === "consolidating" || stage === "images" || stage === "export") {
      return 0;
    }

    if (stage === "published") {
      return counts.find((c) => c.status === "published")?.count ?? 0;
    }

    if (stage === "finalized") {
      return counts.find((c) => c.status === "finalized")?.count ?? 0;
    }
    const countData = counts.find((c) => c.status === stage);
    return countData?.count ?? 0;
  };

  return (
    <Tabs
      value={currentStage}
      onValueChange={(value) => {
        const nextStage = TAB_ORDER.find((stage) => stage === value);
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
            {PERSISTED_STAGE_ORDER.map((stage, index) => {
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
                  {index < PERSISTED_STAGE_ORDER.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                  )}
                </Fragment>
              );
            })}
          </TabsList>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Operational
          </p>
          <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-0">
            {OPERATIONAL_STAGE_ORDER.map((stage) => {
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
                    } as CSSProperties
                  }
                >
                  <span>{config.label}</span>
                  {count > 0 || stage === "published" ? (
                    <Badge
                      variant={isActive ? "default" : "secondary"}
                      className="ml-1"
                    >
                      {count}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>
      </div>
    </Tabs>
  );
}
