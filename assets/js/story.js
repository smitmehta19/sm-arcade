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
   Setting a place, in order of least effort:
     1. paste a Google Maps link (short goo.gl ones are resolved via
        unshorten.me) → coordinates AND the place name, zero typing;
     2. type a name → Photon + Nominatim searched in parallel;
     3. drop a pin by dragging the map — works for places no database
        knows (e.g. a small hotel that simply isn't in OpenStreetMap).
   Cycle: prediction = last start + rolling average of recent cycles,
   counting only 21–45 day gaps (longer = an unlogged period, see
   cycleStats) with a ± window from real variability.
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
  .sy-warn{ font-size:11.5px; color:var(--ink-dim); line-height:1.5; margin-bottom:11px; padding:9px 11px;
    border-radius:11px; background:rgba(255,214,107,.08); border:1px solid rgba(255,214,107,.28); }
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
  .sy-results button b{ display:block; font-size:13.5px; }
  .sy-results button span{ display:block; color:var(--ink-faint); font-size:11.5px; margin-top:2px; }
  .sy-tip{ font-size:12px; color:var(--ink-dim); line-height:1.5; padding:9px 11px; border-radius:11px;
    background:rgba(255,214,107,.07); border:1px solid rgba(255,214,107,.25); }
  .sy-openlink{ display:inline-block; margin-top:6px; padding:7px 12px; border-radius:9px; font-size:12px;
    font-weight:700; color:#0a0714; background:var(--gold); text-decoration:none; }
  .sy-pinnote{ font-size:11.5px; color:var(--ink-faint); line-height:1.5; margin-top:8px; }
  .sy-pinnote.on{ color:var(--lime); }
  /* drop-a-pin picker */
  .pick-ov{ z-index:150; }
  .sy-pick-hint{ font-size:12.5px; color:var(--ink-dim); text-align:center; margin:0 0 12px; line-height:1.5; }
  .sy-pick{ position:relative; height:min(52vh,320px); border-radius:14px; overflow:hidden;
    border:1px solid var(--glass-brd); background:#0b1020; touch-action:none; cursor:grab; user-select:none; }
  .sy-pick:active{ cursor:grabbing; }
  .sy-pick-layer{ position:absolute; inset:0; }
  .sy-pick-layer img{ position:absolute; width:256px; height:256px; pointer-events:none;
    filter:invert(1) hue-rotate(185deg) brightness(.74) saturate(.75) contrast(1.05); }
  .sy-cross{ position:absolute; left:50%; top:50%; transform:translate(-50%,-88%); font-size:30px; z-index:4;
    pointer-events:none; filter:drop-shadow(0 0 10px var(--magenta)); }
  .sy-cross::after{ content:''; position:absolute; left:50%; bottom:-4px; transform:translateX(-50%);
    width:7px; height:7px; border-radius:50%; background:var(--magenta); box-shadow:0 0 10px var(--magenta); }
  .sy-zoom{ position:absolute; right:10px; top:10px; z-index:5; width:38px; height:38px; border-radius:11px;
    background:rgba(10,12,24,.82); border:1px solid var(--glass-brd); color:var(--ink); font-size:19px; font-weight:700; }
  .sy-zoom.out{ top:54px; } .sy-zoom:active{ transform:scale(.9); }
  .sy-pick .att{ position:absolute; right:5px; bottom:3px; z-index:5; font-size:8px; color:rgba(255,255,255,.55); }
  .sy-coord{ text-align:center; font-family:var(--font-num); font-size:11.5px; color:var(--ink-faint); margin-top:9px; }
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
     Calendar method: next = last start + average of recent cycles.
     ⚠ A gap is only counted as a REAL cycle if it's 21–45 days. Clinically a
     normal cycle is 21–35 days and anything over 35 is "infrequent", so a
     56-day gap is far more likely to be a period that never got logged than a
     genuine 56-day cycle — counting it once predicted Oct 13 from an Aug 18
     start, which is nonsense. Out-of-range gaps are excluded from the average
     and surfaced to the user so they can log the missing one.
     Quality: good (≥2 measured cycles) · early (1) · estimate (0 → 28 days). */
  const CYCLE_MIN = 21, CYCLE_MAX = 45;
  function cycleStats(startsRaw) {
    const starts = [...new Set(startsRaw || [])].sort();
    if (!starts.length) return null;
    const last = starts[starts.length - 1];
    const gaps = [];
    for (let i = 1; i < starts.length; i++) gaps.push({ from: starts[i - 1], to: starts[i], len: dayNo(starts[i]) - dayNo(starts[i - 1]) });
    const valid = gaps.filter(g => g.len >= CYCLE_MIN && g.len <= CYCLE_MAX);
    const skipped = gaps.filter(g => g.len > CYCLE_MAX);       // probably an unlogged period
    const tooShort = gaps.filter(g => g.len < CYCLE_MIN);      // double-log or spotting
    const recent = valid.slice(-6).map(g => g.len);
    const quality = recent.length >= 2 ? 'good' : recent.length === 1 ? 'early' : 'estimate';
    const avg = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 28;
    const spread = recent.length > 1 ? Math.max(...recent.map(l => Math.abs(l - avg))) : 0;
    const window = quality === 'good' ? Math.min(7, Math.max(2, Math.round(spread))) : (quality === 'early' ? 3 : 4);
    const next = dstr(new Date(parse(last).getTime() + avg * 864e5));
    return {
      last, avg, window, next, quality,
      day: daysBetween(last, todayStr()) + 1,                  // day 1 = first day of the period
      until: daysBetween(todayStr(), next),
      logged: starts.length,
      cycles: recent.length,
      skipped, tooShort,
      confident: quality === 'good',
      starts,
    };
  }

  /* ---------- static OSM mini-map (no library, no key) ---------- */
  function tileXY(lat, lon, z) {
    const n = Math.pow(2, z), latR = lat * Math.PI / 180;
    return { x: (lon + 180) / 360 * n, y: (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n };
  }
  // world-pixel projection (256px tiles) — used by the drag-to-pin picker
  const worldPx = (lat, lon, z) => { const t = tileXY(lat, lon, z); return { x: t.x * 256, y: t.y * 256 }; };
  function worldLatLon(x, y, z) {
    const s = 256 * Math.pow(2, z);
    return { lon: x / s * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / s))) * 180 / Math.PI };
  }

  /* ---------- finding a place ----------
     Nominatim alone missed real hotels ("leela ambience gurgaon" → nothing),
     so search runs on Photon (same OSM data, fuzzy autocomplete-grade
     matching) and falls back to Nominatim. Anything a database doesn't know
     can still be pinned by hand with the map picker, or pasted as a maps
     link / raw coordinates. */
  function parseCoords(t) {
    if (!t) return null;
    const chk = (la, lo) => (isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (la || lo)) ? { lat: la, lon: lo } : null;
    let m = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);          // google place payload
    if (m) return chk(+m[1], +m[2]);
    m = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);                   // /maps/@lat,lon,17z
    if (m) return chk(+m[1], +m[2]);
    m = t.match(/[?&](?:q|ll|daddr|sll|mlat)=(-?\d+(?:\.\d+)?)[,&]?(?:mlon=)?(-?\d+(?:\.\d+)?)/); // ?q=lat,lon · apple ?ll=
    if (m) return chk(+m[1], +m[2]);
    m = t.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/); // pasted "18.92, 72.83"
    if (m) return chk(+m[1], +m[2]);
    return null;
  }
  const isShortMapLink = t => /(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(t || '');
  // A Google Maps URL carries the place NAME as well as its coordinates —
  // ".../maps/place/Aureole%2BHotel/@19.11,72.85/..." — so a pasted link can
  // fill in both and the user never has to type or copy coordinates.
  function parseMapsUrl(url) {
    const c = parseCoords(url || '');
    if (!c) return null;
    let name = null;
    const m = (url || '').match(/\/maps\/place\/([^\/@?]+)/);
    if (m) {
      try {
        name = decodeURIComponent(m[1]).replace(/\+/g, ' ').trim();
        if (/^[@\d.,\s-]*$/.test(name) || name.length < 2) name = null;     // a coordinate, not a name
      } catch (e) { name = null; }
    }
    return { lat: c.lat, lon: c.lon, name };
  }
  // Short goo.gl links are a redirect that no web page may follow (Google sends
  // no CORS headers). unshorten.me resolves them and DOES allow browser calls,
  // so pasting a shared link can Just Work. Failure is non-fatal: the UI falls
  // back to the manual routes. Note: the link is sent to that service to be
  // resolved — it only ever sees the maps link, nothing else about the couple.
  async function expandShortLink(url) {
    try {
      const r = await fetch('https://unshorten.me/json/' + encodeURIComponent(url));
      const j = await r.json();
      if (j && j.success && j.resolved_url) return j.resolved_url;
    } catch (e) {}
    return null;
  }

  // Both engines run in PARALLEL and their results are interleaved — Photon is
  // forgiving with partial/misspelled names, Nominatim is stronger on addresses,
  // and asking both simply gives more to choose from. null = neither reachable.
  async function searchPlaces(q) {
    const photon = async () => {
      const r = await fetch('https://photon.komoot.io/api/?limit=10&q=' + encodeURIComponent(q));
      const j = await r.json();
      return (j.features || []).map(f => {
        const p = f.properties || {}, c = (f.geometry || {}).coordinates || [];
        const bits = [...new Set([p.street && p.street !== p.name ? p.street : '', p.district || '', p.city || p.county || '', p.state || '', p.country || ''].filter(Boolean))];
        return { label: p.name || p.street || p.city || 'Unnamed place', sub: bits.join(', '), lat: +c[1], lon: +c[0] };
      });
    };
    const nominatim = async () => {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=10&q=' + encodeURIComponent(q));
      const j = await r.json();
      return (j || []).map(p => {
        const parts = (p.display_name || '').split(',');
        return { label: parts[0].trim(), sub: parts.slice(1, 4).join(',').trim(), lat: +p.lat, lon: +p.lon };
      });
    };
    const [a, b] = await Promise.allSettled([photon(), nominatim()]);
    if (a.status !== 'fulfilled' && b.status !== 'fulfilled') return null;
    const A = a.status === 'fulfilled' ? a.value : [], B = b.status === 'fulfilled' ? b.value : [];
    const out = [], seen = new Set();
    for (let i = 0; i < Math.max(A.length, B.length); i++) {               // interleave: best of each engine near the top
      [A[i], B[i]].forEach(r => {
        if (!r || !isFinite(r.lat) || !isFinite(r.lon)) return;
        const key = r.lat.toFixed(3) + ',' + r.lon.toFixed(3);
        const key2 = (r.label || '').toLowerCase() + '|' + key;
        if (seen.has(key) || seen.has(key2)) return;
        seen.add(key); seen.add(key2); out.push(r);
      });
    }
    return out.slice(0, 10);
  }
  async function reverseName(lat, lon) {
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lon}`);
      const j = await r.json();
      if (j && j.display_name) return j.display_name.split(',').slice(0, 3).join(',').trim();
    } catch (e) {}
    return null;
  }

  /* ---------- drop-a-pin picker — drag the map under a fixed crosshair.
     Works for ANY spot on earth (a hotel, a bench, a beach) with no search
     at all. Plain tiles + pointer events; no Leaflet, no key. */
  function openPinPicker(startLat, startLon, onPick) {
    let lat = startLat != null ? startLat : 20.5937, lon = startLon != null ? startLon : 78.9629; // default: India
    let z = startLat != null ? 16 : 4;
    const back = h('div', { class: 'sy-ov pick-ov', onclick: e => { if (e.target === back) back.remove(); } });
    const sheet = h('div', { class: 'sy-sheet' });
    sheet.append(h('h3', {}, '📍 DROP A PIN'));
    sheet.append(h('p', { class: 'sy-pick-hint' }, 'Jump to a nearby landmark, then drag the map so the crosshair sits exactly where the memory happened.'));
    // search INSIDE the picker: find the area, then fine-tune by hand. This is
    // how you pin a place that no map database has ever heard of.
    const jumpIn = h('input', { type: 'text', placeholder: 'Jump to an area, road or landmark…' });
    const jumpRes = h('div', { class: 'sy-results' });
    const jumpBtn = h('button', { class: 'btn btn-sm', onclick: jump }, '🔍');
    sheet.append(h('div', { class: 'sy-inline', style: 'margin-bottom:9px' }, jumpIn, jumpBtn), jumpRes);
    let jumpTimer = null;
    let jumpBusy = false;
    jumpIn.addEventListener('input', () => {
      const v = jumpIn.value.trim();
      const c = parseCoords(v);
      if (c) { lat = c.lat; lon = c.lon; z = 17; jumpRes.innerHTML = ''; paint(); return; }
      if (isShortMapLink(v)) {                                             // pasted a shared link → fly there
        if (jumpBusy) return;
        jumpBusy = true; jumpRes.innerHTML = '';
        jumpRes.append(h('div', { class: 'sy-tip' }, '🔗 Finding that link…'));
        expandShortLink(v).then(full => {
          jumpBusy = false; jumpRes.innerHTML = '';
          const got = full && parseMapsUrl(full);
          if (got) { lat = got.lat; lon = got.lon; z = 18; jumpIn.value = ''; paint(); Store.Sound.good(); }
          else jumpRes.append(h('div', { class: 'sy-tip' }, 'Couldn’t read that link — pan the map to the spot instead.'));
        });
        return;
      }
      clearTimeout(jumpTimer);
      if (v.length < 3) { jumpRes.innerHTML = ''; return; }
      jumpTimer = setTimeout(jump, 550);
    });
    async function jump() {
      const q = jumpIn.value.trim();
      if (q.length < 3) return;
      jumpBtn.textContent = '…';
      const list = await searchPlaces(q);
      jumpBtn.textContent = '🔍';
      jumpRes.innerHTML = '';
      if (!list || !list.length) { jumpRes.append(h('div', { class: 'sy-tip' }, 'No match — pan and zoom the map yourself, that always works.')); return; }
      list.slice(0, 5).forEach(p => jumpRes.append(h('button', { onclick: () => {
        lat = p.lat; lon = p.lon; z = 17; jumpRes.innerHTML = ''; jumpIn.value = ''; paint(); Store.Sound.tap();
      } }, h('b', {}, p.label), p.sub ? h('span', {}, p.sub) : '')));
    }
    const stage = h('div', { class: 'sy-pick' });
    const layer = h('div', { class: 'sy-pick-layer' });
    const cross = h('div', { class: 'sy-cross' }, '📍');
    const zin = h('button', { class: 'sy-zoom', onclick: () => { z = Math.min(19, z + 1); paint(); } }, '＋');
    const zout = h('button', { class: 'sy-zoom out', onclick: () => { z = Math.max(2, z - 1); paint(); } }, '−');
    const att = h('span', { class: 'att' }, '© OpenStreetMap');
    stage.append(layer, cross, zin, zout, att);
    const coordLine = h('div', { class: 'sy-coord' });
    sheet.append(stage, coordLine);
    const useBtn = h('button', { class: 'btn btn-primary', onclick: confirm }, '📍 Use this spot');
    sheet.append(h('div', { class: 'sy-actions' },
      h('button', { class: 'btn btn-ghost', onclick: () => back.remove() }, 'Cancel'), useBtn));
    back.append(sheet); document.body.append(back);

    function paint() {
      const W = stage.clientWidth || 320, H = stage.clientHeight || 260;
      const c = worldPx(lat, lon, z);
      const left = c.x - W / 2, top = c.y - H / 2;
      const x0 = Math.floor(left / 256), y0 = Math.floor(top / 256);
      const cols = Math.ceil(W / 256) + 1, rows = Math.ceil(H / 256) + 1;
      const n = Math.pow(2, z);
      layer.innerHTML = ''; layer.style.transform = '';
      for (let i = 0; i <= cols; i++) for (let j = 0; j <= rows; j++) {
        const tx = x0 + i, ty = y0 + j;
        if (ty < 0 || ty >= n) continue;
        const wrapX = ((tx % n) + n) % n;                                  // wrap the globe horizontally
        const img = h('img', { alt: '', src: `https://tile.openstreetmap.org/${z}/${wrapX}/${ty}.png` });
        img.style.left = (tx * 256 - left) + 'px'; img.style.top = (ty * 256 - top) + 'px';
        img.draggable = false;
        layer.append(img);
      }
      coordLine.textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)}  ·  zoom ${z}`;
    }
    // drag: move the layer live, commit the new centre on release
    let dragging = false, sx = 0, sy = 0, dx = 0, dy = 0;
    stage.addEventListener('pointerdown', e => { dragging = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', e => {
      if (!dragging) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      layer.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = () => {
      if (!dragging) return; dragging = false;
      const c = worldPx(lat, lon, z);
      const p = worldLatLon(c.x - dx, c.y - dy, z);
      lat = Math.max(-85, Math.min(85, p.lat)); lon = ((p.lon + 540) % 360) - 180;
      paint();
    };
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    stage.addEventListener('dblclick', () => { z = Math.min(19, z + 1); paint(); });
    setTimeout(paint, 30);

    async function confirm() {
      useBtn.disabled = true; useBtn.textContent = 'Naming it…';
      const name = await reverseName(lat, lon);
      back.remove();
      onPick({ lat, lon, name });
    }
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
        const lo = fmtShort(dstr(new Date(parse(st.next).getTime() - st.window * 864e5)));
        const hi = fmtShort(dstr(new Date(parse(st.next).getTime() + st.window * 864e5)));
        const timing = st.until >= 0 ? `in ${st.until} days` : `${Math.abs(st.until)} days late`;
        const blurb = st.quality === 'good'
          ? `likely ${lo} – ${hi} · ${timing}`
          : st.quality === 'early'
            ? `from your one measured cycle of ${st.avg} days · likely ${lo} – ${hi}`
            : `estimated from a typical 28-day cycle · log the next period to make this personal`;
        body.append(h('div', { class: 'sy-cyc-pred' },
          h('div', { style: 'font-size:11.5px;color:var(--ink-dim)' }, 'Next period expected'),
          h('div', { class: 'd' }, fmtDate(st.next)),
          h('div', { class: 'w' }, blurb)));
        body.append(h('div', { class: 'sy-bar' }, h('i', { style: `width:${Math.max(3, Math.min(100, Math.round(st.day / st.avg * 100)))}%` })));
        body.append(h('div', { class: 'sy-stats' },
          h('span', {}, st.quality === 'estimate' ? 'avg 28 days (assumed)' : `avg ${st.avg} days`),
          h('span', {}, `last: ${fmtShort(st.last)}`),
          h('span', {}, `${st.logged} logged`),
          st.cycles ? h('span', {}, `${st.cycles} cycle${st.cycles === 1 ? '' : 's'} measured`) : '',
          st.quality === 'good' ? h('span', {}, `±${st.window} days`) : ''));
        // a gap far longer than any real cycle almost always means a missed log
        st.skipped.forEach(g => body.append(h('div', { class: 'sy-warn' },
          `⚠️ The ${g.len}-day gap between ${fmtShort(g.from)} and ${fmtShort(g.to)} is longer than a normal cycle (21–35 days), so it wasn’t used for the average — it looks like a period in between wasn’t logged. Add it below and the prediction sharpens right away.`)));
        st.tooShort.forEach(g => body.append(h('div', { class: 'sy-warn' },
          `⚠️ ${fmtShort(g.from)} and ${fmtShort(g.to)} are only ${g.len} days apart — too close for two cycles, so that pair was skipped. Remove one if it was logged twice.`)));
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

    const placeIn = h('input', { type: 'text', maxlength: '200', value: draft.place || '', placeholder: 'Search, or paste a Google Maps link' });
    const results = h('div', { class: 'sy-results' });
    const searchBtn = h('button', { class: 'btn btn-sm', onclick: () => doSearch(true) }, '🔍');
    const pinBtn = h('button', { class: 'btn btn-sm btn-block', style: 'margin-top:9px', onclick: () => {
      openPinPicker(draft.lat, draft.lon, res => {
        draft.lat = res.lat; draft.lon = res.lon;
        if (!placeIn.value.trim() && res.name) placeIn.value = res.name;
        draft.place = placeIn.value.trim();
        results.innerHTML = ''; setPinned(true); Store.Sound.good();
      });
    } }, '📍 Drop a pin on the map');
    const pinNote = h('div', { class: 'sy-pinnote' });
    const setPinned = on => {
      pinNote.className = 'sy-pinnote' + (on ? ' on' : '');
      pinNote.textContent = on ? '📍 Pinned — it’ll show on the map' : 'Tip: share a place from Google Maps and paste the link here — it fills in the spot and its name automatically. Or drop a pin yourself.';
    };
    setPinned(draft.lat != null);
    sheet.append(h('div', { class: 'sy-field' }, h('label', {}, 'Place (optional)'),
      h('div', { class: 'sy-inline' }, placeIn, searchBtn), pinBtn, results, pinNote));
    // paste-a-link / paste-coords is instant; typing searches after a pause
    let searchTimer = null, resolving = false;
    // applies a resolved location: pin it, and name it from the link when the
    // box is still holding the raw URL
    function applyLocation(lat, lon, name) {
      draft.lat = lat; draft.lon = lon;
      const looksLikeUrl = /^https?:\/\//i.test(placeIn.value.trim()) || parseCoords(placeIn.value.trim());
      if (name && looksLikeUrl) { placeIn.value = name; draft.place = name; }
      results.innerHTML = ''; setPinned(true); Store.Sound.good();
      if (!name && looksLikeUrl) reverseName(lat, lon).then(n => {
        if (n && (/^https?:\/\//i.test(placeIn.value.trim()) || parseCoords(placeIn.value.trim()))) { placeIn.value = n; draft.place = n; }
      });
    }
    placeIn.addEventListener('input', () => {
      const v = placeIn.value.trim();
      const direct = parseMapsUrl(v) || (parseCoords(v) ? Object.assign({ name: null }, parseCoords(v)) : null);
      if (direct) { applyLocation(direct.lat, direct.lon, direct.name); return; }
      if (isShortMapLink(v)) {
        // resolve the shared link automatically — no coordinate-copying needed
        if (resolving) return;
        resolving = true;
        results.innerHTML = '';
        results.append(h('div', { class: 'sy-tip' }, '🔗 Opening your link to find the place…'));
        expandShortLink(v).then(full => {
          resolving = false;
          if (placeIn.value.trim() !== v) return;                          // they typed on
          const got = full && parseMapsUrl(full);
          if (got) { applyLocation(got.lat, got.lon, got.name); return; }
          results.innerHTML = '';
          results.append(h('div', { class: 'sy-tip' },
            h('b', { style: 'display:block;margin-bottom:6px' }, 'Couldn’t read that link 🙈'),
            h('div', {}, 'In Google Maps, press and hold the exact spot until a red pin drops — the coordinates appear at the bottom. Copy and paste them here.'),
            h('div', { style: 'margin-top:7px' }, 'Or open the link and copy the long URL from the address bar:'),
            h('a', { class: 'sy-openlink', href: v, target: '_blank', rel: 'noopener' }, '↗ Open this link'),
            h('div', { style: 'margin-top:7px' }, 'Or just tap “Drop a pin on the map” above.')));
        });
        return;
      }
      clearTimeout(searchTimer);
      if (v.length < 3) { results.innerHTML = ''; return; }
      searchTimer = setTimeout(() => doSearch(false), 500);
    });

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

    async function doSearch(explicit) {
      const q = placeIn.value.trim();
      if (q.length < 3) { if (explicit) placeIn.focus(); return; }
      if (parseCoords(q) || isShortMapLink(q)) return;
      searchBtn.textContent = '…';
      const list = await searchPlaces(q);
      searchBtn.textContent = '🔍';
      if (placeIn.value.trim() !== q) return;                 // typed on — this result is stale
      results.innerHTML = '';
      if (list === null) { results.append(h('div', { class: 'sy-tip' }, 'Search is unreachable right now — drop a pin instead, or just save the name as text.')); return; }
      if (!list.length) {
        results.append(h('div', { class: 'sy-tip' }, 'No match. Try fewer words (“leela gurgaon”), or tap “Drop a pin” and place it exactly — that always works.'));
        return;
      }
      list.forEach(p => results.append(h('button', { onclick: () => {
        draft.lat = p.lat; draft.lon = p.lon; draft.place = p.label;
        placeIn.value = p.label; results.innerHTML = ''; setPinned(true); Store.Sound.good();
      } }, h('b', {}, p.label), p.sub ? h('span', {}, p.sub) : '')));
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

  window._storyTest = { cycleStats, nextAnniversary, tileXY, daysBetween, parseCoords, parseMapsUrl, isShortMapLink, expandShortLink, searchPlaces, worldPx, worldLatLon, openPinPicker };
})();
