//! Canonical public finalized-game requests, replay/proof frames and reports.
//!
//! These transport values are available to SDKs without a Core dependency.
//! Decoding any value, including a report whose flags claim success, confers no
//! verification authority. Core alone constructs a sealed verification receipt.
//! Streams use exactly these first-release frame types, with no legacy aliases;
//! this offline format is distinct from an admitted execution-proof envelope.

use crate::{
    DeriveJsonDeserialize, DeriveJsonSerialize, NetworkId,
    block::{BlockHeader, consensus_v2::HeightContextId},
    game::{GameInputCommitmentV1, GameInputRevealV1, GameOutcomeV1, GameTranscriptV1},
};
use iroha_crypto::{Hash, HashOf};
use iroha_schema::IntoSchema;
use norito::codec::{Decode, Encode};

/// Exact first-release public replay protocol marker.
pub const GAME_REPLAY_PROTOCOL_V1: [u8; 16] = *b"IGAME-REPLAY-V1\0";
/// Exact first-release segmented computation proof protocol marker.
pub const GAME_PROOF_PROTOCOL_V1: [u8; 16] = *b"IGAME-PORT-V1\0\0\0";

/// Compiled computation selected independently by the verifier's caller.
/// This selector neither registers a profile nor installs verifier code.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
#[norito(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum GameComputationV1 {
    /// Native Street implementation; currently unregistered and unqualified for funding.
    Street,
    /// Native Stock RaceV1 adapter; the compiled profile remains unqualified for funding.
    StockRace,
}

/// Exact historical record mode to verify.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
#[norito(tag = "kind", content = "value", rename_all = "snake_case")]
pub enum GameRecordModeV1 {
    /// A started historical record selected for computation.
    Selection,
    /// A historical settled record whose recorded outcome must also match the proof.
    ArchivedSettled,
}

/// Independent trust and exact application selection; never taken from a replay stream.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameVerificationRequestV1 {
    /// Exact request format version, currently one.
    pub version: u16,
    /// Compiled native computation to use.
    pub computation: GameComputationV1,
    /// Exact genesis-derived network identity.
    pub network_id: NetworkId,
    /// Independently trusted context governing the first supplied height.
    pub trusted_context_id: HeightContextId,
    /// First required finalized height, inclusive and nonzero.
    pub first_height: u64,
    /// Last required finalized height, inclusive.
    pub target_height: u64,
    /// Independently selected target carrier hash.
    pub target_block_hash: HashOf<BlockHeader>,
    /// Exact game identifier expected in the authenticated write set.
    pub session_id: Hash,
    /// Exact selected record revision; not a latest-state freshness claim.
    pub revision: u64,
    /// Exact selected history mode.
    pub mode: GameRecordModeV1,
    /// Requested terminal computation tick.
    pub terminal_tick: u32,
}

/// Public accepted-input evidence. Decoding this value grants no authority.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameReplayEvidenceV1 {
    /// Complete accepted transcript, including unused certified suffixes.
    pub transcript: GameTranscriptV1,
    /// Matching reveals for the current retained commitment set.
    pub current_reveals: Vec<GameInputRevealV1>,
    /// Current commitments needed beyond the stored roots.
    pub current_commitments: Vec<GameInputCommitmentV1>,
}

/// Public request to export one exact retained game record with supplied gameplay evidence.
///
/// The caller selects trust independently. Neither an export response nor decoding this
/// envelope authenticates the supplied inputs or proves the computation. The separate
/// native verifier must check the resulting replay against the original request.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameReplayExportRequestV1 {
    /// Independently pinned network, finality interval and exact historical game selection.
    pub request: GameVerificationRequestV1,
    /// Explicit public transcript and current input evidence; never reconstructed from roots.
    pub evidence: GameReplayEvidenceV1,
}

/// Serializable observation report. A report alone is not a verification capability.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameExecutionReportV1 {
    /// Exact caller-selected computation.
    pub computation: GameComputationV1,
    /// Independently selected network.
    pub network_id: NetworkId,
    /// Authenticated game identifier.
    pub session_id: Hash,
    /// Authenticated historical record revision.
    pub revision: u64,
    /// Finalized carrier height.
    pub carrier_height: u64,
    /// Finalized carrier hash.
    pub carrier_hash: HashOf<BlockHeader>,
    /// Marker-inclusive merge state-origin identity.
    pub state_origin: Hash,
    /// Complete selected record and context commitment.
    pub snapshot_root: Hash,
    /// Association of finalized source, computation, evidence and trust route.
    pub association_digest: Hash,
    /// Native implementation identity; not a registered profile claim.
    pub implementation_id: Hash,
    /// Complete proof-derived ranking and terminal outcome.
    pub outcome: GameOutcomeV1,
    /// Number of original computation components covered by verified proofs.
    /// Street counts every boundary and motion; Stock covers one compiled relation.
    pub components: u32,
    /// Number of complete native proofs verified; Street uses one per planned segment.
    /// Core derives this count from its sealed receipt, never an endpoint or header claim.
    pub proofs: u32,
    /// Complete encoded proof-stream bytes, including framing.
    pub proof_bytes: u64,
    /// Complete encoded public replay-stream bytes.
    pub replay_bytes: u64,
    /// The complete record was authenticated under the independent finality pins.
    pub record_finality_verified: bool,
    /// Every required component verified against the fixed native relation.
    pub computation_verified: bool,
    /// False: this historical reader does not establish latest-state freshness.
    pub latest_freshness_verified: bool,
    /// False: global finality authenticates markers, without local transition replay.
    pub removal_transitions_replayed: bool,
    /// False: this computation implementation remains outside the admitted registry.
    pub profile_registered: bool,
    /// False: the reader does not establish an atomic XOR/NFT payout.
    pub settlement_verified: bool,
    /// False: inclusion and computation checks do not qualify composed soundness.
    pub composed_security_qualified: bool,
}

/// First frame of a replay stream; contains no trust anchor.
#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameReplayHeaderV1 {
    /// Must equal [`GAME_REPLAY_PROTOCOL_V1`] for this protocol.
    pub protocol: [u8; 16],
    /// Must equal the caller's independently selected computation.
    pub computation: GameComputationV1,
}

/// One exact native finality archive in the request's consecutive height interval.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameFinalityFrameV1 {
    /// Canonical native BridgeFinalityProof bytes, authenticated against independent pins.
    pub archive: Vec<u8>,
}

/// Exact executed carrier wire following the complete finality interval.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameBlockFrameV1 {
    /// Native SignedBlockWire bytes; not an arbitrary block-header-only encoding.
    pub wire: Vec<u8>,
}

/// Complete native merge sidecar for the selected executed carrier.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameMergeFrameV1 {
    /// Canonical complete MergeLedgerEntry bytes, bound by the carrier and finality projection.
    pub archive: Vec<u8>,
}

/// Complete marker-inclusive native merge write set.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameWriteSetFrameV1 {
    /// Full native ordered delta bytes; a selected record alone is insufficient.
    pub bytes: Vec<u8>,
}

/// First frame of a segmented computation proof stream.
///
/// Header values are untrusted public claims. Core compares every identity and
/// count with the immutable compiled profile and independently selected history.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameProofHeaderV1 {
    /// Must equal [`GAME_PROOF_PROTOCOL_V1`] for this protocol.
    pub protocol: [u8; 16],
    /// Must equal the caller's independently selected computation.
    pub computation: GameComputationV1,
    /// Exact terminal tick requested by the independent caller.
    pub terminal: u32,
    /// Complete native compiled sequence digest, encoded as six little-endian field words.
    pub sequence_digest: [u8; 48],
    /// Complete segment-plan/context digest, including exact spans and checkpoint words.
    pub segment_sequence_digest: [u8; 48],
    /// Exact number of segments derived by Core's closed immutable plan; never a width selector.
    pub segment_count: u32,
    /// Every retained canonical pre-removal checkpoint, in exact ascending tick
    /// order with the selected checkpoint last. Core bounds nested allocations,
    /// requires exact width/ticks/roots and proves every raw state cell.
    pub checkpoints_raw: Vec<Vec<u64>>,
    /// Complete public outputs of the final boundary, checked against native compilation.
    pub final_outputs: Vec<u64>,
}

/// One ordered combined segment of the native boundary/motion computation.
///
/// Core derives the exact span and all original public-port counts from its
/// immutable plan. No field chooses a compiler, width, carry map or verifier.
#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Encode,
    Decode,
    IntoSchema,
    DeriveJsonSerialize,
    DeriveJsonDeserialize,
)]
pub struct GameProofSegmentV1 {
    /// Zero-based ordinal that must equal the verifier's next required segment.
    pub ordinal: u32,
    /// Inclusive motion start tick, fixed by the compiled partition.
    pub start_tick: u32,
    /// Exclusive motion end tick, fixed by the compiled partition.
    pub end_tick: u32,
    /// True exactly for the last span, which additionally contains the final boundary.
    pub final_boundary: bool,
    /// Outgoing raw state (when this span has motion), followed by final boundary outputs
    /// only for the final span. Internal observations remain constrained witness cells.
    pub outputs: Vec<u64>,
    /// Initial commitment digest encoded as six little-endian field words.
    pub root: [u8; 48],
    /// One complete native combined proof; isolated segment acceptance is not a history receipt.
    pub proof: Vec<u8>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        game::{GameDnfEventV1, GameTranscriptBatchV1},
        game_certificates::{
            GameActiveScopeV1, GameAdmissionCommitmentV1, GameCommitmentV1, GameInputDigestV1,
            GameManifestCommitmentV1, GameNonceV1,
        },
    };
    use norito::{NoritoDeserialize, NoritoSerialize};

    fn populated_export_codec_fixture() -> GameReplayExportRequestV1 {
        let hash = Hash::new(b"public export codec fixture, not ledger trust");
        let epoch = (1_u64 << 53) + 7;
        // Fixed-width codec values only; no certificate or authorization is claimed.
        let scope = GameActiveScopeV1 {
            manifest: GameManifestCommitmentV1::from_commitment(GameCommitmentV1::from_bytes(
                [0x31; 48],
            )),
            admission: GameAdmissionCommitmentV1::from_commitment(GameCommitmentV1::from_bytes(
                [0x32; 48],
            )),
        };
        GameReplayExportRequestV1 {
            request: GameVerificationRequestV1 {
                version: 1,
                computation: GameComputationV1::Street,
                network_id: NetworkId::from_genesis_hash(HashOf::from_untyped_unchecked(hash)),
                trusted_context_id: HeightContextId(HashOf::from_untyped_unchecked(Hash::new(
                    b"independent codec context",
                ))),
                first_height: 1,
                target_height: 6,
                target_block_hash: HashOf::from_untyped_unchecked(Hash::new(b"codec carrier")),
                session_id: hash,
                revision: u64::MAX,
                mode: GameRecordModeV1::ArchivedSettled,
                terminal_tick: 12,
            },
            evidence: GameReplayEvidenceV1 {
                transcript: GameTranscriptV1 {
                    batches: vec![
                        GameTranscriptBatchV1 {
                            start_tick: 0,
                            inputs: vec![vec![1, 2, 255], vec![3, 4]],
                        },
                        GameTranscriptBatchV1 {
                            start_tick: 6,
                            inputs: vec![vec![5, 6], vec![]],
                        },
                    ],
                    dnf_events: vec![GameDnfEventV1 {
                        tick: 6,
                        slots: vec![1],
                    }],
                },
                current_reveals: vec![GameInputRevealV1 {
                    session_id: hash,
                    scope,
                    epoch,
                    start_tick: 6,
                    slot: 0,
                    payload: vec![5, 6],
                    nonce: GameNonceV1::from_bytes([0x33; 32]),
                }],
                current_commitments: vec![GameInputCommitmentV1 {
                    session_id: hash,
                    scope,
                    epoch,
                    start_tick: 6,
                    slot: 0,
                    commitment: GameInputDigestV1::from_commitment(GameCommitmentV1::from_bytes(
                        [0x34; 48],
                    )),
                    // Codec-only bytes: no input authorization or real signature is claimed.
                    signature: iroha_crypto::Signature::from_bytes(&[0x5a; 64]),
                }],
            },
        }
    }

    #[test]
    fn game_replay_export_populated_values_roundtrip_and_preserve_independent_request() {
        let value = populated_export_codec_fixture();
        roundtrip(&value);
        roundtrip(&value.evidence);
        let request = norito::encode_canonical(&value.request).unwrap();
        let bytes = norito::encode_canonical(&value).unwrap();
        let decoded: GameReplayExportRequestV1 = norito::decode_canonical(&bytes).unwrap();
        assert_eq!(norito::encode_canonical(&decoded.request).unwrap(), request);
        assert_eq!(decoded.request.revision, u64::MAX);
        assert_eq!(decoded.evidence.current_reveals[0].epoch, (1_u64 << 53) + 7);
        assert!(norito::decode_canonical::<GameVerificationRequestV1>(&bytes).is_err());
        assert!(norito::decode_canonical::<GameReplayExportRequestV1>(&request).is_err());
        assert!(!decoded.evidence.transcript.batches.is_empty());
    }

    #[test]
    fn game_replay_export_native_sdk_fixture() {
        let value = populated_export_codec_fixture();
        export_codec_fixture(&value, "SORA_CARS_GAME_REPLAY_CODEC_FIXTURE");
    }

    #[test]
    fn stock_replay_export_native_sdk_fixture() {
        let street = populated_export_codec_fixture();
        let mut stock = street.clone();
        stock.request.computation = GameComputationV1::StockRace;
        assert_ne!(
            norito::encode_canonical(&street).unwrap(),
            norito::encode_canonical(&stock).unwrap()
        );
        export_codec_fixture(&stock, "SORA_CARS_STOCK_REPLAY_CODEC_FIXTURE");
    }

    fn export_codec_fixture(value: &GameReplayExportRequestV1, destination_variable: &str) {
        roundtrip(value);
        let request = norito::encode_canonical(&value.request).unwrap();
        let evidence = norito::encode_canonical(&value.evidence).unwrap();
        let export = norito::encode_canonical(value).unwrap();
        // Optional create-only artifact for an explicitly selected local SDK qualification.
        // Normal unit tests perform the same codec assertions without writing the workspace.
        if let Some(path) = std::env::var_os(destination_variable) {
            use std::io::Write as _;
            let path = std::path::PathBuf::from(path);
            assert!(path.is_absolute(), "explicit absolute fixture destination");
            let hex = |bytes: &[u8]| {
                bytes
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>()
            };
            let fixture = norito::json!({
                "version": 1,
                "computation": (match value.request.computation {
                    GameComputationV1::Street => "street",
                    GameComputationV1::StockRace => "stock_race",
                }),
                "scope": "Synthetic native codec vector; opaque signature bytes, no authenticated game or finality.",
                "request_hex": (hex(&request)),
                "evidence_hex": (hex(&evidence)),
                "export_hex": (hex(&export)),
                "request_bytes": (request.len()),
                "evidence_bytes": (evidence.len()),
                "export_bytes": (export.len()),
                "revision": (value.request.revision.to_string()),
                "epoch": (value.evidence.current_reveals[0].epoch.to_string()),
                "batches": (value.evidence.transcript.batches.len()),
                "reveals": (value.evidence.current_reveals.len()),
                "commitments": (value.evidence.current_commitments.len()),
            });
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path)
                .unwrap();
            file.write_all(norito::json::to_json_pretty(&fixture).unwrap().as_bytes())
                .unwrap();
        }
    }

    fn roundtrip<T>(value: &T)
    where
        T: NoritoSerialize
            + for<'de> NoritoDeserialize<'de>
            + norito::json::JsonSerialize
            + norito::json::JsonDeserialize
            + core::fmt::Debug
            + PartialEq,
    {
        let bytes = norito::encode_canonical(value).unwrap();
        assert_eq!(&norito::decode_canonical::<T>(&bytes).unwrap(), value);
        let json = norito::json::to_json(value).unwrap();
        assert_eq!(&norito::json::from_str::<T>(&json).unwrap(), value);
        let mut trailing = bytes.clone();
        trailing.push(0);
        assert!(norito::decode_canonical::<T>(&trailing).is_err());
        assert!(norito::decode_canonical::<T>(&bytes[..bytes.len() - 1]).is_err());
    }

    #[test]
    fn canonical_public_values_roundtrip_without_verification_capability() {
        let hash = Hash::new(b"model-only bundle codec fixture");
        let request = GameVerificationRequestV1 {
            version: 1,
            computation: GameComputationV1::Street,
            network_id: NetworkId::from_genesis_hash(HashOf::from_untyped_unchecked(hash)),
            trusted_context_id: HeightContextId(HashOf::from_untyped_unchecked(hash)),
            first_height: 2,
            target_height: 2,
            target_block_hash: HashOf::from_untyped_unchecked(hash),
            session_id: hash,
            revision: 7,
            mode: GameRecordModeV1::Selection,
            terminal_tick: 0,
        };
        roundtrip(&request);
        roundtrip(&GameRecordModeV1::ArchivedSettled);
        roundtrip(&GameReplayEvidenceV1 {
            transcript: GameTranscriptV1 {
                batches: Vec::new(),
                dnf_events: Vec::new(),
            },
            current_reveals: Vec::new(),
            current_commitments: Vec::new(),
        });
        roundtrip(&GameReplayHeaderV1 {
            protocol: GAME_REPLAY_PROTOCOL_V1,
            computation: request.computation,
        });
        roundtrip(&GameFinalityFrameV1 {
            archive: vec![1, 2, 3],
        });
        roundtrip(&GameBlockFrameV1 { wire: vec![4, 5] });
        roundtrip(&GameMergeFrameV1 {
            archive: vec![1, 2, 3],
        });
        roundtrip(&GameWriteSetFrameV1 {
            bytes: vec![6, 7, 8],
        });
        roundtrip(&GameProofHeaderV1 {
            protocol: GAME_PROOF_PROTOCOL_V1,
            computation: request.computation,
            terminal: 0,
            sequence_digest: [0; 48],
            segment_sequence_digest: [1; 48],
            segment_count: 1,
            checkpoints_raw: vec![vec![0, 0]],
            final_outputs: vec![0, 1],
        });
        roundtrip(&GameProofSegmentV1 {
            ordinal: 0,
            start_tick: 0,
            end_tick: 0,
            final_boundary: true,
            outputs: vec![0, 1],
            root: [0; 48],
            proof: vec![9, 10],
        });
        // Public report fields are serializable data, not an unchecked receipt.
        // Even decoded true flags cannot construct Core's sealed capability.
        roundtrip(&GameExecutionReportV1 {
            computation: request.computation,
            network_id: request.network_id,
            session_id: hash,
            revision: request.revision,
            carrier_height: 2,
            carrier_hash: request.target_block_hash,
            state_origin: hash,
            snapshot_root: hash,
            association_digest: hash,
            implementation_id: hash,
            outcome: GameOutcomeV1 {
                terminal_tick: 0,
                winner_slots: vec![0],
                result: vec![1, 2],
            },
            components: 1,
            proofs: 1,
            proof_bytes: 2,
            replay_bytes: 3,
            record_finality_verified: true,
            computation_verified: true,
            latest_freshness_verified: false,
            removal_transitions_replayed: false,
            profile_registered: false,
            settlement_verified: false,
            composed_security_qualified: false,
        });
    }

    #[test]
    fn frame_schemas_distinguish_identical_payloads_and_stream_roles() {
        let schema = [
            <GameVerificationRequestV1 as NoritoSerialize>::schema_hash(),
            <GameReplayEvidenceV1 as NoritoSerialize>::schema_hash(),
            <GameReplayExportRequestV1 as NoritoSerialize>::schema_hash(),
            <GameExecutionReportV1 as NoritoSerialize>::schema_hash(),
            <GameReplayHeaderV1 as NoritoSerialize>::schema_hash(),
            <GameFinalityFrameV1 as NoritoSerialize>::schema_hash(),
            <GameBlockFrameV1 as NoritoSerialize>::schema_hash(),
            <GameMergeFrameV1 as NoritoSerialize>::schema_hash(),
            <GameWriteSetFrameV1 as NoritoSerialize>::schema_hash(),
            <GameProofHeaderV1 as NoritoSerialize>::schema_hash(),
            <GameProofSegmentV1 as NoritoSerialize>::schema_hash(),
        ];
        let unique: std::collections::BTreeSet<_> = schema.into_iter().collect();
        assert_eq!(unique.len(), schema.len());
        let finality = norito::encode_canonical(&GameFinalityFrameV1 {
            archive: vec![1, 2, 3],
        })
        .unwrap();
        assert!(norito::decode_canonical::<GameMergeFrameV1>(&finality).is_err());
        let header = norito::encode_canonical(&GameReplayHeaderV1 {
            protocol: GAME_REPLAY_PROTOCOL_V1,
            computation: GameComputationV1::Street,
        })
        .unwrap();
        assert!(norito::decode_canonical::<GameProofHeaderV1>(&header).is_err());
        assert_ne!(GAME_REPLAY_PROTOCOL_V1, GAME_PROOF_PROTOCOL_V1);
    }

    #[test]
    fn segmented_proof_wire_preserves_complete_claims_and_exact_frame_kind() {
        let header = GameProofHeaderV1 {
            protocol: GAME_PROOF_PROTOCOL_V1,
            computation: GameComputationV1::Street,
            terminal: 2,
            sequence_digest: [11; 48],
            segment_sequence_digest: [23; 48],
            segment_count: 1,
            checkpoints_raw: vec![vec![0, 0, 4]],
            final_outputs: vec![2, 1, 0],
        };
        let segment = GameProofSegmentV1 {
            ordinal: 0,
            start_tick: 0,
            end_tick: 2,
            final_boundary: true,
            // Complete B0/M0/B1/M1/B2 port layout for a small codec fixture.
            // Opaque proof bytes below do not claim mathematical validity.
            outputs: vec![0, 0, 4, 5, 1, 0, 1, 1, 0, 5, 7, 2, 0, 4, 2, 1, 0],
            root: [31; 48],
            proof: vec![1, 7, 19, 31],
        };
        roundtrip(&header);
        roundtrip(&segment);
        let header_bytes = norito::encode_canonical(&header).unwrap();
        let segment_bytes = norito::encode_canonical(&segment).unwrap();
        assert!(norito::decode_canonical::<GameProofSegmentV1>(&header_bytes).is_err());
        assert!(norito::decode_canonical::<GameProofHeaderV1>(&segment_bytes).is_err());
        assert_eq!(GAME_PROOF_PROTOCOL_V1, *b"IGAME-PORT-V1\0\0\0");
        // The previous diagnostic component marker is rejection-only history.
        assert_ne!(GAME_PROOF_PROTOCOL_V1, *b"IGAME-PROOF-V1\0\0");

        for change in 0..7 {
            let mut changed = header.clone();
            match change {
                0 => changed.sequence_digest[0] ^= 1,
                1 => changed.segment_sequence_digest[0] ^= 1,
                2 => changed.segment_count += 1,
                3 => changed.checkpoints_raw[0][2] += 1,
                4 => changed.checkpoints_raw[0].push(9),
                5 => changed.final_outputs[2] += 1,
                6 => changed.terminal += 1,
                _ => unreachable!(),
            }
            let encoded = norito::encode_canonical(&changed).unwrap();
            assert_ne!(encoded, header_bytes);
            assert_eq!(
                norito::decode_canonical::<GameProofHeaderV1>(&encoded).unwrap(),
                changed
            );
        }
        for change in 0..8 {
            let mut changed = segment.clone();
            match change {
                0 => changed.ordinal += 1,
                1 => changed.start_tick += 1,
                2 => changed.end_tick += 1,
                3 => changed.final_boundary = false,
                4 => changed.outputs[10] += 1,
                5 => changed.outputs.push(7),
                6 => changed.root[0] ^= 1,
                7 => changed.proof.push(41),
                _ => unreachable!(),
            }
            let encoded = norito::encode_canonical(&changed).unwrap();
            assert_ne!(encoded, segment_bytes);
            assert_eq!(
                norito::decode_canonical::<GameProofSegmentV1>(&encoded).unwrap(),
                changed
            );
        }
        // Encoding remains distinct from Core's immutable-span and proof checks:
        // this DTO can round-trip claims which Core must reject semantically.
        let impossible_span = GameProofSegmentV1 {
            ordinal: 9,
            start_tick: 7,
            end_tick: 3,
            final_boundary: false,
            outputs: Vec::new(),
            root: [0; 48],
            proof: Vec::new(),
        };
        roundtrip(&impossible_span);
    }

    #[test]
    fn execution_report_distinguishes_proof_count_from_original_components() {
        let request = populated_export_codec_fixture().request;
        let hash = Hash::new(b"report codec data, not finalized verification");
        let mut report = GameExecutionReportV1 {
            computation: GameComputationV1::Street,
            network_id: request.network_id,
            session_id: request.session_id,
            revision: request.revision,
            carrier_height: request.target_height,
            carrier_hash: request.target_block_hash,
            state_origin: hash,
            snapshot_root: hash,
            association_digest: hash,
            implementation_id: hash,
            outcome: GameOutcomeV1 {
                terminal_tick: 2,
                winner_slots: vec![0],
                result: vec![7, 11],
            },
            components: 5,
            proofs: 2,
            proof_bytes: 1234,
            replay_bytes: 5678,
            record_finality_verified: false,
            computation_verified: false,
            latest_freshness_verified: false,
            removal_transitions_replayed: false,
            profile_registered: false,
            settlement_verified: false,
            composed_security_qualified: false,
        };
        roundtrip(&report);
        let two = norito::encode_canonical(&report).unwrap();
        report.proofs = 1;
        let one = norito::encode_canonical(&report).unwrap();
        assert_ne!(one, two);
        let decoded = norito::decode_canonical::<GameExecutionReportV1>(&one).unwrap();
        assert_eq!(decoded.components, 5);
        assert_eq!(decoded.proofs, 1);
        assert_eq!(decoded, report);
        report.computation = GameComputationV1::StockRace;
        report.components = 1;
        roundtrip(&report);
    }
}
