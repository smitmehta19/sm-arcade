/* ============================================================
   TOURNAMENT — N random Word/Strategy games (host picks the count).
   The host chooses how many games (3, 5, 7, 10, or custom); a flat
   schedule of N games is drawn from the Word/Strategy pool. ui.js's
   renderStage orchestrates playing each game and tallying wins
   (tournamentSetup / tourCommit / advanceTournament). Every sub-game
   win is recorded on the scoreboard like a normal game; most wins is
   crowned Champion. Marked isTournament:true so the stage renders the
   current sub-game instead of this module.
   ============================================================ */
(function () {
  const css = `
  .tour-head{ background:linear-gradient(135deg, rgba(255,210,58,.12), rgba(178,102,255,.10)); border:1px solid var(--glass-brd); border-radius:14px; padding:12px 14px; margin-bottom:12px; }
  .tour-top{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
  .tour-badge{ font-family:var(--font-display); font-size:12px; letter-spacing:1.5px; color:var(--gold); }
  .tour-score{ font-family:var(--font-num); font-weight:900; font-size:18px; }
  .tour-score .p1{ color:var(--p1); } .tour-score .p2{ color:var(--p2); }
  .tour-now{ font-size:13px; color:var(--ink-dim); margin-bottom:8px; } .tour-now b{ color:var(--ink); }
  .tour-dots{ display:flex; gap:5px; flex-wrap:wrap; }
  .tdot{ width:16px; height:6px; border-radius:3px; background:var(--bg-2); border:1px solid var(--line); }
  .tdot.done{ background:var(--violet); border-color:transparent; }
  .tdot.cur{ background:var(--gold); border-color:transparent; box-shadow:0 0 6px var(--gold); }
  .tour-counts{ display:flex; gap:8px; justify-content:center; flex-wrap:wrap; margin:10px 0; }
  .tour-counts button{ padding:12px 18px; border-radius:12px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-family:var(--font-num); font-weight:900; font-size:16px; }
  .tour-counts button:active{ transform:scale(.95); border-color:var(--violet); }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const POOL_CATS = ['Word', 'Strategy'];
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // a flat schedule of n game ids — distinct first, then reshuffle the bag if n exceeds the pool
  function buildSchedule(n) {
    const pool = () => Games.all().filter(g => POOL_CATS.includes(g.category) && !g.isTournament && !g.coop).map(g => g.id);
    const out = []; let bag = [];
    while (out.length < n) { if (!bag.length) bag = shuffle(pool()); if (!bag.length) break; out.push(bag.pop()); }
    return out;
  }

  Games.register({
    id: 'tournament', name: 'Tournament', emoji: '🏆', category: 'Tournament', accent: '#ffd23a',
    tagline: 'Pick a length · most wins takes the crown.',
    isTournament: true,
    buildSchedule,                                   // used by ui.js once the host picks a count
    init: host => ({ isTournament: true, phase: 'setup', wins: [0, 0], log: [], slot: 0, host }),
    render(ctx) { if (ctx.msg) ctx.msg('Setting up the tournament…'); }, // ui.js renders setup/sub-games
  });
})();
