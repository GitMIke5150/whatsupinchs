import { forwardGeocode } from '../lib/gis.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ error: 'Enter at least 3 characters.' });
  try {
    const results = await forwardGeocode(q);
    res.status(200).json({ results });
  } catch (err) {
    res.status(502).json({ error: 'Address search unavailable', detail: err?.message || String(err) });
  }
}
