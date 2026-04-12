import { type InferUITools, ToolLoopAgent, type UIMessage, stepCountIs } from "ai";
import { createClient } from "@/lib/supabase/server";
import {
  finalizationCopilotContextSchema,
  type FinalizationCopilotContext,
} from "@/lib/pipeline/finalization-draft";
import {
  createFinalizationCopilotTools,
  type FinalizationCopilotToolSet,
} from "@/lib/tools/finalization-copilot";

const FINALIZATION_COPILOT_MODEL = "google/gemini-3.1-pro-preview";

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildInstructions(context: FinalizationCopilotContext): string {
  const input = toRecord(context.product.input);
  const sourceKeys = Object.keys(context.product.sources);

  return `You are Bay State's finalization copilot for product approvals.

You help admins make last-minute, approval-time product changes with precision.
Prefer tools over free-form claims whenever a fact, mutation, save, approval, rejection, brand lookup, or image decision is involved.

Current product context:
- SKU: ${context.product.sku}
- Original imported name: ${typeof input.name === "string" ? input.name : "Unknown"}
- Confidence score: ${typeof context.product.confidence_score === "number" ? context.product.confidence_score : "Unknown"}
- Source keys: ${sourceKeys.length > 0 ? sourceKeys.join(", ") : "None"}

Current draft JSON:
${JSON.stringify(context.draft, null, 2)}

Last saved draft JSON:
${JSON.stringify(context.savedDraft, null, 2)}

Rules:
- Use getProductSnapshot if you need the authoritative current draft, saved draft, pages, or source keys.
- Use inspectSourceData and listImageSources instead of guessing facts from scraped data.
- Batch related field edits into one setProductFields call when possible.
- Use searchBrands before assignBrand unless you already have a brand id from tool output.
- Use createBrand only when the requested brand does not already exist.
- Use saveDraft only when the user wants to save.
- Use approveProduct only when the user explicitly wants approval/exporting.
- Use rejectProduct only when the user explicitly wants to send the product back to scraped.
- After any tool calls, briefly summarize what changed and mention any unresolved ambiguity.`;
}

export const finalizationCopilotAgent = new ToolLoopAgent({
  model: FINALIZATION_COPILOT_MODEL,
  callOptionsSchema: finalizationCopilotContextSchema,
  stopWhen: stepCountIs(12),
  instructions:
    "You are Bay State's finalization copilot. Use tools to inspect and update the product draft safely.",
  prepareCall: async ({ options, ...settings }) => {
    const supabase = await createClient();

    return {
      ...settings,
      instructions: buildInstructions(options),
      tools: createFinalizationCopilotTools(options, {
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
