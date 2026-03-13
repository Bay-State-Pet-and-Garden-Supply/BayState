'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ImageIcon, Eye } from 'lucide-react';
import Lightbox from 'yet-another-react-lightbox';
import Zoom from 'yet-another-react-lightbox/plugins/zoom';
import Counter from 'yet-another-react-lightbox/plugins/counter';
import 'yet-another-react-lightbox/styles.css';
import 'yet-another-react-lightbox/plugins/counter.css';

interface ImageLightboxProps {
  images: string[];
}

export function ImageLightbox({ images }: ImageLightboxProps) {
  const [index, setIndex] = useState(-1);

  if (!images || images.length === 0) {
    return (
      <div 
        data-testid="image-lightbox"
        className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg bg-muted/50 text-muted-foreground"
      >
        <ImageIcon className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No images available</p>
      </div>
    );
  }

  // Generate slides for lightbox
  const slides = images.map(src => ({ src }));

  return (
    <div data-testid="image-lightbox">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((url, i) => (
          <div 
            key={`${url}-${i}`}
            className="relative group border rounded-lg overflow-hidden bg-muted aspect-square cursor-pointer"
            onClick={() => setIndex(i)}
          >
            <Image
              src={url}
              alt={`Scraped image ${i + 1}`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, 33vw"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
              <span className="flex items-center gap-1 text-white bg-black/50 px-3 py-1.5 rounded-md backdrop-blur-sm text-sm font-medium">
                <Eye className="h-4 w-4" />
                View {i + 1}/{images.length}
              </span>
            </div>
          </div>
        ))}
      </div>

      <Lightbox
        index={index}
        open={index >= 0}
        close={() => setIndex(-1)}
        slides={slides}
        plugins={[Zoom, Counter]}
        carousel={{ finite: images.length === 1 }} // Don't loop if only one image
        render={{
          // Hide navigation arrows if there's only one image
          buttonPrev: images.length <= 1 ? () => null : undefined,
          buttonNext: images.length <= 1 ? () => null : undefined,
        }}
      />
    </div>
  );
}
