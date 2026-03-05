import { scraperConfigSchema } from '@/lib/admin/scrapers/schema';
import { z } from 'zod';

export { scraperConfigSchema };

export function validateConfig(config: unknown): {
  success: boolean;
  errors: string[];
  warnings: string[];
} {
  const parseResult = scraperConfigSchema.safeParse(config);

  if (parseResult.success) {
    const warnings: string[] = [];
    const cfg = config as Record<string, unknown>;

    if (cfg.base_url && typeof cfg.base_url === 'string' && !cfg.base_url.startsWith('https://')) {
      warnings.push('base_url should use HTTPS for production');
    }
    if (cfg.timeout && typeof cfg.timeout === 'number' && cfg.timeout > 60) {
      warnings.push('timeout > 60 seconds may impact performance');
    }
    if (cfg.retries && typeof cfg.retries === 'number' && cfg.retries > 5) {
      warnings.push('retries > 5 may increase runtime significantly');
    }

    const skus = ['test_skus', 'fake_skus', 'edge_case_skus'] as const;
    for (const skuField of skus) {
      const skusValue = cfg[skuField];
      if (Array.isArray(skusValue) && skusValue.length > 50) {
        warnings.push(`${skuField} has ${skusValue.length} items (recommended: < 50)`);
      }
    }

    return { success: true, errors: [], warnings };
  }

  const errors = parseResult.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`
  );

  return { success: false, errors, warnings: [] };
}

export type ValidationResult = ReturnType<typeof validateConfig>;
