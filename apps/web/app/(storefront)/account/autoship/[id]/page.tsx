import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Calendar, Package, Pause, Play, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import {
  getSubscriptionById,
  getSubscriptionSuggestions,
  FREQUENCY_LABELS,
} from '@/lib/subscriptions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

interface AutoshipDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AutoshipDetailPage({
  params,
}: AutoshipDetailPageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const subscription = await getSubscriptionById(id, user.id);

  if (!subscription) {
    notFound();
  }

  const suggestions = await getSubscriptionSuggestions(id, user.id);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-zinc-100 text-zinc-800';
    }
  };

  const subtotal =
    subscription.items?.reduce(
      (sum, item) => sum + (item.product?.price || 0) * item.quantity,
      0
    ) || 0;

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
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">
              {subscription.name}
            </h1>
            <p className="text-sm text-zinc-600">
              {FREQUENCY_LABELS[subscription.frequency]}
            </p>
          </div>
          <Badge className={getStatusColor(subscription.status)}>
            {subscription.status.charAt(0).toUpperCase() +
              subscription.status.slice(1)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Items in This Autoship</CardTitle>
            </CardHeader>
            <CardContent>
              {subscription.items && subscription.items.length > 0 ? (
                <ul className="divide-y">
                  {subscription.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between py-4"
                    >
                      <div className="flex items-center gap-4">
                        {item.product?.images?.[0] && (
                          <Image
                            src={item.product.images[0] as string}
                            alt={item.product?.name || ''}
                            width={64}
                            height={64}
                            className="h-16 w-16 rounded-lg object-cover"
                          />
                        )}
                        <div>
                          <Link
                            href={`/products/${item.product?.slug}`}
                            className="font-medium text-zinc-900 hover:underline"
                          >
                            {item.product?.name}
                          </Link>
                          <p className="text-sm text-zinc-600">
                            Qty: {item.quantity} ×{' '}
                            {formatCurrency(item.product?.price || 0)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-semibold">
                          {formatCurrency(
                            (item.product?.price || 0) * item.quantity
                          )}
                        </span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Remove item from autoship">
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-zinc-600">
                  No items in this autoship yet.
                </p>
              )}
            </CardContent>
          </Card>

          {suggestions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Suggested Products</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {suggestions.map((suggestion) => (
                    <div
                      key={suggestion.id}
                      className="rounded-lg border p-3 text-center"
                    >
                      {suggestion.product?.images?.[0] && (
                        <Image
                          src={suggestion.product.images[0] as string}
                          alt={suggestion.product?.name || ''}
                          width={80}
                          height={80}
                          className="mx-auto mb-2 h-20 w-20 rounded object-cover"
                        />
                      )}
                      <p className="text-xs font-medium text-zinc-900 line-clamp-2">
                        {suggestion.product?.name}
                      </p>
                      <p className="text-sm font-bold text-green-700">
                        {formatCurrency(suggestion.product?.price || 0)}
                      </p>
                      {suggestion.petName && (
                        <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                          For {suggestion.petName}
                        </span>
                      )}
                      <Button size="sm" className="mt-2 w-full">
                        Add to Autoship
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-zinc-600" />
                <div>
                  <p className="text-sm text-zinc-600">Next Order</p>
                  <p className="font-medium text-zinc-900">
                    {formatDate(subscription.next_order_date)}
                  </p>
                </div>
              </div>
              {subscription.last_order_date && (
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-zinc-600" />
                  <div>
                    <p className="text-sm text-zinc-600">Last Order</p>
                    <p className="font-medium text-zinc-900">
                      {formatDate(subscription.last_order_date)}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600">
                  {subscription.items?.length || 0} items
                </span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600">Est. Tax</span>
                <span>{formatCurrency(subtotal * 0.0625)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                <span>Total per Order</span>
                <span>{formatCurrency(subtotal * 1.0625)}</span>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {subscription.status === 'active' ? (
              <Button variant="outline" className="w-full">
                <Pause className="mr-2 h-4 w-4" />
                Pause Autoship
              </Button>
            ) : subscription.status === 'paused' ? (
              <Button className="w-full">
                <Play className="mr-2 h-4 w-4" />
                Resume Autoship
              </Button>
            ) : null}
            <Button variant="ghost" className="w-full text-red-600">
              Cancel Autoship
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
