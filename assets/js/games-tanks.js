/* ============================================================
   POCKET TANKS — turn-based artillery on destructible terrain.

   Points, not health: each match drafts 10 weapons from a pool of 16
   (Shell always included), you BOTH get that same arsenal, fire every
   weapon once, and score the damage you deal. Most points after 20
   shots wins. Own goals score for your partner. 3 free tank moves each.

   Determinism: the host generates the seeded terrain ONCE and stores it
   in state. The thrower resolves a shot with resolveShot() — a pure
   function of terrain, tanks, weapon, angle, power and wind — and
   commits terrain + scores. The partner replays the same resolution
   from `last.prev` for the animation, then snaps to the committed
   terrain, so float differences between phone engines can't desync.

   Cinematic 2.5D rendering (v68): a camera that tracks the shell and
   pushes in on impacts, slow motion as a shell closes on a tank,
   parallax layers with atmospheric haze, a bevelled textured ground
   with wind-blown grass and persistent scorch marks, detailed tanks
   (shadow, wheels, treads, recoil, flag), fireballs / smoke / debris /
   a mushroom cloud, and four maps picked per match. The canvas and
   loop are MODULE-LEVEL and survive every repaint of the stage.
   ============================================================ */
(function () {
  const css = `
  .pt-wrap{ display:flex; flex-direction:column; gap:9px; }
  .pt-cv{ width:100%; display:block; border-radius:var(--r-3); border:1px solid var(--glass-brd);
    box-shadow:var(--shadow-soft), 0 0 0 1px rgba(0,0,0,.25) inset; background:#060818; touch-action:none; }
  .pt-rail{ display:flex; gap:7px; overflow-x:auto; scrollbar-width:none; padding:1px 1px 3px;
    scroll-snap-type:x proximity; -webkit-overflow-scrolling:touch; }
  .pt-rail::-webkit-scrollbar{ display:none; }
  .pt-wpn{ flex:0 0 auto; width:84px; padding:9px 5px 8px; border-radius:var(--r-2); position:relative;
    background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); text-align:center;
    scroll-snap-align:start; transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), box-shadow var(--dur-2), opacity var(--dur-2); }
  .pt-wpn svg{ width:26px; height:26px; display:block; margin:0 auto 5px; filter:drop-shadow(0 0 6px currentColor); }
  .pt-wpn b{ display:block; font-size:10.5px; letter-spacing:.2px; line-height:1.25; }
  .pt-wpn small{ display:block; font-size:9px; color:var(--ink-faint); margin-top:2px; line-height:1.25; }
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
  const HOME = [150, 850];
  const DRAFT = 10;                                             // weapons (= shots) per player per match
  const QUAKE_R = 130, QUAKE_MAX = 20, QUAKE_DEPTH = 26;

  const WEAPONS = {
    shell:     { name: 'Shell',         stat: '30 dmg',            col: '#ffb45e', r: 34, max: 30 },
    bertha:    { name: 'Big Bertha',    stat: '45 · huge blast',   col: '#ff7a3d', r: 66, max: 45 },
    triple:    { name: 'Triple Shot',   stat: '3 × 18',            col: '#ffd66b', r: 26, max: 18, spread: 0.075 },
    cluster:   { name: 'Cluster',       stat: '16 + 5 bomblets',   col: '#ff4d9d', r: 28, max: 16, kids: 5, kidR: 22, kidMax: 11 },
    sniper:    { name: 'Sniper',        stat: '48 · no wind',      col: '#2fe6ff', r: 18, max: 48, speed: 1.45, noWind: true },
    dirt:      { name: 'Dirt Wall',     stat: 'builds a hill',     col: '#c89a64', r: 60, max: 0, dirt: true },
    nuke:      { name: 'Tactical Nuke', stat: '60 · enormous',     col: '#b6ff3a', r: 98, max: 60, fx: 'nuke' },
    napalm:    { name: 'Napalm',        stat: 'sets the ground alight', col: '#ff5a1f', r: 20, max: 12, burn: true },
    roller:    { name: 'Roller',        stat: 'rolls downhill',    col: '#9b7bff', r: 0, max: 0, roll: true, rollR: 38, rollMax: 34 },
    bouncer:   { name: 'Bouncer',       stat: '3 bounces',         col: '#79f5b6', r: 22, max: 14, bounces: 3 },
    mirv:      { name: 'MIRV',          stat: 'splits in the air', col: '#ff9ecb', r: 0, max: 0, mirv: 5, kidR: 24, kidMax: 13 },
    homing:    { name: 'Homing',        stat: 'steers to target',  col: '#7cc4ff', r: 26, max: 26, homing: true },
    railgun:   { name: 'Railgun',       stat: 'pierces the ground', col: '#e8f1ff', r: 14, max: 40, straight: true, pierce: true, speed: 2.2, noWind: true },
    airstrike: { name: 'Air Strike',    stat: '5 bombs from above', col: '#ffd23a', r: 10, max: 4, air: true },
    chain:     { name: 'Chain Blast',   stat: '4 marching blasts', col: '#ff6b9a', r: 24, max: 13, chain: 3 },
    quake:     { name: 'Earthquake',    stat: 'shakes the ground', col: '#d9a066', r: 0, max: 0, quake: true },
  };
  const POOL = Object.keys(WEAPONS);                            // display order
  const LEGACY = ['shell', 'bertha', 'triple', 'cluster', 'sniper', 'dirt'];   // matches from before the draft
  const WICON = {
    shell: '<circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="7.6" opacity=".4"/>',
    bertha: '<circle cx="11" cy="13.4" r="6.6" fill="currentColor" stroke="none"/><path d="M15.4 8.6l2.2-2.6"/><path d="M19 2.8l.5 1.6 1.6.5-1.6.5-.5 1.6-.5-1.6-1.6-.5 1.6-.5z" fill="currentColor"/>',
    triple: '<circle cx="5.6" cy="15.5" r="2.7" fill="currentColor" stroke="none"/><circle cx="12" cy="8.5" r="2.7" fill="currentColor" stroke="none"/><circle cx="18.4" cy="15.5" r="2.7" fill="currentColor" stroke="none"/>',
    cluster: '<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/><circle cx="12" cy="4.3" r="1.6" fill="currentColor" stroke="none"/><circle cx="19.3" cy="9.6" r="1.6" fill="currentColor" stroke="none"/><circle cx="16.6" cy="18.3" r="1.6" fill="currentColor" stroke="none"/><circle cx="7.4" cy="18.3" r="1.6" fill="currentColor" stroke="none"/><circle cx="4.7" cy="9.6" r="1.6" fill="currentColor" stroke="none"/>',
    sniper: '<circle cx="12" cy="12" r="7"/><path d="M12 2.5v5M12 16.5v5M2.5 12h5M16.5 12h5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    dirt: '<path d="M2.5 19.5C5 12.4 8 8.6 12 8.6s7 3.8 9.5 10.9z" fill="currentColor" stroke="none"/><path d="M8.4 14h.8M13.2 12.2h.8M15.6 15.6h.8" stroke="#2a1a10" stroke-width="2"/>',
    nuke: '<circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M12 9.8L9.2 4.6a8 8 0 015.6 0zM14 13.1l5.9.4a8 8 0 01-2.8 4.8zM10 13.1l-3.1 5.2a8 8 0 01-2.8-4.8z" fill="currentColor" stroke="none"/>',
    napalm: '<path d="M12 3c1.5 3.4 5.5 5.6 5.5 10.2A5.5 5.5 0 016.5 13.2c0-2.4 1.3-3.8 2.4-5 .1 1.9.9 3 2 3.5C10.5 8.4 11 5.6 12 3z" fill="currentColor" stroke="none"/>',
    roller: '<circle cx="12" cy="12" r="6.5"/><path d="M12 5.5v13M5.5 12h13" opacity=".6"/><path d="M3 20.5h18"/>',
    bouncer: '<circle cx="18" cy="6" r="2.6" fill="currentColor" stroke="none"/><path d="M3 20c1.8-7 3.6-7 5.4 0 1.5-5 3-5 4.5 0 1.2-3.2 2.4-3.2 3.6 0"/>',
    mirv: '<circle cx="12" cy="6" r="2.6" fill="currentColor" stroke="none"/><path d="M12 8.6L5 19M12 8.6L9 20M12 8.6l3 11.4M12 8.6L19 19"/>',
    homing: '<circle cx="17.5" cy="16" r="3.2"/><circle cx="17.5" cy="16" r=".9" fill="currentColor" stroke="none"/><path d="M3 19c0-7.5 4-12 9.5-12.5"/><path d="M10.4 4.6l2.3 1.9-1.8 2.3"/>',
    railgun: '<path d="M3 12h13"/><path d="M16 8.5l5 3.5-5 3.5z" fill="currentColor" stroke="none"/><path d="M4 8.5h6M4 15.5h6" opacity=".55"/>',
    airstrike: '<path d="M4 5h16" opacity=".6"/><path d="M7 9v5M12 8v7M17 9v5"/><circle cx="7" cy="17" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="18.4" r="1.6" fill="currentColor" stroke="none"/><circle cx="17" cy="17" r="1.6" fill="currentColor" stroke="none"/>',
    chain: '<circle cx="5" cy="15" r="2.4" fill="currentColor" stroke="none"/><circle cx="10.5" cy="13" r="2.4" fill="currentColor" stroke="none"/><circle cx="16" cy="11" r="2.4" fill="currentColor" stroke="none"/><circle cx="21" cy="9" r="1.7" fill="currentColor" stroke="none"/>',
    quake: '<path d="M2.5 16h4l2-5 3 8 2.5-11 2.5 8h5"/>',
  };
  const wIcon = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${WICON[k] || WICON.shell}</svg>`;

  // four maps, picked per match from the seed (same map on both phones)
  const THEMES = [
    { id: 'dusk', name: 'Dusk Ridge', sky: ['#05071a', '#140f3a', '#35194f', '#5a2346'], haze: '90,35,70',
      mtn: ['#1c1546', '#130f33'], soil: ['#2c2168', '#171039', '#08061a'], strata: '140,110,255',
      rim: '#7dffd2', glow: '#5ef2c0', grass: '#7dffd2', chunk: ['#3b2d7a', '#5b3fa6', '#8dffd6'], body: 'planet', weather: 'streaks' },
    { id: 'desert', name: 'Sunset Dunes', sky: ['#1b0f30', '#5c2a4c', '#c65a3c', '#f4a562'], haze: '240,150,95',
      mtn: ['#7a3a44', '#55263a'], soil: ['#b0683a', '#6e3620', '#2a120a'], strata: '255,200,150',
      rim: '#ffd9a0', glow: '#ffb468', grass: '#f6c778', chunk: ['#8a4a2a', '#c07040', '#ffd9a0'], body: 'sun', weather: 'dust' },
    { id: 'arctic', name: 'Arctic Night', sky: ['#020814', '#0a1a3a', '#12305a', '#2a5a7a'], haze: '120,170,210',
      mtn: ['#1d3556', '#12233e'], soil: ['#e6efff', '#94afd6', '#2a3a5c'], strata: '255,255,255',
      rim: '#ffffff', glow: '#9fe8ff', grass: '#c8f4ff', chunk: ['#ffffff', '#b8cff0', '#7da0cf'], body: 'moon', aurora: true, weather: 'snow' },
    { id: 'toxic', name: 'Toxic Marsh', sky: ['#020a08', '#08241a', '#16422a', '#355f28'], haze: '90,160,70',
      mtn: ['#10301c', '#0a1d11'], soil: ['#34481e', '#1a2710', '#070b04'], strata: '160,255,120',
      rim: '#c6ff4a', glow: '#8aff2a', grass: '#b6ff3a', chunk: ['#2c3a18', '#4a6a24', '#c6ff4a'], body: 'greenmoon', weather: 'spores' },
  ];

  /* ---------------- pure logic (must agree on both phones) ---------------- */
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
  // this match's arsenal: Shell + 9 drawn from the other 15 (seeded, so the host decides it once)
  function draft(seed) {
    const r = rng((seed ^ 0x5bd1e995) >>> 0), rest = POOL.filter(k => k !== 'shell');
    for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const x = rest[i]; rest[i] = rest[j]; rest[j] = x; }
    const pick = ['shell'].concat(rest.slice(0, DRAFT - 1));
    return POOL.filter(k => pick.includes(k));
  }
  const arsenalOf = st => (Array.isArray(st.arsenal) && st.arsenal.length ? st.arsenal : LEGACY);
  const shotsOf = st => arsenalOf(st).length;
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
  function cols(cx, r) { return [Math.max(0, Math.floor((cx - r) / STEP)), Math.min(COLS - 1, Math.ceil((cx + r) / STEP))]; }
  function carve(t, cx, cy, r) {                 // dirt above the hole collapses into it
    const [i0, i1] = cols(cx, r);
    for (let i = i0; i <= i1; i++) {
      const dx = i * STEP - cx; if (Math.abs(dx) >= r) continue;
      const half = Math.sqrt(r * r - dx * dx);
      const gone = Math.max(0, Math.min(cy + half, VH) - Math.max(cy - half, t[i]));
      t[i] = Math.min(VH - 4, t[i] + gone);
    }
  }
  function addDirt(t, cx, r) {
    const [i0, i1] = cols(cx, r);
    for (let i = i0; i <= i1; i++) {
      const dx = i * STEP - cx; if (Math.abs(dx) >= r) continue;
      t[i] = Math.max(SKY_MIN, t[i] - Math.sqrt(r * r - dx * dx) * 1.6);
    }
  }
  function quakeGround(t, cx, R) {               // a wide, shallow slump
    const [i0, i1] = cols(cx, R);
    for (let i = i0; i <= i1; i++) {
      const d = (i * STEP - cx) / R; if (Math.abs(d) >= 1) continue;
      t[i] = Math.min(VH - 4, t[i] + QUAKE_DEPTH * (1 - d * d));
    }
  }
  // One projectile. o: { noWind, grav, homing:{x,y}, apex } · seat skips its own tank for a few
  // steps so a shell can't clip the barrel it just left (-1 = bomblet, hits anything).
  function flightV(t, tanks, seat, x, y, vx, vy, wind, o, maxSteps) {
    o = o || {};
    const grav = o.grav === undefined ? GRAV : o.grav, rising = vy < 0;
    const pts = [[x, y]], dt = 1 / 120, poses = tanks.map(tk => tankPose(t, tk.x)), lim = maxSteps || 1800;
    for (let i = 0; i < lim; i++) {
      if (!o.noWind) vx += wind * WIND_K * dt;
      if (o.homing && vy > 0 && i > 20) {                          // steer on the way down
        vx += Math.max(-1500, Math.min(1500, (o.homing.x - x) * 3.4)) * dt;
        vx = Math.max(-800, Math.min(800, vx));
      }
      vy += grav * dt; x += vx * dt; y += vy * dt;
      pts.push([x, y]);
      if (o.apex && rising && vy >= 0) return { pts, hit: null, apex: { x, y }, v: [vx, vy] };
      if (x < -60 || x > VW + 60 || y > VH + 60 || y < -900) return { pts, hit: null, v: [vx, vy] };
      for (let k = 0; k < 2; k++) {
        if (k === seat && i < 14) continue;
        if (Math.hypot(x - poses[k].cx, y - poses[k].cy) < TANK_R) return { pts, hit: { x, y, tank: k }, v: [vx, vy] };
      }
      if (!o.pierce && x >= 0 && x <= VW && y >= surfaceAt(t, x)) return { pts, hit: { x, y: surfaceAt(t, x) }, v: [vx, vy] };
    }
    return { pts, hit: null, v: [vx, vy] };
  }
  const flight = (t, tanks, seat, x, y, ang, spd, wind, o, maxSteps) =>
    flightV(t, tanks, seat, x, y, Math.cos(ang) * spd, Math.sin(ang) * spd, wind, o, maxSteps);
  // a Roller rolls downhill along the surface until the ground rises, or it reaches a tank
  function rollPath(t, tanks, x0, dir) {
    const l = surfaceAt(t, x0 - 6), r = surfaceAt(t, x0 + 6);
    const d = r > l + .3 ? 1 : (l > r + .3 ? -1 : dir);        // larger y = lower ground
    const poses = tanks.map(tk => tankPose(t, tk.x)), pts = [];
    let x = x0;
    for (let i = 0; i < 520; i++) {
      const nx = x + d * 2.5;
      if (nx < 2 || nx > VW - 2) break;
      if (surfaceAt(t, nx) < surfaceAt(t, x) - .6) break;     // ground rises → it settles here
      x = nx; const y = surfaceAt(t, x);
      pts.push([x, y - 6]);
      if (poses.some(p => Math.hypot(x - p.cx, y - 8 - p.cy) < TANK_R)) break;
    }
    if (!pts.length) pts.push([x, surfaceAt(t, x) - 6]);
    return { pts, end: { x, y: surfaceAt(t, x) } };
  }
  function muzzle(t, x, ang) {
    const p = tankPose(t, x);
    return { x: p.px + Math.cos(ang) * (BARREL + 3), y: p.py + Math.sin(ang) * (BARREL + 3) };
  }
  // The whole shot, resolved. Pure: same inputs → same terrain, same points.
  function resolveShot(st, seat, wk, ang, pow) {
    const W = WEAPONS[wk] || WEAPONS.shell, wind = st.wind, t = st.terrain.slice(), tanks = st.tanks;
    const spd = Math.min(MAX_POW, pow) * (W.speed || 1), o = muzzle(t, tanks[seat].x, ang);
    const foe = tankPose(t, tanks[1 - seat].x);
    const opt = { noWind: !!W.noWind, grav: W.straight ? 0 : GRAV, pierce: !!W.pierce, homing: W.homing ? { x: foe.cx, y: foe.cy } : null, apex: !!W.mirv };
    const flights = [], booms = [], pending = [], gain = [0, 0];
    const mk = (tt, p, r, max, extra) => Object.assign({ t: tt, x: p.x, y: p.y, r, max, fx: W.fx || 'blast' }, extra || {});
    (W.spread ? [ang - W.spread, ang, ang + W.spread] : [ang]).forEach(a => {
      const f = flight(t, tanks, seat, o.x, o.y, a, spd, wind, opt, W.straight ? 600 : 1800);
      flights.push({ pts: f.pts, t0: 0, col: W.col, kind: W.straight ? 'beam' : 'shell' });
      const T0 = f.pts.length, dir = Math.sign(f.v[0]) || (seat === 0 ? 1 : -1);
      if (f.apex) {                                                 // MIRV splits at the top of its arc
        for (let k = 0; k < W.mirv; k++) {
          const g = flightV(t, tanks, -1, f.apex.x, f.apex.y, f.v[0] + (k - (W.mirv - 1) / 2) * 75, f.v[1], wind, {});
          flights.push({ pts: g.pts, t0: T0, col: W.col, small: true });
          if (g.hit) pending.push(mk(T0 + g.pts.length, g.hit, W.kidR, W.kidMax));
        }
        return;
      }
      if (!f.hit) return;
      if (W.mirv) { pending.push(mk(T0, f.hit, W.kidR, W.kidMax)); return; }        // hit before it could split
      if (W.roll) { pending.push(f.hit.tank != null ? mk(T0, f.hit, W.rollR, W.rollMax) : mk(T0, f.hit, 0, 0, { roll: dir, fx: 'none' })); return; }
      pending.push(mk(T0, f.hit, W.r, W.max, {
        dirt: !!W.dirt, cluster: !!W.kids, bounce: W.bounces || 0, v: f.v, burn: !!W.burn,
        air: !!W.air, chain: W.chain || 0, dir, quake: !!W.quake, fx: W.air ? 'flare' : (W.fx || 'blast'),
      }));
    });
    let guard = 0;
    while (pending.length && guard++ < 200) {
      pending.sort((a, b) => a.t - b.t);
      const b = pending.shift();
      b.hits = [];
      const hurt = (k, pts) => { if (pts > 0) { gain[1 - k] += pts; b.hits.push({ victim: k, pts }); } };   // own goal → points to them
      if (b.quake) {
        for (let k = 0; k < 2; k++) { const dx = Math.abs(tankPose(t, tanks[k].x).cx - b.x); hurt(k, dx < QUAKE_R ? Math.round(QUAKE_MAX * (1 - dx / QUAKE_R)) : 0); }
        quakeGround(t, b.x, QUAKE_R); b.fx = 'quake'; b.r = QUAKE_R;
      } else if (b.dirt) { addDirt(t, b.x, b.r); b.fx = 'dirt'; }
      else if (b.r > 0) {
        for (let k = 0; k < 2; k++) {                              // damage measured before the ground drops
          const p = tankPose(t, tanks[k].x), f = 1 - Math.hypot(b.x - p.cx, b.y - p.cy) / (b.r + TANK_R);
          hurt(k, f > 0 ? Math.round(b.max * f) : 0);
        }
        carve(t, b.x, b.y, b.r);
      }
      booms.push(b);
      if (b.cluster) for (let k = 0; k < W.kids; k++) {
        const a = -Math.PI / 2 + (k - (W.kids - 1) / 2) * 0.42, f = flight(t, tanks, -1, b.x, b.y - 8, a, 300, wind, {});
        flights.push({ pts: f.pts, t0: b.t, col: W.col, small: true });
        if (f.hit) pending.push(mk(b.t + f.pts.length, f.hit, W.kidR, W.kidMax));
      }
      if (b.bounce > 0) {
        const g = flightV(t, tanks, -1, b.x, b.y - 6, b.v[0] * .72, -Math.abs(b.v[1]) * .58, wind, {});
        flights.push({ pts: g.pts, t0: b.t, col: W.col });
        if (g.hit) pending.push(mk(b.t + g.pts.length, g.hit, W.r, W.max, { bounce: b.bounce - 1, v: g.v }));
      }
      if (b.roll) {
        const rp = rollPath(t, tanks, b.x, b.roll);
        flights.push({ pts: rp.pts, t0: b.t, col: W.col, kind: 'roll' });
        pending.push(mk(b.t + rp.pts.length, rp.end, W.rollR, W.rollMax));
      }
      if (b.burn) for (let k = 1; k <= 3; k++) [-1, 1].forEach(s => {
        const x = b.x + s * k * 17;
        if (x > 0 && x < VW) pending.push(mk(b.t + k * 10, { x, y: surfaceAt(t, x) }, 15, 6, { fx: 'fire' }));
      });
      if (b.air) for (let k = 0; k < 5; k++) {
        const x = b.x + (k - 2) * 40, t0 = b.t + 24 + k * 7, g = flightV(t, tanks, -1, x, -40, wind * 20, 200, wind, {});
        flights.push({ pts: g.pts, t0, col: W.col, small: true, kind: 'bomb' });
        if (g.hit) pending.push(mk(t0 + g.pts.length, g.hit, 22, 12, { fx: 'blast' }));
      }
      if (b.chain > 0) {
        const x = b.x + b.dir * 34;
        if (x > 0 && x < VW) pending.push(mk(b.t + 10, { x, y: surfaceAt(t, x) }, W.r, W.max, { chain: b.chain - 1, dir: b.dir }));
      }
    }
    return { terrain: t.map(v => Math.round(v * 10) / 10), gain, flights, booms };
  }
  const rollWind = () => Math.round((Math.random() * 2 - 1) * 100) / 100;
  const freshUsed = keys => keys.reduce((o, k) => (o[k] = false, o), {});
  const winnerOf = s => s.score[0] === s.score[1] ? 'draw' : (s.score[0] > s.score[1] ? 0 : 1);
  const allFired = s => s.fired[0] >= shotsOf(s) && s.fired[1] >= shotsOf(s);
  // elevation (0–180, 90 = straight up) ↔ barrel angle, mirrored per side
  const toElev = (seat, ang) => Math.round(seat === 0 ? -ang * 180 / Math.PI : 180 + ang * 180 / Math.PI);
  const fromElev = (seat, e) => (seat === 0 ? -e : -(180 - e)) * Math.PI / 180;
  // aim may dip 20° below the horizon on either side — a Railgun has to, when the target sits lower
  const AIM_MIN = -20, AIM_MAX = 200;
  const shownElev = (seat, ang) => { let e = toElev(seat, ang); if (e > 260) e -= 360; if (e < -100) e += 360; return e; };
  function clampAim(seat, ang) {
    let e = seat === 0 ? -ang * 180 / Math.PI : 180 + ang * 180 / Math.PI;
    if (e > 260) e -= 360; if (e < -100) e += 360;
    return fromElev(seat, Math.max(AIM_MIN, Math.min(AIM_MAX, e)));
  }

  /* ---------------- module-level scene (survives repaints) ---------------- */
  const S = {
    cv: null, g: null, seed: null, ctx: null, raf: 0,
    W: 0, H: 0, dpr: 1, scale: 1, layers: null, layerKey: '', grain: null, vignette: null, vigKey: '',
    theme: THEMES[0], cam: { x: VW / 2, y: VH / 2, z: 1 }, sx: 0, sy: 0,
    aim: [{ ang: fromElev(0, 50), pow: 600 }, { ang: fromElev(1, 50), pow: 600 }],
    barrel: [fromElev(0, 50), fromElev(1, 50)], recoil: [0, 0],
    sel: [null, null], tx: HOME.slice(), shownT: null,
    anim: null, doneId: 0, parts: [], floats: [], wx: [], tufts: [], scorch: [],
    shake: 0, screenFlash: 0, flash: [0, 0], tick: 0, ui: null, drag: null,
    calm: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };

  function resetScene(st) {
    S.seed = st.seed; S.doneId = 0; S.anim = null; S.parts = []; S.floats = []; S.scorch = []; S.shake = 0; S.screenFlash = 0;
    S.theme = THEMES[Math.abs(st.seed) % THEMES.length];
    S.tx = st.tanks.map(t => t.x); S.shownT = st.terrain.slice(); S.layerKey = ''; S.vigKey = '';
    S.cam = { x: VW / 2, y: VH / 2, z: 1 };
    S.aim = [{ ang: fromElev(0, 50), pow: 600 }, { ang: fromElev(1, 50), pow: 600 }];
    S.barrel = [S.aim[0].ang, S.aim[1].ang]; S.recoil = [0, 0]; S.sel = [null, null];
    const r = rng((st.seed ^ 0x2545f491) >>> 0);
    S.tufts = []; for (let x = 6; x < VW; x += 9 + r() * 8) S.tufts.push({ x, h: 5 + r() * 7, ph: r() * 6.28 });
    S.wx = []; const kind = S.theme.weather, n = kind === 'snow' ? 90 : kind === 'spores' ? 34 : 46;
    for (let i = 0; i < n; i++) S.wx.push({ x: r() * VW, y: r() * VH, z: .4 + r() * .8, ph: r() * 6.28 });
    S.grain = null;
  }

  function ensureCanvas() {
    if (S.cv) return;
    S.cv = document.createElement('canvas'); S.cv.className = 'pt-cv';
    S.g = S.cv.getContext('2d');
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(S.cv);
    else window.addEventListener('resize', fit);
    // drag maps screen → world through the camera (it rests at full view while aiming)
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
      const me = S.ctx.me, ang = clampAim(me, Math.atan2(dy, dx));
      S.aim[me] = { ang, pow: Math.max(60, Math.min(MAX_POW, len * 3)) };
      syncReadout(); e.preventDefault();
    }, { passive: false });
    const end = () => { S.drag = null; };
    S.cv.addEventListener('pointerup', end); S.cv.addEventListener('pointercancel', end);
  }
  function canAct() { const c = S.ctx; return !!(c && c.isMyTurn && c.status === 'active' && !S.anim); }
  function fit() {
    if (!S.cv) return;
    const w = S.cv.clientWidth; if (!w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(w * VH / VW * dpr);
    S.cv.style.height = Math.round(w * VH / VW) + 'px';          // explicit height → no reflow wobble
    if (W === S.W && H === S.H) return;
    S.W = W; S.H = H; S.dpr = dpr; S.scale = w / VW;
    S.cv.width = W; S.cv.height = H; S.layerKey = ''; S.vigKey = '';
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
      S.anim = { id: L.id, seat: L.seat, w: L.w, wind: L.wind, res, clock: 0, bi: 0, end: end + 120,
        prevScore: L.prevScore || st.score, final: st.terrain.slice(), slowT: 0, bigT: 0, lastBoom: null, muzzled: false };
      S.shownT = L.prev.slice(); S.barrel[L.seat] = L.ang;
      if (L.seat !== S.ctx.me) { try { S.ctx.sound.place(); } catch (e) {} }
    }
    if (!S.anim) S.shownT = st.terrain.slice();
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function boom(b) {
    const T = S.shownT, th = S.theme, A = S.anim;
    const big = b.fx === 'nuke' || b.r >= 60;
    if (b.fx === 'quake') {
      quakeGround(T, b.x, QUAKE_R);
      for (let i = 0; i < 3; i++) S.parts.push({ k: 'gring', x: b.x, y: surfaceAt(T, b.x), r0: 20, r1: QUAKE_R * (1.1 + i * .35), life: 34 + i * 10, max: 34 + i * 10 });
      for (let i = 0; i < 40; i++) { const x = b.x + rnd(-QUAKE_R, QUAKE_R); S.parts.push({ k: 'dust', x, y: surfaceAt(T, x) - 2, vx: rnd(-20, 20), vy: rnd(-60, -15), r: rnd(6, 12), life: 70, max: 70, c: th.chunk[0] }); }
      for (let i = 0; i < 24; i++) { const x = b.x + rnd(-QUAKE_R * .8, QUAKE_R * .8); S.parts.push(chunk(x, surfaceAt(T, x), rnd(-120, 120), rnd(-320, -120), th)); }
      S.shake = Math.max(S.shake, 15);
    } else if (b.dirt) {
      addDirt(T, b.x, b.r);
      for (let i = 0; i < 46; i++) S.parts.push(chunk(b.x + rnd(-b.r, b.r) * .8, b.y, rnd(-150, 150), rnd(-460, -140), th, '#8a6a45'));
      for (let i = 0; i < 12; i++) S.parts.push({ k: 'dust', x: b.x + rnd(-b.r, b.r), y: b.y - rnd(0, 40), vx: rnd(-25, 25), vy: rnd(-40, -10), r: rnd(10, 20), life: 80, max: 80, c: '#8a6a45' });
      S.shake = Math.max(S.shake, 5);
    } else if (b.fx === 'none') {
      for (let i = 0; i < 6; i++) S.parts.push({ k: 'dust', x: b.x, y: b.y - 3, vx: rnd(-30, 30), vy: rnd(-30, -8), r: rnd(4, 8), life: 40, max: 40, c: th.chunk[0] });
    } else if (b.fx === 'flare') {
      S.parts.push({ k: 'light', x: b.x, y: b.y - 10, r: 90, life: 60, max: 60, c: '255,70,60' });
      S.parts.push({ k: 'ring', x: b.x, y: b.y, r0: 6, r1: 50, life: 20, max: 20 });
      for (let i = 0; i < 14; i++) S.parts.push({ k: 'ember', x: b.x, y: b.y - 4, vx: rnd(-80, 80), vy: rnd(-260, -80), life: 40, max: 40, s: rnd(1, 2) });
    } else if (b.fx === 'fire') {
      for (let i = 0; i < 4; i++) S.parts.push({ k: 'flame', x: b.x + rnd(-8, 8), y: b.y, h: rnd(14, 26), life: 130 + rnd(0, 60), max: 190, ph: rnd(0, 6.28) });
      S.parts.push({ k: 'light', x: b.x, y: b.y - 8, r: 70, life: 60, max: 60, c: '255,120,40' });
      carve(T, b.x, b.y, b.r); scorch(b.x, b.y, b.r * 1.4);
      S.shake = Math.max(S.shake, 2);
    } else {                                                        // blast / nuke
      const n = big ? 1.7 : 1;
      S.parts.push({ k: 'flash', x: b.x, y: b.y, r: b.r * 1.8 * n, life: 16, max: 16 });
      S.parts.push({ k: 'light', x: b.x, y: b.y - b.r * .3, r: b.r * 4.2 * n, life: 50, max: 50, c: '255,160,80' });
      S.parts.push({ k: 'ring', x: b.x, y: b.y, r0: b.r * .5, r1: b.r * 2.6 * n, life: 26, max: 26 });
      const fires = Math.round((5 + b.r / 8) * n);
      for (let i = 0; i < fires; i++) { const a = rnd(0, 6.28), d = rnd(0, b.r * .5); S.parts.push({ k: 'fire', x: b.x + Math.cos(a) * d, y: b.y - rnd(0, b.r * .5), vx: Math.cos(a) * rnd(20, 70), vy: -rnd(30, 110), r: rnd(b.r * .35, b.r * .7), life: rnd(22, 38), max: 38 }); }
      const chunks = Math.round((14 + b.r * .5) * n);
      for (let i = 0; i < chunks; i++) S.parts.push(chunk(b.x, b.y - 4, rnd(-1, 1) * 560 * (b.r / 34), -rnd(140, 480) * Math.min(1.8, b.r / 34), th));
      for (let i = 0; i < 18 * n; i++) { const a = rnd(0, 6.28), v = rnd(90, 360) * (b.r / 34); S.parts.push({ k: 'ember', x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: rnd(28, 56), max: 56, s: rnd(1, 2) }); }
      for (let i = 0; i < Math.round((5 + b.r / 12) * n); i++) S.parts.push({ k: 'smoke', x: b.x + rnd(-b.r, b.r) * .5, y: b.y - rnd(0, 16), vx: rnd(-15, 15) + A.wind * 26, vy: -rnd(14, 34), r: b.r * rnd(.3, .5), life: rnd(100, 150), max: 150 });
      if (b.fx === 'nuke') {
        S.parts.push({ k: 'mush', x: b.x, y: b.y, r: b.r, life: 210, max: 210 });
        S.screenFlash = 1;
      }
      carve(T, b.x, b.y, b.r); scorch(b.x, b.y, b.r * 1.35);
      S.shake = Math.max(S.shake, big ? 16 : 3 + b.r * .2);
      if (big && !S.calm) A.bigT = 30;
      try { if (navigator.vibrate) navigator.vibrate(big ? [60, 30, 90] : 18); } catch (e) {}
    }
    A.lastBoom = { x: b.x, y: b.y, at: A.clock, big };
    (b.hits || []).forEach(h => {
      const p = tankPose(T, S.tx[h.victim]);
      S.floats.push({ text: '+' + h.pts, x: p.cx, y: p.cy - 38, c: S.ctx.players[1 - h.victim].color, life: 90, max: 90 });
      S.flash[h.victim] = 14;
    });
  }
  function chunk(x, y, vx, vy, th, c) {
    return { k: 'chunk', x, y, vx, vy, life: rnd(70, 100), max: 100, s: rnd(1.8, 4.4), rot: rnd(0, 6.28), vr: rnd(-.3, .3), c: c || th.chunk[Math.floor(Math.random() * th.chunk.length)] };
  }
  function scorch(x, y, r) { S.scorch.push({ x, y, r }); if (S.scorch.length > 40) S.scorch.shift(); }
  function finishAnim() {
    const A = S.anim; S.anim = null; S.doneId = A.id; S.shownT = A.final.slice();
    const c = S.ctx; if (!c) return;
    const W = WEAPONS[A.w] || WEAPONS.shell, g = A.res.gain, sh = A.seat, nm = i => c.players[i].name;
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
  function heads(A) {
    const out = [];
    A.res.flights.forEach(f => { const i = Math.floor(A.clock - f.t0); if (i >= 0 && i < f.pts.length) out.push(f.pts[i]); });
    return out;
  }

  /* ---------------- per-frame simulation (cosmetic) ---------------- */
  function step() {
    S.tick++;
    const st = S.ctx && S.ctx.state; if (!st) return;
    for (let k = 0; k < 2; k++) S.tx[k] += (st.tanks[k].x - S.tx[k]) * .16;
    const A = S.anim, T = S.shownT, dt = 1 / 60;
    if (A) {
      if (!A.muzzled) {                                           // muzzle flash + recoil as it leaves the barrel
        A.muzzled = true; S.recoil[A.seat] = 12;
        const m = muzzle(T, S.tx[A.seat], S.barrel[A.seat]);
        S.parts.push({ k: 'flash', x: m.x, y: m.y, r: 30, life: 8, max: 8 });
        for (let i = 0; i < 6; i++) S.parts.push({ k: 'smoke', x: m.x, y: m.y, vx: rnd(-20, 20), vy: -rnd(8, 20), r: rnd(5, 9), life: 60, max: 60 });
      }
      // slow motion as a live shell closes on a tank, and after a big hit
      const hs = heads(A), poses = [0, 1].map(k => tankPose(T, S.tx[k]));
      const close = hs.some(h => poses.some((p, k) => (k !== A.seat || A.clock > 40) && Math.hypot(h[0] - p.cx, h[1] - p.cy) < 95));
      A.slowT = close ? 14 : Math.max(0, A.slowT - 1);
      if (A.bigT > 0) A.bigT--;
      const rate = S.calm ? 2 : (A.bigT > 0 ? .45 : A.slowT > 0 ? .8 : 2);
      A.clock += rate;
      while (A.bi < A.res.booms.length && A.res.booms[A.bi].t <= A.clock) boom(A.res.booms[A.bi++]);
      if (S.tick % 2 === 0) hs.forEach(h => { if (S.parts.length < 900) S.parts.push({ k: 'trail', x: h[0], y: h[1], vx: A.wind * 18, vy: -5, r: 2, life: 46, max: 46 }); });
      if (A.clock >= A.end) finishAnim();
    }
    // camera: follow the shell, push in on impacts, rest at full view
    let tg = { x: VW / 2, y: VH / 2, z: 1 };
    if (S.anim && !S.calm) {
      const B = S.anim, hs = heads(B);
      if (hs.length) {
        const mx = hs.reduce((a, h) => a + h[0], 0) / hs.length, my = hs.reduce((a, h) => a + h[1], 0) / hs.length;
        tg = { x: mx, y: Math.max(my, 170), z: B.bigT > 0 ? 1.5 : (B.slowT > 0 ? 1.42 : 1.2) };
      } else if (B.lastBoom && B.clock - B.lastBoom.at < 80) tg = { x: B.lastBoom.x, y: B.lastBoom.y - 40, z: B.lastBoom.big ? 1.32 : 1.26 };
    }
    const c = S.cam, ease = S.anim ? .075 : .06;
    c.z += (tg.z - c.z) * ease; c.x += (tg.x - c.x) * ease; c.y += (tg.y - c.y) * ease;
    const hw = VW / (2 * c.z), hh = VH / (2 * c.z);
    c.x = Math.max(hw, Math.min(VW - hw, c.x)); c.y = Math.max(hh, Math.min(VH - hh, c.y));
    // particles
    S.parts = S.parts.filter(p => {
      p.life--;
      if (p.k === 'chunk' || p.k === 'ember') {
        p.vy += (p.k === 'chunk' ? 760 : 380) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.rot !== undefined) p.rot += p.vr;
        if (p.k === 'chunk' && T && p.y >= surfaceAt(T, p.x)) { p.y = surfaceAt(T, p.x); p.vy *= -.22; p.vx *= .5; p.vr *= .5; }
      } else if (p.k === 'smoke' || p.k === 'dust' || p.k === 'trail') { p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.k === 'trail' ? .16 : .45; }
      else if (p.k === 'fire') { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 40 * dt; p.r *= .985; }
      return p.life > 0;
    });
    S.floats = S.floats.filter(f => (f.y -= .7, --f.life > 0));
    S.shake *= .86; if (S.shake < .2) S.shake = 0;
    S.screenFlash = Math.max(0, S.screenFlash - .045);
    S.flash = S.flash.map(v => Math.max(0, v - 1));
    S.recoil = S.recoil.map(v => Math.max(0, v - 1));
    const sh = S.calm ? 0 : S.shake; S.sx = sh ? (Math.random() - .5) * sh * 2 : 0; S.sy = sh ? (Math.random() - .5) * sh * 2 : 0;
    // weather, pushed by the wind
    const wind = A ? A.wind : st.wind, kind = S.theme.weather;
    S.wx.forEach(d => {
      if (kind === 'snow') { d.x += (wind * 60 + Math.sin(S.tick * .03 + d.ph) * 12) * d.z * dt; d.y += 28 * d.z * dt; }
      else if (kind === 'spores') { d.x += (wind * 30) * d.z * dt; d.y -= 9 * d.z * dt; }
      else d.x += (wind * 70 + 6) * d.z * dt * 2;
      if (d.x > VW + 10) d.x = -10; if (d.x < -10) d.x = VW + 10; if (d.y > VH + 10) d.y = -10; if (d.y < -10) d.y = VH + 10;
    });
    // the loser's tank keeps smouldering once it's over
    if (S.ctx.status === 'finished' && S.tick % 9 === 0) {
      const w = winnerOf(st);
      if (w === 0 || w === 1) { const p = tankPose(T, S.tx[1 - w]); S.parts.push({ k: 'smoke', x: p.cx + rnd(-5, 5), y: p.cy - 8, vx: wind * 24, vy: -22, r: 6, life: 90, max: 90 }); }
    }
  }

  /* ---------------- drawing ---------------- */
  function buildLayers() {
    const th = S.theme, mk = () => { const c = document.createElement('canvas'); c.width = S.W; c.height = S.H; const g = c.getContext('2d'); g.setTransform(S.dpr * S.scale, 0, 0, S.dpr * S.scale, 0, 0); return [c, g]; };
    const [sky, b] = mk();
    const grad = b.createLinearGradient(0, 0, 0, VH);
    th.sky.forEach((col, i) => grad.addColorStop(i / (th.sky.length - 1), col));
    b.fillStyle = grad; b.fillRect(0, 0, VW, VH);
    [[720, 150, 280, .17], [260, 250, 240, .09], [520, 420, 320, .1]].forEach(([x, y, r, a], i) => {
      const n = b.createRadialGradient(x, y, 0, x, y, r);
      n.addColorStop(0, i === 1 ? `rgba(47,230,255,${a})` : `rgba(${th.haze},${a})`); n.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = n; b.fillRect(0, 0, VW, VH);
    });
    const r = rng((S.seed ^ 0x9e3779b9) >>> 0), stars = th.id === 'desert' ? 50 : 170;
    for (let i = 0; i < stars; i++) {
      const x = r() * VW, y = r() * (th.id === 'desert' ? 200 : 430), s = r() < .12 ? 1.7 : .5 + r() * .9;
      b.fillStyle = `rgba(234,240,255,${.2 + r() * .6})`; b.beginPath(); b.arc(x, y, s, 0, 7); b.fill();
    }
    drawBody(b, th);
    const layer = (base, amp, col, seedOff, haze) => {
      const [c, g] = mk(), m = rng((S.seed + seedOff) >>> 0), ph = [m() * 6.28, m() * 6.28, m() * 6.28];
      const line = x => base - amp * (.55 + .45 * Math.sin(x * .006 + ph[0])) * (.6 + .4 * Math.sin(x * .021 + ph[1])) - 6 * Math.sin(x * .07 + ph[2]);
      g.beginPath(); g.moveTo(0, VH); for (let x = 0; x <= VW; x += 8) g.lineTo(x, line(x)); g.lineTo(VW, VH); g.closePath();
      g.fillStyle = col; g.fill();
      g.save(); g.clip();                                            // atmospheric haze pooling at the base
      const hz = g.createLinearGradient(0, base - amp, 0, VH);
      hz.addColorStop(0, `rgba(${th.haze},0)`); hz.addColorStop(1, `rgba(${th.haze},${haze})`);
      g.fillStyle = hz; g.fillRect(0, 0, VW, VH); g.restore();
      g.beginPath(); for (let x = 0; x <= VW; x += 8) x ? g.lineTo(x, line(x)) : g.moveTo(0, line(0));
      g.strokeStyle = `rgba(${th.haze},.35)`; g.lineWidth = 1.5; g.stroke();   // crest catches the light
      return c;
    };
    S.layers = { sky, far: layer(372, 80, th.mtn[0], 7919, .55), near: layer(432, 58, th.mtn[1], 15881, .35) };
    S.layerKey = S.seed + ':' + S.W;
  }
  function drawBody(b, th) {
    if (th.body === 'planet') {
      const px = 168, py = 112, pr = 42;
      const halo = b.createRadialGradient(px, py, pr * .6, px, py, pr * 2.7); halo.addColorStop(0, 'rgba(255,170,120,.22)'); halo.addColorStop(1, 'rgba(255,170,120,0)');
      b.fillStyle = halo; b.fillRect(0, 0, 420, 320);
      const ring = front => { b.save(); b.translate(px, py); b.rotate(-.32); b.beginPath(); b.ellipse(0, 0, pr * 1.85, pr * .34, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); b.strokeStyle = 'rgba(255,214,160,.62)'; b.lineWidth = 3.2; b.stroke(); b.strokeStyle = 'rgba(255,214,160,.22)'; b.lineWidth = 7; b.stroke(); b.restore(); };
      ring(false);
      const body = b.createRadialGradient(px - 14, py - 16, 4, px, py, pr);
      body.addColorStop(0, '#ffe2b0'); body.addColorStop(.45, '#e88b62'); body.addColorStop(1, '#5c2446');
      b.fillStyle = body; b.beginPath(); b.arc(px, py, pr, 0, 7); b.fill();
      b.save(); b.beginPath(); b.arc(px, py, pr, 0, 7); b.clip(); b.strokeStyle = 'rgba(92,36,70,.35)'; b.lineWidth = 5;
      [-14, 2, 16].forEach(dy => { b.beginPath(); b.ellipse(px, py + dy, pr * 1.1, 6, -.2, 0, 7); b.stroke(); }); b.restore();
      ring(true);
    } else if (th.body === 'sun') {
      const sx = 650, sy = 330, sr = 70;
      const halo = b.createRadialGradient(sx, sy, sr * .5, sx, sy, sr * 4.5); halo.addColorStop(0, 'rgba(255,210,140,.55)'); halo.addColorStop(1, 'rgba(255,150,90,0)');
      b.fillStyle = halo; b.fillRect(0, 0, VW, VH);
      const sun = b.createLinearGradient(0, sy - sr, 0, sy + sr); sun.addColorStop(0, '#fff3c4'); sun.addColorStop(1, '#ff8a4a');
      b.fillStyle = sun; b.beginPath(); b.arc(sx, sy, sr, 0, 7); b.fill();
      b.fillStyle = 'rgba(198,90,60,.55)'; [12, 26, 38, 48].forEach((dy, i) => b.fillRect(sx - sr, sy + dy, sr * 2, 3 + i));
    } else {
      const mx = th.body === 'moon' ? 800 : 220, my = 100, mr = 32, tint = th.body === 'moon' ? '220,235,255' : '190,255,140';
      const halo = b.createRadialGradient(mx, my, mr * .6, mx, my, mr * 3.4); halo.addColorStop(0, `rgba(${tint},.3)`); halo.addColorStop(1, `rgba(${tint},0)`);
      b.fillStyle = halo; b.fillRect(0, 0, VW, 360);
      const moon = b.createRadialGradient(mx - 9, my - 10, 3, mx, my, mr); moon.addColorStop(0, `rgba(${tint},1)`); moon.addColorStop(1, `rgba(${tint},.55)`);
      b.fillStyle = moon; b.beginPath(); b.arc(mx, my, mr, 0, 7); b.fill();
      b.fillStyle = 'rgba(0,0,0,.12)'; [[-8, 6, 7], [10, -6, 5], [6, 12, 4]].forEach(([dx, dy, rr2]) => { b.beginPath(); b.arc(mx + dx, my + dy, rr2, 0, 7); b.fill(); });
    }
  }
  // camera transform for a parallax layer: f=0 fixed sky … f=1 the battlefield itself
  function view(g, f) {
    const k = S.dpr * S.scale, c = S.cam, z = 1 + (c.z - 1) * f;
    const cx = VW / 2 + (c.x - VW / 2) * f, cy = VH / 2 + (c.y - VH / 2) * f;
    g.setTransform(k * z, 0, 0, k * z, k * (VW / 2 - z * cx + S.sx * f), k * (VH / 2 - z * cy + S.sy * f));
  }

  function draw() {
    const g = S.g, st = S.ctx && S.ctx.state; if (!g || !st || !S.shownT) return;
    if (!S.W) fit(); if (!S.W) return;
    if (S.layerKey !== S.seed + ':' + S.W) buildLayers();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(S.layers.sky, 0, 0);
    const th = S.theme, wind = S.anim ? S.anim.wind : st.wind;
    if (th.aurora) { view(g, .08); drawAurora(g); }
    view(g, .08);
    for (let i = 0; i < 9; i++) {                                  // twinkles
      const tw = .5 + .5 * Math.sin(S.tick * .05 + i * 1.7);
      g.fillStyle = `rgba(255,255,255,${.12 + tw * .5})`;
      g.beginPath(); g.arc((i * 137 + 60) % VW, (i * 71 + 30) % 330, .8 + tw * 1.1, 0, 7); g.fill();
    }
    view(g, .3); g.drawImage(S.layers.far, 0, 0, VW, VH);
    view(g, .55); g.drawImage(S.layers.near, 0, 0, VW, VH);
    view(g, 1);
    drawWeather(g, wind, false);
    drawTerrain(g);
    drawGrass(g, wind);
    for (let i = 0; i < 2; i++) drawTank(g, i);
    if (canAct() && S.sel[S.ctx.me]) drawAim(g);
    drawParts(g, false);
    drawFlights(g);
    drawParts(g, true);
    drawFloats(g);
    drawWeather(g, wind, true);
    // screen space: vignette, flash, HUD
    const k = S.dpr * S.scale;
    g.setTransform(k, 0, 0, k, 0, 0);
    if (S.vigKey !== S.W + '') { const v = g.createRadialGradient(VW / 2, VH / 2, VH * .35, VW / 2, VH / 2, VW * .72); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.42)'); S.vignette = v; S.vigKey = S.W + ''; }
    g.fillStyle = S.vignette; g.fillRect(0, 0, VW, VH);
    if (S.screenFlash > 0) { g.fillStyle = `rgba(255,244,225,${S.screenFlash * .85})`; g.fillRect(0, 0, VW, VH); }
    drawWind(g, wind);
  }

  function drawAurora(g) {
    g.save(); g.globalCompositeOperation = 'lighter';
    [['120,255,200', 0], ['140,160,255', 2.1], ['90,255,160', 4.2]].forEach(([col, off], i) => {
      g.beginPath();
      for (let x = -20; x <= VW + 20; x += 20) { const y = 90 + i * 34 + Math.sin(x * .006 + S.tick * .012 + off) * 26 + Math.sin(x * .017 + off) * 10; x < -10 ? g.moveTo(x, y) : g.lineTo(x, y); }
      for (let x = VW + 20; x >= -20; x -= 20) { const y = 170 + i * 34 + Math.sin(x * .006 + S.tick * .012 + off) * 26; g.lineTo(x, y); }
      g.closePath();
      const gr = g.createLinearGradient(0, 70 + i * 34, 0, 190 + i * 34);
      gr.addColorStop(0, `rgba(${col},.2)`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fill();
    });
    g.restore();
  }

  function drawWeather(g, wind, front) {
    const kind = S.theme.weather;
    S.wx.forEach((d, i) => {
      if ((d.z > .8) !== front) return;                              // big flakes pass in FRONT of the battle
      if (kind === 'snow') { g.fillStyle = `rgba(255,255,255,${.35 + d.z * .45})`; g.beginPath(); g.arc(d.x, d.y, 1 + d.z * 1.6, 0, 7); g.fill(); }
      else if (kind === 'spores') { const a = .3 + .3 * Math.sin(S.tick * .06 + d.ph); g.fillStyle = `rgba(190,255,90,${a})`; g.beginPath(); g.arc(d.x, d.y, 1.2 + d.z * 1.4, 0, 7); g.fill(); }
      else {
        g.strokeStyle = kind === 'dust' ? `rgba(255,210,150,${.12 + d.z * .12})` : `rgba(200,215,255,${.1 + d.z * .1})`; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - (wind * 14 + 2) * d.z, d.y); g.stroke();
      }
    });
  }

  function terrainPath(g, t) {
    g.beginPath(); g.moveTo(-40, VH + 40); g.lineTo(-40, t[0]); g.lineTo(0, t[0]);
    for (let i = 1; i < COLS; i++) g.lineTo(i * STEP, t[i]);
    g.lineTo(VW + 40, t[COLS - 1]); g.lineTo(VW + 40, VH + 40); g.closePath();
  }
  function surfaceLine(g, t, dy) {
    g.beginPath(); g.moveTo(-40, t[0] + dy); for (let i = 0; i < COLS; i++) g.lineTo(i * STEP, t[i] + dy); g.lineTo(VW + 40, t[COLS - 1] + dy);
  }
  function drawTerrain(g) {
    const t = S.shownT, th = S.theme;
    let top = VH; for (let i = 0; i < COLS; i++) top = Math.min(top, t[i]);
    terrainPath(g, t);
    const fill = g.createLinearGradient(0, top, 0, VH);
    fill.addColorStop(0, th.soil[0]); fill.addColorStop(.45, th.soil[1]); fill.addColorStop(1, th.soil[2]);
    g.fillStyle = fill; g.fill();
    g.save(); terrainPath(g, t); g.clip();
    if (!S.grain) {                                                 // rock texture tile, tinted per map
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), r = rng(S.seed >>> 0);
      for (let i = 0; i < 260; i++) { x.fillStyle = r() < .5 ? `rgba(0,0,0,${.1 + r() * .18})` : `rgba(${th.strata},${.05 + r() * .09})`; x.fillRect(r() * 64, r() * 64, 1 + r() * 2.2, 1 + r() * 2.2); }
      S.grain = g.createPattern(c, 'repeat');
    }
    g.fillStyle = S.grain; g.fillRect(-40, top - 10, VW + 80, VH - top + 60);
    for (let s = 1; s <= 5; s++) {                                   // strata that follow the surface
      g.beginPath();
      for (let i = 0; i < COLS; i++) { const y = t[i] + s * 21 + Math.sin(i * .21 + s) * 3; i ? g.lineTo(i * STEP, y) : g.moveTo(0, y); }
      g.strokeStyle = `rgba(${th.strata},${.13 - s * .02})`; g.lineWidth = 5; g.stroke();
    }
    S.scorch.forEach(s => {                                          // blast scars stay on the ground
      const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      gr.addColorStop(0, 'rgba(8,5,10,.62)'); gr.addColorStop(.6, 'rgba(8,5,10,.28)'); gr.addColorStop(1, 'rgba(8,5,10,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
    });
    // a lit lip under the surface gives the ground thickness
    surfaceLine(g, t, 7); g.strokeStyle = `rgba(${th.strata},.10)`; g.lineWidth = 16; g.lineJoin = 'round'; g.stroke();
    surfaceLine(g, t, 3); g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 6; g.stroke();
    // shading at the base (ambient occlusion)
    const ao = g.createLinearGradient(0, VH - 90, 0, VH); ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = ao; g.fillRect(-40, VH - 90, VW + 80, 130);
    g.restore();
    surfaceLine(g, t, 0);
    g.save(); g.shadowColor = th.glow; g.shadowBlur = 16; g.strokeStyle = th.rim; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1; g.stroke();
  }
  function drawGrass(g, wind) {
    const t = S.shownT, th = S.theme;
    g.strokeStyle = hexA(th.grass, .55); g.lineWidth = 1.3; g.lineCap = 'round';
    g.beginPath();
    S.tufts.forEach(tf => {
      if (S.scorch.some(s => Math.abs(s.x - tf.x) < s.r * .8)) return;   // burnt away
      const y = surfaceAt(t, tf.x), sway = Math.sin(S.tick * .045 + tf.ph) * .18 + wind * .45;
      for (let b = -1; b <= 1; b++) {
        const h = tf.h * (b ? .7 : 1), x0 = tf.x + b * 2.2;
        g.moveTo(x0, y); g.quadraticCurveTo(x0 + sway * h * .4, y - h * .6, x0 + sway * h + b * 1.5, y - h);
      }
    });
    g.stroke();
  }

  function drawTank(g, i) {
    const c = S.ctx, st = c.state, col = c.players[i].color, p = tankPose(S.shownT, S.tx[i]);
    const hit = S.flash[i] > 0 && S.flash[i] % 4 < 2;
    let ang = S.barrel[i];
    if (i === c.me && canAct()) ang = S.aim[i].ang;
    S.barrel[i] = ang;
    // ground shadow (light falls from the upper left)
    g.fillStyle = 'rgba(0,0,0,.38)';
    g.beginPath(); g.ellipse(p.x + 7, p.y + 1.5, 36, 5.5, p.tilt, 0, 7); g.fill();
    g.save(); g.translate(p.x, p.y);
    const glow = g.createRadialGradient(0, -8, 2, 0, -8, 52);
    glow.addColorStop(0, hexA(col, .34)); glow.addColorStop(1, hexA(col, 0));
    g.fillStyle = glow; g.fillRect(-56, -60, 112, 76);
    g.rotate(p.tilt);
    if (S.flash[i]) g.translate((Math.random() - .5) * 3, (Math.random() - .5) * 2);
    // treads with moving links
    rr(g, -31, -13, 62, 14, 7); g.fillStyle = '#0f1220'; g.fill();
    g.save(); rr(g, -31, -13, 62, 14, 7); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1.4;
    const off = ((S.tx[i] * 1.3) % 5 + 5) % 5;
    g.beginPath(); for (let x = -36 + off; x < 36; x += 5) { g.moveTo(x, -13); g.lineTo(x, 1); } g.stroke();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1.2; rr(g, -31, -13, 62, 14, 7); g.stroke();
    const spin = S.tx[i] / 4.6;
    for (const wx of [-22, -11, 0, 11, 22]) {
      g.fillStyle = '#262c4a'; g.beginPath(); g.arc(wx, -6, 4.6, 0, 7); g.fill();
      g.strokeStyle = '#7883b4'; g.lineWidth = 1.1; g.beginPath();
      for (let s = 0; s < 3; s++) { const a = spin + s * 2.094; g.moveTo(wx, -6); g.lineTo(wx + Math.cos(a) * 3.8, -6 + Math.sin(a) * 3.8); }
      g.stroke();
    }
    // hull
    const hull = g.createLinearGradient(0, -25, 0, -12);
    hull.addColorStop(0, hit ? '#ffffff' : lighten(col, .5)); hull.addColorStop(.55, hit ? '#ffe8e8' : col); hull.addColorStop(1, hit ? '#ffd0d0' : darken(col, .35));
    g.beginPath(); g.moveTo(-26, -12); g.lineTo(26, -12); g.lineTo(18, -24); g.lineTo(-18, -24); g.closePath();
    g.save(); g.shadowColor = col; g.shadowBlur = 12; g.fillStyle = hull; g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-18, -24); g.lineTo(18, -24); g.moveTo(-26, -12); g.lineTo(-18, -24); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-21, -17); g.lineTo(21, -17); g.stroke();
    // turret dome with a specular highlight + hatch
    const dome = g.createRadialGradient(-4, -29, 1, 0, -24, 12);
    dome.addColorStop(0, hit ? '#ffffff' : lighten(col, .7)); dome.addColorStop(1, hit ? '#ffd0d0' : darken(col, .3));
    g.fillStyle = dome; g.beginPath(); g.arc(0, -24, 10.5, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(-4, -30, 3.2, 1.6, -.4, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1; g.beginPath(); g.arc(3, -28, 2.4, 0, 7); g.stroke();
    // antenna + a flag that flies with the wind
    const wind = S.anim ? S.anim.wind : st.wind, wave = Math.sin(S.tick * .22 + i * 2) * 2.2;
    g.strokeStyle = 'rgba(220,230,255,.7)'; g.lineWidth = 1.1; g.beginPath(); g.moveTo(-12, -24); g.lineTo(-14, -44); g.stroke();
    const fl = 11 * (wind >= 0 ? 1 : -1) * (.55 + Math.min(1, Math.abs(wind)) * .45);
    g.fillStyle = col; g.beginPath(); g.moveTo(-14, -44); g.quadraticCurveTo(-14 + fl * .5, -44 + wave, -14 + fl, -42); g.lineTo(-14, -38); g.closePath(); g.fill();
    g.restore();
    // barrel (world-aligned so the aim reads true regardless of tilt), with recoil
    const rc = S.recoil[i] / 12 * 7, ca = Math.cos(ang), sa = Math.sin(ang);
    const x0 = p.px - ca * rc, y0 = p.py - sa * rc, bx = p.px + ca * (BARREL - rc), by = p.py + sa * (BARREL - rc);
    g.lineCap = 'round';
    g.strokeStyle = '#161a2e'; g.lineWidth = 9; g.beginPath(); g.moveTo(x0, y0); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = lighten(col, .3); g.lineWidth = 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x0 - sa * 1.3, y0 + ca * 1.3); g.lineTo(bx - sa * 1.3, by + ca * 1.3); g.stroke();
    g.fillStyle = '#dfe6ff'; g.beginPath(); g.arc(bx, by, 3.3, 0, 7); g.fill();
    // name + whose-turn chevron
    g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.font = '700 15px "Chakra Petch", system-ui, sans-serif';
    g.fillStyle = 'rgba(5,7,15,.6)'; g.fillText(c.players[i].name, p.x + 1, p.y - 51);
    g.fillStyle = col; g.fillText(c.players[i].name, p.x, p.y - 52);
    if (st.turn === i && c.status === 'active' && !S.anim) {
      const bob = Math.sin(S.tick * .12) * 3;
      g.fillStyle = col; g.beginPath();
      g.moveTo(p.x - 7, p.y - 78 + bob); g.lineTo(p.x + 7, p.y - 78 + bob); g.lineTo(p.x, p.y - 69 + bob); g.closePath(); g.fill();
    }
  }

  function drawAim(g) {
    const c = S.ctx, me = c.me, st = c.state, W = WEAPONS[S.sel[me]] || WEAPONS.shell, a = S.aim[me];
    const o = muzzle(S.shownT, S.tx[me], a.ang);
    // only the opening slice — enough to read your angle, not enough to remove the skill
    const f = flight(S.shownT, st.tanks, me, o.x, o.y, a.ang, Math.min(MAX_POW, a.pow) * (W.speed || 1), st.wind,
      { noWind: !!W.noWind, grav: W.straight ? 0 : GRAV, pierce: !!W.pierce }, W.straight ? 12 : 46);
    for (let i = 4; i < f.pts.length; i += 4) {
      const al = 1 - i / f.pts.length;
      g.fillStyle = hexA(c.players[me].color, .25 + al * .6);
      g.beginPath(); g.arc(f.pts[i][0], f.pts[i][1], 2.6 + al * 1.4, 0, 7); g.fill();
    }
    const p = tankPose(S.shownT, S.tx[me]);                  // power ring
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 3;
    g.beginPath(); g.arc(p.px, p.py, 48, -Math.PI, 0); g.stroke();
    g.strokeStyle = W.col; g.lineWidth = 3.4;
    g.beginPath(); g.arc(p.px, p.py, 48, -Math.PI, -Math.PI + Math.PI * (a.pow / MAX_POW)); g.stroke();
  }

  function drawFlights(g) {
    const A = S.anim; if (!A) return;
    g.save(); g.globalCompositeOperation = 'lighter';
    A.res.flights.forEach(f => {
      const idx = Math.floor(A.clock - f.t0);
      if (f.kind === 'beam') {                                    // railgun: a bolt that lingers
        if (idx < 0 || idx > f.pts.length + 24) return;
        const end = f.pts[Math.min(idx, f.pts.length - 1)], s = f.pts[0], fade = idx >= f.pts.length ? 1 - (idx - f.pts.length) / 24 : 1;
        g.lineCap = 'round';
        g.strokeStyle = hexA(f.col, .25 * fade); g.lineWidth = 12; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(end[0], end[1]); g.stroke();
        g.strokeStyle = `rgba(255,255,255,${.95 * fade})`; g.lineWidth = 2.5; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(end[0], end[1]); g.stroke();
        return;
      }
      if (idx < 0 || idx >= f.pts.length) return;
      for (let j = Math.max(0, idx - 26); j < idx; j += 2) {
        const al = (j - idx + 26) / 26;
        g.fillStyle = hexA(f.col, al * .45);
        g.beginPath(); g.arc(f.pts[j][0], f.pts[j][1], (f.small ? 1.3 : 2) + al * (f.small ? 1.5 : 2.8), 0, 7); g.fill();
      }
      const h = f.pts[idx], q = f.pts[Math.max(0, idx - 2)], r = f.small ? 3 : 5.2;
      const gl = g.createRadialGradient(h[0], h[1], 0, h[0], h[1], r * 4.2);
      gl.addColorStop(0, 'rgba(255,255,255,.95)'); gl.addColorStop(.25, hexA(f.col, .9)); gl.addColorStop(1, hexA(f.col, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(h[0], h[1], r * 4.2, 0, 7); g.fill();
      g.save(); g.globalCompositeOperation = 'source-over';        // the shell itself, pointing where it flies
      g.translate(h[0], h[1]); g.rotate(Math.atan2(h[1] - q[1], h[0] - q[0]) + (f.kind === 'roll' ? A.clock * .3 : 0));
      if (f.kind === 'roll') { g.fillStyle = '#e9e4ff'; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); g.strokeStyle = f.col; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke(); }
      else { g.fillStyle = '#f3f5ff'; rr(g, -r * 1.2, -r * .55, r * 2.4, r * 1.1, r * .55); g.fill(); g.fillStyle = f.col; g.fillRect(-r * 1.2, -r * .55, r * .8, r * 1.1); }
      g.restore();
    });
    g.restore();
  }

  function drawParts(g, glow) {
    if (!glow) {
      S.parts.forEach(p => {
        const a = p.life / p.max;
        if (p.k === 'smoke') {
          const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          gr.addColorStop(0, `rgba(58,52,78,${a * .5})`); gr.addColorStop(1, 'rgba(58,52,78,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
        } else if (p.k === 'trail') { g.fillStyle = `rgba(200,205,225,${a * .22})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
        else if (p.k === 'dust') { g.fillStyle = hexA(p.c, a * .35); g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
        else if (p.k === 'chunk') {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot || 0); g.globalAlpha = Math.min(1, a * 1.6);
          g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .8); g.restore();
        } else if (p.k === 'mush') {                               // nuke: a billowing cap on a rising stem
          const age = 1 - a, grow = Math.min(1, age * 2.2), h = 30 + grow * 150, cap = p.r * (.45 + grow * .55), cy = p.y - h;
          for (let s2 = 0; s2 < 5; s2++) {                          // the stem: stacked puffs, hot at the root
            const t2 = s2 / 4, y2 = p.y - t2 * h, r2 = 14 + (1 - t2) * 10 + grow * 6;
            const sg = g.createRadialGradient(p.x, y2, 0, p.x, y2, r2);
            sg.addColorStop(0, `rgba(${Math.round(255 - t2 * 120)},${Math.round(150 - t2 * 80)},90,${a * .9})`); sg.addColorStop(1, 'rgba(60,40,50,0)');
            g.fillStyle = sg; g.beginPath(); g.arc(p.x, y2, r2, 0, 7); g.fill();
          }
          g.strokeStyle = `rgba(230,220,240,${a * .45})`; g.lineWidth = 3;   // condensation ring around the stem
          g.beginPath(); g.ellipse(p.x, p.y - h * .45, 26 + grow * 40, 6 + grow * 5, 0, 0, 7); g.stroke();
          [[0, -.15, 1], [-.55, .1, .72], [.55, .1, .72], [-.3, -.35, .66], [.3, -.35, .66], [-.8, .3, .5], [.8, .3, .5]].forEach(([dx, dy, sc]) => {
            const x2 = p.x + dx * cap, y2 = cy + dy * cap * .7, r2 = cap * .55 * sc;
            const cg = g.createRadialGradient(x2 - r2 * .3, y2 - r2 * .35, 0, x2, y2, r2);
            cg.addColorStop(0, `rgba(255,214,150,${a})`); cg.addColorStop(.5, `rgba(214,110,70,${a * .92})`); cg.addColorStop(1, `rgba(80,50,60,${a * .15})`);
            g.fillStyle = cg; g.beginPath(); g.arc(x2, y2, r2, 0, 7); g.fill();
          });
        }
      });
      return;
    }
    g.save(); g.globalCompositeOperation = 'lighter';
    S.parts.forEach(p => {
      const a = p.life / p.max;
      if (p.k === 'flash') {
        const r = p.r * (1.15 - a * .4), gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(.3, `rgba(255,214,107,${a * .9})`);
        gr.addColorStop(.65, `rgba(255,110,60,${a * .55})`); gr.addColorStop(1, 'rgba(255,60,80,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
      } else if (p.k === 'fire') {
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, `rgba(255,236,170,${a})`); gr.addColorStop(.45, `rgba(255,120,40,${a * .75})`); gr.addColorStop(1, 'rgba(180,30,20,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      } else if (p.k === 'light') {                                 // the blast lights up the ground around it
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        gr.addColorStop(0, `rgba(${p.c},${a * .32})`); gr.addColorStop(1, `rgba(${p.c},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
      } else if (p.k === 'ring') {
        const r = p.r1 - (p.r1 - p.r0) * a;
        g.strokeStyle = `rgba(255,220,170,${a * .7})`; g.lineWidth = 3 * a + .5;
        g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.stroke();
      } else if (p.k === 'gring') {                                 // quake: rings racing along the ground
        const r = p.r1 - (p.r1 - p.r0) * a;
        g.strokeStyle = `rgba(255,210,150,${a * .6})`; g.lineWidth = 3 * a + .5;
        g.beginPath(); g.ellipse(p.x, p.y, r, r * .14, 0, 0, 7); g.stroke();
      } else if (p.k === 'ember') {
        g.fillStyle = `rgba(255,${150 + Math.round(a * 90)},80,${a})`;
        g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill();
      } else if (p.k === 'flame') {                                 // napalm keeps burning on the ground
        const fl = .7 + .3 * Math.sin(S.tick * .45 + p.ph), h = p.h * fl * Math.min(1, a * 1.5), y = surfaceAt(S.shownT, p.x);
        const gr = g.createLinearGradient(0, y - h, 0, y);
        gr.addColorStop(0, 'rgba(255,90,30,0)'); gr.addColorStop(.5, `rgba(255,140,40,${.6 * a})`); gr.addColorStop(1, `rgba(255,230,150,${.9 * a})`);
        g.fillStyle = gr; g.beginPath(); g.moveTo(p.x - 6, y); g.quadraticCurveTo(p.x - 5, y - h * .6, p.x + Math.sin(S.tick * .3 + p.ph) * 3, y - h); g.quadraticCurveTo(p.x + 5, y - h * .6, p.x + 6, y); g.closePath(); g.fill();
      }
    });
    g.restore();
  }

  function drawFloats(g) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    S.floats.forEach(f => {
      const age = 1 - f.life / f.max, a = Math.min(1, f.life / 30), s = age < .12 ? .6 + age * 5 : 1.2 - age * .15;
      g.font = `900 ${Math.round(32 * s)}px Orbitron, "Chakra Petch", system-ui, sans-serif`;
      g.globalAlpha = a; g.lineWidth = 6; g.strokeStyle = 'rgba(5,7,15,.9)'; g.strokeText(f.text, f.x, f.y);
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
      g.strokeStyle = S.theme.rim; g.fillStyle = S.theme.rim; g.lineWidth = 3; g.lineCap = 'round';
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
    if (!wk || !arsenalOf(st).includes(wk) || st.used[me][wk]) return;
    const a = S.aim[me], res = resolveShot(st, me, wk, a.ang, a.pow);
    const s = c.clone(st);
    s.n = (s.n || 0) + 1;
    s.last = { id: s.n, seat: me, w: wk, ang: a.ang, pow: a.pow, wind: st.wind, prev: st.terrain.slice(), prevScore: st.score.slice() };
    s.terrain = res.terrain;
    s.score = [st.score[0] + res.gain[0], st.score[1] + res.gain[1]];
    s.used[me][wk] = true; s.fired[me]++;
    s.turn = s.fired[1 - me] < shotsOf(st) ? 1 - me : me;       // if they're out of shots, you keep firing
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
    if (kind === 'ang') { let e = toElev(me, a.ang); if (e > 260) e -= 360; if (e < -100) e += 360; a.ang = fromElev(me, Math.max(AIM_MIN, Math.min(AIM_MAX, e + d))); }
    else a.pow = Math.max(MAX_POW * .05, Math.min(MAX_POW, a.pow + d * MAX_POW / 100));
    syncReadout();
  }
  function syncReadout() {
    const u = S.ui, c = S.ctx; if (!u || !c) return;
    const a = S.aim[c.me];
    u.ang.textContent = shownElev(c.me, a.ang) + '°';
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

  // Close a match whose shots are all spent (a timeout skip can use up the last one). The turn-holder
  // closes it at once; the other phone after a grace, so an ABSENT turn-holder (the usual case after a
  // skip) can't strand it. Deferred out of render and re-checked against the freshest ctx, so it's
  // idempotent: once either phone has committed the finish, status isn't 'active' and it no-ops.
  const SETTLE_GRACE = 2500;
  function settle(st, first) {
    const key = st.seed + ':' + (st.n || 0) + ':' + st.fired + ':' + first;
    if (S.settleKey === key) return;                                   // one pending check per state
    S.settleKey = key;
    setTimeout(() => {
      const c = S.ctx; if (!c || c.status !== 'active' || S.anim) return;
      const cur = c.state; if (cur.seed !== st.seed || !allFired(cur)) return;
      c.commit(c.clone(cur), winnerOf(cur));
    }, first ? 0 : SETTLE_GRACE);
  }

  /* ---------------- registration ---------------- */
  const DEF = {
    id: 'pocket-tanks', name: 'Pocket Tanks', emoji: '💥', category: 'Duel', accent: '#ff8a3d',
    tagline: 'Draft 10 weapons · wreck the ground · most damage wins.',
    test: { genTerrain, draft, resolveShot, flight, flightV, rollPath, surfaceAt, tankPose, carve, addDirt, quakeGround, muzzle,
      toElev, fromElev, clampAim, arsenalOf, shotsOf, WEAPONS, POOL, LEGACY, THEMES, DRAFT, MAX_POW, VW, VH, COLS, HOME, S },
    // a replay can outlast the finishing commit — hold the result card until it lands
    resultDelay: () => S.anim ? Math.round((S.anim.end - S.anim.clock) / 1.4 * 16.7) + 300 : 0,
    init: host => {
      const seed = (Math.random() * 2147483647) | 0, arsenal = draft(seed);
      return { seed, terrain: genTerrain(seed), arsenal, tanks: [{ x: HOME[0] }, { x: HOME[1] }], turn: host,
        wind: rollWind(), score: [0, 0], used: [freshUsed(arsenal), freshUsed(arsenal)], fired: [0, 0], moves: [3, 3], last: null, n: 0 };
    },
    // timer ran out: your next weapon is spent as a dud and the turn passes
    skipTurn: (st, opp) => {
      const s = JSON.parse(JSON.stringify(st)), me = 1 - opp;
      const wk = arsenalOf(s).find(k => !s.used[me][k]);
      if (wk) { s.used[me][wk] = true; s.fired[me]++; }
      s.turn = s.fired[opp] < shotsOf(s) ? opp : me; s.wind = rollWind();
      return s;
    },
    render(ctx) {
      const st = ctx.state, me = ctx.me, foe = 1 - me, ars = arsenalOf(st), SHOTS = ars.length;
      S.ctx = ctx;
      ensureCanvas();
      if (st.seed !== S.seed) resetScene(st);
      maybeReplay(st);
      if (!S.sel[me] || !ars.includes(S.sel[me]) || st.used[me][S.sel[me]]) S.sel[me] = ars.find(k => !st.used[me][k]) || null;

      const shownScore = S.anim ? S.anim.prevScore : st.score;
      const wrap = ctx.h('div', { class: 'pt-wrap' });
      ctx.root.append(ctx.turnBar({ scores: shownScore }), wrap);
      wrap.append(S.cv);                                         // the SAME canvas every repaint
      fit(); ensureLoop();

      const live = canAct();
      const rail = ctx.h('div', { class: 'pt-rail' });
      ars.forEach(k => {
        const W = WEAPONS[k] || WEAPONS.shell, used = st.used[me][k];
        rail.append(ctx.h('button', {
          class: 'pt-wpn' + (used ? ' used' : '') + (S.sel[me] === k && !used ? ' sel' : ''),
          disabled: used || !live ? '' : null,
          onclick: () => { if (!canAct() || st.used[me][k]) return; S.sel[me] = k; try { ctx.sound.tap(); } catch (e) {} rerender(); },
        }, ctx.h('span', { style: `color:${W.col}`, html: wIcon(k) }), ctx.h('b', {}, W.name), ctx.h('small', {}, W.stat)));
      });

      const a = S.aim[me];
      const angB = ctx.h('b', {}, shownElev(me, a.ang) + '°'), powB = ctx.h('b', {}, String(Math.round(a.pow / MAX_POW * 100)));
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
      }, live && W ? `🔥 FIRE · ${W.name.toUpperCase()}`
        : ctx.status === 'finished' ? 'MATCH OVER'
        : S.anim ? (S.anim.seat === me ? 'SHELL AWAY…' : 'INCOMING…')
        : `${ctx.players[foe].name.toUpperCase()}'S TURN`);

      const left = [SHOTS - st.fired[0], SHOTS - st.fired[1]];
      const fresh = st.fired[0] + st.fired[1] === 0 ? `🗺 <b>${S.theme.name}</b> · ` : '';
      const hint = ctx.h('div', { class: 'pt-hint' });
      hint.innerHTML = ctx.status === 'finished'
        ? `Final: <b>${st.score[0]} – ${st.score[1]}</b>`
        : live ? `${fresh}Drag on the battlefield to aim · <b>${left[me]}</b> shot${left[me] === 1 ? '' : 's'} left · ${ctx.players[foe].name}: ${left[foe]}`
        : S.anim ? (S.anim.seat === me ? 'Watch it land…' : `${ctx.players[foe].name} fired — brace!`)
        : `${fresh}${ctx.players[foe].name} is lining up a shot · you have <b>${left[me]}</b> left`;
      wrap.append(rail, ctrl, fireBtn, hint);
      if (window.Landscape) wrap.append(Landscape.button());
      S.ui = { ang: angB, pow: powB };

      // a timeout can exhaust everyone's arsenal without a winner being declared — either phone
      // settles it (turn-holder first); finishAnim's rerender lands back here once a replay ends
      if (allFired(st) && ctx.status === 'active' && !S.anim) settle(st, ctx.isMyTurn);
    },
  };
  Games.register(DEF);
})();
