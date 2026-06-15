# BayState Domain Glossary

## Brand
A catalog manufacturer/supplier identity stored in `brands`. In the Imported stage, `products_ingestion.brand_id` is the authoritative grouping and extraction eligibility field.

## Brand Group
The Imported-stage workspace grouping for products sharing the same direct `brand_id`. Brand Groups are an operator convenience for seeing remaining imported products by brand before extraction.

## No Brand
A synthetic Imported-stage group for products whose `products_ingestion.brand_id` is null. Operators select individual products from this group and assign a Brand before extraction.

## Product Line
A post-extraction consolidation grouping stored in `product_lines`. Product Lines are identified after products reach the processed/grouping stages; they are not available during Imported-stage brand assignment.

## Source Cascade
The per-brand extraction configuration that defines approved distributor/official sources and source priority. Extraction can only start when every selected product has a direct Brand and that Brand has a configured Source Cascade.

## Cohort
Removed legacy UPC-prefix grouping concept formerly represented by `cohort_batches`, `cohort_members`, and `products_ingestion.cohort_id`. Do not use Cohorts for new pipeline behavior; Imported-stage grouping is by Brand.
