export const MUNICIPAL_BUILD_METADATA_FILE = "freyra-build.json";

/** Read the value Vite will substitute, including an explicit define override. */
export function municipalBuildMetadata(config) {
  const key = "import.meta.env.VITE_DEMO_MODE";
  const municipalDemo = Object.hasOwn(config.define ?? {}, key)
    ? config.define[key] === JSON.stringify("true")
    : config.env?.VITE_DEMO_MODE === "true";
  return { schema: "freyra.build/v1", viteMode: config.mode, municipalDemo };
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
  if (env.VITE_DEMO_MODE !== "true")
    problems.push("VITE_DEMO_MODE skal være true til kommunens leverance");
  if (metadata !== undefined) {
    if (
      metadata?.schema !== "freyra.build/v1" ||
      metadata.viteMode !== "staging" ||
      metadata.municipalDemo !== true
    )
      problems.push("Det byggede klientartefakt dokumenterer ikke kommunetilstand i staging");
  }
  return problems;
}
