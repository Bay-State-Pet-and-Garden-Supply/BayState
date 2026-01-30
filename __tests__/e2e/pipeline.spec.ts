import { test, expect } from '@playwright/test';

test.describe('Pipeline E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to pipeline page
        await page.goto('/admin/pipeline');
        // Wait for page to load
        await page.waitForSelector('[data-testid="pipeline-client"]', { timeout: 10000 });
    });

    test('should display pipeline page with products', async ({ page }) => {
        // Check page title/header
        await expect(page.getByText('Imported')).toBeVisible();
        
        // Check that product grid or empty state is visible
        const productGrid = page.locator('[data-testid="product-grid"]').or(page.getByText('No products'));
        await expect(productGrid).toBeVisible();
    });

    test('should filter products by status tabs', async ({ page }) => {
        // Click on different status tabs
        await page.getByRole('tab', { name: /Enhanced/ }).click();
        await expect(page.getByRole('tab', { name: /Enhanced/ })).toHaveAttribute('aria-selected', 'true');
        
        await page.getByRole('tab', { name: /Ready for Review/ }).click();
        await expect(page.getByRole('tab', { name: /Ready for Review/ })).toHaveAttribute('aria-selected', 'true');
    });

    test('should search products', async ({ page }) => {
        // Type in search box
        const searchInput = page.getByPlaceholder(/Search products/i);
        await searchInput.fill('test');
        await searchInput.press('Enter');
        
        // Wait for search to complete
        await page.waitForTimeout(500);
        
        // Check that search was applied (URL should contain search param)
        await expect(page).toHaveURL(/.*search=test.*/);
    });

    test('should export CSV', async ({ page }) => {
        // Click export button
        const exportButton = page.getByRole('button', { name: /Export CSV/i });
        
        // Export button should be visible
        await expect(exportButton).toBeVisible();
        
        // Click export (this will trigger download)
        await exportButton.click();
        
        // Wait for download to start
        await page.waitForTimeout(1000);
    });

    test('should select products and show bulk actions', async ({ page }) => {
        // Find product cards
        const productCards = page.locator('[data-testid="product-card"]').or(page.locator('article'));
        
        // If there are products, try to select one
        const count = await productCards.count();
        if (count > 0) {
            // Click on first product card to select it
            await productCards.first().click();
            
            // Check that bulk actions toolbar appears
            await expect(page.getByText(/product.*selected/i)).toBeVisible();
        }
    });
});
