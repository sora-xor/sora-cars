//! Closed native game commitment construction shared by compiled execution adapters.
//! These functions authenticate no ledger input; callers supply the independently selected context.
use super::error::ExecutionProofErrorV1;
use iroha_crypto::Hash;
use iroha_data_model::{
    NetworkId,
    game::*,
    game_certificates::{history::*, lifecycle::*, *},
};

/// A certificate verdict is a statement mismatch; a local failure to compute one aborts.
fn invalid(
    failure: iroha_primitives::execution::ExecutionFailure<
        GameCertificateVerdictV1,
        GameCertificateAbortV1,
    >,
) -> ExecutionProofErrorV1 {
    match failure {
        iroha_primitives::execution::ExecutionFailure::Deterministic(_) => ExecutionProofErrorV1::Statement,
        iroha_primitives::execution::ExecutionFailure::Aborted(abort) => ExecutionProofErrorV1::Aborted(
            crate::smartcontracts::execution::game_certificate_abort(abort),
        ),
        iroha_primitives::execution::ExecutionFailure::RecoveryFailed(_) => ExecutionProofErrorV1::Aborted(iroha_primitives::execution::ExecutionAbort::Invariant {
            context: "game certificate recovery failed",
        }),
    }
}
/// Exact canonical bytes, independent of ambient Norito layout flags.
pub(crate) fn canonical<T: norito::NoritoSerialize>(
    value: &T,
    cap: usize,
) -> Result<Vec<u8>, ExecutionProofErrorV1> {
    let frame_len = norito::canonical_frame_len(value)
        .map_err(|error| ExecutionProofErrorV1::computed_codec(&error, "game binding frame length"))?;
    if frame_len > cap {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    norito::encode_canonical(value)
        .map_err(|error| ExecutionProofErrorV1::computed_codec(&error, "game binding frame"))
}
pub(crate) fn context(network: &NetworkId, session_id: Hash) -> GameCertificateContextV1 {
    GameCertificateContextV1 {
        network: *network,
        session_id,
    }
}
pub(crate) fn scope(
    context: &GameCertificateContextV1,
    manifest: &GameManifestV1,
    admission: &GameAdmissionBodyV1,
) -> Result<GameActiveScopeV1, ExecutionProofErrorV1> {
    if manifest.application_parameters.len() > GAME_MANIFEST_MAX_PARAMETERS_BYTES_V1
        || norito::canonical_frame_len(manifest).map_err(|error| {
            ExecutionProofErrorV1::computed_codec(&error, "game manifest frame length")
        })? > GAME_MANIFEST_COMMITMENT_MAX_BODY_BYTES_V1
    {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    admission.validate().map_err(ExecutionProofErrorV1::admission)?;
    Ok(GameActiveScopeV1 {
        manifest: GameManifestCommitmentBodyV1::new(manifest.clone())
            .map_err(invalid)?
            .commitment(context)
            .map_err(invalid)?,
        admission: GameAdmissionCommitmentBodyV1::new(admission.clone())
            .map_err(invalid)?
            .commitment(context)
            .map_err(invalid)?,
    })
}
pub(crate) fn retained(
    session: &GameSessionRecordV1,
) -> Result<GameSessionCertificateContextV1, ExecutionProofErrorV1> {
    let c = GameSessionCertificateContextV1::from_ledger(&session.network_id, session)
        .map_err(invalid)?;
    if GameDisputeCommitmentBodyV1::from_ledger(&session.network_id, session)
        .map_err(invalid)?
        .commitment(c.context())
        .map_err(invalid)?
        != session.dispute_commitment
    {
        return Err(ExecutionProofErrorV1::History);
    }
    Ok(c)
}
pub(crate) fn outcome(
    context: &GameCertificateContextV1,
    scope: GameActiveScopeV1,
    outcome: &GameOutcomeV1,
) -> Result<GameOutcomeCommitmentV1, ExecutionProofErrorV1> {
    if outcome.winner_slots.len() > GAME_MAX_PARTICIPANTS_V1
        || outcome.result.len() > GAME_OUTCOME_MAX_RESULT_BYTES_V1
    {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    GameOutcomeCommitmentBodyV1::new(scope, outcome.clone())
        .map_err(invalid)?
        .commitment(context)
        .map_err(invalid)
}
pub(crate) fn state<T: norito::NoritoSerialize>(
    context: &GameCertificateContextV1,
    scope: GameActiveScopeV1,
    tick: u32,
    state: &T,
) -> Result<GameStateRootV1, ExecutionProofErrorV1> {
    let bytes = canonical(state, GAME_STATE_COMMITMENT_MAX_STATE_BYTES_V1)?;
    GameAdapterStateCommitmentBodyV1::new(scope, tick, &bytes)
        .map_err(invalid)?
        .commitment(context)
        .map_err(invalid)
}
/// Validate all supplied bytes before cloning any prefix, including unused suffix controls.
pub(crate) fn transcript_bounds(
    transcript: &GameTranscriptV1,
) -> Result<(), ExecutionProofErrorV1> {
    if transcript.batches.len() > GAME_TRANSCRIPT_COMMITMENT_MAX_BATCHES_V1
        || transcript.dnf_events.len() > GAME_MAX_PARTICIPANTS_V1
    {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    let mut bytes = 0usize;
    for batch in &transcript.batches {
        if batch.inputs.len() > GAME_MAX_PARTICIPANTS_V1 {
            return Err(ExecutionProofErrorV1::Envelope);
        }
        for input in &batch.inputs {
            if input.len() > GAME_CERTIFICATE_MAX_INPUT_BYTES_V1 {
                return Err(ExecutionProofErrorV1::Envelope);
            }
            bytes = bytes
                .checked_add(input.len())
                .ok_or(ExecutionProofErrorV1::Envelope)?;
        }
    }
    if bytes > GAME_TRANSCRIPT_COMMITMENT_MAX_INPUT_BYTES_V1
        || transcript
            .dnf_events
            .iter()
            .any(|event| event.slots.len() > GAME_MAX_PARTICIPANTS_V1)
        || norito::canonical_frame_len(transcript).map_err(|_| ExecutionProofErrorV1::Envelope)?
            > GAME_TRANSCRIPT_COMMITMENT_MAX_FRAME_BYTES_V1 - 256
    {
        return Err(ExecutionProofErrorV1::Envelope);
    }
    Ok(())
}
/// Frozen manifest geometry with the original admitted roster, including inactive slots.
pub(crate) fn transcript_geometry(
    manifest: &GameManifestV1,
    slots: u8,
) -> GameTranscriptGeometryV1 {
    GameTranscriptGeometryV1 {
        batch_ticks: manifest.batch_ticks,
        max_ticks: manifest.max_ticks,
        slots,
        max_input_bytes: manifest.max_input_bytes,
    }
}
/// Prepare the complete accepted source once. The model checks every supplied suffix byte.
pub(crate) fn prepare_transcript<'a>(
    context: &GameCertificateContextV1,
    scope: GameActiveScopeV1,
    geometry: GameTranscriptGeometryV1,
    through_tick: u32,
    transcript: &'a GameTranscriptV1,
) -> Result<PreparedGameTranscriptV1<'a>, ExecutionProofErrorV1> {
    transcript_bounds(transcript)?;
    PreparedGameTranscriptV1::new(context, scope, geometry, through_tick, transcript)
        .map_err(invalid)
}
/// Commit every accepted row/removal through the source frontier, which may exceed simulation terminal.
pub(crate) fn transcript(
    context: &GameCertificateContextV1,
    scope: GameActiveScopeV1,
    geometry: GameTranscriptGeometryV1,
    through_tick: u32,
    transcript: &GameTranscriptV1,
) -> Result<GameTranscriptRootV1, ExecutionProofErrorV1> {
    Ok(prepare_transcript(context, scope, geometry, through_tick, transcript)?.accepted_root())
}
/// A standalone checkpoint query validates the complete source. Complete history consumers
/// retain one prepared object instead, so every distinct root is computed only once.
pub(crate) fn checkpoint_prefix(
    context: &GameCertificateContextV1,
    scope: GameActiveScopeV1,
    geometry: GameTranscriptGeometryV1,
    through_tick: u32,
    tick: u32,
    full: &GameTranscriptV1,
) -> Result<GameTranscriptRootV1, ExecutionProofErrorV1> {
    prepare_transcript(context, scope, geometry, through_tick, full)?
        .checkpoint_root(tick)
        .map_err(invalid)
}
/// Exact six-control racing projection; all accepted suffix bytes remain checked and committed.
pub(crate) fn racing_projection<'a>(
    through_tick: u32,
    max_ticks: u32,
    slots: usize,
    terminal: u32,
    full: &'a GameTranscriptV1,
    frames: impl IntoIterator<Item = (u32, &'a [u16])>,
    removals: impl IntoIterator<Item = (u32, &'a [u8])>,
    mask: u16,
) -> Result<(), ExecutionProofErrorV1> {
    transcript_bounds(full)?;
    if !(2..=8).contains(&slots)
        || terminal > through_tick
        || through_tick > max_ticks
        || full.batches.len() != through_tick.div_ceil(6) as usize
    {
        return Err(ExecutionProofErrorV1::History);
    }
    let mut removed = [None; 8];
    let mut previous = None;
    for event in &full.dnf_events {
        if event.tick >= max_ticks
            || event.tick > through_tick
            || event.tick % 6 != 0
            || previous.is_some_and(|p| p >= event.tick)
            || event.slots.is_empty()
        {
            return Err(ExecutionProofErrorV1::History);
        }
        previous = Some(event.tick);
        let mut prior_slot = None;
        for &slot in &event.slots {
            let slot = usize::from(slot);
            if slot >= slots || prior_slot.is_some_and(|p| p >= slot) || removed[slot].is_some() {
                return Err(ExecutionProofErrorV1::History);
            }
            removed[slot] = Some(event.tick);
            prior_slot = Some(slot);
        }
    }
    for (index, batch) in full.batches.iter().enumerate() {
        if batch.start_tick != index as u32 * 6 || batch.inputs.len() != slots {
            return Err(ExecutionProofErrorV1::History);
        }
        for (slot, input) in batch.inputs.iter().enumerate() {
            if removed[slot].is_some_and(|tick| tick <= batch.start_tick) {
                if !input.is_empty() {
                    return Err(ExecutionProofErrorV1::History);
                }
            } else if input.len() != 12
                || input
                    .chunks_exact(2)
                    .any(|v| u16::from_le_bytes([v[0], v[1]]) & !mask != 0)
            {
                return Err(ExecutionProofErrorV1::Replay);
            }
        }
    }
    let expected_removals = full
        .dnf_events
        .iter()
        .filter(|event| event.tick <= terminal)
        .map(|event| (event.tick, event.slots.as_slice()));
    if !expected_removals.eq(removals) {
        return Err(ExecutionProofErrorV1::History);
    }
    let mut count = 0u32;
    for (tick, controls) in frames {
        if tick != count || tick >= terminal || controls.len() != slots {
            return Err(ExecutionProofErrorV1::Replay);
        }
        let batch = full
            .batches
            .get((tick / 6) as usize)
            .ok_or(ExecutionProofErrorV1::History)?;
        for (slot, &control) in controls.iter().enumerate() {
            let input = &batch.inputs[slot];
            let offset = (tick % 6) as usize * 2;
            let expected = if input.is_empty() {
                0
            } else {
                u16::from_le_bytes([input[offset], input[offset + 1]])
            };
            if control != expected {
                return Err(ExecutionProofErrorV1::History);
            }
        }
        count = count.checked_add(1).ok_or(ExecutionProofErrorV1::History)?;
    }
    if count != terminal {
        return Err(ExecutionProofErrorV1::History);
    }
    Ok(())
}
/// Public economic projection of an already-proved physical terminal result.
/// `dnf_tick` in these standings is the actual consensus removal time, which may exceed
/// physical terminal time. It must never be written back into a simulator state.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct EconomicStanding {
    pub slot: u8,
    pub finish_tick: Option<u32>,
    pub dnf_tick: Option<u32>,
    pub progress_mm: i64,
}
/// Preserve physical performance while applying every removal through the accepted frontier.
/// Full history authentication is external; the supplied source and the resulting outcome are
/// both committed by the adapter before any proof challenge is sampled.
pub(crate) fn racing_settlement(
    through_tick: u32,
    max_ticks: u32,
    terminal: u32,
    full: &GameTranscriptV1,
    mut standings: Vec<EconomicStanding>,
) -> Result<(Vec<EconomicStanding>, Vec<u8>), ExecutionProofErrorV1> {
    let slots = standings.len();
    if !(2..=8).contains(&slots) || terminal > through_tick || through_tick > max_ticks {
        return Err(ExecutionProofErrorV1::History);
    }
    let mut removed = [None; 8];
    let mut prior_tick = None;
    if full.dnf_events.len() > slots {
        return Err(ExecutionProofErrorV1::History);
    }
    for event in &full.dnf_events {
        if event.tick >= max_ticks
            || event.tick > through_tick
            || event.tick % 6 != 0
            || prior_tick.is_some_and(|tick| tick >= event.tick)
            || event.slots.is_empty()
            || event.slots.len() > slots
        {
            return Err(ExecutionProofErrorV1::History);
        }
        prior_tick = Some(event.tick);
        let mut prior_slot = None;
        for &slot in &event.slots {
            if usize::from(slot) >= slots
                || prior_slot.is_some_and(|s| s >= slot)
                || removed[usize::from(slot)].is_some()
            {
                return Err(ExecutionProofErrorV1::History);
            }
            removed[usize::from(slot)] = Some(event.tick);
            prior_slot = Some(slot);
        }
    }
    let mut seen = [false; 8];
    for standing in &mut standings {
        let slot = usize::from(standing.slot);
        if slot >= slots
            || seen[slot]
            || standing.finish_tick.is_some_and(|tick| tick > terminal)
            || standing.dnf_tick != removed[slot].filter(|&tick| tick <= terminal)
        {
            return Err(ExecutionProofErrorV1::History);
        }
        seen[slot] = true;
        standing.dnf_tick = removed[slot];
    }
    standings.sort_by(|a, b| {
        a.dnf_tick
            .is_some()
            .cmp(&b.dnf_tick.is_some())
            .then_with(|| match (a.finish_tick, b.finish_tick) {
                (Some(x), Some(y)) => x.cmp(&y).then(a.slot.cmp(&b.slot)),
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => b.progress_mm.cmp(&a.progress_mm).then(a.slot.cmp(&b.slot)),
            })
    });
    let eligible: Vec<_> = standings.iter().filter(|s| s.dnf_tick.is_none()).collect();
    let mut winners = Vec::new();
    if let Some(earliest) = eligible.first().and_then(|s| s.finish_tick) {
        winners.extend(
            eligible
                .iter()
                .filter(|s| s.finish_tick == Some(earliest))
                .map(|s| s.slot),
        );
    } else if eligible.len() == 1 {
        winners.push(eligible[0].slot);
    } else if terminal == max_ticks {
        if let Some(leader) = eligible.first() {
            winners.extend(
                eligible
                    .iter()
                    .filter(|s| s.progress_mm == leader.progress_mm)
                    .map(|s| s.slot),
            );
        }
    } else if !eligible.is_empty() {
        // Multiple unfinished eligible racers below the cap cannot constitute a terminal claim.
        return Err(ExecutionProofErrorV1::History);
    }
    winners.sort_unstable();
    Ok((standings, winners))
}

#[cfg(test)]
mod tests;
