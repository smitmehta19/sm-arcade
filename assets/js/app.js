/* ============================================================
   APP — boot, chrome wiring, net init, PWA
   (the whole app waits behind the password gate — no cloud
   connection, presence or UI until this device is unlocked)
   ============================================================ */
Gate.ready(function boot() {
  const s = Store.get();
  document.body.classList.toggle('light', s.settings.theme === 'light');

  // swap nav emoji for SVG icons
  const navIcons = { home: 'play', date: 'date', scores: 'trophy', plans: 'calendar' };
  $$('.nav-item').forEach(n => { const ico = n.querySelector('.ni-ico'); if (ico && navIcons[n.dataset.route]) ico.innerHTML = Icons.ui(navIcons[n.dataset.route]); });

  function paintChrome() {
    const st = Store.get();                       // topbar shows the ALL-TIME totals (user call)
    rollNum($('#msP1'), 'ms:p1', st.totals.p1);
    rollNum($('#msP2'), 'ms:p2', st.totals.p2);
    $('#soundBtn').innerHTML = Icons.ui(st.settings.sound ? 'sound' : 'mute');
    $('#settingsBtn').innerHTML = Icons.ui('gear');
    $('#storyBtn').innerHTML = Icons.ui('heart');
  }
  Store.subscribe(() => {
    paintChrome();
    const hash = location.hash || '#/';
    // live data → same screen: softRefresh keeps scroll and skips the entrance animations (v79 flicker fix)
    if ((hash === '#/' || hash === '') && Store.getIdentity() != null) softRefresh(renderHome);
    if (hash.startsWith('#/plans') && Store.getIdentity() != null) softRefresh(renderPlans); // live calendar updates from the partner
    if (hash.startsWith('#/story') && Store.getIdentity() != null) softRefresh(renderStory);
  });
  paintChrome();

  $('#soundBtn').addEventListener('click', () => { Store.setSetting('sound', !Store.get().settings.sound); Store.Sound.tap(); });
  // settings moved off the bottom nav (Plans took its slot) → gear in the topbar
  $('#settingsBtn').addEventListener('click', () => { if (!leaveGuard()) { location.hash = '#/us'; } Store.Sound.tap(); });
  // Our Story — dates, places & keepsakes — lives next to the gear
  $('#storyBtn').addEventListener('click', () => { if (!leaveGuard()) { location.hash = '#/story'; } Store.Sound.tap(); });

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

  // Shared in from another app (manifest share_target) — e.g. Google Maps →
  // Share → S×M Arcade. Stash the payload, tidy the URL, and land on Our Story
  // with the place editor already open.
  (function shareTarget() {
    try {
      const sp = new URLSearchParams(location.search);
      const blob = [sp.get('url'), sp.get('text'), sp.get('title')].filter(Boolean).join('\n').trim();
      if (!blob) return;
      window.__sharedPlace = blob;
      history.replaceState(null, '', location.pathname + '#/story');
      location.hash = '#/story';
    } catch (e) {}
  })();

  // MOTION BUDGET (P6): pause the ambient decorative loops when the app is
  // backgrounded — saves battery and stops motion the user can't even see.
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));

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
  Store.stampTz(Store.getIdentity()); // keep this device's timezone on record for the Plans preview

  Router.go();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) autoUpdate();

  // AUTO-UPDATE — a phone left open across a deploy kept running the old JS (only a full reload loads new
  // code). Check for a new sw.js whenever the app comes to the front and every 10 min while visible; the new
  // worker skipWaiting + clients.claim → 'controllerchange' → "update ready". The reload itself only happens
  // at a moment that can't cost anything on screen:
  //   - right as the app comes to the front (≤10 s after hidden→visible / boot, before any tap, key or scroll), or
  //   - on a route change to Home (after the leave/finish writes have landed, see holdUpdate in ui.js);
  // and never while updateBlocker() (ui.js) objects: live match, unsaved edits, an open editor/dialog, or a
  // match-end write still in flight. Otherwise it waits for the next return to the front.
  // At most ONE auto-reload per version (sessionStorage mark), so it can never loop. Writes nothing to the cloud.
  function autoUpdate() {
    const sw = navigator.serviceWorker, MARK = 'sm_autoupd';  // MARK = {v, t, toast} of our last auto-reload
    const FRONT_MS = 10000, HOME_SETTLE_MS = 4000;
    let reg = null, checking = false, ready = false, ver = '', noted = false, reloading = false, settle = null;
    let frontAt = Date.now(), touched = false;                 // opening the app counts as coming to the front
    // no controller at boot = first install (or a Force update): that first claim is not an update. A page
    // that booted uncontrolled while a worker was already active (e.g. shift-reload) is NOT a first install.
    let hadController = !!sw.controller;
    if (!hadController && sw.getRegistration) sw.getRegistration().then(r => { if (r && r.active) hadController = true; }).catch(() => {});
    const readMark = () => { try { return JSON.parse(sessionStorage.getItem(MARK) || 'null') || {}; } catch (e) { return {}; } };
    const writeMark = m => { try { sessionStorage.setItem(MARK, JSON.stringify(m)); } catch (e) {} };
    // the version this phone now runs = the newest sm-arcade-vNN cache (the new worker deletes the old ones)
    const cacheVer = () => Promise.resolve(window.caches && caches.keys ? caches.keys() : [])
      .then(ks => { const n = ks.map(k => +((/^sm-arcade-v(\d+)$/.exec(k) || [])[1] || 0)); const top = Math.max(0, ...n); return top ? 'v' + top : ''; })
      .catch(() => '');
    const atHome = () => (location.hash === '' || location.hash === '#/');

    const m0 = readMark();                                     // we just reloaded into a new version → say so once
    if (m0.toast) { writeMark(Object.assign({}, m0, { toast: 0 })); setTimeout(() => showToast(`Updated to <b>${esc(m0.v || 'the latest version')}</b> ✨`), 700); }

    function check() {
      if (!reg || checking || document.visibilityState !== 'visible' || navigator.onLine === false) return; // offline: stay quiet
      checking = true;
      reg.update().catch(() => {}).then(() => { checking = false; });
    }
    function apply(home) {
      if (!ready || reloading) return;
      const why = updateBlocker();
      if (why) {
        if (why === 'game' && !noted) { noted = true; showToast('🔄 Update ready — it installs after this game.'); }
        return;
      }
      const front = document.visibilityState === 'visible' && !touched && Date.now() - frontAt < FRONT_MS;
      if (!front && !(home && atHome())) return;              // mid-use: keep it ready for the next return to front
      if (navigator.onLine === false) return;                  // a reload would drop the cloud's queued writes
      const m = readMark();
      // one reload per version, never a loop (unknown version → at most one per minute). NB a sw.js change
      // WITHOUT a CACHE bump keeps the same version name → it matches the mark and never auto-reloads; that's
      // fine, because every real deploy bumps CACHE.
      if (ver ? m.v === ver : (m.t && Date.now() - m.t < 60000)) return;
      reloading = true;
      writeMark({ v: ver, t: Date.now(), toast: 1 });
      location.reload();
    }
    sw.addEventListener('controllerchange', () => {
      if (!hadController) { hadController = true; return; }
      cacheVer().then(v => { ver = v || ver; ready = true; apply(false); });
    });
    // any real use ends the "just came to the front" window
    ['pointerdown', 'keydown', 'wheel'].forEach(t => window.addEventListener(t, () => { touched = true; }, { capture: true, passive: true }));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      frontAt = Date.now(); touched = false;
      apply(false); check();
    });
    // back on Home (e.g. after a game): reload once the exit's cloud writes have had time to land
    window.addEventListener('hashchange', () => { clearTimeout(settle); if (ready && atHome()) settle = setTimeout(() => apply(true), HOME_SETTLE_MS); });
    setInterval(check, 10 * 60 * 1000);

    const register = () => sw.register('sw.js').then(r => { reg = r; }).catch(() => {});
    if (document.readyState === 'complete') register(); else window.addEventListener('load', register);
  }
});
