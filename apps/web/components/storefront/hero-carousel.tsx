'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { HeroSlide } from '@/lib/settings';

interface HeroCarouselProps {
    slides: HeroSlide[];
    interval?: number;
}

export function HeroCarousel({ slides, interval = 5000 }: HeroCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    const goToNext = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % slides.length);
    }, [slides.length]);

    const goToPrev = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
    }, [slides.length]);

    useEffect(() => {
        if (slides.length <= 1 || isPaused) return;

        const timer = setInterval(goToNext, interval);
        return () => clearInterval(timer);
    }, [slides.length, interval, isPaused, goToNext]);

    if (slides.length === 0) return null;

    const currentSlide = slides[currentIndex];

    return (
        <section
            className="storefront-panel relative mb-12 aspect-[1900/680] w-full overflow-hidden group"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            {currentSlide.linkUrl ? (
                <Link href={currentSlide.linkUrl} className="absolute inset-0 z-0 block">
                    {currentSlide.imageUrl && (
                        <Image
                            src={currentSlide.imageUrl}
                            alt={currentSlide.title}
                            fill
                            priority
                            className="object-cover transition-opacity duration-300"
                        />
                    )}
                </Link>
            ) : (
                <div className="absolute inset-0 z-0">
                    {currentSlide.imageUrl && (
                        <Image
                            src={currentSlide.imageUrl}
                            alt={currentSlide.title}
                            fill
                            priority
                            className="object-cover transition-opacity duration-300"
                        />
                    )}
                </div>
            )}

            <div className="pointer-events-none absolute inset-0 z-10 flex items-end bg-gradient-to-r from-black/45 via-black/20 to-transparent p-6 sm:p-10">
                <div className="pointer-events-auto max-w-xl rounded-[1.75rem] border border-white/20 bg-white/92 p-6 text-zinc-900 shadow-[var(--shadow-warm-md)] backdrop-blur-sm sm:p-8">
                    <p className="storefront-kicker mb-3 text-[var(--surface-storefront-accent)]">Seasonal feature</p>
                    <h2 className="m-0 font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
                        {currentSlide.title}
                    </h2>
                    {currentSlide.subtitle && (
                        <p className="mt-3 text-sm font-medium text-zinc-600 sm:text-base">
                            {currentSlide.subtitle}
                        </p>
                    )}
                </div>
            </div>

            {slides.length > 1 && (
                <div className="absolute top-1/2 w-full flex justify-between -translate-y-1/2 px-4 z-20 pointer-events-none">
                    <button
                        onClick={(e) => { e.preventDefault(); goToPrev(); }}
                        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/90 text-zinc-900 shadow-sm transition-colors hover:bg-white"
                        aria-label="Previous slide"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                        onClick={(e) => { e.preventDefault(); goToNext(); }}
                        className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/90 text-zinc-900 shadow-sm transition-colors hover:bg-white"
                        aria-label="Next slide"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            )}

            {slides.length > 1 && (
                <div className="absolute right-6 top-6 z-20 flex gap-2 rounded-full bg-black/20 px-3 py-2 backdrop-blur-sm">
                    {slides.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={(e) => { e.preventDefault(); setCurrentIndex(idx); }}
                            className={`h-2 rounded-full transition-all ${idx === currentIndex
                                    ? 'w-10 bg-white'
                                    : 'w-2 bg-white/55 hover:bg-white/75'
                                 }`}
                            aria-label={`Go to slide ${idx + 1}`}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
