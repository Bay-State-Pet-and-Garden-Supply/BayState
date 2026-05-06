"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
        <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground">
          Product Info
        </h3>
        <Separator className="h-1 bg-foreground" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product-name" className="text-[10px] font-black uppercase tracking-widest text-foreground">Product Name</Label>
        <Input
          id="product-name"
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="e.g. Life Protection Formula Adult Chicken & Brown Rice Recipe 30 lb."
          className="h-8 border border-border rounded-none focus-visible:ring-primary font-black text-xs"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="product-price" className="text-[10px] font-black uppercase tracking-widest text-foreground">Price</Label>
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
            className="h-8 border border-border rounded-none focus-visible:ring-primary font-black tabular-nums text-xs"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="product-weight" className="text-[10px] font-black uppercase tracking-widest text-foreground">Weight (lbs)</Label>
          <Input
            id="product-weight"
            value={formData.weight}
            onChange={(e) =>
              handleInputChange("weight", e.target.value)
            }
            placeholder="e.g. 30"
            className="h-8 border border-border rounded-none focus-visible:ring-primary font-black tabular-nums text-xs"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product-description" className="text-[10px] font-black uppercase tracking-widest text-foreground">Description</Label>
        <Textarea
          id="product-description"
          value={formData.description}
          onChange={(e) => handleInputChange("description", e.target.value)}
          placeholder="Storefront product description..."
          rows={3}
          className="border border-border rounded-none focus-visible:ring-primary font-black text-xs resize-y min-h-[60px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product-long-description" className="text-[10px] font-black uppercase tracking-widest text-foreground">Long Description</Label>
        <Textarea
          id="product-long-description"
          value={formData.longDescription}
          onChange={(e) => handleInputChange("longDescription", e.target.value)}
          placeholder="Extended product description (optional)..."
          rows={4}
          className="border border-border rounded-none focus-visible:ring-primary font-black text-xs resize-y min-h-[80px]"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="product-search-keywords" className="text-[10px] font-black uppercase tracking-widest text-foreground">Search Keywords</Label>
        <Input
          id="product-search-keywords"
          value={formData.searchKeywords}
          onChange={(e) => handleInputChange("searchKeywords", e.target.value)}
          placeholder="e.g. dog food, chicken recipe, large breed"
          className="h-8 border border-border rounded-none focus-visible:ring-primary font-black text-xs"
        />
      </div>
    </div>
  );
}
