import { render, screen } from '@testing-library/react';
import ContactPage from '@/app/(storefront)/contact/page';

describe('Contact Page', () => {
    it('displays page title', async () => {
        const Page = await ContactPage();
        render(Page);

        expect(screen.getByRole('heading', { name: /contact us/i })).toBeInTheDocument();
    });

    it('displays store hours', async () => {
        const Page = await ContactPage();
        render(Page);

        expect(screen.getByText(/Store Hours/i)).toBeInTheDocument();
    });

    it('displays location or address', async () => {
        const Page = await ContactPage();
        render(Page);

        expect(screen.getByText(/Location/i)).toBeInTheDocument();
    });

    it('displays phone number', async () => {
        const Page = await ContactPage();
        render(Page);

        // Look for the phone number text
        expect(screen.getByText('(508) 821-3704')).toBeInTheDocument();
    });
});
