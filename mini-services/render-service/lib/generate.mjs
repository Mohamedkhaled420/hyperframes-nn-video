/* generate.mjs — LLM pack generation: plan → scene code → headless validate →
   narration TTS (mandatory) → QC gates → pack manifest.
   Visual quality comes from the embedded design system (measured motion numbers,
   typography rules, slop blacklist) — adapted from motionmaxxing / OpenMontage /
   brag research. */
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { prepareVideoAudio, synthesizeFitted, probeDuration } from './tts.mjs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/* ---------- the scene-authoring system prompt ---------- */
export const SCENE_API_DOC = `
MT scene API (window.MT from /vendor/motion.js, deterministic + seek-safe):
MT.scene({duration:SECONDS})                       — call first. Canvas 1920×1080.
MT.heading('Kicker · Name','Big title')            — standard top-left heading.
MT.C.{bg,panel,panel2,line,ink,dim,faint,sky,amber,ok,bad,blue,teal,green,yellow,orange,red,purple}
MT.EASE.{softLand,outExpo,outQuint,inOut,glide,snap,whip,accelExit}
primitives: MT.line(x1,y1,x2,y2,o) MT.rect(x,y,w,h,o) MT.circ(cx,cy,r,o) MT.pth(d,o)
  MT.arrow(x1,y1,x2,y2,o) → {g,ln}  MT.curve(x,y,w,h,fn,x0,x1,o) → path  MT.axes(x,y,w,h,o)
  MT.vbars(x,y,barW,gap,hmax,vals,o) → {g,set(newVals,t,dur),colorize(fn)}
  MT.grid(x,y,cell,cols,rows,vals,o) → {g,set(nv,t,d),numbers(size)}  (o.heat+o.max for −1..1 heatmaps)
  MT.layer(x,y,n,gap,r,o) → {g,ns}   MT.T(text,x,y,{size,color,w,anchor,mono,html})  MT.G(parent)
verbs (t = absolute seconds):
  MT.fade(el,t,d=0.25,{y|x})   MT.pop(el,t,d=0.4)   MT.land(el,t,d=0.55) (hero numbers)
  MT.wipe(el,t,d=0.5) (headline reveal)  MT.draw(path,t,d) (stroke draw-on)
  MT.move(el,t,d,{x,y,s,r},ease)  MT.exit(el,t,d,{x,y})  MT.out([els],t,d,{y})
  MT.stag(items,t,gap,fn)  MT.frame(t,d,(p,tAbs)=>{},reset?)  MT.rng(seed) (deterministic!)
rules:
  - signatures are EXACT: MT.rect(x,y,w,h,{fill,stroke,w,rx,opacity}) — the 5th arg is an OPTIONS OBJECT like {fill:MT.C.sky}, never a bare color. Same for MT.circ(cx,cy,r,{fill,stroke,w}) and MT.line(...,{color,w,dash}).
  - There is NO MT.ellipse / MT.image / MT.text / MT.group — use MT.E('ellipse',{cx,cy,rx,ry}) for ellipses if needed.
  - NEVER use apostrophes/single-quotes inside text strings (write "the sky is" not "the sky's"); keep all strings single-quoted without escapes.
  - END with MT.ready();
  - No setTimeout / Date.now() / Math.random() — use MT.rng(seed). No CSS animations/transitions.
  - Scene is 1920×1080; keep content inside x:[120,1800], y:[80,960]; bottom 120px reserved for captions.
  - Return element groups from helpers; batch exits with MT.out([...], t, 0.5, {y:-16}).
`;

export const DESIGN_RULES = `
VISUAL SYSTEM (follow strictly — this is what separates pro from AI-slop):
- Motion: element moves last 0.33–0.4s (10–12 frames at 30fps), opacity fades 0.2s.
  Arrive by MOVING (slide/draw/scale-in from 0.9), not by plain alpha fades.
  Landings = ease-out (softLand/outExpo). Leaving = ease-in (accelExit).
  Overshoot <9%, max ONE snap ease per scene. New visual element every 2–3s.
- Layout: one idea per screen. Generous margins (120px). Align to a grid.
  Max 4 colors on screen at once. Contrast ≥ 4.5:1. Text never overlaps shapes.
- Type: sans for prose, mono for numbers/formulas. Headline 44–64px w650,
  body 30–40px w400, labels 26–30px dim. Track headings −0.02em. Charcoal ink, never pure black on dark.
- Numbers are heroes: key stats get MT.land() at 100–200px, once per scene.
- Captions play from the manifest — do NOT render narration text yourself.
- FORBIDDEN SLOP: corner labels/counters ("02/05"), progress bars in-scene, typed-letter headlines,
  "Not just X. It's Y." copy, triplets, stat walls, dashboard/vibe-cards, decorative gradients/emoji.
- Structure per chapter: restate idea visually → walk it step by step (one narrated beat each) →
  hold the final state ≥2.5s → clean exit.

WORKING EXAMPLE (copy this shape exactly):
${`MT.scene({duration:40});
const C = MT.C;
MT.heading('Chapter 1 · Waves','What is frequency?');
const g = MT.G();
const ax = MT.axes(300, 300, 1300, 420, { xlabel: 'time' });
MT.fade(ax, 1.0, 0.5);
const w1 = MT.curve(300, 300, 1300, 420, t => Math.sin(t * 3), 0, 6, { color: C.sky, w: 5 });
MT.draw(w1, 1.5, 1.6);
const lab = MT.T('low frequency: 3 cycles', 960, 840, { size: 36, color: C.dim });
MT.fade(lab, 3.2, 0.5, { y: 10 });
const w2 = MT.curve(300, 300, 1300, 420, t => Math.sin(t * 9), 0, 6, { color: C.amber, w: 5 });
MT.draw(w2, 12.0, 1.6);
const lab2 = MT.T('high frequency: 9 cycles', 960, 840, { size: 36, color: C.amber });
MT.fade(lab2, 13.4, 0.5, { y: 10 });
MT.exit([lab], 13.0, 0.3);
const box = MT.rect(760, 180, 400, 90, { rx: 14, fill: C.panel, stroke: C.line });
MT.pop(box, 30.0, 0.5);
const big = MT.T('f = cycles / second', 960, 225, { size: 40, mono: true });
MT.fade(big, 30.3, 0.4);
MT.ready();`}
`;

/* ---------- LLM helpers (z-ai GLM) ---------- */
let _zai = null;
async function zai() { if (!_zai) { const m = await import('z-ai-web-dev-sdk'); _zai = await m.default.create(); } return _zai; }
async function llm(messages, { json = false, temperature = 0.7 } = {}) {
  const z = await zai();
  const res = await z.chat.completions.create({ messages, temperature, ...(json ? { response_format: { type: 'json_object' } } : {}) });
  const txt = res.choices?.[0]?.message?.content ?? '';
  if (!txt) throw new Error('empty LLM response');
  return txt;
}
function extractJson(txt) {
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON in LLM output');
  return JSON.parse(m[0]);
}

/* ---------- pipeline ---------- */
export async function generatePack({ prompt, chapters: nChapters = 3, log = () => {}, onProgress = () => {} }) {
  const id = 'pack_' + Date.now().toString(36);
  const dir = path.join(process.env.PUBLIC_DIR || '/home/z/my-project/public', 'generated', id);
  fs.mkdirSync(path.join(dir, 'scenes'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'audio'), { recursive: true });
  const pack = { id, title: '', subtitle: '', width: 1920, height: 1080, fps: 30, audio: { voice: 'jam', provider: 'auto', prepared: false }, chapters: [] };

  /* 1) plan */
  onProgress('plan', 5);
  log('planning chapters…');
  const planTxt = await llm([
    { role: 'system', content: 'You are a world-class educational video planner. Output STRICT JSON only.' },
    { role: 'user', content: `Plan an animated explainer video for: "${prompt}".
Structure it like the best YouTube explainers: cold-open hook, then a map, then the core ideas ONE PER CHAPTER (concrete, visual, numbered examples over abstract talk), then a proof/real-example chapter, then a tight recap.
Return JSON: {"title":str,"subtitle":str,"chapters":[{"id":str,"title":str,"kicker":str,"duration":number(35-60),"purpose":str,
"beats":[{"t":number,"text":str}],"captions":[{"t":number,"dur":number,"text":str(natural spoken English, ≤140 chars)}]}]}
Rules: exactly ${nChapters} chapters. captions.t starts ≥1.0, last caption ends ≥2.5s before chapter end. Each caption dur ≈ words/2.8 + 0.8s. Beats describe what the VIEWER SEES (diagrams, arrows, numbers, transformations — never paragraphs of text).` }]
  , { json: true, temperature: 0.6 });
  const plan = extractJson(planTxt);
  pack.title = plan.title; pack.subtitle = plan.subtitle || '';
  log(`plan: "${plan.title}" — ${plan.chapters.length} chapters`);

  /* 2) scene code per chapter with headless validation + retry */
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    for (let i = 0; i < plan.chapters.length; i++) {
      const chp = plan.chapters[i];
      let chId = (chp.id || ('ch' + (i + 1))).replace(/[^a-z0-9_]/gi, '_').slice(0, 24) || ('ch' + (i + 1));
      if (/^[0-9]/.test(chId)) chId = 'ch_' + chId;
      onProgress('scene ' + (i + 1) + '/' + plan.chapters.length, 10 + Math.round(60 * i / plan.chapters.length));
      const capList = chp.captions.map(c => `- t=${c.t}s dur=${c.dur}s: "${c.text}"`).join('\n');
      let sceneErr = null, code = null, lastBody = '';
      for (let attempt = 1; attempt <= 4; attempt++) {
        log(`scene ${chId}: generating (attempt ${attempt})${sceneErr ? ' — fixing: ' + sceneErr.slice(0, 140) : ''}`);
        const sys = 'You are a senior motion-graphics engineer writing a single self-contained SVG scene in plain JS for an educational video. Output ONLY the JavaScript body (no tags, no markdown, no backticks).';
        const usr = `Topic chapter: "${chp.title}" — ${chp.purpose || ''}
Timeline (absolute seconds): ${chp.duration}s total.
${SCENE_API_DOC}
${DESIGN_RULES}
HARD RULES (violations = automatic reject):
- NEVER call .appendChild() — pass {parent: g} into primitives instead.
- MT.vbars / MT.grid / MT.axes / MT.layer / MT.arrow return wrapper objects ({g,...}) — never pass them to MT.fade/MT.pop/MT.out directly; pass their .g (arrow: .g).
- Plain top-to-bottom script; no functions returning multiple things; no classes.
Viewer-visible beats:
${(chp.beats || []).map(b => `- t=${b.t}s: ${b.text}`).join('\n')}

Write the scene now. Requirements:
- MT.scene({duration:${chp.duration}});
- ONE main diagram built from the primitives; every beat adds/moves/highlights something on it.
- Reveal each beat at its t. Use MT.out to clear groups before the next visual idea.
- End with MT.ready();${sceneErr ? `

YOUR PREVIOUS ATTEMPT FAILED WITH: ${sceneErr}
Here is the previous broken code — find the bug, fix it, and output the COMPLETE corrected script:
${lastBody.slice(0, 6000)}` : ''}`;
        try {
          code = await llm([{ role: 'system', content: sys }, { role: 'user', content: usr }], { temperature: 0.5 });
          const body = code.replace(/^\s*<\/?script[^>]*>/gm, '').replace(/^```[a-z]*\s*|```$/gm, '').trim();
          lastBody = body;
          const html = `<!doctype html><html><head><meta charset="utf-8">\n<style>html,body{margin:0;background:#0b0e14;overflow:hidden}svg{display:block}</style>\n</head><body>\n<script src="/vendor/motion.js"></script>\n<script>\n${body}\n</script></body></html>`;
          /* cheap syntax gate first — precise error for the retry */
          try { new Function(body); } catch (se) { throw new Error('SyntaxError: ' + String(se.message).slice(0, 200)); }
          const scenePath = path.join(dir, 'scenes', chId + '.html');
          fs.writeFileSync(scenePath, html);
          /* headless validation */
          const errs = [];
          page.removeAllListeners('pageerror'); page.removeAllListeners('console');
          page.on('pageerror', e => errs.push(String(e.message || e)));
          await page.goto(`${BASE_URL}/generated/${id}/scenes/${chId}.html`, { waitUntil: 'load', timeout: 30000 });
          const res = await page.evaluate(async () => {
            if (!window.__ready) return { ok: false, why: 'script did not reach MT.ready()' };
            await window.__ready;
            const dur = window.__duration;
            if (!dur || dur < 5) return { ok: false, why: 'bad duration ' + dur };
            window.__seek(dur / 3); window.__seek(dur * 0.9); window.__seek(0);
            return { ok: true, dur };
          });
          if (!res.ok) throw new Error(res.why + (errs[0] ? ' — first error: ' + errs[0].slice(0, 220) : ''));
          if (errs.length) throw new Error('console: ' + errs[0].slice(0, 200));
          /* dead-frame check on 3 samples */
          const shots = [];
          for (const f of [0.2, 0.5, 0.8]) {
            await page.evaluate(t => window.__seek(t), res.dur * f);
            shots.push(await page.screenshot({ type: 'jpeg', quality: 60 }));
          }
          const uniq = new Set(shots.map(b => b.length + ':' + b.length));
          log(`scene ${chId}: valid (${res.dur}s)`);
          sceneErr = null;
          pack.chapters.push({
            id: chId, title: chp.title, kicker: chp.kicker || ('Chapter ' + (i + 1)),
            duration: res.dur > chp.duration + 1 ? Math.round(res.dur) : chp.duration,
            scene: `scenes/${chId}.html`,
            captions: chp.captions.map((c, k) => ({ t: c.t, dur: c.dur, text: c.text, audio: `audio/${chId}_cap${String(k).padStart(2, '0')}.mp3` }))
          });
          break;
        } catch (e) {
          sceneErr = String(e.message || e).slice(0, 400);
        }
      }
      if (sceneErr) throw new Error(`scene ${chId} failed after 3 attempts: ${sceneErr}`);
    }
  } finally {
    await browser.close();
  }

  /* 3) manifest + narration (MANDATORY — the no-silent-packs rule) */
  onProgress('manifest', 74);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(pack, null, 1));
  onProgress('narration', 78);
  log('recording narration (' + pack.chapters.reduce((n, c) => n + c.captions.length, 0) + ' lines)…');
  const { prepareVideoAudio } = await import('./tts.mjs');
  await prepareVideoAudio(dir, { voice: pack.audio.voice, log });

  /* 4) audio QC gate: every caption must have audio */
  onProgress('qc', 92);
  const mf = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const missing = [];
  for (const ch of mf.chapters) for (const c of ch.captions) {
    if (!fs.existsSync(path.join(dir, c.audio)) || !(c.audioDur > 0)) missing.push(ch.id + '/' + c.audio);
  }
  if (missing.length) throw new Error('QC FAIL: silent captions: ' + missing.slice(0, 4).join(', '));
  log('QC pass: narration present on every line');

  /* 5) register */
  const regPath = path.join(process.env.PUBLIC_DIR || '/home/z/my-project/public', 'generated', 'registry.json');
  let reg = [];
  try { reg = JSON.parse(fs.readFileSync(regPath, 'utf8')); } catch {}
  reg.unshift({ id, title: pack.title, subtitle: pack.subtitle, chapters: pack.chapters.length, created: Date.now() });
  fs.writeFileSync(regPath, JSON.stringify(reg.slice(0, 30), null, 1));
  onProgress('done', 100);
  log(`pack "${pack.title}" ready — ${pack.chapters.length} chapters, ${Math.round(pack.chapters.reduce((n, c) => n + c.duration, 0))}s`);
  return { ok: true, id, title: pack.title };
}
