'use client';

import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import type { BannerMessage } from '@/lib/settings';

interface CampaignBannerProps {
  messages: BannerMessage[];
  variant?: 'info' | 'promo' | 'seasonal';
  cycleInterval?: number;
}

const variantStyles = {
  info: 'bg-primary text-primary-foreground',
  promo: 'bg-primary text-primary-foreground',
  seasonal: 'bg-primary text-primary-foreground',
};

/**
 * CampaignBanner - Cycling banner for promotions and announcements.
 * Automatically rotates through multiple messages with fade transitions.
 * Controlled via admin panel.
 */
export function CampaignBanner({
  messages,
  variant = 'info',
  cycleInterval = 5000,
}: CampaignBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const messageCount = messages.length;

  const goToNext = useCallback(() => {
    if (messageCount <= 1) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % messageCount);
      setIsTransitioning(false);
    }, 300);
  }, [messageCount]);

  const goToPrev = useCallback(() => {
    if (messageCount <= 1) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + messageCount) % messageCount);
      setIsTransitioning(false);
    }, 300);
  }, [messageCount]);

  // Auto-cycle through messages
  useEffect(() => {
    if (messageCount <= 1) return;

    const timer = setInterval(goToNext, cycleInterval);
    return () => clearInterval(timer);
  }, [messageCount, cycleInterval, goToNext]);

  if (isDismissed || messageCount === 0) {
    return null;
  }

  const currentMessage = messages[currentIndex];

  return (
    <div className={`${variantStyles[variant]} py-2.5 px-4`}>
      <div className="flex items-center justify-center gap-2 text-sm font-medium relative">
        {/* Previous button - only show if multiple messages */}
        {messageCount > 1 && (
          <button
            onClick={goToPrev}
            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10 transition-colors"
            aria-label="Previous message"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Message content with fade transition */}
        <p
          className={`transition-opacity duration-300 text-center flex-1 ${isTransitioning ? 'opacity-0' : 'opacity-100'
            }`}
        >
          {currentMessage.text}
          {currentMessage.linkText && currentMessage.linkHref && (
            <>
              {' '}
              <a
                href={currentMessage.linkHref}
                className="underline underline-offset-2 hover:no-underline"
              >
                {currentMessage.linkText}
              </a>
            </>
          )}
        </p>

        {/* Next button - only show if multiple messages */}
        {messageCount > 1 && (
          <button
            onClick={goToNext}
            className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10 transition-colors"
            aria-label="Next message"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* Dismiss button */}
        <button
          onClick={() => setIsDismissed(true)}
          className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-black/10 transition-colors"
          aria-label="Dismiss banner"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Dots indicator - only show if multiple messages */}
      {messageCount > 1 && (
        <div className="flex justify-center gap-1.5 mt-1">
          {messages.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setIsTransitioning(true);
                setTimeout(() => {
                  setCurrentIndex(index);
                  setIsTransitioning(false);
                }, 300);
              }}
              className={`h-1.5 rounded-full transition-all ${index === currentIndex
                  ? 'w-4 bg-white'
                  : 'w-1.5 bg-white/50 hover:bg-white/70'
                }`}
              aria-label={`Go to message ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
