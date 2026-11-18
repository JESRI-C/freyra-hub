import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const register = JSON.parse(
  await readFile(new URL("src/components/development/product-plan.json", root), "utf8"),
);
const states = {
  mapping: "Kortlægning",
  implementation: "Implementering",
  acceptance_pending: "Samlet accept afventer",
  done: "Færdig og verificeret",
};
const ids = new Set();
for (const feature of register.features) {
  if (!/^F-\d{3}$/.test(feature.resId) || ids.has(feature.resId))
    throw Error("Invalid or duplicate RES ID");
  ids.add(feature.resId);
  if (!states[feature.deliveryStatus]) throw Error(`Missing delivery status: ${feature.id}`);
  if (!feature.acceptance || !feature.stage)
    throw Error(`Missing acceptance or status: ${feature.id}`);
  if (!feature.source || !["http:", "https:"].includes(new URL(feature.source).protocol))
    throw Error(`Missing or invalid product source: ${feature.id}`);
  if (feature.deliveryStatus === "done" && !feature.acceptanceEvidence)
    throw Error(`Missing acceptance evidence: ${feature.id}`);
  const entries = Object.entries(feature).filter(
    ([key, value]) => /^goFreyra.*(?:Code|Migration)$/.test(key) && typeof value === "string",
  );
  feature.codeLinks = entries.map(([label, path]) => ({ label, path, reuse: false }));
  for (const path of feature.goFreyraReuseCode ?? [])
    feature.codeLinks.push({ label: "Mulig genbrug", path, reuse: true });
  for (const { path } of feature.codeLinks) {
    if (!/^(src|supabase)\//.test(path) || path.split("/").includes(".."))
      throw Error(`Invalid code path: ${path}`);
    await access(new URL(path, root));
  }
  feature.evidenceLinks = [
    ...new Set(
      Object.entries(feature)
        .filter(([key]) => /^goFreyra.*Evidence$/.test(key))
        .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
        .filter((value) => typeof value === "string" && /^evidence\/[a-z0-9-]+\.json$/.test(value)),
    ),
  ];
  // Evidence records remain private; only their references belong in the plan.
}
const payload = JSON.stringify({ ...register, states }).replaceAll("<", "\\u003c");
const html = `<!doctype html>
<html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>GoFreyra · Skyhost udviklingstavle</title>
<style>
:root{font-family:system-ui,sans-serif;color:#172e2b;background:#f4f6f3;line-height:1.5}*{box-sizing:border-box}body{margin:0}header,main{max-width:1600px;margin:auto;padding:24px}header{padding-bottom:0}h1{font-size:clamp(1.7rem,4vw,2.6rem);margin:0}h2{font-size:1.3rem}p{max-width:85ch}a{color:#005b56;overflow-wrap:anywhere}button,input,select{font:inherit;min-height:44px;border:1px solid #788d83;border-radius:8px;padding:8px;background:white;color:inherit}button{cursor:pointer}label{display:grid;gap:4px;font-weight:600}input,select{width:100%;min-width:0}.filters{display:grid;grid-template-columns:2fr 1fr 1fr;gap:16px;margin:24px 0}.flow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.flow span{border:1px solid #97b1a6;border-radius:10px;padding:12px;background:#fff}.board{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;align-items:start}.lane{min-width:0;background:#e7ede7;border-radius:12px;padding:12px}.lane h3{font-size:1rem;margin:0 0 12px}.card{border:1px solid #a7b9ad;background:white;padding:16px;border-radius:10px;margin-bottom:12px;overflow-wrap:anywhere}.card h4{font-size:1rem;margin:8px 0}.tag{font-size:.8rem;background:#e5efea;border-radius:5px;padding:4px 6px}.meta{font-size:.9rem;color:#3f5e52}.card p{margin:8px 0}.card details{margin-top:12px}.card summary{cursor:pointer;font-weight:600;min-height:44px;display:flex;align-items:center}.card dl{margin:0}.card dt{font-weight:600;margin-top:12px}.card dd{margin:4px 0 0}.links{display:grid;gap:8px;margin-top:12px}.empty{color:#456153}#result{font-weight:600}.notice{border-left:4px solid #438267;padding-left:16px}.demo-config{max-width:650px;margin-bottom:16px}input:focus-visible,select:focus-visible,a:focus-visible,summary:focus-visible,button:focus-visible{outline:3px solid #b86c13;outline-offset:3px}@media(max-width:1100px){.board{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){header,main{padding:16px}.board,.filters{grid-template-columns:1fr}.flow span{flex:1 1 100%}.flow b{display:none}}@media print{.filters,.demo-config{display:none}.board{display:block}.card{break-inside:avoid}details>*{display:block!important}}
</style>
<header><p class="meta">GoFreyra / produktudvikling</p><h1>Skyhost → GoFreyra</h1><p>Funktioner, kode og acceptprøver samlet fra det fælles funktionsregister. Tavlen viser udviklingsstatus; kodehenvisninger alene dokumenterer ikke en færdig funktion.</p></header>
<main>
<section aria-labelledby="architecture"><h2 id="architecture">Whiteboard · sammenhæng i feltarbejdet</h2><p>GoFreyra-arbejdsmodel til implementering. Vælg et modul nedenfor for at se de tilhørende krav.</p><div class="flow" aria-label="Kunde og sag fører til planlagte jobs, mobil udførelse, ledelsesgodkendelse og rapportering samt fakturagrundlag"><span>Kunde og sag</span><b aria-hidden="true">→</b><span>Jobs · plan · tildeling</span><b aria-hidden="true">→</b><span>Mobil · kort · billeder · timer · materialer</span><b aria-hidden="true">→</b><span>Godkendelse og historik</span><b aria-hidden="true">→</b><span>Rapporter og fakturagrundlag</span></div><p class="meta">Materiel, GPS, kørebog, vintertjeneste og integrationer knyttes til arbejdsgangene. Roller og organisation afgrænser adgangen på tværs.</p></section>
<section aria-labelledby="kanban"><h2 id="kanban">Kanban · hele produktet</h2>
<div class="filters"><label>Søg i krav og accept<input id="search" type="search" placeholder="Fx billeder, CO₂ eller F-040"></label><label>Modul<select id="module"><option value="">Alle moduler</option></select></label><label>Udviklingsstatus<select id="state"><option value="">Alle statusser</option></select></label></div>
<details class="demo-config"><summary>Åbn demo fra tavlen</summary><p>Angiv adressen til din kørende GoFreyra-demo. Login og rolle bestemmer, hvilke sider du kan åbne. Pladsholdere i adresser skal erstattes i appen.</p><label>Demoens basisadresse<input id="base" type="url" placeholder="http://127.0.0.1:4180"></label><p id="base-feedback" role="status"></p></details>
<p id="result" role="status" aria-live="polite"></p><div id="board" class="board"></div><p class="notice">Kortlægningen er foreløbig. Modul- og rolleprøver samt fysiske enheder og eksterne integrationer er fortsat en del af målet. Se kortenes konkrete begrænsninger.</p>
</section></main>
<script id="register" type="application/json">${payload}</script>
<script>
const data=JSON.parse(document.getElementById('register').textContent);
const search=document.getElementById('search'),moduleSelect=document.getElementById('module'),stateSelect=document.getElementById('state'),base=document.getElementById('base');
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
for(const name of [...new Set(data.features.map(f=>f.module))].sort((a,b)=>a.localeCompare(b,'da'))){const o=el('option',name);o.value=name;moduleSelect.append(o);}
for(const [id,label]of Object.entries(data.states)){const o=el('option',label);o.value=id;stateSelect.append(o);}
function link(text,url){const a=el('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function safeWeb(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u:null;}catch{return null;}}
function render(){
 const term=search.value.trim().toLocaleLowerCase('da'),demo=base.value.trim()?safeWeb(base.value):null;
 document.getElementById('base-feedback').textContent=base.value.trim()&&!demo?'Brug en gyldig http- eller https-adresse.':'';
 const rows=data.features.filter(f=>(!moduleSelect.value||f.module===moduleSelect.value)&&(!stateSelect.value||f.deliveryStatus===stateSelect.value)&&(!term||[f.resId,f.id,f.module,f.feature,f.actors,f.data,f.acceptance,f.stage].join(' ').toLocaleLowerCase('da').includes(term)));
 document.getElementById('result').textContent=rows.length+' af '+data.features.length+' funktionsområder · '+data.features.filter(f=>f.deliveryStatus==='done').length+' med afsluttet samlet accept';
 const board=document.getElementById('board');board.replaceChildren();
 for(const [state,label]of Object.entries(data.states)){
  if(stateSelect.value&&stateSelect.value!==state)continue;
  const lane=el('section');lane.className='lane';lane.setAttribute('aria-label',label);const selected=rows.filter(f=>f.deliveryStatus===state);lane.append(el('h3',label+' ('+selected.length+')'));
  if(!selected.length){const p=el('p','Ingen kort i dette udvalg.');p.className='empty';lane.append(p);}
  for(const f of selected){
   const card=el('article');card.className='card';card.dataset.resId=f.resId;
   const tag=el('span',f.resId+' · '+f.module);tag.className='tag';card.append(tag,el('h4',f.feature),el('p',f.stage));
   const details=el('details');details.append(el('summary','Krav og acceptprøve'));const dl=el('dl');for(const [label,value]of [['Brugere',f.actors],['Data og adgang',f.data],['Acceptprøve',f.acceptance]]){dl.append(el('dt',label),el('dd',value||'Afventer kortlægning'));}details.append(dl);
   const links=el('div');links.className='links';const source=safeWeb(f.source);if(source)links.append(link('Produktkilde',source.href));
   for(const code of f.codeLinks)links.append(link((code.reuse?'Mulig genbrug: ':'Kode: ')+code.path,'../'+code.path.split('/').map(encodeURIComponent).join('/')));
   for(const path of f.evidenceLinks)links.append(link('Se gemt prøveresultat: '+path,path));
   for(const key of ['goFreyraDemoRoute','goFreyraFieldRoute','goFreyraEquipmentLabelRoute']){const route=f[key];if(!route)continue;if(demo&&route.startsWith('/')&&!route.startsWith('//')&&!/[<>]/.test(route))links.append(link('Åbn demo: '+route,new URL(route,demo.origin).href));else links.append(el('p','Demo-rute: '+route));}
   if(f.mobileDemo)links.append(el('p','Mobil-demo i '+f.mobileDemo.repository+': '+f.mobileDemo.route));details.append(links);card.append(details);lane.append(card);
  }board.append(lane);
 }
}
for(const control of [search,moduleSelect,stateSelect,base])control.addEventListener('input',render);render();
</script></html>`;
const output = new URL("docs/skyhost-development-board.html", root);
await writeFile(output, html);
console.log(`Generated ${register.features.length} cards: ${fileURLToPath(output)}`);
