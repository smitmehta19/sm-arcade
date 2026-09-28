/* ============================================================
   MINI GOLF — nine hand-built holes, two balls, one scorecard.

   Both balls play the same hole. Whoever is AWAY (farther from the cup
   by course distance, i.e. walking round the walls) putts next; on the
   tee the player with the honour goes first. A ball in the cup is done;
   a ball not holed after 6 strokes is picked up and scores 7. Water or
   lava = +1 penalty stroke and the ball goes back to where it was hit
   from. The balls don't collide with each other (kept simple on purpose).
   Fewest total strokes after 9 holes wins; equal totals = draw.

   Determinism: a putt is a PURE function simulate(hole, x0, y0, angle,
   power, phase) run at a fixed 240 Hz step with sub-step-safe capsule
   collisions. The windmill / sweeper phase is part of the committed
   input (captured at release from the phase the committed state left
   off at), never read from the clock during a replay. The putter
   commits input + resting spot + outcome FIRST, then animates; every
   phone replays the same input from `last` and SNAPS to the committed
   spot at the end, so engine float differences can't desync anything.

   Rendering follows Pocket Tanks / Fleabag: a MODULE-LEVEL canvas and
   loop (scene S) re-attached on every repaint, so a repaint can never
   restart or cut a roll. 2.5D top-down: raised walls with lit tops and
   side faces, soft shadows, a ball shadow, cup + flag, five themes, a
   camera that follows the ball, a flyover on every new hole, slow-mo
   on the drop, particles for everything. The loop idles when nothing
   moves (windmill holes keep turning).
   ============================================================ */
(function () {
  const css = `
  .mg-wrap{ display:flex; flex-direction:column; gap:9px; }
  .mg-cv{ width:100%; display:block; border-radius:var(--r-3); border:1px solid var(--glass-brd);
    box-shadow:var(--shadow-soft); background:#05070f; touch-action:none; user-select:none; -webkit-user-select:none; }
  .mg-hint{ text-align:center; font-size:12.5px; color:var(--ink-dim); line-height:1.5; min-height:19px; }
  .mg-hint b{ color:var(--ink); }
  .mg-row{ display:flex; gap:7px; justify-content:center; flex-wrap:wrap; }
  .mg-btn{ padding:7px 13px; border-radius:var(--r-pill); background:var(--panel-2); border:1px solid var(--glass-brd);
    color:var(--ink); font-size:12px; font-weight:700; letter-spacing:.3px; touch-action:manipulation;
    transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), color var(--dur-2); }
  .mg-btn:active{ transform:scale(.94); }
  .mg-btn.on{ border-color:var(--gold); color:var(--gold); box-shadow:0 0 14px -5px var(--gold); }
  .mg-card{ border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); padding:5px 5px 3px; }
  .mg-card table{ width:100%; border-collapse:collapse; table-layout:fixed; font-family:var(--font-num); font-size:11px; }
  .mg-card th, .mg-card td{ text-align:center; padding:4px 0; font-weight:700; }
  .mg-card th:first-child{ width:48px; text-align:left; padding-left:4px; font-family:var(--font-body); font-size:11.5px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mg-card th:last-child, .mg-card td:last-child{ width:30px; border-left:1px solid var(--line); }
  .mg-card tr.hd th{ color:var(--ink-faint); font-size:9.5px; letter-spacing:.5px; font-weight:800; }
  .mg-card tr.par td, .mg-card tr.par th{ color:var(--ink-faint); font-size:10px; border-bottom:1px solid var(--line); }
  .mg-card tr.p0 th{ color:var(--p1); } .mg-card tr.p1 th{ color:var(--p2); }
  .mg-card .cur{ background:rgba(255,214,107,.1); }
  .mg-card tr.hd th.cur{ color:var(--gold); }
  .mg-card .ace{ color:#fff; text-shadow:0 0 8px var(--gold); } .mg-card .eag{ color:var(--lime); }
  .mg-card .bir{ color:var(--gold); } .mg-card .par0{ color:var(--ink); } .mg-card .bog{ color:var(--ink-dim); }
  .mg-card .dbl{ color:#ff8a7a; } .mg-card .pick{ color:#ff5a6a; text-decoration:underline dotted; }
  .mg-card .live{ color:var(--ink-faint); font-style:italic; } .mg-card .none{ color:var(--ink-faint); opacity:.5; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------------- physics constants (world units ≈ px at zoom 1) ---------------- */
  const DT = 1 / 240, MAX_STEPS = 240 * 20;
  const R = 7, CUP_R = 12, CAP_V = 360, STOP_V = 5, V_MAX = 980, V_CAP = 1250;
  const FR_GREEN = 330, DG_GREEN = .35, FR_SAND = 1600, DG_SAND = 3, FR_ICE = 90, DG_ICE = .15;
  const E_WALL = .7, MU = .12, E_BUMP = 1, BUMP_KICK = 230;
  const RAMP_F = 650, RAMP_H = 14, GZ = 1400, JUMP_K = .32;
  const PORT_R = 15, MILL_W = 1.5, MILL_GAP = .3, SPIN_W = 1.8, SPIN_HUB = 11;
  const MAX_STROKES = 6, PICKUP = 7, HOLES_N = 9;
  const VIEW_W = 430;                                  // world units across the canvas at zoom 1
  const TAU = Math.PI * 2;

  const r2 = v => Math.round(v * 100) / 100;
  const r4 = v => Math.round(v * 10000) / 10000;
  const normAng = a => { a %= TAU; return a < 0 ? a + TAU : a; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  // power (0..1 of the drag) → launch speed; the curve gives short putts more resolution
  const speedOf = p => V_MAX * (.45 * p + .55 * p * p);
  function arc(cx, cy, r, a0, a1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([r2(cx + Math.cos(a) * r), r2(cy + Math.sin(a) * r)]); }
    return out;
  }
  const D2R = Math.PI / 180;

  /* ---------------- the nine holes (data) ----------------
     wall: polylines; the FIRST is the closed course boundary. hw = half thickness (capsule).
     solid:1 → a filled block. zone k: sand / ice / slope (f = push) / ramp (d = uphill dir) /
     water / lava. bump: [x,y,r]. port: a → b tunnel. mill: windmill door. spin: rotating sweeper. */
  const HOLES = [
    { name: 'Garden Gate', theme: 'garden', par: 2, tee: [200, 530], cup: [245, 125],
      wall: [
        { p: [[90, 590], [310, 590], [310, 340], [345, 305], [345, 50], [125, 50], [125, 260], [90, 295]], c: 1, hw: 6 },
        { p: [[182, 386], [236, 386], [236, 420], [182, 420]], c: 1, hw: 5, solid: 1 },
      ],
      bump: [[158, 330, 14], [292, 235, 14], [175, 172, 12]], zone: [] },
    { name: 'Moonlit Bend', theme: 'garden', par: 3, tee: [270, 610], cup: [115, 120],
      wall: [
        { p: [[60, 670], [340, 670], [340, 200]].concat(arc(190, 200, 150, 0, -Math.PI / 2, 12).slice(1), [[60, 50]]), c: 1, hw: 6 },
        { p: [[60, 262], [205, 262]], hw: 7 },
      ],
      bump: [[285, 560, 13]],
      zone: [{ k: 'slope', r: [66, 300, 268, 160], f: [-260, 0] }] },
    { name: 'Sandy Cove', theme: 'beach', par: 3, tee: [260, 600], cup: [200, 110],
      wall: [{ p: [[50, 660], [350, 660], [350, 40], [50, 40]], c: 1, hw: 6 }],
      bump: [[228, 330, 13], [112, 600, 11]],
      zone: [
        { k: 'water', p: [[44, 170], [140, 196], [168, 300], [150, 420], [118, 500], [44, 520]] },
        { k: 'sand', e: [200, 200, 80, 26] }, { k: 'sand', e: [292, 400, 44, 32] },
      ] },
    { name: 'Island Hop', theme: 'beach', par: 3, tee: [200, 690], cup: [190, 150],
      wall: [
        { p: [[50, 750], [350, 750], [350, 40], [50, 40]], c: 1, hw: 6 },
        { p: [[300, 294], [300, 436]], hw: 6 },
        { p: [[166, 440], [166, 490]], hw: 4 }, { p: [[234, 440], [234, 490]], hw: 4 },
      ],
      bump: [[125, 205, 13], [262, 190, 13]],
      zone: [{ k: 'water', r: [44, 298, 250, 134] }, { k: 'ramp', r: [170, 442, 60, 44], d: [0, -1] }] },
    { name: 'Frozen Loop', theme: 'ice', par: 3, tee: [100, 690], cup: [300, 615],
      wall: [
        { p: [[40, 750], [40, 210]].concat(arc(200, 210, 160, Math.PI, TAU, 20).slice(1, -1), [[360, 210], [360, 750]]), c: 1, hw: 6 },
        { p: [[160, 750], [160, 215]].concat(arc(200, 215, 40, Math.PI, TAU, 10).slice(1, -1), [[240, 215], [240, 750]]), c: 1, hw: 5, solid: 1 },
      ],
      bump: [],
      zone: [{ k: 'ice', r: [46, 250, 108, 420] }, { k: 'ice', r: [46, 40, 308, 175] }, { k: 'slope', r: [246, 300, 108, 200], f: [0, 160] }] },
    { name: 'Crystal Portal', theme: 'ice', par: 3, tee: [140, 620], cup: [270, 112],
      wall: [{ p: [[50, 690], [350, 690], [350, 40], [50, 40]], c: 1, hw: 6 }, { p: [[50, 370], [350, 370]], hw: 8 }],
      bump: [[150, 178, 13], [300, 232, 12], [120, 548, 12]],
      port: [{ a: [290, 450], b: [110, 300] }],
      zone: [{ k: 'ice', r: [56, 470, 150, 120] }] },
    { name: 'Lava Run', theme: 'lava', par: 3, tee: [200, 690], cup: [200, 105],
      wall: [{ p: [[40, 750], [360, 750], [360, 40], [40, 40]], c: 1, hw: 6 }],
      bump: [[125, 150, 13], [280, 160, 13], [300, 640, 12]],
      zone: [
        { k: 'lava', p: [[34, 420], [168, 428], [186, 500], [166, 572], [34, 580]] },
        { k: 'lava', p: [[366, 240], [236, 254], [220, 322], [240, 398], [366, 410]] },
        { k: 'slope', r: [186, 428, 168, 144], f: [-230, 0] },
        { k: 'slope', r: [46, 254, 174, 150], f: [230, 0] },
      ] },
    { name: 'Windmill Keep', theme: 'castle', par: 3, tee: [200, 680], cup: [200, 130],
      wall: [
        { p: [[50, 730], [350, 730], [350, 40], [50, 40]], c: 1, hw: 6 },
        { p: [[136, 298], [176, 298], [176, 374], [136, 374]], c: 1, hw: 4, solid: 1 },
        { p: [[224, 298], [264, 298], [264, 374], [224, 374]], c: 1, hw: 4, solid: 1 },
        { p: [[50, 336], [136, 336]], hw: 7 }, { p: [[264, 336], [350, 336]], hw: 7 },
        { p: [[176, 420], [176, 464]], hw: 4 }, { p: [[224, 420], [224, 464]], hw: 4 },
      ],
      bump: [[135, 200, 12], [265, 205, 12]],
      mill: { x: 200, y: 318, len: 64, door: [180, 220, 378] },
      zone: [{ k: 'water', r: [44, 422, 128, 40] }, { k: 'water', r: [228, 422, 128, 40] }] },
    { name: 'Grand Finale', theme: 'castle', par: 4, tee: [100, 830], cup: [285, 120],
      wall: [
        { p: [[40, 890], [360, 890], [360, 40], [40, 40]], c: 1, hw: 6 },
        { p: [[40, 620], [272, 620]], hw: 8 }, { p: [[128, 340], [360, 340]], hw: 8 },
        { p: arc(285, 120, 58, 170 * D2R, 460 * D2R, 26), hw: 5 },
      ],
      bump: [[180, 730, 15], [262, 790, 14], [300, 690, 14]],
      spin: { x: 215, y: 480, len: 62 },
      zone: [{ k: 'sand', e: [95, 560, 46, 26] }, { k: 'slope', r: [46, 350, 308, 95], f: [-240, 0] }, { k: 'water', r: [298, 238, 56, 94] }] },
  ];
  const PARS = HOLES.map(h => h.par), PAR_TOTAL = PARS.reduce((a, b) => a + b, 0);

  const THEMES = {
    garden: { name: 'Neon Night Garden', bg: '#040b08', ground: ['#0b1d15', '#050e0a'], felt: ['#25935b', '#166a41'], slab: '#08251a',
      wall: { top: '#7f5eff', side: '#2a1a70', edge: '#e2d8ff', glow: '#9b7bff' }, lamp: '150,110,255', flag: '#ff4d9d', amb: 'fire' },
    beach: { name: 'Sunset Beach', bg: '#1d120f', ground: ['#c29058', '#8f6038'], felt: ['#2ca76c', '#1b7e4f'], slab: '#6a4527',
      wall: { top: '#f3e2bd', side: '#8f6a3b', edge: '#fffaf0', glow: '#ffcf8a' }, lamp: '255,170,100', flag: '#ff6b4a', amb: '',
      water: ['#46e0e6', '#1592b0', '#0b5373'] },
    ice: { name: 'Ice Cave', bg: '#030814', ground: ['#0f2440', '#061022'], felt: ['#2f9c9c', '#1e7076'], slab: '#10304a',
      wall: { top: '#d4f7ff', side: '#3a8db3', edge: '#ffffff', glow: '#7fe7ff' }, lamp: '120,220,255', flag: '#2fe6ff', amb: 'snow' },
    lava: { name: 'Lava Keep', bg: '#0b0403', ground: ['#1e100b', '#0c0605'], felt: ['#2e7d46', '#1f5a31'], slab: '#1a0c08',
      wall: { top: '#433840', side: '#151013', edge: '#ffa052', glow: '#ff5a1f' }, lamp: '255,110,40', flag: '#ffd66b', amb: 'ember' },
    castle: { name: 'Moonlit Castle', bg: '#06060c', ground: ['#1c1e2b', '#10111a'], felt: ['#2b9156', '#1b6a3c'], slab: '#1d1f2c',
      wall: { top: '#a9abbd', side: '#474a5d', edge: '#f1f2ff', glow: '#ffd66b' }, lamp: '255,190,90', flag: '#ff4d9d', amb: '',
      water: ['#4f8ff0', '#1f4a9a', '#0e2256'] },
  };

  /* ---------------- geometry helpers (pure) ---------------- */
  function pip(poly, x, y) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }
  function inZone(z, x, y) {
    if (x < z.x0 || x > z.x1 || y < z.y0 || y > z.y1) return false;
    if (z.r) return true;
    if (z.e) { const dx = (x - z.e[0]) / z.e[2], dy = (y - z.e[1]) / z.e[3]; return dx * dx + dy * dy <= 1; }
    return pip(z.p, x, y);
  }
  function segDist(ax, ay, bx, by, x, y) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? ((x - ax) * dx + (y - ay) * dy) / L2 : 0; t = clamp(t, 0, 1);
    const qx = ax + dx * t - x, qy = ay + dy * t - y;
    return Math.sqrt(qx * qx + qy * qy);
  }
  function rampProg(z, x, y) {
    const [rx, ry, rw, rh] = z.r, d = z.d;
    if (d[1] < 0) return (ry + rh - y) / rh;
    if (d[1] > 0) return (y - ry) / rh;
    if (d[0] > 0) return (x - rx) / rw;
    return (rx + rw - x) / rw;
  }
  const PREP = [];
  function hole(hi) {
    if (PREP[hi]) return PREP[hi];
    const d = HOLES[hi], segs = [];
    d.wall.forEach(w => {
      const p = w.p, n = p.length, m = w.c ? n : n - 1;
      for (let i = 0; i < m; i++) { const a = p[i], b = p[(i + 1) % n]; segs.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], hw: w.hw || 6 }); }
    });
    const zones = (d.zone || []).map(z => {
      const o = Object.assign({}, z);
      if (z.r) { o.x0 = z.r[0]; o.y0 = z.r[1]; o.x1 = z.r[0] + z.r[2]; o.y1 = z.r[1] + z.r[3]; }
      else if (z.e) { o.x0 = z.e[0] - z.e[2]; o.x1 = z.e[0] + z.e[2]; o.y0 = z.e[1] - z.e[3]; o.y1 = z.e[1] + z.e[3]; }
      else { o.x0 = Math.min(...z.p.map(q => q[0])); o.x1 = Math.max(...z.p.map(q => q[0])); o.y0 = Math.min(...z.p.map(q => q[1])); o.y1 = Math.max(...z.p.map(q => q[1])); }
      return o;
    });
    const bound = d.wall[0].p;
    const bb = { x0: Math.min(...bound.map(q => q[0])), x1: Math.max(...bound.map(q => q[0])), y0: Math.min(...bound.map(q => q[1])), y1: Math.max(...bound.map(q => q[1])) };
    const cxw = (bb.x0 + bb.x1) / 2, half = Math.max(235, (bb.x1 - bb.x0) / 2 + 90);
    const H = PREP[hi] = {
      i: hi, def: d, par: d.par, name: d.name, theme: d.theme, tee: d.tee, cup: d.cup,
      segs, bound, solids: d.wall.filter(w => w.solid).map(w => w.p), walls: d.wall,
      zones: zones.filter(z => z.k !== 'water' && z.k !== 'lava'), haz: zones.filter(z => z.k === 'water' || z.k === 'lava'), allZones: zones,
      bumps: d.bump || [], ports: d.port || [], mill: d.mill || null, spin: d.spin || null,
      bb, world: { x0: cxw - half, x1: cxw + half, y0: bb.y0 - 110, y1: bb.y1 + 110 },
    };
    return H;
  }
  function millBlocked(th) {
    const q = Math.PI / 2; let m = (th - q) % q; if (m < 0) m += q;
    return m < MILL_GAP || m > q - MILL_GAP;
  }
  const phaseSpeed = hi => HOLES[hi].mill ? MILL_W : HOLES[hi].spin ? SPIN_W : 0;

  /* ---------------- collision primitives ---------------- */
  // capsule (segment ab, radius rad) vs ball; u = velocity of the surface (moving sweeper) or null
  function hitCap(b, ax, ay, bx, by, rad, e, spin) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let t = L2 ? ((b.x - ax) * dx + (b.y - ay) * dy) / L2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t, qy = ay + dy * t;
    let nx = b.x - qx, ny = b.y - qy; const d2 = nx * nx + ny * ny;
    if (d2 >= rad * rad) return 0;
    const ux = spin ? -spin.w * (qy - spin.y) : 0, uy = spin ? spin.w * (qx - spin.x) : 0;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { nx = -(b.vx - ux); ny = -(b.vy - uy); d = Math.sqrt(nx * nx + ny * ny); if (d < 1e-9) { nx = -dy; ny = dx; d = Math.sqrt(L2) || 1; } }
    nx /= d; ny /= d;
    b.x = qx + nx * rad; b.y = qy + ny * rad;
    const rvx = b.vx - ux, rvy = b.vy - uy, vn = rvx * nx + rvy * ny;
    if (vn >= 0) return .001;
    const tx = rvx - vn * nx, ty = rvy - vn * ny, tl = Math.sqrt(tx * tx + ty * ty);
    const jt = Math.min(tl, MU * (1 + e) * -vn), f = tl > 1e-9 ? (tl - jt) / tl : 0;
    b.vx = ux + tx * f - e * vn * nx; b.vy = uy + ty * f - e * vn * ny;
    return -vn;
  }
  function hitBump(b, cx, cy, r) {
    const rad = r + R; let nx = b.x - cx, ny = b.y - cy; const d2 = nx * nx + ny * ny;
    if (d2 >= rad * rad) return 0;
    let d = Math.sqrt(d2); if (d < 1e-6) { nx = -b.vx; ny = -b.vy; d = Math.sqrt(nx * nx + ny * ny) || 1; if (!nx && !ny) ny = d = 1; }
    nx /= d; ny /= d; b.x = cx + nx * rad; b.y = cy + ny * rad;
    const vn = b.vx * nx + b.vy * ny; if (vn >= 0) return .001;
    const tx = b.vx - vn * nx, ty = b.vy - vn * ny, outN = -vn > 25 ? Math.max(-vn * E_BUMP, BUMP_KICK) : -vn * .6;
    b.vx = tx + nx * outN; b.vy = ty + ny * outN;
    const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy); if (s > V_CAP) { b.vx *= V_CAP / s; b.vy *= V_CAP / s; }
    return -vn;
  }

  /* ---------------- THE simulation (pure, deterministic) ----------------
     Returns { out: 'cup'|'water'|'rest', x, y, steps, rescue, path?, ev? }.
     path = [x,y,z, x,y,z, ...] per 1/240 s step; ev = events for effects. */
  function simulate(hi, x0, y0, ang, pow, ph, rec) {
    const H = hole(hi), b = { x: x0, y: y0, vx: 0, vy: 0 }, sp = speedOf(pow);
    b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp;
    let z = 0, vz = 0, air = false, still = 0, lip = false, out = 'rest', i = 0, rescue = 0, surf = 'green', hitCd = 0;
    const path = rec ? [x0, y0, 0] : null, ev = rec ? [] : null;
    const cx = H.cup[0], cy = H.cup[1];
    const mark = (k, o) => { if (ev) ev.push(Object.assign({ i, k, x: b.x, y: b.y }, o || {})); };
    const spinO = H.spin ? { x: H.spin.x, y: H.spin.y, w: SPIN_W } : null;
    for (i = 1; i <= MAX_STEPS; i++) {
      const t = i * DT;
      // 1. the ground under the ball: friction, slopes, the ramp
      let fr = FR_GREEN, dg = DG_GREEN, fx = 0, fy = 0, s2 = 'green', onRamp = null;
      if (!air) for (let k = 0; k < H.zones.length; k++) {
        const zn = H.zones[k]; if (!inZone(zn, b.x, b.y)) continue;
        if (zn.k === 'sand') { fr = FR_SAND; dg = DG_SAND; s2 = 'sand'; }
        else if (zn.k === 'ice') { fr = FR_ICE; dg = DG_ICE; s2 = 'ice'; }
        else if (zn.k === 'slope') { fx += zn.f[0]; fy += zn.f[1]; }
        else if (zn.k === 'ramp') { onRamp = zn; fx -= zn.d[0] * RAMP_F; fy -= zn.d[1] * RAMP_F; }
      }
      if (s2 !== surf) { if (s2 === 'sand') mark('sand'); surf = s2; }
      b.vx += fx * DT; b.vy += fy * DT;
      const s0 = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (!air && s0 > 0) { const ns = Math.max(0, s0 - (fr + dg * s0) * DT); b.vx *= ns / s0; b.vy *= ns / s0; }
      // 2. move (≤ 5.3 units per step at the speed cap — well under the 9+ unit capsule radius, so no tunnelling)
      const px = b.x, py = b.y;
      b.x += b.vx * DT; b.y += b.vy * DT;
      if (air) { z += vz * DT; vz -= GZ * DT; if (z <= 0) { z = 0; vz = 0; air = false; b.vx *= .8; b.vy *= .8; mark('land'); } }
      // 3. collisions, resolved in up to 3 passes (corners)
      let imp = 0;
      for (let pass = 0; pass < 3; pass++) {
        let any = 0;
        for (let k = 0; k < H.segs.length; k++) { const s = H.segs[k], v = hitCap(b, s.ax, s.ay, s.bx, s.by, s.hw + R, E_WALL, null); if (v) { any = 1; if (v > imp) imp = v; } }
        for (let k = 0; k < H.bumps.length; k++) { const q = H.bumps[k], v = hitBump(b, q[0], q[1], q[2]); if (v) { any = 1; if (pass === 0 && v > 20) mark('bump', { n: k, v }); } }
        if (H.mill && millBlocked(ph + MILL_W * t)) { const d = H.mill.door, v = hitCap(b, d[0], d[2], d[1], d[2], 4 + R, .5, null); if (v) { any = 1; if (pass === 0 && v > 15) mark('mill', { v }); } }
        if (spinO) {
          const th = ph + SPIN_W * t;
          for (let k = 0; k < 2; k++) {
            const a = th + k * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
            const v = hitCap(b, spinO.x + ca * SPIN_HUB, spinO.y + sa * SPIN_HUB, spinO.x + ca * H.spin.len, spinO.y + sa * H.spin.len, 4 + R, .6, spinO);
            if (v) { any = 1; if (pass === 0 && v > 20) mark('spin', { v }); }
          }
          const v = hitBump(b, spinO.x, spinO.y, SPIN_HUB); if (v) any = 1;
        }
        if (!any) break;
      }
      if (imp > 70 && hitCd <= 0) { mark('wall', { v: imp }); hitCd = 10; }
      hitCd--;
      // 4. belt and braces: the ball can never leave the course or sit inside a block
      if (!pip(H.bound, b.x, b.y) || H.solids.some(p => pip(p, b.x, b.y))) { b.x = px; b.y = py; b.vx *= -.5; b.vy *= -.5; rescue++; }
      // 5. ramp → airborne off the lip
      let zr = 0;
      if (onRamp && !air) {
        const nowOn = inZone(onRamp, b.x, b.y), pr = rampProg(onRamp, b.x, b.y), vd = b.vx * onRamp.d[0] + b.vy * onRamp.d[1];
        if (!nowOn && vd > 0 && pr >= 1) { air = true; z = RAMP_H; vz = vd * JUMP_K; mark('jump'); }
        else if (nowOn) zr = RAMP_H * clamp(pr, 0, 1);
      }
      // 6. tunnels
      if (!air) for (let k = 0; k < H.ports.length; k++) {
        const P = H.ports[k], dx = b.x - P.a[0], dy = b.y - P.a[1];
        if (dx * dx + dy * dy < PORT_R * PORT_R) { mark('port', { n: k }); b.x = P.b[0]; b.y = P.b[1]; b.vx *= .9; b.vy *= .9; mark('portOut', { n: k }); }
      }
      // 7. hazards
      if (!air) { let hz = null; for (let k = 0; k < H.haz.length; k++) if (inZone(H.haz[k], b.x, b.y)) { hz = H.haz[k]; break; }
        if (hz) { out = 'water'; mark(hz.k); if (path) path.push(b.x, b.y, 0); break; } }
      // 8. the cup: slow enough → it drops; too fast → it lips out
      let near = false;
      if (!air) {
        const dx = cx - b.x, dy = cy - b.y, d = Math.sqrt(dx * dx + dy * dy), s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        near = d < CUP_R;                                               // centre over the hole: a slow ball falls in
        if (near && s < 240 && d > 1e-6) { const pull = 1500 * DT; b.vx += dx / d * pull; b.vy += dy / d * pull; }
        if (d < CUP_R - 3) {
          if (s < CAP_V && !lip) { out = 'cup'; mark('cup', { s }); b.x = cx; b.y = cy; if (path) path.push(cx, cy, 0); break; }
          if (!lip) {
            lip = true;
            const cr = b.vx * dy - b.vy * dx, rot = (cr >= 0 ? -1 : 1) * (.25 + .5 * Math.min(1, d / CUP_R));
            const c = Math.cos(rot), sn = Math.sin(rot), vx = b.vx * c - b.vy * sn, vy = b.vx * sn + b.vy * c;
            b.vx = vx * .74; b.vy = vy * .74; mark('lip');
          }
        } else if (d > CUP_R + R) lip = false;
      }
      if (path) path.push(b.x, b.y, air ? z : zr);
      // 9. coming to rest (static friction holds it unless a slope is steeper)
      if (!air && !near) {
        const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        if (s < STOP_V && Math.sqrt(fx * fx + fy * fy) <= fr) { b.vx = b.vy = 0; break; }
        if (s < 12) { if (++still > 150) { b.vx = b.vy = 0; break; } } else still = 0;
      } else still = 0;
    }
    return { out, x: b.x, y: b.y, steps: Math.min(i, MAX_STEPS), rescue, path, ev };
  }

  /* ---------------- course distance ("who is away") ----------------
     Dijkstra on an 8-unit grid from the cup, walking round walls and blocks; a
     tunnel mouth is as close as its exit. Only the putting phone evaluates it —
     the resulting turn is committed, so the partner never has to agree on it. */
  const GC = 8;
  function grid(hi) {
    const H = hole(hi); if (H.grid) return H.grid;
    const { x0, y0, x1, y1 } = H.bb, nx = Math.ceil((x1 - x0) / GC) + 1, ny = Math.ceil((y1 - y0) / GC) + 1;
    const nav = new Uint8Array(nx * ny), dist = new Int32Array(nx * ny).fill(1e9);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * GC, y = y0 + j * GC;
      if (!pip(H.bound, x, y) || H.solids.some(p => pip(p, x, y))) continue;
      let ok = true; for (const s of H.segs) if (segDist(s.ax, s.ay, s.bx, s.by, x, y) < s.hw + 2) { ok = false; break; }
      if (ok) nav[j * nx + i] = 1;
    }
    const cell = (x, y) => {
      const ci = Math.round((x - x0) / GC), cj = Math.round((y - y0) / GC); let best = -1, bd = 1e9;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nx || j >= ny || !nav[j * nx + i]) continue;
        const dd = Math.abs(x0 + i * GC - x) + Math.abs(y0 + j * GC - y); if (dd < bd) { bd = dd; best = j * nx + i; }
      }
      return best;
    };
    // simple binary-heap Dijkstra (integer costs 10 / 14)
    const heap = [], push = (d, c) => { heap.push([d, c]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    const start = cell(H.cup[0], H.cup[1]);
    const portIn = H.ports.map(P => ({ exit: cell(P.b[0], P.b[1]), mouth: cell(P.a[0], P.a[1]) }));
    if (start >= 0) { dist[start] = 0; push(0, start); }
    while (heap.length) {
      const [d, c] = pop(); if (d !== dist[c]) continue;
      const ci = c % nx, cj = (c / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
        const n = j * nx + i; if (!nav[n]) continue;
        if (di && dj && (!nav[cj * nx + i] || !nav[j * nx + ci])) continue;      // no cutting corners
        const nd = d + (di && dj ? 14 : 10); if (nd < dist[n]) { dist[n] = nd; push(nd, n); }
      }
      portIn.forEach(p => { if (p.exit === c && p.mouth >= 0 && d < dist[p.mouth]) { dist[p.mouth] = d; push(d, p.mouth); } });
    }
    H.grid = { nx, ny, x0, y0, nav, dist, cell };
    return H.grid;
  }
  function away(hi, x, y) {
    const G = grid(hi), c = G.cell(x, y);
    if (c < 0 || G.dist[c] >= 1e9) { const H = hole(hi), dx = x - H.cup[0], dy = y - H.cup[1]; return 5000 + Math.sqrt(dx * dx + dy * dy); }
    const gx = G.x0 + (c % G.nx) * GC, gy = G.y0 + ((c / G.nx) | 0) * GC;
    return G.dist[c] * GC / 10 + Math.sqrt((gx - x) * (gx - x) + (gy - y) * (gy - y));
  }

  /* ---------------- rules (pure) ---------------- */
  const teeBall = hi => ({ x: HOLES[hi].tee[0], y: HOLES[hi].tee[1], s: 0, done: 0 });
  function norm(st) {
    if (!st || typeof st !== 'object') return st;
    st.hole = clamp(st.hole | 0, 0, HOLES_N - 1);
    const tb = teeBall(st.hole), bs = Array.isArray(st.balls) ? st.balls : [];
    st.balls = [0, 1].map(i => { const b = bs[i] || {}; return { x: isFinite(+b.x) && b.x !== null && b.x !== '' ? +b.x : tb.x, y: isFinite(+b.y) && b.y !== null && b.y !== '' ? +b.y : tb.y, s: b.s | 0, done: b.done ? 1 : 0 }; });
    const cs = Array.isArray(st.cards) ? st.cards : [];
    st.cards = [0, 1].map(i => { const c = cs[i]; const out = []; for (let k = 0; k < HOLES_N; k++) out.push((c && +c[k]) || 0); return out; });
    st.n = st.n | 0; st.clk = st.clk | 0; st.ph = +st.ph || 0; st.over = st.over ? 1 : 0;
    st.honor = st.honor === 1 ? 1 : 0; if (st.turn !== 0 && st.turn !== 1) st.turn = st.honor;
    if (!st.seed) st.seed = 1;
    if (!st.last || typeof st.last !== 'object') st.last = null;
    else { const L = st.last; L.pv = Array.isArray(L.pv) ? L.pv : [0, 0]; L.ps = Array.isArray(L.ps) ? L.ps : [0, 0]; L.id = L.id | 0; L.hole = L.hole | 0; L.seat = L.seat === 1 ? 1 : 0; }
    return st;
  }
  const totals = st => [0, 1].map(p => st.cards[p].reduce((a, v) => a + v, 0) + (st.balls[p].done ? 0 : st.balls[p].s));
  function nextTurn(st, justPlayed) {
    const live = [0, 1].filter(p => !st.balls[p].done);
    if (!live.length) return st.turn;
    if (live.length === 1) return live[0];
    const unteed = live.filter(p => st.balls[p].s === 0);             // everyone tees off first, honour first
    if (unteed.length) return unteed.includes(st.honor) ? st.honor : unteed[0];
    const d0 = away(st.hole, st.balls[0].x, st.balls[0].y), d1 = away(st.hole, st.balls[1].x, st.balls[1].y);
    if (Math.abs(d0 - d1) < .5) return justPlayed === 0 || justPlayed === 1 ? 1 - justPlayed : st.honor;
    return d0 > d1 ? 0 : 1;
  }
  const winnerOf = st => { const t = totals(st); return t[0] === t[1] ? 'draw' : (t[0] < t[1] ? 0 : 1); };
  // both balls are done: honour, then the next hole (or the end). Returns the winner when it's over.
  function endHole(s) {
    const hi = s.hole, c0 = s.cards[0][hi], c1 = s.cards[1][hi];
    if (c0 !== c1) s.honor = c0 < c1 ? 0 : 1;
    if (hi >= HOLES_N - 1) { s.over = 1; s.turn = s.honor; return winnerOf(s); }
    s.hole = hi + 1; s.balls = [teeBall(s.hole), teeBall(s.hole)]; s.turn = s.honor;
    return undefined;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  // One putt, fully resolved into the next state. Pure apart from the `at` timestamp.
  function applyStroke(st0, seat, ang, pow, ph, res) {
    const st = norm(clone(st0)), s = clone(st), hi = s.hole, b = s.balls[seat];
    const r = res || simulate(hi, b.x, b.y, ang, pow, ph, false);
    const pv = totals(st), ps = [st.balls[0].s, st.balls[1].s], x0 = b.x, y0 = b.y;
    b.s += r.out === 'water' ? 2 : 1;                                     // penalty stroke
    let pick = 0;
    if (r.out === 'cup') { b.done = 1; b.x = HOLES[hi].cup[0]; b.y = HOLES[hi].cup[1]; s.cards[seat][hi] = b.s; }
    else {
      if (r.out === 'rest') { b.x = r2(r.x); b.y = r2(r.y); }             // water: back where it was hit from
      if (b.s >= MAX_STROKES) { b.done = 1; pick = 1; s.cards[seat][hi] = PICKUP; }
    }
    s.n = st.n + 1; s.clk = s.n;
    const w = phaseSpeed(hi); s.ph = w ? r4(normAng(ph + w * r.steps * DT)) : st.ph;
    s.last = { id: s.n, seat, hole: hi, x0, y0, ang, pow, ph, out: r.out, x: b.x, y: b.y, s: b.s, pick, pv, ps, at: Date.now() };
    let winner;
    if (s.balls[0].done && s.balls[1].done) winner = endHole(s);
    else s.turn = nextTurn(s, seat);
    return { s, winner, res: r };
  }
  // the timer ran out: the stroke counts, the ball doesn't move, and the turn passes if it can
  function skipState(st0, opp) {
    const s = norm(clone(st0)), me = 1 - opp;
    if (s.over) return s;
    const b = s.balls[me], hi = s.hole;
    if (b.done) { s.turn = nextTurn(s, me); return s; }
    const pv = totals(s), ps = [s.balls[0].s, s.balls[1].s];
    b.s += 1; let pick = 0;
    if (b.s >= MAX_STROKES) { b.done = 1; pick = 1; s.cards[me][hi] = PICKUP; }
    s.n += 1; s.clk = s.n;
    s.last = { id: s.n, seat: me, hole: hi, skip: 1, out: 'skip', x0: b.x, y0: b.y, x: b.x, y: b.y, s: b.s, pick, pv, ps, at: Date.now() };
    if (s.balls[0].done && s.balls[1].done) endHole(s);                  // may set over=1 → settled in render
    else s.turn = s.balls[opp].done ? me : opp;
    return s;
  }
  function label(strokes, par, pick) {
    if (pick) return 'PICKED UP';
    if (strokes === 1) return 'HOLE IN ONE!';
    const d = strokes - par;
    return d <= -3 ? 'ALBATROSS!' : d === -2 ? 'EAGLE!' : d === -1 ? 'BIRDIE!' : d === 0 ? 'PAR' : d === 1 ? 'BOGEY' : d === 2 ? 'DOUBLE BOGEY' : '+' + d;
  }

  /* ---------------- module-level scene (survives repaints) ---------------- */
  const S = {
    cv: null, g: null, ctx: null, raf: 0, inLoop: false, lastTs: 0,
    cssW: 0, cssH: 0, W: 0, H: 0, dpr: 1, scale: 1,
    seed: null, shownHole: -1, layer: null,
    cam: { x: 200, y: 400, z: 1 }, sx: 0, sy: 0,
    anim: null, doneId: 0, sentN: 0, intro: null, summary: null, overview: false,
    drag: null, aim: null, parts: [], floats: [], amb: [], shake: 0, flash: 0, tick: 0,
    bflash: {}, roll: [0, 0], phBase: 0, phT0: 0, lastPh: null, fin: false, sndT: 0, settleKey: '',
    calm: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function resetScene(st) {
    S.seed = st.seed; S.doneId = 0; S.sentN = 0; S.anim = null; S.intro = null; S.summary = null; S.parts = []; S.floats = [];
    S.shake = 0; S.shownHole = -1; S.layer = null; S.fin = false; S.bflash = {}; S.overview = false; S.lastPh = null; S.settleKey = '';
    S.phBase = st.ph; S.phT0 = performance.now();
  }

  function ensureCanvas() {
    if (S.cv) return;
    S.cv = document.createElement('canvas'); S.cv.className = 'mg-cv';
    S.g = S.cv.getContext('2d');
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(S.cv);
    window.addEventListener('resize', () => fit());
    S.cv.addEventListener('pointerdown', e => {
      if (S.intro) { S.intro.t = Math.max(S.intro.t, S.intro.hold + S.intro.fly - 250); ensureLoop(); return; }   // tap skips the flyover
      if (S.summary) { S.summary.t = S.summary.max; ensureLoop(); return; }
      if (!canAct()) return;
      S.drag = { x: e.clientX, y: e.clientY }; S.aim = null;
      try { S.cv.setPointerCapture(e.pointerId); } catch (x) {}
      ensureLoop();
    });
    S.cv.addEventListener('pointermove', e => {
      if (!S.drag) return;
      if (!canAct()) { S.drag = null; S.aim = null; return; }
      const dx = S.drag.x - e.clientX, dy = S.drag.y - e.clientY, len = Math.sqrt(dx * dx + dy * dy);
      S.aim = len < 7 ? null : { ang: Math.atan2(dy, dx), pow: Math.min(1, len / (S.cssW * .42)) };
      e.preventDefault(); ensureLoop();
    }, { passive: false });
    S.cv.addEventListener('pointerup', () => {
      const a = S.aim; S.drag = null; S.aim = null; ensureLoop();
      if (!a || a.pow < .04 || !canAct()) return;                    // a tap, not a putt
      putt(a.ang, a.pow);
    });
    S.cv.addEventListener('pointercancel', () => { S.drag = null; S.aim = null; ensureLoop(); });
  }
  function canAct() {
    const c = S.ctx; if (!c) return false;
    const st = c.state; if (!st || !st.balls) return false;
    return !!(c.isMyTurn && c.status === 'active' && !S.anim && !S.intro && !S.summary && !st.over
      && st.turn === c.me && !st.balls[c.me].done && !(S.sentN > (st.n | 0)));
  }
  function fit() {
    if (!S.cv) return;
    const w = S.cv.clientWidth; if (!w) return;
    const vh = window.innerHeight || 800;
    const hCss = Math.round(Math.max(w * 1.05, Math.min(w * 1.4, vh - 290)));
    if (S.cv.style.height !== hCss + 'px') S.cv.style.height = hCss + 'px';   // explicit height → no reflow wobble
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), Hh = Math.round(hCss * dpr);
    if (W === S.W && Hh === S.H) return;
    S.W = W; S.H = Hh; S.dpr = dpr; S.cssW = w; S.cssH = hCss; S.scale = w / VIEW_W;
    S.cv.width = W; S.cv.height = Hh; S.layer = null;
    draw();                                      // resizing wipes the bitmap — repaint right away
  }
  function ensureLoop() { if (!S.raf && !S.inLoop) S.raf = requestAnimationFrame(loop); }
  function loop(ts) {
    S.raf = 0;
    if (!S.cv || !S.cv.isConnected) { S.lastTs = 0; return; }   // left the game — render() restarts us
    const now = performance.now(), dtms = S.lastTs ? clamp(now - S.lastTs, 0, 50) : 16.7; S.lastTs = now;
    S.inLoop = true;
    try { step(dtms); draw(); } finally { S.inLoop = false; }
    if (needsLoop()) { if (!S.raf) S.raf = requestAnimationFrame(loop); }      // never a second chain
    else S.lastTs = 0;
  }
  function needsLoop() {
    if (S.anim || S.intro || S.summary || S.drag || S.parts.length || S.floats.length || S.shake > .05 || S.flash > 0) return true;
    if (S.shownHole >= 0 && (HOLES[S.shownHole].mill || HOLES[S.shownHole].spin)) return true;
    if (S.ctx && S.ctx.status === 'finished' && S.fin && S.tick < S.finT + 240) return true;
    const t = camTarget(), c = S.cam;
    return Math.abs(t.x - c.x) > .08 || Math.abs(t.y - c.y) > .08 || Math.abs(t.z - c.z) > .0008;
  }

  /* ---------------- putting ---------------- */
  const curHole = () => S.shownHole >= 0 ? S.shownHole : (S.ctx && S.ctx.state ? S.ctx.state.hole | 0 : 0);
  function dispPhase() { const w = phaseSpeed(curHole()); return S.phBase + w * (performance.now() - S.phT0) / 1000; }
  function putt(ang, pow) {
    const c = S.ctx; if (!canAct()) return;
    const st = norm(c.state), me = c.me;
    ang = r4(normAng(ang)); pow = r4(clamp(pow, .04, 1));
    const ph = r4(normAng(dispPhase()));
    const { s, winner } = applyStroke(st, me, ang, pow, ph);
    S.sentN = s.n; S.overview = false;
    try { c.sound.place(); } catch (e) {}
    // COMMIT FIRST — the roll is decoration replayed from `last` on the next repaint (see CONTEXT)
    winner !== undefined ? c.commit(s, winner) : c.commit(s);
  }

  /* ---------------- replay a committed stroke ---------------- */
  function maybeReplay(st) {
    const L = st.last;
    if (!L || L.id <= S.doneId || (S.anim && S.anim.id === L.id)) return;
    if (S.anim) finishAnim(true);                                  // a newer stroke arrived: settle the old one
    const fresh = S.doneId === 0 && !S.anim;
    if (L.skip || (fresh && !(Math.abs(Date.now() - (L.at || 0)) < 60000))) {       // stale on open → don't replay
      S.doneId = L.id;
      if (L.skip && !fresh) { try { S.ctx.msg(`⏱ ${S.ctx.players[L.seat].name} ran out of time — the stroke counts`); S.ctx.sound.bad(); } catch (e) {} }
      return;
    }
    const r = simulate(L.hole, L.x0, L.y0, L.ang, L.pow, L.ph, true);
    const len = r.path.length / 3 - 1;
    const endX = r.path[len * 3], endY = r.path[len * 3 + 1];
    S.anim = { id: L.id, L, r, len, clock: 0, ei: 0, tail: 0, tailMax: L.out === 'cup' ? 80 : L.out === 'water' ? 70 : 34,
      dx: L.out === 'rest' ? L.x - endX : 0, dy: L.out === 'rest' ? L.y - endY : 0, started: false, dropT: 0, lastV: 0 };
    if (S.shownHole !== L.hole) { S.shownHole = L.hole; S.layer = null; S.intro = null; S.summary = null; }
    S.phBase = L.ph; S.phT0 = performance.now();
    if (L.seat !== S.ctx.me) { try { S.ctx.sound.place(); } catch (e) {} }
  }
  function ballAt(A, i) {
    const k = Math.max(0, Math.min(A.len, Math.floor(i))) * 3, p = A.r.path;
    const f = clamp((i - (A.len - 40)) / 40, 0, 1);                  // ease onto the committed spot
    return { x: p[k] + A.dx * f, y: p[k + 1] + A.dy * f, z: p[k + 2] };
  }
  function finishAnim(quiet) {
    const A = S.anim; if (!A) return;
    S.anim = null; S.doneId = A.id;
    const c = S.ctx, L = A.L, st = c.state;
    S.phBase = st.ph; S.phT0 = performance.now();
    if (!quiet) {
      const nm = c.players[L.seat].name, par = HOLES[L.hole].par;
      let txt;
      if (L.out === 'cup') txt = `⛳ ${nm} holed out — <b>${label(L.s, par)}</b> (${L.s})`;
      else if (L.out === 'water') txt = `💦 ${HOLES[L.hole].theme === 'lava' ? 'Into the lava' : 'Splash'}! +1 penalty — ${nm} plays again from the same spot`;
      else txt = `${nm}'s ball stops · ${L.s} stroke${L.s === 1 ? '' : 's'}`;
      if (L.pick) txt += ` · <b>picked up (7)</b>`;
      try { c.msg(txt); } catch (e) {}
      if (L.hole !== st.hole || st.over) startSummary(L.hole);
    }
    rerender();
  }
  function rerender() {
    const c = S.ctx; if (!c || !c.root || !c.root.isConnected) return;
    c.root.innerHTML = ''; DEF.render(c);
  }
  function startSummary(hi) {
    if (S.calm) { S.summary = { hi, t: 0, max: 1500 }; return; }
    S.summary = { hi, t: 0, max: 2100 };
  }
  // which hole is on screen, and whether it deserves a flyover
  function syncHole(st) {
    if (S.anim || S.summary) return;
    if (S.shownHole !== st.hole) {
      const first = S.shownHole === -1;
      S.shownHole = st.hole; S.layer = null; S.parts = [];
      const fresh = st.balls[0].s === 0 && st.balls[1].s === 0 && !st.over;
      if (fresh && !(first && S.ctx.status === 'finished')) startIntro(st.hole);
      else snapCam();
    }
  }
  function startIntro(hi) {
    S.intro = S.calm ? { hi, t: 0, hold: 1300, fly: 0, max: 1300 } : { hi, t: 0, hold: 850, fly: 1500, max: 2350 };
    const o = overviewCam(hi); S.cam = { x: o.x, y: o.y, z: o.z };
  }
  function snapCam() { const t = camTarget(); S.cam = { x: t.x, y: t.y, z: t.z }; }

  /* ---------------- camera ---------------- */
  function viewSize(z) { return { w: VIEW_W / z, h: (S.cssH || 560) / (S.scale || 1) / z }; }
  function overviewCam(hi) {
    const H = hole(hi), bw = H.bb.x1 - H.bb.x0 + 40, bh = H.bb.y1 - H.bb.y0 + 70;
    const v = viewSize(1), z = Math.min(v.w / bw, v.h / bh, 1);
    return { x: (H.bb.x0 + H.bb.x1) / 2, y: (H.bb.y0 + H.bb.y1) / 2 + 8, z };
  }
  function activeBall() {
    const st = S.ctx.state; let who = st.turn;
    if (st.balls[who] && st.balls[who].done) who = 1 - who;
    return st.balls[who];
  }
  function clampCam(t, hi) {
    const H = hole(hi), v = viewSize(t.z), B = { x0: H.bb.x0 - 40, x1: H.bb.x1 + 40, y0: H.bb.y0 - 60, y1: H.bb.y1 + 50 };
    t.x = (B.x1 - B.x0) <= v.w ? (B.x0 + B.x1) / 2 : clamp(t.x, B.x0 + v.w / 2, B.x1 - v.w / 2);
    t.y = (B.y1 - B.y0) <= v.h ? (B.y0 + B.y1) / 2 : clamp(t.y, B.y0 + v.h / 2, B.y1 - v.h / 2);
    return t;
  }
  function camTarget() {
    const hi = curHole(), H = hole(hi);
    if (!S.ctx || S.calm || S.overview) return overviewCam(hi);
    const A = S.anim;
    if (A) {
      const p = ballAt(A, A.clock), q = ballAt(A, A.clock + 40), L = A.L;
      let z = 1, x = p.x + (q.x - p.x) * 1.4, y = p.y + (q.y - p.y) * 1.4;
      if (L.out === 'cup' && A.len - A.clock < 110) { z = 1.22; x = (p.x + H.cup[0]) / 2; y = (p.y + H.cup[1]) / 2; }
      if (A.clock >= A.len) { const e = ballAt(A, A.len); x = e.x; y = e.y; z = L.out === 'cup' ? 1.3 : L.out === 'water' ? 1.15 : 1; }
      return clampCam({ x, y, z }, hi);
    }
    if (S.summary) return clampCam({ x: H.cup[0], y: H.cup[1] + 20, z: 1.1 }, hi);
    const st = S.ctx.state;
    if (st.hole !== hi || st.over) return clampCam({ x: H.cup[0], y: H.cup[1] + 30, z: 1.05 }, hi);
    const b = activeBall(), dx = H.cup[0] - b.x, dy = H.cup[1] - b.y, d = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(150, d * .38) / d;
    return clampCam({ x: b.x + dx * k, y: b.y + dy * k, z: 1 }, hi);
  }

  /* ---------------- per-frame simulation (cosmetic) ---------------- */
  function step(dtms) {
    const f = dtms / 16.667; S.tick += f;
    const c = S.ctx; if (!c || !c.state) return;
    const st = c.state;
    const H = hole(S.shownHole >= 0 ? S.shownHole : st.hole), th = THEMES[H.theme];
    // --- intro flyover ---
    if (S.intro) {
      const I = S.intro; I.t += dtms;
      if (!S.calm && I.t > I.hold) {
        const u = clamp((I.t - I.hold) / I.fly, 0, 1), e = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
        const o = overviewCam(I.hi), t = camTarget();
        S.cam = { x: o.x + (t.x - o.x) * e, y: o.y + (t.y - o.y) * e, z: o.z + (t.z - o.z) * e };
      }
      if (I.t >= I.max) { S.intro = null; rerender(); }
    } else {
      const t = camTarget(), k = 1 - Math.exp(-dtms / 1000 * (S.anim ? 5.5 : 4));
      S.cam.x += (t.x - S.cam.x) * k; S.cam.y += (t.y - S.cam.y) * k; S.cam.z += (t.z - S.cam.z) * k;
    }
    // --- the replay ---
    const A = S.anim;
    if (A) {
      if (!A.started) { A.started = true; const p = ballAt(A, 0); fxHit(p, th); }
      if (A.clock < A.len) {
        let rate = 1;
        if (!S.calm) {
          const rem = A.len - A.clock, L = A.L;
          if (L.out === 'cup' && rem < 70) rate = .38;
          else if (L.out === 'water' && rem < 30) rate = .5;
          else if (A.slowT > 0) rate = .45;
          else { const p = ballAt(A, A.clock), q = ballAt(A, A.clock + 8), v = Math.sqrt((q.x - p.x) ** 2 + (q.y - p.y) ** 2) * 30; if (v < 45 && rem > 120) rate = 2.2; }
        }
        if (A.slowT > 0) A.slowT -= f;
        const prev = ballAt(A, A.clock);
        A.clock = Math.min(A.len, A.clock + 4 * rate * f);
        const cur = ballAt(A, A.clock), moved = Math.sqrt((cur.x - prev.x) ** 2 + (cur.y - prev.y) ** 2);
        S.roll[A.L.seat] += moved / R;
        const ev = A.r.ev;
        while (A.ei < ev.length && ev[A.ei].i <= A.clock) fxEvent(ev[A.ei++], A, th, H);
        // trails
        if (moved > .2 && S.parts.length < 500) {
          const onSand = H.zones.some(zn => zn.k === 'sand' && inZone(zn, cur.x, cur.y)), onIce = H.zones.some(zn => zn.k === 'ice' && inZone(zn, cur.x, cur.y));
          if (onSand && Math.random() < .5) S.parts.push({ k: 'puff', x: cur.x + rnd(-3, 3), y: cur.y + 3, r: rnd(3, 6), gr: .25, life: 40, max: 40, c: '232,200,140' });
          else if (onIce && Math.random() < .3) S.parts.push({ k: 'spark', x: cur.x + rnd(-4, 4), y: cur.y + rnd(-4, 4), vx: 0, vy: 0, life: 26, max: 26, c: '200,245,255', s: 1.2 });
          else if (moved > 3 && cur.z < .5 && Math.random() < .25) S.parts.push({ k: 'fleck', x: cur.x, y: cur.y, z: 1, vx: rnd(-40, 40), vy: rnd(-40, 40), vz: rnd(40, 90), life: 30, max: 30, c: th.felt[0], s: 1.4 });
        }
      } else {
        if (A.tail === 0) fxEnd(A, th, H);
        A.tail += f;
        if (A.tail >= A.tailMax) finishAnim(false);
      }
    }
    // --- hole summary card ---
    if (S.summary && !S.anim) {
      S.summary.t += dtms;
      if (S.summary.t >= S.summary.max) {
        S.summary = null;
        if (st.hole !== S.shownHole && !st.over) { S.shownHole = st.hole; S.layer = null; S.parts = []; startIntro(st.hole); }
        rerender();
      }
    }
    // --- particles ---
    const dt = dtms / 1000;
    S.parts = S.parts.filter(p => {
      p.life -= f;
      if (p.vz !== undefined) {
        p.z += p.vz * dt; p.vz -= 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.z <= 0) { p.z = 0; p.vz *= -.3; p.vx *= .6; p.vy *= .6; if (p.k === 'drop' && !p.hit) { p.hit = 1; p.life = Math.min(p.life, 10); } }
        if (p.rot !== undefined) p.rot += p.vr * f;
      } else if (p.vx !== undefined) { const k = Math.pow(.96, f); p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= k; p.vy *= k; }
      if (p.gr) p.r += p.gr * f;
      return p.life > 0;
    });
    S.floats = S.floats.filter(q => (q.y -= .45 * f, (q.life -= f) > 0));
    S.shake *= Math.pow(.86, f); if (S.shake < .15) S.shake = 0;
    if (S.flash > 0) S.flash = Math.max(0, S.flash - .025 * f);
    const sh = S.calm ? 0 : S.shake; S.sx = sh ? rnd(-1, 1) * sh : 0; S.sy = sh ? rnd(-1, 1) * sh : 0;
    for (const k in S.bflash) { S.bflash[k] -= f / 22; if (S.bflash[k] <= 0) delete S.bflash[k]; }
    // game over: a little celebration for the winner
    if (c.status === 'finished' && !S.anim && !S.summary && !S.fin) {
      S.fin = true; S.finT = S.tick;
      const w = winnerOf(st);
      if (w === 0 || w === 1) confetti(H.cup[0], H.cup[1], c.players[w].color, 70);
    }
    // ambient weather (only drawn while the loop is awake)
    if (th.amb && S.amb.length < 26 && Math.random() < .3 * f) {
      const v = viewSize(S.cam.z);
      S.amb.push({ x: S.cam.x + rnd(-v.w / 2, v.w / 2), y: S.cam.y + rnd(-v.h / 2, v.h / 2), ph: rnd(0, 6.28), life: rnd(160, 320), max: 320, vx: rnd(-6, 6), vy: th.amb === 'snow' ? rnd(10, 22) : th.amb === 'ember' ? rnd(-26, -12) : rnd(-5, 5) });
    }
    S.amb = S.amb.filter(a => { a.life -= f; a.x += (a.vx + Math.sin(S.tick * .03 + a.ph) * 6) * dt; a.y += a.vy * dt; return a.life > 0; });
  }

  /* ---------------- effects ---------------- */
  function haptic(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }
  function snd(k) { const now = performance.now(); if (k === 'tap' && now - S.sndT < 110) return; S.sndT = now; try { S.ctx.sound[k](); } catch (e) {} }
  function fxHit(p, th) {
    for (let i = 0; i < 10; i++) S.parts.push({ k: 'fleck', x: p.x, y: p.y, z: 1, vx: rnd(-70, 70), vy: rnd(-70, 70), vz: rnd(70, 160), life: rnd(30, 50), max: 50, c: Math.random() < .5 ? th.felt[0] : '#c9ffb0', s: rnd(1.2, 2.2) });
    S.parts.push({ k: 'ring', x: p.x, y: p.y, r0: 6, r1: 26, life: 16, max: 16, c: '255,255,255' });
  }
  function fxEvent(e, A, th, H) {
    const col = S.ctx.players[A.L.seat].color;
    if (e.k === 'wall') {
      const n = Math.min(10, 3 + (e.v / 70) | 0);
      for (let i = 0; i < n; i++) S.parts.push({ k: 'spark', x: e.x, y: e.y, vx: rnd(-90, 90), vy: rnd(-90, 90), life: rnd(12, 22), max: 22, c: hexRgb(th.wall.glow), s: rnd(.8, 1.6) });
      if (e.v > 160) { snd('tap'); S.shake = Math.max(S.shake, Math.min(2.5, e.v / 260)); }
    } else if (e.k === 'bump') {
      S.bflash[e.n] = 1; const q = H.bumps[e.n];
      S.parts.push({ k: 'ring', x: q[0], y: q[1], r0: q[2], r1: q[2] + 26, life: 18, max: 18, c: hexRgb(th.wall.glow) });
      for (let i = 0; i < 12; i++) { const a = rnd(0, 6.28), v = rnd(60, 180); S.parts.push({ k: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(14, 26), max: 26, c: '255,240,200', s: rnd(1, 2) }); }
      S.shake = Math.max(S.shake, Math.min(4, e.v / 150)); snd('move'); haptic(12);
    } else if (e.k === 'sand') {
      for (let i = 0; i < 9; i++) S.parts.push({ k: 'puff', x: e.x + rnd(-6, 6), y: e.y + rnd(-4, 4), r: rnd(4, 8), gr: .35, life: rnd(40, 60), max: 60, c: '236,206,150' });
      for (let i = 0; i < 12; i++) S.parts.push({ k: 'fleck', x: e.x, y: e.y, z: 1, vx: rnd(-60, 60), vy: rnd(-60, 60), vz: rnd(60, 140), life: 36, max: 36, c: '#f0d59a', s: rnd(1, 1.8) });
    } else if (e.k === 'water' || e.k === 'lava') {
      const lava = e.k === 'lava', c1 = lava ? '255,150,60' : '190,240,255';
      for (let i = 0; i < 3; i++) S.parts.push({ k: 'ring', x: e.x, y: e.y, r0: 4, r1: 30 + i * 14, life: 30 + i * 10, max: 30 + i * 10, c: c1, flat: 1 });
      for (let i = 0; i < 26; i++) S.parts.push({ k: 'drop', x: e.x, y: e.y, z: 2, vx: rnd(-80, 80), vy: rnd(-80, 80), vz: rnd(120, 260), life: 60, max: 60, c: lava ? (Math.random() < .5 ? '#ffb14a' : '#ff5a1f') : (Math.random() < .5 ? '#bff4ff' : '#5fd6ee'), s: rnd(1.2, 2.4) });
      if (lava) for (let i = 0; i < 6; i++) S.parts.push({ k: 'puff', x: e.x + rnd(-6, 6), y: e.y - rnd(0, 8), vx: rnd(-8, 8), vy: rnd(-26, -10), r: rnd(6, 10), gr: .3, life: 70, max: 70, c: '70,60,70' });
      A.sink = { x: e.x, y: e.y, t: 0 };
      S.shake = Math.max(S.shake, 4); snd('bad'); haptic([30, 30, 50]);
      S.floats.push({ text: lava ? 'SIZZLE! +1' : 'SPLASH! +1', x: e.x, y: e.y - 26, c: lava ? '#ffb468' : '#8fe9ff', life: 80, max: 80, big: 1 });
    } else if (e.k === 'port' || e.k === 'portOut') {
      for (let i = 0; i < 18; i++) { const a = rnd(0, 6.28), v = rnd(40, 150); S.parts.push({ k: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(18, 32), max: 32, c: '170,140,255', s: rnd(1, 2.2) }); }
      S.parts.push({ k: 'ring', x: e.x, y: e.y, r0: 6, r1: 34, life: 22, max: 22, c: '190,160,255' });
      if (e.k === 'port') { snd('good'); A.slowT = 10; }
    } else if (e.k === 'jump') {
      for (let i = 0; i < 8; i++) S.parts.push({ k: 'puff', x: e.x + rnd(-8, 8), y: e.y + 4, r: rnd(3, 6), gr: .3, life: 36, max: 36, c: '240,220,190' });
      A.slowT = 22; snd('move');
    } else if (e.k === 'land') {
      S.parts.push({ k: 'ring', x: e.x, y: e.y, r0: 4, r1: 22, life: 18, max: 18, c: '255,255,255', flat: 1 });
      for (let i = 0; i < 8; i++) S.parts.push({ k: 'fleck', x: e.x, y: e.y, z: 1, vx: rnd(-70, 70), vy: rnd(-70, 70), vz: rnd(60, 120), life: 30, max: 30, c: th.felt[0], s: 1.6 });
      S.shake = Math.max(S.shake, 2); snd('tap');
    } else if (e.k === 'lip') {
      S.parts.push({ k: 'ring', x: H.cup[0], y: H.cup[1], r0: CUP_R, r1: CUP_R + 18, life: 20, max: 20, c: '255,214,107' });
      S.floats.push({ text: 'LIP OUT!', x: H.cup[0], y: H.cup[1] - 30, c: '#ffd66b', life: 70, max: 70 });
      A.slowT = 16; snd('tap'); haptic(10);
    } else if (e.k === 'mill' || e.k === 'spin') {
      for (let i = 0; i < 10; i++) S.parts.push({ k: 'spark', x: e.x, y: e.y, vx: rnd(-110, 110), vy: rnd(-110, 110), life: 20, max: 20, c: '255,220,160', s: 1.4 });
      S.shake = Math.max(S.shake, 3); snd('bad'); haptic(15);
      S.floats.push({ text: 'WHACK!', x: e.x, y: e.y - 24, c: '#ffd66b', life: 55, max: 55 });
    }
    void col;
  }
  function fxEnd(A, th, H) {
    const L = A.L, col = S.ctx.players[L.seat].color, par = H.par;
    if (L.out === 'cup') {
      A.dropT = 1;
      const great = L.s < par || L.s === 1;
      for (let i = 0; i < 22; i++) { const a = rnd(0, 6.28), v = rnd(40, 170); S.parts.push({ k: 'star', x: H.cup[0], y: H.cup[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(26, 48), max: 48, c: i % 3 ? '255,230,150' : hexRgb(col), s: rnd(2, 4) }); }
      S.parts.push({ k: 'ring', x: H.cup[0], y: H.cup[1], r0: CUP_R, r1: CUP_R + 40, life: 26, max: 26, c: hexRgb(col) });
      if (great) confetti(H.cup[0], H.cup[1], col, L.s === 1 ? 90 : 50);
      S.floats.push({ text: label(L.s, par), x: H.cup[0], y: H.cup[1] - 34, c: great ? '#ffd66b' : '#eaf0ff', life: 95, max: 95, big: 1 });
      S.shake = Math.max(S.shake, great ? 3 : 1.5);
      if (L.s === 1 && !S.calm) S.flash = 1;                          // hole in one: the screen lights up
      snd(L.s === 1 ? 'win' : great ? 'good' : 'good'); haptic(great ? [20, 40, 60] : 20);
    } else if (L.out === 'water') {
      S.parts.push({ k: 'ring', x: L.x0, y: L.y0, r0: 3, r1: 20, life: 20, max: 20, c: '255,255,255' });
    } else if (L.pick) {
      S.floats.push({ text: 'PICKED UP · 7', x: L.x, y: L.y - 26, c: '#ff8a8a', life: 80, max: 80 });
      snd('bad');
    } else snd('tap');
    if (L.pick && L.out === 'water') S.floats.push({ text: 'PICKED UP · 7', x: L.x0, y: L.y0 - 40, c: '#ff8a8a', life: 80, max: 80 });
  }
  function confetti(x, y, col, n) {
    const cols = [col, '#ffd66b', '#ffffff', '#79f5b6', '#ff4d9d', '#2fe6ff'];
    for (let i = 0; i < n; i++) S.parts.push({ k: 'conf', x: x + rnd(-6, 6), y: y + rnd(-6, 6), z: 2, vx: rnd(-150, 150), vy: rnd(-150, 150), vz: rnd(160, 340), life: rnd(70, 120), max: 120, c: cols[i % cols.length], s: rnd(2, 3.6), rot: rnd(0, 6.28), vr: rnd(-.3, .3) });
  }

  /* ---------------- drawing ---------------- */
  function view(g) {
    const k = S.scale * S.dpr * S.cam.z;
    g.setTransform(k, 0, 0, k, S.W / 2 - (S.cam.x + S.sx) * k, S.H / 2 - (S.cam.y + S.sy) * k);
  }
  function draw() {
    const g = S.g, c = S.ctx; if (!g || !c || !c.state) return;
    if (!S.W) { fit(); if (!S.W) return; }
    const hi = S.shownHole >= 0 ? S.shownHole : c.state.hole, H = hole(hi), th = THEMES[H.theme];
    if (!S.layer || S.layer.hi !== hi) buildLayer(hi);
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.fillStyle = th.bg; g.fillRect(0, 0, S.W, S.H);
    view(g);
    const Ly = S.layer; g.imageSmoothingEnabled = true;
    g.drawImage(Ly.c, Ly.B.x0, Ly.B.y0, Ly.B.x1 - Ly.B.x0, Ly.B.y1 - Ly.B.y0);
    drawDynamicUnder(g, H, th);
    drawBalls(g, H, th);
    drawFlag(g, H, th);
    drawMill(g, H, th);
    drawParts(g);
    drawAmb(g, th);
    if (S.aim && S.drag && canAct()) drawAim(g, H, th);
    drawFloats(g);
    // screen space
    g.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
    const W = S.cssW, Hh = S.cssH;
    if (!S.vig || S.vigKey !== W + 'x' + Hh) {
      const v = g.createRadialGradient(W / 2, Hh * .46, Math.min(W, Hh) * .38, W / 2, Hh / 2, Math.max(W, Hh) * .75);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)'); S.vig = v; S.vigKey = W + 'x' + Hh;
    }
    g.fillStyle = S.vig; g.fillRect(0, 0, W, Hh);
    if (S.flash > 0) {
      const fg = g.createRadialGradient(W / 2, Hh / 2, 10, W / 2, Hh / 2, Math.max(W, Hh) * .7);
      fg.addColorStop(0, `rgba(255,236,170,${S.flash * .55})`); fg.addColorStop(1, `rgba(255,190,90,${S.flash * .2})`);
      g.fillStyle = fg; g.fillRect(0, 0, W, Hh);
    }
    if (S.intro) drawIntro(g, W, Hh);
    else { drawHud(g, W, Hh, H); if (S.summary) drawSummary(g, W, Hh); }
    if (S.aim && S.drag && canAct()) drawPowerHud(g, W, Hh);
  }

  function drawDynamicUnder(g, H, th) {
    // tunnel mouths swirl
    H.ports.forEach((P, k) => [P.a, P.b].forEach((q, j) => {
      g.save(); g.translate(q[0], q[1]); g.globalCompositeOperation = 'lighter';
      const gl = g.createRadialGradient(0, 0, 0, 0, 0, PORT_R * 2.4);
      gl.addColorStop(0, j ? 'rgba(120,255,220,.35)' : 'rgba(170,120,255,.4)'); gl.addColorStop(1, 'rgba(120,80,255,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(0, 0, PORT_R * 2.4, 0, TAU); g.fill();
      g.rotate(S.tick * (j ? -.05 : .07) + k);
      for (let s = 0; s < 3; s++) {
        g.strokeStyle = j ? `rgba(140,255,225,${.55 - s * .12})` : `rgba(200,170,255,${.6 - s * .14})`; g.lineWidth = 2 - s * .4;
        g.beginPath(); g.arc(0, 0, PORT_R - 3 - s * 3.5, s * 2.1, s * 2.1 + 3.6); g.stroke();
      }
      g.restore();
    }));
    // bumper flashes
    for (const k in S.bflash) {
      const q = H.bumps[k]; if (!q) continue; const a = S.bflash[k];
      g.save(); g.globalCompositeOperation = 'lighter';
      const gl = g.createRadialGradient(q[0], q[1], q[2] * .4, q[0], q[1], q[2] * 2.6);
      gl.addColorStop(0, hexA(th.wall.glow, .7 * a)); gl.addColorStop(1, hexA(th.wall.glow, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(q[0], q[1], q[2] * 2.6, 0, TAU); g.fill();
      g.restore();
    }
    // sweeper
    if (H.spin) {
      const th2 = spinAngle(), sp = H.spin;
      g.save(); g.translate(sp.x, sp.y);
      g.fillStyle = 'rgba(0,0,0,.35)';
      for (let k = 0; k < 2; k++) { const a = th2 + k * Math.PI; g.save(); g.translate(4, 7); g.rotate(a); rr(g, 0, -4.5, sp.len + 2, 9, 4.5); g.fill(); g.restore(); }
      for (let k = 0; k < 2; k++) {
        const a = th2 + k * Math.PI; g.save(); g.rotate(a);
        g.fillStyle = '#5a3a1e'; rr(g, 0, -4, sp.len + 2, 9, 4.5); g.fill();
        const gr = g.createLinearGradient(0, -4.5, 0, 4.5); gr.addColorStop(0, '#e2c08a'); gr.addColorStop(1, '#8a5a2c');
        g.fillStyle = gr; rr(g, 0, -4.5, sp.len, 8, 4); g.fill();
        g.fillStyle = th.flag; g.fillRect(sp.len - 14, -4.5, 8, 8);
        g.restore();
      }
      const hub = g.createRadialGradient(-3, -4, 1, 0, 0, SPIN_HUB + 2); hub.addColorStop(0, '#fff3cf'); hub.addColorStop(1, '#b2863c');
      g.fillStyle = hub; g.beginPath(); g.arc(0, 0, SPIN_HUB, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.2; g.stroke();
      g.restore();
    }
  }
  function spinAngle() { return S.anim ? S.anim.L.ph + SPIN_W * S.anim.clock * DT : dispPhase(); }
  function millAngle() { return S.anim ? S.anim.L.ph + MILL_W * S.anim.clock * DT : dispPhase(); }

  function drawBalls(g, H, th) {
    const c = S.ctx, st = c.state, A = S.anim;
    for (let p = 0; p < 2; p++) {
      const col = c.players[p].color;
      if (A && A.L.seat === p) {
        const L = A.L; let pos = ballAt(A, A.clock), alpha = 1, sc = 1;
        if (A.clock >= A.len) {
          if (L.out === 'cup') { const u = clamp(A.tail / 16, 0, 1); pos = { x: H.cup[0], y: H.cup[1], z: 0 }; sc = 1 - u * .5; alpha = 1 - u; }
          else if (L.out === 'water') {
            const u = clamp(A.tail / 20, 0, 1);
            if (u < 1) { sc = 1 - u * .6; alpha = 1 - u; }
            else { const v = clamp((A.tail - 36) / 14, 0, 1); pos = { x: L.x0, y: L.y0, z: 0 }; alpha = v; sc = .6 + .4 * v; }
          } else if (L.pick) { alpha = 1 - clamp(A.tail / 30, 0, 1); pos.z = A.tail * .8; }
        }
        if (A.clock < A.len) {                                  // motion trail
          g.save(); g.globalCompositeOperation = 'lighter';
          for (let j = 1; j <= 9; j++) {
            const q = ballAt(A, A.clock - j * 3), d = Math.sqrt((q.x - pos.x) ** 2 + (q.y - pos.y) ** 2);
            if (d < 2) break;
            g.fillStyle = hexA(col, .2 * (1 - j / 10)); g.beginPath(); g.arc(q.x, q.y - q.z * .95, R * (1 - j * .07), 0, TAU); g.fill();
          }
          g.restore();
        }
        if (alpha > 0) drawBall(g, pos.x, pos.y, pos.z, col, alpha, sc, S.roll[p], true);
        continue;
      }
      // resting balls (not the one rolling)
      if (A && A.L.hole !== st.hole) continue;              // that hole's other ball was already in
      if (S.shownHole !== st.hole) continue;
      const b = st.balls[p]; if (b.done) continue;
      const mine = st.turn === p && c.status === 'active' && !A && !S.intro && !S.summary && !st.over;
      if (mine) {                                            // whose putt: a breathing ring
        const pulse = .5 + .5 * Math.sin(S.tick * .09);
        g.strokeStyle = hexA(col, .35 + .35 * pulse); g.lineWidth = 2;
        g.beginPath(); g.arc(b.x, b.y, R + 6 + pulse * 3, 0, TAU); g.stroke();
      }
      drawBall(g, b.x, b.y, 0, col, 1, 1, S.roll[p], mine);
    }
    // balls already in the cup: little coloured glints on the rim
    if (S.shownHole === st.hole) [0, 1].forEach(p => {
      if (!st.balls[p].done || st.cards[p][st.hole] === PICKUP) return;
      if (A && A.L.seat === p) return;
      const a = -Math.PI / 2 + (p ? .7 : -.7);
      g.fillStyle = hexA(c.players[p].color, .9); g.beginPath(); g.arc(H.cup[0] + Math.cos(a) * 5, H.cup[1] + Math.sin(a) * 4, 2.4, 0, TAU); g.fill();
    });
  }
  function drawBall(g, x, y, z, col, alpha, sc, roll, glow) {
    g.save(); g.globalAlpha = alpha;
    const sh = Math.max(.25, 1 - z / 50);
    g.fillStyle = `rgba(0,0,0,${.42 * sh})`;
    g.beginPath(); g.ellipse(x + 2.4 + z * .45, y + 3.2 + z * .75, R * (1 + z / 90), R * .72 * (1 + z / 90), 0, 0, TAU); g.fill();
    const by = y - z * .95, r = R * sc * (1 + z / 60);
    if (glow) {
      g.globalCompositeOperation = 'lighter';
      const gl = g.createRadialGradient(x, by, r * .5, x, by, r * 3.4); gl.addColorStop(0, hexA(col, .35 * alpha)); gl.addColorStop(1, hexA(col, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(x, by, r * 3.4, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    const body = g.createRadialGradient(x - r * .35, by - r * .45, r * .1, x, by, r);
    body.addColorStop(0, '#ffffff'); body.addColorStop(.55, lighten(col, .78)); body.addColorStop(1, lighten(col, .25));
    g.fillStyle = body; g.beginPath(); g.arc(x, by, r, 0, TAU); g.fill();
    // a painted stripe that rolls with the ball
    g.save(); g.beginPath(); g.arc(x, by, r, 0, TAU); g.clip();
    const k = Math.cos(roll), s = Math.sin(roll);
    g.strokeStyle = hexA(col, .9); g.lineWidth = r * .42;
    g.beginPath(); g.ellipse(x, by + s * r * .55, r * 1.05, Math.abs(k) * r * .45 + .3, 0, 0, TAU); g.stroke();
    g.restore();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.ellipse(x - r * .38, by - r * .42, r * .3, r * .2, -.6, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = .8; g.beginPath(); g.arc(x, by, r, 0, TAU); g.stroke();
    g.restore();
  }
  function drawFlag(g, H, th) {
    const [cx, cy] = H.cup, c = S.ctx, st = c.state;
    // is a ball close? then the flag fades so it never hides the putt
    let near = false;
    if (S.anim) { const p = ballAt(S.anim, S.anim.clock); near = Math.abs(p.x - cx) < 34 && p.y < cy + 10 && p.y > cy - 70; }
    else if (st.hole === S.shownHole) near = st.balls.some(b => !b.done && Math.abs(b.x - cx) < 30 && b.y < cy + 8 && b.y > cy - 64);
    const A = S.anim, drop = A && A.L.out === 'cup' && A.clock >= A.len ? Math.max(0, 1 - A.tail / 40) : 0;
    const wig = Math.sin(S.tick * .11) * 2.4 + drop * Math.sin(A ? A.tail * .8 : 0) * 5;
    const top = cy - 50;
    g.save(); g.globalAlpha = near ? .38 : 1;
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + 26, cy + 14); g.stroke();   // pole shadow
    g.strokeStyle = '#1b1f2e'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, top); g.stroke();
    g.strokeStyle = '#eef2ff'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, top); g.stroke();
    g.fillStyle = th.flag;
    g.beginPath(); g.moveTo(cx + 1, top); g.quadraticCurveTo(cx + 12, top + 2 + wig, cx + 25, top + 7 + wig * .6);
    g.quadraticCurveTo(cx + 12, top + 10 + wig * .8, cx + 1, top + 15); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(cx + 1, top); g.quadraticCurveTo(cx + 12, top + 2 + wig, cx + 25, top + 7 + wig * .6); g.lineTo(cx + 1, top + 5); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.font = '800 7.5px Orbitron, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(H.i + 1), cx + 9, top + 7.5 + wig * .3);
    g.fillStyle = '#ffd66b'; g.beginPath(); g.arc(cx, top - 1, 2, 0, TAU); g.fill();
    g.restore();
  }
  // the windmill: sails turn in the upright plane on the tower's face; a sail at the bottom closes the door
  function drawMill(g, H, th) {
    const M = H.mill; if (!M) return;
    const a0 = millAngle(), blocked = millBlocked(a0);
    g.save(); g.translate(M.x, M.y);
    // door glow tells you when it's open
    g.save(); g.globalCompositeOperation = 'lighter';
    const dg = g.createRadialGradient(0, 54, 2, 0, 54, 30); dg.addColorStop(0, blocked ? 'rgba(255,80,80,.3)' : 'rgba(120,255,160,.28)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = dg; g.beginPath(); g.arc(0, 54, 30, 0, TAU); g.fill(); g.restore();
    for (let k = 0; k < 4; k++) {
      const a = a0 + k * Math.PI / 2;
      g.save(); g.rotate(a);
      g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(8, -3, M.len - 8, 12);               // sail shadow on the facade
      g.strokeStyle = '#4a2e18'; g.lineWidth = 3; g.beginPath(); g.moveTo(4, 0); g.lineTo(M.len, 0); g.stroke();
      const cl = g.createLinearGradient(0, -10, 0, 0); cl.addColorStop(0, '#fff6e0'); cl.addColorStop(1, '#d8c8a8');
      g.fillStyle = cl; g.fillRect(16, -11, M.len - 18, 10);
      g.strokeStyle = 'rgba(90,60,30,.7)'; g.lineWidth = .8;
      g.beginPath(); for (let x = 22; x < M.len; x += 8) { g.moveTo(x, -11); g.lineTo(x, -1); } g.moveTo(16, -6); g.lineTo(M.len - 2, -6); g.stroke();
      g.restore();
    }
    const hub = g.createRadialGradient(-2, -2, 1, 0, 0, 8); hub.addColorStop(0, '#ffe7a8'); hub.addColorStop(1, '#8a5a24');
    g.fillStyle = hub; g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill();
    g.restore();
  }

  function drawAim(g, H, th) {
    const c = S.ctx, me = c.me, b = c.state.balls[me], col = c.players[me].color, a = S.aim;
    const ca = Math.cos(a.ang), sa = Math.sin(a.ang), len = 34 + 150 * a.pow;
    // the pull-back band toward your finger
    const pull = Math.min(46, 10 + a.pow * 46);
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - ca * pull, b.y - sa * pull); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(b.x - ca * pull, b.y - sa * pull, 3.2, 0, TAU); g.fill();
    // dotted aim line of limited length — direction and strength, never the bounces
    for (let d = R + 7; d < len; d += 8) {
      const u = d / len, x = b.x + ca * d, y = b.y + sa * d;
      g.fillStyle = hexA(col, .95 - u * .7); g.beginPath(); g.arc(x, y, 2.3 - u * .9, 0, TAU); g.fill();
    }
    const ex = b.x + ca * len, ey = b.y + sa * len;
    g.fillStyle = hexA(col, .55); g.beginPath(); g.moveTo(ex + ca * 7, ey + sa * 7); g.lineTo(ex - sa * 5, ey + ca * 5); g.lineTo(ex + sa * 5, ey - ca * 5); g.closePath(); g.fill();
    // power ring round the ball
    const pc = a.pow < .5 ? mix('#79f5b6', '#ffd66b', a.pow * 2) : mix('#ffd66b', '#ff4d6d', (a.pow - .5) * 2);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4; g.beginPath(); g.arc(b.x, b.y, R + 9, 0, TAU); g.stroke();
    g.strokeStyle = pc; g.lineWidth = 3; g.beginPath(); g.arc(b.x, b.y, R + 9, -Math.PI / 2, -Math.PI / 2 + TAU * a.pow); g.stroke();
  }
  function drawPowerHud(g, W, Hh) {
    const a = S.aim, pc = a.pow < .5 ? mix('#79f5b6', '#ffd66b', a.pow * 2) : mix('#ffd66b', '#ff4d6d', (a.pow - .5) * 2);
    const bw = Math.min(170, W * .42), x = W / 2 - bw / 2 - 18, y = Hh - 30;
    g.fillStyle = 'rgba(5,7,15,.66)'; rr(g, x - 12, y - 13, bw + 60, 26, 13); g.fill();
    g.strokeStyle = 'rgba(170,190,255,.18)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.12)'; rr(g, x, y - 3.5, bw, 7, 3.5); g.fill();
    g.fillStyle = pc; rr(g, x, y - 3.5, Math.max(7, bw * a.pow), 7, 3.5); g.fill();
    g.fillStyle = '#eaf0ff'; g.font = '800 11px Orbitron, system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(Math.round(a.pow * 100) + '%', x + bw + 42, y + .5);
  }

  function drawParts(g) {
    S.parts.forEach(p => {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.k === 'fleck' || p.k === 'drop') {
        g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(p.x, p.y, p.s, p.s * .6);
        g.globalAlpha = Math.min(1, a * 1.6); g.fillStyle = p.c; g.fillRect(p.x - p.s / 2, p.y - p.z - p.s / 2, p.s, p.s); g.globalAlpha = 1;
      } else if (p.k === 'conf') {
        g.save(); g.translate(p.x, p.y - p.z); g.rotate(p.rot); g.globalAlpha = Math.min(1, a * 1.5); g.fillStyle = p.c;
        g.fillRect(-p.s / 2, -p.s * .3, p.s, p.s * .6 * Math.abs(Math.cos(p.rot * 2)) + .4); g.restore();
      } else if (p.k === 'puff') {
        g.fillStyle = `rgba(${p.c},${a * .45})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
      }
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    S.parts.forEach(p => {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.k === 'spark') { g.fillStyle = `rgba(${p.c},${a})`; g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill(); }
      else if (p.k === 'star') {
        g.strokeStyle = `rgba(${p.c},${a})`; g.lineWidth = 1.3; const s = p.s * (.6 + a * .6);
        g.beginPath(); g.moveTo(p.x - s, p.y); g.lineTo(p.x + s, p.y); g.moveTo(p.x, p.y - s); g.lineTo(p.x, p.y + s); g.stroke();
        g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); g.arc(p.x, p.y, 1, 0, TAU); g.fill();
      } else if (p.k === 'ring') {
        const r = p.r1 - (p.r1 - p.r0) * a;
        g.strokeStyle = `rgba(${p.c},${a * .8})`; g.lineWidth = 2.2 * a + .4;
        g.beginPath(); p.flat ? g.ellipse(p.x, p.y, r, r * .78, 0, 0, TAU) : g.arc(p.x, p.y, r, 0, TAU); g.stroke();
      }
    });
    g.restore();
  }
  function drawAmb(g, th) {
    if (!th.amb) return;
    g.save(); g.globalCompositeOperation = 'lighter';
    S.amb.forEach(a => {
      const al = Math.min(1, a.life / 40, (a.max - a.life) / 40);
      if (th.amb === 'fire') { const tw = .5 + .5 * Math.sin(S.tick * .12 + a.ph); g.fillStyle = `rgba(200,255,140,${al * (.25 + tw * .55)})`; g.beginPath(); g.arc(a.x, a.y, 1.3 + tw, 0, TAU); g.fill(); }
      else if (th.amb === 'snow') { g.fillStyle = `rgba(235,248,255,${al * .7})`; g.beginPath(); g.arc(a.x, a.y, 1.4, 0, TAU); g.fill(); }
      else if (th.amb === 'ember') { g.fillStyle = `rgba(255,${140 + Math.round(60 * Math.sin(a.ph + S.tick * .1))},60,${al * .8})`; g.beginPath(); g.arc(a.x, a.y, 1.2, 0, TAU); g.fill(); }
    });
    g.restore();
  }
  function drawFloats(g) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    S.floats.forEach(f => {
      const age = 1 - f.life / f.max, a = Math.min(1, f.life / 22), s = age < .12 ? .5 + age * 5 : 1.1 - age * .12;
      const fs = (f.big ? 17 : 12) * s / Math.max(.8, S.cam.z * .9);
      g.font = `900 ${fs.toFixed(1)}px Orbitron, "Chakra Petch", system-ui, sans-serif`;
      g.globalAlpha = a; g.lineWidth = 3.4; g.strokeStyle = 'rgba(5,7,15,.9)'; g.lineJoin = 'round'; g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.c; g.fillText(f.text, f.x, f.y); g.globalAlpha = 1;
    });
  }
  // --- screen-space overlays ---
  function pill(g, x, y, w, h) { g.fillStyle = 'rgba(5,7,15,.62)'; rr(g, x, y, w, h, h / 2); g.fill(); g.strokeStyle = 'rgba(170,190,255,.18)'; g.lineWidth = 1; g.stroke(); }
  function drawHud(g, W, Hh, H) {
    const c = S.ctx, st = c.state, A = S.anim;
    g.textBaseline = 'middle';
    pill(g, 10, 10, 112, 30);
    g.textAlign = 'left'; g.fillStyle = '#eaf0ff'; g.font = '800 13px Orbitron, system-ui, sans-serif';
    g.fillText(`HOLE ${H.i + 1}`, 22, 25.5);
    g.fillStyle = 'rgba(234,240,255,.55)'; g.font = '700 10.5px "Chakra Petch", system-ui, sans-serif';
    g.fillText(`PAR ${H.par}`, 84, 26);
    // strokes on this hole, per player (pre-putt while a roll replays)
    const on = A ? A.L.ps : (st.hole === H.i ? [st.balls[0].s, st.balls[1].s] : [st.cards[0][H.i], st.cards[1][H.i]]);
    const done = [0, 1].map(p => A ? (A.L.hole !== st.hole || st.balls[p].done) && A.L.seat !== p : (st.hole === H.i ? st.balls[p].done : 1));
    const bw = 92; pill(g, W - bw - 10, 10, bw, 30);
    [0, 1].forEach(p => {
      const x = W - bw - 10 + 14 + p * 44;
      g.fillStyle = c.players[p].color; g.beginPath(); g.arc(x, 25, 4.5, 0, TAU); g.fill();
      if (st.turn === p && !A && c.status === 'active' && !st.over) { g.strokeStyle = c.players[p].color; g.lineWidth = 1.4; g.beginPath(); g.arc(x, 25, 7.5, 0, TAU); g.stroke(); }
      g.fillStyle = '#eaf0ff'; g.font = '800 12.5px Orbitron, system-ui, sans-serif'; g.textAlign = 'left';
      g.fillText(done[p] && on[p] ? on[p] + '✓' : String(on[p] || 0), x + 10, 25.5);
    });
    if (!A && !S.summary && c.status === 'active' && canAct() && !S.drag) {
      const t = 'DRAG BACK · RELEASE TO PUTT', w = 196;
      pill(g, W / 2 - w / 2, Hh - 38, w, 24);
      g.textAlign = 'center'; g.fillStyle = 'rgba(234,240,255,.8)'; g.font = '700 10px Orbitron, system-ui, sans-serif'; g.fillText(t, W / 2, Hh - 25.5);
    }
  }
  function drawIntro(g, W, Hh) {
    const I = S.intro, H = hole(I.hi), th = THEMES[H.theme], t = I.t;
    const bars = S.calm ? 0 : Math.min(1, t / 300, (I.max - t) / 300) * Hh * .085;
    if (bars > 0) { g.fillStyle = '#000'; g.fillRect(0, 0, W, bars); g.fillRect(0, Hh - bars, W, bars); }
    const a = Math.max(0, Math.min(1, t / 350, (I.max - 250 - t) / 450));
    if (a <= 0) return;
    g.save(); g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
    const y = Hh * .76 - 12, rise = S.calm ? 0 : (1 - Math.min(1, t / 500)) * 14;
    g.fillStyle = 'rgba(5,7,15,.5)'; rr(g, W / 2 - 130, y - 58 + rise, 260, 116, 22); g.fill();
    g.strokeStyle = hexA(th.wall.glow, .45); g.lineWidth = 1.2; g.stroke();
    g.fillStyle = hexA(th.wall.glow, .95); g.font = '700 10.5px Orbitron, system-ui, sans-serif';
    g.fillText(th.name.toUpperCase(), W / 2, y - 36 + rise);
    g.fillStyle = '#ffffff'; g.font = '900 34px Orbitron, system-ui, sans-serif';
    g.shadowColor = th.wall.glow; g.shadowBlur = 14; g.fillText(`HOLE ${H.i + 1}`, W / 2, y - 6 + rise); g.shadowBlur = 0;
    g.fillStyle = 'rgba(234,240,255,.8)'; g.font = '600 14px "Chakra Petch", system-ui, sans-serif';
    g.fillText(`${H.name}  ·  Par ${H.par}`, W / 2, y + 26 + rise);
    g.fillStyle = 'rgba(234,240,255,.45)'; g.font = '600 10px "Chakra Petch", system-ui, sans-serif';
    g.fillText('tap to skip', W / 2, y + 45 + rise);
    g.restore();
  }
  function drawSummary(g, W, Hh) {
    const Sm = S.summary, c = S.ctx, st = c.state, hi = Sm.hi, par = HOLES[hi].par;
    const a = Math.max(0, Math.min(1, Sm.t / 260, (Sm.max - Sm.t) / 300)); if (a <= 0) return;
    g.save(); g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
    const y = Hh * .52, w = 250;
    g.fillStyle = 'rgba(5,7,15,.74)'; rr(g, W / 2 - w / 2, y - 62, w, 124, 20); g.fill();
    g.strokeStyle = 'rgba(255,214,107,.4)'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = '#ffd66b'; g.font = '800 11px Orbitron, system-ui, sans-serif'; g.fillText(`HOLE ${hi + 1} COMPLETE · PAR ${par}`, W / 2, y - 40);
    [0, 1].forEach(p => {
      const s = st.cards[p][hi], yy = y - 10 + p * 34;
      g.fillStyle = c.players[p].color; g.beginPath(); g.arc(W / 2 - w / 2 + 26, yy, 6, 0, TAU); g.fill();
      g.textAlign = 'left'; g.fillStyle = '#eaf0ff'; g.font = '700 14px "Chakra Petch", system-ui, sans-serif'; g.fillText(c.players[p].name, W / 2 - w / 2 + 40, yy);
      g.textAlign = 'right'; g.font = '900 17px Orbitron, system-ui, sans-serif'; g.fillText(String(s || '–'), W / 2 + w / 2 - 20, yy);
      g.font = '700 9.5px Orbitron, system-ui, sans-serif'; g.fillStyle = s === PICKUP ? '#ff8a8a' : s && s < par ? '#ffd66b' : 'rgba(234,240,255,.6)';
      g.fillText(s ? label(s, par, s === PICKUP) : '', W / 2 + w / 2 - 44, yy + 1);
    });
    g.restore();
  }

  /* ---------------- the static hole layer (built once per hole + size) ---------------- */
  function buildLayer(hi) {
    const H = hole(hi), th = THEMES[H.theme], B = H.world;
    const ww = B.x1 - B.x0, wh = B.y1 - B.y0;
    let ls = S.scale * S.dpr * 1.25; ls = Math.min(ls, 3600 / Math.max(ww, wh));
    const c = document.createElement('canvas'); c.width = Math.ceil(ww * ls); c.height = Math.ceil(wh * ls);
    const g = c.getContext('2d');
    g.setTransform(ls, 0, 0, ls, -B.x0 * ls, -B.y0 * ls);
    const r = rng(hi * 7919 + 17);
    drawScenery(g, H, th, r, B, ls);
    drawCourse(g, H, th, r, ls);
    // edges fade into the backdrop so the overview never shows a hard border
    const fade = (x0, y0, x1, y1, gx0, gy0, gx1, gy1) => { const gr = g.createLinearGradient(gx0, gy0, gx1, gy1); gr.addColorStop(0, th.bg); gr.addColorStop(1, hexA(th.bg, 0)); g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
    const e = 46;
    fade(B.x0, B.y0, B.x1, B.y0 + e, 0, B.y0, 0, B.y0 + e); fade(B.x0, B.y1 - e, B.x1, B.y1, 0, B.y1, 0, B.y1 - e);
    fade(B.x0, B.y0, B.x0 + e, B.y1, B.x0, 0, B.x0 + e, 0); fade(B.x1 - e, B.y0, B.x1, B.y1, B.x1, 0, B.x1 - e, 0);
    S.layer = { c, B, hi };
  }
  function polyPath(g, p, closed) { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); if (closed) g.closePath(); }
  function zonePath(g, z, round) {
    g.beginPath();
    if (z.r && round) rr(g, z.r[0], z.r[1], z.r[2], z.r[3], round);
    else if (z.r) g.rect(z.r[0], z.r[1], z.r[2], z.r[3]);
    else if (z.e) g.ellipse(z.e[0], z.e[1], z.e[2], z.e[3], 0, 0, TAU);
    else { g.moveTo(z.p[0][0], z.p[0][1]); for (let i = 1; i < z.p.length; i++) g.lineTo(z.p[i][0], z.p[i][1]); g.closePath(); }
  }
  function drawScenery(g, H, th, r, B, ls) {
    const gr = g.createLinearGradient(0, B.y0, 0, B.y1); gr.addColorStop(0, th.ground[0]); gr.addColorStop(1, th.ground[1]);
    g.fillStyle = gr; g.fillRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
    const W = B.x1 - B.x0, Hh = B.y1 - B.y0, rx = () => B.x0 + r() * W, ry = () => B.y0 + r() * Hh;
    const out = (x, y, m) => !pip(H.bound, x, y) || m === 0;
    if (th === THEMES.garden) {
      for (let i = 0; i < 90; i++) {                                     // hedges and shrubs
        const x = rx(), y = ry(), s = 10 + r() * 20; if (!out(x, y)) continue;
        g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + 5, y + 7, s, s * .7, 0, 0, TAU); g.fill();
        for (let k = 0; k < 4; k++) { const a = r() * 6.28, d = r() * s * .5, rr2 = s * (.5 + r() * .4); const gg = g.createRadialGradient(x + Math.cos(a) * d - rr2 * .3, y + Math.sin(a) * d - rr2 * .4, 1, x + Math.cos(a) * d, y + Math.sin(a) * d, rr2); gg.addColorStop(0, '#1f5a3a'); gg.addColorStop(1, '#0a2518'); g.fillStyle = gg; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr2, 0, TAU); g.fill(); }
      }
      const fc = ['255,77,157', '47,230,255', '255,214,107', '155,123,255'];
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 80; i++) {                                     // glowing flowers
        const x = rx(), y = ry(); if (!out(x, y)) continue; const c = fc[i % 4];
        const gg = g.createRadialGradient(x, y, 0, x, y, 12); gg.addColorStop(0, `rgba(${c},.45)`); gg.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gg; g.beginPath(); g.arc(x, y, 12, 0, TAU); g.fill();
        g.fillStyle = `rgba(${c},.95)`; for (let k = 0; k < 5; k++) { const a = k * 1.2566 + r(); g.beginPath(); g.arc(x + Math.cos(a) * 2.4, y + Math.sin(a) * 2.4, 1.6, 0, TAU); g.fill(); }
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, .9, 0, TAU); g.fill();
      }
      g.restore();
    } else if (th === THEMES.beach) {
      g.strokeStyle = 'rgba(255,235,200,.14)'; g.lineWidth = 1.2;                   // wind ripples in the sand
      for (let i = 0; i < 70; i++) { const x = rx(), y = ry(), w = 20 + r() * 40; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 4, x + w, y); g.stroke(); }
      const sea = g.createLinearGradient(B.x0, 0, B.x0 + 80, 0); sea.addColorStop(0, '#0a4a66'); sea.addColorStop(.7, '#1592b0'); sea.addColorStop(1, 'rgba(70,224,230,0)');
      g.fillStyle = sea; g.beginPath(); g.moveTo(B.x0, B.y0); for (let y = B.y0; y <= B.y1; y += 20) g.lineTo(B.x0 + 62 + Math.sin(y * .05) * 8, y); g.lineTo(B.x0, B.y1); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
      g.beginPath(); for (let y = B.y0; y <= B.y1; y += 10) { const x = B.x0 + 62 + Math.sin(y * .05) * 8; y === B.y0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
      for (let i = 0; i < 40; i++) { const x = rx(), y = ry(); if (!out(x, y)) continue; g.fillStyle = r() < .5 ? 'rgba(255,240,225,.8)' : 'rgba(240,170,150,.7)'; g.beginPath(); g.ellipse(x, y, 2.2, 1.5, r() * 3, 0, TAU); g.fill(); }
      for (let i = 0; i < 9; i++) palm(g, rx(), ry(), 16 + r() * 10, r);
    } else if (th === THEMES.ice) {
      for (let i = 0; i < 26; i++) { const x = rx(), y = ry(), s = 20 + r() * 40; const gg = g.createRadialGradient(x, y, 0, x, y, s); gg.addColorStop(0, 'rgba(220,245,255,.12)'); gg.addColorStop(1, 'rgba(220,245,255,0)'); g.fillStyle = gg; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill(); }
      for (let i = 0; i < 34; i++) { const x = rx(), y = ry(); if (!out(x, y)) continue; crystal(g, x, y, 8 + r() * 14, r, '127,231,255'); }
    } else if (th === THEMES.lava) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 46; i++) {                                     // glowing cracks in the basalt
        let x = rx(), y = ry(); if (!out(x, y)) continue;
        g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - .5) * 34; y += (r() - .5) * 34; g.lineTo(x, y); }
        g.strokeStyle = 'rgba(255,90,20,.35)'; g.lineWidth = 3.5; g.stroke(); g.strokeStyle = 'rgba(255,200,90,.6)'; g.lineWidth = 1; g.stroke();
      }
      g.restore();
      for (let i = 0; i < 5; i++) { const x = rx(), y = ry(); if (!out(x, y)) continue; lavaBlob(g, x, y, 14 + r() * 16, r, ls); }
    } else {                                                                 // castle flagstones
      for (let y = B.y0; y < B.y1; y += 26) {
        let x = B.x0 - r() * 30;
        while (x < B.x1) { const w = 26 + r() * 30, v = 26 + Math.round(r() * 12); g.fillStyle = `rgb(${v},${v + 2},${v + 12})`; rr(g, x + 1.5, y + 1.5, w - 3, 23, 3); g.fill(); g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(x + 2, y + 2, w - 4, 2); if (r() < .15) { g.fillStyle = 'rgba(80,140,70,.25)'; g.beginPath(); g.arc(x + r() * w, y + 20, 3 + r() * 4, 0, TAU); g.fill(); } x += w; }
      }
    }
  }
  function palm(g, x, y, s, r) {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x + 10, y + 12, s * 1.1, s * .8, 0, 0, TAU); g.fill();
    for (let k = 0; k < 7; k++) {
      const a = k / 7 * TAU + r(), lx = x + Math.cos(a) * s * 1.3, ly = y + Math.sin(a) * s * 1.3;
      g.fillStyle = k % 2 ? '#2f7a3e' : '#3e9150'; g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + .35) * s, y + Math.sin(a + .35) * s, lx, ly); g.quadraticCurveTo(x + Math.cos(a - .35) * s, y + Math.sin(a - .35) * s, x, y); g.fill();
      g.strokeStyle = 'rgba(200,255,170,.35)'; g.lineWidth = .8; g.beginPath(); g.moveTo(x, y); g.lineTo(lx, ly); g.stroke();
    }
    g.fillStyle = '#6b4a2a'; g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill();
  }
  function crystal(g, x, y, s, r, c) {
    g.save(); g.globalCompositeOperation = 'lighter';
    const gg = g.createRadialGradient(x, y, 0, x, y, s * 1.8); gg.addColorStop(0, `rgba(${c},.25)`); gg.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gg; g.beginPath(); g.arc(x, y, s * 1.8, 0, TAU); g.fill();
    g.restore();
    const n = 3 + ((r() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (r() - .5) * 1.6, L = s * (.6 + r() * .7), w = s * .22;
      const tx = x + Math.cos(a) * L, ty = y + Math.sin(a) * L, px = -Math.sin(a) * w, py = Math.cos(a) * w;
      const gr = g.createLinearGradient(x, y, tx, ty); gr.addColorStop(0, 'rgba(60,150,200,.9)'); gr.addColorStop(1, 'rgba(230,252,255,.95)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x + px, y + py); g.lineTo(tx + px * .5, ty + py * .5); g.lineTo(tx + Math.cos(a) * w, ty + Math.sin(a) * w); g.lineTo(tx - px * .5, ty - py * .5); g.lineTo(x - px, y - py); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = .7; g.beginPath(); g.moveTo(x, y); g.lineTo(tx + Math.cos(a) * w, ty + Math.sin(a) * w); g.stroke();
    }
  }
  function lavaBlob(g, x, y, s, r, ls) {
    g.save(); g.shadowColor = 'rgba(255,90,20,.9)'; g.shadowBlur = 16 * ls;
    const gg = g.createRadialGradient(x, y, 0, x, y, s); gg.addColorStop(0, '#fff0a0'); gg.addColorStop(.35, '#ffae3a'); gg.addColorStop(1, '#c2320c');
    g.fillStyle = gg; g.beginPath(); for (let k = 0; k <= 10; k++) { const a = k / 10 * TAU, d = s * (.75 + r() * .3); k ? g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d); } g.closePath(); g.fill();
    g.restore();
    g.fillStyle = 'rgba(40,14,8,.55)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + (r() - .5) * s, y + (r() - .5) * s, s * .2, s * .12, r() * 3, 0, TAU); g.fill(); }
  }
  function drawCourse(g, H, th, r, ls) {
    const WH = 9;                                                    // wall height (drawn as a south face)
    // the course sits on a slab: its own shadow + a thick side edge
    g.save(); g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 22 * ls; g.shadowOffsetX = 6 * ls; g.shadowOffsetY = 12 * ls;
    g.fillStyle = th.slab; polyPath(g, H.bound, true); g.fill(); g.restore();
    g.save(); g.translate(0, 12); g.fillStyle = darken(th.slab, .2); polyPath(g, H.bound, true); g.fill(); g.restore();
    // felt: gradient + mowing stripes + fine nap + edge shading
    g.save(); polyPath(g, H.bound, true); g.clip();
    const fg = g.createLinearGradient(0, H.bb.y0, 0, H.bb.y1); fg.addColorStop(0, th.felt[0]); fg.addColorStop(1, th.felt[1]);
    g.fillStyle = fg; g.fillRect(H.bb.x0 - 10, H.bb.y0 - 10, H.bb.x1 - H.bb.x0 + 20, H.bb.y1 - H.bb.y0 + 20);
    g.save(); g.translate((H.bb.x0 + H.bb.x1) / 2, (H.bb.y0 + H.bb.y1) / 2); g.rotate(-.5);
    for (let k = -30; k < 30; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; g.fillRect(-700, k * 26, 1400, 26); }
    g.restore();
    for (let i = 0; i < 1600; i++) { const x = H.bb.x0 + r() * (H.bb.x1 - H.bb.x0), y = H.bb.y0 + r() * (H.bb.y1 - H.bb.y0); g.fillStyle = r() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; g.fillRect(x, y, 1, 1.6); }
    // zones
    H.allZones.forEach(z => drawZone(g, z, th, r, ls));
    // tee mat
    const [tx, ty] = H.tee;
    g.fillStyle = 'rgba(0,0,0,.25)'; rr(g, tx - 20, ty - 11, 42, 26, 6); g.fill();
    g.fillStyle = darken(th.felt[1], .25); rr(g, tx - 21, ty - 13, 42, 26, 6); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.stroke();
    [-15, 15].forEach(dx => { g.fillStyle = th.wall.glow; g.beginPath(); g.arc(tx + dx, ty, 2.6, 0, TAU); g.fill(); });
    // inner edge shading (ambient occlusion along the walls)
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 34; g.lineJoin = 'round'; polyPath(g, H.bound, true); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.16)'; g.lineWidth = 18; polyPath(g, H.bound, true); g.stroke();
    g.restore();
    // cup
    const [cx, cy] = H.cup;
    g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.arc(cx, cy, CUP_R + 9, 0, TAU); g.fill();       // fringe
    const cg = g.createRadialGradient(cx, cy + 4, 1, cx, cy, CUP_R); cg.addColorStop(0, '#000'); cg.addColorStop(.7, '#07090e'); cg.addColorStop(1, '#1a2030');
    g.fillStyle = cg; g.beginPath(); g.arc(cx, cy, CUP_R, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 2.2; g.beginPath(); g.arc(cx, cy, CUP_R - 2, .15 * Math.PI, .85 * Math.PI); g.stroke();   // lit far liner
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, CUP_R + .6, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, CUP_R + 2.6, 0, TAU); g.stroke();
    // bumpers (cylinders)
    H.bumps.forEach(q => cylinder(g, q[0], q[1], q[2], th, ls));
    if (H.spin) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(H.spin.x + 3, H.spin.y + 5, SPIN_HUB + 4, 0, TAU); g.fill(); }
    // tunnel mouths
    H.ports.forEach(P => [P.a, P.b].forEach((q, j) => {
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(q[0] + 2, q[1] + 3, PORT_R + 3, 0, TAU); g.fill();
      const pg = g.createRadialGradient(q[0], q[1], 1, q[0], q[1], PORT_R + 2); pg.addColorStop(0, '#000'); pg.addColorStop(.75, j ? '#0a2a2a' : '#1a0f33'); pg.addColorStop(1, j ? '#3fe0c0' : '#9b7bff');
      g.fillStyle = pg; g.beginPath(); g.arc(q[0], q[1], PORT_R + 2, 0, TAU); g.fill();
      g.strokeStyle = j ? 'rgba(160,255,230,.8)' : 'rgba(210,190,255,.85)'; g.lineWidth = 1.6; g.beginPath(); g.arc(q[0], q[1], PORT_R + 2, 0, TAU); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.font = '700 7px Orbitron, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(j ? 'OUT' : 'IN', q[0], q[1] + PORT_R + 9);
    }));
    // walls: shadow → south face → lit top → neon edge
    const Wt = th.wall;
    const wallPath = w => { polyPath(g, w.p, !!w.c); };
    g.lineJoin = 'round'; g.lineCap = 'round';
    H.walls.forEach(w => {
      g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 9 * ls; g.shadowOffsetX = 4 * ls; g.shadowOffsetY = (WH + 3) * ls;
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.fillStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2 * (w.hw || 6); wallPath(w); g.stroke(); if (w.solid) g.fill(); g.restore();
    });
    H.walls.forEach(w => {
      g.lineWidth = 2 * (w.hw || 6);
      for (let k = WH; k >= 1; k--) {
        g.save(); g.translate(0, k); const col = mix(Wt.side, darken(Wt.side, .45), k / WH);
        g.strokeStyle = col; g.fillStyle = col; wallPath(w); g.stroke(); if (w.solid) g.fill(); g.restore();
      }
    });
    H.walls.forEach(w => {
      const hw = w.hw || 6;
      g.strokeStyle = Wt.top; g.fillStyle = Wt.top; g.lineWidth = 2 * hw; wallPath(w); g.stroke();
      if (w.solid) solidTop(g, w, H, th, r, ls);
      g.save(); g.translate(-.5, -.8); g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = Math.max(1, hw * .7); wallPath(w); g.stroke(); g.restore();
      if (H.theme === 'castle') {                                     // brick courses on the stone tops
        g.save(); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = .7; g.setLineDash([.6, 7]); g.lineWidth = 2 * hw - 2; wallPath(w); g.stroke(); g.restore();
      }
    });
    g.save(); g.shadowColor = Wt.glow; g.shadowBlur = 7 * ls; g.strokeStyle = hexA(Wt.edge, .85); g.lineWidth = 1.1;
    H.walls.forEach(w => { g.save(); g.translate(0, -(w.hw || 6) + .8); wallPath(w); g.stroke(); g.restore(); });
    g.restore();
    // windmill tower cap (on the building between the two blocks)
    if (H.mill) {
      const M = H.mill;
      g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 10 * ls; g.shadowOffsetY = 6 * ls;
      const tg = g.createLinearGradient(M.x - 40, 0, M.x + 40, 0); tg.addColorStop(0, '#6b5a4a'); tg.addColorStop(.5, '#b99a78'); tg.addColorStop(1, '#5a4636');
      g.fillStyle = tg; g.beginPath(); g.moveTo(M.x - 34, M.y + 50); g.lineTo(M.x - 26, M.y - 30); g.lineTo(M.x + 26, M.y - 30); g.lineTo(M.x + 34, M.y + 50); g.closePath(); g.fill();
      g.restore();
      const rf = g.createLinearGradient(M.x - 34, 0, M.x + 34, 0); rf.addColorStop(0, '#6a1f2c'); rf.addColorStop(.5, '#c23a4e'); rf.addColorStop(1, '#5a1824');
      g.fillStyle = rf; g.beginPath(); g.moveTo(M.x - 34, M.y - 26); g.lineTo(M.x, M.y - 62); g.lineTo(M.x + 34, M.y - 26); g.closePath(); g.fill();
      g.fillStyle = '#0b0d14'; rr(g, M.x - 16, M.y + 22, 32, 36, 14); g.fill();                         // the door (tunnel)
      g.strokeStyle = 'rgba(255,214,107,.5)'; g.lineWidth = 1.2; rr(g, M.x - 16, M.y + 22, 32, 36, 14); g.stroke();
      g.fillStyle = 'rgba(255,214,107,.8)'; [[-14, -6], [14, -6]].forEach(([dx, dy]) => { g.fillRect(M.x + dx - 3, M.y + dy, 6, 8); });
    }
    // lamps at the course corners light the green
    const cxm = (H.bb.x0 + H.bb.x1) / 2, cym = (H.bb.y0 + H.bb.y1) / 2;
    H.bound.forEach((q, i) => {
      if (H.bound.length > 12 && i % 3) return;
      const dx = q[0] - cxm, dy = q[1] - cym, d = Math.sqrt(dx * dx + dy * dy) || 1, lx = q[0] + dx / d * 16, ly = q[1] + dy / d * 16;
      g.save(); g.globalCompositeOperation = 'lighter';
      const lg = g.createRadialGradient(lx, ly, 0, lx, ly, 120); lg.addColorStop(0, `rgba(${th.lamp},.2)`); lg.addColorStop(1, `rgba(${th.lamp},0)`);
      g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, 120, 0, TAU); g.fill();
      g.restore();
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(lx + 2, ly + 3, 5, 0, TAU); g.fill();
      g.fillStyle = '#20222e'; g.beginPath(); g.arc(lx, ly, 4.5, 0, TAU); g.fill();
      g.save(); g.globalCompositeOperation = 'lighter';
      const cg2 = g.createRadialGradient(lx, ly - 1, 0, lx, ly - 1, 9); cg2.addColorStop(0, 'rgba(255,255,255,.95)'); cg2.addColorStop(.3, `rgba(${th.lamp},.9)`); cg2.addColorStop(1, `rgba(${th.lamp},0)`);
      g.fillStyle = cg2; g.beginPath(); g.arc(lx, ly - 1, 9, 0, TAU); g.fill(); g.restore();
    });
  }
  // the top of a solid block: a planter, an ice slab or a stone keep, by theme
  function solidTop(g, w, H, th, r, ls) {
    const xs = w.p.map(q => q[0]), ys = w.p.map(q => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    g.save(); polyPath(g, w.p, true); g.clip();
    if (H.theme === 'garden') {
      const sg = g.createLinearGradient(0, y0, 0, y1); sg.addColorStop(0, '#2c2016'); sg.addColorStop(1, '#1a120c');
      g.fillStyle = sg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      const fc = ['255,77,157', '47,230,255', '255,214,107', '121,245,182'];
      for (let i = 0; i < (x1 - x0) * (y1 - y0) / 90; i++) {
        const x = x0 + 4 + r() * (x1 - x0 - 8), y = y0 + 4 + r() * (y1 - y0 - 8), c = fc[i % 4];
        g.fillStyle = '#1f5a36'; g.beginPath(); g.arc(x, y + 1, 3.2, 0, TAU); g.fill();
        g.fillStyle = `rgba(${c},.95)`; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
      }
    } else if (H.theme === 'ice') {
      const ig = g.createLinearGradient(x0, y0, x1, y1); ig.addColorStop(0, '#9fdcf0'); ig.addColorStop(.5, '#5aa9cc'); ig.addColorStop(1, '#2f6f98');
      g.fillStyle = ig; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1.4;
      for (let y = y0 + 14; y < y1; y += 26 + r() * 20) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y - 10 - r() * 12); g.stroke(); }
      g.strokeStyle = 'rgba(20,60,90,.35)'; g.lineWidth = .8;
      for (let i = 0; i < (y1 - y0) / 40; i++) { let x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - .5) * 22; y += (r() - .5) * 22; g.lineTo(x, y); } g.stroke(); }
      for (let y = y0 + 30; y < y1 - 10; y += 70 + r() * 40) crystal(g, x0 + (x1 - x0) * (.3 + r() * .4), y, 9 + r() * 6, r, '160,240,255');
    } else if (H.theme === 'castle') {
      const cg = g.createLinearGradient(0, y0, 0, y1); cg.addColorStop(0, '#8e90a3'); cg.addColorStop(1, '#5c5f73');
      g.fillStyle = cg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.strokeStyle = 'rgba(20,20,30,.35)'; g.lineWidth = 1;
      for (let y = y0, row = 0; y < y1; y += 9, row++) { g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); for (let x = x0 + (row % 2) * 8; x < x1; x += 16) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 9); g.stroke(); } }
    } else {
      const bg = g.createLinearGradient(0, y0, 0, y1); bg.addColorStop(0, lighten(th.wall.top, .08)); bg.addColorStop(1, darken(th.wall.top, .12));
      g.fillStyle = bg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x0, y0, x1 - x0, 3);
    g.restore();
  }
  function cylinder(g, x, y, r, th, ls) {
    const h = 8;
    g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 8 * ls; g.shadowOffsetX = 3 * ls; g.shadowOffsetY = (h + 2) * ls;
    g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore();
    for (let k = h; k >= 1; k--) { g.fillStyle = mix(th.wall.side, darken(th.wall.side, .5), k / h); g.beginPath(); g.arc(x, y + k, r, 0, TAU); g.fill(); }
    const tg = g.createRadialGradient(x - r * .35, y - r * .4, 1, x, y, r); tg.addColorStop(0, lighten(th.wall.top, .45)); tg.addColorStop(1, th.wall.top);
    g.fillStyle = tg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.save(); g.shadowColor = th.wall.glow; g.shadowBlur = 8 * ls; g.strokeStyle = hexA(th.wall.edge, .9); g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, r - 2.5, 0, TAU); g.stroke(); g.restore();
    g.fillStyle = hexA(th.wall.glow, .9); g.beginPath(); g.arc(x, y, r * .28, 0, TAU); g.fill();
  }
  function drawZone(g, z, th, r, ls) {
    if (z.k === 'sand') {
      g.save(); zonePath(g, z); g.clip();
      const sg = g.createRadialGradient(z.x0 + (z.x1 - z.x0) * .4, z.y0 + (z.y1 - z.y0) * .35, 2, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, Math.max(z.x1 - z.x0, z.y1 - z.y0) * .7);
      sg.addColorStop(0, '#f1d8a0'); sg.addColorStop(1, '#c79d5c'); g.fillStyle = sg; g.fillRect(z.x0 - 4, z.y0 - 4, z.x1 - z.x0 + 8, z.y1 - z.y0 + 8);
      g.strokeStyle = 'rgba(150,110,60,.28)'; g.lineWidth = 1;                         // rake lines
      for (let y = z.y0 + 4; y < z.y1; y += 5) { g.beginPath(); g.moveTo(z.x0, y); for (let x = z.x0; x <= z.x1; x += 8) g.lineTo(x, y + Math.sin(x * .12 + y) * 1.2); g.stroke(); }
      for (let i = 0; i < 90; i++) { g.fillStyle = r() < .5 ? 'rgba(255,255,255,.3)' : 'rgba(120,80,40,.3)'; g.fillRect(z.x0 + r() * (z.x1 - z.x0), z.y0 + r() * (z.y1 - z.y0), 1.2, 1.2); }
      zonePath(g, z); g.strokeStyle = 'rgba(80,50,20,.35)'; g.lineWidth = 7; g.stroke();          // it sits lower than the green
      g.restore();
      zonePath(g, z); g.strokeStyle = 'rgba(255,240,200,.35)'; g.lineWidth = 1.4; g.stroke();
    } else if (z.k === 'ice') {
      g.save(); zonePath(g, z, 12); g.clip();
      const ig = g.createLinearGradient(z.x0, z.y0, z.x1, z.y1); ig.addColorStop(0, 'rgba(215,248,255,.42)'); ig.addColorStop(1, 'rgba(140,210,240,.3)');
      g.fillStyle = ig; g.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1.2;
      for (let i = 0; i < 16; i++) { const x = z.x0 + r() * (z.x1 - z.x0), y = z.y0 + r() * (z.y1 - z.y0); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 22 + r() * 30, y - 12 - r() * 16); g.stroke(); }
      g.strokeStyle = 'rgba(40,110,150,.3)'; g.lineWidth = .8;
      for (let i = 0; i < 10; i++) { let x = z.x0 + r() * (z.x1 - z.x0), y = z.y0 + r() * (z.y1 - z.y0); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - .5) * 26; y += (r() - .5) * 26; g.lineTo(x, y); } g.stroke(); }
      zonePath(g, z, 12); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 6; g.stroke();
      g.restore();
      zonePath(g, z, 12); g.strokeStyle = 'rgba(225,250,255,.35)'; g.lineWidth = 1; g.stroke();
    } else if (z.k === 'slope') {
      const [fx, fy] = z.f, m = Math.sqrt(fx * fx + fy * fy) || 1, ux = fx / m, uy = fy / m;
      const cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2, ext = Math.abs(ux) * (z.x1 - z.x0) / 2 + Math.abs(uy) * (z.y1 - z.y0) / 2;
      g.save(); zonePath(g, z, 16); g.clip();
      const sg = g.createLinearGradient(cx - ux * ext, cy - uy * ext, cx + ux * ext, cy + uy * ext);
      sg.addColorStop(0, 'rgba(255,255,255,.08)'); sg.addColorStop(1, 'rgba(0,0,0,.2)');                        // uphill lit, downhill in shade
      g.fillStyle = sg; g.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      g.strokeStyle = 'rgba(255,255,255,.17)'; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let y = z.y0 + 18; y < z.y1; y += 34) for (let x = z.x0 + 18 + ((y / 34) % 2) * 17; x < z.x1; x += 34) {
        const px = -uy * 6, py = ux * 6;
        g.beginPath(); g.moveTo(x - ux * 4 + px, y - uy * 4 + py); g.lineTo(x + ux * 4, y + uy * 4); g.lineTo(x - ux * 4 - px, y - uy * 4 - py); g.stroke();
      }
      // contour lines across the fall line
      g.strokeStyle = 'rgba(0,0,0,.07)'; g.lineWidth = 1;
      for (let k = -6; k <= 6; k++) { const ox = cx + ux * k * 22, oy = cy + uy * k * 22; g.beginPath(); g.moveTo(ox - uy * 400, oy + ux * 400); g.lineTo(ox + uy * 400, oy - ux * 400); g.stroke(); }
      zonePath(g, z, 16); g.strokeStyle = hexA(th.felt[1], .5); g.lineWidth = 10; g.stroke();     // feathered edge
      g.restore();
    } else if (z.k === 'water') {
      const wc = th.water || ['#46e0e6', '#1592b0', '#0b5373'];
      g.save(); zonePath(g, z); g.clip();
      const wg = g.createLinearGradient(0, z.y0, 0, z.y1); wg.addColorStop(0, wc[1]); wg.addColorStop(1, wc[2]);
      g.fillStyle = wg; g.fillRect(z.x0 - 2, z.y0 - 2, z.x1 - z.x0 + 4, z.y1 - z.y0 + 4);
      g.save(); g.globalCompositeOperation = 'lighter';
      const hg = g.createRadialGradient(z.x0 + (z.x1 - z.x0) * .3, z.y0 + (z.y1 - z.y0) * .3, 2, z.x0 + (z.x1 - z.x0) * .3, z.y0 + (z.y1 - z.y0) * .3, Math.max(z.x1 - z.x0, z.y1 - z.y0) * .6);
      hg.addColorStop(0, hexA(wc[0], .35)); hg.addColorStop(1, hexA(wc[0], 0)); g.fillStyle = hg; g.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.1;
      for (let i = 0; i < 22; i++) { const x = z.x0 + r() * (z.x1 - z.x0), y = z.y0 + r() * (z.y1 - z.y0), w = 8 + r() * 16; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 3, x + w, y); g.stroke(); }
      g.restore();
      zonePath(g, z); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 10; g.stroke();            // the bank drops away
      g.restore();
      zonePath(g, z); g.strokeStyle = 'rgba(230,255,255,.6)'; g.lineWidth = 1.8; g.stroke();       // foam line
    } else if (z.k === 'lava') {
      g.save(); g.shadowColor = 'rgba(255,90,20,.95)'; g.shadowBlur = 18 * ls;
      zonePath(g, z); const lg = g.createRadialGradient((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, 4, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, Math.max(z.x1 - z.x0, z.y1 - z.y0) * .6);
      lg.addColorStop(0, '#fff2a8'); lg.addColorStop(.35, '#ffa631'); lg.addColorStop(1, '#b42a0a'); g.fillStyle = lg; g.fill(); g.restore();
      g.save(); zonePath(g, z); g.clip();
      for (let i = 0; i < 14; i++) { const x = z.x0 + r() * (z.x1 - z.x0), y = z.y0 + r() * (z.y1 - z.y0), s = 6 + r() * 12; g.fillStyle = 'rgba(50,16,8,.55)'; g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU, d = s * (.7 + r() * .4); k ? g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d * .7) : g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d * .7); } g.closePath(); g.fill(); }
      zonePath(g, z); g.strokeStyle = 'rgba(40,10,5,.6)'; g.lineWidth = 8; g.stroke();
      g.restore();
      zonePath(g, z); g.strokeStyle = 'rgba(255,220,120,.7)'; g.lineWidth = 1.4; g.stroke();
    } else if (z.k === 'ramp') {
      const [x, y, w, h] = z.r;
      g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 8 * ls; g.shadowOffsetY = 6 * ls;
      const rg = g.createLinearGradient(0, y + h, 0, y); rg.addColorStop(0, '#6b4a2c'); rg.addColorStop(1, '#d9a867');
      g.fillStyle = rg; g.fillRect(x, y, w, h); g.restore();
      g.strokeStyle = 'rgba(60,35,15,.55)'; g.lineWidth = 1;
      for (let yy = y + 5; yy < y + h; yy += 6) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
      g.fillStyle = '#f3d49a'; g.fillRect(x, y - 2, w, 3);                                   // the lip
      g.fillStyle = 'rgba(40,20,5,.7)'; g.fillRect(x, y - 6, w, 4);                            // drop behind it
      g.strokeStyle = 'rgba(255,240,200,.75)'; g.lineWidth = 2.2; g.lineCap = 'round';
      const mx = x + w / 2; g.beginPath(); g.moveTo(mx - 9, y + h * .62); g.lineTo(mx, y + h * .32); g.lineTo(mx + 9, y + h * .62); g.stroke();
    }
  }

  /* ---------------- tiny canvas helpers ---------------- */
  function rr(g, x, y, w, h, r) {
    if (w <= 0 || h <= 0) { g.beginPath(); return; } r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xffffff; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hexRgb(hex) { return rgb(hex).join(','); }
  function hexA(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function lighten(hex, f) { const c = rgb(hex).map(v => Math.round(v + (255 - v) * f)); return `rgb(${c})`; }
  function darken(hex, f) { const c = rgb(hex).map(v => Math.round(v * (1 - f))); return `rgb(${c})`; }
  function mix(a, b, t) { const A = rgb(a[0] === '#' ? a : toHex(a)), B = rgb(b[0] === '#' ? b : toHex(b)); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t))})`; }
  function toHex(s) { const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(s); return m ? '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : '#ffffff'; }

  /* ---------------- scorecard + chrome ---------------- */
  function shownCards(st) {
    const cards = st.cards.map(r => r.slice()), live = [null, null], A = S.anim;
    const hi = A ? A.L.hole : st.hole;
    if (A) { [0, 1].forEach(p => { if (p === A.L.seat || (A.L.hole === st.hole && !st.balls[p].done)) { cards[p][hi] = 0; live[p] = A.L.ps[p]; } }); }
    else if (!st.over) [0, 1].forEach(p => { if (!st.balls[p].done) live[p] = st.balls[p].s; });
    return { cards, live, hi };
  }
  function scorecard(ctx, st) {
    const h = ctx.h, { cards, live, hi } = shownCards(st);
    const cls = (s, par) => s === PICKUP ? 'pick' : s === 1 ? 'ace' : s <= par - 2 ? 'eag' : s === par - 1 ? 'bir' : s === par ? 'par0' : s === par + 1 ? 'bog' : 'dbl';
    const tbl = h('table', {});
    const hd = h('tr', { class: 'hd' }, h('th', {}, 'HOLE'));
    for (let k = 0; k < HOLES_N; k++) hd.append(h('th', { class: k === hi && !st.over ? 'cur' : '' }, String(k + 1)));
    hd.append(h('th', {}, 'TOT'));
    const par = h('tr', { class: 'par' }, h('th', {}, 'Par'));
    PARS.forEach((p, k) => par.append(h('td', { class: k === hi && !st.over ? 'cur' : '' }, String(p))));
    par.append(h('td', {}, String(PAR_TOTAL)));
    tbl.append(hd, par);
    [0, 1].forEach(p => {
      const row = h('tr', { class: 'p' + p }, h('th', {}, ctx.players[p].name));
      let tot = 0;
      for (let k = 0; k < HOLES_N; k++) {
        const s = cards[p][k], cur = k === hi && !st.over ? ' cur' : '';
        if (s) { tot += s; row.append(h('td', { class: cls(s, PARS[k]) + cur }, String(s))); }
        else if (k === hi && live[p] != null && live[p] > 0) { tot += live[p]; row.append(h('td', { class: 'live' + cur }, String(live[p]))); }
        else row.append(h('td', { class: 'none' + cur }, '·'));
      }
      row.append(h('td', {}, String(tot)));
      tbl.append(row);
    });
    return h('div', { class: 'mg-card' }, tbl);
  }
  // A timeout can finish the round without a winner being committed — either phone settles it
  // (the turn-holder at once, the other after a grace), re-checked against the freshest ctx.
  function settle(st, first) {
    const key = st.seed + ':' + st.n + ':' + first;
    if (S.settleKey === key) return; S.settleKey = key;
    setTimeout(() => {
      const c = S.ctx; if (!c || c.status !== 'active') return;
      const cur = norm(c.state); if (!cur.over || cur.seed !== st.seed) return;
      c.commit(clone(cur), winnerOf(cur));
    }, first ? 0 : 2500);
  }

  /* ---------------- registration ---------------- */
  const DEF = {
    id: 'mini-golf', name: 'Mini Golf', emoji: '⛳', category: 'Arcade', accent: '#79f5b6',
    tagline: '9 wild holes · bumpers, ice, lava & a windmill · fewest strokes wins.',
    // the last putt may still be rolling when the match finishes — hold the result card for it
    resultDelay: () => {
      const A = S.anim;
      if (A) return Math.min(4500, Math.round(Math.max(0, A.len - A.clock) / 240 * 1000 * 1.35 + Math.max(0, A.tailMax - A.tail) * 16.7 + 700));
      if (S.summary) return Math.min(4500, Math.max(0, S.summary.max - S.summary.t) + 200);
      return 0;
    },
    // timer ran out: the stroke counts, the ball stays put, and the turn passes
    skipTurn: (st, opp) => skipState(st, opp),
    init: host => ({
      v: 1, seed: ((Math.random() * 2147483646) | 0) + 1, hole: 0, turn: host, honor: host,
      balls: [teeBall(0), teeBall(0)], cards: [Array(HOLES_N).fill(0), Array(HOLES_N).fill(0)],
      n: 0, clk: 0, ph: 0, over: 0, last: null,
    }),
    test: { HOLES, THEMES, hole, simulate, applyStroke, skipState, nextTurn, totals, norm, away, grid, endHole, winnerOf, label,
      pip, inZone, segDist, millBlocked, speedOf, R, CUP_R, CAP_V, DT, MAX_STEPS, MAX_STROKES, PICKUP, PORT_R, S,
      putt: (a, p) => putt(a, p), canAct: () => canAct(),
      replay: () => ({ id: S.anim ? S.anim.id : 0, clock: S.anim ? S.anim.clock : 0, len: S.anim ? S.anim.len : 0, doneId: S.doneId }) },

    render(ctx) {
      const st = norm(ctx.state), me = ctx.me, foe = 1 - me;
      S.ctx = ctx;
      ensureCanvas();
      if (st.seed !== S.seed) resetScene(st);
      maybeReplay(st);
      if (!S.anim && S.lastPh !== st.ph) { S.phBase = st.ph; S.phT0 = performance.now(); }
      S.lastPh = st.ph;

      const A = S.anim;
      const shown = A ? A.L.pv.slice() : totals(st);
      const wrap = ctx.h('div', { class: 'mg-wrap' });
      // while a putt replays, the bar still shows the putter (the hand-off glides over once it stops)
      const realTurn = st.turn; if (A && ctx.status === 'active') st.turn = A.L.seat;
      let bar; try { bar = ctx.turnBar({ scores: shown }); } finally { st.turn = realTurn; }
      ctx.root.append(bar, wrap);
      wrap.append(S.cv);                                               // the SAME canvas every repaint
      fit();                                                           // size first: the camera framing needs it
      syncHole(st);
      draw(); ensureLoop();

      const nm = i => `<b>${ctx.players[i].name}</b>`;
      const H = HOLES[st.hole], mine = st.balls[me], theirs = st.balls[foe];
      let hint;
      if (ctx.status === 'finished' || st.over) {
        const t = totals(st), w = winnerOf(st);
        hint = w === 'draw' ? `All square on <b>${t[0]}</b> — a draw!` : `${nm(w)} wins <b>${t[w]}</b> to ${t[1 - w]} · par ${PAR_TOTAL}`;
      } else if (A) hint = A.L.seat === me ? 'Rolling…' : `${nm(A.L.seat)} putted — watch it roll…`;
      else if (S.intro) hint = `Hole <b>${st.hole + 1}</b> · ${H.name} · Par <b>${H.par}</b>`;
      else if (S.summary) hint = `Hole <b>${S.summary.hi + 1}</b> done — next up: <b>${HOLES[st.hole].name}</b>`;
      else if (ctx.isMyTurn && st.turn === me && !mine.done) {
        const why = mine.s === 0 ? (theirs.s === 0 ? 'you have the honour' : 'your tee shot') : (!theirs.done ? 'you\'re away' : 'finish the hole');
        hint = `Your putt (${why}) · <b>drag back</b> anywhere, release to hit`;
      } else if (mine.done) hint = `You're done here · ${nm(foe)} to finish hole ${st.hole + 1}`;
      else hint = `${nm(st.turn)} is lining up${st.balls[st.turn] && st.balls[st.turn].s ? '' : ' the tee shot'}…`;
      const hintEl = ctx.h('div', { class: 'mg-hint', html: hint });
      const ovBtn = ctx.h('button', { class: 'mg-btn' + (S.overview ? ' on' : ''), type: 'button',
        onclick: () => { S.overview = !S.overview; try { ctx.sound.tap(); } catch (e) {} ovBtn.classList.toggle('on', S.overview); ovBtn.textContent = S.overview ? '◉ Follow ball' : '◎ See whole hole'; ensureLoop(); } },
        S.overview ? '◉ Follow ball' : '◎ See whole hole');
      wrap.append(hintEl, ctx.h('div', { class: 'mg-row' }, ovBtn), scorecard(ctx, st));

      if (st.over && ctx.status === 'active' && !A) settle(st, st.turn === me);
    },
  };
  Games.register(DEF);
})();
