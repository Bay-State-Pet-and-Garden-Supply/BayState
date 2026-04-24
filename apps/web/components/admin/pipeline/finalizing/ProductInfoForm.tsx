"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { FinalizationDraft } from "@/lib/pipeline/finalization-draft";

interface ProductInfoFormProps {
  formData: FinalizationDraft;
  handleInputChange: <K extends keyof FinalizationDraft>(field: K, value: FinalizationDraft[K]) => void;
  handleNameChange: (newName: string) => void;
}

export function ProductInfoForm({
  formData,
  handleInputChange,
  handleNameChange,
}: ProductInfoFormProps) {
  return (
    <div className="space-y-2 min-w-0">
      <div className="space-y-1">
        <h3 className="text-[10px] font-black uppercase tracking-tighter text-zinc-950">
          Product Info
        </h3>
        <Separator className="h-1 bg-zinc-950" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product-name" className="text-[10px] font-black uppercase tracking-tighter text-zinc-950">Product Name</Label>
        <Input
          id="product-name"
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g. Life Protection Formula Adult Chicken & Brown Rice Recipe 30 lb."
          className="h-8 border border-zinc-950 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)] focus-visible:ring-zinc-950 font-bold text-xs"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product-price" className="text-[10px] font-black uppercase tracking-tighter text-zinc-950">Price</Label>
          <Input
            id="product-price"
            type="number"
            min="0"
            step="0.01"
            value={formData.price}
            onChange={(e) =>
              handleInputChange("price", e.target.value)
            }
            placeholder="e.g. 24.99"
            className="h-8 border border-zinc-950 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)] focus-visible:ring-zinc-950 font-bold text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-weight" className="text-[10px] font-black uppercase tracking-tighter text-zinc-950">Weight (lbs)</Label>
          <Input
            id="product-weight"
            value={formData.weight}
            onChange={(e) =>
              handleInputChange("weight", e.target.value)
            }
            placeholder="e.g. 30"
            className="h-8 border border-zinc-950 rounded-none shadow-[1px_1px_0px_rgba(0,0,0,1)] focus-visible:ring-zinc-950 font-bold text-xs"
          />
        </div>
      </div>
    </div>
  );
}
