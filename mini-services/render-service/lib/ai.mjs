/* ai.mjs — light AI endpoints for the Lumen flow: research (LLM outline),
   edit (LLM ops) and tts (Deepgram Aura-2 with a key → z-ai built-in).
   Mirrors the Next.js /api/ai/* contract so the same frontend works against
   either the standalone service or the embedded routes. */
let _zai = null;
async function zai() {
  if (!_zai) {
    const mod = await import('z-ai-web-dev-sdk');
    _zai = await mod.default.create();
  }
  return _zai;
}

const AURA = /^aura(-2)?-[a-z]+-en$/i;

function extractJSON(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(cleaned); } catch { /* keep trying */ }
  const s = cleaned.indexOf('{');
  const e = cleaned.lastIndexOf('}');
  if (s >= 0 && e > s) { try { return JSON.parse(cleaned.slice(s, e + 1)); } catch { return null; } }
  return null;
}

async function llm(system, user, ms = 90_000) {
  const z = await zai();
  const completion = await Promise.race([
    z.chat.completions.create({
      messages: [{ role: 'assistant', content: system }, { role: 'user', content: user }],
      thinking: { type: 'disabled' },
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('llm timeout')), ms)),
  ]);
  return completion.choices[0]?.message?.content || '';
}

/* ---------- research ---------- */
export async function aiResearch(body) {
  const topic = String(body.topic || '').slice(0, 600).trim();
  const audience = String(body.audience || 'General viewers').slice(0, 60);
  const length = Math.max(30, Math.min(600, +body.length || 120));
  if (!topic) throw Object.assign(new Error('topic required'), { status: 400 });
  const n = Math.max(3, Math.min(8, Math.round(length / 25)));
  const system = `You are Lumen, a meticulous video research assistant. You plan short narrated explainer videos.
Reply with STRICT JSON only — no markdown, no commentary. Shape:
{"title":"...","scenes":[{"title":"...","text":"..."} × ${n}],"claims":[{"txt":"...","conf":"High|Medium|Low"} × ${n}],"srcs":[["source type","used in scenes 1–2"],...]}
Rules:
- scenes: a hook, the core ideas in a logical order, one concrete everyday example, a recap. Titles ≤ 6 words.
- text is SPOKEN NARRATION for one scene: 2–3 short sentences, ≤ 45 words, plain language, no stage directions, no lists, no emojis.
- claims: one factual claim per scene with your honest confidence.
- srcs: 4–5 [source type, where used] pairs describing the KINDS of sources to verify against (no fake URLs).`;
  const user = `Topic: ${topic}\nTarget length: ${length} seconds total (~${Math.round(length / n)}s per scene)\nAudience: ${audience}`;
  const parsed = extractJSON(await llm(system, user));
  if (!parsed || !Array.isArray(parsed.scenes) || !parsed.scenes.length) {
    throw Object.assign(new Error('unparseable research result'), { status: 502 });
  }
  return {
    ok: true,
    title: String(parsed.title || topic).slice(0, 80),
    scenes: parsed.scenes.slice(0, 10).map(s => ({ title: String(s.title || 'Scene').slice(0, 80), text: String(s.text || '').slice(0, 600) })),
    claims: Array.isArray(parsed.claims) ? parsed.claims.slice(0, 10).map(c => ({ txt: String(c.txt || '').slice(0, 200), conf: ['High', 'Medium', 'Low'].includes(String(c.conf)) ? c.conf : 'Medium' })) : [],
    srcs: Array.isArray(parsed.srcs) ? parsed.srcs.slice(0, 6).map(s => [String(s[0] || '').slice(0, 90), String(s[1] || '').slice(0, 60)]) : [],
    provider: 'z-ai-llm',
  };
}

/* ---------- edit ---------- */
export async function aiEdit(body) {
  const q = String(body.q || '').slice(0, 400).trim();
  if (!q) throw Object.assign(new Error('q required'), { status: 400 });
  const scenes = Array.isArray(body.scenes) ? body.scenes.slice(0, 30) : [];
  const assets = Array.isArray(body.assets) ? body.assets.slice(0, 20) : [];
  const idx = Math.max(0, Math.min(scenes.length - 1, +body.idx || 0));
  const system = `You are the editing brain of a video studio. You receive the current project and one user request, and reply with STRICT JSON only:
{"ops":[...],"reply":"one short sentence"}
Allowed ops (apply ONLY what the request needs — usually 1-2 ops):
{"op":"setScene","i":<0-based>,"patch":{"title":"...","text":"...","dur":<seconds>}}
{"op":"addScene","i":<insert at 0-based index>,"scene":{"title":"...","text":"2-3 short spoken sentences","dur":<seconds>,"bg":""}}
{"op":"removeScene","i":<0-based>}
{"op":"fitAll"}
{"op":"setStyle","name":"<exact style name from the list>"}
{"op":"setVoice","voice":"<exact voice id from the list>"}
{"op":"setMusic","assetId":"<id>"}
{"op":"setLogo","assetId":"<id>"}
{"op":"setBg","i":<0-based>,"assetId":"<id>"}
Rules:
- narration "text" is spoken: 2-3 short sentences, ≤ 45 words, no stage directions.
- use the user's language for text/reply (default English).
- only reference styles/voices/assets that exist in the provided lists.
- "reply" describes exactly what you changed.`;
  const user = `Current style: ${String(body.style || '')}
Current voice: ${String(body.voice || '')}
Currently selected scene index: ${idx}
Scenes: ${JSON.stringify(scenes.map((s, i) => ({ i, title: s.title, dur: s.dur, text: String(s.text || '').slice(0, 220) })))}
Assets: ${JSON.stringify(assets.map(a => ({ id: a.id, name: a.name, desc: a.desc, type: a.type })))}
Request: ${q}`;
  const parsed = extractJSON(await llm(system, user, 60_000));
  if (!parsed || !Array.isArray(parsed.ops) || !parsed.ops.length) {
    throw Object.assign(new Error('unparseable edit result'), { status: 502 });
  }
  return { ok: true, ops: parsed.ops.slice(0, 40), reply: String(parsed.reply || 'Done.').slice(0, 220), provider: 'z-ai-llm' };
}

/* ---------- tts (one clip) ---------- */
const ttsCache = new Map(); // key → {buf, provider, voice, mime}
export async function aiTts(body) {
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (!text) throw Object.assign(new Error('text required'), { status: 400 });
  const voice = String(body.voice || 'jam');
  const key = String(body.key || process.env.DEEPGRAM_API_KEY || '').trim();
  const ck = `${voice}:${text}`;
  if (ttsCache.has(ck)) return ttsCache.get(ck);

  /* 1 · Deepgram Aura-2 (natural English — needs a key) */
  if (key && (AURA.test(voice) || voice.startsWith('aura'))) {
    try {
      const model = AURA.test(voice) ? voice : 'aura-2-thalia-en';
      const r = await fetch(`https://api.deepgram.com/v1/speak?model=${model}&encoding=mp3`, {
        method: 'POST',
        headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 800) {
          const entry = { buf, provider: 'deepgram', voice: model, mime: 'audio/mpeg' };
          if (ttsCache.size > 60) ttsCache.clear();
          ttsCache.set(ck, entry);
          return entry;
        }
      } else {
        const detail = (await r.text().catch(() => '')).slice(0, 160);
        throw Object.assign(new Error(`deepgram ${r.status}: ${detail || 'rejected'}`), { status: r.status === 401 || r.status === 403 ? 401 : r.status === 429 ? 429 : r.status === 402 ? 402 : 502 });
      }
    } catch (e) {
      if (e && e.status) throw e; /* surface deepgram auth/credit errors */
      /* else fall through to z-ai */
    }
  }

  /* 2 · built-in z.ai voice (this backend serves wav, not mp3) */
  const z = await zai();
  const res = await z.audio.tts.create({ input: text, voice: 'jam', speed: 1.0, response_format: 'wav', stream: false });
  const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()));
  if (buf.length < 800) throw Object.assign(new Error('tts returned suspiciously small audio'), { status: 502 });
  const entry = { buf, provider: 'z-ai', voice: 'jam', mime: 'audio/wav' };
  if (ttsCache.size > 60) ttsCache.clear();
  ttsCache.set(ck, entry);
  return entry;
}
