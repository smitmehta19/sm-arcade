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
  let seenShot = 0;          // last shot id THIS device has animated (survives re-renders)

  Games.register({
    id: 'fleabag', name: 'Fleabag vs Mutt', emoji: '🐱', category: 'Duel', accent: '#ffd66b',
    tagline: 'Lob junk over the fence · mind the wind.',
    test: { simulate, throwFrom, torsoOf, VW, VH, GROUND, FENCE_X, FENCE_TOP, MAX_POW },
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
      if (!st.last) seenShot = 0;                         // new match → allow replays again

      const wrap = ctx.h('div', { class: 'fb-wrap' });
      ctx.root.append(ctx.turnBar({ scores: [st.hp[0], st.hp[1]] }), wrap);

      const cv = ctx.h('canvas', { class: 'fb-cv' });
      const hint = ctx.h('div', { class: 'fb-hint' });
      const powRow = ctx.h('div', { class: 'fb-powers' });
      wrap.append(cv, hint, powRow);

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
        g.clearRect(0, 0, VW, VH);
        const sky = g.createLinearGradient(0, 0, 0, GROUND);
        sky.addColorStop(0, '#0a1030'); sky.addColorStop(1, '#161d3f');
        g.fillStyle = sky; g.fillRect(0, 0, VW, GROUND);
        g.fillStyle = 'rgba(255,214,107,.85)'; g.beginPath(); g.arc(860, 86, 30, 0, 7); g.fill();

        g.fillStyle = '#0d1226'; g.fillRect(0, GROUND, VW, VH - GROUND);
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
        if (flying) {
          const p = flying.pts[Math.min(flying.i, flying.pts.length - 1)];
          g.font = '30px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(CHARS[flying.seat].ammo, p[0], p[1]);
        }
      }

      function drawFighter(seat) {
        const c = CHARS[seat], col = ctx.players[seat].color, x = FEET[seat], hp = Math.max(0, st.hp[seat]);
        g.save();
        g.shadowColor = col; g.shadowBlur = 26;
        g.fillStyle = 'rgba(255,255,255,.05)';
        g.beginPath(); g.arc(x, GROUND - 40, 40, 0, 7); g.fill();
        g.restore();
        g.font = '62px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.globalAlpha = hp > 0 ? 1 : .35;
        g.fillText(c.face, x, GROUND - 42);
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
      function fly(shot, done) {
        busy = true;
        flying = { pts: simulate(shot.seat, shot.ang, shot.pow, shot.wind).pts, i: 0, seat: shot.seat };
        (function step() {
          if (!flying || !cv.isConnected) { busy = false; return; }
          flying.i += 4;
          draw();
          if (flying.i < flying.pts.length - 1) requestAnimationFrame(step);
          else { flying = null; busy = false; draw(); if (done) done(); }
        })();
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
        s.last = { seat: me, ang, pow, wind: s.wind, outcome: sim.outcome, dmg, id: s.n };
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
        const sh = st.last; seenShot = sh.id;
        const ours = sh.seat === me;
        fly(sh, () => {
          ctx.msg(
            sh.outcome === 'hit' ? (ours ? `💥 Direct hit! −${sh.dmg}` : `💥 ${ctx.players[sh.seat].name} got you for ${sh.dmg}`)
            : sh.outcome === 'graze' ? `😬 Glancing blow · −${sh.dmg}`
            : sh.outcome === 'fence' ? '🪵 Straight into the fence.'
            : '💨 Miss — the wind had other ideas.');
          ctx.sound[sh.dmg ? (ours ? 'good' : 'bad') : 'bad']();
        });
      }
    },
  });
})();
