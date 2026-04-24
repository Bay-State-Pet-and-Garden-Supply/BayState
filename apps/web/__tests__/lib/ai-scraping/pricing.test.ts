import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// T4 TDD: tests FAIL RED until T6 implements catalog loader.
// Key behaviors: catalog-driven pricing, unknown→0 cost, snapshot resolution, Gemini support.
const CATALOG_FIXTURE = {
  openai_gpt4o_mini_batch: { input: 0.075, output: 0.30 },
  openai_gpt4o_mini_sync: { input: 0.15, output: 0.60 },
  openai_gpt4o_batch: { input: 1.25, output: 5.00 },
  openai_gpt4o_sync: { input: 2.50, output: 10.00 },
  gemini_25_flash_sync: { input: 0.30, output: 2.50 },
  gemini_25_pro_sync: { input: 1.25, output: 10.00 },
} as const;

describe('calculateAICost — shared pricing catalog consumption', () => {
  let calculateAICost: typeof import('@/lib/ai-scraping/pricing').calculateAICost;

  beforeEach(async () => {
    const mod = await import('@/lib/ai-scraping/pricing');
    calculateAICost = mod.calculateAICost;
  });

  it('computes gpt-4o-mini batch cost from catalog fixture values', () => {
    const promptTokens = 1_000_000;
    const completionTokens = 500_000;
    const cost = calculateAICost('gpt-4o-mini', promptTokens, completionTokens, true);

    const expected =
      (promptTokens / 1_000_000) * CATALOG_FIXTURE.openai_gpt4o_mini_batch.input +
      (completionTokens / 1_000_000) * CATALOG_FIXTURE.openai_gpt4o_mini_batch.output;

    expect(cost).toBeCloseTo(expected, 6);
  });

  it('computes gpt-4o-mini sync cost from catalog fixture values', () => {
    const promptTokens = 2_000_000;
    const completionTokens = 1_000_000;
    const cost = calculateAICost('gpt-4o-mini', promptTokens, completionTokens, false);

    const expected =
      (promptTokens / 1_000_000) * CATALOG_FIXTURE.openai_gpt4o_mini_sync.input +
      (completionTokens / 1_000_000) * CATALOG_FIXTURE.openai_gpt4o_mini_sync.output;

    expect(cost).toBeCloseTo(expected, 6);
  });

  it('computes gpt-4o batch cost from catalog fixture values', () => {
    const promptTokens = 500_000;
    const completionTokens = 200_000;
    const cost = calculateAICost('gpt-4o', promptTokens, completionTokens, true);

    const expected =
      (promptTokens / 1_000_000) * CATALOG_FIXTURE.openai_gpt4o_batch.input +
      (completionTokens / 1_000_000) * CATALOG_FIXTURE.openai_gpt4o_batch.output;

    expect(cost).toBeCloseTo(expected, 6);
  });

  it('computes gpt-4o sync cost from catalog fixture values', () => {
    const promptTokens = 100_000;
    const completionTokens = 50_000;
    const cost = calculateAICost('gpt-4o', promptTokens, completionTokens, false);

    const expected =
      (promptTokens / 1_000_000) * CATALOG_FIXTURE.openai_gpt4o_sync.input +
      (completionTokens / 1_000_000) * CATALOG_FIXTURE.openai_gpt4o_sync.output;

    expect(cost).toBeCloseTo(expected, 6);
  });

  it('returns 0 cost for unknown model instead of falling back to gpt-4o-mini', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const cost = calculateAICost('claude-3-opus', 1_000_000, 500_000, true);

    expect(cost).toBe(0);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('claude-3-opus'),
    );

    warnSpy.mockRestore();
  });

  it('returns 0 cost for empty model string', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const cost = calculateAICost('', 1_000_000, 500_000, true);
    expect(cost).toBe(0);

    warnSpy.mockRestore();
  });

  it('resolves snapshot-suffixed model names to base pricing', () => {
    const cost = calculateAICost('gpt-4o-mini-2024-07-18', 1_000_000, 1_000_000, true);

    const expected =
      (1_000_000 / 1_000_000) * CATALOG_FIXTURE.openai_gpt4o_mini_batch.input +
      (1_000_000 / 1_000_000) * CATALOG_FIXTURE.openai_gpt4o_mini_batch.output;

    expect(cost).toBeCloseTo(expected, 6);
  });

  it('computes gemini-2.5-flash sync cost from catalog fixture values', () => {
    const promptTokens = 1_000_000;
    const completionTokens = 500_000;
    const cost = calculateAICost('gemini-2.5-flash', promptTokens, completionTokens, false);

    const expected =
      (promptTokens / 1_000_000) * CATALOG_FIXTURE.gemini_25_flash_sync.input +
      (completionTokens / 1_000_000) * CATALOG_FIXTURE.gemini_25_flash_sync.output;

    expect(cost).toBeCloseTo(expected, 6);
  });

  it('computes gemini-2.5-pro sync cost from catalog fixture values', () => {
    const promptTokens = 1_000_000;
    const completionTokens = 500_000;
    const cost = calculateAICost('gemini-2.5-pro', promptTokens, completionTokens, false);

    const expected =
      (promptTokens / 1_000_000) * CATALOG_FIXTURE.gemini_25_pro_sync.input +
      (completionTokens / 1_000_000) * CATALOG_FIXTURE.gemini_25_pro_sync.output;

    expect(cost).toBeCloseTo(expected, 6);
  });

  it('returns 0 cost when both token counts are 0', () => {
    const cost = calculateAICost('gpt-4o-mini', 0, 0, true);
    expect(cost).toBe(0);
  });
});

describe('pricing catalog — exports and structure', () => {
  it('exports OPENAI_BATCH_PRICING that matches catalog fixture values', async () => {
    const { OPENAI_BATCH_PRICING } = await import('@/lib/ai-scraping/pricing');

    expect(OPENAI_BATCH_PRICING['gpt-4o-mini'].input).toBe(CATALOG_FIXTURE.openai_gpt4o_mini_batch.input);
    expect(OPENAI_BATCH_PRICING['gpt-4o-mini'].output).toBe(CATALOG_FIXTURE.openai_gpt4o_mini_batch.output);
    expect(OPENAI_BATCH_PRICING['gpt-4o'].input).toBe(CATALOG_FIXTURE.openai_gpt4o_batch.input);
    expect(OPENAI_BATCH_PRICING['gpt-4o'].output).toBe(CATALOG_FIXTURE.openai_gpt4o_batch.output);
  });

  it('exports OPENAI_SYNC_PRICING that matches catalog fixture values', async () => {
    const { OPENAI_SYNC_PRICING } = await import('@/lib/ai-scraping/pricing');

    expect(OPENAI_SYNC_PRICING['gpt-4o-mini'].input).toBe(CATALOG_FIXTURE.openai_gpt4o_mini_sync.input);
    expect(OPENAI_SYNC_PRICING['gpt-4o-mini'].output).toBe(CATALOG_FIXTURE.openai_gpt4o_mini_sync.output);
    expect(OPENAI_SYNC_PRICING['gpt-4o'].input).toBe(CATALOG_FIXTURE.openai_gpt4o_sync.input);
    expect(OPENAI_SYNC_PRICING['gpt-4o'].output).toBe(CATALOG_FIXTURE.openai_gpt4o_sync.output);
  });
});