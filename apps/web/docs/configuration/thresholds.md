# Confidence Threshold Configuration

The ETL pipeline uses confidence scores to determine the quality of consolidated data.

## Threshold Levels

### High Confidence (>= 0.9)
- **Meaning**: Data is highly likely to be accurate.
- **UI Indicator**: Green badge.
- **Action**: Eligible for auto-approval (if enabled).

### Medium Confidence (0.7 - 0.89)
- **Meaning**: Data is likely correct but may have minor discrepancies.
- **UI Indicator**: Yellow badge.
- **Action**: Requires quick manual review.

### Low Confidence (< 0.7)
- **Meaning**: Significant conflicts detected between sources.
- **UI Indicator**: Red badge.
- **Action**: Requires detailed manual consolidation in the Enrichment Workspace.

## Calculation Logic
Confidence scores are calculated based on:
1. **Source Agreement**: Do multiple sources provide the same value?
2. **Source Reliability**: Is the source known for high-quality data for this specific field?
3. **Data Completeness**: Are all required fields present?

## Adjusting Thresholds
Thresholds are currently defined in the UI components and `lib/pipeline.ts`. Future updates will move these to a global configuration file or database setting.
