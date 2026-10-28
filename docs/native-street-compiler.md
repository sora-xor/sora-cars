# Native Street compiler and complete admission

The isolated Iroha worktree now owns the Street arithmetic compiler and reusable
guarded-proof modules. `compile_street_instance_v1` builds the actual operand
programs for a closed track and an immutable 2–8-player admission. This is a
compiler integration, not a registered Street execution profile or a qualified
settlement path. The generic game ISIs remain the application boundary.

## Current ownership

`iroha_core/src/execution_proofs/arithmetic` owns checked scalar constraints,
fixed ROM, staging and the complete operand representation. `guarded` owns the
multilinear, commitment, opening, membership, ordered-sequence and accepted-input
machinery. These are native Rust modules using the existing Core cryptographic
primitives. They have no runtime dependency on the sibling laboratory, retained
test harnesses, JavaScript or uploaded verifier code. The original protocol
domains and arithmetic equations remain unchanged by the ownership move.

`street_v1/compiler` owns eleven graph/lowering modules and the new factory.
Its output includes the complete boundary and motion operand descriptors,
their ordered input maps, motion-state carry indices, raw starting state,
transition policy and native codec identity. The instance relation hashes that
complete association. It is not a hash of a track name or a claimed outcome.

`StreetParametersV1` is a closed Norito/JSON model with a `Tokyo1986` track
variant. The stock factory validates canonical admission before graph
construction, permits only rosters 2–8 and one cosmetic byte in 0–5, and rejects
returnable equipment. Canonical NFT wagers remain part of the admission
commitment; they do not select physics. Cosmetic choices leave the stock computation
unchanged, but wallet identities, gameplay keys, cosmetics and item terms must
still be bound by the execution statement and ledger admission.

The offline generator reads the current Tokyo track/object authoring and emits
the frozen native integer table: 1,404 road rows, 13 gates, 27 ordered milestones,
12 objects and oil bits 1, 3, 6 and 9. Its provenance records the exact generator,
compiler and authoring inputs. Runtime compilation reads the native catalog.
Historical geographic alignment is not established by table regeneration.

```sh
node --import tsx scripts/generate-native-street-track.ts --check \
  --iroha-root /Users/takemiyamakoto/dev/iroha-sora-cars-native
```

The existing Tokyo laboratory rules cap this instance at 9,000 ticks and two
laps. This does not silently qualify a change to the original 180-second race
requirement. Track-specific song-length rules, production gameplay integration
and their final release limits still need explicit qualification.

## Admission integration

`GameStartContextV1` now receives the complete `GameAdmissionBodyV1` instead of
only a participant count. Start passes the same validated body used by the
roster commitment. The closed registry checks manifest limits, each participant
and exact typed resource clauses before deriving the initial checkpoint.

At settlement, statement validation returns that exact immutable admission to
the registry. Original accounts, input keys and application data are checked
against the separately retained runtime participants; DNF does not mutate the
original admission. This strengthens the existing Race adapter. It does not
add Street to the registry or authenticate unimplemented equipment catalogs.

## Validation

The first native check failed on two workspace lints: an uneven enum payload
and a missing `Copy` derive. Its immutable
[failure report](../output/qualification/native-street-compiler-attempt-1/report.json)
records exit 101, 422 warnings and no drift among the 75 monitored sources.

The enum now stores its range width as `usize`, like the ROM table identifier.
Widths are still admitted only in 1–16; the descriptor uses the same checked
eight-byte ordinal. Actual type-size accounting remains in place. A new test
checks every admitted width's literal namespace framing. Two ownership-only
warnings were corrected without suppressions. The compiler error derives Copy.

The fresh [instance-parity run](../output/qualification/native-street-instance-parity-attempt-1/report.json)
passes its current Core production build and all seven roster comparisons. The
report SHA-256 is `4a6786b6e65fee4a46d389f2a380966382a347f9c5409f8ffbf5213d60fbc37a`.
It records 121 source pins, four retained scaffolding inputs and 18 command
receipts. The production build retains 420 warnings, chiefly uncalled private
proof APIs; this is not a strict Clippy pass.

The comparison runner links exact libraries emitted by current Cargo. Its
laboratory side calls the unchanged current constructor, compares all boundary
and motion descriptor bytes, and independently encodes the relation association.
Native and laboratory raw genesis and every stored layout field match. All
seven instance IDs are distinct under one compiler-family ID. The eight-player
case compares 4,955,437 boundary bytes and 163,365,493 motion bytes; descriptor
lengths are not proof sizes. Its complete comparison process took 10.674 seconds
with 669,761,536-byte peak RSS. This includes both compilers and file comparisons,
not a native-only compiler benchmark or proof performance measurement.

The independent [retained-evidence audit](../output/qualification/native-street-instance-parity-attempt-1/audit.json)
also passes. It checks 253 retained artifact hashes, 126 snapshots, 121 current
monitored sources, all 18 command receipts and 28 complete byte pairs. It
independently decodes every binding and reconstructs the literal starting grid.
The audit SHA-256 is `7eba8ffef1d3896ea1a2c794ac6e4335ee837c6a59de86ae4467347c6fd990c6`.
Its Cargo-library checks concern the exact recorded declarations and link map;
it does not rehash replaceable warm-target libraries during the next build.

The [focused native unit run](../output/qualification/native-street-compiler-units-attempt-2/report.json)
passes **235 tests**, with none ignored: arithmetic 81, guarded proofs 39, Street
65, registry 5, generic game lifecycle 44 and the model parameter codec 1. Its
report SHA-256 is `6df1a2010de59242dd23abf39cd1b756abff3c885c0eaf5acbe9ff82bc8eb515`.
Both executables come from exact current Cargo test-artifact records. The
source-declared test inventory must equal the selected native listing, and
every listed name must pass. Codec retirement, track regeneration and generated
layout checks also pass. This includes small proofs inside individual tests;
it is not a complete native Street proof-verifier qualification.

The first unit runner stopped before Cargo because its inventory erroneously
required a `game/` directory; the native implementation is `game.rs` with two
sibling modules. No unit tests ran in that attempt. Its failed evidence remains
unchanged; the corrected runner checks the actual source paths.

A subsequent scoped formatter check requested only moving `mod guarded;` into
alphabetical order in the parent module. The exact before/after files are saved
separately; all compiler, arithmetic, guarded, registry, game and model bodies
remain byte-identical to the passing test candidate. The new 37-file formatting
check and [post-format Core check](../output/qualification/native-street-compiler-format-attempt-2/report.json)
both pass. That report has SHA-256
`a1fd7594fc458c9bd44cb88d83789c7e586f60506122b7c721958ab577f92f49`.
Test and comparison snapshots are not relabeled as a post-format binary build.

The independent [native unit evidence audit](../output/qualification/native-street-compiler-units-attempt-2/audit.json)
passes with SHA-256 `04f69eafd1f85b5dd67ff588e88dde1402c1e2e6b2b38ee10d28711e66d0141f`.
It checks all 235 distinct test names against source declarations, native lists
and passing logs, plus both retained test binaries, 22 command receipts and all
155 retained artifacts. It records the sole subsequent module-order change;
replaceable warm-target libraries are checked through emitted declarations,
not freshly rehashed during another build.

## Remaining integration and release gates

The compiler-family ID is independent of the final roster. A complete admitted
profile must additionally bind the proof protocol, verifier implementation,
parameters and limits. The registry currently contains only the existing Race
adapter. No caller can register Street merely by providing its compiler ID.

The subsequent [owned-sequence and accepted-history adapter](native-street-owned-sequence.md)
retains typed maps, carry and policy and moves the programs into the shared
guarded constructor. It does not reconstruct executable wiring from descriptor
bytes. Borrowed and owned sources share shape, selector, canonical-field and
memory-admission checks, including the complete unused motion source at zero
motion. Its separate qualification record distinguishes this later source
candidate from the initial compiler comparisons above.

The existing history registry's selected arguments also omit parts of the full
ledger session required by accepted-history verification. Native Street needs
a borrowed ledger-owned context, the exact selected state point, the complete
session and immutable admission, pending/current inputs, authenticated removals
and exact transcript evidence. Hash equality alone is not ledger authority.

Transport is a separate blocker. The prior accepted-contract lane produced a
6,652,185-byte two-car proof for only six motion ticks, already above the native
4,194,304-byte envelope ceiling before metadata. The current linear B/M proof
transport needs compact aggregation with a complete final decision procedure,
or a separately justified system-wide capacity redesign. A larger local parser
limit would not qualify full-race settlement. See the
[accepted-contract measurements](native-street-accepted-contract.md).

Compilation has bounded catalog shapes and downstream stage/program limits;
these are not a combined measured RSS ceiling. Full-duration proving resources,
supported-target/accelerator parity, complete 128-bit soundness accounting,
real four-validator settlement and independent finality remain open. Live XOR
and NFT stakes, maintained-branch rollout and SoraFS publication are unchanged.
