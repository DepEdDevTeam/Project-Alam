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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_settings: {
        Row: {
          active_tier: string
          chat_model: string
          id: number
          max_tokens: number
          router_model: string
          system_prompt_override: string | null
          temperature: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_tier?: string
          chat_model?: string
          id?: number
          max_tokens?: number
          router_model?: string
          system_prompt_override?: string | null
          temperature?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_tier?: string
          chat_model?: string
          id?: number
          max_tokens?: number
          router_model?: string
          system_prompt_override?: string | null
          temperature?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          actor_display_name: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_name: string
          entity_type: string
          event_type: Database["public"]["Enums"]["audit_event_type"]
          id: string
          metadata: Json
        }
        Insert: {
          actor_display_name: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_name: string
          entity_type: string
          event_type: Database["public"]["Enums"]["audit_event_type"]
          id?: string
          metadata?: Json
        }
        Update: {
          actor_display_name?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_name?: string
          entity_type?: string
          event_type?: Database["public"]["Enums"]["audit_event_type"]
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      chat_analytics: {
        Row: {
          collections_used: string[]
          conversation_id: string | null
          created_at: string
          id: string
          latency_ms: number
          tokens_in: number
          tokens_out: number
          user_id: string | null
          was_error: boolean
        }
        Insert: {
          collections_used?: string[]
          conversation_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
          was_error?: boolean
        }
        Update: {
          collections_used?: string[]
          conversation_id?: string | null
          created_at?: string
          id?: string
          latency_ms?: number
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
          was_error?: boolean
        }
        Relationships: []
      }
      collections: {
        Row: {
          ai_parsed_context: string | null
          columns_meta: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_public: boolean
          last_synced_at: string | null
          name: string
          parser_confidence: number | null
          parser_status: Database["public"]["Enums"]["parser_status"]
          parser_summary: string | null
          parser_validation_errors: Json
          parser_warnings: string[]
          row_count: number
          slug: string
          source_filename: string | null
          storage_path: string | null
          sync_error: string | null
          sync_status: Database["public"]["Enums"]["sync_status"]
          updated_at: string
        }
        Insert: {
          ai_parsed_context?: string | null
          columns_meta?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          last_synced_at?: string | null
          name: string
          parser_confidence?: number | null
          parser_status?: Database["public"]["Enums"]["parser_status"]
          parser_summary?: string | null
          parser_validation_errors?: Json
          parser_warnings?: string[]
          row_count?: number
          slug: string
          source_filename?: string | null
          storage_path?: string | null
          sync_error?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
        }
        Update: {
          ai_parsed_context?: string | null
          columns_meta?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_public?: boolean
          last_synced_at?: string | null
          name?: string
          parser_confidence?: number | null
          parser_status?: Database["public"]["Enums"]["parser_status"]
          parser_summary?: string | null
          parser_validation_errors?: Json
          parser_warnings?: string[]
          row_count?: number
          slug?: string
          source_filename?: string | null
          storage_path?: string | null
          sync_error?: string | null
          sync_status?: Database["public"]["Enums"]["sync_status"]
          updated_at?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          pinned: boolean
          tags: string[]
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          pinned?: boolean
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          pinned?: boolean
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      dataset_rows: {
        Row: {
          collection_id: string
          created_at: string
          data: Json
          embedding: string | null
          embedding_model: string | null
          embedding_text: string | null
          id: string
          parser_output_id: string | null
          search_vector: unknown
          sheet_name: string | null
          source_row_index: number | null
        }
        Insert: {
          collection_id: string
          created_at?: string
          data: Json
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          id?: string
          parser_output_id?: string | null
          search_vector?: unknown
          sheet_name?: string | null
          source_row_index?: number | null
        }
        Update: {
          collection_id?: string
          created_at?: string
          data?: Json
          embedding?: string | null
          embedding_model?: string | null
          embedding_text?: string | null
          id?: string
          parser_output_id?: string | null
          search_vector?: unknown
          sheet_name?: string | null
          source_row_index?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dataset_rows_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dataset_rows_parser_output_id_fkey"
            columns: ["parser_output_id"]
            isOneToOne: false
            referencedRelation: "parser_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          embedding_model: string | null
          id: string
          metadata: Json
          page_number: number | null
          parser_output_id: string | null
          search_vector: unknown
          section_title: string | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          metadata?: Json
          page_number?: number | null
          parser_output_id?: string | null
          search_vector?: unknown
          section_title?: string | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          embedding_model?: string | null
          id?: string
          metadata?: Json
          page_number?: number | null
          parser_output_id?: string | null
          search_vector?: unknown
          section_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_chunks_parser_output_id_fkey"
            columns: ["parser_output_id"]
            isOneToOne: false
            referencedRelation: "parser_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          ai_parsed_context: string | null
          created_at: string
          description: string | null
          doc_type: Database["public"]["Enums"]["document_type"]
          file_size_bytes: number | null
          id: string
          is_public: boolean
          metadata: Json
          parser_confidence: number | null
          parser_status: Database["public"]["Enums"]["parser_status"]
          parser_summary: string | null
          parser_validation_errors: Json
          parser_warnings: string[]
          source_filename: string
          storage_path: string | null
          title: string
          total_pages: number
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          ai_parsed_context?: string | null
          created_at?: string
          description?: string | null
          doc_type?: Database["public"]["Enums"]["document_type"]
          file_size_bytes?: number | null
          id?: string
          is_public?: boolean
          metadata?: Json
          parser_confidence?: number | null
          parser_status?: Database["public"]["Enums"]["parser_status"]
          parser_summary?: string | null
          parser_validation_errors?: Json
          parser_warnings?: string[]
          source_filename: string
          storage_path?: string | null
          title: string
          total_pages?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          ai_parsed_context?: string | null
          created_at?: string
          description?: string | null
          doc_type?: Database["public"]["Enums"]["document_type"]
          file_size_bytes?: number | null
          id?: string
          is_public?: boolean
          metadata?: Json
          parser_confidence?: number | null
          parser_status?: Database["public"]["Enums"]["parser_status"]
          parser_summary?: string | null
          parser_validation_errors?: Json
          parser_warnings?: string[]
          source_filename?: string
          storage_path?: string | null
          title?: string
          total_pages?: number
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          citations: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          token_usage: Json | null
        }
        Insert: {
          citations?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          token_usage?: Json | null
        }
        Update: {
          citations?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          token_usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      parser_outputs: {
        Row: {
          collection_id: string | null
          confidence: number
          created_at: string
          created_by: string | null
          document_id: string | null
          entity_type: Database["public"]["Enums"]["parser_entity_type"]
          file_type: string
          id: string
          materialized_at: string | null
          normalized_summary: string | null
          raw_output: Json
          scope_label: string
          scope_type: string
          source_filename: string
          source_storage_path: string | null
          validation_errors: Json
          validation_status: Database["public"]["Enums"]["parser_status"]
          warnings: string[]
        }
        Insert: {
          collection_id?: string | null
          confidence?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          entity_type: Database["public"]["Enums"]["parser_entity_type"]
          file_type: string
          id?: string
          materialized_at?: string | null
          normalized_summary?: string | null
          raw_output: Json
          scope_label: string
          scope_type: string
          source_filename: string
          source_storage_path?: string | null
          validation_errors?: Json
          validation_status?: Database["public"]["Enums"]["parser_status"]
          warnings?: string[]
        }
        Update: {
          collection_id?: string | null
          confidence?: number
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          entity_type?: Database["public"]["Enums"]["parser_entity_type"]
          file_type?: string
          id?: string
          materialized_at?: string | null
          normalized_summary?: string | null
          raw_output?: Json
          scope_label?: string
          scope_type?: string
          source_filename?: string
          source_storage_path?: string | null
          validation_errors?: Json
          validation_status?: Database["public"]["Enums"]["parser_status"]
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "parser_outputs_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parser_outputs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_config: {
        Row: {
          requests_per_minute: number
          tier: string
          updated_at: string
        }
        Insert: {
          requests_per_minute: number
          tier: string
          updated_at?: string
        }
        Update: {
          requests_per_minute?: number
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          id: string
          identifier: string
          tier: string
          window_start: string
        }
        Insert: {
          count?: number
          id?: string
          identifier: string
          tier: string
          window_start?: string
        }
        Update: {
          count?: number
          id?: string
          identifier?: string
          tier?: string
          window_start?: string
        }
        Relationships: []
      }
      response_cache: {
        Row: {
          created_at: string
          expires_at: string
          query_hash: string
          response: Json
        }
        Insert: {
          created_at?: string
          expires_at: string
          query_hash: string
          response: Json
        }
        Update: {
          created_at?: string
          expires_at?: string
          query_hash?: string
          response?: Json
        }
        Relationships: []
      }
      schools: {
        Row: {
          barangay: string | null
          created_at: string
          district: string | null
          division: string | null
          extra: Json
          latitude: number | null
          longitude: number | null
          municipality: string | null
          province: string | null
          region: string | null
          school_id: string
          school_management: string | null
          school_name: string | null
          school_subclassification: string | null
          sector: string | null
          street_address: string | null
          updated_at: string
        }
        Insert: {
          barangay?: string | null
          created_at?: string
          district?: string | null
          division?: string | null
          extra?: Json
          latitude?: number | null
          longitude?: number | null
          municipality?: string | null
          province?: string | null
          region?: string | null
          school_id: string
          school_management?: string | null
          school_name?: string | null
          school_subclassification?: string | null
          sector?: string | null
          street_address?: string | null
          updated_at?: string
        }
        Update: {
          barangay?: string | null
          created_at?: string
          district?: string | null
          division?: string | null
          extra?: Json
          latitude?: number | null
          longitude?: number | null
          municipality?: string | null
          province?: string | null
          region?: string | null
          school_id?: string
          school_management?: string | null
          school_name?: string | null
          school_subclassification?: string | null
          sector?: string | null
          street_address?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      schools_ingest_jobs: {
        Row: {
          column_mapping: Json
          created_at: string
          error_message: string | null
          filename: string
          id: string
          inserted_rows: number
          processed_rows: number
          status: string
          storage_path: string
          total_rows: number
          updated_at: string
          updated_rows: number
          user_id: string
        }
        Insert: {
          column_mapping?: Json
          created_at?: string
          error_message?: string | null
          filename: string
          id?: string
          inserted_rows?: number
          processed_rows?: number
          status?: string
          storage_path: string
          total_rows?: number
          updated_at?: string
          updated_rows?: number
          user_id: string
        }
        Update: {
          column_mapping?: Json
          created_at?: string
          error_message?: string | null
          filename?: string
          id?: string
          inserted_rows?: number
          processed_rows?: number
          status?: string
          storage_path?: string
          total_rows?: number
          updated_at?: string
          updated_rows?: number
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_first_admin: { Args: never; Returns: boolean }
      dataset_numeric_summary: {
        Args: { p_collection_id: string; p_sheet?: string }
        Returns: Json
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      match_dataset_rows: {
        Args: {
          match_count?: number
          p_collection_id: string
          p_sheet?: string
          query_embedding: string
        }
        Returns: {
          data: Json
          id: string
          sheet_name: string
          similarity: number
        }[]
      }
      match_document_chunks: {
        Args: {
          match_count?: number
          p_document_ids?: string[]
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          document_id: string
          id: string
          page_number: number
          section_title: string
          similarity: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
      audit_event_type:
        | "FILE_UPLOADED"
        | "STRUCTURE_VALIDATED"
        | "CONTEXT_MATERIALIZED"
        | "CONTEXT_USED_IN_CHAT"
        | "CONTEXT_UPDATED"
        | "DATASET_DELETED"
        | "DOCUMENT_DELETED"
        | "DOCUMENT_DOWNLOADED"
        | "SYNC_ALL_STATUS_REFRESHED"
        | "DATASET_SYNC_STATUS_REFRESHED"
        | "DOCUMENT_SYNC_STATUS_REFRESHED"
        | "SYNC_STATUS_REFRESH_FAILED"
      document_type: "policy" | "report" | "memo" | "manual" | "other"
      parser_entity_type: "dataset" | "document"
      parser_status:
        | "pending"
        | "processing"
        | "validated"
        | "materialized"
        | "failed"
      sync_status: "ready" | "syncing" | "error" | "pending"
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
      app_role: ["admin", "user", "super_admin"],
      audit_event_type: [
        "FILE_UPLOADED",
        "STRUCTURE_VALIDATED",
        "CONTEXT_MATERIALIZED",
        "CONTEXT_USED_IN_CHAT",
        "CONTEXT_UPDATED",
        "DATASET_DELETED",
        "DOCUMENT_DELETED",
        "DOCUMENT_DOWNLOADED",
        "SYNC_ALL_STATUS_REFRESHED",
        "DATASET_SYNC_STATUS_REFRESHED",
        "DOCUMENT_SYNC_STATUS_REFRESHED",
        "SYNC_STATUS_REFRESH_FAILED",
      ],
      document_type: ["policy", "report", "memo", "manual", "other"],
      parser_entity_type: ["dataset", "document"],
      parser_status: [
        "pending",
        "processing",
        "validated",
        "materialized",
        "failed",
      ],
      sync_status: ["ready", "syncing", "error", "pending"],
    },
  },
} as const
