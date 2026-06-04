# 🎮 S × M Arcade — Smit vs Meera

A private, neon-retro **2-player game arcade** built just for Smit & Meera.
20 polished games, a persistent head-to-head scoreboard, smooth play, and it installs
on your phones like a real app. Pure HTML/CSS/JS — no build step, hosts free on GitHub Pages.

> **Smit = cyan 🦊 · Meera = magenta 🦋.** Loser owes the winner a kiss. 😘

---

## ✨ Features
- **20 two-player games** across Strategy, Word, Reflex, Luck & a couple-special.
- **Head-to-head scoreboard** — total wins, per-game records, win streaks, rivalry meter.
- **Player profiles** — names, colors, avatar emojis.
- **Cloud sync (optional)** — share scores across both phones via Firebase, or run local-only.
- **Installable PWA** — add to home screen, works offline.
- **Neon retro UI** — scanlines, glow, arcade fonts, animations, sound effects, dark/light.
- **Fully responsive** — phone-first, great on tablet & laptop.

## 🕹 The 20 Games
**Strategy:** Tic-Tac-Toe · Connect Four · Dots & Boxes · Checkers · Reversi · Gomoku · Mancala · Nim · Battleship
**Word:** Word Duel · Hangman
**Reflex:** Speed Math · Pong · Air Hockey · Snake Duel · Reaction Duel
**Luck:** Memory Match · Rock Paper Scissors · Dice Duel
**Couple:** Who Knows Who? 💞

---

## 🚀 Host it on GitHub Pages (free)

1. Create a new repo on GitHub, e.g. `smit-meera-arcade`.
2. Upload **all the files in this folder** (keep the folder structure) to the repo,
   or push with git:
   ```bash
   git init
   git add .
   git commit -m "S x M Arcade"
   git branch -M main
   git remote add origin https://github.com/<your-username>/smit-meera-arcade.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   pick **main** / **/ (root)**, Save.
4. Wait ~1 minute → your site is live at
   `https://<your-username>.github.io/smit-meera-arcade/`.
5. Open it on both phones → menu → **Add to Home Screen**. 📲

> Tip: a quick local test → run `python -m http.server` in this folder and open
> `http://localhost:8000`. (Cloud sync & install need http/https, not `file://`.)

---

## ☁️ Turn on cross-phone score sync (optional)

By default scores save **on each device**. To share one scoreboard across both phones,
add a free Firebase **Realtime Database** (Spark plan — no credit card, ~5 minutes):

1. Go to <https://console.firebase.google.com> → **Add project** (free).
2. **Build → Realtime Database → Create database** (choose a region near you).
3. **Build → Authentication → Get started → enable _Anonymous_ sign-in.**
   (The app signs in anonymously so the rules below can require auth.)
4. **Realtime Database → Rules** tab → paste the contents of
   [`database.rules.json`](database.rules.json) and **Publish**.
   ⚠️ **Do _not_ leave it in "test mode."** Your repo is public, so test-mode rules
   (`".read"/".write": true`) are open to the entire internet. The provided rules
   require sign-in and scope access to your room.
5. **Project settings (⚙) → Your apps → Web (`</>`) → register app.**
6. Copy the shown config values into **`assets/js/config.js`**, set `ENABLED: true`,
   and pick any long, hard-to-guess `ROOM` string (it acts like a shared password).
7. Commit & push. Both phones now share live scores under the same `ROOM`.

**Why this is safe:** the Firebase web API key is *meant* to be public — it only
identifies the project and grants no data access. All security comes from the
Security Rules, not from hiding the key. This design uses **no Cloud Functions and no
Cloud Storage** (both require the paid Blaze plan), so it stays 100% free.

**Want it locked to only you two (strongest)?** Switch step 3 to **Google** sign-in,
sign in once on each phone, copy each player's **UID** from the Authentication tab,
and replace the rule lines with a UID allowlist:

```json
{
  "rules": {
    "rooms": {
      "$room": {
        ".read":  "auth != null && (auth.uid === 'UID_SMIT' || auth.uid === 'UID_MEERA')",
        ".write": "auth != null && (auth.uid === 'UID_SMIT' || auth.uid === 'UID_MEERA')"
      }
    }
  }
}
```

---

## 🎨 Personalize
Open **`assets/js/config.js`** to change names, avatar emojis, or colors.
You can also edit names/avatars right inside the app on the **Us** tab.

Built with neon and love. 💞
