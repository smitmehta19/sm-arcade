/* ============================================================
   DATE NIGHT ROULETTE — a slot machine that lands on a long-distance
   date idea. Spin, then Save ♥ / Mark done ✓ / Remove ✕ / Spin again.
   done / removed / saved live in Store (synced) so you share one list.
   ============================================================ */
(function () {
  const D = window.DATE_NIGHT;
  const rint = n => Math.floor(Math.random() * n);

  const css = `
  .dn{ max-width:560px; margin:0 auto; }
  .dn-head{ text-align:center; margin:6px 0 16px; }
  .dn-head h2{ font-family:var(--font-display); font-weight:800; font-size:clamp(15px,4.2vw,21px); letter-spacing:.4px; margin:0; text-wrap:balance;
    background:linear-gradient(90deg,var(--magenta),var(--violet),var(--cyan)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent;
    filter:drop-shadow(0 0 14px rgba(155,123,255,.35)); }
  .dn-head p{ color:var(--ink-dim); font-size:13px; margin:8px 0 0; }
  .dn-filters{ display:flex; gap:8px; overflow-x:auto; padding-bottom:6px; scrollbar-width:none; margin-bottom:8px; }
  .dn-filters::-webkit-scrollbar{ display:none; }
  .dn-len{ display:flex; gap:7px; flex-wrap:wrap; align-items:center; justify-content:center; margin-bottom:14px; }
  .dn-pill{ flex:0 0 auto; padding:7px 13px; border-radius:999px; font-size:12.5px; font-weight:600; color:var(--ink-dim);
    background:var(--panel); border:1px solid var(--line); transition:all .18s var(--ease); }
  .dn-pill.on{ color:#05070f; background:linear-gradient(135deg,var(--cyan),var(--violet)); border-color:transparent; box-shadow:var(--glow-v); }
  .dn-pg{ margin-left:auto; }
  .dn-pg.on{ color:#05070f; background:var(--gold); border-color:transparent; box-shadow:0 0 14px -3px var(--gold); }

  /* slot machine */
  .dn-machine{ position:relative; border-radius:22px; padding:14px; margin:0 auto;
    background:linear-gradient(180deg, rgba(20,26,48,.7), rgba(9,12,24,.7)); border:1px solid var(--glass-brd);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.07), 0 22px 50px -26px #000, 0 0 0 1px rgba(155,123,255,.08); }
  .dn-reel{ position:relative; height:108px; overflow:hidden; border-radius:14px; background:var(--bg-2); border:1px solid var(--line); }
  .dn-reel::before, .dn-reel::after{ content:''; position:absolute; left:0; right:0; height:34px; z-index:2; pointer-events:none; }
  .dn-reel::before{ top:0; background:linear-gradient(180deg, var(--bg-2), transparent); }
  .dn-reel::after{ bottom:0; background:linear-gradient(0deg, var(--bg-2), transparent); }
  .dn-winline{ position:absolute; left:8px; right:8px; top:50%; transform:translateY(-50%); height:108px; margin-top:-54px;
    border-top:2px solid rgba(255,214,107,.0); border-bottom:2px solid rgba(255,214,107,.0); z-index:3; pointer-events:none; transition:border-color .3s; }
  .dn-machine.landed .dn-winline{ border-color:rgba(255,214,107,.5); }
  .dn-strip{ will-change:transform; }
  .dn-row{ height:108px; display:flex; align-items:center; gap:13px; padding:0 16px; box-sizing:border-box;
    border-left:4px solid var(--accent,var(--violet)); }
  .dn-row .e{ font-size:30px; flex:0 0 auto; filter:drop-shadow(0 0 9px color-mix(in srgb,var(--accent,var(--violet)) 55%,transparent)); }
  .dn-row .tx{ min-width:0; }
  .dn-row .ti{ font-family:var(--font-ui); font-weight:700; font-size:16px; line-height:1.15; }
  .dn-row .cl{ font-size:11px; color:var(--ink-faint); margin-top:3px; letter-spacing:.4px; }
  .dn-row .cl b{ color:var(--accent,var(--violet)); font-weight:700; }

  .dn-spin{ width:100%; margin:14px 0 0; padding:16px; border-radius:14px; border:none;
    font-family:var(--font-display); font-weight:800; font-size:16px; letter-spacing:1.5px; color:#fff;
    background:linear-gradient(135deg,var(--violet),var(--magenta)); background-size:170% 170%; box-shadow:0 14px 30px -12px rgba(255,77,157,.7);
    transition:transform .12s var(--ease), filter .2s; animation:btnFlow 7s ease infinite; }
  .dn-spin:active{ transform:scale(.97); } .dn-spin:disabled{ filter:grayscale(.4) brightness(.8); }
  .dn-spin .di{ display:inline-block; margin-right:9px; }
  .dn-machine.spinning .dn-spin .di{ animation:spin .5s linear infinite; }

  /* result card */
  .dn-result{ margin-top:16px; border-radius:18px; padding:18px; position:relative; overflow:hidden;
    background:var(--panel); backdrop-filter:var(--blur); border:1px solid color-mix(in srgb,var(--accent,var(--violet)) 30%,var(--glass-brd));
    box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 0 0 1px color-mix(in srgb,var(--accent,var(--violet)) 14%,transparent), 0 16px 40px -22px color-mix(in srgb,var(--accent,var(--violet)) 55%,#000);
    animation:floatUp .4s var(--ease) both; }
  .dn-result::before{ content:''; position:absolute; left:18px; right:18px; top:0; height:2px; border-radius:2px;
    background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--accent,var(--violet)) 85%,transparent),transparent); box-shadow:0 0 12px color-mix(in srgb,var(--accent,var(--violet)) 70%,transparent); }
  .dn-badges{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
  .dn-cat{ display:inline-flex; align-items:center; gap:6px; padding:5px 11px; border-radius:999px; font-size:12px; font-weight:700;
    color:var(--accent,var(--violet)); background:color-mix(in srgb,var(--accent,var(--violet)) 14%,transparent); border:1px solid color-mix(in srgb,var(--accent,var(--violet)) 36%,transparent); }
  .dn-tag{ display:inline-flex; align-items:center; gap:5px; padding:5px 11px; border-radius:999px; font-size:12px; font-weight:600; color:var(--ink-dim); background:var(--bg-2); border:1px solid var(--line); }
  .dn-result h3{ font-family:var(--font-display); font-weight:800; font-size:20px; margin:4px 0 8px; letter-spacing:.4px; }
  .dn-result .desc{ color:var(--ink-dim); font-size:14.5px; line-height:1.5; margin:0 0 14px; }
  .dn-need{ display:flex; align-items:flex-start; gap:9px; font-size:13px; color:var(--ink); background:var(--bg-2); border:1px solid var(--line); border-radius:12px; padding:11px 13px; margin-bottom:16px; }
  .dn-need .nk{ color:var(--ink-faint); font-weight:700; text-transform:uppercase; letter-spacing:.5px; font-size:10.5px; margin-right:2px; }
  .dn-need b{ font-weight:600; }
  .dn-actions{ display:grid; grid-template-columns:1fr 1fr; gap:9px; }
  .dn-actions .dn-again{ grid-column:1 / -1; }
  .dn-act{ display:flex; align-items:center; justify-content:center; gap:8px; padding:12px; border-radius:12px; font-family:var(--font-ui); font-weight:600; font-size:14px;
    background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink); transition:transform .12s var(--ease), border-color .2s, color .2s, box-shadow .2s; }
  .dn-act:active{ transform:scale(.95); }
  .dn-again{ background:linear-gradient(135deg,var(--violet),var(--magenta)); border-color:transparent; color:#fff; box-shadow:0 10px 24px -12px rgba(255,77,157,.7); }
  .dn-act.dn-save.on{ color:var(--magenta); border-color:var(--magenta); box-shadow:0 0 14px -5px var(--magenta); }
  .dn-act.dn-done.on{ color:var(--lime); border-color:var(--lime); box-shadow:0 0 14px -5px var(--lime); }
  .dn-act.dn-remove{ color:var(--ink-faint); }
  .dn-act.dn-remove:active{ color:var(--gold); }
  .dn-placeholder{ margin-top:16px; text-align:center; color:var(--ink-faint); font-size:14px; padding:24px 18px; border-radius:16px; border:1px dashed var(--line); }

  .dn-stats{ display:flex; gap:6px; flex-wrap:wrap; justify-content:center; margin:18px 0 10px; font-size:12px; color:var(--ink-faint); }
  .dn-stats b{ font-family:var(--font-num); color:var(--ink-dim); }
  .dn-listbtns{ display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
  .dn-lb{ padding:9px 14px; border-radius:11px; font-size:13px; font-weight:600; color:var(--ink-dim); background:var(--panel); border:1px solid var(--line); }
  .dn-lb.on{ color:var(--ink); border-color:var(--violet); box-shadow:var(--glow-v); }
  .dn-panel{ margin-top:12px; }
  .dn-li{ display:flex; align-items:center; gap:11px; padding:11px 13px; border-radius:12px; margin-bottom:8px;
    background:var(--panel); border:1px solid var(--line); animation:floatUp .3s var(--ease) both; }
  .dn-li .e{ font-size:20px; flex:0 0 auto; }
  .dn-li .nm{ flex:1; min-width:0; font-weight:600; font-size:14px; }
  .dn-li .nm small{ display:block; color:var(--ink-faint); font-weight:400; font-size:11.5px; margin-top:2px; }
  .dn-li button{ flex:0 0 auto; width:34px; height:34px; border-radius:10px; background:var(--bg-2); border:1px solid var(--line); color:var(--ink-dim); font-size:15px; transition:transform .12s, color .2s, border-color .2s; }
  .dn-li button:active{ transform:scale(.85); }
  .dn-li .un{ color:var(--magenta); } .dn-li .restore{ color:var(--lime); }
  .dn-empty{ text-align:center; color:var(--ink-faint); font-size:13.5px; padding:20px; }

  /* "Until we're together" — reunion countdown card (foot of the Dates page).
     Explicit flex column so children ALWAYS stack vertically & centred. */
  .mc{ position:relative; max-width:520px; margin:30px auto 6px; border-radius:22px; padding:26px 20px 22px; overflow:hidden;
    display:flex; flex-direction:column; align-items:center; text-align:center;
    background:radial-gradient(130% 100% at 50% -10%, rgba(155,123,255,.16), transparent 62%), linear-gradient(180deg, rgba(20,26,48,.7), rgba(9,12,24,.62));
    border:1px solid var(--glass-brd);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 22px 52px -26px #000, 0 0 0 1px rgba(155,123,255,.08); }
  .mc::before{ content:''; position:absolute; left:50%; top:0; transform:translateX(-50%); width:60%; height:2px; border-radius:2px;
    background:linear-gradient(90deg,transparent,var(--violet),var(--magenta),transparent); box-shadow:0 0 14px rgba(155,123,255,.7); }
  .mc-eyebrow{ font-family:var(--font-display); font-weight:700; font-size:10.5px; letter-spacing:3.5px; text-transform:uppercase; color:var(--ink-faint); margin:0; }
  .mc-big{ font-family:var(--font-display); font-weight:900; font-size:clamp(58px,21vw,90px); line-height:.9; letter-spacing:1px; margin:12px 0 0;
    background:linear-gradient(100deg,var(--cyan),var(--violet) 52%,var(--magenta)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent;
    filter:drop-shadow(0 0 22px rgba(155,123,255,.45)); }
  .mc-sub{ font-family:var(--font-display); font-weight:700; font-size:11px; letter-spacing:3px; text-transform:uppercase; color:var(--ink-dim); margin:4px 0 0; }
  .mc-clock{ display:flex; justify-content:center; gap:9px; margin:18px 0 0; }
  .mc-seg{ display:flex; flex-direction:column; align-items:center; gap:4px; min-width:60px; padding:10px 6px 8px; border-radius:13px;
    background:var(--bg-2); border:1px solid var(--line); }
  .mc-seg-n{ font-family:var(--font-num); font-weight:800; font-size:23px; line-height:1; color:var(--ink); font-variant-numeric:tabular-nums; }
  .mc-seg-l{ font-size:9px; letter-spacing:1.5px; font-weight:700; color:var(--ink-faint); }
  .mc-foot{ display:flex; align-items:center; gap:7px; margin:18px 0 0; font-size:12.5px; color:var(--ink-dim); }
  .mc-foot .e{ filter:drop-shadow(0 0 6px var(--magenta)); }
  .mc-edit{ position:absolute; top:13px; right:13px; width:30px; height:30px; display:grid; place-items:center; z-index:2;
    border-radius:9px; background:rgba(255,255,255,.05); border:1px solid var(--line); color:var(--ink-faint); font-size:13px; transition:.18s; }
  .mc-edit:active{ color:var(--violet); border-color:var(--violet); transform:scale(.9); }
  .mc-cta{ margin:18px 0 2px; padding:13px 22px; border-radius:13px; border:none;
    font-family:var(--font-display); font-weight:800; letter-spacing:.6px; font-size:14px; color:#fff;
    background:linear-gradient(135deg,var(--violet),var(--magenta)); box-shadow:0 12px 28px -12px rgba(255,77,157,.7); transition:transform .12s var(--ease); }
  .mc-cta:active{ transform:scale(.97); }
  /* celebration takeover at zero */
  .mc.celebrate{ border-color:color-mix(in srgb,var(--gold) 42%,var(--glass-brd));
    background:radial-gradient(130% 100% at 50% -10%, rgba(255,214,107,.18), transparent 62%), linear-gradient(180deg, rgba(40,34,30,.6), rgba(12,10,18,.62)); }
  .mc.celebrate::before{ background:linear-gradient(90deg,transparent,var(--gold),var(--magenta),transparent); }
  .mc-party{ font-size:48px; margin:2px 0 8px; animation:floatUp .5s var(--ease) both; }
  .mc-cele-h{ font-family:var(--font-display); font-weight:900; font-size:clamp(20px,6.4vw,28px); letter-spacing:.6px; margin:0 0 6px; text-wrap:balance;
    background:linear-gradient(90deg,var(--gold),var(--magenta),var(--gold)); -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent; }
  .mc-cele-sub{ color:var(--ink-dim); font-size:13.5px; margin:0; }
  /* inline date editor */
  .mc-editor{ width:100%; display:flex; flex-direction:column; gap:12px; text-align:left; margin-top:6px; }
  .mc-field label{ display:block; font-size:10.5px; letter-spacing:.5px; text-transform:uppercase; color:var(--ink-faint); margin:0 0 5px; font-weight:700; }
  .mc-field input{ width:100%; box-sizing:border-box; padding:11px 12px; border-radius:10px; background:var(--bg-2); border:1px solid var(--line); color:var(--ink); font-family:var(--font-ui); font-size:14px; }
  .mc-erow{ display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-top:2px; }
  .mc-erow button{ padding:11px; border-radius:10px; font-weight:700; font-size:13.5px; transition:transform .12s var(--ease); }
  .mc-erow button:active{ transform:scale(.96); }
  .mc-save{ background:linear-gradient(135deg,var(--violet),var(--magenta)); border:none; color:#fff; box-shadow:0 10px 24px -14px rgba(255,77,157,.7); }
  .mc-cancel{ background:var(--panel-2); border:1px solid var(--glass-brd); color:var(--ink-dim); }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  // ---- persisted (synced) lists ----
  const lists = () => { const s = (Store.get().dateNight) || {}; return { done: s.done || [], removed: s.removed || [], faved: s.faved || [] }; };
  const has = (arr, id) => arr.indexOf(id) >= 0;
  const ideaById = id => D.ideas.find(x => x.id === id);

  // ---- module UI state ----
  let filterCat = 'all', filterLen = 'any';
  let pgMode = localStorage.getItem('dn_pg') === '1';
  let current = null, spinning = false, spinT = null, listView = null;
  let dnUnsub = null;

  function poolFor(spinMode) {
    const L = lists();
    let pool = D.ideas.filter(x => !has(L.removed, x.id));
    if (filterCat !== 'all') pool = pool.filter(x => x.cat === filterCat);
    else if (pgMode) pool = pool.filter(x => x.cat !== 'spicy');
    if (filterLen !== 'any') pool = pool.filter(x => x.len === filterLen);
    if (spinMode) { const fresh = pool.filter(x => !has(L.done, x.id)); if (fresh.length) return fresh; }
    return pool;
  }

  // ---- elements (set per render) ----
  let elMachine, elStrip, elReel, elResult, elStats, elPanel, elListBtns, elSpin;

  function renderDateNight() {
    if (dnUnsub) { dnUnsub(); dnUnsub = null; }
    const view = document.getElementById('view'); view.innerHTML = '';
    current = null; spinning = false; listView = null;

    const wrap = h('div', { class: 'dn' });
    wrap.append(h('div', { class: 'dn-head' },
      h('h2', {}, 'DATE NIGHT ROULETTE'),
      h('p', {}, 'Spin for a way to spend an evening together — miles apart.')));

    // category filter
    const catChips = h('div', { class: 'dn-filters' });
    const addCat = (key, label) => catChips.append(h('button', {
      class: 'dn-pill' + (filterCat === key ? ' on' : ''),
      onclick: () => { filterCat = key; Store.Sound.tap(); renderDateNight(); },
    }, label));
    addCat('all', '✨ All');
    Object.keys(D.cats).forEach(k => addCat(k, `${D.cats[k].emoji} ${D.cats[k].name}`));
    wrap.append(catChips);

    // length filter + PG toggle
    const lenRow = h('div', { class: 'dn-len' });
    const addLen = (key, label) => lenRow.append(h('button', {
      class: 'dn-pill' + (filterLen === key ? ' on' : ''),
      onclick: () => { filterLen = key; Store.Sound.tap(); renderDateNight(); },
    }, label));
    addLen('any', 'Any length');
    Object.keys(D.lens).forEach(k => addLen(k, `${D.lens[k].emoji} ${D.lens[k].label}`));
    lenRow.append(h('button', {
      class: 'dn-pill dn-pg' + (pgMode ? ' on' : ''),
      title: 'Hide After Dark from “All” spins',
      onclick: () => { pgMode = !pgMode; localStorage.setItem('dn_pg', pgMode ? '1' : '0'); Store.Sound.tap(); renderDateNight(); },
    }, pgMode ? '🙈 PG on' : '🙈 PG off'));
    wrap.append(lenRow);

    // machine
    elReel = h('div', { class: 'dn-reel' });
    elStrip = h('div', { class: 'dn-strip' });
    elReel.append(elStrip, h('div', { class: 'dn-winline' }));
    elSpin = h('button', { class: 'dn-spin', onclick: spin }, h('span', { class: 'di' }, '🎰'), 'SPIN');
    elMachine = h('div', { class: 'dn-machine' }, elReel, elSpin);
    // a teaser row at rest
    elStrip.append(reelRow(poolFor(false)[0] || D.ideas[0]));
    wrap.append(elMachine);

    // result / placeholder
    elResult = h('div', {});
    elResult.append(h('div', { class: 'dn-placeholder' }, 'Hit SPIN to land on tonight’s date 🎲'));
    wrap.append(elResult);

    // stats + lists
    elStats = h('div', { class: 'dn-stats' });
    elListBtns = h('div', { class: 'dn-listbtns' });
    elPanel = h('div', { class: 'dn-panel' });
    wrap.append(elStats, elListBtns, elPanel);

    // reunion countdown — at the very foot of the page, below everything
    wrap.append(renderMeetCard());

    view.append(wrap);
    updateMeta();

    // live-refresh the shared lists/stats + countdown when your partner changes something
    dnUnsub = Store.subscribe(() => {
      if (!(location.hash || '').startsWith('#/date')) return;
      updateMeta();
      if (!meetEditing) paintMeet();
    });
  }

  function reelRow(idea) {
    const c = D.cats[idea.cat], l = D.lens[idea.len];
    const row = h('div', { class: 'dn-row', style: `--accent:${c.color}` },
      h('span', { class: 'e' }, c.emoji),
      h('div', { class: 'tx' },
        h('div', { class: 'ti' }, idea.t),
        h('div', { class: 'cl' }, h('b', {}, c.name), ' · ', l.emoji + ' ' + l.label)));
    return row;
  }

  function spin() {
    if (spinning) return;
    const pool = poolFor(true);
    if (!pool.length) {
      elResult.innerHTML = '';
      elResult.append(h('div', { class: 'dn-placeholder' },
        filterCat === 'all' && filterLen === 'any'
          ? 'You’ve removed everything 😅 — restore some from the lists below.'
          : 'Nothing here with those filters — loosen them and spin again.'));
      Store.Sound.bad(); return;
    }
    spinning = true; current = null;
    elMachine.classList.add('spinning'); elMachine.classList.remove('landed');
    elSpin.disabled = true;
    const chosen = pool[rint(pool.length)];

    const N = 18, rows = [];
    for (let i = 0; i < N - 1; i++) rows.push(pool.length > 1 ? pool[rint(pool.length)] : chosen);
    rows.push(chosen);
    elStrip.innerHTML = '';
    rows.forEach(r => elStrip.append(reelRow(r)));
    const ROW = (elStrip.firstChild && elStrip.firstChild.offsetHeight) || 108;

    elStrip.style.transition = 'none';
    elStrip.style.transform = 'translateY(0)';
    void elStrip.offsetHeight; // reflow
    elStrip.style.transition = 'transform 1.75s cubic-bezier(.12,.78,.12,1)';
    elStrip.style.transform = `translateY(${-(rows.length - 1) * ROW}px)`;

    // decelerating ticks
    [0, 110, 235, 375, 535, 720, 940, 1200, 1480, 1680].forEach(t => setTimeout(() => { if (spinning) Store.Sound.tap(); }, t));

    clearTimeout(spinT);
    spinT = setTimeout(() => {
      spinning = false; current = chosen;
      elMachine.classList.remove('spinning'); elMachine.classList.add('landed');
      elSpin.disabled = false;
      Store.Sound.win();
      showResult(chosen);
      updateMeta();
    }, 1800);
  }

  function showResult(idea) {
    const c = D.cats[idea.cat], l = D.lens[idea.len], L = lists();
    const card = h('div', { class: 'dn-result', style: `--accent:${c.color}` });
    card.append(h('div', { class: 'dn-badges' },
      h('span', { class: 'dn-cat' }, c.emoji + ' ' + c.name),
      h('span', { class: 'dn-tag' }, l.emoji + ' ' + l.label)));
    card.append(h('h3', {}, idea.t));
    card.append(h('p', { class: 'desc' }, idea.d));
    card.append(h('div', { class: 'dn-need' }, h('span', { class: 'nk' }, 'You’ll need'), h('b', {}, idea.n)));

    const saveBtn = h('button', { class: 'dn-act dn-save' + (has(L.faved, idea.id) ? ' on' : '') });
    const doneBtn = h('button', { class: 'dn-act dn-done' + (has(L.done, idea.id) ? ' on' : '') });
    const paintToggle = () => {
      const LL = lists();
      saveBtn.innerHTML = ''; saveBtn.append(document.createTextNode((has(LL.faved, idea.id) ? '♥ Saved' : '♡ Save')));
      saveBtn.classList.toggle('on', has(LL.faved, idea.id));
      doneBtn.innerHTML = ''; doneBtn.append(document.createTextNode((has(LL.done, idea.id) ? '✓ Done' : '○ Mark done')));
      doneBtn.classList.toggle('on', has(LL.done, idea.id));
    };
    saveBtn.onclick = () => { Store.dateToggle('faved', idea.id); Store.Sound.tap(); paintToggle(); updateMeta(); };
    doneBtn.onclick = () => { const was = has(lists().done, idea.id); Store.dateToggle('done', idea.id); was ? Store.Sound.tap() : Store.Sound.good(); paintToggle(); updateMeta(); };
    paintToggle();

    const removeBtn = h('button', { class: 'dn-act dn-remove', onclick: () => {
      Store.dateToggle('removed', idea.id); Store.Sound.bad();
      if (typeof showToast === 'function') showToast(`Removed “${esc(idea.t)}” — find it in ✕ Removed to restore.`);
      spin();
    } }, '✕ Remove');

    const againBtn = h('button', { class: 'dn-act dn-again', onclick: spin }, '🎲 Spin again');

    card.append(h('div', { class: 'dn-actions' }, againBtn, saveBtn, doneBtn, removeBtn));
    elResult.innerHTML = ''; elResult.append(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function updateMeta() {
    if (!elStats) return;
    const L = lists();
    const inPool = D.ideas.length - L.removed.length;
    elStats.innerHTML = '';
    elStats.append(
      h('span', {}, h('b', {}, String(inPool)), ' ideas in the pool'),
      h('span', {}, '· ✓ ', h('b', {}, String(L.done.length)), ' done'),
      h('span', {}, '· ♥ ', h('b', {}, String(L.faved.length)), ' saved'),
      h('span', {}, '· ✕ ', h('b', {}, String(L.removed.length)), ' removed'));

    elListBtns.innerHTML = '';
    const lb = (key, label) => h('button', { class: 'dn-lb' + (listView === key ? ' on' : ''),
      onclick: () => { listView = (listView === key ? null : key); Store.Sound.tap(); updateMeta(); } }, label);
    elListBtns.append(lb('faved', `♥ Saved (${L.faved.length})`), lb('done', `✓ Done (${L.done.length})`), lb('removed', `✕ Removed (${L.removed.length})`));

    renderPanel();
  }

  function renderPanel() {
    elPanel.innerHTML = '';
    if (!listView) return;
    const L = lists();
    const ids = L[listView] || [];
    if (!ids.length) {
      elPanel.append(h('div', { class: 'dn-empty' }, listView === 'faved' ? 'No saved dates yet — tap ♡ Save on one you love.'
        : listView === 'done' ? 'Nothing marked done yet. Go make a memory 💞'
        : 'Nothing removed. Spin away!'));
      return;
    }
    ids.slice().reverse().forEach(id => {
      const idea = ideaById(id); if (!idea) return;
      const c = D.cats[idea.cat], l = D.lens[idea.len];
      const li = h('div', { class: 'dn-li', style: `--accent:${c.color}` },
        h('span', { class: 'e' }, c.emoji),
        h('div', { class: 'nm' }, idea.t, h('small', {}, `${c.name} · ${l.emoji} ${l.label}`)));
      if (listView === 'removed') {
        li.append(h('button', { class: 'restore', title: 'Restore to the pool', onclick: () => { Store.dateToggle('removed', id); Store.Sound.good(); updateMeta(); } }, '↩'));
      } else if (listView === 'faved') {
        li.append(h('button', { class: 'un', title: 'Remove from saved', onclick: () => { Store.dateToggle('faved', id); Store.Sound.tap(); updateMeta(); } }, '♥'));
      } else { // done
        li.append(h('button', { title: 'Unmark done', onclick: () => { Store.dateToggle('done', id); Store.Sound.tap(); updateMeta(); } }, '✓'));
      }
      elPanel.append(li);
    });
  }

  /* ===================== "US, IN DAYS" REUNION COUNTDOWN =====================
     One compact card: big day count + live hh:mm:ss to the next meet, a quiet
     "apart for N days" subline, and a celebration takeover when the day arrives.
     Both phones share one { nextAt, lastMetAt } via Store.setMeet (synced).      */
  const DAY = 86400000;
  const pad2 = n => String(n).padStart(2, '0');
  const meetNow = () => (Store.Net && Store.Net.serverNow ? Store.Net.serverNow() : Date.now());
  const meetData = () => Object.assign({ nextAt: null, lastMetAt: null }, Store.get().meet || {});
  const ymd = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const fromInput = v => { if (!v) return null; const t = new Date(v + 'T00:00:00').getTime(); return isNaN(t) ? null : t; };
  let elMeet = null, meetTick = null, meetEditing = false;

  function renderMeetCard() {
    if (meetTick) { clearInterval(meetTick); meetTick = null; }
    meetEditing = false;
    elMeet = h('div', { class: 'mc' });
    paintMeet();
    meetTick = setInterval(() => {
      if (!(location.hash || '').startsWith('#/date')) { clearInterval(meetTick); meetTick = null; return; }
      if (!meetEditing) paintMeet();
    }, 1000);
    return elMeet;
  }

  const meetSeg = (n, l) => h('div', { class: 'mc-seg' }, h('div', { class: 'mc-seg-n' }, n), h('div', { class: 'mc-seg-l' }, l));
  const meetPencil = () => h('button', { class: 'mc-edit', title: 'Set our dates', onclick: openMeetEditor }, '✎');

  function paintMeet() {
    if (!elMeet) return;
    const m = meetData(), now = meetNow();
    const apart = m.lastMetAt != null ? Math.max(0, Math.floor((now - m.lastMetAt) / DAY)) : null;
    elMeet.classList.remove('celebrate');
    elMeet.innerHTML = '';

    // meet day has arrived → celebration takeover (stays until they tap "we're together")
    if (m.nextAt != null && now >= m.nextAt) {
      elMeet.classList.add('celebrate');
      elMeet.append(
        meetPencil(),
        h('div', { class: 'mc-party' }, '🎉'),
        h('h3', { class: 'mc-cele-h' }, 'TODAY — WE’RE TOGETHER 💞'),
        h('p', { class: 'mc-cele-sub' }, apart != null ? `after ${apart} ${apart === 1 ? 'day' : 'days'} apart` : 'the wait is over'),
        h('button', { class: 'mc-cta', onclick: meetReunited }, 'We’re together 💞'));
      return;
    }

    // counting down to a set reunion date
    if (m.nextAt != null) {
      const rem = m.nextAt - now, days = Math.floor(rem / DAY), r = rem - days * DAY;
      const hh = Math.floor(r / 3600000), mm = Math.floor((r % 3600000) / 60000), ss = Math.floor((r % 60000) / 1000);
      elMeet.append(
        meetPencil(),
        h('p', { class: 'mc-eyebrow' }, 'until we’re together'),
        h('div', { class: 'mc-big' }, String(days)),
        h('p', { class: 'mc-sub' }, days === 1 ? 'day to go' : 'days to go'),
        h('div', { class: 'mc-clock' }, meetSeg(pad2(hh), 'HRS'), meetSeg(pad2(mm), 'MIN'), meetSeg(pad2(ss), 'SEC')));
      if (apart != null) elMeet.append(h('div', { class: 'mc-foot' }, h('span', { class: 'e' }, '💞'), h('span', {}, `apart for ${apart} ${apart === 1 ? 'day' : 'days'}`)));
      return;
    }

    // no reunion date set → show the apart-counter (if we know it) + a prompt to set the date
    elMeet.append(meetPencil(), h('p', { class: 'mc-eyebrow' }, apart != null ? 'us, apart' : 'us, in days'));
    if (apart != null) {
      elMeet.append(h('div', { class: 'mc-big' }, String(apart)), h('p', { class: 'mc-sub' }, apart === 1 ? 'day apart' : 'days apart'));
    } else {
      elMeet.append(h('p', { class: 'mc-cele-sub', style: 'margin-top:12px' }, 'When’s the next time you’ll be in the same place?'));
    }
    elMeet.append(h('button', { class: 'mc-cta', onclick: openMeetEditor }, 'Set the day we meet →'));
  }

  function meetReunited() {
    Store.Sound.win();
    Store.setMeet({ lastMetAt: meetNow(), nextAt: null }); // today becomes "last met"; clear the countdown
    paintMeet();
  }

  function openMeetEditor() {
    if (!elMeet) return;
    meetEditing = true;
    const m = meetData();
    elMeet.classList.remove('celebrate');
    elMeet.innerHTML = '';
    const nextInp = h('input', { type: 'date', value: m.nextAt != null ? ymd(m.nextAt) : '' });
    const lastInp = h('input', { type: 'date', value: m.lastMetAt != null ? ymd(m.lastMetAt) : '', max: ymd(meetNow()) });
    elMeet.append(
      h('p', { class: 'mc-eyebrow' }, 'OUR DATES'),
      h('div', { class: 'mc-editor' },
        h('div', { class: 'mc-field' }, h('label', {}, 'The day we meet 💞'), nextInp),
        h('div', { class: 'mc-field' }, h('label', {}, 'Last time we were together'), lastInp),
        h('div', { class: 'mc-erow' },
          h('button', { class: 'mc-cancel', onclick: () => { meetEditing = false; Store.Sound.tap(); paintMeet(); } }, 'Cancel'),
          h('button', { class: 'mc-save', onclick: () => {
            Store.setMeet({ nextAt: fromInput(nextInp.value), lastMetAt: fromInput(lastInp.value) });
            meetEditing = false; Store.Sound.good(); paintMeet();
          } }, 'Save'))));
  }

  window.renderDateNight = renderDateNight;
})();
