/* ============================================================
   UI — online lobby, presence, identity, networked game stage
   ============================================================ */

/* ---------- DOM helpers ---------- */
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
const clone = o => JSON.parse(JSON.stringify(o));

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

/* ---------- shared turn/score bar (rebuilt from state each paint) ---------- */
function turnBar(ctx, opts = {}) {
  const s = Store.get(); const turn = ctx.state.turn;
  function chip(i) {
    const active = turn === i;
    const sc = opts.scores ? h('span', { class: 'sc' }, String(opts.scores[i])) : '';
    const kids = i === 0 ? [h('span', { class: 'dot' }), h('span', {}, s.players[0].name), sc]
                         : [sc, h('span', {}, s.players[1].name), h('span', { class: 'dot' })];
    const c = h('div', { class: 'turnchip p' + i + (active ? ' active' : '') }, kids);
    if (i === ctx.me) c.append(h('span', { class: 'you-tag' }, ' (you)'));
    return c;
  }
  return h('div', { class: 'turnbar' }, chip(0), chip(1));
}

/* ---------- result overlay ---------- */
const Overlay = (() => {
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
  function show({ emoji, title, sub, party = true }, onAgain, onHome) {
    $('#resultEmoji').textContent = emoji;
    $('#resultTitle').innerHTML = title;
    $('#resultSub').innerHTML = sub || '';
    if (party) confetti(); else $('#confetti').innerHTML = '';
    $('#resAgain').textContent = '↻ Rematch';
    $('#resHome').textContent = '🏠 Lobby';
    $('#resultOverlay').hidden = false;
    $('#resAgain').onclick = () => { hide(); onAgain && onAgain(); };
    $('#resHome').onclick = () => { hide(); onHome && onHome(); };
  }
  function hide() { $('#resultOverlay').hidden = true; $('#confetti').innerHTML = ''; }
  return { show, hide };
})();

/* ============================================================
   NET STATE — single source of truth for presence + active match
   ============================================================ */
let presence = {};        // { 0:{online,name,ts}, 1:{...} }
let currentMatch = null;  // active match object or null
let stageHook = null;     // set by the stage controller while a game is mounted

function initNet() {
  Store.onCloud(() => {
    const me = Store.getIdentity();
    if (me != null) Store.Net.goOnline(me, Store.get().players[me].name);
    Store.Net.watchPresence(p => { presence = p || {}; if (isLobby()) renderHome(); });
    Store.Net.watchMatch(m => {
      currentMatch = m;
      if (stageHook) stageHook(m);
      else if (isLobby()) renderHome();
    });
  });
}
const isLobby = () => (location.hash === '' || location.hash === '#/' );
const partnerSeat = me => (me === 0 ? 1 : 0);
const isOnline = seat => !!(presence && presence[seat] && presence[seat].online);

/* ============================================================
   ROUTER
   ============================================================ */
const Router = (() => {
  function go() {
    stageHook = null;
    // identity gate
    if (Store.getIdentity() == null) { renderIdentity(); syncChrome('#/'); return; }
    const hash = location.hash || '#/';
    Overlay.hide();
    const m = hash.match(/^#\/play\/(.+)$/);
    if (m) renderStage(m[1]);
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
   IDENTITY GATE — "who's on this device?"
   ============================================================ */
function renderIdentity() {
  const s = Store.get(); const view = $('#view'); view.innerHTML = '';
  const card = h('div', { class: 'id-gate' },
    h('div', { class: 'id-logo' }, 'S × M'),
    h('h2', {}, 'Who’s on this phone?'),
    h('p', {}, 'Pick yourself — your moves go to your seat. (You can switch later on the Us tab.)'),
    h('div', { class: 'id-pick' },
      s.players.map((p, i) => h('button', {
        class: 'id-btn p' + i,
        onclick: () => { Store.setIdentity(i); if (Store.Net.ready()) Store.Net.goOnline(i, p.name); location.hash = '#/'; Router.go(); },
      }, h('span', { class: 'av' }, p.emoji), h('span', { class: 'nm' }, p.name))),
    ),
  );
  view.append(card);
}

/* ============================================================
   HOME / LOBBY
   ============================================================ */
let homeFilter = 'All', homeSearch = '';
function renderHome() {
  const s = Store.get(); const me = Store.getIdentity(); const partner = partnerSeat(me);
  const view = $('#view'); view.innerHTML = '';

  // identity + presence strip
  const youOn = isOnline(me), pOn = isOnline(partner);
  const strip = h('div', { class: 'lobby-strip' },
    h('div', { class: 'lp me p' + me }, h('span', { class: 'av' }, s.players[me].emoji),
      h('span', {}, s.players[me].name, h('small', {}, ' (you)'))),
    h('div', { class: 'lp-vs' }, '×'),
    h('div', { class: 'lp p' + partner }, h('span', { class: 'pres ' + (pOn ? 'on' : 'off') }),
      h('span', { class: 'av' }, s.players[partner].emoji),
      h('span', {}, s.players[partner].name, h('small', {}, pOn ? ' online' : ' offline'))),
  );

  // cloud / match banners
  const banners = h('div', {});
  if (!Store.Net.ready()) {
    banners.append(h('div', { class: 'banner warn' }, '⚠ Not connected to the cloud — online play needs Firebase. Check your connection.'));
  }
  const inviteBanner = matchBanner(me);
  if (inviteBanner) banners.append(inviteBanner);

  // hero (compact)
  const hero = h('section', { class: 'hero mini' },
    h('h1', { html: `<span class="c">${esc(s.players[0].name)}</span><span class="vs">VS</span><span class="m">${esc(s.players[1].name)}</span>` }),
    h('div', { class: 'mini-tally' }, `${s.totals.p1} — ${s.totals.p2}`),
    h('p', {}, pOn ? `${esc(s.players[partner].name)} is online. Pick a game to challenge them! 🎮`
                   : `${esc(s.players[partner].name)} is offline. Start a game and they’ll get the invite when they open the app. 💌`),
  );

  // search + filters
  const search = h('div', { class: 'search' }, h('span', { class: 'si' }, '🔎'),
    h('input', { type: 'text', placeholder: 'Search games…', value: homeSearch, oninput: e => { homeSearch = e.target.value; paint(); } }));
  const cats = ['All', 'Favorites', ...Games.categories()];
  const chips = h('div', { class: 'chips' }, cats.map(c => h('button', {
    class: 'chip' + (homeFilter === c ? ' active' : ''),
    onclick: () => { homeFilter = c; renderHome(); Store.Sound.tap(); },
  }, c === 'Favorites' ? '★ Faves' : c)));

  const gridWrap = h('div', { class: 'grid', id: 'gameGrid' });
  view.append(strip, banners, hero, h('div', { class: 'toolbar' }, search, chips), gridWrap);
  paint();

  function paint() {
    const q = homeSearch.trim().toLowerCase();
    let games = Games.all();
    if (homeFilter === 'Favorites') games = games.filter(g => s.favorites.includes(g.id));
    else if (homeFilter !== 'All') games = games.filter(g => g.category === homeFilter);
    if (q) games = games.filter(g => (g.name + ' ' + g.tagline + ' ' + g.category).toLowerCase().includes(q));
    const grid = $('#gameGrid'); grid.innerHTML = '';
    if (!games.length) { grid.append(h('div', { class: 'empty-note' }, '👀 No games match.')); return; }
    games.forEach((g, i) => grid.append(gameCard(g, s, i)));
  }
}

function matchBanner(me) {
  const m = currentMatch; if (!m || m.status === 'finished') return null;
  const g = Games.byId(m.gameId); if (!g) return null;
  const s = Store.get();
  if (m.status === 'waiting' && m.host !== me) {
    return h('div', { class: 'banner invite' },
      h('span', {}, `💌 ${esc(s.players[m.host].name)} invited you to `, h('b', {}, g.emoji + ' ' + g.name)),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => joinMatch() }, 'Join'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => Store.Net.clearMatch() }, 'Decline'),
    );
  }
  // your own waiting match, or an active game → resume
  const label = m.status === 'waiting' ? 'Waiting for your partner…' : 'Game in progress';
  return h('div', { class: 'banner resume' },
    h('span', {}, `🎮 ${esc(label)}: `, h('b', {}, g.emoji + ' ' + g.name)),
    h('button', { class: 'btn btn-primary btn-sm', onclick: () => { location.hash = '#/play/' + m.gameId; } }, 'Resume'),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => Store.Net.clearMatch() }, 'End'),
  );
}

function gameCard(g, s, i) {
  const pg = s.perGame[g.id];
  const isFav = s.favorites.includes(g.id);
  const tag = pg && pg.plays ? `${g.tagline} · ${pg.plays}× played` : g.tagline;
  const card = h('a', {
    class: 'gcard' + (isFav ? ' is-fav' : ''), href: 'javascript:void 0',
    style: `--accent:${g.accent}; animation-delay:${Math.min(i * 32, 480)}ms`,
    onclick: () => startMatch(g.id),
  },
    h('span', { class: 'gcat' }, g.category), h('span', { class: 'fav' }, '★'),
    h('span', { class: 'emoji' }, g.emoji), h('span', { class: 'gname' }, g.name), h('span', { class: 'gtag' }, tag),
  );
  let lp;
  card.addEventListener('contextmenu', e => { e.preventDefault(); Store.toggleFav(g.id); renderHome(); });
  card.addEventListener('touchstart', () => { lp = setTimeout(() => { Store.toggleFav(g.id); Store.Sound.good(); renderHome(); }, 550); }, { passive: true });
  card.addEventListener('touchend', () => clearTimeout(lp));
  card.addEventListener('touchmove', () => clearTimeout(lp));
  return card;
}

/* ============================================================
   MATCH LIFECYCLE
   ============================================================ */
function startMatch(gameId) {
  const me = Store.getIdentity();
  if (!Store.Net.ready()) { alert('Not connected to the cloud yet — online play needs your internet + Firebase. Try again in a moment.'); return; }
  Store.Sound.place();
  if (currentMatch && currentMatch.status !== 'finished' && currentMatch.gameId !== gameId) {
    if (!confirm('Start a new game? This ends the current one.')) return;
  }
  const state = Games.byId(gameId).init(me);
  Store.Net.setMatch({ gameId, host: me, status: 'waiting', state, winner: null, by: me, t: Date.now() })
    .catch(err => { console.error(err); alert('Could not start the game online.\n\nYour Firebase rules likely need updating to allow "matches" and "presence" (see database.rules.json in the repo, then republish in the Realtime Database → Rules tab).\n\n' + err.message); location.hash = '#/'; });
  location.hash = '#/play/' + gameId;
}
function joinMatch() {
  Store.Sound.good();
  Store.Net.updateMatch({ status: 'active', t: Date.now() });
  if (currentMatch) location.hash = '#/play/' + currentMatch.gameId;
}
function rematch(gameId) {
  const me = Store.getIdentity();
  const state = Games.byId(gameId).init(me);
  Store.Net.updateMatch({ state, winner: null, status: 'active', host: me, by: me, t: Date.now() });
}
function exitMatch() { Store.Net.clearMatch(); location.hash = '#/'; }

/* ============================================================
   NETWORKED GAME STAGE
   ============================================================ */
function renderStage(gameId) {
  const game = Games.byId(gameId);
  const view = $('#view'); view.innerHTML = '';
  if (!game) { view.append(h('div', { class: 'empty-note' }, 'Game not found.')); return; }
  const me = Store.getIdentity();
  const s = Store.get();

  const head = h('div', { class: 'stage-head' },
    h('h2', { style: `color:${game.accent}` }, game.emoji + ' ' + game.name),
    h('p', {}, game.tagline));
  const mount = h('div', { class: 'game-wrap', id: 'gameMount' });
  const msg = h('div', { class: 'game-msg', id: 'gameMsg' });
  const stage = h('div', { class: 'stage' }, head, mount, msg);
  view.append(stage);

  let shownFinished = false;

  function paint() {
    const m = currentMatch;
    if (!m || m.gameId !== gameId) { // match ended/replaced elsewhere
      mount.innerHTML = ''; mount.append(waitCard('This game ended.', 'Back to lobby', exitMatch)); return;
    }
    if (m.status === 'waiting') {
      const partner = partnerSeat(me);
      if (m.host === me) {
        mount.innerHTML = '';
        mount.append(waitCard(`Waiting for ${s.players[partner].name} to join…`,
          isOnline(partner) ? `${s.players[partner].name} is online — they’ll see the invite now.` : `${s.players[partner].name} is offline — they’ll get it when they open the app.`,
          null, true));
        msg.textContent = '';
      } else {
        // we're the invitee but somehow on the stage before joining
        mount.innerHTML = '';
        mount.append(waitCard(`${s.players[m.host].name} invited you!`, '', null, false,
          h('button', { class: 'btn btn-primary', onclick: joinMatch }, 'Join game')));
      }
      return;
    }
    // active or finished → render the game from state
    mount.innerHTML = '';
    const state = m.state;
    const ctx = {
      root: mount, h, $, esc, clone, players: s.players.map(p => ({ name: p.name, emoji: p.emoji, color: p.color })),
      state, me, turn: state.turn, isMyTurn: (state.turn === me) && m.status === 'active',
      status: m.status, sound: Store.Sound, turnBar: o => turnBar(ctx, o),
      msg: (t, c) => { msg.innerHTML = t; msg.style.color = c || 'var(--ink-dim)'; },
      commit: (nextState, winner) => commitMove(gameId, nextState, winner),
      seat: i => s.players[i],
    };
    try { game.render(ctx); } catch (e) { console.error(e); msg.textContent = '⚠ ' + e.message; }

    if (m.status === 'finished' && !shownFinished) {
      shownFinished = true;
      const w = m.winner;
      setTimeout(() => {
        let res;
        if (w === 'draw' || w == null) res = { emoji: '🤝', title: 'Dead Heat!', sub: 'Nobody wins this round.', party: false };
        else { const p = s.players[w]; res = { emoji: p.emoji, title: `${esc(p.name)} WINS!`, sub: winLine(game, w), party: true }; }
        Store.Sound[(w === 'draw' || w == null) ? 'draw' : 'win']();
        Overlay.show(res, () => { shownFinished = false; rematch(gameId); }, exitMatch);
      }, 450);
    }
    if (m.status === 'finished') { shownFinished = shownFinished; }
  }

  function commitMove(gid, nextState, winner) {
    if (!currentMatch || currentMatch.status !== 'active') return;
    const finishing = winner !== undefined;
    // optimistic local update for instant feedback
    currentMatch = Object.assign({}, currentMatch, { state: nextState, winner: finishing ? winner : null, status: finishing ? 'finished' : 'active' });
    paint();
    Store.Net.updateMatch({ state: nextState, winner: finishing ? winner : null, status: finishing ? 'finished' : 'active', by: me, t: Date.now() });
    if (finishing) Store.recordResult(gid, winner === 'draw' ? 'draw' : (winner === 0 ? 'p1' : 'p2'));
  }

  // react to live match changes while mounted
  stageHook = (m) => {
    if (!m) { exitMatch(); return; }
    if (m.status === 'active' && shownFinished) shownFinished = false; // rematch started
    paint();
  };
  paint();
}

function waitCard(title, sub, onBtn, spinner, extraBtn) {
  return h('div', { class: 'board-frame wait-card' },
    spinner ? h('div', { class: 'spinner' }) : h('div', { class: 'ce' }, '💞'),
    h('h3', {}, title),
    sub ? h('p', {}, sub) : '',
    extraBtn || (onBtn ? h('button', { class: 'btn btn-primary mt', onclick: onBtn }, 'OK') : h('button', { class: 'btn btn-ghost mt', onclick: exitMatch }, 'Cancel')),
  );
}

function winLine(g, idx) {
  const lines = ['Flawless. 💅', 'GG — well played!', 'Bragging rights: claimed.', 'Victory tastes sweet. 🍬',
    'Champion of ' + g.name + '!', 'The crowd goes wild! 🎉', 'Run it back?'];
  return lines[Math.floor((Date.now() / 1000) % lines.length)];
}

/* ============================================================
   SCORES
   ============================================================ */
function renderScores() {
  const s = Store.get(); const view = $('#view'); view.innerHTML = '';
  const { p1, p2, draws } = s.totals; const total = p1 + p2; const pct = total ? Math.round((p1 / total) * 100) : 50;
  view.append(
    h('div', { class: 'score-hero' }, h('h2', {}, '⚔ THE RIVALRY ⚔'),
      h('div', { class: 'bigvs' },
        h('div', { class: 'col c1' }, h('div', { class: 'av' }, s.players[0].emoji), h('div', { class: 'nm' }, s.players[0].name), h('div', { class: 'big' }, String(p1))),
        h('div', { class: 'mid' }, ':'),
        h('div', { class: 'col c2' }, h('div', { class: 'av' }, s.players[1].emoji), h('div', { class: 'nm' }, s.players[1].name), h('div', { class: 'big' }, String(p2))))),
    h('div', { class: 'meter' }, h('div', { class: 'fill', style: `width:${pct}%` })),
    h('div', { class: 'meter-labels' }, h('span', { style: 'color:var(--p1)' }, `${s.players[0].name} ${pct}%`), h('span', { style: 'color:var(--p2)' }, `${s.players[1].name} ${100 - pct}%`)),
    h('div', { class: 'stat-row' },
      h('div', { class: 'stat' }, h('div', { class: 'v' }, String(total + draws)), h('div', { class: 'k' }, 'MATCHES')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, String(draws)), h('div', { class: 'k' }, 'DRAWS')),
      h('div', { class: 'stat' }, h('div', { class: 'v', style: 'font-size:18px' }, s.streak.n ? `${(s.streak.who === 'p1' ? s.players[0] : s.players[1]).name} ×${s.streak.n}` : '—'), h('div', { class: 'k' }, 'STREAK'))),
  );
  const lead = h('div', { class: 'lead-list' }, h('div', { class: 'sec-label' }, 'BY GAME'));
  const played = Games.all().filter(g => s.perGame[g.id] && s.perGame[g.id].plays);
  if (!played.length) lead.append(h('div', { class: 'empty-note' }, 'No games played yet. Go make history. 🎮'));
  played.sort((a, b) => s.perGame[b.id].plays - s.perGame[a.id].plays).forEach(g => {
    const pg = s.perGame[g.id];
    lead.append(h('div', { class: 'lead-item' }, h('div', { class: 'le' }, g.emoji),
      h('div', { class: 'lname' }, g.name, h('small', {}, `${pg.plays} played${pg.draws ? ' · ' + pg.draws + ' draws' : ''}`)),
      h('div', { class: 'lsc' }, h('span', { class: 'a' }, String(pg.p1)), h('span', { class: 'sl' }, '–'), h('span', { class: 'b' }, String(pg.p2)))));
  });
  view.append(lead, h('div', { class: 'danger-zone' },
    h('button', { class: 'btn btn-ghost', onclick: () => { if (confirm('Reset ALL scores for good?')) { Store.resetScores(); renderScores(); } } }, '🗑 Reset all scores')));
}

/* ============================================================
   US (profiles + identity + settings)
   ============================================================ */
const EMOJIS = ['🦊','🦋','🐯','🐼','🦄','🐙','🦁','🐢','🐝','🦖','👾','🤖','😎','🥰','🔥','⭐'];
function renderUs() {
  const s = Store.get(); const me = Store.getIdentity(); const view = $('#view'); view.innerHTML = '';

  // identity card
  const idCard = h('div', { class: 'card' }, h('h3', {}, 'THIS DEVICE IS'),
    h('div', { class: 'id-switch' }, s.players.map((p, i) => h('button', {
      class: 'id-mini p' + i + (me === i ? ' sel' : ''),
      onclick: () => { Store.setIdentity(i); if (Store.Net.ready()) Store.Net.goOnline(i, p.name); renderUs(); Store.Sound.tap(); },
    }, p.emoji + ' ' + p.name))),
    h('p', { class: 'hint' }, 'Set who is playing on this phone. Your partner sets the other on their phone.'));

  function profileCard(idx) {
    const p = s.players[idx];
    const card = h('div', { class: 'card' }, h('h3', {}, `PLAYER ${idx + 1}`));
    card.append(h('div', { class: 'field' }, h('label', {}, 'Name'),
      h('input', { type: 'text', value: p.name, maxlength: '14', onchange: e => Store.setPlayer(idx, { name: e.target.value.trim() || ('Player ' + (idx + 1)) }) })));
    card.append(h('div', { class: 'field' }, h('label', {}, 'Avatar'),
      h('div', { class: 'emoji-pick' }, EMOJIS.map(em => h('button', { class: p.emoji === em ? 'sel' : '', onclick: () => { Store.setPlayer(idx, { emoji: em }); renderUs(); Store.Sound.tap(); } }, em)))));
    return card;
  }

  const set = h('div', { class: 'card' }, h('h3', {}, 'SETTINGS'));
  set.append(toggleRow('🔊 Sound effects', s.settings.sound, v => { Store.setSetting('sound', v); renderUs(); }));
  set.append(toggleRow('☀️ Light mode', s.settings.theme === 'light', v => { Store.setSetting('theme', v ? 'light' : 'dark'); document.body.classList.toggle('light', v); renderUs(); }));
  set.append(h('p', { class: 'hint' }, Store.isCloud() ? '☁ Cloud connected — you can play live with your partner across phones.' : '📱 Offline / not connected — online play needs Firebase + internet.'));

  view.append(h('div', { class: 'sec-label' }, '📱 IDENTITY'), idCard,
    h('div', { class: 'sec-label' }, '👤 PLAYERS'), profileCard(0), profileCard(1),
    h('div', { class: 'sec-label' }, '⚙ APP'), set,
    h('div', { class: 'card' }, h('h3', {}, 'MAKE IT AN APP'), h('p', { class: 'hint' }, 'On your phone: browser menu → “Add to Home Screen” to launch full-screen and offline. 📲')),
    h('div', { class: 'love-note', html: `Built with neon and love for <b>${esc(s.players[0].name)}</b> &amp; <b>${esc(s.players[1].name)}</b>. Miles apart, still playing. 💞` }));
}
function toggleRow(label, on, onChange) {
  return h('div', { class: 'toggle-row', onclick: () => { onChange(!on); Store.Sound.tap(); } }, h('span', {}, label), h('div', { class: 'switch' + (on ? ' on' : '') }, h('i')));
}
