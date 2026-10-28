# Independently verify a settled result

A Torii session record, proof receipt, pipeline status or successful download is
an endpoint report. The browser does not contain a complete finality verifier
and must not present those reports as independently authenticated settlement.

This document describes the current native certified-settlement contract.
Native production and integration qualification are still in progress. The
application now uses this seven-file contract, including thirteen ledger expectations and a separately pinned verifier executable, wallet/source-revision binding and descriptor-last
publication. Its transport and storage tests use synthetic payloads and do not
establish genuine proof or finalized-ledger verification. Follow
[the completion gates](zk-foundations-goals.md) for current native exports,
wallet continuation and end-to-end qualification.

## One descriptor, seven native files

The first release accepts one closed descriptor format:
`iroha.game.certified-settlement-files`, version `1`. Its only top-level fields
are `format`, `version` and `files`. The seven entries in `files` each contain
exactly `file`, `bytes` and `sha256`:

| Role | Contents |
| --- | --- |
| `finality` | Consecutive canonical finality frames from the independently selected first height through the settlement height |
| `source_block` | Exact earlier signed block wire containing the selected pre-settlement record |
| `source_merge` | That block's complete canonical merge-ledger entry |
| `source_write_set` | Complete marker-inclusive write set authenticating the earlier game record |
| `settled_block` | Exact later signed block wire containing successful settlement |
| `settled_merge` | That block's complete canonical merge-ledger entry |
| `settled_write_set` | Complete marker-inclusive write set authenticating the settled game record |

Files use unique flat ASCII `.nrt` basenames. The browser writes
`<role>.nrt` and publishes `descriptor.json` last. Keep all eight files together.
Descriptor byte counts and lowercase SHA-256 digests detect transport changes;
they do not authenticate the ledger. The descriptor cannot supply network
trust, validator context or expected game results. Obsolete JSON bundle/index
formats have no compatibility decoder.

## Independent expectations

The native command requires thirteen ledger expectations. Obtain the network, initial
height context and compiled profile from an independently authenticated release
context. Retain the locally constructed entry hash and game selections approved
by the wallet. Select the earlier and settled record heights, block hashes and
revisions independently of the downloaded descriptor. An endpoint may help find
candidate data; it cannot silently replace those expectations or the trust
anchor. The browser checks the network, session, profile, entry hash,
outcome commitment and original source revision against retained wallet context.

Separately obtain the exact verifier executable SHA-256 from an independently
trusted release build record. Configure `VITE_VERIFIER_BINARY_SHA256` from that
record; neither Torii nor a downloaded descriptor supplies this value. Use the
`iroha-verify-pinned` launcher from the already installed, trusted Iroha SDK.
The command does not download a launcher or run an unpinned remote package.

The launcher copies the executable to an exclusively created owner-only temporary
directory while hashing those same bytes, checks the trusted artifact digest,
and executes that retained copy. A concurrent Cargo replacement cannot change
which bytes execute. The launcher forwards cancellation and removes its copy
after its child has exited. This authenticates the selected executable against
the caller's artifact pin; it does not derive source provenance from a binary's
self-reported stamp. Use release executables whose only runtime dependencies
are trusted platform libraries; artifacts requiring adjacent unpinned libraries
are not supported by this single-executable launcher.

```sh
iroha-verify-pinned --binary '/absolute/path/to/iroha' \
  --sha256 '<trusted release executable SHA-256>' -- \
  --machine app execution verify-settlement \
  --bundle descriptor.json \
  --network-id '<release-pinned NetworkId>' \
  --trusted-context-id '<authenticated first HeightContextId>' \
  --expected-entry-hash '<wallet-approved entrypoint hash>' \
  --session-id '<selected game session hash>' \
  --profile-id '<release-pinned compiled profile hash>' \
  --outcome-commitment '<expected scoped game commitment>' \
  --first-height '<first finality height>' \
  --source-height '<earlier record height>' \
  --source-block-hash '<earlier block hash>' \
  --source-revision '<earlier record revision>' \
  --settled-height '<settlement height>' \
  --settled-block-hash '<settlement block hash>' \
  --settled-revision '<settled record revision>'
```

Heights and revisions are bounded unsigned 64-bit integers. Require
`0 < first_height <= source_height < settled_height`. Native checked hashes,
48-byte game commitments and 32-byte artifact SHA-256 digests are distinct types;
do not substitute one for another. The browser command builder
canonicalizes and shell-quotes these values for a POSIX shell, including bundle
and executable paths. The artifact pin is local launcher input and is not sent
in the Torii request or passed as a native ledger expectation. The retired source
stamp field and flag have no compatibility decoder.

## What native verification establishes

Core authenticates both selected carriers through consecutive finality from the
external network/context pin, opens their complete merge entries, and verifies
write-set membership of the complete earlier and settled records. It requires
the exact earlier network, profile and revision and a valid nonterminal source
context.

The later certified execution must contain the exact requested entrypoint once,
with a successful result. Its signed external transaction must bind the network
and contain exactly one explicit `SettleGameSessionV1`. Core checks immutable
manifest, admission, certificate scope and economic context across the records;
derives the scoped outcome commitment; verifies the compiled execution proof
against the authenticated earlier record; and binds the settled revision,
terminal height, result and verification reference to that transaction.

The report separates these checks from `compiled_profile_qualified`. Successful
verification does not qualify the proof protocol, audit funded payouts, prove
the full lifecycle, establish latest-state freshness, authenticate the native
binary, establish human participation or provide witness privacy. The current
report explicitly leaves those assurances false. Neither a successful command
nor an endpoint response enables staking in an unqualified release.

The CLI runs offline without Torii or wallet keys. Execution commands reject
credential, configuration, transaction metadata and fee-selection globals.

## Resource and persistence boundaries

Native hard limits include a 1 MiB descriptor, 65,536 unique finality heights and
a 4 GiB aggregate verification work budget. Role-specific block, merge-entry and
write-set limits also apply. Work accounting includes descriptor bytes, framing,
repeated authentication of the source prefix and charged execution projection
work; it is not simply the sum of file sizes and is not a qualified process-RSS
bound. `--max-finality-heights` and `--max-finality-archive-bytes` can tighten the
native limits, not raise them.

The reader rejects unknown fields or roles, duplicate keys, malformed canonical
carriers, trailing bytes, substituted files and unsupported paths. Referenced
files must be direct regular files in the descriptor directory, with the exact
consumed lengths and digests. Exceeding a bound fails verification; it never
selects an endpoint-supplied replacement checkpoint.

The browser requires a desktop browser with folder saving support.
It streams bounded chunks into a new folder, awaits file writes and exact
transport completion, then closes the descriptor last. Before descriptor close
starts, cancellation discards the unpublished export. Once close begins, it
waits for the actual result and does not promise rollback. This is not an atomic
directory transaction or a crash-durability guarantee. There is no single-file
compatibility fallback. Download completion remains endpoint-reported.

## Qualification status

The existing browser implementation has scoped unit and Chromium filesystem
coverage using synthetic transport payloads. The current transport-only unit
suite passes all nine cases against the captured SDK, and the five existing
Chromium OPFS scenarios pass in an isolated browser. Current native-corpus
continuation tests, genuine seven-file proof/finality verification and actual
operating-system folder-picker interoperability remain separate gates. Downloads
continue to be labeled endpoint-reported until independently verified.

The native genuine Stock/Grid command gate is
`execution_finality::certified_gate::genuine_certified_stock_and_grid_shipping_command_and_mutations`.
It is ignored by default and requires current genuine seven-file inputs and
independent expectations. Its reviewed adversaries include changed expectations,
typed proof/statement tampering, source/archive substitutions, trailing bytes
and bounded-work failures. Source review does not count as executing this gate.
Current native compilation, fixture generation, genuine command runs, funded
settlement and cryptographic review remain tracked separately in the completion
goals.
