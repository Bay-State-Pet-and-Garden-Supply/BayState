'use client';

import { useState } from 'react';
import { Calendar, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCartStore } from '@/lib/cart-store';
import { type Service } from '@/lib/data';

interface AddServiceToCartButtonProps {
  service: Service;
}

/**
 * AddServiceToCartButton - Button to add services to cart with feedback.
 */
export function AddServiceToCartButton({ service }: AddServiceToCartButtonProps) {
  const [isAdded, setIsAdded] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const handleAddToCart = () => {
    addItem({
      id: `service-${service.id}`,
      name: `${service.name} (Service)`,
      slug: `services/${service.slug}`,
      price: service.price || 0,
      imageUrl: null,
    });

    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
  };

  if (!service.price) {
    return (
      <Button size="lg" className="h-14 flex-1 text-lg" asChild>
        <a href="tel:+15551234567">
          <Calendar className="mr-2 h-5 w-5" />
          Call to Reserve
        </a>
      </Button>
    );
  }

  return (
    <Button
      size="lg"
      className="h-14 flex-1 text-lg bg-blue-600 hover:bg-blue-700"
      onClick={handleAddToCart}
      disabled={isAdded}
    >
      {isAdded ? (
        <>
          <Check className="mr-2 h-5 w-5" />
          Added to Cart
        </>
      ) : (
        <>
          <Calendar className="mr-2 h-5 w-5" />
          Reserve Now
        </>
      )}
    </Button>
  );
}
