'use client';
/* Hyperframes Studio — player + AI Studio.
   Audio model: per-caption mp3/wav files scheduled on a WebAudio clock.
   The AudioContext is UNLOCKED on the first user gesture (the silent-playback fix),
   and the audio status is always visible (no silent packs, ever). */
import { useEffect, useRef, useState, useCallback } from 'react';

/* ---------------- types ---------------- */
type Caption = { t: number; dur: number; text: string; audio: string; audioDur?: number };
type Chapter = { id: string; title: string; kicker: string; duration: number; scene: string; captions: Caption[] };
type Manifest = {
  id: string; title: string; subtitle?: string; width: number; height: number; fps: number;
  audio: { voice?: string; provider?: string; prepared: boolean };
  chapters: Chapter[];
};
type PackMeta = { id: string; title: string; subtitle?: string; chapters: number; created: number };

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

/* ---------------- audio engine ---------------- */
class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  buffers = new Map<string, AudioBuffer>();
  active: AudioBufferSourceNode[] = [];
  muted = false;

  ensure() {
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  unlock() { this.ensure(); }
  setMuted(m: boolean) { this.muted = m; if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02); }
  async load(url: string): Promise<AudioBuffer | null> {
    if (this.buffers.has(url)) return this.buffers.get(url)!;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
      const ab = await r.arrayBuffer();
      const ctx = this.ensure(); if (!ctx) return null;
      const buf = await ctx.decodeAudioData(ab);
      this.buffers.set(url, buf);
      return buf;
    } catch { return null; }
  }
  stopAll() {
    for (const s of this.active) { try { s.stop(); s.disconnect(); } catch {} }
    this.active = [];
  }
  /* schedule every caption whose audio window intersects [from, +inf) */
  schedule(caps: { cap: Caption; globalT: number }[], from: number, getBuf: (c: Caption) => AudioBuffer | undefined) {
    const ctx = this.ensure(); if (!ctx) return;
    this.stopAll();
    const base = ctx.currentTime + 0.06;
    for (const { cap, globalT } of caps) {
      const start = globalT + cap.t;
      const end = start + (cap.audioDur || 0);
      if (end <= from) continue;
      const buf = getBuf(cap);
      if (!buf) continue;
      const offset = Math.max(0, from - start);
      if (offset >= buf.duration) continue;
      const when = base + Math.max(0, start - from);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.master!);
      try { src.start(when, offset); } catch {}
      this.active.push(src);
    }
  }
}

/* ---------------- page ---------------- */
let _engine: AudioEngine | null = null;
function getEngine(): AudioEngine {
  if (!_engine) _engine = new AudioEngine();
  return _engine;
}

export default function Home() {
  const [videos, setVideos] = useState<{ bundled: PackMeta[]; generated: PackMeta[] }>({ bundled: [], generated: [] });
  const [vid, setVid] = useState<string>('nn-video');
  const [mf, setMf] = useState<Manifest | null>(null);
  const [chapterIdx, setChapterIdx] = useState(0);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioOk, setAudioOk] = useState<'unknown' | 'ready' | 'missing'>('unknown');
  const [studioOpen, setStudioOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [nChapters, setNChapters] = useState(3);
  const [job, setJob] = useState<{ id: string; pct: number; status: string; steps: string[]; error: string | null; kind: string; result?: any } | null>(null);
  const [exportScope, setExportScope] = useState<'chapter' | 'full'>('chapter');

  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => { (window as any).__getAudio = getEngine; }, []);
  const iframeRef = useRef<HTMLIFrameElement>(null);
    const rafRef = useRef<number>(0);
  const playRef = useRef<{ t0: number; start: number } | null>(null); // performance.now() at t=start
  const tRef = useRef(0);
  const chapRef = useRef(0);
  const playingRef = useRef(false);
  const preloadedRef = useRef<Set<string>>(new Set());

  const chap: Chapter | undefined = mf?.chapters[chapterIdx];
  const total = mf?.chapters.reduce((n, c) => n + c.duration, 0) || 0;
  const globalStart = mf?.chapters.slice(0, chapterIdx).reduce((n, c) => n + c.duration, 0) || 0;

  /* ---- data load ---- */
  const loadVideo = useCallback(async (id: string) => {
    setVid(id);
    const base = id === 'nn-video' ? '/videos/nn-video' : `/generated/${id}`;
    try {
      const r = await fetch(`${base}/manifest.json`);
      const m: Manifest = await r.json();
      setMf(m);
      setChapterIdx(0);
      tRef.current = 0; setT(0);
      playingRef.current = false; setPlaying(false);
      preloadedRef.current.clear();
    } catch { setMf(null); }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/generated/registry.json');
        const gen: PackMeta[] = await r.json();
        const genList = (gen || []).filter(g => g.id !== 'nn-video');
        setVideos({ bundled: [{ id: 'nn-video', title: 'How does a machine learn to read?', chapters: 12, created: 0 }], generated: genList });
      } catch { setVideos({ bundled: [{ id: 'nn-video', title: 'How does a machine learn to read?', chapters: 12, created: 0 }], generated: [] }); }
    })();
  }, []);
  useEffect(() => { const id = setTimeout(() => loadVideo('nn-video'), 0); return () => clearTimeout(id); }, [loadVideo]);

  /* ---- audio presence check ---- */
  useEffect(() => {
    (async () => {
      if (!mf) return;
      const first = mf.chapters[0]?.captions[0];
      if (!first) return;
      const base = mf.id === 'nn-video' ? '/videos/nn-video' : `/generated/${mf.id}`;
      const ok = await fetch(`${base}/${first.audio}`, { method: 'HEAD' }).then(r => r.ok).catch(() => false);
      setAudioOk(ok ? 'ready' : 'missing');
    })();
  }, [mf]);

  /* ---- stage sizing ---- */
  useEffect(() => {
    const fit = () => {
      const el = stageRef.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const scale = Math.min(r.width / 1920, r.height / 1080);
      if (iframeRef.current) iframeRef.current.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [mf, studioOpen]);

  const preloadChapter = useCallback(async (idx: number) => {
    if (!mf) return;
    const base = mf.id === 'nn-video' ? '/videos/nn-video' : `/generated/${mf.id}`;
    const ch = mf.chapters[idx]; if (!ch) return;
    await Promise.all(ch.captions.map(async c => {
      const url = `${base}/${c.audio}`;
      if (preloadedRef.current.has(url)) return;
      preloadedRef.current.add(url);
      await getEngine().load(url);
    }));
  }, [mf]);

  const scheduleCaptionAudio = useCallback((fromT: number) => {
    if (!mf) return;
    const base = mf.id === 'nn-video' ? '/videos/nn-video' : `/generated/${mf.id}`;
    const ch = mf.chapters[chapterIdx]; if (!ch) return;
    const caps = ch.captions.map(cap => ({ cap, globalT: 0 })); // chapter-local clock
    getEngine().schedule(caps, fromT, cap => getEngine().buffers.get(`${base}/${cap.audio}`));
  }, [mf, chapterIdx]);

  /* ---- master clock + seek ---- */
  const seekTo = useCallback((nt: number, scheduleAudio = true) => {
    if (!mf || !chap) return;
    nt = Math.max(0, Math.min(chap.duration - 0.001, nt));
    tRef.current = nt; setT(nt);
    const win = iframeRef.current?.contentWindow as any;
    if (win?.__seek) { try { win.__seek(nt); } catch {} }
    if (scheduleAudio && playingRef.current) scheduleCaptionAudio(nt);
    if (playRef.current) playRef.current = { t0: performance.now(), start: nt };
  }, [mf, chap, scheduleCaptionAudio]);

  const setIframeScene = useCallback((idx: number) => {
    if (!mf) return;
    const ch = mf.chapters[idx]; if (!ch) return;
    const base = mf.id === 'nn-video' ? '/videos/nn-video' : `/generated/${mf.id}`;
    if (iframeRef.current) iframeRef.current.src = `${base}/${ch.scene}`;
    /* seek new scene to 0 once ready */
    setTimeout(() => {
      const win = iframeRef.current?.contentWindow as any;
      if (win?.__ready) win.__ready.then(() => { try { win.__seek(tRef.current); } catch {} }).catch(() => {});
    }, 350);
  }, [mf]);

  /* ---- rAF loop ---- */
  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const pr = playRef.current;
      if (pr && playingRef.current && mf) {
        const nt = pr.start + (performance.now() - pr.t0) / 1000;
        const ch = mf.chapters[chapRef.current];
        if (ch && nt >= ch.duration - 0.02) {
          /* chapter end → advance */
          if (chapRef.current < mf.chapters.length - 1) {
            const next = chapRef.current + 1;
            chapRef.current = next; setChapterIdx(next);
            playRef.current = { t0: performance.now(), start: 0 };
            tRef.current = 0; setT(0);
            getEngine().stopAll();
            preloadChapter(next);
            setIframeScene(next);
          } else {
            playingRef.current = false; setPlaying(false);
            getEngine().stopAll();
            seekTo(ch.duration - 0.01, false);
          }
        } else { tRef.current = nt; setT(nt); }
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [mf, seekTo, preloadChapter]);

  useEffect(() => { if (mf) setIframeScene(chapterIdx); }, [mf, chapterIdx, setIframeScene]);

  /* ---- play / pause ---- */
  const play = useCallback(async () => {
    if (!mf) return;
    const eng = getEngine();
    eng.setMuted(muted);
    eng.unlock();
    playingRef.current = true; setPlaying(true);
    playRef.current = { t0: performance.now(), start: tRef.current };
    await preloadChapter(chapRef.current);
    scheduleCaptionAudio(tRef.current);
  }, [mf, muted, preloadChapter, scheduleCaptionAudio]);

  const pause = useCallback(() => {
    playingRef.current = false; setPlaying(false);
    getEngine().stopAll();
    playRef.current = null;
  }, []);

  const toggle = useCallback(() => { if (playingRef.current) pause(); else play(); }, [play, pause]);

  const gotoChapter = useCallback((idx: number) => {
    if (!mf) return;
    const clamped = Math.max(0, Math.min(mf.chapters.length - 1, idx));
    chapRef.current = clamped; setChapterIdx(clamped);
    tRef.current = 0; setT(0);
    playRef.current = playingRef.current ? { t0: performance.now(), start: 0 } : null;
    getEngine().stopAll();
    if (playingRef.current) { preloadChapter(clamped).then(() => scheduleCaptionAudio(0)); }
  }, [mf, preloadChapter, scheduleCaptionAudio]);

  /* ---- keyboard + first-gesture unlock ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      getEngine().unlock();
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') seekTo(tRef.current + (e.shiftKey ? 5 : 1));
      else if (e.key === 'ArrowLeft') seekTo(tRef.current - (e.shiftKey ? 5 : 1));
      else if (e.key === 'ArrowDown') { e.preventDefault(); gotoChapter(chapRef.current + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); gotoChapter(chapRef.current - 1); }
      else if (e.key.toLowerCase() === 'f') document.documentElement.requestFullscreen?.().catch(() => {});
      else if (e.key.toLowerCase() === 'g') setStudioOpen(v => !v);
      else if (e.key.toLowerCase() === 'e') setExportOpen(true);
    };
    const onPointer = () => getEngine().unlock();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('pointerdown', onPointer); };
  }, [toggle, seekTo, gotoChapter]);

  /* ---- caption lookup ---- */
  const currentCaption = chap?.captions.find(c => t >= c.t && t < c.t + Math.max(c.dur, (c.audioDur || 0)) + 0.4);

  /* ---- prepare narration / export / generate (all via render-service) ---- */
  const callService = useCallback(async (path: string, body: any) => {
    const r = await fetch(`/api/_relay?path=${encodeURIComponent(path)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return r.json();
  }, []);

  const vidRef = useRef(vid); useEffect(() => { vidRef.current = vid; }, [vid]);
  const loadRef = useRef(loadVideo); useEffect(() => { loadRef.current = loadVideo; }, [loadVideo]);
  const watchJob = useCallback((jobId: string) => {
    setJob({ id: jobId, pct: 0, status: 'running', steps: [], error: null, kind: '' });
    const es = new EventSource(`/api/_relay/stream/${jobId}`);
    es.onmessage = ev => {
      const d = JSON.parse(ev.data);
      if (d.type === 'hello') setJob(j => j && ({ ...j, pct: d.pct, status: d.status, steps: d.steps || [], error: d.error || null, result: d.result }));
      else if (d.type === 'log') setJob(j => j && ({ ...j, steps: [...j.steps, d.msg].slice(-120) }));
      else if (d.type === 'progress') setJob(j => j && ({ ...j, pct: d.pct }));
      else if (d.type === 'error') setJob(j => j && ({ ...j, status: 'failed', error: d.error }));
      else if (d.type === 'done') {
        setJob(j => j && ({ ...j, status: 'done', pct: 100, result: d.result }));
        es.close();
        /* refresh manifests after tts/export/generate */
        setTimeout(() => { loadRef.current(vidRef.current); fetch('/generated/registry.json').then(r => r.json()).then(g => setVideos(v => ({ ...v, generated: g }))).catch(() => {}); }, 600);
      }
    };
    es.onerror = () => { /* keep polling fallback */ };
  }, []);

  const prepareNarration = useCallback(async () => {
    getEngine().unlock();
    const r = await callService('/tts/prepare', { video: vid, chapter: chapterIdx === -1 ? undefined : chap?.id });
    if (r.jobId) watchJob(r.jobId);
  }, [callService, vid, chap, chapterIdx, watchJob]);

  const startExport = useCallback(async () => {
    const r = await callService('/export', { video: vid, chapter: exportScope === 'chapter' ? chap?.id : null, fps: 30 });
    if (r.jobId) { setExportOpen(false); watchJob(r.jobId); }
  }, [callService, vid, chap, exportScope, watchJob]);

  const startGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    const r = await callService('/generate', { prompt, chapters: nChapters });
    if (r.jobId) watchJob(r.jobId);
  }, [callService, prompt, nChapters, watchJob]);

  /* ---- progress bar click/drag ---- */
  const barRef = useRef<HTMLDivElement>(null);
  const scrubTo = useCallback((clientX: number) => {
    const el = barRef.current; if (!el || !chap) return;
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    seekTo(p * chap.duration);
  }, [chap, seekTo]);
  const onBarPointer = useCallback((e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    scrubTo(e.clientX);
    const mv = (ev: PointerEvent) => scrubTo(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }, [scrubTo]);

  const audioChip = audioOk === 'ready'
    ? { cls: 'border-emerald-500/40 text-emerald-300', label: `🔊 narration (${mf?.audio.provider || 'tts'})` }
    : { cls: 'border-amber-500/50 text-amber-300 animate-pulse', label: 'no narration audio yet' };

  /* ---------------- UI ---------------- */
  return (
    <div className="min-h-screen flex flex-col bg-[#07090d] text-zinc-200 font-sans" onPointerDown={() => getEngine().unlock()}>
      {/* header */}
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">{mf?.title || 'Hyperframes Studio'}</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{mf?.subtitle || ''}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setHelpOpen(true)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs hover:bg-zinc-800 transition">How it works</button>
          <button onClick={() => setStudioOpen(v => !v)} className="px-3 py-1.5 rounded-lg bg-fuchsia-600/90 hover:bg-fuchsia-500 text-white text-xs font-medium transition">AI Studio</button>
        </div>
      </header>

      {/* chapter pills */}
      <nav className="flex items-center gap-1.5 px-5 pb-2 overflow-x-auto no-scrollbar" aria-label="chapters">
        {mf?.chapters.map((c, i) => (
          <button key={c.id} onClick={() => gotoChapter(i)}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border transition ${i === chapterIdx ? 'bg-sky-400/15 border-sky-400/60 text-sky-200' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600'}`}>
            {i + 1} {c.id.replace(/^s\d+_/, '').replace(/^ch_?/, '') || c.title}
          </button>
        ))}
      </nav>

      <div className="flex-1 flex min-h-0">
        {/* stage */}
        <main className="flex-1 flex flex-col min-w-0 px-5">
          <div ref={stageRef} className="relative flex-1 min-h-[320px] rounded-2xl overflow-hidden bg-black border border-zinc-800/80">
            <iframe ref={iframeRef} title="scene" className="absolute left-1/2 top-1/2 origin-center"
              style={{ width: 1920, height: 1080, transform: 'translate(-50%,-50%)' }}
              src={mf ? (vid === 'nn-video' ? `/videos/nn-video/${chap?.scene}` : `/generated/${vid}/${chap?.scene}`) : 'about:blank'} />
            {/* caption */}
            <div className="absolute bottom-3 inset-x-0 flex justify-center px-8 pointer-events-none">
              {currentCaption && (
                <div className="max-w-[80%] rounded-xl bg-black/70 backdrop-blur px-4 py-2 text-[15px] leading-snug text-zinc-100 text-center shadow-lg">
                  {currentCaption.text}
                </div>
              )}
            </div>
          </div>

          {/* control bar */}
          <div className="py-3">
            <div ref={barRef} onPointerDown={onBarPointer} className="relative h-2.5 rounded-full bg-zinc-800 cursor-pointer group">
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 to-teal-400" style={{ width: chap ? `${(t / chap.duration) * 100}%` : '0%' }} />
              {/* chapter ticks */}
              <div className="absolute inset-x-0 top-0 h-full">
                {mf?.chapters.map((c, i) => (
                  <div key={c.id} className="absolute top-0 h-full w-px bg-black/60" style={{ left: `${(mf.chapters.slice(0, i).reduce((n, x) => n + x.duration, 0) / total) * 100}%` }} />
                ))}
              </div>
              <div className="absolute -top-1 h-4.5 w-4.5 h-[18px] w-[18px] rounded-full bg-white shadow group-hover:scale-110 transition-transform"
                style={{ left: `calc(${chap ? (t / chap.duration) * 100 : 0}% - 9px)` }} />
            </div>
            <div className="flex items-center justify-between mt-2.5 gap-4">
              <div className="flex items-center gap-2">
                <button onClick={() => gotoChapter(chapterIdx - 1)} className="w-9 h-9 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-300" aria-label="previous chapter">⏮</button>
                <button onClick={toggle} className="w-11 h-11 rounded-full bg-sky-400 hover:bg-sky-300 text-black flex items-center justify-center text-lg font-bold transition" aria-label={playing ? 'pause' : 'play'}>{playing ? '⏸' : '▶'}</button>
                <button onClick={() => gotoChapter(chapterIdx + 1)} className="w-9 h-9 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-300" aria-label="next chapter">⏭</button>
                <button onClick={() => { const m = !muted; setMuted(m); getEngine().setMuted(m); }} className="w-9 h-9 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-300 ml-1" aria-label="mute">{muted ? '🔇' : '🔊'}</button>
                <span className="ml-2 text-sm text-zinc-400 tabular-nums">{fmt(t)} / {fmt(chap?.duration || 0)}</span>
                <span className="text-sm text-zinc-500 hidden md:inline">· {chapterIdx + 1}/{mf?.chapters.length} · <span className="text-zinc-300">{chap?.kicker} — {chap?.title}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-full border text-[11px] ${audioChip.cls}`}>{audioChip.label}</span>
                {audioOk === 'missing' && (
                  <button onClick={prepareNarration} className="px-3 py-1.5 rounded-lg bg-amber-500/90 hover:bg-amber-400 text-black text-xs font-medium">
                    {job?.status === 'running' && job.id.includes('job') ? 'recording…' : 'Record narration'}
                  </button>
                )}
                <button onClick={() => setExportOpen(true)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs hover:bg-zinc-800">Export MP4</button>
              </div>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-600">Space play/pause · ←/→ ±1 s (Shift ±5 s) · ↑/↓ chapter · F fullscreen · E export · G AI Studio · click/drag bar to scrub</p>
          </div>
        </main>

        {/* AI Studio drawer */}
        {studioOpen && (
          <aside className="w-[360px] shrink-0 border-l border-zinc-800 bg-[#0b0e14] flex flex-col max-lg:w-full max-lg:border-l-0 max-lg:border-t">
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <h2 className="font-semibold text-sm text-zinc-100">AI Studio</h2>
              <button onClick={() => setStudioOpen(false)} className="text-zinc-500 hover:text-zinc-300 text-lg leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-xs text-zinc-500 leading-relaxed">Describe the video you want. The AI plans chapters, writes every scene (layout + motion), tests it headlessly, records the narration and muxes it into the pack.</p>
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4} placeholder="generate a video on explaining antigravity in physics for dummies"
                className="w-full rounded-xl bg-zinc-900 border border-zinc-700 p-3 text-sm focus:outline-none focus:border-fuchsia-500/60" />
              <div className="flex items-center gap-3">
                <label className="text-xs text-zinc-400">Chapters</label>
                <select value={nChapters} onChange={e => setNChapters(+e.target.value)} className="rounded-lg bg-zinc-900 border border-zinc-700 text-sm px-2 py-1.5">
                  {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <button onClick={startGenerate} disabled={job?.status === 'running'}
                  className="flex-1 px-4 py-2 rounded-xl bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white text-sm font-medium transition">
                  {job?.status === 'running' ? 'Generating…' : 'Generate video'}
                </button>
              </div>
              {job && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-zinc-400">{job.status === 'running' ? 'working…' : job.status === 'done' ? '✔ done' : '✗ failed'}</span>
                    <span className="text-zinc-500 tabular-nums">{job.pct}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className={`h-full transition-all ${job.status === 'failed' ? 'bg-red-500' : 'bg-fuchsia-500'}`} style={{ width: `${job.pct}%` }} />
                  </div>
                  <div className="mt-2 max-h-44 overflow-y-auto text-[11px] leading-relaxed text-zinc-500 font-mono space-y-0.5">
                    {job.steps.slice(-14).map((s, i) => <div key={i}>{s}</div>)}
                  </div>
                  {job.error && <p className="mt-2 text-[11px] text-red-400 bg-red-950/40 rounded p-2">{job.error}</p>}
                  {job.status === 'done' && job.result?.id && (
                    <button onClick={() => loadVideo(job.result.id)} className="mt-2 w-full py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-200 text-xs">Open “{job.result.title}”</button>
                  )}
                </div>
              )}
              <div>
                <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide mb-2">Your packs</h3>
                <div className="space-y-1.5">
                  {[...videos.generated, ...videos.bundled].map(p => (
                    <button key={p.id} onClick={() => loadVideo(p.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition ${vid === p.id ? 'border-sky-400/50 bg-sky-400/10 text-sky-100' : 'border-zinc-800 hover:border-zinc-600 text-zinc-300'}`}>
                      <span className="block truncate font-medium">{p.title}</span>
                      <span className="block text-[11px] text-zinc-500 mt-0.5">{p.chapters} chapters{p.created ? ` · ${new Date(p.created).toLocaleString()}` : ''}</span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-zinc-600 border-t border-zinc-800 pt-3">Generation runs on the local render-service (GLM + headless Chromium + TTS). Exports land in <span className="text-zinc-500">/exports</span>.</p>
            </div>
          </aside>
        )}
      </div>

      {/* export modal */}
      {exportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setExportOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-[#0d1118] border border-zinc-800 p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">Export MP4</h3>
            <p className="text-xs text-zinc-500 mb-4">H.264 · CRF 18 · 1080p · narration audio muxed in · bt709 · +faststart</p>
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-3 rounded-xl border border-zinc-800 px-3 py-2.5 cursor-pointer has-[:checked]:border-sky-500/60">
                <input type="radio" checked={exportScope === 'chapter'} onChange={() => setExportScope('chapter')} className="accent-sky-400" />
                <span className="text-sm">Current chapter — <span className="text-zinc-400">{chap?.title} ({fmt(chap?.duration || 0)})</span></span>
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-zinc-800 px-3 py-2.5 cursor-pointer has-[:checked]:border-sky-500/60">
                <input type="radio" checked={exportScope === 'full'} onChange={() => setExportScope('full')} className="accent-sky-400" />
                <span className="text-sm">Full video — <span className="text-zinc-400">{fmt(total)} (long render)</span></span>
              </label>
            </div>
            {audioOk === 'missing' && <p className="mb-3 text-xs text-amber-300 bg-amber-950/40 rounded-lg p-2.5">Narration audio is not recorded yet — exports require it (no silent videos). Click “Record narration” first.</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setExportOpen(false)} className="px-4 py-2 rounded-lg border border-zinc-700 text-sm">Cancel</button>
              <button onClick={startExport} disabled={audioOk === 'missing'} className="px-4 py-2 rounded-lg bg-sky-400 text-black text-sm font-medium disabled:opacity-40">Start export</button>
            </div>
          </div>
        </div>
      )}

      {/* help modal */}
      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setHelpOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-[#0d1118] border border-zinc-800 p-6 text-sm leading-relaxed" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-base mb-3">How this works</h3>
            <ol className="list-decimal ml-4 space-y-2 text-zinc-400">
              <li>Every chapter is a <b className="text-zinc-200">deterministic HTML scene</b> (SVG + a seek-safe motion engine). The player drives it frame-by-frame — scrub anywhere, always identical.</li>
              <li><b className="text-zinc-200">Narration is real audio</b> — per-line TTS (Deepgram or built-in voice), auto-fitted to each caption slot and scheduled sample-accurately on the WebAudio clock.</li>
              <li><b className="text-zinc-200">AI Studio</b> plans a new video, writes every scene, validates it headlessly, records narration and QC-checks the pack before it appears.</li>
              <li><b className="text-zinc-200">Export MP4</b> streams frames into ffmpeg (CRF 18, bt709, +faststart) and muxes the narration track — QC-gated for audio presence.</li>
            </ol>
            <button onClick={() => setHelpOpen(false)} className="mt-5 px-4 py-2 rounded-lg bg-sky-400 text-black font-medium text-sm">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
