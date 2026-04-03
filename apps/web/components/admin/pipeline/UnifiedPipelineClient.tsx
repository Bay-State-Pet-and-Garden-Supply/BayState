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
import { PipelineHeader } from "./PipelineHeader";
import { ProductTable } from "./ProductTable";
import { ScrapedResultsView } from "./ScrapedResultsView";
import { FinalizingResultsView } from "./FinalizingResultsView";

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
    normalizeSinglePipelineStage(initialStage)
  );
  const [products, setProducts] = useState<PipelineProduct[]>(initialProducts);
  const [counts] = useState<StatusCount[]>(initialCounts);
  const [total, setTotal] = useState<number>(initialTotal);
  const [singlePipelineCounts, setSinglePipelineCounts] = useState<Record<WorkflowPipelineTab, number>>(
    createEmptySinglePipelineCounts
  );
  const [isResolvingTabs, setIsResolvingTabs] = useState(false);

  useEffect(() => {
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

  const displayedStage = activeSinglePipelineStage;
  const stageLabel = formatStageLabel(displayedStage);

  return (
    <div className="space-y-6">
      <PipelineHeader
        title="Product Pipeline"
        subtitle={`${total} products in workflow`}
      />
      
      
      <SinglePipelineTabs
        activeTab={activeSinglePipelineStage}
        counts={singlePipelineCounts}
        onTabChange={(tab) => setCurrentStage(tab as PipelineStage)}
      />
      
      {activeSinglePipelineStage === "scraped" ? (
  <ScrapedResultsView
    products={products}
    selectedSkus={new Set()}
    onSelectSku={() => {}}
    onRefresh={() => {}}
  />
) : activeSinglePipelineStage === "finalizing" ? (
  <FinalizingResultsView
    products={products}
    onRefresh={() => {}}
  />
) : (
  <ProductTable
    products={products}
    selectedSkus={new Set()}
    onSelectSku={() => {}}
    onSelectAll={() => {}}
    onDeselectAll={() => {}}
    currentStage={activeSinglePipelineStage}
  />
)}
    </div>
  );
}
