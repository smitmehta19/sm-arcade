/* ============================================================
   GATE — a single shared password for the whole site.
   Asked once per device, then again every GATE.everyDays days.
   The password is stored ONLY as a SHA-256 hash in config.js
   (the repo is public, so plaintext must never be committed).
   ⚠ This is a privacy curtain, not bank-grade security — the
   source is public and the check runs client-side. Real data
   protection stays where it always was: Firebase rules + ROOM.
   To change the password: hash the new one (see config.js) and
   bump GATE.sha256.
   ============================================================ */
const Gate = (() => {
  const KEY = 'sm_gate_v1'; // ms timestamp of the last successful unlock on this device
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
  .gate-err{ min-height:18px; margin-top:10px; font-size:13px; font-weight:600; color:#ff4d9d; }
  .gate-hint{ margin-top:16px; font-size:11.5px; color:#5d6788; letter-spacing:.3px; }
  .gate-card.shake{ animation:gateShake .4s; }
  @keyframes gateShake{ 0%,100%{transform:translateX(0);} 20%,60%{transform:translateX(-8px);} 40%,80%{transform:translateX(8px);} }
  `;

  async function sha256(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function unlocked() {
    const g = cfg(); if (!g || !g.sha256) return true;                 // no gate configured
    if (!(window.crypto && crypto.subtle)) return true;                // ancient browser → fail open, never brick the app
    const t = +(localStorage.getItem(KEY) || 0);
    return t > 0 && (Date.now() - t) < (g.everyDays || 10) * 864e5;
  }

  // Runs cb only once the device is unlocked; otherwise shows the lock screen first.
  function ready(cb) {
    if (unlocked()) { cb(); return; }
    document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
    const card = document.createElement('div'); card.className = 'gate-card';
    card.innerHTML = `
      <div class="gate-logo">S × M</div>
      <div class="gate-sub">This arcade is a private party for two. 💞<br>Whisper the password to come in.</div>
      <input class="gate-in" type="password" placeholder="password" autocomplete="current-password" autocapitalize="off" spellcheck="false">
      <button class="gate-btn">Enter the arcade →</button>
      <div class="gate-err"></div>
      <div class="gate-hint">You'll be asked again every ${(cfg().everyDays || 10)} days on this device.</div>`;
    const wrap = document.createElement('div'); wrap.className = 'gate';
    wrap.append(card); document.body.append(wrap);
    const inp = card.querySelector('.gate-in'), err = card.querySelector('.gate-err');
    async function attempt() {
      const v = inp.value.trim().toLowerCase();
      if (!v) { inp.focus(); return; }
      let hex = null;
      try { hex = await sha256(v); } catch (e) { hex = null; }
      if (hex === null || hex === cfg().sha256) {                      // hashing unavailable → fail open
        localStorage.setItem(KEY, String(Date.now()));
        wrap.remove(); cb();
      } else {
        err.textContent = '✕ Nope — that’s not it.';
        inp.value = '';
        card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
        inp.focus();
      }
    }
    card.querySelector('.gate-btn').addEventListener('click', attempt);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });
    setTimeout(() => inp.focus(), 60);
  }

  return { ready, unlocked, _sha256: sha256, _KEY: KEY };
})();
