import { notFound } from 'next/navigation';
import { Clock, MapPin, Phone, Calendar, Home } from 'lucide-react';
import { getServiceBySlug } from '@/lib/services';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AddServiceToCartButton } from '@/components/storefront/add-service-to-cart-button';
import { formatCurrency } from '@/lib/utils';

interface ServiceDetailPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Service detail page with reservation functionality.
 */
export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);

  if (!service) {
    notFound();
  }

  const formattedPrice = service.price
    ? formatCurrency(service.price)
    : null;

  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
      {/* Breadcrumb Navigation */}
      <Breadcrumb className="mb-6">
        <BreadcrumbItem>
          <BreadcrumbLink href="/">
            <Home className="h-4 w-4" />
            <span className="sr-only">Home</span>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="/services">Services</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbPage className="font-medium">{service.name}</BreadcrumbPage>
      </Breadcrumb>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Service Image/Icon Placeholder */}
        <div className="flex aspect-square items-center justify-center rounded-xl bg-gradient-to-br from-blue-100 to-blue-200">
          <div className="text-center">
            <Badge className="mb-4 bg-blue-600">Service</Badge>
            <h2 className="text-2xl font-bold text-blue-900">{service.name}</h2>
          </div>
        </div>

        {/* Service Info */}
        <div className="space-y-6">
          <div>
            <Badge variant="outline" className="mb-4">
              Local Service
            </Badge>
            <h1 className="text-3xl font-bold text-zinc-900">{service.name}</h1>
          </div>

          {/* Price */}
          <div className="flex items-baseline gap-2">
            {formattedPrice ? (
              <>
                <span className="text-3xl font-bold text-zinc-900">
                  {formattedPrice}
                </span>
                {service.unit && (
                  <span className="text-lg text-zinc-700">/{service.unit}</span>
                )}
              </>
            ) : (
              <span className="text-xl text-zinc-700">Contact for pricing</span>
            )}
          </div>

          {/* Description */}
          {service.description && (
            <p className="text-lg text-zinc-700">{service.description}</p>
          )}

          {/* Reserve Button */}
          <div className="flex flex-col gap-4 sm:flex-row">
            <AddServiceToCartButton service={service} />
          </div>

          {/* Service Details */}
          <div className="border-t pt-6">
            <h2 className="mb-4 font-semibold text-zinc-900">How It Works</h2>
            <ul className="space-y-3 text-sm text-zinc-700">
              <li className="flex items-start gap-3">
                <Calendar className="mt-0.5 h-5 w-5 text-blue-500" />
                <span>Reserve online or walk in during business hours</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-blue-500" />
                <span>Visit our store at 429 Winthrop Street, Taunton MA</span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 text-blue-500" />
                <span>Most services completed same-day</span>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5 text-blue-500" />
                <span>Questions? Call us at (508) 821-3704</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
