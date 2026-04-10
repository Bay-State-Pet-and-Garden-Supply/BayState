# Fleet Health Matrix

**Generated At:** 2026-04-10T02:57:09.455496+00:00
**Structured JSON:** `.artifacts/audits/fleet-health-matrix.json`

## Fleet Summary

| Metric | Value |
|--------|-------|
| Scrapers Audited | 12 |
| Healthy | 3 |
| Degraded | 6 |
| Critical | 3 |
| Average Score | 79.6 |

## Health Ranking

| Scraper | Status | Score | Positive | Negative | Edge | Required Coverage | Optional Coverage | Notes |
|---------|--------|-------|----------|----------|------|-------------------|-------------------|-------|
| countrymax | Healthy | 100.0 | 1/1 | 1/1 | 1/1 | 100.0% | 100.0% | None |
| gardeners | Healthy | 100.0 | 1/1 | 1/1 | 1/1 | 100.0% | n/a | None |
| mazuri | Healthy | 100.0 | 1/1 | 1/1 | 1/1 | 100.0% | n/a | None |
| bradley | Degraded | 98.9 | 1/1 | 1/1 | 1/1 | 100.0% | 77.8% | Optional fields always missing: Description, Dimensions; Optional Field Coverage |
| coastal | Degraded | 97.1 | 1/1 | 1/1 | 1/1 | 100.0% | 42.9% | Optional fields always missing: Description, Dimensions, Features, Weight; Boundary Warning |
| amazon | Degraded | 95.8 | 1/1 | 1/1 | 1/1 | 100.0% | 16.7% | Optional fields always missing: Ingredients, Weight; Optional Field Coverage |
| central-pet | Degraded | 95.8 | 1/1 | 1/1 | 1/1 | 100.0% | 16.7% | Optional fields always missing: Dimensions, Features, Mfg Part #, UPC, Weight; Optional Field Coverage |
| petswarehouse | Degraded | 95.0 | 1/1 | 1/1 | 1/1 | 100.0% | 0.0% | Optional fields always missing: Brand, Description, Item Number; Optional Field Coverage |
| petedge | Degraded | 92.5 | 1/1 | 1/1 | 1/1 | 66.7% | 50.0% | Boundary Warning |
| petfoodex | Critical | 70.0 | 1/1 | 0/1 | 1/1 | 100.0% | 0.0% | Optional fields always missing: Attributes, Description, Features, Image URLs, Ingredients, Product Meta, UoM, Weight; Validation Failure; Optional Field Coverage |
| orgill | Critical | 5.0 | 0/1 | 0/1 | 0/1 | 0.0% | n/a | Navigation Failure |
| phillips | Critical | 5.0 | 0/1 | 0/1 | 0/1 | 0.0% | n/a | Navigation Failure |

## countrymax — Healthy

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/countrymax.yaml`
- **Score:** 100.0
- **Required Coverage:** 100.0%
- **Optional Coverage:** 100.0%

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 1 | 0 | 0 |
| Negative Validation | 1 | 1 | 0 | 0 |
| Boundary Testing | 1 | 1 | 0 | 0 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| Brand | No | 100.0% | 100.0% | None | None |
| Description | No | 100.0% | 100.0% | None | None |
| Image URLs | Yes | 100.0% | 100.0% | None | None |
| SKU | Yes | 100.0% | 100.0% | None | None |
| Name | Yes | 100.0% | 100.0% | None | None |
| UPC | No | 100.0% | 100.0% | None | None |

### Findings

- No audit findings.

## gardeners — Healthy

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/gardeners.yaml`
- **Score:** 100.0
- **Required Coverage:** 100.0%
- **Optional Coverage:** n/a

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 1 | 0 | 0 |
| Negative Validation | 1 | 1 | 0 | 0 |
| Boundary Testing | 1 | 1 | 0 | 0 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| SKU | Yes | 100.0% | 100.0% | None | None |

### Findings

- No audit findings.

## mazuri — Healthy

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/mazuri.yaml`
- **Score:** 100.0
- **Required Coverage:** 100.0%
- **Optional Coverage:** n/a

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 1 | 0 | 0 |
| Negative Validation | 1 | 1 | 0 | 0 |
| Boundary Testing | 1 | 1 | 0 | 0 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| SKU | Yes | 100.0% | 100.0% | None | None |

### Findings

- No audit findings.

## bradley — Degraded

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/bradley.yaml`
- **Score:** 98.9
- **Required Coverage:** 100.0%
- **Optional Coverage:** 77.8%

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 1 | 0 | 0 |
| Negative Validation | 1 | 1 | 0 | 0 |
| Boundary Testing | 1 | 1 | 0 | 0 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| BCI Item Number | No | 100.0% | 100.0% | None | None |
| Brand | Yes | 100.0% | 100.0% | None | None |
| Case Pack | No | 100.0% | 100.0% | None | None |
| Description | No | 0.0% | n/a | 001135 | None |
| Dimensions | No | 0.0% | n/a | 001135 | None |
| Image URLs | Yes | 100.0% | 100.0% | None | None |
| Ingredients | No | 100.0% | 100.0% | None | None |
| Manufacturer # | No | 100.0% | 100.0% | None | None |
| SKU | Yes | 100.0% | 100.0% | None | None |
| Name | Yes | 100.0% | 100.0% | None | None |
| Unit of Measure | No | 100.0% | 100.0% | None | None |
| UPC | No | 100.0% | 100.0% | None | None |
| Weight | No | 100.0% | 100.0% | None | None |

### Findings

- **Degraded — Optional Field Coverage**: Optional fields always missing: Description, Dimensions. Action: Review optional selector quality for this vendor and confirm whether the fields are still obtainable.

## coastal — Degraded

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/coastal.yaml`
- **Score:** 97.1
- **Required Coverage:** 100.0%
- **Optional Coverage:** 42.9%

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 1 | 1 | 0 |
| Negative Validation | 1 | 1 | 0 | 0 |
| Boundary Testing | 1 | 1 | 1 | 0 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| Brand | Yes | 100.0% | 100.0% | None | None |
| Description | No | 0.0% | n/a | HSCP2, A | None |
| Dimensions | No | 0.0% | n/a | HSCP2, A | None |
| Features | No | 0.0% | n/a | HSCP2, A | None |
| Image URLs | Yes | 100.0% | 100.0% | None | None |
| Item Number | No | 100.0% | 100.0% | None | None |
| Size | No | 100.0% | 100.0% | None | None |
| SKU | Yes | 100.0% | 100.0% | None | None |
| Name | Yes | 100.0% | 100.0% | None | None |
| UPC | No | 100.0% | 100.0% | None | None |
| Weight | No | 0.0% | n/a | HSCP2, A | None |

### Findings

- **Degraded — Boundary Warning**: Positive Validation warning for HSCP2: Discarded suspicious item_number value Action: Review optional field quality for this vendor.
- **Degraded — Boundary Warning**: Boundary Testing warning for A: Discarded suspicious item_number value Action: Review boundary-state handling for this vendor.
- **Degraded — Optional Field Coverage**: Optional fields always missing: Description, Dimensions, Features, Weight. Action: Review optional selector quality for this vendor and confirm whether the fields are still obtainable.

## amazon — Degraded

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/amazon.yaml`
- **Score:** 95.8
- **Required Coverage:** 100.0%
- **Optional Coverage:** 16.7%

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 1 | 0 | 0 |
| Negative Validation | 1 | 1 | 0 | 0 |
| Boundary Testing | 1 | 1 | 0 | 0 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| Brand | Yes | 100.0% | 100.0% | None | None |
| Description | Yes | 100.0% | 100.0% | None | None |
| Dimensions | No | 50.0% | 100.0% | A1 | None |
| Features | Yes | 100.0% | 100.0% | None | None |
| Images | Yes | 100.0% | 100.0% | None | None |
| Ingredients | No | 0.0% | n/a | 035585499741, A1 | None |
| SKU | Yes | 100.0% | 100.0% | None | None |
| Name | Yes | 100.0% | 100.0% | None | None |
| Weight | No | 0.0% | n/a | 035585499741, A1 | None |

### Findings

- **Degraded — Optional Field Coverage**: Optional fields always missing: Ingredients, Weight. Action: Review optional selector quality for this vendor and confirm whether the fields are still obtainable.

## central-pet — Degraded

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/central-pet.yaml`
- **Score:** 95.8
- **Required Coverage:** 100.0%
- **Optional Coverage:** 16.7%

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 1 | 0 | 0 |
| Negative Validation | 1 | 1 | 0 | 0 |
| Boundary Testing | 1 | 1 | 0 | 0 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| Brand | Yes | 100.0% | 100.0% | None | None |
| Description | No | 100.0% | 100.0% | None | None |
| Dimensions | No | 0.0% | n/a | 38777520 | None |
| Features | No | 0.0% | n/a | 38777520 | None |
| Image URLs | Yes | 100.0% | 100.0% | None | None |
| Mfg Part # | No | 0.0% | n/a | 38777520 | None |
| SKU | Yes | 100.0% | 100.0% | None | None |
| Name | Yes | 100.0% | 100.0% | None | None |
| UPC | No | 0.0% | n/a | 38777520 | None |
| Weight | No | 0.0% | n/a | 38777520 | None |

### Findings

- **Degraded — Optional Field Coverage**: Optional fields always missing: Dimensions, Features, Mfg Part #, UPC, Weight. Action: Review optional selector quality for this vendor and confirm whether the fields are still obtainable.

## petswarehouse — Degraded

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/petswarehouse.yaml`
- **Score:** 95.0
- **Required Coverage:** 100.0%
- **Optional Coverage:** 0.0%

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 1 | 0 | 0 |
| Negative Validation | 1 | 1 | 0 | 0 |
| Boundary Testing | 1 | 1 | 0 | 0 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| Brand | No | 0.0% | n/a | 042055302456, A | None |
| Description | No | 0.0% | n/a | 042055302456, A | None |
| Image URLs | Yes | 100.0% | 100.0% | None | None |
| Item Number | No | 0.0% | n/a | 042055302456, A | None |
| SKU | Yes | 100.0% | 100.0% | None | None |
| Name | Yes | 100.0% | 100.0% | None | None |

### Findings

- **Degraded — Optional Field Coverage**: Optional fields always missing: Brand, Description, Item Number. Action: Review optional selector quality for this vendor and confirm whether the fields are still obtainable.

## petedge — Degraded

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/petedge.yaml`
- **Score:** 92.5
- **Required Coverage:** 66.7%
- **Optional Coverage:** 50.0%

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 1 | 0 | 0 |
| Negative Validation | 1 | 1 | 0 | 0 |
| Boundary Testing | 1 | 1 | 1 | 0 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| Brand | No | 50.0% | 100.0% | A | None |
| Description | No | 50.0% | 100.0% | A | None |
| Image URLs | Yes | 50.0% | 100.0% | A | None |
| SKU | Yes | 100.0% | 100.0% | None | None |
| Name | Yes | 50.0% | 100.0% | A | None |
| UPC | No | 50.0% | 100.0% | A | None |

### Findings

- **Degraded — Boundary Warning**: Boundary Testing warning for A: Boundary case completed without crashing but omitted required product fields. Action: Review boundary-state handling for this vendor.

## petfoodex — Critical

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/petfoodex.yaml`
- **Score:** 70.0
- **Required Coverage:** 100.0%
- **Optional Coverage:** 0.0%

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 1 | 0 | 0 |
| Negative Validation | 1 | 0 | 0 | 1 |
| Boundary Testing | 1 | 1 | 0 | 0 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| Attributes | No | 0.0% | n/a | 33011808, 1 | None |
| Description | No | 0.0% | n/a | 33011808, 1 | None |
| Features | No | 0.0% | n/a | 33011808, 1 | None |
| Image URLs | No | 0.0% | n/a | 33011808, 1 | None |
| Ingredients | No | 0.0% | n/a | 33011808, 1 | None |
| Product Meta | No | 0.0% | n/a | 33011808, 1 | None |
| SKU | Yes | 100.0% | 100.0% | None | None |
| Name | Yes | 100.0% | 100.0% | None | None |
| UoM | No | 0.0% | n/a | 33011808, 1 | None |
| Weight | No | 0.0% | n/a | 33011808, 1 | None |

### Findings

- **Critical — Validation Failure**: Negative Validation failed for xyzabc123notexist456: Fake SKU did not trigger no-results detection. Action: Update ValidationConfig selectors/text patterns or confirm the fake SKU is still invalid.
- **Critical — Optional Field Coverage**: Optional fields always missing: Attributes, Description, Features, Image URLs, Ingredients, Product Meta, UoM, Weight. Action: Review optional selector quality for this vendor and confirm whether the fields are still obtainable.

### Actionable Failure Logs

| Tier | SKU | Category | Failure Type | URL | Error | Suggested Action |
|------|-----|----------|--------------|-----|-------|------------------|
| Negative Validation | xyzabc123notexist456 | Validation Failure | no_results | https://orders.petfoodexperts.com/SignIn?returnUrl=%2fSearch%3fquery%3dxyzabc123notexist456 | Fake SKU did not trigger no-results detection. | Update ValidationConfig selectors/text patterns or confirm the fake SKU is still invalid. |

## orgill — Critical

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/orgill.yaml`
- **Score:** 5.0
- **Required Coverage:** 0.0%
- **Optional Coverage:** n/a

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 0 | 0 | 1 |
| Negative Validation | 1 | 0 | 0 | 1 |
| Boundary Testing | 1 | 0 | 0 | 1 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| Brand | No | n/a | n/a | None | None |
| Category | No | n/a | n/a | None | None |
| Description | No | n/a | n/a | None | None |
| Dimensions | No | n/a | n/a | None | None |
| Features | No | n/a | n/a | None | None |
| Image URLs | No | n/a | n/a | None | None |
| model_number | No | n/a | n/a | None | None |
| SKU | Yes | n/a | n/a | None | None |
| Name | Yes | n/a | n/a | None | None |
| UPC | No | n/a | n/a | None | None |
| Weight | No | n/a | n/a | None | None |

### Findings

- **Critical — Navigation Failure**: Positive Validation failed for 037193347322: Element wait timed out after 10s: ['#cphMainContent_ctl00_lblDescription', '#cphMainContent_ctl00_lblErrorMessage', '#cphMainContent_ctl00_lblSearchSubHeader', "//span[contains(text(), 'Found 0 results')]", '.no-results'] | hint=Increase timeout multiplier and retry Action: Inspect navigation flow, target availability, and timeout settings for this scraper.
- **Critical — Navigation Failure**: Negative Validation failed for zzzzqqqq9999xxxx: Element wait timed out after 10s: ['#cphMainContent_ctl00_lblDescription', '#cphMainContent_ctl00_lblErrorMessage', '#cphMainContent_ctl00_lblSearchSubHeader', "//span[contains(text(), 'Found 0 results')]", '.no-results'] | hint=Increase timeout multiplier and retry Action: Inspect navigation flow, target availability, and timeout settings for this scraper.
- **Critical — Navigation Failure**: Boundary Testing failed for 123: Element wait timed out after 10s: ['#cphMainContent_ctl00_lblDescription', '#cphMainContent_ctl00_lblErrorMessage', '#cphMainContent_ctl00_lblSearchSubHeader', "//span[contains(text(), 'Found 0 results')]", '.no-results'] | hint=Increase timeout multiplier and retry Action: Inspect navigation flow, target availability, and timeout settings for this scraper.

### Actionable Failure Logs

| Tier | SKU | Category | Failure Type | URL | Error | Suggested Action |
|------|-----|----------|--------------|-----|-------|------------------|
| Positive Validation | 037193347322 | Navigation Failure | network_error | https://www.orgill.com/Default.aspx | Element wait timed out after 10s: ['#cphMainContent_ctl00_lblDescription', '#cphMainContent_ctl00_lblErrorMessage', '#cphMainContent_ctl00_lblSearchSubHeader', "//span[contains(text(), 'Found 0 results')]", '.no-results'] / hint=Increase timeout multiplier and retry | Inspect navigation flow, target availability, and timeout settings for this scraper. |
| Negative Validation | zzzzqqqq9999xxxx | Navigation Failure | network_error | https://www.orgill.com/Default.aspx | Element wait timed out after 10s: ['#cphMainContent_ctl00_lblDescription', '#cphMainContent_ctl00_lblErrorMessage', '#cphMainContent_ctl00_lblSearchSubHeader', "//span[contains(text(), 'Found 0 results')]", '.no-results'] / hint=Increase timeout multiplier and retry | Inspect navigation flow, target availability, and timeout settings for this scraper. |
| Boundary Testing | 123 | Navigation Failure | network_error | https://www.orgill.com/Default.aspx | Element wait timed out after 10s: ['#cphMainContent_ctl00_lblDescription', '#cphMainContent_ctl00_lblErrorMessage', '#cphMainContent_ctl00_lblSearchSubHeader', "//span[contains(text(), 'Found 0 results')]", '.no-results'] / hint=Increase timeout multiplier and retry | Inspect navigation flow, target availability, and timeout settings for this scraper. |

## phillips — Critical

- **Config:** `/Users/nickborrello/Desktop/Projects/BayState/apps/scraper/scrapers/configs/phillips.yaml`
- **Score:** 5.0
- **Required Coverage:** 0.0%
- **Optional Coverage:** n/a

### Tier Summary

| Tier | Total | Passed | Warnings | Failed |
|------|-------|--------|----------|--------|
| Positive Validation | 1 | 0 | 0 | 1 |
| Negative Validation | 1 | 0 | 0 | 1 |
| Boundary Testing | 1 | 0 | 0 | 1 |

### Field Audit

| Field | Required | Presence | Type Valid | Missing SKUs | Invalid SKUs |
|-------|----------|----------|------------|--------------|--------------|
| Brand | No | n/a | n/a | None | None |
| Description | No | n/a | n/a | None | None |
| Features | No | n/a | n/a | None | None |
| Image URLs | No | n/a | n/a | None | None |
| ItemNumber | No | n/a | n/a | None | None |
| SKU | Yes | n/a | n/a | None | None |
| Name | Yes | n/a | n/a | None | None |
| UPC | No | n/a | n/a | None | None |
| Weight | No | n/a | n/a | None | None |

### Findings

- **Critical — Navigation Failure**: Positive Validation failed for 072705115310: Element wait timed out after 10s: ['#plp-desktop-row .cc_product_name', '.plp-empty-state-message-container h3'] | hint=Increase timeout multiplier and retry Action: Inspect navigation flow, target availability, and timeout settings for this scraper.
- **Critical — Navigation Failure**: Negative Validation failed for xyzabc123notexist456: Element wait timed out after 10s: ['#plp-desktop-row .cc_product_name', '.plp-empty-state-message-container h3'] | hint=Increase timeout multiplier and retry Action: Inspect navigation flow, target availability, and timeout settings for this scraper.
- **Critical — Navigation Failure**: Boundary Testing failed for 123: Element wait timed out after 10s: ['#plp-desktop-row .cc_product_name', '.plp-empty-state-message-container h3'] | hint=Increase timeout multiplier and retry Action: Inspect navigation flow, target availability, and timeout settings for this scraper.

### Actionable Failure Logs

| Tier | SKU | Category | Failure Type | URL | Error | Suggested Action |
|------|-----|----------|--------------|-----|-------|------------------|
| Positive Validation | 072705115310 | Navigation Failure | network_error | https://shop.phillipspet.com/ccrz__CCSiteLogin?startURL=%2Fccrz__ProductList%3FcartID%3D%26cclcl%3Den_US%26operation%3DquickSearch%26portalUser%3D%26searchText%3D072705115310%26store%3DDefaultStore | Element wait timed out after 10s: ['#plp-desktop-row .cc_product_name', '.plp-empty-state-message-container h3'] / hint=Increase timeout multiplier and retry | Inspect navigation flow, target availability, and timeout settings for this scraper. |
| Negative Validation | xyzabc123notexist456 | Navigation Failure | network_error | https://shop.phillipspet.com/ccrz__CCSiteLogin?startURL=%2Fccrz__ProductList%3FcartID%3D%26cclcl%3Den_US%26operation%3DquickSearch%26portalUser%3D%26searchText%3Dxyzabc123notexist456%26store%3DDefaultStore | Element wait timed out after 10s: ['#plp-desktop-row .cc_product_name', '.plp-empty-state-message-container h3'] / hint=Increase timeout multiplier and retry | Inspect navigation flow, target availability, and timeout settings for this scraper. |
| Boundary Testing | 123 | Navigation Failure | network_error | https://shop.phillipspet.com/ccrz__CCSiteLogin?startURL=%2Fccrz__ProductList%3FcartID%3D%26cclcl%3Den_US%26operation%3DquickSearch%26portalUser%3D%26searchText%3D123%26store%3DDefaultStore | Element wait timed out after 10s: ['#plp-desktop-row .cc_product_name', '.plp-empty-state-message-container h3'] / hint=Increase timeout multiplier and retry | Inspect navigation flow, target availability, and timeout settings for this scraper. |
