import type { ProductResearchInput } from "../schemas/ProductResearchInput";

export interface ResearchAgentPromptOptions {
  pipeline: "local" | "legacy-scraper";
  outputDir?: string;
}

export function createResearchAgentPrompt(
  input: ProductResearchInput,
  options: ResearchAgentPromptOptions,
) {
  const requestedToolArgs = {
    pipeline: options.pipeline,
    ...(options.outputDir ? { outputDir: options.outputDir } : {}),
  };

  return [
    "You are validating the standalone BayState research-agent harness.",
    "Stay inside the apps/research-agent environment.",
    "Do not plan or implement apps/web, frontend, coordinator, or database integration yet.",
    "You may inspect local research-agent files with the read-only filesystem tools if helpful.",
    "You must call `run_product_research` exactly once using the requested arguments below.",
    "After `run_product_research` returns, you must call `record_agent_decision` exactly once.",
    "If the deterministic report already selected a canonical URL, record that same URL unless you have strong evidence to defer.",
    "If the deterministic report returned needs_review, weigh the top candidates and choose the best candidate URL or defer if the evidence is still ambiguous.",
    "Prefer exact product/UPC/variant matches over generic landing pages, and treat social/marketplace noise as weak evidence.",
    "After both tools complete, summarize the deterministic result, your agent decision, confidence, warnings, and next actions.",
    "Keep the response concise and grounded in the tool result.",
    "",
    "Requested tool arguments:",
    "```json",
    JSON.stringify(requestedToolArgs, null, 2),
    "```",
    "",
    "Research input:",
    "```json",
    JSON.stringify(input, null, 2),
    "```",
  ].join("\n");
}
