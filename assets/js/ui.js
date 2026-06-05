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

/* ---------- short how-to-play rules per game ---------- */
const GAME_RULES = {
  'tic-tac-toe': ['Take turns placing your mark (✕ or ◯) on the grid.', 'First to get 3 in a row — across, down, or diagonally — wins.', 'Block your partner while building your own line!'],
  'connect-four': ['Tap a column to drop your disc; it falls to the lowest open slot.', 'Connect 4 of your discs in a line — horizontal, vertical, or diagonal — to win.', 'Stack and block to set up sneaky traps.'],
  'dots-boxes': ['On your turn, draw one line between two dots.', 'Complete the 4th side of a box to claim it (your emoji appears) — and you get another turn!', 'Most boxes once the grid is full wins.'],
  'checkers': ['Move your pieces diagonally forward, one square.', 'Jump over your partner’s piece into an empty square to capture it — captures are forced, and you can chain multiple jumps in one turn.', 'Reach the far row to become a King (moves both directions).', 'Capture all their pieces — or leave them with no move — to win.'],
  'reversi': ['Place a disc so it traps a straight line of your partner’s discs between two of yours — those flip to your color.', 'You must make a flipping move; if you can’t, your turn is passed.', 'When the board fills, the most discs of your color wins.'],
  'gomoku': ['Take turns placing a stone on any empty point.', 'First to line up 5 stones in a row — any direction — wins.', 'Watch their lines and block before they reach five!'],
  'battleship': ['First, arrange your 5 ships on your own waters — tap a ship, set ↔/↕ direction, tap to drop it (or hit 🎲 Random). The host places first, then you.', 'Once both fleets are set, take turns firing at ENEMY WATERS. 🔥 = hit, • = miss.', 'Sink your partner’s entire fleet before they sink yours.'],
  'memory': ['On your turn, flip two cards.', 'Match a pair → you keep it and flip again. No match → they flip back and it’s your partner’s turn.', 'Most pairs when all are found wins. Remember where things are!'],
  'word-duel': ['There’s a secret 5-letter word; you take turns guessing it.', 'Tiles: 🟩 right letter & spot · 🟨 right letter, wrong spot · ⬛ not in the word.', 'First to guess the word wins. The little dot shows who made each guess.'],
  'hangman': ['One of you secretly types a word; the other tries to guess it.', 'The guesser picks letters — 6 wrong guesses completes the figure.', 'Guesser wins by revealing the whole word; the setter wins if the guesser runs out of lives.'],
  'rps': ['Each of you secretly picks Rock ✊, Paper ✋, or Scissors ✌️.', 'Rock beats Scissors, Scissors beats Paper, Paper beats Rock.', 'First to win 3 rounds takes the match.'],
  'couple-quiz': ['The host picks a vibe — 💕 Sweet, 😂 Funny, 🌶️ Spicy, or 🎲 Mix.', 'Take turns: one guesses what the other will pick between two options; then the other reveals their honest answer.', 'A correct guess scores a point. Whoever knows the other best wins! 💞'],
  'pentago': ['On your turn do TWO things: place one marble on any empty spot, then rotate any one of the four 3×3 blocks (↺ or ↻).', 'The rotation can make or break lines — that’s the trick.', 'First to get 5 marbles in a row (after the twist) wins.'],
  'hex': ['Take turns placing one stone on any empty cell.', 'You own the <b>top &amp; bottom</b> edges; your partner owns <b>left &amp; right</b>.', 'First to build an unbroken chain of your stones linking your two sides wins. It can never end in a draw.'],
  'nine-mens-morris': ['<b>Phase 1:</b> take turns placing your 9 pieces on the points.', 'Make a “mill” (3 of yours in a line) → remove one of your partner’s pieces.', '<b>Phase 2:</b> slide pieces along lines to form new mills. With only 3 left you can “fly” anywhere.', 'Reduce your partner to 2 pieces (or no moves) to win.'],
  'quoridor': ['Each turn: <b>move your pawn</b> one square, OR <b>place a wall</b> to block paths (10 walls each).', 'Walls can slow your partner but can never completely trap them.', 'First pawn to reach the far side wins.'],
  'quarto': ['16 pieces, each big/small · light/dark · round/square · solid/hollow.', 'The twist: <b>your partner chooses the piece you must place</b>, and you choose theirs.', 'Complete a line of 4 pieces that share ANY one trait to win.'],
  'code-breaker': ['First, each of you secretly sets a 4-colour code for the other to crack.', 'Take turns guessing. ⬤ = right colour &amp; spot · ⚪ = right colour, wrong spot.', 'First to crack your partner’s code exactly wins.'],
  'ghost': ['Take turns adding ONE letter to a growing word fragment.', 'Whoever completes a real word (4+ letters) <b>loses</b>.', 'Think it’s a dead end? Challenge — if no word can start that way, the previous player loses; if one can, you do.'],
  'two-truths': ['On your turn, write 3 statements about yourself — two true, one a lie — and mark the lie.', 'Your partner guesses which is the fib.', 'Guess right = point to the guesser; fool them = point to you. Most points after 6 rounds wins.'],
  'tournament': ['The host picks how many games — 3, 5, 7, 10, or a custom number (2–20). That many random Word &amp; Strategy games are drawn.', 'Every game you win counts on your scoreboard, exactly like a normal game.', 'Whoever wins the most games is crowned <b>Tournament Champion</b>! 🏆 Leave anytime with both players’ consent.'],
  'yahtzee': ['On your turn, roll 5 dice up to 3 times — tap dice between rolls to <b>hold</b> them.', 'Then bank your dice into one scorecard box: e.g. Full house = 25, Lg. straight = 40, <b>YAHTZEE</b> (5 of a kind) = 50. Each box is used once, so spend them wisely.', 'Fill the upper boxes (Ones–Sixes) to a total of 63+ for a <b>+35 bonus</b>. Highest grand total once both cards are full wins.'],
  'liars-dice': ['You each roll 5 <b>secret</b> dice. A bid claims how many dice show a face across <b>both</b> players — e.g. “three ⚄” = at least three 5s in total.', 'On your turn either <b>raise</b> the bid (more dice, or the same count with a higher face) or call <b>“Liar!”</b>.', 'On a call, all dice are revealed: if the bid was true the <b>caller</b> loses a die; if it was a bluff the <b>bidder</b> loses one. Lose all 5 dice and you’re out.', '<b>Example:</b> 10 dice are in play and the bid is “four ⚂”. You can see two ⚂ in your own hand, so four total is very believable — raise to “four ⚃” or “five ⚀”. Push the count too high and you’ll get called!'],
  'onitama': ['Each player has a <b>Master</b> (gold ring) + 4 students. Your legal moves come only from your <b>2 face-up cards</b>.', 'On your turn, tap a card, then move ONE piece by that card’s pattern (gold square = the piece, purple = where it may go) — capturing any enemy you land on.', 'Then the card you used <b>swaps with the “next” card</b> and goes to your opponent — so you’re always handing them their future moves.', '<b>Win two ways:</b> capture the enemy Master (Way of the Stone), OR move your Master onto the opponent’s starting temple square (Way of the Stream).'],
  'jaipur': ['Be the richer trader. On your turn do exactly ONE: <b>take</b> one good from the 5-card market, <b>take all 🐫 camels</b>, <b>exchange</b> 2+ of your cards (goods and/or camels) for the same number of market goods, or <b>sell</b> goods.', 'To sell, play any number of ONE good type and grab that many tokens (highest values first). Sell 3 / 4 / 5 at once for a <b>bonus</b> token. 💎 gold ⚪ silver are the priciest.', 'Camels never score on their own, but the player with the <b>most camels</b> at the end gets +5 — and they fuel big exchanges. Hand limit is 7 goods (camels are kept separately).', 'The round ends the moment <b>3 token piles are empty</b>; most rupees wins. <b>Example:</b> sell 3 🌶️ spice → take the top three spice tokens (5+3+3 = 11) <i>plus</i> a 3-sell bonus.'],
  'letterpress': ['Tap tiles to spell a word (3+ letters); submitting claims every tile in it for <b>your</b> colour — stealing your partner’s un-locked tiles.', 'A tile is <b>locked 🔒</b> (can’t be stolen) when all its up/down/left/right neighbours are already its own colour. Build walls to protect your lead!', 'When every tile is claimed, the <b>most tiles wins</b>. You can’t replay a word, or just bolt letters onto an earlier one.'],
  'codenames-duet': ['<b>Co-op!</b> Find all <b>9 secret agents</b> together before you run out of turns — and never tap an <b>assassin ☠️</b>.', 'On your turn you secretly see the key — give your partner a <b>one-word clue + a number</b> pointing at agent words.', 'They tap words: a green agent = keep going, a bystander ends the turn, the assassin = instant loss. You win or lose <b>together</b> — no scoreboard points, just pure teamwork. 💞'],
  'draw-guess': ['One of you gets a <b>secret word</b> and sketches it on the canvas — your partner watches it appear in real time.', 'Tap <b>“Done”</b> to hand it over, then your partner types guesses. A correct guess scores a point.', 'You swap who draws each round — most points after 6 rounds wins! 🎨'],
  'ultimate-ttt': ['It’s <b>9 tic-tac-toe boards</b> in a 3×3 grid. Win a small board by getting 3-in-a-row inside it.', 'The twist: the <b>cell</b> you play decides <b>which board your opponent must play next</b> — top-left cell sends them to the top-left board.', 'Sent to a board that’s already won or full? Then you may play <b>anywhere</b>. Win <b>three small boards in a row</b> to win it all. 🧠'],
};
function showRules(game) {
  const back = h('div', { class: 'rules-overlay', onclick: e => { if (e.target === back) close(); } });
  const card = h('div', { class: 'rules-card' },
    h('div', { class: 'rules-emoji', style: `color:${game.accent}`, html: Icons.game(game.id) }),
    h('h3', {}, 'How to play — ' + game.name),
    h('ul', { class: 'rules-list' }, (GAME_RULES[game.id] || ['Have fun!']).map(r => h('li', { html: r }))),
    h('button', { class: 'btn btn-primary btn-block mt', onclick: () => close() }, 'Got it! ✓'));
  back.append(card); document.body.append(back); Store.Sound.tap();
  function close() { back.remove(); }
}

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
  // buttons: [{ label, primary?, onClick }]
  function show({ emoji, title, sub, party = true }, buttons) {
    $('#resultEmoji').textContent = emoji;
    $('#resultTitle').innerHTML = title;
    $('#resultSub').innerHTML = sub || '';
    if (party) confetti(); else $('#confetti').innerHTML = '';
    const acts = $('#resultActions'); acts.innerHTML = '';
    (buttons || []).forEach(b => acts.append(h('button', { class: 'btn ' + (b.primary ? 'btn-primary' : 'btn-ghost'), onclick: () => b.onClick && b.onClick() }, b.label)));
    $('#resultOverlay').hidden = false;
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
let timerInterval = null; // countdown ticker while a timed game is mounted
let reactUnsub = null;    // banter (emote/taunt) listener while a game is mounted

// in-game banter — tap to flash on your partner's screen
const EMOTES = ['💩', '😏', '🔥', '😂', '😱', '👏', '🤔', '😤', '😎', '💀', '🤡', '👀', '🙄', '😘', '💪', '🥱'];
const TAUNTS = [
  // Smit & Meera's house specials 💞
  "Flash to Win 👙", "Mirador pics? 👄", "Cosmos pls now", "Cosmos pics? 🍆", "Aunty move",
  "Let me win I'm your Wife 💍", "Let me win I'm your husband 💖",
  // classics
  "You're going DOWN 😤", "lol you're gonna lose", "u suck (lovingly) 😘", "I'm literally better than this",
  "Is your screen even ON? 👀", "Aww, you'll win one day 🥹", "Too easy 😎", "GG already? 😏",
  "I'm just warming up 🔥", "Did you forget the rules?", "Sweating yet? 💦", "This is painful to watch 😬",
  "skill issue tbh", "Cope harder 😌", "Loser buys dinner 🍕", "Booop. Get rekt 💀",
];

// Which games support a per-turn timer, and whether a "skip turn" timeout is SAFE
// (true) or only "forfeit" makes sense (false — multi-phase turns / word & dice games).
const TIMER_GAMES = {
  'tic-tac-toe': { skip: true }, 'ultimate-ttt': { skip: true }, 'connect-four': { skip: true }, 'gomoku': { skip: true },
  'dots-boxes': { skip: true }, 'reversi': { skip: true }, 'hex': { skip: true },
  'quoridor': { skip: true }, 'onitama': { skip: true }, 'memory': { skip: true },
  'battleship': { skip: true }, 'jaipur': { skip: true },
  'checkers': { skip: false }, 'pentago': { skip: false }, 'quarto': { skip: false }, 'nine-mens-morris': { skip: false },
  'ghost': { skip: false }, 'word-duel': { skip: false }, 'hangman': { skip: false }, 'letterpress': { skip: false },
  'code-breaker': { skip: false }, 'liars-dice': { skip: false }, 'yahtzee': { skip: false },
};
const timerCap = gameId => TIMER_GAMES[gameId] || (Games.byId(gameId) && Games.byId(gameId).isTournament ? { skip: true, tour: true } : null);
// next turn's deadline (synced server ms) when the current match has a live timer
const freshDeadline = () => (currentMatch && currentMatch.timer && currentMatch.timer.on) ? (Store.Net.serverNow() + currentMatch.timer.secs * 1000) : null;

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
    setupNudgeWatch();
  });
}
const isLobby = () => (location.hash === '' || location.hash === '#/' );
const partnerSeat = me => (me === 0 ? 1 : 0);
const isOnline = seat => !!(presence && presence[seat] && presence[seat].online);

/* ============================================================
   NUDGES + NOTIFICATIONS — free, in-app "come online & play" pings
   ============================================================ */
document.head.append(Object.assign(document.createElement('style'), { textContent: `
  .tour-cta{ display:flex; align-items:center; gap:12px; width:100%; text-align:left; margin:0 0 14px; padding:14px 16px; border-radius:16px; border:1px solid rgba(255,210,58,.35); background:linear-gradient(120deg, rgba(255,210,58,.16), rgba(178,102,255,.16)); color:var(--ink); box-shadow:0 0 22px rgba(255,210,58,.10); }
  .tour-cta:active{ transform:scale(.99); }
  .tour-cta .tc-ic{ display:grid; place-items:center; width:42px; height:42px; color:var(--gold); flex:0 0 auto; }
  .tour-cta .tc-ic .icn{ width:30px; height:30px; }
  .tour-cta .tc-txt{ display:flex; flex-direction:column; flex:1; min-width:0; }
  .tour-cta .tc-txt b{ font-family:var(--font-display); font-size:16px; letter-spacing:.5px; }
  .tour-cta .tc-txt small{ color:var(--ink-dim); font-size:12px; }
  .tour-cta .tc-go{ font-family:var(--font-display); font-size:13px; color:#06070f; background:var(--gold); padding:9px 16px; border-radius:10px; flex:0 0 auto; }
  .nudge-cta{ width:100%; margin:0 0 12px; padding:11px 14px; border-radius:13px; border:1px dashed var(--glass-brd); background:var(--bg-2); color:var(--ink-dim); font-weight:600; font-size:13px; }
  .nudge-cta:active{ transform:scale(.99); border-color:var(--violet); color:var(--ink); }
  .banner.nudge-in{ background:linear-gradient(90deg, rgba(255,47,166,.18), transparent); border-color:rgba(255,47,166,.4); }
  .toast{ position:fixed; left:50%; bottom:88px; transform:translateX(-50%) translateY(18px); z-index:60; max-width:90%; padding:12px 18px; border-radius:14px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-size:14px; line-height:1.4; box-shadow:0 8px 30px rgba(0,0,0,.5); opacity:0; transition:opacity .3s, transform .3s; pointer-events:none; }
  .toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }
  .taunt-line{ text-align:center; font-style:italic; font-size:13px; color:var(--gold); margin:6px 12px 14px; line-height:1.45; }
  .badge .badge-em{ font-size:17px; line-height:1; margin-right:5px; }
  .badge.fun{ border-color:rgba(255,159,69,.5); background:linear-gradient(120deg, rgba(255,159,69,.14), rgba(255,47,166,.10)); }
  .badge.fun .badge-k{ color:var(--ink); }
  .timer-bar{ position:relative; height:26px; border-radius:9px; overflow:hidden; background:var(--bg-2); border:1px solid var(--glass-brd); margin:0 0 10px; }
  .timer-bar[hidden]{ display:none; }
  .timer-bar .tb-fill{ position:absolute; left:0; top:0; bottom:0; width:100%; transition:width .25s linear; }
  .timer-bar.ok .tb-fill{ background:linear-gradient(90deg,#2ea043,var(--lime)); }
  .timer-bar.warn .tb-fill{ background:linear-gradient(90deg,#d4a72c,var(--gold)); }
  .timer-bar.crit .tb-fill{ background:linear-gradient(90deg,#ff4d6d,var(--magenta)); }
  .timer-bar .tb-txt{ position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.55); letter-spacing:.3px; }
  .tp-toggle{ display:flex; gap:8px; justify-content:center; } .tp-toggle .btn{ flex:1; max-width:150px; }
  .react-btn{ position:fixed; right:14px; bottom:18px; z-index:55; width:52px; height:52px; border-radius:50%; background:var(--panel-2); border:1px solid var(--glass-brd); font-size:24px; box-shadow:0 4px 16px rgba(0,0,0,.45); }
  .react-btn:active{ transform:scale(.92); }
  .react-panel{ position:fixed; right:14px; bottom:80px; z-index:55; width:min(330px,88vw); max-height:0; overflow:hidden; opacity:0; transition:max-height .25s var(--ease), opacity .2s; background:var(--panel-2); border:1px solid var(--glass-brd); border-radius:16px; box-shadow:0 10px 34px rgba(0,0,0,.55); }
  .react-panel.open{ max-height:60vh; opacity:1; padding:12px; overflow-y:auto; }
  .rp-emotes{ display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin-bottom:10px; }
  .rp-e{ width:42px; height:42px; border-radius:11px; background:var(--bg-2); border:1px solid var(--line); font-size:24px; }
  .rp-taunts{ display:flex; flex-direction:column; gap:6px; }
  .rp-t{ text-align:left; padding:10px 12px; border-radius:11px; background:var(--bg-2); border:1px solid var(--line); color:var(--ink); font-size:13px; }
  .rp-e:active, .rp-t:active{ transform:scale(.95); border-color:var(--violet); }
  .react-pop{ position:fixed; left:50%; bottom:32%; z-index:80; pointer-events:none; will-change:transform,opacity; animation:reactFloat 2.6s cubic-bezier(.2,.8,.3,1) forwards; }
  .react-pop .rp-em{ font-size:74px; filter:drop-shadow(0 6px 14px rgba(0,0,0,.55)); }
  .react-pop .rp-txt{ background:var(--panel-2); border:1px solid var(--glass-brd); border-radius:16px; padding:11px 18px; font-size:17px; font-weight:800; color:var(--ink); box-shadow:0 10px 34px rgba(0,0,0,.55); max-width:82vw; text-align:center; }
  .react-pop .rp-txt small{ display:block; color:var(--gold); font-size:11px; font-weight:700; margin-bottom:2px; }
  @keyframes reactFloat{ 0%{ opacity:0; transform:translateX(-50%) translateY(24px) scale(.6); } 14%{ opacity:1; transform:translateX(-50%) translateY(0) scale(1.12); } 28%{ transform:translateX(-50%) translateY(0) scale(1); } 78%{ opacity:1; } 100%{ opacity:0; transform:translateX(-50%) translateY(-70px) scale(.92); } }
  .game-wrap.moved{ animation:moveGlow .65s var(--ease); border-radius:16px; }
  @keyframes moveGlow{ 0%{ box-shadow:0 0 0 0 rgba(155,123,255,.0); } 25%{ box-shadow:0 0 0 3px rgba(155,123,255,.7), 0 0 22px rgba(155,123,255,.4); } 100%{ box-shadow:0 0 0 0 rgba(155,123,255,0); } }
  .turn-flash{ position:fixed; top:62px; left:50%; transform:translateX(-50%); z-index:65; background:var(--panel-2); border:1px solid var(--glass-brd); border-radius:999px; padding:8px 16px; font-size:13px; font-weight:700; color:var(--ink); box-shadow:0 6px 20px rgba(0,0,0,.5); pointer-events:none; animation:turnFlash 1.4s ease forwards; }
  @keyframes turnFlash{ 0%{ opacity:0; transform:translateX(-50%) translateY(-10px); } 12%{ opacity:1; transform:translateX(-50%) translateY(0); } 80%{ opacity:1; } 100%{ opacity:0; } }
  body.shake{ animation:screenShake .42s; } @keyframes screenShake{ 0%,100%{ transform:translate(0,0); } 20%{ transform:translate(-4px,2px); } 40%{ transform:translate(4px,-2px); } 60%{ transform:translate(-3px,-2px); } 80%{ transform:translate(3px,2px); } }
` }));

const Notify = {
  supported: () => (typeof Notification !== 'undefined'),
  granted: () => Notify.supported() && Notification.permission === 'granted',
  ask() {
    return new Promise(res => {
      if (!Notify.supported() || Notification.permission === 'denied') return res(false);
      if (Notification.permission === 'granted') return res(true);
      try { const r = Notification.requestPermission(p => res(p === 'granted')); if (r && r.then) r.then(p => res(p === 'granted')).catch(() => res(false)); }
      catch (e) { res(false); }
    });
  },
  fire(title, body) { try { if (Notify.granted()) new Notification(title, { body, icon: 'assets/icons/icon.svg' }); } catch (e) {} },
};

let toastTimer = null;
function showToast(html) {
  const el = $('#toast'); if (!el) return;
  el.innerHTML = html; el.hidden = false; void el.offsetWidth; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 320); }, 4500);
}

let pendingNudge = null, nudgeUnsub = null;
const lastNudgeSeen = () => +(localStorage.getItem('sm_nudge_seen') || 0);
function setupNudgeWatch() {
  if (nudgeUnsub) { nudgeUnsub(); nudgeUnsub = null; }
  const me = Store.getIdentity();
  if (me == null || !Store.Net.ready()) return;
  nudgeUnsub = Store.Net.watchNudge(me, nudge => {
    if (!nudge || !nudge.t || nudge.from === me) return;
    if (nudge.t <= lastNudgeSeen()) return;            // already reacted to this one
    localStorage.setItem('sm_nudge_seen', String(nudge.t));
    pendingNudge = nudge;
    Store.Sound.good();
    const who = esc(nudge.name || Store.get().players[partnerSeat(me)].name);
    Notify.fire(`${nudge.name || 'Your partner'} wants to play! 💞`, 'Come online and pick a game.');
    showToast(`💞 <b>${who}</b> wants to play — come pick a game!`);
    if (isLobby()) renderHome();
  });
}
async function sendNudge(me, partner) {
  if (!Store.Net.ready()) { showToast('⚠ Not connected — can’t nudge right now.'); return; }
  Store.Sound.tap();
  Notify.ask();                                         // also lets THIS device receive future nudges
  Store.Net.sendNudge(partner, me, Store.get().players[me].name);
  showToast(`👋 Nudge sent to <b>${esc(Store.get().players[partner].name)}</b> — they’ll see it when their app is open.`);
}

/* ============================================================
   ROUTER
   ============================================================ */
const Router = (() => {
  function go() {
    stageHook = null;
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (reactUnsub) { reactUnsub(); reactUnsub = null; }
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
        onclick: () => { Store.setIdentity(i); if (Store.Net.ready()) Store.Net.goOnline(i, p.name); setupNudgeWatch(); location.hash = '#/'; Router.go(); },
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
  if (pendingNudge) banners.append(h('div', { class: 'banner nudge-in' },
    h('span', {}, `💞 ${esc(pendingNudge.name || s.players[partner].name)} wants to play!`),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { pendingNudge = null; renderHome(); } }, 'Got it')));

  // "come online & play" nudge
  const nudgeBtn = Store.Net.ready()
    ? h('button', { class: 'nudge-cta', onclick: () => sendNudge(me, partner) },
        pOn ? `👋 Nudge ${esc(s.players[partner].name)} to play` : `👋 Ask ${esc(s.players[partner].name)} to come online`)
    : h('span', { hidden: '' });

  // prominent Tournament CTA (kept OUT of the games grid)
  const tourCta = h('button', { class: 'tour-cta', onclick: () => startMatch('tournament') },
    h('span', { class: 'tc-ic', html: Icons.game('tournament') }),
    h('span', { class: 'tc-txt' }, h('b', {}, '🏆 Tournament'), h('small', {}, '5 random games · most wins is champion')),
    h('span', { class: 'tc-go' }, 'Start'));

  // hero (compact)
  const hero = h('section', { class: 'hero mini' },
    h('h1', { html: `<span class="c">${esc(s.players[0].name)}</span><span class="vs">VS</span><span class="m">${esc(s.players[1].name)}</span>` }),
    h('div', { class: 'mini-tally' }, `${s.totals.p1} — ${s.totals.p2}`),
    h('p', {}, pOn ? `${esc(s.players[partner].name)} is online — pick a game to challenge them.`
                   : `${esc(s.players[partner].name)} is offline — start a game and they’ll get the invite when they next open the app.`),
  );

  // search + filters
  const search = h('div', { class: 'search' }, h('span', { class: 'si', html: Icons.ui('search') }),
    h('input', { type: 'text', placeholder: 'Search games…', value: homeSearch, oninput: e => { homeSearch = e.target.value; paint(); } }));
  const cats = ['All', 'Favorites', ...Games.categories().filter(c => c !== 'Tournament')];
  const chips = h('div', { class: 'chips' }, cats.map(c => h('button', {
    class: 'chip' + (homeFilter === c ? ' active' : ''),
    onclick: () => { homeFilter = c; renderHome(); Store.Sound.tap(); },
  }, c === 'Favorites' ? '★ Faves' : c)));

  const gridWrap = h('div', { class: 'grid', id: 'gameGrid' });
  view.append(strip, nudgeBtn, banners, hero, tourCta, h('div', { class: 'toolbar' }, search, chips), gridWrap);
  paint();

  function paint() {
    const q = homeSearch.trim().toLowerCase();
    let games = Games.all().filter(g => !g.isTournament);
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
      h('span', { class: 'banner-ic', html: Icons.game(g.id) }),
      h('span', {}, `${esc(s.players[m.host].name)} invited you to `, h('b', {}, g.name)),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => joinMatch() }, 'Join'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => Store.Net.clearMatch() }, 'Decline'),
    );
  }
  // your own waiting match, or an active game → resume
  const label = m.status === 'waiting' ? 'Waiting for your partner…' : 'Game in progress';
  return h('div', { class: 'banner resume' },
    h('span', { class: 'banner-ic', html: Icons.game(g.id) }),
    h('span', {}, `${esc(label)}: `, h('b', {}, g.name)),
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
    h('span', { class: 'gicon', html: Icons.game(g.id) }), h('span', { class: 'gname' }, g.name), h('span', { class: 'gtag' }, tag),
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
  if (currentMatch && currentMatch.status !== 'finished' && currentMatch.gameId !== gameId) {
    if (!confirm('Start a new game? This ends the current one.')) return;
  }
  Store.Sound.place();
  const cap = timerCap(gameId);
  if (cap && me === 0) { showTimerPanel(gameId, cap, timer => createMatch(gameId, me, timer)); return; } // only Smit sets the clock
  createMatch(gameId, me, { on: false });
}
function createMatch(gameId, me, timer) {
  // state is JSON-stringified: Firebase RTDB strips nulls/empties & mangles arrays, so we store a plain string
  const state = JSON.stringify(Games.byId(gameId).init(me));
  const match = { gameId, host: me, status: 'waiting', state, starter: me, roundWinner: null, timer: timer || { on: false }, by: me, t: Date.now() };
  // set locally BEFORE navigating so the stage paints the new game immediately
  currentMatch = match;
  Store.Net.setMatch(match)
    .catch(err => { console.error(err); alert('Could not start the game online.\n\nYour Firebase rules likely need updating to allow "matches" and "presence" (see database.rules.json in the repo, then republish in the Realtime Database → Rules tab).\n\n' + err.message); location.hash = '#/'; });
  location.hash = '#/play/' + gameId;
}
// Smit's pre-game clock panel: on/off, duration, and (where safe) skip vs forfeit
function showTimerPanel(gameId, cap, onDone) {
  let on = false, secs = 30, mode = cap.skip ? 'skip' : 'forfeit';
  const back = h('div', { class: 'rules-overlay' });
  const card = h('div', { class: 'rules-card', style: 'text-align:center' });
  const body = h('div', {}); card.append(body);
  function draw() {
    body.innerHTML = '';
    body.append(
      h('h3', {}, '⏱️ Turn timer'),
      h('p', { style: 'color:var(--ink-dim);font-size:13px;margin:6px 0 12px' }, `A per-turn clock for ${esc(Games.byId(gameId).name)}.`),
      h('div', { class: 'tp-toggle' },
        h('button', { class: 'btn ' + (on ? 'btn-ghost' : 'btn-primary'), onclick: () => { on = false; draw(); } }, 'No timer'),
        h('button', { class: 'btn ' + (on ? 'btn-primary' : 'btn-ghost'), onclick: () => { on = true; draw(); } }, 'Timer on')));
    if (on) {
      body.append(h('div', { class: 'ld-step', style: 'margin-top:14px' },
        h('button', { onclick: () => { secs = Math.max(10, secs - 5); draw(); } }, '−'),
        h('div', { class: 'v' }, secs + 's'),
        h('button', { onclick: () => { secs = Math.min(180, secs + 5); draw(); } }, '+')));
      if (!cap.tour) body.append(
        h('p', { style: 'color:var(--ink-faint);font-size:12px;margin:12px 0 4px' }, 'When time runs out:'),
        h('div', { class: 'tp-toggle' },
          cap.skip ? h('button', { class: 'btn ' + (mode === 'skip' ? 'btn-primary' : 'btn-ghost'), onclick: () => { mode = 'skip'; draw(); } }, '⏭️ Skip turn') : '',
          h('button', { class: 'btn ' + (mode === 'forfeit' ? 'btn-primary' : 'btn-ghost'), onclick: () => { mode = 'forfeit'; draw(); } }, '💀 Forfeit')));
      else body.append(h('p', { style: 'color:var(--ink-faint);font-size:11px;margin:10px 4px 0' }, 'Each tournament game uses its own sensible timeout.'));
    }
    body.append(h('button', { class: 'btn btn-primary btn-block mt', onclick: () => { back.remove(); onDone({ on, secs, mode }); } }, on ? `Start · ${secs}s per turn` : 'Start (no timer)'));
  }
  draw(); back.append(card); document.body.append(back); Store.Sound.tap();
  back.onclick = e => { if (e.target === back) { back.remove(); onDone({ on: false }); } };
}
function joinMatch() {
  Store.Sound.good();
  const patch = { status: 'active', t: Date.now() }, dl = freshDeadline();
  if (dl) patch.deadline = dl;                       // start the clock when the game goes live
  if (currentMatch) currentMatch = Object.assign({}, currentMatch, { status: 'active' });
  Store.Net.updateMatch(patch);
  if (currentMatch) location.hash = '#/play/' + currentMatch.gameId;
}
function optimistic(patch) { if (currentMatch) { currentMatch = Object.assign({}, currentMatch, patch); if (stageHook) stageHook(currentMatch); } }
// "Play again" — either player re-deals the same game (starter alternates)
function advanceRound(gameId) {
  const me = Store.getIdentity();
  const newStarter = 1 - (currentMatch && currentMatch.starter != null ? currentMatch.starter : 0);
  const state = JSON.stringify(Games.byId(gameId).init(newStarter));
  const patch = { state, status: 'active', starter: newStarter, roundWinner: null };
  const dl = freshDeadline(); if (dl) patch.deadline = dl;
  optimistic(patch);
  Store.Net.updateMatch(Object.assign({ by: me, t: Date.now() }, patch));
}
function nextGameId(cur) { const others = Games.all().filter(g => g.id !== cur && !g.isTournament); return others[Math.floor(Math.random() * others.length)].id; }
function exitMatch() { Store.Net.clearMatch(); location.hash = '#/'; }
// leaving an in-progress game needs BOTH players' consent (works for every game incl. tournaments)
function requestEndGame() {
  const me = Store.getIdentity(), partner = partnerSeat(me);
  if (!currentMatch) { location.hash = '#/'; return; }
  if (currentMatch.status !== 'active' || !isOnline(partner)) { exitMatch(); return; } // nothing live, or partner away → just leave
  Store.Sound.tap();
  optimistic({ endReq: me });
  Store.Net.updateMatch({ endReq: me, t: Date.now() });
}
function cancelEndGame() { Store.Sound.tap(); optimistic({ endReq: null }); Store.Net.updateMatch({ endReq: null, t: Date.now() }); }
function agreeEndGame() { Store.Sound.good(); exitMatch(); }

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
    h('h2', { style: `color:${game.accent}` }, h('span', { class: 'h2-icon', html: Icons.game(game.id) }), game.name),
    h('p', {}, game.tagline),
    h('button', { class: 'rules-btn', onclick: () => showRules(game) }, 'How to play'));
  const seriesBar = h('div', { class: 'series-bar', id: 'seriesBar' });
  const timerBar = h('div', { class: 'timer-bar', hidden: '' });
  const mount = h('div', { class: 'game-wrap', id: 'gameMount' });
  const msg = h('div', { class: 'game-msg', id: 'gameMsg' });
  const endBtn = h('button', { class: 'end-btn', onclick: requestEndGame }, 'End game');
  const reactPanel = h('div', { class: 'react-panel' },
    h('div', { class: 'rp-emotes' }, EMOTES.map(e => h('button', { class: 'rp-e', onclick: () => sendReact(e) }, e))),
    h('div', { class: 'rp-taunts' }, TAUNTS.map(t => h('button', { class: 'rp-t', onclick: () => sendReact(t) }, t))));
  const reactBtn = h('button', { class: 'react-btn', onclick: () => { reactPanel.classList.toggle('open'); Store.Sound.tap(); } }, '💬');
  const stage = h('div', { class: 'stage' }, head, seriesBar, timerBar, mount, msg, endBtn, reactBtn, reactPanel);
  view.append(stage);

  let overlayMode = null; // null | 'endWait' | 'endAsk' | 'over' | 'tourMid' | 'tourEnd'
  let lastMoveT = currentMatch ? currentMatch.t : 0; // for the "opponent moved" feel cue
  function flashMove() {
    Store.Sound.move();
    mount.classList.remove('moved'); void mount.offsetWidth; mount.classList.add('moved');
    const p = s.players[partnerSeat(me)];
    const badge = h('div', { class: 'turn-flash' }, `${p.emoji} ${esc(p.name)} moved`);
    document.body.append(badge); setTimeout(() => { badge.remove(); }, 1400);
  }

  function paint() {
    const m = currentMatch;
    seriesBar.classList.remove('show'); // series system removed — every game win counts on its own
    endBtn.style.display = (m && m.gameId === gameId && m.status === 'active' && m.endReq == null) ? 'block' : 'none';
    if (!m || m.gameId !== gameId) { // match ended/replaced elsewhere
      mount.innerHTML = ''; mount.append(waitCard('This game ended.', 'Back to lobby', exitMatch)); return;
    }
    if (m.status === 'waiting') {
      const partner = partnerSeat(me);
      mount.innerHTML = '';
      if (m.host === me) {
        mount.append(waitCard(`Waiting for ${s.players[partner].name} to join…`,
          isOnline(partner) ? `${s.players[partner].name} is online — they’ll see the invite now.` : `${s.players[partner].name} is offline — they’ll get it when they open the app.`,
          null, true));
        msg.textContent = '';
      } else {
        mount.append(waitCard(`${s.players[m.host].name} invited you!`, '', null, false,
          h('button', { class: 'btn btn-primary', onclick: joinMatch }, 'Join game')));
      }
      return;
    }
    // active or finished → render from state (stored as a JSON string)
    mount.innerHTML = '';
    let state = null;
    try { state = typeof m.state === 'string' ? JSON.parse(m.state) : m.state; } catch (e) { state = null; }
    // Only reject genuinely unusable state. (Phase-based games like two-truths,
    // rps, couple-quiz legitimately have no `turn` field — never gate on it.)
    if (!state || typeof state !== 'object') {
      mount.append(waitCard('Couldn’t load this game — please start a fresh one.', 'Back to lobby', exitMatch)); return;
    }

    // A tournament renders its SETUP picker or its CURRENT sub-game; others render themselves.
    const isTour = !!game.isTournament;
    const setup = isTour && state.phase === 'setup';
    if (setup) {
      mount.append(tournamentSetup(state));
    } else {
      const renderDef = isTour ? (Games.byId(state.subId) || game) : game;
      const renderState = isTour ? (state.sub || {}) : state;
      if (isTour) mount.append(tournamentHeader(state));
      const ctx = {
        root: mount, h, $, esc, clone, players: s.players.map(p => ({ name: p.name, emoji: p.emoji, color: p.color })),
        state: renderState, me, turn: renderState.turn,
        isMyTurn: (renderState.turn === me) && m.status === 'active' && (!isTour || state.phase === 'play'),
        status: m.status, sound: Store.Sound, turnBar: o => turnBar(ctx, o),
        msg: (t, c) => { msg.innerHTML = t; msg.style.color = c || 'var(--ink-dim)'; },
        commit: isTour ? (ns, w) => tourCommit(ns, w) : (ns, w) => commitMove(gameId, ns, w),
        seat: i => s.players[i],
      };
      try { renderDef.render(ctx); } catch (e) { console.error(e); msg.textContent = '⚠ ' + e.message; }
    }

    // ----- overlays -----
    if (m.endReq != null) { // leave-consent takes priority over everything
      const mode = m.endReq === me ? 'endWait' : 'endAsk';
      if (mode !== overlayMode) { overlayMode = mode; showEndOverlay(m, mode); }
    } else if (isTour && state.phase === 'intermission') {
      if (overlayMode !== 'tourMid') { overlayMode = 'tourMid'; showTourIntermission(state); }
    } else if (isTour && (state.phase === 'done' || m.status === 'finished')) {
      if (overlayMode !== 'tourEnd') { overlayMode = 'tourEnd'; showTourEnd(state); }
    } else if (!isTour && m.status === 'finished') {
      if (overlayMode !== 'over') { overlayMode = 'over'; showGameOver(m); }
    } else { overlayMode = null; Overlay.hide(); }

    // "opponent moved" feel — glow the board + chime + a quick badge on a fresh move from your partner
    if (m && m.t !== lastMoveT) { const fresh = lastMoveT !== 0; lastMoveT = m.t; if (fresh && m.status === 'active' && m.by === partnerSeat(me)) flashMove(); }
  }

  function tournamentHeader(t) {
    const total = (t.schedule || []).length;
    const gi = Math.min(t.slot + 1, total);
    const name = (Games.byId(t.subId) || {}).name || '';
    const dots = h('div', { class: 'tour-dots' });
    for (let i = 0; i < total; i++) dots.append(h('span', { class: 'tdot' + (i < t.slot ? ' done' : (i === t.slot ? ' cur' : '')) }));
    return h('div', { class: 'tour-head' },
      h('div', { class: 'tour-top' },
        h('span', { class: 'tour-badge' }, '🏆 TOURNAMENT'),
        h('span', { class: 'tour-score' }, h('b', { class: 'p1' }, String(t.wins[0])), ' – ', h('b', { class: 'p2' }, String(t.wins[1])))),
      h('div', { class: 'tour-now' }, `Game ${gi}/${total} — `, h('b', {}, name)),
      dots);
  }
  // host picks how many games; partner waits
  function tournamentSetup(t) {
    const card = h('div', { class: 'board-frame', style: 'text-align:center' });
    card.append(h('div', { class: 'tour-badge', style: 'font-size:14px' }, '🏆 TOURNAMENT'));
    if (me === t.host) {
      card.append(h('p', { style: 'color:var(--ink-dim);font-size:14px;margin:8px 0 6px' }, 'How many games? Random Word & Strategy games — most wins is champion.'));
      card.append(h('div', { class: 'tour-counts' }, [3, 5, 7, 10].map(n => h('button', { onclick: () => startTournament(n) }, n + ' games'))));
      let cn = 6;
      const stepRow = h('div', {});
      const drawStep = () => {
        stepRow.innerHTML = '';
        stepRow.append(h('div', { class: 'ld-step' },
          h('button', { onclick: () => { cn = Math.max(2, cn - 1); drawStep(); } }, '−'),
          h('div', { class: 'v' }, String(cn)),
          h('button', { onclick: () => { cn = Math.min(20, cn + 1); drawStep(); } }, '+')));
        stepRow.append(h('button', { class: 'btn btn-primary btn-block mt', onclick: () => startTournament(cn) }, `Start ${cn}-game tournament`));
      };
      drawStep();
      card.append(h('p', { style: 'color:var(--ink-faint);font-size:12px;margin:10px 0 2px' }, '…or set a custom count (2–20):'), stepRow);
      msg.innerHTML = 'Choose your tournament length 🏆';
    } else {
      card.append(h('div', { class: 'spinner', style: 'margin:14px auto' }), h('h3', {}, `${esc(s.players[t.host].name)} is setting up the tournament…`));
      msg.innerHTML = '';
    }
    return card;
  }
  function startTournament(n) {
    if (!currentMatch) return;
    let t; try { t = JSON.parse(currentMatch.state); } catch (e) { return; }
    if (t.phase !== 'setup') return;
    const schedule = game.buildSchedule(n);
    if (!schedule.length) { Store.Sound.bad(); return; }
    t.schedule = schedule; t.slot = 0; t.subId = schedule[0];
    t.sub = Games.byId(schedule[0]).init(t.host); t.phase = 'play';
    overlayMode = null; Overlay.hide(); Store.Sound.good();
    pushTour(t, 'active');
  }

  function showEndOverlay(m, mode) {
    const partner = partnerSeat(me);
    if (mode === 'endWait') {
      Overlay.show({ emoji: '🤝', title: 'Leave the game?', sub: `Waiting for ${esc(s.players[partner].name)} to agree…`, party: false },
        [{ label: 'Keep playing', primary: true, onClick: cancelEndGame }]);
    } else { // endAsk
      Store.Sound.bad();
      Overlay.show({ emoji: '🚪', title: `${esc(s.players[m.endReq].name)} wants to leave the game`, sub: 'Agree to end it and return to the lobby?', party: false },
        [{ label: 'Keep playing', onClick: cancelEndGame }, { label: 'End game', primary: true, onClick: agreeEndGame }]);
    }
  }

  function showGameOver(m) {
    const w = m.roundWinner, nxt = nextGameId(gameId), nxtG = Games.byId(nxt);
    setTimeout(() => {
      if (overlayMode !== 'over') return;
      let res;
      if (w === 'coop-win') res = { emoji: '🎉', title: 'You both cracked it!', sub: 'Solved together — no points, all glory 💞', party: true };
      else if (w === 'coop-loss') res = { emoji: '💀', title: 'You both lost…', sub: 'So close — run it back?', party: false };
      else if (w === 'draw' || w == null) res = { emoji: '🤝', title: 'Draw!', sub: 'No winner this time', party: false };
      else { const p = s.players[w]; res = { emoji: p.emoji, title: `${esc(p.name)} wins!`, sub: 'Added to your scoreboard 🏆', party: true }; }
      Store.Sound[(w === 'draw' || w == null || w === 'coop-loss') ? 'draw' : 'win']();
      if (res.party) { document.body.classList.add('shake'); setTimeout(() => document.body.classList.remove('shake'), 450); }
      Overlay.show(res, [
        { label: 'Lobby', onClick: exitMatch },
        { label: `Play ${nxtG.name} →`, onClick: () => { Overlay.hide(); startMatch(nxt); } },
        { label: '↻ Play again', primary: true, onClick: () => advanceRound(gameId) },
      ]);
    }, 450);
  }

  // ----- tournament engine (orchestrates sub-games inside one match) -----
  function pushTour(t, status, roundWinner) {
    const patch = { state: JSON.stringify(t), status };
    if (roundWinner !== undefined) patch.roundWinner = roundWinner;
    if (status === 'active' && t.phase === 'play') { const dl = freshDeadline(); if (dl) patch.deadline = dl; }
    currentMatch = Object.assign({}, currentMatch, patch);
    paint();
    Store.Net.updateMatch(Object.assign({ by: me, t: Date.now() }, patch));
  }
  function tourCommit(nextSub, winner) {
    if (!currentMatch || currentMatch.status !== 'active') return;
    let t; try { t = JSON.parse(currentMatch.state); } catch (e) { return; }
    if (t.phase !== 'play') return;
    if (winner === undefined) { t.sub = nextSub; pushTour(t, 'active'); return; } // ongoing sub-game move
    // sub-game finished → record it on the scoreboard like any normal game
    const subId = t.subId;
    if (winner === 0 || winner === 1) { t.wins[winner]++; Store.recordResult(subId, winner === 0 ? 'p1' : 'p2'); }
    else { Store.recordResult(subId, 'draw'); }
    (t.log = t.log || []).push({ game: subId, winner });
    t.lastResult = { game: subId, winner };
    t.sub = nextSub; // keep the final board visible behind the overlay
    if (t.slot + 1 >= t.schedule.length) {
      t.phase = 'done';
      t.champion = (t.wins[0] === t.wins[1]) ? 'draw' : (t.wins[0] > t.wins[1] ? 0 : 1);
      if (t.champion === 0 || t.champion === 1) Store.recordTournament(t.champion);
      pushTour(t, 'finished', t.champion);
    } else { t.phase = 'intermission'; pushTour(t, 'active'); }
  }
  function advanceTournament() {
    if (!currentMatch) return;
    let t; try { t = JSON.parse(currentMatch.state); } catch (e) { return; }
    if (t.phase !== 'intermission') return;
    t.slot++;
    t.subId = t.schedule[t.slot];
    t.sub = Games.byId(t.subId).init((t.slot % 2 === 0) ? t.host : (1 - t.host)); // alternate who starts each game
    t.phase = 'play';
    overlayMode = null; Overlay.hide();
    pushTour(t, 'active');
  }
  function showTourIntermission(t) {
    const lr = t.lastResult || {};
    const lastName = (Games.byId(lr.game) || {}).name || 'that game';
    const nextName = (Games.byId(t.schedule[t.slot + 1]) || {}).name || '';
    const drew = lr.winner === 'draw' || lr.winner == null;
    setTimeout(() => {
      if (overlayMode !== 'tourMid') return;
      Store.Sound[drew ? 'draw' : 'win']();
      const res = drew
        ? { emoji: '🤝', title: `${esc(lastName)}: drawn`, sub: `Tournament ${t.wins[0]}–${t.wins[1]} · next up: <b>${esc(nextName)}</b>`, party: false }
        : { emoji: s.players[lr.winner].emoji, title: `${esc(s.players[lr.winner].name)} wins ${esc(lastName)}!`, sub: `Tournament ${t.wins[0]}–${t.wins[1]} · next up: <b>${esc(nextName)}</b>`, party: true };
      Overlay.show(res, [
        { label: 'End tournament', onClick: requestEndGame },
        { label: 'Next game →', primary: true, onClick: advanceTournament },
      ]);
    }, 450);
  }
  function showTourEnd(t) {
    setTimeout(() => {
      if (overlayMode !== 'tourEnd') return;
      Store.Sound.win();
      const champ = t.champion;
      const res = (champ === 'draw' || champ == null)
        ? { emoji: '🤝', title: 'Tournament tied!', sub: `Final ${t.wins[0]}–${t.wins[1]} · every game counted on the board`, party: true }
        : { emoji: '🏆', title: `${esc(s.players[champ].name)} WINS THE TOURNAMENT!`, sub: `Final ${t.wins[0]}–${t.wins[1]} · every game counted on the board`, party: true };
      Overlay.show(res, [
        { label: 'Lobby', onClick: exitMatch },
        { label: '🏆 New tournament', primary: true, onClick: () => { Overlay.hide(); startMatch('tournament'); } },
      ]);
    }, 450);
  }

  function commitMove(gid, nextState, winner) {
    if (!currentMatch || currentMatch.status !== 'active') return;
    const finishing = winner !== undefined;
    const stateStr = JSON.stringify(nextState);
    let patch;
    if (finishing) {
      // every finished game records immediately — a single win is a win
      patch = { state: stateStr, status: 'finished', roundWinner: winner };
      if (gid !== 'tournament') {
        if (winner === 0 || winner === 1) Store.recordResult(gid, winner === 0 ? 'p1' : 'p2');
        else if (winner === 'draw') Store.recordResult(gid, 'draw');
      }
    } else { patch = { state: stateStr, status: 'active' }; const dl = freshDeadline(); if (dl) patch.deadline = dl; }
    currentMatch = Object.assign({}, currentMatch, patch);
    paint();
    Store.Net.updateMatch(Object.assign({ by: me, t: Date.now() }, patch));
  }

  // ----- per-turn countdown timer (synced via server time; both phones see the same clock) -----
  let firedFor = null;
  function paintTimer() {
    const m = currentMatch;
    if (!m || m.gameId !== gameId || m.status !== 'active' || !m.timer || !m.timer.on || !m.deadline) { timerBar.hidden = true; return; }
    let st; try { st = JSON.parse(m.state); } catch (e) { timerBar.hidden = true; return; }
    const isTour = !!game.isTournament;
    if (isTour && st.phase !== 'play') { timerBar.hidden = true; return; }
    const sub = isTour ? st.sub : st;
    const clock = sub ? sub.turn : undefined;            // the player on the clock
    if (clock == null) { timerBar.hidden = true; return; }
    const remMs = m.deadline - Store.Net.serverNow();
    const pct = Math.max(0, Math.min(100, (remMs / (m.timer.secs * 1000)) * 100));
    const lvl = pct > 50 ? 'ok' : (pct > 22 ? 'warn' : 'crit');
    timerBar.hidden = false;
    timerBar.className = 'timer-bar show ' + lvl;
    timerBar.innerHTML = `<div class="tb-fill" style="width:${pct}%"></div><div class="tb-txt">⏱ ${esc(s.players[clock].name)} · ${Math.max(0, Math.ceil(remMs / 1000))}s</div>`;
    // enforce: the player on the clock fires at 0; the opponent fires after a 2s grace (covers a stalled/closed opponent)
    if (m.deadline === firedFor) return;
    if (me === clock ? remMs <= 0 : remMs <= -2000) { firedFor = m.deadline; fireTimeout(st, sub, clock, isTour); }
  }
  function fireTimeout(st, sub, clock, isTour) {
    if (!currentMatch || currentMatch.status !== 'active') return;
    const mode = isTour ? (((TIMER_GAMES[st.subId] || {}).skip) ? 'skip' : 'forfeit') : (currentMatch.timer.mode || 'forfeit');
    const opp = 1 - clock;
    Store.Sound.bad();
    if (mode === 'skip') { const flipped = Object.assign({}, sub, { turn: opp }); isTour ? tourCommit(flipped, undefined) : commitMove(gameId, flipped, undefined); }
    else { isTour ? tourCommit(sub, opp) : commitMove(gameId, sub, opp); }
  }

  // react to live match changes while mounted
  stageHook = (m) => {
    if (!m) { exitMatch(); return; }
    paint();
  };
  paint();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(paintTimer, 250);
  paintTimer();

  // ----- banter: flash emotes / taunts to your partner (separate path → no game re-render) -----
  let lastReactT = (Store.Net.serverNow ? Store.Net.serverNow() : Date.now());
  function sendReact(val) {
    reactPanel.classList.remove('open');
    const t = (Store.Net.serverNow ? Store.Net.serverNow() : Date.now());
    lastReactT = t; showReact({ by: me, val });        // optimistic local echo
    Store.Net.sendReact({ by: me, val, t });
  }
  function showReact(r) {
    const val = r.val || '', isEmoji = [...val].length <= 2;
    const pop = h('div', { class: 'react-pop' + (isEmoji ? ' emoji' : '') },
      isEmoji ? h('span', { class: 'rp-em' }, val)
              : h('div', { class: 'rp-txt' }, h('small', {}, esc(s.players[r.by] ? s.players[r.by].name : '')), h('div', {}, esc(val))));
    document.body.append(pop); Store.Sound[r.by === me ? 'tap' : 'good']();
    setTimeout(() => { pop.remove(); }, 2600);
  }
  if (reactUnsub) { reactUnsub(); reactUnsub = null; }
  reactUnsub = Store.Net.watchReact(r => { if (!r || !r.t || r.t <= lastReactT) return; lastReactT = r.t; showReact(r); });
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
  const lines = ['Flawless.', 'GG — well played!', 'Bragging rights: claimed.', 'Victory tastes sweet.',
    'Champion of ' + g.name + '!', 'The crowd goes wild!', 'Run it back?'];
  return lines[Math.floor((Date.now() / 1000) % lines.length)];
}

// per-player badges — everyone earns their own, including a funny "loser" crew
function computeBadges(s) {
  const w0 = s.totals.p1, w1 = s.totals.p2, draws = s.totals.draws || 0;
  const total = w0 + w1, lead = w0 - w1;
  const played = Object.keys(s.perGame || {}).filter(k => s.perGame[k].plays).length;
  const playableCount = Games.all().filter(g => !g.isTournament).length;
  const sw = s.streak.who, sn = s.streak.n || 0;
  const win0 = sw === 'p1' ? sn : 0, win1 = sw === 'p2' ? sn : 0;   // win streaks
  const cold0 = sw === 'p2' ? sn : 0, cold1 = sw === 'p1' ? sn : 0; // loss streaks
  const tw = s.tourWins || [0, 0];
  const B = (emoji, k, d, p0, p1, fun) => ({ emoji, k, d, p0: !!p0, p1: !!p1, fun: !!fun });
  return [
    // earned by skill
    B('🥇', 'First Win', 'Win your first game', w0 >= 1, w1 >= 1),
    B('🔥', 'On Fire', '3 wins in a row', win0 >= 3, win1 >= 3),
    B('⚡', 'Unstoppable', '5 wins in a row', win0 >= 5, win1 >= 5),
    B('👑', 'Dominator', 'Lead by 5+', lead >= 5, -lead >= 5),
    B('🏆', 'Champion', 'Win a tournament', tw[0] >= 1, tw[1] >= 1),
    B('🗺️', 'Explorer', 'Play 8 different games', played >= 8, played >= 8),
    B('💯', 'Completionist', 'Play every game', played >= playableCount, played >= playableCount),
    // the fun / consolation crew 😜
    B('🐢', 'Underdog', 'Be 5+ behind — respect the grind', -lead >= 5, lead >= 5, true),
    B('🥄', 'Wooden Spoon', 'Currently in last place', lead < 0, lead > 0, true),
    B('❄️', 'Cold Streak', 'Lose 3 in a row 🥶', cold0 >= 3, cold1 >= 3, true),
    B('💔', 'Heartbreak Kid', 'Lose 5+ games', w1 >= 5, w0 >= 5, true),
    B('🔄', 'Comeback Loading', 'Down 3+ but still scrapping', -lead >= 3 && w0 >= 1, lead >= 3 && w1 >= 1, true),
    B('🎟️', 'Participation', 'Play 10+ games', total >= 10, total >= 10, true),
    B('🍵', 'Drama', 'Rack up 3+ draws', draws >= 3, draws >= 3, true),
  ];
}
// a rotating, affectionate rivalry taunt for the Scores screen
function rivalryTaunt(s) {
  const w0 = s.totals.p1, w1 = s.totals.p2, lead = w0 - w1, gap = Math.abs(lead);
  if (w0 + w1 === 0) return 'No games yet — someone’s about to start a rivalry. 👀';
  if (lead === 0) return 'Dead even. The tension is unbearable. 😤';
  const L = esc(s.players[lead > 0 ? 0 : 1].name), U = esc(s.players[lead > 0 ? 1 : 0].name);
  let pool;
  if (gap >= 5) pool = [
    `${L} is on an absolute RAMPAGE 🔥 — ${U}, the comeback arc starts… now?`,
    `${U} is collecting Underdog badges like Pokémon 🐢✨`,
    `${gap}-point lead for ${L}. ${U} calls it a “strategic rebuild.” 😏`,
    `${U} is just lulling ${L} into a false sense of security. Right? …Right?`,
    `Somebody check on ${U} 🥄 — and bring snacks.`,
  ];
  else if (gap >= 2) pool = [`${L} edges ahead — ${U} is plotting 🧠`, `${L}’s in front, but ${U} can smell blood 🦈`, `It’s ${L}’s world and ${U}’s just gaming in it… for now.`];
  else pool = [`Neck and neck — ${L} barely ahead. One game flips it ⚔️`, `${U} is RIGHT there. ${L} better not blink. 👀`];
  return pool[Math.floor((Date.now() / 4000) % pool.length)];
}

/* ============================================================
   SCORES
   ============================================================ */
function renderScores() {
  const s = Store.get(); const view = $('#view'); view.innerHTML = '';
  const { p1, p2, draws } = s.totals; const total = p1 + p2; const pct = total ? Math.round((p1 / total) * 100) : 50;
  view.append(
    h('div', { class: 'score-hero' }, h('h2', {}, 'THE RIVALRY'),
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
  // affectionate trash-talk
  view.append(h('div', { class: 'taunt-line' }, rivalryTaunt(s)));
  // per-player badges (each of you earns your own — including the funny ones)
  const badges = computeBadges(s);
  function badgeGroup(seat) {
    const key = seat === 0 ? 'p0' : 'p1';
    const mine = badges.filter(b => b[key]);
    return h('div', { class: 'lead-list' },
      h('div', { class: 'sec-label' }, `${s.players[seat].emoji} ${esc(s.players[seat].name).toUpperCase()} · ${mine.length} BADGE${mine.length === 1 ? '' : 'S'}`),
      mine.length
        ? h('div', { class: 'badge-row' }, mine.map(b => h('div', { class: 'badge got' + (b.fun ? ' fun' : ''), title: b.d }, h('span', { class: 'badge-em' }, b.emoji), h('span', { class: 'badge-k' }, b.k))))
        : h('div', { class: 'empty-note' }, 'No badges yet — get playing! 🎮'));
  }
  view.append(badgeGroup(0), badgeGroup(1));
  const lead = h('div', { class: 'lead-list' }, h('div', { class: 'sec-label' }, 'BY GAME'));
  const played = Games.all().filter(g => s.perGame[g.id] && s.perGame[g.id].plays);
  if (!played.length) lead.append(h('div', { class: 'empty-note' }, 'No games played yet. Go make history.'));
  played.sort((a, b) => s.perGame[b.id].plays - s.perGame[a.id].plays).forEach(g => {
    const pg = s.perGame[g.id];
    lead.append(h('div', { class: 'lead-item' }, h('div', { class: 'le', html: Icons.game(g.id), style: `color:${g.accent}` }),
      h('div', { class: 'lname' }, g.name, h('small', {}, `${pg.plays} played${pg.draws ? ' · ' + pg.draws + ' draws' : ''}`)),
      h('div', { class: 'lsc' }, h('span', { class: 'a' }, String(pg.p1)), h('span', { class: 'sl' }, '–'), h('span', { class: 'b' }, String(pg.p2)))));
  });
  const danger = h('div', { class: 'danger-zone' });
  function buildDanger(armed) {
    danger.innerHTML = '';
    if (!armed) {
      danger.append(h('button', { class: 'btn btn-ghost', onclick: () => { if (Store.getIdentity() !== 0) return trollMeera(); buildDanger(true); Store.Sound.tap(); } }, 'Reset all scores'));
      return;
    }
    const inp = h('input', { type: 'password', class: 'reset-pass', placeholder: 'reset password…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    const err = h('div', { class: 'reset-err' });
    const confirmBtn = h('button', { class: 'btn btn-primary', onclick: () => {
      if (inp.value === 'smitwins') { Store.resetScores(); Store.Sound.win(); renderScores(); }
      else { Store.Sound.bad(); err.textContent = '✕ Wrong password — scores are safe.'; inp.value = ''; inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.focus(); }
    } }, 'Confirm reset');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') confirmBtn.click(); });
    danger.append(
      h('p', { class: 'hint' }, '🔒 Enter the reset password to wipe all scores:'),
      inp, err,
      h('div', { class: 'btn-row mt' },
        h('button', { class: 'btn btn-ghost', onclick: () => buildDanger(false) }, 'Cancel'),
        confirmBtn));
    setTimeout(() => inp.focus(), 60);
  }
  buildDanger(false);
  view.append(lead, danger);
}

/* ============================================================
   SETTINGS — modal helper, Smit's God-Mode gate, Meera trolling
   ============================================================ */
// A small on-brand modal. opts: {title, sub, nameInput?, password?, confirmLabel, cancel?, onConfirm({name,password}, errEl)->truthy=close}
function smModal(opts) {
  const back = h('div', { class: 'rules-overlay' });
  const card = h('div', { class: 'rules-card', style: 'text-align:center' });
  if (opts.title) card.append(h('h3', { style: 'margin-bottom:10px' }, opts.title));
  if (opts.sub) card.append(h('p', { style: 'color:var(--ink-dim);font-size:15px;margin:0 0 16px;line-height:1.55' }, opts.sub));
  let nameInp, passInp;
  if (opts.nameInput !== undefined) { nameInp = h('input', { type: 'text', class: 'reset-pass', style: 'letter-spacing:1px;text-align:center;font-family:var(--font-body)', value: opts.nameInput, maxlength: '14', placeholder: 'new name' }); card.append(nameInp); }
  if (opts.password) { passInp = h('input', { type: 'password', class: 'reset-pass mt', placeholder: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }); card.append(passInp); }
  const err = h('div', { class: 'reset-err' }); card.append(err);
  const acts = h('div', { class: 'btn-row mt' });
  if (opts.cancel !== false) acts.append(h('button', { class: 'btn btn-ghost', onclick: close }, 'Cancel'));
  const ok = h('button', { class: 'btn btn-primary', onclick: go }, opts.confirmLabel || 'OK'); acts.append(ok);
  card.append(acts); back.append(card); document.body.append(back);
  const focusEl = nameInp || passInp; if (focusEl) setTimeout(() => focusEl.focus(), 60);
  [nameInp, passInp].forEach(i => i && i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
  back.onclick = e => { if (e.target === back) close(); };
  function go() { const r = opts.onConfirm ? opts.onConfirm({ name: nameInp && nameInp.value, password: passInp && passInp.value }, err) : true; if (r) close(); }
  function close() { back.remove(); }
  return { close, err };
}
// Smit (seat 0) has "God Mode"; Meera (seat 1) gets playfully blocked.
const SM_TROLLS = [
  'Madam pls, focus on game.',
  "Ahh Madam, you can't do that.",
  'Lol, yeah — as if doing that will help.',
  'Name change allowed only if you say “I love you” to Smit. 💞',
  'Smit has the God Mode privilege here.',
  'Lol, try again.',
];
function trollMeera() {
  Store.Sound.bad();
  smModal({ title: 'God Mode required 🔒', sub: SM_TROLLS[Math.floor(Math.random() * SM_TROLLS.length)], confirmLabel: 'Fine 😤', cancel: false, onConfirm: () => true });
}
function editName(idx) {
  if (Store.getIdentity() !== 0) return trollMeera();          // only Smit's device may change names
  const cur = Store.player(idx).name;
  smModal({
    title: `Change ${esc(cur)}’s name`, sub: 'Enter the new name and Smit’s password.',
    nameInput: cur, password: true, confirmLabel: 'Change',
    onConfirm: (v, err) => {
      if ((v.password || '') !== 'change') { Store.Sound.bad(); err.textContent = '✕ Wrong password.'; return false; }
      const nm = (v.name || '').trim(); if (!nm) { err.textContent = 'Enter a name.'; return false; }
      Store.setPlayer(idx, { name: nm }); Store.Sound.good(); renderUs(); return true;
    },
  });
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
      onclick: () => { Store.setIdentity(i); if (Store.Net.ready()) Store.Net.goOnline(i, p.name); setupNudgeWatch(); renderUs(); Store.Sound.tap(); },
    }, p.emoji + ' ' + p.name))),
    h('p', { class: 'hint' }, 'Set who is playing on this phone. Your partner sets the other on their phone.'));

  function profileCard(idx) {
    const p = s.players[idx];
    const card = h('div', { class: 'card' }, h('h3', {}, `PLAYER ${idx + 1}`));
    card.append(h('div', { class: 'field' }, h('label', {}, 'Name'),
      h('div', { class: 'name-row' },
        h('input', { type: 'text', value: p.name, readonly: '', class: 'name-display' }),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => editName(idx) }, 'Edit'))));
    card.append(h('div', { class: 'field' }, h('label', {}, 'Avatar'),
      h('div', { class: 'emoji-pick' }, EMOJIS.map(em => h('button', { class: p.emoji === em ? 'sel' : '', onclick: () => { Store.setPlayer(idx, { emoji: em }); renderUs(); Store.Sound.tap(); } }, em)))));
    return card;
  }

  const set = h('div', { class: 'card' }, h('h3', {}, 'SETTINGS'));
  set.append(toggleRow('🔊 Sound effects', s.settings.sound, v => { Store.setSetting('sound', v); renderUs(); }));
  set.append(toggleRow('☀️ Light mode', s.settings.theme === 'light', v => { Store.setSetting('theme', v ? 'light' : 'dark'); document.body.classList.toggle('light', v); renderUs(); }));
  const notifState = !Notify.supported() ? ' — unsupported' : Notify.granted() ? ' — on' : (typeof Notification !== 'undefined' && Notification.permission === 'denied' ? ' — blocked in browser' : '');
  set.append(h('div', { class: 'toggle-row', onclick: () => { if (Notify.granted() || !Notify.supported()) return; Notify.ask().then(ok => { Store.Sound[ok ? 'good' : 'bad'](); renderUs(); }); } },
    h('span', {}, '🔔 Play notifications' + notifState),
    h('div', { class: 'switch' + (Notify.granted() ? ' on' : '') }, h('i'))));
  set.append(h('p', { class: 'hint' }, `Get a pop-up when ${esc(s.players[partnerSeat(me)].name)} nudges you to come play (fires while the app is open).`));
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
