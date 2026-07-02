/* ============================================================
   SCORE DUELS — async reflex battles that beat the latency cap:
   each player plays the SAME seeded run LOCALLY on their own
   phone, whenever they like; only the final score syncs. Best
   score wins the point like any other game.
   - No `turn`: either player can play at any time.
   - The run happens in a fullscreen overlay appended to <body>,
     so live sync repaints of the stage never interrupt a run.
   - `latest[id]` always holds the freshest ctx (updated on every
     paint) so the finish-commit never clobbers the partner's score.
   ============================================================ */
(function () {
  const css = `
  .dl-card{ text-align:center; }
  .dl-status{ display:flex; gap:12px; justify-content:center; margin:14px 0; }
  .dl-p{ flex:1; max-width:150px; padding:14px 10px; border-radius:14px; background:var(--bg-2); border:1px solid var(--line); }
  .dl-p .nm{ font-size:12px; font-weight:700; margin-bottom:6px; }
  .dl-p .sc{ font-family:var(--font-num); font-weight:900; font-size:24px; }
  .dl-p.done{ border-color:var(--lime); } .dl-p .sc small{ font-size:11px; color:var(--ink-faint); font-weight:400; }
  .dl-p.p0 .nm{ color:var(--p1); } .dl-p.p1 .nm{ color:var(--p2); }
  .dl-hint{ font-size:12.5px; color:var(--ink-dim); margin:4px 0 12px; line-height:1.5; }
  .duel-ov{ position:fixed; inset:0; z-index:110; display:flex; flex-direction:column; background:rgba(4,5,12,.97); }
  .dov-head{ display:flex; align-items:center; justify-content:space-between; padding:calc(10px + var(--safe-t)) 16px 10px; }
  .dov-head b{ font-family:var(--font-display); font-size:14px; letter-spacing:1px; }
  .dov-quit{ padding:8px 14px; border-radius:999px; background:var(--panel-2); border:1px solid var(--line); color:var(--ink-dim); font-size:13px; }
  .dov-stage{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; padding:12px; touch-action:none; }
  .dov-score{ font-family:var(--font-num); font-weight:900; font-size:22px; color:var(--gold); min-height:28px; }
  .dov-end{ text-align:center; }
  .dov-end .big{ font-family:var(--font-num); font-weight:900; font-size:52px; color:var(--gold); text-shadow:0 0 26px rgba(255,214,107,.5); }
  .dov-pad{ display:grid; grid-template-columns:repeat(3,64px); grid-template-rows:repeat(2,54px); gap:7px; justify-content:center; }
  .dov-pad button{ border-radius:13px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-size:22px; }
  .dov-pad button:active{ transform:scale(.9); border-color:var(--violet); }
  .rx-pad{ width:min(86vw,340px); height:min(60vh,380px); border-radius:22px; display:grid; place-items:center;
    font-family:var(--font-display); font-weight:800; font-size:20px; letter-spacing:1px; border:1px solid var(--glass-brd); user-select:none; }
  .rx-pad.idle{ background:var(--panel-2); } .rx-pad.arm{ background:rgba(255,77,109,.24); color:#ff8fa8; }
  .rx-pad.go{ background:rgba(121,245,182,.3); color:var(--lime); box-shadow:0 0 40px -8px var(--lime); }
  .rx-rounds{ font-size:13px; color:var(--ink-dim); }
  .mth-q{ font-family:var(--font-num); font-weight:900; font-size:44px; }
  .mth-opts{ display:grid; grid-template-columns:repeat(2,minmax(110px,1fr)); gap:10px; width:min(84vw,320px); }
  .mth-opts button{ padding:20px 8px; border-radius:15px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink);
    font-family:var(--font-num); font-weight:900; font-size:24px; }
  .mth-opts button:active{ transform:scale(.93); }
  .dov-timebar{ width:min(84vw,320px); height:8px; border-radius:99px; background:var(--bg-2); overflow:hidden; }
  .dov-timebar i{ display:block; height:100%; background:linear-gradient(90deg,var(--cyan),var(--magenta)); transition:width .25s linear; }
  .snk-cv{ border-radius:14px; background:rgba(0,0,0,.4); border:1px solid var(--glass-brd); }
  .g2048{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px; width:min(84vw,330px); aspect-ratio:1;
    background:rgba(0,0,0,.3); padding:8px; border-radius:16px; }
  .g2048 .t{ display:grid; place-items:center; border-radius:10px; background:var(--bg-2); font-family:var(--font-num); font-weight:900; font-size:22px; }
  .g2048 .t.f{ color:#0a0714; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const mulberry32 = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const latest = {};                                   // gameId → freshest ctx (set on every paint)
  let ov = null, ovCleanup = null;
  function closeOverlay() {
    if (ovCleanup) { try { ovCleanup(); } catch (e) {} ovCleanup = null; }
    if (ov) { ov.remove(); ov = null; }
    window.removeEventListener('hashchange', closeOverlay);
  }
  function openOverlay(def, seed, onScore) {
    closeOverlay();
    const stage = document.createElement('div'); stage.className = 'dov-stage';
    ov = document.createElement('div'); ov.className = 'duel-ov';
    const head = document.createElement('div'); head.className = 'dov-head';
    head.innerHTML = `<b>${def.emoji} ${def.name}</b>`;
    const quit = document.createElement('button'); quit.className = 'dov-quit'; quit.textContent = '✕ Quit run';
    quit.onclick = () => { Store.Sound.bad(); closeOverlay(); };
    head.append(quit); ov.append(head, stage); document.body.append(ov);
    window.addEventListener('hashchange', closeOverlay);
    let finished = false;
    ovCleanup = def.play(stage, mulberry32(seed), score => {
      if (finished) return; finished = true;
      onScore(score);                                  // commit FIRST — the score is banked even if they bail
      stage.innerHTML = '';
      const end = document.createElement('div'); end.className = 'dov-end';
      end.innerHTML = `<div style="font-size:40px">${def.emoji}</div>
        <div class="big">${score}</div>
        <div style="color:var(--ink-dim);font-size:13px;margin:4px 0 18px">${def.unit} — locked in ✓</div>`;
      const ok = document.createElement('button'); ok.className = 'btn btn-primary'; ok.textContent = 'Done ✓';
      ok.onclick = closeOverlay;
      end.append(ok); stage.append(end);
      Store.Sound.win();
    });
  }

  function makeDuel(def) {
    Games.register({
      id: def.id, name: def.name, emoji: def.emoji, category: 'Duel', accent: def.accent,
      tagline: def.tagline,
      init: host => ({ seed: 1 + Math.floor(Math.random() * 1e9), results: [null, null], host }),
      render(ctx) {
        latest[def.id] = ctx;
        const st = ctx.state, me = ctx.me;
        const frame = ctx.h('div', { class: 'board-frame dl-card' });
        frame.append(ctx.h('div', { class: 'dl-hint' }, def.hint));
        const row = ctx.h('div', { class: 'dl-status' });
        [0, 1].forEach(p => {
          const r = st.results[p];
          row.append(ctx.h('div', { class: 'dl-p p' + p + (r != null ? ' done' : '') },
            ctx.h('div', { class: 'nm' }, ctx.players[p].name + (p === me ? ' (you)' : '')),
            ctx.h('div', { class: 'sc' }, r != null ? [String(r), ctx.h('small', {}, ' ' + def.unit)] : '—')));
        });
        frame.append(row);
        if (ctx.status === 'active') {
          if (st.results[me] == null) {
            frame.append(ctx.h('button', { class: 'btn btn-primary btn-block', onclick: () => openOverlay(def, st.seed, finish) }, '▶ Play your run'));
            const them = st.results[1 - me];
            ctx.msg(them != null ? `${ctx.seat(1 - me).name} scored ${them} ${def.unit} — ${def.lowerWins ? 'go faster!' : 'beat it!'} 🔥` : 'Same seed, same game — play whenever you’re ready', 'var(--gold)');
          } else {
            ctx.msg(`You’re locked in — waiting for ${ctx.seat(1 - me).name}… 🍿`, 'var(--ink-faint)');
          }
        }
        ctx.root.append(frame);
        function finish(score) {
          const c = latest[def.id] || ctx;               // freshest state → never drop the partner's score
          const s = c.clone(c.state); s.results[me] = score;
          const a = s.results[0], b = s.results[1];
          if (a != null && b != null) {
            const w = a === b ? 'draw' : ((def.lowerWins ? a < b : a > b) ? 0 : 1);
            c.commit(s, w);
          } else c.commit(s);
        }
      },
    });
  }

  /* ---------------- 1. REACTION DUEL ---------------- */
  makeDuel({
    id: 'reaction-duel', name: 'Reaction Duel', emoji: '⚡', accent: '#ffd66b', unit: 'ms avg', lowerWins: true,
    tagline: 'Tap the green — fastest nerves win.',
    hint: '5 rounds: wait for GREEN, then tap as fast as you can. Jumping the gun costs a 500ms round. Lowest average wins.',
    play(stage, rng, done) {
      const delays = Array.from({ length: 5 }, () => 900 + Math.floor(rng() * 2200));
      const times = []; let round = 0, t0 = 0, phase = 'idle', tmr = null;
      const info = document.createElement('div'); info.className = 'rx-rounds';
      const pad = document.createElement('div'); pad.className = 'rx-pad idle'; pad.textContent = 'TAP TO START';
      const scoreEl = document.createElement('div'); scoreEl.className = 'dov-score';
      stage.append(info, pad, scoreEl);
      const show = () => { info.textContent = `Round ${Math.min(round + 1, 5)} / 5`; scoreEl.textContent = times.length ? times.join(' · ') + ' ms' : ''; };
      show();
      function arm() {
        phase = 'arm'; pad.className = 'rx-pad arm'; pad.textContent = 'wait for it…';
        tmr = setTimeout(() => { phase = 'go'; pad.className = 'rx-pad go'; pad.textContent = 'GO! TAP!'; t0 = performance.now(); Store.Sound.countdown(); }, delays[round]);
      }
      pad.addEventListener('pointerdown', () => {
        if (phase === 'idle') { arm(); show(); return; }
        if (phase === 'arm') { clearTimeout(tmr); times.push(500); Store.Sound.bad(); next('Too soon! +500ms 😬'); return; }
        if (phase === 'go') { times.push(Math.round(performance.now() - t0)); Store.Sound.good(); next(); }
      });
      function next(note) {
        round++; show();
        if (round >= 5) { const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length); setTimeout(() => done(avg), 500); pad.className = 'rx-pad idle'; pad.textContent = '🏁'; return; }
        phase = 'idle'; pad.className = 'rx-pad idle'; pad.textContent = note || 'TAP FOR NEXT ROUND';
      }
      return () => clearTimeout(tmr);
    },
  });

  /* ---------------- 2. SPEED MATH ---------------- */
  makeDuel({
    id: 'speed-math', name: 'Speed Math', emoji: '➗', accent: '#79f5b6', unit: 'correct',
    tagline: '45 seconds of quickfire sums.',
    hint: '45 seconds, same questions for both of you. Tap the right answer — most correct wins. Wrong answers just waste your clock.',
    play(stage, rng, done) {
      const SECS = 45; let score = 0, over = false;
      const bar = document.createElement('div'); bar.className = 'dov-timebar'; bar.innerHTML = '<i style="width:100%"></i>';
      const scoreEl = document.createElement('div'); scoreEl.className = 'dov-score'; scoreEl.textContent = 'Score: 0';
      const q = document.createElement('div'); q.className = 'mth-q';
      const opts = document.createElement('div'); opts.className = 'mth-opts';
      stage.append(bar, scoreEl, q, opts);
      const t0 = performance.now();
      const tick = setInterval(() => {
        const left = Math.max(0, SECS - (performance.now() - t0) / 1000);
        bar.firstChild.style.width = (left / SECS * 100) + '%';
        if (!left && !over) { over = true; clearInterval(tick); done(score); }
      }, 250);
      function nextQ() {
        if (over) return;
        const kind = Math.floor(rng() * 3); let a, b, ans, txt;
        if (kind === 0) { a = 11 + Math.floor(rng() * 78); b = 11 + Math.floor(rng() * 78); ans = a + b; txt = `${a} + ${b}`; }
        else if (kind === 1) { a = 30 + Math.floor(rng() * 69); b = 11 + Math.floor(rng() * (a - 10)); ans = a - b; txt = `${a} − ${b}`; }
        else { a = 3 + Math.floor(rng() * 10); b = 3 + Math.floor(rng() * 10); ans = a * b; txt = `${a} × ${b}`; }
        q.textContent = txt + ' = ?';
        const set = new Set([ans]);
        while (set.size < 4) { const d = ans + (Math.floor(rng() * 19) - 9); if (d !== ans && d >= 0) set.add(d); }
        const arr = [...set];
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
        opts.innerHTML = '';
        arr.forEach(v => { const btn = document.createElement('button'); btn.textContent = v;
          btn.onclick = () => { if (over) return; if (v === ans) { score++; scoreEl.textContent = 'Score: ' + score; Store.Sound.good(); } else Store.Sound.bad(); nextQ(); };
          opts.append(btn); });
      }
      nextQ();
      return () => { over = true; clearInterval(tick); };
    },
  });

  /* ---------------- 3. SNAKE ---------------- */
  makeDuel({
    id: 'snake-duel', name: 'Snake', emoji: '🐍', accent: '#b6ff3a', unit: 'apples',
    tagline: 'Old-school snake · same apples for both.',
    hint: 'Swipe (or use the pad) to steer. Eat apples, don’t hit walls or yourself. Same apple layout for both players — most apples wins.',
    play(stage, rng, done) {
      const N = 17, PX = Math.min(20, Math.floor(Math.min(innerWidth * .84, 340) / N));
      const cv = document.createElement('canvas'); cv.className = 'snk-cv'; cv.width = cv.height = N * PX;
      const scoreEl = document.createElement('div'); scoreEl.className = 'dov-score'; scoreEl.textContent = '🍎 0';
      const pad = document.createElement('div'); pad.className = 'dov-pad';
      stage.append(scoreEl, cv, pad);
      const g = cv.getContext('2d');
      let snake = [[8, 6], [8, 5], [8, 4]], dir = [0, 1], nextDir = [0, 1], food = null, score = 0, dead = false;
      const openCells = () => { const occ = new Set(snake.map(c => c.join(','))); const out = []; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!occ.has(r + ',' + c)) out.push([r, c]); return out; };
      const dropFood = () => { const open = openCells(); food = open[Math.floor(rng() * open.length)]; };
      dropFood();
      function draw() {
        g.clearRect(0, 0, cv.width, cv.height);
        g.fillStyle = 'rgba(255,77,157,.95)'; g.beginPath(); g.arc(food[1] * PX + PX / 2, food[0] * PX + PX / 2, PX * .38, 0, 7); g.fill();
        snake.forEach(([r, c], i) => { g.fillStyle = i === 0 ? '#8dfcff' : 'rgba(47,230,255,.8)'; g.beginPath(); g.roundRect(c * PX + 1, r * PX + 1, PX - 2, PX - 2, 5); g.fill(); });
      }
      function step() {
        if (dead) return;
        dir = nextDir;
        const h2 = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
        if (h2[0] < 0 || h2[0] >= N || h2[1] < 0 || h2[1] >= N || snake.some(c => c[0] === h2[0] && c[1] === h2[1])) {
          dead = true; Store.Sound.bad(); clearInterval(tmr); setTimeout(() => done(score), 600); return;
        }
        snake.unshift(h2);
        if (h2[0] === food[0] && h2[1] === food[1]) { score++; scoreEl.textContent = '🍎 ' + score; Store.Sound.place(); dropFood(); clearInterval(tmr); tmr = setInterval(step, Math.max(85, 150 - score * 3)); }
        else snake.pop();
        draw();
      }
      let tmr = setInterval(step, 150); draw();
      const turn = (r, c) => { if (r === -dir[0] && c === -dir[1]) return; nextDir = [r, c]; };
      [['←', 0, -1, '2/1'], ['↑', -1, 0, '1/2'], ['→', 0, 1, '2/3'], ['↓', 1, 0, '2/2']].forEach(([t, r, c, area]) => {
        const btn = document.createElement('button'); btn.textContent = t; btn.style.gridArea = area;
        btn.onclick = () => turn(r, c); pad.append(btn);
      });
      let sx = 0, sy = 0;
      stage.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      stage.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
        Math.abs(dx) > Math.abs(dy) ? turn(0, dx > 0 ? 1 : -1) : turn(dy > 0 ? 1 : -1, 0);
      }, { passive: true });
      const key = e => { const m = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key]; if (m) { e.preventDefault(); turn(m[0], m[1]); } };
      window.addEventListener('keydown', key);
      return () => { dead = true; clearInterval(tmr); window.removeEventListener('keydown', key); };
    },
  });

  /* ---------------- 4. 2048 RACE ---------------- */
  makeDuel({
    id: '2048-race', name: '2048 Race', emoji: '🔢', accent: '#ffb26b', unit: 'points',
    tagline: 'Same tiles · 2 minutes · big merges.',
    hint: 'Swipe to slide & merge tiles. Identical tile drops for both of you. Score when the 2-minute clock runs out (or you jam the board).',
    play(stage, rng, done) {
      const SECS = 120; let cells = Array(16).fill(0), score = 0, over = false;
      const bar = document.createElement('div'); bar.className = 'dov-timebar'; bar.innerHTML = '<i style="width:100%"></i>';
      const scoreEl = document.createElement('div'); scoreEl.className = 'dov-score'; scoreEl.textContent = 'Score: 0';
      const grid = document.createElement('div'); grid.className = 'g2048';
      const pad = document.createElement('div'); pad.className = 'dov-pad';
      stage.append(bar, scoreEl, grid, pad);
      const HUE = { 2: '#39d6ff', 4: '#54e0c0', 8: '#79f5b6', 16: '#c6f57a', 32: '#ffd66b', 64: '#ffb26b', 128: '#ff8f6b', 256: '#ff6b81', 512: '#ff4d9d', 1024: '#c96bff', 2048: '#9b7bff' };
      function spawn() { const open = cells.map((v, i) => v ? -1 : i).filter(i => i >= 0); if (!open.length) return; cells[open[Math.floor(rng() * open.length)]] = rng() < .1 ? 4 : 2; }
      function paint() {
        grid.innerHTML = '';
        cells.forEach(v => { const t = document.createElement('div'); t.className = 't' + (v ? ' f' : '');
          if (v) { t.textContent = v; t.style.background = HUE[v] || '#eaf0ff'; t.style.fontSize = v > 512 ? '17px' : '22px'; }
          grid.append(t); });
        scoreEl.textContent = 'Score: ' + score;
      }
      function slide(line) {                                     // returns [newLine, gained, moved]
        const a = line.filter(Boolean); let gain = 0;
        for (let i = 0; i < a.length - 1; i++) if (a[i] === a[i + 1]) { a[i] *= 2; gain += a[i]; a.splice(i + 1, 1); }
        while (a.length < 4) a.push(0);
        return [a, gain, a.some((v, i) => v !== line[i])];
      }
      function move(dir) {                                       // 0← 1→ 2↑ 3↓
        if (over) return;
        let moved = false, gain = 0;
        for (let i = 0; i < 4; i++) {
          const idx = dir < 2 ? [0, 1, 2, 3].map(j => i * 4 + j) : [0, 1, 2, 3].map(j => j * 4 + i);
          if (dir === 1 || dir === 3) idx.reverse();
          const [nl, g, m] = slide(idx.map(k => cells[k]));
          nl.forEach((v, k) => cells[idx[k]] = v);
          if (m) moved = true; gain += g;
        }
        if (!moved) { Store.Sound.bad(); return; }
        score += gain; if (gain) Store.Sound.place(); else Store.Sound.move();
        spawn(); paint();
        if (!canMove()) end();
      }
      const canMove = () => cells.some((v, i) => !v || (i % 4 < 3 && v === cells[i + 1]) || (i < 12 && v === cells[i + 4]));
      function end() { if (over) return; over = true; clearInterval(tick); done(score); }
      spawn(); spawn(); paint();
      const t0 = performance.now();
      const tick = setInterval(() => {
        const left = Math.max(0, SECS - (performance.now() - t0) / 1000);
        bar.firstChild.style.width = (left / SECS * 100) + '%';
        if (!left) end();
      }, 250);
      [['←', 0, '2/1'], ['↑', 2, '1/2'], ['→', 1, '2/3'], ['↓', 3, '2/2']].forEach(([t, d, area]) => {
        const btn = document.createElement('button'); btn.textContent = t; btn.style.gridArea = area;
        btn.onclick = () => move(d); pad.append(btn);
      });
      let sx = 0, sy = 0;
      grid.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
      grid.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) < 24 && Math.abs(dy) < 24) return;
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 0) : (dy > 0 ? 3 : 2));
      }, { passive: true });
      const key = e => { const m = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3 }[e.key]; if (m != null) { e.preventDefault(); move(m); } };
      window.addEventListener('keydown', key);
      return () => { over = true; clearInterval(tick); window.removeEventListener('keydown', key); };
    },
  });
})();
