// Game controller: main loop, camera, input, screens, HUD, effects and save data.
(function () {
  'use strict';
  const { Sim, BIKES, geometry } = window.MotoSim;
  const { LEVELS } = window.MotoLevels;
  const R = window.MotoRender;
  const Sfx = window.MotoSfx;

  const STEP = 1 / 120;
  const TAU = Math.PI * 2;
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = t => t.toFixed(2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const autoplay = location.hash === '#autopilot'; // lets the built-in driver ride every level (for testing)

  const cv = $('#cv'), g = cv.getContext('2d');

  // ---------- Save data (per browser; the game works without it) ----------
  const SAVE_KEY = 'jungle-moto-rush-v1';
  const save = (() => {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s.best === 'object') return Object.assign({ bike: 0, muted: false }, s);
    } catch (e) { /* storage unavailable */ }
    return { best: {}, bike: 0, muted: false };
  })();
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
  const totalStars = () => Object.values(save.best).reduce((a, b) => a + (b.stars || 0), 0);
  const maxStars = LEVELS.length * 3;
  const levelOpen = i => i === 0 || !!save.best[i - 1];
  // NFT bikes: ownership will come from a wallet check later. Until that's connected, every player
  // gets the demo, so NFT.owns() answers true. Replace demo/owns with the real lookup when ready.
  const NFT = {
    demo: true,
    owns(bikeIndex) { return this.demo; },
  };
  const bikeOpen = i => BIKES[i].nft ? NFT.owns(i) : totalStars() >= BIKES[i].unlock;
  if (!bikeOpen(save.bike)) save.bike = 0;
  Sfx.muted = !!save.muted;

  // ---------- Assets ----------
  const imgs = {};
  function loadImages() {
    const names = ['bike1', 'bike2', 'bike3', 'bike4', 'wheel1', 'wheel2', 'wheel3', 'wheel4', 'rider1'];
    return Promise.all(names.map(n => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res();
      im.onerror = () => rej(new Error(`Couldn't load assets/${n}.png`));
      im.src = `assets/${n}.png`;
      imgs[n] = im;
    })).concat(window.MotoOpBike.load().then(op => Object.assign(imgs, op))));
  }

  // ---------- View ----------
  const view = {
    W: 0, H: 0, dpr: 1, ppm: 60, camX: 0, camY: 0, sx: 0, sy: 0,
    toScreen(x, y) { return { x: (x - this.camX) * this.ppm + this.W * 0.5 + this.sx, y: this.H * 0.5 - (y - this.camY) * this.ppm + this.sy }; },
    applyWorld(ctx) {
      const s = this.ppm * this.dpr;
      ctx.setTransform(s, 0, 0, -s, (this.W * 0.5 - this.camX * this.ppm + this.sx) * this.dpr, (this.H * 0.5 + this.camY * this.ppm + this.sy) * this.dpr);
    },
  };
  let basePpm = 60, bgCache = {}, quality = 1;
  const artCache = {}, ambCache = {};
  // Painted Craftpix scene for the level's world (the jungle has four, rotating by level), or the
  // hand-drawn background while that scene is still loading.
  const sceneFor = (theme, li) => theme === 'jungle' ? `jungle${1 + li % 4}` : theme;
  function getBg(theme, li = 0) {
    const scene = sceneFor(theme, li);
    if (R.sceneReady(scene)) return bgCache[scene] || (bgCache[scene] = new R.PackBackground(scene, view.W, view.H));
    R.loadScene(scene).catch(() => {});
    const key = 'drawn:' + theme;
    return bgCache[key] || (bgCache[key] = new R.Background(theme, view.W, view.H, Math.min(view.dpr, 1.5)));
  }
  function getArt(li, theme) {
    if (artCache[li]) return artCache[li];
    const keys = Object.keys(artCache);
    if (keys.length > 10) delete artCache[keys[0]];
    return (artCache[li] = new R.TrackArt(window.MotoLevels.track(li), theme));
  }
  const getAmb = theme => ambCache[theme] || (ambCache[theme] = new R.Ambient(R.ART[theme].ambient));

  function resize(keepBg) {
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    view.W = W; view.H = H; view.dpr = Math.max(0.6, Math.min(2, window.devicePixelRatio || 1) * quality);
    cv.width = Math.round(W * view.dpr); cv.height = Math.round(H * view.dpr);
    basePpm = clamp(Math.min(W / 16, H / 8.4), 30, 96);
    if (!keepBg) bgCache = {};
  }

  // ---------- Runs ----------
  let run = null, mode = 'boot', screen = null;
  const cam = { lx: 0, ly: 0, air: 0, shake: 0, flash: 0, flashColor: '255,70,40' };

  function snap(sim) {
    const b = sim.bike, c = b.chassis.getPosition(), rw = b.rearW.getPosition(), fw = b.frontW.getPosition();
    const s = {
      x: c.x, y: c.y, a: b.chassis.getAngle(), lean: sim.leanVis, rag: null,
      rear: { x: rw.x, y: rw.y, a: b.rearW.getAngle() }, front: { x: fw.x, y: fw.y, a: b.frontW.getAngle() },
    };
    if (sim.ragdoll) { const p = sim.ragdoll.getPosition(); s.rag = { x: p.x, y: p.y, a: sim.ragdoll.getAngle() }; }
    return s;
  }
  function mix(a, b, t) {
    const L = (p, q) => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, a: p.a + (q.a - p.a) * t });
    const o = L(a, b);
    o.rear = L(a.rear, b.rear); o.front = L(a.front, b.front);
    o.lean = a.lean + (b.lean - a.lean) * t;
    o.rag = b.rag ? (a.rag ? L(a.rag, b.rag) : b.rag) : null;
    return o;
  }

  function makeRun(li, bi, demo) {
    const sim = new Sim(li, bi);
    const theme = LEVELS[li].theme;
    const r = {
      sim, li, bi, demo, theme, def: BIKES[bi], geo: sim.g,
      art: getArt(li, theme), amb: getAmb(theme),
      parts: new R.Particles(), pops: new R.Popups(),
      acc: 0, over: false, timers: [], hudT: '',
      bgX: 0, bgTarget: 0, lastCamX: null,
    };
    r.prev = r.cur = snap(sim);
    view.ppm = basePpm;
    view.camX = r.cur.x + view.W * 0.1 / view.ppm;
    view.camY = r.cur.y + 0.9 + (demo ? 2.2 : 0);
    cam.lx = cam.ly = cam.air = cam.shake = cam.flash = 0;
    slow.until = 0; timeScale = 1;
    return r;
  }
  let demoN = 0;
  function makeDemo() {
    const order = [0, 3, 6, 24, 29, 2, 4, 7, 25, 30, 1, 5, 8];
    const li = order[demoN % order.length];
    demoN++;
    return makeRun(li, demoN % BIKES.length, true);
  }
  function later(sec, fn) { if (run) run.timers.push({ at: clock + sec, fn }); }

  // ---------- Transitions ----------
  let iris = null;
  function transition(fn) {
    if (iris) return;
    iris = { t: 0, phase: 'close', fn };
  }
  function updateIris(dt) {
    if (!iris) return;
    iris.t += dt / (iris.phase === 'close' ? (reduceMotion ? 0.12 : 0.3) : (reduceMotion ? 0.15 : 0.5));
    if (iris.t >= 1) {
      if (iris.phase === 'close') { iris.fn(); iris.phase = 'open'; iris.t = 0; }
      else iris = null;
    }
  }
  function drawIris() {
    if (!iris || !run) return;
    const e = iris.phase === 'close' ? 1 - easeInOut(iris.t) : easeOut(iris.t);
    const maxR = Math.hypot(view.W, view.H) * 0.62;
    const c = view.toScreen(run.cur.x, run.cur.y + 0.5);
    const r = maxR * e;
    g.save();
    g.fillStyle = '#152611';
    g.beginPath(); g.rect(0, 0, view.W, view.H); g.arc(c.x, c.y, Math.max(0.1, r), 0, TAU);
    g.fill('evenodd');
    if (r > 1 && r < maxR * 0.98) {
      g.strokeStyle = '#a6e65c'; g.lineWidth = 7; g.beginPath(); g.arc(c.x, c.y, r, 0, TAU); g.stroke();
      g.strokeStyle = '#2a1505'; g.lineWidth = 3; g.beginPath(); g.arc(c.x, c.y, r + 5, 0, TAU); g.stroke();
    }
    g.restore();
  }

  // ---------- Screens & modals ----------
  const screens = { menu: $('#scr-menu'), levels: $('#scr-levels'), garage: $('#scr-garage') };
  function showScreen(name) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (name === 'levels') buildLevels();
    if (name === 'garage') openGarage();
    updateStarChips();
    for (const [k, el] of Object.entries(screens)) el.classList.toggle('on', k === name);
    screen = name;
    $('#scrim').classList.toggle('on', !!name);
  }
  const modals = { pause: $('#m-pause'), win: $('#m-win'), crash: $('#m-crash') };
  let modal = null;
  function showModal(name) {
    for (const [k, el] of Object.entries(modals)) el.classList.toggle('on', k === name);
    modal = name;
  }
  function updateStarChips() {
    const s = `${totalStars()} / ${maxStars}`;
    for (const id of ['#menu-stars', '#levels-stars', '#garage-stars']) $(id).textContent = s;
  }

  function startLevel(li) {
    Sfx.init();
    showScreen(null);
    showModal(null);
    transition(() => {
      run = makeRun(li, save.bike, false);
      mode = 'play';
      resetTouch();
      $('#hud').classList.add('on'); $('#touch').classList.add('on');
      $('#hud-num').textContent = li + 1; $('#hud-name').textContent = LEVELS[li].name;
      $('#hint').classList.remove('gone');
      showBanner(`Level ${li + 1}`, LEVELS[li].name, LEVELS[li].intro);
    });
  }
  function restart() {
    if (!run || run.demo || iris) return;
    const li = run.li;
    showModal(null);
    transition(() => {
      run = makeRun(li, save.bike, false);
      mode = 'play';
      $('#hint').classList.remove('gone');
    });
  }
  function exitTo(name) {
    showModal(null);
    Sfx.engine(false, 0, 0);
    transition(() => {
      $('#hud').classList.remove('on'); $('#touch').classList.remove('on');
      mode = 'menu';
      run = makeDemo();
      showScreen(name);
    });
  }
  function togglePause() {
    if (!run || run.demo || run.over || iris) return;
    if (mode === 'play') {
      mode = 'paused';
      $('#pause-info').innerHTML = `Level ${run.li + 1} · ${LEVELS[run.li].name} · <b>${fmt(run.sim.result())} s</b>`;
      showModal('pause');
      Sfx.engine(false, 0, 0);
    } else if (mode === 'paused') {
      mode = 'play';
      showModal(null);
    }
  }
  let bannerTimer = 0;
  function showBanner(title, sub, intro) {
    $('#banner-title').textContent = title;
    $('#banner-sub').textContent = sub;
    const nb = $('#banner-new');
    nb.hidden = !intro;
    nb.textContent = intro ? `New obstacle: ${intro}!` : '';
    const b = $('#banner');
    clearTimeout(bannerTimer);
    b.classList.remove('on');
    bannerTimer = setTimeout(() => {
      b.classList.add('on');
      bannerTimer = setTimeout(() => b.classList.remove('on'), intro ? 2800 : 1700);
    }, 380);
  }

  // ---------- Level select ----------
  // 500 levels, shown 20 to a page. Tiles take their world's colour; the strip under the grid jumps between pages.
  const PER_PAGE = 20, PAGES = Math.ceil(LEVELS.length / PER_PAGE);
  let lvPage = 0;
  const starRow = n => [0, 1, 2].map(k => `<svg class="i star ${k < n ? '' : 'off'}"><use href="#i-star"/></svg>`).join('');
  const firstUnbeaten = () => { const i = LEVELS.findIndex((_, k) => !save.best[k]); return i < 0 ? LEVELS.length - 1 : i; };
  function buildLevels(page = Math.floor(firstUnbeaten() / PER_PAGE), dir = 0) {
    lvPage = clamp(page, 0, PAGES - 1);
    const first = lvPage * PER_PAGE, last = Math.min(LEVELS.length, first + PER_PAGE), cur = firstUnbeaten();
    let pageStars = 0, html = '';
    for (let li = first; li < last; li++) {
      const L = LEVELS[li], open = levelOpen(li), best = save.best[li];
      if (best) pageStars += best.stars;
      html += `<button class="tile ${L.theme} ${open ? '' : 'locked'} ${li === cur && open ? 'current' : ''}" data-li="${li}" style="--i:${li - first}"
        title="${L.name}" aria-label="Level ${li + 1}: ${L.name}${open ? '' : ' (locked)'}" ${open ? '' : 'aria-disabled="true"'}>
        ${open ? `<span class="num outlined">${li + 1}</span>` : '<svg class="i lock"><use href="#i-lock"/></svg>'}
        <span class="stars">${starRow(best ? best.stars : 0)}</span>
        ${best ? `<span class="best">${fmt(best.time)} s</span>` : ''}
        ${L.intro && !best ? '<span class="tag-new">NEW</span>' : ''}
      </button>`;
    }
    const tiles = $('#tiles');
    tiles.innerHTML = html;
    tiles.classList.remove('from-left', 'from-right');
    if (dir) { void tiles.offsetWidth; tiles.classList.add(dir > 0 ? 'from-right' : 'from-left'); }
    $('#pg-range').textContent = `Levels ${first + 1}–${last}`;
    $('#pg-info').textContent = `Page ${lvPage + 1} of ${PAGES} · ${pageStars}/${(last - first) * 3} stars`;
    $('#pg-prev').disabled = lvPage === 0;
    $('#pg-next').disabled = lvPage === PAGES - 1;
    let strip = '';
    for (let p = 0; p < PAGES; p++) {
      let st = 0, n = 0;
      for (let li = p * PER_PAGE; li < Math.min(LEVELS.length, (p + 1) * PER_PAGE); li++) { n++; if (save.best[li]) st += save.best[li].stars; }
      const cls = st >= n * 3 ? 'gold' : st >= n ? 'done' : st > 0 ? 'part' : '';
      strip += `<button class="${cls} ${p === lvPage ? 'on' : ''}" data-page="${p}" aria-label="Page ${p + 1}"></button>`;
    }
    $('#pg-strip').innerHTML = strip;
  }
  function changePage(d) {
    const p = clamp(lvPage + d, 0, PAGES - 1);
    if (p === lvPage) return;
    Sfx.init(); Sfx.click();
    buildLevels(p, d);
  }
  $('#pg-prev').addEventListener('click', e => { e.currentTarget.blur(); changePage(-1); });
  $('#pg-next').addEventListener('click', e => { e.currentTarget.blur(); changePage(1); });
  $('#pg-strip').addEventListener('click', e => {
    const b = e.target.closest('[data-page]');
    if (b) { Sfx.init(); Sfx.click(); const p = +b.dataset.page; buildLevels(p, Math.sign(p - lvPage)); }
  });
  // swipe the grid sideways to turn the page
  let swipe = null, swiped = false;
  $('#tiles').addEventListener('pointerdown', e => { swipe = { x: e.clientX, y: e.clientY }; });
  $('#tiles').addEventListener('pointerup', e => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) { changePage(dx < 0 ? 1 : -1); swiped = true; }
  });
  $('#tiles').addEventListener('click', e => {
    if (swiped) { swiped = false; return; }
    const t = e.target.closest('.tile');
    if (!t) return;
    Sfx.init();
    const li = +t.dataset.li;
    if (!levelOpen(li)) {
      t.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 280 });
      Sfx.tone(180, 0, 0.15, 'square', 0.08);
      return;
    }
    Sfx.click();
    startLevel(li);
  });

  // ---------- Garage ----------
  const gcv = $('#garage-cv'), gg = gcv.getContext('2d');
  const geoCache = BIKES.map(geometry);
  let gIdx = 0, gSlide = null;
  function openGarage() { gIdx = save.bike; gSlide = null; garageInfo(); }
  function garageInfo() {
    const b = BIKES[gIdx], stars = totalStars(), locked = !bikeOpen(gIdx);
    const sub = b.nft
      ? `<span class="nft-tag">NFT</span> OP bike · ${NFT.demo ? 'demo ride unlocked' : locked ? 'owners only' : 'yours'}`
      : locked ? `Unlocks at ${b.unlock} stars · you have ${stars}` : gIdx === save.bike ? 'Your current ride' : 'Ready to ride';
    $('#g-name').innerHTML = `${b.name}<small>${sub}</small>`;
    b.stats.forEach((v, i) => {
      const bar = $(`#g-s${i}`);
      bar.style.width = `${Math.min(100, (locked ? v * 0.5 : v) / 5 * 100)}%`;
      bar.classList.toggle('op', v > 5);
    });
    const pick = $('#g-pick');
    pick.disabled = locked || gIdx === save.bike;
    pick.className = 'btn' + (locked ? ' berry' : gIdx === save.bike ? ' mango' : '');
    pick.querySelector('span').textContent = locked ? 'LOCKED' : gIdx === save.bike ? 'SELECTED' : b.nft && NFT.demo ? 'RIDE DEMO' : 'RIDE THIS';
    $('#g-dots').innerHTML = BIKES.map((_, i) => `<i class="${i === gIdx ? 'on' : ''}"></i>`).join('');
    $('#g-voice-name').textContent = b.voice;
  }
  // Rev the bike on screen so each engine voice can be heard and compared.
  let revAt = -9;
  function garageRev() {
    Sfx.init();
    Sfx.rev(BIKES[gIdx].sound);
    revAt = clock;
    const v = $('#g-voice');
    v.classList.remove('revving'); void v.offsetWidth; v.classList.add('revving');
  }
  function garageStep(d) {
    Sfx.init(); Sfx.click();
    const from = gIdx;
    gIdx = (gIdx + d + BIKES.length) % BIKES.length;
    gSlide = { from, dir: d, t: 0 };
    garageInfo();
    garageRev();
  }
  function drawGarage(dt) {
    const w = gcv.clientWidth, h = gcv.clientHeight;
    if (!w || !h) return;
    const dpr = view.dpr;
    if (gcv.width !== Math.round(w * dpr) || gcv.height !== Math.round(h * dpr)) { gcv.width = Math.round(w * dpr); gcv.height = Math.round(h * dpr); }
    gg.setTransform(dpr, 0, 0, dpr, 0, 0);
    gg.clearRect(0, 0, w, h);
    const floorY = h * 0.84;
    gg.fillStyle = 'rgba(42,21,5,.35)'; gg.fillRect(0, floorY, w, h - floorY);
    gg.fillStyle = 'rgba(255,243,211,.22)';
    const off = (clock * 260) % 70;
    for (let x = -off; x < w; x += 70) gg.fillRect(x, floorY + h * 0.06, 34, 4);
    const ppm = Math.min(w / 2.9, h / 1.55);
    if (gSlide) { gSlide.t += dt / 0.5; if (gSlide.t >= 1) gSlide = null; }
    const drawOne = (bi, ox) => {
      const def = BIKES[bi], geo = geoCache[bi], wr = geo.wr;
      const fake = { ppm, W: w, H: h, toScreen: (x, y) => ({ x: w / 2 + ox + x * ppm, y: floorY - y * ppm }) };
      const rv = bi === gIdx ? Math.max(0, 1 - (clock - revAt) / 1.8) : 0;
      const bob = Math.sin(clock * (11 + rv * 40) + bi) * (0.01 + rv * 0.012), cy = wr - geo.rear.y + bob, wa = -clock * 16;
      // exhaust puffs
      for (let i = 0; i < 6; i++) {
        const ph = (clock * 1.3 + i / 6) % 1;
        const p = fake.toScreen(geo.rear.x - 0.25 - ph * 1.4, wr + 0.25 + ph * 0.35);
        gg.fillStyle = `rgba(255,243,211,${(0.28 + rv * 0.3) * (1 - ph)})`;
        gg.beginPath(); gg.arc(p.x, p.y, (0.06 + ph * 0.2) * ppm, 0, TAU); gg.fill();
      }
      const sh = fake.toScreen(0, 0);
      gg.fillStyle = 'rgba(20,10,0,.35)';
      gg.beginPath(); gg.ellipse(sh.x, sh.y, 1.0 * ppm, 0.07 * ppm, 0, 0, TAU); gg.fill();
      const locked = !bikeOpen(bi);
      if (locked) gg.filter = 'brightness(0.15)';
      R.drawBike(gg, imgs, def, geo, fake, {
        x: 0, y: cy, a: Math.sin(clock * 1.7) * 0.012, lean: 0, rag: null,
        rear: { x: geo.rear.x, y: wr + bob * 0.2, a: wa }, front: { x: geo.front.x, y: wr + bob * 0.2, a: wa },
      });
      gg.filter = 'none';
      if (locked) {
        gg.save();
        gg.font = `${Math.round(ppm * 0.32)}px "Lilita One", "Trebuchet MS", sans-serif`;
        gg.textAlign = 'center'; gg.lineJoin = 'round';
        gg.lineWidth = 7; gg.strokeStyle = '#2a1505'; gg.fillStyle = '#ffd43b';
        const tx = w / 2 + ox, ty = h * 0.42;
        gg.strokeText(`★ ${BIKES[bi].unlock} to unlock`, tx, ty); gg.fillText(`★ ${BIKES[bi].unlock} to unlock`, tx, ty);
        gg.restore();
      }
    };
    if (gSlide) {
      const e = 1 - Math.pow(1 - gSlide.t, 4);
      drawOne(gSlide.from, -e * gSlide.dir * w);
      drawOne(gIdx, (1 - e) * gSlide.dir * w);
    } else drawOne(gIdx, 0);
  }
  $('#g-voice').addEventListener('click', garageRev);
  gcv.addEventListener('click', garageRev);
  $('#g-prev').addEventListener('click', () => garageStep(-1));
  $('#g-next').addEventListener('click', () => garageStep(1));
  $('#g-pick').addEventListener('click', () => {
    if (!bikeOpen(gIdx)) return;
    save.bike = gIdx; persist(); Sfx.init(); Sfx.star(1); garageRev();
    garageInfo();
    const b = $('#g-pick');
    b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.2,1.5,.4,1)' });
  });

  // ---------- Input ----------
  const KEYMAP = { ArrowUp: 'gas', KeyW: 'gas', Space: 'gas', ArrowDown: 'brake', KeyS: 'brake', ArrowLeft: 'back', KeyA: 'back', ArrowRight: 'fwd', KeyD: 'fwd' };
  const keyHeld = {}, touchHeld = {};
  const input = () => ({
    gas: !!(keyHeld.gas || touchHeld.gas), brake: !!(keyHeld.brake || touchHeld.brake),
    back: !!(keyHeld.back || touchHeld.back), fwd: !!(keyHeld.fwd || touchHeld.fwd),
  });
  addEventListener('keydown', e => {
    const k = KEYMAP[e.code];
    if (k) { keyHeld[k] = true; if (mode === 'play' || mode === 'paused') e.preventDefault(); }
    if (e.repeat) return;
    if (mode === 'play' || mode === 'paused') Sfx.init();
    if (mode === 'play' || mode === 'paused') {
      if (e.code === 'Escape' || e.code === 'KeyP') { e.preventDefault(); togglePause(); }
      else if (e.code === 'KeyR') restart();
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        if (modal === 'crash') restart();
        else if (modal === 'win') (run.li + 1 < LEVELS.length ? startLevel(run.li + 1) : exitTo('levels'));
        else if (modal === 'pause') togglePause();
      }
    } else if (mode === 'menu' && screen === 'levels' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'PageUp' || e.code === 'PageDown')) {
      e.preventDefault();
      changePage(e.code === 'ArrowRight' || e.code === 'PageDown' ? 1 : -1);
    } else if (mode === 'menu' && e.code === 'Escape' && screen && screen !== 'menu') {
      showScreen('menu');
    }
  });
  addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keyHeld[k] = false; });
  addEventListener('blur', () => { for (const k in keyHeld) keyHeld[k] = false; });
  // Phone buttons: every finger is tracked across the button cluster, so a thumb can slide from one
  // button to the next (lean back to lean forward, brake to gas) without lifting.
  const touchEl = $('#touch'), fingers = new Map();
  const keyAt = (x, y) => { const el = document.elementFromPoint(x, y), b = el && el.closest && el.closest('.tbtn'); return b ? b.dataset.k : null; };
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no haptics here */ } };
  function syncTouch() {
    for (const k of ['gas', 'brake', 'back', 'fwd']) touchHeld[k] = false;
    for (const k of fingers.values()) if (k) touchHeld[k] = true;
    document.querySelectorAll('.tbtn').forEach(b => b.classList.toggle('held', !!touchHeld[b.dataset.k]));
  }
  function resetTouch() { fingers.clear(); syncTouch(); }
  touchEl.addEventListener('pointerdown', e => {
    const b = e.target.closest('.tbtn');
    if (!b) return;
    e.preventDefault(); Sfx.init();
    try { b.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
    fingers.set(e.pointerId, b.dataset.k); syncTouch(); buzz(8);
  });
  touchEl.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId)) return;
    const k = keyAt(e.clientX, e.clientY);
    if (k !== fingers.get(e.pointerId)) { fingers.set(e.pointerId, k); syncTouch(); if (k) buzz(8); }
  });
  const lift = e => { if (fingers.delete(e.pointerId)) syncTouch(); };
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) touchEl.addEventListener(t, lift);
  touchEl.addEventListener('contextmenu', e => e.preventDefault());

  // Show them on any touch device; the menu toggle forces them on or off when detection guesses wrong.
  let touchSeen = navigator.maxTouchPoints > 0 || 'ontouchstart' in window || matchMedia('(pointer: coarse)').matches;
  const TOUCH_MODES = ['auto', 'on', 'off'];
  function applyTouchMode() {
    const m = TOUCH_MODES.includes(save.touch) ? save.touch : 'auto';
    document.body.classList.toggle('touch', m === 'on' || (m === 'auto' && touchSeen));
    $('#touch-label').textContent = `Phone buttons: ${m}`;
    $('#btn-touch').setAttribute('aria-label', `Phone buttons: ${m === 'auto' ? 'automatic' : m}`);
  }
  addEventListener('touchstart', () => { if (!touchSeen) { touchSeen = true; applyTouchMode(); } }, { passive: true });
  applyTouchMode();
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && run && !run.over) togglePause(); });

  // ---------- Buttons ----------
  const on = (sel, fn) => $(sel).addEventListener('click', e => { e.currentTarget.blur(); Sfx.init(); Sfx.click(); fn(e); });
  on('#btn-play', () => showScreen('levels'));
  on('#btn-garage', () => showScreen('garage'));
  on('#levels-back', () => showScreen('menu'));
  on('#levels-garage', () => showScreen('garage'));
  on('#garage-back', () => showScreen('menu'));
  on('#garage-levels', () => showScreen('levels'));
  on('#btn-pause', togglePause);
  on('#btn-restart', restart);
  function soundIcon() { $('#btn-sound use').setAttribute('href', save.muted ? '#i-mute' : '#i-sound'); }
  on('#btn-sound', () => { save.muted = !save.muted; Sfx.setMuted(save.muted); persist(); soundIcon(); });
  on('#btn-touch', () => {
    const i = TOUCH_MODES.indexOf(TOUCH_MODES.includes(save.touch) ? save.touch : 'auto');
    save.touch = TOUCH_MODES[(i + 1) % TOUCH_MODES.length]; persist(); applyTouchMode();
  });
  // Fullscreen only where the browser allows it from inside this page.
  const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  $('#btn-full').hidden = !fsOk;
  on('#btn-full', () => {
    const d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else (el.requestFullscreen || el.webkitRequestFullscreen).call(el)?.catch?.(() => {});
    } catch (e) { /* fullscreen refused */ }
  });
  soundIcon();
  document.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    b.blur(); Sfx.init(); Sfx.click();
    const a = b.dataset.act;
    if (a === 'resume') togglePause();
    else if (a === 'restart') { if (mode === 'paused') mode = 'play'; restart(); }
    else if (a === 'levels') exitTo('levels');
    else if (a === 'next' && run) startLevel(run.li + 1);
  }));

  // ---------- Effects ----------
  let clock = 0, timeScale = 1;
  const slow = { until: 0, scale: 1 };
  const slowmo = (scale, dur) => { if (!reduceMotion) { slow.scale = scale; slow.until = clock + dur; } };
  const CONFETTI = ['#ff5d5d', '#ffd43b', '#5bd16b', '#4dabf7', '#cc5de8', '#ffffff', '#ff922b'];
  const tips = [
    'Lean with ← and → in the air so both wheels touch down together.',
    'Loops need speed. Keep the gas held all the way round.',
    'Too much gas pops a wheelie. Tap → to keep the front wheel down.',
    'Every flip you land takes 1 second off your time.',
    'Came up short on a gap? Hit the ramp with more speed.',
    'Brake (↓) before a big drop if you are flying too far.',
  ];

  function wheelContact(r, w) {
    const ch = r.sim.bike.chassis, up = ch.getWorldVector({ x: 0, y: 1 });
    return { x: w.x - up.x * r.geo.wr, y: w.y - up.y * r.geo.wr };
  }
  function burst(r, x, y, n, colors, speed, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
      r.parts.emit(Object.assign({
        x, y, vx: Math.cos(a) * s, vy: Math.abs(Math.sin(a)) * s * 0.8 + 1,
        life: 0.5 + Math.random() * 0.6, size: 0.06 + Math.random() * 0.1, grow: 1.6,
        color: colors[(Math.random() * colors.length) | 0], g: -5, drag: 2.4,
      }, opts));
    }
  }

  function onEvents(r, evs) {
    const sim = r.sim;
    for (const e of evs) {
      const c = r.cur;
      if (e.type === 'start') {
        $('#hint').classList.add('gone');
      } else if (e.type === 'flip') {
        const name = e.back ? 'BACKFLIP' : 'FRONTFLIP';
        r.pops.add(e.n > 1 ? `${e.n}× ${name}!` : `${name}!`, `−${e.n}.0 s`);
        burst(r, c.x, c.y + 0.4, 22, ['#fff7b0', '#ffd43b', '#ffffff'], 6, { g: 0, drag: 3, size: 0.05 });
        if (!r.demo) { Sfx.flip(e.n); const t = $('#hud-time'); t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop'); }
      } else if (e.type === 'loop') {
        r.pops.add('LOOP!', null, '#9ff0ff');
        if (!r.demo) Sfx.loop();
      } else if (e.type === 'land') {
        const art = R.ART[r.theme];
        for (const w of [c.rear, c.front]) {
          const p = wheelContact(r, w);
          burst(r, p.x, p.y, 8 + Math.min(14, e.air * 10), art.dust, 2 + e.air * 3);
        }
        cam.shake = Math.max(cam.shake, Math.min(9, e.air * 6));
        if (!r.demo) Sfx.land(e.air);
      } else if (e.type === 'crash') {
        r.over = true;
        cam.shake = 16; cam.flash = 0.45; cam.flashColor = '255,70,40';
        slowmo(0.3, 0.7);
        burst(r, c.x, c.y, 26, R.ART[r.theme].dust.concat(['#2a1505', '#555', '#ddd']), 7);
        if (!r.demo) {
          Sfx.crash(); Sfx.engine(false, 0, 0); buzz(60);
          later(1.15, () => {
            $('#crash-info').innerHTML = (e.reason === 'stuck' ? 'Stuck! ' : '') + `You made it <b>${Math.round(sim.progress() * 100)}%</b> of the way.<br>${tips[(Math.random() * tips.length) | 0]}`;
            showModal('crash');
          });
        } else later(1.6, () => { if (mode === 'menu') transition(() => { run = makeDemo(); }); });
      } else if (e.type === 'finish') {
        r.over = true;
        slowmo(0.35, 0.9);
        cam.flash = 0.35; cam.flashColor = '255,255,220';
        const fy = r.art.finishY;
        for (let i = 0; i < 150; i++) {
          r.parts.emit({
            x: r.art.finishX + (Math.random() - 0.5) * 3, y: fy + 0.5 + Math.random() * 2,
            vx: (Math.random() - 0.5) * 14, vy: 6 + Math.random() * 12, g: -9, drag: 0.9,
            life: 2.2 + Math.random() * 1.6, size: 0.12 + Math.random() * 0.08, shape: 'rect',
            rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 16, color: CONFETTI[i % CONFETTI.length], fade: false,
          });
        }
        if (!r.demo) {
          Sfx.finish(); Sfx.engine(false, 0, 0);
          recordWin(r);
          later(1.25, () => showWin(r));
        } else later(2.2, () => { if (mode === 'menu') transition(() => { run = makeDemo(); }); });
      }
    }
  }

  function emitFx(r, inp, dt) {
    const sim = r.sim, c = r.cur, art = R.ART[r.theme];
    const rw = sim.bike.rearW.getAngularVelocity();
    if (sim.rearGround && Math.abs(rw) > 8 && (inp.gas || inp.brake) && !r.over) {
      const p = wheelContact(r, c.rear);
      const dir = Math.cos(c.a) >= 0 ? 1 : -1;
      const n = Math.random() < dt * 60 * (inp.gas ? 1 : 0.6) ? 1 + (Math.random() < 0.4 ? 1 : 0) : 0;
      for (let i = 0; i < n; i++) {
        r.parts.emit({
          x: p.x, y: p.y + 0.05, vx: -dir * (1 + Math.random() * 2.5), vy: 0.6 + Math.random() * 1.8,
          life: 0.45 + Math.random() * 0.5, size: 0.05 + Math.random() * 0.08, grow: 2.4,
          color: art.dust[(Math.random() * art.dust.length) | 0], g: -1.5, drag: 2.5, alpha: 0.85,
        });
      }
    }
  }

  function recordWin(r) {
    const t = r.sim.result(), stars = r.sim.starsFor(t);
    const prev = save.best[r.li];
    const before = totalStars();
    save.best[r.li] = { time: prev ? Math.min(prev.time, t) : t, stars: Math.max(prev ? prev.stars : 0, stars) };
    persist();
    const after = totalStars();
    r.result = {
      t, stars, prevTime: prev ? prev.time : null, isBest: !prev || t < prev.time,
      newBikes: BIKES.filter(b => b.unlock > before && b.unlock <= after),
    };
  }
  let countUp = null;
  function showWin(r) {
    const res = r.result, L = LEVELS[r.li];
    $('#win-stars').innerHTML = [0, 1, 2].map(i => {
      const got = i < res.stars, d = 0.35 + i * 0.3;
      return `<span class="slot ${got ? 'got' : ''}" style="animation-delay:${d}s"><svg class="i"><use href="#i-star"/></svg>
        <span class="fill" style="animation-delay:${d}s"><svg class="i"><use href="#i-star"/></svg></span></span>`;
    }).join('');
    for (let i = 0; i < res.stars; i++) later(0.35 + i * 0.3 + 0.25, () => Sfx.star(i));
    countUp = { el: $('#win-time'), to: res.t, start: clock + 0.15, dur: 0.9 };
    $('#win-time').textContent = '0.00';
    const best = save.best[r.li].time;
    let sub = res.isBest && res.prevTime ? `Old best <b>${fmt(res.prevTime)} s</b>` : res.isBest ? 'First finish on this track' : `Best <b>${fmt(best)} s</b>`;
    if (r.sim.flips) sub += ` · ${r.sim.flips} flip${r.sim.flips > 1 ? 's' : ''} <b>−${r.sim.flips} s</b>`;
    if (res.stars < 3) sub += `<br>Finish in <b>${L.stars[res.stars === 2 ? 0 : 1]} s</b> for ${res.stars + 1} stars`;
    $('#win-sub').innerHTML = sub;
    $('#win-badges').innerHTML = (res.isBest && res.prevTime ? '<span class="badge">New record!</span> ' : '') +
      res.newBikes.map(b => `<span class="badge leaf">New bike: ${b.name}</span>`).join(' ');
    const next = $('#win-next');
    next.hidden = r.li + 1 >= LEVELS.length;
    showModal('win');
  }

  // ---------- HUD ----------
  const hudTime = $('#hud-time'), hudFill = $('#hud-fill'), hudDot = $('#hud-dot');
  function updateHud(r) {
    const t = fmt(r.sim.result());
    if (t !== r.hudT) { hudTime.textContent = t; r.hudT = t; }
    const p = (r.sim.progress() * 100).toFixed(2) + '%';
    hudFill.style.width = p; hudDot.style.left = p;
  }

  // ---------- Camera ----------
  function updateCamera(st, dt) {
    const k = rate => 1 - Math.exp(-dt * rate);
    const v = run.sim.bike.chassis.getLinearVelocity();
    const speed = Math.hypot(v.x, v.y);
    cam.lx += (clamp(v.x * 0.22, -3, 5.5) - cam.lx) * k(2.2);
    cam.ly += (clamp(v.y * 0.12, -2.5, 1.8) - cam.ly) * k(2.2);
    // While the bike is high above the track, pull back and frame both the bike and the landing.
    const ahead = st.x + clamp(v.x * 0.6, -6, 10);
    const gy = run.art.groundBelow(ahead, st.y) ?? run.art.groundBelow(st.x, st.y);
    const gap = gy === null ? 0 : st.y - gy;
    const wAir = clamp((gap - 2.5) / 3, 0, 1);
    cam.air += (wAir - cam.air) * k(2.5);
    const fit = gap > 0 ? view.H * 0.8 / (gap + 4) : basePpm;
    let zoom = basePpm * (1 - 0.2 * clamp((speed - 6) / 22, 0, 1)) * (run.over && !run.demo ? 1.1 : 1);
    zoom = zoom + (Math.max(basePpm * 0.55, Math.min(zoom, fit)) - zoom) * cam.air;
    view.ppm += (zoom - view.ppm) * k(1.6);
    const tx = st.x + cam.lx + view.W * 0.1 / view.ppm;
    let ty = st.y + 0.9 + cam.ly + (run.demo ? 2.2 : 0);
    if (gy !== null) ty += ((st.y + gy) / 2 + 0.6 - ty) * cam.air;
    view.camX += (tx - view.camX) * k(7);
    view.camY += (ty - view.camY) * k(6);
    // keep the bike inside the frame however fast it moves
    const mx = view.W * 0.5 / view.ppm - 2.2, my = view.H * 0.5 / view.ppm - 1.6;
    view.camX = clamp(view.camX, st.x - mx, st.x + mx);
    view.camY = clamp(view.camY, st.y - my, st.y + my);
    cam.shake *= Math.exp(-dt * 6);
    view.sx = (Math.sin(clock * 47) + Math.sin(clock * 29) * 0.6) * cam.shake * 0.6;
    view.sy = (Math.cos(clock * 41) + Math.sin(clock * 23) * 0.6) * cam.shake * 0.6;
    cam.flash *= Math.exp(-dt * 3.2);
  }

  // ---------- Render ----------
  function render(dt) {
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (!run) { g.fillStyle = '#17301c'; g.fillRect(0, 0, view.W, view.H); return; }
    const st = mix(run.prev, run.cur, clamp(run.acc / STEP, 0, 1));
    updateCamera(st, dt);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    // Scenery only ever scrolls forward, at a fixed scale (not the zoomed one) and with no vertical
    // movement; the motion is eased so camera jolts never reach it.
    if (run.lastCamX !== null && view.camX > run.lastCamX) run.bgTarget += view.camX - run.lastCamX;
    run.lastCamX = view.camX;
    run.bgX += (run.bgTarget - run.bgX) * (1 - Math.exp(-dt * 2.5));
    getBg(run.theme, run.li).draw(g, run.bgX, 0, basePpm, clock, 0);
    run.amb.draw(g, view.W, view.H, clock, run.bgX * basePpm * 0.35);
    run.art.draw(g, view, clock);
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    run.parts.draw(g, view);
    R.drawBike(g, imgs, run.def, run.geo, view, st);
    const bp = view.toScreen(st.x, st.y);
    run.pops.draw(g, bp.x, bp.y, view.ppm);
    if (cam.flash > 0.01) {
      g.fillStyle = `rgba(${cam.flashColor},${cam.flash})`;
      g.fillRect(0, 0, view.W, view.H);
    }
    drawIris();
  }

  // ---------- Main loop ----------
  // If frames keep running long, render at a lower resolution so motion stays smooth.
  const perf = { avg: 1 / 60, t: 0 };
  function adapt(dt) {
    perf.avg += (dt - perf.avg) * 0.05;
    perf.t += dt;
    if (perf.t > 2.5 && perf.avg > 1 / 45 && view.dpr > 0.65) {
      quality *= 0.8; perf.t = 0; perf.avg = 1 / 60;
      resize(true);
    }
  }
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    clock += dt;
    adapt(dt);
    if (run) {
      const due = run.timers.filter(t => t.at <= clock);
      if (due.length) { run.timers = run.timers.filter(t => t.at > clock); due.forEach(t => t.fn()); }
    }
    if (run && mode !== 'paused') {
      const target = clock < slow.until ? slow.scale : 1;
      timeScale += (target - timeScale) * (1 - Math.exp(-dt * (target < timeScale ? 16 : 2.5)));
      const sdt = dt * timeScale;
      const r = run;
      r.acc += sdt;
      const inp = r.demo || autoplay ? r.sim.autopilot() : input();
      let n = 0;
      while (r.acc >= STEP && n < 12) {
        r.prev = r.cur;
        r.sim.step(inp, STEP);
        r.cur = snap(r.sim);
        r.acc -= STEP; n++;
        onEvents(r, r.sim.drainEvents());
      }
      if (n >= 12) r.acc = 0;
      emitFx(r, inp, sdt);
      r.parts.update(sdt);
      r.pops.update(dt);
      if (!r.demo) {
        updateHud(r);
        const racing = mode === 'play' && !r.over;
        const b = r.sim.bike;
        Sfx.engine(racing, {
          road: b.chassis.getLinearVelocity().length() / (r.def.speed * r.geo.wr),
          wheel: Math.abs(b.rearW.getAngularVelocity()) / r.def.speed,
          air: !r.sim.rearGround && !r.sim.frontGround,
        }, inp.gas ? 1 : 0, r.def.sound, dt);
      }
    }
    updateIris(dt);
    render(dt);
    if (screen === 'garage') drawGarage(dt);
    if (countUp) {
      const t = clamp((clock - countUp.start) / countUp.dur, 0, 1);
      countUp.el.textContent = fmt(countUp.to * easeOut(t));
      if (t >= 1) countUp = null;
    }
  }

  // ---------- Boot ----------
  function fail(msg) {
    $('#loading').classList.add('gone');
    const d = document.createElement('div');
    d.className = 'error'; d.textContent = msg;
    $('#app').appendChild(d);
  }
  async function boot() {
    if (!window.planck) return fail('The physics engine did not load. Check your connection and reload the page.');
    try { await loadImages(); } catch (e) { return fail(`${e.message}. Make sure the assets folder sits next to index.html.`); }
    try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch (e) { /* fonts optional */ }
    // the menu's first demo ride is in the jungle; load that scene first, the rest in the background
    try { await Promise.race([R.loadScene('jungle1'), new Promise(r => setTimeout(r, 4000))]); } catch (e) { /* drawn fallback */ }
    for (const s of Object.keys(R.SCENES)) R.loadScene(s).catch(() => {});
    resize();
    let rz = 0;
    addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => resize()); });
    run = makeDemo();
    mode = 'menu';
    showScreen('menu');
    $('#loading').classList.add('gone');
    last = performance.now();
    requestAnimationFrame(frame);
  }
  boot();
})();
