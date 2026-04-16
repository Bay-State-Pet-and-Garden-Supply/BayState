"use client";

import { useState, useEffect } from "react";
import {
  Image as ImageIcon,
  CheckCircle,
  Plus,
  X,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ImageSourceOption } from "./finalizing-utils";

export interface ImageCarouselProps {
  selectedImages: string[];
  onToggleImage: (url: string) => void;
  imageSourceOptions: ImageSourceOption[];
  selectedImageSourceId: string;
  onSelectImageSource: (id: string) => void;
  isCustomImageSource: boolean;
  customImageUrl: string;
  onCustomImageUrlChange: (value: string) => void;
  onAddCustomImage: () => void;
  imageCandidates: string[];
  activeSourceLabel: string;
}

export function ImageCarousel({
  selectedImages,
  onToggleImage,
  imageSourceOptions,
  selectedImageSourceId,
  onSelectImageSource,
  isCustomImageSource,
  customImageUrl,
  onCustomImageUrlChange,
  onAddCustomImage,
  imageCandidates,
  activeSourceLabel,
}: ImageCarouselProps) {
  const [carouselApi, setCarouselApi] = useState<CarouselApi>();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (!carouselApi) return;

    const onSelect = () => {
      setCurrentImageIndex(carouselApi.selectedScrollSnap());
    };

    onSelect();
    carouselApi.on("select", onSelect);

    return () => {
      carouselApi.off("select", onSelect);
    };
  }, [carouselApi]);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Product Media
          </Label>
          <span className="text-xs text-muted-foreground">
            {selectedImages.length > 0
              ? `${currentImageIndex + 1} of ${selectedImages.length} selected`
              : "No images selected"}
          </span>
        </div>

        {/* Large Image Carousel */}
        <div className="relative group rounded-xl border bg-card overflow-hidden shadow-sm">
          {selectedImages.length > 0 ? (
            <Carousel
              setApi={setCarouselApi}
              className="w-full"
              opts={{
                loop: true,
              }}
            >
              <CarouselContent>
                {selectedImages.map((url, index) => (
                  <CarouselItem key={url}>
                    <div className="relative aspect-square flex items-center justify-center p-4 bg-white">
                      <Dialog>
                        <DialogTrigger asChild>
                          <div className="relative w-full h-full cursor-zoom-in group/image">
                            <img
                              src={url}
                              alt={`Product image ${index + 1}`}
                              className="w-full h-full object-contain"
                            />
                            <div className="absolute inset-0 bg-zinc-950/0 group-hover/image:bg-zinc-950/5 transition-colors flex items-center justify-center opacity-0 group-hover/image:opacity-100">
                              <div className="bg-white/90 p-2 rounded-full shadow-lg">
                                <Maximize2 className="h-5 w-5 text-primary" />
                              </div>
                            </div>
                          </div>
                        </DialogTrigger>
                        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 overflow-hidden bg-white/95 backdrop-blur-sm border-none shadow-2xl">
                          <DialogTitle className="sr-only">
                            Zoomed product image {index + 1}
                          </DialogTitle>
                          <div className="relative w-full h-[90vh] flex items-center justify-center p-8">
                            <img
                              src={url}
                              alt={`Product image ${index + 1} (Zoomed)`}
                              className="max-w-full max-h-full object-contain drop-shadow-2xl"
                            />
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/80 backdrop-blur px-4 py-2 rounded-full border shadow-sm">
                              <span className="text-xs font-mono font-bold text-primary truncate max-w-[300px]">
                                {url.split("/").pop()}
                              </span>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      <button
                        onClick={() => onToggleImage(url)}
                        className="absolute top-4 right-4 bg-destructive text-destructive-foreground rounded-full p-1.5 shadow-md hover:scale-110 transition-transform z-20"
                        title="Remove this image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {selectedImages.length > 1 && (
                <>
                  <CarouselPrevious className="left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80" />
                  <CarouselNext className="right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80" />
                </>
              )}
            </Carousel>
          ) : (
            <div className="aspect-square flex flex-col items-center justify-center text-muted-foreground bg-muted/10 border border-dashed rounded-xl m-2">
              <ImageIcon className="h-12 w-12 mb-2 opacity-20" />
              <p className="text-sm font-medium">
                No images selected
              </p>
              <p className="text-xs opacity-60 mt-1">
                Select from candidates below
              </p>
            </div>
          )}
        </div>

        {/* Thumbnails of selected images */}
        {selectedImages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
            {selectedImages.map((url, index) => (
              <div
                key={`thumb-${url}`}
                onClick={() => carouselApi?.scrollTo(index)}
                className={cn(
                  "relative flex-shrink-0 w-16 h-16 rounded-md border overflow-hidden cursor-pointer transition-all",
                  currentImageIndex === index
                    ? "border-primary ring-2 ring-primary/20 scale-105"
                    : "border-transparent opacity-60 hover:opacity-100",
                )}
              >
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 pt-2">
          <Label
            htmlFor="image-source"
            className="text-xs uppercase font-bold text-muted-foreground"
          >
            Candidate Sources
          </Label>
          <Select
            value={selectedImageSourceId}
            onValueChange={onSelectImageSource}
          >
            <SelectTrigger id="image-source" className="h-9">
              <SelectValue placeholder="Select image source" />
            </SelectTrigger>
            <SelectContent>
              {imageSourceOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom Image URL */}
        {isCustomImageSource && (
          <div className="space-y-2">
            <Label htmlFor="custom-image-url">
              Custom Image URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="custom-image-url"
                value={customImageUrl}
                onChange={(e) =>
                  onCustomImageUrlChange(e.target.value)
                }
                placeholder="Paste image URL..."
                onKeyDown={(e) =>
                  e.key === "Enter" && onAddCustomImage()
                }
              />
              <Button
                variant="outline"
                size="icon"
                onClick={onAddCustomImage}
                type="button"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        <Separator />

        {/* Image Candidates */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">
            {isCustomImageSource
              ? "Custom Source"
              : `${activeSourceLabel} Candidates`}
          </Label>
          {imageCandidates.length > 0 ? (
            <div className="grid grid-cols-4 gap-2">
              {imageCandidates.map((url) => {
                const isSelected =
                  selectedImages.includes(url);
                return (
                  <div
                    key={url}
                    onClick={() => onToggleImage(url)}
                    className={cn(
                      "relative aspect-square rounded border overflow-hidden bg-card cursor-pointer hover:border-primary/50 transition-all",
                      isSelected
                        ? "ring-2 ring-primary border-primary"
                        : "opacity-60 grayscale hover:grayscale-0",
                    )}
                  >
                    <img
                      src={url}
                      alt=""
                      className="w-full h-full object-contain"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                        <CheckCircle className="h-5 w-5 text-primary" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="border rounded-lg p-4 text-xs text-muted-foreground bg-muted/20">
              {isCustomImageSource
                ? "Paste a URL above and add it to selected images."
                : "No image candidates found for this source."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
