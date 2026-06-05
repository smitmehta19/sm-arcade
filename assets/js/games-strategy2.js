/* ============================================================
   NEW GAMES — Pentago, Hex, Nine Men's Morris, Quoridor,
   Quarto, Code Breaker (online turn-based)
   ============================================================ */
(function () {
  const css = `
  .pent{ display:grid; grid-template-columns:1fr 1fr; gap:10px; background:rgba(120,90,220,.1); padding:10px; border-radius:16px; }
  .pent-q{ display:grid; grid-template-columns:repeat(3,1fr); gap:6px; background:rgba(255,255,255,.03); padding:6px; border-radius:12px; }
  .pent-c{ aspect-ratio:1; border-radius:50%; background:var(--bg); border:1px solid var(--line); display:grid; place-items:center; }
  .pent-c.live{ cursor:pointer; } .pent-c.live:hover{ box-shadow:inset 0 0 0 2px var(--violet); }
  .pent-pc{ width:74%; height:74%; border-radius:50%; }
  .pent-pc.p0{ background:radial-gradient(circle at 35% 30%, #bff6ff, var(--p1)); box-shadow:0 0 9px var(--p1); }
  .pent-pc.p1{ background:radial-gradient(circle at 35% 30%, #ffc6e0, var(--p2)); box-shadow:0 0 9px var(--p2); }
  .pent-rots{ display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px; }
  .pent-rotrow{ display:flex; gap:6px; align-items:center; justify-content:center; font-size:11px; color:var(--ink-dim); }
  .pent-rot{ width:38px; height:34px; border-radius:9px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-size:16px; }

  .hexb{ overflow-x:auto; padding:8px 0; } .hexb-in{ display:inline-block; margin:0 auto; }
  .hex-row{ display:flex; }
  .hex-c{ width:24px; height:24px; margin:1px; border-radius:50%; background:var(--bg-2); border:1px solid var(--line); flex:0 0 auto; }
  .hex-c.live{ cursor:pointer; } .hex-c.live:hover{ box-shadow:0 0 0 2px var(--violet); }
  .hex-c.p0{ background:radial-gradient(circle at 35% 30%, #bff6ff, var(--p1)); box-shadow:0 0 6px var(--p1); border-color:transparent; }
  .hex-c.p1{ background:radial-gradient(circle at 35% 30%, #ffc6e0, var(--p2)); box-shadow:0 0 6px var(--p2); border-color:transparent; }
  .hex-legend{ display:flex; justify-content:space-between; font-size:11px; color:var(--ink-dim); margin-bottom:6px; }

  .mm-wrap{ position:relative; width:100%; max-width:330px; margin:0 auto; aspect-ratio:1; }
  .mm-svg{ position:absolute; inset:0; width:100%; height:100%; }
  .mm-pt{ position:absolute; width:30px; height:30px; transform:translate(-50%,-50%); border-radius:50%; background:transparent; border:none; }
  .mm-pt .dot{ width:12px; height:12px; border-radius:50%; background:var(--ink-faint); margin:auto; transition:all .15s; }
  .mm-pt.live .dot{ background:var(--violet); box-shadow:0 0 8px var(--violet); cursor:pointer; }
  .mm-pt.sel .pc{ box-shadow:0 0 0 3px var(--gold); }
  .mm-pt .pc{ width:24px; height:24px; border-radius:50%; margin:auto; }
  .mm-pt .pc.p0{ background:radial-gradient(circle at 35% 30%, #bff6ff, var(--p1)); box-shadow:0 0 8px var(--p1); }
  .mm-pt .pc.p1{ background:radial-gradient(circle at 35% 30%, #ffc6e0, var(--p2)); box-shadow:0 0 8px var(--p2); }
  .mm-pt.tgt .pc.removable{ box-shadow:0 0 0 3px var(--magenta); cursor:pointer; }

  /* Quoridor: one CSS grid with real wall gutters between cells (no pixel math /
     getBoundingClientRect — walls always line up and the slots are easy to tap). */
  .qd{ display:grid; gap:0; margin:0 auto; max-width:360px; width:100%; aspect-ratio:1; box-sizing:border-box; background:rgba(120,90,220,.08); padding:8px; border-radius:14px; }
  .qd-c{ border-radius:5px; background:var(--bg-2); display:grid; place-items:center; position:relative; }
  .qd-c.live{ cursor:pointer; box-shadow:inset 0 0 0 2px var(--lime); }
  .qd-c.live::after{ content:''; width:32%; height:32%; border-radius:50%; background:var(--lime); opacity:.45; }
  .qd-pawn{ width:74%; height:74%; border-radius:50%; z-index:1; }
  .qd-pawn.p0{ background:radial-gradient(circle at 35% 30%, #bff6ff, var(--p1)); box-shadow:0 0 9px var(--p1); }
  .qd-pawn.p1{ background:radial-gradient(circle at 35% 30%, #ffc6e0, var(--p2)); box-shadow:0 0 9px var(--p2); }
  .qd-slot{ background:transparent; border-radius:4px; align-self:stretch; justify-self:stretch; transition:background .12s; }
  .qd-slot.live{ cursor:pointer; background:rgba(255,214,107,.18); }
  .qd-slot.live:hover{ background:rgba(255,214,107,.6); }
  .qd-slot.on{ background:var(--gold); box-shadow:0 0 8px var(--gold); }
  .qd-modes{ display:flex; gap:8px; justify-content:center; margin-bottom:10px; }
  .qd-mode{ padding:8px 16px; border-radius:11px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink-dim); font-weight:600; font-size:13px; }
  .qd-mode.on{ border-color:var(--violet); color:var(--ink); box-shadow:var(--glow-v); }

  .qt{ display:grid; grid-template-columns:repeat(4,1fr); gap:7px; max-width:300px; margin:0 auto; }
  .qt-cell{ aspect-ratio:1; border-radius:10px; background:var(--bg-2); border:1px solid var(--line); display:grid; place-items:center; }
  .qt-cell.live{ cursor:pointer; box-shadow:inset 0 0 0 2px var(--lime); }
  .qt-piece{ display:grid; place-items:center; }
  .qt-pc{ border:2px solid; }
  .qt-pc.big{ width:30px; height:30px; } .qt-pc.small{ width:19px; height:19px; }
  .qt-pc.round{ border-radius:50%; } .qt-pc.square{ border-radius:4px; }
  .qt-pc.light{ border-color:#bcd6ff; background:#bcd6ff; } .qt-pc.dark{ border-color:#7d6bd6; background:#7d6bd6; }
  .qt-pc.hollow{ background:transparent !important; }
  .qt-hand{ text-align:center; margin:14px 0; } .qt-hand .lbl{ font-size:12px; color:var(--ink-dim); margin-bottom:8px; }
  .qt-tray{ display:flex; flex-wrap:wrap; gap:8px; justify-content:center; }
  .qt-tray .qt-cell{ width:46px; height:46px; aspect-ratio:auto; }

  .cb-rows{ display:flex; flex-direction:column; gap:7px; margin-bottom:14px; }
  .cb-row{ display:flex; align-items:center; gap:8px; justify-content:center; }
  .cb-slot{ width:30px; height:30px; border-radius:50%; border:2px dashed var(--line); }
  .cb-peg{ width:30px; height:30px; border-radius:50%; box-shadow:inset 0 2px 4px rgba(0,0,0,.4); }
  /* clear feedback: explicit counts, not cryptic pegs */
  .cb-fb2{ display:flex; gap:6px; align-items:center; margin-left:8px; }
  .cb-key{ display:inline-flex; align-items:center; gap:5px; font-family:var(--font-num); font-weight:900; font-size:16px; min-width:30px; justify-content:center; padding:4px 10px; border-radius:999px; }
  .cb-key i{ width:14px; height:14px; border-radius:50%; flex:0 0 auto; }
  .cb-key.exact{ background:rgba(46,160,67,.18); color:#8ef7c2; } .cb-key.exact i{ background:#2ea043; box-shadow:0 0 7px #2ea043; }
  .cb-key.spot{ background:rgba(212,167,44,.15); color:#ffdf91; } .cb-key.spot i{ background:transparent; border:3px solid #e0b53a; box-sizing:border-box; }
  .cb-key.zero{ opacity:.4; }
  .cb-legend{ display:flex; gap:16px; justify-content:center; align-items:center; flex-wrap:wrap; font-size:12px; color:var(--ink-dim); margin:0 0 12px; }
  .cb-legend span{ display:inline-flex; align-items:center; gap:6px; }
  .cb-legend i{ width:13px; height:13px; border-radius:50%; flex:0 0 auto; }
  .cb-legend i.exact{ background:#2ea043; box-shadow:0 0 6px #2ea043; } .cb-legend i.spot{ background:transparent; border:3px solid #e0b53a; box-sizing:border-box; }
  .cb-palette{ display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:8px; }
  .cb-color{ width:36px; height:36px; border-radius:50%; border:2px solid rgba(255,255,255,.2); box-shadow:inset 0 2px 5px rgba(0,0,0,.4); }
  .cb-color:active{ transform:scale(.88); }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const waiting = (ctx, who) => ctx.msg(`Waiting for ${who || ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');
  const rint = n => Math.floor(Math.random() * n);

  /* ===================== PENTAGO ===================== */
  function pRot(b, q, dir) {
    const nb = b.map(r => r.slice()); const qr = Math.floor(q / 2) * 3, qc = (q % 2) * 3;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const v = b[qr + i][qc + j]; if (dir > 0) nb[qr + j][qc + 2 - i] = v; else nb[qr + 2 - j][qc + i] = v; }
    return nb;
  }
  function pWin(b, p) { for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) { if (b[r][c] !== p) continue; for (const [dr, dc] of [[0,1],[1,0],[1,1],[1,-1]]) { let n = 1, nr = r + dr, nc = c + dc; while (nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && b[nr][nc] === p) { n++; nr += dr; nc += dc; } if (n >= 5) return true; } } return false; }
  Games.register({
    id: 'pentago', name: 'Pentago', emoji: '🔵', category: 'Strategy', accent: '#2fe6ff',
    tagline: 'Place a marble, twist a block.',
    init: host => ({ board: Array.from({ length: 6 }, () => Array(6).fill(null)), turn: host, phase: 'place' }),
    render(ctx) {
      const st = ctx.state, b = st.board, me = ctx.me;
      ctx.root.append(ctx.turnBar());
      const grid = ctx.h('div', { class: 'pent' });
      for (let q = 0; q < 4; q++) {
        const qd = ctx.h('div', { class: 'pent-q' }); const qr = Math.floor(q / 2) * 3, qc = (q % 2) * 3;
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const r = qr + i, c = qc + j; const live = ctx.isMyTurn && st.phase === 'place' && b[r][c] == null;
          const cell = ctx.h('div', { class: 'pent-c' + (live ? ' live' : '') });
          if (b[r][c] != null) cell.append(ctx.h('div', { class: 'pent-pc p' + b[r][c] }));
          if (live) cell.onclick = () => place(r, c);
          qd.append(cell);
        }
        grid.append(qd);
      }
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid));
      if (ctx.isMyTurn && st.phase === 'rotate') {
        const rots = ctx.h('div', { class: 'pent-rots' });
        ['Top-left', 'Top-right', 'Bottom-left', 'Bottom-right'].forEach((lbl, q) => {
          rots.append(ctx.h('div', { class: 'pent-rotrow' },
            ctx.h('button', { class: 'pent-rot', onclick: () => rotate(q, -1) }, '↺'),
            ctx.h('span', {}, lbl),
            ctx.h('button', { class: 'pent-rot', onclick: () => rotate(q, 1) }, '↻')));
        });
        ctx.root.append(rots);
        ctx.msg('Now twist any block ↺ ↻', ctx.players[me].color);
      } else ctx.isMyTurn ? ctx.msg('Place a marble', ctx.players[me].color) : waiting(ctx);
      function place(r, c) { const s = ctx.clone(st); s.board[r][c] = me; s.phase = 'rotate'; ctx.sound.place(); ctx.commit(s); }
      function rotate(q, dir) {
        const s = ctx.clone(st); s.board = pRot(s.board, q, dir); s.phase = 'place'; ctx.sound.move();
        const meWin = pWin(s.board, me), oppWin = pWin(s.board, 1 - me);
        if (meWin && !oppWin) return ctx.commit(s, me);
        if (oppWin && !meWin) return ctx.commit(s, 1 - me);
        if (meWin && oppWin) return ctx.commit(s, 'draw');
        if (s.board.every(row => row.every(x => x != null))) return ctx.commit(s, 'draw');
        s.turn = 1 - me; ctx.commit(s);
      }
    },
  });

  /* ===================== HEX ===================== */
  const HN = 11;
  function hWin(b, p) {
    const adj = [[0,1],[0,-1],[1,0],[-1,0],[1,-1],[-1,1]]; const seen = Array.from({ length: HN }, () => Array(HN).fill(false)); const stk = [];
    if (p === 0) { for (let c = 0; c < HN; c++) if (b[0][c] === 0) { stk.push([0, c]); seen[0][c] = true; } }
    else { for (let r = 0; r < HN; r++) if (b[r][0] === 1) { stk.push([r, 0]); seen[r][0] = true; } }
    while (stk.length) { const [r, c] = stk.pop(); if (p === 0 && r === HN - 1) return true; if (p === 1 && c === HN - 1) return true; for (const [dr, dc] of adj) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < HN && nc >= 0 && nc < HN && !seen[nr][nc] && b[nr][nc] === p) { seen[nr][nc] = true; stk.push([nr, nc]); } } }
    return false;
  }
  Games.register({
    id: 'hex', name: 'Hex', emoji: '⬡', category: 'Strategy', accent: '#9b7bff',
    tagline: 'Connect your two sides.',
    init: host => ({ board: Array.from({ length: HN }, () => Array(HN).fill(null)), turn: host }),
    render(ctx) {
      const st = ctx.state, b = st.board, me = ctx.me;
      ctx.root.append(ctx.turnBar());
      ctx.root.append(ctx.h('div', { class: 'hex-legend' },
        ctx.h('span', { style: `color:${ctx.players[0].color}` }, ctx.players[0].name + ': top ↕ bottom'),
        ctx.h('span', { style: `color:${ctx.players[1].color}` }, ctx.players[1].name + ': left ↔ right')));
      const wrapEl = ctx.h('div', { class: 'hexb' }); const inner = ctx.h('div', { class: 'hexb-in' });
      for (let r = 0; r < HN; r++) {
        const row = ctx.h('div', { class: 'hex-row', style: `margin-left:${r * 13}px` });
        for (let c = 0; c < HN; c++) {
          const v = b[r][c]; const live = ctx.isMyTurn && v == null;
          const cell = ctx.h('div', { class: 'hex-c' + (v != null ? ' p' + v : '') + (live ? ' live' : '') });
          if (live) cell.onclick = () => play(r, c);
          row.append(cell);
        }
        inner.append(row);
      }
      wrapEl.append(inner); ctx.root.append(ctx.h('div', { class: 'board-frame' }, wrapEl));
      ctx.isMyTurn ? ctx.msg('Place a stone to extend your chain', ctx.players[me].color) : waiting(ctx);
      function play(r, c) { const s = ctx.clone(st); s.board[r][c] = me; ctx.sound.place(); if (hWin(s.board, me)) return ctx.commit(s, me); s.turn = 1 - me; ctx.commit(s); }
    },
  });

  /* ===================== NINE MEN'S MORRIS ===================== */
  const MM_MILLS = [[0,1,2],[3,4,5],[6,7,8],[9,10,11],[12,13,14],[15,16,17],[18,19,20],[21,22,23],[0,9,21],[3,10,18],[6,11,15],[1,4,7],[16,19,22],[8,12,17],[5,13,20],[2,14,23]];
  const MM_ADJ = { 0:[1,9],1:[0,2,4],2:[1,14],3:[4,10],4:[1,3,5,7],5:[4,13],6:[7,11],7:[4,6,8],8:[7,12],9:[0,10,21],10:[3,9,11,18],11:[6,10,15],12:[8,13,17],13:[5,12,14,20],14:[2,13,23],15:[11,16],16:[15,17,19],17:[12,16],18:[10,19],19:[16,18,20,22],20:[13,19],21:[9,22],22:[19,21,23],23:[14,22] };
  const MM_CO = [[0,0],[3,0],[6,0],[1,1],[3,1],[5,1],[2,2],[3,2],[4,2],[0,3],[1,3],[2,3],[4,3],[5,3],[6,3],[2,4],[3,4],[4,4],[1,5],[3,5],[5,5],[0,6],[3,6],[6,6]];
  const mmMill = (pts, pt, p) => MM_MILLS.some(m => m.includes(pt) && m.every(x => pts[x] === p));
  const mmInAnyMill = (pts, pt, p) => MM_MILLS.some(m => m.includes(pt) && m.every(x => pts[x] === p));
  const mmCount = (pts, p) => pts.filter(x => x === p).length;
  function mmHasMove(pts, p, placed) {
    if (placed[p] < 9) return true;
    if (mmCount(pts, p) <= 3) return pts.some(x => x == null);
    for (let i = 0; i < 24; i++) if (pts[i] === p && MM_ADJ[i].some(j => pts[j] == null)) return true;
    return false;
  }
  Games.register({
    id: 'nine-mens-morris', name: 'Nine Men’s Morris', emoji: '⚙️', category: 'Strategy', accent: '#ffd66b',
    tagline: 'Form mills, capture pieces.',
    init: host => ({ pts: Array(24).fill(null), turn: host, phase: 'place', placed: [0, 0], mustRemove: false, host }),
    render(ctx) {
      const st = ctx.state, pts = st.pts, me = ctx.me; let sel = null;
      ctx.root.append(ctx.turnBar({ scores: [mmCount(pts, 0) + (9 - st.placed[0]), mmCount(pts, 1) + (9 - st.placed[1])] }));
      const wrap = ctx.h('div', { class: 'mm-wrap' });
      const S = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(S, 'svg'); svg.setAttribute('class', 'mm-svg'); svg.setAttribute('viewBox', '0 0 6 6');
      const lineSet = [[0,2],[2,23],[23,21],[21,0],[3,5],[5,20],[20,18],[18,3],[6,8],[8,17],[17,15],[15,6],[1,7],[16,22],[9,11],[12,14]];
      lineSet.forEach(([a, b]) => { const l = document.createElementNS(S, 'line'); l.setAttribute('x1', MM_CO[a][0]); l.setAttribute('y1', MM_CO[a][1]); l.setAttribute('x2', MM_CO[b][0]); l.setAttribute('y2', MM_CO[b][1]); l.setAttribute('stroke', 'rgba(150,170,230,.3)'); l.setAttribute('stroke-width', '.05'); svg.append(l); });
      wrap.append(svg);
      const oppAllMills = (() => { const opp = 1 - me; const ids = pts.map((v, i) => v === opp ? i : -1).filter(i => i >= 0); return ids.length > 0 && ids.every(i => mmInAnyMill(pts, i, opp)); })();
      const flying = mmCount(pts, me) <= 3 && st.placed[me] >= 9;
      pts.forEach((v, i) => {
        const [x, y] = MM_CO[i];
        const placeLive = ctx.isMyTurn && !st.mustRemove && st.phase === 'place' && v == null;
        const removeTgt = ctx.isMyTurn && st.mustRemove && v === (1 - me) && (oppAllMills || !mmInAnyMill(pts, i, 1 - me));
        const btn = ctx.h('button', { class: 'mm-pt' + (placeLive ? ' live' : '') + (removeTgt ? ' tgt' : ''), style: `left:${(x / 6) * 100}%; top:${(y / 6) * 100}%` });
        if (v == null) btn.append(ctx.h('div', { class: 'dot' }));
        else btn.append(ctx.h('div', { class: 'pc p' + v + (removeTgt ? ' removable' : '') }));
        if (placeLive) btn.onclick = () => doPlace(i);
        else if (removeTgt) btn.onclick = () => doRemove(i);
        else if (ctx.isMyTurn && !st.mustRemove && st.phase === 'move' && v === me) btn.onclick = () => selectPiece(i, btn);
        wrap.append(btn);
      });
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, wrap));
      if (st.mustRemove && ctx.isMyTurn) ctx.msg('Mill! Remove an opponent piece', 'var(--gold)');
      else if (!ctx.isMyTurn) waiting(ctx);
      else ctx.msg(st.phase === 'place' ? `Place a piece (${9 - st.placed[me]} left)` : (flying ? 'Fly a piece anywhere' : 'Move a piece to a neighbour'), ctx.players[me].color);

      function doPlace(i) {
        const s = ctx.clone(st); s.pts[i] = me; s.placed[me]++; ctx.sound.place();
        if (mmMill(s.pts, i, me)) { s.mustRemove = true; if (s.placed[0] >= 9 && s.placed[1] >= 9) s.phase = 'move'; return ctx.commit(s); }
        if (s.placed[0] >= 9 && s.placed[1] >= 9) s.phase = 'move';
        s.turn = 1 - me; ctx.commit(s);
      }
      function selectPiece(i, btn) {
        ctx.root.querySelectorAll('.mm-pt.sel').forEach(e => e.classList.remove('sel'));
        sel = i; btn.classList.add('sel');
        const dests = flying ? pts.map((v, j) => v == null ? j : -1).filter(j => j >= 0) : MM_ADJ[i].filter(j => pts[j] == null);
        ctx.root.querySelectorAll('.mm-pt').forEach((e, j) => { e.classList.remove('live'); });
        dests.forEach(j => { const el = ctx.root.querySelectorAll('.mm-pt')[j]; el.classList.add('live'); el.onclick = () => doMove(sel, j); });
        ctx.sound.tap();
      }
      function doMove(from, to) {
        const s = ctx.clone(st); s.pts[to] = me; s.pts[from] = null; ctx.sound.move();
        if (mmMill(s.pts, to, me)) { s.mustRemove = true; return ctx.commit(s); }
        if (!mmHasMove(s.pts, 1 - me, s.placed)) return ctx.commit(s, me);
        s.turn = 1 - me; ctx.commit(s);
      }
      function doRemove(i) {
        const s = ctx.clone(st); s.pts[i] = null; s.mustRemove = false; ctx.sound.bad();
        const opp = 1 - me;
        if (s.placed[0] >= 9 && s.placed[1] >= 9 && mmCount(s.pts, opp) < 3) return ctx.commit(s, me);
        if (s.phase === 'move' && !mmHasMove(s.pts, opp, s.placed)) return ctx.commit(s, me);
        s.turn = opp; ctx.commit(s);
      }
    },
  });

  /* ===================== QUORIDOR ===================== */
  const QN = 9;
  function qBlocked(s, r, c, nr, nc) { // wall between (r,c)&(nr,nc)?
    if (nr === r) { const cc = Math.min(c, nc); if (s.vwalls[r + ',' + cc] || s.vwalls[(r - 1) + ',' + cc]) return true; }
    else { const rr = Math.min(r, nr); if (s.hwalls[rr + ',' + c] || s.hwalls[rr + ',' + (c - 1)]) return true; }
    return false;
  }
  function qReach(s, who) { // BFS pawn `who` to goal row
    const goal = who === 0 ? 0 : QN - 1; const start = s.pawns[who]; const seen = {}; const q = [[start.r, start.c]]; seen[start.r + ',' + start.c] = 1;
    while (q.length) { const [r, c] = q.shift(); if (r === goal) return true; for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nr = r + dr, nc = c + dc; if (nr < 0 || nr >= QN || nc < 0 || nc >= QN) continue; if (seen[nr + ',' + nc]) continue; if (qBlocked(s, r, c, nr, nc)) continue; seen[nr + ',' + nc] = 1; q.push([nr, nc]); } }
    return false;
  }
  function qPawnMoves(s, me) {
    const p = s.pawns[me], opp = s.pawns[1 - me], out = [];
    for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nr = p.r + dr, nc = p.c + dc; if (nr < 0 || nr >= QN || nc < 0 || nc >= QN) continue; if (qBlocked(s, p.r, p.c, nr, nc)) continue;
      if (nr === opp.r && nc === opp.c) { // jump
        const jr = nr + dr, jc = nc + dc;
        if (jr >= 0 && jr < QN && jc >= 0 && jc < QN && !qBlocked(s, nr, nc, jr, jc)) out.push([jr, jc]);
        else { for (const [sr, sc] of (dr ? [[0,1],[0,-1]] : [[1,0],[-1,0]])) { const ar = nr + sr, ac = nc + sc; if (ar >= 0 && ar < QN && ac >= 0 && ac < QN && !qBlocked(s, nr, nc, ar, ac)) out.push([ar, ac]); } }
      } else out.push([nr, nc]);
    }
    return out;
  }
  Games.register({
    id: 'quoridor', name: 'Quoridor', emoji: '🧱', category: 'Strategy', accent: '#79f5b6',
    tagline: 'Race across; wall them off.',
    init: host => ({ pawns: [{ r: 8, c: 4 }, { r: 0, c: 4 }], hwalls: {}, vwalls: {}, wallsLeft: [10, 10], turn: host, mode: 'move' }),
    render(ctx) {
      const st = ctx.state, me = ctx.me; let mode = 'move';
      ctx.root.append(ctx.turnBar({ scores: [st.wallsLeft[0], st.wallsLeft[1]] }));
      let modesEl = null;
      if (ctx.isMyTurn) {
        modesEl = ctx.h('div', { class: 'qd-modes' },
          ctx.h('button', { class: 'qd-mode on', onclick: () => setMode('move') }, 'Move pawn'),
          ctx.h('button', { class: 'qd-mode' + (st.wallsLeft[me] ? '' : ' hidden'), onclick: () => setMode('wall') }, `Place wall (${st.wallsLeft[me]})`));
        ctx.root.append(modesEl);
      }
      const frame = ctx.h('div', { class: 'board-frame' });
      ctx.root.append(frame);
      const moves = ctx.isMyTurn ? qPawnMoves(st, me) : [];
      // 9 cells separated by 8 thin wall gutters → a 17×17 track grid. Cells live on
      // odd tracks; walls drop straight into the even gutter tracks. No pixel math.
      const tracks = Array(QN).fill('1fr').join(' 0.4fr ');

      function hSlot(r, c, on, fn) {
        const e = ctx.h('div', { class: 'qd-slot h' + (on ? ' on' : (fn ? ' live' : '')) });
        e.style.gridRow = String(2 * r + 2); e.style.gridColumn = (2 * c + 1) + ' / ' + (2 * c + 4);
        if (fn) e.onclick = fn; return e;
      }
      function vSlot(r, c, on, fn) {
        const e = ctx.h('div', { class: 'qd-slot v' + (on ? ' on' : (fn ? ' live' : '')) });
        e.style.gridColumn = String(2 * c + 2); e.style.gridRow = (2 * r + 1) + ' / ' + (2 * r + 4);
        if (fn) e.onclick = fn; return e;
      }
      function renderBoard() {
        frame.innerHTML = '';
        const board = ctx.h('div', { class: 'qd' });
        board.style.gridTemplateColumns = tracks; board.style.gridTemplateRows = tracks;
        for (let r = 0; r < QN; r++) for (let c = 0; c < QN; c++) {
          const live = ctx.isMyTurn && mode === 'move' && moves.some(([mr, mc]) => mr === r && mc === c);
          const cell = ctx.h('div', { class: 'qd-c' + (live ? ' live' : '') });
          cell.style.gridRow = String(2 * r + 1); cell.style.gridColumn = String(2 * c + 1);
          if (st.pawns[0].r === r && st.pawns[0].c === c) cell.append(ctx.h('div', { class: 'qd-pawn p0' }));
          if (st.pawns[1].r === r && st.pawns[1].c === c) cell.append(ctx.h('div', { class: 'qd-pawn p1' }));
          if (live) cell.onclick = () => movePawn(r, c);
          board.append(cell);
        }
        for (const k in st.hwalls) { const [r, c] = k.split(',').map(Number); board.append(hSlot(r, c, true)); }
        for (const k in st.vwalls) { const [r, c] = k.split(',').map(Number); board.append(vSlot(r, c, true)); }
        if (ctx.isMyTurn && mode === 'wall' && st.wallsLeft[me] > 0) {
          for (let r = 0; r < QN - 1; r++) for (let c = 0; c < QN - 1; c++) {
            if (canH(r, c)) board.append(hSlot(r, c, false, () => placeWall('h', r, c)));
            if (canV(r, c)) board.append(vSlot(r, c, false, () => placeWall('v', r, c)));
          }
        }
        frame.append(board);
      }
      function setMode(m) {
        mode = m;
        if (modesEl) [...modesEl.children].forEach(b => b.classList.toggle('on', b.textContent.toLowerCase().includes(m === 'move' ? 'move' : 'wall')));
        renderBoard();
        ctx.isMyTurn && ctx.msg(mode === 'wall' ? 'Tap a glowing gap to drop a wall' : 'Move your pawn, or switch to walls', ctx.players[me].color);
      }
      renderBoard();
      ctx.isMyTurn ? ctx.msg('Move your pawn, or switch to walls', ctx.players[me].color) : waiting(ctx);

      function movePawn(r, c) { const s = ctx.clone(st); s.pawns[me] = { r, c }; ctx.sound.move(); const goal = me === 0 ? 0 : 8; if (r === goal) return ctx.commit(s, me); s.turn = 1 - me; ctx.commit(s); }

      function canH(r, c) { if (st.hwalls[r + ',' + c] || st.hwalls[r + ',' + (c - 1)] || st.hwalls[r + ',' + (c + 1)]) return false; if (st.vwalls[r + ',' + c]) return false; const s = sim('h', r, c); return qReach(s, 0) && qReach(s, 1); }
      function canV(r, c) { if (st.vwalls[r + ',' + c] || st.vwalls[(r - 1) + ',' + c] || st.vwalls[(r + 1) + ',' + c]) return false; if (st.hwalls[r + ',' + c]) return false; const s = sim('v', r, c); return qReach(s, 0) && qReach(s, 1); }
      function sim(dir, r, c) { const s = JSON.parse(JSON.stringify(st)); (dir === 'h' ? s.hwalls : s.vwalls)[r + ',' + c] = 1; return s; }
      function placeWall(dir, r, c) { const s = ctx.clone(st); (dir === 'h' ? s.hwalls : s.vwalls)[r + ',' + c] = 1; s.wallsLeft[me]--; ctx.sound.place(); s.turn = 1 - me; ctx.commit(s); }
    },
  });

  /* ===================== QUARTO ===================== */
  function qtPieceClass(p) { return [(p & 1) ? 'big' : 'small', (p & 2) ? 'dark' : 'light', (p & 4) ? 'round' : 'square', (p & 8) ? 'hollow' : 'solid'].join(' '); }
  function qtWin(board) {
    const lines = [];
    for (let i = 0; i < 4; i++) { lines.push([0,1,2,3].map(j => i * 4 + j)); lines.push([0,1,2,3].map(j => j * 4 + i)); }
    lines.push([0,5,10,15]); lines.push([3,6,9,12]);
    for (const ln of lines) { const ps = ln.map(i => board[i]); if (ps.some(p => p == null)) continue; for (let bit = 1; bit <= 8; bit <<= 1) { if (ps.every(p => p & bit) || ps.every(p => !(p & bit))) return true; } }
    return false;
  }
  Games.register({
    id: 'quarto', name: 'Quarto', emoji: '🟫', category: 'Strategy', accent: '#9b7bff',
    tagline: 'Hand your rival their piece.',
    init: host => ({ board: Array(16).fill(null), avail: Array(16).fill(true), hand: null, turn: host, phase: 'pick' }),
    render(ctx) {
      const st = ctx.state, me = ctx.me;
      const piece = p => ctx.h('div', { class: 'qt-piece' }, ctx.h('div', { class: 'qt-pc ' + qtPieceClass(p) }));
      const grid = ctx.h('div', { class: 'qt' });
      st.board.forEach((p, i) => {
        const live = ctx.isMyTurn && st.phase === 'place' && p == null;
        const cell = ctx.h('div', { class: 'qt-cell' + (live ? ' live' : '') });
        if (p != null) cell.append(piece(p));
        if (live) cell.onclick = () => placeAt(i);
        grid.append(cell);
      });
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid));
      // hand
      const hand = ctx.h('div', { class: 'qt-hand' });
      if (st.hand != null) hand.append(ctx.h('div', { class: 'lbl' }, st.phase === 'place' && ctx.isMyTurn ? 'Place this piece:' : 'Piece in play:'), ctx.h('div', { class: 'qt-cell', style: 'width:54px;height:54px;margin:0 auto;display:grid;place-items:center' }, piece(st.hand)));
      ctx.root.append(hand);
      if (ctx.isMyTurn && st.phase === 'pick') {
        const tray = ctx.h('div', { class: 'qt-tray' });
        st.avail.forEach((a, p) => { if (!a) return; const cell = ctx.h('div', { class: 'qt-cell live' }, piece(p)); cell.onclick = () => giveTo(p); tray.append(cell); });
        ctx.root.append(ctx.h('p', { class: 'center', style: 'color:var(--ink-dim);font-size:13px;margin:6px 0' }, `Choose a piece for ${ctx.players[1 - me].name} to place:`), tray);
        ctx.msg('Pick your rival’s piece', ctx.players[me].color);
      } else if (ctx.isMyTurn && st.phase === 'place') ctx.msg('Place the piece on the board', ctx.players[me].color);
      else waiting(ctx);
      function giveTo(p) { const s = ctx.clone(st); s.hand = p; s.avail[p] = false; s.phase = 'place'; s.turn = 1 - me; ctx.sound.tap(); ctx.commit(s); }
      function placeAt(i) {
        const s = ctx.clone(st); s.board[i] = s.hand; s.hand = null; ctx.sound.place();
        if (qtWin(s.board)) return ctx.commit(s, me);
        if (s.board.every(x => x != null)) return ctx.commit(s, 'draw');
        s.phase = 'pick'; ctx.commit(s); // same player now picks for opponent
      }
    },
  });

  /* ===================== CODE BREAKER ===================== */
  const CB_COLORS = ['#ff4d6d', '#2fe6ff', '#79f5b6', '#ffd66b', '#9b7bff', '#ff9f45'];
  function cbFeedback(guess, code) { let black = 0, white = 0; const g = guess.slice(), c = code.slice(); for (let i = 0; i < 4; i++) if (g[i] === c[i]) { black++; g[i] = c[i] = -1; } for (let i = 0; i < 4; i++) { if (g[i] < 0) continue; const j = c.indexOf(g[i]); if (j >= 0) { white++; c[j] = -1; } } return { black, white }; }
  Games.register({
    id: 'code-breaker', name: 'Code Breaker', emoji: '🎯', category: 'Strategy', accent: '#2fe6ff',
    tagline: 'Crack the secret colour code.',
    init: host => ({ secrets: [null, null], guesses: [[], []], phase: 'set', turn: host, host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me;
      if (st.phase === 'set') {
        if (st.secrets[1 - me] == null) {  // I set the code my opponent will crack
          let draft = [];
          const slots = ctx.h('div', { class: 'cb-row' });
          const renderSlots = () => { slots.innerHTML = ''; for (let i = 0; i < 4; i++) slots.append(draft[i] != null ? ctx.h('div', { class: 'cb-peg', style: `background:${CB_COLORS[draft[i]]}` }) : ctx.h('div', { class: 'cb-slot' })); };
          renderSlots();
          const pal = ctx.h('div', { class: 'cb-palette' }, CB_COLORS.map((col, i) => ctx.h('button', { class: 'cb-color', style: `background:${col}`, onclick: () => { if (draft.length < 4) { draft.push(i); renderSlots(); ctx.sound.tap(); } } })));
          const card = ctx.h('div', { class: 'board-frame' }, ctx.h('p', { style: 'color:var(--ink-dim);margin:0 0 12px;font-size:13px' }, `Set a secret 4-colour code for ${ctx.players[1 - me].name} to crack:`), slots, pal,
            ctx.h('div', { class: 'btn-row mt' },
              ctx.h('button', { class: 'btn btn-ghost', onclick: () => { draft = []; renderSlots(); } }, 'Clear'),
              ctx.h('button', { class: 'btn btn-primary', onclick: lock }, 'Lock code')));
          ctx.root.append(card); ctx.msg('Build a sneaky code 🤫', ctx.players[me].color);
          function lock() { if (draft.length !== 4) { ctx.sound.bad(); ctx.msg('Pick 4 colours', 'var(--gold)'); return; } const s = ctx.clone(st); s.secrets[1 - me] = draft.slice(); if (s.secrets[me] != null) { s.phase = 'play'; s.turn = s.host; } ctx.commit(s); }
        } else { ctx.root.append(frame(ctx, `Waiting for ${ctx.players[1 - me].name} to set their code…`)); waiting(ctx, ctx.players[1 - me].name); }
        return;
      }
      // play — I crack secrets[me]
      const target = st.secrets[me], myGuesses = st.guesses[me];
      const rows = ctx.h('div', { class: 'cb-rows' });
      myGuesses.forEach(g => {
        const row = ctx.h('div', { class: 'cb-row' });
        g.guess.forEach(ci => row.append(ctx.h('div', { class: 'cb-peg', style: `background:${CB_COLORS[ci]}` })));
        // clear counts: how many are in the right colour+spot, how many right colour wrong spot
        row.append(ctx.h('div', { class: 'cb-fb2' },
          ctx.h('span', { class: 'cb-key exact' + (g.black ? '' : ' zero') }, ctx.h('i', {}), String(g.black)),
          ctx.h('span', { class: 'cb-key spot' + (g.white ? '' : ' zero') }, ctx.h('i', {}), String(g.white))));
        rows.append(row);
      });
      const legend = ctx.h('div', { class: 'cb-legend' },
        ctx.h('span', {}, ctx.h('i', { class: 'exact' }), 'right colour & spot'),
        ctx.h('span', {}, ctx.h('i', { class: 'spot' }), 'right colour, wrong spot'));
      ctx.root.append(ctx.h('div', { class: 'board-frame' },
        ctx.h('p', { style: 'color:var(--ink-dim);margin:0 0 8px;font-size:12px;text-align:center' }, `Cracking ${ctx.players[1 - me].name}’s code — match the counts to deduce it`),
        legend,
        rows.children.length ? rows : ctx.h('p', { class: 'center', style: 'color:var(--ink-faint)' }, 'No guesses yet')));
      if (ctx.isMyTurn) {
        let draft = [];
        const slots = ctx.h('div', { class: 'cb-row' });
        const renderSlots = () => { slots.innerHTML = ''; for (let i = 0; i < 4; i++) slots.append(draft[i] != null ? ctx.h('div', { class: 'cb-peg', style: `background:${CB_COLORS[draft[i]]}` }) : ctx.h('div', { class: 'cb-slot' })); };
        renderSlots();
        const pal = ctx.h('div', { class: 'cb-palette' }, CB_COLORS.map((col, i) => ctx.h('button', { class: 'cb-color', style: `background:${col}`, onclick: () => { if (draft.length < 4) { draft.push(i); renderSlots(); ctx.sound.tap(); } } })));
        ctx.root.append(slots, pal, ctx.h('div', { class: 'btn-row mt' },
          ctx.h('button', { class: 'btn btn-ghost', onclick: () => { draft = []; renderSlots(); } }, 'Clear'),
          ctx.h('button', { class: 'btn btn-primary', onclick: submit }, 'Guess')));
        ctx.msg('Take a guess', ctx.players[me].color);
        function submit() { if (draft.length !== 4) { ctx.sound.bad(); ctx.msg('Pick 4 colours', 'var(--gold)'); return; } const fb = cbFeedback(draft, target); const s = ctx.clone(st); s.guesses[me] = myGuesses.concat([{ guess: draft.slice(), black: fb.black, white: fb.white }]); ctx.sound.place(); if (fb.black === 4) return ctx.commit(s, me); s.turn = 1 - me; ctx.commit(s); }
      } else waiting(ctx);
      function frame(ctx, t) { return ctx.h('div', { class: 'board-frame wait-card' }, ctx.h('div', { class: 'spinner' }), ctx.h('h3', {}, t)); }
    },
  });

})();
