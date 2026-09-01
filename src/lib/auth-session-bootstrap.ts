export type DeferredLatestTask<T> = {
  schedule: (value: T) => void;
  cancel: () => void;
};

type DeferredLatestTaskOptions<T> = {
  run: (value: T, isCurrent: () => boolean) => Promise<void> | void;
  onPendingChange: (pending: boolean) => void;
  onError?: (error: unknown) => void;
};

export function shouldBootstrapAuthSession(
  activeUserId: string | null | undefined,
  nextUserId: string | null,
): boolean {
  return activeUserId === undefined || activeUserId !== nextUserId;
}

/**
 * Defers auth bootstrap work until after the synchronous auth callback has
 * returned. Only the latest scheduled auth state may settle the pending flag.
 */
export function createDeferredLatestTask<T>({
  run,
  onPendingChange,
  onError,
}: DeferredLatestTaskOptions<T>): DeferredLatestTask<T> {
  let cancelled = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule(value) {
      if (cancelled) return;

      const scheduledGeneration = ++generation;
      onPendingChange(true);

      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const isCurrent = () => !cancelled && scheduledGeneration === generation;
        if (!isCurrent()) return;

        void Promise.resolve()
          .then(() => run(value, isCurrent))
          .catch((error: unknown) => {
            if (!cancelled && scheduledGeneration === generation) onError?.(error);
          })
          .finally(() => {
            if (!cancelled && scheduledGeneration === generation) onPendingChange(false);
          });
      }, 0);
    },

    cancel() {
      cancelled = true;
      generation += 1;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
