import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { type Service } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface ServiceCardProps {
  service: Service;
}

/**
 * ServiceCard - Displays a service in grid layouts.
 * Distinguished from product cards with "Reserve" action.
 */
export function ServiceCard({ service }: ServiceCardProps) {
  const formattedPrice = service.price
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(service.price)
    : 'Contact for pricing';

  return (
    <Link href={`/services/${service.slug}`}>
      <Card className="group h-full cursor-pointer border-2 border-dashed border-zinc-300 bg-zinc-50 transition-all hover:border-zinc-400 hover:shadow-lg">
        <CardContent className="flex h-full flex-col p-4">
          {/* Service Badge */}
          <div className="mb-3">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
              Service
            </span>
          </div>

          {/* Service Info */}
          <div className="flex flex-1 flex-col">
            <h3 className="mb-2 text-sm font-medium text-zinc-900 group-hover:text-zinc-700">
              {service.name}
            </h3>
            {service.description && (
              <p className="mb-3 line-clamp-2 text-xs text-zinc-700">
                {service.description}
              </p>
            )}
            <div className="mt-auto flex items-center justify-between">
              <span className="text-lg font-semibold text-zinc-900">
                {formattedPrice}
                {service.unit && (
                  <span className="text-sm font-normal text-zinc-700">
                    /{service.unit}
                  </span>
                )}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full group-hover:bg-blue-50"
            >
              Reserve
              <ArrowRight className="ml-2 h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
