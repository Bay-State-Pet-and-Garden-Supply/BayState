import { render, screen } from '@testing-library/react';
import { StorefrontHeader } from '@/components/storefront/header';

const defaultProps = {
  user: null,
  userRole: null,
  categories: [],
  petTypes: [],
  brands: [],
};

const categoriesWithDogMenu = [
  { id: 'dog', name: 'Dog', slug: 'dog', parent_id: null },
  { id: 'dog-food', name: 'Dog Food', slug: 'dog-food', parent_id: 'dog' },
];

const brands = [{ id: 'brand-1', name: 'Acme', slug: 'acme', logo_url: null }];

// Mock the search provider
jest.mock('@/components/storefront/search-provider', () => ({
  useSearch: () => ({ openSearch: jest.fn() }),
}));

// Mock UserMenu and InlineSearch to avoid complexity/router deps
jest.mock('@/components/auth/user-menu', () => ({
  UserMenu: () => <div data-testid="user-menu" />
}));
jest.mock('@/components/storefront/inline-search', () => ({
  InlineSearch: () => <div data-testid="inline-search" />
}));
jest.mock('@/components/storefront/cart-drawer', () => ({
  CartDrawer: () => <div data-testid="cart-drawer" />
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

describe('StorefrontHeader', () => {
  it('renders the logo with store name', () => {
    render(<StorefrontHeader {...defaultProps} />);
    expect(screen.getAllByText('Bay State')).toHaveLength(2);
  });

  it('renders inline search component', () => {
    render(<StorefrontHeader {...defaultProps} />);
    expect(screen.getAllByTestId('inline-search')).toHaveLength(2);
  });



  it('renders cart button with accessible label', () => {
    render(<StorefrontHeader {...defaultProps} />);
    expect(screen.getAllByRole('button', { name: /shopping cart/i })).toHaveLength(2);
  });

  it('renders desktop navigation links', () => {
    render(
      <StorefrontHeader
        {...defaultProps}
        categories={categoriesWithDogMenu}
        brands={brands}
      />
    );
    expect(screen.getByRole('button', { name: /^dog$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /brands/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /our services/i })).toBeInTheDocument();
  });

  it('renders menu button for mobile', () => {
    render(<StorefrontHeader {...defaultProps} />);
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
  });

  it('renders user menu', () => {
    render(<StorefrontHeader {...defaultProps} />);
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  it('is hidden on mobile and visible on desktop', () => {
    const { container } = render(<StorefrontHeader {...defaultProps} />);
    const headerElement = container.querySelector('header');
    // Using max-md:hidden to hide on mobile only
    expect(headerElement).toHaveClass('max-md:hidden');
  });
});
