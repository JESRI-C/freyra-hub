/** Source configuration and empty legacy collections. No customer sample records. */
export type DeviceStatus = "online" | "partial" | "attention" | "offline" | "setup";
export type Severity = "critical" | "medium" | "low";
export const PROJECTS: string[] = [];
export const ZONES: string[] = [];
export const SOURCE_TYPES: string[] = [];
export const MEASUREMENTS: string[] = [];
export const DEVICES: {
  id: string;
  name: string;
  type: string;
  project: string;
  zone: string;
  status: DeviceStatus;
  battery: number;
  signal: number;
  lastContact: string;
  firmware: string;
  lastReading: string;
  quality: number;
  conn: string;
}[] = [];
export const DATA_SOURCES: {
  id: string;
  name: string;
  type: string;
  project: string;
  category: string;
  metrics: string[];
  lastSync: string;
  freq: string;
  quality: number;
  verified: boolean;
  usedBy: string[];
  status: DeviceStatus;
  owner: string;
}[] = [];
export const INTEGRATIONS: {
  id: string;
  desc: string;
  types: string[];
  complexity: string;
  status: string;
}[] = [];
export const ALERTS: {
  id: string;
  title: string;
  severity: Severity;
  project: string;
  source: string;
  type: string;
  first: string;
  last: string;
  status: string;
  owner: string;
  action: string;
}[] = [];
export const LIVE_OBSERVATIONS: {
  ts: string;
  source: string;
  project: string;
  zone: string;
  measurement: string;
  value: string;
  unit: string;
  status: string;
  quality: number;
  routedTo: string[];
}[] = [];
export const QUALITY_DIMENSIONS: {
  name: string;
  score: number;
  trend: number;
  why: string;
  action: string;
}[] = [];
export const VALIDATION_RULES: string[] = [];
export const ZONES_DETAIL: {
  name: string;
  area: string;
  sources: number;
  quality: number;
  lastObs: string;
  biodiv: string;
  risk: string;
}[] = [];
