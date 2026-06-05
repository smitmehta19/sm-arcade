/* ============================================================
   ABSTRACT — Onitama (online, turn-based, card-driven chess)
   ============================================================ */
(function () {
  const css = `
  .on-wrap{ max-width:330px; margin:0 auto; }
  .on-board{ display:grid; grid-template-columns:repeat(5,1fr); gap:3px; background:rgba(120,90,220,.08); padding:5px; border-radius:12px; }
  .on-cell{ aspect-ratio:1; border-radius:6px; background:var(--bg-2); display:grid; place-items:center; position:relative; }
  .on-cell.temple0{ box-shadow:inset 0 0 0 2px rgba(47,230,255,.45); }
  .on-cell.temple1{ box-shadow:inset 0 0 0 2px rgba(255,47,166,.45); }
  .on-cell.sel{ box-shadow:inset 0 0 0 3px var(--gold); }
  .on-cell.live{ cursor:pointer; box-shadow:inset 0 0 0 3px var(--lime); } .on-cell.live:active{ transform:scale(.93); }
  .on-pawn{ width:62%; height:62%; border-radius:50%; }
  .on-pawn.p0{ background:radial-gradient(circle at 35% 30%, #bff6ff, var(--p1)); box-shadow:0 0 8px var(--p1); }
  .on-pawn.p1{ background:radial-gradient(circle at 35% 30%, #ffc6e0, var(--p2)); box-shadow:0 0 8px var(--p2); }
  .on-pawn.master{ box-shadow:0 0 0 3px var(--gold), 0 0 10px var(--gold); }
  .on-pawn.movable{ cursor:pointer; outline:2px dashed rgba(255,255,255,.45); outline-offset:1px; }
  .on-cards{ display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
  .on-cardwrap{ padding:6px; border-radius:10px; background:var(--panel-2); border:1px solid var(--glass-brd); }
  .on-cardwrap.live{ cursor:pointer; } .on-cardwrap.live:active{ transform:scale(.96); }
  .on-cardwrap.sel{ border-color:var(--gold); box-shadow:0 0 10px var(--gold); }
  .on-cardwrap.neutral{ opacity:.85; border-style:dashed; }
  .on-card{ display:grid; grid-template-columns:repeat(5,1fr); gap:1px; width:58px; }
  .on-card.sm{ width:44px; }
  .on-cc{ aspect-ratio:1; border-radius:2px; background:var(--bg); }
  .on-cc.ctr{ background:var(--ink-dim); } .on-cc.mv{ background:var(--violet); }
  .on-cname{ text-align:center; font-size:10px; color:var(--ink-dim); margin-top:3px; text-transform:capitalize; }
  .on-side{ font-size:11px; color:var(--ink-dim); text-align:center; margin:8px 0 4px; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const rint = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const waiting = (ctx, who) => ctx.msg(`Waiting for ${who || ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');

  // Movement offsets from player 0's view (forward = up = negative row). 16 standard cards.
  const CARDS = {
    tiger: [[-2, 0], [1, 0]], crab: [[-1, 0], [0, -2], [0, 2]], monkey: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
    crane: [[-1, 0], [1, -1], [1, 1]], dragon: [[-1, -2], [-1, 2], [1, -1], [1, 1]], elephant: [[-1, -1], [-1, 1], [0, -1], [0, 1]],
    mantis: [[-1, -1], [-1, 1], [1, 0]], boar: [[-1, 0], [0, -1], [0, 1]], frog: [[-1, -1], [0, -2], [1, 1]],
    rabbit: [[-1, 1], [0, 2], [1, -1]], goose: [[-1, -1], [0, -1], [0, 1], [1, 1]], rooster: [[-1, 1], [0, 1], [0, -1], [1, -1]],
    horse: [[-1, 0], [0, -1], [1, 0]], ox: [[-1, 0], [0, 1], [1, 0]], eel: [[-1, -1], [1, -1], [0, 1]], cobra: [[-1, 1], [1, 1], [0, -1]],
  };
  const TEMPLE = [[0, 2], [4, 2]]; // square a player must reach to win (opponent's master start). seat 0 → top (0,2), seat 1 → bottom (4,2)
  const offsetsFor = (name, seat) => seat === 0 ? CARDS[name] : CARDS[name].map(([a, b]) => [-a, -b]);
  function onMovesFrom(board, r, c, name, seat) {
    const out = [];
    for (const [dr, dc] of offsetsFor(name, seat)) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 4 || nc < 0 || nc > 4) continue;
      const t = board[nr][nc]; if (t && t.p === seat) continue;
      out.push([nr, nc]);
    }
    return out;
  }
  function onAllMoves(state, seat) {
    const out = [];
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
      const pc = state.board[r][c]; if (!pc || pc.p !== seat) continue;
      for (const card of state.hands[seat]) for (const [nr, nc] of onMovesFrom(state.board, r, c, card, seat))
        out.push({ card, from: [r, c], to: [nr, nc], capture: !!state.board[nr][nc] });
    }
    return out;
  }
  function onApply(state, mv, seat) {
    const s = JSON.parse(JSON.stringify(state));
    const swap = card => { const hi = s.hands[seat].indexOf(card); s.hands[seat][hi] = s.neutral; s.neutral = card; };
    if (mv.pass) { swap(mv.card); s.turn = 1 - seat; return { next: s, winner: undefined }; }
    const [fr, fc] = mv.from, [tr, tc] = mv.to;
    const piece = s.board[fr][fc], captured = s.board[tr][tc];
    s.board[tr][tc] = piece; s.board[fr][fc] = null; swap(mv.card);
    let winner;
    if (piece.m && tr === TEMPLE[seat][0] && tc === TEMPLE[seat][1]) winner = seat;   // Way of the Stream
    else if (captured && captured.m) winner = seat;                                   // Way of the Stone
    if (winner === undefined) s.turn = 1 - seat;
    return { next: s, winner };
  }

  Games.register({
    id: 'onitama', name: 'Onitama', emoji: '🐉', category: 'Strategy', accent: '#79f5b6',
    tagline: 'Move-cards duel on a 5×5.',
    test: { allMoves: onAllMoves, apply: onApply },   // exposed for the headless harness
    init: host => {
      const pick = shuffle(Object.keys(CARDS).slice()).slice(0, 5);
      const board = Array.from({ length: 5 }, () => Array(5).fill(null));
      for (let c = 0; c < 5; c++) { board[0][c] = { p: 1, m: c === 2 }; board[4][c] = { p: 0, m: c === 2 }; }
      return { board, hands: [[pick[0], pick[1]], [pick[2], pick[3]]], neutral: pick[4], turn: host, host };
    },
    render(ctx) {
      const st = ctx.state, me = ctx.me;
      ctx.root.append(ctx.turnBar());
      const pane = ctx.h('div', {}); ctx.root.append(pane);
      let selCard = null, selPiece = null;
      const noMoves = ctx.isMyTurn && onAllMoves(st, me).length === 0;

      function cardEl(name, seat, opts) {
        const offs = offsetsFor(name, seat);
        const grid = ctx.h('div', { class: 'on-card' + (opts.small ? ' sm' : '') });
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
          const ctr = r === 2 && c === 2, mv = offs.some(([dr, dc]) => dr === r - 2 && dc === c - 2);
          grid.append(ctx.h('div', { class: 'on-cc' + (ctr ? ' ctr' : '') + (mv ? ' mv' : '') }));
        }
        const wrap = ctx.h('div', { class: 'on-cardwrap' + (opts.sel ? ' sel' : '') + (opts.live ? ' live' : '') + (opts.neutral ? ' neutral' : '') }, grid, ctx.h('div', { class: 'on-cname' }, name));
        if (opts.onclick) wrap.onclick = opts.onclick;
        return wrap;
      }

      function draw() {
        pane.innerHTML = '';
        const dests = (selCard && selPiece) ? onMovesFrom(st.board, selPiece[0], selPiece[1], selCard, me) : [];
        const board = ctx.h('div', { class: 'on-board' });
        for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
          const pc = st.board[r][c];
          const cell = ctx.h('div', { class: 'on-cell' + (r === 0 && c === 2 ? ' temple0' : '') + (r === 4 && c === 2 ? ' temple1' : '') + (selPiece && selPiece[0] === r && selPiece[1] === c ? ' sel' : '') });
          if (dests.some(([dr, dc]) => dr === r && dc === c)) { cell.classList.add('live'); cell.onclick = () => doMove(selCard, selPiece, [r, c]); }
          if (pc) {
            const movable = ctx.isMyTurn && selCard && pc.p === me && onMovesFrom(st.board, r, c, selCard, me).length > 0;
            const pawn = ctx.h('div', { class: 'on-pawn p' + pc.p + (pc.m ? ' master' : '') + (movable ? ' movable' : '') });
            if (movable) pawn.onclick = () => { selPiece = [r, c]; draw(); };
            cell.append(pawn);
          }
          board.append(cell);
        }
        const cards = ctx.h('div', {});
        cards.append(ctx.h('div', { class: 'on-side' }, `${ctx.players[1 - me].name}'s cards`));
        cards.append(ctx.h('div', { class: 'on-cards' }, st.hands[1 - me].map(n => cardEl(n, 1 - me, { small: true }))));
        cards.append(ctx.h('div', { class: 'on-side' }, 'next card ↔ (rotates in when used)'));
        cards.append(ctx.h('div', { class: 'on-cards' }, cardEl(st.neutral, me, { small: true, neutral: true })));
        cards.append(ctx.h('div', { class: 'on-side' }, 'Your cards' + (noMoves ? ' — no moves, tap one to pass it' : (selCard ? '' : ' — tap one to choose a move'))));
        cards.append(ctx.h('div', { class: 'on-cards' }, st.hands[me].map(n => cardEl(n, me, {
          live: ctx.isMyTurn, sel: selCard === n,
          onclick: ctx.isMyTurn ? () => { if (noMoves) return passCard(n); selCard = n; selPiece = null; ctx.sound.tap(); draw(); } : null,
        }))));
        pane.append(ctx.h('div', { class: 'on-wrap board-frame' }, board, cards));
      }
      draw();
      ctx.isMyTurn ? ctx.msg(noMoves ? 'No legal moves — pass a card' : (selCard ? 'Pick a piece, then its destination' : 'Tap a card to start your move'), ctx.players[me].color) : waiting(ctx, ctx.seat(st.turn).name);

      function doMove(card, from, to) { const { next, winner } = onApply(st, { card, from, to }, me); ctx.sound.move(); ctx.commit(next, winner); }
      function passCard(card) { const { next } = onApply(st, { pass: true, card }, me); ctx.sound.tap(); ctx.commit(next); }
    },
  });
})();
