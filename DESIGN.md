# Design

## Source of truth

Status: Active. Date: 2026-11-17. Surfaces: home, invitation join, private lobby, and exceptional connection/error states. The user selected the saloon direction and then approved a quieter revision; [the visual reference](docs/design/saloon-reference.png) is authoritative. Implementation evidence lives in [design-qa.md](design-qa.md).

## Brand

Warm, illustrated Western game night for a private group of friends. Use parchment, walnut, sunset light, and oxblood/brass controls. Avoid dashboard chrome, casino imagery, technical success indicators, and repeated explanatory copy.

## Product goals

Create a room, invite friends, join by name, mark readiness, and restore a seat reliably. Gameplay is a later milestone. Success means these flows remain usable on desktop and narrow phone screens.

## Personas and jobs

Friends arranging an occasional game; the host shares an invitation, and guests join from desktop, phone, or tablet without accounts.

## Information architecture

- `/`: illustrated introduction, primary create form, secondary invitation form.
- `/r/<CODE>`: join form for guests, authenticated lobby for seat owners.
- `/room/<CODE>`: preserved legacy route. New links always use `/r/` and include the current origin/protocol.
- New room codes contain six readable characters; old ten-character codes remain usable.

## Design principles

One dominant action per flow. Keep player readiness next to each name; omit aggregate readiness counts. Show connection trouble when relevant, without a permanent technical indicator. Preserve host removal, leave, copy, validation, and recovery behavior.

## Visual language

CSS tokens live in `apps/web/src/styles.css`. Display text uses self-hosted Roboto Slab; controls use self-hosted Golos Text, with Latin/Cyrillic subsets and bundled licenses. Main colors: dark ink `#3d1b0c`, ivory paper `#f6e4c7`, walnut `#3d1e12`, oxblood `#9a2e21`, muted sage readiness. Use generous spacing, thin rules, and restrained relief. Raster artwork/textures are original generated assets under `apps/web/public/art`, with prompts/provenance next to them. Standard icons come from Bootstrap Icons with its bundled MIT license.

## Components

Reuse `NameField`, native forms, shared buttons, the grouped seat roster, and the invitation control. An initial badge, name, ownership/offline metadata, and explicit ready/not-ready text describe each occupied seat. Do not add empty-seat cards or repeated status captions.

## Accessibility

Target WCAG 2.2 AA. Keep visible labels, native required/max-length constraints, error announcements, visible keyboard focus, text alongside status colors, and at least 48px primary tap targets. Decorative artwork has empty alt text. Respect reduced-motion preferences. UI text remains DOM content.

## Responsive behavior

A centered paper sheet grows up to 54rem. Below 40rem, reduce gutters, wrap the invitation toolbar, stack lobby actions, and keep readable form text. At narrow widths the secondary join input/button may stack. Reserve image dimensions; do not lock the page to a fixed viewport height or hide vertical overflow.

## Interaction states

Preserve pending/disabled form and socket actions, unknown/full-room errors, invalid-session handling, host removal, leave confirmation, copy feedback/manual fallback, readiness toggling, and authenticated reconnect. Normal connection has no visible caption. Only disconnection produces a connection notice.

## Content voice

Short Russian labels: «Ваше имя», «Создать комнату», «Приглашение», «Копировать», «Я готов». Keep technical implementation details out of the normal flow.

## Implementation constraints

Keep the established React/Vite and TypeScript workspace; no new runtime dependencies. Keep authoritative rules/authentication on the server. Preserve the repository browser targets. Load fonts/art from the same origin for the existing production CSP. Verify routing/migrations with focused tests and the whole project with `npm run check`; compare actual browser captures with the reference before publishing.

## Open questions

- [ ] Real iOS Safari/Android device confirmation remains a follow-up; responsive browser viewports are not real-device testing.
- [ ] Design match start/gameplay separately when that milestone is implemented.
