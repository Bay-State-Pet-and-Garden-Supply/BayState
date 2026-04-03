"use client";

import { useState } from "react";
import type { PipelineProduct, PipelineStage, StatusCount } from "@/lib/pipeline/types";
import { WorkflowTabs } from "./WorkflowTabs";
import { PipelineHeader } from "./PipelineHeader";
import { PipelineFlowVisualization } from "./PipelineFlowVisualization";

interface UnifiedPipelineClientProps {
  initialProducts: PipelineProduct[];
  initialCounts: StatusCount[];
  initialTotal: number;
  initialStage: PipelineStage;
}

export function UnifiedPipelineClient({
  initialProducts,
  initialCounts,
  initialTotal,
  initialStage,
}: UnifiedPipelineClientProps) {
  const [currentStage, setCurrentStage] = useState<PipelineStage>(initialStage);
  const [products] = useState<PipelineProduct[]>(initialProducts);
  const [counts] = useState<StatusCount[]>(initialCounts);
  const [total] = useState<number>(initialTotal);

  return (
    <div className="space-y-6">
      <PipelineHeader
        title="Product Pipeline"
        subtitle={`${total} products in workflow`}
      />
      
      <PipelineFlowVisualization
        currentTab={currentStage}
        counts={counts}
      />
      
      <WorkflowTabs
        currentStage={currentStage}
        counts={counts}
        onStageChange={setCurrentStage}
      />
      
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">
          {currentStage.charAt(0).toUpperCase() + currentStage.slice(1)} Stage
        </h2>
        <p className="text-muted-foreground">
          Showing {products.length} products in {currentStage} stage
        </p>
      </div>
    </div>
  );
}