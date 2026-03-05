'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, X, Package, Palette, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import type { ProductVariant, ProductOption, ProductOptionValue } from '@/lib/types';
import {
  createProductOption,
  deleteProductOption,
  createOptionValue,
  deleteOptionValue,
  createProductVariant,
  updateProductVariant,
  deleteProductVariant,
} from '@/lib/admin/variants';
import { formatCurrency } from '@/lib/utils';

interface ProductVariantsClientProps {
  productId: string;
  productName: string;
  basePrice: number;
  initialVariants: ProductVariant[];
  initialOptions: ProductOption[];
}

export function ProductVariantsClient({
  productId,
  productName,
  basePrice,
  initialVariants,
  initialOptions,
}: ProductVariantsClientProps) {
  const router = useRouter();
  const [variants, setVariants] = useState(initialVariants);
  const [options, setOptions] = useState(initialOptions);
  
  const [showOptionDialog, setShowOptionDialog] = useState(false);
  const [newOptionName, setNewOptionName] = useState('');
  const [creatingOption, setCreatingOption] = useState(false);
  
  const [showValueInput, setShowValueInput] = useState<string | null>(null);
  const [newValueText, setNewValueText] = useState('');
  const [creatingValue, setCreatingValue] = useState(false);
  
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [editingVariant, setEditingVariant] = useState<ProductVariant | null>(null);
  const [variantForm, setVariantForm] = useState({
    sku: '',
    title: '',
    price: '',
    compare_at_price: '',
    quantity: '0',
    weight: '',
  });
  const [savingVariant, setSavingVariant] = useState(false);
  
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAddOption = async () => {
    if (!newOptionName.trim()) return;
    setCreatingOption(true);
    
    const result = await createProductOption(productId, newOptionName.trim());
    if (result.success && result.option) {
      setOptions([...options, { ...result.option, values: [] }]);
      toast.success('Option created');
      setNewOptionName('');
      setShowOptionDialog(false);
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to create option');
    }
    setCreatingOption(false);
  };

  const handleDeleteOption = async (optionId: string) => {
    setDeletingId(optionId);
    
    const result = await deleteProductOption(optionId);
    if (result.success) {
      setOptions(options.filter(o => o.id !== optionId));
      toast.success('Option deleted');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete option');
    }
    setDeletingId(null);
  };

  const handleAddValue = async (optionId: string) => {
    if (!newValueText.trim()) return;
    setCreatingValue(true);
    
    const result = await createOptionValue(optionId, newValueText.trim());
    if (result.success && result.value) {
      setOptions(options.map(opt => 
        opt.id === optionId 
          ? { ...opt, values: [...(opt.values || []), result.value!] }
          : opt
      ));
      toast.success('Value added');
      setNewValueText('');
      setShowValueInput(null);
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to add value');
    }
    setCreatingValue(false);
  };

  const handleDeleteValue = async (optionId: string, valueId: string) => {
    setDeletingId(valueId);
    
    const result = await deleteOptionValue(valueId);
    if (result.success) {
      setOptions(options.map(opt => 
        opt.id === optionId 
          ? { ...opt, values: (opt.values || []).filter(v => v.id !== valueId) }
          : opt
      ));
      toast.success('Value deleted');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete value');
    }
    setDeletingId(null);
  };

  const openVariantDialog = (variant?: ProductVariant) => {
    if (variant) {
      setEditingVariant(variant);
      setVariantForm({
        sku: variant.sku || '',
        title: variant.title || '',
        price: String(variant.price),
        compare_at_price: variant.compare_at_price ? String(variant.compare_at_price) : '',
        quantity: String(variant.quantity),
        weight: variant.weight ? String(variant.weight) : '',
      });
    } else {
      setEditingVariant(null);
      setVariantForm({
        sku: '',
        title: '',
        price: String(basePrice),
        compare_at_price: '',
        quantity: '0',
        weight: '',
      });
    }
    setShowVariantDialog(true);
  };

  const handleSaveVariant = async () => {
    const price = parseFloat(variantForm.price);
    if (isNaN(price) || price < 0) {
      toast.error('Please enter a valid price');
      return;
    }
    
    setSavingVariant(true);
    
    if (editingVariant) {
      const result = await updateProductVariant(editingVariant.id, {
        sku: variantForm.sku || null,
        title: variantForm.title || null,
        price,
        compare_at_price: variantForm.compare_at_price ? parseFloat(variantForm.compare_at_price) : null,
        quantity: parseInt(variantForm.quantity) || 0,
        weight: variantForm.weight ? parseFloat(variantForm.weight) : null,
      });
      
      if (result.success) {
        setVariants(variants.map(v => 
          v.id === editingVariant.id 
            ? { 
                ...v, 
                sku: variantForm.sku || null,
                title: variantForm.title || null,
                price, 
                compare_at_price: variantForm.compare_at_price ? parseFloat(variantForm.compare_at_price) : null,
                quantity: parseInt(variantForm.quantity) || 0,
                weight: variantForm.weight ? parseFloat(variantForm.weight) : null,
              }
            : v
        ));
        toast.success('Variant updated');
        setShowVariantDialog(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to update variant');
      }
    } else {
      const result = await createProductVariant(productId, {
        sku: variantForm.sku || undefined,
        title: variantForm.title || undefined,
        price,
        compare_at_price: variantForm.compare_at_price ? parseFloat(variantForm.compare_at_price) : undefined,
        quantity: parseInt(variantForm.quantity) || 0,
        weight: variantForm.weight ? parseFloat(variantForm.weight) : undefined,
      });
      
      if (result.success && result.variant) {
        setVariants([...variants, result.variant]);
        toast.success('Variant created');
        setShowVariantDialog(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to create variant');
      }
    }
    
    setSavingVariant(false);
  };

  const handleDeleteVariant = async (variantId: string) => {
    setDeletingId(variantId);
    
    const result = await deleteProductVariant(variantId);
    if (result.success) {
      setVariants(variants.filter(v => v.id !== variantId));
      toast.success('Variant deleted');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete variant');
    }
    setDeletingId(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Product Options
            </CardTitle>
            <CardDescription>Define options like Size, Color, or Flavor</CardDescription>
          </div>
          <Button onClick={() => setShowOptionDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Option
          </Button>
        </CardHeader>
        <CardContent>
          {options.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No options defined. Add options like Size or Color to create variants.
            </p>
          ) : (
            <div className="space-y-4">
              {options.map(option => (
                <div key={option.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium">{option.name}</h4>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingId === option.id}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Option</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete the option &quot;{option.name}&quot; and all its values? This cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteOption(option.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(option.values || []).map(val => (
                      <Badge key={val.id} variant="secondary" className="flex items-center gap-1">
                        {val.color_hex && (
                          <span 
                            className="w-3 h-3 rounded-full border" 
                            style={{ backgroundColor: val.color_hex }}
                          />
                        )}
                        {val.value}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              disabled={deletingId === val.id}
                              className="ml-1 hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Value</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete &quot;{val.value}&quot;?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteValue(option.id, val.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </Badge>
                    ))}
                    {showValueInput === option.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={newValueText}
                          onChange={(e) => setNewValueText(e.target.value)}
                          placeholder="Value"
                          className="h-7 w-24 text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddValue(option.id)}
                          autoFocus
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => handleAddValue(option.id)}
                          disabled={creatingValue}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => { setShowValueInput(null); setNewValueText(''); }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => setShowValueInput(option.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Value
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Variants
            </CardTitle>
            <CardDescription>Manage purchasable product variants with their own SKU and inventory</CardDescription>
          </div>
          <Button onClick={() => openVariantDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Variant
          </Button>
        </CardHeader>
        <CardContent>
          {variants.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No variants created. Add variants for different sizes, colors, or configurations.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map(variant => (
                  <TableRow key={variant.id}>
                    <TableCell className="font-mono text-sm">{variant.sku || '-'}</TableCell>
                    <TableCell>{variant.title || 'Default'}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(variant.price)}
                      {variant.compare_at_price && variant.compare_at_price > variant.price && (
                        <span className="ml-2 text-muted-foreground line-through text-xs">
                          {formatCurrency(variant.compare_at_price)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={variant.quantity <= 0 ? 'text-destructive font-medium' : ''}>
                        {variant.quantity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openVariantDialog(variant)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={deletingId === variant.id}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Variant</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete this variant ({variant.title})? This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteVariant(variant.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showOptionDialog} onOpenChange={setShowOptionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Product Option</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="optionName">Option Name</Label>
              <Input
                id="optionName"
                value={newOptionName}
                onChange={(e) => setNewOptionName(e.target.value)}
                placeholder="e.g., Size, Color, Flavor"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOptionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddOption} disabled={creatingOption || !newOptionName.trim()}>
              {creatingOption ? 'Creating...' : 'Create Option'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showVariantDialog} onOpenChange={setShowVariantDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVariant ? 'Edit Variant' : 'Add Variant'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variantSku">SKU</Label>
                <Input
                  id="variantSku"
                  value={variantForm.sku}
                  onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
                  placeholder="e.g., PROD-001-SM"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variantTitle">Title</Label>
                <Input
                  id="variantTitle"
                  value={variantForm.title}
                  onChange={(e) => setVariantForm({ ...variantForm, title: e.target.value })}
                  placeholder="e.g., Small / Red"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variantPrice">Price</Label>
                <Input
                  id="variantPrice"
                  type="number"
                  step="0.01"
                  value={variantForm.price}
                  onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variantComparePrice">Compare at Price</Label>
                <Input
                  id="variantComparePrice"
                  type="number"
                  step="0.01"
                  value={variantForm.compare_at_price}
                  onChange={(e) => setVariantForm({ ...variantForm, compare_at_price: e.target.value })}
                  placeholder="Original price"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variantQuantity">Quantity</Label>
                <Input
                  id="variantQuantity"
                  type="number"
                  value={variantForm.quantity}
                  onChange={(e) => setVariantForm({ ...variantForm, quantity: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variantWeight">Weight (lbs)</Label>
                <Input
                  id="variantWeight"
                  type="number"
                  step="0.01"
                  value={variantForm.weight}
                  onChange={(e) => setVariantForm({ ...variantForm, weight: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVariantDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveVariant} disabled={savingVariant}>
              {savingVariant ? 'Saving...' : editingVariant ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
