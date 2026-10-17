// Track builder + level data. Works in the browser (window.MotoLevels) and in Node (module.exports).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotoLevels = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const D2R = Math.PI / 180;
  // Bikes were slowed down; jump gaps and loops are scaled to match so every track stays clearable.
  const GAP_SCALE = 0.78, LOOP_SCALE = 0.84;

  // A turtle that walks along the track. Heading 0 = moving right, positive turns go up (counter-clockwise).
  class TrackBuilder {
    constructor() {
      this.chains = [];
      this.loops = [];
      this.cur = null;
      this.x = 0; this.y = 0; this.h = 0;
      this.finishX = null;
      this.startX = 3;
      this.used = [];
    }
    begin(x, y, hDeg = 0) {
      this._flush();
      this.x = x; this.y = y; this.h = hDeg * D2R;
      this.cur = [{ x, y }];
      return this;
    }
    _flush() {
      if (this.cur && this.cur.length > 1) this.chains.push(this.cur);
      this.cur = null;
    }
    _pt() {
      const last = this.cur[this.cur.length - 1];
      if (Math.hypot(this.x - last.x, this.y - last.y) > 0.05) this.cur.push({ x: this.x, y: this.y });
    }
    // Quarter pipe behind the start line so the bike can't roll off the back.
    startPipe() {
      return this.begin(-9, 7, -90).line(2).arc(5, 90);
    }
    line(len) {
      this.x += Math.cos(this.h) * len;
      this.y += Math.sin(this.h) * len;
      this._pt();
      return this;
    }
    arc(R, deg) {
      const s = Math.sign(deg);
      const cx = this.x - Math.sin(this.h) * R * s;
      const cy = this.y + Math.cos(this.h) * R * s;
      const a0 = Math.atan2(this.y - cy, this.x - cx);
      const n = Math.max(2, Math.ceil(Math.abs(deg) / 5));
      for (let i = 1; i <= n; i++) {
        const a = a0 + deg * D2R * i / n;
        this.x = cx + Math.cos(a) * R;
        this.y = cy + Math.sin(a) * R;
        this._pt();
      }
      this.h += deg * D2R;
      return this;
    }
    // Turn smoothly until the heading equals deg.
    to(deg, R = 10) {
      const d = deg - this.h / D2R;
      return Math.abs(d) < 0.01 ? this : this.arc(R, d);
    }
    // Smooth cosine hump of height H (negative = dip) over length L. Expects a level heading.
    bump(H, L) {
      const n = Math.ceil(L / 0.6);
      const x0 = this.x, y0 = this.y;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        this.x = x0 + L * t;
        this.y = y0 + H * (1 - Math.cos(2 * Math.PI * t)) / 2;
        this._pt();
      }
      this.h = 0;
      return this;
    }
    wave(H, L, count) {
      for (let i = 0; i < count; i++) this.bump(H, L);
      return this;
    }
    // Smooth S-shaped step up (H > 0) or down (H < 0) over length L.
    step(H, L) {
      const n = Math.ceil(L / 0.6);
      const x0 = this.x, y0 = this.y;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        this.x = x0 + L * t;
        this.y = y0 + H * (1 - Math.cos(Math.PI * t)) / 2;
        this._pt();
      }
      this.h = 0;
      return this;
    }
    // Ramp up at angle a for len metres, a gap of gx/gy, then a landing slope of la degrees down for ll metres.
    // Landing slopes and run-outs have minimum lengths so a fast bike never overshoots into the next gap.
    kicker(a, len, gx, gy, la, ll) {
      return this.to(a, 10).line(len).gap(gx * GAP_SCALE, gy, -la).line(Math.max(ll, 12)).to(0, 14).line(14);
    }
    // Sharp zigzag staircase going down: short treads and steep drops, corners left sharp.
    stairsDown(n, tread, drop, treadDeg, riserDeg) {
      for (let k = 0; k < n; k++) {
        this.h = treadDeg * D2R; this.line(tread);
        this.h = riserDeg * D2R; this.line(drop / Math.sin(-riserDeg * D2R));
      }
      this.h = treadDeg * D2R; this.line(tread);
      return this.to(0, 8);
    }
    // Sharp steps going up.
    stairsUp(n, tread, rise, riserDeg) {
      for (let k = 0; k < n; k++) {
        this.h = 0; this.line(tread);
        this.h = riserDeg * D2R; this.line(rise / Math.sin(riserDeg * D2R));
      }
      this.h = 0;
      return this.line(tread);
    }
    // A flat-topped table standing on two posts: jump onto it, ride across, drop off the far end.
    // The posts are real track, so coming up short means hitting the near post.
    table(gapIn, dy, len, sag, gapOut, dropOut) {
      const legs = 7;
      this._flush();
      const x0 = this.x + gapIn * GAP_SCALE, y0 = this.y + dy;
      this.cur = [{ x: x0, y: y0 - legs }];
      this.x = x0; this.y = y0; this._pt();
      const n = Math.max(4, Math.ceil(len / 1.5));
      for (let k = 1; k <= n; k++) {
        const u = k / n;
        this.x = x0 + len * u; this.y = y0 - sag * Math.sin(Math.PI * u); this._pt();
      }
      this.y = y0 - legs; this._pt();
      this.x = x0 + len; this.y = y0;
      return this.gap(gapOut, -dropOut, -32).line(12).to(0, 16).line(16);
    }
    // Ledge with a drop: the landing slope starts well below the lip so a fast bike can't clip its tip.
    cliff(a, len, R) {
      return this.line(8).gap(4, -2.5, -a).line(Math.max(len, 14)).to(0, Math.max(R, 16)).line(18);
    }
    // End this piece of track and continue dx/dy further on (jumps and floating pieces).
    gap(dx, dy, hDeg = null) {
      this._flush();
      this.x += dx; this.y += dy;
      if (hDeg != null) this.h = hDeg * D2R;
      this.cur = [{ x: this.x, y: this.y }];
      return this;
    }
    // Full loop-the-loop starting at the current point. The track underneath keeps going.
    // Each half is a separate chain; the sim switches which half is solid while the bike goes round.
    // gapDeg > 0 leaves an opening at the top that the bike has to fly across upside down.
    loop(R, gapDeg = 0) {
      R *= LOOP_SCALE;
      // Keep neighbouring loops far enough apart that their switching zones never overlap.
      const prev = this.loops[this.loops.length - 1];
      if (prev && Math.abs(prev.cy - prev.R - this.y) < 1 && this.x - prev.cx < prev.R + R + 7) {
        this.line(prev.R + R + 7 - (this.x - prev.cx));
      }
      const cx = this.x, cy = this.y + R;
      // flare: the far side of a broken loop opens like a funnel so a bike that drifts outward
      // over the gap is guided back onto the track instead of hitting its tip
      const half = (a0, a1, flare = 0) => {
        const pts = [];
        const n = Math.ceil((a1 - a0) / 5);
        for (let i = 0; i <= n; i++) {
          const deg = a0 + (a1 - a0) * i / n, a = deg * D2R;
          const rr = R + flare * Math.pow(Math.max(0, 1 - (deg - a0) / 40), 2);
          pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
        }
        return pts;
      };
      this.loops.push(gapDeg
        ? { cx, cy, R, gap: gapDeg, A: half(-90, 90 - gapDeg / 2), B: half(90 + gapDeg / 2, 270, 0.8) }
        : { cx, cy, R, A: half(-90, 140), B: half(40, 270) });
      return this;
    }
    finish() {
      this.finishX = this.x + 8;
      this.line(48).arc(6, 90).line(5);
      return this;
    }
    build() {
      this._flush();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const all = this.chains.concat(...this.loops.map(l => [l.A, l.B]));
      for (const c of all) for (const p of c) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      return {
        chains: this.chains, loops: this.loops,
        startX: this.startX, finishX: this.finishX, used: this.used,
        bounds: { minX, maxX, minY, maxY },
      };
    }
  }

  const THEMES = {
    jungle: { label: 'Jungle', friction: 0.95 },
    desert: { label: 'Desert', friction: 0.95 },
    ice: { label: 'Glacier', friction: 0.7 },
    meadow: { label: 'Meadow', friction: 0.95 },
    cave: { label: 'Crystal Cave', friction: 0.9 },
  };

  // stars: [time for 3 stars, time for 2 stars]. Finishing at all earns 1 star.
  // Star times come from full-throttle autopilot runs on the starter bike; each flip takes 1 s off.
  const LEVELS = [
    {
      name: 'Vine Trail', theme: 'jungle', stars: [33, 43],
      build: t => t.startPipe()
        .line(28)
        .bump(1.2, 12).line(8)
        .bump(2.2, 16).line(10)
        .to(16, 12).line(7).to(0, 12)
        .line(8)
        .to(-18, 12).line(8).to(0, 14)
        .line(14)
        .kicker(14, 4, 8, -0.8, 12, 4)
        .line(16)
        .wave(1.0, 8, 3)
        .line(12)
        .to(-10, 15).line(10).to(0, 15)
        .line(10)
        .bump(2.8, 18).line(6)
        .to(20, 12).line(8).to(0, 12)
        .line(10)
        .kicker(16, 5, 10, -1.2, 14, 6)
        .line(14)
        .wave(1.4, 10, 2)
        .line(8)
        .to(-16, 14).line(12).to(0, 14)
        .line(20)
        .kicker(12, 4, 7, -0.4, 8, 4)
        .line(12)
        .finish(),
    },
    {
      name: 'Canopy Hops', theme: 'jungle', stars: [41, 52],
      build: t => t.startPipe()
        .line(26)
        .kicker(18, 5, 10, -1.0, 14, 5)
        .line(12)
        .wave(1.6, 10, 2)
        .line(8)
        .to(24, 10).line(10).to(0, 10)
        .line(6)
        .to(-30, 8).line(12).to(0, 12)
        .line(10)
        .kicker(20, 5, 12, -1.5, 16, 6)
        .line(10)
        .bump(3, 14).line(4).bump(-2.5, 14)
        .line(10)
        .kicker(16, 4, 9, 0.2, 6, 6)
        .line(12)
        .step(-1.5, 4).line(3).step(-1.5, 4).line(3).step(-1.5, 4)
        .line(14)
        .kicker(18, 5, 11, -1.0, 14, 5)
        .line(18)
        .kicker(18, 5, 11, -1.0, 14, 5)
        .line(10)
        .wave(2.0, 12, 2)
        .line(8)
        .to(26, 10).line(8).to(0, 10)
        .line(14)
        .to(-22, 12).line(12).to(0, 14)
        .line(10)
        .finish(),
    },
    {
      name: 'Temple Loop', theme: 'jungle', stars: [34, 44],
      build: t => t.startPipe()
        .line(22)
        .to(-14, 14).line(14).to(0, 14)
        .line(14)
        .loop(5.5)
        .line(24)
        .kicker(18, 6, 11, -1.2, 15, 6)
        .line(10)
        .wave(1.4, 9, 2)
        .to(-20, 12).line(10).to(0, 12)
        .line(14)
        .loop(5.5)
        .line(20)
        .to(22, 9).line(5).to(0, 9)
        .line(10)
        .bump(2.5, 14)
        .line(8)
        .to(-18, 12).line(14).to(0, 14)
        .line(12)
        .loop(6)
        .line(12)
        .loop(6)
        .line(18)
        .kicker(16, 5, 10, -0.8, 12, 5)
        .line(12)
        .finish(),
    },
    {
      name: 'Mesa Run', theme: 'desert', stars: [45, 58],
      build: t => t.startPipe()
        .line(18)
        .to(-22, 14).line(22).to(0, 16)
        .line(14)
        .loop(6)
        .line(20)
        .kicker(20, 8, 14, -2, 18, 8)
        .line(10)
        .bump(2.6, 14).bump(2.6, 14)
        .line(8)
        .to(28, 10).line(12).to(0, 10)
        .line(10)
        .step(-6, 24)
        .line(26)
        .kicker(16, 5, 10, -0.5, 10, 5)
        .line(12)
        .to(-20, 14).line(18).to(0, 16)
        .line(10)
        .loop(6.5)
        .line(16)
        .wave(2.2, 13, 3)
        .line(10)
        .kicker(22, 6, 15, -1.5, 18, 8)
        .line(10)
        .to(30, 10).line(10).to(0, 10)
        .line(8)
        .cliff(40, 10, 16)
        .line(16)
        .finish(),
    },
    {
      name: 'Sunset Spirals', theme: 'desert', stars: [48, 62],
      build: t => t.startPipe()
        .line(16)
        .to(-25, 12).line(20).to(0, 16)
        .line(16)
        .loop(6)
        .line(16)
        .loop(6)
        .line(18)
        .to(24, 10).line(6).to(0, 14)
        .line(10)
        .cliff(40, 8, 12)
        .line(10)
        .kicker(20, 6, 13, -1.5, 16, 6)
        .line(8)
        .wave(1.8, 11, 3)
        .line(10)
        .to(-18, 14).line(14).to(0, 14)
        .line(8)
        .loop(6.5)
        .line(14)
        .bump(3, 16).line(6)
        .to(-24, 12).line(16).to(0, 16)
        .line(12)
        .loop(6).line(12).loop(6).line(12).loop(6)
        .line(16)
        .kicker(18, 5, 11, -1, 14, 6)
        .line(14)
        .finish(),
    },
    {
      name: 'Canyon Leap', theme: 'desert', stars: [46, 60],
      build: t => t.startPipe()
        .line(20)
        .to(-18, 14).line(16).to(0, 14)
        .line(8)
        .kicker(22, 7, 16, -2.5, 18, 8)
        .line(10)
        .to(34, 10).line(14).to(0, 10)
        .line(14)
        .cliff(48, 10, 18)
        .line(12)
        .kicker(25, 6, 16, -0.5, 20, 10)
        .line(8)
        .bump(-3, 16).bump(3, 14)
        .line(26)
        .kicker(18, 5, 12, -1, 14, 5)
        .line(10)
        .to(30, 10).line(16).to(0, 10)
        .line(10)
        .cliff(45, 14, 20)
        .line(14)
        .kicker(24, 7, 18, -2, 18, 8)
        .line(10)
        .step(-1.6, 4).line(3).step(-1.6, 4).line(3).step(-1.6, 4)
        .line(10)
        .kicker(20, 5, 14, -0.5, 16, 6)
        .line(10)
        .finish(),
    },
    {
      name: 'Frostbite', theme: 'ice', stars: [37, 47],
      build: t => t.startPipe()
        .line(24)
        .wave(1.0, 9, 3)
        .line(8)
        .to(-20, 14).line(14).to(0, 14)
        .line(14)
        .loop(5.5)
        .line(18)
        .kicker(18, 6, 11, -1, 14, 6)
        .line(10)
        .to(26, 10).line(10).to(0, 10)
        .line(6)
        .to(-30, 10).line(10).to(0, 12)
        .line(12)
        .bump(2.4, 13)
        .line(12)
        .wave(1.6, 10, 3)
        .line(8)
        .to(-20, 12).line(12).to(0, 14)
        .line(12)
        .loop(6)
        .line(14)
        .kicker(20, 6, 13, -1.2, 16, 6)
        .line(12)
        .to(22, 10).line(8).to(0, 10)
        .line(10)
        .finish(),
    },
    {
      name: 'Glacier Drop', theme: 'ice', stars: [45, 58],
      build: t => t.startPipe()
        .line(16)
        .to(14, 10).line(5).to(0, 10)
        .line(10)
        .cliff(50, 14, 20)
        .line(16)
        .loop(6)
        .line(16)
        .kicker(22, 6, 14, -1.5, 18, 7)
        .line(8)
        .wave(1.6, 10, 2)
        .line(6)
        .to(-22, 12).line(12).to(0, 14)
        .line(12)
        .loop(6)
        .line(14)
        .to(30, 10).line(8).to(0, 10)
        .line(12)
        .cliff(45, 12, 18)
        .line(10)
        .loop(6.5)
        .line(14)
        .kicker(18, 5, 11, -0.5, 12, 5)
        .line(8)
        .bump(-2.5, 14).bump(2.5, 14)
        .line(26)
        .kicker(22, 6, 15, -1.5, 18, 8)
        .line(12)
        .finish(),
    },
    {
      name: 'Polar Madness', theme: 'ice', stars: [60, 77],
      build: t => t.startPipe()
        .line(16)
        .to(-24, 12).line(16).to(0, 16)
        .line(14)
        .loop(6)
        .line(12)
        .loop(6)
        .line(16)
        .kicker(22, 7, 15, -2, 18, 7)
        .line(8)
        .wave(1.8, 10, 3)
        .line(8)
        .to(32, 10).line(10).to(0, 10)
        .line(10)
        .cliff(48, 10, 18)
        .line(14)
        .loop(6.5)
        .line(14)
        .kicker(18, 5, 11, -0.5, 12, 5)
        .line(8)
        .bump(-3, 14).bump(2.5, 12)
        .line(10)
        .step(-1.6, 4).line(3).step(-1.6, 4).line(3).step(-1.6, 4)
        .line(12)
        .to(-20, 12).line(14).to(0, 14)
        .line(10)
        .loop(6).line(10).loop(6).line(10).loop(6)
        .line(14)
        .kicker(24, 7, 18, -2, 18, 8)
        .line(10)
        .to(28, 10).line(10).to(0, 10)
        .line(10)
        .cliff(45, 12, 18)
        .line(12)
        .finish(),
    },
  ];

  // ---------- Generated levels ----------
  // Levels after the hand-built ones come from a seeded generator, so every player gets the same tracks.
  // Difficulty (gap width, loops, cliffs, length) rises steadily to the last level. Every generated level
  // was ridden by the autopilot on the slowest and the fastest bike; GEN_FIX holds the re-roll that passed
  // for each level (base-36 digit) and GEN_TIMES the starter bike's autopilot time, used for the stars.
  const TOTAL = 500, HAND = LEVELS.length;
  const GEN_FIX = '000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000100000000000000000000000000000100000000000000000000000000000000000000001020000000000000001000000000000000000000001000000000000000000000000000000000000000000000000000000010000001000000000001000001000000000000001000000000000010000000000000000110001000000010010000000000000000000000001000011000100010200000000010011000000000010201000100000000001010000100001';
  const GEN_TIMES = [
    31.1, 26.7, 33.5, 33.5, 28.7, 31.5, 30.9, 33.8, 33.4, 30.4, 31.5, 28.9, 32, 31.1, 27.4, 32.9, 32.3, 27.8, 31, 28.9,
    28.3, 32, 31.1, 31.8, 28.8, 28.5, 35.6, 35.1, 31.4, 37.2, 30.5, 36.3, 38.8, 31.1, 31.6, 34.5, 26.8, 29.3, 33.5, 33.4,
    30.6, 34.1, 30.1, 30.9, 29.4, 34.9, 33.2, 32.4, 33, 35.3, 35.2, 31, 35.1, 37.2, 36.8, 34.9, 35.6, 38.9, 31.3, 37.2,
    35.3, 36.2, 32, 35.2, 36.2, 32.7, 38.5, 36.6, 35.2, 34.8, 36.4, 33.9, 29.7, 38.9, 33.8, 37.7, 33.4, 35.6, 41.3, 37.7,
    36.6, 36.7, 38.8, 36.2, 45.9, 37.9, 35.8, 34.9, 33.7, 39.1, 37.1, 39, 40.4, 41.4, 41.7, 42.2, 41.8, 38.9, 38.4, 41.7,
    38.3, 42.7, 37, 35.7, 38.7, 38.8, 38.6, 34.5, 45.5, 39.6, 42.7, 38.8, 35.7, 39.4, 40.5, 41.7, 38, 40.7, 37.8, 41.4,
    42.4, 38.2, 41.1, 38.4, 41.2, 40.1, 40.6, 41.3, 42, 38.9, 39.1, 36.2, 40.2, 38.9, 47.5, 40.3, 43.4, 41.6, 37.5, 35.8,
    36.4, 36.1, 34.2, 44.5, 42, 38.1, 50.3, 42.7, 42.1, 43.4, 37.2, 46, 46.3, 37.9, 50.3, 43.7, 40.9, 46.4, 44.9, 48.7,
    40.9, 44.8, 37.3, 41.9, 38.6, 41.5, 39.8, 46.5, 44.5, 49.8, 42, 45.2, 39.9, 44.9, 42.1, 37.8, 46, 44.7, 39.6, 48.6,
    47, 47.8, 45.5, 46.3, 39.8, 51.2, 49.4, 43.8, 44.1, 50.6, 39.5, 49.9, 41, 54.9, 46.4, 40.3, 40.3, 41.8, 42.2, 48.2,
    48.2, 44, 46, 49.3, 40.8, 40.7, 43.1, 49.1, 52.4, 48.3, 54.8, 43.9, 47.5, 42.4, 45.1, 46.5, 45.2, 46, 47.2, 38.8,
    44.4, 48.2, 47.4, 51.5, 49.3, 52.7, 50.7, 45.3, 49.7, 44.7, 42.4, 50.9, 51, 48.5, 51.1, 48.1, 48.7, 51.3, 45.4, 47.5,
    44.6, 46.9, 49, 53.5, 52.1, 42.4, 60.2, 53.4, 56.4, 53, 51.1, 51.5, 50.6, 47.3, 49.6, 54, 50.4, 48.6, 52.9, 48.8,
    51.1, 45.9, 49.9, 47.3, 45.2, 50.6, 51.9, 48.8, 50.3, 49.9, 52.2, 47.1, 48, 45.6, 44.8, 47.2, 46.6, 53.8, 47, 52.8,
    46.7, 47.6, 51.1, 55.5, 49.7, 52, 51.4, 47.9, 60, 55.4, 52.3, 50.4, 53.9, 55.4, 52.7, 53.1, 58.8, 55.9, 49.9, 47.9,
    57.8, 50.8, 56.4, 48.5, 48.5, 49.1, 51, 51.5, 48.7, 53.8, 59.7, 50.6, 52.3, 48.3, 52.9, 46.1, 50.3, 56.9, 56.3, 51.4,
    52.3, 57.2, 60.9, 49, 55.1, 57.6, 54.6, 54.1, 53.1, 51.2, 53.4, 50.5, 61.7, 59.5, 54, 52.6, 50.8, 53.1, 54.6, 49.4,
    48.6, 60.4, 54, 62.5, 59.1, 54.8, 56, 50, 53.6, 54.2, 57.8, 54.7, 55.3, 52.7, 61.5, 60, 61.4, 55.9, 59, 53.7,
    48.7, 55.4, 53, 59.9, 54.6, 63.6, 51.9, 61.7, 49.2, 54.2, 58.4, 58.4, 59.1, 59.3, 55.7, 59.7, 56.7, 59, 58.9, 58,
    56.3, 59.6, 50, 51.1, 50.7, 53.6, 54.5, 62.9, 60.2, 58.1, 58.9, 60.1, 56.3, 59.4, 63.9, 57.3, 55.9, 66.4, 67, 60.5,
    59.2, 62.8, 53.8, 70, 59.4, 54, 61.3, 62.4, 57.7, 58, 57, 56.8, 62.9, 57.2, 60.1, 57.5, 59.7, 62.5, 58.9, 60.3,
    54.3, 61.2, 51.7, 62.6, 67.2, 58.3, 56.2, 57.5, 54, 61.1, 69.3, 61.8, 64.2, 58.7, 65.1, 57.4, 55, 56.5, 65.8, 61.8,
    62.5, 57, 57.1, 59.2, 56.4, 62.4, 60.7, 63.4, 64, 57.6, 57.8, 70.7, 62.8, 58.8, 60.5, 64.8, 60.6, 58.2, 60.2, 50.9,
    58.4, 65, 62.5, 63.1, 62.5, 58.7, 63.8, 58.7, 69, 59.6, 61.6, 64.3, 65.6, 61.2, 64.6, 66.7, 64.7, 60.7, 58.7, 63.1,
    63.7, 65.2, 56.3, 60.5, 65.8, 58, 65.8, 64.4, 60.7, 65.5, 67.5,
  ];

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const NAMES = {
    jungle: [['Mossy', 'Tangled', 'Howling', 'Hidden', 'Emerald', 'Misty', 'Ancient', 'Wild', 'Thorny', 'Sunken', 'Golden', 'Viper'],
      ['Canopy', 'Ruins', 'Falls', 'Hollow', 'Ridge', 'Temple', 'Swamp', 'Grove', 'Vines', 'Lagoon', 'Trail', 'Idol']],
    desert: [['Scorched', 'Dusty', 'Crimson', 'Blazing', 'Rattlesnake', 'Sunset', 'Copper', 'Lonely', 'Twisted', 'Burning', 'Amber', 'Dry'],
      ['Mesa', 'Gulch', 'Dunes', 'Canyon', 'Butte', 'Arroyo', 'Flats', 'Spires', 'Pass', 'Badlands', 'Ridge', 'Wash']],
    ice: [['Frozen', 'Crystal', 'Arctic', 'Polar', 'Shivering', 'Glacial', 'Silent', 'Frosty', 'Blizzard', 'Pale', 'Icy', 'Northern'],
      ['Pass', 'Drift', 'Crevasse', 'Peak', 'Tundra', 'Fjord', 'Shelf', 'Spire', 'Cavern', 'Slope', 'Floe', 'Summit']],
    meadow: [['Sunny', 'Breezy', 'Rolling', 'Clover', 'Daisy', 'Windy', 'Lazy', 'Bright', 'Hidden', 'Green', 'Honey', 'Sleepy'],
      ['Hills', 'Meadow', 'Valley', 'Fields', 'Brook', 'Orchard', 'Downs', 'Pasture', 'Hollow', 'Glade', 'Mill', 'Lane']],
    cave: [['Crystal', 'Echoing', 'Glowing', 'Sapphire', 'Hollow', 'Dripping', 'Amethyst', 'Deep', 'Shimmering', 'Gloomy', 'Quartz', 'Lost'],
      ['Cavern', 'Grotto', 'Depths', 'Mine', 'Tunnels', 'Vault', 'Geode', 'Chasm', 'Hollow', 'Abyss', 'Lode', 'Shaft']],
  };
  const WORLD_ORDER = ['jungle', 'desert', 'ice', 'meadow', 'cave'];
  const genTheme = i => WORLD_ORDER[Math.floor((i - HAND) / 5) % WORLD_ORDER.length];
  function genName(i, theme) {
    const r = rng(i * 7919 + 17), [a, b] = NAMES[theme];
    return `${a[Math.floor(r() * a.length)]} ${b[Math.floor(r() * b.length)]}`;
  }

  // New obstacles first appear at these levels (0-based), then turn up more often as levels go on.
  const INTRO = { stairsDown: 14, table: 34, stairsUp: 59, gapLoop: 89 };
  const INTRO_NAMES = { stairsDown: 'Zigzag stairs', table: 'Table jump', stairsUp: 'Stairs up', gapLoop: 'Broken loop' };

  function generate(t, i, attempt) {
    const r = rng(i * 104729 + attempt * 7919 + 1);
    const d = Math.pow(Math.min(1, (i - HAND) / (TOTAL - 1 - HAND)), 0.8);
    const R = (a, b) => a + r() * (b - a);
    const after = (name, w) => i < INTRO[name] ? 0 : Math.min(1, 0.3 + (i - INTRO[name]) / 40) * w;
    const target = 340 + d * 420 + R(0, 60);
    let needRun = 0;            // metres of flat needed before the next gap (after crests that can launch the bike)
    let lastLoop = false;
    const run = n => { t.line(Math.max(n, needRun)); needRun = 0; };
    const pieces = {
      flat() { t.line(R(10, 24)); needRun = Math.max(0, needRun - 14); },
      bumps() { const h = R(0.8, 1.4 + d * 1.2); t.wave(h, R(8, 12), 1 + Math.floor(r() * 3)); needRun = h > 1.5 ? 26 : 14; },
      hill() {
        const a = R(14, 22 + d * 10);
        t.to(a, 10).line(R(5, 10)).to(0, 10).line(R(4, 10)).to(-R(14, 24), 12).line(R(6, 12)).to(0, 14);
        needRun = 24;
      },
      climb() { t.to(R(12, 20 + d * 12), 10).line(R(6, 14)).to(0, 10); needRun = 24; },
      descent() { t.to(-R(14, 24 + d * 6), 12).line(R(8, 18)).to(0, 15); needRun = 10; },
      dip() { t.bump(-R(2, 3.5), R(12, 16)); needRun = 20; },
      drops() { const n = 2 + Math.floor(r() * (1 + d * 2.5)); for (let k = 0; k < n; k++) t.step(-R(1.1, 1.8), 4).line(3); needRun = 22; },
      kicker() {
        run(R(14, 20));
        t.kicker(R(14, 20 + d * 6), R(4, 7), R(7, 9) + d * R(5, 10), -R(0.3, 1.2 + d), R(12, 18), R(6, 10));
        needRun = 20;
      },
      stairsDown() {
        run(R(10, 16));
        const n = 3 + Math.floor(r() * (2 + d * 5));
        t.stairsDown(n, R(2.6, 4.4) - d * 0.8, R(1.1, 1.6 + d * 1.6), -R(4, 12), -R(55, 62 + d * 12));
        needRun = 22;
      },
      stairsUp() {
        run(R(14, 20));
        const n = 2 + Math.floor(r() * (2 + d * 3));
        t.stairsUp(n, R(3, 4.5), R(0.3, 0.45 + d * 0.35), R(24, 30 + d * 8));
        needRun = 18;
      },
      table() {
        run(R(16, 22));
        t.to(R(16, 22), 10).line(R(5, 7));
        t.table(R(7, 9) + d * R(2, 6), R(-0.5, 0.8 + d), R(12, 20) - d * 4, R(0.2, 0.8), R(4, 7), R(3, 5));
        needRun = 20;
      },
      gapLoop() {
        run(12);
        if (r() < 0.7) t.to(-R(16, 24), 12).line(R(10, 16)).to(0, 16);
        t.line(R(12, 18)).loop(R(5.8, 6.3), R(6, 7 + d * 1.5));
        t.line(16);
        needRun = 12;
      },
      cliff() { run(R(16, 22)); t.cliff(R(35, 50), R(10, 14), R(16, 20)); needRun = 14; },
      loop() {
        run(12);
        if (r() < 0.6) t.to(-R(16, 24), 12).line(R(10, 16)).to(0, 16);
        t.line(R(12, 18)).loop(R(5.5, 6.2));
        if (d > 0.35 && r() < 0.25 + d * 0.4) t.line(10).loop(R(5.5, 6));
        t.line(16);
        needRun = 12;
      },
    };
    const weights = () => {
      const y = t.y;
      const low = y < -40;
      return {
        flat: Math.max(0.4, 2.2 - d * 1.8), bumps: 2 - d * 0.6, hill: 1.6, dip: 1,
        climb: y < -30 ? 4 : y > 15 ? 0.2 : 1.2,
        descent: y > 10 ? 3 : low ? 0.2 : 1.2,
        drops: (low ? 0.1 : 0.4) + d * 0.5,
        kicker: 1 + d * 3,
        cliff: low ? 0.1 : 0.25 + d * 2,
        loop: lastLoop ? 0 : 0.5 + d * 1.6,
        stairsDown: after('stairsDown', low ? 0.15 : 0.9 + d * 1.2),
        table: after('table', 0.7 + d * 1.4),
        stairsUp: after('stairsUp', (y < -20 ? 1.2 : 0.5) + d),
        gapLoop: lastLoop ? 0 : after('gapLoop', 0.5 + d * 1.4),
      };
    };
    t.startPipe().line(R(20, 28));
    let prev = null;
    // an introduction level opens with its new obstacle
    const intro = Object.keys(INTRO).find(k => INTRO[k] === i);
    if (intro) { t.line(10); pieces[intro](); t.used.push(intro); prev = intro; lastLoop = intro === 'gapLoop'; }
    while (t.x < target) {
      const w = weights();
      if (prev) w[prev] *= 0.35;   // avoid the same piece over and over
      const total = Object.values(w).reduce((a, b) => a + b, 0);
      let pick = r() * total, name = 'flat';
      for (const [k, v] of Object.entries(w)) { if ((pick -= v) <= 0) { name = k; break; } }
      pieces[name]();
      t.used.push(name);
      lastLoop = name === 'loop' || name === 'gapLoop';
      prev = name;
    }
    t.line(Math.max(12, needRun));
    return t.finish();
  }

  for (let i = HAND; i < TOTAL; i++) {
    const theme = genTheme(i), attempt = parseInt(GEN_FIX[i - HAND] || '0', 36);
    const time = GEN_TIMES[i - HAND];
    LEVELS.push({
      name: genName(i, theme), theme, generated: true,
      intro: INTRO_NAMES[Object.keys(INTRO).find(k => INTRO[k] === i)] || null,
      stars: time ? [Math.ceil(time * 1.05), Math.ceil(time * 1.35)] : [60, 80],
      build: t => generate(t, i, attempt),
    });
  }

  const cache = new Map();
  function track(i) {
    if (!cache.has(i)) cache.set(i, LEVELS[i].build(new TrackBuilder()).build());
    return cache.get(i);
  }
  // Only keep a handful of built tracks around; 500 of them would waste memory.
  function trackCached(i) {
    const tr = track(i);
    if (cache.size > 12) cache.delete(cache.keys().next().value);
    return tr;
  }

  return { LEVELS, THEMES, TrackBuilder, track: trackCached, generate, HAND, TOTAL };
});
