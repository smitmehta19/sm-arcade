# 🧠 CONTEXT — S × M Arcade (agent handoff notes)

> **Read this first when picking up this project.** It captures architecture, decisions,
> and gotchas that aren't obvious from the code alone. Last major state: 21 games live,
> premium theme, best-of-3 series, God-Mode gating, end-game consent.

---

## What this is
A **private, online, 2-player game arcade** for **Smit** & **Meera** (a couple, often miles apart).
Each plays on their **own phone** and they play the **same live game** together (turn-based, synced).

- **Players:** Smit = seat **0** = **cyan**. Meera = seat **1** = **magenta**.
- **Live site:** https://smitmehta19.github.io/sm-arcade/
- **GitHub repo:** https://github.com/smitmehta19/sm-arcade (public). Owner: `smitmehta19`.
- **Local path:** `…\Desktop\Data\2026\April\TP analysis\smit-meera-arcade`
- **Stack:** static HTML/CSS/vanilla JS (NO build step) · GitHub Pages · Firebase Realtime Database (anonymous auth) · installable PWA.

---

## File map
```
index.html                  shell, <script> includes, Google-font links, result-overlay markup
sw.js                       service worker — NETWORK-FIRST, bump CACHE on every change (currently v12)
manifest.webmanifest        PWA manifest
database.rules.json         Firebase rules (rooms + matches + presence; auth required) — already published
CONTEXT.md / README.md      this file / user-facing readme
assets/icons/               icon.svg, favicon.svg
assets/css/styles.css       "Refined Neon glass" theme: tokens, animation lib, ALL component styles
assets/js/
  config.js                 PLAYERS_DEFAULT + window.CLOUD (Firebase keys, ENABLED:true, ROOM)
  store.js                  state, localStorage, Firebase init (anon auth), scoreboard sync,
                            identity (per-device), Net API (presence + match), Sound (WebAudio)
  icons.js                  custom inline SVG line-icons — Icons.game(id) / Icons.ui(name)
  ui.js                     Games registry, helpers (h/$/esc/clone), Overlay, Router, identity gate,
                            lobby, match lifecycle, networked stage, Scores+badges, Settings, GAME_RULES,
                            smModal + Meera-trolling
  games-classic.js          6 games: tic-tac-toe, connect-four, dots-boxes, checkers, reversi, gomoku
  games-mind.js             6 games: battleship, memory, word-duel, hangman, rps, couple-quiz
  games-fun2.js             3 games: ghost, two-truths, tug-of-war
  games-strategy2.js        6 games: pentago, hex, nine-mens-morris, quoridor, quarto, code-breaker
  games-arcade.js           EMPTY (reflex games removed; not loaded by index.html)
  app.js                    boot, chrome wiring, nav/sound SVG icons, initNet + initCloud, router, SW reg
```
**21 games total.** Game-board CSS is injected as a `<style>` from inside each `games-*.js` (NOT in styles.css), but it inherits the shared CSS tokens (`--p1`, `--panel`, `--accent`, etc.).

---

## Game module contract (netplay state machine)
Every game calls `Games.register({ id, name, emoji, category, tagline, accent, init, render })`:
- `init(hostSeat)` → returns a **serializable state object** that includes `turn` (and scores/phase as needed).
- `render(ctx)` → fully draws the board from `ctx.state` into `ctx.root` (re-rendered on every sync).

`ctx` =
```
{ root, h, $, esc, clone, players[], state, me /*my seat*/, turn, isMyTurn, status,
  sound, turnBar(opts), msg(text,color), commit(nextState, winner?), seat(i) }
```
- Produce the next state from a **clone** (`ctx.clone(ctx.state)`), mutate, then `ctx.commit(next)`.
- `commit(next)` → continue (turn-based games flip `next.turn` themselves; extra-turn games keep it).
- `commit(next, 0 | 1 | 'draw')` → ends the **round**.
- Phase/role games (rps, couple-quiz, code-breaker, two-truths, tug-of-war, hangman, quarto, pentago)
  manage their own phase in `state` and decide interactivity from `me` + `state` (not just `turn`).
- Ephemeral local UI (piece selection, typing buffers, staged moves) lives in the render closure and is
  NOT committed until the move completes — so the opponent only sees finished moves.

---

## Match / sync model
Active match lives at Firebase `matches/<ROOM>/active`:
```
{ gameId, host, status:'waiting'|'active'|'finished',
  state,                 // ⚠ JSON STRING (see gotcha #1)
  starter,               // seat that started the current round (alternates each round)
  series:{target:2, score:[a,b]},   // best-of-3
  roundWinner,           // 0|1|'draw' for the just-finished round
  seriesWinner,          // null until a player reaches target → then the series winner
  rematchReq,            // seat requesting a NEW series (handshake)
  endReq,                // seat requesting to END the game (consent)
  by, t }
```
Presence at `presence/<ROOM>/<seat>` = `{online, name, ts}` (onDisconnect flips offline).
Scoreboard at `rooms/<ROOM>` (Store; recordResult only fires at **series end**, once, by the committer).

### Key flows (all in ui.js)
- **Identity gate** → device picks Smit/Meera once (localStorage `sm_identity_v1`).
- **Lobby** → presence dots + invite banner; tap a game = `startMatch` (status `waiting`) → partner taps **Join**.
- **Best-of-3 series** → each round win bumps `series.score`; at target → `seriesWinner` set + `recordResult` once.
  Round overlay = *Next round / End series (consent)*; series-end overlay = *New series (handshake) / Play X next / Lobby*.
- **Rematch / New series** = handshake: `requestRematch` → partner `acceptRematch`; the **opposite of the requester** starts.
- **End game** = consent: `requestEndGame` (sets `endReq`) → partner `agreeEndGame` (clears match) or `cancelEndGame`.
  Offline partner ⇒ immediate exit. End-overlay has priority over all other overlays in `paint()`.
- **Settings tab** (route still `#/us`, label "Settings"): name change gated — only **Smit** (identity 0) with password
  **`change`**; **Meera** gets a random troll popup (`SM_TROLLS`). Score reset — Smit password **`smitwins`**; Meera trolled.

---

## ⚠️ Gotchas (the load-bearing ones)
1. **Firebase RTDB strips `null` and empty arrays.** A fresh board (all nulls) vanishes on round-trip →
   the other device reads `undefined` → crash. **Fix in place:** game `state` is stored as a **JSON string**
   (`JSON.stringify` in startMatch/advanceRound/acceptRematch/commitMove; `JSON.parse` in paint). Keep it that way.
2. **Service worker is NETWORK-FIRST** (`sw.js`) so fixes reach phones immediately when online (offline still works
   from cache). **Bump `CACHE` (e.g. v12→v13) on every deploy.** Add new JS files to the `ASSETS` list too.
3. **`[hidden]` needs `[hidden]{display:none!important}`** (top of styles.css) — author `display` rules override the
   attribute otherwise (this caused the early "stuck Winner overlay" bug).
4. **Identity is per-device localStorage** — it's the only signal for the God-Mode/troll gating (a soft, fun lock).
5. **Firebase rules** must cover `rooms`, `matches`, `presence` (see database.rules.json) — already published in console.
   **Anonymous auth** is enabled in the Firebase console.
6. **Avatars (🦊 Smit / 🦋 Meera) are intentionally still emoji** (personal choice). Everything else was de-emoji'd
   to custom SVG via `icons.js`. If asked to "remove all emoji," these + a few in-game message accents remain.
7. **Hidden-info games** (battleship ships, hangman word, word-duel answer, code-breaker secret) keep the secret in the
   shared DB — a determined inspector could read it; the UI hides it. Acceptable for a trusting couple; true secrecy
   needs a server (we avoid that to stay free).
8. **Reflex games removed** (pong, air-hockey, snake, reaction, speed-math) — unplayable over ~0.5s RTDB latency.
   `games-arcade.js` is intentionally empty.

---

## Build / test / deploy
- **Preview locally:** `.claude/launch.json` runs `python -m http.server 8123` over the repo; use the `preview_*` tools.
  Screenshots can time out only because of external font requests — the app itself works.
- **Testing games (no 2-device locally):** drive each game with a **mock `ctx`** harness in the preview (build a fake
  ctx whose `commit` captures state, click `.live` elements, loop to a win). This validated all 21 games' win/turn logic.
- **Deploy:** `git push origin main` → GitHub Pages auto-builds (~1 min).
  Status: `gh api repos/smitmehta19/sm-arcade/pages/builds/latest --jq '.status'` (wait for `built`).
  Remote sometimes has README edits by the user → `git pull --rebase origin main` before push.
- **Env quirks:** Windows PowerShell **5.1** — no `?:` ternary, no `&&`; for commit messages use `-m '...'` (single
  quotes, avoid `"`) or a here-string. Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Firebase project (config in assets/js/config.js — public-safe keys)
- Project `sm-arcade`, `databaseURL` `https://sm-arcade-default-rtdb.asia-southeast1.firebasedatabase.app`
- `ROOM` = `smit-meera-e7c3bf6c17204234` (shared room secret; both devices use it).
- To verify backend without phones: anon sign-in via Identity Toolkit REST, then read/write `matches/<ROOM>/__test`
  with the returned idToken (sandbox sometimes can't reach `identitytoolkit.googleapis.com` — that's a sandbox limit).

---

## Ideas / possible next steps (not done yet)
- Per-move piece animations (currently the whole board re-renders on each sync — only entrance animations exist).
- Sound polish / haptics; more badges & rivalry taunts.
- Optional photos for personalization (profile pics, a "Love Memory" tile set).
- More games; optional cloud-synced identity.
