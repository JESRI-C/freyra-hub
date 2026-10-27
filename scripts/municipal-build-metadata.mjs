export const MUNICIPAL_BUILD_METADATA_FILE = "freyra-build.json";

/** Read the value Vite will substitute, including an explicit define override. */
export function municipalBuildMetadata(config) {
  const revision = process.env.FREYRA_BUILD_REVISION;
  return {
    schema: "freyra.build/v1",
    viteMode: config.mode,
    municipalDemo: false,
    customerDataOnly: true,
    municipalWorkflow: true,
    release: "1.0",
    ...(/^[a-f0-9]{40}$/.test(revision ?? "") ? { sourceRevision: revision } : {}),
  };
}

/** No environment values other than the public, boolean presentation mode are emitted. */
export function municipalBuildMetadataPlugin() {
  let metadata;
  return {
    name: "freyra-municipal-build-metadata",
    apply: "build",
    configResolved(config) {
      metadata = municipalBuildMetadata(config);
    },
    generateBundle() {
      if (this.environment.name !== "client") return;
      if (!metadata) throw new Error("Freyra-buildets præsentationstilstand er ikke afklaret.");
      this.emitFile({
        type: "asset",
        fileName: MUNICIPAL_BUILD_METADATA_FILE,
        source: JSON.stringify(metadata) + "\n",
      });
    },
  };
}

/** Optional delivery guard; legacy staging builds retain their existing behavior. */
export function municipalDemoProblems(env, metadata) {
  const problems = [];
  if (env.VITE_DEMO_MODE === "true" || env.VITE_APP_DATA_MODE === "demo")
    problems.push("Eksempeldata er ikke tilladt i release 1.0");
  if (
    metadata !== undefined &&
    (metadata?.schema !== "freyra.build/v1" ||
      metadata.viteMode !== "staging" ||
      metadata.customerDataOnly !== true ||
      metadata.municipalDemo !== false ||
      metadata.release !== "1.0")
  )
    problems.push("Bygningen er ikke verificeret som release 1.0 med kundedata");
  return problems;
}
