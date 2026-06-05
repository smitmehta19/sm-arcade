/* ============================================================
   ULTIMATE TIC-TAC-TOE — 9 boards in one; deep TTT (online)
   Your cell decides which mini-board your opponent must play next.
   Win three mini-boards in a row to take the game.
   ============================================================ */
(function () {
  const css = `
  .ut-meta{ display:grid; grid-template-columns:repeat(3,1fr); gap:6px; max-width:344px; margin:0 auto; }
  .ut-mini{ display:grid; grid-template-columns:repeat(3,1fr); gap:2px; padding:3px; border-radius:9px; background:rgba(120,90,220,.06); position:relative; }
  .ut-mini.active{ box-shadow:0 0 0 2px var(--lime); background:rgba(121,245,182,.10); }
  .ut-cell{ aspect-ratio:1; border-radius:4px; background:var(--bg-2); display:grid; place-items:center; font-family:var(--font-num); font-weight:900; font-size:15px; line-height:1; }
  .ut-cell.live{ cursor:pointer; } .ut-cell.live:hover{ box-shadow:inset 0 0 0 2px var(--violet); } .ut-cell.live:active{ transform:scale(.88); }
  .ut-cell.p0{ color:var(--p1); } .ut-cell.p1{ color:var(--p2); }
  .ut-ov{ position:absolute; inset:0; display:grid; place-items:center; font-family:var(--font-num); font-weight:900; font-size:52px; border-radius:9px; pointer-events:none; }
  .ut-ov.p0{ background:rgba(0,240,255,.16); color:var(--p1); } .ut-ov.p1{ background:rgba(255,47,166,.16); color:var(--p2); } .ut-ov.draw{ background:rgba(255,255,255,.06); color:var(--ink-faint); font-size:30px; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const waiting = (ctx, who) => ctx.msg(`Waiting for ${who || ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');
  const clone = o => JSON.parse(JSON.stringify(o));
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const miniWin = (cells, p) => LINES.some(l => l.every(i => cells[i] === p));
  function utWonBoard(cells) { if (miniWin(cells, 0)) return 0; if (miniWin(cells, 1)) return 1; return cells.every(c => c != null) ? 'draw' : null; }
  const utMetaWin = (won, p) => LINES.some(l => l.every(i => won[i] === p));
  function utLegal(state, mini, cell) {
    if (state.won[mini] != null) return false;
    if (state.boards[mini][cell] != null) return false;
    if (state.active != null && state.active !== mini) return false;
    return true;
  }
  function utApply(state, seat, mini, cell) {
    const s = clone(state);
    s.boards[mini][cell] = seat;
    s.won[mini] = utWonBoard(s.boards[mini]);
    s.active = (s.won[cell] != null) ? null : cell;       // send opponent to that board (free if it's decided)
    s.turn = 1 - seat;
    let winner;
    if (utMetaWin(s.won, seat)) winner = seat;
    else if (s.won.every(w => w != null)) {               // all decided, no line → most mini-boards wins
      const a = s.won.filter(w => w === 0).length, b = s.won.filter(w => w === 1).length;
      winner = a === b ? 'draw' : (a > b ? 0 : 1);
    }
    return { next: s, winner };
  }

  Games.register({
    id: 'ultimate-ttt', name: 'Ultimate Tic-Tac-Toe', emoji: '⌗', category: 'Strategy', accent: '#9b7bff',
    tagline: '9 boards. One mind game.',
    test: { apply: utApply, legal: utLegal, metaWin: utMetaWin },
    init: host => ({ boards: Array.from({ length: 9 }, () => Array(9).fill(null)), won: Array(9).fill(null), active: null, turn: host, host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me, MARK = ['✕', '◯'];
      ctx.root.append(ctx.turnBar());
      const meta = ctx.h('div', { class: 'ut-meta' });
      for (let m = 0; m < 9; m++) {
        const isActive = ctx.isMyTurn && st.won[m] == null && (st.active === m || st.active == null);
        const mini = ctx.h('div', { class: 'ut-mini' + (isActive && st.active === m ? ' active' : '') });
        for (let c = 0; c < 9; c++) {
          const v = st.boards[m][c], live = ctx.isMyTurn && utLegal(st, m, c);
          const cell = ctx.h('div', { class: 'ut-cell' + (v != null ? ' p' + v : '') + (live ? ' live' : '') }, v != null ? MARK[v] : '');
          if (live) cell.onclick = () => play(m, c);
          mini.append(cell);
        }
        if (st.won[m] != null) mini.append(ctx.h('div', { class: 'ut-ov ' + (st.won[m] === 'draw' ? 'draw' : 'p' + st.won[m]) }, st.won[m] === 'draw' ? '–' : MARK[st.won[m]]));
        meta.append(mini);
      }
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, meta));
      ctx.isMyTurn ? ctx.msg(st.active != null ? 'Play in the highlighted board' : 'Free move — play in any open board', ctx.players[me].color) : waiting(ctx);
      function play(m, c) { const { next, winner } = utApply(st, me, m, c); ctx.sound.place(); ctx.commit(next, winner); }
    },
  });
})();
