# Knockout 2.0 — arenas, power-ups, penguin types, modes

**Date:** 2026-09-30 · **Status:** approved 2026-09-30 — all four units, in order U1→U4 · **File touched:** `assets/js/games-knockout.js` (+ small wiring in `ui.js` for rules text)

## Goal (what Smit asked for)
"Add more variations, more gameplay, more levels — make Knockout more fun / more interesting."
Chosen directions (all four): **Arenas/levels · Power-ups on the ice · Penguin types · New modes.**

## What stays the same (don't break)
- Secret simultaneous aiming → both READY → all penguins launch at once → replay on both phones.
- Deterministic physics (only + − × ÷ √, fixed step) so both phones compute identical results; one phone resolves, the other replays and snaps.
- No replay on reload, one guarded animation loop, fixed 60 Hz timing, hidden info never drawn.
- Old in-progress matches keep working (no `mode` field ⇒ Classic Sumo on the Classic Floe).

## The additions

### A. Match setup (new first screen)
Host picks **Mode** and **Arena** (or 🎲 *Surprise me*); partner sees the choice before round 1.
If both play Sumo, arenas can also **rotate every round** (option: "Arena roulette").

### B. Arenas (levels) — each shrinks / changes in its own way
| Arena | Twist | How it tightens |
|---|---|---|
| **Classic Floe** | today's round floe | ring breaks off each round |
| **Donut** | a hole in the middle — the centre is deadly too | the hole widens |
| **Twin Floes** | two islands joined by a narrow ice bridge | the bridge cracks after round 3, then islands shrink |
| **Bumper Rink** | rubber bumpers on parts of the rim bounce penguins back | a bumper pops each round |
| **Crumbling Ice** | the floe is made of tiles | 2–3 random tiles (seeded, same on both phones) fall away each round |
| **Current** | a steady sea current drags everything one way (arrow shown) | direction rotates each round |

### C. Power-ups on the ice
1–2 items appear per round at seeded spots. A penguin that **slides over** one grabs it; it takes effect **next round** (shown as a badge so both can plan around it).
- 🐟 **Heavy** — double mass: hits twice as hard, hard to shove.
- 🫧 **Shield** — the next time it would fall in, it bounces back instead (once).
- 🌀 **Spring** — its collisions are extra bouncy.
- ⚓ **Anchor** — can't be moved this round (but also can't launch).

### D. Penguin types (squad pick)
Before round 1 each player **secretly picks a squad of 4** from:
- **Classic** — balanced.
- **Emperor** — big & heavy, shorter max shove.
- **Rockhopper** — light, flies far, easy to knock out.
- **Chick** — tiny (hard to hit), light.
Squads are revealed together (same hidden-until-both-ready rule as aims).

### E. Modes
- **Sumo** (today) — last side standing; 8-round cap.
- **King of the Hill** — a glowing zone in the centre; after each round every penguin of yours *in* the zone scores 1. Fallen penguins respawn on your line next round. Most points after 8 rounds wins.
- **Fish Hockey** — a slippery fish sits in the middle; knock it into your partner's goal. First to 3. Fallen penguins respawn.

## Build order (units — one at a time, each shipped when tested)
| Unit | Contents | Est. tokens* |
|---|---|---|
| **U1 Engine + Arenas + Setup** | generalise physics (per-penguin mass/size, arena shapes, bumper walls, current, tiles), setup screen, 6 arenas | ~400k |
| **U2 Power-ups** | item spawn/pickup/effects + badges | ~200k |
| **U3 Penguin types** | squad-pick phase (hidden), 4 types | ~200k |
| **U4 Modes** | King of the Hill + Fish Hockey (puck body, goals, respawn, scoring) | ~350k |
*Roughly what each previous game build cost. **Cheaper option:** U1 + U2 only (~600k) already gives new levels + power-ups.

## Definition of done (every unit)
- Deterministic replay identical on both phones; snap to committed result.
- Hidden info (aims, squads) never drawn before reveal — instrumented test.
- Simultaneous-READY race matrix still: 0 lost aims, 1 resolution per round.
- Full scripted games to a result for every new mode/arena, both seats.
- Old saved matches still load; no replay on reload; one loop; 60 Hz = 120 Hz timing.
- 43-game smoke test clean; phone widths 360–412 px, no horizontal scroll.
- Design pipeline (global CLAUDE.md §4) run on the new **setup** and **squad-pick** screens.
- Separate reviewer checks each unit before it ships (not the builder).

## Out of scope
Real-time play, landscape mode, online matchmaking, more than 2 players, new sounds beyond the app's sound set.

## Parking lot
(new ideas that come up mid-build go here, not into the current unit)
