import { notFound } from 'next/navigation';
import { Fragment } from 'react';
import { Home, ShieldCheck, Info } from 'lucide-react';
import Link from 'next/link';
import { type Metadata } from 'next';
import { getProductBySlug, getProductGroupBySlug } from '@/lib/products';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AddToCartButton } from '@/components/storefront/add-to-cart-button';
import { ProductImageCarousel } from '@/components/storefront/product-image-carousel';
import { ProductAdminEdit } from '@/components/storefront/product-admin-edit';
import { ProductCard } from '@/components/storefront/product-card';
import { ProductReviews } from '@/components/storefront/product-reviews';
import { ReviewSubmissionForm } from '@/components/storefront/review-submission-form';
import { ProductQA } from '@/components/storefront/product-qa';
import { RecentlyViewedSection } from '@/components/storefront/recently-viewed-section';
import { ProductViewTracker } from '@/components/storefront/product-view-tracker';
import { ProductSizeSelector } from '@/components/storefront/product-size-selector';
import { createClient } from '@/lib/supabase/server';
import { getUserRole } from '@/lib/auth/roles';
import { getRelatedProductsByPetType } from '@/lib/recommendations';
import { getApprovedReviews, getProductReviewStats, hasUserReviewedProduct } from '@/lib/storefront/reviews';
import { getProductQuestions } from '@/lib/storefront/questions';
import { getRecentlyViewedProducts } from '@/lib/storefront/recently-viewed';
import { getProductPreorderData } from '@/lib/storefront/preorder';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/lib/types';
import { getNavCategories } from '@/lib/data';

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sku?: string }>;
}

/**
 * Generate dynamic metadata for SEO.
 */
export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { group, members, defaultMember } = await getProductGroupBySlug(slug);

  if (group) {
    // Group page - use group name and default product's data
    const defaultProduct = members.find(m => m.member.product_id === defaultMember?.product_id)?.product 
      || members[0]?.product;

    if (!defaultProduct) {
      return {
        title: 'Product Group | Bay State Pet & Garden',
      };
    }

    const description = defaultProduct.description
      ? defaultProduct.description.slice(0, 160)
      : `Shop ${group.name} at Bay State Pet & Garden Supply.`;

    return {
      title: `${group.name} | Bay State Pet & Garden`,
      description,
      openGraph: {
        title: group.name,
        description,
        images: defaultProduct.images?.[0] ? [{ url: defaultProduct.images[0] }] : undefined,
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: group.name,
        description,
        images: defaultProduct.images?.[0] ? [defaultProduct.images[0]] : undefined,
      },
    };
  }

  // Fallback to single product (backwards compatibility)
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
 * Supports Amazon-style product grouping with ?sku= selection.
 */
export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const { slug } = await params;
  const { sku } = await searchParams;

  // Fetch product group first
  const { group, members, defaultMember } = await getProductGroupBySlug(slug);

  let product: Product | null = null;
  let isGroupPage = false;

  if (group && members.length > 0) {
    // This is a group page
    isGroupPage = true;

    // Determine which product to show based on ?sku= param
    if (sku) {
      const selectedMember = members.find(m => m.member.product_id === sku);
      if (selectedMember) {
        product = selectedMember.product;
      } else {
        // Invalid SKU param, fall back to default
        product = defaultMember 
          ? members.find(m => m.member.product_id === defaultMember.product_id)?.product || null
          : members[0]?.product || null;
      }
    } else {
      // No SKU param, use default or first member
      product = defaultMember 
        ? members.find(m => m.member.product_id === defaultMember.product_id)?.product || null
        : members[0]?.product || null;
    }

    if (!product) {
      notFound();
    }
  } else {
    // Not a group page, use single product (backwards compatibility)
    product = await getProductBySlug(slug);
  }

  if (!product) {
    notFound();
  }

  // Fetch additional data in parallel
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [userRole, relatedByPetType, reviews, reviewStats, questions, recentlyViewed, hasReviewed, preorderData, navCategories] = await Promise.all([
    user ? getUserRole(user.id) : null,
    getRelatedProductsByPetType(product.id, 4),
    getApprovedReviews(product.id),
    getProductReviewStats(product.id),
    getProductQuestions(product.id),
    getRecentlyViewedProducts(product.id, 6),
    hasUserReviewedProduct(product.id),
    getProductPreorderData(product.id),
    getNavCategories(),
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

  const categoryById = new Map(navCategories.map((category) => [category.id, category]));
  const primaryCategoryTrail: Array<{
    id: string;
    name: string;
    slug: string;
  }> = [];

  if (product.primary_category) {
    let currentCategory = categoryById.get(product.primary_category.id);

    while (currentCategory) {
      primaryCategoryTrail.unshift({
        id: currentCategory.id,
        name: currentCategory.name,
        slug: currentCategory.slug,
      });

      currentCategory = currentCategory.parent_id
        ? categoryById.get(currentCategory.parent_id)
        : undefined;
    }
  }

  // Transform product for the edit modal (add missing fields with defaults)
  const editableProduct = {
    id: product.id,
    sku: product.sku ?? product.slug,
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
    <div className="container mx-auto px-4 pt-4 pb-8">
      <ProductViewTracker productId={product.id} />

      {/* Breadcrumb Navigation */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">
              <Home className="h-4 w-4" />
              <span className="sr-only">Home</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/products">Products</BreadcrumbLink>
          </BreadcrumbItem>
          {primaryCategoryTrail.map((category) => (
            <Fragment key={category.id}>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/products?category=${category.slug}`} className="capitalize">
                  {category.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </Fragment>
          ))}
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium">
              {isGroupPage ? group?.name : product.name}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Product Images */}
        <ProductImageCarousel
          images={product.images || []}
          productName={product.name}
        />

        {/* Product Info */}
        <div className="space-y-6">
          <div className="space-y-2">
            {product.brand && (
              <Link
                href={`/products?brand=${product.brand.slug}`}
                className="text-sm font-bold uppercase tracking-widest text-primary hover:underline"
              >
                {product.brand.name}
              </Link>
            )}

            <div className="flex items-start justify-between gap-4">
              <h1 className="text-3xl font-extrabold text-zinc-900 leading-tight">
                {isGroupPage ? group?.name : product.name}
              </h1>
              {canEditProducts && (
                <ProductAdminEdit product={editableProduct} />
              )}
            </div>
            
            {/* Trust Badges & Microdata */}
            <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Satisfaction Guaranteed
              </span>
              <span>•</span>
              <span>Item #{product.sku || product.slug}</span>
              {product.gtin && (
                <>
                  <span>•</span>
                  <span>GTIN: {product.gtin}</span>
                </>
              )}
            </div>
          </div>

          {/* Product Group Size Selector */}
          {isGroupPage && group && members.length > 1 && (
            <ProductSizeSelector
              group={group}
              members={members}
              selectedProductId={product.id}
              basePath={`/products/${slug}`}
            />
          )}

          {/* Pricing & Stock Action Box */}
          <div className="rounded-lg border border-zinc-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-zinc-900">{formattedPrice}</h3>
              {(product.stock_status !== 'out_of_stock' || !product.is_special_order) && (
                <Badge className={`${stockStatusColor} text-sm px-3 py-1`}>
                  {stockStatusLabel}
                </Badge>
              )}
            </div>
            
            <div className="space-y-3 mb-6">
              <p className="text-sm text-zinc-500">Standard delivery or in-store pickup available.</p>
            </div>

            {/* Urgency & Fulfillment Badges */}
            <div className="flex flex-col gap-2 mb-6 text-sm">
              {product.quantity !== undefined && product.quantity > 0 && product.quantity <= (product.low_stock_threshold || 5) && (
                <p className="text-orange-600 font-medium flex items-center gap-1.5">
                  <Info className="h-4 w-4" />
                  Only {product.quantity} left in stock - order soon.
                </p>
              )}
              {product.minimum_quantity !== undefined && product.minimum_quantity !== null && product.minimum_quantity > 1 && (
                <p className="text-zinc-600">
                  Minimum order quantity: {product.minimum_quantity}
                </p>
              )}
              {product.pickup_only && (
                <p className="text-yellow-700 font-medium bg-yellow-50 px-2 py-1 rounded-sm w-fit">
                  Available for In-Store Pickup Only
                </p>
              )}
              {product.is_special_order && (
                <p className="text-purple-700 font-medium bg-purple-50 px-2 py-1 rounded-sm w-fit">
                  Special Order Item - Extra fulfillment time required
                </p>
              )}
            </div>

            {/* Add to Cart */}
            <div className="flex flex-col gap-4 sm:flex-row">
              <AddToCartButton
                product={product}
                preorderGroup={preorderData.preorderGroup}
                preorderBatches={preorderData.preorderBatches}
                isPickupOnly={preorderData.isPickupOnly}
              />
            </div>
          </div>

          {/* Product Description */}
          {product.description && (
            <p className="text-base leading-relaxed text-zinc-700">
              {product.description}
            </p>
          )}

          {/* Expanded Product Details */}
          <div className="border-t pt-6">
            <h2 className="mb-4 text-xl font-bold text-zinc-900">Product Details</h2>
            <dl className="space-y-3 text-sm">
              <div className="grid grid-cols-3 border-b border-zinc-100 pb-2">
                <dt className="text-zinc-500">Item Number</dt>
                <dd className="font-medium text-zinc-900 col-span-2">{product.slug}</dd>
              </div>
              {product.brand && (
                <div className="grid grid-cols-3 border-b border-zinc-100 pb-2">
                  <dt className="text-zinc-500">Brand</dt>
                  <dd className="font-medium text-zinc-900 col-span-2">{product.brand.name}</dd>
                </div>
              )}
              {product.weight !== null && product.weight !== undefined && (
                <div className="grid grid-cols-3 border-b border-zinc-100 pb-2">
                  <dt className="text-zinc-500">Weight</dt>
                  <dd className="font-medium text-zinc-900 col-span-2">{product.weight} lbs</dd>
                </div>
              )}

            </dl>
          </div>
          
          {/* Long Description (Rich Text) */}
          {product.long_description && (
            <div className="border-t pt-6 prose prose-sm max-w-none text-zinc-700">
              <div dangerouslySetInnerHTML={{ __html: product.long_description }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
