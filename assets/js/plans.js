/* ============================================================
   PLANS — shared couple calendar (route #/plans).
   Two entry kinds:
     🚫 busy — one person unavailable (their colour)
     💞 us   — dedicated time together; proposed by one, LOCKED
               only when the partner taps Confirm.
   TIMEZONES: timed entries store UTC ms. Each phone renders with
   the DEVICE's own zone (toLocale*String), so Smit enters 10:00
   Irish and Meera automatically reads 14:30 IST — no config, no
   conversion tables, it can't drift. All-day entries store plain
   YYYY-MM-DD strings: "busy Saturday" means Saturday for both.
   ============================================================ */
(function () {
  const css = `
  .pl-head{ display:flex; align-items:center; justify-content:space-between; max-width:520px; margin:0 auto 4px; }
  .pl-head h2{ font-family:var(--font-display); font-size:16px; letter-spacing:1px; margin:0; }
  .pl-head .btn-sm{ padding:8px 12px; }
  .pl-tz{ max-width:520px; margin:0 auto 14px; text-align:center; font-size:11.5px; color:var(--ink-faint); letter-spacing:.3px; }
  .pl-cal{ max-width:520px; margin:0 auto; border-radius:var(--radius); padding:14px 12px 12px;
    background:var(--panel); border:1px solid var(--glass-brd); backdrop-filter:var(--blur);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.06), var(--shadow-soft); }
  .pl-mnav{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
  .pl-mnav b{ font-family:var(--font-display); font-size:14px; letter-spacing:1px; }
  .pl-mnav button{ width:38px; height:38px; border-radius:11px; background:var(--bg-2); border:1px solid var(--line); color:var(--ink); font-size:17px; }
  .pl-mnav button:active{ transform:scale(.9); }
  .pl-dow{ display:grid; grid-template-columns:repeat(7,1fr); margin-bottom:4px; }
  .pl-dow span{ text-align:center; font-size:10px; font-weight:700; letter-spacing:1px; color:var(--ink-faint); }
  .pl-grid{ display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
  .pl-c{ position:relative; aspect-ratio:1; border-radius:10px; background:var(--bg-2); border:1px solid transparent;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; cursor:pointer;
    font-family:var(--font-num); font-weight:700; font-size:13.5px; color:var(--ink-dim);
    transition:transform .12s var(--ease), border-color .2s, box-shadow .2s; }
  .pl-c:active{ transform:scale(.9); }
  .pl-c.dim{ opacity:.32; }
  .pl-c.today{ border-color:var(--violet); color:var(--ink); }
  .pl-c.sel{ border-color:var(--gold); box-shadow:0 0 12px -4px var(--gold); color:var(--ink); }
  .pl-dots{ display:flex; gap:3px; min-height:5px; }
  .pl-dots i{ width:5px; height:5px; border-radius:50%; }
  .pl-dots i.b0{ background:var(--p1); box-shadow:0 0 5px var(--p1); }
  .pl-dots i.b1{ background:var(--p2); box-shadow:0 0 5px var(--p2); }
  .pl-c.us{ background:linear-gradient(135deg, rgba(47,230,255,.2), rgba(255,77,157,.24));
    border-color:rgba(255,77,157,.5); color:var(--ink); box-shadow:0 0 14px -4px rgba(255,77,157,.55); }
  .pl-c.us::after{ content:'💞'; position:absolute; top:2px; right:3px; font-size:9px; }
  .pl-c.us-pend{ border-style:dashed; border-color:rgba(255,77,157,.55); }
  .pl-c.us-pend::after{ content:'💞'; position:absolute; top:2px; right:3px; font-size:9px; opacity:.55; }
  .pl-list{ max-width:520px; margin:14px auto 0; display:flex; flex-direction:column; gap:9px; }
  .pl-item{ display:flex; align-items:center; gap:11px; padding:12px 13px; border-radius:14px;
    background:var(--panel); border:1px solid var(--line); animation:floatUp .3s var(--ease) both; }
  .pl-item.k-us{ border-color:rgba(255,77,157,.4); background:linear-gradient(120deg, rgba(47,230,255,.08), rgba(255,77,157,.1)); }
  .pl-item .ic{ font-size:20px; flex:0 0 auto; }
  .pl-item .tx{ flex:1; min-width:0; }
  .pl-item .tx b{ font-size:14.5px; display:block; }
  .pl-item .tx small{ color:var(--ink-dim); font-size:12px; line-height:1.45; display:block; }
  .pl-item .tx .pend{ color:var(--gold); font-weight:700; }
  .pl-item .tx .ptz{ color:var(--violet); font-size:11.5px; }
  .pl-x{ flex:0 0 auto; width:30px; height:30px; border-radius:9px; background:transparent; border:1px solid var(--line); color:var(--ink-faint); font-size:13px; }
  .pl-x:active{ transform:scale(.85); border-color:var(--magenta); color:var(--magenta); }
  .pl-ok{ flex:0 0 auto; padding:9px 13px; border-radius:11px; border:none; font-weight:700; font-size:12.5px; color:#fff;
    background:linear-gradient(135deg,var(--violet),var(--magenta)); box-shadow:0 6px 16px -6px rgba(255,77,157,.7); }
  .pl-ok:active{ transform:scale(.93); }
  .pl-compose{ max-width:520px; margin:12px auto 0; border-radius:var(--radius); padding:16px 14px;
    background:var(--panel-2); border:1px solid var(--glass-brd); backdrop-filter:var(--blur); animation:floatUp .3s var(--ease) both; }
  .pl-kind{ display:flex; gap:8px; margin-bottom:12px; }
  .pl-kind button{ flex:1; padding:11px 8px; border-radius:12px; background:var(--bg-2); border:1px solid var(--line); color:var(--ink-dim); font-weight:700; font-size:13px; }
  .pl-kind button.on.kb{ border-color:var(--p1); color:var(--p1); box-shadow:var(--glow-c); }
  .pl-kind button.on.ku{ border-color:var(--p2); color:var(--p2); box-shadow:var(--glow-m); }
  .pl-compose input[type=text]{ width:100%; box-sizing:border-box; background:var(--bg-2); border:1px solid var(--line); border-radius:12px;
    padding:12px 13px; color:var(--ink); font-size:14.5px; outline:none; margin-bottom:11px; }
  .pl-compose input[type=text]:focus{ border-color:var(--violet); box-shadow:var(--glow-v); }
  .pl-row{ display:flex; align-items:center; gap:10px; margin-bottom:11px; font-size:13px; color:var(--ink-dim); flex-wrap:wrap; }
  .pl-row input[type=time], .pl-row input[type=date]{ background:var(--bg-2); border:1px solid var(--line); border-radius:10px;
    padding:9px 10px; color:var(--ink); font-family:inherit; font-size:14px; color-scheme:dark; outline:none; }
  .pl-upc-label{ max-width:520px; margin:22px auto 0; }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const DOW = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const pad = n => String(n).padStart(2, '0');
  const dstr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const localDayOf = ms => dstr(new Date(ms));
  const fmtTime = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const fmtDayLong = str => new Date(str + 'T12:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  const addDays = (str, n) => { const d = new Date(str + 'T12:00:00'); d.setDate(d.getDate() + n); return dstr(d); };
  // every viewer-local day an entry touches
  function daysOf(e) {
    const from = e.allDay ? e.d1 : localDayOf(e.t1);
    const to = e.allDay ? e.d2 : localDayOf(e.t2);
    const out = []; let d = from, guard = 0;
    while (d <= to && guard++ < 62) { out.push(d); d = addDays(d, 1); }
    return out;
  }
  function whenText(e, s) {
    const who = e.kind === 'us' ? '💞 together' : `${s.players[e.seat].emoji} ${esc(s.players[e.seat].name)}`;
    if (e.allDay) return `${who} · ${e.d1 === e.d2 ? 'all day' : 'until ' + fmtDayLong(e.d2)}`;
    const sameDay = localDayOf(e.t1) === localDayOf(e.t2);
    return `${who} · ${fmtTime(e.t1)} – ${sameDay ? '' : fmtDayLong(localDayOf(e.t2)) + ' '}${fmtTime(e.t2)} (your time)`;
  }
  // "what time is that for THEM" — uses the timezone each phone stamps on its
  // seat, so you can sanity-check you're not proposing their 3am
  function partnerTimeText(e, s, me) {
    if (e.allDay) return '';
    const p = s.players[1 - me], tz = p && p.tz;
    try {
      const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!tz || tz === myTz) return '';
      const f = ms => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });
      const wd = (ms, z) => new Date(ms).toLocaleDateString('en', Object.assign({ weekday: 'short' }, z ? { timeZone: z } : {}));
      const shift = wd(e.t1, tz) !== wd(e.t1) ? ` (${wd(e.t1, tz)})` : '';
      return `${p.emoji} ${esc(p.name)} sees ${f(e.t1)} – ${f(e.t2)}${shift}`;
    } catch (err) { return ''; }
  }

  let view = null;          // {y, m} of the visible month
  let selDay = null;        // 'YYYY-MM-DD'
  let composeOpen = false, composeKind = 'busy';

  window.renderPlans = function renderPlans() {
    const s = Store.get(), me = Store.getIdentity();
    const root = $('#view'); root.innerHTML = '';
    const plans = Array.isArray(s.plans) ? s.plans : [];
    const today = dstr(new Date());
    if (!view) { const n = new Date(); view = { y: n.getFullYear(), m: n.getMonth() }; }
    if (!selDay) selDay = today;

    const partner = s.players[1 - me];
    root.append(h('div', { class: 'pl-head' },
      h('h2', {}, '📅 OUR PLANS'),
      h('button', { class: 'btn btn-sm btn-primary', onclick: () => { composeOpen = !composeOpen; Store.Sound.tap(); renderPlans(); } }, composeOpen ? '✕ Close' : '+ Add plan')));
    root.append(h('div', { class: 'pl-tz' }, `🌍 Times convert automatically — you see YOUR local time, ${esc(partner.name)} sees ${partner.name === 'Meera' ? 'hers' : 'theirs'}.`));

    // day → markers map for the visible month (viewer-local days)
    const marks = {};
    plans.forEach(e => daysOf(e).forEach(d => {
      const m = marks[d] || (marks[d] = {});
      if (e.kind === 'busy') m['b' + e.seat] = true;
      else m.us = e.confirmed ? 'conf' : (m.us === 'conf' ? 'conf' : 'pend');
    }));

    // ----- month grid -----
    const cal = h('div', { class: 'pl-cal' });
    const mName = new Date(view.y, view.m, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
    cal.append(h('div', { class: 'pl-mnav' },
      h('button', { onclick: () => { flip(-1); } }, '‹'),
      h('b', { onclick: () => { const n = new Date(); view = { y: n.getFullYear(), m: n.getMonth() }; selDay = today; renderPlans(); } }, mName.toUpperCase()),
      h('button', { onclick: () => { flip(1); } }, '›')));
    function flip(d) { view.m += d; if (view.m < 0) { view.m = 11; view.y--; } if (view.m > 11) { view.m = 0; view.y++; } Store.Sound.tap(); renderPlans(); }
    cal.append(h('div', { class: 'pl-dow' }, DOW.map(d => h('span', {}, d))));
    const grid = h('div', { class: 'pl-grid' });
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7;                         // Monday-first offset
    const start = new Date(view.y, view.m, 1 - lead);
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const ds = dstr(d), mk = marks[ds] || {};
      const cell = h('div', {
        class: 'pl-c' + (d.getMonth() !== view.m ? ' dim' : '') + (ds === today ? ' today' : '') + (ds === selDay ? ' sel' : '')
          + (mk.us === 'conf' ? ' us' : mk.us === 'pend' ? ' us-pend' : ''),
        onclick: () => { selDay = ds; Store.Sound.tap(); renderPlans(); },
      }, String(d.getDate()),
        h('div', { class: 'pl-dots' }, mk.b0 ? h('i', { class: 'b0' }) : '', mk.b1 ? h('i', { class: 'b1' }) : ''));
      grid.append(cell);
    }
    cal.append(grid); root.append(cal);

    // ----- composer -----
    if (composeOpen) {
      const box = h('div', { class: 'pl-compose' });
      const kb = h('button', { class: 'kb' + (composeKind === 'busy' ? ' on' : ''), onclick: () => { composeKind = 'busy'; Store.Sound.tap(); renderPlans(); } }, `🚫 I'm busy`);
      const ku = h('button', { class: 'ku' + (composeKind === 'us' ? ' on' : ''), onclick: () => { composeKind = 'us'; Store.Sound.tap(); renderPlans(); } }, '💞 Us time');
      box.append(h('div', { class: 'pl-kind' }, kb, ku));
      const title = h('input', { type: 'text', maxlength: '80', placeholder: composeKind === 'us' ? 'Movie night? Long call? Name it… 💞' : 'What’s eating your time? (work trip, wedding…)' });
      box.append(title);
      const allDayChk = h('input', { type: 'checkbox' });
      box.append(h('label', { class: 'pl-row' }, allDayChk, ' All day (no specific time)'));
      const tFrom = h('input', { type: 'time', value: '18:00' });
      const tTo = h('input', { type: 'time', value: '20:00' });
      const timeRow = h('div', { class: 'pl-row' }, 'From ', tFrom, ' to ', tTo, h('span', { style: 'font-size:11px' }, '(your local time)'));
      const dTo = h('input', { type: 'date', value: selDay });
      const spanRow = h('div', { class: 'pl-row', hidden: '' }, 'Until ', dTo, h('span', { style: 'font-size:11px' }, '(for multi-day blocks)'));
      // live "for them" preview while picking times — catches 3am proposals early
      const pvw = h('div', { class: 'pl-row', style: 'color:var(--violet);font-size:12px;min-height:16px' });
      function paintPvw() {
        pvw.textContent = '';
        if (allDayChk.checked) return;
        const tz = partner.tz;
        try {
          const myTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          if (!tz || tz === myTz) return;
          const f = v => new Date(selDay + 'T' + v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });
          pvw.textContent = `${partner.emoji} For ${partner.name} that’s ${f(tFrom.value || '18:00')} – ${f(tTo.value || '20:00')}`;
        } catch (err) {}
      }
      tFrom.addEventListener('input', paintPvw); tTo.addEventListener('input', paintPvw);
      allDayChk.addEventListener('change', () => { timeRow.hidden = allDayChk.checked; spanRow.hidden = !allDayChk.checked; paintPvw(); });
      paintPvw();
      box.append(timeRow, pvw, spanRow);
      box.append(h('button', { class: 'btn btn-primary btn-block', onclick: saveEntry },
        composeKind === 'us' ? `💞 Propose to ${esc(partner.name)} — ${fmtDayLong(selDay)}` : `Save — ${fmtDayLong(selDay)}`));
      root.append(box);
      function saveEntry() {
        const e = { kind: composeKind, seat: me, title: title.value.trim() || (composeKind === 'us' ? 'Us time' : 'Busy') };
        if (allDayChk.checked) { e.allDay = true; e.d1 = selDay; e.d2 = (dTo.value && dTo.value > selDay) ? dTo.value : selDay; }
        else {
          e.allDay = false;
          e.t1 = new Date(selDay + 'T' + (tFrom.value || '18:00')).getTime();
          e.t2 = new Date(selDay + 'T' + (tTo.value || '20:00')).getTime();
          if (e.t2 <= e.t1) e.t2 = e.t1 + 30 * 60000;            // guard silly ranges
        }
        Store.planAdd(e); Store.Sound.good(); composeOpen = false; renderPlans();
      }
    }

    // ----- selected-day agenda -----
    const dayList = plans.filter(e => daysOf(e).includes(selDay))
      .sort((a, b) => (a.allDay ? 0 : a.t1) - (b.allDay ? 0 : b.t1));
    const list = h('div', { class: 'pl-list' });
    list.append(h('div', { class: 'sec-label' }, `${fmtDayLong(selDay).toUpperCase()}${selDay === today ? ' · TODAY' : ''}`));
    if (!dayList.length) list.append(h('div', { class: 'empty-note', style: 'padding:18px' }, 'Nothing planned — a free day 🕊'));
    dayList.forEach(e => list.append(planItem(e)));
    root.append(list);

    // ----- upcoming -----
    const nowMs = Date.now();
    const upcoming = plans.filter(e => planEndMs(e) >= nowMs)
      .sort((a, b) => planStartMs(a) - planStartMs(b)).slice(0, 5);
    if (upcoming.length) {
      const up = h('div', { class: 'pl-list' }, h('div', { class: 'sec-label pl-upc-label' }, '⏭ COMING UP'));
      upcoming.forEach(e => {
        const it = planItem(e, true);
        it.style.cursor = 'pointer';
        it.addEventListener('click', ev => {
          if (ev.target.closest('button')) return;
          const d = e.allDay ? e.d1 : localDayOf(e.t1);
          const dd = new Date(d + 'T12:00:00'); view = { y: dd.getFullYear(), m: dd.getMonth() }; selDay = d; renderPlans();
        });
        up.append(it);
      });
      root.append(up);
    }

    function planStartMs(e) { return e.allDay ? new Date(e.d1 + 'T00:00:00').getTime() : e.t1; }
    function planEndMs(e) { return e.allDay ? new Date(e.d2 + 'T23:59:59').getTime() : e.t2; }
    function planItem(e, withDate) {
      const mine = e.seat === me;
      const pending = e.kind === 'us' && !e.confirmed;
      const kids = [
        h('span', { class: 'ic' }, e.kind === 'us' ? '💞' : '🚫'),
        h('div', { class: 'tx' },
          h('b', {}, esc(e.title)),
          h('small', {}, (withDate ? fmtDayLong(e.allDay ? e.d1 : localDayOf(e.t1)) + ' · ' : '') + whenText(e, s)),
          (() => { const pt = partnerTimeText(e, s, me); return pt ? h('small', { class: 'ptz' }, pt) : ''; })(),
          pending ? h('small', { class: 'pend' }, mine ? `⏳ waiting for ${esc(partner.name)} to confirm` : '💌 they proposed — you in?') : ''),
      ];
      if (pending && !mine) kids.push(h('button', { class: 'pl-ok', onclick: () => { Store.planConfirm(e.id, me); Store.Sound.win(); renderPlans(); } }, '💞 Confirm'));
      if ((e.kind === 'busy' && mine) || e.kind === 'us')
        kids.push(h('button', { class: 'pl-x', onclick: () => { Store.planRemove(e.id); Store.Sound.bad(); renderPlans(); } }, '✕'));
      return h('div', { class: 'pl-item k-' + e.kind }, kids);
    }
  };
})();
