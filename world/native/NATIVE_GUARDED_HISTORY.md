# Native guarded history laboratory

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


8 September 2026. This component implements the boundary-before-motion computation selected in the [Street terminal policy](../../docs/native-terminal-closure-policy.md). It supports a terminal boundary at genesis and a terminal boundary that stops moving cars without executing another tick. It retains the frozen [motion graph](../../output/qualification/native-street-export-20261018/preimage/app/world/native/street_race.rs), [lifecycle](../../output/qualification/native-street-export-20261018/preimage/app/world/native/street_lifecycle.rs), [earlier sequence](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/membership_sequence.rs), and [already-done finalizer](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/street_adjudication.rs) unchanged.

**Qualification is incomplete.** The completed native lane passes 26 tests, 21 accepted CLI commands and 70 rejected mutations across the main and supplemental runs. It exercises ordered scalar/membership proof composition, including genuine zero-motion and moving-state closure. It does not authenticate accepted controls, checkpoint certificates, consensus removals, or ledger state. Extraction/base-membership premises, full integer execution, composed soundness, a 128-bit security target, full race duration, supported-target coverage and live XOR/NFT settlement remain unqualified.

## Generic boundary and motion grammar

The application-independent [guarded sequence](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/guarded_sequence.rs) compiles two complete `OperandProgram` sources from their `AirView`s: a boundary computation and a motion computation. The immutable statement specifies exact genesis, both input maps, the motion-output-to-state map, cursor/halt policy, public boundary and motion action tapes, final boundary outputs, and application context. It supports:

```text
B0, M0, B1, M1, ..., B(N-1), M(N-1), BN
```

There are exactly `N+1` boundary proofs and `N` motion proofs. For `N=0`, `B0` is a real, nonempty component proof and must prove closure from exact open genesis.

Write `S_b` for raw state after `b` motion transitions and before boundary removals `D_b`. Boundary `B_b` proves `J(S_b,D_b)`. Every boundary before `N` must remain open; `B_N` must be closed and its complete output vector must equal the immutable final claim. Every raw state before `N` must have cursor `b` and halt flag zero. The final raw state may already be terminal from the preceding motion or remain open until `D_N` closes it.

Motion `M_b` consumes the **same raw `S_b` and same `D_b`**, together with motion controls `C_b`. It does not consume an adjusted boundary output. Its persistent output projection must advance the cursor exactly once, from `b` to `b+1`. Only a successfully verified motion installs the next private raw state. This establishes the earliest terminal boundary relative to these compiled predicates and supplied numerical tapes; it does not establish that those tapes are authoritative.

Each input map entry is a state index, boundary-action column, motion-action column or canonical constant. Every raw state element and every boundary-action column must occur in the boundary relation; every motion-action column must occur in motion. Boundaries cannot read motion controls. Repeated map entries retain their occurrences. Construction checks exact row widths, canonical fields, map indices, distinct cursor/halt locations and bounded dimensions before constructing either owned core. Application authors still choose the correct semantic maps; the Street driver provides the concrete maps described below.

The compiled sequence identity binds the versioned grammar, role-specific complete source descriptor hashes **and lengths**, policy, context, maps, exact genesis, all rows of both tapes and all final outputs. The native execution domain is `iroha:execution:guarded-sequence:lab-v1`. Each component binds that identity, its role and its index before its initial commitment is accepted. Local admission limits are not a substitute for semantic identity or authority.

The verifier owns its running state and exposes no state-import or witness-evaluation operation. It enters a poisoned state before checking each attempted component. A wrong role/index, invalid predicate, invalid proof or other failure leaves it poisoned permanently. It updates state, totals, receipt chain and expected position only after all checks succeed. `finish()` requires exact completion through `B_N`; an empty proof stream, missing final boundary or extra component cannot yield a complete receipt.

The completed receipt binds the ordered component chain, including each component's binding, both oracle roots and completed transcript. It returns the final raw `S_N` separately from the adjusted final boundary outputs. The raw state remains useful for a future checkpoint-before-removal bridge; possession of it does not authenticate any checkpoint certificate.

## Street persistent state and no-driving boundary

The new [Street boundary graph](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/street_boundary.rs) accepts 2–8 original roster slots. Its persistent input order is:

```text
tick, done, worldBrokenMask,
for each original slot:
  progressMm, lateralMm, speedMmPerTick,
  bodyYawMicroturn, velocityYawMicroturn, energy,
  nextGate, status, finishTick, finishNumerator, finishDenominator
```

The final input ports are one Boolean `cN.removeAtBoundary` per slot. Controls, motion-forfeit actions, weather and event feedback are not persistent state. Output order is the exact same `3+11r` persistent prefix, `refundAllForfeit`, `technicalWin`, then a `rank,winner` pair per slot: `5+13r` output fields in total.

Construction checks the selected motion graph's exact ordered input contract, selected tick/gate bounds, complete output vocabulary, literal catalog descriptors and every output occurrence's source-node metadata. Persistent input/output ordinals and genesis are exported explicitly. Mutable `initial_inputs` metadata cannot redefine genesis: it must match the original native grid. These are local schema/provenance checks; an enclosing verifier must bind the complete selected source and its context, as this guarded composition does.

At tick zero, before removals, every persistent field must equal native genesis. Header fields are zero. Slot `i` starts at progress `-1-3999*floor(i/2)`, lateral position `-950` or `950`, energy `1000`, running status and finish denominator `1`; other car fields are zero. The graph eagerly validates this exact state even when the removal set would erase status or finish metadata.

At every boundary it also checks canonical carried state before removal:

- All native integer intervals remain enforced, including status, energy, yaw, gate, speed, tick and finish-fraction bounds.
- A finished car has a positive finish tick no later than the current tick, a positive numerator no larger than its denominator, complete gates and progress at or beyond the finish. Nonfinish statuses use precisely `(finishTick, numerator, denominator) = (0,0,1)`.
- Running and timeout cars have a pending gate and progress before their next expected station. Timeout exists only at the cap; running status requires a tick below the cap. Forfeited cars may retain a completed gate cursor from an earlier finish.
- Prior `done` equals the native ranking's derived terminal predicate. Non-running cars already have zero speed; if prior `done=1`, all cars already have zero speed.
- The world mask has the selected catalog's bound, and every oil-entry bit is zero: oil is never a broken prop. The mask is preserved unchanged.

Removal sets status to `FORFEIT`, clears finish metadata to `(0,0,1)` and stops the removed car. It preserves position, lateral offset, both headings, energy, gates, world mask and elapsed tick. Repeated numerical removal of an already-forfeited slot is idempotent; a future history adapter must separately reject a duplicate authority event when the lifecycle forbids it.

Ranking is recomputed using exact integer finish-fraction cross-products and competition ranks. Forfeits rank below eligible racers. Zero eligible racers yields an all-forfeit refund and zero winner flags. A sole eligible racer yields a technical win, even if that survivor retains running status. Otherwise each eligible rank-one racer wins only when the resulting boundary is terminal; open-boundary winner flags are all zero. Exact ties are preserved. This graph emits award flags, not token amounts or NFT transfers.

If removal leaves the boundary open, surviving running cars retain their speeds. If it closes the boundary, all speeds become zero without changing position or tick. The graph evaluates no geometry, handling, weather, collision, boost, gate-crossing or finish event. Integer mask decomposition is only a carried-state validity check.

For partial genesis removal with at least two surviving racers, `B0` remains open. Passing its adjusted output into frozen motion would fail the original graph's exact tick-zero genesis checks. The Street driver (retired source path `scripts/native/native_guarded_history.rs`) instead supplies original `S0` to both graphs and maps the same `D0` to motion's `consensusForfeit` ports. Motion applies that removal once while advancing the remaining racers. Removed positions therefore remain at genesis; no boundary adjustment is installed as a second carry state.

## Component proofs and the remaining premises

Every role uses the complete [two-phase membership adapter](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/phased_membership_proof.rs), described in [Native membership](NATIVE_MEMBERSHIP.md). It retains all scalar equations, range occurrences, indexed-ROM occurrences and public input/output ports of that role's source, including eager checks and unused source occurrences. Both actual oracle domains have constrained zero tails. The initial bank uses Base encoding and the challenge-dependent inverse bank uses Extension encoding.

Global staged layout padding is eliminated by the operand compilation and is not reported as verified padding. That is distinct from the two real membership-oracle tails, which remain authenticated and constrained in every component. Component counters separately retain source equations, range/ROM occurrences, membership equations, ports, tail cells, authenticated oracles and proof bytes.

This is linear-size composition with one genuine component proof per role occurrence. It is not recursion, accumulation, aggregation or a single succinct whole-history proof. Reusing a source program does not share its Merkle openings across ticks. Byte lengths and times cannot be extrapolated to a 30 Hz, 180-second race without further measurements and an appropriate protocol design.

The accepted field-equation components rely on the inherited proof premises. Honest Base commitments and sampled Base leaves do not themselves qualify extraction of an integer witness. This layer supplies no new proof of that premise, no composed soundness theorem and no 128-bit security claim. It supplies no zero-knowledge claim.

## Standalone CLI, framing and resource admission

The native runner (retired source path `scripts/test-native-guarded-history.py`) assembles unchanged retained native hash/field/PCS modules and pinned precompiled dependencies. It performs no Cargo build and changes no maintained Iroha checkout. The CLI has separate commands:

```text
native_guarded_history fixture <2..8> <case> <statement> <witness>
native_guarded_history prove <statement> <witness> <proof>
native_guarded_history verify <statement> <proof>
```

Fixture cases are `genesis-sole`, `genesis-refund`, `moving-sole` and, for at least three racers, `partial-genesis-moving`. Only fixture generation evaluates native nodes and produces/checks witnesses. Verification rebuilds public source relations and mappings, reads the public statement and proof, and uses the guarded verifier. It has no witness-path parameter and does not call fixture generation.

The bounded binary formats are separate from Iroha transaction codecs:

| File | Fixed header | Following data |
| --- | --- | --- |
| Statement | `IWGBST01`, roster byte, `N`, final-output count, context length, sequence digest | Context, all `N+1` boundary rows, all `N` control rows, exact final outputs. |
| Witness | `IWGBWT01`, component count | Ordered role/index, output count, original-value count, public outputs and original canonical values per component. |
| Proof | `IWGBPR01`, `N`, sequence digest | Ordered role/index, output count, public outputs, initial root, proof length and complete two-phase proof per component. |

Counts are big-endian `u32`, base fields big-endian canonical `u64`, role is one byte, and native digests use their canonical 48-byte little-endian representation. The statement's fixed prefix is 69 bytes; proof prefix is 60 bytes. Proof-frame overhead is 61 bytes plus eight bytes per output, before inner proof bytes; witness-frame overhead is 13 bytes before its fields. Input readers require regular files, admit lengths before allocation, reject noncanonical fields/digests, detect truncation, and require exact EOF including no growth beyond the admitted length. Outputs use exclusive creation and are never overwritten.

The CLI limits motion to 9,000 steps, 4,096 ports, `2^20` original values per component, a 64 KiB context and an 8 MiB + 4 KiB component proof. The selected native rules may impose a smaller tick cap. Public statements have a 4 MiB file ceiling. Checked arithmetic derives sequence-file limits; the parser never allocates all proof records at once. The fixture currently retains short generated frames, whereas prove/verify process their input stream one component at a time.

The generic composition allows at most 65,536 motion steps, 4,194,304 action cells, 4,096 ports, a 64 KiB context and a 64 MiB descriptor. Its default tracked-payload ceiling is at most 5 GiB and `isize::MAX`. Admission conservatively charges two 1 GiB owned-core ceilings, retained maps/tapes/genesis/final outputs, descriptor capacity, port scratch and fixed scratch. Before a component operation it additionally charges that component's admitted dense-proving, opening or verification payload. Both public sources remain compiled even when `N=0`.

Those charges are admission bounds, not allocated-byte or RSS measurements. Caller-owned graphs/lowerings, witness/proof buffers, allocator overhead and opaque native scratch remain outside that accounting; measured process RSS must be reported separately. The fixed two-core admission cannot fit a 32-bit `isize` payload ceiling and conservatively rejects there. No supported-target or accelerated-path coverage is established by this source design; those require actual target builds and parity evidence.

## Completed native evidence

The [main report](../../output/qualification/native-guarded-history-attempt-1/report.json), SHA-256 `7eb0ebe673c91f45a6e0cfdc87706a7c1149852abff61ca91c96cefc65d4807f`, records 26 distinct passing tests: 12 generic guarded-sequence tests, five boundary owner tests and nine independent Street boundary tests. They cover genuine component proofs, program-only verifiers, all rosters 2–8, exact genesis, numerical removals, finish fractions/ties, stopped speeds, oil masks, raw-state continuity, false carry, altered semantic identities, role/index replay, missing/extra components and permanent failure poisoning. The independent arithmetic fixture checks native nodes against the complete lowering and retained range/ROM occurrences; those diagnostics are distinct from the genuine proof cases.

Seven CLI cases each complete fixture generation, proving and isolated verification: **21 accepted commands**. Four zero-motion cases contain one boundary proof each; three two-motion cases contain `B0,M0,B1,M1,B2`. The seven proof files therefore retain 19 role frames, comprising 13 boundaries and six motions. No empty component list is accepted as genesis closure. In every isolated verifier directory, only `statement.bin` and `proof.bin` are present and the original witness path is absent. Verification reports no witness generation and no evaluated native-node count.

These are complete process observations from the same shared host, with proof bytes including outer framing:

| Cars | Case | Motion ticks | Proof bytes | Prove process, s | Verify process, s | Prove peak, MiB | Verify peak, MiB |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | Genesis sole survivor | 0 | 261,117 | 0.714008 | 0.774767 | 51.234 | 49.484 |
| 2 | Genesis all-forfeit refund | 0 | 252,333 | 0.715180 | 0.772050 | 51.578 | 49.281 |
| 2 | Moving sole survivor | 2 | 2,378,721 | 11.270259 | 5.678474 | 170.094 | 104.625 |
| 8 | Genesis sole survivor | 0 | 529,901 | 7.393055 | 7.021034 | 598.609 | 598.375 |
| 8 | Genesis all-forfeit refund | 0 | 532,093 | 7.422016 | 7.019254 | 598.078 | 598.312 |
| 8 | Moving sole survivor | 2 | 3,986,081 | 93.691129 | 40.346883 | 1,527.969 | 977.422 |
| 8 | Partial genesis removal, then motion | 2 | 3,965,857 | 93.642544 | 40.441527 | 1,551.000 | 978.438 |

One MiB is `2^20` bytes. Exact byte RSS and unrounded times remain in the report. Process times include launch/exit and runtime construction of the native graphs, lowerings and compiled relations. They **do not include a Rust compiler invocation**. The separately recorded optimized `rustc` driver build took 4.307894 seconds, test-binary compilation 7.302009 seconds, and the two selected test groups 6.226716 seconds. The compiler was native `1.93.1-aarch64-apple-darwin`, SHA-256 `34a8f7034eeb844189a3c36ebb3fe36c2193fdb47b60028eb7f9392cb1f62484`, with `opt-level=3` and retained dependency artifacts. Runtime source construction explains why an eight-car zero-motion case still compiles the full selected motion relation.

These measurements are individual observations, not medians, throughput estimates, validator benchmarks or accelerated-path comparisons. They establish no performance gain against prior lanes. In particular, the two-motion cases do not qualify a full 5,400-tick race or the longer supported native tick cap. Peak RSS includes caller-owned source construction and allocator effects excluded from the component payload budget.

The main run also records **21 rejected CLI mutations**, covering context, terminal removals, winner claims, trailing statements, altered roots, omitted final boundaries, motion-before-boundary order and overwrite attempts. It checks exact raw/final state correspondence, unchanged physical fields, stopped final speeds, real inner proofs and canonical frame geometry. The partial-genesis case removes slots 2–7 at `B0`, leaves two racers active for motion and removes slot 1 at `B2`; the removed cars retain their original grid positions and zero speeds.

The separate [frozen-binary parser audit](../../output/qualification/native-guarded-history-cli-audit/report.json), SHA-256 `8d5ff3f5f7c4fb2e81f519b6a6b8f75b92cbdc30fa3eb908b075baa9e99051e8`, passes **49 further rejections**. It runs no compiler, fixture generator or successful prover, and generates no new component proof. Every command exits with exactly the intended explicit error and no success JSON, panic or allocation failure. Its malformed-witness cases fail before component proving, and newly created rejected output files are removed. Cases cover all three file headers, invalid dimensions/roles/counts, noncanonical fields and digests, truncation, record/file ceilings, nonregular inputs, trailing bytes and extra boundary frames.

The two reports therefore contain **26 passing tests, 21 accepted commands and 70 rejected commands**. Independent read-only validation matched all 200 main artifacts, 39 current source pins, nine frozen native source pins, compiler identity and main log/JSON/RSS values; it also matched all 152 supplemental artifacts and their exact errors. These are report-local counts, not final archive totals. The [guarded-history evidence manifest](../../artifacts/native-guarded-history.json) records the immutable archive index, exact measurements, source identities and retained report hashes. Earlier manifests and their document snapshots remain unchanged.

## Authority and deployment work that remains

The sequence binds every supplied numerical action row; a hash of a tape or context does not show that consensus accepted it. The [terminal policy](../../docs/native-terminal-closure-policy.md) still requires an authenticated complete selected-history snapshot, original input-key signatures, checkpoint-before-removal roots, matching commitments/reveals, pending certified inputs, forced-round geometry, removal-marker correspondence, deadlines and retained unexecuted suffixes. This component has no input for those certificate structures and cannot certify them implicitly.

Likewise, its numerical removal mask accepts every bounded slot bit. An authority adapter must derive legal `D_b` sets, reject duplicate events, enforce actual batch-start timing, prevent prohibited cap removals, and retain later events without changing awards. Binding a prover-selected context string does not satisfy any of those obligations.

The CLI's granular computation flags refer to the proved grammar and stopped boundary. Its broader accepted-history, integer-execution, extraction, composed-security, terminal-adjudication, finality and settlement qualification flags remain false. No native ISI registry admission, consensus reserve protection, XOR/NFT payout, Taira activation or SoraFS publication is performed by this laboratory.
