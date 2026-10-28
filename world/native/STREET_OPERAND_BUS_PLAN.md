# Street operand bus: bounded next prototype

September 8, 2026. **Prototype an immutable, compiler-addressed scalar-value bus and measure its complete cost before selecting a replacement proof layout.** This document proposes a native component; no operand-bus proof, production backend, security target, or speedup is established here. Current scalar/ROM/proof sources and frozen reports remain unchanged.

## Evidence and immediate objective

The [detached-ROM report](../../output/qualification/street-detached-rom/report.json), SHA256 `2441e9fe96b88402eee54afb2801d149200de45f484a8a59cf11c75a1aa344e5`, verifies complete two/eight-car native parity and retained scalar, range and ROM obligations. It removes 883,640 quadratic terms from eight-car circuits, but eight-car/8-bit bank64 remains 4,368 × 467 cells per tick; bank16,384 remains 18 × 22,292. Some bank boundaries increase width despite removing work. Thus local operand storage merits a measured prototype.

The following counts are from the frozen **post-singleton-substitution** relation, independent of the two measured bank sizes. `L`, `Q` and `E` count retained linear terms, quadratic terms and original polynomial slots. Repeated operands remain repeated occurrences.

| Cars | Limbs | Nonfixed source values | L | Q | E | Arithmetic reads L+2Q | Serial term rows L+Q+2E |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | 8 | 24,406 | 41,603 | 23,332 | 20,394 | 88,267 | 105,723 |
| 2 | 12 | 20,646 | 37,701 | 20,318 | 20,394 | 78,337 | 98,807 |
| 2 | 16 | 17,285 | 33,840 | 17,740 | 20,394 | 69,320 | 92,368 |
| 8 | 8 | 340,566 | 568,240 | 454,949 | 279,530 | 1,478,138 | 1,582,249 |
| 8 | 12 | 283,571 | 510,695 | 378,525 | 279,530 | 1,267,745 | 1,448,280 |
| 8 | 16 | 247,648 | 472,388 | 336,227 | 279,530 | 1,144,842 | 1,367,675 |

The last column describes one explicit comparison design: one row per term, plus separate start/end rows per polynomial. It excludes value-table, range, ROM, public-boundary and bus-proof rows, and does not describe an implemented layout. Eight-car/8-bit additionally has 219,236 range occurrences, 640 ROM tuples and 351 input/output pin occurrences per tick. Some are fixed and require no dynamic operand read; the exact split must be counted. The two/eight-car scalar programs also retain 580/2,313 fixed source cells. Their original singleton equations and any contradictions survive substitution.

The objective is to eliminate dependence of **gate witness width** on the lifetime of every original wire. This trades dense carries for authenticated reads, value-table rows and proof auxiliaries. It does not eliminate those costs. A monolithic 9,000-tick serialization is not the first prototype: the serial arithmetic rows alone would already exceed Goldilocks' two-adic domain after a 16× LDE. Sharding and an authenticated connection between shards require explicit design, not omitted rows.

## Immutable compiler boundary

Start with an owned native `OperandProgram` constructed from the existing immutable staged AIR export and outer binding export, without calling witness generation. These are proposed API names, not existing APIs. Never accept a prover-uploaded instruction list, address map, multiplicity table, polynomial list, source hint or declared-range replacement.

The first prototype translates every original post-substitution polynomial back to stable original wire identities. Resolve each stage-local column through its unique compiler-owned placement at that stage. A column reused later is a different original wire. Preserve the exact canonical coefficients, constants, original equation IDs/order, all identities and all contradictory constant residuals. Preserve every ordered range and ROM occurrence, including fixed bindings, duplicated columns and aliases. The compiler must check counts and references before allocation, reject ambiguous/missing placements and checked-size overflow, and freeze the detached result.

The current stage carries represent repeated use of the same original wire. In the new representation, those uses authenticate to its single immutable table row instead of carrying a column across many stages. Current unused stage cells have no counterpart; the new layout has its own complete zero-padding rules. This is an explicit representation-equivalence obligation, not permission to remove source equations, active branches, narrowed ranges or assertions disconnected from outputs. Outer state/action/final equalities remain separate semantic predicates and must be translated in full.

Freeze a descriptor containing the source relation/profile version, constant substitution map and original slots, complete table/lookup data, equation-to-gate DAG, wire/address map, exact ordered consumers, row roles and selectors, multiplicities, public port occurrences, tick/shard scope and hard resource bounds. Commit this descriptor in the execution proof transcript. Unsupported operations or missing obligations reject compilation; they never become host-checked exceptions.

## Value table, addresses and consumers

Assign exactly one mandatory value-table row to each nonfixed original scalar wire **per execution tick**. These are canonical Goldilocks field values, including negative integers in their canonical field encoding and auxiliary/inverse/slack cells. No new integer range is inferred from address-table placement. The original retained constraints continue to establish all required signed ranges and arithmetic properties. Source-only or unused rows still retain their original defining gate, range or initial/public binding; canonicality and table presence cannot substitute for those predicates.

Use a compiler-fixed checked enumeration of `(execution scope, shard interval, absolute tick, source wire ID)` to field addresses. For a single fixed scope, a simple allocation is `address = tick_offset * wire_stride + wire_ordinal`, computed as a bounded unsigned integer and required to be less than `p`. Different scopes either have distinct compiled bus relations/transcript domains or disjoint, proved address ranges; no modulo wrap or unchecked truncation is allowed. A process-local Circuit owner token is only for construction authentication, not the persistent wire identity. If a later design introduces intermediate table values, reserve a distinct namespace and remeasure the stride.

The canonical table layout fixes address, row count and row position. There is no prover-selected address column, row permutation, omission, duplicate address or dynamic RAM write history. The table **values** are witness data committed before the bus challenge. Each table and read-lane address coordinate must equal its compiler-selected identity through fixed coefficients or explicit retained equations; an unconstrained address column cannot redirect a read. All table rows remain present, even if a compiler-computed multiplicity is zero. Fixed scalar values may use direct canonical constants instead of table reads, but raw full-witness conversion must still reject altered eliminated fixed cells and retain all original contradictory residuals.

Every consumer carries a fixed address or a direct fixed constant. Consumers include both operands of every quadratic term (including repeated operands), each linear term, every nonfixed range argument, both nonfixed components of every ROM tuple, and every translated public/state/final equality. Index and value reads of a ROM tuple must feed that exact same ROM event and table ID. They cannot be authenticated independently and then replaced before the ROM equation. Direct fixed operands have separate fixed gate constraints; an inactive slot cannot become a fixed-value exception chosen by the prover.

Compute the multiplicity `mu[address]` from this complete eager occurrence list. It is an immutable nonnegative integer, less than `p`, whose sum is the exact count of enabled dynamic read occurrences, also less than `p`. It must include consumers in branches whose chosen result is inactive: their scalar equations still exist. Keep duplicated public/output aliases as separate equality occurrences. No variable multiplicity advice is needed for this first fixed-access prototype. If a later optimization makes counts witness-dependent, their complete bounds and exact event accounting would be a new proof obligation, with their commitment still preceding the challenge.

## Local polynomial DAG and padding

Translate each retained polynomial exactly:

`constant + sum_i a_i V_i + sum_j b_j V_left(j) V_right(j) = 0`.

A bounded reference layout uses fixed start, term and end rows. The start fixes an accumulator to the original constant. A linear row enforces `acc_next = acc + a*read0`; a quadratic row enforces `acc_next = acc + b*read0*read1`. The end requires zero. Original term order is deterministic. Every term's read values are attached to that row's immutable bus addresses; adjacent accumulator transitions cannot be spliced, skipped or reset. Zero-term equations still retain a constant-residual check, so `1=0` never disappears. The original polynomial slot-to-DAG map stays auditable.

Compare this simple layout with fixed bundles of several independent gate lanes and a balanced fixed addition/multiplication DAG. A balanced DAG needs authenticated intermediate values or proven local scheduling; it cannot read an unconstrained accumulator from another lane. Lane counts and gate arrangements are compiler-selected, never proof-selected. Do not choose a bundle size or backend from source-term counts alone.

Each range event preserves its exact bit width and membership. Each ROM event preserves the complete compiler-selected column, exact index/value association and retained index/output ranges. They can use dedicated local rows whose operand copies participate in the same bus. Range and ROM membership proofs are still required in addition to authenticating the operand copies.

Specify every cell of every row class: table value, gate input, accumulator, range/ROM event, public-boundary row, and inactive/global padding. Fixed selectors are a disjoint, complete row partition. Inactive operand/value/accumulator cells are zero; inverse cells are zero when their event is disabled; local accumulator boundaries are explicit. Domain padding is not an extra scalar value, read event, table entry or ROM row. It has zero multiplicity and zero contribution while the sum accumulator follows its specified cyclic/terminal rule. All row counts, widths and canonical field encodings are checked before allocations.

## Proposed authenticated fixed-read bus

At a trace-domain row, encode a tuple as `key = K([value,address,0,0]) = value + u*address`, using the native fixed Fp4 basis. This is injective for two canonical F coordinates; it is not random tuple compression. Values must be committed as native base-field coordinates and addresses must be fixed compiler polynomials. Do not accept arbitrary K advice as a tuple or use mutable bounds to assert coordinate membership.

For off-domain AIR evaluation use the actual polynomial `V(X) + u*A(X)`. Its evaluation can have four nonzero Fp4 coordinates when X is in Fp4. Re-encoding its coordinate projections as though the off-domain values were still base-field scalars would change the polynomial and is invalid.

Commit all value-table values and all local read-copy values before deriving `beta`; the fixed addresses and multiplicities are already descriptor-bound. Draw `beta` outside `span_F{1,u}`, requiring coefficient two or three to be nonzero. The present range/ROM predicate `beta outside F` is **insufficient** for this new bus because it allows poles of the form `value + u*address`. Use a separately versioned domain/challenge predicate and explicit rejection sampling. The candidate challenge support has size `p^4-p^2`.

A candidate logarithmic-derivative relation has, for each fixed read lane j and table lane:

- `(beta-key_read_j) * inverse_read_j = selector_read_j`;
- `(beta-key_table) * inverse_table = selector_table`;
- `A_next-A = sum_j inverse_read_j - mu * inverse_table`, with accumulator origin fixed to zero and a complete cyclic/terminal sum condition.

Disabled inverse and payload zeros are explicit. Table rows have unique fixed addresses; multiplicities are their exact fixed read counts. Multiple tables/lanes/shards must preserve namespaces and counts rather than pooling coincident addresses. If the lanes use different domains, a separate cross-domain argument is needed; the first prototype must not silently borrow a same-domain identity.

For fixed committed canonical table/read tuples and a false multiset equality, the difference of these reciprocal sums is a nonzero rational function. After collecting equal keys, coefficient differences are integers of magnitude less than `p`, so they cannot vanish solely by reduction modulo p. If there are d distinct poles, the numerator has degree at most d-1. Conditional on a uniform challenge outside the plane, this gives the candidate collision bound `(d-1)/(p^4-p^2)`; every permitted challenge avoids all trace-domain poles. This bound requires the actual static-count/uniqueness/canonical-tuple assumptions above. It does **not** include commitment binding, Fiat–Shamir adaptivity/grinding, low-degree failure, OODS, composition batching, FRI, multiple buses/challenges or shard union bounds. Those must be derived jointly for the final profile. This document makes no 128-bit claim.

Degree accounting must follow the actual compiled univariate polynomials. With trace columns of degree at most n-1, a bus inverse identity has degree at most 2n-2; a fixed multiplicity times a table inverse also reaches 2n-2. A quadratic arithmetic term times one compiled fixed coefficient/selector polynomial reaches 3n-3. Avoid accidentally multiplying separate selector and coefficient interpolants when one precompiled polynomial suffices. Additional gate selection, zero constraints, range/ROM arguments, quotient splitting and the chosen layout can change the final maximum. Do not retain the current quotient bounds or PCS profile merely because the scalar gates are degree two in witness cells.

## Next bounded work and acceptance

1. Build a std-only owned program compiler and raw checker in a new qualification lane. Start with a small mixed relation covering signed arithmetic, comparisons, division, exact ranges, variable-arity sums, constants/contradictions, ROM reads and duplicate ports. Accept only immutable native exports. Keep witness generation separate; raw verification reads only compiled records and supplied canonical cells. Compare every source predicate, full raw witness, public binding and ordered occurrence against the existing scalar reference.
2. Run the compiler/census over all six complete 2/8-car × 8/12/16-bit detached relations without allocating a whole-race trace. Record source/descriptor hashes, values and fixed cells, each consumer kind and repeated address, exact multiplicity histogram/sum, active and padded rows, gate-bank/arity distributions, public/state equality counts, and every remaining range/ROM table and occurrence. Compare serial rows, a small fixed set of lane bundles and a bounded local-DAG schedule. The reference table above is a consistency check, not the final census.
3. For each measured candidate, account separately for native-F/base and Fp4 auxiliary columns, inverse and accumulator lanes, fixed selector tables, actual maximum degrees, table-domain minimum, LDE sizes, row-hash word limits, opening bytes, terminal/FRI work, peak buffers and total bytes. Reject native domains beyond `2^32`; show short-shard and 5,400/9,000-tick projections with their authenticated boundary cost. Measure only bounded honest/adversarial streams first. Do not fabricate proving time from operation counts or assume fewer raw cells means a cheaper 16-bit lookup proof.
4. Only after this census selects a justified bounded candidate, implement its separately versioned native authenticated bus using the frozen native field/hash/transcript/PCS substrate. Commit profile, accepted public tape/history, fixed shard/tick namespace and both table/read values before beta; commit auxiliary inverses/sums before composition batching. Add an actual verifier-level malformed-proof suite, not just honest prover failures.

Required attacks include changed table values with coherently regenerated reads; one wrong read with coherent arithmetic; swapping same-valued addresses; tick/shard/circuit address reuse; omitted/duplicated table rows or consumers; false multiplicities; modulo-p count/address aliases; beta inside the forbidden plane; unconstrained upper tuple coordinates; wrong range width/ROM table/index; changing a copied operand after bus admission; dropping a disconnected assertion; accumulator resets or spliced lanes; contradictory constant equations; altered fixed raw cells; public-action replacement; stale state or output aliases; and nonzero gate/table/global padding. Raw and authenticated tests must distinguish which exact obligation rejects each coherent adversary.

A short-prefix bus proof still lacks first-terminal enforcement, accepted-input/dispute history authentication, full-race state chaining and ledger settlement unless those relations are explicitly included. At shard boundaries, serialize input/output equality events without forcing every port into one simultaneous gate row; bind them to the previous authenticated shard output or pinned public initial state. Pin absolute tick intervals and complete action tapes, and reject omitted/reordered shards. Never treat a prover-provided intermediate state as an independently trusted boundary.

The implementation decision is therefore **a bounded exact operand-bus compiler, adversarial raw checker and complete cost census next**. The authenticated bus and final layout choice follow evidence from that prototype; they are not prerequisites assumed to be solved by this plan.
