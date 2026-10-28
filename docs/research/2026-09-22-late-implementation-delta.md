# September 22 late implementation delta

This selected primary-source check extends the [coding and verifier update](2026-09-22-coding-and-verifier-delta.md). These are **source-read, unrun upstream changes**, not reproduced benchmarks, an independent security proof, or a release assessment. No native source, dependency, parameter, or admitted profile changed.

## Authenticated memory, with an important boundary

[Offline read-only memory checking, September 22, 08:24:26 UTC](https://github.com/Plonky3/Plonky3/commit/5a199b0dbf606321142daba379d64f9b5fedd5b5) adds a multiplicative-count construction. It requires nonzero counts, orbit bounds preventing forged cycles, fixed generator-derived table addresses, statement dimensions bound before challenges, and source commitments already observed by the transcript. Its standalone reduction returns leaf claims that **still require commitment authentication**. The materialized path uses a third product tree for nonzero counts; the AIR declaration constrains count inverses. Conditional reads are unsupported in that helper.

A concrete incompatibility: `ReadOnlyMemoryBus<F>::new` rejects `|F| - 1 <= usize::MAX`, so its generic AIR handle rejects Goldilocks on 64-bit targets. This follows from the constructor and modulus; it is not a protocol attack. The materialized plan uses different explicit count bounds. A native adaptation needs its own bounded construction or count-field design and proof.

[Authenticated binary bus claims, September 22, 09:02:21 UTC](https://github.com/Plonky3/Plonky3/commit/f4c66882b52657d629dbb7681612e0647ed13427) connects general bus reductions to committed trace columns through a composition sumcheck, including initial/terminal checks and additional security terms. **That integration does not automatically authenticate every claim returned by the separate memory helper.** Its report inherits PCS assumptions and charges reductions over remaining candidate traces.

Useful review cases include cross-bus separators, optional-section mismatches, malformed terminal lengths, and packed versus dense source access. Upstream tests identify expected rejection variants and report mutation checks. We did not rerun them; a native negative test should demonstrate the intended check, rather than pass through an unrelated rejection.

## Binary WHIR is a separate experiment

[Boolean/small-field additive-domain WHIR, September 22, 09:51:16 UTC](https://github.com/Plonky3/Plonky3/commit/c4f62a2b7689b7d0a54ba4d54aa7828752cfdc23) connects packed bit witnesses to WHIR using ring switching. It charges reductions over the remaining candidate set and estimates the complete opening transport, including extra claims and grinding witnesses. Hash and transcript collision accounting remains external.

The profile distinguishes unique decoding and Johnson-bound list decoding; additive domains refuse the capacity regime. It also bounds grinding-witness demands. This characteristic-two construction is not a replacement parameter set for native Goldilocks/Fp4. It offers a comparator for decoding, flags, and hashes. Signed fixed-point arithmetic still requires correct carries, comparisons, division, overflow, and field conversion. A target argument does not establish 128-bit composed execution security.

## Additional accounting lessons

- [September 19: bus soundness](https://github.com/Plonky3/Plonky3/commit/419490b197010be2f4a44f2b43bd373db96d9d38) sums fingerprint, sumcheck, batching, and collapse error probabilities from the executed schedule. Commitment binding and terminal authentication remain additional obligations.
- [September 20: STIR field-size accounting](https://github.com/Plonky3/Plonky3/commit/50c25cb4df010b2f0ed1d88889cd4985ffe843ad) aligns standalone and PCS configuration paths around a conservative field-order bound and Johnson-term reserve. Audit all native entry points consistently; nominal bit width overcredits entropy.
- [September 20: mask randomness](https://github.com/Plonky3/Plonky3/commit/05b1c111508e5f236b284c349511bf95b5bf2e4a) requires `CryptoRng` at hiding-mask APIs. This matters for privacy machinery; public-replay execution proofs need not acquire a zero-knowledge requirement.

These changes make the lookup/binary-commitment comparison more concrete. FACS/WARP accumulation remains the first scaling comparison for repeated transitions, including final-decision costs. No external zkVM adoption follows.

## Coverage

Primary records confirm [Akita's September 18 revision](https://eprint.iacr.org/2026/1983) and [DKT26's September 16 submission/17 approval](https://eprint.iacr.org/2026/2056); no date correction is needed. The ePrint recent-days listing remained inaccessible. WARP/Binius64 default-branch queries returned no September 19–22 commits, which says nothing exhaustive about publications or other branches.

Full commit SHAs are pinned in the links; dates are committer timestamps. Exact API records are retained in `tmp/crypto-september-late-delta/`. Review covered selected implementation, security, and rejection-test patches, not complete repositories. No absence-of-other-results claim is made.
