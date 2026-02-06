# Pipeline Audit Log

The `pipeline_audit_log` table tracks all significant actions within the ETL pipeline to ensure accountability and provide an undo trail.

## Schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | `uuid` | Primary key |
| `job_type` | `text` | Type of action: `status_update`, `product_deletion`, `consolidation` |
| `job_id` | `uuid` | Unique ID for the batch operation |
| `from_state` | `text` | Previous pipeline status |
| `to_state` | `text` | New pipeline status |
| `actor_id` | `uuid` | ID of the user who performed the action (null for system) |
| `actor_type` | `text` | `user` or `system` |
| `metadata` | `jsonb` | Additional details (e.g., list of SKUs, counts) |
| `created_at` | `timestamp` | When the action occurred |

## Usage

### Tracking Changes
Every time a product's status is changed via `bulkUpdateStatus`, a record is inserted into the audit log.

### Permanent Deletions
When products are deleted via `bulkDeleteProducts`, the audit log preserves a record of the deleted SKUs in the `metadata` column, even after the product record is gone.

### Querying the Log
Admins can view the audit log in the Pipeline Dashboard to see who moved products to `published` or who deleted a batch of items.
