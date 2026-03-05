import { test, expect } from '@playwright/test';
import { expectNoAccessibilityViolations } from './utils';

/**
 * Public routes accessibility tests.
 * These routes require no authentication and should be tested first.
 * 
 * Route matrix from: .sisyphus/plans/accessibility-critical-fixes.md
 */
test.describe('Public Routes - Accessibility', () => {
  // Define public routes from the plan matrix.
  const publicRoutes = [
    { path: '/', name: 'Homepage' },
    { path: '/about', name: 'About' },
    { path: '/contact', name: 'Contact' },
    { path: '/brands', name: 'Brands' },
    { path: '/products', name: 'Products Listing' },
    { path: '/products/test-product', name: 'Product Detail (fixture)' },
    { path: '/services', name: 'Services Listing' },
    { path: '/services/propane-refill', name: 'Service Detail (fixture)' },
    { path: '/cart', name: 'Cart' },
    { path: '/checkout', name: 'Checkout' },
    { path: '/order-confirmation/order-guest-1001', name: 'Order Confirmation (guest fixture)' },
    // privacy-policy removed - no CMS page exists at this route
  ];

  // Run tests for each public route.
  for (const route of publicRoutes) {
    test(`${route.name} (${route.path}) should have no accessibility violations @desktop`, async ({ page }, testInfo) => {
      await page.goto(route.path);
      await expectNoAccessibilityViolations(page, testInfo, route.path);
    });
  }

  // Mobile viewport tests for key public routes.
  // Testing subset of routes to balance test execution time while covering mobile-specific issues.
  const mobileTestRoutes = [
    { path: '/products', name: 'Products Listing (Mobile)' },
    { path: '/', name: 'Homepage (Mobile)' },
    { path: '/cart', name: 'Cart (Mobile)' },
  ];

  for (const route of mobileTestRoutes) {
    test(`${route.name} should have no accessibility violations @mobile`, async ({ page }, testInfo) => {
      await page.goto(route.path);
      await expectNoAccessibilityViolations(page, testInfo, route.path);
    });
  }
});
