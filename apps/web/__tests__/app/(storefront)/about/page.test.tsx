import { render, screen } from '@testing-library/react';
import AboutPage from '@/app/(storefront)/about/page';

describe('About Page', () => {
    it('displays page title', async () => {
        const Page = await AboutPage();
        render(Page);

        expect(screen.getByRole('heading', { name: /about/i })).toBeInTheDocument();
    });

    it('displays store history section', async () => {
        const Page = await AboutPage();
        render(Page);

        expect(screen.getByText(/Our History/i)).toBeInTheDocument();
    });

    it('displays team or ownership info', async () => {
        const Page = await AboutPage();
        render(Page);

        expect(screen.getByText(/Family Owned/i)).toBeInTheDocument();
    });
});
