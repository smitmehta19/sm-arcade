/* ============================================================
   APP — boot, chrome wiring, mini-scoreboard, PWA
   ============================================================ */
(function boot() {
  const s = Store.get();

  // apply theme
  document.body.classList.toggle('light', s.settings.theme === 'light');

  // mini scoreboard + sound button reflect live state
  function paintChrome() {
    const st = Store.get();
    $('#msP1').textContent = st.totals.p1;
    $('#msP2').textContent = st.totals.p2;
    $('#soundBtn').textContent = st.settings.sound ? '🔊' : '🔇';
  }
  Store.subscribe(() => {
    paintChrome();
    // refresh current page if it's data-driven
    const hash = location.hash || '#/';
    if (hash === '#/' || hash === '') { /* home re-renders on its own interactions */ }
  });
  paintChrome();

  // sound toggle
  $('#soundBtn').addEventListener('click', () => {
    Store.setSetting('sound', !Store.get().settings.sound);
    Store.Sound.tap();
  });

  // back button
  $('#backBtn').addEventListener('click', () => { location.hash = '#/'; });

  // unlock audio on first touch (mobile autoplay policy)
  const unlock = () => { Store.Sound.tap(); window.removeEventListener('pointerdown', unlock); };
  window.addEventListener('pointerdown', unlock, { once: true });

  // router
  window.addEventListener('hashchange', Router.go);

  // cloud sync (after first paint)
  Store.initCloud();

  // first render
  Router.go();

  // PWA service worker (only works over http/https, not file://)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
