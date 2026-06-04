/* ============================================================
   GAMES — Mind / Word / Luck / Couple (7), online
   ============================================================ */
(function () {
  const css = `
  .bs-wrap{ display:flex; flex-direction:column; gap:8px; }
  .bs-label{ font-family:var(--font-display); font-size:9px; letter-spacing:1px; color:var(--ink-dim); margin:4px 0; }
  .bs-grid{ display:grid; grid-template-columns:repeat(8,1fr); gap:3px; background:rgba(0,120,180,.18); padding:5px; border-radius:10px; }
  .bs-grid.mine{ background:rgba(120,70,220,.16); }
  .bs-cell{ aspect-ratio:1; border-radius:5px; background:rgba(0,0,0,.3); display:grid; place-items:center; font-size:13px; }
  .bs-grid.enemy.live .bs-cell{ cursor:pointer; } .bs-grid.enemy.live .bs-cell:hover{ box-shadow:inset 0 0 0 2px var(--violet); }
  .bs-cell.ship{ background:rgba(180,180,200,.5); } .bs-cell.hit{ background:var(--magenta); box-shadow:0 0 8px var(--magenta); } .bs-cell.miss{ background:rgba(255,255,255,.08); color:var(--ink-faint); }
  .bs-fleet{ text-align:center; font-size:12px; color:var(--ink-dim); }

  .mem{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px; max-width:380px; margin:0 auto; }
  .mem-card{ aspect-ratio:1; border-radius:12px; font-size:30px; display:grid; place-items:center; background:linear-gradient(135deg,var(--panel-2),var(--bg-2)); border:1px solid var(--line); position:relative; }
  .mem-card.live{ cursor:pointer; } .mem-card.live:active{ transform:scale(.92); }
  .mem-card.down{ background:linear-gradient(135deg,var(--violet),var(--magenta)); color:transparent; }
  .mem-card.down::after{ content:'?'; position:absolute; font-family:var(--font-display); color:rgba(255,255,255,.5); font-size:16px; }
  .mem-card.matched{ opacity:.32; transform:scale(.94); }

  .wd-grid{ display:grid; gap:6px; justify-content:center; margin-bottom:14px; }
  .wd-row{ display:grid; grid-template-columns:repeat(5,1fr); gap:6px; }
  .wd-t{ width:46px; height:46px; display:grid; place-items:center; font-weight:900; font-size:22px; border:2px solid var(--line); border-radius:8px; text-transform:uppercase; position:relative; }
  .wd-t .pdot{ position:absolute; top:2px; right:3px; width:6px; height:6px; border-radius:50%; }
  .wd-t.g{ background:#2ea043; border-color:#2ea043; color:#fff; } .wd-t.y{ background:#d4a72c; border-color:#d4a72c; color:#fff; } .wd-t.x{ background:rgba(120,90,140,.4); color:#fff; }
  .kb{ display:flex; flex-direction:column; gap:6px; align-items:center; }
  .kb-row{ display:flex; gap:5px; justify-content:center; }
  .key{ min-width:30px; height:46px; padding:0 8px; border-radius:7px; background:var(--panel-2); border:1px solid var(--line); color:var(--ink); font-weight:700; font-size:14px; }
  .key.wide{ font-size:11px; } .key.g{ background:#2ea043; color:#fff; } .key.y{ background:#d4a72c; color:#fff; } .key.x{ background:rgba(80,60,100,.6); color:#9a90b8; }

  .hm-figure{ font-size:46px; text-align:center; min-height:60px; } .hm-word{ text-align:center; font-family:var(--font-num); font-weight:900; font-size:30px; letter-spacing:8px; margin:10px 0; } .hm-life{ text-align:center; font-size:22px; margin-bottom:8px; }
  .hm-input{ width:100%; background:var(--bg-2); border:1px solid var(--line); border-radius:12px; padding:14px; color:var(--ink); font-size:18px; letter-spacing:3px; text-transform:uppercase; outline:none; }

  .rps-pick{ display:flex; gap:14px; justify-content:center; margin:20px 0; }
  .rps-btn{ width:96px; height:96px; border-radius:20px; font-size:46px; background:var(--panel-2); border:2px solid var(--line); display:grid; place-items:center; } .rps-btn:active{ transform:scale(.88); }
  .rps-reveal{ display:flex; align-items:center; justify-content:center; gap:24px; margin:24px 0; } .rps-reveal .hand{ font-size:60px; } .rps-reveal .vs{ font-family:var(--font-display); color:var(--ink-faint); }

  .pig{ text-align:center; } .pig-die{ font-size:90px; margin:10px 0; } .pig-turn{ font-family:var(--font-num); font-weight:900; font-size:22px; margin:6px 0; }

  .cq-q{ font-size:20px; font-weight:700; text-align:center; margin:20px 10px; line-height:1.4; }
  .cq-opts{ display:flex; flex-direction:column; gap:12px; max-width:360px; margin:0 auto; }
  .cq-opt{ padding:18px; border-radius:14px; font-size:17px; font-weight:600; background:var(--panel-2); border:1px solid var(--line); color:var(--ink); } .cq-opt:active{ transform:scale(.97); }
  .score-line{ text-align:center; font-family:var(--font-num); font-weight:900; font-size:18px; margin-bottom:6px; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const rint = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const waiting = (ctx, who) => ctx.msg(`⏳ Waiting for ${who || ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');
  const scheduled = new Set();

  /* ---------- 9. BATTLESHIP ---------- */
  Games.register({
    id: 'battleship', name: 'Battleship', emoji: '🚢', category: 'Strategy', accent: '#00f0ff',
    tagline: 'Hunt & sink the fleet.',
    init: host => ({ boards: [makeBoard(), makeBoard()], turn: host }),
    render(ctx) {
      const me = ctx.me, enemy = ctx.state.boards[1 - me], mine = ctx.state.boards[me];
      ctx.root.append(ctx.turnBar({ scores: [remaining(ctx.state.boards[0]), remaining(ctx.state.boards[1])] }));
      const wrap = ctx.h('div', { class: 'board-frame bs-wrap' });
      wrap.append(ctx.h('div', { class: 'bs-label' }, '🎯 ENEMY WATERS' + (ctx.isMyTurn ? ' — tap to fire' : '')));
      const eg = ctx.h('div', { class: 'bs-grid enemy' + (ctx.isMyTurn ? ' live' : '') });
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const cell = ctx.h('div', { class: 'bs-cell' });
        if (enemy.hits[r][c] === 1) { cell.classList.add('hit'); cell.textContent = '🔥'; }
        else if (enemy.hits[r][c] === 2) { cell.classList.add('miss'); cell.textContent = '•'; }
        else if (ctx.isMyTurn) cell.onclick = () => fire(r, c);
        eg.append(cell);
      }
      wrap.append(eg, ctx.h('div', { class: 'bs-label' }, '🛡 YOUR FLEET'));
      const mg = ctx.h('div', { class: 'bs-grid mine' });
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const cell = ctx.h('div', { class: 'bs-cell' });
        if (mine.grid[r][c]) cell.classList.add('ship');
        if (mine.hits[r][c] === 1) { cell.classList.add('hit'); cell.textContent = '💥'; }
        else if (mine.hits[r][c] === 2) { cell.classList.add('miss'); cell.textContent = '•'; }
        mg.append(cell);
      }
      wrap.append(mg, ctx.h('div', { class: 'bs-fleet' }, `Enemy ships left: ${remaining(enemy)} · Yours: ${remaining(mine)}`));
      ctx.root.append(wrap);
      ctx.isMyTurn ? ctx.msg('Your turn — take a shot 🎯', ctx.players[me].color) : waiting(ctx);
      function fire(r, c) {
        if (enemy.hits[r][c]) return;
        const s = ctx.clone(ctx.state); const eb = s.boards[1 - me];
        if (eb.grid[r][c]) { eb.hits[r][c] = 1; ctx.sound.good(); } else { eb.hits[r][c] = 2; ctx.sound.bad(); }
        if (remaining(eb) === 0) return ctx.commit(s, me);
        s.turn = 1 - me; ctx.commit(s);
      }
    },
  });
  function makeBoard() {
    const grid = Array.from({ length: 8 }, () => Array(8).fill(0)), hits = Array.from({ length: 8 }, () => Array(8).fill(0));
    for (const sz of [4, 3, 3, 2, 2]) {
      let placed = false, t = 0;
      while (!placed && t++ < 400) {
        const horiz = Math.random() < 0.5, r = rint(8), c = rint(8);
        if (horiz && c + sz > 8) continue; if (!horiz && r + sz > 8) continue;
        let ok = true; for (let k = 0; k < sz; k++) { const rr = r + (horiz ? 0 : k), cc = c + (horiz ? k : 0); if (grid[rr][cc]) { ok = false; break; } }
        if (!ok) continue;
        for (let k = 0; k < sz; k++) { const rr = r + (horiz ? 0 : k), cc = c + (horiz ? k : 0); grid[rr][cc] = 1; }
        placed = true;
      }
    }
    return { grid, hits };
  }
  function remaining(b) { let n = 0; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (b.grid[r][c] && b.hits[r][c] !== 1) n++; return n; }

  /* ---------- 10. MEMORY MATCH ---------- */
  Games.register({
    id: 'memory', name: 'Memory Match', emoji: '🧠', category: 'Luck', accent: '#b266ff',
    tagline: 'Find the pairs.',
    init: host => { const SET = ['💞','🌙','⭐','🍕','🎮','🎧','🌸','🐱']; return { deck: shuffle([...SET, ...SET]), matched: Array(16).fill(false), scores: [0, 0], turn: host, reveal: null }; },
    render(ctx) {
      const st = ctx.state, me = ctx.me; let firstLocal = null;
      ctx.root.append(ctx.turnBar({ scores: st.scores }));
      const grid = ctx.h('div', { class: 'mem' });
      const cards = st.deck.map((e, i) => {
        const shown = st.matched[i] || (st.reveal && st.reveal.includes(i));
        const card = ctx.h('div', { class: 'mem-card' + (shown ? '' : ' down') + (st.matched[i] ? ' matched' : '') + (ctx.isMyTurn && !st.reveal && !st.matched[i] ? ' live' : '') }, shown ? e : '');
        if (ctx.isMyTurn && !st.reveal && !st.matched[i]) card.onclick = () => flip(i, card, e);
        grid.append(card); return card;
      });
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, grid));
      // resolve a mismatch reveal (the player whose turn it is hides them and passes)
      if (st.reveal) {
        if (ctx.isMyTurn) {
          const key = 'mem' + st.reveal.join('-') + st.matched.filter(Boolean).length;
          if (!scheduled.has(key)) { scheduled.add(key); setTimeout(() => { scheduled.delete(key); const s = ctx.clone(st); s.reveal = null; s.turn = 1 - me; ctx.commit(s); }, 900); }
          ctx.msg('No match — passing…', 'var(--ink-dim)');
        } else waiting(ctx);
        return;
      }
      ctx.isMyTurn ? ctx.msg('Your turn — flip two', ctx.players[me].color) : waiting(ctx);
      function flip(i, card, e) {
        if (firstLocal == null) { firstLocal = i; card.classList.remove('down'); card.textContent = e; ctx.sound.tap(); return; }
        if (i === firstLocal) return;
        ctx.sound.tap();
        const s = ctx.clone(st);
        if (st.deck[i] === st.deck[firstLocal]) {
          s.matched[i] = true; s.matched[firstLocal] = true; s.scores[me]++; ctx.sound.good();
          if (s.matched.every(Boolean)) return ctx.commit(s, s.scores[0] === s.scores[1] ? 'draw' : (s.scores[0] > s.scores[1] ? 0 : 1));
          ctx.commit(s); // go again
        } else { s.reveal = [firstLocal, i]; ctx.sound.bad(); ctx.commit(s); }
      }
    },
  });

  /* ---------- 11. WORD DUEL ---------- */
  Games.register({
    id: 'word-duel', name: 'Word Duel', emoji: '🔤', category: 'Word', accent: '#b6ff3a',
    tagline: 'Race to crack the word.',
    init: host => { const W = ['HEART','LOVER','DREAM','SMILE','SPARK','HONEY','BLOOM','CHARM','SWEET','LIGHT','MUSIC','DANCE','PEACE','MAGIC','SHINE','BRAVE','GRACE','LUCKY','HAPPY','CRUSH']; return { answer: W[rint(W.length)], guesses: [], turn: host }; },
    render(ctx) {
      const st = ctx.state, MAX = 8; let cur = '';
      ctx.root.append(ctx.turnBar());
      const gridEl = ctx.h('div', { class: 'wd-grid' });
      const inputRowIndex = st.guesses.length;
      for (let r = 0; r < MAX; r++) {
        const rowEl = ctx.h('div', { class: 'wd-row' });
        const g = st.guesses[r];
        for (let i = 0; i < 5; i++) {
          const t = ctx.h('div', { class: 'wd-t' });
          if (g) { t.textContent = g.word[i]; t.classList.add(g.res[i]); t.append(ctx.h('span', { class: 'pdot', style: `background:${ctx.players[g.by].color}` })); }
          rowEl.append(t);
        }
        gridEl.append(rowEl);
      }
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, gridEl));
      const keyEls = {};
      st.guesses.forEach(g => g.word.split('').forEach((ch, i) => { const rank = { g: 3, y: 2, x: 1 }; if (!keyEls[ch] || rank[g.res[i]] > rank[keyEls[ch]]) keyEls[ch] = g.res[i]; }));
      if (ctx.isMyTurn) {
        const kb = ctx.h('div', { class: 'kb' });
        ['QWERTYUIOP', 'ASDFGHJKL', '↵ZXCVBNM⌫'].forEach(line => {
          const row = ctx.h('div', { class: 'kb-row' });
          [...line].forEach(ch => { const wide = ch === '↵' || ch === '⌫'; const k = ctx.h('button', { class: 'key' + (wide ? ' wide' : '') + (!wide && keyEls[ch] ? ' ' + keyEls[ch] : '') }, ch === '↵' ? 'ENTER' : ch === '⌫' ? 'DEL' : ch); k.onclick = () => press(ch, gridEl, inputRowIndex); row.append(k); });
          kb.append(row);
        });
        ctx.root.append(kb);
        ctx.msg('Your guess — 5 letters', ctx.players[ctx.me].color);
      } else waiting(ctx);
      function press(ch, gridEl, rowIdx) {
        const tiles = gridEl.children[rowIdx].children;
        if (ch === '⌫') { cur = cur.slice(0, -1); }
        else if (ch === '↵') { return submit(); }
        else if (cur.length < 5 && /[A-Z]/.test(ch)) { cur += ch; ctx.sound.tap(); }
        for (let i = 0; i < 5; i++) tiles[i].textContent = cur[i] || '';
      }
      function submit() {
        if (cur.length !== 5) { ctx.sound.bad(); ctx.msg('Need 5 letters!', 'var(--gold)'); return; }
        const res = score(cur, st.answer); ctx.sound.place();
        const s = ctx.clone(st); s.guesses.push({ by: ctx.me, word: cur, res });
        if (cur === st.answer) return ctx.commit(s, ctx.me);
        if (s.guesses.length >= MAX) return ctx.commit(s, 'draw');
        s.turn = 1 - ctx.me; ctx.commit(s);
      }
      function score(g, a) { const res = Array(5).fill('x'), pool = {}; for (const ch of a) pool[ch] = (pool[ch] || 0) + 1; for (let i = 0; i < 5; i++) if (g[i] === a[i]) { res[i] = 'g'; pool[g[i]]--; } for (let i = 0; i < 5; i++) if (res[i] !== 'g' && pool[g[i]] > 0) { res[i] = 'y'; pool[g[i]]--; } return res; }
    },
  });

  /* ---------- 12. HANGMAN ---------- */
  Games.register({
    id: 'hangman', name: 'Hangman', emoji: '🎯', category: 'Word', accent: '#ff2fa6',
    tagline: 'Set a word, save the guesser.',
    init: host => ({ phase: 'set', word: null, guessed: [], wrong: 0, setter: host, turn: host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me, STAGES = ['😀','😬','😟','😰','😨','😵','💀'];
      const guesser = 1 - st.setter;
      if (st.phase === 'set') {
        if (me === st.setter) {
          const inp = ctx.h('input', { class: 'hm-input', placeholder: 'secret word…', maxlength: '14', autocomplete: 'off' });
          ctx.root.append(ctx.h('div', { class: 'board-frame' },
            ctx.h('p', { style: 'color:var(--ink-dim);margin:0 0 12px' }, `Type a word for ${ctx.players[guesser].name} to guess (letters only):`),
            inp, ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: go }, 'Send & start ▶')));
          ctx.msg('You set the word 🤫', ctx.players[me].color); setTimeout(() => inp.focus(), 50);
          function go() { const w = inp.value.toUpperCase().replace(/[^A-Z]/g, ''); if (w.length < 2) { ctx.sound.bad(); ctx.msg('At least 2 letters.', 'var(--gold)'); return; } const s = ctx.clone(st); s.word = w; s.phase = 'play'; s.turn = guesser; ctx.commit(s); }
        } else { ctx.root.append(waitFrame(ctx, `${ctx.players[st.setter].name} is choosing a secret word…`)); waiting(ctx, ctx.players[st.setter].name); }
        return;
      }
      // play phase
      const word = st.word, guessed = st.guessed;
      const fig = ctx.h('div', { class: 'hm-figure' }, STAGES[st.wrong]);
      const life = ctx.h('div', { class: 'hm-life' }, '❤️'.repeat(6 - st.wrong) + '🖤'.repeat(st.wrong));
      const masked = me === guesser ? [...word].map(ch => guessed.includes(ch) ? ch : '_').join(' ')
                                    : [...word].map(ch => guessed.includes(ch) ? ch : '•').join(' '); // setter sees the word fully? show with guessed highlighted; show full to setter
      const wordEl = ctx.h('div', { class: 'hm-word', style: `color:${ctx.players[guesser].color}` }, me === st.setter ? [...word].map(ch => guessed.includes(ch) ? ch : '_').join(' ') : masked);
      ctx.root.append(ctx.h('div', { class: 'board-frame' }, fig, life, wordEl));
      if (me === guesser) {
        const kb = ctx.h('div', { class: 'kb' });
        ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].forEach(line => { const row = ctx.h('div', { class: 'kb-row' }); [...line].forEach(ch => { const used = guessed.includes(ch); const k = ctx.h('button', { class: 'key' + (used ? (word.includes(ch) ? ' g' : ' x') : '') }, ch); if (used) k.disabled = true; else k.onclick = () => guess(ch); row.append(k); }); kb.append(row); });
        ctx.root.append(kb);
        ctx.msg(`Your guess — ${6 - st.wrong} lives left`, ctx.players[guesser].color);
      } else waiting(ctx, ctx.players[guesser].name);
      function guess(ch) {
        if (guessed.includes(ch)) return; const s = ctx.clone(st); s.guessed.push(ch);
        if (word.includes(ch)) { ctx.sound.good(); if ([...word].every(c => s.guessed.includes(c))) return ctx.commit(s, guesser); }
        else { s.wrong++; ctx.sound.bad(); if (s.wrong >= 6) return ctx.commit(s, st.setter); }
        ctx.commit(s);
      }
    },
  });

  /* ---------- 13. ROCK PAPER SCISSORS ---------- */
  Games.register({
    id: 'rps', name: 'Rock Paper Scissors', emoji: '✊', category: 'Luck', accent: '#ffd23a',
    tagline: 'Best of 5 showdown.',
    init: host => ({ scores: [0, 0], picks: [null, null], round: 1, target: 3, phase: 'pick', host }),
    render(ctx) {
      const st = ctx.state, me = ctx.me, HANDS = ['✊', '✋', '✌️'], NAMES = ['Rock', 'Paper', 'Scissors'];
      ctx.root.append(ctx.h('div', { class: 'score-line' }, ctx.h('span', { style: `color:${ctx.players[0].color}` }, ctx.players[0].name + ' ' + st.scores[0]), '  –  ', ctx.h('span', { style: `color:${ctx.players[1].color}` }, st.scores[1] + ' ' + ctx.players[1].name)));
      if (st.phase === 'pick') {
        if (st.picks[me] == null) {
          const row = ctx.h('div', { class: 'rps-pick' });
          HANDS.forEach((e, i) => row.append(ctx.h('button', { class: 'rps-btn', onclick: () => pick(i) }, e)));
          ctx.root.append(ctx.h('div', { class: 'board-frame' }, ctx.h('p', { class: 'center', style: 'color:var(--ink-dim);margin:0 0 4px' }, `Round ${st.round} — pick your weapon ⚔`), row));
          ctx.msg('Choose — your partner can’t see it', ctx.players[me].color);
        } else { ctx.root.append(waitFrame(ctx, `You picked. Waiting for ${ctx.players[1 - me].name}…`)); waiting(ctx, ctx.players[1 - me].name); }
        return;
      }
      // reveal
      const a = st.picks[0], b = st.picks[1];
      const res = a === b ? -1 : ((a - b + 3) % 3 === 1 ? 0 : 1);
      ctx.root.append(ctx.h('div', { class: 'board-frame' },
        ctx.h('div', { class: 'rps-reveal' },
          ctx.h('div', {}, ctx.h('div', { class: 'hand' }, HANDS[a]), ctx.h('div', { class: 'center', style: `color:${ctx.players[0].color};font-weight:700` }, ctx.players[0].name)),
          ctx.h('div', { class: 'vs' }, 'VS'),
          ctx.h('div', {}, ctx.h('div', { class: 'hand' }, HANDS[b]), ctx.h('div', { class: 'center', style: `color:${ctx.players[1].color};font-weight:700` }, ctx.players[1].name))),
        ctx.h('div', { class: 'center', style: 'font-weight:700;font-size:18px' }, res === -1 ? "Tie! 🤝" : `${ctx.players[res].name} wins the round!`)));
      if (me === st.host) {
        ctx.root.append(ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: next }, st.scores[0] >= st.target || st.scores[1] >= st.target ? 'See result 🏆' : 'Next round ▶'));
        ctx.msg(`Score ${st.scores[0]}–${st.scores[1]} (first to ${st.target})`);
      } else { waiting(ctx, ctx.players[st.host].name + ' to continue'); }
      function pick(i) { const s = ctx.clone(st); s.picks[me] = i; ctx.sound.tap(); if (s.picks[1 - me] != null) { const aa = s.picks[0], bb = s.picks[1]; const r = aa === bb ? -1 : ((aa - bb + 3) % 3 === 1 ? 0 : 1); if (r !== -1) s.scores[r]++; s.phase = 'reveal'; ctx.sound.good(); } ctx.commit(s); }
      function next() { const s = ctx.clone(st); if (s.scores[0] >= s.target) return ctx.commit(s, 0); if (s.scores[1] >= s.target) return ctx.commit(s, 1); s.picks = [null, null]; s.phase = 'pick'; s.round++; ctx.commit(s); }
    },
  });

  /* ---------- COUPLE QUIZ ---------- */
  Games.register({
    id: 'couple-quiz', name: 'Who Knows Who?', emoji: '💞', category: 'Couple', accent: '#ff2fa6',
    tagline: 'Guess your partner’s pick.',
    init: host => {
      const Q = [['Beach holiday','Mountain trip'],['Coffee','Chai'],['Early bird','Night owl'],['Save it','Spend it'],['Cats','Dogs'],['Pizza','Biryani'],['Cozy movie night','Big party'],['Texting','Calling'],['Sweet','Spicy'],['Plan everything','Go with the flow'],['Window seat','Aisle seat'],['Sunrise','Sunset']];
      return { questions: shuffle(Q.slice()).slice(0, 6), idx: 0, scores: [0, 0], guess: null, answer: null, phase: 'guess', host };
    },
    render(ctx) {
      const st = ctx.state, me = ctx.me;
      const guesser = st.idx % 2, answerer = 1 - guesser, q = st.questions[st.idx];
      ctx.root.append(ctx.h('div', { class: 'score-line' }, ctx.h('span', { style: `color:${ctx.players[0].color}` }, ctx.players[0].name + ' ' + st.scores[0]), '  –  ', ctx.h('span', { style: `color:${ctx.players[1].color}` }, st.scores[1] + ' ' + ctx.players[1].name)));
      ctx.msg(`Round ${st.idx + 1} of ${st.questions.length}`);
      if (st.phase === 'guess') {
        if (me === guesser) opts(`What will ${ctx.players[answerer].name} pick?`, i => { const s = ctx.clone(st); s.guess = i; s.phase = 'answer'; ctx.sound.tap(); ctx.commit(s); });
        else { ctx.root.append(waitFrame(ctx, `${ctx.players[guesser].name} is guessing what you'd pick…`)); }
        return;
      }
      if (st.phase === 'answer') {
        if (me === answerer) opts(`What's YOUR honest pick?`, i => { const s = ctx.clone(st); s.answer = i; if (s.guess === i) s.scores[guesser]++; s.phase = 'reveal'; (s.guess === i) ? ctx.sound.good() : ctx.sound.bad(); ctx.commit(s); });
        else { ctx.root.append(waitFrame(ctx, `Waiting for ${ctx.players[answerer].name} to answer…`)); }
        return;
      }
      // reveal
      const match = st.guess === st.answer;
      ctx.root.append(ctx.h('div', { class: 'board-frame center' },
        ctx.h('div', { style: 'font-size:50px;margin:10px' }, match ? '💞' : '💔'),
        ctx.h('div', { style: 'font-weight:700;font-size:18px;margin-bottom:8px' }, match ? `${ctx.players[guesser].name} knows ${ctx.players[answerer].name}!` : 'Missed it!'),
        ctx.h('p', { style: 'color:var(--ink-dim)' }, `${ctx.players[answerer].name} picked “${q[st.answer]}”. ${ctx.players[guesser].name} guessed “${q[st.guess]}”.`)));
      if (me === st.host) {
        const last = st.idx + 1 >= st.questions.length;
        ctx.root.append(ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: next }, last ? 'See result 🏆' : 'Next round ▶'));
      } else waiting(ctx, ctx.players[st.host].name + ' to continue');
      function opts(title, cb) {
        ctx.root.append(ctx.h('div', { class: 'board-frame' },
          ctx.h('div', { class: 'cq-q', style: `color:${ctx.players[me].color}` }, title),
          ctx.h('div', { class: 'cq-opts' },
            ctx.h('button', { class: 'cq-opt', onclick: () => cb(0) }, '🅰  ' + q[0]),
            ctx.h('button', { class: 'cq-opt', onclick: () => cb(1) }, '🅱  ' + q[1]))));
      }
      function next() { const s = ctx.clone(st); if (s.idx + 1 >= s.questions.length) return ctx.commit(s, s.scores[0] === s.scores[1] ? 'draw' : (s.scores[0] > s.scores[1] ? 0 : 1)); s.idx++; s.guess = null; s.answer = null; s.phase = 'guess'; ctx.commit(s); }
    },
  });

  function waitFrame(ctx, text) { return ctx.h('div', { class: 'board-frame wait-card' }, ctx.h('div', { class: 'spinner' }), ctx.h('h3', {}, text)); }

})();
