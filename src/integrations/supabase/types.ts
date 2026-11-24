export type Json =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: Json | undefined;
    }
  | Json[];
export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      action_evidence: {
        Row: {
          action_id: string;
          created_at: string;
          created_by: string | null;
          evidence_file_id: string | null;
          evidence_type: string;
          id: string;
          media_id: string | null;
          note: string | null;
        };
        Insert: {
          action_id: string;
          created_at?: string;
          created_by?: string | null;
          evidence_file_id?: string | null;
          evidence_type: string;
          id?: string;
          media_id?: string | null;
          note?: string | null;
        };
        Update: {
          action_id?: string;
          created_at?: string;
          created_by?: string | null;
          evidence_file_id?: string | null;
          evidence_type?: string;
          id?: string;
          media_id?: string | null;
          note?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "action_evidence_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_evidence_evidence_file_id_fkey";
            columns: ["evidence_file_id"];
            isOneToOne: false;
            referencedRelation: "evidence_files";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_evidence_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "project_media";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_evidence_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "action_evidence_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "reviewed_report_media_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      actions: {
        Row: {
          action_type: string | null;
          actual_impact: string | null;
          completed_at: string | null;
          created_at: string | null;
          description: string | null;
          due_date: string | null;
          expected_impact: string | null;
          id: string;
          linked_indicator_id: string | null;
          owner: string | null;
          priority: string | null;
          project_id: string | null;
          requires_evidence: boolean;
          site_id: string | null;
          started_at: string | null;
          status: string | null;
          title: string;
        };
        Insert: {
          action_type?: string | null;
          actual_impact?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          expected_impact?: string | null;
          id?: string;
          linked_indicator_id?: string | null;
          owner?: string | null;
          priority?: string | null;
          project_id?: string | null;
          requires_evidence?: boolean;
          site_id?: string | null;
          started_at?: string | null;
          status?: string | null;
          title: string;
        };
        Update: {
          action_type?: string | null;
          actual_impact?: string | null;
          completed_at?: string | null;
          created_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          expected_impact?: string | null;
          id?: string;
          linked_indicator_id?: string | null;
          owner?: string | null;
          priority?: string | null;
          project_id?: string | null;
          requires_evidence?: boolean;
          site_id?: string | null;
          started_at?: string | null;
          status?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "actions_linked_indicator_id_fkey";
            columns: ["linked_indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      alert_comments: {
        Row: {
          alert_id: string;
          author_id: string;
          content: string;
          created_at: string;
          id: string;
        };
        Insert: {
          alert_id: string;
          author_id: string;
          content: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          alert_id?: string;
          author_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alert_comments_alert_id_fkey";
            columns: ["alert_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_alerts";
            referencedColumns: ["id"];
          },
        ];
      };
      alert_rules: {
        Row: {
          action_template_id: string | null;
          assignment_rule: Json | null;
          condition: Json;
          created_at: string;
          description: string | null;
          id: string;
          is_active: boolean;
          name: string;
          notification_channels: Json;
          organization_id: string | null;
          project_id: string | null;
          severity: string;
          trigger_type: string;
          updated_at: string;
        };
        Insert: {
          action_template_id?: string | null;
          assignment_rule?: Json | null;
          condition?: Json;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          notification_channels?: Json;
          organization_id?: string | null;
          project_id?: string | null;
          severity?: string;
          trigger_type: string;
          updated_at?: string;
        };
        Update: {
          action_template_id?: string | null;
          assignment_rule?: Json | null;
          condition?: Json;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          notification_channels?: Json;
          organization_id?: string | null;
          project_id?: string | null;
          severity?: string;
          trigger_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alert_rules_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_events: {
        Row: {
          actor: string | null;
          after_data: Json | null;
          before_data: Json | null;
          created_at: string | null;
          description: string | null;
          entity_id: string | null;
          entity_type: string | null;
          event_type: string | null;
          hash: string | null;
          id: string;
          project_id: string | null;
          source: string | null;
          title: string;
        };
        Insert: {
          actor?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string | null;
          description?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          event_type?: string | null;
          hash?: string | null;
          id?: string;
          project_id?: string | null;
          source?: string | null;
          title: string;
        };
        Update: {
          actor?: string | null;
          after_data?: Json | null;
          before_data?: Json | null;
          created_at?: string | null;
          description?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          event_type?: string | null;
          hash?: string | null;
          id?: string;
          project_id?: string | null;
          source?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      authority_submissions: {
        Row: {
          authority_name: string | null;
          created_at: string | null;
          id: string;
          project_id: string | null;
          response_due_date: string | null;
          status: string | null;
          submission_type: string | null;
          submitted_at: string | null;
          summary: string | null;
          title: string;
        };
        Insert: {
          authority_name?: string | null;
          created_at?: string | null;
          id?: string;
          project_id?: string | null;
          response_due_date?: string | null;
          status?: string | null;
          submission_type?: string | null;
          submitted_at?: string | null;
          summary?: string | null;
          title: string;
        };
        Update: {
          authority_name?: string | null;
          created_at?: string | null;
          id?: string;
          project_id?: string | null;
          response_due_date?: string | null;
          status?: string | null;
          submission_type?: string | null;
          submitted_at?: string | null;
          summary?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "authority_submissions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      calculated_metrics: {
        Row: {
          calculated_at: string | null;
          id: string;
          method: string | null;
          metric_key: string;
          metric_label: string;
          project_area_id: string | null;
          project_id: string | null;
          properties: Json | null;
          unit: string | null;
          value: number | null;
        };
        Insert: {
          calculated_at?: string | null;
          id?: string;
          method?: string | null;
          metric_key: string;
          metric_label: string;
          project_area_id?: string | null;
          project_id?: string | null;
          properties?: Json | null;
          unit?: string | null;
          value?: number | null;
        };
        Update: {
          calculated_at?: string | null;
          id?: string;
          method?: string | null;
          metric_key?: string;
          metric_label?: string;
          project_area_id?: string | null;
          project_id?: string | null;
          properties?: Json | null;
          unit?: string | null;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "calculated_metrics_project_area_id_fkey";
            columns: ["project_area_id"];
            isOneToOne: false;
            referencedRelation: "project_areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calculated_metrics_project_area_same_project";
            columns: ["project_area_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "project_areas";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "calculated_metrics_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      connector_fetch_logs: {
        Row: {
          connector_id: string;
          connector_name: string;
          fetched_at: string | null;
          id: string;
          metadata: Json | null;
          project_id: string | null;
          status: string;
          summary: string | null;
        };
        Insert: {
          connector_id: string;
          connector_name: string;
          fetched_at?: string | null;
          id?: string;
          metadata?: Json | null;
          project_id?: string | null;
          status: string;
          summary?: string | null;
        };
        Update: {
          connector_id?: string;
          connector_name?: string;
          fetched_at?: string | null;
          id?: string;
          metadata?: Json | null;
          project_id?: string | null;
          status?: string;
          summary?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "connector_fetch_logs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      construction_projects: {
        Row: {
          authority_contact: string | null;
          building_area_m2: number | null;
          construction_phase: string | null;
          construction_type: string | null;
          consultant_name: string | null;
          contractor_name: string | null;
          created_at: string | null;
          developer_name: string | null;
          expected_end_date: string | null;
          expected_start_date: string | null;
          id: string;
          parcel_reference: string | null;
          paved_area_m2: number | null;
          project_id: string | null;
        };
        Insert: {
          authority_contact?: string | null;
          building_area_m2?: number | null;
          construction_phase?: string | null;
          construction_type?: string | null;
          consultant_name?: string | null;
          contractor_name?: string | null;
          created_at?: string | null;
          developer_name?: string | null;
          expected_end_date?: string | null;
          expected_start_date?: string | null;
          id?: string;
          parcel_reference?: string | null;
          paved_area_m2?: number | null;
          project_id?: string | null;
        };
        Update: {
          authority_contact?: string | null;
          building_area_m2?: number | null;
          construction_phase?: string | null;
          construction_type?: string | null;
          consultant_name?: string | null;
          contractor_name?: string | null;
          created_at?: string | null;
          developer_name?: string | null;
          expected_end_date?: string | null;
          expected_start_date?: string | null;
          id?: string;
          parcel_reference?: string | null;
          paved_area_m2?: number | null;
          project_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "construction_projects_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      data_exports: {
        Row: {
          completed_at: string | null;
          error_message: string | null;
          export_type: string;
          file_path: string | null;
          file_size_bytes: number | null;
          filters: Json;
          format: string;
          id: string;
          metadata: Json;
          project_id: string;
          requested_at: string;
          requested_by: string | null;
          row_count: number | null;
          status: string;
        };
        Insert: {
          completed_at?: string | null;
          error_message?: string | null;
          export_type: string;
          file_path?: string | null;
          file_size_bytes?: number | null;
          filters?: Json;
          format: string;
          id?: string;
          metadata?: Json;
          project_id: string;
          requested_at?: string;
          requested_by?: string | null;
          row_count?: number | null;
          status?: string;
        };
        Update: {
          completed_at?: string | null;
          error_message?: string | null;
          export_type?: string;
          file_path?: string | null;
          file_size_bytes?: number | null;
          filters?: Json;
          format?: string;
          id?: string;
          metadata?: Json;
          project_id?: string;
          requested_at?: string;
          requested_by?: string | null;
          row_count?: number | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "data_exports_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      data_quality_assessments: {
        Row: {
          assessed_at: string;
          completeness_score: number | null;
          consistency_score: number | null;
          created_at: string;
          explanation: string | null;
          id: string;
          metadata: Json;
          overall_score: number | null;
          project_id: string;
          scope_id: string | null;
          scope_type: string;
          spatial_score: number | null;
          temporal_score: number | null;
          timeliness_score: number | null;
          validation_score: number | null;
        };
        Insert: {
          assessed_at?: string;
          completeness_score?: number | null;
          consistency_score?: number | null;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          metadata?: Json;
          overall_score?: number | null;
          project_id: string;
          scope_id?: string | null;
          scope_type: string;
          spatial_score?: number | null;
          temporal_score?: number | null;
          timeliness_score?: number | null;
          validation_score?: number | null;
        };
        Update: {
          assessed_at?: string;
          completeness_score?: number | null;
          consistency_score?: number | null;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          metadata?: Json;
          overall_score?: number | null;
          project_id?: string;
          scope_id?: string | null;
          scope_type?: string;
          spatial_score?: number | null;
          temporal_score?: number | null;
          timeliness_score?: number | null;
          validation_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "data_quality_assessments_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      data_quality_issues: {
        Row: {
          corrected_data: Json | null;
          created_at: string;
          data_source_id: string | null;
          description: string | null;
          device_id: string | null;
          id: string;
          issue_type: string;
          measurement_id: string | null;
          original_data: Json | null;
          project_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          severity: string;
          status: string;
          updated_at: string;
          upload_id: string | null;
          zone_id: string | null;
        };
        Insert: {
          corrected_data?: Json | null;
          created_at?: string;
          data_source_id?: string | null;
          description?: string | null;
          device_id?: string | null;
          id?: string;
          issue_type: string;
          measurement_id?: string | null;
          original_data?: Json | null;
          project_id: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: string;
          status?: string;
          updated_at?: string;
          upload_id?: string | null;
          zone_id?: string | null;
        };
        Update: {
          corrected_data?: Json | null;
          created_at?: string;
          data_source_id?: string | null;
          description?: string | null;
          device_id?: string | null;
          id?: string;
          issue_type?: string;
          measurement_id?: string | null;
          original_data?: Json | null;
          project_id?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: string;
          status?: string;
          updated_at?: string;
          upload_id?: string | null;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "data_quality_issues_data_source_id_fkey";
            columns: ["data_source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_quality_issues_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_quality_issues_measurement_id_fkey";
            columns: ["measurement_id"];
            isOneToOne: false;
            referencedRelation: "device_measurements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_quality_issues_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_quality_issues_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "uploads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_quality_issues_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      data_quality_rules: {
        Row: {
          configuration: Json;
          created_at: string;
          data_source_id: string | null;
          id: string;
          is_active: boolean;
          name: string;
          organization_id: string | null;
          parameter_key: string | null;
          project_id: string | null;
          rule_type: string;
          severity: string;
          updated_at: string;
        };
        Insert: {
          configuration?: Json;
          created_at?: string;
          data_source_id?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          organization_id?: string | null;
          parameter_key?: string | null;
          project_id?: string | null;
          rule_type: string;
          severity?: string;
          updated_at?: string;
        };
        Update: {
          configuration?: Json;
          created_at?: string;
          data_source_id?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          organization_id?: string | null;
          parameter_key?: string | null;
          project_id?: string | null;
          rule_type?: string;
          severity?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "data_quality_rules_data_source_id_fkey";
            columns: ["data_source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_quality_rules_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      data_source_mappings: {
        Row: {
          created_at: string;
          data_source_id: string;
          id: string;
          source_field: string;
          target_field: string;
          target_unit: string | null;
          transformation: Json;
          updated_at: string;
          validation_rules: Json;
        };
        Insert: {
          created_at?: string;
          data_source_id: string;
          id?: string;
          source_field: string;
          target_field: string;
          target_unit?: string | null;
          transformation?: Json;
          updated_at?: string;
          validation_rules?: Json;
        };
        Update: {
          created_at?: string;
          data_source_id?: string;
          id?: string;
          source_field?: string;
          target_field?: string;
          target_unit?: string | null;
          transformation?: Json;
          updated_at?: string;
          validation_rules?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "data_source_mappings_data_source_id_fkey";
            columns: ["data_source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      data_sources: {
        Row: {
          config: Json;
          created_at: string | null;
          description: string | null;
          id: string;
          last_sync_at: string | null;
          last_sync_message: string | null;
          last_sync_status: string | null;
          name: string;
          project_id: string | null;
          provider: string | null;
          site_id: string | null;
          source_type: string | null;
          status: string | null;
          updated_at: string;
        };
        Insert: {
          config?: Json;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          last_sync_at?: string | null;
          last_sync_message?: string | null;
          last_sync_status?: string | null;
          name: string;
          project_id?: string | null;
          provider?: string | null;
          site_id?: string | null;
          source_type?: string | null;
          status?: string | null;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          last_sync_at?: string | null;
          last_sync_message?: string | null;
          last_sync_status?: string | null;
          name?: string;
          project_id?: string | null;
          provider?: string | null;
          site_id?: string | null;
          source_type?: string | null;
          status?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "data_sources_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_sources_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      device_maintenance_logs: {
        Row: {
          created_at: string;
          device_id: string;
          id: string;
          maintenance_type: string;
          metadata: Json;
          next_due_at: string | null;
          notes: string | null;
          performed_at: string;
          performed_by: string | null;
          result: string | null;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          id?: string;
          maintenance_type: string;
          metadata?: Json;
          next_due_at?: string | null;
          notes?: string | null;
          performed_at?: string;
          performed_by?: string | null;
          result?: string | null;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          id?: string;
          maintenance_type?: string;
          metadata?: Json;
          next_due_at?: string | null;
          notes?: string | null;
          performed_at?: string;
          performed_by?: string | null;
          result?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "device_maintenance_logs_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_devices";
            referencedColumns: ["id"];
          },
        ];
      };
      device_measurements: {
        Row: {
          created_at: string;
          device_id: string;
          id: string;
          latitude: number | null;
          longitude: number | null;
          measured_at: string;
          parameter_id: string | null;
          quality_score: number | null;
          quality_status: string;
          received_at: string;
          source_payload: Json | null;
          unit: string | null;
          validation_flags: Json;
          value: number;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          measured_at: string;
          parameter_id?: string | null;
          quality_score?: number | null;
          quality_status?: string;
          received_at?: string;
          source_payload?: Json | null;
          unit?: string | null;
          validation_flags?: Json;
          value: number;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          measured_at?: string;
          parameter_id?: string | null;
          quality_score?: number | null;
          quality_status?: string;
          received_at?: string;
          source_payload?: Json | null;
          unit?: string | null;
          validation_flags?: Json;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "device_measurements_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "device_measurements_parameter_id_fkey";
            columns: ["parameter_id"];
            isOneToOne: false;
            referencedRelation: "device_parameters";
            referencedColumns: ["id"];
          },
        ];
      };
      device_parameters: {
        Row: {
          created_at: string;
          device_id: string;
          expected_interval_minutes: number | null;
          id: string;
          is_active: boolean;
          max_value: number | null;
          min_value: number | null;
          parameter_key: string;
          parameter_name: string;
          unit: string | null;
          updated_at: string;
          validation_rules: Json;
        };
        Insert: {
          created_at?: string;
          device_id: string;
          expected_interval_minutes?: number | null;
          id?: string;
          is_active?: boolean;
          max_value?: number | null;
          min_value?: number | null;
          parameter_key: string;
          parameter_name: string;
          unit?: string | null;
          updated_at?: string;
          validation_rules?: Json;
        };
        Update: {
          created_at?: string;
          device_id?: string;
          expected_interval_minutes?: number | null;
          id?: string;
          is_active?: boolean;
          max_value?: number | null;
          min_value?: number | null;
          parameter_key?: string;
          parameter_name?: string;
          unit?: string | null;
          updated_at?: string;
          validation_rules?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "device_parameters_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_devices";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: {
          action_id: string | null;
          created_at: string;
          created_by: string | null;
          document_type: string;
          file_name: string | null;
          file_size: number | null;
          generated_from: string | null;
          id: string;
          metadata: Json | null;
          mime_type: string | null;
          project_id: string;
          site_id: string | null;
          status: string;
          storage_path: string | null;
          title: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          action_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          document_type: string;
          file_name?: string | null;
          file_size?: number | null;
          generated_from?: string | null;
          id?: string;
          metadata?: Json | null;
          mime_type?: string | null;
          project_id: string;
          site_id?: string | null;
          status?: string;
          storage_path?: string | null;
          title: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          action_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          document_type?: string;
          file_name?: string | null;
          file_size?: number | null;
          generated_from?: string | null;
          id?: string;
          metadata?: Json | null;
          mime_type?: string | null;
          project_id?: string;
          site_id?: string | null;
          status?: string;
          storage_path?: string | null;
          title?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "documents_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      drone_assets: {
        Row: {
          asset_type: string;
          bbox: Json | null;
          captured_at: string | null;
          created_at: string;
          file_size_bytes: number | null;
          flight_id: string;
          id: string;
          metadata: Json;
          mime_type: string | null;
          storage_path: string;
        };
        Insert: {
          asset_type: string;
          bbox?: Json | null;
          captured_at?: string | null;
          created_at?: string;
          file_size_bytes?: number | null;
          flight_id: string;
          id?: string;
          metadata?: Json;
          mime_type?: string | null;
          storage_path: string;
        };
        Update: {
          asset_type?: string;
          bbox?: Json | null;
          captured_at?: string | null;
          created_at?: string;
          file_size_bytes?: number | null;
          flight_id?: string;
          id?: string;
          metadata?: Json;
          mime_type?: string | null;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drone_assets_flight_id_fkey";
            columns: ["flight_id"];
            isOneToOne: false;
            referencedRelation: "drone_flights";
            referencedColumns: ["id"];
          },
        ];
      };
      drone_flights: {
        Row: {
          altitude_m: number | null;
          area_hectares: number | null;
          created_at: string;
          drone_model: string | null;
          duration_minutes: number | null;
          flight_path: Json | null;
          flown_at: string;
          id: string;
          metadata: Json;
          notes: string | null;
          pilot_id: string | null;
          project_id: string;
          purpose: string | null;
          status: string;
          updated_at: string;
          weather_conditions: string | null;
          zone_id: string | null;
        };
        Insert: {
          altitude_m?: number | null;
          area_hectares?: number | null;
          created_at?: string;
          drone_model?: string | null;
          duration_minutes?: number | null;
          flight_path?: Json | null;
          flown_at: string;
          id?: string;
          metadata?: Json;
          notes?: string | null;
          pilot_id?: string | null;
          project_id: string;
          purpose?: string | null;
          status?: string;
          updated_at?: string;
          weather_conditions?: string | null;
          zone_id?: string | null;
        };
        Update: {
          altitude_m?: number | null;
          area_hectares?: number | null;
          created_at?: string;
          drone_model?: string | null;
          duration_minutes?: number | null;
          flight_path?: Json | null;
          flown_at?: string;
          id?: string;
          metadata?: Json;
          notes?: string | null;
          pilot_id?: string | null;
          project_id?: string;
          purpose?: string | null;
          status?: string;
          updated_at?: string;
          weather_conditions?: string | null;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "drone_flights_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drone_flights_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      drone_image_inspection_answer_versions: {
        Row: {
          answers: Json;
          answers_sha256: string;
          answers_text: string;
          created_at: string;
          created_by: string;
          id: string;
          inspection_id: string;
          inspection_result_sha256: string;
          professionally_reviewed: boolean;
          project_id: string;
          report_eligible: boolean;
          request_id: string;
          status: string;
        };
        Insert: {
          answers: Json;
          answers_sha256: string;
          answers_text: string;
          created_at?: string;
          created_by: string;
          id?: string;
          inspection_id: string;
          inspection_result_sha256: string;
          professionally_reviewed?: boolean;
          project_id: string;
          report_eligible?: boolean;
          request_id: string;
          status?: string;
        };
        Update: {
          answers?: Json;
          answers_sha256?: string;
          answers_text?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          inspection_id?: string;
          inspection_result_sha256?: string;
          professionally_reviewed?: boolean;
          project_id?: string;
          report_eligible?: boolean;
          request_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drone_image_inspection_answer_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "image_answers_exact_inspection";
            columns: ["project_id", "inspection_id", "inspection_result_sha256"];
            isOneToOne: false;
            referencedRelation: "drone_image_inspections";
            referencedColumns: ["project_id", "id", "result_sha256"];
          },
        ];
      };
      drone_image_inspections: {
        Row: {
          attempt_count: number;
          completed_at: string | null;
          created_at: string;
          created_by: string;
          failure_code: string | null;
          id: string;
          lease_actor_id: string | null;
          lease_expires_at: string | null;
          lease_token: string | null;
          media_id: string;
          method_version: string;
          model_id: string;
          original_sha256: string;
          original_validation_sha256: string;
          project_id: string;
          prompt_version: string;
          provider: string;
          request_id: string;
          result: Json | null;
          result_sha256: string | null;
          result_text: string | null;
          source_snapshot_id: string | null;
          source_snapshot_sha256: string | null;
          status: string;
          storage_object_id: string;
          storage_object_updated_at: string;
          storage_object_version: string | null;
          updated_at: string;
        };
        Insert: {
          attempt_count: number;
          completed_at?: string | null;
          created_at?: string;
          created_by: string;
          failure_code?: string | null;
          id?: string;
          lease_actor_id?: string | null;
          lease_expires_at?: string | null;
          lease_token?: string | null;
          media_id: string;
          method_version: string;
          model_id: string;
          original_sha256: string;
          original_validation_sha256: string;
          project_id: string;
          prompt_version: string;
          provider: string;
          request_id: string;
          result?: Json | null;
          result_sha256?: string | null;
          result_text?: string | null;
          source_snapshot_id?: string | null;
          source_snapshot_sha256?: string | null;
          status: string;
          storage_object_id: string;
          storage_object_updated_at: string;
          storage_object_version?: string | null;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          completed_at?: string | null;
          created_at?: string;
          created_by?: string;
          failure_code?: string | null;
          id?: string;
          lease_actor_id?: string | null;
          lease_expires_at?: string | null;
          lease_token?: string | null;
          media_id?: string;
          method_version?: string;
          model_id?: string;
          original_sha256?: string;
          original_validation_sha256?: string;
          project_id?: string;
          prompt_version?: string;
          provider?: string;
          request_id?: string;
          result?: Json | null;
          result_sha256?: string | null;
          result_text?: string | null;
          source_snapshot_id?: string | null;
          source_snapshot_sha256?: string | null;
          status?: string;
          storage_object_id?: string;
          storage_object_updated_at?: string;
          storage_object_version?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drone_image_inspections_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "project_media";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drone_image_inspections_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drone_image_inspections_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "reviewed_report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drone_image_inspections_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drone_image_inspections_source_snapshot_id_fkey";
            columns: ["source_snapshot_id"];
            isOneToOne: false;
            referencedRelation: "project_baseline_snapshots";
            referencedColumns: ["id"];
          },
        ];
      };
      drone_processing_jobs: {
        Row: {
          created_at: string;
          error: string | null;
          flight_id: string;
          id: string;
          input_manifest: Json;
          input_version: string;
          outputs: Json;
          progress: number;
          project_id: string;
          provider_job_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          error?: string | null;
          flight_id: string;
          id?: string;
          input_manifest: Json;
          input_version: string;
          outputs?: Json;
          progress?: number;
          project_id: string;
          provider_job_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          error?: string | null;
          flight_id?: string;
          id?: string;
          input_manifest?: Json;
          input_version?: string;
          outputs?: Json;
          progress?: number;
          project_id?: string;
          provider_job_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "drone_processing_jobs_flight_id_fkey";
            columns: ["flight_id"];
            isOneToOne: false;
            referencedRelation: "drone_flights";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "drone_processing_jobs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      environmental_analyses: {
        Row: {
          analysis_type: string;
          analyzed_at: string;
          created_at: string;
          id: string;
          metadata: Json;
          observed_at: string | null;
          project_id: string;
          result: Json;
          score: number | null;
          source_ref: string | null;
          source_type: string;
          status: string;
          updated_at: string;
          zone_id: string | null;
        };
        Insert: {
          analysis_type: string;
          analyzed_at?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          observed_at?: string | null;
          project_id: string;
          result?: Json;
          score?: number | null;
          source_ref?: string | null;
          source_type: string;
          status?: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Update: {
          analysis_type?: string;
          analyzed_at?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          observed_at?: string | null;
          project_id?: string;
          result?: Json;
          score?: number | null;
          source_ref?: string | null;
          source_type?: string;
          status?: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "environmental_analyses_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "environmental_analyses_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      environmental_risks: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          likelihood: string | null;
          mitigation_summary: string | null;
          project_id: string | null;
          responsible_party: string | null;
          risk_type: string | null;
          severity: string | null;
          status: string | null;
          title: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          likelihood?: string | null;
          mitigation_summary?: string | null;
          project_id?: string | null;
          responsible_party?: string | null;
          risk_type?: string | null;
          severity?: string | null;
          status?: string | null;
          title: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          likelihood?: string | null;
          mitigation_summary?: string | null;
          project_id?: string | null;
          responsible_party?: string | null;
          risk_type?: string | null;
          severity?: string | null;
          status?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "environmental_risks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      evidence_files: {
        Row: {
          created_at: string | null;
          evidence_type: string | null;
          file_type: string | null;
          file_url: string | null;
          id: string;
          project_id: string | null;
          report_id: string | null;
          title: string;
        };
        Insert: {
          created_at?: string | null;
          evidence_type?: string | null;
          file_type?: string | null;
          file_url?: string | null;
          id?: string;
          project_id?: string | null;
          report_id?: string | null;
          title: string;
        };
        Update: {
          created_at?: string | null;
          evidence_type?: string | null;
          file_type?: string | null;
          file_url?: string | null;
          id?: string;
          project_id?: string | null;
          report_id?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evidence_files_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "evidence_files_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "reports";
            referencedColumns: ["id"];
          },
        ];
      };
      field_job_template_versions: {
        Row: {
          created_at: string;
          created_by: string;
          definition: Json;
          id: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          template_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          definition: Json;
          id?: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          template_id: string;
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          definition?: Json;
          id?: string;
          organization_id?: string;
          project_id?: string;
          request_id?: string;
          template_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "field_job_template_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_job_template_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      field_job_versions: {
        Row: {
          action_id: string;
          correction_reason: string;
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          required_plan_version_id: string | null;
          status: string;
          template_version_id: string;
          values: Json;
          version: number;
        };
        Insert: {
          action_id: string;
          correction_reason?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          required_plan_version_id?: string | null;
          status: string;
          template_version_id: string;
          values: Json;
          version: number;
        };
        Update: {
          action_id?: string;
          correction_reason?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id?: string;
          project_id?: string;
          request_id?: string;
          required_plan_version_id?: string | null;
          status?: string;
          template_version_id?: string;
          values?: Json;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "field_job_required_plan_scope";
            columns: ["required_plan_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_plan_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "field_job_versions_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_job_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_job_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_job_versions_template_version_id_fkey";
            columns: ["template_version_id"];
            isOneToOne: false;
            referencedRelation: "field_job_template_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      field_observations: {
        Row: {
          accuracy_m: number | null;
          count_value: number | null;
          created_at: string;
          id: string;
          latitude: number | null;
          longitude: number | null;
          metadata: Json;
          notes: string | null;
          observation_type: string;
          observed_at: string;
          observer_id: string | null;
          project_id: string;
          species_confidence: number | null;
          species_name: string | null;
          status: string;
          updated_at: string;
          visibility: string;
          zone_id: string | null;
        };
        Insert: {
          accuracy_m?: number | null;
          count_value?: number | null;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          metadata?: Json;
          notes?: string | null;
          observation_type: string;
          observed_at?: string;
          observer_id?: string | null;
          project_id: string;
          species_confidence?: number | null;
          species_name?: string | null;
          status?: string;
          updated_at?: string;
          visibility?: string;
          zone_id?: string | null;
        };
        Update: {
          accuracy_m?: number | null;
          count_value?: number | null;
          created_at?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          metadata?: Json;
          notes?: string | null;
          observation_type?: string;
          observed_at?: string;
          observer_id?: string | null;
          project_id?: string;
          species_confidence?: number | null;
          species_name?: string | null;
          status?: string;
          updated_at?: string;
          visibility?: string;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "field_observations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_observations_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      field_photo_background_jobs: {
        Row: {
          attempts: number;
          last_error: string | null;
          lease_id: string | null;
          lease_until: string | null;
          next_attempt_at: string;
          project_id: string;
          stage: string;
          state: string;
          updated_at: string;
          upload_id: string;
        };
        Insert: {
          attempts?: number;
          last_error?: string | null;
          lease_id?: string | null;
          lease_until?: string | null;
          next_attempt_at?: string;
          project_id: string;
          stage?: string;
          state?: string;
          updated_at?: string;
          upload_id: string;
        };
        Update: {
          attempts?: number;
          last_error?: string | null;
          lease_id?: string | null;
          lease_until?: string | null;
          next_attempt_at?: string;
          project_id?: string;
          stage?: string;
          state?: string;
          updated_at?: string;
          upload_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "field_photo_background_jobs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_photo_background_jobs_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: true;
            referencedRelation: "field_photo_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      field_photo_policy_versions: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          project_id: string;
          radius_m: number;
          reason: string;
          request_id: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id: string;
          project_id: string;
          radius_m: number;
          reason: string;
          request_id: string;
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id?: string;
          project_id?: string;
          radius_m?: number;
          reason?: string;
          request_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "field_photo_policy_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_photo_policy_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      field_photo_position_versions: {
        Row: {
          created_at: string;
          created_by: string;
          distance_m: number | null;
          id: string;
          lat: number;
          lng: number;
          media_id: string;
          organization_id: string;
          policy_version: number;
          project_id: string;
          radius_m: number;
          reason: string;
          request_id: string;
          status: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          distance_m?: number | null;
          id?: string;
          lat: number;
          lng: number;
          media_id: string;
          organization_id: string;
          policy_version: number;
          project_id: string;
          radius_m: number;
          reason: string;
          request_id: string;
          status: string;
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          distance_m?: number | null;
          id?: string;
          lat?: number;
          lng?: number;
          media_id?: string;
          organization_id?: string;
          policy_version?: number;
          project_id?: string;
          radius_m?: number;
          reason?: string;
          request_id?: string;
          status?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "field_photo_position_versions_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "project_media";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_photo_position_versions_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_photo_position_versions_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "reviewed_report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_photo_position_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_photo_position_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      field_photo_previews: {
        Row: {
          created_at: string;
          created_by: string;
          height: number;
          object_id: string;
          object_updated_at: string;
          object_version: string | null;
          project_id: string;
          recipe: string;
          sha256: string;
          size_bytes: number;
          source_sha256: string;
          storage_path: string;
          upload_id: string;
          width: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          height: number;
          object_id: string;
          object_updated_at: string;
          object_version?: string | null;
          project_id: string;
          recipe: string;
          sha256: string;
          size_bytes: number;
          source_sha256: string;
          storage_path: string;
          upload_id: string;
          width: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          height?: number;
          object_id?: string;
          object_updated_at?: string;
          object_version?: string | null;
          project_id?: string;
          recipe?: string;
          sha256?: string;
          size_bytes?: number;
          source_sha256?: string;
          storage_path?: string;
          upload_id?: string;
          width?: number;
        };
        Relationships: [
          {
            foreignKeyName: "field_photo_previews_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_photo_previews_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: true;
            referencedRelation: "field_photo_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      field_photo_processing_jobs: {
        Row: {
          attempts: number;
          last_error: string | null;
          lease_id: string | null;
          lease_until: string | null;
          project_id: string;
          updated_at: string;
          upload_id: string;
        };
        Insert: {
          attempts?: number;
          last_error?: string | null;
          lease_id?: string | null;
          lease_until?: string | null;
          project_id: string;
          updated_at?: string;
          upload_id: string;
        };
        Update: {
          attempts?: number;
          last_error?: string | null;
          lease_id?: string | null;
          lease_until?: string | null;
          project_id?: string;
          updated_at?: string;
          upload_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "field_photo_processing_jobs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_photo_processing_jobs_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: true;
            referencedRelation: "field_photo_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      field_photo_receipts: {
        Row: {
          object_id: string;
          object_updated_at: string;
          object_version: string | null;
          project_id: string;
          sha256: string;
          size_bytes: number;
          status: string;
          upload_id: string;
          validator_version: string;
          verified_at: string;
          verified_by: string;
        };
        Insert: {
          object_id: string;
          object_updated_at: string;
          object_version?: string | null;
          project_id: string;
          sha256: string;
          size_bytes: number;
          status: string;
          upload_id: string;
          validator_version?: string;
          verified_at?: string;
          verified_by: string;
        };
        Update: {
          object_id?: string;
          object_updated_at?: string;
          object_version?: string | null;
          project_id?: string;
          sha256?: string;
          size_bytes?: number;
          status?: string;
          upload_id?: string;
          validator_version?: string;
          verified_at?: string;
          verified_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "field_photo_receipts_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "field_photo_receipts_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: true;
            referencedRelation: "field_photo_uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      field_photo_uploads: {
        Row: {
          captured_action_id: string | null;
          captured_organization_id: string | null;
          captured_plan_version_id: string | null;
          created_at: string;
          created_by: string;
          id: string;
          object_id: string | null;
          object_updated_at: string | null;
          object_version: string | null;
          payload: Json;
          project_id: string;
          received_at: string | null;
          storage_path: string;
        };
        Insert: {
          captured_action_id?: string | null;
          captured_organization_id?: string | null;
          captured_plan_version_id?: string | null;
          created_at?: string;
          created_by: string;
          id: string;
          object_id?: string | null;
          object_updated_at?: string | null;
          object_version?: string | null;
          payload: Json;
          project_id: string;
          received_at?: string | null;
          storage_path: string;
        };
        Update: {
          captured_action_id?: string | null;
          captured_organization_id?: string | null;
          captured_plan_version_id?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          object_id?: string | null;
          object_updated_at?: string | null;
          object_version?: string | null;
          payload?: Json;
          project_id?: string;
          received_at?: string | null;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "field_photo_capture_plan";
            columns: [
              "captured_plan_version_id",
              "captured_action_id",
              "captured_organization_id",
              "project_id",
            ];
            isOneToOne: false;
            referencedRelation: "work_order_plan_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "field_photo_capture_work_order";
            columns: ["captured_action_id", "captured_organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "field_photo_uploads_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      geo_features: {
        Row: {
          created_at: string | null;
          external_id: string | null;
          feature_type: string | null;
          geojson: Json | null;
          geom: unknown;
          id: string;
          layer_id: string | null;
          name: string | null;
          properties: Json | null;
          valid_from: string | null;
          valid_to: string | null;
        };
        Insert: {
          created_at?: string | null;
          external_id?: string | null;
          feature_type?: string | null;
          geojson?: Json | null;
          geom?: unknown;
          id?: string;
          layer_id?: string | null;
          name?: string | null;
          properties?: Json | null;
          valid_from?: string | null;
          valid_to?: string | null;
        };
        Update: {
          created_at?: string | null;
          external_id?: string | null;
          feature_type?: string | null;
          geojson?: Json | null;
          geom?: unknown;
          id?: string;
          layer_id?: string | null;
          name?: string | null;
          properties?: Json | null;
          valid_from?: string | null;
          valid_to?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "geo_features_layer_id_fkey";
            columns: ["layer_id"];
            isOneToOne: false;
            referencedRelation: "map_layers";
            referencedColumns: ["id"];
          },
        ];
      };
      geo_observations: {
        Row: {
          created_at: string | null;
          geojson: Json | null;
          geom: unknown;
          id: string;
          layer_id: string | null;
          observation_type: string;
          observed_at: string;
          project_id: string | null;
          properties: Json | null;
          unit: string | null;
          value: number | null;
        };
        Insert: {
          created_at?: string | null;
          geojson?: Json | null;
          geom?: unknown;
          id?: string;
          layer_id?: string | null;
          observation_type: string;
          observed_at: string;
          project_id?: string | null;
          properties?: Json | null;
          unit?: string | null;
          value?: number | null;
        };
        Update: {
          created_at?: string | null;
          geojson?: Json | null;
          geom?: unknown;
          id?: string;
          layer_id?: string | null;
          observation_type?: string;
          observed_at?: string;
          project_id?: string | null;
          properties?: Json | null;
          unit?: string | null;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "geo_observations_layer_id_fkey";
            columns: ["layer_id"];
            isOneToOne: false;
            referencedRelation: "map_layers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "geo_observations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      gps_trip_amendment_history: {
        Row: {
          baseline: boolean;
          captured_at: string;
          classification: string;
          purpose: string | null;
          revision: number;
          trip_id: string;
        };
        Insert: {
          baseline?: boolean;
          captured_at?: string;
          classification: string;
          purpose?: string | null;
          revision: number;
          trip_id: string;
        };
        Update: {
          baseline?: boolean;
          captured_at?: string;
          classification?: string;
          purpose?: string | null;
          revision?: number;
          trip_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gps_trip_amendment_history_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "gps_trip_log";
            referencedColumns: ["id"];
          },
        ];
      };
      gps_trip_log: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          classification: string;
          device_id: string;
          driver_id: string;
          end_position_id: string;
          ended_at: string;
          gps_distance_m: number | null;
          gps_gap_count: number | null;
          gps_sample_count: number | null;
          id: string;
          project_id: string;
          purpose: string | null;
          recorded_at: string;
          revision: number;
          start_position_id: string;
          started_at: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          classification: string;
          device_id: string;
          driver_id: string;
          end_position_id: string;
          ended_at: string;
          gps_distance_m?: number | null;
          gps_gap_count?: number | null;
          gps_sample_count?: number | null;
          id: string;
          project_id: string;
          purpose?: string | null;
          recorded_at?: string;
          revision?: number;
          start_position_id: string;
          started_at: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          classification?: string;
          device_id?: string;
          driver_id?: string;
          end_position_id?: string;
          ended_at?: string;
          gps_distance_m?: number | null;
          gps_gap_count?: number | null;
          gps_sample_count?: number | null;
          id?: string;
          project_id?: string;
          purpose?: string | null;
          recorded_at?: string;
          revision?: number;
          start_position_id?: string;
          started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gps_trip_log_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gps_trip_log_end_position_id_fkey";
            columns: ["end_position_id"];
            isOneToOne: false;
            referencedRelation: "device_measurements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gps_trip_log_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gps_trip_log_start_position_id_fkey";
            columns: ["start_position_id"];
            isOneToOne: false;
            referencedRelation: "device_measurements";
            referencedColumns: ["id"];
          },
        ];
      };
      impact_units: {
        Row: {
          created_at: string | null;
          id: string;
          issued_at: string | null;
          metadata: Json | null;
          project_id: string | null;
          quantity: number | null;
          status: string | null;
          unit_type: string | null;
          verification_status: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          issued_at?: string | null;
          metadata?: Json | null;
          project_id?: string | null;
          quantity?: number | null;
          status?: string | null;
          unit_type?: string | null;
          verification_status?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          issued_at?: string | null;
          metadata?: Json | null;
          project_id?: string | null;
          quantity?: number | null;
          status?: string | null;
          unit_type?: string | null;
          verification_status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "impact_units_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      indicator_measurements: {
        Row: {
          confidence_score: number | null;
          created_at: string;
          id: string;
          indicator_id: string;
          measured_at: string;
          metadata: Json;
          method: string | null;
          project_id: string | null;
          source: string | null;
          unit: string | null;
          value: number;
        };
        Insert: {
          confidence_score?: number | null;
          created_at?: string;
          id?: string;
          indicator_id: string;
          measured_at?: string;
          metadata?: Json;
          method?: string | null;
          project_id?: string | null;
          source?: string | null;
          unit?: string | null;
          value: number;
        };
        Update: {
          confidence_score?: number | null;
          created_at?: string;
          id?: string;
          indicator_id?: string;
          measured_at?: string;
          metadata?: Json;
          method?: string | null;
          project_id?: string | null;
          source?: string | null;
          unit?: string | null;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "indicator_measurements_indicator_id_fkey";
            columns: ["indicator_id"];
            isOneToOne: false;
            referencedRelation: "indicators";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "indicator_measurements_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      indicators: {
        Row: {
          category: string | null;
          description: string | null;
          id: string;
          key: string;
          label: string;
          project_id: string | null;
          status: string | null;
          target_direction: string | null;
          target_unit: string | null;
          target_value: number | null;
          threshold_critical: number | null;
          threshold_direction: string;
          threshold_warning: number | null;
          trend: string | null;
          unit: string | null;
          updated_at: string | null;
          value: number | null;
        };
        Insert: {
          category?: string | null;
          description?: string | null;
          id?: string;
          key: string;
          label: string;
          project_id?: string | null;
          status?: string | null;
          target_direction?: string | null;
          target_unit?: string | null;
          target_value?: number | null;
          threshold_critical?: number | null;
          threshold_direction?: string;
          threshold_warning?: number | null;
          trend?: string | null;
          unit?: string | null;
          updated_at?: string | null;
          value?: number | null;
        };
        Update: {
          category?: string | null;
          description?: string | null;
          id?: string;
          key?: string;
          label?: string;
          project_id?: string | null;
          status?: string | null;
          target_direction?: string | null;
          target_unit?: string | null;
          target_value?: number | null;
          threshold_critical?: number | null;
          threshold_direction?: string;
          threshold_warning?: number | null;
          trend?: string | null;
          unit?: string | null;
          updated_at?: string | null;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "indicators_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_connections: {
        Row: {
          configuration: Json;
          created_at: string;
          created_by: string | null;
          credential_ref: string | null;
          id: string;
          last_error: string | null;
          last_run_at: string | null;
          name: string;
          project_id: string;
          provider: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          configuration?: Json;
          created_at?: string;
          created_by?: string | null;
          credential_ref?: string | null;
          id?: string;
          last_error?: string | null;
          last_run_at?: string | null;
          name: string;
          project_id: string;
          provider: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          configuration?: Json;
          created_at?: string;
          created_by?: string | null;
          credential_ref?: string | null;
          id?: string;
          last_error?: string | null;
          last_run_at?: string | null;
          name?: string;
          project_id?: string;
          provider?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "integration_connections_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      integration_runs: {
        Row: {
          created_at: string;
          data_source_id: string;
          error_message: string | null;
          finished_at: string | null;
          id: string;
          metadata: Json;
          project_id: string;
          records_failed: number;
          records_processed: number;
          started_at: string;
          status: string;
          triggered_by: string | null;
        };
        Insert: {
          created_at?: string;
          data_source_id: string;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          metadata?: Json;
          project_id: string;
          records_failed?: number;
          records_processed?: number;
          started_at?: string;
          status?: string;
          triggered_by?: string | null;
        };
        Update: {
          created_at?: string;
          data_source_id?: string;
          error_message?: string | null;
          finished_at?: string | null;
          id?: string;
          metadata?: Json;
          project_id?: string;
          records_failed?: number;
          records_processed?: number;
          started_at?: string;
          status?: string;
          triggered_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "integration_runs_data_source_id_fkey";
            columns: ["data_source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "integration_runs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      lavbund_groefter: {
        Row: {
          id: string;
          payload: Json;
          projekt_id: string;
        };
        Insert: {
          id: string;
          payload: Json;
          projekt_id: string;
        };
        Update: {
          id?: string;
          payload?: Json;
          projekt_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lavbund_groefter_projekt_id_fkey";
            columns: ["projekt_id"];
            isOneToOne: false;
            referencedRelation: "lavbund_projekter";
            referencedColumns: ["id"];
          },
        ];
      };
      lavbund_ledger: {
        Row: {
          created_at: string;
          id: string;
          payload: Json;
          projekt_id: string;
          seq: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          payload: Json;
          projekt_id: string;
          seq: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          payload?: Json;
          projekt_id?: string;
          seq?: number;
        };
        Relationships: [
          {
            foreignKeyName: "lavbund_ledger_projekt_id_fkey";
            columns: ["projekt_id"];
            isOneToOne: false;
            referencedRelation: "lavbund_projekter";
            referencedColumns: ["id"];
          },
        ];
      };
      lavbund_maalepunkter: {
        Row: {
          id: string;
          payload: Json;
          projekt_id: string;
        };
        Insert: {
          id: string;
          payload: Json;
          projekt_id: string;
        };
        Update: {
          id?: string;
          payload?: Json;
          projekt_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lavbund_maalepunkter_projekt_id_fkey";
            columns: ["projekt_id"];
            isOneToOne: false;
            referencedRelation: "lavbund_projekter";
            referencedColumns: ["id"];
          },
        ];
      };
      lavbund_projekter: {
        Row: {
          id: string;
          linked_project_id: string | null;
          navn: string;
          payload: Json;
          status: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          linked_project_id?: string | null;
          navn: string;
          payload: Json;
          status?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          linked_project_id?: string | null;
          navn?: string;
          payload?: Json;
          status?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lavbund_projekter_linked_project_id_fkey";
            columns: ["linked_project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      lavbund_readings: {
        Row: {
          id: string;
          maalepunkt_id: string;
          payload: Json;
          projekt_id: string;
          tidspunkt: string | null;
        };
        Insert: {
          id?: string;
          maalepunkt_id: string;
          payload: Json;
          projekt_id: string;
          tidspunkt?: string | null;
        };
        Update: {
          id?: string;
          maalepunkt_id?: string;
          payload?: Json;
          projekt_id?: string;
          tidspunkt?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lavbund_readings_projekt_id_fkey";
            columns: ["projekt_id"];
            isOneToOne: false;
            referencedRelation: "lavbund_projekter";
            referencedColumns: ["id"];
          },
        ];
      };
      lavbund_snapshots: {
        Row: {
          payload: Json;
          projekt_id: string;
          updated_at: string;
        };
        Insert: {
          payload: Json;
          projekt_id: string;
          updated_at?: string;
        };
        Update: {
          payload?: Json;
          projekt_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lavbund_snapshots_projekt_id_fkey";
            columns: ["projekt_id"];
            isOneToOne: true;
            referencedRelation: "lavbund_projekter";
            referencedColumns: ["id"];
          },
        ];
      };
      lavbund_transekter: {
        Row: {
          fase: string | null;
          id: string;
          nr: number | null;
          payload: Json;
          projekt_id: string;
        };
        Insert: {
          fase?: string | null;
          id?: string;
          nr?: number | null;
          payload: Json;
          projekt_id: string;
        };
        Update: {
          fase?: string | null;
          id?: string;
          nr?: number | null;
          payload?: Json;
          projekt_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lavbund_transekter_projekt_id_fkey";
            columns: ["projekt_id"];
            isOneToOne: false;
            referencedRelation: "lavbund_projekter";
            referencedColumns: ["id"];
          },
        ];
      };
      map_layers: {
        Row: {
          category: string;
          created_at: string | null;
          id: string;
          is_active: boolean | null;
          layer_type: string;
          name: string;
          provider: string | null;
          refresh_interval: string | null;
          requires_api_key: boolean | null;
          slug: string;
          source_url: string | null;
          status: string | null;
        };
        Insert: {
          category: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          layer_type: string;
          name: string;
          provider?: string | null;
          refresh_interval?: string | null;
          requires_api_key?: boolean | null;
          slug: string;
          source_url?: string | null;
          status?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string | null;
          id?: string;
          is_active?: boolean | null;
          layer_type?: string;
          name?: string;
          provider?: string | null;
          refresh_interval?: string | null;
          requires_api_key?: boolean | null;
          slug?: string;
          source_url?: string | null;
          status?: string | null;
        };
        Relationships: [];
      };
      mitigation_measures: {
        Row: {
          created_at: string | null;
          description: string | null;
          due_date: string | null;
          id: string;
          measure_type: string | null;
          project_id: string | null;
          responsible_party: string | null;
          risk_id: string | null;
          status: string | null;
          title: string;
          verification_method: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          measure_type?: string | null;
          project_id?: string | null;
          responsible_party?: string | null;
          risk_id?: string | null;
          status?: string | null;
          title: string;
          verification_method?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          due_date?: string | null;
          id?: string;
          measure_type?: string | null;
          project_id?: string | null;
          responsible_party?: string | null;
          risk_id?: string | null;
          status?: string | null;
          title?: string;
          verification_method?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "mitigation_measures_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "mitigation_measures_risk_id_fkey";
            columns: ["risk_id"];
            isOneToOne: false;
            referencedRelation: "environmental_risks";
            referencedColumns: ["id"];
          },
        ];
      };
      monitoring_alerts: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          alert_rule_id: string | null;
          alert_type: string;
          assigned_to: string | null;
          category: string | null;
          context: Json;
          created_at: string;
          device_id: string | null;
          id: string;
          message: string | null;
          project_id: string;
          recommended_actions: Json;
          resolution_data: Json | null;
          resolved_at: string | null;
          severity: string;
          source_id: string | null;
          source_type: string | null;
          status: string;
          title: string;
          triggered_at: string;
          updated_at: string;
          zone_id: string | null;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          alert_rule_id?: string | null;
          alert_type: string;
          assigned_to?: string | null;
          category?: string | null;
          context?: Json;
          created_at?: string;
          device_id?: string | null;
          id?: string;
          message?: string | null;
          project_id: string;
          recommended_actions?: Json;
          resolution_data?: Json | null;
          resolved_at?: string | null;
          severity?: string;
          source_id?: string | null;
          source_type?: string | null;
          status?: string;
          title: string;
          triggered_at?: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          alert_rule_id?: string | null;
          alert_type?: string;
          assigned_to?: string | null;
          category?: string | null;
          context?: Json;
          created_at?: string;
          device_id?: string | null;
          id?: string;
          message?: string | null;
          project_id?: string;
          recommended_actions?: Json;
          resolution_data?: Json | null;
          resolved_at?: string | null;
          severity?: string;
          source_id?: string | null;
          source_type?: string | null;
          status?: string;
          title?: string;
          triggered_at?: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "monitoring_alerts_device_id_fkey";
            columns: ["device_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_devices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monitoring_alerts_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monitoring_alerts_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      monitoring_devices: {
        Row: {
          battery_level: number | null;
          configuration: Json;
          connectivity_type: string | null;
          created_at: string;
          created_by: string | null;
          device_type: string;
          expected_interval_minutes: number | null;
          external_device_id: string | null;
          firmware_version: string | null;
          geometry: Json | null;
          id: string;
          last_measurement_at: string | null;
          last_seen_at: string | null;
          latitude: number | null;
          longitude: number | null;
          manufacturer: string | null;
          model: string | null;
          name: string;
          organization_id: string | null;
          project_id: string;
          serial_number: string | null;
          signal_strength: number | null;
          status: string;
          updated_at: string;
          zone_id: string | null;
        };
        Insert: {
          battery_level?: number | null;
          configuration?: Json;
          connectivity_type?: string | null;
          created_at?: string;
          created_by?: string | null;
          device_type: string;
          expected_interval_minutes?: number | null;
          external_device_id?: string | null;
          firmware_version?: string | null;
          geometry?: Json | null;
          id?: string;
          last_measurement_at?: string | null;
          last_seen_at?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          manufacturer?: string | null;
          model?: string | null;
          name: string;
          organization_id?: string | null;
          project_id: string;
          serial_number?: string | null;
          signal_strength?: number | null;
          status?: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Update: {
          battery_level?: number | null;
          configuration?: Json;
          connectivity_type?: string | null;
          created_at?: string;
          created_by?: string | null;
          device_type?: string;
          expected_interval_minutes?: number | null;
          external_device_id?: string | null;
          firmware_version?: string | null;
          geometry?: Json | null;
          id?: string;
          last_measurement_at?: string | null;
          last_seen_at?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          manufacturer?: string | null;
          model?: string | null;
          name?: string;
          organization_id?: string | null;
          project_id?: string;
          serial_number?: string | null;
          signal_strength?: number | null;
          status?: string;
          updated_at?: string;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "monitoring_devices_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monitoring_devices_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monitoring_devices_zone_fk";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      monitoring_zones: {
        Row: {
          area_hectares: number | null;
          area_m2: number | null;
          centroid_lat: number | null;
          centroid_lng: number | null;
          color: string | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          geometry: Json | null;
          id: string;
          name: string;
          project_id: string;
          source_metadata: Json;
          source_type: string;
          status: string;
          tags: string[];
          updated_at: string;
          zone_type: string;
        };
        Insert: {
          area_hectares?: number | null;
          area_m2?: number | null;
          centroid_lat?: number | null;
          centroid_lng?: number | null;
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          geometry?: Json | null;
          id?: string;
          name: string;
          project_id: string;
          source_metadata?: Json;
          source_type?: string;
          status?: string;
          tags?: string[];
          updated_at?: string;
          zone_type?: string;
        };
        Update: {
          area_hectares?: number | null;
          area_m2?: number | null;
          centroid_lat?: number | null;
          centroid_lng?: number | null;
          color?: string | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          geometry?: Json | null;
          id?: string;
          name?: string;
          project_id?: string;
          source_metadata?: Json;
          source_type?: string;
          status?: string;
          tags?: string[];
          updated_at?: string;
          zone_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monitoring_zones_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      municipal_report_versions: {
        Row: {
          baseline_id: string;
          baseline_sha256: string;
          created_at: string;
          created_by: string;
          generated_at: string;
          generator_version: string;
          id: string;
          manifest: Json;
          manifest_sha256: string;
          manifest_text: string;
          municipal_scope_approved: boolean;
          plan_id: string;
          plan_sha256: string;
          professionally_reviewed: boolean;
          project_id: string;
          report_eligible: boolean;
          request_id: string;
          round_sha256: string;
          round_version_id: string;
          status: string;
          version_no: number;
        };
        Insert: {
          baseline_id: string;
          baseline_sha256: string;
          created_at?: string;
          created_by: string;
          generated_at: string;
          generator_version: string;
          id?: string;
          manifest: Json;
          manifest_sha256: string;
          manifest_text: string;
          municipal_scope_approved?: boolean;
          plan_id: string;
          plan_sha256: string;
          professionally_reviewed?: boolean;
          project_id: string;
          report_eligible?: boolean;
          request_id: string;
          round_sha256: string;
          round_version_id: string;
          status?: string;
          version_no: number;
        };
        Update: {
          baseline_id?: string;
          baseline_sha256?: string;
          created_at?: string;
          created_by?: string;
          generated_at?: string;
          generator_version?: string;
          id?: string;
          manifest?: Json;
          manifest_sha256?: string;
          manifest_text?: string;
          municipal_scope_approved?: boolean;
          plan_id?: string;
          plan_sha256?: string;
          professionally_reviewed?: boolean;
          project_id?: string;
          report_eligible?: boolean;
          request_id?: string;
          round_sha256?: string;
          round_version_id?: string;
          status?: string;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "municipal_report_baseline";
            columns: ["project_id", "baseline_id", "baseline_sha256"];
            isOneToOne: false;
            referencedRelation: "project_baseline_snapshots";
            referencedColumns: ["project_id", "id", "manifest_sha256"];
          },
          {
            foreignKeyName: "municipal_report_plan";
            columns: ["project_id", "plan_id", "plan_sha256", "baseline_id", "baseline_sha256"];
            isOneToOne: false;
            referencedRelation: "verification_plan_versions";
            referencedColumns: [
              "project_id",
              "id",
              "manifest_sha256",
              "baseline_id",
              "baseline_sha256",
            ];
          },
          {
            foreignKeyName: "municipal_report_round";
            columns: [
              "project_id",
              "round_version_id",
              "round_sha256",
              "baseline_id",
              "baseline_sha256",
              "plan_id",
              "plan_sha256",
            ];
            isOneToOne: false;
            referencedRelation: "survey_round_versions";
            referencedColumns: [
              "project_id",
              "id",
              "manifest_sha256",
              "baseline_id",
              "baseline_sha256",
              "plan_id",
              "plan_sha256",
            ];
          },
          {
            foreignKeyName: "municipal_report_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      nature_contexts: {
        Row: {
          adjacent_nature_type: string | null;
          buffer_zone_m: number | null;
          created_at: string | null;
          distance_to_natura2000_m: number | null;
          distance_to_watercourse_m: number | null;
          id: string;
          natura2000_nearby: boolean | null;
          project_id: string | null;
          protected_nature_present: boolean | null;
          protected_nature_type: string | null;
          sensitive_receptors: string | null;
          terrain_slope_description: string | null;
          watercourse_name: string | null;
          watercourse_present: boolean | null;
        };
        Insert: {
          adjacent_nature_type?: string | null;
          buffer_zone_m?: number | null;
          created_at?: string | null;
          distance_to_natura2000_m?: number | null;
          distance_to_watercourse_m?: number | null;
          id?: string;
          natura2000_nearby?: boolean | null;
          project_id?: string | null;
          protected_nature_present?: boolean | null;
          protected_nature_type?: string | null;
          sensitive_receptors?: string | null;
          terrain_slope_description?: string | null;
          watercourse_name?: string | null;
          watercourse_present?: boolean | null;
        };
        Update: {
          adjacent_nature_type?: string | null;
          buffer_zone_m?: number | null;
          created_at?: string | null;
          distance_to_natura2000_m?: number | null;
          distance_to_watercourse_m?: number | null;
          id?: string;
          natura2000_nearby?: boolean | null;
          project_id?: string | null;
          protected_nature_present?: boolean | null;
          protected_nature_type?: string | null;
          sensitive_receptors?: string | null;
          terrain_slope_description?: string | null;
          watercourse_name?: string | null;
          watercourse_present?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "nature_contexts_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      observation_media: {
        Row: {
          ai_suggestions: Json;
          created_at: string;
          exif_data: Json;
          file_size_bytes: number | null;
          height: number | null;
          id: string;
          media_type: string;
          mime_type: string | null;
          observation_id: string;
          storage_path: string;
          uploaded_by: string | null;
          width: number | null;
        };
        Insert: {
          ai_suggestions?: Json;
          created_at?: string;
          exif_data?: Json;
          file_size_bytes?: number | null;
          height?: number | null;
          id?: string;
          media_type: string;
          mime_type?: string | null;
          observation_id: string;
          storage_path: string;
          uploaded_by?: string | null;
          width?: number | null;
        };
        Update: {
          ai_suggestions?: Json;
          created_at?: string;
          exif_data?: Json;
          file_size_bytes?: number | null;
          height?: number | null;
          id?: string;
          media_type?: string;
          mime_type?: string | null;
          observation_id?: string;
          storage_path?: string;
          uploaded_by?: string | null;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "observation_media_observation_id_fkey";
            columns: ["observation_id"];
            isOneToOne: false;
            referencedRelation: "field_observations";
            referencedColumns: ["id"];
          },
        ];
      };
      observations: {
        Row: {
          confidence: number | null;
          created_at: string | null;
          id: string;
          indicator_key: string | null;
          metadata: Json | null;
          observation_type: string | null;
          observed_at: string | null;
          project_id: string | null;
          site_id: string | null;
          source_id: string | null;
          unit: string | null;
          value: number | null;
        };
        Insert: {
          confidence?: number | null;
          created_at?: string | null;
          id?: string;
          indicator_key?: string | null;
          metadata?: Json | null;
          observation_type?: string | null;
          observed_at?: string | null;
          project_id?: string | null;
          site_id?: string | null;
          source_id?: string | null;
          unit?: string | null;
          value?: number | null;
        };
        Update: {
          confidence?: number | null;
          created_at?: string | null;
          id?: string;
          indicator_key?: string | null;
          metadata?: Json | null;
          observation_type?: string | null;
          observed_at?: string | null;
          project_id?: string | null;
          site_id?: string | null;
          source_id?: string | null;
          unit?: string | null;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "observations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observations_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "observations_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_memberships: {
        Row: {
          created_at: string;
          id: string;
          organization_id: string;
          role: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          organization_id: string;
          role?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          organization_id?: string;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_work_equipment: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          kind: string;
          name: string;
          organization_id: string;
          source_project_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id: string;
          kind: string;
          name: string;
          organization_id: string;
          source_project_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          kind?: string;
          name?: string;
          organization_id?: string;
          source_project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_work_equipment_source_project_id_organization_fkey";
            columns: ["source_project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      organizations: {
        Row: {
          country: string | null;
          created_at: string | null;
          id: string;
          name: string;
          type: string | null;
        };
        Insert: {
          country?: string | null;
          created_at?: string | null;
          id?: string;
          name: string;
          type?: string | null;
        };
        Update: {
          country?: string | null;
          created_at?: string | null;
          id?: string;
          name?: string;
          type?: string | null;
        };
        Relationships: [];
      };
      photo_point_review_versions: {
        Row: {
          binding_id: string;
          binding_sha256: string;
          created_at: string;
          id: string;
          project_id: string;
          request_id: string;
          review: Json;
          review_sha256: string;
          review_text: string;
          reviewed_by: string;
        };
        Insert: {
          binding_id: string;
          binding_sha256?: string;
          created_at?: string;
          id?: string;
          project_id: string;
          request_id: string;
          review: Json;
          review_sha256: string;
          review_text: string;
          reviewed_by: string;
        };
        Update: {
          binding_id?: string;
          binding_sha256?: string;
          created_at?: string;
          id?: string;
          project_id?: string;
          request_id?: string;
          review?: Json;
          review_sha256?: string;
          review_text?: string;
          reviewed_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "photo_point_review_versions_binding_id_fkey";
            columns: ["binding_id"];
            isOneToOne: false;
            referencedRelation: "survey_round_media_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photo_point_review_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "photo_review_exact_binding";
            columns: ["project_id", "binding_id", "binding_sha256"];
            isOneToOne: false;
            referencedRelation: "survey_round_media_versions";
            referencedColumns: ["project_id", "id", "manifest_sha256"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      project_approved_time_drafts: {
        Row: {
          created_at: string;
          created_by: string;
          date_from: string;
          date_through: string;
          id: string;
          material_refs: Json | null;
          material_snapshot: Json;
          organization_id: string;
          project_id: string;
          rate_ore: number;
          snapshot: Json;
          time_ids: string[];
          total_ore: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          date_from: string;
          date_through: string;
          id: string;
          material_refs?: Json | null;
          material_snapshot?: Json;
          organization_id: string;
          project_id: string;
          rate_ore: number;
          snapshot: Json;
          time_ids: string[];
          total_ore: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          date_from?: string;
          date_through?: string;
          id?: string;
          material_refs?: Json | null;
          material_snapshot?: Json;
          organization_id?: string;
          project_id?: string;
          rate_ore?: number;
          snapshot?: Json;
          time_ids?: string[];
          total_ore?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_approved_time_drafts_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      project_areas: {
        Row: {
          area_ha: number | null;
          area_type: string | null;
          created_at: string | null;
          geojson: Json | null;
          geom: unknown;
          id: string;
          name: string;
          project_id: string | null;
        };
        Insert: {
          area_ha?: number | null;
          area_type?: string | null;
          created_at?: string | null;
          geojson?: Json | null;
          geom?: unknown;
          id?: string;
          name: string;
          project_id?: string | null;
        };
        Update: {
          area_ha?: number | null;
          area_type?: string | null;
          created_at?: string | null;
          geojson?: Json | null;
          geom?: unknown;
          id?: string;
          name?: string;
          project_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_areas_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_baseline_snapshots: {
        Row: {
          created_at: string;
          created_by: string;
          geometry_sha256: string;
          id: string;
          manifest: Json;
          manifest_sha256: string;
          project_id: string;
          request_id: string;
          schema_version: number;
          version_no: number;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          geometry_sha256: string;
          id?: string;
          manifest: Json;
          manifest_sha256: string;
          project_id: string;
          request_id: string;
          schema_version?: number;
          version_no: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          geometry_sha256?: string;
          id?: string;
          manifest?: Json;
          manifest_sha256?: string;
          project_id?: string;
          request_id?: string;
          schema_version?: number;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_baseline_snapshots_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_material_catalog: {
        Row: {
          active: boolean;
          created_at: string;
          created_by: string;
          id: string;
          material: string;
          organization_id: string;
          project_id: string;
          unit: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          material: string;
          organization_id: string;
          project_id: string;
          unit: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          material?: string;
          organization_id?: string;
          project_id?: string;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_material_catalog_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      project_material_unit_prices: {
        Row: {
          catalog_id: string;
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          project_id: string;
          unit_price_ore: number | null;
          version: number;
        };
        Insert: {
          catalog_id: string;
          created_at?: string;
          created_by?: string;
          id: string;
          organization_id: string;
          project_id: string;
          unit_price_ore?: number | null;
          version: number;
        };
        Update: {
          catalog_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id?: string;
          project_id?: string;
          unit_price_ore?: number | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_material_unit_prices_catalog_id_organization_id_pr_fkey";
            columns: ["catalog_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "project_material_catalog";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      project_media: {
        Row: {
          accuracy_m: number | null;
          action_id: string | null;
          altitude_m: number | null;
          before_media_id: string | null;
          captured_at: string | null;
          category: string;
          description: string | null;
          direction: number | null;
          document_id: string | null;
          file_path: string;
          file_size_bytes: number | null;
          flight_id: string | null;
          id: string;
          is_report_ready: boolean;
          lat: number | null;
          lng: number | null;
          metadata: Json;
          mime_type: string | null;
          original_role: string | null;
          original_sha256: string | null;
          original_validation_sha256: string | null;
          original_validation_status: string | null;
          project_id: string;
          promoted_at: string | null;
          promoted_by: string | null;
          sha256: string | null;
          source: string;
          source_upload_id: string | null;
          status: string;
          storage_bucket: string;
          storage_object_id: string | null;
          storage_object_updated_at: string | null;
          storage_object_version: string | null;
          tags: string[];
          thumbnail_url: string | null;
          title: string;
          upload_scope: string;
          uploaded_at: string;
          url: string;
        };
        Insert: {
          accuracy_m?: number | null;
          action_id?: string | null;
          altitude_m?: number | null;
          before_media_id?: string | null;
          captured_at?: string | null;
          category: string;
          description?: string | null;
          direction?: number | null;
          document_id?: string | null;
          file_path: string;
          file_size_bytes?: number | null;
          flight_id?: string | null;
          id?: string;
          is_report_ready?: boolean;
          lat?: number | null;
          lng?: number | null;
          metadata?: Json;
          mime_type?: string | null;
          original_role?: string | null;
          original_sha256?: string | null;
          original_validation_sha256?: string | null;
          original_validation_status?: string | null;
          project_id: string;
          promoted_at?: string | null;
          promoted_by?: string | null;
          sha256?: string | null;
          source: string;
          source_upload_id?: string | null;
          status?: string;
          storage_bucket?: string;
          storage_object_id?: string | null;
          storage_object_updated_at?: string | null;
          storage_object_version?: string | null;
          tags?: string[];
          thumbnail_url?: string | null;
          title: string;
          upload_scope?: string;
          uploaded_at?: string;
          url: string;
        };
        Update: {
          accuracy_m?: number | null;
          action_id?: string | null;
          altitude_m?: number | null;
          before_media_id?: string | null;
          captured_at?: string | null;
          category?: string;
          description?: string | null;
          direction?: number | null;
          document_id?: string | null;
          file_path?: string;
          file_size_bytes?: number | null;
          flight_id?: string | null;
          id?: string;
          is_report_ready?: boolean;
          lat?: number | null;
          lng?: number | null;
          metadata?: Json;
          mime_type?: string | null;
          original_role?: string | null;
          original_sha256?: string | null;
          original_validation_sha256?: string | null;
          original_validation_status?: string | null;
          project_id?: string;
          promoted_at?: string | null;
          promoted_by?: string | null;
          sha256?: string | null;
          source?: string;
          source_upload_id?: string | null;
          status?: string;
          storage_bucket?: string;
          storage_object_id?: string | null;
          storage_object_updated_at?: string | null;
          storage_object_version?: string | null;
          tags?: string[];
          thumbnail_url?: string | null;
          title?: string;
          upload_scope?: string;
          uploaded_at?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_media_action_id_fkey";
            columns: ["action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_before_media_id_fkey";
            columns: ["before_media_id"];
            isOneToOne: false;
            referencedRelation: "project_media";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_before_media_id_fkey";
            columns: ["before_media_id"];
            isOneToOne: false;
            referencedRelation: "report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_before_media_id_fkey";
            columns: ["before_media_id"];
            isOneToOne: false;
            referencedRelation: "reviewed_report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_document_id_fkey";
            columns: ["document_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_flight_id_fkey";
            columns: ["flight_id"];
            isOneToOne: false;
            referencedRelation: "drone_flights";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_source_upload_id_fkey";
            columns: ["source_upload_id"];
            isOneToOne: false;
            referencedRelation: "uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      project_media_promotion_requests: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          media_id: string;
          origin_id: string;
          project_id: string;
          request_id: string;
          upload_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          media_id: string;
          origin_id: string;
          project_id: string;
          request_id: string;
          upload_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          media_id?: string;
          origin_id?: string;
          project_id?: string;
          request_id?: string;
          upload_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_media_promotion_requests_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "project_media";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_promotion_requests_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_promotion_requests_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "reviewed_report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_promotion_requests_origin_id_fkey";
            columns: ["origin_id"];
            isOneToOne: false;
            referencedRelation: "project_media_upload_origins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_promotion_requests_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_promotion_requests_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      project_media_upload_origins: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          media_id: string;
          object_id: string;
          object_updated_at: string;
          object_version: string | null;
          original_role: string;
          original_sha256: string;
          original_validation_sha256: string;
          project_id: string;
          storage_bucket: string;
          storage_path: string;
          upload_id: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          media_id: string;
          object_id: string;
          object_updated_at: string;
          object_version?: string | null;
          original_role: string;
          original_sha256: string;
          original_validation_sha256: string;
          project_id: string;
          storage_bucket: string;
          storage_path: string;
          upload_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          media_id?: string;
          object_id?: string;
          object_updated_at?: string;
          object_version?: string | null;
          original_role?: string;
          original_sha256?: string;
          original_validation_sha256?: string;
          project_id?: string;
          storage_bucket?: string;
          storage_path?: string;
          upload_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_media_upload_origins_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "project_media";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_upload_origins_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_upload_origins_media_id_fkey";
            columns: ["media_id"];
            isOneToOne: false;
            referencedRelation: "reviewed_report_media_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_upload_origins_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_media_upload_origins_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: true;
            referencedRelation: "uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: {
          created_at: string;
          id: string;
          invited_by: string | null;
          project_id: string;
          role: Database["public"]["Enums"]["project_role"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          project_id: string;
          role: Database["public"]["Enums"]["project_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_by?: string | null;
          project_id?: string;
          role?: Database["public"]["Enums"]["project_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_work_availability_versions: {
        Row: {
          created_at: string;
          created_by: string;
          hours: number;
          id: string;
          organization_id: string;
          person_id: string;
          project_id: string;
          version: number;
          work_date: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          hours: number;
          id: string;
          organization_id: string;
          person_id: string;
          project_id: string;
          version: number;
          work_date: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          hours?: number;
          id?: string;
          organization_id?: string;
          person_id?: string;
          project_id?: string;
          version?: number;
          work_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_work_availability_versi_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      project_workspace_entries: {
        Row: {
          created_at: string;
          created_by: string;
          entry_id: string;
          id: string;
          kind: string;
          organization_id: string;
          payload: Json;
          project_id: string;
          title: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          entry_id?: string;
          id?: string;
          kind: string;
          organization_id: string;
          payload: Json;
          project_id: string;
          title: string;
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          entry_id?: string;
          id?: string;
          kind?: string;
          organization_id?: string;
          payload?: Json;
          project_id?: string;
          title?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "project_workspace_entries_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_workspace_entries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          country: string | null;
          created_at: string | null;
          description: string | null;
          end_date: string | null;
          geometry_area_ha: number | null;
          geometry_centroid_lat: number | null;
          geometry_centroid_lng: number | null;
          geometry_polygon: Json | null;
          geometry_source: string | null;
          id: string;
          location_name: string | null;
          municipality: string | null;
          name: string;
          organization_id: string | null;
          project_type: string | null;
          slug: string | null;
          start_date: string | null;
          status: string | null;
        };
        Insert: {
          country?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          geometry_area_ha?: number | null;
          geometry_centroid_lat?: number | null;
          geometry_centroid_lng?: number | null;
          geometry_polygon?: Json | null;
          geometry_source?: string | null;
          id?: string;
          location_name?: string | null;
          municipality?: string | null;
          name: string;
          organization_id?: string | null;
          project_type?: string | null;
          slug?: string | null;
          start_date?: string | null;
          status?: string | null;
        };
        Update: {
          country?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          geometry_area_ha?: number | null;
          geometry_centroid_lat?: number | null;
          geometry_centroid_lng?: number | null;
          geometry_polygon?: Json | null;
          geometry_source?: string | null;
          id?: string;
          location_name?: string | null;
          municipality?: string | null;
          name?: string;
          organization_id?: string | null;
          project_type?: string | null;
          slug?: string | null;
          start_date?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      report_documents: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          project_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id: string;
          project_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "report_documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "report_documents_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      report_revisions: {
        Row: {
          content: Json;
          created_at: string;
          created_by: string;
          id: string;
          report_id: string;
          status: string;
          version: number;
        };
        Insert: {
          content: Json;
          created_at?: string;
          created_by?: string;
          id?: string;
          report_id: string;
          status: string;
          version: number;
        };
        Update: {
          content?: Json;
          created_at?: string;
          created_by?: string;
          id?: string;
          report_id?: string;
          status?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "report_revisions_report_id_fkey";
            columns: ["report_id"];
            isOneToOne: false;
            referencedRelation: "report_documents";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string | null;
          id: string;
          period_end: string | null;
          period_start: string | null;
          project_id: string | null;
          report_type: string | null;
          status: string | null;
          summary: string | null;
          title: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          period_end?: string | null;
          period_start?: string | null;
          project_id?: string | null;
          report_type?: string | null;
          status?: string | null;
          summary?: string | null;
          title: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          period_end?: string | null;
          period_start?: string | null;
          project_id?: string | null;
          report_type?: string | null;
          status?: string | null;
          summary?: string | null;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reports_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      runoff_profiles: {
        Row: {
          created_at: string | null;
          design_rain_event: string | null;
          discharge_point_description: string | null;
          drainage_principle: string | null;
          estimated_runoff_volume_m3: number | null;
          id: string;
          maintenance_responsibility: string | null;
          oil_separator_present: boolean | null;
          project_id: string | null;
          retention_solution: string | null;
          runoff_destination: string | null;
          sediment_control_present: boolean | null;
          treatment_solution: string | null;
        };
        Insert: {
          created_at?: string | null;
          design_rain_event?: string | null;
          discharge_point_description?: string | null;
          drainage_principle?: string | null;
          estimated_runoff_volume_m3?: number | null;
          id?: string;
          maintenance_responsibility?: string | null;
          oil_separator_present?: boolean | null;
          project_id?: string | null;
          retention_solution?: string | null;
          runoff_destination?: string | null;
          sediment_control_present?: boolean | null;
          treatment_solution?: string | null;
        };
        Update: {
          created_at?: string | null;
          design_rain_event?: string | null;
          discharge_point_description?: string | null;
          drainage_principle?: string | null;
          estimated_runoff_volume_m3?: number | null;
          id?: string;
          maintenance_responsibility?: string | null;
          oil_separator_present?: boolean | null;
          project_id?: string | null;
          retention_solution?: string | null;
          runoff_destination?: string | null;
          sediment_control_present?: boolean | null;
          treatment_solution?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "runoff_profiles_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      sensors: {
        Row: {
          created_at: string | null;
          id: string;
          last_seen_at: string | null;
          lat: number | null;
          lng: number | null;
          name: string;
          project_id: string | null;
          sensor_type: string | null;
          site_id: string | null;
          status: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          last_seen_at?: string | null;
          lat?: number | null;
          lng?: number | null;
          name: string;
          project_id?: string | null;
          sensor_type?: string | null;
          site_id?: string | null;
          status?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          last_seen_at?: string | null;
          lat?: number | null;
          lng?: number | null;
          name?: string;
          project_id?: string | null;
          sensor_type?: string | null;
          site_id?: string | null;
          status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "sensors_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sensors_site_id_fkey";
            columns: ["site_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id"];
          },
        ];
      };
      sites: {
        Row: {
          archived_at: string | null;
          area_ha: number | null;
          baseline_status: string | null;
          centroid_lat: number | null;
          centroid_lng: number | null;
          created_at: string | null;
          description: string | null;
          geometry_geojson: Json | null;
          id: string;
          name: string;
          project_id: string | null;
          site_type: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          archived_at?: string | null;
          area_ha?: number | null;
          baseline_status?: string | null;
          centroid_lat?: number | null;
          centroid_lng?: number | null;
          created_at?: string | null;
          description?: string | null;
          geometry_geojson?: Json | null;
          id?: string;
          name: string;
          project_id?: string | null;
          site_type?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          archived_at?: string | null;
          area_ha?: number | null;
          baseline_status?: string | null;
          centroid_lat?: number | null;
          centroid_lng?: number | null;
          created_at?: string | null;
          description?: string | null;
          geometry_geojson?: Json | null;
          id?: string;
          name?: string;
          project_id?: string | null;
          site_type?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sites_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      survey_round_media_versions: {
        Row: {
          baseline_id: string;
          baseline_sha256: string;
          builder_version: string;
          created_at: string;
          created_by: string;
          id: string;
          manifest: Json;
          manifest_sha256: string;
          media_id: string;
          original_sha256: string;
          original_validation_sha256: string;
          plan_id: string;
          plan_sha256: string;
          project_id: string;
          request_id: string;
          round_sha256: string;
          round_version_id: string;
          status: string;
          storage_object_id: string;
          storage_object_updated_at: string;
          storage_object_version: string | null;
          version_no: number;
        };
        Insert: {
          baseline_id: string;
          baseline_sha256: string;
          builder_version: string;
          created_at?: string;
          created_by: string;
          id?: string;
          manifest: Json;
          manifest_sha256: string;
          media_id: string;
          original_sha256: string;
          original_validation_sha256: string;
          plan_id: string;
          plan_sha256: string;
          project_id: string;
          request_id: string;
          round_sha256: string;
          round_version_id: string;
          status?: string;
          storage_object_id: string;
          storage_object_updated_at: string;
          storage_object_version?: string | null;
          version_no: number;
        };
        Update: {
          baseline_id?: string;
          baseline_sha256?: string;
          builder_version?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          manifest?: Json;
          manifest_sha256?: string;
          media_id?: string;
          original_sha256?: string;
          original_validation_sha256?: string;
          plan_id?: string;
          plan_sha256?: string;
          project_id?: string;
          request_id?: string;
          round_sha256?: string;
          round_version_id?: string;
          status?: string;
          storage_object_id?: string;
          storage_object_updated_at?: string;
          storage_object_version?: string | null;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "round_media_exact_original";
            columns: [
              "project_id",
              "media_id",
              "original_sha256",
              "original_validation_sha256",
              "storage_object_id",
            ];
            isOneToOne: false;
            referencedRelation: "project_media";
            referencedColumns: [
              "project_id",
              "id",
              "original_sha256",
              "original_validation_sha256",
              "storage_object_id",
            ];
          },
          {
            foreignKeyName: "round_media_exact_round";
            columns: [
              "project_id",
              "round_version_id",
              "round_sha256",
              "baseline_id",
              "baseline_sha256",
              "plan_id",
              "plan_sha256",
            ];
            isOneToOne: false;
            referencedRelation: "survey_round_versions";
            referencedColumns: [
              "project_id",
              "id",
              "manifest_sha256",
              "baseline_id",
              "baseline_sha256",
              "plan_id",
              "plan_sha256",
            ];
          },
          {
            foreignKeyName: "survey_round_media_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      survey_round_note_versions: {
        Row: {
          baseline_id: string;
          baseline_sha256: string;
          created_at: string;
          created_by: string;
          id: string;
          logical_note_id: string;
          manifest: Json;
          manifest_sha256: string;
          media_binding_id: string;
          media_binding_sha256: string;
          media_id: string;
          method_version: string;
          note_version_no: number;
          original_sha256: string;
          original_validation_sha256: string;
          plan_id: string;
          plan_sha256: string;
          project_id: string;
          question_id: string;
          request_id: string;
          round_sha256: string;
          round_version_id: string;
          status: string;
          supersedes_id: string | null;
          version_no: number;
        };
        Insert: {
          baseline_id: string;
          baseline_sha256: string;
          created_at?: string;
          created_by: string;
          id?: string;
          logical_note_id: string;
          manifest: Json;
          manifest_sha256: string;
          media_binding_id: string;
          media_binding_sha256: string;
          media_id: string;
          method_version: string;
          note_version_no?: number;
          original_sha256: string;
          original_validation_sha256: string;
          plan_id: string;
          plan_sha256: string;
          project_id: string;
          question_id: string;
          request_id: string;
          round_sha256: string;
          round_version_id: string;
          status?: string;
          supersedes_id?: string | null;
          version_no: number;
        };
        Update: {
          baseline_id?: string;
          baseline_sha256?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          logical_note_id?: string;
          manifest?: Json;
          manifest_sha256?: string;
          media_binding_id?: string;
          media_binding_sha256?: string;
          media_id?: string;
          method_version?: string;
          note_version_no?: number;
          original_sha256?: string;
          original_validation_sha256?: string;
          plan_id?: string;
          plan_sha256?: string;
          project_id?: string;
          question_id?: string;
          request_id?: string;
          round_sha256?: string;
          round_version_id?: string;
          status?: string;
          supersedes_id?: string | null;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "note_exact_assignment";
            columns: [
              "project_id",
              "media_binding_id",
              "media_binding_sha256",
              "round_version_id",
              "round_sha256",
              "baseline_id",
              "baseline_sha256",
              "plan_id",
              "plan_sha256",
              "media_id",
              "original_sha256",
              "original_validation_sha256",
            ];
            isOneToOne: false;
            referencedRelation: "survey_round_media_versions";
            referencedColumns: [
              "project_id",
              "id",
              "manifest_sha256",
              "round_version_id",
              "round_sha256",
              "baseline_id",
              "baseline_sha256",
              "plan_id",
              "plan_sha256",
              "media_id",
              "original_sha256",
              "original_validation_sha256",
            ];
          },
          {
            foreignKeyName: "note_exact_round";
            columns: [
              "project_id",
              "round_version_id",
              "round_sha256",
              "baseline_id",
              "baseline_sha256",
              "plan_id",
              "plan_sha256",
            ];
            isOneToOne: false;
            referencedRelation: "survey_round_versions";
            referencedColumns: [
              "project_id",
              "id",
              "manifest_sha256",
              "baseline_id",
              "baseline_sha256",
              "plan_id",
              "plan_sha256",
            ];
          },
          {
            foreignKeyName: "survey_round_note_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      survey_round_versions: {
        Row: {
          baseline_id: string;
          baseline_sha256: string;
          builder_version: string;
          created_at: string;
          created_by: string;
          id: string;
          kind: string;
          manifest: Json;
          manifest_sha256: string;
          plan_id: string;
          plan_sha256: string;
          project_id: string;
          recording_date_from: string;
          recording_date_to: string;
          request_id: string;
          round_id: string;
          round_version_no: number;
          status: string;
          supersedes_id: string | null;
          title: string;
          version_no: number;
        };
        Insert: {
          baseline_id: string;
          baseline_sha256: string;
          builder_version: string;
          created_at?: string;
          created_by: string;
          id?: string;
          kind: string;
          manifest: Json;
          manifest_sha256: string;
          plan_id: string;
          plan_sha256: string;
          project_id: string;
          recording_date_from: string;
          recording_date_to: string;
          request_id: string;
          round_id?: string;
          round_version_no?: number;
          status?: string;
          supersedes_id?: string | null;
          title: string;
          version_no: number;
        };
        Update: {
          baseline_id?: string;
          baseline_sha256?: string;
          builder_version?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          kind?: string;
          manifest?: Json;
          manifest_sha256?: string;
          plan_id?: string;
          plan_sha256?: string;
          project_id?: string;
          recording_date_from?: string;
          recording_date_to?: string;
          request_id?: string;
          round_id?: string;
          round_version_no?: number;
          status?: string;
          supersedes_id?: string | null;
          title?: string;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "survey_round_baseline_binding";
            columns: ["project_id", "baseline_id", "baseline_sha256"];
            isOneToOne: false;
            referencedRelation: "project_baseline_snapshots";
            referencedColumns: ["project_id", "id", "manifest_sha256"];
          },
          {
            foreignKeyName: "survey_round_plan_baseline_binding";
            columns: ["project_id", "plan_id", "plan_sha256", "baseline_id", "baseline_sha256"];
            isOneToOne: false;
            referencedRelation: "verification_plan_versions";
            referencedColumns: [
              "project_id",
              "id",
              "manifest_sha256",
              "baseline_id",
              "baseline_sha256",
            ];
          },
          {
            foreignKeyName: "survey_round_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      upload_import_jobs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          error_report_path: string | null;
          id: string;
          job_type: string;
          metadata: Json;
          records_failed: number | null;
          records_imported: number | null;
          records_total: number | null;
          started_at: string | null;
          status: string;
          upload_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          error_report_path?: string | null;
          id?: string;
          job_type: string;
          metadata?: Json;
          records_failed?: number | null;
          records_imported?: number | null;
          records_total?: number | null;
          started_at?: string | null;
          status?: string;
          upload_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          error_report_path?: string | null;
          id?: string;
          job_type?: string;
          metadata?: Json;
          records_failed?: number | null;
          records_imported?: number | null;
          records_total?: number | null;
          started_at?: string | null;
          status?: string;
          upload_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "upload_import_jobs_upload_id_fkey";
            columns: ["upload_id"];
            isOneToOne: false;
            referencedRelation: "uploads";
            referencedColumns: ["id"];
          },
        ];
      };
      uploads: {
        Row: {
          created_at: string;
          detected_metadata: Json;
          file_name: string;
          file_size: number;
          id: string;
          import_result: Json;
          intent_expires_at: string | null;
          intent_request_id: string | null;
          mime_type: string;
          organization_id: string | null;
          original_file_name: string;
          original_sha256: string | null;
          original_validation: Json | null;
          original_validation_sha256: string | null;
          project_id: string | null;
          received_at: string | null;
          source_reference: string | null;
          status: string;
          storage_path: string;
          updated_at: string;
          upload_type: string;
          uploaded_by: string;
          user_metadata: Json;
          validation_result: Json;
          zone_id: string | null;
        };
        Insert: {
          created_at?: string;
          detected_metadata?: Json;
          file_name: string;
          file_size: number;
          id?: string;
          import_result?: Json;
          intent_expires_at?: string | null;
          intent_request_id?: string | null;
          mime_type: string;
          organization_id?: string | null;
          original_file_name: string;
          original_sha256?: string | null;
          original_validation?: Json | null;
          original_validation_sha256?: string | null;
          project_id?: string | null;
          received_at?: string | null;
          source_reference?: string | null;
          status?: string;
          storage_path: string;
          updated_at?: string;
          upload_type?: string;
          uploaded_by: string;
          user_metadata?: Json;
          validation_result?: Json;
          zone_id?: string | null;
        };
        Update: {
          created_at?: string;
          detected_metadata?: Json;
          file_name?: string;
          file_size?: number;
          id?: string;
          import_result?: Json;
          intent_expires_at?: string | null;
          intent_request_id?: string | null;
          mime_type?: string;
          organization_id?: string | null;
          original_file_name?: string;
          original_sha256?: string | null;
          original_validation?: Json | null;
          original_validation_sha256?: string | null;
          project_id?: string | null;
          received_at?: string | null;
          source_reference?: string | null;
          status?: string;
          storage_path?: string;
          updated_at?: string;
          upload_type?: string;
          uploaded_by?: string;
          user_metadata?: Json;
          validation_result?: Json;
          zone_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "uploads_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "uploads_zone_id_fkey";
            columns: ["zone_id"];
            isOneToOne: false;
            referencedRelation: "monitoring_zones";
            referencedColumns: ["id"];
          },
        ];
      };
      verification_plan_versions: {
        Row: {
          baseline_id: string;
          baseline_sha256: string;
          created_at: string;
          created_by: string;
          generator_version: string;
          id: string;
          manifest: Json;
          manifest_sha256: string;
          project_id: string;
          request_id: string;
          version_no: number;
        };
        Insert: {
          baseline_id: string;
          baseline_sha256: string;
          created_at?: string;
          created_by: string;
          generator_version: string;
          id?: string;
          manifest: Json;
          manifest_sha256: string;
          project_id: string;
          request_id: string;
          version_no: number;
        };
        Update: {
          baseline_id?: string;
          baseline_sha256?: string;
          created_at?: string;
          created_by?: string;
          generator_version?: string;
          id?: string;
          manifest?: Json;
          manifest_sha256?: string;
          project_id?: string;
          request_id?: string;
          version_no?: number;
        };
        Relationships: [
          {
            foreignKeyName: "verification_plan_baseline_binding";
            columns: ["project_id", "baseline_id", "baseline_sha256"];
            isOneToOne: false;
            referencedRelation: "project_baseline_snapshots";
            referencedColumns: ["project_id", "id", "manifest_sha256"];
          },
          {
            foreignKeyName: "verification_plan_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      watercourse_observation_reviews: {
        Row: {
          approved_at: string;
          approved_by: string;
          observation_id: string;
        };
        Insert: {
          approved_at?: string;
          approved_by?: string;
          observation_id: string;
        };
        Update: {
          approved_at?: string;
          approved_by?: string;
          observation_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "watercourse_observation_reviews_observation_id_fkey";
            columns: ["observation_id"];
            isOneToOne: true;
            referencedRelation: "watercourse_observations";
            referencedColumns: ["id"];
          },
        ];
      };
      watercourse_observations: {
        Row: {
          centerline_version_id: string;
          comparison: Json | null;
          created_at: string;
          created_by: string;
          determination_level: string;
          feature_key: string;
          id: string;
          kind: string;
          organization_id: string;
          project_id: string;
          quality_flags: string[];
          segment_id: string;
          source_ids: string[];
          text: string;
        };
        Insert: {
          centerline_version_id: string;
          comparison?: Json | null;
          created_at?: string;
          created_by?: string;
          determination_level: string;
          feature_key: string;
          id?: string;
          kind: string;
          organization_id: string;
          project_id: string;
          quality_flags?: string[];
          segment_id: string;
          source_ids: string[];
          text: string;
        };
        Update: {
          centerline_version_id?: string;
          comparison?: Json | null;
          created_at?: string;
          created_by?: string;
          determination_level?: string;
          feature_key?: string;
          id?: string;
          kind?: string;
          organization_id?: string;
          project_id?: string;
          quality_flags?: string[];
          segment_id?: string;
          source_ids?: string[];
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: "watercourse_observations_centerline_version_id_fkey";
            columns: ["centerline_version_id"];
            isOneToOne: false;
            referencedRelation: "watercourse_versions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "watercourse_observations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "watercourse_observations_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      watercourse_versions: {
        Row: {
          created_at: string;
          created_by: string;
          crs: string;
          direction: string;
          geometry: Json;
          id: string;
          length_m: number;
          method: string;
          organization_id: string;
          project_id: string;
          segments: Json;
          source: string;
          version: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string;
          crs: string;
          direction: string;
          geometry: Json;
          id?: string;
          length_m: number;
          method: string;
          organization_id: string;
          project_id: string;
          segments?: Json;
          source: string;
          version: number;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          crs?: string;
          direction?: string;
          geometry?: Json;
          id?: string;
          length_m?: number;
          method?: string;
          organization_id?: string;
          project_id?: string;
          segments?: Json;
          source?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "watercourse_versions_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "watercourse_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      work_equipment_rental_rate_versions: {
        Row: {
          changed_at: string;
          changed_by: string;
          currency: string;
          daily_price_minor: number | null;
          equipment_id: string;
          organization_id: string;
          request_id: string;
          version: number;
        };
        Insert: {
          changed_at?: string;
          changed_by: string;
          currency?: string;
          daily_price_minor?: number | null;
          equipment_id: string;
          organization_id: string;
          request_id: string;
          version: number;
        };
        Update: {
          changed_at?: string;
          changed_by?: string;
          currency?: string;
          daily_price_minor?: number | null;
          equipment_id?: string;
          organization_id?: string;
          request_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_equipment_rental_rate_ve_equipment_id_organization_id_fkey";
            columns: ["equipment_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_work_equipment";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      work_order_access_versions: {
        Row: {
          action_id: string;
          active: boolean;
          can_execute: boolean;
          can_review: boolean;
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          project_id: string;
          reason: string;
          request_id: string;
          user_id: string;
          version: number;
        };
        Insert: {
          action_id: string;
          active: boolean;
          can_execute: boolean;
          can_review: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id: string;
          project_id: string;
          reason: string;
          request_id: string;
          user_id: string;
          version: number;
        };
        Update: {
          action_id?: string;
          active?: boolean;
          can_execute?: boolean;
          can_review?: boolean;
          created_at?: string;
          created_by?: string;
          id?: string;
          organization_id?: string;
          project_id?: string;
          reason?: string;
          request_id?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_access_versions_action_id_organization_id_proje_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
        ];
      };
      work_order_assignment_versions: {
        Row: {
          action_id: string;
          candidate_memberships: Json;
          candidate_user_ids: string[];
          change_kind: string;
          claim_member_snapshot: Json | null;
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          created_by: string;
          id: string;
          mode: string;
          organization_id: string;
          plan_version_id: string;
          project_id: string;
          reason: string;
          request_id: string;
          source_group_id: string | null;
          source_group_version_id: string | null;
          version: number;
        };
        Insert: {
          action_id: string;
          candidate_memberships?: Json;
          candidate_user_ids: string[];
          change_kind: string;
          claim_member_snapshot?: Json | null;
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          mode: string;
          organization_id: string;
          plan_version_id: string;
          project_id: string;
          reason: string;
          request_id: string;
          source_group_id?: string | null;
          source_group_version_id?: string | null;
          version: number;
        };
        Update: {
          action_id?: string;
          candidate_memberships?: Json;
          candidate_user_ids?: string[];
          change_kind?: string;
          claim_member_snapshot?: Json | null;
          claimed_at?: string | null;
          claimed_by?: string | null;
          created_at?: string;
          created_by?: string;
          id?: string;
          mode?: string;
          organization_id?: string;
          plan_version_id?: string;
          project_id?: string;
          reason?: string;
          request_id?: string;
          source_group_id?: string | null;
          source_group_version_id?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_assignment_version_action_id_organization_id_pr_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_assignment_version_plan_version_id_action_id_or_fkey";
            columns: ["plan_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_plan_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_assignment_version_source_group_version_id_sour_fkey";
            columns: [
              "source_group_version_id",
              "source_group_id",
              "organization_id",
              "project_id",
            ];
            isOneToOne: false;
            referencedRelation: "work_order_group_versions";
            referencedColumns: ["id", "group_id", "organization_id", "project_id"];
          },
        ];
      };
      work_order_equipment_bookings: {
        Row: {
          action_id: string;
          cancelled_at: string | null;
          cancelled_by: string | null;
          created_at: string;
          created_by: string;
          ends_on: string;
          equipment_id: string;
          id: string;
          organization_id: string;
          project_id: string;
          starts_on: string;
        };
        Insert: {
          action_id: string;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string;
          ends_on: string;
          equipment_id: string;
          id: string;
          organization_id: string;
          project_id: string;
          starts_on: string;
        };
        Update: {
          action_id?: string;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          created_at?: string;
          created_by?: string;
          ends_on?: string;
          equipment_id?: string;
          id?: string;
          organization_id?: string;
          project_id?: string;
          starts_on?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_equipment_bookings_action_id_organization_id_pr_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_equipment_bookings_equipment_id_organization_id_fkey";
            columns: ["equipment_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "organization_work_equipment";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      work_order_equipment_custody: {
        Row: {
          booking_id: string;
          checked_out_at: string;
          checked_out_by: string;
          checkout_request_id: string;
          equipment_id: string;
          holder_id: string;
          return_request_id: string | null;
          returned_at: string | null;
          returned_by: string | null;
        };
        Insert: {
          booking_id: string;
          checked_out_at?: string;
          checked_out_by: string;
          checkout_request_id: string;
          equipment_id: string;
          holder_id: string;
          return_request_id?: string | null;
          returned_at?: string | null;
          returned_by?: string | null;
        };
        Update: {
          booking_id?: string;
          checked_out_at?: string;
          checked_out_by?: string;
          checkout_request_id?: string;
          equipment_id?: string;
          holder_id?: string;
          return_request_id?: string | null;
          returned_at?: string | null;
          returned_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_equipment_custody_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: true;
            referencedRelation: "work_order_equipment_bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_order_equipment_custody_equipment_id_fkey";
            columns: ["equipment_id"];
            isOneToOne: false;
            referencedRelation: "organization_work_equipment";
            referencedColumns: ["id"];
          },
        ];
      };
      work_order_equipment_service_reports: {
        Row: {
          booking_id: string;
          condition: string;
          equipment_id: string;
          id: string;
          kind: string;
          next_service_on: string | null;
          note: string;
          recorded_at: string;
          recorded_by: string;
        };
        Insert: {
          booking_id: string;
          condition: string;
          equipment_id: string;
          id: string;
          kind: string;
          next_service_on?: string | null;
          note: string;
          recorded_at?: string;
          recorded_by: string;
        };
        Update: {
          booking_id?: string;
          condition?: string;
          equipment_id?: string;
          id?: string;
          kind?: string;
          next_service_on?: string | null;
          note?: string;
          recorded_at?: string;
          recorded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_equipment_service_reports_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "work_order_equipment_bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "work_order_equipment_service_reports_equipment_id_fkey";
            columns: ["equipment_id"];
            isOneToOne: false;
            referencedRelation: "organization_work_equipment";
            referencedColumns: ["id"];
          },
        ];
      };
      work_order_equipment_transfers: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          accuracy_m: number | null;
          booking_id: string;
          id: string;
          latitude: number | null;
          longitude: number | null;
          offered_at: string;
          offered_by: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          accuracy_m?: number | null;
          booking_id: string;
          id: string;
          latitude?: number | null;
          longitude?: number | null;
          offered_at?: string;
          offered_by: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          accuracy_m?: number | null;
          booking_id?: string;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          offered_at?: string;
          offered_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_equipment_transfers_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "work_order_equipment_custody";
            referencedColumns: ["booking_id"];
          },
        ];
      };
      work_order_evidence_versions: {
        Row: {
          action_id: string;
          created_at: string;
          created_by: string;
          evidence_id: string;
          execution_revision_id: string | null;
          id: string;
          observation_snapshot: Json;
          observation_version_id: string;
          organization_id: string;
          original_snapshot: Json;
          project_id: string;
          reason: string;
          request_id: string;
          state: string;
          upload_id: string;
          version: number;
        };
        Insert: {
          action_id: string;
          created_at?: string;
          created_by?: string;
          evidence_id: string;
          execution_revision_id?: string | null;
          id?: string;
          observation_snapshot: Json;
          observation_version_id: string;
          organization_id: string;
          original_snapshot: Json;
          project_id: string;
          reason: string;
          request_id: string;
          state: string;
          upload_id: string;
          version: number;
        };
        Update: {
          action_id?: string;
          created_at?: string;
          created_by?: string;
          evidence_id?: string;
          execution_revision_id?: string | null;
          id?: string;
          observation_snapshot?: Json;
          observation_version_id?: string;
          organization_id?: string;
          original_snapshot?: Json;
          project_id?: string;
          reason?: string;
          request_id?: string;
          state?: string;
          upload_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_evidence_versions_action_id_organization_id_pro_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_evidence_versions_execution_revision_id_action__fkey";
            columns: ["execution_revision_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_execution_bindings";
            referencedColumns: ["workspace_entry_id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_evidence_versions_observation_version_id_action_fkey";
            columns: ["observation_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "field_job_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_evidence_versions_upload_id_project_id_fkey";
            columns: ["upload_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "field_photo_receipts";
            referencedColumns: ["upload_id", "project_id"];
          },
        ];
      };
      work_order_execution_bindings: {
        Row: {
          action_id: string;
          actual_end: string | null;
          actual_method: string | null;
          actual_start: string | null;
          assignment_version_id: string | null;
          coverage: string;
          created_at: string;
          created_by: string;
          deviation_reason: string;
          documentation_gaps: string[];
          membership_snapshot: Json | null;
          organization_id: string;
          performed_by_id: string | null;
          plan_version: number;
          plan_version_id: string;
          project_id: string;
          request_id: string;
          version: number;
          workspace_entry_id: string;
        };
        Insert: {
          action_id: string;
          actual_end?: string | null;
          actual_method?: string | null;
          actual_start?: string | null;
          assignment_version_id?: string | null;
          coverage: string;
          created_at?: string;
          created_by?: string;
          deviation_reason: string;
          documentation_gaps: string[];
          membership_snapshot?: Json | null;
          organization_id: string;
          performed_by_id?: string | null;
          plan_version: number;
          plan_version_id: string;
          project_id: string;
          request_id: string;
          version: number;
          workspace_entry_id: string;
        };
        Update: {
          action_id?: string;
          actual_end?: string | null;
          actual_method?: string | null;
          actual_start?: string | null;
          assignment_version_id?: string | null;
          coverage?: string;
          created_at?: string;
          created_by?: string;
          deviation_reason?: string;
          documentation_gaps?: string[];
          membership_snapshot?: Json | null;
          organization_id?: string;
          performed_by_id?: string | null;
          plan_version?: number;
          plan_version_id?: string;
          project_id?: string;
          request_id?: string;
          version?: number;
          workspace_entry_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_execution_assignment_scope";
            columns: ["assignment_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_assignment_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_execution_bindings_plan_version_id_action_id_or_fkey";
            columns: ["plan_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_plan_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_execution_bindings_workspace_entry_id_action_id_fkey";
            columns: [
              "workspace_entry_id",
              "action_id",
              "organization_id",
              "project_id",
              "version",
            ];
            isOneToOne: false;
            referencedRelation: "project_workspace_entries";
            referencedColumns: ["id", "entry_id", "organization_id", "project_id", "version"];
          },
        ];
      };
      work_order_group_versions: {
        Row: {
          active: boolean;
          correction_reason: string;
          created_at: string;
          created_by: string;
          group_id: string;
          id: string;
          member_assessments: Json;
          member_ids: string[];
          name: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          version: number;
        };
        Insert: {
          active: boolean;
          correction_reason?: string;
          created_at?: string;
          created_by?: string;
          group_id: string;
          id?: string;
          member_assessments?: Json;
          member_ids: string[];
          name: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          version: number;
        };
        Update: {
          active?: boolean;
          correction_reason?: string;
          created_at?: string;
          created_by?: string;
          group_id?: string;
          id?: string;
          member_assessments?: Json;
          member_ids?: string[];
          name?: string;
          organization_id?: string;
          project_id?: string;
          request_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_group_versions_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      work_order_lifecycle_versions: {
        Row: {
          action_id: string;
          assignment_version_id: string | null;
          block_due_date: string | null;
          block_next_action: string | null;
          block_owner_id: string | null;
          block_reason: string | null;
          blocked: boolean;
          created_at: string;
          created_by: string;
          execution_revision_id: string | null;
          id: string;
          operation: string;
          organization_id: string;
          plan_version_id: string | null;
          project_id: string;
          reason: string;
          request_id: string;
          request_values: Json;
          review_scope: string | null;
          started_at: string | null;
          started_by_id: string | null;
          started_source: string | null;
          status: string;
          submission_version_id: string | null;
          version: number;
        };
        Insert: {
          action_id: string;
          assignment_version_id?: string | null;
          block_due_date?: string | null;
          block_next_action?: string | null;
          block_owner_id?: string | null;
          block_reason?: string | null;
          blocked: boolean;
          created_at?: string;
          created_by?: string;
          execution_revision_id?: string | null;
          id?: string;
          operation: string;
          organization_id: string;
          plan_version_id?: string | null;
          project_id: string;
          reason: string;
          request_id: string;
          request_values: Json;
          review_scope?: string | null;
          started_at?: string | null;
          started_by_id?: string | null;
          started_source?: string | null;
          status: string;
          submission_version_id?: string | null;
          version: number;
        };
        Update: {
          action_id?: string;
          assignment_version_id?: string | null;
          block_due_date?: string | null;
          block_next_action?: string | null;
          block_owner_id?: string | null;
          block_reason?: string | null;
          blocked?: boolean;
          created_at?: string;
          created_by?: string;
          execution_revision_id?: string | null;
          id?: string;
          operation?: string;
          organization_id?: string;
          plan_version_id?: string | null;
          project_id?: string;
          reason?: string;
          request_id?: string;
          request_values?: Json;
          review_scope?: string | null;
          started_at?: string | null;
          started_by_id?: string | null;
          started_source?: string | null;
          status?: string;
          submission_version_id?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_lifecycle_submission_scope";
            columns: ["submission_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_submission_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_lifecycle_versions_action_id_organization_id_pr_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_lifecycle_versions_assignment_version_id_action_fkey";
            columns: ["assignment_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_assignment_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_lifecycle_versions_execution_revision_id_action_fkey";
            columns: ["execution_revision_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_execution_bindings";
            referencedColumns: ["workspace_entry_id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_lifecycle_versions_plan_version_id_action_id_or_fkey";
            columns: ["plan_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_plan_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
        ];
      };
      work_order_material_versions: {
        Row: {
          action_id: string;
          actor_id: string;
          catalog_id: string | null;
          created_at: string;
          entry_id: string;
          id: string;
          material: string;
          organization_id: string;
          project_id: string;
          quantity_milli: number;
          reason: string;
          unit: string;
          version: number;
        };
        Insert: {
          action_id: string;
          actor_id?: string;
          catalog_id?: string | null;
          created_at?: string;
          entry_id: string;
          id: string;
          material: string;
          organization_id: string;
          project_id: string;
          quantity_milli: number;
          reason?: string;
          unit: string;
          version: number;
        };
        Update: {
          action_id?: string;
          actor_id?: string;
          catalog_id?: string | null;
          created_at?: string;
          entry_id?: string;
          id?: string;
          material?: string;
          organization_id?: string;
          project_id?: string;
          quantity_milli?: number;
          reason?: string;
          unit?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_material_versions_action_id_organization_id_pro_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_material_versions_catalog_id_organization_id_pr_fkey";
            columns: ["catalog_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "project_material_catalog";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
        ];
      };
      work_order_note_versions: {
        Row: {
          action_id: string;
          assignment_version_id: string | null;
          author_id: string;
          body: string;
          correction_reason: string;
          created_at: string;
          created_by: string;
          execution_revision_id: string | null;
          id: string;
          kind: string;
          lifecycle_version_id: string | null;
          note_id: string;
          organization_id: string;
          plan_version_id: string | null;
          project_id: string;
          request_id: string;
          version: number;
        };
        Insert: {
          action_id: string;
          assignment_version_id?: string | null;
          author_id: string;
          body: string;
          correction_reason: string;
          created_at?: string;
          created_by?: string;
          execution_revision_id?: string | null;
          id?: string;
          kind: string;
          lifecycle_version_id?: string | null;
          note_id: string;
          organization_id: string;
          plan_version_id?: string | null;
          project_id: string;
          request_id: string;
          version: number;
        };
        Update: {
          action_id?: string;
          assignment_version_id?: string | null;
          author_id?: string;
          body?: string;
          correction_reason?: string;
          created_at?: string;
          created_by?: string;
          execution_revision_id?: string | null;
          id?: string;
          kind?: string;
          lifecycle_version_id?: string | null;
          note_id?: string;
          organization_id?: string;
          plan_version_id?: string | null;
          project_id?: string;
          request_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_note_versions_action_id_organization_id_project_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_note_versions_assignment_version_id_action_id_o_fkey";
            columns: ["assignment_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_assignment_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_note_versions_execution_revision_id_action_id_o_fkey";
            columns: ["execution_revision_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_execution_bindings";
            referencedColumns: ["workspace_entry_id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_note_versions_lifecycle_version_id_action_id_or_fkey";
            columns: ["lifecycle_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_lifecycle_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_note_versions_plan_version_id_action_id_organiz_fkey";
            columns: ["plan_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_plan_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
        ];
      };
      work_order_plan_versions: {
        Row: {
          action_id: string;
          bottom_width_m: number | null;
          centerline_version_id: string | null;
          correction_reason: string;
          created_at: string;
          created_by: string;
          id: string;
          length_m: number | null;
          organization_id: string;
          plan: Json;
          planned_end: string | null;
          planned_start: string | null;
          profile_key: string | null;
          project_id: string;
          request_id: string;
          responsible_id: string | null;
          site_id: string | null;
          source_action_id: string | null;
          source_plan_version: number | null;
          source_plan_version_id: string | null;
          station_from_m: number | null;
          station_to_m: number | null;
          version: number;
        };
        Insert: {
          action_id: string;
          bottom_width_m?: number | null;
          centerline_version_id?: string | null;
          correction_reason?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          length_m?: number | null;
          organization_id: string;
          plan: Json;
          planned_end?: string | null;
          planned_start?: string | null;
          profile_key?: string | null;
          project_id: string;
          request_id: string;
          responsible_id?: string | null;
          site_id?: string | null;
          source_action_id?: string | null;
          source_plan_version?: number | null;
          source_plan_version_id?: string | null;
          station_from_m?: number | null;
          station_to_m?: number | null;
          version: number;
        };
        Update: {
          action_id?: string;
          bottom_width_m?: number | null;
          centerline_version_id?: string | null;
          correction_reason?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          length_m?: number | null;
          organization_id?: string;
          plan?: Json;
          planned_end?: string | null;
          planned_start?: string | null;
          profile_key?: string | null;
          project_id?: string;
          request_id?: string;
          responsible_id?: string | null;
          site_id?: string | null;
          source_action_id?: string | null;
          source_plan_version?: number | null;
          source_plan_version_id?: string | null;
          station_from_m?: number | null;
          station_to_m?: number | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_plan_versions_action_id_organization_id_project_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_plan_versions_centerline_version_id_organizatio_fkey";
            columns: ["centerline_version_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "watercourse_versions";
            referencedColumns: ["id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_plan_versions_site_id_project_id_fkey";
            columns: ["site_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "sites";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "work_order_plan_versions_source_plan_version_id_fkey";
            columns: ["source_plan_version_id"];
            isOneToOne: false;
            referencedRelation: "work_order_plan_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_order_prerequisite_versions: {
        Row: {
          action_id: string;
          created_at: string;
          created_by: string;
          organization_id: string;
          prerequisite_action_id: string | null;
          prerequisite_action_ids: string[] | null;
          project_id: string;
          request_id: string;
          version: number;
        };
        Insert: {
          action_id: string;
          created_at?: string;
          created_by?: string;
          organization_id: string;
          prerequisite_action_id?: string | null;
          prerequisite_action_ids?: string[] | null;
          project_id: string;
          request_id: string;
          version: number;
        };
        Update: {
          action_id?: string;
          created_at?: string;
          created_by?: string;
          organization_id?: string;
          prerequisite_action_id?: string | null;
          prerequisite_action_ids?: string[] | null;
          project_id?: string;
          request_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_prerequisite_versi_action_id_organization_id_pr_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_prerequisite_versions_prerequisite_action_id_fkey";
            columns: ["prerequisite_action_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_order_series_members: {
        Row: {
          cadence: string;
          member_count: number;
          plan_version_id: string;
          position: number;
          series_id: string;
        };
        Insert: {
          cadence: string;
          member_count: number;
          plan_version_id: string;
          position: number;
          series_id: string;
        };
        Update: {
          cadence?: string;
          member_count?: number;
          plan_version_id?: string;
          position?: number;
          series_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_series_members_plan_version_id_fkey";
            columns: ["plan_version_id"];
            isOneToOne: true;
            referencedRelation: "work_order_plan_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_order_submission_versions: {
        Row: {
          action_id: string;
          assignment_version_id: string;
          basis_hash: string;
          created_at: string;
          created_by: string;
          execution_revision_id: string;
          id: string;
          lifecycle_version_id: string;
          note: string;
          organization_id: string;
          plan_version_id: string;
          project_id: string;
          request_id: string;
          snapshot: Json;
          version: number;
        };
        Insert: {
          action_id: string;
          assignment_version_id: string;
          basis_hash: string;
          created_at?: string;
          created_by?: string;
          execution_revision_id: string;
          id?: string;
          lifecycle_version_id: string;
          note: string;
          organization_id: string;
          plan_version_id: string;
          project_id: string;
          request_id: string;
          snapshot: Json;
          version: number;
        };
        Update: {
          action_id?: string;
          assignment_version_id?: string;
          basis_hash?: string;
          created_at?: string;
          created_by?: string;
          execution_revision_id?: string;
          id?: string;
          lifecycle_version_id?: string;
          note?: string;
          organization_id?: string;
          plan_version_id?: string;
          project_id?: string;
          request_id?: string;
          snapshot?: Json;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_submission_version_action_id_organization_id_pr_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_submission_version_assignment_version_id_action_fkey";
            columns: ["assignment_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_assignment_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_submission_version_execution_revision_id_action_fkey";
            columns: ["execution_revision_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_execution_bindings";
            referencedColumns: ["workspace_entry_id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_submission_version_lifecycle_version_id_action__fkey";
            columns: ["lifecycle_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_lifecycle_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_submission_version_plan_version_id_action_id_or_fkey";
            columns: ["plan_version_id", "action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_order_plan_versions";
            referencedColumns: ["id", "action_id", "organization_id", "project_id"];
          },
        ];
      };
      work_order_time_approvals: {
        Row: {
          approved_at: string;
          approved_by: string;
          time_id: string;
        };
        Insert: {
          approved_at?: string;
          approved_by?: string;
          time_id: string;
        };
        Update: {
          approved_at?: string;
          approved_by?: string;
          time_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_time_approvals_time_id_fkey";
            columns: ["time_id"];
            isOneToOne: true;
            referencedRelation: "work_order_time_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_order_time_versions: {
        Row: {
          action_id: string;
          actor_id: string;
          created_at: string;
          id: string;
          minutes: number;
          organization_id: string;
          project_id: string;
          reason: string;
          version: number;
          work_date: string;
        };
        Insert: {
          action_id: string;
          actor_id?: string;
          created_at?: string;
          id: string;
          minutes: number;
          organization_id: string;
          project_id: string;
          reason?: string;
          version: number;
          work_date: string;
        };
        Update: {
          action_id?: string;
          actor_id?: string;
          created_at?: string;
          id?: string;
          minutes?: number;
          organization_id?: string;
          project_id?: string;
          reason?: string;
          version?: number;
          work_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_time_versions_action_id_organization_id_project_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
        ];
      };
      work_order_visit_results: {
        Row: {
          action_id: string;
          created_at: string;
          created_by: string;
          id: string;
          note: string;
          organization_id: string;
          outcome: string;
          plan_version_id: string;
          project_id: string;
          site_id: string;
          version: number;
        };
        Insert: {
          action_id: string;
          created_at?: string;
          created_by?: string;
          id: string;
          note: string;
          organization_id: string;
          outcome: string;
          plan_version_id: string;
          project_id: string;
          site_id: string;
          version: number;
        };
        Update: {
          action_id?: string;
          created_at?: string;
          created_by?: string;
          id?: string;
          note?: string;
          organization_id?: string;
          outcome?: string;
          plan_version_id?: string;
          project_id?: string;
          site_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "work_order_visit_results_action_id_organization_id_project_fkey";
            columns: ["action_id", "organization_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "work_orders";
            referencedColumns: ["action_id", "organization_id", "project_id"];
          },
          {
            foreignKeyName: "work_order_visit_results_plan_version_id_fkey";
            columns: ["plan_version_id"];
            isOneToOne: false;
            referencedRelation: "work_order_plan_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      work_orders: {
        Row: {
          action_id: string;
          created_at: string;
          created_by: string;
          organization_id: string;
          project_id: string;
          request_id: string;
        };
        Insert: {
          action_id: string;
          created_at?: string;
          created_by?: string;
          organization_id: string;
          project_id: string;
          request_id: string;
        };
        Update: {
          action_id?: string;
          created_at?: string;
          created_by?: string;
          organization_id?: string;
          project_id?: string;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "work_orders_action_id_project_id_fkey";
            columns: ["action_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "actions";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "work_orders_project_id_organization_id_fkey";
            columns: ["project_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
    };
    Views: {
      comparison_photo_sources: {
        Row: {
          action_id: string | null;
          before_media_id: string | null;
          capture_date: string | null;
          captured_at: string | null;
          category: string | null;
          id: string | null;
          lat: number | null;
          lng: number | null;
          project_id: string | null;
          sha256: string | null;
          status: string | null;
          title: string | null;
          uploaded_at: string | null;
        };
        Relationships: [];
      };
      municipal_report_latest_answers: {
        Row: {
          answers: Json | null;
          answers_sha256: string | null;
          answers_text: string | null;
          created_at: string | null;
          created_by: string | null;
          id: string | null;
          inspection_id: string | null;
          inspection_result_sha256: string | null;
          professionally_reviewed: boolean | null;
          project_id: string | null;
          report_eligible: boolean | null;
          request_id: string | null;
          status: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "drone_image_inspection_answer_versions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "image_answers_exact_inspection";
            columns: ["project_id", "inspection_id", "inspection_result_sha256"];
            isOneToOne: false;
            referencedRelation: "drone_image_inspections";
            referencedColumns: ["project_id", "id", "result_sha256"];
          },
        ];
      };
      report_media_sources: {
        Row: {
          captured_at: string | null;
          category: string | null;
          file_path: string | null;
          id: string | null;
          lat: number | null;
          lng: number | null;
          mime_type: string | null;
          project_id: string | null;
          sha256: string | null;
          storage_bucket: string | null;
          title: string | null;
          uploaded_at: string | null;
          uses_field_receipt: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_media_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      report_registration_sources: {
        Row: {
          id: string | null;
          project_id: string | null;
          source: Json | null;
        };
        Relationships: [];
      };
      reviewed_report_media_sources: {
        Row: {
          capture_date: string | null;
          captured_at: string | null;
          category: string | null;
          file_path: string | null;
          id: string | null;
          lat: number | null;
          lng: number | null;
          method: string | null;
          mime_type: string | null;
          photo_point_review: Json | null;
          project_id: string | null;
          sha256: string | null;
          storage_bucket: string | null;
          title: string | null;
          uploaded_at: string | null;
          uses_field_receipt: boolean | null;
          version: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_media_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      command_work_customers: {
        Args: {
          p_organization_id: string;
          p_expected_actor_id: string;
          p_request_id: string;
          p_operation: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      query_work_customers: {
        Args: {
          p_organization_id: string;
          p_expected_actor_id: string;
          p_operation: string;
          p_payload: Json;
        };
        Returns: Json;
      };
      advance_field_photo_background: {
        Args: {
          p_lease_id: string;
          p_upload_id: string;
        };
        Returns: undefined;
      };
      amend_gps_trip: {
        Args: {
          p_classification: string;
          p_device_id: string;
          p_project_id: string;
          p_purpose?: string;
          p_revision: number;
          p_trip_id: string;
        };
        Returns: number;
      };
      approve_gps_trip: {
        Args: {
          p_device_id: string;
          p_project_id: string;
          p_revision: number;
          p_trip_id: string;
        };
        Returns: string;
      };
      begin_field_photo_upload: {
        Args: {
          p_payload: Json;
          p_project_id: string;
          p_upload_id: string;
        };
        Returns: {
          captured_action_id: string | null;
          captured_organization_id: string | null;
          captured_plan_version_id: string | null;
          created_at: string;
          created_by: string;
          id: string;
          object_id: string | null;
          object_updated_at: string | null;
          object_version: string | null;
          payload: Json;
          project_id: string;
          received_at: string | null;
          storage_path: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "field_photo_uploads";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      can_review_gps_trips: {
        Args: {
          p_project_id: string;
        };
        Returns: boolean;
      };
      cancel_upload_intent: {
        Args: {
          p_upload_id: string;
        };
        Returns: {
          status: string;
          storage_path: string;
          upload_id: string;
        }[];
      };
      cancel_work_order_series: {
        Args: {
          p_expected_actor_id: string;
          p_expected_plans: Json;
          p_organization_id: string;
          p_project_id: string;
          p_reason: string;
          p_request_id: string;
          p_series_id: string;
        };
        Returns: number;
      };
      change_work_order_equipment_custody: {
        Args: {
          p_action_id: string;
          p_booking_id: string;
          p_operation: string;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      change_work_order_equipment_transfer: {
        Args: {
          p_accuracy_m?: number;
          p_action_id: string;
          p_booking_id: string;
          p_code?: string;
          p_latitude?: number;
          p_longitude?: number;
          p_operation: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      claim_drone_image_inspection: {
        Args: {
          p_actor_id: string;
          p_media_id: string;
          p_method_version: string;
          p_model_id: string;
          p_project_id: string;
          p_prompt_version: string;
          p_provider: string;
          p_request_id: string;
          p_source_snapshot_id?: string;
          p_source_snapshot_sha256?: string;
        };
        Returns: Json;
      };
      claim_field_photo_background: {
        Args: never;
        Returns: Json;
      };
      claim_upload_intent_orphans: {
        Args: {
          p_lease_seconds?: number;
          p_limit?: number;
        };
        Returns: {
          claim_token: string;
          storage_path: string;
          upload_id: string;
        }[];
      };
      claim_work_order_pool: {
        Args: {
          p_action_id: string;
          p_expected_version: number;
          p_organization_id: string;
          p_plan_version_id: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: {
          action_id: string;
          candidate_memberships: Json;
          candidate_user_ids: string[];
          change_kind: string;
          claim_member_snapshot: Json | null;
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          created_by: string;
          id: string;
          mode: string;
          organization_id: string;
          plan_version_id: string;
          project_id: string;
          reason: string;
          request_id: string;
          source_group_id: string | null;
          source_group_version_id: string | null;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_assignment_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_field_photo_preview: {
        Args: {
          p_height: number;
          p_lease_id: string;
          p_object_id: string;
          p_object_updated_at: string;
          p_object_version: string;
          p_sha256: string;
          p_size_bytes: number;
          p_upload_id: string;
          p_width: number;
        };
        Returns: {
          created_at: string;
          created_by: string;
          height: number;
          object_id: string;
          object_updated_at: string;
          object_version: string | null;
          project_id: string;
          recipe: string;
          sha256: string;
          size_bytes: number;
          source_sha256: string;
          storage_path: string;
          upload_id: string;
          width: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "field_photo_previews";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_field_photo_verification: {
        Args: {
          p_actor_id: string;
          p_lease_id: string;
          p_project_id: string;
          p_sha256: string;
          p_size_bytes: number;
          p_upload_id: string;
        };
        Returns: {
          object_id: string;
          object_updated_at: string;
          object_version: string | null;
          project_id: string;
          sha256: string;
          size_bytes: number;
          status: string;
          upload_id: string;
          validator_version: string;
          verified_at: string;
          verified_by: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "field_photo_receipts";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      complete_upload_intent_orphan_cleanup: {
        Args: {
          p_claim_token: string;
          p_error?: string;
          p_upload_id: string;
        };
        Returns: boolean;
      };
      configure_work_order_assignment: {
        Args: {
          p_action_id: string;
          p_candidate_user_ids: string[];
          p_expected_version: number;
          p_mode: string;
          p_organization_id: string;
          p_plan_version_id: string;
          p_project_id: string;
          p_reason: string;
          p_request_id: string;
          p_source_group_version_id: string;
        };
        Returns: {
          action_id: string;
          candidate_memberships: Json;
          candidate_user_ids: string[];
          change_kind: string;
          claim_member_snapshot: Json | null;
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          created_by: string;
          id: string;
          mode: string;
          organization_id: string;
          plan_version_id: string;
          project_id: string;
          reason: string;
          request_id: string;
          source_group_id: string | null;
          source_group_version_id: string | null;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_assignment_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      create_upload_intent: {
        Args: {
          p_client_request_id: string;
          p_file_size: number;
          p_mime_type: string;
          p_original_file_name: string;
          p_project_id: string;
          p_upload_type?: string;
          p_user_metadata?: Json;
          p_zone_id?: string;
        };
        Returns: {
          intent_expires_at: string;
          storage_path: string;
          upload_id: string;
        }[];
      };
      create_work_order_observation_draft: {
        Args: {
          p_action_id: string;
          p_description: string;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
          p_sources: Json;
          p_title: string;
        };
        Returns: Json[];
      };
      create_work_order_series: {
        Args: {
          p_count: number;
          p_expected_actor_id: string;
          p_first_date: string;
          p_interval: string;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
          p_source_plan_version_id: string;
        };
        Returns: string[];
      };
      create_work_order_weekly_series: {
        Args: {
          p_count: number;
          p_expected_actor_id: string;
          p_first_date: string;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
          p_source_plan_version_id: string;
        };
        Returns: string[];
      };
      equipment_service_journal: {
        Args: {
          p_action_id: string;
          p_booking_id: string;
          p_condition?: string;
          p_kind?: string;
          p_limit?: number;
          p_next_service_on?: string;
          p_note?: string;
          p_organization_id: string;
          p_project_id: string;
          p_report_id?: string;
        };
        Returns: Json;
      };
      export_approved_gps_trips: {
        Args: {
          p_device_id: string;
          p_from: string;
          p_project_id: string;
          p_through: string;
        };
        Returns: Json;
      };
      fail_field_photo_background: {
        Args: {
          p_error: string;
          p_lease_id: string;
          p_upload_id: string;
        };
        Returns: undefined;
      };
      finalize_field_photo_upload: {
        Args: {
          p_project_id: string;
          p_upload_id: string;
        };
        Returns: {
          captured_action_id: string | null;
          captured_organization_id: string | null;
          captured_plan_version_id: string | null;
          created_at: string;
          created_by: string;
          id: string;
          object_id: string | null;
          object_updated_at: string | null;
          object_version: string | null;
          payload: Json;
          project_id: string;
          received_at: string | null;
          storage_path: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "field_photo_uploads";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      finalize_upload_intent: {
        Args: {
          p_upload_id: string;
        };
        Returns: {
          status: string;
          storage_path: string;
          upload_id: string;
        }[];
      };
      finish_drone_image_inspection: {
        Args: {
          p_actor_id: string;
          p_claim_token: string;
          p_failure_code?: string;
          p_inspection_id: string;
          p_project_id: string;
          p_result_text?: string;
        };
        Returns: Json;
      };
      get_project_approved_time_export: {
        Args: {
          p_from: string;
          p_organization_id: string;
          p_project_id: string;
          p_through: string;
        };
        Returns: Json;
      };
      get_project_geojson: {
        Args: {
          input_project_id: string;
        };
        Returns: Json;
      };
      get_project_material_billing_export: {
        Args: {
          p_from: string;
          p_organization_id: string;
          p_project_id: string;
          p_through: string;
        };
        Returns: Json;
      };
      get_project_metrics: {
        Args: {
          input_project_id: string;
        };
        Returns: Json;
      };
      get_work_order_access: {
        Args: {
          p_action_id: string;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          can_execute: boolean;
          can_manage_access: boolean;
          can_plan: boolean;
          can_review: boolean;
          organization_id: string;
          project_id: string;
          user_id: string;
        }[];
      };
      get_work_order_access_history: {
        Args: {
          p_action_id: string;
          p_before_version: number;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
          p_user_id: string;
        };
        Returns: {
          action_id: string;
          active: boolean;
          can_execute: boolean;
          can_review: boolean;
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          project_id: string;
          reason: string;
          request_id: string;
          user_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_access_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_work_order_access_subjects: {
        Args: {
          p_action_id: string;
          p_after_user_id: string;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          user_id: string;
        }[];
      };
      get_work_order_assignment_history: {
        Args: {
          p_action_id: string;
          p_before_version: number;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          candidate_memberships: Json;
          candidate_user_ids: string[];
          change_kind: string;
          claim_member_snapshot: Json | null;
          claimed_at: string | null;
          claimed_by: string | null;
          created_at: string;
          created_by: string;
          id: string;
          mode: string;
          organization_id: string;
          plan_version_id: string;
          project_id: string;
          reason: string;
          request_id: string;
          source_group_id: string | null;
          source_group_version_id: string | null;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_assignment_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_work_order_assignment_state: {
        Args: {
          p_action_id: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          assignment: Json;
          can_claim: boolean;
          can_execute: boolean;
          organization_id: string;
          project_id: string;
          user_id: string;
        }[];
      };
      get_work_order_captured_photo_original: {
        Args: {
          p_action_id: string;
          p_id: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      get_work_order_evidence_original: {
        Args: {
          p_action_id: string;
          p_id: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      get_work_order_execution_binding: {
        Args: {
          p_action_id: string;
          p_organization_id: string;
          p_project_id: string;
          p_workspace_entry_id: string;
        };
        Returns: {
          action_id: string;
          actual_end: string | null;
          actual_method: string | null;
          actual_start: string | null;
          assignment_version_id: string | null;
          coverage: string;
          created_at: string;
          created_by: string;
          deviation_reason: string;
          documentation_gaps: string[];
          membership_snapshot: Json | null;
          organization_id: string;
          performed_by_id: string | null;
          plan_version: number;
          plan_version_id: string;
          project_id: string;
          request_id: string;
          version: number;
          workspace_entry_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_execution_bindings";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_work_order_group_history: {
        Args: {
          p_before_version: number;
          p_group_id: string;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          active: boolean;
          correction_reason: string;
          created_at: string;
          created_by: string;
          group_id: string;
          id: string;
          member_assessments: Json;
          member_ids: string[];
          name: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_group_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_work_order_lifecycle_context: {
        Args: {
          p_action_id: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          basis: Json;
          can_manage: boolean;
          can_note: boolean;
          can_perform: boolean;
          can_start: boolean;
          context_changed: boolean;
          organization_id: string;
          project_id: string;
          state: Json;
          user_id: string;
        }[];
      };
      get_work_order_log: {
        Args: {
          p_action_id: string;
          p_as_of: string;
          p_before_at: string;
          p_before_key: string;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          log: Json;
        }[];
      };
      get_work_order_note_history: {
        Args: {
          p_action_id: string;
          p_before_version: number;
          p_note_id: string;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          assignment_version_id: string | null;
          author_id: string;
          body: string;
          correction_reason: string;
          created_at: string;
          created_by: string;
          execution_revision_id: string | null;
          id: string;
          kind: string;
          lifecycle_version_id: string | null;
          note_id: string;
          organization_id: string;
          plan_version_id: string | null;
          project_id: string;
          request_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_note_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_work_order_observation_draft: {
        Args: {
          p_action_id: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: Json[];
      };
      get_work_order_photo_capture_access: {
        Args: {
          p_action_id: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      get_work_order_plan_history: {
        Args: {
          p_action_id: string;
          p_before_version: number;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          bottom_width_m: number | null;
          centerline_version_id: string | null;
          correction_reason: string;
          created_at: string;
          created_by: string;
          id: string;
          length_m: number | null;
          organization_id: string;
          plan: Json;
          planned_end: string | null;
          planned_start: string | null;
          profile_key: string | null;
          project_id: string;
          request_id: string;
          responsible_id: string | null;
          site_id: string | null;
          source_action_id: string | null;
          source_plan_version: number | null;
          source_plan_version_id: string | null;
          station_from_m: number | null;
          station_to_m: number | null;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_plan_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_work_order_prerequisite: {
        Args: {
          p_action_id: string;
        };
        Returns: Json;
      };
      get_work_order_review_context: {
        Args: {
          p_action_id: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      get_work_order_submission_context: {
        Args: {
          p_action_id: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      get_work_order_time_summary: {
        Args: {
          p_action_id: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      has_org_role: {
        Args: {
          _org_id: string;
          _roles: string[];
          _user_id: string;
        };
        Returns: boolean;
      };
      has_project_role: {
        Args: {
          _project_id: string;
          _role: Database["public"]["Enums"]["project_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      ingest_gps_position: {
        Args: {
          p_device_id: string;
          p_event_id: string;
          p_latitude: number;
          p_longitude: number;
          p_measured_at: string;
          p_project_id: string;
        };
        Returns: boolean;
      };
      ingest_observations_atomic: {
        Args: {
          p_observations: Json;
          p_project_id: string;
        };
        Returns: number;
      };
      initialize_work_order: {
        Args: {
          p_action_id: string;
          p_expected_version: number;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: {
          action_id: string;
          created_at: string;
          created_by: string;
          organization_id: string;
          project_id: string;
          request_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_orders";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      is_lavbund_projekt_member: {
        Args: {
          _projekt_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_org_member: {
        Args: {
          _org_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_project_admin: {
        Args: {
          _project_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_project_member: {
        Args: {
          _project_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_work_order_equipment_available: {
        Args: {
          p_action_id: string;
          p_ends_on: string;
          p_equipment_id: string;
          p_organization_id: string;
          p_project_id: string;
          p_starts_on: string;
        };
        Returns: boolean;
      };
      list_field_equipment_label: {
        Args: {
          p_equipment_id: string;
        };
        Returns: {
          action_id: string;
          booking_id: string;
          checked_out: boolean;
          ends_on: string;
          equipment_name: string;
          job_title: string;
          starts_on: string;
        }[];
      };
      list_field_work_order_equipment: {
        Args: {
          p_action_id: string;
          p_after_id?: string;
          p_after_starts_on?: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: {
          ends_on: string;
          id: string;
          kind: string;
          name: string;
          starts_on: string;
        }[];
      };
      list_gps_device_position_history: {
        Args: {
          p_before_id?: string;
          p_before_measured_at?: string;
          p_device_id: string;
          p_from: string;
          p_project_id: string;
          p_through: string;
        };
        Returns: {
          id: string;
          latitude: number;
          longitude: number;
          measured_at: string;
        }[];
      };
      list_latest_gps_device_positions: {
        Args: {
          p_project_id: string;
        };
        Returns: {
          device_id: string;
          latitude: number;
          longitude: number;
          measured_at: string;
        }[];
      };
      list_manager_work_orders:
        | {
            Args: {
              p_after_action_id: string;
              p_assignee_id: string;
              p_assignment: string;
              p_due_from: string;
              p_due_through: string;
              p_organization_id: string;
              p_page_size: number;
              p_project_id: string;
              p_search: string;
              p_status: string;
            };
            Returns: Json[];
          }
        | {
            Args: {
              p_after_action_id: string;
              p_assignee_id: string;
              p_assignment: string;
              p_due_from: string;
              p_due_through: string;
              p_organization_id: string;
              p_page_size: number;
              p_project_id: string;
              p_search: string;
              p_selection_token: string;
              p_status: string;
            };
            Returns: Json[];
          };
      list_my_work_orders: {
        Args: {
          p_after_action_id: string;
          p_page_size: number;
        };
        Returns: {
          action_id: string;
          assignment_id: string;
          assignment_mode: string;
          assignment_version: number;
          can_claim: boolean;
          can_execute: boolean;
          can_plan: boolean;
          can_review: boolean;
          claimed_by: string;
          organization_id: string;
          plan: Json;
          plan_version: number;
          plan_version_id: string;
          project_id: string;
          user_id: string;
        }[];
      };
      list_my_work_orders_with_filter: {
        Args: {
          p_after_action_id: string;
          p_filter: string;
          p_page_size: number;
        };
        Returns: Json[];
      };
      list_my_work_orders_with_readiness: {
        Args: {
          p_after_action_id: string;
          p_page_size: number;
        };
        Returns: Json[];
      };
      list_project_equipment_service_reminders: {
        Args: {
          p_after_due?: string;
          p_after_equipment_id?: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          days_until_service: number;
          equipment_id: string;
          equipment_name: string;
          next_service_on: string;
        }[];
      };
      list_project_work_order_time: {
        Args: {
          p_after_action_id?: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          entries: number;
          estimated_hours: number;
          minutes: number;
          title: string;
        }[];
      };
      list_project_work_order_time_review: {
        Args: {
          p_after_action_id?: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          entries: number;
          estimated_hours: number;
          minutes: number;
          pending_date: string;
          pending_entries: number;
          title: string;
        }[];
      };
      list_work_order_evidence: {
        Args: {
          p_action_id: string;
          p_after_id: string;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          created_at: string;
          created_by: string;
          evidence_id: string;
          execution_revision_id: string | null;
          id: string;
          observation_snapshot: Json;
          observation_version_id: string;
          organization_id: string;
          original_snapshot: Json;
          project_id: string;
          reason: string;
          request_id: string;
          state: string;
          upload_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_evidence_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_work_order_evidence_executions: {
        Args: {
          p_action_id: string;
          p_after_id: string;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          actual_end: string | null;
          actual_method: string | null;
          actual_start: string | null;
          assignment_version_id: string | null;
          coverage: string;
          created_at: string;
          created_by: string;
          deviation_reason: string;
          documentation_gaps: string[];
          membership_snapshot: Json | null;
          organization_id: string;
          performed_by_id: string | null;
          plan_version: number;
          plan_version_id: string;
          project_id: string;
          request_id: string;
          version: number;
          workspace_entry_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_execution_bindings";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_work_order_evidence_sources: {
        Args: {
          p_action_id: string;
          p_after_id: string;
          p_kind: string;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          id: string;
          label: string;
          sha256: string;
          version: number;
        }[];
      };
      list_work_order_groups: {
        Args: {
          p_after_group_id: string;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          active: boolean;
          correction_reason: string;
          created_at: string;
          created_by: string;
          group_id: string;
          id: string;
          member_assessments: Json;
          member_ids: string[];
          name: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_group_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_work_order_material_usage: {
        Args: {
          p_action_id: string;
          p_after_entry_id?: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          actor_id: string;
          catalog_id: string | null;
          created_at: string;
          entry_id: string;
          id: string;
          material: string;
          organization_id: string;
          project_id: string;
          quantity_milli: number;
          reason: string;
          unit: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_material_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_work_order_observation_sources: {
        Args: {
          p_after_observation_id: string;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
          p_search: string;
        };
        Returns: Json[];
      };
      list_work_order_people: {
        Args: {
          p_after_user_id: string;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          can_execute: boolean;
          display_name: string;
          email: string;
          organization_id: string;
          organization_role: string;
          project_id: string;
          project_role: string;
          user_id: string;
        }[];
      };
      list_work_order_submissions: {
        Args: {
          p_action_id: string;
          p_before_version: number;
          p_organization_id: string;
          p_page_size: number;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          assignment_version_id: string;
          basis_hash: string;
          created_at: string;
          created_by: string;
          execution_revision_id: string;
          id: string;
          lifecycle_version_id: string;
          note: string;
          organization_id: string;
          plan_version_id: string;
          project_id: string;
          request_id: string;
          snapshot: Json;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_submission_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      list_work_order_time_for_review: {
        Args: {
          p_action_id: string;
          p_after_actor_id?: string;
          p_organization_id: string;
          p_project_id: string;
          p_work_date: string;
        };
        Returns: {
          actor_id: string;
          approved: boolean;
          minutes: number;
          time_id: string;
          version: number;
        }[];
      };
      list_work_order_visit_results: {
        Args: {
          p_action_id: string;
          p_organization_id: string;
          p_plan_version_id: string;
          p_project_id: string;
        };
        Returns: {
          action_id: string;
          created_at: string;
          created_by: string;
          id: string;
          note: string;
          organization_id: string;
          outcome: string;
          plan_version_id: string;
          project_id: string;
          site_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_visit_results";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      mutate_work_order_lifecycle: {
        Args: {
          p_action_id: string;
          p_expected_version: number;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
          p_values: Json;
        };
        Returns: {
          action_id: string;
          assignment_version_id: string | null;
          block_due_date: string | null;
          block_next_action: string | null;
          block_owner_id: string | null;
          block_reason: string | null;
          blocked: boolean;
          created_at: string;
          created_by: string;
          execution_revision_id: string | null;
          id: string;
          operation: string;
          organization_id: string;
          plan_version_id: string | null;
          project_id: string;
          reason: string;
          request_id: string;
          request_values: Json;
          review_scope: string | null;
          started_at: string | null;
          started_by_id: string | null;
          started_source: string | null;
          status: string;
          submission_version_id: string | null;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_lifecycle_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      persist_drone_original_promotion: {
        Args: {
          p_actor_id: string;
          p_object_id: string;
          p_object_updated_at: string;
          p_object_version: string;
          p_original_sha256: string;
          p_project_id: string;
          p_request_id: string;
          p_upload_id: string;
          p_validation_sha256: string;
        };
        Returns: Json;
      };
      persist_drone_original_validation: {
        Args: {
          p_actor_id: string;
          p_object_id: string;
          p_object_updated_at: string;
          p_object_version: string;
          p_project_id: string;
          p_result: Json;
          p_result_sha256: string;
          p_upload_id: string;
        };
        Returns: Json;
      };
      persist_municipal_report: {
        Args: {
          p_actor_id: string;
          p_manifest_text: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      persist_project_baseline: {
        Args: {
          p_actor_id: string;
          p_manifest: Json;
          p_manifest_sha256: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      persist_survey_round: {
        Args: {
          p_actor_id: string;
          p_baseline_id: string;
          p_baseline_sha256: string;
          p_manifest_text: string;
          p_plan_id: string;
          p_plan_sha256: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      persist_survey_round_media: {
        Args: {
          p_actor_id: string;
          p_manifest_text: string;
          p_media_id: string;
          p_project_id: string;
          p_request_id: string;
          p_round_sha256: string;
          p_round_version_id: string;
        };
        Returns: Json;
      };
      persist_survey_round_note: {
        Args: {
          p_actor_id: string;
          p_logical_note_id: string;
          p_manifest_text: string;
          p_media_binding_id: string;
          p_media_binding_sha256: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      persist_verification_plan: {
        Args: {
          p_actor_id: string;
          p_baseline_id: string;
          p_baseline_sha256: string;
          p_manifest_text: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      prepare_drone_original_validation: {
        Args: {
          p_actor_id: string;
          p_project_id: string;
          p_upload_id: string;
        };
        Returns: Json;
      };
      prepare_field_photo_preview_commit: {
        Args: {
          p_lease_id: string;
          p_sha256: string;
          p_upload_id: string;
        };
        Returns: Json;
      };
      prepare_field_photo_verification: {
        Args: {
          p_actor_id: string;
          p_project_id: string;
          p_upload_id: string;
        };
        Returns: Json;
      };
      prepare_project_media_original_read: {
        Args: {
          p_actor_id: string;
          p_media_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      read_work_equipment_rental_rate: {
        Args: {
          p_equipment_id: string;
          p_organization_id: string;
        };
        Returns: Json;
      };
      read_work_order_equipment_custody: {
        Args: {
          p_action_id: string;
          p_booking_id: string;
          p_organization_id: string;
          p_project_id: string;
        };
        Returns: Json;
      };
      record_gps_trip: {
        Args: {
          p_classification: string;
          p_device_id: string;
          p_end_id: string;
          p_id: string;
          p_project_id: string;
          p_purpose?: string;
          p_start_id: string;
        };
        Returns: string;
      };
      record_project_data_export_request: {
        Args: {
          p_entity_id?: string;
          p_entity_type?: string;
          p_filename: string;
          p_format: string;
          p_project_id: string;
        };
        Returns: string;
      };
      release_field_photo_verification: {
        Args: {
          p_error: string;
          p_lease_id: string;
          p_upload_id: string;
        };
        Returns: undefined;
      };
      reserve_work_order_equipment: {
        Args: {
          p_action_id: string;
          p_ends_on: string;
          p_equipment_id: string;
          p_id: string;
          p_organization_id: string;
          p_project_id: string;
          p_starts_on: string;
        };
        Returns: string;
      };
      save_approved_work_order_report: {
        Args: {
          p_action_id: string;
          p_organization_id: string;
          p_project_id: string;
          p_review_id: string;
          p_submission_id: string;
        };
        Returns: Json;
      };
      save_drone_image_inspection_answers: {
        Args: {
          p_actor_id: string;
          p_answers_text: string;
          p_inspection_id: string;
          p_inspection_result_sha256: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      save_field_job_template_version: {
        Args: {
          p_definition: Json;
          p_expected_version: number;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
          p_template_id: string;
        };
        Returns: {
          created_at: string;
          created_by: string;
          definition: Json;
          id: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          template_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "field_job_template_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_field_job_version: {
        Args: {
          p_action_id: string;
          p_correction_reason: string;
          p_expected_version: number;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
          p_status: string;
          p_template_version_id: string;
          p_values: Json;
        };
        Returns: {
          action_id: string;
          correction_reason: string;
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          required_plan_version_id: string | null;
          status: string;
          template_version_id: string;
          values: Json;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "field_job_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_field_job_version_for_plan: {
        Args: {
          p_action_id: string;
          p_correction_reason: string;
          p_expected_version: number;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
          p_required_plan_version_id: string;
          p_status: string;
          p_template_version_id: string;
          p_values: Json;
        };
        Returns: {
          action_id: string;
          correction_reason: string;
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          required_plan_version_id: string | null;
          status: string;
          template_version_id: string;
          values: Json;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "field_job_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_field_photo_policy: {
        Args: {
          p_expected_version: number;
          p_organization_id: string;
          p_project_id: string;
          p_radius_m: number;
          p_reason: string;
          p_request_id: string;
        };
        Returns: {
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          project_id: string;
          radius_m: number;
          reason: string;
          request_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "field_photo_policy_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_field_photo_position: {
        Args: {
          p_expected_policy_version: number;
          p_expected_version: number;
          p_lat: number;
          p_lng: number;
          p_media_id: string;
          p_organization_id: string;
          p_project_id: string;
          p_reason: string;
          p_request_id: string;
        };
        Returns: {
          created_at: string;
          created_by: string;
          distance_m: number | null;
          id: string;
          lat: number;
          lng: number;
          media_id: string;
          organization_id: string;
          policy_version: number;
          project_id: string;
          radius_m: number;
          reason: string;
          request_id: string;
          status: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "field_photo_position_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_photo_point_review: {
        Args: {
          p_actor_id: string;
          p_binding_id: string;
          p_project_id: string;
          p_request_id: string;
          p_review_text: string;
        };
        Returns: Json;
      };
      save_report_revision: {
        Args: {
          _content: Json;
          _expected_version: number;
          _organization_id: string;
          _project_id: string;
          _report_id: string;
          _status: string;
        };
        Returns: Json;
      };
      save_work_order_access: {
        Args: {
          p_action_id: string;
          p_active: boolean;
          p_can_execute: boolean;
          p_can_review: boolean;
          p_expected_version: number;
          p_organization_id: string;
          p_project_id: string;
          p_reason: string;
          p_request_id: string;
          p_user_id: string;
        };
        Returns: {
          action_id: string;
          active: boolean;
          can_execute: boolean;
          can_review: boolean;
          created_at: string;
          created_by: string;
          id: string;
          organization_id: string;
          project_id: string;
          reason: string;
          request_id: string;
          user_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_access_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_work_order_evidence: {
        Args: {
          p_action_id: string;
          p_evidence_id: string;
          p_execution_revision_id: string;
          p_expected_version: number;
          p_observation_version_id: string;
          p_organization_id: string;
          p_project_id: string;
          p_reason: string;
          p_request_id: string;
          p_state: string;
          p_upload_id: string;
        };
        Returns: {
          action_id: string;
          created_at: string;
          created_by: string;
          evidence_id: string;
          execution_revision_id: string | null;
          id: string;
          observation_snapshot: Json;
          observation_version_id: string;
          organization_id: string;
          original_snapshot: Json;
          project_id: string;
          reason: string;
          request_id: string;
          state: string;
          upload_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_evidence_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_work_order_execution: {
        Args: {
          p_action_id: string;
          p_deviation_reason: string;
          p_execution: Json;
          p_expected_assignment_version?: number;
          p_expected_assignment_version_id?: string;
          p_expected_plan_version: number;
          p_expected_version: number;
          p_organization_id: string;
          p_performed_by_id: string;
          p_plan_version_id: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: {
          action_id: string;
          actual_end: string | null;
          actual_method: string | null;
          actual_start: string | null;
          assignment_version_id: string | null;
          coverage: string;
          created_at: string;
          created_by: string;
          deviation_reason: string;
          documentation_gaps: string[];
          membership_snapshot: Json | null;
          organization_id: string;
          performed_by_id: string | null;
          plan_version: number;
          plan_version_id: string;
          project_id: string;
          request_id: string;
          version: number;
          workspace_entry_id: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_execution_bindings";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_work_order_group: {
        Args: {
          p_active: boolean;
          p_correction_reason: string;
          p_expected_version: number;
          p_group_id: string;
          p_member_ids: string[];
          p_name: string;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: {
          active: boolean;
          correction_reason: string;
          created_at: string;
          created_by: string;
          group_id: string;
          id: string;
          member_assessments: Json;
          member_ids: string[];
          name: string;
          organization_id: string;
          project_id: string;
          request_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_group_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_work_order_note: {
        Args: {
          p_action_id: string;
          p_assignment_version_id: string;
          p_body: string;
          p_correction_reason: string;
          p_execution_revision_id: string;
          p_expected_version: number;
          p_kind: string;
          p_lifecycle_version_id: string;
          p_note_id: string;
          p_organization_id: string;
          p_plan_version_id: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: {
          action_id: string;
          assignment_version_id: string | null;
          author_id: string;
          body: string;
          correction_reason: string;
          created_at: string;
          created_by: string;
          execution_revision_id: string | null;
          id: string;
          kind: string;
          lifecycle_version_id: string | null;
          note_id: string;
          organization_id: string;
          plan_version_id: string | null;
          project_id: string;
          request_id: string;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_note_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_work_order_plan:
        | {
            Args: {
              p_action_id: string;
              p_correction_reason: string;
              p_expected_version: number;
              p_organization_id: string;
              p_plan: Json;
              p_project_id: string;
              p_request_id: string;
            };
            Returns: {
              action_id: string;
              bottom_width_m: number | null;
              centerline_version_id: string | null;
              correction_reason: string;
              created_at: string;
              created_by: string;
              id: string;
              length_m: number | null;
              organization_id: string;
              plan: Json;
              planned_end: string | null;
              planned_start: string | null;
              profile_key: string | null;
              project_id: string;
              request_id: string;
              responsible_id: string | null;
              site_id: string | null;
              source_action_id: string | null;
              source_plan_version: number | null;
              source_plan_version_id: string | null;
              station_from_m: number | null;
              station_to_m: number | null;
              version: number;
            }[];
            SetofOptions: {
              from: "*";
              to: "work_order_plan_versions";
              isOneToOne: false;
              isSetofReturn: true;
            };
          }
        | {
            Args: {
              p_action_id: string;
              p_correction_reason: string;
              p_expected_version: number;
              p_organization_id: string;
              p_plan: Json;
              p_project_id: string;
              p_request_id: string;
              p_source_plan_version_id: string;
            };
            Returns: {
              action_id: string;
              bottom_width_m: number | null;
              centerline_version_id: string | null;
              correction_reason: string;
              created_at: string;
              created_by: string;
              id: string;
              length_m: number | null;
              organization_id: string;
              plan: Json;
              planned_end: string | null;
              planned_start: string | null;
              profile_key: string | null;
              project_id: string;
              request_id: string;
              responsible_id: string | null;
              site_id: string | null;
              source_action_id: string | null;
              source_plan_version: number | null;
              source_plan_version_id: string | null;
              station_from_m: number | null;
              station_to_m: number | null;
              version: number;
            }[];
            SetofOptions: {
              from: "*";
              to: "work_order_plan_versions";
              isOneToOne: false;
              isSetofReturn: true;
            };
          };
      save_work_order_prerequisite: {
        Args: {
          p_action_id: string;
          p_expected_version: number;
          p_organization_id: string;
          p_prerequisite_action_id: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: number;
      };
      save_work_order_prerequisites: {
        Args: {
          p_action_id: string;
          p_expected_version: number;
          p_organization_id: string;
          p_prerequisite_action_ids: string[];
          p_project_id: string;
          p_request_id: string;
        };
        Returns: number;
      };
      save_work_order_submission: {
        Args: {
          p_action_id: string;
          p_basis_hash: string;
          p_expected_version: number;
          p_note: string;
          p_organization_id: string;
          p_project_id: string;
          p_request_id: string;
        };
        Returns: {
          action_id: string;
          assignment_version_id: string;
          basis_hash: string;
          created_at: string;
          created_by: string;
          execution_revision_id: string;
          id: string;
          lifecycle_version_id: string;
          note: string;
          organization_id: string;
          plan_version_id: string;
          project_id: string;
          request_id: string;
          snapshot: Json;
          version: number;
        }[];
        SetofOptions: {
          from: "*";
          to: "work_order_submission_versions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      save_workflow_followup_revision: {
        Args: {
          _entry_id: string;
          _expected_version: number;
          _organization_id: string;
          _payload: Json;
          _project_id: string;
          _title: string;
        };
        Returns: Json;
      };
      search_my_work_orders: {
        Args: {
          p_after_action_id: string;
          p_filter: string;
          p_page_size: number;
          p_search: string;
        };
        Returns: Json[];
      };
      set_work_equipment_rental_rate: {
        Args: {
          p_daily_price_minor: number;
          p_equipment_id: string;
          p_expected_version: number;
          p_organization_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      shift_work_order_series: {
        Args: {
          p_days: number;
          p_expected_actor_id: string;
          p_expected_plans: Json;
          p_organization_id: string;
          p_project_id: string;
          p_reason: string;
          p_request_id: string;
          p_series_id: string;
        };
        Returns: number;
      };
      workflow_report_contract_version: {
        Args: never;
        Returns: string;
      };
    };
    Enums: {
      project_role: "admin" | "project_manager" | "editor" | "field" | "viewer" | "external";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];
export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;
export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;
export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;
export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | {
        schema: keyof DatabaseWithoutInternals;
      },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;
export const Constants = {
  public: {
    Enums: {
      project_role: ["admin", "project_manager", "editor", "field", "viewer", "external"],
    },
  },
} as const;
