import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RunnerManagementPanel } from '@/components/admin/scraper-network/runner-management-panel';

const mockRefresh = jest.fn();
const mockDisableRunner = jest.fn();
const mockEnableRunner = jest.fn();
const mockRenameRunner = jest.fn();
const mockDeleteRunner = jest.fn();
const mockUpdateRunnerMetadata = jest.fn();
const mockRotateRunnerKey = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/app/admin/scrapers/network/[id]/actions', () => ({
  renameRunner: (...args: unknown[]) => mockRenameRunner(...args),
  disableRunner: (...args: unknown[]) => mockDisableRunner(...args),
  enableRunner: (...args: unknown[]) => mockEnableRunner(...args),
  deleteRunner: (...args: unknown[]) => mockDeleteRunner(...args),
  updateRunnerMetadata: (...args: unknown[]) => mockUpdateRunnerMetadata(...args),
  rotateRunnerKey: (...args: unknown[]) => mockRotateRunnerKey(...args),
}));

describe('RunnerManagementPanel', () => {
  const baseRunner = {
    id: 'runner-1',
    name: 'Runner 1',
    status: 'idle' as const,
    enabled: true,
    last_seen_at: '2026-03-20T00:00:00.000Z',
    active_jobs: 0,
    region: 'us-east-1',
    version: '1.0.0',
    build_check_reason: null,
    metadata: { region: 'us-east-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRenameRunner.mockResolvedValue({ success: true });
    mockDisableRunner.mockResolvedValue({ success: true });
    mockEnableRunner.mockResolvedValue({ success: true });
    mockDeleteRunner.mockResolvedValue({ success: true });
    mockUpdateRunnerMetadata.mockResolvedValue({ success: true });
    mockRotateRunnerKey.mockResolvedValue({ success: true, key: 'bsr_new-key' });
  });

  it('disables an enabled runner from the access tab', async () => {
    const user = userEvent.setup();
    render(<RunnerManagementPanel runner={baseRunner} />);

    await user.click(screen.getByRole('tab', { name: 'Access' }));
    await user.click(await screen.findByRole('button', { name: 'Disable Runner' }));

    await waitFor(() => expect(mockDisableRunner).toHaveBeenCalledWith('runner-1'));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('enables a disabled runner from the access tab', async () => {
    const user = userEvent.setup();
    render(
      <RunnerManagementPanel
        runner={{
          ...baseRunner,
          enabled: false,
        }}
      />
    );

    await user.click(screen.getByRole('tab', { name: 'Access' }));
    await user.click(await screen.findByRole('button', { name: 'Enable Runner' }));

    await waitFor(() => expect(mockEnableRunner).toHaveBeenCalledWith('runner-1'));
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  });

  it('surfaces rotate-key controls in the API key tab', async () => {
    const user = userEvent.setup();
    render(<RunnerManagementPanel runner={baseRunner} />);

    await user.click(screen.getByRole('tab', { name: 'API Key' }));
    await user.click(await screen.findByRole('button', { name: 'Rotate API Key' }));

    expect(screen.getByRole('heading', { name: 'Rotate API Key' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rotate Key' })).toBeInTheDocument();
  });
});
