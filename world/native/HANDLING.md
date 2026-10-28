# Native-authored street handling component

This is a development component outside the maintained Iroha checkout. It does not replace the current Stock/Touring game physics, admit a proof profile, enable a track or settle a race. The full goal remains active.

`street_handling.rs` builds one arithmetic graph using `street_graph.rs`. The std-only Rust evaluator exports its graph, and `src/game/street/graph.ts` interprets that exact generated graph. There is no second hand-written browser handling equation. The browser rejects unknown fields/operations, invalid references, malformed integer ranges, non-Boolean selectors and invalid geometry. It snapshots the graph and geometry and evaluates every node, including unused branches. This is a local authoring format with an explicit `geometryLookup: "unqualified"` marker, not a way to upload code into the native verifier.

## State and order

At 30 ticks per second, the six state values are:

| Value | Integer range / convention |
| --- | --- |
| Progress | −12,000 to 80,006,000 mm; the extra 6 m preserves crossing fractions at the maximum 80 km finish, and outer race logic enforces the actual finish |
| Lateral position | −16,000 to 16,000 mm, positive to the right |
| Speed magnitude | 0–3,000 mm/tick; normal maximum 2,400 = 259.2 km/h, boost maximum 324 km/h |
| Body and velocity yaw | Each −500,000 to 499,999 microturns relative to the road; clockwise positive |
| Boost energy | 0–1,000 |

Controls are six bits: throttle, brake, left, right, drift and boost. Brake overrides throttle; left/right cancel. Context supplies Boolean rain, oil and active status, plus bounded wind. Those context inputs are not yet derived from an authenticated race state.

The graph decodes all bits, changes body yaw, turns velocity toward the body according to grip, applies slip/drag/acceleration/boost, computes displacement, transforms both yaws into the new road frame, and resolves the guardrail envelope. Inactive outputs select the original six state values and clear feedback; even then every candidate node must satisfy its bounds. This does not implement race terminal/DNF/padding admission by itself.

Steering authority declines with speed. Steering alone at rest cannot rotate the car; throttle supplies a bounded crawl response so repeated bumper contact does not remove the player's ability to steer away. A launch from zero speed takes the body direction, because zero momentum has no retained travel direction. Drifting increases body rotation while reducing grip, so body direction and travel direction separate. Countersteering can reduce that separation. Releasing drift restores grip, and slip consumes speed. Rain and oil reduce grip further. Boost requires throttle, speed above 300 mm/tick and at least 20 energy; it costs 20 per permitted tick. Otherwise energy regenerates by 3. Excess boost speed decays after release instead of clipping instantly to the normal cap.

## Bounded direction and road coordinates

Yaw wraps over a full turn, preventing an angle clamp from automatically steering the car around bends. The direction function reduces to an octant and evaluates defined fixed-point polynomials at scale 4096. Sine uses a staged fifth-order term; cosine uses a fourth-order term. Explicit rounding guards and equal diagonal values prevent asymmetry and added displacement energy. All signed division truncates toward zero. These are the rules' defined integer direction coefficients, not a claim of exact real trigonometry.

The exhaustive Rust test checks all 1,000,000 stored yaw values, every mirrored pair and cardinal direction. Every integer direction satisfies `sinQ² + cosQ² <= 4096²`.

Let `dh` be the frozen heading difference across the current cell and `span` its length. The graph defines:

```text
radiusOffsetQ = trunc(dh * lateralMm * 25736 / (span * 1000000))
radiusQ       = clamp(4096 - radiusOffsetQ, 2048, 6144)
forwardMm     = trunc(speed * cosQ / 4096)
progressDelta = trunc(forwardMm * 4096 / radiusQ)
lateralDelta  = trunc(speed * sinQ / 4096) + movingWind
roadRotation  = H(nextProgress) - H(oldProgress)
```

`roadRotation` is subtracted once from both body and velocity yaw. This is an explicitly defined first-order road-coordinate arcade integrator, not an exact Cartesian/Frenet integrator. It uses the frozen heading interval rather than integrating diagnostic curvature. The largest actual progress step is 6,000 mm. Every node is strictly inside ±2⁵⁰, including all intermediate products; invalid inputs or intermediates reject.

## Standalone guardrails and composition

Cells are at least 4,900 mm long. With a progress step of at most 6,000 mm, start/middle/end width lookups cover every crossed cell. The smallest width and maximum absolute lateral endpoint form a conservative envelope of the linear lateral segment. A contact can be imposed earlier than an exact impact-time solver would impose it; the end position is clamped to that envelope.

Wall contact projects velocity onto the road tangent, preserves its forward/backward sign, and then dissipates another 25% of speed. It cannot convert transverse speed into forward speed. A perpendicular impact stops tangent travel. This standalone wrapper is for component tests. The [composed race](RACE.md) calls `append_free` so its joint swept car/wall solver receives the original full motion, without premature clipping. Interactive traffic, tree, sign and oil-entry catalogs still need implementation and constraints.

## Evidence and remaining gates

Run `npm run test:street-handling`. It compiles only std-only files with `rustc` in the stable `output/qualification/street-handling` lane. It exports the graph, compares Rust/browser transitions and invalid-input rejection, exercises all 64 controls with energy/weather combinations, fuzzes input bounds and next-state closure, and performs a 9,000-tick draft sequence with deterministic test steering and seeded wind. The sequence must actually traverse at least one Tokyo lap and reach normal top speed; it is neither an expert drive nor an eight-car race.

`report.json` pins the Rust/TypeScript sources, compiler, graph, generated harness and binary. Behavior checks cover acceleration/coasting/braking, boost thresholds and release, steering symmetry/cancellation, drift/countersteer, grip recovery, wet/oil grip, road rotation signs, inside/outside radius correction, reverse travel, signed wall response, skipped narrow cells and inactive state.

The composed host model now supplies car contacts, lifecycle and deterministic rain/wind. It still needs constrained geometry/context membership, AIR lowering for all operations and narrowed bounds, full proof transcripts and soundness analysis, native compiled-profile admission, supported-target performance qualification and actual gameplay tuning. No ≥128-bit security, complete proof or live release claim follows from these host arithmetic tests.
