'use client';
/* Hyperframes × Lumen Studio — the full creation flow from the reference design
   (Home → Topic → Audience → Assets → Style → Narrator → Research → Script → Studio)
   with OUR AI features wired around it:
     · /api/ai/research  — LLM drafts the outline, claims & sources (offline → built-in draft)
     · /api/ai/edit      — LLM applies chat edits as ops (offline → rule-based fallback)
     · /api/ai/tts       — Deepgram Aura-2 (with a key) or built-in z.ai voice → real audio
     · /api/relay/*      — render-service: pack generation, narration jobs, MP4 export
     · bundled nn-video  — the real 12-chapter / 122-line narrated player
   Music bed + transition FX are synthesized in the WebAudio engine (no assets needed). */
import { useEffect, useRef, useState, useCallback } from 'react';
import './lumen.css';
import {
  STY, CATS, FONTS, VOICES, HUES, GREET, ls, fmt, ago, swatch, score, topicTitle, est, srt,
  draftScenes, draftClaims, draftSrcs, aiEditRules, styByName, voiceById,
} from '@/lib/lumen';
import type { LScene, Asset, Claim, HistEntry, LProject, EditOp, Manifest, PackMeta, Caption, Chapter } from '@/lib/lumen';
import { getLuAudio } from '@/lib/lu-audio';

/* ---------------- utils ---------------- */
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cssVars = (o: Record<string, string | number>) => o as React.CSSProperties;

type SState = {
  pid: string | null; kind: 'lumen' | 'manifest'; manifestId: string | null;
  title: string; topic: string; aud: string; len: number; ar: number;
  scenes: LScene[]; idx: number; t: number; playing: boolean;
  sty: string; cat: string;
  assets: Asset[]; logo: string | null; music: string | null;
  voice: string; speed: number; pause: number;
  hist: HistEntry[]; changed: number[];
  claims: Claim[]; srcs: [string, string][];
  musicOn: boolean; fxOn: boolean;
  researchProvider: 'ai' | 'offline' | null;
};
const fresh = (): SState => ({
  pid: null, kind: 'lumen', manifestId: null,
  title: '', topic: '', aud: 'Students', len: 120, ar: 1.778,
  scenes: [], idx: 0, t: 0, playing: false,
  sty: STY[0].n, cat: 'All',
  assets: [], logo: null, music: null,
  voice: 'aura-2-thalia-en', speed: 1, pause: 0.5,
  hist: [], changed: [],
  claims: [], srcs: [], musicOn: true, fxOn: true,
  researchProvider: null,
});
type Msg = { who: 'ai' | 'me'; t: string; undo?: number };
type Job = { id: string; pct: number; status: string; steps: string[]; error: string | null; kind: string; result?: any };

/* ---------------- styled stage (Lumen paint) ---------------- */
function Stage({ sty, ar, title, text, bg, logo, go, onTitle, onText, mini }: {
  sty: typeof STY[0]; ar: number; title: string; text?: string;
  bg?: Asset | null; logo?: Asset | null; go?: boolean; mini?: boolean;
  onTitle?: () => void; onText?: () => void;
}) {
  return (
    <div className={`${mini ? 'sc-stage ' : ''}stage${go === false ? '' : ' go'}`}
      data-tr={sty.tr} data-ta={sty.ta} data-lay={sty.lay} data-tx={sty.tx}
      style={cssVars({ '--arn': ar, '--a': sty.a, '--b': sty.b, '--i': sty.i, '--x': sty.x, '--f': FONTS[sty.f] })}>
      <div className="lay">
        {bg ? <div className="bgimg" style={{ backgroundImage: `url(${bg.url})` }} /> : null}
        <div className="st">
          <div className="tag" />
          <h3 data-e="title" onClick={onTitle} style={onTitle ? { cursor: 'pointer' } : undefined}>{title}</h3>
          {text ? <p data-e="text" onClick={onText} style={onText ? { cursor: 'pointer' } : undefined}>{text}</p> : null}
        </div>
      </div>
      <div className="tx" />
      {logo ? <img className="wm" src={logo.url} alt="Logo" /> : null}
    </div>
  );
}

/* ---------------- page ---------------- */
export default function Home() {
  const [step, setStep] = useState(0);
  const [S, setS] = useState<SState>(fresh);
  const SRef = useRef(S); useEffect(() => { SRef.current = S; }, [S]);
  const [lib, setLib] = useState<Asset[]>([]);
  const [brand, setBrand] = useState<Record<string, unknown>>({});
  const [greetIdx, setGreetIdx] = useState(0);
  const [brandOpen, setBrandOpen] = useState(false);
  const [renderOpen, setRenderOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState<'chapter' | 'full'>('chapter');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [chat, setChat] = useState<Msg[]>([]);
  const [ask, setAsk] = useState('');
  const [tgt, setTgt] = useState('');
  const [panelTab, setPanelTab] = useState<'ai' | 'sc' | 'as' | 'hi' | 'ch' | 'vids' | 'help'>('ai');
  const [panelOpen, setPanelOpen] = useState(false);
  const [stageTick, setStageTick] = useState(0);
  const [savedAt, setSavedAt] = useState('');
  const [research, setResearch] = useState<{ steps: string[]; cur: number }>({ steps: [], cur: -1 });
  const [dgKey, setDgKey] = useState('');
  const [voiceErr, setVoiceErr] = useState('');
  const [voiceProvider, setVoiceProvider] = useState('');
  const [ttsOffline, setTtsOffline] = useState(false);
  const [projs, setProjs] = useState<LProject[]>([]);
  const [packs, setPacks] = useState<PackMeta[]>([]);
  const [muted, setMuted] = useState(false);
  const [bVoice, setBVoice] = useState(''); const [bStyle, setBStyle] = useState(''); const [bLogo, setBLogo] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [nChapters, setNChapters] = useState(3);
  const [job, setJob] = useState<Job | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [thinking, setThinking] = useState(false);

  /* manifest-mode state */
  const [vid, setVid] = useState('nn-video');
  const [mf, setMf] = useState<Manifest | null>(null);
  const mfRef = useRef(mf); useEffect(() => { mfRef.current = mf; }, [mf]);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [mt, setMt] = useState(0);
  const [mPlaying, setMPlaying] = useState(false);
  const [audioOk, setAudioOk] = useState<'unknown' | 'ready' | 'missing'>('unknown');
  const [mVoice, setMVoice] = useState('aura-2-thalia-en');

  /* refs for clocks */
  const idxRef = useRef(0); const tRef = useRef(0); const playingRef = useRef(false);
  const lplayRef = useRef<{ t0: number; start: number } | null>(null);
  const chapRef = useRef(0); const mtRef = useRef(0); const mPlayingRef = useRef(false);
  const mplayRef = useRef<{ t0: number; start: number } | null>(null);
  const rafRef = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null); const iframeRef = useRef<HTMLIFrameElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null); const lTracksRef = useRef<HTMLDivElement>(null);
  const lTimeRef = useRef<HTMLDivElement>(null); const lPhRef = useRef<HTMLDivElement>(null);
  const preloadedRef = useRef<Set<string>>(new Set());
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ttsOfflineRef = useRef(false); useEffect(() => { ttsOfflineRef.current = ttsOffline; }, [ttsOffline]);
  const cbRef = useRef<{ pauseL: () => void; speakScene: (i: number) => void; setIFrame: (i: number) => void; preload: (i: number) => Promise<void>; schedCaps: (i: number, from: number) => void; pauseM: () => void }>(null!);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3400);
  }, []);

  /* ---- theme ---- */
  useEffect(() => {
    const t = ls.get<string | null>('hf:theme', null);
    if (t) document.documentElement.dataset.theme = t;
    setLib(ls.get<Asset[]>('lumen:lib', []));
    setBrand(ls.get<Record<string, unknown>>('lumen:brand', {}));
  }, []);
  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('hf:theme', dark ? 'light' : 'dark'); } catch {}
  }, []);

  /* ---- speech helpers ---- */
  const stopSpeech = useCallback(() => {
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) speechSynthesis.cancel();
  }, []);

  /* ---- TTS via our backend (Deepgram w/ key → z.ai built-in) ---- */
  const ttsBuffer = useCallback(async (text: string, voice: string): Promise<AudioBuffer | null> => {
    const eng = getLuAudio(); eng.unlock();
    const key = `tts:${voice}:${text}`;
    const hit = eng.buf(key); if (hit) return hit;
    if (ttsOfflineRef.current) return null;
    try {
      const r = await fetch('/api/ai/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 1000), voice, key: dgKey || undefined }),
      });
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || ct.includes('json')) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `tts ${r.status}`); }
      const ab = await r.arrayBuffer();
      const ctx = eng.ensure(); if (!ctx) return null;
      const buf = await ctx.decodeAudioData(ab);
      eng.stash(key, buf);
      return buf;
    } catch { setTtsOffline(true); ttsOfflineRef.current = true; return null; }
  }, [dgKey]);

  const speakScene = useCallback((i: number) => {
    const st = SRef.current; const sc = st.scenes[i]; if (!sc) return;
    const eng = getLuAudio();
    const buf = eng.buf(`tts:${st.voice}:${sc.text}`);
    if (buf) { eng.playNow(buf); return; }
    ttsBuffer(sc.text, st.voice).then(b => { if (b && playingRef.current && idxRef.current === i) eng.playNow(b); });
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(sc.text);
      u.rate = Math.min(2, Math.max(0.5, st.speed));
      speechSynthesis.speak(u);
    }
  }, [ttsBuffer]);

  const speakPreview = useCallback(async (voice: string, text: string) => {
    setVoiceErr(''); stopSpeech();
    try {
      const r = await fetch('/api/ai/tts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, key: dgKey || undefined }),
      });
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || ct.includes('json')) { const e = await r.json().catch(() => ({})); throw Object.assign(new Error(e.error || `tts ${r.status}`), { code: r.status }); }
      setVoiceProvider(r.headers.get('x-provider') || '');
      const blob = await r.blob();
      const a = new Audio(URL.createObjectURL(blob));
      previewAudioRef.current = a; await a.play();
    } catch (e: any) {
      const code = e?.code;
      const m = code === 401 || code === 403 ? 'Deepgram rejected this key. Check it in your Deepgram console.'
        : code === 402 ? 'Your Deepgram account is out of credit.'
        : code === 429 ? 'Deepgram is rate limiting requests. Wait a moment and retry.'
        : 'AI voice service offline — using the browser voice for now.';
      setVoiceErr(m);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text); speechSynthesis.speak(u);
      }
    }
  }, [dgKey, stopSpeech]);

  /* ---- navigation + hues ---- */
  const pauseAll = useCallback(() => {
    if (playingRef.current) { playingRef.current = false; }
    if (mPlayingRef.current) { mPlayingRef.current = false; setMPlaying(false); }
    setS(p => ({ ...p, playing: false }));
    lplayRef.current = null; mplayRef.current = null;
    getLuAudio().stopVoice(); getLuAudio().musicStop(); stopSpeech();
  }, [stopSpeech]);
  const go = useCallback((n: number) => {
    if (n !== 8) pauseAll();
    setStep(n);
    HUES[Math.min(n, HUES.length - 1)].forEach((c, i) => document.documentElement.style.setProperty('--c' + (i + 1), c));
  }, [pauseAll]);

  /* greeting rotator */
  useEffect(() => {
    if (step !== 0) return;
    const iv = setInterval(() => setGreetIdx(g => (g + 1) % GREET.length), 2200);
    return () => clearInterval(iv);
  }, [step]);

  /* ---- projects & packs ---- */
  const refreshHome = useCallback(() => {
    setProjs(Object.values(ls.get<Record<string, LProject>>('lumen:projects', {})).sort((a, b) => b.updated - a.updated));
    fetch('/generated/registry.json').then(r => r.json()).then((g: PackMeta[]) => {
      setPacks([{ id: 'nn-video', title: 'How does a machine learn to read?', subtitle: 'A neural net built from scratch — real narrated video', chapters: 12, created: 0 }, ...(g || []).filter((p: PackMeta) => p.id !== 'nn-video')]);
    }).catch(() => setPacks([{ id: 'nn-video', title: 'How does a machine learn to read?', chapters: 12, created: 0 }]));
  }, []);
  useEffect(() => { if (step === 0) refreshHome(); }, [step, refreshHome]);

  /* ---- persistence / history ---- */
  const saveProject = useCallback((st: SState) => {
    if (!st.pid) return;
    const imgs = st.assets.filter(a => a.type === 'img');
    const all = ls.get<Record<string, LProject>>('lumen:projects', {});
    all[st.pid] = { id: st.pid, title: st.title, topic: st.topic, aud: st.aud, len: st.len, ar: st.ar, hist: st.hist.slice(-12), assets: imgs, updated: Date.now() };
    if (ls.set('lumen:projects', all)) setSavedAt('Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }, []);
  const pushHistPure = (st: SState, label: string): SState => {
    const snapst = JSON.stringify({ scenes: st.scenes, sty: st.sty, logo: st.logo, music: st.music, voice: st.voice, speed: st.speed, pause: st.pause });
    const prev = st.hist.length ? JSON.parse(st.hist[st.hist.length - 1].st).scenes : [];
    const changed = st.scenes.map((s, i) => (JSON.stringify(s) !== JSON.stringify(prev[i]) ? i : -1)).filter(i => i >= 0 && prev.length);
    const hist = [...st.hist, { label, t: Date.now(), st: snapst }].slice(-40);
    return { ...st, hist, changed };
  };
  const commit = useCallback((label: string) => {
    const next = pushHistPure(SRef.current, label);
    setS(next); saveProject(next);
  }, [saveProject]);
  const commitSoon = useCallback((label: string) => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    setSavedAt('Saving…');
    commitTimer.current = setTimeout(() => { commit(label); }, 900);
  }, [commit]);
  const loadSnap = (st: SState, str: string): SState => {
    const o = JSON.parse(str);
    return { ...st, scenes: o.scenes, sty: o.sty, logo: o.logo, music: o.music, voice: o.voice, speed: o.speed, pause: o.pause, idx: Math.min(st.idx, o.scenes.length - 1) };
  };
  const restore = useCallback((i: number, label?: string) => {
    setS(prev => {
      const e = prev.hist[i]; if (!e) return prev;
      const loaded = loadSnap(prev, e.st);
      return pushHistPure(loaded, label || 'Restored: ' + e.label);
    });
    setStageTick(t => t + 1);
  }, []);
  const undo = useCallback(() => {
    const st = SRef.current;
    if (st.hist.length < 2) { toast('Nothing to undo yet.'); return; }
    restore(st.hist.length - 2, 'Undid: ' + st.hist[st.hist.length - 1].label);
  }, [restore, toast]);

  /* ---- assets ---- */
  const shrink = (f: File) => new Promise<{ url: string; w: number; h: number } | null>(res => {
    const u = URL.createObjectURL(f); const im = new Image();
    im.onload = () => {
      const png = /png|svg|webp|gif/.test(f.type); const m = png ? 320 : 640;
      const k = Math.min(1, m / (Math.max(im.width, im.height) || 1));
      const c = document.createElement('canvas');
      c.width = Math.max(1, (im.width * k) | 0); c.height = Math.max(1, (im.height * k) | 0);
      c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      res({ url: c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.72), w: im.width, h: im.height });
    };
    im.onerror = () => res(null); im.src = u;
  });
  const addFiles = useCallback(async (fl: FileList | File[]) => {
    let n = 0;
    for (const f of Array.from(fl)) {
      const type = f.type.startsWith('image') ? 'img' : f.type.startsWith('audio') ? 'aud' : null;
      if (!type) { toast(`“${f.name}” isn’t an image or audio file.`); continue; }
      if (f.size > 1e7) { toast(`“${f.name}” is over 10 MB. Try a smaller file.`); continue; }
      const a: Asset = { id: 'a' + Math.random().toString(36).slice(2, 8), name: f.name, type: type as 'img' | 'aud', desc: '', url: '' };
      if (type === 'img') {
        const r = await shrink(f); if (!r) { toast(`Couldn’t read “${f.name}”.`); continue; }
        a.url = r.url; a.w = r.w; a.h = r.h;
        setLib(prev => {
          const next = [{ id: a.id, name: a.name, url: a.url, desc: '', type: 'img' } as Asset, ...prev.filter(x => x.url !== a.url)].slice(0, 12);
          ls.set('lumen:lib', next); return next;
        });
      } else a.url = URL.createObjectURL(f);
      setS(p => ({ ...p, assets: [...p.assets, a] })); n++;
    }
    if (n) { if (SRef.current.scenes.length) commitSoon(`Added ${n} asset${n > 1 ? 's' : ''}`); toast(`${n} asset${n > 1 ? 's' : ''} added.`); }
  }, [commitSoon, toast]);
  const colorName = (url: string) => new Promise<string>(r => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 8;
      const x = c.getContext('2d')!; x.drawImage(im, 0, 0, 8, 8);
      const d = x.getImageData(0, 0, 8, 8).data;
      let R = 0, G = 0, B = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G += d[i + 1]; B += d[i + 2]; }
      R /= 64; G /= 64; B /= 64;
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 510;
      const s = mx === mn ? 0 : (mx - mn) / (255 * (1 - Math.abs(2 * l - 1)) || 1);
      let h = 0;
      if (mx !== mn) { const dd = mx - mn; h = mx === R ? ((G - B) / dd) % 6 : mx === G ? (B - R) / dd + 2 : (R - G) / dd + 4; h = (h * 60 + 360) % 360; }
      r(l < 0.18 ? 'dark' : l > 0.85 ? 'light' : s < 0.15 ? 'grey' : h < 15 || h >= 345 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'yellow' : h < 160 ? 'green' : h < 200 ? 'teal' : h < 260 ? 'blue' : h < 310 ? 'purple' : 'pink');
    };
    im.onerror = () => r(''); im.src = url;
  });
  const describeAsset = async (a: Asset) => {
    const w = a.name.replace(/\.\w+$/, '').split(/[-_\s.]+/).filter(x => /^[a-z]{3,}$/i.test(x) && !/^(img|image|photo|screenshot|dsc|pxl|scan|copy)$/i.test(x));
    const col = await colorName(a.url);
    const o = a.w && a.h ? (a.w > a.h * 1.15 ? 'landscape' : a.h > a.w * 1.15 ? 'portrait' : 'square') : '';
    return (w.length ? w.join(' ') : 'Image') + (o || col ? ` (${[o, col && 'mostly ' + col].filter(Boolean).join(', ')})` : '');
  };
  const autoplace = (st: SState): SState => {
    let n = 0;
    const assets = st.assets;
    let logo = st.logo, music = st.music;
    assets.filter(a => a.type === 'img').forEach(a => { if (/logo|brand|badge/i.test(a.desc) && !logo) { logo = a.id; n++; } });
    const au = assets.find(a => a.type === 'aud'); if (au && !music) { music = au.id; n++; }
    const scenes = st.scenes.map(s => {
      if (s.bg) return s;
      let best: Asset | null = null, bs = 0;
      assets.filter(a => a.type === 'img' && a.id !== logo).forEach(a => { const sc = score(a, s.title + ' ' + s.text); if (sc > bs) { bs = sc; best = a; } });
      if (best) { n++; return { ...s, bg: (best as Asset).id }; }
      return s;
    });
    if (n) toast(`Placed ${n} asset${n > 1 ? 's' : ''}.`);
    return { ...st, logo, music, scenes };
  };

  /* ---- research (AI with offline fallback) ---- */
  const tt = () => SRef.current.topic.trim().replace(/^(explain|teach)\s+/i, '').replace(/[.?]+$/, '');
  const runResearch = useCallback(async () => {
    stopSpeech(); go(6);
    const t = tt();
    const steps = [`Searching “${t}”`, 'Reading sources and cross-checking facts', `Shaping the story for ${SRef.current.aud.toLowerCase()}`, 'Drafting the outline'];
    setResearch({ steps, cur: -1 });
    const p = fetch('/api/ai/research', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: SRef.current.topic, audience: SRef.current.aud, length: SRef.current.len }),
    }).then(r => r.json()).catch(() => null);
    for (let i = 0; i < steps.length; i++) { setResearch({ steps, cur: i }); await sleep(650); }
    const res = await p;
    setResearch({ steps: [], cur: -1 });
    const scenes: LScene[] = res && res.ok && Array.isArray(res.scenes) && res.scenes.length
      ? res.scenes.map((x: { title?: string; text?: string }) => ({ title: String(x.title || 'Scene'), text: String(x.text || ''), dur: Math.round(SRef.current.len / res.scenes.length), bg: '' }))
      : draftScenes(SRef.current.topic, SRef.current.len);
    const claims: Claim[] = res && res.ok && Array.isArray(res.claims) && res.claims.length
      ? res.claims.map((c: { txt?: string; conf?: string }) => ({ txt: String(c.txt || ''), conf: (['High', 'Medium', 'Low'].includes(String(c.conf)) ? c.conf : 'Medium') as Claim['conf'], ok: c.conf === 'High' }))
      : scenes.map((s, i) => draftClaims(SRef.current.topic, [s])[i] || { txt: `Scene ${i + 1} states facts about ${t}.`, conf: 'Medium' as const, ok: false });
    const srcs: [string, string][] = res && res.ok && Array.isArray(res.srcs) && res.srcs.length
      ? res.srcs.map((s: [string, string]) => [String(s[0]), String(s[1] || '')])
      : draftSrcs();
    const provider = res && res.ok ? ('ai' as const) : ('offline' as const);
    if (provider === 'offline') toast('AI service offline — using the built-in draft outline.');
    setS(prev => ({ ...prev, scenes, claims, srcs, researchProvider: provider }));
    go(7);
  }, [go, stopSpeech, toast]);

  const approve = useCallback(() => {
    const st = SRef.current;
    const title = topicTitle(st.topic);
    const pid = st.pid || 'p' + Date.now();
    const d = Math.round(st.len / st.scenes.length);
    let next: SState = { ...st, pid, title, scenes: st.scenes.map(s => ({ ...s, dur: d })), idx: 0, t: 0, hist: [] };
    next = autoplace(next);
    next = pushHistPure(next, 'Created video');
    next = { ...next, changed: [] };
    setS(next); saveProject(next);
    setChat([{ who: 'ai', t: 'Your video is ready. Ask me to change anything: scenes, wording, length, style or assets. Every edit can be undone.' }]);
    go(8);
    /* prefetch narration in the background */
    (async () => { for (const s of next.scenes) await ttsBuffer(s.text, next.voice); })();
  }, [go, saveProject, ttsBuffer]);

  /* ---- lumen studio playback ---- */
  const lumenTotal = S.scenes.reduce((a, s) => a + s.dur, 0);
  const updLDom = (t: number, total: number) => {
    if (lTimeRef.current) lTimeRef.current.textContent = `${fmt(t)} / ${fmt(total)}`;
    if (lPhRef.current && lTracksRef.current) {
      const w = lTracksRef.current.getBoundingClientRect().width - 52;
      lPhRef.current.style.left = `calc(52px + ${w * Math.min(1, total ? t / total : 0)}px)`;
    }
  };
  const prefetchScene = useCallback((i: number) => {
    const st = SRef.current; const sc = st.scenes[i]; if (!sc) return;
    ttsBuffer(sc.text, st.voice);
  }, [ttsBuffer]);
  const startLumen = useCallback(() => {
    const eng = getLuAudio(); eng.unlock(); eng.setMuted(muted);
    playingRef.current = true; setS(p => ({ ...p, playing: true }));
    lplayRef.current = { t0: performance.now(), start: tRef.current };
    const st = SRef.current;
    if (st.musicOn) eng.musicStart(st.music ? st.assets.find(a => a.id === st.music)?.url || null : null);
    speakScene(idxRef.current);
    for (let i = idxRef.current; i < st.scenes.length; i++) prefetchScene(i);
  }, [muted, speakScene, prefetchScene]);
  const pauseLumen = useCallback(() => {
    playingRef.current = false; setS(p => ({ ...p, playing: false }));
    lplayRef.current = null;
    getLuAudio().stopVoice(); getLuAudio().musicStop(); stopSpeech();
  }, [stopSpeech]);
  const jumpScene = useCallback((i: number) => {
    const st = SRef.current;
    i = Math.max(0, Math.min(st.scenes.length - 1, i));
    idxRef.current = i; tRef.current = 0;
    setS(p => ({ ...p, idx: i, t: 0 }));
    setStageTick(t => t + 1);
    getLuAudio().sfx(styByName(st.sty).tr);
    if (playingRef.current) {
      lplayRef.current = { t0: performance.now(), start: 0 };
      getLuAudio().stopVoice(); speakScene(i);
    }
  }, [speakScene]);

  /* ---- manifest-mode: load video ---- */
  const loadVideo = useCallback(async (id: string) => {
    setVid(id);
    const base = id === 'nn-video' ? '/videos/nn-video' : `/generated/${id}`;
    try {
      const r = await fetch(`${base}/manifest.json`);
      const m: Manifest = await r.json();
      getLuAudio().clear();
      setMf(m);
      chapRef.current = 0; setChapterIdx(0);
      mtRef.current = 0; setMt(0);
      mPlayingRef.current = false; setMPlaying(false);
      preloadedRef.current.clear();
      setMVoice(m.audio?.voice?.startsWith('aura') ? m.audio.voice : 'aura-2-thalia-en');
    } catch { setMf(null); toast('Could not load that pack.'); }
  }, [toast]);
  const openManifest = useCallback((id: string) => {
    pauseAll();
    setS(p => ({ ...p, kind: 'manifest', manifestId: id, playing: false }));
    setChat([{ who: 'ai', t: 'This is a fully narrated AI video pack — deterministic scenes, real recorded narration. Scrub anywhere. Ask AI to generate a brand-new pack, re-record narration with a Deepgram voice, or export an MP4.' }]);
    loadVideo(id);
    go(8);
  }, [pauseAll, loadVideo, go]);
  const openProject = useCallback((id: string) => {
    const p = ls.get<Record<string, LProject>>('lumen:projects', {})[id]; if (!p) return;
    pauseAll();
    setS(prev => {
      let next: SState = { ...fresh(), pid: p.id, title: p.title, topic: p.topic, aud: p.aud, len: p.len, ar: p.ar, assets: p.assets, hist: p.hist, kind: 'lumen' };
      if (p.hist.length) next = loadSnap(next, p.hist[p.hist.length - 1].st);
      return { ...next, idx: 0, changed: [] };
    });
    idxRef.current = 0; tRef.current = 0;
    setChat([{ who: 'ai', t: 'Welcome back. Your project is restored. Audio assets aren’t saved, so re-add any music.' }]);
    go(8);
  }, [pauseAll, go]);

  /* manifest narration status */
  const narration = (() => {
    if (!mf) return null;
    const perCh = mf.chapters.map(c => {
      const withAudio = c.captions.filter(x => (x.audioDur || 0) > 0).length;
      const covered = c.captions.reduce((a, x) => a + Math.min(x.audioDur || 0, x.dur), 0);
      return { withAudio, total: c.captions.length, fill: c.duration ? Math.min(100, (covered / c.duration) * 100) : 0 };
    });
    return { perCh, totalCaps: perCh.reduce((a, c) => a + c.total, 0), totalAudio: perCh.reduce((a, c) => a + c.withAudio, 0) };
  })();
  useEffect(() => {
    (async () => {
      if (!mf) return;
      const caps = mf.chapters.flatMap(c => c.captions);
      if (!caps.length) { setAudioOk('missing'); return; }
      const complete = caps.every(c => (c.audioDur || 0) > 0) && mf.audio.prepared !== false;
      const base = mf.id === 'nn-video' ? '/videos/nn-video' : `/generated/${mf.id}`;
      const exists = await fetch(`${base}/${caps[0].audio}`, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
      setAudioOk(complete && exists ? 'ready' : 'missing');
    })();
  }, [mf]);

  /* stage sizing for the iframe scene */
  useEffect(() => {
    const fit = () => {
      const el = stageRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const scale = Math.min(r.width / 1920, r.height / 1080);
      if (iframeRef.current) iframeRef.current.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };
    fit();
    const tm = setTimeout(fit, 300);
    window.addEventListener('resize', fit);
    return () => { clearTimeout(tm); window.removeEventListener('resize', fit); };
  }, [mf, panelTab, step]);

  const preloadChapter = useCallback(async (idx2: number) => {
    if (!mfRef.current) return;
    const base = vid === 'nn-video' ? '/videos/nn-video' : `/generated/${vid}`;
    const ch = mfRef.current.chapters[idx2]; if (!ch) return;
    await Promise.all(ch.captions.map(async c => {
      const url = `${base}/${c.audio}`;
      if (preloadedRef.current.has(url)) return;
      preloadedRef.current.add(url);
      await getLuAudio().load(url);
    }));
  }, [vid]);
  const scheduleCaptionAudio = useCallback((idx2: number, fromT: number) => {
    if (!mfRef.current) return;
    const base = vid === 'nn-video' ? '/videos/nn-video' : `/generated/${vid}`;
    const ch = mfRef.current.chapters[idx2]; if (!ch) return;
    const caps = ch.captions.map(cap => ({ cap, globalT: 0 }));
    getLuAudio().schedule(caps, fromT, cap => getLuAudio().buf(`${base}/${cap.audio}`));
  }, [vid]);
  const setIframeScene = useCallback((idx2: number) => {
    if (!mfRef.current) return;
    const ch = mfRef.current.chapters[idx2]; if (!ch) return;
    const base = vid === 'nn-video' ? '/videos/nn-video' : `/generated/${vid}`;
    if (iframeRef.current) iframeRef.current.src = `${base}/${ch.scene}`;
    setTimeout(() => {
      const win = iframeRef.current?.contentWindow as unknown as { __ready?: Promise<void>; __seek?: (t: number) => void } | undefined;
      if (win?.__ready) win.__ready.then(() => { try { win.__seek!(mtRef.current); } catch {} }).catch(() => {});
    }, 350);
  }, [vid]);
  useEffect(() => { if (mf) setIframeScene(chapterIdx); }, [mf, chapterIdx, setIframeScene]);

  const seekM = useCallback((nt: number, scheduleAudio = true) => {
    if (!mfRef.current) return;
    const ch = mfRef.current.chapters[chapRef.current]; if (!ch) return;
    nt = Math.max(0, Math.min(ch.duration - 0.001, nt));
    mtRef.current = nt; setMt(nt);
    const win = iframeRef.current?.contentWindow as unknown as { __seek?: (t: number) => void } | undefined;
    if (win?.__seek) { try { win.__seek(nt); } catch {} }
    if (scheduleAudio && mPlayingRef.current) scheduleCaptionAudio(chapRef.current, nt);
    if (mplayRef.current) mplayRef.current = { t0: performance.now(), start: nt };
  }, [scheduleCaptionAudio]);
  const gotoChapter = useCallback((idx2: number) => {
    if (!mfRef.current) return;
    const clamped = Math.max(0, Math.min(mfRef.current.chapters.length - 1, idx2));
    chapRef.current = clamped; setChapterIdx(clamped);
    mtRef.current = 0; setMt(0);
    mplayRef.current = mPlayingRef.current ? { t0: performance.now(), start: 0 } : null;
    getLuAudio().stopVoice();
    getLuAudio().sfx('s');
    if (mPlayingRef.current) preloadChapter(clamped).then(() => { if (mPlayingRef.current && chapRef.current === clamped) scheduleCaptionAudio(clamped, 0); });
  }, [preloadChapter, scheduleCaptionAudio]);
  const playM = useCallback(async () => {
    if (!mfRef.current) return;
    const eng = getLuAudio();
    eng.setMuted(muted); eng.unlock();
    mPlayingRef.current = true; setMPlaying(true);
    mplayRef.current = { t0: performance.now(), start: mtRef.current };
    const st = SRef.current;
    if (st.musicOn) eng.musicStart(st.music ? st.assets.find(a => a.id === st.music)?.url || null : null);
    await preloadChapter(chapRef.current);
    scheduleCaptionAudio(chapRef.current, mtRef.current);
  }, [muted, preloadChapter, scheduleCaptionAudio]);
  const pauseM = useCallback(() => {
    mPlayingRef.current = false; setMPlaying(false);
    getLuAudio().stopVoice(); getLuAudio().musicStop();
    mplayRef.current = null;
  }, []);

  /* keep latest callbacks for the rAF loop */
  cbRef.current = { pauseL: pauseLumen, speakScene, setIFrame: setIframeScene, preload: preloadChapter, schedCaps: scheduleCaptionAudio, pauseM };

  /* ---- master rAF loop (both modes) ---- */
  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const eng = getLuAudio();
      /* lumen clock */
      if (playingRef.current && SRef.current.kind === 'lumen') {
        const pr = lplayRef.current;
        if (pr) {
          const nt = pr.start + (performance.now() - pr.t0) / 1000;
          const scenes = SRef.current.scenes;
          const total = scenes.reduce((a, s) => a + s.dur, 0);
          let acc = 0, k = 0;
          for (; k < scenes.length; k++) { if (nt < acc + scenes[k].dur) break; acc += scenes[k].dur; }
          if (k >= scenes.length || nt >= total - 0.02) {
            tRef.current = total; updLDom(total, total);
            cbRef.current.pauseL();
            return;
          }
          tRef.current = nt - acc;
          updLDom(nt, total);
          if (k !== idxRef.current) {
            idxRef.current = k;
            setS(p => ({ ...p, idx: k, t: 0 }));
            setStageTick(t => t + 1);
            eng.sfx(styByName(SRef.current.sty).tr);
            cbRef.current.speakScene(k);
          }
        }
      }
      /* manifest clock */
      else if (mPlayingRef.current && mfRef.current) {
        const pr = mplayRef.current;
        if (pr) {
          const nt = pr.start + (performance.now() - pr.t0) / 1000;
          const ch = mfRef.current.chapters[chapRef.current];
          if (ch && nt >= ch.duration - 0.02) {
            if (chapRef.current < mfRef.current.chapters.length - 1) {
              const next = chapRef.current + 1;
              chapRef.current = next; setChapterIdx(next);
              mplayRef.current = { t0: performance.now(), start: 0 };
              mtRef.current = 0; setMt(0);
              eng.stopVoice();
              eng.sfx('s');
              cbRef.current.setIFrame(next);
              cbRef.current.preload(next).then(() => { if (mPlayingRef.current && chapRef.current === next) cbRef.current.schedCaps(next, 0); });
            } else {
              mPlayingRef.current = false; setMPlaying(false);
              eng.stopVoice(); eng.musicStop();
              mplayRef.current = null;
              setMt(ch.duration - 0.01);
            }
          } else { mtRef.current = nt; setMt(nt); }
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  /* ---- tracks pointer seek (manifest) ---- */
  const total = mf?.chapters.reduce((n, c) => n + c.duration, 0) || 0;
  const globalStart = mf?.chapters.slice(0, chapterIdx).reduce((n, c) => n + c.duration, 0) || 0;
  const seekGlobal = useCallback((clientX: number) => {
    const el = tracksRef.current; if (!el || !mfRef.current || !total) return;
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    let g = p * total, k = 0, acc = 0;
    const chs = mfRef.current.chapters;
    for (; k < chs.length; k++) { if (g < acc + chs[k].duration) break; acc += chs[k].duration; }
    if (k >= chs.length) { k = chs.length - 1; acc = total - chs[k].duration; g = total - 0.01; }
    const local = Math.max(0, Math.min(chs[k].duration - 0.001, g - acc));
    if (k !== chapRef.current) {
      chapRef.current = k; setChapterIdx(k);
      mtRef.current = local; setMt(local);
      mplayRef.current = mPlayingRef.current ? { t0: performance.now(), start: local } : null;
      getLuAudio().stopVoice();
      if (mPlayingRef.current) preloadChapter(k).then(() => { if (mPlayingRef.current && chapRef.current === k) scheduleCaptionAudio(k, local); });
    } else seekM(local);
  }, [total, preloadChapter, scheduleCaptionAudio, seekM]);
  const onTracksPointer = useCallback((e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    seekGlobal(e.clientX);
    const mv = (ev: PointerEvent) => seekGlobal(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }, [seekGlobal]);

  /* ---- render-service jobs (manifest mode) ---- */
  const callService = useCallback(async (path: string, body: Record<string, unknown>) => {
    const r = await fetch(`/api/relay/${path.replace(/^\/+/, '')}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.json();
  }, []);
  const vidRef = useRef(vid); useEffect(() => { vidRef.current = vid; }, [vid]);
  const loadRef = useRef(loadVideo); useEffect(() => { loadRef.current = loadVideo; }, [loadVideo]);
  const watchJob = useCallback((jobId: string, kind: string) => {
    setJob({ id: jobId, pct: 0, status: 'running', steps: [], error: null, kind });
    const es = new EventSource(`/api/relay/job/${jobId}/stream`);
    es.onmessage = ev => {
      const d = JSON.parse(ev.data);
      if (d.type === 'hello') setJob(j => j && ({ ...j, pct: d.pct, status: d.status, steps: d.steps || [], error: d.error || null, result: d.result }));
      else if (d.type === 'log') setJob(j => j && ({ ...j, steps: [...j.steps, d.msg].slice(-120) }));
      else if (d.type === 'progress') setJob(j => j && ({ ...j, pct: d.pct }));
      else if (d.type === 'error') setJob(j => j && ({ ...j, status: 'failed', error: d.error }));
      else if (d.type === 'done') {
        setJob(j => j && ({ ...j, status: 'done', pct: 100, result: d.result }));
        es.close();
        if (d.result && !d.result.error) {
          if (kind === 'generate' && d.result.title) toast(`“${d.result.title}” is ready — open it in Videos.`);
          else if (kind === 'export') toast('Export finished — MP4 is in /exports.');
          else if (kind === 'tts') toast('Narration recorded.');
        }
        setTimeout(() => { loadRef.current(vidRef.current); fetch('/generated/registry.json').then(r => r.json()).then(g => setPacks(p => [...p.filter(x => x.id === 'nn-video'), ...(g || []).filter((x: PackMeta) => x.id !== 'nn-video')])).catch(() => {}); }, 600);
      }
    };
    es.onerror = () => { /* polling fallback */ };
  }, [toast]);
  const prepareNarration = useCallback(async () => {
    getLuAudio().unlock();
    const r = await callService('tts/prepare', { video: vid, voice: mVoice, key: dgKey || undefined });
    if (r.jobId) watchJob(r.jobId, 'tts');
    else if (r.error) toast(String(r.error).slice(0, 120));
  }, [callService, vid, mVoice, dgKey, watchJob, toast]);
  const startExport = useCallback(async () => {
    const r = await callService('export', { video: vid, chapter: exportScope === 'chapter' ? mf?.chapters[chapterIdx]?.id : null, fps: 30 });
    if (r.jobId) { setExportOpen(false); watchJob(r.jobId, 'export'); }
    else if (r.error) toast(String(r.error).slice(0, 120));
  }, [callService, vid, mf, chapterIdx, exportScope, watchJob, toast]);
  const startGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    const r = await callService('generate', { prompt, chapters: nChapters });
    if (r.jobId) watchJob(r.jobId, 'generate');
    else if (r.error) toast(String(r.error).slice(0, 120));
  }, [callService, prompt, nChapters, watchJob, toast]);

  /* ---- Ask AI (LLM with rule-based fallback) ---- */
  const applyOps = (ops: EditOp[], st: SState): SState => {
    let next = { ...st, scenes: [...st.scenes] };
    for (const op of ops) {
      if (op.op === 'setScene') {
        const i = Math.max(0, Math.min(next.scenes.length - 1, op.i));
        if (next.scenes[i]) next.scenes[i] = { ...next.scenes[i], ...op.patch };
      } else if (op.op === 'addScene') {
        const i = Math.max(0, Math.min(next.scenes.length, op.i));
        next.scenes.splice(i, 0, { ...op.scene });
      } else if (op.op === 'removeScene') {
        if (next.scenes.length > 1) next.scenes.splice(Math.max(0, Math.min(next.scenes.length - 1, op.i)), 1);
      } else if (op.op === 'fitAll') {
        next.scenes = next.scenes.map(s => {
          const b = getLuAudio().buf(`tts:${next.voice}:${s.text}`);
          const d = b ? b.duration : est(s, next.speed);
          return { ...s, dur: Math.max(3, Math.ceil(d + next.pause)) };
        });
      } else if (op.op === 'setStyle') {
        if (STY.some(s => s.n === op.name)) next.sty = op.name;
      } else if (op.op === 'setVoice') {
        if (VOICES.some(v => v.id === op.voice)) next.voice = op.voice;
      } else if (op.op === 'setMusic') {
        if (next.assets.some(a => a.id === op.assetId && a.type === 'aud')) next.music = op.assetId;
      } else if (op.op === 'setLogo') {
        if (next.assets.some(a => a.id === op.assetId)) next.logo = op.assetId;
      } else if (op.op === 'setBg') {
        const i = Math.max(0, Math.min(next.scenes.length - 1, op.i));
        if (next.scenes[i] && next.assets.some(a => a.id === op.assetId)) next.scenes[i] = { ...next.scenes[i], bg: op.assetId };
      }
    }
    return next;
  };
  const doAsk = useCallback(async (q: string) => {
    setChat(c => [...c, { who: 'me', t: q }]);
    setPanelOpen(true);
    setThinking(true);
    const st = SRef.current;
    let ops: EditOp[] = []; let reply = '';
    try {
      const r = await fetch('/api/ai/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q, idx: st.idx, style: st.sty, voice: st.voice,
          scenes: st.scenes.map(s => ({ title: s.title, text: s.text, dur: s.dur })),
          assets: st.assets.map(a => ({ id: a.id, name: a.name, desc: a.desc, type: a.type })),
        }),
      });
      if (r.ok) {
        const j = await r.json();
        if (j?.ok && Array.isArray(j.ops) && j.ops.length) { ops = j.ops; reply = String(j.reply || 'Done.'); }
      }
    } catch { /* offline */ }
    if (!ops.length) {
      const rb = aiEditRules(q, { scenes: st.scenes, idx: st.idx, assets: st.assets, len: st.len });
      ops = rb.ops; reply = rb.reply;
    }
    setThinking(false);
    if (!ops.length) {
      setChat(c => [...c, { who: 'ai', t: 'I can change scene length, wording, titles, order, assets, style and narrator. Try “make scene 3 longer”, “use my diagram in scene 2”, or “change the title of scene 1 to …”.' }]);
      return;
    }
    const applied = applyOps(ops, st);
    const committed = pushHistPure(applied, q.length > 40 ? q.slice(0, 40) + '…' : q);
    setS(committed); saveProject(committed);
    setStageTick(t => t + 1);
    const undoIdx = committed.hist.length - 1;
    setChat(c => [...c, { who: 'ai', t: reply + (committed.changed.length ? ' Changed scenes are marked in orange.' : ''), undo: undoIdx }]);
  }, [saveProject]);

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setExportOpen(false); setBrandOpen(false); setRenderOpen(false); return; }
      if (step !== 8) return;
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
      if (typing) return;
      getLuAudio().unlock();
      if (e.code === 'Space') {
        e.preventDefault();
        if (SRef.current.kind === 'manifest') { if (mPlayingRef.current) cbRef.current.pauseM(); else playM(); }
        else if (playingRef.current) pauseLumen(); else startLumen();
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const d = e.key === 'ArrowRight' ? 1 : -1;
        if (SRef.current.kind === 'manifest') seekM(mtRef.current + d * (e.shiftKey ? 5 : 1));
        else jumpScene(idxRef.current + d);
      } else if (e.key === 'ArrowDown') { e.preventDefault(); if (SRef.current.kind === 'manifest') gotoChapter(chapRef.current + 1); else jumpScene(idxRef.current + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (SRef.current.kind === 'manifest') gotoChapter(chapRef.current - 1); else jumpScene(idxRef.current - 1); }
    };
    const onPointer = () => getLuAudio().unlock();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer); };
  }, [step, undo, seekM, gotoChapter, playM, pauseLumen, startLumen, jumpScene]);

  /* derived */
  const sty = styByName(S.sty);
  const curScene = S.scenes[S.idx] || null;
  const styCats = CATS;
  const styleList = S.cat === 'All' ? STY : STY.filter(s => s.c === S.cat);
  const chap = mf?.chapters[chapterIdx];
  const currentCaption = chap?.captions.find(c => mt >= c.t && mt < c.t + Math.max(c.dur, (c.audioDur || 0)) + 0.4);
  const jobHint = job?.status === 'running'
    ? `${job.kind === 'generate' ? 'Generating' : job.kind === 'export' ? 'Rendering' : 'Recording narration'}… ${job.pct}%`
    : job?.status === 'failed' ? 'Job failed — details in the Ask AI panel.'
    : S.kind === 'manifest' ? 'Preview is approximate. The exported MP4 is full quality.' : 'Preview plays real narration when the AI voice service is reachable.';
  const running = job?.status === 'running';
  const playheadFrac = total ? Math.min(1, (globalStart + mt) / total) : 0;

  const upd = (patch: Partial<SState>) => setS(p => ({ ...p, ...patch }));

  /* new video / brand kit */
  const newVideo = () => {
    const l = lib;
    setS(() => {
      let n = fresh();
      if ((brand as { voice?: string }).voice) n.voice = (brand as { voice: string }).voice;
      if ((brand as { style?: string }).style) n.sty = (brand as { style: string }).style;
      if ((brand as { logo?: string }).logo) {
        n.assets = [...n.assets, { id: 'brandlogo', name: 'Brand logo', type: 'img', desc: 'Brand logo', url: (brand as { logo: string }).logo }];
        n.logo = 'brandlogo';
      }
      return n;
    });
    void l;
    go(1);
  };
  const copyText = async (t: () => string, m: string) => {
    try { await navigator.clipboard.writeText(t()); toast(m); } catch { toast('Copy isn’t allowed here. Select the text and copy it manually.'); }
  };

  /* ================================ UI ================================ */
  return (
    <div className="lu" onPointerDown={() => getLuAudio().unlock()}>
      <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      <nav className="nav">
        <button className={`back${step >= 1 && step <= 5 ? ' on' : ''}`} onClick={() => go(Math.max(0, step - 1))} aria-label="Back">‹</button>
        <div className={`dots${step >= 1 && step <= 5 ? ' on' : ''}`}>{[0, 1, 2, 3, 4].map(i => <i key={i} className={i === step - 1 ? 'on' : ''} />)}</div>
        <button className="th" onClick={toggleTheme} aria-label="Toggle theme">◐</button>
      </nav>

      <div className="app">

        {/* ---------- 0 · HOME ---------- */}
        <section className={`scr${step === 0 ? ' on' : step < 0 ? ' out' : ''}`}>
          <div className="in">
            <div className="sp" />
            <div className={`hello${greetIdx === 0 ? '' : ''}`} key={greetIdx}>{GREET[greetIdx]}</div>
            <h1 style={{ marginTop: 8 }}>Make a video<br />from an idea.</h1>
            <p className="sub">Hyperframes researches your topic, writes the script, adds your own assets, and narrates it.</p>
            <div id="projs">
              {projs.length ? <h2 style={{ marginTop: 0 }}>Your videos</h2> : null}
              {projs.map(p => {
                const styp = p.hist.length ? styByName(JSON.parse(p.hist[p.hist.length - 1].st).sty) : STY[0];
                const nsc = p.hist.length ? JSON.parse(p.hist[p.hist.length - 1].st).scenes.length : 0;
                return (
                  <div key={p.id} className="proj glass" onClick={() => openProject(p.id)} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter') openProject(p.id); }}>
                    <div className="sw" style={{ background: `linear-gradient(135deg,${styp.a},${styp.b})` }} />
                    <div><b>{p.title}</b><small>{nsc} scenes · {styp.n} · {ago(p.updated)}</small></div>
                    <button className="x" onClick={e => { e.stopPropagation(); const all = ls.get<Record<string, LProject>>('lumen:projects', {}); delete all[p.id]; ls.set('lumen:projects', all); refreshHome(); toast('Project deleted.'); }} aria-label="Delete project">✕</button>
                  </div>
                );
              })}
              <h2>AI video packs</h2>
              {packs.map(p => (
                <div key={p.id} className="proj glass" onClick={() => openManifest(p.id)} role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') openManifest(p.id); }}>
                  <div className="sw" style={{ background: swatch(p.id) }} />
                  <div><b>{p.title}</b><small>{p.chapters} chapters · narrated · {p.created ? ago(p.created) : 'bundled'}</small></div>
                </div>
              ))}
            </div>
            <button className="big" onClick={newVideo}>New video</button>
            <button className="link" onClick={() => { setBVoice((brand as { voice?: string }).voice || 'aura-2-thalia-en'); setBStyle((brand as { style?: string }).style || STY[0].n); setBLogo((brand as { logo?: string }).logo || null); setBrandOpen(true); }}>Brand kit</button>
            <div className="sp" />
          </div>
        </section>

        {/* ---------- 1 · TOPIC ---------- */}
        <section className={`scr${step === 1 ? ' on' : step < 1 ? ' out' : ''}`}>
          <div className="in">
            <h1>What do you want to teach?</h1>
            <p className="sub">Describe it the way you’d tell a colleague.</p>
            <textarea value={S.topic} onChange={e => upd({ topic: e.target.value })} placeholder="Explain how photosynthesis works for 8th graders, with one everyday example" />
            <div className="chips">
              {['How a neural network learns to read digits', 'How photosynthesis works', 'Intro to compound interest', 'Our safety onboarding', 'Causes of World War I'].map(i => (
                <button key={i} className="chip" onClick={() => upd({ topic: i })}>{i}</button>
              ))}
            </div>
            <div className="sp" />
            <button className="big" disabled={!S.topic.trim()} onClick={() => go(2)}>Continue</button>
          </div>
        </section>

        {/* ---------- 2 · AUDIENCE ---------- */}
        <section className={`scr${step === 2 ? ' on' : step < 2 ? ' out' : ''}`}>
          <div className="in">
            <h1>Who’s watching?</h1>
            <p className="sub">This shapes the tone, pace and format.</p>
            <div className="grp"><b>Audience</b>
              <div className="opts">
                {['Students', 'Trainees', 'General viewers', 'Executives'].map(a => (
                  <button key={a} className={`chip${S.aud === a ? ' on' : ''}`} onClick={() => upd({ aud: a })}>{a}</button>
                ))}
              </div>
            </div>
            <div className="grp"><b>Length</b>
              <div className="opts">
                {[[60, '1 min'], [120, '2 min'], [180, '3 min']].map(([v, l]) => (
                  <button key={v} className={`chip${S.len === v ? ' on' : ''}`} onClick={() => upd({ len: v as number })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="grp"><b>Format</b>
              <div className="opts">
                {[[1.778, 'Landscape'], [0.5625, 'Vertical'], [1, 'Square']].map(([v, l]) => (
                  <button key={l} className={`chip${S.ar === v ? ' on' : ''}`} onClick={() => upd({ ar: v as number })}>{l}</button>
                ))}
              </div>
            </div>
            <div className="sp" />
            <button className="big" onClick={() => go(3)}>Continue</button>
          </div>
        </section>

        {/* ---------- 3 · ASSETS ---------- */}
        <section className={`scr${step === 3 ? ' on' : step < 3 ? ' out' : ''}`}>
          <div className="in">
            <h1>Bring your own material.</h1>
            <p className="sub">Add images, logos or music and say what each one is. Hyperframes places them where they fit.</p>
            <label className={`drop${dragOver ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}>Drop files or <u>browse</u><br /><small>Images and audio, up to 10 MB each</small></label>
            <input type="file" multiple accept="image/*,audio/*" hidden onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            <div>
              {S.assets.map(a => (
                <div key={a.id} className="arow glass">
                  {a.type === 'img'
                    ? <img src={a.url} alt="" draggable onDragStart={e => e.dataTransfer.setData('text/asset', a.id)} />
                    : <div className="au">♪</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input type="text" value={a.desc} placeholder="What is this? e.g. our school logo" aria-label={`Describe ${a.name}`}
                      onChange={e => upd({ assets: S.assets.map(x => x.id === a.id ? { ...x, desc: e.target.value } : x) })} />
                  </div>
                  {a.type === 'img' ? <button className="mini" onClick={() => upd({ logo: S.logo === a.id ? null : a.id })}>{S.logo === a.id ? 'Logo ✓' : 'Logo'}</button> : null}
                  <button className="x" onClick={() => upd({ assets: S.assets.filter(x => x.id !== a.id), logo: S.logo === a.id ? null : S.logo, music: S.music === a.id ? null : S.music })} aria-label="Remove">✕</button>
                </div>
              ))}
            </div>
            {lib.filter(l => !S.assets.some(a => a.id === l.id)).length ? (
              <div className="lib">
                {lib.filter(l => !S.assets.some(a => a.id === l.id)).map(l => (
                  <img key={l.id} src={l.url} alt={l.name} title={l.name} onClick={() => upd({ assets: [...S.assets, { ...l }] })} />
                ))}
              </div>
            ) : null}
            <div className="sp" />
            <button className="big" onClick={() => go(4)}>{S.assets.length ? 'Continue' : 'Skip for now'}</button>
          </div>
        </section>

        {/* ---------- 4 · STYLE ---------- */}
        <section className={`scr${step === 4 ? ' on' : step < 4 ? ' out' : ''}`}>
          <div className="in" style={{ maxWidth: 720 }}>
            <h1>Choose a look.</h1>
            <p className="sub">51 styles from <a href="https://github.com/lemomo-ai/lemo-opuscar" target="_blank" rel="noopener" style={{ color: 'inherit' }}>Lemo-Opuscar</a> by LemoLab. Colours and motion here are approximations, shown with your topic.</p>
            <div className="big-prev"><Stage key={`big-${S.sty}`} sty={sty} ar={1.778} title={topicTitle(S.topic)} text="Here’s how your opening scene will look and move." /></div>
            <div style={{ textAlign: 'center', marginBottom: 6 }}><button className="mini" onClick={() => setStageTick(t => t + 1)}>Replay motion</button></div>
            <div className="opts" style={{ marginBottom: 10 }}>
              {styCats.map(c => <button key={c} className={`chip${S.cat === c ? ' on' : ''}`} onClick={() => upd({ cat: c })}>{c}</button>)}
            </div>
            <div className="car">
              {styleList.map(s => (
                <button key={s.n} className={`sc${S.sty === s.n ? ' on' : ''}`} onClick={() => upd({ sty: s.n })}>
                  <Stage sty={s} ar={0.75} title={topicTitle(S.topic)} mini />
                  <span>{s.n}</span>
                </button>
              ))}
            </div>
            <div className="sp" />
            <button className="big" onClick={() => go(5)}>Continue</button>
          </div>
        </section>

        {/* ---------- 5 · NARRATOR ---------- */}
        <section className={`scr${step === 5 ? ' on' : step < 5 ? ' out' : ''}`}>
          <div className="in">
            <h1>Pick a narrator.</h1>
            <p className="sub">Natural English from Deepgram Aura. Tap play to hear one — the built-in voice is the free fallback.</p>
            <div>
              {VOICES.map(v => (
                <div key={v.id} className={`vr glass${S.voice === v.id ? ' on' : ''}`} onClick={() => upd({ voice: v.id })} role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') upd({ voice: v.id }); }}>
                  <div><b>{v.name}</b><small>{v.desc}</small></div>
                  {v.provider === 'deepgram' ? <span className="pro">Deepgram Aura-2</span> : <span className="pro">built-in</span>}
                  <button aria-label={`Play ${v.name}`} onClick={e => { e.stopPropagation(); upd({ voice: v.id }); speakPreview(v.id, 'Hi, I’ll be narrating your video. Here’s how I sound.'); }}>▶</button>
                </div>
              ))}
            </div>
            <input type="password" value={dgKey} onChange={e => { setDgKey(e.target.value); setTtsOffline(false); ttsOfflineRef.current = false; }} placeholder="Deepgram API key (optional, kept in this tab only)" autoComplete="off" style={{ marginTop: 6 }} />
            <p className="hint">{voiceErr ? <span className="err" style={{ margin: 0 }}>{voiceErr}</span> : <>Without a key you get the built-in z.ai voice (English, accented). A free Deepgram key unlocks all six Aura-2 voices. {voiceProvider ? `Last preview served by: ${voiceProvider}.` : ''}</>}</p>
            <div className="sp" />
            <button className="big" onClick={runResearch}>Research my topic</button>
          </div>
        </section>

        {/* ---------- 6 · RESEARCHING ---------- */}
        <section className={`scr${step === 6 ? ' on' : step < 6 ? ' out' : ''}`}>
          <div className="in">
            <div className="sp" />
            <h1>Researching.</h1>
            <ul className="log">
              {research.steps.map((s, i) => <li key={i} className={i < research.cur ? 'ok' : i === research.cur ? 'run' : ''}>{s}</li>)}
            </ul>
            <div className="sp" />
          </div>
        </section>

        {/* ---------- 7 · SCRIPT REVIEW ---------- */}
        <section className={`scr${step === 7 ? ' on' : step < 7 ? ' out' : ''}`}>
          <div className="in" style={{ maxWidth: 680 }}>
            <h1>Check the script.</h1>
            <p className="sub">Nothing is built yet. Approve the outline or regenerate it.
              {S.researchProvider === 'ai' ? ' Drafted by the AI research service.' : S.researchProvider === 'offline' ? ' Drafted offline — the AI service was unreachable.' : ''}
            </p>
            <h2>Outline</h2>
            <div>
              {S.scenes.map((s, i) => (
                <div key={i} className="rv glass">
                  <input type="text" value={s.title} aria-label={`Scene ${i + 1} title`}
                    onChange={e => upd({ scenes: S.scenes.map((x, j) => j === i ? { ...x, title: e.target.value } : x) })} />
                  <button className="mini" aria-label="Move up" onClick={() => { if (i > 0) upd({ scenes: [S.scenes[i - 1], S.scenes[i], ...S.scenes.slice(0, i - 1), ...S.scenes.slice(i + 2)] }); }}>↑</button>
                  <button className="mini" aria-label="Move down" onClick={() => { if (i < S.scenes.length - 1) upd({ scenes: [...S.scenes.slice(0, i), S.scenes[i + 1], S.scenes[i], ...S.scenes.slice(i + 2)] }); }}>↓</button>
                  <button className="mini" aria-label="Remove" onClick={() => { if (S.scenes.length > 1) upd({ scenes: S.scenes.filter((_, j) => j !== i) }); }}>✕</button>
                </div>
              ))}
            </div>
            <h2>Claims to check</h2>
            <div>
              {S.claims.map((c, i) => (
                <div key={i} className="cl glass">
                  <label><input type="checkbox" checked={c.ok} onChange={() => upd({ claims: S.claims.map((x, j) => j === i ? { ...x, ok: !x.ok } : x) })} />{c.txt}</label>
                  <em className={c.conf}>{c.conf === 'Low' ? 'Verify' : c.conf + ' confidence'}</em>
                </div>
              ))}
            </div>
            <h2>Sources</h2>
            <p className="hint">{S.researchProvider === 'ai' ? 'Suggested reference types from the research pass. A connected search backend returns real, linked sources here.' : 'Demo placeholders. A connected search backend returns real, linked sources here.'}</p>
            <div>
              {S.srcs.map((s, i) => <div key={i} className="src glass">{s[0]}<small>Used in {s[1]}</small></div>)}
            </div>
            <div className="sp" />
            <button className="big" onClick={approve}>{S.claims.filter(c => !c.ok).length ? `Approve anyway (${S.claims.filter(c => !c.ok).length} unchecked)` : 'Approve and build video'}</button>
            <button className="link" onClick={runResearch}>Regenerate</button>
          </div>
        </section>

        {/* ---------- 8 · STUDIO ---------- */}
        <section className={`scr${step === 8 ? ' on' : ''}`} style={{ paddingTop: 70 }}>
          <div className="studio">

            {/* ===== left column ===== */}
            <div className="lc" style={{ minWidth: 0 }}>
              <div className="bar2">
                <button className="mini" onClick={() => { pauseAll(); go(0); }}>‹ Projects</button>
                <input type="text" value={S.kind === 'manifest' ? (mf?.title || '') : S.title} aria-label="Project name"
                  onChange={e => { upd({ title: e.target.value }); if (S.pid) commitSoon('Renamed project'); }} />
                <span className="hint" style={{ margin: '0 0 0 auto' }}>{S.kind === 'lumen' ? savedAt : (mf?.subtitle || '')}</span>
                {S.kind === 'lumen' ? <button className="mini" onClick={undo}>Undo</button> : null}
              </div>

              {S.kind === 'lumen' ? (
                <>
                  <div key={`st-${S.idx}-${stageTick}`}>
                    <Stage sty={sty} ar={S.ar} title={curScene?.title || ''} text={curScene?.text || ''}
                      bg={S.assets.find(a => a.id === curScene?.bg) || null}
                      logo={S.assets.find(a => a.id === S.logo) || null}
                      onTitle={() => { setAsk(`Change the title of scene ${S.idx + 1} to `); setTgt(`Scene ${S.idx + 1} title`); setPanelTab('ai'); setPanelOpen(true); }}
                      onText={() => { setAsk(`Rewrite the narration of scene ${S.idx + 1} so it `); setTgt(`Scene ${S.idx + 1} narration`); setPanelTab('ai'); setPanelOpen(true); }} />
                  </div>

                  <div className="ctl">
                    <button className="play" onClick={() => (playingRef.current ? pauseLumen() : startLumen())} aria-label={S.playing ? 'pause' : 'play'}>{S.playing ? '❚❚' : '▶'}</button>
                    <span className="hint" style={{ margin: 0 }}>Space to play · ←/→ scenes · ⌘Z undo</span>
                    <div className="time" ref={lTimeRef}>0:00 / {fmt(lumenTotal)}</div>
                  </div>

                  <div className="tracks" ref={lTracksRef}>
                    <div className="row" data-l="Scenes">
                      {S.scenes.map((s, i) => (
                        <button key={i} className={`seg${i === S.idx ? ' cur' : ''}${S.changed.includes(i) ? ' chg' : ''}`} style={{ flex: Math.max(0.6, s.dur) }} onClick={() => jumpScene(i)} aria-label={`Scene ${i + 1}: ${s.title}`} />
                      ))}
                    </div>
                    <div className="row" data-l="Voice">
                      {S.scenes.map(s => {
                        const b = getLuAudio().buf(`tts:${S.voice}:${s.text}`);
                        const e = (b ? b.duration : est(s, S.speed)) + S.pause;
                        return <div key={s.title + s.dur} className={`vb${e > s.dur ? ' over' : ''}`} style={{ flex: Math.max(0.6, s.dur) }} title={e > s.dur ? 'Narration is longer than the scene' : 'Narration fits'}><i style={{ width: `${Math.min(100, e / s.dur * 100)}%` }} /></div>;
                      })}
                    </div>
                    <div className="row" data-l="Media">
                      {S.scenes.map((s, i) => {
                        const b = S.assets.find(x => x.id === s.bg);
                        return <div key={i} className="ab" style={{ flex: Math.max(0.6, s.dur), ...(b ? { backgroundImage: `url(${b.url})` } : {}) }} />;
                      })}
                    </div>
                    <div className="row" data-l="Music">
                      <div className="mus">{S.music ? (S.assets.find(a => a.id === S.music)?.name || 'Music') : 'Generative ambient bed'}</div>
                    </div>
                    <div className="ph" ref={lPhRef} />
                  </div>

                  <div className="pace">
                    <label>Pace <input type="range" min="70" max="130" value={Math.round(S.speed * 100)} onChange={e => { const v = +e.target.value / 100; upd({ speed: v }); }} /> <span>{S.speed.toFixed(1)}×</span></label>
                    <label>Pause <input type="range" min="0" max="20" value={Math.round(S.pause * 10)} onChange={e => { const v = +e.target.value / 10; upd({ pause: v }); }} /> <span>{S.pause.toFixed(1)}s</span></label>
                    <button className="mini" onClick={() => { const st = SRef.current; const scenes = st.scenes.map(s => { const b = getLuAudio().buf(`tts:${st.voice}:${s.text}`); const d = b ? b.duration : est(s, st.speed); return { ...s, dur: Math.max(3, Math.ceil(d + st.pause)) }; }); const next = pushHistPure({ ...st, scenes }, 'Fitted scenes to narration'); setS(next); saveProject(next); toast('Scene lengths now follow the narration.'); }}>Fit scenes to narration</button>
                  </div>

                  <div className={`rbar${running ? ' on' : ''}`}><i style={{ width: `${job?.pct || 0}%` }} /></div>

                  <div className="ctl">
                    <button className="mini" onClick={() => { const eng = getLuAudio(); const on = !S.musicOn; eng.musicOn = on; upd({ musicOn: on }); if (playingRef.current) { if (on) eng.musicStart(S.music ? S.assets.find(a => a.id === S.music)?.url || null : null); else eng.musicStop(); } }}>{S.musicOn ? '♪ Music' : '♪ Muted'}</button>
                    <button className="mini" onClick={() => { const eng = getLuAudio(); eng.fxOn = !S.fxOn; upd({ fxOn: eng.fxOn }); }}>{S.fxOn ? 'FX' : 'FX off'}</button>
                    <span className="hint" style={{ flex: 1, margin: 0 }}>{ttsOffline ? 'Narration falls back to the browser voice (AI voice service offline).' : 'Narration uses the selected AI voice when reachable.'}</span>
                    <button className="big" style={{ width: 'auto', padding: '0 24px', height: 44, margin: 0, fontSize: 15 }} onClick={() => setRenderOpen(true)}>Render video</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="mstage" ref={stageRef}>
                    <iframe ref={iframeRef} title="scene" style={{ width: 1920, height: 1080, transform: 'translate(-50%,-50%)' }}
                      src={mf ? (vid === 'nn-video' ? `/videos/nn-video/${chap?.scene}` : `/generated/${vid}/${chap?.scene}`) : 'about:blank'} />
                    <div className="cap" aria-live="polite">{currentCaption ? <span>{currentCaption.text}</span> : null}</div>
                  </div>

                  <div className="ctl">
                    <button className="play" onClick={() => (mPlayingRef.current ? pauseM() : playM())} aria-label={mPlaying ? 'pause' : 'play'}>{mPlaying ? '❚❚' : '▶'}</button>
                    <button className="mini" onClick={() => { const m = !muted; setMuted(m); getLuAudio().setMuted(m); }}>{muted ? 'Sound off' : 'Sound on'}</button>
                    <span className="hint" style={{ margin: 0 }}>Space to play · ←/→ seek · ↑/↓ chapters</span>
                    <div className="time">{fmt(mt)} / {fmt(chap?.duration || 0)}</div>
                  </div>

                  <div className="tracks" ref={tracksRef} onPointerDown={onTracksPointer} role="slider"
                    aria-label="Timeline — drag to scrub, click a chapter to jump" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(globalStart + mt)}>
                    <div className="row" data-l="Chapters">
                      {mf?.chapters.map((c, i) => (
                        <div key={c.id} className={`seg${i === chapterIdx ? ' cur' : ''}`} style={{ flex: Math.max(0.6, c.duration) }} aria-label={`Chapter ${i + 1}: ${c.title}`} />
                      ))}
                    </div>
                    <div className="row" data-l="Voice">
                      {mf?.chapters.map((c, i) => {
                        const n = narration?.perCh[i];
                        return <div key={c.id} className={`vb${n && n.withAudio < n.total ? ' over' : ''}`} style={{ flex: Math.max(0.6, c.duration) }} title={n ? `narration ${n.withAudio}/${n.total} lines` : undefined}><i style={{ width: `${n ? n.fill : 0}%` }} /></div>;
                      })}
                    </div>
                    <div className="row" data-l="Music"><div className="mus">{S.musicOn ? 'Generative ambient bed' : 'Music off'}</div></div>
                    <div className="ph" style={{ left: `calc(52px + (100% - 52px) * ${playheadFrac})` }} />
                  </div>

                  <div className="pace">
                    <button className="mini" onClick={() => gotoChapter(chapterIdx - 1)} aria-label="previous chapter">‹</button>
                    <button className="mini" onClick={() => gotoChapter(chapterIdx + 1)} aria-label="next chapter">›</button>
                    <span><b>{chapterIdx + 1}/{mf?.chapters.length || 0}</b> · {chap?.kicker} — {chap?.title}</span>
                    <span className="hint">
                      {audioOk === 'ready'
                        ? <span className="okchip">narration {narration ? `${narration.totalAudio}/${narration.totalCaps}` : 'ready'} · {mf?.audio.voice || mf?.audio.provider || 'tts'}</span>
                        : audioOk === 'missing'
                          ? <span className="badchip">narration {narration ? `${narration.totalAudio}/${narration.totalCaps}` : 'missing'} lines</span>
                          : 'checking narration…'}
                    </span>
                    <button className="mini" onClick={() => { const eng = getLuAudio(); const on = !S.musicOn; eng.musicOn = on; upd({ musicOn: on }); if (mPlayingRef.current) { if (on) eng.musicStart(null); else eng.musicStop(); } }}>{S.musicOn ? 'Music on' : 'Music off'}</button>
                    <button className="mini" onClick={() => { const eng = getLuAudio(); eng.fxOn = !S.fxOn; upd({ fxOn: eng.fxOn }); }}>{S.fxOn ? 'FX on' : 'FX off'}</button>
                    <span style={{ marginLeft: 'auto' }} className="time">{fmt(globalStart + mt)} / {fmt(total)}</span>
                  </div>

                  {audioOk === 'missing' && (
                    <div className="pace">
                      <select value={mVoice} onChange={e => setMVoice(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 13 }} aria-label="Narration voice">
                        {VOICES.map(v => <option key={v.id} value={v.id}>{v.name} · {v.desc}</option>)}
                      </select>
                      <button className="mini" onClick={prepareNarration} disabled={running}>{running && job?.kind === 'tts' ? `recording… ${job.pct}%` : 'Record narration'}</button>
                      <span className="hint" style={{ margin: 0 }}>via render-service · Deepgram if a key is set</span>
                    </div>
                  )}

                  <div className={`rbar${running ? ' on' : ''}`}><i style={{ width: `${job?.pct || 0}%` }} /></div>

                  <div className="ctl">
                    <span className="hint" style={{ flex: 1, margin: 0 }}>{jobHint}</span>
                    <button className="big" style={{ width: 'auto', padding: '0 24px', height: 44, margin: 0, fontSize: 15 }} onClick={() => setExportOpen(true)} disabled={running}>Export MP4</button>
                  </div>
                </>
              )}
            </div>

            {/* ===== right panel ===== */}
            <div className={`panel glass${panelOpen ? ' open' : ''}`}>
              <button className="grab" onClick={() => setPanelOpen(v => !v)} aria-label="Expand panel" />

              {S.kind === 'lumen' ? (
                <div className="tabs">
                  <button className={panelTab === 'ai' ? 'on' : ''} onClick={() => { setPanelTab('ai'); setPanelOpen(true); }}>Ask AI</button>
                  <button className={panelTab === 'sc' ? 'on' : ''} onClick={() => { setPanelTab('sc'); setPanelOpen(true); }}>Scenes</button>
                  <button className={panelTab === 'as' ? 'on' : ''} onClick={() => { setPanelTab('as'); setPanelOpen(true); }}>Assets</button>
                  <button className={panelTab === 'hi' ? 'on' : ''} onClick={() => { setPanelTab('hi'); setPanelOpen(true); }}>History</button>
                </div>
              ) : (
                <div className="tabs">
                  <button className={panelTab === 'ai' ? 'on' : ''} onClick={() => { setPanelTab('ai'); setPanelOpen(true); }}>Ask AI</button>
                  <button className={panelTab === 'ch' ? 'on' : ''} onClick={() => { setPanelTab('ch'); setPanelOpen(true); }}>Chapters</button>
                  <button className={panelTab === 'vids' ? 'on' : ''} onClick={() => { setPanelTab('vids'); setPanelOpen(true); }}>Videos</button>
                  <button className={panelTab === 'help' ? 'on' : ''} onClick={() => { setPanelTab('help'); setPanelOpen(true); }}>Help</button>
                </div>
              )}

              {/* Ask AI */}
              <div className={`pane${panelTab === 'ai' ? ' on' : ''}`}>
                <div className="chat">
                  {chat.map((m, i) => (
                    <div key={i} className={`msg ${m.who}`}>
                      {m.t}
                      {m.undo != null && m.undo > 0 ? <button className="mini" onClick={() => { restore(m.undo! - 1, 'Undid: ' + (SRef.current.hist[m.undo!]?.label || '')); setChat(c => c.map((x, j) => j === i ? { ...x, undo: undefined } : x)); setChat(c => [...c, { who: 'ai', t: 'Undone.' }]); }}>Undo this</button> : null}
                    </div>
                  ))}
                  {thinking ? <div className="msg ai">Thinking…</div> : null}
                </div>
                <div className="sug">
                  {['Make scene 2 shorter', 'Make it more playful', 'Use a Blueprint look', 'Add a scene about common mistakes', 'Fit scenes to narration'].map(s => (
                    <button key={s} className="chip" onClick={() => doAsk(s)}>{s}</button>
                  ))}
                </div>
                {S.kind === 'lumen' ? (
                  <div className="tgt">Editing <b>{tgt || `Scene ${S.idx + 1} · ${curScene?.title || ''}`}</b><span>Click text in the preview to target it.</span></div>
                ) : (
                  <div className="tgt">Editing <b>{chap?.title || 'video'}</b><span>Generate a brand-new narrated pack below.</span></div>
                )}
                <form className="ask" onSubmit={e => { e.preventDefault(); const v = ask.trim(); if (v) { setAsk(''); doAsk(v); } }}>
                  <input type="text" value={ask} onChange={e => setAsk(e.target.value)} placeholder={S.kind === 'lumen' ? 'Tell me what to change' : 'Describe the video you want'} autoComplete="off" />
                  <button aria-label="Send">↑</button>
                </form>
                {S.kind === 'manifest' ? (
                  <div className="list" style={{ maxHeight: 260, borderTop: '1px solid var(--lumen-line)' }}>
                    <div className="msg ai" style={{ maxWidth: 'none', marginBottom: 10 }}>The render-service plans chapters, writes deterministic scenes, records narration and QC-checks the pack.</div>
                    <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="generate a video on explaining antigravity in physics for dummies" aria-label="Video prompt" style={{ fontSize: 14, minHeight: 80 }} />
                    <div className="opts" role="group" aria-label="Chapters">
                      {[1, 2, 3, 4, 5, 6].map(n => (
                        <button key={n} type="button" className={`chip${nChapters === n ? ' on' : ''}`} onClick={() => setNChapters(n)}>{n}</button>
                      ))}
                    </div>
                    <button className="big" style={{ width: '100%', maxWidth: 'none', marginTop: 0, height: 44, fontSize: 15 }} type="button" onClick={startGenerate} disabled={running || !prompt.trim()}>
                      {running && job?.kind === 'generate' ? 'Generating…' : 'Generate video'}
                    </button>
                    {job ? (
                      <div>
                        <ul className="log" style={{ fontSize: 14, gap: 8 }}>
                          {job.steps.slice(-6).map((s, i, arr) => <li key={i} className={job.status === 'running' && i === arr.length - 1 ? 'run' : 'ok'} style={{ fontSize: 14 }}>{s}</li>)}
                          {job.status === 'running' && !job.steps.length ? <li className="run" style={{ fontSize: 14 }}>Starting…</li> : null}
                        </ul>
                        <div className="rbar on" style={{ width: '100%' }}><i style={{ width: `${job.pct}%` }} /></div>
                        {job.error ? <p className="err">{job.error}</p> : null}
                        {job.status === 'done' && job.result?.id ? (
                          <button className="chip on" onClick={() => openManifest(job.result.id)}>Open “{job.result.title}”</button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Scenes (lumen) */}
              <div className={`pane${panelTab === 'sc' ? ' on' : ''}`}>
                <div className="list">
                  {S.scenes.map((s, i) => (
                    <div key={i} className={`scene${i === S.idx ? ' cur' : ''}${S.changed.includes(i) ? ' chg' : ''}`}>
                      <input type="text" value={s.title} data-f="title" aria-label="Title"
                        onChange={e => { const v = e.target.value; setS(p => ({ ...p, scenes: p.scenes.map((x, j) => j === i ? { ...x, title: v } : x), idx: i })); idxRef.current = i; commitSoon(`Edited scene ${i + 1}`); }} />
                      <textarea value={s.text} data-f="text" aria-label="Narration"
                        onChange={e => { const v = e.target.value; setS(p => ({ ...p, scenes: p.scenes.map((x, j) => j === i ? { ...x, text: v } : x), idx: i })); idxRef.current = i; commitSoon(`Edited scene ${i + 1}`); }} />
                      <div className="m">Seconds <input type="number" min={3} max={90} data-f="dur" value={s.dur}
                        onChange={e => { const v = Math.max(3, +e.target.value || 3); setS(p => ({ ...p, scenes: p.scenes.map((x, j) => j === i ? { ...x, dur: v } : x), idx: i })); idxRef.current = i; commitSoon(`Edited scene ${i + 1}`); }} />
                        <button className="mini" style={{ marginLeft: 'auto' }} onClick={() => { const buf = getLuAudio().buf(`tts:${S.voice}:${s.text}`); if (buf) getLuAudio().playNow(buf); else ttsBuffer(s.text, S.voice).then(b => { if (b) getLuAudio().playNow(b); else toast('Voice service offline — nothing to play.'); }); }}>Hear it</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Assets (lumen) */}
              <div className={`pane${panelTab === 'as' ? ' on' : ''}`}>
                <div className="list">
                  <label className="drop" style={{ padding: 18 }}>Add assets<br /><small>Images and audio, up to 10 MB each</small></label>
                  <input type="file" multiple accept="image/*,audio/*" hidden onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
                  <div>
                    {S.assets.map(a => (
                      <div key={a.id} className="arow glass">
                        {a.type === 'img' ? <img src={a.url} alt="" draggable onDragStart={e => e.dataTransfer.setData('text/asset', a.id)} /> : <div className="au">♪</div>}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <input type="text" value={a.desc} placeholder="What is this? e.g. our school logo" aria-label={`Describe ${a.name}`}
                            onChange={e => { const v = e.target.value; upd({ assets: S.assets.map(x => x.id === a.id ? { ...x, desc: v } : x) }); }} />
                        </div>
                        {a.type === 'img' ? <button className="mini" onClick={() => upd({ logo: S.logo === a.id ? null : a.id })}>{S.logo === a.id ? 'Logo ✓' : 'Logo'}</button> : null}
                        <button className="x" onClick={() => upd({ assets: S.assets.filter(x => x.id !== a.id), logo: S.logo === a.id ? null : S.logo, music: S.music === a.id ? null : S.music })} aria-label="Remove">✕</button>
                      </div>
                    ))}
                  </div>
                  {lib.filter(l => !S.assets.some(a => a.id === l.id)).length ? (
                    <div className="lib">
                      {lib.filter(l => !S.assets.some(a => a.id === l.id)).map(l => (
                        <img key={l.id} src={l.url} alt={l.name} title={l.name} onClick={() => upd({ assets: [...S.assets, { ...l }] })} />
                      ))}
                    </div>
                  ) : null}
                  <div className="mrow">
                    <button className="mini" onClick={async () => {
                      let n = 0;
                      for (const a of S.assets.filter(x => x.type === 'img' && !x.desc)) {
                        const d = await describeAsset(a);
                        upd({ assets: SRef.current.assets.map(x => x.id === a.id ? { ...x, desc: d } : x) });
                        n++;
                      }
                      toast(n ? 'Suggestions use file names and colours. Edit them to be specific, then place assets.' : 'Every image already has a description.');
                    }}>Suggest descriptions</button>
                    <button className="mini" onClick={() => { const next = autoplace(SRef.current); setS(next); commit('Placed assets'); }}>Let AI place my assets</button>
                  </div>
                </div>
              </div>

              {/* History (lumen) */}
              <div className={`pane${panelTab === 'hi' ? ' on' : ''}`}>
                <div className="list">
                  {S.hist.map((h, i) => ({ h, i })).reverse().map(({ h, i }) => (
                    <div key={i} className={`hist${i === S.hist.length - 1 ? ' cur' : ''}`}>
                      <b>{h.label}</b><small>{ago(h.t)}</small>
                      {i < S.hist.length - 1 ? <button className="mini" onClick={() => restore(i)}>Restore</button> : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* Chapters (manifest) */}
              <div className={`pane${panelTab === 'ch' ? ' on' : ''}`}>
                <div className="list">
                  {mf?.chapters.map((c: Chapter, i: number) => (
                    <div key={c.id} className={`scene${i === chapterIdx ? ' cur' : ''}`} onClick={() => gotoChapter(i)} role="button" tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); gotoChapter(i); } }}>
                      <b style={{ display: 'block', fontSize: 14 }}>{i + 1}. {c.title}</b>
                      <small style={{ color: 'var(--lumen-mute)' }}>{c.kicker}</small>
                      <div className="m"><span>{c.captions.length} captions</span><span>{fmt(c.duration)}</span></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Videos (manifest) */}
              <div className={`pane${panelTab === 'vids' ? ' on' : ''}`}>
                <div className="list">
                  {packs.map(p => (
                    <div key={p.id} className={`proj glass${vid === p.id ? ' on' : ''}`} style={{ outline: vid === p.id ? '2px solid var(--lumen-ink)' : undefined }} onClick={() => loadVideo(p.id)} role="button" tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') loadVideo(p.id); }}>
                      <div className="sw" style={{ background: swatch(p.id) }} />
                      <div style={{ minWidth: 0 }}><b>{p.title}</b><small>{p.chapters} chapters{p.created ? ` · ${ago(p.created)}` : ' · bundled'}</small></div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Help (manifest) */}
              <div className={`pane${panelTab === 'help' ? ' on' : ''}`}>
                <div className="list">
                  <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.6, color: 'var(--lumen-mute)' }}>
                    <li style={{ marginBottom: 10 }}>Every chapter is a <b style={{ color: 'var(--lumen-ink)' }}>deterministic HTML scene</b> (SVG + a seek-safe motion engine). Scrub anywhere — always identical.</li>
                    <li style={{ marginBottom: 10 }}><b style={{ color: 'var(--lumen-ink)' }}>Narration is real audio</b> — per-line TTS auto-fitted to each caption slot, scheduled sample-accurately on the WebAudio clock.</li>
                    <li style={{ marginBottom: 10 }}><b style={{ color: 'var(--lumen-ink)' }}>Ask AI</b> plans a new video, writes every scene, validates it headlessly, records narration and QC-checks the pack.</li>
                    <li><b style={{ color: 'var(--lumen-ink)' }}>Music &amp; FX</b> — a generative ambient bed plus transition sounds, synthesized live and ducked under the narration.</li>
                  </ol>
                  <p className="hint" style={{ marginTop: 14 }}>Shortcuts: Space play/pause · ←/→ ±1 s (Shift ±5 s) · ↑/↓ chapters · ⌘Z undo · drag the timeline to scrub.</p>
                  <p className="hint" style={{ marginTop: 10 }}>Generation and rendering run on the local render-service. Exports land in /exports.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- brand kit modal ---------- */}
      {brandOpen && (
        <div className="lu-modal on" onClick={() => setBrandOpen(false)}>
          <div className="box glass" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Brand kit">
            <h2>Brand kit</h2>
            <p className="hint">Applied to every new video: logo, narrator and look.</p>
            <label className="drop" style={{ padding: 16, marginBottom: 12 }}>
              {bLogo ? <img src={bLogo} alt="" style={{ height: 48 }} /> : 'Upload your logo'}
            </label>
            <input type="file" accept="image/*" hidden onChange={async e => {
              const f = e.target.files?.[0]; if (!f) return;
              const r = await shrink(f);
              if (r) { setBLogo(r.url); toast('Logo ready — save the brand kit.'); } else toast('That file couldn’t be read as an image.');
            }} />
            <div className="grp"><b>Default narrator</b>
              <select value={bVoice} onChange={e => setBVoice(e.target.value)}>
                {VOICES.map(v => <option key={v.id} value={v.id}>{v.name} · {v.desc}</option>)}
              </select>
            </div>
            <div className="grp"><b>Default look</b>
              <select value={bStyle} onChange={e => setBStyle(e.target.value)}>
                {STY.map(s => <option key={s.n} value={s.n}>{s.n}</option>)}
              </select>
            </div>
            <div className="mrow">
              <button className="chip on" onClick={() => { setBrand({ logo: bLogo, voice: bVoice, style: bStyle }); ls.set('lumen:brand', { logo: bLogo, voice: bVoice, style: bStyle }); setBrandOpen(false); toast('Brand kit saved.'); }}>Save brand kit</button>
              <button className="chip" onClick={() => setBrandOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- render modal (lumen) ---------- */}
      {renderOpen && (
        <div className="lu-modal on" onClick={() => setRenderOpen(false)}>
          <div className="box glass" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Render">
            <h2>Your video is ready to render</h2>
            <p className="hint">Lumen-style projects preview in the browser at full fidelity. MP4 export for them lands with the render-service pipeline — captions and project data are ready now.</p>
            <div className="mrow">
              <button className="chip" onClick={() => copyText(() => srt(S.scenes), 'Captions copied.')}>Copy captions (.srt)</button>
              <button className="chip" onClick={() => copyText(() => location.href, 'Link copied.')}>Copy share link</button>
              <button className="chip" onClick={() => copyText(() => JSON.stringify({
                title: S.title, topic: S.topic, style: S.sty, aspect: S.ar, voice: S.voice, pace: S.speed, pause: S.pause,
                logo: S.logo, music: S.music, assets: S.assets.map(({ id, name, desc, type }) => ({ id, name, desc, type })), scenes: S.scenes,
              }, null, 2), 'Project data copied.')}>Copy project data</button>
            </div>
            <h2>Captions</h2>
            <textarea readOnly value={srt(S.scenes)} />
            <div className="mrow"><button className="chip on" onClick={() => setRenderOpen(false)}>Done</button></div>
          </div>
        </div>
      )}

      {/* ---------- export modal (manifest) ---------- */}
      {exportOpen && (
        <div className="lu-modal on" onClick={() => setExportOpen(false)}>
          <div className="box glass" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Export MP4">
            <h2>Export MP4</h2>
            <p className="hint">H.264 · CRF 18 · 1080p · narration muxed in · bt709 · +faststart</p>
            <div style={{ marginTop: 14 }}>
              <label className="cl">
                <input type="radio" name="scope" checked={exportScope === 'chapter'} onChange={() => setExportScope('chapter')} />
                <span>Current chapter — <span className="hint">{chap?.title} ({fmt(chap?.duration || 0)})</span></span>
              </label>
              <label className="cl">
                <input type="radio" name="scope" checked={exportScope === 'full'} onChange={() => setExportScope('full')} />
                <span>Full video — <span className="hint">{fmt(total)} (long render)</span></span>
              </label>
            </div>
            {audioOk === 'missing' ? <p className="err" style={{ marginTop: 4 }}>Narration audio is incomplete — exports require it (no silent videos). Record narration first.</p> : null}
            <div className="mrow">
              <button className="chip" onClick={() => setExportOpen(false)}>Cancel</button>
              <button className="big" style={{ width: 'auto', padding: '0 24px', height: 44, margin: 0, fontSize: 15 }} onClick={startExport} disabled={audioOk === 'missing' || running}>Start export</button>
            </div>
          </div>
        </div>
      )}

      {/* toast */}
      <div className={`toast${toastMsg ? ' on' : ''}`} role="status">{toastMsg || ''}</div>
    </div>
  );
}
