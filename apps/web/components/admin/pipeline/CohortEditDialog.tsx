"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Edit2, Layers } from "lucide-react";
import { CohortBrandPicker } from "../cohorts/CohortBrandPicker";
import { BrandModal } from "../brands/BrandModal";
import type { Brand } from "@/lib/types";

interface CohortEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cohortId: string;
  initialName: string | null;
  initialBrandName: string | null;
  initialBrandId?: string | null;
  initialBrand?: Brand | null;
  onSuccess: () => void;
}

export function CohortEditDialog({
  open,
  onOpenChange,
  cohortId,
  initialName,
  initialBrandName,
  initialBrandId,
  initialBrand,
  onSuccess,
}: CohortEditDialogProps) {
  const [name, setName] = useState(initialName || "");
  const [brandName, setBrandName] = useState(initialBrandName || "");
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(initialBrand || null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditingBrand, setIsEditingBrand] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName || "");
      setBrandName(initialBrandName || "");
      setSelectedBrand(initialBrand || null);
    }
  }, [open, initialName, initialBrandName, initialBrand]);

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/admin/cohorts/${cohortId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          brand_id: selectedBrand?.id || null,
          brand_name: selectedBrand ? null : (brandName.trim() || null),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update batch");
      }

      toast.success("Batch updated successfully");
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update batch");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open && !isEditingBrand} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px] border border-border rounded-none p-0 bg-card">
          <DialogHeader className="p-6 border-b border-border bg-muted">
            <div className="flex items-center gap-4">
              <div className="p-2 border border-border bg-card">
                <Layers className="h-6 w-6 text-foreground" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-semibold text-foreground">
                  Edit Batch
                </DialogTitle>
                <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">
                  Update the human-readable name and brand for this batch.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-6 space-y-8">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-xs font-semibold text-foreground">Batch Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. KONG Classic Dog Toy"
                disabled={isLoading}
                className="rounded-none border border-border focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0 h-10"
              />
            </div>
            
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-foreground">Brand Selection</Label>
                {selectedBrand && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={() => setIsEditingBrand(true)}
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Edit Settings
                  </Button>
                )}
              </div>
              <CohortBrandPicker
                value={selectedBrand}
                onAssign={async (brand) => setSelectedBrand(brand)}
                triggerClassName="w-full h-10 rounded-none border border-border focus:ring-0"
                emptyLabel="Select Brand from Registry"
              />
              <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight italic">
                Enables official domain tracking for the scraper.
              </p>
            </div>

            {!selectedBrand && (
              <div className="p-4 border border-dashed border-border bg-muted">
                <div className="grid gap-2">
                  <Label htmlFor="brand" className="text-[10px] font-semibold text-muted-foreground">Manual Brand Name Fallback</Label>
                  <Input
                    id="brand"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g. KONG"
                    disabled={isLoading}
                    className="rounded-none border border-border focus-visible:ring-0 focus-visible:border-border focus-visible:ring-offset-0 text-muted-foreground h-9 bg-card"
                  />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase leading-tight italic">
                    Only used if no brand is selected from the registry above.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="p-6 border-t border-border flex-col sm:flex-row gap-4 bg-muted">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="rounded-none border border-border font-semibold hover:bg-card transition-all order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isLoading}
              className="rounded-none bg-foreground hover:bg-foreground/90 text-background font-semibold transition-all order-1 sm:order-2 min-w-[140px]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isEditingBrand && selectedBrand && (
        <BrandModal
          brand={selectedBrand}
          onClose={() => setIsEditingBrand(false)}
          onSave={(updatedBrand) => {
            if (updatedBrand) {
              setSelectedBrand(updatedBrand);
              onSuccess();
            }
          }}
        />
      )}
    </>
  );
}
