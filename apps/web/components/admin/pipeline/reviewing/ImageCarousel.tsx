"use client";

import { useState, useEffect } from "react";
import {
  Image as ImageIcon,
  X,
  Maximize2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";

interface ImageCarouselProps {
  selectedImages: string[];
  onToggleImage?: (url: string) => void;
  onReorderImages?: (images: string[]) => void;
}

export function ImageCarousel({
  selectedImages,
  onToggleImage,
  onReorderImages,
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

  const moveImage = (index: number, direction: "left" | "right") => {
    if (!onReorderImages) return;

    const newImages = [...selectedImages];
    const targetIndex = direction === "left" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newImages.length) return;

    // Swap images
    [newImages[index], newImages[targetIndex]] = [
      newImages[targetIndex],
      newImages[index],
    ];

    onReorderImages(newImages);

    // After reordering, if the moved image was current, update selection to follow it
    if (currentImageIndex === index) {
      setTimeout(() => carouselApi?.scrollTo(targetIndex), 0);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-muted-foreground">
            Product Media
          </Label>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {selectedImages.length > 0
              ? `${currentImageIndex + 1} of ${selectedImages.length} selected`
              : "No images selected"}
          </span>
        </div>

        {/* Large Image Carousel */}
        <div className="relative group rounded-none border border-border bg-card overflow-hidden">
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
                    <div className="relative aspect-square flex items-center justify-center p-4 bg-card">
                      <Dialog>
                        <DialogTrigger asChild>
                          <div className="relative w-full h-full cursor-zoom-in group/image">
                            <img
                              src={url}
                              alt={`Product image ${index + 1}`}
                              className="w-full h-full object-contain"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-foreground/0 group-hover/image:bg-foreground/5 transition-colors flex items-center justify-center opacity-0 group-hover/image:opacity-100">
                              <div className="bg-card p-2 rounded-none border border-border">
                                <Maximize2 className="h-5 w-5 text-foreground" />
                              </div>
                            </div>
                          </div>
                        </DialogTrigger>
                        <DialogContent className="max-w-[95vw] sm:max-w-[95vw] max-h-[95vh] p-0 overflow-hidden bg-card/95 backdrop-blur-sm border border-border rounded-none">
                          <DialogTitle className="sr-only">
                            Zoomed product image {index + 1}
                          </DialogTitle>
                          <div className="relative w-full h-[90vh] flex items-center justify-center p-8">
                            <img
                              src={url}
                              alt={`Product image ${index + 1} (Zoomed)`}
                              className="max-w-full max-h-full object-contain drop-shadow-2xl"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-card px-4 py-2 rounded-none border border-border">
                              <span className="text-[10px] font-semibold text-foreground truncate max-w-[300px]">
                                {url.split("/").pop()}
                              </span>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      {onToggleImage && (
                        <button
                          onClick={() => onToggleImage(url)}
                          className="absolute top-4 right-4 bg-card text-foreground border border-border rounded-none p-1.5 hover:bg-muted transition-all z-20"
                          title="Remove this image"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </CarouselItem>
                ))}
              </CarouselContent>
              {selectedImages.length > 1 && (
                <>
                  <CarouselPrevious className="left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded-none shadow-none" />
                  <CarouselNext className="right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded-none shadow-none" />
                </>
              )}
            </Carousel>
          ) : (
            <div className="aspect-square flex flex-col items-center justify-center text-muted-foreground bg-muted border border-border border-dashed rounded-none m-2">
              <ImageIcon className="h-12 w-12 mb-2 opacity-20" />
              <p className="text-[10px] font-semibold">
                No images selected
              </p>
            </div>
          )}
        </div>

        {/* Thumbnails of selected images */}
        {selectedImages.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide px-1">
            {selectedImages.map((url, index) => (
              <div
                key={`thumb-${url}-${index}`}
                onClick={() => carouselApi?.scrollTo(index)}
                className={cn(
                  "group/thumb relative flex-shrink-0 w-16 h-16 rounded-none border overflow-hidden cursor-pointer transition-all",
                  currentImageIndex === index
                    ? "border-border ring-2 ring-border/10 scale-105"
                    : "border-muted opacity-60 hover:opacity-100 hover:border-border",
                )}
              >
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />

                {/* Reorder Buttons */}
                {onReorderImages && selectedImages.length > 1 && (
                  <div className="absolute inset-0 flex items-center justify-between px-0.5 opacity-0 group-hover/thumb:opacity-100 transition-opacity pointer-events-none">
                    <button
                      disabled={index === 0}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveImage(index, "left");
                      }}
                      className={cn(
                        "pointer-events-auto bg-card border border-border p-0.5 hover:bg-muted disabled:opacity-0 transition-all",
                        index === 0 && "hidden",
                      )}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <button
                      disabled={index === selectedImages.length - 1}
                      onClick={(e) => {
                        e.stopPropagation();
                        moveImage(index, "right");
                      }}
                      className={cn(
                        "pointer-events-auto bg-card border border-border p-0.5 hover:bg-muted disabled:opacity-0 transition-all",
                        index === selectedImages.length - 1 && "hidden",
                      )}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
