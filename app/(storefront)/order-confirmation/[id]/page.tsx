import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CheckCircle, Clock, MapPin, Mail, Truck, Package } from 'lucide-react';
import { getOrderById } from '@/lib/orders';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface OrderConfirmationPageProps {
  params: Promise<{ id: string }>;
}

export default async function OrderConfirmationPage({
  params,
}: OrderConfirmationPageProps) {
  const { id } = await params;
  const order = await getOrderById(id);

  if (!order) {
    notFound();
  }

  // SECURITY: Verify order ownership for authenticated users
  // Guest orders (no user_id) are accessible via the order ID in URL
  // Authenticated users can only view their own orders
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (order.user_id && user?.id !== order.user_id) {
    // Order belongs to a different user
    notFound();
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

  const isDelivery = order.fulfillment_method === 'delivery';
  const hasPreorderItems = order.items?.some((item) => item.preorder_batch_id);

  return (
    <div className="w-full px-4 py-8">
      <div className="mx-auto max-w-2xl text-center">
        {/* Success Icon */}
        <div className="mb-6 inline-flex items-center justify-center rounded-full bg-green-100 p-4">
          <CheckCircle className="h-12 w-12 text-green-600" />
        </div>

        <h1 className="mb-2 text-3xl font-bold text-zinc-900">
          Order Confirmed!
        </h1>
        <p className="mb-2 text-lg text-zinc-700">
          Thank you for your order, {order.customer_name.split(' ')[0]}!
        </p>
        <p className="mb-8 text-2xl font-semibold text-zinc-900">
          Order #{order.order_number}
        </p>

        {/* Order Details Card */}
        <Card className="mb-8 text-left">
          <CardContent className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">
              Order Summary
            </h2>

            {/* Items */}
            <ul className="divide-y">
              {order.items?.map((item) => (
                <li key={item.id} className="flex justify-between py-3">
                  <div>
                    <p className="font-medium text-zinc-900">{item.item_name}</p>
                    <p className="text-sm text-zinc-700">
                      Qty: {item.quantity} × {formatCurrency(item.unit_price)}
                    </p>
                    {item.preorder_batch_id && (
                      <p className="text-xs text-blue-600 mt-1">
                        Pre-order item
                      </p>
                    )}
                  </div>
                  <p className="font-medium text-zinc-900">
                    {formatCurrency(item.total_price)}
                  </p>
                </li>
              ))}
            </ul>

            {/* Totals */}
            <div className="mt-4 space-y-2 border-t pt-4">
              <div className="flex justify-between text-sm">
                <span className="text-zinc-700">Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount</span>
                  <span>-{formatCurrency(order.discount_amount)}</span>
                </div>
              )}
              {isDelivery && order.delivery_fee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-700">Delivery</span>
                  <span>{formatCurrency(order.delivery_fee)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-zinc-700">Tax</span>
                <span>{formatCurrency(order.tax)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-lg font-semibold">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Fulfillment Details */}
        <Card className="mb-8 text-left">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {isDelivery ? (
                <>
                  <Truck className="h-5 w-5" />
                  Delivery Details
                </>
              ) : (
                <>
                  <Package className="h-5 w-5" />
                  Pickup Details
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {isDelivery ? (
              <div className="space-y-4">
                <div>
                  <p className="font-medium text-zinc-900">Delivery Address</p>
                  <p className="text-sm text-zinc-700 mt-1">
                    Your order will be delivered to the address provided.
                  </p>
                </div>
                {order.delivery_distance_miles !== null && (
                  <div>
                    <p className="text-sm text-zinc-600">
                      Distance: {order.delivery_distance_miles.toFixed(1)} miles
                    </p>
                  </div>
                )}
                {order.delivery_services && order.delivery_services.length > 0 && (
                  <div>
                    <p className="font-medium text-zinc-900">Delivery Services</p>
                    <ul className="mt-1 space-y-1">
                      {order.delivery_services.map((service) => (
                        <li key={service.service} className="text-sm text-zinc-700">
                          • {service.service.replace(/_/g, ' ')} (+{formatCurrency(service.fee)})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {order.delivery_notes && (
                  <div>
                    <p className="font-medium text-zinc-900">Delivery Notes</p>
                    <p className="text-sm text-zinc-700 mt-1">{order.delivery_notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-zinc-900">Pickup Location</p>
                    <p className="text-sm text-zinc-700">
                      429 Winthrop Street, Taunton, MA 02780
                    </p>
                  </div>
                </div>
                <p className="text-sm text-zinc-700">
                  We&apos;ll email you when your order is ready for pickup.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* What's Next */}
        <Card className="mb-8 text-left">
          <CardContent className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">
              What&apos;s Next?
            </h2>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-medium text-zinc-900">Confirmation Email</p>
                  <p className="text-sm text-zinc-700">
                    We&apos;ve sent a confirmation to {order.customer_email}
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 text-blue-500" />
                <div>
                  <p className="font-medium text-zinc-900">Order Processing</p>
                  <p className="text-sm text-zinc-700">
                    {hasPreorderItems
                      ? 'This is a pre-order. We&apos;ll prepare your order and email you with updates on when it will be ready.'
                      : 'We&apos;ll prepare your order and email you when it\'s ready'}
                  </p>
                </div>
              </li>
              {!isDelivery && (
                <li className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-zinc-900">Pickup</p>
                    <p className="text-sm text-zinc-700">
                      Pick up at 429 Winthrop Street, Taunton, MA 02780
                    </p>
                  </div>
                </li>
              )}
            </ul>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Button size="lg" asChild>
            <Link href="/products">Continue Shopping</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
