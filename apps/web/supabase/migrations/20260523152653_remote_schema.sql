drop extension if exists "pg_net";

create extension if not exists "vector" with schema "public";

drop trigger if exists "trigger_b2b_feeds_updated_at" on "public"."b2b_feeds";

drop trigger if exists "update_inventory_items_timestamp" on "public"."inventory_items";

drop trigger if exists "trigger_set_order_source_type" on "public"."orders";

drop trigger if exists "trigger_update_promo_usage" on "public"."promo_redemptions";

drop trigger if exists "service_costs_updated_at" on "public"."service_costs";

drop trigger if exists "set_order_number" on "public"."orders";

drop policy "Admin users can manage b2b_feeds" on "public"."b2b_feeds";

drop policy "Admin users can manage b2b_sync_jobs" on "public"."b2b_sync_jobs";

drop policy "Service role can manage integration sync runs" on "public"."integration_sync_runs";

drop policy "Staff can view integration sync runs" on "public"."integration_sync_runs";

drop policy "Allow all access" on "public"."inventory_items";

drop policy "Service role can manage reconciliation items" on "public"."inventory_reconciliation_items";

drop policy "Staff can manage reconciliation items" on "public"."inventory_reconciliation_items";

drop policy "Staff can view reconciliation items" on "public"."inventory_reconciliation_items";

drop policy "Service role can manage order events" on "public"."order_events";

drop policy "Staff can manage order events" on "public"."order_events";

drop policy "Staff can view order events" on "public"."order_events";

drop policy "Anyone can insert order items" on "public"."order_items";

drop policy "Staff can view all order items" on "public"."order_items";

drop policy "Users can view own order items" on "public"."order_items";

drop policy "Staff can view payments" on "public"."order_payments";

drop policy "System can insert payments" on "public"."order_payments";

drop policy "Service role can manage order source records" on "public"."order_source_records";

drop policy "Staff can manage order source records" on "public"."order_source_records";

drop policy "Staff can view order source records" on "public"."order_source_records";

drop policy "Anyone can insert orders" on "public"."orders";

drop policy "Staff can update orders" on "public"."orders";

drop policy "Staff can view all orders" on "public"."orders";

drop policy "Users can view own orders" on "public"."orders";

drop policy "Enable all access for anon users" on "public"."orders_ingestion";

drop policy "Enable all access for authenticated users" on "public"."orders_ingestion";

drop policy "Admin manage preorder batches" on "public"."preorder_batches";

drop policy "Public read preorder batches" on "public"."preorder_batches";

drop policy "Admin manage preorder groups" on "public"."preorder_groups";

drop policy "Public read preorder groups" on "public"."preorder_groups";

drop policy "Admin manage product preorder groups" on "public"."product_preorder_groups";

drop policy "Public read product preorder groups" on "public"."product_preorder_groups";

drop policy "Admin can manage promo codes" on "public"."promo_codes";

drop policy "Anyone can validate active promo codes" on "public"."promo_codes";

drop policy "Admin can view all redemptions" on "public"."promo_redemptions";

drop policy "System can insert redemptions" on "public"."promo_redemptions";

drop policy "Users can view own redemptions" on "public"."promo_redemptions";

drop policy "Allow authenticated users to manage service_costs" on "public"."service_costs";

drop policy "Allow authenticated users to read service_costs" on "public"."service_costs";

drop policy "Users can add items to their subscriptions" on "public"."subscription_items";

drop policy "Users can delete items from their subscriptions" on "public"."subscription_items";

drop policy "Users can update items of their subscriptions" on "public"."subscription_items";

drop policy "Users can view items of their subscriptions" on "public"."subscription_items";

drop policy "Users can dismiss suggestions for their subscriptions" on "public"."subscription_suggestions";

drop policy "Users can view suggestions for their subscriptions" on "public"."subscription_suggestions";

revoke delete on table "public"."b2b_sync_jobs" from "anon";

revoke insert on table "public"."b2b_sync_jobs" from "anon";

revoke references on table "public"."b2b_sync_jobs" from "anon";

revoke select on table "public"."b2b_sync_jobs" from "anon";

revoke trigger on table "public"."b2b_sync_jobs" from "anon";

revoke truncate on table "public"."b2b_sync_jobs" from "anon";

revoke update on table "public"."b2b_sync_jobs" from "anon";

revoke delete on table "public"."b2b_sync_jobs" from "authenticated";

revoke insert on table "public"."b2b_sync_jobs" from "authenticated";

revoke references on table "public"."b2b_sync_jobs" from "authenticated";

revoke select on table "public"."b2b_sync_jobs" from "authenticated";

revoke trigger on table "public"."b2b_sync_jobs" from "authenticated";

revoke truncate on table "public"."b2b_sync_jobs" from "authenticated";

revoke update on table "public"."b2b_sync_jobs" from "authenticated";

revoke delete on table "public"."b2b_sync_jobs" from "service_role";

revoke insert on table "public"."b2b_sync_jobs" from "service_role";

revoke references on table "public"."b2b_sync_jobs" from "service_role";

revoke select on table "public"."b2b_sync_jobs" from "service_role";

revoke trigger on table "public"."b2b_sync_jobs" from "service_role";

revoke truncate on table "public"."b2b_sync_jobs" from "service_role";

revoke update on table "public"."b2b_sync_jobs" from "service_role";

revoke delete on table "public"."orders_ingestion" from "anon";

revoke insert on table "public"."orders_ingestion" from "anon";

revoke references on table "public"."orders_ingestion" from "anon";

revoke select on table "public"."orders_ingestion" from "anon";

revoke trigger on table "public"."orders_ingestion" from "anon";

revoke truncate on table "public"."orders_ingestion" from "anon";

revoke update on table "public"."orders_ingestion" from "anon";

revoke delete on table "public"."orders_ingestion" from "authenticated";

revoke insert on table "public"."orders_ingestion" from "authenticated";

revoke references on table "public"."orders_ingestion" from "authenticated";

revoke select on table "public"."orders_ingestion" from "authenticated";

revoke trigger on table "public"."orders_ingestion" from "authenticated";

revoke truncate on table "public"."orders_ingestion" from "authenticated";

revoke update on table "public"."orders_ingestion" from "authenticated";

revoke delete on table "public"."orders_ingestion" from "service_role";

revoke insert on table "public"."orders_ingestion" from "service_role";

revoke references on table "public"."orders_ingestion" from "service_role";

revoke select on table "public"."orders_ingestion" from "service_role";

revoke trigger on table "public"."orders_ingestion" from "service_role";

revoke truncate on table "public"."orders_ingestion" from "service_role";

revoke update on table "public"."orders_ingestion" from "service_role";

revoke delete on table "public"."service_costs" from "anon";

revoke insert on table "public"."service_costs" from "anon";

revoke references on table "public"."service_costs" from "anon";

revoke select on table "public"."service_costs" from "anon";

revoke trigger on table "public"."service_costs" from "anon";

revoke truncate on table "public"."service_costs" from "anon";

revoke update on table "public"."service_costs" from "anon";

revoke delete on table "public"."service_costs" from "authenticated";

revoke insert on table "public"."service_costs" from "authenticated";

revoke references on table "public"."service_costs" from "authenticated";

revoke select on table "public"."service_costs" from "authenticated";

revoke trigger on table "public"."service_costs" from "authenticated";

revoke truncate on table "public"."service_costs" from "authenticated";

revoke update on table "public"."service_costs" from "authenticated";

revoke delete on table "public"."service_costs" from "service_role";

revoke insert on table "public"."service_costs" from "service_role";

revoke references on table "public"."service_costs" from "service_role";

revoke select on table "public"."service_costs" from "service_role";

revoke trigger on table "public"."service_costs" from "service_role";

revoke truncate on table "public"."service_costs" from "service_role";

revoke update on table "public"."service_costs" from "service_role";

revoke delete on table "public"."subscription_items" from "anon";

revoke insert on table "public"."subscription_items" from "anon";

revoke references on table "public"."subscription_items" from "anon";

revoke select on table "public"."subscription_items" from "anon";

revoke trigger on table "public"."subscription_items" from "anon";

revoke truncate on table "public"."subscription_items" from "anon";

revoke update on table "public"."subscription_items" from "anon";

revoke delete on table "public"."subscription_items" from "authenticated";

revoke insert on table "public"."subscription_items" from "authenticated";

revoke references on table "public"."subscription_items" from "authenticated";

revoke select on table "public"."subscription_items" from "authenticated";

revoke trigger on table "public"."subscription_items" from "authenticated";

revoke truncate on table "public"."subscription_items" from "authenticated";

revoke update on table "public"."subscription_items" from "authenticated";

revoke delete on table "public"."subscription_items" from "service_role";

revoke insert on table "public"."subscription_items" from "service_role";

revoke references on table "public"."subscription_items" from "service_role";

revoke select on table "public"."subscription_items" from "service_role";

revoke trigger on table "public"."subscription_items" from "service_role";

revoke truncate on table "public"."subscription_items" from "service_role";

revoke update on table "public"."subscription_items" from "service_role";

revoke delete on table "public"."subscription_suggestions" from "anon";

revoke insert on table "public"."subscription_suggestions" from "anon";

revoke references on table "public"."subscription_suggestions" from "anon";

revoke select on table "public"."subscription_suggestions" from "anon";

revoke trigger on table "public"."subscription_suggestions" from "anon";

revoke truncate on table "public"."subscription_suggestions" from "anon";

revoke update on table "public"."subscription_suggestions" from "anon";

revoke delete on table "public"."subscription_suggestions" from "authenticated";

revoke insert on table "public"."subscription_suggestions" from "authenticated";

revoke references on table "public"."subscription_suggestions" from "authenticated";

revoke select on table "public"."subscription_suggestions" from "authenticated";

revoke trigger on table "public"."subscription_suggestions" from "authenticated";

revoke truncate on table "public"."subscription_suggestions" from "authenticated";

revoke update on table "public"."subscription_suggestions" from "authenticated";

revoke delete on table "public"."subscription_suggestions" from "service_role";

revoke insert on table "public"."subscription_suggestions" from "service_role";

revoke references on table "public"."subscription_suggestions" from "service_role";

revoke select on table "public"."subscription_suggestions" from "service_role";

revoke trigger on table "public"."subscription_suggestions" from "service_role";

revoke truncate on table "public"."subscription_suggestions" from "service_role";

revoke update on table "public"."subscription_suggestions" from "service_role";

alter table "public"."b2b_feeds" drop constraint "b2b_feeds_distributor_code_key";

alter table "public"."b2b_feeds" drop constraint "b2b_feeds_feed_type_check";

alter table "public"."b2b_feeds" drop constraint "b2b_feeds_status_check";

alter table "public"."b2b_feeds" drop constraint "b2b_feeds_sync_frequency_check";

alter table "public"."b2b_sync_jobs" drop constraint "b2b_sync_jobs_created_by_fkey";

alter table "public"."b2b_sync_jobs" drop constraint "b2b_sync_jobs_feed_id_fkey";

alter table "public"."b2b_sync_jobs" drop constraint "b2b_sync_jobs_job_type_check";

alter table "public"."b2b_sync_jobs" drop constraint "b2b_sync_jobs_status_check";

alter table "public"."enrichment_attempts" drop constraint "enrichment_attempts_config_id_fkey";

alter table "public"."enrichment_jobs" drop constraint "enrichment_jobs_config_id_fkey";

alter table "public"."inventory_reconciliation_items" drop constraint "inventory_reconciliation_items_sync_run_id_fkey";

alter table "public"."order_items" drop constraint "order_items_item_type_check";

alter table "public"."order_items" drop constraint "order_items_preorder_batch_id_fkey";

alter table "public"."order_payments" drop constraint "order_payments_method_check";

alter table "public"."order_payments" drop constraint "order_payments_status_check";

alter table "public"."order_source_records" drop constraint "order_source_records_sync_run_id_fkey";

alter table "public"."orders" drop constraint "orders_delivery_address_id_fkey";

alter table "public"."orders" drop constraint "orders_fulfillment_method_check";

alter table "public"."orders" drop constraint "orders_payment_method_check";

alter table "public"."orders" drop constraint "orders_status_check";

alter table "public"."orders" drop constraint "orders_user_id_fkey";

alter table "public"."preorder_batches" drop constraint "preorder_batches_preorder_group_id_fkey";

alter table "public"."preorder_groups" drop constraint "preorder_groups_slug_key";

alter table "public"."product_preorder_groups" drop constraint "product_preorder_groups_preorder_group_id_fkey";

alter table "public"."products" drop constraint "products_sku_key";

alter table "public"."promo_codes" drop constraint "promo_codes_created_by_fkey";

alter table "public"."promo_codes" drop constraint "promo_codes_discount_type_check";

alter table "public"."promo_redemptions" drop constraint "promo_redemptions_user_id_fkey";

alter table "public"."promo_redemptions" drop constraint "redemption_identifier";

alter table "public"."service_costs" drop constraint "service_costs_billing_cycle_check";

alter table "public"."service_costs" drop constraint "service_costs_category_check";

alter table "public"."service_costs" drop constraint "service_costs_service_key";

alter table "public"."stripe_webhook_events" drop constraint "stripe_webhook_events_order_id_fkey";

alter table "public"."subscription_items" drop constraint "subscription_items_product_id_fkey";

alter table "public"."subscription_items" drop constraint "subscription_items_quantity_check";

alter table "public"."subscription_items" drop constraint "subscription_items_subscription_id_fkey";

alter table "public"."subscription_items" drop constraint "subscription_items_unique_product";

alter table "public"."subscription_suggestions" drop constraint "subscription_suggestions_pet_id_fkey";

alter table "public"."subscription_suggestions" drop constraint "subscription_suggestions_product_id_fkey";

alter table "public"."subscription_suggestions" drop constraint "subscription_suggestions_subscription_id_fkey";

alter table "public"."batch_job_items" drop constraint "batch_job_items_unique_batch_sku";

alter table "public"."consolidation_review_requests" drop constraint "consolidation_review_requests_sku_fkey";

alter table "public"."enrichment_attempts" drop constraint "enrichment_attempts_job_id_sku_attempt_number_key";

alter table "public"."enrichment_attempts" drop constraint "enrichment_attempts_sku_fkey";

alter table "public"."enrichment_targets" drop constraint "enrichment_targets_sku_fkey";

alter table "public"."enrichment_targets" drop constraint "enrichment_targets_sku_url_key";

alter table "public"."image_retry_queue" drop constraint "image_retry_queue_sku_fkey";

alter table "public"."integration_sync_runs" drop constraint "integration_sync_runs_status_check";

alter table "public"."inventory_items" drop constraint "inventory_items_sku_key";

alter table "public"."official_brand_url_candidates" drop constraint "official_brand_url_candidates_sku_fkey";

alter table "public"."official_brand_url_candidates" drop constraint "official_brand_url_candidates_sku_normalized_url_key";

alter table "public"."product_scraped_sites" drop constraint "product_scraped_sites_sku_fkey";

alter table "public"."product_scraped_sites" drop constraint "product_scraped_sites_sku_scraper_name_key";

alter table "public"."product_variants" drop constraint "product_variants_sku_key";

alter table "public"."scraper_config_test_skus" drop constraint "scraper_config_test_skus_sku_type_check";

alter table "public"."scraper_config_test_skus" drop constraint "unique_config_sku";

alter table "public"."scraper_config_versions" drop constraint "scraper_config_versions_status_check";

alter table "public"."scraper_config_versions" drop constraint "valid_status";

drop view if exists "public"."dashboard_inventory_reconciliation_stats";

drop function if exists "public"."get_product_image_retry_history"(p_sku text);

drop view if exists "public"."admin_orders_list";

drop view if exists "public"."ai_scraper_stats";

drop view if exists "public"."dashboard_migration_progress";

drop view if exists "public"."dashboard_order_stats";

drop view if exists "public"."dashboard_product_stats";

drop view if exists "public"."dashboard_scraper_stats";

drop function if exists "public"."get_inventory_drift"(p_days integer);

drop function if exists "public"."get_pending_image_retries"(p_limit integer);

drop view if exists "public"."pipeline_export_queue";

drop view if exists "public"."pipeline_finalized_review";

drop view if exists "public"."pipeline_finalizing_queue";

drop view if exists "public"."products_published";

alter table "public"."b2b_sync_jobs" drop constraint "b2b_sync_jobs_pkey";

alter table "public"."orders" drop constraint "orders_pkey1";

alter table "public"."orders_ingestion" drop constraint "orders_pkey";

alter table "public"."service_costs" drop constraint "service_costs_pkey";

alter table "public"."subscription_items" drop constraint "subscription_items_pkey";

alter table "public"."subscription_suggestions" drop constraint "subscription_suggestions_pkey";

alter table "public"."cohort_members" drop constraint "cohort_members_pkey";

alter table "public"."product_preorder_groups" drop constraint "product_preorder_groups_pkey";

alter table "public"."products_ingestion" drop constraint "products_pkey";

drop index if exists "public"."b2b_feeds_distributor_code_key";

drop index if exists "public"."b2b_sync_jobs_pkey";

drop index if exists "public"."idx_ai_provider_configs_one_active_consolidation";

drop index if exists "public"."idx_b2b_feeds_distributor";

drop index if exists "public"."idx_b2b_feeds_status";

drop index if exists "public"."idx_b2b_sync_jobs_created";

drop index if exists "public"."idx_b2b_sync_jobs_feed";

drop index if exists "public"."idx_b2b_sync_jobs_status";

drop index if exists "public"."idx_integration_sync_runs_created_by";

drop index if exists "public"."idx_integration_sync_runs_source";

drop index if exists "public"."idx_integration_sync_runs_started";

drop index if exists "public"."idx_inventory_items_sku";

drop index if exists "public"."idx_inventory_items_status";

drop index if exists "public"."idx_inventory_reconciliation_items_issue_type";

drop index if exists "public"."idx_inventory_reconciliation_items_sku";

drop index if exists "public"."idx_inventory_reconciliation_items_status";

drop index if exists "public"."idx_inventory_reconciliation_items_sync_run";

drop index if exists "public"."idx_order_events_event_type";

drop index if exists "public"."idx_order_events_order_id_created_at";

drop index if exists "public"."idx_order_items_batch";

drop index if exists "public"."idx_order_items_order_id";

drop index if exists "public"."idx_order_payments_order_id";

drop index if exists "public"."idx_order_payments_stripe_event_id";

drop index if exists "public"."idx_order_source_records_order_id";

drop index if exists "public"."idx_order_source_records_source";

drop index if exists "public"."idx_order_source_records_sync_run";

drop index if exists "public"."idx_orders_created_at";

drop index if exists "public"."idx_orders_fulfillment_status";

drop index if exists "public"."idx_orders_payment_status";

drop index if exists "public"."idx_orders_source";

drop index if exists "public"."idx_orders_source_external_unique";

drop index if exists "public"."idx_orders_source_type_created_at";

drop index if exists "public"."idx_orders_status";

drop index if exists "public"."idx_orders_user_id";

drop index if exists "public"."idx_pet_types_name";

drop index if exists "public"."idx_preorder_batches_arrival";

drop index if exists "public"."idx_preorder_groups_slug";

drop index if exists "public"."idx_products_sku";

drop index if exists "public"."idx_promo_codes_active";

drop index if exists "public"."idx_promo_codes_code_upper";

drop index if exists "public"."idx_promo_codes_created_by";

drop index if exists "public"."idx_promo_redemptions_email";

drop index if exists "public"."idx_promo_redemptions_order";

drop index if exists "public"."idx_promo_redemptions_user";

drop index if exists "public"."idx_promo_redemptions_user_id";

drop index if exists "public"."idx_service_costs_active";

drop index if exists "public"."orders_pkey1";

drop index if exists "public"."preorder_groups_slug_key";

drop index if exists "public"."products_sku_key";

drop index if exists "public"."service_costs_pkey";

drop index if exists "public"."service_costs_service_key";

drop index if exists "public"."subscription_items_pkey";

drop index if exists "public"."subscription_items_unique_product";

drop index if exists "public"."subscription_suggestions_pkey";

drop index if exists "public"."batch_job_items_unique_batch_sku";

drop index if exists "public"."cohort_members_pkey";

drop index if exists "public"."enrichment_attempts_job_id_sku_attempt_number_key";

drop index if exists "public"."enrichment_attempts_sku_idx";

drop index if exists "public"."enrichment_targets_selected_idx";

drop index if exists "public"."enrichment_targets_sku_idx";

drop index if exists "public"."enrichment_targets_sku_url_key";

drop index if exists "public"."idx_batch_job_items_sku";

drop index if exists "public"."idx_cohort_members_sku";

drop index if exists "public"."idx_consolidation_review_active_per_sku";

drop index if exists "public"."idx_consolidation_review_sku_status";

drop index if exists "public"."idx_image_retry_queue_sku";

drop index if exists "public"."idx_official_brand_url_candidates_sku_status";

drop index if exists "public"."idx_product_scraped_sites_sku";

drop index if exists "public"."idx_product_variants_sku";

drop index if exists "public"."idx_products_ingestion_sku";

drop index if exists "public"."idx_scraper_config_test_skus_type";

drop index if exists "public"."inventory_items_sku_key";

drop index if exists "public"."official_brand_url_candidates_sku_normalized_url_key";

drop index if exists "public"."orders_pkey";

drop index if exists "public"."product_preorder_groups_pkey";

drop index if exists "public"."product_scraped_sites_sku_scraper_name_key";

drop index if exists "public"."product_variants_sku_key";

drop index if exists "public"."products_pkey";

drop index if exists "public"."unique_config_sku";

drop table "public"."b2b_sync_jobs";

drop table "public"."orders_ingestion";

drop table "public"."service_costs";

drop table "public"."subscription_items";

drop table "public"."subscription_suggestions";

alter table "public"."orders" alter column "payment_status" drop default;

alter table "public"."orders" alter column "source_type" drop default;


  create table "public"."inventory_reconciliation" (
    "id" uuid not null default gen_random_uuid(),
    "status" text not null default 'running'::text,
    "started_at" timestamp with time zone not null default now(),
    "completed_at" timestamp with time zone,
    "total_items" integer default 0,
    "mismatch_count" integer default 0,
    "metadata" jsonb default '{}'::jsonb
      );


alter table "public"."inventory_reconciliation" enable row level security;


  create table "public"."shopsite_credentials" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "api_url" text not null,
    "username" text not null,
    "password_hash" text not null,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."shopsite_credentials" enable row level security;

alter table "public"."orders" alter column payment_status type "public"."order_payment_status" using payment_status::text::"public"."order_payment_status";

alter table "public"."orders" alter column source_type type "public"."order_source_type" using source_type::text::"public"."order_source_type";

alter table "public"."orders" alter column "payment_status" set default 'unpaid'::public.order_payment_status;

alter table "public"."orders" alter column "source_type" set default null;

alter table "public"."ai_provider_configs" drop column "is_active_for_consolidation";

alter table "public"."ai_provider_configs" enable row level security;

alter table "public"."b2b_feeds" drop column "display_name";

alter table "public"."b2b_feeds" drop column "distributor_code";

alter table "public"."b2b_feeds" drop column "enabled";

alter table "public"."b2b_feeds" drop column "last_sync_at";

alter table "public"."b2b_feeds" drop column "last_sync_job_id";

alter table "public"."b2b_feeds" drop column "products_count";

alter table "public"."b2b_feeds" drop column "status";

alter table "public"."b2b_feeds" drop column "sync_frequency";

alter table "public"."b2b_feeds" drop column "updated_at";

alter table "public"."b2b_feeds" add column "last_generated_at" timestamp with time zone;

alter table "public"."b2b_feeds" add column "name" text not null;

alter table "public"."b2b_feeds" add column "url" text;

alter table "public"."batch_job_items" drop column "sku";

alter table "public"."batch_job_items" add column "upc" text not null;

alter table "public"."batch_jobs" drop column "failed_skus";

alter table "public"."batch_jobs" add column "failed_upcs" text[] default '{}'::text[];

alter table "public"."brand_sources" enable row level security;

alter table "public"."cohort_members" drop column "product_sku";

alter table "public"."cohort_members" add column "product_upc" text not null;

alter table "public"."consolidation_review_requests" drop column "sku";

alter table "public"."consolidation_review_requests" add column "upc" text not null;

alter table "public"."enrichment_attempts" drop column "sku";

alter table "public"."enrichment_attempts" add column "upc" text not null;

alter table "public"."enrichment_job_logs" drop column "sku";

alter table "public"."enrichment_job_logs" add column "upc" text;

alter table "public"."enrichment_jobs" drop column "current_sku";

alter table "public"."enrichment_jobs" drop column "skus";

alter table "public"."enrichment_jobs" add column "current_upc" text;

alter table "public"."enrichment_jobs" add column "upcs" text[] not null default '{}'::text[];

alter table "public"."enrichment_targets" drop column "sku";

alter table "public"."enrichment_targets" add column "upc" text not null;

alter table "public"."enrichment_targets" alter column "confidence" drop default;

alter table "public"."image_retry_queue" drop column "sku";

alter table "public"."image_retry_queue" add column "upc" text;

alter table "public"."inventory_items" drop column "name";

alter table "public"."inventory_items" drop column "price";

alter table "public"."inventory_items" drop column "sku";

alter table "public"."inventory_items" drop column "status";

alter table "public"."inventory_items" add column "last_count_at" timestamp with time zone;

alter table "public"."inventory_items" add column "last_sync_at" timestamp with time zone;

alter table "public"."inventory_items" add column "location" text not null default 'main'::text;

alter table "public"."inventory_items" add column "metadata" jsonb default '{}'::jsonb;

alter table "public"."inventory_items" add column "product_id" uuid;

alter table "public"."inventory_items" add column "quantity_available" integer generated always as ((quantity_on_hand - quantity_reserved)) stored;

alter table "public"."inventory_items" add column "quantity_on_hand" integer not null default 0;

alter table "public"."inventory_items" add column "quantity_reserved" integer not null default 0;

alter table "public"."inventory_items" add column "upc" text not null;

alter table "public"."inventory_items" alter column "created_at" drop not null;

alter table "public"."inventory_items" alter column "updated_at" drop not null;

alter table "public"."inventory_reconciliation_items" drop column "metadata";

alter table "public"."inventory_reconciliation_items" drop column "raw_register_payload";

alter table "public"."inventory_reconciliation_items" drop column "recommended_action";

alter table "public"."inventory_reconciliation_items" drop column "register_name";

alter table "public"."inventory_reconciliation_items" drop column "severity";

alter table "public"."inventory_reconciliation_items" drop column "sku";

alter table "public"."inventory_reconciliation_items" drop column "sync_run_id";

alter table "public"."inventory_reconciliation_items" drop column "website_name";

alter table "public"."inventory_reconciliation_items" add column "notes" text;

alter table "public"."inventory_reconciliation_items" add column "reconciliation_id" uuid;

alter table "public"."inventory_reconciliation_items" add column "upc" text not null;

alter table "public"."inventory_reconciliation_items" alter column "created_at" drop not null;

alter table "public"."inventory_reconciliation_items" alter column "issue_type" set data type text using "issue_type"::text;

alter table "public"."inventory_reconciliation_items" alter column "register_price" set data type numeric(12,2) using "register_price"::numeric(12,2);

alter table "public"."inventory_reconciliation_items" alter column "register_quantity" set data type integer using "register_quantity"::integer;

alter table "public"."inventory_reconciliation_items" alter column "status" set default 'open'::text;

alter table "public"."inventory_reconciliation_items" alter column "status" set data type text using "status"::text;

alter table "public"."inventory_reconciliation_items" alter column "website_price" set data type numeric(12,2) using "website_price"::numeric(12,2);

alter table "public"."inventory_reconciliation_items" alter column "website_quantity" set data type integer using "website_quantity"::integer;

alter table "public"."official_brand_url_candidates" drop column "sku";

alter table "public"."official_brand_url_candidates" add column "upc" text not null;

alter table "public"."official_brand_url_candidates" alter column "confidence" drop default;

alter table "public"."order_events" alter column "created_at" drop not null;

alter table "public"."order_items" drop column "item_id";

alter table "public"."order_items" drop column "item_name";

alter table "public"."order_items" drop column "item_slug";

alter table "public"."order_items" drop column "item_type";

alter table "public"."order_items" drop column "preorder_batch_id";

alter table "public"."order_items" add column "metadata" jsonb default '{}'::jsonb;

alter table "public"."order_items" add column "name" text not null;

alter table "public"."order_items" add column "product_id" uuid;

alter table "public"."order_items" add column "upc" text not null;

alter table "public"."order_items" alter column "quantity" drop default;

alter table "public"."order_items" alter column "total_price" drop default;

alter table "public"."order_items" alter column "total_price" set data type numeric(12,2) using "total_price"::numeric(12,2);

alter table "public"."order_items" alter column "unit_price" drop default;

alter table "public"."order_items" alter column "unit_price" set data type numeric(12,2) using "unit_price"::numeric(12,2);

alter table "public"."order_payments" drop column "currency";

alter table "public"."order_payments" drop column "error_message";

alter table "public"."order_payments" drop column "metadata";

alter table "public"."order_payments" drop column "payment_method";

alter table "public"."order_payments" drop column "stripe_charge_id";

alter table "public"."order_payments" drop column "stripe_event_id";

alter table "public"."order_payments" drop column "stripe_payment_intent_id";

alter table "public"."order_payments" add column "method" text not null;

alter table "public"."order_payments" add column "raw_response" jsonb default '{}'::jsonb;

alter table "public"."order_payments" add column "transaction_id" text;

alter table "public"."order_payments" alter column "amount" set data type numeric(12,2) using "amount"::numeric(12,2);

alter table "public"."order_payments" alter column "created_at" drop not null;

alter table "public"."order_payments" alter column "status" drop default;

alter table "public"."order_payments" alter column "updated_at" drop not null;

alter table "public"."orders" drop column "delivery_address_id";

alter table "public"."orders" drop column "delivery_distance_miles";

alter table "public"."orders" drop column "delivery_fee";

alter table "public"."orders" drop column "delivery_notes";

alter table "public"."orders" drop column "delivery_services";

alter table "public"."orders" drop column "discount_amount";

alter table "public"."orders" drop column "paid_at";

alter table "public"."orders" drop column "promo_code";

alter table "public"."orders" drop column "promo_code_id";

alter table "public"."orders" drop column "refunded_amount";

alter table "public"."orders" drop column "stripe_customer_id";

alter table "public"."orders" drop column "stripe_payment_intent_id";

alter table "public"."orders" drop column "user_id";

alter table "public"."orders" add column "customer_id" uuid;

alter table "public"."orders" add column "metadata" jsonb default '{}'::jsonb;

alter table "public"."orders" alter column "customer_email" drop not null;

alter table "public"."orders" alter column "payment_method" drop default;

alter table "public"."orders" alter column "payment_status" set not null;

alter table "public"."orders" alter column "source" set default 'web'::text;

alter table "public"."orders" alter column "source_type" set default 'web'::public.order_source_type;

alter table "public"."orders" alter column "status" set not null;

alter table "public"."orders" alter column "subtotal" set default 0;

alter table "public"."orders" alter column "subtotal" set data type numeric(12,2) using "subtotal"::numeric(12,2);

alter table "public"."orders" alter column "tax" set not null;

alter table "public"."orders" alter column "tax" set data type numeric(12,2) using "tax"::numeric(12,2);

alter table "public"."orders" alter column "total" set default 0;

alter table "public"."orders" alter column "total" set data type numeric(12,2) using "total"::numeric(12,2);

alter table "public"."preorder_batches" drop column "arrival_date";

alter table "public"."preorder_batches" drop column "capacity";

alter table "public"."preorder_batches" drop column "display_order";

alter table "public"."preorder_batches" drop column "is_active";

alter table "public"."preorder_batches" drop column "ordering_deadline";

alter table "public"."preorder_batches" drop column "preorder_group_id";

alter table "public"."preorder_batches" add column "group_id" uuid;

alter table "public"."preorder_batches" add column "name" text not null;

alter table "public"."preorder_batches" add column "quantity_allocated" integer default 0;

alter table "public"."preorder_batches" add column "quantity_limit" integer;

alter table "public"."preorder_batches" add column "status" text not null default 'open'::text;

alter table "public"."preorder_groups" drop column "description";

alter table "public"."preorder_groups" drop column "display_copy";

alter table "public"."preorder_groups" drop column "is_active";

alter table "public"."preorder_groups" drop column "minimum_quantity";

alter table "public"."preorder_groups" drop column "pickup_only";

alter table "public"."preorder_groups" drop column "slug";

alter table "public"."preorder_groups" add column "metadata" jsonb default '{}'::jsonb;

alter table "public"."preorder_groups" add column "release_date" date;

alter table "public"."preorder_groups" add column "status" text not null default 'active'::text;

alter table "public"."product_preorder_groups" drop column "created_at";

alter table "public"."product_preorder_groups" drop column "pickup_only_override";

alter table "public"."product_preorder_groups" drop column "preorder_group_id";

alter table "public"."product_preorder_groups" add column "group_id" uuid not null;

alter table "public"."product_scraped_sites" drop column "sku";

alter table "public"."product_scraped_sites" add column "upc" text not null;

alter table "public"."product_types" enable row level security;

alter table "public"."product_variants" drop column "sku";

alter table "public"."product_variants" add column "upc" text;

alter table "public"."products" drop column "sku";

alter table "public"."products" alter column "upc" set not null;

alter table "public"."products_ingestion" drop column "sku";

alter table "public"."products_ingestion" add column "upc" text not null;

alter table "public"."promo_codes" drop column "created_by";

alter table "public"."promo_codes" drop column "current_uses";

alter table "public"."promo_codes" drop column "expires_at";

alter table "public"."promo_codes" drop column "first_order_only";

alter table "public"."promo_codes" drop column "max_uses";

alter table "public"."promo_codes" drop column "max_uses_per_user";

alter table "public"."promo_codes" drop column "maximum_discount";

alter table "public"."promo_codes" drop column "minimum_order";

alter table "public"."promo_codes" drop column "requires_account";

alter table "public"."promo_codes" drop column "updated_at";

alter table "public"."promo_codes" add column "ends_at" timestamp with time zone;

alter table "public"."promo_codes" add column "min_purchase_amount" numeric(12,2) default 0;

alter table "public"."promo_codes" add column "usage_count" integer default 0;

alter table "public"."promo_codes" add column "usage_limit" integer;

alter table "public"."promo_codes" alter column "discount_value" set data type numeric(12,2) using "discount_value"::numeric(12,2);

alter table "public"."promo_codes" alter column "starts_at" set not null;

alter table "public"."promo_redemptions" drop column "discount_applied";

alter table "public"."promo_redemptions" drop column "guest_email";

alter table "public"."promo_redemptions" drop column "user_id";

alter table "public"."promo_redemptions" add column "customer_id" uuid;

alter table "public"."promo_redemptions" add column "discount_amount" numeric(12,2) not null;

alter table "public"."promo_redemptions" alter column "promo_code_id" drop not null;

alter table "public"."scraper_config_test_skus" drop column "sku";

alter table "public"."scraper_config_test_skus" drop column "sku_type";

alter table "public"."scraper_config_test_skus" add column "upc" text not null;

alter table "public"."scraper_config_test_skus" add column "upc_type" text not null;

CREATE UNIQUE INDEX idx_pet_types_name_lower ON public.pet_types USING btree (lower(name));

CREATE UNIQUE INDEX inventory_reconciliation_pkey ON public.inventory_reconciliation USING btree (id);

CREATE UNIQUE INDEX products_upc_key ON public.products USING btree (upc);

CREATE UNIQUE INDEX shopsite_credentials_pkey ON public.shopsite_credentials USING btree (id);

CREATE UNIQUE INDEX batch_job_items_unique_batch_sku ON public.batch_job_items USING btree (batch_job_id, upc);

CREATE UNIQUE INDEX cohort_members_pkey ON public.cohort_members USING btree (cohort_id, product_upc);

CREATE UNIQUE INDEX enrichment_attempts_job_id_sku_attempt_number_key ON public.enrichment_attempts USING btree (job_id, upc, attempt_number);

CREATE INDEX enrichment_attempts_sku_idx ON public.enrichment_attempts USING btree (upc);

CREATE INDEX enrichment_targets_selected_idx ON public.enrichment_targets USING btree (upc, selected) WHERE (selected = true);

CREATE INDEX enrichment_targets_sku_idx ON public.enrichment_targets USING btree (upc);

CREATE UNIQUE INDEX enrichment_targets_sku_url_key ON public.enrichment_targets USING btree (upc, url);

CREATE INDEX idx_batch_job_items_sku ON public.batch_job_items USING btree (upc);

CREATE INDEX idx_cohort_members_sku ON public.cohort_members USING btree (product_upc);

CREATE UNIQUE INDEX idx_consolidation_review_active_per_sku ON public.consolidation_review_requests USING btree (upc) WHERE (status = ANY (ARRAY['needs_input'::text, 'auto_resolved'::text]));

CREATE INDEX idx_consolidation_review_sku_status ON public.consolidation_review_requests USING btree (upc, status);

CREATE INDEX idx_image_retry_queue_sku ON public.image_retry_queue USING btree (upc);

CREATE INDEX idx_official_brand_url_candidates_sku_status ON public.official_brand_url_candidates USING btree (upc, selection_status, updated_at DESC);

CREATE INDEX idx_product_scraped_sites_sku ON public.product_scraped_sites USING btree (upc);

CREATE INDEX idx_product_variants_sku ON public.product_variants USING btree (upc);

CREATE INDEX idx_products_ingestion_sku ON public.products_ingestion USING btree (upc);

CREATE INDEX idx_scraper_config_test_skus_type ON public.scraper_config_test_skus USING btree (config_id, upc_type);

CREATE UNIQUE INDEX inventory_items_sku_key ON public.inventory_items USING btree (upc);

CREATE UNIQUE INDEX official_brand_url_candidates_sku_normalized_url_key ON public.official_brand_url_candidates USING btree (upc, normalized_url);

CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id);

CREATE UNIQUE INDEX product_preorder_groups_pkey ON public.product_preorder_groups USING btree (product_id, group_id);

CREATE UNIQUE INDEX product_scraped_sites_sku_scraper_name_key ON public.product_scraped_sites USING btree (upc, scraper_name);

CREATE UNIQUE INDEX product_variants_sku_key ON public.product_variants USING btree (upc);

CREATE UNIQUE INDEX products_pkey ON public.products_ingestion USING btree (upc);

CREATE UNIQUE INDEX unique_config_sku ON public.scraper_config_test_skus USING btree (config_id, upc);

alter table "public"."inventory_reconciliation" add constraint "inventory_reconciliation_pkey" PRIMARY KEY using index "inventory_reconciliation_pkey";

alter table "public"."orders" add constraint "orders_pkey" PRIMARY KEY using index "orders_pkey";

alter table "public"."shopsite_credentials" add constraint "shopsite_credentials_pkey" PRIMARY KEY using index "shopsite_credentials_pkey";

alter table "public"."cohort_members" add constraint "cohort_members_pkey" PRIMARY KEY using index "cohort_members_pkey";

alter table "public"."product_preorder_groups" add constraint "product_preorder_groups_pkey" PRIMARY KEY using index "product_preorder_groups_pkey";

alter table "public"."products_ingestion" add constraint "products_pkey" PRIMARY KEY using index "products_pkey";

alter table "public"."inventory_items" add constraint "inventory_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_items" validate constraint "inventory_items_product_id_fkey";

alter table "public"."inventory_reconciliation_items" add constraint "inventory_reconciliation_items_reconciliation_id_fkey" FOREIGN KEY (reconciliation_id) REFERENCES public.inventory_reconciliation(id) ON DELETE CASCADE not valid;

alter table "public"."inventory_reconciliation_items" validate constraint "inventory_reconciliation_items_reconciliation_id_fkey";

alter table "public"."order_items" add constraint "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) not valid;

alter table "public"."order_items" validate constraint "order_items_product_id_fkey";

alter table "public"."order_payments" add constraint "order_payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."order_payments" validate constraint "order_payments_order_id_fkey";

alter table "public"."orders" add constraint "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES auth.users(id) not valid;

alter table "public"."orders" validate constraint "orders_customer_id_fkey";

alter table "public"."preorder_batches" add constraint "preorder_batches_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.preorder_groups(id) ON DELETE CASCADE not valid;

alter table "public"."preorder_batches" validate constraint "preorder_batches_group_id_fkey";

alter table "public"."product_preorder_groups" add constraint "product_preorder_groups_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.preorder_groups(id) ON DELETE CASCADE not valid;

alter table "public"."product_preorder_groups" validate constraint "product_preorder_groups_group_id_fkey";

alter table "public"."products" add constraint "products_upc_key" UNIQUE using index "products_upc_key";

alter table "public"."promo_redemptions" add constraint "promo_redemptions_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES auth.users(id) not valid;

alter table "public"."promo_redemptions" validate constraint "promo_redemptions_customer_id_fkey";

alter table "public"."promo_redemptions" add constraint "promo_redemptions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."promo_redemptions" validate constraint "promo_redemptions_order_id_fkey";

alter table "public"."batch_job_items" add constraint "batch_job_items_unique_batch_sku" UNIQUE using index "batch_job_items_unique_batch_sku";

alter table "public"."consolidation_review_requests" add constraint "consolidation_review_requests_sku_fkey" FOREIGN KEY (upc) REFERENCES public.products_ingestion(upc) ON DELETE CASCADE not valid;

alter table "public"."consolidation_review_requests" validate constraint "consolidation_review_requests_sku_fkey";

alter table "public"."enrichment_attempts" add constraint "enrichment_attempts_job_id_sku_attempt_number_key" UNIQUE using index "enrichment_attempts_job_id_sku_attempt_number_key";

alter table "public"."enrichment_attempts" add constraint "enrichment_attempts_sku_fkey" FOREIGN KEY (upc) REFERENCES public.products_ingestion(upc) ON DELETE CASCADE not valid;

alter table "public"."enrichment_attempts" validate constraint "enrichment_attempts_sku_fkey";

alter table "public"."enrichment_targets" add constraint "enrichment_targets_sku_fkey" FOREIGN KEY (upc) REFERENCES public.products_ingestion(upc) ON DELETE CASCADE not valid;

alter table "public"."enrichment_targets" validate constraint "enrichment_targets_sku_fkey";

alter table "public"."enrichment_targets" add constraint "enrichment_targets_sku_url_key" UNIQUE using index "enrichment_targets_sku_url_key";

alter table "public"."image_retry_queue" add constraint "image_retry_queue_sku_fkey" FOREIGN KEY (upc) REFERENCES public.products_ingestion(upc) ON DELETE CASCADE not valid;

alter table "public"."image_retry_queue" validate constraint "image_retry_queue_sku_fkey";

alter table "public"."integration_sync_runs" add constraint "integration_sync_runs_status_check" CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'partial'::text]))) not valid;

alter table "public"."integration_sync_runs" validate constraint "integration_sync_runs_status_check";

alter table "public"."inventory_items" add constraint "inventory_items_sku_key" UNIQUE using index "inventory_items_sku_key";

alter table "public"."official_brand_url_candidates" add constraint "official_brand_url_candidates_sku_fkey" FOREIGN KEY (upc) REFERENCES public.products_ingestion(upc) ON DELETE CASCADE not valid;

alter table "public"."official_brand_url_candidates" validate constraint "official_brand_url_candidates_sku_fkey";

alter table "public"."official_brand_url_candidates" add constraint "official_brand_url_candidates_sku_normalized_url_key" UNIQUE using index "official_brand_url_candidates_sku_normalized_url_key";

alter table "public"."product_scraped_sites" add constraint "product_scraped_sites_sku_fkey" FOREIGN KEY (upc) REFERENCES public.products_ingestion(upc) ON DELETE CASCADE not valid;

alter table "public"."product_scraped_sites" validate constraint "product_scraped_sites_sku_fkey";

alter table "public"."product_scraped_sites" add constraint "product_scraped_sites_sku_scraper_name_key" UNIQUE using index "product_scraped_sites_sku_scraper_name_key";

alter table "public"."product_variants" add constraint "product_variants_sku_key" UNIQUE using index "product_variants_sku_key";

alter table "public"."scraper_config_test_skus" add constraint "scraper_config_test_skus_sku_type_check" CHECK ((upc_type = ANY (ARRAY['test'::text, 'fake'::text, 'edge_case'::text]))) not valid;

alter table "public"."scraper_config_test_skus" validate constraint "scraper_config_test_skus_sku_type_check";

alter table "public"."scraper_config_test_skus" add constraint "unique_config_sku" UNIQUE using index "unique_config_sku";

alter table "public"."scraper_config_versions" add constraint "scraper_config_versions_status_check" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'validated'::character varying, 'published'::character varying, 'archived'::character varying])::text[]))) not valid;

alter table "public"."scraper_config_versions" validate constraint "scraper_config_versions_status_check";

alter table "public"."scraper_config_versions" add constraint "valid_status" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'validated'::character varying, 'published'::character varying, 'archived'::character varying])::text[]))) not valid;

alter table "public"."scraper_config_versions" validate constraint "valid_status";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.calculate_order_totals()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE public.orders
    SET subtotal = (SELECT COALESCE(sum(total_price), 0) FROM public.order_items WHERE order_id = NEW.order_id),
        total = (SELECT COALESCE(sum(total_price), 0) FROM public.order_items WHERE order_id = NEW.order_id) + tax
    WHERE id = NEW.order_id;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_order_analytics(p_start_date timestamp with time zone, p_end_date timestamp with time zone)
 RETURNS TABLE(revenue numeric, order_count bigint, average_order_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(sum(total), 0) as revenue,
        count(*) as order_count,
        COALESCE(avg(total), 0) as average_order_value
    FROM public.orders
    WHERE created_at BETWEEN p_start_date AND p_end_date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_product_image_retry_history(p_upc text)
 RETURNS SETOF public.image_retry_queue
 LANGUAGE sql
 STABLE
AS $function$ SELECT * FROM public.image_retry_queue irq WHERE irq.upc = p_upc ORDER BY irq.created_at DESC; $function$
;

CREATE OR REPLACE FUNCTION public.is_source_enabled(p_upc text, p_source_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$ SELECT CASE WHEN (SELECT enrichment_config->'enabled_sources' FROM products_ingestion WHERE upc = p_upc) IS NULL THEN true ELSE (SELECT enrichment_config->'enabled_sources' ? p_source_id::text FROM products_ingestion WHERE upc = p_upc) END; $function$
;

CREATE OR REPLACE FUNCTION public.merge_enrichment_attempt_result(p_upc text, p_status text, p_confidence numeric, p_source_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
AS $function$ declare v_current_status text; v_sources jsonb; v_new_status text; begin select pipeline_status, coalesce(sources, '{}'::jsonb) into v_current_status, v_sources from public.products_ingestion where upc = p_upc for update; if not found then raise warning 'Product UPC % not found in products_ingestion', p_upc; return; end if; v_sources := jsonb_set(coalesce(v_sources, '{}'::jsonb), '{enriched}', p_source_data, true); if p_status = 'success' then v_new_status := 'processed'; elsif p_status = 'partial' and p_confidence >= 0.7 then v_new_status := 'processed'; else v_new_status := 'url_review'; end if; update public.products_ingestion set sources = v_sources, pipeline_status = v_new_status::text::public.pipeline_status_five, updated_at = now() where upc = p_upc; end; $function$
;

create or replace view "public"."admin_orders_list" as  SELECT o.id,
    o.order_number,
    o.source_type,
    o.source_system,
    o.external_order_id,
    o.customer_name,
    o.customer_email,
    o.customer_phone,
    o.status,
    o.payment_method,
    o.payment_status,
    o.fulfillment_method,
    o.fulfillment_status,
    o.subtotal,
    o.tax,
    o.total,
    o.created_at,
    o.updated_at,
    count(oi.id) AS item_count,
    COALESCE(sum(oi.quantity), (0)::bigint) AS total_quantity
   FROM (public.orders o
     LEFT JOIN public.order_items oi ON ((oi.order_id = o.id)))
  GROUP BY o.id;


create or replace view "public"."ai_scraper_stats" as  SELECT sc.id AS config_id,
    sc.slug,
    sc.display_name,
    cv.version_number,
    cv.status,
        CASE
            WHEN (cv.ai_config IS NOT NULL) THEN 'ai'::text
            ELSE 'static'::text
        END AS scraper_type,
    (cv.ai_config ->> 'llm_model'::text) AS llm_model,
    ((cv.ai_config ->> 'max_steps'::text))::integer AS max_steps,
    ((cv.ai_config ->> 'confidence_threshold'::text))::numeric AS confidence_threshold,
    cv.published_at,
    cv.created_at
   FROM (public.scraper_configs sc
     JOIN public.scraper_config_versions cv ON ((sc.id = cv.config_id)))
  WHERE (cv.ai_config IS NOT NULL)
  ORDER BY cv.created_at DESC;


CREATE OR REPLACE FUNCTION public.claim_next_pending_enrichment_attempt(p_runner_name text, p_claim_duration_minutes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$ declare v_attempt_id uuid; v_job_id uuid; v_upc text; v_target_id uuid; v_attempt_number int; v_mode text; v_model text; v_source_url text; v_lease_token uuid; v_lease_expires_at timestamptz; v_result jsonb; begin select ea.id, ea.job_id, ea.upc, ea.target_id, ea.attempt_number, ea.mode, ea.model, ea.source_url into v_attempt_id, v_job_id, v_upc, v_target_id, v_attempt_number, v_mode, v_model, v_source_url from public.enrichment_attempts ea where ea.status = 'queued' and (ea.lease_token is null or ea.lease_expires_at < now()) order by case when ea.source_url is not null then 0 else 1 end, ea.created_at asc limit 1 for update skip locked; if not found then return null; end if; v_lease_token := gen_random_uuid(); v_lease_expires_at := now() + (p_claim_duration_minutes || ' minutes')::interval; if v_source_url is null and v_target_id is not null then select url into v_source_url from public.enrichment_targets where id = v_target_id; end if; update public.enrichment_attempts set status = 'running', claimed_by = p_runner_name, lease_token = v_lease_token, lease_expires_at = v_lease_expires_at, started_at = now(), updated_at = now() where id = v_attempt_id; update public.enrichment_jobs set status = case when status = 'queued' then 'running' else status end, updated_at = now() where id = v_job_id; v_result := jsonb_build_object('id', v_attempt_id, 'job_id', v_job_id, 'upc', v_upc, 'target_id', v_target_id, 'attempt_number', v_attempt_number, 'mode', v_mode, 'model', v_model, 'source_url', v_source_url, 'lease_token', v_lease_token, 'lease_expires_at', v_lease_expires_at::text); return v_result; end; $function$
;

create or replace view "public"."dashboard_migration_progress" as  SELECT (date_trunc('month'::text, created_at))::date AS month,
    source_type,
    count(*) AS order_count
   FROM public.orders
  WHERE (created_at > (now() - '1 year'::interval))
  GROUP BY (date_trunc('month'::text, created_at)), source_type;


create or replace view "public"."dashboard_order_stats" as  SELECT count(*) FILTER (WHERE (status = 'pending'::text)) AS pending_count,
    count(*) FILTER (WHERE (status = 'completed'::text)) AS completed_count,
    count(*) FILTER (WHERE (created_at > (now() - '24:00:00'::interval))) AS last_24h_count,
    COALESCE(sum(total) FILTER (WHERE (created_at > (now() - '24:00:00'::interval))), (0)::numeric) AS last_24h_revenue,
    COALESCE(sum(total) FILTER (WHERE (created_at > (now() - '30 days'::interval))), (0)::numeric) AS last_30d_revenue
   FROM public.orders;


create or replace view "public"."dashboard_product_stats" as  SELECT ( SELECT count(*) AS count
           FROM public.products) AS total_count,
    ( SELECT count(*) AS count
           FROM public.products
          WHERE (products.published_at IS NOT NULL)) AS published_count,
    ( SELECT count(*) AS count
           FROM public.products
          WHERE (products.stock_status = 'out_of_stock'::text)) AS out_of_stock_count,
    ( SELECT count(*) AS count
           FROM public.products
          WHERE (products.quantity <= products.low_stock_threshold)) AS low_stock_count,
    ( SELECT count(*) AS count
           FROM public.products_ingestion
          WHERE ((products_ingestion.pipeline_status)::text <> ALL (ARRAY['finalized'::text, 'published'::text]))) AS pipeline_count,
    ( SELECT max(products.updated_at) AS max
           FROM public.products) AS last_updated;


create or replace view "public"."dashboard_scraper_stats" as  SELECT count(*) AS total_jobs,
    count(*) FILTER (WHERE ((status = 'completed'::text) OR (status = 'completed_with_errors'::text))) AS completed_jobs,
    count(*) FILTER (WHERE (status = 'failed'::text)) AS failed_jobs,
    count(*) FILTER (WHERE ((status = 'running'::text) OR (status = 'claimed'::text) OR (status = 'pending'::text) OR (status = 'queued'::text))) AS active_jobs,
    max(created_at) AS last_job_created
   FROM public.enrichment_jobs
  WHERE (created_at > (now() - '24:00:00'::interval));


CREATE OR REPLACE FUNCTION public.generate_order_number()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    new_order_number text;
BEGIN
    IF NEW.order_number IS NULL THEN
        new_order_number := 'BSP-' || to_char(now(), 'YYMMDD') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
        NEW.order_number := new_order_number;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_action_required_items()
 RETURNS TABLE(category text, label text, count integer, href text, severity text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Unpaid pickup orders over 24 hours
    RETURN QUERY
    SELECT
        'orders'::text,
        'unpaid_pickup'::text,
        count(*)::integer,
        '/admin/orders?payment_status=unpaid&fulfillment_method=pickup'::text,
        'warning'::text
    FROM public.orders
    WHERE payment_status = 'unpaid'
      AND fulfillment_method = 'pickup'
      AND created_at < now() - interval '24 hours'
    HAVING count(*) > 0;

    -- Register-only products not yet pushed
    RETURN QUERY
    SELECT
        'inventory'::text,
        'register_only'::text,
        count(*)::integer,
        '/admin/inventory'::text,
        'info'::text
    FROM public.inventory_reconciliation_items
    WHERE issue_type = 'register_only'
      AND status = 'open'
    HAVING count(*) > 0;

    -- Failed syncs in last 7 days
    RETURN QUERY
    SELECT
        'integration'::text,
        'failed_sync'::text,
        count(*)::integer,
        '/admin/inventory/sync-runs'::text,
        'error'::text
    FROM public.integration_sync_runs
    WHERE status = 'failed'
      AND started_at > now() - interval '7 days'
    HAVING count(*) > 0;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_recent_activity(limit_count integer)
 RETURNS TABLE(id uuid, type text, title text, description text, status text, activity_timestamp timestamp with time zone, href text)
 LANGUAGE plpgsql
AS $function$ BEGIN RETURN QUERY ( SELECT j.id, 'pipeline' as type, 'Pipeline Job ' || j.status as title, CASE WHEN j.config->'scrapers' IS NOT NULL THEN (SELECT string_agg(s::text, ', ') FROM jsonb_array_elements_text(j.config->'scrapers') s) ELSE 'General Enrichment' END as description, CASE WHEN j.status = 'completed' THEN 'success' WHEN j.status = 'failed' THEN 'warning' WHEN j.status = 'running' OR j.status = 'claimed' THEN 'info' ELSE 'pending' END as status, j.created_at as activity_timestamp, '/admin/pipeline/active-runs' as href FROM public.enrichment_jobs j ORDER BY j.created_at DESC LIMIT limit_count ) UNION ALL ( SELECT p.id, 'product' as type, 'Product Updated: ' || p.name as title, p.upc as description, 'info' as status, p.updated_at as activity_timestamp, '/admin/products/' || p.id as href FROM public.products p ORDER BY p.updated_at DESC LIMIT limit_count ) ORDER BY activity_timestamp DESC LIMIT limit_count; END; $function$
;

CREATE OR REPLACE FUNCTION public.get_inventory_drift(p_days integer)
 RETURNS TABLE(upc text, name text, field text, before_value text, after_value text, sync_at timestamp with time zone)
 LANGUAGE plpgsql
AS $function$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'staff')) THEN RAISE EXCEPTION 'Access denied. Admin or staff role required.'; END IF; RETURN QUERY WITH latest_sync AS ( SELECT candidate.preview, candidate.sync_at FROM (SELECT r.metadata->'preview' AS preview, r.started_at AS sync_at FROM public.integration_sync_runs r WHERE r.sync_kind = 'inventory' AND r.status IN ('completed', 'partial') AND r.metadata ? 'preview' AND jsonb_typeof(r.metadata->'preview') = 'array' AND r.started_at >= now() - (p_days || ' days')::interval UNION ALL SELECT ml.metadata->'preview' AS preview, ml.started_at AS sync_at FROM public.migration_log ml WHERE ml.sync_type = 'register_inventory' AND ml.status = 'completed' AND ml.metadata ? 'preview' AND jsonb_typeof(ml.metadata->'preview') = 'array' AND ml.started_at >= now() - (p_days || ' days')::interval) AS candidate ORDER BY candidate.sync_at DESC LIMIT 1 ), expanded_preview AS ( SELECT jsonb_array_elements(preview) AS item, sync_at FROM latest_sync ), expanded_changes AS ( SELECT item->>'sku' AS upc, item->>'name' AS name, jsonb_array_elements(CASE WHEN jsonb_typeof(item->'changes') = 'array' THEN item->'changes' ELSE '[]'::jsonb END) AS change, sync_at FROM expanded_preview ) SELECT ec.upc, ec.name, ec.change->>'field' AS field, ec.change->>'before' AS before_value, ec.change->>'after' AS after_value, ec.sync_at FROM expanded_changes ec; END; $function$
;

CREATE OR REPLACE FUNCTION public.get_pending_image_retries(p_limit integer)
 RETURNS SETOF public.image_retry_queue
 LANGUAGE sql
 STABLE
AS $function$ SELECT * FROM public.image_retry_queue irq WHERE irq.status = 'pending' AND irq.scheduled_for <= now() AND irq.retry_count < irq.max_retries ORDER BY irq.scheduled_for ASC, irq.retry_count ASC LIMIT p_limit; $function$
;

create or replace view "public"."pipeline_export_queue" as  SELECT upc,
    input,
    sources,
    consolidated,
    pipeline_status,
    created_at,
    updated_at,
    b2b_sources,
    enrichment_config,
    is_test_run,
    image_candidates,
    confidence_score,
    selected_images,
    error_message,
    retry_count,
    product_line,
    cohort_id,
    exported_at
   FROM public.products_ingestion pi
  WHERE ((pipeline_status = 'publishing'::public.pipeline_status_five) AND (exported_at IS NULL));


create or replace view "public"."pipeline_finalizing_queue" as  SELECT upc,
    input,
    sources,
    consolidated,
    pipeline_status,
    created_at,
    updated_at,
    b2b_sources,
    enrichment_config,
    is_test_run,
    image_candidates,
    confidence_score,
    selected_images,
    error_message,
    retry_count,
    product_line,
    cohort_id,
    exported_at
   FROM public.products_ingestion pi
  WHERE ((pipeline_status = 'reviewing'::public.pipeline_status_five) AND (exported_at IS NULL));


create or replace view "public"."products_published" as  SELECT pi.upc AS id,
    COALESCE((pi.consolidated ->> 'name'::text), (pi.input ->> 'name'::text)) AS name,
    lower(regexp_replace(COALESCE((pi.consolidated ->> 'name'::text), (pi.input ->> 'name'::text), pi.upc), '[^a-zA-Z0-9]+'::text, '-'::text, 'g'::text)) AS slug,
    COALESCE((pi.consolidated ->> 'description'::text), ''::text) AS description,
    COALESCE(((pi.consolidated ->> 'price'::text))::numeric, ((pi.input ->> 'price'::text))::numeric, (0)::numeric) AS price,
    COALESCE((pi.consolidated -> 'images'::text), '[]'::jsonb) AS images,
    COALESCE((pi.consolidated ->> 'stock_status'::text), 'in_stock'::text) AS stock_status,
    ((pi.consolidated ->> 'brand_id'::text))::uuid AS brand_id,
    COALESCE(((pi.consolidated ->> 'is_featured'::text))::boolean, false) AS is_featured,
    pi.created_at,
    pi.updated_at,
    pi.pipeline_status,
    b.name AS brand_name,
    b.slug AS brand_slug,
    b.logo_url AS brand_logo_url
   FROM (public.products_ingestion pi
     LEFT JOIN public.brands b ON ((((pi.consolidated ->> 'brand_id'::text))::uuid = b.id)))
  WHERE ((pi.pipeline_status = 'publishing'::public.pipeline_status_five) AND (pi.exported_at IS NOT NULL));


CREATE OR REPLACE FUNCTION public.sync_inventory_to_products()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ BEGIN INSERT INTO products (upc, input, pipeline_status) VALUES (NEW.upc, jsonb_strip_nulls(jsonb_build_object('price', NEW.price,'name', NEW.name)),'staging') ON CONFLICT (upc) DO UPDATE SET input = products.input || jsonb_strip_nulls(jsonb_build_object('price', NEW.price,'name', NEW.name)), updated_at = NOW(); RETURN NEW; END; $function$
;

CREATE OR REPLACE FUNCTION public.update_enrichment_job_counters(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$ declare v_total int; v_completed int; v_failed int; v_status text; begin with latest_attempts as (select distinct on (upc) upc, status, attempt_number from public.enrichment_attempts where job_id = p_job_id order by upc, attempt_number desc) select count(*), count(*) filter (where status in ('success', 'partial', 'failed')), count(*) filter (where status = 'failed') into v_total, v_completed, v_failed from latest_attempts; if v_completed >= v_total then if v_failed > 0 then v_status := 'completed_with_errors'; else v_status := 'completed'; end if; else v_status := 'running'; end if; update public.enrichment_jobs set total_count = v_total, completed_count = v_completed, failed_count = v_failed, status = v_status, completed_at = case when v_completed >= v_total then now() else completed_at end, updated_at = now() where id = p_job_id; end; $function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

create or replace view "public"."pipeline_finalized_review" as  SELECT upc,
    input,
    sources,
    consolidated,
    pipeline_status,
    created_at,
    updated_at,
    b2b_sources,
    enrichment_config,
    is_test_run,
    image_candidates,
    confidence_score,
    selected_images,
    error_message,
    retry_count,
    product_line,
    cohort_id,
    exported_at
   FROM public.pipeline_finalizing_queue;


grant delete on table "public"."inventory_reconciliation" to "anon";

grant insert on table "public"."inventory_reconciliation" to "anon";

grant references on table "public"."inventory_reconciliation" to "anon";

grant select on table "public"."inventory_reconciliation" to "anon";

grant trigger on table "public"."inventory_reconciliation" to "anon";

grant truncate on table "public"."inventory_reconciliation" to "anon";

grant update on table "public"."inventory_reconciliation" to "anon";

grant delete on table "public"."inventory_reconciliation" to "authenticated";

grant insert on table "public"."inventory_reconciliation" to "authenticated";

grant references on table "public"."inventory_reconciliation" to "authenticated";

grant select on table "public"."inventory_reconciliation" to "authenticated";

grant trigger on table "public"."inventory_reconciliation" to "authenticated";

grant truncate on table "public"."inventory_reconciliation" to "authenticated";

grant update on table "public"."inventory_reconciliation" to "authenticated";

grant delete on table "public"."inventory_reconciliation" to "service_role";

grant insert on table "public"."inventory_reconciliation" to "service_role";

grant references on table "public"."inventory_reconciliation" to "service_role";

grant select on table "public"."inventory_reconciliation" to "service_role";

grant trigger on table "public"."inventory_reconciliation" to "service_role";

grant truncate on table "public"."inventory_reconciliation" to "service_role";

grant update on table "public"."inventory_reconciliation" to "service_role";

grant delete on table "public"."shopsite_credentials" to "anon";

grant insert on table "public"."shopsite_credentials" to "anon";

grant references on table "public"."shopsite_credentials" to "anon";

grant select on table "public"."shopsite_credentials" to "anon";

grant trigger on table "public"."shopsite_credentials" to "anon";

grant truncate on table "public"."shopsite_credentials" to "anon";

grant update on table "public"."shopsite_credentials" to "anon";

grant delete on table "public"."shopsite_credentials" to "authenticated";

grant insert on table "public"."shopsite_credentials" to "authenticated";

grant references on table "public"."shopsite_credentials" to "authenticated";

grant select on table "public"."shopsite_credentials" to "authenticated";

grant trigger on table "public"."shopsite_credentials" to "authenticated";

grant truncate on table "public"."shopsite_credentials" to "authenticated";

grant update on table "public"."shopsite_credentials" to "authenticated";

grant delete on table "public"."shopsite_credentials" to "service_role";

grant insert on table "public"."shopsite_credentials" to "service_role";

grant references on table "public"."shopsite_credentials" to "service_role";

grant select on table "public"."shopsite_credentials" to "service_role";

grant trigger on table "public"."shopsite_credentials" to "service_role";

grant truncate on table "public"."shopsite_credentials" to "service_role";

grant update on table "public"."shopsite_credentials" to "service_role";


  create policy "Staff manage ai_provider_configs"
  on "public"."ai_provider_configs"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Staff manage b2b_feeds"
  on "public"."b2b_feeds"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Public read brand_sources"
  on "public"."brand_sources"
  as permissive
  for select
  to public
using (true);



  create policy "Staff manage brand_sources"
  on "public"."brand_sources"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Public read inventory_items"
  on "public"."inventory_items"
  as permissive
  for select
  to public
using (true);



  create policy "Staff manage inventory_items"
  on "public"."inventory_items"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Staff manage inventory_reconciliation"
  on "public"."inventory_reconciliation"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Staff manage inventory_reconciliation_items"
  on "public"."inventory_reconciliation_items"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Staff manage order_events"
  on "public"."order_events"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Staff can manage order items"
  on "public"."order_items"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Staff can manage order payments"
  on "public"."order_payments"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Staff manage order_source_records"
  on "public"."order_source_records"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Staff can manage orders"
  on "public"."orders"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Public read preorder_batches"
  on "public"."preorder_batches"
  as permissive
  for select
  to public
using (true);



  create policy "Staff manage preorder_batches"
  on "public"."preorder_batches"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Public read preorder_groups"
  on "public"."preorder_groups"
  as permissive
  for select
  to public
using (true);



  create policy "Staff manage preorder_groups"
  on "public"."preorder_groups"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Public read product_preorder_groups"
  on "public"."product_preorder_groups"
  as permissive
  for select
  to public
using (true);



  create policy "Staff manage product_preorder_groups"
  on "public"."product_preorder_groups"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Public read product_types"
  on "public"."product_types"
  as permissive
  for select
  to public
using (true);



  create policy "Staff manage product_types"
  on "public"."product_types"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Staff manage promo_codes"
  on "public"."promo_codes"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Staff manage promo_redemptions"
  on "public"."promo_redemptions"
  as permissive
  for all
  to authenticated
using (public.is_staff());



  create policy "Admin manage shopsite_credentials"
  on "public"."shopsite_credentials"
  as permissive
  for all
  to authenticated
using (public.is_admin());


CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_calculate_order_totals AFTER INSERT OR DELETE OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.calculate_order_totals();

CREATE TRIGGER update_preorder_batches_updated_at BEFORE UPDATE ON public.preorder_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_preorder_groups_updated_at BEFORE UPDATE ON public.preorder_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


  create policy "authenticated_users_can_presence"
  on "realtime"."messages"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "authenticated_users_can_receive_broadcast"
  on "realtime"."messages"
  as permissive
  for select
  to authenticated
using (true);



  create policy "authenticated_users_can_send_broadcast"
  on "realtime"."messages"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "Public read access for product images"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'product-images'::text));



  create policy "Staff can delete product images"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'product-images'::text) AND public.is_staff()));



  create policy "Staff can update product images"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'product-images'::text) AND public.is_staff()))
with check (((bucket_id = 'product-images'::text) AND public.is_staff()));



  create policy "Staff can upload product images"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'product-images'::text) AND public.is_staff()));



