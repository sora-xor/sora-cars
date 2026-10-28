# Equal-performance racing classes and equipment

This is the first-release design and remaining implementation contract. The isolated class reference/AIR and equipment schema foundations are not yet integrated custody or a qualified purchasable performance class.

Stock racing uses equal-performance cars. Paid liveries and visual accessories change presentation. A performance kit selects a separately qualified class with one common, immutable parameter vector for every entrant. The first Touring S1 candidate has acceleration44, normal maximum speed2640 and boosted maximum speed3300 mm/tick. Kits cannot stack or introduce per-player hidden multipliers. The versioned compiled relation must constrain class selection, all integer bounds, environmental hazards and every state transition.

A kit is an NFT resource temporarily reserved for the session. It is never an implicit wager. Only separately and explicitly staked wager NFTs transfer to winners. The kit returns to its original owner at a valid terminal transition or legal unstarted expiry. Active sessions do not unlock resources merely because someone withholds inputs or leaves the page.

The canonical `JoinGameSessionV1` payload must carry explicit typed resource clauses with exact NFT ID, metadata hash, reviewed role and return policy, alongside its exact manifest, asset and stake terms. Replace the draft payload directly; do not introduce compatibility-only JoinV2 instructions, old decoders or fallback authorizations. The wallet signs exactly what its preview displays. Native code verifies current owner, complete metadata, compiled requirement, class/catalog and all custody conflicts before atomically acquiring the seat, XOR stake and every required NFT. Failure rolls back the complete transaction. The existing explicit Join-plus-wager batch remains a distinct user choice.

Keep retained equipment records in consensus state with a bounded canonical schema, a query/event surface and full snapshot/state-root coverage. Records must include original owner, permanent slot, NFT, metadata/role commitment, derived non-signable custody and common terminal return height. Restore validates both forward and inverse references, including orphan custody. Generic transfers, burns, account/domain deletion, sale custody and wager instructions cannot bypass the reservation. See [game-resource-schema.md](game-resource-schema.md) for the current bounded model foundation.

The proof statement and payload bind network, session, profile, manifest, immutable class/catalog, original roster and input keys, resources, wagers, replay, checkpoints, dispute history and outcome. The verifier recomputes commitments from ledger state and canonical public payload; an opaque user-supplied roster hash is insufficient. Exact NFT eligibility is verified by consensus admission and bound into the proved instance. Providers/issuers never supply arbitrary verifier code or determine winners.

Browser matching uses the exact network, application, profile, rules/catalog, class, track, payout and stake tuple. Joining shows the kit ID, temporary return policy, XOR debit and separate fee limit in Japanese with English subtitles. Account, client, manifest, ownership or quote changes invalidate the review. Replays and spectators use the same generated class/environment simulator; signed appearance packets confer no NFT ownership or equipment authority.

Remaining gates:

- Integrate current native resource types into canonical Join, consensus reservation/return, custody indexes, snapshots, queries/events and SDK/Connect fixtures.
- Compile the complete class/environment reference and arithmetic constraints; export browser kernels and native-origin parity fixtures.
- Prove maximum-duration eight-car sessions for each class and qualify proof-size, memory, validator cost, hardware parity and independent soundness.
- Reject forged metadata, mutable or foreign collections, duplicate resources, ownership changes, market/wager conflicts, mismatched classes/clauses, missing kits and unqualified zero-XOR NFT reservation.
- Exercise concurrent last-seat entries, failing Join-plus-wager rollback, exact terminal returns, forfeits, all-forfeit refunds, restart and four-validator convergence.

Historical measurements under `output/qualification/classed-*-v1/` cover the isolated reference, codecs, whole-tick AIR and full microcycle traces before the current environmental rules. They do not qualify the final integrated class.
