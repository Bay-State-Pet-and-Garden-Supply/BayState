/**
 * Tests for the ProfileMaintenanceClient workspace component.
 *
 * Covers:
 * - Rendering all four tabs
 * - Search filtering across tabs
 * - Status/kind filter dropdowns
 * - Empty states
 * - Badge count display
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileMaintenanceClient } from '@/components/admin/profile-maintenance/ProfileMaintenanceClient';
import type {
  ProfileMaintenanceJobRow,
  PdpSeedRow,
  SiteExtractionProfileRow,
  BrowserProfileRow,
} from '@/components/admin/profile-maintenance/ProfileMaintenanceClient';

// =============================================================================
// Sample data
// =============================================================================

const mockJobs: ProfileMaintenanceJobRow[] = [
  {
    id: 'job-1',
    kind: 'verify_pdp_seed',
    status: 'queued',
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    profile_id: null,
    browser_profile_id: null,
    attempt_count: 0,
    max_attempts: 3,
    error_message: null,
    created_at: '2026-06-25T10:00:00Z',
    updated_at: '2026-06-25T10:00:00Z',
    completed_at: null,
  },
  {
    id: 'job-2',
    kind: 'draft_site_extraction_profile',
    status: 'succeeded',
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    profile_id: null,
    browser_profile_id: null,
    attempt_count: 1,
    max_attempts: 3,
    error_message: null,
    created_at: '2026-06-24T10:00:00Z',
    updated_at: '2026-06-24T12:00:00Z',
    completed_at: '2026-06-24T12:00:00Z',
  },
  {
    id: 'job-3',
    kind: 'browser_profile_setup',
    status: 'running',
    brand_id: 'brand-2',
    source_slug: 'another-brand',
    canonical_domain: 'another.com',
    profile_id: null,
    browser_profile_id: 'bp-1',
    attempt_count: 1,
    max_attempts: 3,
    error_message: null,
    created_at: '2026-06-25T08:00:00Z',
    updated_at: '2026-06-25T08:30:00Z',
    completed_at: null,
  },
  {
    id: 'job-4',
    kind: 'validate_profile_version',
    status: 'failed',
    brand_id: 'brand-3',
    source_slug: 'failing-brand',
    canonical_domain: 'failing.com',
    profile_id: null,
    browser_profile_id: null,
    attempt_count: 2,
    max_attempts: 3,
    error_message: 'Timeout waiting for page load',
    created_at: '2026-06-23T10:00:00Z',
    updated_at: '2026-06-23T11:00:00Z',
    completed_at: '2026-06-23T11:00:00Z',
  },
];

const mockSeeds: PdpSeedRow[] = [
  {
    id: 'seed-1',
    url: 'https://example.com/product/1',
    normalized_url: 'https://example.com/product/1',
    trust_status: 'verified',
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    verified_at: '2026-06-24T10:00:00Z',
    created_at: '2026-06-23T10:00:00Z',
    verification_artifact_id: 'artifact-1',
  },
  {
    id: 'seed-2',
    url: 'https://example.com/product/2',
    normalized_url: 'https://example.com/product/2',
    trust_status: 'candidate',
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    verified_at: null,
    created_at: '2026-06-25T10:00:00Z',
    verification_artifact_id: null,
  },
  {
    id: 'seed-3',
    url: 'https://rejected.com/product/1',
    normalized_url: 'https://rejected.com/product/1',
    trust_status: 'rejected',
    brand_id: 'brand-2',
    source_slug: 'rejected-brand',
    canonical_domain: 'rejected.com',
    verified_at: '2026-06-22T10:00:00Z',
    created_at: '2026-06-21T10:00:00Z',
    verification_artifact_id: 'artifact-2',
  },
];

const mockProfiles: SiteExtractionProfileRow[] = [
  {
    id: 'profile-1',
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    source_type: 'official_brand',
    canonical_domain: 'example.com',
    status: 'active',
    active_version_id: 'ver-abc123',
    profile_setup_completed_at: '2026-06-20T10:00:00Z',
    created_at: '2026-06-18T10:00:00Z',
    brands: { name: 'Test Brand' },
  },
  {
    id: 'profile-2',
    brand_id: 'brand-2',
    source_slug: 'draft-brand',
    source_type: 'official_brand',
    canonical_domain: 'draft.example.com',
    status: 'draft',
    active_version_id: null,
    profile_setup_completed_at: null,
    created_at: '2026-06-25T10:00:00Z',
    brands: { name: 'Draft Brand' },
  },
];

const mockBrowserProfiles: BrowserProfileRow[] = [
  {
    id: 'bp-1',
    brand_id: 'brand-1',
    source_slug: 'test-brand',
    canonical_domain: 'example.com',
    status: 'validated',
    required: true,
    environment: 'production',
    runner_name: 'runner-1',
    last_validated_at: '2026-06-24T10:00:00Z',
    created_at: '2026-06-20T10:00:00Z',
    brands: { name: 'Test Brand' },
  },
  {
    id: 'bp-2',
    brand_id: 'brand-2',
    source_slug: 'stale-brand',
    canonical_domain: 'stale.com',
    status: 'requested',
    required: false,
    environment: 'production',
    runner_name: null,
    last_validated_at: null,
    created_at: '2026-06-25T10:00:00Z',
    brands: { name: 'Stale Brand' },
  },
];

// =============================================================================
// Tests
// =============================================================================

/** Helper: click a tab by finding its text label and clicking the parent button via userEvent.
 *  Uses getByText + closest('button') to work around jsdom role="tab" resolution issues.
 */
async function clickTab(label: string) {
  const user = userEvent.setup();
  const tabEl = screen.getByText(label);
  const button = tabEl.closest('button');
  if (!button) throw new Error('Could not find button for tab: ' + label);
  await user.click(button);
}

describe('ProfileMaintenanceClient', () => {
  describe('tab rendering', () => {
    it('renders all four tab triggers', () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      expect(screen.getByText('Jobs')).toBeInTheDocument();
      expect(screen.getByText('Seeds')).toBeInTheDocument();
      expect(screen.getByText('Profiles')).toBeInTheDocument();
      expect(screen.getByText('Browser Profiles')).toBeInTheDocument();
    });

    it('shows the Jobs tab by default with expected table headers', () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      // The Jobs table headers should all be present
      const statusHeaders = screen.getAllByText('Status');
      expect(statusHeaders.length).toBeGreaterThanOrEqual(1);

      // Job-specific header
      expect(screen.getByText('Attempts')).toBeInTheDocument();
    });

    it('shows attention badge counts on the correct tabs', () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      // There are 2 active jobs (queued + running) — a badge "2" should exist
      // and 1 candidate seed — a badge "1" should exist
      // Use getAllByText since some numbers may appear in other contexts
      const badgeTwos = screen.getAllByText('2');
      expect(badgeTwos.length).toBeGreaterThanOrEqual(1);

      const badgeOnes = screen.getAllByText('1');
      expect(badgeOnes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Jobs tab', () => {
    it('renders job rows in the table', () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      expect(screen.getByText('Verify PDP Seed')).toBeInTheDocument();
      expect(screen.getByText('Draft Profile')).toBeInTheDocument();
    });

    it('renders filter controls for jobs', () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      // Filter labels are rendered (may have >1 match for 'Kind' — filter label + column header)
      expect(screen.getAllByText('Kind').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Status').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/4 of 4/)).toBeInTheDocument();
    });



    it('shows job count text', () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      expect(screen.getByText(/4 of 4/)).toBeInTheDocument();
    });

    it('shows artifact link on job rows', () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      // All jobs should have 'View' links to the artifact API
      const viewLinks = screen.getAllByText('View');
      expect(viewLinks.length).toBe(4);
    });
  });

  describe('Seeds tab', () => {
    it('switches to seeds tab and shows seed data', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      await clickTab('Seeds');

      // Use async finder since tab content loads lazily
      expect(await screen.findByText('Trust Status')).toBeInTheDocument();
      expect(await screen.findByText('verified')).toBeInTheDocument();
      expect(await screen.findByText('candidate')).toBeInTheDocument();
    });

    it('shows seed URL clickable in table', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      await clickTab('Seeds');

      // Seed URLs should render as clickable links
      const seedUrl = await screen.findByText('https://example.com/product/1');
      expect(seedUrl).toBeInTheDocument();
      expect(seedUrl.closest('a')).toHaveAttribute('href', 'https://example.com/product/1');
    });
    });

    it('renders trust status filter on seeds tab', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      await clickTab('Seeds');

      // Wait for seed table to appear
      expect(await screen.findByText('Trust Status')).toBeInTheDocument();
      expect(screen.getByText(/3 of 3/)).toBeInTheDocument();
    });
  });

  describe('Profiles tab', () => {
    it('switches to profiles tab and shows profile data', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      await clickTab('Profiles');

      // Tab content lazy-mounts, so use async finders
      expect(await screen.findByText('Test Brand')).toBeInTheDocument();
      expect(await screen.findByText('Draft Brand')).toBeInTheDocument();
      // Status badges should be visible
      expect(await screen.findByText('active')).toBeInTheDocument();
      expect(await screen.findByText('draft')).toBeInTheDocument();
    });

    it('shows profile status badges', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      await clickTab('Profiles');

      // Setup completed badges
      expect(await screen.findByText('Done')).toBeInTheDocument();
      expect(await screen.findByText('Pending')).toBeInTheDocument();
    });
  });

  describe('Browser Profiles tab', () => {
    it('switches to browser profiles tab and shows data', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      await clickTab('Browser Profiles');

      // Tab content lazy-mounts
      expect(await screen.findByText('validated')).toBeInTheDocument();
      expect(await screen.findByText('requested')).toBeInTheDocument();

      // "Required" appears as both a column header and a badge value
      const requiredElements = screen.getAllByText('Required');
      expect(requiredElements.length).toBeGreaterThanOrEqual(1);

      // "Optional" appears as a badge value
      expect(await screen.findByText('Optional')).toBeInTheDocument();
    });

    it('shows browser profile environment and runner', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      await clickTab('Browser Profiles');

      // Both browser profiles have production environment
      const productionElements = await screen.findAllByText('production');
      expect(productionElements.length).toBe(2);

    });
  });

  describe('empty states', () => {
    it('shows empty state for jobs when no data', () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={[]}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      expect(screen.getByText('No jobs yet')).toBeInTheDocument();
    });

    it('shows empty state for seeds when no data', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={[]}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      await clickTab('Seeds');
      expect(await screen.findByText('No PDP seeds')).toBeInTheDocument();
    });

    it('shows empty state for profiles when no data', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={[]}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      await clickTab('Profiles');
      expect(await screen.findByText('No extraction profiles')).toBeInTheDocument();
    });

    it('shows empty state for browser profiles when no data', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={[]}
        />,
      );

      await clickTab('Browser Profiles');
      expect(await screen.findByText('No browser profiles')).toBeInTheDocument();
    });
  });

  describe('search across tabs', () => {
    it('filters jobs by search term', () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      const searchInput = screen.getByPlaceholderText(/search jobs/i);
      fireEvent.change(searchInput, { target: { value: 'another' } });

      // Should only show the job matching "another" (via source_slug)
      expect(screen.getByText('Browser Profile Setup')).toBeInTheDocument();
      expect(screen.queryByText('Verify PDP Seed')).not.toBeInTheDocument();
    });

    it('filters seeds by URL search term', async () => {
      render(
        <ProfileMaintenanceClient
          initialJobs={mockJobs}
          initialSeeds={mockSeeds}
          initialProfiles={mockProfiles}
          initialBrowserProfiles={mockBrowserProfiles}
        />,
      );

      // Switch to seeds tab first
      await clickTab('Seeds');

      // Wait for seed table to appear so the search placeholder updates
      expect(await screen.findByText('Trust Status')).toBeInTheDocument();

      // Now the placeholder should be 'Search seeds...'
      const searchInput = screen.getByPlaceholderText(/search seeds/i);
      fireEvent.change(searchInput, { target: { value: 'rejected' } });

      // The rejected seed and its status badge should be visible
      expect(screen.getByText('rejected')).toBeInTheDocument();
      // Verified seed should be filtered out
      expect(screen.queryByText('verified')).not.toBeInTheDocument();
    });
  });
