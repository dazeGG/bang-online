# Continuation prompt

Continue `E:\WORK\pet\Bang!`, the private browser-based classic BANG! project. Communicate with the user in Russian; write internal documentation and code comments in English. Read `AGENTS.md`, `README.md`, `docs/PROJECT_BRIEF.md`, `docs/CLASSIC_RULES.md`, `docs/LOBBY.md`, `docs/SETUP_STATUS.md` and the actual code before changing anything.

The agreed release is a **complete classic game for 4–7 players**, all 80 playing cards/22 kinds and all 16 characters, from ready lobby to victory. The current local implementation includes the rules engine, private per-seat projections, PostgreSQL snapshot/receipt persistence, protocol-3 socket service and saloon game UI. Do not replace the objective with a first-turn demo. Check `SETUP_STATUS.md` for verification and publication receipts before claiming that the public site runs this build.

Keep React/Vite, strict TypeScript, Node 24/Fastify/Socket.IO, PostgreSQL and the four npm workspaces. No new dependencies or infrastructure without a concrete accepted need. Expansions, 3/8-player modes, Redis, bots, accounts, public matchmaking, voice and native clients are excluded.

Preserve these decisions:

- Wait without timers or penalties for the current required actor; unrelated missing seats do not pause earlier decisions. Multiple tabs represent one seat. The fixed host may explicitly abort, even after elimination, without a winner.
- Mass-attack choices may be prepared locally in parallel. Authoritative checks/consequences proceed clockwise; changed defense guards require a new choice. Victory follows the whole mass effect.
- Sid's eligible two-hand-card heal may interrupt another player's pending decision without changing its ID/owner/continuation.
- Server-authoritative hidden state never reaches unauthorized seats. Concrete deck/outcomes, pending choices, policy and versions survive reconnect/restart. Unknown state fails closed, never redeals.
- Room lock precedes match lock. Authenticate before scoped receipt lookup; identical accepted retries return the original result before stale checks and consume no entropy. Snapshot/lifecycle/receipt commit before acknowledgement.
- Active and terminal participants/host are fixed. No leave, kick, join or readiness mutation after start; no terminal reset/rematch. Create a new room for another game.
- Keep guest tokens and six/ten-character `/r/` and `/room/` compatibility. Preserve approved saloon assets, quiet connection copy and full HTTPS invitation.

Run focused checks, then `npm run check` with actual PostgreSQL (`npm run db:up`, `npm run db:check`, `npm run db:migrate` as necessary). Do not overwrite an existing `.env`. Database tests use disposable isolated schemas; report skipped/unavailable checks honestly. Browser and real-device evidence are distinct from automated test passes.

The public repository is <https://github.com/dazeGG/bang-online>; the established deployment is <https://bang.dazinho.ru>. Read `docs/DEPLOYMENT.md` before publishing. Migration 3 adds durable matches and participant restrictions. Images that only know schema 1/2 cannot be used for rollback after migration 3; use a compatible recovery build, never downgrade the database or remove volumes. Preserve the shared host's neighboring services and never expose credentials.

Finish with the concrete implemented boundary, fresh verification evidence, deployment state and remaining limitations. Continue safe reversible work autonomously within the current task.
