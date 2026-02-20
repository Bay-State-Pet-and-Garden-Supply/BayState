# Task 2.4: Build Review & Submit step

## Context
Final step of the enrichment workflow where users review their selections and submit the job.

## Implementation Notes
- Create component: `BayStateApp/components/admin/enrichment/ReviewSubmit.tsx`
- Summary card showing: N products, Method, Config preview
- Cost estimate (Discovery) or scraper list (Static)
- Submit button that calls the API
- Loading state during submission
- Redirect on success
- Error handling

## UI Requirements
- Summary card with all selections
- Submit button with `data-testid="enrichment-submit-button"`
- Loading spinner during submission
- Error alert with actionable message
- Success redirect to job monitoring page

## API Call
- POST to `/api/admin/enrichment/jobs`
- Body: `{ skus, method, config, chunkSize, maxWorkers }`
- On success: redirect to `/admin/scrapers/runs/${jobId}`

## Data Flow
- Receives: all data from previous steps (skus, method, config, chunkConfig)
- Calls: API endpoint
- On success: redirects to job monitoring
- On error: shows error message with retry option
