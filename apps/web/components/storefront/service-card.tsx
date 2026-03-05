import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { type Service } from '@/lib/data';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

interface ServiceCardProps {
  service: Service;
}

/**
 * ServiceCard - Displays a service in grid layouts.
 * Distinguished from product cards with "Reserve" action.
 */
export function ServiceCard({ service }: ServiceCardProps) {
  const formattedPrice = service.price
    ? formatCurrency(service.price)
    : 'Contact for pricing';

  return (
    <Link href={`/services/${service.slug}`} className="block h-full">
      <Card className="group h-full cursor-pointer border-2 border-dashed border-zinc-300 bg-zinc-50 transition-all hover:border-zinc-400 hover:shadow-lg">
          <CardContent className="flex h-full flex-col gap-4 p-4">
            {/* Service Badge */}
            <div>
              <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-none">
                Service
              </Badge>
            </div>

            {/* Service Info */}
            <div className="flex flex-1 flex-col gap-2">
              <h3 className="mb-0 text-sm font-medium text-zinc-900 group-hover:text-zinc-700 group-hover:underline underline-offset-4">
                {service.name}
              </h3>
              {service.description && (
                <p className="mb-0 line-clamp-2 text-xs text-zinc-700">
                  {service.description}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between gap-2">
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
                className="mt-1 w-full group-hover:bg-blue-50"
              >
                Reserve
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
      </Card>
    </Link>
  );
}
