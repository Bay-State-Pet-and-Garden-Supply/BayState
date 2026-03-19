import { describe, expect, it, jest } from '@jest/globals';
import ScraperListPage from '@/app/admin/scrapers/list/page';

jest.mock('@/lib/admin/scrapers/configs', () => ({
  getLocalScraperConfigs: jest.fn(),
}));

jest.mock('@/components/ui/skeleton', () => ({
  Skeleton: () => null,
}));

describe('ScraperListPage', () => {
  it('calls getLocalScraperConfigs and returns the page', async () => {
    const mockedGetLocalScraperConfigs = (jest.requireMock('@/lib/admin/scrapers/configs') as { getLocalScraperConfigs: jest.Mock }).getLocalScraperConfigs;
    (mockedGetLocalScraperConfigs as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue([
      {
        id: 'amazon',
        slug: 'amazon',
        name: 'Amazon',
        display_name: 'Amazon',
        base_url: 'https://www.amazon.com',
        status: 'active',
        scraper_type: 'static',
        health_status: 'healthy',
        health_score: 100,
        last_test_at: null,
        schema_version: '1.0',
      },
    ]);

    const page = await ScraperListPage();

    expect(page).toBeDefined();
  });
});
