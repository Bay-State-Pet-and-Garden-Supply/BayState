import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bootstrapLmStudioConfig } from "../src/pi/lmstudio";
import { createResearchAgentPrompt } from "../src/pi/prompt";
import { getResearchAgentPaths } from "../src/pi/paths";
import { createResearchAgentResourceLoader } from "../src/pi/resource-loader";
import { inspectStandaloneAgentEnvironment } from "../src/pi/standalone";
import { buildRecordAgentDecisionTool, buildRunProductResearchTool } from "../src/pi/tools";

const exampleInput = {
  productId: "fromm-cat-purrsnick-duck-stew-3oz",
  upc: "072705113446",
  registerName: "Fromm Cat PurrSnickitty Duck Stew 3 oz",
  brand: "Fromm",
  officialWebsiteUrl: "https://frommfamily.com",
  seedCandidateUrls: [
    {
      url: "https://frommfamily.com/products/cat/purrsnickitty/can",
      sourceType: "serp" as const,
      title: "PurrSnickitty - Wet Food for Cats",
      snippet: "Fromm Family Foods PurrSnickitty wet cat food landing page.",
    },
    {
      url: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
      sourceType: "serp" as const,
      title: "PURRSNICKITTY CAT DUCK STEW 3OZ – Tickners",
      snippet:
        "SKU: 072705113446 Categories: CAT CANS, CAT/KITTEN Brand: FROMM FAMILY FO. Description. 12/3OZ PURRSNICK DUCK STEW.",
    },
  ],
};

const tempRoot = path.join(os.tmpdir(), `research-agent-pi-${Date.now()}`);

afterAll(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe("standalone Pi harness helpers", () => {
  it("builds a prompt that keeps frontend integration out of scope", () => {
    const prompt = createResearchAgentPrompt(exampleInput, {
      pipeline: "local",
      outputDir: "artifacts/manual-run",
    });

    expect(prompt).toContain("Stay inside the research-agent environment.");
    expect(prompt).toContain("Do not plan or implement web, frontend, coordinator, or database integration yet.");
    expect(prompt).toContain("run_product_research");
    expect(prompt).toContain("record_agent_decision");
    expect(prompt).toContain("artifacts/manual-run");
    expect(prompt).toContain("fromm-cat-purrsnick-duck-stew-3oz");
  });

  it("resolves a standalone local agent home when overridden", () => {
    const agentHome = path.join(tempRoot, ".pi-runtime");
    const paths = getResearchAgentPaths({ agentHome });
    const environment = inspectStandaloneAgentEnvironment({ agentHome });

    expect(paths.agentHome).toBe(agentHome);
    expect(environment.agentHome).toBe(agentHome);
    expect(environment.authPath).toBe(path.join(agentHome, "auth.json"));
    expect(environment.modelsPath).toBe(path.join(agentHome, "models.json"));
  });

  it("loads the project-local agent-browser skill", async () => {
    const paths = getResearchAgentPaths({ agentHome: path.join(tempRoot, "skill-runtime") });
    const loader = await createResearchAgentResourceLoader(paths);
    const skills = loader.getSkills().skills;

    expect(skills.map((skill) => skill.name)).toEqual(["agent-browser"]);
    expect(skills[0]?.filePath).toContain(path.join("skills", "agent-browser", "SKILL.md"));
    expect(loader.getSystemPrompt()).toContain("Use the agent-browser skill");
  });

  it("bootstraps LM Studio auth/models config", async () => {
    const agentHome = path.join(tempRoot, "lmstudio-runtime");
    const originalFetch = globalThis.fetch;

    globalThis.fetch = ((async () =>
      new Response(
        JSON.stringify({
          data: [
            { id: "qwen3.6-35b-a3b" },
            { id: "qwen/qwen3.6-27b" },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      )) as unknown) as typeof fetch;

    try {
      const result = await bootstrapLmStudioConfig({
        agentHome,
        requestedModelId: "unsloth/Qwen3.6-35B-A3B-GGUF",
      });

      expect(result.selectedModelId).toBe("qwen3.6-35b-a3b");
      expect(Bun.file(result.authPath).size).toBeGreaterThan(0);
      expect(Bun.file(result.modelsPath).size).toBeGreaterThan(0);
      expect(await Bun.file(result.authPath).text()).toContain('"lmstudio"');
      expect(await Bun.file(result.modelsPath).text()).toContain('"qwen3.6-35b-a3b"');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects an empty structured agent rationale", async () => {
    const tool = buildRecordAgentDecisionTool({
      getStoredReport: () => ({
        candidates: [
          {
            url: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
            normalizedUrl:
              "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
          },
        ],
      } as never),
    });

    await expect(
      tool.execute(
        "tool-call-empty-rationale",
        {
          selectedUrl:
            "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
          rationale: "   ",
        },
        undefined,
        undefined,
        {} as never,
      ),
    ).rejects.toThrow("rationale must not be empty");
  });

  it("records a structured agent candidate decision", async () => {
    let storedDecision:
      | {
          selectedUrl?: string;
          rationale: string;
          confidence?: number;
          defer: boolean;
        }
      | undefined;
    const tool = buildRecordAgentDecisionTool({
      getStoredReport: () => ({
        candidates: [
          {
            url: "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans/",
            normalizedUrl:
              "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
          },
        ],
      } as never),
      onDecision: async (decision) => {
        storedDecision = decision;
      },
    });

    const result = await tool.execute(
      "tool-call-structured-decision",
      {
        selectedUrl:
          "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
        rationale: "Exact UPC and variant match outweigh the generic official landing page.",
        confidence: 0.78,
      },
      undefined,
      undefined,
      {} as never,
    );

    expect(result.content[0]?.type).toBe("text");
    expect(storedDecision?.selectedUrl).toBe(
      "https://ticknersonline.drexelweb.com/product/purrsnickitty-cat-duck-stew-3oz-cat-cans",
    );
    expect(storedDecision?.defer).toBe(false);
  });

  it("executes the deterministic research tool and writes report artifacts", async () => {
    const outputDir = path.join(tempRoot, "artifacts");
    await mkdir(outputDir, { recursive: true });

    let reportPath: string | undefined;
    const tool = buildRunProductResearchTool({
      rawInput: exampleInput,
      invocationCwd: tempRoot,
      defaultPipeline: "local",
      defaultOutputDir: outputDir,
      onStoredReport: async (report) => {
        reportPath = report.artifacts?.reportPath;
      },
    });

    const result = await tool.execute(
      "tool-call-1",
      { pipeline: "local", pageAcquisition: "none", outputDir },
      undefined,
      undefined,
      {} as never,
    );

    expect(result.content[0]?.type).toBe("text");
    const textResult = result.content[0];
    if (!textResult || textResult.type !== "text") {
      throw new Error("Expected text tool output");
    }
    expect(textResult.text).toContain('"status": "completed"');
    expect(textResult.text).toContain("reportPath");
    expect(reportPath).toBeDefined();
    expect(Bun.file(reportPath!).size).toBeGreaterThan(0);
  });
});
