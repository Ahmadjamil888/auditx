// ─── Auto-generated Supabase type stubs ──────────────────────────────────────
// For full type generation run: npx supabase gen types typescript --project-id YOUR_ID > src/lib/database.types.ts
// These manual stubs match the schema in supabase/schema.sql exactly.

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  __InternalSupabase: { PostgrestVersion: "12" };
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          jurisdiction_default: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          jurisdiction_default?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          full_name: string;
          role: "owner" | "admin" | "analyst" | "viewer";
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          full_name: string;
          role?: "owner" | "admin" | "analyst" | "viewer";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          org_id: string;
          broker_account_id: string | null;
          document_id: string | null;
          ticker: string;
          action: "BUY" | "SELL" | "DIV";
          quantity: number;
          price: number;
          fees: number;
          wht: number;
          trade_date: string;
          ref_id: string;
          confidence_score: number;
          status: "posted" | "needs_review";
          exchange: string;
          broker: string;
          source: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          broker_account_id?: string | null;
          document_id?: string | null;
          ticker: string;
          action: "BUY" | "SELL" | "DIV";
          quantity: number;
          price: number;
          fees?: number;
          wht?: number;
          trade_date: string;
          ref_id: string;
          confidence_score?: number;
          status?: "posted" | "needs_review";
          exchange?: string;
          broker?: string;
          source?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
        Relationships: [];
      };
      reconciliation_flags: {
        Row: {
          id: string;
          org_id: string;
          broker_account_id: string | null;
          flag_type: string;
          severity: "ok" | "warn" | "bad";
          ticker: string;
          ref_id: string;
          expected: Json;
          actual: Json;
          description: string;
          suggested_resolution: string;
          status: "open" | "resolved" | "expected";
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          broker_account_id?: string | null;
          flag_type: string;
          severity?: "ok" | "warn" | "bad";
          ticker: string;
          ref_id: string;
          expected: Json;
          actual: Json;
          description: string;
          suggested_resolution?: string;
          status?: "open" | "resolved" | "expected";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["reconciliation_flags"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          org_id: string;
          actor: string;
          action: string;
          entity_type: string;
          entity_id: string;
          payload: Json;
          prev_hash: string;
          hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          actor: string;
          action: string;
          entity_type: string;
          entity_id: string;
          payload?: Json;
          prev_hash: string;
          hash: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
      documents: {
        Row: {
          id: string;
          org_id: string;
          broker_account_id: string | null;
          storage_path: string;
          doc_type: string;
          status: "uploading" | "processing" | "done" | "failed";
          extracted_data: Json | null;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          broker_account_id?: string | null;
          storage_path: string;
          doc_type?: string;
          status?: "uploading" | "processing" | "done" | "failed";
          extracted_data?: Json | null;
          uploaded_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["documents"]["Insert"]>;
        Relationships: [];
      };
      broker_accounts: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          broker_name: string;
          currency: string;
          exchange: string;
          external_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          broker_name: string;
          currency?: string;
          exchange?: string;
          external_ref?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["broker_accounts"]["Insert"]>;
        Relationships: [];
      };
      tax_computations: {
        Row: {
          id: string;
          org_id: string;
          tax_profile_id: string | null;
          tax_year: string;
          jurisdiction: string;
          filer_status: string;
          short_term_gain: number;
          long_term_gain: number;
          dividend_wht: number;
          estimated_tax_due: number;
          breakdown: Json;
          computed_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          tax_profile_id?: string | null;
          tax_year: string;
          jurisdiction?: string;
          filer_status?: string;
          short_term_gain?: number;
          long_term_gain?: number;
          dividend_wht?: number;
          estimated_tax_due?: number;
          breakdown?: Json;
          computed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tax_computations"]["Insert"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          org_id: string;
          plan: "free" | "pro" | "enterprise";
          status: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          current_period_end: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          plan?: "free" | "pro" | "enterprise";
          status?: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          current_period_end?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
      chat_threads: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_threads"]["Insert"]>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          thread_id: string;
          org_id: string;
          user_id: string;
          ai_message_id: string;
          role: "user" | "assistant" | "system";
          parts: Json;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          org_id: string;
          user_id: string;
          ai_message_id: string;
          role: "user" | "assistant" | "system";
          parts: Json;
          position: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_messages"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          type: string;
          message: string;
          read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          type: string;
          message: string;
          read?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
