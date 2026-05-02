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
            className="relative w-full aspect-[1900/680] overflow-hidden rounded-lg mb-12 border-b border-[oklch(85%_0.03_160)] group"
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

            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[oklch(25%_0.02_90)]/40 to-transparent flex items-end p-6 sm:p-10 z-10">
                <div className="bg-[oklch(25%_0.02_90)] text-white p-6 pl-4 shadow-lg pointer-events-auto">
                    <h1 className="text-3xl sm:text-5xl font-bold uppercase m-0 leading-tight tracking-tight font-display">
                        {currentSlide.title}
                    </h1>
                    {currentSlide.subtitle && (
                        <p className="text-sm sm:text-base font-medium mt-2 text-[oklch(75%_0.06_160)] tracking-wide">
                            {currentSlide.subtitle}
                        </p>
                    )}
                </div>
            </div>

            {slides.length > 1 && (
                <div className="absolute top-1/2 w-full flex justify-between -translate-y-1/2 px-4 z-20 pointer-events-none">
                    <button
                        onClick={(e) => { e.preventDefault(); goToPrev(); }}
                        className="bg-card border border-[oklch(85%_0.03_160)] text-foreground hover:bg-muted w-12 h-[60px] flex items-center justify-center shadow-sm transition-transform active:translate-y-0.5 pointer-events-auto"
                        aria-label="Previous slide"
                    >
                        <ChevronLeft className="h-8 w-8" />
                    </button>
                    <button
                        onClick={(e) => { e.preventDefault(); goToNext(); }}
                        className="bg-card border border-[oklch(85%_0.03_160)] text-foreground hover:bg-muted w-12 h-[60px] flex items-center justify-center shadow-sm transition-transform active:translate-y-0.5 pointer-events-auto"
                        aria-label="Next slide"
                    >
                        <ChevronRight className="h-8 w-8" />
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
                                    ? 'bg-[oklch(45%_0.08_160)]'
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
