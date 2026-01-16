'use client';

import { useState } from 'react';
import { Loader2, Tag, X, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PromoCodeInputProps {
  subtotal: number;
  appliedCode: string | null;
  discount: number;
  discountType: 'percentage' | 'fixed_amount' | 'free_shipping' | null;
  onApply: (code: string) => Promise<{ success: boolean; error?: string; discount?: number }>;
  onRemove: () => void;
  className?: string;
}

export function PromoCodeInput({
  subtotal,
  appliedCode,
  discount,
  discountType,
  onApply,
  onRemove,
  className = '',
}: PromoCodeInputProps) {
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await onApply(code.trim());
      if (!result.success) {
        setError(result.error || 'Invalid promo code');
      } else {
        setCode('');
      }
    } catch {
      setError('Failed to apply promo code');
    } finally {
      setIsLoading(false);
    }
  };

  if (appliedCode) {
    return (
      <div className={`rounded-lg border border-green-200 bg-green-50 p-3 ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="font-medium text-green-800">
                Code <span className="font-mono">{appliedCode}</span> applied
              </p>
              <p className="text-sm text-green-600">
                {discountType === 'free_shipping'
                  ? 'Free shipping!'
                  : `You save ${formatCurrency(discount)}`}
              </p>
            </div>
          </div>
          <button
            onClick={onRemove}
            className="rounded-full p-1 text-green-600 hover:bg-green-100"
            aria-label="Remove promo code"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-700" />
          <Input
            type="text"
            placeholder="Promo code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            className="pl-9 uppercase"
            disabled={isLoading}
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={!code.trim() || isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Apply'
          )}
        </Button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
