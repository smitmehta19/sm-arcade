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
  /* squad pick: the formation row (what you are building) over the type list (what you can pick from) */
  .ko-slots{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:7px; }
  .ko-slot{ min-height:76px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:3px; padding:6px 2px 6px;
    font-size:10.5px; font-weight:700; line-height:1.15; touch-action:manipulation; transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), box-shadow var(--dur-2); }
  .ko-slot svg{ width:32px; height:40px; display:block; }
  .ko-slot[aria-pressed=true]{ border-color:var(--kc); box-shadow:0 0 0 1px var(--kc), 0 0 16px -6px var(--kc); }
  .ko-slot:disabled{ opacity:1; }
  .ko-slot:not(:disabled):active,.ko-type:not(:disabled):active{ transform:scale(.97); }
  .ko-slot.pop svg{ animation:koPop .2s cubic-bezier(.23,1,.32,1); }
  @keyframes koFade{ from{ opacity:.5; } to{ opacity:1; } }
  @keyframes koPop{ from{ transform:scale(.92); opacity:.5; } to{ transform:scale(1); opacity:1; } }   /* the slot is rebuilt on every pick, so a keyframe (not a transition) is the only way in */
  .ko-types{ display:flex; flex-direction:column; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); overflow:hidden; }
  .ko-type{ display:grid; grid-template-columns:40px minmax(0,1fr) 92px; align-items:center; gap:10px; min-height:64px; padding:7px 10px; background:transparent; border:0; border-top:1px solid var(--glass-brd); color:var(--ink); text-align:left; touch-action:manipulation;
    transition:transform var(--dur-1) var(--spring), background var(--dur-2); }
  .ko-type:first-child{ border-top:0; }
  .ko-type[aria-pressed=true]{ background:rgba(127,216,255,.1); box-shadow:inset 3px 0 0 var(--kc); }
  .ko-type:disabled{ opacity:1; }
  .ko-type .ico svg{ width:34px; height:42px; display:block; }
  .ko-type .tx b{ display:block; font-size:13px; }
  .ko-type .tx small{ display:block; font-size:10.5px; line-height:1.3; color:var(--ink-dim); margin-top:1px; }
  .ko-type .st{ display:flex; flex-direction:column; gap:3px; }
  .ko-st{ display:flex; align-items:center; justify-content:space-between; font-size:9.5px; font-weight:700; color:var(--ink-dim); gap:6px; }
  .ko-st span{ display:inline-flex; gap:2px; }
  .ko-st i{ width:7px; height:7px; border-radius:2px; background:rgba(127,140,180,.3); }
  .ko-st i.on{ background:var(--kc); }
  .ko-fs{ display:flex; align-items:center; justify-content:center; gap:8px; font-size:12px; color:var(--ink-dim); min-height:20px; }
  .ko-fs b{ color:var(--kf); }
  .ko-fs.rdy{ color:var(--ink); }
  .ko-ghost{ min-height:44px; padding:10px 8px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-weight:700; font-size:12.5px; touch-action:manipulation; transition:transform var(--dur-1) var(--spring); }
  .ko-ghost:not(:disabled):active{ transform:scale(.97); }
  .ko-ghost:disabled{ opacity:.4; }
  .ko-slot:focus-visible,.ko-type:focus-visible,.ko-ghost:focus-visible{ outline:2px solid var(--ka,#7fd8ff); outline-offset:2px; }
  .ko-rev{ display:grid; grid-template-columns:1fr 1fr; gap:7px; }
  .ko-rev>div{ display:flex; align-items:center; gap:6px; min-height:34px; padding:3px 8px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd); font-size:11px; font-weight:700; color:var(--ink-dim); }
  .ko-rev b{ color:var(--kc); font-size:11px; }
  .ko-rev svg{ width:16px; height:20px; display:block; }
  .ko-rev .ic{ display:inline-flex; gap:1px; margin-left:auto; }
  .ko-pen .tn{ position:absolute; left:4px; top:3px; font-size:8.5px; font-weight:800; line-height:1; letter-spacing:.3px; color:var(--ink-dim); }
  .ko-pen .ef{ position:absolute; right:3px; bottom:8px; font-size:11px; line-height:1; }
  .ko-pen.anch svg{ opacity:.55; }
  @media (prefers-reduced-motion: reduce){ .ko-slot.pop svg{ animation:koFade .15s ease; } .ko-slot,.ko-type,.ko-ghost{ transition:none; } }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------------- rules / physics constants ---------------- */
  const NP = 4, PR = 22, R_START = 300, SHRINK = 0.91, MAX_ROUNDS = 8;
  const VMAX = 700, FRIC = 440, REST = 0.9, DT = 1 / 240, SUB = 4, MAX_STEPS = 240 * 8;
  const MAXA = 160, MINA = 18;                           // aim arrow length on the ice (world units)
  const START = [[-120, 150], [-42, 186], [42, 186], [120, 150]];
  const FALLBACK_MS = 2500, RESEND_MS = 1500;
  /* Knockout 2.0: modes, penguin types, power-ups */
  const HK_ROUNDS = 10, GOAL_TO = 3;                     // Fish Hockey: first to 3 goals, 10-round cap
  const ZR = 75;                                         // King of the Hill: radius of the glowing centre zone
  const HW = 200, HL = 260, GW = 78;                     // the rink: half-width, half-length (goal lines), goal-mouth half-width
  const PK_M = .6, PK_R = 17, PK_F = 340, PK_V = 820, PK_E = .97;   // the fish: light, slippery, lively
  const SPR_E = 1.3, IR = 15;                            // a Spring penguin's restitution (super-elastic); an item's pickup radius
  const MODE_IDS = ['sumo', 'koth', 'hockey'];
  const KOTH_ARENAS = ['floe', 'bumper', 'ice', 'current'];   // arenas that still make sense when the ice does not shrink
  // Penguin types: mass (x Classic), body radius, max launch (x Classic). Only these three things differ.
  // Balanced by simulated type-vs-type matches under six different AI players (every pairing 37-62%, no type ahead of
  // all three others on average). Mass is by far the strongest lever in Sumo (a 10% heavier squad wins ~70% of
  // matches), so weight differs only a little; size and reach carry the character.
  const TYPES = [
    { id: 'classic', name: 'Classic', m: 1, r: PR, cap: 1, blurb: 'Balanced. No surprises.', wt: 2, rc: 2, sz: 3 },
    { id: 'emperor', name: 'Emperor', m: 1.08, r: 28, cap: .74, blurb: 'Big and a bit heavier. Hard to shift, short push.', wt: 3, rc: 1, sz: 5 },
    { id: 'rock', name: 'Rockhopper', m: .98, r: 20, cap: 1.36, blurb: 'Slim. Launches much further, so it can overshoot.', wt: 2, rc: 4, sz: 2 },
    { id: 'chick', name: 'Chick', m: 1, r: 13, cap: 1.12, blurb: 'Tiny, so hard to hit. Launches a bit further.', wt: 2, rc: 3, sz: 1 },
  ];
  // Power-ups (1 heavy, 2 shield, 3 spring, 4 anchor): grabbed in round n, active in round n+1
  const IK = [null,
    { id: 'heavy', name: 'Heavy', ico: '🏋️', col: '#ffb347', txt: 'double weight' },
    { id: 'shield', name: 'Shield', ico: '🛡️', col: '#6fe3ff', txt: 'bounces back off the water once' },
    { id: 'spring', name: 'Spring', ico: '🌀', col: '#7dff9a', txt: 'extra bouncy hits' },
    { id: 'anchor', name: 'Anchor', ico: '⚓', col: '#ff8c5a', txt: 'can’t move or launch' }];
  /* ---------------- view constants (logical canvas px) ---------------- */
  const VW = 400, VH = 450, CX = 200, CY = 268, SC = 0.6, TILT = 0.56, TH = 15, HOR = 118;
  const GOAL_HOLD = 1100, RS_MS = 620, SCORE_MS = 1000, REVEAL = 850, CRACK_MS = 420, SHRINK_MS = 1150, SWAP_MS = 950, PRE_MS = 520, ENTRY_MS = 700, FALL_SLIDE = 240, FALL_DROP = 460, FALL_MS = 760;

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
  const KOTH_BLURB = { floe: 'The original round floe, full size all match.', bumper: 'Rubber bumpers all round the rim bounce you back. None pop in this mode.', ice: 'A floe of tiles with the corners missing. No tiles fall in this mode.', current: 'A sea current drags everything and turns each round. The floe keeps its size.' };
  const RINK = { id: 'rink', name: 'Fish Rink', icon: '🐟', blurb: 'A rink with a goal at each end. The fish bounces off the edge; penguins do not.', hint: 'knock the fish through the far goal' };
  const arenaInfo = id => id === 'rink' ? RINK : ARENAS.find(a => a.id === id) || ARENAS[0];
  const ARENA_SETS = { sumo: ARENA_IDS, koth: KOTH_ARENAS, hockey: ['rink'] };     // which arenas each mode offers
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
    current: (lv, mid, R, dl) => {                         // dl: King of the Hill keeps the floe size but still turns the current every round
      const Rr = RCT[lv], R2 = Rr * Rr, dir = curSeq(mid)[(dl != null ? dl : lv) % 8], u = uv(9 * dir);
      return { R: Rr, ext: Rr, dir, cur: [u[0] * CUR_V, u[1] * CUR_V], in: (x, y) => x * x + y * y <= R2 };
    },
    rink: () => ({ R: HL, ext: HL, ex: HW, ey: HL, hw: HW, hl: HL, gw: GW, in: (x, y) => x >= -HW && x <= HW && y >= -HL && y <= HL }),
  };
  const GCACHE = new Map();
  function geoFor(id, lv, mid, R, dl) {
    if (!BUILD[id]) id = 'floe';
    lv = Math.max(0, Math.min(9, lv | 0));
    const key = id + ':' + lv + ':' + (id === 'floe' ? R : mid) + (dl != null ? ':' + dl : '');
    let g = GCACHE.get(key);
    if (!g) { g = BUILD[id](lv, mid, R, dl); g.id = id; g.lv = lv; g.mid = mid; if (GCACHE.size > 80) GCACHE.clear(); GCACHE.set(key, g); }
    return g;
  }
  // The ice of round `round`. Sumo: it tightens every round (a classic floe follows R: old saves, hand-set test radii).
  // King of the Hill / Fish Hockey: the ice never shrinks (level 0 every round; only the current still turns).
  function geoAt(md, id, round, mid, R) {
    if (md === 'hockey') return geoFor('rink', 0, mid);
    if (md === 'koth') return id === 'current' ? geoFor('current', 0, mid, 0, round - 1) : geoFor(id, 0, mid, R_START);
    return geoFor(id, round - 1, mid, R);
  }
  const geoOf = (id, st, dr) => geoAt(st.mode, id, st.round + dr, st.mid, dr ? nextR(st.R) : st.R);
  const maxRounds = st => st.mode === 'hockey' ? HK_ROUNDS : MAX_ROUNDS;
  function arenaAfter(st) {                                // roulette (Sumo only): a different arena each round (seeded by match + round)
    if (!st.roulette || st.mode !== 'sumo') return st.arena;
    const c = ARENA_IDS.filter(a => a !== st.arena);
    return pick1(seeded(hashStr(st.mid + ':' + (st.round + 1) + ':arena')), c);
  }
  const surpriseArena = (mid, md) => pick1(seeded(hashStr(mid + ':surprise')), md === 'koth' ? KOTH_ARENAS : ARENA_IDS);
  // seat 0's four start slots on this ice (seat 1 is the same turned 180°); level 0 is the original layout
  // rmax: the biggest body in play (a squad of Emperors needs its start slots further apart than Classics do)
  function slotsFor(g, rmax) {
    const lv = g.lv, id = g.id, sc = (pts, s) => pts.map(p => [r2(p[0] * s), r2(p[1] * s)]);
    if (id === 'floe' || id === 'bumper' || id === 'current') return sc(START, Math.max(g.R / R_START, .62, rmax > PR ? (2 * rmax + 2) / 84 : 0));   // never tighter than 62% (keeps Classics 50 apart; the closest START slots are 84 apart)
    if (id === 'donut') return lv === 0 ? START : sc(START, (g.HR + RO) / 2 / 191.4);
    if (id === 'twin') {
      const s = g.ir / 130, o = [[-35, 55], [45, 70], [-45, 70], [35, 55]], c = [-IC, -IC, IC, IC];
      return o.map((p, k) => [r2(c[k] + p[0] * s), r2(p[1] * s)]);
    }
    if (id === 'rink') return [[-120, 165], [-42, 200], [42, 200], [120, 165]];
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
  const Z8 = () => [0, 0, 0, 0, 0, 0, 0, 0];
  const cleanSq = v => Array.isArray(v) && v.length === NP ? v.map(t => { t |= 0; return t >= 0 && t < TYPES.length ? t : 0; }) : [0, 0, 0, 0];
  /* Mixed app versions. A phone still running the v78 app (open since before an update) normalises a match its own way
     (mode -> sumo, phase squad -> play, arena rink -> floe) and writes the WHOLE state back when it commits. So a new-format
     match (v >= 3) keeps: its aims under b0/b1 (the old app only reads a0/a1, so it never sees both sides ready and never
     resolves); `cfg` = {mode, arena, phase}, which the old app leaves alone, so any overwrite is undone on read; and a
     stored phase the old app understands (squad pick is stored as 'setup': its timer then only skips, never forfeits).
     Old saves (no v, or v < 3) keep the old a0/a1 keys and play exactly as before. */
  const V3 = st => (+st.v || 0) >= 3;
  const AK = st => V3(st) ? 'b' : 'a';                       // the aims key prefix
  const PHASES = ['setup', 'squad', 'play'], mirrorPh = ph => ph === 'play' ? 'play' : 'setup';
  const cfgSync = st => { if (V3(st)) st.cfg = { mode: st.mode, arena: st.arena, phase: st.phase }; return st; };
  // what actually gets written: cfg refreshed, the phase stored in a form the older app can't misread
  function seal(st) { delete st.hx; if (V3(st)) { cfgSync(st); st.phase = mirrorPh(st.phase); } return st; }
  function norm(st) {
    st = st && typeof st === 'object' ? st : {};
    if (V3(st)) st.hx = 0; else delete st.hx;                // hx: an older app overwrote mode / arena / phase (new-format matches only)
    const c = V3(st) && st.cfg && typeof st.cfg === 'object' && PHASES.indexOf(st.cfg.phase) >= 0 ? st.cfg : null;
    if (c) {                                                 // an older app wrote over it: take mode / arena / phase back from cfg
      if (st.mode !== c.mode || st.arena !== c.arena || (st.phase !== c.phase && st.phase !== mirrorPh(c.phase))) st.hx = 1;
      if (st.hx && c.phase !== 'play') { st.pens = null; st.round = 1; st.R = R_START; }   // its "start" rewrote the line-up
      st.mode = c.mode; st.arena = c.arena; st.phase = c.phase;
    }
    const leg = !V3(st);                                     // a 'knockout' match (old saves, old apps, tournaments): classic Sumo, exactly as v78
    st.phase = st.phase === 'setup' || (st.phase === 'squad' && !leg) ? st.phase : 'play';   // old saves have no phase: they are mid-match Sumo on the Classic Floe
    st.mode = !leg && MODE_IDS.indexOf(st.mode) >= 0 ? st.mode : 'sumo';
    st.pw = st.pw && !leg ? 1 : 0;                           // power-ups: new matches only (old saves = none)
    st.roulette = st.roulette && st.mode === 'sumo' ? 1 : 0;
    const sup = ARENA_SETS[st.mode];
    st.arena = sup.indexOf(st.arena) >= 0 || (st.phase === 'setup' && st.arena === 'surprise' && st.mode !== 'hockey') ? st.arena : sup[0];
    const def = startPens(st.arena === 'surprise' ? 'floe' : st.arena);
    const pens = Array.isArray(st.pens) && st.pens.length === 2 * NP ? st.pens : def;
    st.pens = pens.map((p, i) => Array.isArray(p) ? [+p[0] || 0, +p[1] || 0, p[2] ? 1 : 0] : def[i]);
    st.aims = st.aims && typeof st.aims === 'object' && !Array.isArray(st.aims) ? st.aims : {};
    st.sqs = st.sqs && typeof st.sqs === 'object' && !Array.isArray(st.sqs) ? st.sqs : {};       // submitted squads (hidden until both are in)
    st.sq = Array.isArray(st.sq) && st.sq.length === 2 ? [cleanSq(st.sq[0]), cleanSq(st.sq[1])] : [[0, 0, 0, 0], [0, 0, 0, 0]];   // old saves: 4 Classic each
    st.ef = Array.isArray(st.ef) && st.ef.length === 2 * NP ? st.ef.map(v => { v |= 0; return v >= 0 && v <= 4 ? v : 0; }) : Z8();   // power-up active on each penguin this round
    st.pts = Array.isArray(st.pts) && st.pts.length === 2 ? [Math.max(0, +st.pts[0] | 0), Math.max(0, +st.pts[1] | 0)] : [0, 0];
    st.fish = Array.isArray(st.fish) && st.fish.length === 2 ? [+st.fish[0] || 0, +st.fish[1] || 0] : [0, 0];
    st.round = +st.round || 1; st.R = +st.R || R_START; st.mid = st.mid || 'ko'; st.n = +st.n || 0;
    if (st.turn !== 0 && st.turn !== 1) st.turn = st.host === 1 ? 1 : 0;
    if (st.res && (!Array.isArray(st.res.init) || !Array.isArray(st.res.L) || !Array.isArray(st.res.fin))) delete st.res;
    if ((st.oldc === 0 || st.oldc === 1) && (realAims(st, st.oldc) || realSq(st, st.oldc))) delete st.oldc;   // they updated: a real new-format move
    if (st.oldc !== 0 && st.oldc !== 1) delete st.oldc;
    if (V3(st) && !c) cfgSync(st);
    return st;
  }
  // the seat whose phone runs an older app (-1: none; 2: "the partner", when an overwrite can't say whose)
  function oldSeat(st) {
    if (!V3(st)) return -1;
    if (st.oldc === 0 || st.oldc === 1) return st.oldc;
    for (let s = 0; s < 2; s++) { const a = st.aims && st.aims['a' + s]; if (a && typeof a.r === 'number' && !realAims(st, s)) return s; }
    return st.hx ? 2 : -1;
  }
  // a seat's submitted aims for THIS round ({r, v:[[vx,vy]×4], skip?}), or null
  function aimsOf(st, seat) { const a = st.aims && st.aims[AK(st) + seat]; return a && a.r === st.round && Array.isArray(a.v) ? a : null; }
  const realAims = (st, seat) => { const a = aimsOf(st, seat); return a && !a.skip ? a : null; };
  // a seat's submitted squad ({v:[type×4], skip?}) during the squad phase, or null
  function sqOf(st, seat) { const a = st.sqs && st.sqs['a' + seat]; return a && Array.isArray(a.v) && a.v.length === NP ? a : null; }
  const realSq = (st, seat) => { const a = sqOf(st, seat); return a && !a.skip ? a : null; };
  const aliveCount = (pens, seat) => { let n = 0; for (let k = 0; k < NP; k++) if (pens[seat * NP + k][2]) n++; return n; };
  const tyOf = st => st.sq[0].concat(st.sq[1]);
  const seatOf = i => i < NP ? 0 : 1;
  // a clamped launch vector; `cap` = the penguin type's max launch (x Classic)
  function cleanVec(v, cap) {
    if (!Array.isArray(v)) return [0, 0];
    let x = Math.round(+v[0] || 0), y = Math.round(+v[1] || 0);
    const lim = cap ? VMAX * cap : VMAX, l2 = x * x + y * y;
    if (l2 > lim * lim) { const k = lim / Math.sqrt(l2); x = Math.trunc(x * k); y = Math.trunc(y * k); }
    return [x, y];
  }
  // the 8 launch vectors; penguins without an arrow (or already swimming, or anchored) stay put
  function launches(st) {
    const L = [], ty = tyOf(st);
    for (let s = 0; s < 2; s++) {
      const a = aimsOf(st, s);
      for (let k = 0; k < NP; k++) { const i = s * NP + k; L.push(st.pens[i][2] && a && st.ef[i] !== 4 ? cleanVec(a.v[k], TYPES[ty[i]].cap) : [0, 0]); }
    }
    return L;
  }
  /* ----- power-ups: 1–2 items per round at SEEDED spots (match id + round): every phone derives the same ones ----- */
  function roomy(g, x, y, m) {                             // a point with some ice all round it
    if (!g.in(x, y)) return false;
    for (let k = 0; k < 72; k += 9) { const u = UV[k]; if (!g.in(x + u[0] * m, y + u[1] * m)) return false; }
    return true;
  }
  // One item sits on the midline (equally near both sides), two are a mirrored pair of the same kind: never unfair to a seat.
  function spawnItems(mid, round, g, pens) {
    const rng = seeded(hashStr(mid + ':' + round + ':it')), two = rng() < .5, kind = [1, 1, 2, 2, 3, 3, 4][Math.floor(rng() * 7)], ex = g.ex || g.ext, ey = g.ey || g.ext, out = [];
    const free = (x, y) => {
      if (x * x + y * y < 3025) return false;              // the middle stays clear (King of the Hill zone, the fish)
      for (let i = 0; i < 2 * NP; i++) { const p = pens[i]; if (!p[2]) continue; const dx = p[0] - x, dy = p[1] - y; if (dx * dx + dy * dy < 2500) return false; }
      return true;
    };
    for (let a = 0; a < 220 && !out.length; a++) {
      const m = a < 80 ? 34 : a < 150 ? 22 : 12;           // prefer open ice; on a nearly gone floe settle for less
      if (two) { const x = r2((rng() * 2 - 1) * ex), y = r2((rng() * 2 - 1) * ey); if (roomy(g, x, y, m) && roomy(g, -x, -y, m) && free(x, y) && free(-x, -y)) out.push([kind, x, y], [kind, -x, -y]); }
      else { const x = r2((rng() * 2 - 1) * ex * .95); if (roomy(g, x, 0, m) && free(x, 0)) out.push([kind, x, 0]); }
    }
    if (!out.length) {                                     // a very broken floe: scan for any mirrored pair that fits (from a seeded start)
      const pts = []; for (let x = -ex; x <= ex; x += 20) for (let y = -ey; y <= ey; y += 20) pts.push([x, y]);
      const off = Math.floor(rng() * pts.length);
      for (let i = 0; i < pts.length && !out.length; i++) { const q = pts[(off + i) % pts.length]; if (roomy(g, q[0], q[1], 12) && roomy(g, -q[0], -q[1], 12) && free(q[0], q[1]) && free(-q[0], -q[1])) out.push([kind, q[0], q[1]], [kind, -q[0], -q[1]]); }
    }
    return out;
  }
  const itemsFor = (st, g) => st.pw && st.phase === 'play' ? spawnItems(st.mid, st.round, g, st.pens) : [];
  /* ----- bodies: per-penguin mass / radius / bounce / friction from its type and power-up (+ the fish in Fish Hockey) ----- */
  // The fish is a 9th body. Rails bounce it off the rink edge (except in the goal mouths); crossing a goal line is a goal.
  function rinkHook(ev) {
    const P = 2 * NP, lo = -HW + PK_R, hi = HW - PK_R, ey = HL - PK_R;
    return (step, x, y, vx, vy, live) => {
      if (!live[P]) return;
      const s2 = vx[P] * vx[P] + vy[P] * vy[P];
      if (s2 > PK_V * PK_V) { const k = PK_V / Math.sqrt(s2); vx[P] *= k; vy[P] *= k; }
      if (x[P] >= -GW && x[P] <= GW && (y[P] <= -HL || y[P] >= HL)) { ev.push({ k: 'goal', step, seat: y[P] <= -HL ? 0 : 1, x: x[P], y: y[P] }); live[P] = false; return; }   // seat 0 scores at the far (−y) goal
      if (x[P] < lo) { x[P] = lo; if (vx[P] < 0) vx[P] = -vx[P] * PK_E; } else if (x[P] > hi) { x[P] = hi; if (vx[P] > 0) vx[P] = -vx[P] * PK_E; }
      if (x[P] < -GW || x[P] > GW) {
        if (y[P] < -ey) { y[P] = -ey; if (vy[P] < 0) vy[P] = -vy[P] * PK_E; } else if (y[P] > ey) { y[P] = ey; if (vy[P] > 0) vy[P] = -vy[P] * PK_E; }
      }
    };
  }
  function makeBd(ty, ef, items, md) {
    const hk = md === 'hockey', m = [], r = [], e = [], fr = [], fx = [], sh = [];
    for (let i = 0; i < 2 * NP; i++) {
      const T = TYPES[ty[i]] || TYPES[0], f = ef[i] | 0;
      m[i] = f === 1 ? T.m * 2 : T.m; r[i] = T.r; e[i] = f === 3 ? SPR_E : REST; fr[i] = FRIC; fx[i] = f === 4 ? 1 : 0; sh[i] = f === 2 ? 1 : 0;
    }
    const bd = { m, r, e, fr, fx, sh, items: items || [], grab: 2 * NP, ev: [] };
    if (hk) { m[2 * NP] = PK_M; r[2 * NP] = PK_R; e[2 * NP] = PK_E; fr[2 * NP] = PK_F; fx[2 * NP] = 0; sh[2 * NP] = 0; bd.onStep = rinkHook(bd.ev); }
    return bd;
  }
  // The slide. ONLY + − × ÷ and √ (all correctly rounded by IEEE-754), fixed order, fixed step:
  // the same inputs give bit-identical output on iOS Safari and Chrome. `geo` is a geoFor() result (or, for old
  // callers, a bare floe radius); `bd` optionally gives each body its own mass / radius / restitution / friction
  // (default: every body is a Classic penguin), anchors (`fx`: immovable), one-shot shields (`sh`), items on the ice
  // (`items`: [[kind,x,y]], grabbed by bodies 0..grab-1) and an onStep hook (the fish's rails and goals).
  function simulate(init, L, geo, bd) {
    if (typeof geo === 'number') geo = geoFor('floe', 0, '', geo);
    const n = init.length, x = [], y = [], vx = [], vy = [], live = [], m = [], rad = [], rest = [], fr = [];
    const fx = bd && bd.fx, sh = bd && bd.sh ? bd.sh.slice() : null, items = bd && bd.items && bd.items.length ? bd.items : null, ng = bd && bd.grab || 0;
    for (let i = 0; i < n; i++) {
      x[i] = +init[i][0]; y[i] = +init[i][1]; live[i] = !!init[i][2];
      vx[i] = live[i] && !(fx && fx[i]) ? +L[i][0] : 0; vy[i] = live[i] && !(fx && fx[i]) ? +L[i][1] : 0;
      m[i] = bd && bd.m ? bd.m[i] : 1; rad[i] = bd && bd.r ? bd.r[i] : PR; rest[i] = bd && bd.e ? bd.e[i] : REST; fr[i] = bd && bd.fr ? bd.fr[i] : FRIC;
    }
    const frames = [], hits = [], outs = [], bumps = [], got = [], shields = [], onIce = geo.in, walls = geo.walls, cur = geo.cur;
    const taken = items ? items.map(() => 0) : null, lx = x.slice(), ly = y.slice();
    const snap = () => { const f = new Array(n * 2); for (let i = 0; i < n; i++) { f[i * 2] = x[i]; f[i * 2 + 1] = y[i]; } frames.push(f); };
    snap();
    let step = 0;
    for (; step < MAX_STEPS; step++) {
      let wx = 0, wy = 0;
      if (cur) { const f = step < CUR_S1 ? 1 : step < CUR_S2 ? (CUR_S2 - step) / (CUR_S2 - CUR_S1) : 0; wx = cur[0] * f; wy = cur[1] * f; }
      for (let i = 0; i < n; i++) {
        if (!live[i] || (fx && fx[i])) continue;
        if (cur) {                                         // friction acts on the speed relative to the water
          const rx = vx[i] - wx, ry = vy[i] - wy, s2 = rx * rx + ry * ry;
          if (s2 > 0) {
            const sp = Math.sqrt(s2), ns = sp - fr[i] * DT;
            if (ns <= 0) { vx[i] = wx; vy[i] = wy; } else { const k = ns / sp; vx[i] = wx + rx * k; vy[i] = wy + ry * k; }
          }
          if (vx[i] !== 0 || vy[i] !== 0) { x[i] += vx[i] * DT; y[i] += vy[i] * DT; }
          continue;
        }
        const s2 = vx[i] * vx[i] + vy[i] * vy[i];
        if (s2 > 0) {
          const sp = Math.sqrt(s2), ns = sp - fr[i] * DT;
          if (ns <= 0) { vx[i] = 0; vy[i] = 0; } else { const k = ns / sp; vx[i] *= k; vy[i] *= k; }
          x[i] += vx[i] * DT; y[i] += vy[i] * DT;
        }
      }
      for (let i = 0; i < n; i++) {
        if (!live[i]) continue;
        for (let j = i + 1; j < n; j++) {
          if (!live[j]) continue;
          const dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy, D = rad[i] + rad[j];
          if (d2 >= D * D) continue;
          const fi = fx && fx[i], fj = fx && fx[j];
          if (fi && fj) continue;                          // two anchors never move
          const d = d2 === 0 ? 0 : Math.sqrt(d2), nx = d2 === 0 ? 0 : dx / d, ny = d2 === 0 ? 1 : dy / d, ov = D - d, mi = m[i], mj = m[j];   // exactly on top of each other: part them along y
          const wi = fi ? 0 : fj ? 1 : mj / (mi + mj), wj = fj ? 0 : fi ? 1 : mi / (mi + mj);
          x[i] -= nx * (ov * wi); y[i] -= ny * (ov * wi); x[j] += nx * (ov * wj); y[j] += ny * (ov * wj);   // the heavier one gives way less
          const vr = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny;
          if (vr > 0) {
            const hi = rest[i] > REST || rest[j] > REST;   // a Spring (or the fish) makes the hit livelier; otherwise the less bouncy one rules
            const e = hi ? (rest[i] > rest[j] ? rest[i] : rest[j]) : (rest[i] < rest[j] ? rest[i] : rest[j]);
            let Ji, Jj;
            if (fi) { Ji = 0; Jj = (1 + e) * vr; } else if (fj) { Ji = (1 + e) * vr; Jj = 0; }
            else { const J = (1 + e) / (1 / mi + 1 / mj) * vr; Ji = J / mi; Jj = J / mj; }
            vx[i] -= Ji * nx; vy[i] -= Ji * ny; vx[j] += Jj * nx; vy[j] += Jj * ny;
            if (vr > 40) hits.push({ step, i, j, x: (x[i] + x[j]) / 2, y: (y[i] + y[j]) / 2, s: vr });
          }
        }
      }
      if (walls) for (let i = 0; i < n; i++) {             // bumpers: one-sided cushions (the flat) and round posts (the ends)
        if (!live[i] || (fx && fx[i])) continue;           // an anchor doesn't budge
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
      if (items) for (let k = 0; k < items.length; k++) {  // a penguin that slides over an item grabs it (the first to touch it wins)
        if (taken[k]) continue;
        for (let i = 0; i < ng; i++) {
          if (!live[i]) continue;
          const dx = x[i] - items[k][1], dy = y[i] - items[k][2], D = rad[i] + IR;
          if (dx * dx + dy * dy < D * D) { taken[k] = 1; got.push({ step, i, k }); break; }
        }
      }
      if (bd && bd.onStep) bd.onStep(step, x, y, vx, vy, live);   // HOOK: the fish's rails and goals
      let moving = false;
      for (let i = 0; i < n; i++) {
        if (!live[i]) continue;
        if (!onIce(x[i], y[i])) {
          if (sh && sh[i]) {                               // a Shield: back to where it was on the ice, bounced once
            sh[i] = 0; shields.push({ step, i, x: x[i], y: y[i] });
            x[i] = lx[i]; y[i] = ly[i];
            let bx = -vx[i] * .7, by = -vy[i] * .7;
            if (bx === 0 && by === 0) { const d = Math.sqrt(x[i] * x[i] + y[i] * y[i]) || 1; bx = -x[i] / d * 160; by = -y[i] / d * 160; }
            vx[i] = bx; vy[i] = by; moving = true; continue;
          }
          live[i] = false; outs.push({ step, i, x: x[i], y: y[i], vx: vx[i], vy: vy[i] }); continue;
        }
        lx[i] = x[i]; ly[i] = y[i];
        if (vx[i] !== 0 || vy[i] !== 0) moving = true;
      }
      if ((step + 1) % SUB === 0) snap();
      if (!moving) { step++; break; }
    }
    if (step % SUB !== 0) snap();
    const fin = [];
    for (let i = 0; i < n; i++) fin.push([r2(x[i]), r2(y[i]), live[i] ? 1 : 0]);
    return { fin, frames, hits, outs, bumps, got, shields, ev: bd && bd.ev || [], steps: step };
  }
  const RS_OFF = [[0, 0], [0, 40], [0, 80], [46, 40], [-46, 40], [46, 0], [-46, 0], [0, -40]];
  // the nearest spot on ice `g` for body i that clears every other standing penguin (rings of 8, every 15 degrees; + and x only)
  function safeSpot(g, x, y, pens, i, rads) {
    for (let d = 8; d <= 480; d += 8) for (let k = 0; k < 72; k += 3) {
      const px = r2(x + UV[k][0] * d), py = r2(y + UV[k][1] * d);
      if (!roomy(g, px, py, 10)) continue;
      let ok = true;
      for (let j = 0; j < 2 * NP && ok; j++) { if (j === i || !pens[j][2]) continue; const dx = pens[j][0] - px, dy = pens[j][1] - py, D = rads[i] + rads[j] + 2; if (dx * dx + dy * dy < D * D) ok = false; }
      if (ok) return [px, py];
    }
    return null;
  }
  // King of the Hill / Fish Hockey: a fallen penguin is back on its start line next round (nudged if somebody is standing there)
  function respawn(pens, g, rads) {
    rads = rads || Z8().map(() => PR);
    const sl = slotsFor(g, Math.max.apply(null, rads)), out = pens.map(p => p.slice()), list = [];
    for (let i = 0; i < 2 * NP; i++) {
      if (out[i][2]) continue;
      const sg = i < NP ? 1 : -1, q = sl[i % NP];
      let pos = [r2(sg * q[0]), r2(sg * q[1])];
      for (let t = 0; t < RS_OFF.length; t++) {
        const x = r2(sg * (q[0] + RS_OFF[t][0])), y = r2(sg * (q[1] + RS_OFF[t][1]));
        let ok = roomy(g, x, y, 16);
        for (let j = 0; j < 2 * NP && ok; j++) if (out[j][2]) { const dx = out[j][0] - x, dy = out[j][1] - y, D = rads[i] + rads[j] + 8; if (dx * dx + dy * dy < D * D) ok = false; }   // 52 apart for two Classics
        if (ok) { pos = [x, y]; break; }
      }
      out[i] = [pos[0], pos[1], 1]; list.push([i, pos[0], pos[1]]);
    }
    return { pens: out, list };
  }
  const FISH_OFF = [[0, 0], [40, 0], [-40, 0], [0, 40], [0, -40], [80, 0], [-80, 0], [40, 40], [-40, -40], [40, -40], [-40, 40]];
  function fishSpot(pens, ty) {
    for (let t = 0; t < FISH_OFF.length; t++) {
      const x = FISH_OFF[t][0], y = FISH_OFF[t][1]; let ok = true;
      for (let j = 0; j < 2 * NP && ok; j++) if (pens[j][2]) { const dx = pens[j][0] - x, dy = pens[j][1] - y, D = TYPES[ty[j]].r + PK_R + 2; if (dx * dx + dy * dy < D * D) ok = false; }
      if (ok) return [x, y];
    }
    return [0, 0];
  }
  const inZone = p => p[0] * p[0] + p[1] * p[1] <= ZR * ZR;
  // Both aims in → the whole round, resolved. Returns { next, winner? }.
  function resolveRound(st0, by) {
    const st = norm(JSON.parse(JSON.stringify(st0))), md = st.mode, hk = md === 'hockey', kh = md === 'koth', stat = md !== 'sumo';
    const g0 = geoOf(st.arena, st, 0), L = launches(st), items = itemsFor(st, g0), ty = tyOf(st);
    const init = hk ? st.pens.concat([[st.fish[0], st.fish[1], 1]]) : st.pens;
    const L9 = hk ? L.concat([[0, 0]]) : L;
    const sim = simulate(init, L9, g0, makeBd(ty, st.ef, items, md));
    const R1 = stat ? st.R : nextR(st.R);
    const nid = arenaAfter(st), g1 = stat ? g0 : geoOf(nid, st, 1), swap = nid !== st.arena;
    const used = {}; sim.shields.forEach(e => { used[e.i] = 1; });
    // the part of the ice that breaks off after the slide takes anyone standing on it too (roulette: the whole arena is swapped
    // instead) - except a penguin with an unused Shield: it hops onto the nearest safe ice and the shield is spent
    const saved = [];
    let fin = sim.fin;
    if (!swap && !stat) {
      const rads = ty.map(t => TYPES[t].r);
      fin = sim.fin.map(p => p.slice());
      for (let i = 0; i < 2 * NP; i++) {
        const p = fin[i]; if (!p[2] || g1.in(p[0], p[1])) continue;
        const q = st.ef[i] === 2 && !used[i] ? safeSpot(g1, p[0], p[1], fin, i, rads) : null;
        if (q) { fin[i] = [q[0], q[1], 1]; used[i] = 1; saved.push([i, q[0], q[1]]); } else fin[i] = [p[0], p[1], 0];
      }
    }
    const pensFin = fin.slice(0, 2 * NP);
    const s = JSON.parse(JSON.stringify(st));
    s.res = { id: st.mid + ':' + st.round, r: st.round, by: by === 1 ? 1 : 0, init, L: L9, fin, R0: st.R, R1, ar: st.arena };
    if (stat) s.res.md = md;                             // the optional extras below are only written when they matter: a classic Sumo round keeps the old shape
    if (ty.some(t => t)) s.res.ty = ty;
    if (st.ef.some(v => v)) s.res.ef = st.ef;
    if (items.length) { s.res.it = items; if (sim.got.length) s.res.gt = sim.got.map(e => [e.i, e.k]); }
    if (sim.shields.length) s.res.sh = sim.shields.map(e => e.i);
    if (saved.length) s.res.sv = saved;
    // power-ups grabbed this round work NEXT round; an unused shield waits for its fall; the fallen carry nothing (Sumo)
    const ef2 = Z8();
    sim.got.forEach(e => { ef2[e.i] = items[e.k][0]; });
    for (let i = 0; i < 2 * NP; i++) { if (!ef2[i] && st.ef[i] === 2 && !used[i]) ef2[i] = 2; if (!stat && !pensFin[i][2]) ef2[i] = 0; }
    s.ef = ef2;
    const left = [aliveCount(pensFin, 0), aliveCount(pensFin, 1)];
    let winner, goal = null;
    if (!stat) {
      s.pens = fin;
      if (!left[0] && !left[1]) winner = 'draw';
      else if (!left[0]) winner = 1;
      else if (!left[1]) winner = 0;
      else if (st.round >= MAX_ROUNDS) winner = left[0] === left[1] ? 'draw' : (left[0] > left[1] ? 0 : 1);
    } else {
      s.pts = st.pts.slice();
      if (kh) {                                          // each penguin of yours standing in the zone when everything has stopped scores 1
        const pt = [0, 0];
        for (let i = 0; i < 2 * NP; i++) if (pensFin[i][2] && inZone(pensFin[i])) pt[i < NP ? 0 : 1]++;
        s.pts[0] += pt[0]; s.pts[1] += pt[1]; s.res.pt = pt;
      } else {
        goal = sim.ev.find(e => e.k === 'goal') || null;
        if (goal) { s.pts[goal.seat]++; s.res.gl = goal.seat; const q = fishSpot(pensFin, ty); fin[2 * NP] = [q[0], q[1], 1]; s.fish = q; }   // the fish is back in the middle (nudged if someone stands there)
        else s.fish = [fin[2 * NP][0], fin[2 * NP][1]];
      }
      const rp = respawn(pensFin, g0, ty.map(t => TYPES[t].r));
      s.pens = rp.pens; if (rp.list.length) s.res.rs = rp.list;
      const a = s.pts[0], b = s.pts[1], cmp = a === b ? 'draw' : a > b ? 0 : 1;
      if (kh) { if (st.round >= MAX_ROUNDS) winner = cmp; }
      else if (goal && s.pts[goal.seat] >= GOAL_TO) winner = goal.seat;
      else if (st.round >= HK_ROUNDS) winner = cmp !== 'draw' ? cmp : s.fish[1] < -12 ? 0 : s.fish[1] > 12 ? 1 : 'draw';   // level: the fish nearer the partner's goal wins
    }
    s.R = R1; s.aims = {}; s.n = st.n + 1;
    s.turn = st.turn === 1 ? 0 : 1;                    // always changes → the turn clock restarts for the new round
    if (winner === undefined) {
      s.round = st.round + 1;
      if (swap) {                                      // survivors regroup on the next arena's start slots (same penguin → same slot)
        const sl = slotsFor(g1, Math.max.apply(null, ty.map(t => TYPES[t].r)));
        s.arena = nid; s.pens = fin.map((p, i) => { const k = i % NP, q = sl[k]; return p[2] ? [i < NP ? q[0] : -q[0], i < NP ? q[1] : -q[1], 1] : p; });
        s.res.rg = s.pens; s.res.na = nid;
      }
    } else s.over = stat ? { w: winner, left, sc: s.pts.slice() } : { w: winner, left };
    return { next: cfgSync(s), winner };
  }
  /* ----- squad pick (before round 1): each player locks 4 types in secret; the resolver reveals both together ----- */
  function beginPlay(st, sq) {
    st.phase = 'play'; st.pens = startPens(st.arena); st.aims = {}; st.sqs = {}; st.round = 1; st.R = R_START;
    st.pts = [0, 0]; st.ef = Z8(); st.fish = [0, 0];
    if (sq) st.sq = [cleanSq(sq[0]), cleanSq(sq[1])];
    return cfgSync(st);
  }
  function resolveSquad(st0, by) {
    const st = norm(JSON.parse(JSON.stringify(st0))), v = seat => { const a = realSq(st, seat); return a ? cleanSq(a.v) : [0, 0, 0, 0]; };   // a timed-out picker gets 4 Classic
    const s = beginPlay(JSON.parse(JSON.stringify(st)), [v(0), v(1)]);
    s.n = st.n + 1; s.turn = st.turn === 1 ? 0 : 1; s.sqby = by === 1 ? 1 : 0;
    return { next: s };
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
    draft: { key: '', v: [null, null, null, null] }, sel: null, drag: null, sqd: { key: '', v: [0, 0, 0, 0], sel: 0 }, popSlot: -1,
    parts: [], hats: {}, banner: null, pv: [], snow: [], shim: [], cracks: [], rimPh: [0, 0, 0],
    layers: null, layerKey: '', vig: null, ui: null, zoneFlash: 0, frameTypes: [], items: { key: '', list: [] }, fishAng: 0,
    sw: null, pre: { id: null }, prePos: null, padHit: {}, starting: '',
    arrows: { own: 0, foePlanning: 0, foeReveal: 0 }, mismatch: 0,
    calm: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  const rnd = (a, b) => a + Math.random() * (b - a);

function resetScene(st) {
    S.mid = st.mid; S.anim = null; S.parts = []; S.hats = {}; S.banner = null; S.sel = null; S.drag = null; S.myRes = {}; S.fbKey = null;
    S.draft = { key: '', v: [null, null, null, null] }; S.shake = 0; S.flash = 0; S.layerKey = '';
    S.sw = null; S.pre = { id: null }; S.prePos = null; S.padHit = {}; S.starting = ''; S.lastSay = ''; S.focusSel = ''; S.zoneFlash = 0; S.sqd = { key: '', v: [0, 0, 0, 0], sel: 0 }; S.items = { key: '', list: [] };
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
    if (S.hats[i] || !S.st || S.st.roulette || S.st.phase === 'setup' || S.st.mode !== 'sumo') return;   // the fallen respawn in the other modes: no hats
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
  const busy = () => !!(S.anim || S.drag || S.parts.length || S.shake > .2 || S.banner || S.sw || S.zoneFlash > .03 || Object.keys(S.padHit).length);
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
    const c = S.ctx; if (!c || c.status !== 'active' || S.anim || !S.st || S.st.phase !== 'play') return false;
    return !submitted(S.st, c.me);
  }
  // the squad phase uses the same machinery as a round of aims: a hidden submission per seat, banked in memory + localStorage
  const rkOf = st => st.phase === 'squad' ? st.mid + ':sq' : st.mid + ':' + st.round;
  const myKey = (st, me) => st.phase === 'squad' ? memKey(st.mid, 'sq', me) : memKey(st.mid, st.round, me);
  const subOf = (st, seat) => st.phase === 'squad' ? sqOf(st, seat) : aimsOf(st, seat);
  const realSub = (st, seat) => st.phase === 'squad' ? realSq(st, seat) : realAims(st, seat);
  function submitted(st, me) { return !!(subOf(st, me) || memGet(myKey(st, me))); }
  const capOfPen = (st, i) => TYPES[tyOf(st)[i]].cap;
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
      const i = me * NP + k; if (!st.pens[i][2] || st.ef[i] === 4) continue;
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
    const len = Math.hypot(ax, ay), lim = MAXA * capOfPen(S.st, S.ctx.me * NP + d.k);
    if (len > lim) { ax *= lim / len; ay *= lim / len; }
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
    if (!canPlan() || S.st.ef[S.ctx.me * NP + k] === 4) return;
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

  /* ---------------- squad pick: my draft (mine only: never anyone else's), lock-in ---------------- */
  function sqDraft(st) {
    if (S.sqd.key !== st.mid) S.sqd = { key: st.mid, v: [0, 0, 0, 0], sel: 0 };
    return S.sqd;
  }
  function pickType(t) {                                 // assign a type to the selected slot, then move on to the next slot
    const c = S.ctx, st = S.st; if (!c || !st || st.phase !== 'squad' || submitted(st, c.me) || c.status !== 'active') return;
    const d = sqDraft(st); d.v[d.sel] = t; S.popSlot = d.sel; d.sel = (d.sel + 1) % NP;
    try { c.sound.tap(); } catch (e) {}
    rerender(); S.popSlot = -1;
  }
  function pickSlot(k) {
    const c = S.ctx, st = S.st; if (!c || !st || st.phase !== 'squad' || submitted(st, c.me)) return;
    sqDraft(st).sel = k; try { c.sound.tap(); } catch (e) {}
    rerender();
  }
  function randomSquad() {
    const c = S.ctx, st = S.st; if (!c || !st || st.phase !== 'squad' || submitted(st, c.me)) return;
    const d = sqDraft(st); d.v = d.v.map(() => Math.floor(Math.random() * TYPES.length)); try { c.sound.tap(); } catch (e) {}
    S.popSlot = 9; rerender(); S.popSlot = -1;
  }
  function lockSquad(v) {
    const c = S.ctx; if (!c || c.status !== 'active' || !S.st || S.st.phase !== 'squad' || submitted(S.st, c.me)) return;
    const st = norm(c.clone(c.state)), me = c.me, d = sqDraft(st);
    if (v) d.v = cleanSq(v);
    memSet(myKey(st, me), cleanSq(d.v));                 // banked FIRST — a write race can't lose it now
    try { c.sound.place(); } catch (e) {}
    if (!sync('ready')) rerender();
  }

  /* ---------------- sync: submit, self-heal, resolve (exactly one phone) ---------------- */
  function ready() {
    const c = S.ctx; if (!canPlan()) return;
    const st = norm(c.clone(c.state)), me = c.me, v = draftFor(st);
    const aims = v.map((d, k) => st.pens[me * NP + k][2] && st.ef[me * NP + k] !== 4 && d ? [Math.round(d[0] / MAXA * VMAX), Math.round(d[1] / MAXA * VMAX)] : [0, 0]);
    memSet(memKey(st.mid, st.round, me), aims);           // banked FIRST — a write race can't lose it now
    S.sel = null;
    try { c.sound.place(); } catch (e) {}
    if (!sync('ready')) rerender();
  }
  // Returns true if it committed. Deferred out of render (never nested in a paint).
  function sync(reason) {
    const c = S.ctx; if (!c || c.status !== 'active') return false;
    const st = norm(c.clone(c.state)), me = c.me, rk = rkOf(st), sqp = st.phase === 'squad';
    if (st.phase === 'setup') return false;
    // I already resolved this round but the shared state is behind it. Usually that's just an older
    // snapshot still arriving, so give my write a moment to land; if it really was overwritten,
    // re-send the SAME outcome (never a second, different resolution).
    const mine = S.myRes[rk];
    if (mine) {
      const wait = RESEND_MS - (Date.now() - mine.t);
      if (wait > 0) { if (!mine.chk) mine.chk = setTimeout(() => { mine.chk = 0; sync(); }, wait + 30); return false; }
      mine.t = Date.now(); commitRes(c, mine); return true;
    }
    const m = memGet(myKey(st, me));
    let changed = false;
    if (m && !realSub(st, me)) { if (sqp) st.sqs['a' + me] = { v: m }; else st.aims[AK(st) + me] = { r: st.round, v: m }; changed = true; }
    if (oldSeat(st) >= 0) {                                // an older app is in this match: bank my move, never resolve
      if (changed) { c.commit(seal(st)); return true; }
      return false;
    }
    const both = !!(subOf(st, 0) && subOf(st, 1));
    if (both && (me === 0 || reason === 'fallback')) {
      const out = sqp ? resolveSquad(st, me) : resolveRound(st, me);
      out.t = Date.now(); S.myRes[rk] = out;
      commitRes(c, out);                                  // commit FIRST — the replay is decoration
      return true;
    }
    if (both) armFallback(rk);
    if (changed) {
      if (!subOf(st, 1 - me)) st.turn = 1 - me;           // the clock follows whoever is still aiming (or picking)
      c.commit(seal(st));
      return true;
    }
    return false;
  }
  function commitRes(c, out) {
    S.resCommits++;
    const next = seal(JSON.parse(JSON.stringify(out.next)));
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
      if (rkOf(cur) === rk && subOf(cur, 0) && subOf(cur, 1) && oldSeat(cur) < 0) sync('fallback');
    }, FALLBACK_MS);
  }
  function scheduleSync(st, ctx) {
    if (ctx.status !== 'active') return;
    if (st.phase === 'setup') return;
    const me = ctx.me, rk = rkOf(st);
    const m = memGet(myKey(st, me));
    if (S.myRes[rk] || (m && !realSub(st, me)) || (subOf(st, 0) && subOf(st, 1) && oldSeat(st) < 0)) setTimeout(() => sync(), 0);
  }

  /* ---------------- replay a committed resolution ---------------- */
  function maybeReplay(st) {
    const res = st.res;
    if (!res || !res.id || S.done.has(res.id) || S.anim) return;
    const md = MODE_IDS.indexOf(res.md) >= 0 ? res.md : 'sumo', hk = md === 'hockey', stat = md !== 'sumo', nb = 2 * NP + (hk ? 1 : 0);
    if (res.init.length !== nb || res.L.length !== nb || res.fin.length !== nb) { doneAdd(res.id); return; }
    // the arena is a pure function of (id, round, match): replay from the same ice the resolver slid on
    const ar = BUILD[res.ar] ? res.ar : 'floe', mid = res.id.slice(0, res.id.lastIndexOf(':')), rn = +res.r || 1;
    const geoA = geoAt(md, ar, rn, mid, res.R0), swap = !stat && !!(res.rg && BUILD[res.na] && res.na !== ar);
    const geoB = stat ? geoA : geoFor(swap ? res.na : ar, rn, mid, res.R1);
    // the round's types / power-ups / items travel with the result (absent = Classic, none: old saves replay as before)
    const ty = Array.isArray(res.ty) && res.ty.length === 2 * NP ? res.ty.map(t => t | 0) : Z8(), ef = Array.isArray(res.ef) && res.ef.length === 2 * NP ? res.ef.map(t => t | 0) : Z8();
    const items = Array.isArray(res.it) ? res.it : [];
    const sim = simulate(res.init, res.L, geoA, makeBd(ty, ef, items, md));
    // determinism check (the snap below makes the committed result authoritative either way)
    let mis = 0;
    const sv = Array.isArray(res.sv) ? res.sv.filter(q => Array.isArray(q) && q[0] >= 0 && q[0] < 2 * NP) : [], svI = new Set(sv.map(q => q[0]));
    sim.fin.forEach((p, i) => {
      const f = res.fin[i];
      if (svI.has(i)) return;                            // a Shield hop after the slide (decided by the resolver, shown in the shrink beat)
      if (hk && i === 2 * NP) {
        const gl = sim.ev.find(e => e.k === 'goal');
        if ((res.gl != null) !== !!gl || (gl && gl.seat !== res.gl) || (!gl && (Math.abs(p[0] - f[0]) > .01 || Math.abs(p[1] - f[1]) > .01))) mis++;
        return;
      }
      if (Math.abs(p[0] - f[0]) > .01 || Math.abs(p[1] - f[1]) > .01 || (p[2] && !f[2] && (swap || geoB.in(p[0], p[1])))) mis++;
    });
    S.mismatch += mis;
    const outsSim = new Set(sim.outs.map(o => o.i));
    const shrinkOuts = [];
    if (!stat) res.fin.forEach((f, i) => { if (res.init[i][2] && !f[2] && !outsSim.has(i)) shrinkOuts.push(i); });
    const over = !!(st.over || (S.ctx && S.ctx.status === 'finished'));
    const lost = swap || stat ? null : lostInfo(geoA, geoB);
    const doShrink = !swap && !stat && lost.chunks.length > 0 && (!over || shrinkOuts.length > 0), doSwap = swap && !over;
    const rs = Array.isArray(res.rs) ? res.rs : [];
    const simEnd = sim.steps / 240;
    const lastOut = sim.outs.length ? sim.outs[sim.outs.length - 1].step / 240 : -9;
    const tailFall = Math.max(0, lastOut * 1000 + FALL_MS - simEnd * 1000);
    S.anim = {
      id: res.id, res, sim, geo: geoA, geoA, geoB, lost, phase: 'reveal', t: 0, total: 0, simT: 0, simEnd, hi: 0, oi: 0, bi: 0, gi: 0, si: 0, ei: 0,
      slow: 0, slowUsed: 0, focus: null, falls: {}, broken: false, chunks: [], shrinkOuts, doShrink, doSwap, sw: null, from: null,
      md, ty, ef, rs, pt: md === 'koth' ? (res.pt || [0, 0]) : null, gl: res.gl != null ? res.gl : null, over,
      sv, svFrom: {}, items: items.map(it => ({ k: it[0], x: it[1], y: it[2], gone: -1 })), scored: false, goalSeen: false, goalT: -1, fishAng: 0, rsT: 0, rsLeft: {},
      pos: res.init.map(p => [p[0], p[1]]), vel: res.init.map(() => [0, 0]), on: res.init.map(p => !!p[2]), hop: res.init.map(() => 0),
      est: REVEAL + simEnd * 1000 + tailFall + 650 + (doShrink ? SHRINK_MS + (shrinkOuts.length ? FALL_MS : 0) : 0) + (doSwap ? SWAP_MS : 0) + (rs.length ? RS_MS : 0) + (md === 'koth' ? SCORE_MS : 0) + (res.gl != null ? GOAL_HOLD : 0),
    };
    S.sel = null; S.drag = null;
    if (S.ctx && res.by !== S.ctx.me) { try { S.ctx.sound.tap(); } catch (e) {} }
    kick();
  }
  function finishAnim() {
    const A = S.anim; if (!A) return;
    S.anim = null; doneAdd(A.id);
    if (A.md === 'sumo') A.res.fin.forEach((f, i) => { if (A.res.init[i][2] && !f[2]) addHat(i, A.falls[i] ? A.falls[i].ex : f[0], A.falls[i] ? A.falls[i].ey : f[1]); });
    const c = S.ctx;
    if (c) {
      const lost = [0, 1].map(s => aliveCount(A.res.init, s) - aliveCount(A.res.fin, s));
      const nm = s => c.players[s].name, good = '#9dffcf', bad = '#ff8fa8', mid = '#ffe08a';
      let txt, col;
      if (A.md === 'koth') {
        const pt = A.pt || [0, 0];
        txt = !pt[0] && !pt[1] ? 'Nobody held the hill' : pt[0] && pt[1] ? `${nm(0)} +${pt[0]} · ${nm(1)} +${pt[1]}` : `${nm(pt[0] ? 0 : 1)} +${pt[0] || pt[1]}`;
        col = !pt[0] && !pt[1] ? '#bfe9ff' : pt[c.me] && !pt[1 - c.me] ? good : pt[1 - c.me] && !pt[c.me] ? bad : mid;
        if (lost[0] + lost[1]) txt += ` · ${lost[0] + lost[1]} splashed, back next round`;
      } else if (A.md === 'hockey') {
        txt = A.gl != null ? `GOAL! ${nm(A.gl)} scores` : (lost[0] + lost[1] ? `No goal · ${lost[0] + lost[1]} splashed, back next round` : 'No goal. The fish stays in play');
        col = A.gl == null ? '#bfe9ff' : A.gl === c.me ? good : bad;
      } else {
        txt = !lost[0] && !lost[1] ? 'Nobody fell in… the ice holds'
          : lost[0] && lost[1] ? `SPLASH! ${nm(0)} −${lost[0]} · ${nm(1)} −${lost[1]}`
          : `SPLASH! ${nm(lost[0] ? 0 : 1)} −${lost[0] || lost[1]}`;
        col = !lost[0] && !lost[1] ? '#bfe9ff' : (lost[c.me] && !lost[1 - c.me] ? bad : (lost[1 - c.me] && !lost[c.me] ? good : mid));
      }
      S.banner = { text: txt, t: 0, col };
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
    const who = h.j >= 2 * NP ? h.i : Math.random() < .5 ? h.i : h.j;   // the fish (Fish Hockey's 9th body) has nothing to say
    if (s > 300 && Math.random() < .45) S.parts.push({ k: 'say', i: who, text: pick(SAYS_HIT), life: 1100, max: 1100 });
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
    A.sv.forEach(q => { const p = A.pos[q[0]]; A.svFrom[q[0]] = [p[0], p[1]]; onShield(A, { i: q[0], x: p[0], y: p[1] }); });   // the Shield hops it to safe ice
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
  // power-ups, shields, goals and the respawn / score beats of King of the Hill + Fish Hockey
  function onGrab(A, g) {
    const it = A.items[g.k], K2 = IK[it.k], p = A.pos[g.i];
    it.gone = S.tick;
    for (let q = 0; q < 14; q++) { const a = rnd(0, 6.28), v = rnd(40, 110); S.parts.push({ k: 'chip', x: it.x, y: it.y, z: rnd(6, 16), vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(70, 170), life: rnd(400, 800), max: 800, sz: rnd(1.5, 3), c: K2.col }); }
    S.parts.push({ k: 'star', x: it.x, y: it.y, z: 16, life: 360, max: 360, sz: .9, rot: rnd(0, 1) });
    S.parts.push({ k: 'word', x: p[0], y: p[1], z: 50, text: K2.name.toUpperCase() + '!', life: 1100, max: 1100, sz: 1, rot: rnd(-.15, .15), c: K2.col });
    S.parts.push({ k: 'say', i: g.i, text: 'next round!', life: 1500, max: 1500 });
    try { S.ctx.sound.place(); } catch (e) {}
  }
  function onShield(A, e) {
    for (let q = 0; q < 16; q++) { const a = rnd(0, 6.28), v = rnd(50, 130); S.parts.push({ k: 'chip', x: e.x, y: e.y, z: rnd(6, 20), vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: rnd(60, 150), life: rnd(400, 800), max: 800, sz: rnd(1.5, 3.2), c: '#9defff' }); }
    S.parts.push({ k: 'word', x: e.x, y: e.y, z: 44, text: 'BOING!', life: 900, max: 900, sz: 1.1, rot: rnd(-.2, .2), c: '#9defff' });
    S.parts.push({ k: 'say', i: e.i, text: 'saved!', life: 1200, max: 1200 });
    S.shake = Math.max(S.shake, S.calm ? 0 : 4);
    try { S.ctx.sound.good(); } catch (x) {}
  }
  function onGoal(A, e) {
    A.goalSeen = true; A.goalT = 0;
    const c = S.ctx, col = c.players[e.seat].color;
    for (let q = 0; q < 30; q++) { const a = rnd(0, 6.28), v = rnd(50, 150); S.parts.push({ k: 'chip', x: e.x, y: e.y, z: rnd(8, 26), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, vz: rnd(90, 220), life: rnd(500, 1000), max: 1000, sz: rnd(1.6, 3.4), c: q % 2 ? '#ffffff' : col }); }
    S.parts.push({ k: 'word', x: e.x, y: e.y, z: 60, text: 'GOAL!', life: 1500, max: 1500, sz: 1.35, rot: rnd(-.12, .12), c: '#ffd23a' });
    S.banner = { text: 'GOAL! ' + c.players[e.seat].name + ' scores', t: 0, col: e.seat === c.me ? '#9dffcf' : '#ff8fa8' };
    if (!S.calm) S.shake = Math.max(S.shake, 8);
    try { navigator.vibrate && navigator.vibrate(30); } catch (x) {}
    try { c.sound[e.seat === c.me ? 'good' : 'bad'](); } catch (x) {}
  }
  function startRespawn(A) {
    A.rsT = 0;
    A.rs.forEach(r => {
      const i = r[0]; delete A.falls[i]; A.on[i] = true; A.pos[i] = [r[1], r[2]]; A.vel[i] = [0, 0]; A.rsLeft[i] = 1;
      for (let q = 0; q < 8; q++) S.parts.push({ k: 'puff', x: r[1] + rnd(-6, 6), y: r[2] + rnd(-6, 6), vx: rnd(-30, 30), vy: rnd(-30, 30), life: rnd(300, 560), max: 560, r: rnd(3, 6) });
    });
    try { S.ctx.sound.place(); } catch (e) {}
  }
  function startScore(A) {
    A.scored = true; S.zoneFlash = 1;
    const c = S.ctx, pt = A.pt || [0, 0];
    [0, 1].forEach(sd => { if (pt[sd]) S.parts.push({ k: 'word', x: (sd ? -1 : 1) * 38, y: (sd ? -1 : 1) * 62, z: 40, text: '+' + pt[sd], life: 1500, max: 1500, sz: 1.3, rot: 0, c: c.players[sd].color }); });
    if (pt[0] || pt[1]) { try { c.sound[pt[c.me] >= pt[1 - c.me] ? 'good' : 'bad'](); } catch (e) {} }
  }
  // the chain after the slide: shrink (Sumo) -> swap (roulette) -> respawn (hill / hockey) -> score (hill) -> end
  function enter(A, ph) {
    A.phase = ph; A.t = 0;
    if (ph === 'swap') startSwap(A); else if (ph === 'respawn') startRespawn(A); else if (ph === 'score') startScore(A);
  }
  function nextAfter(A, from) {
    const order = ['slide', 'shrink', 'swap', 'respawn', 'score'];
    for (let k = order.indexOf(from) + 1; k < order.length; k++) {
      const ph = order[k];
      if ((ph === 'shrink' && A.doShrink) || (ph === 'swap' && A.doSwap) || (ph === 'respawn' && A.rs.length) || (ph === 'score' && A.pt)) return ph;
    }
    return 'end';
  }
  function framePos(A) {
    const F = A.sim.frames, f = Math.min(F.length - 1, A.simT * 60), i0 = Math.floor(f), i1 = Math.min(F.length - 1, i0 + 1), a = f - i0;
    for (let i = 0; i < A.pos.length; i++) {
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
        while (A.gi < A.sim.got.length && A.sim.got[A.gi].step <= stepNow) onGrab(A, A.sim.got[A.gi++]);
        while (A.si < A.sim.shields.length && A.sim.shields[A.si].step <= stepNow) onShield(A, A.sim.shields[A.si++]);
        while (A.ei < A.sim.ev.length && A.sim.ev[A.ei].step <= stepNow) { const e = A.sim.ev[A.ei++]; if (e.k === 'goal') onGoal(A, e); }
        framePos(A);
        if (A.goalT >= 0) A.goalT += adt * rate;
        const falling = stepFalls(A, adt * rate);
        if (A.simT >= A.simEnd && !falling && !(A.goalT >= 0 && A.goalT < GOAL_HOLD)) enter(A, nextAfter(A, 'slide'));   // a goal gets a beat to land
      } else if (A.phase === 'shrink') {
        A.t += adt;
        if (!A.broken && A.t >= CRACK_MS) breakIce(A);
        A.chunks.forEach(ch => { ch.t += adt; });
        if (A.broken) A.sv.forEach(q => { const f = A.svFrom[q[0]], u = Math.min(1, (A.t - CRACK_MS) / 420), e = 1 - (1 - u) * (1 - u); if (!f) return; A.pos[q[0]][0] = f[0] + (q[1] - f[0]) * e; A.pos[q[0]][1] = f[1] + (q[2] - f[1]) * e; A.hop[q[0]] = S.calm || u >= 1 ? 0 : Math.sin(Math.PI * u) * 24; });
        const falling = stepFalls(A, adt);
        if (A.t >= SHRINK_MS && !falling) enter(A, nextAfter(A, 'shrink'));
      } else if (A.phase === 'swap') {
        A.t += adt; A.sw.t = A.t;
        const u = Math.min(1, A.t / SWAP_MS), e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
        A.res.rg.forEach((q, i) => { if (!A.res.fin[i][2]) return; const f = A.from[i]; A.pos[i][0] = f[0] + (q[0] - f[0]) * e; A.pos[i][1] = f[1] + (q[1] - f[1]) * e; A.hop[i] = S.calm ? 0 : Math.sin(Math.PI * u) * 26; A.vel[i][0] = 0; A.vel[i][1] = 0; });
        if (A.t >= SWAP_MS) enter(A, nextAfter(A, 'swap'));
      } else if (A.phase === 'respawn') {
        A.t += adt;
        const u = Math.min(1, A.t / RS_MS), e = 1 - (1 - u) * (1 - u);
        A.rs.forEach(r => { A.hop[r[0]] = S.calm ? 0 : (1 - e) * 64; });
        if (A.t >= RS_MS) { A.rs.forEach(r => { A.hop[r[0]] = 0; delete A.rsLeft[r[0]]; }); enter(A, nextAfter(A, 'respawn')); }
      } else if (A.phase === 'score') {
        A.t += adt;
        if (A.t >= SCORE_MS) A.phase = 'end';
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
    S.zoneFlash *= Math.pow(.93, dt / 16.7); if (S.zoneFlash < .03) S.zoneFlash = 0;
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
    const nxt = SW || setup || st.mode !== 'sumo' ? null : !A ? (st.roulette || st.over ? null : geoOf(st.arena, st, 1)) : (A.phase === 'shrink' && !A.broken ? A.geoB : null);
    // things on the water BEHIND the ice first (the ice hides them), the ones in front after it
    const far = (x, y) => S.flip * y < 0;
    drawHats(g, true); drawParts(g, 'sea', true);
    if (A) A.chunks.forEach(ch => { if (far(ch.cx, ch.cy)) drawChunk(g, ch); });
    if (SW) drawSwap(g, SW); else { drawArena(g, geo, A, nxt); drawNets(g, geo); drawBumpers(g, geo, nxt, true); }
    if (A) A.chunks.forEach(ch => { if (!far(ch.cx, ch.cy)) drawChunk(g, ch); });
    drawHats(g, false); drawParts(g, 'sea', false);
    drawParts(g, 'ground');
    if (!SW) drawItems(g, st, A);
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
    else if (geo.id === 'rink') {                           // a rounded rectangle, wound clockwise like the circles
      const pts = [], rc = 18;
      [[HW - rc, -HL + rc, -90], [HW - rc, HL - rc, 0], [-HW + rc, HL - rc, 90], [-HW + rc, -HL + rc, 180]].forEach(([cx, cy, a0]) => { for (let q = 0; q <= 6; q++) { const a = (a0 + q * 15) * Math.PI / 180; pts.push([cx + Math.cos(a) * rc, cy + Math.sin(a) * rc]); } });
      polys.push({ pts, hole: false });
    }
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
    if (S.st && S.st.mode === 'koth') drawZone(g, z);
    if (geo.id === 'rink') drawRinkMarks(g, z);
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
  /* ---------------- King of the Hill zone, the rink, the fish, items, badges ---------------- */
  const ellip = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); };
  function zoneCount(A) {                                  // who is standing in the zone right now
    const n = [0, 0], st = S.st;
    for (let i = 0; i < 2 * NP; i++) {
      if (A) { if (A.on[i] && !A.falls[i] && inZone(A.pos[i])) n[seatOf(i)]++; }
      else if (st.pens[i][2] && inZone(st.pens[i])) n[seatOf(i)]++;
    }
    return n;
  }
  function drawZone(g, z) {
    const c = S.ctx, A = S.anim, cnt = A && A.phase === 'score' ? (A.pt || [0, 0]) : zoneCount(A);
    const col = cnt[0] > cnt[1] ? c.players[0].color : cnt[1] > cnt[0] ? c.players[1].color : '#bff0ff';
    const q = P(0, 0), rx = ZR * SC * z, ry = rx * TILT, fl = S.zoneFlash || 0, pulse = S.calm ? .5 : .5 + .5 * Math.sin(S.tick * .004);
    const gr = g.createRadialGradient(q.X, q.Y, rx * .15, q.X, q.Y, rx * 1.12);
    gr.addColorStop(0, hexA(col, .3 + .16 * pulse + fl * .35)); gr.addColorStop(1, hexA(col, 0));
    g.save(); g.fillStyle = gr; ellipse2(g, q.X, q.Y, rx * 1.12, ry * 1.12); g.fill();
    g.lineWidth = 2.4 * z; g.strokeStyle = hexA(col, .72 + .28 * pulse); ellipse2(g, q.X, q.Y, rx, ry); g.stroke();
    g.setLineDash([6, 9]); g.lineDashOffset = S.calm ? 0 : -S.tick * .02; g.lineWidth = 1.4 * z; g.strokeStyle = hexA(col, .55); ellipse2(g, q.X, q.Y, rx * .68, ry * .68); g.stroke(); g.setLineDash([]);
    g.fillStyle = hexA(col, .55 + fl * .4); g.font = '800 ' + Math.round(11 * z) + 'px Orbitron, "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HILL', q.X, q.Y);
    g.restore();
  }
  const ellipse2 = (g, x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); };
  // centre line + circle, creases and coloured goal mouths (a goal is painted in the colour of whoever DEFENDS it)
  function drawRinkMarks(g, z) {
    const c = S.ctx, pl = (x, y) => { const q = P(x, y); return [q.X, q.Y]; }, line = (a, b, col, w) => { const A = pl(a[0], a[1]), B = pl(b[0], b[1]); g.strokeStyle = col; g.lineWidth = w * z; g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); };
    g.save(); g.lineCap = 'round';
    line([-HW, 0], [HW, 0], 'rgba(200,60,80,.5)', 2.4);
    g.strokeStyle = 'rgba(60,120,210,.5)'; g.lineWidth = 2 * z; g.beginPath();
    for (let k = 0; k <= 72; k += 2) { const u = UV[k % 72], q = P(u[0] * 52, u[1] * 52); k ? g.lineTo(q.X, q.Y) : g.moveTo(q.X, q.Y); } g.stroke();
    [1, -1].forEach(sg => {                                // crease arcs in front of each goal
      g.strokeStyle = 'rgba(60,120,210,.45)'; g.lineWidth = 1.8 * z; g.beginPath();
      for (let k = 0; k <= 18; k++) { const a = k / 18 * Math.PI, q = P(Math.cos(a) * (GW + 12), sg * HL - sg * Math.sin(a) * (GW + 12)); k ? g.lineTo(q.X, q.Y) : g.moveTo(q.X, q.Y); } g.stroke();
    });
    [0, 1].forEach(sd => { const y = sd === 0 ? HL : -HL; line([-GW, y], [GW, y], hexA(c.players[sd].color, .95), 4.2); });
    // the rim the fish bounces off (the goal mouths are open)
    const edge = 'rgba(255,255,255,.85)';
    line([-HW + 3, -HL + 3], [-HW + 3, HL - 3], edge, 3); line([HW - 3, -HL + 3], [HW - 3, HL - 3], edge, 3);
    [1, -1].forEach(sg => { line([-HW + 3, sg * (HL - 3)], [-GW, sg * (HL - 3)], edge, 3); line([GW, sg * (HL - 3)], [HW - 3, sg * (HL - 3)], edge, 3); });
    g.restore();
  }
  // goal nets just beyond the ends of the rink, at the waterline
  function drawNets(g, geo) {
    if (!geo || geo.id !== 'rink') return;
    const c = S.ctx, z = S.cam.z, D = 46;
    [0, 1].forEach(sd => {
      const y0 = sd === 0 ? HL : -HL, y1 = y0 + (sd === 0 ? D : -D), col = c.players[sd].color;
      const pt = (x, y, up) => { const q = P(x, y); return [q.X, q.Y + TH * z - (up || 0) * z]; };
      const a = pt(-GW, y0), b = pt(GW, y0), cc = pt(GW, y1), d = pt(-GW, y1);
      g.save();
      g.fillStyle = 'rgba(4,18,42,.6)'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(cc[0], cc[1]); g.lineTo(d[0], d[1]); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(235,248,255,.38)'; g.lineWidth = 1; g.beginPath();
      for (let k = 1; k < 6; k++) { const t = k / 6, p0 = pt(-GW + 2 * GW * t, y0), p1 = pt(-GW + 2 * GW * t, y1); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); }
      for (let k = 1; k < 4; k++) { const t = k / 4, p0 = pt(-GW, y0 + (y1 - y0) * t), p1 = pt(GW, y0 + (y1 - y0) * t); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); }
      g.stroke();
      g.strokeStyle = col; g.lineWidth = 3 * z; g.lineCap = 'round'; g.beginPath(); g.moveTo(d[0], d[1]); g.lineTo(cc[0], cc[1]); g.moveTo(a[0], a[1]); g.lineTo(d[0], d[1]); g.moveTo(b[0], b[1]); g.lineTo(cc[0], cc[1]); g.stroke();
      [[-GW, y0], [GW, y0]].forEach(([x, y]) => { const f = pt(x, y), t = pt(x, y, 16); g.strokeStyle = '#ffffff'; g.lineWidth = 3.4 * z; g.beginPath(); g.moveTo(f[0], f[1]); g.lineTo(t[0], t[1]); g.stroke(); g.strokeStyle = col; g.lineWidth = 1.6 * z; g.stroke(); });
      g.restore();
    });
  }
  // the items on the ice this round (mine to plan around); a replay shows the ones grabbed vanishing
  function itemList(st, A) {
    if (A) return A.items;
    if (st.phase !== 'play' || !st.pw) return [];
    const key = st.mid + ':' + st.round + ':' + st.arena + ':' + st.pens.map(p => p[2] ? p[0] + ',' + p[1] : 'x').join(';');
    if (S.items.key !== key) S.items = { key, list: itemsFor(st, geoOf(st.arena, st, 0)).map(it => ({ k: it[0], x: it[1], y: it[2], gone: -1 })) };
    return S.items.list;
  }
  function drawItems(g, st, A) {
    const list = itemList(st, A), z = S.cam.z;
    S.frameItems = 0;                                      // instrumented: how many items this frame drew
    list.forEach((it, n) => {
      const age = it.gone < 0 ? 0 : S.tick - it.gone; if (it.gone >= 0 && age > 260) return;
      S.frameItems++;
      const K2 = IK[it.k], q = P(it.x, it.y), bob = S.calm || it.gone >= 0 ? 0 : Math.sin(S.tick * .004 + n * 2) * 2.4, sc = it.gone >= 0 ? 1 + age / 260 * .6 : 1, al = it.gone >= 0 ? 1 - age / 260 : 1;
      const r = 13 * q.s * sc, Y = q.Y - 13 * q.s - bob;
      g.save(); g.globalAlpha = al;
      g.fillStyle = 'rgba(20,70,110,.28)'; ellipse2(g, q.X, q.Y, 11 * q.s, 4 * q.s); g.fill();
      const pulse = S.calm ? .5 : .5 + .5 * Math.sin(S.tick * .005 + n);
      g.strokeStyle = hexA(K2.col, .35 + .4 * pulse); g.lineWidth = 1.6 * z; ellipse2(g, q.X, q.Y, (15 + 3 * pulse) * q.s, (5.6 + 1.2 * pulse) * q.s); g.stroke();
      g.fillStyle = '#0d2142'; g.strokeStyle = K2.col; g.lineWidth = 2 * q.s; ellipse2(g, q.X, Y, r, r); g.fill(); g.stroke();
      g.font = Math.round(14 * q.s * sc) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(K2.ico, q.X, Y + .5);
      g.restore();
    });
  }
  // a small badge over a penguin: which power-up is active on it this round
  function drawBadge(g, X, Y, s, kind) {
    const K2 = IK[kind], r = 8.4 * s;
    g.save(); g.fillStyle = '#0d2142'; g.strokeStyle = K2.col; g.lineWidth = 1.6 * s; ellipse2(g, X, Y, r, r); g.fill(); g.stroke();
    g.font = Math.round(10.5 * s) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(K2.ico, X, Y + .5);
    g.restore();
  }
  function drawFish(g, X, Y, s, ang, al) {
    const sx = Math.cos(ang) < 0 ? -1 : 1;
    g.save(); g.globalAlpha = al; g.translate(X, Y - 7 * s); g.scale(s * sx, s); g.rotate(sx < 0 ? Math.PI - ang : ang);
    const bg = g.createLinearGradient(0, -9, 0, 9); bg.addColorStop(0, '#ffc45a'); bg.addColorStop(1, '#ff6f3c');
    g.fillStyle = bg; g.beginPath(); g.ellipse(0, 0, 16, 9, 0, 0, 7); g.fill();
    g.fillStyle = '#ff6f3c'; g.beginPath(); g.moveTo(-13, 0); g.lineTo(-25, -9); g.lineTo(-22, 0); g.lineTo(-25, 9); g.closePath(); g.fill();   // tail
    g.beginPath(); g.moveTo(-3, -8); g.lineTo(3, -15); g.lineTo(9, -7); g.closePath(); g.fill();                                        // fin
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(-1, 3.4, 10, 3.2, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(160,50,20,.55)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-5, -7); g.quadraticCurveTo(-8, 0, -5, 7); g.moveTo(3, -8); g.quadraticCurveTo(0, 0, 3, 8); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(9, -2, 3.1, 0, 7); g.fill(); g.fillStyle = '#15102a'; g.beginPath(); g.arc(9.8, -2, 1.5, 0, 7); g.fill();
    g.strokeStyle = 'rgba(120,30,10,.6)'; g.lineWidth = 1.2; g.beginPath(); g.arc(13, 2.2, 2.6, .2, 1.4); g.stroke();
    g.restore();
  }
  // where the fish is now: a replay's own position, the state's otherwise (setup: the middle)
  function fishState(st, A) {
    if (st.mode !== 'hockey') return null;
    if (A) {
      const i = 2 * NP, hide = A.goalT > 420;
      if (hide) return null;
      const v = A.vel[i]; let sp = Math.hypot(v[0], v[1]);
      if (sp > 25) S.fishAng = Math.atan2(S.flip * v[1] * TILT, S.flip * v[0]);
      return { x: A.pos[i][0], y: A.pos[i][1], vx: v[0], vy: v[1] };
    }
    const f = st.phase === 'setup' ? [0, 0] : st.fish;
    return { x: f[0], y: f[1], vx: 0, vy: 0 };
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
      return { x: A.pos[i][0], y: A.pos[i][1], z: A.hop[i] || 0, vx: A.vel[i][0], vy: A.vel[i][1], a: A.rsLeft[i] ? Math.min(1, A.t / 260) : 1 };
    }
    if (S.sw && S.sw.from) {                               // preview / entry swap: hop from the old slot to the new one
      const u = swapU(S.sw), f = S.sw.from[i], t = S.sw.to[i];
      if (f && t && (st.phase === 'setup' || st.pens[i][2])) { const q = swapPos(S.sw, i); return { x: q[0], y: q[1], z: S.calm ? 0 : Math.sin(Math.PI * u) * 26, vx: 0, vy: 0 }; }
    }
    if (st.phase === 'setup') { const p = S.prePos && S.prePos[i]; return p ? { x: p[0], y: p[1], z: 0, vx: 0, vy: 0 } : null; }
    const p = st.pens[i]; if (!p || !p[2]) return null;
    return { x: p[0], y: p[1], z: 0, vx: 0, vy: 0 };
  }
  // a penguin's type as drawn: in the squad phase only MY picks show (a foe's squad is never read until the reveal)
  function typeAt(st, i) {
    if (st.phase === 'squad') return seatOf(i) === S.ctx.me ? sqDraft(st).v[i % NP] | 0 : 0;
    return tyOf(st)[i] | 0;
  }
  const efAt = (st, A, i) => st.phase !== 'play' ? 0 : A ? (A.ef[i] | 0) : (st.ef[i] | 0);
  function drawPenguins(g, st, A) {
    const list = [], c = S.ctx, me = c.me, planning = canPlan(), mineV = !A ? myArrows(st, me) : null;
    for (let i = 0; i < 2 * NP; i++) { const ps = penState(i, st, A); if (ps) { ps.i = i; ps.q = P(ps.x, ps.y); list.push(ps); } }
    const fp = fishState(st, A); if (fp) list.push({ fish: true, i: -1, x: fp.x, y: fp.y, z: 0, vx: fp.vx, vy: fp.vy, q: P(fp.x, fp.y), a: A && A.goalT > 160 ? 1 - (A.goalT - 160) / 260 : 1 });
    S.frameTypes = []; S.frameEf = [];
    // the partner's "thinking…/READY" bubble floats over one of their standing penguins
    let anchor = -1;
    if (!A && c.status === 'active' && st.phase !== 'setup') [1, 2, 0, 3].some(k => { const i = (1 - me) * NP + k; if (st.pens[i][2]) { anchor = i; return true; } return false; });
    const sqPhase = st.phase === 'squad';
    list.sort((a, b) => a.q.Y - b.q.Y);
    // shadows + team rings first (on the ice)
    list.forEach(p => {
      if (p.fish) { const q = p.q; g.fillStyle = 'rgba(20,70,110,.3)'; ellipse2(g, q.X + 2 * q.s, q.Y + 1 * q.s, 15 * q.s, 4.6 * q.s); g.fill(); return; }
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
      if (p.fish) { drawFish(g, p.q.X, p.q.Y - p.z * S.cam.z, p.q.s, S.fishAng, p.a); return; }
      const i = p.i, seat = i < NP ? 0 : 1, col = c.players[seat].color, pv = S.pv[i], q = p.q;
      const sp = Math.hypot(p.vx, p.vy), svx = S.flip * p.vx, svy = S.flip * p.vy * TILT;
      const ty = typeAt(st, i), ef = efAt(st, A, i);
      S.frameTypes[i] = ty; S.frameEf[i] = ef;             // instrumented: tests check that a squad is never drawn before the reveal
      const o = { lean: 0, look: pv.look, back: false, flap: .12 + .06 * Math.sin(S.tick * .004 + pv.ph), blink: pv.blink > 0, dizzy: pv.dizzy > 0, scared: false, sq: pv.sq, hat: true, lift: 0, ty, ef };
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
      let alpha = (p.a != null ? p.a : 1) * (sqPhase && seat !== me ? .5 : 1), clipY = null;   // squad pick: the partner's line is a ghost (their types are unknown)
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
      if (ef && !p.fall) {
        const rr0 = TYPES[ty].r / PR;
        if (ef === 2) { g.save(); g.globalAlpha = alpha * (S.calm ? .7 : .55 + .25 * Math.sin(S.tick * .006 + i)); g.strokeStyle = '#8ff0ff'; g.lineWidth = 1.8 * q.s; g.fillStyle = 'rgba(140,240,255,.12)'; ellipse2(g, X, Y - 20 * q.s * rr0, 20 * q.s * rr0, 25 * q.s * rr0); g.fill(); g.stroke(); g.restore(); }
        drawBadge(g, X + 13 * q.s * rr0, Y - 41 * q.s * rr0, q.s, ef);
      }
      if (i === anchor) drawThought(g, X, Y - 50 * q.s, sqPhase ? !!sqOf(st, seat) : !!aimsOf(st, seat), col);
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
    const ty = o.ty | 0, T = TYPES[ty] || TYPES[0], chick = ty === 3;
    const body = chick ? '#6f7b8c' : darken(col, .62), bodyHi = chick ? '#b4bfcd' : darken(col, .3), rim = col;
    s *= 1.08 * (T.r / PR) * (o.ef === 1 ? 1.08 : 1);
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
      if (ty === 1) { const ng = g.createLinearGradient(0, -21, 0, -15); ng.addColorStop(0, '#ffd45a'); ng.addColorStop(1, 'rgba(255,190,60,0)'); g.fillStyle = ng; g.beginPath(); g.ellipse(lx * .95, -17.6, 6.4, 3.8, 0, 0, 7); g.fill(); }   // Emperor: the golden collar
      if (ty === 2) { g.strokeStyle = '#ffd23a'; g.lineCap = 'round'; g.lineWidth = 1.7; [-1, 1].forEach(sd => { for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(lx + sd * 4.6, -27.4); g.quadraticCurveTo(lx + sd * (8 + k * 2.6), -30 - k * 1.3, lx + sd * (11.5 + k * 2.8), -29.4 - k * 3); g.stroke(); } }); }   // Rockhopper: the yellow crest
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
    if (chick) { g.fillStyle = 'rgba(230,236,245,.85)'; [-5, -1.2, 3.4].forEach((dx, k) => { g.beginPath(); g.arc(dx + lx * .3, -34 + (k % 2), 2.4, Math.PI, 0); g.fill(); }); }   // Chick: a fluffy tuft
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
  // the score as it stood BEFORE the round being replayed, until the goal / the scoring beat shows it
  function hudPts(st, A) {
    const p = st.pts.slice();
    if (A && A.md === 'koth' && !A.scored && A.pt) { p[0] -= A.pt[0]; p[1] -= A.pt[1]; }
    if (A && A.md === 'hockey' && A.gl != null && !A.goalSeen) p[A.gl]--;
    return p;
  }
  function drawHud(g, st, A) {
    const c = S.ctx, round = A ? A.res.r : st.round, fin = c.status === 'finished' && !A, cap = maxRounds(st);
    const setup = st.phase === 'setup', sqp = st.phase === 'squad', hot = !setup && !sqp && round >= cap && !fin;
    const label = setup ? 'MATCH SETUP' : sqp ? 'PICK YOUR SQUAD' : fin ? 'FINAL' : (round >= cap ? 'LAST ROUND' : `ROUND ${round}/${cap}`);
    g.font = '800 10.5px Orbitron, "Chakra Petch", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    const w = g.measureText(label).width + 20;
    g.fillStyle = 'rgba(4,10,24,.62)'; rr(g, 10, 10, w, 22, 11); g.fill();
    g.strokeStyle = hot ? 'rgba(255,214,107,.7)' : 'rgba(160,220,255,.25)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = hot ? '#ffd66b' : '#dff4ff'; g.fillText(label, 20, 21.5);
    // which arena (and roulette), as a second, smaller pill
    const aid = A ? A.geoA.id : (setup ? (S.sw ? S.sw.toId : S.pre.id) : st.arena), hg = A ? A.geo : curGeo();
    const aname = setup && st.arena === 'surprise' ? 'SURPRISE ME' : st.mode === 'hockey' ? 'FISH HOCKEY' : (st.mode === 'koth' ? 'HILL · ' : '') + arenaName(aid || 'floe').toUpperCase(), rl = st.roulette ? ' + ROULETTE' : '';
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
    // penguins left (Sumo), goals (Fish Hockey: first to 3) or points (King of the Hill), per side
    if (!setup && !sqp) {
      const pts = hudPts(st, A);
      [0, 1].forEach(s => {
        const pens = A ? A.res.init : st.pens, n = aliveCount(pens, s), col = c.players[s].color, x0 = VW - 14 - (s === 0 ? 62 : 0);
        if (st.mode === 'sumo') for (let k = 0; k < NP; k++) { g.fillStyle = k < n ? col : 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(x0 - k * 11, 21, 3.6, 0, 7); g.fill(); }
        else if (st.mode === 'hockey') for (let k = 0; k < GOAL_TO; k++) { g.fillStyle = k < pts[s] ? col : 'rgba(255,255,255,.14)'; g.beginPath(); g.arc(x0 - k * 13, 21, 4.6, 0, 7); g.fill(); if (k < pts[s]) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.stroke(); } }
        else { g.fillStyle = 'rgba(4,10,24,.62)'; rr(g, x0 - 32, 9, 38, 24, 12); g.fill(); g.strokeStyle = hexA(col, .65); g.lineWidth = 1.2; g.stroke(); g.fillStyle = col; g.font = '900 14px Orbitron, "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.fillText(String(pts[s]), x0 - 13, 21.5); g.textAlign = 'left'; g.font = '800 10.5px Orbitron, "Chakra Petch", sans-serif'; }
      });
    }
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
  // a penguin portrait; the type changes the silhouette (size, colour, collar, crest)
  const PSC = [.92, 1.06, .86, .66];
  const penSvg = (col, ty) => {
    ty |= 0; const chick = ty === 3, body = chick ? '#6f7b8c' : darken(col, .6), sc = PSC[ty] || .92;
    return `<svg viewBox="0 0 24 30" aria-hidden="true"><ellipse cx="12" cy="28.6" rx="${7 * sc + 1}" ry="1.4" fill="rgba(0,0,0,.35)"/><g transform="translate(12 28.4) scale(${sc}) translate(-12 -28.4)">
    <path d="M12 6.5c5.6 0 8.2 6.8 8 12.6C19.8 25 16.3 28 12 28s-7.8-3-8-8.9C3.8 13.3 6.4 6.5 12 6.5z" fill="${body}" stroke="${col}" stroke-width=".8"/>
    <ellipse cx="12" cy="20" rx="5.3" ry="6.8" fill="#fff"/><ellipse cx="12" cy="13.8" rx="4.9" ry="3.5" fill="#fff"/>${ty === 1 ? '<ellipse cx="12" cy="16.9" rx="4.3" ry="1.9" fill="#ffcf4a"/>' : ''}
    <circle cx="9.8" cy="13.4" r="1.05" fill="#15102a"/><circle cx="14.2" cy="13.4" r="1.05" fill="#15102a"/>
    <path d="M10.3 15.3h3.4L12 17.6z" fill="#ffae33"/>${ty === 2 ? '<path d="M6.3 11.4L2.6 10M6.5 12.6L2.2 13M17.7 11.4L21.4 10M17.5 12.6L21.8 13" stroke="#ffd23a" stroke-width="1.3" stroke-linecap="round" fill="none"/>' : ''}<path d="M5.8 10.6a6.2 6.2 0 0112.4 0z" fill="${col}"/>
    <rect x="5.2" y="9.6" width="13.6" height="2.6" rx="1.3" fill="#f4fbff"/><circle cx="12" cy="3.9" r="2.1" fill="#fff"/></g></svg>`;
  };
  const TSHORT = ['', 'EMP', 'ROC', 'CHK'];
  const statPips = (lab, n) => `<div class="ko-st">${lab}<span>${[1, 2, 3, 4, 5].map(k => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span></div>`;
  function updateUI() {
    const u = S.ui, c = S.ctx; if (!u || !c || !S.st) return;
    const st = S.st, me = c.me, live = canPlan(), v = S.anim ? [null, null, null, null] : myArrows(st, me);
    const shown = S.anim ? S.anim.res.init : st.pens;      // mid-replay: no spoilers
    let n = 0;
    u.pens.forEach((b, k) => {
      const i = me * NP + k, alive = !!shown[i][2], ef = efAt(st, S.anim, i), anch = ef === 4, d = anch ? null : v[k];
      if (d && alive) n++;
      b.className = 'ko-pen' + (!alive ? ' dead' : '') + (anch ? ' anch' : '') + (S.sel === k && live ? ' sel' : '');
      b.disabled = !live || !alive || anch;
      b.querySelector('.tag').textContent = alive && d ? '➚' : '';
      b.querySelector('.ef').textContent = alive && ef ? IK[ef].ico : '';
      b.querySelector('.pw i').style.width = alive && d ? Math.round(Math.hypot(d[0], d[1]) / (MAXA * capOfPen(st, i)) * 100) + '%' : '0';
    });
    const alive = aliveCount(shown, me) - [0, 1, 2, 3].filter(k => shown[me * NP + k][2] && efAt(st, S.anim, me * NP + k) === 4).length;   // anchored penguins have nothing to aim
    u.clear.disabled = !live || !n;
    u.clear.textContent = live && S.sel != null && v[S.sel] ? '↺ Clear this' : '↺ Clear all';
    u.ready.disabled = !live;
    u.ready.classList.toggle('go', live);
    u.ready.textContent = live ? `READY ✓ · ${n}/${alive} aimed` : (c.status === 'finished' ? 'MATCH OVER' : S.anim ? 'SLIDING…' : 'LOCKED IN ✓');
    kick();
  }
  function arenaHint(st) {
    if (st.roulette) return 'everyone regroups on a new arena after this round';
    if (st.arena === 'twin' && st.round > 3) return ARENAS[0].hint;
    if (st.arena === 'twin' && st.round === 3) return 'the bridge cracks after this round';
    return (ARENAS.find(a => a.id === st.arena) || ARENAS[0]).hint;
  }
  const modeHint = st => st.mode === 'koth' ? 'be inside the <b>glowing zone</b> when everything stops: each penguin of yours in it scores <b>1</b>' + (st.arena === 'current' ? '. The current drags everything the way the badge points' : '')
    : st.mode === 'hockey' ? `knock the fish through the <b>far goal</b> (first to ${GOAL_TO}). It bounces off the rim, penguins don\u2019t`
    : arenaHint(st);
  function hintHtml(ctx, st) {
    const me = ctx.me, foe = 1 - me, fn = ctx.players[foe].name, cap = maxRounds(st);
    if (ctx.status === 'finished') {
      if (st.mode === 'sumo') { const l = [aliveCount(st.pens, 0), aliveCount(st.pens, 1)]; return `Final: <b>${l[0]} – ${l[1]}</b> penguins left`; }
      return `Final: <b>${st.pts[0]} – ${st.pts[1]}</b> ${st.mode === 'hockey' ? 'goals' : 'points'}`;
    }
    if (S.anim) return 'Here they go… 🐧💨';
    const a = aimsOf(st, me);
    if (a && a.skip) return `⏱ Time ran out. Your penguins sit this round out`;
    if (submitted(st, me)) return aimsOf(st, foe) ? 'Both locked in. Launching…' : `Locked in ✓ Waiting for <b>${fn}</b>…`;
    const last = st.round >= cap ? '<b>Last round!</b> · ' : `Round <b>${st.round}</b>/${cap} · `;
    const notes = [];
    const anch = [0, 1, 2, 3].filter(k => st.pens[me * NP + k][2] && st.ef[me * NP + k] === 4);
    if (anch.length) notes.push(`⚓ Penguin ${anch[0] + 1} is anchored this round: it can\u2019t move or launch`);
    const mine = [0, 1, 2, 3].filter(k => st.pens[me * NP + k][2] && st.ef[me * NP + k] && st.ef[me * NP + k] !== 4);
    if (mine.length) notes.push(`${IK[st.ef[me * NP + mine[0]]].ico} ${IK[st.ef[me * NP + mine[0]]].name} is on penguin ${mine[0] + 1}: ${IK[st.ef[me * NP + mine[0]]].txt}`);
    if (!notes.length && st.pw && itemList(st, null).length) notes.push('Slide over a power-up to grab it. It works <b>next</b> round');
    return `${last}Drag from a penguin to aim · drag back onto it to cancel · ${modeHint(st)}${notes.length ? '<br>' + notes.join('<br>') : ''}`;
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
    } else if (id === 'rink') {
      b = `<rect x="29" y="6" width="42" height="52" rx="6" fill="${ice}" stroke="${edge}" stroke-width="1.2"/><path d="M29 32h42" stroke="#d04a64" stroke-width="1.3"/><circle cx="50" cy="32" r="8" fill="none" stroke="#3a7ab0" stroke-width="1.2"/><path d="M40 6h20M40 58h20" stroke="#ff9d2e" stroke-width="3.4" stroke-linecap="round"/><ellipse cx="50" cy="32" rx="5" ry="2.8" fill="#ff8a3d"/><path d="M45.5 32l-3.2-2.4v4.8z" fill="#ff8a3d"/>`;
    } else b = `<circle cx="50" cy="32" r="22" fill="none" stroke="#7fd8ff" stroke-width="1.4" stroke-dasharray="4 4"/><text x="50" y="43" text-anchor="middle" font-family="Orbitron,sans-serif" font-weight="800" font-size="30" fill="#7fd8ff">?</text>`;
    return `<svg viewBox="0 0 100 64" aria-hidden="true"><rect width="100" height="64" fill="#0a2240"/><rect y="40" width="100" height="24" fill="#071a33"/>${b}</svg>`;
  }
  // everything the host changes is one committed state write; the partner's phone just repaints from it
  function setupPick(ctx, patch) {
    const st = S.st; if (!st || st.phase !== 'setup' || ctx.status !== 'active' || ctx.me !== st.host || S.starting) return;
    const n = norm(ctx.clone(ctx.state)); Object.assign(n, patch); n.n = (n.n || 0) + 1;
    if (n.oldc === ctx.me) delete n.oldc;
    try { ctx.sound.tap(); } catch (e) {}
    ctx.commit(seal(n));
  }
  // the pick becomes the rules. "Surprise me" is drawn here (seeded by the match id) so both phones agree.
  // setup → SQUAD PICK (both players choose 4 penguins in secret) → round 1
  function beginMatch(st, turnTo) {
    st.arena = st.arena === 'surprise' ? surpriseArena(st.mid, st.mode) : st.arena;
    if (!V3(st)) {                                       // 'knockout' (legacy): straight into round 1, exactly as v78
      st.phase = 'play'; st.pens = startPens(st.arena); st.aims = {}; st.round = 1; st.R = R_START; st.turn = turnTo; st.n = (st.n || 0) + 1;
      return st;
    }
    st.phase = 'squad'; st.pens = startPens(st.arena); st.aims = {}; st.sqs = {}; st.round = 1; st.R = R_START; st.turn = turnTo; st.n = (st.n || 0) + 1;
    return cfgSync(st);
  }
  function startMatch(ctx) {
    const st = S.st; if (!st || st.phase !== 'setup' || ctx.status !== 'active' || ctx.me !== st.host || S.starting) return;
    S.starting = st.mid;
    const n = beginMatch(norm(ctx.clone(ctx.state)), st.turn === 1 ? 0 : 1);   // turn changes → a fresh clock for round 1
    try { ctx.sound.place(); } catch (e) {}
    ctx.commit(seal(n));
  }
  // switching mode keeps the arena when the new mode offers it, otherwise falls back to that mode's first one
  function modePatch(st, m) {
    const sup = ARENA_SETS[m], keep = sup.indexOf(st.arena) >= 0 || (st.arena === 'surprise' && m !== 'hockey');
    return { mode: m, arena: keep ? st.arena : sup[0], roulette: m === 'sumo' ? st.roulette : 0 };
  }
  const MODES = [['sumo', 'Sumo', 'Last side standing', 'Both sides push. The last side with penguins wins.'],
    ['koth', 'King of the Hill', 'Hold the middle', 'A glowing zone in the centre. After each round, every penguin of yours inside it scores 1. The ice does not shrink and the fallen come back. Most points after 8 rounds wins.'],
    ['hockey', 'Fish Hockey', 'Fish in the goal', 'Knock the fish into your partner\u2019s goal. First to 3 wins. After 10 rounds, most goals wins; if level, whoever has the fish in the partner\u2019s half. The fallen come back.']];
  function renderSetup(ctx, st, wrap) {
    const me = ctx.me, hs = st.host === 1 ? 1 : 0, isHost = me === hs, hn = ctx.players[hs].name, live = ctx.status === 'active';
    S.ui = null; S.sel = null; S.drag = null; stepPreview(0);
    const edit = isHost && live && !S.starting, ro = edit ? '' : ' ko-ro';
    const btn = (cls, attrs, inner, fn) => ctx.h('button', Object.assign({ class: cls, type: 'button', onclick: fn }, edit || /ko-go|ko-ready/.test(cls) ? {} : { tabindex: '-1', 'aria-disabled': 'true' }, attrs), inner);
    const cur = st.arena, rc = st.roulette, md = st.mode, mdef = MODES.find(m => m[0] === md) || MODES[0], leg = !V3(st);
    const modes = MODES.map(([id, nm, sub, long]) =>
      btn('ko-mode' + ro, { 'aria-pressed': String(id === md), 'aria-label': nm + '. ' + long, 'data-id': 'mode-' + id }, [nm, ctx.h('small', {}, sub)], () => { if (id !== md) setupPick(ctx, modePatch(st, id)); }));
    const sup = ARENA_SETS[md], one = sup.length === 1;
    const cards = sup.map(id => { const a = arenaInfo(id); return btn('ko-ar' + (one ? ' wide' : '') + ro, { 'aria-pressed': String(cur === a.id), 'aria-label': a.name + '. ' + (md === 'koth' && KOTH_BLURB[id] ? KOTH_BLURB[id] : a.blurb), 'data-id': a.id },
      [ctx.h('span', { html: thumb(a.id) }), one ? ctx.h('span', {}, [a.name, ctx.h('small', {}, a.hint.charAt(0).toUpperCase() + a.hint.slice(1))]) : a.name], () => { if (cur !== a.id) setupPick(ctx, { arena: a.id }); }); });
    if (!one) cards.push(btn('ko-ar wide' + ro, { 'aria-pressed': String(cur === 'surprise'), 'aria-label': 'Surprise me. A random arena, revealed at the start.', 'data-id': 'surprise' },
      [ctx.h('span', { html: thumb('surprise') }), ctx.h('span', {}, ['Surprise me', ctx.h('small', {}, 'A random arena, revealed at the start')])], () => { if (cur !== 'surprise') setupPick(ctx, { arena: 'surprise' }); }));
    const count = ({ sumo: 'six', koth: 'four' })[md] || 'the';
    const info = cur === 'surprise' ? `<b>Surprise me</b>. Any of the ${count} arenas, drawn when the match starts.` : `<b>${esc2(arenaInfo(cur).name)}</b>. ${esc2(md === 'koth' && KOTH_BLURB[cur] ? KOTH_BLURB[cur] : arenaInfo(cur).blurb)}`;
    const desc = ctx.h('div', { class: 'ko-desc', html: (leg ? '' : `<b>${esc2(mdef[1])}</b>. ${esc2(mdef[3])}<br>`) + info + (rc ? ' Then a new arena every round.' : '') });
    const roul = md === 'sumo' ? btn('ko-roul' + ro, { role: 'switch', 'aria-checked': String(!!rc), 'data-id': 'roul' }, [ctx.h('span', {}, ['Arena roulette', ctx.h('small', {}, 'A different arena every round')]), ctx.h('i', { class: 'ko-sw' })], () => setupPick(ctx, { roulette: rc ? 0 : 1 })) : null;
    const pwr = btn('ko-roul' + ro, { role: 'switch', 'aria-checked': String(!!st.pw), 'data-id': 'pw' }, [ctx.h('span', {}, ['Power-ups', ctx.h('small', {}, 'Grab items on the ice. They work next round')]), ctx.h('i', { class: 'ko-sw' })], () => setupPick(ctx, { pw: st.pw ? 0 : 1 }));
    const go = isHost
      ? ctx.h('div', { class: 'ko-go' }, btn('ko-ready go' + (me === 1 ? ' p1' : ''), { disabled: !live || S.starting ? '' : null }, S.starting ? 'STARTING…' : 'START MATCH', () => startMatch(ctx)))
      : ctx.h('div', { class: 'ko-go' }, ctx.h('div', { class: 'ko-wait', role: 'status' }, [ctx.h('span', { class: 'ko-dots' }, [ctx.h('i'), ctx.h('i'), ctx.h('i')]), `Waiting for ${hn} to start`]));
    wrap.append(ctx.h('div', { class: 'ko-setup' },
      ctx.h('div', { class: 'ko-who', html: isHost ? `You set the rules. <b>${esc2(ctx.players[1 - me].name)}</b> sees every change live.` : `<b>${esc2(hn)}</b> is setting up the match. Their choices show here live.` }),
      ...(leg ? [] : [ctx.h('div', { class: 'ko-lab' }, 'Mode'), ctx.h('div', { class: 'ko-seg', role: 'group', 'aria-label': 'Game mode' }, modes)]),   // a 'knockout' (legacy) match: classic Sumo only
      ctx.h('div', { class: 'ko-lab' }, 'Arena'), ctx.h('div', { class: 'ko-arenas', role: 'group', 'aria-label': 'Arena' }, cards), ...[desc, roul, leg ? null : pwr, go].filter(Boolean)));   // h() would print a null child as text
    if (live) ctx.msg(isHost ? (leg ? 'Pick an arena, then start 🐧' : 'Pick a mode and an arena, then start 🐧') : `${hn} is setting up the match… 🧊`, 'var(--ink-dim)');
    const say = `${hn} chose ${leg ? '' : mdef[1] + ', '}${cur === 'surprise' ? 'Surprise me' : arenaName(cur)}${rc ? ', roulette on' : ''}${leg ? '' : ', power-ups ' + (st.pw ? 'on' : 'off')}`;   // the partner's screen reader hears the host's picks
    if (!isHost && S.lastSay !== say) { S.lastSay = say; S.live.textContent = say; }
    if (S.focusSel) { const el = wrap.querySelector(S.focusSel); if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} } }   // every sync rebuilds this DOM: keep the keyboard user where they were
    kick();
  }
  /* ---------------- squad pick: 4 penguins each, in secret; revealed together once both are locked ---------------- */
  function renderSquad(ctx, st, wrap) {
    const me = ctx.me, foe = 1 - me, fn = ctx.players[foe].name, live = ctx.status === 'active', col = ctx.players[me].color, fcol = ctx.players[foe].color;
    S.ui = null; S.sel = null; S.drag = null;
    const lv = memGet(myKey(st, me)) || (sqOf(st, me) && sqOf(st, me).v) || null, locked = !!lv, d = sqDraft(st);
    if (locked) d.v = cleanSq(lv);
    const edit = live && !locked, theirs = !!sqOf(st, foe);   // ONLY whether they are locked, never what they picked
    const pop = S.popSlot;
    const slots = d.v.map((t, k) => ctx.h('button', { class: 'ko-slot' + (pop === k ? ' pop' : ''), type: 'button', style: `--kc:${col}`, 'data-id': 'slot' + k, 'aria-pressed': String(edit && d.sel === k),
      'aria-label': `Penguin ${k + 1} of 4: ${TYPES[t].name}.` + (edit ? ' Select, then choose its type.' : ''), disabled: edit ? null : '', onclick: () => pickSlot(k) },
      [ctx.h('span', { html: penSvg(col, t) }), ctx.h('span', {}, TYPES[t].name)]));
    const rows = TYPES.map((T, t) => ctx.h('button', { class: 'ko-type', type: 'button', style: `--kc:${col}`, 'data-id': 'type' + t, 'aria-pressed': String(edit && d.v[d.sel] === t), disabled: edit ? null : '', 'aria-label': `${T.name}. ${T.blurb} Weight ${T.wt}, reach ${T.rc}, size ${T.sz}, out of 5.`, onclick: () => pickType(t) },
      [ctx.h('span', { class: 'ico', html: penSvg(col, t) }), ctx.h('span', { class: 'tx' }, [ctx.h('b', {}, T.name), ctx.h('small', {}, T.blurb)]),
        ctx.h('span', { class: 'st', html: statPips('Weight', T.wt) + statPips('Reach', T.rc) + statPips('Size', T.sz) })]));
    const go = locked || !live
      ? ctx.h('div', { class: 'ko-go' }, ctx.h('div', { class: 'ko-wait', role: 'status' }, locked ? [ctx.h('span', { class: 'ko-dots' }, [ctx.h('i'), ctx.h('i'), ctx.h('i')]), theirs ? 'Revealing both squads…' : `Locked in. Waiting for ${fn}`] : 'Squad pick is over'))
      : ctx.h('div', { class: 'ko-go' }, ctx.h('button', { class: 'ko-ready go' + (me === 1 ? ' p1' : ''), type: 'button', onclick: () => lockSquad() }, 'LOCK IN SQUAD'));
    const cls = 'ko-setup ko-sq';
    wrap.append(ctx.h('div', { class: cls, style: `--kf:${fcol}` },
      ctx.h('div', { class: 'ko-who', html: locked ? `Your squad is locked. <b>${esc2(fn)}</b> picks in secret too. You both see the squads at the same moment.` : `Pick 4 penguins in secret. <b>${esc2(fn)}</b> can\u2019t see them until you both lock in.` }),
      ctx.h('div', { class: 'ko-lab' }, 'Your squad'), ctx.h('div', { class: 'ko-slots', role: 'group', 'aria-label': 'Your four penguins' }, slots),
      ctx.h('div', { class: 'ko-lab' }, edit ? 'Pick a type for the highlighted penguin' : 'Penguin types'), ctx.h('div', { class: 'ko-types', role: 'group', 'aria-label': 'Penguin types' }, rows),
      ...(edit ? [ctx.h('button', { class: 'ko-ghost', type: 'button', 'data-id': 'rand', onclick: randomSquad }, 'Random squad')] : []),
      ctx.h('div', { class: 'ko-fs' + (theirs ? ' rdy' : ''), role: 'status' }, [ctx.h('b', {}, fn), theirs ? 'is locked in' : 'is still choosing']), go));
    if (live) ctx.msg(locked ? (theirs ? 'Both locked in. Reveal incoming 🐧' : `Waiting for ${fn} to lock in… 🧊`) : theirs ? `${fn} is locked in. Your turn to pick 🔥` : 'Pick your squad. It stays secret until you both lock in 🐧', locked ? 'var(--ink-faint)' : 'var(--gold)');
    const say = theirs ? `${fn} is locked in` : '';
    if (S.lastSay !== say) { S.lastSay = say; if (say) S.live.textContent = say; }
    if (S.focusSel) { const el = wrap.querySelector(S.focusSel); if (el) { try { el.focus({ preventScroll: true }); } catch (e) {} } }
    kick();
  }
  const esc2 = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- an older app in the match: undo its overwrite once, then wait for them to update ---------------- */
  function healOld(ctx, st) {
    let old = oldSeat(st); if (old === 2) old = 1 - ctx.me;
    if (old < 0 || old === ctx.me) return -1;              // (my own old flag clears with my first new-format move)
    const key = st.mid + ':' + st.n + ':' + old;
    if (ctx.status === 'active' && (st.hx || st.oldc !== old || st.turn !== old) && S.healKey !== key) {
      S.healKey = key;                                     // one write: the older app only writes on its player's own taps / timeouts, so this never ping-pongs
      setTimeout(() => {
        const c = S.ctx; if (!c || c.status !== 'active') return;
        const n = norm(c.clone(c.state)); let o = oldSeat(n); if (o === 2) o = 1 - c.me;
        if (o < 0 || o === c.me) return;
        n.oldc = o; n.turn = o; c.commit(seal(n));
      }, 0);
    }
    return old;
  }
  function warnOld(ctx, old) {
    if (old < 0) return;
    ctx.msg(`<b>${esc2(ctx.players[old].name)}</b> is on an older version — ask them to close and reopen the app`, '#ffd66b');
    if (S.oldWarn !== S.mid + ':' + old) { S.oldWarn = S.mid + ':' + old; try { ctx.sound.bad(); } catch (e) {} }
  }

  /* ---------------- registration ---------------- */
  /* Two registrations, one module. 'knockout2' (hidden) holds every match the new app creates: an app older than this
     version doesn't know that id, so it shows no invite and can never write to those matches. 'knockout' (visible, launches
     as 'knockout2') keeps running what already exists under the old id: old saves, matches made by an older app, and
     tournaments (their pools use the visible id) - classic Sumo, bit-identical to v78. Rules are state-driven (v >= 3). */
  const DEF = {
    id: 'knockout2', hidden: true, statsId: 'knockout', name: 'Knockout', emoji: '🐧', category: 'Arcade', accent: '#7fd8ff',
    tagline: 'Penguin sumo: six arenas, King of the Hill, Fish Hockey.',
    test: { simulate, resolveRound, norm, launches, aimsOf, realAims, nextR, startPens, cleanVec, memKey, memGet, memSet, mem, sync, ready,
      canPlan, submitted, draftFor, P, S, NP, PR, VMAX, MAXA, R_START, MAX_ROUNDS, REVEAL, FALLBACK_MS, VW, VH, TH,
      beginMatch, lostInfo, arenaD, curGeo, stepPreview, thumb, geoFor, geoOf, arenaAfter, slotsFor, surpriseArena, curSeq, icePicks, bumpOrder, ARENAS, ARENA_IDS, MAX_STEPS, UV, RT, RCT, HRT, ITW,
      beginPlay, resolveSquad, sqOf, realSq, oldSeat, seal, AK, safeSpot, fishSpot, makeBd, spawnItems, itemsFor, respawn, inZone, geoAt, maxRounds, rkOf, myKey, lockSquad, TYPES, IK, MODE_IDS, KOTH_ARENAS, ARENA_SETS, ZR, HW, HL, GW, HK_ROUNDS, GOAL_TO, IR, SPR_E,
      step: ms => { step(ms); draw(); }, draw: () => draw(), finish: () => { let n = 0; while (S.anim && n++ < 3000) step(16); draw(); } },
    // the result card waits until the last slide (and splash) has played out
    // a timeout before round 1 (match setup, squad pick) must never forfeit: nobody has played yet
    // ...and while the partner's phone runs an older app, the clock only ever skips (they can't move until they update)
    skipOnly: st => { if (!st) return false; const n = norm(JSON.parse(JSON.stringify(st))); return n.phase === 'setup' || n.phase === 'squad' || oldSeat(n) >= 0; },
    clockGrace: 5000,                                    // ~4 s replay before the next round can be planned
    resultDelay: () => S.anim ? Math.max(0, Math.round((S.anim.est - S.anim.total) / (S.speed || 1))) + 250 : 0,
    init: host => seal({
      v: 3, mid: 'k' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      host: host === 1 ? 1 : 0, turn: host === 1 ? 1 : 0, round: 1, R: R_START, pens: startPens(), aims: {}, n: 0,
      phase: 'setup', mode: 'sumo', arena: 'floe', roulette: 0, pw: 1,   // the host picks these before round 1 (`turn` = the host meanwhile)
    }),
    // timer ran out on the player still aiming: they submit "no moves" (everyone stays put);
    // in setup the host is on the clock, so the match simply starts (into the squad pick) with what is picked;
    // in the squad pick the slow player gets 4 Classic
    skipTurn: (st0, opp) => {
      const st = norm(JSON.parse(JSON.stringify(st0))), me = 1 - opp, old = oldSeat(st);
      if (st.phase === 'setup') return seal(beginMatch(st, opp));
      if (old >= 0) { if (old < 2) st.turn = old; return seal(st); }   // nobody is marked as timed out while an older app blocks the match
      if (st.phase === 'squad') {
        if (!sqOf(st, me)) st.sqs['a' + me] = { v: [0, 0, 0, 0], skip: 1 };
        if (!sqOf(st, opp)) st.turn = opp;
        return seal(st);
      }
      if (!aimsOf(st, me)) st.aims[AK(st) + me] = { r: st.round, v: [[0, 0], [0, 0], [0, 0], [0, 0]], skip: 1 };
      if (!aimsOf(st, opp)) st.turn = opp;
      return seal(st);
    },
    render(ctx) {
      S.ctx = ctx;
      const st = norm(ctx.clone(ctx.state)), me = ctx.me, foe = 1 - me;
      S.flip = me === 1 ? -1 : 1;
      ensureCanvas();
      if (st.mid !== S.mid) { S.st = st; resetScene(st); }
      S.st = st;
      const oldP = healOld(ctx, st);
      S.cv.setAttribute('aria-label', st.phase === 'setup' ? 'Preview of the match arena' : st.phase === 'squad' ? 'Your penguins on the start line' : `Knockout ${st.mode === 'koth' ? 'King of the Hill' : st.mode === 'hockey' ? 'Fish Hockey' : 'arena'}: ${arenaName(st.arena)}, round ${st.round} of ${maxRounds(st)}`);
      const wrap = ctx.h('div', { class: 'ko-wrap' });
      if (st.phase === 'setup') {                          // before round 1: mode + arena, picked by the host, watched live by the partner
        ctx.root.append(ctx.turnBar({ scores: [NP, NP] }), wrap);
        wrap.append(S.cv);
        renderSetup(ctx, st, wrap); warnOld(ctx, oldP);
        fit(); kick();
        return;
      }
      if (S.pre.id || S.prePos) {                          // came from the setup preview: cross-fade it into round 1's arena
        if (S.pre.id && S.pre.id !== st.arena && !S.sw) S.sw = { ga: geoFor(S.pre.id, 0, st.mid, R_START), gb: geoFor(st.arena, 0, st.mid, R_START), t: S.calm ? ENTRY_MS * .7 : 0, dur: ENTRY_MS, from: S.prePos || slotPos(S.pre.id, st.mid), to: st.pens.map(q => [q[0], q[1]]), toId: st.arena, entry: true };
        S.pre.id = null; S.prePos = null;
      }
      S.starting = '';
      if (st.phase === 'squad') {                          // both pick in secret; the resolver reveals both at once
        scheduleSync(st, ctx);
        ctx.root.append(ctx.turnBar({ scores: st.mode === 'sumo' ? [NP, NP] : [0, 0] }), wrap);
        wrap.append(S.cv);
        renderSquad(ctx, st, wrap); warnOld(ctx, oldP);
        fit(); kick();
        return;
      }
      S.focusSel = '';
      const reveal = st.phase === 'play' && st.sqby != null && st.round === 1 && !st.res && !S.done.has(st.mid + ':sq');   // only the squad-pick -> round 1 hand-over
      if (reveal) {                                        // the squads just became visible to both phones: one pop for every penguin
        doneAdd(st.mid + ':sq');
        S.pv.forEach(pv => { pv.sq = S.calm ? 0 : .3; });
        S.banner = { text: 'SQUADS REVEALED', t: 0, col: '#bfe9ff' };
      }
      maybeReplay(st);
      scheduleSync(st, ctx);
      const shown = S.anim ? S.anim.res.init : st.pens;
      ctx.root.append(ctx.turnBar({ scores: st.mode === 'sumo' ? [aliveCount(shown, 0), aliveCount(shown, 1)] : hudPts(st, S.anim) }), wrap);
      wrap.append(S.cv);                                  // the SAME canvas every repaint
      const col = ctx.players[me].color, fcol = ctx.players[foe].color;
      const pens = [];
      const tys = tyOf(st);
      for (let k = 0; k < NP; k++) { const t = tys[me * NP + k], efk = st.ef[me * NP + k]; pens.push(ctx.h('button', { class: 'ko-pen', style: `--kc:${col}`, onclick: () => selectPen(k), 'aria-label': 'Penguin ' + (k + 1) + (t ? ', ' + TYPES[t].name : '') + (efk ? ', ' + IK[efk].name : '') },
        ctx.h('span', { html: penSvg(col, t) }), ctx.h('span', { class: 'tn' }, TSHORT[t]), ctx.h('span', { class: 'tag' }), ctx.h('span', { class: 'ef', 'aria-hidden': 'true' }), ctx.h('span', { class: 'pw' }, ctx.h('i')))); }
      const showSq = st.round === 1 && st.sqby != null && tys.some(t => t) && !S.anim;
      const sqRow = showSq ? ctx.h('div', { class: 'ko-rev', role: 'note' }, [0, 1].map(sd => ctx.h('div', { style: `--kc:${ctx.players[sd].color}` }, [ctx.h('b', {}, ctx.players[sd].name), ctx.h('span', { class: 'ic', html: tys.slice(sd * NP, sd * NP + NP).map(t => penSvg(ctx.players[sd].color, t)).join('') }), ctx.h('span', { class: 'ko-sr' }, tys.slice(sd * NP, sd * NP + NP).map(t => TYPES[t].name).join(', '))]))) : null;
      const foeRdy = !!aimsOf(st, foe) && ctx.status === 'active' && !S.anim;
      const foeBox = ctx.h('div', { class: 'ko-foe' + (foeRdy ? ' rdy' : ''), style: `--kf:${fcol}` },
        ctx.h('b', {}, ctx.players[foe].name), ctx.status !== 'active' ? '—' : S.anim ? 'sliding…' : foeRdy ? 'READY ✓' : 'aiming…');
      const clear = ctx.h('button', { class: 'ko-clear', onclick: clearAims }, '↺ Clear all');
      const readyB = ctx.h('button', { class: 'ko-ready' + (me === 1 ? ' p1' : ''), onclick: ready }, 'READY ✓');
      const hint = ctx.h('div', { class: 'ko-hint', html: hintHtml(ctx, st) });
      wrap.append(...(sqRow ? [sqRow] : []), ctx.h('div', { class: 'ko-row' }, ctx.h('div', { class: 'ko-pens' }, pens), foeBox), ctx.h('div', { class: 'ko-btns' }, clear, readyB), hint);
      S.ui = { pens, clear, ready: readyB };
      updateUI();
      if (ctx.status === 'active' && !S.anim) {
        const mine = submitted(st, me), theirs = !!aimsOf(st, foe);
        ctx.msg(mine ? (theirs ? 'Both ready — here we go! 🐧' : `Waiting for ${ctx.players[foe].name} to lock in… 🧊`)
          : theirs ? `${ctx.players[foe].name} is READY — your move! 🔥` : 'Aim your penguins, then tap READY 🐧', mine ? 'var(--ink-faint)' : 'var(--gold)');
      } else if (S.anim) ctx.msg('💨 Launch!', 'var(--ink-dim)');
      warnOld(ctx, oldP);
      fit(); kick();
    },
  };
  Games.register(DEF);
  // the visible 'knockout': a new match launches as 'knockout2'; this def's own init (tournaments) is v78's classic Sumo,
  // straight into round 1, so an older app in the same tournament plays it identically
  Games.register(Object.assign({}, DEF, {
    id: 'knockout', hidden: false, statsId: undefined, launchAs: 'knockout2', tagline: 'Penguin sumo on six shrinking arenas.',
    init: host => ({ v: 2, mid: 'k' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36),
      host: host === 1 ? 1 : 0, turn: host === 1 ? 1 : 0, round: 1, R: R_START, pens: startPens(), aims: {}, n: 0, phase: 'play', mode: 'sumo', arena: 'floe', roulette: 0 }),
  }));
})();
