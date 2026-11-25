//! Corrected stock racing proof with eligibility-first awards and one first-release identity.
//!
//! The verifier reconstructs public controls and fixed columns, but never replays vehicle physics.
//! Transition correctness uses the bounded-integer `iroha_execution_stark` engine with
//! BLAKE2b-384 commitments and transcript. Every retained checkpoint is enforced by verifier-public
//! row selectors and expected registers. Payout admission preserves the native authenticated
//! complete source history, record binding, and consensus-selected forced controls and removals.
//! The engine enforces a 128-bit target; qualification of the composed native protocol remains off.

use super::{
    error::ExecutionProofErrorV1,
    race::{
        apply_race_dnf_v1, initial_race_state_v1, race_result_v1, replay_race_v1, step_race_v1,
    },
};
use super::{game_binding, guarded::accepted_history as ah};
use iroha_crypto::Hash;
use iroha_data_model::game_certificates::{
    GameActiveScopeV1, GameCertificateContextV1, GameStateRootV1, GameTranscriptRootV1,
};
use iroha_data_model::{
    execution_proofs::*,
    game::{
        GameAdmissionBodyV1, GameDnfEventV1, GameManifestV1, GameOutcomeV1, GamePhaseV1,
        GameTranscriptBatchV1, GameTranscriptV1,
    },
};
use iroha_execution_stark::{
    Circuit, Params, Proof, Statement,
    circuit::{Constraint, Lin, PublicColumn, Quad, Var},
    games::race_v1 as race_circuit,
    hash::{Digest as ProfileDigest, FramedHash},
};
use norito::codec::{Decode, Encode};

/// Maximum canonical execution envelope, including this adapter's complete replay.
/// This does not raise any deployment's independent transaction or transport bounds.
pub const RACE_MAX_PROOF_BYTES_V1: usize = EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1;
/// Rounded bound on the cryptographic wire alone, excluding replay and envelope.
/// The bound is checked against the exact augmented circuit on every prove and verify.
/// Qualification must additionally record generated proof sizes and resource costs.
pub const RACE_MAX_STARK_BYTES_V1: usize = 3_250_000;
const RACE_TARGET_SECURITY_BITS_V1: u16 = 128;
const RULES:&[u8]=b"iroha-race-rules-v1:ticks=30:max=8100:players=1..8:multiplayer=2..8:laps=3:batch=6:skins=6:grid-progress=-floor(slot/2)*4000:grid-x=even?-1800:1800:grid-speed=0:grid-vx=0:grid-energy=1000:controls=throttle,brake,left,right,drift,boost:boost=bit5&&energy>=25:energy=boost?-25:min(1000,+4):top=boost?3000:2400:accel=brake?-100:throttle?40:-12:speed=clamp(speed+accel,0,top):steer=right-left:vx=clamp(trunc((vx+steer*(drift?28:18))*7/8),-320,320):road-station=floor((oldProgress+100000)/5000):force=trunc(road[station]*speed*speed/16777216):x=clamp(x+vx+force,-6520,6520):abs(x)>6000=>speed=max(0,speed-90):progress+=speed:contacts=ascending-i-j,abs(dp)<3600&&abs(dx)<1800,push=ceil((1800-abs(dx))/2),low-x-or-low-slot-tie-goes-left,speed=max(0,speed-120):rails=after-contacts-x=clamp(x,-6520,6520):finish=after-contacts,progress>=3*length,clamp-and-freeze:dnf=before-exact-tick,record-key-inactivity-even-after-finish,preserve-earlier-finish-as-history-only,freeze-and-ghost:finished-ghost:terminal=(tick%6==0&&(all-finished-or-dnf||active-keys<2))||tick8100:ranking=eligible-before-all-dnf,then-finish-time,then-distance,slot-display-only:winners=eligible-earliest-finish-ties-else-sole-eligible-survivor-else-tick8100-max-eligible-progress-ties-else-all-forfeit-refund:environment=12-cell-center-floor((2i+1)*length/24):kinds-tree0-sign1-oil2:Tokyo-kinds=0,1,0,2,0,1,2,0,1,0,2,1:Harbor-kinds=1,2,0,1,0,2,1,0,2,1,0,2:Sakura-kinds=0,0,2,1,0,2,0,1,0,2,0,1:object-x=even-negative-odd-positive,magnitudes7400,5600,1800:rain-patterns=Tokyo0010,Harbor0110,Sakura0001:wind-pattern=0,1,2,1,0,-1,-2,-1:wind-strengths=Tokyo4,Harbor16,Sakura8:trees-beyond-rails-never-hit:sign-radius=1300:sign-loss=260:oil-half-length=9000:oil-half-width=1400:oil-steer=trunc(steer/2):rain-steer=trunc(steer*3/4):slippery-damping=15/16:rain-vx-limit=280:wind=trunc(public90tick8table*speed/2400):rain=public300tick4table:impact=swept-progress-before-ordered-contacts:tracks=NeonTokyo/2000000;Harbor/2400000;Sakura/1800000:roads=real-1986-roads,5000mm-stations-from-100000mm-before-the-line,sha256-of-little-endian-i16:NeonTokyo/1221/5a79b1bff09f9b38cb08eafca89c4e9c5b266a3d7da0a56908afa9319981e835;Harbor/1461/d8c6a71ec0789666bafe997a17ad69cd77d990a8e4c3189adc3d9692bf432b2f;Sakura/1101/95f0afeb280dfa4cfa8bd92ba1bcf351b3eab6e5ce18a52ffb7d91968a7a6e2a";
const PROFILE:&[u8]=b"iroha-native-execution-race-v1:wire=IEB1/1:engine=iroha_execution_stark:bounded-integer-air:goldilocks-fp4-deep-ali-fri:blake2b-384-merkle-and-transcript:digest-bytes=48:public-replay:no-masking:trace=2^13:one-row-per-tick:state=progress,x,speed,vx,energy,finished,finish-tick:dnf=public-columns:boundaries=initial,all-retained-checkpoint-public-columns,final:logup=16-bit-verifier-summed-range-table,4-lookups-per-helper:road-table=verifier-summed-fixed-table-own-challenge:blowup=8:queries=87:fri-arity=8:final-degree=16:grinding=20:round-target=129:security-target=128:envelope-max=4194304:stark-max=3250000:all-car-dynamics:all-ordered-contacts:deferred-contact-slowing:source-record=direct-execution384-canonical-record:accepted-history=complete-native-certificates";
/// Fail-closed release gate. A compiled profile is not funded until cryptographic and resource
/// qualification evidence is reviewed; development prover/verifier APIs remain directly testable.
#[must_use]
pub const fn race_profile_is_qualified_v1() -> bool {
    false
}
/// Reconstruct the sole compiled descriptor; callers cannot supply alternative circuits or bounds.
#[must_use]
pub fn compiled_race_profile_v1() -> ExecutionProofProfileV1 {
    ExecutionProofProfileV1 {
        version: 1,
        profile_id: race_profile_id_v1(),
        rules_hash: race_rules_hash_v1(),
        relation: ExecutionProofRelationV1::RaceV1,
        target_soundness_bits: 128,
        maximum_proof_bytes: RACE_MAX_PROOF_BYTES_V1 as u32,
        qualified: race_profile_is_qualified_v1(),
    }
}
/// Commitment to every immutable gameplay parameter and operation order.
#[must_use]
pub fn race_rules_hash_v1() -> Hash {
    Hash::new(RULES)
}
/// Exact repository-relative source inventory committed by the stock verifier.
/// The browser exporter uses this same inventory to reject stale native binaries even when the
/// driving arithmetic is unchanged but the public admission or proof format has changed.
/// Shared record-binding and export sources are conservatively pinned; this is not a minimal
/// dependency closure or a claim that the retired Stock driver remains active.
pub(super) const RACE_PROFILE_SOURCES_V1: &[(&str, &[u8])] = &[
    (
        "crates/iroha_core/src/execution_proofs/game_binding.rs",
        include_bytes!("game_binding.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_certificates.rs",
        include_bytes!("../../../iroha_data_model/src/game_certificates.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_certificates/history.rs",
        include_bytes!("../../../iroha_data_model/src/game_certificates/history.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_certificates/history/transcript.rs",
        include_bytes!("../../../iroha_data_model/src/game_certificates/history/transcript.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_certificates/lifecycle.rs",
        include_bytes!("../../../iroha_data_model/src/game_certificates/lifecycle.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_certificates/gameplay.rs",
        include_bytes!("../../../iroha_data_model/src/game_certificates/gameplay.rs"),
    ),
    (
        "crates/iroha_data_model/src/execution_proofs/game_bundle.rs",
        include_bytes!("../../../iroha_data_model/src/execution_proofs/game_bundle.rs"),
    ),
    (
        "crates/iroha_crypto/src/sha3_384.rs",
        include_bytes!("../../../iroha_crypto/src/sha3_384.rs"),
    ),
    (
        "crates/iroha_crypto/src/lib.rs",
        include_bytes!("../../../iroha_crypto/src/lib.rs"),
    ),
    (
        "crates/iroha_crypto/src/signature/mod.rs",
        include_bytes!("../../../iroha_crypto/src/signature/mod.rs"),
    ),
    (
        "crates/iroha_crypto/src/signature/ed25519.rs",
        include_bytes!("../../../iroha_crypto/src/signature/ed25519.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/race.rs",
        include_bytes!("race.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/environment.rs",
        include_bytes!("environment.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/environment_air.rs",
        include_bytes!("environment_air.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/integer_air.rs",
        include_bytes!("integer_air.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/integer_air/weighted.rs",
        include_bytes!("integer_air/weighted.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/race_air.rs",
        include_bytes!("race_air.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/proof.rs",
        include_bytes!("proof.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/record_binding.rs",
        include_bytes!("record_binding.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/guarded/accepted_history.rs",
        include_bytes!("guarded/accepted_history.rs"),
    ),
    (
        "crates/iroha_data_model/src/game.rs",
        include_bytes!("../../../iroha_data_model/src/game.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_retention.rs",
        include_bytes!("../../../iroha_data_model/src/game_retention.rs"),
    ),
    (
        "crates/iroha_data_model/src/game_resources.rs",
        include_bytes!("../../../iroha_data_model/src/game_resources.rs"),
    ),
    (
        "crates/iroha_data_model/src/execution_proofs.rs",
        include_bytes!("../../../iroha_data_model/src/execution_proofs.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/poseidon2.rs",
        include_bytes!("poseidon2.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/poseidon2_constants.rs",
        include_bytes!("poseidon2_constants.rs"),
    ),
    (
        "crates/iroha_core/src/privacy_engines/transparent_stark.rs",
        include_bytes!("../privacy_engines/transparent_stark.rs"),
    ),
    (
        "crates/fastpq_isi/src/params.rs",
        include_bytes!("../../../fastpq_isi/src/params.rs"),
    ),
    (
        "crates/fastpq_isi/src/poseidon.rs",
        include_bytes!("../../../fastpq_isi/src/poseidon.rs"),
    ),
    (
        "crates/fastpq_isi/src/poseidon_digest384.rs",
        include_bytes!("../../../fastpq_isi/src/poseidon_digest384.rs"),
    ),
    (
        "crates/fastpq_isi/src/assets/poseidon_goldilocks_width3_v1.bin",
        include_bytes!("../../../fastpq_isi/src/assets/poseidon_goldilocks_width3_v1.bin"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/transparent_stark.rs",
        include_bytes!("stark/transparent_stark.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/fft.rs",
        include_bytes!("stark/fft.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/aggregate_stark.rs",
        include_bytes!("stark/aggregate_stark.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark.rs",
        include_bytes!("stark/proof_managed_note_stark.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark_deep_air.rs",
        include_bytes!("stark/proof_managed_note_stark_deep_air.rs"),
    ),
    (
        "crates/iroha_core/src/execution_proofs/stark/proof_managed_note_stark_execution_fixed.rs",
        include_bytes!("stark/proof_managed_note_stark_execution_fixed.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/lib.rs",
        include_bytes!("../../../iroha_execution_stark/src/lib.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/air.rs",
        include_bytes!("../../../iroha_execution_stark/src/air.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/circuit.rs",
        include_bytes!("../../../iroha_execution_stark/src/circuit.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/field.rs",
        include_bytes!("../../../iroha_execution_stark/src/field.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/fri.rs",
        include_bytes!("../../../iroha_execution_stark/src/fri.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/hash.rs",
        include_bytes!("../../../iroha_execution_stark/src/hash.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/merkle.rs",
        include_bytes!("../../../iroha_execution_stark/src/merkle.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/ntt.rs",
        include_bytes!("../../../iroha_execution_stark/src/ntt.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/params.rs",
        include_bytes!("../../../iroha_execution_stark/src/params.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/proof.rs",
        include_bytes!("../../../iroha_execution_stark/src/proof.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/prover.rs",
        include_bytes!("../../../iroha_execution_stark/src/prover.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/trace.rs",
        include_bytes!("../../../iroha_execution_stark/src/trace.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/transcript.rs",
        include_bytes!("../../../iroha_execution_stark/src/transcript.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/verifier.rs",
        include_bytes!("../../../iroha_execution_stark/src/verifier.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/games/mod.rs",
        include_bytes!("../../../iroha_execution_stark/src/games/mod.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/games/race_v1.rs",
        include_bytes!("../../../iroha_execution_stark/src/games/race_v1.rs"),
    ),
    (
        "crates/iroha_execution_stark/src/games/race_v1_roads.rs",
        include_bytes!("../../../iroha_execution_stark/src/games/race_v1_roads.rs"),
    ),
];
/// Commitment to the complete frozen RaceV1 verifier and native outcome semantics.
///
/// The source commitment binds the compiled transition, outcome and verifier implementation.
/// This first release has one implementation; obsolete development drafts have no dispatch entry.
/// The registry and exporters are outside the commitment so unrelated compiled relations do not
/// change this identity. Any change to these committed sources produces a different profile ID.
#[must_use]
pub fn race_profile_id_v1() -> Hash {
    static ID: std::sync::OnceLock<Hash> = std::sync::OnceLock::new();
    *ID.get_or_init(|| {
        let mut chunks: Vec<&[u8]> =
            vec![b"iroha:execution:profile:v1\0".as_slice(), PROFILE, RULES];
        chunks.extend(RACE_PROFILE_SOURCES_V1.iter().map(|(_, bytes)| *bytes));
        Hash::new_from_chunks(&chunks)
    })
}
/// Full-strength commitment to the compiled profile: the descriptor, the rules and every committed
/// source with its path, as length-framed items under the engine's BLAKE2b-384 suite. The 255-bit
/// ledger identifier `race_profile_id_v1` stays the registry and envelope key; every proof
/// statement also binds this commitment.
fn race_profile_commitment_v1() -> ProfileDigest {
    static COMMITMENT: std::sync::OnceLock<ProfileDigest> = std::sync::OnceLock::new();
    *COMMITMENT.get_or_init(|| profile_commitment(PROFILE, RULES, RACE_PROFILE_SOURCES_V1))
}

fn profile_commitment(profile: &[u8], rules: &[u8], sources: &[(&str, &[u8])]) -> ProfileDigest {
    let mut hasher = FramedHash::new(b"iroha:execution:race-v1:profile-commitment:v1");
    hasher.update(profile);
    hasher.update(rules);
    hasher.update(&(sources.len() as u64).to_le_bytes());
    for (path, bytes) in sources {
        hasher.update(path.as_bytes());
        hasher.update(bytes);
    }
    hasher.finalize()
}
/// Complete scoped accepted input commitment, retaining unused source controls.
pub fn race_transcript_root_v1(
    context: &GameCertificateContextV1,
    scope: GameActiveScopeV1,
    player_count: u8,
    through_tick: u32,
    transcript: &GameTranscriptV1,
) -> Result<GameTranscriptRootV1, ExecutionProofErrorV1> {
    game_binding::transcript(
        context,
        scope,
        iroha_data_model::game_certificates::history::GameTranscriptGeometryV1 {
            batch_ticks: 6,
            max_ticks: RACE_MAX_TICKS_V1,
            slots: player_count,
            max_input_bytes: 12,
        },
        through_tick,
        transcript,
    )
}
/// Convert the application replay to the generic, opaque canonical session transcript.
#[must_use]
pub fn race_game_transcript_v1(replay: &RaceReplayV1) -> GameTranscriptV1 {
    GameTranscriptV1 {
        batches: replay
            .frames
            .chunks(6)
            .map(|frames| {
                let start_tick = frames[0].tick;
                GameTranscriptBatchV1 {
                    start_tick,
                    inputs: (0..replay.player_count)
                        .map(|slot| {
                            if replay.dnf_events.iter().any(|event| {
                                event.tick <= start_tick && event.slots.contains(&slot)
                            }) {
                                vec![]
                            } else {
                                frames
                                    .iter()
                                    .flat_map(|frame| {
                                        frame.controls[usize::from(slot)].to_le_bytes()
                                    })
                                    .collect()
                            }
                        })
                        .collect(),
                }
            })
            .collect(),
        dnf_events: replay
            .dnf_events
            .iter()
            .map(|event| GameDnfEventV1 {
                tick: event.tick,
                slots: event.slots.clone(),
            })
            .collect(),
    }
}
/// Exact canonical adapter state under the frozen generic scope.
pub fn race_state_root_v1(
    context: &GameCertificateContextV1,
    scope: GameActiveScopeV1,
    state: &RaceStateV1,
) -> Result<GameStateRootV1, ExecutionProofErrorV1> {
    game_binding::state(context, scope, state.tick, state)
}

/// Validate application-neutral manifest bounds against its exact compiled relation.
pub(crate) fn validate_race_manifest_v1(
    manifest: &GameManifestV1,
) -> Result<(), ExecutionProofErrorV1> {
    if manifest.version != 1
        || manifest.profile_id != race_profile_id_v1()
        || manifest.min_participants != 2
        || !(2..=8).contains(&manifest.max_participants)
        || manifest.batch_ticks != 6
        || manifest.max_ticks != RACE_MAX_TICKS_V1
        || manifest.max_input_bytes != 12
        || manifest.max_participant_data_bytes != 1
    {
        return Err(ExecutionProofErrorV1::Statement);
    }
    decode_track(manifest)?;
    Ok(())
}
fn decode_track(manifest: &GameManifestV1) -> Result<RaceTrackV1, ExecutionProofErrorV1> {
    let mut bytes = manifest.application_parameters.as_slice();
    let track = RaceTrackV1::decode(&mut bytes).map_err(|_| ExecutionProofErrorV1::Statement)?;
    if !bytes.is_empty() || track.encode() != manifest.application_parameters {
        return Err(ExecutionProofErrorV1::Statement);
    }
    Ok(track)
}
/// Validate opaque application participant data through the compiled adapter.
pub(crate) fn validate_race_participant_v1(
    manifest: &GameManifestV1,
    data: &[u8],
) -> Result<(), ExecutionProofErrorV1> {
    validate_race_manifest_v1(manifest)?;
    if data.len() != 1 || data[0] >= RACE_SKIN_COUNT_V1 {
        return Err(ExecutionProofErrorV1::Statement);
    }
    Ok(())
}
/// Validate the complete immutable admission projection before constructing any AIR trace.
/// Stock racing accepts cosmetic data only; resource-enabled adapters need their own compiled
/// relation and exact entitlement checks. NFT metadata never chooses stock physics parameters.
fn validate_race_admission_v1(
    manifest: &GameManifestV1,
    admission: &GameAdmissionBodyV1,
    player_count: u8,
) -> Result<(), ExecutionProofErrorV1> {
    admission
        .validate()
        .map_err(ExecutionProofErrorV1::admission)?;
    if admission.participants.len() != usize::from(player_count)
        || player_count < manifest.min_participants
        || player_count > manifest.max_participants
        || !admission.resources.is_empty()
    {
        return Err(ExecutionProofErrorV1::Statement);
    }
    for participant in &admission.participants {
        validate_race_participant_v1(manifest, &participant.application_data)?;
    }
    Ok(())
}
/// Validate opaque input batches through the compiled adapter, before accepting commitments/reveals.
pub(crate) fn validate_race_input_v1(
    manifest: &GameManifestV1,
    input: &[u8],
) -> Result<(), ExecutionProofErrorV1> {
    validate_race_manifest_v1(manifest)?;
    if input.len() != 12
        || input
            .chunks_exact(2)
            .any(|bytes| u16::from_le_bytes([bytes[0], bytes[1]]) & !RACE_CONTROL_MASK_V1 != 0)
    {
        return Err(ExecutionProofErrorV1::Replay);
    }
    Ok(())
}
/// Compute the compiled application's prescribed initial state commitment.
pub(crate) fn initial_race_manifest_state_root_v1(
    context: &GameCertificateContextV1,
    scope: GameActiveScopeV1,
    manifest: &GameManifestV1,
    player_count: u8,
) -> Result<GameStateRootV1, ExecutionProofErrorV1> {
    validate_race_manifest_v1(manifest)?;
    if player_count < 2 || player_count > manifest.max_participants {
        return Err(ExecutionProofErrorV1::Replay);
    }
    let state = initial_race_state_v1(decode_track(manifest)?, player_count)
        .map_err(|_| ExecutionProofErrorV1::Replay)?;
    race_state_root_v1(context, scope, &state)
}
/// Economic result from a proved physical state and the complete accepted source frontier.
pub(super) fn race_game_outcome_v1(
    state: &RaceStateV1,
    through_tick: u32,
    transcript: &GameTranscriptV1,
) -> Result<GameOutcomeV1, ExecutionProofErrorV1> {
    let physical = race_result_v1(state).map_err(|_| ExecutionProofErrorV1::Replay)?;
    let (standings, winners) = game_binding::racing_settlement(
        through_tick,
        RACE_MAX_TICKS_V1,
        state.tick,
        transcript,
        physical
            .standings
            .iter()
            .map(|s| game_binding::EconomicStanding {
                slot: s.slot,
                finish_tick: s.finish_tick,
                dnf_tick: s.dnf_tick,
                progress_mm: s.progress_mm,
            })
            .collect(),
    )?;
    let result = RaceSettlementResultV1 {
        physical_terminal_tick: state.tick,
        accepted_through_tick: through_tick,
        standings: standings
            .into_iter()
            .map(|s| RaceSettlementStandingV1 {
                slot: s.slot,
                finish_tick: s.finish_tick,
                dnf_tick: s.dnf_tick,
                progress_mm: s.progress_mm,
            })
            .collect(),
        winners,
    };
    Ok(GameOutcomeV1 {
        terminal_tick: state.tick,
        winner_slots: result.winners.clone(),
        result: game_binding::canonical(
            &result,
            iroha_data_model::game_certificates::lifecycle::GAME_OUTCOME_MAX_RESULT_BYTES_V1,
        )?,
    })
}
fn accepted_race_history<'a>(
    session: &'a iroha_data_model::game::GameSessionRecordV1,
    terminal: u32,
    evidence: &'a ah::Evidence,
    observation_height: u64,
) -> Result<ah::ValidatedHistory<'a>, ExecutionProofErrorV1> {
    let cert = game_binding::retained(session)?;
    let genesis = initial_race_manifest_state_root_v1(
        cert.context(),
        cert.scope(),
        &session.manifest,
        session.participants.len() as u8,
    )?;
    let policy = ah::Policy {
        application_id: session.manifest.application_id,
        profile_id: race_profile_id_v1(),
        compiled_relation: race_rules_hash_v1(),
        genesis_state_root: genesis,
    };
    ah::validate(
        session,
        &ah::ObservationContext {
            height: observation_height,
        },
        &policy,
        terminal,
        evidence,
        |input| {
            validate_race_input_v1(&session.manifest, input).map_err(|error| match error {
                ExecutionProofErrorV1::Aborted(abort) => ah::Error::Aborted(abort),
                _ => ah::Error::Input("Stock complete batch"),
            })
        },
        |_session, _policy, _certificates, _full| Ok(()),
    )
    .map_err(|error| {
        error.local_abort().map_or(
            ExecutionProofErrorV1::History,
            ExecutionProofErrorV1::Aborted,
        )
    })
}
/// Match every public AIR state to the exact ledger-owned checkpoint sequence.
/// A self-consistent supplied record still requires independent ledger authentication.
fn validate_checkpoint_states(
    history: &ah::ValidatedHistory<'_>,
    cert: &iroha_data_model::game_certificates::lifecycle::GameSessionCertificateContextV1,
    states: &[RaceStateV1],
) -> Result<(), ExecutionProofErrorV1> {
    let anchors = history.state_checkpoints().collect::<Vec<_>>();
    if anchors.len() != states.len() {
        return Err(ExecutionProofErrorV1::History);
    }
    for (index, (anchor, state)) in anchors.iter().zip(states).enumerate() {
        race_result_v1(state).map_err(|_| ExecutionProofErrorV1::History)?;
        let terminal = state.tick == RACE_MAX_TICKS_V1
            || (state.tick % 6 == 0
                && (state
                    .cars
                    .iter()
                    .all(|car| car.finish_tick.is_some() || car.dnf_tick.is_some())
                    || state
                        .cars
                        .iter()
                        .filter(|car| car.dnf_tick.is_none())
                        .count()
                        < 2));
        let expected_terminal = index + 1 == anchors.len() && history.checkpoint().terminal;
        if state.tick != anchor.tick
            || terminal != expected_terminal
            || race_state_root_v1(cert.context(), cert.scope(), state)? != anchor.state_root
        {
            return Err(ExecutionProofErrorV1::History);
        }
    }
    Ok(())
}

fn prepare_prover_source_v1(
    request: &RaceProverRequestV1,
) -> Result<ah::ValidatedHistory<'_>, ExecutionProofErrorV1> {
    if request.replay.frames.len() > RACE_MAX_TICKS_V1 as usize
        || request.replay.player_count < 2
        || request.replay.player_count > RACE_MAX_PLAYERS_V1
        || request
            .replay
            .frames
            .iter()
            .any(|frame| frame.controls.len() != usize::from(request.replay.player_count))
        || request.replay.dnf_events.len() > RACE_MAX_PLAYERS_V1 as usize
        || request
            .replay
            .dnf_events
            .iter()
            .any(|event| event.slots.len() > RACE_MAX_PLAYERS_V1 as usize)
        || request.checkpoint_states.is_empty()
        || request.checkpoint_states.len() > RACE_MAX_TICKS_V1 as usize / 6
        || request
            .checkpoint_states
            .iter()
            .any(|state| state.cars.len() > RACE_MAX_PLAYERS_V1 as usize)
    {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    let record = &request.source_record;
    ah::evidence_bounds(&request.history_evidence).map_err(|_| ExecutionProofErrorV1::Envelope)?;
    super::guarded::accepted_history::canonical_record_bytes(record)
        .map_err(|_| ExecutionProofErrorV1::Envelope)?;
    if request.encoded_len() > EXECUTION_PROVER_MAX_REQUEST_BYTES_V1 {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    // Metadata inspects original-owner slots, so validate their exact admission
    // geometry before any settled-item or payout indexing.
    validate_race_manifest_v1(&record.manifest)?;
    let admission = GameAdmissionBodyV1::from_session(record);
    validate_race_admission_v1(&record.manifest, &admission, request.replay.player_count)?;
    if matches!(record.phase, GamePhaseV1::Lobby | GamePhaseV1::Cancelled)
        || record.profile_id != race_profile_id_v1()
        || record.manifest.profile_id != record.profile_id
        || request.replay.frames.len() > record.next_tick as usize
        || record.next_tick > record.manifest.max_ticks
    {
        return Err(ExecutionProofErrorV1::History);
    }
    let history = accepted_race_history(
        record,
        request.replay.frames.len() as u32,
        &request.history_evidence,
        request.observation_height,
    )?;
    let certificates = game_binding::retained(record)?;
    validate_checkpoint_states(&history, &certificates, &request.checkpoint_states)?;
    Ok(history)
}

#[cfg(test)]
mod road_rules_tests {
    use sha2::{Digest, Sha256};

    /// The rules string names every real road's exact table, so the rules hash and profile ID bind the
    /// roads the circuit and the reference simulation read.
    #[test]
    fn rules_commit_to_every_road_table() {
        let rules = std::str::from_utf8(super::RULES).expect("ASCII rules");
        for (name, road) in [
            ("NeonTokyo", &iroha_execution_stark::games::race_v1_roads::NEON_TOKYO[..]),
            ("Harbor", &iroha_execution_stark::games::race_v1_roads::HARBOR[..]),
            ("Sakura", &iroha_execution_stark::games::race_v1_roads::SAKURA[..]),
        ] {
            let bytes: Vec<u8> = road.iter().flat_map(|k| k.to_le_bytes()).collect();
            let entry = format!("{name}/{}/{:x}", road.len(), Sha256::digest(&bytes));
            assert!(rules.contains(&entry), "rules must name {entry}");
        }
        assert!(rules.contains(":max=8100:"));
    }
}

#[cfg(test)]
fn validate_prover_source_v1(request: &RaceProverRequestV1) -> Result<(), ExecutionProofErrorV1> {
    prepare_prover_source_v1(request).map(|_| ())
}

#[cfg(test)]
fn statement_for_request_v1(
    request: &RaceProverRequestV1,
    payload: &RaceProofPayloadV1,
) -> Result<ExecutionPublicInputsV1, ExecutionProofErrorV1> {
    statement_for_record_v1(&request.source_record, payload)
}
fn checked_payload_root(
    history: &ah::ValidatedHistory<'_>,
    payload: &RaceProofPayloadV1,
) -> Result<GameTranscriptRootV1, ExecutionProofErrorV1> {
    if history.evidence() != &payload.history_evidence
        || history.session().manifest != payload.manifest
        || history.session().next_tick != payload.accepted_through_tick
        || GameAdmissionBodyV1::from_session(history.session()) != payload.admission
        || history.terminal() != payload.final_state.tick
    {
        return Err(ExecutionProofErrorV1::History);
    }
    Ok(history.accepted_transcript_root())
}
fn statement_for_history_v1(
    history: &ah::ValidatedHistory<'_>,
    payload: &RaceProofPayloadV1,
) -> Result<ExecutionPublicInputsV1, ExecutionProofErrorV1> {
    let record = history.session();
    let certificates = history.certificates();
    let scope = certificates.scope();
    Ok(ExecutionPublicInputsV1 {
        network_id: record.network_id,
        session_id: record.session_id,
        source_record_binding: super::record_binding::execution_record_binding_v1(record)?,
        manifest_commitment: scope.manifest,
        admission_commitment: scope.admission,
        transcript_root: checked_payload_root(history, payload)?,
        dispute_commitment: record.dispute_commitment,
        outcome_commitment: game_binding::outcome(certificates.context(), scope, &payload.outcome)?,
    })
}
#[cfg(test)]
fn statement_for_record_v1(
    record: &iroha_data_model::game::GameSessionRecordV1,
    payload: &RaceProofPayloadV1,
) -> Result<ExecutionPublicInputsV1, ExecutionProofErrorV1> {
    let certificates = game_binding::retained(record)?;
    let scope = certificates.scope();
    Ok(ExecutionPublicInputsV1 {
        network_id: record.network_id,
        session_id: record.session_id,
        source_record_binding: super::record_binding::execution_record_binding_v1(record)?,
        manifest_commitment: scope.manifest,
        admission_commitment: scope.admission,
        transcript_root: race_transcript_root_v1(
            certificates.context(),
            scope,
            record.participants.len() as u8,
            record.next_tick,
            &payload.history_evidence.transcript,
        )?,
        dispute_commitment: record.dispute_commitment,
        outcome_commitment: game_binding::outcome(certificates.context(), scope, &payload.outcome)?,
    })
}

fn prepared_payload_from_request_v1(
    request: &RaceProverRequestV1,
) -> Result<(RaceProofPayloadV1, ah::ValidatedHistory<'_>), ExecutionProofErrorV1> {
    let history = prepare_prover_source_v1(request)?;
    let final_state = replay_race_v1(&request.replay).map_err(|_| ExecutionProofErrorV1::Replay)?;
    let outcome = race_game_outcome_v1(
        &final_state,
        request.source_record.next_tick,
        &request.history_evidence.transcript,
    )?;
    if request
        .source_record
        .result
        .as_ref()
        .is_some_and(|retained| retained != &outcome)
    {
        return Err(ExecutionProofErrorV1::Statement);
    }
    let certificates = game_binding::retained(&request.source_record)?;
    let relation_inputs = RacePublicInputsV1 {
        network_id: request.source_record.network_id,
        race_id: request.source_record.session_id,
        admission_commitment: certificates.scope().admission,
        rules_hash: race_rules_hash_v1(),
        track: request.replay.track,
        transcript_root: history.accepted_transcript_root(),
        dispute_commitment: request.source_record.dispute_commitment,
        result: race_result_v1(&final_state).map_err(|_| ExecutionProofErrorV1::Replay)?,
    };
    Ok((
        RaceProofPayloadV1 {
            history_evidence: request.history_evidence.clone(),
            accepted_through_tick: request.source_record.next_tick,
            manifest: request.source_record.manifest.clone(),
            admission: GameAdmissionBodyV1::from_session(&request.source_record),
            outcome,
            relation_inputs,
            replay: request.replay.clone(),
            final_state,
            checkpoint_states: request.checkpoint_states.clone(),
            stark_bytes: vec![],
        },
        history,
    ))
}
#[cfg(test)]
fn race_payload_from_request_v1(
    request: &RaceProverRequestV1,
) -> Result<RaceProofPayloadV1, ExecutionProofErrorV1> {
    prepared_payload_from_request_v1(request).map(|(payload, _)| payload)
}
/// Verify a compiled execution envelope and return only the adapter-authenticated generic outcome.
pub(crate) fn verify_race_outcome_v1(
    envelope: &ExecutionProofEnvelopeV1,
) -> Result<GameOutcomeV1, ExecutionProofErrorV1> {
    let payload = decode_payload(envelope)?;
    let adapter = RaceAdapterV1::new(&envelope.statement, &payload)?;
    adapter.verify()?;
    Ok(payload.outcome)
}

fn validate_payload_with_history(
    statement: &ExecutionPublicInputsV1,
    payload: &RaceProofPayloadV1,
    history: Option<&ah::ValidatedHistory<'_>>,
) -> Result<(), ExecutionProofErrorV1> {
    ah::evidence_bounds(&payload.history_evidence).map_err(|_| ExecutionProofErrorV1::Envelope)?;
    super::record_binding::validate_binding_v1(&statement.source_record_binding)?;
    validate_race_manifest_v1(&payload.manifest)?;
    validate_race_admission_v1(
        &payload.manifest,
        &payload.admission,
        payload.replay.player_count,
    )?;
    if payload.replay.player_count < 2
        || payload.replay.player_count > 8
        || payload.replay.frames.len() > RACE_MAX_TICKS_V1 as usize
        || payload
            .replay
            .frames
            .iter()
            .any(|frame| frame.controls.len() != usize::from(payload.replay.player_count))
    {
        return Err(ExecutionProofErrorV1::Replay);
    }
    let relation = &payload.relation_inputs;
    let expected_outcome = race_game_outcome_v1(
        &payload.final_state,
        payload.accepted_through_tick,
        &payload.history_evidence.transcript,
    )?;
    let context = game_binding::context(&statement.network_id, statement.session_id);
    let scope = game_binding::scope(&context, &payload.manifest, &payload.admission)?;
    if statement.network_id != relation.network_id
        || statement.session_id != relation.race_id
        || statement.admission_commitment != relation.admission_commitment
        || statement.admission_commitment != scope.admission
        || statement.transcript_root != relation.transcript_root
        || statement.dispute_commitment != relation.dispute_commitment
        || statement.manifest_commitment != scope.manifest
        || statement.outcome_commitment != game_binding::outcome(&context, scope, &payload.outcome)?
        || payload.outcome != expected_outcome
        || payload.replay.track != decode_track(&payload.manifest)?
        || payload.replay.player_count > payload.manifest.max_participants
    {
        return Err(ExecutionProofErrorV1::Statement);
    }
    let replay = &payload.replay;
    game_binding::racing_projection(
        payload.accepted_through_tick,
        payload.manifest.max_ticks,
        usize::from(replay.player_count),
        payload.final_state.tick,
        &payload.history_evidence.transcript,
        replay
            .frames
            .iter()
            .map(|f| (f.tick, f.controls.as_slice())),
        replay
            .dnf_events
            .iter()
            .map(|e| (e.tick, e.slots.as_slice())),
        RACE_CONTROL_MASK_V1,
    )?;
    let final_state = &payload.final_state;
    if !(1..=8).contains(&replay.player_count)
        || replay.frames.len() > RACE_MAX_TICKS_V1 as usize
        || replay.frames.iter().enumerate().any(|(tick, frame)| {
            frame.tick != tick as u32
                || frame.controls.len() != usize::from(replay.player_count)
                || frame
                    .controls
                    .iter()
                    .any(|control| control & !RACE_CONTROL_MASK_V1 != 0)
        })
        || replay
            .dnf_events
            .windows(2)
            .any(|events| events[0].tick >= events[1].tick)
        || replay.dnf_events.iter().any(|event| {
            event.tick > replay.frames.len() as u32
                || event.tick % 6 != 0
                || event.slots.is_empty()
                || event.slots.windows(2).any(|slots| slots[0] >= slots[1])
                || event.slots.iter().any(|slot| *slot >= replay.player_count)
        })
        || final_state.tick % 6 != 0
        || final_state.cars.len() != usize::from(replay.player_count)
        || final_state.track != replay.track
        || final_state.tick != replay.frames.len() as u32
        || (final_state.tick != RACE_MAX_TICKS_V1
            && final_state
                .cars
                .iter()
                .filter(|car| car.dnf_tick.is_none())
                .count()
                >= 2
            && !final_state
                .cars
                .iter()
                .all(|car| car.finish_tick.is_some() || car.dnf_tick.is_some()))
    {
        return Err(ExecutionProofErrorV1::Replay);
    }
    let mut removed = [false; 8];
    for event in &replay.dnf_events {
        for slot in &event.slots {
            if std::mem::replace(&mut removed[usize::from(*slot)], true) {
                return Err(ExecutionProofErrorV1::Replay);
            }
        }
    }
    if replay.frames.iter().any(|frame| {
        replay
            .dnf_events
            .iter()
            .filter(|event| event.tick <= frame.tick)
            .any(|event| {
                event
                    .slots
                    .iter()
                    .any(|slot| frame.controls[usize::from(*slot)] != 0)
            })
    }) {
        return Err(ExecutionProofErrorV1::Replay);
    }
    if relation.rules_hash != race_rules_hash_v1()
        || relation.track != replay.track
        || relation.transcript_root
            != if let Some(history) = history {
                if statement.network_id != history.session().network_id
                    || statement.session_id != history.session().session_id
                {
                    return Err(ExecutionProofErrorV1::History);
                }
                checked_payload_root(history, payload)?
            } else {
                race_transcript_root_v1(
                    &context,
                    scope,
                    payload.replay.player_count,
                    payload.accepted_through_tick,
                    &payload.history_evidence.transcript,
                )?
            }
        || relation.result
            != race_result_v1(final_state).map_err(|_| ExecutionProofErrorV1::Replay)?
    {
        return Err(ExecutionProofErrorV1::Statement);
    }
    if payload.checkpoint_states.is_empty()
        || payload.checkpoint_states.len() > RACE_MAX_TICKS_V1 as usize / 6
        || payload
            .checkpoint_states
            .windows(2)
            .any(|pair| pair[0].tick >= pair[1].tick)
    {
        return Err(ExecutionProofErrorV1::Replay);
    }
    for checkpoint in &payload.checkpoint_states {
        if checkpoint.tick > final_state.tick
            || checkpoint.track != replay.track
            || checkpoint.cars.len() != final_state.cars.len()
        {
            return Err(ExecutionProofErrorV1::Replay);
        }
        race_result_v1(checkpoint).map_err(|_| ExecutionProofErrorV1::Replay)?;
    }
    Ok(())
}

#[cfg(test)]
fn validate_payload(
    statement: &ExecutionPublicInputsV1,
    payload: &RaceProofPayloadV1,
) -> Result<(), ExecutionProofErrorV1> {
    validate_payload_with_history(statement, payload, None)
}

fn engine_track(track: RaceTrackV1) -> race_circuit::Track {
    match track {
        RaceTrackV1::NeonTokyo => race_circuit::Track::NeonTokyo,
        RaceTrackV1::Harbor => race_circuit::Track::Harbor,
        RaceTrackV1::Sakura => race_circuit::Track::Sakura,
    }
}

fn engine_replay(replay: &RaceReplayV1) -> race_circuit::Replay {
    race_circuit::Replay {
        track: engine_track(replay.track),
        players: usize::from(replay.player_count),
        frames: replay
            .frames
            .iter()
            .map(|frame| frame.controls.clone())
            .collect(),
        dnf_events: replay
            .dnf_events
            .iter()
            .map(|event| (event.tick, event.slots.clone()))
            .collect(),
    }
}

/// Circuit registers of a state, in `race_circuit::registers` order. Removals are public columns.
fn engine_registers(state: &RaceStateV1) -> Vec<i64> {
    state
        .cars
        .iter()
        .flat_map(|car| {
            [
                car.progress_mm,
                i64::from(car.lateral_mm),
                i64::from(car.speed_mm_per_tick),
                i64::from(car.lateral_velocity_mm_per_tick),
                i64::from(car.boost_energy),
                i64::from(car.finish_tick.is_some()),
                i64::from(car.finish_tick.unwrap_or(0)),
            ]
        })
        .collect()
}

/// Removal ticks must match the public schedule exactly: the final state records every removal
/// (those at the last tick included) and a checkpoint records those strictly before its tick.
fn removals_match_states(payload: &RaceProofPayloadV1) -> bool {
    let removed = race_circuit::removal_ticks(&engine_replay(&payload.replay));
    payload.final_state.cars.len() == removed.len()
        && payload
            .final_state
            .cars
            .iter()
            .zip(&removed)
            .all(|(car, tick)| car.dnf_tick == *tick)
        && payload.checkpoint_states.iter().all(|checkpoint| {
            checkpoint.cars.len() == removed.len()
                && checkpoint
                    .cars
                    .iter()
                    .zip(&removed)
                    .all(|(car, tick)| car.dnf_tick == tick.filter(|tick| *tick < checkpoint.tick))
        })
}

/// Canonical raw binding preserves every native statement and accepted-history field.
/// The engine hashes these framed bytes directly, including a full 384-bit compiled source pin.
fn engine_binding(
    statement: &ExecutionPublicInputsV1,
    payload: &RaceProofPayloadV1,
) -> Result<Vec<u8>, ExecutionProofErrorV1> {
    let values = [
        game_binding::canonical(statement, 16 << 10),
        game_binding::canonical(&payload.manifest, 256 << 10),
        game_binding::canonical(
            &payload.admission,
            iroha_data_model::game::GAME_ADMISSION_MAX_BYTES_V1,
        ),
        game_binding::canonical(&payload.history_evidence, 8 << 20),
        game_binding::canonical(&payload.accepted_through_tick, 1024),
        game_binding::canonical(&payload.outcome, 65536 + 1024),
        game_binding::canonical(&payload.relation_inputs, 512 << 10),
        game_binding::canonical(&payload.replay, 1 << 20),
        game_binding::canonical(&payload.final_state, 512 << 10),
        game_binding::canonical(&payload.checkpoint_states, 512 << 10),
    ]
    .into_iter()
    .collect::<Result<Vec<_>, _>>()?;
    let profile = race_profile_id_v1();
    let commitment = race_profile_commitment_v1();
    let mut binding = Vec::new();
    for field in [
        b"iroha:execution:race-v1:native-history-binding:v1".as_slice(),
        profile.as_ref(),
        &commitment,
    ]
    .into_iter()
    .chain(values.iter().map(Vec::as_slice))
    {
        binding.extend_from_slice(&(field.len() as u64).to_le_bytes());
        binding.extend_from_slice(field);
    }
    Ok(binding)
}

/// Add one shared checkpoint selector and one expected public column per state register.
/// Every selected row is constrained, including terminal rows; no active-row gate can erase it.
fn checkpoint_circuit(track: race_circuit::Track, players: usize) -> Circuit {
    let mut circuit = race_circuit::circuit(track, players);
    let selector = circuit.public.len() as u32;
    circuit.public.push(PublicColumn {
        lo: 0,
        hi: 1,
        label: "retained checkpoint selector".to_owned(),
    });
    for register in &circuit.registers {
        let expected = circuit.public.len() as u32;
        circuit.public.push(PublicColumn {
            lo: register.lo,
            hi: register.hi,
            label: format!("retained checkpoint {}", register.label),
        });
        circuit.constraints.push(Constraint {
            body: Quad {
                lin: Lin {
                    constant: 0,
                    terms: vec![(Var::Main(register.column), 1), (Var::Public(expected), -1)],
                },
                products: vec![],
            },
            gate: Some(Lin::var(Var::Public(selector))),
            transition: false,
            label: format!("retained checkpoint {}", register.label),
        });
    }
    circuit
        .name
        .push_str("; native complete retained checkpoints v1");
    circuit
}

fn engine_params(circuit: &Circuit) -> Result<Params, ExecutionProofErrorV1> {
    let params = Params::standard();
    params.check_security(circuit, f64::from(RACE_TARGET_SECURITY_BITS_V1))?;
    if iroha_execution_stark::max_proof_bytes(circuit, &params)? > RACE_MAX_STARK_BYTES_V1 {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    Ok(params)
}

struct RaceAdapterV1<'a> {
    #[cfg(test)]
    statement: &'a ExecutionPublicInputsV1,
    payload: &'a RaceProofPayloadV1,
    compiled: Circuit,
    engine_statement: Statement,
    public: Vec<Vec<i64>>,
    params: Params,
}
impl<'a> RaceAdapterV1<'a> {
    fn new(
        statement: &'a ExecutionPublicInputsV1,
        payload: &'a RaceProofPayloadV1,
    ) -> Result<Self, ExecutionProofErrorV1> {
        Self::with_history(statement, payload, None)
    }
    fn with_history(
        statement: &'a ExecutionPublicInputsV1,
        payload: &'a RaceProofPayloadV1,
        history: Option<&ah::ValidatedHistory<'_>>,
    ) -> Result<Self, ExecutionProofErrorV1> {
        validate_payload_with_history(statement, payload, history)?;
        let replay = engine_replay(&payload.replay);
        race_circuit::validate_replay(&replay).map_err(|_| ExecutionProofErrorV1::Replay)?;
        if !removals_match_states(payload) {
            return Err(ExecutionProofErrorV1::Replay);
        }
        let compiled = checkpoint_circuit(replay.track, replay.players);
        let params = engine_params(&compiled)?;
        let mut public =
            race_circuit::public_columns(&replay).map_err(|_| ExecutionProofErrorV1::Replay)?;
        let mut checkpoints = vec![vec![0; compiled.rows()]; 1 + compiled.registers.len()];
        for state in &payload.checkpoint_states {
            let row = state.tick as usize;
            checkpoints[0][row] = 1;
            for (column, value) in checkpoints[1..].iter_mut().zip(engine_registers(state)) {
                column[row] = value;
            }
        }
        public.extend(checkpoints);
        let initial = initial_race_state_v1(payload.replay.track, payload.replay.player_count)
            .map_err(|_| ExecutionProofErrorV1::Replay)?;
        let engine_statement = Statement {
            steps: payload.replay.frames.len(),
            initial: engine_registers(&initial),
            final_state: engine_registers(&payload.final_state),
            checkpoint: None,
            binding: engine_binding(statement, payload)?,
        };
        Ok(Self {
            #[cfg(test)]
            statement,
            payload,
            compiled,
            engine_statement,
            public,
            params,
        })
    }
    fn verify(&self) -> Result<(), ExecutionProofErrorV1> {
        let proof = Proof::from_bytes_for_circuit(&self.payload.stark_bytes, &self.compiled)
            .map_err(|_| ExecutionProofErrorV1::Envelope)?;
        if proof.to_bytes() != self.payload.stark_bytes {
            return Err(ExecutionProofErrorV1::Envelope);
        }
        iroha_execution_stark::verify(
            &self.compiled,
            &self.params,
            &self.engine_statement,
            &self.public,
            &proof,
        )?;
        Ok(())
    }
    #[cfg(test)]
    fn public_input_digest_v1(&self) -> Result<ProfileDigest, ExecutionProofErrorV1> {
        let mut hasher = FramedHash::new(b"native-stock-binding-test-v1");
        hasher.update(&engine_binding(self.statement, self.payload)?);
        Ok(hasher.finalize())
    }
}

/// Register vectors before every tick and after the last, from the node's own simulation.
fn race_register_states(replay: &RaceReplayV1) -> Result<Vec<Vec<i64>>, ExecutionProofErrorV1> {
    let mut state = initial_race_state_v1(replay.track, replay.player_count)
        .map_err(|_| ExecutionProofErrorV1::Replay)?;
    let mut events = replay.dnf_events.iter().peekable();
    let mut states = Vec::with_capacity(replay.frames.len() + 1);
    for frame in &replay.frames {
        if events.peek().is_some_and(|event| event.tick == state.tick) {
            let event = events.next().expect("peeked event");
            apply_race_dnf_v1(&mut state, &event.slots)
                .map_err(|_| ExecutionProofErrorV1::Replay)?;
        }
        states.push(engine_registers(&state));
        step_race_v1(&mut state, frame).map_err(|_| ExecutionProofErrorV1::Replay)?;
    }
    // Removals at the last tick change no register.
    states.push(engine_registers(&state));
    Ok(states)
}

/// Generate and self-verify a genuine deterministic native transparent execution proof.
pub fn prove_race_v1(
    request: RaceProverRequestV1,
) -> Result<ExecutionProofEnvelopeV1, ExecutionProofErrorV1> {
    let (mut payload, history) = prepared_payload_from_request_v1(&request)?;
    let statement = statement_for_history_v1(&history, &payload)?;
    let adapter = RaceAdapterV1::with_history(&statement, &payload, Some(&history))?;
    let states = race_register_states(&payload.replay)?;
    let proof = iroha_execution_stark::prove(
        &adapter.compiled,
        &adapter.params,
        &adapter.engine_statement,
        &adapter.public,
        &states,
    )?;
    payload.stark_bytes = proof.to_bytes();
    if payload.stark_bytes.len() > RACE_MAX_STARK_BYTES_V1 {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    let envelope = ExecutionProofEnvelopeV1 {
        version: 1,
        profile_id: race_profile_id_v1(),
        statement,
        proof_bytes: game_binding::canonical(&payload, RACE_MAX_PROOF_BYTES_V1)?,
    };
    if norito::canonical_frame_len(&envelope).map_err(|_| ExecutionProofErrorV1::Envelope)?
        > RACE_MAX_PROOF_BYTES_V1
    {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    verify_race_proof_v1(&envelope)?;
    Ok(envelope)
}

pub(crate) fn decode_payload(
    envelope: &ExecutionProofEnvelopeV1,
) -> Result<RaceProofPayloadV1, ExecutionProofErrorV1> {
    if envelope.version != 1
        || envelope.profile_id != race_profile_id_v1()
        || envelope.proof_bytes.is_empty()
        || envelope.proof_bytes.len() > RACE_MAX_PROOF_BYTES_V1
        || norito::canonical_frame_len(envelope).map_err(|_| ExecutionProofErrorV1::Envelope)?
            > RACE_MAX_PROOF_BYTES_V1
    {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    let payload: RaceProofPayloadV1 = norito::decode_canonical_with_limits(
        &envelope.proof_bytes,
        norito::DecodeLimits::new(
            RACE_MAX_PROOF_BYTES_V1,
            RACE_MAX_PROOF_BYTES_V1,
            RACE_MAX_PROOF_BYTES_V1 + 131072,
            64 << 20,
            64,
        ),
    )
    .map_err(|error| ExecutionProofErrorV1::received_decode(&error))?;
    if payload.stark_bytes.is_empty() || payload.stark_bytes.len() > RACE_MAX_STARK_BYTES_V1 {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    Ok(payload)
}
/// Verify the complete semantic execution relation, with no replay-only or binding-only mode.
pub fn verify_race_proof_v1(
    envelope: &ExecutionProofEnvelopeV1,
) -> Result<(), ExecutionProofErrorV1> {
    let payload = decode_payload(envelope)?;
    let adapter = RaceAdapterV1::new(&envelope.statement, &payload)?;
    adapter.verify()?;
    Ok(())
}

/// Verify semantic execution and exact retained checkpoint, forced inputs, and removals.
pub(crate) fn verify_race_proof_for_history_v1(
    envelope: &ExecutionProofEnvelopeV1,
    session: &iroha_data_model::game::GameSessionRecordV1,
    outcome: &GameOutcomeV1,
    observation_height: u64,
) -> Result<(), ExecutionProofErrorV1> {
    let payload = decode_payload(envelope)?;
    let history = accepted_race_history(
        session,
        payload.final_state.tick,
        &payload.history_evidence,
        observation_height,
    )?;
    verify_payload_for_history(envelope, outcome, &payload, &history)
}

/// Reuse a complete checked source owned by the caller, never a supplied root or head.
pub(crate) fn verify_race_proof_with_history_v1(
    envelope: &ExecutionProofEnvelopeV1,
    outcome: &GameOutcomeV1,
    history: &ah::ValidatedHistory<'_>,
) -> Result<(), ExecutionProofErrorV1> {
    let payload = decode_payload(envelope)?;
    verify_payload_for_history(envelope, outcome, &payload, history)
}
fn verify_payload_for_history(
    envelope: &ExecutionProofEnvelopeV1,
    outcome: &GameOutcomeV1,
    payload: &RaceProofPayloadV1,
    history: &ah::ValidatedHistory<'_>,
) -> Result<(), ExecutionProofErrorV1> {
    let session = history.session();
    if &payload.outcome != outcome
        || envelope.statement != statement_for_history_v1(history, payload)?
        || session.result.as_ref().is_some_and(|r| r != outcome)
    {
        return Err(ExecutionProofErrorV1::History);
    }
    validate_checkpoint_states(history, history.certificates(), &payload.checkpoint_states)?;
    let adapter = RaceAdapterV1::with_history(&envelope.statement, payload, Some(history))?;
    adapter.verify()?;
    Ok(())
}

#[cfg(test)]
pub(crate) fn test_source_record_v1(players: u8) -> iroha_data_model::game::GameSessionRecordV1 {
    tests::request(players).source_record
}

#[cfg(test)]
#[path = "proof_tests.rs"]
mod tests;
