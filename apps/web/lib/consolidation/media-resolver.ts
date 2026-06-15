/**
 * Media Resolver for Product Consolidation
 */

import { extractImageCandidatesFromSources, normalizeImageUrl } from '@/lib/product-sources';

/**
 * Normalizes an array of unknown values to a deduplicated array of clean URL strings.
 */
export function toStringUrlArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    const urls = value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => normalizeImageUrl(entry))
        .filter((entry) => entry.length > 0);
    
    return Array.from(new Set(urls));
}

/**
 * Extracts and normalizes selected image URLs from database fields.
 */
export function extractSelectedImageUrls(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    const urls = value
        .map((entry) => {
            if (typeof entry === 'string') {
                return entry;
            }

            if (entry && typeof entry === 'object' && 'url' in entry) {
                const url = (entry as { url?: unknown }).url;
                return typeof url === 'string' ? url : null;
            }

            return null;
        })
        .filter((url): url is string => typeof url === 'string')
        .map((url) => normalizeImageUrl(url))
        .filter((url) => url.length > 0);
    
    return Array.from(new Set(urls));
}

export interface MediaItem {
    url: string;
    role?: string;
    source?: string;
    confidence_score?: number;
}

export interface MediaResolutionResult {
    media: MediaItem[];
    selectedImages: string[];
}

/**
 * Resolves media and selected images, applying structured source fallbacks if no existing media is defined.
 */
export function resolveProductMedia(
    existingMedia: Array<{ url: string; role?: string; source?: string; confidence_score?: number }>,
    existingEvidence: Record<string, unknown>,
    existingRecord: {
        selectedImages?: string[];
        imageCandidates?: string[];
        sources?: Record<string, unknown>;
    }
): MediaResolutionResult {
    let nextMedia: MediaItem[] = [];
    let nextSelectedImages: string[] = [];

    // Always extract current candidate pools from the ingestion record
    const selectedImages = existingRecord?.selectedImages || [];
    const imageCandidates = existingRecord?.imageCandidates || [];
    const sourceCandidates = extractImageCandidatesFromSources(
        existingRecord?.sources || {},
        24
    );

    // Merge and deduplicate all candidates based on normalized URLs
    const allCandidateUrls = [
        ...selectedImages,
        ...imageCandidates,
        ...sourceCandidates
    ];
    
    const seenNormalized = new Set<string>();
    const uniqueCandidates: string[] = [];
    for (const url of allCandidateUrls) {
        const normalized = normalizeImageUrl(url);
        if (normalized && !seenNormalized.has(normalized)) {
            seenNormalized.add(normalized);
            uniqueCandidates.push(url);
        }
    }

    if (existingMedia.length > 0) {
        // Keep all existing media items
        nextMedia = [...existingMedia];
        
        // Track existing normalized URLs to avoid duplicates
        const existingNormalized = new Set(
            existingMedia.map((m) => normalizeImageUrl(m.url))
        );

        // Append new candidate images as gallery images
        for (const candidateUrl of uniqueCandidates) {
            const normalized = normalizeImageUrl(candidateUrl);
            if (!existingNormalized.has(normalized)) {
                nextMedia.push({
                    url: candidateUrl,
                    role: 'gallery',
                    source: 'scraped',
                    confidence_score: 1.0,
                });
                existingNormalized.add(normalized);
            }
        }

        // Set up selected images, preserving previous selections if possible
        const prevSelected = Array.isArray(existingEvidence.selected_images)
            ? (existingEvidence.selected_images as string[])
            : existingMedia.map((m) => m.url);

        nextSelectedImages = [...prevSelected];
        const selectedNormalized = new Set(
            nextSelectedImages.map((url) => normalizeImageUrl(url))
        );

        // Ensure all active nextMedia URLs are also selected
        for (const m of nextMedia) {
            const normalized = normalizeImageUrl(m.url);
            if (!selectedNormalized.has(normalized)) {
                nextSelectedImages.push(m.url);
                selectedNormalized.add(normalized);
            }
        }
    } else {
        // Fallback when there is no existing media
        const fallbackImages =
            selectedImages.length > 0
                ? selectedImages
                : imageCandidates.length > 0
                ? imageCandidates.slice(0, 10)
                : sourceCandidates.slice(0, 10);

        if (fallbackImages.length > 0) {
            nextMedia = fallbackImages.map((url, idx) => ({
                url,
                role: idx === 0 ? 'main' : 'gallery',
                source: 'scraped',
                confidence_score: 1.0,
            }));
            nextSelectedImages = fallbackImages;
        }
    }

    // Limit both lists to 12 images (standard threshold in storefront database schema)
    if (nextMedia.length > 12) {
        nextMedia = nextMedia.slice(0, 12);
    }
    if (nextSelectedImages.length > 12) {
        nextSelectedImages = nextSelectedImages.slice(0, 12);
    }

    return {
        media: nextMedia,
        selectedImages: nextSelectedImages,
    };
}
