import { render, screen } from '@testing-library/react';
import AdminSettingsPage from '@/app/admin/settings/page';

jest.mock('@/components/admin/settings/ShopSiteCredentialsCard', () => ({
  ShopSiteCredentialsCard: () => <div>ShopSite Credentials</div>,
}));

jest.mock('@/components/admin/settings/AIScrapingSettingsCard', () => ({
  AIScrapingSettingsCard: () => <div>AI Scraping Settings Card</div>,
}));

jest.mock('@/components/admin/settings/AIConsolidationSettingsCard', () => ({
  AIConsolidationSettingsCard: () => <div>AI Consolidation Settings Card</div>,
}));

describe('Admin Settings Page', () => {
  it('renders the finalized external stack notice', () => {
    render(<AdminSettingsPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings');
    expect(screen.getByText('External AI stack finalized')).toBeInTheDocument();
    expect(
      screen.getByText(/Scraping and consolidation now run on OpenAI/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Legacy Gemini, Brave Search, and SerpAPI credentials are deprecated/i)
    ).toBeInTheDocument();
  });
});
