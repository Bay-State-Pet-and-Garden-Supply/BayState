/**
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { ProgressBar, JobStatus } from '@/components/admin/pipeline/ProgressBar';

describe('ProgressBar', () => {
  const renderProgressBar = (props: {
    progress?: number;
    status?: JobStatus;
    eta?: string;
    animated?: boolean;
  }) => {
    return render(
      <ProgressBar
        progress={props.progress ?? 50}
        status={props.status ?? 'running'}
        eta={props.eta}
        animated={props.animated}
      />
    );
  };

  describe('Progress rendering', () => {
    it('renders with default progress of 50%', () => {
      renderProgressBar({ progress: 50, status: 'running' });
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });

    it('displays 0% progress correctly', () => {
      renderProgressBar({ progress: 0, status: 'pending' });
      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('displays 100% progress correctly', () => {
      renderProgressBar({ progress: 100, status: 'completed' });
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('Clamping', () => {
    it('clamps progress greater than 100 to 100%', () => {
      renderProgressBar({ progress: 150, status: 'running' });
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('clamps negative progress to 0%', () => {
      renderProgressBar({ progress: -20, status: 'running' });
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });

  describe('Animation', () => {
    it('applies transition class when animated is true', () => {
      renderProgressBar({ progress: 50, status: 'running', animated: true });
      const indicator = screen.getByRole('progressbar').firstChild;
      expect(indicator).toHaveClass('transition-all');
    });

    it('does not apply transition class when animated is false', () => {
      renderProgressBar({ progress: 50, status: 'running', animated: false });
      const indicator = screen.getByRole('progressbar').firstChild;
      expect(indicator).not.toHaveClass('transition-all');
    });
  });

  describe('Status colors', () => {
    it('applies blue color for running status', () => {
      renderProgressBar({ progress: 50, status: 'running' });
      const indicator = screen.getByRole('progressbar').firstChild;
      expect(indicator).toHaveClass('bg-blue-600');
    });

    it('applies green color for completed status', () => {
      renderProgressBar({ progress: 100, status: 'completed' });
      const indicator = screen.getByRole('progressbar').firstChild;
      expect(indicator).toHaveClass('bg-green-600');
    });

    it('applies red color for failed status', () => {
      renderProgressBar({ progress: 30, status: 'failed' });
      const indicator = screen.getByRole('progressbar').firstChild;
      expect(indicator).toHaveClass('bg-red-600');
    });
  });

  describe('ETA display', () => {
    it('displays ETA when provided for running status', () => {
      renderProgressBar({ progress: 50, status: 'running', eta: '~2m remaining' });
      expect(screen.getByText('~2m remaining')).toBeInTheDocument();
    });

    it('does not display ETA for completed status even if provided', () => {
      renderProgressBar({ progress: 100, status: 'completed', eta: '~2m remaining' });
      expect(screen.queryByText('~2m remaining')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has role="progressbar"', () => {
      renderProgressBar({ progress: 50, status: 'running' });
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('has correct aria-valuenow attribute', () => {
      renderProgressBar({ progress: 75, status: 'running' });
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
    });

    it('has aria-valuemin of 0', () => {
      renderProgressBar({ progress: 50, status: 'running' });
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemin', '0');
    });

    it('has aria-valuemax of 100', () => {
      renderProgressBar({ progress: 50, status: 'running' });
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '100');
    });
  });
});
