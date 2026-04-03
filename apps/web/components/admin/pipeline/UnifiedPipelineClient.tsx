"use client";

import { useEffect, useState } from "react";
import type { PipelineProduct, PipelineStage, StatusCount } from "@/lib/pipeline/types";
import { createClient } from "@/lib/supabase/client";
import {
  WORKFLOW_PIPELINE_TABS,
  type WorkflowPipelineTab,
} from "@/lib/pipeline/derivation";
import {
  queryProductsForWorkflowTab,
  queryWorkflowTabCounts,
  type PipelineQuerySupabaseClient,
} from "@/lib/pipeline/queries";
import SinglePipelineTabs from "./SinglePipelineTabs";
import { WorkflowTabs } from "./WorkflowTabs";
import { PipelineHeader } from "./PipelineHeader";
import { PipelineFlowVisualization } from "./PipelineFlowVisualization";

const SINGLE_PIPELINE_UI_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_SINGLE_PIPELINE_UI === "true"
  || process.env.ENABLE_SINGLE_PIPELINE_UI === "true";

const EMPTY_SINGLE_PIPELINE_COUNTS: Record<WorkflowPipelineTab, number> = {
  imported: 0,
  scraping: 0,
  scraped: 0,
  consolidating: 0,
  finalizing: 0,
};

function createEmptySinglePipelineCounts(): Record<WorkflowPipelineTab, number> {
  return { ...EMPTY_SINGLE_PIPELINE_COUNTS };
}

function isWorkflowPipelineTab(stage: PipelineStage): stage is WorkflowPipelineTab {
  return WORKFLOW_PIPELINE_TABS.some((tab) => tab === stage);
}

function normalizeSinglePipelineStage(stage: PipelineStage): WorkflowPipelineTab {
  if (isWorkflowPipelineTab(stage)) {
    return stage;
  }

  return "imported";
}

function formatStageLabel(stage: string): string {
  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

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
  const [currentStage, setCurrentStage] = useState<PipelineStage>(() =>
    SINGLE_PIPELINE_UI_ENABLED ? normalizeSinglePipelineStage(initialStage) : initialStage
  );
  const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
  const [counts] = useState<StatusCount[]>(initialCounts);
  const [total, setTotal] = useState<number>(initialTotal);
  const [singlePipelineCounts, setSinglePipelineCounts] = useState<Record<WorkflowPipelineTab, number>>(
    createEmptySinglePipelineCounts
  );
  const [isResolvingTabs, setIsResolvingTabs] = useState(false);

  useEffect(() => {
    if (!SINGLE_PIPELINE_UI_ENABLED) {
      return;
    }

    let cancelled = false;

    async function fetchSinglePipelineData() {
      setIsResolvingTabs(true);

      try {
        const supabase = createClient() as unknown as PipelineQuerySupabaseClient;
        const activeTab = normalizeSinglePipelineStage(currentStage);

        const [tabResult, tabCounts] = await Promise.all([
          queryProductsForWorkflowTab(activeTab, supabase, { limit: 200, offset: 0 }),
          queryWorkflowTabCounts(supabase),
        ]);

        if (!cancelled) {
          setProducts(tabResult.products);
          setTotal(tabResult.count);
          setSinglePipelineCounts(tabCounts);
        }
      } catch (error) {
        console.error("Error querying single pipeline tabs:", error);

        if (!cancelled) {
          setProducts(initialProducts);
          setTotal(initialTotal);
          setSinglePipelineCounts(createEmptySinglePipelineCounts());
        }
      } finally {
        if (!cancelled) {
          setIsResolvingTabs(false);
        }
      }
    }

    void fetchSinglePipelineData();

    return () => {
      cancelled = true;
    };
  }, [currentStage, initialProducts, initialTotal]);

  const activeSinglePipelineStage = normalizeSinglePipelineStage(currentStage);

  const visibleProductCount = products.length;

  const displayedStage = SINGLE_PIPELINE_UI_ENABLED ? activeSinglePipelineStage : currentStage;
  const stageLabel = formatStageLabel(displayedStage);

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
      
      {SINGLE_PIPELINE_UI_ENABLED ? (
        <SinglePipelineTabs
          activeTab={activeSinglePipelineStage}
          counts={singlePipelineCounts}
          onTabChange={(tab) => setCurrentStage(tab as PipelineStage)}
        />
      ) : (
        <WorkflowTabs
          currentStage={currentStage}
          counts={counts}
          onStageChange={setCurrentStage}
        />
      )}
      
      <div className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">
          {stageLabel} Stage
        </h2>
        <p className="text-muted-foreground">
          Showing {visibleProductCount} loaded products in {displayedStage} stage
        </p>
        {SINGLE_PIPELINE_UI_ENABLED && isResolvingTabs ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Resolving active scrape and consolidation jobs for loaded products.
          </p>
        ) : null}
      </div>
    </div>
  );
}
