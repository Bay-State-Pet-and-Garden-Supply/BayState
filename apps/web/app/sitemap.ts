import { MetadataRoute } from 'next';
import { createPublicClient } from '@/lib/supabase/server';
import { getCategoryUrl, getBrandUrl, getProductUrl } from '@/lib/urls';

/**
 * Generates the sitemap for the site.
 * Includes static pages, category pages (/c/), brand pages (/b/), and product pages.
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const baseUrl = 'https://bay-state-app.vercel.app';
    const supabase = createPublicClient();

    // Fetch all categories and brands in parallel
    // Only include active categories (exclude inactive legacy categories)
    const [categoriesResult, brandsResult, productsResult] = await Promise.all([
        supabase.from('categories').select('slug, updated_at').eq('is_active', true).order('display_order'),
        supabase.from('brands').select('slug, updated_at').order('name'),
        supabase
            .from('products')
            .select('slug, updated_at')
            .in('stock_status', ['in_stock', 'pre_order'])
            .order('updated_at', { ascending: false })
            .limit(5000),
    ]);

    const staticPages: MetadataRoute.Sitemap = [
        {
            url: baseUrl,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 1,
        },
        {
            url: `${baseUrl}/about`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/contact`,
            lastModified: new Date(),
            changeFrequency: 'monthly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/products`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
        {
            url: `${baseUrl}/brands`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.8,
        },
        {
            url: `${baseUrl}/services`,
            lastModified: new Date(),
            changeFrequency: 'weekly',
            priority: 0.9,
        },
    ];

    // Category pages
    const categoryPages: MetadataRoute.Sitemap = (categoriesResult.data || []).map((cat) => ({
        url: `${baseUrl}${getCategoryUrl(cat.slug)}`,
        lastModified: cat.updated_at ? new Date(cat.updated_at) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
    }));

    // Brand pages
    const brandPages: MetadataRoute.Sitemap = (brandsResult.data || []).map((brand) => ({
        url: `${baseUrl}${getBrandUrl(brand.slug)}`,
        lastModified: brand.updated_at ? new Date(brand.updated_at) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.7,
    }));

    // Product pages
    const productPages: MetadataRoute.Sitemap = (productsResult.data || []).map((product) => ({
        url: `${baseUrl}${getProductUrl(product.slug)}`,
        lastModified: product.updated_at ? new Date(product.updated_at) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
    }));

    return [...staticPages, ...categoryPages, ...brandPages, ...productPages];
}
