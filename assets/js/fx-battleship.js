/* ============================================================
   BATTLESHIP — cinematic night-ocean scene  (window.BattleshipScene)

   The RULES stay in games-mind.js (placement legality, one shot per turn,
   hidden fleets, the win). This file only DRAWS and takes input:
     - a night ocean: layered swells, moonlight glitter, foam, fog, a misty
       horizon with searchlights and distant gun flashes;
     - ENEMY WATERS: a tilted sonar grid floating on the water (tap to aim,
       tap again / FIRE to shoot);
     - YOUR FLEET: grey 2.5D warships (deck, turrets, bridge) that bob;
     - every shot replays from the committed `state.last` on BOTH phones:
       a shell arcs in with a whistle, the camera follows it and pushes in,
       then a water column (miss), a fireball (hit) or a slow-motion sinking
       wreck (sunk).
   Like Fleabag / Pocket Tanks, the canvas, camera, particles and the shot
   in flight live at MODULE level (scene `S`), so a repaint of the stage
   re-attaches the same canvas and can never restart or kill an animation.
   HIDDEN INFORMATION: an enemy ship is only ever drawn once it is sunk —
   drawShip() is the single place a hull is painted (tests instrument it).
   ============================================================ */
(function () {
  const css = `
  .bsx{ display:flex; flex-direction:column; gap:8px; }
  .bsx-stage{ position:relative; }
  .bsx-cv{ width:100%; display:block; border-radius:var(--r-3); border:1px solid var(--glass-brd);
    box-shadow:var(--shadow-soft); background:#030713; touch-action:manipulation; user-select:none;
    -webkit-user-select:none; -webkit-tap-highlight-color:transparent; }
  .bsx-cv.drag{ touch-action:none; }
  .bsx-bar{ display:flex; gap:8px; align-items:stretch; }
  .bsx-tgt{ flex:1; min-width:0; display:flex; align-items:center; gap:10px; padding:0 14px; min-height:48px;
    border-radius:var(--r-2); background:rgba(3,8,20,.55); border:1px solid var(--glass-brd);
    font-family:var(--font-display); font-size:9.5px; letter-spacing:1.5px; color:var(--ink-dim); text-transform:uppercase; }
  .bsx-tgt b{ font-family:var(--font-num); font-size:19px; letter-spacing:1px; color:var(--bsx-c,#eaf0ff);
    text-shadow:0 0 12px var(--bsx-c,transparent); }
  .bsx-tgt i{ font-style:normal; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bsx-fire{ flex:0 0 116px; border-radius:var(--r-2); font-family:var(--font-display); font-weight:800; font-size:15px;
    letter-spacing:2.5px; color:#fff; border:1px solid rgba(255,255,255,.16);
    background:linear-gradient(180deg,#ff7a45,#e0283f); box-shadow:0 0 24px -6px #ff5a3d, inset 0 1px 0 rgba(255,255,255,.35);
    transition:transform var(--dur-1,.12s) var(--spring,ease), opacity .2s, filter .2s, box-shadow .2s; }
  .bsx-fire:active{ transform:scale(.93); }
  .bsx-fire:disabled{ opacity:.32; filter:grayscale(.85); box-shadow:none; }
  .bsx-fire.armed{ animation:bsxArm 1.1s ease-in-out infinite; }
  @keyframes bsxArm{ 50%{ box-shadow:0 0 34px -2px #ff5a3d, inset 0 1px 0 rgba(255,255,255,.35); } }
  .bsx-hint{ text-align:center; font-size:12px; color:var(--ink-dim); line-height:1.5; }
  .bsx-hint b{ color:var(--ink); }
  .bsx-tray{ display:flex; gap:7px; flex-wrap:wrap; justify-content:center; min-height:44px; }
  .bsx-ship{ display:flex; flex-direction:column; align-items:center; gap:2px; padding:5px 7px 4px; border-radius:var(--r-2);
    background:rgba(3,8,20,.55); border:1px solid var(--glass-brd); color:var(--ink-dim); font-size:9px;
    font-family:var(--font-display); letter-spacing:1px; transition:transform .12s, border-color .2s, box-shadow .2s; }
  .bsx-ship canvas{ display:block; }
  .bsx-ship.sel{ border-color:var(--bsx-c,#2fe6ff); box-shadow:0 0 16px -5px var(--bsx-c,#2fe6ff); color:var(--ink); }
  .bsx-ship:active{ transform:scale(.94); }
  .bsx-done{ font-family:var(--font-display); font-size:10px; letter-spacing:1.5px; color:var(--lime,#79f5b6); align-self:center; }
  .bsx-ctrls{ display:grid; grid-template-columns:repeat(3,1fr); gap:7px; }
  .bsx-ctrls button{ padding:10px 4px; border-radius:var(--r-2); background:rgba(3,8,20,.55); border:1px solid var(--glass-brd);
    color:var(--ink); font-size:12.5px; font-weight:700; transition:transform .12s; }
  .bsx-ctrls button:active{ transform:scale(.94); }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------------- constants ---------------- */
  const N = 8, VW = 400, ROWS = 'ABCDEFGH';
  const DECK = 0.2;                                        // deck height, in cells
  const WRECK = { sink: 0.3, list: 0.85, pitch: 0.12 };    // a sunk hull, settled
  const MOON_X = 318;
  const NAME = { 2: 'patrol boat', 3: 'cruiser', 4: 'battleship', 5: 'carrier' };
  const cellName = (r, c) => ROWS[r] + (c + 1);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  const easeOut = x => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const easeIO = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };

  /* a board plane seen at a slight tilt: rows far (top) → near (bottom).
     P(u, v, h): u = column units, v = row units, h = height in cells. */
  function proj(yt, yb, wt, wb, cx) {
    const r = wb / wt, a = (yb - yt) / (1 - 1 / r), hy = yb - a, k = wb / N;
    const sOf = v => 1 / (1 + (r - 1) * (1 - v / N));
    return {
      yt, yb, k, cx,
      s: sOf,
      P(u, v, h) { const s = sOf(v); return [cx + (u - N / 2) * k * s, hy + a * s - (h || 0) * k * s]; },
      inv(x, y) { const s = (y - hy) / a; if (s <= 0) return null; const d = 1 / s; return [(x - cx) / (k * s) + N / 2, N * (1 - (d - 1) / (r - 1))]; },
    };
  }
  function layoutFor(mode) {
    if (mode === 'play') {
      const E = { id: 'E', x: 0, y: 0, w: VW, h: 372, hy: 66, grid: proj(104, 356, 282, 360, 206), moon: true };
      const F = { id: 'F', x: 0, y: 380, w: VW, h: 232, hy: 404, grid: proj(432, 602, 246, 344, 204) };
      return { mode, VH: 612, panels: [E, F], E, F };
    }
    const P = { id: 'P', x: 0, y: 0, w: VW, h: 440, hy: 54, grid: proj(92, 428, 284, 356, 210), moon: true };
    return { mode, VH: 440, panels: [P], P };
  }

  /* ---------------- module-level scene (survives repaints) ---------------- */
  const S = {
    cv: null, g: null, raf: 0, visible: true, W: 0, H: 0, dpr: 1, scale: 1,
    mode: '', L: layoutFor('play'), VH: 612,
    ctx: null, R: null, el: null, tgtEl: null, fireBtn: null, view: null,
    cam: { x: VW / 2, y: 306, z: 1 }, sx: 0, sy: 0, shake: 0, flash: 0, slow: false,
    anim: null, doneId: 0, parts: [], aim: null, lockT: 0, press: null, place: null,
    t: 0, lastNow: 0, bg: null, sky: null, fog: null, bgKey: '', sparkles: [], flashes: [], nextFlash: 2500,
    log: null,                                       // tests: [] records every hull drawn
    calm: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };

  /* ---------------- sound (WebAudio, follows the app's sound toggle) ---------------- */
  const Sfx = (() => {
    let ac = null, noise = null;
    const on = () => { try { return !(window.Store && Store.get().settings.sound === false); } catch (e) { return true; } };
    function A() {
      if (!on()) return null;
      if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
      return ac;
    }
    function nbuf(a) {
      if (!noise) { const n = a.sampleRate * 1.6 | 0; noise = a.createBuffer(1, n, a.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; }
      return noise;
    }
    function burst(dur, f0, f1, vol, type) {
      const a = A(); if (!a) return;
      try {
        const s = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain(), t0 = a.currentTime;
        s.buffer = nbuf(a); f.type = type || 'lowpass';
        f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        gn.gain.setValueAtTime(vol, t0); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        s.connect(f); f.connect(gn); gn.connect(a.destination); s.start(t0); s.stop(t0 + dur);
      } catch (e) {}
    }
    function tone(f0, f1, dur, vol, type, attack) {
      const a = A(); if (!a) return;
      try {
        const o = a.createOscillator(), gn = a.createGain(), t0 = a.currentTime;
        o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
        gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol, t0 + (attack || 0.01));
        gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(gn); gn.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
      } catch (e) {}
    }
    return {
      whistle: ms => tone(1700, 420, ms / 1000, 0.05, 'sine', ms / 4000),
      gun: () => { burst(0.4, 1500, 120, 0.32); tone(110, 45, 0.3, 0.45); },
      boom: big => { burst(big ? 1.7 : 1.1, 1000, 50, big ? 0.6 : 0.45); tone(75, 30, big ? 0.8 : 0.5, 0.55); },
      splash: () => { burst(0.8, 2600, 260, 0.24, 'bandpass'); tone(160, 60, 0.25, 0.2); },
    };
  })();
  function sfx(name, arg) {
    const c = S.ctx && S.ctx.sound;
    try { if (name === 'whistle' && c && c.whistle) return c.whistle(arg); Sfx[name](arg); } catch (e) {}
  }

  /* ---------------- canvas + loop ---------------- */
  function ensureCanvas() {
    if (S.cv) return;
    S.cv = document.createElement('canvas'); S.cv.className = 'bsx-cv';
    S.g = S.cv.getContext('2d');
    // fit() sets the canvas height, so run it after the observer has delivered (no RO loop warning)
    if (window.ResizeObserver) new ResizeObserver(() => { if (!S.fitQ) { S.fitQ = 1; setTimeout(() => { S.fitQ = 0; fit(); }, 0); } }).observe(S.cv);
    else window.addEventListener('resize', fit);
    if (window.IntersectionObserver) {
      new IntersectionObserver(es => { S.visible = es.some(e => e.isIntersecting); if (S.visible) ensureLoop(); }).observe(S.cv);
    }
    S.cv.addEventListener('pointerdown', onDown);
    S.cv.addEventListener('pointermove', onMove, { passive: false });
    S.cv.addEventListener('pointerup', onUp);
    S.cv.addEventListener('pointercancel', () => { if (S.place && S.place.held) cancelHeld(); S.press = null; });
  }
  function setMode(mode) {
    if (S.mode === mode) return;
    S.mode = mode; S.L = layoutFor(mode); S.VH = S.L.VH;
    S.cam = { x: VW / 2, y: S.VH / 2, z: 1 }; S.parts = []; S.bgKey = '';
    if (S.cv) S.cv.classList.toggle('drag', mode === 'place');
    S.W = 0; fit();
  }
  function fit() {
    if (!S.cv) return;
    const w = S.cv.clientWidth; if (!w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(w * S.VH / VW * dpr);
    S.cv.style.height = Math.round(w * S.VH / VW) + 'px';
    if (W === S.W && H === S.H) return;
    S.W = W; S.H = H; S.dpr = dpr; S.scale = w / VW;
    S.cv.width = W; S.cv.height = H; S.bgKey = '';
    draw();                                                    // resizing wipes the bitmap
  }
  function ensureLoop() { if (!S.raf && S.cv) S.raf = requestAnimationFrame(loop); }
  const busy = () => !!(S.anim || S.parts.length > 0 || (S.place && S.place.held) || S.lockT < 400 || Math.abs(S.cam.z - 1) > 0.002 || S.shake > 0.2 || S.flash > 0.01);
  function loop(now) {
    S.raf = 0;
    if (!S.cv || !S.cv.isConnected) return;
    now = now || performance.now();
    const hot = busy();
    const dt = S.lastNow ? now - S.lastNow : 16;
    if (!hot && dt < 31) { S.raf = requestAnimationFrame(loop); return; }   // idle: ~30 fps is plenty for water
    S.lastNow = now;
    step(Math.min(50, Math.max(1, dt)), Math.min(250, Math.max(1, dt)));   // the shot's clock keeps wall time even on slow frames
    draw();
    if (!S.visible && !hot) return;                             // off-screen and idle → sleep until seen again
    S.raf = requestAnimationFrame(loop);
  }

  /* ---------------- input ---------------- */
  function toWorld(e) {
    const r = S.cv.getBoundingClientRect(), k = r.width / VW;
    const sx = (e.clientX - r.left) / k, sy = (e.clientY - r.top) / k, c = S.cam;
    return { x: c.x + (sx - VW / 2) / c.z, y: c.y + (sy - S.VH / 2) / c.z };
  }
  function clientOf(pid, r, c, h) {                         // tests: where a cell sits on screen
    const p = S.L[pid], [x, y] = p.grid.P(c + 0.5, r + 0.5, h || 0), rc = S.cv.getBoundingClientRect(), k = rc.width / VW, cm = S.cam;
    return { x: rc.left + ((x - cm.x) * cm.z + VW / 2) * k, y: rc.top + ((y - cm.y) * cm.z + S.VH / 2) * k };
  }
  function onDown(e) {
    S.press = { x: e.clientX, y: e.clientY, moved: false };
    if (S.mode === 'place') placeDown(e);
  }
  function onMove(e) {
    if (!S.press) return;
    if (Math.hypot(e.clientX - S.press.x, e.clientY - S.press.y) > 9) S.press.moved = true;
    if (S.mode === 'place' && S.place && S.place.held) { placeMove(e); e.preventDefault(); }
  }
  function onUp(e) {
    const p = S.press; S.press = null;
    if (S.mode === 'place') return placeUp(e, p);
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 16) tapPlay(toWorld(e));
  }

  /* ---- firing phase: tap to aim (lock-on), tap again or FIRE to shoot ---- */
  function canAim() {
    const c = S.ctx; if (!c) return false;
    const st = c.state;
    return st.phase === 'play' && c.isMyTurn && c.status !== 'finished' && !S.anim && !(st.last && st.last.id > S.doneId);
  }
  function tapPlay(w) {
    if (!canAim()) return;
    const E = S.L.E; if (!E || w.y < E.y || w.y > E.y + E.h) return;
    const uv = E.grid.inv(w.x, w.y); if (!uv) return;
    const [u, v] = uv;
    if (u < 0 || u >= N || v < 0 || v >= N) { if (S.aim) { S.aim = null; syncBar(); } return; }
    const r = Math.floor(v), c = Math.floor(u), ctx = S.ctx;
    if (ctx.state.boards[1 - ctx.me].hits[r][c]) { try { ctx.sound.tap(); } catch (x) {} S.nope = { r, c, t: S.t }; return; }
    if (S.aim && S.aim.r === r && S.aim.c === c) return fireNow();
    S.aim = { r, c }; S.lockT = 0;
    try { ctx.sound.tap(); } catch (x) {}
    syncBar(); ensureLoop();
  }
  function fireNow() {
    if (!S.aim || !canAim()) return;
    const { r, c } = S.aim; S.aim = null;
    const ok = S.R.fire(S.ctx, r, c);
    if (!ok) { try { S.ctx.sound.bad(); } catch (x) {} syncBar(); }
  }

  /* ---- placement phase: drag or tap ships into place ---- */
  function occupied(P) { const g = {}; P.ships.forEach(s => shipCells(s).forEach(([r, c]) => g[r + ',' + c] = 1)); return g; }
  function shipCells(s) { const out = []; for (let k = 0; k < s.size; k++) out.push([s.r + (s.o === 'v' ? k : 0), s.c + (s.o === 'h' ? k : 0)]); return out; }
  function fitsP(P, s) {
    const occ = occupied(P);
    return shipCells(s).every(([r, c]) => r >= 0 && r < N && c >= 0 && c < N && !occ[r + ',' + c]);
  }
  function shipAt(P, uv) {
    if (!uv) return -1;
    const r = Math.floor(uv[1]), c = Math.floor(uv[0]);
    return P.ships.findIndex(s => shipCells(s).some(([a, b]) => a === r && b === c));
  }
  function ghostFor(P, held, uv) {
    if (!uv) return null;
    const [u, v] = uv;
    if (u < -0.35 || u > N + 0.35 || v < -0.45 || v > N + 0.35) return null;   // off the board = put it back
    const fr = clamp(Math.floor(v), 0, N - 1), fc = clamp(Math.floor(u), 0, N - 1);
    let r = fr, c = fc;
    if (held.o === 'h') c = clamp(fc - held.grab, 0, N - held.size); else r = clamp(fr - held.grab, 0, N - held.size);
    const s = { size: held.size, r, c, o: held.o };
    s.ok = fitsP(P, s);
    return s;
  }
  function placeUV(e) { const w = toWorld(e); return S.L.P.grid.inv(w.x, w.y); }
  function placeDown(e) {
    const P = S.place, c = S.ctx;
    if (!P || !c || !c.isMyTurn || c.state.phase !== 'place') return;
    const w = toWorld(e), pr = S.L.P.grid, uv = pr.inv(w.x, w.y);
    let idx = shipAt(P, uv);
    if (idx < 0 && uv) idx = shipAt(P, pr.inv(w.x, w.y + DECK * pr.k * pr.s(uv[1])));   // touched the deck of the row below
    if (idx >= 0) {
      const s = P.ships.splice(idx, 1)[0], r0 = Math.floor(uv ? uv[1] : 0), c0 = Math.floor(uv ? uv[0] : 0);
      const grab = clamp(s.o === 'h' ? c0 - s.c : r0 - s.r, 0, s.size - 1);
      P.held = { size: s.size, o: s.o, grab, from: { r: s.r, c: s.c, o: s.o, idx } };
    } else if (P.tray.length) {
      const size = P.tray[P.sel];
      P.held = { size, o: P.orient, grab: Math.floor((size - 1) / 2), from: null };
    } else return;
    P.ghost = ghostFor(P, P.held, uv);
    try { S.cv.setPointerCapture(e.pointerId); } catch (x) {}
    try { c.sound.tap(); } catch (x) {}
    ensureLoop();
  }
  function placeMove(e) { const P = S.place; P.ghost = ghostFor(P, P.held, placeUV(e)); }
  function cancelHeld() {
    const P = S.place; if (!P || !P.held) return;
    const H = P.held;
    if (H.from) P.ships.splice(H.from.idx, 0, { size: H.size, r: H.from.r, c: H.from.c, o: H.from.o });
    P.held = null; P.ghost = null;
  }
  function placeUp(e, press) {
    const P = S.place, c = S.ctx; if (!P || !P.held) return;
    const H = P.held, tap = !press || !press.moved;
    P.ghost = ghostFor(P, H, placeUV(e));
    const G = P.ghost;
    let snd = 'place';
    if (H.from && tap) {                                                      // tap a placed ship → rotate it
      const o = H.from.o === 'h' ? 'v' : 'h';
      const rot = { size: H.size, r: clamp(H.from.r, 0, o === 'v' ? N - H.size : N - 1), c: clamp(H.from.c, 0, o === 'h' ? N - H.size : N - 1), o };
      if (fitsP(P, rot)) P.ships.splice(H.from.idx, 0, rot);
      else { P.ships.splice(H.from.idx, 0, { size: H.size, r: H.from.r, c: H.from.c, o: H.from.o }); snd = 'bad'; }
    } else if (G && G.ok) {
      P.ships.push({ size: G.size, r: G.r, c: G.c, o: G.o });
      if (!H.from) { P.tray.splice(P.sel, 1); P.sel = clamp(P.sel, 0, Math.max(0, P.tray.length - 1)); }
      spawnPlaceSplash(G);
    } else if (!G) {                                                          // dropped off the board
      if (H.from) { P.tray.push(H.size); P.sel = P.tray.length - 1; snd = 'tap'; }
      else snd = null;
    } else {                                                                  // overlaps another ship
      if (H.from) P.ships.splice(H.from.idx, 0, { size: H.size, r: H.from.r, c: H.from.c, o: H.from.o });
      snd = 'bad';
    }
    P.held = null; P.ghost = null;
    if (snd) { try { c.sound[snd](); } catch (x) {} }
    if (S.refreshPlace) S.refreshPlace();
  }
  function spawnPlaceSplash(s) {
    const pr = S.L.P.grid;
    shipCells(s).forEach(([r, c]) => S.parts.push({ k: 'ripple', pid: 'P', u: c + 0.5, v: r + 0.5, r0: 0.2, r1: 0.9, life: 700, max: 700, delay: 0 }));
    const [x, y] = pr.P(s.c + (s.o === 'h' ? s.size / 2 : 0.5), s.r + (s.o === 'v' ? s.size / 2 : 0.5));
    for (let i = 0; i < 14; i++) S.parts.push({ k: 'spray', x: x + rnd(-20, 20), y, vx: rnd(-40, 40), vy: -rnd(40, 140), g: 520, floor: y + 2, life: rnd(400, 700), max: 700, sz: rnd(0.8, 1.8) });
  }

  /* ---------------- shots: replay from committed state ---------------- */
  function cellsToShip(cells) {
    const rs = cells.map(x => x[0]), cs = cells.map(x => x[1]);
    const r = Math.min(...rs), c = Math.min(...cs);
    const o = cells.length > 1 && cells[0][0] === cells[1][0] ? 'h' : 'v';
    return { r, c, o, size: cells.length, cells };
  }
  // the committed state already holds the shot; until it LANDS we show the board without it
  function pendingShot(st) { const L = st.last; return L && st.phase === 'play' && L.id > S.doneId ? L : null; }
  function masked(board, L) {
    const b = { grid: board.grid, ships: board.ships, hits: board.hits.map(row => row.slice()) };
    b.hits[L.r][L.c] = 0; return b;
  }
  function viewBoard(st, i, forCanvas) {
    const L = pendingShot(st), b = st.boards[i];
    if (!L || 1 - L.by !== i) return b;
    if (forCanvas && S.anim && S.anim.id === L.id && S.anim.impacted) return b;
    return masked(b, L);
  }
  function resetShots() { S.anim = null; S.doneId = 0; S.parts = []; S.aim = null; S.slow = false; }
  function maybeReplay(st) {
    const L = st.last; if (!L || st.phase !== 'play') return;
    if (L.id < S.doneId) S.doneId = L.id - 1;                    // ids restarted → a different match
    if (L.id <= S.doneId || (S.anim && S.anim.id === L.id)) return;
    if (S.anim) finishAnim(true);                                  // a newer shot arrived: settle the old one
    startAnim(L, st);
  }
  function fleetGun() {                                          // the fore turret of my biggest ship afloat
    const ctx = S.ctx, me = ctx.me, b = viewBoard(ctx.state, me, true), F = S.L.F;
    const ships = S.R.shipsOf(b).filter(cells => !S.R.isSunk(b, cells)).map(cellsToShip).sort((a, b2) => b2.size - a.size);
    const s = ships[0]; if (!s) return [VW / 2, S.VH + 30];
    const t = layout(s.size).turrets; const a = t[t.length - 1][0];
    const [u, v] = toPlane(s, a, 0);
    return F.grid.P(u, v, DECK + 0.1);
  }
  function startAnim(L, st) {
    const ctx = S.ctx, mine = L.by === ctx.me, pid = mine ? 'E' : 'F', p = S.L[pid];
    const tb = st.boards[1 - L.by];
    let result = L.result;
    if (!result) result = tb.hits[L.r][L.c] === 1 ? (tb.grid[L.r][L.c] && S.R.isSunk(tb, (S.R.shipsOf(tb).find(cs => cs.some(([r, c]) => r === L.r && c === L.c)) || [[L.r, L.c]])) ? 'sunk' : 'hit') : 'miss';
    let ship = null;
    if (result === 'sunk') { const cells = S.R.shipsOf(tb).find(cs => cs.some(([r, c]) => r === L.r && c === L.c)); if (cells) ship = cellsToShip(cells); }
    const to = p.grid.P(L.c + 0.5, L.r + 0.5, pid === 'F' && result !== 'miss' ? DECK : 0);
    const from = mine ? fleetGun() : [clamp(to[0] + (L.c < 4 ? 120 : -120), 30, VW - 30), p.y - 250];
    const ctrl = mine ? [(from[0] + to[0]) / 2 + (to[0] < VW / 2 ? 40 : -40), Math.min(from[1], to[1]) - 200] : [(from[0] + to[0]) / 2, from[1] - 40];
    const calm = S.calm;
    const T = {
      launch: calm ? 0 : mine ? 260 : 560,
      flight: calm ? 480 : result === 'sunk' ? 1450 : 1100,
      tail: calm ? { miss: 450, hit: 600, sunk: 1300 }[result] : { miss: 1000, hit: 1300, sunk: 2750 }[result],
    };
    S.anim = { id: L.id, L, mine, pid, r: L.r, c: L.c, result, ship, rt: 0, T, end: T.launch + T.flight + T.tail,
      from, to, ctrl, trail: [], puffT: 0, fired: false, whistled: false, impacted: false, impactAt: 0, pos: from.slice(),
      s0: mine ? 1 : 0.8, s1: p.grid.s(L.r + 0.5), boomsAt: [700, 1500], bubT: 0 };
    S.aim = null;
    ensureLoop();
  }
  function finishAnim(quiet) {
    const A = S.anim; if (!A) return;
    S.anim = null; S.doneId = Math.max(S.doneId, A.id); S.slow = false;
    if (quiet) return;
    rerender();
  }
  const bez = (a, c, b, t) => [(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]];
  function flightP(A, u) {
    if (A.result === 'sunk' && !S.calm) return u < 0.6 ? (u / 0.6) * 0.84 : 0.84 + ((u - 0.6) / 0.4) * 0.16;   // slow-mo on the kill
    return u * 0.8 + easeIO(u) * 0.2;
  }
  function sinkProgress(A) {
    if (!A || !A.impacted) return 0;
    return clamp((A.rt - A.impactAt - (S.calm ? 60 : 280)) / Math.max(300, A.T.tail - (S.calm ? 200 : 750)), 0, 1);
  }

  /* ---------------- effects ---------------- */
  function muzzle(x, y) {
    S.parts.push({ k: 'flash', x, y, r: 60, life: 180, max: 180 });
    for (let i = 0; i < 10; i++) S.parts.push({ k: 'smoke', x: x + rnd(-4, 4), y: y - rnd(0, 6), vx: rnd(-20, 20), vy: -rnd(15, 45), r: rnd(4, 7), gr: rnd(10, 18), life: rnd(700, 1200), max: 1200, c: '120,125,140' });
    for (let i = 0; i < 8; i++) { const a = rnd(-2.4, -0.7), v = rnd(120, 260); S.parts.push({ k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(150, 300), max: 300 }); }
    S.shake = Math.max(S.shake, 2.5);
  }
  function boom(x, y, s, big, pid, u, v, small) {
    const m = small ? 0.55 : 1;
    S.parts.push({ k: 'flash', x, y, r: (big ? 120 : 90) * s * m, life: 220, max: 220 });
    S.parts.push({ k: 'light', x, y, r: 150 * s * m, life: 1100, max: 1100 });
    const nf = Math.round((big ? 10 : 7) * m);
    for (let i = 0; i < nf; i++) S.parts.push({ k: 'fire', x: x + rnd(-9, 9) * s, y: y - rnd(0, 10) * s, vx: rnd(-40, 40) * s, vy: -rnd(40, 130) * s, r0: rnd(7, 13) * s * m, r1: rnd(24, 38) * s * (big ? 1.35 : 1) * m, life: rnd(650, 1050), max: 1050 });
    const nd = Math.round((big ? 28 : 18) * m);
    for (let i = 0; i < nd; i++) { const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05), sp = rnd(140, 430) * s; S.parts.push({ k: 'debris', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60 * s, g: 900 * s, floor: y + rnd(-3, 12) * s, life: rnd(900, 1500), max: 1500, sz: rnd(1.4, 3.6) * s, rot: rnd(0, 6), vr: rnd(-0.3, 0.3), c: ['#2a2f38', '#ff9a3c', '#434955', '#ffd27a', '#15181d'][i % 5] }); }
    for (let i = 0; i < 16 * m; i++) { const a = rnd(-Math.PI, 0), sp = rnd(200, 520) * s; S.parts.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(250, 520), max: 520 }); }
    for (let i = 0; i < 7 * m; i++) S.parts.push({ k: 'smoke', x: x + rnd(-10, 10) * s, y: y - rnd(10, 26) * s, vx: rnd(-12, 12) * s, vy: -rnd(16, 40) * s, r: rnd(5, 9) * s, gr: rnd(9, 16) * s, life: rnd(1300, 2200), max: 2200, c: '44,40,48', al: 0.34, delay: rnd(250, 500) });
    if (pid) S.parts.push({ k: 'ring', pid, u, v, r0: 0.15, r1: big ? 2.8 : 1.9, life: 650, max: 650, col: '255,214,160' });
    if (pid) S.parts.push({ k: 'ripple', pid, u, v, r0: 0.3, r1: 1.6, life: 1200, max: 1200, delay: 120 });
  }
  function splash(x, y, s, pid, u, v) {
    S.parts.push({ k: 'column', x, y, s, life: 1400, max: 1400 });
    for (let i = 0; i < 38; i++) S.parts.push({ k: 'spray', x: x + rnd(-6, 6) * s, y: y - rnd(0, 30) * s, vx: rnd(-70, 70) * s, vy: -rnd(140, 430) * s, g: 760 * s, floor: y + rnd(-2, 6) * s, life: rnd(700, 1300), max: 1300, sz: rnd(0.9, 2.4) * s, delay: rnd(0, 180) });
    for (let i = 0; i < 3; i++) S.parts.push({ k: 'ripple', pid, u, v, r0: 0.1, r1: 1.3 + i * 0.55, life: 1500, max: 1500, delay: i * 200 });
    S.parts.push({ k: 'mist', x, y: y - 26 * s, r: 26 * s, life: 1400, max: 1400 });
  }
  function impact(A) {
    A.impacted = true; A.impactAt = A.rt;
    const ctx = S.ctx, p = S.L[A.pid], s = p.grid.s(A.r + 0.5), [x, y] = A.to, u = A.c + 0.5, v = A.r + 0.5;
    const sunk = A.result === 'sunk';
    if (A.result === 'miss') { splash(x, y, s, A.pid, u, v); S.shake = Math.max(S.shake, 3); sfx('splash'); }
    else {
      boom(x, y, s, sunk, A.pid, u, v); S.shake = Math.max(S.shake, sunk ? 14 : 9); S.flash = sunk ? 0.55 : 0.32; sfx('boom', sunk);
      if (!A.mine) { try { if (navigator.vibrate) navigator.vibrate(sunk ? [60, 40, 120] : [40, 30, 70]); } catch (e) {} }
    }
    try { if (A.result !== 'miss') ctx.sound[A.mine ? 'good' : 'bad'](); } catch (e) {}
    if (sunk && window.fxBanner) { try { window.fxBanner(A.mine ? 'SUNK!' : 'SHIP LOST', ctx.players[A.L.by].color); } catch (e) {} }
  }

  /* ---------------- per-frame simulation ---------------- */
  function step(dt, wall) {
    S.t += dt; S.lockT += dt;
    const A = S.anim;
    S.slow = false;
    if (A) {
      A.rt += wall || dt;
      if (!A.fired) { A.fired = true; if (A.mine) { muzzle(A.from[0], A.from[1]); sfx('gun'); } }
      const fT = A.rt - A.T.launch;
      if (fT >= 0 && !A.whistled) { A.whistled = true; sfx('whistle', A.T.flight); }
      if (fT >= 0 && !A.impacted) {
        const u = clamp(fT / A.T.flight, 0, 1), pp = flightP(A, u);
        if (A.result === 'sunk' && u > 0.6 && !S.calm) S.slow = true;
        A.pos = bez(A.from, A.ctrl, A.to, pp); A.pp = pp;
        A.trail.push(A.pos.slice()); if (A.trail.length > 26) A.trail.shift();
        A.puffT -= dt;
        if (A.puffT <= 0) { A.puffT = S.slow ? 40 : 14; const sc = A.s0 + (A.s1 - A.s0) * pp; S.parts.push({ k: 'smoke', x: A.pos[0] + rnd(-1.5, 1.5), y: A.pos[1] + rnd(-1.5, 1.5), vx: rnd(-5, 5), vy: -rnd(2, 10), r: 1.2 * sc, gr: 9 * sc, life: 520, max: 520, c: '170,176,196', al: 0.16 }); }
        if (u >= 1) impact(A);
      }
      if (A.impacted) {
        const since = A.rt - A.impactAt;
        if (A.result === 'sunk' && since < 650 && !S.calm) S.slow = true;
        if (A.result === 'sunk' && A.ship) sinkingFx(A, since, dt);
      }
      if (A.rt >= A.end) finishAnim();
    }
    // camera: follow the shell, push in on the impact, rest at full view
    const tg = camTarget(), c = S.cam, e = 1 - Math.exp(-dt / (S.anim ? 150 : 220));
    c.x += (tg.x - c.x) * e; c.y += (tg.y - c.y) * e; c.z += (tg.z - c.z) * e;
    const hw = VW / (2 * c.z), hh = S.VH / (2 * c.z);
    c.x = clamp(c.x, hw, VW - hw); c.y = clamp(c.y, hh, S.VH - hh);
    // particles (slow motion stretches them too)
    const pdt = dt * (S.slow ? 0.35 : 1), k = pdt / 1000;
    S.parts = S.parts.filter(q => {
      if (q.delay > 0) { q.delay -= pdt; return true; }
      q.life -= pdt;
      if (q.vx != null) { q.x += q.vx * k; q.y += q.vy * k; }
      if (q.g) q.vy += q.g * k;
      if (q.k === 'debris') { q.rot += q.vr; if (q.y > q.floor && q.vy > 0) { q.y = q.floor; q.vx *= 0.2; q.vy = 0; q.g = 0; q.life = Math.min(q.life, 260); } }
      if (q.k === 'spray' && q.y > q.floor && q.vy > 0) q.life = 0;
      if (q.k === 'smoke') { q.r += q.gr * k; q.vx += 6 * k; }
      if (q.k === 'fire') { q.vx *= 0.97; q.vy *= 0.97; }
      return q.life > 0;
    });
    if (S.parts.length > 700) S.parts.splice(0, S.parts.length - 700);
    S.shake *= Math.exp(-dt / 110); if (S.shake < 0.2) S.shake = 0;
    S.flash *= Math.exp(-dt / 120); if (S.flash < 0.01) S.flash = 0;
    const sh = S.calm ? 0 : S.shake; S.sx = sh ? rnd(-1, 1) * sh : 0; S.sy = sh ? rnd(-1, 1) * sh : 0;
    // ambient: distant gun flashes on the horizon + moonlight glints
    S.nextFlash -= dt;
    if (S.nextFlash <= 0) { S.nextFlash = rnd(3800, 9000); S.flashes.push({ x: rnd(30, VW - 30), t: 0, big: Math.random() < 0.4 }); }
    S.flashes = S.flashes.filter(f => (f.t += dt) < 900);
    for (let i = 0; i < 2; i++) if (S.sparkles.length < 26 && Math.random() < dt / 90) S.sparkles.push({ x: rnd(-10, VW + 10), d: rnd(1.1, 9), life: rnd(250, 700), max: 700 });
    S.sparkles = S.sparkles.filter(q => (q.life -= dt) > 0);
  }
  function sinkingFx(A, since, dt) {
    const p = S.L[A.pid], pr = p.grid, sh = A.ship;
    A.bubT -= dt;
    if (A.bubT <= 0 && since > 250) {
      A.bubT = 45;
      const a = rnd(0.2, sh.size - 0.2), b = rnd(-0.4, 0.4), [u, v] = toPlane(sh, a, b), [x, y] = pr.P(u, v, 0), s = pr.s(v);
      S.parts.push({ k: 'bubble', x, y, vx: rnd(-3, 3), vy: -rnd(4, 14) * s, r: rnd(0.8, 2.2) * s, life: rnd(500, 1100), max: 1100 });
    }
    A.boomsAt.forEach((t, i) => {
      if (since >= t && !(A['b' + i])) {
        A['b' + i] = 1;
        const cell = sh.cells[Math.floor(Math.random() * sh.cells.length)], [x, y] = pr.P(cell[1] + 0.5, cell[0] + 0.5, 0.1);
        boom(x, y, pr.s(cell[0] + 0.5), false, A.pid, cell[1] + 0.5, cell[0] + 0.5, true);
        S.shake = Math.max(S.shake, 5); sfx('boom', false);
      }
    });
  }
  function camTarget() {
    const rest = { x: VW / 2, y: S.VH / 2, z: 1 }, A = S.anim;
    if (!A || S.calm) return rest;
    const p = S.L[A.pid], pcy = p.y + p.h / 2;
    if (A.rt > A.end - 520) return rest;                               // ease home before the card / next turn
    if (A.rt < A.T.launch) return A.mine ? { x: VW / 2, y: A.from[1] - 120, z: 1.06 } : { x: VW / 2, y: pcy, z: 1.45 };
    if (!A.impacted) {
      const pp = A.pp || 0;
      return A.mine ? { x: VW / 2 + (A.pos[0] - VW / 2) * 0.55, y: A.pos[1] + 30, z: 1.12 + pp * 0.5 }
                    : { x: VW / 2 + (A.pos[0] - VW / 2) * 0.5, y: Math.max(pcy - 20, A.pos[1] + 40), z: 1.45 + pp * 0.25 };
    }
    const sunk = A.result === 'sunk', since = A.rt - A.impactAt;
    if (sunk && A.ship) {                                               // frame the whole wreck as it goes down
      const sh = A.ship, [u, v] = toPlane(sh, sh.size / 2, 0), [x, y] = p.grid.P(u, v, 0);
      return { x, y: y - 26, z: since < 500 ? 1.95 : 1.7 };
    }
    return { x: A.to[0], y: A.to[1] - 28, z: A.result === 'miss' ? 1.55 : 1.75 };
  }

  /* ---------------- drawing ---------------- */
  function view(g, f) {
    const k = S.dpr * S.scale, c = S.cam, z = 1 + (c.z - 1) * f;
    const cx = VW / 2 + (c.x - VW / 2) * f, cy = S.VH / 2 + (c.y - S.VH / 2) * f;
    g.setTransform(k * z, 0, 0, k * z, k * (VW / 2 - z * cx + S.sx * f), k * (S.VH / 2 - z * cy + S.sy * f));
  }
  function mkLayer() {
    const c = document.createElement('canvas'); c.width = S.W; c.height = S.H;
    const g = c.getContext('2d'); const k = S.dpr * S.scale; g.setTransform(k, 0, 0, k, 0, 0);
    return [c, g];
  }
  function buildBg() {
    const [bg, b] = mkLayer(), [sky, s] = mkLayer();
    b.fillStyle = '#02050c'; b.fillRect(0, 0, VW, S.VH);
    S.L.panels.forEach(p => {
      const bot = p.y + p.h;
      // sky
      const sg = b.createLinearGradient(0, p.y, 0, p.hy);
      sg.addColorStop(0, '#040819'); sg.addColorStop(0.6, '#0b1433'); sg.addColorStop(1, '#1c2a55');
      b.fillStyle = sg; b.fillRect(p.x, p.y, p.w, p.hy - p.y);
      // sea: misty horizon → deep, dark near water
      const wg = b.createLinearGradient(0, p.hy, 0, bot);
      wg.addColorStop(0, '#1f3160'); wg.addColorStop(0.08, '#13244b'); wg.addColorStop(0.35, '#0a1836'); wg.addColorStop(1, '#030a19');
      b.fillStyle = wg; b.fillRect(p.x, p.hy, p.w, bot - p.hy);
      // moonlight pooled on the water
      const mg = b.createRadialGradient(MOON_X, p.hy + (bot - p.hy) * 0.35, 4, MOON_X, p.hy + (bot - p.hy) * 0.35, (bot - p.hy) * 0.85);
      mg.addColorStop(0, 'rgba(120,150,210,.16)'); mg.addColorStop(1, 'rgba(120,150,210,0)');
      b.fillStyle = mg; b.fillRect(p.x, p.hy, p.w, bot - p.hy);
      // coastline far away
      if (p.moon) {
        b.fillStyle = '#081026';
        b.beginPath(); b.moveTo(p.x, p.hy + 1);
        [[0, -6], [22, -9], [48, -14], [70, -11], [96, -16], [120, -8], [150, -4], [175, -2], [200, 0]].forEach(([x, y]) => b.lineTo(p.x + x, p.hy + y));
        b.lineTo(p.x + 200, p.hy + 1); b.closePath(); b.fill();
        [[34, -9], [58, -12], [88, -12], [131, -6]].forEach(([x, y], i) => { b.fillStyle = i % 2 ? 'rgba(255,200,120,.8)' : 'rgba(255,230,170,.7)'; b.fillRect(p.x + x, p.hy + y, 1.3, 1.3); });
        b.fillStyle = '#081026'; b.beginPath(); b.moveTo(VW - 70, p.hy + 1); b.lineTo(VW - 52, p.hy - 5); b.lineTo(VW - 20, p.hy - 7); b.lineTo(VW, p.hy - 3); b.lineTo(VW, p.hy + 1); b.fill();
      }
      // horizon haze
      const hz = b.createLinearGradient(0, p.hy - 16, 0, p.hy + 20);
      hz.addColorStop(0, 'rgba(110,140,210,0)'); hz.addColorStop(0.5, 'rgba(110,140,210,.28)'); hz.addColorStop(1, 'rgba(110,140,210,0)');
      b.fillStyle = hz; b.fillRect(p.x, p.hy - 16, p.w, 36);
      // stars, moon and thin clouds go on the parallax layer
      for (let i = 0; i < (p.moon ? 90 : 26); i++) {
        const x = p.x + Math.random() * p.w, y = p.y + Math.random() * (p.hy - p.y - 6), big = Math.random() < 0.08;
        s.fillStyle = `rgba(230,236,255,${0.25 + Math.random() * 0.6})`; s.beginPath(); s.arc(x, y, big ? 1.1 : 0.35 + Math.random() * 0.5, 0, 7); s.fill();
      }
      if (p.moon) {
        const my = p.y + 30, halo = s.createRadialGradient(MOON_X, my, 6, MOON_X, my, 90);
        halo.addColorStop(0, 'rgba(255,240,205,.38)'); halo.addColorStop(1, 'rgba(255,240,205,0)');
        s.fillStyle = halo; s.beginPath(); s.arc(MOON_X, my, 90, 0, 7); s.fill();
        const mo = s.createRadialGradient(MOON_X - 4, my - 4, 2, MOON_X, my, 14);
        mo.addColorStop(0, '#fffaf0'); mo.addColorStop(1, '#efd9a0');
        s.fillStyle = mo; s.beginPath(); s.arc(MOON_X, my, 13, 0, 7); s.fill();
        s.fillStyle = 'rgba(170,140,90,.22)'; [[-4, 3, 3.2], [5, -4, 2.4], [3, 6, 1.7]].forEach(([dx, dy, r]) => { s.beginPath(); s.arc(MOON_X + dx, my + dy, r, 0, 7); s.fill(); });
        s.fillStyle = 'rgba(150,165,215,.09)';
        [[90, p.y + 24, 80], [210, p.y + 44, 110], [355, p.y + 50, 70]].forEach(([x, y, w]) => { s.beginPath(); s.ellipse(x, y, w, 5, 0, 0, 7); s.fill(); s.beginPath(); s.ellipse(x + w * 0.3, y - 4, w * 0.5, 4, 0, 0, 7); s.fill(); });
      }
    });
    // fog sprite
    const fc = document.createElement('canvas'); fc.width = 512; fc.height = 64; const f = fc.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 512, y = 22 + Math.random() * 22, r = 18 + Math.random() * 36;
      [x, x - 512, x + 512].forEach(xx => { const gr = f.createRadialGradient(xx, y, 0, xx, y, r); gr.addColorStop(0, 'rgba(160,180,230,.22)'); gr.addColorStop(1, 'rgba(160,180,230,0)'); f.fillStyle = gr; f.fillRect(xx - r, y - r, r * 2, r * 2); });
    }
    S.bg = bg; S.sky = sky; S.fog = fc; S.bgKey = S.W + ':' + S.H + ':' + S.mode;
  }

  function draw() {
    const g = S.g, ctx = S.ctx; if (!g || !ctx) return;
    if (!S.W) { fit(); if (!S.W) return; }
    if (S.bgKey !== S.W + ':' + S.H + ':' + S.mode) buildBg();
    const st = ctx.state;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#02050c'; g.fillRect(0, 0, S.W, S.H);
    S.L.panels.forEach(p => drawPanel(g, p, st));
    view(g, 1);
    if (S.L.F) {                                                  // steel divider between the two views
      const y0 = S.L.E.y + S.L.E.h, y1 = S.L.F.y, dg = g.createLinearGradient(0, y0, 0, y1);
      dg.addColorStop(0, '#0d1830'); dg.addColorStop(1, '#040912');
      g.fillStyle = dg; g.fillRect(-20, y0, VW + 40, y1 - y0);
      g.fillStyle = 'rgba(120,200,255,.3)'; g.fillRect(-20, y0, VW + 40, 0.8); g.fillRect(-20, y1 - 0.8, VW + 40, 0.8);
    }
    drawShell(g);
    drawParts(g, null);
    // screen space: vignette + flash
    const k = S.dpr * S.scale;
    g.setTransform(k, 0, 0, k, 0, 0);
    if (!S.vig || S.vigKey !== S.bgKey) { S.vig = g.createRadialGradient(VW / 2, S.VH / 2, S.VH * 0.3, VW / 2, S.VH / 2, S.VH * 0.75); S.vig.addColorStop(0, 'rgba(0,0,0,0)'); S.vig.addColorStop(1, 'rgba(0,0,0,.42)'); S.vigKey = S.bgKey; }
    g.fillStyle = S.vig; g.fillRect(0, 0, VW, S.VH);
    if (S.flash > 0.01) { g.fillStyle = `rgba(255,236,200,${S.flash * 0.45})`; g.fillRect(0, 0, VW, S.VH); }
  }

  function drawPanel(g, p, st) {
    g.save();
    view(g, 1);
    g.beginPath(); g.rect(p.x, p.y, p.w, p.h); g.clip();
    const kx = S.W / VW, top = Math.max(0, p.y - 20), bot = Math.min(S.VH, p.y + p.h + 20);
    g.drawImage(S.bg, 0, top * kx, S.W, (bot - top) * kx, 0, top, VW, bot - top);            // this panel's slice only
    view(g, 0.3); g.drawImage(S.sky, 0, p.y * kx, S.W, (p.hy + 10 - p.y) * kx, 0, p.y, VW, p.hy + 10 - p.y);
    view(g, 0.55); drawHorizonFx(g, p);
    view(g, 1);
    drawWater(g, p);
    drawParts(g, p.id, true);
    drawBoard(g, p, st);
    drawParts(g, p.id, false);
    view(g, 1.12); drawFog(g, p);
    view(g, 1); drawPanelLabel(g, p, st);
    g.restore();
  }

  function drawHorizonFx(g, p) {
    const t = S.t;
    if (p.moon) {                                            // two searchlights sweeping from the shore
      g.save(); g.globalCompositeOperation = 'lighter';
      [[62, -1.95, 0.00021, 0.5], [VW - 40, -1.2, 0.00016, 2.1]].forEach(([x, base, sp, ph]) => {
        const a = base + Math.sin(t * sp + ph) * 0.42, L = 320, w = 0.06;
        const gr = g.createLinearGradient(x, p.hy, x + Math.cos(a) * L, p.hy + Math.sin(a) * L);
        gr.addColorStop(0, 'rgba(200,220,255,.16)'); gr.addColorStop(1, 'rgba(200,220,255,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x, p.hy - 3);
        g.lineTo(x + Math.cos(a - w) * L, p.hy + Math.sin(a - w) * L); g.lineTo(x + Math.cos(a + w) * L, p.hy + Math.sin(a + w) * L); g.closePath(); g.fill();
      });
      g.restore();
    }
    S.flashes.forEach(f => {                                  // distant naval gunfire
      const a = f.t < 90 ? f.t / 90 : Math.max(0, 1 - (f.t - 90) / 700), fl = a * (0.7 + 0.3 * Math.sin(f.t * 0.09));
      g.save(); g.globalCompositeOperation = 'lighter';
      const r = f.big ? 70 : 42, gr = g.createRadialGradient(f.x, p.hy, 0, f.x, p.hy, r);
      gr.addColorStop(0, `rgba(255,190,130,${0.5 * fl})`); gr.addColorStop(1, 'rgba(255,150,90,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(f.x, p.hy, r, r * 0.5, 0, 0, 7); g.fill();
      g.restore();
    });
  }

  function wave(x, kx, ph, t) { return Math.sin(x * kx + t * 0.0011 + ph) * 0.65 + Math.sin(x * kx * 2.17 - t * 0.0017 + ph * 1.3) * 0.35; }
  function drawWater(g, p) {
    const t = S.t, hy = p.hy, A = p.y + p.h - hy, x0 = p.x - 24, x1 = p.x + p.w + 24;
    const off = (t * 0.00022) % 1, NL = 24, glit = [[], [], []];
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (let j = NL; j >= 0; j--) {
      const D = 1 + (j + 1 - off) * 1.3;
      const y0 = hy + A / D; if (y0 < hy + 1) continue;
      const amp = Math.min(3.6, 6.5 / D) * (A / 300 + 0.4), kx = 0.024 * Math.pow(D, 0.55), ph = (j - Math.floor(t * 0.00022)) * 1.93;
      const fade = Math.min(1, (NL + 1 - j - (1 - off)) / 3) * Math.min(1, (y0 - hy) / 6);
      const al = Math.min(0.55, 0.95 / Math.sqrt(D)) * fade;
      const stepX = D > 7 ? 44 : D > 3 ? 26 : 17;
      const pts = [];
      for (let x = x0; x <= x1 + stepX; x += stepX) pts.push([x, y0 + amp * wave(x, kx, ph, t)]);
      // shadowed trough band under each swell
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y + amp * 1.6) : g.moveTo(x, y + amp * 1.6));
      g.strokeStyle = `rgba(0,3,12,${al * 0.75})`; g.lineWidth = Math.max(0.8, 5 / D); g.stroke();
      // moonlit crest
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
      g.strokeStyle = `rgba(120,160,235,${al * 0.55})`; g.lineWidth = Math.max(0.5, 2.2 / D); g.stroke();
      // foam flecks on near crests
      if (D < 3.4) {
        g.fillStyle = `rgba(215,232,255,${0.28 * fade})`;
        for (let i = 0; i < pts.length; i++) { const w = wave(pts[i][0], kx, ph, t); if (w > 0.72) { g.beginPath(); g.ellipse(pts[i][0] + 3, pts[i][1] - 0.6, 3.4 / D + 1.2, 0.7, 0, 0, 7); g.fill(); } }
      }
      // moonlight glitter: a broken column of sparkles under the moon
      if (D < 20) {
        const spread = 16 + 120 / D;
        for (let i = 0; i < 5; i++) {
          const hsh = hash(j * 7.1 + Math.floor(t / 900 + i * 0.37), i), xx = MOON_X + (hsh - 0.5) * 2 * spread;
          const fl = 0.5 + 0.5 * Math.sin(t * 0.009 + hsh * 40), fall = Math.exp(-Math.pow((xx - MOON_X) / spread, 2) * 1.6);
          const a = fl * fall * fade * (0.28 + 0.4 / Math.sqrt(D)), w = 1.5 + 11 / D;
          if (a > 0.03) glit[a > 0.45 ? 2 : a > 0.2 ? 1 : 0].push([xx - w / 2, y0 + amp * wave(xx, kx, ph, t) - 0.5, w, Math.max(0.6, 1.8 / Math.sqrt(D))]);
        }
      }
    }
    // moonlight glitter + specular glints anywhere on the swell
    g.save(); g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgb(255,240,205)';
    glit.forEach((bucket, i) => {                               // three alpha buckets → three fills
      if (!bucket.length) return;
      g.globalAlpha = [0.14, 0.32, 0.6][i]; g.beginPath(); bucket.forEach(r => g.rect(r[0], r[1], r[2], r[3])); g.fill();
    });
    g.globalAlpha = 0.35; g.fillStyle = 'rgb(210,230,255)'; g.beginPath();
    S.sparkles.forEach(q => {
      const y = hy + A / q.d; if (y > p.y + p.h) return;
      const w = (1 + 6 / q.d) * Math.sin((q.life / q.max) * Math.PI);
      g.rect(q.x - w, y, w * 2, 0.8); g.rect(q.x - 0.4, y - w * 0.4, 0.8, w * 0.8);
    });
    g.fill(); g.globalAlpha = 1;
    g.restore();
  }
  function drawFog(g, p) {
    if (!S.fog) return;
    const t = S.t;
    [[p.hy - 30, 60, 0.9, 0.006], [p.hy + (p.y + p.h - p.hy) * 0.45, 90, 0.35, 0.011]].forEach(([y, h, a, sp], i) => {
      const off = (t * sp + i * 170) % 512;
      g.globalAlpha = a;
      for (let x = -off - 60; x < VW + 60; x += 512) g.drawImage(S.fog, x, y, 512, h);
    });
    g.globalAlpha = 1;
  }

  function quad(g, pr, u0, v0, u1, v1, h) {
    const a = pr.P(u0, v0, h), b = pr.P(u1, v0, h), c = pr.P(u1, v1, h), d = pr.P(u0, v1, h);
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.lineTo(d[0], d[1]); g.closePath();
  }
  function ring(g, pr, u, v, rad, h) {
    g.beginPath();
    const n = rad < 0.7 ? 16 : 32;
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, [x, y] = pr.P(u + Math.cos(a) * rad, v + Math.sin(a) * rad, h); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.closePath();
  }
  function drawGrid(g, p, col, strong) {
    const pr = p.grid, t = S.t;
    // faint checker so the squares read on a small screen
    g.beginPath();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if ((r + c) % 2) { const a = pr.P(c, r), b = pr.P(c + 1, r), d = pr.P(c + 1, r + 1), e = pr.P(c, r + 1); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(d[0], d[1]); g.lineTo(e[0], e[1]); g.closePath(); }
    g.fillStyle = 'rgba(90,200,255,.035)'; g.fill();
    // sonar sweep, clipped to the grid
    g.save(); quad(g, pr, 0, 0, N, N); g.clip();
    const th = t * 0.0011, R = 6;
    g.beginPath(); { const [cx, cy] = pr.P(4, 4); g.moveTo(cx, cy); }
    for (let i = 0; i <= 14; i++) { const a = th - 0.7 + i / 14 * 0.7, [x, y] = pr.P(4 + Math.cos(a) * R, 4 + Math.sin(a) * R); g.lineTo(x, y); }
    g.closePath(); g.fillStyle = hexA(col, strong ? 0.06 : 0.04); g.fill();
    g.beginPath(); { const [cx, cy] = pr.P(4, 4), [x, y] = pr.P(4 + Math.cos(th) * R, 4 + Math.sin(th) * R); g.moveTo(cx, cy); g.lineTo(x, y); }
    g.strokeStyle = hexA(col, strong ? 0.35 : 0.22); g.lineWidth = 1; g.stroke();
    const pk = (t % 3400) / 3400;                               // sonar ping
    ring(g, pr, 4, 4, 0.3 + pk * 5.6); g.strokeStyle = hexA(col, (1 - pk) * 0.3); g.lineWidth = 1.2; g.stroke();
    g.restore();
    // lines
    g.lineWidth = 0.8; g.strokeStyle = hexA(col, strong ? 0.26 : 0.18);
    g.beginPath();
    for (let i = 1; i < N; i++) {
      let a = pr.P(i, 0), b = pr.P(i, N); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      a = pr.P(0, i); b = pr.P(N, i); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
    }
    g.stroke();
    quad(g, pr, 0, 0, N, N); g.strokeStyle = hexA(col, strong ? 0.55 : 0.35); g.lineWidth = 1.3; g.stroke();
    // tick marks at the corners
    g.strokeStyle = hexA(col, 0.8); g.lineWidth = 2;
    [[0, 0, 1, 1], [N, 0, -1, 1], [0, N, 1, -1], [N, N, -1, -1]].forEach(([u, v, du, dv]) => {
      const a = pr.P(u + du * 0.5, v), b = pr.P(u, v), c = pr.P(u, v + dv * 0.5);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke();
    });
    // coordinates A–H / 1–8
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < N; i++) {
      const s1 = pr.s(i + 0.5), [x, y] = pr.P(-0.36, i + 0.5);
      g.font = `700 ${Math.round(12 * s1 * (strong ? 1 : 0.85))}px Orbitron, "Chakra Petch", system-ui, sans-serif`;
      g.fillStyle = hexA(col, 0.72); g.fillText(ROWS[i], x, y);
      const s0 = pr.s(0), [x2, y2] = pr.P(i + 0.5, -0.36);
      g.font = `700 ${Math.round(11 * s0 * (strong ? 1 : 0.85))}px Orbitron, "Chakra Petch", system-ui, sans-serif`;
      g.fillText(String(i + 1), x2, y2);
    }
  }
  function drawPanelLabel(g, p, st) {
    const ctx = S.ctx, me = ctx.me;
    const pill = (x, y, text, col, right) => {
      g.font = '700 10px Orbitron, "Chakra Petch", system-ui, sans-serif';
      const w = g.measureText(text).width + 22, xx = right ? x - w : x;
      rr(g, xx, y, w, 19, 9.5); g.fillStyle = 'rgba(2,6,16,.62)'; g.fill();
      g.strokeStyle = hexA(col, 0.35); g.lineWidth = 1; g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(xx + 9, y + 9.5, 2.6, 0, 7); g.fill();
      g.fillStyle = '#e6eeff'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(text, xx + 15, y + 10);
    };
    if (p.id === 'E') {
      const foe = 1 - me;
      pill(p.x + 8, p.y + 8, 'ENEMY WATERS', ctx.players[foe].color);
      const hint = hintText(st);
      if (hint) {
        g.font = '700 10px Orbitron, "Chakra Petch", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const a = 0.55 + 0.35 * Math.sin(S.t * 0.004);
        g.fillStyle = `rgba(2,6,16,.5)`; const w = g.measureText(hint).width + 20; rr(g, VW / 2 - w / 2, p.y + p.h - 22, w, 17, 8.5); g.fill();
        g.fillStyle = `rgba(220,235,255,${a})`; g.fillText(hint, VW / 2, p.y + p.h - 13);
      }
    } else if (p.id === 'F') {
      pill(p.x + 8, p.y + 7, 'YOUR FLEET', ctx.players[me].color);
    } else if (p.id === 'P') {
      pill(p.x + 8, p.y + 8, S.view && S.view.wait ? 'YOUR WATERS' : 'DEPLOY YOUR FLEET', ctx.players[me].color);
      if (S.view && S.view.wait) {
        g.font = '800 13px Orbitron, "Chakra Petch", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const w = g.measureText(S.view.wait).width + 34, y = p.y + p.h * 0.52;
        rr(g, VW / 2 - w / 2, y - 17, w, 34, 17); g.fillStyle = 'rgba(2,6,16,.7)'; g.fill();
        g.strokeStyle = hexA(ctx.players[1 - me].color, 0.5 + 0.3 * Math.sin(S.t * 0.004)); g.lineWidth = 1.2; g.stroke();
        g.fillStyle = '#eaf0ff'; g.fillText(S.view.wait, VW / 2, y + 1);
      }
    }
  }
  function hintText(st) {
    const ctx = S.ctx;
    if (ctx.status === 'finished') return '';
    if (S.anim) return S.anim.mine ? '' : '';
    if (ctx.isMyTurn) return S.aim ? `TAP ${cellName(S.aim.r, S.aim.c)} AGAIN OR PRESS FIRE` : 'TAP A SQUARE TO AIM';
    return `${String(ctx.players[1 - ctx.me].name).toUpperCase()} IS AIMING…`;
  }

  /* ---- board contents, painted far → near ---- */
  function drawBoard(g, p, st) {
    const ctx = S.ctx, me = ctx.me, pr = p.grid, A = S.anim, items = [];
    if (p.id === 'P') {
      drawGrid(g, p, ctx.players[me].color, true);
      const P = S.place, ships = P ? P.ships : (S.view && S.view.ships) || [];
      ships.forEach(s => items.push([s.o === 'v' ? s.r + s.size : s.r + 1, () => drawShip(g, pr, s, { side: 'mine', state: 'placed' })]));
      if (P && P.ghost) {
        const G = P.ghost, col = G.ok ? '#79f5b6' : '#ff4d6d';
        shipCells(G).forEach(([r, c]) => { quad(g, pr, c + 0.04, r + 0.04, c + 0.96, r + 0.96); g.fillStyle = hexA(col, 0.2); g.fill(); g.strokeStyle = hexA(col, 0.7); g.lineWidth = 1.2; g.stroke(); });
        items.push([(G.o === 'v' ? G.r + G.size : G.r + 1) + 0.01, () => drawShip(g, pr, G, { side: 'mine', state: 'ghost', ghost: col, still: false })]);
      }
      items.sort((a, b) => a[0] - b[0]).forEach(x => x[1]());
      return;
    }
    const idx = p.id === 'E' ? 1 - me : me, side = p.id === 'E' ? 'enemy' : 'mine';
    const b = viewBoard(st, idx, true), R = S.R;
    drawGrid(g, p, p.id === 'E' ? '#4fe3ff' : '#6fd6ff', p.id === 'E');
    const ships = R.shipsOf(b).map(cellsToShip);
    const sinking = A && A.pid === p.id && A.impacted && A.ship ? A.ship : null;
    const sameShip = (s1, s2) => s1 && s2 && s1.r === s2.r && s1.c === s2.c && s1.o === s2.o && s1.size === s2.size;
    const sunkSet = {};
    ships.forEach(s => {
      const sunk = R.isSunk(b, s.cells);
      if (sunk) s.cells.forEach(([r, c]) => sunkSet[r + ',' + c] = 1);
      const near = s.o === 'v' ? s.r + s.size : s.r + 1;
      if (sameShip(s, sinking)) {
        const sp = sinkProgress(A), e = easeIO(sp), e1 = easeIO((sp - 0.12) / 0.45), e2 = easeIO((sp - 0.3) / 0.7);
        items.push([near, () => { drawSlick(g, pr, s, e); drawShip(g, pr, s, { side, state: 'sinking', sink: WRECK.sink * e2, list: WRECK.list * e1, pitch: WRECK.pitch * e1, char: 0.1 + 0.62 * e, alpha: side === 'enemy' ? clamp(sp * 7, 0, 1) : 1, hits: b.hits, glow: 1 - sp * 0.5, reveal: side === 'enemy' ? 1 - clamp(sp * 3, 0, 1) : 0 }); }]);
      } else if (sunk) {
        items.push([near, () => { drawSlick(g, pr, s, 1); drawShip(g, pr, s, { side, state: 'wreck', sink: WRECK.sink, list: WRECK.list, pitch: WRECK.pitch, char: 0.72, still: true, hits: b.hits }); }]);
      } else if (side === 'mine') {
        items.push([near, () => drawShip(g, pr, s, { side, state: 'afloat', hits: b.hits })]);
      }
      // an enemy ship still afloat is NEVER drawn — only its hit squares burn (below)
    });
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const hv = b.hits[r][c]; if (!hv) continue;
      const u = c + 0.5, v = r + 0.5, key = r + ',' + c;
      if (hv === 2) items.push([v + 0.3, () => drawPeg(g, pr, u, v, r, c)]);
      else {
        const onWreck = !!sunkSet[key] || (sinking && sinking.cells.some(([a, d]) => a === r && d === c));
        const onDeck = side === 'mine' && !onWreck;
        items.push([v + 0.52, () => {
          if (side === 'enemy' && !onWreck) { quad(g, pr, c + 0.05, r + 0.05, c + 0.95, r + 0.95); g.fillStyle = 'rgba(255,80,60,.13)'; g.fill(); drawDebris(g, pr, u, v, r, c); }
          const [x, y] = pr.P(u, v, onDeck ? DECK : onWreck ? 0.02 : 0.01);
          drawFire(g, x, y, pr.s(v), r * 8 + c, onWreck ? 0.75 : 1, onWreck);
        }]);
      }
    }
    items.sort((a, b2) => a[0] - b2[0]).forEach(x => x[1]());
    if (p.id === 'E') { drawAim(g, p); drawNope(g, p); }
  }

  function drawPeg(g, pr, u, v, r, c) {
    const s = pr.s(v), [x, y] = pr.P(u, v, 0), t = S.t, k = pr.k * s;
    const ph = ((t / 2400) + hash(r, c)) % 1;                   // slow ripple around the marker
    ring(g, pr, u, v, 0.12 + ph * 0.3); g.strokeStyle = `rgba(210,230,255,${(1 - ph) * 0.35})`; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, y + 0.5, k * 0.13, k * 0.05, 0, 0, 7); g.fill();
    const w = k * 0.085, hgt = k * 0.3, bob = Math.sin(t * 0.002 + r + c) * k * 0.012;
    g.fillStyle = '#aebcd3'; g.fillRect(x - w, y - hgt + bob, w * 2, hgt);
    g.fillStyle = '#f4f8ff'; g.fillRect(x - w * 0.75, y - hgt + bob, w * 0.9, hgt);
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x, y - hgt + bob, w, w * 0.45, 0, 0, 7); g.fill();
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.22;
    g.drawImage(sprite('peg', '200,225,255'), x - k * 0.35, y - hgt * 0.6 - k * 0.35, k * 0.7, k * 0.7);
    g.restore();
  }
  function drawDebris(g, pr, u, v, r, c) {                      // charred flotsam where an unseen hull was hit
    for (let i = 0; i < 5; i++) {
      const a = hash(r * 3 + i, c * 5) * 6.28, d = 0.12 + hash(c + i, r) * 0.28, bob = Math.sin(S.t * 0.002 + i) * 0.02;
      const [x, y] = pr.P(u + Math.cos(a) * d, v + Math.sin(a) * d * 0.8, 0.02 + bob), s = pr.s(v);
      g.fillStyle = i % 2 ? '#22262d' : '#3a3530';
      g.save(); g.translate(x, y); g.rotate(a); g.fillRect(-3 * s, -1 * s, 6 * s, 2 * s); g.restore();
    }
  }
  function drawFire(g, x, y, s, seed, sc, low) {
    const t = S.t, k = s * (sc || 1);
    // smoke column drifting downwind
    for (let i = 0; i < 6; i++) {
      const ph = ((t / 2600) + i / 6 + seed * 0.137) % 1, px = x + (Math.sin(ph * 3 + seed) * 4 + ph * 16) * k, py = y - (8 + ph * 62) * k;
      const r = (4 + ph * 13) * k, a = 0.42 * (1 - ph) * Math.min(1, ph * 6);
      g.fillStyle = `rgba(30,30,38,${a})`; g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
    }
    g.save(); g.globalCompositeOperation = 'lighter';
    const fl = 0.75 + 0.25 * Math.sin(t * 0.021 + seed) * Math.sin(t * 0.013 + seed * 2);
    g.globalAlpha = 0.42 * fl; g.drawImage(sprite('fire', '255,150,60'), x - 30 * k, y - 34 * k, 60 * k, 60 * k);
    g.globalAlpha = 1;
    // flame tongues: an orange body with a hot yellow heart
    const tongue = (ox, hh, bw, sw) => { g.beginPath(); g.moveTo(x + ox - bw, y); g.quadraticCurveTo(x + ox - bw * 0.7, y - hh * 0.55, x + ox + sw, y - hh); g.quadraticCurveTo(x + ox + bw * 0.7, y - hh * 0.45, x + ox + bw, y); g.closePath(); g.fill(); };
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 3.4 * k, hh = (low ? 9 : 13) * k * (0.75 + 0.35 * Math.sin(t * 0.017 + seed + i * 2.1)), bw = (3.6 - Math.abs(i - 1)) * k, sw = Math.sin(t * 0.011 + i + seed) * 2 * k;
      g.fillStyle = 'rgba(235,80,35,.75)'; tongue(ox, hh, bw, sw);
      g.fillStyle = 'rgba(255,200,90,.8)'; tongue(ox, hh * 0.62, bw * 0.62, sw * 0.6);
    }
    g.restore();
  }
  function drawSlick(g, pr, s, e) {                             // oil spreading from a wreck
    if (e <= 0) return;
    const [u, v] = toPlane(s, s.size / 2, 0), rad = (s.size * 0.42 + 0.35) * e;
    g.save();
    g.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = i / 28 * 6.28, wob = 1 + 0.12 * Math.sin(a * 3 + s.r) + 0.08 * Math.sin(a * 5 + s.c);
      const du = s.o === 'h' ? Math.cos(a) * rad * wob : Math.cos(a) * rad * 0.5 * wob, dv = s.o === 'h' ? Math.sin(a) * rad * 0.45 * wob : Math.sin(a) * rad * wob;
      const [x, y] = pr.P(u + du, v + dv, 0); i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fillStyle = `rgba(8,6,12,${0.55 * e})`; g.fill();
    g.strokeStyle = `rgba(120,90,200,${0.25 * e})`; g.lineWidth = 1.2; g.stroke();
    g.restore();
  }

  /* ---- warships: hull + deck + turrets + bridge, 2.5D, drawn per length ---- */
  function layout(size) {
    const L = size;
    if (L <= 2) return { turrets: [[1.5, 0.12]], boxes: [[0.45, 1.05, -0.17, 0.17, 0.24]], funnel: null, mast: [0.8, 0.55] };
    if (L === 3) return { turrets: [[0.5, 0.13], [2.42, 0.13]], boxes: [[1.4, 2.0, -0.2, 0.2, 0.25], [1.55, 1.9, -0.14, 0.14, 0.42]], funnel: [1.0, 1.28, 0.3], mast: [1.72, 0.66] };
    if (L === 4) return { turrets: [[0.58, 0.15], [2.9, 0.15, 0.07], [3.42, 0.15]], boxes: [[1.85, 2.5, -0.22, 0.22, 0.27], [2.0, 2.38, -0.16, 0.16, 0.46]], funnel: [1.28, 1.64, 0.36], mast: [2.2, 0.8] };
    return { turrets: [[0.6, 0.15], [L - 1.1, 0.15, 0.07], [L - 0.58, 0.15]], boxes: [[L * 0.46, L * 0.46 + 0.7, -0.22, 0.22, 0.28], [L * 0.46 + 0.12, L * 0.46 + 0.55, -0.16, 0.16, 0.48]], funnel: [L * 0.3, L * 0.3 + 0.38, 0.38], mast: [L * 0.46 + 0.35, 0.85] };
  }
  function toPlane(s, a, b) { return s.o === 'h' ? [s.c + a, s.r + 0.5 + b] : [s.c + 0.5 + b, s.r + s.size - a]; }
  function hullOutline(L) {
    const hw = 0.3;
    return [[0.1, -hw * 0.75], [0.28, -hw], [L * 0.55, -hw], [L - 0.55, -hw * 0.86], [L - 0.2, -hw * 0.42], [L - 0.05, 0],
      [L - 0.2, hw * 0.42], [L - 0.55, hw * 0.86], [L * 0.55, hw], [0.28, hw], [0.1, hw * 0.75]];
  }
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const rgbs = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a == null ? 1 : a})`;
  function drawShip(g, pr, s, o) {
    if (S.log) S.log.push({ side: o.side, state: o.state, r: s.r, c: s.c, o: s.o, size: s.size, panel: pr === (S.L.E && S.L.E.grid) ? 'E' : pr === (S.L.F && S.L.F.grid) ? 'F' : 'P' });
    const L = s.size, t = S.t, ph = s.r * 1.7 + s.c * 2.3 + L;
    const still = !!o.still || S.calm;
    const bob = still ? 0 : 0.022 * Math.sin(t * 0.0017 + ph);
    const roll = (still ? 0 : 0.05 * Math.sin(t * 0.0012 + ph * 1.3)) + (o.list || 0);
    const pitch = (o.pitch || 0) + (still ? 0 : 0.01 * Math.sin(t * 0.0009 + ph));
    const drop = o.sink || 0, ch = o.char || 0;
    const H = (a, b, h) => Math.max(0, h + bob - drop + roll * b + pitch * (a - L / 2));
    const Pt = (a, b, h) => { const [u, v] = toPlane(s, a, b); return pr.P(u, v, H(a, b, h)); };
    const W0 = (a, b) => { const [u, v] = toPlane(s, a, b); return pr.P(u, v, 0); };
    const ghost = o.ghost ? rgb(o.ghost) : null;
    const C = {
      side: ghost ? mix(ghost, [20, 30, 40], 0.35) : mix([62, 71, 86], [24, 20, 19], ch),
      side2: ghost ? mix(ghost, [10, 20, 30], 0.55) : mix([40, 46, 58], [16, 13, 13], ch),
      deck: ghost ? mix(ghost, [255, 255, 255], 0.2) : mix([124, 134, 150], [48, 40, 36], ch),
      top: ghost ? mix(ghost, [255, 255, 255], 0.35) : mix([168, 178, 194], [62, 52, 46], ch),
      wall: ghost ? ghost : mix([96, 106, 122], [34, 29, 27], ch),
    };
    g.save();
    g.globalAlpha = o.ghost ? 0.62 : (o.alpha == null ? 1 : o.alpha);
    const out = hullOutline(L);
    // water shadow + foam hugging the hull, and a lazy wake off the stern
    if (!o.ghost) {
      g.beginPath(); out.forEach(([a, b], i) => { const [x, y] = W0(a, b * 1.35); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      g.fillStyle = 'rgba(0,4,12,.4)'; g.fill();
      if (o.state === 'afloat' || o.state === 'placed') {
        g.strokeStyle = `rgba(205,228,255,${0.2 + 0.08 * Math.sin(t * 0.003 + ph)})`; g.lineWidth = 1.1; g.stroke();
        const wk = (t * 0.0005 + ph) % 1;
        for (let side = -1; side <= 1; side += 2) {
          g.beginPath(); const [x0, y0] = W0(0.1, side * 0.2); g.moveTo(x0, y0);
          const [x1, y1] = W0(-0.9 - wk * 0.3, side * (0.55 + wk * 0.15)); g.lineTo(x1, y1);
          g.strokeStyle = `rgba(200,225,255,${0.16 * (1 - wk * 0.6)})`; g.lineWidth = 1; g.stroke();
        }
      }
    } else {
      g.beginPath(); out.forEach(([a, b], i) => { const [x, y] = W0(a, b); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      g.fillStyle = hexA(o.ghost, 0.18); g.fill();
    }
    // hull sides: quads between the waterline and the deck edge, far first
    const quads = [];
    for (let i = 0; i < out.length; i++) {
      const [a1, b1] = out[i], [a2, b2] = out[(i + 1) % out.length];
      const p1 = W0(a1, b1), p2 = W0(a2, b2), p3 = Pt(a2, b2, DECK), p4 = Pt(a1, b1, DECK);
      quads.push([(p1[1] + p2[1]) / 2, [p1, p2, p3, p4], b1 + b2]);
    }
    quads.sort((x, y) => x[0] - y[0]).forEach(([, q, bb]) => {
      g.beginPath(); g.moveTo(q[0][0], q[0][1]); q.slice(1).forEach(p => g.lineTo(p[0], p[1])); g.closePath();
      g.fillStyle = rgbs(bb > 0 ? C.side : C.side2); g.fill();
    });
    // deck
    g.beginPath(); out.forEach(([a, b], i) => { const [x, y] = Pt(a, b, DECK); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
    g.fillStyle = rgbs(C.deck); g.fill();
    g.strokeStyle = ghost ? hexA(o.ghost, 0.9) : `rgba(215,228,255,${0.35 * (1 - ch)})`; g.lineWidth = 0.9; g.stroke();
    if (!ghost) {                                             // deck planking + centre line
      g.strokeStyle = `rgba(0,0,0,${0.18})`; g.lineWidth = 0.6; g.beginPath();
      const a0 = Pt(0.3, 0, DECK), a1 = Pt(L - 0.3, 0, DECK); g.moveTo(a0[0], a0[1]); g.lineTo(a1[0], a1[1]); g.stroke();
    }
    // scorch marks where it's been hit
    if (o.hits && !ghost) s.cells && s.cells.forEach(([r, c]) => {
      if (o.hits[r][c] !== 1) return;
      const a = s.o === 'h' ? c - s.c + 0.5 : s.r + L - r - 0.5, [x, y] = Pt(a, 0, DECK), k = pr.k * pr.s(r + 0.5);
      g.fillStyle = 'rgba(14,8,6,.75)'; g.beginPath(); g.ellipse(x, y, k * 0.3, k * 0.12, 0, 0, 7); g.fill();
    });
    // superstructure, sorted far → near
    const lay = layout(L), parts = [];
    lay.boxes.forEach(bx => parts.push({ a: (bx[0] + bx[1]) / 2, f: () => box(bx[0], bx[1], bx[2], bx[3], DECK, DECK + bx[4], true) }));
    if (lay.funnel) parts.push({ a: (lay.funnel[0] + lay.funnel[1]) / 2, f: () => funnel(lay.funnel) });
    lay.turrets.forEach(tu => parts.push({ a: tu[0], f: () => turret(tu[0], 0, tu[1], DECK + (tu[2] || 0)) }));
    parts.push({ a: lay.mast[0], f: () => mast(lay.mast[0], lay.mast[1]) });
    parts.sort((x, y) => s.o === 'v' ? y.a - x.a : 0).forEach(q => q.f());
    if (o.reveal > 0 && !ghost) {                             // the unseen hull flares into view
      g.beginPath(); out.forEach(([a, b], i) => { const [x, y] = Pt(a, b, DECK); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath();
      g.strokeStyle = `rgba(255,170,90,${o.reveal})`; g.lineWidth = 2; g.save(); g.shadowColor = '#ff8a3d'; g.shadowBlur = 12; g.stroke(); g.restore();
    }
    // fire glow licking up a sinking hull
    if (o.glow && !ghost) {
      g.globalCompositeOperation = 'lighter';
      const [x, y] = Pt(L / 2, 0, DECK), k = pr.k * pr.s(toPlane(s, L / 2, 0)[1]);
      const gg = g.createRadialGradient(x, y, 0, x, y, k * L * 0.6); gg.addColorStop(0, `rgba(255,120,50,${0.35 * o.glow})`); gg.addColorStop(1, 'rgba(255,80,40,0)');
      g.fillStyle = gg; g.beginPath(); g.arc(x, y, k * L * 0.6, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();

    function poly(pts, fill, stroke) { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fillStyle = fill; g.fill(); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 0.6; g.stroke(); } }
    function box(a0, a1, b0, b1, h0, h1, windows) {
      const c = [[a0, b0], [a1, b0], [a1, b1], [a0, b1]];
      const sides = [];
      for (let i = 0; i < 4; i++) { const [p, q] = [c[i], c[(i + 1) % 4]]; const w1 = Pt(p[0], p[1], h0), w2 = Pt(q[0], q[1], h0); sides.push([(w1[1] + w2[1]) / 2, [w1, w2, Pt(q[0], q[1], h1), Pt(p[0], p[1], h1)]]); }
      sides.sort((x, y) => x[0] - y[0]).forEach(([, q], i) => poly(q, rgbs(i >= 2 ? C.wall : mix(C.wall, [0, 0, 0], 0.25))));
      poly(c.map(p => Pt(p[0], p[1], h1)), rgbs(C.top), ghost ? null : 'rgba(0,0,0,.25)');
      if (windows && !ghost && ch < 0.5) {                     // lit bridge windows
        const n = Math.max(2, Math.round((a1 - a0) * 6));
        for (let i = 0; i < n; i++) {
          const a = a0 + (i + 0.5) / n * (a1 - a0), [x, y] = Pt(a, s.o === 'h' ? b1 : 0, h1 - 0.07), k = pr.k * pr.s(toPlane(s, a, 0)[1]);
          g.fillStyle = `rgba(255,214,140,${0.75 * (1 - ch * 2)})`; g.fillRect(x - k * 0.025, y - k * 0.02, k * 0.05, k * 0.04);
        }
      }
    }
    function funnel([a0, a1, hh]) {
      box(a0, a1, -0.1, 0.1, DECK, DECK + hh, false);
      const [x, y] = Pt((a0 + a1) / 2, 0, DECK + hh), k = pr.k * pr.s(toPlane(s, (a0 + a1) / 2, 0)[1]);
      g.fillStyle = 'rgba(10,10,14,.85)'; g.beginPath(); g.ellipse(x, y, k * 0.09, k * 0.04, 0, 0, 7); g.fill();
    }
    function turret(a, b, rad, h) {
      const [u, v] = toPlane(s, a, b), ring2 = hh => { const pts = []; for (let i = 0; i < 12; i++) { const an = i / 12 * 6.28; pts.push(pr.P(u + Math.cos(an) * rad, v + Math.sin(an) * rad * 0.9, H(a, b, hh))); } return pts; };
      const base = ring2(h), top = ring2(h + 0.08);
      poly(base, rgbs(C.side)); poly(top, rgbs(C.top), ghost ? null : 'rgba(0,0,0,.3)');
      // twin barrels trained on the enemy (up the screen)
      const k = pr.k * pr.s(v);
      [-0.045, 0.045].forEach(off => {
        const p0 = pr.P(u + off, v - rad * 0.4, H(a, b, h + 0.06)), p1 = pr.P(u + off, v - rad - 0.3, H(a, b, h + 0.07));
        g.strokeStyle = rgbs(mix(C.side, [0, 0, 0], 0.2)); g.lineWidth = Math.max(0.8, k * 0.045); g.lineCap = 'round';
        g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      });
    }
    function mast(a, hh) {
      const p0 = Pt(a, 0, DECK + 0.2), p1 = Pt(a, 0, DECK + hh), k = pr.k * pr.s(toPlane(s, a, 0)[1]);
      g.strokeStyle = rgbs(mix(C.wall, [0, 0, 0], 0.2)); g.lineWidth = Math.max(0.6, k * 0.025);
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      const yard = Pt(a, 0, DECK + hh * 0.8), ya = pr.k * pr.s(toPlane(s, a, 0)[1]) * 0.12;
      g.beginPath(); g.moveTo(yard[0] - ya, yard[1]); g.lineTo(yard[0] + ya, yard[1]); g.stroke();
      if (!ghost && ch < 0.5 && Math.sin(t * 0.004 + ph) > 0.2) {
        g.globalCompositeOperation = 'lighter';
        const gl = g.createRadialGradient(p1[0], p1[1], 0, p1[0], p1[1], k * 0.16); gl.addColorStop(0, 'rgba(255,70,70,.95)'); gl.addColorStop(1, 'rgba(255,40,40,0)');
        g.fillStyle = gl; g.beginPath(); g.arc(p1[0], p1[1], k * 0.16, 0, 7); g.fill();
        g.globalCompositeOperation = 'source-over';
      }
    }
  }

  /* ---- crosshair lock-on ---- */
  function drawAim(g, p) {
    const A = S.aim, ctx = S.ctx; if (!A || !canAim()) return;
    const pr = p.grid, col = ctx.players[ctx.me].color, t = S.t;
    const e = S.calm ? 1 : easeOut(S.lockT / 240);
    // row + column rails
    quad(g, pr, A.c, 0, A.c + 1, N); g.fillStyle = hexA(col, 0.07); g.fill();
    quad(g, pr, 0, A.r, N, A.r + 1); g.fill();
    quad(g, pr, A.c, A.r, A.c + 1, A.r + 1); g.fillStyle = hexA(col, 0.16 + 0.08 * Math.sin(t * 0.008)); g.fill();
    // brackets close in on the square
    const pad = 0.08 - (1 - e) * 0.7, u0 = A.c + pad, u1 = A.c + 1 - pad, v0 = A.r + pad, v1 = A.r + 1 - pad, L = 0.28;
    g.strokeStyle = col; g.lineWidth = 2; g.lineCap = 'round';
    g.save(); g.shadowColor = col; g.shadowBlur = 8;
    [[u0, v0, 1, 1], [u1, v0, -1, 1], [u0, v1, 1, -1], [u1, v1, -1, -1]].forEach(([u, v, du, dv]) => {
      const a = pr.P(u + du * L, v), b = pr.P(u, v), c = pr.P(u, v + dv * L);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(c[0], c[1]); g.stroke();
    });
    g.restore();
    // rotating ring + cross
    const u = A.c + 0.5, v = A.r + 0.5, rot = t * 0.002;
    g.save(); g.strokeStyle = hexA(col, 0.85); g.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      for (let j = 0; j <= 8; j++) { const an = rot + i * Math.PI / 2 + j / 8 * 1.0, [x, y] = pr.P(u + Math.cos(an) * 0.36, v + Math.sin(an) * 0.36); j ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    const [cx, cy] = pr.P(u, v), k = pr.k * pr.s(v);
    g.beginPath(); g.moveTo(cx - k * 0.16, cy); g.lineTo(cx - k * 0.05, cy); g.moveTo(cx + k * 0.05, cy); g.lineTo(cx + k * 0.16, cy);
    g.moveTo(cx, cy - k * 0.12); g.lineTo(cx, cy - k * 0.04); g.moveTo(cx, cy + k * 0.04); g.lineTo(cx, cy + k * 0.12); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(cx, cy, 1.4, 0, 7); g.fill();
    g.restore();
    // tag
    if (e > 0.95) {
      const [tx, ty] = pr.P(A.c + 1.02, A.r - 0.05), txt = cellName(A.r, A.c) + ' · LOCKED';
      g.font = '800 9px Orbitron, "Chakra Petch", system-ui, sans-serif'; const w = g.measureText(txt).width + 12;
      const xx = Math.min(tx, VW - w - 4);
      rr(g, xx, ty - 16, w, 14, 7); g.fillStyle = 'rgba(2,6,16,.75)'; g.fill(); g.strokeStyle = hexA(col, 0.6); g.lineWidth = 1; g.stroke();
      g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(txt, xx + 6, ty - 8.5);
    }
  }
  function drawNope(g, p) {                                     // tapped a square you already shot
    const n = S.nope; if (!n || S.t - n.t > 450) return;
    const a = 1 - (S.t - n.t) / 450;
    quad(g, p.grid, n.c + 0.06, n.r + 0.06, n.c + 0.94, n.r + 0.94); g.strokeStyle = `rgba(255,255,255,${a * 0.6})`; g.lineWidth = 1.5; g.stroke();
  }

  /* ---- the shell in flight ---- */
  function drawShell(g) {
    const A = S.anim; if (!A || A.impacted || A.rt < A.T.launch || !A.trail.length) return;
    const col = S.ctx.players[A.L.by].color, [x, y] = A.pos, sc = A.s0 + (A.s1 - A.s0) * (A.pp || 0);
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (let i = 1; i < A.trail.length; i++) {
      const a = i / A.trail.length, p0 = A.trail[i - 1], p1 = A.trail[i];
      g.strokeStyle = hexA(col, a * 0.5); g.lineWidth = a * 4.5 * sc;
      g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      g.strokeStyle = `rgba(255,236,200,${a * 0.55})`; g.lineWidth = a * 1.6 * sc; g.stroke();
    }
    const gl = g.createRadialGradient(x, y, 0, x, y, 22 * sc); gl.addColorStop(0, hexA(col, 0.6)); gl.addColorStop(1, hexA(col, 0));
    g.fillStyle = gl; g.beginPath(); g.arc(x, y, 22 * sc, 0, 7); g.fill();
    const core = g.createRadialGradient(x, y, 0, x, y, 5 * sc); core.addColorStop(0, '#ffffff'); core.addColorStop(0.5, '#ffe7b0'); core.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = core; g.beginPath(); g.arc(x, y, 5 * sc, 0, 7); g.fill();
    g.restore();
    // where it will land: a closing ring on the water (both phones)
    const p = S.L[A.pid], u = clamp(((A.rt - A.T.launch) / A.T.flight), 0, 1);
    if (u > 0.35) {
      g.save(); g.beginPath(); g.rect(p.x, p.y, p.w, p.h); g.clip();
      ring(g, p.grid, A.c + 0.5, A.r + 0.5, 0.25 + (1 - u) * 0.9, A.pid === 'F' && A.result !== 'miss' ? DECK : 0);
      g.strokeStyle = hexA(col, 0.25 + u * 0.5); g.lineWidth = 1.4; g.setLineDash([4, 3]); g.stroke(); g.setLineDash([]);
      g.restore();
    }
  }

  /* ---- particles ---- */
  function drawParts(g, pid, under) {
    // pid = panel id → plane-anchored rings/ripples (under = drawn beneath the board); null → free particles
    if (pid) {
      S.parts.forEach(q => {
        if (q.pid !== pid || q.delay > 0) return;
        const pr = S.L[pid] && S.L[pid].grid; if (!pr) return;
        const a = q.life / q.max, age = 1 - a;
        if (under && q.k === 'ripple') { ring(g, pr, q.u, q.v, q.r0 + (q.r1 - q.r0) * easeOut(age)); g.strokeStyle = `rgba(205,228,255,${a * 0.45})`; g.lineWidth = 1.1; g.stroke(); }
        if (!under && q.k === 'ring') { ring(g, pr, q.u, q.v, q.r0 + (q.r1 - q.r0) * easeOut(age), 0.02); g.strokeStyle = `rgba(${q.col},${a * 0.55})`; g.lineWidth = 0.8 + 1.6 * a; g.stroke(); }
      });
      return;
    }
    S.parts.forEach(q => {
      if (q.delay > 0) return;
      const a = q.life / q.max, age = 1 - a;
      if (q.k === 'smoke') { g.fillStyle = `rgba(${q.c},${Math.min(1, a * 1.4) * (q.al || 0.5)})`; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill(); }
      else if (q.k === 'debris') { g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.globalAlpha = Math.min(1, a * 2); g.fillStyle = q.c; g.fillRect(-q.sz / 2, -q.sz / 3, q.sz, q.sz * 0.66); g.restore(); }
      else if (q.k === 'spray') { g.fillStyle = `rgba(225,238,255,${Math.min(1, a * 1.6) * 0.85})`; g.beginPath(); g.arc(q.x, q.y, q.sz, 0, 7); g.fill(); }
      else if (q.k === 'bubble') { g.strokeStyle = `rgba(200,230,255,${a * 0.7})`; g.lineWidth = 0.7; g.beginPath(); g.arc(q.x, q.y, q.r * (1 + age * 0.5), 0, 7); g.stroke(); }
      else if (q.k === 'mist') { g.fillStyle = `rgba(200,220,245,${a * 0.22})`; g.beginPath(); g.ellipse(q.x, q.y - age * 12, q.r * (1 + age), q.r * 0.7 * (1 + age), 0, 0, 7); g.fill(); }
      else if (q.k === 'column') drawColumn(g, q, age, a);
      else if (q.k === 'fire') {
        const r = q.r0 + (q.r1 - q.r0) * easeOut(age), cool = clamp((age - 0.35) / 0.5, 0, 1), gr = g.createRadialGradient(q.x, q.y + r * 0.2, 0, q.x, q.y, r);
        const mixc = (c1, c2) => c1.map((v, i) => Math.round(v + (c2[i] - v) * cool)).join(',');
        const fa = 1 - cool * 0.55;
        gr.addColorStop(0, `rgba(${mixc([255, 214, 110], [70, 60, 60])},${Math.min(1, a * 1.3) * fa})`);
        gr.addColorStop(0.45, `rgba(${mixc([245, 110, 35], [45, 40, 44])},${Math.min(1, a * 1.2) * 0.85 * fa})`);
        gr.addColorStop(1, `rgba(${mixc([150, 30, 20], [30, 28, 32])},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, r, 0, 7); g.fill();
      }
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    S.parts.forEach(q => {
      if (q.delay > 0) return;
      const a = q.life / q.max, age = 1 - a;
      if (q.k === 'flash') { const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r); gr.addColorStop(0, `rgba(255,250,230,${a * 0.85})`); gr.addColorStop(0.25, `rgba(255,200,110,${a * 0.55})`); gr.addColorStop(1, 'rgba(255,90,50,0)'); g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill(); }
      else if (q.k === 'light') { const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r); gr.addColorStop(0, `rgba(255,150,70,${a * 0.3})`); gr.addColorStop(1, 'rgba(255,120,60,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(q.x, q.y, q.r, q.r * 0.55, 0, 0, 7); g.fill(); }
      else if (q.k === 'fire' && age < 0.4) {
        const r = (q.r0 + (q.r1 - q.r0) * easeOut(age)) * 0.55, hot = 1 - age / 0.4, gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        gr.addColorStop(0, `rgba(255,236,170,${0.55 * hot})`); gr.addColorStop(1, 'rgba(255,140,50,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, r, 0, 7); g.fill();
      }
      else if (q.k === 'spark') { g.strokeStyle = `rgba(255,210,140,${a})`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03); g.stroke(); }
    });
    g.restore();
  }
  function drawColumn(g, q, age, a) {                           // a tall column of white water
    const s = q.s, rise = age < 0.28 ? easeOut(age / 0.28) : 1 - Math.pow((age - 0.28) / 0.72, 1.6) * 0.92;
    const H = 132 * s * rise, w = (10 + age * 15) * s, x = q.x, y = q.y;
    [-1, 1].forEach(sd => {                                     // two shorter plumes either side
      const h2 = H * 0.55, x2 = x + sd * w * 1.3, w2 = w * 0.7;
      g.fillStyle = `rgba(215,232,250,${0.55 * a})`;
      g.beginPath(); g.moveTo(x2 - w2, y); g.quadraticCurveTo(x2 - w2 * 0.4 + sd * w2, y - h2 * 0.8, x2 + sd * w2 * 0.8, y - h2);
      g.quadraticCurveTo(x2 + w2 * 0.5, y - h2 * 0.6, x2 + w2, y); g.closePath(); g.fill();
    });
    const gr = g.createLinearGradient(0, y - H, 0, y);
    gr.addColorStop(0, `rgba(245,250,255,${0.95 * a})`); gr.addColorStop(0.6, `rgba(200,225,250,${0.7 * a})`); gr.addColorStop(1, `rgba(150,190,230,${0.35 * a})`);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x - w * 1.6, y);
    g.bezierCurveTo(x - w * 0.9, y - H * 0.3, x - w * 1.1, y - H * 0.8, x - w * 0.5, y - H);
    g.bezierCurveTo(x - w * 0.6, y - H - w * 1.1, x + w * 0.6, y - H - w * 1.1, x + w * 0.5, y - H);
    g.bezierCurveTo(x + w * 1.1, y - H * 0.8, x + w * 0.9, y - H * 0.3, x + w * 1.6, y);
    g.closePath(); g.fill();
    g.strokeStyle = `rgba(255,255,255,${0.35 * a})`; g.lineWidth = 0.8;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * w * 0.5, y - 2); g.quadraticCurveTo(x + i * w * 0.7, y - H * 0.5, x + i * w * 0.3, y - H * 0.92); g.stroke(); }
    g.fillStyle = `rgba(230,242,255,${0.5 * a})`; g.beginPath(); g.ellipse(x, y, w * 2.4, w * 0.5, 0, 0, 7); g.fill();
  }

  /* ---------------- HTML around the canvas ---------------- */
  function syncBar() {
    const ctx = S.ctx; if (!ctx || !S.tgtEl || !S.fireBtn) return;
    const st = ctx.state, me = ctx.me, col = ctx.players[me].color;
    let label = '', big = '', can = false;
    if (ctx.status === 'finished') label = 'Battle over';
    else if (S.anim || pendingShot(st)) { const A = S.anim; label = A && !A.mine ? 'Incoming fire!' : 'Shell in flight'; big = A ? cellName(A.r, A.c) : ''; }
    else if (!ctx.isMyTurn) label = `${ctx.players[1 - me].name} is aiming…`;
    else if (S.aim) { label = 'Target locked'; big = cellName(S.aim.r, S.aim.c); can = true; }
    else label = 'Tap enemy waters to aim';
    S.tgtEl.style.setProperty('--bsx-c', col);
    S.tgtEl.innerHTML = '';
    if (big) S.tgtEl.append(Object.assign(document.createElement('b'), { textContent: big }));
    S.tgtEl.append(Object.assign(document.createElement('i'), { textContent: label }));
    S.fireBtn.disabled = !can;
    S.fireBtn.classList.toggle('armed', can && !S.calm);
  }
  function describe(ctx, st) {
    const L = st.last, me = ctx.me, foe = ctx.players[1 - me].name;
    if (!L) return null;
    const at = cellName(L.r, L.c), nm = NAME[L.size] || `${L.size}-square ship`;
    if (L.by === me) return L.result === 'sunk' ? [`💥 You sank their ${nm}!`, 'var(--lime)'] : L.result === 'hit' ? [`🔥 Hit at ${at}!`, 'var(--lime)'] : [`💦 Miss at ${at}.`, 'var(--ink-dim)'];
    return L.result === 'sunk' ? [`🔥 ${foe} sank your ${nm}!`, 'var(--magenta)'] : L.result === 'hit' ? [`🔥 ${foe} hit your ship at ${at}`, 'var(--magenta)'] : [`💦 ${foe} missed at ${at}`, 'var(--ink-dim)'];
  }
  function message(ctx) {
    const st = ctx.state, me = ctx.me, L = pendingShot(st);
    try {
      if (L) return ctx.msg(L.by === me ? `🎯 Firing at ${cellName(L.r, L.c)}…` : `⚠️ Incoming from ${ctx.players[L.by].name}!`, L.by === me ? ctx.players[me].color : 'var(--magenta)');
      if (ctx.status === 'finished') return ctx.msg(S.R.remaining(st.boards[1 - me]) === 0 ? '🏆 Their whole fleet is on the seabed!' : '🌊 Your fleet went down fighting…', S.R.remaining(st.boards[1 - me]) === 0 ? 'var(--lime)' : 'var(--magenta)');
      const d = describe(ctx, st);
      if (ctx.isMyTurn) return ctx.msg(d && d[0] && st.last.by !== me ? `${d[0]} — your shot 🎯` : 'Your turn — take a shot 🎯', ctx.players[me].color);
      if (d) return ctx.msg(`${d[0]} · ${ctx.players[1 - me].name}’s turn`, d[1]);
      ctx.msg(`Waiting for ${ctx.players[1 - me].name}…`, 'var(--ink-faint)');
    } catch (e) {}
  }
  function buildPlay(ctx) {
    const R = S.R, st = ctx.state, me = ctx.me, h = ctx.h;
    const b0 = viewBoard(st, 0, false), b1 = viewBoard(st, 1, false);
    const wrap = h('div', { class: 'bsx' });
    wrap.append(ctx.turnBar({ scores: [R.remaining(b0), R.remaining(b1)] }));
    const stage = h('div', { class: 'bsx-stage' }); stage.append(S.cv); wrap.append(stage);
    S.tgtEl = h('div', { class: 'bsx-tgt' });
    S.fireBtn = h('button', { class: 'bsx-fire', onclick: fireNow }, 'FIRE');
    wrap.append(h('div', { class: 'bsx-bar' }, S.tgtEl, S.fireBtn));
    wrap.append(R.fleetPanel(ctx, me ? b0 : b1, me ? b1 : b0));
    return wrap;
  }
  function rerender() {
    const ctx = S.ctx; if (!ctx || !S.el || !S.el.isConnected || S.mode !== 'play') return;
    const old = S.el, nu = buildPlay(ctx);
    old.replaceWith(nu); S.el = nu;
    fit(); syncBar(); message(ctx);
  }
  function profile(size, col) {                                // tray thumbnail: a warship in side view
    const w = 15 * size + 14, hgt = 22, dpr = Math.min(2, window.devicePixelRatio || 1);
    const c = document.createElement('canvas'); c.width = w * dpr; c.height = hgt * dpr; c.style.width = w + 'px'; c.style.height = hgt + 'px';
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const x0 = 3, x1 = w - 3, k = (x1 - x0) / size, wl = 17, dk = 12;
    g.fillStyle = 'rgba(80,160,220,.25)'; g.fillRect(0, wl, w, 1);
    g.fillStyle = '#586274'; g.beginPath(); g.moveTo(x0, dk); g.lineTo(x1, dk - 2); g.lineTo(x1 - k * 0.35, wl + 2); g.lineTo(x0 + 3, wl + 2); g.closePath(); g.fill();
    g.fillStyle = '#9aa6b8'; g.fillRect(x0, dk - 1, x1 - x0 - 2, 1.4);
    const lay = layout(size);
    g.fillStyle = '#a7b2c4';
    lay.boxes.forEach(b => { g.fillRect(x0 + b[0] * k, dk - b[4] * 24, (b[1] - b[0]) * k, b[4] * 24); });
    if (lay.funnel) { g.fillStyle = '#6d788a'; g.fillRect(x0 + lay.funnel[0] * k, dk - lay.funnel[2] * 24, (lay.funnel[1] - lay.funnel[0]) * k, lay.funnel[2] * 24); }
    g.fillStyle = '#8a95a8'; lay.turrets.forEach(t => { const tx = x0 + t[0] * k; g.fillRect(tx - 3, dk - 3 - (t[2] || 0) * 20, 6, 3); g.fillRect(tx + 2, dk - 2.4 - (t[2] || 0) * 20, 5, 1); });
    g.strokeStyle = '#8a95a8'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x0 + lay.mast[0] * k, dk); g.lineTo(x0 + lay.mast[0] * k, 1); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(x0 + lay.mast[0] * k, 1.5, 1.2, 0, 7); g.fill();
    return c;
  }
  function renderPlace(ctx) {
    const R = S.R, st = ctx.state, me = ctx.me, h = ctx.h, col = ctx.players[me].color;
    setMode('place');
    const wrap = h('div', { class: 'bsx' });
    wrap.style.setProperty('--bsx-c', col);
    const stage = h('div', { class: 'bsx-stage' });
    if (!ctx.isMyTurn) {                                        // waiting: your own (confirmed) fleet at anchor
      S.place = null;
      const mine = st.boards[me];
      const ships = (mine.ships && mine.ships.length) || mine.grid.some(r => r.some(Boolean)) ? R.shipsOf(mine).map(cellsToShip) : [];
      S.view = { ships, wait: `${String(ctx.players[st.turn].name).toUpperCase()} IS DEPLOYING…` };
      stage.append(S.cv); wrap.append(stage);
      wrap.append(h('div', { class: 'bsx-hint' }, ships.length ? 'Your fleet is set. The battle starts once they’re ready.' : `${ctx.players[st.turn].name} places first — then it’s your turn.`));
      ctx.root.append(wrap); S.el = wrap;
      fit(); ensureLoop();
      try { ctx.msg(`Waiting for ${ctx.players[st.turn].name}…`, 'var(--ink-faint)'); } catch (e) {}
      return;
    }
    S.view = null;
    const key = me + '|' + st.host;
    if (!S.place || S.place.key !== key) S.place = { key, ships: [], tray: R.FLEET.slice(), sel: 0, orient: 'h', held: null, ghost: null };
    const P = S.place;
    const hint = h('div', { class: 'bsx-hint' });
    const tray = h('div', { class: 'bsx-tray' });
    const rot = h('button', {}); const confirm = h('button', { class: 'btn btn-block' });
    stage.append(S.cv);
    wrap.append(hint, tray, stage,
      h('div', { class: 'bsx-ctrls' }, rot,
        h('button', { onclick: () => { P.ships = R.randomFleet(); P.tray = []; P.sel = 0; try { ctx.sound.place(); } catch (e) {} P.ships.forEach(spawnPlaceSplash); refresh(); ensureLoop(); } }, '🎲 Random'),
        h('button', { onclick: () => { P.ships = []; P.tray = R.FLEET.slice(); P.sel = 0; try { ctx.sound.tap(); } catch (e) {} refresh(); } }, '↺ Reset')),
      confirm);
    rot.onclick = () => { P.orient = P.orient === 'h' ? 'v' : 'h'; try { ctx.sound.tap(); } catch (e) {} refresh(); };
    confirm.onclick = () => {
      if (P.tray.length) { try { ctx.sound.bad(); } catch (e) {} return; }
      const ok = R.confirm(S.ctx, P.ships.map(s => ({ size: s.size, r: s.r, c: s.c, o: s.o })));
      if (ok) S.place = null; else { try { ctx.sound.bad(); ctx.msg('That fleet isn’t legal — check for overlaps', 'var(--magenta)'); } catch (e) {} }
    };
    function refresh() {
      hint.innerHTML = P.tray.length
        ? `Pick a ship, then <b>tap or drag</b> it onto your waters. Tap a placed ship to <b>rotate</b> it · drag it off the board to take it back.`
        : `Fleet deployed. Tap a ship to <b>rotate</b>, drag to <b>move</b> — then confirm.`;
      tray.innerHTML = '';
      if (P.tray.length) P.tray.forEach((sz, i) => {
        const b = h('button', { class: 'bsx-ship' + (i === P.sel ? ' sel' : ''), onclick: () => { P.sel = i; try { ctx.sound.tap(); } catch (e) {} refresh(); } });
        b.append(profile(sz, col), h('span', {}, `${sz} · ${NAME[sz] ? NAME[sz].toUpperCase() : ''}`));
        tray.append(b);
      });
      else tray.append(h('span', { class: 'bsx-done' }, '✓ ALL 5 SHIPS AT SEA'));
      rot.textContent = P.orient === 'h' ? '↔ Horizontal' : '↕ Vertical';
      const ready = !P.tray.length;
      confirm.className = 'btn btn-block ' + (ready ? 'btn-primary' : 'btn-ghost');
      confirm.textContent = ready ? 'Confirm fleet ▶' : `Place ${P.tray.length} more ship${P.tray.length > 1 ? 's' : ''}`;
    }
    S.refreshPlace = refresh;
    refresh();
    ctx.root.append(wrap); S.el = wrap;
    fit(); ensureLoop();
    try { ctx.msg('Arrange your fleet, then confirm', col); } catch (e) {}
  }

  /* ---------------- entry point ---------------- */
  function render(ctx, R) {
    const st = ctx.state;
    S.ctx = ctx; S.R = R;
    ensureCanvas();
    if (st.phase === 'place' || !st.last) { if (S.doneId || S.anim) resetShots(); }
    if (st.phase === 'place') { S.aim = null; S.tgtEl = S.fireBtn = null; return renderPlace(ctx); }
    S.place = null; S.view = null; S.refreshPlace = null;
    setMode('play');
    maybeReplay(st);
    if (S.aim && (!ctx.isMyTurn || st.boards[1 - ctx.me].hits[S.aim.r][S.aim.c])) S.aim = null;
    const el = buildPlay(ctx);
    ctx.root.append(el); S.el = el;
    fit(); ensureLoop(); syncBar(); message(ctx);
  }

  /* ---------------- tiny canvas helpers ---------------- */
  const SPR = {};
  function sprite(key, rgbStr) {                                // a soft radial glow, rendered once
    if (SPR[key]) return SPR[key];
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgbStr},1)`); gr.addColorStop(0.4, `rgba(${rgbStr},.45)`); gr.addColorStop(1, `rgba(${rgbStr},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return (SPR[key] = c);
  }
  function rr(g, x, y, w, h, r) {
    if (w <= 0) return; r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xffffff; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hexA(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }

  window.BattleshipScene = {
    render,
    // ms still needed to finish the shot on screen (the stage holds the game-over card for it)
    resultDelay: () => S.anim ? Math.min(4500, Math.max(0, Math.round(S.anim.end - S.anim.rt)) + 250) : 0,
    test: {
      S, VW, layoutFor, clientOf, cellName,
      replay: () => ({ anim: S.anim ? { id: S.anim.id, rt: S.anim.rt, end: S.anim.end, impacted: S.anim.impacted, pid: S.anim.pid, result: S.anim.result } : null, doneId: S.doneId }),
      draw, step,
    },
  };
})();
