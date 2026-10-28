# Native witness ownership and local allocation budgets

The isolated Iroha worktree now retains immutable runtime recipes for Street
witness generation. Compiler caches are discarded after lowering; the runtime
recipe keeps the complete graph, scalar constraints, range checks, fixed ROM
lookups and ordered input/output maps. This reduces retained compiler state
without replacing the computation with a claimed replay result.

`FrozenCircuit`, `FrozenGraph` and `FrozenScalarLowering` expose checked payload
counts based on actual vector capacities and owned headers. Witness/evaluation
methods admit their local buffers before reservation, use fallible allocation,
and reconcile the allocator's actual capacity before filling them. Integer
overflow, unsupported address-space sizes and insufficient budgets fail closed.
Graph evaluation still checks eager nodes, including an unselected branch.
Scalar projection preserves every range and ROM membership obligation.

The budget belongs to a specific allocation phase. Borrowed caller inputs,
retained recipes and preceding compilation allocations are explicitly separate.
These local checks alone do not bound the whole prover, verifier, allocator or
process RSS. The following owned-proof integration combines several of those
owners; later verifier accounting remains a separately reviewed candidate.

## Evidence and current qualification

The [seven-file applied candidate](../tmp/native-witness-resources-integration-work/candidate.json)
has SHA-256 `2e2183055114ecee47a7d5074144bf77241e22b4071922dd02c5c5b0a286c73f`.
The [application receipt](../tmp/native-witness-resources-integration-work/application-receipt.json)
records exact preimages/postimages, patch application and scoped formatting.

The [terminal composite report](../output/qualification/native-witness-resources-observed-composite-1/report.json)
now records **76 successful exact tests**, including all-roster compilation and
a genuine 252,701-byte zero-motion public proof. Its SHA-256 is
`f20872a53c5e2542c3b81cbdfa267a91b0503d0f8c69553f2e4781292d94c10b`.
The [independent terminal audit](../tmp/native-witness-composite-independent-review/terminal-audit.json)
checks 1,261 retained identities, all exact test outcomes and the full geometry
census. The prior [75-receipt audit](../tmp/native-witness-recovery-receipts-audit/audit.json)
remains unchanged historical evidence.

The final test evaluates the real Tokyo graph and complete scalar witness for
2–8 cars over two motion ticks. It checks checkpoint cuts at ticks 0, 1 and 2,
forming 21 successful cases and 28 admitted width-two spans in 5,664.68 seconds.
This test measures
relation/admission geometry; it does not generate a moving proof or establish
ledger authority, a registered profile, full-race resources or security.

Two control sessions were lost during the build/test qualification. The old
reports remain unchanged. The original Cargo output says the build succeeded,
but its operating-system exit/reaping receipt was not retained; the executable's
first content hash was taken during recovery. The final test continued as an
orphan. A read-only Darwin kernel observer recorded that exact process's normal
exit 0. The original target, observer and old supervisor are now absent; the
terminal event, complete output and census passed both audits without a rerun.
The composite distinguishes 75 parent-reaped outcomes from one kernel-observed
outcome. It does not claim that the observer reaped the orphan or recover the
original Cargo exit/reaping receipt.

## Next integration

The frozen 41-file candidate has now been [applied with exact postimages](../output/qualification/native-street-owned-application-1/application.json).
It adds native owned accepted-execution sources,
fixed segment transport, complete record ownership accounting and corresponding
Data Model/SDK changes. Its reviewed v3 qualification requires the completed
witness evidence, unchanged compiler guards, 123 fresh exact tests and genuine
N0/N6 public proof exports. That [fresh qualification](../output/qualification/native-street-owned-attempt-1/report.json)
is running under a detached supervisor that owns and reaps its native children.
The production Torii check and all four current-Cargo library-test builds have
passed, including the fresh Core build with its actual exit/reaping receipt.
The genuine six-motion public-bundle test also passed and exported three segment
proofs for 13 logical components (2,796,888 proof bytes). The full selected
test/proof gate remains pending; this short local fixture does not qualify a
full race, consensus lifecycle or settlement.

A [source-level follow-up](../tmp/native-operand-owner-accounting-review/review.md)
identifies how to replace two conservative 1 GiB compiled-owner reservations
with a shared, defining-layer census of retained buffer capacities. A later
[scratch implementation](../tmp/native-operand-owner-capacity-work/README.md)
now covers the program, composition and sequence owners; it is unapplied and its
tests are unrun. No measured saving is established. Construction admission remains separate:
counting retained buffers afterward cannot establish a pre-allocation bound.

The generic game ISIs remain the application boundary. Full-duration proof
compression, composed 128-bit security, supported hardware parity, finalized
four-validator settlement, wallet interoperability and Taira/SoraFS activation
remain required. None of the local allocation checks enables live XOR or NFT
stakes.
