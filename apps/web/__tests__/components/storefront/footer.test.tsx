import { render, screen } from '@testing-library/react';
import { StorefrontFooter } from '@/components/storefront/footer';

describe('StorefrontFooter', () => {
  it('renders the store name', () => {
    render(<StorefrontFooter />);
    expect(screen.getByText('Bay State Pet & Garden')).toBeInTheDocument();
  });

  it('renders Shop section with links', () => {
    render(<StorefrontFooter />);
    expect(screen.getByText('Shop')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /all products/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /brands/i })).toBeInTheDocument();
  });

  it('renders Services section with links', () => {
    render(<StorefrontFooter />);
    expect(screen.getByRole('link', { name: /propane refill/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /equipment rentals/i })).toBeInTheDocument();
  });

  it('renders Contact section', () => {
    render(<StorefrontFooter />);
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText(/sales@baystatepet.com/i)).toBeInTheDocument();
    expect(screen.getByText(/\(774\) 226-9845/i)).toBeInTheDocument();
  });

  it('renders copyright with current year', () => {
    render(<StorefrontFooter />);
    const currentYear = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(currentYear))).toBeInTheDocument();
  });
});
