//! Standalone source-bound Touring STARK proof, with no ledger/profile registration.
//!
//! The verifier evaluates the complete compiled AIR over the shared native DEEP-ALI/FRI
//! substrate. It reconstructs public columns and checks terminal result projection, but
//! never executes driving physics. Callers must authenticate the expected statement.

use super::super::stark::{
    aggregate_stark::{AggregateStarkDomainsV1, AggregateStarkParametersV1},
    proof_managed_note_stark::{
        PROOF_MANAGED_NOTE_STARK_GEOMETRY_DESCRIPTOR_V1, ProofManagedNoteStarkAdapterV1,
        ProofManagedNoteStarkErrorV1, ProofManagedNoteStarkProtocolV1,
        prove_proof_managed_note_stark_v1, verify_proof_managed_note_stark_v1,
    },
    transparent_stark::{
        GoldilocksDigest384V1, GoldilocksFieldV1 as F, TransparentStarkDigestContextV1,
        TransparentStarkErrorV1, TransparentTranscriptV1, goldilocks_digest384_frame_v1,
    },
};
use super::super::{error::ExecutionProofErrorV1, integer_air::field};
use super::{
    reference::{classed_race_result_v1, replay_classed_race_v1},
    staged_race_air::StagedClassedRaceAirV1,
};
use crate::execution_proofs::{game_binding, guarded::accepted_history as ah};
use crate::privacy_engines::transparent_stark::GoldilocksFp4V1 as E;
use iroha_crypto::Hash;
use iroha_data_model::{
    classed_race_v1::{
        ClassedRaceReplayV1, ClassedRaceResultV1, ClassedRaceSettlementResultV1, ClassedRaceStateV1,
    },
    execution_proofs::{
        EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1, ExecutionProofEnvelopeV1, ExecutionPublicInputsV1,
        game_bundle::GameReplayEvidenceV1,
    },
    game::{GameAdmissionBodyV1, GameManifestV1, GameSessionRecordV1},
};
use norito::codec::{Decode, Encode};

/// Canonical complete envelope bound; independent transport/ledger limits still apply.
pub const CLASSED_RACE_MAX_PROOF_BYTES_V1: usize = EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1;
/// Standalone cryptographic wire cap; all geometries are checked against the native wire bound.
pub const CLASSED_RACE_MAX_STARK_BYTES_V1: usize = 3_500_000;
const MIN_TRACE_LOG2: u8 = 13;
const MAX_TRACE_LOG2: u8 = 19;
const MAX_AIR_COLUMNS: usize = 409;
// Parameter selection is explicitly unqualified. These numbers alone are not a soundness claim.
const PROFILE: &[u8] = b"sora-cars:TouringS1:standalone:v1:wire=CLS1/1:Goldilocks-Fp4:Poseidon2-w16-r8-c8-output6:degree4:base-max409:aux-absent:trace13..19:query136:blowup3:terminal10/143:composition4:public-replay:generic-game-transcript:retained-native-history:exact-checkpoints-anchors-forced-inputs-epochs-dnf:producer-finish-range-schedule:terminal-only:one-required-kit-per-slot:no-registration:no-security-qualification";
const CONTEXT: TransparentStarkDigestContextV1 =
    TransparentStarkDigestContextV1::execution_v1(b"classed-touring-s1-proof-v1");
const DOMAINS: AggregateStarkDomainsV1 = AggregateStarkDomainsV1 {
    digest_context: CONTEXT,
    base_leaf: b"execution-classed-touring-s1-base-leaf-v1",
    base_node: b"execution-classed-touring-s1-base-node-v1",
    aux_leaf: b"execution-classed-touring-s1-aux-leaf-v1",
    aux_node: b"execution-classed-touring-s1-aux-node-v1",
    composition_leaf: b"execution-classed-touring-s1-composition-leaf-v1",
    composition_node: b"execution-classed-touring-s1-composition-node-v1",
    fri_leaf: b"execution-classed-touring-s1-fri-leaf-v1",
    fri_node: b"execution-classed-touring-s1-fri-node-v1",
    layout_label: b"execution-classed-touring-s1-layout-v1",
    base_root_label: b"execution-classed-touring-s1-base-root-v1",
    aux_root_label: b"execution-classed-touring-s1-aux-root-v1",
    composition_root_label: b"execution-classed-touring-s1-composition-root-v1",
    fri_root_label: b"execution-classed-touring-s1-fri-root-v1",
    fri_beta_label: b"execution-classed-touring-s1-fri-beta-v1",
    query_seed: b"execution-classed-touring-s1-query-seed-v1",
};

/// Exact production source inventory committed by this isolated verifier identity.
/// Dedicated test files, exports and the parent registry are excluded; no stock identity is reused.
pub(super) const CLASSED_RACE_PROFILE_SOURCES_V1: &[(&str, &[u8])] = &[
    (
        "crates/iroha_core/src/execution_proofs/game_binding.rs",
        include_bytes!("../game_binding.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_certificates.rs",
        include_bytes!("../../../../iroha_data_model/src/game_certificates.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_certificates/history.rs",
        include_bytes!("../../../../iroha_data_model/src/game_certificates/history.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_certificates/history/transcript.rs",
        include_bytes!("../../../../iroha_data_model/src/game_certificates/history/transcript.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_certificates/lifecycle.rs",
        include_bytes!("../../../../iroha_data_model/src/game_certificates/lifecycle.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_certificates/gameplay.rs",
        include_bytes!("../../../../iroha_data_model/src/game_certificates/gameplay.rs"),
    ),
    (
        "crates/iroha_data_model/src/execution_proofs/game_bundle.rs",
        include_bytes!("../../../../iroha_data_model/src/execution_proofs/game_bundle.rs"),
    ),
    (
        "crates/iroha_crypto/src/sha3_384.rs",
        include_bytes!("../../../../iroha_crypto/src/sha3_384.rs"),
    ),
    (
        "crates/iroha_crypto/src/lib.rs",
        include_bytes!("../../../../iroha_crypto/src/lib.rs"),
    ),
    (
        "crates/iroha_crypto/src/signature/mod.rs",
        include_bytes!("../../../../iroha_crypto/src/signature/mod.rs"),
    ),
    (
        "crates/iroha_crypto/src/signature/ed25519.rs",
        include_bytes!("../../../../iroha_crypto/src/signature/ed25519.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/classed_race_v1/history.rs",
        include_bytes!("history.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/classed_race_v1/admission.rs",
        include_bytes!("admission.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/classed_race_v1/proof.rs",
        include_bytes!("proof.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/classed_race_v1/reference.rs",
        include_bytes!("reference.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/classed_race_v1/rules.rs",
        include_bytes!("rules.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/classed_race_v1/environment.rs",
        include_bytes!("environment.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/classed_race_v1/environment_air.rs",
        include_bytes!("environment_air.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/classed_race_v1/race_air.rs",
        include_bytes!("race_air.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/classed_race_v1/staged_race_air.rs",
        include_bytes!("staged_race_air.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/record_binding.rs",
        include_bytes!("../record_binding.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/guarded/accepted_history.rs",
        include_bytes!("../guarded/accepted_history.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/integer_air.rs",
        include_bytes!("../integer_air.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/integer_air/weighted.rs",
        include_bytes!("../integer_air/weighted.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/checked_integer_air.rs",
        include_bytes!("../checked_integer_air.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/poseidon2.rs",
        include_bytes!("../poseidon2.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/poseidon2_constants.rs",
        include_bytes!("../poseidon2_constants.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/transparent_stark.rs",
        include_bytes!("../stark/transparent_stark.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/fft.rs",
        include_bytes!("../stark/fft.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/aggregate_stark.rs",
        include_bytes!("../stark/aggregate_stark.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark.rs",
        include_bytes!("../stark/proof_managed_note_stark.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark_deep_air.rs",
        include_bytes!("../stark/proof_managed_note_stark_deep_air.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark_execution_fixed.rs",
        include_bytes!("../stark/proof_managed_note_stark_execution_fixed.rs"),
    ),
    (
        "crates/iroha_core/src/privacy_engines/transparent_stark.rs",
        include_bytes!("../../privacy_engines/transparent_stark.rs"),
    ),
    (
        "crates/iroha_data_model/src/classed_race_v1.rs",
        include_bytes!("../../../../iroha_data_model/src/classed_race_v1.rs"),
    ),
    (
        "crates/iroha_data_model/src/game.rs",
        include_bytes!("../../../../iroha_data_model/src/game.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_retention.rs",
        include_bytes!("../../../../iroha_data_model/src/game_retention.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_resources.rs",
        include_bytes!("../../../../iroha_data_model/src/game_resources.rs"),
    ),
    (
        "crates/iroha_data_model/src/execution_proofs.rs",
        include_bytes!("../../../../iroha_data_model/src/execution_proofs.rs"),
    ),
    (
        "crates/fastpq_isi/src/params.rs",
        include_bytes!("../../../../fastpq_isi/src/params.rs"),
    ),
    (
        "crates/fastpq_isi/src/poseidon.rs",
        include_bytes!("../../../../fastpq_isi/src/poseidon.rs"),
    ),
    (
        "crates/fastpq_isi/src/poseidon_digest384.rs",
        include_bytes!("../../../../fastpq_isi/src/poseidon_digest384.rs"),
    ),
    (
        "crates/fastpq_isi/src/assets/poseidon_goldilocks_width3_v1.bin",
        include_bytes!("../../../../fastpq_isi/src/assets/poseidon_goldilocks_width3_v1.bin"),
    ),
];

/// Exact compiled source identity; this is not a registered or qualified profile descriptor.
#[must_use]
pub fn classed_race_profile_id_v1() -> Hash {
    static ID: std::sync::OnceLock<Hash> = std::sync::OnceLock::new();
    *ID.get_or_init(|| {
        let mut chunks: Vec<&[u8]> = vec![
            b"iroha:execution:classed-profile:v1\0",
            PROFILE,
            PROOF_MANAGED_NOTE_STARK_GEOMETRY_DESCRIPTOR_V1,
        ];
        for (path, bytes) in CLASSED_RACE_PROFILE_SOURCES_V1 {
            chunks.push(path.as_bytes());
            chunks.push(bytes);
        }
        Hash::new_from_chunks(&chunks)
    })
}

/// Portable public inputs to a self-hosted worker. Contains no custody signing keys.
#[derive(Clone, Debug, PartialEq, Eq, Decode, Encode)]
pub struct ClassedRaceProverRequestV1 {
    /// Complete selected record. Callers authenticate its ledger origin independently.
    pub source_record: GameSessionRecordV1,
    /// Independently selected chronology bound; excluded from proof identity.
    pub observation_height: u64,
    /// Complete accepted controls and exact retained frontier evidence.
    pub history_evidence: GameReplayEvidenceV1,
    /// Complete public controls and consensus-selected removals.
    pub replay: ClassedRaceReplayV1,
    /// Every retained pre-removal checkpoint state, in strict tick order with the selected one last.
    pub checkpoint_states: Vec<ClassedRaceStateV1>,
}

/// Complete canonical application payload inside the generic execution envelope.
#[derive(Clone, Debug, PartialEq, Eq, Decode, Encode)]
pub struct ClassedRaceProofPayloadV1 {
    /// Full accepted source inputs including controls after simulation terminal.
    pub history_evidence: GameReplayEvidenceV1,
    /// Complete accepted source frontier, independent of terminal.
    pub accepted_through_tick: u32,
    /// Exact frozen manifest.
    pub manifest: GameManifestV1,
    /// Exact bounded immutable admission facts.
    pub admission: GameAdmissionBodyV1,
    /// Public replay retained for independent availability.
    pub replay: ClassedRaceReplayV1,
    /// Claimed terminal state; every field is constrained by the final AIR boundary.
    pub final_state: ClassedRaceStateV1,
    /// Every retained pre-removal AIR boundary, ordered exactly as the selected ledger record.
    pub checkpoint_states: Vec<ClassedRaceStateV1>,
    /// Complete canonical terminal ranking, derived only from the proven final state.
    pub result: ClassedRaceResultV1,
    /// Native cryptographic wire, without alternate proof or recomputation modes.
    pub stark_bytes: Vec<u8>,
}

fn build_payload_from_request(
    request: &ClassedRaceProverRequestV1,
) -> Result<ClassedRaceProofPayloadV1, ExecutionProofErrorV1> {
    // Cheap cardinality/encoding validation precedes reference simulation and trace allocation.
    super::admission::validate_manifest(&request.source_record.manifest)?;
    ah::canonical_record_bytes(&request.source_record)
        .map_err(|_| ExecutionProofErrorV1::Envelope)?;
    ah::evidence_bounds(&request.history_evidence).map_err(|_| ExecutionProofErrorV1::Envelope)?;
    let admission = GameAdmissionBodyV1::from_session(&request.source_record);
    admission
        .validate()
        .map_err(|_| ExecutionProofErrorV1::Statement)?;
    if request.checkpoint_states.is_empty()
        || request.checkpoint_states.len()
            > (super::rules::MAX_TICKS / super::rules::BATCH_TICKS) as usize
        || request.replay.frames.len() > 5400
        || !(2..=8).contains(&request.replay.player_count)
        || request
            .replay
            .frames
            .iter()
            .any(|frame| frame.controls.len() != usize::from(request.replay.player_count))
    {
        return Err(ExecutionProofErrorV1::Replay);
    }
    let final_state =
        replay_classed_race_v1(&request.replay).map_err(|_| ExecutionProofErrorV1::Replay)?;
    let result = classed_race_result_v1(&final_state).map_err(|_| ExecutionProofErrorV1::Replay)?;
    let payload = ClassedRaceProofPayloadV1 {
        history_evidence: request.history_evidence.clone(),
        accepted_through_tick: request.source_record.next_tick,
        manifest: request.source_record.manifest.clone(),
        admission,
        replay: request.replay.clone(),
        final_state,
        checkpoint_states: request.checkpoint_states.clone(),
        result,
        stark_bytes: vec![],
    };
    Ok(payload)
}
#[cfg(test)]
fn payload_from_request(
    request: &ClassedRaceProverRequestV1,
) -> Result<(ExecutionPublicInputsV1, ClassedRaceProofPayloadV1), ExecutionProofErrorV1> {
    let payload = build_payload_from_request(request)?;
    let history = super::history::prepare_history(
        &request.source_record,
        &payload,
        request.observation_height,
    )?;
    let statement = super::history::statement_for_history(&history, &payload)?;
    super::history::validate_history_with_receipt(
        &history,
        &super::admission::outcome(&payload)?,
        &statement,
        &payload,
    )?;
    Ok((statement, payload))
}
struct ClassedRaceAdapterV1<'a> {
    statement: &'a ExecutionPublicInputsV1,
    payload: &'a ClassedRaceProofPayloadV1,
    compiled: StagedClassedRaceAirV1,
}
impl<'a> ClassedRaceAdapterV1<'a> {
    fn new(
        statement: &'a ExecutionPublicInputsV1,
        payload: &'a ClassedRaceProofPayloadV1,
    ) -> Result<Self, ExecutionProofErrorV1> {
        Self::with_history(statement, payload, None)
    }
    fn with_history(
        statement: &'a ExecutionPublicInputsV1,
        payload: &'a ClassedRaceProofPayloadV1,
        history: Option<&ah::ValidatedHistory<'_>>,
    ) -> Result<Self, ExecutionProofErrorV1> {
        super::admission::validate_payload_with_history(statement, payload, history)?;
        let compiled = StagedClassedRaceAirV1::compile(
            &payload.replay,
            &payload.final_state,
            &payload.checkpoint_states,
        )
        .map_err(|_| ExecutionProofErrorV1::Replay)?;
        if compiled.width() > MAX_AIR_COLUMNS {
            return Err(ExecutionProofErrorV1::Envelope);
        }
        Ok(Self {
            statement,
            payload,
            compiled,
        })
    }
}
impl ProofManagedNoteStarkAdapterV1 for ClassedRaceAdapterV1<'_> {
    type ProfileChallenges = ();
    fn protocol_v1(&self) -> ProofManagedNoteStarkProtocolV1 {
        ProofManagedNoteStarkProtocolV1 {
            parameters: AggregateStarkParametersV1 {
                proof_magic: *b"CLS1",
                proof_version: 1,
                security_lanes: 1,
                query_count: 136,
                blowup_log2: 3,
                terminal_log2: 10,
                terminal_degree_bound: 143,
                composition_degree_chunks: 4,
                minimum_trace_log2: MIN_TRACE_LOG2,
                maximum_trace_log2: MAX_TRACE_LOG2,
                maximum_trace_groups: 1,
                maximum_segment_instances: 1,
                maximum_base_columns_per_instance: MAX_AIR_COLUMNS,
                maximum_aux_columns_per_instance: 0,
                maximum_proof_bytes: CLASSED_RACE_MAX_STARK_BYTES_V1,
            },
            domains: DOMAINS,
            maximum_constraint_degree: 4,
            profile_binding_label: b"execution-classed-touring-s1-profile-binding-v1",
            profile_descriptor: PROFILE,
            relation_layout_domain: b"execution-classed-touring-s1-relation-layout-v1",
        }
    }
    fn public_input_digest_v1(
        &self,
    ) -> Result<GoldilocksDigest384V1, ProofManagedNoteStarkErrorV1> {
        let economic_outcome = super::admission::outcome(self.payload)
            .map_err(|error| error.into_driver_error(ProofManagedNoteStarkErrorV1::InvalidProfile))?;
        let values = [
            game_binding::canonical(self.statement, 16 << 10),
            game_binding::canonical(&self.payload.manifest, 256 << 10),
            game_binding::canonical(
                &self.payload.admission,
                iroha_data_model::game::GAME_ADMISSION_MAX_BYTES_V1,
            ),
            game_binding::canonical(&self.payload.history_evidence, 8 << 20),
            game_binding::canonical(&self.payload.accepted_through_tick, 1024),
            game_binding::canonical(&economic_outcome, 65536 + 1024),
            game_binding::canonical(&self.payload.replay, 1 << 20),
            game_binding::canonical(&self.payload.final_state, 512 << 10),
            game_binding::canonical(&self.payload.checkpoint_states, 512 << 10),
            game_binding::canonical(&self.payload.result, 65536),
        ];
        let values = values
            .into_iter()
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.into_driver_error(ProofManagedNoteStarkErrorV1::InvalidProfile))?;
        let profile = classed_race_profile_id_v1();
        let mut chunks: Vec<&[u8]> = vec![profile.as_ref()];
        chunks.extend(values.iter().map(Vec::as_slice));
        goldilocks_digest384_frame_v1(
            CONTEXT,
            b"execution-classed-touring-s1-public-statement-v1",
            b"statement",
            0,
            0,
            0,
            &chunks,
        )
        .map_err(|error| match error {
            TransparentStarkErrorV1::AllocationFailure => ProofManagedNoteStarkErrorV1::Allocation,
            _ => ProofManagedNoteStarkErrorV1::InvalidProfile,
        })
    }

    fn trace_log2_v1(&self) -> u8 {
        self.compiled.trace_size().ilog2() as u8
    }
    fn base_width_v1(&self) -> usize {
        self.compiled.width()
    }
    fn profile_aux_width_v1(&self) -> usize {
        0
    }
    fn profile_fixed_width_v1(&self) -> usize {
        self.compiled.fixed_width()
    }
    fn profile_constraint_count_v1(&self) -> usize {
        self.compiled.constraint_count()
    }
    fn profile_fixed_columns_v1(&self) -> Result<Vec<Vec<F>>, ProofManagedNoteStarkErrorV1> {
        let mut columns =
            vec![Vec::with_capacity(self.compiled.trace_size()); self.profile_fixed_width_v1()];
        for row in 0..self.compiled.trace_size() {
            for (column, value) in columns.iter_mut().zip(
                self.compiled
                    .fixed_row(row, self.compiled.trace_size())
                    .map_err(|_| ProofManagedNoteStarkErrorV1::InvalidProfile)?,
            ) {
                column.push(field(value));
            }
        }
        Ok(columns)
    }
    fn derive_profile_challenges_v1(
        &self,
        _: &mut TransparentTranscriptV1,
    ) -> Result<(), ProofManagedNoteStarkErrorV1> {
        Ok(())
    }
    fn build_profile_aux_columns_v1(
        &self,
        _: &[Vec<F>],
        _: &[Vec<F>],
        _: &(),
    ) -> Result<Vec<Vec<F>>, ProofManagedNoteStarkErrorV1> {
        Ok(vec![])
    }
    fn profile_constraint_residues_v1(
        &self,
        current: &[F],
        next: &[F],
        _: &[F],
        _: &[F],
        fixed: &[F],
        _: &(),
    ) -> Result<Vec<F>, ProofManagedNoteStarkErrorV1> {
        if current.len() != self.base_width_v1()
            || next.len() != self.base_width_v1()
            || fixed.len() != self.profile_fixed_width_v1()
        {
            return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
        }
        Ok(self.compiled.residues(current, next, fixed))
    }
    fn profile_constraint_sum_fp4_v1(
        &self,
        current: &[E],
        next: &[E],
        aux: &[E],
        next_aux: &[E],
        fixed: &[E],
        _: &(),
        alphas: &[E],
    ) -> Result<E, ProofManagedNoteStarkErrorV1> {
        if !aux.is_empty() || !next_aux.is_empty() {
            return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
        }
        self.compiled
            .weighted_residues_at_v1(current, next, fixed, alphas)
            .map_err(|error| match error {
                crate::execution_proofs::integer_air::weighted::WeightedAirErrorV1::Resource => {
                    ProofManagedNoteStarkErrorV1::Resource
                }
                crate::execution_proofs::integer_air::weighted::WeightedAirErrorV1::Allocation => {
                    ProofManagedNoteStarkErrorV1::Allocation
                }
                _ => ProofManagedNoteStarkErrorV1::InvalidTrace,
            })
    }
}

fn witness_columns(
    adapter: &ClassedRaceAdapterV1<'_>,
) -> Result<Vec<Vec<F>>, ExecutionProofErrorV1> {
    let size = adapter.compiled.trace_size();
    let mut carry = adapter.compiled.initial_carry();
    let mut columns = vec![Vec::with_capacity(size); adapter.base_width_v1()];
    for row_index in 0..size {
        let fixed = adapter
            .compiled
            .fixed_row(row_index, size)
            .map_err(|_| ExecutionProofErrorV1::Replay)?;
        let (row, next) = adapter.compiled.witness(&carry, &fixed);
        carry = next;
        for (column, value) in columns.iter_mut().zip(row) {
            column.push(value);
        }
    }
    Ok(columns)
}

/// Generate and self-verify a native Touring proof with fresh local masking entropy.
/// No ledger registry accepts this standalone source identity yet.
pub fn prove_classed_race_v1(
    request: ClassedRaceProverRequestV1,
) -> Result<ExecutionProofEnvelopeV1, ExecutionProofErrorV1> {
    let mut payload = build_payload_from_request(&request)?;
    let history = super::history::prepare_history(
        &request.source_record,
        &payload,
        request.observation_height,
    )?;
    let statement = super::history::statement_for_history(&history, &payload)?;
    super::history::validate_history_binding(
        &history,
        &super::admission::outcome(&payload)?,
        &statement,
        &payload,
    )?;
    let adapter = ClassedRaceAdapterV1::with_history(&statement, &payload, Some(&history))?;
    let columns = witness_columns(&adapter)?;
    let stark_bytes = prove_proof_managed_note_stark_v1(&adapter, &columns)?;
    drop(adapter);
    drop(history);
    payload.stark_bytes = stark_bytes;
    let envelope = ExecutionProofEnvelopeV1 {
        version: 1,
        profile_id: classed_race_profile_id_v1(),
        statement,
        proof_bytes: game_binding::canonical(&payload, CLASSED_RACE_MAX_PROOF_BYTES_V1)?,
    };
    if norito::canonical_frame_len(&envelope).map_err(|_| ExecutionProofErrorV1::Envelope)?
        > CLASSED_RACE_MAX_PROOF_BYTES_V1
    {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    verify_classed_race_proof_v1(&statement, &envelope)?;
    Ok(envelope)
}

pub(super) fn decode_payload(
    envelope: &ExecutionProofEnvelopeV1,
) -> Result<ClassedRaceProofPayloadV1, ExecutionProofErrorV1> {
    if envelope.version != 1
        || envelope.profile_id != classed_race_profile_id_v1()
        || envelope.proof_bytes.len() > CLASSED_RACE_MAX_PROOF_BYTES_V1
        || norito::canonical_frame_len(envelope).map_err(|_| ExecutionProofErrorV1::Envelope)?
            > CLASSED_RACE_MAX_PROOF_BYTES_V1
    {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    let payload: ClassedRaceProofPayloadV1 = norito::decode_canonical_with_limits(
        &envelope.proof_bytes,
        norito::DecodeLimits::new(
            CLASSED_RACE_MAX_PROOF_BYTES_V1,
            CLASSED_RACE_MAX_PROOF_BYTES_V1,
            CLASSED_RACE_MAX_PROOF_BYTES_V1 + 131072,
            64 << 20,
            64,
        ),
    )
    .map_err(|error| ExecutionProofErrorV1::received_decode(&error))?;
    if payload.stark_bytes.is_empty() || payload.stark_bytes.len() > CLASSED_RACE_MAX_STARK_BYTES_V1
    {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    Ok(payload)
}

/// Verify the full native relation against an independently authenticated session statement.
/// The expected statement must come from authenticated consensus state, never from the worker's
/// envelope. This function proves computation and commitment binding; it does not authenticate
/// ledger inclusion, NFT ownership/catalog eligibility, accepted input signatures or dispute history.
/// Those gates are required before future ledger settlement can invoke this isolated relation.
/// Returns the economic result with actual full-source removal times; `payload.result` remains
/// the distinct physical arithmetic result, whose tick is the simulation terminal time.
pub fn verify_classed_race_proof_v1(
    expected: &ExecutionPublicInputsV1,
    envelope: &ExecutionProofEnvelopeV1,
) -> Result<ClassedRaceSettlementResultV1, ExecutionProofErrorV1> {
    if &envelope.statement != expected {
        return Err(ExecutionProofErrorV1::Statement);
    }
    let payload = decode_payload(envelope)?;
    let adapter = ClassedRaceAdapterV1::new(expected, &payload)?;
    verify_proof_managed_note_stark_v1(&adapter, &payload.stark_bytes)?;
    super::admission::settlement_result(&payload)
}

#[cfg(test)]
#[path = "proof_tests.rs"]
mod tests;

// Exact decoded payload and checked source are retained through the real native verifier.
pub(super) fn verify_payload_with_history(
    statement: &ExecutionPublicInputsV1,
    payload: &ClassedRaceProofPayloadV1,
    history: &ah::ValidatedHistory<'_>,
) -> Result<ClassedRaceSettlementResultV1, ExecutionProofErrorV1> {
    let adapter = ClassedRaceAdapterV1::with_history(statement, payload, Some(history))?;
    verify_proof_managed_note_stark_v1(&adapter, &payload.stark_bytes)?;
    super::admission::settlement_result(payload)
}
