/* ============================================================
   BASKETBALL HOOPS — swipe up to shoot. Five rounds, five spots.

   Rules (kept tight — the same text lives in GAME_RULES):
     · 5 rounds. The spot moves round the arc: corner, wing, top of the key,
       wing, corner. In each round BOTH players take 3 shots from that spot.
     · Turn order in a round: the round's starter shoots all 3, then the other
       player shoots all 3. The starter swaps every round. Every shot has its
       own turn clock.
     · The 3rd ball of a round is the MONEY BALL: worth 2. Others are worth 1.
     · A shot only counts if the ball drops DOWN through the ring. Touching the
       rim, the net from outside or the glass without going through is a miss.
       Swishes, bank shots and rattle-ins all count.
     · From round 3 the hoop slides side to side. Where it is at the moment you
       let go is part of your shot, so both phones see the same flight.
     · 3 makes in a row: ON FIRE. The ball burns and the rim is a little more
       forgiving until you miss.
     · Level after 5 rounds: SUDDEN DEATH. One shot each from the same spot; the
       first round where one of you makes it and the other misses decides it.
       After 5 sudden-death rounds still level, it is a draw.

   Multiplayer model (see CONTEXT "COMMIT BEFORE YOU ANIMATE"):
     The shooter turns the swipe into a rounded velocity (vx,vy,vz), a backspin
     and the hoop's slide position, simulates the flight, and COMMITS input +
     outcome + shot id FIRST. Every phone then replays the shot by re-simulating
     those numbers. The simulation only uses + − × ÷ and sqrt, which are exactly
     rounded under IEEE-754, so iOS Safari and Chrome agree — and if they ever
     did not, the replay SNAPS its tail onto the committed make or miss.
     The hoop's slide is never read from the clock on replay: its x at release
     travels with the shot (the Mini Golf windmill rule).
     The canvas, the loop and the replay live at MODULE level (scene S) and are
     re-attached on every repaint, so a repaint can never restart or kill a shot,
     and a finished shot id never replays (sm_hp_seen, per match).

   Camera: behind the shooter, at the shooter's spot. Both players shoot from
   the same spot, so both phones frame the shot identically.
   ============================================================ */
(function () {
  const css = `
  .hp-wrap{ display:flex; flex-direction:column; gap:10px; }
  .hp-cv{ width:100%; display:block; margin:0 auto; border-radius:var(--r-3); border:1px solid var(--glass-brd);
    box-shadow:var(--shadow-soft); background:#0b0d2b; touch-action:none; user-select:none; -webkit-user-select:none;
    -webkit-touch-callout:none; }
  .hp-row{ display:flex; align-items:center; gap:10px; }
  .hp-hint{ flex:1 1 auto; min-width:0; font-size:12.5px; color:var(--ink-dim); line-height:1.45; min-height:36px; }
  .hp-hint b{ color:var(--ink); }
  .hp-hint .hp-gold{ color:#ffd66b; }
  .hp-hint .hp-fire{ color:#ffb13b; font-weight:800; }
  .hp-hint .hp-up{ font-weight:900; color:var(--ink); }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------------- world (cm, seconds) ----------------
     The hoop sits at the origin-ish: rim centre (hx, RIMY, 0), the backboard plane z = BZ behind it.
     Shooters stand at negative z on an arc, looking toward +z. The whole hoop + board slides in x. */
  const BR = 12;                               // ball radius
  const RR = 26.5, RT = 1.5, RIMY = 305;         // rim ring radius (centre line), tube radius, rim height
  const NETH = 46;                             // net depth
  const BZ = RR + 17;                          // backboard plane, behind the rim centre
  const BHW = 92, BBOT = 284, BTOP = 392;      // backboard half width, bottom, top
  const REL_Y = 205;                           // release height
  const G = 980, DT = 1 / 240, SUB = 4, MAXSTEP = 1680;
  const KD = 0.05, KM = 0.34, BSPIN = 0.8;     // air drag, Magnus lift, default backspin
  const E_RIM = 0.56, E_BOARD = 0.68, E_FLOOR = 0.62, MU_RIM = 0.10, SOFT = 0.32, FIRE_K = 1.12;
  const VMIN = 600, VMAX = 900, ELEV = 54 * Math.PI / 180;
  const COS_E = Math.cos(ELEV), SIN_E = Math.sin(ELEV);
  const ROUNDS = 5, PER = 3, ON_FIRE = 3, SD_CAP = 5, AIM_ASSIST = 0.75;
  const MOVE_FROM = 2;                         // rounds 3, 4, 5 and sudden death: the hoop slides
  // slide amplitude (cm) and period (s) per round; sudden death reuses the last one
  const SLIDE = { 2: { A: 46, T: 4.4 }, 3: { A: 56, T: 3.7 }, 4: { A: 62, T: 3.1 } };

  // The five shooting spots: corner, wing, top, wing, corner. x/z = where the shooter stands,
  // f = unit vector toward the hoop. Precomputed so nothing on the sim path needs trig.
  const SPOTS = [
    { x: -403.6, z: -214.0, fx: 0.8829, fz: 0.4695, nm: 'left corner' },
    { x: -258.0, z: -427.2, fx: 0.5150, fz: 0.8572, nm: 'left wing' },
    { x: 0, z: -520, fx: 0, fz: 1, nm: 'top of the key' },
    { x: 258.0, z: -427.2, fx: -0.5150, fz: 0.8572, nm: 'right wing' },
    { x: 403.6, z: -214.0, fx: -0.8829, fz: 0.4695, nm: 'right corner' },
  ];
  const SD_SPOTS = [2, 1, 3, 0, 4];
  const spotOf = rd => rd < ROUNDS ? rd : SD_SPOTS[(rd - ROUNDS) % SD_SPOTS.length];
  const slideOf = rd => rd >= MOVE_FROM ? (SLIDE[rd] || SLIDE[4]) : null;

  const r1 = v => Math.round(v * 10) / 10;
  const r2 = v => Math.round(v * 100) / 100;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => t * t * (3 - 2 * t);

  /* ---------------- deterministic flight ----------------
     Pure arithmetic (+ − × ÷ √) on the committed numbers only, so every phone computes the same
     path. Returns path points every SUB steps (1/60 s), events (rim / board / in / floor) and
     the outcome. `from` (tests only) overrides the release point. */
  function simulate(spot, hx, v, spin, fire, from) {
    const sp = SPOTS[spot] || SPOTS[2];
    let x = from ? from[0] : sp.x, y = from ? from[1] : REL_Y, z = from ? from[2] : sp.z;
    let vx = +v[0] || 0, vy = +v[1] || 0, vz = +v[2] || 0, s = +spin || 0;
    hx = +hx || 0;
    const R = fire ? RR * FIRE_K : RR, lim = BR + RT;
    const h0 = Math.sqrt(vx * vx + vz * vz) || 1, wx = -vz / h0, wz = vx / h0;   // ω = s·(wx,0,wz): backspin
    const pts = [[x, y, z]], evs = [];
    let rims = 0, bd = 0, scored = false, up = false, floorHit = false, bounces = 0, lastRim = -99, lastBd = -99, settle = 0;
    for (let k = 1; k <= MAXSTEP; k++) {
      const px = x, py = y, pz = z;
      // forces: gravity, drag, Magnus lift from the backspin
      const mx = -s * wz * vy, my = s * (wz * vx - wx * vz), mz = s * wx * vy;
      vx += (mx * KM - vx * KD) * DT;
      vy += (-G + my * KM - vy * KD) * DT;
      vz += (mz * KM - vz * KD) * DT;
      x += vx * DT; y += vy * DT; z += vz * DT;
      const xr = x - hx;
      // the net: it slows and centres a ball that has passed through the ring
      if (scored && !floorHit && y < RIMY + 2 && y > RIMY - NETH - BR) {
        const dx = xr, dz = z, d = Math.sqrt(dx * dx + dz * dz), t = clamp((RIMY - y) / NETH, 0, 1);
        const rn = R * (1 - 0.42 * t) - BR * 0.55, ln = rn > 3 ? rn : 3;
        vx -= vx * 14 * DT; vz -= vz * 14 * DT; vy -= vy * 7 * DT;
        if (d > ln) { const f = (d - ln) * 0.3 / d; x -= dx * f; z -= dz * f; }
      }
      // the backboard (slides with the hoop)
      if (!floorHit && vz > 0 && z + BR > BZ && pz + BR <= BZ + 6 && xr > -BHW && xr < BHW && y > BBOT - BR * 0.3 && y < BTOP + BR * 0.3) {
        z = BZ - BR;
        const e = E_BOARD * (1 - SOFT * 0.5 * s);
        vz = -vz * e; vx *= 0.9; vy *= 0.94; s *= 0.75;
        if (k - lastBd > 8) { bd++; evs.push({ k: 'board', p: pts.length }); }
        lastBd = k;
      }
      // the rim: a torus of tube radius RT around the ring of radius R
      if (!floorHit && y > RIMY - lim - 2 && y < RIMY + lim + 2) {
        const dx = xr, dz = z, d2 = dx * dx + dz * dz;
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          if (d > R - lim - 2 && d < R + lim + 2) {
            const nx = dx / d, nz = dz / d, qx = nx * R, qz = nz * R;
            const wx2 = xr - qx, wy = y - RIMY, wz2 = z - qz, wd2 = wx2 * wx2 + wy * wy + wz2 * wz2;
            if (wd2 < lim * lim) {
              const wd = Math.sqrt(wd2) || 1e-6, ax = wx2 / wd, ay = wy / wd, az = wz2 / wd;
              const vn = vx * ax + vy * ay + vz * az;
              x = hx + qx + ax * lim; y = RIMY + ay * lim; z = qz + az * lim;
              if (vn < 0) {
                const e = E_RIM * (1 - SOFT * s);
                const tx = vx - vn * ax, ty = vy - vn * ay, tz = vz - vn * az;
                vx = tx * (1 - MU_RIM) - e * vn * ax; vy = ty * (1 - MU_RIM) - e * vn * ay; vz = tz * (1 - MU_RIM) - e * vn * az;
                s *= 0.7;
              }
              if (k - lastRim > 6) { rims++; evs.push({ k: 'rim', p: pts.length }); }
              lastRim = k;
            }
          }
        }
      }
      // through the ring: the ball's centre crosses the rim plane, inside the ring
      if (!floorHit && !scored) {
        if (py > RIMY && y <= RIMY) {
          const t = (py - RIMY) / (py - y), cx = px + (x - px) * t - hx, cz = pz + (z - pz) * t, cd2 = cx * cx + cz * cz;
          if (cd2 < R * R && !up) { scored = true; evs.push({ k: 'in', p: pts.length }); }
        } else if (py < RIMY && y >= RIMY) {
          const t = (RIMY - py) / (y - py), cx = px + (x - px) * t - hx, cz = pz + (z - pz) * t;
          if (cx * cx + cz * cz < R * R) up = true;                  // entered from below: never counts
        }
      }
      // the court
      if (y < BR && vy < 0) {
        y = BR;
        if (!floorHit) { floorHit = true; evs.push({ k: 'floor', p: pts.length }); }
        if (-vy > 70) { vy = -vy * E_FLOOR; vx *= 0.93; vz *= 0.93; bounces++; evs.push({ k: 'bounce', p: pts.length }); }
        else { vy = 0; vx -= vx * 3 * DT; vz -= vz * 3 * DT; }
      }
      if (k % SUB === 0) pts.push([x, y, z]);
      if (floorHit) { settle++; if (bounces >= 3 || settle > 700 || (y <= BR + .01 && vx * vx + vz * vz < 400 && vy === 0)) break; }
      if (z > 900 || z < -1400 || x > 1400 || x < -1400) break;
    }
    const last = pts[pts.length - 1];
    if (!last || last[0] !== x || last[1] !== y || last[2] !== z) pts.push([x, y, z]);
    const out = { r: scored ? 'in' : 'miss', rims, bd };
    out.m = scored ? (rims ? 'rattle' : bd ? 'bank' : 'swish') : (rims ? 'rim' : bd ? 'board' : 'air');
    out.e = [r1(x), r1(y), r1(z)];
    return { pts, evs, out };
  }
  // swipe → committed input. Trig happens ONCE, on the thrower's phone, and is rounded away.
  // `yaw` is relative to the line to the hoop; the assist pulls a near-miss aim 40% of the way to it.
  // the yaw (relative to the line to the hoop's centre position) that points at a hoop at x = hx
  function aimYaw(spot, hx) {
    const sp = SPOTS[spot] || SPOTS[2], tx = (+hx || 0) - sp.x, tz = -sp.z;
    return Math.atan2(tx * sp.fz - tz * sp.fx, tx * sp.fx + tz * sp.fz);
  }
  function inputFrom(power, yaw, spot, hx) {
    const sp = SPOTS[spot] || SPOTS[2];
    const want = aimYaw(spot, hx);                                   // yaw that points at the hoop right now
    const yw = clamp(want + (yaw - want) * AIM_ASSIST, -.45, .45);
    const v = VMIN + (VMAX - VMIN) * clamp(power, 0, 1), hz = v * COS_E, c = Math.cos(yw), sn = Math.sin(yw);
    return { v: [r2(hz * (sp.fx * c + sp.fz * sn)), r2(v * SIN_E), r2(hz * (sp.fz * c - sp.fx * sn))], s: BSPIN };
  }
  // the hoop's slide: a display-only sine on the shooter's phone. Only its sampled x is ever committed.
  const slideX = (rd, ph) => { const m = slideOf(rd); return m ? r1(m.A * Math.sin(ph)) : 0; };

  /* ---------------- rules (pure) ---------------- */
  // RTDB turns an array with a stripped (empty) first slot into {1: …} — keep the INDEX, not the order
  function toArr(a) {
    if (Array.isArray(a)) return a;
    const out = [];
    if (a && typeof a === 'object') Object.keys(a).forEach(k => { if (/^\d+$/.test(k)) out[+k] = a[k]; });
    return out;
  }
  const pair = (a, d) => { const t = toArr(a); return [0, 1].map(i => (t[i] == null ? d : +t[i] || 0)); };
  const strPair = a => { const t = toArr(a); return [0, 1].map(i => typeof t[i] === 'string' ? t[i] : ''); };
  // Firebase strips nulls / empty arrays / empty strings, so every field is re-defaulted on read
  function norm(st) {
    const s = st && typeof st === 'object' ? st : {};
    s.turn = s.turn === 1 ? 1 : 0;
    s.starter = s.starter === 1 ? 1 : 0;
    s.phase = s.phase === 'done' ? 'done' : 'play';
    s.rd = +s.rd > 0 ? Math.min(+s.rd | 0, ROUNDS + SD_CAP) : 0;
    s.sh = +s.sh > 0 ? +s.sh | 0 : 0;
    s.sc = pair(s.sc, 0); s.streak = pair(s.streak, 0); s.thr = pair(s.thr, 0); s.sdm = pair(s.sdm, -1);
    s.rec = strPair(s.rec);
    s.fin = s.fin === 0 || s.fin === 1 || s.fin === 'draw' ? s.fin : -1;
    s.n = +s.n || 0; s.seed = +s.seed || 1; s.note = s.note || ''; s.clk = +s.clk || 0;
    if (typeof s.mid !== 'string') delete s.mid;
    const Lx = s.last;
    if (Lx && typeof Lx === 'object' && Lx.id) {
      const vv = toArr(Lx.v); Lx.v = [0, 1, 2].map(i => +vv[i] || 0);
      Lx.s = +Lx.s || 0; Lx.f = Lx.f ? 1 : 0; Lx.ig = Lx.ig ? 1 : 0; Lx.ev = Lx.ev || '';
      Lx.hx = +Lx.hx || 0; Lx.rd = +Lx.rd || 0; Lx.sh = +Lx.sh || 0; Lx.spot = +Lx.spot || 0; Lx.pts = +Lx.pts || 0;
      Lx.money = Lx.money ? 1 : 0; Lx.seat = Lx.seat === 1 ? 1 : 0;
      const o = Lx.out && typeof Lx.out === 'object' ? Lx.out : {};
      const ee = toArr(o.e);
      Lx.out = { r: o.r === 'in' ? 'in' : 'miss', m: o.m || '', rims: +o.rims || 0, bd: +o.bd || 0, e: ee.length ? [0, 1, 2].map(i => +ee[i] || 0) : [] };
    } else s.last = null;
    return s;
  }
  const cloneSt = st => norm(JSON.parse(JSON.stringify(st)));

  const isSD = s => s.rd >= ROUNDS;
  const perRound = s => isSD(s) ? 2 : PER * 2;
  // who shoots next: the round's starter takes all 3 (or the first of 2 in sudden death), then the other
  const shooterOf = s => (isSD(s) ? s.sh < 1 : s.sh < PER) ? s.starter : 1 - s.starter;
  const isMoney = s => !isSD(s) && s.sh % PER === PER - 1;
  const hoopAt = s => slideOf(s.rd);                       // {A,T} when the hoop slides this round, else null

  // The shared bookkeeping for one shot being taken (a real shot, or a timed-out one that counts as a miss).
  // Mutates s; returns { winner } (undefined while the game goes on) and the round-level event.
  function advance(s, seat, made, Lx) {
    const sd = isSD(s), pts = made ? (isMoney(s) ? 2 : 1) : 0;
    s.sc[seat] += pts;
    s.streak[seat] = made ? s.streak[seat] + 1 : 0;
    s.thr[seat]++;
    s.rec[seat] += made ? (isMoney(s) ? '2' : '1') : '0';
    s.n++;
    if (Lx) { Lx.id = s.n; Lx.pts = pts; }
    let winner, ev = '';
    const keepClk = () => { if (s.turn === seat) s.clk++; };   // the same player shoots again: a fresh turn clock
    if (!sd) {
      s.sh++;
      if (s.sh < PER * 2) { s.turn = shooterOf(s); keepClk(); }
      else {
        ev = 'round'; s.rd++; s.sh = 0; s.starter = 1 - s.starter;
        if (s.rd === ROUNDS) {
          if (s.sc[0] !== s.sc[1]) { winner = s.sc[0] > s.sc[1] ? 0 : 1; ev = 'win'; }
          else { ev = 'sd'; s.sdm = [-1, -1]; }
        }
        s.turn = s.starter; if (winner === undefined) keepClk();
      }
    } else {
      s.sdm[seat] = made ? 1 : 0; s.sh++;
      if (s.sh < 2) { s.turn = 1 - seat; }
      else if (s.sdm[0] !== s.sdm[1]) { winner = s.sdm[0] === 1 ? 0 : 1; ev = 'win'; s.turn = s.starter; }
      else {
        s.rd++; s.sh = 0; s.starter = 1 - s.starter; s.sdm = [-1, -1]; s.turn = s.starter;
        if (s.rd >= ROUNDS + SD_CAP) { winner = 'draw'; ev = 'draw'; } else { ev = 'sdr'; keepClk(); }
      }
    }
    if (winner !== undefined) { s.phase = 'done'; s.fin = winner; }
    if (Lx) Lx.ev = ev;
    return { winner, ev };
  }
  // one shot, fully resolved. Returns null when it is not `seat`'s turn.
  function resolve(st0, seat, inp) {
    const s = cloneSt(st0);
    if (s.phase !== 'play' || s.turn !== seat) return null;
    const mv = slideOf(s.rd), hx = mv ? clamp(r1(+inp.hx || 0), -mv.A, mv.A) : 0;
    const fire = s.streak[seat] >= ON_FIRE ? 1 : 0, spot = spotOf(s.rd), money = isMoney(s) ? 1 : 0, rd = s.rd, sh = s.sh;
    const sim = simulate(spot, hx, inp.v, inp.s, fire);
    const o = sim.out, made = o.r === 'in';
    const Lx = { id: 0, seat, rd, sh, spot, money, hx, v: inp.v.slice(), s: inp.s, f: fire, pts: 0, ev: '',
      out: { r: o.r, m: o.m, rims: o.rims, bd: o.bd, e: o.e }, ig: 0 };
    const res = advance(s, seat, made, Lx);
    Lx.ig = !fire && made && s.streak[seat] >= ON_FIRE ? 1 : 0;
    s.last = Lx; s.note = '';
    return { s, winner: res.winner, out: o, sim };
  }

  /* ---------------- module-level scene (survives repaints) ---------------- */
  const VW = 600, VH = 760;
  const S = {
    cv: null, g: null, raf: 0, lastT: 0, acc: 0, ctx: null, st: null, seed: null, mid: null,
    W: 0, H: 0, dpr: 1, k: 1, cssH: 0, cam: null, cs: null, sx: 0, sy: 0, shake: 0, flash: 0, flashC: '#fff',
    anim: null, doneId: 0, parts: [], floats: [], banner: null, tick: 0, catchUp: 0,
    drag: null, aim: null, aimSim: null, aimK: 1, aimKey: '', lockN: null, lockT: 0, settleKey: '',
    hx: 0, hxPrev: 0, rimR: RR, net: [], sky: null, stat: null, vig: null, introKey: '',
    calm: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  // one camera per spot: behind the shooter, looking at the hoop. The same on BOTH phones (both shoot from the same spot).
  const CAMB = 330, CAMY = 296;
  const CAMS = SPOTS.map(sp => {
    const Dh = Math.sqrt(sp.x * sp.x + sp.z * sp.z) + CAMB;
    return { x: sp.x - sp.fx * CAMB, y: CAMY, z: sp.z - sp.fz * CAMB, yaw: Math.atan2(sp.fx, sp.fz),
      pitch: Math.atan2(RIMY + 34 - CAMY, Dh), foc: 1.5 * Dh, cyf: .27 };
  });
  const CAM_KEYS = ['x', 'y', 'z', 'yaw', 'pitch', 'foc'];

  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const seatCol = i => (S.ctx && S.ctx.players[i] && S.ctx.players[i].color) || (i ? '#ff4d9d' : '#2fe6ff');
  const seatName = i => (S.ctx && S.ctx.players[i] && S.ctx.players[i].name) || (i ? 'Meera' : 'Smit');
  const rnd = (a, b) => a + Math.random() * (b - a);

  function resetScene(st) {
    S.seed = st.seed; S.mid = st.mid; S.anim = null; S.parts = []; S.floats = []; S.banner = null; S.shake = 0; S.flash = 0;
    S.drag = null; S.aim = null; S.aimSim = null; S.lockN = null; S.settleKey = ''; S.introKey = ''; S.net = [];
    // a fresh page replays the latest shot once (the partner may not have seen it); older ones never
    S.doneId = st.last ? st.last.id - 1 : 0;
    S.cam = null; S.stat = null;
  }

  /* ---------------- what is on screen right now ----------------
     The committed state already contains a shot that is still flying. Everything the eye reads (score, pips,
     spot, who is up) is frozen at the PRE-shot values until the ball lands, so the result is never spoiled. */
  const pending = () => { const st = S.st, Lx = st && st.last; return Lx && Lx.id > S.doneId ? Lx : null; };
  function view() {
    const st = S.st, Lx = pending();
    if (!Lx) {
      const done = st.phase === 'done' && st.last;
      const rd = done ? st.last.rd : st.rd;
      return { rd, sh: done ? st.last.sh : st.sh, turn: st.turn, sc: st.sc.slice(), rec: st.rec.slice(), streak: st.streak.slice(), spot: done ? st.last.spot : spotOf(st.rd), pend: null };
    }
    const sc = st.sc.slice(), rec = st.rec.slice(), streak = st.streak.slice();
    sc[Lx.seat] -= Lx.pts; rec[Lx.seat] = rec[Lx.seat].slice(0, -1);
    streak[Lx.seat] = Lx.f ? Math.max(ON_FIRE, streak[Lx.seat] - (Lx.out.r === 'in' ? 1 : 0)) : Math.max(0, streak[Lx.seat] - (Lx.out.r === 'in' ? 1 : 0));
    return { rd: Lx.rd, sh: Lx.sh, turn: Lx.seat, sc, rec, streak, spot: Lx.spot, pend: Lx };
  }

  function ensureCanvas() {
    if (S.cv) return;
    S.cv = document.createElement('canvas'); S.cv.className = 'hp-cv';
    S.g = S.cv.getContext('2d');
    if (window.ResizeObserver) new ResizeObserver(() => { clearTimeout(S.roT); S.roT = setTimeout(fit, 0); }).observe(S.cv);   // deferred: fit() resizes the observed canvas
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
      if (!a || a.power < .03 || !canAct()) return;           // a tap or a pull-down — not a shot
      launch(a);
    };
    S.cv.addEventListener('pointerup', release);
    S.cv.addEventListener('pointercancel', () => { S.drag = null; S.aim = null; S.aimSim = null; ensureLoop(); });
  }
  function canAct() {
    const c = S.ctx, st = S.st;
    if (!c || !st || !c.isMyTurn || c.status !== 'active' || S.anim) return false;
    if (st.phase !== 'play' || st.turn !== c.me) return false;
    if (st.last && st.last.id > S.doneId) return false;               // a shot is still waiting to be shown
    if (S.lockN != null && st.n === S.lockN && Date.now() - S.lockT < 5000) return false;   // commit in flight
    return true;
  }
  function fit() {
    if (!S.cv) return;
    const par = S.cv.parentNode, pw = par && par.clientWidth ? par.clientWidth : S.cv.clientWidth;
    if (!pw) return;
    // keep the whole scene on screen on short phones: cap the height, centre the canvas
    const maxH = Math.max(340, (window.innerHeight || 800) * .7);
    const w = Math.min(pw, Math.floor(maxH * VW / VH)), hgt = Math.round(w * VH / VW);
    S.cv.style.width = w + 'px'; S.cv.style.height = hgt + 'px';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(hgt * dpr);
    S.cssH = hgt;
    if (W === S.W && H === S.H) return;
    S.W = W; S.H = H; S.dpr = dpr; S.k = W / VW;
    S.cv.width = W; S.cv.height = H; S.vig = null; S.stat = null;
    draw();                                                    // resizing wipes the bitmap — repaint now
  }
  // ONE loop, ever: every (re)schedule goes through the `!S.raf` guard. step() can finish a shot and
  // re-render, and render() calls ensureLoop() while S.raf is 0 — without the guard at the end of
  // loop() that became a second, third… loop and every later shot flew 2×, 3× fast (the Fleabag bug).
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
  // the hoop slides while a live turn is up (rounds 3+). Nothing else moves while we wait.
  function sliding() {
    const c = S.ctx, st = S.st;
    if (!c || !st || c.status !== 'active' || st.phase !== 'play') return false;
    return !!slideOf(view().rd);
  }
  function busy() {
    return !!(S.anim || S.drag || S.parts.length || S.floats.length || S.banner || S.flash > .01 || S.shake > .2 ||
      !camSettled() || sliding() || S.catchUp > 0 || netMoving() || fireShowing() || S.hx !== S.hxPrev);
  }
  function fireShowing() {
    const c = S.ctx, st = S.st; if (!c || !st || S.calm) return false;
    return st.phase === 'play' && c.status === 'active' && view().streak[st.turn] >= ON_FIRE && !S.anim;
  }

  /* ---------------- camera + projection ---------------- */
  function camTarget() {
    const c = S.ctx, st = S.st;
    if (!c || !st) return CAMS[2];
    const v = view(), base = CAMS[v.spot], A = S.anim;
    if (A && A.k === 't') {
      if (S.calm) return base;
      const sp = SPOTS[A.L.spot], t = A.done ? 1 : ease(clamp((A.ball[2] - sp.z) / (-sp.z + 1), 0, 1));
      const push = 105 * t;                                   // a slow push-in toward the hoop
      return Object.assign({}, base, { x: base.x + sp.fx * push, z: base.z + sp.fz * push, foc: base.foc * (1 + .1 * t) });
    }
    return base;
  }
  function camSettled() {
    if (!S.cam) return true;
    const t = camTarget(), c = S.cam;
    return Math.abs(t.x - c.x) < .4 && Math.abs(t.z - c.z) < .4 && Math.abs(t.yaw - c.yaw) < .0008 && Math.abs(t.foc - c.foc) < 1 && Math.abs(t.pitch - c.pitch) < .0008;
  }
  function stepCam(snap) {
    const t = camTarget();
    if (!S.cam || snap || S.calm) S.cam = Object.assign({}, t, { cyf: t.cyf });
    else { const e = S.anim ? .09 : .075, c = S.cam; CAM_KEYS.forEach(key => { c[key] += (t[key] - c[key]) * e; }); }
    setCam();
  }
  function setCam() {
    const c = S.cam;
    S.cs = { sy: Math.sin(c.yaw), cy: Math.cos(c.yaw), sp: Math.sin(c.pitch), cp: Math.cos(c.pitch) };
  }
  // world → camera space [right, up, depth]
  function cpt(x, y, z) {
    const c = S.cam, q = S.cs, dx = x - c.x, dy = y - c.y, dz = z - c.z;
    const xr = dx * q.cy - dz * q.sy, zf = dx * q.sy + dz * q.cy;
    return [xr, dy * q.cp - zf * q.sp, zf * q.cp + dy * q.sp];
  }
  function P(x, y, z) {
    const c = S.cam, a = cpt(x, y, z), zc = a[2] < 4 ? 4 : a[2], k = c.foc / zc;
    return { x: VW / 2 + a[0] * k + S.sx, y: VH * c.cyf - a[1] * k + S.sy, k, zc };
  }
  const scr = a => { const c = S.cam, k = c.foc / a[2]; return { x: VW / 2 + a[0] * k + S.sx, y: VH * c.cyf - a[1] * k + S.sy, k, zc: a[2] }; };
  const NEAR = 10;
  function clipSeg(a, b) {                                  // segment against the near plane (camera space)
    if (a[2] >= NEAR && b[2] >= NEAR) return [a, b];
    if (a[2] < NEAR && b[2] < NEAR) return null;
    const t = (NEAR - a[2]) / (b[2] - a[2]), m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR];
    return a[2] < NEAR ? [m, b] : [a, m];
  }
  function clipPoly(pts) {                                  // polygon against the near plane (Sutherland-Hodgman)
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], ain = a[2] >= NEAR, bin = b[2] >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) { const t = (NEAR - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]); }
    }
    return out;
  }
  // where the ball waits in the shooter's hands, in screen space (for aim calibration)
  function ballScreen(cam, spot) {
    const keep = S.cam, ks = S.cs; S.cam = cam; setCam();
    const sp = SPOTS[spot], p = P(sp.x, REL_Y, sp.z);
    const T = P(0, RIMY, 0);
    S.cam = keep; S.cs = ks; if (keep) setCam();
    return { p, T };
  }
  // swipe direction on screen → yaw in the world, calibrated so pointing at the hoop aims at it
  function calibrate(spot) {
    const key = spot + ':' + S.W;
    if (S.aimKey === key) return;
    const cam = CAMS[spot], keep = S.cam, ks = S.cs; S.cam = cam; setCam();
    const sp = SPOTS[spot], b = P(sp.x, REL_Y, sp.z), hxr = 60, T = P(hxr, RIMY, 0);
    S.cam = keep; S.cs = ks; if (keep) setCam();
    const phi = Math.atan2(T.x - b.x, b.y - T.y), yaw = aimYaw(spot, hxr);
    S.aimK = Math.abs(Math.tan(phi)) > 1e-4 ? Math.tan(yaw) / Math.tan(phi) : 1;
    S.aimKey = key;
  }
  function dragAim(d) {
    const dx = d.x - d.x0, up = d.y0 - d.y;
    if (up < 14) return null;
    const len = Math.sqrt(dx * dx + up * up);
    const power = clamp((len - 12) / (d.H * .58), 0, 1);
    const phi = clamp(Math.atan2(dx, up), -1.2, 1.2);
    calibrate(view().spot);
    const yaw = clamp(Math.atan(S.aimK * Math.tan(phi)), -.5, .5);
    return { power, yaw, len };
  }
  function shotParams() {
    const st = S.st, me = S.ctx.me, v = view(), mv = slideOf(v.rd);
    return { spot: v.spot, hx: mv ? clamp(r1(S.hx), -mv.A, mv.A) : 0, fire: st.streak[me] >= ON_FIRE ? 1 : 0 };
  }
  function aimPreview(a) {
    const q = shotParams(), inp = inputFrom(a.power, a.yaw, q.spot, q.hx);
    return simulate(q.spot, q.hx, inp.v, inp.s, q.fire);
  }

  /* ---------------- actions ---------------- */
  function launch(a) {
    const c = S.ctx; if (!canAct()) return false;
    const st = S.st, me = c.me, q = shotParams(), inp = inputFrom(a.power, a.yaw, q.spot, q.hx);
    inp.hx = q.hx; S.hx = q.hx;                        // the hoop's position AT RELEASE is part of the committed shot (and freezes there)
    const r = resolve(st, me, inp);
    if (!r) return false;
    S.lockN = st.n; S.lockT = Date.now();
    try { c.sound.move(); } catch (e) {}
    // COMMIT FIRST — input + outcome + id. The flight is replayed from `last` on every phone
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
  // replays an old shot — but a shot taken while this phone was closed still plays once.
  const SEEN_KEY = 'sm_hp_seen';
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
    const sim = simulate(Lx.spot, Lx.hx, Lx.v, Lx.s, Lx.f);
    const same = sim.out.r === Lx.out.r;
    const path = same ? sim : snapPath(sim, Lx);
    // play the flight up to a short settle after the ball first touches the court, not the whole bounce-out
    const fl = path.evs.find(e => e.k === 'floor');
    if (fl) { const cut = Math.min(path.pts.length, fl.p + 20); path.pts = path.pts.slice(0, cut); path.evs = path.evs.filter(e => e.p < cut); }
    const off = Math.abs(S.hx - Lx.hx);
    S.anim = { id: Lx.id, k: 't', L: Lx, pts: path.pts, evs: path.evs, ei: 0, i: 0, sp: 1, done: false, tail: 0,
      snapped: !same, ball: path.pts[0].slice(), trail: [], rot: 0, final: !!(Lx.ev === 'win' || Lx.ev === 'draw'),
      hold: off > 4 && Lx.seat !== S.ctx.me ? 14 : 0, made: Lx.out.r === 'in', scoredAt: -1, hxs: Lx.hx };
    if (Lx.seat !== S.ctx.me) { try { S.ctx.sound.place(); } catch (e) {} }
  }
  // the local re-simulation disagreed with the committed outcome (never seen in practice — the sim is
  // exactly-rounded arithmetic — but floats are floats): keep the opening of the local flight, then bend the
  // tail onto the COMMITTED result so the same thing happens on every phone.
  function snapPath(sim, Lx) {
    const n = sim.pts.length, cut = Math.max(4, Math.min(n - 2, Math.floor(n * .45)));
    const p0 = sim.pts[cut], pts = sim.pts.slice(0, cut + 1), evs = sim.evs.filter(e => e.p < cut && e.k !== 'in');
    const hx = Lx.hx;
    if (Lx.out.r === 'in') {                                  // drop it through the ring, then the net, then the floor
      const top = [hx, RIMY + 26, 0], ctl = [(p0[0] + top[0]) / 2, Math.max(p0[1], top[1]) + 30, (p0[2] + top[2]) / 2];
      for (let j = 1; j <= 24; j++) { const t = j / 24, u = 1 - t; pts.push([u * u * p0[0] + 2 * u * t * ctl[0] + t * t * top[0], u * u * p0[1] + 2 * u * t * ctl[1] + t * t * top[1], u * u * p0[2] + 2 * u * t * ctl[2] + t * t * top[2]]); }
      evs.push({ k: 'in', p: pts.length - 1 });
      for (let j = 1; j <= 26; j++) { const t = j / 26; pts.push([hx + (Lx.out.e[0] || 0) * 0 * t, lerp(RIMY + 26, BR, t * t), t * 10]); }
      evs.push({ k: 'floor', p: pts.length - 1 });
    } else {                                                  // a clean miss: over the ring, away from it
      const end = Lx.out.e && Lx.out.e.length === 3 ? Lx.out.e : [p0[0], BR, p0[2] + 200];
      const ctl = [(p0[0] + end[0]) / 2, Math.max(p0[1], end[1]) + 40, (p0[2] + end[2]) / 2];
      for (let j = 1; j <= 34; j++) { const t = j / 34, u = 1 - t; pts.push([u * u * p0[0] + 2 * u * t * ctl[0] + t * t * end[0], u * u * p0[1] + 2 * u * t * ctl[1] + t * t * end[1], u * u * p0[2] + 2 * u * t * ctl[2] + t * t * end[2]]); }
      evs.push({ k: 'floor', p: pts.length - 1 });
    }
    return { pts, evs };
  }
  // playback speed (path points per frame): real time is 1; it slows as the ball reaches the hoop
  function speedAt(A, i) {
    if (S.calm) return 1;
    const p = A.pts[Math.min(A.pts.length - 1, Math.floor(i))];
    let s = 1;
    if (p && !A.floorSeen) {
      const dx = p[0] - A.hxs, dz = p[2], dy = p[1] - RIMY;
      if (dx * dx + dz * dz < 100 * 100 && dy > -50 && dy < 100) s = A.final ? .25 : A.made ? .4 : .55;
    }
    return A.hurry ? s * 2 : s;
  }
  const TAIL = 26;
  function remainingMs() {
    const A = S.anim; if (!A) return 0;
    let f = 0;
    for (let i = A.i; i < A.pts.length - 1; i += speedAt(A, i)) f++;
    return Math.round((A.hold + f + Math.max(0, TAIL - A.tail) + (A.final ? 40 : 0)) * 16.7);
  }

  /* ---------------- effects ---------------- */
  const addShake = v => { if (!S.calm) S.shake = Math.max(S.shake, v); };     // reduced motion: never
  const addFlash = (v, c) => { if (!S.calm) { S.flash = Math.max(S.flash, v); S.flashC = c; } };   // …and no brightness jumps
  function floatText(text, p, c, big) { S.floats.push({ text, x: p[0], y: p[1], z: p[2], c, life: 84, max: 84, big: !!big }); }
  function banner(text, sub, c, dur) { S.banner = { text, sub: sub || '', c: c || '#ffd66b', t: 0, dur: dur || 96 }; }
  function confetti(col) {
    if (S.calm) return;
    const cols = [col, col, '#ffffff', '#ffd66b', col], h = S.hx;
    for (let i = 0; i < 150; i++) {
      S.parts.push({ k: 'conf', x: h + rnd(-90, 90), y: rnd(330, 420), z: rnd(-60, 60), vx: rnd(-1.4, 1.4), vy: rnd(.8, 2.6), vz: rnd(-1.6, .4), life: rnd(100, 150), max: 150, c: cols[i % cols.length], rot: rnd(0, 6.3), vr: rnd(-.3, .3), s: rnd(3, 6) });
    }
  }
  function sparks(p, n, c, sp) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(.3, 1) * (sp || 1); S.parts.push({ k: 'spark', x: p[0], y: p[1], z: p[2], vx: Math.cos(a) * v, vy: rnd(.2, 1.4), vz: Math.sin(a) * v, life: rnd(14, 26), max: 26, c: c || '#ffffff' }); }
  }
  function puff(p, n) {
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(.3, 1); S.parts.push({ k: 'dust', x: p[0], y: 1, z: p[2], vx: Math.cos(a) * v, vy: rnd(.1, .5), vz: Math.sin(a) * v, life: rnd(18, 30), max: 30, r: rnd(4, 9) }); }
  }

  /* the net: rows of a cone, each a little spring that the ball pushes out and the hoop's slide swings */
  const NROWS = 5, NCOL = 12;
  function netInit() { S.net = []; for (let j = 0; j < NROWS; j++) S.net.push({ r: 0, rv: 0, ox: 0, oz: 0, vx: 0, vz: 0, dy: 0, dv: 0 }); }
  function netMoving() {
    if (!S.net.length) return false;
    return S.net.some(n => Math.abs(n.r) > .05 || Math.abs(n.rv) > .05 || Math.abs(n.ox) > .05 || Math.abs(n.oz) > .05 || Math.abs(n.dy) > .05 || Math.abs(n.dv) > .05 || Math.abs(n.vx) > .05 || Math.abs(n.vz) > .05);
  }
  function netKick(f, x, z) {
    if (!S.net.length) netInit();
    for (let j = 1; j < NROWS; j++) { const w = j / (NROWS - 1); S.net[j].vx += (x || 0) * f * w; S.net[j].vz += (z || 0) * f * w; S.net[j].rv += f * .5 * w; }
  }
  function netStep() {
    if (!S.net.length) netInit();
    const A = S.anim, b = A && A.k === 't' && !A.floorSeen ? A.ball : null, hv = S.hx - S.hxPrev;
    for (let j = 1; j < NROWS; j++) {
      const n = S.net[j], yj = RIMY - NETH * j / (NROWS - 1), w = j / (NROWS - 1);
      let tr = 0, tx = 0, tz = 0, td = 0;
      if (b && A.made !== false) {
        const bx = b[0] - S.hx, bz = b[2], d = Math.sqrt(bx * bx + bz * bz), ay = Math.abs(b[1] - yj);
        if (d < RR + BR && ay < BR * 1.9 && b[1] < RIMY + 6 && b[1] > RIMY - NETH - BR) {
          const f = 1 - ay / (BR * 1.9);
          tr = BR * .75 * f; tx = bx * .45 * f; tz = bz * .45 * f; td = -6 * f;
        }
      }
      n.vx += -hv * .55 * w;
      n.rv += (tr - n.r) * .22; n.rv *= .74; n.r += n.rv;
      n.vx += (tx - n.ox) * .2; n.vz += (tz - n.oz) * .2; n.vx *= .76; n.vz *= .76; n.ox += n.vx; n.oz += n.vz;
      n.dv += (td - n.dy) * .2; n.dv *= .74; n.dy += n.dv;
      if (Math.abs(n.r) < .02 && Math.abs(n.rv) < .02) { n.r = 0; n.rv = 0; }
    }
  }

  function fireEvent(A, ev) {
    const c = S.ctx, mine = A.L.seat === c.me, p = A.pts[Math.min(A.pts.length - 1, ev.p)], Lx = A.L;
    if (ev.k === 'rim') {
      sparks(p, 7, '#ffd9a0'); addShake(2.4); netKick(2, p[0] - S.hx, p[2]);
      try { c.sound.tap(); } catch (e) {}
    } else if (ev.k === 'board') {
      sparks(p, 8, '#bfe6ff'); addShake(3); A.glass = 14;
      try { c.sound.tap(); } catch (e) {}
    } else if (ev.k === 'in') {
      if (Lx.out.r !== 'in' || A.scoredAt >= 0) return;          // never trust a local 'in' the commit didn't make
      A.scoredAt = A.i;
      const m = Lx.out.m, col = seatCol(Lx.seat);
      netKick(m === 'swish' ? 7 : 4, 0, 0);
      floatText(Lx.money ? '+2' : '+1', [S.hx, RIMY + 46, 0], Lx.money ? '#ffd66b' : col, true);
      for (let i = 0; i < (Lx.money ? 34 : 20); i++) { const a = rnd(0, 6.283), v = rnd(.5, 1.7); S.parts.push({ k: 'spark', x: S.hx + Math.cos(a) * RR * .8, y: RIMY - 8, z: Math.sin(a) * RR * .8, vx: Math.cos(a) * v, vy: rnd(.6, 2.6), vz: Math.sin(a) * v, life: rnd(20, 36), max: 36, c: Lx.money ? '#ffd66b' : col }); }
      S.parts.push({ k: 'glow', x: S.hx, y: RIMY, z: 0, r: Lx.money ? 150 : 100, life: 26, max: 26, c: Lx.money ? '#ffd66b' : col });
      if (m === 'swish') addFlash(.35, col);
      addShake(Lx.money ? 9 : 5);
      try { c.sound[mine ? 'good' : 'place'](); } catch (e) {}
      if (mine) { try { if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(m === 'swish' ? [18, 24, 40] : [30]); } catch (e) {} }
    } else if (ev.k === 'floor') {
      A.floorSeen = true; puff(p, 5);
    } else if (ev.k === 'bounce') {
      puff(p, 3); try { c.sound.place(); } catch (e) {}
    }
  }
  const MAKE_TXT = { swish: 'SWISH', bank: 'BANK SHOT', rattle: 'RATTLES IN' };
  const MISS_TXT = { rim: 'RIMMED OUT', board: 'OFF THE GLASS', air: 'AIRBALL' };
  function afterFlight(A) {
    const Lx = A.L, c = S.ctx, mine = Lx.seat === c.me, col = seatCol(Lx.seat), who = seatName(Lx.seat);
    if (Lx.out.r === 'in') {
      if (Lx.money) banner('MONEY BALL', `${who} +2`, '#ffd66b', 96);
      else floatText(MAKE_TXT[Lx.out.m] || 'BUCKET', [S.hx, RIMY + 88, 0], col, true);
    } else {
      floatText(MISS_TXT[Lx.out.m] || 'MISS', [S.hx, RIMY + 70, 0], '#c9d0ff', true);
      try { c.sound[mine ? 'bad' : 'tap'](); } catch (e) {}
    }
    const ev = Lx.ev;
    if (ev === 'win') { const ww = S.st.fin; banner(`${seatName(ww).toUpperCase()} WINS`, S.st.rd >= ROUNDS ? 'in sudden death' : `${S.st.sc[ww]} to ${S.st.sc[1 - ww]}`, seatCol(ww), 140); confetti(seatCol(ww)); addFlash(1, seatCol(ww)); try { c.sound[ww === c.me ? 'win' : 'draw'](); } catch (e) {} }
    else if (ev === 'draw') { banner('DRAW', 'nobody blinked', '#ffd66b', 140); confetti('#ffd66b'); addFlash(1, '#ffd66b'); try { c.sound.draw(); } catch (e) {} }
    else if (ev === 'sd') { banner('SUDDEN DEATH', 'level after 5 rounds', '#ff5a5f', 130); try { c.sound.countdown(); } catch (e) {} }
    else if (ev === 'sdr') { banner('STILL LEVEL', 'next sudden death shot', '#ff5a5f', 90); }
    else if (ev === 'round') { const st = S.st; banner(`ROUND ${st.rd + 1}`, SPOTS[spotOf(st.rd)].nm + (slideOf(st.rd) ? ' · hoop slides' : ''), '#ffd66b', 110); try { c.sound.countdown(); } catch (e) {} }
    else if (Lx.ig) { banner('ON FIRE', `${who} · 3 in a row`, '#ffb13b', 100); try { c.sound.countdown(); } catch (e) {} }
  }
  function finishAnim() {
    const A = S.anim; S.anim = null; S.doneId = A.id; S.catchUp = 24;
    writeSeen(S.st, A.id);
    const c = S.ctx; if (!c) return;
    const Lx = A.L, mine = Lx.seat === c.me, who = seatName(Lx.seat);
    const txt = Lx.out.r === 'in'
      ? `${Lx.out.m === 'swish' ? '🏀 Swish' : Lx.out.m === 'bank' ? '🏀 Bank shot' : '🏀 Rattled in'} — <b>${mine ? 'you' : who}</b> ${Lx.money ? 'hit the money ball, <b>+2</b>' : 'scored <b>+1</b>'}`
      : Lx.out.m === 'rim' ? (mine ? '😬 Rimmed out…' : `😅 ${who} rimmed out`) : Lx.out.m === 'board' ? (mine ? '😬 Off the glass…' : `😅 ${who} hit the glass`) : (mine ? '💨 Airball.' : `🙌 ${who} missed`);
    try { c.msg(txt + (Lx.ig ? ' · 🔥 <b>on fire</b>' : '')); } catch (e) {}
    rerender();                                   // the turn bar / hint were frozen at pre-shot values
    if (S.ctx && S.ctx.state && S.st) maybeReplay(S.st);   // a newer shot queued up behind this one
    ensureLoop();
  }

  /* ---------------- per-frame (cosmetic) ---------------- */
  function hoopTarget() {
    const v = view(), mv = slideOf(v.rd), c = S.ctx;
    if (!mv || !c || c.status !== 'active' || S.st.phase !== 'play') return 0;
    return mv.A * Math.sin(Date.now() / 1000 * 6.283185 / mv.T);      // wall-clock phase: both phones show ≈ the same hoop
  }
  function step() {
    S.tick++;
    const A = S.anim;
    S.hxPrev = S.hx;
    if (A && A.k === 't') {
      S.hx += (A.hxs - S.hx) * (A.hold ? .3 : 1);                    // the hoop freezes where the shot was released
      if (A.hold > 0) A.hold--;
      else if (!A.done) {
        A.sp += (speedAt(A, A.i) - A.sp) * (S.calm ? 1 : .18);
        A.i = Math.min(A.pts.length - 1, A.i + A.sp * (S.turbo || 1));   // S.turbo: test rigs only
        while (A.ei < A.evs.length && A.evs[A.ei].p <= A.i) fireEvent(A, A.evs[A.ei++]);
        A.rot += A.L.s * .22;
        if (A.i >= A.pts.length - 1) {
          while (A.ei < A.evs.length) fireEvent(A, A.evs[A.ei++]);
          A.done = true; afterFlight(A);
        }
      } else A.tail += S.turbo || 1;
      A.ball = ballAt(A);
      if (A.glass) A.glass--;
      if (!A.done && S.tick % 2 === 0) { A.trail.push(A.ball.slice()); if (A.trail.length > 8) A.trail.shift(); }
      if (A.L.f && !A.done && !S.calm) {
        for (let j = 0; j < 2; j++) S.parts.push({ k: 'flame', x: A.ball[0] + rnd(-3, 3), y: A.ball[1] + rnd(-2, 4), z: A.ball[2] + rnd(-3, 3), vx: rnd(-.3, .3), vy: rnd(.5, 1.6), vz: rnd(-.3, .3), life: rnd(12, 22), max: 22, r: rnd(7, 13) });
      }
      if (A.done && A.tail >= TAIL + (A.final ? 40 : 0)) finishAnim();
    } else {
      const t = hoopTarget();
      S.hx = S.catchUp > 0 ? S.hx + (t - S.hx) * .22 : t;
      if (S.catchUp > 0) S.catchUp--;
      if (Math.abs(S.hx - t) < .02) S.hx = t;
    }
    if (S.anim === null && !(A && A.k === 't')) { /* idle */ }
    // the rim grows a little while the shooter is on fire
    const v = S.st ? view() : null, fireNow = v && S.ctx && v.streak[v.turn] >= ON_FIRE && S.st.phase === 'play';
    const rt = fireNow ? RR * FIRE_K : RR; S.rimR += (rt - S.rimR) * .15;
    if (fireNow && !A && !S.calm && S.tick % 2 === 0) {                 // the ball in the shooter's hands is on fire too
      const B = ballNow();
      if (B) S.parts.push({ k: 'flame', x: B.b[0] + rnd(-4, 4), y: B.b[1] + rnd(2, 8), z: B.b[2] + rnd(-4, 4), vx: rnd(-.2, .2), vy: rnd(.5, 1.4), vz: rnd(-.2, .2), life: rnd(14, 24), max: 24, r: rnd(8, 14) });
    }
    netStep();
    stepCam(false);
    const gpf = G / 3600;
    S.parts = S.parts.filter(q => {
      q.life--;
      if (q.k === 'spark') { q.vy -= gpf * .4; q.x += q.vx; q.y += q.vy; q.z += q.vz; if (q.y < 0) { q.y = 0; q.vy *= -.25; q.vx *= .5; q.vz *= .5; } }
      else if (q.k === 'conf') { q.vy -= gpf * .16; q.vx *= .985; q.vz *= .985; q.x += q.vx; q.y += q.vy; q.z += q.vz; q.rot += q.vr; if (q.y < 0) { q.y = 0; q.vy = 0; q.vx *= .6; q.vz *= .6; q.vr *= .6; } }
      else if (q.k === 'dust' || q.k === 'flame') { q.x += q.vx; q.y += q.vy; q.z += q.vz; }
      return q.life > 0;
    });
    if (S.parts.length > 480) S.parts.splice(0, S.parts.length - 480);
    S.floats = S.floats.filter(f => --f.life > 0);
    if (S.banner && ++S.banner.t >= S.banner.dur) S.banner = null;
    S.flash *= .9; if (S.flash < .01) S.flash = 0;
    S.shake *= .86; if (S.shake < .2) S.shake = 0;
    const sh = S.calm ? 0 : S.shake; S.sx = sh ? rnd(-1, 1) * sh : 0; S.sy = sh ? rnd(-1, 1) * sh : 0;
  }
  function ballAt(A) {
    const n = A.pts.length - 1, i = Math.min(n, A.i), a = Math.floor(i), b = Math.min(n, a + 1), t = i - a;
    const p = A.pts[a], q = A.pts[b];
    return [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
  }

  /* ---------------- drawing ---------------- */
  const FOCREF = 1000, FZ = 620;                    // the fence stands 620 cm behind the hoop
  function rr(g, x, y, w, h, r) {
    if (w <= 0 || h <= 0) { g.beginPath(); return; } r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xffffff; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hexA(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`; }

  /* the far city: two silhouette layers on offscreen canvases, slid sideways with the camera (parallax) */
  function buildSky() {
    const R = rng(4417), PWc = 3200, out = {};
    const layer = (h, col, top, wmin, wmax, hmin, hmax, lit, dens) => {
      const c = document.createElement('canvas'); c.width = PWc; c.height = h;
      const b = c.getContext('2d');
      for (let x = -20; x < PWc;) {
        const w = wmin + R() * (wmax - wmin), bh = hmin + R() * (hmax - hmin), y = h - bh;
        const gr = b.createLinearGradient(0, y, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, col);
        b.fillStyle = gr; b.fillRect(x, y, w, bh);
        if (R() < .22) { b.fillRect(x + w * .35, y - 14 - R() * 26, w * .3, 40); b.fillRect(x + w * .48, y - 34 - R() * 16, 2, 30); }   // a stepped crown + antenna
        if (R() < .07) { b.beginPath(); b.ellipse(x + w / 2, y - 7, w * .3, 9, 0, Math.PI, 0); b.fill(); b.fillRect(x + w / 2 - 1.5, y - 7, 3, 7); }   // water tower-ish dome
        for (let wy = y + 9; wy < h - 6; wy += 11) for (let wx = x + 6; wx < x + w - 7; wx += 9) {
          if (R() < dens) { b.fillStyle = R() < .3 ? 'rgba(255,170,120,.85)' : lit; b.fillRect(wx, wy, 4, 5); b.fillStyle = col; }
        }
        x += w + (R() < .3 ? 6 + R() * 18 : 1);
      }
      return c;
    };
    out.far = layer(230, '#3b2a66', '#6a3a86', 34, 82, 70, 190, 'rgba(255,226,170,.7)', .14);
    out.mid = layer(190, '#191238', '#2b1d52', 46, 110, 60, 160, 'rgba(255,214,140,.9)', .10);
    out.W = PWc; return out;
  }
  function poly3(g, pts) {                                      // a world polygon, clipped to the near plane
    const a = clipPoly(pts.map(p => cpt(p[0], p[1], p[2])));
    if (a.length < 3) return false;
    g.beginPath(); a.forEach((q, i) => { const s = scr(q); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); }); g.closePath();
    return true;
  }
  function line3(g, p, q, w) {                                  // a world segment as a screen stroke (w in cm)
    const s = clipSeg(cpt(p[0], p[1], p[2]), cpt(q[0], q[1], q[2]));
    if (!s) return;
    const a = scr(s[0]), b = scr(s[1]);
    g.lineWidth = Math.max(.6, w * (a.k + b.k) / 2);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  }
  function arc3(g, cx, cz, r, a0, a1, w, y, dash) {             // a painted arc on the court (angles from -z, clockwise)
    const n = Math.max(8, Math.round(Math.abs(a1 - a0) * 14));
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n, p = [cx + r * Math.sin(a), y || .1, cz - r * Math.cos(a)];
      if (prev && (!dash || i % 2)) line3(g, prev, p, w);
      prev = p;
    }
  }
  function ellipseAt(g, x, y, z, r) {
    const p = P(x, y, z), px = P(x + r, y, z), pz1 = P(x, y, z + r), pz0 = P(x, y, z - r);
    const rx = Math.abs(px.x - p.x), ry = Math.abs(pz0.y - pz1.y) / 2;
    g.beginPath(); g.ellipse(p.x, (pz0.y + pz1.y) / 2, Math.max(.1, rx), Math.max(.1, ry), 0, 0, 7);
    return { p, rx, ry };
  }

  function drawStatic(g) {
    const c = S.cam, hy = VH * c.cyf + Math.tan(c.pitch) * c.foc, sc = c.foc / FOCREF;
    if (!S.sky) S.sky = buildSky();
    // dusk sky: indigo overhead, a magenta band, a low orange glow at the skyline
    const sk = g.createLinearGradient(0, 0, 0, hy);
    sk.addColorStop(0, '#0b0d2b'); sk.addColorStop(.42, '#2b1a63'); sk.addColorStop(.72, '#8a2f78'); sk.addColorStop(.9, '#ee6a59'); sk.addColorStop(1, '#ffb066');
    g.fillStyle = sk; g.fillRect(0, 0, VW, hy + 2);
    const panX = -c.yaw * c.foc;                                      // infinite-distance shift from turning
    const sunX = VW / 2 + panX + 250 * sc;
    g.globalCompositeOperation = 'lighter';
    const sg = g.createRadialGradient(sunX, hy - 10, 6, sunX, hy - 10, 330 * sc); sg.addColorStop(0, 'rgba(255,170,90,.55)'); sg.addColorStop(1, 'rgba(255,120,80,0)');
    g.fillStyle = sg; g.fillRect(0, 0, VW, hy + 4);
    g.globalCompositeOperation = 'source-over';
    const R = rng(91);
    for (let i = 0; i < 46; i++) {                                    // a few early stars, high up
      const sx = ((R() * 3200 - 1600) * sc + VW / 2 + panX) , sy2 = R() * hy * .42, sa = .25 + R() * .5;
      if (sx < 0 || sx > VW) continue;
      g.fillStyle = `rgba(255,255,255,${sa * (1 - sy2 / (hy * .5))})`; g.fillRect(sx, sy2, 1.6, 1.6);
    }
    const drawLayer = (cv, dist, hh) => {
      const w = S.sky.W * sc, h = hh * sc, x0 = VW / 2 - w / 2 + panX - (c.x * c.foc) / dist;
      g.drawImage(cv, x0, hy - h + 1, w, h);
    };
    drawLayer(S.sky.far, 6500, 230);
    drawLayer(S.sky.mid, 2600, 190);
    // the ground beyond the fence
    const gg = g.createLinearGradient(0, hy, 0, VH); gg.addColorStop(0, '#1a1232'); gg.addColorStop(1, '#0c0a1c');
    g.fillStyle = gg; g.fillRect(0, hy, VW, VH - hy);
    // the yard, then the court on it
    const yard = [[-1000, 0, -1500], [1000, 0, -1500], [1000, 0, FZ], [-1000, 0, FZ]];
    if (poly3(g, yard)) { g.fillStyle = '#19203e'; g.fill(); }
    const court = [[-740, 0, -1400], [740, 0, -1400], [740, 0, 157], [-740, 0, 157]];
    if (poly3(g, court)) {
      const near = P(0, 0, c.z + 80), far = P(0, 0, 157);
      const cg = g.createLinearGradient(0, far.y, 0, Math.max(far.y + 10, near.y));
      cg.addColorStop(0, '#3d4c86'); cg.addColorStop(.5, '#2b3766'); cg.addColorStop(1, '#1b2347');
      g.fillStyle = cg; g.fill();
    }
    // paint: the key is plum, lines are chalk white
    if (poly3(g, [[-245, .05, -423], [245, .05, -423], [245, .05, 157], [-245, .05, 157]])) { g.fillStyle = 'rgba(124,48,116,.8)'; g.fill(); }
    g.strokeStyle = 'rgba(244,240,255,.82)'; g.lineCap = 'round';
    const W0 = 5;
    line3(g, [-740, .1, 157], [740, .1, 157], W0); line3(g, [-740, .1, 157], [-740, .1, -1400], W0); line3(g, [740, .1, 157], [740, .1, -1400], W0);
    line3(g, [-245, .1, 157], [-245, .1, -423], W0); line3(g, [245, .1, 157], [245, .1, -423], W0); line3(g, [-245, .1, -423], [245, .1, -423], W0);
    arc3(g, 0, -423, 180, -Math.PI / 2, Math.PI / 2, W0, .1, false);                 // free-throw circle, the half facing the hoop
    arc3(g, 0, -423, 180, Math.PI / 2, Math.PI * 1.5, W0 * .8, .1, true);            // …and its dashed half
    arc3(g, 0, 0, 125, -Math.PI / 2, Math.PI / 2, W0 * .8, .1, false);               // the restricted arc
    arc3(g, 0, 0, 675, -1.4706, 1.4706, W0, .1, false);                              // the three-point line
    line3(g, [-670, .1, 157], [-670, .1, -80], W0); line3(g, [670, .1, 157], [670, .1, -80], W0);
    // warm light pools under the floods
    g.globalCompositeOperation = 'lighter';
    [[-480, 140, 360, .2], [480, 140, 360, .2], [0, -300, 520, .13]].forEach(([x, z, r, a]) => {
      const e = ellipseAt(g, x, 0, z, r), rg = g.createRadialGradient(e.p.x, e.p.y, 0, e.p.x, e.p.y, Math.max(e.rx, 1));
      rg.addColorStop(0, `rgba(255,214,160,${a})`); rg.addColorStop(1, 'rgba(255,214,160,0)');
      g.save(); g.translate(e.p.x, e.p.y); g.scale(1, Math.max(.04, e.ry / Math.max(e.rx, .1))); g.translate(-e.p.x, -e.p.y);
      g.fillStyle = rg; g.beginPath(); g.arc(e.p.x, e.p.y, e.rx, 0, 7); g.fill(); g.restore();
    });
    g.globalCompositeOperation = 'source-over';
    drawFence(g);
    drawFloods(g);
  }
  // chain-link: a diamond lattice between posts, a top rail. Three sides of the yard.
  function fencePlane(g, a, b, h) {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.sqrt(dx * dx + dz * dz), ux = dx / len, uz = dz / len;
    const at = (t, y) => [a[0] + ux * t, y, a[1] + uz * t];
    g.strokeStyle = 'rgba(190,200,235,.3)';
    const step = 30;
    g.beginPath();
    for (let t0 = -h; t0 < len; t0 += step) {
      [1, -1].forEach(sg => {                                   // / lines and \ lines, clipped to the panel
        let ta = t0, tb = t0 + h, ya = 0, yb = h;
        if (sg < 0) { ta = t0 + h; tb = t0; }
        const lo = Math.min(ta, tb), hi = Math.max(ta, tb);
        if (hi < 0 || lo > len) return;
        const f = t => (sg > 0 ? t - t0 : t0 + h - t);
        const s0 = clamp(lo, 0, len), s1 = clamp(hi, 0, len);
        const p = at(s0, f(s0)), q = at(s1, f(s1));
        const cs = clipSeg(cpt(p[0], p[1], p[2]), cpt(q[0], q[1], q[2]));
        if (!cs) return;
        const A = scr(cs[0]), B = scr(cs[1]); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y);
      });
    }
    g.lineWidth = 1; g.stroke();
    g.strokeStyle = 'rgba(210,218,245,.55)';
    line3(g, at(0, h), at(len, h), 2.2);                       // top rail
    for (let t = 0; t <= len + 1; t += 300) line3(g, at(t, 0), at(t, h), 2.6);   // posts
  }
  function drawFence(g) {
    fencePlane(g, [-1000, FZ], [1000, FZ], 430);
    fencePlane(g, [-1000, -1100], [-1000, FZ], 430);
    fencePlane(g, [1000, FZ], [1000, -1100], 430);
  }
  function drawFloods(g) {
    [[-900, FZ + 10], [900, FZ + 10]].forEach(([x, z]) => {
      const foot = P(x, 0, z), top = P(x, 445, z);
      g.strokeStyle = '#2b2748'; g.lineWidth = Math.max(2, 9 * top.k); g.lineCap = 'butt';
      g.beginPath(); g.moveTo(foot.x, foot.y); g.lineTo(top.x, top.y); g.stroke();
      const hw = 70 * top.k, hh = 26 * top.k;
      g.fillStyle = '#1b1836'; g.fillRect(top.x - hw, top.y - hh, hw * 2, hh * 2);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const lx = top.x - hw + hw * (i + .5) * 2 / 3, ly = top.y - hh + hh * (j + .5), gl = g.createRadialGradient(lx, ly, 0, lx, ly, 34 * top.k + 10);
        gl.addColorStop(0, 'rgba(255,248,225,.95)'); gl.addColorStop(.25, 'rgba(255,226,170,.4)'); gl.addColorStop(1, 'rgba(255,200,130,0)');
        g.fillStyle = gl; g.fillRect(lx - 70, ly - 70, 140, 140);
      }
      // the beam: a soft cone toward the court
      const base = P(x * .3, 0, -40), bw = 230 * base.k;
      const bg = g.createLinearGradient(top.x, top.y, base.x, base.y);
      bg.addColorStop(0, 'rgba(255,226,170,.16)'); bg.addColorStop(1, 'rgba(255,226,170,0)');
      g.fillStyle = bg; g.beginPath(); g.moveTo(top.x - hw, top.y); g.lineTo(top.x + hw, top.y); g.lineTo(base.x + bw, base.y); g.lineTo(base.x - bw, base.y); g.closePath(); g.fill();
      g.globalCompositeOperation = 'source-over';
    });
  }

  function draw() {
    const g = S.g, c = S.ctx, st = S.st; if (!g || !c || !st) return;
    if (!S.W) fit(); if (!S.W) return;
    if (!S.cam) stepCam(true); else setCam();
    g.setTransform(S.k, 0, 0, S.k, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // the still world is cached per camera; it is redrawn live only while the camera glides or the screen shakes
    const cam = S.cam;
    if (camSettled() && !S.sx && !S.sy) {
      const key = view().spot + '|' + S.W + 'x' + S.H + '|' + Math.round(cam.foc);
      if (!S.stat || S.stat.key !== key) {
        const cvs = document.createElement('canvas'); cvs.width = S.W; cvs.height = S.H;
        const b = cvs.getContext('2d'); b.setTransform(S.k, 0, 0, S.k, 0, 0);
        const go = S.g; S.g = b; try { drawStatic(b); } finally { S.g = go; }
        S.stat = { key, c: cvs };
      }
      g.drawImage(S.stat.c, 0, 0, VW, VH);
    } else drawStatic(g);
    drawSpots(g);
    drawShadow(g);
    drawHoopAndBall(g);
    drawParts(g);
    drawAimGuide(g);
    drawFloats(g);
    drawVignette(g);
    drawHud(g);
    drawBanner(g);
    if (S.flash > .01) { g.globalAlpha = S.flash * .4; g.fillStyle = S.flashC; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; }
  }

  // the five spots painted on the court; this round's glows in the shooter's colour
  function drawSpots(g) {
    const v = view(), st = S.st, active = v.spot, col = seatCol(v.turn), live = st.phase === 'play';
    SPOTS.forEach((sp, i) => {
      const on = i === active && live;
      const e = ellipseAt(g, sp.x, .2, sp.z, on ? 30 : 17);
      g.fillStyle = on ? hexA(col, .26) : 'rgba(255,255,255,.07)'; g.fill();
      g.strokeStyle = on ? hexA(col, .95) : 'rgba(255,255,255,.3)'; g.lineWidth = on ? 3 : 1.5; g.stroke();
      if (on) { ellipseAt(g, sp.x, .2, sp.z, 12); g.fillStyle = hexA(col, .9); g.fill(); }
    });
  }
  function ballNow() {
    const A = S.anim, v = view(), st = S.st, c = S.ctx;
    if (A && A.k === 't') return { b: A.ball, rot: A.rot, fire: !!A.L.f, seat: A.L.seat, flying: true, money: !!A.L.money };
    if (pending() || st.phase !== 'play' || c.status !== 'active') return null;
    const sp = SPOTS[v.spot];
    let x = sp.x, y = REL_Y, z = sp.z;
    if (S.drag && c.isMyTurn) {                                  // the ball follows the pull a little
      const lat = clamp(S.drag.x - S.drag.x0, -60, 60) / S.drag.W * 70, up = clamp(S.drag.y0 - S.drag.y, 0, 200) / S.drag.H * 40;
      x += lat * sp.fz; z -= lat * sp.fx; y -= up;
    }
    return { b: [x, y, z], rot: .45, fire: v.streak[v.turn] >= ON_FIRE, seat: v.turn, flying: false, money: isMoney({ rd: v.rd, sh: v.sh }) };
  }
  function drawShadow(g) {
    const B = ballNow(); if (!B) return;
    const b = B.b, h = Math.max(0, b[1] - BR);
    const e = ellipseAt(g, b[0], .3, b[2], BR * (1.05 + h / 260));
    g.fillStyle = `rgba(0,0,0,${.5 * clamp(1 - h / 420, .12, 1)})`; g.fill();
    if (B.fire || B.money) {
      g.globalCompositeOperation = 'lighter'; ellipseAt(g, b[0], .3, b[2], BR * 4.5);
      g.fillStyle = B.money && !B.fire ? `rgba(255,214,107,${.2 * clamp(1 - h / 200, 0, 1)})` : `rgba(255,140,40,${.22 * clamp(1 - h / 200, 0, 1)})`; g.fill();
      g.globalCompositeOperation = 'source-over';
    }
  }

  /* ---------------- hoop, net, ball ---------------- */
  const NR = 28;
  function rimPt(hx, R, y, a, dz) { return [hx + R * Math.cos(a), y, R * Math.sin(a) + (dz || 0)]; }
  function drawBoard(g, hx, glassT) {
    const fire = view().streak[view().turn] >= ON_FIRE && S.st.phase === 'play', col = fire ? '#ff9a3c' : seatCol(view().turn);
    // stanchion + arm behind the board
    const gp = P(hx, 0, BZ + 90), tp = P(hx, BBOT + 10, BZ + 90);
    g.strokeStyle = '#2a2547'; g.lineWidth = Math.max(3, 13 * gp.k); g.lineCap = 'butt'; g.beginPath(); g.moveTo(gp.x, gp.y); g.lineTo(tp.x, tp.y); g.stroke();
    const a0 = P(hx, BBOT + 10, BZ + 90), a1 = P(hx, BBOT + 26, BZ + 4);
    g.lineWidth = Math.max(3, 10 * a1.k); g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(a1.x, a1.y); g.stroke();
    // the glass
    const q = [[hx - BHW, BBOT, BZ], [hx + BHW, BBOT, BZ], [hx + BHW, BTOP, BZ], [hx - BHW, BTOP, BZ]];
    if (poly3(g, q)) {
      const top = P(hx, BTOP, BZ), bot = P(hx, BBOT, BZ), gr = g.createLinearGradient(0, top.y, 0, bot.y);
      gr.addColorStop(0, 'rgba(200,228,255,.30)'); gr.addColorStop(1, 'rgba(150,190,255,.14)');
      g.fillStyle = gr; g.fill();
      if (glassT) { g.fillStyle = `rgba(255,255,255,${glassT / 14 * .4})`; g.fill(); }
      g.strokeStyle = 'rgba(236,244,255,.95)'; g.lineWidth = Math.max(2, 3.4 * top.k); g.lineJoin = 'round'; g.stroke();
      // a soft sheen streak
      g.save(); g.clip(); g.globalCompositeOperation = 'lighter';
      const s0 = P(hx - BHW * .55, BTOP, BZ), s1 = P(hx - BHW * .1, BBOT, BZ), sw = 26 * top.k;
      const sh = g.createLinearGradient(s0.x - sw, 0, s0.x + sw, 0); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(.5, 'rgba(255,255,255,.16)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = sh; g.beginPath(); g.moveTo(s0.x - sw, s0.y); g.lineTo(s0.x + sw, s0.y); g.lineTo(s1.x + sw, s1.y); g.lineTo(s1.x - sw, s1.y); g.closePath(); g.fill();
      g.restore();
      // the shooter's square, lit in the shooter's colour
      const sq = [[hx - 30, RIMY + 5, BZ], [hx + 30, RIMY + 5, BZ], [hx + 30, RIMY + 50, BZ], [hx - 30, RIMY + 50, BZ]];
      if (poly3(g, sq)) { g.globalCompositeOperation = 'lighter'; g.strokeStyle = hexA(col, .95); g.lineWidth = Math.max(1.6, 2.4 * top.k); g.stroke(); g.globalCompositeOperation = 'source-over'; }
    }
    // the bracket that holds the ring to the glass
    const b0 = P(hx, RIMY, BZ), b1 = P(hx, RIMY, RR + 1);
    g.strokeStyle = '#ff7a2a'; g.lineWidth = Math.max(2, 5 * b0.k); g.beginPath(); g.moveTo(b0.x, b0.y); g.lineTo(b1.x, b1.y); g.stroke();
  }
  function ringHalf(g, hx, R, back, col, wcm) {
    g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
    let prev = null;
    for (let i = 0; i <= NR; i++) {
      const a = i / NR * Math.PI * 2, p = rimPt(hx, R, RIMY, a), isBack = p[2] >= 0;
      if (prev && isBack === back && prev[1] === back) line3(g, prev[0], p, wcm);
      prev = [p, isBack];
    }
  }
  // the net: diamond mesh, each row a spring the ball pushes out. Back and front passes so the ball sits inside it.
  function netPts(hx, R) {
    const rows = [];
    for (let j = 0; j < NROWS; j++) {
      const t = j / (NROWS - 1), n = S.net[j] || { r: 0, ox: 0, oz: 0, dy: 0 }, rj = R * (1 - .42 * t) + n.r, y = RIMY - 3 - NETH * t + n.dy;
      const row = [];
      for (let i = 0; i < NCOL; i++) { const a = i / NCOL * Math.PI * 2 + (j % 2 ? Math.PI / NCOL : 0); row.push([hx + n.ox + rj * Math.cos(a), y, n.oz + rj * Math.sin(a)]); }
      rows.push(row);
    }
    return rows;
  }
  function drawNet(g, hx, R, front) {
    if (!S.net.length) netInit();
    const rows = netPts(hx, R), t0 = P(hx, RIMY, 0);
    g.strokeStyle = front ? 'rgba(255,255,255,.88)' : 'rgba(255,255,255,.5)'; g.lineCap = 'round';
    const w = 1.15;
    for (let j = 0; j < NROWS - 1; j++) for (let i = 0; i < NCOL; i++) {
      const i2 = (i + 1) % NCOL, a = rows[j][i], b1 = rows[j + 1][i2], b2 = rows[j + 1][i];
      const c1 = [(a[0] + b1[0]) / 2, 0, (a[2] + b1[2]) / 2], c2 = [(rows[j][i2][0] + b2[0]) / 2, 0, (rows[j][i2][2] + b2[2]) / 2];
      if ((c1[2] < 0) === front) line3(g, a, b1, w);
      if ((c2[2] < 0) === front) line3(g, rows[j][i2], b2, w);
    }
    // the bottom hem
    const last = rows[NROWS - 1];
    for (let i = 0; i < NCOL; i++) { const a = last[i], b = last[(i + 1) % NCOL]; if (((a[2] + b[2]) / 2 < 0) === front) line3(g, a, b, w * 1.2); }
    void t0;
  }
  function drawBallAt(g, x, y, r, o) {
    o = o || {};
    if (o.fire || o.money) {
      g.globalCompositeOperation = 'lighter';
      const gl = g.createRadialGradient(x, y, 0, x, y, r * 3.2);
      if (o.fire) { gl.addColorStop(0, 'rgba(255,170,60,.6)'); gl.addColorStop(1, 'rgba(255,90,20,0)'); }
      else { gl.addColorStop(0, 'rgba(255,214,107,.5)'); gl.addColorStop(1, 'rgba(255,214,107,0)'); }
      g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 3.2, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    const bg = g.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
    if (o.fire) { bg.addColorStop(0, '#fff2b0'); bg.addColorStop(.5, '#ff9a2e'); bg.addColorStop(1, '#c2400f'); }
    else { bg.addColorStop(0, '#ffb066'); bg.addColorStop(.55, '#e8742a'); bg.addColorStop(1, '#8e3810'); }
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    // seams roll with the backspin: three great circles of the ball, seen from behind
    g.save(); g.beginPath(); g.arc(x, y, r, 0, 7); g.clip();
    g.strokeStyle = 'rgba(40,14,4,.85)'; g.lineWidth = Math.max(.8, r * .075); g.lineCap = 'round';
    const th = o.rot || 0, sT = Math.sin(th), cT = Math.cos(th), M = 20;
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x, y + r); g.stroke();                          // the meridian that contains the spin axis
    const seam = fn => { g.beginPath(); let pen = false; for (let i = 0; i <= M * 2; i++) { const f = i / M * Math.PI, q = fn(f); if (q.z < 0) { const px = x + q.x * r, py = y + q.y * r; pen ? g.lineTo(px, py) : g.moveTo(px, py); pen = true; } else pen = false; } g.stroke(); };
    seam(f => ({ x: Math.cos(f), y: -Math.sin(f) * sT, z: Math.sin(f) * cT }));               // equator
    if (Math.abs(sT) > .08) seam(f => ({ x: Math.cos(f), y: Math.sin(f) * cT, z: Math.sin(f) * sT }));   // the ring through the poles
    // a little roundness
    const sh = g.createRadialGradient(x - r * .4, y - r * .45, r * .1, x, y, r * 1.05); sh.addColorStop(0, 'rgba(255,255,255,.28)'); sh.addColorStop(.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = sh; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    g.restore();
  }
  function drawBallWorld(g, B) {
    const b = B.b, p = P(b[0], b[1], b[2]);
    if (p.zc < 14) return;
    const A = S.anim, col = seatCol(B.seat), r = BR * p.k;
    if (B.flying && A) {
      g.globalCompositeOperation = 'lighter';
      if (A.trail.length && !S.calm) A.trail.forEach((q, j) => {                   // motion ghosts
        const tp = P(q[0], q[1], q[2]), a = (j + 1) / A.trail.length;
        g.fillStyle = B.fire ? `rgba(255,140,40,${.3 * a})` : hexA(col, .28 * a);
        g.beginPath(); g.arc(tp.x, tp.y, Math.max(1.5, BR * tp.k * (.5 + .5 * a)), 0, 7); g.fill();
      });
      const hr = Math.max(10, r * 2.4), hl = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, hr);
      hl.addColorStop(0, hexA(B.fire ? '#ffb13b' : col, .42)); hl.addColorStop(1, hexA(B.fire ? '#ffb13b' : col, 0));
      g.fillStyle = hl; g.beginPath(); g.arc(p.x, p.y, hr, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-over';
    } else if (!S.calm) {
      // the idle ball in the shooter's hands: a halo in their colour
      g.globalCompositeOperation = 'lighter';
      const gl = g.createRadialGradient(p.x, p.y, r * .8, p.x, p.y, r * 2.2); gl.addColorStop(0, hexA(col, .3)); gl.addColorStop(1, hexA(col, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(p.x, p.y, r * 2.2, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    }
    drawBallAt(g, p.x, p.y, Math.max(3, r), { fire: B.fire, money: B.money && !B.flying, rot: B.rot });
  }
  function drawHoopAndBall(g) {
    const A = S.anim, hx = S.hx, R = S.rimR, B = ballNow();
    const fire = view().streak[view().turn] >= ON_FIRE && S.st.phase === 'play';
    drawBoard(g, hx, A && A.glass);
    // the ball behind the ring (banked off the glass) sits between the board and the rim's front
    const inFront = B && B.b[2] < -R - 4 && B.b[1] > 0, behind = B && B.b[2] > R + 2;
    if (B && behind) drawBallWorld(g, B);
    const rimCol = fire ? '#ffb13b' : '#ff6a1f';
    g.globalCompositeOperation = 'source-over';
    ringHalf(g, hx, R, true, rimCol, RT * 2.4);
    drawNet(g, hx, R, false);
    if (B && !behind && !inFront) drawBallWorld(g, B);
    drawNet(g, hx, R, true);
    ringHalf(g, hx, R, false, rimCol, RT * 2.6);
    if (fire && !S.calm) {                                        // the rim glows while the shooter is on fire
      g.globalCompositeOperation = 'lighter';
      const p = P(hx, RIMY, 0), gl = g.createRadialGradient(p.x, p.y, R * p.k * .6, p.x, p.y, R * p.k * 2.2);
      gl.addColorStop(0, 'rgba(255,150,40,.3)'); gl.addColorStop(1, 'rgba(255,100,20,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(p.x, p.y, R * p.k * 2.2, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over';
    }
    if (B && inFront) drawBallWorld(g, B);
  }

  function drawParts(g) {
    S.parts.forEach(q => {
      const a = q.life / q.max;
      if (q.k === 'dust') { const p = P(q.x, q.y, q.z); g.fillStyle = `rgba(255,240,220,${a * .3})`; g.beginPath(); g.arc(p.x, p.y, Math.max(.6, q.r * p.k * (1.6 - a)), 0, 7); g.fill(); }
      else if (q.k === 'conf') {
        const p = P(q.x, q.y, q.z); g.save(); g.translate(p.x, p.y); g.rotate(q.rot); g.globalAlpha = Math.min(1, a * 2);
        g.fillStyle = q.c; const s = q.s * p.k; g.fillRect(-s / 2, -s * .3, s, s * .6 * (.4 + Math.abs(Math.sin(q.rot * 2)) * .6)); g.restore();
      }
    });
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'lighter';
    S.parts.forEach(q => {
      const a = q.life / q.max;
      if (q.k === 'spark') { const p = P(q.x, q.y, q.z); g.fillStyle = hexA(q.c, a); g.beginPath(); g.arc(p.x, p.y, Math.max(.9, 1.1 * p.k), 0, 7); g.fill(); }
      else if (q.k === 'flame') {
        const p = P(q.x, q.y, q.z), r = q.r * p.k * (.6 + .6 * a), gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, `rgba(255,220,120,${.7 * a})`); gr.addColorStop(.5, `rgba(255,120,30,${.45 * a})`); gr.addColorStop(1, 'rgba(255,60,20,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
      } else if (q.k === 'glow') {
        const p = P(q.x, q.y, q.z), r = q.r * p.k * (1.3 - a * .3), gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        gr.addColorStop(0, `rgba(255,255,255,${.7 * a})`); gr.addColorStop(.3, hexA(q.c, .5 * a)); gr.addColorStop(1, hexA(q.c, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
      }
    });
    g.globalCompositeOperation = 'source-over';
  }

  // a faint arc for your first few shots; it shortens as you learn and is gone after FADE shots
  const FADE = 7;
  function drawAimGuide(g) {
    if (!S.drag || !S.aim || !S.aimSim) return;
    const me = S.ctx.me, lvl = clamp(1 - S.st.thr[me] / FADE, 0, 1), col = seatCol(me);
    if (lvl > 0) {
      const pts = S.aimSim.pts;
      let stop = pts.length - 1; const ev0 = S.aimSim.evs[0]; if (ev0) stop = Math.min(stop, ev0.p);
      const show = Math.round(stop * (.35 + .65 * lvl));
      for (let i = 2; i <= show; i += 2) {
        const p = pts[i], q = P(p[0], p[1], p[2]), t = i / Math.max(1, show);
        if (q.y < -10 || q.y > VH) continue;
        g.fillStyle = hexA(col, (.16 + .5 * lvl) * (1 - t * .65));
        g.beginPath(); g.arc(q.x, q.y, Math.max(1.4, 3.4 * q.k * .3 * (1 - t * .3)), 0, 7); g.fill();
      }
    }
    // power meter, always while you pull
    const pw = S.aim.power, x = VW - 26, y0 = VH - 190, hgt = 130;
    rr(g, x - 7, y0, 14, hgt, 7); g.fillStyle = 'rgba(5,7,15,.6)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.stroke();
    const pg = g.createLinearGradient(0, y0 + hgt, 0, y0); pg.addColorStop(0, hexA(col, .6)); pg.addColorStop(1, '#ffd66b');
    rr(g, x - 5, y0 + hgt - 2 - (hgt - 4) * pw, 10, (hgt - 4) * pw, 5); g.fillStyle = pg; g.fill();
    g.font = '800 20px Orbitron, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.fillStyle = '#ffd66b';
    g.fillText(Math.round(pw * 100) + '%', x - 6, y0 - 6);
  }
  function drawFloats(g) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    S.floats.forEach(f => {
      const age = 1 - f.life / f.max, p = P(f.x, f.y + age * 22, f.z), a = Math.min(1, f.life / 22);
      const sc = age < .12 ? .5 + age * 4.2 : 1, size = Math.round((f.big ? 40 : 28) * sc);
      g.font = `900 ${size}px Orbitron, system-ui, sans-serif`; g.globalAlpha = a;
      g.lineWidth = 7; g.strokeStyle = 'rgba(5,7,15,.88)'; g.strokeText(f.text, clamp(p.x, 90, VW - 90), p.y);
      g.fillStyle = f.c; g.fillText(f.text, clamp(p.x, 90, VW - 90), p.y); g.globalAlpha = 1;
    });
  }
  function drawVignette(g) {
    if (!S.vig) { const v = g.createRadialGradient(VW / 2, VH * .45, VH * .32, VW / 2, VH * .5, VH * .8); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)'); S.vig = v; }
    g.fillStyle = S.vig; g.fillRect(0, 0, VW, VH);
  }

  /* ---------------- scoreboard HUD ---------------- */
  function drawHud(g) {
    const c = S.ctx, st = S.st, v = view();
    const sd = v.rd >= ROUNDS, live = st.phase === 'play' && c.status === 'active';
    const PW = 168, PH = 96, PY = 10;
    [0, 1].forEach(p => {
      const x = p ? VW - 12 - PW : 12, col = seatCol(p), active = live && v.turn === p;
      rr(g, x, PY, PW, PH, 16); g.fillStyle = 'rgba(8,10,26,.74)'; g.fill();
      g.strokeStyle = hexA(col, active ? .95 : .3); g.lineWidth = active ? 3 : 1.5; g.stroke();
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = col;
      let nm = seatName(p).toUpperCase(), size = 21; g.font = `800 ${size}px "Chakra Petch", system-ui, sans-serif`;
      while (g.measureText(nm).width > PW - 30 && size > 14) { size--; g.font = `800 ${size}px "Chakra Petch", system-ui, sans-serif`; }
      g.fillText(nm + (c.me === p ? ' (you)' : ''), x + 14, PY + 25, PW - 24);
      g.textAlign = 'right'; g.fillStyle = '#ffffff'; g.font = '900 46px Orbitron, system-ui, sans-serif';
      g.fillText(String(v.sc[p]), x + PW - 14, PY + 69);
      // this round's balls: hollow = still to come, filled = made, cross = missed, gold ring = the money ball
      const base = sd ? 15 + (v.rd - ROUNDS) : v.rd * PER, n = sd ? 1 : PER, taken = v.rec[p].slice(base, base + n);
      for (let j = 0; j < n; j++) {
        const px = x + 24 + j * 30, py = PY + 72, money = !sd && j === PER - 1, ch = taken[j], rad = money ? 11 : 9;
        const now = active && j === taken.length;
        g.beginPath(); g.arc(px, py, rad, 0, 7);
        if (ch === '1' || ch === '2') { g.fillStyle = ch === '2' ? '#ffd66b' : col; g.fill(); }
        else { g.fillStyle = 'rgba(255,255,255,.05)'; g.fill(); }
        g.lineWidth = now ? 3 : 1.8; g.strokeStyle = money ? '#ffd66b' : now ? '#ffffff' : hexA(col, .55); g.stroke();
        if (ch === '0') { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(px - 4, py - 4); g.lineTo(px + 4, py + 4); g.moveTo(px + 4, py - 4); g.lineTo(px - 4, py + 4); g.stroke(); }
        if (money && !ch) { g.fillStyle = '#ffd66b'; g.font = '900 15px Orbitron, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('2', px, py + 1); }
      }
      if (live && v.streak[p] >= ON_FIRE) {
        const fx = x + PW / 2, fy = PY + PH + 20;
        rr(g, fx - 58, fy - 15, 116, 30, 15); g.fillStyle = 'rgba(255,120,30,.3)'; g.fill(); g.strokeStyle = 'rgba(255,170,60,.9)'; g.lineWidth = 1.8; g.stroke();
        g.textAlign = 'center'; g.font = '900 20px Orbitron, system-ui, sans-serif'; g.fillStyle = '#ffc261'; g.fillText('ON FIRE', fx, fy + 1);
      }
    });
    // centre: round + spot
    const cx = VW / 2; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '900 24px Orbitron, system-ui, sans-serif'; g.fillStyle = sd ? '#ff6b6b' : '#ffffff';
    g.fillText(sd ? 'SUDDEN DEATH' : `ROUND ${Math.min(v.rd + 1, ROUNDS)}/${ROUNDS}`, cx, PY + 26, 210);
    g.font = '700 21px "Chakra Petch", system-ui, sans-serif'; g.fillStyle = 'rgba(235,240,255,.9)';
    g.fillText(SPOTS[v.spot].nm, cx, PY + 54, 210);
    if (slideOf(v.rd)) { g.font = '800 20px "Chakra Petch", system-ui, sans-serif'; g.fillStyle = '#ffa24d'; g.fillText('HOOP SLIDES', cx, PY + 82, 210); }
    if (live) {                                                    // who is up, bottom centre
      const money = !sd && v.sh % PER === PER - 1, who = seatName(v.turn), col = seatCol(v.turn);
      const label = sd ? `${who.toUpperCase()} · SUDDEN DEATH` : `${who.toUpperCase()} · BALL ${(v.sh % PER) + 1}/${PER}`;
      g.font = '800 21px Orbitron, system-ui, sans-serif';
      const w = g.measureText(label).width + 40, y = VH - 38;
      rr(g, cx - w / 2, y - 20, w, 40, 20); g.fillStyle = 'rgba(5,7,15,.7)'; g.fill(); g.strokeStyle = hexA(money ? '#ffd66b' : col, .75); g.lineWidth = 2; g.stroke();
      g.fillStyle = col; g.textAlign = 'center'; g.fillText(label, cx, y + 1);
      if (money && !S.anim && !pending()) { const B = ballNow(), bp = B ? P(B.b[0], B.b[1], B.b[2]) : null, my = bp ? clamp(bp.y - BR * bp.k - 34, 130, y - 50) : y - 50; rr(g, cx - 92, my - 17, 184, 34, 17); g.fillStyle = 'rgba(255,200,60,.22)'; g.fill(); g.strokeStyle = 'rgba(255,214,107,.9)'; g.lineWidth = 2; g.stroke(); g.font = '900 19px Orbitron, system-ui, sans-serif'; g.fillStyle = '#ffd66b'; g.fillText('MONEY BALL ×2', cx, my + 1); }
    }
  }
  function drawBanner(g) {
    let B = S.banner;
    const st = S.st, c = S.ctx;
    if (!B && !S.anim && c && st && (c.status === 'finished' || st.phase === 'done') && st.fin !== -1 && !pending()) {    // the final word stays up
      B = st.fin === 'draw' ? { text: 'DRAW', sub: `${st.sc[0]} - ${st.sc[1]} after sudden death`, c: '#ffd66b', t: 40, dur: 1e9 }
        : { text: `${seatName(st.fin).toUpperCase()} WINS`, sub: `${st.sc[st.fin]} to ${st.sc[1 - st.fin]}`, c: seatCol(st.fin), t: 40, dur: 1e9 };
    }
    if (!B) return;
    const t = B.t, a = t < 10 ? t / 10 : t > B.dur - 16 ? (B.dur - t) / 16 : 1, sc = t < 12 ? .6 + .4 * ease(t / 12) + Math.sin(t / 12 * Math.PI) * .08 : 1;
    const y = VH * .46;
    g.save(); g.globalAlpha = Math.max(0, a);
    const band = g.createLinearGradient(0, y - 70, 0, y + 70); band.addColorStop(0, 'rgba(5,4,12,0)'); band.addColorStop(.5, 'rgba(5,4,12,.74)'); band.addColorStop(1, 'rgba(5,4,12,0)');
    g.fillStyle = band; g.fillRect(0, y - 70, VW, 140);
    g.translate(VW / 2, y); g.scale(sc, sc);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 62; g.font = `900 ${size}px Orbitron, system-ui, sans-serif`;
    while (g.measureText(B.text).width > VW * .86 && size > 30) { size -= 4; g.font = `900 ${size}px Orbitron, system-ui, sans-serif`; }
    g.globalCompositeOperation = 'lighter';
    [[16, .16], [8, .3]].forEach(([w, al]) => { g.lineWidth = w; g.strokeStyle = hexA(B.c, al); g.strokeText(B.text, 0, -8); });
    g.globalCompositeOperation = 'source-over';
    g.lineWidth = 3; g.strokeStyle = 'rgba(5,7,15,.9)'; g.strokeText(B.text, 0, -8);
    g.fillStyle = '#fff'; g.fillText(B.text, 0, -8);
    g.lineWidth = 1.6; g.strokeStyle = B.c; g.strokeText(B.text, 0, -8);
    if (B.sub) { g.font = '700 22px "Chakra Petch", system-ui, sans-serif'; g.fillStyle = B.c; g.fillText(B.sub, 0, 38); }
    g.restore();
  }

  // a timeout can leave the game decided but not closed (skipTurn can't end a match). The turn-holder
  // closes it at once; the other phone after a grace, so an absent player can't strand it.
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
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* ---------------- registration ---------------- */
  const DEF = {
    id: 'hoops', name: 'Basketball Hoops', emoji: '🏀', category: 'Arcade', accent: '#ff8a3d',
    tagline: 'Swipe to shoot · 5 rounds · the last ball of each round is worth 2.',
    // the last shot is still in the air when the match finishes: hold the result card until it lands
    // review #2: the final-shot replay (slow-mo) runs up to ~7.8 s — never let the result card spoil it (ui caps at 8 s)
    resultDelay: () => { const ms = remainingMs(); return ms ? Math.min(8000, ms + 350) : 0; },
    clockGrace: 6000,                                    // review #1: the next shooter can act only after the replay (up to ~6.1 s)
    // timer ran out ("Chance gone"): this shot counts as a miss (and ends the streak); the schedule moves on.
    // A timeout on the very last shot can decide the game: the state comes back `done` and settle() closes it.
    skipTurn: (st, opp) => {
      const s = cloneSt(st);
      if (s.phase === 'done') return s;
      advance(s, s.turn, false, null);
      s.note = 'skip';
      return s;
    },
    init: host => ({
      seed: 1 + ((Math.random() * 2147483646) | 0), turn: host, starter: host, phase: 'play', rd: 0, sh: 0,
      sc: [0, 0], rec: ['', ''], streak: [0, 0], thr: [0, 0], sdm: [-1, -1], fin: -1, n: 0, clk: 0, last: null, note: '',
      mid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    }),
    test: {
      readSeen, simulate, inputFrom, aimYaw, resolve, advance, norm, cloneSt, spotOf, slideOf, slideX, shooterOf, isMoney, isSD,
      SPOTS, BR, RR, RT, RIMY, BZ, VMIN, VMAX, ROUNDS, PER, ON_FIRE, SD_CAP, MOVE_FROM, FIRE_K, SLIDE, S, CAMS,
      skipTurn: (st, opp) => DEF.skipTurn(st, opp), snapPath, hoopTarget,
      draw: () => draw(), step: () => step(), launch: a => launch(a), canAct: () => canAct(), remainingMs: () => remainingMs(), view: () => view(),
      replay: () => ({ anim: S.anim ? { id: S.anim.id, i: S.anim.i, n: S.anim.pts.length, done: !!S.anim.done, tail: S.anim.tail || 0, snapped: !!S.anim.snapped, made: !!S.anim.made, scoredAt: S.anim.scoredAt, hold: S.anim.hold } : null, doneId: S.doneId, raf: !!S.raf, parts: S.parts.length, hx: S.hx }),
    },

    render(ctx) {
      const st = norm(ctx.state), me = ctx.me, foe = 1 - me;
      ctx.state = st;
      if (st.seed !== S.seed || st.mid !== S.mid || st.n < S.doneId) resetScene(st);
      S.ctx = ctx; S.st = st;
      if (S.lockN != null && st.n !== S.lockN) S.lockN = null;
      ensureCanvas();
      if (!S.cam) { S.hx = S.hxPrev = hoopTarget(); }
      maybeReplay(st);

      const v = view();
      const wrap = ctx.h('div', { class: 'hp-wrap' });
      ctx.root.append(ctx.turnBar({ scores: v.sc }), wrap);      // scores frozen at pre-shot values until the ball lands
      wrap.append(S.cv);                                         // the SAME canvas every repaint
      const row = ctx.h('div', { class: 'hp-row' });
      const hint = ctx.h('div', { class: 'hp-hint' });
      const live = canAct(), pend = !!(S.anim || pending()), fire = st.streak[me] >= ON_FIRE;
      let html;
      if (ctx.status === 'finished' || st.phase === 'done') {
        const f = st.fin;
        html = f === 'draw' ? `🤝 <b>Draw</b> — still level after ${SD_CAP} sudden-death rounds.`
          : f === 0 || f === 1 ? `🏆 <b>${esc(seatName(f))}</b> wins ${st.sc[f]} to ${st.sc[1 - f]}${st.rd >= ROUNDS ? ' in sudden death' : ''}`
          : 'Game over.';
      } else if (pend) {
        const sh = S.anim ? S.anim.L.seat : st.last.seat;
        html = sh === me ? '🏀 In the air…' : `🏀 <b>${esc(seatName(sh))}</b> shot — watch the rim`;
      } else if (ctx.isMyTurn && st.turn === me) {
        const money = isMoney(st), sd = isSD(st);
        const sdOpp = st.sdm ? st.sdm[1 - me] : -1;
        html = sd ? (sdOpp === 1 ? `⚡ <b>Sudden death</b>: they made theirs — make it to stay alive`
                   : sdOpp === 0 ? `⚡ <b>Sudden death</b>: they missed — make it to win`
                   : `⚡ <b>Sudden death</b>: make it, and they have to answer`)
          : `Ball <b>${(st.sh % PER) + 1}/${PER}</b> · <b>${esc(SPOTS[spotOf(st.rd)].nm)}</b>${money ? ' · <b class="hp-gold">money ball, worth 2</b>' : ''}`;
        html += ` · <span class="hp-up">↑</span> swipe up: direction aims, length sets power`;
        if (slideOf(st.rd)) html += '. The hoop slides and locks where it is when you let go';
        if (fire) html += ' · <span class="hp-fire">ON FIRE</span>';
        if (st.note === 'skip') html = '⏱ Time ran out: that shot counted as a miss. ' + html;
      } else {
        const sd = isSD(st);
        html = `⏳ <b>${esc(seatName(foe))}</b> is shooting (${sd ? 'sudden death' : `ball ${(st.sh % PER) + 1}/${PER}`}).`;
        if (st.note === 'skip') html = '⏱ Time ran out: that shot counted as a miss. ' + html;
      }
      hint.innerHTML = html; hint.setAttribute('aria-live', 'polite');
      S.cv.setAttribute('role', 'img');
      S.cv.setAttribute('aria-label', `Basketball court, ${SPOTS[v.spot].nm}. ${seatName(0)} ${v.sc[0]}, ${seatName(1)} ${v.sc[1]}. ${st.phase === 'done' ? 'Game over.' : isSD(v) ? 'Sudden death.' : 'Round ' + (v.rd + 1) + ' of ' + ROUNDS + '.'}`);
      row.append(hint);
      wrap.append(row);
      fit(); draw(); ensureLoop();                               // paint now: a hidden page gets a frame too
      void live;

      if (st.phase === 'done' && ctx.status === 'active' && !S.anim && !pending()) settle(st, ctx.isMyTurn);
    },
  };
  Games.register(DEF);
})();
