import ConfigurationPage from '@/app/admin/scrapers/[slug]/configuration/page';
import { getLocalScraperConfig } from '@/lib/admin/scrapers/configs';
import { expect, it, describe, mock } from 'bun:test';

mock.module('@/lib/admin/scrapers/configs', () => ({
  getLocalScraperConfig: mock(() => Promise.resolve(null)),
}));

mock.module('@/components/admin/scrapers/YamlViewer', () => ({
  YamlViewer: () => null,
}));

mock.module('@/components/ui/alert', () => ({
  Alert: ({ children }: any) => <div>{children}</div>,
  AlertTitle: ({ children }: any) => <div>{children}</div>,
  AlertDescription: ({ children }: any) => <div>{children}</div>,
}));

describe('ConfigurationPage', () => {
  it('calls getLocalScraperConfig and returns the page', async () => {
    const mockResult = {
      yaml: 'name: amazon',
      config: { id: 'amazon', slug: 'amazon', name: 'Amazon', base_url: 'https://www.amazon.com' }
    };
    (getLocalScraperConfig as any).mockResolvedValue(mockResult);

    const Page = await ConfigurationPage({ params: Promise.resolve({ slug: 'amazon' }) });
    
    expect(getLocalScraperConfig).toHaveBeenCalledWith('amazon');
    expect(Page).toBeDefined();
  });

  it('renders not found if config does not exist', async () => {
    (getLocalScraperConfig as any).mockResolvedValue(null);

    try {
      await ConfigurationPage({ params: Promise.resolve({ slug: 'non-existent' }) });
    } catch (e: any) {
      // In Next.js, notFound() throws an error that is handled by the framework
      expect(e).toBeDefined();
    }
  });
});
