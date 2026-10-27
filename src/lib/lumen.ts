/* lumen.ts — Lumen Studio data model: the 51 Lemo-Opuscar styles, Deepgram Aura-2
   narrator roster, hue sets per screen, and the client-side helpers + rule-based
   fallbacks used when the AI service is offline. Pure client-safe code. */

/* ---------------- types ---------------- */
export type StyleDef = { n: string; c: string; a: string; b: string; i: string; x: string; f: 'serif'|'sans'|'display'|'mono'|'hand'; tr: string; ta: string; lay: string; tx: string };
export type LScene = { title: string; text: string; dur: number; bg: string };
export type Asset = { id: string; name: string; type: 'img' | 'aud'; desc: string; url: string; w?: number; h?: number };
export type Claim = { txt: string; conf: 'High' | 'Medium' | 'Low'; ok: boolean };
export type Snap = { scenes: LScene[]; sty: string; logo: string | null; music: string | null; voice: string; speed: number; pause: number };
export type HistEntry = { label: string; t: number; st: string };
export type LProject = { id: string; title: string; topic: string; aud: string; len: number; ar: number; hist: HistEntry[]; assets: Asset[]; updated: number };
export type Brand = { logo?: string | null; voice?: string; style?: string };

/* manifest video packs (nn-video + generated) */
export type Caption = { t: number; dur: number; text: string; audio: string; audioDur?: number };
export type Chapter = { id: string; title: string; kicker: string; duration: number; scene: string; captions: Caption[] };
export type Manifest = {
  id: string; title: string; subtitle?: string; width: number; height: number; fps: number;
  audio: { voice?: string; provider?: string; prepared: boolean };
  chapters: Chapter[];
};
export type PackMeta = { id: string; title: string; subtitle?: string; chapters: number; created: number };

/* ---------------- styles: 51 from github.com/lemomo-ai/lemo-opuscar ---------------- */
const STY_RAW = `Satellite Briefing|Evidence|#0b1d2a|#16445c|#e6f3fa|#f2b134|sans|w|t|bl|grid
Engineering Briefing Board|Evidence|#e9edf1|#cfd8e0|#12202e|#e8590c|sans|s|r|tl|grid
LiDAR Survey|Evidence|#06110c|#0e2a1c|#d9ffe8|#5dff9c|mono|f|t|bl|dots
Projection on White Model|Evidence|#f4f4f2|#dcdcd8|#222222|#3a7bff|sans|b|m|c|vignette
Data Physicalization|Evidence|#4a2f1c|#7a5233|#fff3e0|#f2c14e|serif|z|r|bl|grain
Exploded Teardown|Evidence|#1a1c22|#2c3040|#eef0f6|#ff7a1a|sans|z|k|tl|grid
Microscope Story|Evidence|#06131f|#10405c|#e6f6ff|#6ec7ff|sans|i|b|c|vignette
Archive Light Table|Evidence|#d9d4c4|#bdb59d|#2a241a|#8a2b1d|serif|f|m|bl|paper
Crayon Picture Book|Hand-drawn|#fff1c9|#ffd1a6|#3b2a5a|#ef476f|hand|b|b|c|paper
Watercolor Brush|Hand-drawn|#e8f3f7|#f6dce8|#2b3a55|#4aa3a0|hand|f|b|bl|paper
Chinese Ink Wash|Hand-drawn|#f1ede2|#d7d2c3|#161616|#b3261e|serif|b|m|tl|paper
Impasto Oil Painting|Hand-drawn|#33425b|#c4563a|#fff3e3|#ffd166|serif|s|r|bl|grain
One-line Drawing|Hand-drawn|#ffffff|#f1f1f1|#111111|#111111|hand|f|m|c|none
Whiteboard Explainer|Hand-drawn|#fafbfc|#e9edf2|#1b2a49|#e63946|hand|f|t|tl|lines
Urban Sketch Pen and Wash|Hand-drawn|#f3eee1|#e5dcc3|#2a2a2a|#2f80a8|hand|w|t|bl|paper
Shadow Puppetry|East Asian|#3b1405|#c4571a|#ffe2b0|#ffd27a|serif|s|r|c|vignette
Ukiyo-e|East Asian|#e9dcc0|#c9d6dc|#1c2b44|#b3261e|serif|w|m|bl|paper
Red Paper-cut|East Asian|#b3121e|#e03a2f|#ffe9b8|#ffd166|serif|p|k|c|none
Paper-cut Lightbox|East Asian|#2a0e0e|#7d2a12|#ffeccc|#ffb347|serif|i|b|c|vignette
Risograph Print|Print|#fff0ea|#ffd6e6|#2338ff|#ff4f6d|sans|s|k|bl|dots
Halftone Dossier|Print|#f2ecdc|#e0d6bb|#1a1a1a|#ff6b1a|mono|p|k|tl|dots
Woodcut Print|Print|#ece3d0|#cfc2a5|#14110e|#7a2e1c|serif|w|k|bl|grain
Copperplate Engraving|Print|#efe6cf|#dccfab|#2a1f12|#2f6f73|serif|f|t|c|lines
Silkscreen Travel Poster|Print|#ff9e5e|#ffd36b|#1f2a44|#d93f3f|display|s|k|bl|grain
Swiss Motion Graphics|Graphic|#ffffff|#f0f0f0|#111111|#e30613|sans|s|r|tl|none
60s Spy Title Sequence|Graphic|#1b1b1b|#7a1020|#f7efe0|#ffb703|display|i|k|c|grain
Art Deco|Graphic|#0f1c2e|#1c3350|#f3e3b1|#d4af37|serif|i|m|c|lines
Blueprint|Graphic|#0d3b8e|#1257c4|#e8f1ff|#ffffff|mono|w|t|tl|grid
Stained Glass|Graphic|#241347|#7a2ea8|#fff4d6|#ffb703|serif|i|b|c|lines
Pictogram Motion|Graphic|#ff3d5a|#ffcf33|#12122a|#12122a|display|z|b|c|none
ASCII CRT Terminal|Graphic|#050806|#0b1a10|#b8ffd0|#39ff88|mono|g|t|tl|scan
Data Storytelling|Info|#0f1a2b|#1f3556|#eaf2ff|#ffb703|sans|s|r|bl|grid
Isometric Infographic|Info|#dff3ff|#c8e7ff|#14304f|#ff7a3d|sans|z|r|tl|none
Dark Tech Keynote|Info|#050507|#14141c|#f5f5fa|#8e85ff|sans|b|m|c|vignette
Living Screencast|Info|#f2f4f8|#e1e6ef|#161a2a|#2f6df6|sans|s|r|tl|none
Sci-fi Hologram HUD|Info|#031a22|#06394a|#d9fbff|#35e3ff|mono|g|t|bl|scan
1930s Rubber Hose Cartoon|Cartoon|#e8e2d2|#cfc7b0|#111111|#e63946|display|b|b|c|grain
80s Cel Anime|Cartoon|#1a1040|#e0407a|#fff0fa|#3ee6ff|display|w|k|bl|scan
Sci-Fi Sitcom Toon|Cartoon|#2ecc9b|#1aa0d8|#0e1b2e|#ffe14d|display|z|b|c|none
Mid-century Cartoon|Cartoon|#f4e2c0|#e9c28a|#2b3a3a|#d9582b|sans|s|r|bl|grain
16-bit Pixel RPG|Games|#1b1b4a|#3a3aa0|#ffffff|#ffd23f|mono|p|t|bl|scan
HD-2D|Games|#1a2438|#c8773a|#fff1d8|#ffd27a|serif|b|r|bl|vignette
Microgame Frenzy|Games|#ffe14d|#ff6b9a|#1a1030|#ffffff|display|z|k|c|dots
Game Show Flat|Games|#6a2cff|#ff3d9a|#ffffff|#ffe14d|display|s|b|c|none
1920s Silent Film|Cinema|#2a2a2a|#6a6a66|#f2efe6|#ffffff|serif|f|k|c|grain
Liminal Found Footage|Cinema|#c9b43a|#8f7e1e|#2a2406|#ffffff|mono|g|t|bl|scan
Brick Toy|Materials|#d62828|#f7b32b|#ffffff|#1a1a1a|display|b|k|c|none
Paper Pop-up Book|Materials|#e8d9b8|#f4b6c2|#3a2a1a|#2a9d8f|hand|p|b|c|paper
Tilt-Shift Miniature|Materials|#87c7ef|#f0e6a8|#17324a|#e85d3a|sans|b|r|bl|vignette
Low-poly Isometric Island|Materials|#2a6f6f|#7bc6a0|#ffffff|#ffd166|sans|z|r|tl|none
Glass Product Render|Materials|#0b0c12|#2a2f44|#f3f6ff|#9fd3ff|sans|b|m|c|vignette`;

export const FONTS: Record<string, string> = {
  serif: 'Georgia,"Times New Roman",serif',
  sans: '"DM Sans",system-ui,sans-serif',
  display: '"Arial Black",Impact,sans-serif',
  mono: 'ui-monospace,Menlo,monospace',
  hand: '"Segoe Print","Bradley Hand","Comic Sans MS",cursive',
};

export const STY: StyleDef[] = STY_RAW.split('\n').map(l => {
  const [n, c, a, b, i, x, f, tr, ta, lay, tx] = l.split('|');
  return { n, c, a, b, i, x, f: f as StyleDef['f'], tr, ta, lay, tx };
});
export const CATS = ['All', ...new Set(STY.map(s => s.c))];
export const styByName = (n: string) => STY.find(s => s.n === n) || STY[0];

/* ---------------- narrators: Deepgram Aura-2 (key) + built-in z.ai fallback ----------------
   The built-in voice is English-capable but accented — Deepgram Aura-2 is the
   natural-English path and is enabled by pasting a Deepgram API key (or setting
   DEEPGRAM_API_KEY server-side). */
export type VoiceDef = { id: string; name: string; desc: string; provider: 'deepgram' | 'zai' };
export const VOICES: VoiceDef[] = [
  { id: 'aura-2-thalia-en', name: 'Thalia', desc: 'Warm and expressive', provider: 'deepgram' },
  { id: 'aura-2-asteria-en', name: 'Asteria', desc: 'Warm and clear', provider: 'deepgram' },
  { id: 'aura-2-luna-en', name: 'Luna', desc: 'Soft and friendly', provider: 'deepgram' },
  { id: 'aura-2-athena-en', name: 'Athena', desc: 'Calm and polished', provider: 'deepgram' },
  { id: 'aura-2-orion-en', name: 'Orion', desc: 'Steady and confident', provider: 'deepgram' },
  { id: 'aura-2-zeus-en', name: 'Zeus', desc: 'Bold and authoritative', provider: 'deepgram' },
  { id: 'jam', name: 'Built-in (z.ai)', desc: 'Always available · English with an accent', provider: 'zai' },
];
export const voiceById = (id: string) => VOICES.find(v => v.id === id) || VOICES[0];

/* screen hue sets (from the reference design) */
export const HUES: string[][] = [
  ['#c9d4ff', '#ffd1e8', '#c8fff0'],
  ['#ffd9b8', '#e0c9ff', '#c9e8ff'],
  ['#c8f5e0', '#d6ddff', '#fff0c2'],
  ['#ffc9d9', '#c9d4ff', '#d8ffd0'],
  ['#d8c9ff', '#c9f2ff', '#ffe0c9'],
  ['#c9ffe8', '#ffc9e6', '#d0d8ff'],
  ['#ffe9c9', '#c9d4ff', '#e9c9ff'],
  ['#c9f0ff', '#ffe9c9', '#d9ffd0'],
  ['#c9d4ff', '#ffd1e8', '#c8fff0'],
];

export const GREET = ['Hello', 'مرحبا', 'Hola', 'Bonjour', '你好', 'こんにちは', 'Hallo', 'Olá'];

/* ---------------- misc helpers ---------------- */
export const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
export const ago = (t: number) => {
  const m = (Date.now() - t) / 6e4;
  return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
export const swatch = (id: string) => {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg,hsl(${h} 70% 55%),hsl(${(h + 40) % 360} 70% 45%))`;
};
export const words = (t: string) => (t.toLowerCase().match(/[a-z]{4,}/g) || []);
export const score = (a: Asset, t: string) => {
  const w = new Set(words(a.desc + ' ' + a.name.replace(/\.\w+$/, '')));
  return words(t).filter(x => w.has(x)).length;
};
export const topicTitle = (topic: string) => {
  const t = (topic || 'Your video').replace(/^(explain|teach)\s+/i, '').replace(/[.?]+$/, '');
  return t.charAt(0).toUpperCase() + t.slice(1, 46);
};
export const est = (s: LScene, speed = 1) => s.text.trim().split(/\s+/).length / (2.5 * speed);
export const fitAll = (scenes: LScene[], speed = 1, pause = 0.5) =>
  scenes.map(s => ({ ...s, dur: Math.max(3, Math.ceil(est(s, speed) + pause)) }));

export const srt = (scenes: LScene[]) => {
  let t = 0;
  const f = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
    return [h, m, x].map(n => String(n).padStart(2, '0')).join(':') + ',000';
  };
  return scenes.map((s, i) => { const a = t; t += s.dur; return `${i + 1}\n${f(a)} --> ${f(t)}\n${s.text}\n`; }).join('\n');
};

/* offline draft + claims/sources (rule-based, same shape as the AI research result) */
export const draftScenes = (topic: string, len: number): LScene[] => {
  const t = topic.trim().replace(/^(explain|teach)\s+/i, '').replace(/[.?]+$/, '');
  const d = Math.round(len / 5);
  return ([
    ['The hook', `Have you ever wondered about ${t}? In the next few minutes, you'll see how it works and why it matters.`],
    ['The big idea', `Here's the core idea behind ${t}, explained in plain language.`],
    ['How it works', `Let's break ${t} into clear steps you can follow from start to finish.`],
    ['A real example', `To make it concrete, here's an everyday example of ${t} in action.`],
    ['Recap', `That's ${t} in a nutshell. Try explaining it to someone else and you'll know you've got it.`],
  ] as [string, string][]).map(([title, text]) => ({ title, text, dur: d, bg: '' }));
};
export const draftClaims = (topic: string, scenes: LScene[]): Claim[] => {
  const t = topic.trim().replace(/^(explain|teach)\s+/i, '').replace(/[.?]+$/, '');
  const conf = ['High', 'Medium', 'Low', 'Medium', 'High'];
  return scenes.map((s, i) => ({ txt: `Scene ${i + 1} (${s.title}) states facts about ${t}.`, conf: conf[i % conf.length] as Claim['conf'], ok: conf[i % conf.length] === 'High' }));
};
export const draftSrcs = (): [string, string][] => [
  ['Encyclopedia overview', 'scenes 1–2'],
  ['Peer-reviewed review article', 'scenes 2–3'],
  ['Educator or curriculum guide', 'scenes 3–4'],
  ['Institutional or government page', 'scene 4'],
  ['Reference textbook chapter', 'scene 5'],
];

/* ---------------- rule-based AI-edit fallback (used when the AI service is offline) ---------------- */
const KEY: Record<string, string> = {
  dark: 'Dark Tech Keynote', cinematic: 'Glass Product Render', retro: '80s Cel Anime', playful: 'Crayon Picture Book',
  minimal: 'Swiss Motion Graphics', tech: 'Sci-fi Hologram HUD', chalk: 'Whiteboard Explainer', editorial: 'Archive Light Table',
  comic: 'Halftone Dossier', blueprint: 'Blueprint', pixel: '16-bit Pixel RPG', watercolor: 'Watercolor Brush',
  ink: 'Chinese Ink Wash', terminal: 'ASCII CRT Terminal',
};

export type EditOp =
  | { op: 'setScene'; i: number; patch: Partial<Pick<LScene, 'title' | 'text' | 'dur'>> }
  | { op: 'addScene'; i: number; scene: LScene }
  | { op: 'removeScene'; i: number }
  | { op: 'fitAll' }
  | { op: 'setStyle'; name: string }
  | { op: 'setVoice'; voice: string }
  | { op: 'setMusic'; assetId: string }
  | { op: 'setLogo'; assetId: string }
  | { op: 'setBg'; i: number; assetId: string };

export function aiEditRules(q: string, ctx: { scenes: LScene[]; idx: number; assets: Asset[]; len: number }): { ops: EditOp[]; reply: string } {
  const l = q.toLowerCase();
  const m = l.match(/scene (\d+)/);
  let i = m ? +m[1] - 1 : /intro|first|opening|hook/.test(l) ? 0 : /last|end|recap|outro/.test(l) ? ctx.scenes.length - 1 : ctx.idx;
  i = Math.min(Math.max(i, 0), ctx.scenes.length - 1);
  const sc = ctx.scenes[i];
  const ops: EditOp[] = [];
  let reply = '';

  const as = ctx.assets.map(a => ({ a, s: score(a, l) + (l.includes(a.name.toLowerCase().replace(/\.\w+$/, '')) ? 3 : 0) })).sort((x, y) => y.s - x.s)[0];
  const ti = q.match(/title[^"“]*(?:to|as|:)\s*["“]?(.+?)["”]?$/i);
  const na = q.match(/narration[^"“]*(?:to|so it|:)\s*["“]?(.+?)["”]?$/i);
  const re = q.match(/^rewrite the narration of scene \d+ so it (.+)$/i);

  if (ti && /title|rename/.test(l)) {
    const title = ti[1].replace(/\.$/, '');
    ops.push({ op: 'setScene', i, patch: { title } });
    reply = `Renamed scene ${i + 1} to “${title}”.`;
  } else if (re || na) {
    const x = ((re || na)![1] || '').replace(/\.$/, '');
    const text = /^(is|are|sounds|feels|has|uses|focus|explain|mention)/i.test(x)
      ? `${sc.text} (Revised so it ${x}.)`
      : x.charAt(0).toUpperCase() + x.slice(1) + '.';
    ops.push({ op: 'setScene', i, patch: { text } });
    reply = `Updated the narration of scene ${i + 1}.`;
  } else if (/(add|new).*scene/.test(l)) {
    const tp = (l.split(/about|on|for/)[1] || 'a key detail').trim();
    ops.push({ op: 'addScene', i, scene: { title: tp.replace(/^./, c => c.toUpperCase()), text: `Let's look at ${tp}, and how it connects to everything so far.`, dur: Math.round(ctx.len / 5), bg: '' } });
    reply = `Added a scene about ${tp} after scene ${i + 1}.`;
  } else if (/(remove|delete|cut).*scene/.test(l) && ctx.scenes.length > 1) {
    ops.push({ op: 'removeScene', i });
    reply = `Removed scene ${i + 1}.`;
  } else if (/fit|sync|match.*narration/.test(l)) {
    ops.push({ op: 'fitAll' });
    reply = 'Scene lengths now follow the narration.';
  } else if (/short|trim|shrink|quick/.test(l)) {
    const dur = Math.max(3, Math.round(sc.dur * 0.6));
    ops.push({ op: 'setScene', i, patch: { dur } });
    reply = `Scene ${i + 1} is now ${dur} seconds.`;
  } else if (/longer|extend|more time/.test(l)) {
    const dur = Math.round(sc.dur * 1.5);
    ops.push({ op: 'setScene', i, patch: { dur } });
    reply = `Scene ${i + 1} is now ${dur} seconds.`;
  }
  if (/(use|add|put|show|include|place|insert|swap)/.test(l) && as && as.s > 0 && !ops.length) {
    if (as.a.type === 'aud') { ops.push({ op: 'setMusic', assetId: as.a.id }); reply = `Using “${as.a.name}” as background music.`; }
    else if (/logo/.test(l) || /logo/i.test(as.a.desc)) { ops.push({ op: 'setLogo', assetId: as.a.id }); reply = 'Your logo is now on every scene.'; }
    else { ops.push({ op: 'setBg', i, assetId: as.a.id }); reply = `Set “${as.a.desc || as.a.name}” as the background of scene ${i + 1}.`; }
  }
  const kw = Object.keys(KEY).find(k => l.includes(k));
  const nm = STY.find(s => l.includes(s.n.toLowerCase()));
  if ((kw || nm) && /look|style|vibe|theme|switch|use a|make it/.test(l)) {
    const name = nm ? nm.n : KEY[kw!];
    ops.push({ op: 'setStyle', name });
    reply = `Switched to ${name}. Transitions and title motion changed too.`;
  }
  if (/playful|fun|friendly/.test(l) && !ops.length) {
    ops.push(...ctx.scenes.map((s, j) => ({ op: 'setScene' as const, i: j, patch: { text: /fun part/.test(s.text) ? s.text : 'Here\'s the fun part! ' + s.text } })));
    reply = 'Made the narration more playful.';
  }
  if (/simpl|easier|concise/.test(l) && !/scene \d/.test(l) && !ops.length) {
    ops.push(...ctx.scenes.map((s, j) => ({ op: 'setScene' as const, i: j, patch: { text: s.text.split(/(?<=[.?!])\s/)[0] } })));
    reply = 'Simplified the narration to one sentence per scene.';
  }
  const v = VOICES.find(vv => l.includes(vv.name.toLowerCase()));
  if (v && /voice|narrat/.test(l)) { ops.push({ op: 'setVoice', voice: v.id }); reply = `Narrator changed to ${v.name}.`; }
  return { ops, reply };
}

/* localStorage wrapper (projects, library, brand) */
export const ls = {
  get<T>(k: string, d: T): T {
    try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch { return d; }
  },
  set(k: string, v: unknown): boolean {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  },
};
