import qrcode from "qrcode-generator";

type PrintableJob = {
  projectId: string;
  actionId: string;
  title: string;
  project: string;
  location: string | null;
  schedule: string;
  status: string;
  assignment: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function printableJobCard(origin: string, job: PrintableJob): string {
  const workOrder = new URL("/app/projects/" + encodeURIComponent(job.projectId), origin);
  workOrder.search = new URLSearchParams({
    tab: "handlinger",
    task: job.actionId,
    work: "plan",
  }).toString();
  const link = new URL("/login", origin);
  const mobileJob = new URL("/opgaver", origin);
  mobileJob.searchParams.set("job", job.actionId);
  mobileJob.searchParams.set("mode", "finish");
  link.searchParams.set("next", mobileJob.pathname + mobileJob.search);
  const managerLink = new URL("/login", origin);
  managerLink.searchParams.set("next", workOrder.pathname + workOrder.search);
  const fields = [
    ["Projekt", job.project],
    ["Sted", job.location ?? "Intet sted angivet"],
    ["Planlagt", job.schedule],
    ["Status", job.status],
    ["Tildeling", job.assignment],
  ];
  return renderPrintCard(
    "Jobkort",
    job.title,
    fields,
    link,
    "Åbn færdigmelding i Mine opgaver",
    managerLink,
  );
}

export function printableEquipmentReservation(
  origin: string,
  reservation: {
    bookingId: string;
    actionId: string;
    name: string;
    startsOn: string;
    endsOn: string;
  },
) {
  const mobileJob = new URL("/opgaver", origin);
  mobileJob.searchParams.set("job", reservation.actionId);
  mobileJob.searchParams.set("booking", reservation.bookingId);
  const link = new URL("/login", origin);
  link.searchParams.set("next", mobileJob.pathname + mobileJob.search);
  return renderPrintCard(
    "Materielreservation",
    reservation.name,
    [
      ["Fra", reservation.startsOn],
      ["Til", reservation.endsOn],
    ],
    link,
    "Åbn afhentning og aflevering",
  );
}

export function printableEquipmentLabel(
  origin: string,
  equipment: { equipmentId: string; name: string; kind: string },
) {
  const equipmentRoute = new URL("/opgaver", origin);
  equipmentRoute.searchParams.set("equipment", equipment.equipmentId);
  const link = new URL("/login", origin);
  link.searchParams.set("next", equipmentRoute.pathname + equipmentRoute.search);
  return renderPrintCard(
    "Materielmærke",
    equipment.name,
    [["Type", equipment.kind]],
    link,
    "Find reservationer for udstyret",
  );
}

function renderPrintCard(
  heading: string,
  title: string,
  fields: string[][],
  link: URL,
  linkLabel: string,
  managerLink?: URL,
): string {
  const qr = qrcode(0, "M");
  qr.addData(link.href);
  qr.make();
  const qrImage = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr.createSvgTag(5, 20));
  return (
    '<!doctype html><html lang="da"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="referrer" content="no-referrer">' +
    "<title>" +
    escapeHtml(heading) +
    " – " +
    escapeHtml(title) +
    "</title>" +
    "<style>body{font:16px/1.5 system-ui,sans-serif;color:#18211d;margin:2rem auto;max-width:42rem;padding:0 1rem}h1{line-height:1.2}dt{font-weight:650}dd{margin:0 0 .6rem}img{width:10rem;height:10rem;display:block;margin:1rem 0}a{color:#17623c}@media print{.screen-only{display:none}body{margin:0;max-width:initial;break-inside:avoid}}</style>" +
    "</head><body><main><p>GoFreyra · " +
    escapeHtml(heading) +
    "</p><h1>" +
    escapeHtml(title) +
    "</h1><dl>" +
    fields
      .map(([label, value]) => "<dt>" + label + "</dt><dd>" + escapeHtml(value) + "</dd>")
      .join("") +
    '</dl><img src="' +
    escapeHtml(qrImage) +
    '" alt="QR-kode til GoFreyra">' +
    '<p><a href="' +
    escapeHtml(link.href) +
    '">' +
    escapeHtml(linkLabel) +
    "</a>. Din konto skal have adgang.</p>" +
    (managerLink
      ? '<p class="screen-only"><a href="' +
        escapeHtml(managerLink.href) +
        '">Åbn arbejdsgrundlaget som leder</a></p>'
      : "") +
    '<p class="screen-only">Brug browserens Udskriv-funktion til at printe kortet.</p></main></body></html>'
  );
}
