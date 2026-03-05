'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Plus, Minus, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  images: string[];
  petTypeName?: string;
}

interface SelectedItem {
  productId: string;
  product: Product;
  quantity: number;
}

export default function NewAutoshipPage() {
  const router = useRouter();
  const [name, setName] = useState('My Autoship');
  const [frequency, setFrequency] = useState('monthly');
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [suggestedProducts, setSuggestedProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);

  useEffect(() => {
    async function fetchSuggestions() {
      try {
        const res = await fetch('/api/account/autoship/suggestions');
        if (res.ok) {
          const data = await res.json();
          setSuggestedProducts(data.products || []);
        }
      } catch (err) {
        console.error('Failed to fetch suggestions:', err);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }
    fetchSuggestions();
  }, []);

  const addItem = (product: Product) => {
    const existing = selectedItems.find((i) => i.productId === product.id);
    if (existing) {
      setSelectedItems(
        selectedItems.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setSelectedItems([
        ...selectedItems,
        { productId: product.id, product, quantity: 1 },
      ]);
    }
  };

  const updateQuantity = (productId: string, delta: number) => {
    setSelectedItems(
      selectedItems
        .map((i) =>
          i.productId === productId
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/account/autoship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          frequency,
          items: selectedItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/account/autoship/${data.subscription.id}`);
      }
    } catch (err) {
      console.error('Failed to create subscription:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const subtotal = selectedItems.reduce(
    (sum, i) => sum + i.product.price * i.quantity,
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/account/autoship"
          className="mb-4 inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Autoship
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900">Create Autoship</h1>
        <p className="text-sm text-zinc-600">
          Set up a recurring order with your pet's favorite products
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Autoship Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Max's Monthly Food"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="frequency">Delivery Frequency</Label>
              <Select value={frequency} onValueChange={setFrequency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Every Week</SelectItem>
                  <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                  <SelectItem value="monthly">Every Month</SelectItem>
                  <SelectItem value="bimonthly">Every 2 Months</SelectItem>
                  <SelectItem value="quarterly">Every 3 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Suggested for Your Pets
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
              </div>
            ) : suggestedProducts.length === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-600">
                Add pets to your profile to get personalized suggestions!
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {suggestedProducts.map((product) => {
                  const isSelected = selectedItems.some(
                    (i) => i.productId === product.id
                  );
                  return (
                    <div
                      key={product.id}
                      className={`relative rounded-lg border p-3 transition-colors ${
                        isSelected
                          ? 'border-green-500 bg-green-50'
                          : 'hover:border-zinc-300'
                      }`}
                    >
                      {product.images[0] && (
                        <Image
                          src={product.images[0]}
                          alt={product.name}
                          width={120}
                          height={120}
                          className="mx-auto mb-2 h-24 w-24 rounded object-cover"
                        />
                      )}
                      <p className="text-xs font-medium text-zinc-900 line-clamp-2">
                        {product.name}
                      </p>
                      <p className="text-sm font-bold text-green-700">
                        {formatCurrency(product.price)}
                      </p>
                      {product.petTypeName && (
                        <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          For {product.petTypeName}s
                        </span>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant={isSelected ? 'secondary' : 'default'}
                        className="mt-2 w-full"
                        onClick={() => addItem(product)}
                      >
                        {isSelected ? 'Added' : 'Add'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Your Autoship Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {selectedItems.map((item) => (
                  <li
                    key={item.productId}
                    className="flex items-center justify-between py-3"
                  >
                    <div className="flex items-center gap-3">
                      {item.product.images[0] && (
                        <Image
                          src={item.product.images[0]}
                          alt={item.product.name}
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded object-cover"
                        />
                      )}
                      <div>
                        <p className="font-medium text-zinc-900">
                          {item.product.name}
                        </p>
                        <p className="text-sm text-zinc-600">
                          {formatCurrency(item.product.price)} each
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Decrease quantity"
                        onClick={() => updateQuantity(item.productId, -1)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        aria-label="Increase quantity"
                        onClick={() => updateQuantity(item.productId, 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex items-center justify-between border-t pt-4 text-lg font-semibold">
                <span>Estimated Total per Order</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={selectedItems.length === 0 || isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Creating...
            </>
          ) : (
            'Create Autoship'
          )}
        </Button>
      </form>
    </div>
  );
}
