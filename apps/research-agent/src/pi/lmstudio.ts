import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getResearchAgentPaths } from "./paths";

const lmStudioModelsResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      object: z.string().optional(),
      owned_by: z.string().optional(),
    }),
  ),
});

export interface LmStudioBootstrapOptions {
  agentHome?: string;
  baseUrl?: string;
  apiKey?: string;
  requestedModelId?: string;
}

export interface LmStudioBootstrapResult {
  authPath: string;
  modelsPath: string;
  provider: string;
  baseUrl: string;
  selectedModelId: string;
  availableModelIds: string[];
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function normalizeModelId(modelId: string) {
  return modelId
    .trim()
    .toLowerCase()
    .replace(/^unsloth\//, "")
    .replace(/-gguf$/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9./-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function pickLmStudioModelId(
  availableModelIds: string[],
  requestedModelId?: string,
) {
  if (!availableModelIds.length) {
    throw new Error("LM Studio returned no models from /v1/models.");
  }

  if (!requestedModelId) {
    return availableModelIds[0]!;
  }

  const exact = availableModelIds.find((modelId) => modelId === requestedModelId);
  if (exact) {
    return exact;
  }

  const normalizedRequested = normalizeModelId(requestedModelId);
  const normalizedMatch = availableModelIds.find(
    (modelId) => normalizeModelId(modelId) === normalizedRequested,
  );
  if (normalizedMatch) {
    return normalizedMatch;
  }

  const suffixMatch = availableModelIds.find((modelId) =>
    normalizeModelId(modelId).endsWith(normalizedRequested),
  );
  if (suffixMatch) {
    return suffixMatch;
  }

  throw new Error(
    `Requested LM Studio model not found: ${requestedModelId}. Available models: ${availableModelIds.join(", ")}`,
  );
}

export async function detectLmStudioModels(baseUrl?: string) {
  const normalizedBaseUrl = normalizeBaseUrl(
    baseUrl ?? process.env.LMSTUDIO_BASE_URL ?? "http://127.0.0.1:1234/v1",
  );
  const response = await fetch(`${normalizedBaseUrl}/models`);

  if (!response.ok) {
    throw new Error(
      `LM Studio model discovery failed: ${response.status} ${response.statusText}`,
    );
  }

  const payload = lmStudioModelsResponseSchema.parse(await response.json());
  return {
    baseUrl: normalizedBaseUrl,
    modelIds: payload.data.map((model) => model.id),
  };
}

export async function bootstrapLmStudioConfig(
  options: LmStudioBootstrapOptions = {},
): Promise<LmStudioBootstrapResult> {
  const paths = getResearchAgentPaths({ agentHome: options.agentHome });
  const { baseUrl, modelIds } = await detectLmStudioModels(options.baseUrl);
  const selectedModelId = pickLmStudioModelId(modelIds, options.requestedModelId);
  const apiKey = options.apiKey ?? process.env.LMSTUDIO_API_KEY ?? "lm-studio";

  await mkdir(paths.agentHome, { recursive: true });

  const authPayload = {
    lmstudio: {
      type: "api_key",
      key: apiKey,
    },
  };

  const modelsPayload = {
    providers: {
      lmstudio: {
        baseUrl,
        api: "openai-completions",
        apiKey,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
          supportsUsageInStreaming: false,
          maxTokensField: "max_tokens",
        },
        models: [
          {
            id: selectedModelId,
            name: `LM Studio ${selectedModelId}`,
            input: ["text", "image"],
            reasoning: false,
            contextWindow: 128000,
            maxTokens: 16384,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
          },
        ],
      },
    },
  };

  await writeFile(paths.authPath, `${JSON.stringify(authPayload, null, 2)}\n`, "utf8");
  await writeFile(paths.modelsPath, `${JSON.stringify(modelsPayload, null, 2)}\n`, "utf8");

  return {
    authPath: paths.authPath,
    modelsPath: paths.modelsPath,
    provider: "lmstudio",
    baseUrl,
    selectedModelId,
    availableModelIds: modelIds,
  };
}

export async function readStandaloneAuthFile(agentHome?: string) {
  const paths = getResearchAgentPaths({ agentHome });
  try {
    return await readFile(paths.authPath, "utf8");
  } catch {
    return undefined;
  }
}
