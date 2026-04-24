import { calculateAICost } from './pricing';

describe('calculateAICost', () => {
  it('normalizes dated snapshot model names to canonical OpenAI pricing', () => {
    expect(calculateAICost('gpt-4o-2024-11-20', 1_000_000, 1_000_000, true)).toBeCloseTo(6.25);
    expect(calculateAICost('gpt-4o-mini-2024-07-18', 1_000_000, 1_000_000, false)).toBeCloseTo(0.75);
  });

  it('returns 0 cost and warns for unknown models', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(calculateAICost('unknown-model', 1_000_000, 1_000_000, true)).toBe(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('unknown-model'),
    );

    warnSpy.mockRestore();
  });
});
