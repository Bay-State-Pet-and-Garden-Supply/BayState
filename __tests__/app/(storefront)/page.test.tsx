import { render, screen } from '@testing-library/react';
import { cookies } from 'next/headers';

// Mock the data fetching
jest.mock('@/lib/data', () => ({
  getFeaturedProducts: jest.fn().mockResolvedValue([]),
}));

// Mock async components that might cause issues in test environment
jest.mock('@/components/storefront/pet-recommendations', () => ({
  PetRecommendations: () => <div data-testid="pet-recommendations" />,
}));

jest.mock('@/components/storefront/featured-products', () => ({
  FeaturedProducts: () => <div data-testid="featured-products" />,
}));

// Mock next/headers cookies for server component testing
jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));

// Mock settings that use cookies
jest.mock('@/lib/settings', () => ({
  getHomepageSettings: jest.fn().mockResolvedValue({
    heroSlides: null,
    heroSlideInterval: 5000,
  }),
}));

// Import after mocking
import HomePage from '@/app/(storefront)/page';

describe('Home Page', () => {
  beforeEach(() => {
    // Setup mock cookies function
    const cookieStore = {
      get: jest.fn(),
      getAll: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };
    (cookies as jest.Mock).mockReturnValue(cookieStore);
  });

  it('renders the homepage with hero section', async () => {
    const page = await HomePage();
    render(page);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bay State Pet & Garden');
  });

  it('renders Shop Now and Our Services buttons', async () => {
    const page = await HomePage();
    render(page);
    expect(screen.getByRole('link', { name: /shop now/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /our services/i })).toBeInTheDocument();
  });

  it('renders category cards', async () => {
    const page = await HomePage();
    render(page);
    expect(screen.getByText('Pet Supplies')).toBeInTheDocument();
    expect(screen.getByText('Lawn & Garden')).toBeInTheDocument();
    expect(screen.getByText('Home & Fuel')).toBeInTheDocument();
  });
});
