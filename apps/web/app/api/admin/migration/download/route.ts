/**
 * API Route to download raw ShopSite XML data
 * 
 * GET /api/admin/migration/download?type=products|orders|customers
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ShopSiteClient, type ShopSiteConfig } from '@/lib/admin/migration/shopsite-client';
import { requireAdminOnlyAuth } from '@/lib/admin/api-auth';

const MIGRATION_SETTINGS_KEY = 'shopsite_migration';
const TEST_LIMIT = 100;

export async function GET(request: NextRequest) {
    // Migration data download requires admin-only access (not staff)
    const auth = await requireAdminOnlyAuth();
    if (!auth.authorized) return auth.response;

    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type');

    if (!type || !['products', 'orders', 'customers'].includes(type)) {
        return NextResponse.json(
            { error: 'Invalid type. Must be products, orders, or customers.' },
            { status: 400 }
        );
    }

    // Get credentials from Supabase
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', MIGRATION_SETTINGS_KEY)
        .single();

    if (error || !data) {
        return NextResponse.json(
            { error: 'No ShopSite credentials configured' },
            { status: 400 }
        );
    }

    const credentials = data.value as ShopSiteConfig;
    const client = new ShopSiteClient(credentials);

    try {
        let xmlContent = '';
        let header = '';
        let footer = '';

        if (type === 'products') {
            header = '<?xml version="1.0" encoding="utf-8" ?>\n<ShopSiteProducts>';
            footer = '</ShopSiteProducts>';
            const products = await client.fetchProducts(TEST_LIMIT);
            xmlContent = products.map(p => p.rawXml).join('\n');
        } else if (type === 'orders') {
            header = '<?xml version="1.0" encoding="utf-8" ?>\n<ShopSiteOrders>';
            footer = '</ShopSiteOrders>';
            const orders = await client.fetchOrders({ limit: TEST_LIMIT });
            xmlContent = orders.map(o => o.rawXml).join('\n');
        } else if (type === 'customers') {
            header = '<?xml version="1.0" encoding="utf-8" ?>\n<customers>';
            footer = '</customers>';
            const customers = await client.fetchCustomers(TEST_LIMIT);
            xmlContent = customers.map(c => c.rawXml).join('\n');
        }

        const fullXml = `${header}\n${xmlContent}\n${footer}`;

        // Return as downloadable XML file
        return new NextResponse(fullXml, {
            headers: {
                'Content-Type': 'application/xml',
                'Content-Disposition': `attachment; filename="shopsite-${type}-${new Date().toISOString().split('T')[0]}.xml"`,
            },
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Failed to fetch from ShopSite' },
            { status: 500 }
        );
    }
}
