/** One explanation pattern for project tools, task parts and program pages. */
export function WorkspaceGuide({
  question,
  purpose,
  output,
}: {
  question: string;
  purpose: string;
  output: string;
}) {
  return (
    <section
      aria-label="Formål og resultat"
      className="min-w-0 space-y-2 rounded-xl border bg-primary/5 p-4 [overflow-wrap:anywhere]"
    >
      <p className="text-base font-semibold">{question}</p>
      <p className="text-sm leading-6 text-muted-foreground">{purpose}</p>
      <p className="text-sm leading-6">
        <span className="font-medium">Det får du: </span>
        {output}
      </p>
    </section>
  );
}
