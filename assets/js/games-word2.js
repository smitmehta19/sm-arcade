/* ============================================================
   WORD GAMES 2 — Letterpress (territory) + Codenames Duet (co-op)
   ============================================================ */
(function () {
  const css = `
  .lp-grid{ display:grid; grid-template-columns:repeat(5,1fr); gap:5px; max-width:330px; margin:0 auto; }
  .lp-cell{ aspect-ratio:1; border-radius:10px; display:grid; place-items:center; font-family:var(--font-num); font-weight:900; font-size:22px; text-transform:uppercase;
    background:var(--bg-2); border:1px solid var(--line); color:var(--ink); position:relative; }
  .lp-cell.live{ cursor:pointer; } .lp-cell.live:active{ transform:scale(.92); }
  .lp-cell.p0{ background:rgba(0,240,255,.22); border-color:var(--p1); color:#cffaff; }
  .lp-cell.p1{ background:rgba(255,47,166,.22); border-color:var(--p2); color:#ffd9ee; }
  .lp-cell.p0.def{ background:rgba(0,240,255,.5); } .lp-cell.p1.def{ background:rgba(255,47,166,.5); }
  .lp-cell.sel{ box-shadow:0 0 0 3px var(--gold); }
  .lp-cell .ord{ position:absolute; top:-6px; right:-4px; width:16px; height:16px; border-radius:8px; background:var(--gold); color:#06070f; font-size:10px; display:grid; place-items:center; }
  .lp-word{ text-align:center; font-family:var(--font-num); font-weight:900; font-size:26px; letter-spacing:4px; min-height:34px; text-transform:uppercase; color:var(--violet); }
  .lp-log{ margin-top:14px; border-top:1px solid var(--line); padding-top:10px; }
  .lp-log-h{ font-size:11px; color:var(--ink-dim); text-transform:uppercase; letter-spacing:.6px; margin-bottom:7px; text-align:center; }
  .lp-plays{ display:flex; flex-wrap:wrap; gap:6px; justify-content:center; }
  .lp-play{ font-family:var(--font-num); font-weight:800; font-size:13px; letter-spacing:1.5px; text-transform:uppercase; padding:4px 10px; border-radius:9px; border:1px solid var(--line); }
  .lp-play.p0{ background:rgba(0,240,255,.16); border-color:var(--p1); color:#cffaff; }
  .lp-play.p1{ background:rgba(255,47,166,.16); border-color:var(--p2); color:#ffd9ee; }

  .cn-grid{ display:grid; grid-template-columns:repeat(5,1fr); gap:5px; }
  .cn-cell{ aspect-ratio:1.5; border-radius:8px; display:grid; place-items:center; text-align:center; font-size:10px; font-weight:700; padding:2px; line-height:1.1;
    background:var(--panel-2); border:1px solid var(--line); color:var(--ink); text-transform:uppercase; }
  .cn-cell.live{ cursor:pointer; } .cn-cell.live:active{ transform:scale(.94); }
  .cn-cell.agent{ outline:2px solid #2ea043; } .cn-cell.assassin{ outline:2px solid #ff2f2f; } .cn-cell.bystander{ outline:2px dashed var(--ink-faint); }
  .cn-cell.r-agent{ background:#2ea043; color:#fff; border-color:transparent; } .cn-cell.r-assassin{ background:#1a1a1a; color:#ff5d5d; border-color:#ff2f2f; } .cn-cell.r-bystander{ background:var(--bg-2); color:var(--ink-faint); }
  .cn-clue{ text-align:center; font-size:15px; margin:8px 0; } .cn-clue b{ font-family:var(--font-num); color:var(--gold); font-size:20px; }
  .cn-input{ width:100%; background:var(--bg-2); border:1px solid var(--line); border-radius:12px; padding:12px; color:var(--ink); font-size:16px; outline:none; text-transform:uppercase; }
  .cn-prog{ text-align:center; font-size:12px; color:var(--ink-dim); margin-bottom:6px; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const rint = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const waiting = (ctx, who) => ctx.msg(`Waiting for ${who || ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');

  /* ===================== LETTERPRESS ===================== */
  function lpGen() {
    const vowels = 'AEIOUAEIOUAEIOUY', cons = 'BBCCDDDFFGGHHJKLLLMMNNNPPRRRSSSTTTTVWXYZ', out = [];
    for (let i = 0; i < 9; i++) out.push(vowels[rint(vowels.length)]);
    for (let i = 0; i < 16; i++) out.push(cons[rint(cons.length)]);
    return shuffle(out);
  }
  function lpDefended(owner, i) {
    if (owner[i] == null) return false;
    const r = Math.floor(i / 5), c = i % 5, nb = [];
    if (r > 0) nb.push(i - 5); if (r < 4) nb.push(i + 5); if (c > 0) nb.push(i - 1); if (c < 4) nb.push(i + 1);
    return nb.every(j => owner[j] === owner[i]);
  }
  function lpApply(state, seat, idxs) {
    const owner = state.owner.slice();
    const def = state.owner.map((_, i) => lpDefended(state.owner, i)); // snapshot before captures
    for (const i of idxs) { if (state.owner[i] != null && def[i] && state.owner[i] !== seat) continue; owner[i] = seat; }
    return owner;
  }
  const lpEnded = owner => owner.every(o => o != null);
  const lpScore = owner => [owner.filter(o => o === 0).length, owner.filter(o => o === 1).length];
  function lpWinner(owner) { if (!lpEnded(owner)) return undefined; const s = lpScore(owner); return s[0] === s[1] ? 'draw' : (s[0] > s[1] ? 0 : 1); }
  function lpWordOk(word, played) {
    if (!window.DICT || !window.DICT.has(word)) return 'not a word';
    if (word.length < 3) return 'too short (3+)';
    if (played.includes(word)) return 'already played';
    if (played.some(p => p.length < word.length && word.startsWith(p))) return 'no extending old words';
    return 'ok';
  }
  Games.register({
    id: 'letterpress', name: 'Letterpress', emoji: '🔠', category: 'Word', accent: '#b6ff3a',
    tagline: 'Spell words, claim the board.',
    test: { defended: lpDefended, apply: lpApply, winner: lpWinner, wordOk: lpWordOk, score: lpScore },
    init: host => ({ letters: lpGen(), owner: Array(25).fill(null), turn: host, played: [], plays: [], host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me, sc = lpScore(st.owner);
      ctx.root.append(ctx.turnBar({ scores: sc }));
      const pane = ctx.h('div', { class: 'board-frame' }); ctx.root.append(pane);
      let sel = [];
      const def = st.owner.map((_, i) => lpDefended(st.owner, i));
      function draw() {
        pane.innerHTML = '';
        const wordEl = ctx.h('div', { class: 'lp-word' }, sel.map(i => st.letters[i]).join('') || '·');
        const grid = ctx.h('div', { class: 'lp-grid' });
        st.letters.forEach((ch, i) => {
          const o = st.owner[i];
          const cls = 'lp-cell' + (o != null ? ' p' + o : '') + (def[i] ? ' def' : '') + (sel.includes(i) ? ' sel' : '') + (ctx.isMyTurn ? ' live' : '');
          const cell = ctx.h('div', { class: cls }, ch);
          if (sel.includes(i)) cell.append(ctx.h('div', { class: 'ord' }, String(sel.indexOf(i) + 1)));
          if (ctx.isMyTurn) cell.onclick = () => { const k = sel.indexOf(i); if (k >= 0) sel.splice(k, 1); else sel.push(i); ctx.sound.tap(); draw(); };
          grid.append(cell);
        });
        pane.append(wordEl, grid);
        if (ctx.isMyTurn) pane.append(ctx.h('div', { class: 'btn-row mt' },
          ctx.h('button', { class: 'btn btn-ghost', onclick: () => { sel = []; draw(); } }, 'Clear'),
          ctx.h('button', { class: 'btn btn-primary', onclick: submit }, 'Submit word')));
        // words played so far, newest first, coloured by who played them
        const plays = st.plays || [];
        if (plays.length) {
          const log = ctx.h('div', { class: 'lp-log' }, ctx.h('div', { class: 'lp-log-h' }, 'Words played'));
          const list = ctx.h('div', { class: 'lp-plays' });
          plays.slice().reverse().forEach(p => list.append(ctx.h('div', { class: 'lp-play p' + p.s, title: ctx.players[p.s].name }, p.w)));
          log.append(list);
          pane.append(log);
        }
      }
      draw();
      ctx.isMyTurn ? ctx.msg('Tap tiles to spell a word (3+). Surround tiles to lock them 🔒', ctx.players[me].color) : waiting(ctx, ctx.seat(st.turn).name);
      function submit() {
        const word = sel.map(i => st.letters[i]).join('').toLowerCase();
        const why = lpWordOk(word, st.played);
        if (why !== 'ok') { ctx.sound.bad(); ctx.msg('✕ ' + why, 'var(--gold)'); return; }
        const s = ctx.clone(st); s.owner = lpApply(st, me, sel); s.played = st.played.concat([word]);
        s.plays = (st.plays || []).concat([{ w: word.toUpperCase(), s: me }]); ctx.sound.good();
        const w = lpWinner(s.owner); if (w !== undefined) return ctx.commit(s, w);
        s.turn = 1 - me; ctx.commit(s);
      }
    },
  });

  /* ===================== CODENAMES DUET (co-op) ===================== */
  const CN_WORDS = ('apple band bank bar beach bear bell belt bird block board bolt bomb bond book boot bottle box bridge brush bug button cake camp cap card cat cell chair chalk check chest cliff cloud club coat code cold comb cook cord crown cup date day death deck dice disk dog door dragon dream dress drill drop duck ear earth egg engine eye face fair fall fan farm field fight film fire fish flag floor fly fog foot fork frog game gas gear ghost glass glove gold grass green ground hand hat head heart hook horn horse ice iron jet key king kite knife lab lake leaf life light line link lion lock log map mask match maze milk mine mint moon mouse mouth nail needle net night note nut ocean oil olive opera oven owl page paint palm park pearl pen pencil pin pipe pirate plane plate point pool port pot press queen race rain ring road robot rock root rose row salt sand school scale screen seal ship shoe shop shot sink slip smell snow soap sock space spell spider spike spring star stick storm sun swing table tail tank tape tea team tent thumb tick tie time tooth top torch tower track train tree truck tube watch wave web well wind wing witch wolf wood worm yard').toUpperCase().split(' ');
  const CN_AGENTS = 9, CN_TURNS = 9;
  function cnKey() {
    const k = []; for (let i = 0; i < CN_AGENTS; i++) k.push('agent'); for (let i = 0; i < 3; i++) k.push('assassin'); while (k.length < 25) k.push('bystander');
    return shuffle(k);
  }
  function cnReveal(state, i) {
    const s = JSON.parse(JSON.stringify(state));
    const kind = s.key[i]; s.revealed[i] = kind;
    if (kind === 'assassin') { s.over = 'loss'; return { next: s, end: 'coop-loss' }; }
    if (kind === 'agent') { s.found++; if (s.found >= CN_AGENTS) { s.over = 'win'; return { next: s, end: 'coop-win' }; } s.guessesLeft--; if (s.guessesLeft <= 0) endTurn(s); return { next: s }; }
    // bystander
    endTurn(s); return { next: s };
  }
  // Roles are FIXED: the host always gives clues (sees the key), the other always guesses.
  // We deliberately do NOT swap s.turn — if the guesser ever became clue-giver they'd see the
  // red/assassin tiles and could avoid them on later guesses, killing the whole point of the game.
  function endTurn(s) { s.phase = 'clue'; s.clue = null; s.turnsLeft--; if (s.turnsLeft <= 0 && s.found < CN_AGENTS) s.over = 'loss'; }
  Games.register({
    id: 'codenames-duet', name: 'Codenames Duet', emoji: '🕵️', category: 'Word', accent: '#2fe6ff',
    coop: true,
    tagline: 'Co-op: find all 9 agents together.',
    test: { reveal: cnReveal, AGENTS: CN_AGENTS },
    init: host => ({ words: shuffle(CN_WORDS.slice()).slice(0, 25), key: cnKey(), revealed: Array(25).fill(null), turn: host, phase: 'clue', clue: null, found: 0, guessesLeft: 0, turnsLeft: CN_TURNS, host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me, giver = st.turn, guesser = 1 - st.turn;
      ctx.root.append(ctx.h('div', { class: 'cn-prog' }, `🕵️ Found ${st.found}/${CN_AGENTS} agents · ${st.turnsLeft} turns left${st.clue ? ' · guesses left ' + st.guessesLeft : ''}`));
      if (st.over) {                                   // co-op finished — handled by the overlay; just show the board
        const grid = ctx.h('div', { class: 'cn-grid' });
        st.words.forEach((w, i) => grid.append(ctx.h('div', { class: 'cn-cell r-' + st.key[i] }, w)));
        ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid)); return;
      }
      const iAmGiver = me === giver, showKey = iAmGiver; // only the clue-giver sees the key
      if (st.clue) ctx.root.append(ctx.h('div', { class: 'cn-clue' }, 'Clue: ', ctx.h('b', {}, `${esc(st.clue.word)} ${st.clue.num}`)));
      const grid = ctx.h('div', { class: 'cn-grid' });
      st.words.forEach((w, i) => {
        const rev = st.revealed[i];
        let cls = 'cn-cell';
        if (rev) cls += ' r-' + rev;
        else if (showKey) cls += ' ' + st.key[i];
        const canTap = !rev && st.phase === 'guess' && me === guesser;
        if (canTap) cls += ' live';
        const cell = ctx.h('div', { class: cls }, w);
        if (canTap) cell.onclick = () => guess(i);
        grid.append(cell);
      });
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid));

      if (st.phase === 'clue') {
        if (iAmGiver) {
          const inp = ctx.h('input', { class: 'cn-input', placeholder: 'one-word clue…', maxlength: '18' });
          let num = 1; const numBox = ctx.h('div', {});
          const drawNum = () => { numBox.innerHTML = ''; numBox.append(ctx.h('div', { class: 'ld-step' }, ctx.h('button', { onclick: () => { num = Math.max(1, num - 1); drawNum(); } }, '−'), ctx.h('div', { class: 'v' }, String(num)), ctx.h('button', { onclick: () => { num = Math.min(9, num + 1); drawNum(); } }, '+'))); };
          drawNum();
          ctx.root.append(ctx.h('div', { class: 'mt' }, inp), ctx.h('p', { class: 'cn-prog', style: 'margin-top:8px' }, 'How many words does it point to?'), numBox,
            ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: () => giveClue(inp.value, num) }, 'Give clue ▶'));
          ctx.msg(`You see the key — guide ${ctx.players[guesser].name} to the green agents (avoid the red!)`, ctx.players[me].color);
        } else { ctx.root.append(waitFrame(ctx, `${ctx.players[giver].name} is thinking of a clue…`)); waiting(ctx, ctx.players[giver].name); }
      } else { // guess
        if (me === guesser) {
          ctx.root.append(ctx.h('p', { class: 'cn-prog', style: 'margin-top:8px' }, 'Tap the words you think are agents. Stop before you’re unsure!'),
            ctx.h('button', { class: 'btn btn-ghost btn-block mt', onclick: () => commit(endPass(st)) }, 'Stop & pass the clue'));
          ctx.msg('Tap an agent — wrong guesses cost you', ctx.players[me].color);
        } else { ctx.root.append(waitFrame(ctx, `${ctx.players[guesser].name} is guessing…`)); waiting(ctx, ctx.players[guesser].name); }
      }
      function giveClue(word, num) {
        word = (word || '').trim(); if (!word) { ctx.sound.bad(); ctx.msg('Type a one-word clue.', 'var(--gold)'); return; }
        const s = ctx.clone(st); s.clue = { word, num }; s.phase = 'guess'; s.guessesLeft = num + 1; ctx.sound.tap(); ctx.commit(s);
      }
      function guess(i) { const r = cnReveal(st, i); ctx.sound[st.key[i] === 'agent' ? 'good' : 'bad'](); commit(r.next, r.end); }
      function endPass(s0) { const s = ctx.clone(s0); endTurn(s); return s; }
      function commit(next, end) { if (end) return ctx.commit(next, end === 'coop-win' ? 'coop-win' : 'coop-loss'); if (next.over) return ctx.commit(next, next.over === 'win' ? 'coop-win' : 'coop-loss'); ctx.commit(next); }
    },
  });
  function waitFrame(ctx, text) { return ctx.h('div', { class: 'board-frame wait-card' }, ctx.h('div', { class: 'spinner' }), ctx.h('h3', {}, text)); }
})();
