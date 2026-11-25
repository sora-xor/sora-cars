//! Native Touring history and statement derivation; ledger authenticity is supplied independently.
use super::super::{error::ExecutionProofErrorV1, game_binding, guarded::accepted_history as ah};
use super::{
    admission::{classed_race_state_root_v1, outcome},
    proof::{
        ClassedRaceProofPayloadV1, classed_race_profile_id_v1, decode_payload,
        verify_payload_with_history,
    },
    reference::initial_classed_race_state_v1,
};
use iroha_data_model::{
    execution_proofs::{ExecutionProofEnvelopeV1, ExecutionPublicInputsV1},
    game::{GameAdmissionBodyV1, GameOutcomeV1, GameSessionRecordV1},
    game_certificates::GameDisputeCommitmentV1,
};
/// Recompute the scoped retained dispute projection, not finalized inclusion.
pub fn classed_race_dispute_commitment_v1(
    session: &GameSessionRecordV1,
) -> Result<GameDisputeCommitmentV1, ExecutionProofErrorV1> {
    ah::native_dispute_commitment(session).map_err(|_| ExecutionProofErrorV1::History)
}
pub(super) fn checked_payload_root(
    history: &ah::ValidatedHistory<'_>,
    payload: &ClassedRaceProofPayloadV1,
) -> Result<iroha_data_model::game_certificates::GameTranscriptRootV1, ExecutionProofErrorV1> {
    if history.evidence() != &payload.history_evidence
        || history.session().manifest != payload.manifest
        || GameAdmissionBodyV1::from_session(history.session()) != payload.admission
        || history.session().next_tick != payload.accepted_through_tick
        || history.terminal() != payload.final_state.tick
    {
        return Err(ExecutionProofErrorV1::History);
    }
    Ok(history.accepted_transcript_root())
}
pub(super) fn statement_for_history(
    history: &ah::ValidatedHistory<'_>,
    payload: &ClassedRaceProofPayloadV1,
) -> Result<ExecutionPublicInputsV1, ExecutionProofErrorV1> {
    let session = history.session();
    let c = history.certificates();
    let scope = c.scope();
    Ok(ExecutionPublicInputsV1 {
        network_id: session.network_id,
        session_id: session.session_id,
        source_record_binding: crate::execution_proofs::execution_record_binding_v1(session)?,
        manifest_commitment: scope.manifest,
        admission_commitment: scope.admission,
        dispute_commitment: session.dispute_commitment,
        transcript_root: checked_payload_root(history, payload)?,
        outcome_commitment: game_binding::outcome(c.context(), scope, &outcome(payload)?)?,
    })
}
pub(super) fn prepare_history<'a>(
    session: &'a GameSessionRecordV1,
    payload: &'a ClassedRaceProofPayloadV1,
    observation_height: u64,
) -> Result<ah::ValidatedHistory<'a>, ExecutionProofErrorV1> {
    ah::canonical_record_bytes(session).map_err(|error| {
        error
            .local_abort()
            .map_or(ExecutionProofErrorV1::Envelope, ExecutionProofErrorV1::Aborted)
    })?;
    ah::evidence_bounds(&payload.history_evidence).map_err(|_| ExecutionProofErrorV1::Envelope)?;
    super::admission::validate_manifest(&payload.manifest)?;
    payload
        .admission
        .validate()
        .map_err(ExecutionProofErrorV1::admission)?;
    if session.manifest != payload.manifest
        || GameAdmissionBodyV1::from_session(session) != payload.admission
        || payload.accepted_through_tick != session.next_tick
        || session.profile_id != classed_race_profile_id_v1()
    {
        return Err(ExecutionProofErrorV1::History);
    }
    let c = game_binding::retained(session)?;
    let genesis = initial_classed_race_state_v1(
        payload.replay.class_id,
        payload.replay.track,
        payload.replay.player_count,
    )
    .map_err(|_| ExecutionProofErrorV1::History)?;
    let policy = ah::Policy {
        application_id: session.manifest.application_id,
        profile_id: session.profile_id,
        compiled_relation: super::admission::classed_race_rules_hash_v1(),
        genesis_state_root: classed_race_state_root_v1(c.context(), c.scope(), &genesis)?,
    };
    let history = ah::validate(
        session,
        &ah::ObservationContext {
            height: observation_height,
        },
        &policy,
        payload.final_state.tick,
        &payload.history_evidence,
        |input| {
            if input.len() != 12
                || input
                    .chunks_exact(2)
                    .any(|v| u16::from_le_bytes([v[0], v[1]]) & !63 != 0)
            {
                Err(ah::Error::Input("Touring complete batch"))
            } else {
                Ok(())
            }
        },
        |_session, _policy, _certificates, _full| Ok(()),
    )
    .map_err(|error| {
        error
            .local_abort()
            .map_or(ExecutionProofErrorV1::History, ExecutionProofErrorV1::Aborted)
    })?;
    // The immutable archive and the selected checkpoint are one ordered boundary list.
    // Equal cardinality prevents omissions; strict public tick ordering prevents duplicates.
    let checkpoints = history.state_checkpoints().collect::<Vec<_>>();
    if payload.checkpoint_states.len() != checkpoints.len() {
        return Err(ExecutionProofErrorV1::History);
    }
    for (state, checkpoint) in payload.checkpoint_states.iter().zip(&checkpoints) {
        if state.tick != checkpoint.tick
            || classed_race_state_root_v1(c.context(), c.scope(), state)? != checkpoint.state_root
        {
            return Err(ExecutionProofErrorV1::History);
        }
    }
    let selected = history.selected_checkpoint();
    let selected_state = payload
        .checkpoint_states
        .last()
        .ok_or(ExecutionProofErrorV1::History)?;
    if selected.terminal
        != super::reference::classed_race_is_terminal_v1(selected_state)
            .map_err(|_| ExecutionProofErrorV1::History)?
        || payload.checkpoint_states[..payload.checkpoint_states.len() - 1]
            .iter()
            .any(|state| {
                // A terminal certificate cannot be superseded by another checkpoint.
                super::reference::classed_race_is_terminal_v1(state).unwrap_or(true)
            })
    {
        return Err(ExecutionProofErrorV1::History);
    }
    Ok(history)
}
#[cfg(test)]
pub(super) fn validate_history_with_receipt(
    history: &ah::ValidatedHistory<'_>,
    claimed: &GameOutcomeV1,
    statement: &ExecutionPublicInputsV1,
    payload: &ClassedRaceProofPayloadV1,
) -> Result<(), ExecutionProofErrorV1> {
    super::admission::validate_payload_with_history(statement, payload, Some(history))?;
    validate_history_binding(history, claimed, statement, payload)
}
pub(super) fn validate_history_binding(
    history: &ah::ValidatedHistory<'_>,
    claimed: &GameOutcomeV1,
    statement: &ExecutionPublicInputsV1,
    payload: &ClassedRaceProofPayloadV1,
) -> Result<(), ExecutionProofErrorV1> {
    if &outcome(payload)? != claimed
        || history
            .session()
            .result
            .as_ref()
            .is_some_and(|r| r != claimed)
        || statement != &statement_for_history(history, payload)?
    {
        return Err(ExecutionProofErrorV1::History);
    }
    Ok(())
}
#[cfg(test)]
pub(super) fn validate_history(
    session: &GameSessionRecordV1,
    claimed: &GameOutcomeV1,
    statement: &ExecutionPublicInputsV1,
    payload: &ClassedRaceProofPayloadV1,
    observation_height: u64,
) -> Result<(), ExecutionProofErrorV1> {
    let history = prepare_history(session, payload, observation_height)?;
    validate_history_with_receipt(&history, claimed, statement, payload)
}
/// Verify computation against an independently selected complete native record and observation height.
pub fn verify_classed_race_proof_for_session_v1(
    session: &GameSessionRecordV1,
    claimed: &GameOutcomeV1,
    envelope: &ExecutionProofEnvelopeV1,
    observation_height: u64,
) -> Result<iroha_data_model::classed_race_v1::ClassedRaceSettlementResultV1, ExecutionProofErrorV1>
{
    let payload = decode_payload(envelope)?;
    let history = prepare_history(session, &payload, observation_height)?;
    validate_history_binding(&history, claimed, &envelope.statement, &payload)?;
    verify_payload_with_history(&envelope.statement, &payload, &history)
}
