# Design

## Source of truth

Status: Active. Date: 2026-11-17. Surfaces: home, invitation join, private lobby, private game table, decisions, terminal results and exceptional connection/error states. The user selected the saloon direction and then approved a quieter revision; [the visual reference](docs/design/saloon-reference.png) remains authoritative for home/lobby style. The game table extends its palette and components. Verification evidence lives in [design-qa.md](design-qa.md).

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

CSS tokens live in `apps/web/src/styles.css`. Display text uses self-hosted Roboto Slab; controls use self-hosted Golos Text, with Latin/Cyrillic subsets and bundled licenses. Main colors: dark ink `#3d1b0c`, ivory paper `#f6e4c7`, walnut `#3d1e12`, oxblood `#9a2e21`, muted sage readiness. Use generous spacing, thin rules, and restrained relief. Raster artwork/textures are original generated assets under `apps/web/public/art`, with prompts/provenance next to them. Standard icons come from Bootstrap Icons with its bundled MIT license.

## Components

Reuse `NameField`, native forms, shared buttons, the grouped seat roster, and the invitation control. An initial badge, name, ownership/offline metadata, and explicit ready/not-ready text describe each occupied seat. Do not add empty-seat cards or repeated status captions.

The game uses public player boards in clockwise order, visible life/equipment/hand counts, a private own-role strip and hand, draw/discard piles and one decision panel. Server-derived choices drive targets, defenses, checks, ordered/multiple selections and abilities. Card details are informational before a play is committed; text cards are sufficient and do not require new artwork.

Prepared mass responses are visibly separate from submitted actions. A draft consumes nothing, may be changed before the canonical turn, and is cleared if defense availability changes. An uncertain submitted command stays visible until its exact ID is acknowledged. Never optimistically remove a card or change health.

Native `dialog.showModal()` provides details and host-abort confirmation; the safe close action receives initial focus. Use the native focus/Escape behavior, labeled headings and modal overscroll containment. Do not add a second focus trap or body-scroll lock. Ordered selections show numbers and allow restarting the choice before explicit confirmation.

## Accessibility

Target WCAG 2.2 AA. Keep visible labels, native required/max-length constraints, error announcements, visible keyboard focus, text alongside status colors, and at least 48px primary tap targets. Decorative artwork has empty alt text. Respect reduced-motion preferences. UI text remains DOM content.

## Responsive behavior

A centered paper sheet grows up to 54rem. Below 40rem, reduce gutters, wrap the invitation toolbar, stack lobby actions, and keep readable form text. At narrow widths the secondary join input/button may stack. Reserve image dimensions; do not lock the page to a fixed viewport height or hide vertical overflow.

The game board and hand use wrapping grids with readable card minimums. Player boards reduce to two columns and then one on very narrow screens; controls retain 48px targets. Dialog height is bounded by `dvh` with normal scrolling. No fixed bottom overlay may obscure hand/actions.

## Interaction states

Preserve pending/disabled form and socket actions, unknown/full-room errors, invalid-session handling, host removal, leave confirmation, copy feedback/manual fallback, readiness toggling, and authenticated reconnect. Normal connection has no visible caption. Only disconnection produces a connection notice.

Gameplay shows the required actor, penalty-free waiting, source card/player, exact legal choices, explicit rejection/resync, retry progress and terminal outcome. Host abort is available even after elimination and requires confirmation. Active/terminal rooms hide lobby mutation controls; the next match is a new room. Face-only historical reveals are explicitly historical and never claim current hand ownership.

## Content voice

Short Russian labels: «Ваше имя», «Создать комнату», «Приглашение», «Копировать», «Я готов». Keep technical implementation details out of the normal flow.

## Implementation constraints

Keep the established React/Vite and TypeScript workspace; no new runtime dependencies. Keep authoritative rules/authentication on the server. Preserve the repository browser targets. Load fonts/art from the same origin for the existing production CSP. Verify routing/migrations with focused tests and the whole project with `npm run check`; compare actual browser captures with the reference before publishing.

## Open questions

- [ ] Real iOS Safari/Android device confirmation remains a follow-up; responsive browser viewports are not real-device testing.
- [x] Record local browser review of game table, decisions, dialogs, reconnect, terminal results and abort; see `design-qa.md` for the two-browser/two-protocol-peer and viewport-emulation limits.
