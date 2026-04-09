export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
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
          failed_requests: number | null
          failed_skus: string[] | null
          id: string
          input_file_id: string | null
          max_retries: number | null
          metadata: Json | null
          openai_batch_id: string | null
          output_file_id: string | null
          parent_batch_id: string | null
          provider: string
          provider_batch_id: string | null
          provider_error_file_id: string | null
          provider_input_file_id: string | null
          provider_output_file_id: string | null
          prompt_tokens: number | null
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
          failed_requests?: number | null
          failed_skus?: string[] | null
          id?: string
          input_file_id?: string | null
          max_retries?: number | null
          metadata?: Json | null
          openai_batch_id?: string | null
          output_file_id?: string | null
          parent_batch_id?: string | null
          provider?: string
          provider_batch_id?: string | null
          provider_error_file_id?: string | null
          provider_input_file_id?: string | null
          provider_output_file_id?: string | null
          prompt_tokens?: number | null
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
          failed_requests?: number | null
          failed_skus?: string[] | null
          id?: string
          input_file_id?: string | null
          max_retries?: number | null
          metadata?: Json | null
          openai_batch_id?: string | null
          output_file_id?: string | null
          parent_batch_id?: string | null
          provider?: string
          provider_batch_id?: string | null
          provider_error_file_id?: string | null
          provider_input_file_id?: string | null
          provider_output_file_id?: string | null
          prompt_tokens?: number | null
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
      brands: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          website_url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          website_url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          website_url?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_featured: boolean | null
          name: string
          parent_id: string | null
          slug: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          name: string
          parent_id?: string | null
          slug?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_featured?: boolean | null
          name?: string
          parent_id?: string | null
          slug?: string | null
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
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
          fulfillment_method: string | null
          id: string
          notes: string | null
          order_number: string
          paid_at: string | null
          payment_method: string | null
          payment_status: string | null
          promo_code: string | null
          promo_code_id: string | null
          refunded_amount: number | null
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
          fulfillment_method?: string | null
          id?: string
          notes?: string | null
          order_number: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          promo_code?: string | null
          promo_code_id?: string | null
          refunded_amount?: number | null
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
          fulfillment_method?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          paid_at?: string | null
          payment_method?: string | null
          payment_status?: string | null
          promo_code?: string | null
          promo_code_id?: string | null
          refunded_amount?: number | null
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
        }
        Insert: {
          category_id: string
          product_id: string
        }
        Update: {
          category_id?: string
          product_id?: string
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

          created_at: string
          description: string | null
          gtin: string | null
          id: string
          images: string[]
          is_special_order: boolean
          is_taxable: boolean
          long_description: string | null
          low_stock_threshold: number
          minimum_quantity: number
          name: string
          price: number

          published_at: string | null
          quantity: number
          search_keywords: string | null
          shopsite_pages: Json
          sku: string | null
          slug: string
          stock_status: string
          updated_at: string
          weight: number | null
        }
        Insert: {
          availability?: string | null
          brand_id?: string | null

          created_at?: string
          description?: string | null
          gtin?: string | null
          id?: string
          images?: string[]
          is_special_order?: boolean
          is_taxable?: boolean
          long_description?: string | null
          low_stock_threshold?: number
          minimum_quantity?: number
          name: string
          price: number

          published_at?: string | null
          quantity?: number
          search_keywords?: string | null
          shopsite_pages?: Json
          sku?: string | null
          slug: string
          stock_status?: string
          updated_at?: string
          weight?: number | null
        }
        Update: {
          availability?: string | null
          brand_id?: string | null

          created_at?: string
          description?: string | null
          gtin?: string | null
          id?: string
          images?: string[]
          is_special_order?: boolean
          is_taxable?: boolean
          long_description?: string | null
          low_stock_threshold?: number
          minimum_quantity?: number
          name?: string
          price?: number

          published_at?: string | null
          quantity?: number
          search_keywords?: string | null
          shopsite_pages?: Json
          sku?: string | null
          slug?: string
          stock_status?: string
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
        ]
      }
      products_ingestion: {
        Row: {
          b2b_sources: Json | null
          confidence_score: number | null
          consolidated: Json | null
          created_at: string | null
          enrichment_config: Json | null
          error_message: string | null
          image_candidates: string[] | null
          input: Json | null
          is_test_run: boolean | null
          pipeline_status: Database["public"]["Enums"]["pipeline_status_five"]
          pipeline_status_new: Database["public"]["Enums"]["pipeline_status_new_enum"]
          product_line: string | null
          retry_count: number | null
          selected_images: Json | null
          sku: string
          sources: Json | null
          updated_at: string | null
        }
        Insert: {
          b2b_sources?: Json | null
          confidence_score?: number | null
          consolidated?: Json | null
          created_at?: string | null
          enrichment_config?: Json | null
          error_message?: string | null
          image_candidates?: string[] | null
          input?: Json | null
          is_test_run?: boolean | null
          pipeline_status?: Database["public"]["Enums"]["pipeline_status_five"]
          pipeline_status_new: Database["public"]["Enums"]["pipeline_status_new_enum"]
          product_line?: string | null
          retry_count?: number | null
          selected_images?: Json | null
          sku: string
          sources?: Json | null
          updated_at?: string | null
        }
        Update: {
          b2b_sources?: Json | null
          confidence_score?: number | null
          consolidated?: Json | null
          created_at?: string | null
          enrichment_config?: Json | null
          error_message?: string | null
          image_candidates?: string[] | null
          input?: Json | null
          is_test_run?: boolean | null
          pipeline_status?: Database["public"]["Enums"]["pipeline_status_five"]
          pipeline_status_new?: Database["public"]["Enums"]["pipeline_status_new_enum"]
          product_line?: string | null
          retry_count?: number | null
          selected_images?: Json | null
          sku?: string
          sources?: Json | null
          updated_at?: string | null
        }
        Relationships: []
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
      scrape_job_chunks: {
        Row: {
          chunk_index: number
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          job_id: string
          results: Json | null
          scrapers: string[] | null
          skus: string[]
          skus_failed: number | null
          skus_processed: number | null
          skus_successful: number | null
          started_at: string | null
          status: string | null
          telemetry: Json | null
          updated_at: string | null
        }
        Insert: {
          chunk_index: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_id: string
          results?: Json | null
          scrapers?: string[] | null
          skus: string[]
          skus_failed?: number | null
          skus_processed?: number | null
          skus_successful?: number | null
          started_at?: string | null
          status?: string | null
          telemetry?: Json | null
          updated_at?: string | null
        }
        Update: {
          chunk_index?: number
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          job_id?: string
          results?: Json | null
          scrapers?: string[] | null
          skus?: string[]
          skus_failed?: number | null
          skus_processed?: number | null
          skus_successful?: number | null
          started_at?: string | null
          status?: string | null
          telemetry?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scrape_job_chunks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_job_logs: {
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
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_jobs: {
        Row: {
          attempt_count: number
          backoff_until: string | null
          completed_at: string | null
          config: Json | null
          created_at: string
          created_by: string | null
          current_sku: string | null
          error_message: string | null
          github_run_id: number | null
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
          leased_at: string | null
          max_attempts: number
          max_workers: number
          metadata: Json | null
          progress_details: Json | null
          progress_message: string | null
          progress_percent: number | null
          progress_phase: string | null
          progress_updated_at: string | null
          runner_name: string | null
          scrapers: string[] | null
          skus: string[] | null
          started_at: string | null
          status: string
          test_metadata: Json | null
          test_mode: boolean
          timeout_at: string | null
          type: string
          updated_at: string | null
          cohort_id: string | null
          is_cohort_batch: boolean | null
          cohort_status: string | null
        }
        Insert: {
          attempt_count?: number
          backoff_until?: string | null
          completed_at?: string | null
          config?: Json | null
          created_at?: string
          created_by?: string | null
          current_sku?: string | null
          error_message?: string | null
          github_run_id?: number | null
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
          leased_at?: string | null
          max_attempts?: number
          max_workers?: number
          metadata?: Json | null
          progress_details?: Json | null
          progress_message?: string | null
          progress_percent?: number | null
          progress_phase?: string | null
          progress_updated_at?: string | null
          runner_name?: string | null
          scrapers?: string[] | null
          skus?: string[] | null
          started_at?: string | null
          status?: string
          test_metadata?: Json | null
          test_mode?: boolean
          timeout_at?: string | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          attempt_count?: number
          backoff_until?: string | null
          completed_at?: string | null
          config?: Json | null
          created_at?: string
          created_by?: string | null
          current_sku?: string | null
          error_message?: string | null
          github_run_id?: number | null
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
          leased_at?: string | null
          max_attempts?: number
          max_workers?: number
          metadata?: Json | null
          progress_details?: Json | null
          progress_message?: string | null
          progress_percent?: number | null
          progress_phase?: string | null
          progress_updated_at?: string | null
          runner_name?: string | null
          scrapers?: string[] | null
          skus?: string[] | null
          started_at?: string | null
          status?: string
          test_metadata?: Json | null
          test_mode?: boolean
          timeout_at?: string | null
          type?: string
          updated_at?: string | null
          cohort_id?: string | null
          is_cohort_batch?: boolean | null
          cohort_status?: string | null
        }
        Relationships: []
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
        Relationships: [
          {
            foreignKeyName: "scrape_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "scrape_jobs"
            referencedColumns: ["id"]
          },
        ]
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
            referencedRelation: "scrape_jobs"
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
      claim_next_chunk: {
        Args: { p_job_id: string; p_runner_name: string }
        Returns: {
          chunk_id: string
          chunk_index: number
          scrapers: string[]
          skus: string[]
        }[]
      }
      claim_next_pending_chunk: {
        Args: { p_runner_name: string }
        Returns: {
          chunk_id: string
          chunk_index: number
          config: Json
          job_id: string
          lease_expires_at: string
          lease_token: string
          max_workers: number
          scrapers: string[]
          skus: string[]
          test_mode: boolean
          type: string
        }[]
      }
      claim_next_pending_job: {
        Args: { p_runner_name: string }
        Returns: {
          config: Json
          job_id: string
          max_workers: number
          scrapers: string[]
          skus: string[]
          test_mode: boolean
          type: string
        }[]
      }
      generate_subscription_suggestions: {
        Args: { p_subscription_id: string }
        Returns: undefined
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
      get_store_analytics: {
        Args: { end_date: string; start_date: string }
        Returns: Json
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
    }
    Enums: {
      pipeline_status_five:
        | "imported"
        | "monitoring"
        | "scraped"
        | "consolidated"
        | "finalized"
        | "published"
      pipeline_status_new_enum: "registered" | "enriched" | "finalized"
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

export const Constants = {
  public: {
    Enums: {
      pipeline_status_five: [
        "imported",
        "monitoring",
        "scraped",
        "consolidated",
        "finalized",
        "published",
      ],
      pipeline_status_new_enum: ["registered", "enriched", "finalized"],
    },
  },
} as const
