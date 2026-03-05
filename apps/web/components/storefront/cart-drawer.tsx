'use client';

import Link from 'next/link';
import { X, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { useCartStore, type CartItem } from '@/lib/cart-store';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * CartDrawer - Slide-out cart panel with item management.
 */
export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const items = useCartStore((state) => state.items);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clearCart);
  const subtotal = useCartStore((state) => state.getSubtotal());

  const formattedSubtotal = formatCurrency(subtotal);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-4">
            <h2 className="text-lg font-semibold">Shopping Cart</h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close cart">
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Cart Items */}
          {items.length > 0 ? (
            <>
              <div className="flex-1 overflow-y-auto p-4">
                <ul className="space-y-4">
                  {items.map((item) => (
                    <CartItemRow
                      key={item.id}
                      item={item}
                      onRemove={() => removeItem(item.id)}
                      onUpdateQuantity={(qty) => updateQuantity(item.id, qty)}
                    />
                  ))}
                </ul>
              </div>

              {/* Footer */}
              <div className="border-t p-4">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-zinc-700">Subtotal</span>
                  <span className="text-xl font-semibold">{formattedSubtotal}</span>
                </div>
                <Button className="w-full" size="lg" asChild>
                  <Link href="/checkout" onClick={onClose}>
                    Checkout
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  className="mt-2 w-full text-red-600 hover:text-red-700"
                  onClick={clearCart}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear Cart
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <ShoppingBag className="mb-4 h-16 w-16 text-secondary" />
              <h3 className="mb-2 text-lg font-medium text-zinc-900">
                Your cart is empty
              </h3>
              <p className="mb-6 text-sm text-zinc-700">
                Start shopping to add items to your cart
              </p>
              <Button asChild onClick={onClose}>
                <Link href="/products">Browse Products</Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CartItemRowProps {
  item: CartItem;
  onRemove: () => void;
  onUpdateQuantity: (quantity: number) => void;
}

function CartItemRow({ item, onRemove, onUpdateQuantity }: CartItemRowProps) {
  const formattedPrice = formatCurrency(item.price * item.quantity);

  return (
    <li className="flex gap-4">
      {/* Image */}
      <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-700">
            <ShoppingBag className="h-8 w-8" />
          </div>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col">
        <div className="flex justify-between">
          <Link
            href={`/products/${item.slug}`}
            className="font-medium text-zinc-900 hover:text-zinc-700 hover:underline underline-offset-4"
          >
            {item.name}
          </Link>
          <button
            onClick={onRemove}
            className="text-zinc-700 hover:text-red-600"
            aria-label="Remove item"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-auto flex items-center justify-between">
          {/* Quantity Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => onUpdateQuantity(item.quantity - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border hover:bg-zinc-50"
              aria-label="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-8 text-center font-medium">{item.quantity}</span>
            <button
              onClick={() => onUpdateQuantity(item.quantity + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border hover:bg-zinc-50"
              aria-label="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          {/* Price */}
          <span className="font-medium text-zinc-900">{formattedPrice}</span>
        </div>
      </div>
    </li>
  );
}
