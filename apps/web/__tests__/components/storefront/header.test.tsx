import { render, screen } from '@testing-library/react';
import { StorefrontHeader } from '@/components/storefront/header';

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
    render(
      <StorefrontHeader
        user={null}
        userRole={null}
        categories={[]}
        petTypes={[]}
        brands={[]}
      />
    );
    expect(screen.getByText('Bay State')).toBeInTheDocument();
  });

  it('renders inline search component', () => {
    render(
      <StorefrontHeader
        user={null}
        userRole={null}
        categories={[]}
        petTypes={[]}
        brands={[]}
      />
    );
    expect(screen.getAllByTestId('inline-search')).toHaveLength(2);
  });



  it('renders cart button with accessible label', () => {
    render(
      <StorefrontHeader
        user={null}
        userRole={null}
        categories={[]}
        petTypes={[]}
        brands={[]}
      />
    );
    expect(screen.getAllByRole('button', { name: /shopping cart/i })).toHaveLength(2);
  });

  it('renders desktop navigation links', () => {
    render(
      <StorefrontHeader
        user={null}
        userRole={null}
        categories={[]}
        petTypes={[]}
        brands={[]}
      />
    );
    expect(screen.getByRole('button', { name: /shop pet supplies/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /shop by brand/i })).toBeInTheDocument();
    expect(screen.getByText(/Shop Farm/i)).toBeInTheDocument();
    expect(screen.getByText(/Services/i)).toBeInTheDocument();
  });

  it('renders menu button for mobile', () => {
    render(
      <StorefrontHeader
        user={null}
        userRole={null}
        categories={[]}
        petTypes={[]}
        brands={[]}
      />
    );
    expect(screen.getByRole('button', { name: /menu/i })).toBeInTheDocument();
  });

  it('renders user menu', () => {
    render(
      <StorefrontHeader
        user={null}
        userRole={null}
        categories={[]}
        petTypes={[]}
        brands={[]}
      />
    );
    expect(screen.getByTestId('user-menu')).toBeInTheDocument();
  });

  it('is hidden on mobile and visible on desktop', () => {
    const { container } = render(
      <StorefrontHeader
        user={null}
        userRole={null}
        categories={[]}
        petTypes={[]}
        brands={[]}
      />
    );
    const headerElement = container.querySelector('header');
    // Using max-md:hidden to hide on mobile only
    expect(headerElement).toHaveClass('max-md:hidden');
  });
});
