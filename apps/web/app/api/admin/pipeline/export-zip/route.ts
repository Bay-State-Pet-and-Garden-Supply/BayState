import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/admin/api-auth';
import { createAdminClient } from '@/lib/supabase/server';
import { generateShopSiteXml, ShopSiteExportProduct } from '@/lib/shopsite/xml-generator';
import archiver from 'archiver';
import sharp from 'sharp';
import { PassThrough } from 'node:stream';
import { Readable } from 'node:stream';

export const runtime = 'nodejs';

// Use a max duration if deploying to Vercel (ignored locally)
export const maxDuration = 300; // 5 minutes (max for Vercel Pro)

const PAGE_SIZE = 200;

interface ProductRow {
    id: string;
    name: string;
    sku: string | null;
    price: number;
    weight: string | null;
    description: string | null;
    long_description: string | null;
    images: string[] | null;
    product_type: string | null;
    search_keywords: string | null;
    shopsite_pages: string[] | null;
    is_special_order: boolean | null;
    is_taxable: boolean | null;
    brands: { name: string; slug: string | null } | null;
    categories: { name: string } | null;
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
}

export async function GET(request: NextRequest) {
    const auth = await requireAdminAuth();
    if (!auth.authorized) return auth.response;

    const statusFilter = request.nextUrl.searchParams.get('status') || 'finalized';
    
    try {
        const passThrough = new PassThrough();
        const archive = archiver('zip', { zlib: { level: 5 } });
        
        archive.on('error', (err) => {
            console.error('[ExportZip] Archive error:', err);
            passThrough.destroy(err);
        });
        
        archive.pipe(passThrough);

        // Convert PassThrough to Web ReadableStream
        const stream = Readable.toWeb(passThrough) as ReadableStream;

        // Process asynchronously so we can return the stream immediately
        (async () => {
            try {
                const supabase = await createAdminClient();
                const products: ShopSiteExportProduct[] = [];
                let page = 0;

                const imageDownloadTasks: { url: string; zipPath: string }[] = [];
                const seenImagePaths = new Set<string>();

                while (true) {
                    const from = page * PAGE_SIZE;
                    const to = from + PAGE_SIZE - 1;

                    let query = supabase
                        .from('products')
                        .select('id, name, sku, price, weight, description, long_description, images, product_type, search_keywords, shopsite_pages, is_special_order, is_taxable, brands(name, slug), categories(name)')
                        .order('name', { ascending: true });
                        
                    if (statusFilter !== 'all') {
                        query = query.eq('pipeline_status', statusFilter);
                    } else {
                        // For 'all', we typically only export published/finalized unless specified
                        query = query.not('published_at', 'is', null);
                    }

                    const { data, error } = await query.range(from, to);

                    if (error) {
                        console.error('[ExportZip] DB error:', error.message);
                        throw new Error(`Failed to fetch products: ${error.message}`);
                    }

                    if (!data || data.length === 0) break;

                    for (const row of data as unknown as ProductRow[]) {
                        const brandName = row.brands?.name ?? null;
                        const brandSlug = row.brands?.slug ?? slugify(brandName || 'uncategorized');
                        const categoryName = row.categories?.name ?? null;

                        const productImages: string[] = [];
                        
                        if (row.images && row.images.length > 0) {
                            const productSlug = slugify(row.name);
                            
                            for (let i = 0; i < row.images.length; i++) {
                                const originalUrl = row.images[i];
                                const filename = i === 0 ? `${productSlug}.jpg` : `${productSlug}-${i + 1}.jpg`;
                                const zipPath = `${brandSlug}/${filename}`;
                                
                                productImages.push(zipPath);
                                
                                if (!seenImagePaths.has(zipPath)) {
                                    seenImagePaths.add(zipPath);
                                    imageDownloadTasks.push({ url: originalUrl, zipPath });
                                }
                            }
                        }

                        products.push({
                            sku: row.sku || row.id,
                            name: row.name,
                            price: row.price,
                            weight: row.weight,
                            brand_name: brandName,
                            description: row.description,
                            long_description: row.long_description,
                            images: productImages, // Local paths now
                            category: categoryName,
                            product_type: row.product_type,
                            shopsite_pages: row.shopsite_pages,
                            search_keywords: row.search_keywords,
                            is_special_order: row.is_special_order ?? false,
                            is_taxable: row.is_taxable ?? true,
                        });
                    }

                    if (data.length < PAGE_SIZE) break;
                    page += 1;
                }

                // Append the XML Manifest to the archive
                const xmlContent = generateShopSiteXml(products);
                archive.append(xmlContent, { name: 'shopsite-products.xml' });

                // Process images sequentially to avoid eating too much memory
                for (let i = 0; i < imageDownloadTasks.length; i++) {
                    const { url, zipPath } = imageDownloadTasks[i];
                    try {
                        const res = await fetch(url);
                        if (!res.ok) {
                            console.warn(`[ExportZip] Failed to fetch image ${url} (${res.status})`);
                            continue;
                        }
                        
                        const arrayBuffer = await res.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        
                        const resizedBuffer = await sharp(buffer)
                            .resize(1000, 1000, {
                                fit: 'contain',
                                background: { r: 255, g: 255, b: 255, alpha: 1 }
                            })
                            .jpeg({ quality: 90 })
                            .toBuffer();
                            
                        archive.append(resizedBuffer, { name: zipPath });
                    } catch (imageErr) {
                        console.error(`[ExportZip] Error processing image ${url}:`, imageErr);
                    }
                }

                await archive.finalize();
            } catch (err) {
                console.error('[ExportZip] Async processing error:', err);
                archive.abort();
            }
        })();

        const dateStr = new Date().toISOString().split('T')[0];
        
        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="baystate-export-${dateStr}.zip"`,
                'Cache-Control': 'no-store',
            },
        });
    } catch (err) {
        console.error('[ExportZip] Setup error:', err);
        return NextResponse.json(
            { error: 'Failed to generate ZIP export' },
            { status: 500 },
        );
    }
}
