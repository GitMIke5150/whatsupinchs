const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const props = (e, key) => e.layers?.[key]?.data?.features?.[0]?.properties || {};
const stringValues = (o) => Object.values(o || {}).filter((v) => typeof v === 'string').join(' | ').toLowerCase();

function floodComponent(e) {
  const text = stringValues(props(e, 'flood'));
  if (!text) return { score: 55, label: 'Unknown', reason: 'No flood polygon returned at the selected point.' };
  if (text.includes('minimal flood')) return { score: 92, label: 'Lower mapped hazard', reason: 'City FEMA layer reports an area of minimal flood hazard.' };
  if (text.includes('0.2%')) return { score: 70, label: 'Moderate mapped hazard', reason: 'City FEMA layer reports a 0.2% annual-chance flood hazard.' };
  if (text.includes('1%') || text.includes('floodway')) return { score: 25, label: 'Elevated mapped hazard', reason: 'City FEMA layer reports a 1% annual-chance hazard or regulatory floodway.' };
  if (text.includes('open water')) return { score: 5, label: 'Open water', reason: 'Selected point is mapped as open water.' };
  return { score: 50, label: 'Mapped', reason: 'A FEMA polygon was returned; inspect the evidence card for classification.' };
}

function zoningComponent(e, mode) {
  const z = props(e, 'zoning');
  const text = stringValues(z);
  if (!text) return { score: 45, label: 'Unknown', reason: 'No base-zoning polygon returned.' };
  const flexible = /gb|lb|ct|mu-|uc|go|ro|pud|commercial|business|mixed/.test(text);
  const residential = /sr-|dr-|rr-|residential/.test(text);
  if (mode === 'business') {
    if (flexible) return { score: 88, label: 'Potentially flexible', reason: 'The zoning code appears commercial/mixed-use oriented. Use regulations for permitted-use confirmation.' };
    if (residential) return { score: 38, label: 'Likely constrained', reason: 'The base-zoning code appears primarily residential.' };
  }
  if (mode === 'development') {
    if (flexible) return { score: 82, label: 'Potentially flexible', reason: 'Commercial/mixed-use zoning can broaden development scenarios, subject to district rules.' };
  }
  return { score: 62, label: 'Mapped', reason: 'Base zoning is available; score is neutral until a specific use is tested.' };
}

function momentumComponent(e) {
  const permits = e.layers?.activePermits?.count || 0;
  const development = e.layers?.newDevelopments?.count || 0;
  const construction = e.layers?.newConstruction?.count || 0;
  const raw = 35 + Math.min(25, permits * 2) + Math.min(20, development * 4) + Math.min(20, construction * 2);
  return {
    score: clamp(raw), label: raw >= 75 ? 'Strong activity' : raw >= 55 ? 'Active' : 'Limited signal',
    reason: `${permits} active permit feature(s), ${development} development feature(s), ${construction} recent-construction feature(s) returned in the configured radii.`
  };
}

function accessComponent(e) {
  const parking = e.layers?.parking?.count || 0;
  const transit = e.layers?.transit?.count || 0;
  const places = e.places?.length || 0;
  const raw = 35 + Math.min(20, parking * 2) + Math.min(20, transit * 4) + Math.min(25, places / 2);
  return { score: clamp(raw), label: raw >= 75 ? 'Strong access/activity' : raw >= 55 ? 'Moderate' : 'Thin data', reason: `${parking} parking feature(s), ${transit} transit stop(s), ${places} named nearby place(s) returned.` };
}

function constraintComponent(e) {
  const historic = e.layers?.historic?.count > 0;
  const flood = floodComponent(e);
  let score = 90;
  const reasons = [];
  if (historic) { score -= 22; reasons.push('historic-district review may add design/approval constraints'); }
  if (flood.score < 50) { score -= 28; reasons.push('mapped flood hazard is elevated'); }
  else if (flood.score < 75) { score -= 12; reasons.push('mapped flood hazard deserves additional diligence'); }
  if (!reasons.length) reasons.push('no major historic/flood constraint was detected in the queried layers');
  return { score: clamp(score), label: score >= 75 ? 'Lower constraint signal' : score >= 50 ? 'Moderate constraints' : 'Higher constraints', reason: reasons.join('; ') + '.' };
}

function evidenceComponent(e) {
  const layers = Object.values(e.layers || {});
  const ok = layers.filter((x) => x.ok).length;
  const ratio = layers.length ? ok / layers.length : 0;
  return { score: Math.round(ratio * 100), label: `${ok}/${layers.length} feeds`, reason: `${ok} of ${layers.length} configured GIS layers responded successfully.` };
}

export function scoreEvidence(e, mode = 'business') {
  const components = {
    zoning: zoningComponent(e, mode),
    flood: floodComponent(e),
    momentum: momentumComponent(e),
    access: accessComponent(e),
    constraints: constraintComponent(e),
    evidence: evidenceComponent(e)
  };
  const weightsByMode = {
    business: { zoning: .22, flood: .08, momentum: .24, access: .24, constraints: .12, evidence: .10 },
    realestate: { zoning: .16, flood: .22, momentum: .15, access: .12, constraints: .22, evidence: .13 },
    development: { zoning: .23, flood: .15, momentum: .22, access: .12, constraints: .18, evidence: .10 }
  };
  const weights = weightsByMode[mode] || weightsByMode.business;
  const score = Math.round(Object.entries(weights).reduce((sum, [k, w]) => sum + components[k].score * w, 0));
  return {
    score: clamp(score),
    mode,
    title: 'Location Signal Score',
    disclaimer: 'Context signal only — not a valuation, zoning opinion, engineering determination, investment recommendation, or permit approval.',
    components
  };
}

export function deterministicBrief(e, scoring) {
  const zone = props(e, 'zoning');
  const future = props(e, 'futureLandUse');
  const property = props(e, 'property');
  const historic = e.layers?.historic?.count > 0;
  const lines = [];
  lines.push(`${e.address?.address || `${e.point.lat.toFixed(5)}, ${e.point.lng.toFixed(5)}`} has a ${scoring.score}/100 ${scoring.title.toLowerCase()} in ${scoring.mode} mode.`);
  const zoneCode = zone.ZONE_BASE || zone.ZONING || zone.Zone || zone.zone;
  if (zoneCode) lines.push(`Base zoning returned: ${zoneCode}.`);
  const landUse = future.LAND_USE || future.Name;
  if (landUse) lines.push(`Future land use returned: ${landUse}.`);
  if (historic) lines.push('The selected point intersects the City’s Old & Historic District layer, so design/review constraints deserve explicit diligence.');
  lines.push(scoring.components.flood.reason);
  lines.push(scoring.components.momentum.reason);
  if (property.TMS || property.PARCELID || property.SALE_PRICE || property.APPRVAL) lines.push('City property data is available for this point; inspect the property card before relying on any economics.');
  if (e.failures?.length) lines.push(`${e.failures.length} source(s) failed and are shown as unavailable rather than guessed.`);
  return lines.join(' ');
}
