/* ============================================================
   STORE — state, persistence, cloud sync, sound
   ============================================================ */
const Store = (() => {
  const LS_KEY = 'sm_arcade_v1';

  const blankState = () => ({
    players: JSON.parse(JSON.stringify(window.PLAYERS_DEFAULT)),
    totals: { p1: 0, p2: 0, draws: 0 },
    perGame: {},                 // gameId -> {p1,p2,draws,plays}
    tourWins: [0, 0],            // tournament championships per seat (bragging only, not a score)
    streak: { who: null, n: 0 }, // current win streak
    history: [],                 // recent results [{g, w, t}]
    favorites: [],               // gameIds
    settings: { sound: true, theme: 'dark' },
    updated: 0,
  });

  let state = load();
  let db = null, cloud = false, ref = null;
  const subs = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) return Object.assign(blankState(), JSON.parse(raw));
    } catch (e) {}
    return blankState();
  }
  function persistLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function emit() { subs.forEach(fn => fn(state)); }
  function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

  /* ---- cloud (firebase) — scripts loaded on demand ---- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej; document.head.append(s);
    });
  }
  async function initCloud() {
    if (!window.CLOUD || !window.CLOUD.ENABLED) { setPill('local'); return; }
    try {
      if (typeof firebase === 'undefined') {
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js');
      }
    } catch (e) { console.warn('Firebase scripts failed to load — local mode.', e); setPill('local'); return; }
    if (typeof firebase === 'undefined' || !firebase.initializeApp) { setPill('local'); return; }
    try {
      firebase.initializeApp(window.CLOUD.config);
      db = firebase.database();
      // Sign in anonymously so Security Rules can require auth (never ship test-mode rules).
      // If anonymous auth isn't enabled, we still try to connect (works with open rules) but warn.
      try {
        if (firebase.auth) { await firebase.auth().signInAnonymously(); }
      } catch (authErr) {
        console.warn('Anonymous auth failed (enable it in Firebase console for secure rules).', authErr);
      }
      connectRoom();
    } catch (e) {
      console.warn('Cloud sync unavailable, using local only.', e);
      cloud = false; setPill('local');
    }
  }
  function connectRoom() {
    ref = db.ref('rooms/' + (window.CLOUD.ROOM || 'default'));
    cloud = true;
    setPill('cloud');
    cloudCbs.forEach(fn => { try { fn(); } catch (e) {} });
    // pull remote, merge newest-wins, then live-listen
    ref.on('value', snap => {
      const remote = snap.val();
      if (remote && (remote.updated || 0) >= (state.updated || 0)) {
        const localPrefs = state.settings; // keep local-only prefs if remote lacks them
        state = Object.assign(blankState(), remote);
        if (!remote.settings) state.settings = localPrefs;
        persistLocal();
        emit();
      } else if (!remote) {
        pushCloud(); // first write seeds the room
      }
    }, err => { console.warn('Cloud read denied — check your Security Rules. Falling back to local.', err); cloud = false; setPill('local'); });
  }
  function pushCloud() { if (cloud && ref) ref.set(state).catch(() => {}); }

  function setPill(kind) {
    const el = document.getElementById('syncPill');
    if (!el) return;
    el.hidden = false;
    el.className = 'sync-pill ' + kind;
    el.textContent = kind === 'cloud' ? '☁ Cloud synced' : '📱 Saved on this device';
    setTimeout(() => { el.hidden = true; }, 2600);
  }

  function save() { state.updated = (state.updated || 0) + 1; persistLocal(); pushCloud(); emit(); }

  /* ---- mutations ---- */
  function recordResult(gameId, winner /* 'p1' | 'p2' | 'draw' */) {
    if (!state.perGame[gameId]) state.perGame[gameId] = { p1: 0, p2: 0, draws: 0, plays: 0 };
    const g = state.perGame[gameId];
    g.plays++;
    if (winner === 'draw') { state.totals.draws++; g.draws++; state.streak = { who: null, n: 0 }; }
    else {
      state.totals[winner]++; g[winner]++;
      if (state.streak.who === winner) state.streak.n++;
      else state.streak = { who: winner, n: 1 };
    }
    state.history.unshift({ g: gameId, w: winner, t: Date.now() });
    state.history = state.history.slice(0, 40);
    save();
  }
  function recordTournament(winnerSeat) {
    if (!Array.isArray(state.tourWins)) state.tourWins = [0, 0];
    if (winnerSeat === 0 || winnerSeat === 1) { state.tourWins[winnerSeat]++; save(); }
  }
  function toggleFav(gameId) {
    const i = state.favorites.indexOf(gameId);
    if (i >= 0) state.favorites.splice(i, 1); else state.favorites.push(gameId);
    save();
  }
  function setPlayer(idx, patch) { Object.assign(state.players[idx], patch); save(); }
  function setSetting(key, val) { state.settings[key] = val; save(); }
  function resetScores() {
    state.totals = { p1: 0, p2: 0, draws: 0 };
    state.perGame = {}; state.streak = { who: null, n: 0 }; state.history = []; state.tourWins = [0, 0];
    save();
  }

  /* ---- getters ---- */
  const get = () => state;
  const player = i => state.players[i];

  /* ---- sound (WebAudio, no files needed) ---- */
  let actx = null;
  function ac() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return actx; }
  function beep(freq = 440, dur = 0.08, type = 'square', vol = 0.18) {
    if (!state.settings.sound) return;
    const c = ac(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + dur);
  }
  const Sound = {
    tap:   () => beep(660, 0.05, 'square', 0.12),
    place: () => beep(330, 0.07, 'triangle', 0.16),
    move:  () => beep(520, 0.05, 'sine', 0.12),
    good:  () => { beep(523, .08); setTimeout(() => beep(784, .12), 80); },
    bad:   () => beep(150, 0.18, 'sawtooth', 0.18),
    win:   () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, .14, 'square', .2), i * 100)); },
    draw:  () => { beep(400, .1); setTimeout(() => beep(300, .14), 120); },
    countdown: () => beep(880, 0.08, 'square', 0.2),
  };

  /* ---- device identity (which seat THIS device plays; local-only, not synced) ---- */
  const ID_KEY = 'sm_identity_v1';
  function getIdentity() { const v = localStorage.getItem(ID_KEY); return v === '0' || v === '1' ? +v : null; }
  function setIdentity(i) { localStorage.setItem(ID_KEY, String(i)); emit(); }

  /* ---- cloud-connected hooks (net layer subscribes here) ---- */
  const cloudCbs = new Set();
  function onCloud(fn) { cloudCbs.add(fn); if (cloud) { try { fn(); } catch (e) {} } return () => cloudCbs.delete(fn); }

  /* ---- realtime networking: presence + active match ---- */
  const ROOM = () => (window.CLOUD && window.CLOUD.ROOM) || 'default';
  const Net = {
    ready: () => cloud,
    // presence: announce this seat online; flips offline automatically on disconnect
    goOnline(seat, name) {
      if (!cloud || seat == null) return;
      try {
        const pref = db.ref('presence/' + ROOM() + '/' + seat);
        const con = db.ref('.info/connected');
        con.on('value', s => {
          if (s.val() === true) {
            pref.onDisconnect().update({ online: false, ts: firebase.database.ServerValue.TIMESTAMP });
            pref.set({ online: true, name: name || '', ts: firebase.database.ServerValue.TIMESTAMP });
          }
        });
      } catch (e) { console.warn('presence error', e); }
    },
    watchPresence(cb) {
      if (!cloud) return () => {};
      const pref = db.ref('presence/' + ROOM());
      const h = pref.on('value', s => cb(s.val() || {}));
      return () => pref.off('value', h);
    },
    watchMatch(cb) {
      if (!cloud) return () => {};
      const mref = db.ref('matches/' + ROOM() + '/active');
      const h = mref.on('value', s => cb(s.val() || null),
        err => console.warn('match read denied — republish Security Rules to allow "matches".', err));
      return () => mref.off('value', h);
    },
    setMatch(obj) { if (cloud) return db.ref('matches/' + ROOM() + '/active').set(obj); return Promise.resolve(); },
    updateMatch(patch) { if (cloud) return db.ref('matches/' + ROOM() + '/active').update(patch); return Promise.resolve(); },
    clearMatch() { if (cloud) return db.ref('matches/' + ROOM() + '/active').remove(); return Promise.resolve(); },
    serverTime: () => (typeof firebase !== 'undefined' && firebase.database) ? firebase.database.ServerValue.TIMESTAMP : Date.now(),
  };

  return {
    initCloud, subscribe, get, player,
    recordResult, recordTournament, toggleFav, setPlayer, setSetting, resetScores,
    Sound, isCloud: () => cloud,
    getIdentity, setIdentity, onCloud, Net,
  };
})();
