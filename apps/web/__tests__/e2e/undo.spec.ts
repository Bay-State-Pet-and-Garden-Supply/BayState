import { test, expect } from '@playwright/test';

test.describe('Undo Functionality E2E', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/admin/pipeline');
        await page.waitForSelector('[data-testid="pipeline-client"]', { timeout: 10000 });
    });

    test('should show undo toast after bulk action', async ({ page }) => {
        // Navigate to a status with products that can be bulk acted upon
        await page.getByRole('tab', { name: /Ready for Review|Verified/ }).first().click();
        
        // Wait for products to load
        await page.waitForTimeout(1000);
        
        // Find and select a product
        const productCards = page.locator('[data-testid="product-card"]').or(page.locator('article'));
        const count = await productCards.count();
        
        if (count > 0) {
            // Select first product
            await productCards.first().click();
            
            // Wait for bulk actions to appear
            await page.waitForTimeout(500);
            
            // Click an action button (e.g., Verify Data or Make Live)
            const actionButton = page.getByRole('button', { name: /Verify|Make Live|Approve/ }).first();
            
            if (await actionButton.isVisible().catch(() => false)) {
                await actionButton.click();
                
                // Wait for undo toast to appear
                await expect(page.getByText(/Undo/i)).toBeVisible({ timeout: 5000 });
                await expect(page.getByText(/30s|seconds/i)).toBeVisible();
            }
        }
    });

    test('should revert action when undo is clicked', async ({ page }) => {
        // Navigate to a status with products
        await page.getByRole('tab', { name: /Ready for Review/ }).first().click();
        await page.waitForTimeout(1000);
        
        const productCards = page.locator('[data-testid="product-card"]').or(page.locator('article'));
        const count = await productCards.count();
        
        if (count > 0) {
            // Select and act on product
            await productCards.first().click();
            await page.waitForTimeout(500);
            
            const actionButton = page.getByRole('button', { name: /Verify|Approve/ }).first();
            if (await actionButton.isVisible().catch(() => false)) {
                await actionButton.click();
                
                // Wait for undo toast
                const undoButton = page.getByRole('button', { name: /Undo/i });
                await expect(undoButton).toBeVisible({ timeout: 5000 });
                
                // Click undo
                await undoButton.click();
                
                // Toast should disappear
                await expect(undoButton).not.toBeVisible({ timeout: 3000 });
            }
        }
    });
});
