# Native commitments for checked Street rows

> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


September 7, 2026. This experiment connects the exact native Street scalar
relation to Iroha's existing execution-domain Poseidon2 and streaming Merkle
commitments. It checks actual two- and eight-car data, replayed roots, independent
opening verification, and malformed bundles. It is not an execution proof.

The [evidence manifest](../../artifacts/street-commitments.json) identifies the
frozen sources and exact outputs. Later changes to the working tree do not extend
these measurements to those changes.

## Data and native boundary

The producer uses the [qualified limb relation](LIMB_RANGES.md), with eight-bit
range limbs and 16,384 original polynomial equations per stage. For each roster
it executes three native ticks from the initial state, compares every graph node
with its checked lowering, verifies every polynomial and range membership, and
uses the generic execution-trace verifier to check the public actions, initial
state, cross-tick state continuity and claimed outputs. A second iterator over
the same witness writes the checked stage rows. Only one tick's raw witness is
held at a time.

The action tape is a deterministic public fixture. It has no signatures or
accepted-input certificates. Both examples are unfinished execution prefixes;
they do not demonstrate a finished race or a consensus-authorized result.

The producer writes canonical Goldilocks residues as headerless row-major u64LE
and explicitly appends zero rows to reach the next power of two. A byte-budget
check occurs before output creation. Those zero rows support this Merkle
experiment only: a future AIR must separately constrain active rows, state
boundaries and global padding. No padding or terminal qualification follows
from these file bytes.

The adapter decodes each cell canonically and passes it to the unchanged native
row-leaf function, which uses its own big-endian framed field encoding. The
unchanged streaming accumulator retains one pending subtree per level and the
requested minimal frontier. Its execution profile and leaf/node roles are fixed
diagnostic domains. Details, source pins, dependency provenance and exact CLI
contracts are in the [native reuse review](COMMITMENT_REUSE_REVIEW.md).

Three separate processes commit the whole spool with no openings, replay the
same spool with selected openings, and verify just those opened rows and frontier
against the first process's expected root. The first, last actual, and last
padded row are selected for coverage after the root-only pass. These are fixed
diagnostic queries, not Fiat–Shamir challenges.

## Measured results

All numbers below come from one sequential run on this Mac. Wall times and peak
resident memory are the `/usr/bin/time -l` process measurements. They include
adapter process overhead and file I/O, but exclude scalar trace generation and
the separately compiled dependency closure. They are not full-prover benchmarks.

| Roster | Actual / committed rows | Width | Spool bytes | Root pass | Root peak RSS | Opening verification |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 cars | 6 / 8 | 18,422 | 1,179,008 | 0.04 s | 2,179,072 B | 0.01 s |
| 8 cars | 54 / 64 | 22,349 | 11,442,688 | 0.41 s | 2,441,216 B | 0.02 s |

Replaying the full spool took 0.04 and 0.41 seconds respectively and reproduced
each root exactly. The three openings used four frontier digests for two cars
and twelve for eight cars. Peak RSS during the opening replay was 2,195,456 and
2,523,136 bytes. Peak RSS during separate verification was 2,179,072 and 2,260,992
bytes. The scalar producer reported 16,761 and 305,424 graph-node parity checks,
respectively; its own elapsed times were approximately 27 and 226 milliseconds.

The root-only results, in native 48-byte digest encoding, are:

```text
2 cars
090e088b91ad0acd9e43b6cc3b2d189ada6b41d5db3ecc85936e64ec61fd1cacdc3006af516fb03f89ea11427b4f3447

8 cars
7e240790a900149a96f6ccf4c56c8aa85e4bafbc60e414421a54b67435358d19a4bea7161e565d74a3416c26972c5408
```

Each data set rejects fourteen altered or malformed external bundles: a changed
expected root, changed canonical row, noncanonical cell, truncated row file,
trailing file byte, changed/missing/extra frontier, empty/duplicate/unsorted/
out-of-range indices, wrong width, and wrong tree height. Every rejection exits
normally with status one. The producer spools and frozen source files remain
hash-identical after the experiment. The adapter's separate tests additionally
exercise unchanged Poseidon2 vectors, materialized/row-streamed/column-streamed
parity, domain separation, all-row and singleton openings, and resized wrong
widths; their counts are kept separate in its own report.

In this integration suite, wrong width fails file-length admission and wrong
height fails opening-index admission. They do not independently demonstrate
valid-shape width/height domain separation. Valid but changed opening positions
are not exercised by this suite. An independent read-only review checked 116
source, artifact, framing, padding and root-parity invariants and found no
acceptance defect in the producer or integration scripts.

## Reproduction and evidence boundary

The retained executables can be exercised without a new Iroha or dependency
build. To reproduce the original experiment from its exact matching sources:

Recorded retired invocation:

```text
node --import tsx scripts/export-street-commitment-rows.ts
python3 scripts/native-commitment-adapter.py
node --import tsx scripts/test-street-commitments.ts
```

The exporter requires the source identities of the prior limb experiment to
match; it fails if later native changes are present. It compiles a standalone
Rust 1.94.1 producer from frozen, dependency-free source copies. The adapter
compiles whole, unchanged Iroha modules with retained Rust 1.93.1 and its already
compiled dependency artifacts. It never runs Cargo or rebuilds dependencies.
The maintained Iroha source/index/HEAD and dependency-build hold was respected.
The retained native artifacts, including two C archives, are pinned historical
build inputs. This is not a reproducible build of the whole current Iroha tree.

The three report identities are:

```text
rows/report.json
5b6827c6c8f38dee92655686c5be478050371a81e8202f7490d22da3009a9c71
native-adapter/report.json
831d8e660f3f8838701a507a15e3d7c4bf5ab6d0cae636d299a936e9f7450c05
integration/report.json
de6cd54d33a2013e323c33448c7223bdc4853eb9a70c9cc7780a7eb08ed5e988
```

Paths are under `output/qualification/street-commitments`. Scripts hash the
spools, frozen sources and executables; logs retain exact CLI calls and results.
The composite manifest authenticates this retained local evidence by content
identity only. It is not ledger inclusion evidence or an independent signature.

## What remains before a native execution proof

This demonstrates that existing native hashing accepts the checked rows with
small row-streaming memory. The current eight-car, 9,000-tick schedule still has
162,000 actual rows of width 22,349: 28,964,304,000 raw bytes before power-of-two
padding or LDE. That already exceeds this adapter's explicit eight-GiB
experiment cap. No full-race commitment, proving-time or verification-cost claim
is made from the three-tick measurements. Column LDE transforms, retained
polynomials, lookup auxiliaries and FRI have separate resource costs.

The [lookup protocol candidate](LOOKUP_PROTOCOL_V1.md) specifies commitments to
actual query columns, fixed exact-width tables, multiplicities committed before
the lookup challenge, cyclic reciprocal sums, quotient degree classes, DEEP
bindings and every FRI opening. It is not implemented by this adapter. The next
code boundary is an immutable export of the compiler's exact stage polynomials,
memberships, padding and port mappings, followed by the complete outer AIR.

The [terminal binding review](TERMINAL_BINDING_REVIEW.md) records additional
first-terminal, final-state, signed-history and dispute obligations. A valid
prefix commitment does not satisfy those requirements. At-least-128-bit composed
soundness, CPU/accelerator and target parity, full-race resources, consensus
settlement, finalized inclusion, and live XOR qualification remain open.
