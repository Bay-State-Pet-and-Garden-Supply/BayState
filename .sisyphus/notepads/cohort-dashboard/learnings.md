# Cohort Dashboard Learnings

## Implementation Date: 2026-04-08

### Architecture Decisions

1. **Polling vs WebSocket**: Chose polling (30-second interval) over WebSocket for cohort status updates because:
   - Cohort batches change less frequently than individual jobs
   - Simpler implementation with graceful degradation
   - Follows pattern from ActiveRunsTab component
   - Can be upgraded to WebSocket later if needed

2. **Component Structure**:
   - Server component wrapper (`page.tsx`) for initial data fetching
   - Client component (`CohortDashboardClient.tsx`) for interactivity
   - Follows Next.js 16 App Router patterns

3. **Status Filtering**: Added server-side filtering to API endpoint
   - Maintains backward compatibility (status parameter optional)
   - Reduces data transfer for filtered views
   - Follows REST API best practices

### Design System Compliance

- Uses shadcn/ui components: Button, Badge, Card, ScrollArea
- Uses Tailwind semantic classes: `text-primary`, `bg-muted`, `text-foreground`
- No hardcoded colors (all use design tokens or Tailwind classes)
- Follows existing admin dashboard patterns

### Real-time Updates Strategy

1. **Polling Interval**: 30 seconds (configurable)
2. **Connection Indicator**: Shows live/disconnected status
3. **Manual Refresh**: Button with loading state
4. **Error Handling**: Graceful degradation with retry button

### Performance Considerations

- Stats calculated client-side from fetched data
- No additional API calls for stats
- Efficient filtering with URL parameters
- ScrollArea for large cohort lists

### Future Enhancements

1. **WebSocket Subscription**: Can add realtime subscription for cohort status changes
2. **Pagination**: Currently shows all cohorts, can add pagination for large datasets
3. **Sorting**: Can add sorting by created_at, updated_at, status
4. **Bulk Actions**: Can add bulk status updates or actions
5. **Export**: Can add CSV/JSON export functionality