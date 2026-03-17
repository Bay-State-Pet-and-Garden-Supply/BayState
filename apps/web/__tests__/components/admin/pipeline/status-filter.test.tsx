import { render, screen } from '@testing-library/react';
import { StatusFilter } from '@/components/admin/pipeline/StatusFilter';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('StatusFilter', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  const mockCounts = {
    total: 100,
    registered: 10,
    enriched: 25,
    finalized: 60,
    failed: 5,
  };

  it('renders Status filter button', () => {
    render(<StatusFilter counts={mockCounts} />);

    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders Filter icon', () => {
    render(<StatusFilter counts={mockCounts} />);

    const icon = document.querySelector('.lucide-filter, .lucide-funnel');
    expect(icon).toBeInTheDocument();
  });

  it('applies styling based on className prop', () => {
    render(<StatusFilter counts={mockCounts} className="custom-class" />);

    const button = screen.getByText('Status').closest('button');
    expect(button).toHaveClass('custom-class');
  });

  it('handles empty counts gracefully', () => {
    const emptyCounts = { total: 0 };

    render(<StatusFilter counts={emptyCounts} />);

    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('handles missing status counts', () => {
    const partialCounts = { total: 50 };

    render(<StatusFilter counts={partialCounts} />);

    expect(screen.getByText('Status')).toBeInTheDocument();
  });
});
