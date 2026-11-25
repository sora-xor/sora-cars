//! Deterministic first-release admission budgets for immutable game histories.
//!
//! Counts describe canonical bytes, not allocator capacity or process RSS.
//! The transcript owner hashes one seed, each accepted event once, and a closed
//! set of checkpoint seals. A profile must separately
//! budget its state claims, proof kernel and complete request owners.

use super::GameManifestV1;

/// Maximum complete history-prefix bytes hashed by one native verification.
/// This fixed resource ceiling is not a measured verification-cost claim.
pub const GAME_HISTORY_MAX_PREFIX_HASH_BYTES_V1: usize = 128 * 1024 * 1024;
/// Generic maximum resolved batches across cooperative and forced collections.
pub const GAME_HISTORY_MAX_BATCHES_V1: usize = 4096;
/// Combined accepted payload bytes across cooperative and forced collections.
pub const GAME_HISTORY_MAX_INPUT_BYTES_V1: usize = 4 * 1024 * 1024;
/// Reserved canonical record bytes outside the three retained history vectors.
/// Admission must enforce the component premises documented below.
pub const GAME_HISTORY_METADATA_RESERVE_BYTES_V1: usize = 4 * 1024 * 1024;

/// Conservative canonical wire and prefix-work requirements for frozen geometry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GameHistoryBudgetV1 {
    /// Maximum combined number of resolved complete input batches.
    pub maximum_batches: usize,
    /// Maximum superseded non-genesis, nonterminal checkpoint count.
    pub maximum_checkpoint_history: usize,
    /// Linear upper bound of seed, event-link and eagerly cached seal frame bytes.
    pub maximum_prefix_hash_bytes: usize,
    /// Canonical encoding of all retained history vectors, without other metadata.
    pub maximum_history_encoded_bytes: usize,
    /// Complete canonical transcript frame, excluding current evidence sidecars.
    pub maximum_transcript_encoded_bytes: usize,
    /// Whole record ceiling with worst terminal metadata already reserved.
    pub maximum_record_encoded_bytes: usize,
}

fn add(a: usize, b: usize) -> Result<usize, String> {
    a.checked_add(b)
        .ok_or_else(|| "game history byte addition overflow".into())
}
fn mul(a: usize, b: usize) -> Result<usize, String> {
    a.checked_mul(b)
        .ok_or_else(|| "game history byte multiplication overflow".into())
}
fn field(n: usize) -> Result<usize, String> {
    let mut value = n;
    let mut prefix = 1;
    while value >= 128 {
        value >>= 7;
        prefix += 1;
    }
    add(prefix, n)
}
fn structure(fields: &[usize]) -> Result<usize, String> {
    fields.iter().try_fold(0, |total, &n| add(total, field(n)?))
}
fn vector(count: usize, element: usize) -> Result<usize, String> {
    add(8, mul(count, field(element)?)?)
}

/// Reject geometry whose worst legal retained history exceeds existing frames
/// or the fixed prefix-work ceiling, before accepting any participant stake.
///
/// Every nonterminal checkpoint is aligned. A selected terminal checkpoint is
/// sealed against advancement. Prepare one seed, at most B input links and P
/// one-slot removal links, and at most B+2 seals. The closed cut set contains
/// aligned cuts through T, optionally the sole partial T, and the accepted root.
/// No aligned ceil-boundary beyond a partial frontier is hashed.
///
/// # Errors
/// Rejects malformed geometry, checked arithmetic overflow or bounded work.
pub fn game_history_budget_v1(manifest: &GameManifestV1) -> Result<GameHistoryBudgetV1, String> {
    let p = usize::from(manifest.max_participants);
    let m = usize::from(manifest.max_input_bytes);
    let width = u32::from(manifest.batch_ticks);
    if manifest.version != 1
        || p == 0
        || p > 32
        || m == 0
        || m > 4096
        || width == 0
        || width > 256
        || manifest.max_ticks == 0
        || manifest.max_ticks > 1_000_000
        || manifest.max_ticks % width != 0
    {
        return Err("invalid immutable game history geometry".into());
    }
    let b = usize::try_from(manifest.max_ticks / width)
        .map_err(|_| "game history batch address space")?;
    if b > GAME_HISTORY_MAX_BATCHES_V1 || mul(mul(b, p)?, m)? > GAME_HISTORY_MAX_INPUT_BYTES_V1 {
        return Err("game history batch or accepted-payload budget exceeded".into());
    }
    // Typed game commitment = struct(struct([u8;48])). Canonical compact
    // lengths are the only accepted layout, with 40-byte Norito frames.
    let digest = structure(&[structure(&[48])?])?;
    let scope = structure(&[digest, digest])?;
    let inputs = vector(p, add(8, m)?)?;
    let row = structure(&[4, inputs])?;
    let anchor = structure(&[8, 4, digest, digest])?;
    let certified = structure(&[8, 4, digest, digest, inputs])?;
    let forced = structure(&[8, 4, inputs, add(8, p)?, add(1, field(digest)?)?])?;
    let accepted = certified.max(forced);
    // A full B allowance includes the selected checkpoint's compact projection;
    // only B-1 entries may actually appear in checkpoint_history.
    let history = structure(&[vector(b, anchor)?, vector(b, accepted)?, 8])?;
    let removals = vector(p, structure(&[4, 9])?)?;
    // Purposes 11–14 use the exact compact framing above: 97 game bytes +
    // 40 canonical Norito bytes. No old flat-prefix frame is still charged.
    let seed = add(97 + 40, structure(&[scope, 2, 4, 1, 2])?)?;
    let batch_link = add(97 + 40, structure(&[digest, 4, row])?)?;
    let removal_link = add(97 + 40, structure(&[digest, 4, structure(&[4, 9])?])?)?;
    let seal = add(97 + 40, structure(&[scope, 4, 4, 4, digest])?)?;
    let prefix_bytes = add(
        add(seed, mul(b, batch_link)?)?,
        add(mul(p, removal_link)?, mul(add(b, 2)?, seal)?)?,
    )?;
    let transcript = add(40, structure(&[vector(b, row)?, removals])?)?;
    // Deterministic whole-record reservation, independent of current occupancy:
    //   immutable admission (accounts, keys, data, NFT identities)     1,048,576
    //   complete retained resources incl. terminal release options   1,048,576
    //   32 future NFT recipients, each <=32,768 encoded bytes        1,048,576
    //   bounded manifest                                               262,144
    //   checkpoint/frontier bodies, slots and 64-byte signatures        163,840
    //   current commitments and 32 complete <=4096-byte reveals         163,840
    //   result bytes/winners and terminal result wrapper                 131,072
    //   asset and session-custody identities                               65,536
    //   all quantity/claim owners (512-bit mantissas)                       32,768
    //   NFT custody identities and remaining wager fields                  16,384
    //   outer fields/vector/option/header framing and scalar metadata       65,536
    // Total 4,046,848 <4MiB. Admission/resource projections are checked
    // before Join/Stake mutations; resource admission already reserves Some
    // release heights. Wager custody is derived single-key Ed25519 (<256
    // encoded bytes), never an arbitrary account. Recipient identities are
    // original bounded participant accounts. Do not replace those premises
    // with checks performed only after accepting funds or at settlement.
    let record = add(GAME_HISTORY_METADATA_RESERVE_BYTES_V1, history)?;
    // Keep the existing 8 MiB dispute and accepted-evidence frame limits.
    // Reservations cover fixed projection framing and maximum current sidecars;
    // full record metadata and application state claims have separate admission.
    if add(history, 64 * 1024)? > 8 * 1024 * 1024
        || add(transcript, 256 * 1024)? > 8 * 1024 * 1024
        || prefix_bytes > GAME_HISTORY_MAX_PREFIX_HASH_BYTES_V1
        || record > crate::execution_proofs::EXECUTION_RECORD_MAX_BYTES_V1
    {
        return Err("immutable game history exceeds canonical byte or prefix-work budget".into());
    }
    Ok(GameHistoryBudgetV1 {
        maximum_batches: b,
        maximum_checkpoint_history: b - 1,
        maximum_prefix_hash_bytes: prefix_bytes,
        maximum_history_encoded_bytes: history,
        maximum_transcript_encoded_bytes: transcript,
        maximum_record_encoded_bytes: record,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(players: u8, ticks: u32, batch: u16, payload: u16) -> GameManifestV1 {
        GameManifestV1 {
            version: 1,
            application_id: iroha_crypto::Hash::new(b"retention-test-game"),
            profile_id: iroha_crypto::Hash::new(b"retention-test-profile"),
            application_parameters: Vec::new(),
            min_participants: 1,
            max_participants: players,
            batch_ticks: batch,
            max_ticks: ticks,
            max_input_bytes: payload,
            max_participant_data_bytes: 0,
            access: super::super::GameAccessV1::Public,
            payout_policy: super::super::GamePayoutPolicyV1::NoPayout,
        }
    }

    #[test]
    fn linear_transcripts_fit_full_racing_tokyo_and_dense_generic_geometry() {
        let stock = game_history_budget_v1(&manifest(8, 5400, 6, 12)).unwrap();
        assert_eq!(stock.maximum_batches, 900);
        assert_eq!(stock.maximum_checkpoint_history, 899);
        assert_eq!(stock.maximum_prefix_hash_bytes, 618_137);
        assert_eq!(stock.maximum_history_encoded_bytes, 371_731);
        assert_eq!(stock.maximum_record_encoded_bytes, 4_566_035);
        let two = game_history_budget_v1(&manifest(2, 5400, 6, 12)).unwrap();
        assert_eq!(two.maximum_prefix_hash_bytes, 501683);
        assert!(game_history_budget_v1(&manifest(2, 32, 1, 1)).is_ok());
        assert_eq!(
            game_history_budget_v1(&manifest(32, 4096, 1, 32))
                .unwrap()
                .maximum_prefix_hash_bytes,
            7_495_041
        );
        assert_eq!(
            game_history_budget_v1(&manifest(7, 9000, 6, 6))
                .unwrap()
                .maximum_prefix_hash_bytes,
            930_828
        );
        assert_eq!(
            game_history_budget_v1(&manifest(8, 9000, 6, 6))
                .unwrap()
                .maximum_prefix_hash_bytes,
            956_537
        );
        assert!(game_history_budget_v1(&manifest(32, 32, 1, 4096)).is_ok());
    }

    #[test]
    fn geometry_and_payload_fail_before_any_resource_reservation() {
        for bad in [
            manifest(0, 6, 6, 12),
            manifest(33, 6, 6, 12),
            manifest(8, 0, 6, 12),
            manifest(8, 7, 6, 12),
            manifest(8, 6, 0, 12),
            manifest(8, 6, 6, 0),
            manifest(32, 33, 1, 4096),
        ] {
            assert!(game_history_budget_v1(&bad).is_err());
        }
        let one = game_history_budget_v1(&manifest(2, 6, 6, 12)).unwrap();
        assert_eq!(one.maximum_checkpoint_history, 0);
    }

    #[test]
    fn compact_framing_helpers_cover_each_length_boundary_and_overflow() {
        assert_eq!(field(0).unwrap(), 1);
        assert_eq!(field(127).unwrap(), 128);
        assert_eq!(field(128).unwrap(), 130);
        assert_eq!(field(16383).unwrap(), 16385);
        assert_eq!(field(16384).unwrap(), 16387);
        assert_eq!(structure(&[48]).unwrap(), 49);
        assert_eq!(structure(&[49]).unwrap(), 50);
        assert_eq!(vector(8, 20).unwrap(), 176);
        assert!(add(usize::MAX, 1).is_err());
        assert!(mul(usize::MAX, 2).is_err());
        assert!(field(usize::MAX).is_err());
    }
}
