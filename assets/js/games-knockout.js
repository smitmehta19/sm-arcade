/* ============================================================
   KNOCKOUT (Penguin Sumo) — the GamePigeon classic, on shrinking
   ice in an arctic night: six arenas (see ARENAS), picked by the host
   in a SETUP phase before round 1 (state: phase/mode/arena/roulette;
   old saves have none of them = Sumo on the Classic Floe, mid-match).

   Each player has 4 penguins. PLANNING is simultaneous and hidden:
   drag from your penguins to set direction + power arrows, tap READY.
   When BOTH are ready, all 8 launch at once — friction, elastic
   circle collisions (per-body mass / radius / restitution; all Classic
   for now), optional bumper walls and sea current, and anyone whose
   centre leaves the ice falls in. The ice tightens every round in its
   own way (ring breaks off, hole widens, bridge cracks, bumper pops,
   tiles fall, current turns) — a pure function of (arena, round, match
   id), so it is identical on both phones. Last side standing wins;
   both wiped in the same round = draw; after 8 rounds, more penguins
   left wins (equal = draw).

   Multiplayer (see CONTEXT "self-healing result race", duels):
   - No real `turn` in planning: `turn` points at a player who hasn't
     submitted, so the per-turn timer runs for whoever is still aiming.
   - My submitted aims live in module memory + localStorage keyed by
     match id + round + seat, and are re-merged on every paint if a
     whole-state write race dropped them.
   - Exactly ONE phone resolves: seat 0 when it sees both aims; seat 1
     only as a fallback after 2.5 s. The physics is a pure function of
     (positions, launch vectors, radius) using only + − × ÷ √, so it
     is bit-identical on every engine; the resolver commits the
     outcome (res.id first, then init / launches / final positions),
     every phone replays it from those inputs and SNAPS to `res.fin`.
   - The canvas, the loop and the replay live at MODULE level, so a
     repaint never restarts or kills an animation, and a finished
     replay (ids persisted) never plays again.
   ============================================================ */
(function () {
  const css = `
  .ko-wrap{ display:flex; flex-direction:column; gap:9px; }
  .ko-cv{ width:100%; display:block; border-radius:var(--r-3); border:1px solid var(--glass-brd);
    box-shadow:var(--shadow-soft), 0 0 0 1px rgba(0,0,0,.25) inset; background:#040a18; touch-action:none;
    -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
  .ko-row{ display:flex; align-items:stretch; gap:7px; }
  .ko-pens{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; flex:1; min-width:0; }
  .ko-pen{ position:relative; height:50px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd);
    display:grid; place-items:center; color:var(--ink); padding:0; touch-action:manipulation;
    transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), box-shadow var(--dur-2), opacity var(--dur-2); }
  .ko-pen svg{ width:24px; height:30px; display:block; }
  .ko-pen:not(:disabled):active{ transform:scale(.92); }
  .ko-pen.sel{ border-color:var(--kc); box-shadow:0 0 0 1px var(--kc), 0 0 16px -4px var(--kc); }
  .ko-pen .tag{ position:absolute; right:4px; top:3px; font-size:10px; font-weight:800; line-height:1; color:var(--kc); }
  .ko-pen .pw{ position:absolute; left:6px; right:6px; bottom:4px; height:3px; border-radius:2px; background:rgba(255,255,255,.08); overflow:hidden; }
  .ko-pen .pw i{ display:block; height:100%; background:var(--kc); border-radius:2px; }
  .ko-pen.dead{ opacity:.28; }
  .ko-pen.dead::after{ content:'SPLASH'; position:absolute; bottom:3px; font-size:7.5px; letter-spacing:1.2px; color:var(--ink-dim); font-weight:700; }
  .ko-foe{ flex:0 0 86px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); display:flex;
    flex-direction:column; justify-content:center; align-items:center; text-align:center; font-size:10px; line-height:1.25; color:var(--ink-dim); padding:4px; }
  .ko-foe b{ display:block; font-size:11.5px; color:var(--kf); }
  .ko-foe.rdy{ border-color:var(--kf); box-shadow:0 0 14px -5px var(--kf); color:var(--ink); }
  .ko-btns{ display:grid; grid-template-columns:1fr 2.1fr; gap:7px; }
  .ko-clear{ padding:13px 6px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink);
    font-weight:700; font-size:12.5px; touch-action:manipulation; transition:transform var(--dur-1) var(--spring), opacity var(--dur-2); }
  .ko-clear:not(:disabled):active{ transform:scale(.95); }
  .ko-clear:disabled{ opacity:.35; }
  .ko-ready{ padding:13px 8px; border-radius:var(--r-2); border:none; font-family:var(--font-display); font-weight:800; letter-spacing:1.2px;
    font-size:13px; color:#06141c; background:linear-gradient(135deg,#bff6ff,#2fe6ff 45%,#9b7bff); box-shadow:0 10px 26px -12px rgba(47,230,255,.9);
    touch-action:manipulation; transition:transform var(--dur-1) var(--spring), opacity var(--dur-2), filter var(--dur-2); }
  .ko-ready.p1{ background:linear-gradient(135deg,#ffd0e4,#ff4d9d 48%,#9b7bff); box-shadow:0 10px 26px -12px rgba(255,77,157,.9); color:#1d0610; }
  .ko-ready.go{ animation:koPulse 1.7s ease-in-out infinite; }
  .ko-ready:not(:disabled):active{ transform:scale(.97); }
  .ko-ready:disabled{ opacity:.4; filter:grayscale(.6); }
  @keyframes koPulse{ 0%,100%{ opacity:.9; transform:scale(1); } 50%{ opacity:1; transform:scale(1.02); } }   /* compositor-only (v77 rule) */
  .ko-hint{ text-align:center; font-size:12px; color:var(--ink-dim); line-height:1.5; min-height:18px; }
  .ko-hint b{ color:var(--ink); }
  @media (prefers-reduced-motion: reduce){ .ko-ready.go{ animation:none; } }
  /* match setup: host picks, partner watches live */
  .ko-setup{ --ka:#7fd8ff; display:flex; flex-direction:column; gap:10px; }
  body.light .ko-setup{ --ka:#0b7fb0; }
  .ko-sr{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
  .ko-who{ font-size:12.5px; line-height:1.45; color:var(--ink-dim); text-align:center; }
  .ko-who b{ color:var(--ink); }
  .ko-lab{ font-size:12px; font-weight:700; color:var(--ink-dim); margin:2px 2px -3px; }
  .ko-seg{ display:grid; grid-template-columns:1.15fr 1fr 1fr; gap:6px; }
  .ko-mode{ padding:9px 4px 8px; min-height:48px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink);
    font-weight:700; font-size:12px; line-height:1.2; touch-action:manipulation; transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), box-shadow var(--dur-2); }
  .ko-mode small{ display:block; font-weight:600; font-size:10.5px; color:var(--ink-dim); margin-top:2px; }
  .ko-mode[aria-pressed=true]{ border-color:var(--ka); box-shadow:0 0 0 1px var(--ka), 0 0 16px -6px var(--ka); }
  .ko-mode:disabled{ opacity:.55; }
  .ko-arenas{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:7px; }
  .ko-ar{ display:flex; flex-direction:column; align-items:stretch; gap:5px; padding:5px 5px 7px; min-height:44px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd);
    color:var(--ink); font-weight:700; font-size:11.5px; line-height:1.15; text-align:center; touch-action:manipulation;
    transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), box-shadow var(--dur-2); }
  .ko-ar svg{ width:100%; height:auto; aspect-ratio:100/64; display:block; border-radius:9px; }
  .ko-ar[aria-pressed=true]{ border-color:var(--ka); box-shadow:0 0 0 1px var(--ka), 0 0 16px -6px var(--ka); }
  .ko-ar.wide{ grid-column:1/-1; flex-direction:row; align-items:center; gap:10px; padding:6px 10px 6px 6px; text-align:left; }
  .ko-ar.wide svg{ width:64px; flex:none; }
  .ko-ar.wide small{ display:block; font-weight:600; font-size:10.5px; color:var(--ink-dim); margin-top:2px; }
  .ko-desc{ min-height:34px; font-size:12px; line-height:1.45; color:var(--ink-dim); text-align:center; padding:0 4px; }
  .ko-desc b{ color:var(--ink); }
  .ko-roul{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; min-height:48px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd);
    color:var(--ink); text-align:left; font-weight:700; font-size:12.5px; touch-action:manipulation; transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), box-shadow var(--dur-2); }
  .ko-roul small{ display:block; font-weight:600; font-size:10.5px; color:var(--ink-dim); margin-top:2px; }
  .ko-roul[aria-checked=true]{ border-color:var(--ka); box-shadow:0 0 0 1px var(--ka), 0 0 16px -6px var(--ka); }
  .ko-sw{ flex:none; width:38px; height:22px; border-radius:11px; background:rgba(127,140,180,.35); position:relative; transition:background var(--dur-2); }
  .ko-sw::after{ content:''; position:absolute; left:3px; top:3px; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.4); transition:transform var(--dur-2) var(--ease); }
  .ko-roul[aria-checked=true] .ko-sw{ background:var(--ka); }
  .ko-roul[aria-checked=true] .ko-sw::after{ transform:translateX(16px); }
  .ko-ro{ pointer-events:none; }
  .ko-go{ position:sticky; bottom:0; z-index:2; margin-top:2px; padding:16px 0 calc(8px + var(--safe-b)); background:linear-gradient(to top, var(--bg) 62%, transparent); }
  .ko-go button{ width:100%; padding:15px 8px; }
  .ko-wait{ display:flex; align-items:center; justify-content:center; gap:10px; min-height:50px; padding:12px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-size:13px; font-weight:700; }
  .ko-dots{ display:inline-flex; gap:4px; }
  .ko-dots i{ width:6px; height:6px; border-radius:50%; background:var(--ka); animation:koDot 1.2s ease-in-out infinite; }
  .ko-dots i:nth-child(2){ animation-delay:.15s; } .ko-dots i:nth-child(3){ animation-delay:.3s; }
  @keyframes koDot{ 0%,80%,100%{ opacity:.25; transform:scale(.8); } 40%{ opacity:1; transform:scale(1); } }
  .ko-ar:focus-visible,.ko-mode:focus-visible,.ko-roul:focus-visible,.ko-ready:focus-visible{ outline:2px solid var(--ka,#7fd8ff); outline-offset:2px; }
  @media (hover:hover) and (pointer:fine){ .ko-ar:not(.ko-ro):hover,.ko-roul:not(.ko-ro):hover,.ko-mode:not(:disabled):not(.ko-ro):hover{ border-color:var(--ka); } }
  .ko-ar:not(.ko-ro):active,.ko-roul:not(.ko-ro):active,.ko-mode:not(:disabled):not(.ko-ro):active{ transform:scale(.97); }
  @media (prefers-reduced-motion: reduce){ .ko-dots i{ animation:none; opacity:.7; } .ko-ar,.ko-roul,.ko-mode,.ko-sw::after{ transition:none; } }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------------- rules / physics constants ---------------- */
  const NP = 4, PR = 22, R_START = 300, SHRINK = 0.91, MAX_ROUNDS = 8;
  const VMAX = 700, FRIC = 440, REST = 0.9, DT = 1 / 240, SUB = 4, MAX_STEPS = 240 * 8;
  const MAXA = 160, MINA = 18;                           // aim arrow length on the ice (world units)
  const START = [[-120, 150], [-42, 186], [42, 186], [120, 150]];
  const FALLBACK_MS = 2500, RESEND_MS = 1500;
  /* ---------------- view constants (logical canvas px) ---------------- */
  const VW = 400, VH = 450, CX = 200, CY = 268, SC = 0.6, TILT = 0.56, TH = 15, HOR = 118;
  const REVEAL = 850, CRACK_MS = 420, SHRINK_MS = 1150, SWAP_MS = 950, PRE_MS = 520, ENTRY_MS = 700, FALL_SLIDE = 240, FALL_DROP = 460, FALL_MS = 760;

  /* ---------------- arenas: pure geometry (identical on every phone) ---------------- */
  // Trig is precomputed here as rounded constants (a unit vector every 5°): the slide never calls sin/cos/pow.
  const UV = [[1,0],[0.996195,0.087156],[0.984808,0.173648],[0.965926,0.258819],[0.939693,0.34202],[0.906308,0.422618],[0.866025,0.5],[0.819152,0.573576],[0.766044,0.642788],[0.707107,0.707107],[0.642788,0.766044],[0.573576,0.819152],[0.5,0.866025],[0.422618,0.906308],[0.34202,0.939693],[0.258819,0.965926],[0.173648,0.984808],[0.087156,0.996195],[0,1],[-0.087156,0.996195],[-0.173648,0.984808],[-0.258819,0.965926],[-0.34202,0.939693],[-0.422618,0.906308],[-0.5,0.866025],[-0.573576,0.819152],[-0.642788,0.766044],[-0.707107,0.707107],[-0.766044,0.642788],[-0.819152,0.573576],[-0.866025,0.5],[-0.906308,0.422618],[-0.939693,0.34202],[-0.965926,0.258819],[-0.984808,0.173648],[-0.996195,0.087156],[-1,0],[-0.996195,-0.087156],[-0.984808,-0.173648],[-0.965926,-0.258819],[-0.939693,-0.34202],[-0.906308,-0.422618],[-0.866025,-0.5],[-0.819152,-0.573576],[-0.766044,-0.642788],[-0.707107,-0.707107],[-0.642788,-0.766044],[-0.573576,-0.819152],[-0.5,-0.866025],[-0.422618,-0.906308],[-0.34202,-0.939693],[-0.258819,-0.965926],[-0.173648,-0.984808],[-0.087156,-0.996195],[0,-1],[0.087156,-0.996195],[0.173648,-0.984808],[0.258819,-0.965926],[0.34202,-0.939693],[0.422618,-0.906308],[0.5,-0.866025],[0.573576,-0.819152],[0.642788,-0.766044],[0.707107,-0.707107],[0.766044,-0.642788],[0.819152,-0.573576],[0.866025,-0.5],[0.906308,-0.422618],[0.939693,-0.34202],[0.965926,-0.258819],[0.984808,-0.173648],[0.996195,-0.087156]];
  const uv = k => UV[((k % 72) + 72) % 72];
  const ARENAS = [
    { id: 'floe', name: 'Classic Floe', icon: '🧊', blurb: 'The original. A ring breaks off every round.', hint: 'the dashed ring breaks off after this round' },
    { id: 'donut', name: 'Donut', icon: '🍩', blurb: 'A hole in the middle. The centre is deadly too.', hint: 'the hole widens after this round, and the middle is deadly' },
    { id: 'twin', name: 'Twin Floes', icon: '🏝️', blurb: 'Two islands, one thin bridge. It cracks after round 3.', hint: 'the bridge cracks after round 3' },
    { id: 'bumper', name: 'Bumper Rink', icon: '🛟', blurb: 'Rubber bumpers bounce you back. One pair pops and the rim shrinks each round.', hint: 'the pulsing bumpers pop and the rim shrinks after this round' },
    { id: 'ice', name: 'Crumbling Ice', icon: '🧩', blurb: 'The floe is tiles. The cracked ones fall next.', hint: 'the cracked tiles fall after this round' },
    { id: 'current', name: 'Current', icon: '🌊', blurb: 'A sea current drags everything. It turns each round, and the floe shrinks a little.', hint: 'the current drags everything the way the badge points; the floe shrinks a little after this round' },
  ];
  const ARENA_IDS = ARENAS.map(a => a.id);
  function seeded(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const r2 = v => Math.round(v * 100) / 100;
  const nextR = R => Math.round(R * SHRINK * 10) / 10;
  const tab = (f, n) => { const t = [R_START]; for (let i = 1; i < n; i++) t.push(f(t[i - 1], i)); return t; };
  const RT = tab(nextR, 10);                               // classic floe radius by level (== st.R in normal play)
  const RCT = tab(R => Math.round(R * .93 * 10) / 10, 10); // the current arena shrinks a touch slower
  const HRT = tab((h, i) => 70 + 20 * i, 10); HRT[0] = 70; // donut hole radius grows 20 per round
  const RO = 300;                                          // donut outer radius
  const IC = 175, BX = 60, BY = 28, BXV = 47;                        // twin floes: island centres at ±IC, bridge half-length / half-width
  const ITW = tab((r, i) => i <= 3 ? 130 : Math.round(r * .9 * 10) / 10, 10); ITW[0] = 130;
  const TN = 6, TS = 100, TO = 300, TCORN = [0, 5, 30, 35];  // crumbling ice: 6×6 tiles of 100, corners never exist
  const CUR_V = 46, CUR_S1 = 360, CUR_S2 = 480;            // current speed (units/s) and fade-out window (steps)
  const BUMP_E = 1.1, WALL_T = 30;                         // bumpers are a touch springy; a centre 30 behind the wall is "tunnelled"
  const pick1 = (rng, a) => a[Math.floor(rng() * a.length)];
  function shuffled(rng, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // which bumper pair pops after round n (4 pairs = slots j and j+4, opposite each other)
  const bumpOrder = mid => shuffled(seeded(hashStr(mid + ':bump')), [0, 1, 2, 3]);
  // the current's direction (index × 45°) by level: opposite pairs on consecutive rounds (E/W first) so neither seat is favoured overall
  function curSeq(mid) {
    const rng = seeded(hashStr(mid + ':cur')), pairs = [[0, 4]].concat(shuffled(rng, [[1, 5], [3, 7], [2, 6]])), seq = [];
    pairs.forEach(p => { const o = rng() < .5 ? p : [p[1], p[0]]; seq.push(o[0], o[1]); });
    return seq;
  }
  // tiles that fall: one mirrored pair per round (seeded by match + round), same on both phones
  function icePicks(mid) {
    const used = {}, out = [];
    for (let r = 1; r <= 10; r++) {
      const cand = []; for (let k = 0; k < 18; k++) if (TCORN.indexOf(k) < 0 && !used[k]) cand.push(k);
      const k = pick1(seeded(hashStr(mid + ':' + r + ':ice')), cand); used[k] = 1; out.push(k);
    }
    return out;
  }
  function iceDead(mid, lv) {
    const d = new Array(TN * TN).fill(0), pk = icePicks(mid);
    TCORN.forEach(k => { d[k] = 1; });
    for (let i = 0; i < lv && i < pk.length; i++) { d[pk[i]] = 1; d[TN * TN - 1 - pk[i]] = 1; }
    return d;
  }
  // The builders return everything the slide needs: in(x,y) "is this point on the ice?", optional wall
  // segments [ax,ay,ex,ey,len²,nx,ny] (inward normal) and an optional current [wx,wy] — plus drawing data.
  const BUILD = {
    floe: (lv, mid, R) => { R = R || RT[lv]; const R2 = R * R; return { R, ext: R, in: (x, y) => x * x + y * y <= R2 }; },
    donut: lv => { const HR = HRT[lv], H2 = HR * HR, O2 = RO * RO; return { R: RO, HR, ext: RO, in: (x, y) => { const d = x * x + y * y; return d <= O2 && d >= H2; } }; },
    twin: lv => {
      const ir = ITW[lv], i2 = ir * ir, br = lv <= 2;
      return { ir, br, ext: IC + 130, in: (x, y) => { const a = x + IC, b = x - IC, yy = y * y; return a * a + yy <= i2 || b * b + yy <= i2 || (br && x <= BX && x >= -BX && y <= BY && y >= -BY); } };
    },
    bumper: (lv, mid) => {
      const R = RT[lv], R2 = R * R, order = bumpOrder(mid), slots = [], walls = [], Rw = R - 2;
      for (let p = lv; p < 4; p++) slots.push(order[p], order[p] + 4);
      slots.forEach(j => {
        for (let d = -3; d < 3; d++) {
          const a = uv(9 * j + d), b = uv(9 * j + d + 1), ax = a[0] * Rw, ay = a[1] * Rw, ex = b[0] * Rw - ax, ey = b[1] * Rw - ay, l = Math.sqrt(ex * ex + ey * ey);
          let nx = ey / l, ny = -ex / l; if (nx * (ax + ex / 2) + ny * (ay + ey / 2) > 0) { nx = -nx; ny = -ny; }   // inward
          walls.push([ax, ay, ex, ey, ex * ex + ey * ey, nx, ny]);
        }
      });
      return { R, ext: R, slots, walls: walls.length ? walls : null, in: (x, y) => x * x + y * y <= R2 };
    },
    ice: (lv, mid) => {
      const dead = iceDead(mid, lv), pk = icePicks(mid), doom = [pk[lv], TN * TN - 1 - pk[lv]];
      return { ext: TO, dead, doom, in: (x, y) => { const ix = Math.floor((x + TO) / TS), iy = Math.floor((y + TO) / TS); return ix >= 0 && ix < TN && iy >= 0 && iy < TN && dead[iy * TN + ix] === 0; } };
    },
    current: (lv, mid) => {
      const R = RCT[lv], R2 = R * R, dir = curSeq(mid)[lv % 8], u = uv(9 * dir);
      return { R, ext: R, dir, cur: [u[0] * CUR_V, u[1] * CUR_V], in: (x, y) => x * x + y * y <= R2 };
    },
  };
  const GCACHE = new Map();
  function geoFor(id, lv, mid, R) {
    if (!BUILD[id]) id = 'floe';
    lv = Math.max(0, Math.min(9, lv | 0));
    const key = id + ':' + lv + ':' + (id === 'floe' ? R : mid);
    let g = GCACHE.get(key);
    if (!g) { g = BUILD[id](lv, mid, R); g.id = id; g.lv = lv; g.mid = mid; if (GCACHE.size > 80) GCACHE.clear(); GCACHE.set(key, g); }
    return g;
  }
  // the ice of round (st.round + dr) in arena `id`; a classic floe follows st.R (old saves, hand-set test radii)
  const geoOf = (id, st, dr) => geoFor(id, st.round - 1 + dr, st.mid, dr ? nextR(st.R) : st.R);
  function arenaAfter(st) {                                // roulette: a different arena each round (seeded by match + round)
    if (!st.roulette) return st.arena;
    const c = ARENA_IDS.filter(a => a !== st.arena);
    return pick1(seeded(hashStr(st.mid + ':' + (st.round + 1) + ':arena')), c);
  }
  const surpriseArena = mid => pick1(seeded(hashStr(mid + ':surprise')), ARENA_IDS);
  // seat 0's four start slots on this ice (seat 1 is the same turned 180°); level 0 is the original layout
  function slotsFor(g) {
    const lv = g.lv, id = g.id, sc = (pts, s) => pts.map(p => [r2(p[0] * s), r2(p[1] * s)]);
    if (id === 'floe' || id === 'bumper' || id === 'current') return sc(START, Math.max(g.R / R_START, .62));   // never tighter than 62% (keeps them 50 apart)
    if (id === 'donut') return lv === 0 ? START : sc(START, (g.HR + RO) / 2 / 191.4);
    if (id === 'twin') {
      const s = g.ir / 130, o = [[-35, 55], [45, 70], [-45, 70], [35, 55]], c = [-IC, -IC, IC, IC];
      return o.map((p, k) => [r2(c[k] + p[0] * s), r2(p[1] * s)]);
    }
    if (lv === 0) return START;                            // ice: tile centres, alive ones first
    const cand = [[-150, 150], [-50, 150], [50, 150], [150, 150], [-150, 50], [-50, 50], [50, 50], [150, 50], [-150, 250], [-50, 250], [50, 250], [150, 250]], out = [];
    cand.forEach(p => { if (out.length < NP && g.in(p[0], p[1]) && g.in(-p[0], -p[1])) out.push(p); });
    return out;
  }
  function startPens(id) {
    const p = [], sl = id && id !== 'floe' ? slotsFor(geoFor(id, 0, 'start')) : START;
    for (let s = 0; s < 2; s++) sl.forEach(([x, y]) => p.push([s ? -x : x, s ? -y : y, 1]));
    return p;
  }

  /* ---------------- pure rules (identical on every phone) ---------------- */
  // Firebase strips nulls / empty containers (and old saves may lack fields) → re-default on read
  function norm(st) {
    st = st && typeof st === 'object' ? st : {};
    st.phase = st.phase === 'setup' ? 'setup' : 'play';      // old saves have no phase: they are mid-match Sumo on the Classic Floe
    st.mode = 'sumo';                                        // King of the Hill / Fish Hockey are "coming soon"
    st.roulette = st.roulette ? 1 : 0;
    st.arena = ARENA_IDS.indexOf(st.arena) >= 0 || (st.phase === 'setup' && st.arena === 'surprise') ? st.arena : 'floe';
    const def = startPens(st.arena === 'surprise' ? 'floe' : st.arena);
    const pens = Array.isArray(st.pens) && st.pens.length === 2 * NP ? st.pens : def;
    st.pens = pens.map((p, i) => Array.isArray(p) ? [+p[0] || 0, +p[1] || 0, p[2] ? 1 : 0] : def[i]);
    st.aims = st.aims && typeof st.aims === 'object' && !Array.isArray(st.aims) ? st.aims : {};
    st.round = +st.round || 1; st.R = +st.R || R_START; st.mid = st.mid || 'ko'; st.n = +st.n || 0;
    if (st.turn !== 0 && st.turn !== 1) st.turn = st.host === 1 ? 1 : 0;
    if (st.res && (!Array.isArray(st.res.init) || !Array.isArray(st.res.L) || !Array.isArray(st.res.fin))) delete st.res;
    return st;
  }
  // a seat's submitted aims for THIS round ({r, v:[[vx,vy]×4], skip?}), or null
  function aimsOf(st, seat) { const a = st.aims && st.aims['a' + seat]; return a && a.r === st.round && Array.isArray(a.v) ? a : null; }
  const realAims = (st, seat) => { const a = aimsOf(st, seat); return a && !a.skip ? a : null; };
  const aliveCount = (pens, seat) => { let n = 0; for (let k = 0; k < NP; k++) if (pens[seat * NP + k][2]) n++; return n; };
  function cleanVec(v) {
    if (!Array.isArray(v)) return [0, 0];
    let x = Math.round(+v[0] || 0), y = Math.round(+v[1] || 0);
    const l2 = x * x + y * y;
    if (l2 > VMAX * VMAX) { const k = VMAX / Math.sqrt(l2); x = Math.trunc(x * k); y = Math.trunc(y * k); }
    return [x, y];
  }
  // the 8 launch vectors; penguins without an arrow (or already swimming) stay put
  function launches(st) {
    const L = [];
    for (let s = 0; s < 2; s++) {
      const a = aimsOf(st, s);
      for (let k = 0; k < NP; k++) { const i = s * NP + k; L.push(st.pens[i][2] && a ? cleanVec(a.v[k]) : [0, 0]); }
    }
    return L;
  }
  // The slide. ONLY + − × ÷ and √ (all correctly rounded by IEEE-754), fixed order, fixed step:
  // the same inputs give bit-identical output on iOS Safari and Chrome. `geo` is a geoFor() result (or, for old
  // callers, a bare floe radius); `bd` optionally gives each body its own mass / radius / restitution
  // (default: every body is a Classic penguin) and an onStep hook for later items / a puck.
  function simulate(init, L, geo, bd) {
    if (typeof geo === 'number') geo = geoFor('floe', 0, '', geo);
    const n = init.length, x = [], y = [], vx = [], vy = [], live = [], m = [], rad = [], rest = [];
    for (let i = 0; i < n; i++) {
      x[i] = +init[i][0]; y[i] = +init[i][1]; live[i] = !!init[i][2];
      vx[i] = live[i] ? +L[i][0] : 0; vy[i] = live[i] ? +L[i][1] : 0;
      m[i] = bd && bd.m ? bd.m[i] : 1; rad[i] = bd && bd.r ? bd.r[i] : PR; rest[i] = bd && bd.e ? bd.e[i] : REST;
    }
    const frames = [], hits = [], outs = [], bumps = [], onIce = geo.in, walls = geo.walls, cur = geo.cur;
    const snap = () => { const f = new Array(n * 2); for (let i = 0; i < n; i++) { f[i * 2] = x[i]; f[i * 2 + 1] = y[i]; } frames.push(f); };
    snap();
    let step = 0;
    for (; step < MAX_STEPS; step++) {
      let wx = 0, wy = 0;
      if (cur) { const f = step < CUR_S1 ? 1 : step < CUR_S2 ? (CUR_S2 - step) / (CUR_S2 - CUR_S1) : 0; wx = cur[0] * f; wy = cur[1] * f; }
      for (let i = 0; i < n; i++) {
        if (!live[i]) continue;
        if (cur) {                                         // friction acts on the speed relative to the water
          const rx = vx[i] - wx, ry = vy[i] - wy, s2 = rx * rx + ry * ry;
          if (s2 > 0) {
            const sp = Math.sqrt(s2), ns = sp - FRIC * DT;
            if (ns <= 0) { vx[i] = wx; vy[i] = wy; } else { const k = ns / sp; vx[i] = wx + rx * k; vy[i] = wy + ry * k; }
          }
          if (vx[i] !== 0 || vy[i] !== 0) { x[i] += vx[i] * DT; y[i] += vy[i] * DT; }
          continue;
        }
        const s2 = vx[i] * vx[i] + vy[i] * vy[i];
        if (s2 > 0) {
          const sp = Math.sqrt(s2), ns = sp - FRIC * DT;
          if (ns <= 0) { vx[i] = 0; vy[i] = 0; } else { const k = ns / sp; vx[i] *= k; vy[i] *= k; }
          x[i] += vx[i] * DT; y[i] += vy[i] * DT;
        }
      }
      for (let i = 0; i < n; i++) {
        if (!live[i]) continue;
        for (let j = i + 1; j < n; j++) {
          if (!live[j]) continue;
          const dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy, D = rad[i] + rad[j];
          if (d2 >= D * D || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = D - d, mi = m[i], mj = m[j], wi = mj / (mi + mj), wj = mi / (mi + mj);
          x[i] -= nx * (ov * wi); y[i] -= ny * (ov * wi); x[j] += nx * (ov * wj); y[j] += ny * (ov * wj);   // the heavier one gives way less
          const vr = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
          if (vr > 0) {
            const e = rest[i] < rest[j] ? rest[i] : rest[j], J = (1 + e) / (1 / mi + 1 / mj) * vr, Ji = J / mi, Jj = J / mj;
            vx[i] -= Ji * nx; vy[i] -= Ji * ny; vx[j] += Jj * nx; vy[j] += Jj * ny;
            if (vr > 40) hits.push({ step, i, j, x: (x[i] + x[j]) / 2, y: (y[i] + y[j]) / 2, s: vr });
          }
        }
      }
      if (walls) for (let i = 0; i < n; i++) {             // bumpers: one-sided cushions (the flat) and round posts (the ends)
        if (!live[i]) continue;
        const ri = rad[i];
        for (let w = 0; w < walls.length; w++) {
          const W = walls[w], ax = W[0], ay = W[1], ex = W[2], ey = W[3], t = ((x[i] - ax) * ex + (y[i] - ay) * ey) / W[4];
          let nx, ny, pen;
          if (t > 0 && t < 1) {
            nx = W[5]; ny = W[6]; const sd = (x[i] - ax) * nx + (y[i] - ay) * ny;
            if (sd >= ri || sd < -WALL_T) continue;
            pen = ri - sd;
          } else {
            const qx = t <= 0 ? ax : ax + ex, qy = t <= 0 ? ay : ay + ey, dx = x[i] - qx, dy = y[i] - qy, d2 = dx * dx + dy * dy;
            if (d2 >= ri * ri) continue;
            if (d2 === 0) { nx = W[5]; ny = W[6]; pen = ri; } else { const d = Math.sqrt(d2); nx = dx / d; ny = dy / d; pen = ri - d; }
          }
          x[i] += nx * pen; y[i] += ny * pen;
          const vn = vx[i] * nx + vy[i] * ny;
          if (vn < 0) {
            vx[i] -= (1 + BUMP_E) * vn * nx; vy[i] -= (1 + BUMP_E) * vn * ny;
            if (vn < -40) bumps.push({ step, i, x: x[i] - nx * ri, y: y[i] - ny * ri, s: -vn });
          }
        }
      }
      if (bd && bd.onStep) bd.onStep(step, x, y, vx, vy, live);   // HOOK: items (U2) / puck (U4) act here
      let moving = false;
      for (let i = 0; i < n; i++) {
        if (!live[i]) continue;
        if (!onIce(x[i], y[i])) { live[i] = false; outs.push({ step, i, x: x[i], y: y[i], vx: vx[i], vy: vy[i] }); continue; }
        if (vx[i] !== 0 || vy[i] !== 0) moving = true;
      }
      if ((step + 1) % SUB === 0) snap();
      if (!moving) { step++; break; }
    }
    if (step % SUB !== 0) snap();
    const fin = [];
    for (let i = 0; i < n; i++) fin.push([r2(x[i]), r2(y[i]), live[i] ? 1 : 0]);
    return { fin, frames, hits, outs, bumps, steps: step };
  }
  // Both aims in → the whole round, resolved. Returns { next, winner? }.
  function resolveRound(st0, by) {
    const st = norm(JSON.parse(JSON.stringify(st0)));
    const g0 = geoOf(st.arena, st, 0), L = launches(st), sim = simulate(st.pens, L, g0), R1 = nextR(st.R);
    const nid = arenaAfter(st), g1 = geoOf(nid, st, 1), swap = nid !== st.arena;
    // the part of the ice that breaks off after the slide takes anyone standing on it too (roulette: the whole arena is swapped instead)
    const fin = swap ? sim.fin : sim.fin.map(p => [p[0], p[1], p[2] && g1.in(p[0], p[1]) ? 1 : 0]);
    const s = JSON.parse(JSON.stringify(st));
    s.res = { id: st.mid + ':' + st.round, r: st.round, by: by === 1 ? 1 : 0, init: st.pens, L, fin, R0: st.R, R1, ar: st.arena };
    s.pens = fin; s.R = R1; s.aims = {}; s.n = st.n + 1;
    s.turn = st.turn === 1 ? 0 : 1;                    // always changes → the turn clock restarts for the new round
    const left = [aliveCount(fin, 0), aliveCount(fin, 1)];
    let winner;
    if (!left[0] && !left[1]) winner = 'draw';
    else if (!left[0]) winner = 1;
    else if (!left[1]) winner = 0;
    else if (st.round >= MAX_ROUNDS) winner = left[0] === left[1] ? 'draw' : (left[0] > left[1] ? 0 : 1);
    if (winner === undefined) {
      s.round = st.round + 1;
      if (swap) {                                      // survivors regroup on the next arena's start slots (same penguin → same slot)
        const sl = slotsFor(g1);
        s.arena = nid; s.pens = fin.map((p, i) => { const k = i % NP, q = sl[k]; return p[2] ? [i < NP ? q[0] : -q[0], i < NP ? q[1] : -q[1], 1] : p; });
        s.res.rg = s.pens; s.res.na = nid;
      }
    } else s.over = { w: winner, left };
    return { next: s, winner };
  }

  /* ---------------- my submitted aims: memory + localStorage (self-healing) ---------------- */
  const LS = 'sm_ko_', mem = {};
  const memKey = (mid, round, seat) => mid + ':' + round + ':' + seat;
  const memGet = k => { if (k in mem) return mem[k]; let v = null; try { v = JSON.parse(localStorage.getItem(LS + k) || 'null'); } catch (e) {} mem[k] = v; return v; };
  const memSet = (k, v) => { mem[k] = v; try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} };
  function memPrune(mid) {                               // forget other matches' aims
    try {
      const drop = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(LS) === 0 && k !== LS + 'done' && k.indexOf(LS + mid + ':') !== 0) drop.push(k); }
      drop.forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }
  function doneLoad() { try { return new Set(JSON.parse(localStorage.getItem(LS + 'done') || '[]')); } catch (e) { return new Set(); } }
  function doneAdd(id) {
    S.done.add(id);
    try { localStorage.setItem(LS + 'done', JSON.stringify([...S.done].slice(-30))); } catch (e) {}
  }

  /* ---------------- module-level scene (survives every repaint) ---------------- */
  const S = {
    cv: null, g: null, ctx: null, st: null, mid: null, flip: 1, W: 0, H: 0, dpr: 1, k: 1,
    raf: 0, tmr: 0, last: 0, lastActive: 0, tick: 0, speed: 1, hold: false,
    cam: { x: 0, y: 14, z: 1 }, sx: 0, sy: 0, shake: 0, flash: 0,
    anim: null, done: doneLoad(), myRes: {}, fbKey: null, resCommits: 0,
    draft: { key: '', v: [null, null, null, null] }, sel: null, drag: null,
    parts: [], hats: {}, banner: null, pv: [], snow: [], shim: [], cracks: [], rimPh: [0, 0, 0],
    layers: null, layerKey: '', vig: null, ui: null,
    sw: null, pre: { id: null }, prePos: null, padHit: {}, starting: '',
    arrows: { own: 0, foePlanning: 0, foeReveal: 0 }, mismatch: 0,
    calm: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  const rnd = (a, b) => a + Math.random() * (b - a);

function resetScene(st) {
    S.mid = st.mid; S.anim = null; S.parts = []; S.hats = {}; S.banner = null; S.sel = null; S.drag = null; S.myRes = {}; S.fbKey = null;
    S.draft = { key: '', v: [null, null, null, null] }; S.shake = 0; S.flash = 0; S.layerKey = '';
    S.sw = null; S.pre = { id: null }; S.prePos = null; S.padHit = {}; S.starting = ''; S.lastSay = ''; S.focusSel = '';
    const r = seeded(hashStr(st.mid));
    S.rimPh = [r() * 6.28, r() * 6.28, r() * 6.28];
    S.pv = []; for (let i = 0; i < 2 * NP; i++) S.pv.push({ ph: r() * 6.28, blink: 0, nextBlink: 800 + r() * 3000, look: 0, lookT: 0, dizzy: 0, sq: 0, hop: 0 });
    S.snow = []; for (let i = 0; i < 70; i++) S.snow.push({ x: r() * VW, y: r() * VH, z: .35 + r() * .9, ph: r() * 6.28 });
    S.shim = []; for (let i = 0; i < 130; i++) { const a = r() * 6.28, d = 150 + r() * 620; S.shim.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 1.1, ph: r() * 6.28, sp: .0015 + r() * .003, len: 4 + r() * 9 }); }
    // cracks: a few branching polylines frozen into the ice (world coords)
    S.cracks = [];
    for (let c = 0; c < 9; c++) {
      let a = r() * 6.28, d = 30 + r() * 230, x = Math.cos(a) * d, y = Math.sin(a) * d, h = r() * 6.28;
      const pts = [[x, y]], len = 3 + Math.floor(r() * 5);
      for (let s = 0; s < len; s++) { h += (r() - .5) * 1.3; x += Math.cos(h) * (14 + r() * 22); y += Math.sin(h) * (14 + r() * 22); pts.push([x, y]); }
      S.cracks.push({ pts, w: .6 + r() * .9 });
    }
    memPrune(st.mid);
    // swimmers from before this device joined still leave a hat on the water (unless we're about to watch them fall)
    const pend = st.res && !S.done.has(st.res.id) ? st.res : null;
    st.pens.forEach((p, i) => { if (!p[2] && !(pend && pend.init[i] && pend.init[i][2])) addHat(i, p[0], p[1], true); });
  }
  const rimR = (th, R) => R * (1 + .016 * Math.sin(3 * th + S.rimPh[0]) + .011 * Math.sin(7 * th + S.rimPh[1]) + .007 * Math.sin(13 * th + S.rimPh[2]));
  // the ice under the camera right now: a replay's own arena, else the state's (setup: the previewed one)
  function curGeo() {
    const A = S.anim, st = S.st;
    if (A) return A.geo;
    if (!st) return geoFor('floe', 0, '', R_START);
    if (st.phase === 'setup') return geoFor(S.pre.id || (st.arena === 'surprise' ? 'floe' : st.arena), 0, st.mid, R_START);
    return geoOf(st.arena, st, 0);
  }
  // a dropped beanie bobs where its owner went in, nudged out into open water (never floating over ice)
  function addHat(i, x, y, old) {
    if (S.hats[i] || !S.st || S.st.roulette || S.st.phase === 'setup') return;
    const g = curGeo(), open = (a, b) => { let m = 60; for (let k = 0; k < 12; k++) { const u = UV[k * 6]; for (let d = 6; d < m; d += 6) if (g.in(a + u[0] * d, b + u[1] * d)) { m = d; break; } } return m; };
    let px = x, py = y;
    for (let n = 0; n < 12 && (g.in(px, py) || open(px, py) < 26); n++) {
      let bu = UV[0], bm = -1;
      for (let k = 0; k < 12; k++) { const u = UV[k * 6]; let d = 6; while (d < 60 && !g.in(px + u[0] * d, py + u[1] * d)) d += 6; if (d > bm) { bm = d; bu = u; } }
      px += bu[0] * 8; py += bu[1] * 8;
    }
    S.hats[i] = { x: px, y: py, t0: old ? -99999 : S.tick, seat: i < NP ? 0 : 1, ph: Math.random() * 6.28 };
  }

  /* ---------------- canvas, sizing, loop ---------------- */
  function ensureCanvas() {
    if (S.cv) return;
    S.cv = document.createElement('canvas'); S.cv.className = 'ko-cv'; S.cv.setAttribute('role', 'img');
    S.live = document.createElement('div'); S.live.className = 'ko-sr'; S.live.setAttribute('role', 'status'); S.live.setAttribute('aria-live', 'polite'); document.body.append(S.live);   // outlives the repaints that rebuild the setup DOM
    document.addEventListener('focusin', e => { const t = e.target, c = t && t.closest ? t.closest('.ko-setup') : null; S.focusSel = !c ? '' : t.getAttribute('data-id') ? '[data-id="' + t.getAttribute('data-id') + '"]' : t.classList.contains('ko-roul') ? '.ko-roul' : ''; });
    document.addEventListener('pointerdown', () => { S.focusSel = ''; }, true);
    S.g = S.cv.getContext('2d');
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(S.cv);
    else window.addEventListener('resize', fit);
    S.cv.addEventListener('pointerdown', onDown);
    S.cv.addEventListener('pointermove', onMove, { passive: false });
    S.cv.addEventListener('pointerup', onUp);
    S.cv.addEventListener('pointercancel', () => { S.drag = null; updateUI(); });
  }
  function fit() {
    if (!S.cv) return;
    const w = S.cv.clientWidth; if (!w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(w * VH / VW * dpr);
    S.cv.style.height = Math.round(w * VH / VW) + 'px';
    if (W === S.W && H === S.H) return;
    S.W = W; S.H = H; S.dpr = dpr; S.k = W / VW;
    S.cv.width = W; S.cv.height = H; S.layerKey = ''; S.vig = null;
    draw();                                               // resizing wipes the bitmap — repaint right away
  }
  const busy = () => !!(S.anim || S.drag || S.parts.length || S.shake > .2 || S.banner || S.sw || Object.keys(S.padHit).length);
  const cycling = () => !!(S.st && S.st.phase === 'setup' && S.st.arena === 'surprise' && !S.calm);   // Surprise preview rotates slowly
  function kick() { S.lastActive = performance.now(); ensureLoop(); }
  function ensureLoop() {
    if (S.raf) return;
    if (S.tmr) { clearTimeout(S.tmr); S.tmr = 0; }
    S.raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    S.raf = 0;
    if (!S.cv || !S.cv.isConnected) return;               // left the game — render() restarts us
    now = now || performance.now();
    const dt = S.last ? Math.min(50, Math.max(0, now - S.last)) : 16;
    S.last = now;
    if (!S.hold) step(dt);
    draw();
    if (S.raf || S.tmr) return;                           // a re-render inside step() already re-armed the loop
    if (busy()) S.raf = requestAnimationFrame(loop);
    else if (performance.now() - S.lastActive < 20000) S.tmr = setTimeout(() => { S.tmr = 0; S.raf = requestAnimationFrame(loop); }, 45);
    else if (cycling()) S.tmr = setTimeout(() => { S.tmr = 0; S.raf = requestAnimationFrame(loop); }, 400);   // no full-rate loop just to flip previews
    else S.last = 0;                                      // nothing moves: idle until a touch / a new state
  }
  function canPlan() {
    const c = S.ctx; if (!c || c.status !== 'active' || S.anim || !S.st || S.st.phase === 'setup') return false;
    return !submitted(S.st, c.me);
  }
  function submitted(st, me) { return !!(aimsOf(st, me) || memGet(memKey(st.mid, st.round, me))); }
  function draftFor(st) {
    const key = st.mid + ':' + st.round;
    if (S.draft.key !== key) S.draft = { key, v: [null, null, null, null] };
    return S.draft.v;
  }

  /* ---------------- projection (world → logical canvas px) ---------------- */
  function P(x, y) {
    const c = S.cam, u = S.flip * x - c.x, v = S.flip * y - c.y;
    return { X: CX + u * SC * c.z + S.sx, Y: CY + v * SC * TILT * c.z + S.sy, s: c.z * (1 + S.flip * y * 0.00035) };
  }
  const horizonY = () => HOR + S.sy * .4 - S.cam.y * SC * TILT * S.cam.z * .12 - (S.cam.z - 1) * 26;

  /* ---------------- input: select, drag to aim, drag back to cancel ---------------- */
  function toLogical(e) { const r = S.cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH }; }
  function pickPen(p) {
    const st = S.st, me = S.ctx.me; let best = -1, bd = 34 * 34;
    for (let k = 0; k < NP; k++) {
      const i = me * NP + k; if (!st.pens[i][2]) continue;
      const q = P(st.pens[i][0], st.pens[i][1]), dx = p.x - q.X, dy = p.y - (q.Y - 17 * q.s), d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  function onDown(e) {
    kick();
    if (!canPlan()) return;
    const p = toLogical(e), k = pickPen(p);
    if (k >= 0) { if (S.sel !== k) { S.sel = k; try { S.ctx.sound.tap(); } catch (x) {} } }
    else if (S.sel == null) return;
    S.drag = { k: S.sel, x0: p.x, y0: p.y, moved: false, onPen: k >= 0 };
    try { S.cv.setPointerCapture(e.pointerId); } catch (x) {}
    updateUI();
  }
  function onMove(e) {
    const d = S.drag; if (!d) return;
    if (!canPlan()) { S.drag = null; return; }
    const p = toLogical(e), dx = p.x - d.x0, dy = p.y - d.y0;
    if (!d.moved && dx * dx + dy * dy < 49) return;
    d.moved = true;
    const z = S.cam.z;
    let ax = S.flip * dx / (SC * z), ay = S.flip * dy / (SC * TILT * z);
    const len = Math.hypot(ax, ay);
    if (len > MAXA) { ax *= MAXA / len; ay *= MAXA / len; }
    draftFor(S.st)[d.k] = len < MINA ? null : [ax, ay];
    S.lastActive = performance.now();
    updateUI(); e.preventDefault();
  }
  function onUp() {
    const d = S.drag; S.drag = null; if (!d) return;
    if (!d.moved && !d.onPen) S.sel = null;              // tap on open ice → deselect
    else if (d.moved) { try { S.ctx.sound.move(); } catch (x) {} }
    updateUI(); kick();
  }
  function selectPen(k) {
    if (!canPlan()) return;
    S.sel = S.sel === k ? null : k;
    try { S.ctx.sound.tap(); } catch (x) {}
    updateUI(); kick();
  }
  function clearAims() {
    if (!canPlan()) return;
    const v = draftFor(S.st);
    if (S.sel != null && v[S.sel]) v[S.sel] = null; else { for (let k = 0; k < NP; k++) v[k] = null; S.sel = null; }
    try { S.ctx.sound.tap(); } catch (x) {}
    updateUI(); kick();
  }

  /* ---------------- sync: submit, self-heal, resolve (exactly one phone) ---------------- */
  function ready() {
    const c = S.ctx; if (!canPlan()) return;
    const st = norm(c.clone(c.state)), me = c.me, v = draftFor(st);
    const aims = v.map((d, k) => st.pens[me * NP + k][2] && d ? [Math.round(d[0] / MAXA * VMAX), Math.round(d[1] / MAXA * VMAX)] : [0, 0]);
    memSet(memKey(st.mid, st.round, me), aims);           // banked FIRST — a write race can't lose it now
    S.sel = null;
    try { c.sound.place(); } catch (e) {}
    if (!sync('ready')) rerender();
  }
  // Returns true if it committed. Deferred out of render (never nested in a paint).
  function sync(reason) {
    const c = S.ctx; if (!c || c.status !== 'active') return false;
    const st = norm(c.clone(c.state)), me = c.me, rk = st.mid + ':' + st.round;
    // I already resolved this round but the shared state is behind it. Usually that's just an older
    // snapshot still arriving, so give my write a moment to land; if it really was overwritten,
    // re-send the SAME outcome (never a second, different resolution).
    const mine = S.myRes[rk];
    if (mine) {
      const wait = RESEND_MS - (Date.now() - mine.t);
      if (wait > 0) { if (!mine.chk) mine.chk = setTimeout(() => { mine.chk = 0; sync(); }, wait + 30); return false; }
      mine.t = Date.now(); commitRes(c, mine); return true;
    }
    const m = memGet(memKey(st.mid, st.round, me));
    let changed = false;
    if (m && !realAims(st, me)) { st.aims['a' + me] = { r: st.round, v: m }; changed = true; }
    const both = !!(aimsOf(st, 0) && aimsOf(st, 1));
    if (both && (me === 0 || reason === 'fallback')) {
      const out = resolveRound(st, me);
      out.t = Date.now(); S.myRes[rk] = out;
      commitRes(c, out);                                  // commit FIRST — the replay is decoration
      return true;
    }
    if (both) armFallback(rk);
    if (changed) {
      if (!aimsOf(st, 1 - me)) st.turn = 1 - me;          // the clock follows whoever is still aiming
      c.commit(st);
      return true;
    }
    return false;
  }
  function commitRes(c, out) {
    S.resCommits++;
    const next = JSON.parse(JSON.stringify(out.next));
    if (out.winner === undefined) c.commit(next); else c.commit(next, out.winner);
  }
  // seat 1 only resolves if seat 0's phone hasn't within the grace (asleep, offline, backgrounded)
  function armFallback(rk) {
    if (S.fbKey === rk) return;
    S.fbKey = rk;
    setTimeout(() => {
      if (S.fbKey === rk) S.fbKey = null;
      const c = S.ctx; if (!c || c.status !== 'active') return;
      const cur = norm(c.clone(c.state));
      if (cur.mid + ':' + cur.round === rk && aimsOf(cur, 0) && aimsOf(cur, 1)) sync('fallback');
    }, FALLBACK_MS);
  }
  function scheduleSync(st, ctx) {
    if (ctx.status !== 'active') return;
    const me = ctx.me, rk = st.mid + ':' + st.round;
    const m = memGet(memKey(st.mid, st.round, me));
    if (S.myRes[rk] || (m && !realAims(st, me)) || (aimsOf(st, 0) && aimsOf(st, 1))) setTimeout(() => sync(), 0);
  }

  /* ---------------- replay a committed resolution ---------------- */
  function maybeReplay(st) {
    const res = st.res;
    if (!res || !res.id || S.done.has(res.id) || S.anim) return;
    if (res.init.length !== 2 * NP || res.L.length !== 2 * NP || res.fin.length !== 2 * NP) { doneAdd(res.id); return; }
    // the arena is a pure function of (id, round, match): replay from the same ice the resolver slid on
    const ar = BUILD[res.ar] ? res.ar : 'floe', mid = res.id.slice(0, res.id.lastIndexOf(':')), lv = (+res.r || 1) - 1;
    const geoA = geoFor(ar, lv, mid, res.R0), swap = !!(res.rg && BUILD[res.na] && res.na !== ar);
    const geoB = geoFor(swap ? res.na : ar, lv + 1, mid, res.R1);
    const sim = simulate(res.init, res.L, geoA);
    // determinism check (the snap below makes the committed result authoritative either way)
    let mis = 0;
    sim.fin.forEach((p, i) => { const f = res.fin[i]; if (Math.abs(p[0] - f[0]) > .01 || Math.abs(p[1] - f[1]) > .01 || (p[2] && !f[2] && (swap || geoB.in(p[0], p[1])))) mis++; });
    S.mismatch += mis;
    const outsSim = new Set(sim.outs.map(o => o.i));
    const shrinkOuts = [];
    res.fin.forEach((f, i) => { if (res.init[i][2] && !f[2] && !outsSim.has(i)) shrinkOuts.push(i); });
    const over = !!(st.over || (S.ctx && S.ctx.status === 'finished'));
    const lost = swap ? null : lostInfo(geoA, geoB);
    const doShrink = !swap && lost.chunks.length > 0 && (!over || shrinkOuts.length > 0), doSwap = swap && !over;
    const simEnd = sim.steps / 240;
    const lastOut = sim.outs.length ? sim.outs[sim.outs.length - 1].step / 240 : -9;
    const tailFall = Math.max(0, lastOut * 1000 + FALL_MS - simEnd * 1000);
    S.anim = {
      id: res.id, res, sim, geo: geoA, geoA, geoB, lost, phase: 'reveal', t: 0, total: 0, simT: 0, simEnd, hi: 0, oi: 0, bi: 0,
      slow: 0, slowUsed: 0, focus: null, falls: {}, broken: false, chunks: [], shrinkOuts, doShrink, doSwap, sw: null, from: null,
      pos: res.init.map(p => [p[0], p[1]]), vel: res.init.map(() => [0, 0]), on: res.init.map(p => !!p[2]), hop: res.init.map(() => 0),
      est: REVEAL + simEnd * 1000 + tailFall + 650 + (doShrink ? SHRINK_MS + (shrinkOuts.length ? FALL_MS : 0) : 0) + (doSwap ? SWAP_MS : 0),
    };
    S.sel = null; S.drag = null;
    if (S.ctx && res.by !== S.ctx.me) { try { S.ctx.sound.tap(); } catch (e) {} }
    kick();
  }
  function finishAnim() {
    const A = S.anim; if (!A) return;
    S.anim = null; doneAdd(A.id);
    A.res.fin.forEach((f, i) => { if (A.res.init[i][2] && !f[2]) addHat(i, A.falls[i] ? A.falls[i].ex : f[0], A.falls[i] ? A.falls[i].ey : f[1]); });
    const c = S.ctx;
    if (c) {
      const lost = [0, 1].map(s => aliveCount(A.res.init, s) - aliveCount(A.res.fin, s));
      const nm = s => c.players[s].name;
      const txt = !lost[0] && !lost[1] ? 'Nobody fell in… the ice holds'
        : lost[0] && lost[1] ? `SPLASH! ${nm(0)} −${lost[0]} · ${nm(1)} −${lost[1]}`
        : `SPLASH! ${nm(lost[0] ? 0 : 1)} −${lost[0] || lost[1]}`;
      S.banner = { text: txt, t: 0, col: !lost[0] && !lost[1] ? '#bfe9ff' : (lost[c.me] && !lost[1 - c.me] ? '#ff8fa8' : (lost[1 - c.me] && !lost[c.me] ? '#9dffcf' : '#ffe08a')) };
    }
    rerender();
  }
  function rerender() {
    const c = S.ctx; if (!c || !c.root || !c.root.isConnected) return;
    c.root.innerHTML = ''; DEF.render(c);
  }

  /* ---------------- per-frame simulation (cosmetic only) ---------------- */
  const WORDS = ['BONK!', 'WHAM!', 'BOOP!', 'POW!', 'THWACK!', 'OOF!'];
  const SAYS_HIT = ['rude!', 'oof', 'my beak!', 'hey!!', 'ow ow', 'not the face'];
  const SAYS_BYE = ['bye!', 'nooo', 'brb', 'cold!!', 'tell mum', 'wheee', 'blub'];
  const pick = a => a[Math.floor(Math.random() * a.length)];
  function onHit(A, h) {
    const s = h.s, big = s > 330;
    const n = Math.min(26, 6 + Math.round(s / 28));
    for (let q = 0; q < n; q++) {
      const a = rnd(0, 6.28), v = rnd(40, 120) * (s / 300);
      S.parts.push({ k: 'chip', x: h.x, y: h.y, z: rnd(8, 20), vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(60, 190) * Math.min(1.6, s / 280), life: rnd(500, 900), max: 900, sz: rnd(1.4, 3.2), c: Math.random() < .5 ? '#ffffff' : '#bfefff' });
    }
    S.parts.push({ k: 'star', x: h.x, y: h.y, z: 22, life: big ? 380 : 240, max: big ? 380 : 240, sz: Math.min(1.7, .6 + s / 420), rot: rnd(0, 1) });
    if (s > 220 && !S.parts.some(p => p.k === 'word' && p.max - p.life < 450)) S.parts.push({ k: 'word', x: h.x, y: h.y, z: 46, text: pick(WORDS), life: 900, max: 900, sz: Math.min(1.35, .8 + s / 900), rot: rnd(-.25, .25), c: s > 420 ? '#ffd23a' : '#ffffff' });
    [h.i, h.j].forEach(i => { const pv = S.pv[i]; if (!pv) return; pv.sq = Math.min(.3, s / 1500); if (s > 360) pv.dizzy = 900; });
    if (s > 300 && Math.random() < .45) S.parts.push({ k: 'say', i: Math.random() < .5 ? h.i : h.j, text: pick(SAYS_HIT), life: 1100, max: 1100 });
    if (!S.calm) {
      S.shake = Math.max(S.shake, Math.min(9, s / 55));
      if (big && A.slowUsed < 800) { A.slow = 380; A.focus = { x: h.x, y: h.y, t: 700 }; }
    }
    try { if (navigator.vibrate) navigator.vibrate(big ? 24 : 10); } catch (e) {}
    try { S.ctx.sound[big ? 'move' : 'tap'](); } catch (e) {}
  }
  function startFall(A, i, x, y, vx, vy, ride) {
    let sp = Math.hypot(vx, vy), dx = vx / (sp || 1), dy = vy / (sp || 1);
    if (sp < 60) { const d = Math.hypot(x, y) || 1; dx = x / d; dy = y / d; sp = 60; }
    const slide = ride ? 26 : Math.min(60, sp * .1) + 16;
    A.falls[i] = { t: 0, x, y, dx, dy, slide, splashed: false, ex: x + dx * slide, ey: y + dy * slide, ride };
    A.on[i] = false;
    S.parts.push({ k: 'say', i, text: '!!', life: 520, max: 520, small: true });
  }
  function onOut(A, o) { startFall(A, o.i, o.x, o.y, o.vx, o.vy, false); }
  function splash(A, i, f) {
    f.splashed = true;
    for (let q = 0; q < 22; q++) { const a = rnd(0, 6.28), v = rnd(20, 90); S.parts.push({ k: 'drop', x: f.ex, y: f.ey, z: -TH + 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(120, 320), life: rnd(500, 850), max: 850, sz: rnd(1.3, 3) }); }
    S.parts.push({ k: 'crown', x: f.ex, y: f.ey, life: 620, max: 620 });
    for (let q = 0; q < 3; q++) S.parts.push({ k: 'ripple', x: f.ex, y: f.ey, life: 900 + q * 260, max: 900 + q * 260, r0: 8 + q * 4, r1: 60 + q * 30 });
    S.parts.push({ k: 'say', x: f.ex, y: f.ey, text: pick(SAYS_BYE), life: 1500, max: 1500, float: true, seat: i < NP ? 0 : 1 });
    for (let q = 0; q < 6; q++) S.parts.push({ k: 'bub', x: f.ex + rnd(-8, 8), y: f.ey + rnd(-8, 8), life: 700 + q * 160, max: 700 + q * 160, sz: rnd(1.5, 3.2) });
    S.shake = Math.max(S.shake, S.calm ? 0 : 4);
    const c = S.ctx, mine = (i < NP ? 0 : 1) === (c ? c.me : 0);
    try { c.sound[mine ? 'bad' : 'good'](); } catch (e) {}
    setTimeout(() => addHat(i, f.ex, f.ey), 420);
  }
  function onBump(A, b) {
    const s = b.s;
    for (let q = 0; q < 8; q++) { const a = rnd(0, 6.28), v = rnd(30, 90); S.parts.push({ k: 'chip', x: b.x, y: b.y, z: rnd(6, 14), vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(50, 130), life: rnd(300, 600), max: 600, sz: rnd(1.3, 2.6), c: '#ffd9a0' }); }
    S.parts.push({ k: 'star', x: b.x, y: b.y, z: 12, life: 260, max: 260, sz: Math.min(1.3, .5 + s / 600), rot: rnd(0, 1) });
    let bj = -1, bd = -2; (A.geo.slots || []).forEach(j => { const u = uv(9 * j), d = b.x * u[0] + b.y * u[1]; if (d > bd) { bd = d; bj = j; } });
    if (bj >= 0) S.padHit[bj] = 1;
    [b.i].forEach(i => { const pv = S.pv[i]; if (pv) pv.sq = Math.min(.25, s / 1800); });
    if (!S.calm) S.shake = Math.max(S.shake, Math.min(5, s / 110));
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
    try { S.ctx.sound.tap(); } catch (e) {}
  }
  function breakIce(A) {
    A.broken = true;
    A.lost.chunks.forEach(c => {
      A.chunks.push({ pts: c.pts, dx: c.dx, dy: c.dy, sp: c.sp, rot: c.rot, cx: c.cx, cy: c.cy, col: c.col, flat: c.flat, t: 0 });
      for (let q = 0; q < 5; q++) { const p = c.pts[Math.floor(Math.random() * c.pts.length)], k = Math.random() * .6; S.parts.push({ k: 'chip', x: p[0] + (c.cx - p[0]) * k, y: p[1] + (c.cy - p[1]) * k, z: 2, vx: c.dx * rnd(10, 50), vy: c.dy * rnd(10, 50), vz: rnd(60, 160), life: rnd(400, 700), max: 700, sz: rnd(1.4, 2.8), c: c.col ? '#ffd9a0' : '#e6f8ff' }); }
    });
    A.geo = A.geoB;                                       // from here on the ice is the smaller one
    A.shrinkOuts.forEach(i => { const p = A.pos[i]; startFall(A, i, p[0], p[1], 0, 0, true); });
    S.shake = Math.max(S.shake, S.calm ? 0 : 6);
    try { S.ctx.sound.place(); } catch (e) {}
  }
  // roulette: the old arena sinks, the next one rises, survivors hop to its start slots
  function startSwap(A) {
    A.sw = { ga: A.geoA, gb: A.geoB, t: 0 };
    A.from = A.pos.map(p => [p[0], p[1]]);
    S.banner = { text: 'NEXT ARENA: ' + arenaName(A.geoB.id).toUpperCase(), t: 0, col: '#bfe9ff' };
    try { S.ctx.sound.place(); } catch (e) {}
  }
  function framePos(A) {
    const F = A.sim.frames, f = Math.min(F.length - 1, A.simT * 60), i0 = Math.floor(f), i1 = Math.min(F.length - 1, i0 + 1), a = f - i0;
    for (let i = 0; i < 2 * NP; i++) {
      if (!A.on[i]) continue;
      const x0 = F[i0][i * 2], y0 = F[i0][i * 2 + 1], x1 = F[i1][i * 2], y1 = F[i1][i * 2 + 1];
      A.pos[i][0] = x0 + (x1 - x0) * a; A.pos[i][1] = y0 + (y1 - y0) * a;
      A.vel[i][0] = (x1 - x0) * 60; A.vel[i][1] = (y1 - y0) * 60;
    }
  }
  function stepFalls(A, dt) {
    let busyF = false;
    for (const k in A.falls) {
      const f = A.falls[k];
      f.t += dt;
      if (f.t < FALL_MS) busyF = true;
      if (!f.splashed && fallZ(f) <= -TH) splash(A, +k, f);
    }
    return busyF;
  }
  function fallZ(f) { if (f.t < FALL_SLIDE) return 0; const u = Math.min(1, (f.t - FALL_SLIDE) / FALL_DROP); return -u * u * (TH + 48); }
  /* setup preview: the chosen arena with the start formation; changing arena (or a Surprise cycling) swaps it.
     The same cross-fade carries the preview into round 1, so "Surprise me" lands on its arena with a reveal. */
  const swapU = sw => Math.min(1, sw.t / (sw.dur || SWAP_MS)), swapE = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  const swapPos = (sw, i) => { const e = swapE(swapU(sw)), f = sw.from[i], t = sw.to[i]; return [f[0] + (t[0] - f[0]) * e, f[1] + (t[1] - f[1]) * e]; };
  const slotPos = (id, mid) => { const sl = slotsFor(geoFor(id, 0, mid, R_START)), o = []; for (let s = 0; s < 2; s++) sl.forEach(q => o.push([s ? -q[0] : q[0], s ? -q[1] : q[1]])); return o; };
  const previewWant = st => st.arena === 'surprise' ? (S.calm ? 'floe' : ARENA_IDS[Math.floor(S.tick / 1600) % ARENA_IDS.length]) : st.arena;
  function stepPreview(dt) {
    const st = S.st; if (!st) return;
    if (S.sw && !S.sw.anim) {                               // preview / entry swap (a replay's own swap lives on the replay)
      S.sw.t += dt;
      if (S.sw.t >= (S.sw.dur || SWAP_MS)) { S.pre.id = S.sw.toId; if (S.sw.entry) S.pre.id = null; S.prePos = S.sw.to; S.sw = null; }
    }
    if (st.phase !== 'setup') return;
    const want = previewWant(st);
    if (!S.pre.id) { S.pre.id = want; S.prePos = slotPos(want, st.mid); return; }
    if (S.sw && S.sw.toId !== want) { S.prePos = S.sw.to.map((q, i) => swapPos(S.sw, i)); S.pre.id = S.sw.toId; S.sw = null; }   // retarget mid-swap from where the penguins are now
    if (!S.sw && S.pre.id !== want) {
      const to = slotPos(want, st.mid);
      S.sw = { ga: geoFor(S.pre.id, 0, st.mid, R_START), gb: geoFor(want, 0, st.mid, R_START), t: S.calm ? PRE_MS * .7 : 0, dur: PRE_MS, from: S.prePos || slotPos(S.pre.id, st.mid), to, toId: want };
    }
  }
  function step(dt) {
    S.tick += dt;
    const A = S.anim;
    let wdt = dt;
    if (A) {
      const adt = dt * (S.speed || 1);
      A.total += adt;
      if (A.phase === 'reveal') {
        A.t += adt;
        if (A.t >= REVEAL) {
          A.phase = 'slide'; A.t = 0;
          try { S.ctx.sound.countdown(); } catch (e) {}
          A.res.L.forEach((v, i) => { if (A.on[i] && (v[0] || v[1])) { const p = A.pos[i]; for (let q = 0; q < 6; q++) S.parts.push({ k: 'puff', x: p[0] + rnd(-6, 6), y: p[1] + rnd(-6, 6), vx: -v[0] * rnd(.04, .1), vy: -v[1] * rnd(.04, .1), life: rnd(400, 650), max: 650, r: rnd(4, 8) }); } });
        }
      } else if (A.phase === 'slide') {
        let rate = 1;
        if (A.slow > 0 && !S.calm) { rate = .26; A.slow -= adt; A.slowUsed += adt; }
        wdt = dt * rate;
        A.simT = Math.min(A.simEnd, A.simT + adt / 1000 * rate);
        const stepNow = A.simT * 240 + 1e-6;
        while (A.hi < A.sim.hits.length && A.sim.hits[A.hi].step <= stepNow) onHit(A, A.sim.hits[A.hi++]);
        while (A.oi < A.sim.outs.length && A.sim.outs[A.oi].step <= stepNow) onOut(A, A.sim.outs[A.oi++]);
        while (A.bi < A.sim.bumps.length && A.sim.bumps[A.bi].step <= stepNow) onBump(A, A.sim.bumps[A.bi++]);
        framePos(A);
        const falling = stepFalls(A, adt * rate);
        if (A.simT >= A.simEnd && !falling) { A.phase = A.doShrink ? 'shrink' : (A.doSwap ? 'swap' : 'end'); A.t = 0; if (A.phase === 'swap') startSwap(A); }
      } else if (A.phase === 'shrink') {
        A.t += adt;
        if (!A.broken && A.t >= CRACK_MS) breakIce(A);
        A.chunks.forEach(ch => { ch.t += adt; });
        const falling = stepFalls(A, adt);
        if (A.t >= SHRINK_MS && !falling) A.phase = 'end';
      } else if (A.phase === 'swap') {
        A.t += adt; A.sw.t = A.t;
        const u = Math.min(1, A.t / SWAP_MS), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        A.res.rg.forEach((q, i) => { if (!A.res.fin[i][2]) return; const f = A.from[i]; A.pos[i][0] = f[0] + (q[0] - f[0]) * e; A.pos[i][1] = f[1] + (q[1] - f[1]) * e; A.hop[i] = S.calm ? 0 : Math.sin(Math.PI * u) * 26; A.vel[i][0] = 0; A.vel[i][1] = 0; });
        if (A.t >= SWAP_MS) A.phase = 'end';
      }
      if (A.phase === 'end' || A.total > 20000) finishAnim();
    }
    // penguins: blinks, glances, dizziness, squash
    S.pv.forEach((pv, i) => {
      pv.nextBlink -= dt; if (pv.nextBlink <= 0) { pv.blink = 130; pv.nextBlink = 1800 + Math.random() * 3600; }
      if (pv.blink > 0) pv.blink -= dt;
      pv.lookT -= dt; if (pv.lookT <= 0) { pv.lookT = 900 + Math.random() * 2600; pv.look = Math.random() < .5 ? 0 : rnd(-.8, .8); }
      if (pv.dizzy > 0) pv.dizzy -= dt;
      pv.sq *= Math.pow(.992, dt);
    });
    // particles (world time: they slow down with the slow motion too)
    const s = wdt / 1000;
    S.parts = S.parts.filter(p => {
      p.life -= wdt;
      if (p.k === 'chip' || p.k === 'drop') {
        p.x += p.vx * s; p.y += p.vy * s; p.vz -= 620 * s; p.z += p.vz * s;
        if (p.k === 'chip' && p.z < 0) {
          if (curGeo().in(p.x, p.y)) { p.z = 0; p.vz *= -.3; p.vx *= .5; p.vy *= .5; } else if (p.z < -TH) return false;
        }
        if (p.k === 'drop' && p.z < -TH) return false;
      } else if (p.k === 'puff') { p.x += p.vx * s; p.y += p.vy * s; p.r += 16 * s; }
      else if (p.k === 'word' || (p.k === 'say' && p.float)) p.z = (p.z || 30) + 22 * s;
      return p.life > 0;
    });
    if (S.parts.length > 500) S.parts.splice(0, S.parts.length - 500);
    if (S.banner) { S.banner.t += dt; if (S.banner.t > 2600) S.banner = null; }
    for (const j in S.padHit) { S.padHit[j] *= Math.pow(.9, dt / 16.7); if (S.padHit[j] < .03) delete S.padHit[j]; }
    stepPreview(dt);
    // camera: rest while planning; drift with the action; punch in on big hits
    let tg = { x: 0, y: 14, z: 1 };
    if (A && !S.calm) {
      if (A.focus && A.focus.t > 0) { A.focus.t -= dt; tg = { x: S.flip * A.focus.x * .85, y: S.flip * A.focus.y * .85 + 10, z: 1.22 }; }
      else if (A.phase === 'slide') {
        let mx = 0, my = 0, n = 0;
        A.pos.forEach((p, i) => { if (A.on[i] && (A.vel[i][0] || A.vel[i][1])) { mx += p[0]; my += p[1]; n++; } });
        if (n) tg = { x: S.flip * mx / n * .3, y: S.flip * my / n * .3 + 14, z: 1.07 };
      } else if (A.phase === 'shrink') tg = { x: 0, y: 20, z: .96 };
    }
    const e = 1 - Math.pow(1 - .085, dt / 16.7), c = S.cam;
    c.x += (tg.x - c.x) * e; c.y += (tg.y - c.y) * e; c.z += (tg.z - c.z) * e;
    S.shake *= Math.pow(.86, dt / 16.7); if (S.shake < .2) S.shake = 0;
    const sh = S.calm ? 0 : S.shake;
    S.sx = sh ? (Math.random() - .5) * sh * 2 : 0; S.sy = sh ? (Math.random() - .5) * sh * 2 : 0;
    S.snow.forEach(f => {
      f.y += 16 * f.z * dt / 1000 * 1.6; f.x += Math.sin(S.tick * .0011 + f.ph) * 7 * f.z * dt / 1000;
      if (f.y > VH + 4) { f.y = -4; f.x = Math.random() * VW; } if (f.x < -4) f.x = VW + 4; if (f.x > VW + 4) f.x = -4;
    });
  }

  /* ---------------- drawing ---------------- */
  function buildLayers() {
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.round(w * S.k); c.height = Math.round(h * S.k); const g = c.getContext('2d'); g.setTransform(S.k, 0, 0, S.k, 0, 0); return [c, g]; };
    const r = seeded(hashStr(S.mid + 'sky'));
    const [sky, b] = mk(VW, 170);
    const gr = b.createLinearGradient(0, 0, 0, 170);
    gr.addColorStop(0, '#01030c'); gr.addColorStop(.45, '#05132f'); gr.addColorStop(.75, '#0b2a52'); gr.addColorStop(1, '#16476e');
    b.fillStyle = gr; b.fillRect(0, 0, VW, 170);
    for (let i = 0; i < 150; i++) {
      const x = r() * VW, y = r() * 130, s = r() < .1 ? 1.5 : .4 + r() * .8;
      b.fillStyle = `rgba(234,244,255,${.25 + r() * .6})`; b.beginPath(); b.arc(x, y, s, 0, 7); b.fill();
    }
    const mx = 322, my = 40;                               // the moon, with a halo and craters
    const halo = b.createRadialGradient(mx, my, 6, mx, my, 62); halo.addColorStop(0, 'rgba(220,240,255,.34)'); halo.addColorStop(1, 'rgba(220,240,255,0)');
    b.fillStyle = halo; b.fillRect(mx - 70, my - 70, 140, 140);
    const moon = b.createRadialGradient(mx - 5, my - 5, 2, mx, my, 15); moon.addColorStop(0, '#ffffff'); moon.addColorStop(1, '#bcd4ee');
    b.fillStyle = moon; b.beginPath(); b.arc(mx, my, 14, 0, 7); b.fill();
    b.fillStyle = 'rgba(90,120,160,.22)'; [[-4, 3, 3.4], [5, -4, 2.4], [3, 6, 1.8]].forEach(([dx, dy, rr]) => { b.beginPath(); b.arc(mx + dx, my + dy, rr, 0, 7); b.fill(); });
    // distant ice ridges + icebergs on the horizon (a wider strip → parallax)
    const [berg, e] = mk(VW * 1.4, 60), W2 = VW * 1.4;
    const ridge = (base, amp, col, top, n) => {
      e.beginPath(); e.moveTo(0, 60);
      let x = 0; e.lineTo(0, base);
      while (x < W2) { const w = 18 + r() * 40, h = amp * (.3 + r() * .7); e.lineTo(x + w * .5, base - h); e.lineTo(x + w, base - h * r() * .3); x += w; }
      e.lineTo(W2, 60); e.closePath();
      const g2 = e.createLinearGradient(0, base - amp, 0, 60); g2.addColorStop(0, top); g2.addColorStop(1, col);
      e.fillStyle = g2; e.fill();
    };
    ridge(44, 30, '#0a2342', '#3a78a8', 0);
    ridge(52, 16, '#0c2a4c', '#6fb1dc', 0);
    for (let i = 0; i < 5; i++) {                          // flat-topped bergs
      const x = r() * W2, w = 16 + r() * 30, h = 5 + r() * 8;
      e.fillStyle = '#9fd3f2'; e.beginPath(); e.moveTo(x, 56); e.lineTo(x + 3, 56 - h); e.lineTo(x + w - 4, 56 - h - 1); e.lineTo(x + w, 56); e.closePath(); e.fill();
      e.fillStyle = 'rgba(20,60,100,.55)'; e.fillRect(x + w * .55, 56 - h, w * .45, h);
    }
    // sea + vignette are full-canvas gradients: bake them once, blit every frame
    const [sea, sg] = mk(VW, 400), sgr = sg.createLinearGradient(0, 0, 0, 400);
    sgr.addColorStop(0, '#0d3556'); sgr.addColorStop(.25, '#082748'); sgr.addColorStop(1, '#020a1b');
    sg.fillStyle = sgr; sg.fillRect(0, 0, VW, 400);
    const ar = sg.createLinearGradient(0, 0, 0, 70); ar.addColorStop(0, 'rgba(90,255,190,.14)'); ar.addColorStop(1, 'rgba(90,255,190,0)');
    sg.globalCompositeOperation = 'lighter'; sg.fillStyle = ar; sg.fillRect(0, 0, VW, 70);
    const [vig, vg] = mk(VW, VH), v = vg.createRadialGradient(VW / 2, VH * .55, VH * .3, VW / 2, VH * .55, VW * .78);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,4,14,.5)'); vg.fillStyle = v; vg.fillRect(0, 0, VW, VH);
    S.layers = { sky, berg, sea, vig };
    S.layerKey = S.mid + ':' + S.W;
  }
  function draw() {
    const g = S.g, st = S.st; if (!g || !st || !S.ctx) return;
    if (!S.W) fit(); if (!S.W) return;
    if (S.layerKey !== S.mid + ':' + S.W) buildLayers();
    const k = S.k, A = S.anim, setup = st.phase === 'setup';
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.setTransform(k, 0, 0, k, 0, 0);
    const hy = horizonY();
    g.drawImage(S.layers.sky, 0, hy - 150, VW, 170);
    drawAurora(g, hy);
    g.drawImage(S.layers.berg, -VW * .2 - S.cam.x * SC * S.cam.z * .12 + S.sx * .3, hy - 56, VW * 1.4, 60);
    drawSea(g, hy);
    const SW = A && A.phase === 'swap' ? A.sw : S.sw, geo = SW ? null : curGeo();
    // what breaks off after this round (same arena only; roulette swaps the whole arena instead)
    const nxt = SW || setup ? null : !A ? (st.roulette || st.over ? null : geoOf(st.arena, st, 1)) : (A.phase === 'shrink' && !A.broken ? A.geoB : null);
    // things on the water BEHIND the ice first (the ice hides them), the ones in front after it
    const far = (x, y) => S.flip * y < 0;
    drawHats(g, true); drawParts(g, 'sea', true);
    if (A) A.chunks.forEach(ch => { if (far(ch.cx, ch.cy)) drawChunk(g, ch); });
    if (SW) drawSwap(g, SW); else { drawArena(g, geo, A, nxt); drawBumpers(g, geo, nxt, true); }
    if (A) A.chunks.forEach(ch => { if (!far(ch.cx, ch.cy)) drawChunk(g, ch); });
    drawHats(g, false); drawParts(g, 'sea', false);
    drawParts(g, 'ground');
    drawPenguins(g, st, A);
    if (!SW) drawBumpers(g, geo, nxt, false);
    // arrows: mine while planning; EVERYONE's only during the reveal of a committed resolution
    S.frameArrows = [];
    const me = S.ctx.me;
    if (A && A.phase === 'reveal') {
      A.res.L.forEach((v, i) => { if (A.res.init[i][2] && (v[0] || v[1])) drawArrow(g, i, A.pos[i][0], A.pos[i][1], v[0] / VMAX * MAXA, v[1] / VMAX * MAXA, Math.min(1, A.t / 200), true); });
    } else if (!A && !setup) {
      const v = myArrows(st, me);
      v.forEach((d, k2) => { const i = me * NP + k2; if (d && st.pens[i][2]) drawArrow(g, i, st.pens[i][0], st.pens[i][1], d[0], d[1], submitted(st, me) ? .55 : 1, false); });
    }
    drawParts(g, 'air');
    drawSnow(g);
    // screen space
    g.drawImage(S.layers.vig, 0, 0, VW, VH);
    drawHud(g, st, A);
  }
  function myArrows(st, me) {
    const a = aimsOf(st, me);
    if (a && !a.skip) return a.v.map(v => v && (v[0] || v[1]) ? [v[0] / VMAX * MAXA, v[1] / VMAX * MAXA] : null);
    const m = memGet(memKey(st.mid, st.round, me));
    if (m) return m.map(v => v && (v[0] || v[1]) ? [v[0] / VMAX * MAXA, v[1] / VMAX * MAXA] : null);
    if (a) return [null, null, null, null];
    return draftFor(st);
  }
  function drawAurora(g, hy) {
    g.save(); g.globalCompositeOperation = 'lighter';
    const t = S.tick * .00045;
    [['90,255,190', 0, 1], ['120,150,255', 2.3, .8], ['60,255,150', 4.1, .7]].forEach(([col, off, a], i) => {
      const base = hy - 100 + i * 18;
      g.beginPath();
      for (let x = -20; x <= VW + 20; x += 20) { const y = base + Math.sin(x * .014 + t * 3 + off) * 14 + Math.sin(x * .031 + off - t) * 6; x < -10 ? g.moveTo(x, y) : g.lineTo(x, y); }
      for (let x = VW + 20; x >= -20; x -= 20) { const y = base + 46 + Math.sin(x * .014 + t * 3 + off) * 14; g.lineTo(x, y); }
      g.closePath();
      const gr = g.createLinearGradient(0, base - 14, 0, base + 60);
      gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(.25, `rgba(${col},${.22 * a})`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fill();
    });
    g.restore();
  }
  function drawSea(g, hy) {
    g.drawImage(S.layers.sea, 0, hy, VW, 400);
    g.save(); g.globalCompositeOperation = 'lighter';
    // moonlight glitter column
    for (let i = 0; i < 18; i++) {
      const y = hy + 4 + i * i * 1.05, a = .1 + .25 * (.5 + .5 * Math.sin(S.tick * .004 + i * 1.7));
      if (y > VH) break;
      const w = 3 + i * .9, x = 322 - S.cam.x * SC * .05 + Math.sin(S.tick * .002 + i) * (2 + i * .5);
      g.strokeStyle = `rgba(215,235,255,${a})`; g.lineWidth = 1 + i * .06;
      g.beginPath(); g.moveTo(x - w, y); g.lineTo(x + w, y); g.stroke();
    }
    // shimmer on the swell around the floe
    const gg = S.sw ? S.sw.gb : curGeo();
    S.shim.forEach(p => {
      if (gg.in(p.x, p.y)) return;
      const q = P(p.x, p.y); if (q.Y < hy + 3 || q.Y > VH + 2 || q.X < -20 || q.X > VW + 20) return;
      const a = (.05 + .17 * (.5 + .5 * Math.sin(S.tick * p.sp + p.ph))) * Math.min(1, (q.Y - hy) / 60);
      g.strokeStyle = `rgba(150,225,255,${a})`; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(q.X - p.len * q.s, q.Y); g.lineTo(q.X + p.len * q.s, q.Y); g.stroke();
    });
    g.restore();
  }
  const poly = (g, pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
  const multi = (g, L, dy) => { g.beginPath(); L.forEach(pp => { pp.forEach((p, i) => i ? g.lineTo(p[0], p[1] + (dy || 0)) : g.moveTo(p[0], p[1] + (dy || 0))); g.closePath(); }); };
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const arenaName = id => (ARENAS.find(a => a.id === id) || ARENAS[0]).name;
  // the ice as drawable outlines (world coords, wobbled like the old floe); holes wind the other way round
  function arenaD(geo) {
    if (geo._d && geo._dk === S.mid) return geo._d;
    const polys = [], circ = (cx, cy, R, hole) => {
      const pts = []; for (let i = 0; i < 72; i++) { const a = (hole ? -i : i) / 72 * 6.2832, rr = rimR(a, R); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
      polys.push({ pts, hole: !!hole, c: [cx, cy], r: R });
    }, rect = (x0, y0, x1, y1) => polys.push({ pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], hole: false });
    if (geo.id === 'donut') { circ(0, 0, RO); circ(0, 0, geo.HR, true); }
    else if (geo.id === 'twin') { circ(-IC, 0, geo.ir); circ(IC, 0, geo.ir); if (geo.br) rect(-BX, -BY, BX, BY); }
    else if (geo.id === 'ice') { for (let k = 0; k < TN * TN; k++) if (!geo.dead[k]) { const x0 = (k % TN) * TS - TO + 1.5, y0 = Math.floor(k / TN) * TS - TO + 1.5; rect(x0, y0, x0 + TS - 3, y0 + TS - 3); } }
    else circ(0, 0, geo.R);
    geo._d = { polys }; geo._dk = S.mid;
    return geo._d;
  }
  const arenaTops = geo => arenaD(geo).polys.map(pl => pl.pts.map(p => { const q = P(p[0], p[1]); return [q.X, q.Y]; }));
  const padStrip = (a, j) => {
    const o = [], n = [], R = a.R;
    for (let d = -3; d <= 3; d++) { const u = uv(9 * j + d); o.push([u[0] * (R - 2), u[1] * (R - 2)]); n.unshift([u[0] * (R - 13), u[1] * (R - 13)]); }
    const u = uv(9 * j);
    return { pts: o.concat(n), dx: u[0], dy: u[1], sp: 1.7, rot: 0, cx: u[0] * (R - 7), cy: u[1] * (R - 7), col: '#ffb03b' };
  };
  // What breaks off between two levels of one arena: chunks fly away, cuts are the crack lines racing round them.
  function lostInfo(a, b) {
    const key = a.id + a.lv + ':' + (a.R || 0) + '>' + b.lv + ':' + (b.R || 0) + ':' + S.mid;
    if (a._li && a._li.k === key) return a._li.v;
    const chunks = [], cuts = [], off = S.rimPh[0];
    const ring = (cx, cy, ro, ri, n, out, cutR) => {
      for (let c = 0; c < n; c++) {
        const a0 = off + c / n * 6.2832, a1 = off + (c + 1) / n * 6.2832, pts = [];
        for (let q = 0; q <= 6; q++) { const t = a0 + (a1 - a0) * q / 6, r = rimR(t, ro); pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
        for (let q = 6; q >= 0; q--) { const t = a0 + (a1 - a0) * q / 6, r = rimR(t, ri); pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
        const am = (a0 + a1) / 2, sg = out ? 1 : -1, mr = (ro + ri) / 2;
        chunks.push({ pts, dx: Math.cos(am) * sg, dy: Math.sin(am) * sg, sp: rnd(.8, 1.3), rot: rnd(-.08, .08), cx: cx + Math.cos(am) * mr, cy: cy + Math.sin(am) * mr });
      }
      const cp = []; for (let q = 0; q < 72; q++) { const t = q / 72 * 6.2832, r = rimR(t, cutR); cp.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]); }
      cuts.push({ pts: cp, closed: true });
    };
    if (a.id === 'floe' || a.id === 'bumper' || a.id === 'current') {
      ring(0, 0, a.R, b.R, 9, true, b.R);
      if (a.id === 'bumper') (a.slots || []).forEach(j => { if ((b.slots || []).indexOf(j) < 0) chunks.push(padStrip(a, j)); });
    } else if (a.id === 'donut') ring(0, 0, b.HR, a.HR, 9, false, b.HR);
    else if (a.id === 'twin') {
      if (a.br && !b.br) {
        for (let q = 0; q < 4; q++) { const x0 = -BXV + q * BXV / 2, x1 = x0 + BXV / 2; chunks.push({ pts: [[x0, -BY], [x1, -BY], [x1, BY], [x0, BY]], dx: 0, dy: q % 2 ? .25 : -.25, sp: .25, rot: 0, cx: (x0 + x1) / 2, cy: 0, flat: 1 }); }
        cuts.push({ pts: [[-BXV + 1, -BY], [-BXV + 1, BY]] }, { pts: [[BXV - 1, -BY], [BXV - 1, BY]] });
      } else if (b.ir < a.ir) { ring(-IC, 0, a.ir, b.ir, 6, true, b.ir); ring(IC, 0, a.ir, b.ir, 6, true, b.ir); }
    } else if (a.id === 'ice') {
      (a.doom || []).forEach(k => {
        const x0 = (k % TN) * TS - TO + 1.5, y0 = Math.floor(k / TN) * TS - TO + 1.5, w = TS - 3, pts = [[x0, y0], [x0 + w, y0], [x0 + w, y0 + w], [x0, y0 + w]], cr = [];
        for (let q = 0; q <= 7; q++) cr.push([x0 + 6 + (w - 12) * q / 7 + (q % 2 ? 7 : -5) * (k % 2 ? 1 : -1), y0 + 6 + (w - 12) * q / 7 + (q % 2 ? -6 : 6)]);
        chunks.push({ pts, dx: 0, dy: 0, sp: .12, rot: 0, cx: x0 + w / 2, cy: y0 + w / 2, flat: 1, crack: cr });
        cuts.push({ pts, closed: true });
      });
    }
    const v = { chunks, cuts };
    a._li = { k: key, v };
    return v;
  }
  const curFade = A => { const st = A.simT * 240; return st < CUR_S1 ? 1 : st < CUR_S2 ? (CUR_S2 - st) / (CUR_S2 - CUR_S1) : 0; };
  function drawArena(g, geo, A, nxt) {
    const z = S.cam.z, D = arenaD(geo), c = P(0, 0), e = geo.ext * SC * z, ga = g.globalAlpha;
    const top = arenaTops(geo), low = top.map(pp => pp.map(p => [p[0], p[1] + TH * z]));
    // light spilling into the water under the ice + the submerged skirt
    g.save(); g.globalCompositeOperation = 'lighter';
    const glows = D.polys.filter(pl => !pl.hole && pl.c);
    (glows.length ? glows : [{ c: [0, 0], r: geo.ext }]).forEach(pl => {
      const q = P(pl.c[0], pl.c[1]), r = pl.r * SC * z, gl = g.createRadialGradient(q.X, q.Y + TH * z, r * .5, q.X, q.Y + TH * z, r * 1.45);
      gl.addColorStop(0, 'rgba(80,200,255,.2)'); gl.addColorStop(1, 'rgba(80,200,255,0)');
      g.fillStyle = gl; g.beginPath(); g.ellipse(q.X, q.Y + TH * z, r * 1.45, r * 1.45 * TILT, 0, 0, 7); g.fill();
      if (pl.c) { g.fillStyle = 'rgba(70,170,220,.16)'; g.beginPath(); g.ellipse(q.X, q.Y + TH * z + 8 * z, r * 1.06, r * 1.06 * TILT, 0, 0, 7); g.fill(); }
    });
    g.restore();
    if (geo.id === 'donut') {                               // the deadly middle: dark water, slowly turning
      const hr = geo.HR * SC * z;
      g.save(); g.fillStyle = 'rgba(2,10,27,.62)'; g.beginPath(); g.ellipse(c.X, c.Y + TH * z, hr, hr * TILT, 0, 0, 7); g.fill();
      g.lineWidth = 1.2; for (let q = 1; q <= 3; q++) { g.setLineDash([5 + q, 9]); g.lineDashOffset = S.calm ? 0 : S.tick * .012 * (q % 2 ? 1 : -1) * q; g.strokeStyle = `rgba(150,225,255,${.42 - q * .1})`; g.beginPath(); g.ellipse(c.X, c.Y + TH * z, hr * q / 3.4, hr * q / 3.4 * TILT, 0, 0, 7); g.stroke(); }
      g.restore();
    }
    // slab sides, lit from the upper left: only the edges that face the viewer
    for (let n = 0; n < top.length; n++) {
      const tp = top[n], lw = low[n];
      for (let i = 0; i < tp.length; i++) {
        const j = (i + 1) % tp.length, a = tp[i], b = tp[j];
        if (b[0] - a[0] > -0.01) continue;
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, lit = -(b[1] - a[1]) / l;
        g.fillStyle = `hsl(199,62%,${58 + lit * 16}%)`;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(lw[j][0], lw[j][1] + .6); g.lineTo(lw[i][0], lw[i][1] + .6); g.closePath(); g.fill();
      }
    }
    const sideShade = g.createLinearGradient(0, c.Y, 0, c.Y + e * TILT + TH * z);
    sideShade.addColorStop(0, 'rgba(10,50,90,0)'); sideShade.addColorStop(1, 'rgba(10,50,90,.45)');
    g.fillStyle = sideShade; multi(g, low); g.fill();
    // foam at the waterline (animated)
    g.save(); g.setLineDash([3, 7]); g.lineDashOffset = -S.tick * .012;
    g.strokeStyle = 'rgba(235,250,255,.55)'; g.lineWidth = 1.3; multi(g, low, 1); g.stroke();
    g.setLineDash([]); g.strokeStyle = 'rgba(200,240,255,.12)'; g.lineWidth = 5; g.stroke(); g.restore();
    // top face
    const gr = g.createRadialGradient(c.X - e * .25, c.Y - e * TILT * .4, 4, c.X, c.Y, e * 1.05);
    gr.addColorStop(0, '#fbfeff'); gr.addColorStop(.55, '#dff3fc'); gr.addColorStop(1, '#a8d8ef');
    g.fillStyle = gr; multi(g, top); g.fill();
    g.save(); multi(g, top); g.clip();
    // soft aurora sheen sliding across the ice
    const sx = c.X + Math.sin(S.tick * .00035) * e * .6, sh = g.createLinearGradient(sx - 60, 0, sx + 60, 0);
    sh.addColorStop(0, 'rgba(140,255,210,0)'); sh.addColorStop(.5, 'rgba(140,255,210,.13)'); sh.addColorStop(1, 'rgba(140,255,210,0)');
    g.fillStyle = sh; g.fillRect(sx - 60, 0, 120, VH);
    // frozen cracks
    S.cracks.forEach(cr => {
      g.beginPath(); cr.pts.forEach((p, i) => { const q = P(p[0], p[1]); i ? g.lineTo(q.X, q.Y) : g.moveTo(q.X, q.Y); });
      g.strokeStyle = 'rgba(60,130,175,.42)'; g.lineWidth = cr.w * z; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = .6 * z; g.save(); g.translate(0, .8); g.stroke(); g.restore();
    });
    if (geo.id === 'ice') top.forEach((pp, i) => {          // every tile a slightly different slab, with a lit top-left bevel
      const v = Math.abs(Math.sin(i * 12.9898 + S.rimPh[1] * 7.3)) % 1;
      poly(g, pp); g.fillStyle = v > .5 ? `rgba(255,255,255,${(v - .5) * .3})` : `rgba(60,130,190,${(.5 - v) * .22})`; g.fill();
      g.beginPath(); g.moveTo(pp[3][0], pp[3][1] - 1); g.lineTo(pp[0][0], pp[0][1]); g.lineTo(pp[1][0], pp[1][1]); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2; g.stroke();
    });
    // the current: streaks of flow drifting across the ice
    if (geo.cur) {
      const f = !A ? 1 : A.phase === 'reveal' ? 1 : A.phase === 'slide' ? curFade(A) : 0;
      if (f > 0) {
        const u = uv(9 * geo.dir), ph = S.calm ? 0 : (S.tick * .03) % 80;
        g.lineCap = 'round'; g.lineWidth = 1.9 * z;
        for (let gx = -4; gx <= 4; gx++) for (let gy = -4; gy <= 4; gy++) {
          const wx = gx * 80 + (gy & 1 ? 40 : 0) + u[0] * ph, wy = gy * 80 + u[1] * ph, q0 = P(wx, wy), q1 = P(wx + u[0] * 40, wy + u[1] * 40), fade = Math.sin(ph / 80 * Math.PI);
          g.strokeStyle = `rgba(50,135,195,${.62 * f * (S.calm ? .8 : fade)})`; g.beginPath(); g.moveTo(q0.X, q0.Y); g.lineTo(q1.X, q1.Y); g.stroke();
        }
      }
    }
    // what breaks off after THIS round (planning), or the crack racing round it (shrink)
    if (nxt) {
      const info = lostInfo(geo, nxt), prog = A && A.phase === 'shrink' ? Math.min(1, A.t / CRACK_MS) : 1;
      if (!A) { g.fillStyle = geo.id === 'ice' ? 'rgba(40,110,160,.16)' : 'rgba(40,110,160,.07)'; info.chunks.forEach(ch => { if (!ch.col) { poly(g, ch.pts.map(p => { const q = P(p[0], p[1]); return [q.X, q.Y]; })); g.fill(); } }); }
      info.cuts.forEach(cu => {
        const sp = cu.pts.map(p => { const q = P(p[0], p[1]); return [q.X, q.Y]; }), n = Math.max(2, Math.round(sp.length * prog));
        g.beginPath();
        for (let i = 0; i < n && i < sp.length + (cu.closed ? 1 : 0); i++) { const p = sp[i % sp.length], jg = (i % 3 - 1) * 1.1; i ? g.lineTo(p[0], p[1] + jg) : g.moveTo(p[0], p[1] + jg); }
        if (A) { g.strokeStyle = 'rgba(20,70,120,.85)'; g.lineWidth = 2.2 * z; g.stroke(); g.strokeStyle = `rgba(190,245,255,${.5 + .5 * Math.sin(S.tick * .03)})`; g.lineWidth = 1; g.stroke(); }
        else { g.setLineDash([4, 5]); g.strokeStyle = 'rgba(40,110,165,.5)'; g.lineWidth = 1.3; g.stroke(); g.setLineDash([]); }
      });
      info.chunks.forEach(ch => {                          // doomed tiles: a crack zig-zags across them
        if (!ch.crack) return;
        g.beginPath(); ch.crack.forEach((p, i) => { const q = P(p[0], p[1]); i ? g.lineTo(q.X, q.Y) : g.moveTo(q.X, q.Y); });
        g.strokeStyle = 'rgba(20,70,120,.75)'; g.lineWidth = 1.8 * z; g.stroke(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = .7 * z; g.save(); g.translate(0, .9); g.stroke(); g.restore();
      });
    }
    // snow drifts pooled near the rim
    g.globalAlpha = ga * .5; g.fillStyle = '#ffffff';
    D.polys.forEach(pl => { if (!pl.c) return; for (let i = 0; i < 10; i++) { const a = i * .63 + S.rimPh[0], rr = pl.hole ? pl.r * 1.14 : pl.r * .86, q = P(pl.c[0] + Math.cos(a) * rr, pl.c[1] + Math.sin(a) * rr); g.beginPath(); g.ellipse(q.X, q.Y, 14 * z, 4 * z, 0, 0, 7); g.fill(); } });
    g.globalAlpha = ga;
    g.restore();
    multi(g, top); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.4; g.stroke();
    g.save(); multi(g, top); g.clip(); g.strokeStyle = 'rgba(80,150,200,.3)'; g.lineWidth = 6; multi(g, top, 2); g.stroke(); g.restore();
  }
  // rubber bumpers: amber cushions along the rim (far ones sit behind the penguins, near ones in front)
  function drawBumpers(g, geo, nxt, far) {
    if (!geo || !geo.slots) return;
    const z = S.cam.z, Rp = geo.R - 8;
    geo.slots.forEach(j => {
      const u0 = uv(9 * j); if ((S.flip * u0[1] < 0) !== far) return;
      const pts = []; for (let d = -3; d <= 3; d++) { const u = uv(9 * j + d), q = P(u[0] * Rp, u[1] * Rp); pts.push([q.X, q.Y]); }
      const doomed = nxt && nxt.slots.indexOf(j) < 0, hit = S.padHit[j] || 0, pulse = doomed ? (S.calm ? .6 : .5 + .5 * Math.sin(S.tick * .012)) : 0;
      const path = dy => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1] + dy) : g.moveTo(p[0], p[1] + dy)); };
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      path(3 * z); g.strokeStyle = 'rgba(40,20,0,.5)'; g.lineWidth = 10.5 * z; g.stroke();
      path(-1 * z); g.strokeStyle = '#b86a10'; g.lineWidth = 9.5 * z; g.stroke();
      path(-3.2 * z); g.strokeStyle = hit > .05 ? '#fff0c0' : '#ffb03b'; g.lineWidth = 8 * z; g.stroke();
      path(-4.8 * z); g.strokeStyle = `rgba(255,255,255,${.5 + hit * .5})`; g.lineWidth = 2.2 * z; g.stroke();
      if (doomed) { path(-3.2 * z); g.strokeStyle = `rgba(255,255,255,${.12 + .5 * pulse})`; g.lineWidth = 8 * z; g.stroke(); }
      g.restore();
    });
  }
  // roulette / entry: one arena sinks while the next rises
  function drawSwap(g, sw) {
    const u = swapU(sw), a = smooth(u / .6), b = smooth((u - .3) / .7), z = S.cam.z, rise = S.calm ? 0 : 34;   // reduced motion: a plain cross-fade
    const one = (geo, al, dy) => { if (al <= .01) return; g.save(); g.globalAlpha = al; g.translate(0, dy * z); drawArena(g, geo, null, null); drawBumpers(g, geo, null, true); drawBumpers(g, geo, null, false); g.restore(); };
    one(sw.ga, 1 - a, a * rise); one(sw.gb, b, (1 - b) * rise);
  }
  function drawChunk(g, ch) {
    const u = Math.min(1, ch.t / 700), move = (1 - (1 - u) * (1 - u)) * 34 * ch.sp, sink = Math.max(0, ch.t - 260) / 700;
    const a = Math.max(0, 1 - Math.max(0, ch.t - 450) / 650); if (a <= 0) return;
    const z = S.cam.z, dz = sink * sink * (ch.flat ? 60 : 34);
    const top = ch.pts.map(p => { const q = P(p[0] + ch.dx * move, p[1] + ch.dy * move); return [q.X, q.Y + dz * z]; });
    g.save(); g.globalAlpha = a;
    g.fillStyle = ch.col ? '#b86a10' : 'hsl(199,55%,52%)'; poly(g, top.map(p => [p[0], p[1] + TH * z * Math.max(.2, 1 - sink)])); g.fill();
    g.fillStyle = ch.col || '#d6effa'; poly(g, top); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1; g.stroke();
    g.restore();
  }
  function drawArrow(g, i, x, y, ax, ay, alpha, reveal) {
    const seat = i < NP ? 0 : 1, me = S.ctx.me;
    if (seat === me) S.arrows.own++; else if (reveal) S.arrows.foeReveal++; else S.arrows.foePlanning++;
    S.frameArrows.push(i);
    const a = P(x, y), b = P(x + ax, y + ay), dx = b.X - a.X, dy = b.Y - a.Y, len = Math.hypot(dx, dy);
    if (len < 4) return;
    const ux = dx / len, uy = dy / len, px = -uy, py = ux, col = S.ctx.players[seat].color;
    const pw = Math.min(1, Math.hypot(ax, ay) / MAXA), s = a.s;
    const start = Math.min(len * .4, 15 * s), head = Math.min(len * .45, 15 * s), w0 = 2.2 * s, w1 = (4 + pw * 2.6) * s, hw = (8 + pw * 3.4) * s;
    const sxp = a.X + ux * start, syp = a.Y + uy * start, hx = b.X - ux * head, hy = b.Y - uy * head;
    g.save(); g.globalAlpha = alpha;
    if (reveal) { g.shadowColor = col; g.shadowBlur = 14; }
    const gr = g.createLinearGradient(sxp, syp, b.X, b.Y); gr.addColorStop(0, hexA(col, .15)); gr.addColorStop(1, hexA(col, .95));
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(sxp + px * w0, syp + py * w0); g.lineTo(hx + px * w1, hy + py * w1); g.lineTo(hx + px * hw, hy + py * hw); g.lineTo(b.X, b.Y);
    g.lineTo(hx - px * hw, hy - py * hw); g.lineTo(hx - px * w1, hy - py * w1); g.lineTo(sxp - px * w0, syp - py * w0); g.closePath();
    g.fill(); g.shadowBlur = 0;
    g.strokeStyle = 'rgba(6,16,32,.5)'; g.lineWidth = 2.4; g.stroke(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = .9; g.stroke();
    g.restore();
  }
  function penState(i, st, A) {
    // → { x, y, z, vx, vy, on, fall }
    if (A) {
      const f = A.falls[i];
      if (f) {
        const u = Math.min(1, f.t / FALL_SLIDE), e = 1 - (1 - u) * (1 - u);
        return { x: f.x + f.dx * f.slide * e, y: f.y + f.dy * f.slide * e, z: fallZ(f), vx: f.dx * 200 * (1 - u), vy: f.dy * 200 * (1 - u), fall: f };
      }
      if (!A.res.init[i][2]) return null;
      return { x: A.pos[i][0], y: A.pos[i][1], z: A.hop[i] || 0, vx: A.vel[i][0], vy: A.vel[i][1] };
    }
    if (S.sw && S.sw.from) {                               // preview / entry swap: hop from the old slot to the new one
      const u = swapU(S.sw), f = S.sw.from[i], t = S.sw.to[i];
      if (f && t && (st.phase === 'setup' || st.pens[i][2])) { const q = swapPos(S.sw, i); return { x: q[0], y: q[1], z: S.calm ? 0 : Math.sin(Math.PI * u) * 26, vx: 0, vy: 0 }; }
    }
    if (st.phase === 'setup') { const p = S.prePos && S.prePos[i]; return p ? { x: p[0], y: p[1], z: 0, vx: 0, vy: 0 } : null; }
    const p = st.pens[i]; if (!p[2]) return null;
    return { x: p[0], y: p[1], z: 0, vx: 0, vy: 0 };
  }
  function drawPenguins(g, st, A) {
    const list = [], c = S.ctx, me = c.me, planning = canPlan(), mineV = !A ? myArrows(st, me) : null;
    for (let i = 0; i < 2 * NP; i++) { const ps = penState(i, st, A); if (ps) { ps.i = i; ps.q = P(ps.x, ps.y); list.push(ps); } }
    // the partner's "thinking…/READY" bubble floats over one of their standing penguins
    let anchor = -1;
    if (!A && c.status === 'active' && st.phase !== 'setup') [1, 2, 0, 3].some(k => { const i = (1 - me) * NP + k; if (st.pens[i][2]) { anchor = i; return true; } return false; });
    list.sort((a, b) => a.q.Y - b.q.Y);
    // shadows + team rings first (on the ice)
    list.forEach(p => {
      if (p.fall && p.z < 0) return;
      const q = p.q, s = q.s, seat = p.i < NP ? 0 : 1, col = c.players[seat].color;
      g.fillStyle = 'rgba(20,70,110,.3)'; g.beginPath(); g.ellipse(q.X + 2 * s, q.Y + 1 * s, 13 * s, 4.6 * s, 0, 0, 7); g.fill();
      const k2 = p.i - seat * NP, sel = planning && seat === me && S.sel === k2;
      const pulse = planning && seat === me ? .55 + .45 * Math.sin(S.tick * .006 + p.i) : .7;
      g.save(); g.strokeStyle = hexA(col, sel ? 1 : .55 * pulse + .2); g.lineWidth = (sel ? 2.4 : 1.4) * s;
      g.shadowColor = col; g.shadowBlur = sel ? 12 : 5;
      g.beginPath(); g.ellipse(q.X, q.Y, (sel ? 17 : 15) * s, (sel ? 6.4 : 5.6) * s, 0, 0, 7); g.stroke(); g.restore();
    });
    list.forEach(p => {
      const i = p.i, seat = i < NP ? 0 : 1, col = c.players[seat].color, pv = S.pv[i], q = p.q;
      const sp = Math.hypot(p.vx, p.vy), svx = S.flip * p.vx, svy = S.flip * p.vy * TILT;
      const o = { lean: 0, look: pv.look, back: false, flap: .12 + .06 * Math.sin(S.tick * .004 + pv.ph), blink: pv.blink > 0, dizzy: pv.dizzy > 0, scared: false, sq: pv.sq, hat: true, lift: 0 };
      // idle waddle: shift weight foot to foot
      const wob = Math.sin(S.tick * .0034 + pv.ph);
      o.lean = wob * .05; o.lift = wob;
      if (A && A.phase === 'reveal') { o.sq = .1 + .05 * Math.sin(A.t * .03); o.look = 0; }       // crouch — get set…
      if (sp > 20) {
        o.lean = Math.max(-.62, Math.min(.62, svx / 520)); o.look = Math.max(-1, Math.min(1, svx / 160));
        o.back = svy < -40 && Math.abs(svy) > Math.abs(svx) * .8; o.flap = .9 + Math.min(.5, sp / 900); o.lift = 0;
        if (sp > 160 && S.tick % 80 < 20 && S.parts.length < 400 && !p.fall) S.parts.push({ k: 'puff', x: p.x, y: p.y, vx: -p.vx * .05, vy: -p.vy * .05, life: 420, max: 420, r: 3 + Math.random() * 3 });
      }
      if (!A && seat === me && mineV) { const d = mineV[i - seat * NP]; if (d) { o.look = Math.max(-1, Math.min(1, S.flip * d[0] / 60)); o.back = S.flip * d[1] < -30 && Math.abs(d[1]) > Math.abs(d[0]); } }
      let alpha = 1, clipY = null;
      if (p.fall) {
        const f = p.fall;
        o.scared = true; o.flap = 1.1 + Math.sin(S.tick * .06 + i) * .9; o.lean = -(S.flip * f.dx) * .35 + Math.sin(S.tick * .03) * .15; o.back = false; o.look = 0;
        if (f.t > FALL_SLIDE) o.lean += (f.t - FALL_SLIDE) / FALL_DROP * (S.flip * f.dx >= 0 ? 1.4 : -1.4);
        clipY = q.Y + TH * S.cam.z;                       // the waterline under it
        if (f.splashed) { o.hat = f.t < FALL_SLIDE + FALL_DROP * .8; }
        if (f.t >= FALL_MS) return;
      }
      const X = q.X, Y = q.Y - p.z * S.cam.z;
      if (clipY != null) {
        const foot = q.Y, sunk = p.z < 0;
        g.save(); g.beginPath(); g.rect(-50, -50, VW + 100, (sunk ? foot : clipY) + 50); g.clip();
        drawPenguin(g, X, Y, q.s, col, o, alpha); g.restore();
        if (sunk) {                                        // the part that sank below where it stood hides behind any ice in front of it
          g.save(); g.beginPath(); g.rect(-50, foot, VW + 100, clipY - foot + 1);
          arenaTops(curGeo()).forEach(pp => { pp.forEach((pt, j) => j ? g.lineTo(pt[0], pt[1]) : g.moveTo(pt[0], pt[1])); g.closePath(); });
          g.clip('evenodd'); drawPenguin(g, X, Y, q.s, col, o, alpha); g.restore();
        }
      } else drawPenguin(g, X, Y, q.s, col, o, alpha);
      if (i === anchor) drawThought(g, X, Y - 50 * q.s, !!aimsOf(st, seat), col);
    });
  }
  // the partner's team shows only WHETHER they're ready — never their arrows
  function drawThought(g, X, Y, rdy, col) {
    g.save();
    const w = rdy ? 46 : 30, h = 16, bob = Math.sin(S.tick * .004) * 1.5;
    Y += bob;
    g.fillStyle = rdy ? hexA(col, .92) : 'rgba(235,245,255,.92)';
    rr(g, X - w / 2, Y - h, w, h, 8); g.fill();
    g.beginPath(); g.arc(X - 4, Y + 4, 2.6, 0, 7); g.fill(); g.beginPath(); g.arc(X - 7, Y + 9, 1.5, 0, 7); g.fill();
    g.fillStyle = rdy ? '#06141c' : '#35506e';
    if (rdy) { g.font = '800 9.5px Orbitron, "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('READY', X, Y - h / 2 + .5); }
    else for (let d = 0; d < 3; d++) { const a = .35 + .65 * Math.max(0, Math.sin(S.tick * .006 - d * .9)); g.globalAlpha = a; g.beginPath(); g.arc(X - 7 + d * 7, Y - h / 2, 2.1, 0, 7); g.fill(); }
    g.restore();
  }
  // A drawn penguin: feet at (0,0), ~44 px tall at s = 1.
  function drawPenguin(g, X, Y, s, col, o, alpha) {
    const body = darken(col, .62), bodyHi = darken(col, .3), rim = col;
    s *= 1.08;
    g.save(); g.globalAlpha = alpha; g.translate(X, Y); g.scale(s, s); g.rotate(o.lean);
    g.scale(1 + o.sq * .6, 1 - o.sq);
    const lx = o.look * 2.7;
    // feet (waddle lifts one, then the other)
    const lL = Math.max(0, o.lift) * 1.8, lR = Math.max(0, -o.lift) * 1.8;
    g.fillStyle = '#ff9d2e'; g.strokeStyle = '#b8600f'; g.lineWidth = .7;
    g.beginPath(); g.ellipse(-5.2, -1.4 - lL, 4.6, 2.3, -.12, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(5.2, -1.4 - lR, 4.6, 2.3, .12, 0, 7); g.fill(); g.stroke();
    // flippers behind the body when flapping wide
    const flip = (side) => {
      g.save(); g.translate(side * 10.5, -23); g.rotate(side * (o.flap)); g.fillStyle = darken(col, .72);
      g.beginPath(); g.ellipse(0, 8, 3.3, 9, 0, 0, 7); g.fill(); g.restore();
    };
    if (o.flap > .6) { flip(-1); flip(1); }
    // body egg
    g.beginPath(); g.moveTo(0, -35);
    g.bezierCurveTo(10.5, -35, 14.2, -21, 13.4, -11); g.bezierCurveTo(12.6, -2.5, 7.5, -.5, 0, -.5);
    g.bezierCurveTo(-7.5, -.5, -12.6, -2.5, -13.4, -11); g.bezierCurveTo(-14.2, -21, -10.5, -35, 0, -35); g.closePath();
    const bg = g.createRadialGradient(-5, -26, 2, 0, -17, 20); bg.addColorStop(0, bodyHi); bg.addColorStop(.6, body); bg.addColorStop(1, darken(col, .78));
    g.fillStyle = bg; g.fill();
    g.strokeStyle = hexA(rim, .85); g.lineWidth = 1.2; g.stroke();
    if (!o.back) {
      // belly
      g.beginPath(); g.ellipse(lx * .9, -13.2, 8.7, 11.6, 0, 0, 7);
      const wb = g.createLinearGradient(0, -25, 0, -2); wb.addColorStop(0, '#ffffff'); wb.addColorStop(1, '#d6e6f4');
      g.fillStyle = wb; g.fill();
      // face patch
      g.beginPath(); g.ellipse(lx, -23.2, 7.8, 5.8, 0, 0, 7); g.fillStyle = '#ffffff'; g.fill();
      // eyes
      [-1, 1].forEach(sd => {
        const ex = lx + sd * 3.7, ey = -24.6;
        if (o.dizzy) { g.strokeStyle = '#1a1030'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(ex - 1.8, ey - 1.8); g.lineTo(ex + 1.8, ey + 1.8); g.moveTo(ex + 1.8, ey - 1.8); g.lineTo(ex - 1.8, ey + 1.8); g.stroke(); return; }
        if (o.blink && !o.scared) { g.strokeStyle = '#1a1030'; g.lineWidth = 1.2; g.beginPath(); g.arc(ex, ey - .6, 2, .2, Math.PI - .2); g.stroke(); return; }
        const er = o.scared ? 3.3 : 2.5;
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex, ey, er, 0, 7); g.fill();
        g.strokeStyle = 'rgba(30,20,60,.35)'; g.lineWidth = .6; g.stroke();
        g.fillStyle = '#15102a'; g.beginPath(); g.arc(ex + o.look * .9, ey + .2, o.scared ? 1.1 : 1.6, 0, 7); g.fill();
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex + o.look * .9 - .5, ey - .5, .55, 0, 7); g.fill();
      });
      // cheeks
      g.fillStyle = 'rgba(255,120,160,.45)';
      g.beginPath(); g.arc(lx - 6.1, -20.6, 1.8, 0, 7); g.fill(); g.beginPath(); g.arc(lx + 6.1, -20.6, 1.8, 0, 7); g.fill();
      // beak (open when screaming)
      g.fillStyle = '#ffae33';
      g.beginPath(); g.moveTo(lx - 2.9, -21.4); g.lineTo(lx + 2.9, -21.4); g.lineTo(lx + o.look * 2.6, -17.6); g.closePath(); g.fill();
      if (o.scared) { g.fillStyle = '#5a1020'; g.beginPath(); g.ellipse(lx + o.look * 1.5, -16.4, 1.8, 1.4, 0, 0, 7); g.fill(); }
    } else {
      g.fillStyle = hexA(col, .22); g.beginPath(); g.ellipse(0, -16, 6, 12, 0, 0, 7); g.fill();   // tail-feather sheen from behind
    }
    if (o.flap <= .6) { flip(-1); flip(1); }
    // beanie in the team colour, with a pompom
    if (o.hat) drawBeanie(g, 0, -29.5, col);
    g.restore();
    if (o.dizzy) {                                        // little stars orbiting the head
      for (let k = 0; k < 3; k++) { const a = S.tick * .012 + k * 2.1; const x = X + Math.cos(a) * 11 * s, y = Y - 44 * s + Math.sin(a) * 3.5 * s; star(g, x, y, 2.6 * s, '#ffe066'); }
    }
  }
  function drawBeanie(g, x, y, col) {
    g.save(); g.translate(x, y);
    const hg = g.createLinearGradient(0, -10, 0, 2); hg.addColorStop(0, lighten(col, .35)); hg.addColorStop(1, col);
    g.fillStyle = hg; g.beginPath(); g.arc(0, 0, 9.6, Math.PI, 0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = .7; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 3.3, -1); g.lineTo(k * 2.4, -8.4 + Math.abs(k) * 1.3); g.stroke(); }
    g.fillStyle = '#f4fbff'; rr(g, -10.6, -1.8, 21.2, 4.4, 2.2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, -11.8, 3.3, 0, 7); g.fill();
    g.fillStyle = hexA(col, .35); g.beginPath(); g.arc(.9, -11, 1.6, 0, 7); g.fill();
    g.restore();
  }
  function star(g, x, y, r, col) {
    g.fillStyle = col; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = k / 10 * 6.2832 - 1.5708, rr2 = k % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
    g.closePath(); g.fill();
  }
  function drawHats(g, farSide) {
    const t = S.tick, c = S.ctx;
    Object.keys(S.hats).forEach(i => {
      const h = S.hats[i], age = t - h.t0; if (age < 0) return;
      if ((S.flip * h.y < 0) !== farSide) return;
      const drift = Math.min(1, Math.max(0, age) / 60000) * 30, d = Math.hypot(h.x, h.y) || 1;
      const q = P(h.x + h.x / d * drift, h.y + h.y / d * drift); if (q.Y < horizonY()) return;
      const pop = Math.min(1, age / 350), bob = Math.sin(t * .003 + h.ph) * 1.6;
      const Y = q.Y + TH * S.cam.z + bob - (1 - pop) * 10;
      g.save(); g.globalAlpha = pop;
      g.strokeStyle = 'rgba(200,240,255,.35)'; g.lineWidth = 1; g.beginPath(); g.ellipse(q.X, Y + 1, 11 * q.s, 3.2 * q.s, 0, 0, 7); g.stroke();
      g.translate(q.X, Y); g.scale(q.s * .8, q.s * .8); g.rotate(Math.sin(t * .002 + h.ph) * .18);
      drawBeanie(g, 0, 0, c.players[h.seat].color);
      g.restore();
    });
  }
  function drawParts(g, layer, farSide) {
    const z = S.cam.z;
    S.parts.forEach(p => {
      const a = Math.max(0, p.life / p.max);
      const sea = p.k === 'ripple' || p.k === 'bub' || p.k === 'drop' || p.k === 'crown';
      if (layer === 'sea') {
        if (!sea || (S.flip * p.y < 0) !== farSide) return;
        if (p.k === 'ripple') { const q = P(p.x, p.y), u = 1 - a, r = p.r0 + (p.r1 - p.r0) * u; g.strokeStyle = `rgba(200,240,255,${a * .6})`; g.lineWidth = 1.3; g.beginPath(); g.ellipse(q.X, q.Y + TH * z, r * SC * z, r * SC * z * TILT, 0, 0, 7); g.stroke(); }
        else if (p.k === 'crown') {                      // a crown of water thrown up by the splash
          const q = P(p.x, p.y), u = 1 - a, wy = q.Y + TH * z, h = Math.sin(Math.min(1, u * 1.25) * Math.PI) * 26 * q.s, w = (9 + u * 14) * q.s;
          g.fillStyle = `rgba(235,250,255,${a * .5})`; g.beginPath(); g.ellipse(q.X, wy, w * 1.3, w * .42, 0, 0, 7); g.fill();
          g.strokeStyle = `rgba(225,248,255,${Math.min(1, a * 1.5)})`; g.lineCap = 'round';
          for (let s2 = -3; s2 <= 3; s2++) {
            const x0 = q.X + s2 * w * .3, hh = h * (1 - Math.abs(s2) * .16);
            g.lineWidth = (2.6 - Math.abs(s2) * .3) * q.s; g.beginPath(); g.moveTo(x0, wy); g.quadraticCurveTo(x0 + s2 * 2.5 * q.s, wy - hh * .6, x0 + s2 * 4 * q.s, wy - hh); g.stroke();
            g.fillStyle = `rgba(240,252,255,${a})`; g.beginPath(); g.arc(x0 + s2 * 4.5 * q.s, wy - hh - 2 * q.s, 1.6 * q.s, 0, 7); g.fill();
          }
        }
        else if (p.k === 'bub') { const q = P(p.x, p.y), u = 1 - a; g.strokeStyle = `rgba(210,245,255,${a * .8})`; g.lineWidth = .9; g.beginPath(); g.arc(q.X + Math.sin(u * 9 + p.sz) * 2, q.Y + TH * z - 2 - u * 6, p.sz, 0, 7); g.stroke(); }
        else { const q = P(p.x, p.y), Y = q.Y - p.z * z; g.fillStyle = `rgba(170,230,255,${Math.min(1, a * 1.4)})`; g.beginPath(); g.arc(q.X, Y, p.sz * .8, 0, 7); g.fill(); }
        return;
      }
      if (sea) return;
      if (layer === 'ground') {
        if (p.k === 'puff') { const q = P(p.x, p.y); g.fillStyle = `rgba(255,255,255,${a * .5})`; g.beginPath(); g.ellipse(q.X, q.Y - 2, p.r * q.s, p.r * .55 * q.s, 0, 0, 7); g.fill(); }
        return;
      }
      if (p.k === 'chip') {
        const q = P(p.x, p.y), Y = q.Y - p.z * z;
        g.fillStyle = hexA(p.c, Math.min(1, a * 1.6));
        g.beginPath(); g.rect(q.X - p.sz / 2, Y - p.sz / 2, p.sz, p.sz * .8); g.fill();
      } else if (p.k === 'star') {
        const q = P(p.x, p.y), u = 1 - a, r = (8 + u * 22) * p.sz;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
        g.translate(q.X, q.Y - p.z * z); g.rotate(p.rot);
        star(g, 0, 0, r, '#fff6c8'); star(g, 0, 0, r * .55, '#ffffff');
        g.restore();
      } else if (p.k === 'word') {
        const q = P(p.x, p.y), u = 1 - a, pop = u < .12 ? .5 + u / .12 * .6 : 1.1 - (u - .12) * .15;
        g.save(); g.translate(q.X, q.Y - p.z * z); g.rotate(p.rot); g.scale(pop * p.sz, pop * p.sz);
        g.globalAlpha = Math.min(1, a * 2.2);
        g.font = '900 17px Orbitron, "Chakra Petch", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 5; g.strokeStyle = '#140a28'; g.lineJoin = 'round'; g.strokeText(p.text, 0, 0);
        g.fillStyle = p.c; g.fillText(p.text, 0, 0);
        g.restore();
      } else if (p.k === 'say') {
        let X, Y;
        if (p.i != null) {
          const ps = penState(p.i, S.st, S.anim); if (!ps) return;
          const q = P(ps.x, ps.y); X = q.X; Y = q.Y - ps.z * z - 52 * q.s;
        } else { const q = P(p.x, p.y); X = q.X; Y = q.Y + TH * z - 22 - (p.z || 0) * .6; }
        bubble(g, X, Y, p.text, Math.min(1, a * 3), p.small);
      }
    });
  }
  function bubble(g, X, Y, text, a, small) {
    g.save(); g.globalAlpha = a;
    g.font = `800 ${small ? 11 : 11.5}px "Chakra Petch", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(text).width + 12, h = 17;
    g.fillStyle = '#ffffff'; rr(g, X - w / 2, Y - h, w, h, 8); g.fill();
    g.beginPath(); g.moveTo(X - 4, Y - 1); g.lineTo(X + 2, Y - 1); g.lineTo(X - 3, Y + 5); g.closePath(); g.fill();
    g.fillStyle = small ? '#e0245e' : '#1b2440'; g.fillText(text, X, Y - h / 2 + .5);
    g.restore();
  }
  function drawSnow(g) {
    S.snow.forEach(f => { g.fillStyle = `rgba(255,255,255,${.25 + f.z * .45})`; g.beginPath(); g.arc(f.x, f.y, .6 + f.z * 1.3, 0, 7); g.fill(); });
  }
  function drawHud(g, st, A) {
    const c = S.ctx, round = A ? A.res.r : st.round, fin = c.status === 'finished' && !A;
    const setup = st.phase === 'setup', hot = !setup && round >= MAX_ROUNDS && !fin;
    const label = setup ? 'MATCH SETUP' : fin ? 'FINAL' : (round >= MAX_ROUNDS ? 'LAST ROUND' : `ROUND ${round}/${MAX_ROUNDS}`);
    g.font = '800 10.5px Orbitron, "Chakra Petch", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    const w = g.measureText(label).width + 20;
    g.fillStyle = 'rgba(4,10,24,.62)'; rr(g, 10, 10, w, 22, 11); g.fill();
    g.strokeStyle = hot ? 'rgba(255,214,107,.7)' : 'rgba(160,220,255,.25)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = hot ? '#ffd66b' : '#dff4ff'; g.fillText(label, 20, 21.5);
    // which arena (and roulette), as a second, smaller pill
    const aid = A ? A.geoA.id : (setup ? (S.sw ? S.sw.toId : S.pre.id) : st.arena), hg = A ? A.geo : curGeo();
    const aname = setup && st.arena === 'surprise' ? 'SURPRISE ME' : arenaName(aid || 'floe').toUpperCase(), rl = st.roulette ? ' + ROULETTE' : '';
    g.font = '800 9px Orbitron, "Chakra Petch", sans-serif';
    const w2 = g.measureText(aname + rl).width + 18;
    g.fillStyle = 'rgba(4,10,24,.62)'; rr(g, 10, 37, w2, 18, 9); g.fill(); g.strokeStyle = 'rgba(127,216,255,.35)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#9fe3ff'; g.fillText(aname + rl, 19, 46.5);
    if (hg && hg.cur && !setup) {                          // a compass for the current, right under the penguin count
      const u = uv(9 * hg.dir), dx = S.flip * u[0], dy = S.flip * u[1] * TILT, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, X = VW - 14 - 34, Y = 46;
      g.fillStyle = 'rgba(4,10,24,.62)'; rr(g, X, 37, 34, 18, 9); g.fill(); g.strokeStyle = 'rgba(127,216,255,.35)'; g.lineWidth = 1; g.stroke();
      g.save(); g.translate(X + 17, Y); g.strokeStyle = '#9fe3ff'; g.fillStyle = '#9fe3ff'; g.lineWidth = 1.8; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-ux * 10, -uy * 10); g.lineTo(ux * 5, uy * 5); g.stroke();
      g.beginPath(); g.moveTo(ux * 11, uy * 11); g.lineTo(ux * 4 - uy * 4.4, uy * 4 + ux * 4.4); g.lineTo(ux * 4 + uy * 4.4, uy * 4 - ux * 4.4); g.closePath(); g.fill();
      g.restore();
    }
    g.font = '800 10.5px Orbitron, "Chakra Petch", sans-serif';
    // penguins left, as little dots per side
    if (!setup) [0, 1].forEach(s => {
      const pens = A ? A.res.init : st.pens, n = aliveCount(pens, s), col = c.players[s].color, x0 = VW - 14 - (s === 0 ? 62 : 0);
      for (let k = 0; k < NP; k++) { g.fillStyle = k < n ? col : 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(x0 - k * 11, 21, 3.6, 0, 7); g.fill(); }
    });
    if (A && A.phase === 'reveal') {                      // READY… GO!
      const u = A.t / REVEAL, txt = u < .55 ? 'READY…' : 'GO!', pop = u < .55 ? 1 : 1 + (1 - (u - .55) / .45) * .5;
      g.save(); g.translate(VW / 2, 92); g.scale(pop, pop);
      g.font = '900 30px Orbitron, "Chakra Petch", sans-serif'; g.textAlign = 'center';
      g.lineWidth = 7; g.strokeStyle = '#06101f'; g.lineJoin = 'round'; g.strokeText(txt, 0, 0);
      g.fillStyle = txt === 'GO!' ? '#ffd23a' : '#dff4ff'; g.fillText(txt, 0, 0); g.restore();
    }
    if (S.banner) {
      const b = S.banner, a = Math.min(1, b.t / 150, (2600 - b.t) / 400);
      g.save(); g.globalAlpha = Math.max(0, a);
      g.font = '900 15px Orbitron, "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const w2 = Math.min(VW - 20, g.measureText(b.text).width + 28);
      g.fillStyle = 'rgba(4,10,24,.72)'; rr(g, VW / 2 - w2 / 2, 62, w2, 30, 15); g.fill();
      g.strokeStyle = hexA(b.col, .6); g.lineWidth = 1.2; g.stroke();
      g.fillStyle = b.col; g.fillText(b.text, VW / 2, 77.5, VW - 36); g.restore();
    }
    if (fin && st.over) {
      const w3 = st.over.w, txt = w3 === 'draw' ? 'DRAW!' : `${c.players[w3].name.toUpperCase()} WINS`;
      g.save(); g.font = '900 24px Orbitron, "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 7; g.strokeStyle = '#06101f'; g.lineJoin = 'round'; g.strokeText(txt, VW / 2, 70);
      g.fillStyle = w3 === 'draw' ? '#ffe08a' : c.players[w3].color; g.fillText(txt, VW / 2, 70); g.restore();
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

  /* ---------------- DOM controls ---------------- */
  const penSvg = col => `<svg viewBox="0 0 24 30" aria-hidden="true"><ellipse cx="12" cy="28.6" rx="7" ry="1.4" fill="rgba(0,0,0,.35)"/>
    <path d="M12 6.5c5.6 0 8.2 6.8 8 12.6C19.8 25 16.3 28 12 28s-7.8-3-8-8.9C3.8 13.3 6.4 6.5 12 6.5z" fill="${darken(col, .6)}" stroke="${col}" stroke-width=".8"/>
    <ellipse cx="12" cy="20" rx="5.3" ry="6.8" fill="#fff"/><ellipse cx="12" cy="13.8" rx="4.9" ry="3.5" fill="#fff"/>
    <circle cx="9.8" cy="13.4" r="1.05" fill="#15102a"/><circle cx="14.2" cy="13.4" r="1.05" fill="#15102a"/>
    <path d="M10.3 15.3h3.4L12 17.6z" fill="#ffae33"/><path d="M5.8 10.6a6.2 6.2 0 0112.4 0z" fill="${col}"/>
    <rect x="5.2" y="9.6" width="13.6" height="2.6" rx="1.3" fill="#f4fbff"/><circle cx="12" cy="3.9" r="2.1" fill="#fff"/></svg>`;
  function updateUI() {
    const u = S.ui, c = S.ctx; if (!u || !c || !S.st) return;
    const st = S.st, me = c.me, live = canPlan(), v = S.anim ? [null, null, null, null] : myArrows(st, me);
    const shown = S.anim ? S.anim.res.init : st.pens;      // mid-replay: no spoilers
    let n = 0;
    u.pens.forEach((b, k) => {
      const i = me * NP + k, alive = !!shown[i][2], d = v[k];
      if (d && alive) n++;
      b.className = 'ko-pen' + (!alive ? ' dead' : '') + (S.sel === k && live ? ' sel' : '');
      b.disabled = !live || !alive;
      b.querySelector('.tag').textContent = alive && d ? '➚' : '';
      b.querySelector('.pw i').style.width = alive && d ? Math.round(Math.hypot(d[0], d[1]) / MAXA * 100) + '%' : '0';
    });
    const alive = aliveCount(shown, me);
    u.clear.disabled = !live || !n;
    u.clear.textContent = live && S.sel != null && v[S.sel] ? '↺ Clear this' : '↺ Clear all';
    u.ready.disabled = !live;
    u.ready.classList.toggle('go', live);
    u.ready.textContent = live ? `READY ✓ · ${n}/${alive} aimed` : (c.status === 'finished' ? 'MATCH OVER' : S.anim ? 'SLIDING…' : 'LOCKED IN ✓');
    kick();
  }
  function arenaHint(st) {
    if (st.round >= MAX_ROUNDS) return 'last round — make it count';
    if (st.roulette) return 'everyone regroups on a new arena after this round';
    if (st.arena === 'twin' && st.round > 3) return ARENAS[0].hint;
    if (st.arena === 'twin' && st.round === 3) return 'the bridge cracks after this round';
    return (ARENAS.find(a => a.id === st.arena) || ARENAS[0]).hint;
  }
  function hintHtml(ctx, st) {
    const me = ctx.me, foe = 1 - me, fn = ctx.players[foe].name;
    if (ctx.status === 'finished') { const l = [aliveCount(st.pens, 0), aliveCount(st.pens, 1)]; return `Final: <b>${l[0]} – ${l[1]}</b> penguins left`; }
    if (S.anim) return 'Here they go… 🐧💨';
    const a = aimsOf(st, me);
    if (a && a.skip) return `⏱ Time ran out — your penguins sit this round out`;
    if (submitted(st, me)) return aimsOf(st, foe) ? 'Both locked in — launching…' : `Locked in ✓ — waiting for <b>${fn}</b>…`;
    const last = st.round >= MAX_ROUNDS ? '<b>Last round!</b> · ' : `Round <b>${st.round}</b>/${MAX_ROUNDS} · `;
    return `${last}Drag from a penguin to aim · drag back onto it to cancel · ${arenaHint(st)}`;
  }

  /* ---------------- match setup: the host picks mode + arena, the partner watches it happen ---------------- */
  // tiny top-down portraits of the arenas (same palette as the canvas)
  function thumb(id) {
    const ice = '#dff3fc', edge = '#ffffff', dash = '#3a7ab0', f = v => Math.round(v * 10) / 10;
    let b = '';
    if (id === 'floe') b = `<circle cx="50" cy="32" r="25" fill="${ice}" stroke="${edge}" stroke-width="1.2"/><circle cx="50" cy="32" r="19" fill="none" stroke="${dash}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
    else if (id === 'donut') b = `<path fill-rule="evenodd" fill="${ice}" stroke="${edge}" stroke-width="1.2" d="M25 32a25 25 0 1 0 50 0a25 25 0 1 0 -50 0zM41 32a9 9 0 1 0 18 0a9 9 0 1 0 -18 0z"/><circle cx="50" cy="32" r="13.5" fill="none" stroke="${dash}" stroke-width="1.1" stroke-dasharray="3 3"/>`;
    else if (id === 'twin') b = `<rect x="38" y="27.5" width="24" height="9" fill="${ice}" stroke="${edge}" stroke-width="1"/><circle cx="27" cy="32" r="17" fill="${ice}" stroke="${edge}" stroke-width="1.2"/><circle cx="73" cy="32" r="17" fill="${ice}" stroke="${edge}" stroke-width="1.2"/><rect x="41" y="29" width="18" height="6" fill="${ice}"/><path d="M44 28v8M56 28v8" stroke="${dash}" stroke-width="1.1" stroke-dasharray="2 2"/>`;
    else if (id === 'bumper') {
      let arcs = ''; for (let j = 0; j < 8; j++) { const a0 = j * 45 - 15, a1 = j * 45 + 15, p = a => [f(50 + 21.5 * Math.cos(a * Math.PI / 180)), f(32 + 21.5 * Math.sin(a * Math.PI / 180))], A0 = p(a0), A1 = p(a1); arcs += `<path d="M${A0[0]} ${A0[1]}A21.5 21.5 0 0 1 ${A1[0]} ${A1[1]}" fill="none" stroke="#ffb03b" stroke-width="4.6" stroke-linecap="round"/>`; }
      b = `<circle cx="50" cy="32" r="25" fill="${ice}" stroke="${edge}" stroke-width="1.2"/>${arcs}`;
    } else if (id === 'ice') {
      let t = ''; const w = 8.6, x0 = 50 - 3 * w, y0 = 32 - 3 * w;
      for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) {
        if ((r === 0 || r === 5) && (c === 0 || c === 5)) continue;
        if ((r === 1 && c === 3) || (r === 4 && c === 2)) { t += `<rect x="${f(x0 + c * w + .8)}" y="${f(y0 + r * w + .8)}" width="${w - 1.6}" height="${w - 1.6}" rx="1" fill="#b9dcf0" stroke="${dash}" stroke-width=".9" stroke-dasharray="2 1.6"/>`; continue; }
        t += `<rect x="${f(x0 + c * w + .8)}" y="${f(y0 + r * w + .8)}" width="${w - 1.6}" height="${w - 1.6}" rx="1" fill="${ice}"/>`;
      }
      b = t;
    } else if (id === 'current') {
      let ar = ''; [[-9, 17], [-3, 0], [-9, -17]].forEach(([dx, dy]) => { ar += `<path d="M${36 + dx} ${32 + dy}h22m-6 -5l6 5l-6 5" fill="none" stroke="#3a86b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(3 0)"/>`; });
      b = `<circle cx="50" cy="32" r="25" fill="${ice}" stroke="${edge}" stroke-width="1.2"/>${ar}`;
    } else b = `<circle cx="50" cy="32" r="22" fill="none" stroke="#7fd8ff" stroke-width="1.4" stroke-dasharray="4 4"/><text x="50" y="43" text-anchor="middle" font-family="Orbitron,sans-serif" font-weight="800" font-size="30" fill="#7fd8ff">?</text>`;
    return `<svg viewBox="0 0 100 64" aria-hidden="true"><rect width="100" height="64" fill="#0a2240"/><rect y="40" width="100" height="24" fill="#071a33"/>${b}</svg>`;
  }
  // everything the host changes is one committed state write; the partner's phone just repaints from it
  function setupPick(ctx, patch) {
    const st = S.st; if (!st || st.phase !== 'setup' || ctx.status !== 'active' || ctx.me !== st.host || S.starting) return;
    const n = norm(ctx.clone(ctx.state)); Object.assign(n, patch); n.n = (n.n || 0) + 1;
    try { ctx.sound.tap(); } catch (e) {}
    ctx.commit(n);
  }
  // the pick becomes the rules. "Surprise me" is drawn here (seeded by the match id) so both phones agree.
  function beginMatch(st, turnTo) {
    st.arena = st.arena === 'surprise' ? surpriseArena(st.mid) : st.arena;
    st.phase = 'play'; st.pens = startPens(st.arena); st.aims = {}; st.round = 1; st.R = R_START; st.turn = turnTo; st.n = (st.n || 0) + 1;
    return st;
  }
  function startMatch(ctx) {
    const st = S.st; if (!st || st.phase !== 'setup' || ctx.status !== 'active' || ctx.me !== st.host || S.starting) return;
    S.starting = st.mid;
    const n = beginMatch(norm(ctx.clone(ctx.state)), st.turn === 1 ? 0 : 1);   // turn changes → a fresh clock for round 1
    try { ctx.sound.place(); } catch (e) {}
    ctx.commit(n);
  }
  function renderSetup(ctx, st, wrap) {
    const me = ctx.me, hs = st.host === 1 ? 1 : 0, isHost = me === hs, hn = ctx.players[hs].name, live = ctx.status === 'active';
    S.ui = null; S.sel = null; S.drag = null; stepPreview(0);
    const edit = isHost && live && !S.starting, ro = edit ? '' : ' ko-ro';
    const btn = (cls, attrs, inner, fn) => ctx.h('button', Object.assign({ class: cls, type: 'button', onclick: fn }, edit || /ko-go|ko-ready/.test(cls) ? {} : { tabindex: '-1', 'aria-disabled': 'true' }, attrs), inner);
    const cur = st.arena, rc = st.roulette;
    const modes = [['sumo', 'Sumo', 'Last side standing'], ['koth', 'King of the Hill', 'Soon'], ['hockey', 'Fish Hockey', 'Soon']].map(([id, nm, sub]) =>
      btn('ko-mode' + (id === 'sumo' ? ro : ''), { 'aria-pressed': String(id === 'sumo'), disabled: id !== 'sumo' ? '' : null, 'aria-label': id === 'sumo' ? nm : nm + ', coming soon' },
        [nm, ctx.h('small', {}, sub)], () => {}));
    const cards = ARENAS.map(a => btn('ko-ar' + ro, { 'aria-pressed': String(cur === a.id), 'aria-label': a.name + '. ' + a.blurb, 'data-id': a.id },
      [ctx.h('span', { html: thumb(a.id) }), a.name], () => { if (cur !== a.id) setupPick(ctx, { arena: a.id }); }));
    cards.push(btn('ko-ar wide' + ro, { 'aria-pressed': String(cur === 'surprise'), 'aria-label': 'Surprise me. A random arena, revealed at the start.', 'data-id': 'surprise' },
      [ctx.h('span', { html: thumb('surprise') }), ctx.h('span', {}, ['Surprise me', ctx.h('small', {}, 'A random arena, revealed at the start')])], () => { if (cur !== 'surprise') setupPick(ctx, { arena: 'surprise' }); }));
    const info = cur === 'surprise' ? '<b>Surprise me</b>. Any of the six arenas, drawn when the match starts.' : `<b>${esc2(arenaName(cur))}</b>. ${esc2((ARENAS.find(a => a.id === cur) || ARENAS[0]).blurb)}`;
    const desc = ctx.h('div', { class: 'ko-desc', html: info + (rc ? ' Then a new arena every round.' : '') });
    const roul = btn('ko-roul' + ro, { role: 'switch', 'aria-checked': String(!!rc) }, [ctx.h('span', {}, ['Arena roulette', ctx.h('small', {}, 'A different arena every round')]), ctx.h('i', { class: 'ko-sw' })], () => setupPick(ctx, { roulette: rc ? 0 : 1 }));
    const go = isHost
      ? ctx.h('div', { class: 'ko-go' }, btn('ko-ready go' + (me === 1 ? ' p1' : ''), { disabled: !live || S.starting ? '' : null }, S.starting ? 'STARTING…' : 'START MATCH', () => startMatch(ctx)))
      : ctx.h('div', { class: 'ko-go' }, ctx.h('div', { class: 'ko-wait', role: 'status' }, [ctx.h('span', { class: 'ko-dots' }, [ctx.h('i'), ctx.h('i'), ctx.h('i')]), `Waiting for ${hn} to start`]));
    wrap.append(ctx.h('div', { class: 'ko-setup' },
      ctx.h('div', { class: 'ko-who', html: isHost ? `You set the rules. <b>${esc2(ctx.players[1 - me].name)}</b> sees every change live.` : `<b>${esc2(hn)}</b> is setting up the match. Their choices show here live.` }),
      ctx.h('div', { class: 'ko-lab' }, 'Mode'), ctx.h('div', { class: 'ko-seg', role: 'group', 'aria-label': 'Game mode' }, modes),
      ctx.h('div', { class: 'ko-lab' }, 'Arena'), ctx.h('div', { class: 'ko-arenas', role: 'group', 'aria-label': 'Arena' }, cards), desc, roul, go));
    if (live) ctx.msg(isHost ? 'Pick an arena, then start 🐧' : `${hn} is choosing the arena… 🧊`, 'var(--ink-dim)');
    const say = `${hn} chose ${cur === 'surprise' ? 'Surprise me' : arenaName(cur)}${rc ? ', roulette on' : ''}`;   // the partner's screen reader hears the host's picks
    if (!isHost && S.lastSay !== say) { S.lastSay = say; S.live.textContent = say; }
    if (S.focusSel) { const el = wrap.querySelector(S.focusSel); if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} } }   // every sync rebuilds this DOM: keep the keyboard user where they were
    kick();
  }
  const esc2 = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- registration ---------------- */
  const DEF = {
    id: 'knockout', name: 'Knockout', emoji: '🐧', category: 'Arcade', accent: '#7fd8ff',
    tagline: 'Penguin sumo on six shrinking arenas.',
    test: { simulate, resolveRound, norm, launches, aimsOf, realAims, nextR, startPens, cleanVec, memKey, memGet, memSet, mem, sync, ready,
      canPlan, submitted, draftFor, P, S, NP, PR, VMAX, MAXA, R_START, MAX_ROUNDS, REVEAL, FALLBACK_MS, VW, VH, TH,
      beginMatch, lostInfo, arenaD, curGeo, stepPreview, thumb, geoFor, geoOf, arenaAfter, slotsFor, surpriseArena, curSeq, icePicks, bumpOrder, ARENAS, ARENA_IDS, MAX_STEPS, UV, RT, RCT, HRT, ITW,
      step: ms => { step(ms); draw(); }, draw: () => draw(), finish: () => { let n = 0; while (S.anim && n++ < 3000) step(16); draw(); } },
    // the result card waits until the last slide (and splash) has played out
    // a timeout during match setup must never forfeit (the host is only picking an arena)
    skipOnly: st => !!st && st.phase === 'setup',
    clockGrace: 5000,                                    // ~4 s replay before the next round can be planned
    resultDelay: () => S.anim ? Math.max(0, Math.round((S.anim.est - S.anim.total) / (S.speed || 1))) + 250 : 0,
    init: host => ({
      v: 2, mid: 'k' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      host: host === 1 ? 1 : 0, turn: host === 1 ? 1 : 0, round: 1, R: R_START, pens: startPens(), aims: {}, n: 0,
      phase: 'setup', mode: 'sumo', arena: 'floe', roulette: 0,          // the host picks these before round 1 (`turn` = the host meanwhile)
    }),
    // timer ran out on the player still aiming: they submit "no moves" (everyone stays put);
    // in setup the host is on the clock, so the match simply starts with what is picked
    skipTurn: (st0, opp) => {
      const st = norm(JSON.parse(JSON.stringify(st0))), me = 1 - opp;
      if (st.phase === 'setup') return beginMatch(st, opp);
      if (!aimsOf(st, me)) st.aims['a' + me] = { r: st.round, v: [[0, 0], [0, 0], [0, 0], [0, 0]], skip: 1 };
      if (!aimsOf(st, opp)) st.turn = opp;
      return st;
    },
    render(ctx) {
      S.ctx = ctx;
      const st = norm(ctx.clone(ctx.state)), me = ctx.me, foe = 1 - me;
      S.flip = me === 1 ? -1 : 1;
      ensureCanvas();
      if (st.mid !== S.mid) { S.st = st; resetScene(st); }
      S.st = st;
      S.cv.setAttribute('aria-label', st.phase === 'setup' ? 'Preview of the match arena' : `Knockout arena: ${arenaName(st.arena)}, round ${st.round} of ${MAX_ROUNDS}`);
      const wrap = ctx.h('div', { class: 'ko-wrap' });
      if (st.phase === 'setup') {                          // before round 1: mode + arena, picked by the host, watched live by the partner
        ctx.root.append(ctx.turnBar({ scores: [NP, NP] }), wrap);
        wrap.append(S.cv);
        renderSetup(ctx, st, wrap);
        fit(); kick();
        return;
      }
      if (S.pre.id || S.prePos) {                          // came from the setup preview: cross-fade it into round 1's arena
        if (S.pre.id && S.pre.id !== st.arena && !S.sw) S.sw = { ga: geoFor(S.pre.id, 0, st.mid, R_START), gb: geoFor(st.arena, 0, st.mid, R_START), t: S.calm ? ENTRY_MS * .7 : 0, dur: ENTRY_MS, from: S.prePos || slotPos(S.pre.id, st.mid), to: st.pens.map(q => [q[0], q[1]]), toId: st.arena, entry: true };
        S.pre.id = null; S.prePos = null;
      }
      S.starting = ''; S.focusSel = '';
      maybeReplay(st);
      scheduleSync(st, ctx);
      const shown = S.anim ? S.anim.res.init : st.pens;
      ctx.root.append(ctx.turnBar({ scores: [aliveCount(shown, 0), aliveCount(shown, 1)] }), wrap);
      wrap.append(S.cv);                                  // the SAME canvas every repaint
      const col = ctx.players[me].color, fcol = ctx.players[foe].color;
      const pens = [];
      for (let k = 0; k < NP; k++) pens.push(ctx.h('button', { class: 'ko-pen', style: `--kc:${col}`, onclick: () => selectPen(k), 'aria-label': 'Penguin ' + (k + 1) },
        ctx.h('span', { html: penSvg(col) }), ctx.h('span', { class: 'tag' }), ctx.h('span', { class: 'pw' }, ctx.h('i'))));
      const foeRdy = !!aimsOf(st, foe) && ctx.status === 'active' && !S.anim;
      const foeBox = ctx.h('div', { class: 'ko-foe' + (foeRdy ? ' rdy' : ''), style: `--kf:${fcol}` },
        ctx.h('b', {}, ctx.players[foe].name), ctx.status !== 'active' ? '—' : S.anim ? 'sliding…' : foeRdy ? 'READY ✓' : 'aiming…');
      const clear = ctx.h('button', { class: 'ko-clear', onclick: clearAims }, '↺ Clear all');
      const readyB = ctx.h('button', { class: 'ko-ready' + (me === 1 ? ' p1' : ''), onclick: ready }, 'READY ✓');
      const hint = ctx.h('div', { class: 'ko-hint', html: hintHtml(ctx, st) });
      wrap.append(ctx.h('div', { class: 'ko-row' }, ctx.h('div', { class: 'ko-pens' }, pens), foeBox), ctx.h('div', { class: 'ko-btns' }, clear, readyB), hint);
      S.ui = { pens, clear, ready: readyB };
      updateUI();
      if (ctx.status === 'active' && !S.anim) {
        const mine = submitted(st, me), theirs = !!aimsOf(st, foe);
        ctx.msg(mine ? (theirs ? 'Both ready — here we go! 🐧' : `Waiting for ${ctx.players[foe].name} to lock in… 🧊`)
          : theirs ? `${ctx.players[foe].name} is READY — your move! 🔥` : 'Aim your penguins, then tap READY 🐧', mine ? 'var(--ink-faint)' : 'var(--gold)');
      } else if (S.anim) ctx.msg('💨 Launch!', 'var(--ink-dim)');
      fit(); kick();
    },
  };
  Games.register(DEF);
})();
