import type { AtlasPhoto, AtlasReview, PhotoAtlas } from "./photo-atlas";
import {
  ATLAS_METHOD,
  photoDateLabel,
  speciesText,
  documentedPhotoComparison,
} from "./photo-atlas";
import type { ReportContent, ReportSource } from "./report-document";
import type { ReportImage } from "@/services/report-assets";

export function atlasPhotoText(photo: AtlasPhoto, review?: AtlasReview) {
  return `${photo.id} · ${photo.filename} · ${photoDateLabel(photo)}\n${photo.watercourse || "Vandløbstilknytning afventer"}${review?.reach ? " · Strækning: " + review.reach : ""}\n${(review ? review.observation : photo.observation) || "Observation mangler."}\nVegetation: ${(review ? review.vegetation : photo.vegetation) || "Ikke beskrevet."}\nMotivplacering og usikkerhed: ${review?.subjectPosition || "Ikke registreret; kamera-GPS er ikke motivposition."}${review?.closePhotoIds ? "\nNærfotos: " + review.closePhotoIds : ""}`;
}
export function atlasReportContent(input: {
  atlas: PhotoAtlas & { evidenceId: string; checksum: string };
  photos: AtlasPhoto[];
  reviews: Map<string, { review: AtlasReview }>;
  projectName: string;
  organizationName: string;
  purpose: string;
}): ReportContent {
  const { atlas, photos, reviews } = input;
  // Use the existing, server-canonicalized evidence reference. Imported original
  // checksums must not masquerade as verified project_media original checksums.
  const sources: ReportSource[] = [
    {
      id: `evidence:${atlas.evidenceId}`,
      title: atlas.title,
      kind: "freyra_photo_atlas_v1",
      capturedAt: null,
      checksum: null,
      position: null,
      method:
        "Registreret fotoatlas; originalernes checksums er kildehenvisninger, ikke verificerede originalfiler.",
      version: atlas.version,
    },
  ];
  const sections: {
    title: string;
    text: string;
    basis: "observed" | "documented" | "screening" | "not_measured";
  }[] = [
    {
      title: "Projektets formål og område",
      text:
        (input.purpose
          ? "Projektets registrerede beskrivelse, afventer faglig kontrol: " + input.purpose
          : "") ||
        "Projektets formål og afgrænsning skal beskrives og kontrolleres før aflevering.",
      basis: "not_measured",
    },
    {
      title: "Kort og dokumentationsgrundlag",
      text: `${photos.length} registrerede fotos. Vandløbstilknytning: ${[...new Set(photos.map((p) => p.watercourse || "Uafklaret"))].join(", ")}. Optagedatoer: ${[...new Set(photos.map((p) => p.date || "Mangler"))].sort().join(", ")}. Kortet viser kamerapositioner og dokumenterer ikke fotoernes dækningsområde, en juridisk projektgrænse eller præcis motivposition. Vandområde-ID gælder kildeområdet, ikke nødvendigvis kommunens delstrækning.`,
      basis: "documented",
    },
    {
      title: "Observationer og vegetationsbeskrivelser",
      text: photos.map((p) => atlasPhotoText(p, reviews.get(p.id)?.review)).join("\n\n"),
      basis: "observed",
    },
    {
      title: "Artsregistreringer og kontrolstatus",
      text:
        photos
          .map((p) => {
            const r = reviews.get(p.id)?.review;
            const species = r ? r.species : speciesText(p);
            return species
              ? `${p.id}: ${species}. ${r?.speciesStatus === "field_confirmed" ? "Brugerregistreret feltbekræftelse: " + r.confirmationEvidence + ". Fagperson: " + r.reviewer : "Foreløbigt artsbud; relevant kontrol mangler."}`
              : "";
          })
          .filter(Boolean)
          .join("\n\n") ||
        "Der er ingen artsregistreringer i det valgte grundlag. Dronefotos alene udgør ikke en sikker artsbestemmelse.",
      basis: "screening",
    },
    {
      title: "Adgang, drift og dokumenteret arbejde",
      text:
        photos
          .map((p) => {
            const r = reviews.get(p.id)?.review;
            if (!r || (!r.access && !r.workDate && !r.comparisonPhotoId)) return "";
            const other = photos.find((photo) => photo.id === r.comparisonPhotoId);
            const comparison = other ? documentedPhotoComparison(p, other, r) : null;
            return `${p.id}: ${r.access || "Adgang ikke beskrevet."}${r.workDate ? " Arbejdsdato: " + r.workDate + ". Kilde: " + r.workEvidence : " Arbejdsdato og arbejdsgrænse ikke dokumenteret."}${r.workPhotoIds ? " Driftsfotos: " + r.workPhotoIds : ""}${comparison ? " Sammenlignet med " + other!.id + ": " + comparison.reason + ". Samme sted: " + (r.samePlaceEvidence || "ikke dokumenteret") : ""}`;
          })
          .filter(Boolean)
          .join("\n\n") ||
        "Adgang, arbejdsdatoer og arbejdsgrænser er ikke registreret. Fotodato må ikke bruges som skæredato.",
      basis: "not_measured",
    },
    {
      title: "Beplantningsforslag og naturhensyn",
      text:
        photos
          .map((p) => {
            const r = reviews.get(p.id)?.review;
            if (!r || (!r.planting && !r.natureConcerns)) return "";
            return `${p.id}: ${r.planting || "Planteforslag ikke registreret."} Status: ${r.plantingStatus === "documented_execution" ? "Udførelse registreret " + r.plantingDate + "; kilde " + r.plantingEvidence : "Forslag; faglig afklaring og eventuelle tilladelser afventer."} Naturhensyn: ${r.natureConcerns || "Ikke registreret."}`;
          })
          .filter(Boolean)
          .join("\n\n") ||
        "Der er ikke registreret stedbundne planteforslag eller naturhensyn. Der fastsættes ikke et antal træer, arbejdsgrænser eller maskinkapacitet ud fra dronefotos.",
      basis: "screening",
    },
    {
      title: "Pleje, efterplantning og senere opfølgning",
      text:
        photos
          .map((p) => {
            const r = reviews.get(p.id)?.review;
            return r?.followup ? `${p.id}: ${r.followup}` : "";
          })
          .filter(Boolean)
          .join("\n\n") ||
        "Pleje, efterplantning, arbejdsregistreringer og supplerende optagelser skal tilføjes, når dokumentation foreligger. To optagedatoer er ikke i sig selv dokumentation for en indsats.",
      basis: "not_measured",
    },
    {
      title: "Metode, kilder og faglige begrænsninger",
      text: `${atlas.method}\n\n${ATLAS_METHOD}\n\nKildedatasæt: ${atlas.title}. Version: ${atlas.version}. Fotoatlasfilens SHA-256: ${atlas.checksum}. Illustrationer er visningskopier. Oprindelige filer er ikke blevet hentet eller omskrevet som del af denne import.\n\nVandstand, temperatur, ilt og pH er ikke målt her. Formelt økologisk tilstand eller effekt af plantning beregnes ikke fra disse billeder. Lokale optagetider uden tidszone omregnes ikke til UTC. Alle afsnit afventer faglig rapportgennemgang. Atlasdokumentet har ingen serverregistreret originalkontrolsum og kan ikke alene danne grundlag for en godkendt rapport.\n\nFotoregister med originalreferencer (ikke verificeret ved atlasimport):\n${photos.map((p) => `${p.id} · ${p.filename} · ${p.source || "Originalreference mangler"} · Registreret original-SHA-256: ${p.sha256 || "Mangler"}`).join("\n\n")}`,
      basis: "documented",
    },
  ];
  return {
    templateId: "watercourse",
    title: `${input.projectName} · fotobaseret baseline`,
    projectName: input.projectName,
    organizationName: input.organizationName,
    scope: "Fotobaseret baseline, vegetation, stedbundne forslag og opfølgning",
    audience: "Kommune og projektets fagpersoner",
    sources,
    photoAtlas: {
      evidenceId: atlas.evidenceId,
      checksum: atlas.checksum,
      photoIds: photos.map((p) => p.id),
    },
    sections: sections.map((s, i) => ({
      id: `atlas-section-${i + 1}`,
      title: s.title,
      text: s.text,
      sourceIds: i === 0 ? [] : sources.map((x) => x.id),
      reviewed: false,
      basis: s.basis,
    })),
  };
}
export function decodeAtlasImage(photo: AtlasPhoto) {
  if (!photo.image) return null;
  const match = photo.image.match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) throw new Error("Ugyldig rapportillustration.");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, format: match[1] as "jpeg" | "png" };
}
export async function atlasReportImages(
  atlas: PhotoAtlas & { evidenceId: string },
  photos = atlas.photos,
): Promise<ReportImage[]> {
  const images: ReportImage[] = [];
  for (const photo of photos) {
    const decoded = decodeAtlasImage(photo);
    if (!decoded) continue;
    const bitmap = await createImageBitmap(
      new Blob([decoded.bytes.slice().buffer], { type: `image/${decoded.format}` }),
    );
    images.push({
      id: `atlas:${atlas.evidenceId}:${photo.id}`,
      caption: `${photo.id} · ${photo.filename} · ${photo.watercourse || "Tilknytning uafklaret"} · ${photoDateLabel(photo)} · Kamera ${photo.lat ?? "?"}, ${photo.lon ?? "?"}. Rapportillustration; originalreference og begrænsninger fremgår af kildelisten.`,
      bytes: decoded.bytes,
      format: decoded.format,
      width: bitmap.width,
      height: bitmap.height,
    });
    bitmap.close();
  }
  return images;
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
export function buildPhotoAtlasHtml(
  atlas: PhotoAtlas,
  reviews = new Map<string, { review: AtlasReview }>(),
  projectName = atlas.title,
) {
  const photos = atlas.photos.map((p) => {
    const r = reviews.get(p.id)?.review;
    return {
      ...p,
      observation: r ? r.observation : p.observation,
      vegetation: r ? r.vegetation : p.vegetation,
      species: r ? (r.species ? [r.species] : []) : p.species,
      review: r ?? null,
    };
  });
  const data = JSON.stringify(photos)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(projectName)} · fotoatlas</title><style>body{font:16px system-ui;margin:auto;max-width:1500px;padding:24px;background:#f5f8f5;color:#193c2f}header{border-bottom:2px solid #27543d}input,select,button{font:inherit;padding:10px;border:1px solid #a5b7ab;border-radius:7px}form{display:flex;gap:12px;flex-wrap:wrap;margin:20px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:18px}.photo{background:white;border:1px solid #c4d0c7;border-radius:10px;padding:10px;text-align:left}.photo img{width:100%;aspect-ratio:3/2;object-fit:cover}.photo p{white-space:pre-wrap}dialog{max-width:95vw;width:1300px;max-height:95vh;overflow:auto;border:1px solid #a5b7ab;border-radius:10px}dialog::backdrop{background:#000b}#zoom-frame{overflow:auto;max-height:70vh;background:#111}#large{display:block;width:100%;max-width:none}a{color:#27543d}#map{width:100%;height:340px;background:#e8f0e9;border:1px solid #a5b7ab}circle{cursor:pointer;fill:#27543d}circle:focus{stroke:#f90;stroke-width:3}@media print{form,dialog,button{display:none!important}.grid{grid-template-columns:1fr 1fr}.photo{break-inside:avoid}}</style><header><p>FREYRA · FOTOATLAS</p><h1>${escapeHtml(projectName)}</h1><p>${escapeHtml(atlas.method)} ${escapeHtml(ATLAS_METHOD)}</p></header><form onsubmit="return false"><label>Søg <input id="search" type="search" placeholder="Foto-ID, filnavn eller beskrivelse"></label><label>Vandløb <select id="watercourse"><option value="">Alle</option></select></label><label>Optagedato <select id="date"><option value="">Alle</option></select></label><label>Billedgruppe <select id="section"><option value="">Alle</option></select></label></form><p id="count" role="status"></p><details><summary>Kortskitse over kamerapositioner</summary><p>Skitse uden baggrundskort. Kameraets position er ikke motivets placering eller en præcis områdegrænse.</p><svg id="map" viewBox="0 0 1000 340" role="img" aria-label="Kamerapositioner"></svg></details><main id="photos" class="grid"></main><dialog id="dialog"><button id="close">Luk</button> <button id="previous">Forrige foto</button> <button id="next">Næste foto</button> <label>Zoom <input id="zoom" type="range" min="1" max="4" step="0.25" value="1"></label><h2 id="title"></h2><div id="zoom-frame"><img id="large" alt=""></div><p id="description" style="white-space:pre-wrap"></p><a id="source" target="_blank" rel="noopener noreferrer">Åbn originalens kildehenvisning</a></dialog><script type="application/json" id="photo-data">${data}</script><script>
const photos=JSON.parse(document.getElementById('photo-data').textContent);let shown=photos,selected=null;const byId=id=>document.getElementById(id);const put=(tag,text)=>{const node=document.createElement(tag);node.textContent=text;return node;};
for(const [id,key] of [['watercourse','watercourse'],['date','date'],['section','section_id']])for(const value of [...new Set(photos.map(p=>p[key]).filter(Boolean))].sort()){const option=put('option',value);option.value=value;byId(id).append(option);}
function describe(p){return [p.id+' · '+p.filename,p.date?(p.time||p.date)+' · tidszone som angivet i kilden':'Optagedato mangler',p.observation||'Observation mangler','Vegetation: '+(p.vegetation||'Ikke beskrevet'),'Arter: '+(p.review?.species||p.species.map(s=>typeof s==='string'?s:JSON.stringify(s)).join('; ')||'Ikke registreret'),p.review?.speciesStatus==='field_confirmed'?'Brugerregistreret feltbekræftelse: '+p.review.confirmationEvidence:'Artsbud er foreløbige; kontrol kræves.','Kamera-GPS: '+(p.lat==null?'mangler':p.lat+', '+p.lon),'Motivplacering: '+(p.review?.subjectPosition||'Ikke registreret'),p.review?.access?'Adgang: '+p.review.access:'',p.review?.natureConcerns?'Naturhensyn: '+p.review.natureConcerns:'',p.review?.planting?'Beplantning: '+p.review.planting:'',p.review?.followup?'Opfølgning: '+p.review.followup:'',p.date_status||'Optagedato er ikke dokumentation for en indsats.'].filter(Boolean).join(String.fromCharCode(10,10));}
function open(p){selected=p;byId('title').textContent=p.id+' · '+p.filename;byId('large').src=p.image||'';byId('large').alt=p.observation||p.filename;byId('description').textContent=describe(p);byId('zoom').value='1';byId('large').style.width='100%';byId('source').hidden=!p.source;if(p.source)byId('source').href=p.source;if(!byId('dialog').open)byId('dialog').showModal();}
function map(){const svg=byId('map');svg.replaceChildren();const points=shown.filter(p=>p.lat!=null&&p.lon!=null);if(!points.length)return;const minX=Math.min(...points.map(p=>p.lon)),maxX=Math.max(...points.map(p=>p.lon)),minY=Math.min(...points.map(p=>p.lat)),maxY=Math.max(...points.map(p=>p.lat));for(const p of points){const point=document.createElementNS('http://www.w3.org/2000/svg','circle');point.setAttribute('cx',String(25+(p.lon-minX)/(maxX-minX||1)*950));point.setAttribute('cy',String(315-(p.lat-minY)/(maxY-minY||1)*290));point.setAttribute('r','5');point.setAttribute('tabindex','0');point.setAttribute('aria-label',p.id);const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=p.id;point.append(title);point.addEventListener('click',()=>open(p));point.addEventListener('keydown',e=>{if(e.key==='Enter')open(p)});svg.append(point);}}
function render(){const q=byId('search').value.toLocaleLowerCase('da-DK');shown=photos.filter(p=>(!byId('watercourse').value||p.watercourse===byId('watercourse').value)&&(!byId('date').value||p.date===byId('date').value)&&(!byId('section').value||p.section_id===byId('section').value)&&[p.id,p.filename,p.observation,p.vegetation,p.review?.species||''].join(' ').toLocaleLowerCase('da-DK').includes(q));byId('count').textContent=shown.length+' af '+photos.length+' fotos';const grid=byId('photos');grid.replaceChildren();for(const p of shown){const button=put('button','');button.type='button';button.className='photo';const img=document.createElement('img');if(p.image)img.src=p.image;img.alt=p.observation||p.filename;img.loading='lazy';button.append(img,put('h2',p.id+' · '+p.filename),put('p',(p.watercourse||'Uafklaret')+' · '+(p.date||'Dato mangler')),put('p',p.observation||'Observation mangler'));button.addEventListener('click',()=>open(p));grid.append(button);}map();}
for(const id of ['search','watercourse','date','section'])byId(id).addEventListener('input',render);byId('close').onclick=()=>byId('dialog').close();byId('zoom').oninput=()=>byId('large').style.width=(Number(byId('zoom').value)*100)+'%';for(const [id,delta] of [['previous',-1],['next',1]])byId(id).onclick=()=>{const i=shown.findIndex(p=>p.id===selected?.id);if(shown[i+delta])open(shown[i+delta]);};document.addEventListener('keydown',e=>{if(!byId('dialog').open)return;if(e.key==='ArrowLeft')byId('previous').click();if(e.key==='ArrowRight')byId('next').click();});render();
</script></html>`;
}
export function downloadAtlasBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
