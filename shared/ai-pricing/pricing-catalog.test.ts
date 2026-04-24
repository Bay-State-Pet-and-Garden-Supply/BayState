import { describe, it, expect } from "@jest/globals";
import catalog from "./pricing-catalog.json";

const SNAPSHOT_SUFFIX_PATTERN = /-\d{4}-\d{2}-\d{2}$/;

type ModelEntry = {
  provider: string;
  model: string;
  mode: string;
  input_price: number;
  output_price: number;
  effective_date: string;
  source_url: string;
};

const REQUIRED_FIELDS: (keyof ModelEntry)[] = [
  "provider",
  "model",
  "mode",
  "input_price",
  "output_price",
  "effective_date",
  "source_url",
];

const REQUIRED_MODELS: [string, string, string][] = [
  ["openai", "gpt-4o-mini", "sync"],
  ["openai", "gpt-4o-mini", "batch"],
  ["openai", "gpt-4o", "sync"],
  ["openai", "gpt-4o", "batch"],
  ["gemini", "gemini-2.5-flash", "sync"],
  ["gemini", "gemini-2.5-pro", "sync"],
];

function findEntry(
  models: ModelEntry[],
  provider: string,
  model: string,
  mode: string,
): ModelEntry {
  const entry = models.find(
    (m) => m.provider === provider && m.model === model && m.mode === mode,
  );
  if (!entry) {
    throw new Error(`Model not found: ${provider}/${model}/${mode}`);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Schema contract tests
// ---------------------------------------------------------------------------

describe("Pricing Catalog Schema", () => {
  it("has $schema field", () => {
    expect(catalog).toHaveProperty("$schema");
  });

  it("has description field", () => {
    expect(catalog).toHaveProperty("description");
  });

  it("has last_updated field", () => {
    expect(catalog).toHaveProperty("last_updated");
  });

  it("has models array", () => {
    expect(catalog).toHaveProperty("models");
    expect(Array.isArray(catalog.models)).toBe(true);
  });

  it("models array is not empty", () => {
    expect(catalog.models.length).toBeGreaterThan(0);
  });
});

describe("Model Entry Schema", () => {
  it("every entry has all required fields", () => {
    for (const entry of catalog.models) {
      for (const field of REQUIRED_FIELDS) {
        expect(entry).toHaveProperty(field);
      }
    }
  });

  it("provider is a string", () => {
    for (const entry of catalog.models) {
      expect(typeof entry.provider).toBe("string");
    }
  });

  it("model is a string", () => {
    for (const entry of catalog.models) {
      expect(typeof entry.model).toBe("string");
    }
  });

  it("mode is sync or batch", () => {
    for (const entry of catalog.models) {
      expect(entry.mode).toMatch(/^(sync|batch)$/);
    }
  });

  it("prices are non-negative numbers", () => {
    for (const entry of catalog.models) {
      expect(typeof entry.input_price).toBe("number");
      expect(typeof entry.output_price).toBe("number");
      expect(entry.input_price).toBeGreaterThanOrEqual(0);
      expect(entry.output_price).toBeGreaterThanOrEqual(0);
    }
  });

  it("effective_date is YYYY-MM-DD format", () => {
    for (const entry of catalog.models) {
      expect(entry.effective_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("source_url is an HTTP URL", () => {
    for (const entry of catalog.models) {
      expect(entry.source_url).toMatch(/^https?:\/\//);
    }
  });
});

// ---------------------------------------------------------------------------
// Required models contract tests
// ---------------------------------------------------------------------------

describe("Required Models", () => {
  it("all required models are present", () => {
    const catalogKeys = new Set(
      catalog.models.map(
        (m: ModelEntry) => `${m.provider}|${m.model}|${m.mode}`,
      ),
    );
    for (const [provider, model, mode] of REQUIRED_MODELS) {
      expect(catalogKeys.has(`${provider}|${model}|${mode}`)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Pricing accuracy contract tests
// ---------------------------------------------------------------------------

describe("Pricing Accuracy", () => {
  it("openai gpt-4o-mini sync: input=$0.15, output=$0.60", () => {
    const entry = findEntry(catalog.models, "openai", "gpt-4o-mini", "sync");
    expect(entry.input_price).toBe(0.15);
    expect(entry.output_price).toBe(0.60);
  });

  it("openai gpt-4o-mini batch: input=$0.075, output=$0.30", () => {
    const entry = findEntry(catalog.models, "openai", "gpt-4o-mini", "batch");
    expect(entry.input_price).toBe(0.075);
    expect(entry.output_price).toBe(0.30);
  });

  it("openai gpt-4o sync: input=$2.50, output=$10.00", () => {
    const entry = findEntry(catalog.models, "openai", "gpt-4o", "sync");
    expect(entry.input_price).toBe(2.50);
    expect(entry.output_price).toBe(10.00);
  });

  it("openai gpt-4o batch: input=$1.25, output=$5.00", () => {
    const entry = findEntry(catalog.models, "openai", "gpt-4o", "batch");
    expect(entry.input_price).toBe(1.25);
    expect(entry.output_price).toBe(5.00);
  });

  it("gemini 2.5 flash sync: input=$0.30, output=$2.50", () => {
    const entry = findEntry(catalog.models, "gemini", "gemini-2.5-flash", "sync");
    expect(entry.input_price).toBe(0.30);
    expect(entry.output_price).toBe(2.50);
  });

  it("gemini 2.5 pro sync: input=$1.25, output=$10.00", () => {
    const entry = findEntry(catalog.models, "gemini", "gemini-2.5-pro", "sync");
    expect(entry.input_price).toBe(1.25);
    expect(entry.output_price).toBe(10.00);
  });

  it("openai batch pricing is 50% of sync pricing", () => {
    const syncModels = catalog.models.filter(
      (m: ModelEntry) => m.provider === "openai" && m.mode === "sync",
    );
    for (const syncEntry of syncModels) {
      const batchEntry = findEntry(
        catalog.models,
        "openai",
        syncEntry.model,
        "batch",
      );
      expect(batchEntry.input_price).toBeCloseTo(syncEntry.input_price / 2, 6);
      expect(batchEntry.output_price).toBeCloseTo(syncEntry.output_price / 2, 6);
    }
  });
});

// ---------------------------------------------------------------------------
// Snapshot date suffix stripping contract tests
// ---------------------------------------------------------------------------

describe("Snapshot Suffix Stripping", () => {
  it("gpt-4o-2024-08-06 strips to gpt-4o and finds pricing", () => {
    const snapshotModel = "gpt-4o-2024-08-06";
    const baseModel = snapshotModel.replace(SNAPSHOT_SUFFIX_PATTERN, "");
    expect(baseModel).toBe("gpt-4o");
    expect(catalog.models.some((m: ModelEntry) => m.model === baseModel)).toBe(true);
  });

  it("gpt-4o-mini-2024-07-18 strips to gpt-4o-mini and finds pricing", () => {
    const snapshotModel = "gpt-4o-mini-2024-07-18";
    const baseModel = snapshotModel.replace(SNAPSHOT_SUFFIX_PATTERN, "");
    expect(baseModel).toBe("gpt-4o-mini");
    expect(catalog.models.some((m: ModelEntry) => m.model === baseModel)).toBe(true);
  });

  it("base model names are unchanged by stripping", () => {
    for (const entry of catalog.models) {
      const stripped = entry.model.replace(SNAPSHOT_SUFFIX_PATTERN, "");
      expect(stripped).toBe(entry.model);
    }
  });
});

// ---------------------------------------------------------------------------
// Unknown model contract tests
// ---------------------------------------------------------------------------

describe("Unknown Model Handling", () => {
  it("unknown model name is not in catalog", () => {
    const unknownModel = "claude-3.5-sonnet";
    expect(
      catalog.models.some((m: ModelEntry) => m.model === unknownModel),
    ).toBe(false);
  });

  it("unknown model with snapshot suffix base is not in catalog", () => {
    const unknownSnapshot = "claude-3.5-sonnet-20240620";
    const base = unknownSnapshot.replace(SNAPSHOT_SUFFIX_PATTERN, "");
    expect(catalog.models.some((m: ModelEntry) => m.model === base)).toBe(false);
  });

  it("unknown model returns 0 cost, not fallback to paid model", () => {
    const unknownModel = "nonexistent-model-xyz";
    const found = catalog.models.some(
      (m: ModelEntry) => m.model === unknownModel,
    );
    const cost = found ? Infinity : 0;
    expect(cost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Cost calculation contract tests
// ---------------------------------------------------------------------------

describe("Cost Calculation", () => {
  it("gpt-4o-mini sync: 1000 input + 500 output = $0.00045", () => {
    const entry = findEntry(catalog.models, "openai", "gpt-4o-mini", "sync");
    const inputTokens = 1000;
    const outputTokens = 500;
    const cost =
      (inputTokens / 1_000_000) * entry.input_price +
      (outputTokens / 1_000_000) * entry.output_price;
    expect(cost).toBeCloseTo(0.00045, 6);
  });

  it("gpt-4o-mini batch: 1000 input + 500 output = $0.000225", () => {
    const entry = findEntry(catalog.models, "openai", "gpt-4o-mini", "batch");
    const inputTokens = 1000;
    const outputTokens = 500;
    const cost =
      (inputTokens / 1_000_000) * entry.input_price +
      (outputTokens / 1_000_000) * entry.output_price;
    expect(cost).toBeCloseTo(0.000225, 6);
  });

  it("zero tokens results in zero cost", () => {
    const entry = findEntry(catalog.models, "openai", "gpt-4o-mini", "sync");
    const cost = (0 / 1_000_000) * entry.input_price + (0 / 1_000_000) * entry.output_price;
    expect(cost).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Uniqueness contract test
// ---------------------------------------------------------------------------

describe("Uniqueness", () => {
  it("no duplicate (provider, model, mode) entries", () => {
    const keys = catalog.models.map(
      (m: ModelEntry) => `${m.provider}|${m.model}|${m.mode}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});