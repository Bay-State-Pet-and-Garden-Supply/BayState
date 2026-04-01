'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface ImageSelectorProps {
  images: string[];
  onSave: (selected: string[]) => void;
}

export function ImageSelector({ images, onSave }: ImageSelectorProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelection = (imageUrl: string) => {
    setSelected((prev) =>
      prev.includes(imageUrl)
        ? prev.filter((url) => url !== imageUrl)
        : [...prev, imageUrl]
    );
  };

  const handleSave = () => {
    onSave(selected);
  };

  if (images.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        No images available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {images.map((imageUrl, index) => (
          <div
            key={imageUrl}
            onClick={() => toggleSelection(imageUrl)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleSelection(imageUrl);
              }
            }}
            tabIndex={0}
            role="button"
            aria-pressed={selected.includes(imageUrl)}
            aria-label={`Select image ${index + 1}`}
            className={`
              relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all
              focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
              ${
                selected.includes(imageUrl)
                  ? 'border-primary ring-2 ring-primary'
                  : 'border-border hover:border-border'
              }
            `}
          >
            <img
              src={imageUrl}
              alt={`Product image ${index + 1}`}
              className={`w-full h-32 object-cover ${selected.includes(imageUrl) ? 'selected' : ''}`}
            />
            {selected.includes(imageUrl) && (
              <div className="absolute inset-0 bg-primary/10" />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-4 border-t">
        <Button
          onClick={handleSave}
          disabled={selected.length === 0}
          className="bg-primary hover:bg-primary/80"
        >
          Save Selected Images
        </Button>
      </div>
    </div>
  );
}
