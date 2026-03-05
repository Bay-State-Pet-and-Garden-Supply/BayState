import { test, expect } from '@playwright/test';

test.describe('Version History', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
    await page.waitForLoadState('networkidle');
  });

  test('version history tab is accessible from config editor', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    
    const editOption = page.locator('text=Edit Configuration');
    await expect(editOption).toBeVisible();
    await editOption.click();
    
    const versionsTab = page.locator('[role="tab"]:has-text("Versions")');
    await expect(versionsTab).toBeVisible();
    
    await versionsTab.click();
    
    await expect(page.locator('text=Version History')).toBeVisible();
  });

  test('version list displays with correct structure', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    await page.locator('text=Edit Configuration').click();
    
    await page.locator('[role="tab"]:has-text("Versions")').click();
    
    await expect(page.locator('text=Version History')).toBeVisible();
    
    const versionCount = page.locator('[class*="font-mono"]').filter({ hasText: /v\d+/ }).first();
    await expect(versionCount).toBeVisible({ timeout: 5000 });
    
    await expect(page.locator('button:has-text("Create Version")')).toBeVisible();
  });

  test('create version dialog opens and has correct form', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    await page.locator('text=Edit Configuration').click();
    
    await page.locator('[role="tab"]:has-text("Versions")').click();
    
    await page.locator('button:has-text("Create Version")').click();
    
    await expect(page.locator('text=Create New Version')).toBeVisible();
    await expect(page.locator('label:has-text("Change Summary")')).toBeVisible();
    await expect(page.locator('button:has-text("Create Version")').nth(1)).toBeVisible();
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
    
    await page.locator('button:has-text("Cancel")').click();
    await expect(page.locator('text=Create New Version')).not.toBeVisible();
  });

  test('version card can be expanded to show details', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    await page.locator('text=Edit Configuration').click();
    
    await page.locator('[role="tab"]:has-text("Versions")').click();
    
    await page.waitForTimeout(1000);
    
    const expandButton = page.locator('button[class*="h-8 w-8"]').first();
    await expandButton.click();
    
    await expect(page.locator('text=Created')).toBeVisible();
    await expect(page.locator('text=Schema Version')).toBeVisible();
    
    await expect(page.locator('button:has-text("View Configuration")')).toBeVisible();
  });

  test('diff dialog opens when clicking compare button', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    await page.locator('text=Edit Configuration').click();
    
    await page.locator('[role="tab"]:has-text("Versions")').click();
    await page.waitForTimeout(1000);
    
    const compareButton = page.locator('button:has([data-lucide="file-diff"])').first();
    if (await compareButton.isVisible().catch(() => false)) {
      await compareButton.click();
      
      await expect(page.locator('text=Version Comparison')).toBeVisible();
      
      await page.locator('button:has-text("Close")').click();
      await expect(page.locator('text=Version Comparison')).not.toBeVisible();
    }
  });

  test('view configuration dialog shows config content', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    await page.locator('text=Edit Configuration').click();
    
    await page.locator('[role="tab"]:has-text("Versions")').click();
    await page.waitForTimeout(1000);
    
    const expandButton = page.locator('button[class*="h-8 w-8"]').first();
    await expandButton.click();
    
    await page.locator('button:has-text("View Configuration")').click();
    
    await expect(page.locator('text=Configuration - Version')).toBeVisible();
    await expect(page.locator('pre')).toBeVisible();
    
    await page.locator('button:has-text("Close")').click();
  });

  test('version status badges are displayed correctly', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    await page.locator('text=Edit Configuration').click();
    
    await page.locator('[role="tab"]:has-text("Versions")').click();
    await page.waitForTimeout(1000);
    
    const versionCards = page.locator('[class*="border-2"]').first();
    await expect(versionCards).toBeVisible();
    
    const badges = page.locator('[class*="inline-flex"]').filter({ hasText: /Published|Validated|Draft|Archived/ });
    await expect(badges.first()).toBeVisible();
  });

  test('empty state shown when no versions exist', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    await page.locator('text=Edit Configuration').click();
    
    await page.locator('[role="tab"]:has-text("Versions")').click();
    
    const noVersionsText = page.locator('text=No versions yet');
    if (await noVersionsText.isVisible().catch(() => false)) {
      await expect(page.locator('text=Create your first version to start tracking changes')).toBeVisible();
    }
  });
});
