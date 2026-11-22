# Game client

The client displays server-projected legal actions. Card and character descriptions are reading aids; rules, hidden data, checks, health and card movement remain server-authoritative.

## Recovery and multiple tabs

Submitted start/play/abort envelopes are stored per room and seat in localStorage before sending. A timeout retains the exact command ID, revision and payload; reconnect authenticates the seat before retrying. Definitive rejection clears the envelope, synchronizes the table and requires a new explicit choice. Unsubmitted mass-response drafts remain in memory only. They are eligible for submission only for the canonical current responder with an unchanged defense guard and a fresh decision ID.

Outbox read-modify-write operations use short same-origin exclusive Web Locks, with no network request held inside the lock. A second tab adopts an existing envelope; an older acknowledgement cannot delete a newer envelope. Storage events synchronize tabs. Reattachment resets the presence-delivery baseline but cannot lower the match revision.

The existing browser targets are Chrome/Edge 111, Firefox 114 and Safari/iOS 16.4. [MDN's current compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/LockManager.json) records Web Locks support from Chrome 69, Firefox 96 and Safari 15.4. The [LockManager.request documentation](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request) defines exclusive cross-tab locking, automatic release and the secure-context requirement. These were checked on 2026-11-17. Production uses HTTPS; local development uses localhost. If Web Locks is unavailable, the player can attach and read the table, while mutations are disabled with a visible browser-update message. No coordination polyfill is shipped. Blocked or corrupt storage prevents new mutations rather than discarding an uncertain command.

## Interface

The table retains the saloon palette and local assets. Cards open an informational native modal before any play action. Server choices cover targets, checks, rescue, ordered discards, draw abilities and optional Sid payments. Checkbox selection requires explicit confirmation; ordered choices show selection order and support restarting the choice. Native modal focus containment, Escape dismissal and focus return are provided by the browser. The safe close button receives initial focus, including host-abort confirmation.

The full-screen table is positioned from the measured viewport (`src/game/table-layout.ts`); display-only distances, seat order, prompts and highlights come from `src/game/table-model.ts`. Hand cards open details with server-derived targets; selections (Store, Kit, discards, Sid) open in a dialog, and opened Store/check cards can be chosen from the table. A day/night switch is stored per browser. Primary dialog and form controls have at least 48px targets; dialogs are bounded by dynamic viewport height. The historical face-only log explicitly does not describe current hand ownership. Finishing or aborting leaves a terminal result; a subsequent match needs a new room.

## Validation boundary

`npx vitest run apps/web/test` covers table geometry/distance/prompt helpers and outcome-implied result roles, invitation compatibility, outbox retention/adoption/compare-before-clear, match/presence ordering, guarded mass preparation, selection validation, all public decision render shapes, Russian catalog copy and private/terminal controls. `npm run build --workspace @bang/web` checks TypeScript and the production bundle. These tests do not establish browser focus, real-device rendering or a complete transport-driven match; integrated browser and multiplayer evidence must be collected separately before release.
