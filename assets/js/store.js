/* ============================================================
   STORE — state, persistence, cloud sync, sound
   ============================================================ */
const Store = (() => {
  const LS_KEY = 'sm_arcade_v1';

  // 'YYYY-MM' for the current (or given) moment — the season key. ONE calendar for both phones:
  // Irish time. Using each phone's own calendar let Meera's (India, 4.5 h ahead) start October
  // while Smit's was still in September — they flipped the race back and forth, zeroing every
  // result and flooding the room with writes (the 30-Sept-2026 "scores stuck at 0-0" bug).
  const SEASON_TZ = 'Europe/Dublin';
  function curYM(t) {
    const d = t ? new Date(t) : new Date();
    try {
      const pt = new Intl.DateTimeFormat('en-GB', { timeZone: SEASON_TZ, year: 'numeric', month: '2-digit' }).formatToParts(d);
      const y = pt.find(x => x.type === 'year'), m = pt.find(x => x.type === 'month');
      if (y && m && /^\d{4}$/.test(y.value) && /^\d{2}$/.test(m.value)) return y.value + '-' + m.value;
    } catch (e) {}
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }

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
    story: [],        // Our Story: {kind:'moment', emoji,title,date?,recur?,place?,lat?,lon?,note?}
    storyDeleted: [], // tombstones for story (same merge protection as plans)
    meet: { nextAt: null, lastMetAt: null }, // shared reunion countdown: ms timestamps (synced)
    settings: { sound: true, theme: 'dark' },
    updated: 0,
  });

  let state = load();
  let db = null, cloud = false, ref = null, serverOffset = 0;
  // HYDRATION GATE — a device must READ the room before it may WRITE to it. A phone that had
  // been closed for weeks used to boot, re-stamp its July scores as 'just saved' (the monthly
  // race rollover called save()), win the newest-save-wins merge and overwrite everyone.
  // Local-only mode has nothing to wait for, so it starts hydrated.
  let synced = !(window.CLOUD && window.CLOUD.ENABLED);
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
    if (!window.CLOUD || !window.CLOUD.ENABLED) { synced = true; setPill('local'); dailyBackup(); return; }
    try {
      if (typeof firebase === 'undefined') {
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js');
        await loadScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js');
      }
    } catch (e) { console.warn('Firebase scripts failed to load — local mode.', e); synced = true; setPill('local'); return; }
    if (typeof firebase === 'undefined' || !firebase.initializeApp) { synced = true; setPill('local'); return; }
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
      cloud = false; synced = true; setPill('local');
    }
  }
  function connectRoom() {
    ref = db.ref('rooms/' + (window.CLOUD.ROOM || 'default'));
    cloud = true;
    setPill('cloud');
    // keep a synced clock so both phones count timers down to the same instant
    try { db.ref('.info/serverTimeOffset').on('value', s => { serverOffset = s.val() || 0; }); } catch (e) {}
    // socket state, so a finish whose socket dropped retries only once it is back (see finishMatch)
    try { db.ref('.info/connected').on('value', s => { netUp = s.val() !== false; if (netUp) upWaiters.splice(0).forEach(f => f()); }); } catch (e) {}
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
      if (!remote) { synced = true; pushCloud(); return; }   // empty room: this device seeds it
      mergeRemote(remote);
    }, err => { console.warn('Cloud read denied — check your Security Rules. Falling back to local.', err); cloud = false; synced = true; setPill('local'); });
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
  // ---- the scoreboard merges by PROGRESS, not by who saved last ----
  // Everything else is newest-save-wins, which is fine for a theme or a name. It is NOT fine
  // for scores: any unrelated save from a device holding an older copy (a theme toggle, a
  // season rollover) used to overwrite the real totals. The score block now travels as one
  // unit, ranked by (reset epoch, results played, last score change):
  //   - a Reset bumps the epoch, so it beats any pre-reset copy however many games it had;
  //   - otherwise the copy with MORE recorded results wins — results only accumulate;
  //   - a manual adjustment (same results, later change) wins the tie.
  // A stale device can therefore never roll the scoreboard back, and a device that still
  // holds the real scores restores them just by being opened.
  const SCORE_FIELDS = ['totals', 'perGame', 'streak', 'seasons', 'history', 'tourWins', 'scoreV'];
  function scoreKey(s) {
    const v = (s && s.scoreV) || {}, pg = (s && s.perGame) || {};
    let n = 0; for (const k in pg) n += (pg[k] && pg[k].plays) || 0;
    return [v.e || 0, n, v.t || 0];
  }
  function cmpKey(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1; return 0; }
  function scoreBlock(src) {
    const def = blankState(), out = {};
    SCORE_FIELDS.forEach(k => { out[k] = src && src[k] !== undefined ? JSON.parse(JSON.stringify(src[k])) : def[k]; });
    return out;
  }
  function stampScore(reset) {
    const t = Date.now() + serverOffset, v = state.scoreV || {};
    state.scoreV = { e: reset ? t : (v.e || 0), t };
  }
  // ---- score backups: the safety net ----
  // Each phone keeps its OWN rolling copies of the score block in a separate localStorage key
  // (never synced — a bad room write cannot reach them). Firebase keeps no history, so these
  // are the only way back if the scoreboard is ever lost again. Taken:
  //   'daily'   — once a day, after the phone has synced;
  //   'drop'    — BEFORE a sync lowers any total / tournament win / results count;
  //   'adjust' / 'reset' / 'restore' — before those deliberate edits.
  // Routine copies (daily, adjust) and important ones are capped separately so a month of
  // daily copies can never push the one taken before a glitch out of the list.
  const BAK_KEY = 'sm_arcade_scorebak';
  const BAK_ROUTINE = ['daily', 'adjust'], BAK_CAP_ROUTINE = 14, BAK_CAP_KEY = 10;
  function bakList() {
    try { const a = JSON.parse(localStorage.getItem(BAK_KEY) || '[]'); return Array.isArray(a) ? a.filter(b => b && b.block) : []; }
    catch (e) { return []; }
  }
  function bakSummary(block) {
    const t = block.totals || {}, tw = Array.isArray(block.tourWins) ? block.tourWins : [0, 0];
    return { p1: t.p1 || 0, p2: t.p2 || 0, draws: t.draws || 0, plays: scoreKey(block)[1], tw: [tw[0] || 0, tw[1] || 0] };
  }
  function backup(kind, src) {
    const block = scoreBlock(src || state), list = bakList(), sum = bakSummary(block);
    const newest = list[list.length - 1];
    const same = newest && JSON.stringify(newest.block) === JSON.stringify(block);
    if (same && kind === 'daily') return;      // deliberate edits always get their own labelled copy
    // one 'adjust' copy per editing session — the state from BEFORE the first tap
    if (kind === 'adjust' && newest && newest.kind === 'adjust' && Date.now() - newest.t < 10 * 60e3) return;
    list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t: Date.now(), kind, sum, block });
    const routine = list.filter(b => BAK_ROUTINE.includes(b.kind)).slice(-BAK_CAP_ROUTINE);
    const key = list.filter(b => !BAK_ROUTINE.includes(b.kind)).slice(-BAK_CAP_KEY);
    const out = routine.concat(key).sort((a, b) => a.t - b.t);
    try { localStorage.setItem(BAK_KEY, JSON.stringify(out)); }
    catch (e) { try { localStorage.setItem(BAK_KEY, JSON.stringify(out.slice(-8))); } catch (e2) {} } // storage full: keep the newest few
  }
  function dailyBackup() {
    if (!synced) return;                       // never checkpoint a copy the room hasn't vetted yet
    const newest = bakList().filter(b => b.kind === 'daily').pop();
    if (!newest || new Date(newest.t).toDateString() !== new Date().toDateString()) backup('daily');
  }
  // did this change make the scoreboard go DOWN anywhere? (results only ever add up)
  function scoresDropped(before, after) {
    const a = bakSummary(before), b = bakSummary(after);
    return b.p1 < a.p1 || b.p2 < a.p2 || b.draws < a.draws || b.plays < a.plays || b.tw[0] < a.tw[0] || b.tw[1] < a.tw[1];
  }
  function restoreBackup(id) {
    const b = bakList().find(x => x.id === id);
    if (!b) return false;
    backup('restore');                         // the restore itself can be undone
    Object.assign(state, JSON.parse(JSON.stringify(b.block)));
    if (!Array.isArray(state.history)) state.history = [];
    if (!Array.isArray(state.tourWins)) state.tourWins = [0, 0];
    rollSeasons();
    stampScore(true);                          // new epoch: beats every copy on every phone
    save();
    return true;
  }

  function mergeRemote(remote) {
    const first = !synced; synced = true;
    const before = scoreBlock(state);
    // First read after boot: the ROOM is the truth for the shared bulk, whatever timestamp
    // this device's copy carries — nothing it did before hydrating may beat the room.
    const remoteNewer = first || (remote.updated || 0) >= (state.updated || 0);
    const scoreCmp = cmpKey(scoreKey(state), scoreKey(remote));
    const localScores = scoreCmp > 0 ? scoreBlock(state) : null;
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
    if (scoreCmp > 0) { Object.assign(state, localScores); roomLacks = true; }        // we hold more progress — keep & publish it
    else if (scoreCmp < 0 && !remoteNewer) Object.assign(state, scoreBlock(remote));   // room holds more — take it even if our bulk won
    if (tz0 && state.players[0]) state.players[0].tz = tz0;
    if (tz1 && state.players[1]) state.players[1].tz = tz1;
    if (scoresDropped(before, state)) backup('drop', before);   // keep what we had before the sync lowered it
    dailyBackup();
    persistLocal();
    emit();
    if (roomLacks || !remoteNewer) save();  // publish the merged truth; idempotent echo stops the loop
  }
  function pushCloud() { if (cloud && ref && synced) ref.set(state).catch(() => {}); }   // never before the first read

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
  // Repair for the timezone flip-flop: each flip archived the race so far as a junk `past` entry
  // (a duplicate month, or a month that has not finished yet). Every result landed in exactly one
  // of those entries or in `cur`, so folding them back together is exact: months that are over
  // become ONE trophy entry each, anything from this month on goes back into the current race.
  // Idempotent — a clean `seasons` is left untouched. Keeps repairing while a phone on an old
  // version is still flipping, without ever losing or double-counting a result.
  function repairSeasons(ymNow) {
    const se = state.seasons, cur = se.cur, seen = {};
    se.past.forEach(e => { if (e && e.ym) seen[e.ym] = (seen[e.ym] || 0) + 1; });
    const bad = e => e && e.ym && (e.ym >= ymNow || e.ym >= cur.ym || seen[e.ym] > 1);
    if (!se.past.some(bad) && cur.ym <= ymNow) return false;
    const n = e => ({ p1: +e.p1 || 0, p2: +e.p2 || 0, draws: +e.draws || 0 });
    const keep = [], fold = {}, now = { ym: ymNow, p1: 0, p2: 0, draws: 0 };
    const add = (to, e) => { const v = n(e); to.p1 += v.p1; to.p2 += v.p2; to.draws += v.draws; };
    se.past.forEach(e => {
      if (!bad(e)) { keep.push(e); return; }
      if (e.ym >= ymNow) { add(now, e); return; }
      if (!fold[e.ym]) fold[e.ym] = { ym: e.ym, p1: 0, p2: 0, draws: 0 };
      add(fold[e.ym], e);
    });
    if (cur.ym >= ymNow) add(now, cur);
    else { if (!fold[cur.ym]) fold[cur.ym] = { ym: cur.ym, p1: 0, p2: 0, draws: 0 }; add(fold[cur.ym], cur); }
    Object.keys(fold).forEach(k => { const f = fold[k]; if (f.p1 + f.p2 + f.draws > 0) keep.push(f); });
    keep.sort((a, b) => (a.ym < b.ym ? -1 : a.ym > b.ym ? 1 : 0));
    se.past = keep.slice(-36);
    se.cur = now;
    return true;
  }
  function rollSeasons(ymNow) {
    ymNow = ymNow || curYM();
    if (!state.seasons || !state.seasons.cur || !state.seasons.cur.ym) state.seasons = { cur: { ym: ymNow, p1: 0, p2: 0, draws: 0 }, past: [] };
    if (!Array.isArray(state.seasons.past)) state.seasons.past = [];
    if (repairSeasons(ymNow)) return true;
    const cur = state.seasons.cur;
    if (cur.ym >= ymNow) return false;   // never roll BACKWARDS (and never ahead of Irish time)
    if (cur.p1 + cur.p2 + cur.draws > 0) state.seasons.past.push({ ym: cur.ym, p1: cur.p1, p2: cur.p2, draws: cur.draws });
    state.seasons.past = state.seasons.past.slice(-36); // three years of trophies is plenty
    state.seasons.cur = { ym: ymNow, p1: 0, p2: 0, draws: 0 };
    return true;
  }
  // called by the Scores page so a fresh month shows 0–0 even before a game is played
  // ⚠ runs on every Play/Scores render — including at BOOT, before the cloud merge. Saving here
  // re-stamped a stale device's old scores as newest (the Sept-2026 'scores jumped back' bug).
  function seasonsTick() { if (rollSeasons() && synced) save(); return state.seasons; }

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
    stampScore(false);
    save();
    dailyBackup();
  }
  function adjustScore(field, delta) { // field: 'p1' | 'p2' | 'draws' — manual correction (Smit only, gated in UI)
    if (!['p1', 'p2', 'draws'].includes(field)) return;
    backup('adjust');
    state.totals[field] = Math.max(0, (state.totals[field] || 0) + delta);
    stampScore(false);
    save();
  }
  function recordTournament(winnerSeat) {
    if (!Array.isArray(state.tourWins)) state.tourWins = [0, 0];
    if (winnerSeat === 0 || winnerSeat === 1) { state.tourWins[winnerSeat]++; stampScore(false); save(); }
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

  /* ---- Our Story: milestone moments (same merge safety as plans) ----
     moment = {id, kind:'moment', emoji, title, date?'YYYY-MM-DD', recur?, place?, lat?, lon?, note?}
     NOTE: cycle/period tracking was removed by request (v65). Old {kind:'period'}
     rows may still exist in synced stores; nothing reads or renders them, and the
     Big Dates list filters on kind==='moment', so they stay invisible. */
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
    backup('reset');
    state.totals = { p1: 0, p2: 0, draws: 0 };
    state.perGame = {}; state.streak = { who: null, n: 0 }; state.history = []; state.tourWins = [0, 0];
    state.seasons = { cur: { ym: curYM(), p1: 0, p2: 0, draws: 0 }, past: [] };
    stampScore(true);             // new epoch: beats every pre-reset copy
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
  const mref = () => db.ref('matches/' + ROOM() + '/active');
  const finRef = () => db.ref('matches/' + ROOM() + '/lastFin');   // tokens of the last cleared/replaced match
  // ---- finishing a match EXACTLY once (v85) ----
  // Each finish writes a random token: `fin` (this round) and `fins` (the last 8 finishes, newest first — 'Play
  // again' and later finishes keep the list). A phone records only when the SERVER's match lists its token,
  // so a socket drop can't lose a result (the server may have applied it although the SDK said 'disconnect')
  // and the partner can never also record it.
  //   - applyLocally=false (no local event → no listener 'set' abort, no cold-cache null → exitMatch); the
  //     update never aborts on the cache — it writes the value back, so every verdict is the server's;
  //   - a drop costs no try: it waits for `.info/connected`, then asks again; out of tries it still checks;
  //   - while a finish is unresolved, this phone's other match writes wait for it (afterFinish), watchMatch
  //     shows the finish on top of stale snapshots, and clearing/replacing a match stores its tokens in
  //     `lastFin` first, so a finish that landed unseen can be proven after the partner left for the lobby.
  let finPending = 0, finQ = Promise.resolve(), lastSeen = null, lastKept = null, netUp = true;
  const upWaiters = [], pendingFin = [];        // pendingFin: {ok, patch, fin} still waiting for a verdict
  let matchCb = null, lastShown;
  const afterFinish = fn => (finPending ? finQ.then(fn) : fn());
  const whenUp = () => (netUp ? Promise.resolve() : new Promise(r => upWaiters.push(r)));
  const finList = v => (v && typeof v.fins === 'string' ? v.fins : (v && v.fin) || '').split(' ').filter(Boolean);
  const hasFin = (v, fin) => !!v && (v.fin === fin || finList(v).includes(fin));
  // is match `m` still the round pending finish `f` set out to end? (f.base = the match it first saw)
  const forRound = (f, m) => !f.base || (m.starter === f.base.starter && (m.fin || null) === (f.base.fin || null));
  function keepFin() {
    const f = finList(lastSeen).join(' ');
    if (f && f !== lastKept) { lastKept = f; finRef().set(f).catch(() => {}); }
  }
  // what this phone shows: the server's match, with our unresolved finish on top while it still applies
  function showMatch() {
    let v = lastSeen;
    pendingFin.forEach(f => { if (v && !hasFin(v, f.fin) && v.forfeitBy == null && forRound(f, v) && f.ok(v)) v = Object.assign({}, v, f.patch); });
    const k = JSON.stringify(v);
    if (matchCb && k !== lastShown) { lastShown = k; matchCb(v); }
  }
  // the server's current value at `r`: a compare-and-set that writes it straight back (queued while offline)
  function confirmed(r, tries) {
    return r.transaction(cur => cur, undefined, false)
      .then(res => (res && res.committed && res.snapshot ? res.snapshot.val() : null),
        e => (e && e.message === 'disconnect' ? whenUp().then(() => confirmed(r, tries))
          : tries > 0 ? confirmed(r, tries - 1) : null));
  }
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
      const r = mref();
      matchCb = cb; lastShown = undefined;
      const h = r.on('value', s => { lastSeen = s.val() || null; lastShown = undefined; showMatch(); },
        err => console.warn('match read denied — republish Security Rules to allow "matches".', err));
      return () => { r.off('value', h); if (matchCb === cb) matchCb = null; };
    },
    setMatch(obj) { if (cloud) return afterFinish(() => { keepFin(); return mref().set(obj); }); return Promise.resolve(); },
    updateMatch(patch) { if (cloud) return afterFinish(() => mref().update(patch)); return Promise.resolve(); },
    // a finish of ours for match `m`'s round is still waiting for the server's verdict (moves must wait)
    finishing: m => pendingFin.some(f => !m || forRound(f, m)),
    // FINISH a match exactly once. Both phones can try to end the same match (a timeout fires on the
    // player on the clock AND, 2 s later, on the partner) — a plain update let both record the result.
    // Applies only while `ok(current)` holds and nobody forfeited; resolves true only for the phone whose
    // token the server's match lists, and ONLY that phone records the score (see the v85 notes above).
    finishMatch(ok, patch) {
      if (!cloud) return Promise.resolve(true);
      const r = mref(), fin = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const pf = { ok, patch, fin };
      let base = null, landed = false;           // base = the round we are finishing; landed = a put of ours may have applied unseen
      // never finish a LATER round (someone else finished this one, then 'Play again' flipped the starter)
      const sameRound = cur => (cur.fin || null) === (base.fin || null) && cur.starter === base.starter;
      const decide = v => (hasFin(v, fin) ? true : !landed ? false
        : confirmed(finRef(), 2).then(f => hasFin({ fins: f || '' }, fin)));   // cleared/replaced since: its tombstone decides
      const attempt = left => r.transaction(cur => {
        if (cur === null) return null;            // cold cache, or the match is gone: let the server confirm
        if (hasFin(cur, fin)) return cur;         // an earlier try of ours already landed: confirm it
        if (!base) base = pf.base = cur;
        if (!ok(cur) || cur.forfeitBy != null || !sameRound(cur)) return cur;    // not ours to finish: just confirm
        return Object.assign({}, cur, patch, { fin, fins: [fin].concat(finList(cur)).slice(0, 8).join(' ') });
      }, undefined, false).then(res => decide(res && res.committed && res.snapshot ? res.snapshot.val() : null), err => {
        const why = err && err.message;
        if (why !== 'set' && why !== 'maxretry') landed = true;               // 'disconnect': it may have applied
        if (why === 'disconnect') return whenUp().then(() => attempt(left));  // a drop costs no try
        return left > 0 ? attempt(left - 1) : confirmed(r, 2).then(decide);   // out of tries: still ask the server
      });
      pendingFin.push(pf);
      const p = (finPending ? finQ.then(() => attempt(4)) : attempt(4)).catch(() => false)
        .then(won => { pendingFin.splice(pendingFin.indexOf(pf), 1); lastShown = undefined; showMatch(); return won; });   // repaint even if the server value didn't change
      finPending++;
      finQ = finQ.then(() => p).then(() => { finPending--; });
      return p;
    },
    clearMatch() { if (cloud) return afterFinish(() => { keepFin(); return mref().remove(); }); return Promise.resolve(); },
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
    seasonsTick, _rollSeasons: rollSeasons, _repairSeasons: repairSeasons, curYM,
    planAdd, planRemove, planConfirm, stampTz, _mergeRemote: mergeRemote,
    storySave, storyRemove,
    Sound, isCloud: () => cloud, isSynced: () => synced, _scoreKey: s => scoreKey(s || state),
    backups: () => bakList().map(({ id, t, kind, sum }) => ({ id, t, kind, sum })).reverse(), restoreBackup,
    getIdentity, setIdentity, onCloud, Net,
  };
})();
