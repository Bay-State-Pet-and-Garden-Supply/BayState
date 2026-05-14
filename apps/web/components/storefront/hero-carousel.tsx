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
            className="relative w-full aspect-[1900/680] overflow-hidden rounded-sm mb-12 border-b border-zinc-200 group"
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

            {slides.length > 1 && (
                <div className="absolute top-1/2 w-full flex justify-between -translate-y-1/2 px-4 z-20 pointer-events-none">
                    <button
                        onClick={(e) => { e.preventDefault(); goToPrev(); }}
                        className="bg-white/90 backdrop-blur-sm border border-border text-primary hover:bg-primary hover:text-white w-12 h-12 flex items-center justify-center shadow-md transition-all active:scale-95 pointer-events-auto rounded-full group/btn"
                        aria-label="Previous slide"
                    >
                        <ChevronLeft className="h-6 w-6 transition-transform group-hover/btn:-translate-x-0.5" />
                    </button>
                    <button
                        onClick={(e) => { e.preventDefault(); goToNext(); }}
                        className="bg-white/90 backdrop-blur-sm border border-border text-primary hover:bg-primary hover:text-white w-12 h-12 flex items-center justify-center shadow-md transition-all active:scale-95 pointer-events-auto rounded-full group/btn"
                        aria-label="Next slide"
                    >
                        <ChevronRight className="h-6 w-6 transition-transform group-hover/btn:translate-x-0.5" />
                    </button>
                </div>
            )}

            {slides.length > 1 && (
                <div className="absolute top-6 right-6 flex gap-2 z-20">
                    {slides.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={(e) => { e.preventDefault(); setCurrentIndex(idx); }}
                            className={`h-1.5 w-10 transition-all ${idx === currentIndex
                                    ? 'bg-accent shadow-sm'
                                    : 'bg-white/50 hover:bg-white/80'
                                }`}
                            aria-label={`Go to slide ${idx + 1}`}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
