/* POST /api/generate — AI Studio on any host, no Chromium needed.
   The visitor's prompt is turned into a brand-new playable pack:
     1. LLM plans the video (title, scenes, timed narration lines)
     2. LLM writes each scene body (deterministic Hyperframes code)
     3. Every body is validated + auto-repaired; safe fallback layout last
     4. Scenes are assembled from the embedded shell + engine (self-contained)
     5. Optional TTS narration via the configured OpenAI-compatible speech API
        (embedded as base64 WAV; silently skipped if unavailable)
   The pack JSON is returned directly and stored in the visitor's browser
   (IndexedDB) — playback and MP4 export then happen 100% client-side.
   LLM transport: LLM_API_KEY/LLM_BASE_URL/LLM_MODEL env config first, then
   the keyless z-ai SDK where its config exists (sandbox / local companion). */
import { readJson } from '../lib/tutor.mjs';
import {
  PLAN_SYS, sceneSystemCompact, extractJSON, normalizePlan, cleanCode,
  validateBody, fallbackBody, assemble, autoplayOff, slugify, stamp,
} from '../lib/studio_core.mjs';

export const maxDuration = 60;

const LLM_KEY = process.env.LLM_API_KEY || '';
const LLM_BASE = (process.env.LLM_BASE_URL || '').replace(/\/+$/, '');
const LLM_MODEL = process.env.LLM_MODEL || 'glm-4.6';
const TTS_MODEL = process.env.LLM_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const TTS_VOICE = process.env.LLM_TTS_VOICE || 'tara';

async function llmViaEnv(messages, maxTokens) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(LLM_BASE + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 Authorization: 'Bearer ' + LLM_KEY },
      body: JSON.stringify({ model: LLM_MODEL, temperature: 0.4,
        max_tokens: maxTokens || 2200, messages }),
    });
    if (res.status === 429 && attempt === 1) {
      await new Promise(r => setTimeout(r, 6000));   // tight TPM windows reset fast
      continue;
    }
    if (!res.ok) throw new Error('LLM HTTP ' + res.status + ': ' +
      (await res.text()).slice(0, 200));
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (!text.trim()) throw new Error('empty LLM response');
    return text;
  }
  throw new Error('LLM rate-limited');
}

async function llmViaSdk(messages) {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const client = await ZAI.create();
  // convention (same as glm_server): the system prompt rides as an 'assistant' message
  const completion = await client.chat.completions.create({
    messages, thinking: { type: 'disabled' },
  });
  const text = completion.choices?.[0]?.message?.content || '';
  if (!text.trim()) throw new Error('empty response from model');
  return text;
}

function makeLlm(log) {
  if (LLM_KEY && LLM_BASE) {
    log('AI transport: env key (' + LLM_MODEL + ')');
    return llmViaEnv;
  }
  log('AI transport: keyless SDK');
  return llmViaSdk;
}

/* optional narration speech — only attempted when an env API is configured
   and there is time budget left inside the 60 s serverless window */
let ttsVoiceOk = null;   // remembered across clips within one request
async function ttsLine(text, voices) {
  const tried = [];
  for (const v of (ttsVoiceOk ? [ttsVoiceOk] : voices)) {
    const res = await fetch(LLM_BASE + '/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 Authorization: 'Bearer ' + LLM_KEY },
      body: JSON.stringify({ model: TTS_MODEL, input: text,
                             voice: v, response_format: 'wav' }),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length >= 2000) { ttsVoiceOk = v; return buf.toString('base64'); }
      tried.push(v + ': tiny wav ' + buf.length + 'B');
      continue;
    }
    tried.push(v + ': HTTP ' + res.status + ' ' +
      (await res.text()).slice(0, 160));
  }
  throw new Error('TTS failed — ' + tried.join(' | '));
}

export default async function handler(req, res) {
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'POST only' });
  const body = await readJson(req);
  const prompt = String(body.prompt || '').trim();
  if (prompt.length < 8)
    return res.status(400).json({ error: 'prompt is required (min 8 chars)' });
  const nScenes = Math.max(2, Math.min(3, +body.scenes || 2)); // 60 s budget
  const started = Date.now();
  const logLines = [];
  const log = m => logLines.push(m);

  try {
    const llm = makeLlm(log);

    /* 1 — plan (2 attempts) */
    log('planning the video…');
    let plan = null, lastPlanErr = null;
    for (let attempt = 1; attempt <= 2 && !plan; attempt++) {
      try {
        const txt = await llm([
          { role: 'assistant', content: PLAN_SYS },
          { role: 'user', content:
            `Viewer prompt: "${prompt}"\nMake a plan with exactly ${nScenes} scenes. ` +
            `Keep each scene's visual field under 40 words and use 5-6 narration lines. ` +
            `Output the JSON as ONE single line (no line breaks anywhere).` },
        ], 2800);
        plan = normalizePlan(extractJSON(txt), nScenes);
      } catch (e) { lastPlanErr = e; log(`plan attempt ${attempt} failed: ${e.message}`); }
    }
    if (!plan) throw new Error('could not get a valid plan: ' +
      (lastPlanErr && lastPlanErr.message || 'unknown'));
    const totalDur = plan.scenes.reduce((a, s) => a + s.dur, 0);
    log(`plan ok: "${plan.title}" — ${plan.scenes.length} scenes, ${totalDur}s`);

    /* 2 — write + validate each scene body */
    const scenes = [];
    for (let i = 0; i < plan.scenes.length; i++) {
      const sc = plan.scenes[i];
      log(`writing scene ${i + 1}/${plan.scenes.length}: ${sc.title}…`);
      const user = `Video plan (JSON):\n${JSON.stringify({ title: plan.title, scenes: plan.scenes })}\n\n` +
        `Write the SCENE BODY for scene ${i + 1}: "${sc.chapter} — ${sc.title}" ` +
        `(dur ${sc.dur}s, accent ${sc.accent}). Its DATA.narr is: ${JSON.stringify(sc.narr)}\n` +
        `Visual beats: ${sc.visual || '(you decide, following the narration)'}`;
      let body = null, err = null;
      for (let attempt = 1; attempt <= 2 && !body; attempt++) {
        try {
          const code = await llm([
            { role: 'assistant', content: sceneSystemCompact() },
            { role: 'user', content: attempt === 1 ? user : user +
              `\n\nYour previous attempt was rejected: ${err}. Fix it and output the full body again.` },
          ], 2200);
          const clean = cleanCode(code);
          err = validateBody(clean);
          if (err) { log(`scene ${i + 1} attempt ${attempt}: ${err}`); continue; }
          body = clean;
        } catch (e) { err = e.message; log(`scene ${i + 1} attempt ${attempt}: ${e.message}`); }
      }
      if (!body) { log(`scene ${i + 1}: using built-in fallback layout`); body = fallbackBody(sc); }
      scenes.push({ sc, body });
    }

    /* 3 — assemble self-contained scene html */
    log('assembling scenes…');
    const pack = {
      slug: slugify(prompt.split(/\s+/).slice(0, 3).join(' ')) + '-' + stamp(),
      title: plan.title,
      tagline: plan.tagline || 'AI-generated with Hyperframes Studio',
      generated: true, origin: 'serverless',
      total: totalDur, scenes: [],
    };
    scenes.forEach(({ sc, body }, i) => {
      const folder = 's' + String(i + 1).padStart(2, '0') + '_' + sc.name;
      const html = autoplayOff(assemble(sc.dur, sc.chapter, sc.title, sc.narr, body));
      const start = scenes.slice(0, i).reduce((a, s) => a + s.sc.dur, 0);
      pack.scenes.push({ folder, title: sc.chapter + ' — ' + sc.title,
                         short: sc.title, dur: sc.dur,
                         start, end: start + sc.dur, html, audio: [] });
    });

    /* 4 — optional narration speech (env tier only, guarded by time budget) */
    if (LLM_KEY && LLM_BASE) {
      const clipList = [];
      for (let i = 0; i < scenes.length; i++) {
        const sc = scenes[i].sc;
        for (const [t0, w, txt] of sc.narr.slice(0, 7)) clipList.push({ si: i, t0, w, txt });
      }
      if (Date.now() - started < 25000) {
        log('generating narration speech (' + clipList.length + ' clips)…');
        let ok = 0;
        for (const c of clipList) {
          if (Date.now() - started > 48000) { log('time budget reached — remaining lines stay caption-only'); break; }
          try {
            const b64 = await ttsLine(c.txt.slice(0, 220),
              [TTS_VOICE, 'tara', 'leah', 'Fritz-PlayAI'].filter(Boolean));
            pack.scenes[c.si].audio.push({ t0: c.t0, dur: c.w, b64 });
            ok++;
          } catch (e) { log(`tts skipped one line: ${String(e.message).slice(0, 220)}`); }
        }
        log(`narration audio: ${ok}/${clipList.length} clips`);
      } else {
        log('skipping narration speech (time budget) — captions carry the words');
      }
    } else {
      log('no speech API configured — narration stays as burned-in captions');
    }

    log(`pack ready: ${pack.scenes.length} scenes, ${pack.total}s`);
    return res.status(200).json({ ok: true, pack, log: logLines });
  } catch (e) {
    return res.status(502).json({ error: String(e && e.message || e), log: logLines });
  }
}
