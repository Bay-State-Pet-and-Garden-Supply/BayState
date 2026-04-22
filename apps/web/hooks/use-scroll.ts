import { useState, useEffect } from 'react';

/**
 * A performant hook to track vertical scroll position.
 * Returns true if the vertical scroll position is greater than the threshold.
 * 
 * @param threshold - The scroll threshold in pixels (default: 50)
 * @returns boolean - Whether the scroll position is beyond the threshold
 */
export function useScroll(threshold: number = 50): boolean {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      const currentScrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      const scrolled = currentScrollY > threshold;
      
      // Only update state if it actually changed to avoid unnecessary re-renders
      setIsScrolled((prev) => {
        if (prev !== scrolled) {
          return scrolled;
        }
        return prev;
      });
    };

    // Initial check to set state correctly on mount
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [threshold]);

  return isScrolled;
}
