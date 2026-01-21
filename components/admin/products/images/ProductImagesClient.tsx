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
import Image from 'next/image';
import { Plus, Trash2, Star, ImageIcon, ExternalLink, Edit2 } from 'lucide-react';
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
import { toast } from 'sonner';
import type { ProductImage } from '@/lib/types';
import {
  createProductImage,
  updateProductImage,
  deleteProductImage,
  setImageAsPrimary,
} from '@/lib/admin/images';

interface ProductImagesClientProps {
  productId: string;
  productName: string;
  initialImages: ProductImage[];
  legacyImages: string[] | null;
}

export function ProductImagesClient({
  productId,
  productName,
  initialImages,
  legacyImages,
}: ProductImagesClientProps) {
  const router = useRouter();
  const [images, setImages] = useState(initialImages);
  
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingImage, setEditingImage] = useState<ProductImage | null>(null);
  const [imageForm, setImageForm] = useState({
    url: '',
    alt_text: '',
  });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const openAddDialog = (image?: ProductImage) => {
    if (image) {
      setEditingImage(image);
      setImageForm({
        url: image.url,
        alt_text: image.alt_text || '',
      });
    } else {
      setEditingImage(null);
      setImageForm({ url: '', alt_text: '' });
    }
    setShowAddDialog(true);
  };

  const handleSaveImage = async () => {
    if (!imageForm.url.trim()) {
      toast.error('Please enter an image URL');
      return;
    }
    
    setSaving(true);
    
    if (editingImage) {
      const result = await updateProductImage(editingImage.id, {
        url: imageForm.url,
        alt_text: imageForm.alt_text || null,
      });
      
      if (result.success) {
        setImages(images.map(img => 
          img.id === editingImage.id 
            ? { ...img, url: imageForm.url, alt_text: imageForm.alt_text || null }
            : img
        ));
        toast.success('Image updated');
        setShowAddDialog(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to update image');
      }
    } else {
      const result = await createProductImage(productId, {
        url: imageForm.url,
        alt_text: imageForm.alt_text || undefined,
        is_primary: images.length === 0,
      });
      
      if (result.success && result.image) {
        setImages([...images, result.image]);
        toast.success('Image added');
        setShowAddDialog(false);
        router.refresh();
      } else {
        toast.error(result.error || 'Failed to add image');
      }
    }
    
    setSaving(false);
  };

  const handleDeleteImage = async (imageId: string) => {
    setDeletingId(imageId);
    
    const result = await deleteProductImage(imageId);
    if (result.success) {
      setImages(images.filter(img => img.id !== imageId));
      toast.success('Image deleted');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to delete image');
    }
    setDeletingId(null);
  };

  const handleSetPrimary = async (imageId: string) => {
    const result = await setImageAsPrimary(imageId, productId);
    if (result.success) {
      setImages(images.map(img => ({
        ...img,
        is_primary: img.id === imageId,
      })));
      toast.success('Primary image updated');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to set primary image');
    }
  };

  const handleMigrateLegacy = async (url: string) => {
    setSaving(true);
    const result = await createProductImage(productId, {
      url,
      is_primary: images.length === 0,
    });
    
    if (result.success && result.image) {
      setImages([...images, result.image]);
      toast.success('Image migrated to new format');
      router.refresh();
    } else {
      toast.error(result.error || 'Failed to migrate image');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              Product Images
            </CardTitle>
            <CardDescription>Manage images for this product</CardDescription>
          </div>
          <Button onClick={() => openAddDialog()}>
            <Plus className="mr-2 h-4 w-4" />
            Add Image
          </Button>
        </CardHeader>
        <CardContent>
          {images.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No images added yet. Add product images to enhance your listings.
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {images.map(image => (
                <div 
                  key={image.id} 
                  className="relative group border rounded-lg overflow-hidden bg-muted aspect-square"
                >
                  <Image
                    src={image.url}
                    alt={image.alt_text || productName}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                  {image.is_primary && (
                    <Badge className="absolute top-2 left-2 bg-primary">
                      <Star className="h-3 w-3 mr-1 fill-current" />
                      Primary
                    </Badge>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {!image.is_primary && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleSetPrimary(image.id)}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openAddDialog(image)}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deletingId === image.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Image</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete this image?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteImage(image.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {legacyImages && legacyImages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Legacy Images</CardTitle>
            <CardDescription>
              These images are stored in the old format. Click to migrate them to the new product_images table.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {legacyImages.map((url, idx) => (
                <div 
                  key={idx}
                  className="relative group border rounded-lg overflow-hidden bg-muted aspect-square"
                >
                  <Image
                    src={url}
                    alt={`${productName} legacy ${idx + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      size="sm"
                      onClick={() => handleMigrateLegacy(url)}
                      disabled={saving}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Migrate
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingImage ? 'Edit Image' : 'Add Image'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="imageUrl">Image URL</Label>
              <Input
                id="imageUrl"
                value={imageForm.url}
                onChange={(e) => setImageForm({ ...imageForm, url: e.target.value })}
                placeholder="https://example.com/image.jpg"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="altText">Alt Text (for accessibility/SEO)</Label>
              <Input
                id="altText"
                value={imageForm.alt_text}
                onChange={(e) => setImageForm({ ...imageForm, alt_text: e.target.value })}
                placeholder="e.g., Red dog collar front view"
              />
            </div>
            {imageForm.url && (
              <div className="border rounded-lg p-2">
                <p className="text-xs text-muted-foreground mb-2">Preview:</p>
                <div className="relative aspect-video bg-muted rounded overflow-hidden">
                  <Image
                    src={imageForm.url}
                    alt="Preview"
                    fill
                    className="object-contain"
                    onError={() => toast.error('Invalid image URL')}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveImage} disabled={saving || !imageForm.url.trim()}>
              {saving ? 'Saving...' : editingImage ? 'Update' : 'Add Image'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
