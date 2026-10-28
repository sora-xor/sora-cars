# Street geometry: native relation integration contract

This specifies the remaining AIR integration work; it does not claim an implemented AIR or reviewed soundness. The standalone Rust helper implements exact scalar geometry arithmetic, and the [compiled geometry circuit](COMPILED_GEOMETRY.md) now constrains exact table selection, normalization and interpolation. Maintained Iroha source and build integration remain subject to the active rollout coordination hold.

The application-specific street relation belongs in the reusable execution framework. Generic game lifecycle ISIs must continue to treat the game manifest, admission, resources and result as opaque versioned application data. No race-specific ISI is introduced.

## Bind the table before driving

A reviewed compiled street profile must commit to the complete immutable route catalog, sampled geometry, topology, gates, weather/traffic rules, allowed control encodings, car parameters and soundtrack timing where timing affects gameplay. A registered profile selects reviewed code and fixed parameters; uploaded JSON may not install a new verifier or change a funded session. Race identity, network, roster/input keys, initial state, accepted input/dispute history and final result keep their existing statement bindings.

Geometry lookup needs constrained membership, not a prover-selected host lookup. Either a reviewed fixed-table lookup argument or an in-AIR authenticated path under the compiled catalog commitment must bind the route, sample index and all eight columns. Adjacent endpoints must be proven to be indices `i` and `i+1` in the same table. Index bounds, final-cell behavior, padding leaves, path direction bits, hash domains and the selected compiled track must all be constrained. A SHA-256 packaging manifest is not that arithmetic commitment.

The implemented scalar route uses a third exact construction: shared low/high Boolean index-indicator bases and fixed-coefficient quadratic sums over complete adjacent row pairs, with explicit ranges for all sixteen endpoint columns and forbidden padding. It requires no probabilistic membership argument. The staged AIR may reuse these equations; replacing them with a cheaper lookup argument is separate work with separate soundness obligations. The ledger still must bind the exact compiled table and topology through the admitted profile.

## Exact heading equations

For a circuit's progress `s`, constrain signed Euclidean decomposition `s = lap*L + p`, `0 <= p < L`, with explicit race-state bounds. Authenticate the unique cell with `p0 <= p < p1`. For a sprint, constrain `p = clamp(s, 0, L)` and `lap=0`. Its terminal sample is valid at `p=L`; interval consumers use the final positive-length cell. Constrain station and heading endpoints to the committed table, including the nonuniform integer rounding of evenly distributed stations and all topology branch selectors.

Let `n=(h1-h0)*(p-p0)` and `d=p1-p0>0`. Signed quotient `q=trunc(n/d)` must carry the matching signed remainder and an absolute remainder smaller than `d`; host division is not a constraint. Because uniform station rounding produces only two possible cell widths, the existing constant-divisor integer AIR can select between two separately constrained quotients if their endpoint/width selection is constrained. An unconstrained divisor branch is invalid.

Then `H(s)=h0+q+lap*winding` inside a cell; a sprint's terminal heading is its authenticated last heading. The winding is an authenticated fixed ±1,000,000 microturn constant for a simple closed circuit. A driving tick's road rotation is `H(s_after)-H(s_before)`, which telescopes exactly across cells and laps. Inactive cars, padding rows, disputed input continuations and terminal cars still need canonical frozen values and constrained branch selectors. The standalone helper implements sprint clamping; its arithmetic constraints and race finishing logic remain separate work.

Use the diagnostic curvature only for display or a separately specified force approximation. Summing that estimate used to introduce heading drift; it is not an equivalent transition relation.

## Driving rules and qualification still required

The [draft handling graph](HANDLING.md) includes road-relative body heading and velocity direction, speed-dependent steering/countersteering, slip drag, boost costs, weather/oil grip and a conservative guardrail envelope. The complete composed graph now has [checked scalar lowering](SCALAR_CONSTRAINTS.md), including retained narrowings, positive-divisor quotient/remainder equations and exact compiled geometry. The [staged raw verifier](STAGED_CONSTRAINTS.md) preserves those equations and binds successive invocations. These components do not yet provide a univariate AIR or STARK. Host range checks alone are not used as arithmetic constraints.

The [composed street draft](RACE.md) includes ordered swept car/wall contacts, checkpoints, fractional finishes, forfeits/ties, deterministic rain/wind and terminal behavior. Tokyo also has a compiled native interactive prop/hazard catalog. Those graph equations are retained in the complete scalar lowering; the broader 49-location traffic/world catalog remains unfinished. Cryptographic trace commitments, authorized actions and a ledger-derived statement are still required; raw structural verification does not supply them.

New bounds and trace accounting must include every heading, width and interval lookup emitted by the final graph (including intermediate-cell guardrail sampling), membership constraints, signed arithmetic witnesses, collisions, replay/input commitments and terminal logic. Qualify the full eight-car format, including Tokyo's longer song-bound race, on supported CPU/accelerated targets. The ≥128-bit whole-proof security target requires a new documented analysis and independent review; neither scalar parity nor existing partial FRI estimates establish it.
