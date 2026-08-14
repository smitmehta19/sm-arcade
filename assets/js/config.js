/* ============================================================
   CONFIG — edit this file only
   ============================================================ */

/* ---- Site password gate ----
   One shared password for the whole site, re-asked every `everyDays`
   days per device. Only the SHA-256 hash lives here (public repo!).
   To change the password: run in any browser console →
     crypto.subtle.digest('SHA-256', new TextEncoder().encode('newpassword'))
       .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')))
   …then paste the printed hash below. Passwords are checked
   lowercase+trimmed, so caps don't matter when typing it. */
window.GATE = {
  sha256: '5209cff3c58d5ac883d0e28614ee1436de572a500f6bdb3241e5780680f4ec9b', // current password: smitmeera
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
  ROOM: 'smit-meera-e7c3bf6c17204234',        // private shared room (both devices use this)
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
