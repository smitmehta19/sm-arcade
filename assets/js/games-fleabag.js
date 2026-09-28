/* ============================================================
   FLEABAG vs MUTT — the old Flash lobbing duel, rebuilt.

   Faithful to the original: two rivals either side of a fence take
   TURNS lobbing junk at each other, the wind shifts every turn, and
   the first to empty the other's health bar wins. Fleabag the cat
   throws cans, Mutt the dog throws bones. Each side gets the same
   four one-use powers (Power Throw / Double Attack / Stink Bomb /
   Power Up). Using a power doesn't use up your turn.

   The flight is a PURE function of (angle, power, wind, seat), so both
   phones replay the identical arc from the few numbers in `last`.
   The thrower commits FIRST; the arc is replayed from `last` on every
   phone (commit-before-animate — see CONTEXT).

   Cinematic 2.5D (v68): drawn characters (no emoji) that breathe,
   blink, wag, wind up and throw, flinch and get knocked out; a night
   backyard with parallax rooftops and trees, a wooden fence with real
   depth, a mown lawn with grass swaying in the wind, drifting leaves;
   spinning drawn cans and bones; a camera that follows the throw,
   slows down as it closes on the target and pushes in on the hit.
   Like Pocket Tanks, the canvas + loop are MODULE-LEVEL so a repaint
   of the stage can never cut an animation short.
   ============================================================ */
(function () {
  const css = `
  .fb-wrap{ display:flex; flex-direction:column; gap:10px; }
  .fb-cv{ width:100%; display:block; border-radius:var(--r-3); border:1px solid var(--glass-brd);
    box-shadow:var(--shadow-soft); background:#070b18; touch-action:none; }
  .fb-hint{ text-align:center; font-size:12.5px; color:var(--ink-dim); min-height:18px; line-height:1.5; }
  .fb-hint b{ color:var(--ink); }
  .fb-powers{ display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
  .fb-pw{ padding:8px 2px; border-radius:var(--r-2); background:var(--panel-2); border:1px solid var(--glass-brd);
    color:var(--ink); font-size:10px; font-weight:700; line-height:1.45; text-align:center;
    transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), opacity var(--dur-2); }
  .fb-pw b{ display:block; font-size:17px; margin-bottom:1px; }
  .fb-pw:active{ transform:scale(.93); }
  .fb-pw.armed{ border-color:var(--gold); box-shadow:0 0 15px -4px var(--gold); color:var(--gold); }
  .fb-pw:disabled{ opacity:.3; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------- scene, in virtual units (the canvas scales to fit) ---------- */
  const VW = 1000, VH = 600;
  const GROUND = 500, FENCE_X = 500, FENCE_TOP = 300;
  const FEET = [140, 860];                  // seat 0 left, seat 1 right
  const BODY_R = 42, HEAD_DY = 66;
  const GRAV = 1500, WIND_K = 300, MAX_POW = 1250;
  const TAIL = 55;                          // frames of aftermath once the projectile lands

  const CHARS = [
    { name: 'Fleabag', face: '🐱', ammo: '🥫', kind: 'cat' },   // seat 0 — the cat throws cans
    { name: 'Mutt', face: '🐶', ammo: '🦴', kind: 'dog' },      // seat 1 — the dog throws bones
  ];
  const POWERS = [
    { k: 'pt', ico: '⚡', label: 'Power\nThrow' },
    { k: 'da', ico: '✌️', label: 'Double\nAttack' },
    { k: 'sb', ico: '💨', label: 'Stink\nBomb' },
    { k: 'pu', ico: '❤️', label: 'Power\nUp' },
  ];

  const throwFrom = seat => ({ x: FEET[seat] + (seat === 0 ? 30 : -30), y: GROUND - HEAD_DY });
  const torsoOf = seat => ({ x: FEET[seat], y: GROUND - 34 });
  const rollWind = amp => Math.round((Math.random() * 2 - 1) * 100 * (amp || 1)) / 100;

  /* Deterministic flight. Same inputs → same arc on both phones, which is
     why `last` only has to carry four numbers. */
  function simulate(seat, ang, pow, wind) {
    const o = throwFrom(seat), foe = torsoOf(1 - seat);
    let x = o.x, y = o.y, vx = Math.cos(ang) * pow, vy = Math.sin(ang) * pow;
    const dt = 1 / 120, pts = [[x, y]];
    for (let i = 0; i < 1400; i++) {
      const px = x, py = y;
      vx += wind * WIND_K * dt; vy += GRAV * dt;
      x += vx * dt; y += vy * dt;
      pts.push([x, y]);
      if (Math.hypot(x - foe.x, y - foe.y) < BODY_R) {            // clean hit
        const spd = Math.hypot(vx, vy);
        return { pts, outcome: 'hit', dmg: Math.max(11, Math.min(30, Math.round(9 + spd / 46))) };
      }
      if ((px - FENCE_X) * (x - FENCE_X) <= 0 && px !== x) {       // crossing the fence line
        const cy = py + (y - py) * ((FENCE_X - px) / (x - px));
        if (cy > FENCE_TOP) return { pts, outcome: 'fence', dmg: 0 };
      }
      if (y >= GROUND) {                                           // landed
        return Math.abs(x - foe.x) < BODY_R + 34
          ? { pts, outcome: 'graze', dmg: 7 }
          : { pts, outcome: 'ground', dmg: 0 };
      }
      if (x < -80 || x > VW + 80) return { pts, outcome: 'out', dmg: 0 };
    }
    return { pts, outcome: 'out', dmg: 0 };
  }
  const freshPowers = () => ({ pt: true, da: true, sb: true, pu: true });

  /* ---------------- module-level scene (survives repaints) ---------------- */
  const S = {
    cv: null, g: null, raf: 0, ctx: null, W: 0, H: 0, dpr: 1, scale: 1, layers: null, layerKey: '', vignette: null,
    cam: { x: VW / 2, y: VH / 2, z: 1 }, sx: 0, sy: 0,
    anim: null, doneId: 0, lastImpact: null,
    parts: [], floats: [], shake: 0, flinch: [0, 0], hp: null, ghost: null, blink: [0, 0], throwT: [0, 0],
    aim: null, drag: null, tick: 0, leaves: [], tufts: [], stars: [],
    calm: !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  };
  (function seedScenery() {
    for (let i = 0; i < 12; i++) S.leaves.push({ x: Math.random() * VW, y: 40 + Math.random() * 380, r: Math.random() * 6.28, s: .6 + Math.random() * .7, ph: Math.random() * 6.28 });
    for (let x = 4; x < VW; x += 7 + Math.random() * 6) S.tufts.push({ x, h: 6 + Math.random() * 9, ph: Math.random() * 6.28 });
  })();

  function ensureCanvas() {
    if (S.cv) return;
    S.cv = document.createElement('canvas'); S.cv.className = 'fb-cv';
    S.g = S.cv.getContext('2d');
    if (window.ResizeObserver) new ResizeObserver(() => fit()).observe(S.cv);
    else window.addEventListener('resize', fit);
    // screen → world through the camera
    const toV = e => {
      const r = S.cv.getBoundingClientRect(), sx = (e.clientX - r.left) / r.width * VW, sy = (e.clientY - r.top) / r.width * VW;
      return { x: S.cam.x + (sx - VW / 2) / S.cam.z, y: S.cam.y + (sy - VH / 2) / S.cam.z };
    };
    S.cv.addEventListener('pointerdown', e => {
      if (!canAct()) return;
      S.drag = toV(e); S.aim = { ang: 0, pow: 0 };
      try { S.cv.setPointerCapture(e.pointerId); } catch (x) {}
    });
    S.cv.addEventListener('pointermove', e => {
      if (!S.drag || !canAct()) return;
      const p = toV(e), dx = S.drag.x - p.x, dy = S.drag.y - p.y;      // slingshot: pull back to launch
      S.aim = { ang: Math.atan2(dy, dx), pow: Math.min(MAX_POW, Math.hypot(dx, dy) * 3.4) };
      e.preventDefault();
    }, { passive: false });
    const release = () => {
      if (!S.drag) return;
      const a = S.aim; S.drag = null; S.aim = null;
      if (!a || a.pow < 90 || !canAct()) return;                          // a tap, not a throw
      launch(a.ang, a.pow);
    };
    S.cv.addEventListener('pointerup', release);
    S.cv.addEventListener('pointercancel', release);
  }
  function canAct() { const c = S.ctx; return !!(c && c.isMyTurn && c.status !== 'finished' && !S.anim); }
  function fit() {
    if (!S.cv) return;
    const w = S.cv.clientWidth; if (!w) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(w * dpr), H = Math.round(w * VH / VW * dpr);
    S.cv.style.height = Math.round(w * VH / VW) + 'px';              // explicit height → no reflow wobble
    if (W === S.W && H === S.H) return;
    S.W = W; S.H = H; S.dpr = dpr; S.scale = w / VW;
    S.cv.width = W; S.cv.height = H; S.layerKey = ''; S.vignette = null;
    draw();                                                             // resizing wipes the bitmap
  }
  function ensureLoop() { if (!S.raf) S.raf = requestAnimationFrame(loop); }
  // FIXED 60 Hz simulation. step() advances one 1/60 s tick, so it must NOT simply run once per frame:
  // a 90/120 Hz phone would play everything 1.5-2x fast. And step() can re-render the game (a finished
  // throw), which calls ensureLoop() while this frame is running — scheduling a SECOND loop that made
  // every later throw fly at double speed. So: accumulate real time, and never schedule twice.
  const TICK = 1000 / 60;
  function loop(now) {
    S.raf = 0;
    if (!S.cv || !S.cv.isConnected) { S.lastT = 0; return; }   // left the game — render() restarts us
    now = now || performance.now();
    S.acc = Math.min((S.acc || 0) + (S.lastT ? now - S.lastT : TICK), 6 * TICK);   // cap catch-up after a stall
    S.lastT = now;
    let n = 0;
    while (S.acc >= TICK - 0.5) { step(); S.acc -= TICK; n++; }
    if (n) draw();
    if (!S.raf) S.raf = requestAnimationFrame(loop);
  }

  /* ---------------- throwing ---------------- */
  function launch(ang, pow) {
    const ctx = S.ctx, st = ctx.state, me = ctx.me, foe = 1 - me;
    const s = ctx.clone(st), sim = simulate(me, ang, pow, s.wind);
    let dmg = sim.dmg;
    if (dmg && s.armed[me] === 'pt') dmg *= 2;                         // Power Throw cashes in here
    s.armed[me] = null;
    s.hp[foe] = Math.max(0, s.hp[foe] - dmg);
    s.n = (s.n || 0) + 1;
    s.last = { seat: me, ang, pow, wind: s.wind, outcome: sim.outcome, dmg, id: s.n, prevHp: st.hp.slice() };
    s.note = '';
    const won = s.hp[foe] <= 0;
    if (!won) {
      if (s.extra > 0) { s.extra--; }                                  // Double Attack: go again
      else { s.turn = foe; }
      s.wind = rollWind(s.stink[s.turn] ? 2 : 1);                      // a stunk thrower gets wild wind
      s.stink[s.turn] = false;                                         // the curse only bites once
    }
    ctx.sound.place();
    // Commit FIRST; the arc is decoration replayed on the next repaint. Animating first would
    // mean a phone locked mid-flight never commits the throw, stranding the turn for both.
    won ? ctx.commit(s, me) : ctx.commit(s);
  }
  function usePower(k) {
    const ctx = S.ctx; if (!canAct()) return;
    const st = ctx.state, me = ctx.me, foe = 1 - me, s = ctx.clone(st);
    if (!s.powers[me] || !s.powers[me][k]) return;
    s.powers[me][k] = false;
    const who = ctx.players[me].name;
    if (k === 'pt') { s.armed[me] = 'pt'; s.note = `⚡ ${who} loaded a Power Throw`; }
    if (k === 'da') { s.extra = (s.extra || 0) + 1; s.note = `✌️ ${who} gets a double attack`; }
    if (k === 'sb') { s.stink[foe] = true; s.note = `💨 ${who} let off a stink bomb`; }
    if (k === 'pu') { s.hp[me] = Math.min(100, s.hp[me] + 25); s.note = `❤️ ${who} patched up (+25)`; }
    ctx.sound.good();
    ctx.commit(s);                                     // stays your turn — powers buy you an edge, not a move
  }

  /* ---------------- replay: animate a committed throw ---------------- */
  function maybeReplay(st) {
    const L = st.last;
    if (L && L.id > S.doneId && (!S.anim || S.anim.id !== L.id)) {
      S.anim = { id: L.id, shot: L, pts: simulate(L.seat, L.ang, L.pow, L.wind).pts, i: 0, hitDone: false, tail: 0 };
      S.throwT[L.seat] = 22;
    }
  }
  // health to show right now: the pre-shot value until the projectile actually lands
  function hpNow(st, seat) {
    const L = st.last;
    const waiting = L && L.prevHp && L.id > S.doneId && !(S.anim && S.anim.id === L.id && S.anim.hitDone);
    return waiting ? L.prevHp[seat] : st.hp[seat];
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function impact(shot, p) {
    const me = S.ctx.me, victim = 1 - shot.seat, landed = shot.outcome === 'hit' || shot.outcome === 'graze';
    S.lastImpact = { x: p[0], y: Math.min(p[1], GROUND), at: S.tick };
    if (landed) {
      const n = shot.outcome === 'hit' ? 30 : 14, cols = ['#ffd66b', '#ff4d6d', '#ffffff', S.ctx.players[shot.seat].color];
      for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), v = rnd(120, 540); S.parts.push({ k: 'bit', x: p[0], y: p[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, life: rnd(40, 65), max: 65, s: rnd(2, 5.5), c: cols[i % 4], rot: rnd(0, 6), vr: rnd(-.3, .3) }); }
      for (let i = 0; i < 7; i++) S.parts.push({ k: 'star', x: FEET[victim] + rnd(-14, 14), y: GROUND - 118, ph: i / 7 * 6.28, life: 70, max: 70 });
      S.parts.push({ k: 'flash', x: p[0], y: p[1], r: shot.outcome === 'hit' ? 110 : 70, life: 15, max: 15 });
      S.parts.push({ k: 'ring', x: p[0], y: p[1], r0: 20, r1: shot.outcome === 'hit' ? 170 : 110, life: 22, max: 22 });
      S.parts.push({ k: 'light', x: p[0], y: p[1], r: 260, life: 40, max: 40 });
      S.floats.push({ text: '−' + shot.dmg, x: FEET[victim], y: GROUND - 170, c: '#ff5a7a', life: 80, max: 80 });
      S.flinch[victim] = 30; S.shake = shot.outcome === 'hit' ? 11 : 6;
      if (victim === me) { try { if (navigator.vibrate) navigator.vibrate([40, 30, 70]); } catch (e) {} }
    } else {
      const wood = shot.outcome === 'fence', y = Math.min(p[1], GROUND);
      for (let i = 0; i < 18; i++) S.parts.push({ k: 'bit', x: p[0], y, vx: rnd(-170, 170), vy: rnd(-380, -80), life: rnd(35, 55), max: 55, s: rnd(2, 4.5), c: wood ? '#9a6a3c' : '#3f6a3a', rot: rnd(0, 6), vr: rnd(-.3, .3) });
      S.parts.push({ k: 'puff', x: p[0], y: y - 10, r: 22, life: 42, max: 42 });
      S.shake = wood ? 5 : 2;
    }
  }
  function finishAnim() {
    const A = S.anim, ctx = S.ctx; S.anim = null; S.doneId = A.id;
    const sh = A.shot, ours = sh.seat === ctx.me;
    try {
      ctx.msg(sh.outcome === 'hit' ? (ours ? `💥 Direct hit! −${sh.dmg}` : `💥 ${ctx.players[sh.seat].name} got you for ${sh.dmg}`)
        : sh.outcome === 'graze' ? `😬 Glancing blow · −${sh.dmg}`
        : sh.outcome === 'fence' ? '🪵 Straight into the fence.'
        : '💨 Miss — the wind had other ideas.');
      ctx.sound[sh.dmg ? (ours ? 'good' : 'bad') : 'bad']();
    } catch (e) {}
    if (ctx.root && ctx.root.isConnected) { ctx.root.innerHTML = ''; DEF.render(ctx); }   // turn bar was frozen pre-shot
  }

  /* ---------------- per-frame simulation (cosmetic) ---------------- */
  function step() {
    S.tick++;
    const st = S.ctx && S.ctx.state; if (!st) return;
    const A = S.anim, dt = 1 / 60;
    if (A) {
      if (!A.hitDone) {
        const h = A.pts[Math.floor(A.i)], tgt = torsoOf(1 - A.shot.seat);
        const near = Math.hypot(h[0] - tgt.x, h[1] - tgt.y) < 170;          // slow motion on the approach
        A.i = Math.min(A.pts.length - 1, A.i + (S.calm ? 4 : near ? 1.6 : 4));
        if (A.i >= A.pts.length - 1) { A.hitDone = true; impact(A.shot, A.pts[A.pts.length - 1]); }
      } else A.tail++;
      if (A.tail >= TAIL) finishAnim();
    }
    // camera: follow the throw, push in on the hit, rest at full view
    let tg = { x: VW / 2, y: VH / 2, z: 1 };
    const B = S.anim;
    if (B && !S.calm) {
      if (!B.hitDone) {
        const h = B.pts[Math.floor(B.i)], tgt = torsoOf(1 - B.shot.seat);
        const near = Math.hypot(h[0] - tgt.x, h[1] - tgt.y) < 170;
        tg = { x: h[0], y: Math.max(h[1], 200), z: near ? 1.5 : 1.22 };
      } else tg = { x: S.lastImpact.x, y: S.lastImpact.y - 60, z: 1.4 };
    }
    const c = S.cam, ease = B ? .08 : .06;
    c.z += (tg.z - c.z) * ease; c.x += (tg.x - c.x) * ease; c.y += (tg.y - c.y) * ease;
    const hw = VW / (2 * c.z), hh = VH / (2 * c.z);
    c.x = Math.max(hw, Math.min(VW - hw, c.x)); c.y = Math.max(hh, Math.min(VH - hh, c.y));
    // particles
    S.parts = S.parts.filter(q => {
      q.life--;
      if (q.k === 'bit') { q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr; if (q.y > GROUND) { q.y = GROUND; q.vy *= -.3; q.vx *= .6; q.vr *= .5; } }
      else if (q.k === 'puff') q.r += .9;
      return q.life > 0;
    });
    S.floats = S.floats.filter(f => (f.y -= .8, --f.life > 0));
    S.shake *= .85; if (S.shake < .3) S.shake = 0;
    const sh = S.calm ? 0 : S.shake; S.sx = sh ? rnd(-1, 1) * sh : 0; S.sy = sh ? rnd(-1, 1) * sh : 0;
    S.flinch = S.flinch.map(v => Math.max(0, v - 1));
    S.throwT = S.throwT.map(v => Math.max(0, v - 1));
    for (let k = 0; k < 2; k++) {                                         // blink every few seconds
      if (S.blink[k] > 0) S.blink[k]--; else if (Math.random() < .006) S.blink[k] = 9;
    }
    if (!S.hp) { S.hp = [hpNow(st, 0), hpNow(st, 1)]; S.ghost = S.hp.slice(); }
    for (let k = 0; k < 2; k++) {                                         // bar drains; a pale ghost trails it
      S.hp[k] += (hpNow(st, k) - S.hp[k]) * .12;
      S.ghost[k] = S.ghost[k] > S.hp[k] ? Math.max(S.hp[k], S.ghost[k] - .45) : S.hp[k];
    }
    const wind = A ? A.shot.wind : st.wind;
    S.leaves.forEach(l => {
      l.x += (wind * 90 + 10 * Math.sin(S.tick * .02 + l.ph)) * l.s * dt; l.y += (14 + 10 * Math.sin(S.tick * .03 + l.ph)) * l.s * dt; l.r += .04 * l.s;
      if (l.x > VW + 20) l.x = -20; if (l.x < -20) l.x = VW + 20; if (l.y > GROUND) { l.y = 30; l.x = Math.random() * VW; }
    });
  }

  /* ---------------- drawing ---------------- */
  function buildLayers() {
    const mk = () => { const c = document.createElement('canvas'); c.width = S.W; c.height = S.H; const g = c.getContext('2d'); g.setTransform(S.dpr * S.scale, 0, 0, S.dpr * S.scale, 0, 0); return [c, g]; };
    const [sky, b] = mk();
    const gr = b.createLinearGradient(0, 0, 0, GROUND);
    gr.addColorStop(0, '#060a24'); gr.addColorStop(.55, '#15183f'); gr.addColorStop(1, '#2d2350');
    b.fillStyle = gr; b.fillRect(0, 0, VW, VH);
    for (let i = 0; i < 150; i++) { b.fillStyle = `rgba(234,240,255,${.2 + Math.random() * .6})`; b.beginPath(); b.arc(Math.random() * VW, Math.random() * 330, Math.random() < .1 ? 1.6 : .5 + Math.random() * .8, 0, 7); b.fill(); }
    const mx = 820, my = 92;                                           // the moon, with a big soft glow
    const halo = b.createRadialGradient(mx, my, 20, mx, my, 190); halo.addColorStop(0, 'rgba(255,236,190,.34)'); halo.addColorStop(1, 'rgba(255,236,190,0)');
    b.fillStyle = halo; b.fillRect(0, 0, VW, 420);
    const moon = b.createRadialGradient(mx - 10, my - 12, 4, mx, my, 36); moon.addColorStop(0, '#fff8df'); moon.addColorStop(1, '#f1d78e');
    b.fillStyle = moon; b.beginPath(); b.arc(mx, my, 36, 0, 7); b.fill();
    b.fillStyle = 'rgba(180,150,90,.22)'; [[-10, 6, 8], [12, -8, 6], [8, 14, 4.5]].forEach(([dx, dy, r]) => { b.beginPath(); b.arc(mx + dx, my + dy, r, 0, 7); b.fill(); });
    b.fillStyle = 'rgba(160,170,220,.08)';                              // thin clouds
    [[220, 120, 150], [520, 70, 110], [640, 160, 130]].forEach(([x, y, w]) => { b.beginPath(); b.ellipse(x, y, w, 14, 0, 0, 7); b.fill(); b.beginPath(); b.ellipse(x + w * .3, y - 10, w * .5, 12, 0, 0, 7); b.fill(); });
    // rooftops with lit windows (far)
    const [roofs, r] = mk();
    let x = -20;
    while (x < VW + 20) {
      const w = 70 + Math.random() * 70, h = 60 + Math.random() * 70, base = 400;
      r.fillStyle = '#141433';
      r.beginPath(); r.moveTo(x, base); r.lineTo(x, base - h); r.lineTo(x + w / 2, base - h - 26 - Math.random() * 14); r.lineTo(x + w, base - h); r.lineTo(x + w, base); r.closePath(); r.fill();
      if (Math.random() < .5) { r.fillRect(x + w * .7, base - h - 22, 8, 18); }            // chimney
      for (let wy = base - h + 14; wy < base - 16; wy += 22) for (let wx = x + 10; wx < x + w - 14; wx += 20)
        if (Math.random() < .3) { r.fillStyle = Math.random() < .5 ? 'rgba(255,208,120,.75)' : 'rgba(255,170,90,.55)'; r.fillRect(wx, wy, 8, 10); r.fillStyle = '#141433'; }
      x += w + 6;
    }
    const hz = r.createLinearGradient(0, 300, 0, 420); hz.addColorStop(0, 'rgba(45,35,80,0)'); hz.addColorStop(1, 'rgba(45,35,80,.55)');
    r.fillStyle = hz; r.fillRect(0, 300, VW, 120);
    // trees and bushes (near)
    const [trees, t] = mk();
    [[70, 360, 70], [300, 380, 55], [420, 395, 40], [610, 385, 60], [760, 360, 75], [950, 380, 55]].forEach(([tx, ty, tr]) => {
      t.fillStyle = '#0d1a1f'; t.fillRect(tx - 5, ty, 10, GROUND - ty);
      t.fillStyle = '#10232a';
      [[0, 0, 1], [-.55, .25, .75], [.55, .25, .75], [0, -.5, .7]].forEach(([dx, dy, s]) => { t.beginPath(); t.arc(tx + dx * tr, ty + dy * tr, tr * s, 0, 7); t.fill(); });
      t.fillStyle = 'rgba(255,236,190,.06)'; t.beginPath(); t.arc(tx + tr * .3, ty - tr * .3, tr * .55, 0, 7); t.fill();   // moonlit side
    });
    S.layers = { sky, roofs, trees }; S.layerKey = String(S.W);
  }
  function view(g, f) {
    const k = S.dpr * S.scale, c = S.cam, z = 1 + (c.z - 1) * f;
    const cx = VW / 2 + (c.x - VW / 2) * f, cy = VH / 2 + (c.y - VH / 2) * f;
    g.setTransform(k * z, 0, 0, k * z, k * (VW / 2 - z * cx + S.sx * f), k * (VH / 2 - z * cy + S.sy * f));
  }

  function draw() {
    const g = S.g, ctx = S.ctx, st = ctx && ctx.state; if (!g || !st) return;
    if (!S.W) fit(); if (!S.W) return;
    if (S.layerKey !== String(S.W)) buildLayers();
    if (!S.hp) { S.hp = [hpNow(st, 0), hpNow(st, 1)]; S.ghost = S.hp.slice(); }
    const wind = S.anim ? S.anim.shot.wind : st.wind;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    g.drawImage(S.layers.sky, 0, 0);
    view(g, .25); g.drawImage(S.layers.roofs, 0, 0, VW, VH);
    view(g, .5); g.drawImage(S.layers.trees, 0, 0, VW, VH);
    view(g, 1);
    drawLawn(g, wind);
    drawFence(g);
    [0, 1].forEach(i => drawFighter(g, i, st));
    if (S.aim && S.drag) drawAim(g, st);
    drawProjectile(g);
    drawFx(g);
    drawLeaves(g);
    const k = S.dpr * S.scale;
    g.setTransform(k, 0, 0, k, 0, 0);
    if (!S.vignette) { const v = g.createRadialGradient(VW / 2, VH / 2, VH * .35, VW / 2, VH / 2, VW * .72); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.4)'); S.vignette = v; }
    g.fillStyle = S.vignette; g.fillRect(0, 0, VW, VH);
    drawWind(g, wind);
  }

  function drawLawn(g, wind) {
    const lg = g.createLinearGradient(0, GROUND, 0, VH);
    lg.addColorStop(0, '#1f4a33'); lg.addColorStop(1, '#0a1a12');
    g.fillStyle = lg; g.fillRect(-30, GROUND, VW + 60, VH - GROUND + 30);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.06)'; g.fillRect(-30, GROUND + 6 + i * 24, VW + 60, 12); }  // mowing stripes
    const rim = g.createLinearGradient(0, GROUND - 3, 0, GROUND + 6);
    rim.addColorStop(0, 'rgba(160,230,150,.55)'); rim.addColorStop(1, 'rgba(160,230,150,0)');
    g.fillStyle = rim; g.fillRect(-30, GROUND - 3, VW + 60, 9);
    g.strokeStyle = 'rgba(120,210,120,.55)'; g.lineWidth = 1.4; g.lineCap = 'round';
    g.beginPath();
    S.tufts.forEach(t => {
      const sway = Math.sin(S.tick * .05 + t.ph) * .2 + wind * .5;
      for (let b = -1; b <= 1; b++) { const x0 = t.x + b * 2, h = t.h * (b ? .72 : 1); g.moveTo(x0, GROUND + 1); g.quadraticCurveTo(x0 + sway * h * .4, GROUND - h * .6, x0 + sway * h + b, GROUND - h); }
    });
    g.stroke();
  }

  function drawFence(g) {
    // soft shadow thrown back from the moonlight
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.moveTo(FENCE_X - 34, GROUND); g.lineTo(FENCE_X + 34, GROUND); g.lineTo(FENCE_X + 10, GROUND + 26); g.lineTo(FENCE_X - 58, GROUND + 26); g.closePath(); g.fill();
    const n = 5, pw = 12, gap = 2, x0 = FENCE_X - (n * (pw + gap) - gap) / 2;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (pw + gap), top = FENCE_TOP + (i % 2 ? 6 : 0);
      g.fillStyle = '#3c2413';                                          // side face → depth
      g.beginPath(); g.moveTo(x + pw, top + 4); g.lineTo(x + pw + 4, top + 1); g.lineTo(x + pw + 4, GROUND - 3); g.lineTo(x + pw, GROUND); g.closePath(); g.fill();
      const wood = g.createLinearGradient(x, 0, x + pw, 0);
      wood.addColorStop(0, '#a7713f'); wood.addColorStop(.5, '#8c5a30'); wood.addColorStop(1, '#6e4424');
      g.fillStyle = wood;
      g.beginPath(); g.moveTo(x, GROUND); g.lineTo(x, top + 6); g.lineTo(x + pw / 2, top - 2); g.lineTo(x + pw, top + 6); g.lineTo(x + pw, GROUND); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,20,8,.35)'; g.lineWidth = .8;              // grain
      g.beginPath(); g.moveTo(x + 3.5, top + 14); g.lineTo(x + 4, GROUND - 6); g.moveTo(x + 8, top + 24); g.lineTo(x + 8.5, GROUND - 12); g.stroke();
      g.strokeStyle = 'rgba(255,236,190,.35)'; g.lineWidth = 1;          // moonlit edge
      g.beginPath(); g.moveTo(x + .5, GROUND); g.lineTo(x + .5, top + 6); g.lineTo(x + pw / 2, top - 2); g.stroke();
    }
    [FENCE_TOP + 40, GROUND - 42].forEach(y => {                         // cross rails with nails
      g.fillStyle = '#5a3719'; g.fillRect(x0 - 5, y, n * (pw + gap) + 8, 10);
      g.fillStyle = '#7a4c24'; g.fillRect(x0 - 5, y, n * (pw + gap) + 8, 3);
      g.fillStyle = '#c9c1b0'; for (let i = 0; i < n; i++) { g.beginPath(); g.arc(x0 + i * (pw + gap) + pw / 2, y + 5, 1.2, 0, 7); g.fill(); }
    });
  }

  function drawFighter(g, seat, st) {
    const ctx = S.ctx, c = CHARS[seat], col = ctx.players[seat].color, x = FEET[seat];
    const hp = Math.max(0, S.hp[seat]), ko = ctx.status === 'finished' && st.hp[seat] <= 0 && !S.anim;
    const won = ctx.status === 'finished' && st.hp[seat] > 0 && !S.anim;
    const fl = S.flinch[seat], hurt = fl > 0;
    const breathe = Math.sin(S.tick * .06 + seat * 2) * 1.6, hop = won ? Math.abs(Math.sin(S.tick * .12)) * 14 : 0;
    // ground shadow
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x, GROUND + 2, ko ? 46 : 32, 6, 0, 0, 7); g.fill();
    if (st.turn === seat && ctx.status !== 'finished' && !S.anim) {            // whose turn: a glow ring on the lawn
      g.strokeStyle = hexA(col, .55 + .25 * Math.sin(S.tick * .1)); g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(x, GROUND + 2, 40, 8, 0, 0, 7); g.stroke();
    }
    g.save();
    g.translate(x, GROUND - hop);
    if (seat === 1) g.scale(-1, 1);                                           // both face the fence
    if (ko) g.rotate(-1.35);
    if (hurt) { g.translate(Math.sin(fl * 1.7) * fl * .35, 0); g.scale(1 + fl * .004, 1 - fl * .004); }
    const fur = c.kind === 'cat' ? ['#9aa3c8', '#626b93', '#c9cfe6'] : ['#c0874f', '#80542e', '#ecd0a6'];
    // tail
    const wag = Math.sin(S.tick * (c.kind === 'dog' ? .3 : .08)) * (c.kind === 'dog' ? .5 : .25);
    g.save(); g.translate(-20, -20); g.rotate(-.5 + wag);
    g.strokeStyle = fur[1]; g.lineWidth = c.kind === 'cat' ? 7 : 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-22, -6, c.kind === 'cat' ? -18 : -24, c.kind === 'cat' ? -34 : -18); g.stroke();
    g.restore();
    // body
    const body = g.createRadialGradient(-6, -40 + breathe, 4, 0, -28, 32);
    body.addColorStop(0, fur[0]); body.addColorStop(1, fur[1]);
    g.fillStyle = hurt && fl % 4 < 2 ? '#ffd0d8' : body;
    g.beginPath(); g.ellipse(0, -27 + breathe * .4, 23, 27 + breathe * .3, 0, 0, 7); g.fill();
    g.fillStyle = fur[2]; g.beginPath(); g.ellipse(5, -22 + breathe * .4, 12, 17, 0, 0, 7); g.fill();     // belly
    if (c.kind === 'dog') { g.fillStyle = 'rgba(90,55,25,.55)'; g.beginPath(); g.ellipse(-10, -34, 8, 10, .4, 0, 7); g.fill(); }  // a spot
    g.fillStyle = fur[1];                                                      // back paws
    g.beginPath(); g.ellipse(-10, -2, 10, 5, 0, 0, 7); g.ellipse(14, -2, 10, 5, 0, 0, 7); g.fill();
    // collar in the player's colour
    g.strokeStyle = col; g.lineWidth = 4.5; g.beginPath(); g.arc(2, -46 + breathe * .5, 14, .4, Math.PI - .4); g.stroke();
    g.fillStyle = '#ffd66b'; g.beginPath(); g.arc(8, -33 + breathe * .5, 3, 0, 7); g.fill();
    // throwing arm: raised while aiming, swings through on the throw
    let arm = -.35;                                                            // resting, pointing down-forward
    const aiming = seat === ctx.me && S.aim && S.drag;
    if (aiming) arm = -Math.PI * .75 - Math.min(.5, S.aim.pow / MAX_POW * .5);
    else if (S.throwT[seat] > 0) { const p = 1 - S.throwT[seat] / 22; arm = -Math.PI * .95 + p * 2.4; }
    else if (st.turn === seat && !S.anim && ctx.status !== 'finished') arm = -.9 + Math.sin(S.tick * .05) * .1;
    g.save(); g.translate(12, -40 + breathe * .5); g.rotate(arm);
    g.fillStyle = fur[0]; rr(g, -4, -4, 24, 9, 4.5); g.fill();
    g.fillStyle = fur[2]; g.beginPath(); g.arc(21, .5, 5.5, 0, 7); g.fill();                     // paw
    if ((aiming || (st.turn === seat && !S.anim)) && ctx.status !== 'finished') { g.save(); g.translate(24, -2); drawAmmo(g, c.kind, 0, .75, col); g.restore(); }
    g.restore();
    // head
    const hx = 4, hy = -62 + breathe * .6;
    if (c.kind === 'cat') {
      g.fillStyle = fur[1];
      g.beginPath(); g.moveTo(hx - 17, hy - 8); g.lineTo(hx - 14, hy - 30); g.lineTo(hx - 3, hy - 16); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(hx + 17, hy - 8); g.lineTo(hx + 14, hy - 30); g.lineTo(hx + 3, hy - 16); g.closePath(); g.fill();
      g.fillStyle = '#f2a1b8'; g.beginPath(); g.moveTo(hx - 14, hy - 12); g.lineTo(hx - 13, hy - 24); g.lineTo(hx - 7, hy - 16); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(hx + 14, hy - 12); g.lineTo(hx + 13, hy - 24); g.lineTo(hx + 7, hy - 16); g.closePath(); g.fill();
    } else {
      g.fillStyle = fur[1]; g.beginPath(); g.ellipse(hx - 16, hy - 2, 7, 16, .35, 0, 7); g.fill();   // floppy ear (far)
    }
    const head = g.createRadialGradient(hx - 6, hy - 8, 3, hx, hy, 22);
    head.addColorStop(0, fur[0]); head.addColorStop(1, fur[1]);
    g.fillStyle = hurt && fl % 4 < 2 ? '#ffd0d8' : head;
    g.beginPath(); g.arc(hx, hy, 19, 0, 7); g.fill();
    if (c.kind === 'cat') {                                                    // tabby stripes
      g.strokeStyle = 'rgba(60,66,100,.55)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(hx - 4, hy - 18); g.lineTo(hx - 3, hy - 11); g.moveTo(hx + 1, hy - 19); g.lineTo(hx + 1, hy - 12); g.moveTo(hx + 6, hy - 18); g.lineTo(hx + 5, hy - 11); g.stroke();
    } else {                                                                   // snout
      g.fillStyle = fur[2]; g.beginPath(); g.ellipse(hx + 12, hy + 5, 12, 9, 0, 0, 7); g.fill();
    }
    // eyes: open / blink / hurt (><) / KO (xx)
    const ex = [hx - 2, hx + 9], ey = hy - 3;
    if (ko || (hurt && fl > 12)) {
      g.strokeStyle = '#1b1b2a'; g.lineWidth = 2.2;
      ex.forEach(x0 => { g.beginPath(); g.moveTo(x0 - 3, ey - 3); g.lineTo(x0 + 3, ey + 3); g.moveTo(x0 + 3, ey - 3); g.lineTo(x0 - 3, ey + 3); g.stroke(); });
    } else if (S.blink[seat] > 0) {
      g.strokeStyle = '#1b1b2a'; g.lineWidth = 2; ex.forEach(x0 => { g.beginPath(); g.moveTo(x0 - 3.5, ey); g.lineTo(x0 + 3.5, ey); g.stroke(); });
    } else {
      ex.forEach(x0 => {
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x0, ey, 4.2, 5, 0, 0, 7); g.fill();
        g.fillStyle = c.kind === 'cat' ? '#3a8f4a' : '#4a2c18'; g.beginPath(); g.ellipse(x0 + 1.2, ey + .5, 2.4, c.kind === 'cat' ? 3.6 : 3, 0, 0, 7); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(x0 + 2, ey - 1.2, .9, 0, 7); g.fill();
      });
    }
    if (c.kind === 'cat') {
      g.fillStyle = '#f07a98'; g.beginPath(); g.moveTo(hx + 14, hy + 4); g.lineTo(hx + 18, hy + 4); g.lineTo(hx + 16, hy + 7); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.65)'; g.lineWidth = .9;
      g.beginPath(); g.moveTo(hx + 12, hy + 7); g.lineTo(hx + 26, hy + 4); g.moveTo(hx + 12, hy + 9); g.lineTo(hx + 26, hy + 10); g.stroke();
      g.strokeStyle = '#3a3044'; g.lineWidth = 1.2; g.beginPath(); g.arc(hx + 14, hy + 9, 2.4, .2, Math.PI - .2); g.stroke();
    } else {
      g.fillStyle = '#1a1210'; g.beginPath(); g.ellipse(hx + 22, hy + 1, 4, 3.2, 0, 0, 7); g.fill();
      if (!ko) { g.fillStyle = '#f07a98'; g.beginPath(); g.ellipse(hx + 16, hy + 14 + Math.sin(S.tick * .25) * 1, 3.2, 5, 0, 0, 7); g.fill(); }   // tongue out
      g.fillStyle = fur[1]; g.beginPath(); g.ellipse(hx + 2, hy - 6, 7, 17, -.25, 0, 7); g.fill();          // floppy ear (near)
    }
    g.restore();
    // name + health bar (not mirrored)
    const bw = 124, bx = x - bw / 2, by = GROUND - 150;
    g.fillStyle = 'rgba(5,7,15,.6)'; rr(g, bx - 2, by - 2, bw + 4, 16, 8); g.fill();
    g.fillStyle = 'rgba(255,255,255,.55)'; rr(g, bx, by, bw * (Math.max(0, S.ghost[seat]) / 100), 12, 6); g.fill();   // what you just lost
    const hb = g.createLinearGradient(bx, 0, bx + bw, 0); hb.addColorStop(0, lighten(col, .35)); hb.addColorStop(1, col);
    g.fillStyle = hb; if (hp > .5) { rr(g, bx, by, bw * (hp / 100), 12, 6); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.35)'; if (hp > .5) g.fillRect(bx + 4, by + 2, Math.max(0, bw * (hp / 100) - 8), 2);
    g.textAlign = 'center'; g.textBaseline = 'bottom'; g.font = '700 16px "Chakra Petch", system-ui, sans-serif';
    g.fillStyle = 'rgba(5,7,15,.6)'; g.fillText(`${ctx.players[seat].name} · ${Math.round(hp)}`, x + 1, by - 3);
    g.fillStyle = '#eaf0ff'; g.fillText(`${ctx.players[seat].name} · ${Math.round(hp)}`, x, by - 4);
  }

  // a spinning can or bone, drawn (no emoji)
  function drawAmmo(g, kind, rot, sc, col) {
    g.save(); g.rotate(rot); g.scale(sc, sc);
    if (kind === 'cat') {
      const m = g.createLinearGradient(-8, 0, 8, 0); m.addColorStop(0, '#8d97ad'); m.addColorStop(.45, '#f2f5fb'); m.addColorStop(1, '#6f788e');
      g.fillStyle = m; rr(g, -8, -11, 16, 22, 3); g.fill();
      g.fillStyle = col || '#ff4d6d'; g.fillRect(-8, -5, 16, 9);
      g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(-5, -4, 2, 7);
      g.fillStyle = '#c9d0de'; g.beginPath(); g.ellipse(0, -11, 8, 2.6, 0, 0, 7); g.fill();
    } else {
      g.fillStyle = '#f3ead3'; g.strokeStyle = '#b9a67e'; g.lineWidth = 1.2;
      g.beginPath(); g.rect(-10, -3.5, 20, 7); g.fill();
      [[-11, -4], [-11, 4], [11, -4], [11, 4]].forEach(([bx, by]) => { g.beginPath(); g.arc(bx, by, 5, 0, 7); g.fill(); g.stroke(); });
      g.fillRect(-10, -3.5, 20, 7);
    }
    g.restore();
  }
  function drawProjectile(g) {
    const A = S.anim; if (!A || A.hitDone) return;
    const i = Math.floor(A.i), h = A.pts[i], kind = CHARS[A.shot.seat].kind, col = S.ctx.players[A.shot.seat].color;
    g.save(); g.globalCompositeOperation = 'lighter';                         // motion ghosts
    for (let j = 1; j <= 4; j++) { const q = A.pts[Math.max(0, i - j * 3)]; g.fillStyle = hexA(col, .16 - j * .03); g.beginPath(); g.arc(q[0], q[1], 11 - j, 0, 7); g.fill(); }
    const gl = g.createRadialGradient(h[0], h[1], 0, h[0], h[1], 26); gl.addColorStop(0, hexA(col, .45)); gl.addColorStop(1, hexA(col, 0));
    g.fillStyle = gl; g.beginPath(); g.arc(h[0], h[1], 26, 0, 7); g.fill();
    g.restore();
    g.save(); g.translate(h[0], h[1]); drawAmmo(g, kind, A.i * .09 * (A.shot.seat === 0 ? 1 : -1), 1.25, col); g.restore();
  }
  function drawAim(g, st) {
    const me = S.ctx.me, sim = simulate(me, S.aim.ang, S.aim.pow, st.wind), o = throwFrom(me);
    const show = Math.min(sim.pts.length - 1, 52);                            // only the opening slice — keep the skill in it
    for (let i = 4; i <= show; i += 4) {
      const al = 1 - i / show;
      g.fillStyle = hexA(S.ctx.players[me].color, .25 + al * .6);
      g.beginPath(); g.arc(sim.pts[i][0], sim.pts[i][1], 3 + al * 1.6, 0, 7); g.fill();
    }
    g.fillStyle = '#ffd66b'; g.font = '800 17px Orbitron, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(`${Math.round(S.aim.pow / MAX_POW * 100)}%`, o.x, o.y - 30);
  }
  function drawFx(g) {
    S.parts.forEach(q => {
      const a = q.life / q.max;
      if (q.k === 'bit') { g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.globalAlpha = Math.min(1, a * 1.5); g.fillStyle = q.c; g.fillRect(-q.s / 2, -q.s / 2, q.s, q.s * .8); g.restore(); }
      else if (q.k === 'puff') { g.fillStyle = `rgba(150,160,200,${a * .35})`; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill(); }
      else if (q.k === 'star') {                                              // dizzy stars circling the head
        const ang = q.ph + S.tick * .15, x = q.x + Math.cos(ang) * 22, y = q.y + Math.sin(ang) * 6;
        g.fillStyle = `rgba(255,214,107,${a})`; star(g, x, y, 4.5);
      }
    });
    g.save(); g.globalCompositeOperation = 'lighter';
    S.parts.forEach(q => {
      const a = q.life / q.max;
      if (q.k === 'flash') {
        const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
        gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(.35, `rgba(255,214,107,${a * .8})`); gr.addColorStop(1, 'rgba(255,80,110,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill();
      } else if (q.k === 'ring') {
        g.strokeStyle = `rgba(255,220,170,${a * .8})`; g.lineWidth = 4 * a + .5;
        g.beginPath(); g.arc(q.x, q.y, q.r1 - (q.r1 - q.r0) * a, 0, 7); g.stroke();
      } else if (q.k === 'light') {
        const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
        gr.addColorStop(0, `rgba(255,200,140,${a * .28})`); gr.addColorStop(1, 'rgba(255,200,140,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill();
      }
    });
    g.restore();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    S.floats.forEach(f => {
      const age = 1 - f.life / f.max, a = Math.min(1, f.life / 25), sc = age < .12 ? .6 + age * 5 : 1.2 - age * .15;
      g.font = `900 ${Math.round(42 * sc)}px Orbitron, system-ui, sans-serif`; g.globalAlpha = a;
      g.lineWidth = 7; g.strokeStyle = 'rgba(5,7,15,.9)'; g.strokeText(f.text, f.x, f.y);
      g.fillStyle = f.c; g.fillText(f.text, f.x, f.y); g.globalAlpha = 1;
    });
  }
  function drawLeaves(g) {
    S.leaves.forEach(l => {
      g.save(); g.translate(l.x, l.y); g.rotate(l.r); g.scale(l.s, l.s * (.6 + .4 * Math.sin(l.r * 2)));
      g.fillStyle = 'rgba(214,140,70,.8)'; g.beginPath(); g.ellipse(0, 0, 6, 3, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(120,70,30,.8)'; g.lineWidth = .8; g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.stroke();
      g.restore();
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
      g.strokeStyle = '#ffd66b'; g.fillStyle = '#ffd66b'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.beginPath(); g.moveTo(x1 + dir * 4, y); g.lineTo(x1 - dir * 5, y - 6); g.lineTo(x1 - dir * 5, y + 6); g.closePath(); g.fill();
    }
  }

  /* ---------------- tiny canvas helpers ---------------- */
  function rr(g, x, y, w, h, r) {
    if (w <= 0) return; r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } g.closePath(); g.fill(); }
  function rgb(hex) { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0xffffff; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hexA(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
  function lighten(hex, f) { const c = rgb(hex).map(v => Math.round(v + (255 - v) * f)); return `rgb(${c})`; }

  /* ---------------- registration ---------------- */
  const DEF = {
    id: 'fleabag', name: 'Fleabag vs Mutt', emoji: '🐱', category: 'Duel', accent: '#ffd66b',
    tagline: 'Lob junk over the fence · mind the wind.',
    // the knockout throw is still in the air when the match finishes — hold the result card
    resultDelay: () => S.anim ? Math.round((Math.max(0, (S.anim.pts.length - S.anim.i) / 1.6) + Math.max(0, TAIL - S.anim.tail)) * 16.7) + 250 : 0,
    test: { simulate, throwFrom, torsoOf, VW, VH, GROUND, FENCE_X, FENCE_TOP, MAX_POW, fx: S, S,
      replay: () => ({ inFlight: S.anim ? { hitDone: S.anim.hitDone, tail: S.anim.tail, i: S.anim.i } : null, seenShot: S.doneId }) },
    // timer ran out ("Chance gone"): no throw, and nothing of this turn leaks to the opponent —
    // an owed Double Attack or an armed Power Throw would otherwise hand THEM a bonus throw / 2x hit
    skipTurn: (st, opp) => {
      const s = JSON.parse(JSON.stringify(st));
      s.extra = 0; s.armed = [null, null];
      s.stink = [0, 1].map(i => !!(s.stink && s.stink[i]));
      s.wind = rollWind(s.stink[opp] ? 2 : 1); s.stink[opp] = false;   // fresh wind, like any turn change
      s.turn = opp; s.note = '';
      return s;
    },
    init: host => ({
      hp: [100, 100], turn: host, wind: rollWind(),
      powers: [freshPowers(), freshPowers()],
      armed: [null, null],      // 'pt' held for the next throw
      stink: [false, false],    // next turn's wind gets nasty
      extra: 0,                 // double-attack throws still owed
      last: null, n: 0, note: '',
    }),

    render(ctx) {
      const st = ctx.state, me = ctx.me, foe = 1 - me;
      const mine = CHARS[me], theirs = CHARS[foe];
      if (!st.last && (S.doneId || S.anim)) { S.doneId = 0; S.anim = null; S.parts = []; S.floats = []; S.hp = null; }   // new match
      S.ctx = ctx;
      ensureCanvas();
      maybeReplay(st);

      const wrap = ctx.h('div', { class: 'fb-wrap' });
      // don't spoil the shot: until it lands, the bar shows health from BEFORE it
      const pending = !!(st.last && st.last.prevHp && st.last.id > S.doneId);
      ctx.root.append(ctx.turnBar({ scores: pending ? st.last.prevHp.slice() : [st.hp[0], st.hp[1]] }), wrap);
      wrap.append(S.cv);                                                        // the SAME canvas every repaint
      fit(); ensureLoop();

      const hint = ctx.h('div', { class: 'fb-hint' });
      const powRow = ctx.h('div', { class: 'fb-powers' });
      const live = canAct();
      POWERS.forEach(p => {
        const have = st.powers[me] && st.powers[me][p.k];
        powRow.append(ctx.h('button', {
          class: 'fb-pw' + (st.armed[me] === p.k ? ' armed' : ''),
          disabled: !have || !live ? '' : null,
          onclick: () => usePower(p.k),
        }, ctx.h('b', {}, p.ico), ctx.h('span', { html: p.label.replace('\n', '<br>') })));
      });
      const label = st.note ? st.note
        : ctx.status === 'finished' ? 'Good scrap.'
        : S.anim ? (S.anim.shot.seat === me ? 'Incoming… for them 😏' : `${theirs.face} <b>${ctx.players[foe].name}</b> threw — duck!`)
        : !ctx.isMyTurn ? `${theirs.face} <b>${ctx.players[foe].name}</b> is winding up…`
        : `${mine.face} You're <b>${mine.name}</b> — drag back to aim, release to throw ${mine.ammo}`;
      hint.innerHTML = label + (st.extra > 0 && ctx.isMyTurn ? ' · <b>double attack!</b>' : '');
      wrap.append(hint, powRow);
      if (window.Landscape) wrap.append(Landscape.button());
    },
  };
  Games.register(DEF);
})();
