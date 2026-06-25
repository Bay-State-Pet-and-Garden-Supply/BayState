'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { BrandPicker } from '@/components/admin/brands/BrandPicker';
import type { Brand } from '@/lib/types';
import { Loader2, Tag } from 'lucide-react';

interface BulkAssignBrandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: (brandId: string | null) => Promise<void>;
}

export function BulkAssignBrandDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
}: BulkAssignBrandDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAssign = async (brand: Brand | null) => {
    setIsSubmitting(true);
    try {
      await onConfirm(brand?.id ?? null);
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] border border-border p-0 bg-card rounded-none shadow-xl">
        <DialogHeader className="p-6 border-b-4 border-border bg-muted">
          <div className="flex items-center gap-4">
            <div className="p-2 border-2 border-border bg-card shadow-sm">
              <Tag className="h-6 w-6 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-2xl font-semibold text-foreground">Assign Brand</DialogTitle>
              <DialogDescription className="text-xs font-semibold text-muted-foreground mt-1">
                Assigning brand to {selectedCount} product{selectedCount !== 1 ? 's' : ''}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        
        <div className="p-6">
          <p className="mb-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select target brand:</p>
          <BrandPicker
            value={null}
            onAssign={handleAssign}
            triggerClassName="w-full justify-between py-6"
            emptyLabel="Select Brand..."
          />
        </div>

        <DialogFooter className="bg-muted p-4 border-t border-border mt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-none border border-transparent hover:border-border font-bold uppercase text-xs"
          >
            Cancel
          </Button>
        </DialogFooter>

        {isSubmitting && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-brand-forest-green" />
              <p className="text-xs font-bold uppercase">Processing...</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
