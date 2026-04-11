'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
            className="relative w-full h-[400px] sm:h-[500px] overflow-hidden rounded-sm mb-12 border-2 border-zinc-200"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            {/* Background Image */}
            {currentSlide.imageUrl && (
                <Image
                    src={currentSlide.imageUrl}
                    alt={currentSlide.title}
                    fill
                    priority
                    className="object-cover transition-opacity duration-300"
                />
            )}

            {/* Content Box - Rugged Utilitarian Style */}
            <div className="absolute bottom-6 left-6 right-6 sm:right-auto p-6 sm:p-10 bg-primary text-white max-w-xl border-l-[12px] border-accent shadow-[12px_12px_0px_rgba(0,0,0,0.25)] z-10">
                <h2 className="text-3xl sm:text-5xl font-black uppercase italic mb-3 leading-tight tracking-tighter">
                    {currentSlide.title}
                </h2>
                {currentSlide.subtitle && (
                    <p className="text-lg sm:text-xl font-bold mb-8 text-white/90 uppercase tracking-wide">
                        {currentSlide.subtitle}
                    </p>
                )}
                {currentSlide.linkUrl && (
                    <Button 
                        size="lg" 
                        asChild 
                        className="h-14 px-10 text-lg font-black uppercase rounded-none bg-accent text-secondary hover:bg-accent/90 border-b-4 border-black/20"
                    >
                        <Link href={currentSlide.linkUrl}>
                            {currentSlide.linkText || 'Shop Now'}
                        </Link>
                    </Button>
                )}
            </div>

            {/* Navigation Arrows - Solid and Opaque */}
            {slides.length > 1 && (
                <div className="absolute top-6 right-6 flex gap-3 z-20">
                    <button
                        onClick={goToPrev}
                        className="bg-white border-2 border-black text-black hover:bg-zinc-100 p-3 shadow-[4px_4px_0px_rgba(0,0,0,0.2)] transition-transform active:translate-x-0.5 active:translate-y-0.5"
                        aria-label="Previous slide"
                    >
                        <ChevronLeft className="h-6 w-6" />
                    </button>
                    <button
                        onClick={goToNext}
                        className="bg-white border-2 border-black text-black hover:bg-zinc-100 p-3 shadow-[4px_4px_0px_rgba(0,0,0,0.2)] transition-transform active:translate-x-0.5 active:translate-y-0.5"
                        aria-label="Next slide"
                    >
                        <ChevronRight className="h-6 w-6" />
                    </button>
                </div>
            )}

            {/* Progress Indicators - Solid Rectangles */}
            {slides.length > 1 && (
                <div className="absolute top-6 left-6 flex gap-1 z-20">
                    {slides.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentIndex(idx)}
                            className={`h-1.5 w-12 transition-all ${idx === currentIndex
                                    ? 'bg-accent shadow-[2px_2px_0px_rgba(0,0,0,0.2)]'
                                    : 'bg-white/40 hover:bg-white/70'
                                }`}
                            aria-label={`Go to slide ${idx + 1}`}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
