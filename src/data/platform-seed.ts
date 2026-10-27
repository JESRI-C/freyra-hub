/** Empty legacy read adapters. Product builds contain no sample projects, measurements or geometry. */
import type {
  Organization,
  Project,
  Site,
  DataSource,
  Sensor,
  Observation,
  Indicator,
  Report,
  EvidenceFile,
  AuditEvent,
  Action,
  ImpactUnit,
  ConstructionProject,
  NatureContext,
  RunoffProfile,
  EnvironmentalRisk,
  MitigationMeasure,
  AuthoritySubmission,
  ProjectGeometry,
} from "@/lib/supabase/types";
export const SEED_ORGANIZATIONS: Organization[] = [];
export const SEED_PROJECTS: Project[] = [];
export const SEED_SITES: Site[] = [];
export const SEED_DATA_SOURCES: DataSource[] = [];
export const SEED_INDICATORS: Indicator[] = [];
export const SEED_REPORTS: Report[] = [];
export const SEED_AUDIT_EVENTS: AuditEvent[] = [];
export const SEED_ACTIONS: Action[] = [];
export const SEED_SENSORS: Sensor[] = [];
export const SEED_OBSERVATIONS: Observation[] = [];
export const SEED_EVIDENCE_FILES: EvidenceFile[] = [];
export const SEED_CONSTRUCTION_PROJECTS: ConstructionProject[] = [];
export const SEED_NATURE_CONTEXTS: NatureContext[] = [];
export const SEED_RUNOFF_PROFILES: RunoffProfile[] = [];
export const SEED_ENVIRONMENTAL_RISKS: EnvironmentalRisk[] = [];
export const SEED_MITIGATION_MEASURES: MitigationMeasure[] = [];
export const SEED_AUTHORITY_SUBMISSIONS: AuthoritySubmission[] = [];
export const SEED_IMPACT_UNITS: ImpactUnit[] = [];
export const SEED_PROJECT_GEOMETRIES: Record<string, ProjectGeometry> = {};
