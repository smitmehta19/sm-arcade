/* ============================================================
   GAMES — Board classics batch 3: Dominoes, SOS, GOPS
   Interface: init(hostSeat) -> state;  render(ctx)  (see ui.js)
   ============================================================ */
(function () {
  const css = `
  /* ---- dominoes ---- */
  .dm-line{ display:flex; gap:5px; overflow-x:auto; padding:10px 6px; min-height:64px; align-items:center;
    background:rgba(0,0,0,.25); border-radius:12px; scrollbar-width:none; }
  .dm-line::-webkit-scrollbar{ display:none; }
  .dm-empty{ margin:auto; color:var(--ink-faint); font-size:13px; }
  .dmt{ flex:0 0 auto; display:flex; background:linear-gradient(160deg,#f6f4ef,#d9d5cc); border-radius:7px;
    padding:3px; gap:3px; box-shadow:0 3px 8px rgba(0,0,0,.45); border:none; }
  .dmt .dmh{ width:24px; height:24px; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); border-radius:4px; background:rgba(0,0,0,.06); position:relative; }
  .dmt .dmh:first-child{ border-right:1.5px solid rgba(0,0,0,.35); }
  .dmt .dmh i{ width:5px; height:5px; border-radius:50%; background:#1a1430; place-self:center; }
  .dm-hand{ display:flex; gap:8px; flex-wrap:wrap; justify-content:center; margin-top:12px; }
  .dm-hand .dmt{ cursor:default; opacity:.55; }
  .dm-hand .dmt.live{ opacity:1; cursor:pointer; box-shadow:0 3px 8px rgba(0,0,0,.45), 0 0 12px -2px var(--lime); }
  .dm-hand .dmt.live:active{ transform:scale(.9); }
  .dm-hand .dmt.sel{ box-shadow:0 0 0 2.5px var(--gold), 0 3px 8px rgba(0,0,0,.45); transform:translateY(-4px); }
  .dm-meta{ display:flex; justify-content:center; gap:14px; margin-top:10px; font-size:13px; color:var(--ink-dim); }
  .dm-back{ width:20px; height:32px; border-radius:5px; background:linear-gradient(160deg,#3d3560,#241d40); border:1px solid rgba(255,255,255,.14); display:inline-block; margin:0 1.5px; }
  .dm-ends{ display:flex; gap:10px; justify-content:center; margin-top:12px; }
  .dm-ends .btn-sm{ border-color:var(--gold); color:var(--gold); }
  /* ---- SOS ---- */
  .sos{ display:grid; grid-template-columns:repeat(6,1fr); gap:5px; aspect-ratio:1; }
  .sos-c{ display:grid; place-items:center; background:var(--bg-2); border:1px solid var(--line); border-radius:10px;
    font-family:var(--font-num); font-weight:900; font-size:7vw; color:var(--ink); }
  @media(min-width:520px){ .sos-c{ font-size:30px; } }
  .sos-c.live{ cursor:pointer; }
  .sos-c.w0{ background:var(--p1-soft); border-color:var(--p1); color:var(--p1); }
  .sos-c.w1{ background:var(--p2-soft); border-color:var(--p2); color:var(--p2); }
  .sos-pick{ display:flex; gap:10px; justify-content:center; margin-bottom:12px; }
  .sos-pick button{ width:64px; height:52px; border-radius:13px; font-family:var(--font-num); font-weight:900; font-size:24px;
    background:var(--panel-2); border:1px solid var(--line); color:var(--ink-dim); }
  .sos-pick button.on{ color:var(--gold); border-color:var(--gold); box-shadow:0 0 14px -4px var(--gold); }
  .sos-pick button:active{ transform:scale(.92); }
  /* ---- GOPS ---- */
  .gp-prize{ text-align:center; margin:6px 0 14px; }
  .gp-card{ display:inline-flex; flex-direction:column; align-items:center; justify-content:center; width:86px; height:118px;
    border-radius:13px; background:linear-gradient(160deg,#fdfbf7,#e8e2d8); color:#c22743; box-shadow:0 8px 22px rgba(0,0,0,.5); }
  .gp-card b{ font-family:var(--font-num); font-size:34px; } .gp-card span{ font-size:26px; }
  .gp-card.mini{ width:56px; height:76px; } .gp-card.mini b{ font-size:22px; } .gp-card.mini span{ font-size:16px; }
  .gp-card.spade{ color:#1d1a2e; }
  .gp-carry{ font-size:12.5px; color:var(--gold); margin-top:8px; font-weight:700; }
  .gp-hand{ display:flex; gap:6px; flex-wrap:wrap; justify-content:center; margin-top:14px; }
  .gp-hand button{ width:44px; height:60px; border-radius:9px; background:linear-gradient(160deg,#fdfbf7,#e8e2d8); color:#1d1a2e;
    border:none; font-family:var(--font-num); font-weight:900; font-size:17px; box-shadow:0 3px 8px rgba(0,0,0,.4); }
  .gp-hand button:active{ transform:scale(.88) translateY(-3px); }
  .gp-reveal{ display:flex; align-items:center; justify-content:center; gap:18px; margin:14px 0; }
  .gp-reveal .who{ text-align:center; font-size:12px; font-weight:700; margin-top:6px; }
  .gp-hist{ display:flex; gap:5px; justify-content:center; flex-wrap:wrap; margin-top:10px; font-size:11.5px; color:var(--ink-faint); }
  .gp-hist span{ padding:3px 8px; border-radius:999px; background:var(--bg-2); border:1px solid var(--line); }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const waiting = ctx => ctx.msg(`⏳ Waiting for ${ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');

  /* =================== DOMINOES (draw & block) =================== */
  const PIPS = { 0: [], 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function half(ctx, n) { const d = ctx.h('div', { class: 'dmh' }); for (let i = 0; i < 9; i++) { const dot = ctx.h(PIPS[n].includes(i) ? 'i' : 'span'); dot.style.gridArea = `${(i / 3 | 0) + 1}/${(i % 3) + 1}`; d.append(dot); } return d; }
  const tileEl = (ctx, t, cls = '') => ctx.h('button', { class: 'dmt' + cls }, half(ctx, t[0]), half(ctx, t[1]));
  const pips = hand => hand.reduce((s, t) => s + t[0] + t[1], 0);

  Games.register({
    id: 'dominoes', name: 'Dominoes', emoji: '🁢', category: 'Strategy', accent: '#f2ead9',
    tagline: 'Match ends · first to empty wins.',
    init: host => {
      const set = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) set.push([a, b]);
      shuffle(set);
      return { hands: [set.slice(0, 7), set.slice(7, 14)], boneyard: set.slice(14), line: [], turn: host, passes: 0 };
    },
    render(ctx) {
      const st = ctx.state, me = ctx.me; let sel = null;
      const L = st.line.length ? st.line[0][0] : null, R = st.line.length ? st.line[st.line.length - 1][1] : null;
      const canPlay = t => !st.line.length || t.includes(L) || t.includes(R);
      ctx.root.append(ctx.turnBar({ scores: [st.hands[0].length, st.hands[1].length] }));

      const oppRow = ctx.h('div', { style: 'text-align:center;margin-bottom:8px' });
      st.hands[1 - me].forEach(() => oppRow.append(ctx.h('span', { class: 'dm-back' })));
      const line = ctx.h('div', { class: 'dm-line' });
      if (!st.line.length) line.append(ctx.h('div', { class: 'dm-empty' }, 'Table’s empty — lay the first bone 🁢'));
      st.line.forEach(t => line.append(tileEl(ctx, t)));
      const hand = ctx.h('div', { class: 'dm-hand' });
      const endsRow = ctx.h('div', { class: 'dm-ends', hidden: '' });
      st.hands[me].forEach((t, i) => {
        const el = tileEl(ctx, t, ctx.isMyTurn && canPlay(t) ? ' live' : '');
        if (ctx.isMyTurn && canPlay(t)) el.onclick = () => choose(t, i, el);
        hand.append(el);
      });
      const meta = ctx.h('div', { class: 'dm-meta' }, `🦴 Boneyard: ${st.boneyard.length}`);
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, oppRow, line, hand, endsRow, meta));
      line.scrollLeft = line.scrollWidth;                       // keep the fresh end in view
      const ctrls = ctx.h('div', { class: 'game-controls' }); ctx.root.append(ctrls);

      if (!ctx.isMyTurn) { waiting(ctx); return; }
      const havePlay = st.hands[me].some(canPlay);
      if (havePlay) ctx.msg('Your turn — tap a glowing bone', ctx.players[me].color);
      else if (st.boneyard.length) {
        ctx.msg('No match — draw from the boneyard', 'var(--gold)');
        ctrls.append(ctx.h('button', { class: 'btn btn-primary', onclick: draw }, '🦴 Draw a bone'));
      } else {
        ctx.msg('No match and the boneyard’s empty…', 'var(--gold)');
        ctrls.append(ctx.h('button', { class: 'btn', onclick: pass }, '😤 Pass'));
      }

      function choose(t, i, el) {
        ctx.sound.tap();
        hand.querySelectorAll('.sel').forEach(x => x.classList.remove('sel'));
        endsRow.hidden = true; endsRow.innerHTML = '';
        if (!st.line.length) return play(t, i, 'r');
        const fitsL = t.includes(L), fitsR = t.includes(R);
        if (fitsL && fitsR && L !== R) {                         // both ends valid → ask which
          el.classList.add('sel'); sel = { t, i };
          endsRow.hidden = false;
          endsRow.append(ctx.h('button', { class: 'btn btn-sm', onclick: () => play(t, i, 'l') }, `◀ Left end (${L})`),
                         ctx.h('button', { class: 'btn btn-sm', onclick: () => play(t, i, 'r') }, `Right end (${R}) ▶`));
          ctx.msg('Which end?', 'var(--gold)');
          return;
        }
        play(t, i, fitsR ? 'r' : 'l');
      }
      function play(t, i, side) {
        const s = ctx.clone(st); s.hands[me].splice(i, 1); s.passes = 0;
        if (!s.line.length) s.line.push(t);
        else if (side === 'l') s.line.unshift(t[1] === L ? t : [t[1], t[0]]);
        else s.line.push(t[0] === R ? t : [t[1], t[0]]);
        ctx.sound.place();
        if (!s.hands[me].length) return ctx.commit(s, me);
        s.turn = 1 - me; ctx.commit(s);
      }
      function draw() { const s = ctx.clone(st); s.hands[me].push(s.boneyard.pop()); ctx.sound.move(); ctx.commit(s); }
      function pass() {
        const s = ctx.clone(st); s.passes++;
        if (s.passes >= 2) { const a = pips(s.hands[0]), b = pips(s.hands[1]); ctx.sound.draw(); return ctx.commit(s, a === b ? 'draw' : (a < b ? 0 : 1)); }
        s.turn = 1 - me; ctx.sound.bad(); ctx.commit(s);
      }
    },
  });

  /* =================== SOS (6×6, extra turn on score) =================== */
  const SOS_N = 6;
  function sosNewLines(g, i, existing) {
    const r = (i / SOS_N) | 0, c = i % SOS_N, out = [], seen = new Set(existing.map(l => l.cells.join('-')));
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      for (let off = -2; off <= 0; off++) {
        const cells = [0, 1, 2].map(k => { const nr = r + (off + k) * dr, nc = c + (off + k) * dc; return (nr >= 0 && nr < SOS_N && nc >= 0 && nc < SOS_N) ? nr * SOS_N + nc : -1; });
        if (cells.includes(-1)) continue;
        if (g[cells[0]] === 'S' && g[cells[1]] === 'O' && g[cells[2]] === 'S') {
          const key = cells.join('-');
          if (!seen.has(key)) { seen.add(key); out.push(cells); }
        }
      }
    }
    return out;
  }
  Games.register({
    id: 'sos', name: 'SOS', emoji: '🆘', category: 'Strategy', accent: '#79f5b6',
    tagline: 'Spell S-O-S · score & go again.',
    test: { sosNewLines },
    init: host => ({ grid: Array(SOS_N * SOS_N).fill(null), scores: [0, 0], lines: [], turn: host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me; let cur = 'S';
      ctx.root.append(ctx.turnBar({ scores: st.scores }));
      const own = {}; st.lines.forEach(l => l.cells.forEach(i => own[i] = l.p));
      const pick = ctx.h('div', { class: 'sos-pick' });
      const bS = ctx.h('button', { class: 'on', onclick: () => set('S') }, 'S');
      const bO = ctx.h('button', { onclick: () => set('O') }, 'O');
      pick.append(bS, bO);
      function set(l) { cur = l; bS.classList.toggle('on', l === 'S'); bO.classList.toggle('on', l === 'O'); ctx.sound.tap(); }
      const grid = ctx.h('div', { class: 'sos' });
      st.grid.forEach((v, i) => {
        const cell = ctx.h('div', { class: 'sos-c' + (own[i] != null ? ' w' + own[i] : '') + (ctx.isMyTurn && v == null ? ' live' : '') }, v || '');
        if (ctx.isMyTurn && v == null) cell.onclick = () => place(i);
        grid.append(cell);
      });
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, ctx.isMyTurn ? pick : '', grid));
      ctx.isMyTurn ? ctx.msg(`Your turn — placing “${cur}” (tap S/O to switch)`, ctx.players[me].color) : waiting(ctx);
      function place(i) {
        const s = ctx.clone(st); s.grid[i] = cur;
        const nl = sosNewLines(s.grid, i, s.lines);
        nl.forEach(cells => s.lines.push({ cells, p: me }));
        s.scores[me] += nl.length;
        ctx.sound[nl.length ? 'good' : 'place']();
        if (s.grid.every(x => x != null)) return ctx.commit(s, s.scores[0] === s.scores[1] ? 'draw' : (s.scores[0] > s.scores[1] ? 0 : 1));
        if (!nl.length) s.turn = 1 - me;                        // SOS scored → same player goes again
        ctx.commit(s);
      }
    },
  });

  /* =================== GOPS (Goofspiel — secret bids) =================== */
  const CARD = n => n === 1 ? 'A' : n === 11 ? 'J' : n === 12 ? 'Q' : n === 13 ? 'K' : String(n);
  Games.register({
    id: 'gops', name: 'GOPS', emoji: '♦️', category: 'Cards', accent: '#ff6b81',
    tagline: 'Secret bids for diamond prizes.',
    init: host => ({ prizes: shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), round: 0, bids: [null, null], carry: 0, scores: [0, 0], used: [[], []], phase: 'bid', host, log: [] }),
    render(ctx) {
      const st = ctx.state, me = ctx.me, prize = st.prizes[st.round];
      ctx.root.append(ctx.h('div', { class: 'score-line' },
        ctx.h('span', { style: `color:${ctx.players[0].color}` }, `${ctx.players[0].name} ${st.scores[0]}`), '  ·  ',
        ctx.h('span', { style: `color:${ctx.players[1].color}` }, `${st.scores[1]} ${ctx.players[1].name}`)));
      const frame = ctx.h('div', { class: 'board-frame' });
      frame.append(ctx.h('div', { class: 'gp-prize' },
        ctx.h('div', { style: 'font-size:12px;color:var(--ink-dim);margin-bottom:8px' }, `Round ${st.round + 1} / 13 — up for grabs:`),
        ctx.h('div', { class: 'gp-card' }, ctx.h('b', {}, CARD(prize)), ctx.h('span', {}, '♦')),
        st.carry ? ctx.h('div', { class: 'gp-carry' }, `+ ${st.carry} carried from the tie! 🔥`) : ''));

      if (st.phase === 'bid') {
        if (st.bids[me] == null) {
          const hand = ctx.h('div', { class: 'gp-hand' });
          for (let v = 1; v <= 13; v++) { if (st.used[me].includes(v)) continue; hand.append(ctx.h('button', { onclick: () => bid(v) }, CARD(v) + '♠')); }
          frame.append(ctx.h('p', { class: 'center', style: 'color:var(--ink-dim);font-size:13px;margin:4px 0 0' }, 'Bid one of your spades — spend big or save big?'), hand);
          ctx.msg('Pick your secret bid 🤫', ctx.players[me].color);
        } else { frame.append(ctx.h('p', { class: 'center', style: 'color:var(--ink-dim);padding:16px 0' }, '🤫 Bid locked in.')); waiting(ctx); }
      } else { // reveal
        const [a, b] = st.bids, w = a === b ? -1 : (a > b ? 0 : 1);
        const rv = ctx.h('div', { class: 'gp-reveal' });
        [0, 1].forEach(p => rv.append(ctx.h('div', {},
          ctx.h('div', { class: 'gp-card mini spade' }, ctx.h('b', {}, CARD(st.bids[p])), ctx.h('span', {}, '♠')),
          ctx.h('div', { class: 'who', style: `color:${ctx.players[p].color}` }, ctx.players[p].name))));
        const lastLog = st.log[st.log.length - 1] || { pot: prize };
        frame.append(rv, ctx.h('div', { class: 'center', style: 'font-weight:700;font-size:16px' },
          w === -1 ? `Tie! The ${CARD(prize)}♦ rolls over 😱` : `${ctx.players[w].name} takes ${lastLog.pot} points!`));
        if (me === st.host) {
          frame.append(ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: next }, st.round >= 12 ? 'Final result 🏆' : 'Next prize ▶'));
          ctx.msg(`Score ${st.scores[0]} – ${st.scores[1]}`);
        } else waiting(ctx);
      }
      if (st.log.length) {
        const hist = ctx.h('div', { class: 'gp-hist' });
        st.log.slice(-5).forEach(e => hist.append(ctx.h('span', {}, `${CARD(e.pr)}♦ → ${e.w === -1 ? 'tie' : ctx.players[e.w].name}`)));
        frame.append(hist);
      }
      ctx.root.append(frame);

      function bid(v) {
        const s = ctx.clone(st); s.bids[me] = v; s.used[me].push(v); ctx.sound.tap();
        if (s.bids[1 - me] != null) {
          const w = s.bids[0] === s.bids[1] ? -1 : (s.bids[0] > s.bids[1] ? 0 : 1);
          const pot = prize + s.carry;
          if (w === -1) s.carry += prize; else { s.scores[w] += pot; s.carry = 0; }
          s.log.push({ pr: prize, w, pot: w === -1 ? 0 : pot });
          s.phase = 'reveal'; ctx.sound.good();
        }
        ctx.commit(s);
      }
      function next() {
        const s = ctx.clone(st); s.round++;
        if (s.round >= 13) return ctx.commit(s, s.scores[0] === s.scores[1] ? 'draw' : (s.scores[0] > s.scores[1] ? 0 : 1));
        s.bids = [null, null]; s.phase = 'bid'; ctx.sound.move(); ctx.commit(s);
      }
    },
  });
})();
