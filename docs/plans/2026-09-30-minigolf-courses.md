# Mini Golf: simple turns + 2 new courses

**Date:** 2026-09-30 · **Status:** approved 2026-09-30 · **File:** `assets/js/games-minigolf.js` only (+ rules text in ui.js by me)

## Why
Smit: "check the turn system … add more levels and maps." Today's turn rule is real golf ("whoever is farther from the
cup putts next"), so one player can putt 3–4 times in a row — it reads as broken.

## Changes
1. **Simple alternation.** One stroke each: you, then your partner, then you… A player who has holed out is skipped
   until the hole ends. Tee order still alternates by honour (lower score on the last hole tees first).
   The turn clock restarts on every stroke (`clk`), and the "whose turn" banner says so plainly.
2. **Course picker** before hole 1 (host picks, partner sees it live; timeout never forfeits — `skipOnly`):
   - **Neon Garden** — today's 9 holes (unchanged).
   - **Candy Land** (new, 9 holes) — gumdrop bumpers, a chocolate river (water), sticky caramel (sand), a
     lollipop windmill, candy-cane rails, a jelly jump.
   - **Space Station** (new, 9 holes) — low-gravity zones (less friction), teleport airlocks, a rotating
     satellite sweeper, black-hole "water", conveyor belts (slopes), meteor bumpers.
   - **Surprise me** — a random course.
3. Old saved matches (no course field) = Neon Garden with the old rules, and load/play as before.

## Definition of done
- Every new hole solvable within par+1 (solver), 27k-shot no-tunnelling fuzz per course, balls always stop.
- Determinism + committed moving-obstacle phase (as today); no replay on reload; one loop; 60 = 120 Hz timing.
- Alternation: scripted full games on all 3 courses, both seats; holed player skipped; timeouts clean.
- 360–412 px, no horizontal scroll, no console errors; screenshots of every new hole type.
- Design pipeline on the course picker; **separate reviewer** before ship.

## Cost
~400k tokens (same as the original Mini Golf build). Runs in parallel with Knockout 2.0 (different file).

## Out of scope
Landscape mode; more than 3 courses; per-hole leaderboards.
