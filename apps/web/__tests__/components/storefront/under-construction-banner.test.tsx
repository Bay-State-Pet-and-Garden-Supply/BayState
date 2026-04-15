import { render, screen } from '@testing-library/react';
import { UnderConstructionBanner } from '@/components/storefront/under-construction-banner';

describe('UnderConstructionBanner', () => {
  it('renders the under construction message', () => {
    render(<UnderConstructionBanner />);
    expect(screen.getByText(/Under Construction \/ Beta Preview/i)).toBeInTheDocument();
    expect(screen.getByText(/This is a development preview of our new website/i)).toBeInTheDocument();
  });

  it('contains a link to the official site', () => {
    render(<UnderConstructionBanner />);
    const link = screen.getByRole('link', { name: /Official Site/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://baystatepetgarden.com');
    expect(link).toHaveAttribute('target', '_blank');
  });
});
