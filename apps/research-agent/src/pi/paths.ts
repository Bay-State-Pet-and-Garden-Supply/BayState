import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ResearchAgentPaths {
  appRoot: string;
  repoRoot: string;
  agentHome: string;
  authPath: string;
  modelsPath: string;
}

function appRootFromModule() {
  return fileURLToPath(new URL("../../", import.meta.url));
}

function repoRootFromModule() {
  return fileURLToPath(new URL("../../../../", import.meta.url));
}

export function getResearchAgentPaths(options: { agentHome?: string } = {}): ResearchAgentPaths {
  const appRoot = appRootFromModule();
  const repoRoot = repoRootFromModule();
  const agentHome = path.resolve(
    options.agentHome ?? process.env.RESEARCH_AGENT_PI_HOME ?? path.join(appRoot, ".pi-runtime"),
  );

  return {
    appRoot,
    repoRoot,
    agentHome,
    authPath: path.join(agentHome, "auth.json"),
    modelsPath: path.join(agentHome, "models.json"),
  };
}
