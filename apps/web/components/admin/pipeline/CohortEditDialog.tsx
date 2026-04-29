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
        <DialogContent className="sm:max-w-[425px] border-4 border-zinc-900 shadow-[12px_12px_0px_rgba(0,0,0,1)] rounded-none p-0 bg-white">
          <DialogHeader className="p-6 border-b-4 border-zinc-900 bg-zinc-50">
            <div className="flex items-center gap-4">
              <div className="p-2 border-2 border-zinc-900 bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                <Layers className="h-6 w-6 text-zinc-900" />
              </div>
              <div>
                <DialogTitle className="text-2xl font-black uppercase tracking-tighter text-zinc-900">
                  Edit Batch
                </DialogTitle>
                <DialogDescription className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mt-1">
                  Update the human-readable name and brand for this batch.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-6 space-y-8">
            <div className="grid gap-2">
              <Label htmlFor="name" className="text-xs font-black uppercase tracking-widest text-zinc-900">Batch Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. KONG Classic Dog Toy"
                disabled={isLoading}
                className="rounded-none border-2 border-zinc-900 focus-visible:ring-0 focus-visible:border-zinc-900 focus-visible:ring-offset-0 h-10"
              />
            </div>
            
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-black uppercase tracking-widest text-zinc-900">Brand Selection</Label>
                {selectedBrand && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] uppercase font-black tracking-tighter text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100"
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
                triggerClassName="w-full h-10 rounded-none border-2 border-zinc-900 focus:ring-0"
                emptyLabel="Select Brand from Registry"
              />
              <p className="text-[10px] font-bold text-zinc-500 uppercase leading-tight italic">
                Enables official domain tracking and fallback aliases for the scraper.
              </p>
            </div>

            {!selectedBrand && (
              <div className="p-4 border-2 border-dashed border-zinc-300 bg-zinc-50">
                <div className="grid gap-2">
                  <Label htmlFor="brand" className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Manual Brand Name Fallback</Label>
                  <Input
                    id="brand"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="e.g. KONG"
                    disabled={isLoading}
                    className="rounded-none border-2 border-zinc-200 focus-visible:ring-0 focus-visible:border-zinc-400 focus-visible:ring-offset-0 text-zinc-500 h-9 bg-white"
                  />
                  <p className="text-[10px] font-bold text-zinc-400 uppercase leading-tight italic">
                    Only used if no brand is selected from the registry above.
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="p-6 border-t-2 border-zinc-900 flex-col sm:flex-row gap-4 bg-zinc-50">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="rounded-none border-2 border-zinc-900 font-black uppercase tracking-tighter hover:bg-white transition-all order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave} 
              disabled={isLoading}
              className="rounded-none bg-zinc-900 hover:bg-zinc-800 text-white font-black uppercase tracking-tighter shadow-[4px_4px_0px_rgba(0,0,0,1)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all order-1 sm:order-2 min-w-[140px]"
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
