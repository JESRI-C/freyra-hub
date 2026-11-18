import type { Plugin } from "vite";
export const MUNICIPAL_BUILD_METADATA_FILE: string;
export type MunicipalBuildMetadata = {
  schema: "freyra.build/v1";
  viteMode: string;
  municipalDemo: boolean;
};
export function municipalBuildMetadata(config: {
  mode: string;
  define?: Record<string, unknown>;
  env?: Record<string, unknown>;
}): MunicipalBuildMetadata;
export function municipalBuildMetadataPlugin(): Plugin;
export function municipalDemoProblems(env: Record<string, unknown>, metadata?: unknown): string[];
