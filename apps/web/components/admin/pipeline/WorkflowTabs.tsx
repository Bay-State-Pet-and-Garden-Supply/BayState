"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Play,
  Brain,
  CheckCircle,
  Globe,
  AlertCircle,
} from "lucide-react";
import type { PipelineStage, StatusCount } from "@/lib/pipeline/types";
import { STAGE_CONFIG } from "@/lib/pipeline/types";
import { cn } from "@/lib/utils";

interface WorkflowTabsProps {
  currentStage: PipelineStage;
  counts: StatusCount[];
  onStageChange: (stage: PipelineStage) => void;
}

const WORKFLOW_ORDER: PipelineStage[] = [
  "imported",
  "scraping",
  "consolidating",
  "finalizing",
  "published",
  "failed",
];

const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  imported: Upload,
  scraping: Play,
  consolidating: Brain,
  finalizing: CheckCircle,
  published: Globe,
  failed: AlertCircle,
};

export function WorkflowTabs({
  currentStage,
  counts,
  onStageChange,
}: WorkflowTabsProps) {
  const getCount = (stage: PipelineStage): number => {
    const countData = counts.find((c) => c.status === stage);
    return countData?.count ?? 0;
  };

  return (
    <Tabs
      value={currentStage}
      onValueChange={(value) => {
        const nextStage = WORKFLOW_ORDER.find((stage) => stage === value);
        if (nextStage) {
          onStageChange(nextStage);
        }
      }}
    >
      <TabsList className="flex-wrap h-auto gap-1 bg-muted/50 p-1">
        {WORKFLOW_ORDER.map((stage) => {
          const config = STAGE_CONFIG[stage];
          const count = getCount(stage);
          const isActive = currentStage === stage;
          const Icon = STAGE_ICONS[stage] || Upload;

          return (
            <TabsTrigger
              key={stage}
              value={stage}
              className={cn(
                "flex items-center gap-2 px-3 py-2",
                "data-[state=active]:bg-primary",
                "data-[state=active]:text-primary-foreground",
                "data-[state=active]:shadow-sm"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{config?.label || stage}</span>
              <Badge
                variant={isActive ? "default" : "secondary"}
                className="ml-1"
              >
                {count}
              </Badge>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}