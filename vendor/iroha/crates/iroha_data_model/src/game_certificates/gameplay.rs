//! Typed gameplay certificate claims and packet association identifiers.
//!
//! These builders authenticate exact claims, not ledger state. The consumer must
//! check the frozen scope, current epoch/tick, original roster, all required input
//! key signatures, phase/deadline rules and checkpoint/frontier association.
//! TODO: migrate the native lifecycle, history validators and SDK together before
//! an admitted profile references this suite. No old-message fallback is provided.

use super::*;

/// Maximum permanent original slots carried by a complete commitment set.
pub const GAME_CERTIFICATE_MAX_ORIGINAL_SLOTS_V1: usize = 32;
/// Maximum complete canonical checkpoint body, excluding the outer game frame.
pub const GAME_CHECKPOINT_CERTIFICATE_MAX_BODY_BYTES_V1: usize = 4 * 1024;
/// Maximum complete canonical commitment-set body, excluding the outer game frame.
pub const GAME_COMMITMENT_SET_CERTIFICATE_MAX_BODY_BYTES_V1: usize = 32 * 1024;
/// Maximum complete canonical challenge body, excluding the outer game frame.
pub const GAME_CHALLENGE_CERTIFICATE_MAX_BODY_BYTES_V1: usize = 2 * 1024;

#[derive(Clone, Copy)]
enum BodyKind {
    Checkpoint,
    CommitmentSet,
    Challenge,
}
impl BodyKind {
    const fn purpose(self) -> GameCertificatePurposeV1 {
        match self {
            Self::Checkpoint => GameCertificatePurposeV1::Checkpoint,
            Self::CommitmentSet => GameCertificatePurposeV1::CommitmentSet,
            Self::Challenge => GameCertificatePurposeV1::Challenge,
        }
    }
    const fn body_limit(self) -> usize {
        match self {
            Self::Checkpoint => GAME_CHECKPOINT_CERTIFICATE_MAX_BODY_BYTES_V1,
            Self::CommitmentSet => GAME_COMMITMENT_SET_CERTIFICATE_MAX_BODY_BYTES_V1,
            Self::Challenge => GAME_CHALLENGE_CERTIFICATE_MAX_BODY_BYTES_V1,
        }
    }
    const fn decode_limits(self) -> norito::DecodeLimits {
        // The sole dynamic sequence is the commitment set. Fixed [u8; 48]
        // commitments decode directly into stack arrays, not dynamic sequences.
        // Allocation budgets also cover bounded temporary canonical decode buffers;
        // they are explicit ceilings, not measured memory or exact size claims.
        let (sequence, total, allocations) = match self {
            Self::Checkpoint => (0, 0, 64 * 1024),
            Self::CommitmentSet => (32, 32, 512 * 1024),
            Self::Challenge => (0, 0, 32 * 1024),
        };
        norito::DecodeLimits::new(sequence, self.body_limit(), total, allocations, 16)
    }
}

fn bounded_length<T: norito::NoritoSerialize>(
    kind: BodyKind,
    body: &T,
) -> ExecutionResult<usize, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let length = checked_body_length(body)?;
    if length > kind.body_limit() {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    Ok(length)
}

fn message<T: norito::NoritoSerialize>(
    context: &GameCertificateContextV1,
    kind: BodyKind,
    body: &T,
) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
    bounded_length(kind, body)?;
    encode_message(context, kind.purpose(), body)
}

fn association_digest<T: norito::NoritoSerialize>(
    context: &GameCertificateContextV1,
    kind: BodyKind,
    body: &T,
) -> ExecutionResult<GameCommitmentV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let purpose = match kind {
        BodyKind::Checkpoint => GameCertificatePurposeV1::CheckpointId,
        BodyKind::CommitmentSet => GameCertificatePurposeV1::FrontierId,
        BodyKind::Challenge => return Err(GameCertificateVerdictV1::Frame.into()),
    };
    let length = bounded_length(kind, body)?;
    let mut state = Sha3_384State::new();
    state.update(&frame_header(context, purpose, length)?);
    let mut sink = DigestWriter {
        state,
        remaining: length,
    };
    norito::core::write_canonical_to_writer(body, &mut sink).map_err(|source| {
        computed_codec_failure(
            source,
            "game certificate gameplay::association_digest encode",
        )
    })?;
    if sink.remaining != 0 {
        return Err(native_failure(norito::NativeCodecFailure::Invariant {
            context: "game certificate encoding did not fill its measured destination",
        }));
    }
    Ok(GameCommitmentV1::from_bytes(sink.state.finalize()))
}

fn decode<T>(
    context: &GameCertificateContextV1,
    kind: BodyKind,
    bytes: &[u8],
) -> ExecutionResult<T, GameCertificateVerdictV1, GameCertificateAbortV1>
where
    T: norito::NoritoSerialize + for<'de> norito::NoritoDeserialize<'de>,
{
    // Bound this purpose before handing an attacker-controlled body to Norito.
    let length = bytes
        .len()
        .checked_sub(GAME_CERTIFICATE_FRAME_OVERHEAD_V1)
        .ok_or_else(|| ExecutionFailure::Deterministic(GameCertificateVerdictV1::Frame))?;
    if length > kind.body_limit() {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    let body = decode_message_body(context, kind.purpose(), bytes)?;
    norito::decode_canonical_with_limits(body, kind.decode_limits()).map_err(|source| {
        received_codec_failure(source, "game certificate gameplay::decode decode")
    })
}

/// Exact jointly signed checkpoint claim, excluding its signature set.
///
/// Network and session identity occur once in the independently supplied frame.
/// A terminal claim still requires a valid execution proof; genesis signatures,
/// current geometry and original-participant consent are consumer policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameCheckpointCertificateBodyV1 {
    scope: GameActiveScopeV1,
    epoch: u64,
    tick: u32,
    transcript_root: GameTranscriptRootV1,
    state_root: GameStateRootV1,
    terminal: bool,
}
impl GameCheckpointCertificateBodyV1 {
    /// Construct an exact claim without imposing application-specific tick geometry.
    #[must_use]
    pub const fn new(
        scope: GameActiveScopeV1,
        epoch: u64,
        tick: u32,
        transcript_root: GameTranscriptRootV1,
        state_root: GameStateRootV1,
        terminal: bool,
    ) -> Self {
        Self {
            scope,
            epoch,
            tick,
            transcript_root,
            state_root,
            terminal,
        }
    }
    /// Claimed frozen manifest and original admission.
    #[must_use]
    pub const fn scope(&self) -> &GameActiveScopeV1 {
        &self.scope
    }
    /// Claimed consensus-owned generation.
    #[must_use]
    pub const fn epoch(&self) -> u64 {
        self.epoch
    }
    /// Claimed cumulative accepted-input boundary.
    #[must_use]
    pub const fn tick(&self) -> u32 {
        self.tick
    }
    /// Claimed transcript commitment at this exact tick.
    #[must_use]
    pub const fn transcript_root(&self) -> &GameTranscriptRootV1 {
        &self.transcript_root
    }
    /// Claimed adapter state commitment at this exact tick.
    #[must_use]
    pub const fn state_root(&self) -> &GameStateRootV1 {
        &self.state_root
    }
    /// Whether the signers claim a terminal prefix.
    #[must_use]
    pub const fn terminal(&self) -> bool {
        self.terminal
    }
    /// Build the complete canonical purpose-104 bytes for direct Ed25519 signing.
    pub fn message(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        message(context, BodyKind::Checkpoint, self)
    }
    /// Hash the same exact body with purpose 8; this identifier is never signing bytes.
    pub fn association_id(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameCheckpointIdV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
        association_digest(context, BodyKind::Checkpoint, self)
            .map(GameCheckpointIdV1::from_commitment)
    }
    /// Decode an exact canonical purpose-104 claim under checkpoint-specific limits.
    ///
    /// The returned claim is not authenticated until its signatures and current
    /// independently selected ledger context have both been checked.
    pub fn decode_message(
        context: &GameCertificateContextV1,
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        decode(context, BodyKind::Checkpoint, bytes)
    }
}

/// Exact jointly signed pending input set, excluding its signature set.
///
/// Vector position is the permanent original slot, including removed players.
/// No sorting, deduplication, missing entries or live-roster compaction occurs.
/// Consumers require the exact original roster length and retain this entire set
/// alongside its checkpoint; the association identifier cannot replace either.
#[derive(Debug, Clone, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameCommitmentSetCertificateBodyV1 {
    scope: GameActiveScopeV1,
    epoch: u64,
    start_tick: u32,
    parent_transcript_root: GameTranscriptRootV1,
    commitments: Vec<GameInputDigestV1>,
}
impl GameCommitmentSetCertificateBodyV1 {
    /// Copy one bounded, nonempty complete original-slot vector without normalization.
    pub fn new(
        scope: GameActiveScopeV1,
        epoch: u64,
        start_tick: u32,
        parent_transcript_root: GameTranscriptRootV1,
        commitments: &[GameInputDigestV1],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_commitment_count(commitments.len())?;
        let mut owned =
            allocate_certificate_vec(commitments.len(), "game certificate gameplay owned")?;
        owned.extend_from_slice(commitments);
        Ok(Self {
            scope,
            epoch,
            start_tick,
            parent_transcript_root,
            commitments: owned,
        })
    }
    /// Claimed frozen manifest and original admission.
    #[must_use]
    pub const fn scope(&self) -> &GameActiveScopeV1 {
        &self.scope
    }
    /// Claimed consensus-owned generation of this pending set.
    #[must_use]
    pub const fn epoch(&self) -> u64 {
        self.epoch
    }
    /// First tick controlled by this exact pending set.
    #[must_use]
    pub const fn start_tick(&self) -> u32 {
        self.start_tick
    }
    /// Claimed root of the checkpoint that this pending set extends.
    #[must_use]
    pub const fn parent_transcript_root(&self) -> &GameTranscriptRootV1 {
        &self.parent_transcript_root
    }
    /// Borrow all original-slot digests in the supplied permanent order.
    #[must_use]
    pub fn commitments(&self) -> &[GameInputDigestV1] {
        &self.commitments
    }
    /// Build complete purpose-103 signing bytes after rechecking vector geometry.
    pub fn message(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        validate_commitment_count(self.commitments.len())?;
        message(context, BodyKind::CommitmentSet, self)
    }
    /// Hash the exact complete set with purpose 9; this identifier is not a signature.
    pub fn association_id(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameFrontierIdV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_commitment_count(self.commitments.len())?;
        association_digest(context, BodyKind::CommitmentSet, self)
            .map(GameFrontierIdV1::from_commitment)
    }
    /// Decode one canonical purpose-103 claim with a 32-element sequence budget.
    ///
    /// A decoded vector still needs exact original-roster and checkpoint matching;
    /// the decoder cannot select trusted scope, epoch, phase or authority itself.
    pub fn decode_message(
        context: &GameCertificateContextV1,
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let decoded: Self = decode(context, BodyKind::CommitmentSet, bytes)?;
        validate_commitment_count(decoded.commitments.len())?;
        Ok(decoded)
    }
}
fn validate_commitment_count(
    count: usize,
) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
    if count == 0 || count > GAME_CERTIFICATE_MAX_ORIGINAL_SLOTS_V1 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    Ok(())
}

/// Exact signed request to start the current epoch's checkpoint-selection window.
///
/// This purpose deliberately has no tick: the current epoch and permanent slot
/// match the native challenge semantics. Active-slot authority, Playing phase,
/// single-use transition and fixed deadline are checked against consensus state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameChallengeCertificateBodyV1 {
    scope: GameActiveScopeV1,
    epoch: u64,
    slot: u8,
}
impl GameChallengeCertificateBodyV1 {
    /// Construct a claim after checking the permanent generic slot bound.
    pub fn new(
        scope: GameActiveScopeV1,
        epoch: u64,
        slot: u8,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_challenge_slot(slot)?;
        Ok(Self { scope, epoch, slot })
    }
    /// Claimed frozen manifest and original admission.
    #[must_use]
    pub const fn scope(&self) -> &GameActiveScopeV1 {
        &self.scope
    }
    /// Consensus epoch whose selection window is being requested.
    #[must_use]
    pub const fn epoch(&self) -> u64 {
        self.epoch
    }
    /// Requesting permanent original slot; this does not establish slot authority.
    #[must_use]
    pub const fn slot(&self) -> u8 {
        self.slot
    }
    /// Build complete purpose-105 signing bytes after rechecking the slot bound.
    pub fn message(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        validate_challenge_slot(self.slot)?;
        message(context, BodyKind::Challenge, self)
    }
    /// Decode one canonical purpose-105 claim and reject an out-of-range slot.
    pub fn decode_message(
        context: &GameCertificateContextV1,
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let decoded: Self = decode(context, BodyKind::Challenge, bytes)?;
        validate_challenge_slot(decoded.slot)?;
        Ok(decoded)
    }
}
fn validate_challenge_slot(
    slot: u8,
) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
    if usize::from(slot) >= GAME_CERTIFICATE_MAX_ORIGINAL_SLOTS_V1 {
        return Err(GameCertificateVerdictV1::Slot.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests;
