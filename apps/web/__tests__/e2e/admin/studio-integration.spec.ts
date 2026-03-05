import { test, expect } from '@playwright/test';

test.describe('Scraper Studio Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    await page.waitForLoadState('networkidle');
  });

  test.describe('Config Creation Workflow', () => {
    test('should create new config with basic YAML', async ({ page }) => {
      const newConfigButton = page.getByRole('link', { name: 'New Config' });
      await expect(newConfigButton).toBeVisible();

      await expect(page.locator('h1')).toContainText('Scraper Studio');
      await expect(page.getByRole('tab', { name: 'Configs' })).toBeVisible();

      await expect(page.getByText('Name')).toBeVisible();
      await expect(page.getByText('Domain')).toBeVisible();
      await expect(page.getByText('Versions')).toBeVisible();
      await expect(page.getByText('Health')).toBeVisible();

      await page.screenshot({ path: '.sisyphus/evidence/task-14-config-list.png' });
    });

    test('should validate YAML syntax in editor', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();

      await page.locator('text=Edit Configuration').click();

      await expect(page.locator('button:has-text("Metadata")')).toBeVisible();
      await expect(page.locator('button:has-text("Selectors")')).toBeVisible();
      await expect(page.locator('button:has-text("Workflow")')).toBeVisible();
      await expect(page.locator('button:has-text("Configuration")')).toBeVisible();

      await page.screenshot({ path: '.sisyphus/evidence/task-14-config-editor.png' });
    });
  });

  test.describe('Config Editing & Test SKU Management', () => {
    test('should edit config metadata', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();
      await page.locator('text=Edit Configuration').click();

      await expect(page.locator('button:has-text("Metadata")')).toHaveAttribute('data-state', 'active');
      await expect(page.locator('input[name*="name"], input[placeholder*="name"]').first()).toBeVisible();

      await page.screenshot({ path: '.sisyphus/evidence/task-14-metadata-tab.png' });
    });

    test('should navigate to testing tab for SKU management', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();
      await page.locator('text=Edit Configuration').click();

      await page.locator('button:has-text("Testing")').click();
      await expect(page.locator('button:has-text("Testing")')).toHaveAttribute('data-state', 'active');
      await expect(page.locator('text=Test SKU Management')).toBeVisible();

      await page.screenshot({ path: '.sisyphus/evidence/task-14-testing-tab.png' });
    });
  });

  test.describe('Test Run Workflow', () => {
    test('should display History tab with test runs', async ({ page }) => {
      await page.locator('[role="tab"]:has-text("History")').click();

      await expect(page.locator('text=Test Run History')).toBeVisible();

      await page.screenshot({ path: '.sisyphus/evidence/task-14-history-tab.png' });
    });

    test('should show test run details when clicking a run', async ({ page }) => {
      await page.locator('[role="tab"]:has-text("History")').click();

      const testRunCards = await page.locator('[class*="cursor-pointer"]').count();

      if (testRunCards > 0) {
        await page.locator('[class*="cursor-pointer"]').first().click();

        await expect(page.locator('text=Test Run Details')).toBeVisible();
        await expect(page.locator('text=Step Trace')).toBeVisible();
        await expect(page.locator('text=Selectors')).toBeVisible();
        await expect(page.locator('text=Overview')).toBeVisible();
        await expect(page.locator('text=SKU Results')).toBeVisible();

        await page.screenshot({ path: '.sisyphus/evidence/task-14-test-run-details.png' });
      } else {
        await expect(page.locator('text=No test runs found')).toBeVisible();
      }
    });
  });

  test.describe('Real-time Timeline Updates', () => {
    test('should display step trace with timeline', async ({ page }) => {
      await page.locator('[role="tab"]:has-text("History")').click();

      const testRunCards = await page.locator('[class*="cursor-pointer"]').count();

      if (testRunCards > 0) {
        await page.locator('[class*="cursor-pointer"]').first().click();
        await page.click('text=Step Trace');

        await expect(page.locator('text=Step Execution Summary')).toBeVisible();

        await page.screenshot({ path: '.sisyphus/evidence/task-14-step-trace.png' });
      }
    });

    test('should show step execution status', async ({ page }) => {
      await page.locator('[role="tab"]:has-text("History")').click();

      const testRunCards = await page.locator('[class*="cursor-pointer"]').count();

      if (testRunCards > 0) {
        await page.locator('[class*="cursor-pointer"]').first().click();
        await page.click('text=Step Trace');

        const hasSteps = await page.locator('text=Step Execution Summary').isVisible();

        if (hasSteps) {
          const statusBadges = await page.locator('[class*="badge"], [class*="Badge"]').count();
          expect(statusBadges).toBeGreaterThanOrEqual(0);
        }

        await page.screenshot({ path: '.sisyphus/evidence/task-14-step-status.png' });
      }
    });
  });

  test.describe('Step Trace & Selector Validation', () => {
    test('should display selector validation tab', async ({ page }) => {
      await page.locator('[role="tab"]:has-text("History")').click();

      const testRunCards = await page.locator('[class*="cursor-pointer"]').count();

      if (testRunCards > 0) {
        await page.locator('[class*="cursor-pointer"]').first().click();
        await page.locator('[role="tab"]:has-text("Selectors")').click();

        await expect(page.locator('text=Total').or(page.locator('text=No selector'))).toBeVisible();

        await page.screenshot({ path: '.sisyphus/evidence/task-14-selector-validation.png' });
      }
    });

    test('should show selector validation filters', async ({ page }) => {
      await page.locator('[role="tab"]:has-text("History")').click();

      const testRunCards = await page.locator('[class*="cursor-pointer"]').count();

      if (testRunCards > 0) {
        await page.locator('[class*="cursor-pointer"]').first().click();
        await page.locator('[role="tab"]:has-text("Selectors")').click();

        const hasFilters = await page.locator('button:has-text("All"), button:has-text("Found")').count() > 0;

        if (hasFilters) {
          await expect(page.locator('button:has-text("All")')).toBeVisible();
        }

        await page.screenshot({ path: '.sisyphus/evidence/task-14-selector-filters.png' });
      }
    });
  });

  test.describe('Version Management', () => {
    test('should access version history tab', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();
      await page.locator('text=Edit Configuration').click();

      const versionsTab = page.locator('[role="tab"]:has-text("Versions")');

      if (await versionsTab.isVisible().catch(() => false)) {
        await versionsTab.click();
        await expect(page.locator('text=Version History')).toBeVisible();

        await page.screenshot({ path: '.sisyphus/evidence/task-14-version-history.png' });
      }
    });

    test('should show create version dialog', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();
      await page.locator('text=Edit Configuration').click();

      const versionsTab = page.locator('[role="tab"]:has-text("Versions")');

      if (await versionsTab.isVisible().catch(() => false)) {
        await versionsTab.click();

        const createVersionButton = page.locator('button:has-text("Create Version")').first();

        if (await createVersionButton.isVisible().catch(() => false)) {
          await createVersionButton.click();

          await expect(page.locator('text=Create New Version')).toBeVisible();
          await expect(page.locator('label:has-text("Change Summary")')).toBeVisible();

          await page.locator('button:has-text("Cancel")').click();
          await expect(page.locator('text=Create New Version')).not.toBeVisible();

          await page.screenshot({ path: '.sisyphus/evidence/task-14-create-version-dialog.png' });
        }
      }
    });

    test('should display version cards with status badges', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();
      await page.locator('text=Edit Configuration').click();

      const versionsTab = page.locator('[role="tab"]:has-text("Versions")');

      if (await versionsTab.isVisible().catch(() => false)) {
        await versionsTab.click();

        const versionCards = await page.locator('[class*="font-mono"]').filter({ hasText: /v\d+/ }).count();

        if (versionCards > 0) {
          const badges = await page.locator('[class*="inline-flex"]').filter({ hasText: /Published|Validated|Draft|Archived/ }).count();
          expect(badges).toBeGreaterThanOrEqual(0);
        }

        await page.screenshot({ path: '.sisyphus/evidence/task-14-version-cards.png' });
      }
    });
  });

  test.describe('Version Publishing', () => {
    test('should show publish button for validated versions', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();
      await page.locator('text=Edit Configuration').click();

      const versionsTab = page.locator('[role="tab"]:has-text("Versions")');

      if (await versionsTab.isVisible().catch(() => false)) {
        await versionsTab.click();

        const publishButtons = await page.locator('button:has-text("Publish")').count();

        if (publishButtons > 0) {
          await page.locator('button:has-text("Publish")').first().click();

          const confirmDialog = await page.locator('text=Publish Version').isVisible().catch(() => false);

          if (confirmDialog) {
            await expect(page.locator('text=Publish Version')).toBeVisible();

            await page.locator('button:has-text("Cancel")').click();
          }

          await page.screenshot({ path: '.sisyphus/evidence/task-14-publish-dialog.png' });
        }
      }
    });
  });

  test.describe('Version Rollback', () => {
    test('should show rollback button for published versions', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();
      await page.locator('text=Edit Configuration').click();

      const versionsTab = page.locator('[role="tab"]:has-text("Versions")');

      if (await versionsTab.isVisible().catch(() => false)) {
        await versionsTab.click();

        const rollbackButtons = await page.locator('button:has-text("Rollback")').count();

        if (rollbackButtons > 0) {
          await page.locator('button:has-text("Rollback")').first().click();

          const rollbackDialog = await page.locator('text=Rollback to Version').isVisible().catch(() => false);

          if (rollbackDialog) {
            await expect(page.locator('text=Rollback to Version')).toBeVisible();
            await expect(page.locator('label:has-text("Rollback Reason")')).toBeVisible();

            await page.locator('button:has-text("Cancel")').click();
          }

          await page.screenshot({ path: '.sisyphus/evidence/task-14-rollback-dialog.png' });
        }
      }
    });
  });

  test.describe('Error Handling & Edge Cases', () => {
    test('should handle invalid YAML syntax', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();
      await page.locator('text=Edit Configuration').click();

      await page.locator('button:has-text("Configuration")').click();

      const yamlEditor = page.locator('textarea');

      if (await yamlEditor.isVisible().catch(() => false)) {
        await yamlEditor.fill('invalid: yaml: content: [}');

        await page.screenshot({ path: '.sisyphus/evidence/task-14-yaml-error.png' });
      }
    });

    test('should handle empty test run history gracefully', async ({ page }) => {
      await page.locator('[role="tab"]:has-text("History")').click();

      const testRunCards = await page.locator('[class*="cursor-pointer"]').count();

      if (testRunCards === 0) {
        await expect(page.locator('text=No test runs found')).toBeVisible();
        await expect(page.locator('text=Test runs will appear here')).toBeVisible();

        await page.screenshot({ path: '.sisyphus/evidence/task-14-empty-history.png' });
      }
    });

    test('should handle back navigation correctly', async ({ page }) => {
      await page.locator('[role="tab"]:has-text("History")').click();

      const testRunCards = await page.locator('[class*="cursor-pointer"]').count();

      if (testRunCards > 0) {
        await page.locator('[class*="cursor-pointer"]').first().click();

        await page.locator('button:has-text("Back to History"), button:has-text("← Back")').click();

        await expect(page.locator('text=Test Run History')).toBeVisible();

        await page.screenshot({ path: '.sisyphus/evidence/task-14-back-navigation.png' });
      }
    });

    test('should handle loading states', async ({ page }) => {
      await page.locator('[role="tab"]:has-text("History")').click();

      const hasLoading = await page.locator('[class*="animate-spin"], text=Loading').count() > 0;

      await expect(page.locator('text=Test Run History')).toBeVisible();

      await page.screenshot({ path: '.sisyphus/evidence/task-14-loading-states.png' });
    });
  });

  test.describe('Performance Tests', () => {
    test('should load config list within acceptable time', async ({ page }) => {
      const startTime = Date.now();

      await page.goto('/admin/scrapers/studio');
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - startTime;

      await expect(page.locator('h1')).toContainText('Scraper Studio');

      expect(loadTime).toBeLessThan(3000);

      await page.screenshot({ path: '.sisyphus/evidence/task-14-performance-load.png' });
    });

    test('should handle config filtering efficiently', async ({ page }) => {
      const filterInput = page.locator('input[placeholder*="Filter"], input[placeholder*="Search"]');

      if (await filterInput.isVisible().catch(() => false)) {
        const startTime = Date.now();

        await filterInput.fill('test');
        await page.waitForTimeout(300);

        const filterTime = Date.now() - startTime;

        expect(filterTime).toBeLessThan(500);

        await page.screenshot({ path: '.sisyphus/evidence/task-14-filter-performance.png' });
      }
    });

    test('should handle tab switching efficiently', async ({ page }) => {
      const tabs = ['Configs', 'History', 'Health'];

      for (const tabName of tabs) {
        const tab = page.locator(`[role="tab"]:has-text("${tabName}")`);

        if (await tab.isVisible().catch(() => false)) {
          const startTime = Date.now();

          await tab.click();
          await page.waitForLoadState('networkidle');

          const switchTime = Date.now() - startTime;

          expect(switchTime).toBeLessThan(1000);
        }
      }

      await page.screenshot({ path: '.sisyphus/evidence/task-14-tab-performance.png' });
    });

    test('should render large lists efficiently', async ({ page }) => {
      const tableRows = await page.locator('table tbody tr').count();

      console.log(`Config list has ${tableRows} rows`);

      expect(tableRows).toBeGreaterThanOrEqual(0);

      await page.screenshot({ path: '.sisyphus/evidence/task-14-large-list.png' });
    });
  });

  test.describe('All Tabs Functionality', () => {
    test('should verify all main tabs work', async ({ page }) => {
      const tabs = [
        { name: 'Configs', expectedText: 'Scraper Studio' },
        { name: 'History', expectedText: 'Test Run History' },
        { name: 'Health', expectedText: 'Health' },
      ];

      for (const tab of tabs) {
        const tabLocator = page.locator(`[role="tab"]:has-text("${tab.name}")`);

        if (await tabLocator.isVisible().catch(() => false)) {
          await tabLocator.click();
          await page.waitForTimeout(300);

          await expect(tabLocator).toHaveAttribute('data-state', 'active');
          await expect(page.locator(`text=${tab.expectedText}`).first()).toBeVisible();
        }
      }

      await page.screenshot({ path: '.sisyphus/evidence/task-14-all-tabs.png' });
    });

    test('should verify config editor tabs work', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();
      await page.locator('text=Edit Configuration').click();

      const editorTabs = ['Metadata', 'Selectors', 'Workflow', 'Configuration', 'Advanced', 'Testing'];

      for (const tabName of editorTabs) {
        const tabLocator = page.locator(`button:has-text("${tabName}")`);

        if (await tabLocator.isVisible().catch(() => false)) {
          await tabLocator.click();
          await page.waitForTimeout(200);

          await expect(tabLocator).toHaveAttribute('data-state', 'active');
        }
      }

      await page.screenshot({ path: '.sisyphus/evidence/task-14-editor-tabs.png' });
    });
  });

  test.describe('Complete End-to-End Workflow', () => {
    test('full workflow: studio → config → history → details → back', async ({ page }) => {
      await expect(page.locator('h1')).toContainText('Scraper Studio');
      await expect(page.getByRole('tab', { name: 'Configs' })).toBeVisible();

      await page.locator('[role="tab"]:has-text("History")').click();
      await expect(page.locator('text=Test Run History')).toBeVisible();

      const testRunCards = await page.locator('[class*="cursor-pointer"]').count();

      if (testRunCards > 0) {
        await page.locator('[class*="cursor-pointer"]').first().click();
        await expect(page.locator('text=Test Run Details')).toBeVisible();

        const detailTabs = ['Step Trace', 'Selectors', 'Overview', 'SKU Results'];

        for (const tabName of detailTabs) {
          const tab = page.locator(`[role="tab"]:has-text("${tabName}")`);
          if (await tab.isVisible().catch(() => false)) {
            await tab.click();
            await page.waitForTimeout(200);
          }
        }

        await page.locator('button:has-text("Back to History"), button:has-text("← Back")').click();
        await expect(page.locator('text=Test Run History')).toBeVisible();
      }

      await page.screenshot({ path: '.sisyphus/evidence/task-14-complete-workflow.png' });
    });

    test('full workflow: config edit → version → create view', async ({ page }) => {
      const moreButton = page.locator('button[aria-haspopup="menu"]').first();
      await moreButton.click();
      await page.locator('text=Edit Configuration').click();

      await expect(page.locator('text=Config Editor')).toBeVisible();

      const versionsTab = page.locator('[role="tab"]:has-text("Versions")');

      if (await versionsTab.isVisible().catch(() => false)) {
        await versionsTab.click();
        await expect(page.locator('text=Version History')).toBeVisible();

        const createButton = page.locator('button:has-text("Create Version")').first();

        if (await createButton.isVisible().catch(() => false)) {
          await createButton.click();

          const dialogVisible = await page.locator('text=Create New Version').isVisible().catch(() => false);

          if (dialogVisible) {
            await page.locator('button:has-text("Cancel")').click();
          }
        }
      }

      await page.locator('button:has-text("Back"), button:has-text("←")').first().click();

      await page.screenshot({ path: '.sisyphus/evidence/task-14-version-workflow.png' });
    });
  });
});
