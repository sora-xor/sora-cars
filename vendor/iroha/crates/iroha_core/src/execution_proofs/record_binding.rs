//! Direct, bounded, execution-owned record binding using the existing wide suite.
//!
//! This reuses a native execution primitive and makes no new soundness claim.
//! It never converts a marked ledger Hash into a purported wider commitment.

use super::{
    error::ExecutionProofErrorV1,
    guarded::accepted_history,
    stark::transparent_stark::{
        GoldilocksDigest384V1, TransparentStarkDigestContextV1, goldilocks_digest384_frame_v1,
    },
};
use iroha_data_model::{execution_proofs::ExecutionRecordBindingV1, game::GameSessionRecordV1};

/// Bind every bounded canonical source-record byte with an execution-specific
/// wide frame. Successful hashing supplies no ledger authority or proof validity.
/// Observation height and a future containing block are not input fields.
pub fn execution_record_binding_v1(
    session: &GameSessionRecordV1,
) -> Result<ExecutionRecordBindingV1, ExecutionProofErrorV1> {
    let bytes = accepted_history::canonical_record_bytes(session).map_err(|error| {
        error
            .local_abort()
            .map_or(ExecutionProofErrorV1::Envelope, ExecutionProofErrorV1::Aborted)
    })?;
    let digest = goldilocks_digest384_frame_v1(
        TransparentStarkDigestContextV1::execution_v1(b"game-record-binding-v1"),
        b"complete-canonical-record",
        b"source",
        0,
        0,
        0,
        &[&bytes],
    )
    .map_err(|_| ExecutionProofErrorV1::Statement)?;
    Ok(ExecutionRecordBindingV1 {
        bytes: digest.to_le_bytes(),
    })
}

/// Reject malformed claimed limbs even for computation-only envelope verification.
pub(crate) fn validate_binding_v1(
    binding: &ExecutionRecordBindingV1,
) -> Result<(), ExecutionProofErrorV1> {
    GoldilocksDigest384V1::from_le_bytes(binding.bytes).ok_or(ExecutionProofErrorV1::Statement)?;
    Ok(())
}
