'use client';

import * as React from 'react';
import Image from 'next/image';
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    type CarouselApi,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

interface ProductImageCarouselProps {
    images: string[];
    productName: string;
}

/**
 * ProductImageCarousel - A responsive image carousel for product details.
 * Features a large main image and a row of thumbnails for navigation.
 */
export function ProductImageCarousel({
    images,
    productName,
}: ProductImageCarouselProps) {
    const [api, setApi] = React.useState<CarouselApi>();
    const [current, setCurrent] = React.useState(0);

    React.useEffect(() => {
        if (!api) {
            return;
        }

        setCurrent(api.selectedScrollSnap());

        api.on('select', () => {
            setCurrent(api.selectedScrollSnap());
        });
    }, [api]);

    const scrollTo = React.useCallback(
        (index: number) => {
            api?.scrollTo(index);
        },
        [api]
    );

    const cleanImages = images
        .map((img) => img.trim())
        .filter((img) => img.startsWith('/') || img.startsWith('http'));

    if (cleanImages.length === 0) {
        return (
            <div className="aspect-square flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                No image available
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 w-full max-w-xl mx-auto">
            {/* Main Carousel */}
            <Carousel setApi={setApi} className="w-full">
                <CarouselContent>
                    {cleanImages.map((image, index) => (
                        <CarouselItem key={index}>
                            <div className="aspect-square overflow-hidden rounded-xl bg-zinc-100 relative">
                                <Image
                                    src={image}
                                    alt={`${productName} - Image ${index + 1}`}
                                    fill
                                    sizes="(max-width: 1024px) 100vw, 50vw"
                                    className="object-cover"
                                    priority={index === 0}
                                />
                            </div>
                        </CarouselItem>
                    ))}
                </CarouselContent>
            </Carousel>

            {/* Thumbnails */}
            {cleanImages.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {cleanImages.map((image, index) => (
                        <button
                            key={index}
                            onClick={() => scrollTo(index)}
                            className={cn(
                                'relative aspect-square w-20 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100 ring-2 transition-all',
                                current === index
                                    ? 'ring-zinc-900 border-2 border-white'
                                    : 'ring-transparent hover:ring-zinc-300'
                            )}
                        >
                            <Image
                                src={image}
                                alt={`${productName} thumbnail ${index + 1}`}
                                fill
                                sizes="80px"
                                className="object-cover"
                            />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
