/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CohortBrandPicker } from '@/components/admin/cohorts/CohortBrandPicker';

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}));

jest.mock('@/components/admin/brands/BrandModal', () => ({
  BrandModal: ({
    initialName,
    onClose,
    onSave,
  }: {
    initialName?: string;
    onClose: () => void;
    onSave: (brand?: {
      id: string;
      name: string;
      slug: string;
      logo_url: null;
      description: null;
      website_url: null;
      official_domains: string[];
      preferred_domains: string[];
      created_at: string;
    }) => void;
  }) => (
    <div>
      <p>Brand modal for {initialName}</p>
      <button
        type="button"
        onClick={() => onSave({
          id: 'brand-new',
          name: initialName ?? 'New Brand',
          slug: (initialName ?? 'new-brand').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
          logo_url: null,
          description: null,
          website_url: null,
          official_domains: [],
          preferred_domains: [],
          created_at: '2026-04-21T00:00:00.000Z',
        })}
      >
        Confirm create brand
      </button>
      <button type="button" onClick={onClose}>Cancel</button>
    </div>
  ),
}));

describe('CohortBrandPicker', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ brands: [] }),
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('creates and assigns a new brand from the picker search state', async () => {
    const onAssign = jest.fn().mockResolvedValue(undefined);

    render(
      <CohortBrandPicker
        value={null}
        onAssign={onAssign}
      />
    );

    fireEvent.click(screen.getByText('Assign Brand').closest('button') as HTMLButtonElement);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/brands');
    });

    fireEvent.change(screen.getByPlaceholderText('Search brands...'), {
      target: { value: 'Acme Garden' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create brand/i }));

    expect(screen.getByText('Brand modal for Acme Garden')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm create brand' }));

    await waitFor(() => {
      expect(onAssign).toHaveBeenCalledWith(expect.objectContaining({
        id: 'brand-new',
        name: 'Acme Garden',
        slug: 'acme-garden',
      }));
    });
  });
});
