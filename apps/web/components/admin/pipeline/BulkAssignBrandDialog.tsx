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
import { Loader2 } from 'lucide-react';

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
      <DialogContent className="sm:max-w-[425px] rounded-none border-2 border-border shadow-xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold uppercase tracking-tight">Assign Brand</DialogTitle>
          <DialogDescription className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Assigning brand to {selectedCount} product{selectedCount !== 1 ? 's' : ''}.
            Products will appear under the selected brand group.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-6">
          <p className="mb-4 text-xs font-bold uppercase text-foreground">Select target brand:</p>
          <BrandPicker
            value={null}
            onAssign={handleAssign}
            triggerClassName="w-full justify-between py-6"
            emptyLabel="Select Brand..."
          />
        </div>

        <DialogFooter className="bg-muted -mx-6 -mb-6 p-4 border-t border-border mt-2">
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
