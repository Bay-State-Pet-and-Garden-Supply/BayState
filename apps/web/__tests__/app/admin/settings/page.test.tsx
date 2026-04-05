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
  it('renders the Gemini migration notice', () => {
    render(<AdminSettingsPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings');
    expect(screen.getByText('AI provider migration complete')).toBeInTheDocument();
    expect(
      screen.getByText(/OpenAI and SerpAPI credentials have been removed from this admin UI/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Brave Search remains the only optional discovery fallback/i)
    ).toBeInTheDocument();
  });
});
