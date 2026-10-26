export const MAX_DRONE_BEFORE_BATCH_FILES = 200;
export const DRONE_BEFORE_CONCURRENCY = 2;

export interface BatchFileIdentity {
  name: string;
  size: number;
  lastModified: number;
  type: string;
}

export function batchFileKey(file: BatchFileIdentity): string {
  return [file.name, file.size, file.lastModified, file.type].join(":");
}

export function nextBatchSequence(existingSequences: readonly number[]): number {
  return existingSequences.reduce((maximum, value) => Math.max(maximum, value), 0) + 1;
}

export function selectUniqueBatchFiles<T extends BatchFileIdentity>(params: {
  existing: readonly T[];
  incoming: readonly T[];
  limit?: number;
}): { accepted: T[]; duplicateCount: number; capacityRejectedCount: number } {
  const limit = params.limit ?? MAX_DRONE_BEFORE_BATCH_FILES;
  const known = new Set(params.existing.map(batchFileKey));
  const accepted: T[] = [];
  let duplicateCount = 0;
  let capacityRejectedCount = 0;

  for (const file of params.incoming) {
    const key = batchFileKey(file);
    if (known.has(key)) {
      duplicateCount += 1;
      continue;
    }
    if (params.existing.length + accepted.length >= limit) {
      capacityRejectedCount += 1;
      continue;
    }
    known.add(key);
    accepted.push(file);
  }

  return { accepted, duplicateCount, capacityRejectedCount };
}

export async function runWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Concurrency skal være et positivt heltal.");
  }

  let nextIndex = 0;
  const work = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) await worker(value, index);
    }
  };

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => work()));
}
