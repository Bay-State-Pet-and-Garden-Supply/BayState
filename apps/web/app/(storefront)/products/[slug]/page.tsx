import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Home, MapPin, Package, ShieldCheck, Truck } from 'lucide-react';
import type { Metadata } from 'next';
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
import { ProductViewTracker } from '@/components/storefront/product-view-tracker';
import { ProductSizeSelector } from '@/components/storefront/product-size-selector';
import { getProductBySlug, getProductGroupBySlug } from '@/lib/products';
import { getProductPreorderData } from '@/lib/storefront/preorder';
import { getNavCategories } from '@/lib/data';
import { getProductPetTypes } from '@/lib/storefront/pet-types';
import { formatCurrency } from '@/lib/utils';
import { getCategoryUrl, getBrandUrl } from '@/lib/urls';
import type { Product } from '@/lib/types';

interface ProductDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ sku?: string }>;
}

export async function generateMetadata({ params }: ProductDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { group, members, defaultMember } = await getProductGroupBySlug(slug);

  if (group) {
    const defaultProduct =
      members.find((m) => m.member.product_id === defaultMember?.product_id)?.product ||
      members[0]?.product;

    if (!defaultProduct) {
      return { title: 'Product Group | Bay State Pet & Garden' };
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
    };
  }

  const product = await getProductBySlug(slug);
  if (!product) {
    return { title: 'Product Not Found | Bay State Pet & Garden' };
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
  };
}

function FulfillmentNotice({
  pickupOnly,
  specialOrder,
}: {
  pickupOnly: boolean;
  specialOrder: boolean;
}) {
  if (specialOrder) {
    return (
      <div className="rounded-2xl border border-brand-burgundy/15 bg-brand-burgundy/5 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-burgundy/10 text-brand-burgundy">
            <Package className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Special order item</p>
            <p className="text-sm text-muted-foreground">
              This item needs extra time to fulfill. We will follow up about timing after
              you place the order.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (pickupOnly) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold text-foreground">Available for in-store pickup only</p>
            <p className="text-sm text-muted-foreground">
              This item is not eligible for delivery. Stop by the store at 429 Winthrop Street in
              Taunton to pick it up.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
          <Truck className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Local delivery available</p>
          <p className="text-sm text-muted-foreground">
            We deliver within 75 miles of our Taunton store. Pickup is also available at any time
            during store hours.
          </p>
        </div>
      </div>
    </div>
  );
}

function StockBadge({
  status,
  quantity,
  lowStockThreshold,
}: {
  status: string;
  quantity?: number | null;
  lowStockThreshold?: number | null;
}) {
  if (status === 'out_of_stock') {
    return <Badge variant="destructive">Out of stock</Badge>;
  }

  if (status === 'pre_order') {
    return <Badge variant="warning">Pre-order</Badge>;
  }

  if (status === 'low_stock' || (quantity != null && lowStockThreshold != null && quantity <= lowStockThreshold)) {
    return (
      <div className="space-y-1">
        <Badge variant="warning">Low stock</Badge>
        {quantity != null ? (
          <p className="text-xs text-muted-foreground">Only {quantity} left</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Badge variant="success">In stock</Badge>
      {quantity != null ? (
        <p className="text-xs text-muted-foreground">{quantity} available</p>
      ) : null}
    </div>
  );
}

export default async function ProductDetailPage({ params, searchParams }: ProductDetailPageProps) {
  const { slug } = await params;
  const { sku } = await searchParams;

  const { group, members, defaultMember } = await getProductGroupBySlug(slug);

  let product: Product | null = null;
  let isGroupPage = false;

  if (group && members.length > 0) {
    isGroupPage = true;

    if (sku) {
      const selectedMember = members.find((m) => m.member.product_id === sku);
      if (selectedMember) {
        product = selectedMember.product;
      } else {
        product = defaultMember
          ? members.find((m) => m.member.product_id === defaultMember.product_id)?.product || null
          : members[0]?.product || null;
      }
    } else {
      product = defaultMember
        ? members.find((m) => m.member.product_id === defaultMember.product_id)?.product || null
        : members[0]?.product || null;
    }

    if (!product) {
      notFound();
    }
  } else {
    product = await getProductBySlug(slug);
  }

  if (!product) {
    notFound();
  }

  const [preorderData, navCategories, petTypes] = await Promise.all([
    getProductPreorderData(product.id),
    getNavCategories(),
    getProductPetTypes(product.id),
  ]);

  const categoryById = new Map(navCategories.map((cat) => [cat.id, cat]));
  const primaryCategoryTrail: Array<{ id: string; name: string; slug: string }> = [];

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

  const pickupOnly = Boolean(product.pickup_only);
  const isSpecialOrder = Boolean(product.is_special_order);
  const formattedPrice = formatCurrency(product.price);

  return (
    <div className="container mx-auto px-4 pb-8 pt-4">
      <ProductViewTracker productId={product.id} />

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
                <BreadcrumbLink href={getCategoryUrl(category.slug)} className="capitalize">
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
        <ProductImageCarousel images={product.images || []} productName={product.name} />

        <div className="space-y-6">
          {product.brand ? (
            <Link
              href={getBrandUrl(product.brand.slug)}
              className="inline-flex text-sm font-semibold text-primary transition-colors hover:text-primary/80"
            >
              {product.brand.name}
            </Link>
          ) : null}

          <div className="space-y-3">
            <h1 className="text-2xl font-bold leading-tight text-foreground md:text-3xl">
              {isGroupPage ? group?.name : product.name}
            </h1>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-brand-forest-green" />
                Satisfaction guaranteed
              </span>
              <span>Item {product.sku || product.slug}</span>
              {product.gtin ? <span>GTIN {product.gtin}</span> : null}
            </div>
          </div>

          <FulfillmentNotice pickupOnly={pickupOnly} specialOrder={isSpecialOrder} />

          {isGroupPage && group && members.length > 1 ? (
            <ProductSizeSelector
              group={group}
              members={members}
              selectedProductId={product.id}
              basePath={`/products/${slug}`}
            />
          ) : null}

          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-2xl font-bold text-foreground tabular-nums">{formattedPrice}</p>
                {product.weight != null ? (
                  <p className="text-sm text-muted-foreground">{product.weight} lbs</p>
                ) : null}
              </div>

              <StockBadge
                status={product.stock_status}
                quantity={product.quantity}
                lowStockThreshold={product.low_stock_threshold}
              />
            </div>

            {product.minimum_quantity != null && product.minimum_quantity > 1 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Minimum order is {product.minimum_quantity} units.
              </p>
            ) : null}

            <div className="mt-5">
              <AddToCartButton
                product={{
                  id: product.id,
                  name: product.name,
                  slug: product.slug,
                  price: product.price,
                  images: product.images || undefined,
                  stock_status: product.stock_status as 'in_stock' | 'out_of_stock' | 'pre_order',
                }}
                preorderGroup={preorderData?.preorderGroup}
                preorderBatches={preorderData?.preorderBatches}
                isPickupOnly={pickupOnly}
              />
            </div>
          </div>

          {petTypes.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="mb-3 text-sm font-semibold text-foreground">For your</p>
              <div className="flex flex-wrap gap-2">
                {petTypes.map((pt) => (
                  <span
                    key={pt.id}
                    className="rounded-full border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground"
                  >
                    {pt.icon ? <span className="mr-1.5">{pt.icon}</span> : null}
                    {pt.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-12 border-t border-border pt-8">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-8">
            {product.description ? (
              <div>
                <h2 className="mb-4 text-xl font-semibold text-foreground">Description</h2>
                <div className="max-w-[72ch] space-y-3 text-sm leading-7 text-muted-foreground">
                  {product.description.split('\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <h2 className="mb-4 text-xl font-semibold text-foreground">Product details</h2>
              <dl className="divide-y divide-border">
                <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-3 text-sm">
                  <dt className="text-muted-foreground">Item number</dt>
                  <dd className="font-medium text-foreground">{product.sku || product.slug}</dd>
                </div>
                {product.brand ? (
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-3 text-sm">
                    <dt className="text-muted-foreground">Brand</dt>
                    <dd className="font-medium text-foreground">
                      <Link
                        href={getBrandUrl(product.brand.slug)}
                        className="text-primary hover:underline"
                      >
                        {product.brand.name}
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {product.weight != null ? (
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-3 text-sm">
                    <dt className="text-muted-foreground">Weight</dt>
                    <dd className="font-medium text-foreground">{product.weight} lbs</dd>
                  </div>
                ) : null}
                {product.gtin ? (
                  <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3 py-3 text-sm">
                    <dt className="text-muted-foreground">GTIN</dt>
                    <dd className="font-medium font-mono text-foreground">{product.gtin}</dd>
                  </div>
                ) : null}
              </dl>
            </div>


          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-4 text-sm font-semibold text-foreground">Fulfillment</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    Pick up in store at{' '}
                    <span className="font-medium text-foreground">429 Winthrop St., Taunton</span>
                  </span>
                </li>
                {!pickupOnly ? (
                  <li className="flex items-start gap-2.5">
                    <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>
                      Local delivery within 75 miles of Taunton.{' '}
                      <Link href="/shipping" className="text-primary hover:underline">
                        Learn more about delivery
                      </Link>
                    </span>
                  </li>
                ) : (
                  <li className="flex items-start gap-2.5">
                    <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span>Delivery is not available for this item.</span>
                  </li>
                )}
              </ul>
            </div>

            {petTypes.length > 0 ? (
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                  Suitable for these pets
                </h3>
                <div className="flex flex-wrap gap-2">
                  {petTypes.map((pt) => (
                    <span
                      key={pt.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-3 py-1.5 text-sm font-medium text-foreground"
                    >
                      {pt.icon ? <span>{pt.icon}</span> : null}
                      {pt.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="mb-2 text-sm font-semibold text-foreground">Store hours</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>Mon – Fri &nbsp;8:00am – 7:00pm</li>
                <li>Sat &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8:00am – 6:00pm</li>
                <li>Sun &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;8:00am – 5:00pm</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
