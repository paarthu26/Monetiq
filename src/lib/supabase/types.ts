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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json
          id: string
          status: string
          target: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          status?: string
          target?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          status?: string
          target?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_config: {
        Row: {
          created_at: string
          has_key: boolean
          id: string
          is_active: boolean
          is_enabled: boolean
          label: string | null
          model: string
          monthly_usage_limit: number | null
          provider: string
          updated_at: string
          updated_by: string | null
          vault_secret_id: string | null
        }
        Insert: {
          created_at?: string
          has_key?: boolean
          id?: string
          is_active?: boolean
          is_enabled?: boolean
          label?: string | null
          model: string
          monthly_usage_limit?: number | null
          provider: string
          updated_at?: string
          updated_by?: string | null
          vault_secret_id?: string | null
        }
        Update: {
          created_at?: string
          has_key?: boolean
          id?: string
          is_active?: boolean
          is_enabled?: boolean
          label?: string | null
          model?: string
          monthly_usage_limit?: number | null
          provider?: string
          updated_at?: string
          updated_by?: string | null
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          completion_tokens: number | null
          cost_usd: number | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          feature: string
          id: string
          model: string | null
          prompt_tokens: number | null
          provider: string | null
          status: string
          user_id: string
        }
        Insert: {
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          feature: string
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          status: string
          user_id: string
        }
        Update: {
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          feature?: string
          id?: string
          model?: string | null
          prompt_tokens?: number | null
          provider?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_notifications: {
        Row: {
          alert_type: string
          created_at: string
          dedupe_key: string | null
          id: string
          is_read: boolean
          message: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          message: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_settings: {
        Row: {
          alert_type: string
          created_at: string
          enabled: boolean
          id: string
          threshold_value: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          enabled?: boolean
          id?: string
          threshold_value?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          enabled?: boolean
          id?: string
          threshold_value?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_analysis_results: {
        Row: {
          ai_disclaimer: string
          ai_summary: string | null
          category_breakdown: Json
          generated_at: string
          id: string
          net_savings: number | null
          total_expense: number
          total_income: number
          transaction_count: number
          upload_id: string
        }
        Insert: {
          ai_disclaimer?: string
          ai_summary?: string | null
          category_breakdown?: Json
          generated_at?: string
          id?: string
          net_savings?: number | null
          total_expense?: number
          total_income?: number
          transaction_count?: number
          upload_id: string
        }
        Update: {
          ai_disclaimer?: string
          ai_summary?: string | null
          category_breakdown?: Json
          generated_at?: string
          id?: string
          net_savings?: number | null
          total_expense?: number
          total_income?: number
          transaction_count?: number
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_analysis_results_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: true
            referencedRelation: "bank_statement_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_transactions: {
        Row: {
          amount: number
          category_guess: string | null
          created_at: string
          description: string | null
          direction: string
          id: string
          txn_date: string
          upload_id: string
        }
        Insert: {
          amount: number
          category_guess?: string | null
          created_at?: string
          description?: string | null
          direction: string
          id?: string
          txn_date: string
          upload_id: string
        }
        Update: {
          amount?: number
          category_guess?: string | null
          created_at?: string
          description?: string | null
          direction?: string
          id?: string
          txn_date?: string
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_transactions_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "bank_statement_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_statement_uploads: {
        Row: {
          bank_name: string | null
          created_at: string
          failure_reason: string | null
          id: string
          original_filename: string | null
          period_from: string | null
          period_to: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bank_name?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          original_filename?: string | null
          period_from?: string | null
          period_to?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bank_name?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          original_filename?: string | null
          period_from?: string | null
          period_to?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_statement_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          category_id: string
          created_at: string
          id: string
          monthly_cap: number
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          monthly_cap: number
          updated_at?: string
          user_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          monthly_cap?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          tint: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          tint?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          tint?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pages: {
        Row: {
          body: string
          created_at: string
          id: string
          published_at: string | null
          slug: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          published_at?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          published_at?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_pages_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      data_privacy_requests: {
        Row: {
          id: string
          notes: string | null
          request_type: string
          requested_at: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          id?: string
          notes?: string | null
          request_type: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          id?: string
          notes?: string | null
          request_type?: string
          requested_at?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_privacy_requests_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_privacy_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      debts: {
        Row: {
          created_at: string
          emi_amount: number | null
          id: string
          interest_rate: number
          lender_name: string
          loan_type: string
          outstanding_balance: number
          principal_amount: number
          start_date: string
          tenure_months: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emi_amount?: number | null
          id?: string
          interest_rate: number
          lender_name: string
          loan_type: string
          outstanding_balance: number
          principal_amount: number
          start_date: string
          tenure_months?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          emi_amount?: number | null
          id?: string
          interest_rate?: number
          lender_name?: string
          loan_type?: string
          outstanding_balance?: number
          principal_amount?: number
          start_date?: string
          tenure_months?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_ledger: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          expense_date: string
          id: string
          merchant: string
          notes: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          expense_date: string
          id?: string
          merchant: string
          notes?: string | null
          source: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          expense_date?: string
          id?: string
          merchant?: string
          notes?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_ledger_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_desk_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_desk_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "help_desk_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "help_desk_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      help_desk_tickets: {
        Row: {
          category: string
          closed_at: string | null
          created_at: string
          id: string
          priority: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_desk_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      income_sources: {
        Row: {
          amount: number
          created_at: string
          frequency: string
          id: string
          is_active: boolean
          received_or_start_date: string
          source_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          frequency: string
          id?: string
          is_active?: boolean
          received_or_start_date: string
          source_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean
          received_or_start_date?: string
          source_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "income_sources_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_scan_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          failure_reason: string | null
          id: string
          provider: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          failure_reason?: string | null
          id?: string
          provider?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          failure_reason?: string | null
          id?: string
          provider?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocr_scan_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          financial_goals: string | null
          full_name: string | null
          id: string
          is_blocked: boolean
          last_active_at: string
          occupation: string | null
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          financial_goals?: string | null
          full_name?: string | null
          id: string
          is_blocked?: boolean
          last_active_at?: string
          occupation?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          financial_goals?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          last_active_at?: string
          occupation?: string | null
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_rate_log: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          label: string
          permission_key: string
          role: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          label: string
          permission_key: string
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          label?: string
          permission_key?: string
          role?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_alerts: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          is_resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          service: string | null
          severity: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          is_resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          service?: string | null
          severity: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          is_resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          service?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_service_status: {
        Row: {
          created_at: string
          down_reason: string | null
          down_since: string | null
          id: string
          last_checked: string | null
          service_name: string
          status: string
          updated_at: string
          updated_by: string | null
          uptime_pct: number | null
        }
        Insert: {
          created_at?: string
          down_reason?: string | null
          down_since?: string | null
          id?: string
          last_checked?: string | null
          service_name: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          uptime_pct?: number | null
        }
        Update: {
          created_at?: string
          down_reason?: string | null
          down_since?: string | null
          id?: string
          last_checked?: string | null
          service_name?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          uptime_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "system_service_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_terms_acceptance: {
        Row: {
          accepted_at: string
          accepted_version: number
          content_id: string
          id: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_version: number
          content_id: string
          id?: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          accepted_version?: number
          content_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_terms_acceptance_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_terms_acceptance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_ai_dashboard: {
        Args: { p_days?: number }
        Returns: {
          avg_duration_ms: number
          failures: number
          provider: string
          requests: number
          success_rate_pct: number
          successes: number
          total_cost_usd: number
        }[]
      }
      admin_analytics_overview: {
        Args: { p_days?: number }
        Returns: {
          active_users: number
          ai_usage: number
          blocked_users: number
          ocr_usage: number
          total_users: number
          window_days: number
        }[]
      }
      admin_delete_ai_provider_key: {
        Args: { p_config_id: string }
        Returns: undefined
      }
      admin_get_ai_provider_key: {
        Args: { p_config_id: string }
        Returns: string
      }
      admin_active_users: {
        Args: { p_from: string; p_to: string }
        Returns: { active_users: number; month: string }[]
      }
      admin_ai_trend: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_duration_ms: number | null
          failures: number
          month: string
          requests: number
          success_rate_pct: number | null
          successes: number
          total_cost_usd: number
        }[]
      }
      admin_feature_usage: {
        Args: { p_from: string; p_to: string }
        Returns: {
          ai_requests: number
          expenses: number
          month: string
          ocr_scans: number
          statements: number
        }[]
      }
      admin_month_series: {
        Args: { p_from: string; p_to: string }
        Returns: { month: string }[]
      }
      admin_ocr_trend: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_duration_ms: number | null
          failures: number
          month: string
          scans: number
          success_rate_pct: number | null
          successes: number
        }[]
      }
      admin_ops_trend: {
        Args: { p_from: string; p_to: string }
        Returns: {
          avg_duration_ms: number | null
          error_rate_pct: number | null
          failures: number
          month: string
          operations: number
          success_rate_pct: number | null
          successes: number
        }[]
      }
      admin_user_growth: {
        Args: { p_from: string; p_to: string }
        Returns: { month: string; new_users: number; total_users: number }[]
      }
      admin_ocr_dashboard: {
        Args: { p_days?: number }
        Returns: {
          avg_duration_ms: number
          day: string
          failures: number
          scans: number
          success_rate_pct: number
          successes: number
        }[]
      }
      admin_set_ai_provider_key: {
        Args: { p_config_id: string; p_key: string }
        Returns: undefined
      }
      ai_quota_status: {
        Args: { p_uid?: string }
        Returns: {
          remaining: number
          used: number
          week_start: string
          weekly_limit: number
        }[]
      }
      ai_week_start: { Args: { p_at?: string }; Returns: string }
      analytics_category_rollup: {
        Args: { p_from: string; p_to: string }
        Returns: {
          category_id: string
          category_name: string
          total: number
          txn_count: number
        }[]
      }
      analytics_monthly_rollup: {
        Args: { p_from: string; p_to: string }
        Returns: {
          month: string
          total: number
          txn_count: number
        }[]
      }
      budget_progress: {
        Args: { p_month?: string }
        Returns: {
          budget_id: string
          category_id: string
          category_name: string
          monthly_cap: number
          pct_used: number
          remaining: number
          spent: number
        }[]
      }
      is_account_active: { Args: { p_uid?: string }; Returns: boolean }
      is_super_admin: { Args: { p_uid?: string }; Returns: boolean }
      prune_request_rate_log: { Args: never; Returns: undefined }
      refresh_due_alerts: { Args: never; Returns: undefined }
      touch_last_active: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
