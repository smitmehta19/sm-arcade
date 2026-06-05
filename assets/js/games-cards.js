/* ============================================================
   CARD GAMES — Jaipur (2-player trading, online, turn-based)
   ============================================================ */
(function () {
  const css = `
  .jp-tokens{ display:flex; gap:6px; flex-wrap:wrap; justify-content:center; font-size:12px; color:var(--ink-dim); margin-bottom:8px; }
  .jp-tok{ display:inline-flex; align-items:center; gap:3px; padding:3px 8px; border-radius:999px; background:var(--bg-2); border:1px solid var(--line); }
  .jp-tok b{ color:var(--ink); font-family:var(--font-num); }
  .jp-row{ display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin:6px 0; }
  .jp-card{ width:54px; height:70px; border-radius:11px; background:var(--panel-2); border:1px solid var(--glass-brd); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; font-size:26px; position:relative; }
  .jp-card .nm{ font-size:9px; color:var(--ink-dim); text-transform:capitalize; }
  .jp-card.live{ cursor:pointer; } .jp-card.live:active{ transform:scale(.93); }
  .jp-card.pick{ border-color:var(--lime); box-shadow:0 0 0 2px var(--lime); }
  .jp-card.give{ border-color:var(--gold); box-shadow:0 0 0 2px var(--gold); }
  .jp-card .ct{ position:absolute; top:-6px; right:-6px; min-width:18px; height:18px; border-radius:9px; background:var(--violet); color:#06070f; font-size:11px; font-weight:900; display:grid; place-items:center; padding:0 4px; }
  .jp-label{ font-size:11px; color:var(--ink-dim); text-align:center; margin:8px 0 2px; font-family:var(--font-display); letter-spacing:.5px; }
  .jp-acts{ display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:10px; }
  .jp-sell{ display:flex; align-items:center; gap:10px; justify-content:center; margin-top:8px; }
  .jp-sell .v{ font-family:var(--font-num); font-weight:900; font-size:22px; min-width:34px; text-align:center; }
  .jp-sell button.st{ width:38px; height:38px; border-radius:10px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-size:20px; }
  .jp-mini{ font-size:12px; color:var(--ink-dim); text-align:center; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
  const rint = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const waiting = (ctx, who) => ctx.msg(`Waiting for ${who || ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');

  const GOODS = ['diamond', 'gold', 'silver', 'cloth', 'spice', 'leather'];
  const ICON = { diamond: '💎', gold: '🟡', silver: '⚪', cloth: '🧵', spice: '🌶️', leather: '🟫', camel: '🐫' };
  const TOKENS = { diamond: [7, 7, 5, 5, 5], gold: [6, 6, 5, 5, 5], silver: [5, 5, 5, 5, 5], cloth: [5, 3, 3, 2, 2, 1, 1], spice: [5, 3, 3, 2, 2, 1, 1], leather: [4, 3, 2, 1, 1, 1, 1, 1, 1] };
  const DECKDEF = { diamond: 6, gold: 6, silver: 6, cloth: 8, spice: 8, leather: 10, camel: 11 };
  const BONUS = { 3: 2, 4: 5, 5: 8 };

  /* ---- pure logic (also exposed via def.test) ---- */
  const refill = s => { while (s.market.length < 5 && s.deck.length) s.market.push(s.deck.pop()); };
  const emptyPiles = s => GOODS.filter(g => s.tokens[g].length === 0).length;
  const jScore = s => { const r = [0, 1].map(p => s.collected[p].reduce((a, b) => a + b, 0)); let cb = [0, 0]; if (s.camels[0] > s.camels[1]) cb[0] = 5; else if (s.camels[1] > s.camels[0]) cb[1] = 5; return [r[0] + cb[0], r[1] + cb[1]]; };
  const jEnded = s => emptyPiles(s) >= 3 || (s.deck.length === 0 && s.market.length === 0);
  const jWinner = s => { if (!jEnded(s)) return undefined; const sc = jScore(s); return sc[0] === sc[1] ? 'draw' : (sc[0] > sc[1] ? 0 : 1); };
  function jTakeGood(s, seat, idx) { if (s.market[idx] === 'camel') return false; if (s.hands[seat].length >= 7) return false; const c = s.market.splice(idx, 1)[0]; s.hands[seat].push(c); refill(s); return true; }
  function jTakeCamels(s, seat) { const n = s.market.filter(c => c === 'camel').length; if (!n) return false; s.camels[seat] += n; s.market = s.market.filter(c => c !== 'camel'); refill(s); return true; }
  function jSell(s, seat, good, n) { const have = s.hands[seat].filter(c => c === good).length; if (n < 1 || n > have) return false; let rm = 0; s.hands[seat] = s.hands[seat].filter(c => { if (c === good && rm < n) { rm++; return false; } return true; }); for (let i = 0; i < n; i++) if (s.tokens[good].length) s.collected[seat].push(s.tokens[good].shift()); if (n >= 5) s.collected[seat].push(BONUS[5]); else if (n >= 3) s.collected[seat].push(BONUS[n]); return true; }
  function jExchange(s, seat, takeIdxs, give) {
    if (takeIdxs.length < 2 || takeIdxs.length !== give.length) return false;
    const taken = takeIdxs.map(i => s.market[i]); if (taken.some(c => c === 'camel' || c == null)) return false;
    const giveGoods = give.filter(g => g !== 'camel'), giveCamels = give.filter(g => g === 'camel').length;
    if (giveCamels > s.camels[seat]) return false;
    const handCopy = s.hands[seat].slice();
    for (const g of giveGoods) { const i = handCopy.indexOf(g); if (i < 0) return false; handCopy.splice(i, 1); }
    if (handCopy.length + taken.length > 7) return false;          // hand limit after swap
    // apply: remove taken from market (desc indices), remove gives from hand/camels, add taken to hand, add gives to market
    takeIdxs.slice().sort((a, b) => b - a).forEach(i => s.market.splice(i, 1));
    s.hands[seat] = handCopy; s.camels[seat] -= giveCamels;
    taken.forEach(c => s.hands[seat].push(c));
    give.forEach(g => s.market.push(g));
    return true;
  }

  Games.register({
    id: 'jaipur', name: 'Jaipur', emoji: '🐫', category: 'Cards', accent: '#ffd66b',
    tagline: 'Trade goods, beat the bazaar.',
    test: { takeGood: jTakeGood, takeCamels: jTakeCamels, sell: jSell, exchange: jExchange, winner: jWinner, score: jScore, ended: jEnded },
    init: host => {
      let deck = [];
      for (const k in DECKDEF) for (let i = 0; i < DECKDEF[k]; i++) deck.push(k);
      let pull = 3; deck = deck.filter(c => { if (c === 'camel' && pull > 0) { pull--; return false; } return true; }); // 3 camels reserved for market
      shuffle(deck);
      const market = ['camel', 'camel', 'camel', deck.pop(), deck.pop()];
      const hands = [[], []], camels = [0, 0];
      for (let p = 0; p < 2; p++) for (let i = 0; i < 5; i++) { const c = deck.pop(); if (c === 'camel') camels[p]++; else hands[p].push(c); }
      return { deck, market, hands, camels, tokens: JSON.parse(JSON.stringify(TOKENS)), collected: [[], []], turn: host, host };
    },
    render(ctx) {
      const st = ctx.state, me = ctx.me, opp = 1 - me;
      const sc = jScore(st);
      ctx.root.append(ctx.turnBar({ scores: sc }));
      const pane = ctx.h('div', { class: 'board-frame' }); ctx.root.append(pane);
      let mode = 'normal', sellGood = null, sellN = 1, xTake = [], xGive = [];

      const cardEl = (good, opts) => {
        const el = ctx.h('div', { class: 'jp-card' + (opts && opts.cls ? ' ' + opts.cls : '') }, ICON[good] || '?', ctx.h('div', { class: 'nm' }, good));
        if (opts && opts.count > 1) el.append(ctx.h('div', { class: 'ct' }, '×' + opts.count));
        if (opts && opts.onclick) el.onclick = opts.onclick;
        return el;
      };

      function draw() {
        pane.innerHTML = '';
        // token piles
        const toks = ctx.h('div', { class: 'jp-tokens' });
        GOODS.forEach(g => toks.append(ctx.h('span', { class: 'jp-tok' }, ICON[g], ' ', ctx.h('b', {}, st.tokens[g].length ? String(st.tokens[g][0]) : '–'), ctx.h('span', {}, '×' + st.tokens[g].length))));
        pane.append(ctx.h('div', { class: 'jp-mini' }, `${emptyPiles(st)}/3 token piles emptied (round ends at 3) · deck ${st.deck.length}`), toks);

        // market
        pane.append(ctx.h('div', { class: 'jp-label' }, 'MARKET'));
        const mk = ctx.h('div', { class: 'jp-row' });
        st.market.forEach((c, i) => {
          const live = ctx.isMyTurn && (mode === 'normal' ? c !== 'camel' : c !== 'camel');
          const cls = mode === 'exchange' && xTake.includes(i) ? 'pick' : '';
          mk.append(cardEl(c, {
            cls: cls + (live && c !== 'camel' ? ' live' : ''),
            onclick: (ctx.isMyTurn && c !== 'camel') ? () => {
              if (mode === 'exchange') { const k = xTake.indexOf(i); if (k >= 0) xTake.splice(k, 1); else xTake.push(i); draw(); }
              else { if (jTakeGood(ctx.clone(st), me, i) === false) { ctx.sound.bad(); ctx.msg('Hand is full (7) — sell or exchange first.', 'var(--gold)'); return; } act(s => jTakeGood(s, me, i)); }
            } : null,
          }));
        });
        pane.append(mk);

        // your hand (grouped)
        pane.append(ctx.h('div', { class: 'jp-label' }, `YOUR HAND (${st.hands[me].length}/7)  ·  🐫 ${st.camels[me]}`));
        const hand = ctx.h('div', { class: 'jp-row' });
        const counts = {}; st.hands[me].forEach(g => counts[g] = (counts[g] || 0) + 1);
        GOODS.filter(g => counts[g]).forEach(g => {
          const give = mode === 'exchange' && xGive.filter(x => x === g).length;
          hand.append(cardEl(g, {
            count: counts[g], cls: (ctx.isMyTurn ? ' live' : '') + (give ? ' give' : ''),
            onclick: ctx.isMyTurn ? () => {
              if (mode === 'exchange') { if (xGive.filter(x => x === g).length < counts[g]) { xGive.push(g); draw(); } }
              else { mode = 'sell'; sellGood = g; sellN = 1; draw(); }
            } : null,
          }));
        });
        if (st.camels[me] > 0 && mode === 'exchange') hand.append(cardEl('camel', { count: st.camels[me], cls: ' live' + (xGive.filter(x => x === 'camel').length ? ' give' : ''), onclick: () => { if (xGive.filter(x => x === 'camel').length < st.camels[me]) { xGive.push('camel'); draw(); } } }));
        pane.append(hand.children.length ? hand : ctx.h('p', { class: 'jp-mini' }, '(no goods in hand)'));

        // opponent
        pane.append(ctx.h('div', { class: 'jp-mini', style: 'margin-top:8px' }, `${ctx.players[opp].name}: ${st.hands[opp].length} cards · 🐫 ${st.camels[opp]}`));

        if (!ctx.isMyTurn) return;
        // action bar
        if (mode === 'sell') {
          const have = counts[sellGood] || 1;
          pane.append(ctx.h('div', { class: 'jp-sell' },
            ctx.h('button', { class: 'st', onclick: () => { sellN = Math.max(1, sellN - 1); draw(); } }, '−'),
            ctx.h('div', { class: 'v' }, ICON[sellGood] + ' ' + sellN),
            ctx.h('button', { class: 'st', onclick: () => { sellN = Math.min(have, sellN + 1); draw(); } }, '+')));
          pane.append(ctx.h('div', { class: 'jp-acts' },
            ctx.h('button', { class: 'btn btn-ghost', onclick: () => { mode = 'normal'; draw(); } }, 'Cancel'),
            ctx.h('button', { class: 'btn btn-primary', onclick: () => act(s => jSell(s, me, sellGood, sellN)) }, `Sell ${sellN} ${sellGood}${sellN >= 3 ? ' (+bonus)' : ''}`)));
        } else if (mode === 'exchange') {
          pane.append(ctx.h('div', { class: 'jp-mini', style: 'margin-top:8px' }, `Taking ${xTake.length} from market · giving ${xGive.length} (goods/camels). Counts must match, 2+.`));
          pane.append(ctx.h('div', { class: 'jp-acts' },
            ctx.h('button', { class: 'btn btn-ghost', onclick: () => { mode = 'normal'; xTake = []; xGive = []; draw(); } }, 'Cancel'),
            ctx.h('button', { class: 'btn btn-primary', onclick: () => act(s => jExchange(s, me, xTake, xGive)) }, 'Confirm trade')));
        } else {
          const acts = ctx.h('div', { class: 'jp-acts' });
          if (st.market.some(c => c === 'camel')) acts.append(ctx.h('button', { class: 'btn btn-ghost', onclick: () => act(s => jTakeCamels(s, me)) }, `Take 🐫 (${st.market.filter(c => c === 'camel').length})`));
          acts.append(ctx.h('button', { class: 'btn btn-ghost', onclick: () => { mode = 'exchange'; xTake = []; xGive = []; draw(); } }, '↔ Exchange'));
          pane.append(ctx.h('p', { class: 'jp-mini', style: 'margin-top:8px' }, 'Tap a market good to take it · tap a hand good to sell · or use the buttons'), acts);
        }
      }
      draw();
      ctx.isMyTurn ? ctx.msg('Your move — take, sell, or trade', ctx.players[me].color) : waiting(ctx, ctx.seat(st.turn).name);

      function act(fn) {
        const s = ctx.clone(st);
        if (fn(s) === false) { ctx.sound.bad(); ctx.msg('That move isn’t allowed.', 'var(--gold)'); return; }
        s.turn = 1 - me; ctx.sound.place();
        const w = jWinner(s);
        if (w !== undefined) return ctx.commit(s, w);
        ctx.commit(s);
      }
    },
  });
})();
