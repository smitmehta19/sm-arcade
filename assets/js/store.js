/* ============================================================
   STORE — state, persistence, cloud sync, sound
   ============================================================ */
const Store = (() => {
  const LS_KEY = 'sm_arcade_v1';

  // 'YYYY-MM' for the current (or given) moment — the season key
  function curYM(t) { const d = t ? new Date(t) : new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }

  const blankState = () => ({
    players: JSON.parse(JSON.stringify(window.PLAYERS_DEFAULT)),
    totals: { p1: 0, p2: 0, draws: 0 },
    perGame: {},                 // gameId -> {p1,p2,draws,plays}
    tourWins: [0, 0],            // tournament championships per seat (bragging only, not a score)
    streak: { who: null, n: 0 }, // current win streak
    seasons: { cur: { ym: curYM(), p1: 0, p2: 0, draws: 0 }, past: [] }, // monthly race + trophy cabinet
    history: [],                 // recent results [{g, w, t}]
    favorites: [],               // gameIds
    dateNight: { done: [], removed: [], faved: [] }, // shared date-roulette lists
    plans: [], // shared calendar entries (see planAdd) — timed entries store UTC ms, so each viewer sees their own local time
    plansDeleted: [], // tombstones [{id,t}] so deletions survive the per-entry plan merge
    story: [],        // Our Story: {kind:'moment', emoji,title,date?,recur?,place?,lat?,lon?,note?} + {kind:'period', start}
    storyDeleted: [], // tombstones for story (same merge protection as plans)
    meet: { nextAt: null, lastMetAt: null }, // shared reunion countdown: ms timestamps (synced)
    settings: { sound: true, theme: 'dark' },
    updated: 0,
  });

  let state = load();
  let db = null, cloud = false, ref = null, serverOffset = 0;
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
    // keep a synced clock so both phones count timers down to the same instant
    try { db.ref('.info/serverTimeOffset').on('value', s => { serverOffset = s.val() || 0; }); } catch (e) {}
    cloudCbs.forEach(fn => { try { fn(); } catch (e) {} });
    // one-time move off the old committed-in-the-repo room, then live-listen
    migrateLegacy().then(listenRoom, listenRoom);
  }
  // The pre-v48 room id was committed publicly; the current room is derived from
  // the gate password. Copy the old room's data into the new one (newest-wins)
  // and delete the old paths so nothing readable remains at the public address.
  // Safe to lose entirely: both phones hold the full Store state locally and
  // re-seed the new room on their next save.
  async function migrateLegacy() {
    try {
      const legacy = window.CLOUD.LEGACY_ROOM, cur = window.CLOUD.ROOM;
      if (!cloud || !legacy || !cur || legacy === cur) return;
      const lref = db.ref('rooms/' + legacy);
      const lsnap = await lref.get();
      if (lsnap.exists()) {
        const lv = lsnap.val();
        const csnap = await db.ref('rooms/' + cur).get();
        if (!csnap.exists() || (lv.updated || 0) > (csnap.val().updated || 0)) {
          await db.ref('rooms/' + cur).set(lv);
        }
        await lref.remove();
      }
      await db.ref('matches/' + legacy).remove().catch(() => {});
      await db.ref('presence/' + legacy).remove().catch(() => {});
    } catch (e) { console.warn('legacy room migration skipped (will retry next open)', e); }
  }
  function listenRoom() {
    ref.on('value', snap => {
      const remote = snap.val();
      if (!remote) { pushCloud(); return; }   // first write seeds the room
      mergeRemote(remote);
    }, err => { console.warn('Cloud read denied — check your Security Rules. Falling back to local.', err); cloud = false; setPill('local'); });
  }

  // Merge an incoming room snapshot. The bulk state is newest-wins (as before),
  // but PLANS are merged PER-ENTRY with delete-tombstones, and each seat's
  // device timezone survives from whichever side knows it — so one phone can
  // never wipe out entries the other added while they were apart (the "only I
  // can see my calendar" split-brain). If the merge ends up knowing more than
  // the room does (or the room is older), we save() the merged truth back;
  // the union is idempotent, so the echo of our own write merges to no-change.
  // union tombstones from both sides (newest wins per id, capped)
  function unionDeleted(a, b) {
    const m = new Map();
    (a || []).concat(b || []).forEach(d => { if (d && d.id && (!m.has(d.id) || m.get(d.id).t < d.t)) m.set(d.id, d); });
    return [...m.values()].sort((x, y) => y.t - x.t).slice(0, 80);
  }
  // union a list of {id,…} entries — the OLDER side is inserted first so the
  // NEWER side's copy of the same id wins (e.g. a fresher `confirmed` flag)
  function unionById(older, newer, deleted) {
    const m = new Map();
    (older || []).forEach(e => { if (e && e.id) m.set(e.id, e); });
    (newer || []).forEach(e => { if (e && e.id) m.set(e.id, e); });
    (deleted || []).forEach(d => m.delete(d.id));
    return [...m.values()].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  function mergeRemote(remote) {
    const remoteNewer = (remote.updated || 0) >= (state.updated || 0);
    const arr = (o, k) => Array.isArray(o[k]) ? o[k] : [];
    // per-entry merged collections (plans = calendar, story = Our Story memories/period logs)
    const merged = {};
    let roomLacks = false;
    [['plans', 'plansDeleted'], ['story', 'storyDeleted']].forEach(([key, delKey]) => {
      const del = unionDeleted(arr(state, delKey), arr(remote, delKey));
      const list = unionById(
        remoteNewer ? arr(state, key) : arr(remote, key),
        remoteNewer ? arr(remote, key) : arr(state, key), del);
      merged[key] = list; merged[delKey] = del;
      if (JSON.stringify(list) !== JSON.stringify(arr(remote, key)) || del.length !== arr(remote, delKey).length) roomLacks = true;
    });
    // a seat's device timezone: whichever side has one (newer side preferred)
    const tzFor = i => { const rp = (remote.players || [])[i] || {}, lp = (state.players || [])[i] || {}; return (remoteNewer ? (rp.tz || lp.tz) : (lp.tz || rp.tz)) || null; };
    const tz0 = tzFor(0), tz1 = tzFor(1);
    if (remoteNewer) {
      const localPrefs = state.settings; // keep local-only prefs if remote lacks them
      state = Object.assign(blankState(), remote);
      if (!remote.settings) state.settings = localPrefs;
    }
    Object.assign(state, merged);
    if (tz0 && state.players[0]) state.players[0].tz = tz0;
    if (tz1 && state.players[1]) state.players[1].tz = tz1;
    persistLocal();
    emit();
    if (roomLacks || !remoteNewer) save();  // publish the merged truth; idempotent echo stops the loop
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

  // Version every change with a SERVER-SYNCED wall-clock timestamp (not a local
  // counter). Two devices kept their own counters, so they could disagree on which
  // write was "newer" and clobber each other — the score-sync bug. A shared clock
  // means the genuinely-latest change always wins and both phones converge.
  function save() { state.updated = Date.now() + serverOffset; persistLocal(); pushCloud(); emit(); }

  /* ---- monthly seasons ----
     Lazy rollover: whenever a result lands (or the Scores page opens) in a
     new month, the finished month is archived to `past` with its champion,
     and the current race resets. RTDB strips empty arrays, so `past` is
     re-defaulted on read. `ymNow` is injectable for the test harness. */
  function rollSeasons(ymNow) {
    ymNow = ymNow || curYM();
    if (!state.seasons || !state.seasons.cur || !state.seasons.cur.ym) state.seasons = { cur: { ym: ymNow, p1: 0, p2: 0, draws: 0 }, past: [] };
    if (!Array.isArray(state.seasons.past)) state.seasons.past = [];
    const cur = state.seasons.cur;
    if (cur.ym === ymNow) return false;
    if (cur.p1 + cur.p2 + cur.draws > 0) state.seasons.past.push({ ym: cur.ym, p1: cur.p1, p2: cur.p2, draws: cur.draws });
    state.seasons.past = state.seasons.past.slice(-36); // three years of trophies is plenty
    state.seasons.cur = { ym: ymNow, p1: 0, p2: 0, draws: 0 };
    return true;
  }
  // called by the Scores page so a fresh month shows 0–0 even before a game is played
  function seasonsTick() { if (rollSeasons()) save(); return state.seasons; }

  /* ---- mutations ---- */
  function recordResult(gameId, winner /* 'p1' | 'p2' | 'draw' */) {
    if (!state.perGame[gameId]) state.perGame[gameId] = { p1: 0, p2: 0, draws: 0, plays: 0 };
    const g = state.perGame[gameId];
    g.plays++;
    rollSeasons();
    state.seasons.cur[winner === 'draw' ? 'draws' : winner]++;
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
  function adjustScore(field, delta) { // field: 'p1' | 'p2' | 'draws' — manual correction (Smit only, gated in UI)
    if (!['p1', 'p2', 'draws'].includes(field)) return;
    state.totals[field] = Math.max(0, (state.totals[field] || 0) + delta);
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
  function dateToggle(kind, id) { // kind: 'done' | 'removed' | 'faved' — shared, synced
    if (!['done', 'removed', 'faved'].includes(kind)) return;
    if (!state.dateNight) state.dateNight = { done: [], removed: [], faved: [] };
    const arr = state.dateNight[kind] || (state.dateNight[kind] = []);
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1); else arr.push(id);
    save();
  }
  function setMeet(patch) { // { nextAt?, lastMetAt? } — ms timestamps or null; shared + synced
    if (!state.meet) state.meet = { nextAt: null, lastMetAt: null };
    Object.assign(state.meet, patch); save();
  }

  /* ---- shared calendar (Plans tab) ----
     entry = { id, kind:'busy'|'us', seat, title,
               allDay:true  → d1/d2: 'YYYY-MM-DD' (same calendar day for both),
               allDay:false → t1/t2: UTC ms (each phone renders its OWN local time),
               confirmed (us only), createdAt }
     RTDB strips empty arrays → plans re-defaulted on read like the others. */
  function plansArr() { if (!Array.isArray(state.plans)) state.plans = []; return state.plans; }
  function planEnd(e) { return e.allDay ? new Date(e.d2 + 'T23:59:59').getTime() : e.t2; }
  function prunePlans() { const cutoff = Date.now() - 60 * 864e5; state.plans = plansArr().filter(e => planEnd(e) > cutoff); }
  function planAdd(entry) {
    plansArr();
    entry.id = 'pl' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    entry.createdAt = Date.now();
    if (entry.kind === 'us') entry.confirmed = false;
    state.plans.push(entry); prunePlans(); save();
    return entry.id;
  }
  function planRemove(id) {
    state.plans = plansArr().filter(e => e.id !== id);
    if (!Array.isArray(state.plansDeleted)) state.plansDeleted = [];
    state.plansDeleted.push({ id, t: Date.now() });                  // tombstone: keeps the delete during merges
    state.plansDeleted = state.plansDeleted.slice(-80);
    save();
  }
  function planConfirm(id, seat) {
    const e = plansArr().find(x => x.id === id);
    if (e && e.kind === 'us' && e.seat !== seat) { e.confirmed = true; save(); }
  }

  /* ---- Our Story: milestone moments + period logs (same merge safety as plans) ----
     moment = {id, kind:'moment', emoji, title, date?'YYYY-MM-DD', recur?, place?, lat?, lon?, note?}
     period = {id, kind:'period', start:'YYYY-MM-DD'} */
  function storyArr() { if (!Array.isArray(state.story)) state.story = []; return state.story; }
  function storySave(item) {
    storyArr();
    if (item.id) {                                    // edit in place
      const i = state.story.findIndex(x => x.id === item.id);
      if (i >= 0) state.story[i] = Object.assign({}, state.story[i], item);
      else state.story.push(item);
    } else {
      item.id = 'st' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      item.createdAt = Date.now();
      state.story.push(item);
    }
    save();
    return item.id;
  }
  function storyRemove(id) {
    state.story = storyArr().filter(e => e.id !== id);
    if (!Array.isArray(state.storyDeleted)) state.storyDeleted = [];
    state.storyDeleted.push({ id, t: Date.now() });
    state.storyDeleted = state.storyDeleted.slice(-80);
    save();
  }
  function setPlayer(idx, patch) { Object.assign(state.players[idx], patch); save(); }
  function setSetting(key, val) { state.settings[key] = val; save(); }
  function resetScores() {
    state.totals = { p1: 0, p2: 0, draws: 0 };
    state.perGame = {}; state.streak = { who: null, n: 0 }; state.history = []; state.tourWins = [0, 0];
    state.seasons = { cur: { ym: curYM(), p1: 0, p2: 0, draws: 0 }, past: [] };
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
  // subtle haptics alongside the beeps (Android Chrome; iOS ignores vibrate) —
  // follows the same sound toggle so one switch controls all feedback
  function buzz(pattern) { try { if (state.settings.sound && navigator.vibrate) navigator.vibrate(pattern); } catch (e) {} }
  const Sound = {
    tap:   () => { beep(660, 0.05, 'square', 0.12); },
    place: () => { beep(330, 0.07, 'triangle', 0.16); buzz(12); },
    move:  () => { beep(520, 0.05, 'sine', 0.12); buzz(10); },
    good:  () => { beep(523, .08); setTimeout(() => beep(784, .12), 80); buzz([14, 40, 14]); },
    bad:   () => { beep(150, 0.18, 'sawtooth', 0.18); buzz(50); },
    win:   () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, .14, 'square', .2), i * 100)); buzz([18, 50, 18, 50, 70]); },
    draw:  () => { beep(400, .1); setTimeout(() => beep(300, .14), 120); buzz(30); },
    countdown: () => { beep(880, 0.08, 'square', 0.2); buzz(8); },
  };

  /* ---- device identity (which seat THIS device plays; local-only, not synced) ---- */
  const ID_KEY = 'sm_identity_v1';
  function getIdentity() { const v = localStorage.getItem(ID_KEY); return v === '0' || v === '1' ? +v : null; }
  function setIdentity(i) { localStorage.setItem(ID_KEY, String(i)); stampTz(i); emit(); }
  // record THIS device's timezone on its seat, so the partner's phone can
  // preview "what time is that for them" on calendar entries.
  // ⚠ MUST NOT call save(): it runs at boot BEFORE the cloud merge, and bumping
  // `updated` there made every phone think its stale local state was newest —
  // that was the v47 split-brain bug that broke two-way plan sync. The tz
  // travels via the merge in mergeRemote / the next genuine save instead.
  function stampTz(seat) {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (seat != null && tz && state.players[seat] && state.players[seat].tz !== tz) { state.players[seat].tz = tz; persistLocal(); emit(); }
    } catch (e) {}
  }

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
    serverNow: () => Date.now() + serverOffset,   // synced wall-clock for countdown timers
    // "come online & play" nudge — stored under matches/<room>/nudges/<seat> (already rule-permitted)
    sendNudge(targetSeat, fromSeat, fromName) { if (!cloud) return Promise.resolve(); return db.ref('matches/' + ROOM() + '/nudges/' + targetSeat).set({ from: fromSeat, name: fromName || '', t: Net.serverTime() }); },
    watchNudge(seat, cb) { if (!cloud) return () => {}; const r = db.ref('matches/' + ROOM() + '/nudges/' + seat); const fn = r.on('value', sn => cb(sn.val())); return () => r.off('value', fn); },
    clearNudge(seat) { if (cloud) return db.ref('matches/' + ROOM() + '/nudges/' + seat).remove(); return Promise.resolve(); },
    // in-game banter (emotes / taunts) — separate path so it never re-renders the live game
    sendReact(react) { if (cloud) return db.ref('matches/' + ROOM() + '/react').set(react); return Promise.resolve(); },
    watchReact(cb) { if (!cloud) return () => {}; const r = db.ref('matches/' + ROOM() + '/react'); const fn = r.on('value', sn => cb(sn.val())); return () => r.off('value', fn); },
  };

  return {
    initCloud, subscribe, get, player,
    recordResult, recordTournament, adjustScore, toggleFav, dateToggle, setMeet, setPlayer, setSetting, resetScores,
    seasonsTick, _rollSeasons: rollSeasons, curYM,
    planAdd, planRemove, planConfirm, stampTz, _mergeRemote: mergeRemote,
    storySave, storyRemove,
    Sound, isCloud: () => cloud,
    getIdentity, setIdentity, onCloud, Net,
  };
})();
