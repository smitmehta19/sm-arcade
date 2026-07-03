/* ============================================================
   APP — boot, chrome wiring, net init, PWA
   ============================================================ */
(function boot() {
  const s = Store.get();
  document.body.classList.toggle('light', s.settings.theme === 'light');

  // swap nav emoji for SVG icons
  const navIcons = { home: 'play', date: 'date', scores: 'trophy', us: 'heart' };
  $$('.nav-item').forEach(n => { const ico = n.querySelector('.ni-ico'); if (ico && navIcons[n.dataset.route]) ico.innerHTML = Icons.ui(navIcons[n.dataset.route]); });

  function paintChrome() {
    const st = Store.get();
    rollNum($('#msP1'), 'ms:p1', st.totals.p1);   // digits roll in when the totals change
    rollNum($('#msP2'), 'ms:p2', st.totals.p2);
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

  // gyroscope parallax — the aurora drifts a few px as the phone tilts.
  // Uses the CSS `translate` property so it composes with the keyframe
  // `transform` animation. Android only: iOS gates the sensor behind a
  // permission prompt we don't want to spring on anyone. Compositor-only.
  (function gyro() {
    if (!window.DeviceOrientationEvent || typeof DeviceOrientationEvent.requestPermission === 'function') return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const glow = $('.bg-glow'), grid = $('.bg-grid'); if (!glow) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    function apply() {
      raf = null;
      cx += (tx - cx) * .1; cy += (ty - cy) * .1;
      glow.style.translate = `${(cx * 16).toFixed(1)}px ${(cy * 12).toFixed(1)}px`;
      if (grid) grid.style.translate = `${(cx * -6).toFixed(1)}px 0px`;
      if (Math.abs(cx - tx) > .004 || Math.abs(cy - ty) > .004) raf = requestAnimationFrame(apply);
    }
    window.addEventListener('deviceorientation', e => {
      tx = Math.max(-1, Math.min(1, (e.gamma || 0) / 32));
      ty = Math.max(-1, Math.min(1, ((e.beta || 0) - 40) / 45));
      if (!raf) raf = requestAnimationFrame(apply);
    });
  })();

  // wire networking BEFORE connecting, so the onCloud hook is registered
  initNet();
  Store.initCloud();

  Router.go();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
