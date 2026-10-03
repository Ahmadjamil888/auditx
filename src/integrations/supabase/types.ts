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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          created_at: string
          credits_used: number
          id: string
          inference_requests: number
          model: string
          org_id: string
          plan: string
          provider_error: string | null
          status: string
          thread_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_used?: number
          id?: string
          inference_requests?: number
          model?: string
          org_id: string
          plan?: string
          provider_error?: string | null
          status?: string
          thread_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          credits_used?: number
          id?: string
          inference_requests?: number
          model?: string
          org_id?: string
          plan?: string
          provider_error?: string | null
          status?: string
          thread_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          entity_id: string
          entity_type: string
          hash: string
          id: string
          org_id: string
          payload: Json
          prev_hash: string
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          entity_id: string
          entity_type: string
          hash: string
          id?: string
          org_id: string
          payload?: Json
          prev_hash?: string
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          hash?: string
          id?: string
          org_id?: string
          payload?: Json
          prev_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      broker_accounts: {
        Row: {
          broker_name: string
          created_at: string
          currency: string
          exchange: string
          external_ref: string | null
          id: string
          name: string
          org_id: string
        }
        Insert: {
          broker_name: string
          created_at?: string
          currency?: string
          exchange?: string
          external_ref?: string | null
          id?: string
          name: string
          org_id: string
        }
        Update: {
          broker_name?: string
          created_at?: string
          currency?: string
          exchange?: string
          external_ref?: string | null
          id?: string
          name?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broker_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          ai_message_id: string
          created_at: string
          id: string
          org_id: string
          parts: Json
          position: number
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          ai_message_id: string
          created_at?: string
          id?: string
          org_id: string
          parts?: Json
          position: number
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          ai_message_id?: string
          created_at?: string
          id?: string
          org_id?: string
          parts?: Json
          position?: number
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          created_at: string
          id: string
          org_id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          broker_account_id: string | null
          confidence_score: number | null
          created_at: string
          doc_type: string
          extracted_data: Json | null
          id: string
          org_id: string
          status: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          broker_account_id?: string | null
          confidence_score?: number | null
          created_at?: string
          doc_type?: string
          extracted_data?: Json | null
          id?: string
          org_id: string
          status?: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          broker_account_id?: string | null
          confidence_score?: number | null
          created_at?: string
          doc_type?: string
          extracted_data?: Json | null
          id?: string
          org_id?: string
          status?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "documents_broker_account_id_fkey"
            columns: ["broker_account_id"]
            isOneToOne: false
            referencedRelation: "broker_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_events: {
        Row: {
          confidence: number
          created_at: string
          description: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          metadata: Json | null
          org_id: string
          resolved_at: string | null
          severity: string
          status: string
          title: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          description: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          org_id: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title: string
        }
        Update: {
          confidence?: number
          created_at?: string
          description?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_insights: {
        Row: {
          confidence: number
          created_at: string
          entity_ids: string[] | null
          evidence_ids: string[] | null
          expires_at: string | null
          id: string
          insight_type: string
          org_id: string
          resolved_at: string | null
          severity: string
          status: string
          summary: string
          title: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          entity_ids?: string[] | null
          evidence_ids?: string[] | null
          expires_at?: string | null
          id?: string
          insight_type: string
          org_id: string
          resolved_at?: string | null
          severity?: string
          status?: string
          summary: string
          title: string
        }
        Update: {
          confidence?: number
          created_at?: string
          entity_ids?: string[] | null
          evidence_ids?: string[] | null
          expires_at?: string | null
          id?: string
          insight_type?: string
          org_id?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          summary?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_insights_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_investigations: {
        Row: {
          completed_at: string | null
          created_at: string
          documents_analysed: number
          findings: Json | null
          id: string
          investigation_type: string
          org_id: string
          scope: Json | null
          status: string
          summary: string | null
          title: string
          transactions_analysed: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          documents_analysed?: number
          findings?: Json | null
          id?: string
          investigation_type: string
          org_id: string
          scope?: Json | null
          status?: string
          summary?: string | null
          title: string
          transactions_analysed?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          documents_analysed?: number
          findings?: Json | null
          id?: string
          investigation_type?: string
          org_id?: string
          scope?: Json | null
          status?: string
          summary?: string | null
          title?: string
          transactions_analysed?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_investigations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount: number
          balance_after: number
          broker_account_id: string | null
          created_at: string
          entry_type: string
          id: string
          org_id: string
          transaction_id: string | null
        }
        Insert: {
          amount: number
          balance_after?: number
          broker_account_id?: string | null
          created_at?: string
          entry_type: string
          id?: string
          org_id: string
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          broker_account_id?: string | null
          created_at?: string
          entry_type?: string
          id?: string
          org_id?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_broker_account_id_fkey"
            columns: ["broker_account_id"]
            isOneToOne: false
            referencedRelation: "broker_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          org_id: string
          read: boolean
          severity: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          org_id: string
          read?: boolean
          severity?: string
          title?: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          org_id?: string
          read?: boolean
          severity?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          jurisdiction_default: string
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiction_default?: string
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction_default?: string
          logo_url?: string | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_flags: {
        Row: {
          actual: Json
          broker_account_id: string | null
          created_at: string
          description: string
          expected: Json
          flag_type: string
          id: string
          org_id: string
          ref_id: string
          severity: string
          status: string
          suggested_resolution: string
          ticker: string
        }
        Insert: {
          actual?: Json
          broker_account_id?: string | null
          created_at?: string
          description?: string
          expected?: Json
          flag_type: string
          id?: string
          org_id: string
          ref_id?: string
          severity?: string
          status?: string
          suggested_resolution?: string
          ticker?: string
        }
        Update: {
          actual?: Json
          broker_account_id?: string | null
          created_at?: string
          description?: string
          expected?: Json
          flag_type?: string
          id?: string
          org_id?: string
          ref_id?: string
          severity?: string
          status?: string
          suggested_resolution?: string
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_flags_broker_account_id_fkey"
            columns: ["broker_account_id"]
            isOneToOne: false
            referencedRelation: "broker_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_flags_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          org_id: string
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          org_id: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          org_id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_computations: {
        Row: {
          breakdown: Json
          computed_at: string
          dividend_wht: number
          estimated_tax_due: number
          filer_status: string
          id: string
          jurisdiction: string
          long_term_gain: number
          org_id: string
          short_term_gain: number
          tax_profile_id: string | null
          tax_year: string
        }
        Insert: {
          breakdown?: Json
          computed_at?: string
          dividend_wht?: number
          estimated_tax_due?: number
          filer_status?: string
          id?: string
          jurisdiction?: string
          long_term_gain?: number
          org_id: string
          short_term_gain?: number
          tax_profile_id?: string | null
          tax_year: string
        }
        Update: {
          breakdown?: Json
          computed_at?: string
          dividend_wht?: number
          estimated_tax_due?: number
          filer_status?: string
          id?: string
          jurisdiction?: string
          long_term_gain?: number
          org_id?: string
          short_term_gain?: number
          tax_profile_id?: string | null
          tax_year?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_computations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_computations_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "tax_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_loss_harvest_suggestions: {
        Row: {
          created_at: string
          exchange: string
          holding_days: number
          id: string
          org_id: string
          position_ticker: string
          potential_offset: number
          rationale: string
          status: string
          unrealized_loss: number
        }
        Insert: {
          created_at?: string
          exchange?: string
          holding_days?: number
          id?: string
          org_id: string
          position_ticker: string
          potential_offset: number
          rationale?: string
          status?: string
          unrealized_loss: number
        }
        Update: {
          created_at?: string
          exchange?: string
          holding_days?: number
          id?: string
          org_id?: string
          position_ticker?: string
          potential_offset?: number
          rationale?: string
          status?: string
          unrealized_loss?: number
        }
        Relationships: [
          {
            foreignKeyName: "tax_loss_harvest_suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_profiles: {
        Row: {
          cgt_rules: Json
          created_at: string
          filer_status: string
          holding_period_tiers: Json
          id: string
          jurisdiction: string
          org_id: string
          wht_rules: Json
        }
        Insert: {
          cgt_rules?: Json
          created_at?: string
          filer_status?: string
          holding_period_tiers?: Json
          id?: string
          jurisdiction: string
          org_id: string
          wht_rules?: Json
        }
        Update: {
          cgt_rules?: Json
          created_at?: string
          filer_status?: string
          holding_period_tiers?: Json
          id?: string
          jurisdiction?: string
          org_id?: string
          wht_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tax_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          action: string
          broker: string
          broker_account_id: string | null
          confidence_score: number
          created_at: string
          document_id: string | null
          exchange: string
          fees: number
          id: string
          org_id: string
          price: number
          quantity: number
          ref_id: string
          source: Json
          status: string
          ticker: string
          trade_date: string
          wht: number
        }
        Insert: {
          action: string
          broker?: string
          broker_account_id?: string | null
          confidence_score?: number
          created_at?: string
          document_id?: string | null
          exchange?: string
          fees?: number
          id?: string
          org_id: string
          price: number
          quantity: number
          ref_id?: string
          source?: Json
          status?: string
          ticker: string
          trade_date: string
          wht?: number
        }
        Update: {
          action?: string
          broker?: string
          broker_account_id?: string | null
          confidence_score?: number
          created_at?: string
          document_id?: string | null
          exchange?: string
          fees?: number
          id?: string
          org_id?: string
          price?: number
          quantity?: number
          ref_id?: string
          source?: Json
          status?: string
          ticker?: string
          trade_date?: string
          wht?: number
        }
        Relationships: [
          {
            foreignKeyName: "transactions_broker_account_id_fkey"
            columns: ["broker_account_id"]
            isOneToOne: false
            referencedRelation: "broker_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_org_ids: { Args: never; Returns: string[] }
      provision_current_user: {
        Args: { _full_name: string; _jurisdiction: string; _org_name: string }
        Returns: {
          created_at: string
          full_name: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
