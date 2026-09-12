import { collectEvidence } from '../lib/gis.js';
import { deterministicBrief, scoreEvidence } from '../lib/scoring.js';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'GET required' });
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const mode = ['business', 'realestate', 'development'].includes(req.query.mode) ? req.query.mode : 'business';
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json(res, 400, { error: 'lat and lng are required numbers' });
  if (lat < 32.4 || lat > 33.3 || lng < -80.5 || lng > -79.4) return json(res, 400, { error: 'VAL GEO Charleston currently supports the Charleston region.' });
  try {
    const evidence = await collectEvidence(lat, lng);
    const scoring = scoreEvidence(evidence, mode);
    return json(res, 200, { evidence, scoring, brief: deterministicBrief(evidence, scoring) });
  } catch (err) {
    return json(res, 502, { error: 'Location intelligence failed', detail: err?.message || String(err) });
  }
}
