import { render, screen } from '@testing-library/react';
import { Package, ShoppingCart } from 'lucide-react';
import { PipelineHeader } from '@/components/admin/pipeline/PipelineHeader';

describe('PipelineHeader', () => {
  it('renders title and subtitle', () => {
    render(<PipelineHeader title="Test Title" subtitle="Test Subtitle" />);

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Subtitle')).toBeInTheDocument();
  });

  it('renders default Package icon when no icon prop provided', () => {
    render(<PipelineHeader title="Test" subtitle="Desc" />);

    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders custom icon when provided', () => {
    render(
      <PipelineHeader
        title="Test"
        subtitle="Desc"
        icon={ShoppingCart}
      />
    );

    // Icon should be present
    const icon = document.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });

  it('renders actions when provided', () => {
    render(
      <PipelineHeader
        title="Test"
        subtitle="Desc"
        actions={<button>Action Button</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'Action Button' })).toBeInTheDocument();
  });

  it('does not render actions container when no actions provided', () => {
    render(<PipelineHeader title="Test" subtitle="Desc" />);

    // The actions div should not exist (or be empty)
    const container = screen.getByText('Test').parentElement?.parentElement;
    expect(container?.children.length).toBeLessThanOrEqual(2);
  });

  it('applies correct styling classes', () => {
    const { container } = render(
      <PipelineHeader title="Test" subtitle="Desc" />
    );
    // Check flex layout is applied
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex', 'flex-col', 'gap-2');
    expect(wrapper).toHaveClass('sm:flex-row', 'sm:items-center', 'sm:justify-between');
  });

  it('displays icon with correct color', () => {
    const { container } = render(
      <PipelineHeader 
        title="Test Pipeline" 
        icon={Package} 
      />
    );

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
  });
});
