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

    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          setIsScrolled(currentScrollY > threshold);
          ticking = false;
        });
        ticking = true;
      }
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
