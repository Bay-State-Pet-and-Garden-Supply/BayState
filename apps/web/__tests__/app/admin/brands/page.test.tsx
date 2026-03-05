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
    usePathname: jest.fn(() => '/admin/brands'),
    useSearchParams: jest.fn(() => new URLSearchParams()),
}));

import AdminBrandsPage from '@/app/admin/brands/page';

// Mock the server component data fetching
jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn().mockResolvedValue({
        from: jest.fn().mockReturnValue({
            select: jest.fn().mockReturnValue({
                order: jest.fn().mockResolvedValue({
                    data: [
                        { id: '1', name: 'Purina', slug: 'purina', logo_url: null, created_at: '2024-01-01' },
                        { id: '2', name: 'Blue Buffalo', slug: 'blue-buffalo', logo_url: '/logos/bb.png', created_at: '2024-01-02' }
                    ],
                    count: 2,
                    error: null
                }),
            }),
        }),
    }),
}));

describe('Admin Brands Page', () => {
    it('displays a list of brands', async () => {
        const Page = await AdminBrandsPage();
        render(Page);

        expect(screen.getByText('Purina')).toBeInTheDocument();
        expect(screen.getByText('Blue Buffalo')).toBeInTheDocument();
    });

    it('displays page title', async () => {
        const Page = await AdminBrandsPage();
        render(Page);

        expect(screen.getByRole('heading', { name: /brands/i })).toBeInTheDocument();
    });

    it('displays Add Brand button', async () => {
        const Page = await AdminBrandsPage();
        render(Page);

        expect(screen.getByRole('button', { name: /add brand/i })).toBeInTheDocument();
    });
});
