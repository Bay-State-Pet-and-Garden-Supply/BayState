'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Package, Info, Truck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { DELIVERY_SERVICE_OPTIONS, type DeliveryServiceType } from '@/lib/types';
import { getDeliveryQuote, type DeliveryFeeBreakdown } from '@/lib/storefront/delivery';
import { formatCurrency, cn } from '@/lib/utils';

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

  const calculateDeliveryQuote = useCallback(async () => {
    const fullAddress = `${deliveryAddress.street}, ${deliveryAddress.city}, ${deliveryAddress.state} ${deliveryAddress.zip}`;
    if (!fullAddress.trim() || !deliveryAddress.zip || deliveryAddress.zip.length < 5) {
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

  useEffect(() => {
    const timer = setTimeout(calculateDeliveryQuote, 500);
    return () => clearTimeout(timer);
  }, [calculateDeliveryQuote]);

  const isLoading = localLoadingQuote || loadingQuote;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="space-y-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          Delivery Details
        </h3>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="street" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Street Address *</Label>
            <Input
              id="street"
              placeholder="123 Main St"
              value={deliveryAddress.street}
              onChange={(e) => onAddressChange('street', e.target.value)}
              className="h-12 rounded-lg"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="city" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">City *</Label>
              <Input
                id="city"
                placeholder="Worcester"
                value={deliveryAddress.city}
                onChange={(e) => onAddressChange('city', e.target.value)}
                className="h-12 rounded-lg"
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="state" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">State</Label>
              <Input
                id="state"
                placeholder="MA"
                value={deliveryAddress.state}
                onChange={(e) => onAddressChange('state', e.target.value)}
                className="h-12 rounded-lg"
              />
            </div>
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="zip" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ZIP Code *</Label>
              <Input
                id="zip"
                placeholder="01602"
                value={deliveryAddress.zip}
                onChange={(e) => onAddressChange('zip', e.target.value)}
                className="h-12 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg text-sm font-medium">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Calculating delivery costs for your location...
        </div>
      )}

      {deliveryQuote && !isLoading && (
        <div className={cn(
          "rounded-xl border-2 p-5 transition-all",
          deliveryQuote.available 
            ? "border-green-200 bg-green-50/50 shadow-sm shadow-green-100" 
            : "border-red-200 bg-red-50/50"
        )}>
          {deliveryQuote.available ? (
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 flex items-center justify-center rounded-full bg-green-100 text-green-600 flex-shrink-0">
                <Truck className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-green-900">Delivery Available</span>
                  <span className="font-bold text-green-900 text-lg">{formatCurrency(deliveryQuote.fee)}</span>
                </div>
                <p className="text-sm text-green-700">
                  Estimated distance: {deliveryQuote.distanceMiles.toFixed(1)} miles
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 flex items-center justify-center rounded-full bg-red-100 text-red-600 flex-shrink-0">
                <Info className="h-6 w-6" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-red-900">Delivery Restricted</p>
                <p className="text-sm text-red-700">
                  {deliveryQuote.formatted || 'Delivery is not available to this address. Please choose Store Pickup.'}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {deliveryQuote?.available && (
        <div className="space-y-4">
          <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Additional Services</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DELIVERY_SERVICE_OPTIONS.map((option) => (
              <div 
                key={option.service} 
                onClick={() => onServiceToggle(option.service)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                  selectedServices.has(option.service) 
                    ? "border-primary bg-primary/5 ring-1 ring-primary" 
                    : "border-border hover:bg-muted/30"
                )}
              >
                <Checkbox
                  id={`service-${option.service}`}
                  checked={selectedServices.has(option.service)}
                  onCheckedChange={() => onServiceToggle(option.service)}
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p className="text-[10px] text-muted-foreground">+{formatCurrency(option.fee)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="delivery_notes" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Delivery Instructions</Label>
        <Textarea
          id="delivery_notes"
          value={deliveryNotes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Gate code, drop-off location, etc."
          className="min-h-[100px] rounded-lg p-4"
        />
      </div>
    </div>
  );
}
