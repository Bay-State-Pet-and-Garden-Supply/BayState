drop extension if exists "pg_net";

create extension if not exists "vector" with schema "public";

create type "public"."pipeline_status_new_enum" as enum ('registered', 'enriched', 'finalized');

drop trigger if exists "trigger_mark_first_order" on "public"."orders";

drop trigger if exists "update_preorder_batches_updated_at" on "public"."preorder_batches";

drop trigger if exists "update_preorder_groups_updated_at" on "public"."preorder_groups";

drop policy "Allow authenticated users to insert batch jobs" on "public"."batch_jobs";

drop policy "Allow authenticated users to read batch jobs" on "public"."batch_jobs";

drop policy "Allow authenticated users to update batch jobs" on "public"."batch_jobs";

drop policy "Authenticated users can create order items" on "public"."order_items";

drop policy "Staff can delete order items" on "public"."order_items";

drop policy "Staff can update order items" on "public"."order_items";

drop policy "Admin can delete orders" on "public"."orders";

drop policy "Authenticated users can create orders" on "public"."orders";

drop policy "Admin view retry queue" on "public"."pipeline_retry_queue";

drop policy "Admins can insert/update/delete profiles" on "public"."profiles";

drop policy "Admin and staff can create selector suggestions" on "public"."selector_suggestions";

drop policy "Admin and staff can update selector suggestions" on "public"."selector_suggestions";

drop policy "Admin and staff can view selector suggestions" on "public"."selector_suggestions";

drop policy "Admins can delete selector suggestions" on "public"."selector_suggestions";

drop policy "Authenticated users can read suggestions" on "public"."selector_suggestions";

drop policy "Service role can manage selector suggestions" on "public"."selector_suggestions";

drop policy "Service role can manage suggestions" on "public"."selector_suggestions";

drop policy "Admins can view all user pets" on "public"."user_pets";

drop policy "Users can manage their own pets" on "public"."user_pets";

drop policy "Admin manage brand scraper affinity" on "public"."brand_scraper_affinity";

drop policy "Allow admin write access to categories" on "public"."categories";

drop policy "Admin manage cohort batches" on "public"."cohort_batches";

drop policy "Admin manage cohort members" on "public"."cohort_members";

drop policy "Allow admin write access to facet_definitions" on "public"."facet_definitions";

drop policy "Allow admin write access to facet_values" on "public"."facet_values";

drop policy "Allow admin write access to pet_types" on "public"."pet_types";

drop policy "Admin view pipeline audit log" on "public"."pipeline_audit_log";

drop policy "Admin manage retry queue" on "public"."pipeline_retry_queue";

drop policy "Admin manage preorder batches" on "public"."preorder_batches";

drop policy "Admin manage preorder groups" on "public"."preorder_groups";

drop policy "Allow admin write access to product_categories" on "public"."product_categories";

drop policy "Allow admin write access to product_facets" on "public"."product_facets";

drop policy "Admin manage product group products" on "public"."product_group_products";

drop policy "Admin manage product groups" on "public"."product_groups";

drop policy "Allow admin write access to product_pet_types" on "public"."product_pet_types";

drop policy "Admin manage product preorder groups" on "public"."product_preorder_groups";

revoke delete on table "public"."scraper_test_runs" from "anon";

revoke insert on table "public"."scraper_test_runs" from "anon";

revoke references on table "public"."scraper_test_runs" from "anon";

revoke select on table "public"."scraper_test_runs" from "anon";

revoke trigger on table "public"."scraper_test_runs" from "anon";

revoke truncate on table "public"."scraper_test_runs" from "anon";

revoke update on table "public"."scraper_test_runs" from "anon";

revoke delete on table "public"."scraper_test_runs" from "authenticated";

revoke insert on table "public"."scraper_test_runs" from "authenticated";

revoke references on table "public"."scraper_test_runs" from "authenticated";

revoke select on table "public"."scraper_test_runs" from "authenticated";

revoke trigger on table "public"."scraper_test_runs" from "authenticated";

revoke truncate on table "public"."scraper_test_runs" from "authenticated";

revoke update on table "public"."scraper_test_runs" from "authenticated";

revoke delete on table "public"."scraper_test_runs" from "service_role";

revoke insert on table "public"."scraper_test_runs" from "service_role";

revoke references on table "public"."scraper_test_runs" from "service_role";

revoke select on table "public"."scraper_test_runs" from "service_role";

revoke trigger on table "public"."scraper_test_runs" from "service_role";

revoke truncate on table "public"."scraper_test_runs" from "service_role";

revoke update on table "public"."scraper_test_runs" from "service_role";

revoke delete on table "public"."selector_suggestions" from "anon";

revoke insert on table "public"."selector_suggestions" from "anon";

revoke references on table "public"."selector_suggestions" from "anon";

revoke select on table "public"."selector_suggestions" from "anon";

revoke trigger on table "public"."selector_suggestions" from "anon";

revoke truncate on table "public"."selector_suggestions" from "anon";

revoke update on table "public"."selector_suggestions" from "anon";

revoke delete on table "public"."selector_suggestions" from "authenticated";

revoke insert on table "public"."selector_suggestions" from "authenticated";

revoke references on table "public"."selector_suggestions" from "authenticated";

revoke select on table "public"."selector_suggestions" from "authenticated";

revoke trigger on table "public"."selector_suggestions" from "authenticated";

revoke truncate on table "public"."selector_suggestions" from "authenticated";

revoke update on table "public"."selector_suggestions" from "authenticated";

revoke delete on table "public"."selector_suggestions" from "service_role";

revoke insert on table "public"."selector_suggestions" from "service_role";

revoke references on table "public"."selector_suggestions" from "service_role";

revoke select on table "public"."selector_suggestions" from "service_role";

revoke trigger on table "public"."selector_suggestions" from "service_role";

revoke truncate on table "public"."selector_suggestions" from "service_role";

revoke update on table "public"."selector_suggestions" from "service_role";

alter table "public"."batch_job_items" drop constraint "batch_job_items_batch_job_id_fkey";

alter table "public"."categories" drop constraint "categories_slug_key";

alter table "public"."order_payments" drop constraint "order_payments_order_id_fkey";

alter table "public"."orders" drop constraint "orders_legacy_order_number_key";

alter table "public"."orders" drop constraint "orders_promo_code_id_fkey";

alter table "public"."profiles" drop constraint "profiles_auth_user_id_fkey";

alter table "public"."promo_redemptions" drop constraint "promo_redemptions_order_id_fkey";

alter table "public"."scraper_credentials" drop constraint "scraper_credentials_scraper_slug_credential_type_key";

alter table "public"."scraper_test_runs" drop constraint "scraper_test_runs_status_check";

alter table "public"."scraper_test_runs" drop constraint "scraper_test_runs_test_type_check";

alter table "public"."scraper_test_runs" drop constraint "scraper_test_runs_triggered_by_fkey";

alter table "public"."selector_suggestions" drop constraint "selector_suggestions_confidence_check";

alter table "public"."selector_suggestions" drop constraint "selector_suggestions_scraper_id_fkey";

alter table "public"."selector_suggestions" drop constraint "selector_suggestions_selector_type_check";

alter table "public"."selector_suggestions" drop constraint "selector_suggestions_verified_by_fkey";

alter table "public"."scrape_job_chunks" drop constraint "scrape_job_chunks_status_check";

alter table "public"."scrape_jobs" drop constraint "scrape_jobs_status_check";

alter table "public"."user_pets" drop constraint "user_pets_activity_level_check";

alter table "public"."user_pets" drop constraint "user_pets_gender_check";

alter table "public"."user_pets" drop constraint "user_pets_life_stage_check";

alter table "public"."user_pets" drop constraint "user_pets_pet_type_id_fkey";

alter table "public"."user_pets" drop constraint "user_pets_size_class_check";

alter table "public"."user_pets" drop constraint "user_pets_user_id_fkey";

drop function if exists "public"."calculate_selector_health"(p_test_run_id uuid);

drop function if exists "public"."get_group_products"(p_group_id uuid);

drop function if exists "public"."get_product_group_by_slug"(p_slug text);

drop function if exists "public"."get_product_image_retry_history"(p_product_id uuid);

drop function if exists "public"."get_test_run_summary"(p_test_run_id uuid);

drop function if exists "public"."insert_or_update_product_from_scrape"(p_sku text, p_sources jsonb, p_is_test boolean, p_pipeline_status text);

drop function if exists "public"."update_orders_updated_at_column"();

drop function if exists "public"."update_preorder_batches_updated_at"();

drop function if exists "public"."update_preorder_groups_updated_at"();

drop function if exists "public"."update_scraper_health_from_test"(p_scraper_id uuid, p_status text, p_result_data jsonb);

drop function if exists "public"."update_scraper_test_runs_timestamp"();

drop function if exists "public"."update_scrapers_updated_at"();

drop view if exists "public"."admin_orders_list";

drop view if exists "public"."dashboard_migration_progress";

drop view if exists "public"."dashboard_order_stats";

drop view if exists "public"."dashboard_product_stats";

drop view if exists "public"."dashboard_scraper_stats";

drop view if exists "public"."pipeline_export_queue";

drop view if exists "public"."pipeline_finalized_review";

drop view if exists "public"."pipeline_finalizing_queue";

drop view if exists "public"."products_published";

alter table "public"."orders" drop constraint "orders_pkey";

alter table "public"."products" drop constraint "products_pkey";

alter table "public"."products_ingestion" drop constraint "products_ingestion_pkey";

alter table "public"."scraper_test_runs" drop constraint "scraper_test_runs_pkey";

alter table "public"."selector_suggestions" drop constraint "selector_suggestions_pkey";

drop index if exists "public"."categories_slug_key";

drop index if exists "public"."idx_batch_jobs_parent_batch_id";

drop index if exists "public"."idx_image_retry_queue_product";

drop index if exists "public"."idx_orders_legacy_order_number";

drop index if exists "public"."idx_preorder_batches_group_date";

drop index if exists "public"."idx_preorder_groups_active";

drop index if exists "public"."idx_product_preorder_groups_group";

drop index if exists "public"."idx_product_preorder_groups_product";

drop index if exists "public"."idx_products_ingestion_id";

drop index if exists "public"."idx_products_ingestion_is_test_run";

drop index if exists "public"."idx_products_ingestion_selected_images";

drop index if exists "public"."idx_selector_suggestions_scraper";

drop index if exists "public"."idx_selector_suggestions_verified";

drop index if exists "public"."idx_test_runs_assertion_results_gin";

drop index if exists "public"."idx_test_runs_created";

drop index if exists "public"."idx_test_runs_has_failures";

drop index if exists "public"."idx_test_runs_scraper";

drop index if exists "public"."idx_test_runs_scraper_created";

drop index if exists "public"."idx_test_runs_status";

drop index if exists "public"."orders_legacy_order_number_key";

drop index if exists "public"."products_ingestion_pkey";

drop index if exists "public"."products_sku_unique";

drop index if exists "public"."scraper_credentials_scraper_slug_credential_type_key";

drop index if exists "public"."scraper_test_runs_pkey";

drop index if exists "public"."selector_suggestions_pkey";

drop index if exists "public"."idx_batch_jobs_openai_batch_id";

drop index if exists "public"."orders_pkey";

drop index if exists "public"."products_pkey";

drop table "public"."scraper_test_runs";

drop table "public"."selector_suggestions";

alter type "public"."pipeline_status_five" rename to "pipeline_status_five__old_version_to_be_dropped";

create type "public"."pipeline_status_five" as enum ('imported', 'searching', 'url_review', 'scraping', 'extracting', 'scraped', 'consolidating', 'finalizing', 'exporting', 'failed');


  create table "public"."app_settings" (
    "key" text not null,
    "value" text not null,
    "encrypted" boolean default false,
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."app_settings" enable row level security;


  create table "public"."b2b_feeds" (
    "id" uuid not null default gen_random_uuid(),
    "distributor_code" text not null,
    "display_name" text not null,
    "feed_type" text not null,
    "status" text not null default 'unconfigured'::text,
    "last_sync_at" timestamp with time zone,
    "last_sync_job_id" uuid,
    "sync_frequency" text default 'daily'::text,
    "config" jsonb default '{}'::jsonb,
    "enabled" boolean default false,
    "products_count" integer default 0,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."b2b_feeds" enable row level security;


  create table "public"."b2b_sync_jobs" (
    "id" uuid not null default gen_random_uuid(),
    "feed_id" uuid not null,
    "job_type" text not null,
    "status" text not null default 'pending'::text,
    "products_fetched" integer default 0,
    "products_created" integer default 0,
    "products_updated" integer default 0,
    "products_failed" integer default 0,
    "error_message" text,
    "metadata" jsonb default '{}'::jsonb,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "created_by" uuid
      );


alter table "public"."b2b_sync_jobs" enable row level security;


  create table "public"."consolidation_review_requests" (
    "id" uuid not null default gen_random_uuid(),
    "sku" text not null,
    "batch_job_id" uuid,
    "batch_job_item_id" uuid,
    "cohort_id" uuid,
    "status" text not null default 'needs_input'::text,
    "blocking" boolean not null default true,
    "requested_fields" text[] not null default '{}'::text[],
    "field_questions" jsonb not null default '[]'::jsonb,
    "field_candidates" jsonb not null default '{}'::jsonb,
    "candidate_consolidated" jsonb not null default '{}'::jsonb,
    "agent_summary" text,
    "evidence" jsonb not null default '{}'::jsonb,
    "resolution" jsonb not null default '{}'::jsonb,
    "resolved_by" uuid,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."consolidation_review_requests" enable row level security;


  create table "public"."inventory_items" (
    "id" uuid not null default gen_random_uuid(),
    "sku" text not null,
    "price" numeric(10,2),
    "status" text not null default 'pending'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "name" text
      );


alter table "public"."inventory_items" enable row level security;


  create table "public"."legacy_redirects" (
    "id" uuid not null default gen_random_uuid(),
    "old_path" text not null,
    "new_path" text not null,
    "status_code" integer not null default 301,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."legacy_redirects" enable row level security;


  create table "public"."orders_ingestion" (
    "order_id" text not null,
    "order_number" text,
    "order_date" timestamp with time zone,
    "order_status" text,
    "customer_email" text,
    "customer_name" text,
    "total" numeric,
    "items" jsonb default '[]'::jsonb,
    "data" jsonb default '{}'::jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."orders_ingestion" enable row level security;


  create table "public"."pages" (
    "id" uuid not null default gen_random_uuid(),
    "slug" text not null,
    "title" text not null,
    "content" text not null,
    "is_published" boolean default false,
    "meta_title" text,
    "meta_description" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."pages" enable row level security;


  create table "public"."price_history" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid not null,
    "variant_id" uuid,
    "price" numeric not null,
    "compare_at_price" numeric,
    "recorded_at" timestamp with time zone default now()
      );


alter table "public"."price_history" enable row level security;


  create table "public"."product_answers" (
    "id" uuid not null default gen_random_uuid(),
    "question_id" uuid not null,
    "user_id" uuid,
    "answer" text not null,
    "is_official" boolean default false,
    "helpful_count" integer default 0,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."product_answers" enable row level security;


  create table "public"."product_attributes" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid not null,
    "key" text not null,
    "value" text not null,
    "is_filterable" boolean default false,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."product_attributes" enable row level security;


  create table "public"."product_images" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid not null,
    "variant_id" uuid,
    "url" text not null,
    "alt_text" text,
    "position" integer default 0,
    "width" integer,
    "height" integer,
    "is_primary" boolean default false,
    "created_at" timestamp with time zone default now(),
    "storage_path" text
      );


alter table "public"."product_images" enable row level security;


  create table "public"."product_option_values" (
    "id" uuid not null default gen_random_uuid(),
    "option_id" uuid not null,
    "value" text not null,
    "position" integer default 0,
    "color_hex" text,
    "image_url" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."product_option_values" enable row level security;


  create table "public"."product_options" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid not null,
    "name" text not null,
    "position" integer default 0,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."product_options" enable row level security;


  create table "public"."product_questions" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid not null,
    "user_id" uuid,
    "question" text not null,
    "status" text default 'pending'::text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."product_questions" enable row level security;


  create table "public"."product_reviews" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid not null,
    "user_id" uuid,
    "rating" integer not null,
    "title" text,
    "content" text,
    "pros" text[],
    "cons" text[],
    "is_verified_purchase" boolean default false,
    "helpful_count" integer default 0,
    "status" text default 'pending'::text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."product_reviews" enable row level security;


  create table "public"."product_scraped_sites" (
    "id" uuid not null default gen_random_uuid(),
    "sku" text not null,
    "scraper_name" text not null,
    "status" text not null default 'pending'::text,
    "last_scraped_at" timestamp with time zone,
    "error_message" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."product_scraped_sites" enable row level security;


  create table "public"."product_tags" (
    "product_id" uuid not null,
    "tag_id" uuid not null
      );


alter table "public"."product_tags" enable row level security;


  create table "public"."product_types" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );



  create table "public"."product_variants" (
    "id" uuid not null default gen_random_uuid(),
    "product_id" uuid not null,
    "sku" text,
    "barcode" text,
    "title" text,
    "price" numeric not null,
    "compare_at_price" numeric,
    "cost_price" numeric,
    "quantity" integer default 0,
    "weight" numeric,
    "weight_unit" text default 'lb'::text,
    "option_values" jsonb default '[]'::jsonb,
    "image_url" text,
    "is_default" boolean default false,
    "requires_shipping" boolean default true,
    "is_taxable" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."product_variants" enable row level security;


  create table "public"."recently_viewed" (
    "user_id" uuid not null,
    "product_id" uuid not null,
    "viewed_at" timestamp with time zone default now()
      );


alter table "public"."recently_viewed" enable row level security;


  create table "public"."related_products" (
    "product_id" uuid not null,
    "related_product_id" uuid not null,
    "relation_type" text default 'related'::text,
    "position" integer default 0,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."related_products" enable row level security;


  create table "public"."review_helpful_votes" (
    "user_id" uuid not null,
    "review_id" uuid not null,
    "is_helpful" boolean not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."review_helpful_votes" enable row level security;


  create table "public"."scraper_config_test_skus" (
    "id" uuid not null default gen_random_uuid(),
    "config_id" uuid not null,
    "sku" text not null,
    "sku_type" text not null,
    "added_by" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."scraper_config_test_skus" enable row level security;


  create table "public"."scraper_config_versions" (
    "id" uuid not null default gen_random_uuid(),
    "config_id" uuid not null,
    "schema_version" character varying(50) not null,
    "status" character varying(50) not null default 'draft'::character varying,
    "version_number" integer not null,
    "published_at" timestamp with time zone,
    "published_by" uuid,
    "change_summary" text,
    "validation_result" jsonb,
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid,
    "ai_config" jsonb,
    "anti_detection" jsonb,
    "validation_config" jsonb,
    "login_config" jsonb,
    "http_status_config" jsonb,
    "normalization_config" jsonb,
    "timeout" integer default 30,
    "retries" integer default 3,
    "image_quality" integer default 50
      );


alter table "public"."scraper_config_versions" enable row level security;


  create table "public"."scraper_selectors" (
    "id" uuid not null default gen_random_uuid(),
    "version_id" uuid not null,
    "name" text not null,
    "selector" text not null,
    "attribute" text default 'text'::text,
    "multiple" boolean default false,
    "required" boolean default true,
    "sort_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."scraper_selectors" enable row level security;


  create table "public"."scraper_workflow_steps" (
    "id" uuid not null default gen_random_uuid(),
    "version_id" uuid not null,
    "action" text not null,
    "name" text,
    "params" jsonb default '{}'::jsonb,
    "sort_order" integer not null default 0,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."scraper_workflow_steps" enable row level security;


  create table "public"."service_costs" (
    "id" uuid not null default gen_random_uuid(),
    "service" text not null,
    "display_name" text not null,
    "monthly_cost" numeric(10,2) not null default 0,
    "billing_cycle" text not null default 'monthly'::text,
    "category" text not null default 'infrastructure'::text,
    "notes" text,
    "is_active" boolean not null default true,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."service_costs" enable row level security;


  create table "public"."subscription_items" (
    "id" uuid not null default gen_random_uuid(),
    "subscription_id" uuid not null,
    "product_id" uuid not null,
    "quantity" integer not null default 1,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."subscription_items" enable row level security;


  create table "public"."subscription_suggestions" (
    "id" uuid not null default gen_random_uuid(),
    "subscription_id" uuid not null,
    "product_id" uuid not null,
    "pet_id" uuid,
    "reason" text,
    "is_dismissed" boolean default false,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."subscription_suggestions" enable row level security;


  create table "public"."subscriptions" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "name" text not null default 'My Autoship'::text,
    "frequency" text not null,
    "status" text not null default 'active'::text,
    "next_order_date" date not null,
    "last_order_date" date,
    "shipping_address_id" uuid,
    "notes" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
      );


alter table "public"."subscriptions" enable row level security;


  create table "public"."tags" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "slug" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."tags" enable row level security;


  create table "public"."users" (
    "id" uuid not null,
    "full_name" text,
    "avatar_url" text,
    "location" text,
    "phone" text,
    "website" text,
    "linkedin" text,
    "headline" text,
    "billing_address" jsonb,
    "payment_method" jsonb,
    "credits" integer default 0,
    "subscription_status" text default 'none'::text,
    "stripe_customer_id" text,
    "summary" text,
    "is_admin" boolean not null default false
      );


alter table "public"."users" enable row level security;

alter table "public"."products_ingestion" alter column pipeline_status type "public"."pipeline_status_five" using pipeline_status::text::"public"."pipeline_status_five";

drop type "public"."pipeline_status_five__old_version_to_be_dropped";

alter table "public"."categories" alter column "slug" drop not null;

alter table "public"."order_items" alter column "order_id" set not null;

alter table "public"."order_items" alter column "total_price" set default 0;

alter table "public"."order_items" alter column "unit_price" set default 0;

alter table "public"."orders" drop column "billing_address";

alter table "public"."orders" drop column "legacy_order_number";

alter table "public"."orders" drop column "payment_details";

alter table "public"."orders" drop column "shipping_address";

alter table "public"."orders" drop column "shopsite_data";

alter table "public"."orders" drop column "shopsite_transaction_id";

alter table "public"."products" drop column "categories";

alter table "public"."products" drop column "cost";

alter table "public"."products" drop column "fulfillment_type";

alter table "public"."products" drop column "google_product_category";

alter table "public"."products" drop column "legacy_shopsite_id";

alter table "public"."products" drop column "out_of_stock_limit";

alter table "public"."products" drop column "quantity_on_hand";

alter table "public"."products" drop column "shopsite_data";

alter table "public"."products" drop column "taxable";

alter table "public"."products" add column "shopsite_cost" numeric(10,2);

alter table "public"."products" add column "shopsite_product_type" text;

alter table "public"."products" add column "upc" text;

alter table "public"."products" alter column "weight" set data type numeric(10,2) using "weight"::numeric(10,2);

alter table "public"."products_ingestion" drop column "id";

alter table "public"."products_ingestion" alter column "consolidation_review_status" set default 'none'::text;

alter table "public"."products_ingestion" alter column "consolidation_review_status" set not null;

alter table "public"."profiles" drop column "auth_user_id";

alter table "public"."profiles" drop column "organization_id";

alter table "public"."scrape_job_chunks" add column "created_at" timestamp with time zone default now();

alter table "public"."scrape_job_chunks" alter column "results" drop not null;

alter table "public"."scrape_job_chunks" alter column "scrapers" drop not null;

alter table "public"."scrape_job_chunks" alter column "skus" drop default;

alter table "public"."scrape_job_chunks" alter column "skus_failed" drop not null;

alter table "public"."scrape_job_chunks" alter column "skus_processed" drop not null;

alter table "public"."scrape_job_chunks" alter column "skus_successful" drop not null;

alter table "public"."scrape_job_chunks" alter column "status" drop not null;

alter table "public"."scrape_job_chunks" alter column "updated_at" drop not null;

alter table "public"."scrape_jobs" alter column "updated_at" drop not null;

alter table "public"."scraper_configs" drop column "file_path";

alter table "public"."scraper_configs" drop column "name";

alter table "public"."scraper_configs" add column "base_url" text;

alter table "public"."scraper_configs" add column "created_by" uuid;

alter table "public"."scraper_configs" add column "current_version_id" uuid;

alter table "public"."scraper_configs" add column "display_name" character varying(255) not null;

alter table "public"."scraper_configs" add column "domain" character varying(512);

alter table "public"."scraper_configs" add column "health_score" integer default 0;

alter table "public"."scraper_configs" add column "health_status" text default 'unknown'::text;

alter table "public"."scraper_configs" add column "last_test_at" timestamp with time zone;

alter table "public"."scraper_configs" add column "schema_version" character varying(50) not null default '1.0'::character varying;

alter table "public"."scraper_configs" add column "scraper_type" text not null default 'static'::text;

alter table "public"."scraper_configs" add column "status" text default 'draft'::text;

alter table "public"."scraper_configs" enable row level security;

alter table "public"."user_pets" alter column "is_fixed" drop default;

alter table "public"."user_pets" alter column "pet_type_id" set not null;

alter table "public"."user_pets" alter column "user_id" set not null;

alter table "public"."user_pets" alter column "weight_lbs" set data type numeric(6,2) using "weight_lbs"::numeric(6,2);

CREATE UNIQUE INDEX app_settings_pkey ON public.app_settings USING btree (key);

CREATE UNIQUE INDEX b2b_feeds_distributor_code_key ON public.b2b_feeds USING btree (distributor_code);

CREATE UNIQUE INDEX b2b_feeds_pkey ON public.b2b_feeds USING btree (id);

CREATE UNIQUE INDEX b2b_sync_jobs_pkey ON public.b2b_sync_jobs USING btree (id);

CREATE UNIQUE INDEX batch_jobs_openai_batch_id_key ON public.batch_jobs USING btree (openai_batch_id);

CREATE UNIQUE INDEX categories_slug_unique ON public.categories USING btree (slug) WHERE (slug IS NOT NULL);

CREATE UNIQUE INDEX consolidation_review_requests_pkey ON public.consolidation_review_requests USING btree (id);

CREATE INDEX idx_addresses_user_id ON public.addresses USING btree (user_id);

CREATE INDEX idx_b2b_feeds_distributor ON public.b2b_feeds USING btree (distributor_code);

CREATE INDEX idx_b2b_feeds_status ON public.b2b_feeds USING btree (status);

CREATE INDEX idx_b2b_sync_jobs_created ON public.b2b_sync_jobs USING btree (created_at DESC);

CREATE INDEX idx_b2b_sync_jobs_feed ON public.b2b_sync_jobs USING btree (feed_id);

CREATE INDEX idx_b2b_sync_jobs_status ON public.b2b_sync_jobs USING btree (status);

CREATE INDEX idx_batch_job_items_batch_status ON public.batch_job_items USING btree (batch_job_id, status);

CREATE INDEX idx_chunks_by_job ON public.scrape_job_chunks USING btree (job_id);

CREATE INDEX idx_chunks_pending ON public.scrape_job_chunks USING btree (job_id, status, chunk_index) WHERE (status = 'pending'::text);

CREATE INDEX idx_config_versions_config_status ON public.scraper_config_versions USING btree (config_id, status);

CREATE INDEX idx_config_versions_latest ON public.scraper_config_versions USING btree (config_id, version_number DESC);

CREATE INDEX idx_config_versions_published ON public.scraper_config_versions USING btree (config_id, status, published_at DESC);

CREATE UNIQUE INDEX idx_consolidation_review_active_per_sku ON public.consolidation_review_requests USING btree (sku) WHERE (status = ANY (ARRAY['needs_input'::text, 'auto_resolved'::text]));

CREATE INDEX idx_consolidation_review_batch_job ON public.consolidation_review_requests USING btree (batch_job_id) WHERE (batch_job_id IS NOT NULL);

CREATE INDEX idx_consolidation_review_cohort_status ON public.consolidation_review_requests USING btree (cohort_id, status);

CREATE INDEX idx_consolidation_review_sku_status ON public.consolidation_review_requests USING btree (sku, status);

CREATE INDEX idx_consolidation_review_status_created ON public.consolidation_review_requests USING btree (status, created_at DESC) WHERE (status = ANY (ARRAY['needs_input'::text, 'auto_resolved'::text]));

CREATE INDEX idx_inventory_items_sku ON public.inventory_items USING btree (sku);

CREATE INDEX idx_inventory_items_status ON public.inventory_items USING btree (status);

CREATE INDEX idx_legacy_redirects_old_path ON public.legacy_redirects USING btree (old_path);

CREATE INDEX idx_orders_source ON public.orders USING btree (source);

CREATE INDEX idx_price_history_product_time ON public.price_history USING btree (product_id, recorded_at DESC);

CREATE INDEX idx_price_history_variant_time ON public.price_history USING btree (variant_id, recorded_at DESC) WHERE (variant_id IS NOT NULL);

CREATE INDEX idx_product_answers_question_id ON public.product_answers USING btree (question_id);

CREATE INDEX idx_product_attributes_filterable ON public.product_attributes USING btree (key, value) WHERE (is_filterable = true);

CREATE INDEX idx_product_attributes_key ON public.product_attributes USING btree (key);

CREATE INDEX idx_product_attributes_product_id ON public.product_attributes USING btree (product_id);

CREATE UNIQUE INDEX idx_product_images_one_primary ON public.product_images USING btree (product_id) WHERE ((is_primary = true) AND (variant_id IS NULL));

CREATE INDEX idx_product_images_position ON public.product_images USING btree (product_id, "position");

CREATE INDEX idx_product_images_product_id ON public.product_images USING btree (product_id);

CREATE INDEX idx_product_images_storage_path ON public.product_images USING btree (storage_path) WHERE (storage_path IS NOT NULL);

CREATE INDEX idx_product_images_variant_id ON public.product_images USING btree (variant_id);

CREATE INDEX idx_product_option_values_option_id ON public.product_option_values USING btree (option_id);

CREATE INDEX idx_product_options_product_id ON public.product_options USING btree (product_id);

CREATE INDEX idx_product_questions_product_id ON public.product_questions USING btree (product_id);

CREATE INDEX idx_product_questions_status ON public.product_questions USING btree (status);

CREATE INDEX idx_product_reviews_product_id ON public.product_reviews USING btree (product_id);

CREATE INDEX idx_product_reviews_rating ON public.product_reviews USING btree (product_id, rating);

CREATE INDEX idx_product_reviews_status ON public.product_reviews USING btree (status);

CREATE INDEX idx_product_reviews_user_id ON public.product_reviews USING btree (user_id);

CREATE INDEX idx_product_scraped_sites_scraper ON public.product_scraped_sites USING btree (scraper_name);

CREATE INDEX idx_product_scraped_sites_sku ON public.product_scraped_sites USING btree (sku);

CREATE INDEX idx_product_scraped_sites_status ON public.product_scraped_sites USING btree (status);

CREATE INDEX idx_product_tags_product_id ON public.product_tags USING btree (product_id);

CREATE INDEX idx_product_tags_tag_id ON public.product_tags USING btree (tag_id);

CREATE INDEX idx_product_types_name ON public.product_types USING btree (name);

CREATE UNIQUE INDEX idx_product_variants_one_default ON public.product_variants USING btree (product_id) WHERE (is_default = true);

CREATE INDEX idx_product_variants_product_id ON public.product_variants USING btree (product_id);

CREATE INDEX idx_product_variants_sku ON public.product_variants USING btree (sku);

CREATE INDEX idx_products_brand_id ON public.products USING btree (brand_id);

CREATE INDEX idx_products_ingestion_enrichment_config ON public.products_ingestion USING gin (enrichment_config);

CREATE INDEX idx_products_ingestion_review_status ON public.products_ingestion USING btree (consolidation_review_status) WHERE (consolidation_review_status = ANY (ARRAY['needs_input'::text, 'resolved'::text]));

CREATE INDEX idx_products_is_special_order ON public.products USING btree (is_special_order) WHERE (is_special_order = true);

CREATE INDEX idx_products_sku ON public.products USING btree (sku);

CREATE INDEX idx_promo_codes_created_by ON public.promo_codes USING btree (created_by);

CREATE INDEX idx_promo_redemptions_user_id ON public.promo_redemptions USING btree (user_id);

CREATE INDEX idx_recently_viewed_user_time ON public.recently_viewed USING btree (user_id, viewed_at DESC);

CREATE INDEX idx_related_products_product_id ON public.related_products USING btree (product_id);

CREATE INDEX idx_related_products_type ON public.related_products USING btree (product_id, relation_type);

CREATE INDEX idx_scrape_jobs_created_by ON public.scrape_jobs USING btree (created_by);

CREATE INDEX idx_scrape_jobs_status_created ON public.scrape_jobs USING btree (status, created_at) WHERE (status = 'pending'::text);

CREATE INDEX idx_scrape_results_data_gin ON public.scrape_results USING gin (data);

CREATE UNIQUE INDEX idx_scrape_results_idempotency_key ON public.scrape_results USING btree (((data ->> '_idempotency_key'::text))) WHERE ((data ->> '_idempotency_key'::text) IS NOT NULL);

CREATE INDEX idx_scraper_config_test_skus_config_id ON public.scraper_config_test_skus USING btree (config_id);

CREATE INDEX idx_scraper_config_test_skus_type ON public.scraper_config_test_skus USING btree (config_id, sku_type);

CREATE INDEX idx_scraper_configs_current_version ON public.scraper_configs USING btree (current_version_id);

CREATE INDEX idx_scraper_configs_domain ON public.scraper_configs USING btree (domain);

CREATE INDEX idx_scraper_health_metrics_config_id ON public.scraper_health_metrics USING btree (config_id);

CREATE INDEX idx_scraper_runners_current_job_id ON public.scraper_runners USING btree (current_job_id);

CREATE INDEX idx_scraper_selectors_version ON public.scraper_selectors USING btree (version_id);

CREATE UNIQUE INDEX idx_scraper_selectors_version_order ON public.scraper_selectors USING btree (version_id, sort_order);

CREATE INDEX idx_scraper_workflow_steps_version ON public.scraper_workflow_steps USING btree (version_id);

CREATE UNIQUE INDEX idx_scraper_workflow_steps_version_order ON public.scraper_workflow_steps USING btree (version_id, sort_order);

CREATE INDEX idx_service_costs_active ON public.service_costs USING btree (is_active);

CREATE INDEX idx_user_pets_life_stage ON public.user_pets USING btree (life_stage) WHERE (life_stage IS NOT NULL);

CREATE INDEX idx_user_pets_size_class ON public.user_pets USING btree (size_class) WHERE (size_class IS NOT NULL);

CREATE INDEX idx_user_pets_special_needs ON public.user_pets USING gin (special_needs);

CREATE INDEX idx_wishlists_product_id ON public.wishlists USING btree (product_id);

CREATE UNIQUE INDEX inventory_items_pkey ON public.inventory_items USING btree (id);

CREATE UNIQUE INDEX inventory_items_sku_key ON public.inventory_items USING btree (sku);

CREATE UNIQUE INDEX legacy_redirects_old_path_key ON public.legacy_redirects USING btree (old_path);

CREATE UNIQUE INDEX legacy_redirects_pkey ON public.legacy_redirects USING btree (id);

CREATE UNIQUE INDEX orders_pkey1 ON public.orders USING btree (id);

CREATE UNIQUE INDEX pages_pkey ON public.pages USING btree (id);

CREATE UNIQUE INDEX pages_slug_key ON public.pages USING btree (slug);

CREATE UNIQUE INDEX pet_types_name_key ON public.pet_types USING btree (name);

CREATE UNIQUE INDEX price_history_pkey ON public.price_history USING btree (id);

CREATE UNIQUE INDEX product_answers_pkey ON public.product_answers USING btree (id);

CREATE UNIQUE INDEX product_attributes_pkey ON public.product_attributes USING btree (id);

CREATE UNIQUE INDEX product_attributes_product_id_key_key ON public.product_attributes USING btree (product_id, key);

CREATE UNIQUE INDEX product_images_pkey ON public.product_images USING btree (id);

CREATE UNIQUE INDEX product_option_values_pkey ON public.product_option_values USING btree (id);

CREATE UNIQUE INDEX product_options_pkey ON public.product_options USING btree (id);

CREATE UNIQUE INDEX product_questions_pkey ON public.product_questions USING btree (id);

CREATE UNIQUE INDEX product_reviews_pkey ON public.product_reviews USING btree (id);

CREATE UNIQUE INDEX product_scraped_sites_pkey ON public.product_scraped_sites USING btree (id);

CREATE UNIQUE INDEX product_scraped_sites_sku_scraper_name_key ON public.product_scraped_sites USING btree (sku, scraper_name);

CREATE UNIQUE INDEX product_tags_pkey ON public.product_tags USING btree (product_id, tag_id);

CREATE UNIQUE INDEX product_types_pkey ON public.product_types USING btree (id);

CREATE UNIQUE INDEX product_variants_pkey ON public.product_variants USING btree (id);

CREATE UNIQUE INDEX product_variants_sku_key ON public.product_variants USING btree (sku);

CREATE UNIQUE INDEX products_pkey1 ON public.products USING btree (id);

CREATE UNIQUE INDEX products_sku_key ON public.products USING btree (sku);

CREATE UNIQUE INDEX recently_viewed_pkey ON public.recently_viewed USING btree (user_id, product_id);

CREATE UNIQUE INDEX related_products_pkey ON public.related_products USING btree (product_id, related_product_id);

CREATE UNIQUE INDEX related_products_unique_relation ON public.related_products USING btree (product_id, related_product_id, relation_type);

CREATE UNIQUE INDEX review_helpful_votes_pkey ON public.review_helpful_votes USING btree (user_id, review_id);

CREATE UNIQUE INDEX scrape_job_chunks_job_id_chunk_index_key ON public.scrape_job_chunks USING btree (job_id, chunk_index);

CREATE UNIQUE INDEX scraper_config_test_skus_pkey ON public.scraper_config_test_skus USING btree (id);

CREATE UNIQUE INDEX scraper_config_versions_pkey ON public.scraper_config_versions USING btree (id);

CREATE UNIQUE INDEX scraper_credentials_slug_type_unique ON public.scraper_credentials USING btree (scraper_slug, credential_type);

CREATE UNIQUE INDEX scraper_selectors_pkey ON public.scraper_selectors USING btree (id);

CREATE UNIQUE INDEX scraper_workflow_steps_pkey ON public.scraper_workflow_steps USING btree (id);

CREATE UNIQUE INDEX service_costs_pkey ON public.service_costs USING btree (id);

CREATE UNIQUE INDEX service_costs_service_key ON public.service_costs USING btree (service);

CREATE UNIQUE INDEX subscription_items_pkey ON public.subscription_items USING btree (id);

CREATE UNIQUE INDEX subscription_items_unique_product ON public.subscription_items USING btree (subscription_id, product_id);

CREATE UNIQUE INDEX subscription_suggestions_pkey ON public.subscription_suggestions USING btree (id);

CREATE UNIQUE INDEX subscriptions_pkey ON public.subscriptions USING btree (id);

CREATE UNIQUE INDEX tags_name_key ON public.tags USING btree (name);

CREATE UNIQUE INDEX tags_pkey ON public.tags USING btree (id);

CREATE UNIQUE INDEX tags_slug_key ON public.tags USING btree (slug);

CREATE UNIQUE INDEX unique_config_sku ON public.scraper_config_test_skus USING btree (config_id, sku);

CREATE UNIQUE INDEX unique_version_per_config ON public.scraper_config_versions USING btree (config_id, version_number);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

CREATE INDEX idx_batch_jobs_openai_batch_id ON public.batch_jobs USING btree (openai_batch_id) WHERE (openai_batch_id IS NOT NULL);

CREATE UNIQUE INDEX orders_pkey ON public.orders_ingestion USING btree (order_id);

CREATE UNIQUE INDEX products_pkey ON public.products_ingestion USING btree (sku);

alter table "public"."app_settings" add constraint "app_settings_pkey" PRIMARY KEY using index "app_settings_pkey";

alter table "public"."b2b_feeds" add constraint "b2b_feeds_pkey" PRIMARY KEY using index "b2b_feeds_pkey";

alter table "public"."b2b_sync_jobs" add constraint "b2b_sync_jobs_pkey" PRIMARY KEY using index "b2b_sync_jobs_pkey";

alter table "public"."consolidation_review_requests" add constraint "consolidation_review_requests_pkey" PRIMARY KEY using index "consolidation_review_requests_pkey";

alter table "public"."inventory_items" add constraint "inventory_items_pkey" PRIMARY KEY using index "inventory_items_pkey";

alter table "public"."legacy_redirects" add constraint "legacy_redirects_pkey" PRIMARY KEY using index "legacy_redirects_pkey";

alter table "public"."orders" add constraint "orders_pkey1" PRIMARY KEY using index "orders_pkey1";

alter table "public"."orders_ingestion" add constraint "orders_pkey" PRIMARY KEY using index "orders_pkey";

alter table "public"."pages" add constraint "pages_pkey" PRIMARY KEY using index "pages_pkey";

alter table "public"."price_history" add constraint "price_history_pkey" PRIMARY KEY using index "price_history_pkey";

alter table "public"."product_answers" add constraint "product_answers_pkey" PRIMARY KEY using index "product_answers_pkey";

alter table "public"."product_attributes" add constraint "product_attributes_pkey" PRIMARY KEY using index "product_attributes_pkey";

alter table "public"."product_images" add constraint "product_images_pkey" PRIMARY KEY using index "product_images_pkey";

alter table "public"."product_option_values" add constraint "product_option_values_pkey" PRIMARY KEY using index "product_option_values_pkey";

alter table "public"."product_options" add constraint "product_options_pkey" PRIMARY KEY using index "product_options_pkey";

alter table "public"."product_questions" add constraint "product_questions_pkey" PRIMARY KEY using index "product_questions_pkey";

alter table "public"."product_reviews" add constraint "product_reviews_pkey" PRIMARY KEY using index "product_reviews_pkey";

alter table "public"."product_scraped_sites" add constraint "product_scraped_sites_pkey" PRIMARY KEY using index "product_scraped_sites_pkey";

alter table "public"."product_tags" add constraint "product_tags_pkey" PRIMARY KEY using index "product_tags_pkey";

alter table "public"."product_types" add constraint "product_types_pkey" PRIMARY KEY using index "product_types_pkey";

alter table "public"."product_variants" add constraint "product_variants_pkey" PRIMARY KEY using index "product_variants_pkey";

alter table "public"."products" add constraint "products_pkey1" PRIMARY KEY using index "products_pkey1";

alter table "public"."products_ingestion" add constraint "products_pkey" PRIMARY KEY using index "products_pkey";

alter table "public"."recently_viewed" add constraint "recently_viewed_pkey" PRIMARY KEY using index "recently_viewed_pkey";

alter table "public"."related_products" add constraint "related_products_pkey" PRIMARY KEY using index "related_products_pkey";

alter table "public"."review_helpful_votes" add constraint "review_helpful_votes_pkey" PRIMARY KEY using index "review_helpful_votes_pkey";

alter table "public"."scraper_config_test_skus" add constraint "scraper_config_test_skus_pkey" PRIMARY KEY using index "scraper_config_test_skus_pkey";

alter table "public"."scraper_config_versions" add constraint "scraper_config_versions_pkey" PRIMARY KEY using index "scraper_config_versions_pkey";

alter table "public"."scraper_selectors" add constraint "scraper_selectors_pkey" PRIMARY KEY using index "scraper_selectors_pkey";

alter table "public"."scraper_workflow_steps" add constraint "scraper_workflow_steps_pkey" PRIMARY KEY using index "scraper_workflow_steps_pkey";

alter table "public"."service_costs" add constraint "service_costs_pkey" PRIMARY KEY using index "service_costs_pkey";

alter table "public"."subscription_items" add constraint "subscription_items_pkey" PRIMARY KEY using index "subscription_items_pkey";

alter table "public"."subscription_suggestions" add constraint "subscription_suggestions_pkey" PRIMARY KEY using index "subscription_suggestions_pkey";

alter table "public"."subscriptions" add constraint "subscriptions_pkey" PRIMARY KEY using index "subscriptions_pkey";

alter table "public"."tags" add constraint "tags_pkey" PRIMARY KEY using index "tags_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."b2b_feeds" add constraint "b2b_feeds_distributor_code_key" UNIQUE using index "b2b_feeds_distributor_code_key";

alter table "public"."b2b_feeds" add constraint "b2b_feeds_feed_type_check" CHECK ((feed_type = ANY (ARRAY['REST'::text, 'SFTP'::text, 'EDI'::text]))) not valid;

alter table "public"."b2b_feeds" validate constraint "b2b_feeds_feed_type_check";

alter table "public"."b2b_feeds" add constraint "b2b_feeds_status_check" CHECK ((status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'offline'::text, 'unconfigured'::text]))) not valid;

alter table "public"."b2b_feeds" validate constraint "b2b_feeds_status_check";

alter table "public"."b2b_feeds" add constraint "b2b_feeds_sync_frequency_check" CHECK ((sync_frequency = ANY (ARRAY['hourly'::text, 'daily'::text, 'weekly'::text, 'manual'::text]))) not valid;

alter table "public"."b2b_feeds" validate constraint "b2b_feeds_sync_frequency_check";

alter table "public"."b2b_sync_jobs" add constraint "b2b_sync_jobs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."b2b_sync_jobs" validate constraint "b2b_sync_jobs_created_by_fkey";

alter table "public"."b2b_sync_jobs" add constraint "b2b_sync_jobs_feed_id_fkey" FOREIGN KEY (feed_id) REFERENCES public.b2b_feeds(id) ON DELETE CASCADE not valid;

alter table "public"."b2b_sync_jobs" validate constraint "b2b_sync_jobs_feed_id_fkey";

alter table "public"."b2b_sync_jobs" add constraint "b2b_sync_jobs_job_type_check" CHECK ((job_type = ANY (ARRAY['catalog'::text, 'inventory'::text, 'pricing'::text, 'full'::text]))) not valid;

alter table "public"."b2b_sync_jobs" validate constraint "b2b_sync_jobs_job_type_check";

alter table "public"."b2b_sync_jobs" add constraint "b2b_sync_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "public"."b2b_sync_jobs" validate constraint "b2b_sync_jobs_status_check";

alter table "public"."batch_job_items" add constraint "batch_job_items_batch_id_fkey" FOREIGN KEY (batch_job_id) REFERENCES public.batch_jobs(id) ON DELETE CASCADE not valid;

alter table "public"."batch_job_items" validate constraint "batch_job_items_batch_id_fkey";

alter table "public"."batch_jobs" add constraint "batch_jobs_openai_batch_id_key" UNIQUE using index "batch_jobs_openai_batch_id_key";

alter table "public"."consolidation_review_requests" add constraint "consolidation_review_requests_batch_job_id_fkey" FOREIGN KEY (batch_job_id) REFERENCES public.batch_jobs(id) ON DELETE SET NULL not valid;

alter table "public"."consolidation_review_requests" validate constraint "consolidation_review_requests_batch_job_id_fkey";

alter table "public"."consolidation_review_requests" add constraint "consolidation_review_requests_batch_job_item_id_fkey" FOREIGN KEY (batch_job_item_id) REFERENCES public.batch_job_items(id) ON DELETE SET NULL not valid;

alter table "public"."consolidation_review_requests" validate constraint "consolidation_review_requests_batch_job_item_id_fkey";

alter table "public"."consolidation_review_requests" add constraint "consolidation_review_requests_cohort_id_fkey" FOREIGN KEY (cohort_id) REFERENCES public.cohort_batches(id) ON DELETE SET NULL not valid;

alter table "public"."consolidation_review_requests" validate constraint "consolidation_review_requests_cohort_id_fkey";

alter table "public"."consolidation_review_requests" add constraint "consolidation_review_requests_resolved_by_fkey" FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."consolidation_review_requests" validate constraint "consolidation_review_requests_resolved_by_fkey";

alter table "public"."consolidation_review_requests" add constraint "consolidation_review_requests_sku_fkey" FOREIGN KEY (sku) REFERENCES public.products_ingestion(sku) ON DELETE CASCADE not valid;

alter table "public"."consolidation_review_requests" validate constraint "consolidation_review_requests_sku_fkey";

alter table "public"."consolidation_review_requests" add constraint "consolidation_review_status_check" CHECK ((status = ANY (ARRAY['needs_input'::text, 'resolved'::text, 'dismissed'::text, 'auto_resolved'::text]))) not valid;

alter table "public"."consolidation_review_requests" validate constraint "consolidation_review_status_check";

alter table "public"."inventory_items" add constraint "inventory_items_sku_key" UNIQUE using index "inventory_items_sku_key";

alter table "public"."legacy_redirects" add constraint "legacy_redirects_old_path_key" UNIQUE using index "legacy_redirects_old_path_key";

alter table "public"."order_items" add constraint "order_items_quantity_check" CHECK ((quantity > 0)) not valid;

alter table "public"."order_items" validate constraint "order_items_quantity_check";

alter table "public"."pages" add constraint "pages_slug_key" UNIQUE using index "pages_slug_key";

alter table "public"."pet_types" add constraint "pet_types_name_key" UNIQUE using index "pet_types_name_key";

alter table "public"."price_history" add constraint "price_history_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."price_history" validate constraint "price_history_product_id_fkey";

alter table "public"."price_history" add constraint "price_history_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE not valid;

alter table "public"."price_history" validate constraint "price_history_variant_id_fkey";

alter table "public"."product_answers" add constraint "product_answers_question_id_fkey" FOREIGN KEY (question_id) REFERENCES public.product_questions(id) ON DELETE CASCADE not valid;

alter table "public"."product_answers" validate constraint "product_answers_question_id_fkey";

alter table "public"."product_answers" add constraint "product_answers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."product_answers" validate constraint "product_answers_user_id_fkey";

alter table "public"."product_answers" add constraint "product_answers_user_profile_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."product_answers" validate constraint "product_answers_user_profile_fkey";

alter table "public"."product_attributes" add constraint "product_attributes_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_attributes" validate constraint "product_attributes_product_id_fkey";

alter table "public"."product_attributes" add constraint "product_attributes_product_id_key_key" UNIQUE using index "product_attributes_product_id_key_key";

alter table "public"."product_images" add constraint "product_images_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_images" validate constraint "product_images_product_id_fkey";

alter table "public"."product_images" add constraint "product_images_variant_id_fkey" FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE not valid;

alter table "public"."product_images" validate constraint "product_images_variant_id_fkey";

alter table "public"."product_option_values" add constraint "product_option_values_option_id_fkey" FOREIGN KEY (option_id) REFERENCES public.product_options(id) ON DELETE CASCADE not valid;

alter table "public"."product_option_values" validate constraint "product_option_values_option_id_fkey";

alter table "public"."product_options" add constraint "product_options_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_options" validate constraint "product_options_product_id_fkey";

alter table "public"."product_questions" add constraint "product_questions_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_questions" validate constraint "product_questions_product_id_fkey";

alter table "public"."product_questions" add constraint "product_questions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))) not valid;

alter table "public"."product_questions" validate constraint "product_questions_status_check";

alter table "public"."product_questions" add constraint "product_questions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."product_questions" validate constraint "product_questions_user_id_fkey";

alter table "public"."product_questions" add constraint "product_questions_user_profile_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."product_questions" validate constraint "product_questions_user_profile_fkey";

alter table "public"."product_reviews" add constraint "product_reviews_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_reviews" validate constraint "product_reviews_product_id_fkey";

alter table "public"."product_reviews" add constraint "product_reviews_rating_check" CHECK (((rating >= 1) AND (rating <= 5))) not valid;

alter table "public"."product_reviews" validate constraint "product_reviews_rating_check";

alter table "public"."product_reviews" add constraint "product_reviews_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))) not valid;

alter table "public"."product_reviews" validate constraint "product_reviews_status_check";

alter table "public"."product_reviews" add constraint "product_reviews_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."product_reviews" validate constraint "product_reviews_user_id_fkey";

alter table "public"."product_reviews" add constraint "product_reviews_user_profile_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) not valid;

alter table "public"."product_reviews" validate constraint "product_reviews_user_profile_fkey";

alter table "public"."product_scraped_sites" add constraint "product_scraped_sites_sku_fkey" FOREIGN KEY (sku) REFERENCES public.products_ingestion(sku) ON DELETE CASCADE not valid;

alter table "public"."product_scraped_sites" validate constraint "product_scraped_sites_sku_fkey";

alter table "public"."product_scraped_sites" add constraint "product_scraped_sites_sku_scraper_name_key" UNIQUE using index "product_scraped_sites_sku_scraper_name_key";

alter table "public"."product_tags" add constraint "product_tags_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_tags" validate constraint "product_tags_product_id_fkey";

alter table "public"."product_tags" add constraint "product_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE not valid;

alter table "public"."product_tags" validate constraint "product_tags_tag_id_fkey";

alter table "public"."product_variants" add constraint "product_variants_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."product_variants" validate constraint "product_variants_product_id_fkey";

alter table "public"."product_variants" add constraint "product_variants_sku_key" UNIQUE using index "product_variants_sku_key";

alter table "public"."product_variants" add constraint "product_variants_weight_unit_check" CHECK ((weight_unit = ANY (ARRAY['lb'::text, 'oz'::text, 'kg'::text, 'g'::text]))) not valid;

alter table "public"."product_variants" validate constraint "product_variants_weight_unit_check";

alter table "public"."products" add constraint "products_sku_key" UNIQUE using index "products_sku_key";

alter table "public"."products_ingestion" add constraint "products_ingestion_active_consolidation_review_id_fkey" FOREIGN KEY (active_consolidation_review_id) REFERENCES public.consolidation_review_requests(id) ON DELETE SET NULL not valid;

alter table "public"."products_ingestion" validate constraint "products_ingestion_active_consolidation_review_id_fkey";

alter table "public"."products_ingestion" add constraint "products_ingestion_consolidation_review_status_check" CHECK ((consolidation_review_status = ANY (ARRAY['none'::text, 'needs_input'::text, 'resolved'::text, 'dismissed'::text]))) not valid;

alter table "public"."products_ingestion" validate constraint "products_ingestion_consolidation_review_status_check";

alter table "public"."recently_viewed" add constraint "recently_viewed_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."recently_viewed" validate constraint "recently_viewed_product_id_fkey";

alter table "public"."recently_viewed" add constraint "recently_viewed_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."recently_viewed" validate constraint "recently_viewed_user_id_fkey";

alter table "public"."related_products" add constraint "no_self_relation" CHECK ((product_id <> related_product_id)) not valid;

alter table "public"."related_products" validate constraint "no_self_relation";

alter table "public"."related_products" add constraint "related_products_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."related_products" validate constraint "related_products_product_id_fkey";

alter table "public"."related_products" add constraint "related_products_related_product_id_fkey" FOREIGN KEY (related_product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."related_products" validate constraint "related_products_related_product_id_fkey";

alter table "public"."related_products" add constraint "related_products_relation_type_check" CHECK ((relation_type = ANY (ARRAY['related'::text, 'upsell'::text, 'cross_sell'::text, 'bundle'::text, 'accessory'::text, 'frequently_bought'::text]))) not valid;

alter table "public"."related_products" validate constraint "related_products_relation_type_check";

alter table "public"."related_products" add constraint "related_products_unique_relation" UNIQUE using index "related_products_unique_relation";

alter table "public"."review_helpful_votes" add constraint "review_helpful_votes_review_id_fkey" FOREIGN KEY (review_id) REFERENCES public.product_reviews(id) ON DELETE CASCADE not valid;

alter table "public"."review_helpful_votes" validate constraint "review_helpful_votes_review_id_fkey";

alter table "public"."review_helpful_votes" add constraint "review_helpful_votes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."review_helpful_votes" validate constraint "review_helpful_votes_user_id_fkey";

alter table "public"."scrape_job_chunks" add constraint "scrape_job_chunks_job_id_chunk_index_key" UNIQUE using index "scrape_job_chunks_job_id_chunk_index_key";

alter table "public"."scrape_job_chunks" add constraint "scrape_job_chunks_job_id_fkey" FOREIGN KEY (job_id) REFERENCES public.scrape_jobs(id) ON DELETE CASCADE not valid;

alter table "public"."scrape_job_chunks" validate constraint "scrape_job_chunks_job_id_fkey";

alter table "public"."scraper_config_test_skus" add constraint "scraper_config_test_skus_added_by_fkey" FOREIGN KEY (added_by) REFERENCES auth.users(id) not valid;

alter table "public"."scraper_config_test_skus" validate constraint "scraper_config_test_skus_added_by_fkey";

alter table "public"."scraper_config_test_skus" add constraint "scraper_config_test_skus_config_id_fkey" FOREIGN KEY (config_id) REFERENCES public.scraper_configs(id) ON DELETE CASCADE not valid;

alter table "public"."scraper_config_test_skus" validate constraint "scraper_config_test_skus_config_id_fkey";

alter table "public"."scraper_config_test_skus" add constraint "scraper_config_test_skus_sku_type_check" CHECK ((sku_type = ANY (ARRAY['test'::text, 'fake'::text, 'edge_case'::text]))) not valid;

alter table "public"."scraper_config_test_skus" validate constraint "scraper_config_test_skus_sku_type_check";

alter table "public"."scraper_config_test_skus" add constraint "unique_config_sku" UNIQUE using index "unique_config_sku";

alter table "public"."scraper_config_versions" add constraint "fk_config_id" FOREIGN KEY (config_id) REFERENCES public.scraper_configs(id) ON DELETE CASCADE not valid;

alter table "public"."scraper_config_versions" validate constraint "fk_config_id";

alter table "public"."scraper_config_versions" add constraint "scraper_config_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."scraper_config_versions" validate constraint "scraper_config_versions_created_by_fkey";

alter table "public"."scraper_config_versions" add constraint "scraper_config_versions_status_check" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'validated'::character varying, 'published'::character varying, 'archived'::character varying])::text[]))) not valid;

alter table "public"."scraper_config_versions" validate constraint "scraper_config_versions_status_check";

alter table "public"."scraper_config_versions" add constraint "unique_version_per_config" UNIQUE using index "unique_version_per_config";

alter table "public"."scraper_config_versions" add constraint "valid_status" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'validated'::character varying, 'published'::character varying, 'archived'::character varying])::text[]))) not valid;

alter table "public"."scraper_config_versions" validate constraint "valid_status";

alter table "public"."scraper_configs" add constraint "fk_current_version" FOREIGN KEY (current_version_id) REFERENCES public.scraper_config_versions(id) not valid;

alter table "public"."scraper_configs" validate constraint "fk_current_version";

alter table "public"."scraper_configs" add constraint "scraper_configs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."scraper_configs" validate constraint "scraper_configs_created_by_fkey";

alter table "public"."scraper_configs" add constraint "scraper_configs_scraper_type_check" CHECK ((scraper_type = ANY (ARRAY['static'::text, 'agentic'::text]))) not valid;

alter table "public"."scraper_configs" validate constraint "scraper_configs_scraper_type_check";

alter table "public"."scraper_credentials" add constraint "scraper_credentials_slug_type_unique" UNIQUE using index "scraper_credentials_slug_type_unique";

alter table "public"."scraper_selectors" add constraint "scraper_selectors_version_id_fkey" FOREIGN KEY (version_id) REFERENCES public.scraper_config_versions(id) ON DELETE CASCADE not valid;

alter table "public"."scraper_selectors" validate constraint "scraper_selectors_version_id_fkey";

alter table "public"."scraper_workflow_steps" add constraint "scraper_workflow_steps_version_id_fkey" FOREIGN KEY (version_id) REFERENCES public.scraper_config_versions(id) ON DELETE CASCADE not valid;

alter table "public"."scraper_workflow_steps" validate constraint "scraper_workflow_steps_version_id_fkey";

alter table "public"."service_costs" add constraint "service_costs_billing_cycle_check" CHECK ((billing_cycle = ANY (ARRAY['monthly'::text, 'annual'::text]))) not valid;

alter table "public"."service_costs" validate constraint "service_costs_billing_cycle_check";

alter table "public"."service_costs" add constraint "service_costs_category_check" CHECK ((category = ANY (ARRAY['infrastructure'::text, 'ai'::text, 'payment'::text, 'communication'::text, 'other'::text]))) not valid;

alter table "public"."service_costs" validate constraint "service_costs_category_check";

alter table "public"."service_costs" add constraint "service_costs_service_key" UNIQUE using index "service_costs_service_key";

alter table "public"."subscription_items" add constraint "subscription_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."subscription_items" validate constraint "subscription_items_product_id_fkey";

alter table "public"."subscription_items" add constraint "subscription_items_quantity_check" CHECK ((quantity > 0)) not valid;

alter table "public"."subscription_items" validate constraint "subscription_items_quantity_check";

alter table "public"."subscription_items" add constraint "subscription_items_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE not valid;

alter table "public"."subscription_items" validate constraint "subscription_items_subscription_id_fkey";

alter table "public"."subscription_items" add constraint "subscription_items_unique_product" UNIQUE using index "subscription_items_unique_product";

alter table "public"."subscription_suggestions" add constraint "subscription_suggestions_pet_id_fkey" FOREIGN KEY (pet_id) REFERENCES public.user_pets(id) ON DELETE SET NULL not valid;

alter table "public"."subscription_suggestions" validate constraint "subscription_suggestions_pet_id_fkey";

alter table "public"."subscription_suggestions" add constraint "subscription_suggestions_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE not valid;

alter table "public"."subscription_suggestions" validate constraint "subscription_suggestions_product_id_fkey";

alter table "public"."subscription_suggestions" add constraint "subscription_suggestions_subscription_id_fkey" FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE CASCADE not valid;

alter table "public"."subscription_suggestions" validate constraint "subscription_suggestions_subscription_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_frequency_check" CHECK ((frequency = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text, 'bimonthly'::text, 'quarterly'::text]))) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_frequency_check";

alter table "public"."subscriptions" add constraint "subscriptions_shipping_address_id_fkey" FOREIGN KEY (shipping_address_id) REFERENCES public.addresses(id) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_shipping_address_id_fkey";

alter table "public"."subscriptions" add constraint "subscriptions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'cancelled'::text]))) not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_status_check";

alter table "public"."subscriptions" add constraint "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."subscriptions" validate constraint "subscriptions_user_id_fkey";

alter table "public"."tags" add constraint "tags_name_key" UNIQUE using index "tags_name_key";

alter table "public"."tags" add constraint "tags_slug_key" UNIQUE using index "tags_slug_key";

alter table "public"."users" add constraint "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) not valid;

alter table "public"."users" validate constraint "users_id_fkey";

alter table "public"."users" add constraint "users_subscription_status_check" CHECK ((subscription_status = ANY (ARRAY['active'::text, 'past_due'::text, 'none'::text]))) not valid;

alter table "public"."users" validate constraint "users_subscription_status_check";

alter table "public"."scrape_job_chunks" add constraint "scrape_job_chunks_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'running'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "public"."scrape_job_chunks" validate constraint "scrape_job_chunks_status_check";

alter table "public"."scrape_jobs" add constraint "scrape_jobs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'claimed'::text, 'running'::text, 'completed'::text, 'failed'::text, 'cancelled'::text]))) not valid;

alter table "public"."scrape_jobs" validate constraint "scrape_jobs_status_check";

alter table "public"."user_pets" add constraint "user_pets_activity_level_check" CHECK (((activity_level IS NULL) OR (activity_level = ANY (ARRAY['low'::text, 'moderate'::text, 'high'::text, 'very_high'::text])))) not valid;

alter table "public"."user_pets" validate constraint "user_pets_activity_level_check";

alter table "public"."user_pets" add constraint "user_pets_gender_check" CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['male'::text, 'female'::text])))) not valid;

alter table "public"."user_pets" validate constraint "user_pets_gender_check";

alter table "public"."user_pets" add constraint "user_pets_life_stage_check" CHECK (((life_stage IS NULL) OR (life_stage = ANY (ARRAY['puppy'::text, 'kitten'::text, 'juvenile'::text, 'adult'::text, 'senior'::text])))) not valid;

alter table "public"."user_pets" validate constraint "user_pets_life_stage_check";

alter table "public"."user_pets" add constraint "user_pets_pet_type_id_fkey" FOREIGN KEY (pet_type_id) REFERENCES public.pet_types(id) ON DELETE RESTRICT not valid;

alter table "public"."user_pets" validate constraint "user_pets_pet_type_id_fkey";

alter table "public"."user_pets" add constraint "user_pets_size_class_check" CHECK (((size_class IS NULL) OR (size_class = ANY (ARRAY['small'::text, 'medium'::text, 'large'::text, 'giant'::text])))) not valid;

alter table "public"."user_pets" validate constraint "user_pets_size_class_check";

alter table "public"."user_pets" add constraint "user_pets_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE not valid;

alter table "public"."user_pets" validate constraint "user_pets_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.admin_migrate_data(target_user_id uuid, user_email text, profile_data jsonb, work_data jsonb, edu_data jsonb, project_data jsonb, skill_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    entry JSONB;
BEGIN
    -- 1. Ensure User Profile Exists (Bypassing RLS)
    INSERT INTO public.users (id, full_name, headline, location, summary, website, linkedin)
    VALUES (
        target_user_id,
        profile_data->>'full_name',
        profile_data->>'headline',
        profile_data->>'location',
        profile_data->>'summary',
        profile_data->>'website',
        profile_data->>'linkedin'
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        headline = EXCLUDED.headline,
        location = EXCLUDED.location,
        summary = EXCLUDED.summary,
        website = EXCLUDED.website,
        linkedin = EXCLUDED.linkedin;

    -- 2. Wipe Master Entries for User (Bypassing RLS)
    DELETE FROM public.master_entries WHERE user_id = target_user_id;

    -- 3. Insert Work Entries
    FOR entry IN SELECT * FROM jsonb_array_elements(work_data)
    LOOP
        INSERT INTO public.master_entries (user_id, type, content)
        VALUES (target_user_id, 'work', entry);
    END LOOP;

    -- 4. Insert Education Entries
    FOR entry IN SELECT * FROM jsonb_array_elements(edu_data)
    LOOP
        INSERT INTO public.master_entries (user_id, type, content)
        VALUES (target_user_id, 'education', entry);
    END LOOP;

    -- 5. Insert Project Entries
    FOR entry IN SELECT * FROM jsonb_array_elements(project_data)
    LOOP
        INSERT INTO public.master_entries (user_id, type, content)
        VALUES (target_user_id, 'project', entry);
    END LOOP;

    -- 6. Insert Skill Entries
    FOR entry IN SELECT * FROM jsonb_array_elements(skill_data)
    LOOP
        INSERT INTO public.master_entries (user_id, type, content)
        VALUES (target_user_id, 'skill', entry);
    END LOOP;

    -- 7. Ensure Resume Exists
    INSERT INTO public.resumes (user_id, title, target_role, content)
    VALUES (
        target_user_id,
        'Full Stack Import',
        'Software Engineer',
        jsonb_build_object(
            'basics', jsonb_build_object(
                'name', profile_data->>'full_name',
                'label', profile_data->>'headline',
                'email', user_email,
                'summary', profile_data->>'summary',
                'location', jsonb_build_object('city', profile_data->>'location')
            ),
            'meta', jsonb_build_object('template', 'modern')
        )
    );
END;
$function$
;

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


CREATE OR REPLACE FUNCTION public.claim_next_chunk(p_job_id uuid, p_runner_name text)
 RETURNS TABLE(chunk_id uuid, chunk_index integer, skus text[], scrapers text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_chunk_id UUID;
    v_chunk_index INT;
    v_skus TEXT[];
    v_scrapers TEXT[];
BEGIN
    -- Atomically select and lock the next pending chunk
    SELECT c.id, c.chunk_index, c.skus, c.scrapers
    INTO v_chunk_id, v_chunk_index, v_skus, v_scrapers
    FROM scrape_job_chunks c
    WHERE c.job_id = p_job_id 
      AND c.status = 'pending'
    ORDER BY c.chunk_index
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    -- If we found a chunk, update it to claimed status
    IF v_chunk_id IS NOT NULL THEN
        UPDATE scrape_job_chunks
        SET status = 'claimed',
            claimed_by = p_runner_name,
            claimed_at = now(),
            updated_at = now()
        WHERE id = v_chunk_id;
        
        -- Return the claimed chunk details
        chunk_id := v_chunk_id;
        chunk_index := v_chunk_index;
        skus := v_skus;
        scrapers := v_scrapers;
        RETURN NEXT;
    END IF;
    
    -- If no chunk found, returns empty result set
    RETURN;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.exec_sql(query text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    EXECUTE query;
    RETURN json_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_subscription_suggestions(p_subscription_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- This is a placeholder. In a real app, logic to generate suggestions would go here.
    NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_ai_cost_stats(p_start_date date, p_end_date date)
 RETURNS TABLE(total_cost numeric, total_runs bigint, avg_cost_per_run numeric, total_input_tokens bigint, total_output_tokens bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        COALESCE(SUM(total_cost_usd), 0)::DECIMAL,
        COUNT(*)::BIGINT,
        COALESCE(AVG(total_cost_usd), 0)::DECIMAL,
        COALESCE(SUM(input_tokens), 0)::BIGINT,
        COALESCE(SUM(output_tokens), 0)::BIGINT
    FROM public.ai_scraper_costs
    WHERE DATE(created_at) BETWEEN p_start_date AND p_end_date;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_next_version_number(p_config_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_max_version
    FROM public.scraper_config_versions
    WHERE config_id = p_config_id;
    RETURN v_max_version;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_store_analytics(start_date timestamp with time zone, end_date timestamp with time zone)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  revenue_total numeric;
  order_count int;
  avg_order_value numeric;
  revenue_by_day json;
  orders_by_status json;
  top_products json;
  result json;
BEGIN
  -- 1. Revenue metrics
  SELECT 
    coalesce(sum(total), 0),
    count(*),
    coalesce(avg(total), 0)
  INTO 
    revenue_total,
    order_count,
    avg_order_value
  FROM orders
  WHERE created_at >= start_date AND created_at <= end_date;

  -- 2. Revenue by day
  WITH daily_stats AS (
    SELECT 
      date_trunc('day', (created_at AT TIME ZONE 'UTC'))::date as date,
      sum(total) as revenue,
      count(*) as orders
    FROM orders
    WHERE created_at >= start_date AND created_at <= end_date
    GROUP BY 1
    ORDER BY 1
  )
  SELECT json_agg(t) INTO revenue_by_day
  FROM daily_stats t;

  -- 3. Orders by status
  WITH status_counts AS (
    SELECT 
      status,
      count(*) as count
    FROM orders
    WHERE created_at >= start_date AND created_at <= end_date
    GROUP BY 1
    ORDER BY 2 DESC
  )
  SELECT json_agg(t) INTO orders_by_status
  FROM status_counts t;

  -- 4. Top products
  WITH product_sales AS (
    SELECT 
      oi.item_name as name,
      sum(oi.quantity) as quantity,
      sum(oi.total_price) as revenue
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.created_at >= start_date AND o.created_at <= end_date
    GROUP BY 1
    ORDER BY 3 DESC
    LIMIT 10
  )
  SELECT json_agg(t) INTO top_products
  FROM product_sales t;

  -- Combine into result
  result := json_build_object(
    'revenue', json_build_object(
      'total', revenue_total,
      'orderCount', order_count,
      'averageOrderValue', avg_order_value
    ),
    'revenueByDay', coalesce(revenue_by_day, '[]'::json),
    'ordersByStatus', coalesce(orders_by_status, '[]'::json),
    'topProducts', coalesce(top_products, '[]'::json)
  );

  RETURN result;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.insert_scraper_test_run(p_scraper_id uuid, p_test_type text, p_skus_tested text[])
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO scraper_test_runs (scraper_id, test_type, skus_tested, status, started_at)
  VALUES (p_scraper_id, p_test_type, p_skus_tested, 'pending', NOW())
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_source_enabled(p_sku text, p_source_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT 
    CASE 
      -- If enrichment_config is empty or enabled_sources not set, return true (default: all sources enabled)
      WHEN (
        SELECT enrichment_config->'enabled_sources' 
        FROM products_ingestion 
        WHERE sku = p_sku
      ) IS NULL THEN true
      -- Otherwise check if source is in the array
      ELSE (
        SELECT enrichment_config->'enabled_sources' ? p_source_id
        FROM products_ingestion 
        WHERE sku = p_sku
      )
    END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_variant_price_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF OLD.price IS DISTINCT FROM NEW.price THEN
    INSERT INTO price_history (product_id, variant_id, price, compare_at_price, recorded_at)
    VALUES (NEW.product_id, NEW.id, NEW.price, NEW.compare_at_price, now());
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_inventory_to_products()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Upsert into products table
    -- We store price and name in 'input' JSONB
    INSERT INTO products (sku, input, pipeline_status)
    VALUES (
        NEW.sku, 
        jsonb_strip_nulls(jsonb_build_object(
            'price', NEW.price,
            'name', NEW.name
        )),
        'staging'
    )
    ON CONFLICT (sku) DO UPDATE
    SET 
        input = products.input || jsonb_strip_nulls(jsonb_build_object(
            'price', NEW.price,
            'name', NEW.name
        )),
        updated_at = NOW();
    
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_b2b_feeds_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_health_metrics()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    INSERT INTO public.scraper_health_metrics (
        config_id,
        metric_date,
        total_runs,
        passed_runs,
        failed_runs,
        avg_duration_ms,
        selector_health,
        updated_at
    )
    SELECT 
        sc.id AS config_id,
        DATE(str.created_at) AS metric_date,
        COUNT(*) AS total_runs,
        COUNT(*) FILTER (WHERE str.status = 'passed') AS passed_runs,
        COUNT(*) FILTER (WHERE str.status = 'failed') AS failed_runs,
        AVG(str.duration_ms)::INTEGER AS avg_duration_ms,
        '{}'::JSONB AS selector_health,
        NOW() AS updated_at
    FROM public.scraper_test_runs str
    JOIN public.scraper_configs sc ON str.scraper_id = sc.id
    WHERE str.created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY sc.id, DATE(str.created_at)
    ON CONFLICT (config_id, metric_date) 
    DO UPDATE SET
        total_runs = EXCLUDED.total_runs,
        passed_runs = EXCLUDED.passed_runs,
        failed_runs = EXCLUDED.failed_runs,
        avg_duration_ms = EXCLUDED.avg_duration_ms,
        selector_health = EXCLUDED.selector_health,
        updated_at = NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_inventory_items_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_product_scraped_sites_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_review_helpful_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE product_reviews 
    SET helpful_count = (
      SELECT COUNT(*) FILTER (WHERE is_helpful = true) - COUNT(*) FILTER (WHERE is_helpful = false)
      FROM review_helpful_votes 
      WHERE review_id = NEW.review_id
    )
    WHERE id = NEW.review_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE product_reviews 
    SET helpful_count = (
      SELECT COALESCE(COUNT(*) FILTER (WHERE is_helpful = true) - COUNT(*) FILTER (WHERE is_helpful = false), 0)
      FROM review_helpful_votes 
      WHERE review_id = OLD.review_id
    )
    WHERE id = OLD.review_id;
    RETURN OLD;
  END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_scraper_test_run(p_id uuid, p_status text, p_results jsonb DEFAULT '[]'::jsonb, p_error_message text DEFAULT NULL::text, p_duration_ms integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE scraper_test_runs
  SET 
    status = p_status,
    results = p_results,
    error_message = p_error_message,
    duration_ms = p_duration_ms,
    completed_at = NOW()
  WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_service_costs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_recently_viewed(p_user_id uuid, p_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO recently_viewed (user_id, product_id, viewed_at)
  VALUES (p_user_id, p_product_id, now())
  ON CONFLICT (user_id, product_id) 
  DO UPDATE SET viewed_at = now();
END;
$function$
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


CREATE OR REPLACE FUNCTION public.calculate_scraper_health(p_scraper_id uuid)
 RETURNS TABLE(health_status text, health_score integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    latest_run record;
    test_passed int := 0;
    test_total int := 0;
    fake_passed int := 0;
    fake_total int := 0;
    score int := 0;
    status text := 'unknown';
BEGIN
    SELECT * INTO latest_run
    FROM scraper_test_runs
    WHERE scraper_id = p_scraper_id
      AND status IN ('passed', 'failed', 'partial')
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF latest_run IS NULL THEN
        RETURN QUERY SELECT 'unknown'::text, 0;
        RETURN;
    END IF;
    
    SELECT 
        COUNT(*) FILTER (WHERE (r->>'sku_type') = 'test' AND (r->>'status') = 'success'),
        COUNT(*) FILTER (WHERE (r->>'sku_type') = 'test'),
        COUNT(*) FILTER (WHERE (r->>'sku_type') = 'fake' AND (r->>'status') = 'no_results'),
        COUNT(*) FILTER (WHERE (r->>'sku_type') = 'fake')
    INTO test_passed, test_total, fake_passed, fake_total
    FROM jsonb_array_elements(latest_run.results) r;
    
    IF test_total > 0 THEN
        score := score + ((test_passed::float / test_total::float) * 70)::int;
    END IF;
    
    IF fake_total > 0 THEN
        score := score + ((fake_passed::float / fake_total::float) * 30)::int;
    ELSE
        score := score + 30;
    END IF;
    
    IF score >= 90 THEN
        status := 'healthy';
    ELSIF score >= 60 THEN
        status := 'degraded';
    ELSE
        status := 'broken';
    END IF;
    
    RETURN QUERY SELECT status, score;
END;
$function$
;

create or replace view "public"."dashboard_migration_progress" as  SELECT (date_trunc('month'::text, created_at))::date AS month,
    source_type,
    count(*) AS order_count
   FROM public.orders
  WHERE (created_at > (now() - '1 year'::interval))
  GROUP BY (date_trunc('month'::text, created_at)), source_type
  ORDER BY ((date_trunc('month'::text, created_at))::date) DESC, source_type;


create or replace view "public"."dashboard_order_stats" as  SELECT count(*) FILTER (WHERE ((created_at)::date = CURRENT_DATE)) AS today_order_count,
    COALESCE(sum(total) FILTER (WHERE ((created_at)::date = CURRENT_DATE)), (0)::numeric) AS today_sales,
    count(*) FILTER (WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]))) AS open_orders,
    count(*) FILTER (WHERE (payment_status = ANY (ARRAY['unpaid'::public.order_payment_status, 'authorized'::public.order_payment_status]))) AS unpaid_orders,
    count(*) FILTER (WHERE (fulfillment_status = 'ready_for_pickup'::public.order_fulfillment_status)) AS ready_for_pickup,
    count(*) FILTER (WHERE ((source_type = 'integra'::public.order_source_type) AND ((created_at)::date = CURRENT_DATE))) AS today_register_orders,
    count(*) FILTER (WHERE ((source_type = 'web'::public.order_source_type) AND ((created_at)::date = CURRENT_DATE))) AS today_web_orders
   FROM public.orders;


create or replace view "public"."dashboard_product_stats" as  SELECT count(*) AS total_count,
    count(*) FILTER (WHERE (published_at IS NOT NULL)) AS published_count,
    count(*) FILTER (WHERE (stock_status = 'out_of_stock'::text)) AS out_of_stock_count,
    count(*) FILTER (WHERE (quantity <= low_stock_threshold)) AS low_stock_count,
    max(updated_at) AS last_updated
   FROM public.products;


create or replace view "public"."dashboard_scraper_stats" as  SELECT count(*) AS total_jobs,
    count(*) FILTER (WHERE (status = 'completed'::text)) AS completed_jobs,
    count(*) FILTER (WHERE (status = 'failed'::text)) AS failed_jobs,
    count(*) FILTER (WHERE (status = 'running'::text)) AS active_jobs,
    max(created_at) AS last_job_created
   FROM public.scrape_jobs
  WHERE (created_at > (now() - '24:00:00'::interval));


create or replace view "public"."pipeline_export_queue" as  SELECT sku,
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
  WHERE ((pipeline_status = 'exporting'::public.pipeline_status_five) AND (exported_at IS NULL));


create or replace view "public"."pipeline_finalizing_queue" as  SELECT sku,
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
  WHERE ((pipeline_status = 'finalizing'::public.pipeline_status_five) AND (exported_at IS NULL));


create or replace view "public"."products_published" as  SELECT pi.sku AS id,
    COALESCE((pi.consolidated ->> 'name'::text), (pi.input ->> 'name'::text)) AS name,
    lower(regexp_replace(COALESCE((pi.consolidated ->> 'name'::text), (pi.input ->> 'name'::text), pi.sku), '[^a-zA-Z0-9]+'::text, '-'::text, 'g'::text)) AS slug,
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
  WHERE ((pi.pipeline_status = 'exporting'::public.pipeline_status_five) AND (pi.exported_at IS NOT NULL));


CREATE OR REPLACE FUNCTION public.record_product_price_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF OLD.price IS DISTINCT FROM NEW.price THEN
    INSERT INTO public.price_history (product_id, price, compare_at_price, recorded_at)
    VALUES (NEW.id, NEW.price, NULL, now());
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_batch_jobs_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_runner_api_key(api_key text)
 RETURNS TABLE(runner_name text, key_id uuid, is_valid boolean, allowed_scrapers text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    key_hash_value text;
    result record;
BEGIN
    -- Hash the provided key
    key_hash_value := encode(sha256(api_key::bytea), 'hex');
    
    -- Look up the key
    SELECT 
        rak.runner_name,
        rak.id as key_id,
        true as is_valid,
        COALESCE(rak.allowed_scrapers, ARRAY[]::text[]) as allowed_scrapers
    INTO result
    FROM runner_api_keys rak
    WHERE rak.key_hash = key_hash_value
      AND rak.revoked_at IS NULL
      AND (rak.expires_at IS NULL OR rak.expires_at > now());
    
    IF result IS NULL THEN
        RETURN QUERY SELECT null::text, null::uuid, false, ARRAY[]::text[];
        RETURN;
    END IF;
    
    -- Update last_used_at
    UPDATE runner_api_keys 
    SET last_used_at = now() 
    WHERE id = result.key_id;
    
    RETURN QUERY SELECT result.runner_name, result.key_id, result.is_valid, result.allowed_scrapers;
END;
$function$
;

create or replace view "public"."pipeline_finalized_review" as  SELECT sku,
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


grant delete on table "public"."app_settings" to "anon";

grant insert on table "public"."app_settings" to "anon";

grant references on table "public"."app_settings" to "anon";

grant select on table "public"."app_settings" to "anon";

grant trigger on table "public"."app_settings" to "anon";

grant truncate on table "public"."app_settings" to "anon";

grant update on table "public"."app_settings" to "anon";

grant delete on table "public"."app_settings" to "authenticated";

grant insert on table "public"."app_settings" to "authenticated";

grant references on table "public"."app_settings" to "authenticated";

grant select on table "public"."app_settings" to "authenticated";

grant trigger on table "public"."app_settings" to "authenticated";

grant truncate on table "public"."app_settings" to "authenticated";

grant update on table "public"."app_settings" to "authenticated";

grant delete on table "public"."app_settings" to "service_role";

grant insert on table "public"."app_settings" to "service_role";

grant references on table "public"."app_settings" to "service_role";

grant select on table "public"."app_settings" to "service_role";

grant trigger on table "public"."app_settings" to "service_role";

grant truncate on table "public"."app_settings" to "service_role";

grant update on table "public"."app_settings" to "service_role";

grant delete on table "public"."b2b_feeds" to "anon";

grant insert on table "public"."b2b_feeds" to "anon";

grant references on table "public"."b2b_feeds" to "anon";

grant select on table "public"."b2b_feeds" to "anon";

grant trigger on table "public"."b2b_feeds" to "anon";

grant truncate on table "public"."b2b_feeds" to "anon";

grant update on table "public"."b2b_feeds" to "anon";

grant delete on table "public"."b2b_feeds" to "authenticated";

grant insert on table "public"."b2b_feeds" to "authenticated";

grant references on table "public"."b2b_feeds" to "authenticated";

grant select on table "public"."b2b_feeds" to "authenticated";

grant trigger on table "public"."b2b_feeds" to "authenticated";

grant truncate on table "public"."b2b_feeds" to "authenticated";

grant update on table "public"."b2b_feeds" to "authenticated";

grant delete on table "public"."b2b_feeds" to "service_role";

grant insert on table "public"."b2b_feeds" to "service_role";

grant references on table "public"."b2b_feeds" to "service_role";

grant select on table "public"."b2b_feeds" to "service_role";

grant trigger on table "public"."b2b_feeds" to "service_role";

grant truncate on table "public"."b2b_feeds" to "service_role";

grant update on table "public"."b2b_feeds" to "service_role";

grant delete on table "public"."b2b_sync_jobs" to "anon";

grant insert on table "public"."b2b_sync_jobs" to "anon";

grant references on table "public"."b2b_sync_jobs" to "anon";

grant select on table "public"."b2b_sync_jobs" to "anon";

grant trigger on table "public"."b2b_sync_jobs" to "anon";

grant truncate on table "public"."b2b_sync_jobs" to "anon";

grant update on table "public"."b2b_sync_jobs" to "anon";

grant delete on table "public"."b2b_sync_jobs" to "authenticated";

grant insert on table "public"."b2b_sync_jobs" to "authenticated";

grant references on table "public"."b2b_sync_jobs" to "authenticated";

grant select on table "public"."b2b_sync_jobs" to "authenticated";

grant trigger on table "public"."b2b_sync_jobs" to "authenticated";

grant truncate on table "public"."b2b_sync_jobs" to "authenticated";

grant update on table "public"."b2b_sync_jobs" to "authenticated";

grant delete on table "public"."b2b_sync_jobs" to "service_role";

grant insert on table "public"."b2b_sync_jobs" to "service_role";

grant references on table "public"."b2b_sync_jobs" to "service_role";

grant select on table "public"."b2b_sync_jobs" to "service_role";

grant trigger on table "public"."b2b_sync_jobs" to "service_role";

grant truncate on table "public"."b2b_sync_jobs" to "service_role";

grant update on table "public"."b2b_sync_jobs" to "service_role";

grant delete on table "public"."consolidation_review_requests" to "anon";

grant insert on table "public"."consolidation_review_requests" to "anon";

grant references on table "public"."consolidation_review_requests" to "anon";

grant select on table "public"."consolidation_review_requests" to "anon";

grant trigger on table "public"."consolidation_review_requests" to "anon";

grant truncate on table "public"."consolidation_review_requests" to "anon";

grant update on table "public"."consolidation_review_requests" to "anon";

grant delete on table "public"."consolidation_review_requests" to "authenticated";

grant insert on table "public"."consolidation_review_requests" to "authenticated";

grant references on table "public"."consolidation_review_requests" to "authenticated";

grant select on table "public"."consolidation_review_requests" to "authenticated";

grant trigger on table "public"."consolidation_review_requests" to "authenticated";

grant truncate on table "public"."consolidation_review_requests" to "authenticated";

grant update on table "public"."consolidation_review_requests" to "authenticated";

grant delete on table "public"."consolidation_review_requests" to "service_role";

grant insert on table "public"."consolidation_review_requests" to "service_role";

grant references on table "public"."consolidation_review_requests" to "service_role";

grant select on table "public"."consolidation_review_requests" to "service_role";

grant trigger on table "public"."consolidation_review_requests" to "service_role";

grant truncate on table "public"."consolidation_review_requests" to "service_role";

grant update on table "public"."consolidation_review_requests" to "service_role";

grant delete on table "public"."inventory_items" to "anon";

grant insert on table "public"."inventory_items" to "anon";

grant references on table "public"."inventory_items" to "anon";

grant select on table "public"."inventory_items" to "anon";

grant trigger on table "public"."inventory_items" to "anon";

grant truncate on table "public"."inventory_items" to "anon";

grant update on table "public"."inventory_items" to "anon";

grant delete on table "public"."inventory_items" to "authenticated";

grant insert on table "public"."inventory_items" to "authenticated";

grant references on table "public"."inventory_items" to "authenticated";

grant select on table "public"."inventory_items" to "authenticated";

grant trigger on table "public"."inventory_items" to "authenticated";

grant truncate on table "public"."inventory_items" to "authenticated";

grant update on table "public"."inventory_items" to "authenticated";

grant delete on table "public"."inventory_items" to "service_role";

grant insert on table "public"."inventory_items" to "service_role";

grant references on table "public"."inventory_items" to "service_role";

grant select on table "public"."inventory_items" to "service_role";

grant trigger on table "public"."inventory_items" to "service_role";

grant truncate on table "public"."inventory_items" to "service_role";

grant update on table "public"."inventory_items" to "service_role";

grant delete on table "public"."legacy_redirects" to "anon";

grant insert on table "public"."legacy_redirects" to "anon";

grant references on table "public"."legacy_redirects" to "anon";

grant select on table "public"."legacy_redirects" to "anon";

grant trigger on table "public"."legacy_redirects" to "anon";

grant truncate on table "public"."legacy_redirects" to "anon";

grant update on table "public"."legacy_redirects" to "anon";

grant delete on table "public"."legacy_redirects" to "authenticated";

grant insert on table "public"."legacy_redirects" to "authenticated";

grant references on table "public"."legacy_redirects" to "authenticated";

grant select on table "public"."legacy_redirects" to "authenticated";

grant trigger on table "public"."legacy_redirects" to "authenticated";

grant truncate on table "public"."legacy_redirects" to "authenticated";

grant update on table "public"."legacy_redirects" to "authenticated";

grant delete on table "public"."legacy_redirects" to "service_role";

grant insert on table "public"."legacy_redirects" to "service_role";

grant references on table "public"."legacy_redirects" to "service_role";

grant select on table "public"."legacy_redirects" to "service_role";

grant trigger on table "public"."legacy_redirects" to "service_role";

grant truncate on table "public"."legacy_redirects" to "service_role";

grant update on table "public"."legacy_redirects" to "service_role";

grant delete on table "public"."orders_ingestion" to "anon";

grant insert on table "public"."orders_ingestion" to "anon";

grant references on table "public"."orders_ingestion" to "anon";

grant select on table "public"."orders_ingestion" to "anon";

grant trigger on table "public"."orders_ingestion" to "anon";

grant truncate on table "public"."orders_ingestion" to "anon";

grant update on table "public"."orders_ingestion" to "anon";

grant delete on table "public"."orders_ingestion" to "authenticated";

grant insert on table "public"."orders_ingestion" to "authenticated";

grant references on table "public"."orders_ingestion" to "authenticated";

grant select on table "public"."orders_ingestion" to "authenticated";

grant trigger on table "public"."orders_ingestion" to "authenticated";

grant truncate on table "public"."orders_ingestion" to "authenticated";

grant update on table "public"."orders_ingestion" to "authenticated";

grant delete on table "public"."orders_ingestion" to "service_role";

grant insert on table "public"."orders_ingestion" to "service_role";

grant references on table "public"."orders_ingestion" to "service_role";

grant select on table "public"."orders_ingestion" to "service_role";

grant trigger on table "public"."orders_ingestion" to "service_role";

grant truncate on table "public"."orders_ingestion" to "service_role";

grant update on table "public"."orders_ingestion" to "service_role";

grant delete on table "public"."pages" to "anon";

grant insert on table "public"."pages" to "anon";

grant references on table "public"."pages" to "anon";

grant select on table "public"."pages" to "anon";

grant trigger on table "public"."pages" to "anon";

grant truncate on table "public"."pages" to "anon";

grant update on table "public"."pages" to "anon";

grant delete on table "public"."pages" to "authenticated";

grant insert on table "public"."pages" to "authenticated";

grant references on table "public"."pages" to "authenticated";

grant select on table "public"."pages" to "authenticated";

grant trigger on table "public"."pages" to "authenticated";

grant truncate on table "public"."pages" to "authenticated";

grant update on table "public"."pages" to "authenticated";

grant delete on table "public"."pages" to "service_role";

grant insert on table "public"."pages" to "service_role";

grant references on table "public"."pages" to "service_role";

grant select on table "public"."pages" to "service_role";

grant trigger on table "public"."pages" to "service_role";

grant truncate on table "public"."pages" to "service_role";

grant update on table "public"."pages" to "service_role";

grant delete on table "public"."price_history" to "anon";

grant insert on table "public"."price_history" to "anon";

grant references on table "public"."price_history" to "anon";

grant select on table "public"."price_history" to "anon";

grant trigger on table "public"."price_history" to "anon";

grant truncate on table "public"."price_history" to "anon";

grant update on table "public"."price_history" to "anon";

grant delete on table "public"."price_history" to "authenticated";

grant insert on table "public"."price_history" to "authenticated";

grant references on table "public"."price_history" to "authenticated";

grant select on table "public"."price_history" to "authenticated";

grant trigger on table "public"."price_history" to "authenticated";

grant truncate on table "public"."price_history" to "authenticated";

grant update on table "public"."price_history" to "authenticated";

grant delete on table "public"."price_history" to "service_role";

grant insert on table "public"."price_history" to "service_role";

grant references on table "public"."price_history" to "service_role";

grant select on table "public"."price_history" to "service_role";

grant trigger on table "public"."price_history" to "service_role";

grant truncate on table "public"."price_history" to "service_role";

grant update on table "public"."price_history" to "service_role";

grant delete on table "public"."product_answers" to "anon";

grant insert on table "public"."product_answers" to "anon";

grant references on table "public"."product_answers" to "anon";

grant select on table "public"."product_answers" to "anon";

grant trigger on table "public"."product_answers" to "anon";

grant truncate on table "public"."product_answers" to "anon";

grant update on table "public"."product_answers" to "anon";

grant delete on table "public"."product_answers" to "authenticated";

grant insert on table "public"."product_answers" to "authenticated";

grant references on table "public"."product_answers" to "authenticated";

grant select on table "public"."product_answers" to "authenticated";

grant trigger on table "public"."product_answers" to "authenticated";

grant truncate on table "public"."product_answers" to "authenticated";

grant update on table "public"."product_answers" to "authenticated";

grant delete on table "public"."product_answers" to "service_role";

grant insert on table "public"."product_answers" to "service_role";

grant references on table "public"."product_answers" to "service_role";

grant select on table "public"."product_answers" to "service_role";

grant trigger on table "public"."product_answers" to "service_role";

grant truncate on table "public"."product_answers" to "service_role";

grant update on table "public"."product_answers" to "service_role";

grant delete on table "public"."product_attributes" to "anon";

grant insert on table "public"."product_attributes" to "anon";

grant references on table "public"."product_attributes" to "anon";

grant select on table "public"."product_attributes" to "anon";

grant trigger on table "public"."product_attributes" to "anon";

grant truncate on table "public"."product_attributes" to "anon";

grant update on table "public"."product_attributes" to "anon";

grant delete on table "public"."product_attributes" to "authenticated";

grant insert on table "public"."product_attributes" to "authenticated";

grant references on table "public"."product_attributes" to "authenticated";

grant select on table "public"."product_attributes" to "authenticated";

grant trigger on table "public"."product_attributes" to "authenticated";

grant truncate on table "public"."product_attributes" to "authenticated";

grant update on table "public"."product_attributes" to "authenticated";

grant delete on table "public"."product_attributes" to "service_role";

grant insert on table "public"."product_attributes" to "service_role";

grant references on table "public"."product_attributes" to "service_role";

grant select on table "public"."product_attributes" to "service_role";

grant trigger on table "public"."product_attributes" to "service_role";

grant truncate on table "public"."product_attributes" to "service_role";

grant update on table "public"."product_attributes" to "service_role";

grant delete on table "public"."product_images" to "anon";

grant insert on table "public"."product_images" to "anon";

grant references on table "public"."product_images" to "anon";

grant select on table "public"."product_images" to "anon";

grant trigger on table "public"."product_images" to "anon";

grant truncate on table "public"."product_images" to "anon";

grant update on table "public"."product_images" to "anon";

grant delete on table "public"."product_images" to "authenticated";

grant insert on table "public"."product_images" to "authenticated";

grant references on table "public"."product_images" to "authenticated";

grant select on table "public"."product_images" to "authenticated";

grant trigger on table "public"."product_images" to "authenticated";

grant truncate on table "public"."product_images" to "authenticated";

grant update on table "public"."product_images" to "authenticated";

grant delete on table "public"."product_images" to "service_role";

grant insert on table "public"."product_images" to "service_role";

grant references on table "public"."product_images" to "service_role";

grant select on table "public"."product_images" to "service_role";

grant trigger on table "public"."product_images" to "service_role";

grant truncate on table "public"."product_images" to "service_role";

grant update on table "public"."product_images" to "service_role";

grant delete on table "public"."product_option_values" to "anon";

grant insert on table "public"."product_option_values" to "anon";

grant references on table "public"."product_option_values" to "anon";

grant select on table "public"."product_option_values" to "anon";

grant trigger on table "public"."product_option_values" to "anon";

grant truncate on table "public"."product_option_values" to "anon";

grant update on table "public"."product_option_values" to "anon";

grant delete on table "public"."product_option_values" to "authenticated";

grant insert on table "public"."product_option_values" to "authenticated";

grant references on table "public"."product_option_values" to "authenticated";

grant select on table "public"."product_option_values" to "authenticated";

grant trigger on table "public"."product_option_values" to "authenticated";

grant truncate on table "public"."product_option_values" to "authenticated";

grant update on table "public"."product_option_values" to "authenticated";

grant delete on table "public"."product_option_values" to "service_role";

grant insert on table "public"."product_option_values" to "service_role";

grant references on table "public"."product_option_values" to "service_role";

grant select on table "public"."product_option_values" to "service_role";

grant trigger on table "public"."product_option_values" to "service_role";

grant truncate on table "public"."product_option_values" to "service_role";

grant update on table "public"."product_option_values" to "service_role";

grant delete on table "public"."product_options" to "anon";

grant insert on table "public"."product_options" to "anon";

grant references on table "public"."product_options" to "anon";

grant select on table "public"."product_options" to "anon";

grant trigger on table "public"."product_options" to "anon";

grant truncate on table "public"."product_options" to "anon";

grant update on table "public"."product_options" to "anon";

grant delete on table "public"."product_options" to "authenticated";

grant insert on table "public"."product_options" to "authenticated";

grant references on table "public"."product_options" to "authenticated";

grant select on table "public"."product_options" to "authenticated";

grant trigger on table "public"."product_options" to "authenticated";

grant truncate on table "public"."product_options" to "authenticated";

grant update on table "public"."product_options" to "authenticated";

grant delete on table "public"."product_options" to "service_role";

grant insert on table "public"."product_options" to "service_role";

grant references on table "public"."product_options" to "service_role";

grant select on table "public"."product_options" to "service_role";

grant trigger on table "public"."product_options" to "service_role";

grant truncate on table "public"."product_options" to "service_role";

grant update on table "public"."product_options" to "service_role";

grant delete on table "public"."product_questions" to "anon";

grant insert on table "public"."product_questions" to "anon";

grant references on table "public"."product_questions" to "anon";

grant select on table "public"."product_questions" to "anon";

grant trigger on table "public"."product_questions" to "anon";

grant truncate on table "public"."product_questions" to "anon";

grant update on table "public"."product_questions" to "anon";

grant delete on table "public"."product_questions" to "authenticated";

grant insert on table "public"."product_questions" to "authenticated";

grant references on table "public"."product_questions" to "authenticated";

grant select on table "public"."product_questions" to "authenticated";

grant trigger on table "public"."product_questions" to "authenticated";

grant truncate on table "public"."product_questions" to "authenticated";

grant update on table "public"."product_questions" to "authenticated";

grant delete on table "public"."product_questions" to "service_role";

grant insert on table "public"."product_questions" to "service_role";

grant references on table "public"."product_questions" to "service_role";

grant select on table "public"."product_questions" to "service_role";

grant trigger on table "public"."product_questions" to "service_role";

grant truncate on table "public"."product_questions" to "service_role";

grant update on table "public"."product_questions" to "service_role";

grant delete on table "public"."product_reviews" to "anon";

grant insert on table "public"."product_reviews" to "anon";

grant references on table "public"."product_reviews" to "anon";

grant select on table "public"."product_reviews" to "anon";

grant trigger on table "public"."product_reviews" to "anon";

grant truncate on table "public"."product_reviews" to "anon";

grant update on table "public"."product_reviews" to "anon";

grant delete on table "public"."product_reviews" to "authenticated";

grant insert on table "public"."product_reviews" to "authenticated";

grant references on table "public"."product_reviews" to "authenticated";

grant select on table "public"."product_reviews" to "authenticated";

grant trigger on table "public"."product_reviews" to "authenticated";

grant truncate on table "public"."product_reviews" to "authenticated";

grant update on table "public"."product_reviews" to "authenticated";

grant delete on table "public"."product_reviews" to "service_role";

grant insert on table "public"."product_reviews" to "service_role";

grant references on table "public"."product_reviews" to "service_role";

grant select on table "public"."product_reviews" to "service_role";

grant trigger on table "public"."product_reviews" to "service_role";

grant truncate on table "public"."product_reviews" to "service_role";

grant update on table "public"."product_reviews" to "service_role";

grant delete on table "public"."product_scraped_sites" to "anon";

grant insert on table "public"."product_scraped_sites" to "anon";

grant references on table "public"."product_scraped_sites" to "anon";

grant select on table "public"."product_scraped_sites" to "anon";

grant trigger on table "public"."product_scraped_sites" to "anon";

grant truncate on table "public"."product_scraped_sites" to "anon";

grant update on table "public"."product_scraped_sites" to "anon";

grant delete on table "public"."product_scraped_sites" to "authenticated";

grant insert on table "public"."product_scraped_sites" to "authenticated";

grant references on table "public"."product_scraped_sites" to "authenticated";

grant select on table "public"."product_scraped_sites" to "authenticated";

grant trigger on table "public"."product_scraped_sites" to "authenticated";

grant truncate on table "public"."product_scraped_sites" to "authenticated";

grant update on table "public"."product_scraped_sites" to "authenticated";

grant delete on table "public"."product_scraped_sites" to "service_role";

grant insert on table "public"."product_scraped_sites" to "service_role";

grant references on table "public"."product_scraped_sites" to "service_role";

grant select on table "public"."product_scraped_sites" to "service_role";

grant trigger on table "public"."product_scraped_sites" to "service_role";

grant truncate on table "public"."product_scraped_sites" to "service_role";

grant update on table "public"."product_scraped_sites" to "service_role";

grant delete on table "public"."product_tags" to "anon";

grant insert on table "public"."product_tags" to "anon";

grant references on table "public"."product_tags" to "anon";

grant select on table "public"."product_tags" to "anon";

grant trigger on table "public"."product_tags" to "anon";

grant truncate on table "public"."product_tags" to "anon";

grant update on table "public"."product_tags" to "anon";

grant delete on table "public"."product_tags" to "authenticated";

grant insert on table "public"."product_tags" to "authenticated";

grant references on table "public"."product_tags" to "authenticated";

grant select on table "public"."product_tags" to "authenticated";

grant trigger on table "public"."product_tags" to "authenticated";

grant truncate on table "public"."product_tags" to "authenticated";

grant update on table "public"."product_tags" to "authenticated";

grant delete on table "public"."product_tags" to "service_role";

grant insert on table "public"."product_tags" to "service_role";

grant references on table "public"."product_tags" to "service_role";

grant select on table "public"."product_tags" to "service_role";

grant trigger on table "public"."product_tags" to "service_role";

grant truncate on table "public"."product_tags" to "service_role";

grant update on table "public"."product_tags" to "service_role";

grant delete on table "public"."product_types" to "anon";

grant insert on table "public"."product_types" to "anon";

grant references on table "public"."product_types" to "anon";

grant select on table "public"."product_types" to "anon";

grant trigger on table "public"."product_types" to "anon";

grant truncate on table "public"."product_types" to "anon";

grant update on table "public"."product_types" to "anon";

grant delete on table "public"."product_types" to "authenticated";

grant insert on table "public"."product_types" to "authenticated";

grant references on table "public"."product_types" to "authenticated";

grant select on table "public"."product_types" to "authenticated";

grant trigger on table "public"."product_types" to "authenticated";

grant truncate on table "public"."product_types" to "authenticated";

grant update on table "public"."product_types" to "authenticated";

grant delete on table "public"."product_types" to "service_role";

grant insert on table "public"."product_types" to "service_role";

grant references on table "public"."product_types" to "service_role";

grant select on table "public"."product_types" to "service_role";

grant trigger on table "public"."product_types" to "service_role";

grant truncate on table "public"."product_types" to "service_role";

grant update on table "public"."product_types" to "service_role";

grant delete on table "public"."product_variants" to "anon";

grant insert on table "public"."product_variants" to "anon";

grant references on table "public"."product_variants" to "anon";

grant select on table "public"."product_variants" to "anon";

grant trigger on table "public"."product_variants" to "anon";

grant truncate on table "public"."product_variants" to "anon";

grant update on table "public"."product_variants" to "anon";

grant delete on table "public"."product_variants" to "authenticated";

grant insert on table "public"."product_variants" to "authenticated";

grant references on table "public"."product_variants" to "authenticated";

grant select on table "public"."product_variants" to "authenticated";

grant trigger on table "public"."product_variants" to "authenticated";

grant truncate on table "public"."product_variants" to "authenticated";

grant update on table "public"."product_variants" to "authenticated";

grant delete on table "public"."product_variants" to "service_role";

grant insert on table "public"."product_variants" to "service_role";

grant references on table "public"."product_variants" to "service_role";

grant select on table "public"."product_variants" to "service_role";

grant trigger on table "public"."product_variants" to "service_role";

grant truncate on table "public"."product_variants" to "service_role";

grant update on table "public"."product_variants" to "service_role";

grant delete on table "public"."recently_viewed" to "anon";

grant insert on table "public"."recently_viewed" to "anon";

grant references on table "public"."recently_viewed" to "anon";

grant select on table "public"."recently_viewed" to "anon";

grant trigger on table "public"."recently_viewed" to "anon";

grant truncate on table "public"."recently_viewed" to "anon";

grant update on table "public"."recently_viewed" to "anon";

grant delete on table "public"."recently_viewed" to "authenticated";

grant insert on table "public"."recently_viewed" to "authenticated";

grant references on table "public"."recently_viewed" to "authenticated";

grant select on table "public"."recently_viewed" to "authenticated";

grant trigger on table "public"."recently_viewed" to "authenticated";

grant truncate on table "public"."recently_viewed" to "authenticated";

grant update on table "public"."recently_viewed" to "authenticated";

grant delete on table "public"."recently_viewed" to "service_role";

grant insert on table "public"."recently_viewed" to "service_role";

grant references on table "public"."recently_viewed" to "service_role";

grant select on table "public"."recently_viewed" to "service_role";

grant trigger on table "public"."recently_viewed" to "service_role";

grant truncate on table "public"."recently_viewed" to "service_role";

grant update on table "public"."recently_viewed" to "service_role";

grant delete on table "public"."related_products" to "anon";

grant insert on table "public"."related_products" to "anon";

grant references on table "public"."related_products" to "anon";

grant select on table "public"."related_products" to "anon";

grant trigger on table "public"."related_products" to "anon";

grant truncate on table "public"."related_products" to "anon";

grant update on table "public"."related_products" to "anon";

grant delete on table "public"."related_products" to "authenticated";

grant insert on table "public"."related_products" to "authenticated";

grant references on table "public"."related_products" to "authenticated";

grant select on table "public"."related_products" to "authenticated";

grant trigger on table "public"."related_products" to "authenticated";

grant truncate on table "public"."related_products" to "authenticated";

grant update on table "public"."related_products" to "authenticated";

grant delete on table "public"."related_products" to "service_role";

grant insert on table "public"."related_products" to "service_role";

grant references on table "public"."related_products" to "service_role";

grant select on table "public"."related_products" to "service_role";

grant trigger on table "public"."related_products" to "service_role";

grant truncate on table "public"."related_products" to "service_role";

grant update on table "public"."related_products" to "service_role";

grant delete on table "public"."review_helpful_votes" to "anon";

grant insert on table "public"."review_helpful_votes" to "anon";

grant references on table "public"."review_helpful_votes" to "anon";

grant select on table "public"."review_helpful_votes" to "anon";

grant trigger on table "public"."review_helpful_votes" to "anon";

grant truncate on table "public"."review_helpful_votes" to "anon";

grant update on table "public"."review_helpful_votes" to "anon";

grant delete on table "public"."review_helpful_votes" to "authenticated";

grant insert on table "public"."review_helpful_votes" to "authenticated";

grant references on table "public"."review_helpful_votes" to "authenticated";

grant select on table "public"."review_helpful_votes" to "authenticated";

grant trigger on table "public"."review_helpful_votes" to "authenticated";

grant truncate on table "public"."review_helpful_votes" to "authenticated";

grant update on table "public"."review_helpful_votes" to "authenticated";

grant delete on table "public"."review_helpful_votes" to "service_role";

grant insert on table "public"."review_helpful_votes" to "service_role";

grant references on table "public"."review_helpful_votes" to "service_role";

grant select on table "public"."review_helpful_votes" to "service_role";

grant trigger on table "public"."review_helpful_votes" to "service_role";

grant truncate on table "public"."review_helpful_votes" to "service_role";

grant update on table "public"."review_helpful_votes" to "service_role";

grant delete on table "public"."scraper_config_test_skus" to "anon";

grant insert on table "public"."scraper_config_test_skus" to "anon";

grant references on table "public"."scraper_config_test_skus" to "anon";

grant select on table "public"."scraper_config_test_skus" to "anon";

grant trigger on table "public"."scraper_config_test_skus" to "anon";

grant truncate on table "public"."scraper_config_test_skus" to "anon";

grant update on table "public"."scraper_config_test_skus" to "anon";

grant delete on table "public"."scraper_config_test_skus" to "authenticated";

grant insert on table "public"."scraper_config_test_skus" to "authenticated";

grant references on table "public"."scraper_config_test_skus" to "authenticated";

grant select on table "public"."scraper_config_test_skus" to "authenticated";

grant trigger on table "public"."scraper_config_test_skus" to "authenticated";

grant truncate on table "public"."scraper_config_test_skus" to "authenticated";

grant update on table "public"."scraper_config_test_skus" to "authenticated";

grant delete on table "public"."scraper_config_test_skus" to "service_role";

grant insert on table "public"."scraper_config_test_skus" to "service_role";

grant references on table "public"."scraper_config_test_skus" to "service_role";

grant select on table "public"."scraper_config_test_skus" to "service_role";

grant trigger on table "public"."scraper_config_test_skus" to "service_role";

grant truncate on table "public"."scraper_config_test_skus" to "service_role";

grant update on table "public"."scraper_config_test_skus" to "service_role";

grant delete on table "public"."scraper_config_versions" to "anon";

grant insert on table "public"."scraper_config_versions" to "anon";

grant references on table "public"."scraper_config_versions" to "anon";

grant select on table "public"."scraper_config_versions" to "anon";

grant trigger on table "public"."scraper_config_versions" to "anon";

grant truncate on table "public"."scraper_config_versions" to "anon";

grant update on table "public"."scraper_config_versions" to "anon";

grant delete on table "public"."scraper_config_versions" to "authenticated";

grant insert on table "public"."scraper_config_versions" to "authenticated";

grant references on table "public"."scraper_config_versions" to "authenticated";

grant select on table "public"."scraper_config_versions" to "authenticated";

grant trigger on table "public"."scraper_config_versions" to "authenticated";

grant truncate on table "public"."scraper_config_versions" to "authenticated";

grant update on table "public"."scraper_config_versions" to "authenticated";

grant delete on table "public"."scraper_config_versions" to "service_role";

grant insert on table "public"."scraper_config_versions" to "service_role";

grant references on table "public"."scraper_config_versions" to "service_role";

grant select on table "public"."scraper_config_versions" to "service_role";

grant trigger on table "public"."scraper_config_versions" to "service_role";

grant truncate on table "public"."scraper_config_versions" to "service_role";

grant update on table "public"."scraper_config_versions" to "service_role";

grant delete on table "public"."scraper_selectors" to "anon";

grant insert on table "public"."scraper_selectors" to "anon";

grant references on table "public"."scraper_selectors" to "anon";

grant select on table "public"."scraper_selectors" to "anon";

grant trigger on table "public"."scraper_selectors" to "anon";

grant truncate on table "public"."scraper_selectors" to "anon";

grant update on table "public"."scraper_selectors" to "anon";

grant delete on table "public"."scraper_selectors" to "authenticated";

grant insert on table "public"."scraper_selectors" to "authenticated";

grant references on table "public"."scraper_selectors" to "authenticated";

grant select on table "public"."scraper_selectors" to "authenticated";

grant trigger on table "public"."scraper_selectors" to "authenticated";

grant truncate on table "public"."scraper_selectors" to "authenticated";

grant update on table "public"."scraper_selectors" to "authenticated";

grant delete on table "public"."scraper_selectors" to "service_role";

grant insert on table "public"."scraper_selectors" to "service_role";

grant references on table "public"."scraper_selectors" to "service_role";

grant select on table "public"."scraper_selectors" to "service_role";

grant trigger on table "public"."scraper_selectors" to "service_role";

grant truncate on table "public"."scraper_selectors" to "service_role";

grant update on table "public"."scraper_selectors" to "service_role";

grant delete on table "public"."scraper_workflow_steps" to "anon";

grant insert on table "public"."scraper_workflow_steps" to "anon";

grant references on table "public"."scraper_workflow_steps" to "anon";

grant select on table "public"."scraper_workflow_steps" to "anon";

grant trigger on table "public"."scraper_workflow_steps" to "anon";

grant truncate on table "public"."scraper_workflow_steps" to "anon";

grant update on table "public"."scraper_workflow_steps" to "anon";

grant delete on table "public"."scraper_workflow_steps" to "authenticated";

grant insert on table "public"."scraper_workflow_steps" to "authenticated";

grant references on table "public"."scraper_workflow_steps" to "authenticated";

grant select on table "public"."scraper_workflow_steps" to "authenticated";

grant trigger on table "public"."scraper_workflow_steps" to "authenticated";

grant truncate on table "public"."scraper_workflow_steps" to "authenticated";

grant update on table "public"."scraper_workflow_steps" to "authenticated";

grant delete on table "public"."scraper_workflow_steps" to "service_role";

grant insert on table "public"."scraper_workflow_steps" to "service_role";

grant references on table "public"."scraper_workflow_steps" to "service_role";

grant select on table "public"."scraper_workflow_steps" to "service_role";

grant trigger on table "public"."scraper_workflow_steps" to "service_role";

grant truncate on table "public"."scraper_workflow_steps" to "service_role";

grant update on table "public"."scraper_workflow_steps" to "service_role";

grant delete on table "public"."service_costs" to "anon";

grant insert on table "public"."service_costs" to "anon";

grant references on table "public"."service_costs" to "anon";

grant select on table "public"."service_costs" to "anon";

grant trigger on table "public"."service_costs" to "anon";

grant truncate on table "public"."service_costs" to "anon";

grant update on table "public"."service_costs" to "anon";

grant delete on table "public"."service_costs" to "authenticated";

grant insert on table "public"."service_costs" to "authenticated";

grant references on table "public"."service_costs" to "authenticated";

grant select on table "public"."service_costs" to "authenticated";

grant trigger on table "public"."service_costs" to "authenticated";

grant truncate on table "public"."service_costs" to "authenticated";

grant update on table "public"."service_costs" to "authenticated";

grant delete on table "public"."service_costs" to "service_role";

grant insert on table "public"."service_costs" to "service_role";

grant references on table "public"."service_costs" to "service_role";

grant select on table "public"."service_costs" to "service_role";

grant trigger on table "public"."service_costs" to "service_role";

grant truncate on table "public"."service_costs" to "service_role";

grant update on table "public"."service_costs" to "service_role";

grant delete on table "public"."subscription_items" to "anon";

grant insert on table "public"."subscription_items" to "anon";

grant references on table "public"."subscription_items" to "anon";

grant select on table "public"."subscription_items" to "anon";

grant trigger on table "public"."subscription_items" to "anon";

grant truncate on table "public"."subscription_items" to "anon";

grant update on table "public"."subscription_items" to "anon";

grant delete on table "public"."subscription_items" to "authenticated";

grant insert on table "public"."subscription_items" to "authenticated";

grant references on table "public"."subscription_items" to "authenticated";

grant select on table "public"."subscription_items" to "authenticated";

grant trigger on table "public"."subscription_items" to "authenticated";

grant truncate on table "public"."subscription_items" to "authenticated";

grant update on table "public"."subscription_items" to "authenticated";

grant delete on table "public"."subscription_items" to "service_role";

grant insert on table "public"."subscription_items" to "service_role";

grant references on table "public"."subscription_items" to "service_role";

grant select on table "public"."subscription_items" to "service_role";

grant trigger on table "public"."subscription_items" to "service_role";

grant truncate on table "public"."subscription_items" to "service_role";

grant update on table "public"."subscription_items" to "service_role";

grant delete on table "public"."subscription_suggestions" to "anon";

grant insert on table "public"."subscription_suggestions" to "anon";

grant references on table "public"."subscription_suggestions" to "anon";

grant select on table "public"."subscription_suggestions" to "anon";

grant trigger on table "public"."subscription_suggestions" to "anon";

grant truncate on table "public"."subscription_suggestions" to "anon";

grant update on table "public"."subscription_suggestions" to "anon";

grant delete on table "public"."subscription_suggestions" to "authenticated";

grant insert on table "public"."subscription_suggestions" to "authenticated";

grant references on table "public"."subscription_suggestions" to "authenticated";

grant select on table "public"."subscription_suggestions" to "authenticated";

grant trigger on table "public"."subscription_suggestions" to "authenticated";

grant truncate on table "public"."subscription_suggestions" to "authenticated";

grant update on table "public"."subscription_suggestions" to "authenticated";

grant delete on table "public"."subscription_suggestions" to "service_role";

grant insert on table "public"."subscription_suggestions" to "service_role";

grant references on table "public"."subscription_suggestions" to "service_role";

grant select on table "public"."subscription_suggestions" to "service_role";

grant trigger on table "public"."subscription_suggestions" to "service_role";

grant truncate on table "public"."subscription_suggestions" to "service_role";

grant update on table "public"."subscription_suggestions" to "service_role";

grant delete on table "public"."subscriptions" to "anon";

grant insert on table "public"."subscriptions" to "anon";

grant references on table "public"."subscriptions" to "anon";

grant select on table "public"."subscriptions" to "anon";

grant trigger on table "public"."subscriptions" to "anon";

grant truncate on table "public"."subscriptions" to "anon";

grant update on table "public"."subscriptions" to "anon";

grant delete on table "public"."subscriptions" to "authenticated";

grant insert on table "public"."subscriptions" to "authenticated";

grant references on table "public"."subscriptions" to "authenticated";

grant select on table "public"."subscriptions" to "authenticated";

grant trigger on table "public"."subscriptions" to "authenticated";

grant truncate on table "public"."subscriptions" to "authenticated";

grant update on table "public"."subscriptions" to "authenticated";

grant delete on table "public"."subscriptions" to "service_role";

grant insert on table "public"."subscriptions" to "service_role";

grant references on table "public"."subscriptions" to "service_role";

grant select on table "public"."subscriptions" to "service_role";

grant trigger on table "public"."subscriptions" to "service_role";

grant truncate on table "public"."subscriptions" to "service_role";

grant update on table "public"."subscriptions" to "service_role";

grant delete on table "public"."tags" to "anon";

grant insert on table "public"."tags" to "anon";

grant references on table "public"."tags" to "anon";

grant select on table "public"."tags" to "anon";

grant trigger on table "public"."tags" to "anon";

grant truncate on table "public"."tags" to "anon";

grant update on table "public"."tags" to "anon";

grant delete on table "public"."tags" to "authenticated";

grant insert on table "public"."tags" to "authenticated";

grant references on table "public"."tags" to "authenticated";

grant select on table "public"."tags" to "authenticated";

grant trigger on table "public"."tags" to "authenticated";

grant truncate on table "public"."tags" to "authenticated";

grant update on table "public"."tags" to "authenticated";

grant delete on table "public"."tags" to "service_role";

grant insert on table "public"."tags" to "service_role";

grant references on table "public"."tags" to "service_role";

grant select on table "public"."tags" to "service_role";

grant trigger on table "public"."tags" to "service_role";

grant truncate on table "public"."tags" to "service_role";

grant update on table "public"."tags" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";


  create policy "Service role can do all on app_settings"
  on "public"."app_settings"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text));



  create policy "Admin users can manage b2b_feeds"
  on "public"."b2b_feeds"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admin users can manage b2b_sync_jobs"
  on "public"."b2b_sync_jobs"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Allow all operations on batch_jobs"
  on "public"."batch_jobs"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Staff read consolidation review requests"
  on "public"."consolidation_review_requests"
  as permissive
  for select
  to public
using (public.is_staff());



  create policy "Staff write consolidation review requests"
  on "public"."consolidation_review_requests"
  as permissive
  for all
  to public
using (public.is_staff())
with check (public.is_staff());



  create policy "Allow all access"
  on "public"."inventory_items"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "Admin manage legacy_redirects"
  on "public"."legacy_redirects"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Public read legacy_redirects"
  on "public"."legacy_redirects"
  as permissive
  for select
  to public
using (true);



  create policy "Enable read for authenticated users"
  on "public"."migration_log"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Enable all access for anon users"
  on "public"."orders_ingestion"
  as permissive
  for all
  to anon
using (true)
with check (true);



  create policy "Enable all access for authenticated users"
  on "public"."orders_ingestion"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "Admins can do everything"
  on "public"."pages"
  as permissive
  for all
  to public
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Public pages are viewable by everyone"
  on "public"."pages"
  as permissive
  for select
  to public
using ((is_published = true));



  create policy "Public can view price history"
  on "public"."price_history"
  as permissive
  for select
  to public
using (true);



  create policy "Authenticated users can answer"
  on "public"."product_answers"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Public can view answers to approved questions"
  on "public"."product_answers"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.product_questions
  WHERE ((product_questions.id = product_answers.question_id) AND (product_questions.status = 'approved'::text)))));



  create policy "Public can view product attributes"
  on "public"."product_attributes"
  as permissive
  for select
  to public
using (true);



  create policy "Public can view product images"
  on "public"."product_images"
  as permissive
  for select
  to public
using (true);



  create policy "Public can view option values"
  on "public"."product_option_values"
  as permissive
  for select
  to public
using (true);



  create policy "Public can view product options"
  on "public"."product_options"
  as permissive
  for select
  to public
using (true);



  create policy "Authenticated users can ask questions"
  on "public"."product_questions"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Public can view approved questions"
  on "public"."product_questions"
  as permissive
  for select
  to public
using ((status = 'approved'::text));



  create policy "Users can view own questions"
  on "public"."product_questions"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Authenticated users can create reviews"
  on "public"."product_reviews"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Public can view approved reviews"
  on "public"."product_reviews"
  as permissive
  for select
  to public
using ((status = 'approved'::text));



  create policy "Users can delete own reviews"
  on "public"."product_reviews"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can update own pending reviews"
  on "public"."product_reviews"
  as permissive
  for update
  to public
using (((auth.uid() = user_id) AND (status = 'pending'::text)));



  create policy "Users can view own reviews"
  on "public"."product_reviews"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Allow all access"
  on "public"."product_scraped_sites"
  as permissive
  for all
  to public
using (true)
with check (true);



  create policy "Allow anon read"
  on "public"."product_scraped_sites"
  as permissive
  for select
  to anon
using (true);



  create policy "Allow authenticated read"
  on "public"."product_scraped_sites"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Allow authenticated write"
  on "public"."product_scraped_sites"
  as permissive
  for all
  to authenticated
using (true);



  create policy "Public can view product tags"
  on "public"."product_tags"
  as permissive
  for select
  to public
using (true);



  create policy "Public can view variants"
  on "public"."product_variants"
  as permissive
  for select
  to public
using (true);



  create policy "Allow all on products"
  on "public"."products_ingestion"
  as permissive
  for all
  to public
using (true);



  create policy "Admins can manage profiles"
  on "public"."profiles"
  as permissive
  for all
  to public
using (public.is_admin());



  create policy "Users can insert own profile"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((auth.uid() = id));



  create policy "Users can add to their history"
  on "public"."recently_viewed"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can delete their history"
  on "public"."recently_viewed"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can update their history"
  on "public"."recently_viewed"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own history"
  on "public"."recently_viewed"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Public can view related products"
  on "public"."related_products"
  as permissive
  for select
  to public
using (true);



  create policy "Users can change their vote"
  on "public"."review_helpful_votes"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can remove their vote"
  on "public"."review_helpful_votes"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can view all votes"
  on "public"."review_helpful_votes"
  as permissive
  for select
  to public
using (true);



  create policy "Users can vote on reviews"
  on "public"."review_helpful_votes"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Authenticated users can read scrape_job_chunks"
  on "public"."scrape_job_chunks"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Service role has full access to scrape_job_chunks"
  on "public"."scrape_job_chunks"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "authenticated_users_can_read_scrape_jobs"
  on "public"."scrape_jobs"
  as permissive
  for select
  to authenticated
using (true);



  create policy "authenticated_users_can_read_scrape_jobs_for_changes"
  on "public"."scrape_jobs"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Admin and staff can add test SKUs"
  on "public"."scraper_config_test_skus"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admin and staff can delete test SKUs"
  on "public"."scraper_config_test_skus"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admin and staff can update test SKUs"
  on "public"."scraper_config_test_skus"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admin and staff can view test SKUs"
  on "public"."scraper_config_test_skus"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Allow admin/staff to manage test_skus"
  on "public"."scraper_config_test_skus"
  as permissive
  for all
  to authenticated
using ((public.is_admin() OR public.is_staff()))
with check ((public.is_admin() OR public.is_staff()));



  create policy "Allow read access to test_skus"
  on "public"."scraper_config_test_skus"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Service role bypass for test_skus"
  on "public"."scraper_config_test_skus"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Service role can manage test SKUs"
  on "public"."scraper_config_test_skus"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Admin and staff can create scraper config versions"
  on "public"."scraper_config_versions"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admin and staff can update scraper config versions"
  on "public"."scraper_config_versions"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admin and staff can view scraper config versions"
  on "public"."scraper_config_versions"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admins can delete scraper config versions"
  on "public"."scraper_config_versions"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Authenticated users can create draft versions"
  on "public"."scraper_config_versions"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "Runners can read published versions"
  on "public"."scraper_config_versions"
  as permissive
  for select
  to authenticated
using (((status)::text = 'published'::text));



  create policy "Service role can manage scraper config versions"
  on "public"."scraper_config_versions"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Staff can read all versions"
  on "public"."scraper_config_versions"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Users can delete draft versions"
  on "public"."scraper_config_versions"
  as permissive
  for delete
  to authenticated
using (((status)::text = 'draft'::text));



  create policy "Users can update draft versions"
  on "public"."scraper_config_versions"
  as permissive
  for update
  to authenticated
using (((status)::text = 'draft'::text))
with check (((status)::text = 'draft'::text));



  create policy "Admins can delete scraper configs"
  on "public"."scraper_configs"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Authenticated users can create scraper configs"
  on "public"."scraper_configs"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "Authenticated users can read scraper configs"
  on "public"."scraper_configs"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Staff can update scraper config metadata"
  on "public"."scraper_configs"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Allow admin/staff to manage health_metrics"
  on "public"."scraper_health_metrics"
  as permissive
  for all
  to authenticated
using ((public.is_admin() OR public.is_staff()))
with check ((public.is_admin() OR public.is_staff()));



  create policy "Allow read access to health_metrics"
  on "public"."scraper_health_metrics"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Service role bypass for health_metrics"
  on "public"."scraper_health_metrics"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Admin and staff can create scraper selectors"
  on "public"."scraper_selectors"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admin and staff can update scraper selectors"
  on "public"."scraper_selectors"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admin and staff can view scraper selectors"
  on "public"."scraper_selectors"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admins can delete scraper selectors"
  on "public"."scraper_selectors"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Service role can manage scraper selectors"
  on "public"."scraper_selectors"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Admin and staff can create workflow steps"
  on "public"."scraper_workflow_steps"
  as permissive
  for insert
  to authenticated
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admin and staff can update workflow steps"
  on "public"."scraper_workflow_steps"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admin and staff can view workflow steps"
  on "public"."scraper_workflow_steps"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::text, 'staff'::text]))))));



  create policy "Admins can delete workflow steps"
  on "public"."scraper_workflow_steps"
  as permissive
  for delete
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));



  create policy "Service role can manage workflow steps"
  on "public"."scraper_workflow_steps"
  as permissive
  for all
  to service_role
using (true)
with check (true);



  create policy "Allow authenticated users to manage service_costs"
  on "public"."service_costs"
  as permissive
  for all
  to authenticated
using (true)
with check (true);



  create policy "Allow authenticated users to read service_costs"
  on "public"."service_costs"
  as permissive
  for select
  to authenticated
using (true);



  create policy "Users can add items to their subscriptions"
  on "public"."subscription_items"
  as permissive
  for insert
  to public
with check ((EXISTS ( SELECT 1
   FROM public.subscriptions
  WHERE ((subscriptions.id = subscription_items.subscription_id) AND (subscriptions.user_id = auth.uid())))));



  create policy "Users can delete items from their subscriptions"
  on "public"."subscription_items"
  as permissive
  for delete
  to public
using ((EXISTS ( SELECT 1
   FROM public.subscriptions
  WHERE ((subscriptions.id = subscription_items.subscription_id) AND (subscriptions.user_id = auth.uid())))));



  create policy "Users can update items of their subscriptions"
  on "public"."subscription_items"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.subscriptions
  WHERE ((subscriptions.id = subscription_items.subscription_id) AND (subscriptions.user_id = auth.uid())))));



  create policy "Users can view items of their subscriptions"
  on "public"."subscription_items"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.subscriptions
  WHERE ((subscriptions.id = subscription_items.subscription_id) AND (subscriptions.user_id = auth.uid())))));



  create policy "Users can dismiss suggestions for their subscriptions"
  on "public"."subscription_suggestions"
  as permissive
  for update
  to public
using ((EXISTS ( SELECT 1
   FROM public.subscriptions
  WHERE ((subscriptions.id = subscription_suggestions.subscription_id) AND (subscriptions.user_id = auth.uid())))));



  create policy "Users can view suggestions for their subscriptions"
  on "public"."subscription_suggestions"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.subscriptions
  WHERE ((subscriptions.id = subscription_suggestions.subscription_id) AND (subscriptions.user_id = auth.uid())))));



  create policy "Users can create their own subscriptions"
  on "public"."subscriptions"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can delete their own subscriptions"
  on "public"."subscriptions"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can update their own subscriptions"
  on "public"."subscriptions"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view their own subscriptions"
  on "public"."subscriptions"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Public can view tags"
  on "public"."tags"
  as permissive
  for select
  to public
using (true);



  create policy "Staff can view all pets"
  on "public"."user_pets"
  as permissive
  for select
  to public
using (public.is_staff());



  create policy "Users can delete own pets"
  on "public"."user_pets"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));



  create policy "Users can insert own pets"
  on "public"."user_pets"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



  create policy "Users can update own pets"
  on "public"."user_pets"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));



  create policy "Users can view own pets"
  on "public"."user_pets"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Can update own user data."
  on "public"."users"
  as permissive
  for update
  to public
using ((auth.uid() = id));



  create policy "Can view own user data."
  on "public"."users"
  as permissive
  for select
  to public
using ((auth.uid() = id));



  create policy "Users cannot update is_admin"
  on "public"."users"
  as permissive
  for update
  to public
using ((auth.uid() = id))
with check ((is_admin = ( SELECT users_1.is_admin
   FROM public.users users_1
  WHERE (users_1.id = auth.uid()))));



  create policy "Admin manage brand scraper affinity"
  on "public"."brand_scraper_affinity"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Allow admin write access to categories"
  on "public"."categories"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Admin manage cohort batches"
  on "public"."cohort_batches"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Admin manage cohort members"
  on "public"."cohort_members"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Allow admin write access to facet_definitions"
  on "public"."facet_definitions"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Allow admin write access to facet_values"
  on "public"."facet_values"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Allow admin write access to pet_types"
  on "public"."pet_types"
  as permissive
  for all
  to public
using (public.is_admin());



  create policy "Admin view pipeline audit log"
  on "public"."pipeline_audit_log"
  as permissive
  for select
  to public
using (public.is_staff());



  create policy "Admin manage retry queue"
  on "public"."pipeline_retry_queue"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Admin manage preorder batches"
  on "public"."preorder_batches"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Admin manage preorder groups"
  on "public"."preorder_groups"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Allow admin write access to product_categories"
  on "public"."product_categories"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Allow admin write access to product_facets"
  on "public"."product_facets"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Admin manage product group products"
  on "public"."product_group_products"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Admin manage product groups"
  on "public"."product_groups"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Allow admin write access to product_pet_types"
  on "public"."product_pet_types"
  as permissive
  for all
  to public
using (public.is_staff());



  create policy "Admin manage product preorder groups"
  on "public"."product_preorder_groups"
  as permissive
  for all
  to public
using (public.is_staff());


CREATE TRIGGER trigger_b2b_feeds_updated_at BEFORE UPDATE ON public.b2b_feeds FOR EACH ROW EXECUTE FUNCTION public.update_b2b_feeds_updated_at();

CREATE TRIGGER consolidation_review_requests_updated_at BEFORE UPDATE ON public.consolidation_review_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_items_timestamp BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.update_inventory_items_updated_at();

CREATE TRIGGER update_product_scraped_sites_timestamp BEFORE UPDATE ON public.product_scraped_sites FOR EACH ROW EXECUTE FUNCTION public.update_product_scraped_sites_updated_at();

CREATE TRIGGER trigger_record_variant_price_change AFTER UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.record_variant_price_change();

CREATE TRIGGER trigger_record_product_price_change AFTER UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.record_product_price_change();

CREATE TRIGGER products_updated_at BEFORE UPDATE ON public.products_ingestion FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_update_review_helpful_count AFTER INSERT OR DELETE OR UPDATE ON public.review_helpful_votes FOR EACH ROW EXECUTE FUNCTION public.update_review_helpful_count();

CREATE TRIGGER scraper_configs_updated_at_trigger BEFORE UPDATE ON public.scraper_configs FOR EACH ROW EXECUTE FUNCTION public.update_scraper_configs_updated_at();

CREATE TRIGGER update_scraper_health_metrics_updated_at BEFORE UPDATE ON public.scraper_health_metrics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER service_costs_updated_at BEFORE UPDATE ON public.service_costs FOR EACH ROW EXECUTE FUNCTION public.update_service_costs_updated_at();


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



