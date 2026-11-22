# Design

## Source of truth

Status: Active. Date: 2026-11-22. Surfaces: home, invitation join, private lobby, private game table, decisions, terminal results and exceptional connection/error states. The user-approved full-screen redesign (Claude Design "Bang Redesign", screens 1a–1m) is authoritative for every surface: the table fits one landscape screen without page scrolling, and the saloon screens split into an illustrated hero beside a paper panel. The earlier [saloon reference](docs/design/saloon-reference.png) remains the source of the palette and artwork. Verification evidence lives in [design-qa.md](design-qa.md).

## Brand

Warm, illustrated Western game night for a private group of friends. Use parchment, walnut, sunset light, and oxblood/brass controls. Avoid dashboard chrome, casino imagery, technical success indicators, and repeated explanatory copy.

## Product goals

Create a room, invite friends, join by name, ready/start, play a full classic match and restore the same seat/unfinished decision reliably. Keep hidden hands private and required responses clear on desktop and narrow phone screens. Implementation and browser verification are separate claims.

## Personas and jobs

Friends arranging an occasional game; the host shares an invitation, and guests join from desktop, phone, or tablet without accounts.

## Information architecture

- `/`: illustrated introduction, primary create form, secondary invitation form.
- `/r/<CODE>`: join form for guests; authenticated lobby, game table or terminal result for seat owners according to room lifecycle.
- `/room/<CODE>`: preserved legacy route. New links always use `/r/` and include the current origin/protocol.
- New room codes contain six readable characters; old ten-character codes remain usable.

## Design principles

One dominant action per flow. Keep player readiness next to each name; omit aggregate readiness counts. Show connection trouble when relevant, without a permanent technical indicator. Preserve host removal, leave, copy, validation, and recovery behavior.

## Visual language

CSS tokens live on `:root` in `apps/web/src/styles.css`; a per-viewer day/night switch sets `data-theme="dark"` and overrides the same tokens (paper, ink, muted, line, accent, table, seal, link, chips, fields). The choice is stored in localStorage only as a convenience and defaults to day. Display text uses self-hosted Roboto Slab; controls use self-hosted Golos Text, with Latin/Cyrillic subsets and bundled licenses. Main colors: dark ink `#3d1b0c`, ivory paper `#f6e4c7`, walnut `#3d1e12`, oxblood `#9a2e21`, brass `#e6b86d`, muted sage readiness; night uses paper `#2e1a11` and ink `#f3dfbd`. Raster artwork/textures are original generated assets under `apps/web/public/art`, with prompts/provenance next to them. Standard icons come from Bootstrap Icons with its bundled MIT license.

## Components

Reuse `NameField`, native forms, shared buttons, the grouped seat roster, and the invitation control. An initial badge, name, ownership/offline metadata, and explicit ready/not-ready text describe each occupied seat. Do not add empty-seat cards or repeated status captions.

The game is a full-screen oval table. Opponents sit clockwise from the viewer's left, over the top, to the right; each seat shows a ribbon (Ходит / Отвечает / Стреляет в вас / Выбыл), a distance badge that is filled when the seat is within the viewer's weapon reach, life tokens, hand count, equipment chips and presence/jail/role status. The center holds the deck, a prompt (whose decision it is, what is required, last public event, opened Store/check cards) and the discard. The bottom row holds the viewer's plaque (role button, character, goal, life, reach, equipment), a fanned hand where playable cards lift and glow, and an action column with one dominant action. A dashed line connects an attacker to the viewer during a defense. The event log is a side panel on wide screens and a drawer elsewhere; the header menu holds «Обновить стол» and the host's «Завершить без победителя». Distances and reach are display-only; server-derived actions still decide every legal target. Card details are informational before a play is committed; text cards are sufficient and do not require new artwork.

Prepared mass responses are visibly separate from submitted actions. A draft consumes nothing, may be changed before the canonical turn, and is cleared if defense availability changes. An uncertain submitted command stays visible until its exact ID is acknowledged. Never optimistically remove a card or change health.

Native `dialog.showModal()` provides details and host-abort confirmation; the safe close action receives initial focus. Use the native focus/Escape behavior, labeled headings and modal overscroll containment. Do not add a second focus trap or body-scroll lock. Ordered selections show numbers and allow restarting the choice before explicit confirmation.

## Accessibility

Target WCAG 2.2 AA. Keep visible labels, native required/max-length constraints, error announcements, visible keyboard focus, text alongside status colors, and at least 48px primary tap targets. Decorative artwork has empty alt text. Respect reduced-motion preferences. UI text remains DOM content.

## Responsive behavior

Saloon screens fill the viewport: hero and panel sit side by side at 760px+ when wider than tall, otherwise the hero becomes a band above a scrolling panel; heights below 560px use the compact scale. The lantern illustration appears only in a tall split lobby.

The table is laid out from the measured viewport (`apps/web/src/game/table-layout.ts`) and container-query units: wide (1200×640+) shows the log beside the table; compact (under 900px wide or 560px tall) moves seats into one top row, shortens weapon names and hides secondary copy; the hand overlaps more as it grows. Phones held upright (narrower than 700px and taller than wide) get a «Поверните телефон» notice instead of an unusable table. Dialogs are bounded by `dvh` with normal scrolling.

## Interaction states

Preserve pending/disabled form and socket actions, unknown/full-room errors, invalid-session handling, host removal, leave confirmation, copy feedback/manual fallback, readiness toggling, and authenticated reconnect. Normal connection has no visible caption. Only disconnection produces a connection notice.

Gameplay shows the required actor, penalty-free waiting, source card/player, exact legal choices, explicit rejection/resync, retry progress and terminal outcome. Host abort is available even after elimination and requires confirmation. Active/terminal rooms hide lobby mutation controls; the next match is a new room. Face-only historical reveals are explicitly historical and never claim current hand ownership.

## Content voice

Short Russian labels: «Ваше имя», «Создать комнату», «Приглашение», «Копировать», «Я готов». Keep technical implementation details out of the normal flow.

## Implementation constraints

Keep the established React/Vite and TypeScript workspace; no new runtime dependencies. Keep authoritative rules/authentication on the server. Preserve the repository browser targets. Load fonts/art from the same origin for the existing production CSP. Verify routing/migrations with focused tests and the whole project with `npm run check`; compare actual browser captures with the reference before publishing.

## Open questions

- [x] The upright-phone «Поверните телефон» notice restricts orientation (WCAG 2.2 SC 1.3.4). Product decision (2026-11-22): keep it; the site is landscape-only on phones and no portrait table layout is planned.
- [x] Live local pass on the redesigned table (2026-11-22): one browser seat against three protocol peers on a real server and PostgreSQL, two complete matches through deal, mass attack, defense, Volcanic, Duel target dialog, discard dialogs, elimination and the result screen. See `design-qa.md`.
- [ ] Real iOS Safari/Android device confirmation remains a follow-up; responsive browser viewports are not real-device testing.
- [x] Record local browser review of game table, decisions, dialogs, reconnect, terminal results and abort; see `design-qa.md` for the two-browser/two-protocol-peer and viewport-emulation limits.
