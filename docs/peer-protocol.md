# SORA CARS peer protocol

The website runs the integer SORA CARS adapter at 30 Hz. Iroha stores generic game sessions, immutable manifests, escrow, authenticated dispute inputs, execution proof statements and verified outcomes. There are no native racing instruction aliases.

Wallet approval uses Iroha Connect. The browser builds canonical Norito transaction bytes locally, asks the wallet to sign those bytes, verifies the returned signature, and submits the same transaction directly to Torii. A wallet-authorized join binds a separate Ed25519 gameplay key to one participant in one game session. That key cannot sign wallet transfers or choose payout destinations.

Each six-tick batch follows this order:

1. Every original participant signs the initial or recovered state checkpoint.
2. Active peers sign commitments to their own six control words and random salts.
3. All peers sign the exact ordered commitment set before any honest peer reveals input.
4. The peers reveal the committed controls and independently run the integer simulation.
5. Every original participant signs the same cumulative transcript root and simulation-state root. Only this certificate advances the authoritative browser state.

The transcript root uses the generic game domain and `GameTranscriptV1`: slot-ordered opaque input bytes in complete batches, plus exact consensus DNF events. For SORA CARS, one participant input is twelve bytes containing six little-endian control words. The state root uses the generic game domain over canonical SORA CARS state bytes. Network ID, session ID and dispute epoch are included in the native action signature domains.

Prediction can extend at most twelve local input ticks beyond the certified state. It affects rendering only. Missing messages, invalid signatures or divergent simulation roots never create a local forfeit or a payout. The controller retains the last certificate, any jointly signed pending frontier, all known input commitments and all disclosed inputs for permissionless native recovery. A surviving participant cannot rewrite a departed participant’s retained transcript anchors.

Optional checkpoints require every original participant even after an input key becomes inactive. If that quorum cannot be recovered, use the bounded native forced-input phases. A terminal native execution proof can settle the verified history without a final participant signature. Technical wins and previously completed finishes are decided by the compiled adapter from consensus DNF history.

## Transport

`RaceMesh` creates an ordered WebRTC DataChannel between every participant pair. Signed offers and answers can be copied manually. A replaceable signaling relay is available with:

```sh
node scripts/signaling.mjs
```

It binds `127.0.0.1:8788` by default. Configure `SORA_SIGNAL_HOST` and `SORA_SIGNAL_PORT` explicitly for a different binding. Public deployments need a TLS endpoint. In **Peer connection & recovery**, configure an optional STUN/TURN server list before connecting. A TURN username and credential may be provided together; these remain in tab memory and are excluded from invitations, replay exports and chain transactions. **Route peer traffic through TURN only** requires a configured TURN server. Existing connections retain their settings. No external provider is assumed; the programmatic API accepts the same `iceServers` and `relayOnly` options. The relay cannot choose participants, forge inputs or authorize outcomes.

Public spectator publication is opt-in through `publicFeed`. A no-key `RaceSpectator` verifies the full commitment/reveal/checkpoint sequence and independently simulates it. The relay buffers at most one MiB of public packets per room, with at most 64 rooms. A late observer can initialize from a fully signed checkpoint and its matching public replay; an incomplete truncated feed explicitly requests that snapshot. Public replay chunks are accepted only against a caller-pinned generic transcript root.

## Verification

Run `npm test` for signed protocol, real physics reconciliation, spectator, replay and process-boundary tests. For eight isolated Chromium contexts and all 28 actual WebRTC links:

```sh
node scripts/mesh-test-server.mjs
SORA_CARS_TEST_ORIGIN=http://127.0.0.1:5175 node scripts/test-mesh.mjs
```

The static harness avoids development reloads changing an active protocol test. This transport test does not qualify the native proof relation or prove testnet deployment.

`npm run test:dispute-mesh` uses four real browser participants and six WebRTC
connections. One participant withholds its tick-18 checkpoint after accepted
inward-steering inputs cause a collision. Honest participants retain the tick-12
checkpoint, the complete jointly signed pending commitment set, and matching
reveals. Independent signature checks and replay reproduce the hidden collision
state from that public evidence. Prediction resets without creating a local
forfeit. The test passes and saves inspected captures plus public evidence in
`output/browser/withheld-collision/`; `artifacts/mesh-withheld-collision.json`
records its scope. It does not submit transactions or replace native consensus
recovery tests. `SORA_CARS_TEST_ORIGIN` can select the static harness above.

Torii JSON and transaction pipeline status are endpoint reports. They are not authenticated block-finality proofs. The current browser SDK's finality verification remains unavailable; live stake admission also requires the release-pinned native proof profile to be marked qualified.
