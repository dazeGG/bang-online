# Classic rules baseline and coverage

This document pins the implemented classic rules baseline and named executable coverage. Automated evidence does not replace integrated browser or deployment verification; see SETUP_STATUS.md.

## Sources

Selected baseline: fourth-edition English rules and the official English FAQ (26 answers, 2010). Retrieved 2026-11-17. Hashes identify retrieved bytes, not a publisher promise.

| Source                                                                                           | SHA-256                                                            |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [classic-official-catalog.html](https://bang.dvgiochi.com/list_download.php?id=1)                | `E9F0E7B28275686921230988AE9411F41C42DFD1BCC6D9D26BD1A7BD89665652` |
| [Bang_Card_List_IV.pdf](https://www.dvgiochi.com/giochi/bang/download/BANG%21%20Card%20List.pdf) | `EDD5215E0F4F939FBD8E564A2D7035EEB52BD6826EECE2E4008466D53DCF8740` |
| [Bang_rules_ENG.pdf](https://www.dvgiochi.com/giochi/bang/download/Bang_rules_ENG.pdf)           | `08001B2C4EBB606CB1A0831B85E1A1C1A61E85A3DBD64BC2AE14D1CE8425871D` |
| [Bang_FAQ_ENG.pdf](https://www.dvgiochi.com/giochi/bang/download/Bang!_FAQ_ENG.pdf)              | `9D736344FF1C4FB9552D46AE8EBBE26EFCC1C6699308467BE3BFD61E48B5CAD6` |

The catalog fixture in `packages/game-core/test/fixtures/classic-catalog.json` preserves independently reviewed publisher facts. Publisher HTML ranges/multiplicities were independently compared against the factual fixture during source verification. Implementation tests compare each full physical face, multiplicities and character HP with that fixture.

## Explicit application decisions

- Sid may discard exactly two owned hand cards to heal one HP whenever eligible, including during another player's pending decision. Preserve that interrupted decision and continuation. The conflicting 2015 tournament timing restriction is not selected.
- Gatling and Indians permit local parallel response preparation. Drafts do not consume, reserve or reveal cards and do not draw check cards. Adjudicate clockwise beginning after the actor. Changed defense context invalidates a draft and requires a new selection; revalidate revision and decision when actually submitting. Evaluate victory after the whole mass effect. This is an application convention selected by the players, not asserted printed ordering.
- Wait indefinitely for a required absent actor; no automatic damage, decline, elimination or victory. Host abort is durable and has no winner.
- One exception (user decision, 2026-11-22): an eliminated player's own discard decides only card order, so the server settles it once the match has gone 60 seconds without an accepted change. Hand cards go first, then equipment, in their current order; the receipt is recorded under the eliminated seat with the reserved `overdue:` command ID. The deadline is the durable `matches.updated_at`, so restarts keep it; an intervening Sid heal restarts it. A living Sheriff's penalty discard is still awaited. See `overdueIntent` in [`engine.ts`](../packages/game-core/src/engine.ts) and `resolveOverdue` in [`game-store.ts`](../apps/server/src/game-store.ts).
- Historical public resolutions retain at most 64 face-only entries; they never reveal current hidden instance IDs or ownership. Kit inspection stays private.
- Lucky Duke's two flipped check cards are public during the pending choice and after restart; Kit's inspected cards remain private. Both check cards enter discard in reveal order. The chosen result is logged last for that check, allowing the UI to distinguish the result from the other revealed face.

## Physical catalog

IDs distinguish physical occurrences; the two Stagecoach 9-spades entries are separate. Each row has quantity 1. Evidence: publisher base catalog id=1 and fourth-edition card sheet; source hashes above.

| Instance ID | Kind          | Suit     | Rank | Quantity | Evidence                                |
| ----------- | ------------- | -------- | ---- | -------: | --------------------------------------- |
| classic-001 | barrel        | spades   | Q    |        1 | catalog id=1: barrel; card sheet        |
| classic-002 | barrel        | spades   | K    |        1 | catalog id=1: barrel; card sheet        |
| classic-003 | dynamite      | hearts   | 2    |        1 | catalog id=1: dynamite; card sheet      |
| classic-004 | scope         | spades   | A    |        1 | catalog id=1: scope; card sheet         |
| classic-005 | mustang       | hearts   | 8    |        1 | catalog id=1: mustang; card sheet       |
| classic-006 | mustang       | hearts   | 9    |        1 | catalog id=1: mustang; card sheet       |
| classic-007 | jail          | spades   | J    |        1 | catalog id=1: jail; card sheet          |
| classic-008 | jail          | spades   | 10   |        1 | catalog id=1: jail; card sheet          |
| classic-009 | jail          | hearts   | 4    |        1 | catalog id=1: jail; card sheet          |
| classic-010 | remington     | clubs    | K    |        1 | catalog id=1: remington; card sheet     |
| classic-011 | rev_carabine  | clubs    | A    |        1 | catalog id=1: rev_carabine; card sheet  |
| classic-012 | schofield     | clubs    | J    |        1 | catalog id=1: schofield; card sheet     |
| classic-013 | schofield     | clubs    | Q    |        1 | catalog id=1: schofield; card sheet     |
| classic-014 | schofield     | spades   | K    |        1 | catalog id=1: schofield; card sheet     |
| classic-015 | volcanic      | spades   | 10   |        1 | catalog id=1: volcanic; card sheet      |
| classic-016 | volcanic      | clubs    | 10   |        1 | catalog id=1: volcanic; card sheet      |
| classic-017 | winchester    | spades   | 8    |        1 | catalog id=1: winchester; card sheet    |
| classic-018 | bang          | spades   | A    |        1 | catalog id=1: bang; card sheet          |
| classic-019 | bang          | diamonds | 2    |        1 | catalog id=1: bang; card sheet          |
| classic-020 | bang          | diamonds | 3    |        1 | catalog id=1: bang; card sheet          |
| classic-021 | bang          | diamonds | 4    |        1 | catalog id=1: bang; card sheet          |
| classic-022 | bang          | diamonds | 5    |        1 | catalog id=1: bang; card sheet          |
| classic-023 | bang          | diamonds | 6    |        1 | catalog id=1: bang; card sheet          |
| classic-024 | bang          | diamonds | 7    |        1 | catalog id=1: bang; card sheet          |
| classic-025 | bang          | diamonds | 8    |        1 | catalog id=1: bang; card sheet          |
| classic-026 | bang          | diamonds | 9    |        1 | catalog id=1: bang; card sheet          |
| classic-027 | bang          | diamonds | 10   |        1 | catalog id=1: bang; card sheet          |
| classic-028 | bang          | diamonds | J    |        1 | catalog id=1: bang; card sheet          |
| classic-029 | bang          | diamonds | Q    |        1 | catalog id=1: bang; card sheet          |
| classic-030 | bang          | diamonds | K    |        1 | catalog id=1: bang; card sheet          |
| classic-031 | bang          | diamonds | A    |        1 | catalog id=1: bang; card sheet          |
| classic-032 | bang          | clubs    | 2    |        1 | catalog id=1: bang; card sheet          |
| classic-033 | bang          | clubs    | 3    |        1 | catalog id=1: bang; card sheet          |
| classic-034 | bang          | clubs    | 4    |        1 | catalog id=1: bang; card sheet          |
| classic-035 | bang          | clubs    | 5    |        1 | catalog id=1: bang; card sheet          |
| classic-036 | bang          | clubs    | 6    |        1 | catalog id=1: bang; card sheet          |
| classic-037 | bang          | clubs    | 7    |        1 | catalog id=1: bang; card sheet          |
| classic-038 | bang          | clubs    | 8    |        1 | catalog id=1: bang; card sheet          |
| classic-039 | bang          | clubs    | 9    |        1 | catalog id=1: bang; card sheet          |
| classic-040 | bang          | hearts   | Q    |        1 | catalog id=1: bang; card sheet          |
| classic-041 | bang          | hearts   | K    |        1 | catalog id=1: bang; card sheet          |
| classic-042 | bang          | hearts   | A    |        1 | catalog id=1: bang; card sheet          |
| classic-043 | beer          | hearts   | 6    |        1 | catalog id=1: beer; card sheet          |
| classic-044 | beer          | hearts   | 7    |        1 | catalog id=1: beer; card sheet          |
| classic-045 | beer          | hearts   | 8    |        1 | catalog id=1: beer; card sheet          |
| classic-046 | beer          | hearts   | 9    |        1 | catalog id=1: beer; card sheet          |
| classic-047 | beer          | hearts   | 10   |        1 | catalog id=1: beer; card sheet          |
| classic-048 | beer          | hearts   | J    |        1 | catalog id=1: beer; card sheet          |
| classic-049 | cat_balou     | hearts   | K    |        1 | catalog id=1: cat_balou; card sheet     |
| classic-050 | cat_balou     | diamonds | 9    |        1 | catalog id=1: cat_balou; card sheet     |
| classic-051 | cat_balou     | diamonds | 10   |        1 | catalog id=1: cat_balou; card sheet     |
| classic-052 | cat_balou     | diamonds | J    |        1 | catalog id=1: cat_balou; card sheet     |
| classic-053 | stagecoach    | spades   | 9    |        1 | catalog id=1: stagecoach; card sheet    |
| classic-054 | stagecoach    | spades   | 9    |        1 | catalog id=1: stagecoach; card sheet    |
| classic-055 | duel          | diamonds | Q    |        1 | catalog id=1: duel; card sheet          |
| classic-056 | duel          | spades   | J    |        1 | catalog id=1: duel; card sheet          |
| classic-057 | duel          | clubs    | 8    |        1 | catalog id=1: duel; card sheet          |
| classic-058 | general_store | clubs    | 9    |        1 | catalog id=1: general_store; card sheet |
| classic-059 | general_store | spades   | Q    |        1 | catalog id=1: general_store; card sheet |
| classic-060 | gatling       | hearts   | 10   |        1 | catalog id=1: gatling; card sheet       |
| classic-061 | indians       | diamonds | K    |        1 | catalog id=1: indians; card sheet       |
| classic-062 | indians       | diamonds | A    |        1 | catalog id=1: indians; card sheet       |
| classic-063 | missed        | clubs    | 10   |        1 | catalog id=1: missed; card sheet        |
| classic-064 | missed        | clubs    | J    |        1 | catalog id=1: missed; card sheet        |
| classic-065 | missed        | clubs    | Q    |        1 | catalog id=1: missed; card sheet        |
| classic-066 | missed        | clubs    | K    |        1 | catalog id=1: missed; card sheet        |
| classic-067 | missed        | clubs    | A    |        1 | catalog id=1: missed; card sheet        |
| classic-068 | missed        | spades   | 2    |        1 | catalog id=1: missed; card sheet        |
| classic-069 | missed        | spades   | 3    |        1 | catalog id=1: missed; card sheet        |
| classic-070 | missed        | spades   | 4    |        1 | catalog id=1: missed; card sheet        |
| classic-071 | missed        | spades   | 5    |        1 | catalog id=1: missed; card sheet        |
| classic-072 | missed        | spades   | 6    |        1 | catalog id=1: missed; card sheet        |
| classic-073 | missed        | spades   | 7    |        1 | catalog id=1: missed; card sheet        |
| classic-074 | missed        | spades   | 8    |        1 | catalog id=1: missed; card sheet        |
| classic-075 | panic         | hearts   | J    |        1 | catalog id=1: panic; card sheet         |
| classic-076 | panic         | hearts   | Q    |        1 | catalog id=1: panic; card sheet         |
| classic-077 | panic         | hearts   | A    |        1 | catalog id=1: panic; card sheet         |
| classic-078 | panic         | diamonds | 8    |        1 | catalog id=1: panic; card sheet         |
| classic-079 | saloon        | hearts   | 5    |        1 | catalog id=1: saloon; card sheet        |
| classic-080 | wells_fargo   | hearts   | 3    |        1 | catalog id=1: wells_fargo; card sheet   |

## Card behavior coverage

Implementation is explicit in [`engine.ts`](../packages/game-core/src/engine.ts) (`play`, `respond`, `choose`, `drawPhase`) and [`effects.ts`](../packages/game-core/src/effects.ts) (checks, damage/rescue, elimination, continuation and victory). [`mechanics.ts`](../packages/game-core/src/mechanics.ts) supplies shared draw/distance/reaction operations; [`legal-actions.ts`](../packages/game-core/src/legal-actions.ts) derives actor choices, and [`invariants.ts`](../packages/game-core/src/invariants.ts) validates concrete zones and saved decisions. There is no default placeholder card handler.

`E` below means [`packages/game-core/test/engine.test.ts`](../packages/game-core/test/engine.test.ts); quoted names identify executable tests (parameterized `%s` rows run for the listed kinds). All 80 physical faces are independently checked by `catalog.test.ts`. Rows describe tested local implementation, not deployed-state evidence.

| Kind          | Count | Named behavioral test in E                                                                                                                                                    |
| ------------- | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| barrel        |     2 | `Barrel contributes one response against Slab; Jourdonnais stacks (F Q02)`                                                                                                    |
| dynamite      |     1 | `heart Jail check permits drawing, and Dynamite passes before Jail`; `exploded Dynamite is discarded before Vulture inheritance (F Q14), Bart draws three if surviving (Q24)` |
| scope         |     1 | `Scope/Rose and Mustang/Paul modify alive-ring distance, minimum one`                                                                                                         |
| mustang       |     2 | `Scope/Rose and Mustang/Paul modify alive-ring distance, minimum one`                                                                                                         |
| jail          |     3 | `Jail excludes sheriff/self and all role/character cards (F Q08)`; `Jail check below Jail; failed Jail skips without optional Beer (F Q15, T15 p9)`                           |
| remington     |     1 | `plays %s and prohibits duplicate kind (R p5)`; `replaces the weapon and respects range versus Panic (F Q04)`                                                                 |
| rev_carabine  |     1 | `plays %s and prohibits duplicate kind (R p5)`                                                                                                                                |
| schofield     |     3 | `plays %s and prohibits duplicate kind (R p5)`; weapon replacement test above                                                                                                 |
| volcanic      |     2 | `ordinary Bang limit, Willy and Volcanic exceptions (R p5)`                                                                                                                   |
| winchester    |     1 | `plays %s and prohibits duplicate kind (R p5)`; weapon replacement test above                                                                                                 |
| bang          |    25 | `requires explicit defense/decline and completes prior effect first (F Q13)`; ordinary Bang allowance test above                                                              |
| beer          |     6 | `Beer full-health/two-player is legal and ineffective; Saloon works for two (F Q09,Q16,Q25)`; lethal rescue test below                                                        |
| cat_balou     |     4 | `%s selects public equipment or opaque random hand, including self (R p7; T15)`                                                                                               |
| stagecoach    |     2 | `%s draws correct amount with source already discarded (R p7)`; `recycles resolving Stagecoach itself, without double-discard (T15 p9)`                                       |
| duel          |     3 | `Duel alternates, discards Bang without using allowance, source stays initiator (F Q06,Q21,Q23)`                                                                              |
| general_store |     2 | `General Store is clockwise actor-first and Suzy gets selected card before empty check (R p7, T15)`                                                                           |
| gatling       |     1 | `%s resolves clockwise while exposing private preparation, then checks victory`; `Slab Gatling needs one Missed; Indians permits neither Barrel nor Jourdonnais (F Q03,Q19)`  |
| indians       |     2 | Same parameterized mass test; `Calamity can discard Missed against Indians, without a Bang play allowance`                                                                    |
| missed        |    12 | Explicit defense test; `failed Barrel does not fulfill Slab requirement; a card supplies only one`                                                                            |
| panic         |     4 | Public/opaque targeting test above; weapon-range test; `Suzy can self-target her newly replenished hand with last-card Panic`                                                 |
| saloon        |     1 | `lethal rescue precedes reactive cards; Saloon cannot rescue or resurrect (F Q10,Q11,Q17)`; two-player Saloon test above                                                      |
| wells_fargo   |     1 | `%s draws correct amount with source already discarded (R p7)`                                                                                                                |

## Character health and behavior coverage

Base HP excludes the sheriff bonus. Bart/Burt Cassidy is one character. Setup/catalog tests verify all 16 unique identities and base HP. All named behavior tests below are in E.

Character-specific paths are distributed by responsibility: draw choices in `engine.ts:drawPhase`, Slab/check/rescue/elimination timing in `effects.ts`, Suzy/distance/draw operations in `mechanics.ts`, and legal substitutions/optional Sid choices in `legal-actions.ts`. The reducer independently revalidates every projected option.

| Character       | Base HP | Named behavioral coverage                                                                                                                                                                                                            |
| --------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| bart_cassidy    |       4 | `lethal rescue precedes reactive cards; Saloon cannot rescue or resurrect (F Q10,Q11,Q17)`; `exploded Dynamite is discarded before Vulture inheritance (F Q14), Bart draws three if surviving (Q24)`                                 |
| black_jack      |       4 | `Black Jack reveals only second phase-one card and privately draws red bonus (R p10)`; `Black Jack black second card has no bonus`                                                                                                   |
| calamity_janet  |       4 | `Calamity converts both directions, including Duel and Indians (F Q20)`; `Calamity can discard Missed against Indians, without a Bang play allowance`                                                                                |
| el_gringo       |       3 | `Suzy draws, surviving Gringo steals, and Suzy draws again (T15)`; `Gringo self-initiated lost Duel cannot steal, nor can a fatal victim (F Q17,Q21)`                                                                                |
| jesse_jones     |       4 | `Jesse optional theft immediately replenishes Suzy before the second draw (R p10, T15)`                                                                                                                                              |
| jourdonnais     |       4 | `Barrel contributes one response against Slab; Jourdonnais stacks (F Q02)`; Indians exclusions                                                                                                                                       |
| kit_carlson     |       4 | `Kit privately keeps two in chosen order and returns third atop deck (R p10)`; invalid selections                                                                                                                                    |
| lucky_duke      |       4 | `Lucky chooses Barrel result, discards both in reveal order and reports chosen result last (R p10)`; Sid interruption test below                                                                                                     |
| paul_regret     |       3 | `Scope/Rose and Mustang/Paul modify alive-ring distance, minimum one`                                                                                                                                                                |
| pedro_ramirez   |       4 | `Pedro can take discard before empty-deck recycling (T15 p9)`                                                                                                                                                                        |
| rose_doolan     |       4 | `Scope/Rose and Mustang/Paul modify alive-ring distance, minimum one`                                                                                                                                                                |
| sid_ketchum     |       4 | `Sid anytime interrupt pays ordered two owned cards, preserves foreign defense through JSON restart (F Q26)`; `Sid preserves a foreign Lucky check pool and exact defense resume frame`; full-health/payment/negative-HP regressions |
| slab_the_killer |       4 | `Barrel contributes one response against Slab; Jourdonnais stacks (F Q02)`; failed Barrel and Gatling regressions                                                                                                                    |
| suzy_lafayette  |       4 | `Suzy draws between Slab responses (T15) and after losing last card normally`; `Suzy defers during Duel, and cannot draw a Beer to rescue a fatal lost Duel (F Q22)`; Store/Gringo/Jesse regressions                                 |
| vulture_sam     |       4 | `Vulture inherits before sheriff penalty, including inherited cards (F Q18)`; exploded Dynamite exclusion                                                                                                                            |
| willy_the_kid   |       4 | `ordinary Bang limit, Willy and Volcanic exceptions (R p5)`                                                                                                                                                                          |

## FAQ coverage

Q01 is social guidance: built-in conversation/coaching enforcement is outside this software. Q02–Q26 map to executable tests in E; no placeholder `faq.test.ts` is implied.

| FAQ | Behavior                                           | Named test in E                                                                                                              |
| --- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Q01 | Conversation/coaching conduct                      | Not applicable: no built-in chat or social coaching enforcement.                                                             |
| Q02 | Barrel contributes once against Slab               | `Barrel contributes one response against Slab; Jourdonnais stacks (F Q02)`                                                   |
| Q03 | Gatling preserves Bang allowance                   | `Slab Gatling needs one Missed; Indians permits neither Barrel nor Jourdonnais (F Q03,Q19)`                                  |
| Q04 | Weapon cannot extend Panic distance                | `replaces the weapon and respects range versus Panic (F Q04)`                                                                |
| Q05 | Mass initiator receives kill reward                | `mass attacker receives outlaw reward before continuing to later targets (F Q05)`                                            |
| Q06 | Duel response does not spend Bang allowance        | `Duel alternates, discards Bang without using allowance, source stays initiator (F Q06,Q21,Q23)`                             |
| Q07 | Eliminated player orders discards                  | `eliminated actor orders all discards; outlaw killer receives three cards (F Q05,Q07)`                                       |
| Q08 | Role/character cards cannot be affected            | `Jail excludes sheriff/self and all role/character cards (F Q08)`; target IDs are limited to actual playing-card zones.      |
| Q09 | Saloon works with two alive                        | `Beer full-health/two-player is legal and ineffective; Saloon works for two (F Q09,Q16,Q25)`                                 |
| Q10 | Saloon cannot rescue                               | `lethal rescue precedes reactive cards; Saloon cannot rescue or resurrect (F Q10,Q11,Q17)`                                   |
| Q11 | Saloon cannot resurrect                            | Same lethal rescue test; two-player Saloon test asserts eliminated player stays eliminated.                                  |
| Q12 | No arbitrary discard; Sid exception                | `draws before play and requires ordered excess discards (R p3; F Q12)`; Sid payment tests                                    |
| Q13 | Previous effect completes first                    | `requires explicit defense/decline and completes prior effect first (F Q13)`                                                 |
| Q14 | Exploded Dynamite is not inherited                 | `exploded Dynamite is discarded before Vulture inheritance (F Q14), Bart draws three if surviving (Q24)`                     |
| Q15 | Skipped Jail turn has no optional Beer play        | `Jail check below Jail; failed Jail skips without optional Beer (F Q15, T15 p9)`                                             |
| Q16 | Full-health Beer legal/ineffective                 | Beer/Saloon test named in Q09                                                                                                |
| Q17 | Rescue precedes Bart/Gringo reactions              | Lethal rescue test named in Q10; `Gringo self-initiated lost Duel cannot steal, nor can a fatal victim (F Q17,Q21)`          |
| Q18 | Vulture inheritance before sheriff penalty         | `Vulture inherits before sheriff penalty, including inherited cards (F Q18)`                                                 |
| Q19 | Slab Gatling requires one Missed                   | Slab/Gatling test named in Q03                                                                                               |
| Q20 | Janet substitutes Missed in Duel                   | `Calamity converts both directions, including Duel and Indians (F Q20)`                                                      |
| Q21 | Gringo cannot steal for losing self-initiated Duel | Gringo test named in Q17                                                                                                     |
| Q22 | Suzy waits through Duel                            | `Suzy defers during Duel, and cannot draw a Beer to rescue a fatal lost Duel (F Q22)`; surviving response/source regressions |
| Q23 | No reward for self-initiated fatal Duel            | `no reward for initiating an outlaw fatal lost Duel (F Q23)`                                                                 |
| Q24 | Bart draws three after surviving Dynamite          | Dynamite test named in Q14                                                                                                   |
| Q25 | Two-player Beer legal/ineffective                  | Beer/Saloon test named in Q09                                                                                                |
| Q26 | Sid can heal outside own turn                      | `Sid anytime interrupt pays ordered two owned cards, preserves foreign defense through JSON restart (F Q26)`                 |

## Supplemental evidence and unresolved source boundaries

`R`/`F` in test names denote the baseline rules/FAQ above. `T15` denotes selected historical official [2015 tournament clarifications](https://bang.dvgiochi.com/docs/camp/BANG!_Regolamento_di_Gioco_2015.pdf), SHA-256 `1BEB90CBF0201955CE158648A75E0576C2527E26E41E2DEBE769A9392A7504A2`, primarily page 9. Accepted clarifications cover self-targeted Panic/Cat, finishing mass effects before victory, Suzy/Gringo and Duel/Store/Slab timing, Jail check ordering, player-chosen discard order and reshuffling only when another draw is needed. They do not import tournament abandonment penalties, scoring or the conflicting Sid timing restriction. The user's parallel-preparation/clockwise-adjudication convention fills an unspecified base response order.

Ordinary recycling is implemented. The retrieved baseline does not specify the theoretical both-deck-and-discard-empty case: `both-empty synthetic source fixture returns recoverable resource error, with no fabricated draw/check/penalty` verifies unchanged state and legal host abort rather than asserting an invented official outcome. A reachable unresolved legal trace remains a decision boundary.

## Lifecycle and integration coverage

| Area                                               | Actual executable evidence                                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic setup 4–7, roles, sheriff HP, deal   | E: `deals a deterministic, conserving %i-player game (R p2)`; catalog/classic tests                                                                                                                                                                                                                                         |
| JSON restoration/conservation at every decision    | E: `plays a complete normal %i-player match, reloading EVERY decision`                                                                                                                                                                                                                                                      |
| Semantic continuation recovery                     | `packages/game-core/test/recovery-invariants.test.ts`: `round-trips %s and a legal unrelated Sid interrupt`; `reproduced cursor corruption cannot damage one player twice or skip another`; malformed mass cursor/order/prefix and pending/resume requirements fail closed.                                                 |
| Lucky public checks versus private Kit inspection  | `packages/game-core/test/recovery-invariants.test.ts`: `reveals both pending Lucky check cards to every participant after restart, while Kit stays private`.                                                                                                                                                                |
| All team victory branches / deferred mass victory  | E: `ordinary Sheriff death awards Outlaws; removal of all enemies awards sheriff/deputies`; `Sheriff death does not skip later mass targets; surviving Renegade wins (T15)`                                                                                                                                                 |
| Decode/rejection/privacy                           | E: `fails closed on corrupt %s`; `rejects invalid setup before entropy and never mutates inputs`; `keeps projections detached and every hidden identity private, even terminal`                                                                                                                                             |
| Atomicity, retries, fixed participants             | `apps/server/test/game-store.test.ts`: `rolls back snapshot, receipt, room status and participants on transaction failure`; `serializes simultaneous IDs, deduplicates across new pools, and never consumes duplicate entropy`; `freezes lobby membership through terminal state and restricts direct participant deletion` |
| Required actor, multiple tabs, server restart      | `apps/server/test/game.test.ts`: `waits for required actors, counts multiple tabs, and restores exact decisions after server restart`                                                                                                                                                                                       |
| Real-engine PostgreSQL/socket complete matches 4–7 | `apps/server/test/game.test.ts`: `finishes an actual %i-player deal using projected legal actions`                                                                                                                                                                                                                          |
| Private choice abort/retry                         | `apps/server/test/game-core-integration.test.ts`: `persists abort while private Kit choices are pending without losing physical cards`; `atomically aborts and retries at a real %s boundary`                                                                                                                               |
| Mass checks, guard changes and restart             | E: `canonical Barrel checks consume deck in seat order regardless of future draft`; `changed inherited defenses invalidate future guard; current Lucky/rescue has no second draft`; server `keeps future preparation private and provisional while the current actor is absent, then resumes clockwise after restart`       |
| UI decisions, outbox and preparation               | `apps/web/test/game-interface.test.ts`; `apps/web/test/game-command-state.test.ts`                                                                                                                                                                                                                                          |

Contract fixtures prove decision-shape expressibility only. Real PostgreSQL tests must execute without unavailable skips; browser/device and production checks remain separate receipts in [SETUP_STATUS.md](SETUP_STATUS.md).
