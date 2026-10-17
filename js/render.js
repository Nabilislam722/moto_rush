// Drawing: parallax backgrounds, track, bike sprites, particles and popups.
(function (root) {
  const TAU = Math.PI * 2;
  const { SPR, RIDER } = root.MotoSim;

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  const ART = {
    jungle: {
      sky: ['#46b9b3', '#a6e1b0', '#fcefb3'], sun: { x: 0.78, y: 0.16, r: 0.34, rgb: '255,246,190' },
      track: { body: '#7d4b20', edge: '#3a1f0a', top: '#a9dc48', shadow: 'rgba(16,48,24,.22)', planks: true },
      dust: ['#7a5230', '#9c6b3c', '#b8e06a'], ambient: 'leaves', under: 'vines', cloud: 'rgba(255,255,240,.55)',
    },
    desert: {
      sky: ['#ef8f4b', '#f8bd72', '#fde4a8'], sun: { x: 0.3, y: 0.3, r: 0.4, rgb: '255,236,178' },
      track: { body: '#b3212b', edge: '#5a0b11', top: '#a9a3f3', shadow: 'rgba(110,40,10,.22)' },
      dust: ['#f0c38e', '#e5a96f', '#f9dcb0'], ambient: 'dust', under: null, cloud: 'rgba(255,236,210,.45)',
    },
    ice: {
      sky: ['#4eaeea', '#a3dbfa', '#ecf9ff'], sun: { x: 0.68, y: 0.14, r: 0.3, rgb: '255,255,255' },
      track: { body: '#c22a36', edge: '#5b0b13', top: '#c9ecff', shadow: 'rgba(20,60,110,.2)' },
      dust: ['#ffffff', '#e2f4ff', '#bfe4ff'], ambient: 'snow', under: 'icicles', cloud: 'rgba(255,255,255,.7)',
    },
    meadow: {
      track: { body: '#c0392b', edge: '#5a0b11', top: '#fff1a8', shadow: 'rgba(20,70,40,.22)' },
      dust: ['#8bc34a', '#c5e1a5', '#7a5230'], ambient: 'pollen', under: null,
    },
    cave: {
      track: { body: '#6b3fb0', edge: '#1d0b38', top: '#7ff3ff', shadow: 'rgba(0,0,0,.3)' },
      dust: ['#9fb3c8', '#cfe8ff', '#7ff3ff'], ambient: 'sparkle', under: 'stalactites',
    },
  };
  // Worlds without a hand-drawn fallback borrow one while their painted scene loads.
  const LOOK = { meadow: 'jungle', cave: 'ice' };

  // Backgrounds scroll at this share of their layer's parallax speed. Kept low: fast scenery made players queasy.
  const BG_SPEED = 0.35;

  // ---------- Background layers ----------
  // Each layer is a horizontally tileable strip drawn once per resize, then scrolled with parallax.
  function makeLayer(TW, h, q, draw) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(TW * q); c.height = Math.ceil(h * q);
    const g = c.getContext('2d');
    g.scale(q, q);
    // draw(g, wrapX) - wrapX calls fn at x, x-TW and x+TW so shapes crossing the seam tile cleanly.
    draw(g, (x, w, fn) => { for (const o of [-TW, 0, TW]) if (x + o + w > 0 && x + o - w < TW) fn(x + o); });
    return c;
  }
  function vgrad(g, y0, y1, a, b) {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, a); gr.addColorStop(1, b);
    return gr;
  }
  function ridge(g, TW, h, base, amp, step, r, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(0, h);
    const n = Math.round(TW / step);
    const ys = [];
    for (let i = 0; i < n; i++) ys.push(base - r() * amp);
    for (let i = 0; i <= n; i++) {
      const x = i * step, y = ys[i % n];
      const nx = (i + 0.5) * step, ny = (y + ys[(i + 1) % n]) / 2;
      g.quadraticCurveTo(x, y, nx, ny);
    }
    g.lineTo(TW, h); g.closePath(); g.fill();
  }

  const BG = {
    jungle(TW, H, q, r) {
      const far = makeLayer(TW, H * 0.6, q, (g, wrap) => {
        const h = H * 0.6;
        ridge(g, TW, h, h * 0.55, h * 0.3, 160, r, vgrad(g, h * 0.2, h, '#7ec79d', '#b6e2bb'));
        // distant temple
        wrap(TW * 0.62, 120, x => {
          g.fillStyle = 'rgba(110,175,140,.85)';
          for (let i = 0; i < 6; i++) g.fillRect(x - 70 + i * 11, h * 0.36 + i * -14 + 70, 140 - i * 22, 16);
          g.fillRect(x - 10, h * 0.36 - 28, 20, 26);
        });
        ridge(g, TW, h, h * 0.8, h * 0.18, 110, r, vgrad(g, h * 0.5, h, '#73bf92', '#a9dcb2'));
      });
      const mid = makeLayer(TW, H * 0.62, q, (g, wrap) => {
        const h = H * 0.62;
        g.fillStyle = vgrad(g, 0, h, '#4f9e6b', '#3c8a5d');
        for (let x = 0; x < TW; x += 50 + r() * 60) {
          const top = h * (0.25 + r() * 0.3), rad = 34 + r() * 40, xx = x;
          const palm = r() < 0.3;
          wrap(xx, 160, X => {
            if (palm) {
              g.strokeStyle = '#3d8a5a'; g.lineWidth = 9; g.lineCap = 'round';
              g.beginPath(); g.moveTo(X, h); g.quadraticCurveTo(X + 30, (top + h) / 2, X + 18, top); g.stroke();
              g.fillStyle = '#4a9a68';
              for (let k = 0; k < 6; k++) {
                const a = -Math.PI / 2 + (k - 2.5) * 0.55;
                g.save(); g.translate(X + 18, top); g.rotate(a);
                g.beginPath(); g.ellipse(48, 0, 50, 11, 0.25, 0, TAU); g.fill(); g.restore();
              }
            } else {
              g.fillStyle = '#3f8b5c'; g.fillRect(X - 6, top + rad * 0.5, 12, h);
              g.fillStyle = vgrad(g, top - rad, top + rad * 1.4, '#62b47f', '#3f8f60');
              for (let k = 0; k < 5; k++) {
                g.beginPath(); g.arc(X + (k - 2) * rad * 0.45, top + Math.abs(k - 2) * rad * 0.22, rad * (1 - Math.abs(k - 2) * 0.15), 0, TAU); g.fill();
              }
            }
          });
        }
        g.fillStyle = '#3c8a5d'; g.fillRect(0, h * 0.86, TW, h * 0.14);
      });
      const near = makeLayer(TW, H * 0.38, q, (g, wrap) => {
        const h = H * 0.38;
        for (let x = 0; x < TW; x += 26 + r() * 40) {
          const s = 0.6 + r() * 0.9, col = r() < 0.5 ? '#2c7346' : '#245f3b', flower = r() < 0.12;
          wrap(x, 120, X => {
            g.fillStyle = col;
            for (let k = 0; k < 5; k++) {
              g.save(); g.translate(X, h); g.rotate(-Math.PI / 2 + (k - 2) * 0.42);
              g.beginPath(); g.ellipse(52 * s, 0, 56 * s, 15 * s, 0, 0, TAU); g.fill(); g.restore();
            }
            if (flower) {
              g.fillStyle = '#ff7a59';
              const fy = h - 70 * s;
              for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(X + Math.cos(k * 1.256) * 7, fy + Math.sin(k * 1.256) * 7, 6, 0, TAU); g.fill(); }
              g.fillStyle = '#ffd43b'; g.beginPath(); g.arc(X, fy, 4, 0, TAU); g.fill();
            }
          });
        }
        g.fillStyle = '#245f3b'; g.fillRect(0, h * 0.9, TW, h * 0.1);
      });
      const top = makeLayer(TW, H * 0.34, q, (g, wrap) => {
        for (let x = 0; x < TW; x += 70 + r() * 150) {
          const len = H * (0.08 + r() * 0.24), sway = (r() - 0.5) * 30;
          wrap(x, 60, X => {
            g.strokeStyle = '#2e6b42'; g.lineWidth = 4;
            g.beginPath(); g.moveTo(X, -4); g.quadraticCurveTo(X + sway, len * 0.6, X + sway * 0.3, len); g.stroke();
            g.fillStyle = '#3b8552';
            for (let y = 16; y < len; y += 22) {
              const t = y / len, vx = X + sway * (2 * t * (1 - t)) * 1.2 + sway * 0.3 * t * t;
              g.beginPath(); g.ellipse(vx - 8, y, 9, 4.5, -0.6, 0, TAU); g.fill();
              g.beginPath(); g.ellipse(vx + 8, y + 8, 9, 4.5, 0.6, 0, TAU); g.fill();
            }
          });
        }
      });
      return [
        { c: far, f: 0.05, h: H * 0.6, y: 0.5, fill: '#b6e2bb' },
        { c: mid, f: 0.14, h: H * 0.62, y: 0.6, fill: '#3c8a5d' },
        { c: near, f: 0.3, h: H * 0.38, y: 0.84, fill: '#245f3b' },
        { c: top, f: 0.42, h: H * 0.34, y: 0, top: true },
      ];
    },

    desert(TW, H, q, r) {
      const far = makeLayer(TW, H * 0.5, q, (g) => {
        const h = H * 0.5;
        g.fillStyle = vgrad(g, h * 0.2, h, '#eeae80', '#f6caa0');
        g.beginPath(); g.moveTo(0, h);
        let x = 0;
        while (x < TW) {
          const w = 120 + r() * 220, top = h * (0.25 + r() * 0.35), gapW = 40 + r() * 120;
          const end = Math.min(TW, x + w);
          g.lineTo(x, h * 0.85); g.lineTo(x + 18, top); g.lineTo(end - 18, top + 4); g.lineTo(end, h * 0.85);
          x = end + gapW;
          g.lineTo(Math.min(TW, x), h * 0.85);
        }
        g.lineTo(TW, h); g.closePath(); g.fill();
      });
      const mid = makeLayer(TW, H * 0.75, q, (g, wrap) => {
        const h = H * 0.75;
        for (let x = 40; x < TW; x += 140 + r() * 260) {
          const w = 50 + r() * 90, top = h * (0.05 + r() * 0.4), lean = (r() - 0.5) * 30;
          wrap(x, w + 40, X => {
            g.fillStyle = vgrad(g, top, h, '#e09068', '#d07a5c');
            g.beginPath();
            g.moveTo(X - w * 0.7, h); g.lineTo(X - w * 0.45 + lean * 0.3, h * 0.7);
            g.lineTo(X - w * 0.5 + lean, top + 20); g.lineTo(X - w * 0.35 + lean, top);
            g.lineTo(X + w * 0.4 + lean, top + 6); g.lineTo(X + w * 0.5 + lean, top + 30);
            g.lineTo(X + w * 0.45, h * 0.72); g.lineTo(X + w * 0.75, h); g.closePath(); g.fill();
            g.fillStyle = 'rgba(255,214,170,.35)';
            g.beginPath(); g.moveTo(X - w * 0.35 + lean, top); g.lineTo(X - w * 0.1 + lean, top + 3);
            g.lineTo(X - w * 0.2, h); g.lineTo(X - w * 0.7, h); g.lineTo(X - w * 0.45 + lean * 0.3, h * 0.7); g.lineTo(X - w * 0.5 + lean, top + 20); g.closePath(); g.fill();
          });
        }
        g.fillStyle = vgrad(g, h * 0.86, h, '#d9876a', '#cf7c5f'); g.fillRect(0, h * 0.86, TW, h * 0.14);
      });
      const near = makeLayer(TW, H * 0.34, q, (g, wrap) => {
        const h = H * 0.34;
        g.fillStyle = '#c16b54';
        ridge(g, TW, h, h * 0.8, h * 0.2, 90, r, '#c16b54');
        for (let x = 20; x < TW; x += 90 + r() * 200) {
          const s = 0.7 + r() * 0.7;
          wrap(x, 60, X => {
            g.strokeStyle = '#a95a47'; g.lineCap = 'round'; g.lineWidth = 14 * s;
            g.beginPath(); g.moveTo(X, h); g.lineTo(X, h - 95 * s); g.stroke();
            g.lineWidth = 9 * s;
            g.beginPath(); g.moveTo(X, h - 40 * s); g.lineTo(X - 20 * s, h - 40 * s); g.lineTo(X - 20 * s, h - 70 * s); g.stroke();
            g.beginPath(); g.moveTo(X, h - 55 * s); g.lineTo(X + 18 * s, h - 55 * s); g.lineTo(X + 18 * s, h - 80 * s); g.stroke();
          });
        }
      });
      return [
        { c: far, f: 0.04, h: H * 0.5, y: 0.5, fill: '#f6caa0' },
        { c: mid, f: 0.12, h: H * 0.75, y: 0.36, fill: '#cf7c5f' },
        { c: near, f: 0.28, h: H * 0.34, y: 0.86, fill: '#c16b54' },
      ];
    },

    ice(TW, H, q, r) {
      const far = makeLayer(TW, H * 0.55, q, (g) => {
        const h = H * 0.55;
        g.fillStyle = vgrad(g, 0, h, '#bfe2f7', '#dff2fd');
        g.beginPath(); g.moveTo(0, h);
        const peaks = [];
        for (let x = 0; x <= TW; x += 60 + r() * 80) peaks.push([x, h * (0.2 + r() * 0.45)]);
        peaks[peaks.length - 1] = [TW, peaks[0][1]];
        peaks.forEach(([x, y], i) => { g.lineTo(x, y); if (i < peaks.length - 1) g.lineTo((x + peaks[i + 1][0]) / 2, Math.max(y, peaks[i + 1][1]) + 30 + r() * 30); });
        g.lineTo(TW, h); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.85)';
        for (const [x, y] of peaks) {
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - 18, y + 26); g.lineTo(x - 6, y + 20); g.lineTo(x + 4, y + 30); g.lineTo(x + 16, y + 22); g.closePath(); g.fill();
        }
      });
      const mid = makeLayer(TW, H * 0.7, q, (g, wrap) => {
        const h = H * 0.7;
        for (let x = 30; x < TW; x += 70 + r() * 160) {
          const n = 2 + Math.floor(r() * 3), tall = h * (0.35 + r() * 0.5);
          for (let k = 0; k < n; k++) {
            const w = 22 + r() * 26, th = tall * (0.5 + r() * 0.5), xx = x + (k - n / 2) * w * 0.8;
            wrap(xx, w, X => {
              g.fillStyle = '#8fc1e6';
              g.beginPath(); g.moveTo(X - w, h); g.lineTo(X, h - th); g.lineTo(X + w, h); g.closePath(); g.fill();
              g.fillStyle = 'rgba(255,255,255,.45)';
              g.beginPath(); g.moveTo(X, h - th); g.lineTo(X - w, h); g.lineTo(X - w * 0.2, h); g.closePath(); g.fill();
            });
          }
        }
        g.fillStyle = '#8fc1e6'; g.fillRect(0, h * 0.94, TW, h * 0.06);
      });
      const near = makeLayer(TW, H * 0.3, q, (g) => {
        const h = H * 0.3;
        ridge(g, TW, h, h * 0.62, h * 0.3, 120, r, vgrad(g, h * 0.3, h, '#f4fbff', '#cfe9fa'));
      });
      return [
        { c: far, f: 0.04, h: H * 0.55, y: 0.42, fill: '#dff2fd' },
        { c: mid, f: 0.12, h: H * 0.7, y: 0.4, fill: '#8fc1e6' },
        { c: near, f: 0.28, h: H * 0.3, y: 0.86, fill: '#cfe9fa' },
      ];
    },
  };

  function makeCloud(r, color) {
    const c = document.createElement('canvas');
    c.width = 260; c.height = 110;
    const g = c.getContext('2d');
    g.fillStyle = color;
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.arc(40 + i * 30 + r() * 10, 70 - Math.sin(i / 6 * Math.PI) * 26 + r() * 8, 22 + Math.sin(i / 6 * Math.PI) * 18, 0, TAU);
      g.fill();
    }
    return c;
  }

  class Background {
    constructor(theme, W, H, q) {
      theme = LOOK[theme] || theme;
      this.theme = theme;
      this.W = W; this.H = H;
      this.TW = Math.max(1400, Math.ceil(W * 1.2));
      const r = rng(theme.length * 977 + 13);
      this.layers = BG[theme](this.TW, H, q, r);
      this.clouds = [];
      this.sky = this.bakeSky();
      for (let i = 0; i < 6; i++) this.clouds.push({ img: makeCloud(r, ART[theme].cloud), x: r() * this.TW, y: 0.06 + r() * 0.3, s: 0.6 + r() * 0.8, v: 4 + r() * 8 });
    }
    // Sky gradient, sun glow and rays never move, so they are baked once at reduced resolution.
    bakeSky() {
      const { W, H } = this, art = ART[this.theme], q = 0.5;
      const c = document.createElement('canvas');
      c.width = Math.ceil(W * q); c.height = Math.ceil(H * q);
      const g = c.getContext('2d');
      g.scale(q, q);
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, art.sky[0]); sky.addColorStop(0.55, art.sky[1]); sky.addColorStop(1, art.sky[2]);
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      const s = art.sun, sx = W * s.x, sy = H * s.y, sr = Math.max(W, H) * s.r;
      g.save(); g.translate(sx, sy); g.rotate(0.3);
      g.fillStyle = `rgba(${s.rgb},.08)`;
      for (let i = 0; i < 12; i++) {
        g.rotate(TAU / 12);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(sr * 1.8, -sr * 0.1); g.lineTo(sr * 1.8, sr * 0.1); g.closePath(); g.fill();
      }
      g.restore();
      const glow = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
      glow.addColorStop(0, `rgba(${s.rgb},.95)`); glow.addColorStop(0.12, `rgba(${s.rgb},.75)`);
      glow.addColorStop(0.4, `rgba(${s.rgb},.18)`); glow.addColorStop(1, `rgba(${s.rgb},0)`);
      g.fillStyle = glow; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      return c;
    }
    draw(g, camX, camY, ppm, t, y0) {
      ppm *= BG_SPEED;
      const { W, H, TW } = this;
      g.drawImage(this.sky, 0, 0, W, H);

      for (const c of this.clouds) {
        const w = c.img.width * c.s, span = W + w * 2;
        const x = (((c.x * span + t * c.v - camX * ppm * 0.02) % span) + span) % span - w;
        g.drawImage(c.img, x, H * c.y, w, c.img.height * c.s);
      }

      const dy = camY - y0;
      for (const L of this.layers) {
        const ox = -((camX * ppm * L.f) % TW + TW) % TW;
        const shift = L.top ? 0 : Math.max(-H * 0.25, Math.min(H * 0.25, dy * ppm * L.f * 0.6));
        const y = H * L.y + shift;
        for (let x = ox; x < W; x += TW) g.drawImage(L.c, x, y, TW, L.h);
        if (L.fill && y + L.h < H) { g.fillStyle = L.fill; g.fillRect(0, y + L.h - 1, W, H - y - L.h + 1); }
      }
    }
  }

  // ---------- Painted backgrounds (Craftpix jungle + parallax packs) ----------
  // Each layer: [file, top, height, parallax, drift]. top/height are in 1080p frame pixels; 'sky' is a
  // full-screen gradient strip and 'strip' a full-height overlay that doesn't vary sideways (fog).
  // parallax = share of the track's scroll speed, drift = idle cloud movement in px/s.
  const SCENES = {
    jungle1: [
      ['jungle1/l1_background.png', 'sky'],
      ['jungle1/l2_trees01.png', 0, 789, 0.05],
      ['jungle1/l3_trees02.png', 0, 889, 0.1],
      ['jungle1/l4_grass01.png', 410, 670, 0.18],
      ['jungle1/l5_grass02.png', 536, 544, 0.26],
      ['jungle1/l6_fog.png', 'strip', 1080, 0],
      ['jungle1/l7_ground.png', 597, 483, 0.38],
      ['jungle1/l8_foreground.png', 0, 1080, 0.5],
    ],
    jungle2: [
      ['jungle2/l1_background.png', 'sky'],
      ['jungle2/l2_trees01.png', 0, 763, 0.05],
      ['jungle2/l3_trees02.png', 0, 653, 0.1],
      ['jungle2/l4_grass01.png', 372, 708, 0.18],
      ['jungle2/l5_grass02.png', 652, 428, 0.26],
      ['jungle2/l6_fog.png', 'strip', 1080, 0],
      ['jungle2/l7_ground.png', 491, 589, 0.38],
      ['jungle2/l8_foreground.png', 0, 1080, 0.5],
    ],
    jungle3: [
      ['jungle3/l1_background.png', 'sky'],
      ['jungle3/l2_trees01.png', 0, 678, 0.05],
      ['jungle3/l3_trees02.png', 0, 731, 0.1],
      ['jungle3/l4_grass01.png', 338, 742, 0.18],
      ['jungle3/l5_grass02.png', 504, 576, 0.26],
      ['jungle3/l6_fog.png', 'strip', 1080, 0],
      ['jungle3/l7_ground.png', 477, 603, 0.38],
      ['jungle3/l8_foreground.png', 0, 640, 0.5],
    ],
    jungle4: [
      ['jungle4/l1_background.png', 'sky'],
      ['jungle4/l2_trees01.png', 0, 782, 0.05],
      ['jungle4/l3_trees02.png', 0, 661, 0.1],
      ['jungle4/l4_grass01.png', 455, 625, 0.18],
      ['jungle4/l5_grass02.png', 650, 430, 0.26],
      ['jungle4/l6_fog.png', 'strip', 1080, 0],
      ['jungle4/l7_ground.png', 542, 538, 0.38],
      ['jungle4/l8_foreground.png', 0, 1080, 0.5],
    ],
    desert: [
      ['desert/l1_sky.png', 'sky'],
      ['desert/l2_clouds.png', 468, 421, 0.015, 10],
      ['desert/l3_pyramid.png', 343, 432, 0.04],
      ['desert/l4_bg-ground01.png', 640, 440, 0.08],
      ['desert/l5_bg-ground02.png', 569, 511, 0.14],
      ['desert/l6_bg-ground03.png', 725, 355, 0.22],
      ['desert/l7_ground.png', 654, 426, 0.38],
    ],
    meadow: [
      ['meadow/l1_sky.png', 'sky'],
      ['meadow/l2_mountains.png', 375, 705, 0.04],
      ['meadow/l3_clouds.png', 148, 277, 0.015, 14],
      ['meadow/l4_bg-ground01.png', 637, 443, 0.1],
      ['meadow/l5_bg-ground02.png', 636, 444, 0.18],
      ['meadow/l6_ground.png', 542, 538, 0.38],
    ],
    cave: [
      ['cave/l1_wall.png', 'sky'],
      ['cave/l2_prop01.png', 0, 1080, 0.06],
      ['cave/l3_prop02.png', 0, 1080, 0.14],
      ['cave/l4_stones.png', 569, 511, 0.22],
      ['cave/l5_crystals.png', 658, 248, 0.3],
      ['cave/l6_ground.png', 870, 210, 0.4],
    ],
    ice: [
      ['ice/l1_sky.png', 'sky'],
      ['ice/l2_stars.png', 50, 513, 0.008],
      ['ice/l3_clouds01.png', 425, 250, 0.02, 8],
      ['ice/l4_clouds02.png', 90, 205, 0.03, 16],
      ['ice/l5_mountains.png', 359, 721, 0.05],
      ['ice/l6_ground01.png', 621, 459, 0.12],
      ['ice/l7_ground02.png', 692, 388, 0.2],
      ['ice/l8_ground.png', 467, 613, 0.38],
    ],
  };
  const sceneImgs = {};
  function loadScene(name) {
    if (sceneImgs[name]) return sceneImgs[name].ready;
    const entry = sceneImgs[name] = { imgs: [], loaded: false };
    entry.ready = Promise.all(SCENES[name].map(([file], i) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = res;
      im.onerror = () => rej(new Error(`Couldn't load assets/bg/${file}`));
      im.src = `assets/bg/${file}`;
      entry.imgs[i] = im;
    }))).then(() => { entry.loaded = true; return entry; });
    return entry.ready;
  }
  const sceneReady = name => !!(sceneImgs[name] && sceneImgs[name].loaded);

  class PackBackground {
    constructor(scene, W, H) {
      this.scene = scene; this.W = W; this.H = H;
      this.layers = SCENES[scene]; this.imgs = sceneImgs[scene].imgs;
    }
    draw(g, camX, camY, ppm, t, y0) {
      ppm *= BG_SPEED;
      const { W, H } = this, OVER = 0.12;
      // the 1920x1080 frame is scaled to the screen height plus a little overscan for vertical parallax
      const FH = H * (1 + OVER), k = FH / 1080, FW = 1920 * k, dy = camY - y0;
      this.layers.forEach(([, top, h, f = 0, drift = 0], i) => {
        const img = this.imgs[i];
        if (top === 'sky') { g.drawImage(img, 0, 0, W, H); return; }
        const shift = Math.max(0, Math.min(OVER * H, OVER * H * 0.5 + dy * ppm * f * 0.2));
        const frameTop = H - FH + shift;
        if (top === 'strip') { g.drawImage(img, 0, frameTop, W, FH); return; }
        let ox = -((camX * ppm * f + t * drift * k) % FW);
        if (ox > 0) ox -= FW;
        for (let x = ox; x < W; x += FW) g.drawImage(img, x, frameTop + top * k, FW + 0.5, h * k);
      });
    }
  }

  // ---------- Track ----------
  const T = 0.28;
  // prev/next are the neighbouring points outside this piece, so normals match across piece seams.
  function offsetPath(path, pts, off, prev, next) {
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const a = i > 0 ? pts[i - 1] : (prev || pts[0]), b = i < n - 1 ? pts[i + 1] : (next || pts[n - 1]);
      let nx = -(b.y - a.y), ny = b.x - a.x;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      const x = pts[i].x + nx * off, y = pts[i].y + ny * off;
      if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
    }
  }

  class TrackArt {
    constructor(track, theme) {
      this.theme = theme;
      this.art = ART[theme].track;
      // Split the track into short pieces with bounding boxes so only visible pieces are stroked.
      this.pieces = [];
      const all = track.chains.concat(...track.loops.map(l => [l.A, l.B]));
      for (const c of all) {
        for (let i = 0; i < c.length - 1; i += 24) {
          const pts = c.slice(i, Math.min(c.length, i + 25));
          const prev = c[i - 1], next = c[i + 25];
          const piece = { body: new Path2D(), top: new Path2D(), minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
          offsetPath(piece.body, pts, -T / 2, prev, next);
          offsetPath(piece.top, pts, -0.07, prev, next);
          for (const p of pts) {
            piece.minX = Math.min(piece.minX, p.x); piece.maxX = Math.max(piece.maxX, p.x);
            piece.minY = Math.min(piece.minY, p.y); piece.maxY = Math.max(piece.maxY, p.y);
          }
          this.pieces.push(piece);
        }
      }
      this.chains = track.chains;
      this.finishX = track.finishX;
      this.startX = track.startX;
      // Hanging decorations under level-ish stretches of track.
      this.under = new Path2D();
      this.underLeaves = new Path2D();
      const kind = ART[theme].under;
      if (kind) {
        const r = rng(track.chains.length * 31 + track.finishX | 0);
        for (const c of track.chains) {
          for (let i = 1; i < c.length; i++) {
            const a = c[i - 1], b = c[i];
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            if (Math.abs(b.y - a.y) / (len || 1) > 0.45) continue;
            for (let d = r() * 3; d < len; d += 1.6 + r() * 4) {
              const t = d / len, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t) - T + 0.02;
              if (kind === 'icicles' || kind === 'stalactites') {
                const L = 0.25 + r() * r() * 1.3, w = 0.08 + L * 0.08;
                this.under.moveTo(x - w, y); this.under.lineTo(x, y - L); this.under.lineTo(x + w, y); this.under.closePath();
              } else {
                const L = 0.4 + r() * 1.6, sw = (r() - 0.5) * 0.6;
                this.under.moveTo(x, y); this.under.quadraticCurveTo(x + sw, y - L * 0.6, x + sw * 0.4, y - L);
                for (let k = 0.3; k < L; k += 0.32) {
                  const lx = x + sw * 0.5 * (k / L), ly = y - k, side = (k * 10 | 0) % 2 ? 1 : -1;
                  this.underLeaves.ellipse(lx + side * 0.09, ly, 0.11, 0.05, side * 0.6, 0, TAU);
                  this.underLeaves.closePath();
                }
              }
            }
          }
        }
      }
      this.finishY = this.groundY(this.chains[this.chains.length - 1], this.finishX);
      this.startY = this.groundY(this.chains[0], this.startX);
    }
    // Height of the highest track surface under x that is not above y (null over a gap).
    groundBelow(x, y) {
      let best = null;
      for (const c of this.chains) {
        if (x < c[0].x || x > c[c.length - 1].x) continue;
        let lo = 0, hi = c.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (c[mid].x <= x) lo = mid; else hi = mid; }
        const a = c[lo], b = c[hi];
        const gy = a.y + (b.y - a.y) * (x - a.x) / ((b.x - a.x) || 1);
        if (gy <= y + 0.5 && (best === null || gy > best)) best = gy;
      }
      return best;
    }
    groundY(c, x) {
      for (let i = 1; i < c.length; i++) {
        const a = c[i - 1], b = c[i];
        if (x >= a.x && x <= b.x) return lerp(a.y, b.y, (x - a.x) / (b.x - a.x || 1));
      }
      return 0;
    }
    draw(g, view, t) {
      const A = this.art;
      g.save();
      view.applyWorld(g);
      g.lineJoin = 'round'; g.lineCap = 'round';
      if (ART[this.theme].under === 'vines') {
        g.strokeStyle = '#2f6d3f'; g.lineWidth = 0.05; g.stroke(this.under);
        g.fillStyle = '#3f8f4f'; g.fill(this.underLeaves);
      } else if (ART[this.theme].under === 'stalactites') {
        g.fillStyle = '#243b5e'; g.fill(this.under);
        g.strokeStyle = 'rgba(127,243,255,.7)'; g.lineWidth = 0.025; g.stroke(this.under);
      } else if (ART[this.theme].under === 'icicles') {
        g.fillStyle = 'rgba(225,245,255,.9)'; g.fill(this.under);
        g.strokeStyle = 'rgba(120,180,220,.8)'; g.lineWidth = 0.025; g.stroke(this.under);
      }
      // visible world rectangle, with a margin for line widths and hanging decorations
      const m = 3, x0 = view.camX - view.W / 2 / view.ppm - m, x1 = view.camX + view.W / 2 / view.ppm + m;
      const y0 = view.camY - view.H / 2 / view.ppm - m, y1 = view.camY + view.H / 2 / view.ppm + m;
      const vis = this.pieces.filter(p => p.maxX >= x0 && p.minX <= x1 && p.maxY >= y0 && p.minY <= y1);
      const each = fn => { for (const p of vis) fn(p); };
      g.save(); g.translate(0.04, -0.14);
      g.strokeStyle = A.shadow; g.lineWidth = T; each(p => g.stroke(p.body));
      g.restore();
      g.strokeStyle = A.edge; g.lineWidth = T + 0.09; each(p => g.stroke(p.body));
      g.strokeStyle = A.body; g.lineWidth = T; each(p => g.stroke(p.body));
      if (A.planks) {
        g.setLineDash([0.05, 0.85]);
        g.strokeStyle = 'rgba(40,20,5,.45)'; g.lineWidth = T * 0.92; each(p => g.stroke(p.body));
        g.setLineDash([]);
      } else {
        g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = T * 0.3;
        g.save(); g.translate(0, -0.06); each(p => g.stroke(p.body)); g.restore();
      }
      g.strokeStyle = A.top; g.lineWidth = 0.075; each(p => g.stroke(p.top));
      g.restore();

      this.drawFlag(g, view, this.startX - 1.6, this.startY, t, false);
      this.drawFlag(g, view, this.finishX, this.finishY, t, true);
    }
    drawFlag(g, view, x, y, t, finish) {
      const p = view.toScreen(x, y), s = view.ppm;
      if (p.x < -6 * s || p.x > view.W + 6 * s) return;
      const poleH = (finish ? 4.2 : 3.0) * s;
      g.save();
      g.translate(p.x, p.y);
      g.fillStyle = '#3a1f0a';
      g.fillRect(-0.07 * s, -poleH, 0.14 * s, poleH);
      g.fillStyle = '#ffd43b';
      g.beginPath(); g.arc(0, -poleH, 0.13 * s, 0, TAU); g.fill();
      // Waving flag: a grid of quads displaced by a travelling sine wave.
      const fw = (finish ? 1.9 : 1.3) * s, fh = (finish ? 1.15 : 0.8) * s, cols = finish ? 8 : 1, rows = finish ? 5 : 1;
      const wave = (u) => Math.sin(u * 5 - t * 7) * 0.12 * s * u;
      for (let i = 0; i < 8; i++) {
        const u0 = i / 8, u1 = (i + 1) / 8;
        for (let j = 0; j < (finish ? rows : 1); j++) {
          const v0 = j / rows, v1 = (j + 1) / rows;
          let col;
          if (finish) col = ((Math.floor(u0 * cols) + j) % 2) ? '#1d1d1d' : '#ffffff';
          else col = '#4cc23a';
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(u0 * fw, -poleH + 0.08 * s + v0 * fh + wave(u0));
          g.lineTo(u1 * fw + 0.5, -poleH + 0.08 * s + v0 * fh + wave(u1));
          g.lineTo(u1 * fw + 0.5, -poleH + 0.08 * s + v1 * fh + wave(u1) + 0.5);
          g.lineTo(u0 * fw, -poleH + 0.08 * s + v1 * fh + wave(u0) + 0.5);
          g.closePath(); g.fill();
        }
      }
      g.strokeStyle = '#2b1606'; g.lineWidth = Math.max(1.5, 0.04 * s);
      g.beginPath();
      for (let i = 0; i <= 8; i++) { const u = i / 8; g.lineTo(u * fw, -poleH + 0.08 * s + wave(u)); }
      for (let i = 8; i >= 0; i--) { const u = i / 8; g.lineTo(u * fw, -poleH + 0.08 * s + fh + wave(u)); }
      g.closePath(); g.stroke();
      if (finish) {
        // checkered strip across the track surface
        const cw = 0.22 * s;
        for (let k = 0; k < 2; k++) for (let i = -3; i < 3; i++) {
          g.fillStyle = (i + k) % 2 ? '#1d1d1d' : '#fff';
          g.fillRect(i * cw, k * cw * 0.6 - 1, cw, cw * 0.6);
        }
      }
      g.restore();
    }
  }

  // ---------- Bike ----------
  // st: { x, y, a, rear: {x,y,a}, front: {x,y,a}, lean, rag: {x,y,a} | null }
  function drawBike(g, imgs, def, geo, view, st) {
    const k = view.ppm / SPR;
    for (const w of [st.rear, st.front]) {
      const wheel = imgs[w === st.front && def.wheelFront ? def.wheelFront : def.wheel];
      const p = view.toScreen(w.x, w.y);
      g.save(); g.translate(p.x, p.y); g.rotate(-w.a);
      const d = 60 * k;
      g.drawImage(wheel, -d / 2, -d / 2, d, d);
      g.restore();
    }
    const p = view.toScreen(st.x, st.y);
    g.save();
    g.translate(p.x, p.y); g.rotate(-st.a); g.scale(k, k);
    g.drawImage(imgs[def.sprite], -geo.O.x, -geo.O.y, def.w, def.h);
    if (!st.rag) {
      const s = RIDER.scale;
      g.translate(def.seat[0] - geo.O.x - st.lean * 3, def.seat[1] - geo.O.y);
      g.rotate(-st.lean * 0.22);
      g.drawImage(imgs[RIDER.sprite], -RIDER.hip[0] * s, -RIDER.hip[1] * s, RIDER.w * s, RIDER.h * s);
    }
    g.restore();
    if (st.rag) {
      const q = view.toScreen(st.rag.x, st.rag.y), s = RIDER.scale;
      g.save(); g.translate(q.x, q.y); g.rotate(-st.rag.a); g.scale(k, k);
      g.drawImage(imgs[RIDER.sprite], -RIDER.center[0] * s, -RIDER.center[1] * s, RIDER.w * s, RIDER.h * s);
      g.restore();
    }
  }

  // ---------- Particles ----------
  class Particles {
    constructor() { this.list = []; }
    emit(o) { if (this.list.length < 900) this.list.push(Object.assign({ life: 1, age: 0, g: -6, drag: 1.5, size: 0.1, rot: 0, vr: 0, shape: 'dot', alpha: 1 }, o)); }
    update(dt) {
      const L = this.list;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        p.age += dt;
        if (p.age >= p.life) { L[i] = L[L.length - 1]; L.pop(); continue; }
        const dr = Math.exp(-p.drag * dt);
        p.vx *= dr; p.vy = p.vy * dr + p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
    }
    draw(g, view) {
      for (const p of this.list) {
        const q = view.toScreen(p.x, p.y);
        if (q.x < -40 || q.x > view.W + 40 || q.y < -40 || q.y > view.H + 40) continue;
        const t = p.age / p.life;
        const sz = p.size * view.ppm * (p.grow ? 1 + t * p.grow : 1);
        g.globalAlpha = p.alpha * (p.fade === false ? 1 : 1 - t * t);
        g.fillStyle = p.color;
        if (p.shape === 'rect') {
          g.save(); g.translate(q.x, q.y); g.rotate(p.rot);
          g.fillRect(-sz / 2, -sz * 0.3, sz, sz * 0.6 * Math.abs(Math.cos(p.rot * 1.7)) + 1);
          g.restore();
        } else {
          g.beginPath(); g.arc(q.x, q.y, sz, 0, TAU); g.fill();
        }
      }
      g.globalAlpha = 1;
    }
  }

  // Screen-space ambient particles: drifting leaves, desert motes, snowfall, meadow pollen, cave sparkles.
  class Ambient {
    constructor(kind) {
      this.kind = kind;
      const r = rng(kind.length * 101);
      this.p = Array.from({ length: kind === 'snow' ? 70 : 34 }, () => ({ x: r(), y: r(), z: 0.4 + r() * 0.8, ph: r() * TAU }));
    }
    draw(g, W, H, t, camDX) {
      for (const p of this.p) {
        let x, y, sz;
        if (this.kind === 'snow') {
          y = (p.y + t * 0.05 * p.z) % 1; x = (p.x + Math.sin(t * 0.6 + p.ph) * 0.01 - camDX * 0.00025 * p.z) % 1;
          sz = 1.5 + p.z * 2.4; g.fillStyle = 'rgba(255,255,255,.85)';
        } else if (this.kind === 'leaves') {
          y = (p.y + t * 0.025 * p.z) % 1; x = (p.x + Math.sin(t * 0.5 + p.ph) * 0.03 - camDX * 0.0002 * p.z) % 1;
          sz = 3 + p.z * 4;
          g.fillStyle = p.ph > 3 ? 'rgba(120,190,70,.75)' : 'rgba(255,240,140,.7)';
        } else if (this.kind === 'pollen') {
          y = (p.y - t * 0.012 * p.z) % 1; x = (p.x + Math.sin(t * 0.7 + p.ph) * 0.02 - camDX * 0.0002 * p.z) % 1;
          sz = 1.4 + p.z * 1.8; g.fillStyle = p.ph > 3 ? 'rgba(255,255,255,.8)' : 'rgba(255,236,120,.75)';
        } else if (this.kind === 'sparkle') {
          y = (p.y + Math.sin(t * 0.2 + p.ph) * 0.03) % 1; x = (p.x - camDX * 0.00015 * p.z) % 1;
          sz = 1 + p.z * 2.2 * (0.5 + 0.5 * Math.sin(t * 2.5 + p.ph * 3));
          g.fillStyle = p.ph > 3 ? 'rgba(127,243,255,.85)' : 'rgba(214,170,255,.8)';
        } else {
          y = (p.y + Math.sin(t * 0.3 + p.ph) * 0.02) % 1; x = (p.x - t * 0.01 * p.z - camDX * 0.0002 * p.z) % 1;
          sz = 1.2 + p.z * 1.8; g.fillStyle = 'rgba(255,240,215,.55)';
        }
        x = (x + 1) % 1; y = (y + 1) % 1;
        if (this.kind === 'leaves' && p.ph > 3) {
          g.save(); g.translate(x * W, y * H); g.rotate(t * p.z + p.ph);
          g.beginPath(); g.ellipse(0, 0, sz, sz * 0.45, 0, 0, TAU); g.fill(); g.restore();
        } else {
          g.beginPath(); g.arc(x * W, y * H, sz * (this.kind === 'leaves' ? 0.45 + 0.25 * Math.sin(t * 3 + p.ph) : 1), 0, TAU); g.fill();
        }
      }
    }
  }

  // ---------- Popups ----------
  const easeOutBack = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  class Popups {
    constructor() { this.list = []; }
    add(text, sub, color) { this.list.push({ text, sub, color: color || '#ffd43b', age: 0, life: 1.5 }); }
    update(dt) { this.list = this.list.filter(p => (p.age += dt) < p.life); }
    draw(g, x, y, ppm) {
      this.list.forEach((p, i) => {
        const t = p.age / p.life;
        const sc = t < 0.25 ? easeOutBack(t / 0.25) : 1;
        const a = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
        const yy = y - ppm * (2.2 + t * 1.2) - i * 46;
        g.save();
        g.globalAlpha = Math.max(0, a);
        g.translate(x, yy); g.scale(sc, sc); g.rotate(-0.06);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `${Math.round(30 + ppm * 0.12)}px "Lilita One", "Trebuchet MS", sans-serif`;
        g.lineJoin = 'round'; g.lineWidth = 8; g.strokeStyle = '#2b1606';
        g.strokeText(p.text, 0, 0);
        g.fillStyle = p.color; g.fillText(p.text, 0, 0);
        if (p.sub) {
          g.font = `${Math.round(20 + ppm * 0.08)}px "Lilita One", "Trebuchet MS", sans-serif`;
          g.lineWidth = 6; g.strokeText(p.sub, 0, 30);
          g.fillStyle = '#ffffff'; g.fillText(p.sub, 0, 30);
        }
        g.restore();
      });
    }
  }

  root.MotoRender = { ART, Background, PackBackground, SCENES, loadScene, sceneReady, TrackArt, drawBike, Particles, Ambient, Popups, rng, T };
})(typeof self !== 'undefined' ? self : this);
