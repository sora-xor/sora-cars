**September 8, 2026: proof composition and ledger authentication**

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


The [September survey](crypto-2026-september-update.md) and
[adoption decisions](crypto-2026-adoption-decisions.md) remain dated research
records. This follow-up clarifies the security reductions and the next native
implementation boundary. The two accepted-history bridge findings recorded in
the earlier adoption document have since been implemented and tested; see the
[current native bridge evidence](../../world/native/NATIVE_ACCEPTED_HISTORY.md)
and [custody/cap follow-up](../../world/native/NATIVE_ACCEPTED_HISTORY_CUSTODY.md).
The latest [origin-bound qualification](../../world/native/NATIVE_FINALIZED_HISTORY.md)
also connects the selected certified batch record to fresh computation proofs:
65 selected native tests, six Street CLI cases and seven extra tampering checks
passed their expected outcomes. Its ledger execution data is synthetic. Native
producer interoperability, legal historical transitions, settlement and the
composed security target remain open.

**What the newer security results require**

The June 2 revision of *On the Fiat–Shamir Security of Succinct Arguments from
Functional Commitments* is a major revision of the CRYPTO 2026 publication.
Theorem 7.1 accounts for the functional IOP's state-restoration error, each query
class's state-restoration function-binding error, and an additional query-class
tail error. The reduction increases adversary/extractor budgets using the
sampling parameter and round counts. For general linear queries, Lemma 5.5
gives tail error at most `ℓ/N` and solving time at most `n·ℓ²`. These terms precede
the subsequent Fiat–Shamir composition; the theorem is not a concrete security
certificate for our WHIR instance. [Primary revised paper, §§5.2 and 7](https://eprint.iacr.org/2025/902.pdf),
[version record](https://eprint.iacr.org/2025/902).

The generated-statement Fiat–Shamir preprint, received August 31 and approved
September 1, binds the generated statement encoding together with the first
prover message when deriving the first challenge. Its reduction still assumes
the underlying non-generated protocol is secure. Our implementation implication
is to bind the actual emitted relation and expected public statement; a compiler
identifier alone does not establish this property. This conclusion is scoped to
the construction and security model studied in the paper. [Primary preprint, §5](https://eprint.iacr.org/2026/1838.pdf),
[status record](https://eprint.iacr.org/2026/1838).

FACS's May 20 revision matches its CRYPTO 2026 publication. Its constant-in-circuit-size
oracle-query bound per accumulation update must be assessed with its code
assumptions, reductions and final decision procedure. WARP's June 18 manuscript
is a major revision of its TCC 2025 publication; its ROM construction uses
erasure-correction extraction and a sufficiently large field. Its final decider
receives the accumulator's witness part. These are candidates for a complete
ordered history experiment, not shortcuts around a missing state-authentication
relation. [FACS published source](https://link.springer.com/chapter/10.1007/978-3-032-35424-2_19),
[WARP primary paper](https://eprint.iacr.org/2025/753.pdf).

These are literature findings and implementation inferences. We have not
reproduced these theorems or external benchmarks. No parameters or dependencies
change on their authority alone.

**The concrete ledger gap**

Read-only inspection of maintained native Iroha found that the CommitQC's
`post_state_root` commits the execution's witnessed writes, or witnessed reads
when no writes exist. It is not a commitment to every world-state record.
The ordinary witness namespace currently has no game-session record key.
The two ledger state finality endpoints return the signed root and certificate
carrier, without a game-session membership opening.

The native merge write-set commitment does include changed `game_sessions`
keys and complete records. It hashes a complete ordered delta rather than a
Merkle tree of individually openable records. Further source review found an
important enforcement step: autonomous carriers must be merge-only, and the
entire marker-inclusive overlay is rechecked against the certified batch before
voting. Arbitrary ordinary writes cannot subsequently overwrite a session before
that vote without causing rejection. Post-finality metadata changes have a
separate private native authorization; a final delta also does not expose every
intermediate revision. A consumer should therefore name the certified batch
revision explicitly and avoid inferring latest-state or pre-settlement freshness
from an arbitrary record beside a valid certificate.

The native implementation paths are
`iroha_core/src/sumeragi/smt.rs`,
`iroha_data_model/src/execution_witness.rs`,
`iroha_core/src/smartcontracts/isi/game.rs::save`,
`iroha_core/src/state.rs::merge_execution_write_set_bytes` and
`iroha_torii/src/ledger_state_finality.rs`. These are source findings, not an
attack demonstration against a deployed network.

The new [finalized-entry component](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/finalized_entry.rs) has
one narrow responsibility: from independently pinned network, context, heights,
block and entry identities, verify native certificates, exact executed block
bytes, entry/result inclusion and successful external execution. Its receipt
has private fields and cannot be created by decoding an endpoint response.
It carries no separately supplied game snapshot and grants no removal authority.

The next native state bridge must authenticate the precise selected state
point. A candidate ordinary-execution design uses rollback-safe, native-produced
session transition receipts under the existing witnessed-write commitment,
binding execution position, revisions and full before/after record hashes.
A complete merge-delta opening can be used where its exact execution phase is
the desired selection point. Neither design should introduce a fictitious
global state root or accept caller-authored transition records. End-of-block
freshness and before/after settlement association need explicit proofs.

The subsequent [native merge-record adapter](../../world/native/NATIVE_FINALIZED_MERGE.md)
implements the bounded complete-delta path with an explicit certified-batch state
point. It authenticates the sidecar through the same pinned global finality
stream and takes the delta root only from a sealed capability. Its local tests
use synthetic merge execution data; native delta export/retention and a genuine
producer-to-verifier run remain unqualified. The subsequent
[finalized-history component](../../world/native/NATIVE_FINALIZED_HISTORY.md)
joins it to the accepted-computation verifier and binds the stable certified
state origin inside the execution proof. Initial trust checkpoints stay in the
finality/association receipt, allowing the same computation proof to be checked
through different valid authentication paths to the same target state.

Required adversarial cases include a valid finalized entry paired with a
different valid session snapshot, stale same-block revisions, omitted later
updates, merge-state relabeling, committee substitution and swapped pre/post
settlement records. A valid computation and a valid finality certificate only
compose after the relation between their statements has also been proved.
