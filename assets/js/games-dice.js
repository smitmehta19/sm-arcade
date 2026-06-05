/* ============================================================
   DICE GAMES — Yahtzee, Liar's Dice (online, turn-based)
   ============================================================ */
(function () {
  const css = `
  .dz-die{ display:inline-grid; place-items:center; width:48px; height:48px; border-radius:11px; font-size:34px; line-height:1;
    background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); }
  .dz-die.sm{ width:38px; height:38px; font-size:27px; border-radius:9px; }
  .dz-die.held{ border-color:var(--lime); box-shadow:0 0 0 2px var(--lime), var(--glow-l); color:var(--lime); }
  .dz-die.hid{ color:var(--ink-faint); background:var(--bg-2); }
  .dz-dice{ display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin:10px 0; }
  .dz-die.live{ cursor:pointer; } .dz-die.live:active{ transform:scale(.9); }
  .dz-rolls{ text-align:center; font-size:12px; color:var(--ink-dim); margin-bottom:8px; }

  .yz-card{ width:100%; border-collapse:collapse; font-size:13px; }
  .yz-card td, .yz-card th{ padding:6px 8px; border-bottom:1px solid var(--line); text-align:center; }
  .yz-card th{ font-family:var(--font-display); font-size:11px; letter-spacing:.5px; color:var(--ink-dim); }
  .yz-card td.lbl{ text-align:left; color:var(--ink-dim); }
  .yz-card .me{ color:var(--ink); }
  .yz-cell{ font-family:var(--font-num); font-weight:900; }
  .yz-cell.live{ cursor:pointer; color:var(--violet); border:1px dashed var(--violet); border-radius:7px; }
  .yz-cell.live:active{ transform:scale(.95); }
  .yz-cell.zero{ color:var(--ink-faint); }
  .yz-tot td{ border-top:2px solid var(--glass-brd); font-family:var(--font-num); font-weight:900; font-size:15px; }
  .yz-sub{ font-size:11px; color:var(--ink-faint); }

  .ld-bid{ display:flex; align-items:center; justify-content:center; gap:10px; font-family:var(--font-num); font-weight:900; font-size:22px; margin:6px 0; }
  .ld-pill{ padding:8px 14px; border-radius:12px; background:var(--panel-2); border:1px solid var(--glass-brd); }
  .ld-step{ display:flex; align-items:center; gap:10px; justify-content:center; margin:6px 0; }
  .ld-step button{ width:42px; height:42px; border-radius:11px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-size:22px; }
  .ld-step .v{ min-width:46px; text-align:center; font-family:var(--font-num); font-weight:900; font-size:26px; }
  .ld-faces{ display:flex; gap:7px; justify-content:center; margin:10px 0; }
  .ld-faces button{ width:46px; height:46px; border-radius:11px; background:var(--panel-2); border:1px solid var(--glass-brd); font-size:30px; }
  .ld-faces button.on{ border-color:var(--violet); box-shadow:var(--glow-v); }
  .ld-label{ font-size:12px; color:var(--ink-dim); text-align:center; margin:2px 0; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const rint = n => Math.floor(Math.random() * n);
  const roll = n => Array.from({ length: n }, () => 1 + rint(6));
  const PIP = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  const waiting = (ctx, who) => ctx.msg(`Waiting for ${who || ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');

  /* ===================== YAHTZEE ===================== */
  const sum = d => d.reduce((a, b) => a + b, 0);
  const freq = d => { const f = [0, 0, 0, 0, 0, 0, 0]; d.forEach(v => f[v]++); return f; };
  const nKind = (d, n) => freq(d).some(c => c >= n);
  const fullHouse = d => { const f = freq(d); return f.some(c => c === 3) && f.some(c => c === 2); };
  const straight = (d, len) => { const s = [...new Set(d)].sort(); let run = 1, best = 1; for (let i = 1; i < s.length; i++) { if (s[i] === s[i - 1] + 1) { run++; best = Math.max(best, run); } else run = 1; } return best >= len; };
  const Y_CATS = [
    { id: 'ones', label: 'Ones', up: true, fn: d => 1 * freq(d)[1] },
    { id: 'twos', label: 'Twos', up: true, fn: d => 2 * freq(d)[2] },
    { id: 'threes', label: 'Threes', up: true, fn: d => 3 * freq(d)[3] },
    { id: 'fours', label: 'Fours', up: true, fn: d => 4 * freq(d)[4] },
    { id: 'fives', label: 'Fives', up: true, fn: d => 5 * freq(d)[5] },
    { id: 'sixes', label: 'Sixes', up: true, fn: d => 6 * freq(d)[6] },
    { id: 'three', label: '3 of a kind', fn: d => nKind(d, 3) ? sum(d) : 0 },
    { id: 'four', label: '4 of a kind', fn: d => nKind(d, 4) ? sum(d) : 0 },
    { id: 'full', label: 'Full house', fn: d => fullHouse(d) ? 25 : 0 },
    { id: 'small', label: 'Sm. straight', fn: d => straight(d, 4) ? 30 : 0 },
    { id: 'large', label: 'Lg. straight', fn: d => straight(d, 5) ? 40 : 0 },
    { id: 'yahtzee', label: 'YAHTZEE', fn: d => nKind(d, 5) ? 50 : 0 },
    { id: 'chance', label: 'Chance', fn: d => sum(d) },
  ];
  const yUpper = card => Y_CATS.filter(c => c.up).reduce((a, c) => a + (card[c.id] || 0), 0);
  const yTotal = card => { const up = yUpper(card); const low = Y_CATS.filter(c => !c.up).reduce((a, c) => a + (card[c.id] || 0), 0); return up + (up >= 63 ? 35 : 0) + low; };
  const yDone = card => Y_CATS.every(c => c.id in card);

  Games.register({
    id: 'yahtzee', name: 'Yahtzee', emoji: '🎲', category: 'Dice', accent: '#ff9f45',
    tagline: 'Roll, hold, fill the card.',
    init: host => ({ turn: host, scores: [{}, {}], dice: [], held: [false, false, false, false, false], rollsLeft: 3, host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me;
      ctx.root.append(ctx.turnBar({ scores: [yTotal(st.scores[0]), yTotal(st.scores[1])] }));
      const pane = ctx.h('div', { class: 'board-frame' }); ctx.root.append(pane);
      let held = (st.held || [false, false, false, false, false]).slice();

      function drawDice() {
        const wrap = ctx.h('div', {});
        const rolled = st.dice.length > 0;
        if (rolled) {
          const row = ctx.h('div', { class: 'dz-dice' });
          st.dice.forEach((v, i) => {
            const canHold = ctx.isMyTurn && st.rollsLeft < 3 && st.rollsLeft > 0;
            const die = ctx.h('div', { class: 'dz-die' + (held[i] ? ' held' : '') + (canHold ? ' live' : '') }, PIP[v]);
            if (canHold) die.onclick = () => { held[i] = !held[i]; redraw(); };
            row.append(die);
          });
          wrap.append(row);
        }
        if (ctx.isMyTurn) {
          if (st.rollsLeft > 0) wrap.append(ctx.h('button', { class: 'btn btn-primary btn-block', onclick: rollDice }, rolled ? `Roll again (${st.rollsLeft} left)` : 'Roll the dice'));
          if (rolled) wrap.append(ctx.h('p', { class: 'dz-rolls' }, st.rollsLeft > 0 ? 'Tap dice to hold, or pick a box below to score' : 'No rolls left — pick a box to score'));
        } else wrap.append(ctx.h('p', { class: 'dz-rolls' }, `${ctx.seat(st.turn).name} is rolling…`));
        return wrap;
      }
      function scoreCard() {
        const tbl = ctx.h('table', { class: 'yz-card' });
        tbl.append(ctx.h('tr', {}, ctx.h('th', { class: 'lbl' }, ''), ctx.h('th', { class: me === 0 ? 'me' : '' }, ctx.players[0].name), ctx.h('th', { class: me === 1 ? 'me' : '' }, ctx.players[1].name)));
        const cell = (seat, c) => {
          const card = st.scores[seat];
          if (c.id in card) return ctx.h('td', { class: 'yz-cell' + (card[c.id] === 0 ? ' zero' : '') }, String(card[c.id]));
          const liveHere = ctx.isMyTurn && seat === me && st.dice.length > 0;
          if (liveHere) { const td = ctx.h('td', { class: 'yz-cell live' }, String(c.fn(st.dice))); td.onclick = () => scoreCat(c.id); return td; }
          return ctx.h('td', { class: 'yz-cell zero' }, '·');
        };
        Y_CATS.forEach((c, i) => {
          const tr = ctx.h('tr', {}, ctx.h('td', { class: 'lbl' }, c.label), cell(0, c), cell(1, c));
          tbl.append(tr);
          if (c.id === 'sixes') tbl.append(ctx.h('tr', {}, ctx.h('td', { class: 'lbl yz-sub' }, 'Upper bonus (63+→35)'),
            ctx.h('td', { class: 'yz-sub' }, yUpper(st.scores[0]) >= 63 ? '+35' : `${yUpper(st.scores[0])}/63`),
            ctx.h('td', { class: 'yz-sub' }, yUpper(st.scores[1]) >= 63 ? '+35' : `${yUpper(st.scores[1])}/63`)));
        });
        tbl.append(ctx.h('tr', { class: 'yz-tot' }, ctx.h('td', { class: 'lbl' }, 'TOTAL'), ctx.h('td', {}, String(yTotal(st.scores[0]))), ctx.h('td', {}, String(yTotal(st.scores[1])))));
        return tbl;
      }
      let diceBox, cardBox;
      function redraw() { diceBox.innerHTML = ''; diceBox.append(drawDice()); cardBox.innerHTML = ''; cardBox.append(scoreCard()); }
      diceBox = ctx.h('div', {}); cardBox = ctx.h('div', { style: 'margin-top:10px' });
      pane.append(diceBox, cardBox); redraw();
      ctx.isMyTurn ? ctx.msg('Your turn 🎲', ctx.players[me].color) : waiting(ctx, ctx.seat(st.turn).name);

      function rollDice() {
        if (st.rollsLeft <= 0) return;
        const s = ctx.clone(st);
        const rolled = st.dice.length > 0;
        s.dice = (rolled ? st.dice : [0, 0, 0, 0, 0]).map((v, i) => (rolled && held[i]) ? v : (1 + rint(6)));
        s.held = held.slice(); s.rollsLeft = st.rollsLeft - 1; ctx.sound.place(); ctx.commit(s);
      }
      function scoreCat(id) {
        if (!st.dice.length) { ctx.sound.bad(); return; }
        const s = ctx.clone(st);
        s.scores = [Object.assign({}, st.scores[0]), Object.assign({}, st.scores[1])];
        s.scores[me][id] = Y_CATS.find(c => c.id === id).fn(st.dice);
        s.dice = []; s.held = [false, false, false, false, false]; s.rollsLeft = 3; s.turn = 1 - me; ctx.sound.good();
        if (yDone(s.scores[0]) && yDone(s.scores[1])) { const a = yTotal(s.scores[0]), b = yTotal(s.scores[1]); return ctx.commit(s, a === b ? 'draw' : (a > b ? 0 : 1)); }
        ctx.commit(s);
      }
    },
  });

  /* ===================== LIAR'S DICE ===================== */
  // No wild 1s (kept simple): a bid claims at least N dice across BOTH players show face F.
  Games.register({
    id: 'liars-dice', name: 'Liar’s Dice', emoji: '🎲', category: 'Dice', accent: '#ff4d6d',
    tagline: 'Bluff your bids, call the lie.',
    init: host => ({ dice: [roll(5), roll(5)], counts: [5, 5], bid: null, turn: host, phase: 'bid', last: null, host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me, opp = 1 - me;
      ctx.root.append(ctx.turnBar({ scores: [st.counts[0], st.counts[1]] }));
      const totalDice = st.counts[0] + st.counts[1];

      if (st.phase === 'reveal') {
        const card = ctx.h('div', { class: 'board-frame' });
        [0, 1].forEach(p => {
          card.append(ctx.h('div', { class: 'ld-label' }, ctx.players[p].name + (p === st.last.loser ? ' — lost a die' : '')));
          const row = ctx.h('div', { class: 'dz-dice' });
          st.dice[p].forEach(v => row.append(ctx.h('div', { class: 'dz-die sm' + (v === st.last.face ? ' held' : '') }, PIP[v])));
          card.append(row);
        });
        card.append(ctx.h('p', { class: 'center', style: 'font-weight:700;margin:8px 0' },
          `Bid was ${st.last.qty}× ${PIP[st.last.face]} · actually ${st.last.actual} → ${ctx.players[st.last.caller].name} called ${st.last.good ? 'wrong' : 'right'}!`));
        ctx.root.append(card);
        if (me === st.host) ctx.root.append(ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: nextRound }, 'Next round ▶'));
        else waiting(ctx, ctx.players[st.host].name + ' to continue');
        return;
      }

      // bid phase — show MY dice, hide opponent's
      const card = ctx.h('div', { class: 'board-frame' });
      card.append(ctx.h('div', { class: 'ld-label' }, 'Your dice (secret 🤫)'));
      const myRow = ctx.h('div', { class: 'dz-dice' });
      st.dice[me].forEach(v => myRow.append(ctx.h('div', { class: 'dz-die sm' }, PIP[v])));
      card.append(myRow);
      card.append(ctx.h('div', { class: 'ld-label', style: 'margin-top:8px' }, `${ctx.players[opp].name}'s ${st.counts[opp]} dice (hidden)`));
      const oppRow = ctx.h('div', { class: 'dz-dice' });
      for (let i = 0; i < st.counts[opp]; i++) oppRow.append(ctx.h('div', { class: 'dz-die sm hid' }, '?'));
      card.append(oppRow);
      card.append(ctx.h('div', { class: 'ld-bid' }, st.bid
        ? ctx.h('span', {}, 'Current bid: ', ctx.h('span', { class: 'ld-pill' }, `${st.bid.qty} × ${PIP[st.bid.face]}`), ` by ${ctx.players[st.bid.by].name}`)
        : ctx.h('span', { class: 'ld-label' }, 'No bid yet — opening bid')));
      ctx.root.append(card);

      if (!ctx.isMyTurn) { waiting(ctx, ctx.players[st.turn].name); return; }

      // my turn: build a raise + challenge
      const minQty = st.bid ? st.bid.qty : 1;
      let q = minQty, f = st.bid ? st.bid.face : 1;
      const legal = () => st.bid ? (q > st.bid.qty || (q === st.bid.qty && f > st.bid.face)) : (q >= 1);
      const stepBox = ctx.h('div', {});
      function drawStep() {
        stepBox.innerHTML = '';
        stepBox.append(ctx.h('div', { class: 'ld-label' }, 'How many dice show this face (both players)?'));
        stepBox.append(ctx.h('div', { class: 'ld-step' },
          ctx.h('button', { onclick: () => { q = Math.max(1, q - 1); drawStep(); } }, '−'),
          ctx.h('div', { class: 'v' }, String(q)),
          ctx.h('button', { onclick: () => { q = Math.min(totalDice, q + 1); drawStep(); } }, '+')));
        const faces = ctx.h('div', { class: 'ld-faces' });
        for (let v = 1; v <= 6; v++) faces.append(ctx.h('button', { class: f === v ? 'on' : '', onclick: () => { f = v; drawStep(); } }, PIP[v]));
        stepBox.append(faces);
        stepBox.append(ctx.h('div', { class: 'btn-row mt' },
          st.bid ? ctx.h('button', { class: 'btn btn-ghost', onclick: challenge }, '“Liar!” — call it') : '',
          ctx.h('button', { class: 'btn btn-primary', onclick: makeBid }, `Bid ${q} × ${PIP[f]}`)));
      }
      ctx.root.append(stepBox); drawStep();
      ctx.msg(st.bid ? 'Raise the bid, or call their bluff' : 'Make the opening bid', ctx.players[me].color);

      function makeBid() {
        if (!legal()) { ctx.sound.bad(); ctx.msg('Raise must be higher (more dice, or same count + higher face).', 'var(--gold)'); return; }
        const s = ctx.clone(st); s.bid = { qty: q, face: f, by: me }; s.turn = 1 - me; ctx.sound.tap(); ctx.commit(s);
      }
      function challenge() {
        const actual = st.dice[0].concat(st.dice[1]).filter(v => v === st.bid.face).length;
        const bidGood = actual >= st.bid.qty;        // bid was truthful
        const loser = bidGood ? me : st.bid.by;       // caller loses if bid good, else bidder loses
        const s = ctx.clone(st); s.counts = st.counts.slice(); s.counts[loser]--;
        s.phase = 'reveal'; s.last = { qty: st.bid.qty, face: st.bid.face, actual, caller: me, good: bidGood, loser };
        bidGood ? ctx.sound.bad() : ctx.sound.good();
        if (s.counts[loser] <= 0) return ctx.commit(s, 1 - loser);   // loser out of dice → opponent wins
        ctx.commit(s);
      }
      function nextRound() {
        const s = ctx.clone(st);
        s.dice = [roll(s.counts[0]), roll(s.counts[1])]; s.bid = null; s.phase = 'bid';
        s.turn = st.last.loser;                       // the player who lost the die starts
        ctx.sound.place(); ctx.commit(s);
      }
    },
  });

})();
