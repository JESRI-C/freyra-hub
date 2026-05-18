// GoFreyra database types — mirrors 001_gofreyra_core_schema.sql

// ─── GeoJSON types (minimal, no external lib needed) ──────────────────────────

export interface GeoJSONPosition {
  lng: number;
  lat: number;
}

export interface GeoJSONPolygon {
  type: "Polygon";
  coordinates: number[][][]; // outer ring first, holes after
}

export interface GeoJSONFeature {
  type: "Feature";
  geometry: GeoJSONPolygon;
  properties: Record<string, unknown>;
}

export interface ProjectGeometry {
  polygon: GeoJSONPolygon | null; // the project boundary
  centroid: GeoJSONPosition | null; // computed center point
  areaHa: number | null; // computed area in hectares
  hasValidGeometry: boolean;
  geometrySource: "uploaded" | "manual" | "estimated" | "none";
  bufferZones: {
    buffer100m: boolean; // metadata flag — real buffer calc needs turf.js
    buffer500m: boolean;
    buffer1000m: boolean;
  };
}

// Extend the existing Project type — add this field
// (We add a separate ProjectWithGeometry interface to avoid breaking changes)
export interface ProjectWithGeometry extends Project {
  geometry: ProjectGeometry;
}

// ─── Data Foundation — Connector Registry ─────────────────────────────────────

export type ConnectorStatus =
  | "active"
  | "connector_ready"
  | "configuration_required"
  | "preview_data"
  | "coming_soon";

export type ConnectorCategory =
  | "satellite"
  | "nature"
  | "water"
  | "terrain"
  | "weather"
  | "authority"
  | "soil"
  | "eu_reference";

export interface DataConnector {
  id: string;
  name: string;
  provider: string;
  category: ConnectorCategory;
  description: string;
  status: ConnectorStatus;
  api_base_url: string | null;
  requires_api_key: boolean;
  env_key_name: string | null;
  data_format: string;
  update_frequency: string;
  coverage: string;
  license: string;
  docs_url: string | null;
  example_endpoint: string | null;
}

export interface EnvironmentalContextResult {
  connector: DataConnector;
  projectId: string;
  fetchedAt: string;
  status: "success" | "fallback" | "error" | "not_configured";
  data: Record<string, unknown>;
  summary: string;
}

export interface LiveDataSnapshot {
  weather: {
    mode: "live" | "preview" | "error";
    status: string;
    temperature?: number;
    precipitation?: number;
    windSpeed?: number;
    humidity?: number;
    fetchedAt: string;
  } | null;
  nature: {
    mode: "live" | "preview" | "error";
    status: string;
    registrationCount: number;
    protectedCount: number;
    fetchedAt: string;
  } | null;
  fetchedAt: string;
}

export interface ProjectEnvironmentalContext {
  projectId: string;
  projectName: string;
  location: string;
  analyzedAt: string;
  natureContext: EnvironmentalContextResult | null;
  watercourseContext: EnvironmentalContextResult | null;
  satelliteContext: EnvironmentalContextResult | null;
  rainfallContext: EnvironmentalContextResult | null;
  terrainContext: EnvironmentalContextResult | null;
  groundwaterContext: EnvironmentalContextResult | null;
  protectedNatureContext: EnvironmentalContextResult | null;
  soilContext: EnvironmentalContextResult | null;
  overallReadiness: "complete" | "partial" | "pending";
  scores: {
    natureSensitivity: "low" | "medium" | "high" | "critical";
    runoffRisk: "low" | "medium" | "high" | "critical";
    dataCompleteness: number; // 0-100
  };
  geometry: ProjectGeometry;
  liveData?: LiveDataSnapshot;
}

export type Organization = {
  id: string;
  name: string;
  type: string | null;
  country: string;
  created_at: string;
};

export type Project = {
  id: string;
  organization_id: string | null;
  name: string;
  slug: string | null;
  project_type: string | null;
  location_name: string | null;
  municipality: string | null;
  country: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  description: string | null;
  created_at: string;
};

export type Site = {
  id: string;
  project_id: string | null;
  name: string;
  site_type: string | null;
  area_ha: number | null;
  geometry_geojson: Record<string, unknown> | null;
  baseline_status: string | null;
  created_at: string;
};

export type DataSource = {
  id: string;
  project_id: string | null;
  name: string;
  source_type: string | null;
  provider: string | null;
  status: string | null;
  last_sync_at: string | null;
  created_at: string;
};

export type Sensor = {
  id: string;
  project_id: string | null;
  site_id: string | null;
  name: string;
  sensor_type: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
  last_seen_at: string | null;
  created_at: string;
};

export type Observation = {
  id: string;
  project_id: string | null;
  site_id: string | null;
  source_id: string | null;
  observation_type: string | null;
  indicator_key: string | null;
  value: number | null;
  unit: string | null;
  confidence: number | null;
  observed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type Indicator = {
  id: string;
  project_id: string | null;
  key: string;
  label: string;
  category: string | null;
  value: number | null;
  unit: string | null;
  trend: "up" | "down" | "flat" | null;
  status: "ok" | "warning" | "critical" | null;
  updated_at: string;
};

export type Report = {
  id: string;
  project_id: string | null;
  title: string;
  report_type: string | null;
  status: string | null;
  period_start: string | null;
  period_end: string | null;
  summary: string | null;
  created_at: string;
};

export type EvidenceFile = {
  id: string;
  project_id: string | null;
  report_id: string | null;
  title: string;
  file_type: string | null;
  file_url: string | null;
  evidence_type: string | null;
  created_at: string;
};

export type AuditEvent = {
  id: string;
  project_id: string | null;
  event_type: string | null;
  title: string;
  description: string | null;
  actor: string | null;
  source: string | null;
  hash: string | null;
  created_at: string;
};

export type Action = {
  id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  priority: "Høj" | "Medium" | "Lav" | null;
  status: string | null;
  due_date: string | null;
  owner: string | null;
  created_at: string;
};

export type ImpactUnit = {
  id: string;
  project_id: string | null;
  unit_type: string | null;
  quantity: number | null;
  status: string | null;
  verification_status: string | null;
  issued_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

// ─── Construction Nature Compliance ───────────────────────────────────────────

export interface ConstructionProject {
  id: string;
  project_id: string;
  developer_name: string | null;
  contractor_name: string | null;
  consultant_name: string | null;
  construction_type: string | null;
  construction_phase: string | null;
  parcel_reference: string | null;
  building_area_m2: number | null;
  paved_area_m2: number | null;
  expected_start_date: string | null;
  expected_end_date: string | null;
  authority_contact: string | null;
  created_at: string;
}

export interface NatureContext {
  id: string;
  project_id: string;
  adjacent_nature_type: string | null;
  watercourse_present: boolean | null;
  watercourse_name: string | null;
  distance_to_watercourse_m: number | null;
  protected_nature_present: boolean | null;
  protected_nature_type: string | null;
  natura2000_nearby: boolean | null;
  distance_to_natura2000_m: number | null;
  buffer_zone_m: number | null;
  terrain_slope_description: string | null;
  sensitive_receptors: string | null;
  created_at: string;
}

export interface RunoffProfile {
  id: string;
  project_id: string;
  runoff_destination: string | null;
  drainage_principle: string | null;
  retention_solution: string | null;
  treatment_solution: string | null;
  oil_separator_present: boolean | null;
  sediment_control_present: boolean | null;
  discharge_point_description: string | null;
  estimated_runoff_volume_m3: number | null;
  design_rain_event: string | null;
  maintenance_responsibility: string | null;
  created_at: string;
}

export interface EnvironmentalRisk {
  id: string;
  project_id: string;
  risk_type: string | null;
  title: string;
  description: string | null;
  severity: string | null;
  likelihood: string | null;
  status: string | null;
  mitigation_summary: string | null;
  responsible_party: string | null;
  created_at: string;
}

export interface MitigationMeasure {
  id: string;
  project_id: string;
  risk_id: string | null;
  title: string;
  description: string | null;
  measure_type: string | null;
  status: string | null;
  due_date: string | null;
  responsible_party: string | null;
  verification_method: string | null;
  created_at: string;
}

export interface AuthoritySubmission {
  id: string;
  project_id: string;
  title: string;
  authority_name: string | null;
  submission_type: string | null;
  status: string | null;
  submitted_at: string | null;
  response_due_date: string | null;
  summary: string | null;
  created_at: string;
}

export interface ConstructionProjectSummary {
  project: Project;
  constructionExt: ConstructionProject | null;
  natureContext: NatureContext | null;
  runoffProfile: RunoffProfile | null;
  risks: EnvironmentalRisk[];
  mitigations: MitigationMeasure[];
  submissions: AuthoritySubmission[];
  evidenceFiles: EvidenceFile[];
  auditEvents: AuditEvent[];
  readinessScore: number;
  runoffRiskScore: "low" | "medium" | "high" | "critical";
  natureSensitivityScore: "low" | "medium" | "high" | "critical";
}

// Composite type for Nature Project Monitor — the primary UI-facing type
export type NatureProjectSummary = {
  project: Project;
  indicators: Indicator[];
  activeDataSources: number;
  openActions: number;
  latestAuditEvent: AuditEvent | null;
  latestReport: Report | null;
};

// ─── Connector fetch logs ─────────────────────────────────────────────────────

export type ConnectorFetchLog = {
  id: string;
  connector_id: string;
  project_id: string | null;
  mode: string;
  status: string;
  latency_ms: number;
  error_message: string | null;
  source_type: string;
  geometry_used: boolean;
  fetched_at: string;
};

// ─── Project media (mirrors 006_project_media.sql) ────────────────────────────

export type ProjectMediaRow = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  category: string;
  source: string;
  file_path: string;
  url: string;
  thumbnail_url: string | null;
  uploaded_at: string;
  captured_at: string | null;
  lat: number | null;
  lng: number | null;
  altitude_m: number | null;
  accuracy_m: number | null;
  is_report_ready: boolean;
  tags: string[];
  status: string;
  file_size_bytes: number | null;
  mime_type: string | null;
}

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: Organization;
        Insert: Omit<Organization, "id" | "created_at">;
        Update: Partial<Omit<Organization, "id">>;
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: Omit<Project, "id" | "created_at">;
        Update: Partial<Omit<Project, "id">>;
        Relationships: [];
      };
      sites: {
        Row: Site;
        Insert: Omit<Site, "id" | "created_at">;
        Update: Partial<Omit<Site, "id">>;
        Relationships: [];
      };
      data_sources: {
        Row: DataSource;
        Insert: Omit<DataSource, "id" | "created_at">;
        Update: Partial<Omit<DataSource, "id">>;
        Relationships: [];
      };
      sensors: {
        Row: Sensor;
        Insert: Omit<Sensor, "id" | "created_at">;
        Update: Partial<Omit<Sensor, "id">>;
        Relationships: [];
      };
      observations: {
        Row: Observation;
        Insert: Omit<Observation, "id" | "created_at">;
        Update: Partial<Omit<Observation, "id">>;
        Relationships: [];
      };
      indicators: {
        Row: Indicator;
        Insert: Omit<Indicator, "id" | "updated_at">;
        Update: Partial<Omit<Indicator, "id">>;
        Relationships: [];
      };
      reports: {
        Row: Report;
        Insert: Omit<Report, "id" | "created_at">;
        Update: Partial<Omit<Report, "id">>;
        Relationships: [];
      };
      evidence_files: {
        Row: EvidenceFile;
        Insert: Omit<EvidenceFile, "id" | "created_at">;
        Update: Partial<Omit<EvidenceFile, "id">>;
        Relationships: [];
      };
      audit_events: {
        Row: AuditEvent;
        Insert: Omit<AuditEvent, "id" | "created_at">;
        Update: Partial<Omit<AuditEvent, "id">>;
        Relationships: [];
      };
      actions: {
        Row: Action;
        Insert: Omit<Action, "id" | "created_at">;
        Update: Partial<Omit<Action, "id">>;
        Relationships: [];
      };
      impact_units: {
        Row: ImpactUnit;
        Insert: Omit<ImpactUnit, "id" | "created_at">;
        Update: Partial<Omit<ImpactUnit, "id">>;
        Relationships: [];
      };
      construction_projects: {
        Row: ConstructionProject;
        Insert: Omit<ConstructionProject, "id" | "created_at">;
        Update: Partial<Omit<ConstructionProject, "id">>;
        Relationships: [];
      };
      nature_contexts: {
        Row: NatureContext;
        Insert: Omit<NatureContext, "id" | "created_at">;
        Update: Partial<Omit<NatureContext, "id">>;
        Relationships: [];
      };
      runoff_profiles: {
        Row: RunoffProfile;
        Insert: Omit<RunoffProfile, "id" | "created_at">;
        Update: Partial<Omit<RunoffProfile, "id">>;
        Relationships: [];
      };
      environmental_risks: {
        Row: EnvironmentalRisk;
        Insert: Omit<EnvironmentalRisk, "id" | "created_at">;
        Update: Partial<Omit<EnvironmentalRisk, "id">>;
        Relationships: [];
      };
      mitigation_measures: {
        Row: MitigationMeasure;
        Insert: Omit<MitigationMeasure, "id" | "created_at">;
        Update: Partial<Omit<MitigationMeasure, "id">>;
        Relationships: [];
      };
      authority_submissions: {
        Row: AuthoritySubmission;
        Insert: Omit<AuthoritySubmission, "id" | "created_at">;
        Update: Partial<Omit<AuthoritySubmission, "id">>;
        Relationships: [];
      };
      connector_fetch_logs: {
        Row: ConnectorFetchLog;
        Insert: Omit<ConnectorFetchLog, "id">;
        Update: Partial<Omit<ConnectorFetchLog, "id">>;
        Relationships: [];
      };
      project_media: {
        Row: ProjectMediaRow;
        Insert: Omit<ProjectMediaRow, "id" | "uploaded_at">;
        Update: Partial<Omit<ProjectMediaRow, "id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
