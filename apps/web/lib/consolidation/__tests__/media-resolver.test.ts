import { describe, it, expect } from '@jest/globals';
import { resolveProductMedia } from '../media-resolver';

describe('resolveProductMedia', () => {
    it('applies fallback flow when no existing media is defined', () => {
        const result = resolveProductMedia([], {}, {
            selectedImages: ['http://example.com/img1.jpg'],
            imageCandidates: ['http://example.com/img2.jpg'],
            sources: {}
        });

        expect(result.media).toHaveLength(1);
        expect(result.media[0]).toEqual({
            url: 'http://example.com/img1.jpg',
            role: 'main',
            source: 'scraped',
            confidence_score: 1.0,
        });
        expect(result.selectedImages).toEqual(['http://example.com/img1.jpg']);
    });

    it('preserves existing media and appends new scraped candidate images', () => {
        const existingMedia = [
            { url: 'http://example.com/img1.jpg', role: 'main', source: 'scraped', confidence_score: 1.0 }
        ];
        const existingEvidence = {
            selected_images: ['http://example.com/img1.jpg']
        };

        const result = resolveProductMedia(
            existingMedia,
            existingEvidence,
            {
                selectedImages: [],
                imageCandidates: [
                    'http://example.com/img1.jpg', // Duplicate (should be skipped)
                    'http://example.com/img2.jpg', // New
                    'http://example.com/img3.jpg'  // New
                ],
                sources: {}
            }
        );

        expect(result.media).toHaveLength(3);
        expect(result.media[0]).toEqual({
            url: 'http://example.com/img1.jpg',
            role: 'main',
            source: 'scraped',
            confidence_score: 1.0,
        });
        expect(result.media[1]).toEqual({
            url: 'http://example.com/img2.jpg',
            role: 'gallery',
            source: 'scraped',
            confidence_score: 1.0,
        });
        expect(result.media[2]).toEqual({
            url: 'http://example.com/img3.jpg',
            role: 'gallery',
            source: 'scraped',
            confidence_score: 1.0,
        });

        expect(result.selectedImages).toEqual([
            'http://example.com/img1.jpg',
            'http://example.com/img2.jpg',
            'http://example.com/img3.jpg'
        ]);
    });

    it('limits merged media and selected images to 12 items', () => {
        const existingMedia = [
            { url: 'http://example.com/img-existing.jpg', role: 'main', source: 'scraped', confidence_score: 1.0 }
        ];
        
        // Create 15 candidates
        const candidates = Array.from({ length: 15 }, (_, i) => `http://example.com/img-${i}.jpg`);

        const result = resolveProductMedia(
            existingMedia,
            {},
            {
                imageCandidates: candidates
            }
        );

        expect(result.media).toHaveLength(12);
        expect(result.selectedImages).toHaveLength(12);
        expect(result.media[0].url).toBe('http://example.com/img-existing.jpg');
        expect(result.media[1].url).toBe('http://example.com/img-0.jpg');
        expect(result.media[11].url).toBe('http://example.com/img-10.jpg');
    });

    it('defaults to the source with the most images when no existing media, selectedImages, or imageCandidates are present', () => {
        const result = resolveProductMedia([], {}, {
            selectedImages: [],
            imageCandidates: [],
            sources: {
                amazon: {
                    images: ['http://example.com/amazon1.jpg']
                },
                bci: {
                    images: ['http://example.com/bci1.jpg', 'http://example.com/bci2.jpg']
                }
            }
        });

        expect(result.media).toHaveLength(2);
        expect(result.media[0].url).toBe('http://example.com/bci1.jpg');
        expect(result.media[1].url).toBe('http://example.com/bci2.jpg');
        expect(result.selectedImages).toEqual([
            'http://example.com/bci1.jpg',
            'http://example.com/bci2.jpg'
        ]);
    });
});
