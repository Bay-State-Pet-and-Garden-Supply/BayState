import { render, screen } from '@testing-library/react';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  })),
  usePathname: jest.fn(() => '/admin/services'),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

// Mock Supabase client
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: '1',
              name: 'Propane Refill',
              slug: 'propane-refill',
              description: 'Tank refills',
              price: 19.99,
              unit: 'tank',
              is_active: true,
            },
            {
              id: '2',
              name: 'Equipment Rentals',
              slug: 'equipment-rentals',
              description: 'Heavy duty equipment',
              price: 50.00,
              unit: 'day',
              is_active: false,
            },
          ],
          count: 2,
          error: null,
        }),
      }),
    }),
  }),
}));

import AdminServicesPage from '@/app/admin/services/page';

describe('Admin Services Page', () => {
  it('renders services heading', async () => {
    const page = await AdminServicesPage();
    render(page);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Services');
  });

  it('renders Add Service button', async () => {
    const page = await AdminServicesPage();
    render(page);
    expect(screen.getByRole('button', { name: /add service/i })).toBeInTheDocument();
  });

  it('renders service cards', async () => {
    const page = await AdminServicesPage();
    render(page);
    expect(screen.getByText('Propane Refill')).toBeInTheDocument();
    expect(screen.getByText('Equipment Rentals')).toBeInTheDocument();
  });

  it('shows active/inactive badges', async () => {
    const page = await AdminServicesPage();
    render(page);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });
});
