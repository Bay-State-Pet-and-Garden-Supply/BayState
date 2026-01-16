'use client';

import { useState } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createPromoCodeAction, updatePromoCodeAction, deletePromoCodeAction } from './actions';
import type { PromoCode } from '@/lib/promo-codes';

interface PromotionsClientProps {
  initialPromoCodes: PromoCode[];
}

export function PromotionsClient({ initialPromoCodes }: PromotionsClientProps) {
  const [promoCodes, setPromoCodes] = useState(initialPromoCodes);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreate = async (formData: FormData) => {
    const result = await createPromoCodeAction(formData);
    if (result.success) {
      setIsDialogOpen(false);
      window.location.reload();
    }
  };

  const handleToggleActive = async (id: string, currentState: boolean) => {
    const formData = new FormData();
    formData.set('isActive', currentState ? '' : 'on');
    await updatePromoCodeAction(id, formData);
    setPromoCodes(codes =>
      codes.map(c => c.id === id ? { ...c, is_active: !currentState } : c)
    );
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promo code?')) return;
    await deletePromoCodeAction(id);
    setPromoCodes(codes => codes.filter(c => c.id !== id));
  };

  const getDiscountDisplay = (promo: PromoCode) => {
    switch (promo.discount_type) {
      case 'percentage':
        return `${promo.discount_value}% off`;
      case 'fixed_amount':
        return `${formatCurrency(promo.discount_value)} off`;
      case 'free_shipping':
        return 'Free shipping';
      default:
        return '-';
    }
  };

  const getStatusBadge = (promo: PromoCode) => {
    const now = new Date();
    const expiresAt = promo.expires_at ? new Date(promo.expires_at) : null;
    const isExpired = expiresAt && now > expiresAt;
    const isMaxedOut = promo.max_uses && promo.current_uses >= promo.max_uses;

    if (!promo.is_active) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    if (isExpired) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    if (isMaxedOut) {
      return <Badge variant="secondary">Maxed Out</Badge>;
    }
    return <Badge className="bg-green-100 text-green-800">Active</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {promoCodes.length} promo code{promoCodes.length !== 1 ? 's' : ''}
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Promo Code
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Promo Code</DialogTitle>
            </DialogHeader>
            <form action={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="code">
                    Code <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <Input
                    id="code"
                    name="code"
                    placeholder="SUMMER20"
                    className="uppercase"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discountType">
                    Discount Type <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <Select name="discountType" defaultValue="percentage">
                    <SelectTrigger id="discountType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage</SelectItem>
                      <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                      <SelectItem value="free_shipping">Free Shipping</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  name="description"
                  placeholder="Summer sale - 20% off everything"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="discountValue">
                    Discount Value <span className="text-destructive" aria-hidden="true">*</span>
                  </Label>
                  <Input
                    id="discountValue"
                    name="discountValue"
                    type="number"
                    step="0.01"
                    placeholder="20"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="minimumOrder">Minimum Order ($)</Label>
                  <Input
                    id="minimumOrder"
                    name="minimumOrder"
                    type="number"
                    step="0.01"
                    placeholder="0"
                    defaultValue="0"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="maxUses">Max Total Uses</Label>
                  <Input
                    id="maxUses"
                    name="maxUses"
                    type="number"
                    placeholder="Unlimited"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxUsesPerUser">Uses Per Customer</Label>
                  <Input
                    id="maxUsesPerUser"
                    name="maxUsesPerUser"
                    type="number"
                    placeholder="1"
                    defaultValue="1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expiresAt">Expiration Date</Label>
                <Input
                  id="expiresAt"
                  name="expiresAt"
                  type="datetime-local"
                />
              </div>

              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    id="firstOrderOnly" 
                    name="firstOrderOnly" 
                    className="rounded" 
                  />
                  <span className="text-sm">First order only</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    id="requiresAccount" 
                    name="requiresAccount" 
                    className="rounded" 
                  />
                  <span className="text-sm">Requires account</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Code</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Min. Order</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promoCodes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-600">
                  No promo codes yet. Create your first one!
                </TableCell>
              </TableRow>
            ) : (
              promoCodes.map((promo) => (
                <TableRow key={promo.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-gray-100 px-2 py-1 text-sm font-mono">
                        {promo.code}
                      </code>
                      <button
                        onClick={() => copyCode(promo.code)}
                        className="text-gray-600 hover:text-gray-600"
                      >
                        {copiedCode === promo.code ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    {promo.description && (
                      <p className="mt-1 text-xs text-gray-600">{promo.description}</p>
                    )}
                  </TableCell>
                  <TableCell>{getDiscountDisplay(promo)}</TableCell>
                  <TableCell>
                    {promo.minimum_order > 0 ? formatCurrency(promo.minimum_order) : '-'}
                  </TableCell>
                  <TableCell>
                    {promo.current_uses}
                    {promo.max_uses ? ` / ${promo.max_uses}` : ''}
                  </TableCell>
                  <TableCell>
                    {promo.expires_at ? formatDate(promo.expires_at) : 'Never'}
                  </TableCell>
                  <TableCell>{getStatusBadge(promo)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleToggleActive(promo.id, promo.is_active)}
                        className="text-gray-600 hover:text-gray-600"
                        title={promo.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {promo.is_active ? (
                          <ToggleRight className="h-5 w-5 text-green-500" />
                        ) : (
                          <ToggleLeft className="h-5 w-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(promo.id)}
                        className="text-gray-600 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
