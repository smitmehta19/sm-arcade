/* ============================================================
   CONFIG — edit this file only
   ============================================================ */

/* ---- Site password gate (v2 — PBKDF2) ----
   One shared password, re-asked every `everyDays` days per device.
   Only the salts + a PBKDF2-SHA256 verifier (310k iterations) live in
   this public repo — plaintext is never committed, and the Firebase
   ROOM id is DERIVED from the password so it isn't in the repo either.
   To change the password (both phones re-enter it once, data migrates
   automatically): run in node →
     node -e "const c=require('crypto');const pw='NEWPASSWORD'.toLowerCase();
       console.log('verifier:', c.pbkdf2Sync(pw,'sm-gate-v2-verify-9f27c1',310000,32,'sha256').toString('hex'))"
   …then paste the printed verifier below and set the OLD derived room
   as LEGACY_ROOM in CLOUD (ask the app: it logs it on boot).
   Passwords are checked lowercase+trimmed, so caps never matter. */
window.GATE = {
  saltV: 'sm-gate-v2-verify-9f27c1',
  saltR: 'sm-gate-v2-room-4e81aa',
  iters: 310000,
  verifier: 'c6f91c85697a2120025ca65bfcd4677431249de6f1e8491b76adaefbe4cb04cd',
  everyDays: 10,
};

/* ---- The two players (you!) ---- */
window.PLAYERS_DEFAULT = [
  { id: 'p1', name: 'Smit',  emoji: '🦊', color: '#00f0ff' },  // player 1 = cyan
  { id: 'p2', name: 'Meera', emoji: '🦋', color: '#ff2fa6' },  // player 2 = magenta
];

/* ============================================================
   CLOUD SYNC (Firebase Realtime Database) — OPTIONAL
   ------------------------------------------------------------
   Leave as-is to run in LOCAL mode (scores saved on each device).
   To sync scores across both your phones (Firebase free "Spark" plan):
     1. Go to https://console.firebase.google.com  → Add project (free).
     2. Build → Realtime Database → Create database (pick a region near you).
     3. Build → Authentication → Get started → enable "Anonymous" sign-in.
     4. Realtime Database → Rules tab → paste the contents of database.rules.json
        (in this repo) and Publish. DO NOT leave it in "test mode" — a public repo
        means bots can find your project; test-mode rules are open to the world.
     5. Project settings (gear) → "Your apps" → Web app (</>) → register.
     6. Copy the config values it shows you into the object below.
     7. Set ENABLED to true. Commit & push. Both phones now share live scores.
   The values below are SAFE to put in a public GitHub repo (they are client keys;
   all real security comes from the Security Rules, not from hiding the key).
   ============================================================ */
window.CLOUD = {
  ENABLED: true,                              // cloud sync ON
  ROOM: null,                                 // ⚠ derived from the gate password at runtime — never committed
  LEGACY_ROOM: 'smit-meera-e7c3bf6c17204234', // pre-v48 room; store.js migrates its data to the derived room, then deletes it
  config: {
    apiKey:            'AIzaSyAZJiYJ_5uWzpURqOnsOBhF6CCspwpvRys',
    authDomain:        'sm-arcade.firebaseapp.com',
    databaseURL:       'https://sm-arcade-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId:         'sm-arcade',
    storageBucket:     'sm-arcade.firebasestorage.app',
    messagingSenderId: '437173119756',
    appId:             '1:437173119756:web:f7015819c4c02884177729',
  },
};
