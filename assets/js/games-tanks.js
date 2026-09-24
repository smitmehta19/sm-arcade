/* ============================================================
   POCKET TANKS — turn-based artillery on destructible terrain.

   Faithful to the original's shape rather than another HP duel:
   you each get the SAME six-weapon arsenal, fire every weapon once,
   and score points for the damage you deal. Highest total wins.
   Weapons: Shell · Big Bertha · Triple Shot · Cluster · Sniper ·
   Dirt Wall (no damage — heaps a hill to hide behind or bury them).
   3 tank moves each per match; moving doesn't cost your turn.

   Determinism: the THROWER resolves the shot (resolveShot is a pure
   function of terrain, tanks, weapon, angle, power, wind) and commits
   the resulting terrain + scores. The partner replays the identical
   resolution from `last.prev` for the animation, then snaps to the
   committed terrain, so engine float differences can never desync.

   Rendering lives in a MODULE-LEVEL scene: one persistent <canvas>
   and one animation loop that survive the stage's repaints (render()
   just re-attaches the same canvas). Fleabag taught us why: a repaint
   mid-animation used to kill the arc (CONTEXT: HIDDEN PAGES DO NOT
   ANIMATE). Here nothing is lost — the loop simply keeps drawing.
   ============================================================ */
(function () {
  const css = `
  .pt-wrap{ display:flex; flex-direction:column; gap:9px; }
  .pt-cv{ width:100%; display:block; border-radius:var(--r-3); border:1px solid var(--glass-brd);
    box-shadow:var(--shadow-soft), 0 0 0 1px rgba(0,0,0,.25) inset; background:#060818; touch-action:none; }
  .pt-rail{ display:flex; gap:7px; overflow-x:auto; scrollbar-width:none; padding:1px 1px 3px;
    scroll-snap-type:x proximity; -webkit-overflow-scrolling:touch; }
  .pt-rail::-webkit-scrollbar{ display:none; }
  .pt-wpn{ flex:0 0 auto; width:82px; padding:9px 5px 8px; border-radius:var(--r-2); position:relative;
    background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); text-align:center;
    scroll-snap-align:start; transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), box-shadow var(--dur-2), opacity var(--dur-2); }
  .pt-wpn svg{ width:26px; height:26px; display:block; margin:0 auto 5px; filter:drop-shadow(0 0 6px currentColor); }
  .pt-wpn b{ display:block; font-size:10.5px; letter-spacing:.2px; line-height:1.25; }
  .pt-wpn small{ display:block; font-size:9.5px; color:var(--ink-faint); margin-top:2px; }
  .pt-wpn.sel{ border-color:var(--gold); box-shadow:0 0 0 1px var(--gold), 0 0 18px -4px var(--gold); }
  .pt-wpn.used{ opacity:.3; }
  .pt-wpn.used small{ visibility:hidden; }
  .pt-wpn.used::after{ content:'USED'; position:absolute; left:0; right:0; bottom:8px; font-size:8.5px;
    letter-spacing:1.6px; color:var(--ink-dim); font-weight:700; }
  .pt-wpn:not(:disabled):active{ transform:scale(.94); }
  .pt-ctrl{ display:grid; grid-template-columns:1fr 1fr; gap:7px; }
  .pt-step{ display:grid; grid-template-columns:36px 1fr 36px; align-items:center; gap:4px; padding:5px;
    border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); }
  .pt-step.wide{ grid-column:1/-1; }
  .pt-step button{ height:36px; border-radius:10px; background:var(--bg-2); border:1px solid var(--line);
    color:var(--ink); font-size:17px; font-weight:800; touch-action:manipulation;
    transition:transform var(--dur-1) var(--spring), opacity var(--dur-2); }
  .pt-step button:not(:disabled):active{ transform:scale(.9); }
  .pt-step button:disabled{ opacity:.3; }
  .pt-val{ text-align:center; line-height:1.1; }
  .pt-val small{ display:block; font-size:8.5px; letter-spacing:1.6px; color:var(--ink-faint); font-weight:700; }
  .pt-val b{ font-family:var(--font-num); font-size:18px; font-weight:800; }
  .pt-fire{ width:100%; padding:14px 10px; border-radius:var(--r-2); border:none; font-family:var(--font-display);
    font-weight:800; letter-spacing:1.4px; font-size:13.5px; color:#1d0a12;
    background:linear-gradient(135deg,#ffd66b,#ff8a3d 52%,#ff4d9d); box-shadow:0 10px 26px -10px rgba(255,122,61,.85);
    transition:transform var(--dur-1) var(--spring), opacity var(--dur-2), filter var(--dur-2); }
  .pt-fire.ready{ animation:ptPulse 1.8s ease-in-out infinite; }
  .pt-fire:not(:disabled):active{ transform:scale(.97); }
  .pt-fire:disabled{ opacity:.36; filter:grayscale(.7); }
  @keyframes ptPulse{ 0%,100%{ box-shadow:0 10px 26px -10px rgba(255,122,61,.8); } 50%{ box-shadow:0 12px 34px -6px rgba(255,122,61,1); } }
  .pt-hint{ text-align:center; font-size:12px; color:var(--ink-dim); line-height:1.5; min-height:18px; }
  .pt-hint b{ color:var(--ink); }
  @media (prefers-reduced-motion: reduce){ .pt-fire.ready{ animation:none; } }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------------- world ---------------- */
  const VW = 1000, VH = 600, STEP = 5, COLS = VW / STEP + 1;   // 201 surface samples
  const GRAV = 900, WIND_K = 160, MAX_POW = 900;
  const SKY_MIN = 90;                                           // dirt can't heap higher than this
  const PIVOT_H = 25, HULL_H = 14, TANK_R = 26, BARREL = 33;    // tank geometry (world units)
  const SHOTS = 6;
  const HOME = [150, 850];

  const WEAPONS = {
    shell:   { name: 'Shell',       stat: '30 dmg',      col: '#ffb45e', r: 34, max: 30 },
    bertha:  { name: 'Big Bertha',  stat: '45 dmg · huge', col: '#ff7a3d', r: 66, max: 45 },
    triple:  { name: 'Triple Shot', stat: '3 × 18',      col: '#ffd66b', r: 26, max: 18, spread: 0.075 },
    cluster: { name: 'Cluster',     stat: '16 + 5 × 11', col: '#ff4d9d', r: 28, max: 16, kids: 5, kidR: 22, kidMax: 11 },
    sniper:  { name: 'Sniper',      stat: '48 · no wind', col: '#2fe6ff', r: 18, max: 48, speed: 1.45, noWind: true },
    dirt:    { name: 'Dirt Wall',   stat: 'builds a hill', col: '#c89a64', r: 60, max: 0, dirt: true },
  };
  const ORDER = ['shell', 'bertha', 'triple', 'cluster', 'sniper', 'dirt'];
  const WICON = {
    shell: '<circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="7.6" opacity=".4"/>',
    bertha: '<circle cx="11" cy="13.4" r="6.6" fill="currentColor" stroke="none"/><path d="M15.4 8.6l2.2-2.6"/><path d="M19 2.8l.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5 1.6-.5z" fill="currentColor"/>',
    triple: '<circle cx="5.6" cy="15.5" r="2.7" fill="currentColor" stroke="none"/><circle cx="12" cy="8.5" r="2.7" fill="currentColor" stroke="none"/><circle cx="18.4" cy="15.5" r="2.7" fill="currentColor" stroke="none"/>',
    cluster: '<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/><circle cx="12" cy="4.3" r="1.6" fill="currentColor" stroke="none"/><circle cx="19.3" cy="9.6" r="1.6" fill="currentColor" stroke="none"/><circle cx="16.6" cy="18.3" r="1.6" fill="currentColor" stroke="none"/><circle cx="7.4" cy="18.3" r="1.6" fill="currentColor" stroke="none"/><circle cx="4.7" cy="9.6" r="1.6" fill="currentColor" stroke="none"/>',
    sniper: '<circle cx="12" cy="12" r="7"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    dirt: '<path d="M2.5 19.5C5 12.4 8 8.6 12 8.6s7 3.8 9.5 10.9z" fill="currentColor" stroke="none"/><path d="M8.4 14h.8M13.2 12.2h.8M15.6 15.6h.8" stroke="#2a1a10" stroke-width="2"/>',
  };
  const wIcon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${WICON[k]}</svg>`;

  /* ---------------- pure logic (the part that must agree on both phones) ---------------- */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Generated ONCE by the host and stored in state, so trig differences between
  // phone engines can never produce two different battlefields.
  function genTerrain(seed) {
    const r = rng(seed), t = new Array(COLS);
    const p = [r(), r(), r()].map(v => v * Math.PI * 2);
    const a = [55 + r() * 45, 22 + r() * 26, 8 + r() * 10];
    const hill = 70 + r() * 110, hx = 0.44 + r() * 0.12, hw = 0.1 + r() * 0.06;
    const base = 440 + r() * 40;
    for (let i = 0; i < COLS; i++) {
      const u = i / (COLS - 1);
      let y = base - a[0] * Math.sin(u * Math.PI * 1.7 + p[0]) - a[1] * Math.sin(u * Math.PI * 4.3 + p[1]) - a[2] * Math.sin(u * Math.PI * 11 + p[2]);
      y -= hill * Math.exp(-Math.pow((u - hx) / hw, 2));          // a ridge in the middle: you have to lob
      t[i] = Math.max(190, Math.min(560, y));
    }
    HOME.forEach(px => {                                           // level pads under both tanks
      const c = Math.round(px / STEP), lvl = t[c];
      for (let k = -9; k <= 9; k++) { const i = c + k; if (i >= 0 && i < COLS) { const w = Math.max(0, 1 - Math.abs(k) / 10); t[i] = t[i] * (1 - w) + lvl * w; } }
    });
    return t.map(v => Math.round(v * 10) / 10);
  }
  function surfaceAt(t, x) {
    if (x <= 0) return t[0];
    if (x >= VW) return t[COLS - 1];
    const f = x / STEP, i = Math.floor(f), k = f - i;
    return t[i] * (1 - k) + t[i + 1] * k;
  }
  // tank sits on the surface and tilts with the slope; pivot = where the barrel mounts
  function tankPose(t, x) {
    const y = surfaceAt(t, x);
    const tilt = Math.atan2(surfaceAt(t, x + 16) - surfaceAt(t, x - 16), 32);
    const s = Math.sin(tilt), c = Math.cos(tilt);
    return { x, y, tilt, cx: x + HULL_H * s, cy: y - HULL_H * c, px: x + PIVOT_H * s, py: y - PIVOT_H * c };
  }
  function carve(t, cx, cy, r) {                 // dirt above the hole collapses into it
    const i0 = Math.max(0, Math.floor((cx - r) / STEP)), i1 = Math.min(COLS - 1, Math.ceil((cx + r) / STEP));
    for (let i = i0; i <= i1; i++) {
      const dx = i * STEP - cx; if (Math.abs(dx) >= r) continue;
      const half = Math.sqrt(r * r - dx * dx);
      const gone = Math.max(0, Math.min(cy + half, VH) - Math.max(cy - half, t[i]));
      t[i] = Math.min(VH - 4, t[i] + gone);
    }
  }
  function addDirt(t, cx, r) {
    const i0 = Math.max(0, Math.floor((cx - r) / STEP)), i1 = Math.min(COLS - 1, Math.ceil((cx + r) / STEP));
    for (let i = i0; i <= i1; i++) {
      const dx = i * STEP - cx; if (Math.abs(dx) >= r) continue;
      t[i] = Math.max(SKY_MIN, t[i] - Math.sqrt(r * r - dx * dx) * 1.6);
    }
  }
  // one projectile's flight; `seat` skips its own tank for the first few steps so
  // a shell can't clip the barrel it just left (-1 = bomblet, hits anything)
  function flight(t, tanks, seat, x, y, ang, spd, wind, noWind, maxSteps) {
    let vx = Math.cos(ang) * spd, vy = Math.sin(ang) * spd;
    const pts = [[x, y]], dt = 1 / 120, poses = tanks.map(tk => tankPose(t, tk.x));
    const lim = maxSteps || 1800;
    for (let i = 0; i < lim; i++) {
      if (!noWind) vx += wind * WIND_K * dt;
      vy += GRAV * dt; x += vx * dt; y += vy * dt;
      pts.push([x, y]);
      if (x < -60 || x > VW + 60 || y > VH + 60) return { pts, hit: null };
      for (let k = 0; k < 2; k++) {
        if (k === seat && i < 14) continue;
        if (Math.hypot(x - poses[k].cx, y - poses[k].cy) < TANK_R) return { pts, hit: { x, y } };
      }
      if (x >= 0 && x <= VW && y >= surfaceAt(t, x)) return { pts, hit: { x, y: surfaceAt(t, x) } };
    }
    return { pts, hit: null };
  }
  function muzzle(t, x, ang) {
    const p = tankPose(t, x);
    return { x: p.px + Math.cos(ang) * (BARREL + 3), y: p.py + Math.sin(ang) * (BARREL + 3) };
  }
  // The whole shot, resolved. Pure: same inputs → same terrain, same points.
  function resolveShot(st, seat, wk, ang, pow) {
    const W = WEAPONS[wk], wind = st.wind, t = st.terrain.slice(), tanks = st.tanks;
    const spd = Math.min(MAX_POW, pow) * (W.speed || 1);
    const o = muzzle(t, tanks[seat].x, ang);
    const flights = [], booms = [], pending = [], gain = [0, 0];
    (W.spread ? [ang - W.spread, ang, ang + W.spread] : [ang]).forEach(a => {
      const f = flight(t, tanks, seat, o.x, o.y, a, spd, wind, W.noWind);
      flights.push({ pts: f.pts, t0: 0, col: W.col });
      if (f.hit) pending.push({ t: f.pts.length, x: f.hit.x, y: f.hit.y, r: W.r, max: W.max, dirt: !!W.dirt, cluster: !!W.kids });
    });
    while (pending.length) {
      pending.sort((a, b) => a.t - b.t);
      const b = pending.shift();
      b.hits = [];
      if (b.dirt) addDirt(t, b.x, b.r);
      else {
        for (let k = 0; k < 2; k++) {                          // damage measured before the ground drops
          const p = tankPose(t, tanks[k].x);
          const f = 1 - Math.hypot(b.x - p.cx, b.y - p.cy) / (b.r + TANK_R);
          const pts = f > 0 ? Math.round(b.max * f) : 0;
          if (pts > 0) { gain[1 - k] += pts; b.hits.push({ victim: k, pts }); }   // own goal → points to them
        }
        carve(t, b.x, b.y, b.r);
      }
      booms.push(b);
      if (b.cluster) for (let k = 0; k < W.kids; k++) {
        const a = -Math.PI / 2 + (k - (W.kids - 1) / 2) * 0.42;
        const f = flight(t, tanks, -1, b.x, b.y - 8, a, 300, wind, false);
        flights.push({ pts: f.pts, t0: b.t, col: W.col, small: true });
        if (f.hit) pending.push({ t: b.t + f.pts.length, x: f.hit.x, y: f.hit.y, r: W.kidR, max: W.kidMax, dirt: false, cluster: false });
      }
    }
    return { terrain: t.map(v => Math.round(v * 10) / 10), gain, flights, booms };
  }
  const rollWind = () => Math.round((Math.random() * 2 - 1) * 100) / 100;
  const freshUsed = () => ORDER.reduce((o, k) => (o[k] = false, o), {});
  const winnerOf = s => s.score[0] === s.score[1] ? 'draw' : (s.score[0] > s.score[1] ? 0 : 1);
  const allFired = s => s.fired[0] >= SHOTS && s.fired[1] >= SHOTS;
  // elevation (0–180, 90 = straight up) ↔ barrel angle, mirrored per side
  const toElev = (seat, ang) => Math.round(seat === 0 ? -ang * 180 / Math.PI : 180 + ang * 180 / Math.PI);
  const fromElev = (seat, e) => (seat === 0 ? -e : -(180 - e)) * Math.PI / 180;

  /* ---------------- module-level scene (survives repaints) ---------------- */
  const S = {
    cv: null, g: null, seed: null, ctx: null, raf: 0,
    W: 0, H: 0, dpr: 1, scale: 1, bg: null, bgKey: '',
    aim: [{ ang: fromElev(0, 50), pow: 600 }, { ang: fromElev(1, 50), pow: 600 }],
    barrel: [fromElev(0, 50), fromElev(1, 50)],
    sel: [null, null], tx: HOME.slice(), shownT: null,
    anim: null, doneId: 0, parts: [], floats: [], dust: [], shake: 0, flash: [0, 0], tick: 0,
    ui: null, drag: null,
  };

  function resetScene(st) {
    S.seed = st.seed; S.doneId = 0; S.anim = null; S.parts = []; S.floats = []; S.shake = 0;
    S.tx = st.tanks.map(t => t.x); S.shownT = st.terrain.slice(); S.bgKey = '';
    S.aim = [{ ang: fromElev(0, 50), pow: 600 }, { ang: fromElev(1, 50), pow: 600 }];
    S.barrel = [S.aim[0].ang, S.aim[1].ang]; S.sel = [null, null];
    S.dust = []; for (let i = 0; i < 46; i++) S.dust.push({ x: Math.random() * VW, y: 40 + Math.random() * 360, z: .4 + Math.random() * .8 });
  }

  function ensureCanvas() {
    if (S.cv) return;
    S.cv = document.createElement('canvas'); S.cv.className = 'pt-cv';
    S.g = S.cv.getContext('2d');
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(S.cv);
    else window.addEventListener('resize', fit);
    const toV = e => { const r = S.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.width * VW }; };
    S.cv.addEventListener('pointerdown', e => {
      if (!canAct()) return;
      S.drag = toV(e);
      try { S.cv.setPointerCapture(e.pointerId); } catch (x) {}
    });
    S.cv.addEventListener('pointermove', e => {
      if (!S.drag || !canAct()) return;
      const p = toV(e), dx = S.drag.x - p.x, dy = S.drag.y - p.y, len = Math.hypot(dx, dy);
      if (len < 12) return;
      let ang = Math.atan2(dy, dx);
      if (ang > 0) ang = ang < Math.PI / 2 ? -0.035 : -Math.PI + 0.035;   // keep the barrel above the horizon
      const me = S.ctx.me;
      S.aim[me] = { ang, pow: Math.max(60, Math.min(MAX_POW, len * 3)) };
      syncReadout(); e.preventDefault();
    }, { passive: false });
    const end = () => { S.drag = null; };
    S.cv.addEventListener('pointerup', end); S.cv.addEventListener('pointercancel', end);
  }
  function canAct() {
    const c = S.ctx; return !!(c && c.isMyTurn && c.status === 'active' && !S.anim);
  }
  function fit() {
    if (!S.cv) return;
    const w = S.cv.clientWidth; if (!w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(w * VH / VW * dpr);
    S.cv.style.height = Math.round(w * VH / VW) + 'px';          // explicit height → no reflow wobble
    if (W === S.W && H === S.H) return;
    S.W = W; S.H = H; S.dpr = dpr; S.scale = w / VW;
    S.cv.width = W; S.cv.height = H; S.bgKey = '';
    draw();                       // resizing wipes the bitmap — repaint now (rotation) rather than next frame
  }
  function ensureLoop() { if (!S.raf) S.raf = requestAnimationFrame(loop); }
  function loop() {
    S.raf = 0;
    if (!S.cv || !S.cv.isConnected) return;                     // left the game — render() restarts us
    step(); draw();
    S.raf = requestAnimationFrame(loop);
  }

  /* ---------------- replay: animate a committed shot ---------------- */
  function maybeReplay(st) {
    const L = st.last;
    if (L && L.id > S.doneId && (!S.anim || S.anim.id !== L.id)) {
      const res = resolveShot({ terrain: L.prev, tanks: st.tanks, wind: L.wind }, L.seat, L.w, L.ang, L.pow);
      let end = 0;
      res.flights.forEach(f => { end = Math.max(end, f.t0 + f.pts.length); });
      res.booms.forEach(b => { end = Math.max(end, b.t); });
      S.anim = { id: L.id, seat: L.seat, w: L.w, wind: L.wind, res, clock: 0, bi: 0, end: end + 110,
        prevScore: L.prevScore || st.score, final: st.terrain.slice() };
      S.shownT = L.prev.slice(); S.barrel[L.seat] = L.ang;
      if (L.seat !== S.ctx.me) { try { S.ctx.sound.place(); } catch (e) {} }
    }
    if (!S.anim) S.shownT = st.terrain.slice();
  }
  function boom(b) {
    const T = S.shownT, big = b.r / 34;
    if (b.dirt) {
      addDirt(T, b.x, b.r);
      for (let i = 0; i < 44; i++) S.parts.push({ k: 'chunk', x: b.x + (Math.random() - .5) * b.r, y: b.y, vx: (Math.random() - .5) * 260, vy: -120 - Math.random() * 380, life: 80, max: 80, s: 2 + Math.random() * 3.5, c: Math.random() < .3 ? '#8dffd6' : '#6b4a8f' });
      S.shake = Math.max(S.shake, 4);
    } else {
      S.parts.push({ k: 'flash', x: b.x, y: b.y, r: b.r * 1.7, life: 16, max: 16 });
      S.parts.push({ k: 'ring', x: b.x, y: b.y, r0: b.r * .5, r1: b.r * 2.6, life: 26, max: 26 });
      const n = Math.round(16 + b.r * .55);
      for (let i = 0; i < n; i++) S.parts.push({ k: 'chunk', x: b.x, y: b.y - 4, vx: (Math.random() - .5) * 560 * big, vy: -(140 + Math.random() * 420) * big, life: 70 + Math.random() * 30, max: 100, s: 1.6 + Math.random() * 3, c: Math.random() < .35 ? '#8dffd6' : (Math.random() < .5 ? '#3b2d7a' : '#5b3fa6') });
      for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2, v = 90 + Math.random() * 320 * big; S.parts.push({ k: 'ember', x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 30 + Math.random() * 26, max: 56, s: 1 + Math.random() * 1.8 }); }
      for (let i = 0; i < 6; i++) S.parts.push({ k: 'smoke', x: b.x + (Math.random() - .5) * b.r * .6, y: b.y - Math.random() * 10, vx: (Math.random() - .5) * 30 + S.anim.wind * 26, vy: -18 - Math.random() * 22, r: b.r * .35, life: 110, max: 110 });
      carve(T, b.x, b.y, b.r);
      S.shake = Math.max(S.shake, 3 + b.r * .2);
      try { if (navigator.vibrate) navigator.vibrate(b.r > 50 ? 45 : 18); } catch (e) {}
    }
    (b.hits || []).forEach(h => {
      const p = tankPose(T, S.tx[h.victim]);
      S.floats.push({ text: '+' + h.pts, x: p.cx, y: p.cy - 34, c: S.ctx.players[1 - h.victim].color, life: 80, max: 80 });
      S.flash[h.victim] = 12;
    });
  }
  function finishAnim() {
    const A = S.anim; S.anim = null; S.doneId = A.id; S.shownT = A.final.slice();
    const c = S.ctx; if (!c) return;
    const W = WEAPONS[A.w], g = A.res.gain, sh = A.seat, nm = i => c.players[i].name;
    const txt = g[sh] && !g[1 - sh] ? `💥 ${W.name} — <b>+${g[sh]}</b> for ${nm(sh)}`
      : g[1 - sh] ? `🤦 Own goal! <b>+${g[1 - sh]}</b> to ${nm(1 - sh)}` + (g[sh] ? ` · +${g[sh]} to ${nm(sh)}` : '')
      : W.dirt ? `⛰️ ${nm(sh)} heaped a Dirt Wall`
      : `💨 ${W.name} missed`;
    try { c.sound[g[c.me] ? 'good' : (g[1 - c.me] ? 'bad' : 'tap')](); } catch (e) {}
    rerender();
    try { c.msg(txt); } catch (e) {}
  }
  // the turn bar / controls were frozen at pre-shot values during the replay; refresh them
  function rerender() {
    const c = S.ctx; if (!c || !c.root || !c.root.isConnected) return;
    c.root.innerHTML = ''; DEF.render(c);
  }

  /* ---------------- per-frame simulation (cosmetic) ---------------- */
  function step() {
    S.tick++;
    const st = S.ctx && S.ctx.state; if (!st) return;
    for (let k = 0; k < 2; k++) S.tx[k] += (st.tanks[k].x - S.tx[k]) * .16;
    if (S.anim) {
      const A = S.anim; A.clock += 2;                            // 2 sim steps / frame ≈ real time
      while (A.bi < A.res.booms.length && A.res.booms[A.bi].t <= A.clock) boom(A.res.booms[A.bi++]);
      if (A.clock >= A.end) finishAnim();
    }
    const dt = 1 / 60, T = S.shownT;
    S.parts = S.parts.filter(p => {
      p.life--;
      if (p.k === 'chunk' || p.k === 'ember') {
        p.vy += (p.k === 'chunk' ? 760 : 380) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.k === 'chunk' && T && p.y >= surfaceAt(T, p.x)) { p.y = surfaceAt(T, p.x); p.vy *= -.22; p.vx *= .5; }
      } else if (p.k === 'smoke') { p.x += p.vx * dt; p.y += p.vy * dt; p.r += .45; }
      return p.life > 0;
    });
    S.floats = S.floats.filter(f => (f.y -= .7, --f.life > 0));
    S.shake *= .86; if (S.shake < .2) S.shake = 0;
    S.flash = S.flash.map(v => Math.max(0, v - 1));
    const wind = S.anim ? S.anim.wind : st.wind;
    S.dust.forEach(d => { d.x += (wind * 70 + 6) * d.z * dt * 2; if (d.x > VW + 10) d.x = -10; if (d.x < -10) d.x = VW + 10; });
    // the loser's tank keeps smouldering once it's over
    if (S.ctx.status === 'finished' && S.tick % 9 === 0) {
      const w = winnerOf(st);
      if (w === 0 || w === 1) { const p = tankPose(T, S.tx[1 - w]); S.parts.push({ k: 'smoke', x: p.cx + (Math.random() - .5) * 10, y: p.cy - 8, vx: wind * 24, vy: -22, r: 6, life: 90, max: 90 }); }
    }
  }

  /* ---------------- drawing ---------------- */
  function buildBg() {
    const c = document.createElement('canvas'); c.width = S.W; c.height = S.H;
    const b = c.getContext('2d'); b.setTransform(S.dpr * S.scale, 0, 0, S.dpr * S.scale, 0, 0);
    const sky = b.createLinearGradient(0, 0, 0, VH);
    sky.addColorStop(0, '#05071a'); sky.addColorStop(.42, '#140f3a'); sky.addColorStop(.72, '#35194f'); sky.addColorStop(1, '#5a2346');
    b.fillStyle = sky; b.fillRect(0, 0, VW, VH);
    [[720, 150, 280, 'rgba(155,123,255,.17)'], [260, 250, 240, 'rgba(47,230,255,.08)'], [520, 420, 320, 'rgba(255,77,157,.1)']].forEach(([x, y, r, col]) => {
      const n = b.createRadialGradient(x, y, 0, x, y, r); n.addColorStop(0, col); n.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = n; b.fillRect(0, 0, VW, VH);
    });
    const r = rng((S.seed ^ 0x9e3779b9) >>> 0);
    for (let i = 0; i < 170; i++) {
      const x = r() * VW, y = r() * 430, s = r() < .12 ? 1.7 : .5 + r() * .9;
      b.fillStyle = `rgba(234,240,255,${.25 + r() * .6})`; b.beginPath(); b.arc(x, y, s, 0, 7); b.fill();
    }
    // ringed planet
    const px = 168, py = 112, pr = 42;
    const halo = b.createRadialGradient(px, py, pr * .6, px, py, pr * 2.7); halo.addColorStop(0, 'rgba(255,170,120,.22)'); halo.addColorStop(1, 'rgba(255,170,120,0)');
    b.fillStyle = halo; b.fillRect(0, 0, 420, 320);
    const ring = (front) => {
      b.save(); b.translate(px, py); b.rotate(-.32);
      b.beginPath(); b.ellipse(0, 0, pr * 1.85, pr * .34, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      b.strokeStyle = 'rgba(255,214,160,.62)'; b.lineWidth = 3.2; b.stroke();
      b.strokeStyle = 'rgba(255,214,160,.22)'; b.lineWidth = 7; b.stroke(); b.restore();
    };
    ring(false);
    const body = b.createRadialGradient(px - 14, py - 16, 4, px, py, pr);
    body.addColorStop(0, '#ffe2b0'); body.addColorStop(.45, '#e88b62'); body.addColorStop(1, '#5c2446');
    b.fillStyle = body; b.beginPath(); b.arc(px, py, pr, 0, 7); b.fill();
    b.save(); b.beginPath(); b.arc(px, py, pr, 0, 7); b.clip();
    b.strokeStyle = 'rgba(92,36,70,.35)'; b.lineWidth = 5;
    [-14, 2, 16].forEach(dy => { b.beginPath(); b.ellipse(px, py + dy, pr * 1.1, 6, -.2, 0, 7); b.stroke(); });
    b.restore();
    ring(true);
    // two layers of distant mountains
    [[380, 70, '#1c1546', .9], [436, 52, '#130f33', 1]].forEach(([base, amp, col], li) => {
      const m = rng((S.seed + li * 7919) >>> 0);
      const ph = [m() * 6.28, m() * 6.28];
      b.beginPath(); b.moveTo(0, VH);
      for (let x = 0; x <= VW; x += 10) b.lineTo(x, base - amp * (.55 + .45 * Math.sin(x * .006 + ph[0])) * (.6 + .4 * Math.sin(x * .021 + ph[1])));
      b.lineTo(VW, VH); b.closePath();
      b.fillStyle = col; b.globalAlpha = li ? 1 : .92; b.fill(); b.globalAlpha = 1;
    });
    S.bg = c; S.bgKey = S.seed + ':' + S.W;
  }

  function draw() {
    const g = S.g, st = S.ctx && S.ctx.state; if (!g || !st || !S.shownT) return;
    if (!S.W) fit(); if (!S.W) return;
    if (S.bgKey !== S.seed + ':' + S.W) buildBg();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(S.bg, 0, 0);
    const k = S.dpr * S.scale;
    const sx = S.shake ? (Math.random() - .5) * S.shake * 2 : 0, sy = S.shake ? (Math.random() - .5) * S.shake * 2 : 0;
    g.setTransform(k, 0, 0, k, sx * k, sy * k);

    // twinkles + wind-borne dust
    for (let i = 0; i < 9; i++) {
      const tw = .5 + .5 * Math.sin(S.tick * .05 + i * 1.7);
      g.fillStyle = `rgba(255,255,255,${.15 + tw * .55})`;
      g.beginPath(); g.arc((i * 137 + 60) % VW, (i * 71 + 30) % 380, .8 + tw * 1.1, 0, 7); g.fill();
    }
    const wind = S.anim ? S.anim.wind : st.wind;
    g.strokeStyle = 'rgba(200,215,255,.18)'; g.lineWidth = 1.2;
    S.dust.forEach(d => { g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - (wind * 14 + 2) * d.z, d.y); g.stroke(); });

    drawTerrain(g);
    for (let i = 0; i < 2; i++) drawTank(g, i);
    if (canAct() && S.sel[S.ctx.me]) drawAim(g);
    drawFlights(g);
    drawParts(g);
    drawFloats(g);
    g.setTransform(k, 0, 0, k, 0, 0);
    drawWind(g, wind);
  }

  function drawTerrain(g) {
    const t = S.shownT;
    let top = VH; for (let i = 0; i < COLS; i++) top = Math.min(top, t[i]);
    g.beginPath(); g.moveTo(0, VH); g.lineTo(0, t[0]);
    for (let i = 1; i < COLS; i++) g.lineTo(i * STEP, t[i]);
    g.lineTo(VW, VH); g.closePath();
    const fill = g.createLinearGradient(0, top, 0, VH);
    fill.addColorStop(0, '#2c2168'); fill.addColorStop(.45, '#171039'); fill.addColorStop(1, '#08061a');
    g.fillStyle = fill; g.fill();
    g.save(); g.clip();                                    // strata that follow the surface
    for (let s = 1; s <= 5; s++) {
      g.beginPath();
      for (let i = 0; i < COLS; i++) { const y = t[i] + s * 21 + Math.sin(i * .21 + s) * 3; i ? g.lineTo(i * STEP, y) : g.moveTo(0, y); }
      g.strokeStyle = `rgba(140,110,255,${.14 - s * .02})`; g.lineWidth = 5; g.stroke();
    }
    g.restore();
    g.beginPath(); g.moveTo(0, t[0]); for (let i = 1; i < COLS; i++) g.lineTo(i * STEP, t[i]);
    g.save(); g.shadowColor = '#5ef2c0'; g.shadowBlur = 16;
    g.strokeStyle = '#7dffd2'; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1; g.stroke();
  }

  function drawTank(g, i) {
    const c = S.ctx, st = c.state, col = c.players[i].color, p = tankPose(S.shownT, S.tx[i]);
    const hit = S.flash[i] > 0 && S.flash[i] % 4 < 2;
    // barrel angle: live aim for me, the shot angle while replaying, else last known
    let ang = S.barrel[i];
    if (i === c.me && canAct()) ang = S.aim[i].ang;
    S.barrel[i] = ang;
    g.save(); g.translate(p.x, p.y);
    const glow = g.createRadialGradient(0, -6, 2, 0, -6, 46);
    glow.addColorStop(0, hexA(col, .38)); glow.addColorStop(1, hexA(col, 0));
    g.fillStyle = glow; g.fillRect(-50, -52, 100, 70);
    g.rotate(p.tilt);
    rr(g, -30, -12, 60, 13, 6.5); g.fillStyle = '#12162a'; g.fill();          // treads
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.2; g.stroke();
    for (const wx of [-21, -7, 7, 21]) {
      g.fillStyle = '#2d3455'; g.beginPath(); g.arc(wx, -5.5, 4.2, 0, 7); g.fill();
      g.fillStyle = '#6b77a8'; g.beginPath(); g.arc(wx, -5.5, 1.5, 0, 7); g.fill();
    }
    const hull = g.createLinearGradient(0, -24, 0, -12);
    hull.addColorStop(0, hit ? '#ffffff' : lighten(col, .45)); hull.addColorStop(1, hit ? '#ffe0e0' : col);
    g.beginPath(); g.moveTo(-24, -12); g.lineTo(24, -12); g.lineTo(17, -23); g.lineTo(-17, -23); g.closePath();
    g.save(); g.shadowColor = col; g.shadowBlur = 12; g.fillStyle = hull; g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-17, -23); g.lineTo(17, -23); g.stroke();
    const dome = g.createRadialGradient(-3, -28, 1, 0, -24, 11);
    dome.addColorStop(0, hit ? '#ffffff' : lighten(col, .6)); dome.addColorStop(1, hit ? '#ffd0d0' : darken(col, .25));
    g.fillStyle = dome; g.beginPath(); g.arc(0, -23, 10, Math.PI, 0); g.fill();
    g.restore();
    // barrel (world-aligned so the aim reads true regardless of tilt)
    const bx = p.px + Math.cos(ang) * BARREL, by = p.py + Math.sin(ang) * BARREL;
    g.lineCap = 'round';
    g.strokeStyle = '#1b2036'; g.lineWidth = 8; g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = lighten(col, .35); g.lineWidth = 4.5; g.beginPath(); g.moveTo(p.px, p.py); g.lineTo(bx, by); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, 2.2, 0, 7); g.fill();
    // name + whose-turn chevron
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.font = '700 15px "Chakra Petch", system-ui, sans-serif';
    g.fillStyle = 'rgba(5,7,15,.55)'; g.fillText(c.players[i].name, p.x + 1, p.y - 47);
    g.fillStyle = col; g.fillText(c.players[i].name, p.x, p.y - 48);
    if (st.turn === i && c.status === 'active' && !S.anim) {
      const bob = Math.sin(S.tick * .12) * 3;
      g.fillStyle = col; g.beginPath();
      g.moveTo(p.x - 7, p.y - 74 + bob); g.lineTo(p.x + 7, p.y - 74 + bob); g.lineTo(p.x, p.y - 65 + bob); g.closePath(); g.fill();
    }
  }

  function drawAim(g) {
    const c = S.ctx, me = c.me, st = c.state, W = WEAPONS[S.sel[me]], a = S.aim[me];
    const o = muzzle(S.shownT, S.tx[me], a.ang);
    // only the opening slice — enough to read your angle, not enough to remove the skill
    const f = flight(S.shownT, st.tanks, me, o.x, o.y, a.ang, Math.min(MAX_POW, a.pow) * (W.speed || 1), st.wind, W.noWind, 46);
    for (let i = 4; i < f.pts.length; i += 4) {
      const al = 1 - i / f.pts.length;
      g.fillStyle = hexA(c.players[me].color, .25 + al * .6);
      g.beginPath(); g.arc(f.pts[i][0], f.pts[i][1], 2.6 + al * 1.4, 0, 7); g.fill();
    }
    const p = tankPose(S.shownT, S.tx[me]);                  // power ring
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 3;
    g.beginPath(); g.arc(p.px, p.py, 46, -Math.PI, 0); g.stroke();
    g.strokeStyle = W.col; g.lineWidth = 3.4;
    g.beginPath(); g.arc(p.px, p.py, 46, -Math.PI, -Math.PI + Math.PI * (a.pow / MAX_POW)); g.stroke();
  }

  function drawFlights(g) {
    const A = S.anim; if (!A) return;
    g.save(); g.globalCompositeOperation = 'lighter';
    A.res.flights.forEach(f => {
      const idx = A.clock - f.t0; if (idx < 0 || idx >= f.pts.length) return;
      for (let j = Math.max(0, idx - 26); j < idx; j += 2) {
        const al = (j - idx + 26) / 26;
        g.fillStyle = hexA(f.col, al * .5);
        g.beginPath(); g.arc(f.pts[j][0], f.pts[j][1], (f.small ? 1.4 : 2.2) + al * (f.small ? 1.6 : 3), 0, 7); g.fill();
      }
      const h = f.pts[idx];
      const r = f.small ? 3 : 5;
      const gl = g.createRadialGradient(h[0], h[1], 0, h[0], h[1], r * 4);
      gl.addColorStop(0, 'rgba(255,255,255,.95)'); gl.addColorStop(.25, hexA(f.col, .9)); gl.addColorStop(1, hexA(f.col, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(h[0], h[1], r * 4, 0, 7); g.fill();
    });
    g.restore();
  }

  function drawParts(g) {
    S.parts.forEach(p => {
      const a = p.life / p.max;
      if (p.k === 'smoke') {
        g.fillStyle = `rgba(60,55,90,${a * .38})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      } else if (p.k === 'chunk') {
        g.fillStyle = p.c; g.globalAlpha = Math.min(1, a * 1.6); g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); g.globalAlpha = 1;
      }
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    S.parts.forEach(p => {
      const a = p.life / p.max;
      if (p.k === 'flash') {
        const r = p.r * (1.15 - a * .4);
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(.3, `rgba(255,214,107,${a * .9})`);
        gr.addColorStop(.65, `rgba(255,110,60,${a * .55})`); gr.addColorStop(1, 'rgba(255,60,80,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
      } else if (p.k === 'ring') {
        const r = p.r1 - (p.r1 - p.r0) * a;
        g.strokeStyle = `rgba(255,220,170,${a * .7})`; g.lineWidth = 3 * a + .5;
        g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.stroke();
      } else if (p.k === 'ember') {
        g.fillStyle = `rgba(255,${150 + Math.round(a * 90)},80,${a})`;
        g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill();
      }
    });
    g.restore();
  }

  function drawFloats(g) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    S.floats.forEach(f => {
      const a = Math.min(1, f.life / 30), s = 1 + (1 - f.life / f.max) * .25;
      g.font = `900 ${Math.round(30 * s)}px Orbitron, "Chakra Petch", system-ui, sans-serif`;
      g.globalAlpha = a; g.lineWidth = 5; g.strokeStyle = 'rgba(5,7,15,.85)'; g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.c; g.fillText(f.text, f.x, f.y); g.globalAlpha = 1;
    });
  }

  function drawWind(g, wind) {
    const w = Math.round(wind * 10), cx = VW / 2, y = 26;
    rr(g, cx - 78, y - 16, 156, 32, 16); g.fillStyle = 'rgba(5,7,15,.55)'; g.fill();
    g.strokeStyle = 'rgba(170,190,255,.2)'; g.lineWidth = 1; g.stroke();
    g.font = '700 13px "Chakra Petch", system-ui, sans-serif'; g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillStyle = 'rgba(234,240,255,.55)'; g.fillText('WIND', cx - 64, y + 1);
    g.textAlign = 'right'; g.fillStyle = '#eaf0ff'; g.fillText(w ? Math.abs(w) : 'calm', cx + 64, y + 1);
    if (w) {
      const len = 10 + Math.abs(wind) * 34, dir = Math.sign(wind), x0 = cx + 6 - dir * len / 2, x1 = cx + 6 + dir * len / 2;
      g.strokeStyle = '#7dffd2'; g.fillStyle = '#7dffd2'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.beginPath(); g.moveTo(x1 + dir * 4, y); g.lineTo(x1 - dir * 5, y - 6); g.lineTo(x1 - dir * 5, y + 6); g.closePath(); g.fill();
    }
  }

  /* ---------------- tiny canvas helpers ---------------- */
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xffffff; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hexA(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function lighten(hex, f) { const c = rgb(hex).map(v => Math.round(v + (255 - v) * f)); return `rgb(${c})`; }
  function darken(hex, f) { const c = rgb(hex).map(v => Math.round(v * (1 - f))); return `rgb(${c})`; }

  /* ---------------- actions ---------------- */
  function fire() {
    const c = S.ctx; if (!canAct()) return;
    const st = c.state, me = c.me, wk = S.sel[me];
    if (!wk || st.used[me][wk]) return;
    const a = S.aim[me], res = resolveShot(st, me, wk, a.ang, a.pow);
    const s = c.clone(st);
    s.n = (s.n || 0) + 1;
    s.last = { id: s.n, seat: me, w: wk, ang: a.ang, pow: a.pow, wind: st.wind, prev: st.terrain.slice(), prevScore: st.score.slice() };
    s.terrain = res.terrain;
    s.score = [st.score[0] + res.gain[0], st.score[1] + res.gain[1]];
    s.used[me][wk] = true; s.fired[me]++;
    s.turn = s.fired[1 - me] < SHOTS ? 1 - me : me;            // if they're out of shots, you keep firing
    s.wind = rollWind();
    S.sel[me] = null;
    try { c.sound.place(); } catch (e) {}
    // Commit FIRST — the animation replays from `last` on the next repaint.
    allFired(s) ? c.commit(s, winnerOf(s)) : c.commit(s);
  }
  function move(dir) {
    const c = S.ctx; if (!canAct()) return;
    const st = c.state, me = c.me; if (st.moves[me] <= 0) return;
    const lo = me === 0 ? 40 : 560, hi = me === 0 ? 440 : 960;
    const nx = Math.max(lo, Math.min(hi, st.tanks[me].x + dir * 45));
    if (nx === st.tanks[me].x) { try { c.sound.bad(); } catch (e) {} return; }
    const s = c.clone(st); s.tanks[me].x = nx; s.moves[me]--;
    try { c.sound.move(); } catch (e) {}
    c.commit(s);                                                // moving doesn't cost your turn
  }
  function nudge(kind, d) {
    if (!canAct()) return;
    const me = S.ctx.me, a = S.aim[me];
    if (kind === 'ang') { const e = Math.max(1, Math.min(179, toElev(me, a.ang) + d)); a.ang = fromElev(me, e); }
    else a.pow = Math.max(MAX_POW * .05, Math.min(MAX_POW, a.pow + d * MAX_POW / 100));
    syncReadout();
  }
  function syncReadout() {
    const u = S.ui, c = S.ctx; if (!u || !c) return;
    const a = S.aim[c.me];
    u.ang.textContent = toElev(c.me, a.ang) + '°';
    u.pow.textContent = String(Math.round(a.pow / MAX_POW * 100));
  }
  // tap = one step; hold = repeat (the click after a repeat is swallowed)
  function stepper(label, fn, dis) {
    let tmr = null, rep = false;
    const stop = () => { clearTimeout(tmr); clearInterval(tmr); tmr = null; };
    const b = document.createElement('button');
    b.textContent = label; if (dis) b.disabled = true;
    b.addEventListener('pointerdown', () => { rep = false; stop(); tmr = setTimeout(() => { rep = true; tmr = setInterval(fn, 55); }, 380); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
    b.addEventListener('click', () => { if (rep) { rep = false; return; } fn(); });
    return b;
  }

  /* ---------------- registration ---------------- */
  const DEF = {
    id: 'pocket-tanks', name: 'Pocket Tanks', emoji: '💥', category: 'Duel', accent: '#ff8a3d',
    tagline: 'Six weapons each · wreck the ground · most damage wins.',
    test: { genTerrain, resolveShot, flight, surfaceAt, tankPose, carve, addDirt, muzzle, toElev, fromElev,
      WEAPONS, ORDER, SHOTS, MAX_POW, VW, VH, COLS, HOME, S },
    // a replay can outlast the finishing commit — hold the result card until it lands
    resultDelay: () => S.anim ? Math.round((S.anim.end - S.anim.clock) / 2 * 16.7) + 250 : 0,
    init: host => {
      const seed = (Math.random() * 2147483647) | 0;
      return { seed, terrain: genTerrain(seed), tanks: [{ x: HOME[0] }, { x: HOME[1] }], turn: host,
        wind: rollWind(), score: [0, 0], used: [freshUsed(), freshUsed()], fired: [0, 0], moves: [3, 3], last: null, n: 0 };
    },
    // timer ran out: your next weapon is spent as a dud and the turn passes
    skipTurn: (st, opp) => {
      const s = JSON.parse(JSON.stringify(st)), me = 1 - opp;
      const wk = ORDER.find(k => !s.used[me][k]);
      if (wk) { s.used[me][wk] = true; s.fired[me]++; }
      s.turn = s.fired[opp] < SHOTS ? opp : me; s.wind = rollWind();
      return s;
    },
    render(ctx) {
      const st = ctx.state, me = ctx.me, foe = 1 - me;
      S.ctx = ctx;
      ensureCanvas();
      if (st.seed !== S.seed) resetScene(st);
      maybeReplay(st);
      if (!S.sel[me] || st.used[me][S.sel[me]]) S.sel[me] = ORDER.find(k => !st.used[me][k]) || null;

      const shownScore = S.anim ? S.anim.prevScore : st.score;
      const wrap = ctx.h('div', { class: 'pt-wrap' });
      ctx.root.append(ctx.turnBar({ scores: shownScore }), wrap);
      wrap.append(S.cv);                                         // the SAME canvas every repaint
      fit(); ensureLoop();

      const live = canAct();
      const rail = ctx.h('div', { class: 'pt-rail' });
      ORDER.forEach(k => {
        const W = WEAPONS[k], used = st.used[me][k];
        const btn = ctx.h('button', {
          class: 'pt-wpn' + (used ? ' used' : '') + (S.sel[me] === k && !used ? ' sel' : ''),
          disabled: used || !live ? '' : null,
          onclick: () => { if (!canAct() || st.used[me][k]) return; S.sel[me] = k; try { ctx.sound.tap(); } catch (e) {} rerender(); },
        }, ctx.h('span', { style: `color:${W.col}`, html: wIcon(k) }), ctx.h('b', {}, W.name), ctx.h('small', {}, W.stat));
        rail.append(btn);
      });

      const a = S.aim[me];
      const angB = ctx.h('b', {}, toElev(me, a.ang) + '°'), powB = ctx.h('b', {}, String(Math.round(a.pow / MAX_POW * 100)));
      const stepBox = (lbl, val, dn, up) => {
        const box = ctx.h('div', { class: 'pt-step' });
        box.append(stepper('−', dn, !live), ctx.h('div', { class: 'pt-val' }, ctx.h('small', {}, lbl), val), stepper('+', up, !live));
        return box;
      };
      const moveBox = ctx.h('div', { class: 'pt-step wide' });
      const canMove = live && st.moves[me] > 0;
      moveBox.append(stepper('◀', () => move(-1), !canMove),
        ctx.h('div', { class: 'pt-val' }, ctx.h('small', {}, 'MOVE TANK'), ctx.h('b', { style: 'font-size:15px' }, `${st.moves[me]} left`)),
        stepper('▶', () => move(1), !canMove));
      const ctrl = ctx.h('div', { class: 'pt-ctrl' },
        stepBox('ANGLE', angB, () => nudge('ang', -1), () => nudge('ang', 1)),
        stepBox('POWER', powB, () => nudge('pow', -1), () => nudge('pow', 1)),
        moveBox);

      const W = S.sel[me] ? WEAPONS[S.sel[me]] : null;
      const fireBtn = ctx.h('button', {
        class: 'pt-fire' + (live && W ? ' ready' : ''), disabled: live && W ? null : '', onclick: fire,
      }, live && W ? `🔥 FIRE · ${W.name.toUpperCase()}` : ctx.status === 'finished' ? 'MATCH OVER' : S.anim ? (S.anim.seat === me ? 'SHELL AWAY…' : 'INCOMING…') : `${ctx.players[foe].name.toUpperCase()}'S TURN`);

      const left = [SHOTS - st.fired[0], SHOTS - st.fired[1]];
      const hint = ctx.h('div', { class: 'pt-hint' });
      hint.innerHTML = ctx.status === 'finished'
        ? `Final: <b>${st.score[0]} – ${st.score[1]}</b>`
        : live ? `Drag on the battlefield to aim · <b>${left[me]}</b> shot${left[me] === 1 ? '' : 's'} left · ${ctx.players[foe].name}: ${left[foe]}`
        : S.anim ? (S.anim.seat === me ? 'Watch it land…' : `${ctx.players[foe].name} fired — brace!`)
        : `${ctx.players[foe].name} is lining up a shot · you have <b>${left[me]}</b> left`;
      wrap.append(rail, ctrl, fireBtn, hint);
      if (window.Landscape) wrap.append(Landscape.button());
      S.ui = { ang: angB, pow: powB };

      // a timeout can exhaust everyone's arsenal without a winner being declared;
      // exactly ONE device (whoever holds `turn`) closes the match, so it can't double-count
      if (allFired(st) && ctx.status === 'active' && ctx.isMyTurn && !S.anim) ctx.commit(ctx.clone(st), winnerOf(st));
    },
  };
  Games.register(DEF);
})();
