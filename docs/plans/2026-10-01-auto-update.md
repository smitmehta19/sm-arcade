# Auto-update: both phones always run the latest version

**Date:** 2026-10-01 · **Status:** shipped v84 2026-10-01 (87/87 browser checks, independent review x2) · **Files:** `assets/js/app.js`, `assets/js/ui.js` (Settings text only), `sw.js` (version bump)

## Why
Every deploy on 30 Sept left a phone running old code because the app stayed open in the background. A PWA only
loads new JS on a full reload. This caused:
- the monthly-race flip-flop that kept writing after the fix;
- Cup Pong's old rules on one phone;
- most of the Knockout 2.0 review rounds (old code corrupting new matches).

## Design
- **Detect:** when the app comes back to the front (`visibilitychange` → visible), and every 10 min while it is
  visible, call `registration.update()`. A deploy changes `sw.js`, so the browser installs the new worker, which
  already calls `skipWaiting` + `clients.claim` → the page gets `controllerchange`.
- **Apply safely:** on `controllerchange` (ignored when the page had no controller at boot, i.e. the first install),
  mark "update ready". Reload at the first SAFE moment:
  - not on a game screen with a live match (`#/play/...` while the match is waiting/active);
  - no text being typed (a focused input/textarea with content);
  - not on the Settings screen mid-action.
  Otherwise wait: reload when the player leaves the game (route change) or the next time the app comes to the front.
- **Never loop:** at most one auto-reload per new version (a sessionStorage marker with the version + a time guard).
- **Feedback:** a short toast after the reload — "Updated to v84 ✨" (read from the SW cache name, like Settings
  does). If an update is waiting during a game, show a small, non-blocking "Update ready — it installs after this game".
- Settings → "Force update" stays as the manual fallback; its hint text mentions auto-update.

## Definition of done
Tested in real Chrome against a local copy of the site with a simulated deploy (`sw.js` version changed):
1. On the home screen, hide → deploy → show: exactly one reload, and the new version runs.
2. During an active match: no reload; after leaving the game it reloads once.
3. Typing in a text field: no reload until the field is done.
4. A first-ever install doesn't reload; no reload loop over 10 visibility cycles; offline → no errors.
5. No console errors; no extra Firebase writes. An independent reviewer signs off before ship.

## Out of scope
Version handshake between the two phones (showing "partner is on an older version" app-wide); native app-store packaging.

## Parking lot
- `finishMatch` can lose one result if the socket drops at the exact end of a game (see CONTEXT, v80).
