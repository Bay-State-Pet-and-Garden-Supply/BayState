/**
 * Image Retry Queue Type Definitions
 * 
 * These types match the database schema for the image_retry_queue table
 * and related enums/functions.
 */

// ============================================================================
// Enums
// ============================================================================

export type ImageErrorType = 
  | 'auth_401'
  | 'not_found_404'
  | 'network_timeout'
  | 'cors_blocked'
  | 'unknown';

export type ImageRetryStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

// ============================================================================
// Table Row Types
// ============================================================================

export interface ImageRetryQueueRow {
  id: string;
  product_id: string | null;
  image_url: string;
  error_type: ImageErrorType;
  retry_count: number;
  max_retries: number;
  status: ImageRetryStatus;
  scheduled_for: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ImageRetryQueueInsert {
  id?: string;
  product_id?: string | null;
  image_url: string;
  error_type?: ImageErrorType;
  retry_count?: number;
  max_retries?: number;
  status?: ImageRetryStatus;
  scheduled_for?: string;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ImageRetryQueueUpdate {
  id?: string;
  product_id?: string | null;
  image_url?: string;
  error_type?: ImageErrorType;
  retry_count?: number;
  max_retries?: number;
  status?: ImageRetryStatus;
  scheduled_for?: string;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Function Return Types
// ============================================================================

export interface PendingImageRetry {
  retry_id: string;
  product_id: string | null;
  image_url: string;
  error_type: ImageErrorType;
  retry_count: number;
  max_retries: number;
}

export interface ProductImageRetryHistory {
  retry_id: string;
  image_url: string;
  error_type: ImageErrorType;
  retry_count: number;
  status: ImageRetryStatus;
  created_at: string;
  updated_at: string;
}
