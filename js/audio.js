// Synthesised sound: per-bike engine voices with gear shifts, flip chimes, crash thud, finish fanfare, button pops.
(function (root) {
  // Each bike has its own engine voice. Frequencies are the firing fundamental in Hz at idle and at the limiter.
  // pulse = firing-pulse amplitude modulation (lumpiness), drive = waveshaper saturation, pops = overrun crackle.
  // turbo: spool whistle range (Hz), blow-off sweep (Hz), flutter rate (Hz, 0 = clean "pshh"), loudness.
  const ENGINES = {
    storm: {      // screaming inline-four: smooth, bright and very high-revving
      idle: 42, peak: 210, gears: 6, waves: ['sawtooth', 'triangle'], mix: [1, 0.5], ratios: [1, 2],
      cutoff: [800, 4600], q: 3, drive: 0.12, pulse: { ratio: 0.5, depth: 0.08 }, hiss: 0.012, hissFreq: 3200, vol: 1.25, pops: 0,
    },
    tricolore: {  // raspy inline-four: hollow square-wave rasp through a resonant midrange
      idle: 34, peak: 165, gears: 6, waves: ['square', 'sawtooth'], mix: [0.75, 0.55], ratios: [1, 0.5],
      cutoff: [520, 2700], q: 9, drive: 0.35, pulse: { ratio: 0.25, depth: 0.18 }, hiss: 0.02, hissFreq: 1800, vol: 0.8, pops: 0.35,
      turbo: { whistle: [3000, 7200], sweep: [4200, 1400], flutter: 0, vol: 0.8 },
    },
    rosso: {      // big-bang V4: deep, lumpy thump that crackles when you lift off
      idle: 21, peak: 112, gears: 5, waves: ['sawtooth', 'square'], mix: [1, 0.6], ratios: [1, 0.5],
      cutoff: [260, 1600], q: 2.5, drive: 0.6, pulse: { ratio: 0.5, depth: 0.6 }, hiss: 0.01, hissFreq: 900, vol: 1.05, pops: 1,
      turbo: { whistle: [2100, 5000], sweep: [2700, 650], flutter: 22, vol: 1 },
    },
    op: {         // OP #27: screaming turbo two-stroke, buzzy "ring-ding" with crackles and a huge blow-off
      idle: 48, peak: 270, gears: 5, waves: ['square', 'sawtooth'], mix: [0.7, 0.6], ratios: [1, 2.01],
      cutoff: [700, 5200], q: 6, drive: 0.7, pulse: { ratio: 1, depth: 0.35 }, hiss: 0.04, hissFreq: 2800, vol: 0.85, pops: 0.9,
      turbo: { whistle: [3800, 9200], sweep: [4600, 1200], flutter: 28, vol: 1.1 },
    },
    viper: {      // naked inline-four: chorused growl with an intake howl on top
      idle: 30, peak: 180, gears: 6, waves: ['sawtooth', 'sawtooth', 'sine'], mix: [0.75, 0.75, 0.3], ratios: [1, 1.013, 3],
      cutoff: [460, 3500], q: 5, drive: 0.9, pulse: { ratio: 0.25, depth: 0.24 }, hiss: 0.05, hissFreq: 2300, vol: 0.78, pops: 0.6,
      turbo: { whistle: [3400, 8400], sweep: [3800, 1000], flutter: 34, vol: 0.9 },
    },
  };

  let noiseBuf = null;
  function noiseBuffer(c) {
    if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function driveCurve(drive) {
    const k = 1 + drive * 8, n = 1024, curve = new Float32Array(n), norm = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; curve[i] = Math.tanh(x * k) / norm; }
    return curve;
  }

  // oscillators -> drive -> lowpass -> firing pulse -> shift cut -> out
  function buildEngine(c, key, dest) {
    const P = ENGINES[key];
    const out = c.createGain(); out.gain.value = 0;
    const shift = c.createGain(); shift.gain.value = 1;
    const pulse = c.createGain(); pulse.gain.value = 1 - P.pulse.depth / 2;
    const lfo = c.createOscillator(); lfo.type = 'sine';
    const lfoAmt = c.createGain(); lfoAmt.gain.value = P.pulse.depth / 2;
    lfo.connect(lfoAmt); lfoAmt.connect(pulse.gain);
    const shaper = c.createWaveShaper(); shaper.curve = driveCurve(P.drive); shaper.oversample = '2x';
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.Q.value = P.q; filt.frequency.value = P.cutoff[0];
    const oscs = P.waves.map((w, i) => {
      const o = c.createOscillator(); o.type = w; o.frequency.value = P.idle * P.ratios[i];
      const g = c.createGain(); g.gain.value = P.mix[i] * 0.5;
      o.connect(g); g.connect(shaper);
      return o;
    });
    shaper.connect(filt); filt.connect(pulse); pulse.connect(shift); shift.connect(out);
    const noise = c.createBufferSource(); noise.buffer = noiseBuffer(c); noise.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = P.hissFreq; bp.Q.value = 0.8;
    const hiss = c.createGain(); hiss.gain.value = 0;
    noise.connect(bp); bp.connect(hiss); hiss.connect(out);
    // turbo spool: a sine whistle plus a breathy band of noise, both scaled by boost
    let whistle = null, whistleGain = null, spool = null;
    if (P.turbo) {
      whistle = c.createOscillator(); whistle.type = 'sine'; whistle.frequency.value = P.turbo.whistle[0];
      whistleGain = c.createGain(); whistleGain.gain.value = 0;
      whistle.connect(whistleGain); whistleGain.connect(out);
      const sbp = c.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = P.turbo.whistle[0] * 1.4; sbp.Q.value = 6;
      spool = c.createGain(); spool.gain.value = 0;
      noise.connect(sbp); sbp.connect(spool); spool.connect(out);
      spool.bp = sbp;
    }
    out.connect(dest);
    const t = c.currentTime;
    oscs.forEach(o => o.start(t)); lfo.start(t); noise.start(t); if (whistle) whistle.start(t);
    return {
      key, P, oscs, lfo, filt, out, shift, hiss, whistle, whistleGain, spool, gear: 0, load: 0, boost: 0,
      stop(at) {
        out.gain.cancelScheduledValues(at);
        out.gain.setTargetAtTime(0, at, 0.06);
        for (const o of [...oscs, lfo, noise, whistle]) if (o) o.stop(at + 0.5);
        setTimeout(() => out.disconnect(), Math.max(0, at - c.currentTime + 0.7) * 1000);
      },
    };
  }

  // Set every voice parameter for engine revs r (0 idle .. 1 limiter) and throttle load (0..1) at time `at`.
  function applyRevs(e, r, load, on, at, tc, boost = 0) {
    const P = e.P, f = P.idle + (P.peak - P.idle) * r;
    e.oscs.forEach((o, i) => o.frequency.setTargetAtTime(f * P.ratios[i], at, tc));
    e.lfo.frequency.setTargetAtTime(f * P.pulse.ratio, at, tc);
    e.filt.frequency.setTargetAtTime(P.cutoff[0] + (P.cutoff[1] - P.cutoff[0]) * Math.min(1, 0.15 + r * (0.3 + 0.7 * load)), at, tc * 1.5);
    e.out.gain.setTargetAtTime(on ? P.vol * (0.045 + load * 0.05 + r * 0.025) : 0, at, on ? 0.08 : 0.25);
    e.hiss.gain.setTargetAtTime(on ? P.hiss * (0.3 + load) : 0, at, 0.1);
    if (e.whistle) setBoost(e, on ? boost : 0, r, at);
  }
  function setBoost(e, boost, r, at) {
    const T = e.P.turbo, b = Math.max(0, Math.min(1, boost));
    const f = T.whistle[0] + (T.whistle[1] - T.whistle[0]) * b * (0.5 + 0.5 * r);
    e.whistle.frequency.setTargetAtTime(f, at, 0.08);
    e.spool.bp.frequency.setTargetAtTime(f * 1.4, at, 0.08);
    e.whistleGain.gain.setTargetAtTime(b * b * 0.012 * T.vol, at, 0.1);
    e.spool.gain.setTargetAtTime(b * b * 0.05 * T.vol, at, 0.1);
  }

  // Gear boundaries as a fraction of top wheel speed; low gears are short.
  function gearEdges(n) { return Array.from({ length: n + 1 }, (_, k) => Math.pow(k / n, 1.25)); }

  const Sfx = {
    ctx: null, master: null, eng: null, revEng: null, muted: false, ENGINES,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return;
      try {
        const c = this.ctx = new AC();
        this.master = c.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        this.master.connect(c.destination);
      } catch (e) { this.ctx = null; }
    },
    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    },
    // sp: { road, wheel, air } — road speed and rear-wheel spin as fractions of top speed, and whether airborne.
    // Gears follow road speed; in the air the gear holds and the engine free-revs with the wheel. key: engine voice.
    engine(on, sp, load, key, dt = 1 / 60) {
      if (typeof sp === 'number') sp = { road: sp, wheel: sp, air: false };
      if (!this.ctx) return;
      if (!this.eng || (key && this.eng.key !== key)) {
        if (!on) return;
        if (this.eng) this.eng.stop(this.ctx.currentTime);
        this.eng = buildEngine(this.ctx, key || 'storm', this.master);
        this.eng.edges = gearEdges(this.eng.P.gears);
      }
      const e = this.eng, t = this.ctx.currentTime, edges = e.edges;
      const road = Math.max(0, Math.min(1.1, sp.road)), wheel = Math.max(0, Math.min(1.1, sp.wheel));
      // gear selection with a little hysteresis so shifts don't flutter at the boundary
      const before = e.gear;
      if (!sp.air) {
        while (e.gear < e.P.gears - 1 && road > edges[e.gear + 1] + 0.01) e.gear++;
        while (e.gear > 0 && road < edges[e.gear] - 0.03) e.gear--;
      }
      // on the ground a little wheelspin flares the revs; in the air they follow the free-spinning wheel
      const s = sp.air ? wheel : road + Math.max(0, wheel - road) * 0.25;
      const lo = edges[e.gear], hi = edges[e.gear + 1];
      const frac = Math.max(0, Math.min(1.06, (s - lo) / (hi - lo)));
      const start = e.gear === 0 ? 0.04 : 0.42;
      const r = Math.min(1.04, start + frac * (1 - start) + load * 0.03);
      // Turbo: boost spools up under full throttle; each upshift and every lift-off vents it through the blow-off valve.
      if (e.P.turbo) {
        if (!on) e.boost = 0;
        else if (load > 0.5) e.boost = Math.min(1, e.boost + dt * (0.6 + r * 1.4));
        else {
          if (e.load > 0.5 && e.boost > 0.3) { this.blowOff(e.P.turbo, e.boost, 0); e.boost = 0; }
          e.boost = Math.max(0, e.boost - dt * 2);
        }
      }
      applyRevs(e, r, load, on, t, e.gear !== before ? 0.025 : 0.05, e.boost);
      if (on && e.gear > before && load > 0.5) {
        // upshift: brief ignition cut
        e.shift.gain.cancelScheduledValues(t);
        e.shift.gain.setValueAtTime(0.3, t);
        e.shift.gain.setTargetAtTime(1, t + 0.05, 0.04);
        if (e.P.turbo && e.boost > 0.35) { this.blowOff(e.P.turbo, e.boost * 0.75, 0); e.boost *= 0.3; }
      }
      if (on && e.P.pops && e.load > 0.5 && load < 0.5 && r > 0.5) this.crackle(e.P.pops, 0);
      e.load = load;
    },
    // A short showroom rev for the garage: blip, blip, then a long pull.
    rev(key) {
      if (!this.ctx || this.muted) return;
      const c = this.ctx, t = c.currentTime + 0.02;
      if (this.revEng) this.revEng.stop(t);
      const e = this.revEng = buildEngine(c, key, this.master);
      const plan = [[0, 0.03, 0.2], [0.1, 0.62, 1], [0.32, 0.08, 0], [0.55, 0.7, 1], [0.78, 0.1, 0], [1.0, 1.0, 1], [1.55, 0.05, 0]];
      for (const [dt, r, load] of plan) applyRevs(e, r, load, true, t + dt, load ? 0.06 : 0.09, load ? r : 0);
      if (e.P.pops) { this.crackle(e.P.pops, 0.36); this.crackle(e.P.pops, 1.6); }
      if (e.P.turbo) { this.blowOff(e.P.turbo, 0.55, 0.34); this.blowOff(e.P.turbo, 0.65, 0.8); this.blowOff(e.P.turbo, 1, 1.57); }
      e.stop(t + 2.1);
    },
    // Turbo blow-off ("sho"): a burst of air swept down through a bandpass, optionally fluttering (stu-tu-tu).
    blowOff(T, amount, delay) {
      if (!this.ctx || this.muted || amount < 0.05) return;
      this.bovCount = (this.bovCount || 0) + 1;
      const c = this.ctx, at = c.currentTime + delay, dur = 0.3 + amount * 0.3;
      const src = c.createBufferSource(); src.buffer = noiseBuffer(c);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(T.sweep[0], at);
      bp.frequency.exponentialRampToValueAtTime(T.sweep[1], at + dur);
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
      const env = c.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.32 * T.vol * amount, at + 0.012);
      env.gain.setTargetAtTime(0.0001, at + 0.05, dur / 3.2);
      src.connect(bp); bp.connect(hp); hp.connect(env);
      let last = env;
      if (T.flutter) {
        const flut = c.createGain(); flut.gain.value = 0.55;
        const lfo = c.createOscillator(); lfo.type = 'square';
        lfo.frequency.setValueAtTime(T.flutter, at);
        lfo.frequency.linearRampToValueAtTime(T.flutter * 0.5, at + dur);
        const depth = c.createGain(); depth.gain.value = 0.45;
        lfo.connect(depth); depth.connect(flut.gain);
        env.connect(flut); last = flut;
        lfo.start(at); lfo.stop(at + dur + 0.2);
      }
      last.connect(this.master);
      src.start(at, Math.random() * 1.2, dur + 0.2);
    },
    // Exhaust pops on the overrun: a few tiny filtered noise bursts.
    crackle(amount, delay) {
      if (!this.ctx || this.muted) return;
      const c = this.ctx, n = 2 + Math.round(Math.random() * 3 * amount);
      for (let i = 0; i < n; i++) {
        const at = c.currentTime + delay + 0.05 + Math.random() * 0.35;
        const src = c.createBufferSource(); src.buffer = noiseBuffer(c);
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 1400; f.Q.value = 1.2;
        const g = c.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.35 * amount * (0.5 + Math.random() * 0.5), at + 0.004);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.03 + Math.random() * 0.04);
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(at, Math.random() * 1.5, 0.1);
      }
    },
    tone(freq, start, dur, type = 'square', vol = 0.12, slide = 0) {
      if (!this.ctx || this.muted) return;
      const c = this.ctx, t = c.currentTime + start;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol, cutoff) {
      if (!this.ctx || this.muted) return;
      const c = this.ctx, n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const src = c.createBufferSource(); src.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, c.currentTime);
      f.frequency.exponentialRampToValueAtTime(120, c.currentTime + dur);
      const g = c.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
    },
    click() { this.tone(660, 0, 0.07, 'triangle', 0.12, 1.6); },
    flip(n) { [784, 988, 1175, 1568].slice(0, 2 + Math.min(n, 2)).forEach((f, i) => this.tone(f, i * 0.07, 0.18, 'square', 0.07)); },
    loop() { this.tone(523, 0, 0.12, 'triangle', 0.1, 2); },
    land(h) { this.noise(0.18, Math.min(0.5, 0.15 + h * 0.2), 900); },
    crash() { this.noise(0.6, 0.7, 2400); this.tone(160, 0, 0.5, 'sawtooth', 0.12, 0.3); },
    finish() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i * 0.11, i === 5 ? 0.5 : 0.16, 'square', 0.08)); },
    star(i) { this.tone(880 + i * 220, 0, 0.25, 'triangle', 0.12, 1.5); },
  };
  root.MotoSfx = Sfx;
})(typeof self !== 'undefined' ? self : this);
