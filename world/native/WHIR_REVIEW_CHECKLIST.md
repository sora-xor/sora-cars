# Native WHIR opening review checklist

> Links to retired laboratory Rust implementations below now open the preserved removal snapshot. Recorded report hashes identify their original experimental revisions; these snapshots are historical source, not operational proof dependencies.


> Historical research record. The frozen laboratory runner chain has been retired. Commands and source hashes below describe that recorded experiment; they are not current qualification instructions. See [current native coverage and remaining checks](../../docs/native-research-retirement.md).


8 September 2026. This records an independent source review and nine passing public-verifier tests for a **new small single-oracle linear-query opening experiment**. No acceptance flaw was found in this scoped pass. This is not an external cryptographic audit and does not qualify the existing pending execution sumcheck objects, a game proof, ledger history, settlement or 128-bit security.

Primary basis: [WHIR, ePrint 2024/1586](https://eprint.iacr.org/2024/1586), inspected revision 21 November 2024, especially Definition 4.14, Claim 4.15, Corollary 4.11, Constructions 5.1/5.5/7.4 and Theorems 5.2/5.6/7.5. The retained PDF is `output/research/sumcheck-openings/whir.pdf`, SHA-256 `ccacc62cf5529ff95c3cf115cf730b020336f8d95c310c8deb64e3beac30ce61`. Pages 32–34 were additionally rendered to inspect ambiguous indices. The existing [opening plan](SUMCHECK_OPENING_PLAN.md) supplies the intended application boundary; this new file does not modify that pinned plan.

## Fixed experiment and notation

Use `F` for Goldilocks, `K` for its native quartic extension, and `q = |K|`. The paper uses `F` for its whole protocol field; here that role is `K`. Evaluation domains can be subsets of the base field while coefficients, challenges, weights and folded values belong to `K`.

The reviewed fixed profile is:

| Quantity | Choice |
| --- | --- |
| Initial Boolean table | Exactly 64 entries, six variables |
| Folding groups | `k = [2, 2, 1]` |
| Committed-oracle variable counts | `[6, 4, 2]` |
| Terminal variable count | `1`, hence exactly two monomial coefficients |
| Committed domain sizes | `[8192, 2048, 512]` |
| New-domain coset shifts | Base-field `7` at each stage |
| Consistency samples | 256 at each of the three predecessor-block checks, with replacement |
| Proximity parameter | `delta = 3/8` |
| Selected list-size bound | `ell = 1`, unique decoding |
| External linear queries | One to three, plus the compiler's initial OOD constraint |
| Initial encoding | Explicitly bound Base or Extension mode; later codewords are Extension |

This profile has no partial-active-input or Boolean-padding claim. The Base/Extension wire distinction must not be described as a proof of a stronger application predicate unless the complete argument actually supplies it.

## Binding and message order

The verifier must derive its expected statement and transcript from fixed inputs, never from a prover-selected replacement of the query weights, dimensions or scope.

1. Bind the protocol/version, field representation, domains and shifts, variable order, fold schedule, exact sample count and replacement rule, terminal degree, oracle roles/encodings, application scope and immutable query identity rules.
2. Bind the original codeword commitment. The Construction 7.4 compiler then samples an initial whole-field OOD point and absorbs its reply **before dependent outer verifier randomness**. An arbitrary root plus a Construction 5.1 proximity transcript does not automatically supply every adaptive PCS-binding property.
3. Absorb the complete query/answer set, including the initial OOD constraint, before the Construction 5.5 batching challenge. The fixed profile rejects zero external queries. The later constraint check must equate the initial OOD's batched answer to the earlier absorbed reply.
4. Conduct the first two internal sumcheck rounds. Each complete round message precedes its challenge.
5. For each of the two shifts: absorb the new codeword root; sample its whole-field OOD point; absorb its OOD reply; sample predecessor-folded-domain query indices and the shift-combination challenge; then conduct the stage's internal sumcheck rounds.
6. Absorb exactly the terminal polynomial before sampling final predecessor-domain queries. Verify every Merkle opening, folded evaluation, round identity and final weighted sum before returning an authenticated opening result.

The exact transcript should also frame counts, indices, roles and lengths. A generic root digest must not be interchangeable between Base/Extension modes, stages, domains, leaves or profiles. EOF and exact exhaustion are required before success. The current API performs one-shot verification and returns no authenticated result on failure; a future resumable verifier would additionally require permanent failure state. A prover-side consistency check is not a verifier check.

## Algebra and degree checks

For a linear query with a multilinear weight, the initial constraint is `w_0(Z,X) = Z*A_0(X)` after moving any public constant contribution into the target. The paper defines `d* = 1 + deg_Z(w_0) + max_i deg_Xi(w_0)`. Thus `d* = d = 3` is a **strict degree bound**: each internal polynomial belongs to `K^{<3}[T]`, has degree at most two, and has exactly three coefficient slots. The existing outer sparse sumcheck is cubic and has four slots; copying that wire shape would enlarge the admitted internal degree.

Use a consistent zero-based local round index `s`. Before that round, the fixed prefix contains `s` coordinates, so the honest round polynomial sums over `m_i - s - 1` remaining Boolean coordinates. Preserve every previous weight term when restricting the prefix. Newly added equality terms remain multilinear in the remaining coordinates, so the internal degree stays at most two.

At a shift, the next target is the previous reduced target plus the new OOD reply with coefficient `gamma`, followed by predecessor folded evaluations with coefficients `gamma^2, gamma^3, ...`. The new weight is the restricted previous weight plus the corresponding equality-polynomial terms. Every logical occurrence contributes, even when two sampled query indices coincide. Query deduplication is an encoding optimization, not permission to drop a term or change its exponent.

The final check is the exact Boolean sum of the fully restricted accumulated weight times the terminal multilinear polynomial. It must include the original external query weights, initial compiler OOD weight, every intermediate OOD term and every predecessor consistency term. It is separate from the sampled agreement checks against the final predecessor oracle. Either check alone admits attacks.

### Published notation requiring care

These observations concern the inspected PDF's notation, not a newly demonstrated cryptographic break:

- Page 32 indexes local rounds from one but prints a suffix length `m_i - ell - 1`; its prefix of length `ell-1` plus the current variable instead requires `m_i - ell` suffix variables. The zero-based rule above is dimensionally consistent.
- The parameter list names repetitions `t_1,...,t_M`, while the operational and error formulas use `t_0,...,t_(M-1)`. Freeze an explicit zero-based native schedule.
- Page 34's auxiliary weight notation appends reversed challenges at the end, while Construction 5.1 and the folding identity bind the first-variable prefix. The native monomial embedding and LSB basis require consistent prefix restriction. Asymmetric weights and coefficients must test this choice.

## Domains, folding and authenticated queries

Boolean-evaluation folding and Reed–Solomon codeword folding are different operations. For a nonzero domain point `x`, the latter is

`Fold(f, alpha)(x^2) = (f(x)+f(-x))/2 + alpha*(f(x)-f(-x))/(2*x)`.

With natural FFT order, the pair is at indices `j` and `j+N/2`, not adjacent Boolean indices. A `2^k`-point predecessor block must contain exactly all preimages under `x -> x^(2^k)`, with the correct intermediate abscissae for repeated folding. Merkle packing must preserve the committed encoding and those ordered block semantics.

The consistency sample domain is the **previous** domain raised to the folding power. It need not equal the domain of the new commitment. In this profile, freshly committed shifts are always seven, whereas the first two predecessor-folded shifts are `7^4`; the final one is `7^2`. Reusing the new domain's points would test the wrong relation.

All predecessor points must be authenticated to the proper root, leaf position, role and encoding. Packed multiproofs may deduplicate physical leaves, but must reject missing, extra, duplicate-canonical, reordered or contradictory frontier material and reconstruct every expected logical query occurrence. Sample-with-replacement indices are transcript-derived; neither the prover nor a parser may substitute unique sampling, reduce the sample count, or choose a convenient set of indices.

## Zero, one and shape edge cases

- Folding, OOD and combination challenges are whole-field samples in the inspected construction. Zero and one are legal; do not reuse the old DEEP/FRI domain-exclusion or nonzero samplers without a new analysis.
- Folding denominators are `2*x`, where `x` belongs to a nonzero smooth coset. Reject an invalid domain rather than dividing by zero or silently changing the formula.
- Equality weights should use products, supporting zero/one coordinates without inverses of `r` or `1-r`.
- The fixed experiment has six initial variables. Generalizing to zero variables requires a separately specified authenticated constant base case or explicit rejection, not access to a nonexistent last sumcheck message or an unauthenticated shortcut.
- Exactly two terminal monomial coefficients are admitted. An honest lower-degree constant still occupies both slots. Extra coefficients, even zeros, change the wire shape and must be rejected.
- A monomial coefficient array is not a Boolean evaluation table or a roots-of-unity interpolation result. The retained basis fixtures distinguish all three representations. Opening arithmetic does not itself prove zero Boolean tails or accepted game inputs.

## Conditional algebraic error accounting

Every committed and folded code has rate `rho = 1/128`. The choice `delta = 3/8` is below `(1-rho)/2 = 127/256`, so the selected unique-decoding list bound is one. Under the hypotheses of WHIR Corollary 4.11 and Theorems 5.2, 5.6 and 7.5:

| Component | Conditional contribution |
| --- | --- |
| Five folding MCA terms | `(4096+2048+1024+512+256)/q = 7936/q` |
| Five strict-degree terms | `15/q` |
| Two intermediate OOD uniqueness terms | `(8+2)/q` |
| Two shift algebra terms | `2*257/q` |
| Initial compiler OOD term | `32/q` |
| At most four same-oracle constraints, including initial OOD | `3/q` |
| Two shift query tails and final query tail | `3*(5/8)^256` |

The resulting expression is `3*(5/8)^256 + 8510/q`, **before concrete hashing/Merkle, Fiat–Shamir and outer-protocol errors**. The one-original-oracle compiler-combination term is zero. The same-oracle batching theorem uses `(t-1)*ell/q`; the elementary degree-two observation for three fixed claims alone would omit the proximity-list factor and the fourth initial-OOD constraint.

This accounting assumes the exact admitted degrees, oracle/list and decoding premises, whole-field challenges, query sampling and message order. It does not establish implementation equivalence to the theorem, hash security, an accepted-history relation or a composed 128-bit profile. Supported build targets, primitive provenance, verification metering and full resource measurements remain separate evidence.

## Independent verifier attacks to require

| ID | Attack or fixture | Expected verifier behavior |
| --- | --- | --- |
| W01 | Correct sumcheck identities but false terminal value | Reject after authenticated closure, not only in the honest prover |
| W02 | Properly committed altered oracle with coherent supplied answers | Reject the false externally fixed claim |
| W03 | Change initial/intermediate root, scope, query identity, weights, encoding mode or fold/domain descriptor | Reject context replay or derive incompatible transcript obligations |
| W04 | Omit or replace the initial compiler OOD constraint after absorbing its reply | Reject; its later answer must match the earlier anchor |
| W05 | Move an OOD reply after dependent randomness or a terminal polynomial after final query sampling | Protocol API/codec rejects the reordered transcript |
| W06 | Introduce a fourth internal coefficient or a third terminal coefficient, including a zero | Reject exact shape before acceptance |
| W07 | Change just a shift target term, drop an old equality weight, or alter a gamma exponent | Reject the corresponding round/final relation |
| W08 | Use adjacent Boolean rows, reversed prefix order, the new coset, or an incomplete preimage block | Reject; asymmetric independent fold fixtures expose the mismatch |
| W09 | Repeated logical query indices with compressed physical openings | Preserve all algebraic occurrences; honest case passes, dropped occurrences fail |
| W10 | Merkle sibling/position/role splicing, wrong tree depth, missing or extra frontier node | Reject exact authenticated query reconstruction |
| W11 | Constant/zero polynomials and forced `alpha`, `gamma` or OOD points equal to zero/one in arithmetic fixtures | Correct algebra without invalid inverses; no production challenge override |
| W12 | Noncanonical base/extension coordinates, truncated proof, trailing bytes, changed counts or oversized allocation request | Fail closed within fixed limits |
| W13 | Final polynomial agrees with the weighted terminal equation but not predecessor samples, or the reverse | Reject in both directions |
| W14 | A failed future mutable verifier or replay source is resumed with honest messages | Remain failed; current one-shot verifier has no resumable state; exact complete exhaustion before success |
| W15 | Extra external query, reordered query list, or claims chosen after batching randomness | Reject shape/order; no adaptive replacement of verifier-selected weights |
| W16 | Treat a successful opening as proof of padding, base-field application values, game history or settlement | Result type/documentation must retain any obligations not implemented |

Fixtures that the honest prover alone refuses do not satisfy these attack tests. Tests call the actual verifier with independently assembled malicious candidates where practical; deterministic rejection of those candidates does not prove rejection of every malicious strategy.

## Reviewed implementation and independent results

The reviewed files are [whir_linear.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_linear.rs), [whir_commitment.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_commitment.rs) and [whir_protocol.rs](../../output/qualification/unused-proof-mirror-retirement-20261018/preimage/world/native/whir_protocol.rs). The immutable linear profile binds exact field, dimensions and parameters. The codeword spec binds the public protocol context, role, stage, coefficient count, coset, leaf width and encoding; resource ceilings intentionally remain local admission policy rather than commitment identity. Natural FFT output is packed into the full folding preimage block. The native primitive-root argument is the domain logarithm, matching the spec's use of `trailing_zeros()`.

The protocol carries the accumulated equality weights through both shifts, retains all ordered duplicate query contributions, and uses the predecessor's powered domain in every fold check. Internal messages contain exactly three quadratic coefficients; the terminal message contains exactly two monomial coefficients. The single-original-oracle compiler draw is retained with its own label before constraint batching. The initial OOD reply is absorbed before query batching. Its public typestate is explicitly unauthenticated; there is no implemented continuation integrating an arbitrary outer execution transcript in this laboratory API.

The fixed 736-byte body plus eight-byte magic precedes the three packed openings. The decoder reads canonical fixed messages, replays their transcript with the expected root and query set to derive the exact sorted unique leaf IDs and native minimal frontier sizes, then requires exact input exhaustion. No proof-selected counts, dimensions or row IDs determine parsing. This transcript-only parsing pass does not authenticate a proof. The one-shot `verify` independently checks all sum identities, each native Merkle opening, the final sampled folds and the exact weighted terminal equation before constructing its private-field result type.

Source-review corrections applied by the owners were the native fold helper's `(beta, x)` argument order, initial Base/Extension documentation, and a debug-assertion guard on deliberately malformed K construction in a commitment test. The last issue concerned the test's violation of a native constructor precondition; the production canonical checks were already present. Malformed base-field shift and arbitrary-degree committed-oracle tests remain unconditional. Seven commitment tests passed in both owner release and debug-assertion lanes.

The independent audit module (retired source path `scripts/native/whir_protocol_audit.rs`) ran through the actual public verifier using the frozen runner (retired source path `scripts/test-native-whir.py`). Nine tests passed, with 46 unrelated tests filtered, in 2.7673 seconds after a 4.9037-second standalone native harness compile. These are harness wall times, not per-proof performance or process-memory measurements. No Cargo, dependency compilation, maintained Iroha edits or native-source transformations were used. The [independent report](../../output/qualification/native-whir-independent/build-report.json) pins 15 sources and 21 retained files, all independently rehashed after the run.

| Independent test | Evidence and limit |
| --- | --- |
| Honest asymmetric extension witness | Verifies an exact six-variable, three-query opening, expected context/root/query digest and byte-identical decode/encode |
| Fully zero witness and zero query | Complete proofs pass in both Base and Extension modes; all OOD replies, round coefficients and terminal coefficients are zero; encoding roots differ |
| Valid rounds and valid terminal weight, false terminal samples | An independent malicious transcript uses real roots, separately authenticated openings and valid every-round identities; `verify` rejects specifically with `FinalFold` |
| Valid rounds and valid terminal samples, false terminal weight | A separate forged transcript agrees with every final sampled zero-oracle value; `verify` rejects specifically with `TerminalConstraint` |
| Coherent excessive-degree original oracle | Commits natural evaluations of `X^64` while advertising 64 coefficient slots; all forged round identities and paths are valid, parsing succeeds, and the complete candidate is rejected at terminal closure; this does not exhaust all possible wrong-degree attacks |
| External context and query replacement | Rejects scope, statement, initial encoding, original root, claim, weight, query ID, order and count changes |
| Exact wire and canonicality | Rejects selected truncations, noncanonical F/K/digest coordinates, inserted internal/terminal coefficients, trailing data, wrong magic and oversized bytes |
| Authenticated material and phase splicing | Rejects changed leaves/frontier digests at each stage and spliced shifted roots, OOD replies and opening payloads |
| Every arithmetic-message slot | Rejects each of 15 quadratic coefficient changes, all three OOD reply changes and both terminal coefficient changes |

The malicious assembler independently implements prefix weight interpolation, exponent-form power points, rejection/masking sampling and explicit Lagrange folding of authenticated blocks. It does not call the protocol's private algebra or challenge helpers. Its three coherent candidates must successfully decode, preserve every round identity, and separately verify their native Merkle paths before the test accepts the expected algebraic failure. All three deterministic transcripts contain repeated query indices, including the final stage, and preserve their logical multiplicities.

The separate owner integration report contains 14 tests (seven commitment, three linear helper and four protocol tests). Together with these nine external tests this is 23 distinct WHIR tests; rerunning the seven commitment tests with debug assertions does not add seven distinct tests. Previously retained basis tests are a separate prerequisite. Owner arithmetic fixtures cover zero/one alpha, beta and gamma, asymmetric LSB folding, different predecessor cosets and repeated-query weight sums. They do not install a production Fiat–Shamir challenge override. W14's future resumable state and a complete adaptive outer-protocol composition are not implemented or tested here.

### Final reviewed source and report pins

| Artifact | SHA-256 |
| --- | --- |
| `whir_protocol.rs` | `64434969c2fdc051d289681de465f50a6f47fdab3f02b21846084f7629ddef24` |
| `whir_linear.rs` | `ef34eae56502ba57f332653be194d11cf5c5ef90736c729ad4fe1e9417289393` |
| `whir_commitment.rs` | `84cd120373bac00177d70685977e6ef14cc4c94dcd257649daa4f6ee65690b46` |
| Unchanged `multilinear_basis.rs` prerequisite | `6d70ecf149e49701fbda09f65cfae6600793621f14795b37d660b280c8df0de0` |
| `scripts/native/whir_protocol_audit.rs` | `05a7b5189895cf781a3ffb13fc78b501c235d893a6c6a927a8b6ce0b4d99d1ae` |
| `scripts/test-native-whir.py` | `a20fb2756d105704acb95d24fabe541e09c3b476ac17041888258d5b20b87ba2` |
| Independent nine-test build report | `044c39dc0f8c28b8981df17523ecc0c58c47526228eb21155f865c0314bd622a` |
| Owner 14-test integration report | `a7a9660e1ce914c221cc75d15da90f6e8b79f523241e66cf8be851fde20676c3` |
| Owner seven-test commitment release report | `0758d3e2f0ccbdc00013e6d2e4cd929ec60284309028cabe6469541de3d3e270` |
| Owner seven-test commitment debug report | `3cca34e534b3e8ac215447d48a30b1283d434a880220ce6c8bc6151cf98546d4` |

The result remains the fixed 64-value generic K linear-opening relation under the stated construction and hash/Fiat–Shamir assumptions. Resource admission counts bounded payloads and conservative native scratch allowances, not exact allocator overhead or RSS. No hiding, execution range/ROM closure, initial/final game state binding, replay authorization, full-race proving, ledger inclusion, settlement or 128-bit qualification follows from this review.
