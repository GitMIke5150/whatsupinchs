import * as maplibregl from 'https://unpkg.com/maplibre-gl@^6.9.0/dist/maplibre-gl.mjs';

const $ = (s) => document.querySelector(s);
const els = {
  empty: $('#empty-state'), intel: $('#intel'), address: $('#address'), coordinates: $('#coordinates'),
  score: $('#score'), brief: $('#brief'), components: $('#components'), evidence: $('#evidence-cards'),
  places: $('#places'), status: $('#status-pill'), question: $('#question'), answer: $('#answer'),
  feedHealth: $('#feed-health'), disclaimer: $('#disclaimer'), modeLabel: $('#mode-label'),
  search: $('#search-input'), searchResults: $('#search-results')
};

let mode = 'business';
let current = null;
let marker = null;
let requestController = null;

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://tiles.openfreemap.org/styles/liberty',
  center: [-79.9311, 32.7765],
  zoom: 13.35,
  minZoom: 9,
  maxZoom: 20,
  attributionControl: true
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left');

const layerStyle = {
  zoning: { fill: '#c96432', line: '#a9481f', opacity: .18 },
  countyParcel: { fill: '#11110f', line: '#11110f', opacity: .04 },
  property: { fill: '#9f7b3b', line: '#7e5f2c', opacity: .09 },
  futureLandUse: { fill: '#4f705f', line: '#3d5d4b', opacity: .14 },
  flood: { fill: '#4d7181', line: '#355c6c', opacity: .17 },
  historic: { fill: '#705a78', line: '#563c60', opacity: .14 },
  str: { fill: '#a77f58', line: '#7d5c3d', opacity: .10 },
  activePermits: { circle: '#c99a42' },
  newDevelopments: { circle: '#9b4f43' },
  newConstruction: { circle: '#c96432' },
  parking: { circle: '#4f705f' },
  transit: { circle: '#4d7181' }
};

function safeId(k){ return `val-${k}`; }
function removeMapLayer(id){ if(map.getLayer(id)) map.removeLayer(id); }
function removeMapSource(id){ if(map.getSource(id)) map.removeSource(id); }

function clearEvidenceLayers(){
  Object.keys(layerStyle).forEach((key) => {
    ['fill','line','circle'].forEach((suffix) => removeMapLayer(`${safeId(key)}-${suffix}`));
    removeMapSource(safeId(key));
  });
  removeMapLayer('val-places-circle'); removeMapSource('val-places');
}

function addGeoLayer(key, fc){
  const style = layerStyle[key];
  if(!style || !fc?.features?.length) return;
  const id = safeId(key);
  map.addSource(id, { type: 'geojson', data: { type:'FeatureCollection', features: fc.features.slice(0, 350) } });
  const geom = fc.features[0]?.geometry?.type || '';
  if(/Polygon/.test(geom)){
    map.addLayer({ id:`${id}-fill`, type:'fill', source:id, paint:{ 'fill-color':style.fill, 'fill-opacity':style.opacity } });
    map.addLayer({ id:`${id}-line`, type:'line', source:id, paint:{ 'line-color':style.line, 'line-width': key === 'countyParcel' ? 2.4 : 1.5, 'line-opacity':.85 } });
  } else if(/Line/.test(geom)){
    map.addLayer({ id:`${id}-line`, type:'line', source:id, paint:{ 'line-color':style.line || style.circle || '#111', 'line-width':2.2, 'line-opacity':.78 } });
  } else {
    map.addLayer({ id:`${id}-circle`, type:'circle', source:id, paint:{ 'circle-color':style.circle || style.fill || '#111', 'circle-radius':5, 'circle-stroke-color':'#fff', 'circle-stroke-width':1.3, 'circle-opacity':.9 } });
  }
}

function drawEvidence(e){
  clearEvidenceLayers();
  Object.entries(e.layers || {}).forEach(([key, layer]) => addGeoLayer(key, layer.data));
  if(e.places?.length){
    const fc = { type:'FeatureCollection', features:e.places.slice(0,80).map((p) => ({ type:'Feature', properties:{name:p.name,category:p.category}, geometry:{type:'Point',coordinates:[p.lng,p.lat]} })) };
    map.addSource('val-places', { type:'geojson', data:fc });
    map.addLayer({ id:'val-places-circle', type:'circle', source:'val-places', paint:{ 'circle-color':'#11110f','circle-radius':3.6,'circle-opacity':.62,'circle-stroke-color':'#fff','circle-stroke-width':.8 } });
    map.on('click','val-places-circle',(ev)=>{ const f=ev.features?.[0]; if(!f) return; new maplibregl.Popup().setLngLat(ev.lngLat).setHTML(`<b>${escapeHtml(f.properties.name)}</b><br>${escapeHtml(f.properties.category || 'place')}`).addTo(map); });
  }
}

function setMarker(lat,lng){
  if(marker) marker.remove();
  const el=document.createElement('div'); el.className='val-marker';
  marker=new maplibregl.Marker({element:el}).setLngLat([lng,lat]).addTo(map);
}

function status(text, kind='ready'){ els.status.textContent=text; els.status.className=`status-pill ${kind==='ready'?'':kind}`; }
function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function firstProps(layer){ return layer?.data?.features?.[0]?.properties || {}; }
function cleanProps(o){ return Object.entries(o||{}).filter(([,v])=>v!==null&&v!==''&&typeof v!=='object').slice(0,16); }
function pick(o, keys){ for(const k of keys){ if(o?.[k]!==undefined && o[k]!==null && o[k]!=='') return o[k]; } return null; }
function money(v){ const n=Number(v); return Number.isFinite(n)&&n>0 ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n) : null; }

function evidenceHeadline(key, layer){
  if(!layer.ok) return 'UNAVAILABLE';
  const p=firstProps(layer);
  const mapKeys={
    zoning:['ZONE_BASE','ZONING','ZONE'], historic:['District'], str:['CATEGORY','CAT','NAME','Category'], futureLandUse:['LAND_USE','Name'],
    flood:['FLD_ZONE','ZONE_SUBTY','SFHA_TF','FLD_AR_ID','ZONE'], property:['TMS','PARCELID','ADDRESS'], countyParcel:['FEATURES.SDE.P_POLY_PARCEL.PID','PID'],
  };
  if(key==='activePermits'||key==='newDevelopments'||key==='newConstruction'||key==='parking'||key==='transit') return `${layer.count} nearby`;
  const val=pick(p,mapKeys[key]||[]);
  if(val) return String(val);
  if(key==='property') return money(p.SALE_PRICE)||money(p.APPRVAL)||`${layer.count} match`;
  return `${layer.count} match${layer.count===1?'':'es'}`;
}

function renderEvidence(e){
  const order=['zoning','futureLandUse','flood','historic','str','property','countyParcel','activePermits','newDevelopments','newConstruction','parking','transit'];
  els.evidence.innerHTML=order.map((key)=>{
    const layer=e.layers[key]; if(!layer) return '';
    const rows=cleanProps(firstProps(layer)).map(([k,v])=>`<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('');
    return `<details class="evidence-card"><summary><b>${escapeHtml(layer.label)}</b><span class="evidence-value">${escapeHtml(evidenceHeadline(key,layer))}</span></summary><div class="evidence-body">${layer.ok?(rows?`<dl>${rows}</dl>`:'<span>No feature intersects the configured query.</span>'):`<div class="source-error">${escapeHtml(layer.error||'Source unavailable')}</div>`}<a class="source-link" href="${escapeHtml(layer.url)}" target="_blank" rel="noreferrer">OPEN SOURCE SERVICE ↗</a></div></details>`;
  }).join('');
  const ok=Object.values(e.layers).filter((x)=>x.ok).length, total=Object.keys(e.layers).length;
  els.feedHealth.textContent=`${ok}/${total} GIS feeds live`;
}

function renderScore(scoring){
  els.score.textContent=scoring.score;
  els.components.innerHTML=Object.entries(scoring.components).map(([key,c])=>`<div class="component"><div class="component-name">${escapeHtml(key)}</div><div><div class="component-track"><div class="component-fill" style="width:${c.score}%"></div></div><div class="component-reason">${escapeHtml(c.reason)}</div></div><div class="component-score">${c.score}</div></div>`).join('');
  els.disclaimer.textContent=scoring.disclaimer;
}

function renderPlaces(places){
  els.places.innerHTML=(places||[]).slice(0,18).map((p)=>`<div class="place"><b title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</b><span>${escapeHtml(p.category||'place')}${p.cuisine?` · ${escapeHtml(p.cuisine)}`:''}</span></div>`).join('') || '<div class="component-reason">Nearby-place feed returned no named POIs.</div>';
}

async function analyze(lat,lng,{fly=false}={}){
  if(requestController) requestController.abort(); requestController=new AbortController();
  setMarker(lat,lng); status('QUERYING 11 GIS FEEDS…','loading'); els.answer.classList.add('hidden');
  if(fly) map.flyTo({center:[lng,lat],zoom:16.2,duration:900});
  try{
    const res=await fetch(`/api/analyze?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&mode=${encodeURIComponent(mode)}`,{signal:requestController.signal});
    const data=await res.json(); if(!res.ok) throw new Error(data.detail||data.error||'Analysis failed');
    current=data; els.empty.classList.add('hidden'); els.intel.classList.remove('hidden');
    els.address.textContent=data.evidence.address?.address || 'Unresolved Charleston location';
    els.coordinates.textContent=`${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    els.modeLabel.textContent=`${mode==='realestate'?'REAL ESTATE':mode.toUpperCase()} MODE`;
    els.brief.textContent=data.brief; renderScore(data.scoring); renderEvidence(data.evidence); renderPlaces(data.evidence.places); drawEvidence(data.evidence);
    status(data.evidence.failures.length?`${data.evidence.failures.length} FEED${data.evidence.failures.length===1?'':'S'} UNAVAILABLE`:'LIVE GIS · VERIFIED',data.evidence.failures.length?'error':'ready');
  }catch(err){ if(err.name==='AbortError') return; status('QUERY FAILED','error'); els.brief.textContent=err.message; }
}

map.on('click',(ev)=>analyze(ev.lngLat.lat,ev.lngLat.lng));

$$('.mode-switch button').forEach((btn)=>btn.addEventListener('click',()=>{
  $$('.mode-switch button').forEach((b)=>b.classList.toggle('active',b===btn)); mode=btn.dataset.mode;
  if(current) analyze(current.evidence.point.lat,current.evidence.point.lng);
}));
function $$(s){ return [...document.querySelectorAll(s)]; }

$('#ask-form').addEventListener('submit',async(ev)=>{
  ev.preventDefault(); if(!current) return; const question=els.question.value.trim(); if(!question) return;
  els.answer.textContent='Val is reading the evidence…'; els.answer.classList.remove('hidden');
  try{
    const res=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,evidence:current.evidence,mode})});
    const data=await res.json(); if(!res.ok) throw new Error(data.error||'Val failed');
    els.answer.textContent=`${data.answer}${data.ai?`\n\nAI: ${data.model}`:'\n\nEvidence-only mode'}`;
  }catch(err){ els.answer.textContent=`Val failed cleanly instead of inventing an answer: ${err.message}`; }
});
$$('.quick-asks button').forEach((b)=>b.addEventListener('click',()=>{els.question.value=b.dataset.q; $('#ask-form').requestSubmit();}));

$('#search-form').addEventListener('submit',async(ev)=>{
  ev.preventDefault(); const q=els.search.value.trim(); if(q.length<3) return;
  els.searchResults.innerHTML='<button class="search-result"><b>Searching Charleston…</b></button>'; els.searchResults.classList.remove('hidden');
  try{
    const res=await fetch(`/api/geocode?q=${encodeURIComponent(q)}`); const data=await res.json(); if(!res.ok) throw new Error(data.error||'Search failed');
    els.searchResults.innerHTML=(data.results||[]).map((r,i)=>`<button type="button" class="search-result" data-i="${i}"><b>${escapeHtml(r.address)}</b><small>City locator score ${Math.round(r.score||0)}</small></button>`).join('') || '<button class="search-result"><b>No city matches.</b></button>';
    $$('.search-result[data-i]').forEach((btn)=>btn.addEventListener('click',()=>{ const r=data.results[Number(btn.dataset.i)]; els.searchResults.classList.add('hidden'); els.search.value=r.address; analyze(r.location.y,r.location.x,{fly:true}); }));
  }catch(err){ els.searchResults.innerHTML=`<button class="search-result"><b>${escapeHtml(err.message)}</b></button>`; }
});

document.addEventListener('click',(ev)=>{ if(!ev.target.closest('.search')) els.searchResults.classList.add('hidden'); });
