//! Standalone Touring proof-instance admission. This does not authorize NFT custody.

use crate::execution_proofs::{game_binding, guarded::accepted_history as ah};
use iroha_crypto::Hash;
use iroha_data_model::game_certificates::{
    GameActiveScopeV1, GameCertificateContextV1, GameStateRootV1, GameTranscriptRootV1,
};
use iroha_data_model::{
    classed_race_v1::*,
    execution_proofs::ExecutionPublicInputsV1,
    game::{
        GameAdmissionBodyV1, GameDnfEventV1, GameManifestV1, GameOutcomeV1, GameTranscriptBatchV1,
        GameTranscriptV1,
    },
    game_resources::GameResourceReturnPolicyV1,
};
use norito::codec::{Decode, Encode};

use super::super::error::ExecutionProofErrorV1;
use super::{
    proof::{ClassedRaceProofPayloadV1, classed_race_profile_id_v1},
    reference::{classed_race_is_terminal_v1, classed_race_result_v1},
    rules::{BATCH_TICKS, MAX_TICKS},
    staged_race_air::validate_checkpoint_states,
};

/// Frozen application parameters. Catalog eligibility must be authenticated by consensus.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Decode, Encode)]
pub struct ClassedRaceParametersV1 {
    /// Exactly one.
    pub version: u16,
    /// One global performance class; per-entrant multipliers do not exist.
    pub class_id: ClassedRaceClassV1,
    /// Immutable track selected before admission.
    pub track: ClassedRaceTrackV1,
    /// Exact compiled gameplay rules.
    pub rules_hash: Hash,
    /// Immutable reviewed NFT catalog commitment, never an executable or a role override.
    pub catalog_id: Hash,
}

/// Exact participant data; resource identities live in the typed admission resources.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Decode, Encode)]
pub struct ClassedRaceParticipantDataV1 {
    /// Exactly one.
    pub version: u16,
    /// Must equal the manifest's one global class.
    pub class_id: ClassedRaceClassV1,
    /// One of six equal-performance cosmetic variants.
    pub skin: u8,
}

/// One application-scoped Touring S1 role, shared by all entrants and future ledger admission.
/// This role identifies an immutable required kit; it does not establish NFT eligibility.
#[must_use]
pub fn classed_race_equipment_role_v1() -> Hash {
    Hash::new(b"sora-cars:equipment-role:v1\0TouringS1\0one-kit-return-to-original-owner")
}

fn rules_hash_from_sources(rules: &[u8], environment: &[u8], reference: &[u8]) -> Hash {
    Hash::new_from_chunks(&[
        b"sora-cars:classed-rules:v1\0",
        b"rules.rs\0",
        rules,
        b"environment.rs\0",
        environment,
        b"reference.rs\0",
        reference,
    ])
}

/// Commitment to the exact constants, track tables, environmental schedules and reference
/// operation order. A prose description alone cannot bind every executable numeric rule.
#[must_use]
pub fn classed_race_rules_hash_v1() -> Hash {
    rules_hash_from_sources(
        include_bytes!("rules.rs"),
        include_bytes!("environment.rs"),
        include_bytes!("reference.rs"),
    )
}

/// Canonical generic session inputs. Class, track and rules remain bound by the manifest,
/// state and complete proof statement, so the generic native genesis has the same empty root.
pub fn classed_race_game_transcript_v1(
    replay: &ClassedRaceReplayV1,
) -> Result<GameTranscriptV1, ExecutionProofErrorV1> {
    if replay.version != 1
        || !(1..=8).contains(&replay.player_count)
        || replay.frames.len() > MAX_TICKS as usize
        || replay.frames.len() % BATCH_TICKS as usize != 0
        || replay.dnf_events.len() > 8
        || replay.frames.iter().enumerate().any(|(tick, frame)| {
            frame.tick as usize != tick
                || frame.controls.len() != usize::from(replay.player_count)
                || frame.controls.iter().any(|control| control & !63 != 0)
        })
        || replay
            .dnf_events
            .windows(2)
            .any(|events| events[0].tick >= events[1].tick)
    {
        return Err(ExecutionProofErrorV1::Replay);
    }
    let mut removed = [false; 8];
    for event in &replay.dnf_events {
        if event.tick as usize > replay.frames.len()
            || event.tick % BATCH_TICKS != 0
            || event.slots.is_empty()
            || event.slots.windows(2).any(|slots| slots[0] >= slots[1])
        {
            return Err(ExecutionProofErrorV1::Replay);
        }
        for &slot in &event.slots {
            if slot >= replay.player_count
                || std::mem::replace(&mut removed[usize::from(slot)], true)
                || replay.frames[event.tick as usize..]
                    .iter()
                    .any(|frame| frame.controls[usize::from(slot)] != 0)
            {
                return Err(ExecutionProofErrorV1::Replay);
            }
        }
    }
    Ok(GameTranscriptV1 {
        batches: replay
            .frames
            .chunks(BATCH_TICKS as usize)
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
    })
}

/// Complete accepted transcript commitment under the immutable native scope.
pub fn classed_race_transcript_root_v1(
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
            max_ticks: 5400,
            slots: player_count,
            max_input_bytes: 12,
        },
        through_tick,
        transcript,
    )
}
/// Exact canonical Touring state schema under the same native scope.
pub fn classed_race_state_root_v1(
    context: &GameCertificateContextV1,
    scope: GameActiveScopeV1,
    state: &ClassedRaceStateV1,
) -> Result<GameStateRootV1, ExecutionProofErrorV1> {
    game_binding::state(context, scope, state.tick, state)
}

pub(super) fn decode_exact<T: Decode + Encode>(
    bytes: &[u8],
    limit: usize,
) -> Result<T, ExecutionProofErrorV1> {
    if bytes.is_empty() || bytes.len() > limit {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    let mut rest = bytes;
    let value = T::decode(&mut rest).map_err(|_| ExecutionProofErrorV1::Envelope)?;
    if !rest.is_empty() || value.encode() != bytes {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    Ok(value)
}

pub(super) fn validate_manifest(
    manifest: &GameManifestV1,
) -> Result<ClassedRaceParametersV1, ExecutionProofErrorV1> {
    let data_bytes = ClassedRaceParticipantDataV1 {
        version: 1,
        class_id: ClassedRaceClassV1::TouringS1,
        skin: 0,
    }
    .encode()
    .len();
    if manifest.version != 1
        || manifest.profile_id != classed_race_profile_id_v1()
        || manifest.min_participants != 2
        || !(2..=8).contains(&manifest.max_participants)
        || manifest.batch_ticks != BATCH_TICKS as u16
        || manifest.max_ticks != MAX_TICKS
        || manifest.max_input_bytes != (BATCH_TICKS * 2) as u16
        || usize::from(manifest.max_participant_data_bytes) != data_bytes
    {
        return Err(ExecutionProofErrorV1::Statement);
    }
    let parameters: ClassedRaceParametersV1 = decode_exact(&manifest.application_parameters, 256)?;
    if parameters.version != 1 || parameters.rules_hash != classed_race_rules_hash_v1() {
        return Err(ExecutionProofErrorV1::Statement);
    }
    Ok(parameters)
}

pub(super) fn validate_admission(
    manifest: &GameManifestV1,
    parameters: &ClassedRaceParametersV1,
    admission: &GameAdmissionBodyV1,
    players: u8,
) -> Result<(), ExecutionProofErrorV1> {
    admission.validate().map_err(ExecutionProofErrorV1::admission)?;
    if !(manifest.min_participants..=manifest.max_participants).contains(&players)
        || admission.participants.len() != usize::from(players)
        || admission.resources.len() != usize::from(players)
    {
        return Err(ExecutionProofErrorV1::Statement);
    }
    for (slot, (participant, resource)) in admission
        .participants
        .iter()
        .zip(&admission.resources)
        .enumerate()
    {
        let data: ClassedRaceParticipantDataV1 = decode_exact(
            &participant.application_data,
            usize::from(manifest.max_participant_data_bytes),
        )?;
        if data.version != 1
            || data.class_id != parameters.class_id
            || data.skin >= 6
            || usize::from(resource.slot) != slot
            || resource.role_id != classed_race_equipment_role_v1()
            || resource.policy != GameResourceReturnPolicyV1::ReturnToOriginalOwnerAtTerminal
        {
            return Err(ExecutionProofErrorV1::Statement);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rules_identity_commits_numeric_tracks_curves_and_environment() {
        let rules = include_str!("rules.rs");
        let environment = include_str!("environment.rs");
        let reference = include_str!("reference.rs");
        let original = classed_race_rules_hash_v1();
        assert_eq!(
            original,
            rules_hash_from_sources(
                rules.as_bytes(),
                environment.as_bytes(),
                reference.as_bytes()
            )
        );
        for (before, after) in [
            ("2_400_000", "2_400_001"),
            (
                "0, -2, -2, 0, 1, 3, 1, 0, -1, -3, -1, 0",
                "0, -2, -2, 0, 1, 4, 1, 0, -1, -3, -1, 0",
            ),
        ] {
            assert!(rules.contains(before));
            let changed = rules.replacen(before, after, 1);
            assert_ne!(
                original,
                rules_hash_from_sources(
                    changed.as_bytes(),
                    environment.as_bytes(),
                    reference.as_bytes()
                )
            );
        }
        let changed = environment.replacen("300", "301", 1);
        assert_ne!(
            changed, environment,
            "actual numeric weather schedule exists"
        );
        assert_ne!(
            original,
            rules_hash_from_sources(rules.as_bytes(), changed.as_bytes(), reference.as_bytes())
        );
    }
}

/// Economic projection; the physical payload result is never mutated.
pub(super) fn settlement_result(
    payload: &ClassedRaceProofPayloadV1,
) -> Result<ClassedRaceSettlementResultV1, ExecutionProofErrorV1> {
    let physical =
        classed_race_result_v1(&payload.final_state).map_err(|_| ExecutionProofErrorV1::Replay)?;
    if !physical.terminal {
        return Err(ExecutionProofErrorV1::Replay);
    }
    let (standings, winners) = game_binding::racing_settlement(
        payload.accepted_through_tick,
        MAX_TICKS,
        physical.ticks,
        &payload.history_evidence.transcript,
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
    Ok(ClassedRaceSettlementResultV1 {
        class_id: physical.class_id,
        track: physical.track,
        physical_terminal_tick: physical.ticks,
        accepted_through_tick: payload.accepted_through_tick,
        standings: standings
            .into_iter()
            .map(
                |s| iroha_data_model::execution_proofs::RaceSettlementStandingV1 {
                    slot: s.slot,
                    finish_tick: s.finish_tick,
                    dnf_tick: s.dnf_tick,
                    progress_mm: s.progress_mm,
                },
            )
            .collect(),
        winners,
    })
}
pub(super) fn outcome(
    payload: &ClassedRaceProofPayloadV1,
) -> Result<GameOutcomeV1, ExecutionProofErrorV1> {
    let result = settlement_result(payload)?;
    Ok(GameOutcomeV1 {
        terminal_tick: result.physical_terminal_tick,
        winner_slots: result.winners.clone(),
        result: game_binding::canonical(
            &result,
            iroha_data_model::game_certificates::lifecycle::GAME_OUTCOME_MAX_RESULT_BYTES_V1,
        )?,
    })
}

/// Validate public shapes and commitments, but never execute a vehicle transition.
#[cfg(test)]
pub(super) fn validate_payload(
    statement: &ExecutionPublicInputsV1,
    payload: &ClassedRaceProofPayloadV1,
) -> Result<(), ExecutionProofErrorV1> {
    validate_payload_with_history(statement, payload, None)
}
pub(super) fn validate_payload_with_history(
    statement: &ExecutionPublicInputsV1,
    payload: &ClassedRaceProofPayloadV1,
    history: Option<&ah::ValidatedHistory<'_>>,
) -> Result<(), ExecutionProofErrorV1> {
    super::super::guarded::accepted_history::evidence_bounds(&payload.history_evidence)
        .map_err(|_| ExecutionProofErrorV1::Envelope)?;
    super::super::record_binding::validate_binding_v1(&statement.source_record_binding)?;
    let parameters = validate_manifest(&payload.manifest)?;
    let replay = &payload.replay;
    validate_admission(
        &payload.manifest,
        &parameters,
        &payload.admission,
        replay.player_count,
    )?;
    validate_checkpoint_states(replay, &payload.final_state, &payload.checkpoint_states)
        .map_err(|_| ExecutionProofErrorV1::Replay)?;
    if payload.checkpoint_states.is_empty()
        || replay.class_id != parameters.class_id
        || replay.track != parameters.track
        || payload.final_state.tick % BATCH_TICKS != 0
        || !classed_race_is_terminal_v1(&payload.final_state)
            .map_err(|_| ExecutionProofErrorV1::Replay)?
        || replay
            .dnf_events
            .iter()
            .any(|event| event.tick % BATCH_TICKS != 0)
        || payload
            .checkpoint_states
            .iter()
            .any(|state| state.tick % BATCH_TICKS != 0)
    {
        return Err(ExecutionProofErrorV1::Replay);
    }
    // A removed input key has no accepted controls in later batches. The AIR independently
    // freezes its car, while this admission rule preserves the canonical public transcript.
    for event in &replay.dnf_events {
        for frame in &replay.frames[event.tick as usize..] {
            if event
                .slots
                .iter()
                .any(|slot| frame.controls[usize::from(*slot)] != 0)
            {
                return Err(ExecutionProofErrorV1::Replay);
            }
        }
    }
    let result =
        classed_race_result_v1(&payload.final_state).map_err(|_| ExecutionProofErrorV1::Replay)?;
    let context = game_binding::context(&statement.network_id, statement.session_id);
    let scope = game_binding::scope(&context, &payload.manifest, &payload.admission)?;
    game_binding::racing_projection(
        payload.accepted_through_tick,
        MAX_TICKS,
        replay.player_count as usize,
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
        63,
    )?;
    if payload.result != result
        || !result.terminal
        || statement.manifest_commitment != scope.manifest
        || statement.admission_commitment != scope.admission
        || statement.transcript_root
            != if let Some(history) = history {
                if statement.network_id != history.session().network_id
                    || statement.session_id != history.session().session_id
                {
                    return Err(ExecutionProofErrorV1::History);
                }
                super::history::checked_payload_root(history, payload)?
            } else {
                classed_race_transcript_root_v1(
                    &context,
                    scope,
                    payload.replay.player_count,
                    payload.accepted_through_tick,
                    &payload.history_evidence.transcript,
                )?
            }
        || statement.outcome_commitment
            != game_binding::outcome(&context, scope, &outcome(payload)?)?
    {
        return Err(ExecutionProofErrorV1::Statement);
    }
    Ok(())
}
