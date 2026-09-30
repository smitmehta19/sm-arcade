/* ============================================================
   CUP PONG — flick a ping-pong ball into your partner's red cups.

   Rules (kept tight — the same text lives in GAME_RULES):
     · 10 cups each, racked in a triangle at your end of the table.
     · 2 throws a turn. Sink BOTH → "balls back" (one extra turn).
     · One ball in = that one cup out (the cup it ends up in). Nothing else is
       ever removed; a ball that hits a rim and pops out is a miss.
     · One re-rack each per game, on your turn before your first throw:
       the cups you are aiming at snap into a tight shape.
     · Sink 3 throws in a row → ON FIRE: your ball glows until you miss
       (just for show — the cups stay the same size).
     · Clear your partner's cups → they get a REBUTTAL: they throw until
       they miss. If they clear all of yours, it's a draw.

   Multiplayer model (see CONTEXT "COMMIT BEFORE YOU ANIMATE"):
     The thrower turns the swipe into a rounded velocity (vx,vy,vz) and
     spin, simulates the flight, and COMMITS input + outcome + throw id
     FIRST. Every phone then replays the throw by re-simulating those
     numbers. The simulation only uses + − × ÷ and sqrt, which are
     exactly rounded under IEEE-754, so iOS Safari and Chrome agree — and
     if they ever did not, the replay SNAPS its tail onto the committed
     outcome, so the cup that falls is always the committed one.
     The canvas, the loop and the replay live at MODULE level (scene S)
     and are re-attached on every repaint, so a repaint can never restart
     or kill a throw, and a finished throw id never replays.

   Camera: behind YOU, always. On your turn it frames the rack you are
   aiming at; while your partner throws it swings down onto your own
   cups, so their ball flies toward you.
   ============================================================ */
(function () {
  const css = `
  .cp-wrap{ display:flex; flex-direction:column; gap:10px; }
  .cp-cv{ width:100%; display:block; margin:0 auto; border-radius:var(--r-3); border:1px solid var(--glass-brd);
    box-shadow:var(--shadow-soft); background:#07050d; touch-action:none; user-select:none; -webkit-user-select:none;
    -webkit-touch-callout:none; }
  .cp-row{ display:flex; align-items:center; gap:10px; }
  .cp-hint{ flex:1 1 auto; min-width:0; font-size:12.5px; color:var(--ink-dim); line-height:1.45; min-height:36px;
    display:flex; align-items:center; flex-wrap:wrap; gap:0 4px; }
  .cp-hint b{ color:var(--ink); }
  .cp-hint .cp-fire{ color:#ffb13b; font-weight:800; }
  .cp-up{ display:inline-block; font-weight:900; color:var(--ink); animation:cpUp 1.3s ease-in-out infinite; }
  @keyframes cpUp{ 0%{ transform:translateY(5px); opacity:.25 } 45%{ opacity:1 } 100%{ transform:translateY(-6px); opacity:0 } }
  .cp-rr{ flex:none; padding:9px 12px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd);
    color:var(--ink); font-weight:700; font-size:12px; line-height:1.2; white-space:nowrap;
    transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), opacity var(--dur-2); }
  .cp-rr:active{ transform:scale(.94); }
  .cp-rr.armed{ border-color:var(--gold); color:var(--gold); box-shadow:0 0 15px -4px var(--gold); }
  .cp-rr:disabled{ opacity:.35; }
  @media (prefers-reduced-motion: reduce){ .cp-up{ animation:none; opacity:1; } }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------------- world (cm, seconds) ---------------- */
  const L = 180, TW = 66;                    // table length / width
  const CR = 5.2, CB = 3.6, CH = 11, LIQ = 5.4; // cup rim radius, base radius, height, drink level
  const BR = 1.9;                            // ball radius
  const SP = 10.9, ROWK = 0.866, Z0 = 9.2;   // cup spacing, hex row factor, back-row distance from the table end
  const REL = [0, 30, -6];                   // release point (thrower frame: thrower at z<0, throwing toward +z)
  const G = 980, DT = 1 / 240, SUB = 4, MAXSTEP = 960;
  const RIM_T = 0.35, E_RIM = 0.42, E_WALL = 0.38, E_TAB = 0.43, F_TAB = 0.8, KD = 0.08, SPIN_A = 14, FIRE_K = 1.18;
  const VMIN = 300, VMAX = 460, ELEV = 52 * Math.PI / 180;
  const COS_E = Math.cos(ELEV), SIN_E = Math.sin(ELEV);
  const ON_FIRE = 3;
  const RACKS = { 10: [4, 3, 2, 1], 9: [1, 2, 3, 2, 1], 8: [2, 3, 2, 1], 7: [2, 3, 2], 6: [3, 2, 1], 5: [3, 2], 4: [1, 2, 1], 3: [2, 1], 2: [1, 1], 1: [1] };

  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);

  /* ---------------- racks ---------------- */
  // slot positions in the OWNER's frame: z = distance from the owner's end of the table (back row first),
  // x = to the owner's right. The apex points at the thrower.
  function formation(n) {
    const rows = RACKS[n] || RACKS[10], out = [];
    let z = Z0;
    rows.forEach((k, ri) => {
      if (ri) z += (Math.abs(k - rows[ri - 1]) % 2 === 1) ? SP * ROWK : SP;
      for (let j = 0; j < k; j++) out.push({ x: r1((j - (k - 1) / 2) * SP), z: r1(z) });
    });
    return out;
  }
  const byZX = (a, b) => (a.z - b.z) || (a.x - b.x) || ((a.i || 0) - (b.i || 0));
  // re-rack: keep each cup's id, move the cups into the tight shape for their count (closest-first)
  function arrange(cups) {
    const slots = formation(cups.length).sort(byZX), cur = cups.slice().sort(byZX);
    return cur.map((c, k) => ({ i: c.i, x: slots[k].x, z: slots[k].z }));
  }
  const sameLayout = (a, b) => {
    if (a.length !== b.length) return false;
    const A = a.slice().sort(byZX), B = b.slice().sort(byZX);
    return A.every((c, k) => Math.abs(c.x - B[k].x) < .05 && Math.abs(c.z - B[k].z) < .05);
  };
  // "back-most" = furthest from the thrower = closest to its owner's end (smallest owner z)
  function backMost(cups) {
    return cups.slice().sort((a, b) => (a.z - b.z) || (Math.abs(a.x) - Math.abs(b.x)) || (a.i - b.i))[0] || null;
  }
  // owner-frame cups → thrower frame (the owner stands at the far end, facing the thrower)
  const toThrower = cups => cups.map(c => ({ i: c.i, x: -c.x, z: L - c.z }));

  /* ---------------- deterministic flight ----------------
     Pure arithmetic (+ − × ÷ sqrt) on the committed numbers only, so every phone
     computes bit-identical paths. Returns path points every SUB steps (1/60 s),
     events (table / rim / wall / in) and the outcome. */
  // `fire` (bigger cup) is only ever 1 when replaying a throw committed before v81 — new throws pass 0
  function simulate(v, spin, fire, targets) {
    let x = REL[0], y = REL[1], z = REL[2], vx = +v[0] || 0, vy = +v[1] || 0, vz = +v[2] || 0;
    const R = fire ? CR * FIRE_K : CR, sp = +spin || 0;
    const pts = [[x, y, z]], evs = [];
    let bounces = 0, rims = 0, rolling = false, cupIn = null, inT = 0, out = null, lastRim = -99, lastWall = -99, left = false;
    for (let k = 1; k <= MAXSTEP; k++) {
      const py = y;
      if (!rolling) vy -= G * DT;
      if (!bounces && !cupIn) vx += sp * SPIN_A * DT;
      vx -= vx * KD * DT; vy -= vy * KD * DT; vz -= vz * KD * DT;
      x += vx * DT; y += vy * DT; z += vz * DT;
      if (cupIn) {                                            // rattling down to the drink
        const dx = x - cupIn.x, dz = z - cupIn.z, d2 = dx * dx + dz * dz;
        const yy = y > 0 ? y : 0, lim = CB + (CR - CB) * yy / CH - BR * .7;
        const lm = lim > .4 ? lim : .4;
        if (d2 > lm * lm) {
          const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, vn = vx * nx + vz * nz;
          x = cupIn.x + nx * lm; z = cupIn.z + nz * lm;
          if (vn > 0) { vx -= 1.5 * vn * nx; vz -= 1.5 * vn * nz; }
        }
        if (y < LIQ) { y = LIQ; vy = vy < 0 ? -vy * .15 : vy; vx *= .5; vz *= .5; }
        if (k % SUB === 0) pts.push([x, y, z]);
        if (++inT > 90) break;
        continue;
      }
      for (let ci = 0; ci < targets.length; ci++) {
        const c = targets[ci], dx = x - c.x, dz = z - c.z, d2 = dx * dx + dz * dz, reach = R + BR + 1;
        if (d2 > reach * reach) continue;
        const d = Math.sqrt(d2);
        if (py >= CH && y < CH && d < R - BR * .55) {          // through the mouth → it's in
          cupIn = c; out = { r: 'in', c: c.i, b: bounces > 0 ? 1 : 0 };
          evs.push({ k: 'in', p: pts.length, c: c.i });
          break;
        }
        if (y > CH - BR * 1.2) {                               // the rolled lip: a torus
          const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0;
          const qx = c.x + nx * R, qz = c.z + nz * R;
          const wx = x - qx, wy = y - CH, wz = z - qz, wd2 = wx * wx + wy * wy + wz * wz, lim = BR + RIM_T;
          if (wd2 < lim * lim) {
            const wd = Math.sqrt(wd2) || 1e-6, mx = wx / wd, my = wy / wd, mz = wz / wd, vn = vx * mx + vy * my + vz * mz;
            x = qx + mx * lim; y = CH + my * lim; z = qz + mz * lim;
            if (vn < 0) { vx -= (1 + E_RIM) * vn * mx; vy -= (1 + E_RIM) * vn * my; vz -= (1 + E_RIM) * vn * mz; }
            if (k - lastRim > 8) { rims++; evs.push({ k: 'rim', p: pts.length, c: c.i }); }
            lastRim = k;
          }
        } else if (y > -1) {                                   // the cup's outside wall
          const yy = y > 0 ? y : 0, rw = CB + (R - CB) * yy / CH, lim = rw + BR;
          if (d < lim) {
            const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0, vn = vx * nx + vz * nz;
            x = c.x + nx * lim; z = c.z + nz * lim;
            if (vn < 0) { vx -= (1 + E_WALL) * vn * nx; vz -= (1 + E_WALL) * vn * nz; }
            if (k - lastWall > 8) evs.push({ k: 'wall', p: pts.length, c: c.i });
            lastWall = k;
          }
        }
      }
      if (cupIn) { if (k % SUB === 0) pts.push([x, y, z]); continue; }
      const over = x >= -TW / 2 && x <= TW / 2 && z >= 0 && z <= L;
      if (over && y < BR && vy <= 0 && !left) {
        y = BR;
        if (-vy > 45) { vy = -vy * E_TAB; vx *= F_TAB; vz *= F_TAB; bounces++; evs.push({ k: 'table', p: pts.length }); }
        else { vy = 0; rolling = true; }
      }
      if (rolling) {
        if (!over) { rolling = false; left = true; }
        else { y = BR; vx -= vx * 1.3 * DT; vz -= vz * 1.3 * DT; }
      }
      if (!over && y < 0) left = true;                       // below the table top and off it: gone
      if (k % SUB === 0) pts.push([x, y, z]);
      if (y < -70) break;
      if (rolling && vx * vx + vz * vz < 64) break;
    }
    const last = pts[pts.length - 1];
    if (!last || last[0] !== x || last[1] !== y || last[2] !== z) pts.push([x, y, z]);
    if (!out) {
      const m = rims ? 'rim' : z > L ? 'long' : (x < -TW / 2 || x > TW / 2) ? 'wide' : bounces ? 'table' : 'short';
      out = { r: 'miss', m };
    }
    out.e = [r1(x), r1(y), r1(z)];
    out.rims = rims; out.bounces = bounces;
    return { pts, evs, out };
  }
  // swipe → committed input. Trig happens ONCE, on the thrower's phone, and is rounded away.
  function inputFrom(power, yaw, spin) {
    const sp = VMIN + (VMAX - VMIN) * clamp(power, 0, 1), hz = sp * COS_E, yw = clamp(yaw, -.34, .34);
    return { v: [r2(hz * Math.sin(yw)), r2(sp * SIN_E), r2(hz * Math.cos(yw))], s: r2(clamp(spin || 0, -1, 1)) };
  }

  /* ---------------- rules (pure) ---------------- */
  // RTDB turns an array with a stripped (empty) first slot into {1: …} — keep the INDEX, not the order
  function toArr(a) {
    if (Array.isArray(a)) return a;
    const out = [];
    if (a && typeof a === 'object') Object.keys(a).forEach(k => { if (/^\d+$/.test(k)) out[+k] = a[k]; });
    return out;
  }
  const cleanCups = a => toArr(a).filter(c => c && typeof c === 'object').map(c => ({ i: +c.i || 0, x: +c.x || 0, z: +c.z || 0 }));
  const pair = (a, d) => { const t = toArr(a); return [0, 1].map(i => (t[i] == null ? d : +t[i] || 0)); };
  // Firebase strips nulls / empty arrays, so every field is re-defaulted on read
  function norm(st) {
    const s = st && typeof st === 'object' ? st : {};
    const cs = toArr(s.cups);
    s.cups = [cleanCups(cs[0]), cleanCups(cs[1])];
    s.turn = s.turn === 1 ? 1 : 0;
    s.phase = ['play', 'rebuttal', 'done'].includes(s.phase) ? s.phase : 'play';
    s.thrown = +s.thrown || 0; s.sunk = +s.sunk || 0;
    s.streak = pair(s.streak, 0); s.rr = pair(s.rr, 0); s.thr = pair(s.thr, 0);
    s.reb = s.reb === 0 || s.reb === 1 ? s.reb : -1;
    s.fin = s.fin === 0 || s.fin === 1 || s.fin === 'draw' ? s.fin : -1;
    s.n = +s.n || 0; s.seed = +s.seed || 1; s.note = s.note || ''; s.clk = +s.clk || 0;
    if (typeof s.mid !== 'string') delete s.mid;
    const Lx = s.last;
    if (Lx && typeof Lx === 'object' && Lx.id) {
      Lx.prev = cleanCups(Lx.prev);
      if (Lx.k === 'r') Lx.to = cleanCups(Lx.to);
      else {
        const vv = toArr(Lx.v); Lx.k = 't'; Lx.v = [0, 1, 2].map(i => +vv[i] || 0);
        Lx.s = +Lx.s || 0; Lx.f = Lx.f ? 1 : 0; Lx.gl = (Lx.gl || Lx.f) ? 1 : 0; Lx.bb = Lx.bb ? 1 : 0; Lx.ig = Lx.ig ? 1 : 0; Lx.ev = Lx.ev || '';
        const o = Lx.out && typeof Lx.out === 'object' ? Lx.out : {};
        const ee = toArr(o.e);
        Lx.out = { r: o.r === 'in' ? 'in' : 'miss', c: +o.c || 0, b: o.b ? 1 : 0, x: o.x === 0 || +o.x > 0 ? +o.x : -1, e: ee.length ? [0, 1, 2].map(i => +ee[i] || 0) : [], m: o.m || '' };
      }
      Lx.seat = Lx.seat === 1 ? 1 : 0; Lx.target = 1 - Lx.seat;
    } else s.last = null;
    return s;
  }
  const cloneSt = st => norm(JSON.parse(JSON.stringify(st)));

  function canRack(s, seat) {
    const tg = s.cups[1 - seat];
    return s.turn === seat && (s.phase === 'play' || s.phase === 'rebuttal') && !s.rr[seat] && s.thrown === 0 &&
      tg.length >= 1 && tg.length <= 9 && !sameLayout(tg, arrange(tg));
  }
  function rackState(st0, seat) {
    const s = cloneSt(st0);
    if (!canRack(s, seat)) return null;
    const tgt = 1 - seat, prev = s.cups[tgt], to = arrange(prev);
    s.rr[seat] = 1; s.n++; s.cups[tgt] = to; s.note = '';
    s.last = { id: s.n, k: 'r', seat, target: tgt, prev, to };
    return s;
  }
  // one throw, fully resolved. Returns the next state and the winner (undefined while the game goes on).
  function resolve(st0, seat, inp) {
    const s = cloneSt(st0), tgt = 1 - seat, prev = s.cups[tgt];
    const fire = s.streak[seat] >= ON_FIRE ? 1 : 0;
    // simple rules (v81): one ball in = that one cup out; ON FIRE only glows (f = 0 → normal cup size)
    const sim = simulate(inp.v, inp.s, 0, toThrower(prev));
    const o = sim.out, gone = [], extra = -1;
    if (o.r === 'in') gone.push(o.c);
    s.cups[tgt] = prev.filter(c => gone.indexOf(c.i) < 0);
    s.thr[seat]++;
    if (o.r === 'in') s.streak[seat]++; else s.streak[seat] = 0;
    s.n++;
    const Lx = { id: s.n, k: 't', seat, target: tgt, v: inp.v.slice(), s: inp.s, f: 0, gl: fire, prev,
      out: { r: o.r, c: o.r === 'in' ? o.c : 0, b: 0, x: extra, e: o.e, m: o.m || '' },
      bb: 0, ev: '', ig: !fire && s.streak[seat] >= ON_FIRE ? 1 : 0 };
    let winner;
    if (s.phase === 'rebuttal') {
      s.thrown++;
      if (o.r !== 'in') { s.phase = 'done'; s.fin = s.reb; winner = s.reb; Lx.ev = 'win'; }
      else if (!s.cups[tgt].length) { s.phase = 'done'; s.fin = 'draw'; winner = 'draw'; Lx.ev = 'draw'; }
      else s.clk++;                          // another rebuttal throw: a fresh turn clock
    } else {
      s.thrown++; if (o.r === 'in') s.sunk++;
      if (!s.cups[tgt].length) { s.phase = 'rebuttal'; s.reb = seat; s.turn = tgt; s.thrown = 0; s.sunk = 0; Lx.ev = 'reb'; }
      else if (s.thrown >= 2) {
        if (s.sunk >= 2) { Lx.bb = 1; s.clk++; } else s.turn = tgt;    // balls back: a new turn, a fresh clock
        s.thrown = 0; s.sunk = 0;
      }
    }
    s.last = Lx; s.note = '';
    return { s, winner, out: o, sim };
  }

  /* ---------------- module-level scene (survives repaints) ---------------- */
  const VW = 600, VH = 760;
  const S = {
    cv: null, g: null, raf: 0, lastT: 0, acc: 0, ctx: null, st: null, seed: null,
    W: 0, H: 0, dpr: 1, k: 1, cssH: 0, back: null, vig: null, grainKey: '',
    cam: null, fy: 0, fz: 1, sx: 0, sy: 0, shake: 0, flash: 0, flashC: '#fff',
    anim: null, doneId: 0, parts: [], pops: [], floats: [], banner: null,
    drag: null, aim: null, aimSim: null, aimK: 1, lockN: null, lockT: 0, rackArm: 0, settleKey: '', tick: 0,
    calm: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  const CAM = {
    aim: { cz: -60, cy: 128, lz: 164, foc: 1500, cyf: .43 },
    push: { cz: -18, cy: 112, lz: 168, foc: 1500, cyf: .44 },
    def: { cz: -104, cy: 150, lz: 36, foc: 1180, cyf: .63 },
    over: { cz: -150, cy: 250, lz: 96, foc: 1000, cyf: .5 },
  };
  const HUD = { x: VW / 2, y: VH - 78, r: 25 };

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const seatCol = i => (S.ctx && S.ctx.players[i] && S.ctx.players[i].color) || (i ? '#ff4d9d' : '#2fe6ff');
  const seatName = i => (S.ctx && S.ctx.players[i] && S.ctx.players[i].name) || (i ? 'Meera' : 'Smit');

  function resetScene(st) {
    S.seed = st.seed; S.mid = st.mid; S.anim = null; S.parts = []; S.pops = []; S.floats = []; S.banner = null; S.shake = 0; S.flash = 0;
    S.drag = null; S.aim = null; S.aimSim = null; S.lockN = null; S.rackArm = 0; S.settleKey = '';
    // a fresh page replays the latest event once (the partner may not have seen it); older ones never
    S.doneId = st.last ? st.last.id - 1 : 0;
    S.cam = null;
  }

  function ensureCanvas() {
    if (S.cv) return;
    S.cv = document.createElement('canvas'); S.cv.className = 'cp-cv';
    S.g = S.cv.getContext('2d');
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(S.cv);
    else window.addEventListener('resize', fit);
    const loc = e => { const r = S.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, H: r.height || 1, W: r.width || 1 }; };
    S.cv.addEventListener('pointerdown', e => {
      if (!canAct()) return;
      const p = loc(e);
      S.drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, H: p.H, W: p.W, pts: [[p.x, p.y]] };
      S.aim = null; S.aimSim = null;
      try { S.cv.setPointerCapture(e.pointerId); } catch (x) {}
      ensureLoop();
    });
    S.cv.addEventListener('pointermove', e => {
      if (!S.drag) return;
      if (!canAct()) { S.drag = null; S.aim = null; return; }
      const p = loc(e);
      S.drag.x = p.x; S.drag.y = p.y; S.drag.pts.push([p.x, p.y]); if (S.drag.pts.length > 90) S.drag.pts.splice(1, 1);
      S.aim = dragAim(S.drag);
      S.aimSim = S.aim ? aimPreview(S.aim) : null;
      e.preventDefault(); ensureLoop();
    }, { passive: false });
    const release = () => {
      if (!S.drag) return;
      const a = S.aim; S.drag = null; S.aim = null; S.aimSim = null;
      ensureLoop();
      if (!a || a.power < .03 || !canAct()) return;           // a tap or a pull-down — not a throw
      launch(a);
    };
    S.cv.addEventListener('pointerup', release);
    S.cv.addEventListener('pointercancel', () => { S.drag = null; S.aim = null; S.aimSim = null; ensureLoop(); });
  }
  function canAct() {
    const c = S.ctx, st = S.st;
    if (!c || !st || !c.isMyTurn || c.status !== 'active' || S.anim) return false;
    if (st.phase !== 'play' && st.phase !== 'rebuttal') return false;
    if (st.turn !== c.me) return false;
    if (st.last && st.last.id > S.doneId) return false;              // an event is still waiting to be shown
    if (S.lockN != null && st.n === S.lockN && Date.now() - S.lockT < 5000) return false;   // commit in flight
    return true;
  }
  function fit() {
    if (!S.cv) return;
    const par = S.cv.parentNode, pw = par && par.clientWidth ? par.clientWidth : S.cv.clientWidth;
    if (!pw) return;
    // keep the whole table on screen on short phones: cap the height, centre the canvas
    const maxH = Math.max(320, (window.innerHeight || 800) * .68);
    const w = Math.min(pw, Math.floor(maxH * VW / VH)), hgt = Math.round(w * VH / VW);
    S.cv.style.width = w + 'px'; S.cv.style.height = hgt + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(hgt * dpr);
    S.cssH = hgt;
    if (W === S.W && H === S.H) return;
    S.W = W; S.H = H; S.dpr = dpr; S.k = W / VW;
    S.cv.width = W; S.cv.height = H; S.vig = null;
    draw();                                                    // resizing wipes the bitmap — repaint now
  }
  // ONE loop, ever: every (re)schedule goes through the `!S.raf` guard. step() can finish a throw and
  // re-render, and render() calls ensureLoop() while S.raf is 0 — without the guard at the end of
  // loop() that became a second, third… loop and every later throw flew 2×, 3× fast (the Fleabag bug).
  // Fixed timestep: step() is one 60 Hz tick whatever the screen's refresh (90/120 Hz phones too).
  const TICK = 1000 / 60;
  function ensureLoop() { if (!S.raf && S.cv) { if (!S.lastT) S.acc = TICK; S.raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    S.raf = 0;
    if (!S.cv || !S.cv.isConnected) { S.lastT = 0; S.acc = 0; return; }   // left the game — render() restarts us
    const now = typeof ts === 'number' && ts > 0 ? ts : performance.now();
    if (S.lastT) S.acc += Math.min(now - S.lastT, TICK * 6);             // a stall catches up at most 6 ticks
    S.lastT = now;
    let ran = 0;
    while (S.acc >= TICK && ran < 6) { step(); S.acc -= TICK; ran++; }
    if (ran) draw();
    if (busy()) { if (!S.raf) S.raf = requestAnimationFrame(loop); }
    else { S.lastT = 0; S.acc = 0; }                                    // idle when nothing moves
  }
  function busy() {
    return !!(S.anim || S.drag || S.parts.length || S.pops.length || S.floats.length || S.banner || S.flash > .01 ||
      S.shake > .2 || !camSettled() || fireShowing());
  }

  /* ---------------- camera + projection ---------------- */
  function camTarget() {
    const c = S.ctx, st = S.st, A = S.anim;
    if (!c || !st) return CAM.aim;
    if (A && A.k === 't') {
      const b = A.ball || [0, 30, 0];
      if (A.seat === c.me) {
        if (S.calm) return CAM.aim;
        const t = ease(clamp(b[2] / (L - 25), 0, 1));
        return mix(CAM.aim, CAM.push, A.done ? 1 : t);
      }
      if (S.calm) return CAM.def;
      const lz = A.done ? CAM.def.lz : clamp(b[2] * .62 + 4, CAM.def.lz, 118);
      return Object.assign({}, CAM.def, { lz, cz: A.done ? CAM.def.cz + 16 : CAM.def.cz });
    }
    if (A && A.k === 'r') return A.seat === c.me ? CAM.aim : CAM.def;
    if (c.status === 'finished' || st.phase === 'done') return CAM.over;
    return st.turn === c.me ? CAM.aim : CAM.def;
  }
  const mix = (a, b, t) => ({ cz: lerp(a.cz, b.cz, t), cy: lerp(a.cy, b.cy, t), lz: lerp(a.lz, b.lz, t), foc: lerp(a.foc, b.foc, t), cyf: lerp(a.cyf, b.cyf, t) });
  function camSettled() {
    if (!S.cam) return true;
    const t = camTarget(), c = S.cam;
    return Math.abs(t.cz - c.cz) < .2 && Math.abs(t.cy - c.cy) < .2 && Math.abs(t.lz - c.lz) < .2 && Math.abs(t.foc - c.foc) < .5 && Math.abs(t.cyf - c.cyf) < .001;
  }
  function stepCam(snap) {
    const t = camTarget();
    if (!S.cam || snap || S.calm) { S.cam = Object.assign({}, t); }
    else {
      const e = S.anim ? .085 : .07, c = S.cam;
      ['cz', 'cy', 'lz', 'foc', 'cyf'].forEach(key => { c[key] += (t[key] - c[key]) * e; });
    }
    setCam();
  }
  function setCam() {
    const c = S.cam; const fy = -c.cy, fz = c.lz - c.cz, n = Math.sqrt(fy * fy + fz * fz);
    S.fy = fy / n; S.fz = fz / n;
  }
  function P(x, y, z) {
    const c = S.cam, dy = y - c.cy, dz = z - c.cz, zc = Math.max(4, dy * S.fy + dz * S.fz), yc = dy * S.fz - dz * S.fy, k = c.foc / zc;
    return { x: VW / 2 + x * k + S.sx, y: VH * c.cyf - yc * k + S.sy, k, zc };
  }
  function projK(c, y, z) {
    const fy = -c.cy, fz = c.lz - c.cz, n = Math.sqrt(fy * fy + fz * fz);
    return c.foc / Math.max(4, ((y - c.cy) * fy + (z - c.cz) * fz) / n);
  }
  const depth = (y, z) => (y - S.cam.cy) * S.fy + (z - S.cam.cz) * S.fz;
  // viewer frame: I always stand at z<0. The thrower frame is mine when I threw, else mirrored.
  const tv = (seat, p) => seat === (S.ctx ? S.ctx.me : 0) ? [p[0], p[1], p[2]] : [-p[0], p[1], L - p[2]];
  const cupView = (owner, c) => owner === (S.ctx ? S.ctx.me : 0) ? { i: c.i, x: c.x, z: c.z } : { i: c.i, x: -c.x, z: L - c.z };

  // swipe direction on screen → yaw in the world, calibrated so pointing at a cup aims at it
  function calibrate() {
    const keep = S.cam; S.cam = Object.assign({}, CAM.aim); setCam();
    const tx = 18, tz = L - 26, T = P(tx, CH, tz);
    const phi = Math.atan2(T.x - HUD.x, HUD.y - T.y), yaw = Math.atan(tx / (tz - REL[2]));
    S.aimK = Math.abs(Math.tan(phi)) > 1e-4 ? Math.tan(yaw) / Math.tan(phi) : 1;
    S.cam = keep; if (S.cam) setCam();
  }
  function dragAim(d) {
    const dx = d.x - d.x0, up = d.y0 - d.y;
    if (up < 14) return null;
    const len = Math.sqrt(dx * dx + up * up);
    const power = clamp((len - 12) / (d.H * .58), 0, 1);
    const phi = clamp(Math.atan2(dx, up), -1.2, 1.2);
    const yaw = clamp(Math.atan(S.aimK * Math.tan(phi)), -.34, .34);
    // curved swipe → a little spin (dead zone so a natural thumb arc stays straight)
    let dev = 0;
    for (const p of d.pts) { const px = p[0] - d.x0, py = d.y0 - p[1], cr = (dx * py - up * px) / len; if (Math.abs(cr) > Math.abs(dev)) dev = cr; }
    const rel = dev / len, spin = Math.abs(rel) < .09 ? 0 : clamp((rel - Math.sign(rel) * .09) * 5, -1, 1);
    return { power, yaw, spin, len };
  }
  function aimPreview(a) {
    const st = S.st, me = S.ctx.me, inp = inputFrom(a.power, a.yaw, a.spin);
    return simulate(inp.v, inp.s, 0, toThrower(st.cups[1 - me]));
  }

  /* ---------------- actions ---------------- */
  function launch(a) {
    const c = S.ctx; if (!canAct()) return false;
    const st = S.st, me = c.me, inp = inputFrom(a.power, a.yaw, a.spin);
    const r = resolve(st, me, inp);
    S.lockN = st.n; S.lockT = Date.now();
    try { c.sound.move(); } catch (e) {}
    // COMMIT FIRST — input + outcome + id. The flight is replayed from `last` on every phone
    // (this one included) by the repaint the commit triggers.
    if (r.winner !== undefined) c.commit(r.s, r.winner); else c.commit(r.s);
    return true;
  }
  function doRack() {
    const c = S.ctx; if (!canAct() || !canRack(S.st, c.me)) return false;
    const s = rackState(S.st, c.me); if (!s) return false;
    S.lockN = S.st.n; S.lockT = Date.now(); S.rackArm = 0;
    try { c.sound.tap(); } catch (e) {}
    c.commit(s);
    return true;
  }
  function rerender() {
    const c = S.ctx; if (!c || !c.root || !c.root.isConnected) return;
    c.root.innerHTML = ''; DEF.render(c);
  }

  /* ---------------- replay ---------------- */
  // What this phone has already WATCHED survives a reload (per match), so reopening the game never
  // replays an old throw — but a throw fired while this phone was closed still plays once.
  const SEEN_KEY = 'sm_cp_seen';
  const matchKey = st => st.mid || ('seed:' + st.seed);            // pre-`mid` saves fall back to the seed
  function readSeen(st) {
    try { const v = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); return v && v.k === matchKey(st) ? (+v.id || 0) : 0; } catch (e) { return 0; }
  }
  function writeSeen(st, id) { try { if (st && id > readSeen(st)) localStorage.setItem(SEEN_KEY, JSON.stringify({ k: matchKey(st), id })); } catch (e) {} }
  function maybeReplay(st) {
    const Lx = st.last;
    if (Lx && Lx.id > S.doneId && !S.anim && readSeen(st) >= Lx.id) S.doneId = Lx.id;   // watched before a reload
    if (!Lx || Lx.id <= S.doneId) return;
    if (S.anim) { if (S.anim.id !== Lx.id) S.anim.hurry = true; return; }   // let the current one land first
    startAnim(Lx);
  }
  function startAnim(Lx) {
    if (Lx.k === 'r') {
      S.anim = { id: Lx.id, k: 'r', seat: Lx.seat, target: Lx.target, prev: Lx.prev, to: Lx.to, t: 0, dur: 58 };
      try { S.ctx.sound.move(); } catch (e) {}
      return;
    }
    const tg = toThrower(Lx.prev), sim = simulate(Lx.v, Lx.s, Lx.f, tg);
    const same = sim.out.r === Lx.out.r && (Lx.out.r !== 'in' || sim.out.c === Lx.out.c);
    const path = same ? sim : snapPath(sim, Lx, tg);
    S.anim = { id: Lx.id, k: 't', L: Lx, seat: Lx.seat, target: Lx.target, prev: Lx.prev, pts: path.pts, evs: path.evs, ei: 0,
      i: 0, done: false, tail: 0, gone: {}, snapped: !same, ball: tv(Lx.seat, path.pts[0]), trail: [],
      tv: toThrower(Lx.prev).map(c => ({ i: c.i, p: tv(Lx.seat, [c.x, CH, c.z]) })), extraAt: -1, final: !!Lx.ev };
    if (Lx.seat !== S.ctx.me) { try { S.ctx.sound.place(); } catch (e) {} }
  }
  // the local re-simulation disagreed with the committed outcome (never seen in practice — the sim
  // is exactly-rounded arithmetic — but floats are floats): keep the opening of the local flight,
  // then bend the tail onto the COMMITTED result so the right cup falls on every phone.
  function snapPath(sim, Lx, tg) {
    const n = sim.pts.length, cut = Math.max(4, Math.min(n - 2, Math.floor(n * .5)));
    const p0 = sim.pts[cut], pts = sim.pts.slice(0, cut + 1), evs = sim.evs.filter(e => e.p < cut && e.k !== 'in');
    let end;
    if (Lx.out.r === 'in') { const c = tg.find(q => q.i === Lx.out.c) || tg[0]; end = [c.x, LIQ, c.z]; }
    else end = Lx.out.e && Lx.out.e.length === 3 ? Lx.out.e : [p0[0], -70, p0[2] + 40];
    const ctl = [(p0[0] + end[0]) / 2, Math.max(p0[1], end[1]) + 24, (p0[2] + end[2]) / 2];
    const steps = 34;
    let inAt = -1;
    for (let j = 1; j <= steps; j++) {
      const t = j / steps, u = 1 - t;
      const q = [u * u * p0[0] + 2 * u * t * ctl[0] + t * t * end[0], u * u * p0[1] + 2 * u * t * ctl[1] + t * t * end[1], u * u * p0[2] + 2 * u * t * ctl[2] + t * t * end[2]];
      pts.push(q);
      if (Lx.out.r === 'in' && inAt < 0 && q[1] < CH && t > .5) { inAt = pts.length - 1; evs.push({ k: 'in', p: inAt, c: Lx.out.c }); }
    }
    if (Lx.out.r === 'in' && inAt < 0) evs.push({ k: 'in', p: pts.length - 1, c: Lx.out.c });
    return { pts, evs };
  }
  // playback speed (path points per frame): real time is 1; slower near the cups
  function speedAt(A, i) {
    if (S.calm) return 1;
    let s = .8;
    const p = A.pts[Math.min(A.pts.length - 1, Math.floor(i))];
    if (p && p[1] < CH + 26 && p[1] > CH - 6) {
      for (const c of A.tv) {
        const q = tv(A.seat, p), dx = q[0] - c.p[0], dz = q[2] - c.p[2];
        if (dx * dx + dz * dz < 17 * 17) { s = A.final ? .2 : .3; break; }
      }
    }
    return A.hurry ? s * 2 : s;
  }
  const TAIL = 52;
  function remainingMs() {
    const A = S.anim; if (!A) return 0;
    if (A.k === 'r') return Math.round((A.dur - A.t) * 16.7);
    let f = 0;
    for (let i = A.i; i < A.pts.length - 1; i += speedAt(A, i)) f++;
    const popWait = A.L.out.r === 'in' && !A.gone[A.L.out.c] ? 14 : 0, extra = A.L.out.x >= 0 && !A.gone[A.L.out.x] ? 22 : 0;
    return Math.round((f + Math.max(0, TAIL - A.tail, popWait + extra) + (A.final ? 40 : 0)) * 16.7);
  }

  /* ---------------- effects ---------------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const cupOf = (A, id) => A.tv.find(q => q.i === id);
  const addShake = v => { if (!S.calm) S.shake = Math.max(S.shake, v); };     // reduced motion: never
  // the ball hits the drink: a splash out of the mouth
  function splash(A, cupId, big) {
    const c = cupOf(A, cupId); if (!c) return;
    const [x, , z] = c.p;
    for (let i = 0; i < (big ? 44 : 28); i++) {
      const a = rnd(0, 6.283), v = rnd(.3, 1.2);
      S.parts.push({ k: 'drop', x: x + Math.cos(a) * 1.5, y: CH - 1, z: z + Math.sin(a) * 1.5, vx: Math.cos(a) * v, vy: rnd(1.4, 3.6), vz: Math.sin(a) * v, life: rnd(34, 58), max: 58, r: rnd(.35, .8), c: i % 3 ? '#ffc561' : '#fff4d6' });
    }
    S.parts.push({ k: 'glow', x, y: CH, z, r: big ? 54 : 34, life: 22, max: 22, c: seatCol(A.seat) });
  }
  // …then the cup pops off the table
  function popCup(A, cupId, big) {
    const c = cupOf(A, cupId); if (!c) return;
    const [x, , z] = c.p, col = seatCol(A.seat);
    A.gone[cupId] = true;
    S.pops.push({ x, z, owner: A.target, t: 0, max: 44, dir: x < 0 ? -1 : 1, ball: cupId === A.L.out.c });
    for (let i = 0; i < 18; i++) { const a = rnd(0, 6.283), v = rnd(1.2, 2.8); S.parts.push({ k: 'spark', x, y: CH + 2, z, vx: Math.cos(a) * v, vy: rnd(.6, 2.4), vz: Math.sin(a) * v, life: rnd(20, 34), max: 34, c: col }); }
    S.parts.push({ k: 'ring', x, z, r0: CR, r1: CR * (big ? 7.5 : 4.8), life: 30, max: 30, c: col });
    S.parts.push({ k: 'glow', x, y: CH + 4, z, r: big ? 70 : 40, life: 26, max: 26, c: col });
    addShake(big ? 14 : 8);
    if (A.target === S.ctx.me) { try { if (navigator.vibrate) navigator.vibrate([30, 30, 60]); } catch (e) {} }
  }
  function puff(p, n, c) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(.15, .5); S.parts.push({ k: 'dust', x: p[0], y: .4, z: p[2], vx: Math.cos(a) * v, vy: rnd(.05, .25), vz: Math.sin(a) * v, life: rnd(18, 30), max: 30, r: rnd(.8, 1.8), c: c || 'rgba(255,240,220,' }); }
  }
  function floatText(text, p, c, big) { S.floats.push({ text, x: p[0], y: p[1], z: p[2], c, life: 78, max: 78, big: !!big }); }
  function banner(text, sub, c, dur) { S.banner = { text, sub: sub || '', c: c || '#ffd66b', t: 0, dur: dur || 96 }; }
  function confetti(col) {
    const cols = [col, col, '#ffffff', '#ffd66b', col];
    const zc = clamp(camTarget().lz, 30, L - 30);                       // burst where the camera is looking
    for (let i = 0; i < 150; i++) {
      const side = i % 2 ? 1 : -1, x = side * rnd(20, 34), z = zc + rnd(-45, 45);
      S.parts.push({ k: 'conf', x, y: rnd(0, 4), z, vx: -side * rnd(.2, 1.1), vy: rnd(1.6, 3.6), vz: rnd(-.6, .6), life: rnd(100, 150), max: 150, c: cols[i % cols.length], rot: rnd(0, 6.3), vr: rnd(-.3, .3), s: rnd(1, 1.9) });
    }
  }

  function fireEvent(A, ev) {
    const p = tv(A.seat, A.pts[Math.min(A.pts.length - 1, ev.p)]), c = S.ctx, mine = A.seat === c.me;
    if (ev.k === 'table') { puff(p, 8); try { c.sound.place(); } catch (e) {} }
    else if (ev.k === 'rim' || ev.k === 'wall') {
      for (let i = 0; i < 8; i++) { const a = rnd(0, 6.283); S.parts.push({ k: 'spark', x: p[0], y: p[1], z: p[2], vx: Math.cos(a) * .9, vy: rnd(.3, 1.4), vz: Math.sin(a) * .9, life: 16, max: 16, c: '#ffffff' }); }
      if (ev.k === 'rim') addShake(2.5);
      try { c.sound.tap(); } catch (e) {}
    } else if (ev.k === 'in') {
      const Lx = A.L;
      if (Lx.out.r !== 'in' || A.inCup != null) return;   // never trust a local 'in' the commit didn't make
      A.inCup = Lx.out.c; A.inT = 0;
      splash(A, Lx.out.c, A.final);
      const cup = cupOf(A, Lx.out.c);
      floatText(Lx.out.b ? 'BOUNCE ×2' : A.final ? 'LAST CUP!' : 'SINK!', cup ? [cup.p[0], CH + 16, cup.p[2]] : p, Lx.out.b ? '#ffd66b' : seatCol(A.seat), true);
      try { c.sound[mine ? 'good' : 'bad'](); } catch (e) {}
    }
  }
  function afterFlight(A) {
    const Lx = A.L, c = S.ctx, mine = A.seat === c.me, who = seatName(A.seat), p = tv(A.seat, A.pts[A.pts.length - 1]);
    if (Lx.out.r !== 'in') {
      const m = Lx.out.m, rimEv = A.evs.filter(e => e.k === 'rim').pop();
      // label it where the drama was: the last rim it rattled, else over the rack's front
      const at = rimEv ? tv(A.seat, A.pts[rimEv.p]) : null, rack = A.tv.length ? A.tv.reduce((s, q) => [s[0] + q.p[0] / A.tv.length, 0, s[2] + q.p[2] / A.tv.length], [0, 0, 0]) : p;
      const fx = at ? at[0] : rack[0], fz = at ? at[2] : rack[2];
      floatText(m === 'rim' ? 'RIMMED OUT' : m === 'long' ? 'LONG' : m === 'wide' ? 'WIDE' : 'SHORT', [clamp(fx, -16, 16), CH + 18, fz], '#c9d0ff');
      try { c.sound[mine ? 'bad' : 'tap'](); } catch (e) {}
    }
    const col = seatCol(A.seat);
    if (Lx.ev === 'reb') { banner('REBUTTAL', `${seatName(Lx.target)} throws until a miss`, seatCol(Lx.target), 120); try { c.sound.countdown(); } catch (e) {} }
    else if (Lx.ev === 'win') { const w = Lx.target; banner(`${seatName(w).toUpperCase()} WINS`, 'rebuttal missed', seatCol(w), 130); confetti(seatCol(w)); S.flash = 1; S.flashC = seatCol(w); }
    else if (Lx.ev === 'draw') { banner('DRAW!', `${who} cleared the rebuttal`, '#ffd66b', 130); confetti('#ffd66b'); S.flash = 1; S.flashC = '#ffd66b'; }
    else if (Lx.bb) { banner('BALLS BACK', `${who} throws again`, col, 100); try { c.sound.good(); } catch (e) {} }
    else if (Lx.ig) { banner('ON FIRE', `${who} · 3 in a row`, '#ffb13b', 100); try { c.sound.countdown(); } catch (e) {} }
  }
  function finishAnim() {
    const A = S.anim; S.anim = null; S.doneId = A.id;
    writeSeen(S.st, A.id);
    const c = S.ctx; if (!c) return;
    if (A.k === 't') {
      const Lx = A.L, mine = A.seat === c.me, who = seatName(A.seat);
      const txt = Lx.out.r === 'in'
        ? (Lx.out.b ? `💥 Bounce shot — <b>2 cups</b>${mine ? '!' : ` gone from your rack`}` : mine ? '🎯 Sunk it!' : `😱 ${who} sank one of yours`)
        : Lx.out.m === 'rim' ? (mine ? '😬 Rimmed out…' : `😅 ${who} rimmed out`) : (mine ? '💨 Missed.' : `🙌 ${who} missed`);
      try { c.msg(txt + (Lx.bb ? ' · ↩️ <b>balls back!</b>' : '') + (Lx.ig ? ' · 🔥 <b>on fire</b>' : '')); } catch (e) {}
    } else {
      try { c.msg(`🔺 ${seatName(A.seat)} re-racked ${A.seat === c.me ? 'the cups' : 'your cups'}`); } catch (e) {}
    }
    rerender();                                   // the turn bar / hint were frozen at pre-throw values
    if (S.ctx && S.ctx.state && S.st) maybeReplay(S.st);   // a newer event queued up behind this one
    ensureLoop();
  }

  /* ---------------- per-frame (cosmetic) ---------------- */
  function step() {
    S.tick++;
    const A = S.anim;
    if (A && A.k === 'r') { A.t++; if (A.t === 20 || A.t === 30) { try { S.ctx.sound.place(); } catch (e) {} } if (A.t >= A.dur) finishAnim(); }
    else if (A && A.k === 't') {
      if (!A.done) {
        A.i = Math.min(A.pts.length - 1, A.i + speedAt(A, A.i));
        while (A.ei < A.evs.length && A.evs[A.ei].p <= A.i) fireEvent(A, A.evs[A.ei++]);
        if (A.i >= A.pts.length - 1) {
          while (A.ei < A.evs.length) fireEvent(A, A.evs[A.ei++]);
          A.done = true; afterFlight(A);
        }
      } else A.tail++;
      if (A.inCup != null && !A.gone[A.inCup] && ++A.inT >= 14) {       // it settles in the drink, then the cup pops
        popCup(A, A.inCup, A.final);
        if (A.L.out.x >= 0) A.extraAt = 22;
      }
      if (A.extraAt >= 0 && --A.extraAt <= 0) {                          // bounce shot: the back-most cup goes too
        const x = A.L.out.x; splash(A, x, false); popCup(A, x, false);
        const cup = cupOf(A, x); if (cup) floatText('+1', [cup.p[0], CH + 30, cup.p[2]], '#ffd66b', true);
        try { S.ctx.sound.good(); } catch (e) {}
        A.extraAt = -1;
      }
      A.ball = ballAt(A);
      if (!A.done && S.tick % 2 === 0) { A.trail.push(A.ball.slice()); if (A.trail.length > 7) A.trail.shift(); }
      if (A.L.gl && !A.done && !S.calm) {
        for (let j = 0; j < 2; j++) S.parts.push({ k: 'flame', x: A.ball[0] + rnd(-.6, .6), y: A.ball[1] + rnd(-.4, .6), z: A.ball[2] + rnd(-.6, .6), vx: rnd(-.08, .08), vy: rnd(.1, .35), vz: rnd(-.08, .08), life: rnd(12, 22), max: 22, r: rnd(1.1, 2.2) });
      }
      if (A.done && A.tail >= TAIL + (A.final ? 40 : 0) && A.extraAt < 0 && (A.inCup == null || A.gone[A.inCup])) finishAnim();
    }
    stepCam(false);
    // particles (world units: cm, per frame)
    const gpf = G / 3600;
    S.parts = S.parts.filter(q => {
      q.life--;
      if (q.k === 'drop' || q.k === 'spark') { q.vy -= gpf * .5; q.x += q.vx; q.y += q.vy; q.z += q.vz; if (q.y < 0) { q.y = 0; q.vy *= -.25; q.vx *= .5; q.vz *= .5; } }
      else if (q.k === 'conf') { q.vy -= gpf * .22; q.vx *= .985; q.vz *= .985; q.x += q.vx; q.y += q.vy; q.z += q.vz; q.rot += q.vr; if (q.y < 0) { q.y = 0; q.vy = 0; q.vx *= .6; q.vz *= .6; q.vr *= .6; } }
      else if (q.k === 'dust' || q.k === 'flame') { q.x += q.vx; q.y += q.vy; q.z += q.vz; }
      return q.life > 0;
    });
    if (S.parts.length > 520) S.parts.splice(0, S.parts.length - 520);
    S.pops = S.pops.filter(p => ++p.t < p.max);
    S.floats = S.floats.filter(f => --f.life > 0);
    if (S.banner && ++S.banner.t >= S.banner.dur) S.banner = null;
    S.flash *= .9; if (S.flash < .01) S.flash = 0;
    S.shake *= .86; if (S.shake < .2) S.shake = 0;
    const sh = S.calm ? 0 : S.shake; S.sx = sh ? rnd(-1, 1) * sh : 0; S.sy = sh ? rnd(-1, 1) * sh : 0;
  }
  function ballAt(A) {
    const n = A.pts.length - 1, i = Math.min(n, A.i), a = Math.floor(i), b = Math.min(n, a + 1), t = i - a;
    const p = A.pts[a], q = A.pts[b];
    return tv(A.seat, [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)]);
  }
  function fireShowing() {
    const c = S.ctx, st = S.st; if (!c || !st || S.calm) return false;
    return (st.phase === 'play' || st.phase === 'rebuttal') && c.status === 'active' && st.streak[st.turn] >= ON_FIRE && !S.anim;
  }

  /* ---------------- drawing ---------------- */
  const N = 20, CS = [], SN = [];
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; CS.push(Math.cos(a)); SN.push(Math.sin(a)); }
  const NEAR = [], NEAR_R = [];
  for (let i = N / 2; i <= N; i++) NEAR.push(i % N);     // π → 2π: the half toward the camera
  for (let i = NEAR.length - 1; i >= 0; i--) NEAR_R.push(NEAR[i]);

  function buildBackdrop() {
    // the bar wall behind the far end: bricks, a neon sign, backlit shelves, string lights
    const PX = 2.2, WW = 700, WH = 300, c = document.createElement('canvas');
    c.width = Math.round(WW * PX); c.height = Math.round(WH * PX);
    const b = c.getContext('2d'), R = rng(7331);
    b.scale(PX, PX);
    const wall = b.createLinearGradient(0, 0, 0, WH);
    wall.addColorStop(0, '#0a0613'); wall.addColorStop(.5, '#1b1030'); wall.addColorStop(1, '#140b1f');
    b.fillStyle = wall; b.fillRect(0, 0, WW, WH);
    for (let y = 0, row = 0; y < WH - 58; y += 9, row++) {                 // bricks
      for (let x = (row % 2) * -11; x < WW; x += 22) {
        b.fillStyle = `rgba(${130 + R() * 60 | 0},${50 + R() * 30 | 0},${80 + R() * 50 | 0},${.05 + R() * .08})`;
        b.fillRect(x + .6, y + .6, 20.8, 7.8);
      }
    }
    // a warm wash from the sign down the wall
    const wash = b.createRadialGradient(WW / 2, 80, 10, WW / 2, 90, 260);
    wash.addColorStop(0, 'rgba(255,90,170,.20)'); wash.addColorStop(.5, 'rgba(60,160,255,.08)'); wash.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = wash; b.fillRect(0, 0, WW, WH);
    // shelves with backlit bottles, both sides
    [[18, 190], [WW - 208, 190]].forEach(([sx, sw]) => {
      const glow = b.createRadialGradient(sx + sw / 2, 170, 10, sx + sw / 2, 170, 140);
      glow.addColorStop(0, 'rgba(255,170,80,.32)'); glow.addColorStop(1, 'rgba(255,170,80,0)');
      b.fillStyle = glow; b.fillRect(sx - 60, 60, sw + 120, 200);
      [150, 205].forEach(sy => {
        let x = sx + 6;
        while (x < sx + sw - 10) {
          const w = 6 + R() * 5, hh = 18 + R() * 20, hue = [[80, 200, 120], [230, 150, 60], [120, 170, 255], [240, 90, 110], [220, 220, 200]][R() * 5 | 0];
          b.fillStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},.6)`;
          b.beginPath(); b.moveTo(x, sy); b.lineTo(x, sy - hh * .62); b.quadraticCurveTo(x, sy - hh * .75, x + w * .35, sy - hh * .8);
          b.lineTo(x + w * .35, sy - hh); b.lineTo(x + w * .65, sy - hh); b.lineTo(x + w * .65, sy - hh * .8);
          b.quadraticCurveTo(x + w, sy - hh * .75, x + w, sy - hh * .62); b.lineTo(x + w, sy); b.closePath(); b.fill();
          b.fillStyle = 'rgba(255,255,255,.2)'; b.fillRect(x + 1.2, sy - hh * .6, 1, hh * .45);
          x += w + 2 + R() * 3;
        }
        b.fillStyle = '#2a1a14'; b.fillRect(sx, sy, sw, 4); b.fillStyle = 'rgba(255,200,140,.3)'; b.fillRect(sx, sy, sw, 1);
      });
    });
    // neon sign
    const sign = (txt, x, y, size, col) => {
      b.font = `900 ${size}px Orbitron, "Chakra Petch", system-ui, sans-serif`; b.textAlign = 'center'; b.textBaseline = 'middle';
      b.save(); b.shadowColor = col; b.shadowBlur = 24; b.strokeStyle = col; b.lineWidth = 2.4; b.strokeText(txt, x, y); b.shadowBlur = 9; b.strokeText(txt, x, y); b.restore();
      b.strokeStyle = 'rgba(255,255,255,.9)'; b.lineWidth = .8; b.strokeText(txt, x, y);
    };
    sign('CUP', WW / 2 - 60, 74, 44, '#2fe6ff');
    sign('PONG', WW / 2 + 68, 74, 44, '#ff4d9d');
    // a neon cup + ball doodle
    b.save(); b.shadowColor = '#ffd66b'; b.shadowBlur = 14; b.strokeStyle = '#ffd66b'; b.lineWidth = 2;
    b.beginPath(); b.moveTo(WW / 2 - 14, 112); b.lineTo(WW / 2 + 14, 112); b.lineTo(WW / 2 + 9, 138); b.lineTo(WW / 2 - 9, 138); b.closePath(); b.stroke();
    b.beginPath(); b.arc(WW / 2 + 26, 104, 4.5, 0, 7); b.stroke();
    b.setLineDash([2, 3]); b.beginPath(); b.moveTo(WW / 2 + 60, 128); b.quadraticCurveTo(WW / 2 + 44, 90, WW / 2 + 30, 102); b.stroke();
    b.restore();
    // string lights
    for (let s = 0; s < 2; s++) {
      const y0 = 12 + s * 9;
      b.strokeStyle = 'rgba(40,30,30,.9)'; b.lineWidth = .6; b.beginPath();
      for (let x = 0; x <= WW; x += 4) { const y = y0 + Math.sin(x / WW * Math.PI * 4 + s) * 6; x ? b.lineTo(x, y) : b.moveTo(x, y); } b.stroke();
      for (let x = 8 + s * 11; x < WW; x += 22) {
        const y = y0 + Math.sin(x / WW * Math.PI * 4 + s) * 6 + 3, hue = ['255,200,120', '255,120,170', '120,230,255'][(x / 22 | 0) % 3];
        const gl = b.createRadialGradient(x, y, 0, x, y, 10); gl.addColorStop(0, `rgba(${hue},.6)`); gl.addColorStop(1, `rgba(${hue},0)`);
        b.fillStyle = gl; b.fillRect(x - 10, y - 10, 20, 20);
        b.fillStyle = `rgba(${hue},1)`; b.beginPath(); b.arc(x, y, 1.4, 0, 7); b.fill();
      }
    }
    // wainscot
    const wd = b.createLinearGradient(0, WH - 58, 0, WH);
    wd.addColorStop(0, '#2e1a12'); wd.addColorStop(1, '#120906');
    b.fillStyle = wd; b.fillRect(0, WH - 58, WW, 58);
    b.fillStyle = 'rgba(255,190,120,.2)'; b.fillRect(0, WH - 58, WW, 1.4);
    for (let x = 0; x < WW; x += 28) { b.fillStyle = 'rgba(0,0,0,.3)'; b.fillRect(x, WH - 56, 1, 56); }
    S.back = { c, WW, WH };
  }

  function draw() {
    const g = S.g, c = S.ctx, st = S.st; if (!g || !c || !st) return;
    if (!S.W) fit(); if (!S.W) return;
    if (!S.cam) stepCam(true); else setCam();
    if (!S.back) buildBackdrop();
    g.setTransform(S.k, 0, 0, S.k, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    drawRoom(g);
    drawTable(g);
    drawScene(g, st);
    drawParts(g);
    drawAimGuide(g, st);
    drawHudBall(g, st);
    drawFloats(g);
    drawVignette(g);
    drawHud(g, st);
    drawBanner(g);
    if (S.flash > .01) { g.globalAlpha = S.flash * .45; g.fillStyle = S.flashC; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; }
  }

  function drawRoom(g) {
    // floor
    const fl = g.createLinearGradient(0, 0, 0, VH);
    fl.addColorStop(0, '#0d0a14'); fl.addColorStop(1, '#040308');
    g.fillStyle = fl; g.fillRect(0, 0, VW, VH);
    // the back wall: a far parallax layer pinned to where the floor meets the wall behind the table,
    // so it slides and zooms with the camera (the steep camera would otherwise only see its skirting)
    const B = S.back, foot = P(0, -76, L + 95), sc = clamp(foot.k / projK(CAM.aim, -76, L + 95), .6, 1.8);
    const w = VW * 1.36 * sc, hgt = w * B.WH / B.WW, x0 = VW / 2 - w / 2 + S.sx * .4, y1 = foot.y + S.sy * .4;
    if (y1 > 0) {
      g.drawImage(B.c, x0, y1 - hgt, w, hgt);
      const fg = g.createLinearGradient(0, y1, 0, Math.min(VH, y1 + 160));
      fg.addColorStop(0, 'rgba(40,22,36,.9)'); fg.addColorStop(1, 'rgba(10,6,14,0)');
      g.fillStyle = fg; g.fillRect(0, y1, VW, 160);
    }
    // warm pool on the floor under the table
    const fp = P(0, -76, L / 2), gr = g.createRadialGradient(fp.x, fp.y, 0, fp.x, fp.y, 190 * fp.k);
    gr.addColorStop(0, 'rgba(255,170,110,.10)'); gr.addColorStop(1, 'rgba(255,170,110,0)');
    g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
  }

  function nearZ() {
    // clip the table in front of the camera so nothing projects from behind it
    const c = S.cam; return Math.max(-2, c.cz + (24 + c.cy * S.fy) / S.fz);
  }
  function ellipseAt(g, x, y, z, r) {
    const p = P(x, y, z), px = P(x + r, y, z), pz1 = P(x, y, z + r), pz0 = P(x, y, z - r);
    const rx = Math.abs(px.x - p.x), ry = Math.abs(pz0.y - pz1.y) / 2;
    g.beginPath(); g.ellipse(p.x, (pz0.y + pz1.y) / 2, Math.max(.1, rx), Math.max(.1, ry), 0, 0, 7);
    return { p, rx, ry };
  }
  function quad(g, pts) { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); }
  function drawTable(g) {
    const zn = nearZ(), me = S.ctx.me, hw = TW / 2;
    // legs + shadow on the floor (only the far pair is ever in view)
    [[-hw + 5, L - 6], [hw - 5, L - 6]].forEach(([x, z]) => {
      const a = P(x - 2, 0, z), b = P(x + 2, -76, z);
      g.fillStyle = '#120b0a'; g.fillRect(a.x, a.y, Math.max(1, b.x - a.x), b.y - a.y);
    });
    quad(g, [P(-hw - 8, -76, zn), P(hw + 8, -76, zn), P(hw + 14, -76, L + 14), P(-hw - 14, -76, L + 14)]);
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fill();
    // apron (front face at the far end)
    quad(g, [P(-hw, 0, L), P(hw, 0, L), P(hw, -7, L), P(-hw, -7, L)]);
    g.fillStyle = '#1c0f0a'; g.fill();
    // top: dark walnut
    const top = [P(-hw, 0, zn), P(hw, 0, zn), P(hw, 0, L), P(-hw, 0, L)];
    quad(g, top);
    const wg = g.createLinearGradient(0, top[2].y, 0, top[0].y);
    wg.addColorStop(0, '#2e1a10'); wg.addColorStop(.5, '#4a2a17'); wg.addColorStop(1, '#3a2012');
    g.fillStyle = wg; g.fill();
    g.save(); quad(g, top); g.clip();
    // planks + grain
    for (let i = 1; i < 6; i++) {
      const x = -hw + TW * i / 6, a = P(x, 0, zn), b = P(x, 0, L);
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
    const R = rng(99);
    g.lineWidth = .7;
    for (let i = 0; i < 26; i++) {
      const x0 = -hw + R() * TW, wob = R() * 1.6, ph = R() * 6;
      g.strokeStyle = `rgba(${R() < .5 ? '255,200,150' : '20,8,4'},${.05 + R() * .07})`;
      g.beginPath();
      for (let z = Math.max(0, zn); z <= L; z += L / 12) { const p = P(x0 + Math.sin(z / 30 + ph) * wob, 0, z); z === Math.max(0, zn) ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y); }
      g.stroke();
    }
    // lamp pools over each rack + a glossy lacquer streak
    g.globalCompositeOperation = 'lighter';
    [[L - 26, .34], [26, .3], [L / 2, .1]].forEach(([z, a]) => {
      const e = ellipseAt(g, 0, 0, z, 46);
      const rg = g.createRadialGradient(e.p.x, e.p.y, 0, e.p.x, e.p.y, Math.max(e.rx, 1));
      rg.addColorStop(0, `rgba(255,196,140,${a})`); rg.addColorStop(1, 'rgba(255,196,140,0)');
      g.save(); g.translate(e.p.x, e.p.y); g.scale(1, Math.max(.05, e.ry / Math.max(e.rx, .1))); g.translate(-e.p.x, -e.p.y);
      g.fillStyle = rg; g.beginPath(); g.arc(e.p.x, e.p.y, e.rx, 0, 7); g.fill(); g.restore();
    });
    const s0 = P(-6, 0, zn), s1 = P(6, 0, zn), s2 = P(3, 0, L), s3 = P(-3, 0, L);
    const sg = g.createLinearGradient(0, s2.y, 0, s0.y); sg.addColorStop(0, 'rgba(255,255,255,.07)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    quad(g, [s0, s1, s2, s3]); g.fillStyle = sg; g.fill();
    g.globalCompositeOperation = 'source-over';
    // centre line + end circles in each player's colour
    const c0 = P(-hw, .05, L / 2), c1 = P(hw, .05, L / 2);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(c0.x, c0.y); g.lineTo(c1.x, c1.y); g.stroke();
    g.restore();
    // neon LED rails along both edges: my colour on my half, theirs on theirs
    g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    [[Math.max(0, zn), L / 2, seatCol(me)], [L / 2, L, seatCol(1 - me)]].forEach(([za, zb, col]) => {
      [-hw, hw].forEach(x => {
        const a = P(x, 0, za), b = P(x, 0, zb);
        [[9, .10], [4.5, .25], [1.6, .95]].forEach(([w, al]) => {
          g.strokeStyle = hexA(col, al); g.lineWidth = w * Math.min(2.2, Math.max(.5, (a.k + b.k) / 8));
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        });
      });
    });
    g.globalCompositeOperation = 'source-over';
  }

  function cupsFor(side) {
    const st = S.st, A = S.anim;
    if (A && A.target === side) {
      if (A.k === 'r') {
        const t = ease(clamp(A.t / (A.dur - 12), 0, 1)), to = {}; A.to.forEach(c => { to[c.i] = c; });
        return A.prev.map(c => { const d = to[c.i] || c; return { i: c.i, x: lerp(c.x, d.x, t), z: lerp(c.z, d.z, t), hop: Math.sin(t * Math.PI) * 7 }; });
      }
      return A.prev.filter(c => !A.gone[c.i]);
    }
    const Lx = st.last;
    if (Lx && Lx.id > S.doneId && Lx.target === side && (!A || A.id !== Lx.id)) return Lx.prev;   // queued: don't spoil it
    return st.cups[side];
  }
  function drawScene(g, st) {
    const items = [], me = S.ctx.me, A = S.anim;
    const fireT = [0, 1].map(s => st.streak[s] >= ON_FIRE && (st.phase === 'play' || st.phase === 'rebuttal'));
    [0, 1].forEach(side => {
      cupsFor(side).forEach(c => {
        const v = cupView(side, c);
        items.push({ d: depth(CH, v.z), k: 'cup', i: c.i, x: v.x, z: v.z, owner: side, hop: c.hop || 0, hot: fireT[1 - side] && st.turn === 1 - side });
      });
    });
    // shadow + neon footprint under every standing cup first (on the table plane)
    items.forEach(it => {
      ellipseAt(g, it.x + .8, .02, it.z + 1.2, CR * 1.15); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill();
      g.globalCompositeOperation = 'lighter';
      ellipseAt(g, it.x, .03, it.z, CR * 1.32); g.strokeStyle = hexA(seatCol(it.owner), it.hot ? .75 : .32); g.lineWidth = it.hot ? 2.2 : 1.3; g.stroke();
      g.globalCompositeOperation = 'source-over';
    });
    S.pops.forEach(p => items.push({ d: depth(CH, p.z), k: 'pop', p }));
    const inside = A && A.k === 't' && A.inCup != null ? A.inCup : null;      // the ball is in the drink
    if (A && A.k === 't' && inside == null) {
      const b = A.ball;
      items.push({ d: depth(b[1], b[2]), k: 'ball', b, fire: !!A.L.gl });
      if (b[1] > -1 && b[0] > -TW / 2 && b[0] < TW / 2 && b[2] > 0 && b[2] < L) {    // its shadow on the table
        const h = Math.max(0, b[1]);
        ellipseAt(g, b[0], .05, b[2], BR * (1 + h / 70)); g.fillStyle = `rgba(0,0,0,${.5 * clamp(1 - h / 110, .15, 1)})`; g.fill();
        if (A.L.gl) { g.globalCompositeOperation = 'lighter'; ellipseAt(g, b[0], .05, b[2], BR * 4); g.fillStyle = `rgba(255,140,40,${.2 * clamp(1 - h / 80, 0, 1)})`; g.fill(); g.globalCompositeOperation = 'source-over'; }
      }
    }
    // the partner's ball waiting at the far end (they're up)
    if (!A && S.ctx.status === 'active' && st.turn !== me && (st.phase === 'play' || st.phase === 'rebuttal')) {
      const b = [0, 15, L + 3];
      items.push({ d: depth(b[1], b[2]), k: 'ball', b, idle: true, fire: fireT[1 - me] });
    }
    items.sort((a, b) => b.d - a.d);
    items.forEach(it => {
      if (it.k === 'cup') drawCup(g, it.x, it.z, it.owner, { lift: it.hop, ballIn: inside === it.i ? A.ball : null });
      else if (it.k === 'pop') {
        const p = it.p, t = p.t / p.max;
        drawCup(g, p.x + p.dir * t * 12, p.z + t * 5, p.owner, { lift: Math.sin(Math.min(1, t * 1.25) * Math.PI) * 20 + t * 5, sc: 1 - t * .4, alpha: 1 - ease(t), ball: p.ball && t < .4 });
      } else drawBall(g, it.b, it.fire, it.idle);
    });
  }

  function ring(cx, y, cz, r) { const out = []; for (let i = 0; i < N; i++) out.push(P(cx + r * CS[i], y, cz + r * SN[i])); return out; }
  function drawCup(g, cx, cz, owner, o) {
    o = o || {};
    const lift = o.lift || 0, sc = o.sc || 1, R = CR * sc, Rb = CB * sc, H = CH * sc;
    const rim = ring(cx, lift + H, cz, R), bot = ring(cx, lift, cz, Rb), ctr = P(cx, lift + H, cz), px = ctr.k;
    if (ctr.zc < 12) return;
    g.globalAlpha = o.alpha == null ? 1 : Math.max(0, o.alpha);
    // body
    g.beginPath();
    NEAR.forEach((i, j) => j ? g.lineTo(rim[i].x, rim[i].y) : g.moveTo(rim[i].x, rim[i].y));
    NEAR_R.forEach(i => g.lineTo(bot[i].x, bot[i].y));
    g.closePath();
    const lx = rim[N / 2].x, rx = rim[0].x, bg = g.createLinearGradient(lx, 0, rx, 0);
    bg.addColorStop(0, '#5c0712'); bg.addColorStop(.18, '#c21f30'); bg.addColorStop(.33, '#ff6e74'); bg.addColorStop(.45, '#e0293a');
    bg.addColorStop(.8, '#9a1222'); bg.addColorStop(1, '#4a050e');
    g.fillStyle = bg; g.fill();
    // bottom band + ridges (the solo-cup look)
    [[.16, .5], [.3, .35], [.72, .22]].forEach(([f, a]) => {
      const rr = ring(cx, lift + H * f, cz, Rb + (R - Rb) * f);
      g.beginPath(); NEAR.forEach((i, j) => j ? g.lineTo(rr[i].x, rr[i].y) : g.moveTo(rr[i].x, rr[i].y));
      g.strokeStyle = `rgba(70,0,10,${a})`; g.lineWidth = Math.max(.6, .35 * px); g.stroke();
    });
    // rim light in the owner's colour (neon bar) on the right edge
    g.globalCompositeOperation = 'lighter';
    g.beginPath(); g.moveTo(rim[1].x, rim[1].y); g.lineTo(bot[1].x, bot[1].y);
    g.strokeStyle = hexA(seatCol(owner), .5); g.lineWidth = Math.max(.8, .45 * px); g.stroke();
    g.globalCompositeOperation = 'source-over';
    // mouth: white inside, the drink, the rolled lip
    g.beginPath(); rim.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
    const far = rim[N / 4].y, nea = rim[N * 3 / 4].y, ig = g.createLinearGradient(0, far, 0, nea);
    ig.addColorStop(0, '#fbf3f3'); ig.addColorStop(1, '#bfa9ad');
    g.fillStyle = ig; g.fill();
    g.save(); g.clip();
    const lr = (Rb + (R - Rb) * LIQ / CH) * .99, lq = ring(cx, lift + LIQ * sc, cz, lr);
    g.beginPath(); lq.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
    const lg = g.createLinearGradient(0, lq[N / 4].y, 0, lq[N * 3 / 4].y);
    lg.addColorStop(0, '#ffcf6a'); lg.addColorStop(1, '#c46a12');
    g.fillStyle = lg; g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)'; const hl = P(cx - R * .25, lift + LIQ * sc + .02, cz + R * .2);
    g.beginPath(); g.ellipse(hl.x, hl.y, Math.max(.5, R * .22 * px), Math.max(.3, R * .08 * px), 0, 0, 7); g.fill();
    if (o.ball) { const bp = P(cx, lift + LIQ * sc + BR * .8, cz); drawBallAt(g, bp.x, bp.y, BR * bp.k * sc, false); }
    if (o.ballIn) { const b = o.ballIn, bp = P(b[0], b[1], b[2]); drawBallAt(g, bp.x, bp.y, BR * bp.k, !!(S.anim && S.anim.L && S.anim.L.gl)); }
    // shade the near inner wall
    const sh = g.createLinearGradient(0, nea, 0, nea - (nea - far) * .55);
    sh.addColorStop(0, 'rgba(60,20,30,.35)'); sh.addColorStop(1, 'rgba(60,20,30,0)');
    g.fillStyle = sh; g.fillRect(lx - 2, far - 2, rx - lx + 4, nea - far + 4);
    g.restore();
    g.beginPath(); rim.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath();
    g.strokeStyle = '#fff5f5'; g.lineWidth = Math.max(1, .75 * px); g.stroke();
    g.strokeStyle = 'rgba(120,20,30,.5)'; g.lineWidth = Math.max(.5, .22 * px);
    g.beginPath(); NEAR.forEach((i, j) => { const p = rim[i]; j ? g.lineTo(p.x, p.y + .45 * px) : g.moveTo(p.x, p.y + .45 * px); }); g.stroke();
    g.globalAlpha = 1;
  }
  function drawBallAt(g, x, y, r, fire) {
    if (fire) {
      g.globalCompositeOperation = 'lighter';
      const gl = g.createRadialGradient(x, y, 0, x, y, r * 3.4); gl.addColorStop(0, 'rgba(255,170,60,.55)'); gl.addColorStop(1, 'rgba(255,90,20,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 3.4, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    const bg = g.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
    if (fire) { bg.addColorStop(0, '#fffbe0'); bg.addColorStop(.5, '#ffd35a'); bg.addColorStop(1, '#ff7a1f'); }
    else { bg.addColorStop(0, '#ffffff'); bg.addColorStop(.6, '#f3f1ee'); bg.addColorStop(1, '#b8b6c4'); }
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, Math.max(.8, r), 0, 7); g.fill();
  }
  function drawBall(g, b, fire, idle) {
    const A = S.anim, p = P(b[0], b[1], b[2]);
    let x = p.x, y = p.y, r = BR * p.k;
    // my throw leaves the hand at the bottom of the screen and blends into the true 3D path
    if (A && A.k === 't' && !idle && A.seat === S.ctx.me && A.i < 12) {
      const t = ease(A.i / 12); x = lerp(HUD.x, x, t); y = lerp(HUD.y, y, t); r = lerp(HUD.r, r, t);
    }
    if (A && A.k === 't' && !idle) {
      g.globalCompositeOperation = 'lighter';
      if (A.trail.length && !S.calm) A.trail.forEach((q, j) => {                   // motion ghosts
        const tp = P(q[0], q[1], q[2]), a = (j + 1) / A.trail.length;
        g.fillStyle = fire ? `rgba(255,140,40,${.3 * a})` : hexA(seatCol(A.seat), .3 * a);
        g.beginPath(); g.arc(tp.x, tp.y, Math.max(1.5, BR * tp.k * (.55 + .5 * a)), 0, 7); g.fill();
      });
      const hr = Math.max(9, r * 3.2), hl = g.createRadialGradient(x, y, 0, x, y, hr);    // a halo so it reads on the wood
      hl.addColorStop(0, hexA(fire ? '#ffb13b' : seatCol(A.seat), .5)); hl.addColorStop(1, hexA(fire ? '#ffb13b' : seatCol(A.seat), 0));
      g.fillStyle = hl; g.beginPath(); g.arc(x, y, hr, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
      r = Math.max(r, 3.2);
    }
    if (idle) {
      g.globalCompositeOperation = 'lighter';
      const col = seatCol(1 - S.ctx.me), gl = g.createRadialGradient(x, y, 0, x, y, r * 4);
      gl.addColorStop(0, hexA(col, .45)); gl.addColorStop(1, hexA(col, 0)); g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 4, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
      if (fire && !S.calm) flames(g, x, y, r);
    }
    drawBallAt(g, x, y, r, fire);
  }
  function flames(g, x, y, r) {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 7; i++) {
      const ph = S.tick * .25 + i * 1.7, fx = x + Math.sin(ph) * r * .5 + (i - 3) * r * .18, fh = r * (1.6 + .9 * Math.sin(ph * 1.3 + i));
      const gr = g.createLinearGradient(fx, y, fx, y - fh * 1.6);
      gr.addColorStop(0, 'rgba(255,200,80,.55)'); gr.addColorStop(1, 'rgba(255,60,20,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(fx - r * .45, y); g.quadraticCurveTo(fx, y - fh * 2.2, fx + r * .45, y); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }

  function drawParts(g) {
    S.parts.forEach(q => {
      const a = q.life / q.max;
      if (q.k === 'drop') { const p = P(q.x, q.y, q.z); g.fillStyle = q.c; g.globalAlpha = Math.min(1, a * 1.6); g.beginPath(); g.arc(p.x, p.y, Math.max(.7, q.r * p.k), 0, 7); g.fill(); }
      else if (q.k === 'dust') { const p = P(q.x, q.y, q.z); g.fillStyle = q.c + (a * .35) + ')'; g.beginPath(); g.arc(p.x, p.y, Math.max(.6, q.r * p.k * (1.6 - a)), 0, 7); g.fill(); }
      else if (q.k === 'conf') {
        const p = P(q.x, q.y, q.z); g.save(); g.translate(p.x, p.y); g.rotate(q.rot); g.globalAlpha = Math.min(1, a * 2);
        g.fillStyle = q.c; const s = q.s * p.k; g.fillRect(-s / 2, -s * .3, s, s * .6 * (.4 + Math.abs(Math.sin(q.rot * 2)) * .6)); g.restore();
      }
    });
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    S.parts.forEach(q => {
      const a = q.life / q.max;
      if (q.k === 'spark') { const p = P(q.x, q.y, q.z); g.fillStyle = hexA(q.c, a); g.beginPath(); g.arc(p.x, p.y, Math.max(.8, .45 * p.k), 0, 7); g.fill(); }
      else if (q.k === 'flame') {
        const p = P(q.x, q.y, q.z), r = q.r * p.k * (.6 + .6 * a), gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, `rgba(255,220,120,${.7 * a})`); gr.addColorStop(.5, `rgba(255,120,30,${.45 * a})`); gr.addColorStop(1, 'rgba(255,60,20,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
      } else if (q.k === 'ring') {
        ellipseAt(g, q.x, .1, q.z, q.r1 - (q.r1 - q.r0) * a);
        g.strokeStyle = hexA(q.c, a * .9); g.lineWidth = 1 + 3 * a; g.stroke();
      } else if (q.k === 'glow') {
        const p = P(q.x, q.y, q.z), r = q.r * p.k / 3, gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, `rgba(255,255,255,${.8 * a})`); gr.addColorStop(.3, hexA(q.c, .6 * a)); gr.addColorStop(1, hexA(q.c, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
      }
    });
    g.globalCompositeOperation = 'source-over';
  }

  function drawAimGuide(g, st) {
    if (!S.drag || !S.aim || !S.aimSim) return;
    const me = S.ctx.me, lvl = clamp(1 - st.thr[me] / 8, 0, 1);   // fades out over your first 8 throws
    const pts = S.aimSim.pts, col = seatCol(me);
    // only the on-screen stretch of the arc; how much of it shows shrinks as you learn
    let first = pts.findIndex(p => P(p[0], p[1], p[2]).y < VH - 20); if (first < 0) first = 0;
    let stop = pts.length - 1; const ev0 = S.aimSim.evs[0]; if (ev0) stop = Math.min(stop, ev0.p);
    const span = stop - first, show = first + Math.round(span * (.28 + .72 * lvl));
    for (let i = first; i <= show; i += 2) {
      const p = pts[i], q = P(p[0], p[1], p[2]), t = (i - first) / Math.max(1, show - first);
      g.fillStyle = hexA(col, (.2 + .55 * lvl) * (1 - t * .75));
      g.beginPath(); g.arc(q.x, q.y, Math.max(1.2, 2.6 * (1 - t * .5)), 0, 7); g.fill();
    }
    if (lvl > .45 && show >= stop) {                                  // where it first comes down
      const p = pts[stop]; ellipseAt(g, p[0], .1, p[2], 3.2);
      g.strokeStyle = hexA('#ffffff', .5 * lvl); g.lineWidth = 1.5; g.stroke();
    }
    // power bar
    const pw = S.aim.power, x = VW - 26, y0 = VH - 150, hgt = 120;
    rr(g, x - 7, y0, 14, hgt, 7); g.fillStyle = 'rgba(5,7,15,.6)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.stroke();
    const pg = g.createLinearGradient(0, y0 + hgt, 0, y0); pg.addColorStop(0, hexA(col, .6)); pg.addColorStop(1, '#ffd66b');
    rr(g, x - 5, y0 + hgt - 2 - (hgt - 4) * pw, 10, (hgt - 4) * pw, 5); g.fillStyle = pg; g.fill();
    g.font = '800 15px Orbitron, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = '#ffd66b';
    g.fillText(Math.round(pw * 100) + '%', x - 4, y0 - 6);
  }
  function drawHudBall(g, st) {
    const c = S.ctx, me = c.me;
    if (S.anim || c.status !== 'active' || !c.isMyTurn || st.turn !== me || (st.phase !== 'play' && st.phase !== 'rebuttal')) return;
    let x = HUD.x, y = HUD.y;
    if (S.drag) { x += clamp(S.drag.x - S.drag.x0, -60, 60) * VW / S.drag.W * .35; y -= clamp(S.drag.y0 - S.drag.y, 0, 200) * VH / S.drag.H * .12; }
    const fire = st.streak[me] >= ON_FIRE;
    g.globalCompositeOperation = 'lighter';
    const gl = g.createRadialGradient(x, y, 0, x, y, HUD.r * 2.6); gl.addColorStop(0, hexA(seatCol(me), .35)); gl.addColorStop(1, hexA(seatCol(me), 0));
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, HUD.r * 2.6, 0, 7); g.fill();
    g.globalCompositeOperation = 'source-over';
    if (fire && !S.calm) flames(g, x, y, HUD.r);
    drawBallAt(g, x, y, HUD.r, fire);
    if (!S.drag && st.thr[me] < 4) {                                   // a quiet "swipe up" chevron for the first throws
      g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 3; g.lineCap = 'round';
      [0, 1].forEach(j => { const yy = y - HUD.r - 16 - j * 12; g.beginPath(); g.moveTo(x - 10, yy + 6); g.lineTo(x, yy - 3); g.lineTo(x + 10, yy + 6); g.stroke(); });
    }
  }
  function drawFloats(g) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    S.floats.forEach(f => {
      const age = 1 - f.life / f.max, p = P(f.x, f.y + age * 14, f.z), a = Math.min(1, f.life / 22);
      const sc = age < .12 ? .5 + age * 4.2 : 1, size = Math.round((f.big ? 34 : 24) * sc);
      g.font = `900 ${size}px Orbitron, system-ui, sans-serif`; g.globalAlpha = a;
      g.lineWidth = 6; g.strokeStyle = 'rgba(5,7,15,.85)'; g.strokeText(f.text, p.x, p.y);
      g.fillStyle = f.c; g.fillText(f.text, p.x, p.y); g.globalAlpha = 1;
    });
  }
  function drawVignette(g) {
    if (!S.vig) { const v = g.createRadialGradient(VW / 2, VH * .45, VH * .3, VW / 2, VH * .5, VH * .78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); S.vig = v; }
    g.fillStyle = S.vig; g.fillRect(0, 0, VW, VH);
  }
  function drawHud(g, st) {
    const c = S.ctx, me = c.me;
    if (c.status !== 'active' || (st.phase !== 'play' && st.phase !== 'rebuttal')) return;
    const A = S.anim, turn = st.turn, who = seatName(turn), col = seatCol(turn);
    // pill: whose throw, which ball, fire
    const reb = st.phase === 'rebuttal';
    const shown = A && A.k === 't' ? null : st;                         // freeze during a replay
    if (!shown) return;
    const label = reb ? `${who.toUpperCase()} · REBUTTAL` : `${who.toUpperCase()} · BALL ${st.thrown + 1}/2`;
    g.font = '800 19px Orbitron, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    // on my turn the top is empty wall; on theirs the far rack is up there, so the pill drops to the bottom
    const w = g.measureText(label).width + 40, x = VW / 2, y = turn === me ? 32 : VH - 40;
    rr(g, x - w / 2, y - 18, w, 36, 18); g.fillStyle = 'rgba(5,7,15,.66)'; g.fill(); g.strokeStyle = hexA(col, .65); g.lineWidth = 1.6; g.stroke();
    g.fillStyle = col; g.fillText(label, x, y + 1);
    if (st.streak[turn] >= ON_FIRE) {
      const fy = turn === me ? y + 40 : y - 40;
      rr(g, x - 64, fy - 14, 128, 28, 14); g.fillStyle = 'rgba(255,120,30,.25)'; g.fill(); g.strokeStyle = 'rgba(255,170,60,.8)'; g.stroke();
      g.font = '900 16px Orbitron, system-ui, sans-serif'; g.fillStyle = '#ffc261'; g.fillText('ON FIRE', x, fy + 1);
    }
  }
  function drawBanner(g) {
    let B = S.banner;
    const st = S.st, c = S.ctx;
    if (!B && !S.anim && c && st && (c.status === 'finished' || st.phase === 'done') && st.fin !== -1) {    // the final word stays up
      B = st.fin === 'draw' ? { text: 'DRAW', sub: 'rebuttal cleared the table', c: '#ffd66b', t: 40, dur: 1e9 }
        : { text: `${seatName(st.fin).toUpperCase()} WINS`, sub: `with ${st.cups[st.fin].length} cup${st.cups[st.fin].length === 1 ? '' : 's'} to spare`, c: seatCol(st.fin), t: 40, dur: 1e9 };
    }
    if (!B) return;
    const t = B.t, a = t < 10 ? t / 10 : t > B.dur - 16 ? (B.dur - t) / 16 : 1, sc = t < 12 ? .6 + .4 * ease(t / 12) + Math.sin(t / 12 * Math.PI) * .08 : 1;
    const y = VH * .4;
    g.save(); g.globalAlpha = Math.max(0, a);
    const band = g.createLinearGradient(0, y - 70, 0, y + 70); band.addColorStop(0, 'rgba(5,4,12,0)'); band.addColorStop(.5, 'rgba(5,4,12,.72)'); band.addColorStop(1, 'rgba(5,4,12,0)');
    g.fillStyle = band; g.fillRect(0, y - 70, VW, 140);
    g.translate(VW / 2, y); g.scale(sc, sc);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 64; g.font = `900 ${size}px Orbitron, system-ui, sans-serif`;
    while (g.measureText(B.text).width > VW * .86 && size > 30) { size -= 4; g.font = `900 ${size}px Orbitron, system-ui, sans-serif`; }
    g.globalCompositeOperation = 'lighter';
    [[16, .16], [8, .3]].forEach(([w, al]) => { g.lineWidth = w; g.strokeStyle = hexA(B.c, al); g.strokeText(B.text, 0, -8); });
    g.globalCompositeOperation = 'source-over';
    g.lineWidth = 3; g.strokeStyle = 'rgba(5,7,15,.9)'; g.strokeText(B.text, 0, -8);
    g.fillStyle = '#fff'; g.fillText(B.text, 0, -8);
    g.lineWidth = 1.6; g.strokeStyle = B.c; g.strokeText(B.text, 0, -8);
    if (B.sub) { g.font = '700 19px "Chakra Petch", system-ui, sans-serif'; g.fillStyle = B.c; g.fillText(B.sub, 0, 38); }
    g.restore();
  }

  /* ---------------- tiny helpers ---------------- */
  function rr(g, x, y, w, h, r) {
    if (w <= 0 || h <= 0) { g.beginPath(); return; } r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xffffff; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hexA(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`; }

  // a timeout can leave a rebuttal decided but not closed (skipTurn can't end a match). The turn-holder
  // (the winner) closes it at once; the other phone after a grace, so an absent winner can't strand it.
  const SETTLE_GRACE = 2500;
  function settle(st, first) {
    const key = st.seed + ':' + st.n + ':' + st.fin + ':' + first;
    if (S.settleKey === key) return;
    S.settleKey = key;
    setTimeout(() => {
      const c = S.ctx; if (!c || c.status !== 'active' || S.anim) return;
      const cur = norm(c.state); if (cur.seed !== st.seed || cur.phase !== 'done' || cur.fin === -1) return;
      c.commit(cloneSt(cur), cur.fin);
    }, first ? 0 : SETTLE_GRACE);
  }

  /* ---------------- registration ---------------- */
  const DEF = {
    id: 'cup-pong', name: 'Cup Pong', emoji: '🏓', category: 'Arcade', accent: '#ff5a5f',
    tagline: 'Flick the ball · sink all 10 of their cups.',
    // the last throw is still flying when the match finishes — hold the result card until it lands
    resultDelay: () => { const ms = remainingMs(); return ms ? Math.min(4500, ms + 350) : 0; },
    // timer ran out ("Chance gone"): the rest of the turn is lost, the streak with it. In a rebuttal
    // a timeout counts as the miss — the shooter who cleared the cups wins (closed by settle()).
    skipTurn: (st, opp) => {
      const s = cloneSt(st);
      if (s.phase === 'rebuttal') { s.phase = 'done'; s.fin = s.reb; s.turn = opp; s.note = 'timeout'; return s; }
      if (s.phase === 'done') return s;
      s.streak[1 - opp] = 0; s.turn = opp; s.thrown = 0; s.sunk = 0; s.note = 'skip';
      return s;
    },
    init: host => {
      const rack = () => formation(10).map((c, i) => ({ i, x: c.x, z: c.z }));
      return { seed: 1 + ((Math.random() * 2147483646) | 0), turn: host, phase: 'play', cups: [rack(), rack()],
        thrown: 0, sunk: 0, streak: [0, 0], rr: [0, 0], thr: [0, 0], reb: -1, fin: -1, n: 0, clk: 0, last: null, note: '',
        mid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) };
    },
    test: {
      readSeen, simulate, inputFrom, resolve, rackState, canRack, formation, arrange, backMost, toThrower, norm, sameLayout,
      L, TW, CR, CH, BR, REL, VMIN, VMAX, ON_FIRE, S, CAM, P: (x, y, z) => P(x, y, z),
      launch: a => launch(a), rack: () => doRack(), canAct: () => canAct(), remainingMs: () => remainingMs(),
      replay: () => ({ anim: S.anim ? { id: S.anim.id, k: S.anim.k, i: S.anim.i, n: S.anim.pts ? S.anim.pts.length : 0, done: !!S.anim.done, tail: S.anim.tail || 0, t: S.anim.t || 0, snapped: !!S.anim.snapped, gone: Object.keys(S.anim.gone || {}).map(Number) } : null, doneId: S.doneId, raf: !!S.raf, parts: S.parts.length }),
    },

    render(ctx) {
      const st = norm(ctx.state), me = ctx.me, foe = 1 - me;
      ctx.state = st;
      if (st.seed !== S.seed || st.mid !== S.mid || st.n < S.doneId) resetScene(st);
      S.ctx = ctx; S.st = st;
      if (S.lockN != null && st.n !== S.lockN) S.lockN = null;
      ensureCanvas();
      if (S.aimK === 1) calibrate();
      maybeReplay(st);

      // cups left for the turn bar: frozen at pre-throw values until the throw lands
      const shown = [0, 1].map(s => cupsFor(s).length);
      const wrap = ctx.h('div', { class: 'cp-wrap' });
      ctx.root.append(ctx.turnBar({ scores: shown }), wrap);
      wrap.append(S.cv);                                         // the SAME canvas every repaint
      const row = ctx.h('div', { class: 'cp-row' });
      const hint = ctx.h('div', { class: 'cp-hint' });
      const live = canAct(), fire = st.streak[me] >= ON_FIRE, reb = st.phase === 'rebuttal';
      const pending = !!(S.anim || (st.last && st.last.id > S.doneId));
      let html;
      if (ctx.status === 'finished' || st.phase === 'done') {
        const f = st.fin;
        html = f === 'draw' ? '🤝 <b>Draw</b> — the rebuttal cleared every cup.'
          : f === 0 || f === 1 ? `🏆 <b>${esc(seatName(f))}</b> wins · ${esc(seatName(1 - f))} had ${st.cups[f].length} cup${st.cups[f].length === 1 ? '' : 's'} to go`
          : 'Game over.';
      } else if (pending) {
        const A = S.anim, sh = A ? A.seat : (st.last ? st.last.seat : foe);
        html = A && A.k === 'r' ? `🔺 Re-racking…` : sh === me ? '🏓 In the air…' : `🏓 <b>${esc(seatName(sh))}</b> threw — incoming!`;
      } else if (ctx.isMyTurn && st.turn === me) {
        html = reb ? `🔥 <b>REBUTTAL</b> — sink every throw. Clear all ${st.cups[foe].length} to force a draw.`
          : `Ball <b>${st.thrown + 1}/2</b> · <span class="cp-up">↑</span> swipe up — longer swipe = harder throw`;
        if (fire) html += ' · <span class="cp-fire">ON FIRE</span>';
        if (st.note === 'skip' && st.thrown === 0) html = '⏱ Their time ran out — your turn. ' + html;
      } else {
        html = reb ? `⏳ <b>${esc(seatName(foe))}</b>'s rebuttal — one miss and you win.`
          : `⏳ <b>${esc(seatName(foe))}</b> is throwing (ball ${st.thrown + 1}/2) — your cups are up close.`;
        if (st.note === 'skip' && st.thrown === 0 && st.turn !== me) html = '⏱ Time ran out — turn passed. ' + html;
      }
      hint.innerHTML = html;
      const rrUsed = !!st.rr[me], can = live && canRack(st, me);
      const armed = S.rackArm && Date.now() - S.rackArm < 3500;
      const rrBtn = ctx.h('button', {
        class: 'cp-rr' + (armed && can ? ' armed' : ''), type: 'button', disabled: can ? null : '',
        title: 'Re-form the cups you are aiming at into a tight shape (once per game, before your first throw)',
        onclick: () => {
          if (!canAct() || !canRack(S.st, S.ctx.me)) return;
          if (S.rackArm && Date.now() - S.rackArm < 3500) { doRack(); return; }
          S.rackArm = Date.now(); try { ctx.sound.tap(); } catch (e) {}
          rerender();
          setTimeout(() => { if (S.rackArm && Date.now() - S.rackArm >= 3500) { S.rackArm = 0; rerender(); } }, 3600);
        },
      }, rrUsed ? 'Re-rack used' : armed && can ? 'Tap to confirm' : '🔺 Re-rack');
      row.append(hint);
      if (ctx.status !== 'finished' && st.phase !== 'done') row.append(rrBtn);
      wrap.append(row);
      fit(); draw(); ensureLoop();                               // paint now: a hidden page gets a frame too

      if (st.phase === 'done' && ctx.status === 'active' && !S.anim) settle(st, ctx.isMyTurn);
    },
  };
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  Games.register(DEF);
})();
