'use client';
/* Hyperframes Studio — player + AI Studio, styled after the Lumen Studio design system.
   Audio model: per-caption mp3/wav files scheduled on a WebAudio clock.
   The AudioContext is UNLOCKED on the first user gesture (the silent-playback fix),
   and the narration status is always visible and honest (line counts, never a false green). */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

/* ---------------- types ---------------- */
type Caption = { t: number; dur: number; text: string; audio: string; audioDur?: number };
type Chapter = { id: string; title: string; kicker: string; duration: number; scene: string; captions: Caption[] };
type Manifest = {
  id: string; title: string; subtitle?: string; width: number; height: number; fps: number;
  audio: { voice?: string; provider?: string; prepared: boolean };
  chapters: Chapter[];
};
type PackMeta = { id: string; title: string; subtitle?: string; chapters: number; created: number };
type Tab = 'ai' | 'ch' | 'vids' | 'help';
type Job = { id: string; pct: number; status: string; steps: string[]; error: string | null; kind: string; result?: any };

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const ago = (t: number) => {
  const m = (Date.now() - t) / 6e4;
  return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
const swatch = (id: string) => {
  let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(135deg,hsl(${h} 70% 55%),hsl(${(h + 40) % 360} 70% 45%))`;
};

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
  const [panelTab, setPanelTab] = useState<Tab>('ai');
  const [panelOpen, setPanelOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [nChapters, setNChapters] = useState(3);
  const [job, setJob] = useState<Job | null>(null);
  const [exportScope, setExportScope] = useState<'chapter' | 'full'>('chapter');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const playRef = useRef<{ t0: number; start: number } | null>(null); // performance.now() at t=start
  const tRef = useRef(0);
  const chapRef = useRef(0);
  const playingRef = useRef(false);
  const preloadedRef = useRef<Set<string>>(new Set());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { (window as any).__getAudio = getEngine; }, []);

  const chap: Chapter | undefined = mf?.chapters[chapterIdx];
  const total = mf?.chapters.reduce((n, c) => n + c.duration, 0) || 0;
  const globalStart = mf?.chapters.slice(0, chapterIdx).reduce((n, c) => n + c.duration, 0) || 0;

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3400);
  }, []);

  /* ---- theme (Lumen ◐ toggle) ---- */
  const toggleTheme = useCallback(() => {
    const root = document.documentElement;
    const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme:dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('hf:theme', dark ? 'light' : 'dark'); } catch {}
  }, []);

  /* ---- data load ---- */
  const loadVideo = useCallback(async (id: string) => {
    setVid(id);
    const base = id === 'nn-video' ? '/videos/nn-video' : `/generated/${id}`;
    try {
      const r = await fetch(`${base}/manifest.json`);
      const m: Manifest = await r.json();
      getEngine().buffers.clear(); // never reuse another video's audio cache
      setMf(m);
      setChapterIdx(0);
      chapRef.current = 0;
      tRef.current = 0; setT(0);
      playingRef.current = false; setPlaying(false);
      preloadedRef.current.clear();
    } catch { setMf(null); toast('Could not load that pack.'); }
  }, [toast]);

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

  /* ---- honest narration status: line counts from the manifest + one existence probe ---- */
  const narration = useMemo(() => {
    if (!mf) return null;
    const perCh = mf.chapters.map(c => {
      const caps = c.captions;
      const withAudio = caps.filter(x => (x.audioDur || 0) > 0).length;
      const covered = caps.reduce((a, x) => a + Math.min(x.audioDur || 0, x.dur), 0);
      return { withAudio, total: caps.length, missing: withAudio < caps.length, fill: c.duration ? Math.min(100, (covered / c.duration) * 100) : 0 };
    });
    return { perCh, totalCaps: perCh.reduce((a, c) => a + c.total, 0), totalAudio: perCh.reduce((a, c) => a + c.withAudio, 0) };
  }, [mf]);

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

  /* ---- stage sizing ---- */
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
  }, [mf, panelTab]);

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

  const scheduleCaptionAudio = useCallback((idx: number, fromT: number) => {
    if (!mf) return;
    const base = mf.id === 'nn-video' ? '/videos/nn-video' : `/generated/${mf.id}`;
    const ch = mf.chapters[idx]; if (!ch) return;
    const caps = ch.captions.map(cap => ({ cap, globalT: 0 })); // chapter-local clock
    getEngine().schedule(caps, fromT, cap => getEngine().buffers.get(`${base}/${cap.audio}`));
  }, [mf]);

  /* ---- master clock + seek ---- */
  const seekTo = useCallback((nt: number, scheduleAudio = true) => {
    if (!mf) return;
    const ch = mf.chapters[chapRef.current]; if (!ch) return;
    nt = Math.max(0, Math.min(ch.duration - 0.001, nt));
    tRef.current = nt; setT(nt);
    const win = iframeRef.current?.contentWindow as any;
    if (win?.__seek) { try { win.__seek(nt); } catch {} }
    if (scheduleAudio && playingRef.current) scheduleCaptionAudio(chapRef.current, nt);
    if (playRef.current) playRef.current = { t0: performance.now(), start: nt };
  }, [mf, scheduleCaptionAudio]);

  const setIframeScene = useCallback((idx: number) => {
    if (!mf) return;
    const ch = mf.chapters[idx]; if (!ch) return;
    const base = mf.id === 'nn-video' ? '/videos/nn-video' : `/generated/${mf.id}`;
    if (iframeRef.current) iframeRef.current.src = `${base}/${ch.scene}`;
    /* seek new scene to the current clock once ready */
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
          /* chapter end → advance (and KEEP NARRATING the next chapter) */
          if (chapRef.current < mf.chapters.length - 1) {
            const next = chapRef.current + 1;
            chapRef.current = next; setChapterIdx(next);
            playRef.current = { t0: performance.now(), start: 0 };
            tRef.current = 0; setT(0);
            getEngine().stopAll();
            preloadChapter(next);
            setIframeScene(next);
            preloadChapter(next).then(() => { if (playingRef.current && chapRef.current === next) scheduleCaptionAudio(next, 0); });
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
  }, [mf, seekTo, preloadChapter, scheduleCaptionAudio, setIframeScene]);

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
    scheduleCaptionAudio(chapRef.current, tRef.current);
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
    if (playingRef.current) {
      preloadChapter(clamped).then(() => { if (playingRef.current && chapRef.current === clamped) scheduleCaptionAudio(clamped, 0); });
    }
  }, [mf, preloadChapter, scheduleCaptionAudio]);

  /* ---- global timeline seek (click/drag anywhere on the tracks) ---- */
  const seekGlobal = useCallback((clientX: number) => {
    const el = tracksRef.current; if (!el || !mf || !total) return;
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    let g = p * total, k = 0, acc = 0;
    for (; k < mf.chapters.length; k++) { if (g < acc + mf.chapters[k].duration) break; acc += mf.chapters[k].duration; }
    if (k >= mf.chapters.length) { k = mf.chapters.length - 1; acc = total - mf.chapters[k].duration; g = total - 0.01; }
    const local = Math.max(0, Math.min(mf.chapters[k].duration - 0.001, g - acc));
    if (k !== chapRef.current) {
      chapRef.current = k; setChapterIdx(k);
      tRef.current = local; setT(local);
      playRef.current = playingRef.current ? { t0: performance.now(), start: local } : null;
      getEngine().stopAll();
      if (playingRef.current) preloadChapter(k).then(() => { if (playingRef.current && chapRef.current === k) scheduleCaptionAudio(k, local); });
    } else {
      seekTo(local);
    }
  }, [mf, total, preloadChapter, scheduleCaptionAudio, seekTo]);

  const onTracksPointer = useCallback((e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    seekGlobal(e.clientX);
    const mv = (ev: PointerEvent) => seekGlobal(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }, [seekGlobal]);

  /* ---- keyboard + first-gesture unlock ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setExportOpen(false); setHelpOpen(false); return; }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      getEngine().unlock();
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'ArrowRight') seekTo(tRef.current + (e.shiftKey ? 5 : 1));
      else if (e.key === 'ArrowLeft') seekTo(tRef.current - (e.shiftKey ? 5 : 1));
      else if (e.key === 'ArrowDown') { e.preventDefault(); gotoChapter(chapRef.current + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); gotoChapter(chapRef.current - 1); }
      else if (e.key.toLowerCase() === 'f') document.documentElement.requestFullscreen?.().catch(() => {});
      else if (e.key.toLowerCase() === 'g') { setPanelTab('ai'); setPanelOpen(true); }
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
    const r = await fetch(`/api/relay/${path.replace(/^\/+/, '')}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return r.json();
  }, []);

  const vidRef = useRef(vid); useEffect(() => { vidRef.current = vid; }, [vid]);
  const loadRef = useRef(loadVideo); useEffect(() => { loadRef.current = loadVideo; }, [loadVideo]);
  const watchJob = useCallback((jobId: string, kind: string) => {
    setJob({ id: jobId, pct: 0, status: 'running', steps: [], error: null, kind });
    const es = new EventSource(`/api/relay/stream/${jobId}`);
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
        } else if (kind === 'export') toast('Export finished — MP4 is in /exports.');
        /* refresh manifests after tts/export/generate */
        setTimeout(() => { loadRef.current(vidRef.current); fetch('/generated/registry.json').then(r => r.json()).then(g => setVideos(v => ({ ...v, generated: g }))).catch(() => {}); }, 600);
      }
    };
    es.onerror = () => { /* keep polling fallback */ };
  }, [toast]);

  const prepareNarration = useCallback(async () => {
    getEngine().unlock();
    const r = await callService('/tts/prepare', { video: vid }); // full video — resumable by line
    if (r.jobId) watchJob(r.jobId, 'tts');
    else if (r.error) toast(String(r.error).slice(0, 90));
  }, [callService, vid, watchJob, toast]);

  const startExport = useCallback(async () => {
    const r = await callService('/export', { video: vid, chapter: exportScope === 'chapter' ? chap?.id : null, fps: 30 });
    if (r.jobId) { setExportOpen(false); watchJob(r.jobId, 'export'); }
    else if (r.error) toast(String(r.error).slice(0, 90));
  }, [callService, vid, chap, exportScope, watchJob, toast]);

  const startGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    const r = await callService('/generate', { prompt, chapters: nChapters });
    if (r.jobId) watchJob(r.jobId, 'generate');
    else if (r.error) toast(String(r.error).slice(0, 90));
  }, [callService, prompt, nChapters, watchJob, toast]);

  const selectTab = useCallback((tab: Tab) => { setPanelTab(tab); setPanelOpen(true); }, []);

  const jobHint = job?.status === 'running'
    ? `${job.kind === 'generate' ? 'Generating' : job.kind === 'export' ? 'Rendering' : 'Recording narration'}… ${job.pct}%`
    : job?.status === 'failed' ? 'Job failed — details in the Ask AI panel.'
    : 'Preview is approximate. The exported MP4 is full quality.';
  const running = job?.status === 'running';
  const playheadFrac = total ? Math.min(1, (globalStart + t) / total) : 0;

  /* ---------------- UI ---------------- */
  return (
    <div className="hf-root" onPointerDown={() => getEngine().unlock()}>
      {/* top nav — Lumen studio chrome */}
      <nav className="hf-nav">
        <div className="hf-brand">hyperframes</div>
        <button className="hf-th" onClick={toggleTheme} aria-label="Toggle theme">◐</button>
      </nav>

      <div className="hf-main">
        <div className="hf-studio">
          {/* ------------- left column: title · stage · controls · tracks ------------- */}
          <div>
            <div className="hf-bar2">
              <button className="hf-mini" onClick={() => selectTab('vids')}>‹ Videos</button>
              <div className="hf-ptitle" title={mf?.title}>{mf?.title || 'Hyperframes Studio'}</div>
              <span className="hf-hint">{mf?.subtitle || ''}</span>
            </div>

            <div className="hf-stage" ref={stageRef}>
              <iframe
                ref={iframeRef}
                title="scene"
                className=""
                style={{ width: 1920, height: 1080, transform: 'translate(-50%,-50%)' }}
                src={mf ? (vid === 'nn-video' ? `/videos/nn-video/${chap?.scene}` : `/generated/${vid}/${chap?.scene}`) : 'about:blank'}
              />
              <div className="hf-cap" aria-live="polite">
                {currentCaption && <span>{currentCaption.text}</span>}
              </div>
            </div>

            <div className="hf-ctl">
              <button className="hf-play" onClick={toggle} aria-label={playing ? 'pause' : 'play'}>{playing ? '❚❚' : '▶'}</button>
              <button className="hf-mini" onClick={() => { const m = !muted; setMuted(m); getEngine().setMuted(m); }}>{muted ? 'Sound off' : 'Sound on'}</button>
              <span className="hf-hint">Space to play · ←/→ seek · ↑/↓ chapters</span>
              <div className="hf-time">{fmt(t)} / {fmt(chap?.duration || 0)}</div>
            </div>

            {/* Lumen-style timeline tracks */}
            <div className="hf-tracks" ref={tracksRef} onPointerDown={onTracksPointer} role="slider"
              aria-label="Timeline — drag to scrub, click a chapter to jump" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(globalStart + t)}>
              <div className="hf-row" data-l="Chapters">
                {mf?.chapters.map((c, i) => (
                  <div key={c.id} className={`hf-seg${i === chapterIdx ? ' cur' : ''}`} style={{ flex: Math.max(0.6, c.duration) }} aria-label={`Chapter ${i + 1}: ${c.title}`} />
                ))}
              </div>
              <div className="hf-row" data-l="Voice">
                {mf?.chapters.map((c, i) => {
                  const n = narration?.perCh[i];
                  return (
                    <div key={c.id} className={`hf-vb${n?.missing ? ' over' : ''}`} style={{ flex: Math.max(0.6, c.duration) }}
                      title={n ? `narration ${n.withAudio}/${n.total} lines` : undefined}>
                      <i style={{ width: `${n ? n.fill : 0}%` }} />
                    </div>
                  );
                })}
              </div>
              <div className="hf-ph" style={{ left: `calc(52px + (100% - 52px) * ${playheadFrac})` }} />
            </div>

            <div className="hf-pace">
              <button className="hf-mini" onClick={() => gotoChapter(chapterIdx - 1)} aria-label="previous chapter">‹</button>
              <button className="hf-mini" onClick={() => gotoChapter(chapterIdx + 1)} aria-label="next chapter">›</button>
              <span><b>{chapterIdx + 1}/{mf?.chapters.length || 0}</b> · {chap?.kicker} — {chap?.title}</span>
              <span className="hf-audiochip">
                {audioOk === 'ready'
                  ? <span className="ok" title={`provider ${mf?.audio.provider || 'tts'}`}>narration {narration ? `${narration.totalAudio}/${narration.totalCaps}` : 'ready'} · {mf?.audio.voice || mf?.audio.provider || 'tts'}</span>
                  : audioOk === 'missing'
                    ? <span className="bad">narration {narration ? `${narration.totalAudio}/${narration.totalCaps}` : 'missing'} lines</span>
                    : 'checking narration…'}
              </span>
              <span style={{ marginLeft: 'auto' }} className="hf-time">{fmt(globalStart + t)} / {fmt(total)}</span>
            </div>

            {audioOk === 'missing' && (
              <div className="hf-pace">
                <button className="hf-mini" onClick={prepareNarration} disabled={running}>
                  {running && job?.kind === 'tts' ? `recording… ${job.pct}%` : 'Record narration'}
                </button>
              </div>
            )}

            <div className={`hf-rbar${running ? ' on' : ''}`}><i style={{ width: `${job?.pct || 0}%` }} /></div>

            <div className="hf-ctl">
              <span className="hf-hint" style={{ flex: 1, margin: 0 }}>{jobHint}</span>
              <button className="hf-big sm" onClick={() => setExportOpen(true)} disabled={running}>Export MP4</button>
            </div>
          </div>

          {/* ------------- right column: Lumen glass panel with tabs ------------- */}
          <div className={`hf-panel hf-glass${panelOpen ? ' open' : ''}`}>
            <button className="hf-grab" onClick={() => setPanelOpen(v => !v)} aria-label="Expand panel" />

            <div className="hf-tabs">
              <button className={panelTab === 'ai' ? 'on' : ''} onClick={() => selectTab('ai')}>Ask AI</button>
              <button className={panelTab === 'ch' ? 'on' : ''} onClick={() => selectTab('ch')}>Chapters</button>
              <button className={panelTab === 'vids' ? 'on' : ''} onClick={() => selectTab('vids')}>Videos</button>
              <button className={panelTab === 'help' ? 'on' : ''} onClick={() => selectTab('help')}>Help</button>
            </div>

            {/* Ask AI */}
            <div className={`hf-pane${panelTab === 'ai' ? ' on' : ''}`}>
              <div className="hf-aibody">
                <div className="hf-msg ai">Describe the video you want. The AI plans chapters, writes every scene (layout + motion), tests it headlessly, records narration and QC-checks the pack.</div>
                <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={4}
                  placeholder="generate a video on explaining antigravity in physics for dummies" aria-label="Video prompt" />
                <div className="hf-opts" role="group" aria-label="Chapters">
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <button key={n} className={`hf-chip${nChapters === n ? ' on' : ''}`} onClick={() => setNChapters(n)}>{n}</button>
                  ))}
                </div>
                <button className="hf-big sm" style={{ width: '100%', maxWidth: 'none', marginTop: 0 }} onClick={startGenerate} disabled={running || !prompt.trim()}>
                  {running && job?.kind === 'generate' ? 'Generating…' : 'Generate video'}
                </button>

                {job && (
                  <div>
                    <ul className="hf-log">
                      {job.steps.slice(-7).map((s, i, arr) => (
                        <li key={i} className={job.status === 'running' && i === arr.length - 1 ? 'run' : 'ok'}>{s}</li>
                      ))}
                      {job.status === 'running' && !job.steps.length && <li className="run">Starting…</li>}
                    </ul>
                    <div className={`hf-rbar on`} style={{ width: '100%' }}><i style={{ width: `${job.pct}%` }} /></div>
                    {job.error && <p className="hf-err">{job.error}</p>}
                    {job.status === 'done' && job.result?.id && (
                      <button className="hf-chip on" onClick={() => { loadVideo(job.result.id); selectTab('ch'); }}>Open “{job.result.title}”</button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Chapters */}
            <div className={`hf-pane${panelTab === 'ch' ? ' on' : ''}`}>
              <div className="hf-list">
                {mf?.chapters.map((c, i) => (
                  <div key={c.id} className={`hf-scene${i === chapterIdx ? ' cur' : ''}`} onClick={() => gotoChapter(i)} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); gotoChapter(i); } }}>
                    <b>{i + 1}. {c.title}</b>
                    <small>{c.kicker}</small>
                    <div className="m"><span>{c.captions.length} captions</span><span>{fmt(c.duration)}</span></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Videos */}
            <div className={`hf-pane${panelTab === 'vids' ? ' on' : ''}`}>
              <div className="hf-list">
                {[...videos.generated, ...videos.bundled].map(p => (
                  <div key={p.id} className={`hf-proj hf-glass${vid === p.id ? ' sel' : ''}`} onClick={() => loadVideo(p.id)} role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadVideo(p.id); } }}>
                    <div className="sw" style={{ background: swatch(p.id) }} />
                    <div style={{ minWidth: 0 }}>
                      <b>{p.title}</b>
                      <small>{p.chapters} chapters{p.created ? ` · ${ago(p.created)}` : ' · bundled'}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Help */}
            <div className={`hf-pane${panelTab === 'help' ? ' on' : ''}`}>
              <div className="hf-list">
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.6, color: 'var(--mute)' }}>
                  <li style={{ marginBottom: 10 }}>Every chapter is a <b style={{ color: 'var(--ink)' }}>deterministic HTML scene</b> (SVG + a seek-safe motion engine). Scrub anywhere — always identical.</li>
                  <li style={{ marginBottom: 10 }}><b style={{ color: 'var(--ink)' }}>Narration is real audio</b> — per-line TTS auto-fitted to each caption slot, scheduled sample-accurately on the WebAudio clock.</li>
                  <li style={{ marginBottom: 10 }}><b style={{ color: 'var(--ink)' }}>Ask AI</b> plans a new video, writes every scene, validates it headlessly, records narration and QC-checks the pack.</li>
                  <li><b style={{ color: 'var(--ink)' }}>Export MP4</b> streams frames into ffmpeg (CRF 18, bt709, +faststart) with the narration muxed in.</li>
                </ol>
                <p className="hf-hint" style={{ marginTop: 14 }}>Shortcuts: Space play/pause · ←/→ ±1 s (Shift ±5 s) · ↑/↓ chapters · F fullscreen · G Ask AI · E export · drag the timeline to scrub.</p>
                <p className="hf-hint" style={{ marginTop: 10 }}>Generation and rendering run on the local render-service. Exports land in /exports.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* export modal */}
      {exportOpen && (
        <div className="hf-modal" onClick={() => setExportOpen(false)}>
          <div className="box hf-glass" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Export MP4">
            <h2>Export MP4</h2>
            <p className="hf-hint">H.264 · CRF 18 · 1080p · narration muxed in · bt709 · +faststart</p>
            <div style={{ marginTop: 14 }}>
              <label className="hf-cl">
                <input type="radio" name="scope" checked={exportScope === 'chapter'} onChange={() => setExportScope('chapter')} />
                <span>Current chapter — <span className="hf-hint">{chap?.title} ({fmt(chap?.duration || 0)})</span></span>
              </label>
              <label className="hf-cl">
                <input type="radio" name="scope" checked={exportScope === 'full'} onChange={() => setExportScope('full')} />
                <span>Full video — <span className="hf-hint">{fmt(total)} (long render)</span></span>
              </label>
            </div>
            {audioOk === 'missing' && (
              <p className="hf-err" style={{ marginTop: 4 }}>Narration audio is incomplete — exports require it (no silent videos). Record narration first.</p>
            )}
            <div className="hf-mrow">
              <button className="hf-chip" onClick={() => setExportOpen(false)}>Cancel</button>
              <button className="hf-big sm" onClick={startExport} disabled={audioOk === 'missing' || running}>Start export</button>
            </div>
          </div>
        </div>
      )}

      {/* help modal (keyboard hint) */}
      {helpOpen && (
        <div className="hf-modal" onClick={() => setHelpOpen(false)}>
          <div className="box hf-glass" onClick={e => e.stopPropagation()}>
            <h2>How this works</h2>
            <p className="hf-hint">Open the Help tab in the side panel for the full guide.</p>
            <div className="hf-mrow"><button className="hf-chip on" onClick={() => setHelpOpen(false)}>Got it</button></div>
          </div>
        </div>
      )}

      {/* toast */}
      <div className={`hf-toast${toastMsg ? ' on' : ''}`} role="status">{toastMsg || ''}</div>
    </div>
  );
}
