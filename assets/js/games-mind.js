/* ============================================================
   GAMES — Mind, Word, Luck & Couple (8)
   ============================================================ */
(function () {
  const css = `
  .cover{ text-align:center; padding:40px 20px; }
  .cover .ce{ font-size:54px; }
  .cover h3{ font-family:var(--font-display); font-size:14px; margin:14px 0 6px; }
  .cover p{ color:var(--ink-dim); margin:0 0 22px; }

  .bs-wrap{ display:flex; flex-direction:column; gap:8px; }
  .bs-label{ font-family:var(--font-display); font-size:9px; letter-spacing:1px; color:var(--ink-dim); margin:4px 0; }
  .bs-grid{ display:grid; grid-template-columns:repeat(8,1fr); gap:3px; background:rgba(0,120,180,.18);
    padding:5px; border-radius:10px; }
  .bs-grid.mine{ background:rgba(120,70,220,.16); }
  .bs-cell{ aspect-ratio:1; border-radius:5px; background:rgba(0,0,0,.3); display:grid; place-items:center; font-size:13px; }
  .bs-grid.enemy .bs-cell{ cursor:pointer; }
  .bs-grid.enemy .bs-cell:hover{ box-shadow:inset 0 0 0 2px var(--violet); }
  .bs-cell.ship{ background:rgba(180,180,200,.5); }
  .bs-cell.hit{ background:var(--magenta); box-shadow:0 0 8px var(--magenta); }
  .bs-cell.miss{ background:rgba(255,255,255,.08); color:var(--ink-faint); }
  .bs-fleet{ display:flex; gap:8px; justify-content:center; font-size:12px; color:var(--ink-dim); }

  .mem{ display:grid; gap:8px; }
  .mem-card{ aspect-ratio:1; border-radius:12px; font-size:30px; display:grid; place-items:center;
    background:linear-gradient(135deg, var(--panel-2), var(--bg-2)); border:1px solid var(--line);
    cursor:pointer; transition:transform .2s; transform-style:preserve-3d; }
  .mem-card .face{ transition:opacity .15s; }
  .mem-card.down .face{ opacity:0; }
  .mem-card.down{ background:linear-gradient(135deg, var(--violet), var(--magenta)); }
  .mem-card.down::after{ content:'?'; position:absolute; font-family:var(--font-display); color:rgba(255,255,255,.5); font-size:16px; }
  .mem-card{ position:relative; }
  .mem-card.matched{ opacity:.35; transform:scale(.94); }
  .mem-card:active{ transform:scale(.92); }

  .wd-grid{ display:grid; gap:6px; justify-content:center; margin-bottom:14px; }
  .wd-row{ display:grid; grid-template-columns:repeat(5,1fr); gap:6px; }
  .wd-t{ width:46px; height:46px; display:grid; place-items:center; font-weight:900; font-size:22px;
    border:2px solid var(--line); border-radius:8px; text-transform:uppercase; position:relative; }
  .wd-t .pdot{ position:absolute; top:2px; right:3px; width:6px; height:6px; border-radius:50%; }
  .wd-t.g{ background:#2ea043; border-color:#2ea043; color:#fff; }
  .wd-t.y{ background:#d4a72c; border-color:#d4a72c; color:#fff; }
  .wd-t.x{ background:rgba(120,90,140,.4); border-color:transparent; color:#fff; }
  .kb{ display:flex; flex-direction:column; gap:6px; align-items:center; }
  .kb-row{ display:flex; gap:5px; justify-content:center; }
  .key{ min-width:30px; height:46px; padding:0 8px; border-radius:7px; background:var(--panel-2);
    border:1px solid var(--line); color:var(--ink); font-weight:700; font-size:14px; }
  .key.wide{ font-size:11px; }
  .key.g{ background:#2ea043; color:#fff; } .key.y{ background:#d4a72c; color:#fff; } .key.x{ background:rgba(80,60,100,.6); color:#9a90b8; }
  .key:active{ transform:scale(.9); }

  .hm-figure{ font-size:46px; text-align:center; min-height:60px; letter-spacing:4px; }
  .hm-word{ text-align:center; font-family:var(--font-num); font-weight:900; font-size:30px; letter-spacing:8px; margin:10px 0; }
  .hm-life{ text-align:center; font-size:22px; margin-bottom:8px; }

  .rps-pick{ display:flex; gap:14px; justify-content:center; margin:20px 0; }
  .rps-btn{ width:96px; height:96px; border-radius:20px; font-size:46px; background:var(--panel-2);
    border:2px solid var(--line); display:grid; place-items:center; transition:transform .12s; }
  .rps-btn:active{ transform:scale(.88); }
  .rps-reveal{ display:flex; align-items:center; justify-content:center; gap:24px; margin:24px 0; }
  .rps-reveal .hand{ font-size:60px; } .rps-reveal .vs{ font-family:var(--font-display); color:var(--ink-faint); }

  .pig{ text-align:center; }
  .pig-die{ font-size:90px; margin:10px 0; transition:transform .3s; }
  .pig-die.roll{ animation:diespin .5s; }
  @keyframes diespin{ 50%{ transform:rotate(180deg) scale(1.2); } }
  .pig-turn{ font-family:var(--font-num); font-weight:900; font-size:24px; margin:6px 0; }

  .sm{ display:flex; flex-direction:column; gap:10px; }
  .sm-panel{ background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:18px; text-align:center; }
  .sm-panel.top{ transform:rotate(180deg); }
  .sm-panel.p0{ border-color:var(--p1); } .sm-panel.p1{ border-color:var(--p2); }
  .sm-q{ font-family:var(--font-num); font-weight:900; font-size:32px; margin:6px 0 12px; }
  .sm-opts{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .sm-opt{ padding:16px 0; border-radius:12px; font-family:var(--font-num); font-weight:900; font-size:22px;
    background:var(--bg-2); border:1px solid var(--line); color:var(--ink); }
  .sm-opt:active{ transform:scale(.92); }
  .sm-opt.right{ background:#2ea043; color:#fff; } .sm-opt.wrong{ background:var(--magenta); color:#fff; }
  .sm-score{ font-family:var(--font-num); font-weight:900; font-size:20px; }

  .cq-q{ font-size:20px; font-weight:700; text-align:center; margin:20px 10px; line-height:1.4; }
  .cq-opts{ display:flex; flex-direction:column; gap:12px; max-width:360px; margin:0 auto; }
  .cq-opt{ padding:18px; border-radius:14px; font-size:17px; font-weight:600; background:var(--panel-2);
    border:1px solid var(--line); color:var(--ink); }
  .cq-opt:active{ transform:scale(.97); }
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.append(st);

  /* reusable privacy cover */
  function cover(root, ctx, { emoji = '🙈', title, sub, btn = 'I’m ready' }, cb) {
    root.innerHTML = '';
    root.append(ctx.h('div', { class: 'board-frame' },
      ctx.h('div', { class: 'cover' },
        ctx.h('div', { class: 'ce' }, emoji),
        ctx.h('h3', {}, title),
        ctx.h('p', {}, sub || ''),
        ctx.h('button', { class: 'btn btn-primary', onclick: () => { ctx.sound.tap(); cb(); } }, btn),
      )));
  }
  const rint = n => Math.floor(Math.random() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- 9. BATTLESHIP ---------- */
  Games.register({
    id: 'battleship', name: 'Battleship', emoji: '🚢', category: 'Strategy', accent: '#00f0ff',
    tagline: 'Hunt & sink the fleet.',
    mount(root, ctx) {
      const SZ = 8, SHIPS = [4, 3, 3, 2, 2];
      const tb = ctx.turnbar(); tb.set(0);
      const boards = [makeBoard(), makeBoard()];
      let turn = 0, done = false;
      passScreen();

      function makeBoard() {
        const grid = Array.from({ length: SZ }, () => Array(SZ).fill(0)); // 0 water, 1 ship
        const hits = Array.from({ length: SZ }, () => Array(SZ).fill(0)); // 0 none,1 hit,2 miss
        let shipCells = 0;
        for (const s of SHIPS) {
          let placed = false, tries = 0;
          while (!placed && tries++ < 300) {
            const horiz = Math.random() < 0.5;
            const r = rint(SZ), c = rint(SZ);
            if (horiz && c + s > SZ) continue; if (!horiz && r + s > SZ) continue;
            let ok = true;
            for (let k = 0; k < s; k++) { const rr = r + (horiz ? 0 : k), cc = c + (horiz ? k : 0); if (grid[rr][cc]) { ok = false; break; } }
            if (!ok) continue;
            for (let k = 0; k < s; k++) { const rr = r + (horiz ? 0 : k), cc = c + (horiz ? k : 0); grid[rr][cc] = 1; }
            placed = true; shipCells += s;
          }
        }
        return { grid, hits, total: shipCells };
      }
      function remaining(b) { let n = 0; for (let r = 0; r < SZ; r++) for (let c = 0; c < SZ; c++) if (b.grid[r][c] && b.hits[r][c] !== 1) n++; return n; }

      function passScreen() {
        if (done) return;
        cover(root, ctx, { emoji: '🤝', title: `Pass to ${ctx.players[turn].name}`, sub: 'Other player, look away! Then tap below.', btn: `I'm ${ctx.players[turn].name} — Fire!` }, renderTurn);
      }
      function renderTurn() {
        root.innerHTML = '';
        const enemy = boards[1 - turn], me = boards[turn];
        const wrap = ctx.h('div', { class: 'board-frame bs-wrap' });
        wrap.append(ctx.h('div', { class: 'bs-label' }, '🎯 ENEMY WATERS — tap to fire'));
        const eg = ctx.h('div', { class: 'bs-grid enemy' });
        for (let r = 0; r < SZ; r++) for (let c = 0; c < SZ; c++) {
          const cell = ctx.h('div', { class: 'bs-cell', onclick: () => fire(r, c) });
          if (enemy.hits[r][c] === 1) { cell.classList.add('hit'); cell.textContent = '🔥'; }
          else if (enemy.hits[r][c] === 2) { cell.classList.add('miss'); cell.textContent = '•'; }
          eg.append(cell);
        }
        wrap.append(eg);
        wrap.append(ctx.h('div', { class: 'bs-label' }, '🛡 YOUR FLEET'));
        const mg = ctx.h('div', { class: 'bs-grid mine' });
        for (let r = 0; r < SZ; r++) for (let c = 0; c < SZ; c++) {
          const cell = ctx.h('div', { class: 'bs-cell' });
          if (me.grid[r][c]) cell.classList.add('ship');
          if (me.hits[r][c] === 1) { cell.classList.add('hit'); cell.textContent = '💥'; }
          else if (me.hits[r][c] === 2) { cell.classList.add('miss'); cell.textContent = '•'; }
          mg.append(cell);
        }
        wrap.append(mg);
        wrap.append(ctx.h('div', { class: 'bs-fleet' }, `Enemy ships left: ${remaining(enemy)} · Yours: ${remaining(me)}`));
        root.append(wrap);
        ctx.msg(`${ctx.players[turn].name}, take your shot 🎯`, ctx.players[turn].color);

        function fire(r, c) {
          if (done || enemy.hits[r][c]) return;
          if (enemy.grid[r][c]) { enemy.hits[r][c] = 1; ctx.sound.good(); }
          else { enemy.hits[r][c] = 2; ctx.sound.bad(); }
          if (remaining(enemy) === 0) { done = true; renderTurn(); return ctx.win(turn, 'Enemy fleet destroyed! 🌊'); }
          renderTurn();
          ctx.msg(enemy.grid[r][c] ? 'HIT! 🔥' : 'Miss… 🌊', enemy.grid[r][c] ? 'var(--lime)' : 'var(--ink-dim)');
          setTimeout(() => { turn = 1 - turn; tb.set(turn); passScreen(); }, 850);
        }
      }
    },
  });

  /* ---------- 10. MEMORY MATCH ---------- */
  Games.register({
    id: 'memory', name: 'Memory Match', emoji: '🧠', category: 'Luck', accent: '#b266ff',
    tagline: 'Find the pairs.',
    mount(root, ctx) {
      const SET = ['💞','🌙','⭐','🍕','🎮','🎧','🌸','🐱'];
      const deck = shuffle([...SET, ...SET].map((e, i) => ({ e, i })));
      const tb = ctx.turnbar(); tb.set(0); tb.score(0, 0);
      let turn = 0, first = null, busy = false, scores = [0, 0], matched = 0;
      const grid = ctx.h('div', { class: 'mem' });
      grid.style.gridTemplateColumns = 'repeat(4,1fr)'; grid.style.maxWidth = '380px';
      const cards = deck.map((d, idx) => {
        const card = ctx.h('div', { class: 'mem-card down', onclick: () => flip(idx) }, ctx.h('span', { class: 'face' }, d.e));
        grid.append(card); return card;
      });
      root.append(ctx.h('div', { class: 'board-frame' }, grid));
      status();
      function flip(i) {
        if (busy || !cards[i].classList.contains('down') || (first && first.i === i)) return;
        cards[i].classList.remove('down'); ctx.sound.tap();
        if (!first) { first = { i, e: deck[i].e }; return; }
        busy = true;
        if (deck[i].e === first.e) {
          ctx.sound.good(); cards[i].classList.add('matched'); cards[first.i].classList.add('matched');
          scores[turn]++; matched++; tb.score(scores[0], scores[1]); first = null; busy = false;
          if (matched === SET.length) { return scores[0] === scores[1] ? ctx.draw(`${scores[0]}–${scores[1]} pairs`) : ctx.win(scores[0] > scores[1] ? 0 : 1, `${scores[0]}–${scores[1]} pairs`); }
          ctx.msg(`${ctx.players[turn].name} found a pair! Go again 🎁`, ctx.players[turn].color);
        } else {
          ctx.sound.bad();
          setTimeout(() => { cards[i].classList.add('down'); cards[first.i].classList.add('down'); first = null; busy = false; turn = 1 - turn; tb.set(turn); status(); }, 750);
        }
      }
      function status() { ctx.msg(`${ctx.players[turn].name}'s turn — flip two`, ctx.players[turn].color); }
    },
  });

  /* ---------- 11. WORD DUEL ---------- */
  Games.register({
    id: 'word-duel', name: 'Word Duel', emoji: '🔤', category: 'Word', accent: '#b6ff3a',
    tagline: 'Race to crack the word.',
    mount(root, ctx) {
      const WORDS = ['HEART','LOVER','DREAM','SMILE','SPARK','HONEY','BLOOM','CHARM','SWEET','LIGHT','MUSIC','DANCE','PEACE','MAGIC','SHINE','BRAVE','GRACE','LUCKY','HAPPY','CRUSH','ADORE','FANCY','GLEAM','BLISS','CANDY'];
      const answer = WORDS[rint(WORDS.length)];
      const MAX = 8; const tb = ctx.turnbar({ score: false }); tb.set(0);
      let turn = 0, row = 0, cur = '', done = false;
      const keyState = {};
      const gridEl = ctx.h('div', { class: 'wd-grid' });
      const rows = [];
      for (let r = 0; r < MAX; r++) { const rowEl = ctx.h('div', { class: 'wd-row' }); const ts = []; for (let i = 0; i < 5; i++) { const t = ctx.h('div', { class: 'wd-t' }); ts.push(t); rowEl.append(t); } rows.push(ts); gridEl.append(rowEl); }
      const kbEl = ctx.h('div', { class: 'kb' });
      const layout = ['QWERTYUIOP', 'ASDFGHJKL', '↵ZXCVBNM⌫'];
      const keyEls = {};
      layout.forEach(line => {
        const r = ctx.h('div', { class: 'kb-row' });
        [...line].forEach(ch => {
          const wide = ch === '↵' || ch === '⌫';
          const k = ctx.h('button', { class: 'key' + (wide ? ' wide' : ''), onclick: () => press(ch) }, ch === '↵' ? 'ENTER' : ch === '⌫' ? 'DEL' : ch);
          if (!wide) keyEls[ch] = k; r.append(k);
        });
        kbEl.append(r);
      });
      root.append(ctx.h('div', { class: 'board-frame' }, gridEl), kbEl);
      ctx.msg(`${ctx.players[0].name} guesses first — 5 letters`, ctx.players[0].color);
      function press(ch) {
        if (done) return;
        if (ch === '⌫') { cur = cur.slice(0, -1); paintRow(); return; }
        if (ch === '↵') { submit(); return; }
        if (cur.length < 5 && /[A-Z]/.test(ch)) { cur += ch; ctx.sound.tap(); paintRow(); }
      }
      function paintRow() { for (let i = 0; i < 5; i++) rows[row][i].textContent = cur[i] || ''; rows[row][0].parentElement.querySelectorAll('.wd-t').forEach((t, i) => { let d = t.querySelector('.pdot'); }); }
      function submit() {
        if (cur.length !== 5) { ctx.sound.bad(); ctx.msg('Need 5 letters!', 'var(--gold)'); return; }
        const res = score(cur, answer);
        for (let i = 0; i < 5; i++) {
          const t = rows[row][i]; t.textContent = cur[i]; t.classList.add(res[i]);
          const dot = ctx.h('span', { class: 'pdot', style: `background:${ctx.players[turn].color}` }); t.append(dot);
          const k = keyEls[cur[i]]; if (k) { const rank = { g: 3, y: 2, x: 1 }; if (rank[res[i]] > rank[(k._s || 'x')] || !k._s) { k.className = 'key ' + res[i]; k._s = res[i]; } }
        }
        ctx.sound.place();
        if (cur === answer) { done = true; return ctx.win(turn, `Cracked it: ${answer}!`); }
        row++; cur = '';
        if (row >= MAX) { done = true; return ctx.draw(`The word was ${answer}`); }
        turn = 1 - turn; tb.set(turn);
        ctx.msg(`${ctx.players[turn].name}'s guess`, ctx.players[turn].color);
      }
      function score(g, a) {
        const res = Array(5).fill('x'); const pool = {};
        for (const ch of a) pool[ch] = (pool[ch] || 0) + 1;
        for (let i = 0; i < 5; i++) if (g[i] === a[i]) { res[i] = 'g'; pool[g[i]]--; }
        for (let i = 0; i < 5; i++) if (res[i] !== 'g' && pool[g[i]] > 0) { res[i] = 'y'; pool[g[i]]--; }
        return res;
      }
    },
  });

  /* ---------- 12. HANGMAN ---------- */
  Games.register({
    id: 'hangman', name: 'Hangman', emoji: '🎯', category: 'Word', accent: '#ff2fa6',
    tagline: 'Set a word, save the man.',
    mount(root, ctx) {
      const STAGES = ['😀','😬','😟','😰','😨','😵','💀'];
      const tb = ctx.turnbar({ score: false });
      let setter = 0; // player who sets the word
      askWord();
      function askWord() {
        root.innerHTML = '';
        cover(root, ctx, { emoji: '✍️', title: `${ctx.players[setter].name}, set a secret word`, sub: `${ctx.players[1 - setter].name}, look away!`, btn: 'Type the word' }, inputWord);
      }
      function inputWord() {
        root.innerHTML = '';
        const inp = ctx.h('input', { type: 'text', class: '', style: 'width:100%;background:var(--bg-2);border:1px solid var(--line);border-radius:12px;padding:14px;color:var(--ink);font-size:18px;letter-spacing:3px;text-transform:uppercase;outline:none;', placeholder: 'secret word…', maxlength: '14', autocomplete: 'off' });
        const card = ctx.h('div', { class: 'board-frame' },
          ctx.h('p', { style: 'color:var(--ink-dim);margin:0 0 12px' }, `Word for ${ctx.players[1 - setter].name} to guess (letters only):`),
          inp,
          ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: go }, 'Hide & Start ▶'),
        );
        root.append(card); inp.focus();
        function go() {
          const w = inp.value.toUpperCase().replace(/[^A-Z]/g, '');
          if (w.length < 2) { ctx.sound.bad(); ctx.msg('Use at least 2 letters.', 'var(--gold)'); return; }
          play(w);
        }
      }
      function play(word) {
        const guesser = 1 - setter; let wrong = 0, guessed = new Set(), done = false;
        function render() {
          root.innerHTML = '';
          const fig = ctx.h('div', { class: 'hm-figure' }, STAGES[wrong]);
          const life = ctx.h('div', { class: 'hm-life' }, '❤️'.repeat(6 - wrong) + '🖤'.repeat(wrong));
          const masked = [...word].map(ch => guessed.has(ch) ? ch : '_').join(' ');
          const wordEl = ctx.h('div', { class: 'hm-word', style: `color:${ctx.players[guesser].color}` }, masked);
          const kb = ctx.h('div', { class: 'kb' });
          ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].forEach(line => {
            const r = ctx.h('div', { class: 'kb-row' });
            [...line].forEach(ch => {
              const used = guessed.has(ch); const inWord = word.includes(ch);
              const k = ctx.h('button', { class: 'key' + (used ? (inWord ? ' g' : ' x') : ''), onclick: () => guess(ch) }, ch);
              if (used) k.disabled = true; r.append(k);
            });
            kb.append(r);
          });
          root.append(ctx.h('div', { class: 'board-frame' }, fig, life, wordEl), kb);
          ctx.msg(`${ctx.players[guesser].name} is guessing — ${6 - wrong} lives left`, ctx.players[guesser].color);
        }
        function guess(ch) {
          if (done || guessed.has(ch)) return; guessed.add(ch);
          if (word.includes(ch)) {
            ctx.sound.good();
            if ([...word].every(c => guessed.has(c))) { done = true; render(); return ctx.win(guesser, `Saved! The word was ${word}`); }
          } else {
            wrong++; ctx.sound.bad();
            if (wrong >= 6) { done = true; render(); return ctx.win(setter, `Hanged! The word was ${word}`); }
          }
          render();
        }
        render();
      }
    },
  });

  /* ---------- 13. ROCK PAPER SCISSORS ---------- */
  Games.register({
    id: 'rps', name: 'Rock Paper Scissors', emoji: '✊', category: 'Luck', accent: '#ffd23a',
    tagline: 'Best of 5 showdown.',
    mount(root, ctx) {
      const TARGET = 3; const HANDS = [{ n: 'Rock', e: '✊' }, { n: 'Paper', e: '✋' }, { n: 'Scissors', e: '✌️' }];
      const tb = ctx.turnbar(); tb.set(0); tb.score(0, 0);
      let scores = [0, 0], picks = [null, null];
      pickScreen(0);
      function pickScreen(p) {
        tb.set(p);
        cover(root, ctx, { emoji: '🤫', title: `${ctx.players[p].name}, pick in secret`, sub: 'Other player, no peeking!', btn: 'Show my choices' }, () => choose(p));
      }
      function choose(p) {
        root.innerHTML = '';
        const wrap = ctx.h('div', { class: 'board-frame' });
        wrap.append(ctx.h('p', { class: 'center', style: 'color:var(--ink-dim);margin:6px 0 0' }, `${ctx.players[p].name}, choose:`));
        const row = ctx.h('div', { class: 'rps-pick' });
        HANDS.forEach((hd, i) => row.append(ctx.h('button', { class: 'rps-btn', onclick: () => { picks[p] = i; ctx.sound.tap(); if (p === 0) pickScreen(1); else reveal(); } }, hd.e)));
        wrap.append(row); root.append(wrap);
        ctx.msg('Tap your weapon ⚔', ctx.players[p].color);
      }
      function reveal() {
        root.innerHTML = '';
        const a = picks[0], b = picks[1];
        let res = 0; // 0 tie, 1 p1, 2 p2
        if (a !== b) res = (a === (b + 1) % 3) ? 1 : 2;
        if (res === 1) scores[0]++; else if (res === 2) scores[1]++;
        tb.score(scores[0], scores[1]);
        const wrap = ctx.h('div', { class: 'board-frame' },
          ctx.h('div', { class: 'rps-reveal' },
            ctx.h('div', {}, ctx.h('div', { class: 'hand' }, HANDS[a].e), ctx.h('div', { class: 'center', style: `color:${ctx.players[0].color};font-weight:700` }, ctx.players[0].name)),
            ctx.h('div', { class: 'vs' }, 'VS'),
            ctx.h('div', {}, ctx.h('div', { class: 'hand' }, HANDS[b].e), ctx.h('div', { class: 'center', style: `color:${ctx.players[1].color};font-weight:700` }, ctx.players[1].name)),
          ),
          ctx.h('div', { class: 'center', style: 'font-weight:700;font-size:18px' }, res === 0 ? "It's a tie! 🤝" : `${ctx.players[res - 1].name} wins the round!`),
        );
        const next = ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: cont }, 'Next round ▶');
        root.append(wrap, next);
        res === 0 ? ctx.sound.draw() : ctx.sound.good();
        ctx.msg(`Score: ${scores[0]} – ${scores[1]} (first to ${TARGET})`);
        function cont() {
          if (scores[0] >= TARGET) return ctx.win(0, `${scores[0]}–${scores[1]}`);
          if (scores[1] >= TARGET) return ctx.win(1, `${scores[0]}–${scores[1]}`);
          picks = [null, null]; pickScreen(0);
        }
      }
    },
  });

  /* ---------- 14. DICE PIG ---------- */
  Games.register({
    id: 'dice-pig', name: 'Dice Duel', emoji: '🎲', category: 'Luck', accent: '#00f0ff',
    tagline: 'Push your luck to 100.',
    mount(root, ctx) {
      const TARGET = 100; const FACE = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
      const tb = ctx.turnbar(); tb.set(0); tb.score(0, 0);
      let turn = 0, total = [0, 0], pot = 0, done = false, rolling = false;
      const wrap = ctx.h('div', { class: 'board-frame pig' });
      const die = ctx.h('div', { class: 'pig-die' }, '🎲');
      const potEl = ctx.h('div', { class: 'pig-turn' }, 'Turn total: 0');
      const btnRoll = ctx.h('button', { class: 'btn btn-primary', onclick: roll }, '🎲 Roll');
      const btnHold = ctx.h('button', { class: 'btn btn-ghost', onclick: hold }, '🏦 Bank');
      wrap.append(die, potEl, ctx.h('div', { class: 'game-controls' }, btnRoll, btnHold));
      root.append(wrap);
      status();
      function roll() {
        if (done || rolling) return; rolling = true; die.classList.add('roll'); ctx.sound.move();
        const v = 1 + rint(6);
        setTimeout(() => {
          die.classList.remove('roll'); die.textContent = FACE[v]; rolling = false;
          if (v === 1) { pot = 0; ctx.sound.bad(); potEl.textContent = 'Rolled a 1 — bust! 💥'; setTimeout(swap, 700); }
          else { pot += v; potEl.textContent = `Turn total: ${pot} (banked ${total[turn]})`; ctx.sound.tap(); if (total[turn] + pot >= TARGET) { hold(); } }
        }, 450);
      }
      function hold() {
        if (done || rolling) return; total[turn] += pot; tb.score(total[0], total[1]); pot = 0; ctx.sound.good();
        if (total[turn] >= TARGET) { done = true; return ctx.win(turn, `${total[0]}–${total[1]}`); }
        swap();
      }
      function swap() { pot = 0; turn = 1 - turn; tb.set(turn); die.textContent = '🎲'; potEl.textContent = 'Turn total: 0'; status(); }
      function status() { ctx.msg(`${ctx.players[turn].name}'s turn — roll or bank (first to ${TARGET})`, ctx.players[turn].color); }
    },
  });

  /* ---------- 15. SPEED MATH ---------- */
  Games.register({
    id: 'speed-math', name: 'Speed Math', emoji: '➗', category: 'Reflex', accent: '#b6ff3a',
    tagline: 'Race to 10 correct.',
    mount(root, ctx) {
      const TARGET = 10; let scores = [0, 0], started = false, done = false;
      const panels = [], states = [{}, {}];
      const container = ctx.h('div', { class: 'sm' });
      // top panel (player 2, rotated), bottom panel (player 1)
      panels[1] = makePanel(1, true); panels[0] = makePanel(0, false);
      container.append(panels[1], panels[0]); root.append(container);
      countdown();
      function makePanel(p, top) {
        const q = ctx.h('div', { class: 'sm-q', style: `color:${ctx.players[p].color}` }, '');
        const opts = ctx.h('div', { class: 'sm-opts' });
        const scoreEl = ctx.h('div', { class: 'sm-score', style: `color:${ctx.players[p].color}` }, `${ctx.players[p].name}: 0 / ${TARGET}`);
        const panel = ctx.h('div', { class: 'sm-panel p' + p + (top ? ' top' : '') }, scoreEl, q, opts);
        states[p] = { q, opts, scoreEl };
        return panel;
      }
      function newProblem(p) {
        const op = ['+', '-', '×'][rint(3)]; let a, b, ans;
        if (op === '+') { a = 2 + rint(18); b = 2 + rint(18); ans = a + b; }
        else if (op === '-') { a = 5 + rint(20); b = 1 + rint(a - 1); ans = a - b; }
        else { a = 2 + rint(9); b = 2 + rint(9); ans = a * b; }
        const opts = new Set([ans]); while (opts.size < 3) { const d = ans + (rint(11) - 5); if (d >= 0) opts.add(d); }
        const arr = shuffle([...opts]);
        states[p].q.textContent = `${a} ${op} ${b}`;
        states[p].opts.innerHTML = '';
        arr.forEach(v => { const o = ctx.h('button', { class: 'sm-opt', onclick: () => answer(p, v, ans, o) }, v); states[p].opts.append(o); });
      }
      function answer(p, v, ans, el) {
        if (done || !started) return;
        if (v === ans) { el.classList.add('right'); ctx.sound.good(); scores[p]++; states[p].scoreEl.textContent = `${ctx.players[p].name}: ${scores[p]} / ${TARGET}`; if (scores[p] >= TARGET) { done = true; return ctx.win(p, `${scores[0]}–${scores[1]} correct`); } setTimeout(() => newProblem(p), 120); }
        else { el.classList.add('wrong'); ctx.sound.bad(); setTimeout(() => el.classList.remove('wrong'), 300); }
      }
      function countdown() {
        let n = 3; ctx.msg('Get ready…', 'var(--gold)');
        states[0].q.textContent = '3'; states[1].q.textContent = '3'; ctx.sound.countdown();
        const iv = setInterval(() => {
          n--;
          if (n > 0) { states[0].q.textContent = n; states[1].q.textContent = n; ctx.sound.countdown(); }
          else { clearInterval(iv); started = true; ctx.sound.win(); ctx.msg('GO! First to 10 wins 🏁', 'var(--lime)'); newProblem(0); newProblem(1); }
        }, 800);
        ctx.onCleanup(() => clearInterval(iv));
      }
    },
  });

  /* ---------- 16. COUPLE QUIZ ---------- */
  Games.register({
    id: 'couple-quiz', name: 'Who Knows Who?', emoji: '💞', category: 'Couple', accent: '#ff2fa6',
    tagline: 'Guess your partner’s pick.',
    mount(root, ctx) {
      const QUESTIONS = [
        ['Beach holiday', 'Mountain trip'], ['Coffee', 'Chai'], ['Early bird', 'Night owl'],
        ['Save it', 'Spend it'], ['Cats', 'Dogs'], ['Pizza', 'Biryani'],
        ['Cozy movie night', 'Big party'], ['Texting', 'Calling'], ['Sweet', 'Spicy'],
        ['Plan everything', 'Go with the flow'], ['Window seat', 'Aisle seat'], ['Sunrise', 'Sunset'],
      ];
      const rounds = shuffle(QUESTIONS.slice()).slice(0, 6);
      const tb = ctx.turnbar(); tb.set(0); tb.score(0, 0);
      let idx = 0, scores = [0, 0], guess = null;
      nextRound();
      function nextRound() {
        if (idx >= rounds.length) {
          if (scores[0] === scores[1]) return ctx.draw(`${scores[0]}–${scores[1]} — perfectly in sync 💞`);
          return ctx.win(scores[0] > scores[1] ? 0 : 1, `${scores[0]}–${scores[1]} — knows the other best!`);
        }
        const guesser = idx % 2, other = 1 - guesser; tb.set(guesser);
        guessScreen(guesser, other);
      }
      function guessScreen(guesser, other) {
        const [A, B] = rounds[idx];
        root.innerHTML = '';
        const wrap = ctx.h('div', { class: 'board-frame' },
          ctx.h('div', { class: 'cq-q', style: `color:${ctx.players[guesser].color}` }, `${ctx.players[guesser].name}, what will ${ctx.players[other].name} pick?`),
          ctx.h('div', { class: 'cq-opts' },
            ctx.h('button', { class: 'cq-opt', onclick: () => { guess = 0; ctx.sound.tap(); answerScreen(guesser, other); } }, '🅰  ' + A),
            ctx.h('button', { class: 'cq-opt', onclick: () => { guess = 1; ctx.sound.tap(); answerScreen(guesser, other); } }, '🅱  ' + B),
          ),
        );
        root.append(wrap);
        ctx.msg(`Round ${idx + 1} of ${rounds.length}`, ctx.players[guesser].color);
      }
      function answerScreen(guesser, other) {
        cover(root, ctx, { emoji: '💌', title: `Pass to ${ctx.players[other].name}`, sub: `${ctx.players[guesser].name} made a guess. Your turn to answer honestly!`, btn: `I'm ${ctx.players[other].name}` }, () => {
          const [A, B] = rounds[idx];
          root.innerHTML = '';
          const wrap = ctx.h('div', { class: 'board-frame' },
            ctx.h('div', { class: 'cq-q', style: `color:${ctx.players[other].color}` }, `${ctx.players[other].name}, what's YOUR pick?`),
            ctx.h('div', { class: 'cq-opts' },
              ctx.h('button', { class: 'cq-opt', onclick: () => reveal(guesser, other, 0) }, '🅰  ' + A),
              ctx.h('button', { class: 'cq-opt', onclick: () => reveal(guesser, other, 1) }, '🅱  ' + B),
            ),
          );
          root.append(wrap);
        });
      }
      function reveal(guesser, other, real) {
        const match = guess === real; if (match) scores[guesser]++;
        tb.score(scores[0], scores[1]); match ? ctx.sound.good() : ctx.sound.bad();
        const [A, B] = rounds[idx];
        root.innerHTML = '';
        const wrap = ctx.h('div', { class: 'board-frame center' },
          ctx.h('div', { style: 'font-size:50px;margin:10px' }, match ? '💞' : '💔'),
          ctx.h('div', { style: 'font-weight:700;font-size:18px;margin-bottom:8px' }, match ? `${ctx.players[guesser].name} knows ${ctx.players[other].name}!` : 'Missed it!'),
          ctx.h('p', { style: 'color:var(--ink-dim)' }, `${ctx.players[other].name} picked “${real ? B : A}”. ${ctx.players[guesser].name} guessed “${guess ? B : A}”.`),
        );
        const next = ctx.h('button', { class: 'btn btn-primary btn-block mt', onclick: () => { idx++; guess = null; nextRound(); } }, idx + 1 >= rounds.length ? 'See result 🏆' : 'Next round ▶');
        root.append(wrap, next);
        ctx.msg(`Score: ${scores[0]} – ${scores[1]}`);
      }
    },
  });

})();
