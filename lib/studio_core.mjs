/* studio_core.mjs — AI video-generation core for serverless.
   Ported from glm_server.mjs (companion server) so /api/generate can run on
   ANY host with zero filesystem: plans a video from a prompt, writes each
   scene body with an LLM, validates it against the deterministic-render
   rules, assembles self-contained scene HTML from the embedded shell+engine.
   The caller supplies an `llm(messages) -> string` function (env-key API or
   keyless SDK) — this module is transport-agnostic. */
import { STUDIO } from './api_bundle.mjs';

export const PALETTE = ['#58C4DD', '#5FD3BC', '#7EC96B', '#FFE45C', '#FF9F43',
                        '#FC6255', '#B57EDC', '#FFC53D'];

export function slugify(s, max = 28) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, max) || 'video';
}

export function stamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export const PLAN_SYS = `You are the showrunner of short educational videos rendered by the
Hyperframes engine (dark navy SVG scenes, friendly explainer style). You plan a
video from a viewer's prompt. Output ONLY raw JSON — no markdown fences, no
commentary — matching exactly this schema:

{
 "title": "short catchy video title",
 "tagline": "one-line subtitle",
 "scenes": [
  { "name": "two-or-three-word-slug",
    "chapter": "Chapter 1",
    "title": "scene title shown on screen",
    "dur": 30,
    "accent": "#58C4DD",
    "narr": [[1.0, 4.5, "Spoken narration sentence one."], [6.0, 5.0, "..."]],
    "visual": "Beat-by-beat description of what is on screen and when, tied to the narr windows." }
 ]
}

HARD RULES FOR THE PLAN
- 2 to 6 scenes; each dur between 20 and 40 seconds.
- 5 to 8 narration lines per scene: start >= 1.0, window 3.0-6.5 s, >= 0.7 s gap
  between lines, last line ends at most dur - 1.5. Lines are one or two short
  spoken sentences, plain English, no markdown.
- accent must be one of: ${PALETTE.join(', ')}.
- One coherent story arc across scenes: hook first, build the idea step by step,
  end with a payoff or recap. Numbers used in narration must be consistent.
- Family-friendly, concrete, no hype.`;

export const sceneSystem = () => `${STUDIO.guide}

================ EXAMPLE OF A COMPLETE SCENE BODY ================
${STUDIO.exampleScene}
==================================================================
You write ONE scene body for the plan you are given. Output ONLY the JavaScript
body — no markdown fences, no explanations, no HTML. It must obey every rule in
the guide: one IIFE, only the documented helpers, deterministic, and it must end
with the three required calls (begin ... captions(DATA.narr) ... progressBar(...)).
Sync each visual beat to the narr window that talks about it. Leave the caption
band (y > 890) and the top-left chip area clear.`;

export function extractJSON(txt) {
  let t = txt.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

export function normalizePlan(plan, nScenes) {
  if (!plan || !Array.isArray(plan.scenes) || plan.scenes.length < 2)
    throw new Error('plan has no scenes');
  let scenes = plan.scenes.slice(0, nScenes || 6);
  scenes = scenes.map((s, i) => {
    const dur = Math.max(18, Math.min(42, Math.round(+s.dur || 30)));
    const accent = PALETTE.includes(s.accent) ? s.accent : PALETTE[i % PALETTE.length];
    const narr = (Array.isArray(s.narr) ? s.narr : [])
      .map(([t0, w, txt]) => [+t0, Math.max(2, Math.min(7, +w || 4)), String(txt || '').trim()])
      .filter(([t0, w, txt]) => txt && txt.length < 240 && t0 >= 0.5 && t0 + w <= dur)
      .sort((a, b) => a[0] - b[0]);
    if (narr.length < 2) throw new Error(`scene ${i + 1}: too few narration lines`);
    return { name: slugify(s.name || s.title || 'scene', 24),
             chapter: String(s.chapter || ('Chapter ' + (i + 1))).slice(0, 40),
             title: String(s.title || s.name || 'Scene').slice(0, 80),
             dur, accent, narr,
             visual: String(s.visual || '').slice(0, 1200) };
  });
  const title = String(plan.title || 'AI video').slice(0, 90);
  const tagline = String(plan.tagline || '').slice(0, 140);
  return { title, tagline, scenes };
}

export function cleanCode(txt) {
  return txt.trim().replace(/^```(?:javascript|js)?/i, '').replace(/```$/, '').trim();
}

export function validateBody(code) {
  if (!code || code.length < 200) return 'body too short';
  if (code.length > 16000) return 'body too long';
  if (/```/.test(code)) return 'markdown fences not allowed';
  const bad = code.match(/Math\.random|Date\.now|setInterval|setTimeout|requestAnimationFrame|fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|eval\s*\(|new\s+Function|import\s|window\.open|addEventListener|WebSocket|Worker\s*\(|Audio\s*\(|Image\s*\(/);
  if (bad) return `forbidden API: ${bad[0]}`;
  for (const need of ['captions(', 'begin(', 'progressBar('])
    if (!code.includes(need)) return `missing required call: ${need}`;
  const redecl = code.match(/\b(?:const|let|var|function)\s+(?:el|G|T|stext|rect|circle|line|path|arrow|grid|heat|bars|fade|pop|wipe|out|to|draw|tween|sync|reg|lerp|lerpA|clamp|easeIO|easeOutC|easeBack|wrapText|captions|begin|progressBar|svg|DUR|C|OPS|SYNCS|STATES)\b/);
  if (redecl) return `redeclares an engine helper: ${redecl[0]} — rename your variable`;
  const bal = (o, c) => (code.split(o).length - 1) - (code.split(c).length - 1);
  if (bal('{', '}') !== 0) return 'unbalanced braces';
  if (bal('(', ')') !== 0) return 'unbalanced parentheses';
  try { new Function(code); } catch (e) {
    return 'syntax error: ' + String(e.message || e).slice(0, 160);
  }
  return null;
}

export function fallbackBody(sc) {
  const A = JSON.stringify(sc.accent);   // quoted hex — a bare #literal is invalid JS
  const lines = sc.narr.slice(0, 6).map(n =>
    `  { t: ${(+n[0]).toFixed(1)}, txt: ${JSON.stringify(n[2].slice(0, 60))} }`).join(',\n');
  return `(function(){
begin({ n: ${JSON.stringify(sc.chapter)}, title: ${JSON.stringify(sc.title)}, color: ${A} });
rect(120, 200, 1680, 560, { fill: C.panel, rx: 24 });
const tt = T(${JSON.stringify(sc.title)}, 960, 330, { size: 66, weight: '700', color: ${A} });
wipe(tt, 0.8, 1.2);
const items = [
${lines}
];
items.forEach((it, i) => {
  const row = T((i + 1) + '.  ' + it.txt, 220, 430 + i * 62,
                { size: 30, anchor: 'l', show: true, color: C.text });
  fade(row, it.t, 0.5, { y: 10 });
});
captions(DATA.narr);
progressBar(${A});
})();`;
}

export function assemble(dur, chapter, title, narr, body) {
  const data = JSON.stringify({ narr }).replace(/<\//g, '<\\/');
  return STUDIO.shell
    .split('/*__DATA__*/').join('const DATA = ' + data + ';')
    .split('/*__ENGINE__*/').join(STUDIO.engine)
    .split('/*__SCENE__*/').join(body)
    .split('__TITLE__').join('Hyperframes · ' + chapter + ' — ' + title)
    .split('__DUR__').join(String(dur));
}

/* autoplay-off rewrite — identical to the bundled-pack contract so the master
   player can drive every generated scene deterministically */
const AUTO_HOOK = "if (location.hash.indexOf('freeze') < 0){";
export function autoplayOff(html) {
  return html.includes(AUTO_HOOK)
    ? html.replace(AUTO_HOOK, 'if (false){ /* autoplay off: master player drives */')
    : html;
}
