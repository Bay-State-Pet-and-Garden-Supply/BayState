/**
 * LoginStatusPanel Tests
 */

import { render, screen } from '@testing-library/react';
import { LoginStatusPanel } from '@/components/admin/scraper-lab/test-lab/LoginStatusPanel';

describe('LoginStatusPanel', () => {
    const defaultProps = {
        scraperName: 'amazon',
        sku: 'B001234567',
    };

    it('renders login status panel', () => {
        render(<LoginStatusPanel {...defaultProps} />);

        expect(screen.getByText('Login Status')).toBeInTheDocument();
        expect(screen.getByText('amazon / SKU: B001234567')).toBeInTheDocument();
    });

    it('shows pending state when no login event', () => {
        render(<LoginStatusPanel {...defaultProps} />);

        expect(screen.getByText('Waiting for login...')).toBeInTheDocument();
    });

    it('displays login steps with status', () => {
        render(
            <LoginStatusPanel
                {...defaultProps}
                loginEvent={{
                    username_field_status: 'FOUND',
                    password_field_status: 'FOUND',
                    submit_button_status: 'FOUND',
                    success_indicator_status: 'FOUND',
                    overall_status: 'SUCCESS',
                    timestamp: new Date().toISOString(),
                }}
            />
        );

        expect(screen.getByText('Username Field')).toBeInTheDocument();
        expect(screen.getByText('Password Field')).toBeInTheDocument();
        expect(screen.getByText('Submit Button')).toBeInTheDocument();
        expect(screen.getByText('Success Indicator')).toBeInTheDocument();
    });

    it('shows success badge when login successful', () => {
        render(
            <LoginStatusPanel
                {...defaultProps}
                loginEvent={{
                    overall_status: 'SUCCESS',
                    timestamp: new Date().toISOString(),
                }}
            />
        );

        expect(screen.getByText('Success')).toBeInTheDocument();
        expect(screen.getByText('Login successful!')).toBeInTheDocument();
    });

    it('shows failed badge when login failed', () => {
        render(
            <LoginStatusPanel
                {...defaultProps}
                loginEvent={{
                    overall_status: 'FAILED',
                    error_message: 'Invalid credentials',
                    timestamp: new Date().toISOString(),
                }}
            />
        );

        expect(screen.getByText('Failed')).toBeInTheDocument();
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });

    it('displays duration when available', () => {
        render(
            <LoginStatusPanel
                {...defaultProps}
                loginEvent={{
                    overall_status: 'SUCCESS',
                    duration_ms: 5000,
                    timestamp: new Date().toISOString(),
                }}
            />
        );

        expect(screen.getByText('Duration: 5000ms')).toBeInTheDocument();
    });
});
