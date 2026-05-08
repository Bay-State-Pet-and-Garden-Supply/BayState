'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckoutUserData } from '@/lib/types';

interface CheckoutContactFormProps {
  userData?: CheckoutUserData | null;
}

export function CheckoutContactForm({ userData }: CheckoutContactFormProps) {
  return (
    <div className="space-y-6 max-w-2xl animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Full Name *</Label>
          <Input
            id="name"
            name="name"
            placeholder="John Smith"
            required
            className="h-12 rounded-lg"
            defaultValue={userData?.fullName || ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Phone Number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="(555) 123-4567"
            className="h-12 rounded-lg"
            defaultValue={userData?.phone || ''}
          />
        </div>
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email Address *</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="john@example.com"
          required
          className="h-12 rounded-lg"
          defaultValue={userData?.email || ''}
        />
        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mt-1">
          We&apos;ll send your order confirmation and updates here.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Order Notes (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Special instructions for our staff..."
          className="min-h-[100px] rounded-lg p-4"
        />
      </div>
    </div>
  );
}
