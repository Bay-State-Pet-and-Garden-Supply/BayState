/**
 * @jest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrandSourceSetupDrawer } from '@/components/admin/brands/BrandSourceSetupDrawer';
import type { Brand } from '@/lib/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the cascade editor since it has its own data fetching
jest.mock(
  '@/components/admin/brands/BrandSourceCascadeEditor',
  () => ({
    BrandSourceCascadeEditor: ({
      brandId,
      brandSlug,
      onSave,
    }: {
      brandId: string;
      brandSlug: string;
      onSave?: () => void;
    }) => (
      <div data-testid="cascade-editor">
        Cascade editor for {brandId}/{brandSlug}
        <button type="button" onClick={() => onSave?.()}>
          Trigger save
        </button>
      </div>
    ),
  }),
);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_BRAND: Brand = {
  id: 'brand-123',
  name: 'Acme Pet Foods',
  slug: 'acme-pet-foods',
  logo_url: null,
  official_domains: ['acmepetfoods.com'],
  preferred_domains: [],
};

const MOCK_SOURCE_SETUP_RESPONSE = {
  brand: {
    id: 'brand-123',
    name: 'Acme Pet Foods',
    slug: 'acme-pet-foods',
    official_domains: ['acmepetfoods.com'],
    preferred_domains: [],
  },
  sourceSetup: {
    hasOfficialDomain: true,
    siteExtractionProfile: {
      id: 'profile-1',
      brand_source_id: 'bs-1',
      source_slug: 'acme-pet-foods',
      source_type: 'official_brand',
      canonical_domain: 'acmepetfoods.com',
      status: 'draft',
      active_version_id: null,
      profile_setup_completed_at: null,
    },
    pdpSeeds: [
      {
        id: 'seed-1',
        url: 'https://acmepetfoods.com/product/123',
        normalized_url: 'https://acmepetfoods.com/product/123',
        trust_status: 'verified',
        verification_artifact_id: 'art-1',
        created_at: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'seed-2',
        url: 'https://acmepetfoods.com/product/456',
        normalized_url: 'https://acmepetfoods.com/product/456',
        trust_status: 'candidate',
        verification_artifact_id: null,
        created_at: '2026-06-02T00:00:00.000Z',
      },
    ],
    cascadeReadiness: {
      configured: true,
    },
  },
};

const MOCK_EMPTY_SETUP_RESPONSE = {
  brand: {
    id: 'brand-456',
    name: 'New Brand',
    slug: 'new-brand',
    official_domains: [],
    preferred_domains: [],
  },
  sourceSetup: {
    hasOfficialDomain: false,
    siteExtractionProfile: {
      id: null,
      brand_source_id: null,
      source_slug: 'new-brand',
      source_type: 'official_brand',
      canonical_domain: null,
      status: null,
      active_version_id: null,
      profile_setup_completed_at: null,
    },
    pdpSeeds: [],
    cascadeReadiness: {
      configured: false,
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderDrawer(
  brand: Brand = MOCK_BRAND,
  open = true,
  onSetupComplete?: () => void,
  onClose?: () => void,
) {
  const closeFn = onClose ?? jest.fn();
  const completeFn = onSetupComplete ?? jest.fn();

  return {
    closeFn,
    completeFn,
    ...render(
      <BrandSourceSetupDrawer
        brand={brand}
        brandGroupId="group-1"
        open={open}
        onClose={closeFn}
        onSetupComplete={completeFn}
      />,
    ),
  };
}

async function waitForLoadingComplete() {
  await waitFor(() => {
    expect(
      screen.queryByText('Loading source setup...'),
    ).not.toBeInTheDocument();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BrandSourceSetupDrawer', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ---- Open & Data Loading ----

  it('shows loading state while fetching source setup', async () => {
    // Never resolve the fetch so loading persists
    fetchMock.mockReturnValue(new Promise(() => {}));

    renderDrawer();

    expect(screen.getByText('Loading source setup...')).toBeInTheDocument();
  });

  it('loads source-setup on open and renders step 1', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/brands/brand-123/source-setup',
    );
    expect(screen.getByText('Brand Setup: Acme Pet Foods')).toBeInTheDocument();
    // Step 1 content should be visible
    expect(
      screen.getByText((content) =>
        content.includes('official brand domain'),
      ),
    ).toBeInTheDocument();
  });

  it('renders title and description in sheet header', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    expect(screen.getByText('Brand Setup: Acme Pet Foods')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Configure brand sources, add product seeds, and review profile status.',
      ),
    ).toBeInTheDocument();
  });

  it('shows retry button when fetch fails', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    renderDrawer();

    await waitFor(() => {
      expect(
        screen.getByText('Failed to load source setup data.'),
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    renderDrawer(MOCK_BRAND, false);

    expect(
      screen.queryByText('Brand Setup: Acme Pet Foods'),
    ).not.toBeInTheDocument();
  });

  // ---- Step Navigation ----

  it('shows step indicator with correct steps', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_EMPTY_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    expect(screen.getByText('Domain')).toBeInTheDocument();
    expect(screen.getByText('PDP Seeds')).toBeInTheDocument();
    expect(screen.getByText('Profile Status')).toBeInTheDocument();
  });

  it('navigates to step 2 on Next click', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    // Click Next to go to PDP Seeds step
    fireEvent.click(screen.getByText('Next'));

    expect(
      screen.getByText('Add Product Detail Page URL'),
    ).toBeInTheDocument();
  });

  it('navigates to step 3 on second Next click', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    // Step 1 → Step 2
    fireEvent.click(screen.getByText('Next'));
    // Step 2 → Step 3
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Domain configured')).toBeInTheDocument();
    expect(screen.getByText('Source cascade configured')).toBeInTheDocument();
  });

  it('Back button returns to previous step', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    // Go to step 2
    fireEvent.click(screen.getByText('Next'));
    expect(
      screen.getByText('Add Product Detail Page URL'),
    ).toBeInTheDocument();

    // Go back to step 1
    fireEvent.click(screen.getByText('Back'));
    expect(
      screen.getByText((content) =>
        content.includes('official brand domain'),
      ),
    ).toBeInTheDocument();
  });

  it('Back button is disabled on step 1', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    expect(screen.getByText('Back')).toBeDisabled();
  });

  it('Done button triggers onSetupComplete and onClose on step 3', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    const onSetupComplete = jest.fn();
    const onClose = jest.fn();

    renderDrawer(MOCK_BRAND, true, onSetupComplete, onClose);

    await waitForLoadingComplete();

    // Navigate to step 3
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));

    // Click Done
    fireEvent.click(screen.getByText('Done'));

    expect(onSetupComplete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ---- Domain Step (Step 1) ----

  it('shows saved domain state when hasOfficialDomain is true', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    expect(screen.getByText('Domain saved')).toBeInTheDocument();
    expect(
      screen.getByText('acmepetfoods.com'),
    ).toBeInTheDocument();
  });

  it('shows domain input when no official domain saved', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_EMPTY_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    expect(
      screen.getByText('Official Brand Domain'),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('example.com'),
    ).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('saves domain via PUT endpoint', async () => {
    // First fetch (on mount) returns empty state
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_EMPTY_SETUP_RESPONSE),
    });

    // PUT mock (consumed by the PUT call)
    const putMock = fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    // Re-fetch after save returns updated state
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        ...MOCK_EMPTY_SETUP_RESPONSE,
        sourceSetup: {
          ...MOCK_EMPTY_SETUP_RESPONSE.sourceSetup,
          hasOfficialDomain: true,
          siteExtractionProfile: {
            ...MOCK_EMPTY_SETUP_RESPONSE.sourceSetup.siteExtractionProfile,
            canonical_domain: 'newbrand.com',
            status: 'draft',
          },
        },
      }),
    });

    renderDrawer(MOCK_BRAND);

    await waitForLoadingComplete();

    const input = screen.getByPlaceholderText('example.com');
    fireEvent.change(input, { target: { value: 'newbrand.com' } });
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(putMock).toHaveBeenCalledWith(
        '/api/admin/brands/brand-123/source-setup',
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('newbrand.com'),
        }),
      );
    });

    // Domain saved confirmation should appear after re-fetch
    await waitFor(() => {
      expect(screen.getByText('Domain saved')).toBeInTheDocument();
    });
  });

  // ---- PDP Seeds Step (Step 2) ----

  it('shows PDP seeds list on step 2', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    // Navigate to step 2
    fireEvent.click(screen.getByText('Next'));

    // Should show the add form
    expect(
      screen.getByText('Add Product Detail Page URL'),
    ).toBeInTheDocument();

    // Should show seed summary
    expect(screen.getByText('1 verified')).toBeInTheDocument();
    expect(screen.getByText('1 candidate')).toBeInTheDocument();
  });

  it('shows empty state when no PDP seeds exist', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        ...MOCK_SOURCE_SETUP_RESPONSE,
        sourceSetup: {
          ...MOCK_SOURCE_SETUP_RESPONSE.sourceSetup,
          pdpSeeds: [],
        },
      }),
    });

    renderDrawer();

    await waitForLoadingComplete();

    // Navigate to step 2
    fireEvent.click(screen.getByText('Next'));

    expect(
      screen.getByText('No PDP seeds yet. Add a product URL above to begin.'),
    ).toBeInTheDocument();
  });

  // ---- Profile Status Step (Step 3) ----

  it('shows profile status summary on step 3', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    // Navigate to step 3
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));

    expect(screen.getByText('Domain configured')).toBeInTheDocument();
    expect(screen.getByText('Source cascade configured')).toBeInTheDocument();
    expect(
      screen.getByText('PDP Seeds: 1 verified, 1 pending, 0 rejected'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Profile status:/),
    ).toBeInTheDocument();
  });

  it('shows cascade editor toggle on step 3', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    // Navigate to step 3
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));

    // Click "Configure cascade" to toggle cascade editor
    fireEvent.click(screen.getByText('Configure cascade'));

    expect(screen.getByTestId('cascade-editor')).toBeInTheDocument();
  });

  it('shows appropriate what-next guidance', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(MOCK_SOURCE_SETUP_RESPONSE),
    });

    renderDrawer();

    await waitForLoadingComplete();

    // Navigate to step 3
    fireEvent.click(screen.getByText('Next'));
    fireEvent.click(screen.getByText('Next'));

    expect(
      screen.getByText((content) =>
        content.includes('Validate') && content.includes('Approve'),
      ),
    ).toBeInTheDocument();
  });
});
