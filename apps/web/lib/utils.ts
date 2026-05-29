import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | number | Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export function formatCurrency(amount: number | string, options: { showFree?: boolean } = {}) {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (options.showFree && value === 0) {
    return 'FREE';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

export function formatImageUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;
  
  if (trimmedUrl.startsWith('http') || trimmedUrl.startsWith('/')) {
    return trimmedUrl;
  }
  
  return `https://www.baystatepet.com/media/${trimmedUrl}`;
}

export function toTitleCase(str: string): string {
  if (!str) return str;
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Ensures a URL has a protocol (https:// by default).
 * If the URL already has http:// or https://, it is returned as-is.
 */
export function formatExternalUrl(url?: string | null): string {
  if (!url) return '';
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return '';
  
  if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
    return trimmedUrl;
  }
  
  return `https://${trimmedUrl}`;
}
