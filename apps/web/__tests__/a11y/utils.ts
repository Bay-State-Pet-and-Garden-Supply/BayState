import { type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Run axe accessibility scan on a page and fail on any violations.
 * 
 * @param page - Playwright page to scan
 * @param testInfo - Test info for screenshot/tracing context
 * @param context - Optional context description for error messages
 * @returns Promise that resolves if no violations, rejects with details if violations found
 */
export async function expectNoAccessibilityViolations(
  page: Page,
  testInfo: TestInfo,
  context?: string
): Promise<void> {
  const axeBuilder = new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']);
  
  const violations = await axeBuilder.analyze();
  
  if (violations.violations.length > 0) {
    const contextStr = context ? ` for ${context}` : '';
    const errorMessage = [
      `Found ${violations.violations.length} accessibility violation(s)${contextStr}:`,
      '',
      ...violations.violations.map((v) => {
        // Use v.nodes array (new axe-core API) with fallback to v.node (legacy)
        const firstNode = v.nodes?.[0] ?? (v as any).node;
        const targetRaw = firstNode?.target;
        const target = Array.isArray(targetRaw) 
          ? targetRaw.join(', ') 
          : targetRaw ?? firstNode?.html ?? 'N/A';
        
        return [
          `- ${v.id}: ${v.description}`,
          `  Impact: ${v.impact || 'unknown'}`,
          `  Help: ${v.help || 'N/A'}`,
          `  Help URL: ${v.helpUrl || 'N/A'}`,
          `  HTML: ${firstNode?.html || 'N/A'}`,
          `  Target: ${target}`,
          '',
        ].join('\n');
      }),
      '',
      'Run with PLAYWRIGHT_SCREENSHOT=on to capture failure screenshots.',
    ].join('\n');
    
    throw new Error(errorMessage);
  }
}

/**
 * Run axe scan and return violations for custom handling.
 * Use this when you need to handle violations differently than throwing.
 * 
 * @param page - Playwright page to scan
 * @returns Promise resolving to array of violations (empty if none)
 */
export async function getAccessibilityViolations(
  page: Page
): Promise<AxeBuilder['analyze'] extends () => Promise<infer T> ? T : never> {
  const axeBuilder = new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']);
  return await axeBuilder.analyze();
}

/**
 * Custom matcher for Jest/Playwright to check accessibility violations.
 * Can be used with expect() for more natural test syntax.
 * 
 * Usage: await expect(page).toHaveNoA11yViolations()
 */
export function createA11yMatcher() {
  return {
    async toHaveNoA11yViolations(page: Page): Promise<{ pass: boolean; message: () => string }> {
      const violations = await new AxeBuilder({ page }).withTags(['wcag2aa', 'wcag21aa']).analyze();
      
      if (violations.violations.length === 0) {
        return {
          pass: true,
          message: () => 'Expected page to have accessibility violations, but none found',
        };
      }
      
      const violationSummary = violations.violations
        .slice(0, 5)
        .map((v) => `${v.id} (${v.impact})`)
        .join(', ');
      
      return {
        pass: false,
        message: () =>
          `Expected page to have no accessibility violations, but found ${violations.violations.length}: ${violationSummary}${violations.violations.length > 5 ? '...' : ''}`,
      };
    },
  };
}
