import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { ProductResearchInput } from "../schemas/ProductResearchInput";
import { productResearchInputSchema } from "../schemas/ProductResearchInput";
import type { ProductResearchReport } from "../schemas/ProductResearchReport";
import { getResearchAgentPaths, type ResearchAgentPaths } from "./paths";
import { createResearchAgentPrompt } from "./prompt";
import { createResearchAgentResourceLoader } from "./resource-loader";
import { attachAgentDecisionToReport } from "../research/agent-decision";
import { rewriteStoredResearchArtifacts } from "../storage/artifact-store";
import {
  buildRecordAgentDecisionTool,
  buildRunProductResearchTool,
} from "./tools";

export type ResearchAgentThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface InspectStandaloneAgentEnvironmentOptions {
  agentHome?: string;
}

export interface StandaloneAgentEnvironment {
  appRoot: string;
  agentHome: string;
  authPath: string;
  modelsPath: string;
  availableModels: string[];
  availableModelCount: number;
  allModelCount: number;
  allModelsPreview: string[];
}

export interface RunAgentResearchOptions {
  useScraper?: boolean;
  outputDir?: string;
  model?: string;
  thinkingLevel?: ResearchAgentThinkingLevel;
  agentHome?: string;
  invocationCwd?: string;
  printEvents?: boolean;
  printAssistantText?: boolean;
}

export interface RunAgentResearchResult {
  prompt: string;
  assistantResponse: string;
  model: string;
  environment: StandaloneAgentEnvironment;
  report: ProductResearchReport;
  agentDecision?: ProductResearchReport["agentDecision"];
  agentSummaryPath: string;
  agentDetailsPath: string;
}

type SelectedModel = ReturnType<ModelRegistry["getAvailable"]>[number];

function normalizeModelLabel(model: SelectedModel) {
  return `${model.provider}/${model.id}`;
}

function resolveThinkingLevel(
  thinkingLevel: ResearchAgentThinkingLevel | undefined,
): ResearchAgentThinkingLevel {
  return thinkingLevel
    ?? (process.env.RESEARCH_AGENT_PI_THINKING as ResearchAgentThinkingLevel | undefined)
    ?? "off";
}

function resolveModel(
  modelRegistry: ModelRegistry,
  selector: string | undefined,
): SelectedModel {
  if (selector) {
    const [provider, ...rest] = selector.split("/");
    const modelId = rest.join("/").trim();

    if (!provider || !modelId) {
      throw new Error(
        `Invalid model selector \"${selector}\". Expected <provider>/<model-id>.`,
      );
    }

    const model = modelRegistry.find(provider, modelId);
    if (!model) {
      throw new Error(`Model not found: ${selector}`);
    }
    if (!modelRegistry.hasConfiguredAuth(model)) {
      throw new Error(
        `Model ${selector} is configured in the registry but does not have auth available in ${process.env.RESEARCH_AGENT_PI_HOME ?? 'the standalone environment'} or provider env vars.`,
      );
    }
    return model;
  }

  const availableModels = modelRegistry.getAvailable();
  const firstAvailableModel = availableModels[0];
  if (!firstAvailableModel) {
    throw new Error(
      `No Pi models are available for the standalone research-agent harness. Configure provider environment variables or ${path.basename(getResearchAgentPaths().authPath)} under the local agent home.`,
    );
  }
  return firstAvailableModel;
}

function createEnvironment(
  paths: ResearchAgentPaths,
  modelRegistry: ModelRegistry,
): StandaloneAgentEnvironment {
  const availableModels = modelRegistry.getAvailable().map(normalizeModelLabel);
  const allModels = modelRegistry.getAll().map(normalizeModelLabel);

  return {
    appRoot: paths.appRoot,
    agentHome: paths.agentHome,
    authPath: paths.authPath,
    modelsPath: paths.modelsPath,
    availableModels,
    availableModelCount: availableModels.length,
    allModelCount: allModels.length,
    allModelsPreview: allModels.slice(0, 25),
  };
}

export function inspectStandaloneAgentEnvironment(
  options: InspectStandaloneAgentEnvironmentOptions = {},
): StandaloneAgentEnvironment {
  const paths = getResearchAgentPaths({ agentHome: options.agentHome });
  const authStorage = AuthStorage.create(paths.authPath);
  const modelRegistry = ModelRegistry.create(authStorage, paths.modelsPath);
  return createEnvironment(paths, modelRegistry);
}

async function writeStandaloneAgentArtifacts(
  report: ProductResearchReport,
  metadata: {
    prompt: string;
    assistantResponse: string;
    environment: StandaloneAgentEnvironment;
    model: string;
    thinkingLevel: ResearchAgentThinkingLevel;
    agentDecision?: ProductResearchReport["agentDecision"];
  },
) {
  const artifactDir = report.artifacts?.artifactDir;
  if (!artifactDir) {
    throw new Error("Stored research report is missing artifact paths.");
  }

  await mkdir(artifactDir, { recursive: true });

  const agentSummaryPath = path.join(artifactDir, "agent-summary.md");
  const agentDetailsPath = path.join(artifactDir, "agent-details.json");

  const summary = [
    "# Pi Harness Summary",
    "",
    `- Model: ${metadata.model}`,
    `- Thinking: ${metadata.thinkingLevel}`,
    `- Standalone agent home: ${metadata.environment.agentHome}`,
    `- Deterministic selected canonical URL: ${report.selectedCanonicalUrl ?? "(none)"}`,
    `- Report status: ${report.status}`,
    `- Overall confidence: ${report.confidence.overall.toFixed(2)}`,
    `- Agent decision: ${metadata.agentDecision?.defer ? "defer" : metadata.agentDecision?.selectedUrl ?? "(none recorded)"}`,
    `- Agent decision confidence: ${metadata.agentDecision?.confidence ?? "(none)"}`,
    "",
    "## Agent decision rationale",
    metadata.agentDecision?.rationale ?? "(no structured agent decision recorded)",
    "",
    "## Assistant response",
    metadata.assistantResponse || "(no assistant text captured)",
    "",
    "## Warnings",
    ...(report.warnings.length ? report.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    "",
    "## Next actions",
    ...(report.nextActions.length ? report.nextActions.map((action) => `- ${action}`) : ["- none"]),
  ].join("\n");

  await writeFile(agentSummaryPath, `${summary}\n`, "utf8");
  await writeFile(
    agentDetailsPath,
    `${JSON.stringify(
      {
        model: metadata.model,
        thinkingLevel: metadata.thinkingLevel,
        environment: metadata.environment,
        prompt: metadata.prompt,
        assistantResponse: metadata.assistantResponse,
        agentDecision: metadata.agentDecision,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    agentSummaryPath,
    agentDetailsPath,
  };
}

export async function runAgentResearch(
  rawInput: unknown,
  options: RunAgentResearchOptions = {},
): Promise<RunAgentResearchResult> {
  const input: ProductResearchInput = productResearchInputSchema.parse(rawInput);
  const paths = getResearchAgentPaths({ agentHome: options.agentHome });
  const invocationCwd = options.invocationCwd ?? process.cwd();
  const useScraper = options.useScraper ?? false;
  const thinkingLevel = resolveThinkingLevel(options.thinkingLevel);

  const authStorage = AuthStorage.create(paths.authPath);
  const modelRegistry = ModelRegistry.create(authStorage, paths.modelsPath);
  const environment = createEnvironment(paths, modelRegistry);
  const selectedModel = resolveModel(
    modelRegistry,
    options.model ?? process.env.RESEARCH_AGENT_PI_MODEL,
  );
  const resourceLoader = await createResearchAgentResourceLoader(paths);
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 1 },
  });

  let storedReport: ProductResearchReport | undefined;
  let agentDecision: ProductResearchReport["agentDecision"] | undefined;
  let assistantResponse = "";

  const runProductResearchTool = buildRunProductResearchTool({
    rawInput: input,
    invocationCwd,
    defaultPipeline: useScraper ? "legacy-scraper" : "local",
    defaultOutputDir: options.outputDir,
    onStoredReport: async (report) => {
      storedReport = report;
    },
  });

  const recordAgentDecisionTool = buildRecordAgentDecisionTool({
    getStoredReport: () => storedReport,
    onDecision: async (decision) => {
      if (!storedReport) {
        throw new Error("Cannot attach an agent decision before the research report exists.");
      }

      storedReport = attachAgentDecisionToReport(storedReport, decision, {
        recordedAt: new Date(),
      });
      agentDecision = storedReport.agentDecision;
      await rewriteStoredResearchArtifacts(storedReport);
    },
  });

  const { session } = await createAgentSession({
    cwd: paths.appRoot,
    agentDir: paths.agentHome,
    authStorage,
    modelRegistry,
    model: selectedModel,
    thinkingLevel,
    resourceLoader,
    tools: ["read", "grep", "find", "ls", "bash", "run_product_research", "record_agent_decision"],
    customTools: [runProductResearchTool, recordAgentDecisionTool],
    sessionManager: SessionManager.inMemory(paths.appRoot),
    settingsManager,
  });

  try {
    session.subscribe((event) => {
      if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
        if (options.printAssistantText ?? options.printEvents) {
          process.stdout.write(event.assistantMessageEvent.delta);
        }
        assistantResponse += event.assistantMessageEvent.delta;
      }

      if (!options.printEvents) {
        return;
      }

      if (event.type === "tool_execution_start") {
        process.stderr.write(`\n[tool:start] ${event.toolName}\n`);
      }

      if (event.type === "tool_execution_end") {
        process.stderr.write(`\n[tool:end] ${event.toolName} ${event.isError ? "error" : "ok"}\n`);
      }
    });

    const prompt = createResearchAgentPrompt(input, {
      pipeline: useScraper ? "legacy-scraper" : "local",
      outputDir: options.outputDir,
    });

    await session.prompt(prompt);

    if (!storedReport) {
      throw new Error(
        "Pi harness finished without running the deterministic research tool.",
      );
    }

    if (!agentDecision) {
      throw new Error(
        "Pi harness finished without recording a structured agent decision.",
      );
    }

    const modelLabel = normalizeModelLabel(selectedModel);
    const artifactPaths = await writeStandaloneAgentArtifacts(storedReport, {
      prompt,
      assistantResponse: assistantResponse.trim(),
      environment,
      model: modelLabel,
      thinkingLevel,
      agentDecision,
    });

    return {
      prompt,
      assistantResponse: assistantResponse.trim(),
      model: modelLabel,
      environment,
      report: storedReport,
      agentDecision,
      agentSummaryPath: artifactPaths.agentSummaryPath,
      agentDetailsPath: artifactPaths.agentDetailsPath,
    };
  } finally {
    session.dispose();
  }
}
