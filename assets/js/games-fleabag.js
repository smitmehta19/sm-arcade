/* ============================================================
   FLEABAG vs MUTT — the old Flash lobbing duel, rebuilt.

   Faithful to the original: two rivals either side of a fence take
   TURNS lobbing junk at each other, the wind shifts every turn, and
   the first to empty the other's health bar wins. Fleabag the cat
   throws cans, Mutt the dog throws bones. Each side gets the same
   four one-use powers (Power Throw / Double Attack / Stink Bomb /
   Power Up).

   Turn-based is what the original actually was, which is lucky: it
   drops straight onto this arcade's cloud-synced turn model with no
   compromise (a real-time brawler Ireland↔India would be misery).

   The flight is a PURE function of (angle, power, wind, seat), so both
   phones replay the identical arc from the few numbers in `last` —
   no need to sync a path. `test` exposes it for the harness.

   Aiming is slingshot drag (touch-native) and the preview only shows
   the first slice of the arc — enough to read your angle, not enough
   to remove the skill. Judging the wind is the whole game.
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

  const CHARS = [
    { name: 'Fleabag', face: '🐱', ammo: '🥫' },   // seat 0 — the cat throws cans
    { name: 'Mutt', face: '🐶', ammo: '🦴' },      // seat 1 — the dog throws bones
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
  let seenShot = 0;          // last shot FULLY played on this device
  let inFlight = null;       // { id, i, n, hitDone, tail } — module level so a repaint can resume it
  // impact aftermath (particles, flinch, shake, the draining health bar) — also module level
  const fx = { parts: [], floats: [], shake: 0, flinch: [0, 0], hp: null };
  const TAIL = 55;           // frames of aftermath once the projectile lands

  const DEF = {
    id: 'fleabag', name: 'Fleabag vs Mutt', emoji: '🐱', category: 'Duel', accent: '#ffd66b',
    tagline: 'Lob junk over the fence · mind the wind.',
    // the knockout shot is still in the air when the match finishes — hold the result card
    resultDelay: () => inFlight ? Math.round((Math.max(0, (inFlight.n - inFlight.i) / 4) + Math.max(0, TAIL - inFlight.tail)) * 16.7) + 250 : 0,
    test: { simulate, throwFrom, torsoOf, VW, VH, GROUND, FENCE_X, FENCE_TOP, MAX_POW, fx, replay: () => ({ inFlight, seenShot }) },
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
      if (!st.last) { seenShot = 0; inFlight = null; fx.parts = []; fx.floats = []; fx.hp = null; }   // new match

      const wrap = ctx.h('div', { class: 'fb-wrap' });
      // don't spoil the shot: until it lands, the bar shows health from BEFORE it
      const pending = !!(st.last && st.last.prevHp && st.last.id > seenShot);
      ctx.root.append(ctx.turnBar({ scores: pending ? st.last.prevHp.slice() : [st.hp[0], st.hp[1]] }), wrap);

      const cv = ctx.h('canvas', { class: 'fb-cv' });
      const hint = ctx.h('div', { class: 'fb-hint' });
      const powRow = ctx.h('div', { class: 'fb-powers' });
      wrap.append(cv, hint, powRow);
      if (window.Landscape) wrap.append(Landscape.button());

      const g = cv.getContext('2d');
      let scale = 1, aim = null, flying = null, busy = false;

      function fit() {
        const w = cv.clientWidth || 340, dpr = Math.min(2, window.devicePixelRatio || 1);
        scale = w / VW;
        cv.width = Math.round(w * dpr); cv.height = Math.round(VH * scale * dpr);
        cv.style.height = Math.round(VH * scale) + 'px';   // explicit height → no reflow wobble
        g.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
        draw();
      }

      /* ---------------- scene ---------------- */
      function draw() {
        g.clearRect(-24, -24, VW + 48, VH + 48);
        if (!busy || !fx.hp) fx.hp = [hpNow(0), hpNow(1)];
        g.save();
        if (fx.shake) g.translate((Math.random() - .5) * fx.shake * 2, (Math.random() - .5) * fx.shake * 2);
        const sky = g.createLinearGradient(0, 0, 0, GROUND);
        sky.addColorStop(0, '#0a1030'); sky.addColorStop(1, '#161d3f');
        g.fillStyle = sky; g.fillRect(-24, -24, VW + 48, GROUND + 24);
        g.fillStyle = 'rgba(255,214,107,.85)'; g.beginPath(); g.arc(860, 86, 30, 0, 7); g.fill();

        g.fillStyle = '#0d1226'; g.fillRect(-24, GROUND, VW + 48, VH - GROUND + 24);
        g.strokeStyle = 'rgba(170,190,255,.22)'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, GROUND); g.lineTo(VW, GROUND); g.stroke();

        for (let i = 0; i < 5; i++) {                      // the fence
          g.fillStyle = i % 2 ? '#2a3357' : '#333d67';
          g.fillRect(FENCE_X - 32 + i * 13, FENCE_TOP, 11, GROUND - FENCE_TOP);
        }
        g.fillStyle = '#3d4878'; g.fillRect(FENCE_X - 34, FENCE_TOP + 34, 68, 10);

        [0, 1].forEach(drawFighter);
        drawWind();
        if (aim) drawAim();
        if (flying && !(inFlight && inFlight.hitDone)) {
          const p = flying.pts[Math.min(flying.i, flying.pts.length - 1)];
          g.font = '30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(CHARS[flying.seat].ammo, p[0], p[1]);
        }
        drawFx();
        g.restore();
      }

      function drawFighter(seat) {
        const c = CHARS[seat], col = ctx.players[seat].color, x = FEET[seat], hp = Math.max(0, Math.round(fx.hp ? fx.hp[seat] : st.hp[seat]));
        const fl = fx.flinch[seat], ox = fl ? Math.sin(fl * 1.7) * fl * .45 : 0;
        if (fl) { g.save(); g.globalAlpha = fl / 26 * .55; g.fillStyle = '#ff3355'; g.beginPath(); g.arc(x, GROUND - 42, 48, 0, 7); g.fill(); g.restore(); }
        g.save();
        g.shadowColor = col; g.shadowBlur = 26;
        g.fillStyle = 'rgba(255,255,255,.05)';
        g.beginPath(); g.arc(x, GROUND - 40, 40, 0, 7); g.fill();
        g.restore();
        g.font = '62px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.globalAlpha = hp > 0 ? 1 : .35;
        g.fillText(c.face, x + ox, GROUND - 42);
        g.globalAlpha = 1;

        const bw = 120, bx = x - bw / 2, by = GROUND - 132;   // health bar
        g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(bx, by, bw, 13);
        g.fillStyle = col; g.fillRect(bx, by, bw * (hp / 100), 13);
        g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.5; g.strokeRect(bx, by, bw, 13);
        g.fillStyle = '#eaf0ff'; g.font = '700 15px system-ui'; g.textBaseline = 'bottom';
        g.fillText(`${ctx.players[seat].name} · ${hp}`, x, by - 5);
      }

      function drawWind() {
        const w = st.wind, dir = w >= 0 ? 1 : -1, n = Math.min(4, Math.round(Math.abs(w) * 4));
        g.fillStyle = 'rgba(234,240,255,.62)'; g.font = '700 16px system-ui';
        g.textAlign = 'center'; g.textBaseline = 'top';
        g.fillText(n ? `WIND ${dir > 0 ? '→' : '←'} ${'›'.repeat(n)}` : 'WIND · calm', VW / 2, 18);
      }

      function drawAim() {
        const o = throwFrom(me), sim = simulate(me, aim.ang, aim.pow, st.wind);
        const show = Math.min(sim.pts.length - 1, 52);       // only the opening slice — keep the skill in it
        g.setLineDash([2, 13]); g.lineWidth = 4;
        g.strokeStyle = ctx.players[me].color;
        g.beginPath(); g.moveTo(o.x, o.y);
        for (let i = 1; i <= show; i++) g.lineTo(sim.pts[i][0], sim.pts[i][1]);
        g.stroke(); g.setLineDash([]);
        const pct = Math.round(aim.pow / MAX_POW * 100);
        g.fillStyle = '#ffd66b'; g.font = '700 17px system-ui';
        g.textAlign = 'center'; g.textBaseline = 'bottom';
        g.fillText(`${pct}%`, o.x, o.y - 18);
      }

      /* ---------------- flight replay ---------------- */
      function fly(shot, from, done) {
        busy = true;
        const pts = simulate(shot.seat, shot.ang, shot.pow, shot.wind).pts;
        flying = { pts, i: Math.min(from || 0, pts.length - 1), seat: shot.seat };
        if (!inFlight || inFlight.id !== shot.id) inFlight = { id: shot.id, i: flying.i, n: pts.length, hitDone: false, tail: 0 };
        (function step() {
          // A repaint mid-animation detaches THIS canvas. Bail and let the new render
          // resume from inFlight (arc position, whether it has landed, aftermath frames).
          if (!flying || !cv.isConnected) { busy = false; return; }
          if (!inFlight.hitDone) {
            flying.i = Math.min(pts.length - 1, flying.i + 4); inFlight.i = flying.i;
            if (flying.i >= pts.length - 1) { inFlight.hitDone = true; impact(shot, pts[pts.length - 1]); }
          } else inFlight.tail++;
          stepFx(); draw();
          if (inFlight.tail < TAIL) requestAnimationFrame(step);
          else { flying = null; inFlight = null; busy = false; seenShot = shot.id; draw(); if (done) done(); }
        })();
      }

      // health to show right now: the pre-shot value until the projectile actually lands
      function hpNow(seat) {
        const L = st.last;
        const waiting = L && L.prevHp && L.id > seenShot && !(inFlight && inFlight.id === L.id && inFlight.hitDone);
        return waiting ? L.prevHp[seat] : st.hp[seat];
      }

      /* ---------------- impact ---------------- */
      function impact(shot, p) {
        const victim = 1 - shot.seat, landed = shot.outcome === 'hit' || shot.outcome === 'graze';
        if (landed) {
          const n = shot.outcome === 'hit' ? 28 : 14;
          const cols = ['#ffd66b', '#ff4d6d', '#ffffff', ctx.players[shot.seat].color];
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 420;
            fx.parts.push({ k: 'bit', x: p[0], y: p[1], vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, life: 40 + Math.random() * 25, max: 65, s: 2 + Math.random() * 3.5, c: cols[i % 4] });
          }
          fx.parts.push({ k: 'flash', x: p[0], y: p[1], r: shot.outcome === 'hit' ? 95 : 60, life: 14, max: 14 });
          fx.parts.push({ k: 'ring', x: p[0], y: p[1], r0: 20, r1: shot.outcome === 'hit' ? 160 : 100, life: 22, max: 22 });
          fx.floats.push({ text: '\u2212' + shot.dmg, x: FEET[victim], y: GROUND - 160, c: '#ff5a7a', life: 75, max: 75 });
          fx.flinch[victim] = 26; fx.shake = shot.outcome === 'hit' ? 10 : 5;
          if (victim === me) { try { if (navigator.vibrate) navigator.vibrate([40, 30, 70]); } catch (e) {} }
        } else {
          const wood = shot.outcome === 'fence', y = Math.min(p[1], GROUND);
          for (let i = 0; i < 16; i++) fx.parts.push({ k: 'bit', x: p[0], y, vx: (Math.random() - .5) * 320, vy: -80 - Math.random() * 300, life: 35 + Math.random() * 20, max: 55, s: 2 + Math.random() * 2.5, c: wood ? '#8a6a45' : '#56608f' });
          fx.parts.push({ k: 'puff', x: p[0], y: y - 10, r: 22, life: 40, max: 40 });
          fx.shake = wood ? 4 : 2;
        }
      }
      function stepFx() {
        const dt = 1 / 60;
        fx.parts = fx.parts.filter(q => {
          q.life--;
          if (q.k === 'bit') { q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.y > GROUND) { q.y = GROUND; q.vy *= -.3; q.vx *= .6; } }
          else if (q.k === 'puff') q.r += .9;
          return q.life > 0;
        });
        fx.floats = fx.floats.filter(f => (f.y -= .8, --f.life > 0));
        fx.shake *= .85; if (fx.shake < .3) fx.shake = 0;
        fx.flinch = fx.flinch.map(v => Math.max(0, v - 1));
        if (!fx.hp) fx.hp = [hpNow(0), hpNow(1)];
        for (let k = 0; k < 2; k++) fx.hp[k] += (hpNow(k) - fx.hp[k]) * .12;    // bar drains, not snaps
      }
      function drawFx() {
        fx.parts.forEach(q => {
          const a = q.life / q.max;
          if (q.k === 'bit') { g.globalAlpha = Math.min(1, a * 1.5); g.fillStyle = q.c; g.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s); g.globalAlpha = 1; }
          else if (q.k === 'puff') { g.fillStyle = `rgba(150,160,200,${a * .35})`; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill(); }
        });
        g.save(); g.globalCompositeOperation = 'lighter';
        fx.parts.forEach(q => {
          const a = q.life / q.max;
          if (q.k === 'flash') {
            const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
            gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(.35, `rgba(255,214,107,${a * .8})`); gr.addColorStop(1, 'rgba(255,80,110,0)');
            g.fillStyle = gr; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill();
          } else if (q.k === 'ring') {
            g.strokeStyle = `rgba(255,220,170,${a * .8})`; g.lineWidth = 4 * a + .5;
            g.beginPath(); g.arc(q.x, q.y, q.r1 - (q.r1 - q.r0) * a, 0, 7); g.stroke();
          }
        });
        g.restore();
        g.textAlign = 'center'; g.textBaseline = 'middle';
        fx.floats.forEach(f => {
          const a = Math.min(1, f.life / 25), sc = 1 + (1 - f.life / f.max) * .3;
          g.font = `900 ${Math.round(40 * sc)}px Orbitron, system-ui, sans-serif`; g.globalAlpha = a;
          g.lineWidth = 6; g.strokeStyle = 'rgba(5,7,15,.85)'; g.strokeText(f.text, f.x, f.y);
          g.fillStyle = f.c; g.fillText(f.text, f.x, f.y); g.globalAlpha = 1;
        });
      }

      /* ---------------- aiming ---------------- */
      const toV = e => {
        const r = cv.getBoundingClientRect();
        return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.width * VW };
      };
      let dragFrom = null;
      cv.addEventListener('pointerdown', e => {
        if (!ctx.isMyTurn || busy || ctx.status === 'finished') return;
        dragFrom = toV(e); aim = { ang: 0, pow: 0 };
        try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      });
      cv.addEventListener('pointermove', e => {
        if (!dragFrom) return;
        const p = toV(e), dx = dragFrom.x - p.x, dy = dragFrom.y - p.y;   // slingshot: pull back to launch
        aim = { ang: Math.atan2(dy, dx), pow: Math.min(MAX_POW, Math.hypot(dx, dy) * 3.4) };
        draw(); e.preventDefault();
      }, { passive: false });
      const release = () => {
        if (!dragFrom) return;
        const a = aim; dragFrom = null; aim = null;
        if (!a || a.pow < 90) { draw(); return; }                          // a tap, not a throw
        launch(a.ang, a.pow);
      };
      cv.addEventListener('pointerup', release);
      cv.addEventListener('pointercancel', release);

      function launch(ang, pow) {
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
        // Commit FIRST; the arc is decoration replayed on the next repaint.
        // Animating first would mean a phone locked mid-flight never commits
        // the throw — stranding the turn for BOTH players.
        won ? ctx.commit(s, me) : ctx.commit(s);
      }

      /* ---------------- powers ---------------- */
      POWERS.forEach(p => {
        const have = st.powers[me] && st.powers[me][p.k];
        const btn = ctx.h('button', {
          class: 'fb-pw' + (st.armed[me] === p.k ? ' armed' : ''),
          disabled: !have || !ctx.isMyTurn || busy || ctx.status === 'finished' ? '' : null,
          onclick: () => usePower(p.k),
        }, ctx.h('b', {}, p.ico), ctx.h('span', { html: p.label.replace('\n', '<br>') }));
        powRow.append(btn);
      });

      function usePower(k) {
        if (!ctx.isMyTurn || busy) return;
        const s = ctx.clone(st);
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

      /* ---------------- hint line + boot ---------------- */
      const label = st.note ? st.note
        : ctx.status === 'finished' ? 'Good scrap.'
        : !ctx.isMyTurn ? `${theirs.face} <b>${ctx.players[foe].name}</b> is winding up…`
        : `${mine.face} You're <b>${mine.name}</b> — drag back to aim, release to throw ${mine.ammo}`;
      hint.innerHTML = label + (st.extra > 0 && ctx.isMyTurn ? ' · <b>double attack!</b>' : '');

      fit();
      if (window.ResizeObserver) { const ro = new ResizeObserver(fit); ro.observe(cv); }
      else window.addEventListener('resize', fit);

      // Replay the latest shot once per device — for BOTH players, so the
      // thrower watches their own arc on the post-commit repaint.
      if (st.last && st.last.id > seenShot) {
        const sh = st.last;
        const resume = (inFlight && inFlight.id === sh.id) ? inFlight.i : 0;   // carry on mid-arc
        const ours = sh.seat === me;
        fly(sh, resume, () => {
          ctx.msg(
            sh.outcome === 'hit' ? (ours ? `💥 Direct hit! −${sh.dmg}` : `💥 ${ctx.players[sh.seat].name} got you for ${sh.dmg}`)
            : sh.outcome === 'graze' ? `😬 Glancing blow · −${sh.dmg}`
            : sh.outcome === 'fence' ? '🪵 Straight into the fence.'
            : '💨 Miss — the wind had other ideas.');
          ctx.sound[sh.dmg ? (ours ? 'good' : 'bad') : 'bad']();
          if (ctx.root && ctx.root.isConnected) { ctx.root.innerHTML = ''; DEF.render(ctx); }
        });
      }
    },
  };
  Games.register(DEF);
})();
