# AI Search Benchmark Report

## Execution Metadata

- Generated: 2026-04-19T19:06:34.210473+00:00
- Dataset: `data/golden_dataset_v3.json`
- Mode: `heuristic`
- Duration: 515.072 ms
- Cache Dir: `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/data/benchmark_cache`
- LLM Config: `openai/gpt-4o-mini`

## Summary Metrics

| Metric | Value |
| --- | --- |
| Total Examples | 50 |
| Matched Examples | 43 |
| Accuracy (Exact Match %) | 86.000 |
| Mean Reciprocal Rank | 0.918333 |
| Precision@1 | 0.860000 |
| Recall@1 | 0.860000 |
| Accuracy 95% CI | 76.285% - 95.715% |
| Average Duration (ms) | 10.301 |
| Error Count | 0 |


- Total Serper Cost: $0.000000
- Total LLM Selection Cost: $0.000000
- Total Cost: $0.000000
- Cost per Success: $0.000000
- Serper API Calls: 0

## Category Breakdown

| Group | Samples | Accuracy % | MRR | Precision@1 | Recall@1 | Avg Time (ms) | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Aquariums | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 12.615 | 0 |
| Cat Food Dry | 3 | 33.333 | 0.555556 | 0.333333 | 0.333333 | 14.877 | 0 |
| Cat Food Wet | 2 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 9.761 | 0 |
| Cat Litter Accessories | 1 | 0.000 | 0.250000 | 0.000000 | 0.000000 | 12.329 | 0 |
| Cat Treats | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 13.093 | 0 |
| Collectible Animal Figurines | 8 | 87.500 | 0.937500 | 0.875000 | 0.875000 | 7.941 | 0 |
| Dog Food Dry | 4 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 10.948 | 0 |
| Dog Food Toppers | 2 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 12.890 | 0 |
| Dog Food Wet | 2 | 50.000 | 0.750000 | 0.500000 | 0.500000 | 11.434 | 0 |
| Dog Supplements | 3 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 10.052 | 0 |
| Dog Toys | 2 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 7.508 | 0 |
| Dog Treats | 2 | 50.000 | 0.750000 | 0.500000 | 0.500000 | 10.867 | 0 |
| Farm & Garden Pest Control | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 8.893 | 0 |
| Flea & Tick Treatments | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 8.122 | 0 |
| Garden > Mulch | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 13.078 | 0 |
| Garden Decor | 4 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 8.420 | 0 |
| Garden Seeds | 2 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 8.434 | 0 |
| Horse Treats | 3 | 66.667 | 0.833333 | 0.666667 | 0.666667 | 11.052 | 0 |
| Outdoor Fountains | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 8.869 | 0 |
| Poultry Bedding | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 8.153 | 0 |
| Poultry Feed | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 8.272 | 0 |
| Small Engine Fuel | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 14.086 | 0 |
| Toy Vehicles | 2 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 6.190 | 0 |
| Utility Fuel Containers | 1 | 100.000 | 1.000000 | 1.000000 | 1.000000 | 7.705 | 0 |

## Category Analysis

- Underperforming threshold: < 70.000% exact-match accuracy
- Underperforming categories: Cat Food Dry, Cat Litter Accessories, Dog Food Wet, Dog Treats, Horse Treats

| Category | Samples | Accuracy % | Status | Trend vs Baseline | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Aquariums | 1 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Aquariums and reuse its strongest source signals in a… |
| Cat Food Dry | 3 | 33.333 | ⚠️ Underperforming | No baseline | Prioritize category-specific source-selection tuning for Cat Food Dry and review the missed que… |
| Cat Food Wet | 2 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Cat Food Wet and reuse its strongest source signals i… |
| Cat Litter Accessories | 1 | 0.000 | ⚠️ Underperforming | No baseline | Prioritize category-specific source-selection tuning for Cat Litter Accessories and review the… |
| Cat Treats | 1 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Cat Treats and reuse its strongest source signals in… |
| Collectible Animal Figu… | 8 | 87.500 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Collectible Animal Figurines and reuse its strongest… |
| Dog Food Dry | 4 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Dog Food Dry and reuse its strongest source signals i… |
| Dog Food Toppers | 2 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Dog Food Toppers and reuse its strongest source signa… |
| Dog Food Wet | 2 | 50.000 | ⚠️ Underperforming | No baseline | Prioritize category-specific source-selection tuning for Dog Food Wet and review the missed que… |
| Dog Supplements | 3 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Dog Supplements and reuse its strongest source signal… |
| Dog Toys | 2 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Dog Toys and reuse its strongest source signals in ad… |
| Dog Treats | 2 | 50.000 | ⚠️ Underperforming | No baseline | Prioritize category-specific source-selection tuning for Dog Treats and review the missed queri… |
| Farm & Garden Pest Cont… | 1 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Farm & Garden Pest Control and reuse its strongest so… |
| Flea & Tick Treatments | 1 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Flea & Tick Treatments and reuse its strongest source… |
| Garden > Mulch | 1 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Garden > Mulch and reuse its strongest source signals… |
| Garden Decor | 4 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Garden Decor and reuse its strongest source signals i… |
| Garden Seeds | 2 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Garden Seeds and reuse its strongest source signals i… |
| Horse Treats | 3 | 66.667 | ⚠️ Underperforming | No baseline | Prioritize category-specific source-selection tuning for Horse Treats and review the missed que… |
| Outdoor Fountains | 1 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Outdoor Fountains and reuse its strongest source sign… |
| Poultry Bedding | 1 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Poultry Bedding and reuse its strongest source signal… |
| Poultry Feed | 1 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Poultry Feed and reuse its strongest source signals i… |
| Small Engine Fuel | 1 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Small Engine Fuel and reuse its strongest source sign… |
| Toy Vehicles | 2 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Toy Vehicles and reuse its strongest source signals i… |
| Utility Fuel Containers | 1 | 100.000 | ✅ Healthy | No baseline | Maintain the current ranking strategy for Utility Fuel Containers and reuse its strongest sourc… |

## Category Comparison Visualization

```text
Status Category          Accuracy Bar            Accuracy Trend
------ ---------------- -------------------- -------- ----------------
✅ Aquariums        ████████████████████  100.0% (1/1) No baseline
⚠️ Cat Food Dry     ███████░░░░░░░░░░░░░   33.3% (1/3) No baseline
✅ Cat Food Wet     ████████████████████  100.0% (2/2) No baseline
⚠️ Cat Litter Accessories ░░░░░░░░░░░░░░░░░░░░    0.0% (0/1) No baseline
✅ Cat Treats       ████████████████████  100.0% (1/1) No baseline
✅ Collectible Animal Figurines ██████████████████░░   87.5% (7/8) No baseline
✅ Dog Food Dry     ████████████████████  100.0% (4/4) No baseline
✅ Dog Food Toppers ████████████████████  100.0% (2/2) No baseline
⚠️ Dog Food Wet     ██████████░░░░░░░░░░   50.0% (1/2) No baseline
✅ Dog Supplements  ████████████████████  100.0% (3/3) No baseline
✅ Dog Toys         ████████████████████  100.0% (2/2) No baseline
⚠️ Dog Treats       ██████████░░░░░░░░░░   50.0% (1/2) No baseline
✅ Farm & Garden Pest Control ████████████████████  100.0% (1/1) No baseline
✅ Flea & Tick Treatments ████████████████████  100.0% (1/1) No baseline
✅ Garden > Mulch   ████████████████████  100.0% (1/1) No baseline
✅ Garden Decor     ████████████████████  100.0% (4/4) No baseline
✅ Garden Seeds     ████████████████████  100.0% (2/2) No baseline
⚠️ Horse Treats     █████████████░░░░░░░   66.7% (2/3) No baseline
✅ Outdoor Fountains ████████████████████  100.0% (1/1) No baseline
✅ Poultry Bedding  ████████████████████  100.0% (1/1) No baseline
✅ Poultry Feed     ████████████████████  100.0% (1/1) No baseline
✅ Small Engine Fuel ████████████████████  100.0% (1/1) No baseline
✅ Toy Vehicles     ████████████████████  100.0% (2/2) No baseline
✅ Utility Fuel Containers ████████████████████  100.0% (1/1) No baseline
```

## Difficulty Breakdown

| Group | Samples | Accuracy % | MRR | Precision@1 | Recall@1 | Avg Time (ms) | Errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| easy | 34 | 88.235 | 0.933824 | 0.882353 | 0.882353 | 9.998 | 0 |
| hard | 5 | 60.000 | 0.733333 | 0.600000 | 0.600000 | 11.795 | 0 |
| medium | 11 | 90.909 | 0.954545 | 0.909091 | 0.909091 | 9.040 | 0 |

## Per-Example Results

| # | Query | Expected | Actual | Score | Rank | Time (ms) | Match |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Stud Muffins Horse Treats 45 oz Tub | https://www.bigdweb.com/stud-muffins-horse-treat-45-oz-… | https://www.cheshirehorse.com/p/stud-muffins-horse-trea… | 15.000 | 2 | 13.109 | ❌ |
| 1 | Four Paws Wee-Wee Cat Pads 11x17 10ct | https://www.fourpaws.com/products/wee-wee-cat-litter-bo… | https://www.chewy.com/wee-wee-four-paws-litter-box-cat-… | 22.800 | 4 | 12.329 | ❌ |
| 2 | Outward Hound Dog Hide N Slide | https://outwardhound.com/dog-hide-n-slide-purple.html | https://outwardhound.com/dog-hide-n-slide-purple.html | 21.500 | 1 | 9.009 | ✅ |
| 3 | FirstMate Pacific Ocean Fish Meal with Blueberr… | https://firstmate.com/product/pacific-ocean-fish-meal-w… | https://firstmate.com/product/pacific-ocean-fish-meal-w… | 18.500 | 1 | 14.299 | ✅ |
| 4 | FirstMate Limited Ingredient Pork & Apple Formu… | https://firstmate.com/product/pork-apple-formula-for-do… | https://www.chewy.com/firstmate-limited-ingredient-pork… | 18.500 | 2 | 8.218 | ❌ |
| 5 | Alpine Corporation 16 Tall Glossy Metal Rooster… | https://www.homedepot.com/p/Alpine-Corporation-16-in-Ta… | https://www.homedepot.com/p/Alpine-Corporation-16-in-Ta… | 21.000 | 1 | 8.672 | ✅ |
| 6 | Alpine Corporation Frog Statue with Metal Butte… | https://www.homedepot.com/p/Alpine-Corporation-Frog-wit… | https://www.homedepot.com/p/Alpine-Corporation-Frog-wit… | 18.500 | 1 | 6.256 | ✅ |
| 7 | Stud Muffins Horse Treats 10 oz Tub | https://www.bigdweb.com/stud-muffins-horse-treats-10-oz… | https://www.bigdweb.com/stud-muffins-horse-treats-10-oz… | 17.000 | 1 | 12.195 | ✅ |
| 8 | Outward Hound Dog Casino Interactive Treat Puzz… | https://outwardhound.com/dog-casino.html | https://outwardhound.com/dog-casino.html | 20.800 | 1 | 6.006 | ✅ |
| 9 | Nootie Progility Calming Soft Chews 90 ct | https://nootie.com/products/progility-calming-aid-soft-… | https://nootie.com/products/progility-calming-aid-soft-… | 20.000 | 1 | 7.773 | ✅ |
| 10 | Manna Pro Fresh Flakes Poultry Bedding 12 Lb | https://mannapro.com/products/fresh-flakes-poultry-bedd… | https://mannapro.com/products/fresh-flakes-poultry-bedd… | 19.200 | 1 | 8.153 | ✅ |
| 11 | Schleich Holstein Cow | https://us.schleich-s.com/products/holstein-cow-13797-1… | https://us.schleich-s.com/products/holstein-cow-13797-1… | 18.200 | 1 | 5.733 | ✅ |
| 12 | Scotts Nature Scapes Color Enhanced Mulch Deep… | https://scottsmiraclegro.com/en-us/scotts-nature-scapes… | https://scottsmiraclegro.com/en-us/scotts-nature-scapes… | 21.000 | 1 | 13.078 | ✅ |
| 13 | Schleich Paint Horse Gelding | https://us.schleich-s.com/products/paint-horse-gelding-… | https://us.schleich-s.com/products/paint-horse-gelding-… | 18.200 | 1 | 18.214 | ✅ |
| 14 | Tomy John Deere 860i Gator | https://us.tomy.com/john-deere-1-32-scale-rsx-860i-gato… | https://us.tomy.com/john-deere-1-32-scale-rsx-860i-gato… | 19.500 | 1 | 7.242 | ✅ |
| 15 | Stella & Chewy s Dog Topper Shreds Beef Salmon… | https://www.stellaandchewys.com/products/stellas-shredr… | https://www.stellaandchewys.com/products/stellas-shredr… | 20.000 | 1 | 12.328 | ✅ |
| 16 | Blue Buffalo Tastefuls Salmon Entree Pate Wet C… | https://www.bluebuffalo.com/wet-cat-food/tastefuls/salm… | https://www.bluebuffalo.com/wet-cat-food/tastefuls/salm… | 22.500 | 1 | 11.561 | ✅ |
| 17 | Alpine 20 Multi-Level Rock Fountain with LED Li… | https://www.homedepot.com/p/Alpine-Corporation-20-in-Ta… | https://www.homedepot.com/p/Alpine-Corporation-20-in-Ta… | 20.000 | 1 | 8.869 | ✅ |
| 18 | Alpine Corporation 28 Tall Multi-Colored Metal… | https://www.homedepot.com/p/Alpine-Corporation-28-in-Ta… | https://www.homedepot.com/p/Alpine-Corporation-28-in-Ta… | 20.500 | 1 | 7.954 | ✅ |
| 19 | VP Racing 5.5 Gallon Motorsport Utility Jug wit… | https://www.summitracing.com/parts/fpf-3556-ca?srsltid=… | https://www.summitracing.com/parts/fpf-3556-ca?srsltid=… | 25.900 | 1 | 7.705 | ✅ |
| 20 | Etta Says Flavor Fusion Salmon & Sweet Potato 1… | https://www.thepetbeastro.com/etta-says-flavor-fusion-d… | https://www.hollywoodfeed.com/p/18721/etta-says-flavor-… | 16.500 | 2 | 13.810 | ❌ |
| 21 | Schleich Clydesdale Gelding Horse Toy Figurine | https://us.schleich-s.com/products/clydesdale-gelding-1… | https://us.schleich-s.com/products/clydesdale-gelding-1… | 17.700 | 1 | 6.005 | ✅ |
| 22 | Alpine Corporation Large Round Sunflowers Welco… | https://www.homedepot.com/p/Alpine-Corporation-30-in-Ro… | https://www.homedepot.com/p/Alpine-Corporation-30-in-Ro… | 19.500 | 1 | 10.798 | ✅ |
| 23 | FirstMate Grain-Free Chicken Meal with Blueberr… | https://firstmate.com/product/chicken-meal-with-blueber… | https://firstmate.com/product/chicken-meal-with-blueber… | 19.000 | 1 | 13.294 | ✅ |
| 24 | Manna Pro Bite Size Alfalfa Molasses Nuggets 4… | https://mannapro.com/products/bite-size-nuggets-horse-t… | https://mannapro.com/products/bite-size-nuggets-horse-t… | 19.500 | 1 | 7.851 | ✅ |
| 25 | Weruva Puddy Pops Chicken Lickable Cat Treats 5… | https://www.weruva.com/products/puddy-pops-chicken-lick… | https://www.weruva.com/products/puddy-pops-chicken-lick… | 19.000 | 1 | 13.093 | ✅ |
| 26 | Schleich American Shorthair Cat | https://us.schleich-s.com/products/american-shorthair-c… | https://us.schleich-s.com/products/american-shorthair-c… | 19.200 | 1 | 5.897 | ✅ |
| 27 | Stella & Chewy s Dog Topper Shreds Beef Lamb In… | https://www.stellaandchewys.com/products/stellas-shredr… | https://www.stellaandchewys.com/products/stellas-shredr… | 20.000 | 1 | 13.452 | ✅ |
| 28 | FirstMate Chicken Meal with Blueberries Formula… | https://firstmate.com/product/chicken-meal-with-blueber… | https://www.chewy.com/firstmate-chicken-meal-blueberrie… | 19.500 | 2 | 13.260 | ❌ |
| 29 | Schleich Mule Figurine Brown/Black | https://us.schleich-s.com/products/mule-14889?srsltid=A… | https://us.schleich-s.com/products/mule-14889?srsltid=A… | 13.100 | 1 | 6.041 | ✅ |
| 30 | Schleich® Sitting Cat | https://us.schleich-s.com/products/cat-sitting-13771-1?… | https://us.schleich-s.com/products/cat-sitting-13771-1?… | 18.700 | 1 | 5.963 | ✅ |
| 31 | FirstMate Limited Ingredient Diet Grain-Free Au… | https://firstmate.com/product/australian-lamb-meal-form… | https://firstmate.com/product/australian-lamb-meal-form… | 19.000 | 1 | 8.653 | ✅ |
| 32 | The Honest Kitchen Grain Free Turkey & Chicken… | https://www.thehonestkitchen.com/products/grain-free-tu… | https://www.thehonestkitchen.com/products/grain-free-ch… | 20.500 | 6 | 17.071 | ❌ |
| 33 | FirstMate Limited Ingredient Cage-Free Turkey F… | https://firstmate.com/product/cage-free-turkey-rice-for… | https://firstmate.com/product/cage-free-turkey-rice-for… | 22.500 | 1 | 14.650 | ✅ |
| 34 | NutriSource Cat & Kitten Canned Cat Food Ocean… | https://nutrisourcepetfoods.com/our-food/ocean-select-e… | https://nutrisourcepetfoods.com/our-food/ocean-select-e… | 19.000 | 1 | 7.962 | ✅ |
| 35 | Fluval Betta Premium Aquarium Kit 2.6 Gallon | https://fluvalaquatics.com/us/shop/product/betta-premiu… | https://fluvalaquatics.com/us/shop/product/betta-premiu… | 17.000 | 1 | 12.615 | ✅ |
| 36 | Schleich Knabstrupper Foal | https://us.schleich-s.com/products/knapstrupper-foal-13… | https://schleichhorses.fandom.com/wiki/Knabstrupper | 12.000 | 2 | 9.401 | ❌ |
| 37 | VP Racing Fuels Ethanol-Free 2-Cycle Pre-Mixed… | https://vpracingfuels.com/products/vp-50-1-fuel-mix-sma… | https://vpracingfuels.com/products/vp-50-1-fuel-mix-sma… | 17.900 | 1 | 14.086 | ✅ |
| 38 | BENTLEY SUNFLOWER SEED PACKET CHOCOLATE CHERRY | https://bentleyseeds.com/products/sunflower-chocolate-c… | https://bentleyseeds.com/products/sunflower-chocolate-c… | 20.700 | 1 | 5.072 | ✅ |
| 39 | Nootie Progility Allergy & Immune Soft Chew 90… | https://nootie.com/products/progility-allergy-relief-so… | https://nootie.com/products/progility-allergy-relief-so… | 20.000 | 1 | 13.509 | ✅ |
| 40 | Lake Valley Seed Cucumber Spacemaster Organic | https://lakevalleyseed.com/product/item-4282-cucumber-s… | https://lakevalleyseed.com/product/item-4282-cucumber-s… | 21.800 | 1 | 11.797 | ✅ |
| 41 | John Deere 1:64 Scale 4WD Tractor Toy | https://shop.deere.com/us/product/Collect-N-Play-1-64-4… | https://shop.deere.com/us/product/Collect-N-Play-1-64-4… | 20.200 | 1 | 5.138 | ✅ |
| 42 | Open Farm Immune Health Supplement Chews for Do… | https://openfarmpet.com/products/immune-supplements | https://openfarmpet.com/products/immune-supplements | 20.400 | 1 | 8.875 | ✅ |
| 43 | Open Farm Catch Of The Season Whitefish Recipe… | https://openfarmpet.com/products/catch-of-the-season-wh… | https://openfarmpet.com/products/catch-of-the-season-wh… | 20.500 | 1 | 8.740 | ✅ |
| 44 | St. Gabriel Organics GoodEarth Diatomaceous Ear… | https://www.acehardware.com/departments/lawn-and-garden… | https://www.acehardware.com/departments/lawn-and-garden… | 16.000 | 1 | 8.893 | ✅ |
| 45 | FirstMate Limited Ingredient Diet Australian La… | https://firstmate.com/product/australian-lamb-meal-form… | https://firstmate.com/product/australian-lamb-meal-form… | 18.500 | 1 | 13.104 | ✅ |
| 46 | Advantage II Flea Control for Kittens 2 Pack | https://www.petco.com/shop/en/petcostore/product/advant… | https://www.petco.com/shop/en/petcostore/product/advant… | 16.800 | 1 | 8.122 | ✅ |
| 47 | Manna Pro Duck Starter Grower Crumbles - 8 lb | https://mannapro.com/products/duck-starter-grower-crumb… | https://mannapro.com/products/duck-starter-grower-crumb… | 20.900 | 1 | 8.272 | ✅ |
| 48 | Etta Says! Flavor Fusion Duck & Pumpkin 1.5 oz | https://www.chewy.com/etta-says-fusion-gourmet-adult-du… | https://www.chewy.com/etta-says-fusion-gourmet-adult-du… | 17.300 | 1 | 7.924 | ✅ |
| 49 | Schleich Golden Retriever Puppy Toy Figurine | https://us.schleich-s.com/products/golden-retriever-pup… | https://us.schleich-s.com/products/golden-retriever-pup… | 18.200 | 1 | 6.274 | ✅ |
