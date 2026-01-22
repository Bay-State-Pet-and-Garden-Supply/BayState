import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfigEditorClient } from '@/components/admin/scraper-configs/ConfigEditorClient';
import { useRouter } from 'next/navigation';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/admin/scraper-configs/actions', () => ({
  createScraperConfig: jest.fn(),
  updateDraft: jest.fn(),
  validateDraft: jest.fn(),
  publishConfig: jest.fn(),
}));

import { toast } from 'sonner';
import { createScraperConfig, updateDraft, validateDraft, publishConfig } from '@/lib/admin/scraper-configs/actions';

const mockRouterPush = jest.fn();
const mockRouterRefresh = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (useRouter as jest.Mock).mockReturnValue({
    push: mockRouterPush,
    refresh: mockRouterRefresh,
  });
});

describe('ConfigEditorClient', () => {
  describe('Create Mode', () => {
    it('renders in create mode with correct title', () => {
      render(<ConfigEditorClient mode="create" />);

      expect(screen.getByText('New Scraper Config')).toBeInTheDocument();
    });

    it('shows validation errors when required fields are empty', async () => {
      render(<ConfigEditorClient mode="create" />);

      // Click validate button
      const validateButton = screen.getByRole('button', { name: /validate/i });
      fireEvent.click(validateButton);

      // Wait for validation to run
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          'Configuration has validation errors'
        );
      });
    });

    it('creates draft successfully with valid data', async () => {
      (createScraperConfig as jest.Mock).mockResolvedValue({
        success: true,
        data: { id: 'test-id-123' },
      });

      render(<ConfigEditorClient mode="create" />);

      // Fill in required fields
      const nameInput = screen.getByPlaceholderText('e.g., amazon-product-scraper');
      fireEvent.change(nameInput, { target: { value: 'test-scraper' } });

      const baseUrlInput = screen.getByPlaceholderText('https://example.com');
      fireEvent.change(baseUrlInput, { target: { value: 'https://example.com' } });

      // Click save button
      const saveButton = screen.getByRole('button', { name: /save draft/i });
      fireEvent.click(saveButton);

      // Wait for save to complete
      await waitFor(() => {
        expect(createScraperConfig).toHaveBeenCalledWith(
          expect.objectContaining({
            has: expect.any(Function),
          })
        );
        expect(toast.success).toHaveBeenCalledWith('Config created successfully');
        expect(mockRouterPush).toHaveBeenCalledWith('/admin/scraper-configs/test-id-123/edit');
      });
    });

    it('shows error when create fails', async () => {
      (createScraperConfig as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Slug already exists',
      });

      render(<ConfigEditorClient mode="create" />);

      // Fill in required fields
      const nameInput = screen.getByPlaceholderText('e.g., amazon-product-scraper');
      fireEvent.change(nameInput, { target: { value: 'existing-scraper' } });

      const baseUrlInput = screen.getByPlaceholderText('https://example.com');
      fireEvent.change(baseUrlInput, { target: { value: 'https://example.com' } });

      // Click save button
      const saveButton = screen.getByRole('button', { name: /save draft/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Slug already exists');
      });
    });
  });

  describe('Edit Mode', () => {
    const mockInitialData = {
      schema_version: '1.0' as const,
      name: 'test-scraper',
      display_name: 'Test Scraper',
      base_url: 'https://example.com',
      selectors: [],
      workflows: [],
      timeout: 30,
      retries: 3,
      image_quality: 50,
      anti_detection: {
        enable_captcha_detection: false,
        enable_rate_limiting: false,
        enable_human_simulation: false,
        enable_session_rotation: false,
        enable_blocking_handling: false,
        rate_limit_min_delay: 1.0,
        rate_limit_max_delay: 3.0,
        session_rotation_interval: 100,
        max_retries_on_detection: 3,
      },
      http_status: {
        enabled: false,
        fail_on_error_status: true,
        error_status_codes: [400, 401, 403, 404, 500, 502, 503, 504],
        warning_status_codes: [301, 302, 307, 308],
      },
      validation: {
        no_results_selectors: [],
        no_results_text_patterns: [],
      },
      test_skus: [],
      fake_skus: [],
    };

    it('renders in edit mode with initial data', () => {
      render(
        <ConfigEditorClient
          configId="test-id"
          initialData={mockInitialData}
          mode="edit"
        />
      );

      expect(screen.getByText('Test Scraper')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., amazon-product-scraper')).toHaveValue('test-scraper');
      expect(screen.getByPlaceholderText('https://example.com')).toHaveValue('https://example.com');
    });

    it('shows validation status badge', () => {
      render(
        <ConfigEditorClient
          configId="test-id"
          initialData={mockInitialData}
          mode="edit"
        />
      );

      // Should show "Not Validated" badge for edit mode
      expect(screen.getByText('Not Validated')).toBeInTheDocument();
    });

    it('validates draft successfully', async () => {
      (validateDraft as jest.Mock).mockResolvedValue({
        success: true,
        data: { valid: true, errors: [] },
      });

      render(
        <ConfigEditorClient
          configId="test-id"
          initialData={mockInitialData}
          mode="edit"
        />
      );

      // Click validate button
      const validateButton = screen.getByRole('button', { name: /validate/i });
      fireEvent.click(validateButton);

      await waitFor(() => {
        expect(validateDraft).toHaveBeenCalledWith('test-id');
        expect(toast.success).toHaveBeenCalledWith('Draft validated successfully');
      });
    });

    it('shows error when validation fails', async () => {
      (validateDraft as jest.Mock).mockResolvedValue({
        success: false,
        error: 'Invalid configuration',
      });

      render(
        <ConfigEditorClient
          configId="test-id"
          initialData={mockInitialData}
          mode="edit"
        />
      );

      // Click validate button
      const validateButton = screen.getByRole('button', { name: /validate/i });
      fireEvent.click(validateButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Invalid configuration');
      });
    });

    it('updates draft successfully', async () => {
      (updateDraft as jest.Mock).mockResolvedValue({ success: true });

      render(
        <ConfigEditorClient
          configId="test-id"
          initialData={mockInitialData}
          mode="edit"
        />
      );

      // Make a change
      const displayNameInput = screen.getByDisplayValue('Test Scraper');
      fireEvent.change(displayNameInput, { target: { value: 'Updated Scraper' } });

      // Click save button
      const saveButton = screen.getByRole('button', { name: /save draft/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(updateDraft).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith('Draft saved successfully');
        expect(mockRouterRefresh).toHaveBeenCalled();
      });
    });

    it('publishes when validated', async () => {
      (validateDraft as jest.Mock).mockResolvedValue({
        success: true,
        data: { valid: true, errors: [] },
      });
      (publishConfig as jest.Mock).mockResolvedValue({ success: true });

      render(
        <ConfigEditorClient
          configId="test-id"
          initialData={mockInitialData}
          mode="edit"
        />
      );

      // Validate first
      const validateButton = screen.getByRole('button', { name: /validate/i });
      fireEvent.click(validateButton);

      // Wait for validation to complete and status to update
      await waitFor(() => {
        expect(validateDraft).toHaveBeenCalledWith('test-id');
      });

      // Need to wait for state to update before clicking publish
      await waitFor(() => {
        // Check if publish button is enabled
        const publishButton = screen.getByRole('button', { name: /publish/i });
        expect(publishButton).not.toBeDisabled();
        fireEvent.click(publishButton);
      });

      await waitFor(() => {
        expect(publishConfig).toHaveBeenCalled();
        expect(toast.success).toHaveBeenCalledWith('Configuration published successfully');
        expect(mockRouterPush).toHaveBeenCalledWith('/admin/scraper-configs');
      });
    });

    it('does not allow publish without validation', () => {
      render(
        <ConfigEditorClient
          configId="test-id"
          initialData={mockInitialData}
          mode="edit"
        />
      );

      // Publish button should be disabled
      const publishButton = screen.getByRole('button', { name: /publish/i });
      expect(publishButton).toBeDisabled();
    });
  });

  describe('JSON Preview', () => {
    it('toggles JSON preview visibility', async () => {
      render(<ConfigEditorClient mode="create" />);

      // Click show JSON button
      const showJsonButton = screen.getByRole('button', { name: /show json/i });
      fireEvent.click(showJsonButton);

      // JSON preview should be visible
      await waitFor(() => {
        expect(screen.getByText('JSON Preview')).toBeInTheDocument();
        expect(screen.getByText(/"schema_version": "1\.0"/)).toBeInTheDocument();
      });

      // Click hide JSON button
      const hideJsonButton = screen.getByRole('button', { name: /hide json/i });
      fireEvent.click(hideJsonButton);

      // JSON preview should be hidden
      await waitFor(() => {
        expect(screen.queryByText('JSON Preview')).not.toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('renders all tabs', () => {
      render(<ConfigEditorClient mode="create" />);

      // Check that all tabs are rendered
      expect(screen.getByRole('tab', { name: /metadata/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /selectors/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /workflow/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /advanced/i })).toBeInTheDocument();
    });

    it('shows metadata tab content by default', () => {
      render(<ConfigEditorClient mode="create" />);

      // Initially on metadata tab
      expect(screen.getByText('General Information')).toBeInTheDocument();
    });
  });
});
