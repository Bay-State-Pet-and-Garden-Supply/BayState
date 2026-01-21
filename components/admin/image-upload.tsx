'use client';

import { useState, useCallback, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  bucket?: string;
  folder?: string;
  maxSizeMB?: number;
  accept?: string;
  aspectRatio?: 'square' | 'landscape' | 'portrait' | 'free';
  placeholder?: string;
  disabled?: boolean;
}

export function ImageUpload({
  value,
  onChange,
  bucket = 'images',
  folder = 'uploads',
  maxSizeMB = 5,
  accept = 'image/jpeg,image/png,image/webp,image/gif',
  aspectRatio = 'free',
  placeholder = 'Click or drag to upload',
  disabled = false,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const aspectClasses = {
    square: 'aspect-square',
    landscape: 'aspect-video',
    portrait: 'aspect-[3/4]',
    free: 'min-h-32',
  };

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);

      // Validate file size
      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File size must be less than ${maxSizeMB}MB`);
        return;
      }

      // Validate file type
      if (!accept.split(',').some((type) => file.type === type.trim())) {
        setError('Invalid file type');
        return;
      }

      setUploading(true);

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('bucket', bucket);
        formData.append('folder', folder);

        const response = await fetch('/api/admin/upload', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Upload failed');
        }

        const { url } = await response.json();
        onChange(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [bucket, folder, maxSizeMB, accept, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);

      if (disabled || uploading) return;

      const file = e.dataTransfer.files[0];
      if (file) {
        handleUpload(file);
      }
    },
    [disabled, uploading, handleUpload]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const handleRemove = () => {
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <div
        className={`relative overflow-hidden rounded-lg border-2 border-dashed transition-colors ${
          dragOver
            ? 'border-purple-500 bg-purple-50'
            : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
        } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${
          aspectClasses[aspectRatio]
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          disabled={disabled || uploading}
          className="hidden"
        />

        {value ? (
          <div className="relative h-full w-full">
            <Image
              src={value}
              alt="Uploaded image"
              fill
              className="object-contain"
            />
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute right-2 top-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemove();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : uploading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
            <p className="text-sm text-gray-600">Uploading...</p>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
            {dragOver ? (
              <Upload className="h-8 w-8 text-purple-600" />
            ) : (
              <ImageIcon className="h-8 w-8 text-gray-600" />
            )}
            <p className="text-sm text-gray-600">{placeholder}</p>
            <p className="text-xs text-gray-600">
              Max size: {maxSizeMB}MB
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}
    </div>
  );
}

interface ImageGalleryProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  disabled?: boolean;
}

export function ImageGallery({
  images,
  onChange,
  maxImages = 10,
  disabled = false,
}: ImageGalleryProps) {
  const handleAdd = (url: string | null) => {
    if (url && images.length < maxImages) {
      onChange([...images, url]);
    }
  };

  const handleRemove = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  const handleReorder = (from: number, to: number) => {
    const newImages = [...images];
    const [removed] = newImages.splice(from, 1);
    newImages.splice(to, 0, removed);
    onChange(newImages);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {images.map((url, index) => (
          <div
            key={url}
            className="group relative aspect-square overflow-hidden rounded-lg border bg-gray-100"
            draggable={!disabled}
            onDragStart={(e) => e.dataTransfer.setData('index', String(index))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const fromIndex = parseInt(e.dataTransfer.getData('index'));
              if (fromIndex !== index) {
                handleReorder(fromIndex, index);
              }
            }}
          >
            <Image
              src={url}
              alt={`Image ${index + 1}`}
              fill
              className="object-cover"
            />
            {index === 0 && (
              <span className="absolute left-2 top-2 rounded bg-purple-600 px-2 py-0.5 text-xs font-medium text-white">
                Primary
              </span>
            )}
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => handleRemove(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}

        {images.length < maxImages && !disabled && (
          <ImageUpload
            onChange={handleAdd}
            aspectRatio="square"
            placeholder="Add image"
          />
        )}
      </div>

      {images.length > 0 && (
        <p className="text-xs text-gray-600">
          {images.length} of {maxImages} images. Drag to reorder.
        </p>
      )}
    </div>
  );
}
