# Local browser account and transaction admission

The isolated Iroha SDK now supports browser account construction and canonical
Norito transactions without a native host or remote account validator. Node
still requires its authenticated Rust binding. Browser validation is an explicit
platform implementation; it is never selected as a fallback for a broken Node
binding.

The [shared codec](../../iroha-sora-cars-native/javascript/iroha_js/src/addressCodec.js)
owns I105 parsing, exact controller encoding, member ordering and private state.
Both platforms reject nonminimal encodings, malformed headers, duplicate or
invalid multisig members, contradictory thresholds and trailing bytes. Browser
[key admission](../../iroha-sora-cars-native/javascript/iroha_js/src/accountKeyAdmission.browser.js)
validates all eleven current key algorithms against native rules. Parsing an
account does not authorize spending; existing browser transaction signing still
requires a single-key Ed25519 authority, network binding and explicit fee intent.

The native signature implementations remain Rust and the workspace remains
`std`-only. No WASM build, external zkVM, remote signing service or runtime CDN
dependency was added. The browser uses the already installed noble arithmetic.
The [native source record](../../iroha-sora-cars-native/specs/browser_account_admission.md)
documents the exact rules, including GOST's native equation/range admission
scope. This is not a new proof-system security claim.

The final [focused SDK run](../output/qualification/browser-account-sdk-focused-attempt-2.log)
passes **227 Node tests, with no failures or skips**. These include the native
account/controller fixtures, all-curve rejection controls, strict Ed25519 and
BLS cases, mutation isolation, 264 deterministic current-native key comparisons,
and affected Connect, game, transaction and deployment codecs. Browser-target
bundles executed in Node are counted here as Node tests.

The separate [Chromium run](../output/qualification/browser-account-chromium-attempt-3/report.json)
passes **72 checks** through real browser bundles. It matches all 16 retained
native account fixtures and seven invalid controller fixtures, rejects twelve
malformed keys, checks network and mutation rules, and produces exactly the same
transfer payload and signed transaction as fresh Rust calls. It verifies the
signature locally and rejects a corrupted signature, another network and missing
fee intent. Original fixtures, native transfer bytes, browser bundle, selected
input hashes and a screenshot are retained. The test forbids alternate native
binding directories, blocks external requests and records cleanup and drift.

The [game wallet UI run](../output/qualification/browser-account-connect-ui-attempt-1/report.json)
passes four scenarios with the actual application and a **local Connect
node/wallet protocol counterpart**. It checks cancellation, late replies,
canonical QR/deep links, Japanese/English desktop/mobile layouts, retry, signed
Taira-bound approval and disconnect. No spending request occurs. The desktop
and mobile captures were visually inspected. This does not establish deployed
wallet or public Taira interoperability.

The initial SDK run retained one stale assertion that tried to construct an
invalid header and expected rejection only during later encoding. The updated
assertion requires immediate constructor rejection. The lobby test now answers
the explicit refresh following successful submission, while preserving exact
stake and empty-equipment assertions. Failed attempts remain in the evidence
directory; no production validation guard was disabled to pass a test.

Stock [native regeneration](native-browser-generation.md) separately installed
current CLI-produced source identities and unchanged physics/reference values.
Its 36 focused generator/source/parity tests pass. The subsequent
[native Touring export milestone](native-touring-export.md) supplies its distinct
CLI export, current artifacts and complete source/reference parity. Large-account parsing costs, actual
wallet interoperability, full-duration execution proofs, composed security,
current consensus settlement, four-validator operation and deployment remain
separate qualification work. Live XOR/NFT stakes stay disabled.

The [application suite at this milestone](../output/qualification/browser-account-app-tests-final.log)
had **247 passes and one failure out of 248 tests**: Touring's complete source
identity check. The production build passes with its existing large-chunk
warning. The unchanged bundled game client also exercised the idle proof office
and a Stock practice drive with acceleration/steering; screenshots and text
state were inspected. These are focused regression checks, not an eight-human
network qualification.

The later [Touring validation](native-touring-export.md) resolves that failure;
its full application suite passes all 264 tests without skips. This does not
expand the deployed-wallet or security claims of the account evidence above.
