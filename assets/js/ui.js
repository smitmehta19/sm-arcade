/* ============================================================
   UI — game registry, router, pages, game-stage context
   ============================================================ */

/* ---------- tiny DOM helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
    else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  }
  kids.flat().forEach(c => e.append(c instanceof Node ? c : document.createTextNode(c)));
  return e;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- game registry ---------- */
const Games = (() => {
  const list = [];
  return {
    register: def => list.push(def),
    all: () => list.slice(),
    byId: id => list.find(g => g.id === id),
    categories: () => [...new Set(list.map(g => g.category))],
  };
})();

/* ---------- result overlay + confetti ---------- */
const Overlay = (() => {
  const el = () => $('#resultOverlay');
  function confetti() {
    const box = $('#confetti'); box.innerHTML = '';
    const colors = ['#00f0ff', '#ff2fa6', '#b266ff', '#ffd23a', '#b6ff3a'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = (0.9 + Math.random() * 1.1) + 's';
      c.style.animationDelay = (Math.random() * 0.3) + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      box.append(c);
    }
  }
  function show({ emoji, title, sub, party = true }, onAgain) {
    $('#resultEmoji').textContent = emoji;
    $('#resultTitle').innerHTML = title;
    $('#resultSub').innerHTML = sub || '';
    if (party) confetti(); else $('#confetti').innerHTML = '';
    el().hidden = false;
    $('#resAgain').onclick = () => { hide(); onAgain && onAgain(); };
    $('#resHome').onclick = () => { hide(); location.hash = '#/'; };
  }
  function hide() { el().hidden = true; $('#confetti').innerHTML = ''; }
  return { show, hide };
})();

/* ============================================================
   ROUTER
   ============================================================ */
const Router = (() => {
  let cleanup = null;
  function go() {
    if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
    const hash = location.hash || '#/';
    const view = $('#view');
    view.innerHTML = '';
    Overlay.hide();
    const m = hash.match(/^#\/play\/(.+)$/);
    if (m) { cleanup = renderGame(m[1]); }
    else if (hash.startsWith('#/scores')) renderScores();
    else if (hash.startsWith('#/us')) renderUs();
    else renderHome();
    syncChrome(hash);
    window.scrollTo(0, 0);
  }
  return { go };
})();

function syncChrome(hash) {
  const inGame = hash.startsWith('#/play/');
  $('#backBtn').hidden = !inGame;
  $('#bottomnav').classList.toggle('hide', inGame);
  $$('.nav-item').forEach(n => {
    const r = n.dataset.route;
    const on = (r === 'home' && (hash === '#/' || hash === '' || hash.startsWith('#/play')))
            || (r === 'scores' && hash.startsWith('#/scores'))
            || (r === 'us' && hash.startsWith('#/us'));
    n.classList.toggle('active', on);
  });
}

/* ============================================================
   HOME
   ============================================================ */
let homeFilter = 'All', homeSearch = '';
function renderHome() {
  const s = Store.get();
  const view = $('#view');

  const hero = h('section', { class: 'hero' },
    h('h1', { html: `<span class="c">${esc(s.players[0].name)}</span><span class="vs">VS</span><span class="m">${esc(s.players[1].name)}</span>` }),
    h('p', {}, 'Your private arcade. 20 games, one rivalry, eternal bragging rights.'),
    h('div', { class: 'insert-coin' }, '▸ INSERT COIN — PICK A GAME ◂'),
  );

  // versus banner
  const total = s.totals.p1 + s.totals.p2;
  const banner = h('div', { class: 'vs-banner' },
    sideEl(s.players[0], s.totals.p1, s.totals.p2, 's1'),
    h('div', { class: 'vs-mid' }, 'VS'),
    sideEl(s.players[1], s.totals.p2, s.totals.p1, 's2'),
  );
  const rivalry = h('div', { class: 'rivalry' }, rivalryLine(s));

  // toolbar
  const search = h('div', { class: 'search' },
    h('span', { class: 'si' }, '🔎'),
    h('input', { type: 'text', placeholder: 'Search games…', value: homeSearch,
      oninput: e => { homeSearch = e.target.value; paint(); } }),
  );
  const cats = ['All', 'Favorites', ...Games.categories()];
  const chips = h('div', { class: 'chips' },
    cats.map(c => h('button', {
      class: 'chip' + (homeFilter === c ? ' active' : ''),
      onclick: () => { homeFilter = c; renderHome(); Store.Sound.tap(); },
    }, c === 'Favorites' ? '★ Faves' : c)),
  );

  const gridWrap = h('div', { class: 'grid', id: 'gameGrid' });

  view.append(hero, banner, rivalry, h('div', { class: 'toolbar' }, search, chips), gridWrap);
  paint();

  function paint() {
    const q = homeSearch.trim().toLowerCase();
    let games = Games.all();
    if (homeFilter === 'Favorites') games = games.filter(g => s.favorites.includes(g.id));
    else if (homeFilter !== 'All') games = games.filter(g => g.category === homeFilter);
    if (q) games = games.filter(g => (g.name + ' ' + g.tagline + ' ' + g.category).toLowerCase().includes(q));

    const grid = $('#gameGrid'); grid.innerHTML = '';
    if (!games.length) { grid.append(h('div', { class: 'empty-note' }, '👀 No games match. Try another search.')); return; }
    games.forEach((g, i) => grid.append(gameCard(g, s, i)));
  }
}

function sideEl(p, mine, theirs, cls) {
  return h('div', { class: 'vs-side ' + cls },
    h('div', { class: 'av' }, p.emoji),
    h('div', { class: 'nm' }, p.name),
    h('div', { class: 'wins' }, String(mine)),
    h('div', { class: 'wl' }, `${mine}W · ${theirs}L`),
  );
}

function gameCard(g, s, i) {
  const pg = s.perGame[g.id];
  const isFav = s.favorites.includes(g.id);
  const tag = pg && pg.plays
    ? `${g.tagline} · played ${pg.plays}×`
    : g.tagline;
  const card = h('a', {
    class: 'gcard' + (isFav ? ' is-fav' : ''),
    href: '#/play/' + g.id,
    style: `--accent:${g.accent}; animation-delay:${Math.min(i * 35, 500)}ms`,
    onclick: () => Store.Sound.place(),
  },
    h('span', { class: 'gcat' }, g.category),
    h('span', { class: 'fav' }, '★'),
    h('span', { class: 'emoji' }, g.emoji),
    h('span', { class: 'gname' }, g.name),
    h('span', { class: 'gtag' }, tag),
  );
  // long-press / right-click to favorite
  let lp;
  card.addEventListener('contextmenu', e => { e.preventDefault(); Store.toggleFav(g.id); renderHome(); });
  card.addEventListener('touchstart', () => { lp = setTimeout(() => { Store.toggleFav(g.id); Store.Sound.good(); renderHome(); }, 550); }, { passive: true });
  card.addEventListener('touchend', () => clearTimeout(lp));
  card.addEventListener('touchmove', () => clearTimeout(lp));
  return card;
}

function rivalryLine(s) {
  const { p1, p2 } = s.totals;
  const n1 = s.players[0].name, n2 = s.players[1].name;
  if (p1 + p2 === 0) return '💞 First match awaits. Loser owes the winner a kiss. 😘';
  if (s.streak.n >= 3) {
    const who = s.streak.who === 'p1' ? n1 : n2;
    return `🔥 ${who} is on a ${s.streak.n}-win streak. Somebody stop them!`;
  }
  if (p1 === p2) return `⚖️ Dead even at ${p1}–${p2}. This means war.`;
  const lead = p1 > p2 ? n1 : n2;
  const diff = Math.abs(p1 - p2);
  if (diff >= 8) return `👑 ${lead} is absolutely dominating. Time for a comeback?`;
  return `📊 ${lead} leads by ${diff}. The gap is closing… or is it?`;
}

/* ============================================================
   SCORES
   ============================================================ */
function renderScores() {
  const s = Store.get();
  const view = $('#view');
  const { p1, p2, draws } = s.totals;
  const total = p1 + p2;
  const pct = total ? Math.round((p1 / total) * 100) : 50;

  const hero = h('div', { class: 'score-hero' },
    h('h2', {}, '⚔ THE RIVALRY ⚔'),
    h('div', { class: 'bigvs' },
      h('div', { class: 'col c1' }, h('div', { class: 'av' }, s.players[0].emoji), h('div', { class: 'nm' }, s.players[0].name), h('div', { class: 'big' }, String(p1))),
      h('div', { class: 'mid' }, ':'),
      h('div', { class: 'col c2' }, h('div', { class: 'av' }, s.players[1].emoji), h('div', { class: 'nm' }, s.players[1].name), h('div', { class: 'big' }, String(p2))),
    ),
  );
  const meter = h('div', { class: 'meter' }, h('div', { class: 'fill', style: `width:${pct}%` }));
  const mlabels = h('div', { class: 'meter-labels' },
    h('span', { style: `color:var(--p1)` }, `${s.players[0].name} ${pct}%`),
    h('span', { style: `color:var(--p2)` }, `${s.players[1].name} ${100 - pct}%`),
  );

  const streakTxt = s.streak.n ? `${(s.streak.who === 'p1' ? s.players[0] : s.players[1]).name} ×${s.streak.n}` : '—';
  const stats = h('div', { class: 'stat-row' },
    h('div', { class: 'stat' }, h('div', { class: 'v' }, String(total + draws)), h('div', { class: 'k' }, 'MATCHES')),
    h('div', { class: 'stat' }, h('div', { class: 'v' }, String(draws)), h('div', { class: 'k' }, 'DRAWS')),
    h('div', { class: 'stat' }, h('div', { class: 'v', style: 'font-size:18px' }, streakTxt), h('div', { class: 'k' }, 'STREAK')),
  );

  // per-game leaderboard
  const lead = h('div', { class: 'lead-list' });
  lead.append(h('div', { class: 'sec-label' }, 'BY GAME'));
  const played = Games.all().filter(g => s.perGame[g.id] && s.perGame[g.id].plays);
  if (!played.length) lead.append(h('div', { class: 'empty-note' }, 'No games played yet. Go make some history. 🎮'));
  played
    .sort((a, b) => s.perGame[b.id].plays - s.perGame[a.id].plays)
    .forEach(g => {
      const pg = s.perGame[g.id];
      lead.append(h('div', { class: 'lead-item' },
        h('div', { class: 'le' }, g.emoji),
        h('div', { class: 'lname' }, g.name, h('small', {}, `${pg.plays} played${pg.draws ? ' · ' + pg.draws + ' draws' : ''}`)),
        h('div', { class: 'lsc' }, h('span', { class: 'a' }, String(pg.p1)), h('span', { class: 'sl' }, '–'), h('span', { class: 'b' }, String(pg.p2))),
      ));
    });

  const danger = h('div', { class: 'danger-zone' },
    h('button', {
      class: 'btn btn-ghost',
      onclick: () => { if (confirm('Reset ALL scores for good? This cannot be undone.')) { Store.resetScores(); renderScores(); } },
    }, '🗑 Reset all scores'),
  );

  view.append(hero, meter, mlabels, stats, lead, danger);
}

/* ============================================================
   US (profiles + settings)
   ============================================================ */
const EMOJIS = ['🦊','🦋','🐯','🐼','🦄','🐙','🦁','🐢','🐝','🦖','👾','🤖','😎','🥰','🔥','⭐'];
function renderUs() {
  const s = Store.get();
  const view = $('#view');

  function profileCard(idx) {
    const p = s.players[idx];
    const card = h('div', { class: 'card' }, h('h3', {}, `PLAYER ${idx + 1}`));
    const nameField = h('div', { class: 'field' },
      h('label', {}, 'Name'),
      h('input', { type: 'text', value: p.name, maxlength: '14',
        onchange: e => Store.setPlayer(idx, { name: e.target.value.trim() || ('Player ' + (idx + 1)) }) }),
    );
    const pick = h('div', { class: 'emoji-pick' },
      EMOJIS.map(em => h('button', {
        class: p.emoji === em ? 'sel' : '',
        onclick: () => { Store.setPlayer(idx, { emoji: em }); renderUs(); Store.Sound.tap(); },
      }, em)),
    );
    card.append(nameField, h('div', { class: 'field' }, h('label', {}, 'Avatar'), pick));
    return card;
  }

  // settings card
  const set = h('div', { class: 'card' }, h('h3', {}, 'SETTINGS'));
  set.append(toggleRow('🔊 Sound effects', s.settings.sound, v => { Store.setSetting('sound', v); renderUs(); }));
  set.append(toggleRow('☀️ Light mode', s.settings.theme === 'light', v => {
    Store.setSetting('theme', v ? 'light' : 'dark');
    document.body.classList.toggle('light', v); renderUs();
  }));
  const syncInfo = Store.isCloud()
    ? '☁ Cloud sync is ON — scores stay matched across both your phones.'
    : '📱 Local mode — scores save on this device. Add Firebase keys in config.js to sync across phones.';
  set.append(h('p', { class: 'hint' }, syncInfo));

  // install hint
  const inst = h('div', { class: 'card' }, h('h3', {}, 'MAKE IT AN APP'),
    h('p', { class: 'hint' }, 'On your phone: open this site in your browser → Share / menu → “Add to Home Screen”. It’ll launch full-screen like a real app, and works offline. 📲'));

  const note = h('div', { class: 'love-note', html:
    `Built with neon and love, just for <b>${esc(s.players[0].name)}</b> &amp; <b>${esc(s.players[1].name)}</b>. <br/>May the best player win… and may the loser be a graceful one. 💞` });

  view.append(
    h('div', { class: 'sec-label' }, '👤 PLAYERS'),
    profileCard(0), profileCard(1),
    h('div', { class: 'sec-label' }, '⚙ APP'),
    set, inst, note,
  );
}
function toggleRow(label, on, onChange) {
  const sw = h('div', { class: 'switch' + (on ? ' on' : '') }, h('i'));
  const row = h('div', { class: 'toggle-row', onclick: () => { onChange(!on); Store.Sound.tap(); } },
    h('span', {}, label), sw);
  return row;
}

/* ============================================================
   GAME STAGE  +  context handed to each game
   ============================================================ */
function renderGame(id) {
  const g = Games.byId(id);
  const view = $('#view');
  if (!g) { view.append(h('div', { class: 'empty-note' }, 'Game not found.')); return null; }
  const s = Store.get();

  const head = h('div', { class: 'stage-head' },
    h('h2', { style: `color:${g.accent}` }, g.emoji + ' ' + g.name),
    h('p', {}, g.tagline),
  );
  const mount = h('div', { class: 'game-wrap', id: 'gameMount' });
  const msg = h('div', { class: 'game-msg', id: 'gameMsg' });
  const stage = h('div', { class: 'stage' }, head, mount, msg);
  view.append(stage);

  let cleanups = [];
  let finished = false;

  const ctx = {
    game: g,
    players: s.players.map(p => ({ name: p.name, emoji: p.emoji, color: p.color })),
    root: mount,
    h, $, $$,
    sound: Store.Sound,
    msg: (txt, color) => { msg.innerHTML = txt; msg.style.color = color || 'var(--ink-dim)'; },
    onCleanup: fn => cleanups.push(fn),

    /* a reusable turn/score bar */
    turnbar: (opts = {}) => {
      const showScore = opts.score !== false;
      const c1 = h('div', { class: 'turnchip p1' }, h('span', { class: 'dot' }), h('span', {}, s.players[0].name),
        showScore ? h('span', { class: 'sc', id: 'tbS1' }, '0') : '');
      const c2 = h('div', { class: 'turnchip p2' }, showScore ? h('span', { class: 'sc', id: 'tbS2' }, '0') : '',
        h('span', {}, s.players[1].name), h('span', { class: 'dot' }));
      const bar = h('div', { class: 'turnbar' }, c1, c2);
      stage.insertBefore(bar, mount);
      return {
        el: bar,
        set(idx) { c1.classList.toggle('active', idx === 0); c2.classList.toggle('active', idx === 1); },
        score(a, b) { const e1 = $('#tbS1'), e2 = $('#tbS2'); if (e1) e1.textContent = a; if (e2) e2.textContent = b; },
        label(i, txt) { (i === 0 ? c1 : c2).querySelectorAll('span')[i === 0 ? 1 : 1].textContent = txt; },
      };
    },

    /* end-of-game */
    win: (idx, sub) => finish(idx, sub),
    draw: sub => finish('draw', sub),
    finish: (winnerIdx, opts = {}) => finish(winnerIdx, opts.sub, opts),
  };

  function finish(winner, sub, opts = {}) {
    if (finished) return; finished = true;
    let res;
    if (winner === 'draw' || winner == null) {
      Store.recordResult(g.id, 'draw'); Store.Sound.draw();
      res = { emoji: '🤝', title: 'Dead Heat!', sub: sub || 'Nobody wins this round.', party: false };
    } else {
      const p = ctx.players[winner];
      Store.recordResult(g.id, winner === 0 ? 'p1' : 'p2'); Store.Sound.win();
      res = { emoji: p.emoji, title: `${esc(p.name)} WINS!`, sub: sub || winLine(g, winner), party: true };
    }
    if (opts.emoji) res.emoji = opts.emoji;
    if (opts.title) res.title = opts.title;
    setTimeout(() => Overlay.show(res, () => { location.hash = '#/play/' + g.id; setTimeout(Router.go, 0); }), 420);
  }

  // mount the game; protect against errors
  try { const c = g.mount(mount, ctx); if (typeof c === 'function') cleanups.push(c); }
  catch (e) { console.error(e); ctx.msg('⚠ This game hit a snag: ' + e.message, 'var(--magenta)'); }

  return () => cleanups.forEach(fn => { try { fn(); } catch (e) {} });
}

function winLine(g, idx) {
  const lines = ['Flawless. 💅', 'GG — well played!', 'Add it to the record books.', 'Victory tastes sweet. 🍬',
    'Bragging rights: claimed.', 'The crowd goes wild! 🎉', 'Too easy? Run it back.', 'Champion of ' + g.name + '!'];
  return lines[Math.floor((Date.now() / 1000) % lines.length)];
}
