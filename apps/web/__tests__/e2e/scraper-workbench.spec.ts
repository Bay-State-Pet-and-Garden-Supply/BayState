import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ??
  process.env.PLAYWRIGHT_ADMIN_EMAIL ??
  process.env.ADMIN_EMAIL;

const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD ??
  process.env.PLAYWRIGHT_ADMIN_PASSWORD ??
  process.env.ADMIN_PASSWORD;

async function ensureAuthenticatedAdmin(page: Page): Promise<void> {
  await page.goto('/admin/scrapers/list');
  await page.waitForLoadState('domcontentloaded');

  if (page.url().includes('/login') || page.url().includes('/admin/login')) {
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      throw new Error(
        'Admin authentication is required. Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD.'
      );
    }

    await page.getByLabel(/email/i).fill(ADMIN_EMAIL);
    await page.getByLabel(/password/i).fill(ADMIN_PASSWORD);

    await Promise.all([
      page.waitForURL(/\/admin\/scrapers\/list/),
      page.getByRole('button', { name: /sign in/i }).click(),
    ]);
  }

  await expect(page.getByTestId('scraper-list')).toBeVisible();
}

async function ensureSelectorExists(page: Page): Promise<void> {
  if (await page.getByTestId('selectors-empty-state').isVisible()) {
    await page.getByTestId('add-selector-button').click();
  }

  await expect(page.getByTestId('selector-name-input').first()).toBeVisible();
}

async function readVersionNumber(page: Page): Promise<number> {
  const text = await page.getByTestId('configuration-version-label').innerText();
  const match = text.match(/Version\s+(\d+)/i);

  if (!match) {
    throw new Error(`Failed to parse version number from "${text}"`);
  }

  return Number(match[1]);
}

async function ensureCurrentDraft(page: Page): Promise<void> {
  const publishButton = page.getByTestId('publish-version-button');
  if (await publishButton.isVisible()) {
    return;
  }

  const createDraftButton = page.getByTestId('create-new-version-button');
  await expect(createDraftButton).toBeVisible();
  await createDraftButton.click();
  await expect.poll(async () => publishButton.isVisible(), { timeout: 30_000 }).toBe(true);
}

test('scraper workbench smoke flow', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop-chrome',
    'Mutation flow runs once on desktop project.'
  );

  test.setTimeout(180_000);

  await ensureAuthenticatedAdmin(page);

  const scraperCard = page.getByTestId('scraper-card').first();
  await expect(scraperCard).toBeVisible();

  await Promise.all([
    page.waitForURL(/\/admin\/scrapers\/[^/]+\/?$/),
    scraperCard.getByTestId('scraper-card-view-link').first().click(),
  ]);

  await expect(page.getByTestId('scraper-workbench')).toBeVisible();
  await expect(page.getByTestId('tab-content-overview')).toBeVisible();

  await page.getByTestId('tab-configuration').click();
  await expect(page.getByTestId('tab-content-configuration')).toBeVisible();

  await ensureCurrentDraft(page);
  await ensureSelectorExists(page);

  const selectorInput = page.getByTestId('selector-name-input').first();
  const originalValue = await selectorInput.inputValue();
  const updatedValue = `${originalValue || 'selector'}-smoke-${Date.now().toString().slice(-6)}`;

  await selectorInput.fill(updatedValue);
  await expect(page.getByTestId('selector-editor-unsaved-footer')).toBeVisible();
  await page.getByTestId('save-selectors-button').click();

  await expect
    .poll(async () => {
      const hasUnsaved = await page.getByTestId('selector-editor-unsaved-footer').isVisible();
      const persisted = await page.getByTestId('selector-name-input').first().inputValue();
      return !hasUnsaved && persisted === updatedValue;
    }, { timeout: 30_000 })
    .toBe(true);

  await page.reload();
  await expect(page.getByTestId('tab-content-configuration')).toBeVisible();
  await expect(page.getByTestId('selector-name-input').first()).toHaveValue(updatedValue);

  if (updatedValue !== originalValue) {
    await page.getByTestId('selector-name-input').first().fill(originalValue);
    await page.getByTestId('save-selectors-button').click();

    await expect
      .poll(async () => {
        const hasUnsaved = await page.getByTestId('selector-editor-unsaved-footer').isVisible();
        const restored = await page.getByTestId('selector-name-input').first().inputValue();
        return !hasUnsaved && restored === originalValue;
      }, { timeout: 30_000 })
      .toBe(true);
  }

  await page.getByTestId('tab-workflows').click();
  await expect(page.getByTestId('tab-content-workflows')).toBeVisible();
  await expect(page.getByTestId('workflow-steps-list')).toBeVisible();

  await page.getByTestId('tab-test-lab').click();
  await expect(page.getByTestId('tab-content-test-lab')).toBeVisible();
  await expect(page.getByTestId('test-sku-manager')).toBeVisible();

  await page.getByTestId('tab-history').click();
  await expect(page.getByTestId('tab-content-history')).toBeVisible();
  await expect(
    page.getByTestId('version-timeline').or(page.getByTestId('version-timeline-empty'))
  ).toBeVisible();

  await page.getByTestId('tab-configuration').click();
  await expect(page.getByTestId('tab-content-configuration')).toBeVisible();
  await ensureCurrentDraft(page);

  await page.getByTestId('publish-version-button').click();
  await expect
    .poll(async () => page.getByTestId('create-new-version-button').isVisible(), { timeout: 30_000 })
    .toBe(true);

  const publishedVersionNumber = await readVersionNumber(page);

  await page.getByTestId('create-new-version-button').click();
  await expect
    .poll(async () => page.getByTestId('publish-version-button').isVisible(), { timeout: 30_000 })
    .toBe(true);

  const newDraftVersionNumber = await readVersionNumber(page);
  expect(newDraftVersionNumber).toBeGreaterThan(publishedVersionNumber);

  await page.getByTestId('tab-history').click();
  await expect(page.getByTestId('tab-content-history')).toBeVisible();
  await expect(
    page.locator(
      `[data-testid="version-timeline-item"][data-version-number="${newDraftVersionNumber}"][data-version-status="draft"]`
    )
  ).toBeVisible();

  await page.getByTestId('tab-configuration').click();
  await expect(page.getByTestId('tab-content-configuration')).toBeVisible();
  await expect(page.getByTestId('configuration-version-label')).toContainText(
    String(newDraftVersionNumber)
  );

  await page.getByTestId('publish-version-button').click();
  await expect
    .poll(async () => page.getByTestId('create-new-version-button').isVisible(), { timeout: 30_000 })
    .toBe(true);

  await page.getByTestId('tab-history').click();
  await expect(
    page.locator(
      `[data-testid="version-timeline-item"][data-version-number="${newDraftVersionNumber}"][data-version-status="published"]`
    )
  ).toBeVisible();
});
