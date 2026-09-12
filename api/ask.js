import { compactEvidence } from '../lib/gis.js';
import { deterministicBrief, scoreEvidence } from '../lib/scoring.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-terra';

function fallbackAnswer(question, evidence, scoring) {
  const brief = deterministicBrief(evidence, scoring);
  return `${brief}\n\nQuestion: ${question}\n\nOpenAI is not configured on this deployment, so VAL GEO is returning the evidence-only briefing instead of inventing an answer.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  const { question, evidence, mode = 'business' } = req.body || {};
  if (!question || !evidence?.point) return res.status(400).json({ error: 'question and evidence are required' });
  const scoring = scoreEvidence(evidence, mode);
  if (!process.env.OPENAI_API_KEY) return res.status(200).json({ answer: fallbackAnswer(question, evidence, scoring), ai: false, model: null });

  const system = `You are Val Geo, an evidence-disciplined Charleston location-intelligence analyst. Answer only from the supplied evidence unless you clearly label a statement as general interpretation. Never invent zoning rights, permit status, flood determination, property economics, demographics, foot traffic, or legal conclusions. Distinguish fact from inference. Cite evidence by source label in parentheses, e.g. (Base zoning), (FEMA flood layer). When data is missing, say unavailable. Be concise, decisive, and useful.`;
  const input = `MODE: ${mode}\nQUESTION: ${question}\nLOCATION EVIDENCE:\n${JSON.stringify(compactEvidence(evidence), null, 2)}\nSCORING:\n${JSON.stringify(scoring, null, 2)}`;
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, instructions: system, input, reasoning: { effort: 'medium' }, max_output_tokens: 1800 })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `OpenAI ${response.status}`);
    const text = data.output_text || (data.output || []).flatMap((x) => x.content || []).find((x) => x.type === 'output_text')?.text;
    res.status(200).json({ answer: text || fallbackAnswer(question, evidence, scoring), ai: Boolean(text), model: MODEL });
  } catch (err) {
    res.status(200).json({ answer: fallbackAnswer(question, evidence, scoring), ai: false, model: MODEL, warning: err?.message || String(err) });
  }
}
