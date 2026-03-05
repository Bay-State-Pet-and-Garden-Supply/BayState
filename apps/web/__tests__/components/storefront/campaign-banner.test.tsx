import { render, screen, fireEvent, act } from '@testing-library/react';
import { CampaignBanner } from '@/components/storefront/campaign-banner';

const mockMessages = [
  { text: 'First promotion', linkText: 'Shop Now', linkHref: '/sale' },
  { text: 'Second promotion' },
  { text: 'Third promotion', linkText: 'Learn More', linkHref: '/about' },
];

describe('CampaignBanner', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the first message', () => {
    render(<CampaignBanner messages={mockMessages} />);
    expect(screen.getByText('First promotion')).toBeInTheDocument();
  });

  it('renders link when provided', () => {
    render(<CampaignBanner messages={mockMessages} />);
    const link = screen.getByRole('link', { name: /shop now/i });
    expect(link).toHaveAttribute('href', '/sale');
  });

  it('can be dismissed', () => {
    render(<CampaignBanner messages={mockMessages} />);
    expect(screen.getByText('First promotion')).toBeInTheDocument();

    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismissButton);

    expect(screen.queryByText('First promotion')).not.toBeInTheDocument();
  });

  it('applies variant styles', () => {
    const { container } = render(
      <CampaignBanner messages={mockMessages} variant="seasonal" />
    );
    expect(container.firstChild).toHaveClass('bg-primary');
  });

  it('shows navigation buttons when multiple messages exist', () => {
    render(<CampaignBanner messages={mockMessages} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('hides navigation buttons for single message', () => {
    render(<CampaignBanner messages={[{ text: 'Single message' }]} />);
    expect(screen.queryByRole('button', { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /next/i })).not.toBeInTheDocument();
  });

  it('cycles to next message on button click', async () => {
    render(<CampaignBanner messages={mockMessages} />);
    expect(screen.getByText('First promotion')).toBeInTheDocument();

    const nextButton = screen.getByRole('button', { name: /next/i });
    fireEvent.click(nextButton);

    // Wait for transition
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    expect(screen.getByText('Second promotion')).toBeInTheDocument();
  });

  it('returns null when no messages provided', () => {
    const { container } = render(<CampaignBanner messages={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
