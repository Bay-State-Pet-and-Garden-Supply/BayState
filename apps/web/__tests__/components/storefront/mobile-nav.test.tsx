import { render, screen } from '@testing-library/react';
import { MobileNav } from '@/components/storefront/mobile-nav';

// Mock usePathname
jest.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

// Mock useSearch
jest.mock('@/components/storefront/search-provider', () => ({
  useSearch: () => ({
    openSearch: jest.fn(),
    closeSearch: jest.fn(),
    isOpen: false,
  }),
}));

describe('MobileNav', () => {
  it('renders navigation links', () => {
    render(<MobileNav />);
    expect(screen.getByRole('link', { name: /home/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /cart/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /account/i })).toBeInTheDocument();
  });

  it('marks home as current page when on /', () => {
    render(<MobileNav />);
    const homeLink = screen.getByRole('link', { name: /home/i });
    expect(homeLink).toHaveAttribute('aria-current', 'page');
  });
});
