import { useId, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";

/** Presentation only: never submits, persists, or resets a saved record. */
export function AdvancedSettings({
  children,
  description,
  onReset,
  disabled,
  open,
}: {
  children: ReactNode;
  description: string;
  onReset?: () => void;
  disabled?: boolean;
  open?: boolean;
}) {
  const id = useId();
  return (
    <details open={open} className="advanced-settings order-last rounded-lg border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-medium text-primary">
        <SlidersHorizontal className="size-4" aria-hidden="true" />
        Avancerede indstillinger
        <span
          className="ml-auto text-xs text-muted-foreground advanced-settings-toggle"
          aria-hidden="true"
        />
      </summary>
      <div className="space-y-4 border-t p-4" aria-describedby={id}>
        <p id={id} className="text-sm leading-6 text-muted-foreground">
          {description}
        </p>
        {children}
        {onReset && (
          <button
            type="button"
            disabled={disabled}
            onClick={onReset}
            className="rounded-lg border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            Nulstil til standard
          </button>
        )}
      </div>
    </details>
  );
}
