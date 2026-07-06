# 🧠 CONTEXT — S × M Arcade (agent handoff notes)

> **Read this first when picking up this project.** It captures architecture, decisions, and the
> gotchas/mistakes that aren't obvious from the code. Keep it current when you change things.
>
> **Current state (2026-07-02):** 37 playable games + a Tournament meta-game, a Date Night
> Roulette section, per-turn timers, leave-consent, badges/banter/juice, full design polish,
> a **generic per-move motion layer** (slides/flips/drops/capture-ghosts + last-move ring),
> canvas confetti physics, haptic feedback, and touch-press board feel.
> New in batch 3: **Chess, Dominoes, SOS, GOPS, Story Builder** + the **Score Duels** pack
> (Reaction / Speed Math / Snake / 2048 — async local runs, only the score syncs).
> **Graphics pass 2 (all tiers):** SVG chess piece set · Memory 3D card flips (cross-render
> replay via module-level `memPrev`) · win-line sweeps (`fxWinLine` — ttt/c4/gomoku/ultimate) ·
> winner-coloured result overlay + edge flash + streak "ON FIRE" stamp (`Overlay.show`
> `color`/`stamp`) · impact ripples in MotionFX · rolling digits (`rollNum`) on turnbar/
> mini-score/Scores · turn hand-off orb · View Transitions on route change (progressive) ·
> gyro parallax on the aurora (Android only, CSS `translate` so it composes with the
> keyframe transform).
> **Monthly seasons:** `Store` tracks `seasons {cur:{ym,p1,p2,draws}, past[]}` — lazy rollover
> in `rollSeasons()` (called by `recordResult` AND `Store.seasonsTick()` from renderScores, so a
> fresh month shows 0–0 without a game); finished months archive with their score, game-less
> months don't; `past` capped at 36; `resetScores` clears it; stripped-empty-array self-heals.
> Scores page shows the month race card, last-month result + trophy cabinet (`.season-card`).
> **Service worker cache: `sm-arcade-v43`** (v42 fixed board wobble: explicit 1fr grid rows).

---

## What this is
A **private, online, 2-player arcade** for **Smit** & **Meera** — a **long-distance couple**. Each plays
on their **own phone**; they play the **same live game** together (turn-based, cloud-synced). The vibe is
intentionally personal: flirty/spicy content is welcome (consensual, just the two of them).

- **Players:** Smit = seat **0** = **cyan** (🦊). Meera = seat **1** = **magenta** (🦋).
- **God-Mode:** only **Smit's device** (identity 0) may change names / reset / adjust scores. Meera gets a
  troll popup (`trollMeera()` / `SM_TROLLS`). Name-change password = **`change`**. Score reset & adjust
  password = **`smitwins`**.
- **Live site:** https://smitmehta19.github.io/sm-arcade/ · **Repo:** https://github.com/smitmehta19/sm-arcade
- **Local path:** `…\Desktop\Data\Code-r\NEwCOde\ClaudeCode\smit-meera-arcade` (the old
  `…\2026\April\TP analysis\smit-meera-arcade` copy no longer exists)
- **Stack:** static HTML/CSS/vanilla JS (**NO build step**) · GitHub Pages · Firebase Realtime Database
  (anonymous auth) · installable PWA. Fonts: Orbitron / Chakra Petch / Sora (Google Fonts, non-blocking).

---

## File map
```
index.html                 shell: <script> includes (ORDER MATTERS), font links, nav, overlay markup
sw.js                      service worker — NETWORK-FIRST. Bump CACHE + add new JS to ASSETS every deploy.
manifest.webmanifest       PWA manifest
database.rules.json        Firebase rules (rooms + matches + presence; auth required) — already published
CONTEXT.md / README.md     this file / user readme
assets/css/styles.css      "Refined Neon glass" theme: tokens, animation lib, ALL shared component styles
                           + design-polish layer + CLEAN GRID override (bottom of file)
assets/js/
  config.js                PLAYERS_DEFAULT + window.CLOUD (Firebase keys, ENABLED, ROOM)
  store.js                 state, localStorage, Firebase init (anon auth), scoreboard sync (server-timestamp
                           versioning), per-device identity, Net API (presence/match/nudge/react), WebAudio Sound,
                           dateNight lists (Store.dateToggle)
  icons.js                 custom inline SVG line-icons — Icons.game(id) / Icons.ui(name)
  ui.js                    Games registry, helpers (h/$/esc/clone), Overlay, Router, identity gate, lobby,
                           match lifecycle, networked stage, TIMER system, tournament engine, banter/juice,
                           Scores+badges+score-adjuster, Settings, rules, smModal/trollMeera
  words.js                 dictionary (ghost/word-duel/hangman/letterpress validation)
  games-classic.js         tic-tac-toe, connect-four, dots-boxes, checkers, reversi, gomoku
  games-mind.js            battleship, memory, word-duel, hangman, rps, couple-quiz
  games-fun2.js            ghost, two-truths            (tug-of-war was REMOVED)
  games-strategy2.js       pentago, hex, nine-mens-morris, quoridor, quarto, code-breaker
  games-dice.js            yahtzee, liars-dice          (SVG pip dice + roll animation)
  games-cards.js           jaipur
  games-abstract.js        onitama
  games-word2.js           letterpress, codenames-duet  (codenames is co-op: coop:true)
  games-draw.js            draw-guess                   (coop)
  games-ultimate.js        ultimate-ttt
  games-chess.js           chess — full rules (castle/en-passant/promotion picker/50-move);
                           host = White, board flips for the other seat; test hooks exposed
  games-board3.js          dominoes (draw&block), sos (6×6, extra turn on score), gops (secret bids)
  games-story.js           story-builder (coop: alternate sentences, "The End" at 6+, auto at 14)
  games-duels.js           SCORE DUELS: reaction-duel, speed-math, snake-duel, 2048-race.
                           Async local runs — no `turn`; state = {seed, results:[null,null]};
                           both play the SAME seeded run locally in a body-mounted fullscreen
                           overlay (survives sync repaints), only the final score commits.
                           `latest[id]` ctx map prevents clobbering the partner's result.
  games-tournament.js      tournament (META-game: isTournament:true, buildSchedule —
                           pools non-coop Word+Strategy, so chess/dominoes/sos auto-join)
  datenight-data.js        window.DATE_NIGHT = {cats, lens, ideas[162]} — Date Night Roulette data (ids d1..d162)
  datenight.js             window.renderDateNight — slot-machine UI + its own injected CSS
  app.js                   boot, chrome wiring, nav SVG icons, leave-guard, initNet + initCloud, router, SW reg
```
Per-game board CSS is injected as a `<style>` from inside each `games-*.js` (and `datenight.js`), but it
inherits shared tokens (`--p1`, `--p2`, `--panel`, `--accent`, etc.). **Script order in index.html matters**:
config → store → icons → ui → words → games-* → datenight-data → datenight → app.

---

## Game module contract
`Games.register({ id, name, emoji, category, tagline, accent, init, render, coop?, isTournament?, test?, skipTurn? })`
- `init(hostSeat)` → serializable state incl. `turn` (+ scores/phase as needed).
- `render(ctx)` → fully draws the board from `ctx.state` into `ctx.root` (re-runs on EVERY sync).
- `ctx = { root, h, $, esc, clone, players[], state, me, turn, isMyTurn, status, sound, turnBar(opts),
  msg(text,color), commit(next, winner?), seat(i) }`
- `commit(next)` continues; `commit(next, 0|1|'draw')` ends the game; co-op uses `'coop-win'|'coop-loss'`.
- Build next state from `ctx.clone(ctx.state)`; flip `next.turn` yourself. **Ephemeral UI** (selection,
  typing buffers) stays in the render closure — only committed state syncs.
- `skipTurn(state, opp)` (optional) → clean "pass" state for a timer **skip** on phase-based games
  (defined for **yahtzee** & **pentago** so a skip doesn't hand the opponent stale mid-turn state).
- `test` (optional) exposes pure logic for the headless harness.
- **Per-move animations are automatic** via the `MOVE_FX` map + `MotionFX` module (top of ui.js):
  the stage snapshots piece rects before each repaint and FLIP-animates the diff (slide / flip /
  drop / capture-ghost + a gold `.fx-mark` ring). A new board game only needs a `MOVE_FX` entry
  `{ sel, kind: 'class'|'text'|'self', drop?, ghost? }` — `'class'` reads the owner from a
  `p0`/`p1` class, `'text'` from cell text, `'self'` from the full class list (unique pieces).
  No game-logic changes; failures are caught and purely cosmetic.

---

## Match / sync model
Active match at Firebase `matches/<ROOM>/active`:
```
{ gameId, host, status:'waiting'|'active'|'finished',
  state,          // ⚠ JSON STRING (gotcha #1)
  starter,        // seat that started the current round
  roundWinner,    // 0|1|'draw'|'coop-win'|'coop-loss'
  timer,          // { on, secs, mode:'skip'|'forfeit' }
  deadline,       // server-ms when the current turn's clock expires (gotcha #2)
  endReq,         // seat requesting to END (consent handshake)
  by, t }
```
- **No more best-of-3 series** — every individual game win records immediately (series system was removed).
- Presence: `presence/<ROOM>/<seat>` = `{online,name,ts}` (onDisconnect → offline).
- Scoreboard + dateNight lists: `rooms/<ROOM>` (the whole `Store` state, set as an object).
- Banter (emotes/taunts): `matches/<ROOM>/react` — **separate path so it never re-renders the live game.**
- Nudges ("come online"): `matches/<ROOM>/nudges/<seat>`.
- Synced clock: `Store.Net.serverNow()` = `Date.now() + serverOffset` (offset from `.info/serverTimeOffset`).

### Key flows (all in ui.js)
- **Identity gate** → device picks Smit/Meera once (localStorage `sm_identity_v1`).
- **Lobby** → presence dots, invite/resume banners, "nudge to come online", Tournament CTA.
- **startMatch** → creates the match **immediately** (`waiting`), navigates to `#/play/<id>`, THEN (if the game
  supports a timer) opens the timer picker on top. Partner taps **Join** → `active` + arms `deadline`.
- **Per-turn timer** → `TIMER_GAMES` map, `timerCap`, `showTimerPanel` (a singleton overlay), `applyTimer`,
  `paintTimer`/`fireTimeout`. Both players see the picker when they start a game; both **"⏭️ Chance gone"
  (skip)** and **"💀 Forfeit"** are always offered. Enforcement: active player fires at 0, opponent after a 2s
  grace (covers a dead opponent). Tournaments fall back to a per-sub-game default mode.
- **Tournament** = meta-game in ui.js: flat `schedule` array (length N: 3/5/7/10/custom), `tournamentSetup`,
  `startTournament`, `tourCommit`, `advanceTournament`. Co-op games excluded. Each sub-game records normally;
  champion gets a bragging-only `tourWins` bump.
- **Leave-consent** → `requestEndGame` sets `endReq`; partner agrees (`agreeEndGame`) or cancels. The **back
  arrow AND brand link** route through this (app.js `leaveGuard`). Offline/not-active partner ⇒ clean exit.
- **Scores tab** → big scoreboard, win-share meter, badges (incl. funny consolation ones), rivalry taunt,
  by-game table, and the **score adjuster** (Smit-only, `smitwins`, `scoreEditUnlocked` per-session).
- **Settings tab** (route `#/us`) → name change (Smit + `change`), theme/sound.
- **Date Night Roulette** (route `#/date`, "Dates" tab) → slot machine over 162 LDR ideas; Save/Done/Remove/
  Spin-again; done/removed/faved live in `Store.dateNight` (synced, shared). See `date-night-roulette` memory.

---

## ⚠️ Gotchas (load-bearing)
1. **RTDB strips `null` & empty arrays.** Game `state` is stored as a **JSON STRING** (stringify on write,
   parse in `paint`). The stage guard is `if (!state || typeof state !== 'object')` — **never require `turn`**
   (phase games legitimately lack it). The main `Store` state is an object; empty arrays (e.g. `dateNight.done`)
   get re-defaulted by `blankState()` on read.
2. **Scoreboard sync uses a SERVER TIMESTAMP, not a counter.** `save()` sets `state.updated = Date.now()+serverOffset`.
   (It used to be a per-device incrementing counter, which let the two phones disagree on "newest" and clobber
   each other — that was the score-sync / "Meera has the streak" bug.) Merge rule: `remote.updated >= local` wins.
3. **Service worker is NETWORK-FIRST.** Bump `CACHE` (vNN→vNN+1) **and** add any new JS file to `ASSETS` on
   **every** deploy, or phones keep stale code. Currently **v38**.
4. **Timer picker ↔ Router teardown.** `startMatch` navigates (fires `hashchange`→`Router.go`) and *then* opens
   the picker. `Router.go` must only tear the picker down when leaving that game's route — it's tracked by
   `timerPanelEl`/`timerPanelGame`. (Closing it unconditionally made the picker flash open and vanish.)
5. **`[hidden]{display:none!important}`** (top of styles.css) — author `display` rules otherwise beat the attribute.
6. **Identity is per-device localStorage** — the only signal for God-Mode/troll gating (a soft, fun lock).
7. **Hidden-info games** keep the secret in the shared DB (UI hides it). Fine for a trusting couple; true secrecy
   needs a server (avoided to stay free).
8. **Avatars stay emoji** (🦊/🦋) on purpose; everything else is custom SVG via `icons.js`.

---

## 🐞 Mistakes & pitfalls we hit (so you don't repeat them)
**Code bugs fixed:**
- *Score divergence* → server-timestamp versioning (gotcha #2).
- *Timer picker never showed* → Router teardown closed it on the start-navigation; fix = scope teardown to the
  game's own route (gotcha #4).
- *Tournament/timer crash* → match wasn't created until the host finished picking, so a concurrent start clashed.
  Fix = create the match first, patch the timer on after (`applyTimer`).
- *Skip corrupting phase games* → naive "flip turn" handed the opponent stale dice/phase; fix = optional
  `def.skipTurn` (yahtzee resets dice/rolls, pentago → opponent places).
- *Easy exit without consent* → back arrow + brand bypassed it; routed both through `requestEndGame`.
- *Quoridor walls broken* → fragile `getBoundingClientRect` pixel math; rewrote as a CSS grid with real wall
  gutters (a 17×17 track grid; cells on odd tracks, walls drop into even gutter tracks — no measuring).
- *Unicode dice looked cheap* → SVG pip dice + tumble roll animation.
- *8 new games showed a plain circle* → added custom SVG icons.
- *Letterpress didn't show played words* → added a played-words log (`plays` field, separate from `played`).
- *Cluttered game grid* (user feedback) → removed the per-card category pills + rainbow top stripes; one accent
  (the icon) + a quiet star.
- *Faves had no visible toggle* → added the ☆/★ button on cards.

**Process pitfalls:**
- **ruflo must stay disabled.** `.claude-flow/`, `.mcp.json`, `CLAUDE.md` are untracked junk — **NEVER `git add`
  them.** Always stage explicit files. (ruflo hooks once spawned 0-byte junk files on every edit.)
- **PowerShell 5.1:** `Get-Content` default encoding is ANSI and **corrupts UTF-8** (em-dashes/emojis) — use
  `-Encoding UTF8` or `git checkout -- <file>` to restore. Multiline `git commit -m` mangles — use
  `git commit -F <tempfile>`. No `&&`/`?:`/`??`.
- **`git push` prints a red `NativeCommandError` on stderr but exits 0** — harmless (git writes progress to stderr).
- **"I can't see the changes on my phone"** is almost always **PWA service-worker caching**, NOT a failed deploy.
  Verify the deploy is live (`gh api repos/smitmehta19/sm-arcade/pages/builds/latest`, and curl the live
  `sw.js`), then have them reload twice / force-quit the installed PWA.
- **Headless Chrome renders emoji as fallback boxes** — don't judge emoji glyphs from screenshots.

---

## Build / test / deploy
- **No build step.** Edit files, commit, push.
- **Portable node:** `C:/Users/Smit Mehta/nodejs-portable/node.exe`.
- **Logic harnesses (in `%TEMP%`, NOT in the repo):**
  - `sm-harness2.js` — module-level: loads all `games-*.js` with a mock DOM, drives each game to a winner.
  - `sm-harness3.js` — integration: loads the REAL `ui.js` with mocked Store/DOM and drives tournament/timer/
    nudge/banter/juice. Run: `node sm-harness*.js "<repo path>"`. Both must end "ALL … CHECKS PASSED ✓".
- **Visual checks:** Chrome is at `C:/Program Files/Google/Chrome/Application/chrome.exe`. Build a small preview
  HTML that links the **real** `assets/css/styles.css` (+ the relevant JS with a tiny `h`/`Store` mock) and
  `--headless=new --screenshot`. Use `--virtual-time-budget=NNNN` to let `setTimeout` animations land.
- **Deploy:** `git push origin main` → GitHub Pages auto-builds (~1 min). Confirm:
  `gh api repos/smitmehta19/sm-arcade/pages/builds/latest --jq '.status'` → `built`.
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Firebase (config in assets/js/config.js — public-safe keys)
- Project `sm-arcade`, region asia-southeast1. `ROOM` is a shared secret both devices use.
- Anonymous auth enabled; rules cover `rooms` + `matches` + `presence` (published).

---

## Open threads / next ideas
- **Date Night list curation:** the user wanted to review all 162 ideas before building (I built it directly so
  they can curate in-app via ✕ Remove). If they want to edit the master list, edit `datenight-data.js`
  (ids `d1`–`d162` map to the list I presented in chat).
- ~~Per-move piece animations~~ ✅ DONE (MotionFX layer, v39). Games with clear pieces are covered;
  memory/battleship/word games were deliberately left out (they have their own reveal interactions).
- Optional: a "surprise spin" Date Night shortcut on the home screen; result/rules overlays could get the same
  accent-glow polish; profile photos.
- Haptics (`navigator.vibrate`) ride the sound toggle (Android only; iOS Safari ignores it).
