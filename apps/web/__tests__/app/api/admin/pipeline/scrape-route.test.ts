jest.mock('next/server', () => ({
    NextRequest: class {
        nextUrl: URL;
        private readonly requestBody: unknown;

        constructor(url: string, init?: { body?: unknown }) {
            this.nextUrl = new URL(url);
            this.requestBody = init?.body;
        }

        async json() {
            if (typeof this.requestBody === 'string') {
                return JSON.parse(this.requestBody);
            }

            return this.requestBody;
        }
    },
    NextResponse: class {
        body: unknown;
        status: number;

        constructor(body: unknown, init?: { status?: number }) {
            this.body = body;
            this.status = init?.status ?? 200;
        }

        static json(body: unknown, init?: { status?: number }) {
            return new this(body, init);
        }

        async json() {
            return this.body;
        }
    },
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/admin/pipeline/scrape/route';

jest.mock('@/lib/admin/api-auth', () => ({
    requireAdminAuth: jest.fn(),
}));

jest.mock('@/lib/supabase/server', () => ({
    createClient: jest.fn(),
}));

jest.mock('@/lib/pipeline-scraping', () => ({
    scrapeProducts: jest.fn(),
}));

const { requireAdminAuth } = require('@/lib/admin/api-auth');
const { createClient } = require('@/lib/supabase/server');
const { scrapeProducts } = require('@/lib/pipeline-scraping');

describe('/api/admin/pipeline/scrape route', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (requireAdminAuth as jest.Mock).mockResolvedValue({ authorized: true, user: { id: 'admin-1' } });
        (scrapeProducts as jest.Mock).mockResolvedValue({ success: true, jobIds: ['job-1'] });
    });

    it('rejects official brand requests without cohort_id', async () => {
        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    scrapers: [],
                    enrichment_method: 'official_brand',
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({
            error: 'Official Brand requires a single cohort to be selected',
        });
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('rejects official brand requests when cohort brand is not registry-backed', async () => {
        const cohortSingle = jest.fn().mockResolvedValue({
            data: {
                id: 'cohort-1',
                brand_id: null,
                brand_name: 'Legacy Brand',
                brands: null,
            },
            error: null,
        });

        (createClient as jest.Mock).mockResolvedValue({
            from: jest.fn((table: string) => {
                if (table === 'cohort_batches') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({ single: cohortSingle }),
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    scrapers: [],
                    enrichment_method: 'official_brand',
                    cohort_id: 'cohort-1',
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({
            error: 'Official Brand requires the cohort to have an assigned registry brand',
        });
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('rejects official brand requests when selected skus span outside the chosen cohort', async () => {
        const cohortSingle = jest.fn().mockResolvedValue({
            data: {
                id: 'cohort-1',
                brand_id: 'brand-1',
                brand_name: null,
                brands: {
                    id: 'brand-1',
                    name: 'Miracle-Gro',
                    website_url: 'https://scottsmiraclegro.com',
                    official_domains: ['scottsmiraclegro.com'],
                    preferred_domains: [],
                },
            },
            error: null,
        });

        const membershipIn = jest.fn().mockResolvedValue({
            data: [
                { sku: 'SKU-1', cohort_id: 'cohort-1' },
                { sku: 'SKU-2', cohort_id: 'cohort-2' },
            ],
            error: null,
        });

        (createClient as jest.Mock).mockResolvedValue({
            from: jest.fn((table: string) => {
                if (table === 'cohort_batches') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({ single: cohortSingle }),
                        }),
                    };
                }

                if (table === 'products_ingestion') {
                    return {
                        select: jest.fn().mockReturnValue({
                            in: membershipIn,
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1', 'SKU-2'],
                    scrapers: [],
                    enrichment_method: 'official_brand',
                    cohort_id: 'cohort-1',
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({
            error: 'Official Brand can only run on products from the selected cohort',
        });
        expect(scrapeProducts).not.toHaveBeenCalled();
    });

    it('passes validated cohort context into scrapeProducts for official brand jobs', async () => {
        const cohortSingle = jest.fn().mockResolvedValue({
            data: {
                id: 'cohort-1',
                brand_id: 'brand-1',
                brand_name: null,
                brands: {
                    id: 'brand-1',
                    name: 'Miracle-Gro',
                    website_url: 'https://www.scottsmiraclegro.com/en-us/brands/miracle-gro',
                    official_domains: ['scottsmiraclegro.com'],
                    preferred_domains: ['homedepot.com'],
                },
            },
            error: null,
        });

        const membershipIn = jest.fn().mockResolvedValue({
            data: [{ sku: 'SKU-1', cohort_id: 'cohort-1' }],
            error: null,
        });

        (createClient as jest.Mock).mockResolvedValue({
            from: jest.fn((table: string) => {
                if (table === 'cohort_batches') {
                    return {
                        select: jest.fn().mockReturnValue({
                            eq: jest.fn().mockReturnValue({ single: cohortSingle }),
                        }),
                    };
                }

                if (table === 'products_ingestion') {
                    return {
                        select: jest.fn().mockReturnValue({
                            in: membershipIn,
                        }),
                    };
                }

                throw new Error(`Unexpected table ${table}`);
            }),
        });

        const response = await POST(
            new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                body: JSON.stringify({
                    skus: ['SKU-1'],
                    scrapers: [],
                    enrichment_method: 'official_brand',
                    cohort_id: 'cohort-1',
                }),
            } as any),
        );
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toMatchObject({ success: true, jobIds: ['job-1'] });
        expect(scrapeProducts).toHaveBeenCalledWith(['SKU-1'], {
            scrapers: [],
            enrichment_method: 'official_brand',
            officialBrandPhase: 'url_discovery',
            testMode: false,
            cohortBrand: 'Miracle-Gro',
            officialBrandCohort: {
                id: 'cohort-1',
                brandId: 'brand-1',
                brandName: 'Miracle-Gro',
                websiteUrl: 'https://www.scottsmiraclegro.com/en-us/brands/miracle-gro',
                officialDomains: ['scottsmiraclegro.com'],
                preferredDomains: ['homedepot.com'],
            },
        });
    });

    describe('deep_research enrichment method', () => {
        beforeEach(() => {
            // Restore default mock — clearAllMocks() does not reset implementations
            (scrapeProducts as jest.Mock).mockResolvedValue({ success: true, jobIds: ['job-1'] });
        });

        it('accepts deep_research without requiring scrapers', async () => {
            (scrapeProducts as jest.Mock).mockResolvedValue({
                success: true,
                jobIds: ['dr-job-1'],
            });

            const response = await POST(
                new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                    body: JSON.stringify({
                        skus: ['SKU-1'],
                        enrichment_method: 'deep_research',
                    }),
                } as any),
            );
            const payload = await response.json();

            expect(response.status).toBe(200);
            expect(payload).toMatchObject({ success: true, jobIds: ['dr-job-1'] });
            expect(scrapeProducts).toHaveBeenCalledWith(['SKU-1'],
                expect.objectContaining({
                    enrichment_method: 'deep_research',
                }),
            );
        });

        it('resolves cohort context and passes it as deepResearchCohort', async () => {
            const cohortSingle = jest.fn().mockResolvedValue({
                data: {
                    id: 'cohort-1',
                    brand_id: 'brand-1',
                    brand_name: null,
                    brands: {
                        id: 'brand-1',
                        name: 'Test Brand',
                        website_url: 'https://testbrand.com',
                        official_domains: ['testbrand.com'],
                        preferred_domains: [],
                    },
                },
                error: null,
            });

            (createClient as jest.Mock).mockResolvedValue({
                from: jest.fn((table: string) => {
                    if (table === 'cohort_batches') {
                        return {
                            select: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({ single: cohortSingle }),
                            }),
                        };
                    }

                    throw new Error(`Unexpected table ${table}`);
                }),
            });

            const response = await POST(
                new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                    body: JSON.stringify({
                        skus: ['SKU-1'],
                        scrapers: [],
                        enrichment_method: 'deep_research',
                        cohort_id: 'cohort-1',
                    }),
                } as any),
            );

            expect(response.status).toBe(200);
            expect(scrapeProducts).toHaveBeenCalledWith(['SKU-1'],
                expect.objectContaining({
                    enrichment_method: 'deep_research',
                    cohortBrand: 'Test Brand',
                    deepResearchCohort: expect.objectContaining({
                        id: 'cohort-1',
                        brandId: 'brand-1',
                        brandName: 'Test Brand',
                    }),
                }),
            );
        });

        it('omits deepResearchCohort when cohort brand data is incomplete', async () => {
            // When brand_id or brand_name is missing, deepResearchCohort is silently omitted
            const cohortSingle = jest.fn().mockResolvedValue({
                data: {
                    id: 'cohort-1',
                    brand_id: null,
                    brand_name: null,
                    brands: null,
                },
                error: null,
            });

            (createClient as jest.Mock).mockResolvedValue({
                from: jest.fn((table: string) => {
                    if (table === 'cohort_batches') {
                        return {
                            select: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({ single: cohortSingle }),
                            }),
                        };
                    }

                    throw new Error(`Unexpected table ${table}`);
                }),
            });

            const response = await POST(
                new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                    body: JSON.stringify({
                        skus: ['SKU-1'],
                        scrapers: [],
                        enrichment_method: 'deep_research',
                        cohort_id: 'cohort-1',
                    }),
                } as any),
            );

            // Should succeed without deepResearchCohort (no error for missing brand data)
            expect(response.status).toBe(200);
            expect(scrapeProducts).toHaveBeenCalledWith(['SKU-1'],
                expect.not.objectContaining({
                    deepResearchCohort: expect.anything(),
                }),
            );
        });

        it('skips official_brand strict validation for deep_research', async () => {
            // Deep research should not require cohort brand to have domains configured
            const cohortSingle = jest.fn().mockResolvedValue({
                data: {
                    id: 'cohort-1',
                    brand_id: 'brand-1',
                    brand_name: 'Brand Name Only',
                    brands: {
                        id: 'brand-1',
                        name: 'Brand Name Only',
                        website_url: null,
                        official_domains: [],
                        preferred_domains: [],
                    },
                },
                error: null,
            });

            (createClient as jest.Mock).mockResolvedValue({
                from: jest.fn((table: string) => {
                    if (table === 'cohort_batches') {
                        return {
                            select: jest.fn().mockReturnValue({
                                eq: jest.fn().mockReturnValue({ single: cohortSingle }),
                            }),
                        };
                    }

                    throw new Error(`Unexpected table ${table}`);
                }),
            });

            const response = await POST(
                new NextRequest('http://localhost/api/admin/pipeline/scrape', {
                    body: JSON.stringify({
                        skus: ['SKU-1'],
                        scrapers: [],
                        enrichment_method: 'deep_research',
                        cohort_id: 'cohort-1',
                    }),
                } as any),
            );

            // Should succeed even without domains (official_brand would reject this)
            expect(response.status).toBe(200);
            expect(scrapeProducts).toHaveBeenCalled();
        });
    });
});
