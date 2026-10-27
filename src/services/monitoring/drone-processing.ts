/** Provider-independent contract. No external provider is activated by importing this module. */
export type ProcessingStatus = "blocked" | "queued" | "running" | "failed" | "completed";
export interface ProcessingJob {
  id: string;
  projectId: string;
  flightId: string;
  inputVersion: string;
  status: ProcessingStatus;
  progress: number;
  error: string | null;
  outputs: ProcessingOutput[];
  providerJobId?: string;
}
export interface ProcessingOutput {
  path: string;
  sha256: string;
  inputVersion: string;
  kind: "orthophoto" | "dsm" | "point_cloud";
  crs: string;
}
export interface PhotogrammetryAdapter {
  submit(job: Readonly<ProcessingJob>): Promise<{ providerJobId: string }>;
  poll(providerJobId: string): Promise<{
    status: "queued" | "running" | "failed" | "completed";
    progress: number;
    error?: string;
    outputs?: ProcessingOutput[];
  }>;
}
export const PROVIDER_BLOCKER =
  "Ingen autoriseret fotogrammetri-worker er konfigureret. Originaler er gemt; ortofoto og målegrundlag er ikke beregnet.";
export async function startProcessing(
  job: ProcessingJob,
  provider?: PhotogrammetryAdapter,
): Promise<ProcessingJob & { providerJobId?: string }> {
  if (
    job.status === "completed" ||
    job.status === "running" ||
    (job.status === "queued" && !!job.providerJobId)
  )
    return job;
  if (!provider)
    return { ...job, status: "blocked", progress: 0, error: PROVIDER_BLOCKER, outputs: [] };
  try {
    const { providerJobId } = await provider.submit(job);
    return { ...job, status: "queued", progress: 0, error: null, providerJobId };
  } catch (error) {
    return {
      ...job,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
export async function pollProcessing(
  job: ProcessingJob,
  providerJobId: string,
  provider: PhotogrammetryAdapter,
): Promise<ProcessingJob> {
  if (job.status === "completed") return job;
  try {
    const result = await provider.poll(providerJobId);
    if (!Number.isFinite(result.progress) || result.progress < 0 || result.progress > 100)
      throw new Error("Worker returnerede ugyldig progression.");
    if (
      result.status === "completed" &&
      (!result.outputs?.length ||
        result.outputs.some(
          (o) =>
            o.inputVersion !== job.inputVersion ||
            !/^[a-f0-9]{64}$/.test(o.sha256) ||
            !o.crs ||
            !o.path,
        ))
    )
      throw new Error("Worker mangler versionsbundet output, CRS eller gyldig checksum.");
    return {
      ...job,
      status: result.status,
      progress: result.status === "completed" ? 100 : result.progress,
      error: result.error ?? null,
      outputs: result.status === "completed" ? result.outputs! : [],
    };
  } catch (error) {
    return {
      ...job,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      outputs: [],
    };
  }
}
