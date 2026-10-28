# SDK account encoding repair

The isolated Iroha SDK moved `AccountAddress` ownership into a private WeakMap,
but six internal consumers still read its removed `_controller` property.
Fresh SDK distribution and a valid native binding therefore failed to encode
otherwise valid canonical accounts. The retained diagnostic is in
[the focused catalog run](../output/qualification/native-proof-browser-development/binding-regression-diagnostic.log).

The repair introduces an internal accessor for native-admitted address objects.
It returns frozen records and independent copies of key bytes and multisig
members. Caller mutation cannot change the owned controller. It is absent from
public package entry points; the removed mutable field is not restored.

Norito, Connect, transaction construction, deployment, Nexus signing and Torii
controller inspection use this accessor. Native AccountController encoding stays
Single `0` or Multisig `1`. Extended single-key I105 encoding normalizes to
logical Single before Norito encoding; it does not add another Norito variant.
The exact compact AccountId decoder also rejects noncanonical reordered
multisig bytes, matching the native negative vectors.

The source and tests live in the isolated SDK:

- [Owned-state accessor](../../iroha-sora-cars-native/javascript/iroha_js/src/address.js).
- [Canonical AccountId codec](../../iroha-sora-cars-native/javascript/iroha_js/src/norito.js).
- [Native-vector and mutation tests](../../iroha-sora-cars-native/javascript/iroha_js/test/accountControllerCodec.test.js).

The authenticated debug binding was rebuilt using pinned Rust 1.93.1 and the
persistent external SDK target. The initial build took 11m14s; the source-refresh
build reused Cargo artifacts and reported 0.73s. Both retain the existing 152
Core warnings. This is development build evidence, not a release artifact.

The [focused controller/admission/game selection](../output/qualification/native-proof-browser-development/sdk-controller-tests.log)
passes **67 Node tests**, including 30 new native-vector and mutation cases.
The [affected consumer and worker selection](../output/qualification/native-proof-browser-development/sdk-controller-consumers.log)
passes **950 Node tests**. None are skipped. Tests whose names include
“browser” may import source in Node; these counts do not establish browser
account construction or wallet interoperability.

At the time of that repair, packaged browser account APIs were unavailable
because they could not load the native account owner. The subsequent
[primary browser admission implementation](browser-account-admission.md) now
provides local account and transaction validation. The earlier
[focused live-room diagnostic](../output/qualification/native-proof-browser-development/live-terms-diagnostic.log)
exposed that error directly instead of timing out while waiting for a
transaction that was never submitted. The expected submission assertion stayed
intact. The current test additionally answers the refresh after a successful
join; actual deployed wallet interoperability remains required. The [finalized-proof record office](proof-worker.md)
does not construct accounts or wallet transactions.

Separate source review identified unchecked AccountId normalization in the
standalone generic instruction decoder and block-proof transfer transcripts.
The compact AccountId, game/NFT and transaction InstructionBox archive APIs
already enforce byte equality. The remaining paths need their own native-vector
qualification; no authorization bypass or complete decoder audit is claimed.

Stock proof-source fixtures have since been regenerated through the current
native CLI. Touring remains stale and requires its own real export path;
source-pin assertions stay enabled.
Neither this SDK repair nor the browser worker evidence qualifies a complete
race, composed 128-bit security or live XOR/NFT settlement.

The retained post-repair [full app suite](../output/qualification/native-proof-browser-development/tests-sdk-controller.log)
has **232 passes and four failures out of 236 tests**: the two stale-source
checks, the browser join check, and its parent test. The
[production build](../output/qualification/native-proof-browser-development/build-sdk-controller.log)
passes with its existing large-chunk warning. The
[fresh Chromium/native proof run](../output/qualification/native-proof-browser-attempt-5/report.json)
passes all eight scenarios after this SDK change. The latest browser-admission work brings the app suite to 247/248 passes;
Touring's source check still fails. These distinct scopes must not be combined
into a release-ready claim.
