import Link from 'next/link';
import { Plus, Calendar, Package, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getUserSubscriptions, FREQUENCY_LABELS } from '@/lib/subscriptions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';

export default async function AutoshipPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const subscriptions = await getUserSubscriptions(user.id);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Autoship</h1>
          <p className="text-sm text-zinc-600">
            Set up recurring deliveries and never run out of pet essentials
          </p>
        </div>
        <Button asChild>
          <Link href="/account/autoship/new">
            <Plus className="mr-2 h-4 w-4" />
            New Autoship
          </Link>
        </Button>
      </div>

      {subscriptions.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title="No Autoship Subscriptions"
          description="Save time and money with automatic recurring orders. We'll suggest products based on your pets!"
          actionLabel="Create Your First Autoship"
          actionHref="/account/autoship/new"
          className="bg-white"
        />
      ) : (
        <div className="grid gap-4">
          {subscriptions.map((sub) => (
            <Card key={sub.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{sub.name}</CardTitle>
<p className="text-sm text-zinc-600">
                      {FREQUENCY_LABELS[sub.frequency]}
                    </p>
                  </div>
                  <Badge className={getStatusColor(sub.status)}>
                    {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 text-sm text-zinc-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Next order: {formatDate(sub.next_order_date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    <span>{sub.items?.length || 0} items</span>
                  </div>
                </div>

                {sub.items && sub.items.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {sub.items.slice(0, 4).map((item) => (
                      <Badge
                        key={item.id}
                        variant="secondary"
                        className="bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                      >
                        {item.product?.name || 'Product'} × {item.quantity}
                      </Badge>
                    ))}
                    {sub.items.length > 4 && (
                      <Badge variant="secondary" className="bg-zinc-100 text-zinc-600 hover:bg-zinc-200">
                        +{sub.items.length - 4} more
                      </Badge>
                    )}
                  </div>
                )}

                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/account/autoship/${sub.id}`}>
                      Manage
                    </Link>
                  </Button>
                  {sub.status === 'active' && (
                    <Button variant="ghost" size="sm">
                      Skip Next Order
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-green-200 bg-green-50">
        <CardContent className="py-4">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-green-100 p-2">
              <RefreshCw className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <h3 className="font-semibold text-green-900">
                Autoship Benefits
              </h3>
              <ul className="mt-1 text-sm text-green-700">
                <li>• Never run out of your pet's essentials</li>
                <li>• Personalized suggestions based on your pets</li>
                <li>• Easy to pause, skip, or modify anytime</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
