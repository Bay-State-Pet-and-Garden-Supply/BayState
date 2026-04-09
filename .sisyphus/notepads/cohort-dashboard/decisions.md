# Cohort Dashboard Architectural Decisions

## Date: 2026-04-08

### Decision 1: Polling vs WebSocket for Real-time Updates

**Context**: Need to show real-time cohort status updates

**Options Considered**:
1. WebSocket subscription (like useJobSubscription)
2. Polling with interval
3. Manual refresh only

**Decision**: Polling with 30-second interval

**Rationale**:
- Cohort batches change less frequently than individual jobs
- Simpler implementation with graceful degradation
- Follows pattern from ActiveRunsTab component
- Can be upgraded to WebSocket later if needed
- Lower server load than WebSocket for infrequent updates

**Trade-offs**:
- ✅ Simpler implementation
- ✅ Graceful degradation
- ✅ Lower server load
- ❌ Not truly real-time (30-second delay)
- ❌ Unnecessary polling when no changes

### Decision 2: Client-side Stats Calculation

**Context**: Need to show stats (total, pending, processing, completed, failed)

**Options Considered**:
1. Server-side calculation (API returns stats)
2. Client-side calculation from fetched data

**Decision**: Client-side calculation

**Rationale**:
- Reduces API complexity
- Stats are simple counts (no complex aggregation)
- Data already fetched for display
- Follows existing patterns in ActiveRunsTab

**Trade-offs**:
- ✅ Simpler API
- ✅ No additional database queries
- ❌ Stats calculated on every render (can be memoized)

### Decision 3: Status Filtering Implementation

**Context**: Need to filter cohorts by status

**Options Considered**:
1. Client-side filtering only
2. Server-side filtering with URL parameters
3. Hybrid (client-side for small datasets, server-side for large)

**Decision**: Server-side filtering with URL parameters

**Rationale**:
- Reduces data transfer for filtered views
- Follows REST API best practices
- Maintains backward compatibility (status parameter optional)
- Better for large datasets

**Trade-offs**:
- ✅ Reduced data transfer
- ✅ Better for large datasets
- ✅ RESTful API design
- ❌ Additional API call when filter changes

### Decision 4: Component Structure

**Context**: How to structure the dashboard components

**Options Considered**:
1. Single monolithic component
2. Separate components for stats, filters, list
3. Server component wrapper + client component

**Decision**: Server component wrapper + client component

**Rationale**:
- Follows Next.js 16 App Router patterns
- Server component for initial data fetching
- Client component for interactivity
- Matches existing admin dashboard patterns

**Trade-offs**:
- ✅ Follows Next.js best practices
- ✅ Separation of concerns
- ✅ Better performance (server-side rendering)
- ❌ More files to maintain