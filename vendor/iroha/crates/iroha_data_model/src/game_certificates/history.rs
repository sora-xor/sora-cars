//! Typed linear transcript and opaque adapter-state commitment claims.
//!
//! Construction establishes generic shape, never ledger origin or adapter validity.
use super::*;

pub mod transcript;
pub use transcript::*;

/// Maximum exact opaque adapter-state bytes carried by the purpose-3 body.
pub const GAME_STATE_COMMITMENT_MAX_STATE_BYTES_V1: usize = 512 * 1024;
/// Maximum complete purpose-3 frame, including the 97-byte game header.
pub const GAME_STATE_COMMITMENT_MAX_FRAME_BYTES_V1: usize = 1024 * 1024;
/// Explicit cumulative decode allocation ceiling, not a measured memory estimate.
pub const GAME_STATE_COMMITMENT_DECODE_ALLOCATION_BYTES_V1: usize = 8 * 1024 * 1024;

#[derive(Clone, Copy)]
enum BodyKind {
    State,
}
impl BodyKind {
    const fn purpose(self) -> GameCertificatePurposeV1 {
        GameCertificatePurposeV1::State
    }
    const fn frame_limit(self) -> usize {
        GAME_STATE_COMMITMENT_MAX_FRAME_BYTES_V1
    }
    const fn decode_limits(self) -> norito::DecodeLimits {
        norito::DecodeLimits::new(
            GAME_STATE_COMMITMENT_MAX_STATE_BYTES_V1,
            self.frame_limit(),
            GAME_STATE_COMMITMENT_MAX_STATE_BYTES_V1,
            GAME_STATE_COMMITMENT_DECODE_ALLOCATION_BYTES_V1,
            16,
        )
    }
}

fn body_length<T: norito::NoritoSerialize>(
    kind: BodyKind,
    body: &T,
) -> ExecutionResult<usize, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let length = norito::canonical_frame_len(body).map_err(|source| {
        computed_codec_failure(source, "game certificate history::body_length count")
    })?;
    if length > kind.frame_limit() - GAME_CERTIFICATE_FRAME_OVERHEAD_V1 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    Ok(length)
}

fn digest<T: norito::NoritoSerialize>(
    context: &GameCertificateContextV1,
    kind: BodyKind,
    body: &T,
) -> ExecutionResult<GameCommitmentV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let length = body_length(kind, body)?;
    let mut state = Sha3_384State::new();
    state.update(&frame_header(context, kind.purpose(), length)?);
    let mut sink = DigestWriter {
        state,
        remaining: length,
    };
    norito::core::write_canonical_to_writer(body, &mut sink).map_err(|source| {
        computed_codec_failure(source, "game certificate history::digest encode")
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
    let length = bytes
        .len()
        .checked_sub(GAME_CERTIFICATE_FRAME_OVERHEAD_V1)
        .ok_or_else(|| ExecutionFailure::Deterministic(GameCertificateVerdictV1::Frame))?;
    if bytes.len() > kind.frame_limit() {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    if bytes[..GAME_CERTIFICATE_FRAME_OVERHEAD_V1] != frame_header(context, kind.purpose(), length)?
    {
        return Err(GameCertificateVerdictV1::Frame.into());
    }
    norito::decode_canonical_with_limits(
        &bytes[GAME_CERTIFICATE_FRAME_OVERHEAD_V1..],
        kind.decode_limits(),
    )
    .map_err(|source| received_codec_failure(source, "game certificate history::decode decode"))
}

/// Exact opaque adapter-state bytes at a claimed tick, under a frozen active scope.
///
/// The bytes may be empty or not encode any Norito schema. Only the enclosing
/// body's encoding is checked here. A compiled adapter must validate its own
/// canonical state schema and semantics before admission or proof use.
#[derive(Debug, Clone, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameAdapterStateCommitmentBodyV1 {
    scope: GameActiveScopeV1,
    tick: u32,
    adapter_state: Vec<u8>,
}
impl GameAdapterStateCommitmentBodyV1 {
    /// Copy exact bounded opaque bytes without parsing or normalizing an adapter schema.
    pub fn new(
        scope: GameActiveScopeV1,
        tick: u32,
        adapter_state: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_state_length(adapter_state.len())?;
        let mut owned =
            allocate_certificate_vec(adapter_state.len(), "game certificate history owned")?;
        owned.extend_from_slice(adapter_state);
        let body = Self {
            scope,
            tick,
            adapter_state: owned,
        };
        body_length(BodyKind::State, &body)?;
        Ok(body)
    }
    /// Claimed frozen manifest and original admission.
    #[must_use]
    pub const fn scope(&self) -> &GameActiveScopeV1 {
        &self.scope
    }
    /// Claimed adapter-state tick, checked against actual computation by the adapter.
    #[must_use]
    pub const fn tick(&self) -> u32 {
        self.tick
    }
    /// Exact unvalidated opaque bytes; no valid-state brand is returned.
    #[must_use]
    pub fn adapter_state(&self) -> &[u8] {
        &self.adapter_state
    }
    /// Commit exact purpose-3 bytes after rechecking the independent opaque byte bound.
    pub fn commitment(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameStateRootV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_state_length(self.adapter_state.len())?;
        digest(context, BodyKind::State, self).map(GameStateRootV1::from_commitment)
    }
    /// Decode an exact canonical purpose-3 outer body while preserving opaque state bytes.
    pub fn decode_framed(
        context: &GameCertificateContextV1,
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let body: Self = decode(context, BodyKind::State, bytes)?;
        validate_state_length(body.adapter_state.len())?;
        Ok(body)
    }
}
fn validate_state_length(
    length: usize,
) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
    if length > GAME_STATE_COMMITMENT_MAX_STATE_BYTES_V1 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    Ok(())
}

#[cfg(test)]
mod tests;
