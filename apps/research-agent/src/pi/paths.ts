import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ResearchAgentPaths {
  appRoot: string;
  agentHome: string;
  authPath: string;
  modelsPath: string;
}

function appRootFromModule() {
  return fileURLToPath(new URL("../../", import.meta.url));
}

export function getResearchAgentPaths(options: { agentHome?: string } = {}): ResearchAgentPaths {
  const appRoot = appRootFromModule();
  const agentHome = path.resolve(
    options.agentHome ?? process.env.RESEARCH_AGENT_PI_HOME ?? path.join(appRoot, ".pi-runtime"),
  );

  return {
    appRoot,
    agentHome,
    authPath: path.join(agentHome, "auth.json"),
    modelsPath: path.join(agentHome, "models.json"),
  };
}
