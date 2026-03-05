'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { CheckoutUserData } from '@/lib/types';

interface CheckoutContactFormProps {
  userData?: CheckoutUserData | null;
}

export function CheckoutContactForm({ userData }: CheckoutContactFormProps) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-xl font-semibold">Contact Information</h2>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name *</Label>
            <Input
              id="name"
              name="name"
              placeholder="John Smith"
              required
              className="h-12"
              defaultValue={userData?.fullName || ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email Address *</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="john@example.com"
              required
              className="h-12"
              defaultValue={userData?.email || ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
              className="h-12"
              defaultValue={userData?.phone || ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Order Notes (optional)</Label>
            <Textarea
              id="notes"
              name="notes"
              placeholder="Any special instructions..."
              className="min-h-[80px]"
              aria-describedby="order-notes-help"
            />
            <p id="order-notes-help" className="text-sm text-muted-foreground">
              Additional details about your order.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
