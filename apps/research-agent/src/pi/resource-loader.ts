import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createExtensionRuntime,
  DefaultResourceLoader,
  type ResourceLoader,
} from "@earendil-works/pi-coding-agent";
import type { ResearchAgentPaths } from "./paths";

const SYSTEM_PROMPT = [
  "You are the standalone BayState research-agent harness.",
  "Your job is to validate and operate the local product research workflow inside apps/research-agent.",
  "Do not propose or perform apps/web, frontend, coordinator, Supabase, or scraper-daemon integration in this mode.",
  "Treat Pi as a bounded harness layer around deterministic research logic, not a replacement for scoring or extraction code.",
  "Use the agent-browser skill for browser/page-acquisition research tasks in this app instead of the legacy apps/scraper bridge.",
  "Prefer the custom run_product_research tool when the user asks you to execute the local research workflow.",
  "Be concise, evidence-based, and explicit about warnings and next actions.",
].join(" ");

async function loadAgentsFile(filePath: string) {
  try {
    return {
      path: filePath,
      content: await readFile(filePath, "utf8"),
    };
  } catch {
    return undefined;
  }
}

export async function createResearchAgentResourceLoader(
  paths: ResearchAgentPaths,
): Promise<ResourceLoader> {
  const repoAgentsPath = path.join(paths.repoRoot, "AGENTS.md");
  const appAgentsPath = path.join(paths.appRoot, "AGENTS.md");
  const agentsFiles = (await Promise.all([
    loadAgentsFile(repoAgentsPath),
    loadAgentsFile(appAgentsPath),
  ])).filter((value): value is { path: string; content: string } => Boolean(value));

  const loader = new DefaultResourceLoader({
    cwd: paths.appRoot,
    agentDir: paths.agentHome,
    noExtensions: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: SYSTEM_PROMPT,
    additionalSkillPaths: [path.join(paths.appRoot, "skills", "agent-browser")],
    extensionsOverride: () => ({
      extensions: [],
      errors: [],
      runtime: createExtensionRuntime(),
    }),
    agentsFilesOverride: () => ({ agentsFiles }),
    skillsOverride: ({ skills, diagnostics }) => ({
      skills: skills.filter((skill) => skill.name === "agent-browser"),
      diagnostics,
    }),
  });

  await loader.reload();
  return loader;
}
