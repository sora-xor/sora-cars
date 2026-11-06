# Native browser artifact regeneration

Stock and Touring browser kernels and reference fixtures must come from the current pinned native CLI, with its embedded complete verifier source inventory matching the selected checkout. Hand-editing hashes does not update the compiled relation or establish provenance. Each computation has its own exports covering three tracks and every 2–8-player grid; they do not qualify a proof, fund a session or deploy anything.

The application SDK dependency and parity tests use `../iroha-sora-cars-native`. Both Stock and Touring source checks accept an explicitly absolute `SORA_CARS_IROHA_ROOT` override through [native-source-root.mjs](../scripts/lib/native-source-root.mjs); there is no fallback to the maintained `../iroha` checkout. The generation command requires the root explicitly, along with an independently recorded CLI digest.

Keep the native computation source inventory and selected executable frozen for one export/install invocation. Create the evidence parent first and choose a new, nonexistent attempt directory under this application's `output`. The generator refuses to reuse successful or failed attempts.

```sh
SORA_CARS_IROHA_ROOT=/absolute/iroha-sora-cars-native \
SORA_CARS_IROHA_CLI=/absolute/iroha-sora-cars-native/target/debug/iroha \
SORA_CARS_IROHA_CLI_SHA256=<independently-recorded-lowercase-sha256> \
SORA_CARS_NATIVE_EXPORT_DIR=/absolute/sora-cars/output/qualification/native-stock-export-attempt-N \
node scripts/generate-native.mjs
```

This stages the exact outputs of `iroha --machine app execution export-kernels --output-file …` and `export-parity --output-file …`. It retains command arguments, process exit information, stdout/stderr logs, artifact hashes, source snapshots and a final report. The CLI is hashed before, between and after the commands. The closed verifier inventory and five-file browser arithmetic inventory must each match the selected checkout; browser source bytes are checked independently, including files outside the verifier inventory. The union of both closed inventories is captured before and after export and must remain unchanged. Only paths from these local inventories are read. No Cargo command runs, and no native checkout is written by this workflow.

Before installation, validation requires fixed prefix 9, all 21 uniquely ordered track/player grids, complete control/layout counts, 5,400 inputs for each eight-player reference, valid bounded controls, initial and terminal snapshots, full terminal standings, and matching compiled source/rules identities. Each JSON export has a finite byte limit. Exact browser arithmetic/reference parity remains a separate test gate after installation.

Stock's verifier inventory includes the generic execution-STARK engine and the native adapter's complete history, certificate and record-binding sources. It conservatively retains earlier source pins; those pins do not select an alternate proof backend. The engine's security target does not qualify the composed record-binding, certificate, admission and settlement protocol.

For a coordinated source freeze, add `--install` using another fresh evidence directory. This repeats both native exports and validation, then installs only these three files:

- [race-v1-kernels.json](../src/game/generated/race-v1-kernels.json)
- [native-race-v1.json](../tests/fixtures/native-race-v1.json)
- [provenance.json](../src/game/generated/provenance.json)

All three staged files remain in the evidence directory. Previous installed files are retained under its `previous/` subdirectory. A create-only installation lock prevents competing generator installations; destination changes are rejected. Installation uses prepared sibling files and rolls back completed replacements on an ordinary exception, provided no other writer has subsequently changed them. Replacing three files across two directories is **not crash-atomic**: after a killed process or machine failure, inspect the retained report, previous files, destination hashes and lock before recovery. The script does not clear an unexplained lock or erase old evidence.

Run focused validation against the same checkout:

```sh
SORA_CARS_IROHA_ROOT=/absolute/iroha-sora-cars-native \
npx tsx --test tests/native-parity.test.ts tests/native-sources.test.ts tests/native-generation.test.ts
```

The generator records `cryptographicQualification: false` unconditionally. Passing the parity tests means these browser computations match these native reference fixtures; it does not establish soundness, full-race proving capacity or consensus settlement. The generation tests use explicitly synthetic subprocess fixtures to check orchestration, validation, drift and installation behavior; they are not native build evidence. The source/executable checks detect ordinary build drift within a coordinated local run, not malicious host replacement or a hermetic release build.

## Touring's independent export

[generate-native-touring.mjs](../scripts/generate-native-touring.mjs) invokes the native `export-touring-kernels` and `export-touring-parity` commands. Build a CLI containing those commands, record its digest independently, freeze the sources, then use a new evidence path:

```sh
SORA_CARS_IROHA_ROOT=/absolute/iroha-sora-cars-native \
SORA_CARS_IROHA_CLI=/absolute/iroha-sora-cars-native/target/debug/iroha \
SORA_CARS_IROHA_CLI_SHA256=<independently-recorded-lowercase-sha256> \
SORA_CARS_NATIVE_EXPORT_DIR=/absolute/sora-cars/output/qualification/native-touring-export-attempt-N \
node scripts/generate-native-touring.mjs --install
```

Omit `--install` to stage only. The dedicated commands must emit the actual `ClassedRaceV1` computation and `{ "kind": "touring_s1", "value": null }` class. The generator preserves their JSON bytes and installs only:

- [classed-race-v1-kernels.json](../src/game/generated/classed-race-v1-kernels.json)
- [native-classed-race-v1.json](../tests/fixtures/native-classed-race-v1.json)
- [classed-provenance.json](../src/game/generated/classed-provenance.json)

Touring retains its own closed verifier inventory and a closed six-file arithmetic source map. Every arithmetic digest must equal its corresponding full-profile digest and every profile digest must match the selected checkout. Its `profile_id`, `rules_hash` and reference source digest must agree across the two outputs. Stock's source inventory, artifacts, profile and parameters cannot substitute for Touring's.

Touring validation requires the complete 21-grid arithmetic catalog, bounded backward-only circuit references, seven state columns per car, fixed prefix 9, six-tick batches, 3 laps, all 64 controls, environment descriptors and initial-state parity. The reference corpus must retain the two-player 1,200-tick and three-to-seven-player 600-tick technical wins, each track's full 5,400-tick eight-player run, exact ordered DNF boundaries, every per-tick diagnostic checksum, required snapshots and terminal standings. Snapshot bytes are checked against their diagnostic hashes. These export-only SHA-256 checksums are **not ledger state commitments**.

All 816 native environment/control transitions are required: three tracks × wet/dry weather with nonzero wind × (12 objects × six boundary/inactivity cases + 64 low-energy controls). The validator checks their class/track/weather ordering, boundary coordinates, inactive-state preservation and event-output bounds. Browser execution parity remains a separate gate; validating an export's structure does not prove its physics.

Both wrappers use [native-artifact-generation.mjs](../scripts/lib/native-artifact-generation.mjs) for subprocess lifecycle, executable/source drift checks, evidence retention and guarded installation. Reports hash the wrapper, shared lifecycle and source verifier. They share the same create-only installation lock so a Stock and Touring installation cannot overlap. Existing destinations must be regular, non-symlink files; originals remain in the attempt's `previous/` directory. The crash-recovery limitation described above also applies to Touring. Provenance records `compiledIntoNativeRegistry: false` and `cryptographicQualification: false`; exporting a computation is not native admission or release qualification.

```sh
SORA_CARS_IROHA_ROOT=/absolute/iroha-sora-cars-native \
npx tsx --test tests/classed.test.ts tests/native-touring-generation.test.ts tests/native-generation.test.ts tests/kernel-runtime.test.ts
```
