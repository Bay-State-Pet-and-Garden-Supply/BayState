import { render, screen } from '@testing-library/react';
import NotFoundPage from '@/app/not-found';

describe('404 Not Found Page', () => {
    it('displays 404 message', () => {
        render(<NotFoundPage />);

        expect(screen.getByText('404')).toBeInTheDocument();
    });

    it('displays Page Not Found heading', () => {
        render(<NotFoundPage />);

        expect(screen.getByText('Page Not Found')).toBeInTheDocument();
    });

    it('displays link to home page', () => {
        render(<NotFoundPage />);

        expect(screen.getByRole('link', { name: /go home/i })).toBeInTheDocument();
    });
});
