import { cloneElement, useId, type ReactElement } from "react";

/** Keep select option text out of the label's accessible name. */
export function CustomerField({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className="min-w-0 text-sm font-medium">
      <label className="block" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}
