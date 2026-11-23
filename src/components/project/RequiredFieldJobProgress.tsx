import {
  missingRequiredFieldJobFields,
  type FieldJobTemplateDefinition,
  type FieldJobValues,
} from "@/lib/field-job-cards";

export function RequiredFieldJobProgress({
  definition,
  values,
  inputPrefix,
  disabled,
}: {
  definition: FieldJobTemplateDefinition;
  values: FieldJobValues;
  inputPrefix: string;
  disabled: boolean;
}) {
  const requiredCount = definition.fields.filter((field) => field.required).length;
  let missing;
  try {
    missing = missingRequiredFieldJobFields(definition, values);
  } catch {
    return <p role="alert">Svarene skal passe til den valgte skabelon.</p>;
  }
  return requiredCount > 0 ? (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <p className="font-medium">
        Nødvendige felter udfyldt: {requiredCount - missing.length} af {requiredCount}
      </p>
      {missing.length > 0 && (
        <>
          <p>Du kan gemme en kladde og fortsætte senere.</p>
          <ul className="mt-1">
            {missing.map((field) => (
              <li key={field.key}>
                <button
                  type="button"
                  disabled={disabled}
                  className="min-h-11 text-left underline underline-offset-2 disabled:no-underline"
                  onClick={() => document.getElementById(inputPrefix + field.key)?.focus()}
                >
                  Udfyld {field.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  ) : null;
}
