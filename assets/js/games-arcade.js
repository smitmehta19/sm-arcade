/* ============================================================
   GAMES — Real-time Arcade (4)  top = Meera(p2) · bottom = Smit(p1)
   ============================================================ */
(function () {
  const css = `
  .arc-canvas{ width:100%; max-width:440px; display:block; margin:0 auto; border-radius:16px;
    background:#0a0618; border:1px solid var(--line); touch-action:none; box-shadow:var(--shadow); }
  .arc-hint{ text-align:center; color:var(--ink-faint); font-size:12px; margin-top:8px; }
  .dpad-wrap{ display:flex; justify-content:space-between; max-width:440px; margin:10px auto 0; }
  .dpad{ display:grid; grid-template-columns:repeat(3,44px); grid-template-rows:repeat(2,44px); gap:5px; }
  .dpad.top{ transform:rotate(180deg); }
  .dpad button{ border-radius:10px; background:var(--panel-2); border:1px solid var(--line); color:var(--ink); font-size:18px; }
  .dpad button:active{ transform:scale(.9); }
  .dpad .d-up{ grid-column:2; grid-row:1; } .dpad .d-left{ grid-column:1; grid-row:2; }
  .dpad .d-right{ grid-column:3; grid-row:2; } .dpad .d-down{ grid-column:2; grid-row:2; }
  .dpad.p0 button{ border-color:var(--p1); } .dpad.p1 button{ border-color:var(--p2); }

  .rt-arena{ max-width:440px; margin:0 auto; border-radius:18px; overflow:hidden; border:1px solid var(--line); }
  .rt-half{ height:38vh; max-height:280px; display:flex; align-items:center; justify-content:center;
    font-family:var(--font-display); font-size:13px; text-align:center; transition:background .1s; user-select:none; }
  .rt-half .big{ font-size:34px; }
  .rt-half.top{ transform:rotate(180deg); }
  .rt-wait{ background:#2a1840; color:var(--ink-dim); }
  .rt-go{ background:#1f8a3b; color:#fff; }
  .rt-win{ background:var(--violet); color:#fff; }
  .rt-foul{ background:var(--magenta); color:#fff; }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);
  const rint = n => Math.floor(Math.random() * n);

  /* ---------- 17. PONG ---------- */
  Games.register({
    id: 'pong', name: 'Pong', emoji: '🏓', category: 'Reflex', accent: '#00f0ff',
    tagline: 'First to 7. Slide to defend.',
    mount(root, ctx) {
      const W = 360, H = 560, TARGET = 7;
      const tb = ctx.turnbar(); tb.score(0, 0);
      const cv = ctx.h('canvas', { class: 'arc-canvas', width: W, height: H });
      root.append(cv, ctx.h('div', { class: 'arc-hint' }, '⬇ Smit slides bottom · ⬆ Meera slides top'));
      const g = cv.getContext('2d');
      const pw = 80, ph = 12;
      let p1x = W / 2, p2x = W / 2, score = [0, 0], running = true;
      let ball = newBall(1);
      function newBall(dir) { return { x: W / 2, y: H / 2, vx: (Math.random() * 2 - 1) * 3, vy: dir * 4.2 }; }

      function pos(clientX, clientY, rect) { return { x: (clientX - rect.left) / rect.width * W, y: (clientY - rect.top) / rect.height * H }; }
      function onTouch(e) {
        const rect = cv.getBoundingClientRect();
        for (const t of e.touches) { const p = pos(t.clientX, t.clientY, rect); if (p.y > H / 2) p1x = clamp(p.x); else p2x = clamp(p.x); }
        e.preventDefault();
      }
      function onMouse(e) { const rect = cv.getBoundingClientRect(); const p = pos(e.clientX, e.clientY, rect); if (p.y > H / 2) p1x = clamp(p.x); else p2x = clamp(p.x); }
      const clamp = x => Math.max(pw / 2, Math.min(W - pw / 2, x));
      cv.addEventListener('touchmove', onTouch, { passive: false });
      cv.addEventListener('touchstart', onTouch, { passive: false });
      cv.addEventListener('mousemove', onMouse);

      let raf;
      function loop() {
        if (!running) return;
        ball.x += ball.vx; ball.y += ball.vy;
        if (ball.x < 8) { ball.x = 8; ball.vx *= -1; ctx.sound.tap(); }
        if (ball.x > W - 8) { ball.x = W - 8; ball.vx *= -1; ctx.sound.tap(); }
        // bottom paddle (p1)
        if (ball.vy > 0 && ball.y > H - 24 - ph && ball.y < H - 24 && Math.abs(ball.x - p1x) < pw / 2 + 8) { ball.vy = -Math.abs(ball.vy) * 1.04; ball.vx += (ball.x - p1x) / (pw / 2) * 2.5; ctx.sound.place(); }
        if (ball.vy < 0 && ball.y < 24 + ph && ball.y > 24 && Math.abs(ball.x - p2x) < pw / 2 + 8) { ball.vy = Math.abs(ball.vy) * 1.04; ball.vx += (ball.x - p2x) / (pw / 2) * 2.5; ctx.sound.place(); }
        ball.vx = Math.max(-7, Math.min(7, ball.vx));
        if (ball.y > H) { score[1]++; point(1); }
        else if (ball.y < 0) { score[0]++; point(0); }
        draw();
        raf = requestAnimationFrame(loop);
      }
      function point(p) {
        tb.score(score[0], score[1]); ctx.sound.good();
        if (score[p] >= TARGET) { running = false; return ctx.win(p, `${score[0]}–${score[1]}`); }
        ball = newBall(p === 0 ? -1 : 1);
      }
      function draw() {
        g.clearRect(0, 0, W, H);
        g.strokeStyle = 'rgba(178,102,255,.3)'; g.setLineDash([8, 10]); g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.setLineDash([]);
        g.font = 'bold 60px Orbitron, sans-serif'; g.textAlign = 'center';
        g.fillStyle = 'rgba(0,240,255,.12)'; g.fillText(score[0], W / 2, H / 2 + 64);
        g.fillStyle = 'rgba(255,47,166,.12)'; g.save(); g.translate(W / 2, H / 2 - 24); g.rotate(Math.PI); g.fillText(score[1], 0, 0); g.restore();
        g.fillStyle = ctx.players[0].color; g.shadowColor = ctx.players[0].color; g.shadowBlur = 12; roundRect(p1x - pw / 2, H - 24, pw, ph);
        g.fillStyle = ctx.players[1].color; g.shadowColor = ctx.players[1].color; roundRect(p2x - pw / 2, 12, pw, ph);
        g.beginPath(); g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 16; g.arc(ball.x, ball.y, 8, 0, 7); g.fill(); g.shadowBlur = 0;
      }
      function roundRect(x, y, w, h) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, 6) : g.rect(x, y, w, h); g.fill(); }
      ctx.msg('Defend your edge! ⚡');
      loop();
      ctx.onCleanup(() => { running = false; cancelAnimationFrame(raf); cv.removeEventListener('touchmove', onTouch); cv.removeEventListener('touchstart', onTouch); cv.removeEventListener('mousemove', onMouse); });
    },
  });

  /* ---------- 18. AIR HOCKEY ---------- */
  Games.register({
    id: 'air-hockey', name: 'Air Hockey', emoji: '🥅', category: 'Reflex', accent: '#ff2fa6',
    tagline: 'Smash the puck home. First to 7.',
    mount(root, ctx) {
      const W = 360, H = 560, TARGET = 7, GW = W * 0.42;
      const tb = ctx.turnbar(); tb.score(0, 0);
      const cv = ctx.h('canvas', { class: 'arc-canvas', width: W, height: H });
      root.append(cv, ctx.h('div', { class: 'arc-hint' }, 'Drag your mallet — Smit bottom, Meera top'));
      const g = cv.getContext('2d');
      const mr = 26, pr = 15;
      const m = [{ x: W / 2, y: H - 70, px: W / 2, py: H - 70 }, { x: W / 2, y: 70, px: W / 2, py: 70 }];
      let puck = { x: W / 2, y: H / 2, vx: 0, vy: 0 }, score = [0, 0], running = true, raf;

      function pos(cx, cy, rect) { return { x: (cx - rect.left) / rect.width * W, y: (cy - rect.top) / rect.height * H }; }
      function onTouch(e) { const rect = cv.getBoundingClientRect(); for (const t of e.touches) { const p = pos(t.clientX, t.clientY, rect); const i = p.y > H / 2 ? 0 : 1; setMallet(i, p); } e.preventDefault(); }
      function onMouse(e) { const rect = cv.getBoundingClientRect(); const p = pos(e.clientX, e.clientY, rect); const i = p.y > H / 2 ? 0 : 1; setMallet(i, p); }
      function setMallet(i, p) {
        const minY = i === 0 ? H / 2 + mr : mr, maxY = i === 0 ? H - mr : H / 2 - mr;
        m[i].x = Math.max(mr, Math.min(W - mr, p.x)); m[i].y = Math.max(minY, Math.min(maxY, p.y));
      }
      cv.addEventListener('touchmove', onTouch, { passive: false });
      cv.addEventListener('touchstart', onTouch, { passive: false });
      cv.addEventListener('mousemove', onMouse);

      function loop() {
        if (!running) return;
        puck.x += puck.vx; puck.y += puck.vy; puck.vx *= 0.995; puck.vy *= 0.995;
        if (puck.x < pr) { puck.x = pr; puck.vx *= -0.9; } if (puck.x > W - pr) { puck.x = W - pr; puck.vx *= -0.9; }
        // top/bottom walls except goal gap
        const inGoal = Math.abs(puck.x - W / 2) < GW / 2;
        if (puck.y < pr) { if (inGoal) return goal(0); puck.y = pr; puck.vy *= -0.9; }
        if (puck.y > H - pr) { if (inGoal) return goal(1); puck.y = H - pr; puck.vy *= -0.9; }
        // mallet collisions
        for (let i = 0; i < 2; i++) {
          const dx = puck.x - m[i].x, dy = puck.y - m[i].y, d = Math.hypot(dx, dy);
          if (d < pr + mr && d > 0) {
            const nx = dx / d, ny = dy / d; puck.x = m[i].x + nx * (pr + mr); puck.y = m[i].y + ny * (pr + mr);
            const mvx = m[i].x - m[i].px, mvy = m[i].y - m[i].py;
            puck.vx = nx * 6 + mvx * 1.2; puck.vy = ny * 6 + mvy * 1.2; ctx.sound.place();
          }
          m[i].px = m[i].x; m[i].py = m[i].y;
        }
        const sp = Math.hypot(puck.vx, puck.vy); if (sp > 12) { puck.vx *= 12 / sp; puck.vy *= 12 / sp; }
        draw(); raf = requestAnimationFrame(loop);
      }
      function goal(scorer) { score[scorer]++; tb.score(score[0], score[1]); ctx.sound.win(); if (score[scorer] >= TARGET) { running = false; draw(); return ctx.win(scorer, `${score[0]}–${score[1]}`); } puck = { x: W / 2, y: H / 2, vx: 0, vy: (scorer === 0 ? 1 : -1) * 2 }; }
      function draw() {
        g.clearRect(0, 0, W, H);
        g.strokeStyle = 'rgba(178,102,255,.3)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
        g.beginPath(); g.arc(W / 2, H / 2, 44, 0, 7); g.stroke();
        // goals
        g.strokeStyle = ctx.players[1].color; g.lineWidth = 5; g.beginPath(); g.moveTo(W / 2 - GW / 2, 2); g.lineTo(W / 2 + GW / 2, 2); g.stroke();
        g.strokeStyle = ctx.players[0].color; g.beginPath(); g.moveTo(W / 2 - GW / 2, H - 2); g.lineTo(W / 2 + GW / 2, H - 2); g.stroke();
        for (let i = 0; i < 2; i++) { g.fillStyle = ctx.players[i].color; g.shadowColor = ctx.players[i].color; g.shadowBlur = 16; g.beginPath(); g.arc(m[i].x, m[i].y, mr, 0, 7); g.fill(); }
        g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 14; g.beginPath(); g.arc(puck.x, puck.y, pr, 0, 7); g.fill(); g.shadowBlur = 0;
      }
      ctx.msg('Smash it in! 🥅'); loop();
      ctx.onCleanup(() => { running = false; cancelAnimationFrame(raf); cv.removeEventListener('touchmove', onTouch); cv.removeEventListener('touchstart', onTouch); cv.removeEventListener('mousemove', onMouse); });
    },
  });

  /* ---------- 19. SNAKE DUEL ---------- */
  Games.register({
    id: 'snake-duel', name: 'Snake Duel', emoji: '🐍', category: 'Reflex', accent: '#b6ff3a',
    tagline: 'Outlast your rival. Don’t crash!',
    mount(root, ctx) {
      const COLS = 17, ROWS = 21, CELL = 20; const W = COLS * CELL, H = ROWS * CELL;
      const tb = ctx.turnbar(); tb.score(0, 0);
      const cv = ctx.h('canvas', { class: 'arc-canvas', width: W, height: H });
      const dTop = dpad(1, true), dBot = dpad(0, false);
      root.append(cv, ctx.h('div', { class: 'dpad-wrap' }, dTop, dBot));
      const g = cv.getContext('2d');
      let snakes, dirs, nextd, food, alive, running, raf, acc = 0, last = 0, len;
      const TICK = 130;
      reset();

      function reset() {
        snakes = [[{ x: 8, y: 16 }], [{ x: 8, y: 4 }]];
        dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }]; nextd = [dirs[0], dirs[1]];
        len = [4, 4]; alive = [true, true]; food = spawnFood(); running = true; acc = 0; last = 0;
        ctx.msg('Eat 🍎 to grow — last snake alive wins!');
        raf = requestAnimationFrame(loop);
      }
      function spawnFood() { let f; do { f = { x: rint(COLS), y: rint(ROWS) }; } while (occupied(f)); return f; }
      function occupied(c) { return snakes.some(s => s.some(seg => seg.x === c.x && seg.y === c.y)); }
      function dpad(p, top) {
        const d = ctx.h('div', { class: 'dpad p' + p + (top ? ' top' : '') });
        const mk = (cls, dx, dy, lab) => ctx.h('button', { class: cls, onclick: () => turn(p, dx, dy) }, lab);
        d.append(mk('d-up', 0, -1, '▲'), mk('d-left', -1, 0, '◀'), mk('d-right', 1, 0, '▶'), mk('d-down', 0, 1, '▼'));
        return d;
      }
      function turn(p, dx, dy) { if (!alive[p]) return; if (dx === -dirs[p].x && dy === -dirs[p].y) return; nextd[p] = { x: dx, y: dy }; ctx.sound.tap(); }
      function loop(t) {
        if (!running) return;
        if (!last) last = t; acc += t - last; last = t;
        while (acc >= TICK) { step(); acc -= TICK; }
        draw(); raf = requestAnimationFrame(loop);
      }
      function step() {
        const heads = [];
        for (let p = 0; p < 2; p++) { if (!alive[p]) { heads.push(null); continue; } dirs[p] = nextd[p]; const h = snakes[p][0]; heads.push({ x: h.x + dirs[p].x, y: h.y + dirs[p].y }); }
        // determine deaths
        const died = [false, false];
        for (let p = 0; p < 2; p++) {
          if (!alive[p]) continue; const h = heads[p];
          if (h.x < 0 || h.x >= COLS || h.y < 0 || h.y >= ROWS) died[p] = true;
          for (let q = 0; q < 2; q++) { const body = snakes[q]; const skip = (q === p) ? 1 : 0; for (let i = skip; i < body.length; i++) if (body[i].x === h.x && body[i].y === h.y) died[p] = true; }
        }
        if (heads[0] && heads[1] && heads[0].x === heads[1].x && heads[0].y === heads[1].y) { died[0] = died[1] = true; }
        // apply
        for (let p = 0; p < 2; p++) {
          if (!alive[p]) continue;
          if (died[p]) { alive[p] = false; ctx.sound.bad(); continue; }
          snakes[p].unshift(heads[p]);
          if (heads[p].x === food.x && heads[p].y === food.y) { len[p]++; ctx.sound.good(); food = spawnFood(); }
          while (snakes[p].length > len[p]) snakes[p].pop();
        }
        if (!alive[0] || !alive[1]) endCheck();
      }
      function endCheck() {
        running = false; cancelAnimationFrame(raf); draw();
        if (!alive[0] && !alive[1]) return ctx.draw('Both crashed!');
        const winner = alive[0] ? 0 : 1; const sc = [len[0], len[1]]; tb.score(sc[0], sc[1]);
        ctx.win(winner, `Length ${sc[0]}–${sc[1]}`);
      }
      function draw() {
        g.fillStyle = '#0a0618'; g.fillRect(0, 0, W, H);
        g.strokeStyle = 'rgba(178,102,255,.08)'; for (let x = 0; x <= COLS; x++) { g.beginPath(); g.moveTo(x * CELL, 0); g.lineTo(x * CELL, H); g.stroke(); } for (let y = 0; y <= ROWS; y++) { g.beginPath(); g.moveTo(0, y * CELL); g.lineTo(W, y * CELL); g.stroke(); }
        g.font = '15px serif'; g.textAlign = 'center'; g.fillText('🍎', food.x * CELL + CELL / 2, food.y * CELL + CELL / 2 + 6);
        for (let p = 0; p < 2; p++) {
          g.fillStyle = ctx.players[p].color; g.shadowColor = ctx.players[p].color; g.shadowBlur = alive[p] ? 8 : 0; g.globalAlpha = alive[p] ? 1 : 0.35;
          snakes[p].forEach((s, i) => { g.fillRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4); });
          g.globalAlpha = 1; g.shadowBlur = 0;
        }
      }
      tb.score(0, 0);
      ctx.onCleanup(() => { running = false; cancelAnimationFrame(raf); });
    },
  });

  /* ---------- 20. REACTION TAP ---------- */
  Games.register({
    id: 'reaction-tap', name: 'Reaction Duel', emoji: '⚡', category: 'Reflex', accent: '#ffd23a',
    tagline: 'Tap on green. Best of 5.',
    mount(root, ctx) {
      const TARGET = 3; const tb = ctx.turnbar(); tb.set(0); tb.score(0, 0);
      let scores = [0, 0], armed = false, green = false, done = false, timer = null;
      const top = ctx.h('div', { class: 'rt-half top rt-wait', onpointerdown: () => tap(1) }, ctx.h('span', {}, `${ctx.players[1].name}\nWAIT…`));
      const bot = ctx.h('div', { class: 'rt-half rt-wait', onpointerdown: () => tap(0) }, ctx.h('span', {}, `${ctx.players[0].name}\nWAIT…`));
      const arena = ctx.h('div', { class: 'rt-arena' }, top, bot);
      root.append(arena);
      ctx.msg('Wait for GREEN, then tap your half ⚡', 'var(--gold)');
      arm();
      function setHalf(el, cls, txt) { el.className = 'rt-half ' + (el === top ? 'top ' : '') + cls; el.firstChild.textContent = txt; }
      function arm() {
        armed = true; green = false;
        setHalf(top, 'rt-wait', `${ctx.players[1].name}\nWAIT…`); setHalf(bot, 'rt-wait', `${ctx.players[0].name}\nWAIT…`);
        timer = setTimeout(() => { green = true; ctx.sound.win(); setHalf(top, 'rt-go', 'TAP!'); setHalf(bot, 'rt-go', 'TAP!'); }, 1200 + rint(2600));
        ctx.onCleanup(() => clearTimeout(timer));
      }
      function tap(p) {
        if (done || !armed) return;
        if (!green) { // false start
          armed = false; clearTimeout(timer); ctx.sound.bad();
          scores[1 - p]++; tb.score(scores[0], scores[1]);
          setHalf(p === 0 ? bot : top, 'rt-foul', 'TOO SOON!'); setHalf(p === 0 ? top : bot, 'rt-win', '+1');
          ctx.msg(`${ctx.players[p].name} jumped early! Point to ${ctx.players[1 - p].name}`, ctx.players[1 - p].color);
          finishRound();
        } else {
          armed = false; ctx.sound.good(); scores[p]++; tb.score(scores[0], scores[1]);
          setHalf(p === 0 ? bot : top, 'rt-win', 'WIN +1'); setHalf(p === 0 ? top : bot, 'rt-wait', 'too slow');
          ctx.msg(`${ctx.players[p].name} wins the round!`, ctx.players[p].color);
          finishRound();
        }
      }
      function finishRound() {
        if (scores[0] >= TARGET) { done = true; return ctx.win(0, `${scores[0]}–${scores[1]}`); }
        if (scores[1] >= TARGET) { done = true; return ctx.win(1, `${scores[0]}–${scores[1]}`); }
        setTimeout(() => { if (!done) arm(); }, 1100);
      }
    },
  });

})();
