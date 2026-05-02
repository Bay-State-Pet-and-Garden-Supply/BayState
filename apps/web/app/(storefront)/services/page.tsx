import Link from "next/link";
import { ArrowRight, Wrench, DollarSign } from "lucide-react";
import { getAllActiveServices } from "@/lib/services";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/utils";
import { Home } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/**
 * Services listing page for customers.
 */
export default async function ServicesPage() {
  const services = await getAllActiveServices();

  return (
    <div className="container mx-auto px-4 pt-4 pb-8">
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
            <BreadcrumbPage className="font-medium">Services</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Hero Section */}
      <section className="mb-12 text-center">
        <div className="mb-4 inline-flex items-center justify-center rounded-full bg-[oklch(92%_0.03_160)] p-4">
          <Wrench className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground">
          Local Services
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          From propane refills to equipment rentals, we offer a range of
          services to help you get the job done. Stop by or reserve online.
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
                  <Card className="group h-full cursor-pointer border border-dashed border-[oklch(85%_0.03_160)] bg-[oklch(96%_0.01_90)] transition-all hover:border-[oklch(70%_0.04_160)] hover:bg-card hover:shadow-md">
                    <CardContent className="flex h-full min-h-[240px] flex-col p-6">
                      {/* Service Badge */}
                      <div className="mb-4">
                        <Badge className="bg-[oklch(92%_0.03_160)] text-primary hover:bg-[oklch(88%_0.04_160)] border-none">
                          <Wrench className="mr-1.5 h-3.5 w-3.5" />
                          Service
                        </Badge>
                      </div>

                      {/* Service Info */}
                      <h2 className="mb-2 text-xl font-semibold text-foreground group-hover:text-primary">
                        {service.name}
                      </h2>
                      {service.description && (
                        <p className="mb-4 flex-1 text-sm text-muted-foreground line-clamp-3">
                          {service.description}
                        </p>
                      )}

                      {/* Price & CTA */}
                      <div className="mt-auto flex items-center justify-between">
                        <div className="flex items-center gap-1 text-lg font-semibold text-foreground">
                          {formattedPrice ? (
                            <>
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              {formattedPrice}
                              {service.unit && (
                                <span className="text-sm font-normal text-muted-foreground">
                                  /{service.unit}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-base text-muted-foreground">
                              Contact for pricing
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="group-hover:bg-[oklch(96%_0.01_90)]"
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
          <EmptyState
            icon={Wrench}
            title="No services available"
            description="Check back soon for our service offerings"
            actionLabel="Contact Us"
            actionHref="/contact"
          />
        )}
      </section>

      {/* Contact CTA */}
      <section className="mt-12 rounded-sm bg-primary p-8 text-center text-primary-foreground">
        <h2 className="mb-4 text-2xl font-semibold">Need Something Custom?</h2>
        <p className="mx-auto mb-6 max-w-xl text-primary-foreground/90">
          Don&apos;t see what you&apos;re looking for? Give us a call and
          we&apos;ll see how we can help.
        </p>
        <Button size="lg" className="h-12 px-8 bg-[oklch(72%_0.14_85)] text-[oklch(25%_0.02_90)] hover:bg-[oklch(65%_0.14_85)] font-semibold tracking-wide" asChild>
          <a href="tel:+15551234567">Call Us: (555) 123-4567</a>
        </Button>
      </section>
    </div>
  );
}
