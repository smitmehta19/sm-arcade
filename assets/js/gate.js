/* ============================================================
   GATE v2 — one shared password for the whole site, and the real
   security boundary for the data.
   - The password is verified with PBKDF2-SHA256 (310k iterations,
     salted). Only the salt + verifier live in the public repo, and
     the slow KDF makes offline guessing ~a million times harder
     than the old plain SHA-256.
   - The Firebase ROOM id is DERIVED from the password (different
     salt), so it is no longer committed anywhere. Without the
     password you cannot even compute where the data lives.
   - Asked again every GATE.everyDays days per device.
   To change the password: compute new verifier via node/console
   (see config.js comment) — both phones must re-enter it once, and
   store.js auto-migrates the data to the newly-derived room.
   ============================================================ */
const Gate = (() => {
  const KEY = 'sm_gate_v2'; // JSON {t: unlock ms, room: derived room id}
  const cfg = () => window.GATE || null;

  const css = `
  .gate{ position:fixed; inset:0; z-index:500; display:grid; place-items:center; padding:20px;
    background:radial-gradient(120% 80% at 50% -10%, #0c1330 0%, var(--bg, #05070f) 60%); }
  .gate-card{ width:100%; max-width:360px; text-align:center; padding:34px 26px;
    border-radius:24px; background:rgba(20,26,48,.66); border:1px solid rgba(170,190,255,.14);
    backdrop-filter:blur(20px); box-shadow:0 24px 60px -18px rgba(0,0,0,.7); animation:floatUp .5s ease both; }
  .gate-logo{ font-family:'Orbitron',sans-serif; font-weight:900; font-size:32px; letter-spacing:4px;
    color:#9b7bff; text-shadow:0 0 24px rgba(155,123,255,.7); }
  .gate-sub{ color:#9aa6c8; font-size:13.5px; margin:14px 0 22px; line-height:1.5; }
  .gate-in{ width:100%; box-sizing:border-box; background:#090c18; border:1px solid rgba(170,190,255,.14);
    border-radius:13px; padding:14px; color:#eaf0ff; font-size:16px; letter-spacing:2px; text-align:center; outline:none; }
  .gate-in:focus{ border-color:#9b7bff; box-shadow:0 0 18px -4px #9b7bff; }
  .gate-btn{ width:100%; margin-top:12px; padding:14px; border:none; border-radius:13px; cursor:pointer;
    font-family:'Sora',sans-serif; font-weight:700; font-size:15px; color:#fff;
    background:linear-gradient(135deg,#9b7bff,#ff4d9d); box-shadow:0 10px 26px -10px rgba(255,77,157,.7); }
  .gate-btn:active{ transform:scale(.96); }
  .gate-btn[disabled]{ opacity:.6; }
  .gate-err{ min-height:18px; margin-top:10px; font-size:13px; font-weight:600; color:#ff4d9d; }
  .gate-hint{ margin-top:16px; font-size:11.5px; color:#5d6788; letter-spacing:.3px; }
  .gate-card.shake{ animation:gateShake .4s; }
  @keyframes gateShake{ 0%,100%{transform:translateX(0);} 20%,60%{transform:translateX(-8px);} 40%,80%{transform:translateX(8px);} }
  `;

  // PBKDF2-SHA256 → hex. Deliberately slow (iterations from config).
  async function kdf(pw, salt, iters) {
    const enc = s => new TextEncoder().encode(s);
    const key = await crypto.subtle.importKey('raw', enc(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc(salt), iterations: iters }, key, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function stored() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function applyRoom(room) { if (window.CLOUD && room) window.CLOUD.ROOM = room; }
  function unlocked() {
    const g = cfg(); if (!g || !g.verifier) return true;
    if (!(window.crypto && crypto.subtle)) return true;              // ancient browser → fail open on the legacy room
    const st = stored();
    return !!(st && st.room && st.t && (Date.now() - st.t) < (g.everyDays || 10) * 864e5);
  }

  function ready(cb) {
    const g = cfg();
    if (!g || !g.verifier || !(window.crypto && crypto.subtle)) {    // ungated / fail-open → legacy room keeps the app alive
      applyRoom(window.CLOUD && window.CLOUD.LEGACY_ROOM); cb(); return;
    }
    if (unlocked()) { applyRoom(stored().room); cb(); return; }
    document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
    const card = document.createElement('div'); card.className = 'gate-card';
    card.innerHTML = `
      <div class="gate-logo">S × M</div>
      <div class="gate-sub">This arcade is a private party for two. 💞<br>Whisper the password to come in.</div>
      <input class="gate-in" type="password" placeholder="password" autocomplete="current-password" autocapitalize="off" spellcheck="false">
      <button class="gate-btn">Enter the arcade →</button>
      <div class="gate-err"></div>
      <div class="gate-hint">You'll be asked again every ${(g.everyDays || 10)} days on this device.</div>`;
    const wrap = document.createElement('div'); wrap.className = 'gate';
    wrap.append(card); document.body.append(wrap);
    const inp = card.querySelector('.gate-in'), err = card.querySelector('.gate-err'), btn = card.querySelector('.gate-btn');
    let busy = false;
    async function attempt() {
      if (busy) return;
      const v = inp.value.trim().toLowerCase();
      if (!v) { inp.focus(); return; }
      busy = true; btn.disabled = true; btn.textContent = 'Checking…'; err.textContent = '';
      let ver = null;
      try { ver = await kdf(v, g.saltV, g.iters); } catch (e) { ver = null; }
      if (ver === null) {                                            // KDF unavailable mid-flight → fail open, never brick
        applyRoom(window.CLOUD && window.CLOUD.LEGACY_ROOM);
        localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), room: window.CLOUD && window.CLOUD.LEGACY_ROOM }));
        wrap.remove(); cb(); return;
      }
      if (ver === g.verifier) {
        const room = 'sm-' + (await kdf(v, g.saltR, g.iters)).slice(0, 24);
        localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), room }));
        applyRoom(room);
        wrap.remove(); cb();
      } else {
        busy = false; btn.disabled = false; btn.textContent = 'Enter the arcade →';
        err.textContent = '✕ Nope — that’s not it.';
        inp.value = '';
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        inp.focus();
      }
    }
    btn.addEventListener('click', attempt);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
    setTimeout(() => inp.focus(), 60);
  }

  return { ready, unlocked, _kdf: kdf, _KEY: KEY };
})();
