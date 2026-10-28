# Canonical first-release race outcomes

The SDK exposes one `RaceV1` result policy through `deriveRaceResultV1` and `deriveRaceOutcomeV1`. Every eligible racer ranks ahead of every forfeited racer, including a racer who finished before forfeiting. Eligible finish ties split the prize. A sole eligible survivor wins technically; at the time limit the greatest eligible progress wins, including exact distance ties. All-forfeit sessions have no winners and refund original stakes.

`isRaceTerminalStateV1` checks the native terminal predicate. Result derivation validates exact native state shapes and bounded integers; it does not establish reachability, accepted inputs, ledger inclusion or finality. Native execution proof verification and authenticated ledger verification remain separate requirements.

The game uses this same policy for HUD positions, result places, replay/history and generic outcome construction. There are no old-policy aliases or profile-selected historical result fallbacks. Source changes during first-release development invalidate prior profile qualification; native-origin outcome fixtures must be regenerated from the current reference. Standalone replay files require the current rules commitment rather than silently accepting obsolete driving semantics.

SDK source: `../iroha/javascript/iroha_js/src/raceOutcomes.js`. Native source: `../iroha/crates/iroha_core/src/execution_proofs/race.rs`. Current native-origin vectors: `../iroha/javascript/iroha_js/test/fixtures/race-outcomes-v1.json`.
