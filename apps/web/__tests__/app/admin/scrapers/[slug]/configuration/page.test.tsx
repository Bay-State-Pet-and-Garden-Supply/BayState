import { describe, expect, it, jest } from '@jest/globals';
import ConfigurationPage from '@/app/admin/scrapers/[slug]/configuration/page';

jest.mock('@/lib/admin/scrapers/configs', () => ({
  getLocalScraperConfig: jest.fn(),
}));

jest.mock('@/components/admin/scrapers/YamlViewer', () => ({
  YamlViewer: () => null,
}));

jest.mock('@/components/ui/alert', () => ({
  Alert: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('ConfigurationPage', () => {
  it('calls getLocalScraperConfig and returns the page', async () => {
    const mockedGetLocalScraperConfig = (jest.requireMock('@/lib/admin/scrapers/configs') as { getLocalScraperConfig: jest.Mock }).getLocalScraperConfig;
    (mockedGetLocalScraperConfig as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue({
      yaml: 'name: amazon',
      config: { id: 'amazon', slug: 'amazon', name: 'Amazon', base_url: 'https://www.amazon.com' },
    });

    const page = await ConfigurationPage({ params: Promise.resolve({ slug: 'amazon' }) });

    expect(page).toBeDefined();
  });

  it('renders not found if config does not exist', async () => {
    const mockedGetLocalScraperConfig = (jest.requireMock('@/lib/admin/scrapers/configs') as { getLocalScraperConfig: jest.Mock }).getLocalScraperConfig;
    (mockedGetLocalScraperConfig as unknown as { mockResolvedValue: (value: unknown) => void }).mockResolvedValue(null);

    await expect(
      ConfigurationPage({ params: Promise.resolve({ slug: 'non-existent' }) })
    ).rejects.toBeDefined();
  });
});
