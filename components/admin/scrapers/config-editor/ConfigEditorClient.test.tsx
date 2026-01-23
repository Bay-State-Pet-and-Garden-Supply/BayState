import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigEditorClient } from './ConfigEditorClient';
import { ScraperConfig } from '@/lib/admin/scrapers/types';

// Mock server actions
jest.mock('@/lib/admin/scraper-configs/actions', () => ({
  updateDraft: jest.fn(),
  validateDraft: jest.fn(),
  publishConfig: jest.fn(),
}));

// Mock useRouter
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: jest.fn(),
    push: jest.fn(),
  }),
}));

const mockConfig: ScraperConfig = {
  schema_version: '1.0',
  name: 'test-scraper',
  base_url: 'https://example.com',
  selectors: [],
  workflows: [],
  retries: 3,
  timeout: 30,
  image_quality: 50,
  test_skus: [],
  fake_skus: [],
};

describe('ConfigEditorClient', () => {
  it('renders the editor with basic tabs', () => {
    render(
      <ConfigEditorClient
        configId="123"
        initialConfig={mockConfig}
        initialStatus="draft"
        initialVersion={1}
      />
    );

    expect(screen.getByText('Config Editor')).toBeInTheDocument();
    expect(screen.getByText('Metadata')).toBeInTheDocument();
    expect(screen.getByText('Selectors')).toBeInTheDocument();
    expect(screen.getByText('Workflow')).toBeInTheDocument();
  });

  it('allows switching tabs', async () => {
    const user = userEvent.setup();
    render(
      <ConfigEditorClient
        configId="123"
        initialConfig={mockConfig}
        initialStatus="draft"
        initialVersion={1}
      />
    );

    // Initial tab is Metadata
    expect(screen.getByLabelText('Internal Name (Slug)')).toBeInTheDocument();

    // Switch to Selectors
    const selectorsTab = screen.getByRole('tab', { name: /Selectors/i });
    await user.click(selectorsTab);
    
    // Wait for content to appear
    await waitFor(() => {
      expect(screen.getByText('Data Selectors')).toBeInTheDocument();
    });
  });

  it('shows save draft button', () => {
    render(
      <ConfigEditorClient
        configId="123"
        initialConfig={mockConfig}
        initialStatus="draft"
        initialVersion={1}
      />
    );

    expect(screen.getByText('Save Draft')).toBeInTheDocument();
  });
});
