import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StorefrontHeader } from '@/components/storefront/header';

const defaultProps = {
  user: null,
  userRole: null,
  categories: [],
  petTypes: [],
  brands: [],
};

const categoriesWithDogMenu = [
  { id: 'dog', name: 'Dog', slug: 'dog', parent_id: null, is_featured: true },
  { id: 'dog-food', name: 'Food', slug: 'dog-food', parent_id: 'dog' },
  { id: 'dog-dry', name: 'Dry Food', slug: 'dog-food-dry', parent_id: 'dog-food' },
  { id: 'dog-treats', name: 'Treats', slug: 'dog-treats', parent_id: 'dog' },
  { id: 'dog-jerky', name: 'Jerky & Chews', slug: 'dog-jerky', parent_id: 'dog-treats' },
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
    expect(screen.getByRole('button', { name: /^Brands$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Our Services/i })).toBeInTheDocument();
  });

  it('renders grouped mega menu content for nested categories', async () => {
    const user = userEvent.setup();

    render(
      <StorefrontHeader
        {...defaultProps}
        categories={categoriesWithDogMenu}
        brands={brands}
      />
    );

    await user.click(screen.getByRole('button', { name: /^Dog$/i }));

    expect(await screen.findByRole('link', { name: /Shop all Dog/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Food$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dry Food/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Jerky & Chews/i })).toBeInTheDocument();
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
