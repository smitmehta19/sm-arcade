/* ============================================================
   CHESS — full rules: castling, en passant, promotion picker,
   checkmate / stalemate / insufficient material / 50-move draw.
   Host plays White (bottom); the board flips for the other seat.
   Pieces are text glyphs (♚♛♜♝♞♟ + U+FE0E to force text
   rendering) tinted in each seat's neon colour.
   ============================================================ */
(function () {
  const css = `
  .ch{ display:grid; grid-template-columns:repeat(8,1fr); aspect-ratio:1; border-radius:12px; overflow:hidden; border:2px solid var(--line); }
  .ch-sq{ position:relative; display:grid; place-items:center; }
  .ch-sq.dark{ background:rgba(120,70,220,.18); } .ch-sq.light{ background:rgba(255,255,255,.045); }
  .ch-sq.last{ box-shadow:inset 0 0 0 100px rgba(255,214,107,.10); }
  .ch-sq.sel{ box-shadow:inset 0 0 0 3px var(--gold); }
  .ch-sq.mv::after{ content:''; position:absolute; width:26%; height:26%; border-radius:50%; background:rgba(182,255,58,.55); pointer-events:none; }
  .ch-sq.cap::after{ content:''; position:absolute; inset:6%; border-radius:50%; border:3px solid rgba(255,77,157,.75); pointer-events:none; }
  .ch-sq.chk{ box-shadow:inset 0 0 0 100px rgba(255,77,109,.28); }
  .ch-pc{ font-size:7.4vw; line-height:1; user-select:none; filter:drop-shadow(0 2px 4px rgba(0,0,0,.6)); }
  @media(min-width:520px){ .ch-pc{ font-size:37px; } }
  .ch-pc.p0{ color:var(--p1); text-shadow:0 0 9px rgba(47,230,255,.55); }
  .ch-pc.p1{ color:var(--p2); text-shadow:0 0 9px rgba(255,77,157,.55); }
  .ch-promo{ display:flex; gap:10px; justify-content:center; margin-top:12px; }
  .ch-promo button{ width:56px; height:56px; border-radius:13px; background:var(--panel-2); border:1px solid var(--gold); font-size:30px; box-shadow:0 0 14px -4px var(--gold); }
  .ch-promo button:active{ transform:scale(.9); }
  .ch-cap-row{ display:flex; gap:2px; justify-content:center; min-height:18px; font-size:14px; opacity:.8; margin-top:8px; flex-wrap:wrap; }
  .ch-cap-row .p0{ color:var(--p1); } .ch-cap-row .p1{ color:var(--p2); }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const GL = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const glyph = t => GL[t] + '︎'; // text-style variation selector — never emoji

  const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

  // white = the seat playing white; white pawns move r-- (row 7 = white home rank)
  function freshBoard(white) {
    const black = 1 - white;
    const B = Array.from({ length: 8 }, () => Array(8).fill(null));
    const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let c = 0; c < 8; c++) {
      B[0][c] = { t: back[c], p: black }; B[1][c] = { t: 'p', p: black };
      B[6][c] = { t: 'p', p: white };     B[7][c] = { t: back[c], p: white };
    }
    return B;
  }
  const dirOf = (st, p) => (p === st.white ? -1 : 1);      // pawn travel
  const homeRow = (st, p) => (p === st.white ? 6 : 1);
  const lastRow = (st, p) => (p === st.white ? 0 : 7);
  const backRank = (st, p) => (p === st.white ? 7 : 0);

  function findKing(B, p) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const x = B[r][c]; if (x && x.p === p && x.t === 'k') return [r, c]; } return null; }

  // is (r,c) attacked by seat `by`?
  function attacked(st, B, r, c, by) {
    const pd = dirOf(st, by);                               // pawns attack in their travel direction
    for (const dc of [-1, 1]) { const pr = r - pd, pc = c + dc; if (inB(pr, pc)) { const x = B[pr][pc]; if (x && x.p === by && x.t === 'p') return true; } }
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) { const nr = r + dr, nc = c + dc; if (inB(nr, nc)) { const x = B[nr][nc]; if (x && x.p === by && x.t === 'n') return true; } }
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1],[0,1],[0,-1],[1,0],[-1,0]]) {
      const diag = dr && dc; let nr = r + dr, nc = c + dc, d = 1;
      while (inB(nr, nc)) {
        const x = B[nr][nc];
        if (x) { if (x.p === by && ((x.t === 'q') || (diag && x.t === 'b') || (!diag && x.t === 'r') || (d === 1 && x.t === 'k'))) return true; break; }
        nr += dr; nc += dc; d++;
      }
    }
    return false;
  }
  const inCheck = (st, B, p) => { const k = findKing(B, p); return k ? attacked(st, B, k[0], k[1], 1 - p) : false; };

  // pseudo-legal moves for the piece at (r,c): [{r,c,ep?,castle?,dbl?}]
  function pseudo(st, B, r, c) {
    const pc = B[r][c]; if (!pc) return [];
    const out = [], p = pc.p, add = (nr, nc, x) => out.push(Object.assign({ r: nr, c: nc }, x));
    if (pc.t === 'p') {
      const d = dirOf(st, p);
      if (inB(r + d, c) && !B[r + d][c]) {
        add(r + d, c);
        if (r === homeRow(st, p) && !B[r + 2 * d][c]) add(r + 2 * d, c, { dbl: true });
      }
      for (const dc of [-1, 1]) {
        const nr = r + d, nc = c + dc; if (!inB(nr, nc)) continue;
        const x = B[nr][nc];
        if (x && x.p !== p) add(nr, nc);
        else if (!x && st.ep && st.ep[0] === nr && st.ep[1] === nc) add(nr, nc, { ep: true });
      }
      return out;
    }
    if (pc.t === 'n') { for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) { const nr = r + dr, nc = c + dc; if (inB(nr, nc) && (!B[nr][nc] || B[nr][nc].p !== p)) add(nr, nc); } return out; }
    if (pc.t === 'k') {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) { const nr = r + dr, nc = c + dc; if (inB(nr, nc) && (!B[nr][nc] || B[nr][nc].p !== p)) add(nr, nc); }
      const br = backRank(st, p), rights = st.castle[p];
      if (r === br && c === 4 && rights && !inCheck(st, B, p)) {
        if (rights.k && !B[br][5] && !B[br][6] && B[br][7] && B[br][7].t === 'r' && B[br][7].p === p &&
            !attacked(st, B, br, 5, 1 - p) && !attacked(st, B, br, 6, 1 - p)) add(br, 6, { castle: 'k' });
        if (rights.q && !B[br][3] && !B[br][2] && !B[br][1] && B[br][0] && B[br][0].t === 'r' && B[br][0].p === p &&
            !attacked(st, B, br, 3, 1 - p) && !attacked(st, B, br, 2, 1 - p)) add(br, 2, { castle: 'q' });
      }
      return out;
    }
    const rays = pc.t === 'b' ? [[-1,-1],[-1,1],[1,-1],[1,1]] : pc.t === 'r' ? [[0,1],[0,-1],[1,0],[-1,0]] : [[-1,-1],[-1,1],[1,-1],[1,1],[0,1],[0,-1],[1,0],[-1,0]];
    for (const [dr, dc] of rays) { let nr = r + dr, nc = c + dc; while (inB(nr, nc)) { const x = B[nr][nc]; if (!x) add(nr, nc); else { if (x.p !== p) add(nr, nc); break; } nr += dr; nc += dc; } }
    return out;
  }

  // apply a move to a CLONED state (promo: 'q'|'r'|'b'|'n' when a pawn promotes)
  function applyMove(st, fr, fc, m, promo) {
    const s = JSON.parse(JSON.stringify(st)), B = s.board, pc = B[fr][fc], p = pc.p;
    const wasCapture = !!B[m.r][m.c] || !!m.ep;
    if (m.ep) B[fr][m.c] = null;                             // en-passant victim sits beside the pawn
    B[m.r][m.c] = pc; B[fr][fc] = null;
    if (m.castle) { const br = backRank(s, p); if (m.castle === 'k') { B[br][5] = B[br][7]; B[br][7] = null; } else { B[br][3] = B[br][0]; B[br][0] = null; } }
    if (pc.t === 'p' && m.r === lastRow(s, p)) pc.t = promo || 'q';
    if (pc.t === 'k') s.castle[p] = { k: false, q: false };
    if (pc.t === 'r') { const br = backRank(s, p); if (fr === br && fc === 7) s.castle[p].k = false; if (fr === br && fc === 0) s.castle[p].q = false; }
    // capturing a rook on its home square kills that castling right too
    const obr = backRank(s, 1 - p);
    if (m.r === obr && m.c === 7) s.castle[1 - p].k = false;
    if (m.r === obr && m.c === 0) s.castle[1 - p].q = false;
    s.ep = m.dbl ? [(fr + m.r) / 2, fc] : null;
    s.half = (pc.t === 'p' || wasCapture) ? 0 : (s.half || 0) + 1;
    s.last = [[fr, fc], [m.r, m.c]];
    s.turn = 1 - p;
    return s;
  }
  const legal = (st, r, c) => pseudo(st, st.board, r, c).filter(m => { const s = applyMove(st, r, c, m); return !inCheck(s, s.board, st.board[r][c].p); });
  function anyLegal(st, p) { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const x = st.board[r][c]; if (x && x.p === p && legal(st, r, c).length) return true; } return false; }
  function insufficient(B) {
    const pcs = B.flat().filter(Boolean).filter(x => x.t !== 'k');
    if (!pcs.length) return true;
    if (pcs.length === 1 && (pcs[0].t === 'b' || pcs[0].t === 'n')) return true;
    if (pcs.length === 2 && pcs.every(x => x.t === 'b' || x.t === 'n') && pcs[0].p !== pcs[1].p) return true;
    return false;
  }

  Games.register({
    id: 'chess', name: 'Chess', emoji: '♞', category: 'Strategy', accent: '#eaf0ff',
    tagline: 'The royal game — checkmate to win.',
    init: host => ({ board: freshBoard(host), white: host, turn: host, castle: [{ k: true, q: true }, { k: true, q: true }], ep: null, half: 0, last: null }),
    test: { freshBoard, legal, applyMove, inCheck, anyLegal, insufficient },
    render(ctx) {
      const st = ctx.state, B = st.board, me = ctx.me;
      let sel = null, pendingPromo = null;
      const flip = me !== st.white;                          // each player sees their side at the bottom
      const captured = { 0: [], 1: [] };                     // taken pieces, derived from what's missing
      const full = { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 };
      for (const p of [0, 1]) { const have = {}; B.flat().filter(Boolean).filter(x => x.p === p).forEach(x => have[x.t] = (have[x.t] || 0) + 1); for (const t in full) for (let i = 0; i < full[t] - (have[t] || 0); i++) captured[p].push(t); }
      ctx.root.append(ctx.turnBar());
      const grid = ctx.h('div', { class: 'ch' }); const sq = Array.from({ length: 8 }, () => Array(8));
      const myCheck = inCheck(st, B, st.turn) ? findKing(B, st.turn) : null;
      for (let vr = 0; vr < 8; vr++) for (let vc = 0; vc < 8; vc++) {
        const r = flip ? 7 - vr : vr, c = flip ? 7 - vc : vc;
        const isLast = st.last && ((st.last[0][0] === r && st.last[0][1] === c) || (st.last[1][0] === r && st.last[1][1] === c));
        const cell = ctx.h('div', { class: 'ch-sq ' + ((r + c) % 2 ? 'dark' : 'light') + (isLast ? ' last' : '') + (myCheck && myCheck[0] === r && myCheck[1] === c ? ' chk' : '') });
        const pc = B[r][c]; if (pc) cell.append(ctx.h('div', { class: 'ch-pc p' + pc.p }, glyph(pc.t)));
        if (ctx.isMyTurn) cell.onclick = () => onClick(r, c);
        sq[r][c] = cell; grid.append(cell);
      }
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid));
      const capRow = ctx.h('div', { class: 'ch-cap-row' });
      captured[0].forEach(t => capRow.append(ctx.h('span', { class: 'p0' }, glyph(t))));
      captured[1].forEach(t => capRow.append(ctx.h('span', { class: 'p1' }, glyph(t))));
      ctx.root.append(capRow);
      const promoRow = ctx.h('div', { class: 'ch-promo', hidden: '' }); ctx.root.append(promoRow);

      if (!ctx.isMyTurn) { ctx.msg(`⏳ Waiting for ${ctx.seat(1 - me).name}…`, 'var(--ink-faint)'); return; }
      ctx.msg(myCheck ? '⚠ You’re in CHECK — get out of it!' : `Your turn — you’re ${me === st.white ? 'White' : 'Black'}`, myCheck ? 'var(--gold)' : ctx.players[me].color);

      function clearHi() { for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) sq[r][c].classList.remove('sel', 'mv', 'cap'); }
      function onClick(r, c) {
        if (pendingPromo) return;                            // must pick a piece first
        if (sel && (sq[r][c].classList.contains('mv') || sq[r][c].classList.contains('cap'))) return move(r, c);
        const pc = B[r][c];
        clearHi();
        if (!pc || pc.p !== me) { sel = null; return; }
        const ms = legal(st, r, c);
        if (!ms.length) { ctx.sound.bad(); sel = null; return; }
        sel = { r, c }; sq[r][c].classList.add('sel');
        ms.forEach(m => sq[m.r][m.c].classList.add((B[m.r][m.c] || m.ep) ? 'cap' : 'mv'));
        ctx.sound.tap();
      }
      function move(r, c) {
        const m = legal(st, sel.r, sel.c).find(x => x.r === r && x.c === c); if (!m) return;
        const pc = B[sel.r][sel.c];
        if (pc.t === 'p' && r === lastRow(st, me)) {         // promotion → picker
          pendingPromo = { fr: sel.r, fc: sel.c, m };
          promoRow.hidden = false; promoRow.innerHTML = '';
          ['q', 'r', 'b', 'n'].forEach(t => promoRow.append(ctx.h('button', { style: `color:${ctx.players[me].color}`, onclick: () => finish(t) }, glyph(t))));
          ctx.msg('Choose your promotion piece ✨', 'var(--gold)'); ctx.sound.good();
          return;
        }
        finish(null, m);
      }
      function finish(promo, m) {
        const mv = pendingPromo ? pendingPromo.m : m;
        const fr = pendingPromo ? pendingPromo.fr : sel.r, fc = pendingPromo ? pendingPromo.fc : sel.c;
        pendingPromo = null; promoRow.hidden = true;
        const s = applyMove(st, fr, fc, mv, promo);
        ctx.sound[(mv.ep || st.board[mv.r][mv.c]) ? 'good' : 'move']();
        const opp = 1 - me;
        if (!anyLegal(s, opp)) return ctx.commit(s, inCheck(s, s.board, opp) ? me : 'draw'); // mate or stalemate
        if (insufficient(s.board) || s.half >= 100) return ctx.commit(s, 'draw');
        ctx.commit(s);
      }
    },
  });
})();
