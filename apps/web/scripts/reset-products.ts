import { resetProducts } from './reset-products-logic';

/**
 * Script entry point for product reset and placeholder removal.
 * Run with: bun run scripts/reset-products.ts
 * Or: npx ts-node scripts/reset-products.ts
 */
(async () => {
  try {
    console.log('🔄 Resetting products and purging placeholders...');
    const result = await resetProducts();
    if (result.success) {
      console.log('✅ Success: Products reset and placeholders removed.');
    }
  } catch (err) {
    console.error('❌ Error during product reset:', err);
    process.exit(1);
  }
})();
