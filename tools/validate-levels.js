// Validates generated levels: rides each with the autopilot on the slowest and fastest bike,
// re-rolling (attempt 0,1,2,...) until both finish. Prints one JSON line per level.
// usage: npm install planck@1.5.0 && node tools/validate-levels.js [worker] [workers] [from] [to]
const G = require('path').join(__dirname, '..', 'js') + '/';
const L = require(G + 'levels.js');
const { Sim } = require(G + 'sim.js');
const [worker, workers] = [+process.argv[2] || 0, +process.argv[3] || 1];
const from = +(process.argv[4] || L.HAND), to = +(process.argv[5] || L.TOTAL);
function ride(li, bi) {
  const sim = new Sim(li, bi);
  let t = 0;
  while (t < 170 && sim.state !== 'crashed' && sim.state !== 'finished') { sim.step(sim.autopilot(), 1 / 120); t += 1 / 120; }
  return { ok: sim.state === 'finished', time: sim.time, x: sim.bike.chassis.getPosition().x, fx: sim.track.finishX };
}
for (let i = from; i < to; i++) {
  if (i % workers !== worker) continue;
  const t0 = Date.now();
  let res = null;
  for (let attempt = 0; attempt < 36 && !res; attempt++) {
    const tr = L.generate(new L.TrackBuilder(), i, attempt).build();
    L.track = () => tr;
    const a = ride(i, 0);
    if (!a.ok) continue;
    const b = ride(i, 3);
    if (!b.ok) continue;
    res = { i, attempt, time: +a.time.toFixed(2), fast: +b.time.toFixed(2), len: Math.round(tr.finishX), loops: tr.loops.length, minY: Math.round(tr.bounds.minY), ms: Date.now() - t0 };
  }
  console.log(JSON.stringify(res || { i, fail: true, ms: Date.now() - t0 }));
}
