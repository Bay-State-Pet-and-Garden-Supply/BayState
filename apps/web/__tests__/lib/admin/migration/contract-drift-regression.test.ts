/**
 * @jest-environment node
 *
 * Contract Drift Regression Tests
 *
 * These tests ensure the corrected ShopSite ProductField contract remains
 * consistent across constants, documentation, and implementation. Any future
 * changes that silently revert to the old narrow mapping will fail these tests.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
    SHOPSITE_FIELD_MAP,
    CANONICAL_PRODUCT_FIELDS,
    GENERIC_FACET_FIELDS,
    AUDIT_ONLY_PRODUCT_FIELDS,
} from '@/lib/shopsite/constants';

describe('ShopSite field mapping contract drift prevention', () => {
    const DOCS_PATH = path.resolve(__dirname, '../../../../docs');
    const MAPPING_DOC = readFileSync(path.join(DOCS_PATH, 'shopsite-xml-mapping.md'), 'utf8');
    const MATRIX_DOC = readFileSync(path.join(DOCS_PATH, 'field-mapping-matrix.md'), 'utf8');

    describe('constants.ts contract', () => {
        it('must define exactly 18 canonical ProductFields', () => {
            expect(CANONICAL_PRODUCT_FIELDS).toHaveLength(18);
        });

        it('must include all required ProductFields in canonical list', () => {
            const requiredFields = [
                'ProductField7',
                'ProductField11',
                'ProductField15',
                'ProductField16',
                'ProductField17',
                'ProductField18',
                'ProductField19',
                'ProductField20',
                'ProductField21',
                'ProductField22',
                'ProductField23',
                'ProductField24',
                'ProductField25',
                'ProductField26',
                'ProductField27',
                'ProductField29',
                'ProductField30',
                'ProductField32',
            ];

            for (const field of requiredFields) {
                expect(CANONICAL_PRODUCT_FIELDS).toContain(field);
            }
        });

        it('must NOT include ProductField31 in canonical fields', () => {
            expect(CANONICAL_PRODUCT_FIELDS).not.toContain('ProductField31');
        });

        it('must include ProductField31 in audit-only fields', () => {
            expect(AUDIT_ONLY_PRODUCT_FIELDS).toContain('ProductField31');
        });

        it('must define exactly 10 generic facet fields', () => {
            expect(GENERIC_FACET_FIELDS).toHaveLength(10);
        });

        it('must include correct fields in generic facet list', () => {
            const expectedFacetFields = [
                'ProductField18',
                'ProductField19',
                'ProductField20',
                'ProductField21',
                'ProductField22',
                'ProductField23',
                'ProductField26',
                'ProductField27',
                'ProductField29',
                'ProductField30',
            ];

            for (const field of expectedFacetFields) {
                expect(GENERIC_FACET_FIELDS).toContain(field);
            }
        });

        it('must map ProductField24 to Category', () => {
            expect(SHOPSITE_FIELD_MAP.ProductField24).toBe('Category');
        });

        it('must map ProductField31 to Category_Audit_Only', () => {
            expect(SHOPSITE_FIELD_MAP.ProductField31).toBe('Category_Audit_Only');
        });

        it('must map ProductField17 to Pet_Type', () => {
            expect(SHOPSITE_FIELD_MAP.ProductField17).toBe('Pet_Type');
        });

        it('must map ProductField32 to Cross_Sell', () => {
            expect(SHOPSITE_FIELD_MAP.ProductField32).toBe('Cross_Sell');
        });
    });

    describe('documentation contract alignment', () => {
        it('mapping doc must state PF24 is the only canonical category source', () => {
            expect(MAPPING_DOC).toContain('ProductField24` is the **only canonical category source**');
        });

        it('mapping doc must exclude PF31 from normalization', () => {
            expect(MAPPING_DOC).toContain('ProductField31` | **Audit only**');
            expect(MAPPING_DOC).toContain('Never use `ProductField31` for normalized category behavior');
        });

        it('matrix doc must document all 18 canonical ProductField mappings plus exclusions', () => {
            // Count PF entries in the matrix (18 canonical + PF31 excluded = 19 total)
            const pfMatches = MATRIX_DOC.match(/\| `PF\d+`/g);
            expect(pfMatches).toHaveLength(19);

            // Verify all canonical fields are documented
            for (const field of CANONICAL_PRODUCT_FIELDS) {
                const pfNumber = field.replace('ProductField', 'PF');
                expect(MATRIX_DOC).toContain(`| \`${pfNumber}\``);
            }

            // Verify PF31 is documented as excluded
            expect(MATRIX_DOC).toContain('| `PF31`');
        });

        it('matrix doc must state PF24 is the only canonical category source', () => {
            expect(MATRIX_DOC).toContain('ProductField24` is the only canonical category source');
        });

        it('matrix doc must state PF31 is audit-only', () => {
            expect(MATRIX_DOC).toContain('ProductField31` is audit-only raw payload');
        });

        it('matrix doc must state PF17 direct values are canonical', () => {
            expect(MATRIX_DOC).toContain('ProductField17` direct values are canonical');
        });

        it('matrix doc must state PF32 one-way relation rules', () => {
            expect(MATRIX_DOC).toContain('ProductField32` cross-sells are one-way');
            expect(MATRIX_DOC).toContain('skip duplicates, self-links, and missing SKUs');
        });

        it('matrix doc must document rerun clearing semantics', () => {
            expect(MATRIX_DOC).toContain('Blank canonical values clear normalized joins');
        });
    });

    describe('cross-field consistency', () => {
        it('all canonical fields must be in SHOPSITE_FIELD_MAP', () => {
            for (const field of CANONICAL_PRODUCT_FIELDS) {
                expect(SHOPSITE_FIELD_MAP).toHaveProperty(field);
            }
        });

        it('no canonical field should overlap with audit-only fields', () => {
            for (const field of CANONICAL_PRODUCT_FIELDS) {
                expect(AUDIT_ONLY_PRODUCT_FIELDS).not.toContain(field);
            }
        });

        it('all generic facet fields must be in canonical list', () => {
            for (const field of GENERIC_FACET_FIELDS) {
                expect(CANONICAL_PRODUCT_FIELDS).toContain(field);
            }
        });
    });

    describe('contract rules that must never change', () => {
        it('PF24 must always map to Category (not ProductField31)', () => {
            // This test prevents accidental reassignment of category source
            expect(SHOPSITE_FIELD_MAP.ProductField24).toBe('Category');
            expect(SHOPSITE_FIELD_MAP.ProductField31).not.toBe('Category');
        });

        it('PF31 must always be marked audit-only', () => {
            expect(SHOPSITE_FIELD_MAP.ProductField31).toBe('Category_Audit_Only');
            expect(AUDIT_ONLY_PRODUCT_FIELDS).toContain('ProductField31');
        });

        it('must have exactly 18 canonical fields (contract size)', () => {
            // This is a hard constraint - changing the count requires explicit contract revision
            expect(CANONICAL_PRODUCT_FIELDS.length).toBe(18);
        });
    });
});
