/* ============================================================
   TOURNAMENT — 5 random Word/Strategy games, 2 rounds each (10 games).
   The bracket is built here (init); ui.js's renderStage orchestrates
   playing each sub-game and tallying wins (tourCommit / advanceTournament).
   Every sub-game win is recorded on the scoreboard like a normal game;
   most wins is crowned Champion. Marked with isTournament:true so the
   stage knows to render the current sub-game instead of this module.
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
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const POOL_CATS = ['Word', 'Strategy'];
  function pickGames(n) {
    const pool = Games.all().filter(g => POOL_CATS.includes(g.category) && !g.isTournament);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, n).map(g => g.id);
  }

  Games.register({
    id: 'tournament', name: 'Tournament', emoji: '🏆', category: 'Tournament', accent: '#ffd23a',
    tagline: '5 random games · most wins takes the crown.',
    isTournament: true,
    init(host) {
      const games = pickGames(5);
      const first = games[0];
      return {
        isTournament: true, games, rounds: 2, slot: 0, wins: [0, 0], log: [],
        subId: first, sub: Games.byId(first).init(host),
        phase: 'play', host,
      };
    },
    // ui.js renders the CURRENT sub-game (see renderStage); this is only a fallback.
    render(ctx) { if (ctx.msg) ctx.msg('Setting up the tournament…'); },
  });
})();
