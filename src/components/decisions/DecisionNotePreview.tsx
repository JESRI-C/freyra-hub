export function DecisionNotePreview({
  project,
  audience,
  focus,
  tone,
  period,
}: {
  project: string;
  audience: string;
  focus: string;
  tone: string;
  period: string;
}) {
  return (
    <div className="prose prose-sm max-w-none">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        Beslutningsnotat — udkast
      </div>
      <h3 className="mt-1 text-lg font-semibold">
        {project} · {period}
      </h3>
      <div className="text-xs text-muted-foreground mt-1">
        Målgruppe: {audience} · Fokus: {focus} · Tone: {tone}
      </div>

      <h4 className="mt-5">Sammenfatning</h4>
      <p>
        {project} har i {period.toLowerCase()} udvist en stabil udvikling med målbar fremgang i
        biodiversitet og en moderat reduktion i CO₂e. Der er identificeret tre risici, hvoraf én
        vurderes som høj. Datagrundlaget er overordnet solidt (konfidens 0,82), men felt-dækningen i
        område B og forældede emissionsfaktorer udgør en dokumentationsrisiko.
      </p>

      <h4>Centrale fund</h4>
      <ul>
        <li>Biodiversitetsindeks i kerneområde A er steget til 0,74 (+0,11 vs. baseline).</li>
        <li>CO₂e er reduceret med 4,2% efter optimering af bygning A.</li>
        <li>Vandkvaliteten i zone 3 har overskredet kontrolgrænse i 9 ud af 14 dage.</li>
      </ul>

      <h4>Risici</h4>
      <ul>
        <li>Vandkvalitet i zone 3 — Høj.</li>
        <li>Datakvalitet (felt-dækning) — Medium.</li>
        <li>Forældede emissionsfaktorer — Medium.</li>
      </ul>

      <h4>Anbefalinger</h4>
      <ol>
        <li>Genkalibrér sensor WQ-12 og udfør manuel kontrolprøve inden 14 dage.</li>
        <li>Opdatér emissionsfaktor-bibliotek til DEFRA 2026 før Q2-rapport.</li>
        <li>Udrul felt-app til 6 medarbejdere for at lukke datadæknings-gap.</li>
      </ol>

      <h4>Påkrævede handlinger</h4>
      <p>
        Ovenstående anbefalinger kan tildeles via DecisionsIQ → Anbefalinger og dokumenteres i ESG
        Ledger.
      </p>

      <h4>Datakonfidens</h4>
      <p>
        Analysen er baseret på 14 datasæt fra sensorer, satellit og felt. Samlet konfidens:{" "}
        <strong>0,82</strong>.
      </p>

      <h4>Næste skridt</h4>
      <p>
        Beslutningsnotatet anbefales godkendt af projektejer og delt med {audience.toLowerCase()}{" "}
        senest fredag. Opfølgning planlægges i næste styregruppemøde.
      </p>
    </div>
  );
}
