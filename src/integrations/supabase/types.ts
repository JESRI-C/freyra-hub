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
      action_evidence: {
        Row: {
          action_id: string
          created_at: string
          created_by: string | null
          evidence_file_id: string | null
          evidence_type: string
          id: string
          media_id: string | null
          note: string | null
        }
        Insert: {
          action_id: string
          created_at?: string
          created_by?: string | null
          evidence_file_id?: string | null
          evidence_type: string
          id?: string
          media_id?: string | null
          note?: string | null
        }
        Update: {
          action_id?: string
          created_at?: string
          created_by?: string | null
          evidence_file_id?: string | null
          evidence_type?: string
          id?: string
          media_id?: string | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "action_evidence_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_evidence_evidence_file_id_fkey"
            columns: ["evidence_file_id"]
            isOneToOne: false
            referencedRelation: "evidence_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_evidence_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "project_media"
            referencedColumns: ["id"]
          },
        ]
      }
      actions: {
        Row: {
          action_type: string | null
          actual_impact: string | null
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          expected_impact: string | null
          id: string
          linked_indicator_id: string | null
          owner: string | null
          priority: string | null
          project_id: string | null
          requires_evidence: boolean
          site_id: string | null
          started_at: string | null
          status: string | null
          title: string
        }
        Insert: {
          action_type?: string | null
          actual_impact?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          expected_impact?: string | null
          id?: string
          linked_indicator_id?: string | null
          owner?: string | null
          priority?: string | null
          project_id?: string | null
          requires_evidence?: boolean
          site_id?: string | null
          started_at?: string | null
          status?: string | null
          title: string
        }
        Update: {
          action_type?: string | null
          actual_impact?: string | null
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          expected_impact?: string | null
          id?: string
          linked_indicator_id?: string | null
          owner?: string | null
          priority?: string | null
          project_id?: string | null
          requires_evidence?: boolean
          site_id?: string | null
          started_at?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "actions_linked_indicator_id_fkey"
            columns: ["linked_indicator_id"]
            isOneToOne: false
            referencedRelation: "indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "actions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor: string | null
          created_at: string | null
          description: string | null
          event_type: string | null
          hash: string | null
          id: string
          project_id: string | null
          source: string | null
          title: string
        }
        Insert: {
          actor?: string | null
          created_at?: string | null
          description?: string | null
          event_type?: string | null
          hash?: string | null
          id?: string
          project_id?: string | null
          source?: string | null
          title: string
        }
        Update: {
          actor?: string | null
          created_at?: string | null
          description?: string | null
          event_type?: string | null
          hash?: string | null
          id?: string
          project_id?: string | null
          source?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_submissions: {
        Row: {
          authority_name: string | null
          created_at: string | null
          id: string
          project_id: string | null
          response_due_date: string | null
          status: string | null
          submission_type: string | null
          submitted_at: string | null
          summary: string | null
          title: string
        }
        Insert: {
          authority_name?: string | null
          created_at?: string | null
          id?: string
          project_id?: string | null
          response_due_date?: string | null
          status?: string | null
          submission_type?: string | null
          submitted_at?: string | null
          summary?: string | null
          title: string
        }
        Update: {
          authority_name?: string | null
          created_at?: string | null
          id?: string
          project_id?: string | null
          response_due_date?: string | null
          status?: string | null
          submission_type?: string | null
          submitted_at?: string | null
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "authority_submissions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calculated_metrics: {
        Row: {
          calculated_at: string | null
          id: string
          method: string | null
          metric_key: string
          metric_label: string
          project_area_id: string | null
          project_id: string | null
          properties: Json | null
          unit: string | null
          value: number | null
        }
        Insert: {
          calculated_at?: string | null
          id?: string
          method?: string | null
          metric_key: string
          metric_label: string
          project_area_id?: string | null
          project_id?: string | null
          properties?: Json | null
          unit?: string | null
          value?: number | null
        }
        Update: {
          calculated_at?: string | null
          id?: string
          method?: string | null
          metric_key?: string
          metric_label?: string
          project_area_id?: string | null
          project_id?: string | null
          properties?: Json | null
          unit?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "calculated_metrics_project_area_id_fkey"
            columns: ["project_area_id"]
            isOneToOne: false
            referencedRelation: "project_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculated_metrics_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      connector_fetch_logs: {
        Row: {
          connector_id: string
          connector_name: string
          fetched_at: string | null
          id: string
          metadata: Json | null
          project_id: string | null
          status: string
          summary: string | null
        }
        Insert: {
          connector_id: string
          connector_name: string
          fetched_at?: string | null
          id?: string
          metadata?: Json | null
          project_id?: string | null
          status: string
          summary?: string | null
        }
        Update: {
          connector_id?: string
          connector_name?: string
          fetched_at?: string | null
          id?: string
          metadata?: Json | null
          project_id?: string | null
          status?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "connector_fetch_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      construction_projects: {
        Row: {
          authority_contact: string | null
          building_area_m2: number | null
          construction_phase: string | null
          construction_type: string | null
          consultant_name: string | null
          contractor_name: string | null
          created_at: string | null
          developer_name: string | null
          expected_end_date: string | null
          expected_start_date: string | null
          id: string
          parcel_reference: string | null
          paved_area_m2: number | null
          project_id: string | null
        }
        Insert: {
          authority_contact?: string | null
          building_area_m2?: number | null
          construction_phase?: string | null
          construction_type?: string | null
          consultant_name?: string | null
          contractor_name?: string | null
          created_at?: string | null
          developer_name?: string | null
          expected_end_date?: string | null
          expected_start_date?: string | null
          id?: string
          parcel_reference?: string | null
          paved_area_m2?: number | null
          project_id?: string | null
        }
        Update: {
          authority_contact?: string | null
          building_area_m2?: number | null
          construction_phase?: string | null
          construction_type?: string | null
          consultant_name?: string | null
          contractor_name?: string | null
          created_at?: string | null
          developer_name?: string | null
          expected_end_date?: string | null
          expected_start_date?: string | null
          id?: string
          parcel_reference?: string | null
          paved_area_m2?: number | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "construction_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      data_sources: {
        Row: {
          config: Json
          created_at: string | null
          description: string | null
          id: string
          last_sync_at: string | null
          last_sync_message: string | null
          last_sync_status: string | null
          name: string
          project_id: string | null
          provider: string | null
          site_id: string | null
          source_type: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          name: string
          project_id?: string | null
          provider?: string | null
          site_id?: string | null
          source_type?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          last_sync_at?: string | null
          last_sync_message?: string | null
          last_sync_status?: string | null
          name?: string
          project_id?: string | null
          provider?: string | null
          site_id?: string | null
          source_type?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_sources_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
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
      environmental_risks: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          likelihood: string | null
          mitigation_summary: string | null
          project_id: string | null
          responsible_party: string | null
          risk_type: string | null
          severity: string | null
          status: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          likelihood?: string | null
          mitigation_summary?: string | null
          project_id?: string | null
          responsible_party?: string | null
          risk_type?: string | null
          severity?: string | null
          status?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          likelihood?: string | null
          mitigation_summary?: string | null
          project_id?: string | null
          responsible_party?: string | null
          risk_type?: string | null
          severity?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "environmental_risks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_files: {
        Row: {
          created_at: string | null
          evidence_type: string | null
          file_type: string | null
          file_url: string | null
          id: string
          project_id: string | null
          report_id: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          evidence_type?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          project_id?: string | null
          report_id?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          evidence_type?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          project_id?: string | null
          report_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidence_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_files_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_features: {
        Row: {
          created_at: string | null
          external_id: string | null
          feature_type: string | null
          geojson: Json | null
          geom: unknown
          id: string
          layer_id: string | null
          name: string | null
          properties: Json | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string | null
          external_id?: string | null
          feature_type?: string | null
          geojson?: Json | null
          geom?: unknown
          id?: string
          layer_id?: string | null
          name?: string | null
          properties?: Json | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string | null
          external_id?: string | null
          feature_type?: string | null
          geojson?: Json | null
          geom?: unknown
          id?: string
          layer_id?: string | null
          name?: string | null
          properties?: Json | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_features_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "map_layers"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_observations: {
        Row: {
          created_at: string | null
          geojson: Json | null
          geom: unknown
          id: string
          layer_id: string | null
          observation_type: string
          observed_at: string
          project_id: string | null
          properties: Json | null
          unit: string | null
          value: number | null
        }
        Insert: {
          created_at?: string | null
          geojson?: Json | null
          geom?: unknown
          id?: string
          layer_id?: string | null
          observation_type: string
          observed_at: string
          project_id?: string | null
          properties?: Json | null
          unit?: string | null
          value?: number | null
        }
        Update: {
          created_at?: string | null
          geojson?: Json | null
          geom?: unknown
          id?: string
          layer_id?: string | null
          observation_type?: string
          observed_at?: string
          project_id?: string | null
          properties?: Json | null
          unit?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "geo_observations_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "map_layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geo_observations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      impact_units: {
        Row: {
          created_at: string | null
          id: string
          issued_at: string | null
          metadata: Json | null
          project_id: string | null
          quantity: number | null
          status: string | null
          unit_type: string | null
          verification_status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          issued_at?: string | null
          metadata?: Json | null
          project_id?: string | null
          quantity?: number | null
          status?: string | null
          unit_type?: string | null
          verification_status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          issued_at?: string | null
          metadata?: Json | null
          project_id?: string | null
          quantity?: number | null
          status?: string | null
          unit_type?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impact_units_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      indicator_measurements: {
        Row: {
          confidence_score: number | null
          created_at: string
          id: string
          indicator_id: string
          measured_at: string
          metadata: Json
          method: string | null
          project_id: string | null
          source: string | null
          unit: string | null
          value: number
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          indicator_id: string
          measured_at?: string
          metadata?: Json
          method?: string | null
          project_id?: string | null
          source?: string | null
          unit?: string | null
          value: number
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          id?: string
          indicator_id?: string
          measured_at?: string
          metadata?: Json
          method?: string | null
          project_id?: string | null
          source?: string | null
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "indicator_measurements_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicator_measurements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      indicators: {
        Row: {
          category: string | null
          description: string | null
          id: string
          key: string
          label: string
          project_id: string | null
          status: string | null
          threshold_critical: number | null
          threshold_direction: string
          threshold_warning: number | null
          trend: string | null
          unit: string | null
          updated_at: string | null
          value: number | null
        }
        Insert: {
          category?: string | null
          description?: string | null
          id?: string
          key: string
          label: string
          project_id?: string | null
          status?: string | null
          threshold_critical?: number | null
          threshold_direction?: string
          threshold_warning?: number | null
          trend?: string | null
          unit?: string | null
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          category?: string | null
          description?: string | null
          id?: string
          key?: string
          label?: string
          project_id?: string | null
          status?: string | null
          threshold_critical?: number | null
          threshold_direction?: string
          threshold_warning?: number | null
          trend?: string | null
          unit?: string | null
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indicators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      map_layers: {
        Row: {
          category: string
          created_at: string | null
          id: string
          is_active: boolean | null
          layer_type: string
          name: string
          provider: string | null
          refresh_interval: string | null
          requires_api_key: boolean | null
          slug: string
          source_url: string | null
          status: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          layer_type: string
          name: string
          provider?: string | null
          refresh_interval?: string | null
          requires_api_key?: boolean | null
          slug: string
          source_url?: string | null
          status?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          layer_type?: string
          name?: string
          provider?: string | null
          refresh_interval?: string | null
          requires_api_key?: boolean | null
          slug?: string
          source_url?: string | null
          status?: string | null
        }
        Relationships: []
      }
      mitigation_measures: {
        Row: {
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          measure_type: string | null
          project_id: string | null
          responsible_party: string | null
          risk_id: string | null
          status: string | null
          title: string
          verification_method: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          measure_type?: string | null
          project_id?: string | null
          responsible_party?: string | null
          risk_id?: string | null
          status?: string | null
          title: string
          verification_method?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          measure_type?: string | null
          project_id?: string | null
          responsible_party?: string | null
          risk_id?: string | null
          status?: string | null
          title?: string
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mitigation_measures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mitigation_measures_risk_id_fkey"
            columns: ["risk_id"]
            isOneToOne: false
            referencedRelation: "environmental_risks"
            referencedColumns: ["id"]
          },
        ]
      }
      nature_contexts: {
        Row: {
          adjacent_nature_type: string | null
          buffer_zone_m: number | null
          created_at: string | null
          distance_to_natura2000_m: number | null
          distance_to_watercourse_m: number | null
          id: string
          natura2000_nearby: boolean | null
          project_id: string | null
          protected_nature_present: boolean | null
          protected_nature_type: string | null
          sensitive_receptors: string | null
          terrain_slope_description: string | null
          watercourse_name: string | null
          watercourse_present: boolean | null
        }
        Insert: {
          adjacent_nature_type?: string | null
          buffer_zone_m?: number | null
          created_at?: string | null
          distance_to_natura2000_m?: number | null
          distance_to_watercourse_m?: number | null
          id?: string
          natura2000_nearby?: boolean | null
          project_id?: string | null
          protected_nature_present?: boolean | null
          protected_nature_type?: string | null
          sensitive_receptors?: string | null
          terrain_slope_description?: string | null
          watercourse_name?: string | null
          watercourse_present?: boolean | null
        }
        Update: {
          adjacent_nature_type?: string | null
          buffer_zone_m?: number | null
          created_at?: string | null
          distance_to_natura2000_m?: number | null
          distance_to_watercourse_m?: number | null
          id?: string
          natura2000_nearby?: boolean | null
          project_id?: string | null
          protected_nature_present?: boolean | null
          protected_nature_type?: string | null
          sensitive_receptors?: string | null
          terrain_slope_description?: string | null
          watercourse_name?: string | null
          watercourse_present?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "nature_contexts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      observations: {
        Row: {
          confidence: number | null
          created_at: string | null
          id: string
          indicator_key: string | null
          metadata: Json | null
          observation_type: string | null
          observed_at: string | null
          project_id: string | null
          site_id: string | null
          source_id: string | null
          unit: string | null
          value: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          indicator_key?: string | null
          metadata?: Json | null
          observation_type?: string | null
          observed_at?: string | null
          project_id?: string | null
          site_id?: string | null
          source_id?: string | null
          unit?: string | null
          value?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          indicator_key?: string | null
          metadata?: Json | null
          observation_type?: string | null
          observed_at?: string | null
          project_id?: string | null
          site_id?: string | null
          source_id?: string | null
          unit?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "observations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observations_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "data_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country: string | null
          created_at: string | null
          id: string
          name: string
          type: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          id?: string
          name: string
          type?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          id?: string
          name?: string
          type?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_areas: {
        Row: {
          area_ha: number | null
          area_type: string | null
          created_at: string | null
          geojson: Json | null
          geom: unknown
          id: string
          name: string
          project_id: string | null
        }
        Insert: {
          area_ha?: number | null
          area_type?: string | null
          created_at?: string | null
          geojson?: Json | null
          geom?: unknown
          id?: string
          name: string
          project_id?: string | null
        }
        Update: {
          area_ha?: number | null
          area_type?: string | null
          created_at?: string | null
          geojson?: Json | null
          geom?: unknown
          id?: string
          name?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_areas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_media: {
        Row: {
          accuracy_m: number | null
          altitude_m: number | null
          captured_at: string | null
          category: string
          description: string | null
          file_path: string
          file_size_bytes: number | null
          id: string
          is_report_ready: boolean
          lat: number | null
          lng: number | null
          mime_type: string | null
          project_id: string
          source: string
          status: string
          tags: string[]
          thumbnail_url: string | null
          title: string
          uploaded_at: string
          url: string
        }
        Insert: {
          accuracy_m?: number | null
          altitude_m?: number | null
          captured_at?: string | null
          category: string
          description?: string | null
          file_path: string
          file_size_bytes?: number | null
          id?: string
          is_report_ready?: boolean
          lat?: number | null
          lng?: number | null
          mime_type?: string | null
          project_id: string
          source: string
          status?: string
          tags?: string[]
          thumbnail_url?: string | null
          title: string
          uploaded_at?: string
          url: string
        }
        Update: {
          accuracy_m?: number | null
          altitude_m?: number | null
          captured_at?: string | null
          category?: string
          description?: string | null
          file_path?: string
          file_size_bytes?: number | null
          id?: string
          is_report_ready?: boolean
          lat?: number | null
          lng?: number | null
          mime_type?: string | null
          project_id?: string
          source?: string
          status?: string
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
          uploaded_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_media_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          country: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          geometry_area_ha: number | null
          geometry_centroid_lat: number | null
          geometry_centroid_lng: number | null
          geometry_polygon: Json | null
          geometry_source: string | null
          id: string
          location_name: string | null
          municipality: string | null
          name: string
          organization_id: string | null
          project_type: string | null
          slug: string | null
          start_date: string | null
          status: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          geometry_area_ha?: number | null
          geometry_centroid_lat?: number | null
          geometry_centroid_lng?: number | null
          geometry_polygon?: Json | null
          geometry_source?: string | null
          id?: string
          location_name?: string | null
          municipality?: string | null
          name: string
          organization_id?: string | null
          project_type?: string | null
          slug?: string | null
          start_date?: string | null
          status?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          geometry_area_ha?: number | null
          geometry_centroid_lat?: number | null
          geometry_centroid_lng?: number | null
          geometry_polygon?: Json | null
          geometry_source?: string | null
          id?: string
          location_name?: string | null
          municipality?: string | null
          name?: string
          organization_id?: string | null
          project_type?: string | null
          slug?: string | null
          start_date?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          id: string
          period_end: string | null
          period_start: string | null
          project_id: string | null
          report_type: string | null
          status: string | null
          summary: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          project_id?: string | null
          report_type?: string | null
          status?: string | null
          summary?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          id?: string
          period_end?: string | null
          period_start?: string | null
          project_id?: string | null
          report_type?: string | null
          status?: string | null
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      runoff_profiles: {
        Row: {
          created_at: string | null
          design_rain_event: string | null
          discharge_point_description: string | null
          drainage_principle: string | null
          estimated_runoff_volume_m3: number | null
          id: string
          maintenance_responsibility: string | null
          oil_separator_present: boolean | null
          project_id: string | null
          retention_solution: string | null
          runoff_destination: string | null
          sediment_control_present: boolean | null
          treatment_solution: string | null
        }
        Insert: {
          created_at?: string | null
          design_rain_event?: string | null
          discharge_point_description?: string | null
          drainage_principle?: string | null
          estimated_runoff_volume_m3?: number | null
          id?: string
          maintenance_responsibility?: string | null
          oil_separator_present?: boolean | null
          project_id?: string | null
          retention_solution?: string | null
          runoff_destination?: string | null
          sediment_control_present?: boolean | null
          treatment_solution?: string | null
        }
        Update: {
          created_at?: string | null
          design_rain_event?: string | null
          discharge_point_description?: string | null
          drainage_principle?: string | null
          estimated_runoff_volume_m3?: number | null
          id?: string
          maintenance_responsibility?: string | null
          oil_separator_present?: boolean | null
          project_id?: string | null
          retention_solution?: string | null
          runoff_destination?: string | null
          sediment_control_present?: boolean | null
          treatment_solution?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runoff_profiles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sensors: {
        Row: {
          created_at: string | null
          id: string
          last_seen_at: string | null
          lat: number | null
          lng: number | null
          name: string
          project_id: string | null
          sensor_type: string | null
          site_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          project_id?: string | null
          sensor_type?: string | null
          site_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_seen_at?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          project_id?: string | null
          sensor_type?: string | null
          site_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sensors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sensors_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          archived_at: string | null
          area_ha: number | null
          baseline_status: string | null
          centroid_lat: number | null
          centroid_lng: number | null
          created_at: string | null
          description: string | null
          geometry_geojson: Json | null
          id: string
          name: string
          project_id: string | null
          site_type: string | null
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          area_ha?: number | null
          baseline_status?: string | null
          centroid_lat?: number | null
          centroid_lng?: number | null
          created_at?: string | null
          description?: string | null
          geometry_geojson?: Json | null
          id?: string
          name: string
          project_id?: string | null
          site_type?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          area_ha?: number | null
          baseline_status?: string | null
          centroid_lat?: number | null
          centroid_lng?: number | null
          created_at?: string | null
          description?: string | null
          geometry_geojson?: Json | null
          id?: string
          name?: string
          project_id?: string | null
          site_type?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
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
    }
    Views: {
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enablelongtransactions: { Args: never; Returns: string }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_project_geojson: { Args: { input_project_id: string }; Returns: Json }
      get_project_metrics: { Args: { input_project_id: string }; Returns: Json }
      gettransactionid: { Args: never; Returns: unknown }
      has_org_role: {
        Args: { _org_id: string; _roles: string[]; _user_id: string }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
