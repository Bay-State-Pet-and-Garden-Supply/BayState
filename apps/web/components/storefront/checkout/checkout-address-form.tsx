'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Package } from 'lucide-react';
import { DELIVERY_SERVICE_OPTIONS, type DeliveryServiceType } from '@/lib/types';
import { getDeliveryQuote, type DeliveryFeeBreakdown } from '@/lib/storefront/delivery';
import { formatCurrency } from '@/lib/utils';

interface DeliveryQuote {
  distanceMiles: number;
  fee: number;
  formatted: string;
  services: DeliveryServiceType[];
  available: boolean;
}

interface CheckoutAddressFormProps {
  deliveryAddress: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  onAddressChange: (field: string, value: string) => void;
  selectedServices: Set<DeliveryServiceType>;
  onServiceToggle: (service: DeliveryServiceType) => void;
  deliveryNotes: string;
  onNotesChange: (value: string) => void;
  onQuoteChange: (quote: DeliveryQuote | null) => void;
  deliveryQuote: DeliveryQuote | null;
  loadingQuote: boolean;
}

function mapBreakdownToQuote(breakdown: DeliveryFeeBreakdown): DeliveryQuote {
  return {
    distanceMiles: breakdown.distanceMiles,
    fee: breakdown.total,
    formatted: breakdown.isOutOfRange
      ? breakdown.outOfRangeMessage || 'Delivery not available'
      : breakdown.total === 0
      ? 'FREE'
      : `$${breakdown.total.toFixed(2)}`,
    services: [],
    available: !breakdown.isOutOfRange,
  };
}

export function CheckoutAddressForm({
  deliveryAddress,
  onAddressChange,
  selectedServices,
  onServiceToggle,
  deliveryNotes,
  onNotesChange,
  onQuoteChange,
  deliveryQuote,
  loadingQuote,
}: CheckoutAddressFormProps) {
  const [localLoadingQuote, setLocalLoadingQuote] = useState(false);

  // Calculate delivery quote when address changes
  const calculateDeliveryQuote = useCallback(async () => {
    const fullAddress = `${deliveryAddress.street}, ${deliveryAddress.city}, ${deliveryAddress.state} ${deliveryAddress.zip}`;
    if (!fullAddress.trim() || !deliveryAddress.zip) {
      onQuoteChange(null);
      return;
    }

    setLocalLoadingQuote(true);
    try {
      const breakdown = await getDeliveryQuote(fullAddress, Array.from(selectedServices));
      onQuoteChange(mapBreakdownToQuote(breakdown));
    } catch {
      onQuoteChange({
        distanceMiles: 0,
        fee: 0,
        formatted: 'Unable to calculate delivery',
        services: [],
        available: false,
      });
    } finally {
      setLocalLoadingQuote(false);
    }
  }, [deliveryAddress, selectedServices, onQuoteChange]);

  // Debounce delivery quote calculation
  useEffect(() => {
    const timer = setTimeout(calculateDeliveryQuote, 500);
    return () => clearTimeout(timer);
  }, [calculateDeliveryQuote]);

  const isLoading = localLoadingQuote || loadingQuote;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Delivery Address
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="street">Street Address *</Label>
          <Input
            id="street"
            placeholder="123 Main St"
            value={deliveryAddress.street}
            onChange={(e) => onAddressChange('street', e.target.value)}
            className="h-12"
            aria-describedby="street-help"
          />
          <p id="street-help" className="text-sm text-muted-foreground">
            Full street address including apartment/unit number.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="city">City *</Label>
            <Input
              id="city"
              placeholder="Worcester"
              value={deliveryAddress.city}
              onChange={(e) => onAddressChange('city', e.target.value)}
              className="h-12"
            />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="state">State</Label>
            <Input
              id="state"
              placeholder="MA"
              value={deliveryAddress.state}
              onChange={(e) => onAddressChange('state', e.target.value)}
              className="h-12"
            />
          </div>
          <div className="space-y-2 sm:col-span-1">
            <Label htmlFor="zip">ZIP Code *</Label>
            <Input
              id="zip"
              placeholder="01602"
              value={deliveryAddress.zip}
              onChange={(e) => onAddressChange('zip', e.target.value)}
              className="h-12"
            />
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-zinc-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Calculating delivery options...
          </div>
        )}

        {deliveryQuote && (
          <div className={`rounded-lg border p-4 ${deliveryQuote.available ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
            {deliveryQuote.available ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-green-800">Delivery Available</span>
                  <span className="font-bold text-green-800">{formatCurrency(deliveryQuote.fee)}</span>
                </div>
                <p className="text-sm text-green-700 mt-1">
                  {deliveryQuote.distanceMiles.toFixed(1)} miles from store
                </p>
              </>
            ) : (
              <p className="font-medium text-red-800">
                {deliveryQuote.formatted || 'Delivery not available to this address'}
              </p>
            )}
          </div>
        )}

        {deliveryQuote?.available && (
          <div className="space-y-3">
            <Label>Delivery Services (optional)</Label>
            {DELIVERY_SERVICE_OPTIONS.map((option) => (
              <div key={option.service} className="flex items-center space-x-3">
                <Checkbox
                  id={`service-${option.service}`}
                  checked={selectedServices.has(option.service)}
                  onCheckedChange={() => onServiceToggle(option.service)}
                />
                <Label htmlFor={`service-${option.service}`} className="text-sm cursor-pointer">
                  {option.label}
                </Label>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="delivery_notes">Delivery Notes</Label>
          <Textarea
            id="delivery_notes"
            value={deliveryNotes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Gate code, leave at door, etc."
            className="min-h-[80px]"
            aria-describedby="delivery-notes-help"
          />
          <p id="delivery-notes-help" className="text-sm text-muted-foreground">
            Optional instructions for the driver (e.g., gate code, drop-off location).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
