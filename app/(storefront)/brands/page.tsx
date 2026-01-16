import { getBrands } from '@/lib/data';
import { Metadata } from 'next';
import { BrandsClient } from './brands-client';

export const metadata: Metadata = {
  title: 'Our Brands | Bay State Pet & Garden Supply',
  description: 'Shop top pet and garden brands at Bay State Pet & Garden Supply. High quality products for your pets and garden.',
};

export default async function BrandsPage() {
  const brands = await getBrands();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary mb-2">Our Brands</h1>
        <h2 className="text-xl font-semibold text-zinc-700 mb-2">Browse Brands</h2>
        <p className="text-zinc-700">
          Browse our extensive collection of premium pet and garden brands.
        </p>
      </div>

      <BrandsClient brands={brands} />
    </div>
  );
}
