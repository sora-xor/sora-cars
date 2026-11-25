//! First-release lifecycle commitments and ledger-derived certificate construction.
//!
//! These helpers implement canonical claims, not consensus acceptance. Core must
//! obtain the record from its ledger view, enforce phase/deadline/epoch authority,
//! validate adapter state, and retain pending certified inputs atomically. This
//! module does not enable a profile or replace complete source-record binding.

use super::gameplay::{
    GameChallengeCertificateBodyV1, GameCheckpointCertificateBodyV1,
    GameCommitmentSetCertificateBodyV1,
};
use super::*;
use crate::game::*;

/// Maximum complete canonical manifest body (the outer frame is additional).
pub const GAME_MANIFEST_COMMITMENT_MAX_BODY_BYTES_V1: usize = 256 * 1024;
/// Maximum application parameters retained by a generic manifest.
pub const GAME_MANIFEST_MAX_PARAMETERS_BYTES_V1: usize = 65_536;
/// Maximum complete dispute frame, including its outer game header.
pub const GAME_DISPUTE_COMMITMENT_MAX_FRAME_BYTES_V1: usize = 8 * 1024 * 1024;
/// Maximum complete outcome frame, including its outer game header.
pub const GAME_OUTCOME_COMMITMENT_MAX_FRAME_BYTES_V1: usize = 256 * 1024;
/// Maximum opaque application result bytes, independently of winner count.
pub const GAME_OUTCOME_MAX_RESULT_BYTES_V1: usize = 65_536;

#[derive(Clone, Copy)]
enum Kind {
    Manifest,
    Admission,
    Dispute,
    Outcome,
}
impl Kind {
    const fn purpose(self) -> GameCertificatePurposeV1 {
        match self {
            Self::Manifest => GameCertificatePurposeV1::Manifest,
            Self::Admission => GameCertificatePurposeV1::Admission,
            Self::Dispute => GameCertificatePurposeV1::Dispute,
            Self::Outcome => GameCertificatePurposeV1::Outcome,
        }
    }
    const fn body_limit(self) -> usize {
        match self {
            Self::Manifest => GAME_MANIFEST_COMMITMENT_MAX_BODY_BYTES_V1,
            Self::Admission => GAME_ADMISSION_MAX_BYTES_V1,
            Self::Dispute => {
                GAME_DISPUTE_COMMITMENT_MAX_FRAME_BYTES_V1 - GAME_CERTIFICATE_FRAME_OVERHEAD_V1
            }
            Self::Outcome => {
                GAME_OUTCOME_COMMITMENT_MAX_FRAME_BYTES_V1 - GAME_CERTIFICATE_FRAME_OVERHEAD_V1
            }
        }
    }
    const fn limits(self) -> norito::DecodeLimits {
        // Account/controller and NFT internal sequences use the admission's global
        // bound. Local slot/resource geometry is checked after bounded decoding.
        // Allocations are explicit ceilings, not measured memory estimates.
        let (sequence, total, allocations, depth) = match self {
            Self::Manifest => (65_536, 131_072, 4 * 1024 * 1024, 32),
            Self::Admission => (32 * 1024, 2 * 1024 * 1024, 32 * 1024 * 1024, 64),
            Self::Dispute => (
                4096,
                GAME_DISPUTE_COMMITMENT_MAX_FRAME_BYTES_V1,
                64 * 1024 * 1024,
                32,
            ),
            Self::Outcome => (65_536, 65_536 + 32, 4 * 1024 * 1024, 16),
        };
        norito::DecodeLimits::new(sequence, self.body_limit(), total, allocations, depth)
    }
}
fn length<T: norito::NoritoSerialize>(
    kind: Kind,
    body: &T,
) -> ExecutionResult<usize, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let n = norito::canonical_frame_len(body).map_err(|source| {
        computed_codec_failure(source, "game certificate lifecycle::length count")
    })?;
    if n > kind.body_limit() {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    Ok(n)
}
fn digest<T: norito::NoritoSerialize>(
    ctx: &GameCertificateContextV1,
    kind: Kind,
    body: &T,
) -> ExecutionResult<GameCommitmentV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let n = length(kind, body)?;
    let mut state = Sha3_384State::new();
    state.update(&frame_header(ctx, kind.purpose(), n)?);
    let mut sink = DigestWriter {
        state,
        remaining: n,
    };
    norito::core::write_canonical_to_writer(body, &mut sink).map_err(|source| {
        computed_codec_failure(source, "game certificate lifecycle::digest encode")
    })?;
    if sink.remaining != 0 {
        return Err(native_failure(norito::NativeCodecFailure::Invariant {
            context: "game certificate encoding did not fill its measured destination",
        }));
    }
    Ok(GameCommitmentV1::from_bytes(sink.state.finalize()))
}
fn decode<T: norito::NoritoSerialize + for<'de> norito::NoritoDeserialize<'de>>(
    ctx: &GameCertificateContextV1,
    kind: Kind,
    bytes: &[u8],
) -> ExecutionResult<T, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let n = bytes
        .len()
        .checked_sub(GAME_CERTIFICATE_FRAME_OVERHEAD_V1)
        .ok_or_else(|| ExecutionFailure::Deterministic(GameCertificateVerdictV1::Frame))?;
    if n > kind.body_limit() {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    if bytes[..GAME_CERTIFICATE_FRAME_OVERHEAD_V1] != frame_header(ctx, kind.purpose(), n)? {
        return Err(GameCertificateVerdictV1::Frame.into());
    }
    norito::decode_canonical_with_limits(
        &bytes[GAME_CERTIFICATE_FRAME_OVERHEAD_V1..],
        kind.limits(),
    )
    .map_err(|source| received_codec_failure(source, "game certificate lifecycle::decode decode"))
}

/// Owned purpose-4 input. The encoded body is exactly `GameManifestV1`, with no wrapper field.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameManifestCommitmentBodyV1(GameManifestV1);
impl GameManifestCommitmentBodyV1 {
    /// Take a complete manifest, checking all generic immutable geometry.
    pub fn new(
        manifest: GameManifestV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_manifest(&manifest)?;
        length(Kind::Manifest, &manifest)?;
        Ok(Self(manifest))
    }
    /// Exact manifest hashed by purpose 4.
    pub const fn manifest(&self) -> &GameManifestV1 {
        &self.0
    }
    /// Stream the complete canonical manifest under the trusted network/session frame.
    pub fn commitment(
        &self,
        ctx: &GameCertificateContextV1,
    ) -> ExecutionResult<GameManifestCommitmentV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        validate_manifest(&self.0)?;
        digest(ctx, Kind::Manifest, &self.0).map(GameManifestCommitmentV1::from_commitment)
    }
    /// Decode one exact framed manifest; this does not register a profile or open a session.
    pub fn decode_framed(
        ctx: &GameCertificateContextV1,
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        Self::new(decode(ctx, Kind::Manifest, bytes)?)
    }
}
fn validate_manifest(
    m: &GameManifestV1,
) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
    if m.application_parameters.len() > GAME_MANIFEST_MAX_PARAMETERS_BYTES_V1 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    if m.version != 1
        || m.min_participants == 0
        || m.min_participants > m.max_participants
        || usize::from(m.max_participants) > GAME_MAX_PARTICIPANTS_V1
        || m.batch_ticks == 0
        || m.batch_ticks > 256
        || m.max_ticks == 0
        || m.max_ticks > 1_000_000
        || m.max_ticks % u32::from(m.batch_ticks) != 0
        || m.max_input_bytes == 0
        || m.max_input_bytes > 4096
        || m.max_participant_data_bytes > 4096
    {
        return Err(GameCertificateVerdictV1::Geometry.into());
    }
    let batches = m.max_ticks / u32::from(m.batch_ticks);
    let inputs = u64::from(batches) * u64::from(m.max_participants) * u64::from(m.max_input_bytes);
    if batches > 4096 || inputs > 4 * 1024 * 1024 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    if let GameAccessV1::Invite(key) = &m.access {
        if key.try_algorithm().map_err(|source| {
            ExecutionFailure::Aborted(GameCertificateAbortV1::PublicKey { source })
        })? != Algorithm::Ed25519
        {
            return Err(GameCertificateVerdictV1::Signature.into());
        }
    }
    Ok(())
}

/// Owned purpose-5 input. The encoded body is exactly the complete original admission.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameAdmissionCommitmentBodyV1(GameAdmissionBodyV1);
impl GameAdmissionCommitmentBodyV1 {
    /// Take a bounded immutable original admission; empty lobby admission is not active scope.
    pub fn new(
        admission: GameAdmissionBodyV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        if admission.participants.is_empty() {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        admission.validate().map_err(|failure| {
            failure
                .map_deterministic(GameCertificateVerdictV1::Admission)
                .map_abort(GameCertificateAbortV1::Admission)
        })?;
        length(Kind::Admission, &admission)?;
        Ok(Self(admission))
    }
    /// Exact original admission hashed by purpose 5.
    pub const fn admission(&self) -> &GameAdmissionBodyV1 {
        &self.0
    }
    /// Stream the exact immutable original admission, including wager and equipment facts.
    pub fn commitment(
        &self,
        ctx: &GameCertificateContextV1,
    ) -> ExecutionResult<GameAdmissionCommitmentV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        self.0.validate().map_err(|failure| {
            failure
                .map_deterministic(GameCertificateVerdictV1::Admission)
                .map_abort(GameCertificateAbortV1::Admission)
        })?;
        digest(ctx, Kind::Admission, &self.0).map(GameAdmissionCommitmentV1::from_commitment)
    }
    /// Decode the bounded complete admission without sorting or normalizing it.
    pub fn decode_framed(
        ctx: &GameCertificateContextV1,
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        Self::new(decode(ctx, Kind::Admission, bytes)?)
    }
}

/// Bound all history owners before cloning their canonical dispute projection.
fn validate_history_retention(
    epoch: u64,
    anchors: &[GameCheckpointAnchorV1],
    certified: &[GameCertifiedBatchV1],
    forced: &[GameForcedBatchV1],
) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
    if anchors.len() >= GAME_HISTORY_MAX_BATCHES_V1
        || certified
            .len()
            .checked_add(forced.len())
            .is_none_or(|n| n > GAME_HISTORY_MAX_BATCHES_V1)
        || anchors.iter().any(|a| a.tick == 0 || a.epoch > epoch)
        || anchors
            .windows(2)
            .any(|w| w[0].tick >= w[1].tick || w[0].epoch > w[1].epoch)
        || certified.iter().any(|b| b.epoch > epoch)
        || certified
            .windows(2)
            .any(|w| w[0].start_tick >= w[1].start_tick || w[0].epoch > w[1].epoch)
    {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    let mut bytes = 0usize;
    let mut starts = std::collections::BTreeSet::new();
    for (start, inputs) in certified
        .iter()
        .map(|b| (b.start_tick, &b.inputs))
        .chain(forced.iter().map(|b| (b.start_tick, &b.inputs)))
    {
        if !starts.insert(start) || inputs.is_empty() || inputs.len() > GAME_MAX_PARTICIPANTS_V1 {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        for input in inputs {
            if input.len() > GAME_CERTIFICATE_MAX_INPUT_BYTES_V1 {
                return Err(GameCertificateVerdictV1::Bound.into());
            }
            bytes = bytes.checked_add(input.len()).ok_or_else(|| {
                native_failure(norito::NativeCodecFailure::CapacityOverflow {
                    context: "game certificate computed capacity",
                })
            })?;
            if bytes > GAME_HISTORY_MAX_INPUT_BYTES_V1 {
                return Err(GameCertificateVerdictV1::Bound.into());
            }
        }
    }
    if forced
        .iter()
        .any(|b| b.dnf_slots.len() > GAME_MAX_PARTICIPANTS_V1)
    {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    Ok(())
}

/// Complete retained purpose-6 projection; complete record binding covers pending certificates and reveals.
#[derive(Debug, Clone, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameDisputeCommitmentBodyV1 {
    manifest: GameManifestCommitmentV1,
    admission: Option<GameAdmissionCommitmentV1>,
    epoch: u64,
    checkpoint: Option<GameCheckpointCertificateBodyV1>,
    checkpoint_history: Vec<GameCheckpointAnchorV1>,
    certified_batches: Vec<GameCertifiedBatchV1>,
    forced_batches: Vec<GameForcedBatchV1>,
}
impl GameDisputeCommitmentBodyV1 {
    /// Own the exact projection. No pending frontier, input or source-record field is discarded by a transition here.
    pub fn new(
        manifest: GameManifestCommitmentV1,
        admission: Option<GameAdmissionCommitmentV1>,
        epoch: u64,
        checkpoint: Option<GameCheckpointCertificateBodyV1>,
        checkpoint_history: Vec<GameCheckpointAnchorV1>,
        certified_batches: Vec<GameCertifiedBatchV1>,
        forced_batches: Vec<GameForcedBatchV1>,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let body = Self {
            manifest,
            admission,
            epoch,
            checkpoint,
            checkpoint_history,
            certified_batches,
            forced_batches,
        };
        body.validate()?;
        length(Kind::Dispute, &body)?;
        Ok(body)
    }
    /// Project a trusted ledger record without omitting any forced batch or anchor.
    ///
    /// Complete-record binding separately covers phase, revision, pending frontier,
    /// current commitments/reveals, signatures and economics. This function never
    /// clears or replaces any of them, and it does not authenticate ledger origin.
    pub fn from_ledger(
        expected_network: &NetworkId,
        record: &GameSessionRecordV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        if &record.network_id != expected_network {
            return Err(GameCertificateVerdictV1::Frame.into());
        }
        let ctx = GameCertificateContextV1 {
            network: record.network_id,
            session_id: record.session_id,
        };
        validate_manifest(&record.manifest)?;
        if digest(&ctx, Kind::Manifest, &record.manifest)?
            != *record.manifest_commitment.commitment()
            || record.profile_id != record.manifest.profile_id
        {
            return Err(GameCertificateVerdictV1::Frame.into());
        }
        let checkpoint = if record.admission_commitment.is_some() {
            let active = GameSessionCertificateContextV1::from_ledger(expected_network, record)?;
            record
                .checkpoint
                .as_ref()
                .map(|signed| active.checkpoint_body(&signed.checkpoint))
                .transpose()?
        } else {
            if !matches!(record.phase, GamePhaseV1::Lobby | GamePhaseV1::Cancelled)
                || record.checkpoint.is_some()
            {
                return Err(GameCertificateVerdictV1::Geometry.into());
            }
            None
        };
        // Reject attacker-sized nested vectors before any projection clone. Full
        // geometry is rechecked on the owned body; no fields are normalized.
        validate_history_retention(
            record.epoch,
            &record.checkpoint_history,
            &record.certified_batches,
            &record.forced_batches,
        )?;
        Self::new(
            record.manifest_commitment,
            record.admission_commitment,
            record.epoch,
            checkpoint,
            record.checkpoint_history.clone(),
            record.certified_batches.clone(),
            record.forced_batches.clone(),
        )
    }
    /// Exact frozen manifest identity.
    pub const fn manifest(&self) -> &GameManifestCommitmentV1 {
        &self.manifest
    }
    /// Explicit absence before Start; no invented empty admission digest.
    pub const fn admission(&self) -> Option<GameAdmissionCommitmentV1> {
        self.admission
    }
    /// Consensus epoch retained by the record.
    pub const fn epoch(&self) -> u64 {
        self.epoch
    }
    /// Exact retained unsigned checkpoint claim.
    pub const fn checkpoint(&self) -> Option<&GameCheckpointCertificateBodyV1> {
        self.checkpoint.as_ref()
    }
    /// Complete superseded checkpoints, retaining input and simulation state roots.
    pub fn checkpoint_history(&self) -> &[GameCheckpointAnchorV1] {
        &self.checkpoint_history
    }
    /// Complete accepted cooperative controls from consumed certified frontiers.
    pub fn certified_batches(&self) -> &[GameCertifiedBatchV1] {
        &self.certified_batches
    }
    /// Complete immutable forced progress, preserving original slots and epochs.
    pub fn forced_batches(&self) -> &[GameForcedBatchV1] {
        &self.forced_batches
    }
    /// Hash the complete projection. This is not a substitute for complete record identity.
    pub fn commitment(
        &self,
        ctx: &GameCertificateContextV1,
    ) -> ExecutionResult<GameDisputeCommitmentV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        self.validate()?;
        digest(ctx, Kind::Dispute, self).map(GameDisputeCommitmentV1::from_commitment)
    }
    /// Decode the exact purpose-6 projection with bounded allocations before local geometry checks.
    pub fn decode_framed(
        ctx: &GameCertificateContextV1,
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let body: Self = decode(ctx, Kind::Dispute, bytes)?;
        body.validate()?;
        Ok(body)
    }
    fn validate(&self) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_history_retention(
            self.epoch,
            &self.checkpoint_history,
            &self.certified_batches,
            &self.forced_batches,
        )?;
        if self.admission.is_none()
            && (self.epoch != 0
                || self.checkpoint.is_some()
                || !self.checkpoint_history.is_empty()
                || !self.certified_batches.is_empty()
                || !self.forced_batches.is_empty())
        {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        if let Some(cp) = &self.checkpoint {
            if Some(cp.scope().admission) != self.admission
                || cp.scope().manifest != self.manifest
                || cp.epoch() > self.epoch
            {
                return Err(GameCertificateVerdictV1::Geometry.into());
            }
        }
        if self
            .checkpoint_history
            .windows(2)
            .any(|p| p[0].tick >= p[1].tick)
        {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        let mut previous = None;
        let mut slots = None;
        let mut removed = [false; 32];
        let mut bytes = 0usize;
        for batch in &self.forced_batches {
            if batch.inputs.is_empty() || batch.inputs.len() > 32 || batch.dnf_slots.len() > 32 {
                return Err(GameCertificateVerdictV1::Slot.into());
            }
            if batch.epoch >= self.epoch
                || previous
                    .is_some_and(|(tick, epoch)| batch.start_tick <= tick || batch.epoch <= epoch)
                || slots.is_some_and(|n| n != batch.inputs.len())
            {
                return Err(GameCertificateVerdictV1::Geometry.into());
            }
            previous = Some((batch.start_tick, batch.epoch));
            slots = Some(batch.inputs.len());
            let mut prior = None;
            for slot in &batch.dnf_slots {
                let i = usize::from(*slot);
                if i >= batch.inputs.len() || prior.is_some_and(|old| *slot <= old) || removed[i] {
                    return Err(GameCertificateVerdictV1::Slot.into());
                }
                prior = Some(*slot);
                removed[i] = true;
            }
            for (i, input) in batch.inputs.iter().enumerate() {
                if input.len() > 4096 {
                    return Err(GameCertificateVerdictV1::Bound.into());
                }
                if removed[i] && !input.is_empty() {
                    return Err(GameCertificateVerdictV1::Geometry.into());
                }
                bytes = bytes.checked_add(input.len()).ok_or_else(|| {
                    native_failure(norito::NativeCodecFailure::CapacityOverflow {
                        context: "game certificate computed capacity",
                    })
                })?;
                if bytes > 4 * 1024 * 1024 {
                    return Err(GameCertificateVerdictV1::Bound.into());
                }
            }
        }
        Ok(())
    }
}

/// Scope-bound complete proved outcome, with ordered permanent original winner slots.
#[derive(Debug, Clone, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameOutcomeCommitmentBodyV1 {
    scope: GameActiveScopeV1,
    outcome: GameOutcomeV1,
}
impl GameOutcomeCommitmentBodyV1 {
    /// Own the complete result without interpreting adapter-specific result bytes.
    pub fn new(
        scope: GameActiveScopeV1,
        outcome: GameOutcomeV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let body = Self { scope, outcome };
        body.validate()?;
        length(Kind::Outcome, &body)?;
        Ok(body)
    }
    /// Exact manifest and original admission proved by the selected relation.
    pub const fn scope(&self) -> &GameActiveScopeV1 {
        &self.scope
    }
    /// Complete original outcome without truncation or sorting.
    pub const fn outcome(&self) -> &GameOutcomeV1 {
        &self.outcome
    }
    /// Stream the complete purpose-7 body; the adapter still proves winner eligibility.
    pub fn commitment(
        &self,
        ctx: &GameCertificateContextV1,
    ) -> ExecutionResult<GameOutcomeCommitmentV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        self.validate()?;
        digest(ctx, Kind::Outcome, self).map(GameOutcomeCommitmentV1::from_commitment)
    }
    /// Decode exact framed outcome bytes with independent result and winner bounds.
    pub fn decode_framed(
        ctx: &GameCertificateContextV1,
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let body: Self = decode(ctx, Kind::Outcome, bytes)?;
        body.validate()?;
        Ok(body)
    }
    fn validate(&self) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        if self.outcome.result.len() > GAME_OUTCOME_MAX_RESULT_BYTES_V1
            || self.outcome.winner_slots.len() > 32
        {
            return Err(GameCertificateVerdictV1::Bound.into());
        }
        if self.outcome.winner_slots.iter().any(|s| *s >= 32)
            || self.outcome.winner_slots.windows(2).any(|p| p[0] >= p[1])
        {
            return Err(GameCertificateVerdictV1::Slot.into());
        }
        Ok(())
    }
}

/// Context reconstructed from a trusted ledger record, never chosen from a peer packet.
///
/// This value checks commitment consistency, not ledger finality or participant
/// authority. Obtaining the record from consensus (or verifying its finalized
/// inclusion) and enforcing all lifecycle acceptance rules remain caller duties.
#[derive(Debug, Clone, Copy)]
pub struct GameSessionCertificateContextV1 {
    context: GameCertificateContextV1,
    scope: GameActiveScopeV1,
    epoch: u64,
    slots: usize,
}
impl GameSessionCertificateContextV1 {
    /// Require the caller's trusted network and recompute both immutable commitments.
    pub fn from_ledger(
        expected_network: &NetworkId,
        record: &GameSessionRecordV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        if &record.network_id != expected_network
            || matches!(record.phase, GamePhaseV1::Lobby | GamePhaseV1::Cancelled)
        {
            return Err(GameCertificateVerdictV1::Frame.into());
        }
        let context = GameCertificateContextV1 {
            network: record.network_id,
            session_id: record.session_id,
        };
        validate_manifest(&record.manifest)?;
        if digest(&context, Kind::Manifest, &record.manifest)?
            != *record.manifest_commitment.commitment()
            || record.profile_id != record.manifest.profile_id
        {
            return Err(GameCertificateVerdictV1::Frame.into());
        }
        preflight_admission_projection(record)?;
        let original =
            GameAdmissionCommitmentBodyV1::new(GameAdmissionBodyV1::from_session(record))?;
        let admission = original.commitment(&context)?;
        if record.admission_commitment != Some(admission)
            || record.participants.len() < usize::from(record.manifest.min_participants)
            || record.participants.len() > usize::from(record.manifest.max_participants)
        {
            return Err(GameCertificateVerdictV1::Frame.into());
        }
        Ok(Self {
            context,
            scope: GameActiveScopeV1 {
                manifest: record.manifest_commitment,
                admission,
            },
            epoch: record.epoch,
            slots: record.participants.len(),
        })
    }
    /// Trusted outer network/session context reconstructed from the retained record.
    pub const fn context(&self) -> &GameCertificateContextV1 {
        &self.context
    }
    /// Recomputed manifest and original admission commitments.
    pub const fn scope(&self) -> GameActiveScopeV1 {
        self.scope
    }
    fn check(
        &self,
        session: Hash,
        scope: GameActiveScopeV1,
    ) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        if session != self.context.session_id || scope != self.scope {
            return Err(GameCertificateVerdictV1::Frame.into());
        }
        Ok(())
    }
    /// Build the exact checkpoint claim. Current versus historical epoch/tick rules belong to the caller.
    pub fn checkpoint_body(
        &self,
        cp: &GameCheckpointV1,
    ) -> ExecutionResult<
        GameCheckpointCertificateBodyV1,
        GameCertificateVerdictV1,
        GameCertificateAbortV1,
    > {
        self.check(cp.session_id, cp.scope)?;
        Ok(GameCheckpointCertificateBodyV1::new(
            self.scope,
            cp.epoch,
            cp.tick,
            cp.transcript_root,
            cp.state_root,
            cp.terminal,
        ))
    }
    /// Build the exact directly signed checkpoint frame after context equality checks.
    pub fn checkpoint_message(
        &self,
        cp: &GameCheckpointV1,
    ) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        self.checkpoint_body(cp)?.message(&self.context)
    }
    /// Build the exact pending frontier; every permanent original slot is required.
    pub fn commitment_set_body(
        &self,
        set: &GameCommitmentSetV1,
    ) -> ExecutionResult<
        GameCommitmentSetCertificateBodyV1,
        GameCertificateVerdictV1,
        GameCertificateAbortV1,
    > {
        self.check(set.session_id, set.scope)?;
        if set.commitments.len() != self.slots {
            return Err(GameCertificateVerdictV1::Slot.into());
        }
        GameCommitmentSetCertificateBodyV1::new(
            self.scope,
            set.epoch,
            set.start_tick,
            set.parent_transcript_root,
            &set.commitments,
        )
    }
    /// Build the purpose-103 frame without dropping any pending commitment.
    pub fn commitment_set_message(
        &self,
        set: &GameCommitmentSetV1,
    ) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        self.commitment_set_body(set)?.message(&self.context)
    }
    /// Build the exact retained digest's directly signed frame; no disclosed preimage is required.
    pub fn input_commitment_message(
        &self,
        input: &GameInputCommitmentV1,
    ) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        self.check(input.session_id, input.scope)?;
        if usize::from(input.slot) >= self.slots {
            return Err(GameCertificateVerdictV1::Slot.into());
        }
        GameInputCommitmentCertificateBodyV1::new(
            self.scope,
            input.epoch,
            input.start_tick,
            input.slot,
            input.commitment,
        )?
        .message(&self.context)
    }
    /// Construct a matching-reveal preimage. Anyone may submit it; no extra reveal signature is required.
    pub fn input_preimage(
        &self,
        input: &GameInputRevealV1,
    ) -> ExecutionResult<GameInputPreimageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        self.check(input.session_id, input.scope)?;
        if usize::from(input.slot) >= self.slots {
            return Err(GameCertificateVerdictV1::Slot.into());
        }
        GameInputPreimageV1::new(
            self.scope,
            input.epoch,
            input.start_tick,
            input.slot,
            &input.payload,
            input.nonce,
        )
    }
    /// Challenge signing bytes derive the epoch and scope from the ledger, not the submitted packet.
    pub fn challenge_message(
        &self,
        slot: u8,
    ) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        if usize::from(slot) >= self.slots {
            return Err(GameCertificateVerdictV1::Slot.into());
        }
        GameChallengeCertificateBodyV1::new(self.scope, self.epoch, slot)?.message(&self.context)
    }
}
fn preflight_admission_projection(
    record: &GameSessionRecordV1,
) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
    if record.participants.len() > 32
        || record.item_stakes.len() > 32
        || record.resources.len() > GAME_MAX_RESOURCE_RECORDS_V1
    {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    for p in &record.participants {
        if p.application_data.len() > usize::from(record.manifest.max_participant_data_bytes)
            || norito::canonical_frame_len(&p.account).map_err(|source| {
                computed_codec_failure(
                    source,
                    "game certificate lifecycle::preflight_admission_projection count",
                )
            })? > GAME_ADMISSION_MAX_ACCOUNT_ENCODED_BYTES_V1
            || norito::canonical_frame_len(&p.input_key).map_err(|source| {
                computed_codec_failure(
                    source,
                    "game certificate lifecycle::preflight_admission_projection count",
                )
            })? > 1024
        {
            return Err(GameCertificateVerdictV1::Bound.into());
        }
    }
    for nft in record
        .item_stakes
        .iter()
        .map(|s| &s.nft_id)
        .chain(record.resources.iter().map(|r| &r.nft_id))
    {
        if norito::canonical_frame_len(nft).map_err(|source| {
            computed_codec_failure(
                source,
                "game certificate lifecycle::preflight_admission_projection count",
            )
        })? > GAME_ADMISSION_MAX_NFT_ENCODED_BYTES_V1
        {
            return Err(GameCertificateVerdictV1::Bound.into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
