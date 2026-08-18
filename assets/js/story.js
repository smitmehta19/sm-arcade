/* ============================================================
   OUR STORY (route #/story, ♥ button in the topbar)
   "Days of Us" layout: hero day-count → countdown chips →
   swipeable place polaroids → the big dates → discreet cycle.

   One memory can carry BOTH a date and a place, because that's how
   memories actually work ("where we met" is a day AND a spot):
     moment = {emoji,title,date?,recur?,place?,lat?,lon?,note?}
   date → dates list + countdown · lat/lon → places strip · both → both.

   Maps: static OpenStreetMap tiles (no Leaflet, no API key, no build
   step) — a 2×2 tile grid offset so the pin lands dead centre.
   Search: Nominatim, fired only on an explicit tap (their usage
   policy asks for ≤1 req/sec — a couple tapping search can't breach it).
   Cycle: prediction = last start + rolling average of the last ≤6
   cycles (not a naive 28), with a ± window from real variability.
   ============================================================ */
(function () {
  const css = `
  .sy-head{ display:flex; align-items:center; justify-content:space-between; max-width:520px; margin:0 auto 6px; }
  .sy-head h2{ font-family:var(--font-display); font-size:15px; letter-spacing:1.5px; margin:0; }
  .sy-wrap{ max-width:520px; margin:0 auto; }
  /* hero */
  .sy-hero{ text-align:center; padding:14px 0 4px; }
  .sy-hero .n{ font-family:var(--font-num); font-weight:900; font-size:clamp(46px,17vw,68px); line-height:1;
    background:linear-gradient(90deg, var(--cyan), var(--violet) 55%, var(--magenta));
    -webkit-background-clip:text; background-clip:text; -webkit-text-fill-color:transparent; color:transparent;
    filter:drop-shadow(0 0 18px rgba(155,123,255,.35)); }
  .sy-hero .l{ font-family:var(--font-display); font-size:11px; letter-spacing:3px; color:var(--ink-dim); margin-top:7px; }
  .sy-hero .s{ font-size:11.5px; color:var(--ink-faint); margin-top:5px; }
  .sy-hero .w{ font-size:12px; color:var(--gold); margin-top:6px; }
  /* countdown chips */
  .sy-chips{ display:flex; gap:8px; overflow-x:auto; padding:10px 2px 12px; scrollbar-width:none; justify-content:flex-start; }
  .sy-chips::-webkit-scrollbar{ display:none; }
  .sy-chip{ flex:0 0 auto; padding:9px 13px; border-radius:13px; background:var(--panel); border:1px solid var(--line);
    font-size:12px; color:var(--ink-dim); text-align:left; transition:transform .12s var(--ease), border-color .2s; }
  .sy-chip:active{ transform:scale(.94); }
  .sy-chip b{ display:block; font-family:var(--font-num); font-size:15px; color:var(--ink); margin-top:2px; }
  .sy-chip.hot{ border-color:var(--magenta); box-shadow:0 0 14px -6px var(--magenta); }
  .sy-chip.add{ display:grid; place-items:center; min-width:46px; font-size:20px; color:var(--ink-faint); }
  /* places strip */
  .sy-strip{ display:flex; gap:12px; overflow-x:auto; padding:6px 2px 14px; scrollbar-width:none; }
  .sy-strip::-webkit-scrollbar{ display:none; }
  .sy-pol{ flex:0 0 205px; background:var(--panel-2); border:1px solid var(--glass-brd); border-radius:15px;
    padding:9px 9px 11px; box-shadow:var(--shadow-soft); transform:rotate(-1.3deg);
    transition:transform .15s var(--ease), box-shadow .25s; text-align:left; color:inherit; }
  .sy-pol:nth-child(2n){ transform:rotate(1.2deg); }
  .sy-pol:active{ transform:scale(.96); }
  .sy-pol .cap{ margin-top:8px; padding:0 3px; }
  .sy-pol .cap b{ display:block; font-size:13.5px; }
  .sy-pol .cap span{ display:block; color:var(--ink-dim); font-size:11.5px; margin-top:2px; }
  .sy-pol .cap i{ display:block; color:var(--ink-faint); font-size:11px; font-style:italic; margin-top:3px; }
  .sy-pol.add{ display:grid; place-items:center; flex:0 0 120px; color:var(--ink-faint); font-size:13px; transform:none; }
  .sy-pol.add .plus{ font-size:26px; margin-bottom:4px; }
  /* mini map */
  .sy-map{ position:relative; height:96px; border-radius:11px; overflow:hidden; border:1px solid var(--glass-brd); background:#0b1020; }
  .sy-map .in{ position:absolute; width:512px; height:512px; }
  .sy-map .in img{ position:absolute; width:256px; height:256px;
    filter:invert(1) hue-rotate(185deg) brightness(.72) saturate(.75) contrast(1.05); }
  .sy-map .pin{ position:absolute; left:50%; top:50%; transform:translate(-50%,-88%); font-size:21px; z-index:3;
    filter:drop-shadow(0 0 8px var(--magenta)); pointer-events:none; }
  .sy-map .att{ position:absolute; right:4px; bottom:2px; z-index:3; font-size:7.5px; color:rgba(255,255,255,.5); }
  .sy-map.noloc{ display:grid; place-items:center; color:var(--ink-faint); font-size:11.5px; }
  /* dates list */
  .sy-row{ display:flex; align-items:center; gap:11px; padding:11px 13px; border-radius:13px; background:var(--panel);
    border:1px solid var(--line); margin-bottom:8px; width:100%; text-align:left; color:inherit;
    transition:transform .12s var(--ease), border-color .2s; }
  .sy-row:active{ transform:scale(.985); }
  .sy-row .em{ font-size:19px; flex:0 0 auto; }
  .sy-row .tx{ flex:1; min-width:0; font-size:13.5px; }
  .sy-row .tx small{ display:block; color:var(--ink-faint); font-size:11px; margin-top:2px; }
  .sy-row .cd{ flex:0 0 auto; font-family:var(--font-num); font-weight:800; color:var(--p1); font-size:13px; text-align:right; }
  .sy-row .cd small{ display:block; color:var(--ink-faint); font-weight:400; font-size:10px; font-family:var(--font-body); }
  .sy-row .cd.soon{ color:var(--magenta); }
  /* cycle */
  .sy-cyc{ margin-top:14px; border-radius:14px; background:var(--panel); border:1px solid var(--line); overflow:hidden; }
  .sy-cyc-line{ display:flex; align-items:center; gap:10px; padding:13px 15px; width:100%; text-align:left;
    color:var(--ink-dim); font-size:13.5px; background:none; border:none; }
  .sy-cyc-line b{ color:var(--ink); } .sy-cyc-line .ex{ margin-left:auto; color:var(--ink-faint); font-size:12px; }
  .sy-cyc-body{ padding:0 15px 15px; }
  .sy-cyc-pred{ text-align:center; padding:12px; border-radius:12px; background:var(--bg-2); margin-bottom:12px; }
  .sy-cyc-pred .d{ font-family:var(--font-num); font-weight:900; font-size:22px; color:var(--gold); }
  .sy-cyc-pred .w{ font-size:11.5px; color:var(--ink-faint); margin-top:3px; }
  .sy-bar{ height:9px; border-radius:99px; background:var(--bg-2); overflow:hidden; margin-bottom:10px; }
  .sy-bar i{ display:block; height:100%; background:linear-gradient(90deg, var(--violet), var(--magenta)); transition:width .5s var(--ease); }
  .sy-stats{ display:flex; gap:7px; flex-wrap:wrap; font-size:11px; color:var(--ink-faint); margin-bottom:12px; }
  .sy-stats span{ background:var(--bg-2); padding:5px 9px; border-radius:99px; }
  .sy-log{ display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .sy-log input[type=date]{ background:var(--bg-2); border:1px solid var(--line); border-radius:10px; padding:9px 10px;
    color:var(--ink); font-family:inherit; font-size:13.5px; color-scheme:dark; outline:none; }
  .sy-hist{ display:flex; gap:6px; flex-wrap:wrap; margin-top:11px; }
  .sy-hist span{ font-size:11px; color:var(--ink-dim); background:var(--bg-2); border:1px solid var(--line);
    padding:5px 9px; border-radius:99px; }
  .sy-hist span b{ color:var(--ink-faint); margin-left:5px; }
  .sy-note{ font-size:11px; color:var(--ink-faint); line-height:1.5; margin-top:10px; }
  /* empty state */
  .sy-empty{ text-align:center; padding:26px 18px; border-radius:var(--radius); background:var(--panel);
    border:1px dashed var(--glass-brd); }
  .sy-empty .e{ font-size:40px; } .sy-empty h3{ font-family:var(--font-display); font-size:14px; margin:12px 0 6px; }
  .sy-empty p{ color:var(--ink-dim); font-size:13px; margin:0 0 16px; }
  /* editor sheet */
  .sy-ov{ position:fixed; inset:0; z-index:140; display:grid; place-items:end center; padding:0;
    background:rgba(4,5,12,.74); backdrop-filter:blur(9px); animation:fadeIn .22s; }
  .sy-sheet{ width:100%; max-width:520px; max-height:92vh; overflow-y:auto; border-radius:22px 22px 0 0;
    background:var(--panel-2); backdrop-filter:var(--blur); border:1px solid var(--glass-brd);
    padding:18px 16px calc(20px + var(--safe-b)); animation:sheetUp .3s var(--ease) both; }
  @keyframes sheetUp{ from{ transform:translateY(60px); opacity:0; } to{ transform:none; opacity:1; } }
  .sy-sheet h3{ font-family:var(--font-display); font-size:13px; letter-spacing:1.5px; margin:0 0 14px; text-align:center; }
  .sy-presets{ display:flex; gap:7px; flex-wrap:wrap; margin-bottom:16px; }
  .sy-preset{ padding:9px 12px; border-radius:12px; background:var(--bg-2); border:1px solid var(--line);
    color:var(--ink-dim); font-size:12.5px; }
  .sy-preset:active{ transform:scale(.94); } .sy-preset.on{ border-color:var(--violet); color:var(--ink); box-shadow:var(--glow-v); }
  .sy-field{ margin-bottom:12px; }
  .sy-field label{ display:block; font-size:11.5px; color:var(--ink-dim); margin-bottom:6px; letter-spacing:.4px; }
  .sy-field input[type=text], .sy-field input[type=date]{ width:100%; box-sizing:border-box; background:var(--bg-2);
    border:1px solid var(--line); border-radius:12px; padding:12px 13px; color:var(--ink); font-family:inherit;
    font-size:14.5px; color-scheme:dark; outline:none; }
  .sy-field input:focus{ border-color:var(--violet); box-shadow:var(--glow-v); }
  .sy-emoji{ display:flex; gap:6px; flex-wrap:wrap; }
  .sy-emoji button{ width:38px; height:38px; border-radius:11px; background:var(--bg-2); border:1px solid var(--line); font-size:18px; }
  .sy-emoji button.on{ border-color:var(--violet); box-shadow:var(--glow-v); }
  .sy-inline{ display:flex; gap:8px; align-items:center; }
  .sy-inline input{ flex:1; }
  .sy-inline .btn-sm{ flex:0 0 auto; }
  .sy-results{ margin-top:8px; display:flex; flex-direction:column; gap:6px; }
  .sy-results button{ text-align:left; padding:10px 12px; border-radius:11px; background:var(--bg-2);
    border:1px solid var(--line); color:var(--ink); font-size:12.5px; line-height:1.4; }
  .sy-results button:active{ border-color:var(--violet); }
  .sy-chk{ display:flex; align-items:center; gap:9px; font-size:13.5px; color:var(--ink-dim); padding:4px 0 2px; }
  .sy-actions{ display:flex; gap:9px; margin-top:16px; }
  .sy-actions .btn{ flex:1; }
  .sy-del{ flex:0 0 auto !important; border-color:rgba(255,77,157,.4); color:var(--magenta); }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  /* ---------- date helpers (all local-midnight based) ---------- */
  const pad = n => String(n).padStart(2, '0');
  const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parse = s => new Date(s + 'T12:00:00');               // noon = never lands on the wrong day
  // Day number from the CALENDAR date via Date.UTC — using local timestamps here
  // drifts by one across a daylight-saving boundary (a 987-day count read 986).
  const dayNo = s => { const d = parse(s); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5; };
  const todayStr = () => dstr(new Date());
  const daysBetween = (a, b) => dayNo(b) - dayNo(a);
  const fmtDate = s => parse(s).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtShort = s => parse(s).toLocaleDateString([], { day: 'numeric', month: 'short' });
  const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

  // next yearly return of a date (today counts as 0 days away)
  function nextAnniversary(date) {
    const d = parse(date), now = new Date();
    let y = now.getFullYear();
    let next = new Date(y, d.getMonth(), d.getDate(), 12);
    if (daysBetween(todayStr(), dstr(next)) < 0) next = new Date(y + 1, d.getMonth(), d.getDate(), 12);
    return { date: dstr(next), days: daysBetween(todayStr(), dstr(next)), years: next.getFullYear() - d.getFullYear() };
  }

  /* ---------- cycle prediction ----------
     avg of the last ≤6 cycles (calendar method, as period apps do);
     ± window from the spread of those cycles. Needs 2 logs to predict. */
  function cycleStats(startsRaw) {
    const starts = (startsRaw || []).slice().sort();
    if (!starts.length) return null;
    const last = starts[starts.length - 1];
    const lens = [];
    for (let i = 1; i < starts.length; i++) lens.push(dayNo(starts[i]) - dayNo(starts[i - 1]));
    const clean = lens.filter(l => l >= 15 && l <= 60);        // ignore mis-logs
    const recent = clean.slice(-6);
    const avg = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 28;
    const spread = recent.length > 1 ? Math.max(...recent.map(l => Math.abs(l - avg))) : 0;
    const window = Math.min(7, Math.max(2, Math.round(spread)));
    const nextD = new Date(parse(last).getTime() + avg * 864e5);
    const next = dstr(nextD);
    return {
      last, avg, window, next,
      day: daysBetween(last, todayStr()) + 1,                  // day 1 = first day of period
      until: daysBetween(todayStr(), next),
      logged: starts.length,
      confident: recent.length >= 2,                           // 2+ measured cycles → real average
      starts,
    };
  }

  /* ---------- static OSM mini-map (no library, no key) ---------- */
  function tileXY(lat, lon, z) {
    const n = Math.pow(2, z), latR = lat * Math.PI / 180;
    return { x: (lon + 180) / 360 * n, y: (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n };
  }
  function miniMap(lat, lon, z) {
    z = z || 14;
    const T = 256, t = tileXY(lat, lon, z);
    const x0 = Math.round(t.x) - 1, y0 = Math.round(t.y) - 1;
    const px = (t.x - x0) * T, py = (t.y - y0) * T;
    const wrap = h('div', { class: 'sy-map' });
    const inner = h('div', { class: 'in' });
    inner.style.left = `calc(50% - ${px.toFixed(1)}px)`;
    inner.style.top = `calc(50% - ${py.toFixed(1)}px)`;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const img = h('img', { loading: 'lazy', alt: '', src: `https://tile.openstreetmap.org/${z}/${x0 + i}/${y0 + j}.png` });
      img.style.left = (i * T) + 'px'; img.style.top = (j * T) + 'px';
      inner.append(img);
    }
    wrap.append(inner, h('span', { class: 'pin' }, '📍'), h('span', { class: 'att' }, '© OpenStreetMap'));
    return wrap;
  }

  /* ---------- presets for the add sheet ---------- */
  const EMOJIS = ['💫', '💘', '💋', '👰', '💍', '🎂', '✈️', '🏡', '🌙', '🎓', '🐣', '✨'];
  function presets() {
    const p = Store.get().players;
    return [
      { emoji: '💫', title: 'Where we met', hero: true },
      { emoji: '💘', title: 'When we fell in love' },
      { emoji: '💋', title: 'Our first kiss' },
      { emoji: '👰', title: 'Our wedding' },
      { emoji: '💍', title: 'Anniversary', recur: true },
      { emoji: '🎂', title: `${p[0].name}’s birthday`, recur: true },
      { emoji: '🎂', title: `${p[1].name}’s birthday`, recur: true },
      { emoji: '✈️', title: 'Our first trip' },
      { emoji: '✨', title: '' },
    ];
  }

  let cycOpen = false;   // discreet by default on every visit

  window.renderStory = function renderStory() {
    const s = Store.get(); const root = $('#view'); root.innerHTML = '';
    const items = Array.isArray(s.story) ? s.story : [];
    const moments = items.filter(i => i.kind === 'moment');
    const periods = items.filter(i => i.kind === 'period');

    root.append(h('div', { class: 'sy-head' },
      h('h2', {}, '💞 OUR STORY'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => openEditor(null) }, '+ Add')));
    const wrap = h('div', { class: 'sy-wrap' }); root.append(wrap);

    if (!moments.length) {
      wrap.append(h('div', { class: 'sy-empty' },
        h('div', { class: 'e' }, '💞'),
        h('h3', {}, 'YOUR STORY STARTS HERE'),
        h('p', {}, 'Add the day you met, the place you fell in love, birthdays — anything worth remembering.'),
        h('button', { class: 'btn btn-primary', onclick: () => openEditor(null) }, '💫 Add your first memory')));
    } else {
      // ---- hero: days since the earliest dated past moment ----
      const dated = moments.filter(m => m.date).sort((a, b) => dayNo(a.date) - dayNo(b.date));
      const past = dated.filter(m => daysBetween(m.date, todayStr()) >= 0 && !m.recur);
      const origin = past[0] || dated[0];
      if (origin) {
        const n = Math.abs(daysBetween(origin.date, todayStr()));
        const hero = h('div', { class: 'sy-hero' },
          h('div', { class: 'n' }, String(n)),
          h('div', { class: 'l' }, 'DAYS OF US'),
          h('div', { class: 's' }, `since ${origin.place ? origin.place.split(',')[0] + ' · ' : ''}${fmtDate(origin.date)} ${origin.emoji}`));
        const wed = moments.find(m => /wedding/i.test(m.title) && m.date && daysBetween(todayStr(), m.date) > 0);
        if (wed) hero.append(h('div', { class: 'w' }, `👰 ${daysBetween(todayStr(), wed.date)} days to forever`));
        wrap.append(hero);
      }
      // ---- countdown chips ----
      const ups = [];
      moments.forEach(m => {
        if (!m.date) return;
        if (m.recur) { const a = nextAnniversary(m.date); ups.push({ m, days: a.days, label: a.years ? (/birthday/i.test(m.title) ? `turns ${a.years}` : ord(a.years)) : '' }); }
        else { const d = daysBetween(todayStr(), m.date); if (d >= 0) ups.push({ m, days: d, label: '' }); }
      });
      ups.sort((a, b) => a.days - b.days);
      const chips = h('div', { class: 'sy-chips' });
      ups.slice(0, 6).forEach(u => chips.append(h('button', { class: 'sy-chip' + (u.days <= 14 ? ' hot' : ''), onclick: () => openEditor(u.m) },
        `${u.m.emoji} ${u.m.title}${u.label ? ' · ' + u.label : ''}`,
        h('b', {}, u.days === 0 ? 'TODAY 🎉' : u.days === 1 ? 'tomorrow' : `in ${u.days} days`))));
      chips.append(h('button', { class: 'sy-chip add', onclick: () => openEditor(null) }, '＋'));
      if (ups.length) wrap.append(chips);

      // ---- places strip ----
      const placed = moments.filter(m => m.lat != null && m.lon != null);
      wrap.append(h('div', { class: 'sec-label' }, '📍 OUR PLACES'));
      const strip = h('div', { class: 'sy-strip' });
      placed.forEach(m => {
        const card = h('button', { class: 'sy-pol', onclick: () => openEditor(m) });
        card.append(miniMap(m.lat, m.lon));
        card.append(h('div', { class: 'cap' },
          h('b', {}, `${m.emoji} ${m.title}`),
          h('span', {}, m.place || ''),
          m.note ? h('i', {}, '“' + m.note + '”') : ''));
        strip.append(card);
      });
      strip.append(h('button', { class: 'sy-pol add', onclick: () => openEditor(null, { focusPlace: true }) },
        h('div', { class: 'plus' }, '＋'), h('div', {}, 'Add a place')));
      wrap.append(strip);

      // ---- the big dates ----
      wrap.append(h('div', { class: 'sec-label' }, '📅 THE BIG DATES'));
      const rows = moments.filter(m => m.date).sort((a, b) => {
        const av = a.recur ? nextAnniversary(a.date).days : Math.abs(daysBetween(todayStr(), a.date));
        const bv = b.recur ? nextAnniversary(b.date).days : Math.abs(daysBetween(todayStr(), b.date));
        return av - bv;
      });
      if (!rows.length) wrap.append(h('div', { class: 'empty-note', style: 'padding:16px' }, 'No dates yet — add one above.'));
      rows.forEach(m => {
        let cd, sub;
        if (m.recur) {
          const a = nextAnniversary(m.date);
          cd = a.days === 0 ? 'TODAY' : `${a.days}d`;
          sub = a.days === 0 ? '🎉' : 'to go';
        } else {
          const d = daysBetween(todayStr(), m.date);
          cd = d > 0 ? `${d}d` : `${Math.abs(d)}d`;
          sub = d > 0 ? 'to go' : 'ago';
        }
        const meta = [m.date ? fmtDate(m.date) : '', m.place ? m.place.split(',')[0] : ''].filter(Boolean).join(' · ');
        wrap.append(h('button', { class: 'sy-row', onclick: () => openEditor(m) },
          h('span', { class: 'em' }, m.emoji),
          h('span', { class: 'tx' }, m.title, h('small', {}, meta)),
          h('span', { class: 'cd' + ((m.recur ? nextAnniversary(m.date).days : daysBetween(todayStr(), m.date)) <= 14 && (m.recur || daysBetween(todayStr(), m.date) >= 0) ? ' soon' : '') }, cd, h('small', {}, sub))));
      });
    }

    // ---- cycle (discreet, expands on tap) ----
    const st = cycleStats(periods.map(p => p.start));
    const cyc = h('div', { class: 'sy-cyc' });
    const line = h('button', { class: 'sy-cyc-line', onclick: () => { cycOpen = !cycOpen; Store.Sound.tap(); renderStory(); } },
      '🌙 ',
      st ? h('span', {}, h('b', {}, `Day ${st.day}`), ' of cycle') : h('span', {}, 'Cycle tracker'),
      h('span', { class: 'ex' }, st
        ? (st.until >= 0 ? `next expected in ~${st.until} days ${cycOpen ? '▾' : '▸'}` : `${Math.abs(st.until)} days late ${cycOpen ? '▾' : '▸'}`)
        : `tap to start ${cycOpen ? '▾' : '▸'}`));
    cyc.append(line);
    if (cycOpen) {
      const body = h('div', { class: 'sy-cyc-body' });
      if (st) {
        body.append(h('div', { class: 'sy-cyc-pred' },
          h('div', { style: 'font-size:11.5px;color:var(--ink-dim)' }, 'Next period expected'),
          h('div', { class: 'd' }, fmtDate(st.next)),
          h('div', { class: 'w' }, st.confident
            ? `likely ${fmtShort(dstr(new Date(parse(st.next).getTime() - st.window * 864e5)))} – ${fmtShort(dstr(new Date(parse(st.next).getTime() + st.window * 864e5)))} · ${st.until >= 0 ? 'in ' + st.until + ' days' : Math.abs(st.until) + ' days late'}`
            : 'estimate from a 28-day cycle — log one more period for a personalised prediction')));
        body.append(h('div', { class: 'sy-bar' }, h('i', { style: `width:${Math.max(3, Math.min(100, Math.round(st.day / st.avg * 100)))}%` })));
        body.append(h('div', { class: 'sy-stats' },
          h('span', {}, `avg ${st.avg} days`),
          h('span', {}, `last: ${fmtShort(st.last)}`),
          h('span', {}, `${st.logged} logged`),
          st.confident ? h('span', {}, `±${st.window} day window`) : ''));
      }
      const dinp = h('input', { type: 'date', value: todayStr(), max: todayStr() });
      body.append(h('div', { class: 'sy-log' },
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => logPeriod(todayStr()) }, '🌙 Started today'),
        dinp,
        h('button', { class: 'btn btn-sm', onclick: () => logPeriod(dinp.value) }, 'Log this date')));
      if (st && st.starts.length) {
        const hist = h('div', { class: 'sy-hist' });
        st.starts.slice().reverse().slice(0, 12).forEach(d => {
          const item = periods.find(p => p.start === d);
          hist.append(h('span', {}, fmtShort(d), h('b', { onclick: () => { if (item) { Store.storyRemove(item.id); Store.Sound.bad(); renderStory(); } } }, '✕')));
        });
        body.append(hist);
      }
      body.append(h('div', { class: 'sy-note' }, 'Prediction uses the average of your last cycles — a guide, not a guarantee. Stress, travel and illness can shift things. 💛'));
      cyc.append(body);
    }
    wrap.append(cyc);

    function logPeriod(date) {
      if (!date) return;
      if (periods.some(p => p.start === date)) { Store.Sound.bad(); return; }
      Store.storySave({ kind: 'period', start: date });
      Store.Sound.good(); cycOpen = true; renderStory();
    }
  };

  /* ---------- add / edit sheet ---------- */
  function openEditor(existing, opts) {
    opts = opts || {};
    const draft = Object.assign({ kind: 'moment', emoji: '✨', title: '', date: '', recur: false, place: '', lat: null, lon: null, note: '' }, existing || {});
    const back = h('div', { class: 'sy-ov', onclick: e => { if (e.target === back) close(); } });
    const sheet = h('div', { class: 'sy-sheet' });
    sheet.append(h('h3', {}, existing ? 'EDIT MEMORY' : 'ADD A MEMORY'));

    if (!existing) {                                   // one-tap presets first
      const pr = h('div', { class: 'sy-presets' });
      presets().forEach(p => pr.append(h('button', { class: 'sy-preset', onclick: () => {
        draft.emoji = p.emoji; draft.title = p.title; draft.recur = !!p.recur;
        titleIn.value = p.title; recurChk.checked = !!p.recur; paintEmoji();
        Store.Sound.tap(); titleIn.focus();
      } }, `${p.emoji} ${p.title || 'Custom'}`)));
      sheet.append(pr);
    }

    const titleIn = h('input', { type: 'text', maxlength: '60', value: draft.title, placeholder: 'What is this memory?' });
    sheet.append(h('div', { class: 'sy-field' }, h('label', {}, 'Title'), titleIn));

    const emojiRow = h('div', { class: 'sy-emoji' });
    function paintEmoji() {
      emojiRow.innerHTML = '';
      EMOJIS.forEach(e => emojiRow.append(h('button', { class: draft.emoji === e ? 'on' : '', onclick: () => { draft.emoji = e; paintEmoji(); Store.Sound.tap(); } }, e)));
    }
    paintEmoji();
    sheet.append(h('div', { class: 'sy-field' }, h('label', {}, 'Icon'), emojiRow));

    const dateIn = h('input', { type: 'date', value: draft.date || '' });
    const recurChk = h('input', { type: 'checkbox' });
    recurChk.checked = !!draft.recur;
    sheet.append(h('div', { class: 'sy-field' }, h('label', {}, 'Date (optional)'), dateIn,
      h('label', { class: 'sy-chk', style: 'margin-top:9px' }, recurChk, ' 🎂 Repeats every year (birthday / anniversary)')));

    const placeIn = h('input', { type: 'text', maxlength: '90', value: draft.place || '', placeholder: 'e.g. Phoenix Park, Dublin' });
    const results = h('div', { class: 'sy-results' });
    const searchBtn = h('button', { class: 'btn btn-sm', onclick: doSearch }, '🔍 Find');
    const pinNote = h('div', { style: 'font-size:11.5px;color:var(--lime);margin-top:7px' },
      draft.lat != null ? '📍 pinned on the map' : '');
    sheet.append(h('div', { class: 'sy-field' }, h('label', {}, 'Place (optional)'),
      h('div', { class: 'sy-inline' }, placeIn, searchBtn), results, pinNote));

    const noteIn = h('input', { type: 'text', maxlength: '80', value: draft.note || '', placeholder: '“you were late, I didn’t mind”' });
    sheet.append(h('div', { class: 'sy-field' }, h('label', {}, 'Little note (optional)'), noteIn));

    const actions = h('div', { class: 'sy-actions' },
      h('button', { class: 'btn btn-ghost', onclick: close }, 'Cancel'),
      h('button', { class: 'btn btn-primary', onclick: save }, existing ? 'Save ✓' : 'Add ✓'));
    if (existing) actions.append(h('button', { class: 'btn btn-ghost sy-del', onclick: () => {
      Store.storyRemove(existing.id); Store.Sound.bad(); close(); renderStory();
    } }, '🗑'));
    sheet.append(actions);

    back.append(sheet); document.body.append(back); Store.Sound.tap();
    setTimeout(() => { (opts.focusPlace ? placeIn : titleIn).focus(); }, 80);

    async function doSearch() {
      const q = placeIn.value.trim();
      if (!q) { placeIn.focus(); return; }
      results.innerHTML = ''; searchBtn.textContent = '…';
      try {
        const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + encodeURIComponent(q), { headers: { 'Accept': 'application/json' } });
        const list = await r.json();
        searchBtn.textContent = '🔍 Find';
        if (!list.length) { results.append(h('div', { style: 'font-size:12px;color:var(--ink-faint)' }, 'Nothing found — try a simpler name (“Phoenix Park Dublin”).')); return; }
        list.forEach(p => results.append(h('button', { onclick: () => {
          draft.lat = +p.lat; draft.lon = +p.lon;
          draft.place = p.display_name.split(',').slice(0, 3).join(',').trim();
          placeIn.value = draft.place; results.innerHTML = '';
          pinNote.textContent = '📍 pinned on the map';
          Store.Sound.good();
        } }, p.display_name)));
      } catch (e) {
        searchBtn.textContent = '🔍 Find';
        results.append(h('div', { style: 'font-size:12px;color:var(--gold)' }, 'Search unavailable right now — you can still save the place name as text.'));
      }
    }
    function save() {
      const item = {
        kind: 'moment',
        emoji: draft.emoji,
        title: titleIn.value.trim() || 'Our memory',
        date: dateIn.value || '',
        recur: !!recurChk.checked,
        place: placeIn.value.trim(),
        lat: draft.lat, lon: draft.lon,
        note: noteIn.value.trim(),
      };
      if (existing) item.id = existing.id;
      if (!item.place) { item.lat = null; item.lon = null; }   // cleared place → drop the pin
      Store.storySave(item); Store.Sound.good(); close(); renderStory();
    }
    function close() { back.remove(); }
  }

  window._storyTest = { cycleStats, nextAnniversary, tileXY, daysBetween };
})();
