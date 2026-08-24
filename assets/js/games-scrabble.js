/* ============================================================
   SCRABBLE — full 15×15 board, premium squares, tile bag, blanks,
   cross-word validation, bingo bonus, exchange/pass, end-game count.

   Dictionary: the ENABLE tournament list (168,551 words) in
   words-scrabble.js, LAZY-LOADED the first time a Scrabble game opens
   so the other 38 games never pay for it. Until it lands (usually a
   blink, and the service worker caches it after that) validation falls
   back to the arcade's small common-word DICT. A word the dictionary
   doesn't know can still be played with a confirm tap — no list is
   perfect and we'd rather not referee a couple.

   Hidden info (racks + bag) lives in the shared state, same trade-off
   as battleship/liars-dice (CONTEXT gotcha #7): the UI hides it.
   ============================================================ */
(function () {
  const css = `
  .sc-wrap{ display:flex; flex-direction:column; gap:9px; }
  .sc-top{ display:flex; align-items:center; justify-content:space-between; font-size:11.5px; color:var(--ink-dim); gap:8px; }
  .sc-top .bag{ font-family:var(--font-num); font-weight:800; color:var(--ink); }
  .sc-top .last{ text-align:right; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sc-board{ display:grid; grid-template-columns:repeat(15,minmax(0,1fr)); grid-template-rows:repeat(15,minmax(0,1fr));
    gap:1px; aspect-ratio:1; width:100%; padding:2px; border-radius:9px; background:rgba(150,170,230,.18); touch-action:manipulation; }
  .sc-c{ position:relative; min-width:0; overflow:hidden; background:#131a2f; border-radius:1.5px; display:grid; place-items:center;
    font-size:5.4px; line-height:1; color:rgba(255,255,255,.5); font-family:var(--font-display); letter-spacing:.2px; }
  .sc-c.tw{ background:#8e2547; color:#ffd9e4; } .sc-c.dw{ background:#a8496a; color:#ffe6ee; }
  .sc-c.tl{ background:#1a4f86; color:#d6ecff; } .sc-c.dl{ background:#2f7ec0; color:#e8f5ff; }
  .sc-c.ctr{ background:#a8496a; color:#ffe6ee; font-size:9px; }
  .sc-c.live{ box-shadow:inset 0 0 0 1px rgba(121,245,182,.6); }
  .sc-c.last{ box-shadow:inset 0 0 0 1.5px var(--gold); }
  .sc-t{ position:absolute; inset:0; border-radius:2px; display:grid; place-items:center;
    background:linear-gradient(160deg,#f7f0dc,#e2d6b8); color:#1a1430;
    font-family:var(--font-ui); font-weight:800; font-size:10.5px; box-shadow:0 1px 2px rgba(0,0,0,.5); }
  .sc-t .v{ position:absolute; right:1px; bottom:0; font-size:5.5px; font-weight:700; opacity:.7; }
  .sc-t.blank{ color:#7a3f8f; }
  .sc-t.pend{ background:linear-gradient(160deg,#bdf5d8,#7fe0ae); box-shadow:0 0 7px rgba(121,245,182,.8); }
  @media(min-width:520px){ .sc-c{ font-size:7px; } .sc-t{ font-size:15px; } .sc-t .v{ font-size:7px; } .sc-c.ctr{ font-size:12px; } }
  .sc-rack{ display:flex; gap:5px; justify-content:center; flex-wrap:wrap; padding:8px; border-radius:12px;
    background:rgba(0,0,0,.3); border:1px solid var(--glass-brd); min-height:56px; }
  .sc-rt{ position:relative; width:38px; height:42px; border-radius:5px; border:none;
    background:linear-gradient(160deg,#f7f0dc,#e2d6b8); color:#1a1430; font-family:var(--font-ui);
    font-weight:800; font-size:19px; box-shadow:0 2px 5px rgba(0,0,0,.5);
    transition:transform .12s var(--ease), box-shadow .18s; }
  .sc-rt .v{ position:absolute; right:3px; bottom:1px; font-size:9px; font-weight:700; opacity:.7; }
  .sc-rt.sel{ transform:translateY(-7px); box-shadow:0 0 0 2px var(--lime), 0 5px 12px rgba(0,0,0,.5); }
  .sc-rt.used{ opacity:.25; } .sc-rt.ex{ box-shadow:0 0 0 2px var(--magenta); }
  .sc-rt:active{ transform:scale(.92); }
  .sc-acts{ display:flex; gap:6px; flex-wrap:wrap; justify-content:center; }
  .sc-acts .btn{ padding:9px 13px; font-size:12.5px; }
  .sc-msgline{ text-align:center; font-size:12px; color:var(--ink-dim); min-height:16px; line-height:1.5; }
  .sc-msgline b{ color:var(--lime); }
  .sc-blank{ position:fixed; inset:0; z-index:140; display:grid; place-items:center; padding:18px;
    background:rgba(4,5,12,.8); backdrop-filter:blur(8px); }
  .sc-blank .card{ background:var(--panel-2); border:1px solid var(--glass-brd); border-radius:20px;
    padding:18px; max-width:340px; width:100%; text-align:center; }
  .sc-letters{ display:grid; grid-template-columns:repeat(7,1fr); gap:5px; margin-top:12px; }
  .sc-letters button{ padding:9px 0; border-radius:8px; background:var(--bg-2); border:1px solid var(--line);
    color:var(--ink); font-weight:800; font-size:14px; }
  .sc-letters button:active{ border-color:var(--violet); }
  .sc-final{ font-size:13px; color:var(--ink-dim); text-align:center; line-height:1.7; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const N = 15, CENTER = 112;                       // row 7, col 7
  const VAL = { A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10,'_':0 };
  const DIST = { A:9,B:2,C:2,D:4,E:12,F:2,G:3,H:2,I:9,J:1,K:1,L:4,M:2,N:6,O:8,P:2,Q:1,R:6,S:4,T:6,U:4,V:2,W:2,X:1,Y:2,Z:1,'_':2 };
  // T = triple word · D = double word · t = triple letter · d = double letter · * = centre
  const PREM =
    'T..d...T...d..T' + '.D...t...t...D.' + '..D...d.d...D..' + 'd..D...d...D..d' +
    '....D.....D....' + '.t...t...t...t.' + '..d...d.d...d..' + 'T..d...*...d..T' +
    '..d...d.d...d..' + '.t...t...t...t.' + '....D.....D....' + 'd..D...d...D..d' +
    '..D...d.d...D..' + '.D...t...t...D.' + 'T..d...T...d..T';
  // ENABLE dates from 1997; these entered later official lists and are too
  // useful to leave out. The fallback set is only for when the big list
  // hasn't loaded yet (the arcade's DICT starts at 3 letters).
  const EXTRA = new Set(['qi', 'za', 'ok', 'ew', 'zen', 'emoji', 'twerk']);
  const TWO_FALLBACK = new Set(('aa ab ad ae ag ah ai al am an ar as at aw ax ay ba be bi bo by de do ed ef eh el em en er es et ex fa ' +
    'fe go ha he hi hm ho id if in is it jo ka ki la li lo ma me mi mm mo mu my na ne no nu od oe of oh oi om on op or os ow ox oy pa ' +
    'pe pi qi re sh si so ta ti to uh um un up us ut we wo xi xu ya ye yo za ok ew').split(' '));

  /* ---- the big dictionary loads only when Scrabble is actually opened ---- */
  let dictLoading = false;
  const dictReady = () => !!window.SCRABBLE_DICT;
  function loadDict(then) {
    if (dictReady() || dictLoading) { if (dictReady() && then) then(); return; }
    dictLoading = true;
    const s = document.createElement('script');
    s.src = 'assets/js/words-scrabble.js';
    s.onload = () => { dictLoading = false; if (then) then(); };
    s.onerror = () => { dictLoading = false; };      // stays on the small DICT
    document.head.append(s);
  }
  function isWord(w) {
    w = String(w || '').toLowerCase();
    if (w.length < 2) return false;
    if (EXTRA.has(w)) return true;
    if (window.SCRABBLE_DICT) return SCRABBLE_DICT.has(w);
    return w.length === 2 ? TWO_FALLBACK.has(w) : !!(window.DICT && DICT.has(w));
  }

  function freshBag() {
    const b = [];
    for (const l in DIST) for (let i = 0; i < DIST[l]; i++) b.push(l);
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }
  const rowOf = i => Math.floor(i / N), colOf = i => i % N;

  /* ---------- pure move logic (exposed for the test harness) ---------- */
  // walks out from i in both directions along `step` (1 = across, 15 = down)
  function wordAt(board, i, step) {
    let s = i;
    while (true) {
      const p = s - step;
      if (p < 0 || !board[p]) break;
      if (step === 1 && rowOf(p) !== rowOf(s)) break;
      s = p;
    }
    const cells = []; let w = '', k = s;
    while (k < 225 && board[k]) {
      if (step === 1 && rowOf(k) !== rowOf(s)) break;
      cells.push(k); w += board[k].l; k += step;
    }
    return { cells, word: w };
  }
  // placements: [{i, l, blank}] → { err } | { words, board }
  function formedWords(prev, placements, firstMove) {
    if (!placements.length) return { err: 'Place at least one tile first.' };
    if (placements.some(p => prev[p.i])) return { err: 'That square is already taken.' };
    if (new Set(placements.map(p => p.i)).size !== placements.length) return { err: 'Two tiles on one square.' };
    const board = prev.slice();
    placements.forEach(p => { board[p.i] = { l: p.l, blank: !!p.blank }; });
    const rows = new Set(placements.map(p => rowOf(p.i)));
    const cols = new Set(placements.map(p => colOf(p.i)));
    if (rows.size > 1 && cols.size > 1) return { err: 'Tiles must sit in one row or one column.' };
    const step = (placements.length === 1) ? 1 : (rows.size === 1 ? 1 : N);
    const sorted = placements.map(p => p.i).sort((a, b) => a - b);
    for (let k = sorted[0]; k <= sorted[sorted.length - 1]; k += step) {
      if (!board[k]) return { err: 'Your tiles must join up — no gaps.' };
    }
    if (firstMove) {
      if (!placements.some(p => p.i === CENTER)) return { err: 'The first word must cover the ★ centre.' };
      if (placements.length < 2) return { err: 'The first word needs at least two letters.' };
    } else {
      const touches = placements.some(p => {
        const r = rowOf(p.i), c = colOf(p.i);
        return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([rr, cc]) =>
          rr >= 0 && rr < N && cc >= 0 && cc < N && prev[rr * N + cc]);
      });
      if (!touches) return { err: 'Your word must touch a tile already on the board.' };
    }
    const seen = new Set(), words = [];
    const add = (i, st) => {
      const w = wordAt(board, i, st);
      if (w.cells.length < 2) return;
      const key = st + ':' + w.cells[0];
      if (seen.has(key)) return;
      seen.add(key); words.push(w);
    };
    add(sorted[0], step);
    placements.forEach(p => add(p.i, step === 1 ? N : 1));
    if (!words.length) return { err: 'That doesn’t spell anything.' };
    return { words, board };
  }
  function evaluate(prev, placements, firstMove) {
    const f = formedWords(prev, placements, firstMove);
    if (f.err) return f;
    const placed = new Map(placements.map(p => [p.i, p]));
    let total = 0; const detail = [];
    f.words.forEach(w => {
      let sum = 0, mult = 1;
      w.cells.forEach((ci, k) => {
        const isNew = placed.has(ci);
        let v = (isNew && placed.get(ci).blank) ? 0 : (VAL[w.word[k].toUpperCase()] || 0);
        if (isNew) {
          const p = PREM[ci];
          if (p === 'd') v *= 2;
          else if (p === 't') v *= 3;
          else if (p === 'D' || p === '*') mult *= 2;
          else if (p === 'T') mult *= 3;
        }
        sum += v;
      });
      const s = sum * mult;
      detail.push({ word: w.word.toUpperCase(), score: s });
      total += s;
    });
    const bingo = placements.length === 7;
    return { words: f.words, detail, score: total + (bingo ? 50 : 0), bingo, bad: f.words.filter(w => !isWord(w.word)).map(w => w.word.toUpperCase()) };
  }

  const waiting = ctx => ctx.msg(`⏳ Waiting for ${ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');

  Games.register({
    id: 'scrabble', name: 'Scrabble', emoji: '🔠', category: 'Word', accent: '#79f5b6',
    tagline: 'Words, premiums, and a 50-point bingo.',
    test: { evaluate, formedWords, wordAt, isWord, freshBag, PREM, VAL, DIST },
    init: host => {
      const bag = freshBag();
      return {
        board: Array(225).fill(null),
        racks: [bag.splice(0, 7), bag.splice(0, 7)],
        bag, scores: [0, 0], turn: host, host,
        first: true, passes: 0, last: null, over: false,
      };
    },
    // a timed-out turn just passes cleanly (mid-turn tiles are never committed)
    skipTurn: (st, opp) => { const s = JSON.parse(JSON.stringify(st)); s.turn = opp; s.passes = (s.passes || 0) + 1; return s; },
    render(ctx) {
      const st = ctx.state, me = ctx.me;
      const myRack = (st.racks && st.racks[me]) ? st.racks[me].slice() : [];
      let sel = null;              // selected rack index
      let pending = [];            // [{i, ri, l, blank}] — ephemeral, never synced until played
      let exchanging = null;       // Set of rack indices while swapping

      ctx.root.append(ctx.turnBar({ scores: st.scores }));
      const wrap = ctx.h('div', { class: 'sc-wrap' });
      const top = ctx.h('div', { class: 'sc-top' },
        ctx.h('span', {}, '🎒 ', ctx.h('span', { class: 'bag' }, String((st.bag || []).length)), ' left'),
        ctx.h('span', { class: 'last' }, st.last ? `${ctx.players[st.last.seat].name}: ${st.last.word} +${st.last.score}` : 'First word goes on the ★'));
      const board = ctx.h('div', { class: 'sc-board' });
      const cells = [];
      for (let i = 0; i < 225; i++) {
        const p = PREM[i];
        const klass = p === 'T' ? ' tw' : p === 'D' ? ' dw' : p === 't' ? ' tl' : p === 'd' ? ' dl' : p === '*' ? ' ctr' : '';
        const isLast = !!(st.last && st.last.cells && st.last.cells.indexOf(i) >= 0);
        const c = ctx.h('div', { class: 'sc-c' + klass + (isLast ? ' last' : '') });
        const lab = p === 'T' ? 'TW' : p === 'D' ? 'DW' : p === 't' ? 'TL' : p === 'd' ? 'DL' : p === '*' ? '★' : '';
        if (lab) c.append(document.createTextNode(lab));
        cells.push(c); board.append(c);
      }
      const rack = ctx.h('div', { class: 'sc-rack' });
      const line = ctx.h('div', { class: 'sc-msgline' });
      const acts = ctx.h('div', { class: 'sc-acts' });
      wrap.append(top, board, rack, line, acts);
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, wrap));

      if (st.over) {
        const w = st.scores[0] === st.scores[1] ? null : (st.scores[0] > st.scores[1] ? 0 : 1);
        paintBoard();
        line.innerHTML = '';
        line.append(ctx.h('div', { class: 'sc-final' },
          w == null ? `Dead heat — ${st.scores[0]} apiece 🤝` : `${ctx.players[w].name} wins it ${Math.max(st.scores[0], st.scores[1])}–${Math.min(st.scores[0], st.scores[1])} 🏆`));
        return;
      }
      // pull the full word list in the background the first time we play
      if (!dictReady()) loadDict(() => { if (ctx.isMyTurn) paintActs(); });

      paintBoard(); paintRack(); paintActs();
      if (!ctx.isMyTurn) { waiting(ctx); return; }
      ctx.msg('Your turn — spell something good', ctx.players[me].color);

      function paintBoard() {
        for (let i = 0; i < 225; i++) {
          const c = cells[i];
          const old = c.querySelector('.sc-t'); if (old) old.remove();
          c.classList.remove('live');
          c.onclick = null;
          const onB = st.board[i];
          const pen = pending.find(p => p.i === i);
          const t = onB || (pen ? { l: pen.l, blank: pen.blank } : null);
          if (t) {
            const el = ctx.h('div', { class: 'sc-t' + (t.blank ? ' blank' : '') + (pen ? ' pend' : '') }, t.l);
            if (!t.blank) el.append(ctx.h('span', { class: 'v' }, String(VAL[t.l] || 0)));
            c.append(el);
          }
          if (!ctx.isMyTurn || st.over) continue;
          if (pen) { c.classList.add('live'); c.onclick = () => { pending = pending.filter(p => p.i !== i); repaint(); ctx.sound.tap(); }; }
          else if (!onB && sel != null) { c.classList.add('live'); c.onclick = () => place(i); }
        }
      }
      function paintRack() {
        rack.innerHTML = '';
        if (!ctx.isMyTurn) { rack.append(ctx.h('div', { style: 'color:var(--ink-faint);font-size:12px;align-self:center' }, `${ctx.seat(1 - me).name} is thinking…`)); return; }
        myRack.forEach((l, ri) => {
          const used = pending.some(p => p.ri === ri);
          const isEx = !!(exchanging && exchanging.has(ri));
          const b = ctx.h('button', { class: 'sc-rt' + (sel === ri ? ' sel' : '') + (used ? ' used' : '') + (isEx ? ' ex' : '') }, l === '_' ? '?' : l);
          if (l !== '_') b.append(ctx.h('span', { class: 'v' }, String(VAL[l] || 0)));
          b.onclick = () => {
            if (exchanging) { isEx ? exchanging.delete(ri) : exchanging.add(ri); repaint(); ctx.sound.tap(); return; }
            if (used) return;
            sel = (sel === ri) ? null : ri; repaint(); ctx.sound.tap();
          };
          rack.append(b);
        });
      }
      function paintActs() {
        acts.innerHTML = '';
        if (!ctx.isMyTurn || st.over) return;
        if (exchanging) {
          acts.append(
            ctx.h('button', { class: 'btn btn-primary', onclick: doExchange }, `♻️ Swap${exchanging.size ? ' ' + exchanging.size : ''}`),
            ctx.h('button', { class: 'btn btn-ghost', onclick: () => { exchanging = null; repaint(); } }, 'Cancel'));
          line.textContent = 'Tap the tiles you want to trade in.';
          return;
        }
        acts.append(ctx.h('button', { class: 'btn btn-primary', onclick: submit }, '✓ Play'));
        if (pending.length) acts.append(ctx.h('button', { class: 'btn btn-ghost', onclick: () => { pending = []; sel = null; repaint(); } }, '↩ Recall'));
        acts.append(ctx.h('button', { class: 'btn btn-ghost', onclick: shuffleRack }, '🔀'));
        if ((st.bag || []).length >= 7) acts.append(ctx.h('button', { class: 'btn btn-ghost', onclick: () => { exchanging = new Set(); pending = []; sel = null; repaint(); } }, '♻️'));
        acts.append(ctx.h('button', { class: 'btn btn-ghost', onclick: doPass }, '⏭ Pass'));
        if (pending.length) {
          const ev = evaluate(st.board, pending, st.first);
          line.innerHTML = '';
          if (ev.err) line.textContent = ev.err;
          else line.append(ctx.h('span', {}, ev.detail.map(d => d.word).join(' · ') + ' = '), ctx.h('b', {}, String(ev.score)), ev.bingo ? ctx.h('span', {}, ' 🎉 BINGO +50') : '');
        } else if (!dictReady()) line.textContent = 'Loading the full word list…';
        else line.textContent = '';
      }
      function repaint() { paintBoard(); paintRack(); paintActs(); }

      function place(i) {
        const l = myRack[sel];
        if (l === '_') { const ri = sel; askBlank(L => { pending.push({ i, ri, l: L, blank: true }); sel = null; repaint(); ctx.sound.place(); }); return; }
        pending.push({ i, ri: sel, l, blank: false }); sel = null; repaint(); ctx.sound.place();
      }
      function askBlank(cb) {
        const back = ctx.h('div', { class: 'sc-blank', onclick: e => { if (e.target === back) back.remove(); } });
        const card = ctx.h('div', { class: 'card' }, ctx.h('div', { style: 'font-weight:700;font-size:14px' }, 'Blank tile — which letter?'));
        const grid = ctx.h('div', { class: 'sc-letters' });
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach(L => grid.append(ctx.h('button', { onclick: () => { back.remove(); cb(L); } }, L)));
        card.append(grid); back.append(card); document.body.append(back);
      }
      function shuffleRack() {
        for (let i = myRack.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [myRack[i], myRack[j]] = [myRack[j], myRack[i]]; }
        pending = []; sel = null; repaint(); ctx.sound.tap();
      }
      // ends the game when someone goes out (or after six scoreless turns)
      function finishIfDone(s, seat) {
        if (!s.racks[seat].length && !s.bag.length) {
          const opp = 1 - seat;
          const left = s.racks[opp].reduce((a, l) => a + (VAL[l] || 0), 0);
          s.scores[seat] += left; s.scores[opp] = Math.max(0, s.scores[opp] - left);
          s.over = true;
        }
        if ((s.passes || 0) >= 6) s.over = true;
        if (s.over) {
          const w = s.scores[0] === s.scores[1] ? 'draw' : (s.scores[0] > s.scores[1] ? 0 : 1);
          ctx.sound.win(); ctx.commit(s, w); return true;
        }
        return false;
      }
      function applyMove(ev) {
        const s = ctx.clone(st);
        pending.forEach(p => { s.board[p.i] = { l: p.l, blank: !!p.blank }; });
        const used = new Set(pending.map(p => p.ri));
        s.racks[me] = myRack.filter((_, ri) => !used.has(ri));
        while (s.racks[me].length < 7 && s.bag.length) s.racks[me].push(s.bag.shift());
        s.scores[me] += ev.score;
        s.first = false; s.passes = 0;
        s.last = { word: ev.detail.map(d => d.word).join('+'), score: ev.score, cells: pending.map(p => p.i), seat: me };
        s.turn = 1 - me;
        ctx.sound.good();
        if (!finishIfDone(s, me)) ctx.commit(s);
      }
      function submit() {
        if (!pending.length) { ctx.sound.bad(); line.textContent = 'Place some tiles first.'; return; }
        const ev = evaluate(st.board, pending, st.first);
        if (ev.err) { ctx.sound.bad(); line.textContent = ev.err; return; }
        if (ev.bad.length) {
          ctx.sound.bad();
          line.innerHTML = '';
          line.append(ctx.h('div', {}, `“${ev.bad.join(', ')}” isn’t in the dictionary.`),
            ctx.h('div', { class: 'sc-acts', style: 'margin-top:7px' },
              ctx.h('button', { class: 'btn btn-sm btn-ghost', onclick: () => applyMove(ev) }, '🤝 Play it anyway'),
              ctx.h('button', { class: 'btn btn-sm btn-ghost', onclick: () => { pending = []; sel = null; repaint(); } }, 'Take it back')));
          return;
        }
        applyMove(ev);
      }
      function doPass() {
        const s = ctx.clone(st);
        s.passes = (s.passes || 0) + 1; s.turn = 1 - me;
        ctx.sound.tap();
        if (!finishIfDone(s, me)) ctx.commit(s);
      }
      function doExchange() {
        if (!exchanging.size) { ctx.sound.bad(); return; }
        const s = ctx.clone(st);
        const back = [];
        [...exchanging].sort((a, b) => b - a).forEach(ri => { back.push(s.racks[me][ri]); s.racks[me].splice(ri, 1); });
        while (s.racks[me].length < 7 && s.bag.length) s.racks[me].push(s.bag.shift());
        s.bag = s.bag.concat(back);
        for (let i = s.bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s.bag[i], s.bag[j]] = [s.bag[j], s.bag[i]]; }
        s.passes = (s.passes || 0) + 1; s.turn = 1 - me;
        exchanging = null; ctx.sound.move();
        if (!finishIfDone(s, me)) ctx.commit(s);
      }
    },
  });
})();
