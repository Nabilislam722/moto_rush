// Physics for one run of one level: track, bike, rider, loops, flips, crash and finish detection.
// No DOM here, so the same code runs headless in Node for level testing.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('planck'), require('./levels.js'));
  else root.MotoSim = factory(root.planck, root.MotoLevels);
})(typeof self !== 'undefined' ? self : this, function (pl, Levels) {
  const Vec2 = pl.Vec2;
  const SPR = 92;          // sprite pixels per metre (sheet scale)
  const TAU = Math.PI * 2;

  // Sprite measurements are in sheet pixels: R/F = rear/front axle, seat = where the rider's hips sit.
  const BIKES = [
    { name: 'Storm RR', sprite: 'bike1', wheel: 'wheel1', w: 185, h: 94, R: [36, 76], F: [160, 77], seat: [78, 20],
      speed: 54, torque: 17, lean: 1.0, spin: 5.2, unlock: 0, stats: [3, 3, 3], sound: 'storm', voice: 'Screaming inline-four' },
    { name: 'Tricolore', sprite: 'bike2', wheel: 'wheel2', w: 176, h: 93, R: [30, 72], F: [150, 75], seat: [78, 22],
      speed: 58, torque: 19, lean: 1.08, spin: 5.6, unlock: 5, stats: [4, 4, 3], sound: 'tricolore', voice: 'Raspy turbo four' },
    { name: 'Rosso V4', sprite: 'bike3', wheel: 'wheel3', w: 168, h: 91, R: [28, 74], F: [143, 72], seat: [76, 23],
      speed: 62, torque: 21, lean: 1.18, spin: 6.0, unlock: 12, stats: [5, 4, 4], sound: 'rosso', voice: 'Turbo V4 thump' },
    { name: 'Viper Z', sprite: 'bike4', wheel: 'wheel4', w: 170, h: 89, R: [28, 70], F: [150, 74], seat: [78, 22],
      speed: 66, torque: 23, lean: 1.25, spin: 6.4, unlock: 20, stats: [5, 5, 5], sound: 'viper', voice: 'Growling turbo four' },
    // OP bike: drawn in js/opbike.js. Later an NFT; for now everyone can ride it as a demo (see NFT in game.js).
    { name: '#27 Venom', sprite: 'bike5', wheel: 'wheel5', wheelFront: 'wheel5f', w: 178, h: 113, R: [35, 79], F: [143, 79], seat: [66, 27],
      speed: 75, torque: 27, lean: 1.45, spin: 7.2, unlock: 0, nft: true, stats: [6, 6, 6], sound: 'op', voice: 'Turbo two-stroke' },
  ];
  const RIDER = { sprite: 'rider1', w: 93, h: 157, scale: 0.8, hip: [14, 86], head: [60, 19], headR: 18, center: [46, 80] };

  function geometry(b) {
    const O = { x: (b.R[0] + b.F[0]) / 2, y: Math.min(b.R[1], b.F[1]) - 24 };
    const L = (px, py) => Vec2((px - O.x) / SPR, -(py - O.y) / SPR);
    const s = RIDER.scale;
    const rp = (rx, ry) => L(b.seat[0] + (rx - RIDER.hip[0]) * s, b.seat[1] + (ry - RIDER.hip[1]) * s);
    return {
      O, L, rp,
      rear: L(b.R[0], b.R[1]), front: L(b.F[0], b.F[1]),
      wr: 30 / SPR,
      hull: [L(b.R[0] - 6, b.R[1] - 24), L(b.R[0] + 22, b.R[1] + 10), L(b.F[0] - 26, b.F[1] + 12),
        L(b.F[0] + 8, b.F[1] - 18), L(b.F[0] - 18, 6), L(b.R[0] + 40, 12)],
      head: rp(RIDER.head[0], RIDER.head[1]), headR: RIDER.headR * s / SPR,
      torso: [rp(4, 80), rp(30, 92), rp(66, 44), rp(40, 30)],
      riderCenter: rp(RIDER.center[0], RIDER.center[1]),
    };
  }

  class Sim {
    constructor(levelIndex, bikeIndex) {
      this.levelIndex = levelIndex;
      this.level = Levels.LEVELS[levelIndex];
      this.track = Levels.track(levelIndex);
      this.def = BIKES[bikeIndex];
      this.g = geometry(this.def);
      this.world = new pl.World({ gravity: Vec2(0, -10) });
      this.events = [];
      this.state = 'ready';
      this.time = 0;
      this.bonus = 0;
      this.flips = 0;
      this.lean = 0;
      this.leanVis = 0;
      this.inAir = false;
      this.rearGround = this.frontGround = this.bodyGround = false;
      this.ragdoll = null;
      this._buildTrack();
      this._buildBike();
      this.world.on('pre-solve', c => this._preSolve(c));
    }

    _buildTrack() {
      const fr = Levels.THEMES[this.level.theme].friction;
      this.ground = this.world.createBody();
      for (const pts of this.track.chains) {
        this.ground.createFixture(new pl.Chain(pts.map(p => Vec2(p.x, p.y)), false),
          { friction: fr, userData: { ground: true } });
      }
      this.loops = this.track.loops.map(l => ({ cx: l.cx, cy: l.cy, R: l.R, gap: l.gap || 0, active: 'A', entered: false }));
      this.track.loops.forEach((l, i) => {
        for (const half of ['A', 'B']) {
          this.ground.createFixture(new pl.Chain(l[half].map(p => Vec2(p.x, p.y)), false),
            { friction: fr, userData: { ground: true, loop: this.loops[i], half } });
        }
      });
    }

    _buildBike() {
      const g = this.g, d = this.def;
      const x = this.track.startX;
      const y = g.wr - Math.min(g.rear.y, g.front.y) + 0.02;
      const chassis = this.world.createBody({ type: 'dynamic', position: Vec2(x, y) });
      chassis.createFixture(new pl.Polygon(g.hull), { density: 3.4, friction: 0.4, restitution: 0.05, userData: { part: 'chassis' } });
      this.headFix = chassis.createFixture(new pl.Circle(g.head, g.headR), { isSensor: true, density: 0.3, userData: { part: 'rider' } });
      this.torsoFix = chassis.createFixture(new pl.Polygon(g.torso), { isSensor: true, density: 0.7, userData: { part: 'rider' } });

      const wheel = (local) => {
        const w = this.world.createBody({ type: 'dynamic', position: chassis.getWorldPoint(local) });
        w.createFixture(new pl.Circle(g.wr), { density: 1.2, friction: 1.4, restitution: 0.08, userData: { part: 'wheel' } });
        return w;
      };
      const rearW = wheel(g.rear), frontW = wheel(g.front);
      const susp = { frequencyHz: 4.2, dampingRatio: 0.7 };
      const rearJ = this.world.createJoint(new pl.WheelJoint(
        { ...susp, enableMotor: true, maxMotorTorque: 0, motorSpeed: 0 }, chassis, rearW, rearW.getPosition(), Vec2(0, 1)));
      const frontJ = this.world.createJoint(new pl.WheelJoint(
        { ...susp, enableMotor: true, maxMotorTorque: 0, motorSpeed: 0 }, chassis, frontW, frontW.getPosition(), Vec2(-0.25, 1)));

      // Rotational inertia of the whole bike about its centre, used to scale lean torque.
      const c = chassis.getWorldCenter();
      let I = chassis.getInertia();
      for (const w of [rearW, frontW]) I += w.getInertia() + w.getMass() * Vec2.distanceSquared(w.getWorldCenter(), c);
      this.bike = { chassis, rearW, frontW, rearJ, frontJ, inertia: I };
    }

    _preSolve(contact) {
      const ua = contact.getFixtureA().getUserData(), ub = contact.getFixtureB().getUserData();
      const seg = ua && ua.loop ? ua : ub && ub.loop ? ub : null;
      if (seg && !seg.loop.active.includes(seg.half)) contact.setEnabled(false);
    }

    _groundFixtureActive(f) {
      const u = f.getUserData();
      if (!u || !u.ground) return false;
      return !u.loop || u.loop.active.includes(u.half);
    }

    _touchingGround(body) {
      for (let ce = body.getContactList(); ce; ce = ce.next) {
        const c = ce.contact;
        if (ce.other === this.ground && c.isTouching() && c.isEnabled()) return true;
      }
      return false;
    }

    _riderHit() {
      for (let ce = this.bike.chassis.getContactList(); ce; ce = ce.next) {
        const c = ce.contact;
        if (ce.other !== this.ground || !c.isTouching()) continue;
        const fa = c.getFixtureA(), fb = c.getFixtureB();
        const mine = fa.getBody() === this.bike.chassis ? fa : fb;
        const other = mine === fa ? fb : fa;
        if (mine.getUserData() && mine.getUserData().part === 'rider' && this._groundFixtureActive(other)) return true;
      }
      return false;
    }

    forwardSpeed() {
      const ch = this.bike.chassis;
      const v = ch.getLinearVelocity();
      const ax = ch.getWorldVector(Vec2(1, 0));
      return v.x * ax.x + v.y * ax.y;
    }

    step(inp, dt) {
      const d = this.def, b = this.bike;
      if (this.state === 'finished') inp = { brake: true };
      else if (this.state === 'crashed') inp = {};
      else if (this.state === 'ready' && (inp.gas || inp.brake || inp.back || inp.fwd)) {
        this.state = 'racing';
        this.events.push({ type: 'start' });
      }

      if (inp.gas) {
        b.rearJ.setMotorSpeed(-d.speed); b.rearJ.setMaxMotorTorque(d.torque);
        b.frontJ.setMaxMotorTorque(0.05);
      } else if (inp.brake) {
        if (this.forwardSpeed() > 0.8) {
          b.rearJ.setMotorSpeed(0); b.rearJ.setMaxMotorTorque(d.torque * 1.4);
          b.frontJ.setMotorSpeed(0); b.frontJ.setMaxMotorTorque(d.torque * 0.9);
        } else {
          b.rearJ.setMotorSpeed(d.speed * 0.22); b.rearJ.setMaxMotorTorque(d.torque * 0.5);
          b.frontJ.setMaxMotorTorque(0.05);
        }
      } else {
        b.rearJ.setMotorSpeed(0); b.rearJ.setMaxMotorTorque(0.25);
        b.frontJ.setMotorSpeed(0); b.frontJ.setMaxMotorTorque(0.05);
      }

      const lean = this.state === 'crashed' ? 0 : (inp.back ? 1 : 0) - (inp.fwd ? 1 : 0);
      this.lean = lean;
      const air = !this.rearGround && !this.frontGround;
      const av = b.chassis.getAngularVelocity();
      const maxSpin = air ? d.spin : d.spin * 0.75;
      if (lean) {
        if (lean * av < maxSpin) b.chassis.applyTorque(lean * b.inertia * (air ? 20 : 12) * d.lean, true);
      } else if (air && this.state !== 'crashed') {
        b.chassis.setAngularVelocity(av * (1 - dt * 0.6));
      }
      // Wheelie assist: unless the rider is leaning back on purpose, a soft spring keeps the nose from looping over.
      // (Not inside loops, where "the ground below" isn't the surface the bike is on.)
      const cp = b.chassis.getPosition();
      const inLoop = this.loops.some(l => Math.hypot(cp.x - l.cx, cp.y - l.cy) < l.R + 1);
      if (this.rearGround && !this.frontGround && lean <= 0 && this.state !== 'crashed' && !inLoop) {
        const rp = b.rearW.getPosition();
        const slope = this.groundAngleAt(rp.x, rp.y);
        if (slope !== null) {
          const pitch = Math.atan2(Math.sin(b.chassis.getAngle() - slope), Math.cos(b.chassis.getAngle() - slope));
          if (pitch > 0.25 && pitch < 1.5) {
            b.chassis.applyTorque(-b.inertia * ((pitch - 0.25) * 70 + Math.max(0, av) * 9), true);
            // and ease the throttle like a wheelie-control system would
            if (inp.gas) b.rearJ.setMaxMotorTorque(d.torque * Math.max(0.25, 1 - (pitch - 0.25) * 2.5));
          }
        }
      }

      this.world.step(dt, 8, 3);
      this._afterStep(dt);
      this.leanVis += (lean - this.leanVis) * Math.min(1, dt * 10);
    }

    _afterStep(dt) {
      const b = this.bike, ch = b.chassis;
      const p = ch.getPosition();

      // Loop halves: once the bike is past the top, swap which half is solid; reset when it has left the loop.
      for (const l of this.loops) {
        const dx = p.x - l.cx, dy = p.y - l.cy;
        const inside = dx * dx + dy * dy < l.R * l.R;
        if (l.active === 'A') {
          // Only a bike that came up the entry side counts; one that flies in from above just passes through.
          if (inside && dx > 0 && dy < l.R * 0.5) l.entered = true;
          else if (Math.abs(dx) > l.R + 3) l.entered = false;
          if (l.gap) {
            // broken loop: switch the far side on before the bike reaches the gap, keep both solid while it crosses
            if (l.entered && inside && dy > 0 && Math.atan2(dy, dx) > 0.95) l.active = 'AB';
          } else if (l.entered && inside && dx < 0 && dy > l.R * 0.2) l.active = 'B';
        } else if (l.active === 'AB') {
          const deg = Math.atan2(dy, dx) * 180 / Math.PI;
          if (deg > 90 + l.gap / 2 + 35 || (dx < 0 && dy < 0)) l.active = 'B';
          else if (dy < -l.R * 0.3 || Math.abs(dx) > l.R + 3) { l.active = 'A'; l.entered = false; }
        } else if (dx > l.R + 2.4 || dx < -l.R - 3 || dy < -l.R - 4 || dy > l.R + 6) {
          l.active = 'A';
          l.entered = false;
          if (dx > 0 && this.state === 'racing') this.events.push({ type: 'loop' });
        }
      }

      this.rearGround = this._touchingGround(b.rearW);
      this.frontGround = this._touchingGround(b.frontW);
      this.bodyGround = this._touchingGround(ch);

      if (this.state === 'racing' || this.state === 'ready') {
        if (this.ragdoll === null && this._riderHit()) this._crash('head');
        else if (p.y < this.track.bounds.minY - 25) this._crash('fell');
      }
      // A bike that hasn't really moved for a few seconds mid-race is beached on something.
      if (this.state === 'racing') {
        this.stillTime = ch.getLinearVelocity().length() < 0.3 ? (this.stillTime || 0) + dt : 0;
        if (this.stillTime > 3.5) this._crash('stuck');
      }

      // Flips: count the rotation made while all wheels were off the ground.
      const airborne = !this.rearGround && !this.frontGround && !this.bodyGround;
      const ang = ch.getAngle();
      if (airborne) {
        if (!this.inAir) { this.inAir = true; this.airStart = ang; this.airTime = 0; }
        this.airTime += dt;
      } else if (this.inAir) {
        this.inAir = false;
        const rot = ang - this.airStart;
        const n = Math.floor((Math.abs(rot) + 0.8) / TAU);
        if (n > 0 && this.state === 'racing') {
          this.flips += n;
          this.bonus += n;
          this.events.push({ type: 'flip', n, back: rot > 0 });
        }
        if (this.airTime > 0.35) this.events.push({ type: 'land', air: this.airTime });
      }

      if (this.state === 'racing') {
        this.time += dt;
        if (p.x >= this.track.finishX) {
          this.state = 'finished';
          this.events.push({ type: 'finish', time: this.result() });
        }
      }
    }

    result() {
      return Math.max(0, this.time - this.bonus);
    }

    starsFor(t) {
      const s = this.level.stars;
      return t <= s[0] ? 3 : t <= s[1] ? 2 : 1;
    }

    _crash(reason) {
      this.state = 'crashed';
      this.events.push({ type: 'crash', reason });
      const ch = this.bike.chassis, g = this.g;
      ch.destroyFixture(this.headFix);
      ch.destroyFixture(this.torsoFix);
      const pos = ch.getWorldPoint(g.riderCenter);
      const vel = ch.getLinearVelocityFromLocalPoint(g.riderCenter);
      const rag = this.world.createBody({ type: 'dynamic', position: pos, angle: ch.getAngle(), angularDamping: 0.4 });
      rag.createFixture(new pl.Box(0.24, 0.5), { density: 1.0, friction: 0.8, restitution: 0.25 });
      rag.createFixture(new pl.Circle(Vec2(0.12, 0.5), 0.17), { density: 0.5, friction: 0.8, restitution: 0.3 });
      rag.setLinearVelocity(Vec2(vel.x * 0.9, vel.y * 0.9 + 3));
      rag.setAngularVelocity(ch.getAngularVelocity() + (vel.x >= 0 ? -3 : 3));
      this.ragdoll = rag;
    }

    progress() {
      const t = this.track;
      const x = this.bike.chassis.getPosition().x;
      return Math.max(0, Math.min(1, (x - t.startX) / (t.finishX - t.startX)));
    }

    // Slope of the track under x (radians), looking for the surface nearest below y.
    groundAngleAt(x, y) {
      let best = null, bestDy = Infinity;
      for (const c of this.track.chains) {
        if (x < c[0].x || x > c[c.length - 1].x) continue;
        for (let i = 1; i < c.length; i++) {
          const a = c[i - 1], b = c[i];
          if (x < Math.min(a.x, b.x) || x > Math.max(a.x, b.x) || a.x === b.x) continue;
          const gy = a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x);
          const dy = y - gy;
          if (dy > -1 && dy < bestDy) { bestDy = dy; best = Math.atan2(b.y - a.y, b.x - a.x); }
        }
      }
      return best;
    }

    // Simple driver used for the menu demo ride and for headless level testing.
    autopilot() {
      const ch = this.bike.chassis, v = ch.getLinearVelocity();
      const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
      const ang = wrap(ch.getAngle()), av = ch.getAngularVelocity();
      const inp = { gas: true };
      const air = !this.rearGround && !this.frontGround;
      let target;
      // inside a loop (including the flight across a broken loop's gap) just hold the throttle
      if (this.loops.some(l => l.active !== 'A' || (l.entered && Math.hypot(ch.getPosition().x - l.cx, ch.getPosition().y - l.cy) < l.R))) {
        return inp;
      } else if (air) {
        target = Math.max(-0.7, Math.min(0.5, Math.atan2(v.y, v.x)));
        const p = ch.getPosition();
        const slope = this.groundAngleAt(p.x + v.x * 0.25, p.y);
        if (slope !== null) target = (target + slope) / 2;
      } else {
        const p = ch.getPosition();
        const slope = this.groundAngleAt(p.x, p.y);
        if (slope === null) return inp;
        target = slope;
      }
      const diff = wrap(target - ang) - av * (air ? 0.18 : 0.12);
      const dead = air ? 0.08 : 0.2;
      if (diff > dead) inp.back = true;
      else if (diff < -dead) inp.fwd = true;
      return inp;
    }

    drainEvents() {
      const e = this.events;
      this.events = [];
      return e;
    }
  }

  return { Sim, BIKES, RIDER, SPR, geometry };
});
