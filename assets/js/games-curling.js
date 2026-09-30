/* ============================================================
   CURLING — slide granite down the ice, curl it into the house.

   Rules (the same text lives in GAME_RULES):
     · 4 ends. Each end both players throw 4 stones, alternating. The player
       who did NOT score the last end throws last (the "hammer"). A blank end
       keeps the hammer.
     · Drag back from the stone to aim and set the power, and pick the curl
       (↺ bends left, ↻ bends right). The stone bends more as it slows.
     · Stones knock each other about: takeouts, raises, guards. A stone that
       goes past the back line or hits the side boards is removed, and so is
       any stone that stops short of the far hog line.
     · Scoring (real rules): once all 8 stones are thrown only the player with
       the stone nearest the button scores, 1 point for each of their stones in
       the house that is closer than the opponent's nearest one in the house.
       Stones outside the house never count. Equal distance: a blank end.
     · Most points after 4 ends wins. Tied: one extra end, still tied: draw.
     · No sweeping (it cannot be committed before the animation).

   Multiplayer model (see CONTEXT "COMMIT BEFORE YOU ANIMATE"):
     The thrower turns the drag into a rounded launch velocity (cm/s) and a
     curl sign, simulates the slide and COMMITS input + outcome (every stone's
     final position, who left the sheet) FIRST. Every phone then replays the
     throw by re-simulating those numbers. The simulation only uses + − × ÷ and
     sqrt, which are exactly rounded under IEEE-754, so iOS Safari and Chrome
     agree, and if they ever did not the replay SNAPS its tail onto the
     committed outcome. The canvas, the loop and the replay live at MODULE
     level (scene S) and are re-attached on every repaint, so a repaint can
     never restart a throw, and a throw that has been watched never replays.

   Coordinates: x across the sheet (cm, + is to the thrower's right), y down
   the sheet from the hack (cm). Both phones look the same way, no mirroring.
   ============================================================ */
(function () {
  const css = `
  .cl-wrap{ display:flex; flex-direction:column; gap:10px; }
  .cl-cv{ width:100%; display:block; margin:0 auto; border-radius:var(--r-3); border:1px solid var(--glass-brd);
    box-shadow:var(--shadow-soft); background:#05070f; touch-action:none; user-select:none; -webkit-user-select:none;
    -webkit-touch-callout:none; outline:none; }
  .cl-cv:focus-visible{ border-color:var(--gold); box-shadow:0 0 0 2px var(--gold); }
  .cl-ctl{ display:flex; align-items:stretch; gap:8px; }
  .cl-seg{ flex:1 1 auto; display:flex; min-width:0; border:1px solid var(--glass-brd); border-radius:var(--r-2);
    background:var(--panel-2); padding:3px; gap:3px; }
  .cl-btn{ flex:1 1 0; min-width:0; min-height:44px; padding:8px 10px; border-radius:calc(var(--r-2) - 3px); border:1px solid transparent;
    background:transparent; color:var(--ink-dim); font-weight:700; font-size:13.5px; line-height:1.15; white-space:nowrap;
    display:flex; align-items:center; justify-content:center; gap:6px;
    transition:transform 160ms var(--spring), background-color 160ms ease, color 160ms ease, border-color 160ms ease; }
  .cl-btn .gl{ font-size:19px; line-height:1; font-weight:900; }
  .cl-btn:active{ transform:scale(.97); }
  .cl-btn[aria-pressed="true"]{ background:rgba(130,150,220,.22); color:var(--ink); border-color:var(--cl-me, var(--gold)); }
  .cl-btn:focus-visible{ outline:2px solid var(--gold); outline-offset:1px; }
  .cl-btn:disabled{ opacity:.4; }
  .cl-house{ flex:none; border:1px solid var(--glass-brd); border-radius:var(--r-2); background:var(--panel-2); padding:8px 12px; min-height:50px; }
  .cl-house[aria-pressed="true"]{ border-color:var(--gold); color:var(--gold); background:var(--panel-2); }
  .cl-hint{ font-size:12.5px; color:var(--ink-dim); line-height:1.45; min-height:54px; }
  .cl-hint b{ color:var(--ink); }
  .cl-hint small{ display:block; margin-top:3px; color:var(--ink-dim); font-size:12px; }
  @media (hover:hover) and (pointer:fine){ .cl-btn:not(:disabled):hover{ color:var(--ink); } }
  @media (prefers-reduced-motion: reduce){ .cl-btn{ transition:background-color 160ms ease, color 160ms ease; } .cl-btn:active{ transform:none; } }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------------- world (cm, seconds) ---------------- */
  const R = 14.5;                              // stone radius
  const HW = 237.5;                            // half sheet width (side boards)
  const NEAR_HOG = 640, HOG = 2835, TEE = 3475, BACK = 3658;    // y of the lines, from the hack
  const HOUSE_R = 183, RINGS = [183, 122, 61, 15];
  const FR = 150;                              // ice deceleration, cm/s² (time-compressed so a throw takes ~6 s)
  const DT = 1 / 120, MAXSTEP = 3000;
  const E_REST = 0.93;                         // a little energy lost in every clack
  const CK = 35, VC = 1000, CMIN = 0.1, WMAX = 1.3;   // curl: lateral accel CK·(1 − v/VC) cm/s², floor CMIN, turn-rate cap rad/s
  const VCAP = 1700, VXCAP = 260;
  const PER_END = 8, STONES = 4, ENDS = 4;
  const HMAX = 0.07;                           // max aim angle, rad (±4°: about ±2.4 m at the house)

  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);

  /* ---------------- deterministic slide ----------------
     Pure arithmetic (+ − × ÷ sqrt) on the committed numbers only, fixed 1/120 s step, fixed
     order: every phone computes the same bits. Frames are kept every 2 steps (60 Hz). */
  function simulate(stones, tid, seat, v, c, rec) {
    const m = stones.length, n = m + 1;
    const X = new Array(n), Y = new Array(n), VX = new Array(n), VY = new Array(n), CD = new Array(n), AL = new Array(n);
    const ids = new Array(n), seats = new Array(n), outF = new Array(n), outW = new Array(n);
    for (let i = 0; i < m; i++) { ids[i] = stones[i].i; seats[i] = stones[i].s; X[i] = +stones[i].x; Y[i] = +stones[i].y; VX[i] = 0; VY[i] = 0; CD[i] = 0; AL[i] = true; outF[i] = -1; outW[i] = ''; }
    ids[m] = tid; seats[m] = seat; X[m] = 0; Y[m] = 0; VX[m] = +v[0] || 0; VY[m] = +v[1] || 0; CD[m] = c < 0 ? -1 : 1; AL[m] = true; outF[m] = -1; outW[m] = '';
    const frames = [], evs = [], D2 = 4 * R * R;
    let hit = 0;
    const snap = () => { const f = new Array(n * 2); for (let i = 0; i < n; i++) { f[i * 2] = X[i]; f[i * 2 + 1] = Y[i]; } frames.push(f); };
    if (rec) snap();
    let step = 0, moving = true;
    while (moving && step < MAXSTEP) {
      step++;
      for (let i = 0; i < n; i++) {
        if (!AL[i]) continue;
        const vx = VX[i], vy = VY[i];
        if (vx === 0 && vy === 0) continue;
        let sp = Math.sqrt(vx * vx + vy * vy), nvx = vx, nvy = vy;
        if (CD[i]) {                                          // the curl: turn the velocity, faster the slower it goes
          let f = 1 - sp / VC; if (f < CMIN) f = CMIN;
          let w = CK * f / sp; if (w > WMAX) w = WMAX;
          w = w * CD[i] * DT;
          nvx = vx + vy * w; nvy = vy - vx * w;
          sp = Math.sqrt(nvx * nvx + nvy * nvy);
        }
        const ns = sp - FR * DT;
        if (ns <= 0) { VX[i] = 0; VY[i] = 0; continue; }
        const k = ns / sp;
        VX[i] = nvx * k; VY[i] = nvy * k;
        X[i] += VX[i] * DT; Y[i] += VY[i] * DT;
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n; i++) {
          if (!AL[i]) continue;
          for (let j = i + 1; j < n; j++) {
            if (!AL[j]) continue;
            if (VX[i] === 0 && VY[i] === 0 && VX[j] === 0 && VY[j] === 0) continue;
            const dx = X[j] - X[i], dy = Y[j] - Y[i], d2 = dx * dx + dy * dy;
            if (d2 >= D2) continue;
            let d = Math.sqrt(d2), nx, ny;
            if (d < 1e-6) { d = 1e-6; nx = 0; ny = 1; } else { nx = dx / d; ny = dy / d; }
            const ov = 2 * R - d, h = ov * 0.5;
            X[i] -= nx * h; Y[i] -= ny * h; X[j] += nx * h; Y[j] += ny * h;
            const vn = (VX[i] - VX[j]) * nx + (VY[i] - VY[j]) * ny;
            if (vn > 0) {
              const jm = (1 + E_REST) * 0.5 * vn;
              VX[i] -= jm * nx; VY[i] -= jm * ny; VX[j] += jm * nx; VY[j] += jm * ny;
              hit++;
              if (rec) evs.push({ k: 'hit', f: frames.length, a: i, b: j, v: vn, x: (X[i] + X[j]) * 0.5, y: (Y[i] + Y[j]) * 0.5 });
            }
          }
        }
      }
      for (let i = 0; i < n; i++) {                           // the back line and the side boards
        if (!AL[i]) continue;
        const why = Y[i] - R > BACK ? 'b' : Math.abs(X[i]) + R > HW ? 's' : '';
        if (why) {
          AL[i] = false; VX[i] = 0; VY[i] = 0; outF[i] = frames.length; outW[i] = why;
          if (rec) evs.push({ k: 'out', f: frames.length, i, w: why, x: X[i], y: Y[i] });
        }
      }
      moving = false;
      for (let i = 0; i < n; i++) if (AL[i] && (VX[i] !== 0 || VY[i] !== 0)) { moving = true; break; }
      if (rec && step % 2 === 0) snap();
    }
    if (moving) for (let i = 0; i < n; i++) { VX[i] = 0; VY[i] = 0; }   // the step cap: everything stops (never reached in practice)
    if (rec) snap();
    const res = [], gone = [];
    for (let i = 0; i < n; i++) {
      if (!AL[i]) gone.push({ i: ids[i], w: outW[i] });
      else if (Y[i] - R < HOG) { gone.push({ i: ids[i], w: 'h' }); outW[i] = 'h'; outF[i] = -2; AL[i] = false; }
      else res.push({ i: ids[i], s: seats[i], x: r1(X[i]), y: r1(Y[i]) });
    }
    res.sort((a, b) => a.i - b.i);
    return { ids, seats, frames, outF, outW, evs, res, gone, hit, steps: step, fx: X.slice(), fy: Y.slice() };
  }

  /* ---------------- launch input ---------------- */
  // power 0..1 maps to the distance the stone would slide on a straight line: 0 stops just short of the
  // far hog line, ~.47 stops on the button, 1 is a hard takeout. Trig happens ONCE on the thrower's phone.
  function pathLen(p) { p = clamp(p, 0, 1); return p <= 0.6 ? 2700 + p / 0.6 * 1000 : 3700 + (p - 0.6) / 0.4 * 4300; }
  const P_TEE = (TEE - 2700) / 1000 * 0.6, P_HOG = (HOG + R - 2700) / 1000 * 0.6;
  function inputFrom(power, heading, curl) {
    const sp = Math.sqrt(2 * FR * pathLen(power)), h = clamp(heading, -HMAX, HMAX);
    return { v: [Math.round(sp * Math.sin(h)), Math.round(sp * Math.cos(h))], c: curl < 0 ? -1 : 1 };
  }
  function cleanV(v) {
    const a = Array.isArray(v) ? v : [];
    let x = Math.round(+a[0] || 0), y = Math.round(+a[1] || 0);
    x = clamp(x, -VXCAP, VXCAP); y = clamp(y, 300, VCAP);
    return [x, y];
  }

  /* ---------------- rules (pure) ---------------- */
  // RTDB turns an array with a stripped (empty) first slot into {1: …}: keep the INDEX, not the order
  function toArr(a) {
    if (Array.isArray(a)) return a;
    const out = [];
    if (a && typeof a === 'object') Object.keys(a).forEach(k => { if (/^\d+$/.test(k)) out[+k] = a[k]; });
    return out;
  }
  const cleanStones = a => toArr(a).filter(c => c && typeof c === 'object').map(c => ({ i: +c.i || 0, s: c.s === 1 ? 1 : 0, x: +c.x || 0, y: +c.y || 0 }));
  const cleanGone = a => toArr(a).filter(c => c && typeof c === 'object').map(c => ({ i: +c.i || 0, w: c.w === 's' || c.w === 'h' ? c.w : 'b' }));
  const pair = (a, d) => { const t = toArr(a); return [0, 1].map(i => (t[i] == null ? d : +t[i] || 0)); };
  const copyStones = a => a.map(c => ({ i: c.i, s: c.s, x: c.x, y: c.y }));
  const throwerOf = s => ((s.tn[0] + s.tn[1]) % 2 === 0) ? 1 - s.hammer : s.hammer;
  // Firebase strips nulls / empty arrays, so every field is re-defaulted on read
  function norm(st) {
    const s = st && typeof st === 'object' ? st : {};
    s.hammer = s.hammer === 0 ? 0 : 1;
    s.end = clamp(Math.round(+s.end) || 1, 1, 5);
    s.ends = +s.ends >= ENDS + 1 ? ENDS + 1 : ENDS;
    s.tn = pair(s.tn, 0).map(v => clamp(Math.round(v), 0, STONES));
    s.stones = cleanStones(s.stones);
    s.score = pair(s.score, 0);
    s.log = toArr(s.log).map(e => { const a = toArr(e); return [+a[0] || 0, +a[1] || 0]; });
    s.phase = s.phase === 'done' ? 'done' : 'play';
    s.fin = s.fin === 0 || s.fin === 1 || s.fin === 'draw' ? s.fin : -1;
    s.n = +s.n || 0; s.clk = +s.clk || 0; s.note = s.note || '';
    if (typeof s.mid !== 'string') delete s.mid;
    s.turn = s.phase === 'play' ? throwerOf(s) : (s.turn === 1 ? 1 : 0);
    const Lx = s.last;
    if (Lx && typeof Lx === 'object' && Lx.id) {
      Lx.k = Lx.k === 's' ? 's' : 't';
      Lx.seat = Lx.seat === 1 ? 1 : 0;
      Lx.prev = cleanStones(Lx.prev); Lx.res = cleanStones(Lx.res); Lx.gone = cleanGone(Lx.gone);
      Lx.v = cleanV(Lx.v); Lx.c = Lx.c === -1 ? -1 : 1;
      Lx.ps = pair(Lx.ps, 0); Lx.tb = pair(Lx.tb, 0); Lx.hm = Lx.hm === 0 ? 0 : 1; Lx.e = Math.round(+Lx.e) || 1; Lx.hit = +Lx.hit || 0; Lx.t = +Lx.t || 0;
      Lx.ev = Lx.ev === 'end' || Lx.ev === 'win' || Lx.ev === 'draw' ? Lx.ev : '';
      const sc = Lx.sc && typeof Lx.sc === 'object' ? Lx.sc : {};
      Lx.sc = { w: sc.w === 0 || sc.w === 1 ? sc.w : -1, n: +sc.n || 0, ids: toArr(sc.ids).map(v => +v || 0), tie: sc.tie ? 1 : 0 };
    } else s.last = null;
    return s;
  }
  const cloneSt = st => norm(JSON.parse(JSON.stringify(st)));

  // The end is scored when the 8th stone has stopped. Only stones touching the house count; the player
  // with the stone nearest the button scores one point per stone that beats the opponent's nearest.
  function scoreEnd(stones) {
    const inH = stones.map(q => ({ i: q.i, s: q.s, d: r1(Math.sqrt(q.x * q.x + (q.y - TEE) * (q.y - TEE))) }))
      .filter(q => q.d <= HOUSE_R + R).sort((a, b) => (a.d - b.d) || (a.i - b.i));
    if (!inH.length) return { w: -1, n: 0, ids: [], tie: 0 };
    const w = inH[0].s, other = inH.find(q => q.s !== w);
    if (other && other.d === inH[0].d) return { w: -1, n: 0, ids: [], tie: 1 };     // equal distance: blank end
    const lim = other ? other.d : Infinity;
    const ids = inH.filter(q => q.s === w && q.d < lim).map(q => q.i);
    return { w, n: ids.length, ids, tie: 0 };
  }

  // after a stone (thrown or lost to the clock): next thrower, or score the end, or finish the match
  function closeThrow(s, Lx, seat) {
    const total = s.tn[0] + s.tn[1];
    if (total < PER_END) {
      const nt = throwerOf(s);
      if (nt === seat) s.clk++;
      s.turn = nt;
      return undefined;
    }
    const sc = scoreEnd(s.stones);
    Lx.sc = sc;
    if (sc.w >= 0) { s.score[sc.w] += sc.n; s.hammer = 1 - sc.w; }          // the hammer goes to the player who did not score
    s.log.push([sc.w === 0 ? sc.n : 0, sc.w === 1 ? sc.n : 0]);
    let winner;
    if (s.end >= s.ends && s.score[0] !== s.score[1]) winner = s.score[0] > s.score[1] ? 0 : 1;
    else if (s.end >= s.ends && s.ends > ENDS) winner = 'draw';             // the extra end did not settle it
    if (winner !== undefined) {
      s.phase = 'done'; s.fin = winner; s.turn = 1 - seat; Lx.ev = winner === 'draw' ? 'draw' : 'win';
      return winner;
    }
    if (s.end >= s.ends) s.ends = ENDS + 1;                                  // tied after the last end: one extra
    s.end++; s.stones = []; s.tn = [0, 0]; Lx.ev = 'end';
    s.turn = throwerOf(s);
    if (s.turn === seat) s.clk++;
    return undefined;
  }
  // one throw, fully resolved. Returns the next state and the winner (undefined while the game goes on).
  function resolve(st0, seat, inp) {
    const s = cloneSt(st0), v = cleanV(inp.v), c = inp.c === -1 ? -1 : 1;
    const tid = s.tn[0] + s.tn[1], prev = copyStones(s.stones), tb = s.tn.slice(), hm = s.hammer, e = s.end;
    const sim = simulate(s.stones, tid, seat, v, c, false);
    s.stones = sim.res.map(q => ({ i: q.i, s: q.s, x: q.x, y: q.y }));
    s.tn[seat]++; s.n++; s.note = '';
    const Lx = { id: s.n, k: 't', seat, prev, v, c, res: copyStones(sim.res), gone: sim.gone, ps: s.score.slice(), ev: '',
      sc: { w: -1, n: 0, ids: [], tie: 0 }, hit: sim.hit, t: tid, tb, hm, e };
    const winner = closeThrow(s, Lx, seat);
    s.last = Lx;
    return { s, winner, sim, last: Lx };
  }
  // the clock ran out: that stone is lost (it never reaches the ice)
  function skipState(st0) {
    const s = cloneSt(st0);
    if (s.phase === 'done') return s;
    const seat = throwerOf(s), tid = s.tn[0] + s.tn[1], tb = s.tn.slice(), hm = s.hammer, e = s.end;
    s.tn[seat]++; s.n++; s.note = 'skip';
    const Lx = { id: s.n, k: 's', seat, prev: copyStones(s.stones), v: [0, 0], c: 1, res: copyStones(s.stones), gone: [], ps: s.score.slice(), ev: '',
      sc: { w: -1, n: 0, ids: [], tie: 0 }, hit: 0, t: tid, tb, hm, e };
    closeThrow(s, Lx, seat);
    s.last = Lx;
    return s;
  }
  const sameOutcome = (sim, Lx) => {
    if (sim.res.length !== Lx.res.length || sim.gone.length !== Lx.gone.length) return false;
    for (let k = 0; k < sim.res.length; k++) {
      const a = sim.res[k], b = Lx.res[k];
      if (a.i !== b.i || Math.abs(a.x - b.x) > 0.06 || Math.abs(a.y - b.y) > 0.06) return false;
    }
    for (let k = 0; k < sim.gone.length; k++) if (sim.gone[k].i !== Lx.gone[k].i || sim.gone[k].w !== Lx.gone[k].w) return false;
    return true;
  };

  /* ---------------- module-level scene (survives repaints) ---------------- */
  const VW = 600, VH = 760;
  const S = {
    cv: null, g: null, raf: 0, lastT: 0, acc: 0, ctx: null, st: null, mid: null,
    W: 0, H: 0, dpr: 1, k: 1, cssH: 0, back: null, ice: null, vig: null,
    cam: null, fy: 0, fz: 1, sx: 0, sy: 0, shake: 0, flash: 0, flashC: '#fff',
    anim: null, doneId: 0, parts: [], floats: [], banner: null, tick: 0, clackT: -9,
    drag: null, aim: null, kb: null, lockN: null, lockT: 0, settleKey: '', lastN: -1,
    curl: 1, pref: null,
    calm: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  // Camera: position (cz behind the hack, cy height), where it looks on the ice (lz), focal length, and where
  // the look-at point sits on screen (cyf). "aim" stands behind the hack; "house" hangs over the rings.
  const CAM = {
    aim: { cz: -3000, cy: 800, lz: 2000, foc: 3700, cyf: .366 },
    house: { cz: 2100, cy: 760, lz: 3400, foc: 1450, cyf: .32 },
  };
  const Z_NEAR = -420, Z_FAR = BACK + 230;

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const seatCol = i => (S.ctx && S.ctx.players[i] && S.ctx.players[i].color) || (i ? '#ff4d9d' : '#2fe6ff');
  const seatName = i => (S.ctx && S.ctx.players[i] && S.ctx.players[i].name) || (i ? 'Meera' : 'Smit');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const restAngle = (i, s) => i * 1.37 + s * .9;

  function resetScene(st) {
    S.mid = st.mid; S.anim = null; S.parts = []; S.floats = []; S.banner = null; S.shake = 0; S.flash = 0;
    S.drag = null; S.aim = null; S.kb = null; S.lockN = null; S.settleKey = ''; S.pref = null; S.lastN = -1;
    // a fresh page replays the latest event once (the partner may not have seen it); older ones never
    S.doneId = st.last ? st.last.id - 1 : 0;
    S.cam = null;
  }

  /* ---------------- input ---------------- */
  function ensureCanvas() {
    if (S.cv) return;
    S.cv = document.createElement('canvas'); S.cv.className = 'cl-cv'; S.cv.tabIndex = 0;
    S.cv.setAttribute('role', 'application'); S.cv.setAttribute('aria-label', 'Curling sheet');
    S.g = S.cv.getContext('2d');
    if (window.ResizeObserver) new ResizeObserver(() => setTimeout(fit, 0)).observe(S.cv);   // not inside the callback: resizing the observed canvas there loops
    else window.addEventListener('resize', fit);
    const loc = e => { const r = S.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, H: r.height || 1, W: r.width || 1 }; };
    S.cv.addEventListener('pointerdown', e => {
      if (S.anim && S.anim.k === 't') { S.anim.hurry = true; ensureLoop(); return; }   // a tap speeds the replay up
      if (!canAct()) return;
      const p = loc(e);
      S.drag = { x0: p.x, y0: p.y, x: p.x, y: p.y, H: p.H, W: p.W };
      S.aim = null; S.kb = null;
      try { S.cv.setPointerCapture(e.pointerId); } catch (x) {}
      ensureLoop();
    });
    S.cv.addEventListener('pointermove', e => {
      if (!S.drag) return;
      if (!canAct()) { S.drag = null; S.aim = null; return; }
      const p = loc(e);
      S.drag.x = p.x; S.drag.y = p.y;
      S.aim = dragAim(S.drag);
      e.preventDefault(); ensureLoop();
    }, { passive: false });
    const release = () => {
      if (!S.drag) return;
      const a = S.aim; S.drag = null; S.aim = null;
      ensureLoop();
      if (!a || a.power < .04 || !canAct()) return;           // a tap, or pulled back to the start: not a throw
      launch(a);
    };
    S.cv.addEventListener('pointerup', release);
    S.cv.addEventListener('pointercancel', () => { S.drag = null; S.aim = null; ensureLoop(); });
    // keyboard: the same throw without a drag
    S.cv.addEventListener('keydown', e => {
      if (!canAct()) return;
      const k = e.key, big = e.shiftKey ? 4 : 1;
      if (!S.kb && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].indexOf(k) >= 0) S.kb = { power: P_TEE, heading: 0 };
      if (!S.kb) { if (k === 'c' || k === 'C') toggleCurl(); return; }
      if (k === 'ArrowLeft') S.kb.heading = clamp(S.kb.heading - .002 * big, -HMAX, HMAX);
      else if (k === 'ArrowRight') S.kb.heading = clamp(S.kb.heading + .002 * big, -HMAX, HMAX);
      else if (k === 'ArrowUp') S.kb.power = clamp(S.kb.power + .012 * big, 0, 1);
      else if (k === 'ArrowDown') S.kb.power = clamp(S.kb.power - .012 * big, 0, 1);
      else if (k === 'Enter' || k === ' ') { const a = S.kb; S.kb = null; launch({ power: a.power, heading: a.heading }); }
      else if (k === 'Escape') S.kb = null;
      else return;
      e.preventDefault(); ensureLoop();
    });
    S.cv.addEventListener('blur', () => { if (S.kb) { S.kb = null; ensureLoop(); } });
  }
  function toggleCurl(v) {
    S.curl = v === 1 || v === -1 ? v : -S.curl;
    const c = S.ctx; if (c && c.root) c.root.querySelectorAll('[data-curl]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.curl === S.curl)));
    try { c.sound.tap(); } catch (e) {}
    draw(); ensureLoop();
  }
  function canAct() {
    const c = S.ctx, st = S.st;
    if (!c || !st || !c.isMyTurn || c.status !== 'active' || S.anim) return false;
    if (st.phase !== 'play' || st.turn !== c.me) return false;
    if (st.last && st.last.id > S.doneId) return false;              // an event is still waiting to be shown
    if (S.lockN != null && st.n === S.lockN && Date.now() - S.lockT < 5000) return false;   // commit in flight
    return true;
  }
  function fit() {
    if (!S.cv) return;
    const par = S.cv.parentNode, pw = par && par.clientWidth ? par.clientWidth : S.cv.clientWidth;
    if (!pw) return;
    // keep the whole sheet on screen on short phones: cap the height, centre the canvas
    const maxH = Math.max(340, (window.innerHeight || 800) * .68);
    const w = Math.min(pw, Math.floor(maxH * VW / VH)), hgt = Math.round(w * VH / VW);
    S.cv.style.width = w + 'px'; S.cv.style.height = hgt + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(hgt * dpr);
    S.cssH = hgt;
    if (W === S.W && H === S.H) return;
    S.W = W; S.H = H; S.dpr = dpr; S.k = W / VW;
    S.cv.width = W; S.cv.height = H; S.vig = null;
    draw();                                                    // resizing wipes the bitmap: repaint now
  }
  // ONE loop, ever: every (re)schedule goes through the `!S.raf` guard. step() can finish a throw and
  // re-render, and render() calls ensureLoop() while S.raf is 0: without the guard at the end of
  // loop() that became a second, third… loop and every later throw flew 2×, 3× fast (the Fleabag bug).
  // Fixed timestep: step() is one 60 Hz tick whatever the screen's refresh (90/120 Hz phones too).
  const TICK = 1000 / 60;
  function ensureLoop() { if (!S.raf && S.cv) { if (!S.lastT) S.acc = TICK; S.raf = requestAnimationFrame(loop); } }
  function loop(ts) {
    S.raf = 0;
    if (!S.cv || !S.cv.isConnected) { S.lastT = 0; S.acc = 0; return; }   // left the game: render() restarts us
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
    return !!(S.anim || S.drag || S.kb || S.parts.length || S.floats.length || S.banner || S.flash > .01 || S.shake > .2 || !camSettled());
  }

  /* ---------------- camera + projection ---------------- */
  const mix = (a, b, t) => ({ cz: lerp(a.cz, b.cz, t), cy: lerp(a.cy, b.cy, t), lz: lerp(a.lz, b.lz, t), foc: lerp(a.foc, b.foc, t), cyf: lerp(a.cyf, b.cyf, t) });
  function viewNow() {
    const c = S.ctx, st = S.st;
    if (!c || !st) return 'aim';
    if (S.drag || S.kb) return 'aim';
    if (S.pref) return S.pref;
    return c.isMyTurn && st.phase === 'play' && st.turn === c.me && c.status === 'active' ? 'aim' : 'house';
  }
  function camTarget() {
    const c = S.ctx, st = S.st, A = S.anim;
    if (!c || !st) return CAM.aim;
    if (A && A.k === 't') {
      if (S.calm || A.done) return CAM.house;
      const mine = A.seat === c.me, t = ease(clamp((A.lead - 250) / 2500, 0, 1));
      return mix(CAM.aim, CAM.house, mine ? t : .4 + .6 * t);
    }
    if (A) return CAM.house;
    if (c.status === 'finished' || st.phase === 'done') return CAM.house;
    return viewNow() === 'aim' ? CAM.aim : CAM.house;
  }
  function camSettled() {
    if (!S.cam) return true;
    const t = camTarget(), c = S.cam;
    return Math.abs(t.cz - c.cz) < .5 && Math.abs(t.cy - c.cy) < .5 && Math.abs(t.lz - c.lz) < .5 && Math.abs(t.foc - c.foc) < 1 && Math.abs(t.cyf - c.cyf) < .001;
  }
  function stepCam(snap) {
    const t = camTarget();
    if (!S.cam || snap || S.calm) S.cam = Object.assign({}, t);
    else {
      const e = S.anim ? .075 : .14, c = S.cam;
      ['cz', 'cy', 'lz', 'foc', 'cyf'].forEach(key => { c[key] += (t[key] - c[key]) * e; });
    }
    setCam();
  }
  function setCam() {
    const c = S.cam, fy = -c.cy, fz = c.lz - c.cz, n = Math.sqrt(fy * fy + fz * fz);
    S.fy = fy / n; S.fz = fz / n;
  }
  // world (x across, h height, z down the sheet) → screen
  function P(x, h, z) {
    const c = S.cam, dy = h - c.cy, dz = z - c.cz, zc = Math.max(8, dy * S.fy + dz * S.fz), yc = dy * S.fz - dz * S.fy, k = c.foc / zc;
    return { x: VW / 2 + x * k + S.sx, y: VH * c.cyf - yc * k + S.sy, k, zc };
  }
  const depth = (h, z) => (h - S.cam.cy) * S.fy + (z - S.cam.cz) * S.fz;

  /* ---------------- aiming ---------------- */
  // drag back from the stone (like a sling): the throw goes the opposite way. The angle is damped so a thumb
  // can pick a line; the power is the pull length.
  const AIM_GAIN = .12;
  function dragAim(d) {
    const pull = d.y - d.y0, side = d.x0 - d.x;
    if (pull < 14) return null;
    const len = Math.sqrt(side * side + pull * pull);
    const power = clamp((len - 14) / (d.H * .42), 0, 1);
    const phi = clamp(Math.atan2(side, pull), -1.1, 1.1);
    return { power, heading: clamp(phi * AIM_GAIN, -HMAX, HMAX), len };
  }
  const aimNow = () => S.aim || S.kb;

  /* ---------------- actions ---------------- */
  function launch(a) {
    const c = S.ctx; if (!canAct()) return false;
    const st = S.st, me = c.me, inp = inputFrom(a.power, a.heading, S.curl);
    const r = resolve(st, me, inp);
    S.lockN = st.n; S.lockT = Date.now(); S.pref = null;
    try { c.sound.move(); } catch (e) {}
    // COMMIT FIRST: input + outcome + id. The slide is replayed from `last` on every phone
    // (this one included) by the repaint the commit triggers.
    if (r.winner !== undefined) c.commit(r.s, r.winner); else c.commit(r.s);
    return true;
  }
  function rerender() {
    const c = S.ctx; if (!c || !c.root || !c.root.isConnected) return;
    c.root.innerHTML = ''; DEF.render(c);
  }

  /* ---------------- replay ---------------- */
  // What this phone has already WATCHED survives a reload (per match), so reopening the game never
  // replays an old throw, but a throw fired while this phone was closed still plays once.
  const SEEN_KEY = 'sm_cl_seen';
  const matchKey = st => st.mid || 'curling';
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
  const T_HOG = 16, T_SCORE = 36, SWEEP = 30;
  function startAnim(Lx) {
    const c = S.ctx, mine = Lx.seat === c.me;
    if (Lx.k === 's') {
      S.anim = { id: Lx.id, k: 's', L: Lx, seat: Lx.seat, done: true, tail: 0, hl: null, sweepAt: -1, lead: 0, hurry: false, fi: 0, frames: [], ids: [], outF: [], outW: [], evs: [], ei: 0, popped: {} };
      return;
    }
    const sim = simulate(Lx.prev, Lx.t, Lx.seat, Lx.v, Lx.c, true);
    const same = sameOutcome(sim, Lx);
    const pt = same ? sim : snapSim(sim, Lx);
    const m = pt.ids.length - 1;
    S.anim = { id: Lx.id, k: 't', L: Lx, seat: Lx.seat, ids: pt.ids, seats: pt.seats, frames: pt.frames, outF: pt.outF, outW: pt.outW, evs: pt.evs, ei: 0,
      fi: 0, done: false, tail: 0, snapped: !same, popped: {}, lead: 0, hl: null, sweepAt: -1, hurry: false, endY: Lx.res.find(q => q.i === Lx.t) ? Lx.res.find(q => q.i === Lx.t).y : sim.fy[m], mid: m };
    if (!mine) { try { c.sound.place(); } catch (e) {} }
  }
  // the local re-simulation disagreed with the committed outcome (never seen in practice: the sim is
  // exactly-rounded arithmetic, but floats are floats): keep the opening of the local slide, then glide every
  // stone onto the COMMITTED result so the right stones are where the thrower's phone says they are.
  function snapSim(sim, Lx) {
    const n = sim.ids.length, frames = sim.frames.slice(), last = frames[frames.length - 1], outF = sim.outF.slice(), outW = sim.outW.slice();
    const goneMap = {}; Lx.gone.forEach(q => { goneMap[q.i] = q.w; });
    const fin = {}; Lx.res.forEach(q => { fin[q.i] = q; });
    const base = frames.length;
    const steps = 34;
    for (let j = 1; j <= steps; j++) {
      const t = ease(j / steps), f = new Array(n * 2);
      for (let i = 0; i < n; i++) {
        const q = fin[sim.ids[i]];
        f[i * 2] = q ? lerp(last[i * 2], q.x, t) : last[i * 2]; f[i * 2 + 1] = q ? lerp(last[i * 2 + 1], q.y, t) : last[i * 2 + 1];
      }
      frames.push(f);
    }
    for (let i = 0; i < n; i++) {
      const id = sim.ids[i];
      if (fin[id]) { outF[i] = -1; outW[i] = ''; }
      else if (goneMap[id] === 'h') { outF[i] = -2; outW[i] = 'h'; }
      else { if (outF[i] < 0) outF[i] = base; outW[i] = goneMap[id] || 'b'; }
    }
    return { ids: sim.ids, seats: sim.seats, frames, outF, outW, evs: sim.evs.filter(e => e.f < base), fy: sim.fy };
  }
  const hasHog = L => L.gone.some(q => q.w === 'h');
  function endTail(A) {
    const L = A.L;
    let t = hasHog(L) ? T_HOG + 34 : 24;
    if (L.k === 's') t = 34;
    if (L.ev === 'end') t = Math.max(t, T_SCORE + (L.sc.n > 0 ? 130 : 96) + SWEEP);
    else if (L.ev) t = Math.max(t, T_SCORE + 120);
    return t;
  }
  function remainingMs() {
    const A = S.anim; if (!A) return 0;
    let f = 0;
    if (A.k === 't' && !A.done) f += Math.ceil((A.frames.length - 1 - A.fi) / (A.hurry ? 3.6 : 1.9));
    f += Math.max(0, endTail(A) - A.tail);
    return Math.round(f * 16.7);
  }
  // how far the fastest stone moves between this frame and the next (cm)
  function motionAt(A, fi) {
    const n = A.frames.length, a = Math.floor(clamp(fi, 0, n - 1)), b = Math.min(n - 1, a + 1), fa = A.frames[a], fb = A.frames[b];
    let m = 0;
    for (let i = 0; i < A.ids.length; i++) { const d = Math.abs(fb[i * 2] - fa[i * 2]) + Math.abs(fb[i * 2 + 1] - fa[i * 2 + 1]); if (d > m) m = d; }
    return m;
  }
  // The long empty run up the sheet and the slow creep at the end are not worth waiting for: play fast
  // when nothing is moving quickly, in real time around a clack. Everything is in ticks, so it is the same at 60 and 120 Hz.
  const speedAt = A => {
    if (S.calm) return A.hurry ? 2 : 1;
    let s = 1;
    if (A.ei === 0 && A.lead < 1900) s = 2.3;
    else if (A.lastHit == null || A.fi - A.lastHit > 50) { const m = motionAt(A, A.fi); s = m > .01 ? clamp(9 / m, 1, 3.6) : 1; }
    return A.hurry ? s * 2 : s;
  };

  /* ---------------- effects ---------------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const addShake = v => { if (!S.calm) S.shake = Math.max(S.shake, v); };     // reduced motion: never
  function floatText(text, x, h, z, c, big) { S.floats.push({ text, x, h, z, c, life: 80, max: 80, big: !!big }); }
  function banner(text, sub, c, dur) { S.banner = { text, sub: sub || '', c: c || '#ffd66b', t: 0, dur: dur || 100 }; }
  function sparks(x, z, n, c, sp) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(.5, sp || 2.6); S.parts.push({ k: 'spark', x, h: 8, z, vx: Math.cos(a) * v, vh: rnd(.5, 2.2), vz: Math.sin(a) * v, life: rnd(14, 26), max: 26, c: c || '#fff4d0' }); }
  }
  function clack(x, z, vn) {
    const heavy = vn > 330;
    sparks(x, z, heavy ? 16 : 8, heavy ? '#ffe9a8' : '#ffffff', heavy ? 3.4 : 2);
    S.parts.push({ k: 'ring', x, z, r0: R * .8, r1: R * (heavy ? 4.5 : 2.6), life: 18, max: 18, c: '#dff3ff' });
    S.parts.push({ k: 'glow', x, h: 8, z, r: heavy ? 150 : 90, life: 12, max: 12, c: '#cfeaff' });
    if (heavy) addShake(6); else addShake(2.5);
    if (S.tick - S.clackT > 5) { S.clackT = S.tick; try { S.ctx.sound[heavy ? 'place' : 'tap'](); } catch (e) {} }
  }
  function confetti(col) {
    if (S.calm) return;                                                 // reduced motion: no confetti
    const cols = [col, col, '#ffffff', '#ffd66b', col], z0 = TEE;
    for (let i = 0; i < 150; i++) {
      const side = i % 2 ? 1 : -1, x = side * rnd(120, 230), z = z0 + rnd(-240, 160);
      S.parts.push({ k: 'conf', x, h: rnd(0, 40), z, vx: -side * rnd(.6, 3), vh: rnd(4, 9), vz: rnd(-1, 1), life: rnd(100, 150), max: 150, c: cols[i % cols.length], rot: rnd(0, 6.3), vr: rnd(-.3, .3), s: rnd(6, 11) });
    }
  }
  function stonePos(A, idx, fi) {
    const n = A.frames.length, i = clamp(fi, 0, n - 1), a = Math.floor(i), b = Math.min(n - 1, a + 1), t = i - a, fa = A.frames[a], fb = A.frames[b];
    return [lerp(fa[idx * 2], fb[idx * 2], t), lerp(fa[idx * 2 + 1], fb[idx * 2 + 1], t)];
  }
  function fireEvent(A, ev) {
    const c = S.ctx, mine = A.seat === c.me;
    if (ev.k === 'hit') {
      if (ev.v < 25) return;
      clack(ev.x, ev.y, ev.v); A.lastHit = A.fi;
      if (ev.v > 330 && !A.hurry) A.freeze = 4;
    } else if (ev.k === 'out') {
      const thrown = A.ids[ev.i] === A.L.t;
      sparks(ev.x, ev.y, 12, thrown ? seatCol(A.seat) : '#ffffff', 2.2);
      const why = ev.w === 's' ? 'BOARDED' : 'OUT THE BACK';
      floatText(thrown ? why : 'TAKEOUT', clamp(ev.x, -150, 150), 26, clamp(ev.y, HOG, BACK), thrown ? '#c9d0ff' : '#ffd66b', !thrown);
      if (!thrown) { addShake(4); try { c.sound[mine ? 'good' : 'bad'](); } catch (e) {} }
    }
  }
  function popHogs(A) {
    A.L.gone.forEach(q => {
      if (q.w !== 'h') return;
      const idx = A.ids.indexOf(q.i); if (idx < 0) return;
      const p = stonePos(A, idx, A.frames.length - 1);
      A.popped[q.i] = A.tail;
      sparks(p[0], p[1], 14, '#ff8a80', 2.4);
      floatText('HOGGED', clamp(p[0], -150, 150), 30, Math.max(p[1], 2300), '#ff8a80', true);
    });
    try { S.ctx.sound.bad(); } catch (e) {}
  }
  function doScore(A) {
    const L = A.L, sc = L.sc, c = S.ctx;
    if (!L.ev) return;
    rerender();                                                         // the turn bar catches up with the new score
    if (sc.w >= 0 && sc.n > 0) {
      const col = seatCol(sc.w);
      A.hl = { ids: sc.ids, col };
      sc.ids.forEach((id, j) => { const q = L.res.find(z => z.i === id); if (q) floatText('+1', q.x, 34 + j * 2, q.y, col, true); });
      if (L.ev === 'end') { banner(`${seatName(sc.w).toUpperCase()} SCORES ${sc.n}`, `end ${L.e} of ${Math.max(S.st.ends, L.e)}`, col, 120); try { c.sound[sc.w === c.me ? 'good' : 'bad'](); } catch (e) {} }
    } else if (L.ev === 'end') {
      banner(sc.tie ? 'EQUAL DISTANCE' : 'BLANK END', sc.tie ? 'no score, hammer stays' : 'nothing in the house, hammer stays', '#9fb4ff', 96);
      try { c.sound.tap(); } catch (e) {}
    }
    if (L.ev === 'win') {
      const w = S.st.fin;
      banner(`${seatName(w).toUpperCase()} WINS`, `${S.st.score[w]} to ${S.st.score[1 - w]}`, seatCol(w), 1e9); confetti(seatCol(w)); if (!S.calm) { S.flash = 1; S.flashC = seatCol(w); }
      try { c.sound[w === c.me ? 'win' : 'bad'](); } catch (e) {}
    } else if (L.ev === 'draw') {
      banner('DRAW', `${S.st.score[0]} all after the extra end`, '#ffd66b', 1e9); confetti('#ffd66b'); if (!S.calm) { S.flash = 1; S.flashC = '#ffd66b'; }
      try { c.sound.draw(); } catch (e) {}
    }
  }
  function afterFlight(A) {
    const c = S.ctx, L = A.L, mine = A.seat === c.me, thr = L.res.find(q => q.i === L.t);
    if (thr && !L.gone.length) { try { c.sound.place(); } catch (e) {} }
    else if (!thr && L.gone.some(q => q.i === L.t && q.w !== 'h')) { try { c.sound[mine ? 'bad' : 'tap'](); } catch (e) {} }
  }
  function describeThrow(L, mine, who) {
    const thr = L.res.find(q => q.i === L.t), th = L.gone.find(q => q.i === L.t);
    const others = L.gone.filter(q => q.i !== L.t && q.w !== 'h').length;
    let t;
    if (L.k === 's') return `${mine ? 'Your' : esc(who) + '\'s'} time ran out, so that stone is lost.`;
    if (thr) {
      const d = Math.round(Math.sqrt(thr.x * thr.x + (thr.y - TEE) * (thr.y - TEE)));
      t = d <= HOUSE_R + R ? `${mine ? 'Your' : esc(who) + '\'s'} stone sits in the house, ${d} cm from the button.`
        : thr.y < TEE - HOUSE_R - R ? `${mine ? 'Your' : esc(who) + '\'s'} stone stops as a guard.` : `${mine ? 'Your' : esc(who) + '\'s'} stone rests outside the house.`;
    } else if (th && th.w === 'h') t = `${mine ? 'Your' : esc(who) + '\'s'} stone stopped short of the hog line and was removed.`;
    else t = `${mine ? 'Your' : esc(who) + '\'s'} stone ${th && th.w === 's' ? 'hit the boards' : 'slid through the back'} and was removed.`;
    if (others) t += ` ${others} stone${others > 1 ? 's' : ''} knocked out.`;
    return t;
  }
  function finishAnim() {
    const A = S.anim; S.anim = null; S.doneId = A.id;
    writeSeen(S.st, A.id);
    const c = S.ctx; if (!c) return;
    const L = A.L, mine = A.seat === c.me, who = seatName(A.seat);
    let txt = describeThrow(L, mine, who);
    if (L.ev === 'end') txt += L.sc.n > 0 ? ` <b>${esc(seatName(L.sc.w))}</b> scores ${L.sc.n}.` : ' Blank end.';
    try { c.msg(txt); } catch (e) {}
    rerender();                                   // the turn bar / hint were frozen at pre-throw values
    if (S.ctx && S.ctx.state && S.st) maybeReplay(S.st);   // a newer event queued up behind this one
    ensureLoop();
  }

  /* ---------------- per-frame (cosmetic) ---------------- */
  function step() {
    S.tick++;
    const A = S.anim;
    if (A) {
      if (A.k === 't' && !A.done) {
        if (A.freeze > 0 && !S.calm) A.freeze--;                        // a heavy clack holds the frame for a beat
        else A.fi = Math.min(A.frames.length - 1, A.fi + speedAt(A));
        while (A.ei < A.evs.length && A.evs[A.ei].f <= A.fi) fireEvent(A, A.evs[A.ei++]);
        A.lead = stonePos(A, A.mid, A.fi)[1];
        // ice spray off the running stone
        if (!S.calm && S.tick % 2 === 0 && A.lead > 60) {
          const p = stonePos(A, A.mid, A.fi), q = stonePos(A, A.mid, Math.max(0, A.fi - 1)), sp = Math.abs(p[1] - q[1]) + Math.abs(p[0] - q[0]);
          if (sp > .9) S.parts.push({ k: 'shave', x: p[0] + rnd(-6, 6), h: 1, z: p[1] - R, vx: rnd(-.2, .2), vh: rnd(.2, .7), vz: -sp * .25, life: rnd(10, 16), max: 16 });
        }
        if (A.fi >= A.frames.length - 1) {
          while (A.ei < A.evs.length) fireEvent(A, A.evs[A.ei++]);
          A.done = true; afterFlight(A);
        }
      } else {
        A.tail++;
        if (A.tail === 1 && A.k === 's') { floatText('TIME UP', 0, 30, TEE - 900, '#ff8a80', true); try { S.ctx.sound.bad(); } catch (e) {} }
        if (A.tail === T_HOG && hasHog(A.L)) popHogs(A);
        if (A.tail === T_SCORE) doScore(A);
        if (A.L.ev === 'end' && A.sweepAt < 0 && A.tail >= T_SCORE + (A.L.sc.n > 0 ? 130 : 96)) A.sweepAt = A.tail;
        if (A.tail >= endTail(A)) finishAnim();
      }
    }
    stepCam(false);
    // particles (world units: cm, per frame)
    const gpf = 980 / 3600;
    S.parts = S.parts.filter(q => {
      q.life--;
      if (q.k === 'spark') { q.vh -= gpf * .5; q.x += q.vx; q.h += q.vh; q.z += q.vz; if (q.h < 0) { q.h = 0; q.vh *= -.3; q.vx *= .6; q.vz *= .6; } }
      else if (q.k === 'shave') { q.vh -= gpf * .3; q.x += q.vx; q.h += q.vh; q.z += q.vz; if (q.h < 0) { q.h = 0; q.vh = 0; } }
      else if (q.k === 'conf') { q.vh -= gpf * .3; q.vx *= .985; q.vz *= .985; q.x += q.vx; q.h += q.vh; q.z += q.vz; q.rot += q.vr; if (q.h < 0) { q.h = 0; q.vh = 0; q.vx *= .6; q.vz *= .6; q.vr *= .6; } }
      return q.life > 0;
    });
    if (S.parts.length > 420) S.parts.splice(0, S.parts.length - 420);
    S.floats = S.floats.filter(f => --f.life > 0);
    if (S.banner && ++S.banner.t >= S.banner.dur) S.banner = null;
    S.flash *= .9; if (S.flash < .01) S.flash = 0;
    S.shake *= .84; if (S.shake < .2) S.shake = 0;
    const sh = S.calm ? 0 : S.shake; S.sx = sh ? rnd(-1, 1) * sh : 0; S.sy = sh ? rnd(-1, 1) * sh : 0;
  }

  /* ---------------- what is on the ice right now ---------------- */
  // [{i, s, x, y, alpha, lift, rot, hl}] : during a replay the animation owns the stones; while an event
  // is queued the PRE-throw layout shows (never spoil it); otherwise the committed state.
  function visStones() {
    const st = S.st, A = S.anim, out = [];
    if (A && A.k === 't') {
      for (let idx = 0; idx < A.ids.length; idx++) {
        const id = A.ids[idx], s = A.seats[idx];
        let alpha = 1, lift = 0, p, ox = 0, oy = 0;
        const of = A.outF[idx];
        if (of >= 0 && A.fi >= of) {                               // left the sheet: slide on / hit the boards, and fade
          const q = (A.fi - of) / 30;
          if (q >= 1) continue;
          alpha = 1 - q; p = stonePos(A, idx, of);
          if (A.outW[idx] === 'b') oy = q * 50; else ox = (p[0] < 0 ? -1 : 1) * q * 30;
        } else p = stonePos(A, idx, A.fi);
        if (of === -2) {
          const t0 = A.popped[id];
          if (t0 != null) { const q = (A.tail - t0) / 28; if (q >= 1) continue; alpha = 1 - q; lift = q * 26; }
        }
        if (A.sweepAt >= 0) { const q = clamp((A.tail - A.sweepAt) / SWEEP, 0, 1); if (q >= 1) continue; alpha *= 1 - q; lift += q * 10; }
        const thrown = idx === A.mid;
        const rot = restAngle(id, s) + (thrown ? A.L.c * (A.endY - p[1]) * .0042 : 0);
        out.push({ i: id, s, x: p[0] + ox, y: p[1] + oy, alpha, lift, rot, hl: !!(A.hl && A.hl.ids.indexOf(id) >= 0), moving: thrown && !A.done });
      }
      return out;
    }
    let list;
    if (A && A.k === 's') list = A.L.res;
    else if (st.last && st.last.id > S.doneId) list = st.last.prev;
    else list = st.stones;
    const sw = A && A.sweepAt >= 0 ? clamp((A.tail - A.sweepAt) / SWEEP, 0, 1) : 0;
    list.forEach(q => { if (sw < 1) out.push({ i: q.i, s: q.s, x: q.x, y: q.y, alpha: 1 - sw, lift: sw * 10, rot: restAngle(q.i, q.s), hl: !!(A && A.hl && A.hl.ids.indexOf(q.i) >= 0), moving: false }); });
    return out;
  }
  // HUD numbers frozen at their pre-throw values until the replay has landed
  function hudNow() {
    const st = S.st, L = st.last, pend = !!(L && L.id > S.doneId) || !!S.anim;
    if (pend && L) {
      const A = S.anim, past = A && A.id === L.id ? A.tail >= T_SCORE : false;
      const tn = L.tb.slice();
      return { tn, score: past ? st.score.slice() : L.ps.slice(), hammer: L.hm, end: L.e, ends: Math.max(st.ends, L.e), pend: true, seat: L.seat };
    }
    return { tn: st.tn.slice(), score: st.score.slice(), hammer: st.hammer, end: st.end, ends: st.ends, pend: false, seat: st.turn };
  }

  /* ---------------- drawing ---------------- */
  const NR = 24, CS = [], SN = [];
  for (let i = 0; i < NR; i++) { const a = i / NR * Math.PI * 2; CS.push(Math.cos(a)); SN.push(Math.sin(a)); }
  const NEAR = []; for (let i = NR / 2; i <= NR; i++) NEAR.push(i % NR);      // π → 2π: the half toward the camera
  const NEAR_R = NEAR.slice().reverse();

  function rr(g, x, y, w, h, r) {
    if (w <= 0 || h <= 0) { g.beginPath(); return; } r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xffffff; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hexA(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`; }
  function quad(g, pts) { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); }
  function ring(cx, h, cz, r) { const out = []; for (let i = 0; i < NR; i++) out.push(P(cx + r * CS[i], h, cz + r * SN[i])); return out; }
  function disc(cx, h, cz, r, n) { const out = []; n = n || 32; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push(P(cx + r * Math.cos(a), h, cz + r * Math.sin(a))); } return out; }
  function poly(g, pts) { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.closePath(); }

  function buildIce() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const b = c.getContext('2d'), Rn = rng(4242);
    for (let i = 0; i < 2600; i++) {                                     // pebble: frozen droplets, light and pitted
      const x = Rn() * 256, y = Rn() * 256, r = .5 + Rn() * 1.4, lit = Rn() < .7;
      b.fillStyle = lit ? `rgba(255,255,255,${.06 + Rn() * .2})` : `rgba(10,50,100,${.05 + Rn() * .12})`;
      b.beginPath(); b.arc(x, y, r, 0, 7); b.fill();
    }
    for (let i = 0; i < 26; i++) {                                       // a few scratches from earlier ends
      const x = Rn() * 256, y = Rn() * 256, l = 20 + Rn() * 70, a = Math.PI / 2 + (Rn() - .5) * .25;
      b.strokeStyle = `rgba(255,255,255,${.05 + Rn() * .07})`; b.lineWidth = .6; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); b.stroke();
    }
    S.ice = c;
  }
  function buildBackdrop() {
    // the arena behind the far end: dark stands, a lit crowd, a light rig, a neon sign and LED boards
    const PX = 1.5, WW = 1000, WH = 400, c = document.createElement('canvas');
    c.width = Math.round(WW * PX); c.height = Math.round(WH * PX);
    const b = c.getContext('2d'), Rn = rng(2718);
    b.scale(PX, PX);
    const wall = b.createLinearGradient(0, 0, 0, WH);
    wall.addColorStop(0, '#04060f'); wall.addColorStop(.55, '#0b1128'); wall.addColorStop(1, '#0f1733');
    b.fillStyle = wall; b.fillRect(0, 0, WW, WH);
    const wash = b.createRadialGradient(WW / 2, WH * .55, 10, WW / 2, WH * .55, 420);
    wash.addColorStop(0, 'rgba(90,150,255,.22)'); wash.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = wash; b.fillRect(0, 0, WW, WH);
    const skin = ['#d9a27b', '#f0c7a0', '#9c6b4a', '#c98a62', '#e7b58d'], shirt = ['#2fe6ff', '#ff4d9d', '#f4f6ff', '#ffd66b', '#7b8cff', '#3a4668', '#8f98b8', '#ff7a5c'];
    for (let r = 0; r < 7; r++) {                                        // tiered crowd, dimmer and smaller as it climbs
      const by = WH - 66 - r * 31, hs = 6.2 - r * .35;
      b.fillStyle = `rgba(6,9,24,${.9 - r * .03})`; b.fillRect(0, by - 6, WW, 40);
      for (let x = Rn() * 9; x < WW; x += 11 + Rn() * 3) {
        if (Rn() < .09) continue;
        const dim = .42 - r * .03 + Rn() * .2, sc = shirt[(Rn() * shirt.length) | 0];
        b.globalAlpha = dim; b.fillStyle = sc; b.beginPath(); b.ellipse(x, by + 20, hs * 1.35, hs * 1.6, 0, Math.PI, 0); b.fill();
        b.fillStyle = skin[(Rn() * skin.length) | 0]; b.beginPath(); b.arc(x, by + 6, hs * .78, 0, 7); b.fill();
        if (Rn() < .06) { b.globalAlpha = .95; b.fillStyle = Rn() < .5 ? '#ffffff' : '#9fe9ff'; b.fillRect(x + 3, by + 8, 2, 3.2); }   // a phone light
        b.globalAlpha = 1;
      }
    }
    const fade = b.createLinearGradient(0, 0, 0, WH * .55); fade.addColorStop(0, 'rgba(4,6,15,1)'); fade.addColorStop(1, 'rgba(4,6,15,0)');
    b.fillStyle = fade; b.fillRect(0, 0, WW, WH * .55);
    // the light rig
    b.fillStyle = '#0c1020'; b.fillRect(0, 14, WW, 7);
    for (let x = 50; x < WW; x += 100) {
      const gl = b.createRadialGradient(x, 26, 0, x, 26, 70); gl.addColorStop(0, 'rgba(255,248,230,.85)'); gl.addColorStop(.25, 'rgba(255,240,210,.3)'); gl.addColorStop(1, 'rgba(255,240,210,0)');
      b.fillStyle = gl; b.fillRect(x - 70, 0, 140, 110);
      b.fillStyle = '#fffaf0'; b.beginPath(); b.arc(x, 26, 6, 0, 7); b.fill();
    }
    // neon sign
    const sign = (txt, x, y, size, col) => {
      b.font = `900 ${size}px Orbitron, "Chakra Petch", system-ui, sans-serif`; b.textAlign = 'center'; b.textBaseline = 'middle';
      b.save(); b.shadowColor = col; b.shadowBlur = 22; b.strokeStyle = col; b.lineWidth = 2.6; b.strokeText(txt, x, y); b.shadowBlur = 8; b.strokeText(txt, x, y); b.restore();
      b.strokeStyle = 'rgba(255,255,255,.92)'; b.lineWidth = .9; b.strokeText(txt, x, y);
    };
    sign('CURLING', WW / 2, 118, 54, '#ffd66b');
    sign('SMIT', WW / 2 - 300, 120, 30, '#2fe6ff'); sign('MEERA', WW / 2 + 300, 120, 30, '#ff4d9d');
    // LED boards at the foot of the stands
    const bd = b.createLinearGradient(0, WH - 34, 0, WH); bd.addColorStop(0, '#111a36'); bd.addColorStop(1, '#070a18');
    b.fillStyle = bd; b.fillRect(0, WH - 34, WW, 34);
    b.font = '800 9px Orbitron, system-ui, sans-serif'; b.textAlign = 'center'; b.textBaseline = 'middle'; b.globalAlpha = .75;
    for (let x = 40, j = 0; x < WW; x += 80, j++) { b.fillStyle = j % 2 ? '#ff4d9d' : '#2fe6ff'; b.fillText(j % 2 ? 'MEERA' : 'SMIT', x, WH - 17); }
    b.globalAlpha = 1;
    b.fillStyle = 'rgba(255,255,255,.16)'; b.fillRect(0, WH - 34, WW, 1.4);
    S.back = { c, WW, WH };
  }

  function draw() {
    const g = S.g, c = S.ctx, st = S.st; if (!g || !c || !st) return;
    if (!S.W) fit(); if (!S.W) return;
    if (!S.cam) stepCam(true); else setCam();
    if (!S.back) buildBackdrop();
    if (!S.ice) buildIce();
    g.setTransform(S.k, 0, 0, S.k, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    drawRoom(g);
    drawSheet(g);
    drawStones(g, st);
    drawParts(g);
    drawAim(g, st);
    drawFloats(g);
    drawVignette(g);
    drawHud(g, st);
    drawBanner(g);
    if (S.flash > .01) { g.globalAlpha = S.flash * .4; g.fillStyle = S.flashC; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; }
  }

  function drawRoom(g) {
    const bg = g.createLinearGradient(0, 0, 0, VH);
    bg.addColorStop(0, '#04060e'); bg.addColorStop(.5, '#080d1c'); bg.addColorStop(1, '#04060c');
    g.fillStyle = bg; g.fillRect(0, 0, VW, VH);
    // the stands pin to the far end of the hall, so they slide and zoom with the camera
    const B = S.back, zW = Z_FAR + 40, foot = P(0, 0, zW), wallW = 2500, w = wallW * foot.k, hgt = w * B.WH / B.WW;
    const y1 = foot.y;
    if (y1 > 0 && w > 40) {
      g.drawImage(B.c, VW / 2 - w / 2 + S.sx * .4, y1 - hgt, w, hgt);
      const fg = g.createLinearGradient(0, y1, 0, Math.min(VH, y1 + 140));
      fg.addColorStop(0, 'rgba(8,12,28,.95)'); fg.addColorStop(1, 'rgba(8,12,28,0)');
      g.fillStyle = fg; g.fillRect(0, y1, VW, 140);
    }
    // out-of-focus rig lights along the top edge
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const x = 36 + i * 66, r = 16 + (i % 3) * 7, gl = g.createRadialGradient(x, 6, 0, x, 6, r * 2.6);
      gl.addColorStop(0, i % 4 === 1 ? 'rgba(120,220,255,.34)' : i % 4 === 3 ? 'rgba(255,120,190,.3)' : 'rgba(255,244,224,.34)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl; g.fillRect(x - r * 3, -20, r * 6, r * 6);
    }
    g.globalCompositeOperation = 'source-over';
  }

  function band(g, z0, z1, x0, x1, col, al) {
    quad(g, [P(x0, 0, z0), P(x1, 0, z0), P(x1, 0, z1), P(x0, 0, z1)]);
    g.fillStyle = hexA(col, al); g.fill();
  }
  function drawIceTex(g, zn) {
    const TL = 475, zEnd = Z_FAR;
    let z = Math.max(zn, -400), guard = 0;
    while (z < zEnd && guard++ < 340) {
      const a = P(0, 0, z), b = P(0, 0, z + 10), slope = Math.abs(b.y - a.y) / 10;
      if (slope < 1e-3) break;
      const al = clamp((a.k - .3) * 1.1, 0, .7);
      if (al <= .01 && z > 0) break;
      const dz = clamp(3 / slope, 3, 140), srcH = dz / TL * 256, sy0 = (((z % TL) + TL) % TL) / TL * 256, sh = Math.min(srcH, 256 - sy0), use = dz * (sh / srcH);
      const p0 = P(-HW, 0, z), p1 = P(HW, 0, z), q = P(0, 0, z + use);
      const top = Math.min(a.y, q.y), hh = Math.abs(q.y - a.y);
      if (hh > .2 && top < VH && top + hh > 0) { g.globalAlpha = al; g.drawImage(S.ice, 0, sy0, 256, Math.max(.5, sh), p0.x, top, p1.x - p0.x, hh + .6); }
      z += use;
    }
    g.globalAlpha = 1;
  }
  // little specular glints on the ice: lamp reflections caught by the pebble, fixed in the world
  const GL = []; { const Rn = rng(909); for (let i = 0; i < 160; i++) GL.push([(Rn() * 2 - 1) * (HW - 10), 200 + Rn() * 3500, 1.4 + Rn() * 2.6, .12 + Rn() * .22]); }
  function glints(g, zn) {
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < GL.length; i++) {
      const q = GL[i]; if (q[1] < zn) continue;
      const p = P(q[0], 0, q[1]); if (p.y < -10 || p.y > VH + 10 || p.k < .3) continue;
      const w = q[2] * p.k, hh = Math.max(.6, w * .35);
      g.fillStyle = `rgba(255,255,255,${q[3] * clamp((p.k - .3) * 1.2, .15, 1)})`; g.beginPath(); g.ellipse(p.x, p.y, Math.max(.8, w), hh, 0, 0, 7); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
  }
  function drawSheet(g) {
    const c = S.cam, zn = Math.max(Z_NEAR, c.cz + (20 + c.cy * S.fy) / S.fz);
    // the hall floor around the sheet
    quad(g, [P(-HW - 900, 0, zn), P(HW + 900, 0, zn), P(HW + 900, 0, Z_FAR), P(-HW - 900, 0, Z_FAR)]);
    const fl = g.createLinearGradient(0, P(0, 0, Z_FAR).y, 0, VH); fl.addColorStop(0, '#0e1630'); fl.addColorStop(1, '#05070f');
    g.fillStyle = fl; g.fill();
    // the ice
    const ice = [P(-HW, 0, zn), P(HW, 0, zn), P(HW, 0, Z_FAR), P(-HW, 0, Z_FAR)];
    quad(g, ice);
    const iy0 = ice[2].y, iy1 = ice[0].y, ig = g.createLinearGradient(0, iy0, 0, iy1);
    [[Z_FAR, '#82b9e8'], [TEE, '#6eaae0'], [1800, '#5390cc'], [0, '#3a74b3']].forEach(([z, col]) => {     // colour by distance down the sheet, not by screen position
      const off = Math.abs(iy1 - iy0) > 1 ? clamp((P(0, 0, z).y - iy0) / (iy1 - iy0), 0, 1) : 0;
      ig.addColorStop(off, col);
    });
    g.fillStyle = ig; g.fill();
    g.save(); quad(g, ice); g.clip();
    drawIceTex(g, zn);
    // lines and the house, painted under the gloss
    band(g, NEAR_HOG - 7, NEAR_HOG + 7, -HW, HW, '#e5384e', .8);
    band(g, HOG - 7, HOG + 7, -HW, HW, '#e5384e', .85);
    band(g, TEE - 1.6, TEE + 1.6, -HW, HW, '#2a62d6', .7);
    band(g, BACK - 1.6, BACK + 1.6, -HW, HW, '#2a62d6', .6);
    band(g, zn, Z_FAR, -1.6, 1.6, '#2a62d6', .6);
    band(g, -14, -2, -HW, HW, '#2a62d6', .45);
    const cols = ['#2565d8', '#f1f7ff', '#e3384d', '#f4f9ff'];
    RINGS.forEach((r, i) => {
      poly(g, disc(0, 0, TEE, r)); g.fillStyle = hexA(cols[i], .92); g.fill();
      g.strokeStyle = 'rgba(8,20,50,.35)'; g.lineWidth = 1; g.stroke();
    });
    band(g, TEE - 1.6, TEE + 1.6, -61, 61, '#0f2f86', .35);                       // the centre lines pass over the paint
    band(g, TEE - 61, TEE + 61, -1.6, 1.6, '#0f2f86', .35);
    // the gloss: lamp pools, long streaks of reflected lights, and the stands mirrored at the far end
    g.globalCompositeOperation = 'lighter';
    [[TEE, 620, .1], [1900, 760, .06], [500, 620, .05]].forEach(([z, rad, a]) => {
      const e = P(0, 0, z), ex = P(rad, 0, z), ey0 = P(0, 0, z - rad), ey1 = P(0, 0, z + rad), rx = Math.abs(ex.x - e.x), ry = Math.abs(ey0.y - ey1.y) / 2;
      if (rx < 2) return;
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, 1); rg.addColorStop(0, `rgba(255,250,235,${a})`); rg.addColorStop(1, 'rgba(255,250,235,0)');
      g.save(); g.translate(e.x, (ey0.y + ey1.y) / 2); g.scale(rx, Math.max(.5, ry)); g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill(); g.restore();
    });
    glints(g, zn);
    [-150, 150].forEach((x, j) => {
      const a = P(x, 0, zn), b = P(x, 0, Z_FAR), wN = 16 * a.k, wF = 16 * b.k;
      const sg = g.createLinearGradient(0, b.y, 0, a.y); sg.addColorStop(0, 'rgba(255,255,255,.08)'); sg.addColorStop(.6, 'rgba(255,255,255,.025)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      g.beginPath(); g.moveTo(b.x - wF, b.y); g.lineTo(b.x + wF, b.y); g.lineTo(a.x + wN, a.y); g.lineTo(a.x - wN, a.y); g.closePath(); g.fillStyle = sg; g.fill();
    });
    const far = P(0, 0, Z_FAR), far0 = P(0, 0, Z_FAR - 900), cg = g.createLinearGradient(0, far.y, 0, far0.y);
    cg.addColorStop(0, 'rgba(120,170,255,.26)'); cg.addColorStop(1, 'rgba(120,170,255,0)');
    quad(g, [P(-HW, 0, Z_FAR), P(HW, 0, Z_FAR), P(HW, 0, Z_FAR - 900), P(-HW, 0, Z_FAR - 900)]); g.fillStyle = cg; g.fill();
    g.globalCompositeOperation = 'source-over';
    g.restore();
    // side boards: cyan for Smit on the left, magenta for Meera on the right
    [-1, 1].forEach(side => {
      const x = side * HW, col = side < 0 ? '#2fe6ff' : '#ff4d9d';
      const a0 = P(x, 0, zn), a1 = P(x, 0, Z_FAR), b0 = P(x, 26, zn), b1 = P(x, 26, Z_FAR), o0 = P(x + side * 14, 26, zn), o1 = P(x + side * 14, 26, Z_FAR);
      quad(g, [a0, a1, b1, b0]); g.fillStyle = '#0b1226'; g.fill();
      quad(g, [b0, b1, o1, o0]); g.fillStyle = '#16203f'; g.fill();
      g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
      [[7, .12], [3.6, .3], [1.4, .95]].forEach(([w, al]) => {
        g.strokeStyle = hexA(col, al); g.lineWidth = w * clamp((b0.k + b1.k) / 2 * 1.6, .5, 3);
        g.beginPath(); g.moveTo(b0.x, b0.y); g.lineTo(b1.x, b1.y); g.stroke();
      });
      g.globalCompositeOperation = 'source-over';
    });
  }

  /* ---- stones ---- */
  function ellipseAt(g, x, h, z, r) {
    const p = P(x, h, z), px = P(x + r, h, z), pz1 = P(x, h, z + r), pz0 = P(x, h, z - r);
    const rx = Math.abs(px.x - p.x), ry = Math.abs(pz0.y - pz1.y) / 2;
    g.beginPath(); g.ellipse(p.x, (pz0.y + pz1.y) / 2, Math.max(.1, rx), Math.max(.1, ry), 0, 0, 7);
    return { p, rx, ry };
  }
  const SH = 14;                                                     // stone body height (cm)
  function stoneUnder(g, q) {
    const a = q.alpha;
    if (a <= .02) return;
    g.globalAlpha = a;
    // reflection in the ice: the lit side wall, mirrored and fading down
    const top = ring(q.x, -q.lift, q.y, R * .93), bot = ring(q.x, -(q.lift + SH), q.y, R);
    if (top[0].zc > 20) {
      g.beginPath();
      NEAR.forEach((i, j) => j ? g.lineTo(top[i].x, top[i].y) : g.moveTo(top[i].x, top[i].y));
      NEAR_R.forEach(i => g.lineTo(bot[i].x, bot[i].y));
      g.closePath();
      const y0 = top[NR * 3 / 4].y, y1 = bot[NR * 3 / 4].y, rg = g.createLinearGradient(0, y0, 0, y1);
      rg.addColorStop(0, `rgba(200,212,240,${.5 * a})`); rg.addColorStop(1, 'rgba(190,200,225,0)');
      g.fillStyle = rg; g.fill();
      // the handle's colour glows faintly in the ice
      const hp = P(q.x, -(q.lift + SH + 3), q.y), col = seatCol(q.s), hr = R * .62 * hp.k;
      const gl = g.createRadialGradient(hp.x, hp.y, 0, hp.x, hp.y, hr * 1.6); gl.addColorStop(0, hexA(col, .5 * a)); gl.addColorStop(1, hexA(col, 0));
      g.fillStyle = gl; g.fillRect(hp.x - hr * 2, hp.y - hr * 2, hr * 4, hr * 4);
    }
    // contact shadow
    ellipseAt(g, q.x + 1.5, 0.02, q.y - 1, R * 1.06); g.fillStyle = `rgba(0,10,30,${.42 * a})`; g.fill();
    g.globalAlpha = 1;
  }
  function stoneOver(g, q, o) {
    o = o || {};
    const a = q.alpha, lift = q.lift, col = seatCol(q.s);
    if (a <= .02) return;
    const top = ring(q.x, lift + SH, q.y, R * .93), bot = ring(q.x, lift, q.y, R), ctr = P(q.x, lift + SH, q.y), k = ctr.k;
    if (ctr.zc < 20) return;
    g.globalAlpha = a;
    // a coloured halo so every stone reads on the ice
    g.globalCompositeOperation = 'lighter';
    ellipseAt(g, q.x, .05, q.y, R * 1.3); g.strokeStyle = hexA(col, q.hl ? .95 : o.ready ? .6 : .34); g.lineWidth = Math.max(1, (q.hl ? 3.2 : 2) * Math.min(1.6, k * 1.3)); g.stroke();
    g.globalCompositeOperation = 'source-over';
    // granite wall
    g.beginPath();
    NEAR.forEach((i, j) => j ? g.lineTo(top[i].x, top[i].y) : g.moveTo(top[i].x, top[i].y));
    NEAR_R.forEach(i => g.lineTo(bot[i].x, bot[i].y));
    g.closePath();
    const lx = top[NR / 2].x, rx = top[0].x, gr = g.createLinearGradient(lx, 0, Math.max(rx, lx + 1), 0);
    gr.addColorStop(0, '#1b1d27'); gr.addColorStop(.22, '#4c5162'); gr.addColorStop(.4, '#9299ad'); gr.addColorStop(.62, '#555a6b'); gr.addColorStop(1, '#14151d');
    g.fillStyle = gr; g.fill();
    // the running band near the bottom
    g.strokeStyle = 'rgba(10,12,20,.55)'; g.lineWidth = Math.max(.6, .9 * k);
    const mid = ring(q.x, lift + SH * .3, q.y, R * .985);
    g.beginPath(); NEAR.forEach((i, j) => j ? g.lineTo(mid[i].x, mid[i].y) : g.moveTo(mid[i].x, mid[i].y)); g.stroke();
    // top face
    poly(g, top);
    const tg = g.createRadialGradient(ctr.x - R * k * .3, ctr.y - R * k * .2, R * k * .1, ctr.x, ctr.y, R * k * 1.05);
    tg.addColorStop(0, '#c6cad8'); tg.addColorStop(.6, '#8b90a2'); tg.addColorStop(1, '#5f6475');
    g.fillStyle = tg; g.fill();
    g.strokeStyle = 'rgba(235,240,255,.75)'; g.lineWidth = Math.max(.7, .7 * k); g.stroke();
    // granite flecks, fixed per stone
    const Rn = rng(q.i * 131 + q.s * 17 + 5);
    for (let j = 0; j < 7; j++) {
      const a2 = Rn() * 6.283, rad = Math.sqrt(Rn()) * R * .8, sp = P(q.x + Math.cos(a2) * rad, lift + SH, q.y + Math.sin(a2) * rad);
      g.fillStyle = j % 2 ? 'rgba(30,34,48,.5)' : 'rgba(255,255,255,.45)'; g.beginPath(); g.arc(sp.x, sp.y, Math.max(.45, .5 * k), 0, 7); g.fill();
    }
    // the handle: a coloured disc, a bar across it, a glint
    const hd = disc(q.x, lift + SH + 1.5, q.y, R * .58, 20);
    poly(g, hd);
    const hg = g.createRadialGradient(ctr.x - R * k * .18, ctr.y - R * k * .18, R * k * .05, ctr.x, ctr.y, R * k * .62);
    hg.addColorStop(0, hexA('#ffffff', .85)); hg.addColorStop(.3, col); hg.addColorStop(1, hexA(col, .7));
    g.fillStyle = hg; g.fill();
    const ca = Math.cos(q.rot), sa = Math.sin(q.rot), b0 = P(q.x + ca * R * .5, lift + SH + 5.5, q.y + sa * R * .5), b1 = P(q.x - ca * R * .5, lift + SH + 5.5, q.y - sa * R * .5);
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(2, 6.4 * k); g.beginPath(); g.moveTo(b0.x + .8 * k, b0.y + 1.2 * k); g.lineTo(b1.x + .8 * k, b1.y + 1.2 * k); g.stroke();
    g.strokeStyle = col; g.lineWidth = Math.max(1.8, 5.6 * k); g.beginPath(); g.moveTo(b0.x, b0.y); g.lineTo(b1.x, b1.y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(.7, 1.6 * k); g.beginPath(); g.moveTo(b0.x, b0.y - 1.3 * k); g.lineTo(b1.x, b1.y - 1.3 * k); g.stroke();
    if (q.s === 1) {                                                   // Meera's handles carry a cross bar, so the two sets differ by shape and not only by colour
      const c0 = P(q.x - sa * R * .36, lift + SH + 5.5, q.y + ca * R * .36), c1 = P(q.x + sa * R * .36, lift + SH + 5.5, q.y - ca * R * .36);
      g.strokeStyle = col; g.lineWidth = Math.max(1.6, 4.4 * k); g.beginPath(); g.moveTo(c0.x, c0.y); g.lineTo(c1.x, c1.y); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(.6, 1.2 * k); g.beginPath(); g.moveTo(c0.x, c0.y - 1.1 * k); g.lineTo(c1.x, c1.y - 1.1 * k); g.stroke();
    }
    g.globalAlpha = 1;
  }
  function drawCurlArc(g, x, z, dir, col) {
    const r = R * 1.62, sweep = 2.3, n = 14, a0 = dir > 0 ? 3.9 : 5.5;
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 - dir * sweep * i / n; pts.push(P(x + r * Math.cos(a), .3, z + r * Math.sin(a))); }
    const k = pts[0].k;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = hexA(col, .9); g.lineWidth = Math.max(1.8, 2.6 * k * 1.3);
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke();
    const e = pts[n], pr = pts[n - 2], dx = e.x - pr.x, dy = e.y - pr.y, l = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / l, uy = dy / l, s = Math.max(4.5, 6 * k * 1.3);
    g.fillStyle = hexA(col, .95); g.beginPath();
    g.moveTo(e.x + ux * s, e.y + uy * s); g.lineTo(e.x - ux * s * .4 - uy * s * .8, e.y - uy * s * .4 + ux * s * .8); g.lineTo(e.x - ux * s * .4 + uy * s * .8, e.y - uy * s * .4 - ux * s * .8); g.closePath(); g.fill();
  }
  function drawStones(g, st) {
    const c = S.ctx, A = S.anim, list = visStones();
    list.forEach(q => stoneUnder(g, q));
    const items = list.map(q => ({ d: depth(q.lift + SH, q.y), q }));
    // the next stone waits in the hack
    if (!A && st.phase === 'play' && c.status === 'active' && !(st.last && st.last.id > S.doneId)) {
      const seat = st.turn, q = { i: st.tn[0] + st.tn[1], s: seat, x: 0, y: 0, alpha: 1, lift: 0, rot: restAngle(st.tn[0] + st.tn[1], seat), hl: false };
      stoneUnder(g, q);
      items.push({ d: depth(SH, 0), q, ready: true });
    }
    items.sort((a, b) => b.d - a.d);
    items.forEach(it => stoneOver(g, it.q, { ready: it.ready }));
    if (!A && st.phase === 'play' && c.isMyTurn && st.turn === c.me && c.status === 'active' && canAct()) drawCurlArc(g, 0, 0, S.curl, seatCol(c.me));
    // scoring highlight pulse lives on the stones (hl); nothing else to draw
  }

  function drawParts(g) {
    S.parts.forEach(q => {
      const a = q.life / q.max;
      if (q.k === 'shave') { const p = P(q.x, q.h, q.z); g.fillStyle = `rgba(235,248,255,${.55 * a})`; g.beginPath(); g.arc(p.x, p.y, Math.max(.6, 1.6 * p.k), 0, 7); g.fill(); }
      else if (q.k === 'conf') {
        const p = P(q.x, q.h, q.z); g.save(); g.translate(p.x, p.y); g.rotate(q.rot); g.globalAlpha = Math.min(1, a * 2);
        g.fillStyle = q.c; const s = q.s * p.k; g.fillRect(-s / 2, -s * .3, s, s * .6 * (.4 + Math.abs(Math.sin(q.rot * 2)) * .6)); g.restore();
      }
    });
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    S.parts.forEach(q => {
      const a = q.life / q.max;
      if (q.k === 'spark') { const p = P(q.x, q.h, q.z); g.fillStyle = hexA(q.c, a); g.beginPath(); g.arc(p.x, p.y, Math.max(.9, 1.6 * p.k + .4), 0, 7); g.fill(); }
      else if (q.k === 'ring') { ellipseAt(g, q.x, .1, q.z, q.r1 - (q.r1 - q.r0) * a); g.strokeStyle = hexA(q.c, a * .85); g.lineWidth = 1 + 2.4 * a; g.stroke(); }
      else if (q.k === 'glow') {
        const p = P(q.x, q.h, q.z), r = q.r * p.k / 3, gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, `rgba(255,255,255,${.75 * a})`); gr.addColorStop(.35, hexA(q.c, .5 * a)); gr.addColorStop(1, hexA(q.c, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
      }
    });
    g.globalCompositeOperation = 'source-over';
  }

  function drawAim(g, st) {
    const c = S.ctx, a = aimNow();
    if (!a || c.status !== 'active') return;
    const col = seatCol(c.me), h = a.heading, sh = Math.sin(h), ch = Math.cos(h);
    // a short dotted line along the aim. It never shows the curl.
    for (let d = R + 30, j = 0; d <= 900; d += 46, j++) {
      const p = P(sh * d, 5, ch * d), t = (d - R) / 900;
      g.fillStyle = hexA(col, .85 * (1 - t * .8)); g.beginPath(); g.arc(p.x, p.y, Math.max(1.6, 4.4 * p.k * (1 - t * .3)), 0, 7); g.fill();
    }
    // a small tick where the straight line crosses the tee line: the curl is up to the player
    const tx = Math.tan(h) * TEE;
    if (Math.abs(tx) < HW) {
      const p = P(tx, 0, TEE), s = Math.max(3.5, 9 * p.k);
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(p.x - s, p.y); g.lineTo(p.x + s, p.y); g.moveTo(p.x, p.y - s * .8); g.lineTo(p.x, p.y + s * .8); g.stroke();
    }
    if (S.drag) {                                                   // the sling: from where the thumb went down, back to where it is now
      const d = S.drag, ox = d.x0 * VW / d.W, oy = d.y0 * VH / d.H, fx = d.x * VW / d.W, fy = Math.max(oy, d.y * VH / d.H);
      g.lineCap = 'round'; g.strokeStyle = hexA(col, .7); g.lineWidth = 2.6; g.setLineDash([1, 8]);
      g.beginPath(); g.moveTo(ox, oy); g.lineTo(fx, fy); g.stroke(); g.setLineDash([]);
      g.strokeStyle = hexA('#ffffff', .55); g.lineWidth = 1.6; g.beginPath(); g.arc(ox, oy, 7, 0, 7); g.stroke();
      g.fillStyle = hexA(col, .4); g.beginPath(); g.arc(fx, fy, 15, 0, 7); g.fill(); g.strokeStyle = hexA(col, .9); g.lineWidth = 2; g.stroke();
    }
    // power bar: hog line, the button, takeout
    const pw = a.power, x = VW - 30, y0 = VH - 290, hgt = 210, py = p => y0 + hgt - hgt * p;
    rr(g, x - 8, y0, 16, hgt, 8); g.fillStyle = 'rgba(5,9,22,.72)'; g.fill();
    g.save(); rr(g, x - 8, y0, 16, hgt, 8); g.clip();
    g.fillStyle = 'rgba(255,110,120,.4)'; g.fillRect(x - 8, py(P_HOG), 16, hgt * P_HOG);
    g.fillStyle = 'rgba(140,200,255,.25)'; g.fillRect(x - 8, py(.56), 16, hgt * (.56 - P_HOG));
    g.fillStyle = 'rgba(255,214,107,.32)'; g.fillRect(x - 8, py(1), 16, hgt * .4);
    const pg = g.createLinearGradient(0, y0 + hgt, 0, y0); pg.addColorStop(0, hexA(col, .7)); pg.addColorStop(1, col);
    g.fillStyle = pg; g.fillRect(x - 6, py(pw), 12, hgt * pw);
    g.restore();
    rr(g, x - 8, y0, 16, hgt, 8); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1.2; g.stroke();
    g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    [[P_HOG, 'hog line'], [P_TEE, 'button'], [.6, 'takeout']].forEach(([p, t]) => {
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x - 12, py(p)); g.lineTo(x + 8, py(p)); g.stroke();
      g.lineWidth = 3; g.strokeStyle = 'rgba(4,8,20,.9)'; g.strokeText(t, x - 16, py(p)); g.fillStyle = 'rgba(255,255,255,.92)'; g.fillText(t, x - 16, py(p));
    });
  }
  function drawFloats(g) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    S.floats.forEach(f => {
      const age = 1 - f.life / f.max, p = P(f.x, f.h + age * 26, f.z), al = Math.min(1, f.life / 22);
      const sc = age < .12 ? .5 + age * 4.2 : 1, size = Math.round((f.big ? 30 : 22) * sc);
      g.font = `900 ${size}px Orbitron, system-ui, sans-serif`; g.globalAlpha = al;
      g.lineWidth = 6; g.strokeStyle = 'rgba(5,7,15,.85)'; g.strokeText(f.text, p.x, p.y);
      g.fillStyle = f.c; g.fillText(f.text, p.x, p.y); g.globalAlpha = 1;
    });
  }
  function drawVignette(g) {
    if (!S.vig) { const v = g.createRadialGradient(VW / 2, VH * .48, VH * .28, VW / 2, VH * .5, VH * .8); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.6)'); S.vig = v; }
    g.fillStyle = S.vig; g.fillRect(0, 0, VW, VH);
  }
  function drawHud(g, st) {
    const c = S.ctx, hd = hudNow();
    // stones left, both players, with the hammer marked
    const tn = hd.tn.slice();
    if (hd.pend && S.anim) tn[hd.seat]++;                               // the stone has left the hand
    [0, 1].forEach(seat => {
      const left = STONES - tn[seat], x0 = seat === 0 ? 18 : VW - 18 - STONES * 21, y = 24, col = seatCol(seat);
      rr(g, seat === 0 ? 8 : VW - 8 - (STONES * 21 + 24), 8, STONES * 21 + 24, 32, 16); g.fillStyle = 'rgba(5,9,22,.62)'; g.fill();
      for (let j = 0; j < STONES; j++) {
        const x = x0 + j * 21 + 8, on = j < left;
        g.beginPath(); g.arc(x, y, 7.5, 0, 7);
        if (on) { g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.6; g.stroke(); }
        else { g.strokeStyle = hexA(col, .4); g.lineWidth = 1.6; g.stroke(); }
      }
      if (hd.hammer === seat) {
        const hx = seat === 0 ? x0 + STONES * 21 + 6 : x0 - 10;
        g.beginPath(); g.arc(hx, y, 8, 0, 7); g.fillStyle = '#ffd66b'; g.fill();
        g.fillStyle = '#1a1407'; g.font = '900 11px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', hx, y + .5);
      }
    });
    const extra = hd.end > ENDS, label = extra ? 'EXTRA END' : `END ${hd.end} OF ${ENDS}`;
    g.font = '800 15px Orbitron, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(label).width + 30;
    rr(g, VW / 2 - w / 2, 10, w, 28, 14); g.fillStyle = 'rgba(5,9,22,.62)'; g.fill();
    g.fillStyle = '#eaf0ff'; g.fillText(label, VW / 2, 25);
    void c; void st;
  }
  function drawBanner(g) {
    let B = S.banner;
    const st = S.st, c = S.ctx;
    if (!B && !S.anim && c && st && (c.status === 'finished' || st.phase === 'done') && st.fin !== -1) {    // the final word stays up
      B = st.fin === 'draw' ? { text: 'DRAW', sub: `${st.score[0]} all after the extra end`, c: '#ffd66b', t: 40, dur: 1e9 }
        : { text: `${seatName(st.fin).toUpperCase()} WINS`, sub: `${st.score[st.fin]} to ${st.score[1 - st.fin]}`, c: seatCol(st.fin), t: 40, dur: 1e9 };
    }
    if (!B) return;
    const t = B.t, a = t < 10 ? t / 10 : t > B.dur - 16 ? (B.dur - t) / 16 : 1, sc = t < 12 ? .6 + .4 * ease(t / 12) + Math.sin(t / 12 * Math.PI) * .08 : 1;
    const y = VH * .42;
    g.save(); g.globalAlpha = Math.max(0, a);
    const band2 = g.createLinearGradient(0, y - 70, 0, y + 70); band2.addColorStop(0, 'rgba(5,8,20,0)'); band2.addColorStop(.5, 'rgba(5,8,20,.78)'); band2.addColorStop(1, 'rgba(5,8,20,0)');
    g.fillStyle = band2; g.fillRect(0, y - 70, VW, 140);
    g.translate(VW / 2, y); g.scale(sc, sc);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 54; g.font = `900 ${size}px Orbitron, system-ui, sans-serif`;
    while (g.measureText(B.text).width > VW * .88 && size > 26) { size -= 4; g.font = `900 ${size}px Orbitron, system-ui, sans-serif`; }
    g.globalCompositeOperation = 'lighter';
    [[16, .16], [8, .3]].forEach(([w, al]) => { g.lineWidth = w; g.strokeStyle = hexA(B.c, al); g.strokeText(B.text, 0, -8); });
    g.globalCompositeOperation = 'source-over';
    g.lineWidth = 3; g.strokeStyle = 'rgba(5,7,15,.9)'; g.strokeText(B.text, 0, -8);
    g.fillStyle = '#fff'; g.fillText(B.text, 0, -8);
    g.lineWidth = 1.6; g.strokeStyle = B.c; g.strokeText(B.text, 0, -8);
    if (B.sub) { g.font = '700 18px system-ui, sans-serif'; g.fillStyle = B.c; g.fillText(B.sub, 0, 36); }
    g.restore();
  }

  // a timeout can leave the match decided but not closed (skipTurn can't declare a winner). The turn-holder
  // closes it at once; the other phone after a grace, so an absent one can't strand it.
  const SETTLE_GRACE = 2500;
  function settle(st, first) {
    const key = st.mid + ':' + st.n + ':' + st.fin + ':' + first;
    if (S.settleKey === key) return;
    S.settleKey = key;
    setTimeout(() => {
      const c = S.ctx; if (!c || c.status !== 'active' || S.anim) return;
      const cur = norm(c.state); if (cur.mid !== st.mid || cur.phase !== 'done' || cur.fin === -1) return;
      c.commit(cloneSt(cur), cur.fin);
    }, first ? 0 : SETTLE_GRACE);
  }

  /* ---------------- registration ---------------- */
  const DEF = {
    id: 'curling', name: 'Curling', emoji: '🥌', category: 'Arcade', accent: '#6ec6ff',
    tagline: 'Slide it, curl it, park it on the button.',
    // the last stone is still sliding when the match finishes: hold the result card until it lands
    resultDelay: () => { const ms = remainingMs(); return ms ? Math.min(7500, ms + 350) : 0; },   // last stone + scoring moment (ui caps at 8 s)
    clockGrace: 8000,                                    // ~5 s throw replay (+ ~3 s end-scoring tail) before the next thrower can act
    // the clock ran out ("Chance gone"): that stone is lost. If it was the 8th the end is scored, and if that
    // decides the match the state is 'done' and settle() closes it with a winner.
    skipTurn: (st, opp) => { void opp; return skipState(st); },
    init: host => ({ mid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), turn: host, hammer: 1 - host, end: 1, ends: ENDS,
      tn: [0, 0], stones: [], score: [0, 0], log: [], phase: 'play', fin: -1, n: 0, clk: 0, last: null, note: '' }),
    test: {
      readSeen, simulate, inputFrom, resolve, skipState, scoreEnd, norm, cloneSt, throwerOf, sameOutcome, cleanV, pathLen,
      R, HW, HOG, TEE, BACK, HOUSE_R, FR, PER_END, STONES, ENDS, HMAX, P_TEE, P_HOG, S, CAM, P: (x, h, z) => P(x, h, z),
      launch: a => launch(a), canAct: () => canAct(), remainingMs: () => remainingMs(), toggleCurl: v => toggleCurl(v),
      replay: () => ({ anim: S.anim ? { id: S.anim.id, k: S.anim.k, fi: S.anim.fi, n: S.anim.frames.length, done: !!S.anim.done, tail: S.anim.tail || 0, snapped: !!S.anim.snapped, end: endTail(S.anim) } : null, doneId: S.doneId, raf: !!S.raf, parts: S.parts.length, view: viewNow() }),
    },

    render(ctx) {
      const st = norm(ctx.state), me = ctx.me, foe = 1 - me;
      ctx.state = st;
      if (st.mid !== S.mid || st.n < S.doneId) resetScene(st);
      S.ctx = ctx; S.st = st;
      if (S.lockN != null && st.n !== S.lockN) S.lockN = null;
      if (st.n !== S.lastN) { S.lastN = st.n; S.pref = null; }
      ensureCanvas();
      maybeReplay(st);

      const hd = hudNow();
      const wrap = ctx.h('div', { class: 'cl-wrap', style: `--cl-me:${seatCol(me)}` });
      ctx.root.append(ctx.turnBar({ scores: hd.score }), wrap);
      wrap.append(S.cv);                                         // the SAME canvas every repaint
      const live = canAct(), playing = ctx.status !== 'finished' && st.phase !== 'done';
      S.cv.setAttribute('aria-label', `Curling sheet. ${hd.end > ENDS ? 'Extra end' : `End ${hd.end} of ${ENDS}`}. ${seatName(0)} ${hd.score[0]}, ${seatName(1)} ${hd.score[1]}. ${seatName(hd.hammer)} has the hammer.` +
        (live ? ' Your throw: drag back from the stone, or use the arrow keys and Enter.' : ''));
      const eff = viewNow();
      const ctl = ctx.h('div', { class: 'cl-ctl' });
      const seg = ctx.h('div', { class: 'cl-seg', role: 'group', 'aria-label': 'Curl direction' });
      [[-1, '↺', 'Left', 'Curl left, counter-clockwise'], [1, '↻', 'Right', 'Curl right, clockwise']].forEach(([v, gl, tx, tip]) => {
        seg.append(ctx.h('button', { class: 'cl-btn', type: 'button', 'data-curl': String(v), 'aria-pressed': String(S.curl === v), 'aria-label': tip, title: tip,
          disabled: playing ? null : '', onclick: () => toggleCurl(v) },
        ctx.h('span', { class: 'gl', 'aria-hidden': 'true' }, gl), ctx.h('span', {}, tx)));
      });
      const hv = ctx.h('button', { class: 'cl-btn cl-house', type: 'button', 'aria-pressed': String(eff === 'house'), title: 'Look down on the house from above',
        disabled: playing ? null : '',
        onclick: () => { S.pref = viewNow() === 'house' ? 'aim' : 'house'; hv.setAttribute('aria-pressed', String(S.pref === 'house')); try { ctx.sound.tap(); } catch (e) {} ensureLoop(); } }, 'House view');
      ctl.append(seg, hv);
      const hint = ctx.h('div', { class: 'cl-hint', 'aria-live': 'polite' });
      const pending = !!(S.anim || (st.last && st.last.id > S.doneId));
      let html;
      const nth = Math.min(PER_END, st.tn[0] + st.tn[1] + 1);
      if (ctx.status === 'finished' || st.phase === 'done') {
        const f = st.fin;
        html = f === 'draw' ? `<b>Draw</b>, ${st.score[0]} all after the extra end.`
          : f === 0 || f === 1 ? `<b>${esc(seatName(f))}</b> wins ${st.score[f]} to ${st.score[1 - f]}.` : 'Game over.';
      } else if (pending) {
        const sh = S.anim ? S.anim.seat : (st.last ? st.last.seat : foe);
        html = sh === me ? 'Your stone is sliding.' : `<b>${esc(seatName(sh))}</b> has thrown.`;
        html += '<small>Tap the ice to speed it up.</small>';
      } else if (ctx.isMyTurn && st.turn === me) {
        html = `Stone <b>${nth} of ${PER_END}</b>. Drag back from the stone to aim, then let go.` +
          (st.hammer === me && nth === PER_END ? ' You have the hammer: last stone.' : '') +
          '<small>↺ bends left, ↻ bends right, and it bends more as it slows. A stone that stops short of the far hog line is removed.</small>';
        if (st.note === 'skip' && st.tn[me] + st.tn[foe] > 0) html = 'Their time ran out. ' + html;
      } else {
        html = `<b>${esc(seatName(foe))}</b> is throwing stone ${nth} of ${PER_END}.`;
        if (st.hammer === foe && nth === PER_END) html += ' They hold the hammer.';
        html += `<small>${esc(seatName(st.hammer))} throws last this end.</small>`;
        if (st.note === 'skip') html = 'Time ran out, so the stone was lost. ' + html;
      }
      hint.innerHTML = html;
      wrap.append(ctl, hint);
      fit(); draw(); ensureLoop();                               // paint now: a hidden page gets a frame too

      if (st.phase === 'done' && ctx.status === 'active' && !S.anim) settle(st, ctx.isMyTurn);
    },
  };
  Games.register(DEF);
})();
