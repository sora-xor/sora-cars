# Touring catalog: consensus integration batch

Implementation design, based on the current source inspected on 2026-09-07 JST. This document is not implementation or qualification evidence. The catalog helper is unreachable, Touring is absent from the compiled registry, both proof profiles remain unqualified, and no native source is changed by this review.

The existing evidence index is [current-integration-evidence.json](../artifacts/current-integration-evidence.json). Its catalog report, `output/qualification/game-equipment-catalog-v1/20260906T153749Z/qualification.json`, records ten standalone policy tests against native data types and map projections, not executed WSV transactions. Touring's complete proof and browser harness reports have their own scope; neither authenticates catalog membership or reserves a kit.

## Complete behavior to implement

A publisher registers an immutable, content-addressed equipment catalog through a generic native instruction. A game manifest selects a compiled profile whose adapter requires particular catalog roles. Opening validates those catalog dependencies against consensus state. Joining validates the participant and the wallet's explicit resource clauses, then reserves the exact NFTs and debits the exact stake atomically. Settlement proves the complete accepted session and returns equipment to its original owners through existing native custody. Separately staked wager NFTs follow the winner policy.

Stock has no equipment roles. Touring S1 has one role and exactly one catalog kit per permanent participant slot. Every Touring participant has the same compiled class parameters. NFT metadata cannot supply performance multipliers, verifier code, roles or return destinations.

The production sequence remains closed to equipment funding until the exact profile passes release qualification. Registration is not qualification. The current native guard permits a zero-stake Stock session with no reserved equipment; this supports the real four-validator dispute/settlement gate without an override. Any nonzero stake or selected equipment still requires qualification. Do not change `qualified` merely to demonstrate a successful Join.

## Native wire and catalog authority

Move the canonical catalog types out of the unreachable Core helper into a new `../iroha/crates/iroha_data_model/src/game_equipment.rs`. Export that module from the model crate. Do not add these new catalog types to the sealed `game.rs` or `game_resources.rs` merely for convenience. Add one first-release instruction:

```rust
pub struct RegisterGameEquipmentCatalogV1 {
    pub catalog: GameEquipmentCatalogV1,
}

pub struct GameEquipmentCatalogMemberV1 {
    pub nft_id: NftId,
    pub metadata_hash: Hash,
    pub metadata_bytes: u32,
}

pub struct GameEquipmentCatalogV1 {
    pub version: u16,
    pub network_id: NetworkId,
    pub publisher: AccountId,
    pub application_seed: Hash,
    pub collection: DomainId,
    pub profile_id: Hash,
    pub role_id: Hash,
    pub policy: GameResourceReturnPolicyV1,
    pub members: Vec<GameEquipmentCatalogMemberV1>,
}

pub struct GameEquipmentCatalogRecordV1 {
    pub catalog: GameEquipmentCatalogV1,
    pub published_at_height: u64,
}
```

`metadata_bytes` is a proposed addition to the unpublished helper format. It commits the exact canonical metadata length and makes a publication's maximum metadata work visible before ledger traversal. Keep the existing domain-separated identities:

```text
application_id = H("iroha:game:application:v1\0" || network_id
                   || Norito(publisher, application_seed))
catalog_id     = H("iroha:game:equipment-catalog:v1\0" || Norito(catalog))
```

Publication requires nonzero current height, the exact native network, authenticated authority equal to publisher, an existing non-custody publisher account, and publisher ownership of the collection domain and every member NFT. Every member must currently be unreserved and match the entire native metadata commitment and length. Membership is nonempty, unique and strictly ordered by native NFT ID; reject, rather than sort, malformed input. Reject replacement, even with the same bytes. Do not offer update, deletion, role substitution or executable-install instructions.

Resolve `profile_id` in the closed compiled registry and validate that the profile accepts this opaque resource role and return policy. A publisher cannot turn an unknown profile or a Stock profile into an equipment-bearing computation. Catalog existence does not authorize custody or imply that the profile is qualified.

Retain publisher identity from publication. Later domain transfers or sale sellers do not acquire the old publisher's application namespace. The manifest and wallet pin the exact catalog ID, never a mutable latest-catalog pointer. All official SORA classes use the same network/publisher/seed-derived application ID; do not retain an opaque draft application-ID fallback.

Current native NFTs contain an ID, owner and mutable metadata; they have no immutable mint-instance or issuer identity. Catalog membership therefore means approval of exact ID plus content. It does not prove historical mint provenance or distinguish deletion/recreation with identical ID and metadata. Do not advertise that stronger guarantee without separately changing the NFT identity model.

## Exact adapter boundary

The current `game_resource_requirements_v1(manifest, participant_data)` cannot select a Touring NFT: `ClassedRaceParticipantDataV1` deliberately contains only version, class and skin. The selection is in `JoinGameSessionV1.resources`. Avoid a second NFT declaration in opaque participant bytes and avoid echoing unvalidated wallet clauses as trusted requirements.

Replace that dispatch contract with the following internal, adapter-neutral policy. These are proposed signatures, not currently callable APIs:

```rust
pub(crate) struct GameCatalogRoleV1 {
    pub catalog_id: Hash,
    pub role_id: Hash,
    pub policy: GameResourceReturnPolicyV1,
}

pub(crate) struct GameResourcePolicyV1 {
    pub roles: Vec<GameCatalogRoleV1>,
}

pub(crate) fn game_resource_policy_v1(
    manifest: &GameManifestV1,
) -> Result<GameResourcePolicyV1, ExecutionProofErrorV1>;

pub(crate) fn validate_game_catalog_role_v1(
    profile_id: &Hash,
    role_id: &Hash,
    policy: GameResourceReturnPolicyV1,
) -> Result<(), ExecutionProofErrorV1>;

pub(crate) fn validate_game_admission_v1(
    manifest: &GameManifestV1,
    admission: &GameAdmissionBodyV1,
) -> Result<(), ExecutionProofErrorV1>;

pub(crate) fn validate_game_catalog_dependencies_v1(
    world: &impl WorldReadOnly,
    network_id: &NetworkId,
    height: u64,
    manifest: &GameManifestV1,
) -> Result<(), Error>;

pub(crate) fn prepare_game_catalog_resources_v1(
    st: &StateTransaction<'_, '_>,
    session: &GameSessionRecordV1,
    participant: &GameParticipantV1,
    clauses: &[GameResourceReservationClauseV1],
) -> Result<Vec<GameResourceRequirementV1>, Error>;

pub fn verify_game_proof_for_session_v1(
    session: &GameSessionRecordV1,
    claimed: &GameOutcomeV1,
    envelope: &ExecutionProofEnvelopeV1,
) -> Result<(), ExecutionProofErrorV1>;
```

Each policy role requires exactly one resource per participant. Policy roles are unique, sorted, and bounded by the existing four-resource participant limit. This works with the current unique-role clause schema; multiple copies of one role would require a deliberate schema change. Stock returns an empty policy and requires empty clauses/records. Touring returns its one frozen parameter `catalog_id`, compiled `classed_race_equipment_role_v1()` and original-owner terminal return policy. A different game may declare a different bounded role set without introducing another lifecycle instruction.

The ledger implementation must read actual catalog, domain, NFT, account and custody maps from the same transaction/snapshot. It must not accept a participant-supplied catalog or HTTP projection as a ledger implementation. Generalize the current single-role helper's restored-record loop to exact `(slot, role_id)` membership; do not apply its one-resource `zip` loop to an arbitrary multi-role game.

Opening runs pure adapter validation and catalog dependency validation before inserting custody or a session. Joining first checks wallet-approved manifest/asset/stake and qualification, validates the participant and policy, then uses `prepare_game_catalog_resources_v1` to derive requirements only after exact membership, role, metadata, owner, namespace, network/profile and reservation checks. Match the explicit wallet clauses to those requirements; then reuse `prepare_nft_reservations_v1`. Preflight the complete projected admission and terminal record geometry before applying any movement. The existing transaction boundary must roll back a failed seat, stake or Join-plus-wager operation completely.

Starting validates the complete native admission before computing its roster commitment. The signed manifest already commits the catalog ID through canonical application parameters; the immutable WSV catalog resolves that dependency. No duplicate mutable copy of catalog terms in the session is needed. If restore must independently prove catalog publication preceded session creation, add and validate a generic `opened_at_height` in the session model in this batch; the present session has no creation height from which that ordering can be reconstructed. Do not pretend `reserved_at_height` proves publication before Open.

Restore validates the catalog's key/content, network/profile/application/role bindings and height bounds, the exact policy-to-resource set for every permanent slot, original owners, custody purpose/ID/content, reservation inverse indexes and legal common terminal height. Active resources require exact current NFT ownership/content in derived custody. Terminal records validate retained original-owner return history; subsequent sale, edits, another reservation or deletion are legitimate. The orphan-custody checks remain mandatory. Restore must receive the authenticated network and restored ledger height from its actual state context; neither is inferred from an untrusted catalog alone.

The session-level proof dispatch is necessary because the current generic history function discards resource/wager admission and projects a signed checkpoint to its unsigned body. Touring's existing `verify_classed_race_proof_for_session_v1` compares the complete retained session and accepted history. Pass it the real session. Stock can call its existing verifier through a wrapper that retains the common session identity/admission checks. Do not synthesize an incomplete Touring session, compare only a claimed hash, or substitute computation-only `verify_classed_race_proof_v1` during settlement.

Before payouts, settlement validates statement/profile/manifest/roster/dispute bindings and full history, then performs existing atomic wager/equipment release preflight and XOR payout. A standalone `VerifyExecutionProofV1` receipt still means mathematical verification only and cannot release equipment. Expiry remains available only for a legally unstarted session; an active deadline or forfeit never independently returns a kit.

## Bounded decode, metadata work and fees

Use one declared first-release Norito layout, closed JSON fields and native-origin bare/framed fixtures. Apply limits before vector/string/controller allocation, not only after a derived `Decode` or `encode().len()`. Existing helper validation is not an allocation guard.

Proposed local policy ceilings for this batch:

| Resource | Ceiling and enforcement |
| --- | --- |
| Catalog members | 1–4096; validate count before allocation/traversal |
| Canonical catalog descriptor | 1 MiB; transport framing and full ISI overhead have separately measured bounds |
| NFT/account identities | Existing native literal and encoded limits, exact parse/display identity |
| One member's canonical metadata | 64 KiB, committed as `metadata_bytes` |
| Metadata processed by one publication | 8 MiB cumulative committed lengths, checked before any live metadata hash |
| Selected participant resources | At most four, with exact compiled role set; Touring one, Stock zero |
| Decoder allocation | Explicit finite per-type aggregate budget with measured maximum-size acceptance fixtures; reject excessive nested counts before allocation |

The 64 KiB/8 MiB values are proposed deterministic equipment-policy limits, not measured validator capacity. Confirm positive boundary fixtures and charge them before adopting them. They do not change the global NFT metadata policy.

Do not allocate `nft.content.encode()` for every advertised member before checking work bounds. Current native `Json` stores immutable canonical text in `Arc<String>`; `Json::get()` borrows it in O(1), and the native serializer borrows that text through `Cow`. First bound the metadata map count and raw key/JSON-text lengths, then require an exact bounded native encoded length, then serialize through a fallible bounded writer and compare both length and digest. No JSON-tree parse or materialization is needed at this admission boundary. A tiny advertised `metadata_bytes` cannot authorize traversal of unbounded live content. Use fallible `norito::codec::encode_adaptive_into`; `Encode::encode_to` calls `expect` on writer failure and is unsuitable for an intentionally rejecting sink. A bounded outer writer alone is insufficient if nested serializers buffer whole values before their inputs are bounded. The staged [native bounded metadata helper](../output/implementation/game-equipment-metadata-v1/bounded_metadata.rs) implements this sequence and passed [nine isolated tests against retained native libraries](../output/qualification/game-equipment-metadata-v1/attempt-1/report.json). That result does not establish current primitive-source identity, actual Cargo composition or consensus admission qualification.

Meter member lookups, actual metadata traversal/hashing and retained descriptor bytes. Reserve a worst-case deterministic charge from declared bounded work before state access, and reject live data exceeding it. The current flat 32,000 Join charge and profile proof-bytes charge do not establish equipment or Touring verification cost. Measure and set those costs explicitly. The wallet approves transaction fees separately from stake/item authorization; no house fee is introduced.

## Source closure and active profile identity

Current Stock profile `c6b9b7536ca0a1d7c3f25ad67208927d36e79b5385af516cb93177a82eabc925` seals 21 source files. Touring `079cd3c2136a0fc41f58a494a8bf2183a1acc1cd32368033b1f844246e839961` seals 26. Both inventories include the complete data-model files `game.rs`, `game_resources.rs` and `execution_proofs.rs`. Stock seals its own `proof.rs`; Touring seals its admission/history/proof modules. The root execution registry, parent module exports, Core lifecycle/custody handlers, WSV and `isi/game.rs` are outside these inventories.

Consequences:

- Adding only a registry dispatch branch, a new catalog model file, an ISI and WSV hooks does not itself change Stock's current hash.
- Adding `ClassedRaceV1` to the current `ExecutionProofRelationV1::RaceV1`-only enum changes the sealed `execution_proofs.rs` and therefore **both** current profile IDs. Moving helper types into either sealed generic game model file has the same effect.
- Editing Touring's admission visibility/semantics changes Touring's hash, even if Stock is untouched. Exposing wrappers in the unsealed parent module can avoid a visibility-only change; actual new semantics must remain bound.
- Representing Touring as `RaceV1`, hardcoding an old digest for changed sources, omitting changed verifier semantics from its closure, or accepting an old ID through an alias is not acceptable.

For the first release, perform one explicit clean split before funded activation: put extensible registry descriptors/relation labels and descriptor assembly outside computation wire/verification files. For example, use a new model `execution_profiles.rs` for the registry-only descriptor and closed relation labels, with Core descriptor builders in `execution_proofs/registry.rs`. Keep canonical proof envelopes/public statements and adapter admission/transition/outcome semantics in their explicitly sealed files. Registry labels are discovery metadata; exact profile IDs, never labels, select the closed verifier implementation. Any parameters affecting acceptance must remain in the sealed descriptor/semantics even if presentation metadata moves.

That source reorganization changes today's hashes once. Regenerate identities, native exporter provenance, browser kernels, SDK fixtures and genuine proof/verification evidence for the final sources. Retain older evidence as historical artifacts only. After the split, adding an unrelated adapter/label/catalog cannot perturb an existing computation's sealed inventory. Add a regression that extends the registry with an independent adapter and confirms the existing descriptor's profile/rules/limits and verification behavior remain identical.

Do not accidentally couple a mutable funding decision to an immutable mathematical descriptor. Today `qualified` is returned by a function inside sealed Stock `proof.rs`, while registration compares the entire persisted descriptor for equality. Moving that flag outside the closure without redesign would make a later false-to-true change collide with the existing immutable WSV descriptor. Before first funded release choose one explicit contract: keep qualification fixed in each published compiled descriptor and activate only a newly qualified release profile, or separate immutable computation descriptors from native qualification/activation records keyed to exact profile IDs with an explicitly reviewed authority/policy. This batch keeps all qualification false; it must not silently mutate registered records or implement a caller-controlled activation shortcut.

Once a real session exists, its manifest/profile/catalog/admission cannot migrate. A node upgrade must still resolve every nonterminal session to its exact compiled verifier and frozen rules, or refuse that rollout. Retaining a genuinely published active relation is necessary session semantics, not permission to keep obsolete draft decoders. Since deployed session inventory is not established by this read-only review, do not assume a reset or a removal is safe. The first-release source split must precede activation or have an explicitly qualified rollout that accounts for active sessions.

## Atomic implementation and validation checklist

All native edits below need a coherent source window with DPN and other build owners. A new model module still requires editing shared `iroha_data_model/src/lib.rs`; WSV, lifecycle, gas and executor changes are shared Core changes. The running Linux snapshot and earlier proof reports do not qualify later edits. Stage independently if useful, but do not apply a partial batch or mutate sources during an active coordinated capture.

| Surface | Exact current files and required work |
| --- | --- |
| Canonical catalog wire | New `iroha_data_model/src/game_equipment.rs`; `iroha_data_model/src/lib.rs`; new bounded decoder and schema/JSON fixtures |
| Generic ISI registration | `iroha_data_model/src/isi/{game.rs,mod.rs,registry/wire_ids.rs}`; `iroha_core/src/smartcontracts/isi/mod.rs`; `iroha_core/src/executor.rs`; `iroha_executor/src/default/mod.rs` |
| Publication and ledger adapter | `iroha_core/src/smartcontracts/isi/game_equipment.rs`, made reachable from the ISI module; real same-transaction map adapter, publication preflight/apply and role validation |
| WSV and restart | `iroha_core/src/state.rs`, all World/block/transaction/view/commit/apply/serialization/accessor surfaces; `iroha_core/src/state/deserialize_world.rs`; catalog restoration before dependent sessions, with authenticated network/height context |
| Lifecycle and custody | `iroha_core/src/smartcontracts/isi/{game.rs,game_resources.rs}`; reuse `game_items.rs` and `nft_custody.rs` for atomic original-owner terminal release and orphan validation |
| Compiled adapters | `iroha_core/src/execution_proofs/{registry.rs,mod.rs}` and classed module wrappers; one coherent descriptor/source split; complete validation, genesis, generic outcome and full-session history dispatch |
| Cost | `iroha_core/src/gas.rs` plus actual admission work accounting; publication, resource Join and Touring verification measured separately |
| Query/event | `iroha_data_model/src/query/{domain_queries.rs,mod.rs,error.rs}`; `iroha_data_model/src/events/data/{game.rs,events.rs,filters.rs}`; Core singular query implementation and `smartcontracts/isi/query/ordinary_memory.rs`; schema registry consumers |
| SDK | `javascript/iroha_js/src/{noritoGameCodecs.js,game.js,transactionCodec.js}`, `game.d.ts`, package exports and query builders; bounded catalog/member codecs, identity derivation and exact wallet clauses |
| Native provenance fixtures | `iroha_data_model/tests/game_v1_codec.rs`, `javascript/iroha_js/test/fixtures/game-v1-codec.json` and focused codec/resource tests; no JS-generated bytes presented as native fixtures |
| SORA adapter consumers | `sora-cars/src/chain/{catalog.ts,races.ts,client.ts,proof.ts,inventory.ts}` and release configuration; classed manifest/participant bytes, real catalog lookup, separate Stock/Touring matching and exact temporary-item/fee preview |

Required tests before calling the batch integrated:

- Bounded binary/JSON malicious counts, duplicate/unsorted members, unknown fields/policy/profile, wrong framing, trailing bytes, maximum legitimate payload/allocation, metadata length lies and nested metadata work exhaustion.
- Publisher/domain/namespace/network/profile/role/content substitution, duplicate publication, catalog mutation rejection, domain transfer preserving publisher, wrong owner and market/wager/resource custody conflicts.
- Real native publication/lookup/event/persistence transactions; absent-catalog Open rejection; Stock empty-role acceptance and equipment rejection; Touring missing/extra/wrong-class/wrong-kit rejection. Exercise the actual qualified=false Join guard at zero and nonzero XOR without bypass.
- Direct native preflight/apply tests for successful reservations and terminal returns while release qualification remains false; label these internal tests accurately. A production positive Touring Join/settlement test is a later gate after qualification, not evidence obtained by toggling the guard.
- Failed multi-resource/Join-plus-wager rollback, competing last-seat entries, cross-session replay, original-owner terminal return on win/loss/tie/forfeit, no active deadline unlock, exact simultaneous owner/domain reference counters and duplicate payout rejection.
- Restore roundtrips and tampered forward/inverse catalog/custody/session records; missing catalogs and orphan custody rejected; legal post-return NFT mutations accepted. Verify the catalog affects the authoritative snapshot/state commitment, not only skipped read indexes.
- Complete classed proof rejection on manifest/catalog/admission/resource/wager/history changes, and genuine proof acceptance through the actual native session-level dispatcher. Retain independent computation, history and finalized-inclusion scopes.
- Focused full native model/Core/SDK builds and tests on the final source snapshot, followed by four-validator publication/admission/dispute/restart/settlement and identical state-root tests once consensus startup and profile release gates permit them.

Actual product activation still requires the class-aware lobby, wallet-approved equipment selection, proof-worker/CLI dispatch, spectators/replays and exact native profile exports. Taira finality, deployed wallet interoperability, independent cryptographic review and SoraFS publication remain separate gates. A catalog helper or synthetic retained session cannot substitute for them.
