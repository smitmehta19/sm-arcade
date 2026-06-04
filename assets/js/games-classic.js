/* ============================================================
   GAMES — Strategy classics (8)
   ============================================================ */
(function () {
  // shared CSS for these boards
  const css = `
  .ttt{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; aspect-ratio:1; }
  .ttt-cell{ display:grid; place-items:center; font-size:13vw; max-font-size:60px; font-weight:900;
    background:var(--bg-2); border:1px solid var(--line); border-radius:14px; color:var(--ink);
    aspect-ratio:1; transition:transform .1s, box-shadow .2s; }
  @media(min-width:520px){ .ttt-cell{ font-size:60px; } }
  .ttt-cell:active{ transform:scale(.94); }
  .ttt-cell.win{ box-shadow:0 0 22px var(--violet); border-color:var(--violet); }

  .c4{ display:grid; grid-template-columns:repeat(7,1fr); gap:6px; background:rgba(120,70,220,.12);
    padding:8px; border-radius:14px; }
  .c4-cell{ aspect-ratio:1; border-radius:50%; background:var(--bg); border:1px solid var(--line);
    transition:transform .1s; }
  .c4-cell.p0{ background:var(--p1); box-shadow:0 0 14px var(--p1); animation:drop .25s; }
  .c4-cell.p1{ background:var(--p2); box-shadow:0 0 14px var(--p2); animation:drop .25s; }
  .c4-cell.win{ outline:3px solid #fff; }
  @keyframes drop{ from{ transform:translateY(-220px); } }
  .c4-col{ display:flex; flex-direction:column; gap:6px; cursor:pointer; }
  .c4-col:hover .c4-cell:first-child{ box-shadow:inset 0 0 0 2px var(--violet); }

  .db{ display:grid; gap:0; margin:0 auto; }
  .db .dot{ width:13px; height:13px; border-radius:50%; background:var(--violet); box-shadow:0 0 8px var(--violet); }
  .db .edge{ background:transparent; border:none; border-radius:6px; transition:background .15s; align-self:stretch; justify-self:stretch; }
  .db .edge.h{ min-height:13px; }
  .db .edge.v{ min-width:13px; }
  .db .edge:not(.on):hover{ background:rgba(178,102,255,.3); }
  .db .edge.on.p0{ background:var(--p1); box-shadow:0 0 8px var(--p1); }
  .db .edge.on.p1{ background:var(--p2); box-shadow:0 0 8px var(--p2); }
  .db .box{ display:grid; place-items:center; font-weight:900; font-size:18px; }
  .db .box.p0{ background:var(--p1-soft); color:var(--p1); }
  .db .box.p1{ background:var(--p2-soft); color:var(--p2); }

  .cb{ display:grid; grid-template-columns:repeat(8,1fr); aspect-ratio:1; border-radius:12px;
    overflow:hidden; border:2px solid var(--line); }
  .cb-sq{ position:relative; display:grid; place-items:center; }
  .cb-sq.dark{ background:rgba(120,70,220,.16); }
  .cb-sq.light{ background:rgba(255,255,255,.04); }
  .cb-sq.sel{ box-shadow:inset 0 0 0 3px var(--gold); }
  .cb-sq.move::after{ content:''; width:30%; height:30%; border-radius:50%; background:rgba(182,255,58,.6); }
  .cb-pc{ width:74%; height:74%; border-radius:50%; display:grid; place-items:center;
    font-size:14px; transition:transform .12s; }
  .cb-pc.p0{ background:radial-gradient(circle at 35% 30%, #6ffcff, var(--p1)); box-shadow:0 0 10px var(--p1); }
  .cb-pc.p1{ background:radial-gradient(circle at 35% 30%, #ff9ccd, var(--p2)); box-shadow:0 0 10px var(--p2); }
  .cb-pc.king::after{ content:'♛'; color:#07040f; font-size:15px; }

  .rv{ display:grid; grid-template-columns:repeat(8,1fr); aspect-ratio:1; gap:3px;
    background:rgba(20,80,40,.35); padding:6px; border-radius:12px; }
  .rv-sq{ position:relative; background:rgba(0,0,0,.25); border-radius:6px; display:grid; place-items:center; cursor:pointer; }
  .rv-sq.valid::after{ content:''; width:26%; height:26%; border-radius:50%; background:rgba(255,255,255,.25); }
  .rv-d{ width:78%; height:78%; border-radius:50%; animation:flip .3s; }
  .rv-d.p0{ background:radial-gradient(circle at 35% 30%, #aef9ff, var(--p1)); box-shadow:0 0 8px var(--p1); }
  .rv-d.p1{ background:radial-gradient(circle at 35% 30%, #ffb4dc, var(--p2)); box-shadow:0 0 8px var(--p2); }
  @keyframes flip{ from{ transform:rotateY(90deg); } }

  .gmk{ display:grid; gap:0; background:#1a0f33; padding:10px; border-radius:12px; }
  .gmk-c{ position:relative; aspect-ratio:1; border:1px solid rgba(178,102,255,.25); cursor:pointer; }
  .gmk-c .st{ position:absolute; inset:12%; border-radius:50%; }
  .gmk-c .st.p0{ background:radial-gradient(circle at 35% 30%, #aef9ff, var(--p1)); box-shadow:0 0 7px var(--p1); }
  .gmk-c .st.p1{ background:radial-gradient(circle at 35% 30%, #ffb4dc, var(--p2)); box-shadow:0 0 7px var(--p2); }
  .gmk-c.win{ background:rgba(255,255,255,.18); }

  .mc{ display:flex; align-items:stretch; gap:8px; }
  .mc-store{ width:54px; border-radius:18px; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:4px; background:var(--panel-2); border:1px solid var(--line); font-family:var(--font-num);
    font-weight:900; font-size:22px; }
  .mc-store.p0{ color:var(--p1); border-color:var(--p1); } .mc-store.p1{ color:var(--p2); border-color:var(--p2); }
  .mc-mid{ flex:1; display:flex; flex-direction:column; gap:8px; }
  .mc-row{ display:grid; grid-template-columns:repeat(6,1fr); gap:8px; }
  .mc-pit{ aspect-ratio:1; border-radius:50%; background:var(--bg-2); border:1px solid var(--line);
    display:grid; place-items:center; font-family:var(--font-num); font-weight:900; font-size:18px; transition:transform .1s; }
  .mc-pit.mine{ cursor:pointer; }
  .mc-pit.mine.p0{ border-color:var(--p1); } .mc-pit.mine.p1{ border-color:var(--p2); }
  .mc-pit.mine:hover{ box-shadow:0 0 12px var(--violet); }
  .mc-pit.pulse{ transform:scale(1.18); }
  .mc-row.top{ direction:rtl; }

  .nim{ display:flex; flex-direction:column; gap:14px; align-items:center; }
  .nim-row{ display:flex; gap:8px; flex-wrap:wrap; justify-content:center; }
  .nim-tok{ font-size:30px; cursor:pointer; transition:transform .12s, opacity .2s; filter:drop-shadow(0 0 6px var(--gold)); }
  .nim-tok:hover{ transform:scale(1.2) translateY(-3px); }
  .nim-tok.staged{ opacity:.25; transform:scale(.7); }
  .nim-tok.gone{ display:none; }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  /* ---------- 1. TIC-TAC-TOE ---------- */
  Games.register({
    id: 'tic-tac-toe', name: 'Tic-Tac-Toe', emoji: '⭕', category: 'Strategy', accent: '#00f0ff',
    tagline: 'Three in a row wins.',
    mount(root, ctx) {
      const tb = ctx.turnbar({ score: false }); tb.set(0);
      let turn = 0, b = Array(9).fill(null), done = false;
      const cells = [];
      const grid = ctx.h('div', { class: 'ttt' });
      for (let i = 0; i < 9; i++) { const c = ctx.h('button', { class: 'ttt-cell', onclick: () => play(i) }); cells.push(c); grid.append(c); }
      root.append(ctx.h('div', { class: 'board-frame' }, grid));
      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      ctx.msg(`${ctx.players[0].name} is ✕ — go!`, ctx.players[0].color);
      function play(i) {
        if (done || b[i] != null) return;
        b[i] = turn; cells[i].textContent = turn === 0 ? '✕' : '◯';
        cells[i].style.color = ctx.players[turn].color; ctx.sound.place();
        const w = lines.find(l => l.every(k => b[k] === turn));
        if (w) { done = true; w.forEach(k => cells[k].classList.add('win')); return ctx.win(turn); }
        if (b.every(x => x != null)) { done = true; return ctx.draw(); }
        turn = 1 - turn; tb.set(turn);
        ctx.msg(`${ctx.players[turn].name}'s turn (${turn === 0 ? '✕' : '◯'})`, ctx.players[turn].color);
      }
    },
  });

  /* ---------- 2. CONNECT FOUR ---------- */
  Games.register({
    id: 'connect-four', name: 'Connect Four', emoji: '🔴', category: 'Strategy', accent: '#ff2fa6',
    tagline: 'Drop & line up four.',
    mount(root, ctx) {
      const R = 6, C = 7; const tb = ctx.turnbar({ score: false }); tb.set(0);
      let turn = 0, done = false; const b = Array.from({ length: R }, () => Array(C).fill(null));
      const cellEl = Array.from({ length: R }, () => Array(C));
      const grid = ctx.h('div', { class: 'c4' });
      for (let c = 0; c < C; c++) {
        const col = ctx.h('div', { class: 'c4-col', onclick: () => drop(c) });
        for (let r = 0; r < R; r++) { const cell = ctx.h('div', { class: 'c4-cell' }); cellEl[r][c] = cell; col.append(cell); }
        grid.append(col);
      }
      root.append(grid);
      ctx.msg(`${ctx.players[0].name}, drop a disc!`, ctx.players[0].color);
      function drop(c) {
        if (done) return;
        let r = -1; for (let i = R - 1; i >= 0; i--) if (b[i][c] == null) { r = i; break; }
        if (r < 0) return; b[r][c] = turn;
        cellEl[r][c].classList.add('p' + turn); ctx.sound.place();
        const win = check(r, c, turn);
        if (win) { done = true; win.forEach(([wr, wc]) => cellEl[wr][wc].classList.add('win')); return ctx.win(turn); }
        if (b.every(row => row.every(x => x != null))) { done = true; return ctx.draw(); }
        turn = 1 - turn; tb.set(turn);
        ctx.msg(`${ctx.players[turn].name}'s drop`, ctx.players[turn].color);
      }
      function check(r, c, p) {
        const dirs = [[0,1],[1,0],[1,1],[1,-1]];
        for (const [dr, dc] of dirs) {
          const line = [[r, c]];
          for (const s of [1, -1]) {
            let nr = r + dr * s, nc = c + dc * s;
            while (nr >= 0 && nr < R && nc >= 0 && nc < C && b[nr][nc] === p) { line.push([nr, nc]); nr += dr * s; nc += dc * s; }
          }
          if (line.length >= 4) return line;
        }
        return null;
      }
    },
  });

  /* ---------- 3. DOTS & BOXES ---------- */
  Games.register({
    id: 'dots-boxes', name: 'Dots & Boxes', emoji: '🔲', category: 'Strategy', accent: '#b6ff3a',
    tagline: 'Close boxes, claim them.',
    mount(root, ctx) {
      const N = 4; const G = 2 * N + 1;
      const tb = ctx.turnbar(); tb.set(0); tb.score(0, 0);
      let turn = 0, done = false, scores = [0, 0];
      const edges = {}, boxes = {};
      const grid = ctx.h('div', { class: 'db' });
      const colSize = []; for (let c = 0; c < G; c++) colSize.push(c % 2 === 0 ? '13px' : 'minmax(26px, 1fr)');
      grid.style.gridTemplateColumns = colSize.join(' ');
      grid.style.gridTemplateRows = colSize.join(' ');
      grid.style.maxWidth = '420px';
      for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
        if (r % 2 === 0 && c % 2 === 0) grid.append(ctx.h('div', { class: 'dot' }));
        else if (r % 2 === 1 && c % 2 === 1) { const bx = ctx.h('div', { class: 'box' }); boxes[r + ',' + c] = bx; grid.append(bx); }
        else { const key = r + ',' + c; const e = ctx.h('button', { class: 'edge ' + (r % 2 === 0 ? 'h' : 'v'), onclick: () => claim(key, r, c) }); edges[key] = { el: e, on: false }; grid.append(e); }
      }
      root.append(ctx.h('div', { class: 'board-frame' }, grid));
      ctx.msg(`${ctx.players[0].name}, draw a line`, ctx.players[0].color);
      function claim(key, r, c) {
        if (done || edges[key].on) return;
        edges[key].on = true; edges[key].el.classList.add('on', 'p' + turn); ctx.sound.move();
        let made = 0;
        const adj = r % 2 === 0 ? [[r - 1, c], [r + 1, c]] : [[r, c - 1], [r, c + 1]];
        for (const [br, bc] of adj) {
          if (br <= 0 || br >= G || bc <= 0 || bc >= G) continue;
          const bk = br + ',' + bc; if (boxes[bk] && !boxes[bk].dataset.owner) {
            const e4 = [[br - 1, bc], [br + 1, bc], [br, bc - 1], [br, bc + 1]].map(([a, b]) => edges[a + ',' + b]);
            if (e4.every(e => e && e.on)) {
              boxes[bk].dataset.owner = turn; boxes[bk].classList.add('p' + turn);
              boxes[bk].textContent = ctx.players[turn].emoji; scores[turn]++; made++;
            }
          }
        }
        tb.score(scores[0], scores[1]);
        const totalBoxes = N * N;
        if (scores[0] + scores[1] === totalBoxes) {
          done = true; ctx.sound.good();
          return scores[0] === scores[1] ? ctx.draw() : ctx.win(scores[0] > scores[1] ? 0 : 1, `${scores[0]}–${scores[1]} boxes`);
        }
        if (made) { ctx.sound.good(); ctx.msg(`${ctx.players[turn].name} scored! Go again 🎁`, ctx.players[turn].color); return; }
        turn = 1 - turn; tb.set(turn);
        ctx.msg(`${ctx.players[turn].name}'s line`, ctx.players[turn].color);
      }
    },
  });

  /* ---------- 4. CHECKERS ---------- */
  Games.register({
    id: 'checkers', name: 'Checkers', emoji: '⚪', category: 'Strategy', accent: '#00f0ff',
    tagline: 'Jump, king, conquer.',
    mount(root, ctx) {
      const tb = ctx.turnbar(); tb.set(0); tb.score(12, 12);
      let turn = 0, done = false, sel = null, chain = false;
      const b = Array.from({ length: 8 }, () => Array(8).fill(null));
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) {
        if (r < 3) b[r][c] = { p: 1, k: false }; else if (r > 4) b[r][c] = { p: 0, k: false };
      }
      const grid = ctx.h('div', { class: 'cb' });
      const sq = Array.from({ length: 8 }, () => Array(8));
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const cell = ctx.h('div', { class: 'cb-sq ' + ((r + c) % 2 ? 'dark' : 'light'), onclick: () => onClick(r, c) });
        sq[r][c] = cell; grid.append(cell);
      }
      root.append(ctx.h('div', { class: 'board-frame' }, grid));
      draw(); status();

      function dirsFor(pc) { return pc.k ? [[1,1],[1,-1],[-1,1],[-1,-1]] : (pc.p === 0 ? [[-1,1],[-1,-1]] : [[1,1],[1,-1]]); }
      function inB(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
      function capturesFor(r, c) {
        const pc = b[r][c]; if (!pc) return [];
        const caps = []; const ds = pc.k ? [[1,1],[1,-1],[-1,1],[-1,-1]] : dirsFor(pc);
        for (const [dr, dc] of ds) {
          const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
          if (inB(lr, lc) && b[mr] && b[mr][mc] && b[mr][mc].p !== pc.p && !b[lr][lc]) caps.push({ r: lr, c: lc, cap: [mr, mc] });
        }
        return caps;
      }
      function simpleMoves(r, c) {
        const pc = b[r][c]; if (!pc) return [];
        return dirsFor(pc).map(([dr, dc]) => ({ r: r + dr, c: c + dc })).filter(m => inB(m.r, m.c) && !b[m.r][m.c]);
      }
      function allCaptures(p) {
        const out = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c] && b[r][c].p === p && capturesFor(r, c).length) out.push([r, c]);
        return out;
      }
      function legalFrom(r, c) {
        const mustCap = allCaptures(turn).length > 0;
        if (chain) return r === sel.r && c === sel.c ? capturesFor(r, c) : [];
        return mustCap ? capturesFor(r, c) : simpleMoves(r, c);
      }
      function onClick(r, c) {
        if (done) return;
        if (sel && sq[r][c].classList.contains('move')) return move(r, c);
        if (b[r][c] && b[r][c].p === turn && !chain) {
          if (!legalFrom(r, c).length) { ctx.sound.bad(); flashForced(); return; }
          sel = { r, c }; highlight(); ctx.sound.tap();
        }
      }
      function move(r, c) {
        const moves = legalFrom(sel.r, sel.c); const m = moves.find(x => x.r === r && x.c === c); if (!m) return;
        const pc = b[sel.r][sel.c]; b[r][c] = pc; b[sel.r][sel.c] = null; ctx.sound.move();
        let captured = false;
        if (m.cap) { b[m.cap[0]][m.cap[1]] = null; captured = true; ctx.sound.good(); }
        let promoted = false;
        if (!pc.k && ((pc.p === 0 && r === 0) || (pc.p === 1 && r === 7))) { pc.k = true; promoted = true; }
        sel = { r, c };
        if (captured && !promoted && capturesFor(r, c).length) { chain = true; draw(); highlight(); ctx.msg('Chain jump! Keep going 🔗', ctx.players[turn].color); return; }
        chain = false; sel = null; draw(); updateScore();
        const opp = 1 - turn;
        if (!hasPieces(opp)) { done = true; return ctx.win(turn, 'All pieces captured!'); }
        turn = opp; tb.set(turn);
        if (!hasMoves(turn)) { done = true; return ctx.win(1 - turn, 'No moves left for opponent!'); }
        status();
      }
      function hasPieces(p) { return b.flat().some(x => x && x.p === p); }
      function hasMoves(p) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c] && b[r][c].p === p) { if (capturesFor(r, c).length || simpleMoves(r, c).length) return true; } return false; }
      function updateScore() { tb.score(b.flat().filter(x => x && x.p === 0).length, b.flat().filter(x => x && x.p === 1).length); }
      function highlight() {
        clearHi(); if (!sel) return; sq[sel.r][sel.c].classList.add('sel');
        legalFrom(sel.r, sel.c).forEach(m => sq[m.r][m.c].classList.add('move'));
      }
      function clearHi() { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) sq[r][c].classList.remove('sel', 'move'); }
      function draw() {
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const cell = sq[r][c]; cell.querySelector('.cb-pc')?.remove();
          const pc = b[r][c]; if (pc) cell.append(ctx.h('div', { class: 'cb-pc p' + pc.p + (pc.k ? ' king' : '') }));
        }
        clearHi();
      }
      function status() { const mc = allCaptures(turn).length; ctx.msg(`${ctx.players[turn].name}'s move${mc ? ' — capture available!' : ''}`, ctx.players[turn].color); }
      function flashForced() { ctx.msg('You must take the capture!', 'var(--gold)'); }
    },
  });

  /* ---------- 5. REVERSI / OTHELLO ---------- */
  Games.register({
    id: 'reversi', name: 'Reversi', emoji: '🟢', category: 'Strategy', accent: '#b6ff3a',
    tagline: 'Flip & flank to own the board.',
    mount(root, ctx) {
      const tb = ctx.turnbar(); tb.set(0); let turn = 0, done = false;
      const b = Array.from({ length: 8 }, () => Array(8).fill(null));
      b[3][3] = 1; b[3][4] = 0; b[4][3] = 0; b[4][4] = 1;
      const grid = ctx.h('div', { class: 'rv' }); const sq = Array.from({ length: 8 }, () => Array(8));
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const cell = ctx.h('div', { class: 'rv-sq', onclick: () => play(r, c) }); sq[r][c] = cell; grid.append(cell); }
      root.append(ctx.h('div', { class: 'board-frame' }, grid));
      const DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      draw();
      function flips(r, c, p) {
        if (b[r][c] != null) return [];
        const out = [];
        for (const [dr, dc] of DIRS) {
          let nr = r + dr, nc = c + dc; const line = [];
          while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === 1 - p) { line.push([nr, nc]); nr += dr; nc += dc; }
          if (line.length && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === p) out.push(...line);
        }
        return out;
      }
      function validMoves(p) { const m = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (flips(r, c, p).length) m.push([r, c]); return m; }
      function play(r, c) {
        if (done) return; const fl = flips(r, c, turn); if (!fl.length) { ctx.sound.bad(); return; }
        b[r][c] = turn; fl.forEach(([fr, fc]) => b[fr][fc] = turn); ctx.sound.place();
        next();
      }
      function next() {
        draw();
        const opp = 1 - turn;
        if (validMoves(opp).length) { turn = opp; tb.set(turn); draw(); status(); }
        else if (validMoves(turn).length) { status(' — opponent passed!'); }
        else return end();
      }
      function end() {
        done = true; const c0 = count(0), c1 = count(1);
        if (c0 === c1) ctx.draw(`${c0}–${c1}`); else ctx.win(c0 > c1 ? 0 : 1, `${c0}–${c1} discs`);
      }
      function count(p) { return b.flat().filter(x => x === p).length; }
      function draw() {
        const vm = done ? [] : validMoves(turn).map(m => m.join(','));
        for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
          const cell = sq[r][c]; cell.innerHTML = ''; cell.classList.toggle('valid', vm.includes(r + ',' + c));
          if (b[r][c] != null) cell.append(ctx.h('div', { class: 'rv-d p' + b[r][c] }));
        }
        tb.score(count(0), count(1));
      }
      function status(extra = '') { ctx.msg(`${ctx.players[turn].name}'s turn${extra}`, ctx.players[turn].color); }
    },
  });

  /* ---------- 6. GOMOKU ---------- */
  Games.register({
    id: 'gomoku', name: 'Gomoku', emoji: '⚫', category: 'Strategy', accent: '#b266ff',
    tagline: 'Five stones in a row.',
    mount(root, ctx) {
      const N = 13; const tb = ctx.turnbar({ score: false }); tb.set(0);
      let turn = 0, done = false; const b = Array.from({ length: N }, () => Array(N).fill(null));
      const grid = ctx.h('div', { class: 'gmk' }); grid.style.gridTemplateColumns = `repeat(${N},1fr)`; grid.style.maxWidth = '460px';
      const cellEl = Array.from({ length: N }, () => Array(N));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const cell = ctx.h('div', { class: 'gmk-c', onclick: () => play(r, c) }); cellEl[r][c] = cell; grid.append(cell); }
      root.append(ctx.h('div', { class: 'board-frame' }, grid));
      ctx.msg(`${ctx.players[0].name}, place a stone`, ctx.players[0].color);
      function play(r, c) {
        if (done || b[r][c] != null) return; b[r][c] = turn;
        cellEl[r][c].append(ctx.h('div', { class: 'st p' + turn })); ctx.sound.place();
        const win = check(r, c, turn);
        if (win) { done = true; win.forEach(([wr, wc]) => cellEl[wr][wc].classList.add('win')); return ctx.win(turn); }
        if (b.every(row => row.every(x => x != null))) { done = true; return ctx.draw(); }
        turn = 1 - turn; tb.set(turn); ctx.msg(`${ctx.players[turn].name}'s stone`, ctx.players[turn].color);
      }
      function check(r, c, p) {
        for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
          const line = [[r, c]];
          for (const s of [1, -1]) { let nr = r + dr * s, nc = c + dc * s; while (nr >= 0 && nr < N && nc >= 0 && nc < N && b[nr][nc] === p) { line.push([nr, nc]); nr += dr * s; nc += dc * s; } }
          if (line.length >= 5) return line;
        }
        return null;
      }
    },
  });

  /* ---------- 7. MANCALA ---------- */
  Games.register({
    id: 'mancala', name: 'Mancala', emoji: '🫘', category: 'Strategy', accent: '#ffd23a',
    tagline: 'Sow seeds, fill your store.',
    mount(root, ctx) {
      // pits: index 0-5 = p1 (bottom), 6 = p1 store, 7-12 = p2 (top), 13 = p2 store
      const tb = ctx.turnbar(); tb.set(0);
      let turn = 0, done = false;
      const pits = [4,4,4,4,4,4, 0, 4,4,4,4,4,4, 0];
      const STORE = [6, 13];
      const wrap = ctx.h('div', { class: 'board-frame' });
      const store2 = ctx.h('div', { class: 'mc-store p1' });
      const store1 = ctx.h('div', { class: 'mc-store p0' });
      const rowTop = ctx.h('div', { class: 'mc-row top' });
      const rowBot = ctx.h('div', { class: 'mc-row' });
      const pitEl = [];
      for (let i = 0; i < 14; i++) pitEl[i] = null;
      // top row shows p2 pits 12..7 (left to right visually) — use rtl + order 7..12
      for (let i = 7; i <= 12; i++) { const p = ctx.h('div', { class: 'mc-pit', onclick: () => sow(i) }); pitEl[i] = p; rowTop.append(p); }
      for (let i = 0; i <= 5; i++) { const p = ctx.h('div', { class: 'mc-pit', onclick: () => sow(i) }); pitEl[i] = p; rowBot.append(p); }
      const mid = ctx.h('div', { class: 'mc-mid' }, rowTop, rowBot);
      wrap.append(ctx.h('div', { class: 'mc' }, store2, mid, store1));
      root.append(wrap);
      paint();

      function mine(i) { return turn === 0 ? (i >= 0 && i <= 5) : (i >= 7 && i <= 12); }
      function sow(i) {
        if (done || !mine(i) || pits[i] === 0) { if (!done) ctx.sound.bad(); return; }
        let seeds = pits[i]; pits[i] = 0; let idx = i;
        const myStore = STORE[turn], oppStore = STORE[1 - turn];
        ctx.sound.place();
        while (seeds > 0) { idx = (idx + 1) % 14; if (idx === oppStore) continue; pits[idx]++; seeds--; }
        // capture
        const inMyRow = turn === 0 ? (idx >= 0 && idx <= 5) : (idx >= 7 && idx <= 12);
        if (inMyRow && pits[idx] === 1) {
          const opp = 12 - idx; if (pits[opp] > 0) { pits[myStore] += pits[opp] + 1; pits[idx] = 0; pits[opp] = 0; ctx.sound.good(); }
        }
        paint();
        if (checkEnd()) return;
        if (idx === myStore) { ctx.msg(`${ctx.players[turn].name} lands in store — go again! 🎁`, ctx.players[turn].color); return; }
        turn = 1 - turn; tb.set(turn); status();
      }
      function checkEnd() {
        const e0 = pits.slice(0, 6).every(x => x === 0), e1 = pits.slice(7, 13).every(x => x === 0);
        if (!e0 && !e1) return false;
        for (let i = 0; i <= 5; i++) { pits[6] += pits[i]; pits[i] = 0; }
        for (let i = 7; i <= 12; i++) { pits[13] += pits[i]; pits[i] = 0; }
        paint(); done = true;
        return pits[6] === pits[13] ? ctx.draw(`${pits[6]}–${pits[13]}`) || true : ctx.win(pits[6] > pits[13] ? 0 : 1, `${pits[6]}–${pits[13]} seeds`) || true;
      }
      function paint() {
        for (let i = 0; i < 14; i++) {
          if (i === 6 || i === 13) continue;
          pitEl[i].textContent = pits[i];
          pitEl[i].className = 'mc-pit' + (mine(i) ? ' mine p' + turn : '');
        }
        store1.textContent = pits[6]; store2.textContent = pits[13];
        store1.append(ctx.h('small', { style: 'font-size:9px;color:var(--ink-faint)' }, ''));
        tb.score(pits[6], pits[13]);
      }
      function status() { ctx.msg(`${ctx.players[turn].name}, pick a pit`, ctx.players[turn].color); }
      status();
    },
  });

  /* ---------- 8. NIM ---------- */
  Games.register({
    id: 'nim', name: 'Nim', emoji: '✨', category: 'Strategy', accent: '#ffd23a',
    tagline: 'Take the last star to win.',
    mount(root, ctx) {
      const tb = ctx.turnbar({ score: false }); tb.set(0);
      let turn = 0, done = false, stagedRow = -1, staged = 0;
      let rows = [1, 3, 5, 7];
      const wrap = ctx.h('div', { class: 'board-frame' });
      const board = ctx.h('div', { class: 'nim' });
      wrap.append(board);
      const endBtn = ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: endTurn }, 'End turn ✓');
      root.append(wrap, endBtn);
      paint();
      ctx.msg(`${ctx.players[0].name}: tap stars from ONE row`, ctx.players[0].color);
      function paint() {
        board.innerHTML = '';
        rows.forEach((n, ri) => {
          const row = ctx.h('div', { class: 'nim-row' });
          for (let i = 0; i < n; i++) {
            const isStaged = ri === stagedRow && i >= n - staged;
            row.append(ctx.h('div', { class: 'nim-tok' + (isStaged ? ' staged' : ''), onclick: () => tap(ri) }, '⭐'));
          }
          board.append(row);
        });
      }
      function tap(ri) {
        if (done) return;
        if (stagedRow !== -1 && stagedRow !== ri) { ctx.sound.bad(); ctx.msg('Take from only ONE row per turn!', 'var(--gold)'); return; }
        if (staged >= rows[ri]) return;
        stagedRow = ri; staged++; ctx.sound.tap(); paint();
        ctx.msg(`Taking ${staged} from row ${ri + 1}. Tap “End turn” when ready.`, ctx.players[turn].color);
      }
      function endTurn() {
        if (done) return;
        if (staged === 0) { ctx.sound.bad(); ctx.msg('Take at least one star first!', 'var(--gold)'); return; }
        rows[stagedRow] -= staged; staged = 0; stagedRow = -1; ctx.sound.move();
        if (rows.every(n => n === 0)) { done = true; return ctx.win(turn, 'Took the last star! ⭐'); }
        turn = 1 - turn; tb.set(turn); paint();
        ctx.msg(`${ctx.players[turn].name}: tap stars from ONE row`, ctx.players[turn].color);
      }
    },
  });

})();
