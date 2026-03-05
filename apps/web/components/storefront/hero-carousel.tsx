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
            className="relative w-full h-[400px] sm:h-[500px] overflow-hidden rounded-2xl mb-12"
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
                    className="object-cover transition-opacity duration-500"
                />
            )}

            {/* Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

            {/* Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 px-4 text-center text-white">
                <h2 className="text-3xl sm:text-5xl font-bold mb-3 drop-shadow-lg">
                    {currentSlide.title}
                </h2>
                {currentSlide.subtitle && (
                    <p className="text-lg sm:text-xl mb-6 max-w-2xl text-white/90 drop-shadow">
                        {currentSlide.subtitle}
                    </p>
                )}
                {currentSlide.linkUrl && (
                    <Button size="lg" asChild className="h-12 px-8 text-base">
                        <Link href={currentSlide.linkUrl} className="hover:underline underline-offset-4">
                            {currentSlide.linkText || 'Shop Now'}
                        </Link>
                    </Button>
                )}
            </div>

            {/* Navigation Arrows */}
            {slides.length > 1 && (
                <>
                    <button
                        onClick={goToPrev}
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 backdrop-blur-sm rounded-full p-2 transition-colors"
                        aria-label="Previous slide"
                    >
                        <ChevronLeft className="h-6 w-6 text-white" />
                    </button>
                    <button
                        onClick={goToNext}
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/40 backdrop-blur-sm rounded-full p-2 transition-colors"
                        aria-label="Next slide"
                    >
                        <ChevronRight className="h-6 w-6 text-white" />
                    </button>
                </>
            )}

            {/* Dots Indicator */}
            {slides.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {slides.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => setCurrentIndex(idx)}
                            className={`w-2.5 h-2.5 rounded-full transition-all ${idx === currentIndex
                                    ? 'bg-white w-6'
                                    : 'bg-white/50 hover:bg-white/70'
                                }`}
                            aria-label={`Go to slide ${idx + 1}`}
                        />
                    ))}
                </div>
            )}
        </section>
    );
}
