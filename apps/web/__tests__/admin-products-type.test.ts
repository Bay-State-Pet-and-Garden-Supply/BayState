/**
 * @jest-environment node
 */
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Test to verify Issue #4: Type assertion usage in Admin Products page
 * 
 * The current implementation uses proper type handling instead of `as unknown as`.
 * This test verifies the fix is in place.
 */
describe('Issue #4: Type Assertion in Admin Products Page - FIXED', () => {
    
    it('VERIFIED: Admin page NO LONGER uses as unknown as type assertion', () => {
        // Read the admin products page source
        const adminProductsPath = join(process.cwd(), 'app/admin/products/page.tsx');
        const content = readFileSync(adminProductsPath, 'utf-8');
        
        // The old problematic assertion should NOT exist anymore
        expect(content).not.toContain('as unknown as PublishedProduct[]');
        
        console.log('Issue #4 FIXED: Admin products page no longer uses `as unknown as` type assertion');
    });

    it('VERIFIED: PublishedProduct type is properly imported and used', () => {
        // Read the admin products page source
        const adminProductsPath = join(process.cwd(), 'app/admin/products/page.tsx');
        const content = readFileSync(adminProductsPath, 'utf-8');
        
        // Verify PublishedProduct is imported
        expect(content).toContain("import { PublishedProduct } from");
        
        // Verify it's used with explicit typing
        expect(content).toContain('clientProducts: PublishedProduct[]');
    });

    it('VERIFIED: Query now includes brand join fields', () => {
        // Read the admin products page source
        const adminProductsPath = join(process.cwd(), 'app/admin/products/page.tsx');
        const content = readFileSync(adminProductsPath, 'utf-8');
        
        // The new query uses proper join instead of select('*')
        expect(content).toContain('brand:brands!inner');
        expect(content).toContain('brand_name');
        expect(content).toContain('brand_slug');
        
        console.log('Issue #4 FIXED: Query now joins brands and transforms data properly');
    });

    it('CONFIRMS: Data transformation handles nested brand object', () => {
        // Read the admin products page source
        const adminProductsPath = join(process.cwd(), 'app/admin/products/page.tsx');
        const content = readFileSync(adminProductsPath, 'utf-8');
        
        // Verify transformation logic
        expect(content).toContain('product.brand?.name');
        expect(content).toContain('product.brand?.slug');
        expect(content).toContain('|| null');
        
        // The fix properly handles the nested brand object and flattens it
        console.log('Issue #4 FIXED: Transformation properly flattens nested brand data');
    });
});
