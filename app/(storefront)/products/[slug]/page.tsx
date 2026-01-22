import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { type Metadata } from 'next';
import { getProductBySlug } from '@/lib/products';
import { Badge } from '@/components/ui/badge';
import { AddToCartButton } from '@/components/storefront/add-to-cart-button';
import { ProductImageCarousel } from '@/components/storefront/product-image-carousel';
import { ProductAdminEdit } from '@/components/storefront/product-admin-edit';
import { ProductCard } from '@/components/storefront/product-card';
import { ProductReviews } from '@/components/storefront/product-reviews';
import { ReviewSubmissionForm } from '@/components/storefront/review-submission-form';
import { ProductQA } from '@/components/storefront/product-qa';
import { RecentlyViewedSection } from '@/components/storefront/recently-viewed-section';
import { ProductViewTracker } from '@/components/storefront/product-view-tracker';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/roles';
import { getRelatedProductsByPetType } from '@/lib/recommendations';
import { getApprovedReviews, getProductReviewStats, hasUserReviewedProduct } from '@/lib/storefront/reviews';
import { getProductQuestions } from '@/lib/storefront/questions';
import { getRecentlyViewedProducts } from '@/lib/storefront/recently-viewed';
import { getProductPreorderData } from '@/lib/storefront/preorder';
import { formatCurrency } from '@/lib/utils';

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Generate dynamic metadata for SEO.
 */
export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return {
      title: 'Product Not Found | Bay State Pet & Garden',
    };
  }

  const description = product.description
    ? product.description.slice(0, 160)
    : `Shop ${product.name} at Bay State Pet & Garden Supply.`;

  return {
    title: `${product.name} | Bay State Pet & Garden`,
    description,
    openGraph: {
      title: product.name,
      description,
      images: product.images?.[0] ? [{ url: product.images[0] }] : undefined,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: product.name,
      description,
      images: product.images?.[0] ? [product.images[0]] : undefined,
    },
  };
}

/**
 * Product detail page showing full product information.
 */
export default async function ProductDetailPage({ params }: ProductDetailPageProps) {
  const { slug } = await params;

  // Fetch product and user data in parallel
  const supabase = await createClient();
  const [product, { data: { user } }] = await Promise.all([
    getProductBySlug(slug),
    supabase.auth.getUser(),
  ]);

  if (!product) {
    notFound();
  }

  // Fetch additional data in parallel
  const [userRole, relatedByPetType, reviews, reviewStats, questions, recentlyViewed, hasReviewed, preorderData] = await Promise.all([
    user ? getUserRole(user.id) : null,
    getRelatedProductsByPetType(product.id, 4),
    getApprovedReviews(product.id),
    getProductReviewStats(product.id),
    getProductQuestions(product.id),
    getRecentlyViewedProducts(product.id, 6),
    hasUserReviewedProduct(product.id),
    getProductPreorderData(product.id),
  ]);

  const isLoggedIn = !!user;

  // Check if user is admin or staff
  const canEditProducts = userRole === 'admin' || userRole === 'staff';

  const formattedPrice = formatCurrency(product.price);

  const stockStatusLabel = {
    in_stock: 'In Stock',
    out_of_stock: 'Out of Stock',
    pre_order: 'Pre-Order',
  }[product.stock_status];

  const stockStatusColor = {
    in_stock: 'bg-green-100 text-green-800',
    out_of_stock: 'bg-red-100 text-red-800',
    pre_order: 'bg-blue-100 text-blue-800',
  }[product.stock_status];

  // Transform product for the edit modal (add missing fields with defaults)
  const editableProduct = {
    id: product.id,
    sku: product.slug, // Using slug as SKU since that's the current pattern
    name: product.name,
    slug: product.slug,
    description: product.description,
    price: product.price,
    stock_status: product.stock_status,
    is_featured: product.is_featured,
    images: product.images,
    brand_id: product.brand_id,
    brand_name: product.brand?.name ?? null,
    brand_slug: product.brand?.slug ?? null,
    created_at: product.created_at,
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <ProductViewTracker productId={product.id} />
      {/* Breadcrumb */}
      <nav className="mb-6">
        <Link
          href="/products"
          className="inline-flex items-center text-sm text-zinc-700 hover:text-zinc-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Products
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Product Images */}
        <ProductImageCarousel
          images={product.images || []}
          productName={product.name}
        />

        {/* Product Info */}
        <div className="space-y-6">
          {product.brand && (
            <Link
              href={`/products?brand=${product.brand.slug}`}
              className="text-sm text-zinc-700 hover:text-zinc-900"
            >
              {product.brand.name}
            </Link>
          )}

          <div className="flex items-start justify-between gap-4">
            <h1 className="text-3xl font-bold text-zinc-900">{product.name}</h1>
            {canEditProducts && (
              <ProductAdminEdit product={editableProduct} />
            )}
          </div>

          <div className="flex items-center gap-4">
            <span className="text-3xl font-bold text-zinc-900">
              {formattedPrice}
            </span>
            <Badge className={stockStatusColor}>{stockStatusLabel}</Badge>
          </div>

          {product.description && (
            <p className="text-zinc-700">{product.description}</p>
          )}

          {/* Add to Cart */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <AddToCartButton
              product={product}
              preorderGroup={preorderData.preorderGroup}
              preorderBatches={preorderData.preorderBatches}
              isPickupOnly={preorderData.isPickupOnly}
            />
          </div>

          {/* Product Details */}
          <div className="border-t pt-6">
            <h2 className="mb-4 font-semibold text-zinc-900">Product Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-700">SKU</dt>
                <dd className="font-medium text-zinc-900">{product.slug}</dd>
              </div>
              {product.brand && (
                <div className="flex justify-between">
                  <dt className="text-zinc-700">Brand</dt>
                  <dd className="font-medium text-zinc-900">{product.brand.name}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-zinc-700">Availability</dt>
                <dd className="font-medium text-zinc-900">{stockStatusLabel}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Related Products for Pet Type */}
      {relatedByPetType && (
        <section className="mt-12 border-t pt-8">
          <h2 className="mb-6 text-xl font-semibold text-zinc-900">
            More Products for {relatedByPetType.petTypeName}s
          </h2>
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
            {relatedByPetType.products.map((relatedProduct) => (
              <ProductCard key={relatedProduct.id} product={relatedProduct} />
            ))}
          </div>
        </section>
      )}

      {/* Customer Reviews */}
      <section className="mt-12 border-t pt-8">
        <h2 className="mb-6 text-xl font-semibold text-zinc-900">
          Customer Reviews
        </h2>
        <ProductReviews reviews={reviews} stats={reviewStats} />
        <div className="mt-8">
          <ReviewSubmissionForm
            productId={product.id}
            productSlug={product.slug}
            isLoggedIn={isLoggedIn}
            hasAlreadyReviewed={hasReviewed}
          />
        </div>
      </section>

      {/* Questions & Answers */}
      <section className="mt-12 border-t pt-8">
        <h2 className="mb-6 text-xl font-semibold text-zinc-900">
          Questions & Answers
        </h2>
        <ProductQA
          productId={product.id}
          productSlug={product.slug}
          questions={questions}
          isLoggedIn={isLoggedIn}
        />
      </section>

      {/* Recently Viewed */}
      {recentlyViewed.length > 0 && (
        <section className="mt-12 border-t pt-8">
          <RecentlyViewedSection products={recentlyViewed} />
        </section>
      )}
    </div>
  );
}
