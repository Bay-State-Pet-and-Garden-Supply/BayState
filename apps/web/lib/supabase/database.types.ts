export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          city: string
          created_at: string | null
          full_name: string
          id: string
          is_default: boolean | null
          phone: string | null
          state: string
          user_id: string
          zip_code: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          city: string
          created_at?: string | null
          full_name: string
          id?: string
          is_default?: boolean | null
          phone?: string | null
          state: string
          user_id: string
          zip_code: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          city?: string
          created_at?: string | null
          full_name?: string
          id?: string
          is_default?: boolean | null
          phone?: string | null
          state?: string
          user_id?: string
          zip_code?: string
        }
        Relationships: []
      }
      ai_provider_configs: {
        Row: {
          auth_tag: string
          base_url: string | null
          created_at: string
          default_model: string
          encrypted_key: string
          id: string
          is_active: boolean
          iv: string
          key_version: number
          name: string
          provider_type: Database["public"]["Enums"]["ai_provider_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auth_tag: string
          base_url?: string | null
          created_at?: string
          default_model: string
          encrypted_key: string
          id?: string
          is_active?: boolean
          iv: string
          key_version?: number
          name: string
          provider_type: Database["public"]["Enums"]["ai_provider_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auth_tag?: string
          base_url?: string | null
          created_at?: string
          default_model?: string
          encrypted_key?: string
          id?: string
          is_active?: boolean
          iv?: string
          key_version?: number
          name?: string
          provider_type?: Database["public"]["Enums"]["ai_provider_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ai_provider_credentials: {
        Row: {
          auth_tag: string
          created_at: string
          encrypted_value: string
          id: string
          iv: string
          key_version: number
          last4: string | null
          provider: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auth_tag: string
          created_at?: string
          encrypted_value: string
          id?: string
          iv: string
          key_version?: number
          last4?: string | null
          provider: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auth_tag?: string
          created_at?: string
          encrypted_value?: string
          id?: string
          iv?: string
          key_version?: number
          last4?: string | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          encrypted: boolean | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          encrypted?: boolean | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          encrypted?: boolean | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      b2b_feeds: {
        Row: {
          config: Json | null
          created_at: string | null
          display_name: string
          distributor_code: string
          enabled: boolean | null
          feed_type: string
          id: string
          last_sync_at: string | null
          last_sync_job_id: string | null
          products_count: number | null
          status: string
          sync_frequency: string | null
          updated_at: string | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          display_name: string
          distributor_code: string
          enabled?: boolean | null
          feed_type: string
          id?: string
          last_sync_at?: string | null
          last_sync_job_id?: string | null
          products_count?: number | null
          status?: string
          sync_frequency?: string | null
          updated_at?: string | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          display_name?: string
          distributor_code?: string
          enabled?: boolean | null
          feed_type?: string
          id?: string
          last_sync_at?: string | null
          last_sync_job_id?: string | null
          products_count?: number | null
          status?: string
          sync_frequency?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      b2b_sync_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          feed_id: string
          id: string
          job_type: string
          metadata: Json | null
          products_created: number | null
          products_failed: number | null
          products_fetched: number | null
          products_updated: number | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          feed_id: string
          id?: string
          job_type: string
          metadata?: Json | null
          products_created?: number | null
          products_failed?: number | null
          products_fetched?: number | null
          products_updated?: number | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          feed_id?: string
          id?: string
          job_type?: string
          metadata?: Json | null
          products_created?: number | null
          products_failed?: number | null
          products_fetched?: number | null
          products_updated?: number | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_sync_jobs_feed_id_fkey"
            columns: ["feed_id"]
            isOneToOne: false
            referencedRelation: "b2b_feeds"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_job_items: {
        Row: {
          attempt_count: number
          batch_job_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          fallback_batch_id: string | null
          id: string
          parsed_result: Json | null
          product_source: Json
          request_payload: Json
          response_payload: Json | null
          sku: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          batch_job_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          fallback_batch_id?: string | null
          id?: string
          parsed_result?: Json | null
          product_source?: Json
          request_payload?: Json
          response_payload?: Json | null
          sku: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          batch_job_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          fallback_batch_id?: string | null
          id?: string
          parsed_result?: Json | null
          product_source?: Json
          request_payload?: Json
          response_payload?: Json | null
          sku?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_job_items_batch_id_fkey"
            columns: ["batch_job_id"]
            isOneToOne: false
            referencedRelation: "batch_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_job_items_fallback_batch_id_fkey"
            columns: ["fallback_batch_id"]
            isOneToOne: false
            referencedRelation: "batch_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_jobs: {
        Row: {
          auto_apply: boolean | null
          completed_at: string | null
          completed_requests: number | null
          completion_tokens: number | null
          created_at: string | null
          description: string | null
          error_file_id: string | null
          estimated_cost: number | null
          execution_mode: string
          failed_requests: number | null
          failed_skus: string[] | null
          id: string
          input_file_id: string | null
          max_retries: number | null
          metadata: Json | null
          openai_batch_id: string | null
          output_file_id: string | null
          parent_batch_id: string | null
          prompt_tokens: number | null
          provider: string
          provider_batch_id: string | null
          provider_error_file_id: string | null
          provider_input_file_id: string | null
          provider_output_file_id: string | null
          retry_count: number | null
          status: string
          total_requests: number | null
          total_tokens: number | null
          updated_at: string | null
          webhook_payload: Json | null
          webhook_received_at: string | null
        }
        Insert: {
          auto_apply?: boolean | null
          completed_at?: string | null
          completed_requests?: number | null
          completion_tokens?: number | null
          created_at?: string | null
          description?: string | null
          error_file_id?: string | null
          estimated_cost?: number | null
          execution_mode?: string
          failed_requests?: number | null
          failed_skus?: string[] | null
          id?: string
          input_file_id?: string | null
          max_retries?: number | null
          metadata?: Json | null
          openai_batch_id?: string | null
          output_file_id?: string | null
          parent_batch_id?: string | null
          prompt_tokens?: number | null
          provider?: string
          provider_batch_id?: string | null
          provider_error_file_id?: string | null
          provider_input_file_id?: string | null
          provider_output_file_id?: string | null
          retry_count?: number | null
          status?: string
          total_requests?: number | null
          total_tokens?: number | null
          updated_at?: string | null
          webhook_payload?: Json | null
          webhook_received_at?: string | null
        }
        Update: {
          auto_apply?: boolean | null
          completed_at?: string | null
          completed_requests?: number | null
          completion_tokens?: number | null
          created_at?: string | null
          description?: string | null
          error_file_id?: string | null
          estimated_cost?: number | null
          execution_mode?: string
          failed_requests?: number | null
          failed_skus?: string[] | null
          id?: string
          input_file_id?: string | null
          max_retries?: number | null
          metadata?: Json | null
          openai_batch_id?: string | null
          output_file_id?: string | null
          parent_batch_id?: string | null
          prompt_tokens?: number | null
          provider?: string
          provider_batch_id?: string | null
          provider_error_file_id?: string | null
          provider_input_file_id?: string | null
          provider_output_file_id?: string | null
          retry_count?: number | null
          status?: string
          total_requests?: number | null
          total_tokens?: number | null
          updated_at?: string | null
          webhook_payload?: Json | null
          webhook_received_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_jobs_parent_batch_id_fkey"
            columns: ["parent_batch_id"]
            isOneToOne: false
            referencedRelation: "batch_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_scraper_affinity: {
        Row: {
          avg_fields_extracted: number | null
          avg_images_found: number | null
          brand_name: string
          created_at: string | null
          hit_rate: number | null
          id: string
          last_attempt_at: string | null
          last_success_at: string | null
          scraper_slug: string
          successful_extractions: number | null
          total_attempts: number | null
          updated_at: string | null
        }
        Insert: {
          avg_fields_extracted?: number | null
          avg_images_found?: number | null
          brand_name: string
          created_at?: string | null
          hit_rate?: number | null
          id?: string
          last_attempt_at?: string | null
          last_success_at?: string | null
          scraper_slug: string
          successful_extractions?: number | null
          total_attempts?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_fields_extracted?: number | null
          avg_images_found?: number | null
          brand_name?: string
          created_at?: string | null
          hit_rate?: number | null
          id?: string
          last_attempt_at?: string | null
          last_success_at?: string | null
          scraper_slug?: string
          successful_extractions?: number | null
          total_attempts?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      brand_scraper_mappings: {
        Row: {
          brand_id: string
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          priority: number
          scraper_config_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          priority?: number
          scraper_config_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          priority?: number
          scraper_config_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_scraper_mappings_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_scraper_mappings_scraper_config_id_fkey"
            columns: ["scraper_config_id"]
            isOneToOne: false
            referencedRelation: "ai_scraper_stats"
            referencedColumns: ["config_id"]
          },
          {
            foreignKeyName: "brand_scraper_mappings_scraper_config_id_fkey"
            columns: ["scraper_config_id"]
            isOneToOne: false
            referencedRelation: "scraper_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_sources: {
        Row: {
          allowed_fields: string[]
          asset_domains: string[]
          brand_id: string
          crawl4ai_adapter_slug: string
          created_at: string
          credential_ref: string | null
          display_name: string
          domains: string[]
          enabled: boolean
          id: string
          metadata: Json
          priority: number
          requires_auth: boolean
          search_mode: string
          source_slug: string
          source_type: string
          updated_at: string
        }
        Insert: {
          allowed_fields?: string[]
          asset_domains?: string[]
          brand_id: string
          crawl4ai_adapter_slug: string
          created_at?: string
          credential_ref?: string | null
          display_name: string
          domains?: string[]
          enabled?: boolean
          id?: string
          metadata?: Json
          priority?: number
          requires_auth?: boolean
          search_mode: string
          source_slug: string
          source_type: string
          updated_at?: string
        }
        Update: {
          allowed_fields?: string[]
          asset_domains?: string[]
          brand_id?: string
          crawl4ai_adapter_slug?: string
          created_at?: string
          credential_ref?: string | null
          display_name?: string
          domains?: string[]
          enabled?: boolean
          id?: string
          metadata?: Json
          priority?: number
          requires_auth?: boolean
          search_mode?: string
          source_slug?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_sources_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          official_domains: string[]
          preferred_domains: string[]
          slug: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          official_domains?: string[]
          preferred_domains?: string[]
          slug: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          official_domains?: string[]
          preferred_domains?: string[]
          slug?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          breadcrumb: string | null
          created_at: string | null
          department_key: string | null
          depth: number | null
          description: string | null
          display_order: number | null
          facet_profile: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean | null
          name: string
          parent_id: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string | null
          sort_order: number | null
          synonym_keywords: string[]
          updated_at: string | null
        }
        Insert: {
          breadcrumb?: string | null
          created_at?: string | null
          department_key?: string | null
          depth?: number | null
          description?: string | null
          display_order?: number | null
          facet_profile?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean | null
          name: string
          parent_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string | null
          sort_order?: number | null
          synonym_keywords?: string[]
          updated_at?: string | null
        }
        Update: {
          breadcrumb?: string | null
          created_at?: string | null
          department_key?: string | null
          depth?: number | null
          description?: string | null
          display_order?: number | null
          facet_profile?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean | null
          name?: string
          parent_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string | null
          sort_order?: number | null
          synonym_keywords?: string[]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_batches: {
        Row: {
          brand_id: string | null
          brand_name: string | null
          created_at: string | null
          id: string
          metadata: Json | null
          name: string | null
          product_line: string | null
          scraper_config: string | null
          status: string | null
          upc_prefix: string
          updated_at: string | null
        }
        Insert: {
          brand_id?: string | null
          brand_name?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          product_line?: string | null
          scraper_config?: string | null
          status?: string | null
          upc_prefix: string
          updated_at?: string | null
        }
        Update: {
          brand_id?: string | null
          brand_name?: string | null
          created_at?: string | null
          id?: string
          metadata?: Json | null
          name?: string | null
          product_line?: string | null
          scraper_config?: string | null
          status?: string | null
          upc_prefix?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cohort_batches_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      cohort_members: {
        Row: {
          cohort_id: string
          created_at: string | null
          product_sku: string
          sort_order: number | null
          upc_prefix: string
        }
        Insert: {
          cohort_id: string
          created_at?: string | null
          product_sku: string
          sort_order?: number | null
          upc_prefix: string
        }
        Update: {
          cohort_id?: string
          created_at?: string | null
          product_sku?: string
          sort_order?: number | null
          upc_prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "cohort_members_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohort_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      consolidation_review_requests: {
        Row: {
          agent_summary: string | null
          batch_job_id: string | null
          batch_job_item_id: string | null
          blocking: boolean
          candidate_consolidated: Json
          cohort_id: string | null
          created_at: string
          evidence: Json
          field_candidates: Json
          field_questions: Json
          id: string
          requested_fields: string[]
          resolution: Json
          resolved_at: string | null
          resolved_by: string | null
          sku: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_summary?: string | null
          batch_job_id?: string | null
          batch_job_item_id?: string | null
          blocking?: boolean
          candidate_consolidated?: Json
          cohort_id?: string | null
          created_at?: string
          evidence?: Json
          field_candidates?: Json
          field_questions?: Json
          id?: string
          requested_fields?: string[]
          resolution?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          sku: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_summary?: string | null
          batch_job_id?: string | null
          batch_job_item_id?: string | null
          blocking?: boolean
          candidate_consolidated?: Json
          cohort_id?: string | null
          created_at?: string
          evidence?: Json
          field_candidates?: Json
          field_questions?: Json
          id?: string
          requested_fields?: string[]
          resolution?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          sku?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consolidation_review_requests_batch_job_id_fkey"
            columns: ["batch_job_id"]
            isOneToOne: false
            referencedRelation: "batch_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consolidation_review_requests_batch_job_item_id_fkey"
            columns: ["batch_job_item_id"]
            isOneToOne: false
            referencedRelation: "batch_job_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consolidation_review_requests_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohort_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consolidation_review_requests_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_export_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "consolidation_review_requests_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalized_review"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "consolidation_review_requests_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalizing_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "consolidation_review_requests_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_ingestion"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "consolidation_review_requests_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_published"
            referencedColumns: ["id"]
          },
        ]
      }
      email_subscribers: {
        Row: {
          email: string
          first_name: string | null
          id: string
          is_verified: boolean | null
          source: string | null
          subscribed_at: string | null
          unsubscribed_at: string | null
        }
        Insert: {
          email: string
          first_name?: string | null
          id?: string
          is_verified?: boolean | null
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Update: {
          email?: string
          first_name?: string | null
          id?: string
          is_verified?: boolean | null
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      enrichment_attempts: {
        Row: {
          attempt_number: number
          claimed_by: string | null
          completed_at: string | null
          confidence_overall: number | null
          config_id: string | null
          created_at: string
          error_message: string | null
          field_confidence: Json
          id: string
          job_id: string
          lease_expires_at: string | null
          lease_token: string | null
          mode: string
          model: string | null
          normalized_source: Json | null
          result: Json | null
          retry_count: number
          sku: string
          source_url: string | null
          started_at: string | null
          status: string
          target_id: string | null
          updated_at: string
          validation: Json
        }
        Insert: {
          attempt_number?: number
          claimed_by?: string | null
          completed_at?: string | null
          confidence_overall?: number | null
          config_id?: string | null
          created_at?: string
          error_message?: string | null
          field_confidence?: Json
          id?: string
          job_id: string
          lease_expires_at?: string | null
          lease_token?: string | null
          mode?: string
          model?: string | null
          normalized_source?: Json | null
          result?: Json | null
          retry_count?: number
          sku: string
          source_url?: string | null
          started_at?: string | null
          status?: string
          target_id?: string | null
          updated_at?: string
          validation?: Json
        }
        Update: {
          attempt_number?: number
          claimed_by?: string | null
          completed_at?: string | null
          confidence_overall?: number | null
          config_id?: string | null
          created_at?: string
          error_message?: string | null
          field_confidence?: Json
          id?: string
          job_id?: string
          lease_expires_at?: string | null
          lease_token?: string | null
          mode?: string
          model?: string | null
          normalized_source?: Json | null
          result?: Json | null
          retry_count?: number
          sku?: string
          source_url?: string | null
          started_at?: string | null
          status?: string
          target_id?: string | null
          updated_at?: string
          validation?: Json
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_attempts_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_attempts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "enrichment_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_attempts_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_export_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "enrichment_attempts_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalized_review"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "enrichment_attempts_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalizing_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "enrichment_attempts_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_ingestion"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "enrichment_attempts_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_published"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrichment_attempts_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "enrichment_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_job_logs: {
        Row: {
          created_at: string
          details: Json | null
          event_id: string | null
          id: string
          job_id: string
          level: string
          message: string
          phase: string | null
          runner_id: string | null
          runner_name: string | null
          scraper_name: string | null
          sequence: number | null
          sku: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_id?: string | null
          id?: string
          job_id: string
          level: string
          message: string
          phase?: string | null
          runner_id?: string | null
          runner_name?: string | null
          scraper_name?: string | null
          sequence?: number | null
          sku?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_id?: string | null
          id?: string
          job_id?: string
          level?: string
          message?: string
          phase?: string | null
          runner_id?: string | null
          runner_name?: string | null
          scraper_name?: string | null
          sequence?: number | null
          sku?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_job_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "enrichment_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_jobs: {
        Row: {
          claimed_by: string | null
          completed_at: string | null
          completed_count: number
          config: Json
          config_id: string | null
          cost_estimate: number | null
          created_at: string
          created_by: string | null
          current_sku: string | null
          error_message: string | null
          failed_count: number
          heartbeat_at: string | null
          id: string
          items_processed: number | null
          items_total: number | null
          last_event_at: string | null
          last_log_at: string | null
          last_log_level: string | null
          last_log_message: string | null
          lease_expires_at: string | null
          lease_token: string | null
          mode: string
          model: string | null
          progress_details: Json | null
          progress_message: string | null
          progress_percent: number | null
          progress_phase: string | null
          progress_updated_at: string | null
          skus: string[]
          started_at: string | null
          status: string
          test_metadata: Json
          test_mode: boolean
          token_usage: Json
          total_count: number
          updated_at: string
        }
        Insert: {
          claimed_by?: string | null
          completed_at?: string | null
          completed_count?: number
          config?: Json
          config_id?: string | null
          cost_estimate?: number | null
          created_at?: string
          created_by?: string | null
          current_sku?: string | null
          error_message?: string | null
          failed_count?: number
          heartbeat_at?: string | null
          id?: string
          items_processed?: number | null
          items_total?: number | null
          last_event_at?: string | null
          last_log_at?: string | null
          last_log_level?: string | null
          last_log_message?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          mode?: string
          model?: string | null
          progress_details?: Json | null
          progress_message?: string | null
          progress_percent?: number | null
          progress_phase?: string | null
          progress_updated_at?: string | null
          skus?: string[]
          started_at?: string | null
          status?: string
          test_metadata?: Json
          test_mode?: boolean
          token_usage?: Json
          total_count?: number
          updated_at?: string
        }
        Update: {
          claimed_by?: string | null
          completed_at?: string | null
          completed_count?: number
          config?: Json
          config_id?: string | null
          cost_estimate?: number | null
          created_at?: string
          created_by?: string | null
          current_sku?: string | null
          error_message?: string | null
          failed_count?: number
          heartbeat_at?: string | null
          id?: string
          items_processed?: number | null
          items_total?: number | null
          last_event_at?: string | null
          last_log_at?: string | null
          last_log_level?: string | null
          last_log_message?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          mode?: string
          model?: string | null
          progress_details?: Json | null
          progress_message?: string | null
          progress_percent?: number | null
          progress_phase?: string | null
          progress_updated_at?: string | null
          skus?: string[]
          started_at?: string | null
          status?: string
          test_metadata?: Json
          test_mode?: boolean
          token_usage?: Json
          total_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_jobs_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      enrichment_targets: {
        Row: {
          confidence: number | null
          created_at: string
          domain: string | null
          id: string
          selected: boolean
          sku: string
          source: string
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          domain?: string | null
          id?: string
          selected?: boolean
          sku: string
          source?: string
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          domain?: string | null
          id?: string
          selected?: boolean
          sku?: string
          source?: string
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrichment_targets_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_export_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "enrichment_targets_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalized_review"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "enrichment_targets_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalizing_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "enrichment_targets_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_ingestion"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "enrichment_targets_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_published"
            referencedColumns: ["id"]
          },
        ]
      }
      external_sources: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          key: string
          name: string
          source_system: string
          source_type: Database["public"]["Enums"]["order_source_type"]
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          source_system: string
          source_type: Database["public"]["Enums"]["order_source_type"]
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          source_system?: string
          source_type?: Database["public"]["Enums"]["order_source_type"]
          updated_at?: string
        }
        Relationships: []
      }
      facet_definitions: {
        Row: {
          created_at: string
          description: string | null
          facet_profile: string[]
          id: string
          is_deprecated: boolean
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          facet_profile?: string[]
          id?: string
          is_deprecated?: boolean
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          facet_profile?: string[]
          id?: string
          is_deprecated?: boolean
          name?: string
          slug?: string
        }
        Relationships: []
      }
      facet_values: {
        Row: {
          created_at: string
          facet_definition_id: string
          id: string
          normalized_value: string
          slug: string
          value: string
        }
        Insert: {
          created_at?: string
          facet_definition_id: string
          id?: string
          normalized_value: string
          slug: string
          value: string
        }
        Update: {
          created_at?: string
          facet_definition_id?: string
          id?: string
          normalized_value?: string
          slug?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "facet_values_facet_definition_id_fkey"
            columns: ["facet_definition_id"]
            isOneToOne: false
            referencedRelation: "facet_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      image_retry_queue: {
        Row: {
          created_at: string
          error_type: Database["public"]["Enums"]["image_error_type"]
          id: string
          image_url: string
          last_error: string | null
          max_retries: number
          retry_count: number
          scheduled_for: string
          sku: string | null
          status: Database["public"]["Enums"]["image_retry_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          error_type?: Database["public"]["Enums"]["image_error_type"]
          id?: string
          image_url: string
          last_error?: string | null
          max_retries?: number
          retry_count?: number
          scheduled_for?: string
          sku?: string | null
          status?: Database["public"]["Enums"]["image_retry_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          error_type?: Database["public"]["Enums"]["image_error_type"]
          id?: string
          image_url?: string
          last_error?: string | null
          max_retries?: number
          retry_count?: number
          scheduled_for?: string
          sku?: string | null
          status?: Database["public"]["Enums"]["image_retry_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "image_retry_queue_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_export_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "image_retry_queue_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalized_review"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "image_retry_queue_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalizing_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "image_retry_queue_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_ingestion"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "image_retry_queue_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_published"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_runs: {
        Row: {
          completed_at: string | null
          created_by: string | null
          error_count: number | null
          error_summary: string | null
          external_source_id: string | null
          file_name: string | null
          id: string
          inserted_count: number | null
          metadata: Json
          row_count: number | null
          skipped_count: number | null
          source_system: string
          source_type: Database["public"]["Enums"]["order_source_type"]
          started_at: string
          status: string
          sync_kind: string
          updated_count: number | null
        }
        Insert: {
          completed_at?: string | null
          created_by?: string | null
          error_count?: number | null
          error_summary?: string | null
          external_source_id?: string | null
          file_name?: string | null
          id?: string
          inserted_count?: number | null
          metadata?: Json
          row_count?: number | null
          skipped_count?: number | null
          source_system: string
          source_type: Database["public"]["Enums"]["order_source_type"]
          started_at?: string
          status?: string
          sync_kind: string
          updated_count?: number | null
        }
        Update: {
          completed_at?: string | null
          created_by?: string | null
          error_count?: number | null
          error_summary?: string | null
          external_source_id?: string | null
          file_name?: string | null
          id?: string
          inserted_count?: number | null
          metadata?: Json
          row_count?: number | null
          skipped_count?: number | null
          source_system?: string
          source_type?: Database["public"]["Enums"]["order_source_type"]
          started_at?: string
          status?: string
          sync_kind?: string
          updated_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_runs_external_source_id_fkey"
            columns: ["external_source_id"]
            isOneToOne: false
            referencedRelation: "external_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          created_at: string
          id: string
          name: string | null
          price: number | null
          sku: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string | null
          price?: number | null
          sku: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          price?: number | null
          sku?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_reconciliation_items: {
        Row: {
          created_at: string
          id: string
          issue_type: Database["public"]["Enums"]["inventory_reconciliation_issue_type"]
          metadata: Json
          product_id: string | null
          raw_register_payload: Json
          recommended_action: string | null
          register_name: string | null
          register_price: number | null
          register_quantity: number | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          sku: string
          status: Database["public"]["Enums"]["inventory_reconciliation_status"]
          sync_run_id: string
          website_name: string | null
          website_price: number | null
          website_quantity: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          issue_type: Database["public"]["Enums"]["inventory_reconciliation_issue_type"]
          metadata?: Json
          product_id?: string | null
          raw_register_payload?: Json
          recommended_action?: string | null
          register_name?: string | null
          register_price?: number | null
          register_quantity?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          sku: string
          status?: Database["public"]["Enums"]["inventory_reconciliation_status"]
          sync_run_id: string
          website_name?: string | null
          website_price?: number | null
          website_quantity?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          issue_type?: Database["public"]["Enums"]["inventory_reconciliation_issue_type"]
          metadata?: Json
          product_id?: string | null
          raw_register_payload?: Json
          recommended_action?: string | null
          register_name?: string | null
          register_price?: number | null
          register_quantity?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          sku?: string
          status?: Database["public"]["Enums"]["inventory_reconciliation_status"]
          sync_run_id?: string
          website_name?: string | null
          website_price?: number | null
          website_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reconciliation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reconciliation_items_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "integration_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_redirects: {
        Row: {
          created_at: string | null
          id: string
          new_path: string
          old_path: string
          status_code: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          new_path: string
          old_path: string
          status_code?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          new_path?: string
          old_path?: string
          status_code?: number
        }
        Relationships: []
      }
      llm_parallel_runs: {
        Row: {
          comparison: Json
          completed_at: string | null
          created_at: string
          id: string
          metadata: Json
          primary_batch_id: string
          primary_provider: string
          primary_summary: Json
          sample_percent: number
          shadow_batch_id: string | null
          shadow_provider: string
          shadow_summary: Json
          status: string
          subject_key: string
          updated_at: string
          workflow: string
        }
        Insert: {
          comparison?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          primary_batch_id: string
          primary_provider: string
          primary_summary?: Json
          sample_percent?: number
          shadow_batch_id?: string | null
          shadow_provider: string
          shadow_summary?: Json
          status?: string
          subject_key: string
          updated_at?: string
          workflow?: string
        }
        Update: {
          comparison?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          primary_batch_id?: string
          primary_provider?: string
          primary_summary?: Json
          sample_percent?: number
          shadow_batch_id?: string | null
          shadow_provider?: string
          shadow_summary?: Json
          status?: string
          subject_key?: string
          updated_at?: string
          workflow?: string
        }
        Relationships: []
      }
      migration_log: {
        Row: {
          completed_at: string | null
          created: number
          duration_ms: number | null
          errors: Json | null
          failed: number
          id: string
          metadata: Json | null
          processed: number
          started_at: string
          status: string
          sync_type: string
          updated: number
        }
        Insert: {
          completed_at?: string | null
          created?: number
          duration_ms?: number | null
          errors?: Json | null
          failed?: number
          id?: string
          metadata?: Json | null
          processed?: number
          started_at?: string
          status?: string
          sync_type: string
          updated?: number
        }
        Update: {
          completed_at?: string | null
          created?: number
          duration_ms?: number | null
          errors?: Json | null
          failed?: number
          id?: string
          metadata?: Json | null
          processed?: number
          started_at?: string
          status?: string
          sync_type?: string
          updated?: number
        }
        Relationships: []
      }
      official_brand_url_candidates: {
        Row: {
          appeared_in_phases: number[] | null
          brand_id: string | null
          candidate_source: string
          cohort_id: string | null
          composite_score: number | null
          confidence: number | null
          created_at: string
          discovery_job_id: string | null
          error_message: string | null
          extraction_job_id: string | null
          id: string
          metadata: Json
          normalized_domain: string
          normalized_url: string
          predicted_name: string | null
          rank: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          selection_status: string
          selection_tier: string | null
          sku: string
          snippet: string | null
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          appeared_in_phases?: number[] | null
          brand_id?: string | null
          candidate_source: string
          cohort_id?: string | null
          composite_score?: number | null
          confidence?: number | null
          created_at?: string
          discovery_job_id?: string | null
          error_message?: string | null
          extraction_job_id?: string | null
          id?: string
          metadata?: Json
          normalized_domain: string
          normalized_url: string
          predicted_name?: string | null
          rank?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selection_status?: string
          selection_tier?: string | null
          sku: string
          snippet?: string | null
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          appeared_in_phases?: number[] | null
          brand_id?: string | null
          candidate_source?: string
          cohort_id?: string | null
          composite_score?: number | null
          confidence?: number | null
          created_at?: string
          discovery_job_id?: string | null
          error_message?: string | null
          extraction_job_id?: string | null
          id?: string
          metadata?: Json
          normalized_domain?: string
          normalized_url?: string
          predicted_name?: string | null
          rank?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selection_status?: string
          selection_tier?: string | null
          sku?: string
          snippet?: string | null
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "official_brand_url_candidates_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_brand_url_candidates_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohort_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "official_brand_url_candidates_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_export_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "official_brand_url_candidates_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalized_review"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "official_brand_url_candidates_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalizing_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "official_brand_url_candidates_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_ingestion"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "official_brand_url_candidates_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_published"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          new_value: Json | null
          note: string | null
          order_id: string
          previous_value: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          new_value?: Json | null
          note?: string | null
          order_id: string
          previous_value?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          new_value?: Json | null
          note?: string | null
          order_id?: string
          previous_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          id: string
          item_id: string
          item_name: string
          item_slug: string
          item_type: string
          order_id: string
          preorder_batch_id: string | null
          quantity: number
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_id: string
          item_name: string
          item_slug: string
          item_type: string
          order_id: string
          preorder_batch_id?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          item_id?: string
          item_name?: string
          item_slug?: string
          item_type?: string
          order_id?: string
          preorder_batch_id?: string | null
          quantity?: number
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_preorder_batch_id_fkey"
            columns: ["preorder_batch_id"]
            isOneToOne: false
            referencedRelation: "preorder_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          error_message: string | null
          id: string
          metadata: Json | null
          order_id: string
          payment_method: string
          status: string
          stripe_charge_id: string | null
          stripe_event_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          order_id: string
          payment_method: string
          status?: string
          stripe_charge_id?: string | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          order_id?: string
          payment_method?: string
          status?: string
          stripe_charge_id?: string | null
          stripe_event_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_source_records: {
        Row: {
          external_created_at: string | null
          external_id: string | null
          external_order_number: string | null
          external_updated_at: string | null
          id: string
          imported_at: string
          normalized_payload: Json
          order_id: string | null
          payload_hash: string | null
          raw_payload: Json
          source_system: string
          source_type: Database["public"]["Enums"]["order_source_type"]
          sync_run_id: string | null
        }
        Insert: {
          external_created_at?: string | null
          external_id?: string | null
          external_order_number?: string | null
          external_updated_at?: string | null
          id?: string
          imported_at?: string
          normalized_payload?: Json
          order_id?: string | null
          payload_hash?: string | null
          raw_payload?: Json
          source_system: string
          source_type: Database["public"]["Enums"]["order_source_type"]
          sync_run_id?: string | null
        }
        Update: {
          external_created_at?: string | null
          external_id?: string | null
          external_order_number?: string | null
          external_updated_at?: string | null
          id?: string
          imported_at?: string
          normalized_payload?: Json
          order_id?: string | null
          payload_hash?: string | null
          raw_payload?: Json
          source_system?: string
          source_type?: Database["public"]["Enums"]["order_source_type"]
          sync_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_source_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_source_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_source_records_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "integration_sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          delivery_address_id: string | null
          delivery_distance_miles: number | null
          delivery_fee: number | null
          delivery_notes: string | null
          delivery_services: Json | null
          discount_amount: number | null
          external_created_at: string | null
          external_order_id: string | null
          fulfillment_method: string | null
          fulfillment_status: Database["public"]["Enums"]["order_fulfillment_status"]
          id: string
          imported_at: string | null
          notes: string | null
          order_number: string
          paid_at: string | null
          payment_method: string | null
          payment_status:
            | Database["public"]["Enums"]["order_payment_status"]
            | null
          promo_code: string | null
          promo_code_id: string | null
          refunded_amount: number | null
          source: string | null
          source_system: string | null
          source_type: Database["public"]["Enums"]["order_source_type"]
          status: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          tax: number | null
          total: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          delivery_address_id?: string | null
          delivery_distance_miles?: number | null
          delivery_fee?: number | null
          delivery_notes?: string | null
          delivery_services?: Json | null
          discount_amount?: number | null
          external_created_at?: string | null
          external_order_id?: string | null
          fulfillment_method?: string | null
          fulfillment_status?: Database["public"]["Enums"]["order_fulfillment_status"]
          id?: string
          imported_at?: string | null
          notes?: string | null
          order_number: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?:
            | Database["public"]["Enums"]["order_payment_status"]
            | null
          promo_code?: string | null
          promo_code_id?: string | null
          refunded_amount?: number | null
          source?: string | null
          source_system?: string | null
          source_type: Database["public"]["Enums"]["order_source_type"]
          status?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal: number
          tax?: number | null
          total: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          delivery_address_id?: string | null
          delivery_distance_miles?: number | null
          delivery_fee?: number | null
          delivery_notes?: string | null
          delivery_services?: Json | null
          discount_amount?: number | null
          external_created_at?: string | null
          external_order_id?: string | null
          fulfillment_method?: string | null
          fulfillment_status?: Database["public"]["Enums"]["order_fulfillment_status"]
          id?: string
          imported_at?: string | null
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?:
            | Database["public"]["Enums"]["order_payment_status"]
            | null
          promo_code?: string | null
          promo_code_id?: string | null
          refunded_amount?: number | null
          source?: string | null
          source_system?: string | null
          source_type?: Database["public"]["Enums"]["order_source_type"]
          status?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          tax?: number | null
          total?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_delivery_address_id_fkey"
            columns: ["delivery_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      orders_ingestion: {
        Row: {
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          data: Json | null
          items: Json | null
          order_date: string | null
          order_id: string
          order_number: string | null
          order_status: string | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          data?: Json | null
          items?: Json | null
          order_date?: string | null
          order_id: string
          order_number?: string | null
          order_status?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          data?: Json | null
          items?: Json | null
          order_date?: string | null
          order_id?: string
          order_number?: string | null
          order_status?: string | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      pages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_published: boolean | null
          meta_description: string | null
          meta_title: string | null
          slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          meta_description?: string | null
          meta_title?: string | null
          slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      pet_types: {
        Row: {
          created_at: string | null
          display_order: number | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      pipeline_audit_log: {
        Row: {
          actor_id: string | null
          actor_type: string
          created_at: string
          from_state: string | null
          id: string
          job_id: string
          job_type: string
          metadata: Json | null
          to_state: string
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          from_state?: string | null
          id?: string
          job_id: string
          job_type: string
          metadata?: Json | null
          to_state: string
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          created_at?: string
          from_state?: string | null
          id?: string
          job_id?: string
          job_type?: string
          metadata?: Json | null
          to_state?: string
        }
        Relationships: []
      }
      pipeline_retry_queue: {
        Row: {
          attempt_count: number
          created_at: string
          error_log: string[] | null
          id: string
          job_type: string
          last_attempt_at: string | null
          max_attempts: number
          next_attempt_at: string | null
          original_job_id: string
          priority: number
          requested_by: string | null
          retry_reason: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_log?: string[] | null
          id?: string
          job_type: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          original_job_id: string
          priority?: number
          requested_by?: string | null
          retry_reason: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_log?: string[] | null
          id?: string
          job_type?: string
          last_attempt_at?: string | null
          max_attempts?: number
          next_attempt_at?: string | null
          original_job_id?: string
          priority?: number
          requested_by?: string | null
          retry_reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      preorder_batches: {
        Row: {
          arrival_date: string
          capacity: number | null
          created_at: string | null
          display_order: number
          id: string
          is_active: boolean
          ordering_deadline: string | null
          preorder_group_id: string
          updated_at: string | null
        }
        Insert: {
          arrival_date: string
          capacity?: number | null
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          ordering_deadline?: string | null
          preorder_group_id: string
          updated_at?: string | null
        }
        Update: {
          arrival_date?: string
          capacity?: number | null
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          ordering_deadline?: string | null
          preorder_group_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "preorder_batches_preorder_group_id_fkey"
            columns: ["preorder_group_id"]
            isOneToOne: false
            referencedRelation: "preorder_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      preorder_groups: {
        Row: {
          created_at: string | null
          description: string | null
          display_copy: string | null
          id: string
          is_active: boolean
          minimum_quantity: number
          name: string
          pickup_only: boolean
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_copy?: string | null
          id?: string
          is_active?: boolean
          minimum_quantity?: number
          name: string
          pickup_only?: boolean
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_copy?: string | null
          id?: string
          is_active?: boolean
          minimum_quantity?: number
          name?: string
          pickup_only?: boolean
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      price_history: {
        Row: {
          compare_at_price: number | null
          id: string
          price: number
          product_id: string
          recorded_at: string | null
          variant_id: string | null
        }
        Insert: {
          compare_at_price?: number | null
          id?: string
          price: number
          product_id: string
          recorded_at?: string | null
          variant_id?: string | null
        }
        Update: {
          compare_at_price?: number | null
          id?: string
          price?: number
          product_id?: string
          recorded_at?: string | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_answers: {
        Row: {
          answer: string
          created_at: string | null
          helpful_count: number | null
          id: string
          is_official: boolean | null
          question_id: string
          user_id: string | null
        }
        Insert: {
          answer: string
          created_at?: string | null
          helpful_count?: number | null
          id?: string
          is_official?: boolean | null
          question_id: string
          user_id?: string | null
        }
        Update: {
          answer?: string
          created_at?: string | null
          helpful_count?: number | null
          id?: string
          is_official?: boolean | null
          question_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "product_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_answers_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          created_at: string | null
          id: string
          is_filterable: boolean | null
          key: string
          product_id: string
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_filterable?: boolean | null
          key: string
          product_id: string
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_filterable?: boolean | null
          key?: string
          product_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          product_id: string
          relationship_type: string
        }
        Insert: {
          category_id: string
          product_id: string
          relationship_type?: string
        }
        Update: {
          category_id?: string
          product_id?: string
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_facets: {
        Row: {
          created_at: string
          facet_value_id: string
          id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          facet_value_id: string
          id?: string
          product_id: string
        }
        Update: {
          created_at?: string
          facet_value_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_facets_facet_value_id_fkey"
            columns: ["facet_value_id"]
            isOneToOne: false
            referencedRelation: "facet_values"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_facets_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_group_products: {
        Row: {
          created_at: string | null
          display_label: string | null
          group_id: string
          is_default: boolean
          metadata: Json | null
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          display_label?: string | null
          group_id: string
          is_default?: boolean
          metadata?: Json | null
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          display_label?: string | null
          group_id?: string
          is_default?: boolean
          metadata?: Json | null
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_group_products_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "product_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_group_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_groups: {
        Row: {
          brand_id: string | null
          created_at: string | null
          default_product_id: string | null
          description: string | null
          hero_image_url: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          brand_id?: string | null
          created_at?: string | null
          default_product_id?: string | null
          description?: string | null
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          brand_id?: string | null
          created_at?: string | null
          default_product_id?: string | null
          description?: string | null
          hero_image_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_groups_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_groups_default_product_id_fkey"
            columns: ["default_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string | null
          height: number | null
          id: string
          is_primary: boolean | null
          position: number | null
          product_id: string
          storage_path: string | null
          url: string
          variant_id: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean | null
          position?: number | null
          product_id: string
          storage_path?: string | null
          url: string
          variant_id?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string | null
          height?: number | null
          id?: string
          is_primary?: boolean | null
          position?: number | null
          product_id?: string
          storage_path?: string | null
          url?: string
          variant_id?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          color_hex: string | null
          created_at: string | null
          id: string
          image_url: string | null
          option_id: string
          position: number | null
          value: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          option_id: string
          position?: number | null
          value: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          option_id?: string
          position?: number | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          created_at: string | null
          id: string
          name: string
          position: number | null
          product_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          position?: number | null
          product_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          position?: number | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_pet_types: {
        Row: {
          pet_type_id: string
          product_id: string
        }
        Insert: {
          pet_type_id: string
          product_id: string
        }
        Update: {
          pet_type_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_pet_types_pet_type_id_fkey"
            columns: ["pet_type_id"]
            isOneToOne: false
            referencedRelation: "pet_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_pet_types_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_preorder_groups: {
        Row: {
          created_at: string | null
          pickup_only_override: boolean | null
          preorder_group_id: string
          product_id: string
        }
        Insert: {
          created_at?: string | null
          pickup_only_override?: boolean | null
          preorder_group_id: string
          product_id: string
        }
        Update: {
          created_at?: string | null
          pickup_only_override?: boolean | null
          preorder_group_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_preorder_groups_preorder_group_id_fkey"
            columns: ["preorder_group_id"]
            isOneToOne: false
            referencedRelation: "preorder_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_preorder_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_questions: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          question: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          question: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          question?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_questions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_questions_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          cons: string[] | null
          content: string | null
          created_at: string | null
          helpful_count: number | null
          id: string
          is_verified_purchase: boolean | null
          product_id: string
          pros: string[] | null
          rating: number
          status: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cons?: string[] | null
          content?: string | null
          created_at?: string | null
          helpful_count?: number | null
          id?: string
          is_verified_purchase?: boolean | null
          product_id: string
          pros?: string[] | null
          rating: number
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cons?: string[] | null
          content?: string | null
          created_at?: string | null
          helpful_count?: number | null
          id?: string
          is_verified_purchase?: boolean | null
          product_id?: string
          pros?: string[] | null
          rating?: number
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_scraped_sites: {
        Row: {
          created_at: string | null
          error_message: string | null
          id: string
          last_scraped_at: string | null
          scraper_name: string
          sku: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_scraped_at?: string | null
          scraper_name: string
          sku: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          id?: string
          last_scraped_at?: string | null
          scraper_name?: string
          sku?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_scraped_sites_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_export_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_scraped_sites_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalized_review"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_scraped_sites_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "pipeline_finalizing_queue"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_scraped_sites_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_ingestion"
            referencedColumns: ["sku"]
          },
          {
            foreignKeyName: "product_scraped_sites_sku_fkey"
            columns: ["sku"]
            isOneToOne: false
            referencedRelation: "products_published"
            referencedColumns: ["id"]
          },
        ]
      }
      product_storefront_settings: {
        Row: {
          is_featured: boolean
          pickup_only: boolean
          product_id: string
        }
        Insert: {
          is_featured?: boolean
          pickup_only?: boolean
          product_id: string
        }
        Update: {
          is_featured?: boolean
          pickup_only?: boolean
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_storefront_settings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_tags: {
        Row: {
          product_id: string
          tag_id: string
        }
        Insert: {
          product_id: string
          tag_id: string
        }
        Update: {
          product_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_tags_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      product_types: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          barcode: string | null
          compare_at_price: number | null
          cost_price: number | null
          created_at: string | null
          id: string
          image_url: string | null
          is_default: boolean | null
          is_taxable: boolean | null
          option_values: Json | null
          price: number
          product_id: string
          quantity: number | null
          requires_shipping: boolean | null
          sku: string | null
          title: string | null
          updated_at: string | null
          weight: number | null
          weight_unit: string | null
        }
        Insert: {
          barcode?: string | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_default?: boolean | null
          is_taxable?: boolean | null
          option_values?: Json | null
          price: number
          product_id: string
          quantity?: number | null
          requires_shipping?: boolean | null
          sku?: string | null
          title?: string | null
          updated_at?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Update: {
          barcode?: string | null
          compare_at_price?: number | null
          cost_price?: number | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_default?: boolean | null
          is_taxable?: boolean | null
          option_values?: Json | null
          price?: number
          product_id?: string
          quantity?: number | null
          requires_shipping?: boolean | null
          sku?: string | null
          title?: string | null
          updated_at?: string | null
          weight?: number | null
          weight_unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          availability: string | null
          brand_id: string | null
          canonical_category_id: string | null
          created_at: string
          date_counted: string | null
          date_created: string | null
          date_priced: string | null
          date_received: string | null
          date_sold: string | null
          description: string | null
          gtin: string | null
          id: string
          images: string[]
          in_store_pickup: boolean
          is_special_order: boolean
          is_taxable: boolean
          low_stock_threshold: number
          minimum_quantity: number
          name: string
          price: number
          published_at: string | null
          quantity: number
          search_keywords: string | null
          shopsite_cost: number | null
          shopsite_last_sync_error: string | null
          shopsite_last_synced_at: string | null
          shopsite_pages: Json
          shopsite_product_type: string | null
          shopsite_sync_status: string
          short_name: string | null
          sku: string | null
          slug: string
          stock_status: string
          upc: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          availability?: string | null
          brand_id?: string | null
          canonical_category_id?: string | null
          created_at?: string
          date_counted?: string | null
          date_created?: string | null
          date_priced?: string | null
          date_received?: string | null
          date_sold?: string | null
          description?: string | null
          gtin?: string | null
          id?: string
          images?: string[]
          in_store_pickup?: boolean
          is_special_order?: boolean
          is_taxable?: boolean
          low_stock_threshold?: number
          minimum_quantity?: number
          name: string
          price: number
          published_at?: string | null
          quantity?: number
          search_keywords?: string | null
          shopsite_cost?: number | null
          shopsite_last_sync_error?: string | null
          shopsite_last_synced_at?: string | null
          shopsite_pages?: Json
          shopsite_product_type?: string | null
          shopsite_sync_status?: string
          short_name?: string | null
          sku?: string | null
          slug: string
          stock_status?: string
          upc?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          availability?: string | null
          brand_id?: string | null
          canonical_category_id?: string | null
          created_at?: string
          date_counted?: string | null
          date_created?: string | null
          date_priced?: string | null
          date_received?: string | null
          date_sold?: string | null
          description?: string | null
          gtin?: string | null
          id?: string
          images?: string[]
          in_store_pickup?: boolean
          is_special_order?: boolean
          is_taxable?: boolean
          low_stock_threshold?: number
          minimum_quantity?: number
          name?: string
          price?: number
          published_at?: string | null
          quantity?: number
          search_keywords?: string | null
          shopsite_cost?: number | null
          shopsite_last_sync_error?: string | null
          shopsite_last_synced_at?: string | null
          shopsite_pages?: Json
          shopsite_product_type?: string | null
          shopsite_sync_status?: string
          short_name?: string | null
          sku?: string | null
          slug?: string
          stock_status?: string
          upc?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_canonical_category_id_fkey"
            columns: ["canonical_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      products_ingestion: {
        Row: {
          active_consolidation_review_id: string | null
          b2b_sources: Json | null
          brand_id: string | null
          cohort_id: string | null
          confidence_score: number | null
          consolidated: Json | null
          consolidation_review_status: string
          consolidation_review_updated_at: string | null
          created_at: string | null
          enrichment_config: Json | null
          error_message: string | null
          exported_at: string | null
          fallback_metadata: Json | null
          image_candidates: string[] | null
          input: Json | null
          is_test_run: boolean | null
          pipeline_status: Database["public"]["Enums"]["pipeline_status_five"]
          product_line: string | null
          retry_count: number | null
          scrape_quality: Json | null
          selected_images: Json | null
          sku: string
          sources: Json | null
          updated_at: string | null
        }
        Insert: {
          active_consolidation_review_id?: string | null
          b2b_sources?: Json | null
          brand_id?: string | null
          cohort_id?: string | null
          confidence_score?: number | null
          consolidated?: Json | null
          consolidation_review_status?: string
          consolidation_review_updated_at?: string | null
          created_at?: string | null
          enrichment_config?: Json | null
          error_message?: string | null
          exported_at?: string | null
          fallback_metadata?: Json | null
          image_candidates?: string[] | null
          input?: Json | null
          is_test_run?: boolean | null
          pipeline_status?: Database["public"]["Enums"]["pipeline_status_five"]
          product_line?: string | null
          retry_count?: number | null
          scrape_quality?: Json | null
          selected_images?: Json | null
          sku: string
          sources?: Json | null
          updated_at?: string | null
        }
        Update: {
          active_consolidation_review_id?: string | null
          b2b_sources?: Json | null
          brand_id?: string | null
          cohort_id?: string | null
          confidence_score?: number | null
          consolidated?: Json | null
          consolidation_review_status?: string
          consolidation_review_updated_at?: string | null
          created_at?: string | null
          enrichment_config?: Json | null
          error_message?: string | null
          exported_at?: string | null
          fallback_metadata?: Json | null
          image_candidates?: string[] | null
          input?: Json | null
          is_test_run?: boolean | null
          pipeline_status?: Database["public"]["Enums"]["pipeline_status_five"]
          product_line?: string | null
          retry_count?: number | null
          scrape_quality?: Json | null
          selected_images?: Json | null
          sku?: string
          sources?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_ingestion_active_consolidation_review_id_fkey"
            columns: ["active_consolidation_review_id"]
            isOneToOne: false
            referencedRelation: "consolidation_review_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_ingestion_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_ingestion_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohort_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          first_order_at: string | null
          first_order_completed: boolean | null
          full_name: string | null
          id: string
          legacy_customer_id: string | null
          phone: string | null
          preferences: Json | null
          role: string
          shopsite_data: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          first_order_at?: string | null
          first_order_completed?: boolean | null
          full_name?: string | null
          id: string
          legacy_customer_id?: string | null
          phone?: string | null
          preferences?: Json | null
          role?: string
          shopsite_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          first_order_at?: string | null
          first_order_completed?: boolean | null
          full_name?: string | null
          id?: string
          legacy_customer_id?: string | null
          phone?: string | null
          preferences?: Json | null
          role?: string
          shopsite_data?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          current_uses: number | null
          description: string | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          first_order_only: boolean | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          max_uses_per_user: number | null
          maximum_discount: number | null
          minimum_order: number | null
          requires_account: boolean | null
          starts_at: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type: string
          discount_value: number
          expires_at?: string | null
          first_order_only?: boolean | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          max_uses_per_user?: number | null
          maximum_discount?: number | null
          minimum_order?: number | null
          requires_account?: boolean | null
          starts_at?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          current_uses?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          first_order_only?: boolean | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          max_uses_per_user?: number | null
          maximum_discount?: number | null
          minimum_order?: number | null
          requires_account?: boolean | null
          starts_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          created_at: string | null
          discount_applied: number
          guest_email: string | null
          id: string
          order_id: string | null
          promo_code_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          discount_applied: number
          guest_email?: string | null
          id?: string
          order_id?: string | null
          promo_code_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          discount_applied?: number
          guest_email?: string | null
          id?: string
          order_id?: string | null
          promo_code_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      recently_viewed: {
        Row: {
          product_id: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          product_id: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          product_id?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recently_viewed_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      related_products: {
        Row: {
          created_at: string | null
          position: number | null
          product_id: string
          related_product_id: string
          relation_type: string | null
        }
        Insert: {
          created_at?: string | null
          position?: number | null
          product_id: string
          related_product_id: string
          relation_type?: string | null
        }
        Update: {
          created_at?: string | null
          position?: number | null
          product_id?: string
          related_product_id?: string
          relation_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "related_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "related_products_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      review_helpful_votes: {
        Row: {
          created_at: string | null
          is_helpful: boolean
          review_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          is_helpful: boolean
          review_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          is_helpful?: boolean
          review_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_helpful_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "product_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      runner_api_keys: {
        Row: {
          allowed_scrapers: string[] | null
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          revoked_at: string | null
          runner_name: string
        }
        Insert: {
          allowed_scrapers?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          revoked_at?: string | null
          runner_name: string
        }
        Update: {
          allowed_scrapers?: string[] | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          revoked_at?: string | null
          runner_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "runner_api_keys_runner_name_fkey"
            columns: ["runner_name"]
            isOneToOne: false
            referencedRelation: "scraper_runners"
            referencedColumns: ["name"]
          },
        ]
      }
      scrape_results: {
        Row: {
          created_at: string
          data: Json
          id: string
          job_id: string
          runner_name: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          job_id: string
          runner_name?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          job_id?: string
          runner_name?: string | null
        }
        Relationships: []
      }
      scraper_config_test_skus: {
        Row: {
          added_by: string | null
          config_id: string
          created_at: string
          id: string
          sku: string
          sku_type: string
        }
        Insert: {
          added_by?: string | null
          config_id: string
          created_at?: string
          id?: string
          sku: string
          sku_type: string
        }
        Update: {
          added_by?: string | null
          config_id?: string
          created_at?: string
          id?: string
          sku?: string
          sku_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_config_test_skus_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_scraper_stats"
            referencedColumns: ["config_id"]
          },
          {
            foreignKeyName: "scraper_config_test_skus_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "scraper_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_config_versions: {
        Row: {
          ai_config: Json | null
          anti_detection: Json | null
          change_summary: string | null
          config_id: string
          created_at: string
          created_by: string | null
          http_status_config: Json | null
          id: string
          image_quality: number | null
          login_config: Json | null
          normalization_config: Json | null
          published_at: string | null
          published_by: string | null
          retries: number | null
          schema_version: string
          status: string
          timeout: number | null
          validation_config: Json | null
          validation_result: Json | null
          version_number: number
        }
        Insert: {
          ai_config?: Json | null
          anti_detection?: Json | null
          change_summary?: string | null
          config_id: string
          created_at?: string
          created_by?: string | null
          http_status_config?: Json | null
          id?: string
          image_quality?: number | null
          login_config?: Json | null
          normalization_config?: Json | null
          published_at?: string | null
          published_by?: string | null
          retries?: number | null
          schema_version: string
          status?: string
          timeout?: number | null
          validation_config?: Json | null
          validation_result?: Json | null
          version_number: number
        }
        Update: {
          ai_config?: Json | null
          anti_detection?: Json | null
          change_summary?: string | null
          config_id?: string
          created_at?: string
          created_by?: string | null
          http_status_config?: Json | null
          id?: string
          image_quality?: number | null
          login_config?: Json | null
          normalization_config?: Json | null
          published_at?: string | null
          published_by?: string | null
          retries?: number | null
          schema_version?: string
          status?: string
          timeout?: number | null
          validation_config?: Json | null
          validation_result?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_config_id"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_scraper_stats"
            referencedColumns: ["config_id"]
          },
          {
            foreignKeyName: "fk_config_id"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "scraper_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_configs: {
        Row: {
          base_url: string | null
          created_at: string
          created_by: string | null
          current_version_id: string | null
          display_name: string
          domain: string | null
          health_score: number | null
          health_status: string | null
          id: string
          last_test_at: string | null
          schema_version: string
          scraper_type: string
          slug: string
          status: string | null
          updated_at: string
        }
        Insert: {
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          display_name: string
          domain?: string | null
          health_score?: number | null
          health_status?: string | null
          id?: string
          last_test_at?: string | null
          schema_version?: string
          scraper_type?: string
          slug: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          base_url?: string | null
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          display_name?: string
          domain?: string | null
          health_score?: number | null
          health_status?: string | null
          id?: string
          last_test_at?: string | null
          schema_version?: string
          scraper_type?: string
          slug?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "scraper_config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_credentials: {
        Row: {
          auth_tag: string
          created_at: string
          credential_type: string
          encrypted_value: string
          id: string
          iv: string
          key_version: number
          scraper_slug: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auth_tag: string
          created_at?: string
          credential_type: string
          encrypted_value: string
          id?: string
          iv: string
          key_version?: number
          scraper_slug: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auth_tag?: string
          created_at?: string
          credential_type?: string
          encrypted_value?: string
          id?: string
          iv?: string
          key_version?: number
          scraper_slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      scraper_health_metrics: {
        Row: {
          avg_duration_ms: number | null
          config_id: string
          created_at: string
          failed_runs: number
          id: string
          metric_date: string
          passed_runs: number
          selector_health: Json | null
          top_failing_step: string | null
          total_runs: number
          updated_at: string
        }
        Insert: {
          avg_duration_ms?: number | null
          config_id: string
          created_at?: string
          failed_runs?: number
          id?: string
          metric_date: string
          passed_runs?: number
          selector_health?: Json | null
          top_failing_step?: string | null
          total_runs?: number
          updated_at?: string
        }
        Update: {
          avg_duration_ms?: number | null
          config_id?: string
          created_at?: string
          failed_runs?: number
          id?: string
          metric_date?: string
          passed_runs?: number
          selector_health?: Json | null
          top_failing_step?: string | null
          total_runs?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_health_metrics_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "ai_scraper_stats"
            referencedColumns: ["config_id"]
          },
          {
            foreignKeyName: "scraper_health_metrics_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "scraper_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_runners: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          current_job_id: string | null
          enabled: boolean
          jobs_completed: number | null
          last_auth_at: string | null
          last_seen_at: string | null
          memory_usage_mb: number | null
          metadata: Json | null
          name: string
          status: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          current_job_id?: string | null
          enabled?: boolean
          jobs_completed?: number | null
          last_auth_at?: string | null
          last_seen_at?: string | null
          memory_usage_mb?: number | null
          metadata?: Json | null
          name: string
          status?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          current_job_id?: string | null
          enabled?: boolean
          jobs_completed?: number | null
          last_auth_at?: string | null
          last_seen_at?: string | null
          memory_usage_mb?: number | null
          metadata?: Json | null
          name?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraper_runners_current_job_id_fkey"
            columns: ["current_job_id"]
            isOneToOne: false
            referencedRelation: "enrichment_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_selectors: {
        Row: {
          attribute: string | null
          created_at: string
          id: string
          multiple: boolean | null
          name: string
          required: boolean | null
          selector: string
          sort_order: number
          version_id: string
        }
        Insert: {
          attribute?: string | null
          created_at?: string
          id?: string
          multiple?: boolean | null
          name: string
          required?: boolean | null
          selector: string
          sort_order?: number
          version_id: string
        }
        Update: {
          attribute?: string | null
          created_at?: string
          id?: string
          multiple?: boolean | null
          name?: string
          required?: boolean | null
          selector?: string
          sort_order?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_selectors_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "scraper_config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_workflow_steps: {
        Row: {
          action: string
          created_at: string
          id: string
          name: string | null
          params: Json | null
          sort_order: number
          version_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          name?: string | null
          params?: Json | null
          sort_order?: number
          version_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          name?: string | null
          params?: Json | null
          sort_order?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_workflow_steps_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "scraper_config_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      service_costs: {
        Row: {
          billing_cycle: string
          category: string
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          monthly_cost: number
          notes: string | null
          service: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          category?: string
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          monthly_cost?: number
          notes?: string | null
          service: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          category?: string
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          monthly_cost?: number
          notes?: string | null
          service?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          price: number | null
          slug: string
          unit: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          price?: number | null
          slug: string
          unit?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          price?: number | null
          slug?: string
          unit?: string | null
        }
        Relationships: []
      }
      shopsite_product_sync: {
        Row: {
          created_at: string
          external_source_id: string
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          last_uploaded_at: string | null
          metadata: Json
          product_id: string
          sync_status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_source_id: string
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          last_uploaded_at?: string | null
          metadata?: Json
          product_id: string
          sync_status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_source_id?: string
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          last_uploaded_at?: string | null
          metadata?: Json
          product_id?: string
          sync_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopsite_product_sync_external_source_id_fkey"
            columns: ["external_source_id"]
            isOneToOne: false
            referencedRelation: "external_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopsite_product_sync_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: Json
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          error_message: string | null
          event_id: string
          event_type: string
          order_id: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          status: string
          stripe_object_id: string | null
        }
        Insert: {
          error_message?: string | null
          event_id: string
          event_type: string
          order_id?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
          status?: string
          stripe_object_id?: string | null
        }
        Update: {
          error_message?: string | null
          event_id?: string
          event_type?: string
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          status?: string
          stripe_object_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stripe_webhook_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_orders_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_webhook_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          subscription_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id: string
          quantity?: number
          subscription_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_items_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_suggestions: {
        Row: {
          created_at: string | null
          id: string
          is_dismissed: boolean | null
          pet_id: string | null
          product_id: string
          reason: string | null
          subscription_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          pet_id?: string | null
          product_id: string
          reason?: string | null
          subscription_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_dismissed?: boolean | null
          pet_id?: string | null
          product_id?: string
          reason?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_suggestions_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "user_pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_suggestions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_suggestions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          frequency: string
          id: string
          last_order_date: string | null
          name: string
          next_order_date: string
          notes: string | null
          shipping_address_id: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          frequency: string
          id?: string
          last_order_date?: string | null
          name?: string
          next_order_date: string
          notes?: string | null
          shipping_address_id?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          frequency?: string
          id?: string
          last_order_date?: string | null
          name?: string
          next_order_date?: string
          notes?: string | null
          shipping_address_id?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_shipping_address_id_fkey"
            columns: ["shipping_address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          revoked_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_pets: {
        Row: {
          activity_level: string | null
          birth_date: string | null
          breed: string | null
          created_at: string | null
          dietary_notes: string | null
          gender: string | null
          id: string
          is_fixed: boolean | null
          life_stage: string | null
          name: string
          pet_type_id: string
          size_class: string | null
          special_needs: string[] | null
          updated_at: string | null
          user_id: string
          weight_lbs: number | null
        }
        Insert: {
          activity_level?: string | null
          birth_date?: string | null
          breed?: string | null
          created_at?: string | null
          dietary_notes?: string | null
          gender?: string | null
          id?: string
          is_fixed?: boolean | null
          life_stage?: string | null
          name: string
          pet_type_id: string
          size_class?: string | null
          special_needs?: string[] | null
          updated_at?: string | null
          user_id: string
          weight_lbs?: number | null
        }
        Update: {
          activity_level?: string | null
          birth_date?: string | null
          breed?: string | null
          created_at?: string | null
          dietary_notes?: string | null
          gender?: string | null
          id?: string
          is_fixed?: boolean | null
          life_stage?: string | null
          name?: string
          pet_type_id?: string
          size_class?: string | null
          special_needs?: string[] | null
          updated_at?: string | null
          user_id?: string
          weight_lbs?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_pets_pet_type_id_fkey"
            columns: ["pet_type_id"]
            isOneToOne: false
            referencedRelation: "pet_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_pets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          billing_address: Json | null
          credits: number | null
          full_name: string | null
          headline: string | null
          id: string
          is_admin: boolean
          linkedin: string | null
          location: string | null
          payment_method: Json | null
          phone: string | null
          stripe_customer_id: string | null
          subscription_status: string | null
          summary: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          billing_address?: Json | null
          credits?: number | null
          full_name?: string | null
          headline?: string | null
          id: string
          is_admin?: boolean
          linkedin?: string | null
          location?: string | null
          payment_method?: Json | null
          phone?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          summary?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          billing_address?: Json | null
          credits?: number | null
          full_name?: string | null
          headline?: string | null
          id?: string
          is_admin?: boolean
          linkedin?: string | null
          location?: string | null
          payment_method?: Json | null
          phone?: string | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          summary?: string | null
          website?: string | null
        }
        Relationships: []
      }
      wishlists: {
        Row: {
          created_at: string | null
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlists_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_orders_list: {
        Row: {
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          external_order_id: string | null
          fulfillment_method: string | null
          fulfillment_status:
            | Database["public"]["Enums"]["order_fulfillment_status"]
            | null
          id: string | null
          item_count: number | null
          order_number: string | null
          payment_method: string | null
          payment_status:
            | Database["public"]["Enums"]["order_payment_status"]
            | null
          source_system: string | null
          source_type: Database["public"]["Enums"]["order_source_type"] | null
          status: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          total_quantity: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      ai_scraper_stats: {
        Row: {
          confidence_threshold: number | null
          config_id: string | null
          created_at: string | null
          display_name: string | null
          llm_model: string | null
          max_steps: number | null
          published_at: string | null
          scraper_type: string | null
          slug: string | null
          status: string | null
          version_number: number | null
        }
        Relationships: []
      }
      dashboard_inventory_reconciliation_stats: {
        Row: {
          last_issue_created_at: string | null
          open_issues: number | null
          price_mismatches: number | null
          quantity_mismatches: number | null
          register_only_products: number | null
        }
        Relationships: []
      }
      dashboard_migration_progress: {
        Row: {
          month: string | null
          order_count: number | null
          source_type: Database["public"]["Enums"]["order_source_type"] | null
        }
        Relationships: []
      }
      dashboard_order_stats: {
        Row: {
          open_orders: number | null
          ready_for_pickup: number | null
          today_order_count: number | null
          today_register_orders: number | null
          today_sales: number | null
          today_web_orders: number | null
          unpaid_orders: number | null
        }
        Relationships: []
      }
      dashboard_product_stats: {
        Row: {
          last_updated: string | null
          low_stock_count: number | null
          out_of_stock_count: number | null
          published_count: number | null
          total_count: number | null
        }
        Relationships: []
      }
      dashboard_scraper_stats: {
        Row: {
          active_jobs: number | null
          completed_jobs: number | null
          failed_jobs: number | null
          last_job_created: string | null
          total_jobs: number | null
        }
        Relationships: []
      }
      pipeline_export_queue: {
        Row: {
          b2b_sources: Json | null
          cohort_id: string | null
          confidence_score: number | null
          consolidated: Json | null
          created_at: string | null
          enrichment_config: Json | null
          error_message: string | null
          exported_at: string | null
          image_candidates: string[] | null
          input: Json | null
          is_test_run: boolean | null
          pipeline_status:
            | Database["public"]["Enums"]["pipeline_status_five"]
            | null
          product_line: string | null
          retry_count: number | null
          selected_images: Json | null
          sku: string | null
          sources: Json | null
          updated_at: string | null
        }
        Insert: {
          b2b_sources?: Json | null
          cohort_id?: string | null
          confidence_score?: number | null
          consolidated?: Json | null
          created_at?: string | null
          enrichment_config?: Json | null
          error_message?: string | null
          exported_at?: string | null
          image_candidates?: string[] | null
          input?: Json | null
          is_test_run?: boolean | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status_five"]
            | null
          product_line?: string | null
          retry_count?: number | null
          selected_images?: Json | null
          sku?: string | null
          sources?: Json | null
          updated_at?: string | null
        }
        Update: {
          b2b_sources?: Json | null
          cohort_id?: string | null
          confidence_score?: number | null
          consolidated?: Json | null
          created_at?: string | null
          enrichment_config?: Json | null
          error_message?: string | null
          exported_at?: string | null
          image_candidates?: string[] | null
          input?: Json | null
          is_test_run?: boolean | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status_five"]
            | null
          product_line?: string | null
          retry_count?: number | null
          selected_images?: Json | null
          sku?: string | null
          sources?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_ingestion_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohort_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_finalized_review: {
        Row: {
          b2b_sources: Json | null
          cohort_id: string | null
          confidence_score: number | null
          consolidated: Json | null
          created_at: string | null
          enrichment_config: Json | null
          error_message: string | null
          exported_at: string | null
          image_candidates: string[] | null
          input: Json | null
          is_test_run: boolean | null
          pipeline_status:
            | Database["public"]["Enums"]["pipeline_status_five"]
            | null
          product_line: string | null
          retry_count: number | null
          selected_images: Json | null
          sku: string | null
          sources: Json | null
          updated_at: string | null
        }
        Insert: {
          b2b_sources?: Json | null
          cohort_id?: string | null
          confidence_score?: number | null
          consolidated?: Json | null
          created_at?: string | null
          enrichment_config?: Json | null
          error_message?: string | null
          exported_at?: string | null
          image_candidates?: string[] | null
          input?: Json | null
          is_test_run?: boolean | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status_five"]
            | null
          product_line?: string | null
          retry_count?: number | null
          selected_images?: Json | null
          sku?: string | null
          sources?: Json | null
          updated_at?: string | null
        }
        Update: {
          b2b_sources?: Json | null
          cohort_id?: string | null
          confidence_score?: number | null
          consolidated?: Json | null
          created_at?: string | null
          enrichment_config?: Json | null
          error_message?: string | null
          exported_at?: string | null
          image_candidates?: string[] | null
          input?: Json | null
          is_test_run?: boolean | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status_five"]
            | null
          product_line?: string | null
          retry_count?: number | null
          selected_images?: Json | null
          sku?: string | null
          sources?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_ingestion_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohort_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_finalizing_queue: {
        Row: {
          b2b_sources: Json | null
          cohort_id: string | null
          confidence_score: number | null
          consolidated: Json | null
          created_at: string | null
          enrichment_config: Json | null
          error_message: string | null
          exported_at: string | null
          image_candidates: string[] | null
          input: Json | null
          is_test_run: boolean | null
          pipeline_status:
            | Database["public"]["Enums"]["pipeline_status_five"]
            | null
          product_line: string | null
          retry_count: number | null
          selected_images: Json | null
          sku: string | null
          sources: Json | null
          updated_at: string | null
        }
        Insert: {
          b2b_sources?: Json | null
          cohort_id?: string | null
          confidence_score?: number | null
          consolidated?: Json | null
          created_at?: string | null
          enrichment_config?: Json | null
          error_message?: string | null
          exported_at?: string | null
          image_candidates?: string[] | null
          input?: Json | null
          is_test_run?: boolean | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status_five"]
            | null
          product_line?: string | null
          retry_count?: number | null
          selected_images?: Json | null
          sku?: string | null
          sources?: Json | null
          updated_at?: string | null
        }
        Update: {
          b2b_sources?: Json | null
          cohort_id?: string | null
          confidence_score?: number | null
          consolidated?: Json | null
          created_at?: string | null
          enrichment_config?: Json | null
          error_message?: string | null
          exported_at?: string | null
          image_candidates?: string[] | null
          input?: Json | null
          is_test_run?: boolean | null
          pipeline_status?:
            | Database["public"]["Enums"]["pipeline_status_five"]
            | null
          product_line?: string | null
          retry_count?: number | null
          selected_images?: Json | null
          sku?: string | null
          sources?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_ingestion_cohort_id_fkey"
            columns: ["cohort_id"]
            isOneToOne: false
            referencedRelation: "cohort_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      products_published: {
        Row: {
          brand_id: string | null
          brand_logo_url: string | null
          brand_name: string | null
          brand_slug: string | null
          created_at: string | null
          description: string | null
          id: string | null
          images: Json | null
          is_featured: boolean | null
          name: string | null
          pipeline_status:
            | Database["public"]["Enums"]["pipeline_status_five"]
            | null
          price: number | null
          slug: string | null
          stock_status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_migrate_data: {
        Args: {
          edu_data: Json
          profile_data: Json
          project_data: Json
          skill_data: Json
          target_user_id: string
          user_email: string
          work_data: Json
        }
        Returns: undefined
      }
      calculate_scraper_health: {
        Args: { p_scraper_id: string }
        Returns: {
          health_score: number
          health_status: string
        }[]
      }
      claim_next_pending_enrichment_attempt: {
        Args: { p_claim_duration_minutes?: number; p_runner_name: string }
        Returns: Json
      }
      exec_sql: { Args: { query: string }; Returns: Json }
      generate_subscription_suggestions: {
        Args: { p_subscription_id: string }
        Returns: undefined
      }
      get_action_required_items: {
        Args: never
        Returns: {
          category: string
          count: number
          href: string
          label: string
          severity: string
        }[]
      }
      get_ai_cost_stats: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: {
          avg_cost_per_run: number
          total_cost: number
          total_input_tokens: number
          total_output_tokens: number
          total_runs: number
        }[]
      }
      get_dashboard_recent_activity: {
        Args: { limit_count?: number }
        Returns: {
          activity_timestamp: string
          description: string
          href: string
          id: string
          status: string
          title: string
          type: string
        }[]
      }
      get_inventory_drift: {
        Args: { p_days?: number }
        Returns: {
          after_value: string
          before_value: string
          field: string
          name: string
          sku: string
          sync_at: string
        }[]
      }
      get_job_retry_history: {
        Args: { p_job_id: string; p_job_type: string }
        Returns: {
          attempt_count: number
          created_at: string
          error_log: string[]
          last_attempt_at: string
          retry_id: string
          retry_reason: string
          status: string
        }[]
      }
      get_next_version_number: {
        Args: { p_config_id: string }
        Returns: number
      }
      get_pending_image_retries: {
        Args: { p_limit?: number }
        Returns: {
          error_type: Database["public"]["Enums"]["image_error_type"]
          image_url: string
          last_error: string
          max_retries: number
          retry_count: number
          retry_id: string
          sku: string
        }[]
      }
      get_pending_retries: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          job_type: string
          original_job_id: string
          priority: number
          retry_id: string
          retry_reason: string
        }[]
      }
      get_personalized_products: {
        Args: { result_limit?: number; user_uuid: string }
        Returns: {
          brand_id: string
          id: string
          images: string[]
          name: string
          pet_name: string
          pet_type_name: string
          price: number
          slug: string
          stock_status: string
        }[]
      }
      get_pipeline_stage_sources: {
        Args: { p_stage_status: string }
        Returns: {
          source_key: string
        }[]
      }
      get_pipeline_status_counts: {
        Args: never
        Returns: {
          count: number
          status: string
        }[]
      }
      get_product_image_retry_history: {
        Args: { p_sku: string }
        Returns: {
          created_at: string
          error_type: Database["public"]["Enums"]["image_error_type"]
          image_url: string
          retry_count: number
          retry_id: string
          status: Database["public"]["Enums"]["image_retry_status"]
          updated_at: string
        }[]
      }
      get_products_for_pet_types: {
        Args: { pet_type_ids: string[] }
        Returns: {
          brand_id: string
          id: string
          images: string[]
          name: string
          pet_type_id: string
          price: number
          slug: string
          stock_status: string
        }[]
      }
      get_sales_metrics: {
        Args: { end_date: string; p_source?: string; start_date: string }
        Returns: {
          average_order_value: number
          total_orders: number
          total_revenue: number
          total_tax: number
        }[]
      }
      get_sales_trends: {
        Args: {
          end_date: string
          p_source?: string
          period?: string
          start_date: string
        }
        Returns: {
          orders: number
          period_date: string
          revenue: number
        }[]
      }
      get_store_analytics: {
        Args: { end_date: string; start_date: string }
        Returns: Json
      }
      get_sync_health: {
        Args: { p_days?: number }
        Returns: {
          created: number
          duration_ms: number
          failed: number
          processed: number
          started_at: string
          status: string
          sync_type: string
          updated: number
        }[]
      }
      insert_scraper_test_run: {
        Args: {
          p_scraper_id: string
          p_skus_tested: string[]
          p_test_type: string
        }
        Returns: string
      }
      is_admin: { Args: never; Returns: boolean }
      is_source_enabled: {
        Args: { p_sku: string; p_source_id: string }
        Returns: boolean
      }
      is_staff: { Args: never; Returns: boolean }
      merge_enrichment_attempt_result: {
        Args: {
          p_attempt_id: string
          p_confidence: number
          p_job_id: string
          p_sku: string
          p_source_data: Json
          p_source_url: string
          p_status: string
        }
        Returns: undefined
      }
      update_enrichment_job_counters: {
        Args: { p_job_id: string }
        Returns: undefined
      }
      update_health_metrics: { Args: never; Returns: undefined }
      update_scraper_test_run: {
        Args: {
          p_duration_ms?: number
          p_error_message?: string
          p_id: string
          p_results?: Json
          p_status: string
        }
        Returns: undefined
      }
      upsert_recently_viewed: {
        Args: { p_product_id: string; p_user_id: string }
        Returns: undefined
      }
      validate_ai_config: {
        Args: { config: Json }
        Returns: {
          errors: string[]
          valid: boolean
        }[]
      }
      validate_runner_api_key: {
        Args: { api_key: string }
        Returns: {
          allowed_scrapers: string[]
          is_valid: boolean
          key_id: string
          runner_name: string
        }[]
      }
      validate_user_api_key: {
        Args: { api_key: string }
        Returns: {
          is_valid: boolean
          key_id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }[]
      }
    }
    Enums: {
      ai_provider_type:
        | "deepseek"
        | "openai"
        | "openai_compatible"
        | "gemini"
        | "lmstudio"
      image_error_type:
        | "auth_401"
        | "not_found_404"
        | "network_timeout"
        | "cors_blocked"
        | "unknown"
      image_retry_status: "pending" | "processing" | "completed" | "failed"
      inventory_reconciliation_issue_type:
        | "register_only"
        | "website_only"
        | "price_mismatch"
        | "quantity_mismatch"
        | "stock_status_mismatch"
        | "duplicate_sku"
        | "invalid_row"
      inventory_reconciliation_status:
        | "open"
        | "ignored"
        | "resolved"
        | "pushed_to_pipeline"
      order_fulfillment_status:
        | "unfulfilled"
        | "reserved"
        | "ready_for_pickup"
        | "out_for_delivery"
        | "fulfilled"
        | "partially_fulfilled"
        | "cancelled"
      order_payment_status:
        | "unpaid"
        | "authorized"
        | "paid"
        | "failed"
        | "partially_refunded"
        | "refunded"
        | "voided"
      order_source_type: "web" | "shopsite" | "integra" | "manual" | "import"
      pipeline_status_five:
        | "awaiting_brand"
        | "imported"
        | "extracting"
        | "processed"
        | "merging"
        | "reviewing"
        | "publishing"
        | "failed"
      pipeline_status_five_legacy:
        | "imported"
        | "searching"
        | "url_review"
        | "scraping"
        | "extracting"
        | "scraped"
        | "consolidating"
        | "finalizing"
        | "exporting"
        | "failed"
        | "needs_fallback_review"
      pipeline_status_new_enum: "registered" | "enriched" | "finalized"
      user_role: "admin" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_provider_type: [
        "deepseek",
        "openai",
        "openai_compatible",
        "gemini",
        "lmstudio",
      ],
      image_error_type: [
        "auth_401",
        "not_found_404",
        "network_timeout",
        "cors_blocked",
        "unknown",
      ],
      image_retry_status: ["pending", "processing", "completed", "failed"],
      inventory_reconciliation_issue_type: [
        "register_only",
        "website_only",
        "price_mismatch",
        "quantity_mismatch",
        "stock_status_mismatch",
        "duplicate_sku",
        "invalid_row",
      ],
      inventory_reconciliation_status: [
        "open",
        "ignored",
        "resolved",
        "pushed_to_pipeline",
      ],
      order_fulfillment_status: [
        "unfulfilled",
        "reserved",
        "ready_for_pickup",
        "out_for_delivery",
        "fulfilled",
        "partially_fulfilled",
        "cancelled",
      ],
      order_payment_status: [
        "unpaid",
        "authorized",
        "paid",
        "failed",
        "partially_refunded",
        "refunded",
        "voided",
      ],
      order_source_type: ["web", "shopsite", "integra", "manual", "import"],
      pipeline_status_five: [
        "awaiting_brand",
        "imported",
        "extracting",
        "processed",
        "merging",
        "reviewing",
        "publishing",
        "failed",
      ],
      pipeline_status_five_legacy: [
        "imported",
        "searching",
        "url_review",
        "scraping",
        "extracting",
        "scraped",
        "consolidating",
        "finalizing",
        "exporting",
        "failed",
        "needs_fallback_review",
      ],
      pipeline_status_new_enum: ["registered", "enriched", "finalized"],
      user_role: ["admin", "staff"],
    },
  },
} as const

