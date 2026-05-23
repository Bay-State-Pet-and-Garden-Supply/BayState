import { render, screen } from '@testing-library/react';
import AdminSettingsPage from '@/app/admin/settings/page';

jest.mock('@/components/admin/settings/ShopSiteCredentialsCard', () => ({
  ShopSiteCredentialsCard: () => <div>ShopSite Credentials</div>,
}));

jest.mock('@/components/admin/settings/DistributorCredentialsCard', () => ({
  DistributorCredentialsCard: () => <div>Distributor Credentials</div>,
}));

jest.mock('@/components/admin/settings/AIProviderProfilesCard', () => ({
  AIProviderProfilesCard: () => <div>AI Provider Profiles Card</div>,
}));

describe('Admin Settings Page', () => {
  it('renders the dynamic AI provider stack notice', () => {
    render(<AdminSettingsPage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Settings');
    expect(screen.getByText('Dynamic AI Provider Stack')).toBeInTheDocument();
    expect(
      screen.getByText(/Assign profiles to extraction/i)
    ).toBeInTheDocument();
  });
});

