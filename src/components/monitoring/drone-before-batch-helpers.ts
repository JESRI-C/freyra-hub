export const MAX_DRONE_BEFORE_BATCH_FILES = 200;
export const DRONE_BEFORE_CONCURRENCY = 2;

export function nextBatchSequence(existingSequences: readonly number[]): number {
  return existingSequences.reduce((maximum, value) => Math.max(maximum, value), 0) + 1;
}

export function selectUniqueBatchFiles<T extends object>(params: {
  existing: readonly T[];
  incoming: readonly T[];
}): { accepted: T[]; duplicateCount: number } {
  // Two memory cards can have identical names, sizes and timestamps. Byte-level
  // deduplication belongs to promotion, where both upload origins are retained.
  const known = new Set(params.existing);
  const accepted: T[] = [];
  let duplicateCount = 0;

  for (const file of params.incoming) {
    if (known.has(file)) {
      duplicateCount += 1;
      continue;
    }
    known.add(file);
    accepted.push(file);
  }

  return { accepted, duplicateCount };
}

export function droneBatchPosition(selectionSequence: number) {
  return {
    series: Math.floor((selectionSequence - 1) / MAX_DRONE_BEFORE_BATCH_FILES) + 1,
    sequence: ((selectionSequence - 1) % MAX_DRONE_BEFORE_BATCH_FILES) + 1,
  };
}

export function groupDroneBatchItems<T extends { batchSequence: number }>(items: readonly T[]) {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const { series } = droneBatchPosition(item.batchSequence);
    const group = groups.get(series);
    if (group) group.push(item);
    else groups.set(series, [item]);
  }
  return groups;
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
