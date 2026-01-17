// Simple local proxy for Anthropic Messages API
// Security: keep your API key in environment variable ANTHROPIC_API_KEY
// Usage:
//   ANTHROPIC_API_KEY=xxxx npm start

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
app.use(express.json({ limit: '1mb' }));

app.post('/api/chat', async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY in environment' });
    }

    const {
      question,
      signals = {},
      context_summary = [],
      recent_updates = [],
      current_recommendation = {},
      history = [],
      systemPrompt = "You are DECIDE, an ops decision assistant. Use only provided inputs. Do not invent facts. If missing info, say what's missing. Answer briefly (≤25 words). Return strict JSON with keys: answer (string), new_signals (object, optional), severity_delta (number, optional), confidence (string)."
    } = req.body || {};

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing question' });
    }

    const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest';
    const version = process.env.ANTHROPIC_VERSION || '2023-06-01';
    const url = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1/messages';

    const body = {
      model,
      max_tokens: 160,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: `You must respond ONLY with a single JSON object: {"answer": string, "new_signals": object?, "severity_delta": number?, "confidence": string}.` },
            { type: 'text', text: `Current signals: ${JSON.stringify(signals)}.` },
            { type: 'text', text: `Live context summary: ${JSON.stringify(context_summary)}.` },
            { type: 'text', text: `Recent updates: ${JSON.stringify(recent_updates)}.` },
            { type: 'text', text: `Current recommendation: ${JSON.stringify(current_recommendation)}.` },
            { type: 'text', text: `Last Q/A turns: ${JSON.stringify(history)}.` },
            { type: 'text', text: `Question: ${question}` },
          ],
        },
      ],
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': version,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return res.status(r.status).json({ error: 'Upstream error', detail: txt });
    }

    const data = await r.json();
    const raw = data?.content?.[0]?.text?.trim() || '';
    // Try to parse JSON strictly
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Try to extract JSON substring
      const match = raw.match(/\{[\s\S]*\}$/);
      if (match) {
        try { parsed = JSON.parse(match[0]); } catch {}
      }
    }
    if (!parsed || typeof parsed.answer !== 'string') {
      return res.status(502).json({ error: 'Bad AI response', raw });
    }
    return res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Proxy error' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`DECIDE proxy listening on http://localhost:${PORT}`);
});
