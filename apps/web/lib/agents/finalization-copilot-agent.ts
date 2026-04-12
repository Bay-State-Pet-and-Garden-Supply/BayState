import {
  createGateway,
  type InferUITools,
  ToolLoopAgent,
  type UIMessage,
  stepCountIs,
} from "ai";
import { getAIProviderSecret } from "@/lib/ai-scraping/credentials";
import { createClient } from "@/lib/supabase/server";
import {
  type FinalizationCopilotContext,
  finalizationCopilotContextSchema,
} from "@/lib/pipeline/finalization-copilot-workspace";
import {
  createFinalizationCopilotTools,
  type FinalizationCopilotToolSet,
} from "@/lib/tools/finalization-copilot";

const FINALIZATION_COPILOT_MODEL = "google/gemini-3.1-pro-preview";
const FINALIZATION_COPILOT_MISSING_KEY_ERROR =
  "Gemini API key is not configured. Save it in Admin -> Settings -> AI Scraping Settings before using Finalization Copilot.";

function buildFinalizationCopilotModel(apiKey: string) {
  return createGateway({ apiKey })(FINALIZATION_COPILOT_MODEL);
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildInstructions(context: FinalizationCopilotContext): string {
  const selectedProduct = context.selectedProduct;
  const input = toRecord(selectedProduct?.input);
  const sourceKeys = Object.keys(selectedProduct?.sources ?? {});
  const dirtyCount = context.workspace.dirtySkus.length;

  return `You are Bay State's finalization copilot for product approvals.

You help admins make last-minute, approval-time product changes with precision across either the currently selected product or the full finalizing workspace.
Prefer tools over free-form claims whenever a fact, mutation, save, approval, rejection, brand lookup, image decision, or bulk targeting decision is involved.

Workspace context:
- Loaded finalizing products: ${context.workspace.totalProducts}
- Selected SKU: ${context.workspace.selectedSku ?? "None"}
- Drafts with unsaved changes: ${dirtyCount}

Selected product context:
- SKU: ${selectedProduct?.sku ?? "None"}
- Original imported name: ${typeof input.name === "string" ? input.name : "Unknown"}
- Confidence score: ${typeof selectedProduct?.confidence_score === "number" ? selectedProduct.confidence_score : "Unknown"}
- Source keys: ${sourceKeys.length > 0 ? sourceKeys.join(", ") : "None"}

Current selected draft JSON:
${JSON.stringify(context.selectedDraft, null, 2)}

Last saved selected draft JSON:
${JSON.stringify(context.selectedSavedDraft, null, 2)}

Rules:
- Use listWorkspaceProducts to inspect the full workspace before making claims about multiple products.
- Use previewProductScope before any bulk mutation, save, approval, or rejection.
- Use getProductSnapshot if you need the authoritative current draft, saved draft, pages, or source keys for a specific product.
- Use inspectSourceData and listImageSources instead of guessing facts from scraped data.
- Batch related field edits into one setProductFields or bulkSetProductFields call when possible.
- Use searchBrands before assignBrand unless you already have a brand id from tool output.
- Use bulkAssignBrand only when the same brand should be applied to every targeted product.
- Use bulkUpdateStorePages only when the same page change should apply across the full scope.
- Use createBrand only when the requested brand does not already exist.
- Use saveDraft or saveProducts only when the user wants to save.
- Use approveProduct or approveProducts only when the user explicitly wants approval/exporting.
- Use rejectProduct or rejectProducts only when the user explicitly wants to send products back to scraped.
- Never assume "all products" from a vague request; only use scope.type="all" when the user explicitly asks for all finalizing products.
- After any tool calls, briefly summarize what changed, the scope that changed, and mention any unresolved ambiguity.`;
}

export const finalizationCopilotAgent = new ToolLoopAgent({
  model: buildFinalizationCopilotModel("supabase-managed-finalization-copilot"),
  callOptionsSchema: finalizationCopilotContextSchema,
  stopWhen: stepCountIs(16),
  instructions:
    "You are Bay State's finalization copilot. Use tools to inspect and update selected products or explicit workspace scopes safely.",
  prepareCall: async ({ options, ...settings }) => {
    const gatewayApiKey = (await getAIProviderSecret("gemini"))?.trim();
    if (!gatewayApiKey) {
      throw new Error(FINALIZATION_COPILOT_MISSING_KEY_ERROR);
    }

    const supabase = await createClient();

    return {
      ...settings,
      model: buildFinalizationCopilotModel(gatewayApiKey),
      instructions: buildInstructions(options),
      tools: createFinalizationCopilotTools({
        searchBrands: async (query) => {
          const normalizedQuery = query.trim();
          let builder = supabase
            .from("brands")
            .select("id, name, slug")
            .order("name", { ascending: true })
            .limit(12);

          if (normalizedQuery) {
            builder = builder.ilike("name", `%${normalizedQuery}%`);
          }

          const { data, error } = await builder;

          if (error) {
            throw new Error(`Failed to search brands: ${error.message}`);
          }

          return (data ?? []).map((brand) => ({
            id: brand.id,
            name: brand.name,
            slug: brand.slug,
          }));
        },
      }),
    };
  },
});

export type FinalizationCopilotUIMessage = UIMessage<
  unknown,
  never,
  InferUITools<FinalizationCopilotToolSet>
>;
