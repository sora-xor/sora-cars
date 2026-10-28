# Native guarded execution segments

The September 2026 research identifies repeated complete component proofs as a
major cost in the native Street backend. The next implementation combines a
bounded sequence of existing compiler-owned relations into one genuine native
membership proof. It preserves the original equations, indexed lookups and
public ports. This is a step toward cheaper complete execution proofs; it is not
accumulation, a full-race performance result or a composed security qualification.

The initial kernel is applied in the isolated `iroha-sora-cars-native` worktree.
Production Torii checking and all 44 native tests pass. An independent audit
checks all 163 selected native inputs, 488 file identities, individual test logs
and 51 completed commands. The 583.254-second duration covers the complete
unoptimized build-and-test run; it is not an isolated proving benchmark.

## Exact state continuity

For Street, boundary `B(k)` and motion `M(k)` both read the raw state produced by
`M(k−1)`. Boundary outputs may adjudicate removals or awards; those outputs must
not replace the motion input state. A segment containing two motions proves
`B(0), M(0), B(1), M(1), B(2)` together, with actual field equalities linking each
raw-state output port to every later consumer. The final boundary is mandatory.
Zero-motion execution still requires its final boundary proof.

The deterministic partition splits exactly at the selected checkpoint. The
kernel binds the complete partition, sequence, action tapes, checkpoint words,
segment ordinal and range before commitments or challenges. Every supplied
output belongs to the same combined relation; derived inputs use immutable tapes
and the private candidate state. The verifier accepts incoming state only from
genesis or its previous successfully verified segment.

An incorrect proof or malformed attempt poisons that verifier. State, counts,
checkpoint status and the proof receipt advance together after verification.
An incomplete prefix cannot produce a completed execution receipt, and a
nonfinal prefix cannot accept a prematurely halted state.

## Resource admission

Original programs retain immutable shared ownership. The planner and proof
kernel charge source owners, composition storage, metadata, live claim slices,
witness buffers and proving headroom before dependent work. These are conservative
tracked payload bounds, not measured process memory. Allocator overhead, opaque
native scratch and concurrent jobs still require separate qualification and
outer scheduling. A separate actual-Core Tokyo geometry run admits all 21 cases and 28 spans
across 2–8 cars and checkpoint cuts 0/1/2 with two-motion segments. It checks
complete witnesses and combined relation admission, without generating proofs.
Its largest dense adapter estimate is 2,059,822,974 bytes; this is not measured
RSS or complete aggregate caller admission. Full proving headroom remains open.

The September 22 audit rehashes 390 identities, including all 164 selected native
sources and both binaries from that September 13 geometry run. Seven commands
completed successfully. The retained evidence matches; fourteen current tools
have changed and one old sccache binary is absent, so this is not a current-tool
reproduction. The geometry report and audit are retained in
`output/qualification/native-street-geometry-attempt-1/`.

## Current evidence and next integration

The preceding operand-composition run passed 30 exact native tests. Shared
immutable ownership then passed 33 tests, with fresh execution and an independent
retained-evidence audit. The segment run freshly executes all 33 regressions plus five
planner and six proof tests. Its new adversarial cases include a genuine proof
for the wrong incoming state, inconsistent internal carries with matching public
claims, malformed checkpoint words, incorrect order, incomplete execution and
corrupted proof bytes.

The existing public Street stream still uses one frame per boundary or motion.
Migrating it requires a canonical segment header and frame, checkpoint words
checked against authenticated history, native witness batching, sealed finalized
receipts, explicit proof/component counts and updated SDK fixtures. Stock uses a
separate native computation path. The first-release migration will replace the
Street format; callers will not select verifier code, segment width or a fallback
protocol.

The kernel's checkpoint is a bound public claim. Accepted-history and finalized
record adapters must establish its authority. Integer extraction, complete
soundness of at least 128 bits, full-duration proving and verification resources,
supported hardware parity, funded settlement, four-validator operation and live
deployment remain open requirements. Generic game ISIs remain the accepted
architecture. No new race-specific instruction or live stake is enabled here.

See the [September research briefing](research/september-2026-briefing.md) for the
primary-source motivation and alternative accumulation/commitment experiments.
