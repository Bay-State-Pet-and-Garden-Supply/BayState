import Link from 'next/link';
import { ArrowRight, Wrench, DollarSign } from 'lucide-react';
import { getAllActiveServices } from '@/lib/services';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

/**
 * Services listing page for customers.
 */
export default async function ServicesPage() {
  const services = await getAllActiveServices();

  return (
    <div className="w-full px-4 py-8">
      {/* Hero Section */}
      <section className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center justify-center rounded-full bg-blue-100 p-4">
          <Wrench className="h-8 w-8 text-blue-700" />
        </div>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-zinc-900">
          Local Services
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-zinc-700">
          From propane refills to equipment rentals, we offer a range of services
          to help you get the job done. Stop by or reserve online.
        </p>
      </section>

      {/* Services Grid */}
      <section>
        {services.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => {
              const formattedPrice = service.price
                ? formatCurrency(service.price)
                : null;

              return (
                <Link key={service.id} href={`/services/${service.slug}`}>
                  <Card className="group h-full cursor-pointer border-2 border-dashed border-zinc-200 bg-zinc-50 transition-all hover:border-blue-300 hover:bg-white hover:shadow-lg">
                    <CardContent className="flex h-full min-h-[240px] flex-col p-6">
                      {/* Service Badge */}
                      <div className="mb-4">
                        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200 border-none">
                          <Wrench className="mr-1.5 h-3.5 w-3.5" />
                          Service
                        </Badge>
                      </div>

                      {/* Service Info */}
                      <h2 className="mb-2 text-xl font-semibold text-zinc-900 group-hover:text-blue-700">
                        {service.name}
                      </h2>
                      {service.description && (
                        <p className="mb-4 flex-1 text-sm text-zinc-700 line-clamp-3">
                          {service.description}
                        </p>
                      )}

                      {/* Price & CTA */}
                      <div className="mt-auto flex items-center justify-between">
                        <div className="flex items-center gap-1 text-lg font-semibold text-zinc-900">
                          {formattedPrice ? (
                            <>
                              <DollarSign className="h-4 w-4 text-zinc-700" />
                              {formattedPrice}
                              {service.unit && (
                                <span className="text-sm font-normal text-zinc-700">
                                  /{service.unit}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-base text-zinc-700">
                              Contact for pricing
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="group-hover:bg-blue-50"
                        >
                          Reserve
                          <ArrowRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Wrench className="mb-4 h-16 w-16 text-zinc-300" />
            <p className="text-lg text-zinc-700">No services available</p>
            <p className="mt-2 text-sm text-zinc-700">
              Check back soon for our service offerings
            </p>
          </div>
        )}
      </section>

      {/* Contact CTA */}
      <section className="mt-12 rounded-xl bg-blue-600 p-8 text-center text-white">
        <h2 className="mb-4 text-2xl font-semibold">Need Something Custom?</h2>
        <p className="mx-auto mb-6 max-w-xl text-white">
          Don&apos;t see what you&apos;re looking for? Give us a call and we&apos;ll see how
          we can help.
        </p>
        <Button size="lg" variant="secondary" className="h-12 px-8" asChild>
          <a href="tel:+15551234567">Call Us: (555) 123-4567</a>
        </Button>
      </section>
    </div>
  );
}
