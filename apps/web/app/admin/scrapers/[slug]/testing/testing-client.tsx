'use client';

import { useForm, FormProvider } from 'react-hook-form';
import { TestingTab } from '@/components/admin/scrapers/tabs/TestingTab';
import { ConfigFormValues, defaultConfigValues } from '@/components/admin/scrapers/form-schema';
import { ScraperConfig } from '@/lib/admin/scrapers/types';

interface TestingClientProps {
  scraper: ScraperConfig;
}

export function TestingClient({ scraper }: TestingClientProps) {
  const methods = useForm<ConfigFormValues>({
    defaultValues: {
      ...defaultConfigValues,
      name: scraper.name || '',
      display_name: scraper.display_name,
      base_url: scraper.base_url || '',
      test_skus: scraper.test_skus || [],
      fake_skus: scraper.fake_skus || [],
      selectors: scraper.selectors || [],
      workflows: scraper.workflows || [],
      normalization: scraper.normalization || [],
      login: scraper.login,
      timeout: scraper.timeout ?? 30,
      retries: scraper.retries ?? 3,
      image_quality: scraper.image_quality ?? 50,
      anti_detection: scraper.anti_detection as ConfigFormValues['anti_detection'],
      http_status: scraper.http_status as ConfigFormValues['http_status'],
      validation: scraper.validation as ConfigFormValues['validation'],
      edge_case_skus: scraper.edge_case_skus,
    },
  });

  return (
    <FormProvider {...methods}>
      <TestingTab />
    </FormProvider>
  );
}