//! Canonical native execution-proof statements and the bounded RaceV1 simulation model.

/// Public canonical offline finalized-game bundle values for native clients and SDKs.
pub mod game_bundle;

use self::game_bundle::GameReplayEvidenceV1;
use crate::NetworkId;

use crate::{DeriveJsonDeserialize, DeriveJsonSerialize};
use iroha_crypto::Hash;
use iroha_schema::IntoSchema;
use norito::codec::{Decode, Encode};

/// Closed native execution catalog's maximum canonical proof-envelope size.
///
/// This includes public replay data and the native cryptographic proof. It is a
/// local type/admission ceiling, not permission to exceed transaction, block,
/// Torii, gossip or data-availability limits. A deployment must qualify those
/// independent limits before admitting funded execution profiles.
pub const EXECUTION_PROOF_MAX_ENVELOPE_BYTES_V1: usize = 4 * 1024 * 1024;
/// Maximum bounded canonical source record for native execution proof input.
pub const EXECUTION_RECORD_MAX_BYTES_V1: usize = 16 << 20;
/// Maximum offline public-data prover request; does not raise the ledger proof cap.
pub const EXECUTION_PROVER_MAX_REQUEST_BYTES_V1: usize = 20 << 20;

/// Simulation ticks per second in the immutable RaceV1 rules.
pub const RACE_TICKS_PER_SECOND_V1: u32 = 30;
/// Maximum duration of one RaceV1 run: four and a half minutes on the real roads.
pub const RACE_MAX_TICKS_V1: u32 = 8_100;
/// Maximum authenticated racers in a RaceV1 run.
pub const RACE_MAX_PLAYERS_V1: u8 = 8;
/// Required completed laps.
pub const RACE_LAPS_V1: u32 = 3;
/// Ticks in one peer commitment/reveal batch.
pub const RACE_INPUT_BATCH_TICKS_V1: u32 = 6;
/// Bit mask of the six permitted controls.
pub const RACE_CONTROL_MASK_V1: u16 = 0x3f;
/// Number of visual car skins; all share the same simulation parameters.
pub const RACE_SKIN_COUNT_V1: u8 = 6;

/// The closed first-release track catalog: three real roads of 1986 at true scale, each raced as one
/// stretch of road three laps long. The wire names predate the roads.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
#[norito(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum RaceTrackV1 {
    /// Midnight Circuit: 6 km of National Route 1 climbing from Hakone-Yumoto to Miyanoshita.
    NeonTokyo,
    /// Harbor Run: 7.2 km from Sakuragichō over Bankoku-bashi and along the Yokohama waterfront.
    Harbor,
    /// Sakura Pass: 5.4 km of National Routes 119 and 120 from the JNR Nikkō station to Kiyotaki.
    Sakura,
}

impl RaceTrackV1 {
    /// Exact length of one lap (a third of the road) in millimetres.
    #[must_use]
    pub const fn length_mm(self) -> i64 {
        match self {
            Self::NeonTokyo => 2_000_000,
            Self::Harbor => 2_400_000,
            Self::Sakura => 1_800_000,
        }
    }

    /// Twelve road-curvature cells, sampled with Euclidean wrapped progress. Only ClassedRaceV1
    /// (Touring) still uses them; RaceV1 runs the real road's bend under every 5 m
    /// (`iroha_execution_stark::games::race_v1_roads`).
    #[must_use]
    pub const fn curvature(self) -> [i32; 12] {
        match self {
            Self::NeonTokyo => [0, 1, 2, 1, 0, -1, -2, -1, 0, 2, -2, 0],
            Self::Harbor => [0, -2, -2, 0, 1, 3, 1, 0, -1, -3, -1, 0],
            Self::Sakura => [0, 1, 1, 0, -2, -1, 0, 2, 3, 1, -2, 0],
        }
    }
}

/// All players' authenticated controls at one exact tick.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceInputFrameV1 {
    /// Zero-based tick, without gaps or repeats.
    pub tick: u32,
    /// Slot-ordered masks: throttle, brake, left, right, drift, boost in bits 0..5.
    pub controls: Vec<u16>,
}

/// Consensus-authorized removals applied before one exact simulation tick.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceDnfEventV1 {
    /// Tick boundary at which these unfinished cars lose their collision bodies.
    pub tick: u32,
    /// Unique ascending participant slots.
    pub slots: Vec<u8>,
}

/// A complete deterministic replay from the prescribed starting grid.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceReplayV1 {
    /// Immutable track selection.
    pub track: RaceTrackV1,
    /// Number of occupied slots, between one and eight for local replay.
    pub player_count: u8,
    /// Canonical consecutive frames.
    pub frames: Vec<RaceInputFrameV1>,
    /// Unique ascending exact-tick DNF events selected by consensus.
    pub dnf_events: Vec<RaceDnfEventV1>,
}

/// Integer state of one car; skins are intentionally absent.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceCarStateV1 {
    /// Unwrapped longitudinal progress, including the negative starting-grid offset.
    pub progress_mm: i64,
    /// Signed road-relative lateral position.
    pub lateral_mm: i32,
    /// Forward displacement per tick.
    pub speed_mm_per_tick: i32,
    /// Lateral displacement per tick before curvature force.
    pub lateral_velocity_mm_per_tick: i32,
    /// Boost reserve in the inclusive range 0..1000.
    pub boost_energy: u16,
    /// First completed simulation tick at which the car crossed the finish.
    pub finish_tick: Option<u32>,
    /// Consensus removal boundary; a previous finish remains historical after forfeiture.
    pub dnf_tick: Option<u32>,
}

/// Complete deterministic race state at a tick boundary.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceStateV1 {
    /// Number of completed ticks.
    pub tick: u32,
    /// Immutable circuit.
    pub track: RaceTrackV1,
    /// Cars in canonical on-chain participant-slot order.
    pub cars: Vec<RaceCarStateV1>,
}

/// One ranked entry in the result.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceStandingV1 {
    /// Original participant slot.
    pub slot: u8,
    /// Historical finish tick, if reached; forfeiture may subsequently remove eligibility.
    pub finish_tick: Option<u32>,
    /// Consensus removal boundary; a previous finish remains historical after forfeiture.
    pub dnf_tick: Option<u32>,
    /// Final unwrapped progress.
    pub progress_mm: i64,
}

/// Public outcome recomputed by the native execution relation.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceResultV1 {
    /// Exact number of simulated ticks.
    pub ticks: u32,
    /// Eligible racers before forfeits, then finish time and progress; slot breaks display ties.
    pub standings: Vec<RaceStandingV1>,
    /// Earliest finishers, a sole eligible survivor, or eligible distance leaders at timeout.
    /// Empty for an unfinished prefix or a terminal all-forfeit refund.
    pub winners: Vec<u8>,
}

/// One economic standing, distinct from the simulator's physical state/result.
/// Consensus can remove a racer after physical completion while a final signature is withheld.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceSettlementStandingV1 {
    /// Permanent original roster slot.
    pub slot: u8,
    /// Historical physical finish tick, never retimed by adjudication.
    pub finish_tick: Option<u32>,
    /// Actual consensus forfeit tick through the accepted source frontier. May exceed physical terminal.
    pub dnf_tick: Option<u32>,
    /// Progress at the proved physical terminal state.
    pub progress_mm: i64,
}

/// Stock settlement projection of proved physical performance and full-source eligibility.
/// This is the canonical opaque `GameOutcomeV1.result` schema for Stock; it is not a `RaceResultV1`.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceSettlementResultV1 {
    /// First terminal tick reached by the proved physical simulation.
    pub physical_terminal_tick: u32,
    /// Exact consensus source frontier whose complete removal map determines eligibility.
    pub accepted_through_tick: u32,
    /// Eligible racers first, with actual forfeit ticks preserved for ineligible racers.
    pub standings: Vec<RaceSettlementStandingV1>,
    /// Canonical increasing eligible winner slots; empty only for an all-forfeit refund.
    pub winners: Vec<u8>,
}

/// Ledger-bound statement for a native RaceV1 execution proof.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RacePublicInputsV1 {
    /// Exact runtime network, preventing cross-network replay.
    pub network_id: NetworkId,
    /// One immutable race identifier.
    pub race_id: Hash,
    /// Commitment to the immutable participant, session-key, wager and equipment admission body.
    pub admission_commitment: crate::game_certificates::GameAdmissionCommitmentV1,
    /// Commitment to the complete immutable physics and race rules.
    pub rules_hash: Hash,
    /// Track selected when the race was opened.
    pub track: RaceTrackV1,
    /// Authenticated cumulative input-transcript commitment.
    pub transcript_root: crate::game_certificates::GameTranscriptRootV1,
    /// Commitment to all chain-resolved input and DNF events.
    pub dispute_commitment: crate::game_certificates::GameDisputeCommitmentV1,
    /// Claimed outcome, checked by the execution relation.
    pub result: RaceResultV1,
}

/// Execution-specific commitment to one complete canonical game record.
/// Bytes are six canonical little-endian Goldilocks elements. This is not a
/// ledger Hash, and does not establish ledger origin or currentness by itself.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct ExecutionRecordBindingV1 {
    /// Exact native 384-bit digest encoding; Core rejects noncanonical field limbs.
    pub bytes: [u8; 48],
}

/// Application-neutral statement for a compiled native execution relation.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct ExecutionPublicInputsV1 {
    /// Exact runtime network.
    pub network_id: NetworkId,
    /// One immutable game session.
    pub session_id: Hash,
    /// Mandatory direct wide binding to the complete source record, including revision.
    pub source_record_binding: ExecutionRecordBindingV1,
    /// Exact canonical application manifest commitment.
    pub manifest_commitment: crate::game_certificates::GameManifestCommitmentV1,
    /// Exact immutable wallet, gameplay-key, wager and equipment admission commitment.
    pub admission_commitment: crate::game_certificates::GameAdmissionCommitmentV1,
    /// Authenticated cumulative application input transcript commitment.
    pub transcript_root: crate::game_certificates::GameTranscriptRootV1,
    /// Commitment to all consensus-resolved input and removal events.
    pub dispute_commitment: crate::game_certificates::GameDisputeCommitmentV1,
    /// Exact typed generic outcome commitment, interpreted only after adapter verification.
    pub outcome_commitment: crate::game_certificates::GameOutcomeCommitmentV1,
}

/// Exact first-release application-neutral native execution proof envelope.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct ExecutionProofEnvelopeV1 {
    /// Envelope version; exactly one.
    pub version: u16,
    /// Immutable compiled verifier/profile digest.
    pub profile_id: Hash,
    /// Exact typed public statement.
    pub statement: ExecutionPublicInputsV1,
    /// Canonical bounded native STARK proof payload.
    pub proof_bytes: Vec<u8>,
}

/// Public replay availability and the exact native cryptographic execution proof.
/// Replay data is intentionally public, allowing any replaceable worker to prove the race.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceProofPayloadV1 {
    /// Exact complete accepted controls and current evidence, including unused terminal input batches.
    pub history_evidence: GameReplayEvidenceV1,
    /// Source frontier of the accepted transcript, independent of simulation terminal.
    pub accepted_through_tick: u32,
    /// Exact generic session manifest; this adapter decodes only its compiled parameters.
    pub manifest: crate::game::GameManifestV1,
    /// Public immutable admission body whose canonical commitment must match the statement.
    pub admission: crate::game::GameAdmissionBodyV1,
    /// Economic payout outcome from the proof-bound physical state and every consensus
    /// removal through accepted_through_tick; late removals preserve their actual ticks.
    pub outcome: crate::game::GameOutcomeV1,
    /// Race-specific relation statement; it is not part of any generic native instruction.
    pub relation_inputs: RacePublicInputsV1,
    /// Physical simulation prefix through first terminal; the complete accepted source
    /// including unused suffix inputs/removals is history_evidence.
    pub replay: RaceReplayV1,
    /// Claimed terminal state, constrained by the final AIR boundary.
    pub final_state: RaceStateV1,
    /// Every retained checkpoint state in strict tick order, including the selected checkpoint.
    /// Each pre-removal boundary is bound to its ledger root and constrained by the AIR.
    pub checkpoint_states: Vec<RaceStateV1>,
    /// Exact bounded native STARK wire, with no alternate verifier modes.
    pub stark_bytes: Vec<u8>,
}

/// Portable input to a local native prover or an untrusted proof worker.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct RaceProverRequestV1 {
    /// Complete canonical accepted evidence; a worker must never invent a missing input suffix.
    pub history_evidence: GameReplayEvidenceV1,
    /// Complete bounded source record; workers receive public data, never custody keys.
    pub source_record: crate::game::GameSessionRecordV1,
    /// Checked chronology only; excluded from the record and proof identity.
    pub observation_height: u64,
    /// Available canonical input transcript.
    pub replay: RaceReplayV1,
    /// Ordered states for all archived checkpoints followed by the selected checkpoint.
    /// States precede any consensus removal at the same tick; omissions are invalid.
    pub checkpoint_states: Vec<RaceStateV1>,
}

/// A compiled, versioned execution relation; arbitrary circuit or executable installation is absent.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
#[norito(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum ExecutionProofRelationV1 {
    /// The complete bounded deterministic arcade-race transition relation.
    RaceV1,
    /// The fixed two-slot, 32-turn native GridClaim relation.
    GridClaimV1,
}

/// Exact native descriptor retained by the compiled execution-profile registry.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct ExecutionProofProfileV1 {
    /// Descriptor schema version, exactly one.
    pub version: u16,
    /// Digest of the complete compiled verifier and profile parameters.
    pub profile_id: Hash,
    /// Commitment to the immutable relation rules.
    pub rules_hash: Hash,
    /// Closed native relation identity.
    pub relation: ExecutionProofRelationV1,
    /// Release target, not a claim that qualification has already passed.
    pub target_soundness_bits: u16,
    /// Maximum canonical execution envelope, including public replay and proof bytes.
    /// Transport and transaction bounds are separate admission conditions.
    pub maximum_proof_bytes: u32,
    /// True only after native correctness, cryptographic, and resource release gates pass.
    pub qualified: bool,
}

/// Compact receipt for mathematical execution validity; it does not authorize a race payout.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    DeriveJsonDeserialize,
    DeriveJsonSerialize,
)]
pub struct ExecutionProofVerificationV1 {
    /// Exact compiled native verifier profile.
    pub profile_id: Hash,
    /// Domain-separated commitment to the verified public statement and profile.
    pub statement_hash: Hash,
    /// Exact canonical envelope retained in the finalized transaction body.
    pub proof_hash: Hash,
    /// Consensus block height at which native verification succeeded.
    pub verified_at_height: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replay_norito_roundtrip() {
        let replay = RaceReplayV1 {
            track: RaceTrackV1::NeonTokyo,
            player_count: 2,
            frames: vec![RaceInputFrameV1 {
                tick: 0,
                controls: vec![1, 33],
            }],
            dnf_events: vec![],
        };
        let bytes = norito::encode_canonical(&replay).expect("encode replay");
        assert_eq!(
            norito::decode_canonical::<RaceReplayV1>(&bytes).expect("decode replay"),
            replay
        );
    }

    #[test]
    fn catalog_lengths_and_curve_bounds() {
        for track in [
            RaceTrackV1::NeonTokyo,
            RaceTrackV1::Harbor,
            RaceTrackV1::Sakura,
        ] {
            assert!(track.length_mm() > 0);
            assert!(
                track
                    .curvature()
                    .into_iter()
                    .all(|value| (-3..=3).contains(&value))
            );
        }
    }

    #[test]
    fn state_and_result_preserve_exact_tick_zero_removal() {
        let state = RaceStateV1 {
            tick: 6,
            track: RaceTrackV1::Harbor,
            cars: vec![RaceCarStateV1 {
                progress_mm: -4000,
                lateral_mm: -1800,
                speed_mm_per_tick: 0,
                lateral_velocity_mm_per_tick: -3,
                boost_energy: 975,
                finish_tick: None,
                dnf_tick: Some(0),
            }],
        };
        let result = RaceResultV1 {
            ticks: 6,
            standings: vec![RaceStandingV1 {
                slot: 0,
                finish_tick: None,
                dnf_tick: Some(0),
                progress_mm: -4000,
            }],
            winners: vec![],
        };
        let state_bytes = norito::encode_canonical(&state).expect("canonical state");
        let result_bytes = norito::encode_canonical(&result).expect("canonical result");
        assert_eq!(
            norito::decode_canonical::<RaceStateV1>(&state_bytes).expect("decode state"),
            state
        );
        assert_eq!(
            norito::decode_canonical::<RaceResultV1>(&result_bytes).expect("decode result"),
            result
        );

        {
            let state_json = norito::json::to_json(&state).expect("state JSON");
            let result_json = norito::json::to_json(&result).expect("result JSON");
            assert_eq!(
                norito::json::from_json::<RaceStateV1>(&state_json).expect("read state JSON"),
                state
            );
            assert_eq!(
                norito::json::from_json::<RaceResultV1>(&result_json).expect("read result JSON"),
                result
            );
        }
    }
    #[test]
    fn closed_grid_relation_preserves_existing_race_discriminant_payload() {
        #[derive(Clone, Copy, Encode)]
        enum PreviousRelation {
            RaceV1,
        }
        assert_eq!(
            ExecutionProofRelationV1::RaceV1.encode(),
            PreviousRelation::RaceV1.encode()
        );
        assert_ne!(
            ExecutionProofRelationV1::RaceV1.encode(),
            ExecutionProofRelationV1::GridClaimV1.encode()
        );
        let bytes = ExecutionProofRelationV1::GridClaimV1.encode();
        assert_eq!(
            ExecutionProofRelationV1::decode(&mut bytes.as_slice()).unwrap(),
            ExecutionProofRelationV1::GridClaimV1
        );
    }
}
