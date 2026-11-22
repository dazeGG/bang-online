# Saloon design verification

## Full-screen redesign — fixture captures (2026-11-22)

Source: the user's Claude Design "Bang Redesign" board (screens 1a–1m). A temporary, uncommitted fixture page rendered the real components (`GameTable`, `CardActionDetails`, `HomePage`, lobby, terminal result) with fixed public views in exact-size iframes, captured with headless Chrome on Windows. Compared sizes: table 1440×900 (turn, Store, night waiting), 1180×820 (defense), 844×390 (turn, night defense), 667×375 (five players, waiting); dialog 1440×900 and night 844×390; home 1280×800 and 390×844; lobby 1280×800 and night 390×844; result 1280×800 and 844×390. Seats, center prompt, hand fan, action column, log panel/drawer, attacker line, theme switch and the split/stacked saloon layouts match the board. Compact-height adjustments (shortened weapon chips, hidden prompt eyebrow) were made after the captures showed seats touching the prompt.

Automated evidence: 76 web tests, including `table-model.test.ts` (clockwise order, core-matching distance with Mustang/Scope/Paul/Rose and eliminated seats, seat bounds at the board sizes, upright-phone detection, prompt/ribbon/primary-action rules, outcome-implied result roles without leaking living hidden roles). Not verified at capture time: a live match, real-browser interaction and physical devices.

Live local pass (same day): Vite dev client and the real server on local PostgreSQL; one browser seat (Chromium 152/Electron 44, 1280×800) against three test-only protocol peers. Two complete four-player matches finished (renegade victory after 12 turns, then a second match) through the redesigned table only: ready/start, «Индейцы!» response, Bang defense, Volcanic from card details, Duel through the target grid against the sheriff (life 5→4), turn discard and ordered elimination discard through the selection dialog, rescue decline, and the result screen with winner first and only public or outcome-implied roles. No console errors or failed requests appeared. The server's 60-second auto-discard for an absent eliminated player was not reached live; PostgreSQL integration and socket tests cover it. `npm run check`: 378 tests, no PostgreSQL skips. Keyboard-only play and physical devices remain unverified.

## Complete-game UI — local browser and automated verification

The game table extends the approved paper/wood/oxblood interface with private hand/role, clockwise public boards, card/character detail dialogs, server-derived decisions, mass-response preparation, durable request feedback, waiting and terminal/host-abort flows. It does not replace the selected home/lobby design or add new artwork.

Local automated evidence: `apps/web/test/game-interface.test.ts` covers every public decision render shape, explicit ordered/multiple selection, private/escaped content, host/guest/terminal controls, defense actions from hand details, single terminal winner copy and historical check/damage copy. `game-command-state.test.ts` covers exact-envelope restoration, cross-tab adoption/compare-before-clear, revision/presence filtering and changed-defense preparation guards. `modal-lifecycle.test.ts` covers queued Strict Mode close events and safe initial focus. All 64 web tests pass; the latest integrated `npm run check` passed with 362 tests across 18 files, actual PostgreSQL, lint, strict types, builds and formatting after review fixes. The small subsequent terminal-copy adjustment has focused regression coverage.

The local four-player browser/protocol scenario reached an Outlaws victory at revision 35, using two independent browser profiles and two test-only protocol peers. Ordinary controls exercised ready/start, Bang/Missed, Duel, Pedro's discard choice, Winchester, ordered discard and Gatling preparation. The future responder's prepared decline left life/cards unchanged; becoming current submitted the fresh response and reduced life from four to three. A guest refresh during pending Bang preserved four life/four cards and the Missed response while the host showed unlimited waiting. Terminal refresh preserved winner and removed response/abort controls.

The details dialog remains native `:modal`, fits the 360px viewport (horizontal bounds 16–329px, vertical 262–538px), focuses «Закрыть» after Strict Mode reopening, closes through Escape and permits the face-labelled response action. A Missed response from details reduced four cards to three with life unchanged. Page client/scroll widths both measured 345px at 360 CSS pixels; primary controls measured at least 48px. Desktop review used 1440×900 CSS pixels, with provider-scaled 1280px-wide captures. Environment: Chromium 152/Electron 44 on Windows. Brief development watcher restart 502 responses recovered. This was not a physical phone/tablet test or production verification.

Host-abort confirmation was verified in a separate four-seat ready/start scenario. Guests had no abort button. The dialog focused the safe «Закрыть» control; cancellation retained turn 1/draw and the host's five cards. Confirming after reopening produced an aborted revision-2 result in both profiles, with no winner or pending choice. Guest refresh preserved that result with no actions/abort control, and the no-winner phrase appeared once after the presentation cleanup. Test-only peers disconnected gracefully; retained participants were not removed.

Public gameplay verification also passed on <https://bang.dazinho.ru> for deployed source `276ebba` / image `bang:20261117182607-276ebba` and bundle `/assets/index-DyNS319h.js`. Two independent profiles and two test-only protocol peers readied and started a controlled match. Native card details opened with safe «Закрыть» focus and played Bang; pending-defense refresh restored the identical authorized hand/life/prompt. Explicit disconnect showed indefinite waiting, and return preserved the decision without penalty. The guest declined, then the host confirmed abort; the revision-5 no-winner terminal state survived guest reload with no commands or abort control. At 360 CSS pixels, client/scroll widths both measured 345px. No new console errors appeared during the public flow in Chromium 152/Electron 44 on Windows. This was a public play/response/recovery/abort smoke, not a complete public normal-victory game or a physical phone/tablet test. See [SETUP_STATUS.md](docs/SETUP_STATUS.md).

Local game UI verification is complete within the stated two-browser/two-protocol-peer and emulated-viewport limits. The historical captures/results below verify the earlier home/lobby redesign only. Real iOS/Android tests remain unperformed.

## Earlier home/lobby visual verification

Date: 2026-11-17. Source visual truth: [approved revision](docs/design/saloon-reference.png). The implementation uses live lobby behavior, not a screenshot as UI.

## Capture and normalization

- Source board: 1536 × 1024 px, containing two coordinated desktop screens. Home crop: 730 × 974 at (24, 24); lobby crop: 730 × 974 at (780, 24).
- Implementation desktop viewport: 784 × 1024 CSS px, device pixel ratio 1.25, raw browser capture 980 × 1280 px. Normalize to 784 × 1024, then crop the 736 × 976 paper sheet at (24, 24). The source crops are padded by 6 × 2 px, not stretched, to align the sheet boundaries.
- [Home comparison](docs/design/qa-home.png) and [lobby comparison](docs/design/qa-lobby.png) put reference on the left and implementation on the right at 1472 × 976 px.
- The four-player lobby has the same readiness state as the reference: host not ready, three guests ready. Test room code and guest join order differ. Local invitations correctly use the local HTTP origin; production invitations use the public HTTPS origin.
- [Mobile home](docs/design/qa-mobile-home.png): 390 × 844 CSS px, 1.25 DPR. [Mobile host roster](docs/design/qa-mobile-host.png): 320 × 740 CSS px, 1.25 DPR. These are responsive browser viewports, not physical-device tests.
- [Production mobile lobby](docs/design/qa-production-mobile.png): 320 × 900 CSS px, 1.25 DPR, with the complete HTTPS invitation visibly wrapping and working readiness/leave controls.

## Comparison history

1. **P2: typography and composition.** Initial display headings and form labels were smaller than the approved reference, while the hero used too much vertical space. Increased the display/label type, tightened hero and roster rhythm, aligned form gutters, and recaptured both desktop screens. The final side-by-side images show the same hierarchy and core controls.
2. **P2: hero subtitle readability.** Illustration details crossed the subtitle. Added a restrained paper-colored backing behind the subtitle; it stays readable without replacing the real artwork. Final desktop/mobile captures show the correction.
3. **P2: narrow-screen host controls.** Initial removal controls were 40px and overlapped readiness hit areas. Moved them below the player name on narrow screens, with a 48px target and a visible label. Final mobile roster capture and DOM measurements confirmed separate hit areas and 48px heights.
4. **P2: full invitation visibility at 320px.** A single-line field clipped the complete production URL. Replaced it with a labeled read-only, vertically resizable textarea; it remains one line on desktop and wraps on mobile. At 320px, the complete `https://bang.dazinho.ru/r/K7M4RW` fit with no internal horizontal/vertical overflow (clientHeight and scrollHeight both 70px). Copy/select behavior is preserved.

## Findings

No actionable P0/P1/P2 findings remain. Full-view comparisons cover structure, type hierarchy, colors, imagery, and copy. A focused review checked roster labels, readiness badges, protocol/path visibility, inputs, primary/secondary buttons, and mobile removal controls at native capture size. A separate enlarged crop was unnecessary because the supplied comparison images retain readable control text.

The implementation preserves the selected paper/wood/oxblood direction, original sunset saloon artwork, grouped roster, hat/lantern artwork, and quieter copy. No connected-state caption or duplicate readiness count is visible. The browser DOM retains native forms, labels, focus outlines, error announcements, and plain-text readiness.

## Interaction verification

- Created a new six-character room from the browser and joined through `/r/` in a separate browser profile.
- Four live seats received shared readiness/presence updates. After refreshing the guest, the same seat id and ready state returned without a duplicate.
- The copy button reported «Ссылка скопирована» and copied the full origin plus `/r/<CODE>` invitation.
- Host removal and leave confirmation worked with the revised mobile controls. All local test seats were released; the room preview reported zero seats.
- No page overflow was detected at 320px or 390px. Full production-format URL wrapping was measured at 320px.
- A temporary CSS syntax error during hot reload was fixed before the final build; it is visible only in historical dev-console entries. No unresolved runtime error remains. Production uses the freshly built assets rather than the dev HMR client.
- `npm run check`: 116 tests in 7 files, no PostgreSQL skips; lint, strict types, build, and format checks passed. Migration 2 was applied locally.
- Production verification of source commit `6010cd9` / image `bang:20261117161028-6010cd9` passed through public HTTPS: local fonts/art loaded, no CSP/console/network errors appeared, readiness and copy worked, and refresh restored the same ready seat. The real full HTTPS invitation fit a 320px viewport without internal/page overflow. The test seat was released. GitHub CI passed.

## Follow-up polish and limits

P3: the freely licensed slab typeface, clean badge borders, and button trim approximate the generated reference's custom distressed lettering and metalwork. The recreated illustration differs in small scene details. These do not affect hierarchy or behavior. Real iOS Safari/Android testing remains future work. The new game table's separate verification status appears at the top of this document.

Earlier home/lobby visual result: passed. Complete-game local match/layout/dialog/abort verification and the public play/response/recovery/abort smoke: passed within the limits described above.
