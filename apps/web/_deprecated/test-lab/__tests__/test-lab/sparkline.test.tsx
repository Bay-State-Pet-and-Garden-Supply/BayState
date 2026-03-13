import { render, screen } from '@testing-library/react';
import { Sparkline } from '@/components/admin/scrapers/test-lab/sparkline';

describe('Sparkline', () => {
  it('renders a canvas or svg for sparkline', () => {
    const data = [10, 20, 15, 30, 25];
    render(<Sparkline data={data} />);
    
    // Check if it renders
    expect(screen.getByTestId('sparkline')).toBeInTheDocument();
  });

  it('handles empty data gracefully', () => {
    render(<Sparkline data={[]} />);
    expect(screen.queryByTestId('sparkline')).toBeInTheDocument();
  });
});
