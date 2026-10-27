/* lu-audio.ts — WebAudio engine for the Lumen studio.
   - narration: per-caption / per-scene buffers scheduled on the WebAudio clock
   - music: generative ambient bed (zero assets, zero licensing) OR a user-uploaded
     track, auto-ducked under narration
   - FX: transition sounds synthesized live and matched to the 8 Lumen transition
     types (fade/slide/wipe/zoom/iris/glitch/perspective/blur) — nothing to download. */

type Cap = { t: number; dur: number; audio?: string; audioDur?: number };

export class LuAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  voiceG: GainNode | null = null;
  musicG: GainNode | null = null;
  sfxG: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private active: AudioBufferSourceNode[] = [];
  private musicTimer: ReturnType<typeof setTimeout> | null = null;
  private musicNodes: (OscillatorNode | AudioBufferSourceNode)[] = [];
  private musicFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;
  musicOn = true;
  fxOn = true;
  private musicBase = 0.16;
  private musicDuck = 0.045;

  ensure() {
    if (!this.ctx) {
      const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.voiceG = this.ctx.createGain();
      this.voiceG.gain.value = 1;
      this.voiceG.connect(this.master);
      this.musicG = this.ctx.createGain();
      this.musicG.gain.value = 0;
      this.musicG.connect(this.master);
      this.sfxG = this.ctx.createGain();
      this.sfxG.gain.value = 0.9;
      this.sfxG.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  unlock() { this.ensure(); }
  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  private noiseBuf() {
    if (this.noise) return this.noise;
    const ctx = this.ensure(); if (!ctx) return null;
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    return b;
  }

  /* ---------- buffers ---------- */
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
  buf(url: string) { return this.buffers.get(url); }
  stash(key: string, buf: AudioBuffer) { this.buffers.set(key, buf); }
  clear() { this.buffers.clear(); }

  /* ---------- narration scheduling ---------- */
  stopVoice() {
    for (const s of this.active) { try { s.stop(); s.disconnect(); } catch {} }
    this.active = [];
  }
  /* schedule caption buffers whose window intersects [from, +inf) */
  schedule(caps: { cap: Cap; globalT: number }[], from: number, getBuf: (c: Cap) => AudioBuffer | undefined, opts?: { duck?: boolean }) {
    const ctx = this.ensure(); if (!ctx) return;
    this.stopVoice();
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
      src.connect(this.voiceG!);
      try { src.start(when, offset); } catch {}
      this.active.push(src);
      if (opts?.duck !== false) this.setDuck(when, when + buf.duration - offset);
    }
  }
  /* play one buffer soon (scene narration / preview) on the voice bus, with ducking */
  playNow(buf: AudioBuffer, delay = 0.05) {
    const ctx = this.ensure(); if (!ctx) return null;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceG!);
    const when = ctx.currentTime + delay;
    try { src.start(when); } catch {}
    this.active.push(src);
    this.setDuck(when, when + buf.duration);
    return src;
  }

  /* ---------- music bed ---------- */
  /* generative ambient: a slow 4-chord pad through a shared lowpass; ~0 assets */
  private CHORDS = [
    [130.81, 164.81, 196.0, 246.94], /* C E G B  */
    [110.0, 130.81, 164.81, 196.0],  /* A C E G  */
    [87.31, 110.0, 130.81, 164.81],  /* F A C E  */
    [98.0, 123.47, 146.83, 164.81],  /* G B D E  */
  ];
  musicStart(fileUrl?: string | null) {
    const ctx = this.ensure(); if (!ctx || !this.musicOn) return;
    this.musicStop(false);
    if (fileUrl) {
      this.load(fileUrl).then(buf => {
        if (!buf || !this.ctx || !this.musicOn) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.connect(this.musicG!);
        src.start();
        this.musicNodes.push(src);
        this.musicG!.gain.setTargetAtTime(this.musicBase, this.ctx.currentTime, 0.8);
      });
      return;
    }
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 720;
    this.musicFilter.Q.value = 0.4;
    this.musicFilter.connect(this.musicG!);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 140;
    lfo.connect(lfoG); lfoG.connect(this.musicFilter.frequency);
    lfo.start();
    this.musicNodes.push(lfo);
    let ci = 0;
    const chord = () => {
      const c = this.ctx!; if (!this.musicOn) return;
      const freqs = this.CHORDS[ci % this.CHORDS.length]; ci++;
      const t = c.currentTime + 0.05;
      for (const f of freqs) {
        for (const [type, det, lvl] of [['sine', 0, 0.05], ['triangle', 4, 0.016]] as const) {
          const o = c.createOscillator();
          o.type = type; o.frequency.value = f; o.detune.value = det;
          const g = c.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(lvl, t + 1.6);
          g.gain.setValueAtTime(lvl, t + 4.2);
          g.gain.linearRampToValueAtTime(0.0001, t + 6.4);
          o.connect(g); g.connect(this.musicFilter!);
          o.start(t); o.stop(t + 6.6);
          this.musicNodes.push(o);
        }
      }
      this.musicTimer = setTimeout(chord, 4800);
    };
    chord();
    this.musicG!.gain.setTargetAtTime(this.musicBase, ctx.currentTime, 1.2);
  }
  musicStop(ramp = true) {
    if (this.musicTimer) { clearTimeout(this.musicTimer); this.musicTimer = null; }
    const c = this.ctx;
    if (c && this.musicG) {
      if (ramp) this.musicG.gain.setTargetAtTime(0, c.currentTime, 0.25);
    }
    const nodes = this.musicNodes; this.musicNodes = [];
    setTimeout(() => { for (const n of nodes) { try { n.stop(); n.disconnect(); } catch {} } }, ramp ? 700 : 0);
  }
  setMusicOn(on: boolean, fileUrl?: string | null) {
    this.musicOn = on;
    if (!on) this.musicStop();
    else if (this.ctx) this.musicStart(fileUrl);
  }
  /* duck the bed while narration speaks */
  setDuck(from: number, to: number) {
    const c = this.ctx; if (!c || !this.musicG) return;
    const g = this.musicG.gain;
    g.cancelScheduledValues(c.currentTime);
    g.setTargetAtTime(this.musicDuck, Math.max(c.currentTime, from - 0.35), 0.18);
    g.setTargetAtTime(this.musicOn ? this.musicBase : 0, Math.max(c.currentTime, to + 0.25), 0.5);
  }

  /* ---------- transition FX (synthesized; matched to Lumen transition types) ---------- */
  sfx(kind: string) {
    const ctx = this.ensure(); if (!ctx || !this.fxOn) return;
    const t = ctx.currentTime + 0.02;
    const nz = this.noiseBuf();
    const burst = (dur: number, f0: number, f1: number, vol: number, type: BiquadFilterType = 'bandpass', q = 1.2) => {
      if (!nz) return;
      const src = ctx.createBufferSource(); src.buffer = nz; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = type; bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, t);
      bp.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + dur * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); g.connect(this.sfxG!);
      src.start(t); src.stop(t + dur + 0.05);
    };
    const ping = (f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine', at = 0) => {
      const o = ctx.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.linearRampToValueAtTime(vol, t + at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g); g.connect(this.sfxG!);
      o.start(t + at); o.stop(t + at + dur + 0.05);
    };
    switch (kind) {
      case 's': burst(0.38, 260, 2600, 0.16); break;                       /* slide  — airy whoosh up   */
      case 'w': burst(0.45, 2400, 180, 0.2); break;                        /* wipe   — hard whoosh down */
      case 'z': burst(0.5, 300, 1200, 0.1); ping(500, 780, 0.3, 0.06); ping(780, 1160, 0.3, 0.05, 'sine', 0.12); break; /* zoom — swell + rise */
      case 'i': ping(880, 880, 0.22, 0.07); ping(1320, 1320, 0.28, 0.05, 'sine', 0.09); burst(0.4, 900, 2600, 0.06); break; /* iris — sparkle */
      case 'g': for (let k = 0; k < 3; k++) ping(150 + k * 40, 90, 0.06, 0.09, 'square', k * 0.07); burst(0.16, 500, 3000, 0.08); break; /* glitch */
      case 'p': ping(340, 150, 0.16, 0.12, 'triangle'); burst(0.14, 700, 2200, 0.07); break; /* perspective — flip pop */
      case 'b': burst(0.6, 220, 70, 0.14, 'lowpass', 0.7); ping(120, 60, 0.4, 0.07, 'sine'); break; /* blur — soft boom */
      case 'f': default: burst(0.5, 420, 900, 0.1); break;                 /* fade   — gentle swell    */
    }
  }
}

let _eng: LuAudio | null = null;
export function getLuAudio(): LuAudio {
  if (!_eng) _eng = new LuAudio();
  return _eng;
}
