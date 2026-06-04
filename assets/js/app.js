/* ============================================================
   APP — boot, chrome wiring, net init, PWA
   ============================================================ */
(function boot() {
  const s = Store.get();
  document.body.classList.toggle('light', s.settings.theme === 'light');

  function paintChrome() {
    const st = Store.get();
    $('#msP1').textContent = st.totals.p1;
    $('#msP2').textContent = st.totals.p2;
    $('#soundBtn').textContent = st.settings.sound ? '🔊' : '🔇';
  }
  Store.subscribe(() => {
    paintChrome();
    const hash = location.hash || '#/';
    if ((hash === '#/' || hash === '') && Store.getIdentity() != null) renderHome();
  });
  paintChrome();

  $('#soundBtn').addEventListener('click', () => { Store.setSetting('sound', !Store.get().settings.sound); Store.Sound.tap(); });
  $('#backBtn').addEventListener('click', () => { location.hash = '#/'; });

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
