/* ============================================================
   MINI GOLF — three courses of nine hand-built holes, two balls, one scorecard.

   Courses (the host picks before hole 1, the partner watches it live):
   Neon Garden (the original nine), Candy Land, Space Station, or Surprise me.

   Turns are plain alternation: you putt, then your partner, then you.
   The player with the honour tees off first; a player who has holed out is
   skipped until the hole ends. (Saves made before the course picker existed
   carry no `rule` and keep the old "whoever is farther from the cup putts
   next" rule, so a match in progress plays exactly as it did.)
   A ball not holed after 6 strokes is picked up and scores 7. Water, lava,
   chocolate or a black hole = +1 penalty stroke and the ball goes back to
   where it was hit from. The balls don't collide with each other.
   Fewest total strokes after 9 holes wins; equal totals = draw.

   Determinism: a putt is a PURE function simulate(hole, x0, y0, angle,
   power, phase) run at a fixed 240 Hz step with sub-step-safe capsule
   collisions. The stepping math is + - x / and sqrt; Math.cos / sin appear only
   to decode the launch angle, the sweeper arms and a tunnel's exit turn (the
   original engine's calls, none added). The windmill / sweeper phase is part of
   the committed input (captured at release from the phase the committed
   state left off at), never read from the clock during a replay. The putter
   commits input + resting spot + outcome FIRST, then animates; every
   phone replays the same input from `last` and SNAPS to the committed
   spot at the end, so engine float differences can't desync anything.

   Rendering follows Pocket Tanks / Fleabag: a MODULE-LEVEL canvas and
   loop (scene S) re-attached on every repaint, so a repaint can never
   restart or cut a roll. 2.5D top-down: raised walls with lit tops and
   side faces, soft shadows, a ball shadow, cup + flag, a theme per course
   area, a camera that follows the ball, a flyover on every new hole, slow-mo
   on the drop, particles for everything. The loop idles when nothing
   moves (windmill and sweeper holes keep turning).
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
  /* course picker (before hole 1): the host picks, the partner watches the same cards light up */
  .mg-setup{ display:flex; flex-direction:column; gap:8px; }
  .mg-sr{ position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
  .mg-who{ font-size:13px; line-height:1.45; color:var(--ink-dim); text-align:center; padding:2px 6px 4px; }
  .mg-who b{ color:var(--ink); }
  .mg-courses{ display:flex; flex-direction:column; gap:8px; }
  .mg-co{ --ca:#79f5b6; display:grid; grid-template-columns:104px minmax(0,1fr); align-items:center; gap:12px; width:100%; padding:6px 12px 6px 6px;
    min-height:76px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); text-align:left;
    font:inherit; touch-action:manipulation; -webkit-tap-highlight-color:transparent;
    transition:transform 140ms cubic-bezier(.23,1,.32,1); }   /* press feedback only: every sync rebuilds these cards */
  .mg-co svg{ width:104px; height:auto; aspect-ratio:104/68; display:block; border-radius:10px; }
  .mg-co .nm{ display:block; font-family:var(--font-display); font-weight:800; font-size:14px; letter-spacing:.3px; }
  .mg-co .bl{ display:block; font-size:12px; line-height:1.35; color:var(--ink-dim); margin-top:3px; }
  .mg-co .pr{ display:block; font-size:11px; font-weight:700; color:var(--ink-dim); margin-top:4px; font-variant-numeric:tabular-nums; }
  .mg-co[aria-pressed=true]{ border-color:var(--ca); background:color-mix(in srgb, var(--ca) 11%, var(--panel-2)); }
  .mg-co[aria-pressed=true] .nm{ color:var(--ca); }
  body.light .mg-co[aria-pressed=true] .nm{ color:var(--ink); } body.light .mg-co[aria-pressed=true]{ border-width:2px; padding:5px 11px 5px 5px; }
  .mg-co:not(.ro):active{ transform:scale(.975); }
  .mg-co:focus-visible, .mg-go:focus-visible{ outline:2px solid var(--ca, var(--gold)); outline-offset:2px; }
  .mg-co.ro{ cursor:default; }
  .mg-co.sur{ grid-template-columns:52px minmax(0,1fr); min-height:60px; }
  .mg-co.sur svg{ width:52px; aspect-ratio:1; }
  .mg-foot{ position:sticky; bottom:0; z-index:2; padding:12px 0 calc(8px + var(--safe-b, 0px)); background:linear-gradient(to top, var(--bg) 66%, transparent); }
  .mg-go{ width:100%; min-height:52px; padding:14px 8px; border:none; border-radius:var(--r-2); font-family:var(--font-display); font-weight:800; font-size:15px;
    letter-spacing:.6px; color:#04140c; background:#79f5b6; touch-action:manipulation; transition:transform 120ms cubic-bezier(.23,1,.32,1); }
  .mg-go:not(:disabled):active{ transform:scale(.97); }
  .mg-go:disabled{ opacity:.45; }
  .mg-wait{ display:flex; align-items:center; justify-content:center; gap:10px; min-height:52px; padding:12px; border-radius:var(--r-2);
    background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-size:13.5px; font-weight:700; }
  .mg-dots{ display:inline-flex; gap:4px; } .mg-dots i{ width:6px; height:6px; border-radius:50%; background:#79f5b6; animation:mgDot 1.2s ease-in-out infinite; }
  .mg-dots i:nth-child(2){ animation-delay:.15s; } .mg-dots i:nth-child(3){ animation-delay:.3s; }
  @keyframes mgDot{ 0%,80%,100%{ opacity:.25; transform:scale(.8); } 40%{ opacity:1; transform:scale(1); } }   /* compositor-only (v77 rule) */
  @media (prefers-reduced-motion: reduce){ .mg-dots i{ animation:none; opacity:.7; } .mg-co, .mg-go{ transition:none; } }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------------- physics constants (world units ≈ px at zoom 1) ---------------- */
  const DT = 1 / 240, MAX_STEPS = 240 * 20;
  const R = 7, CUP_R = 12, CAP_V = 360, STOP_V = 5, V_MAX = 980, V_CAP = 1250;
  const FR_GREEN = 330, DG_GREEN = .35, FR_SAND = 1600, DG_SAND = 3, FR_ICE = 90, DG_ICE = .15;
  const FR_LOW = 140, DG_LOW = .18;                    // low gravity: the ball floats, so it is barely slowed (Space Station)
  const E_WALL = .7, MU = .12, E_BUMP = 1, BUMP_KICK = 230;
  const RAMP_F = 650, RAMP_H = 14, GZ = 1400, JUMP_K = .32;
  const PORT_R = 15, MILL_W = 1.5, MILL_GAP = .3, SPIN_W = 1.8, SPIN_HUB = 11;
  const MAX_STROKES = 6, PICKUP = 7, HOLES_N = 9;
  // ms added to the next player's clock: their controls unlock only after the replay of the last putt. Measured over
  // 10,800 putts on all 27 holes: replay + tail p95 2.8 s, max 5.4 s; a putt that ends the hole also waits for the
  // summary card + the next flyover (p95 7.7 s, max 8.8 s). 10 s = that max + a margin for the network.
  const CLOCK_GRACE = 10000;
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
     solid:1 → a filled block. zone k: sand / ice / slope (f = push; a ball can rest on it) / belt (f = push
     stronger than the green's friction, so a ball can never rest on it) / lowg (low gravity = low friction) /
     ramp (d = uphill dir) / water / lava (water = chocolate river or black hole, by theme).
     bump: [x,y,r]. port: a → b tunnel / airlock. mill: windmill door. spin: rotating sweeper.
     Holes 0-8 are Neon Garden, 9-17 Candy Land, 18-26 Space Station (see COURSES). */
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

  /* ---------------- Candy Land: gumdrop bumpers, a chocolate river (water), sticky caramel (sand),
     a lollipop windmill, candy-cane rails (every wall), a jelly jump (ramp) ---------------- */
  const CANDY = [
    { name: 'Sprinkle Start', theme: 'frosting', par: 2, tee: [200, 560], cup: [200, 125],
      wall: [{ p: [[110, 620], [290, 620], [290, 110], [250, 60], [150, 60], [110, 110]], c: 1, hw: 6 }],
      bump: [[165, 430, 15], [238, 330, 15], [170, 232, 14]], zone: [] },
    { name: 'Gumdrop Garden', theme: 'frosting', par: 3, tee: [275, 600], cup: [120, 110],
      wall: [{ p: [[70, 650], [340, 650], [340, 60], [70, 60]], c: 1, hw: 6 }, { p: [[70, 360], [250, 360]], hw: 8 }],
      bump: [[150, 520, 14], [292, 250, 14], [205, 210, 13], [120, 300, 12]], zone: [] },
    { name: 'Caramel Pit', theme: 'frosting', par: 3, tee: [200, 590], cup: [200, 105],
      wall: [{ p: [[60, 640], [340, 640], [340, 40], [60, 40]], c: 1, hw: 6 }],
      bump: [[135, 125, 12], [265, 125, 12]],
      zone: [{ k: 'sand', e: [200, 350, 100, 46] }, { k: 'sand', e: [110, 490, 36, 24] }, { k: 'sand', e: [292, 490, 36, 24] },
        { k: 'water', p: [[66, 190], [110, 200], [122, 250], [66, 262]] }, { k: 'water', p: [[334, 190], [290, 200], [278, 250], [334, 262]] }] },
    { name: 'Chocolate River', theme: 'frosting', par: 3, tee: [150, 700], cup: [200, 120],
      wall: [{ p: [[50, 750], [350, 750], [350, 40], [50, 40]], c: 1, hw: 6 }, { p: [[112, 470], [112, 540]], hw: 4 }, { p: [[188, 470], [188, 540]], hw: 4 }],
      bump: [[330, 200, 12], [110, 200, 13]],
      zone: [{ k: 'water', r: [44, 300, 270, 110] }, { k: 'ramp', r: [120, 470, 60, 50], d: [0, -1] }] },
    { name: 'Candy Cane Lane', theme: 'gummy', par: 3, tee: [120, 690], cup: [120, 105],
      wall: [{ p: [[65, 740], [175, 740], [175, 575], [335, 575], [335, 265], [175, 265], [175, 50], [65, 50], [65, 375], [225, 375], [225, 465], [65, 465]], c: 1, hw: 6 }],
      bump: [[295, 522, 13], [295, 320, 13]], zone: [] },
    { name: 'Lollipop Windmill', theme: 'frosting', par: 3, tee: [200, 670], cup: [200, 110],
      wall: [
        { p: [[60, 710], [340, 710], [340, 40], [60, 40]], c: 1, hw: 6 },
        { p: [[118, 300], [165, 300], [165, 384], [118, 384]], c: 1, hw: 4, solid: 1 },
        { p: [[235, 300], [282, 300], [282, 384], [235, 384]], c: 1, hw: 4, solid: 1 },
        { p: [[60, 342], [118, 342]], hw: 7 }, { p: [[282, 342], [340, 342]], hw: 7 },
        { p: [[165, 440], [165, 500]], hw: 4 }, { p: [[235, 440], [235, 500]], hw: 4 },
      ],
      bump: [[130, 190, 12], [270, 195, 12]],
      mill: { x: 200, y: 324, len: 64, door: [165, 235, 384] },
      zone: [{ k: 'water', r: [64, 440, 96, 60] }, { k: 'water', r: [240, 440, 96, 60] }] },
    { name: 'Jelly Jump', theme: 'gummy', par: 3, tee: [200, 620], cup: [200, 105],
      wall: [{ p: [[70, 680], [330, 680], [330, 40], [70, 40]], c: 1, hw: 6 }],
      bump: [[130, 150, 12], [270, 150, 12], [120, 560, 11]],
      zone: [{ k: 'water', r: [64, 220, 272, 150] }, { k: 'ramp', r: [160, 440, 80, 56], d: [0, -1] }] },
    { name: 'Marshmallow Maze', theme: 'gummy', par: 4, tee: [110, 590], cup: [300, 100],
      wall: [{ p: [[50, 640], [350, 640], [350, 40], [50, 40]], c: 1, hw: 6 }, { p: [[50, 500], [270, 500]], hw: 7 }, { p: [[130, 380], [350, 380]], hw: 7 }, { p: [[50, 260], [270, 260]], hw: 7 }],
      bump: [[300, 440, 12], [90, 320, 12], [300, 200, 12]], zone: [{ k: 'sand', e: [200, 560, 50, 26] }] },
    { name: 'Sugar Rush', theme: 'gummy', par: 4, tee: [100, 840], cup: [285, 115],
      wall: [{ p: [[50, 890], [350, 890], [350, 40], [50, 40]], c: 1, hw: 6 }, { p: [[50, 660], [270, 660]], hw: 8 }, { p: [[130, 360], [350, 360]], hw: 8 }],
      bump: [[300, 760, 14], [180, 770, 14], [100, 250, 13]],
      spin: { x: 205, y: 510, len: 62 },
      zone: [{ k: 'sand', e: [110, 760, 44, 26] }, { k: 'water', r: [160, 190, 110, 60] }] },
  ];
  /* ---------------- Space Station: low gravity (low friction), teleport airlocks, a satellite sweeper,
     black holes (water), conveyor belts, meteor bumpers ---------------- */
  const SPACE = [
    { name: 'Launch Pad', theme: 'station', par: 2, tee: [200, 565], cup: [200, 120],
      wall: [{ p: [[130, 620], [270, 620], [300, 560], [300, 140], [250, 60], [150, 60], [100, 140], [100, 560]], c: 1, hw: 6 }],
      bump: [[200, 400, 16], [148, 280, 12], [252, 215, 12]], zone: [] },
    { name: 'Airlock Alley', theme: 'station', par: 3, tee: [120, 640], cup: [250, 100],
      wall: [{ p: [[50, 690], [350, 690], [350, 40], [50, 40]], c: 1, hw: 6 }, { p: [[50, 370], [350, 370]], hw: 8 }],
      bump: [[200, 140, 13], [290, 200, 12]],
      port: [{ a: [300, 470], b: [110, 250] }],
      zone: [{ k: 'water', e: [130, 520, 42, 42] }] },
    { name: 'Zero-G Corridor', theme: 'nebula', par: 3, tee: [200, 660], cup: [200, 110],
      wall: [{ p: [[40, 720], [360, 720], [300, 40], [100, 40]], c: 1, hw: 6 }],
      bump: [[150, 430, 14], [255, 340, 13], [175, 230, 12]],
      zone: [{ k: 'lowg', r: [40, 40, 320, 680] }] },
    { name: 'Conveyor Belt', theme: 'station', par: 3, tee: [100, 670], cup: [300, 100],
      wall: [{ p: [[50, 720], [350, 720], [350, 40], [50, 40]], c: 1, hw: 6 }],
      bump: [[200, 620, 12], [110, 430, 12]],
      zone: [{ k: 'belt', r: [56, 520, 288, 90], f: [450, 0] }, { k: 'belt', r: [56, 330, 288, 90], f: [-450, 0] }, { k: 'belt', r: [240, 150, 100, 90], f: [0, 450] }] },
    { name: 'Event Horizon', theme: 'nebula', par: 3, tee: [200, 620], cup: [200, 100],
      wall: [{ p: [[50, 680], [350, 680], [350, 40], [50, 40]], c: 1, hw: 6 }],
      bump: [[110, 180, 13], [290, 180, 13], [200, 560, 12]],
      zone: [{ k: 'water', e: [200, 360, 50, 50] }, { k: 'slope', r: [150, 240, 100, 70], f: [0, 260] }, { k: 'slope', r: [150, 410, 100, 70], f: [0, -260] },
        { k: 'slope', r: [84, 310, 66, 100], f: [260, 0] }, { k: 'slope', r: [250, 310, 66, 100], f: [-260, 0] }] },
    { name: 'Satellite Sweep', theme: 'station', par: 3, tee: [200, 610], cup: [200, 100],
      wall: [{ p: [[60, 670], [340, 670], [340, 40], [60, 40]], c: 1, hw: 6 }],
      bump: [[130, 520, 12], [270, 520, 12]],
      spin: { x: 200, y: 350, len: 62 },
      zone: [{ k: 'belt', r: [66, 250, 54, 200], f: [0, -450] }, { k: 'belt', r: [280, 250, 54, 200], f: [0, -450] }] },
    { name: 'Meteor Shower', theme: 'nebula', par: 3, tee: [200, 650], cup: [200, 100],
      wall: [{ p: [[50, 710], [350, 710], [350, 40], [50, 40]], c: 1, hw: 6 }],
      bump: [[110, 540, 14], [200, 540, 15], [290, 540, 14], [155, 440, 13], [245, 440, 13], [110, 340, 14], [200, 340, 15], [290, 340, 14], [155, 240, 13], [245, 240, 13]],
      zone: [{ k: 'water', e: [100, 150, 28, 28] }, { k: 'water', e: [300, 150, 28, 28] }] },
    { name: 'Docking Bay', theme: 'station', par: 3, tee: [200, 700], cup: [230, 110],
      wall: [{ p: [[50, 760], [350, 760], [350, 40], [50, 40]], c: 1, hw: 6 }, { p: [[50, 520], [350, 520]], hw: 8 }, { p: [[50, 300], [350, 300]], hw: 8 }],
      bump: [[210, 250, 12]],
      port: [{ a: [120, 600], b: [280, 430] }, { a: [280, 360], b: [120, 190] }],
      zone: [{ k: 'lowg', r: [50, 40, 300, 260] }] },
    { name: 'Mission Control', theme: 'nebula', par: 4, tee: [100, 840], cup: [290, 115],
      wall: [{ p: [[50, 890], [350, 890], [350, 40], [50, 40]], c: 1, hw: 6 }, { p: [[50, 650], [270, 650]], hw: 8 }, { p: [[130, 390], [350, 390]], hw: 8 }],
      bump: [[110, 250, 13], [290, 330, 12], [300, 560, 12]],
      spin: { x: 200, y: 520, len: 62 },
      zone: [{ k: 'belt', r: [56, 720, 288, 80], f: [450, 0] }, { k: 'lowg', r: [50, 40, 300, 350] }, { k: 'water', e: [215, 250, 38, 38] }] },
  ];
  HOLES.push(...CANDY, ...SPACE);

  /* ---------------- courses ---------------- */
  const COURSES = {
    garden: { id: 'garden', name: 'Neon Garden', base: 0, thumb: 1, ca: '#79f5b6', blurb: 'The original nine: bumpers, ice, lava and a windmill.' },
    candy: { id: 'candy', name: 'Candy Land', base: 9, thumb: 3, ca: '#ff7ab8', blurb: 'Gumdrop bumpers, a chocolate river, sticky caramel and a lollipop windmill.' },
    space: { id: 'space', name: 'Space Station', base: 18, thumb: 1, ca: '#56d6ff', blurb: 'Low gravity, airlocks, conveyor belts, black holes and a satellite sweeper.' },
  };
  const COURSE_IDS = ['garden', 'candy', 'space'];
  COURSE_IDS.forEach(id => {
    const C = COURSES[id]; C.holes = HOLES.slice(C.base, C.base + HOLES_N); C.pars = C.holes.map(h => h.par); C.par = C.pars.reduce((a, b) => a + b, 0);
    C.holes.forEach((h, k) => { h.course = id; h.no = k + 1; });
  });
  const PARS = COURSES.garden.pars, PAR_TOTAL = COURSES.garden.par;     // the original course (kept for the tests)

  const CANDY_COLS = ['#ff5fa2', '#ffd66b', '#6df0c2', '#b68cff', '#ff9a5c'];          // gumdrops / sprinkles
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
    frosting: { name: 'Frosting Fields', skin: 'candy', bg: '#1a0d20', ground: ['#3a1a48', '#1a0c24'], felt: ['#73e6c4', '#3fbf9e'], slab: '#4a2358',
      wall: { top: '#fff7fb', side: '#c2457a', edge: '#ffe6f2', glow: '#ff7ab8', stripe: '#ff3d7f' }, lamp: '255,150,205', flag: '#ff4d6d', amb: 'sprinkle',
      water: ['#d79a66', '#7a4426', '#3d1d10'] },
    gummy: { name: 'Gummy Grotto', skin: 'candy', bg: '#0f0a24', ground: ['#2b1a5e', '#120a2a'], felt: ['#a488f0', '#7a5cd6'], slab: '#331d6e',
      wall: { top: '#fff7fb', side: '#36b38f', edge: '#e6fff5', glow: '#6df0c2', stripe: '#ff5fa2' }, lamp: '140,255,210', flag: '#ffd66b', amb: 'sprinkle',
      water: ['#d79a66', '#7a4426', '#3d1d10'] },
    station: { name: 'Orbital Deck', skin: 'space', bg: '#040814', ground: ['#0b1632', '#050a1a'], felt: ['#43587a', '#2d3d5c'], slab: '#16233f',
      wall: { top: '#cfdaf0', side: '#3a4a70', edge: '#a6eeff', glow: '#56d6ff', stripe: '#ffb84a' }, lamp: '110,200,255', flag: '#ffb84a', amb: 'stars',
      water: ['#b48cff', '#3a1a78', '#04020c'] },
    nebula: { name: 'Nebula Rim', skin: 'space', bg: '#080512', ground: ['#22113f', '#090518'], felt: ['#56598a', '#3b3e66'], slab: '#221543',
      wall: { top: '#ddd0ff', side: '#4a3a8c', edge: '#ffc9f4', glow: '#c48bff', stripe: '#7dffd2' }, lamp: '190,140,255', flag: '#7dffd2', amb: 'stars',
      water: ['#b48cff', '#3a1a78', '#04020c'] }
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
      i: hi, no: d.no, course: d.course, def: d, par: d.par, name: d.name, theme: d.theme, tee: d.tee, cup: d.cup,
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
        else if (zn.k === 'lowg') { fr = FR_LOW; dg = DG_LOW; s2 = 'lowg'; }
        else if (zn.k === 'slope' || zn.k === 'belt') { fx += zn.f[0]; fy += zn.f[1]; }
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
  const cbase = st => (COURSES[st && st.course] || COURSES.garden).base;
  const G = st => cbase(st) + ((st.hole | 0) || 0);                   // absolute hole id (index into HOLES) of the hole being played
  const parsOf = st => (COURSES[st && st.course] || COURSES.garden).pars;
  const teeBall = hi => ({ x: HOLES[hi].tee[0], y: HOLES[hi].tee[1], s: 0, done: 0 });
  function norm(st) {
    if (!st || typeof st !== 'object') return st;
    // A save made before the course picker existed has no phase / course / rule: it is a match in progress on
    // Neon Garden with the old "whoever is away" turn rule, and it plays exactly as it always did.
    st.phase = st.phase === 'setup' ? 'setup' : 'play';
    st.course = COURSES[st.course] ? st.course : (st.phase === 'setup' && st.course === 'surprise' ? 'surprise' : 'garden');
    st.rule = st.rule === 'alt' ? 'alt' : 'away';
    st.host = st.host === 1 ? 1 : 0;
    st.hole = clamp(st.hole | 0, 0, HOLES_N - 1);
    const tb = teeBall(G(st)), bs = Array.isArray(st.balls) ? st.balls : [];
    st.balls = [0, 1].map(i => { const b = bs[i] || {}; return { x: isFinite(+b.x) && b.x !== null && b.x !== '' ? +b.x : tb.x, y: isFinite(+b.y) && b.y !== null && b.y !== '' ? +b.y : tb.y, s: b.s | 0, done: b.done ? 1 : 0 }; });
    const cs = Array.isArray(st.cards) ? st.cards : [];
    st.cards = [0, 1].map(i => { const c = cs[i]; const out = []; for (let k = 0; k < HOLES_N; k++) out.push((c && +c[k]) || 0); return out; });
    st.n = st.n | 0; st.clk = st.clk | 0; st.ph = +st.ph || 0; st.over = st.over ? 1 : 0;
    st.honor = st.honor === 1 ? 1 : 0; if (st.turn !== 0 && st.turn !== 1) st.turn = st.honor;
    if (!st.seed) st.seed = 1;
    if (!st.last || typeof st.last !== 'object') st.last = null;
    else {
      const L = st.last; L.pv = Array.isArray(L.pv) ? L.pv : [0, 0]; L.ps = Array.isArray(L.ps) ? L.ps : [0, 0]; L.id = L.id | 0; L.hole = L.hole | 0; L.seat = L.seat === 1 ? 1 : 0;
      L.g = L.g !== undefined && L.g !== null && isFinite(+L.g) ? (L.g | 0) : cbase(st) + L.hole;   // old saves: the hole number is the id
    }
    // A phone still running the pre-course code (open since before the update) plays Neon Garden geometry and
    // tees up on Garden coordinates, so on Candy Land / Space Station its ball can land outside the course or
    // inside a block. Contain it: an impossible ball goes back to where it was last hit from (when that was on
    // this hole and is a real spot), else to the tee. Every spot this code (or any old save) produces is valid,
    // so nothing else ever moves. A ball with no strokes yet is always on this hole's tee (the old code tees up
    // the next hole on Garden coordinates, which may even be a valid spot here).
    if (st.phase === 'play') {
      const gi = G(st), L = st.last, tee = HOLES[gi].tee;
      st.balls.forEach((b, p) => {
        if (!b.done && b.s === 0) { b.x = tee[0]; b.y = tee[1]; return; }
        if (b.done || restOk(gi, b.x, b.y)) return;
        if (b.s > 0 && L && L.seat === p && L.g === gi && isFinite(+L.x0) && isFinite(+L.y0) && restOk(gi, +L.x0, +L.y0)) { b.x = +L.x0; b.y = +L.y0; }
        else { b.x = tee[0]; b.y = tee[1]; }
      });
    }
    return st;
  }
  // can a ball rest at (x, y) on hole gi? On the green, not in a block, a wall, a bumper or a hazard
  // (a resting ball may touch a wall or bumper, hence the 1.5-unit tolerance)
  function restOk(gi, x, y) {
    const H = hole(gi);
    if (!isFinite(x) || !isFinite(y) || !pip(H.bound, x, y)) return false;
    for (const q of H.solids) if (pip(q, x, y)) return false;
    for (const g of H.segs) if (segDist(g.ax, g.ay, g.bx, g.by, x, y) < g.hw + R - 1.5) return false;
    for (const b of H.bumps) { const dx = x - b[0], dy = y - b[1]; if (Math.sqrt(dx * dx + dy * dy) < b[2] + R - 1.5) return false; }
    for (const z of H.haz) if (inZone(z, x, y)) return false;
    return true;
  }
  // The last stroke was made by a phone on the pre-course code: a new match (v 2) whose `last` has no hole id,
  // or one that doesn't match this course. Checked on the RAW state (norm fills `g` in). → the seat, else -1.
  function oldClientSeat(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 2 || !raw.last || typeof raw.last !== 'object') return -1;
    const L = raw.last, g = L.g;
    const bad = g === undefined || g === null || !isFinite(+g) || (+g | 0) !== cbase(raw) + (L.hole | 0);
    return bad ? (L.seat === 1 ? 1 : 0) : -1;
  }
  const totals = st => [0, 1].map(p => st.cards[p].reduce((a, v) => a + v, 0) + (st.balls[p].done ? 0 : st.balls[p].s));
  // Plain alternation (every match made since the course picker): the other player putts next; a player who has
  // holed out is skipped until the hole ends. The tee order is the honour, then simply taking turns.
  function altTurn(st, justPlayed) {
    const live = [0, 1].filter(p => !st.balls[p].done);
    if (!live.length) return st.turn;
    if (live.length === 1) return live[0];
    return justPlayed === 0 || justPlayed === 1 ? 1 - justPlayed : st.honor;
  }
  function nextTurn(st, justPlayed) {
    if (st.rule === 'alt') return altTurn(st, justPlayed);
    // the old rule (saves from before the course picker): whoever is farther from the cup putts next
    const live = [0, 1].filter(p => !st.balls[p].done);
    if (!live.length) return st.turn;
    if (live.length === 1) return live[0];
    const unteed = live.filter(p => st.balls[p].s === 0);             // everyone tees off first, honour first
    if (unteed.length) return unteed.includes(st.honor) ? st.honor : unteed[0];
    const gi = G(st), d0 = away(gi, st.balls[0].x, st.balls[0].y), d1 = away(gi, st.balls[1].x, st.balls[1].y);
    if (Math.abs(d0 - d1) < .5) return justPlayed === 0 || justPlayed === 1 ? 1 - justPlayed : st.honor;
    return d0 > d1 ? 0 : 1;
  }
  const winnerOf = st => { const t = totals(st); return t[0] === t[1] ? 'draw' : (t[0] < t[1] ? 0 : 1); };
  // both balls are done: honour, then the next hole (or the end). Returns the winner when it's over.
  function endHole(s) {
    const hi = s.hole, c0 = s.cards[0][hi], c1 = s.cards[1][hi];
    if (c0 !== c1) s.honor = c0 < c1 ? 0 : 1;
    if (hi >= HOLES_N - 1) { s.over = 1; s.turn = s.honor; return winnerOf(s); }
    s.hole = hi + 1; s.balls = [teeBall(G(s)), teeBall(G(s))]; s.turn = s.honor;
    return undefined;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  /* ---- the course picker (phase 'setup'): the host chooses, the partner watches it live ---- */
  // "Surprise me" is drawn from the match seed and the pick count, so every phone (and a timeout) agrees on it
  const surpriseCourse = st => COURSE_IDS[(((st.seed | 0) + (st.n | 0) * 7) >>> 0) % COURSE_IDS.length];
  function pickCourse(st0, id) {
    const s = norm(clone(st0));
    if (s.phase !== 'setup' || (!COURSES[id] && id !== 'surprise')) return s;
    s.course = id; s.n += 1; s.clk = s.n;                              // a fresh clock for the host on every pick
    return s;
  }
  // the pick becomes the match: hole 1 of the chosen course, the host tees first, plain alternation from here on
  function beginMatch(st0) {
    const s = norm(clone(st0));
    if (s.phase !== 'setup') return s;
    s.course = s.course === 'surprise' ? surpriseCourse(s) : s.course;
    s.phase = 'play'; s.rule = 'alt'; s.hole = 0; s.over = 0; s.ph = 0; s.last = null;
    s.balls = [teeBall(G(s)), teeBall(G(s))]; s.cards = [Array(HOLES_N).fill(0), Array(HOLES_N).fill(0)];
    s.honor = s.host; s.turn = s.host; s.n += 1; s.clk = s.n;          // `clk` changes → the turn clock restarts
    return s;
  }
  // One putt, fully resolved into the next state. Pure apart from the `at` timestamp.
  function applyStroke(st0, seat, ang, pow, ph, res) {
    const st = norm(clone(st0)), s = clone(st), gi = G(s), hi = s.hole, b = s.balls[seat];
    const r = res || simulate(gi, b.x, b.y, ang, pow, ph, false);
    const pv = totals(st), ps = [st.balls[0].s, st.balls[1].s], x0 = b.x, y0 = b.y;
    b.s += r.out === 'water' ? 2 : 1;                                     // penalty stroke
    let pick = 0;
    if (r.out === 'cup') { b.done = 1; b.x = HOLES[gi].cup[0]; b.y = HOLES[gi].cup[1]; s.cards[seat][hi] = b.s; }
    else {
      if (r.out === 'rest') { b.x = r2(r.x); b.y = r2(r.y); }             // water: back where it was hit from
      if (b.s >= MAX_STROKES) { b.done = 1; pick = 1; s.cards[seat][hi] = PICKUP; }
    }
    s.n = st.n + 1; s.clk = s.n;                                          // every stroke gives the next player a fresh turn clock
    const w = phaseSpeed(gi); s.ph = w ? r4(normAng(ph + w * r.steps * DT)) : st.ph;
    s.last = { id: s.n, seat, hole: hi, g: gi, x0, y0, ang, pow, ph, out: r.out, x: b.x, y: b.y, s: b.s, pick, pv, ps, at: Date.now() };
    let winner;
    if (s.balls[0].done && s.balls[1].done) winner = endHole(s);
    else s.turn = nextTurn(s, seat);
    return { s, winner, res: r };
  }
  // the timer ran out: the stroke counts, the ball doesn't move, and the turn passes if it can.
  // In the course picker a timeout must never forfeit: the match simply starts with what is picked.
  function skipState(st0, opp) {
    const s = norm(clone(st0)), me = 1 - opp;
    if (s.phase === 'setup') return beginMatch(s);
    if (s.over) return s;
    const b = s.balls[me], hi = s.hole;
    if (b.done) { s.turn = nextTurn(s, me); return s; }
    const pv = totals(s), ps = [s.balls[0].s, s.balls[1].s];
    b.s += 1; let pick = 0;
    if (b.s >= MAX_STROKES) { b.done = 1; pick = 1; s.cards[me][hi] = PICKUP; }
    s.n += 1; s.clk = s.n;
    s.last = { id: s.n, seat: me, hole: hi, g: G(s), skip: 1, out: 'skip', x0: b.x, y0: b.y, x: b.x, y: b.y, s: b.s, pick, pv, ps, at: Date.now() };
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
    S.phBase = st.ph; S.phT0 = performance.now(); S.lastSay = ''; S.focusId = ''; S.oldWarn = 0;
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
  const curHole = () => S.shownHole >= 0 ? S.shownHole : (S.ctx && S.ctx.state ? G(S.ctx.state) : 0);     // an index into HOLES (all courses)
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
    // stale on open, or this phone already started it before a reload (`sm_mg_seen`) → don't replay
    if (L.skip || S.oldId === L.id || (fresh && (!(Math.abs(Date.now() - (L.at || 0)) < 60000) || seenId(st.seed) >= L.id))) {
      S.doneId = L.id; markSeen(st.seed, L.id);
      if (L.skip && !fresh) { try { S.ctx.msg(`⏱ ${S.ctx.players[L.seat].name} ran out of time — the stroke counts`); S.ctx.sound.bad(); } catch (e) {} }
      return;
    }
    const r = simulate(L.g, L.x0, L.y0, L.ang, L.pow, L.ph, true);
    const len = r.path.length / 3 - 1;
    const endX = r.path[len * 3], endY = r.path[len * 3 + 1];
    S.anim = { id: L.id, L, r, len, clock: 0, ei: 0, tail: 0, tailMax: L.out === 'cup' ? 80 : L.out === 'water' ? 70 : 34,
      dx: L.out === 'rest' ? L.x - endX : 0, dy: L.out === 'rest' ? L.y - endY : 0, started: false, dropT: 0, lastV: 0 };
    if (S.shownHole !== L.g) { S.shownHole = L.g; S.layer = null; S.intro = null; S.summary = null; }
    S.phBase = L.ph; S.phT0 = performance.now();
    markSeen(st.seed, L.id);                                          // a reload from here on snaps to the rest spot
    if (L.seat !== S.ctx.me) { try { S.ctx.sound.place(); } catch (e) {} }
  }
  // the last stroke this phone has started replaying, per match seed (so a reload never replays it)
  const SEEN_KEY = 'sm_mg_seen';
  function seenId(seed) { try { const o = JSON.parse(localStorage.getItem(SEEN_KEY) || 'null'); return o && o.k === seed ? o.id | 0 : 0; } catch (e) { return 0; } }
  function markSeen(seed, id) { try { if (seenId(seed) < id) localStorage.setItem(SEEN_KEY, JSON.stringify({ k: seed, id })); } catch (e) {} }
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
      const nm = c.players[L.seat].name, par = HOLES[L.g].par, sk = THEMES[HOLES[L.g].theme].skin;
      let txt;
      if (L.out === 'cup') txt = `⛳ ${nm} holed out — <b>${label(L.s, par)}</b> (${L.s})`;
      else if (L.out === 'water') txt = `💦 ${HOLES[L.g].theme === 'lava' ? 'Into the lava' : sk === 'candy' ? 'Into the chocolate' : sk === 'space' ? 'Lost in the black hole' : 'Splash'}! +1 penalty — ${nm}'s ball goes back to where it was hit from`;
      else txt = `${nm}'s ball stops · ${L.s} stroke${L.s === 1 ? '' : 's'}`;
      if (L.pick) txt += ` · <b>picked up (7)</b>`;
      try { c.msg(txt); } catch (e) {}
      if (L.hole !== st.hole || st.over) startSummary(L.g);
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
    const gi = G(st);
    if (S.shownHole !== gi) {
      const first = S.shownHole === -1;
      S.shownHole = gi; S.layer = null; S.parts = [];
      const fresh = st.balls[0].s === 0 && st.balls[1].s === 0 && !st.over;
      if (fresh && !(first && S.ctx.status === 'finished')) startIntro(gi);
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
    if (G(st) !== hi || st.over) return clampCam({ x: H.cup[0], y: H.cup[1] + 30, z: 1.05 }, hi);
    const b = activeBall(), dx = H.cup[0] - b.x, dy = H.cup[1] - b.y, d = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(150, d * .38) / d;
    return clampCam({ x: b.x + dx * k, y: b.y + dy * k, z: 1 }, hi);
  }

  /* ---------------- per-frame simulation (cosmetic) ---------------- */
  function step(dtms) {
    const f = dtms / 16.667; S.tick += f;
    const c = S.ctx; if (!c || !c.state) return;
    const st = c.state;
    const H = hole(curHole()), th = THEMES[H.theme];
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
        if (G(st) !== S.shownHole && !st.over) { S.shownHole = G(st); S.layer = null; S.parts = []; startIntro(G(st)); }
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
      S.amb.push({ x: S.cam.x + rnd(-v.w / 2, v.w / 2), y: S.cam.y + rnd(-v.h / 2, v.h / 2), ph: rnd(0, 6.28), life: rnd(160, 320), max: 320, vx: rnd(-6, 6),
        vy: th.amb === 'snow' ? rnd(10, 22) : th.amb === 'sprinkle' ? rnd(8, 16) : th.amb === 'ember' ? rnd(-26, -12) : th.amb === 'stars' ? rnd(-2, 2) : rnd(-5, 5), c: (Math.random() * 5) | 0 });
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
    } else if (e.k === 'water' && th.skin === 'space') {           // swallowed: rings collapse inward, no splash
      for (let i = 0; i < 3; i++) S.parts.push({ k: 'ring', x: e.x, y: e.y, r0: 34 + i * 12, r1: 3, life: 30 + i * 8, max: 30 + i * 8, c: '190,150,255', flat: 1 });
      for (let i = 0; i < 16; i++) { const a = rnd(0, 6.28), d = rnd(18, 40); S.parts.push({ k: 'spark', x: e.x + Math.cos(a) * d, y: e.y + Math.sin(a) * d, vx: -Math.cos(a) * d * 2.2, vy: -Math.sin(a) * d * 2.2, life: 26, max: 26, c: '210,180,255', s: rnd(1, 1.8) }); }
      A.sink = { x: e.x, y: e.y, t: 0 };
      S.shake = Math.max(S.shake, 3); snd('bad'); haptic([30, 30, 50]);
      S.floats.push({ text: 'LOST IN SPACE! +1', x: e.x, y: e.y - 26, c: '#d4b8ff', life: 80, max: 80, big: 1 });
    } else if (e.k === 'water' || e.k === 'lava') {
      const lava = e.k === 'lava', choc = th.skin === 'candy', c1 = lava ? '255,150,60' : choc ? '230,170,120' : '190,240,255';
      for (let i = 0; i < 3; i++) S.parts.push({ k: 'ring', x: e.x, y: e.y, r0: 4, r1: 30 + i * 14, life: 30 + i * 10, max: 30 + i * 10, c: c1, flat: 1 });
      for (let i = 0; i < 26; i++) S.parts.push({ k: 'drop', x: e.x, y: e.y, z: 2, vx: rnd(-80, 80), vy: rnd(-80, 80), vz: rnd(120, 260), life: 60, max: 60, c: lava ? (Math.random() < .5 ? '#ffb14a' : '#ff5a1f') : choc ? (Math.random() < .5 ? '#8a4a24' : '#c98a52') : (Math.random() < .5 ? '#bff4ff' : '#5fd6ee'), s: rnd(1.2, 2.4) });
      if (lava) for (let i = 0; i < 6; i++) S.parts.push({ k: 'puff', x: e.x + rnd(-6, 6), y: e.y - rnd(0, 8), vx: rnd(-8, 8), vy: rnd(-26, -10), r: rnd(6, 10), gr: .3, life: 70, max: 70, c: '70,60,70' });
      A.sink = { x: e.x, y: e.y, t: 0 };
      S.shake = Math.max(S.shake, 4); snd('bad'); haptic([30, 30, 50]);
      S.floats.push({ text: lava ? 'SIZZLE! +1' : choc ? 'SPLOSH! +1' : 'SPLASH! +1', x: e.x, y: e.y - 26, c: lava ? '#ffb468' : choc ? '#ffc98f' : '#8fe9ff', life: 80, max: 80, big: 1 });
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
    const hi = curHole(), H = hole(hi), th = THEMES[H.theme];
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
        if (th.skin === 'candy') {                                    // candy-cane arms
          g.fillStyle = '#fff6fb'; rr(g, 0, -4.5, sp.len, 8, 4); g.fill();
          g.save(); rr(g, 0, -4.5, sp.len, 8, 4); g.clip(); g.fillStyle = th.wall.stripe || '#ff3d7f';
          for (let x = 4; x < sp.len; x += 11) { g.beginPath(); g.moveTo(x, -5); g.lineTo(x + 5, -5); g.lineTo(x + 1, 5); g.lineTo(x - 4, 5); g.closePath(); g.fill(); }
          g.restore(); g.restore(); continue;
        }
        if (th.skin === 'space') {                                    // solar-panel wings on a boom
          g.fillStyle = '#9aa6bf'; g.fillRect(0, -1.5, sp.len, 3);
          g.fillStyle = '#1b3a7a'; g.fillRect(16, -8, sp.len - 18, 16);
          g.strokeStyle = 'rgba(140,200,255,.55)'; g.lineWidth = .8; g.beginPath();
          for (let x = 16; x <= sp.len - 2; x += 7) { g.moveTo(x, -8); g.lineTo(x, 8); } g.moveTo(16, 0); g.lineTo(sp.len - 2, 0); g.stroke();
          g.strokeStyle = '#cfd8ea'; g.lineWidth = 1; g.strokeRect(16, -8, sp.len - 18, 16);
          g.restore(); continue;
        }
        g.fillStyle = '#5a3a1e'; rr(g, 0, -4, sp.len + 2, 9, 4.5); g.fill();
        const gr = g.createLinearGradient(0, -4.5, 0, 4.5); gr.addColorStop(0, '#e2c08a'); gr.addColorStop(1, '#8a5a2c');
        g.fillStyle = gr; rr(g, 0, -4.5, sp.len, 8, 4); g.fill();
        g.fillStyle = th.flag; g.fillRect(sp.len - 14, -4.5, 8, 8);
        g.restore();
      }
      const hub = g.createRadialGradient(-3, -4, 1, 0, 0, SPIN_HUB + 2);
      if (th.skin === 'space') { hub.addColorStop(0, '#f2f6ff'); hub.addColorStop(1, '#6f7d9c'); }
      else if (th.skin === 'candy') { hub.addColorStop(0, '#fff'); hub.addColorStop(1, '#ff7ab8'); }
      else { hub.addColorStop(0, '#fff3cf'); hub.addColorStop(1, '#b2863c'); }
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
      if (S.shownHole !== G(st)) continue;
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
    if (S.shownHole === G(st)) [0, 1].forEach(p => {
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
    else if (G(st) === S.shownHole) near = st.balls.some(b => !b.done && Math.abs(b.x - cx) < 30 && b.y < cy + 8 && b.y > cy - 64);
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
    g.fillText(String(H.no), cx + 9, top + 7.5 + wig * .3);
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
    const candy = th.skin === 'candy';
    for (let k = 0; k < 4; k++) {
      const a = a0 + k * Math.PI / 2;
      g.save(); g.rotate(a);
      if (candy) {                                                    // lollipop sails: a stick and a swirl disc
        g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 4; g.beginPath(); g.moveTo(6, 3); g.lineTo(M.len - 12, 3); g.stroke();
        g.strokeStyle = '#fff6fb'; g.lineWidth = 3; g.beginPath(); g.moveTo(4, 0); g.lineTo(M.len - 14, 0); g.stroke();
        lollipop(g, M.len - 12, 0, 12, CANDY_COLS[k % CANDY_COLS.length]);
        g.restore(); continue;
      }
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
      else if (th.amb === 'sprinkle') { g.save(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = al * .8; g.translate(a.x, a.y); g.rotate(a.ph + S.tick * .02); g.fillStyle = CANDY_COLS[a.c]; g.fillRect(-2.2, -.7, 4.4, 1.4); g.restore(); }
      else if (th.amb === 'stars') { const tw = .5 + .5 * Math.sin(S.tick * .08 + a.ph); g.fillStyle = `rgba(220,235,255,${al * (.2 + tw * .7)})`; g.beginPath(); g.arc(a.x, a.y, .7 + tw * .8, 0, TAU); g.fill(); }
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
    g.fillText(`HOLE ${H.no}`, 22, 25.5);
    g.fillStyle = 'rgba(234,240,255,.55)'; g.font = '700 10.5px "Chakra Petch", system-ui, sans-serif';
    g.fillText(`PAR ${H.par}`, 84, 26);
    // strokes on this hole, per player (pre-putt while a roll replays)
    const here = G(st) === H.i, k = H.no - 1;
    const on = A ? A.L.ps : (here ? [st.balls[0].s, st.balls[1].s] : [st.cards[0][k], st.cards[1][k]]);
    const done = [0, 1].map(p => A ? (A.L.hole !== st.hole || st.balls[p].done) && A.L.seat !== p : (here ? st.balls[p].done : 1));
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
    g.fillText((COURSES[H.course] || COURSES.garden).name.toUpperCase(), W / 2, y - 36 + rise);
    g.fillStyle = '#ffffff'; g.font = '900 34px Orbitron, system-ui, sans-serif';
    g.shadowColor = th.wall.glow; g.shadowBlur = 14; g.fillText(`HOLE ${H.no}`, W / 2, y - 6 + rise); g.shadowBlur = 0;
    g.fillStyle = 'rgba(234,240,255,.8)'; g.font = '600 14px "Chakra Petch", system-ui, sans-serif';
    g.fillText(`${H.name}  ·  Par ${H.par}`, W / 2, y + 26 + rise);
    g.fillStyle = 'rgba(234,240,255,.45)'; g.font = '600 10px "Chakra Petch", system-ui, sans-serif';
    g.fillText('tap to skip', W / 2, y + 45 + rise);
    g.restore();
  }
  function drawSummary(g, W, Hh) {
    const Sm = S.summary, c = S.ctx, st = c.state, hi = HOLES[Sm.hi].no - 1, par = HOLES[Sm.hi].par;   // Sm.hi indexes HOLES, hi the scorecard
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
    } else if (th.skin === 'candy') {
      for (let i = 0; i < 16; i++) {                                     // cotton-candy clouds
        const x = rx(), y = ry(), s2 = 30 + r() * 50, c = r() < .5 ? '255,160,210' : '170,220,255';
        const gg = g.createRadialGradient(x, y, 0, x, y, s2); gg.addColorStop(0, `rgba(${c},.2)`); gg.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gg; g.beginPath(); g.arc(x, y, s2, 0, TAU); g.fill();
      }
      for (let i = 0; i < 260; i++) {                                    // sprinkles
        const x = rx(), y = ry(); if (!out(x, y)) continue;
        g.save(); g.translate(x, y); g.rotate(r() * TAU); g.fillStyle = CANDY_COLS[i % CANDY_COLS.length]; rr(g, -3, -1, 6, 2, 1); g.fill(); g.restore();
      }
      for (let i = 0; i < 12; i++) { const x = rx(), y = ry(); if (!out(x, y) || !out(x, y + 26)) continue; lollipop(g, x, y, 11 + r() * 8, CANDY_COLS[i % CANDY_COLS.length]); }
      for (let i = 0; i < 18; i++) { const x = rx(), y = ry(); if (!out(x, y)) continue; gumdrop(g, x, y, 6 + r() * 6, CANDY_COLS[(i + 2) % CANDY_COLS.length], ls); }
    } else if (th.skin === 'space') {
      for (let i = 0; i < 420; i++) {                                    // a star field
        const x = rx(), y = ry(), b = r(); g.fillStyle = `rgba(${b < .15 ? '255,220,180' : b < .3 ? '180,210,255' : '255,255,255'},${.25 + r() * .7})`;
        g.beginPath(); g.arc(x, y, .4 + r() * (b < .05 ? 1.6 : .9), 0, TAU); g.fill();
      }
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {                                      // nebula glow
        const x = rx(), y = ry(), s2 = 70 + r() * 90, c = th.lamp;
        const gg = g.createRadialGradient(x, y, 0, x, y, s2); gg.addColorStop(0, `rgba(${c},.12)`); gg.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gg; g.beginPath(); g.arc(x, y, s2, 0, TAU); g.fill();
      }
      g.restore();
      for (let i = 0; i < 3; i++) { const x = rx(), y = ry(); if (!out(x, y)) continue; planet(g, x, y, 18 + r() * 22, r); }
    } else {                                                                 // castle flagstones
      for (let y = B.y0; y < B.y1; y += 26) {
        let x = B.x0 - r() * 30;
        while (x < B.x1) { const w = 26 + r() * 30, v = 26 + Math.round(r() * 12); g.fillStyle = `rgb(${v},${v + 2},${v + 12})`; rr(g, x + 1.5, y + 1.5, w - 3, 23, 3); g.fill(); g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(x + 2, y + 2, w - 4, 2); if (r() < .15) { g.fillStyle = 'rgba(80,140,70,.25)'; g.beginPath(); g.arc(x + r() * w, y + 20, 3 + r() * 4, 0, TAU); g.fill(); } x += w; }
      }
    }
  }
  function lollipop(g, x, y, s, col) {
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + 3, y + 3); g.lineTo(x + 3, y + s * 2.3); g.stroke();
    g.strokeStyle = '#fff6fb'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + s * 2.2); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = s * .22; g.beginPath();
    for (let a = 0; a < TAU * 2.2; a += .2) { const d = s * .88 * a / (TAU * 2.2); a ? g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d) : g.moveTo(x, y); }
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(x - s * .35, y - s * .4, s * .28, s * .16, -.6, 0, TAU); g.fill();
  }
  function gumdrop(g, x, y, s, col, ls) {
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + 2, y + s * .5 + 2, s, s * .45, 0, 0, TAU); g.fill();
    const gg = g.createRadialGradient(x - s * .3, y - s * .5, 1, x, y, s * 1.2); gg.addColorStop(0, lighten(col, .55)); gg.addColorStop(1, col);
    g.fillStyle = gg; g.beginPath(); g.moveTo(x - s, y + s * .5); g.quadraticCurveTo(x - s, y - s, x, y - s); g.quadraticCurveTo(x + s, y - s, x + s, y + s * .5); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; for (let k = 0; k < 5; k++) g.fillRect(x - s * .6 + k * s * .3, y - s * .3 + (k % 2) * s * .4, .9, .9);   // sugar
  }
  function planet(g, x, y, s, r) {
    const hue = r() < .5 ? ['#ffb86b', '#b8541e'] : ['#8fd0ff', '#2c4f9a'];
    const gg = g.createRadialGradient(x - s * .4, y - s * .4, 1, x, y, s); gg.addColorStop(0, hue[0]); gg.addColorStop(1, hue[1]);
    g.fillStyle = gg; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x + s * .25, y + s * .2, s * .95, 0, TAU); g.arc(x, y, s, 0, TAU, true); g.fill('evenodd');
    g.strokeStyle = 'rgba(255,235,200,.55)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(x, y, s * 1.7, s * .42, -.35, 0, TAU); g.stroke();
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
    if (th.skin !== 'space') for (let k = -30; k < 30; k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; g.fillRect(-700, k * 26, 1400, 26); }
    g.restore();
    if (th.skin === 'space') {                                        // riveted deck plates instead of mowing stripes
      g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1.2;
      for (let x = Math.floor(H.bb.x0 / 48) * 48; x < H.bb.x1; x += 48) { g.beginPath(); g.moveTo(x, H.bb.y0); g.lineTo(x, H.bb.y1); g.stroke(); }
      for (let y = Math.floor(H.bb.y0 / 48) * 48; y < H.bb.y1; y += 48) { g.beginPath(); g.moveTo(H.bb.x0, y); g.lineTo(H.bb.x1, y); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,.14)';
      for (let x = Math.floor(H.bb.x0 / 48) * 48; x < H.bb.x1; x += 48) for (let y = Math.floor(H.bb.y0 / 48) * 48; y < H.bb.y1; y += 48) { g.fillRect(x + 4, y + 4, 1.4, 1.4); g.fillRect(x + 43, y + 4, 1.4, 1.4); }
    }
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
    H.bumps.forEach((q, i) => th.skin === 'space' ? meteor(g, q[0], q[1], q[2], th, ls, i) : cylinder(g, q[0], q[1], q[2], th, ls, th.skin === 'candy' ? CANDY_COLS[i % CANDY_COLS.length] : null));
    if (H.spin) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(H.spin.x + 3, H.spin.y + 5, SPIN_HUB + 4, 0, TAU); g.fill(); }
    // tunnel mouths
    H.ports.forEach(P => [P.a, P.b].forEach((q, j) => {
      if (th.skin === 'space') {                                     // an airlock hatch: octagonal, hazard-ringed
        const oct = []; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + Math.PI / 8; oct.push([q[0] + Math.cos(a) * (PORT_R + 4), q[1] + Math.sin(a) * (PORT_R + 4)]); }
        g.fillStyle = 'rgba(0,0,0,.45)'; g.save(); g.translate(2, 3); polyPath(g, oct, true); g.fill(); g.restore();
        g.fillStyle = '#39445e'; polyPath(g, oct, true); g.fill();
        g.save(); polyPath(g, oct, true); g.clip(); g.strokeStyle = j ? '#7dffd2' : '#ffb84a'; g.lineWidth = 4; g.setLineDash([4, 4]); g.beginPath(); g.arc(q[0], q[1], PORT_R + 2, 0, TAU); g.stroke(); g.restore();
        const hg = g.createRadialGradient(q[0], q[1], 1, q[0], q[1], PORT_R - 1); hg.addColorStop(0, '#000'); hg.addColorStop(1, j ? '#0a3a33' : '#3a2408');
        g.fillStyle = hg; g.beginPath(); g.arc(q[0], q[1], PORT_R - 1, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '700 7px Orbitron, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(j ? 'OUT' : 'IN', q[0], q[1] + PORT_R + 11);
        return;
      }
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
      if (th.skin === 'candy') {                                     // candy-cane rails
        g.save(); g.strokeStyle = Wt.stripe; g.lineWidth = 2 * hw - 1.5; g.lineCap = 'butt'; g.setLineDash([6, 6]); wallPath(w); g.stroke(); g.restore();
      } else if (th.skin === 'space') {                              // hull plating with marker lights
        g.save(); g.strokeStyle = 'rgba(40,50,80,.45)'; g.lineWidth = 1; g.setLineDash([14, 3]); wallPath(w); g.stroke();
        g.strokeStyle = Wt.stripe; g.lineWidth = 2.2; g.setLineDash([1.5, 22]); wallPath(w); g.stroke(); g.restore();
      }
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
      const cdy = th.skin === 'candy', tg = g.createLinearGradient(M.x - 40, 0, M.x + 40, 0);
      if (cdy) { tg.addColorStop(0, '#8a4a2a'); tg.addColorStop(.5, '#d7925a'); tg.addColorStop(1, '#7a3e20'); }       // a gingerbread tower
      else { tg.addColorStop(0, '#6b5a4a'); tg.addColorStop(.5, '#b99a78'); tg.addColorStop(1, '#5a4636'); }
      g.fillStyle = tg; g.beginPath(); g.moveTo(M.x - 34, M.y + 50); g.lineTo(M.x - 26, M.y - 30); g.lineTo(M.x + 26, M.y - 30); g.lineTo(M.x + 34, M.y + 50); g.closePath(); g.fill();
      g.restore();
      const rf = g.createLinearGradient(M.x - 34, 0, M.x + 34, 0);
      if (cdy) { rf.addColorStop(0, '#f3a6c8'); rf.addColorStop(.5, '#fff0f7'); rf.addColorStop(1, '#e98bb5'); }       // an icing roof
      else { rf.addColorStop(0, '#6a1f2c'); rf.addColorStop(.5, '#c23a4e'); rf.addColorStop(1, '#5a1824'); }
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
    } else if (th.skin === 'candy') {                               // iced cake blocks with sprinkles
      const bg = g.createLinearGradient(0, y0, 0, y1); bg.addColorStop(0, '#ffd3e6'); bg.addColorStop(1, '#f59ac2');
      g.fillStyle = bg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let i = 0; i < (x1 - x0) * (y1 - y0) / 60; i++) { g.save(); g.translate(x0 + 4 + r() * (x1 - x0 - 8), y0 + 4 + r() * (y1 - y0 - 8)); g.rotate(r() * TAU); g.fillStyle = CANDY_COLS[i % CANDY_COLS.length]; rr(g, -2.5, -.8, 5, 1.6, .8); g.fill(); g.restore(); }
    } else {
      const bg = g.createLinearGradient(0, y0, 0, y1); bg.addColorStop(0, lighten(th.wall.top, .08)); bg.addColorStop(1, darken(th.wall.top, .12));
      g.fillStyle = bg; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x0, y0, x1 - x0, 3);
    g.restore();
  }
  // a bumper post; `gum` (Candy Land) makes it a sugared gumdrop of that colour
  function cylinder(g, x, y, r, th, ls, gum) {
    const h = 8, side = gum ? toHex(darken(gum, .25)) : th.wall.side, top = gum || th.wall.top;
    g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 8 * ls; g.shadowOffsetX = 3 * ls; g.shadowOffsetY = (h + 2) * ls;
    g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore();
    for (let k = h; k >= 1; k--) { g.fillStyle = mix(side, darken(side, .5), k / h); g.beginPath(); g.arc(x, y + k, r, 0, TAU); g.fill(); }
    if (gum) {
      const tg2 = g.createRadialGradient(x - r * .35, y - r * .45, 1, x, y, r); tg2.addColorStop(0, lighten(gum, .6)); tg2.addColorStop(1, gum);
      g.fillStyle = tg2; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 9; k++) { const a = k * 2.4, d = r * (.25 + (k % 3) * .22); g.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, 1.1, 1.1); }
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(x - r * .35, y - r * .42, r * .3, r * .18, -.6, 0, TAU); g.fill();
      return;
    }
    const tg = g.createRadialGradient(x - r * .35, y - r * .4, 1, x, y, r); tg.addColorStop(0, lighten(top, .45)); tg.addColorStop(1, top);
    g.fillStyle = tg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.save(); g.shadowColor = th.wall.glow; g.shadowBlur = 8 * ls; g.strokeStyle = hexA(th.wall.edge, .9); g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, r - 2.5, 0, TAU); g.stroke(); g.restore();
    g.fillStyle = hexA(th.wall.glow, .9); g.beginPath(); g.arc(x, y, r * .28, 0, TAU); g.fill();
  }
  // a meteor bumper (Space Station): a lumpy lit rock with craters
  function meteor(g, x, y, r, th, ls, i) {
    const rr3 = rng(i * 131 + 7), pts = []; for (let k = 0; k < 11; k++) { const a = k / 11 * TAU; pts.push([x + Math.cos(a) * r * (.88 + rr3() * .2), y + Math.sin(a) * r * (.88 + rr3() * .2)]); }
    g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 8 * ls; g.shadowOffsetX = 3 * ls; g.shadowOffsetY = 9 * ls;
    g.fillStyle = '#2a2632'; polyPath(g, pts, true); g.fill(); g.restore();
    const mg = g.createRadialGradient(x - r * .4, y - r * .45, 1, x, y, r * 1.1); mg.addColorStop(0, '#b3aabb'); mg.addColorStop(.6, '#6e6578'); mg.addColorStop(1, '#3a3442');
    g.fillStyle = mg; polyPath(g, pts, true); g.fill();
    for (let k = 0; k < 3; k++) { const a = rr3() * TAU, d = rr3() * r * .5, cr = r * (.14 + rr3() * .12), cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
      g.fillStyle = 'rgba(30,24,38,.45)'; g.beginPath(); g.arc(cx, cy, cr, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = .8; g.beginPath(); g.arc(cx, cy, cr, .6 * Math.PI, 1.6 * Math.PI); g.stroke(); }
    g.save(); g.shadowColor = th.wall.glow; g.shadowBlur = 6 * ls; g.strokeStyle = hexA(th.wall.glow, .55); g.lineWidth = 1; polyPath(g, pts, true); g.stroke(); g.restore();
  }
  function drawZone(g, z, th, r, ls) {
    if (z.k === 'sand' && th.skin === 'candy') {                    // sticky caramel: glossy, no rake lines
      g.save(); zonePath(g, z); g.clip();
      const cg = g.createRadialGradient(z.x0 + (z.x1 - z.x0) * .35, z.y0 + (z.y1 - z.y0) * .3, 2, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, Math.max(z.x1 - z.x0, z.y1 - z.y0) * .7);
      cg.addColorStop(0, '#f7c46a'); cg.addColorStop(.6, '#d98a2b'); cg.addColorStop(1, '#9a5214'); g.fillStyle = cg; g.fillRect(z.x0 - 4, z.y0 - 4, z.x1 - z.x0 + 8, z.y1 - z.y0 + 8);
      g.strokeStyle = 'rgba(255,236,190,.45)'; g.lineWidth = 2; g.lineCap = 'round';
      for (let i = 0; i < 5; i++) { const x = z.x0 + r() * (z.x1 - z.x0), y = z.y0 + r() * (z.y1 - z.y0), w = 10 + r() * 18; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 4, x + w, y + 1); g.stroke(); }
      zonePath(g, z); g.strokeStyle = 'rgba(90,40,5,.45)'; g.lineWidth = 7; g.stroke();
      g.restore();
      zonePath(g, z); g.strokeStyle = 'rgba(255,220,160,.6)'; g.lineWidth = 1.4; g.stroke();
    } else if (z.k === 'sand') {
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
    } else if (z.k === 'water' && th.skin === 'space') {             // a black hole: a dark well ringed by its glowing disc
      const cx = (z.x0 + z.x1) / 2, cy = (z.y0 + z.y1) / 2, rad = Math.max(z.x1 - z.x0, z.y1 - z.y0) / 2;
      g.save(); zonePath(g, z); g.clip();
      const bg2 = g.createRadialGradient(cx, cy, 0, cx, cy, rad); bg2.addColorStop(0, '#000'); bg2.addColorStop(.55, '#05020c'); bg2.addColorStop(.8, '#2a1060'); bg2.addColorStop(1, '#b48cff');
      g.fillStyle = bg2; g.fillRect(z.x0 - 2, z.y0 - 2, z.x1 - z.x0 + 4, z.y1 - z.y0 + 4);
      g.lineWidth = 1.3;
      for (let k = 0; k < 7; k++) { const a0 = r() * TAU, rr4 = rad * (.45 + k * .07); g.strokeStyle = `rgba(${k % 2 ? '200,170,255' : '255,190,120'},${.25 + r() * .3})`; g.beginPath(); g.arc(cx, cy, rr4, a0, a0 + 1.4 + r() * 1.6); g.stroke(); }
      g.restore();
      g.save(); g.shadowColor = '#b48cff'; g.shadowBlur = 10 * ls; zonePath(g, z); g.strokeStyle = 'rgba(210,180,255,.8)'; g.lineWidth = 1.6; g.stroke(); g.restore();
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
      zonePath(g, z); g.strokeStyle = th.skin === 'candy' ? 'rgba(255,225,190,.6)' : 'rgba(230,255,255,.6)'; g.lineWidth = 1.8; g.stroke();       // foam line (a cocoa sheen on chocolate)
    } else if (z.k === 'lava') {
      g.save(); g.shadowColor = 'rgba(255,90,20,.95)'; g.shadowBlur = 18 * ls;
      zonePath(g, z); const lg = g.createRadialGradient((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, 4, (z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2, Math.max(z.x1 - z.x0, z.y1 - z.y0) * .6);
      lg.addColorStop(0, '#fff2a8'); lg.addColorStop(.35, '#ffa631'); lg.addColorStop(1, '#b42a0a'); g.fillStyle = lg; g.fill(); g.restore();
      g.save(); zonePath(g, z); g.clip();
      for (let i = 0; i < 14; i++) { const x = z.x0 + r() * (z.x1 - z.x0), y = z.y0 + r() * (z.y1 - z.y0), s = 6 + r() * 12; g.fillStyle = 'rgba(50,16,8,.55)'; g.beginPath(); for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU, d = s * (.7 + r() * .4); k ? g.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d * .7) : g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d * .7); } g.closePath(); g.fill(); }
      zonePath(g, z); g.strokeStyle = 'rgba(40,10,5,.6)'; g.lineWidth = 8; g.stroke();
      g.restore();
      zonePath(g, z); g.strokeStyle = 'rgba(255,220,120,.7)'; g.lineWidth = 1.4; g.stroke();
    } else if (z.k === 'belt') {                                     // a conveyor belt: rubber, rollers, chevrons in the push direction
      const [x, y, w, h] = z.r, [fx, fy] = z.f, m = Math.sqrt(fx * fx + fy * fy) || 1, ux = fx / m, uy = fy / m;
      g.save(); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 6 * ls; g.shadowOffsetY = 3 * ls; g.fillStyle = '#161c2c'; rr(g, x, y, w, h, 6); g.fill(); g.restore();
      g.save(); rr(g, x, y, w, h, 6); g.clip();
      g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
      if (Math.abs(ux) > Math.abs(uy)) for (let xx = x + 6; xx < x + w; xx += 9) { g.beginPath(); g.moveTo(xx, y); g.lineTo(xx, y + h); g.stroke(); }
      else for (let yy = y + 6; yy < y + h; yy += 9) { g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
      g.strokeStyle = hexA(th.wall.stripe || '#ffb84a', .85); g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
      const cx = x + w / 2, cy = y + h / 2, span = Math.abs(ux) > Math.abs(uy) ? w : h, px = -uy * 9, py = ux * 9;
      for (let d = -span / 2 + 18; d < span / 2 - 8; d += 30) { const ax = cx + ux * d, ay = cy + uy * d; g.beginPath(); g.moveTo(ax - ux * 6 + px, ay - uy * 6 + py); g.lineTo(ax + ux * 4, ay + uy * 4); g.lineTo(ax - ux * 6 - px, ay - uy * 6 - py); g.stroke(); }
      g.restore();
      g.strokeStyle = 'rgba(160,190,240,.35)'; g.lineWidth = 1.2; rr(g, x, y, w, h, 6); g.stroke();
      g.fillStyle = '#5a6a8a'; const rl = Math.abs(ux) > Math.abs(uy);                               // rollers at both ends
      if (rl) { g.fillRect(x - 2, y + 2, 4, h - 4); g.fillRect(x + w - 2, y + 2, 4, h - 4); } else { g.fillRect(x + 2, y - 2, w - 4, 4); g.fillRect(x + 2, y + h - 2, w - 4, 4); }
    } else if (z.k === 'lowg') {                                     // low gravity: a faint field of floating rings
      g.save(); zonePath(g, z); g.clip();
      g.fillStyle = 'rgba(120,230,255,.1)'; g.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0);
      g.strokeStyle = 'rgba(160,240,255,.26)'; g.lineWidth = 1;
      for (let y = z.y0 + 30; y < z.y1; y += 60) for (let x = z.x0 + 30 + ((y / 60) % 2) * 30; x < z.x1; x += 60) { g.beginPath(); g.arc(x, y, 7, 0, TAU); g.stroke(); g.beginPath(); g.arc(x, y, 2, 0, TAU); g.stroke(); }
      g.restore();
      g.save(); g.setLineDash([6, 6]); zonePath(g, z); g.strokeStyle = 'rgba(150,235,255,.45)'; g.lineWidth = 1.4; g.stroke(); g.restore();
      g.fillStyle = 'rgba(190,245,255,.7)'; g.font = '700 8px Orbitron, system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'bottom';
      g.fillText('LOW GRAVITY', z.x0 + 14, z.y1 - 12);                  // lower-left: the HUD pills sit over the top corners
    } else if (z.k === 'ramp' && th.skin === 'candy') {              // the jelly jump: a wobbly translucent block
      const [x, y, w, h] = z.r;
      g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 8 * ls; g.shadowOffsetY = 6 * ls;
      const jg = g.createLinearGradient(0, y + h, 0, y); jg.addColorStop(0, '#c2306e'); jg.addColorStop(1, '#ff9fcb');
      g.fillStyle = jg; rr(g, x, y, w, h, 8); g.fill(); g.restore();
      g.fillStyle = 'rgba(255,255,255,.35)'; rr(g, x + 5, y + 4, w - 10, 5, 2.5); g.fill();
      g.fillStyle = 'rgba(255,255,255,.18)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x + 10 + (k * 37 % (w - 20)), y + 14 + (k * 23 % (h - 20)), 2 + k % 2, 0, TAU); g.fill(); }
      g.fillStyle = '#ffe1f0'; g.fillRect(x + 4, y - 2, w - 8, 3);
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.2; g.lineCap = 'round';
      const mx = x + w / 2; g.beginPath(); g.moveTo(mx - 9, y + h * .62); g.lineTo(mx, y + h * .32); g.lineTo(mx + 9, y + h * .62); g.stroke();
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
    const par = h('tr', { class: 'par' }, h('th', {}, 'Par')), pars = parsOf(st);
    pars.forEach((p, k) => par.append(h('td', { class: k === hi && !st.over ? 'cur' : '' }, String(p))));
    par.append(h('td', {}, String(pars.reduce((a, b) => a + b, 0))));
    tbl.append(hd, par);
    [0, 1].forEach(p => {
      const row = h('tr', { class: 'p' + p }, h('th', {}, ctx.players[p].name));
      let tot = 0;
      for (let k = 0; k < HOLES_N; k++) {
        const s = cards[p][k], cur = k === hi && !st.over ? ' cur' : '';
        if (s) { tot += s; row.append(h('td', { class: cls(s, pars[k]) + cur }, String(s))); }
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

  /* ---------------- the course picker (phase 'setup') ----------------
     The host picks; every pick is one committed write, so the partner's phone repaints the same cards live.
     Each card shows a real hole of that course, drawn from its own geometry in its own palette. */
  const THUMB = {};
  function thumb(id) {
    if (THUMB[id]) return THUMB[id];
    const f = v => Math.round(v * 10) / 10;
    if (!COURSES[id]) {                                              // Surprise me
      return (THUMB[id] = `<svg viewBox="0 0 52 52" aria-hidden="true"><rect width="52" height="52" rx="10" fill="#0b1020"/>`
        + `<circle cx="17" cy="19" r="7.5" fill="#79f5b6"/><circle cx="35" cy="19" r="7.5" fill="#ff7ab8"/><circle cx="26" cy="34" r="7.5" fill="#56d6ff"/></svg>`);   // one of the three
    }
    const C = COURSES[id], H = hole(C.base + C.thumb), th = THEMES[H.theme];
    // the hole lies on its side: tee on the left, cup on the right (x' = bb.y1 - y, y' = x)
    const bb = H.bb, w = bb.y1 - bb.y0, hh = bb.x1 - bb.x0, VW = 104, VH = 68, k = Math.min((VW - 10) / w, (VH - 10) / hh);
    const ox = (VW - w * k) / 2, oy = (VH - hh * k) / 2;
    const XY = (x, y) => [f(ox + (bb.y1 - y) * k), f(oy + (x - bb.x0) * k)];
    const poly = (p, c) => 'M' + p.map(q => XY(q[0], q[1]).join(' ')).join('L') + (c ? 'Z' : '');
    let s = `<svg viewBox="0 0 ${VW} ${VH}" aria-hidden="true"><rect width="${VW}" height="${VH}" fill="${th.bg}"/>`;
    if (th.skin === 'space') { const r = rng(7); for (let i = 0; i < 26; i++) s += `<circle cx="${f(r() * VW)}" cy="${f(r() * VH)}" r="${f(.3 + r() * .6)}" fill="#fff" opacity="${f(.3 + r() * .6)}"/>`; }
    s += `<path d="${poly(H.bound, 1)}" fill="${th.felt[0]}"/>`;
    const zc = { sand: th.skin === 'candy' ? '#e0a24e' : '#e9cf94', ice: '#bfeefc', water: (th.water || ['', '#1592b0'])[1], lava: '#ff8a2a', ramp: th.skin === 'candy' ? '#ff9fcb' : '#c89456',
      belt: '#1c2438', lowg: 'rgba(120,230,255,.28)', slope: 'rgba(0,0,0,.14)' };
    H.allZones.forEach(z => {
      const c = zc[z.k] || 'none';
      if (z.r) { const [x, y, ww, h2] = z.r; s += `<path d="${poly([[x, y], [x + ww, y], [x + ww, y + h2], [x, y + h2]], 1)}" fill="${c}"/>`; }
      else if (z.e) { const q = XY(z.e[0], z.e[1]); s += `<ellipse cx="${q[0]}" cy="${q[1]}" rx="${f(z.e[3] * k)}" ry="${f(z.e[2] * k)}" fill="${c}"/>`; }
      else s += `<path d="${poly(z.p, 1)}" fill="${c}"/>`;
    });
    const dash = th.skin === 'candy' ? ' stroke-dasharray="3 3"' : th.skin === 'space' ? ' stroke-dasharray="1 4"' : '';
    H.walls.forEach(wl => {
      const sw = f(Math.max(1.6, 2 * (wl.hw || 6) * k)), d = poly(wl.p, wl.c);
      s += `<path d="${d}" fill="${wl.solid ? th.wall.top : 'none'}" stroke="${th.wall.top}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (dash) s += `<path d="${d}" fill="none" stroke="${th.wall.stripe}" stroke-width="${sw}"${dash} stroke-linejoin="round"/>`;
    });
    const bc = th.skin === 'candy' ? CANDY_COLS : th.skin === 'space' ? ['#8b8397'] : [th.wall.glow];
    H.bumps.forEach((b, i) => { const q = XY(b[0], b[1]); s += `<circle cx="${q[0]}" cy="${q[1]}" r="${f(Math.max(1.8, b[2] * k))}" fill="${bc[i % bc.length]}"/>`; });
    H.ports.forEach(pt => [pt.a, pt.b].forEach((q0, j) => { const q = XY(q0[0], q0[1]); s += `<circle cx="${q[0]}" cy="${q[1]}" r="${f(Math.max(2.2, PORT_R * k))}" fill="#05060c" stroke="${j ? '#7dffd2' : '#ffb84a'}" stroke-width="1"/>`; }));
    const t = XY(H.tee[0], H.tee[1]), c = XY(H.cup[0], H.cup[1]);
    s += `<circle cx="${t[0]}" cy="${t[1]}" r="2.2" fill="#fff"/><circle cx="${c[0]}" cy="${c[1]}" r="2.6" fill="#05060c" stroke="#fff" stroke-width=".8"/>`;
    s += `<path d="M${c[0]} ${c[1]}v-9" stroke="#fff" stroke-width=".9"/><path d="M${c[0]} ${f(c[1] - 9)}l6 1.8l-6 1.8z" fill="${th.flag}"/></svg>`;
    return (THUMB[id] = s);
  }
  const escH = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function setupPick(ctx, id) {
    const st = norm(clone(ctx.state));
    if (st.phase !== 'setup' || ctx.status !== 'active' || ctx.me !== st.host || S.starting === st.seed || st.course === id) return;
    try { ctx.sound.tap(); } catch (e) {}
    ctx.commit(pickCourse(st, id));
  }
  function setupStart(ctx) {
    const st = norm(clone(ctx.state));
    if (st.phase !== 'setup' || ctx.status !== 'active' || ctx.me !== st.host || S.starting === st.seed) return;
    S.starting = st.seed;                                            // one tap = one start, however fast the thumb
    try { ctx.sound.place(); } catch (e) {}
    ctx.commit(beginMatch(st));
  }
  function renderSetup(ctx, st, oldTxt) {
    const me = ctx.me, hs = st.host, isHost = me === hs, hn = escH(ctx.players[hs].name), pn = escH(ctx.players[1 - hs].name);
    const live = ctx.status === 'active', edit = isHost && live && S.starting !== st.seed, h = ctx.h;
    if (!S.live) {
      S.live = document.createElement('div'); S.live.className = 'mg-sr'; S.live.setAttribute('role', 'status'); S.live.setAttribute('aria-live', 'polite'); document.body.append(S.live);
      document.addEventListener('focusin', e => { const t = e.target; S.focusId = (t && t.closest && t.closest('.mg-setup') && t.getAttribute('data-id')) || ''; });
    }
    const card = (id, cls, inner, label) => h('button', Object.assign({ class: 'mg-co' + cls + (edit ? '' : ' ro'), type: 'button', 'data-id': id,
      'aria-pressed': String(st.course === id), 'aria-label': label, style: '--ca:' + (COURSES[id] ? COURSES[id].ca : '#ffd66b'),
      onclick: () => setupPick(ctx, id) }, edit ? {} : { tabindex: '-1', 'aria-disabled': 'true' }), inner);
    const cards = COURSE_IDS.map(id => {
      const C = COURSES[id];
      return card(id, '', [h('span', { html: thumb(id) }), h('span', {}, [h('span', { class: 'nm' }, C.name), h('span', { class: 'bl' }, C.blurb), h('span', { class: 'pr' }, `9 holes, par ${C.par}`)])],
        `${C.name}. ${C.blurb} 9 holes, par ${C.par}.`);
    });
    cards.push(card('surprise', ' sur', [h('span', { html: thumb('surprise') }), h('span', {}, [h('span', { class: 'nm' }, 'Surprise me'), h('span', { class: 'bl' }, 'A random course, revealed on the first tee.')])],
      'Surprise me. A random course, revealed on the first tee.'));
    const busy = S.starting === st.seed;
    const foot = !live ? h('div', { class: 'mg-foot' }, h('div', { class: 'mg-wait' }, 'This match has ended'))
      : isHost ? h('div', { class: 'mg-foot' }, h('button', { class: 'mg-go', type: 'button', disabled: !live || busy ? '' : null, onclick: () => setupStart(ctx) }, busy ? 'Starting…' : 'Tee off'))
      : h('div', { class: 'mg-foot' }, h('div', { class: 'mg-wait' }, [h('span', { class: 'mg-dots', 'aria-hidden': 'true' }, [h('i'), h('i'), h('i')]), `Waiting for ${ctx.players[hs].name} to tee off`]));
    ctx.root.append(ctx.turnBar({ scores: [0, 0] }), h('div', { class: 'mg-setup' },
      h('div', { class: 'mg-who', html: oldTxt || (isHost ? `Pick a course. <b>${pn}</b> sees your pick live.` : `<b>${hn}</b> is picking the course. Their pick lights up here.`) }),
      h('div', { class: 'mg-courses', role: 'group', 'aria-label': 'Course' }, cards), foot));
    const pick = st.course === 'surprise' ? 'Surprise me' : (COURSES[st.course] || COURSES.garden).name;
    if (!isHost && S.lastSay !== pick) { S.lastSay = pick; S.live.textContent = `${ctx.players[hs].name} picked ${pick}`; }
    if (S.focusId) { const el = ctx.root.querySelector(`[data-id="${S.focusId}"]`); if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} } }   // every sync rebuilds this DOM
  }

  /* ---------------- registration ---------------- */
  const DEF = {
    id: 'mini-golf', name: 'Mini Golf', emoji: '⛳', category: 'Arcade', accent: '#79f5b6',
    tagline: 'Three courses of 9 holes: neon garden, candy land, space station.',
    // the last putt may still be rolling when the match finishes — hold the result card for it
    resultDelay: () => {
      const A = S.anim;
      if (A) return Math.min(4500, Math.round(Math.max(0, A.len - A.clock) / 240 * 1000 * 1.35 + Math.max(0, A.tailMax - A.tail) * 16.7 + 700));
      if (S.summary) return Math.min(4500, Math.max(0, S.summary.max - S.summary.t) + 200);
      return 0;
    },
    // a timeout before hole 1 (the course picker) must never forfeit: nobody has putted yet
    skipOnly: st => !!st && st.phase === 'setup',
    // the next player's controls unlock only after the partner-side replay of the last putt (see CONTEXT)
    clockGrace: CLOCK_GRACE,
    // timer ran out: the stroke counts, the ball stays put, and the turn passes;
    // in the picker the match simply starts with what is picked
    skipTurn: (st, opp) => skipState(st, opp),
    init: host => ({
      v: 2, seed: ((Math.random() * 2147483646) | 0) + 1, host: host === 1 ? 1 : 0, phase: 'setup', course: 'garden', rule: 'alt',
      hole: 0, turn: host, honor: host,
      balls: [teeBall(0), teeBall(0)], cards: [Array(HOLES_N).fill(0), Array(HOLES_N).fill(0)],
      n: 0, clk: 0, ph: 0, over: 0, last: null,
    }),
    test: { HOLES, COURSES, COURSE_IDS, THEMES, hole, simulate, applyStroke, skipState, nextTurn, totals, norm, away, grid, endHole, winnerOf, label,
      pickCourse, beginMatch, surpriseCourse, G, parsOf, altTurn, CLOCK_GRACE, restOk, oldClientSeat,
      pip, inZone, segDist, millBlocked, speedOf, R, CUP_R, CAP_V, DT, MAX_STEPS, MAX_STROKES, PICKUP, PORT_R, S,
      putt: (a, p) => putt(a, p), canAct: () => canAct(),
      replay: () => ({ id: S.anim ? S.anim.id : 0, clock: S.anim ? S.anim.clock : 0, len: S.anim ? S.anim.len : 0, doneId: S.doneId }) },

    render(ctx) {
      const oldSeat = oldClientSeat(ctx.state);                       // before norm fills `last.g` in
      const st = norm(ctx.state), me = ctx.me, foe = 1 - me;
      S.ctx = ctx;
      ensureCanvas();
      if (st.seed !== S.seed) resetScene(st);
      S.oldId = oldSeat >= 0 && st.last ? st.last.id : 0;
      const oldTxt = oldSeat >= 0 ? `<b>${escH(ctx.players[oldSeat].name)}</b> is on an older version — ask them to close and reopen the app` : '';
      if (oldTxt && S.oldWarn !== S.oldId) { S.oldWarn = S.oldId; try { ctx.msg(oldTxt, '#ffd66b'); ctx.sound.bad(); } catch (e) {} }
      if (st.phase === 'setup') { renderSetup(ctx, st, oldTxt); return; }   // the course picker: no canvas, no loop
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
      const H = HOLES[G(st)], mine = st.balls[me], theirs = st.balls[foe], C = COURSES[st.course] || COURSES.garden;
      let hint;
      if (ctx.status === 'finished' || st.over) {
        const t = totals(st), w = winnerOf(st);
        hint = w === 'draw' ? `All square on <b>${t[0]}</b> — a draw!` : `${nm(w)} wins <b>${t[w]}</b> to ${t[1 - w]} · par ${C.par}`;
      } else if (A) hint = A.L.seat === me ? 'Rolling…' : `${nm(A.L.seat)} putted — watch it roll…`;
      else if (S.intro) hint = `${C.name} · hole <b>${st.hole + 1}</b> · ${H.name} · Par <b>${H.par}</b>`;
      else if (S.summary) hint = `Hole <b>${HOLES[S.summary.hi].no}</b> done — next up: <b>${H.name}</b>`;
      else if (st.rule === 'alt') {                                    // plain alternation: say whose turn it is, nothing more
        if (ctx.isMyTurn && st.turn === me && !mine.done) hint = `<b>Your turn.</b> Drag back anywhere, release to putt`;
        else if (mine.done) hint = `You're in the cup. ${nm(foe)} keeps putting`;
        else hint = `${nm(st.turn)}'s turn`;
      } else if (ctx.isMyTurn && st.turn === me && !mine.done) {       // an old save: the "away" rule, worded as before
        const why = mine.s === 0 ? (theirs.s === 0 ? 'you have the honour' : 'your tee shot') : (!theirs.done ? 'you\'re away' : 'finish the hole');
        hint = `Your putt (${why}) · <b>drag back</b> anywhere, release to hit`;
      } else if (mine.done) hint = `You're done here · ${nm(foe)} to finish hole ${st.hole + 1}`;
      else hint = `${nm(st.turn)} is lining up${st.balls[st.turn] && st.balls[st.turn].s ? '' : ' the tee shot'}…`;
      if (oldTxt && !(ctx.status === 'finished' || st.over)) hint = oldTxt;   // the one thing that matters until they update
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
