/* ============================================================
   ICONS — custom inline SVG line-art (replaces emoji)
   Tint via CSS `color` (stroke = currentColor).
   ============================================================ */
const Icons = (() => {
  const wrap = (inner, vb = '0 0 24 24') =>
    `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="icn" aria-hidden="true">${inner}</svg>`;
  const fc = 'fill="currentColor" stroke="none"';

  const GAME = {
    'tic-tac-toe': wrap('<path d="M9 4v16M15 4v16M4 9h16M4 15h16"/>'),
    'connect-four': wrap('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="8" cy="15" r="1.7" ' + fc + '/><circle cx="12" cy="11" r="1.7"/><circle cx="16" cy="15" r="1.7" ' + fc + '/>'),
    'dots-boxes': wrap('<circle cx="6" cy="6" r="1.1" ' + fc + '/><circle cx="18" cy="6" r="1.1" ' + fc + '/><circle cx="6" cy="18" r="1.1" ' + fc + '/><circle cx="18" cy="18" r="1.1" ' + fc + '/><rect x="6" y="6" width="12" height="12" rx="1.5"/>'),
    'checkers': wrap('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.4" ' + fc + '/>'),
    'reversi': wrap('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 010 16z" ' + fc + '/>'),
    'gomoku': wrap('<circle cx="7" cy="17" r="2.2"/><circle cx="12" cy="12" r="2.2" ' + fc + '/><circle cx="17" cy="7" r="2.2"/>'),
    'battleship': wrap('<path d="M4 14h16l-2.2 4H6.2z"/><path d="M12 14V6"/><path d="M12 6l5 1.5L12 9"/>'),
    'memory': wrap('<rect x="3.5" y="6" width="8.5" height="12" rx="1.6"/><rect x="12.5" y="6" width="8" height="12" rx="1.6"/><path d="M16.5 10v4M14.5 12h4"/>'),
    'word-duel': wrap('<rect x="3.5" y="9" width="6" height="6" rx="1.2"/><rect x="14.5" y="9" width="6" height="6" rx="1.2"/><path d="M6.5 9.8v4.4M16.5 11h2"/>'),
    'hangman': wrap('<path d="M5 20V4h8M13 4v3"/><circle cx="13" cy="9.2" r="2.1"/><path d="M13 11.3v4.7"/>'),
    'rps': wrap('<path d="M8.5 12V7.5a1.5 1.5 0 013 0V11M11.5 11V6.5a1.5 1.5 0 013 0V11M14.5 11.5V8a1.5 1.5 0 013 0v5a5 5 0 01-5 5 5 5 0 01-4.3-2.4L9 14l-2-2.4a1.5 1.5 0 012.2-2L9.6 11"/>'),
    'couple-quiz': wrap('<path d="M8 6.5a3 3 0 00-4 2.6c0 2.4 4 5.4 4 5.4s4-3 4-5.4a3 3 0 00-4-2.6z"/><path d="M15.5 11a2.3 2.3 0 00-3 2c0 1.9 3 4 3 4s3-2.1 3-4a2.3 2.3 0 00-3-2z"/>'),
    'pentago': wrap('<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M12 3.5v17M3.5 12h17"/><path d="M7.5 7.5a2.6 2.6 0 11.1 0" stroke-dasharray="0.1 4.6"/><circle cx="16" cy="8" r="1.4" ' + fc + '/>'),
    'hex': wrap('<path d="M12 3l7.5 4.3v8.6L12 20.2 4.5 15.9V7.3z"/><circle cx="12" cy="12" r="2" ' + fc + '/>'),
    'nine-mens-morris': wrap('<rect x="3.5" y="3.5" width="17" height="17"/><rect x="7.5" y="7.5" width="9" height="9"/><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4"/>'),
    'quoridor': wrap('<circle cx="8.5" cy="8" r="2.2"/><path d="M8.5 10.2V17"/><path d="M14.5 5v14" stroke-width="3"/>'),
    'quarto': wrap('<ellipse cx="12" cy="6.5" rx="5" ry="2"/><path d="M7 6.5v9a5 2 0 0010 0v-9"/><ellipse cx="12" cy="13" rx="2.2" ry="1"/>'),
    'code-breaker': wrap('<circle cx="6.5" cy="9" r="2"/><circle cx="11.5" cy="9" r="2" ' + fc + '/><circle cx="16.5" cy="9" r="2"/><path d="M5 15h14M5 18h9"/>'),
    'ghost': wrap('<path d="M6 20v-8.5a6 6 0 0112 0V20l-2-1.8L14 20l-2-1.8L10 20l-2-1.8z"/><circle cx="9.7" cy="11" r="1" ' + fc + '/><circle cx="14.3" cy="11" r="1" ' + fc + '/>'),
    'two-truths': wrap('<path d="M3.5 7.5A2.5 2.5 0 016 5h7a2.5 2.5 0 012.5 2.5v3A2.5 2.5 0 0113 13H8l-3.5 2.8V13a1 1 0 01-1-1z"/><path d="M18 10.5h.01M20.5 14v3.5L18 15.6h-2"/>'),
    'tournament': wrap('<path d="M7 4h10v4.5a5 5 0 01-10 0z"/><path d="M7 5.5H4.5V7a3 3 0 003 3M17 5.5h2.5V7a3 3 0 01-3 3"/><path d="M10 13.5v2.5h4v-2.5M8.5 20h7M12 16v2"/>'),
    // ---- new games (custom icons so they don't fall back to the plain circle) ----
    'yahtzee': wrap('<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.2" ' + fc + '/><circle cx="15.5" cy="8.5" r="1.2" ' + fc + '/><circle cx="12" cy="12" r="1.2" ' + fc + '/><circle cx="8.5" cy="15.5" r="1.2" ' + fc + '/><circle cx="15.5" cy="15.5" r="1.2" ' + fc + '/>'),
    'liars-dice': wrap('<rect x="3" y="9" width="12" height="12" rx="2.6" transform="rotate(-8 9 15)"/><circle cx="7" cy="13" r="1.1" ' + fc + '/><circle cx="11" cy="17" r="1.1" ' + fc + '/><path d="M14.5 3.5l1.1 2.4 2.6.3-1.9 1.8.5 2.6-2.3-1.3-2.3 1.3.5-2.6-1.9-1.8 2.6-.3z" ' + fc + '/>'),
    'jaipur': wrap('<path d="M4 18c1.5-2 2-5 2-7 0-1.6 1.3-3 3-3 .9 0 1.6.4 2 1h3.5c.8 0 1.5.7 1.5 1.5 0 1.5.6 4 2 6"/><path d="M6 11V8.5M9 18v-3M16 18v-3"/><circle cx="8.4" cy="9.2" r=".5" ' + fc + '/>'),
    'onitama': wrap('<path d="M5 19V8l3.5-3 3.5 3 3.5-3L19 8v11z"/><path d="M5 19h14M9.5 19v-4h5v4"/><circle cx="12" cy="10.5" r="1.4" ' + fc + '/>'),
    'letterpress': wrap('<rect x="3.5" y="3.5" width="17" height="17" rx="2.5"/><path d="M9 8v8M9 8h3.2a2.4 2.4 0 010 4.8H9"/><path d="M14.5 16l-1.2-3.2"/>'),
    'codenames-duet': wrap('<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M3.5 9.5h17M8 5.5v13M16 5.5v13"/><circle cx="12" cy="14" r="1.4" ' + fc + '/>'),
    'draw-guess': wrap('<path d="M3 21l1.2-4.2L14 7l3 3-9.8 9.8z"/><path d="M13 8l3 3"/><path d="M16.5 4.5l3 3a1.4 1.4 0 010 2L18 11l-3-3 1.5-1.5a1.4 1.4 0 012-2z" ' + fc + '/>'),
    'ultimate-ttt': wrap('<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17" stroke-width="1.2"/><path d="M5 5.7h2.3M5.7 5v2.3" stroke-width="1.5"/><circle cx="18.8" cy="18.8" r="1.4" stroke-width="1.5"/>'),
  };

  const UI = {
    play: wrap('<rect x="2.5" y="6.5" width="19" height="11" rx="4"/><path d="M7 12h2.5M8.25 10.75v2.5"/><circle cx="15.5" cy="11" r="1" ' + fc + '/><circle cx="17.5" cy="13" r="1" ' + fc + '/>'),
    trophy: wrap('<path d="M7 4h10v4.5a5 5 0 01-10 0z"/><path d="M7 5.5H4.5V7a3 3 0 003 3M17 5.5h2.5V7a3 3 0 01-3 3"/><path d="M10 13.5v2.5h4v-2.5M8.5 20h7M12 16v2"/>'),
    heart: wrap('<path d="M12 20s-7-4.6-7-9.2A3.8 3.8 0 0112 8a3.8 3.8 0 017 2.8C19 15.4 12 20 12 20z"/>'),
    search: wrap('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/>'),
    sound: wrap('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a3.5 3.5 0 010 6M18.5 7a6.5 6.5 0 010 10"/>'),
    mute: wrap('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 10l4 4M20 10l-4 4"/>'),
  };

  return {
    game: id => GAME[id] || wrap('<circle cx="12" cy="12" r="8"/>'),
    ui: name => UI[name] || '',
    has: id => !!GAME[id],
  };
})();
