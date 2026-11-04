import {
  PROJECT_AREAS,
  projectViewSearch,
  type ProjectView,
  type ProjectNavigationSearch,
} from "./project-navigation";
import {
  WORK_ORDER_PARTS,
  type WorkOrderListView,
  type WorkOrderView,
} from "./work-order-navigation";

/** Presentation inventory. A visible page is not a readiness, access or effect assessment. */
export const PROGRAM_AREAS = [
  ...PROJECT_AREAS.map(({ id, label }) => ({ id, label })),
  { id: "professional", label: "Faglige værktøjer" },
  { id: "funding", label: "Finansiering og formidling" },
  { id: "administration", label: "Opsætning og drift" },
];
export type ProgramDestination =
  | { kind: "route"; path: string; selectAt?: string }
  | { kind: "project"; view: ProjectView; work?: WorkOrderView; taskList?: WorkOrderListView };
export type ProgramFeature = {
  id: string;
  areaId: string;
  title: string;
  question: string;
  purpose: string;
  output: string;
  status: "existing" | "partial" | "unlinked" | "planned";
  destination?: ProgramDestination;
};
type RouteRow = [path: string, title: string, purpose: string, output: string, selectAt?: string];
function pages(areaId: string, question: string, rows: RouteRow[]): ProgramFeature[] {
  return rows.map(([path, title, purpose, output, selectAt]) => ({
    id: path,
    title,
    areaId,
    question,
    purpose,
    output,
    status: "existing",
    destination: { kind: "route", path, ...(selectAt ? { selectAt } : {}) },
  }));
}
export const PROGRAM_PAGES: ProgramFeature[] = [
  ...pages("overview", "Hvilket projekt arbejder du videre med?", [
    [
      "/app/overview",
      "Dashboard",
      "Få overblik over projekter, opgaver og de oplysninger, der mangler.",
      "Et sted at vælge den næste arbejdsopgave.",
    ],
    [
      "/app/projects",
      "Naturprojekter",
      "Find eller opret naturprojektet, som arbejdet og dokumentationen skal samles på.",
      "Et fælles projekt for plan, feltarbejde og rapport.",
    ],
    [
      "/app/projects/$slug",
      "Projektets forløb",
      "Åbn et konkret projekts problem, mål og arbejdsområder.",
      "Sammenhæng fra projektets formål til dokumentation.",
      "/app/projects",
    ],
  ]),
  ...pages("tasks", "Hvem skal gøre hvad på opgaven?", [
    [
      "/app/work-orders",
      "Arbejdsordrer",
      "Find og følg arbejdsordrer på tværs af de projekter, du leder i den valgte organisation.",
      "En fælles liste eller tavle med status, plan og tildeling samt adgang til den samme arbejdsordre.",
    ],
    [
      "/opgaver",
      "Mine opgaver",
      "Åbn en tildelt opgave, læs instruktionen, og fortsæt med fotos, jobkort, udførelse og aflevering efter din adgang.",
      "Status og dokumentation samlet på den samme opgave.",
    ],
  ]),
  ...pages("foundation", "Hvilke oplysninger kender vi om området?", [
    [
      "/app/connect/map",
      "Kort og zoner",
      "Undersøg projektets geografi og tilgængelige kortlag.",
      "Et geografisk overblik med synlige kilder.",
    ],
    [
      "/app/projects/geometry/$slug",
      "Projektområde",
      "Tegn og kontroller projektets afgrænsning.",
      "En gemt projektgeometri.",
      "/app/projects",
    ],
    [
      "/app/projects/map/$slug",
      "Projektets geodatakort",
      "Se et valgt projekts område og geodata.",
      "Et kort knyttet til det konkrete projekt.",
      "/app/projects",
    ],
    [
      "/app/sources",
      "Kilder",
      "Læs kildebeskrivelser og deres anvendelsesgrundlag.",
      "Synlige kilder og begrænsninger.",
    ],
    [
      "/app/data",
      "Projektets datakilder",
      "Arbejd med datakilderne på det valgte projekt.",
      "Kilder samlet på samme projekt.",
    ],
    [
      "/app/connect/registry",
      "Data og metoder",
      "Undersøg de registrerede dataforbindelser, metoder og tilgængelighed.",
      "En oversigt over mulige kilder; faktisk kildestatus kontrolleres særskilt.",
    ],
    [
      "/app/connect/sources",
      "Overvågningens kilder",
      "Se de datakilder, der er tilknyttet projektet.",
      "Et synligt kildegrundlag for overvågningen.",
    ],
    [
      "/app/connect/add",
      "Tilføj datagrundlag",
      "Åbn projektets eksisterende kildearbejdsrum.",
      "En vej til at arbejde videre med datakilderne.",
    ],
    [
      "/app/connect/integrations",
      "Dataforbindelser",
      "Læs og vedligehold projektets kildeoplysninger.",
      "Et samlet overblik over kildehenvisninger.",
    ],
  ]),
  ...pages("field", "Hvad registrerer I på stedet?", [
    [
      "/felt",
      "Feltarbejde og offlinekø",
      "Gem registreringer og originalfotos, og følg deres synkronisering. Klargør projektet med net før offlinearbejde.",
      "Lokalt bevaret materiale og synlig serverkvittering.",
    ],
    [
      "/app/connect",
      "Overvågning og feltdata",
      "Saml feltdata, upload og overvågning for det valgte projekt.",
      "Et overblik over tilgængelige felt- og overvågningsdata.",
    ],
    [
      "/app/connect/upload",
      "Upload og droneoriginaler",
      "Tilføj filer og følg de eksisterende kontroller af originaler.",
      "Uploadstatus og kontrollerbare originalreferencer.",
    ],
    [
      "/app/connect/devices",
      "Sensorer og enheder",
      "Se og arbejd med projektets registrerede sensorer og enheder.",
      "Et overblik over tilknyttede enheder og deres oplysninger.",
    ],
    [
      "/app/connect/live",
      "Målinger og indikatorer",
      "Læs projektets mål- og indikatorvisning.",
      "Et overblik, der skal vurderes med sin kilde og dækning.",
    ],
    [
      "/app/connect/alerts",
      "Hændelser og alarmer",
      "Gennemgå de viste hændelser og deres grundlag.",
      "Et sted at følge op på registrerede hændelser.",
    ],
    [
      "/app/connect/quality",
      "Feltdataenes kvalitet",
      "Undersøg kvalitet og mangler i det tilgængelige datagrundlag.",
      "Synlige forbehold før videre brug.",
    ],
  ]),
  ...pages("assessment", "Hvad viser grundlaget, og hvad mangler at blive vurderet?", [
    [
      "/app/decisions",
      "Projektindsigt",
      "Saml projektets vurderinger, risici og næste handlinger.",
      "Et grundlag for at prioritere det videre arbejde.",
    ],
    [
      "/app/decisions/recommendations",
      "Anbefalinger",
      "Gennemgå forslag og den dokumentation, de bygger på.",
      "Forslag til videre arbejde; de kræver en faglig vurdering.",
    ],
    [
      "/app/decisions/risk",
      "Risiko og interessenter",
      "Gennemgå de registrerede risici og hensyn på projektet.",
      "Synlige forhold, der skal håndteres i planlægningen.",
    ],
    [
      "/app/decisions/scenarios",
      "Scenarier",
      "Beskriv og sammenhold mulige indsatser på projektet.",
      "Gemte scenarier som grundlag for valg.",
    ],
    [
      "/app/decisions/data-quality",
      "Metode og datakvalitet",
      "Gennemgå kilder, metode og datamangler før konklusioner.",
      "Et synligt grundlag og dets usikkerheder.",
    ],
    [
      "/app/decisions/notes",
      "Beslutningsnotater",
      "Fasthold begrundelsen for projektets beslutninger.",
      "Notater, der kan genfindes på projektet.",
    ],
    [
      "/app/decisions/assistant",
      "AI-assistent",
      "Bed den eksisterende assistent om forslag med udgangspunkt i projektet.",
      "Forslag til faglig kontrol; en besvarelse er ikke en godkendelse.",
    ],
    [
      "/app/ledger/metrics",
      "Indikatorer",
      "Læs projektets registrerede indikatorer og tilhørende kildeoplysninger.",
      "Tal, der kan vurderes med deres grundlag.",
    ],
    [
      "/app/ledger/co2",
      "CO₂-oplysninger",
      "Arbejd med projektets registrerede klimaoplysninger.",
      "Gemte oplysninger, der skal vurderes med metode og datagrundlag.",
    ],
    [
      "/app/ledger/csrd",
      "CSRD og ESRS",
      "Registrér og gennemgå projektets oplysninger i det eksisterende skema.",
      "Strukturerede oplysninger; ingen automatisk erklæring om overholdelse.",
    ],
  ]),
  ...pages("delivery", "Hvilket materiale kan vi dokumentere og aflevere?", [
    [
      "/app/reports",
      "Rapporter",
      "Find rapportarbejdet og de gemte rapporter.",
      "En indgang til rapportforløbet.",
    ],
    [
      "/app/reports/new",
      "Ny rapport",
      "Åbn den eksisterende rapportopsætning.",
      "Et rapportudkast for det valgte grundlag.",
    ],
    [
      "/app/reports/builder",
      "Rapportindhold",
      "Arbejd videre med rapportens indhold og valg.",
      "En samlet rapportopsætning.",
    ],
    [
      "/app/reports/preview",
      "Rapportvisning",
      "Gennemse rapporten, før den anvendes til aflevering.",
      "Et læsbart rapportudkast med dets kilder.",
    ],
    [
      "/app/reports/readiness",
      "Rapportens mangler",
      "Gennemgå de viste mangler i rapportgrundlaget.",
      "En konkret kontrol før aflevering.",
    ],
    [
      "/app/reports/approval",
      "Rapportgennemgang",
      "Åbn den eksisterende rapportgennemgang. Dette er adskilt fra den kommende godkendelse af arbejdsopgavens aflevering.",
      "Et sted at gennemgå rapportmaterialet.",
    ],
    [
      "/app/reports/templates",
      "Rapportskabeloner",
      "Læs og vælg blandt de eksisterende rapportskabeloner.",
      "En struktur til rapportarbejdet.",
    ],
    [
      "/app/reports/library",
      "Rapportarkiv",
      "Find tidligere rapporter og deres gemte versioner.",
      "Genåbning af eksisterende rapportmateriale.",
    ],
    [
      "/app/ledger",
      "Dokumentation og audit",
      "Saml projektets dokumentation og sporbarhed.",
      "Et overblik over materiale og registreret historik.",
    ],
    [
      "/app/ledger/audit",
      "Auditspor",
      "Læs registrerede hændelser for det valgte projekt.",
      "Et spor over registrerede ændringer.",
    ],
    [
      "/app/ledger/documents",
      "Dokumenter og bilag",
      "Find og vedligehold projektets bilag.",
      "Dokumenter samlet på samme projekt.",
    ],
    [
      "/app/ledger/sources",
      "Dokumentationens kilder",
      "Gennemgå de kilder, der underbygger projektets oplysninger.",
      "Genfindelige kildehenvisninger.",
    ],
    [
      "/app/ledger/reporting",
      "Projektets rapportering",
      "Åbn rapportoplysningerne i projektets dokumentationsarbejdsrum.",
      "Rapporter knyttet til projektet.",
    ],
  ]),
  ...pages("professional", "Hvilken faglig metode passer til projektet?", [
    [
      "/app/construction",
      "Byggeri og natur",
      "Find byggeprojekter og deres natur- og miljøgrundlag.",
      "Et fagligt arbejdsrum for byggeprojektet.",
    ],
    [
      "/app/construction/projects/$slug",
      "Byggeprojektets værktøjer",
      "Arbejd med det valgte byggeprojekts eksisterende faner og beregninger.",
      "Projektets faglige oplysninger og dokumentation.",
      "/app/construction",
    ],
    [
      "/app/lavbund",
      "Lavbund og beplantning",
      "Find lavbundsprojekter og deres faglige værktøjer.",
      "Et arbejdsrum med projektets egne beregningsforudsætninger.",
    ],
    [
      "/app/lavbund/$projektId",
      "Lavbundsprojektets forløb",
      "Vælg det konkrete lavbundsprojekt, før du arbejder med dets grundlag.",
      "Sammenhæng mellem område, beregninger og dokumentation.",
      "/app/lavbund",
    ],
    [
      "/app/lavbund/$projektId/kort",
      "Feltkort og beplantning",
      "Arbejd med projektets kort og beplantningsgrundlag.",
      "Et geografisk og fagligt grundlag.",
      "/app/lavbund",
    ],
    [
      "/app/lavbund/$projektId/klima",
      "Lavbundens klima",
      "Undersøg klimaoplysninger med den anvendte metode og dækning.",
      "Et beregningsgrundlag til faglig vurdering.",
      "/app/lavbund",
    ],
    [
      "/app/lavbund/$projektId/fosfor",
      "Fosfor og brinkerosion",
      "Arbejd med projektets fosfor- og erosionsgrundlag.",
      "Metodebundne oplysninger og deres begrænsninger.",
      "/app/lavbund",
    ],
    [
      "/app/lavbund/$projektId/rapport",
      "Lavbundsrapport",
      "Saml det valgte lavbundsprojekts materiale i den eksisterende rapportvej.",
      "En rapport med projektets forudsætninger.",
      "/app/lavbund",
    ],
    [
      "/app/lavbund/$projektId/revisionsspor",
      "Lavbundens revisionsspor",
      "Læs det valgte lavbundsprojekts registrerede historik.",
      "Genfindelige ændringer og versioner.",
      "/app/lavbund",
    ],
  ]),
  ...pages("funding", "Hvordan beskrives projektets finansiering og mulige virkning?", [
    [
      "/app/impact",
      "Finansiering og effekt",
      "Saml projektets finansieringsoplysninger og beskrevne potentiale.",
      "Et overblik over grundlag og muligheder.",
    ],
    [
      "/app/impact/projects",
      "Finansieringsprojekter",
      "Find de projekter, der indgår i finansieringsarbejdet.",
      "En samlet projektliste.",
    ],
    [
      "/app/impact/project",
      "Finansieringsprofil",
      "Gennemgå det valgte projekts profil og dokumentation.",
      "En profil med synligt projektgrundlag.",
    ],
    [
      "/app/impact/portfolio",
      "Portefølje",
      "Sammenhold de projekter, der er tilgængelige i arbejdsrummet.",
      "Et porteføljeoverblik.",
    ],
    [
      "/app/impact/credits",
      "Finansiering og midler",
      "Registrér og gennemgå finansieringsoplysninger.",
      "Gemte oplysninger om muligheder og midler; ingen automatisk handel.",
    ],
    [
      "/app/impact/verification",
      "Verifikationsgrundlag",
      "Gennemgå dokumentationen bag projektets oplysninger.",
      "Et grundlag for videre kontrol, ikke en certificering.",
    ],
    [
      "/app/impact/organizations",
      "Partnere og fonde",
      "Arbejd med projektets partner- og fondsoplysninger.",
      "Genfindelige oplysninger om relevante aktører.",
    ],
    [
      "/app/impact/reports",
      "Finansieringsrapporter",
      "Find rapportmaterialet i finansieringsarbejdsrummet.",
      "Projektets eksisterende rapportoplysninger.",
    ],
    [
      "/app/public-impact",
      "Offentlig formidling",
      "Forbered projektets beskrivelse og materiale til formidling.",
      "Gemte oplysninger; offentliggørelse kræver en særskilt handling.",
    ],
  ]),
  ...pages("administration", "Hvordan er arbejdspladsen sat op?", [
    [
      "/app/settings",
      "Indstillinger",
      "Gennemgå arbejdspladsens eksisterende opsætning.",
      "Et fælles sted for indstillinger.",
    ],
    [
      "/app/settings/users",
      "Brugere og roller",
      "Gennemgå organisationens brugere og rolleoplysninger.",
      "Et overblik over adgang og ansvar.",
    ],
    [
      "/app/settings/access",
      "Adgangsopsætning",
      "Læs og arbejd med den eksisterende adgangsvisning.",
      "Synlig adgangsopsætning.",
    ],
    [
      "/app/settings/billing",
      "Abonnementsoplysninger",
      "Gennemgå de eksisterende kontooplysninger om abonnement.",
      "Et kontooverblik; visningen er ikke en betalingskvittering.",
    ],
    [
      "/app/settings/frameworks",
      "Rammer og standarder",
      "Læs og vedligehold oplysningerne i det eksisterende rammeskema.",
      "Strukturerede oplysninger til videre kontrol.",
    ],
    [
      "/app/settings/modules",
      "Moduloversigt",
      "Find eksisterende fagmoduler og deres viste datastatus.",
      "En indgang til det valgte projekts værktøjer.",
    ],
    [
      "/app/settings/notifications",
      "Beskedindstillinger",
      "Læs projektets registrerede alarmregler.",
      "Et overblik over reglerne; visningen bekræfter ikke afsendelse.",
    ],
    [
      "/app/settings/projects",
      "Projektopsætning",
      "Find projekter gennem den eksisterende administrationsvisning.",
      "Et projektadministrativt overblik.",
    ],
    [
      "/app/settings/security",
      "Sikkerhedsindstillinger",
      "Gennemgå de eksisterende sikkerhedsoplysninger.",
      "Et overblik til den ansvarlige administrator.",
    ],
    [
      "/app/system-test",
      "Systemtest",
      "Læs de tilgængelige systemkontroller og deres resultater.",
      "Synlig teknisk kontrolstatus.",
    ],
  ]),
];

const PROJECT_COPY: Record<string, [question: string, purpose: string, output: string]> = {
  "tab:overblik": [
    "Hvilket problem skal projektet løse?",
    "Beskriv målet, og vælg det næste trin i projektlederens forløb.",
    "Et fælles formål og en vej gennem projektet.",
  ],
  "tab:audit": [
    "Hvad er registreret i projektets historik?",
    "Læs ændringer og hændelser, før du følger op på en opgave.",
    "Et revisionsspor over registrerede handlinger.",
  ],
  "tab:roller": [
    "Hvem må arbejde på projektet?",
    "Gennemgå og vedligehold projektets medlemskab og roller.",
    "Et synligt ansvar og afgrænset adgang.",
  ],
  "tab:handlinger": [
    "Hvem skal gøre hvad, og hvordan dokumenteres det?",
    "Saml arbejdsgrundlag, feltregistrering, faktisk udførelse, dokumentation og afleveringsversioner på samme opgave.",
    "En opgave med sammenhængende, versionsbundet dokumentation.",
  ],
  "tab:grundlag": [
    "Hvad ved vi om stedet?",
    "Undersøg områdets tilgængelige offentlige kilder og mangler.",
    "Et grundlag for at vælge indsatsen.",
  ],
  "tab:livekort": [
    "Hvor ligger oplysningerne?",
    "Se projektets område og de tilgængelige kortlag.",
    "Et geografisk overblik med synlige kilder.",
  ],
  "tab:sites": [
    "Hvor følger vi udviklingen?",
    "Opret eller gennemgå de fotopunkter, hvor observationerne knyttes til stedet.",
    "Genfindelige steder til dokumentation og opfølgning.",
  ],
  "tab:datakilder": [
    "Hvilke kilder bruger projektet?",
    "Gennemgå kildernes status, seneste oplysninger og begrænsninger.",
    "Et synligt kildegrundlag.",
  ],
  "tab:miljodata": [
    "Hvilke miljøforhold skal vi kende?",
    "Læs de tilgængelige miljøoplysninger med deres kilder og dækning.",
    "Oplysninger til planlægning og faglig vurdering.",
  ],
  "step:baseline": [
    "Hvilket udgangspunkt sammenligner vi med?",
    "Læs de gemte versioner af projektets udgangspunkt.",
    "En genfindelig baseline med sit eget grundlag.",
  ],
  "tab:medier": [
    "Hvilke billeder har vi fra projektet?",
    "Find originaler, upload og fotoatlas. Tilknyt relevante fotos udtrykkeligt til en opgave under Dokumentation.",
    "Et genfindeligt billedgrundlag med originalreferencer.",
  ],
  "step:billeder": [
    "Hvilke originaler underbygger undersøgelsen?",
    "Arbejd med projektets drone- og billedgrundlag.",
    "Originalmateriale til videre gennemgang.",
  ],
  "step:datagrundlag": [
    "Hvilken undersøgelse skal materialet indgå i?",
    "Afgræns undersøgelsen, og saml det valgte grundlag i en runde.",
    "En konkret undersøgelsesrunde.",
  ],
  "tab:arbejde": [
    "Hvilke undersøgelser er oprettet?",
    "Find og arbejd videre med projektets undersøgelsesrunder.",
    "Undersøgelser med deres egne kilder og versioner.",
  ],
  "tab:dokumentation": [
    "Hvilke bilag underbygger projektet?",
    "Find dokumenter, evidensfiler og eksisterende dokumentationsoplysninger.",
    "Genfindelige bilag på samme projekt.",
  ],
  "step:gennemgang": [
    "Hvad viser det indsamlede materiale?",
    "Gennemgå materialet og de viste forslag med deres usikkerheder.",
    "Et grundlag for den faglige vurdering.",
  ],
  "step:sammenligning": [
    "Hvad har ændret sig før og efter?",
    "Sammenhold de valgte versioner og beskriv begrænsningerne.",
    "En sammenligning med et synligt kildegrundlag.",
  ],
  "tab:indikatorer": [
    "Hvad fortæller projektets indikatorer?",
    "Læs hver indikator med sin kilde, dato og datadækning.",
    "Tal og forbehold til faglig vurdering.",
  ],
  "step:beplantning": [
    "Er beplantning relevant for indsatsen?",
    "Arbejd med den valgfri beplantningsdel uden at ændre projektets øvrige grundlag.",
    "Et fagligt beplantningsgrundlag, når det er relevant.",
  ],
  "tab:rapporter": [
    "Hvilket materiale kan vi dokumentere og aflevere?",
    "Gennemgå projektets rapporter, kilder, mangler og opfølgning.",
    "Et rapportgrundlag til gennemgang og aflevering.",
  ],
};
export const PROJECT_FEATURES: ProgramFeature[] = PROJECT_AREAS.flatMap((area) =>
  area.destinations.map((d) => {
    const key = `${d.view.kind}:${d.view.id}`;
    const [question, purpose, output] = PROJECT_COPY[key];
    return {
      id: key,
      areaId: area.id,
      title: d.label,
      question,
      purpose,
      output,
      status: "existing",
      destination: { kind: "project", view: d.view },
    };
  }),
);
export const TASK_FEATURES: ProgramFeature[] = WORK_ORDER_PARTS.map((part) => ({
  ...part,
  id: `work:${part.id}`,
  title: part.label,
  areaId: "tasks",
  status: part.id === "submission" ? "partial" : "existing",
  destination: { kind: "project", view: { kind: "tab", id: "handlinger" }, work: part.id },
}));
const planningFeatures: ProgramFeature[] = [
  {
    id: "work:project-bookings",
    areaId: "tasks",
    title: "Projektets bookingoversigt",
    question: "Hvilket udstyr er reserveret til projektets opgaver?",
    purpose: "Se reservationer i en periode og åbn den opgave, hvor de hører til.",
    output: "Et filtrerbart overblik over udstyr, datoer og aflysninger.",
    status: "existing",
    destination: { kind: "project", view: { kind: "tab", id: "handlinger" }, taskList: "bookings" },
  },
  {
    id: "work:project-time",
    areaId: "tasks",
    title: "Projektets timer",
    question: "Hvilke opgaver har brugt mere tid end estimeret?",
    purpose: "Se som projektleder opgavernes registrerede og estimerede tid samlet.",
    output: "Et timeoverblik med søgning, afvigelsesfilter og adgang til den enkelte opgave.",
    status: "existing",
    destination: { kind: "project", view: { kind: "tab", id: "handlinger" }, taskList: "time" },
  },
  {
    id: "work:time",
    areaId: "tasks",
    title: "Registrér arbejdstid",
    question: "Hvor meget tid blev brugt på opgaven?",
    purpose: "Registrér egen arbejdstid på en dato under Mine opgaver.",
    output: "En gemt tidsregistrering med versionshistorik ved rettelser.",
    status: "existing",
    destination: { kind: "route", path: "/opgaver" },
  },
  {
    id: "work:calendar",
    areaId: "tasks",
    title: "Projektkalender",
    question: "Hvornår ligger projektets opgaver?",
    purpose:
      "Find planlagte perioder, filtrér på den ansvarlige og åbn arbejdsgrundlaget for at ændre datoer.",
    output: "En kalender over gemte planperioder med markering af overlappende opgaver.",
    status: "existing",
    destination: { kind: "project", view: { kind: "tab", id: "handlinger" }, taskList: "calendar" },
  },
  {
    id: "work:schedule",
    areaId: "tasks",
    title: "Planoversigt",
    question: "Hvilke opgaver har en dato eller en ansvarlig?",
    purpose: "Søg i projektets opgaver og find både daterede og udaterede planer.",
    output: "En liste sorteret efter den senest gemte planlagte start.",
    status: "existing",
    destination: { kind: "project", view: { kind: "tab", id: "handlinger" }, taskList: "schedule" },
  },
];

export const PLANNED_FEATURES: ProgramFeature[] = [
  [
    "capacity",
    "Kapacitet og tilgængelighed",
    "Sammenhold planlagte arbejdstimer med medarbejdernes tilgængelighed.",
    "En kapacitetsberegning til fordeling af arbejdet.",
  ],
  [
    "recurrence",
    "Gentagne jobs og delopgaver",
    "Opret gentagelser, afhængigheder og opfølgende arbejdsopgaver.",
    "Planlagte gentagelser med bevaret opgavehistorik.",
  ],
  [
    "time",
    "Timer og aktiviteter",
    "Registrér og sammenhold planlagte og faktiske timer på samme job.",
    "Et kontrollerbart tidsgrundlag.",
  ],
  [
    "materials",
    "Materialer og forbrug",
    "Registrér mængder og enheder fra et fælles materialekatalog.",
    "Et forbrugsgrundlag knyttet til jobbet.",
  ],
  [
    "booking",
    "Booking af ressourcer",
    "Reservér maskiner, køretøjer og værktøj med konfliktkontrol.",
    "En ressourcebooking på det konkrete job.",
  ],
  [
    "routes",
    "Besøg og ruter",
    "Planlæg besøgsrækkefølge, serviceintervaller og kørsel.",
    "Et samlet besøgs- og kørselsgrundlag.",
  ],
  [
    "review",
    "Returnering og faglig godkendelse",
    "Vurdér en bestemt afleveringsversion, og returnér med konkrete mangler.",
    "En versionsbundet beslutning med begrundelse.",
  ],
  [
    "requirements",
    "Kategori- og dokumentationskrav",
    "Konfigurér de versionerede krav, som skal opfyldes ved aflevering.",
    "Faglige krav til den konkrete opgave og registrering.",
  ],
  [
    "migration",
    "Samlet Skyhost-import",
    "Forhåndsvis og genimportér jobs, registreringer og særskilte originalfiler.",
    "En kontrolleret overgang med genkendelige eksterne identiteter.",
  ],
  [
    "billing",
    "Fakturerings- og lønforbindelser",
    "Afstem arbejdsdata med dokumenterede økonomi- og lønforbindelser.",
    "Et kontrollerbart grundlag med særskilte kvitteringer.",
  ],
  [
    "customers",
    "Kunder, kontakter og leverandører",
    "Saml kundeoplysninger, kontaktpersoner og leverandørreferencer med jobbet.",
    "Et fælles kundestamregister og klare relationer.",
  ],
  [
    "job-settings",
    "Jobtyper, ekstra felter og nummerserier",
    "Konfigurér jobtyper, referencenumre og egne jobfelter.",
    "En fælles jobopsætning med stabile referencer.",
  ],
  [
    "category-settings",
    "Geotag-kategorier og GPS-krav",
    "Udbyg kategorihierarki, ansvar, deling, position, arkivering og dokumentationskrav.",
    "Fælles versionerede regler for feltregistreringerne.",
  ],
  [
    "job-notifications",
    "Opgavebeskeder og dagsrapport",
    "Saml modtagerspecifik opgaveindbakke, dagsrapport og kontrollerede beskedforløb.",
    "Et dokumenteret modtagerforløb. Afsendelse er ikke aktiveret.",
  ],
].map(([id, title, purpose, output]) => ({
  id: `planned:${id}`,
  title,
  purpose,
  output,
  question:
    id === "review"
      ? "Hvilken afleveringsversion er gennemgået?"
      : "Hvad skal denne del understøtte?",
  areaId: ["review", "requirements"].includes(id)
    ? "delivery"
    : ["migration", "billing"].includes(id)
      ? "administration"
      : "tasks",
  status: id === "review" ? "partial" : "planned",
  ...(id === "review"
    ? {
        destination: {
          kind: "project" as const,
          view: { kind: "tab" as const, id: "handlinger" as const },
          work: "submission" as const,
        },
      }
    : {}),
}));

/** Exact ten-tab structure from the supplied Skyhost mapping; no claim of full parity. */
export const SKYHOST_JOB_AREAS = [
  {
    id: "details",
    title: "Detaljer",
    purpose: "Jobbets identitet, instruktion, datoer, ansvar, tildeling og bilag.",
    remaining:
      "Kunde- og kontaktfelter, jobtyper, ekstra felter, nummerserier, kapacitet og gentagelser mangler.",
    featureIds: ["work:plan", "work:execution", "work:calendar", "work:schedule"],
    planned: false,
  },
  {
    id: "locations",
    title: "Lokationer",
    purpose: "Steder, rækkefølge og krav om besøg på jobbet.",
    remaining:
      "Fotopunkter findes; flere joblokationer, besøgsafslutning, distance og køretid mangler som samlet forløb.",
    featureIds: ["tab:sites", "planned:routes"],
    planned: false,
  },
  {
    id: "map",
    title: "Kort",
    purpose: "Jobbets geografi, lag, lokationer og eventuel kørsel.",
    remaining:
      "Fælles job-/registreringsfiltre, ens totaler, polygonvalg og besøgsrækkefølge er ikke færdiggjort.",
    featureIds: ["tab:livekort", "/app/connect/map"],
    planned: false,
  },
  {
    id: "log",
    title: "Logbog",
    purpose: "Noter og historik med bruger, tidspunkt og grundlag.",
    remaining:
      "Jobstatus og noter findes under arbejdsgrundlaget; typefiltre, samlet bilagslog og beskedforløb skal udbygges.",
    featureIds: ["work:plan", "tab:audit"],
    planned: false,
  },
  {
    id: "geotag",
    title: "Geotag",
    purpose: "Direkte jobtilknyttede registreringer og originalfotos.",
    remaining:
      "Flere originaltyper, fuld ekstern registrering, kategorier, faser og geografiske forslag skal samles.",
    featureIds: ["work:field", "work:evidence"],
    planned: false,
  },
  {
    id: "time",
    title: "Timer",
    purpose: "Aktiviteter, estimat, forbrug, rest og registreringshistorik.",
    remaining:
      "Projektledere kan godkende og eksportere timer. CSV-udtrækket kan bruge én indtastet timesats. Aktivitetskategorier, gemte satser og fakturakladder afventer.",
    featureIds: ["work:time", "work:project-time", "planned:time"],
    planned: false,
  },
  {
    id: "materials",
    title: "Materialer",
    purpose: "Varenummer, enhed, mængde og materialeforbrug på jobbet.",
    remaining: "Materialekatalog og jobforbrug skal forbindes og afprøves.",
    featureIds: ["planned:materials"],
    planned: true,
  },
  {
    id: "booking",
    title: "Booking",
    purpose: "Reservation af køretøjer, maskiner og værktøj.",
    remaining: "Heldagsbooking og konfliktkontrol er samlet. Booking på klokkeslæt mangler.",
    featureIds: ["work:project-bookings", "planned:booking"],
    planned: false,
  },
  {
    id: "routes",
    title: "Ruter",
    purpose: "Jobbets registrerede kørsel og summer i kilometer og tid.",
    remaining:
      "Kørselsregistrering og kobling til timer/stempelur mangler. Besøgsplanlægning er en særskilt del.",
    featureIds: ["planned:routes", "planned:time"],
    planned: true,
  },
  {
    id: "checklists",
    title: "Tjeklister",
    purpose: "Skabeloner og dokumentationskrav ved et bestemt statusskift.",
    remaining:
      "Grundskema, afleveringskontrol og versionsbundet gennemgang findes; konfigurerede kategori-/statuskrav og flere felttyper mangler.",
    featureIds: ["work:field", "work:submission", "planned:requirements"],
    planned: false,
  },
] as const;
export const INTEGRATION_FEATURES: ProgramFeature[] = [
  {
    id: "integration:watercourse",
    areaId: "professional",
    title: "Vandløbets centerlinje og delstrækninger",
    question: "Hvordan afgrænses arbejdet langs vandløbet?",
    purpose: "Tegn eller importér centerlinje, retning og delstrækninger.",
    output:
      "Et versionsbundet vandløbsgrundlag. Den eksisterende særskilte visning skal samles med projektkortet.",
    status: "unlinked",
  },
  {
    id: "integration:watercourse-observations",
    areaId: "professional",
    title: "Stedbundne vandløbsobservationer",
    question: "Hvilke forhold er observeret på vandløbet?",
    purpose: "Sammenhold billeder, sted, observationstype og faglig vurdering.",
    output: "Stedbundne observationer. Sammenhæng med det fælles opgaveforløb afventer samling.",
    status: "unlinked",
  },
  {
    id: "integration:species",
    areaId: "assessment",
    title: "Artsgenkendelse",
    question: "Hvilken art kan billedet vise?",
    purpose: "Få et artsforslag, og vurder det fagligt med det anvendte grundlag.",
    output:
      "Et forslag til faglig kontrol. Den særskilte visning afventer integration og udbyderprøve.",
    status: "unlinked",
  },
  {
    id: "integration:report-draft",
    areaId: "delivery",
    title: "AI-rapportudkast",
    question: "Hvordan kan rapportteksten forberedes?",
    purpose: "Forbered et tekstudkast ud fra valgt rapporttype og grundlag.",
    output: "Et udkast til gennemgang. Den særskilte visning afventer integration og udbyderprøve.",
    status: "unlinked",
  },
  {
    id: "integration:drone-processing",
    areaId: "field",
    title: "Dronebehandling og afledte produkter",
    question: "Hvilke produkter skal dannes fra droneoriginalerne?",
    purpose: "Bevar sammenhængen mellem originalmanifest, behandling og afledte produkter.",
    output: "Et dokumenteret behandlingsforløb. Samlet drift og udbyderprøve mangler.",
    status: "unlinked",
  },
];
export const PROGRAM_FEATURES = [
  ...PROJECT_FEATURES,
  ...TASK_FEATURES,
  ...planningFeatures,
  ...PROGRAM_PAGES,
  ...INTEGRATION_FEATURES,
  ...PLANNED_FEATURES,
];
export function programFeatureMatches(feature: ProgramFeature, query: string) {
  const skyhostNames = SKYHOST_JOB_AREAS.filter((area) =>
    (area.featureIds as readonly string[]).includes(feature.id),
  ).map((area) => area.title);
  const text = [
    feature.title,
    feature.question,
    feature.purpose,
    feature.output,
    ...skyhostNames,
    feature.areaId === "tasks" ? "job jobs jobkort arbejdsopgave" : "",
  ]
    .join(" ")
    .toLocaleLowerCase("da-DK");
  return query
    .trim()
    .toLocaleLowerCase("da-DK")
    .split(/\s+/)
    .every((term) => text.includes(term));
}
export function projectToolGuide(view: ProjectView) {
  return PROJECT_FEATURES.find((item) => item.id === `${view.kind}:${view.id}`)!;
}
export function routeMatches(pattern: string, path: string) {
  const parts = pattern.replace(/\/$/, "").split("/"),
    actual = path.replace(/\/$/, "").split("/");
  return (
    parts.length === actual.length &&
    parts.every((part, i) => (part.startsWith("$") ? !!actual[i] : part === actual[i]))
  );
}
export function programPageGuide(path: string) {
  return PROGRAM_PAGES.find(
    (item) => item.destination?.kind === "route" && routeMatches(item.destination.path, path),
  );
}
export function programFeatureLink(
  feature: ProgramFeature,
  projectId?: string,
  context: ProjectNavigationSearch = {},
) {
  const d = feature.destination;
  if (!d || feature.status === "planned") return undefined;
  if (d.kind === "route") return { to: d.selectAt ?? d.path, search: {} };
  if (!projectId) return { to: "/app/projects", search: {} };
  const search = projectViewSearch(context, d.view);
  if (d.taskList) {
    const { task: _task, work: _work, ...projectContext } = search;
    return {
      to: `/app/projects/${encodeURIComponent(projectId)}`,
      search: { ...projectContext, taskList: d.taskList },
    };
  }
  return {
    to: `/app/projects/${encodeURIComponent(projectId)}`,
    search: { ...search, ...(d.work ? { work: d.work } : {}) },
  };
}
