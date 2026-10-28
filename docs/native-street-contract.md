# Shared native Street contract

The September 8 integration candidate puts the Street scalar contract in
`iroha_data_model::street_v1` and native representation/commitment operations in
`iroha_core::execution_proofs::street_v1`. Work is isolated in
`/Users/takemiyamakoto/dev/iroha-sora-cars-native` at baseline
`c000f91384ff1b1d82a3c9e5c3b10f30139763e4`. The maintained `optimizations`
checkout remains held for coordinated integration. This is not a deployed
Street profile or a live settlement path.

The [portable generated Rust copy](../world/native/generated/street_layout_v1.rs)
is checked byte for byte against the explicitly selected native source. Its
[provenance](../world/native/generated/street_layout_v1.provenance.json) records
the logical source key and SHA-256. Browser field metadata is generated from
that source; motion and boundary graph builders reuse its bounds and starting
grid. The website does not include a developer's physical checkout path.

There is one scalar format: canonical Goldilocks words encoding bounded signed
integers. State has `3 + 11 × roster` words, and the complete terminal boundary
has `5 + 13 × roster` words. Inputs contain six literal bytes with only the six
defined control bits. Representation checks reject impossible field ranges,
malformed finish fractions, incoherent terminal flags and incorrect ranking
projections. They do not prove motion or authorize removals.

Raw S0 and a removal-adjusted B0 are intentionally distinct. Native genesis
validation requires the exact starting grid, while general state validation
can represent an adjusted boundary. State commitments retain the existing
network/session/profile/relation binding and exact canonical word bytes.

The native input-prefix grammar has a new execution domain, with no laboratory
fallback. It commits the logical tick, six-tick batch size and length-framed
canonical transcript, including the whole partly consumed batch and removals
strictly before the checkpoint tick. All supplied suffixes are checked before
prefix selection. This is a versioned protocol change, so old proof reports
are historical evidence and are not relabeled as current native proofs.

The generic lifecycle now asks its closed compiled adapter to construct both
initial checkpoint commitments from the ledger-owned context. The registry
still has no Street adapter. A funding qualification flag would not prevent
free-session dispatch and cannot stand in for the missing complete verifier.

Native game handlers now reject nonterminal checkpoints at the tick cap and
forced rounds that would start at or extend beyond it. A terminal checkpoint
between batch boundaries remains valid. The final complete forced batch can
end exactly at the cap while retaining its older certified checkpoint. Fallible
batch preflight occurs before changing even the caller's local session.

## Reproduction and evidence

Select the source explicitly when checking or generating the shared layout:

```sh
node scripts/generate-street-layout.mjs --check \
  --iroha-root /Users/takemiyamakoto/dev/iroha-sora-cars-native
```

Graph generation takes a fresh `--output` directory under `output/` and the
same source through `SORA_CARS_IROHA_ROOT`. Existing reports are never
overwritten. The initial extraction report is
`output/qualification/street-layout-generation-attempt-1/report.json`.
It records generation and source identity, not a native Core build.

The [completed fresh report](../output/qualification/native-street-contract-attempt-5/report.json)
has SHA-256 `6251304d7c3c78e3b18850640a78b1812f0dfa484ec77acfb6244befd298917e`.
All 18 recorded commands pass: the actual Core library build, two standalone
comparators linked against its exact emitted libraries, one Core test build,
and the focused test groups and provenance checks. The test build took 341.64
seconds on this host. The earlier non-test compile took 120.11 seconds in
attempt 3; attempt 5 reuses the unchanged result through Cargo. These are build
observations, not proving benchmarks.

| Native group | Passing tests |
| --- | ---: |
| Street scalar, state, prefix, outcome and codec contract | 12 |
| Compiled registry and contextual initial checkpoint | 3 |
| Generic game lifecycle, custody and cap regressions | 42 |
| Actual native Start capture, retention and orderly reopen | 6 |
| Total on one current native test executable | 63 |

The native test executable has SHA-256
`ae0c973c92fc99a0d0505f4a36dd37b6be454a0f3fe78e52d93f9bb03f7a0c3f`.
The runner records 48 monitored source/configuration files, 21 retained inputs,
860 Cargo-emitted library artifacts and exact HEAD/branch identity before and
after. There is no source or artifact drift. This is a bounded inventory, not
a complete operating-system/compiler/dependency-source attestation.

All **73** reference/current output files match byte for byte. They cover the
motion and boundary graphs for every roster size from two to eight, genesis,
canonical state roots, full terminal outcomes and the new prefix vectors.
The 8,462-tick drive compares all 244 output words per tick, checks every carried
state against native representation rules and reaches a finish for all eight
cars. It contains 472 ticks with car contacts, 3,733 with wall contacts, 439 with
oil effects, one with a prop hit and 4,091 with boost. It contains **no drift
inputs and no removals**. The terminal fixtures separately exercise technical
wins, all-forfeit refunds, exact finish ties and timeouts; their constructed
states do not claim a complete reachable race history.

The old and new graph consumers use the same newly built native libraries.
State/outcome comparisons retain the old laboratory's exact codec bodies only
for newly validated representations. Both prefix arms use the new native
grammar: there is no old-prefix equality or signature migration claim. Earlier
proof files are not reused as proof of this integration.

The separate [JavaScript unit receipt](../output/qualification/native-street-contract-static-attempt-1/browser-unit-tests.json)
records 16 passing existing synthetic host/session and graph tests with nine
unchanged monitored inputs. The [native retirement guard](../output/qualification/native-street-contract-static-attempt-1/report.json)
also passes. These are not UI captures or additional full-race qualification.

Attempts 1–4 remain preserved with their actual failures: fixed-size type
linting, a Norito tuple ownership mismatch, standalone dependency search paths
and non-UTF-8 bytes in Apple linker-map symbols. None is relabeled as a passing
run. The final native build retains the three pre-existing unused retained-reader
warning groups because shipping export/query consumers remain unwired.

The four historical contract/comparison runners and their exclusive fixtures have
been retired. Their retained reports remain migration records; current Native
validation does not load the old replay, reference report, extracted legacy
implementation, or per-component proof format.

Run the current tests from the selected Iroha worktree, using its existing warm
Cargo target. The first group checks native state, controls and terminal outcomes;
the next groups cover owned compiler identities, accepted inputs, and the two
selected digest framing call sites:

```sh
cargo iroha-fast -- test -p iroha_core --lib execution_proofs::street_v1::tests::
cargo iroha-fast -- test -p iroha_core --lib execution_proofs::street_v1::compiler::tests::
cargo iroha-fast -- test -p iroha_core --lib execution_proofs::guarded::accepted_history_tests::
cargo iroha-fast -- test -p iroha_core --lib execution_proofs::guarded::digest_frame_tests::
```

The current segmented proof and public bundle checks are described in
[native public game bundles](native-public-game-bundles.md). Running these
focused tests does not establish a full-race performance or deployment result.

## Remaining integration at the time of this record

The compiled profile family must derive exact track and final-roster instances;
Open precedes the final roster. The complete verifier, authenticated salted
input history and legal boundary transitions remain to be wired into generic
settlement. Browser practice still executes the motion graph without the
native removal boundary. The current laboratory's short eight-car proof is
larger than the native envelope budget; changing a limit is not resource
qualification. Full races, composed 128-bit security, four validators, wallet
and custody interoperability, and Taira/SoraFS activation remain open.

See [native execution retention](native-execution-retention.md) for the separate
producer-to-storage work and [the research briefing](research/september-2026-briefing.md)
for the cryptographic experiments motivating this integration.
