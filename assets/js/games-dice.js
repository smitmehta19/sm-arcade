/* ============================================================
   DICE GAMES — Yahtzee, Liar's Dice (online, turn-based)

   Cinematic 3D table (v71): both games draw real 3D dice on a felt
   bar table through the shared Dice3D engine (dice3d.js — must load
   BEFORE this file). Like Fleabag / Pocket Tanks, each game's scene
   (canvas + loop + animation progress) lives at MODULE level and is
   re-attached on every repaint, so a sync can never cut a roll short.

   COMMIT BEFORE ANIMATE: a Yahtzee roll commits the dice + a fresh
   `rollId` first; every phone then plays the same seeded tumble when
   it sees a rollId it hasn't played (the dice always land on the
   committed values). A Liar's Dice call commits the reveal first; both
   phones animate it from `st.last`. Old saves without the new fields
   still load (no rollId → dice are simply laid out, no tumble).
   ============================================================ */
(function () {
  const css = `
  .dz-die{ position:relative; display:inline-grid; place-items:center; width:52px; height:52px; border-radius:13px; line-height:1;
    background:linear-gradient(150deg,#fdfdff,#d7dcec); box-shadow:0 4px 0 #b4b9cc, 0 7px 12px rgba(0,0,0,.42), inset 0 2px 3px rgba(255,255,255,.95), inset 0 -3px 4px rgba(120,125,150,.4); }
  .dz-die svg{ width:78%; height:78%; display:block; }
  .dz-die .pip{ fill:#21232e; }
  .dz-die.sm{ width:40px; height:40px; border-radius:10px; box-shadow:0 3px 0 #b4b9cc, 0 5px 9px rgba(0,0,0,.4), inset 0 2px 2px rgba(255,255,255,.95); }
  .dz-die.held{ background:linear-gradient(150deg,#eafff3,#bdf5d6); box-shadow:0 4px 0 #5fae84, 0 0 0 2px var(--lime), 0 0 16px var(--lime), inset 0 2px 3px rgba(255,255,255,.95); transform:translateY(-3px); }
  .dz-die.held .pip{ fill:#10402a; }
  .dz-die.hid{ background:linear-gradient(150deg,#3b3654,#26203a); box-shadow:0 4px 0 #1c1730, 0 6px 11px rgba(0,0,0,.5), inset 0 2px 3px rgba(255,255,255,.12); }
  .dz-die.hid .q{ font-family:var(--font-num); font-weight:900; font-size:24px; color:var(--ink-faint); }
  .dz-die.win .pip{ fill:#7a2a12; }
  .dz-die.win{ background:linear-gradient(150deg,#fff0d6,#ffce7a); box-shadow:0 4px 0 #c79433, 0 0 14px var(--gold), inset 0 2px 3px rgba(255,255,255,.9); }
  .dz-dice{ display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin:12px 0; }
  .dz-die.live{ cursor:pointer; transition:transform .12s; } .dz-die.live:active{ transform:scale(.88); }
  .dz-rolls{ text-align:center; font-size:12.5px; color:var(--ink-dim); margin:0; line-height:1.5; }
  .dz-rolls b{ color:var(--ink); }
  .dz-rollbtn{ position:relative; overflow:hidden; }
  .dz-rollbtn .n{ opacity:.75; font-weight:600; }
  .dz-cup{ font-size:17px; margin-right:7px; display:inline-block; animation:dzShake 1.1s ease-in-out infinite; }
  @keyframes dzShake{ 0%,100%{ transform:rotate(-9deg); } 50%{ transform:rotate(9deg); } }

  /* the 3D table */
  .dz-wrap{ display:flex; flex-direction:column; gap:10px; }
  .dz-cv{ width:100%; display:block; border-radius:var(--r-3); border:1px solid rgba(255,214,140,.14);
    box-shadow:0 18px 40px -18px rgba(0,0,0,.8), inset 0 0 0 1px rgba(255,255,255,.03); background:#05040a;
    touch-action:manipulation; -webkit-tap-highlight-color:transparent; user-select:none; -webkit-user-select:none; }
  .dz-cv.live{ cursor:pointer; }
  .dz-holds{ display:flex; gap:6px; justify-content:center; }
  .dz-hold{ display:flex; flex-direction:column; align-items:center; gap:3px; padding:5px 6px 4px; border-radius:var(--r-1);
    background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink-faint); font-size:9.5px; font-weight:700; letter-spacing:.6px;
    transition:transform var(--dur-1) var(--spring), border-color var(--dur-2), color var(--dur-2); }
  .dz-hold:active{ transform:scale(.92); }
  .dz-hold[aria-pressed="true"]{ border-color:var(--lime); color:var(--lime); box-shadow:0 0 14px -5px var(--lime); }
  .dz-hold .dz-die.xs{ width:26px; height:26px; }
  .sr-only{ position:absolute!important; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }

  .yz-panel{ padding:10px 10px 6px; border-radius:var(--r-3); background:var(--panel); border:1px solid var(--glass-brd); }
  .yz-card{ width:100%; border-collapse:collapse; font-size:13px; }
  .yz-card td, .yz-card th{ padding:5px 6px; border-bottom:1px solid var(--line); text-align:center; }
  .yz-card th{ font-family:var(--font-display); font-size:11px; letter-spacing:.5px; color:var(--ink-dim); }
  .yz-card th.p0{ color:var(--p1); } .yz-card th.p1{ color:var(--p2); }
  .yz-card td.lbl{ text-align:left; color:var(--ink-dim); }
  .yz-card .me{ text-decoration:underline; text-underline-offset:3px; }
  .yz-cell{ font-family:var(--font-num); font-weight:900; }
  .yz-cell.live{ cursor:pointer; color:var(--gold); background:rgba(255,214,107,.07); box-shadow:inset 0 0 0 1px rgba(255,214,107,.45); border-radius:7px; }
  .yz-cell.live:active{ transform:scale(.95); }
  .yz-cell.wait{ color:var(--ink-faint); }
  .yz-cell.zero{ color:var(--ink-faint); }
  .yz-tot td{ border-top:2px solid var(--glass-brd); border-bottom:0; font-family:var(--font-num); font-weight:900; font-size:15px; }
  .yz-sub{ font-size:11px; color:var(--ink-faint); }

  .ld-bid{ display:flex; align-items:center; justify-content:center; gap:10px; font-family:var(--font-num); font-weight:900; font-size:22px; margin:6px 0; }
  .ld-pill{ padding:8px 14px; border-radius:12px; background:var(--panel-2); border:1px solid var(--glass-brd); }
  .ld-step{ display:flex; align-items:center; gap:10px; justify-content:center; margin:6px 0; }
  .ld-step button{ width:42px; height:42px; border-radius:11px; background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); font-size:22px; }
  .ld-step .v{ min-width:46px; text-align:center; font-family:var(--font-num); font-weight:900; font-size:26px; }
  .ld-faces{ display:flex; gap:6px; justify-content:center; margin:8px 0; }
  .ld-faces button{ width:46px; height:46px; padding:0; border-radius:12px; background:var(--panel-2); border:1px solid var(--glass-brd); display:grid; place-items:center; }
  .ld-faces button .dz-die.sm{ width:34px; height:34px; border-radius:9px; }
  .ld-faces button.on{ border-color:var(--violet); box-shadow:var(--glow-v); }
  .ld-pill .dz-die{ vertical-align:middle; }
  .dz-die.xs{ width:24px; height:24px; border-radius:6px; box-shadow:0 2px 0 #b4b9cc, inset 0 1px 2px rgba(255,255,255,.9); vertical-align:middle; }
  .ld-label{ font-size:12px; color:var(--ink-dim); text-align:center; margin:2px 0; }
  .ld-sum{ font-weight:700; margin:2px 0; display:flex; align-items:center; justify-content:center; gap:5px; flex-wrap:wrap; text-align:center; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const rint = n => Math.floor(Math.random() * n);
  const roll = n => Array.from({ length: n }, () => 1 + rint(6));
  const waiting = (ctx, who) => ctx.msg(`Waiting for ${who || ctx.seat(1 - ctx.me).name}…`, 'var(--ink-faint)');
  const D3 = () => window.Dice3D;          // loaded by dice3d.js; the games degrade to flat dice without it
  const newId = () => Date.now().toString(36) + rint(1e9).toString(36);

  // ---- per-viewer memory of which roll / reveal this phone has already watched (a reload must not replay) ----
  const SEEN_KEY = 'sm_dice_seen_v1';
  function seenGet(k) { try { return (JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {})[k] || null; } catch (e) { return null; } }
  function seenSet(k, v) { try { const o = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; o[k] = v; localStorage.setItem(SEEN_KEY, JSON.stringify(o)); } catch (e) {} }

  // ---- proper SVG pip dice (used for the HTML controls / fallbacks) ----
  const PIP_POS = { // pip coordinates per face, in a 100×100 viewBox
    1: [[50, 50]],
    2: [[28, 28], [72, 72]],
    3: [[28, 28], [50, 50], [72, 72]],
    4: [[28, 28], [72, 28], [28, 72], [72, 72]],
    5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
    6: [[28, 28], [72, 28], [28, 50], [72, 50], [28, 72], [72, 72]],
  };
  const dieSvg = v => `<svg viewBox="0 0 100 100" aria-hidden="true">${(PIP_POS[v] || []).map(([x, y]) => `<circle class="pip" cx="${x}" cy="${y}" r="9"/>`).join('')}</svg>`;
  // build a die element. opts: {sm, xs, held, live, hid, win}
  function dieEl(h, v, opts) {
    opts = opts || {};
    const cls = 'dz-die' + (opts.sm ? ' sm' : '') + (opts.xs ? ' xs' : '') + (opts.held ? ' held' : '') + (opts.live ? ' live' : '') +
      (opts.hid ? ' hid' : '') + (opts.win ? ' win' : '');
    const el = h('div', { class: cls });
    if (opts.hid) el.append(h('span', { class: 'q' }, '?'));
    else el.innerHTML = dieSvg(v);
    return el;
  }
  // canvas helpers
  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function face2d(g, x, y, s, v, body, pip) {       // a flat die face, for plaques
    rr(g, x - s / 2, y - s / 2, s, s, s * 0.2); g.fillStyle = body; g.fill();
    g.fillStyle = pip; (PIP_POS[v] || []).forEach(([px, py]) => { g.beginPath(); g.arc(x + (px - 50) / 100 * s, y + (py - 50) / 100 * s, s * 0.085, 0, 7); g.fill(); });
  }
  const seatRGB = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ''); const n = m ? parseInt(m[1], 16) : 0xffffff; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

  /* ===================== YAHTZEE ===================== */
  const sum = d => d.reduce((a, b) => a + b, 0);
  const freq = d => { const f = [0, 0, 0, 0, 0, 0, 0]; d.forEach(v => f[v]++); return f; };
  const nKind = (d, n) => freq(d).some(c => c >= n);
  const fullHouse = d => { const f = freq(d); return f.some(c => c === 3) && f.some(c => c === 2); };
  const straight = (d, len) => { const s = [...new Set(d)].sort(); let run = 1, best = 1; for (let i = 1; i < s.length; i++) { if (s[i] === s[i - 1] + 1) { run++; best = Math.max(best, run); } else run = 1; } return best >= len; };
  const Y_CATS = [
    { id: 'ones', label: 'Ones', up: true, fn: d => 1 * freq(d)[1] },
    { id: 'twos', label: 'Twos', up: true, fn: d => 2 * freq(d)[2] },
    { id: 'threes', label: 'Threes', up: true, fn: d => 3 * freq(d)[3] },
    { id: 'fours', label: 'Fours', up: true, fn: d => 4 * freq(d)[4] },
    { id: 'fives', label: 'Fives', up: true, fn: d => 5 * freq(d)[5] },
    { id: 'sixes', label: 'Sixes', up: true, fn: d => 6 * freq(d)[6] },
    { id: 'three', label: '3 of a kind', fn: d => nKind(d, 3) ? sum(d) : 0 },
    { id: 'four', label: '4 of a kind', fn: d => nKind(d, 4) ? sum(d) : 0 },
    { id: 'full', label: 'Full house', fn: d => fullHouse(d) ? 25 : 0 },
    { id: 'small', label: 'Sm. straight', fn: d => straight(d, 4) ? 30 : 0 },
    { id: 'large', label: 'Lg. straight', fn: d => straight(d, 5) ? 40 : 0 },
    { id: 'yahtzee', label: 'YAHTZEE', fn: d => nKind(d, 5) ? 50 : 0 },
    { id: 'chance', label: 'Chance', fn: d => sum(d) },
  ];
  const yUpper = card => Y_CATS.filter(c => c.up).reduce((a, c) => a + (card[c.id] || 0), 0);
  // ybonus = +100 per extra Yahtzee (only while the Yahtzee box holds 50); not a box, so yDone ignores it
  const yTotal = card => { const up = yUpper(card); const low = Y_CATS.filter(c => !c.up).reduce((a, c) => a + (card[c.id] || 0), 0); return up + (up >= 63 ? 35 : 0) + low + (card.ybonus || 0); };
  // an EXTRA Yahtzee (box already used, 50 or 0) plays as a Joker — official forced-Joker rule:
  // 1) the matching upper box if open, else 2) any open lower box (FH/SS/LS at full value), else 3) scratch an upper box
  const isJoker = (card, d) => d.length === 5 && nKind(d, 5) && ('yahtzee' in card);
  const JOKER_FIX = { full: 25, small: 30, large: 40 };
  function yAllowed(card, d) {
    const open = Y_CATS.filter(c => !(c.id in card)).map(c => c.id);
    if (!isJoker(card, d)) return open;
    const up = Y_CATS[d[0] - 1].id; if (open.includes(up)) return [up];
    const low = open.filter(id => !Y_CATS.find(c => c.id === id).up);
    return low.length ? low : open;                // only upper boxes left → they score 0 (faces don't match)
  }
  const yCatScore = (card, d, id) => (isJoker(card, d) && JOKER_FIX[id]) ? JOKER_FIX[id] : Y_CATS.find(c => c.id === id).fn(d);
  const yDone = card => Y_CATS.every(c => c.id in card);

  /* ---------- Yahtzee 3D scene (module level: survives every repaint) ---------- */
  const YZ = {
    table: { hx: 4.5, hz: 2.95, rc: 0.55, rail: 0.9, railH: 0.55, felt: [0.03, 0.235, 0.165],
      tray: { x0: -4.1, x1: 4.1, z0: 1.66, z1: 2.84, label: 'HELD' }, logo: ['S × M', 'DICE CLUB'], logoZ: -0.6 },
    bounds: { x0: -4.5, x1: 4.5, z0: -2.95, z1: 1.56 },
    entry: { x: 1.1, z: 3.95, y: 2.3, spread: 1.2 },
    slotX: i => (i - 2) * 1.64, slotZ: 2.27, size: 1.06,
  };
  const LIME = [0.47, 0.96, 0.71], GOLD = [1, 0.8, 0.32];
  const YS = { sc: null, ctx: null, key: '', anim: null, held: [false, false, false, false, false], heldKey: '', inSlot: [], tablePose: [], clack: 0, clackN: 0, refresh: null };

  function yScene() {
    if (YS.sc) return YS.sc;
    const sc = D3().create({ vw: 1000, vh: 640, tag: 'yz', className: 'dz-cv', table: YZ.table, camera: { eye: [0, 11.4, 8.4], target: [0, 0, 0.15], fillW: 1.05 } });
    YS.sc = sc;
    const cv = sc.canvas();
    cv.addEventListener('pointerdown', e => {
      if (!yCanHold()) return;
      const id = sc.hitTest(e.clientX, e.clientY, d => /^y\d$/.test(d.id));
      if (id == null) return;
      e.preventDefault();
      yToggleHold(+id.slice(1));
    });
    sc.onHit = s => {                                   // clack clack — throttled so it doesn't turn into a buzz
      const ctx = YS.ctx, now = performance.now();
      if (!ctx || s < 0.22 || now - YS.clack < 75 || YS.clackN > 6) return;
      YS.clack = now; YS.clackN++;
      try { (s > 0.55 ? ctx.sound.place : ctx.sound.tap)(); } catch (e) {}
    };
    sc.onTable = (g, sc2) => {
      const st = YS.ctx && YS.ctx.state;
      if (!st || (st.dice && st.dice.length) || sc2.dice.length) return;
      const ctx = YS.ctx, who = ctx.players[st.turn] || ctx.players[0];
      sc2.plane(g, 0, 0.55, 0.01);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '800 54px Orbitron, "Chakra Petch", sans-serif';
      g.shadowColor = who.color; g.shadowBlur = 18; g.fillStyle = who.color; g.globalAlpha = 0.85;
      g.fillText(ctx.status === 'finished' ? 'GOOD GAME' : (st.turn === ctx.me ? 'YOUR ROLL' : `${who.name.toUpperCase()} TO ROLL`), 0, 0);
    };
    return sc;
  }
  const yCanHold = () => {
    const ctx = YS.ctx, st = ctx && ctx.state;
    return !!(st && ctx.isMyTurn && ctx.status === 'active' && st.dice.length && st.rollsLeft < 3 && st.rollsLeft > 0 && !YS.anim);
  };
  function yToggleHold(i) {
    if (!yCanHold()) return;
    YS.held[i] = !YS.held[i];
    try { YS.ctx.sound.tap(); } catch (e) {}
    yApplyHeld(false);
    if (YS.refresh) YS.refresh();
  }
  const yHeldMark = (d, on) => {
    if (!d || (d.glow && d.glow.col === GOLD)) return;         // a Yahtzee's gold outranks the hold ring
    d.rim = on ? { col: LIME, amt: 1 } : null; d.glow = on ? { col: LIME, amt: 0.55, tint: 0.12 } : null;
  };
  // move dice between the table and the HELD tray to match YS.held (local, instant for me)
  function yApplyHeld(instant) {
    const sc = YS.sc; if (!sc) return;
    for (let i = 0; i < 5; i++) {
      const d = sc.getDie('y' + i); if (!d) continue;
      if (YS.held[i] && !YS.inSlot[i]) {
        YS.tablePose[i] = { x: d.pos.x, z: d.pos.z, q: d.q };
        YS.inSlot[i] = true;
        if (instant) sc.setDie({ id: d.id, x: YZ.slotX(i), z: YZ.slotZ, yaw: 0 }); else sc.glide(d.id, YZ.slotX(i), YZ.slotZ, 0, 380, 0.9);
      } else if (!YS.held[i] && YS.inSlot[i]) {
        YS.inSlot[i] = false;
        const tp = YS.tablePose[i] || yFreeSpot(i);
        if (instant) sc.setDie({ id: d.id, x: tp.x, z: tp.z, yaw: 0.3 }); else sc.glide(d.id, tp.x, tp.z, 0.3 + i * 0.4, 380, 0.9);
      }
      yHeldMark(d, YS.held[i]);
    }
  }
  function yFreeSpot(i) {            // somewhere clear on the cloth, above its tray slot
    const sc = YS.sc, x0 = YZ.slotX(i);
    for (let t = 0; t < 12; t++) {
      const x = Math.max(YZ.bounds.x0 + 0.8, Math.min(YZ.bounds.x1 - 0.8, x0 + ((t % 3) - 1) * 1.5)), z = 0.6 - Math.floor(t / 3) * 1.4;
      if (sc.dice.every(d => d.id === 'y' + i || Math.hypot(d.pos.x - x, d.pos.z - z) > 1.5)) return { x, z };
    }
    return { x: x0, z: 0.2 };
  }
  // the roll as the physics saw it: which indices tumbled, and their deterministic sim
  function yRollSim(st) {
    const held = st.held || [], idx = [];
    for (let i = 0; i < st.dice.length; i++) if (!held[i]) idx.push(i);
    if (!st.rollId || !idx.length) return { idx, sim: null };
    return { idx, sim: D3().simulate({ seed: D3().hash(st.rollId), dice: idx.map(i => ({ value: st.dice[i], size: YZ.size })), bounds: YZ.bounds, entry: YZ.entry }) };
  }
  function ySync(ctx) {
    const st = ctx.state, sc = YS.sc;
    const dice = st.dice || [];
    if (!dice.length) {                                   // turn over / new game: sweep the cloth
      YS.key = 'empty'; YS.anim = null; YS.inSlot = []; YS.tablePose = [];
      YS.held = [false, false, false, false, false]; YS.heldKey = '';
      sc.timeScale = 1; sc.camReset();
      sc.dice.forEach(d => { if (!d.fade) sc.fadeDie(d.id, 0, 320, true); });
      return;
    }
    const key = st.rollId ? 'R' + st.rollId : 'H' + JSON.stringify([dice, st.held, st.rollsLeft, st.turn]);
    if (YS.anim && YS.anim.key === key) {
      if (performance.now() > YS.anim.deadline) yFinish(true);  // a stalled loop can never strand the UI
      return;
    }
    if (YS.key === key) { yApplyHeld(false); return; }
    // ----- a different roll than the one on the cloth -----
    YS.key = key;
    YS.heldKey = key; YS.held = (st.held || []).slice(0, 5).map(Boolean); while (YS.held.length < 5) YS.held.push(false);
    const { idx, sim } = yRollSim(st);
    const heldNow = (st.held || []).map(Boolean);
    const unseen = !!st.rollId && seenGet('yz') !== st.rollId;
    sc.clearTimeline(); sc.timeScale = 1; sc.camReset();
    if (YS.anim) YS.anim = null;
    sc.dice.forEach(d => { d.glow = null; d.rim = null; });
    // held dice: into the tray (glide if they're already on the cloth — that's the partner seeing my holds)
    for (let i = 0; i < 5; i++) {
      if (!heldNow[i]) continue;
      const d = sc.getDie('y' + i);
      if (d && !YS.inSlot[i] && unseen && !sc.calm) { YS.tablePose[i] = { x: d.pos.x, z: d.pos.z, q: d.q }; sc.setDie({ id: d.id, value: dice[i] }); sc.glide(d.id, YZ.slotX(i), YZ.slotZ, 0, 420, 0.9); }
      else sc.setDie({ id: 'y' + i, value: dice[i], size: YZ.size, mat: Dice3D.MATS.ivory, x: YZ.slotX(i), z: YZ.slotZ, yaw: 0, alpha: 1 });
      YS.inSlot[i] = true; yHeldMark(sc.getDie('y' + i), true);
    }
    const specs = idx.map(i => ({ id: 'y' + i, value: dice[i], size: YZ.size, mat: Dice3D.MATS.ivory, owner: st.turn }));
    idx.forEach(i => { YS.inSlot[i] = false; YS.tablePose[i] = null; });
    if (unseen && sim && !sc.calm) {
      // the dice being re-rolled get scooped off the cloth as the new throw comes in
      idx.forEach(i => { const d = sc.getDie('y' + i); if (d && d.alpha > 0.05) { const gid = 'yg' + i + '_' + newId(); sc.setDie({ id: gid, value: d.value, size: d.size, mat: d.mat }); const gd = sc.getDie(gid); gd.pos = Object.assign({}, d.pos); gd.q = d.q; gd.alpha = d.alpha; gd.rim = d.rim; sc.fadeDie(gid, 0, 200, true); } });
      const ms = sc.playRoll(sim, specs);
      specs.forEach(s => yHeldMark(sc.getDie(s.id), false));
      YS.clackN = 0;
      const five = dice.length === 5 && dice.every(v => v === dice[0]);
      YS.anim = { key, rid: st.rollId, five, deadline: performance.now() + ms / 0.3 + 3000 };
      if (five) {                                        // YAHTZEE: slow-mo settle + push-in on the dice
        let cx = 0, cz = 0; idx.forEach((i, k) => { const p = sc.finalPose(sim, k).pos; cx += p.x; cz += p.z; });
        heldNow.forEach((hh, i) => { if (hh) { cx += YZ.slotX(i); cz += YZ.slotZ; } });
        cx /= 5; cz /= 5;
        sc.after(ms * 0.5, () => { sc.timeScale = 0.33; sc.camRate = 0.05; sc.camTo(1.28, cx, 0.5, cz); });
      }
      sc.after(ms - 10, () => yFinish(false));
    } else {
      // nothing to replay: lay the dice exactly where that roll left them
      specs.forEach((s, k) => {
        const d = sim ? sc.placePose(s, sc.finalPose(sim, k)) : sc.setDie(Object.assign({}, s, yFallbackSpot(dice, s, k)));
        yHeldMark(d, false);
        if (unseen) { d.alpha = 0; sc.fadeDie(d.id, 1, 260); }
      });
      if (unseen) { seenSet('yz', st.rollId); if (dice.length === 5 && dice.every(v => v === dice[0])) yCelebrate(true); }
      // drop anything left over from an older layout
      sc.dice.filter(d => /^y\d$/.test(d.id) && +d.id.slice(1) >= dice.length).forEach(d => sc.removeDie(d.id));
    }
    yApplyHeld(true);
  }
  function yFallbackSpot(dice, s, k) {        // legacy saves (no rollId): a tidy, seeded scatter
    const R = D3().rng(D3().hash(JSON.stringify(dice) + s.id));
    return { x: -3.2 + k * 1.6 + (R() - 0.5) * 0.4, z: -0.6 + (R() - 0.5) * 1.4, yaw: (R() - 0.5) * 1.2 };
  }
  function yFinish(forced) {
    const A = YS.anim, sc = YS.sc; if (!A) return;
    YS.anim = null;
    seenSet('yz', A.rid);
    if (forced) {                                          // snap everything to rest
      sc.dice.forEach(d => { if (d.track) { d.track.f = d.track.n - 1; } });
    }
    if (A.five) yCelebrate(forced);
    else { sc.timeScale = 1; }
    try { YS.ctx && YS.ctx.sound.place(); } catch (e) {}
    const ctx = YS.ctx;
    if (ctx && ctx.root && ctx.root.isConnected) { ctx.root.innerHTML = ''; YAHTZEE.render(ctx); }   // reveal the score options now
  }
  function yCelebrate(quiet) {
    const sc = YS.sc;
    sc.timeScale = 1; sc.camRate = 0.07;
    sc.dice.forEach(d => {
      if (!/^y\d$/.test(d.id)) return;
      d.glow = { col: GOLD, amt: 1, tint: 0.45, pip: [0.35, 0.16, 0.04] }; d.rim = { col: GOLD, amt: 1 };
      if (!quiet) { sc.burst(d.pos.x, d.pos.y + 0.3, d.pos.z, [[1, 0.85, 0.4], [1, 0.95, 0.7], [1, 0.6, 0.25]], 26, { speed: 5 }); sc.flash(d.pos.x, d.pos.y, d.pos.z, GOLD, 2.2); }
    });
    if (!quiet) {
      sc.shake(5);
      try { if (window.fxBanner) window.fxBanner('YAHTZEE!', 'var(--gold)'); } catch (e) {}
      try { YS.ctx.sound.win(); } catch (e) {}
      // the gold settles down to a warm glow (held dice keep their lime ring)
      sc.tween(1800, p => { sc.dice.forEach(d => { if (d.glow && d.glow.col === GOLD) d.glow.amt = 1 - p * 0.55; }); }, { delay: 900, ease: 'inOut' });
      sc.after(1300, () => sc.camReset());
    } else sc.camReset();
  }

  const YAHTZEE = {
    id: 'yahtzee', name: 'Yahtzee', emoji: '🎲', category: 'Dice', accent: '#ff9f45',
    tagline: 'Roll, hold, fill the card.',
    test: { allowed: yAllowed, catScore: yCatScore, total: yTotal, isJoker, scene: () => YS, S: YS, YZ },
    init: host => ({ turn: host, scores: [{}, {}], dice: [], held: [false, false, false, false, false], rollsLeft: 3, host, rollId: null }),
    // on a timeout "skip", hand a CLEAN turn to the opponent (don't inherit my dice/rolls)
    skipTurn: (s, opp) => Object.assign({}, s, { turn: opp, dice: [], held: [false, false, false, false, false], rollsLeft: 3 }),
    // the last roll / sweep is still on screen when a match ends — hold the result card for it
    resultDelay: () => (YS.sc && (YS.anim || YS.sc.busy())) ? Math.min(4000, Math.round(YS.sc.remaining()) + 250) : 0,
    render(ctx) {
      const st = ctx.state, me = ctx.me, h = ctx.h;
      if (!st.dice) st.dice = [];
      YS.ctx = ctx;
      ctx.root.append(ctx.turnBar({ scores: [yTotal(st.scores[0]), yTotal(st.scores[1])] }));
      const wrap = h('div', { class: 'dz-wrap' }); ctx.root.append(wrap);
      const has3d = !!D3();
      if (has3d) { yScene(); ySync(ctx); YS.sc.attach(wrap); YS.sc.redraw(); }
      else if (YS.heldKey !== JSON.stringify([st.dice, st.rollsLeft, st.turn])) { YS.heldKey = JSON.stringify([st.dice, st.rollsLeft, st.turn]); YS.held = (st.held || [false, false, false, false, false]).slice(); }
      const rolling = !!YS.anim;
      const ui = h('div', { class: 'dz-wrap' }); wrap.append(ui);
      const cardBox = h('div', { class: 'yz-panel' }); wrap.append(cardBox);

      function drawUI() {
        ui.innerHTML = '';
        const rolled = st.dice.length > 0, canHold = yCanHold() || (!has3d && ctx.isMyTurn && rolled && st.rollsLeft < 3 && st.rollsLeft > 0);
        if (has3d && YS.sc) YS.sc.cv.classList.toggle('live', canHold);
        if (rolled && !rolling && (canHold || !has3d)) {
          // accessible (and flat-fallback) hold toggles — tapping the dice on the table does the same
          const row = h('div', { class: 'dz-holds', role: 'group', 'aria-label': 'Hold dice' });
          st.dice.forEach((v, i) => {
            const b = h('button', { class: 'dz-hold', 'aria-pressed': YS.held[i] ? 'true' : 'false', 'aria-label': `Die ${i + 1} showing ${v}${YS.held[i] ? ', held' : ''}`, disabled: canHold ? null : '' },
              dieEl(h, v, { xs: true, held: YS.held[i] }), YS.held[i] ? 'HELD' : 'HOLD');
            b.onclick = () => { if (has3d) yToggleHold(i); else { YS.held[i] = !YS.held[i]; drawUI(); } };
            row.append(b);
          });
          ui.append(row);
        }
        if (ctx.isMyTurn) {
          if (st.rollsLeft > 0) {
            const btn = h('button', { class: 'btn btn-primary btn-block dz-rollbtn', onclick: rollDice, disabled: rolling ? '' : null },
              h('span', { class: 'dz-cup' }, '🎲'), rolled ? 'Roll again ' : 'Roll the dice', rolled ? h('span', { class: 'n' }, `(${st.rollsLeft} left)`) : '');
            ui.append(btn);
          }
          if (rolled) ui.append(h('p', { class: 'dz-rolls', html: rolling ? 'Rolling…' : st.rollsLeft > 0 ? `Tap dice to <b>hold</b> them, or pick a box below to score` : 'No rolls left — pick a box to score' }));
        } else ui.append(h('p', { class: 'dz-rolls', html: rolling ? `<b>${ctx.esc ? ctx.esc(ctx.seat(st.turn).name) : ctx.seat(st.turn).name}</b> rolled…` : `${ctx.seat(st.turn).name} is rolling…` }));
      }
      function scoreCard() {
        const tbl = h('table', { class: 'yz-card' });
        tbl.append(h('tr', {}, h('th', { class: 'lbl' }, ''), h('th', { class: 'p0' + (me === 0 ? ' me' : '') }, ctx.players[0].name), h('th', { class: 'p1' + (me === 1 ? ' me' : '') }, ctx.players[1].name)));
        const cell = (seat, c) => {
          const card = st.scores[seat];
          if (c.id in card) return h('td', { class: 'yz-cell' + (card[c.id] === 0 ? ' zero' : '') }, String(card[c.id]));
          const liveHere = ctx.isMyTurn && seat === me && st.dice.length > 0 && yAllowed(card, st.dice).includes(c.id);
          if (liveHere && rolling) return h('td', { class: 'yz-cell wait' }, '…');
          if (liveHere) { const td = h('td', { class: 'yz-cell live' }, String(yCatScore(card, st.dice, c.id))); td.onclick = () => scoreCat(c.id); return td; }
          return h('td', { class: 'yz-cell zero' }, '·');
        };
        Y_CATS.forEach(c => {
          tbl.append(h('tr', {}, h('td', { class: 'lbl' }, c.label), cell(0, c), cell(1, c)));
          if (c.id === 'yahtzee') tbl.append(h('tr', {}, h('td', { class: 'lbl yz-sub' }, 'Yahtzee bonus (+100 each)'),
            ...[0, 1].map(p => h('td', { class: 'yz-sub' }, st.scores[p].ybonus ? '+' + st.scores[p].ybonus : '·'))));
          if (c.id === 'sixes') tbl.append(h('tr', {}, h('td', { class: 'lbl yz-sub' }, 'Upper bonus (63+→35)'),
            h('td', { class: 'yz-sub' }, yUpper(st.scores[0]) >= 63 ? '+35' : `${yUpper(st.scores[0])}/63`),
            h('td', { class: 'yz-sub' }, yUpper(st.scores[1]) >= 63 ? '+35' : `${yUpper(st.scores[1])}/63`)));
        });
        tbl.append(h('tr', { class: 'yz-tot' }, h('td', { class: 'lbl' }, 'TOTAL'), h('td', {}, String(yTotal(st.scores[0]))), h('td', {}, String(yTotal(st.scores[1])))));
        return tbl;
      }
      YS.refresh = () => { drawUI(); cardBox.innerHTML = ''; cardBox.append(scoreCard()); };
      YS.refresh();
      const joker = ctx.isMyTurn && isJoker(st.scores[me], st.dice);
      if (rolling) ctx.msg(ctx.isMyTurn ? 'Rolling… 🎲' : `${ctx.seat(st.turn).name} rolled — watch the dice`, ctx.isMyTurn ? ctx.players[me].color : 'var(--ink-faint)');
      else ctx.isMyTurn ? ctx.msg(joker ? `Extra Yahtzee!${st.scores[me].yahtzee === 50 ? ' +100 bonus 🎉' : ''} Joker: ${yAllowed(st.scores[me], st.dice).length === 1 ? 'it must go in its upper box' : 'pick a highlighted box'}` : 'Your turn 🎲', ctx.players[me].color) : waiting(ctx, ctx.seat(st.turn).name);

      function rollDice() {
        if (st.rollsLeft <= 0 || YS.anim) return;
        const s = ctx.clone(st);
        const rolled = st.dice.length > 0;
        const held = YS.held.slice();
        s.dice = (rolled ? st.dice : [0, 0, 0, 0, 0]).map((v, i) => (rolled && held[i]) ? v : (1 + rint(6)));
        s.held = rolled ? held : [false, false, false, false, false];
        s.rollsLeft = st.rollsLeft - 1;
        s.rollId = newId();                                  // every phone replays this exact tumble once
        ctx.sound.place(); ctx.commit(s);
      }
      function scoreCat(id) {
        const card = st.scores[me];
        if (!ctx.isMyTurn || !st.dice.length || !yAllowed(card, st.dice).includes(id)) { ctx.sound.bad(); return; }   // used box / Joker order
        const s = ctx.clone(st);
        s.scores = [Object.assign({}, st.scores[0]), Object.assign({}, st.scores[1])];
        s.scores[me][id] = yCatScore(card, st.dice, id);
        if (isJoker(card, st.dice) && card.yahtzee === 50) s.scores[me].ybonus = (card.ybonus || 0) + 100;
        s.dice = []; s.held = [false, false, false, false, false]; s.rollsLeft = 3; s.turn = 1 - me; s.rollId = null; ctx.sound.good();
        if (yDone(s.scores[0]) && yDone(s.scores[1])) { const a = yTotal(s.scores[0]), b = yTotal(s.scores[1]); return ctx.commit(s, a === b ? 'draw' : (a > b ? 0 : 1)); }
        ctx.commit(s);
      }
    },
  };
  Games.register(YAHTZEE);

  /* ===================== LIAR'S DICE ===================== */
  // No wild 1s (kept simple): a bid claims at least N dice across BOTH players show face F.
  // 3D table, from MY side: my cup + dice near me, my partner's cup across the table. Their dice are
  // never handed to the 3D scene during the bid phase — it can't draw what it doesn't have.
  const LDS = 0.86;
  const LD = {
    table: { hx: 5.0, hz: 4.3, rc: 0.7, rail: 1.0, railH: 0.6, felt: [0.02, 0.2, 0.235], leather: [0.2, 0.09, 0.06] },
    mine: { x: -1.45, z: 2.45 }, mineCup: { x: 3.0, z: 2.45 },
    opp: { x: 1.45, z: -2.25 }, oppCup: { x: -3.0, z: -2.25 },
    cupR: 1.56, cupH: 1.8, plaque: { x: 0, z: 0.12 },
  };
  const LS = { sc: null, ctx: null, round: '', reveal: '', anim: null, plaque: null, plaqueKey: '', plaqueT: -1e9, count: null, verdict: null, revealing: false, floats: [] };
  const SEAT_DIE = () => [D3().material('#1492a8', null, { spec: 0.9, shin: 70 }), D3().material('#b8286a', null, { spec: 0.9, shin: 70 })];
  let seatMats = null;

  function lScene() {
    if (LS.sc) return LS.sc;
    const sc = D3().create({ vw: 1000, vh: 800, tag: 'ld', className: 'dz-cv', table: LD.table, light: { x: -1.2, y: 10, z: 0.2 },
      camera: { eye: [0, 12.2, 10.4], target: [0, 0, 0.35], fillW: 1.03 } });
    LS.sc = sc; seatMats = SEAT_DIE();
    sc.onTable = drawPlaque;
    sc.onOverlay = drawCount;
    return sc;
  }
  // five dice in a loose ring under a cup; seeded so every repaint lays them out the same way
  function cluster(n, cx, cz, seed) {
    const R = D3().rng(seed), out = [], rad = [0, 0, 0.55, 0.64, 0.74, 1.02][Math.min(5, n)] || 1.02, rot = R() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = rot + i / n * Math.PI * 2, r = n === 1 ? 0 : rad;
      out.push({ x: cx + Math.cos(a) * r + (R() - 0.5) * 0.08, z: cz + Math.sin(a) * r + (R() - 0.5) * 0.08, yaw: (R() - 0.5) * 0.5 });
    }
    return out;
  }
  const lLayout = st => st.round != null ? 'R' + st.round : 'H' + D3().hash(JSON.stringify(st.dice));   // where the dice sit this round
  const lRoundKey = st => lLayout(st) + ':' + st.counts.join('');
  const lRevealKey = st => 'V' + (st.round != null ? st.round : '') + JSON.stringify([st.counts, st.last]);
  const posFor = (seat, me) => seat === me ? LD.mine : LD.opp;
  function lPlaceDice(st, seat, me, key, skipIdx) {
    const sc = LS.sc, vals = st.dice[seat] || [], P = posFor(seat, me);
    const spots = cluster(vals.length, P.x, P.z, D3().hash(key + ':' + seat));
    vals.forEach((v, i) => {
      if (i === skipIdx) { sc.removeDie('d' + seat + '_' + i); return; }
      sc.setDie({ id: 'd' + seat + '_' + i, value: v, owner: seat, size: LDS, mat: seatMats[seat], x: spots[i].x, z: spots[i].z, yaw: spots[i].yaw, alpha: 1 });
    });
  }
  function lCups(ctx, mineUp) {
    const sc = LS.sc, me = ctx.me, opp = 1 - me, P = ctx.players;
    sc.setCup({ id: 'cup' + me, r: LD.cupR, h: LD.cupH, band: seatRGB(P[me].color), label: (P[me].name || '?')[0].toUpperCase(),
      x: mineUp ? LD.mineCup.x : LD.mine.x, y: 0, z: mineUp ? LD.mineCup.z : LD.mine.z, tx: 0, tz: 0, alpha: 1 });
    sc.setCup({ id: 'cup' + opp, r: LD.cupR, h: LD.cupH, band: seatRGB(P[opp].color), label: (P[opp].name || '?')[0].toUpperCase(),
      x: LD.opp.x, y: 0, z: LD.opp.z, tx: 0, tz: 0, alpha: 1 });
  }
  function lSync(ctx) {
    const st = ctx.state, sc = LS.sc, me = ctx.me, opp = 1 - me;
    // the plaque on the cloth: the live bid, or (after a call) the bid that was called
    const pb = st.phase === 'reveal' && st.last ? { qty: st.last.qty, face: st.last.face, by: 1 - st.last.caller } : st.bid ? { qty: st.bid.qty, face: st.bid.face, by: st.bid.by } : null;
    const pk = JSON.stringify(pb);
    if (pk !== LS.plaqueKey) { LS.plaqueKey = pk; LS.plaque = pb; LS.plaqueT = sc.time; sc.wake(); }
    if (st.phase === 'reveal') {
      const key = lRevealKey(st);
      if (LS.anim && LS.anim.key === key) { if (performance.now() > LS.anim.deadline) lRevealDone(true); return; }
      if (LS.reveal === key) return;
      LS.reveal = key; LS.round = '';
      const unseen = seenGet('ldv') !== key;
      if (unseen && !sc.calm) lRevealAnim(ctx, key);
      else lRevealFinal(ctx, key, unseen);
      return;
    }
    // ----- bid phase -----
    LS.reveal = ''; LS.count = null; LS.verdict = null; LS.revealing = false;
    const key = lRoundKey(st);
    // the opponent's dice must never be in the scene now — drop any left from the last reveal at once
    sc.dice.filter(d => d.owner === opp).forEach(d => sc.removeDie(d.id));
    if (LS.anim && LS.anim.key === key) { if (performance.now() > LS.anim.deadline) lRoundDone(true); return; }
    if (LS.round === key) return;
    LS.round = key;
    sc.clearTimeline(); sc.camReset();
    const unseen = seenGet('ldr') !== key;
    if (unseen && !sc.calm) lRoundAnim(ctx, key);
    else {
      sc.dice.slice().forEach(d => sc.removeDie(d.id));
      lCups(ctx, true); lPlaceDice(st, me, me, lLayout(st));
      if (unseen) { sc.dice.forEach(d => { d.alpha = 0; sc.fadeDie(d.id, 1, 260); }); seenSet('ldr', key); }
    }
  }
  // a new round: both cups rattle, slam down, then mine lifts aside so I can see my hand
  function lRoundAnim(ctx, key) {
    const st = ctx.state, sc = LS.sc, me = ctx.me;
    sc.dice.slice().forEach(d => { if (d.owner === me) sc.fadeDie(d.id, 0, 180, true); else sc.removeDie(d.id); });
    lCups(ctx, false);
    const cm = sc.getCup('cup' + me), co = sc.getCup('cup' + (1 - me));
    cm.y = 0.25; co.y = 0.25;
    sc.cupShake(cm.id, 1150, 1); sc.cupShake(co.id, 1150, 0.9);
    LS.anim = { key, kind: 'round', deadline: performance.now() + 9000 };
    sc.after(190, () => {                                        // my new dice, rattling inside my cup (not drawn)
      lPlaceDice(st, me, me, lLayout(st));
      sc.dice.forEach(d => { if (d.owner === me) d.hidden = true; });
    });
    for (let i = 0; i < 9; i++) sc.after(60 + i * 118, () => { try { (i % 2 ? ctx.sound.tap : ctx.sound.move)(); } catch (e) {} sc.shake(1.4); });
    sc.after(1150, () => { cm.y = 0.25; co.y = 0.25; sc.cupTo(cm.id, { y: 0 }, 110, { ease: 'in' }); sc.cupTo(co.id, { y: 0 }, 110, { ease: 'in' }); });
    sc.after(1270, () => {
      sc.shake(9); sc.puff(cm.x, cm.z, 2.6); sc.puff(co.x, co.z, 2.6);
      try { ctx.sound.place(); } catch (e) {}
      sc.dice.forEach(d => { if (d.owner === me) d.hidden = false; });   // covered by the cup until it lifts
    });
    sc.after(1650, () => {                                       // peek: my cup lifts and sets down beside my dice
      sc.cupTo(cm.id, { x: LD.mineCup.x, z: LD.mineCup.z, tx: 0 }, 720, { arc: 2.4, ease: 'inOut' });
      sc.tween(720, p => { cm.tx = Math.sin(p * Math.PI) * 0.45; }, { ease: 'linear' });
    });
    sc.after(2420, () => lRoundDone(false));
  }
  function lRoundDone(forced) {
    const A = LS.anim, sc = LS.sc; if (!A) return;
    LS.anim = null; seenSet('ldr', A.key);
    if (forced) {
      const ctx = LS.ctx; sc.clearTimeline(); sc.camReset();
      sc.dice.slice().forEach(d => sc.removeDie(d.id));
      lCups(ctx, true); lPlaceDice(ctx.state, ctx.me, ctx.me, lLayout(ctx.state));
    }
    else { const cm = sc.getCup('cup' + LS.ctx.me); if (cm) { cm.tx = 0; cm.y = 0; } }
  }
  function lMatchOrder(st, me) {           // far hand first, then mine; left → right
    const sc = LS.sc, list = [];
    [1 - me, me].forEach(seat => (st.dice[seat] || []).forEach((v, i) => { const d = sc.getDie('d' + seat + '_' + i); if (d) list.push({ d, v, seat, x: d.pos.x }); }));
    return list.sort((a, b) => (a.seat === b.seat ? a.x - b.x : (a.seat === me ? 1 : -1)));
  }
  function lVerdict(ctx, L) {
    const P = ctx.players, loser = P[L.loser].name;
    return L.good ? { big: 'TRUE!', col: '#79f5b6', sub: `${loser} loses a die`, n: L.actual }
      : { big: 'BLUFF!', col: '#ff5a7a', sub: `${loser} loses a die`, n: L.actual };
  }
  function lRevealAnim(ctx, key) {
    const st = ctx.state, sc = LS.sc, me = ctx.me, opp = 1 - me, L = st.last;
    sc.clearTimeline();
    sc.dice.slice().forEach(d => sc.removeDie(d.id));
    lCups(ctx, true);
    lPlaceDice(st, me, me, lLayout(st)); lPlaceDice(st, opp, me, lLayout(st));   // theirs sit under their cup until it lifts
    const co = sc.getCup('cup' + opp), cm = sc.getCup('cup' + me);
    LS.revealing = true; LS.count = { n: 0, t: sc.time, face: L.face }; LS.verdict = null; LS.floats = [];
    const matches = lMatchOrder(st, me).filter(o => o.v === L.face), n = matches.length;
    const iv = n ? Math.min(380, 1650 / n) : 0;
    LS.anim = { key, kind: 'reveal', deadline: performance.now() + 12000 };
    sc.camRate = 0.06; sc.camTo(1.12, 0, 0, 0.1);
    try { ctx.sound.countdown(); } catch (e) {}
    sc.cupTo(co.id, { y: 2.6 }, 330, { ease: 'out' });
    sc.tween(330, p => { co.tx = -p * 0.35; }, { ease: 'out' });
    sc.cupTo(co.id, { x: LD.oppCup.x, z: LD.oppCup.z }, 480, { delay: 340, ease: 'inOut' });
    sc.cupTo(co.id, { y: 0 }, 300, { delay: 560, ease: 'in' });
    sc.tween(300, p => { co.tx = -0.35 * (1 - p); }, { delay: 560 });
    sc.cupTo(cm.id, { y: 1.1 }, 260, { ease: 'out' }); sc.cupTo(cm.id, { y: 0 }, 260, { delay: 280, ease: 'in' });
    sc.after(880, () => { sc.puff(co.x, co.z, 2.2); });
    const T0 = 900;
    sc.after(T0 - 150, () => sc.tween(300, p => { lMatchOrder(st, me).forEach(o => { if (o.v !== L.face) o.d.dim = 0.55 * p; }); }));
    matches.forEach((o, k) => sc.after(T0 + k * iv, () => {
      const d = o.d; d.glow = { col: GOLD, amt: 0, tint: 0.8, pip: [0.3, 0.13, 0.02] }; d.rim = { col: GOLD, amt: 1 };
      sc.tween(220, p => { d.glow.amt = p; d.scale = 1 + 0.16 * Math.sin(p * Math.PI); });
      sc.burst(d.pos.x, d.pos.y + 0.3, d.pos.z, [[1, 0.85, 0.4], [1, 0.95, 0.7]], 10, { speed: 3 });
      LS.count = { n: k + 1, t: sc.time, face: L.face };
      LS.floats.push({ x: d.pos.x, y: d.pos.y + d.size * 0.7, z: d.pos.z, text: (k + 1) + '…', t: sc.time });
      try { ctx.sound.tap(); } catch (e) {}
    }));
    const TV = T0 + n * iv + 320;
    sc.after(TV, () => {
      LS.verdict = Object.assign(lVerdict(ctx, L), { t: sc.time });
      try { if (window.fxBanner) window.fxBanner(LS.verdict.big, LS.verdict.col); } catch (e) {}
      try { (L.loser === me ? ctx.sound.bad : ctx.sound.good)(); } catch (e) {}
      sc.shake(4);
    });
    sc.after(TV + 520, () => {
      const id = 'd' + L.loser + '_' + ((st.dice[L.loser] || []).length - 1);
      sc.shatter(id, seatRGB(ctx.players[L.loser].color)); sc.shake(8);
      if (L.loser === me) { try { if (navigator.vibrate) navigator.vibrate([40, 30, 70]); } catch (e) {} }
    });
    sc.after(TV + 1100, () => { sc.camReset(); lRevealDone(false); });
  }
  function lRevealFinal(ctx, key, fade) {
    const st = ctx.state, sc = LS.sc, me = ctx.me, opp = 1 - me, L = st.last;
    sc.clearTimeline();
    sc.dice.slice().forEach(d => sc.removeDie(d.id));
    lCups(ctx, true);
    const oc = sc.getCup('cup' + opp); oc.x = LD.oppCup.x; oc.z = LD.oppCup.z;
    const skipL = (st.dice[L.loser] || []).length - 1;
    lPlaceDice(st, me, me, lLayout(st), L.loser === me ? skipL : -1);
    lPlaceDice(st, opp, me, lLayout(st), L.loser === opp ? skipL : -1);
    sc.dice.forEach(d => {
      const v = d.value;
      if (v === L.face) { d.glow = { col: GOLD, amt: 1, tint: 0.8, pip: [0.3, 0.13, 0.02] }; d.rim = { col: GOLD, amt: 1 }; } else d.dim = 0.5;
      if (fade) { d.alpha = 0; sc.fadeDie(d.id, 1, 260); }
    });
    LS.count = { n: L.actual, t: -1e9, face: L.face };
    LS.verdict = Object.assign(lVerdict(ctx, L), { t: -1e9 });
    LS.revealing = false;
    if (fade) seenSet('ldv', key);
  }
  function lRevealDone(forced) {
    const A = LS.anim; if (!A) return;
    LS.anim = null; LS.revealing = false; seenSet('ldv', A.key);
    const ctx = LS.ctx;
    if (forced) { LS.reveal = ''; lSync(ctx); }
    if (ctx && ctx.root && ctx.root.isConnected) { ctx.root.innerHTML = ''; LIARS.render(ctx); }   // now show the summary + Next round
  }
  // the bid, on a slate plaque lying on the cloth. During a reveal it becomes the scoreboard:
  // FOUND n (counting up) against the bid, then the verdict stamped across it.
  function drawPlaque(g, sc) {
    const ctx = LS.ctx; if (!ctx) return;
    const P = LS.plaque, st = ctx.state, C = LS.count, V = LS.verdict;
    const pa = (sc.time - LS.plaqueT) / 320, pop = pa >= 0 && pa < 1 ? 1 + 0.16 * Math.sin(pa * Math.PI) : 1;
    g.save(); sc.plane(g, LD.plaque.x, LD.plaque.z, 0.01); g.scale(pop, pop);
    const W = 460, H = 170;
    rr(g, -W / 2, -H / 2, W, H, 26);
    const wf = g.createLinearGradient(0, -H / 2, 0, H / 2); wf.addColorStop(0, '#8a5a2e'); wf.addColorStop(1, '#43270f');
    g.fillStyle = wf; g.fill();
    if (V) { g.shadowColor = V.col; g.shadowBlur = 30; g.strokeStyle = V.col; g.lineWidth = 4; g.stroke(); g.shadowBlur = 0; }
    rr(g, -W / 2 + 14, -H / 2 + 14, W - 28, H - 28, 16);
    const sl = g.createLinearGradient(0, -H / 2, 0, H / 2); sl.addColorStop(0, '#1c2327'); sl.addColorStop(1, '#0b0f12');
    g.fillStyle = sl; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2; g.stroke();
    g.textBaseline = 'middle';
    const label = (t, x, al) => { g.shadowBlur = 0; g.fillStyle = 'rgba(234,240,255,.5)'; g.font = '700 22px "Chakra Petch", Orbitron, sans-serif'; g.textAlign = al || 'left'; g.fillText(t, x, -52); };
    if (P && C) {                                   // reveal: FOUND vs BID
      const age = sc.time - C.t, cp = age >= 0 && age < 260 ? 1 + 0.35 * (1 - age / 260) : 1;
      label('FOUND', -200);
      g.save(); g.translate(-150, 14); g.scale(cp, cp);
      g.shadowColor = '#ffd66b'; g.shadowBlur = 24; g.fillStyle = '#ffd66b'; g.font = '900 100px Orbitron, sans-serif'; g.textAlign = 'center';
      g.fillText(String(C.n), 0, 0); g.restore();
      g.strokeStyle = 'rgba(234,240,255,.14)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-66, -50); g.lineTo(-66, 60); g.stroke();
      const col = ctx.players[P.by] ? ctx.players[P.by].color : '#ffd66b';
      label('BID · ' + (ctx.players[P.by] ? ctx.players[P.by].name.toUpperCase() : ''), -40);
      g.shadowColor = col; g.shadowBlur = 16; g.fillStyle = col; g.font = '900 76px Orbitron, sans-serif'; g.textAlign = 'right';
      g.fillText(String(P.qty), 40, 16);
      g.font = '800 44px Orbitron, sans-serif'; g.textAlign = 'center'; g.fillText('×', 80, 18);
      g.shadowBlur = 12; g.shadowColor = 'rgba(255,255,255,.4)';
      face2d(g, 158, 14, 76, P.face, '#f4f0e6', '#1a1820');
    } else if (P) {                                 // the live bid
      const col = ctx.players[P.by] ? ctx.players[P.by].color : '#ffd66b';
      label('BID · ' + (ctx.players[P.by] ? ctx.players[P.by].name.toUpperCase() : ''), -200);
      g.shadowColor = col; g.shadowBlur = 22; g.fillStyle = col; g.font = '900 104px Orbitron, "Chakra Petch", sans-serif'; g.textAlign = 'right';
      g.fillText(String(P.qty), 16, 18);
      g.font = '800 58px Orbitron, sans-serif'; g.textAlign = 'center'; g.fillText('×', 66, 20);
      g.shadowBlur = 16; g.shadowColor = 'rgba(255,255,255,.5)';
      face2d(g, 158, 16, 92, P.face, '#f4f0e6', '#1a1820');
    } else {
      g.fillStyle = 'rgba(234,240,255,.6)'; g.font = '800 42px Orbitron, "Chakra Petch", sans-serif'; g.textAlign = 'center';
      g.shadowColor = 'rgba(234,240,255,.35)'; g.shadowBlur = 10;
      g.fillText('OPENING BID', 0, -8);
      g.font = '600 24px "Chakra Petch", sans-serif'; g.fillStyle = 'rgba(234,240,255,.38)'; g.shadowBlur = 0;
      g.fillText(st.turn === ctx.me ? 'your call' : `${(ctx.players[st.turn] || {}).name || ''} goes first`, 0, 40);
    }
    if (V) {                                        // the verdict, stamped across the slate
      const va = sc.time - V.t, vp = va >= 0 && va < 260 ? 1.6 - 0.6 * easeO(va / 260) : 1;
      g.save(); g.rotate(-0.09); g.scale(vp, vp); g.globalAlpha = Math.min(1, va >= 0 ? va / 120 : 1);
      g.font = '900 78px Orbitron, sans-serif'; g.textAlign = 'center';
      const w = g.measureText(V.big).width + 50;
      rr(g, -w / 2, -52, w, 104, 14); g.fillStyle = 'rgba(8,6,12,.82)'; g.fill();
      g.strokeStyle = V.col; g.lineWidth = 5; g.shadowColor = V.col; g.shadowBlur = 24; g.stroke();
      g.fillStyle = V.col; g.fillText(V.big, 0, 4);
      g.restore();
    }
    g.restore();
  }
  // gold "1", "2", "3" … rising off each matching die as it is counted
  function drawCount(g, sc) {
    if (!LS.floats || !LS.floats.length) return;
    const cam = sc.cam;
    LS.floats = LS.floats.filter(f => sc.time - f.t < 1100);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    LS.floats.forEach(f => {
      const age = (sc.time - f.t) / 1100, p = sc.proj(f.x, f.y, f.z);
      const x = (p.x - cam.x) * cam.z + sc.VW / 2 + sc.sx, y = (p.y - cam.y) * cam.z + sc.VH / 2 + sc.sy - 30 - age * 46;
      const sc2 = age < 0.15 ? 0.6 + age / 0.15 * 0.6 : 1.2 - age * 0.2;
      g.save(); g.translate(x, y); g.scale(sc2, sc2); g.globalAlpha = age < 0.7 ? 1 : (1 - age) / 0.3;
      g.font = '900 46px Orbitron, sans-serif'; g.lineWidth = 7; g.strokeStyle = 'rgba(10,6,2,.85)'; g.strokeText(f.text, 0, 0);
      g.shadowColor = '#ffd66b'; g.shadowBlur = 16; g.fillStyle = '#ffe08a'; g.fillText(f.text, 0, 0);
      g.restore();
    });
  }
  const easeO = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

  const LIARS = {
    id: 'liars-dice', name: 'Liar’s Dice', emoji: '🎲', category: 'Dice', accent: '#ff4d6d',
    tagline: 'Bluff your bids, call the lie.',
    init: host => ({ dice: [roll(5), roll(5)], counts: [5, 5], bid: null, turn: host, phase: 'bid', last: null, host, round: 1 }),
    // the call's reveal is still playing when a knockout finishes the match — hold the result card
    resultDelay: () => (LS.sc && LS.anim) ? Math.min(4000, Math.round(LS.sc.remaining()) + 200) : 0,
    test: { scene: () => LS, S: LS, cluster, LD },
    render(ctx) {
      const st = ctx.state, me = ctx.me, opp = 1 - me, h = ctx.h;
      LS.ctx = ctx;
      ctx.root.append(ctx.turnBar({ scores: [st.counts[0], st.counts[1]] }));
      const totalDice = st.counts[0] + st.counts[1];
      const wrap = h('div', { class: 'dz-wrap' }); ctx.root.append(wrap);
      const has3d = !!D3();
      if (has3d) { lScene(); lSync(ctx); LS.sc.attach(wrap); LS.sc.redraw(); }

      if (st.phase === 'reveal') {
        const card = h('div', { class: 'dz-wrap' });
        if (!has3d) [0, 1].forEach(p => {
          card.append(h('div', { class: 'ld-label' }, ctx.players[p].name + (p === st.last.loser ? ' — lost a die' : '')));
          const row = h('div', { class: 'dz-dice' });
          st.dice[p].forEach(v => row.append(dieEl(h, v, { sm: true, win: v === st.last.face })));
          card.append(row);
        });
        if (LS.revealing && has3d) {
          card.append(h('p', { class: 'dz-rolls' }, `${ctx.players[st.last.caller].name} called “Liar!” — lifting the cups…`));
          ctx.msg('Revealing…', 'var(--gold)');
        } else {
          card.append(h('p', { class: 'ld-sum' },
            `Bid was ${st.last.qty}× `, dieEl(h, st.last.face, { xs: true }),
            ` · actually ${st.last.actual} → ${ctx.players[st.last.caller].name} called ${st.last.good ? 'wrong' : 'right'}!`));
          // the button follows `turn` (the loser, who opens next round) — the player on the clock can always
          // continue, so a timer can't run out on someone who has nothing to press
          const cont = st.turn != null ? st.turn : st.host;
          if (me === cont && ctx.status === 'active') card.append(h('button', { class: 'btn btn-primary btn-block', onclick: nextRound }, 'Next round ▶'));
          else if (ctx.status === 'active') waiting(ctx, ctx.players[cont].name + ' to continue');
        }
        wrap.append(card);
        return;
      }

      // bid phase — MY dice are on the table under my lifted cup; my partner's stay under theirs
      wrap.append(h('div', { class: has3d ? 'sr-only' : 'ld-label' }, 'Your dice (secret 🤫): ' + (has3d ? st.dice[me].join(', ') : '')));
      if (!has3d) {
        const myRow = h('div', { class: 'dz-dice' });
        st.dice[me].forEach(v => myRow.append(dieEl(h, v, { sm: true })));
        wrap.append(myRow, h('div', { class: 'ld-label' }, `${ctx.players[opp].name}'s ${st.counts[opp]} dice (hidden)`));
        const oppRow = h('div', { class: 'dz-dice' });
        for (let i = 0; i < st.counts[opp]; i++) oppRow.append(dieEl(h, 1, { sm: true, hid: true }));
        wrap.append(oppRow);
      }
      wrap.append(h('div', { class: 'ld-label' }, st.bid
        ? h('span', { style: 'display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:center' }, 'Current bid: ', h('span', { class: 'ld-pill', style: 'display:inline-flex;align-items:center;gap:6px;padding:4px 10px' }, String(st.bid.qty), '×', dieEl(h, st.bid.face, { xs: true })), ` by ${ctx.players[st.bid.by].name} · ${totalDice} dice in play`)
        : `No bid yet — opening bid · ${totalDice} dice in play`));

      if (!ctx.isMyTurn) { waiting(ctx, ctx.players[st.turn].name); return; }

      // my turn: build a raise + challenge
      const minQty = st.bid ? st.bid.qty : 1;
      let q = minQty, f = st.bid ? st.bid.face : 1;
      const legal = () => st.bid ? (q > st.bid.qty || (q === st.bid.qty && f > st.bid.face)) : (q >= 1);
      const stepBox = h('div', {});
      function drawStep() {
        stepBox.innerHTML = '';
        stepBox.append(h('div', { class: 'ld-label' }, 'How many dice show this face (both players)?'));
        stepBox.append(h('div', { class: 'ld-step' },
          h('button', { onclick: () => { q = Math.max(1, q - 1); drawStep(); }, 'aria-label': 'Fewer' }, '−'),
          h('div', { class: 'v' }, String(q)),
          h('button', { onclick: () => { q = Math.min(totalDice, q + 1); drawStep(); }, 'aria-label': 'More' }, '+')));
        const faces = h('div', { class: 'ld-faces' });
        for (let v = 1; v <= 6; v++) faces.append(h('button', { class: f === v ? 'on' : '', 'aria-label': 'Face ' + v, onclick: () => { f = v; drawStep(); } }, dieEl(h, v, { sm: true })));
        stepBox.append(faces);
        stepBox.append(h('div', { class: 'btn-row mt' },
          st.bid ? h('button', { class: 'btn btn-ghost', onclick: challenge }, '“Liar!” — call it') : '',
          h('button', { class: 'btn btn-primary', style: 'display:inline-flex;align-items:center;gap:6px;justify-content:center', onclick: makeBid }, `Bid ${q} ×`, dieEl(h, f, { xs: true }))));
      }
      wrap.append(stepBox); drawStep();
      ctx.msg(st.bid ? 'Raise the bid, or call their bluff' : 'Make the opening bid', ctx.players[me].color);

      function makeBid() {
        if (!legal()) { ctx.sound.bad(); ctx.msg('Raise must be higher (more dice, or same count + higher face).', 'var(--gold)'); return; }
        const s = ctx.clone(st); s.bid = { qty: q, face: f, by: me }; s.turn = 1 - me; ctx.sound.tap(); ctx.commit(s);
      }
      function challenge() {
        const actual = st.dice[0].concat(st.dice[1]).filter(v => v === st.bid.face).length;
        const bidGood = actual >= st.bid.qty;        // bid was truthful
        const loser = bidGood ? me : st.bid.by;       // caller loses if bid good, else bidder loses
        const s = ctx.clone(st); s.counts = st.counts.slice(); s.counts[loser]--;
        s.phase = 'reveal'; s.last = { qty: st.bid.qty, face: st.bid.face, actual, caller: me, good: bidGood, loser };
        s.turn = loser;                               // the loser opens the next round, so they hold the reveal too
        bidGood ? ctx.sound.bad() : ctx.sound.good();
        if (s.counts[loser] <= 0) return ctx.commit(s, 1 - loser);   // loser out of dice → opponent wins
        ctx.commit(s);
      }
      function nextRound() {
        if (st.phase !== 'reveal' || !ctx.isMyTurn) return;
        const s = ctx.clone(st);
        s.dice = [roll(s.counts[0]), roll(s.counts[1])]; s.bid = null; s.phase = 'bid';
        s.turn = st.last.loser;                       // the player who lost the die starts
        s.round = (st.round || 1) + 1;                // a fresh round → both phones rattle the cups once
        ctx.sound.place(); ctx.commit(s);
      }
    },
  };
  Games.register(LIARS);

})();
