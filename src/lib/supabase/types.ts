// ---------------------------------------------------------------------------
// Generated from the live Monetiq schema.
//
// Regenerate after any migration with:
//   npx supabase gen types typescript --project-id qljpfonukbzhefuqvpuo > src/lib/supabase/types.ts
//
// Do not hand-edit: changes are lost on the next generation.
// ---------------------------------------------------------------------------

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string;
          admin_id: string | null;
          created_at: string;
          details: Json;
          id: string;
          status: string;
          target: string | null;
          target_id: string | null;
        };
        Insert: {
          action: string;
          admin_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          status?: string;
          target?: string | null;
          target_id?: string | null;
        };
        Update: {
          action?: string;
          admin_id?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          status?: string;
          target?: string | null;
          target_id?: string | null;
        };
        Relationships: [];
      };
      ai_chat_conversations: {
        Row: {
          created_at: string;
          id: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_chat_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          role: string;
        };
        Insert: {
          content: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          role: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          role?: string;
        };
        Relationships: [];
      };
      ai_provider_config: {
        Row: {
          created_at: string;
          has_key: boolean;
          id: string;
          is_active: boolean;
          is_enabled: boolean;
          label: string | null;
          model: string;
          monthly_usage_limit: number | null;
          provider: string;
          updated_at: string;
          updated_by: string | null;
          vault_secret_id: string | null;
        };
        Insert: {
          created_at?: string;
          has_key?: boolean;
          id?: string;
          is_active?: boolean;
          is_enabled?: boolean;
          label?: string | null;
          model: string;
          monthly_usage_limit?: number | null;
          provider: string;
          updated_at?: string;
          updated_by?: string | null;
          vault_secret_id?: string | null;
        };
        Update: {
          created_at?: string;
          has_key?: boolean;
          id?: string;
          is_active?: boolean;
          is_enabled?: boolean;
          label?: string | null;
          model?: string;
          monthly_usage_limit?: number | null;
          provider?: string;
          updated_at?: string;
          updated_by?: string | null;
          vault_secret_id?: string | null;
        };
        Relationships: [];
      };
      ai_usage_log: {
        Row: {
          completion_tokens: number | null;
          cost_usd: number | null;
          created_at: string;
          duration_ms: number | null;
          error_code: string | null;
          feature: string;
          id: string;
          model: string | null;
          prompt_tokens: number | null;
          provider: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          completion_tokens?: number | null;
          cost_usd?: number | null;
          created_at?: string;
          duration_ms?: number | null;
          error_code?: string | null;
          feature: string;
          id?: string;
          model?: string | null;
          prompt_tokens?: number | null;
          provider?: string | null;
          status: string;
          user_id: string;
        };
        Update: {
          completion_tokens?: number | null;
          cost_usd?: number | null;
          created_at?: string;
          duration_ms?: number | null;
          error_code?: string | null;
          feature?: string;
          id?: string;
          model?: string | null;
          prompt_tokens?: number | null;
          provider?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      alert_notifications: {
        Row: {
          alert_type: string;
          created_at: string;
          id: string;
          is_read: boolean;
          message: string;
          user_id: string;
        };
        Insert: {
          alert_type: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message: string;
          user_id: string;
        };
        Update: {
          alert_type?: string;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          message?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      alert_settings: {
        Row: {
          alert_type: string;
          created_at: string;
          enabled: boolean;
          id: string;
          threshold_value: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          alert_type: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          threshold_value?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          alert_type?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          threshold_value?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      bank_statement_analysis_results: {
        Row: {
          ai_disclaimer: string;
          ai_summary: string | null;
          category_breakdown: Json;
          generated_at: string;
          id: string;
          net_savings: number | null;
          total_expense: number;
          total_income: number;
          transaction_count: number;
          upload_id: string;
        };
        Insert: {
          ai_disclaimer?: string;
          ai_summary?: string | null;
          category_breakdown?: Json;
          generated_at?: string;
          id?: string;
          total_expense?: number;
          total_income?: number;
          transaction_count?: number;
          upload_id: string;
        };
        Update: {
          ai_disclaimer?: string;
          ai_summary?: string | null;
          category_breakdown?: Json;
          generated_at?: string;
          id?: string;
          total_expense?: number;
          total_income?: number;
          transaction_count?: number;
          upload_id?: string;
        };
        Relationships: [];
      };
      bank_statement_transactions: {
        Row: {
          amount: number;
          category_guess: string | null;
          created_at: string;
          description: string | null;
          direction: string;
          id: string;
          txn_date: string;
          upload_id: string;
        };
        Insert: {
          amount: number;
          category_guess?: string | null;
          created_at?: string;
          description?: string | null;
          direction: string;
          id?: string;
          txn_date: string;
          upload_id: string;
        };
        Update: {
          amount?: number;
          category_guess?: string | null;
          created_at?: string;
          description?: string | null;
          direction?: string;
          id?: string;
          txn_date?: string;
          upload_id?: string;
        };
        Relationships: [];
      };
      bank_statement_uploads: {
        Row: {
          bank_name: string | null;
          created_at: string;
          failure_reason: string | null;
          id: string;
          original_filename: string | null;
          period_from: string | null;
          period_to: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          bank_name?: string | null;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          original_filename?: string | null;
          period_from?: string | null;
          period_to?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          bank_name?: string | null;
          created_at?: string;
          failure_reason?: string | null;
          id?: string;
          original_filename?: string | null;
          period_from?: string | null;
          period_to?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      budgets: {
        Row: {
          category_id: string;
          created_at: string;
          id: string;
          monthly_cap: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          id?: string;
          monthly_cap: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          id?: string;
          monthly_cap?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          created_at: string;
          icon: string | null;
          id: string;
          name: string;
          tint: string | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          icon?: string | null;
          id?: string;
          name: string;
          tint?: string | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          icon?: string | null;
          id?: string;
          name?: string;
          tint?: string | null;
          user_id?: string | null;
        };
        Relationships: [];
      };
      content_pages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          published_at: string | null;
          slug: string;
          status: string;
          title: string;
          updated_at: string;
          updated_by: string | null;
          version: number;
        };
        Insert: {
          body?: string;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          slug: string;
          status?: string;
          title: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          published_at?: string | null;
          slug?: string;
          status?: string;
          title?: string;
          updated_at?: string;
          updated_by?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      data_privacy_requests: {
        Row: {
          id: string;
          notes: string | null;
          request_type: string;
          requested_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          notes?: string | null;
          request_type: string;
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          id?: string;
          notes?: string | null;
          request_type?: string;
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      debts: {
        Row: {
          created_at: string;
          emi_amount: number | null;
          id: string;
          interest_rate: number;
          lender_name: string;
          loan_type: string;
          outstanding_balance: number;
          principal_amount: number;
          start_date: string;
          tenure_months: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          emi_amount?: number | null;
          id?: string;
          interest_rate: number;
          lender_name: string;
          loan_type: string;
          outstanding_balance: number;
          principal_amount: number;
          start_date: string;
          tenure_months?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          emi_amount?: number | null;
          id?: string;
          interest_rate?: number;
          lender_name?: string;
          loan_type?: string;
          outstanding_balance?: number;
          principal_amount?: number;
          start_date?: string;
          tenure_months?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      expense_ledger: {
        Row: {
          amount: number;
          category_id: string | null;
          created_at: string;
          expense_date: string;
          id: string;
          merchant: string;
          notes: string | null;
          source: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          category_id?: string | null;
          created_at?: string;
          expense_date: string;
          id?: string;
          merchant: string;
          notes?: string | null;
          source: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          category_id?: string | null;
          created_at?: string;
          expense_date?: string;
          id?: string;
          merchant?: string;
          notes?: string | null;
          source?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          description: string | null;
          enabled: boolean;
          key: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          description?: string | null;
          enabled?: boolean;
          key: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          description?: string | null;
          enabled?: boolean;
          key?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      help_desk_messages: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          sender_id: string;
          ticket_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          sender_id: string;
          ticket_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
          ticket_id?: string;
        };
        Relationships: [];
      };
      help_desk_tickets: {
        Row: {
          category: string;
          closed_at: string | null;
          created_at: string;
          id: string;
          priority: string;
          status: string;
          subject: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category: string;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          priority?: string;
          status?: string;
          subject: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category?: string;
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          priority?: string;
          status?: string;
          subject?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      income_sources: {
        Row: {
          amount: number;
          created_at: string;
          frequency: string;
          id: string;
          is_active: boolean;
          received_or_start_date: string;
          source_name: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          frequency: string;
          id?: string;
          is_active?: boolean;
          received_or_start_date: string;
          source_name: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          frequency?: string;
          id?: string;
          is_active?: boolean;
          received_or_start_date?: string;
          source_name?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ocr_scan_log: {
        Row: {
          created_at: string;
          duration_ms: number | null;
          failure_reason: string | null;
          id: string;
          provider: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          duration_ms?: number | null;
          failure_reason?: string | null;
          id?: string;
          provider?: string | null;
          status: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duration_ms?: number | null;
          failure_reason?: string | null;
          id?: string;
          provider?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          deleted_at: string | null;
          email: string | null;
          financial_goals: string | null;
          full_name: string | null;
          id: string;
          is_blocked: boolean;
          last_active_at: string;
          occupation: string | null;
          phone: string | null;
          role: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          financial_goals?: string | null;
          full_name?: string | null;
          id: string;
          is_blocked?: boolean;
          last_active_at?: string;
          occupation?: string | null;
          phone?: string | null;
          role?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string | null;
          financial_goals?: string | null;
          full_name?: string | null;
          id?: string;
          is_blocked?: boolean;
          last_active_at?: string;
          occupation?: string | null;
          phone?: string | null;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          created_at: string;
          endpoint: string;
          id: string;
          keys: Json;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          endpoint: string;
          id?: string;
          keys: Json;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          endpoint?: string;
          id?: string;
          keys?: Json;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          created_at: string;
          description: string | null;
          enabled: boolean;
          id: string;
          label: string;
          permission_key: string;
          role: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          id?: string;
          label: string;
          permission_key: string;
          role?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          enabled?: boolean;
          id?: string;
          label?: string;
          permission_key?: string;
          role?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      system_alerts: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          is_read: boolean;
          is_resolved: boolean;
          resolved_at: string | null;
          resolved_by: string | null;
          service: string | null;
          severity: string;
          title: string;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          is_resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
          service?: string | null;
          severity: string;
          title: string;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          is_read?: boolean;
          is_resolved?: boolean;
          resolved_at?: string | null;
          resolved_by?: string | null;
          service?: string | null;
          severity?: string;
          title?: string;
        };
        Relationships: [];
      };
      system_service_status: {
        Row: {
          created_at: string;
          down_reason: string | null;
          down_since: string | null;
          id: string;
          last_checked: string | null;
          service_name: string;
          status: string;
          updated_at: string;
          updated_by: string | null;
          uptime_pct: number | null;
        };
        Insert: {
          created_at?: string;
          down_reason?: string | null;
          down_since?: string | null;
          id?: string;
          last_checked?: string | null;
          service_name: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          uptime_pct?: number | null;
        };
        Update: {
          created_at?: string;
          down_reason?: string | null;
          down_since?: string | null;
          id?: string;
          last_checked?: string | null;
          service_name?: string;
          status?: string;
          updated_at?: string;
          updated_by?: string | null;
          uptime_pct?: number | null;
        };
        Relationships: [];
      };
      user_terms_acceptance: {
        Row: {
          accepted_at: string;
          accepted_version: number;
          content_id: string;
          id: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string;
          accepted_version: number;
          content_id: string;
          id?: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string;
          accepted_version?: number;
          content_id?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      admin_ai_dashboard: {
        Args: { p_days?: number };
        Returns: {
          avg_duration_ms: number;
          failures: number;
          provider: string;
          requests: number;
          success_rate_pct: number;
          successes: number;
          total_cost_usd: number;
        }[];
      };
      admin_analytics_overview: {
        Args: { p_days?: number };
        Returns: {
          active_users: number;
          ai_usage: number;
          blocked_users: number;
          ocr_usage: number;
          total_users: number;
          window_days: number;
        }[];
      };
      admin_delete_ai_provider_key: { Args: { p_config_id: string }; Returns: undefined };
      admin_get_ai_provider_key: { Args: { p_config_id: string }; Returns: string };
      admin_ocr_dashboard: {
        Args: { p_days?: number };
        Returns: {
          avg_duration_ms: number;
          day: string;
          failures: number;
          scans: number;
          success_rate_pct: number;
          successes: number;
        }[];
      };
      admin_set_ai_provider_key: {
        Args: { p_config_id: string; p_key: string };
        Returns: undefined;
      };
      ai_quota_status: {
        Args: { p_uid?: string };
        Returns: {
          remaining: number;
          used: number;
          week_start: string;
          weekly_limit: number;
        }[];
      };
      ai_week_start: { Args: { p_at?: string }; Returns: string };
      budget_progress: {
        Args: { p_month?: string };
        Returns: {
          budget_id: string;
          category_id: string;
          category_name: string;
          monthly_cap: number;
          pct_used: number;
          remaining: number;
          spent: number;
        }[];
      };
      is_account_active: { Args: { p_uid?: string }; Returns: boolean };
      is_super_admin: { Args: { p_uid?: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];

// Domain unions the schema stores as text with a CHECK constraint.
export type UserRole = 'user' | 'super_admin';
export type ExpenseSource = 'ocr' | 'manual';
export type LoanType = 'personal_loan' | 'credit_card';
export type IncomeFrequency = 'one_time' | 'monthly';
export type AlertType =
  | 'overspending'
  | 'budget_limit'
  | 'emi_reminder'
  | 'unusual_transaction';
export type AiFeature = 'chatbot' | 'bank_statement_report' | 'loan_closure_suggestion';
export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketStatus = 'open' | 'closed';
export type ContentSlug = 'terms' | 'privacy' | 'help' | 'about' | 'contact';
