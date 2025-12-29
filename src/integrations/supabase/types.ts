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
      adjusters: {
        Row: {
          company: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          id: string
          metadata: Json | null
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "ai_knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_knowledge_documents: {
        Row: {
          category: string
          created_at: string
          description: string | null
          error_message: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string
          id: string
          status: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          error_message?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type: string
          id?: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          error_message?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          id?: string
          status?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      automation_executions: {
        Row: {
          automation_id: string
          claim_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          result: Json | null
          started_at: string | null
          status: string
          trigger_data: Json | null
        }
        Insert: {
          automation_id: string
          claim_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          trigger_data?: Json | null
        }
        Update: {
          automation_id?: string
          claim_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          trigger_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_executions_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_executions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json
          conditions: Json | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      claim_adjusters: {
        Row: {
          adjuster_email: string | null
          adjuster_id: string | null
          adjuster_name: string
          adjuster_phone: string | null
          claim_id: string
          company: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_primary: boolean | null
          notes: string | null
        }
        Insert: {
          adjuster_email?: string | null
          adjuster_id?: string | null
          adjuster_name: string
          adjuster_phone?: string | null
          claim_id: string
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_primary?: boolean | null
          notes?: string | null
        }
        Update: {
          adjuster_email?: string | null
          adjuster_id?: string | null
          adjuster_name?: string
          adjuster_phone?: string | null
          claim_id?: string
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_primary?: boolean | null
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_adjusters_adjuster_id_fkey"
            columns: ["adjuster_id"]
            isOneToOne: false
            referencedRelation: "adjusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_adjusters_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_ai_conversations: {
        Row: {
          claim_id: string
          content: string
          created_at: string
          id: string
          role: string
          user_id: string | null
        }
        Insert: {
          claim_id: string
          content: string
          created_at?: string
          id?: string
          role: string
          user_id?: string | null
        }
        Update: {
          claim_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_ai_conversations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_ai_pending_actions: {
        Row: {
          action_type: string
          ai_reasoning: string | null
          claim_id: string
          created_at: string
          draft_content: Json
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          trigger_email_id: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          ai_reasoning?: string | null
          claim_id: string
          created_at?: string
          draft_content: Json
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trigger_email_id?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          ai_reasoning?: string | null
          claim_id?: string
          created_at?: string
          draft_content?: Json
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          trigger_email_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_ai_pending_actions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_ai_pending_actions_trigger_email_id_fkey"
            columns: ["trigger_email_id"]
            isOneToOne: false
            referencedRelation: "emails"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_automations: {
        Row: {
          claim_id: string
          created_at: string
          created_by: string | null
          follow_up_current_count: number
          follow_up_enabled: boolean
          follow_up_interval_days: number
          follow_up_last_sent_at: string | null
          follow_up_max_count: number
          follow_up_next_at: string | null
          follow_up_stop_reason: string | null
          follow_up_stopped_at: string | null
          id: string
          is_enabled: boolean
          settings: Json
          updated_at: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          created_by?: string | null
          follow_up_current_count?: number
          follow_up_enabled?: boolean
          follow_up_interval_days?: number
          follow_up_last_sent_at?: string | null
          follow_up_max_count?: number
          follow_up_next_at?: string | null
          follow_up_stop_reason?: string | null
          follow_up_stopped_at?: string | null
          id?: string
          is_enabled?: boolean
          settings?: Json
          updated_at?: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          created_by?: string | null
          follow_up_current_count?: number
          follow_up_enabled?: boolean
          follow_up_interval_days?: number
          follow_up_last_sent_at?: string | null
          follow_up_max_count?: number
          follow_up_next_at?: string | null
          follow_up_stop_reason?: string | null
          follow_up_stopped_at?: string | null
          id?: string
          is_enabled?: boolean
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_automations_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_checks: {
        Row: {
          amount: number
          check_date: string
          check_number: string | null
          check_type: string
          claim_id: string
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          received_date: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          check_date: string
          check_number?: string | null
          check_type: string
          claim_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          received_date?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          check_date?: string
          check_number?: string | null
          check_type?: string
          claim_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          received_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_checks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_contractors: {
        Row: {
          assigned_at: string | null
          claim_id: string
          contractor_id: string
          id: string
        }
        Insert: {
          assigned_at?: string | null
          claim_id: string
          contractor_id: string
          id?: string
        }
        Update: {
          assigned_at?: string | null
          claim_id?: string
          contractor_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_contractors_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_custom_field_values: {
        Row: {
          claim_id: string
          created_at: string
          custom_field_id: string
          id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          claim_id: string
          created_at?: string
          custom_field_id: string
          id?: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          claim_id?: string
          created_at?: string
          custom_field_id?: string
          id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_custom_field_values_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_custom_field_values_custom_field_id_fkey"
            columns: ["custom_field_id"]
            isOneToOne: false
            referencedRelation: "custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_expenses: {
        Row: {
          amount: number
          category: string | null
          claim_id: string
          created_at: string | null
          created_by: string | null
          description: string
          expense_date: string
          id: string
          notes: string | null
          paid_to: string | null
          payment_method: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          category?: string | null
          claim_id: string
          created_at?: string | null
          created_by?: string | null
          description: string
          expense_date: string
          id?: string
          notes?: string | null
          paid_to?: string | null
          payment_method?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: string | null
          claim_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          expense_date?: string
          id?: string
          notes?: string | null
          paid_to?: string | null
          payment_method?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_expenses_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_fees: {
        Row: {
          adjuster_fee_amount: number
          adjuster_fee_percentage: number
          claim_id: string
          company_fee_amount: number
          company_fee_percentage: number
          contractor_fee_amount: number
          contractor_fee_percentage: number
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          referrer_fee_amount: number
          referrer_fee_percentage: number
          updated_at: string | null
        }
        Insert: {
          adjuster_fee_amount?: number
          adjuster_fee_percentage?: number
          claim_id: string
          company_fee_amount?: number
          company_fee_percentage?: number
          contractor_fee_amount?: number
          contractor_fee_percentage?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          referrer_fee_amount?: number
          referrer_fee_percentage?: number
          updated_at?: string | null
        }
        Update: {
          adjuster_fee_amount?: number
          adjuster_fee_percentage?: number
          claim_id?: string
          company_fee_amount?: number
          company_fee_percentage?: number
          contractor_fee_amount?: number
          contractor_fee_percentage?: number
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          referrer_fee_amount?: number
          referrer_fee_percentage?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_fees_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: true
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_files: {
        Row: {
          claim_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          folder_id: string | null
          id: string
          uploaded_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          claim_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          folder_id?: string | null
          id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          claim_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          folder_id?: string | null
          id?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_files_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "claim_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_folders: {
        Row: {
          claim_id: string
          created_at: string | null
          created_by: string | null
          display_order: number | null
          id: string
          is_predefined: boolean | null
          name: string
        }
        Insert: {
          claim_id: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          id?: string
          is_predefined?: boolean | null
          name: string
        }
        Update: {
          claim_id?: string
          created_at?: string | null
          created_by?: string | null
          display_order?: number | null
          id?: string
          is_predefined?: boolean | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_folders_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_payments: {
        Row: {
          amount: number
          check_number: string | null
          claim_id: string
          created_at: string
          created_by: string | null
          direction: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string
          recipient_id: string | null
          recipient_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          check_number?: string | null
          claim_id: string
          created_at?: string
          created_by?: string | null
          direction?: string | null
          id?: string
          notes?: string | null
          payment_date: string
          payment_method: string
          recipient_id?: string | null
          recipient_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          check_number?: string | null
          claim_id?: string
          created_at?: string
          created_by?: string | null
          direction?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string
          recipient_id?: string | null
          recipient_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_payments_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_photos: {
        Row: {
          annotated_file_path: string | null
          annotations: Json | null
          before_after_pair_id: string | null
          before_after_type: string | null
          category: string | null
          claim_id: string
          created_at: string | null
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          taken_at: string | null
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          annotated_file_path?: string | null
          annotations?: Json | null
          before_after_pair_id?: string | null
          before_after_type?: string | null
          category?: string | null
          claim_id: string
          created_at?: string | null
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          taken_at?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          annotated_file_path?: string | null
          annotations?: Json | null
          before_after_pair_id?: string | null
          before_after_type?: string | null
          category?: string | null
          claim_id?: string
          created_at?: string | null
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          taken_at?: string | null
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_photos_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_settlements: {
        Row: {
          claim_id: string
          created_at: string | null
          created_by: string | null
          deductible: number
          estimate_amount: number | null
          id: string
          non_recoverable_depreciation: number
          notes: string | null
          other_structures_deductible: number | null
          other_structures_non_recoverable_depreciation: number | null
          other_structures_rcv: number | null
          other_structures_recoverable_depreciation: number | null
          prior_offer: number | null
          pwi_deductible: number | null
          pwi_non_recoverable_depreciation: number | null
          pwi_rcv: number | null
          pwi_recoverable_depreciation: number | null
          recoverable_depreciation: number
          replacement_cost_value: number
          total_settlement: number | null
          updated_at: string | null
        }
        Insert: {
          claim_id: string
          created_at?: string | null
          created_by?: string | null
          deductible?: number
          estimate_amount?: number | null
          id?: string
          non_recoverable_depreciation?: number
          notes?: string | null
          other_structures_deductible?: number | null
          other_structures_non_recoverable_depreciation?: number | null
          other_structures_rcv?: number | null
          other_structures_recoverable_depreciation?: number | null
          prior_offer?: number | null
          pwi_deductible?: number | null
          pwi_non_recoverable_depreciation?: number | null
          pwi_rcv?: number | null
          pwi_recoverable_depreciation?: number | null
          recoverable_depreciation?: number
          replacement_cost_value?: number
          total_settlement?: number | null
          updated_at?: string | null
        }
        Update: {
          claim_id?: string
          created_at?: string | null
          created_by?: string | null
          deductible?: number
          estimate_amount?: number | null
          id?: string
          non_recoverable_depreciation?: number
          notes?: string | null
          other_structures_deductible?: number | null
          other_structures_non_recoverable_depreciation?: number | null
          other_structures_rcv?: number | null
          other_structures_recoverable_depreciation?: number | null
          prior_offer?: number | null
          pwi_deductible?: number | null
          pwi_non_recoverable_depreciation?: number | null
          pwi_rcv?: number | null
          pwi_recoverable_depreciation?: number | null
          recoverable_depreciation?: number
          replacement_cost_value?: number
          total_settlement?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_settlements_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_staff: {
        Row: {
          assigned_at: string | null
          claim_id: string
          id: string
          staff_id: string
        }
        Insert: {
          assigned_at?: string | null
          claim_id: string
          id?: string
          staff_id: string
        }
        Update: {
          assigned_at?: string | null
          claim_id?: string
          id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_staff_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_statuses: {
        Row: {
          color: string | null
          created_at: string | null
          display_order: number
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      claim_updates: {
        Row: {
          claim_id: string
          content: string
          created_at: string | null
          id: string
          recipients: Json | null
          update_type: string | null
          user_id: string | null
        }
        Insert: {
          claim_id: string
          content: string
          created_at?: string | null
          id?: string
          recipients?: Json | null
          update_type?: string | null
          user_id?: string | null
        }
        Update: {
          claim_id?: string
          content?: string
          created_at?: string | null
          id?: string
          recipients?: Json | null
          update_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_updates_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          adjuster_email: string | null
          adjuster_name: string | null
          adjuster_phone: string | null
          claim_amount: number | null
          claim_email_id: string | null
          claim_number: string | null
          client_id: string | null
          construction_status: string | null
          created_at: string | null
          id: string
          insurance_company: string | null
          insurance_company_id: string | null
          insurance_email: string | null
          insurance_phone: string | null
          is_closed: boolean
          jobnimbus_job_id: string | null
          loan_number: string | null
          loss_date: string | null
          loss_description: string | null
          loss_type: string | null
          loss_type_id: string | null
          mortgage_company_id: string | null
          partner_construction_status: string | null
          policy_number: string | null
          policyholder_address: string | null
          policyholder_email: string | null
          policyholder_name: string | null
          policyholder_phone: string | null
          referrer_id: string | null
          ssn_last_four: string | null
          status: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        Insert: {
          adjuster_email?: string | null
          adjuster_name?: string | null
          adjuster_phone?: string | null
          claim_amount?: number | null
          claim_email_id?: string | null
          claim_number?: string | null
          client_id?: string | null
          construction_status?: string | null
          created_at?: string | null
          id?: string
          insurance_company?: string | null
          insurance_company_id?: string | null
          insurance_email?: string | null
          insurance_phone?: string | null
          is_closed?: boolean
          jobnimbus_job_id?: string | null
          loan_number?: string | null
          loss_date?: string | null
          loss_description?: string | null
          loss_type?: string | null
          loss_type_id?: string | null
          mortgage_company_id?: string | null
          partner_construction_status?: string | null
          policy_number?: string | null
          policyholder_address?: string | null
          policyholder_email?: string | null
          policyholder_name?: string | null
          policyholder_phone?: string | null
          referrer_id?: string | null
          ssn_last_four?: string | null
          status?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Update: {
          adjuster_email?: string | null
          adjuster_name?: string | null
          adjuster_phone?: string | null
          claim_amount?: number | null
          claim_email_id?: string | null
          claim_number?: string | null
          client_id?: string | null
          construction_status?: string | null
          created_at?: string | null
          id?: string
          insurance_company?: string | null
          insurance_company_id?: string | null
          insurance_email?: string | null
          insurance_phone?: string | null
          is_closed?: boolean
          jobnimbus_job_id?: string | null
          loan_number?: string | null
          loss_date?: string | null
          loss_description?: string | null
          loss_type?: string | null
          loss_type_id?: string | null
          mortgage_company_id?: string | null
          partner_construction_status?: string | null
          policy_number?: string | null
          policyholder_address?: string | null
          policyholder_email?: string | null
          policyholder_name?: string | null
          policyholder_phone?: string | null
          referrer_id?: string | null
          ssn_last_four?: string | null
          status?: string | null
          updated_at?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "claims_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_insurance_company_id_fkey"
            columns: ["insurance_company_id"]
            isOneToOne: false
            referencedRelation: "insurance_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_loss_type_id_fkey"
            columns: ["loss_type_id"]
            isOneToOne: false
            referencedRelation: "loss_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_mortgage_company_id_fkey"
            columns: ["mortgage_company_id"]
            isOneToOne: false
            referencedRelation: "mortgage_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          city: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          state: string | null
          street: string | null
          stripe_account_id: string | null
          updated_at: string | null
          user_id: string | null
          zip_code: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          state?: string | null
          street?: string | null
          stripe_account_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          zip_code?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          state?: string | null
          street?: string | null
          stripe_account_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          zip_code?: string | null
        }
        Relationships: []
      }
      company_branding: {
        Row: {
          automation_exclude_claims_older_than_days: number | null
          automation_exclude_statuses: string[] | null
          automations_enabled: boolean | null
          company_address: string | null
          company_email: string | null
          company_name: string | null
          company_phone: string | null
          created_at: string
          id: string
          letterhead_url: string | null
          online_check_writer_bank_account_id: string | null
          signnow_make_webhook_url: string | null
          updated_at: string
        }
        Insert: {
          automation_exclude_claims_older_than_days?: number | null
          automation_exclude_statuses?: string[] | null
          automations_enabled?: boolean | null
          company_address?: string | null
          company_email?: string | null
          company_name?: string | null
          company_phone?: string | null
          created_at?: string
          id?: string
          letterhead_url?: string | null
          online_check_writer_bank_account_id?: string | null
          signnow_make_webhook_url?: string | null
          updated_at?: string
        }
        Update: {
          automation_exclude_claims_older_than_days?: number | null
          automation_exclude_statuses?: string[] | null
          automations_enabled?: boolean | null
          company_address?: string | null
          company_email?: string | null
          company_name?: string | null
          company_phone?: string | null
          created_at?: string
          id?: string
          letterhead_url?: string | null
          online_check_writer_bank_account_id?: string | null
          signnow_make_webhook_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      custom_fields: {
        Row: {
          created_at: string
          created_by: string | null
          display_order: number | null
          field_type: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          label: string
          name: string
          options: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_order?: number | null
          field_type: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label: string
          name: string
          options?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_order?: number | null
          field_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          label?: string
          name?: string
          options?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      darwin_analysis_results: {
        Row: {
          analysis_type: string
          claim_id: string
          created_at: string
          created_by: string | null
          id: string
          input_summary: string | null
          pdf_file_name: string | null
          result: string
        }
        Insert: {
          analysis_type: string
          claim_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          input_summary?: string | null
          pdf_file_name?: string | null
          result: string
        }
        Update: {
          analysis_type?: string
          claim_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          input_summary?: string | null
          pdf_file_name?: string | null
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "darwin_analysis_results_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          file_name: string
          file_path: string
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          file_name: string
          file_path: string
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          file_name?: string
          file_path?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      emails: {
        Row: {
          body: string
          claim_id: string
          created_at: string | null
          id: string
          recipient_email: string
          recipient_name: string | null
          recipient_type: string | null
          sent_at: string | null
          sent_by: string | null
          subject: string
        }
        Insert: {
          body: string
          claim_id: string
          created_at?: string | null
          id?: string
          recipient_email: string
          recipient_name?: string | null
          recipient_type?: string | null
          sent_at?: string | null
          sent_by?: string | null
          subject: string
        }
        Update: {
          body?: string
          claim_id?: string
          created_at?: string | null
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          recipient_type?: string | null
          sent_at?: string | null
          sent_by?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "emails_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      file_comments: {
        Row: {
          body: string
          created_at: string
          file_id: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          file_id: string
          id?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          file_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_comments_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "claim_files"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          claim_id: string
          created_at: string
          created_by: string | null
          id: string
          inspection_date: string
          inspection_time: string | null
          inspection_type: string | null
          inspector_name: string | null
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_date: string
          inspection_time?: string | null
          inspection_type?: string | null
          inspector_name?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          inspection_date?: string
          inspection_time?: string | null
          inspection_type?: string | null
          inspector_name?: string | null
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_companies: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      jobnimbus_sync_queue: {
        Row: {
          claim_id: string | null
          contractor_id: string
          created_at: string | null
          error_message: string | null
          id: string
          payload: Json | null
          processed_at: string | null
          status: string | null
          sync_type: string
        }
        Insert: {
          claim_id?: string | null
          contractor_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: string | null
          sync_type: string
        }
        Update: {
          claim_id?: string | null
          contractor_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          processed_at?: string | null
          status?: string | null
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobnimbus_sync_queue_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      linked_claims: {
        Row: {
          claim_id: string
          created_by: string | null
          external_claim_id: string | null
          external_instance_url: string
          id: string
          instance_name: string
          last_synced_at: string | null
          linked_at: string | null
          sync_status: string | null
        }
        Insert: {
          claim_id: string
          created_by?: string | null
          external_claim_id?: string | null
          external_instance_url: string
          id?: string
          instance_name: string
          last_synced_at?: string | null
          linked_at?: string | null
          sync_status?: string | null
        }
        Update: {
          claim_id?: string
          created_by?: string | null
          external_claim_id?: string | null
          external_instance_url?: string
          id?: string
          instance_name?: string
          last_synced_at?: string | null
          linked_at?: string | null
          sync_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "linked_claims_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      linked_workspaces: {
        Row: {
          created_at: string | null
          created_by: string | null
          external_instance_url: string
          id: string
          instance_name: string
          last_synced_at: string | null
          sync_secret: string
          sync_status: string | null
          target_workspace_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          external_instance_url: string
          id?: string
          instance_name: string
          last_synced_at?: string | null
          sync_secret: string
          sync_status?: string | null
          target_workspace_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          external_instance_url?: string
          id?: string
          instance_name?: string
          last_synced_at?: string | null
          sync_secret?: string
          sync_status?: string | null
          target_workspace_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "linked_workspaces_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      loss_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      mortgage_companies: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email_enabled?: boolean
          id?: string
          in_app_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          claim_id: string
          created_at: string
          id: string
          is_read: boolean
          update_id: string
          user_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          update_id: string
          user_id: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          update_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "claim_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_sales_commissions: {
        Row: {
          claim_id: string
          commission_amount: number | null
          commission_percentage: number | null
          created_at: string
          id: string
          notes: string | null
          org_id: string
          sales_rep_id: string | null
          updated_at: string
        }
        Insert: {
          claim_id: string
          commission_amount?: number | null
          commission_percentage?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          sales_rep_id?: string | null
          updated_at?: string
        }
        Update: {
          claim_id?: string
          commission_amount?: number | null
          commission_percentage?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          sales_rep_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_sales_commissions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_sales_commissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          domain: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_status: string
          created_at: string | null
          email: string
          email_signature: string | null
          external_instance_name: string | null
          external_instance_url: string | null
          full_name: string | null
          id: string
          jobnimbus_api_key: string | null
          jobnimbus_enabled: boolean | null
          license_number: string | null
          license_state: string | null
          phone: string | null
          stripe_account_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          approval_status?: string
          created_at?: string | null
          email: string
          email_signature?: string | null
          external_instance_name?: string | null
          external_instance_url?: string | null
          full_name?: string | null
          id: string
          jobnimbus_api_key?: string | null
          jobnimbus_enabled?: boolean | null
          license_number?: string | null
          license_state?: string | null
          phone?: string | null
          stripe_account_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_status?: string
          created_at?: string | null
          email?: string
          email_signature?: string | null
          external_instance_name?: string | null
          external_instance_url?: string | null
          full_name?: string | null
          id?: string
          jobnimbus_api_key?: string | null
          jobnimbus_enabled?: boolean | null
          license_number?: string | null
          license_state?: string | null
          phone?: string | null
          stripe_account_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      referrers: {
        Row: {
          company: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          stripe_account_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          stripe_account_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      signature_field_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          field_data: Json
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          field_data?: Json
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          field_data?: Json
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      signature_requests: {
        Row: {
          claim_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          document_name: string
          document_path: string
          field_data: Json | null
          id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          claim_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          document_name: string
          document_path: string
          field_data?: Json | null
          id?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          claim_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          document_name?: string
          document_path?: string
          field_data?: Json | null
          id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signature_requests_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_signers: {
        Row: {
          access_token: string
          created_at: string | null
          field_values: Json | null
          id: string
          signature_data: string | null
          signature_request_id: string
          signed_at: string | null
          signer_email: string
          signer_name: string
          signer_type: string
          signing_order: number
          status: string
        }
        Insert: {
          access_token?: string
          created_at?: string | null
          field_values?: Json | null
          id?: string
          signature_data?: string | null
          signature_request_id: string
          signed_at?: string | null
          signer_email: string
          signer_name: string
          signer_type: string
          signing_order?: number
          status?: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          field_values?: Json | null
          id?: string
          signature_data?: string | null
          signature_request_id?: string
          signed_at?: string | null
          signer_email?: string
          signer_name?: string
          signer_type?: string
          signing_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_signers_signature_request_id_fkey"
            columns: ["signature_request_id"]
            isOneToOne: false
            referencedRelation: "signature_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_messages: {
        Row: {
          claim_id: string
          created_at: string
          direction: string
          from_number: string
          id: string
          message_body: string
          status: string
          telnyx_message_id: string | null
          to_number: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          claim_id: string
          created_at?: string
          direction?: string
          from_number: string
          id?: string
          message_body: string
          status?: string
          telnyx_message_id?: string | null
          to_number: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          claim_id?: string
          created_at?: string
          direction?: string
          from_number?: string
          id?: string
          message_body?: string
          status?: string
          telnyx_message_id?: string | null
          to_number?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_messages_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_automations: {
        Row: {
          created_at: string | null
          description: string | null
          due_date_offset: number | null
          id: string
          is_active: boolean | null
          priority: string | null
          title: string
          trigger_status: string | null
          trigger_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          due_date_offset?: number | null
          id?: string
          is_active?: boolean | null
          priority?: string | null
          title: string
          trigger_status?: string | null
          trigger_type: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          due_date_offset?: number | null
          id?: string
          is_active?: boolean | null
          priority?: string | null
          title?: string
          trigger_status?: string | null
          trigger_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          claim_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          follow_up_current_count: number | null
          follow_up_enabled: boolean | null
          follow_up_interval_days: number | null
          follow_up_last_sent_at: string | null
          follow_up_max_count: number | null
          follow_up_next_at: string | null
          follow_up_stop_reason: string | null
          follow_up_stopped_at: string | null
          id: string
          priority: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          claim_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          follow_up_current_count?: number | null
          follow_up_enabled?: boolean | null
          follow_up_interval_days?: number | null
          follow_up_last_sent_at?: string | null
          follow_up_max_count?: number | null
          follow_up_next_at?: string | null
          follow_up_stop_reason?: string | null
          follow_up_stopped_at?: string | null
          id?: string
          priority?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          claim_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          follow_up_current_count?: number | null
          follow_up_enabled?: boolean | null
          follow_up_interval_days?: number | null
          follow_up_last_sent_at?: string | null
          follow_up_max_count?: number | null
          follow_up_next_at?: string | null
          follow_up_stop_reason?: string | null
          follow_up_stopped_at?: string | null
          id?: string
          priority?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workspace_invites: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          invited_by: string | null
          invited_domain: string | null
          invited_email: string | null
          invited_org_id: string | null
          role: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          invited_domain?: string | null
          invited_email?: string | null
          invited_org_id?: string | null
          role?: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          invited_domain?: string | null
          invited_email?: string | null
          invited_org_id?: string | null
          role?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_invited_org_id_fkey"
            columns: ["invited_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          org_id: string
          role: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          org_id: string
          role?: string
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          org_id?: string
          role?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "workspace_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_threads: {
        Row: {
          claim_id: string | null
          created_at: string
          created_by: string | null
          id: string
          subject: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          claim_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          subject?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          claim_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          subject?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_threads_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_threads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          owner_org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          owner_org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          owner_org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_roles: { Args: { _user_id: string }; Returns: boolean }
      create_claim_for_staff: {
        Args: {
          p_claim_number: string
          p_client_id: string
          p_insurance_company_id: string
          p_insurance_email: string
          p_insurance_phone: string
          p_loss_date: string
          p_loss_description: string
          p_loss_type_id: string
          p_policy_number: string
          p_policyholder_address: string
          p_policyholder_email: string
          p_policyholder_name: string
          p_policyholder_phone: string
          p_referrer_id: string
        }
        Returns: {
          adjuster_email: string | null
          adjuster_name: string | null
          adjuster_phone: string | null
          claim_amount: number | null
          claim_email_id: string | null
          claim_number: string | null
          client_id: string | null
          construction_status: string | null
          created_at: string | null
          id: string
          insurance_company: string | null
          insurance_company_id: string | null
          insurance_email: string | null
          insurance_phone: string | null
          is_closed: boolean
          jobnimbus_job_id: string | null
          loan_number: string | null
          loss_date: string | null
          loss_description: string | null
          loss_type: string | null
          loss_type_id: string | null
          mortgage_company_id: string | null
          partner_construction_status: string | null
          policy_number: string | null
          policyholder_address: string | null
          policyholder_email: string | null
          policyholder_name: string | null
          policyholder_phone: string | null
          referrer_id: string | null
          ssn_last_four: string | null
          status: string | null
          updated_at: string | null
          workspace_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_or_create_notification_preferences: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          email_enabled: boolean
          id: string
          in_app_enabled: boolean
          sms_enabled: boolean
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_workspace_access: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_org_admin: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      user_org_id: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "staff" | "client" | "contractor" | "referrer"
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
      app_role: ["admin", "staff", "client", "contractor", "referrer"],
    },
  },
} as const
