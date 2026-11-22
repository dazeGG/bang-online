# Verification status

## Saloon redesign and eliminated-discard timeout — 2026-11-22, deployed

Source `1d2aac8` on branch `feat/saloon-redesign` (not yet merged or pushed) runs on <https://bang.dazinho.ru> as image `bang:20261122205740-1d2aac8`, bundle `/assets/index-BoCLulc_.js`. No migration was added; the database container and volume were reused. Before deployment `npm run check` passed with **378 tests in 19 files on actual PostgreSQL, no skips**, plus lint, types, builds and formatting. A local live pass played two complete four-player matches in one browser seat against three protocol peers on the redesigned table (details in [design-qa.md](../design-qa.md)). After rollout, `/api/ready` returned `ready`/`connected` and the public home page loaded its fonts and artwork without errors. No public match was played after this deployment. CI did not run because the branch is unpushed, and physical devices were not tested.

## Complete classic implementation — 2026-11-17, published and verified

The local code now implements a full classic match for **4–7 players**, with all 80 physical cards/22 kinds, 16 characters, turn/effect/rescue/elimination/victory logic and authorized private projections. [CLASSIC_RULES.md](CLASSIC_RULES.md) maps the physical inventory and every card/character/FAQ case to actual named tests; Q01 is explicitly outside software enforcement.

Implemented persistence/transport includes migration 3, exact JSON snapshots, restrictive fixed participants, atomic accepted-command receipts, authenticated protocol-3 game events, retry conflict/revision handling, per-seat publication and restart synchronization. Required actors are awaited without penalties; unrelated absent players do not globally pause. The fixed host can abort without winners, including after elimination. Active and terminal room membership stays fixed; the next game needs a new room.

The saloon client supports all public decision shapes, card/character details, ordered and multiple selections, local parallel mass drafts with refreshed defense guards, durable exact-envelope retries, multi-tab outbox coordination and terminal results. Fresh **`npm run check` passed completely** after review fixes: lint, all workspace/test TypeScript checks, **362 tests in 18 files with actual PostgreSQL and no skips**, both production builds and repository formatting. The suites include complete legal games for every supported count and targeted rare-boundary fixtures. Independent code review approved the change and the architectural review cleared its findings. A subsequent presentation-only terminal-copy adjustment has focused rendering assertions; no gameplay behavior changed.

Local browser verification completed a normal four-player match through ordinary controls using **two independent browser profiles and two test-only protocol peers**. The match reached revision 35 with an Outlaws victory; it was not four independent browser contexts. Covered flows include ready/start, Bang/Missed, Duel, Pedro's discard choice, Winchester, ordered discard and Gatling. A future guest prepared a decline without changing life/cards; after the earlier responder resolved, the draft submitted with the fresh current decision and life changed from four to three. Reloading during pending Bang preserved four life/four cards and available Missed, while the host displayed penalty-free waiting. Responding through the card-details dialog reduced the hand from four to three without life loss. Reloading the terminal result retained the winner and exposed no gameplay or abort controls.

Browser environment: Chromium 152 in Electron 44 on Windows. At 360 CSS pixels, page client/scroll widths both measured 345px, primary controls were at least 48px, and the native details dialog fit inside the viewport. Strict Mode dialog reopening, safe «Закрыть» focus, Escape and response-from-details were exercised. Desktop review used a 1440×900 CSS viewport; the screenshot provider scaled the captured image to 1280px width. Brief 502 responses during development watcher restarts recovered; they were observed in the development environment, not reported as production runtime evidence. Physical iOS/Android devices were not tested.

A separate ordinary four-seat ready/start browser scenario verified host abort. Guests had no abort control. The native confirmation initially focused «Закрыть»; cancelling preserved turn 1, the draw decision and the host's five-card hand. Confirming on reopening produced `aborted` revision 2 with no pending decision and no winner in both profiles. Guest refresh retained the terminal result without actions/abort controls. The final copy displayed the no-winner phrase once. Test-only peers were stopped gracefully; retained match participants were not deleted.

**Publication and deployment verification passed.** Source `276ebbab4cd41b3916915aa1704cd60209ef3d18` is public, and <https://bang.dazinho.ru> runs `bang:20261117182607-276ebba`. GitHub CI [44147515663](https://github.com/dazeGG/bang-online/actions/runs/44147515663) passed for that source. Later receipt-only documentation commits do not change the deployed application. The public bundle is `/assets/index-DyNS319h.js`. HTTPS `/api/ready` returned HTTP 200 with `database: connected` before and after public game verification; PostgreSQL records migrations 1, 2 and 3.

The retained `bang:recovery-schema3-276ebba` image was built and tested against local schema 3, then transferred before rollout. After deployment it started healthy in an isolated temporary Compose container against the production schema and returned ready/connected; that temporary container was stopped and removed. Recovery and deployed images have identical filesystem layers. The existing database container and `bang_db-data` volume were unchanged; all 28 neighboring container names, IDs, images and states matched the preflight baseline. Combined Caddy configuration validation passed without a reload. App memory was about 35.5 MiB of 192 MiB and PostgreSQL about 31.15 MiB of 160 MiB at the check; these are snapshots, not load-test results. No live pre-upgrade invitation fixture was proven; legacy room/token/readiness migration behavior is covered by the real-PostgreSQL integration tests.

Public browser verification used **two independent browser profiles and two test-only protocol peers** in a controlled four-player room created on the new build. All seats readied and the host started normally. The host drew and played Bang through the native card-details dialog, whose safe initial focus was «Закрыть». Guest refresh preserved the identical authorized hand, life and pending defense. Explicit guest disconnect made the host show indefinite waiting; return restored the same pending choice without penalty. The guest declined: life changed from four to three while the four-card hand stayed unchanged (revision 4). Host confirmation then produced `aborted` revision 5, no pending decision and no winner in both profiles; guest reload retained the terminal state without commands or an abort control. Test peers disconnected gracefully and retained participants were not deleted. This public smoke did not play a complete normal-victory match; that result was verified locally as described above.

At a public 360 CSS-pixel viewport, client and scroll widths both measured 345px with no horizontal overflow. Chromium 152/Electron 44 on Windows showed no new console errors during the public navigation and game flow. Physical iOS/Android devices remain untested. These receipts describe a private preview deployment within the stated browser/protocol-peer limits.

Migration 3 cannot be rolled back by selecting an image that only understands migrations 1/2. Preserve the database volume and recover using a schema-3-compatible image; do not downgrade/drop game data. Operational follow-ups remain real iOS/Android tests, backups/restore drills, rate limiting, abandoned-room expiry and external monitoring.

The sections below are historical receipts for earlier releases. Their old implementation boundaries and counts are not the current local source boundary.

## Saloon redesign and short invitations — 2026-11-17

- Published source commit `6010cd9` to the public GitHub repository and deployed image `bang:20261117161028-6010cd9`. GitHub CI passed for that commit. Both production containers are healthy; PostgreSQL records migrations 1 and 2, and public `/api/ready` reports `database: connected`.
- Implemented the user-selected saloon revision with original optimized WebP art, self-hosted Cyrillic fonts, responsive forms/roster, and minimal normal-state copy. See [DESIGN.md](../DESIGN.md) and [visual verification](../design-qa.md).
- New invitations use the full origin and `/r/<CODE>`, with six-character codes. Existing ten-character rooms and `/room/` links still work. Migration 2 preserves old rooms, tokens, and readiness, and keeps collision retries safe.
- Fresh `npm run check` passed: **116 tests in 7 files**, PostgreSQL integration tests without skips, lint, strict TypeScript, server/client builds, and Prettier. Focused coverage includes short/legacy paths, pasted full URLs, migrated legacy sessions, real code collisions, and production SPA fallback routes.
- Browser checks passed: create, invitation join in a separate profile, four-player readiness updates, guest refresh restoring the same ready seat, copy feedback, mobile host removal, and leaving. Local test seats were released. Browser viewports at 320px/390px had no page overflow; a complete production URL fits through wrapping at 320px. Real phone/tablet testing remains open.
- Public HTTPS browser checks also passed: loaded local fonts and artwork with no CSP/console/network errors, created a six-character `/r/` invitation with the full HTTPS URL, changed readiness, copied the link, and refreshed without changing the seat or readiness. The actual production link wraps fully at 320px with no internal/page overflow. The production test seat was released.

## Production lobby deployment — 2026-11-17

- Deployed at <https://bang.dazinho.ru> on the shared VoiceRoom host. The app and its separate PostgreSQL container are healthy; `/api/ready` returned HTTP 200 with `database: connected`. Caddy configuration validation passed.
- Production image: `bang:20261117150541-0558a30-dirty`. The image includes uncommitted workspace changes; no source commit was made. See [DEPLOYMENT.md](DEPLOYMENT.md) for operations.
- Fresh `npm run check` passed: ESLint, strict TypeScript, **85 tests in 6 files**, builds, and Prettier. PostgreSQL integration tests ran without skips.
- The public HTTPS HTTP/Socket.IO smoke check passed: create/join, foreign-origin rejection (403), WebSocket upgrade, readiness broadcast, authenticated re-attachment to the same seat, invalid-token rejection, and leaving both test seats.
- Browser checks in separate default/incognito profiles passed: create room with a Cyrillic name, open invitation and join, see each other's presence/readiness, reload both profiles without duplicate seats, retain readiness, and leave. The guest's seat id was unchanged after reload. No browser console errors were recorded during these flows. Both browser test seats were released afterwards.
- At the deployment check, app memory was about 96 MiB of its 192 MiB limit; PostgreSQL used about 39 MiB of its 160 MiB limit. These are a snapshot, not a load-test result.

At that lobby release, remaining gaps were real phone/tablet testing, automated backups and restore verification, external monitoring, abandoned-room expiry, request rate limiting and gameplay. The complete-game implementation/verification status now appears above. Earlier local-only gaps below describe their historical state.

## Private lobby milestone — 2026-11-17

Verified on Windows with Node.js 24.18.0, npm 11.16.0, Docker Desktop 29.6.2, and PostgreSQL 18 from `compose.yaml`.

- `npm run db:up` and `npm run db:check` succeeded against the real PostgreSQL container. This is the first verified real database connection.
- `npm run db:migrate` applied migration 1 (`private_lobby`); a second run reported the schema up to date.
- `npm run check` passed: ESLint, strict TypeScript, 75 tests in 5 files, server/client builds, and Prettier. The 13 PostgreSQL integration tests ran against the real database (not skipped) in throwaway `test_<uuid>` schemas, which were dropped afterwards.
- Integration tests cover: migrations and readiness, room creation, invitation preview without names or secrets, name/room-code/origin validation, the 7-seat limit, 10 concurrent joins, attach without leaked tokens, wrong/malformed/cross-room tokens, refresh restoring the same seat and readiness, persistence across a server restart, multiple tabs on one seat with revocation on leave, the 4–7 ready start condition, and host-only removal with host hand-over.
- `npm run dev` smoke check through the Vite proxy: `/api/ready` returned `ready`; a room was created and joined with Cyrillic names; a duplicate name was rejected; a foreign origin received 403; `/room/<CODE>` served the SPA; a socket attach, readiness change, disconnect, and re-attach restored the same ready seat; a wrong token was rejected; the server log contained no seat tokens.

Not verified:

- No browser automation, visual inspection, or real phone/tablet testing of the new lobby UI was performed. The UI was verified by type checks, build, and the HTTP/socket smoke check only.
- `npm start` / `npm run preview` were not re-run for this milestone.
- On this machine `HTTP_PROXY`/`ALL_PROXY` point to a local proxy; bypass it (for example `NO_PROXY=*`) for local `curl` checks. Windows `curl` command-line arguments also mangle Cyrillic text, so use a UTF-8 file or Node for non-ASCII request bodies.

The local development database contains a few rooms created by the smoke check. They are harmless development data and were not deleted.

## Initial scaffold — 2026-11-17

- The scaffold passed `npm run check`, `docker compose config --quiet`, and HTTP/Socket.IO smoke checks for `npm run dev`, `npm start`, and `npm run preview`.
- At that time the Docker engine was not running and no real PostgreSQL connection was verified; that gap is closed above.

TypeScript is intentionally pinned to 6.0.3: the selected typescript-eslint release supports TypeScript below 6.1.0. Keep compiler and lint tooling compatible when upgrading dependencies.

The root `.env` contains only the development defaults copied from `.env.example` and is ignored by Git. Preserve local changes to it when continuing.

Current continuation: the complete classic build is published and verified as recorded above. Prioritize the explicitly remaining device and operational follow-ups; do not restart a first-turn milestone.
