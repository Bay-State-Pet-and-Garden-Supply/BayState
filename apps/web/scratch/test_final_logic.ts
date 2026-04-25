import { getMappedCategorySlug } from '../lib/facets/category-mapping';

const tests = [
    { cat: 'Barn Supplies', type: 'Buckets & Feeders', expected: 'farm-animal-livestock-waterers-feeders' },
    { cat: 'Barn Supplies|Farm Animal', type: 'Buckets & Feeders', expected: 'farm-animal-livestock-waterers-feeders' },
    { cat: 'Dog Food', type: 'Dry Food', expected: 'dog-food-dry-food' },
    { cat: 'Cat Food', type: 'Wet Food', expected: 'cat-food-wet-food' },
    { cat: 'household', type: 'cleaning', expected: 'home-cleaning-pest-control' },
];

for (const test of tests) {
    const actual = getMappedCategorySlug(test.cat, test.type);
    console.log(`Test: ${test.cat} > ${test.type}`);
    console.log(`  Expected: ${test.expected}`);
    console.log(`  Actual:   ${actual}`);
    if (actual === test.expected) {
        console.log(`  ✅ PASS`);
    } else {
        console.log(`  ❌ FAIL`);
    }
}
