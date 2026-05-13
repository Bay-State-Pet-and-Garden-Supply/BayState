jest.mock('ai', () => ({
  Output: {
    object: jest.fn(() => null),
  },
  generateText: jest.fn(),
}));

jest.mock('@ai-sdk/deepseek', () => ({
  createDeepSeek: jest.fn(() => jest.fn(() => ({ modelId: 'mock-model' }))),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(),
}));

jest.mock('@/lib/ai-scraping/credentials', () => ({
  getAIScrapingRuntimeCredentials: jest.fn(),
}));

jest.mock('@/lib/ai-scraping/deepseek', () => ({
  getDeepSeekBaseURL: jest.fn((value: string | null | undefined) => value ?? null),
}));

import {
  extractTrailingProductQualifiers,
  selectCandidatesForScoring,
  stabilizePredictedName,
} from '@/lib/official-brand-discovery';

describe('extractTrailingProductQualifiers', () => {
  it('captures compact trailing size qualifiers from the raw product name', () => {
    expect(
      extractTrailingProductQualifiers('FROMM CAT PURRSNICK DUCK STEW 3OZ'),
    ).toEqual(['3 oz']);
  });

  it('captures trailing dimensions and counts together', () => {
    expect(
      extractTrailingProductQualifiers('Litter Box System Cat Pads 11 X 17 10 ct.'),
    ).toEqual(['11 X 17', '10 ct']);
  });
});

describe('stabilizePredictedName', () => {
  it('preserves missing trailing size qualifiers in predicted names', () => {
    expect(
      stabilizePredictedName(
        'FROMM CAT PURRSNICK DUCK STEW 3OZ',
        'Fromm PurrSnickitty Duck Stew',
      ),
    ).toBe('Fromm PurrSnickitty Duck Stew 3 oz');
  });

  it('does not duplicate qualifiers that are already present', () => {
    expect(
      stabilizePredictedName(
        'Fresh Batch Chicken Recipe 12 lb.',
        'Fresh Batch Chicken Recipe 12 lb',
      ),
    ).toBe('Fresh Batch Chicken Recipe 12 lb');
  });
});

describe('selectCandidatesForScoring', () => {
  it('shortlists the most promising candidates instead of the first raw results', () => {
    const candidates = [
      {
        url: 'https://organic-1.example.com/result',
        title: 'Generic result one',
        snippet: 'Unrelated listing',
        result_type: 'organic' as const,
        appeared_in_phases: [1],
      },
      {
        url: 'https://organic-2.example.com/result',
        title: 'Generic result two',
        snippet: 'Unrelated listing',
        result_type: 'organic' as const,
        appeared_in_phases: [1],
      },
      {
        url: 'https://organic-3.example.com/result',
        title: 'Generic result three',
        snippet: 'Unrelated listing',
        result_type: 'organic' as const,
        appeared_in_phases: [1],
      },
      {
        url: 'https://organic-4.example.com/result',
        title: 'Generic result four',
        snippet: 'Unrelated listing',
        result_type: 'organic' as const,
        appeared_in_phases: [1],
      },
      {
        url: 'https://organic-5.example.com/result',
        title: 'Generic result five',
        snippet: 'Unrelated listing',
        result_type: 'organic' as const,
        appeared_in_phases: [1],
      },
      {
        url: 'https://gofromm.com/products/purrsnickitty-duck-stew',
        title: 'Fromm PurrSnickitty Duck Stew 3 oz',
        snippet: 'Official Fromm product page',
        result_type: 'organic' as const,
        appeared_in_phases: [1, 2],
      },
    ];

    const shortlisted = selectCandidatesForScoring(
      candidates,
      ['gofromm.com'],
      [],
      '072705113446',
      'Fromm PurrSnickitty Duck Stew 3 oz',
      5,
    );

    expect(shortlisted.has('https://gofromm.com/products/purrsnickitty-duck-stew')).toBe(true);
    expect(shortlisted.has('https://organic-5.example.com/result')).toBe(false);
    expect(shortlisted.size).toBe(5);
  });
});
