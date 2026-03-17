import ScraperListPage from '@/app/admin/scrapers/list/page';
import { getLocalScraperConfigs } from '@/lib/admin/scrapers/configs';
import { expect, it, describe, mock } from 'bun:test';

mock.module('@/lib/admin/scrapers/configs', () => ({
  getLocalScraperConfigs: mock(() => Promise.resolve([])),
}));

mock.module('./ScraperListClient', () => ({
  ScraperListClient: () => null,
}));

mock.module('@/components/ui/skeleton', () => ({
  Skeleton: () => null,
}));

describe('ScraperListPage', () => {
  it('calls getLocalScraperConfigs and returns the page', async () => {
    const mockConfigs = [
      { id: 'amazon', slug: 'amazon', name: 'Amazon', display_name: 'Amazon', base_url: 'https://www.amazon.com', status: 'active' as const, scraper_type: 'static' as const, health_status: 'healthy' as const, health_score: 100, last_test_at: null, schema_version: '1.0' }
    ];
    (getLocalScraperConfigs as any).mockResolvedValue(mockConfigs);

    const Page = await ScraperListPage();
    
    expect(getLocalScraperConfigs).toHaveBeenCalled();
    expect(Page).toBeDefined();
    expect(Page.type).toBe('div');
  });
});
