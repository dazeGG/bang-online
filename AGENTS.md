# Project instructions

## Working agreement

- Communicate with the user in Russian. Write internal documentation, plans, and code comments in English unless explicitly requested otherwise. Product strings may be Russian.
- Continue safe, reversible implementation and verification autonomously. Ask only when missing information materially changes the result, authority is missing, or the action is destructive or irreversible.
- Inspect the existing implementation before changing it. Keep edits small and preserve unrelated work.
- Never commit secrets, expose private player data, or run destructive database or filesystem operations without explicit authorization.
- Use native subagents only for independent, bounded work when delegation materially improves throughput. Give each agent explicit file ownership and integrate its result before claiming completion.

## Product scope

- First release: private online **classic BANG! for 4–7 players**, with the base game's cards and characters.
- Dodge City, three/eight-player modes, Redis, bots, public matchmaking, built-in voice, and native clients are outside the first-release scope. Reconsider them only after a new user decision.
- The current repository is a development scaffold. Do not describe rooms, gameplay, session recovery, or durable match persistence as implemented until verified.
- Read `docs/PROJECT_BRIEF.md` before making product or architecture decisions.

## Architecture

- Keep the npm workspace structure: `apps/web`, `apps/server`, `packages/contracts`, and `packages/game-core`.
- Use the established TypeScript stack: React/Vite, Node.js/Fastify/Socket.IO, and PostgreSQL.
- Keep game rules in `packages/game-core`, independent of React, Socket.IO, and database access.
- Keep transport contracts separate from authoritative private server state. Never send another player's hidden role, hand, deck order, or private session token to unauthorized clients.
- The server validates every command. Serialize commands per room, deduplicate retried commands, and persist accepted state changes atomically before acknowledging them when those features are introduced.
- Store pending responses, ruleset version, turn/phase, deck order, and the defined timeout policy in durable match state. Browser timers are display-only.
- Do not add infrastructure, dependencies, generic plugin systems, or compatibility layers without a concrete need within the active task.

## Validation

- Keep TypeScript strict. Validate untrusted network payloads at runtime; static types do not validate incoming data.
- Add focused tests for changed behavior, especially hidden information, authorization, response sequencing, duplicate commands, and reconnects.
- Run the smallest relevant checks first, then `npm run check` before reporting an integrated change as complete.
- Report verification gaps explicitly, including an unavailable PostgreSQL or Docker daemon. Passing a liveness endpoint does not prove database readiness.
- Keep README commands and environment documentation synchronized with the code.
