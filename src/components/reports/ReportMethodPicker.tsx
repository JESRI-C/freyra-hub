import { useState } from "react";
import {
  methodCitation,
  methodReferenceText,
  OPEN_HABITAT_METHODS,
  WATERCOURSE_METHODS,
} from "@/lib/report-methods";

export function ReportMethodPicker({
  natureBaseline,
  text,
  onInsert,
  disabled,
}: {
  natureBaseline: boolean;
  text: string;
  onInsert: (reference: string) => void;
  disabled: boolean;
}) {
  const [editionUrl, setEditionUrl] = useState("");
  const methods = natureBaseline ? OPEN_HABITAT_METHODS : WATERCOURSE_METHODS;
  const method = methods.find((entry) => entry.url === editionUrl);
  const inserted = method && text.includes(methodCitation(method));
  return (
    <fieldset className="space-y-2 rounded-lg border p-3 text-sm" disabled={disabled}>
      <legend className="px-1 font-medium">
        {natureBaseline
          ? "Metodebibliotek for lysåben habitatnatur"
          : "Metodebibliotek for vandløb"}
      </legend>
      <label className="block">
        Teknisk anvisning fra Aarhus Universitet
        <select
          className="mt-1 w-full rounded-lg border bg-background px-3 py-2"
          value={editionUrl}
          onChange={(event) => setEditionUrl(event.target.value)}
        >
          <option value="">Vælg en anvisning</option>
          {methods.map((entry) => (
            <option key={entry.url} value={entry.url}>
              {entry.code} · {entry.title} · version {entry.version}
            </option>
          ))}
        </select>
      </label>
      {method && (
        <>
          <dl className="space-y-1">
            {method.scope && (
              <>
                <dt className="font-medium">Anvendelsesområde</dt>
                <dd>{method.scope}</dd>
              </>
            )}
            <dt className="font-medium">Datakrav</dt>
            <dd>{method.requirements}</dd>
            <dt className="font-medium">Begrænsning</dt>
            <dd>{method.limitations}</dd>
          </dl>
          <a
            className="block text-primary underline"
            href={method.url}
            target="_blank"
            rel="noreferrer"
          >
            Læs TA {method.code}, version {method.version} (PDF)
          </a>
          <button
            type="button"
            className="rounded-lg border bg-card px-3 py-2 disabled:opacity-50"
            disabled={inserted}
            onClick={() => onInsert(methodReferenceText(method))}
          >
            {inserted ? "Reference indsat i afsnittet" : "Indsæt reference i metodeafsnittet"}
          </button>
          <p className="text-xs text-muted-foreground">
            Beskriv udførelsen og henvis til eventuelle feltdata i afsnittet nedenfor.
          </p>
        </>
      )}
    </fieldset>
  );
}
