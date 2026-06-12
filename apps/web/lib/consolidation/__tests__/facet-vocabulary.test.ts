import { 
    removeRepeatedSubstrings, 
    validateFacetValue 
} from '../facet-vocabulary';

describe('facet-vocabulary tests', () => {
    describe('removeRepeatedSubstrings', () => {
        it('removes concatenated duplication - "AdultAdult" → "Adult"', () => {
            expect(removeRepeatedSubstrings('AdultAdult')).toBe('Adult');
        });

        it('removes lowercase duplication - "dogdog" → "dog"', () => {
            expect(removeRepeatedSubstrings('dogdog')).toBe('dog');
        });

        it('does not touch strings that are not exact double repeats - "Adult" → "Adult"', () => {
            expect(removeRepeatedSubstrings('Adult')).toBe('Adult');
            expect(removeRepeatedSubstrings('Harvest Chicken')).toBe('Harvest Chicken');
        });

        it('preserves casing of first repeat - "PuppyPuppy" → "Puppy"', () => {
            expect(removeRepeatedSubstrings('PuppyPuppy')).toBe('Puppy');
        });
    });

    describe('validateFacetValue', () => {
        const mockVocabulary = new Map<string, string[]>();
        mockVocabulary.set('life-stage', ['Puppy', 'Adult', 'Senior', 'All Life Stages']);
        mockVocabulary.set('flavor', ['Chicken', 'Beef', 'Salmon', 'Turkey', 'Lamb', 'Peanut Butter']);
        mockVocabulary.set('breed-size', ['Small Breed', 'Medium Breed', 'Large Breed']);

        it('exact match (case-insensitive)', () => {
            expect(validateFacetValue('life-stage', 'adult', mockVocabulary)).toBe('Adult');
            expect(validateFacetValue('life-stage', 'puppy', mockVocabulary)).toBe('Puppy');
        });

        it('resolves concatenated double words - "AdultAdult" → "Adult"', () => {
            expect(validateFacetValue('life-stage', 'AdultAdult', mockVocabulary)).toBe('Adult');
        });

        it('resolves compound marketing terms to canonical value - "Harvest Chicken" → "Chicken"', () => {
            expect(validateFacetValue('flavor', 'Harvest Chicken', mockVocabulary)).toBe('Chicken');
            expect(validateFacetValue('flavor', 'Delicious Roasted Turkey', mockVocabulary)).toBe('Turkey');
        });

        it('matches multi-word canonical values - "all life stages" → "All Life Stages"', () => {
            expect(validateFacetValue('life-stage', 'all life stages', mockVocabulary)).toBe('All Life Stages');
        });

        it('resolves longer specific phrases before short substring matches - "Peanut Butter Recipe" → "Peanut Butter"', () => {
            expect(validateFacetValue('flavor', 'Peanut Butter Recipe', mockVocabulary)).toBe('Peanut Butter');
        });

        it('returns null if there is no matching value in the vocabulary', () => {
            expect(validateFacetValue('life-stage', 'Kitten', mockVocabulary)).toBeNull();
            expect(validateFacetValue('flavor', 'Kangaroo', mockVocabulary)).toBeNull();
        });

        it('returns cleaned value if vocabulary is empty or missing key', () => {
            expect(validateFacetValue('new-facet', 'Some Value', mockVocabulary)).toBe('Some Value');
        });
    });
});
