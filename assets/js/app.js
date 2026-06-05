/* ============================================================
   APP — boot, chrome wiring, net init, PWA
   ============================================================ */
(function boot() {
  const s = Store.get();
  document.body.classList.toggle('light', s.settings.theme === 'light');

  // swap nav emoji for SVG icons
  const navIcons = { home: 'play', scores: 'trophy', us: 'heart' };
  $$('.nav-item').forEach(n => { const ico = n.querySelector('.ni-ico'); if (ico && navIcons[n.dataset.route]) ico.innerHTML = Icons.ui(navIcons[n.dataset.route]); });

  function paintChrome() {
    const st = Store.get();
    $('#msP1').textContent = st.totals.p1;
    $('#msP2').textContent = st.totals.p2;
    $('#soundBtn').innerHTML = Icons.ui(st.settings.sound ? 'sound' : 'mute');
  }
  Store.subscribe(() => {
    paintChrome();
    const hash = location.hash || '#/';
    if ((hash === '#/' || hash === '') && Store.getIdentity() != null) renderHome();
  });
  paintChrome();

  $('#soundBtn').addEventListener('click', () => { Store.setSetting('sound', !Store.get().settings.sound); Store.Sound.tap(); });

  // Leaving a live game must go through BOTH-player consent — never a silent bail.
  // The back arrow AND the brand link both sit over the game (the bottom nav is
  // hidden in-game), so both route through requestEndGame, which asks the partner
  // to agree (or just leaves cleanly if nothing is live / partner is offline).
  function leaveGuard(e) {
    const inGame = /^#\/play\//.test(location.hash || '');
    if (inGame && typeof requestEndGame === 'function') {
      if (e) e.preventDefault();
      requestEndGame();
      return true;
    }
    return false;
  }
  $('#backBtn').addEventListener('click', () => { if (!leaveGuard()) location.hash = '#/'; });
  $('#brand').addEventListener('click', e => { leaveGuard(e); });

  const unlock = () => { Store.Sound.tap(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock, { once: true });

  window.addEventListener('hashchange', Router.go);

  // wire networking BEFORE connecting, so the onCloud hook is registered
  initNet();
  Store.initCloud();

  Router.go();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
