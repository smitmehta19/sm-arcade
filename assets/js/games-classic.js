/* ============================================================
   GAMES — Strategy classics (8), online turn-based
   Interface: init(hostSeat) -> state (incl. .turn);  render(ctx)
   ctx: {root,h,esc,clone,players,state,me,turn,isMyTurn,status,sound,turnBar,msg,commit,seat}
   ============================================================ */
(function () {
  const css = `
  .ttt{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; aspect-ratio:1; }
  .ttt-cell{ display:grid; place-items:center; font-size:13vw; font-weight:900; background:var(--bg-2);
    border:1px solid var(--line); border-radius:14px; color:var(--ink); aspect-ratio:1; }
  @media(min-width:520px){ .ttt-cell{ font-size:60px; } }
  .ttt-cell.live{ cursor:pointer; } .ttt-cell.live:active{ transform:scale(.94); }
  .ttt-cell.win{ box-shadow:0 0 22px var(--violet); border-color:var(--violet); }

  .c4{ display:grid; grid-template-columns:repeat(7,1fr); gap:6px; background:rgba(120,70,220,.12); padding:8px; border-radius:14px; }
  .c4-cell{ aspect-ratio:1; border-radius:50%; background:var(--bg); border:1px solid var(--line); }
  .c4-cell.p0{ background:var(--p1); box-shadow:0 0 14px var(--p1); } .c4-cell.p1{ background:var(--p2); box-shadow:0 0 14px var(--p2); }
  .c4-col{ display:flex; flex-direction:column; gap:6px; } .c4-col.live{ cursor:pointer; }
  .c4-col.live:hover .c4-cell:first-child{ box-shadow:inset 0 0 0 2px var(--violet); }

  .db{ display:grid; gap:0; margin:0 auto; max-width:420px; }
  .db .dot{ width:13px; height:13px; border-radius:50%; background:var(--violet); box-shadow:0 0 8px var(--violet); }
  .db .edge{ background:transparent; border:none; border-radius:6px; align-self:stretch; justify-self:stretch; }
  .db .edge.h{ min-height:13px; } .db .edge.v{ min-width:13px; }
  .db .edge.live:not(.on):hover{ background:rgba(178,102,255,.3); }
  .db .edge.on.p0{ background:var(--p1); box-shadow:0 0 8px var(--p1); } .db .edge.on.p1{ background:var(--p2); box-shadow:0 0 8px var(--p2); }
  .db .box{ display:grid; place-items:center; font-weight:900; font-size:18px; }
  .db .box.p0{ background:var(--p1-soft); } .db .box.p1{ background:var(--p2-soft); }

  .cb{ display:grid; grid-template-columns:repeat(8,1fr); grid-template-rows:repeat(8,1fr); aspect-ratio:1; border-radius:12px; overflow:hidden; border:2px solid var(--line); }
  .cb-sq{ position:relative; display:grid; place-items:center; } .cb-sq.dark{ background:rgba(120,70,220,.16); } .cb-sq.light{ background:rgba(255,255,255,.04); }
  .cb-sq.sel{ box-shadow:inset 0 0 0 3px var(--gold); } .cb-sq.move::after{ content:''; width:30%; height:30%; border-radius:50%; background:rgba(182,255,58,.6); }
  .cb-pc{ width:74%; height:74%; border-radius:50%; display:grid; place-items:center; font-size:14px; }
  .cb-pc.p0{ background:radial-gradient(circle at 35% 30%, #6ffcff, var(--p1)); box-shadow:0 0 10px var(--p1); }
  .cb-pc.p1{ background:radial-gradient(circle at 35% 30%, #ff9ccd, var(--p2)); box-shadow:0 0 10px var(--p2); }
  .cb-pc.king::after{ content:'♛'; color:#07040f; font-size:15px; }

  .rv{ display:grid; grid-template-columns:repeat(8,1fr); grid-template-rows:repeat(8,1fr); aspect-ratio:1; gap:3px; background:rgba(20,80,40,.35); padding:6px; border-radius:12px; }
  .rv-sq{ position:relative; background:rgba(0,0,0,.25); border-radius:6px; display:grid; place-items:center; }
  .rv-sq.valid{ cursor:pointer; } .rv-sq.valid::after{ content:''; width:26%; height:26%; border-radius:50%; background:rgba(255,255,255,.25); }
  .rv-d{ width:78%; height:78%; border-radius:50%; }
  .rv-d.p0{ background:radial-gradient(circle at 35% 30%, #aef9ff, var(--p1)); box-shadow:0 0 8px var(--p1); } .rv-d.p1{ background:radial-gradient(circle at 35% 30%, #ffb4dc, var(--p2)); box-shadow:0 0 8px var(--p2); }

  .gmk{ display:grid; gap:0; background:#1a0f33; padding:10px; border-radius:12px; max-width:460px; }
  .gmk-c{ position:relative; aspect-ratio:1; border:1px solid rgba(178,102,255,.25); } .gmk-c.live{ cursor:pointer; }
  .gmk-c .st{ position:absolute; inset:12%; border-radius:50%; }
  .gmk-c .st.p0{ background:radial-gradient(circle at 35% 30%, #aef9ff, var(--p1)); box-shadow:0 0 7px var(--p1); } .gmk-c .st.p1{ background:radial-gradient(circle at 35% 30%, #ffb4dc, var(--p2)); box-shadow:0 0 7px var(--p2); }

  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const waiting = ctx => ctx.msg(`⏳ Waiting for ${ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');
  const myMark = i => i === 0 ? '✕' : '◯';
  // find a winning run of `need` on a grid board → {r1,c1,r2,c2,p} for the win-line sweep
  function findRun(g, R, C, need) {
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const p = g[r][c]; if (p == null) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const pr = r - dr, pc = c - dc;
        if (pr >= 0 && pr < R && pc >= 0 && pc < C && g[pr][pc] === p) continue; // not the run's start
        let n = 1, nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < R && nc >= 0 && nc < C && g[nr][nc] === p) { n++; nr += dr; nc += dc; }
        if (n >= need) return { r1: r, c1: c, r2: r + dr * (n - 1), c2: c + dc * (n - 1), p };
      }
    }
    return null;
  }

  /* ---------- 1. TIC-TAC-TOE ---------- */
  Games.register({
    id: 'tic-tac-toe', name: 'Tic-Tac-Toe', emoji: '⭕', category: 'Strategy', accent: '#00f0ff',
    tagline: 'Three in a row wins.',
    init: host => ({ board: Array(9).fill(null), turn: host }),
    render(ctx) {
      const b = ctx.state.board;
      ctx.root.append(ctx.turnBar());
      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      const winLine = lines.find(l => b[l[0]] != null && l.every(k => b[k] === b[l[0]]));
      const grid = ctx.h('div', { class: 'ttt' }); const cells = [];
      b.forEach((v, i) => {
        const cell = ctx.h('div', { class: 'ttt-cell' + (ctx.isMyTurn && v == null ? ' live' : '') + (winLine && winLine.includes(i) ? ' win' : '') });
        if (v != null) { cell.textContent = myMark(v); cell.style.color = ctx.players[v].color; }
        if (ctx.isMyTurn && v == null) cell.onclick = () => {
          const s = ctx.clone(ctx.state); s.board[i] = ctx.me; ctx.sound.place();
          const win = lines.find(l => l.every(k => s.board[k] === ctx.me));
          if (win) return ctx.commit(s, ctx.me);
          if (s.board.every(x => x != null)) return ctx.commit(s, 'draw');
          s.turn = 1 - ctx.me; ctx.commit(s);
        };
        cells.push(cell); grid.append(cell);
      });
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid));
      if (winLine) fxWinLine(grid, cells[winLine[0]], cells[winLine[2]], ctx.players[b[winLine[0]]].color);
      ctx.isMyTurn ? ctx.msg(`Your turn — you’re ${myMark(ctx.me)}`, ctx.players[ctx.me].color) : waiting(ctx);
    },
  });

  /* ---------- 2. CONNECT FOUR ---------- */
  Games.register({
    id: 'connect-four', name: 'Connect Four', emoji: '🔴', category: 'Strategy', accent: '#ff2fa6',
    tagline: 'Drop & line up four.',
    init: host => ({ board: Array.from({ length: 6 }, () => Array(7).fill(null)), turn: host }),
    render(ctx) {
      const R = 6, C = 7, b = ctx.state.board;
      ctx.root.append(ctx.turnBar());
      const grid = ctx.h('div', { class: 'c4' });
      for (let c = 0; c < C; c++) {
        const col = ctx.h('div', { class: 'c4-col' + (ctx.isMyTurn ? ' live' : '') });
        for (let r = 0; r < R; r++) { const cell = ctx.h('div', { class: 'c4-cell' + (b[r][c] != null ? ' p' + b[r][c] : '') }); col.append(cell); }
        if (ctx.isMyTurn) col.onclick = () => drop(c);
        grid.append(col);
      }
      ctx.root.append(grid);
      // sweep the winning four when the game is over
      const wl = findRun(b, R, C, 4);
      if (wl) fxWinLine(grid, grid.children[wl.c1].children[wl.r1], grid.children[wl.c2].children[wl.r2], ctx.players[wl.p].color);
      ctx.isMyTurn ? ctx.msg('Your turn — drop a disc', ctx.players[ctx.me].color) : waiting(ctx);
      function drop(c) {
        let r = -1; for (let i = R - 1; i >= 0; i--) if (b[i][c] == null) { r = i; break; }
        if (r < 0) return;
        const s = ctx.clone(ctx.state); s.board[r][c] = ctx.me; ctx.sound.place();
        if (win(s.board, r, c, ctx.me)) return ctx.commit(s, ctx.me);
        if (s.board.every(row => row.every(x => x != null))) return ctx.commit(s, 'draw');
        s.turn = 1 - ctx.me; ctx.commit(s);
      }
      function win(g, r, c, p) {
        for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
          let n = 1;
          for (const s of [1, -1]) { let nr = r + dr * s, nc = c + dc * s; while (nr >= 0 && nr < R && nc >= 0 && nc < C && g[nr][nc] === p) { n++; nr += dr * s; nc += dc * s; } }
          if (n >= 4) return true;
        }
        return false;
      }
    },
  });

  /* ---------- 3. DOTS & BOXES ---------- */
  Games.register({
    id: 'dots-boxes', name: 'Dots & Boxes', emoji: '🔲', category: 'Strategy', accent: '#b6ff3a',
    tagline: 'Close boxes, claim them.',
    init: host => ({ edges: {}, boxes: {}, scores: [0, 0], turn: host }),
    render(ctx) {
      const N = 4, G = 2 * N + 1, st = ctx.state;
      ctx.root.append(ctx.turnBar({ scores: st.scores }));
      const grid = ctx.h('div', { class: 'db' });
      const colSize = []; for (let c = 0; c < G; c++) colSize.push(c % 2 === 0 ? '13px' : 'minmax(26px,1fr)');
      grid.style.gridTemplateColumns = colSize.join(' '); grid.style.gridTemplateRows = colSize.join(' ');
      for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
        const key = r + ',' + c;
        if (r % 2 === 0 && c % 2 === 0) grid.append(ctx.h('div', { class: 'dot' }));
        else if (r % 2 === 1 && c % 2 === 1) { const o = st.boxes[key]; const bx = ctx.h('div', { class: 'box' + (o != null ? ' p' + o : '') }, o != null ? ctx.players[o].emoji : ''); grid.append(bx); }
        else {
          const on = st.edges[key] != null;
          const e = ctx.h('button', { class: 'edge ' + (r % 2 === 0 ? 'h' : 'v') + (on ? ' on p' + st.edges[key] : '') + (ctx.isMyTurn && !on ? ' live' : '') });
          if (ctx.isMyTurn && !on) e.onclick = () => claim(r, c, key);
          grid.append(e);
        }
      }
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid));
      ctx.isMyTurn ? ctx.msg('Your turn — draw a line', ctx.players[ctx.me].color) : waiting(ctx);
      function claim(r, c, key) {
        const s = ctx.clone(ctx.state); s.edges[key] = ctx.me; ctx.sound.move();
        let made = 0;
        const adj = r % 2 === 0 ? [[r - 1, c], [r + 1, c]] : [[r, c - 1], [r, c + 1]];
        for (const [br, bc] of adj) {
          if (br <= 0 || br >= G || bc <= 0 || bc >= G) continue;
          const bk = br + ',' + bc; if (s.boxes[bk] != null) continue;
          const e4 = [[br - 1, bc], [br + 1, bc], [br, bc - 1], [br, bc + 1]].map(([a, b]) => s.edges[a + ',' + b] != null);
          if (e4.every(Boolean)) { s.boxes[bk] = ctx.me; s.scores[ctx.me]++; made++; }
        }
        const totalBoxes = N * N, claimed = s.scores[0] + s.scores[1];
        if (claimed === totalBoxes) { ctx.sound.good(); return ctx.commit(s, s.scores[0] === s.scores[1] ? 'draw' : (s.scores[0] > s.scores[1] ? 0 : 1)); }
        if (made) { ctx.sound.good(); return ctx.commit(s); } // extra turn, turn unchanged
        s.turn = 1 - ctx.me; ctx.commit(s);
      }
    },
  });

  /* ---------- 4. CHECKERS ---------- */
  Games.register({
    id: 'checkers', name: 'Checkers', emoji: '⚪', category: 'Strategy', accent: '#00f0ff',
    tagline: 'Jump, king, conquer.',
    init: host => {
      const b = Array.from({ length: 8 }, () => Array(8).fill(null));
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) { if (r < 3) b[r][c] = { p: 1, k: false }; else if (r > 4) b[r][c] = { p: 0, k: false }; }
      return { board: b, turn: host, chain: null };
    },
    render(ctx) {
      const b = ctx.state.board, me = ctx.me; let sel = null;
      ctx.root.append(ctx.turnBar({ scores: [count(0), count(1)] }));
      const grid = ctx.h('div', { class: 'cb' }); const sq = Array.from({ length: 8 }, () => Array(8));
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const cell = ctx.h('div', { class: 'cb-sq ' + ((r + c) % 2 ? 'dark' : 'light') });
        const pc = b[r][c]; if (pc) cell.append(ctx.h('div', { class: 'cb-pc p' + pc.p + (pc.k ? ' king' : '') }));
        if (ctx.isMyTurn) cell.onclick = () => onClick(r, c);
        sq[r][c] = cell; grid.append(cell);
      }
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid));
      if (!ctx.isMyTurn) { waiting(ctx); return; }
      if (ctx.state.chain) { sel = { r: ctx.state.chain[0], c: ctx.state.chain[1] }; highlight(); ctx.msg('Continue your jump! 🔗', ctx.players[me].color); }
      else ctx.msg(allCaptures(me).length ? 'Your turn — a capture is available!' : 'Your turn', ctx.players[me].color);

      function inB(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
      function dirs(pc) { return pc.k ? [[1,1],[1,-1],[-1,1],[-1,-1]] : (pc.p === 0 ? [[-1,1],[-1,-1]] : [[1,1],[1,-1]]); }
      function caps(r, c) { const pc = b[r][c]; if (!pc) return []; const out = []; const ds = pc.k ? [[1,1],[1,-1],[-1,1],[-1,-1]] : dirs(pc); for (const [dr, dc] of ds) { const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc; if (inB(lr, lc) && b[mr] && b[mr][mc] && b[mr][mc].p !== pc.p && !b[lr][lc]) out.push({ r: lr, c: lc, cap: [mr, mc] }); } return out; }
      function steps(r, c) { const pc = b[r][c]; if (!pc) return []; return dirs(pc).map(([dr, dc]) => ({ r: r + dr, c: c + dc })).filter(m => inB(m.r, m.c) && !b[m.r][m.c]); }
      function allCaptures(p) { const o = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b[r][c] && b[r][c].p === p && caps(r, c).length) o.push([r, c]); return o; }
      function legal(r, c) { if (ctx.state.chain) return (r === ctx.state.chain[0] && c === ctx.state.chain[1]) ? caps(r, c) : []; return allCaptures(me).length ? caps(r, c) : steps(r, c); }
      function clearHi() { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) sq[r][c].classList.remove('sel', 'move'); }
      function highlight() { clearHi(); if (!sel) return; sq[sel.r][sel.c].classList.add('sel'); legal(sel.r, sel.c).forEach(m => sq[m.r][m.c].classList.add('move')); }
      function onClick(r, c) {
        if (sel && sq[r][c].classList.contains('move')) return move(r, c);
        if (b[r][c] && b[r][c].p === me && !ctx.state.chain) { if (!legal(r, c).length) { ctx.sound.bad(); return; } sel = { r, c }; highlight(); ctx.sound.tap(); }
      }
      function move(r, c) {
        const m = legal(sel.r, sel.c).find(x => x.r === r && x.c === c); if (!m) return;
        const s = ctx.clone(ctx.state); const pc = s.board[sel.r][sel.c];
        s.board[r][c] = pc; s.board[sel.r][sel.c] = null; ctx.sound.move();
        let captured = false; if (m.cap) { s.board[m.cap[0]][m.cap[1]] = null; captured = true; }
        let promoted = false; if (!pc.k && ((pc.p === 0 && r === 0) || (pc.p === 1 && r === 7))) { pc.k = true; promoted = true; }
        // recompute further captures on the NEW board
        const further = (function () { const sv = b; /* use s.board */ const save = JSON.stringify; return capsOn(s.board, r, c); })();
        if (captured && !promoted && further.length) { s.chain = [r, c]; ctx.sound.good(); return ctx.commit(s); } // same turn, continue
        s.chain = null;
        const opp = 1 - me;
        if (!s.board.flat().some(x => x && x.p === opp)) return ctx.commit(s, me);
        if (!hasMoves(s.board, opp)) return ctx.commit(s, me);
        s.turn = opp; ctx.commit(s);
      }
      function capsOn(board, r, c) { const pc = board[r][c]; if (!pc) return []; const o = []; const ds = pc.k ? [[1,1],[1,-1],[-1,1],[-1,-1]] : (pc.p === 0 ? [[-1,1],[-1,-1]] : [[1,1],[1,-1]]); for (const [dr, dc] of ds) { const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc; if (lr >= 0 && lr < 8 && lc >= 0 && lc < 8 && board[mr] && board[mr][mc] && board[mr][mc].p !== pc.p && !board[lr][lc]) o.push(1); } return o; }
      function hasMoves(board, p) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const pc = board[r][c]; if (pc && pc.p === p) { if (capsOn(board, r, c).length) return true; const ds = pc.k ? [[1,1],[1,-1],[-1,1],[-1,-1]] : (pc.p === 0 ? [[-1,1],[-1,-1]] : [[1,1],[1,-1]]); for (const [dr, dc] of ds) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && !board[nr][nc]) return true; } } } return false; }
      function count(p) { return b.flat().filter(x => x && x.p === p).length; }
    },
  });

  /* ---------- 5. REVERSI ---------- */
  Games.register({
    id: 'reversi', name: 'Reversi', emoji: '🟢', category: 'Strategy', accent: '#b6ff3a',
    tagline: 'Flip & flank to own the board.',
    init: host => { const b = Array.from({ length: 8 }, () => Array(8).fill(null)); b[3][3] = 1; b[3][4] = 0; b[4][3] = 0; b[4][4] = 1; return { board: b, turn: host }; },
    render(ctx) {
      const b = ctx.state.board, DIRS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
      const flips = (r, c, p) => { if (b[r][c] != null) return []; const out = []; for (const [dr, dc] of DIRS) { let nr = r + dr, nc = c + dc; const line = []; while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === 1 - p) { line.push([nr, nc]); nr += dr; nc += dc; } if (line.length && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && b[nr][nc] === p) out.push(...line); } return out; };
      const valid = p => { const m = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (flips(r, c, p).length) m.push([r, c]); return m; };
      const count = p => b.flat().filter(x => x === p).length;
      ctx.root.append(ctx.turnBar({ scores: [count(0), count(1)] }));
      const vm = ctx.isMyTurn ? valid(ctx.me).map(m => m.join(',')) : [];
      const grid = ctx.h('div', { class: 'rv' });
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const isV = vm.includes(r + ',' + c);
        const cell = ctx.h('div', { class: 'rv-sq' + (isV ? ' valid' : '') });
        if (b[r][c] != null) cell.append(ctx.h('div', { class: 'rv-d p' + b[r][c] }));
        if (isV) cell.onclick = () => play(r, c);
        grid.append(cell);
      }
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid));
      ctx.isMyTurn ? ctx.msg(vm.length ? 'Your turn — flank to flip' : 'No moves — passing…', ctx.players[ctx.me].color) : waiting(ctx);
      if (ctx.isMyTurn && !vm.length) { // must pass
        const s = ctx.clone(ctx.state); s.turn = 1 - ctx.me; setTimeout(() => ctx.commit(s), 600); return;
      }
      function play(r, c) {
        const fl = flips(r, c, ctx.me); if (!fl.length) return;
        const s = ctx.clone(ctx.state); s.board[r][c] = ctx.me; fl.forEach(([fr, fc]) => s.board[fr][fc] = ctx.me); ctx.sound.place();
        const full = s.board.every(row => row.every(x => x != null));
        const oppCan = validOn(s.board, 1 - ctx.me).length, meCan = validOn(s.board, ctx.me).length;
        if (full || (!oppCan && !meCan)) { const c0 = s.board.flat().filter(x => x === 0).length, c1 = s.board.flat().filter(x => x === 1).length; return ctx.commit(s, c0 === c1 ? 'draw' : (c0 > c1 ? 0 : 1)); }
        s.turn = oppCan ? 1 - ctx.me : ctx.me; ctx.commit(s);
      }
      function validOn(board, p) { const out = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { if (board[r][c] != null) continue; let ok = false; for (const [dr, dc] of DIRS) { let nr = r + dr, nc = c + dc, n = 0; while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === 1 - p) { n++; nr += dr; nc += dc; } if (n && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === p) { ok = true; break; } } if (ok) out.push(1); } return out; }
    },
  });

  /* ---------- 6. GOMOKU ---------- */
  Games.register({
    id: 'gomoku', name: 'Gomoku', emoji: '⚫', category: 'Strategy', accent: '#b266ff',
    tagline: 'Five stones in a row.',
    init: host => ({ board: Array.from({ length: 13 }, () => Array(13).fill(null)), turn: host }),
    render(ctx) {
      const N = 13, b = ctx.state.board;
      ctx.root.append(ctx.turnBar());
      const grid = ctx.h('div', { class: 'gmk' }); grid.style.gridTemplateColumns = `repeat(${N},1fr)`;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const cell = ctx.h('div', { class: 'gmk-c' + (ctx.isMyTurn && b[r][c] == null ? ' live' : '') });
        if (b[r][c] != null) cell.append(ctx.h('div', { class: 'st p' + b[r][c] }));
        if (ctx.isMyTurn && b[r][c] == null) cell.onclick = () => play(r, c);
        grid.append(cell);
      }
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid));
      const wl = findRun(b, N, N, 5);
      if (wl) fxWinLine(grid, grid.children[wl.r1 * N + wl.c1], grid.children[wl.r2 * N + wl.c2], ctx.players[wl.p].color);
      ctx.isMyTurn ? ctx.msg('Your turn — place a stone', ctx.players[ctx.me].color) : waiting(ctx);
      function play(r, c) {
        const s = ctx.clone(ctx.state); s.board[r][c] = ctx.me; ctx.sound.place();
        if (win(s.board, r, c, ctx.me)) return ctx.commit(s, ctx.me);
        if (s.board.every(row => row.every(x => x != null))) return ctx.commit(s, 'draw');
        s.turn = 1 - ctx.me; ctx.commit(s);
      }
      function win(g, r, c, p) { for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) { let n = 1; for (const s of [1, -1]) { let nr = r + dr * s, nc = c + dc * s; while (nr >= 0 && nr < N && nc >= 0 && nc < N && g[nr][nc] === p) { n++; nr += dr * s; nc += dc * s; } } if (n >= 5) return true; } return false; }
    },
  });

})();
