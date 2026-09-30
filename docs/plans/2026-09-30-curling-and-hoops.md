# New games: Curling + Basketball Hoops

**Date:** 2026-09-30 · **Status:** approved 2026-09-30 — both games, in parallel with Knockout 2.0 · **Runs:** in parallel with Knockout 2.0 (separate files — no overlap)
**Files:** new `assets/js/games-curling.js`, new `assets/js/games-hoops.js`; wiring (index.html, sw.js, icons.js, GAME_RULES, TIMER_GAMES) done by me after each ships.

## Goal
More games in the style Smit likes (Knockout, Mini Golf, Cup Pong): physical, cartoony, cinematic 2.5D canvas, turn-based across two phones.

## 🥌 Curling
- **Match:** 4 ends. Each end, 4 stones each, **alternating throws**. The player who did *not* score the last end throws last (the "hammer").
- **Throw:** drag back from the stone (direction + power) and pick the curl **↺ / ↻** — the stone bends the way a real one does as it slows.
- **Scoring (real rules):** after all 8 stones, only the player with the stone closest to the button scores — 1 point for each of their stones closer than the opponent's closest. Stones outside the house don't count.
- Collisions knock stones around (takeouts, raises, guards). Stones past the back line or hitting the side boards are removed.
- **Most points after 4 ends wins**; tied → one extra end.
- **Look:** indoor arena at night — glossy pebbled ice, painted house rings, crowd lights, stone reflections; camera follows the stone and eases into the house.

## 🏀 Basketball Hoops
- **Match:** 5 rounds. Each round both players shoot **3 balls from the same spot** (spots move around the arc: corner → wing → top → wing → corner). The last ball of each round is the **money ball (2 points)**.
- **Throw:** swipe up — direction aims, swipe length sets power. Ball flies in 3D with backspin; it can swish, rim out, bank off the backboard or rattle in.
- From **round 3 the hoop slides side to side** (its position is fixed at the moment you shoot, so both phones see the same shot).
- **On fire:** 3 makes in a row → flaming ball, slightly more forgiving rim until you miss.
- **Most points wins**; tied → sudden-death: one shot each until someone misses and the other makes.
- **Look:** outdoor court at dusk — chain-link fence, city skyline, floodlights, net that swishes, ball shadow.

## Shared rules of the build (same bar as Knockout / Mini Golf / Cup Pong)
- Thrower **commits the shot input + outcome first**, every phone replays it deterministically and snaps to the committed result.
- No action out of turn; `skipTurn` clean on timeout; `clk` bump for extra turns so the timer restarts fairly.
- **No replay on reload** (seen-shot memory per match); **one guarded animation loop**, fixed 60 Hz (same speed on 60/120 Hz).
- **Performance:** no `backdrop-filter` or infinite filter/background animations; idle loop stops when nothing moves (menus lag fix, v77).
- Full scripted games to a result for both seats; old/new state tolerant; 360–412 px portrait, no horizontal scroll; no console errors.
- Design pipeline (global CLAUDE.md §4) on each game's screens; a **separate reviewer** checks before ship.

## Cost
~400k tokens per game (≈800k total), in line with the last three game builds.

## Out of scope
Real-time play, landscape mode, sweeping in curling (it can't be committed before the animation), more than 2 players.
