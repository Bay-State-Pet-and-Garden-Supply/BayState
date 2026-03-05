import { test, expect } from '@playwright/test';

test.describe('Studio Config Editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/scrapers/studio');
  });

  test('config list loads with data', async ({ page }) => {
    await expect(page.locator('text=Scraper Studio')).toBeVisible();
    await expect(page.locator('[role="tab"]:has-text("Configs")')).toBeVisible();
    
    const table = page.locator('table');
    await expect(table).toBeVisible();
  });

  test('config editor opens when clicking edit', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    
    const editOption = page.locator('text=Edit Configuration');
    await expect(editOption).toBeVisible();
    
    await editOption.click();
    
    await expect(page.locator('button:has-text("← Back")')).toBeVisible();
    await expect(page.locator('button:has-text("YAML")')).toBeVisible();
    await expect(page.locator('button:has-text("Form")')).toBeVisible();
  });

  test('YAML editor shows validation error for invalid YAML', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    await page.locator('text=Edit Configuration').click();
    
    await page.locator('button:has-text("YAML")').click();
    
    const yamlTextarea = page.locator('textarea[placeholder*="YAML"]');
    await expect(yamlTextarea).toBeVisible();
    
    await yamlTextarea.fill('invalid: yaml: content: [}');
    
    await expect(page.locator('text=YAML Syntax Error')).toBeVisible();
  });

  test('YAML editor shows success for valid YAML', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    await page.locator('text=Edit Configuration').click();
    
    await page.locator('button:has-text("YAML")').click();
    
    const yamlTextarea = page.locator('textarea[placeholder*="YAML"]');
    await yamlTextarea.fill(`
schema_version: "1.0"
name: test-scraper
base_url: https://example.com
selectors: []
workflows: []
    `);
    
    await expect(page.locator('text=Valid YAML')).toBeVisible();
  });

  test('back button returns to config list', async ({ page }) => {
    const moreButton = page.locator('button[aria-haspopup="menu"]').first();
    await moreButton.click();
    await page.locator('text=Edit Configuration').click();
    
    await expect(page.locator('button:has-text("← Back")')).toBeVisible();
    
    await page.locator('button:has-text("← Back")').click();
    
    await expect(page.locator('table')).toBeVisible();
  });
});
