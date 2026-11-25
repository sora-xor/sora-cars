//! First-release game certificate primitives and typed input-message construction.
//!
//! These values are distinct from ledger hashes and execution field commitments.
//! TODO: migrate the complete game lifecycle and all remaining typed certificate
//! bodies together before referencing this suite from an admitted profile.

use std::{fmt, str::FromStr};

use iroha_crypto::{Algorithm, Hash, PublicKey, Signature, sha3_384::Sha3_384State};
use iroha_primitives::execution::{ExecutionFailure, ExecutionResult};
use iroha_schema::IntoSchema;
use norito::codec::{Decode, Encode};

use crate::NetworkId;

/// Typed checkpoint, pending commitment-set and challenge certificate claims.
pub mod gameplay;
/// Typed cumulative transcript and opaque adapter-state commitment claims.
pub mod history;
/// Exact manifest-bound private-lobby invitation signing bodies.
pub mod invitation;
/// Typed lifecycle commitments and ledger-derived gameplay message construction.
pub mod lifecycle;

/// Maximum application bytes carried by one generic input preimage.
pub const GAME_CERTIFICATE_MAX_INPUT_BYTES_V1: usize = 4_096;
/// Maximum complete canonical Norito body for a directly signed gameplay message.
pub const GAME_CERTIFICATE_MAX_DIRECT_BODY_BYTES_V1: usize = 64 * 1024;
/// Exact prefix, with its terminating zero byte included in the signed frame.
pub const GAME_CERTIFICATE_PREFIX_V1: &[u8; 26] = b"iroha:game:certificate:v1\0";
/// Fixed frame overhead: prefix, operation, purpose, network, session and body length.
pub const GAME_CERTIFICATE_FRAME_OVERHEAD_V1: usize = 26 + 1 + 2 + 32 + 32 + 4;

/// A completed rejection of received certificate framing or game geometry.
///
/// No variant contains an operational execution carrier. Fixed protocol bounds
/// differ from local allocation refusal, which retains its source in the abort.
#[derive(Debug, thiserror::Error)]
pub enum GameCertificateVerdictV1 {
    /// Wrong fixed-width literal, prefix, case or representation.
    #[error("noncanonical game certificate literal")]
    Literal,
    /// An input, encoded body, or element count exceeds its protocol bound.
    #[error("game certificate bound exceeded")]
    Bound,
    /// Unknown or mismatched operation, purpose, network, session or length.
    #[error("game certificate frame mismatch")]
    Frame,
    /// The original structural received-codec rejection.
    #[error("invalid game certificate body: {0}")]
    Codec(#[source] GameCertificateDecodeVerdictV1),
    /// Gameplay slots are permanent positions in the bounded generic roster.
    #[error("invalid game certificate slot")]
    Slot,
    /// Transcript ordering, frontier or permanent-slot geometry is inconsistent.
    #[error("invalid game certificate geometry")]
    Geometry,
    /// Wrong signing algorithm/length, or an explicit cryptographic BadSignature verdict.
    #[error("invalid game certificate signature")]
    Signature,
    /// The immutable admission's completed rejection.
    #[error("invalid game certificate admission: {0}")]
    Admission(#[source] crate::game::GameAdmissionVerdictV1),
    /// The current NFT validator's explicit semantic rejection.
    #[error("invalid game certificate NFT identity: {0}")]
    NftIdentity(&'static str),
}

/// A received-codec error classified by its original codec owner as structural.
///
/// Construction is private: operational codec failures cannot be inserted into
/// this certificate verdict by an external caller.
#[derive(Debug, thiserror::Error)]
#[error("{source}")]
pub struct GameCertificateDecodeVerdictV1 {
    source: norito::Error,
}
impl GameCertificateDecodeVerdictV1 {
    /// Borrow the exact structural codec source without reconstructing it.
    pub const fn source(&self) -> &norito::Error {
        &self.source
    }
}

/// An original operation failed before certificate validity could be decided.
///
/// These sources carry no retry authority. Count/encode failures retain their
/// computed-stage provenance even when the same inner error can describe input
/// corruption at a received-byte boundary.
#[derive(Debug, thiserror::Error)]
pub enum GameCertificateAbortV1 {
    /// An operational failure while decoding a received certificate body.
    #[error("{context}: {source}")]
    Decode {
        /// The original decoder operation.
        context: &'static str,
        /// Actual operational codec source, including nested failures.
        source: norito::Error,
    },
    /// Computing canonical bytes or their length failed.
    #[error("{context}: {source}")]
    Encoding {
        /// The original count or encoding operation.
        context: &'static str,
        /// Actual codec source from the computation.
        source: norito::Error,
    },
    /// A computed counter does not fit its canonical integer representation.
    #[error("{context}: {source}")]
    Length {
        /// The original bounded counter computation.
        context: &'static str,
        /// Actual integer conversion source.
        source: core::num::TryFromIntError,
    },
    /// Exact allocation, layout, admission, or local invariant cause.
    #[error(transparent)]
    Native(norito::NativeCodecFailure),
    /// Inspecting an already-owned key failed before verification.
    #[error("game certificate public key: {source}")]
    PublicKey {
        /// Actual key representation source.
        source: iroha_crypto::error::ParseError,
    },
    /// The signature verifier's original operational cause.
    #[error("game certificate signature: {0}")]
    Signature(#[source] crate::signature_verification::SignatureExecutionAbort),
    /// Computing the immutable admission's canonical identity failed.
    #[error("game certificate admission: {0}")]
    Admission(#[source] crate::game::GameAdmissionAbortV1),
}

fn received_codec_failure(
    source: norito::Error,
    context: &'static str,
) -> ExecutionFailure<GameCertificateVerdictV1, GameCertificateAbortV1> {
    if source.is_operational() {
        ExecutionFailure::Aborted(GameCertificateAbortV1::Decode { context, source })
    } else {
        ExecutionFailure::Deterministic(GameCertificateVerdictV1::Codec(
            GameCertificateDecodeVerdictV1 { source },
        ))
    }
}

fn computed_codec_failure(
    source: norito::Error,
    context: &'static str,
) -> ExecutionFailure<GameCertificateVerdictV1, GameCertificateAbortV1> {
    ExecutionFailure::Aborted(GameCertificateAbortV1::Encoding { context, source })
}

fn native_failure(
    source: norito::NativeCodecFailure,
) -> ExecutionFailure<GameCertificateVerdictV1, GameCertificateAbortV1> {
    ExecutionFailure::Aborted(GameCertificateAbortV1::Native(source))
}

fn allocate_certificate_vec<T>(
    count: usize,
    context: &'static str,
) -> ExecutionResult<Vec<T>, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let layout = std::alloc::Layout::array::<T>(count)
        .map_err(|source| native_failure(norito::NativeCodecFailure::Layout { context, source }))?;
    if layout.size() != 0 {
        norito::core::reserve_decode_allocation(layout.size()).map_err(native_failure)?;
    }
    let mut value = Vec::new();
    value.try_reserve_exact(count).map_err(|source| {
        native_failure(norito::NativeCodecFailure::Reservation { context, source })
    })?;
    // Vec exposes its actual element capacity, which may exceed the requested
    // count. Admit that excess before publishing the destination. This accounts
    // for exposed capacity, not hidden allocator metadata or peak RSS.
    let actual_layout = std::alloc::Layout::array::<T>(value.capacity())
        .map_err(|source| native_failure(norito::NativeCodecFailure::Layout { context, source }))?;
    let excess = actual_layout
        .size()
        .checked_sub(layout.size())
        .ok_or_else(|| native_failure(norito::NativeCodecFailure::Invariant { context }))?;
    if excess != 0 {
        norito::core::reserve_decode_allocation(excess).map_err(native_failure)?;
    }
    Ok(value)
}

fn parse_literal<const N: usize>(
    text: &str,
    prefix: &str,
) -> Result<[u8; N], GameCertificateVerdictV1> {
    if text.len() != prefix.len() + 2 * N || !text.starts_with(prefix) {
        return Err(GameCertificateVerdictV1::Literal);
    }
    let mut bytes = [0; N];
    for (target, pair) in bytes
        .iter_mut()
        .zip(text.as_bytes()[prefix.len()..].chunks_exact(2))
    {
        let digit = |byte| match byte {
            b'0'..=b'9' => Ok(byte - b'0'),
            b'A'..=b'F' => Ok(byte - b'A' + 10),
            _ => Err(GameCertificateVerdictV1::Literal),
        };
        *target = digit(pair[0])? * 16 + digit(pair[1])?;
    }
    Ok(bytes)
}

fn parse_json_literal<const N: usize>(
    parser: &mut norito::json::Parser<'_>,
    prefix: &str,
) -> Result<[u8; N], norito::json::Error> {
    // Borrow a fixed number of ASCII bytes before advancing: no attacker-sized
    // String allocation, escape decoding or normalization is involved.
    parser.skip_ws();
    let length = prefix.len() + 2 * N;
    let raw = parser.input_from_pos().as_bytes();
    let error = || norito::json::Error::Message("noncanonical game certificate literal".into());
    if raw.first() != Some(&b'"') || raw.get(length + 1) != Some(&b'"') {
        return Err(error());
    }
    let text = std::str::from_utf8(&raw[1..length + 1]).map_err(|_| error())?;
    let value = parse_literal(text, prefix).map_err(|_| error())?;
    for _ in 0..length + 2 {
        parser.bump();
    }
    Ok(value)
}

fn write_json_literal<const N: usize>(
    bytes: &[u8; N],
    prefix: &str,
    out: &mut dyn norito::json::JsonWriteSink,
) -> Result<(), norito::json::BoundedJsonError> {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    out.push('"')?;
    out.push_str(prefix)?;
    for byte in bytes {
        out.push(char::from(HEX[usize::from(byte >> 4)]))?;
        out.push(char::from(HEX[usize::from(byte & 15)]))?;
    }
    out.push('"')
}

macro_rules! fixed_game_bytes {
    ($(#[$meta:meta])* $name:ident, $size:expr, $prefix:literal) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Decode, Encode, IntoSchema)]
        pub struct $name([u8; $size]);

        impl $name {
            /// Construct from exact raw bytes; no marking, reduction or byte restrictions apply.
            #[must_use]
            pub const fn from_bytes(bytes: [u8; $size]) -> Self { Self(bytes) }
            /// Borrow the exact raw bytes, independent of their Norito container encoding.
            #[must_use]
            pub const fn as_bytes(&self) -> &[u8; $size] { &self.0 }
        }
        impl FromStr for $name {
            type Err = GameCertificateVerdictV1;
            fn from_str(text: &str) -> Result<Self, Self::Err> {
                parse_literal(text, $prefix).map(Self)
            }
        }
        impl fmt::Display for $name {
            fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
                out.write_str($prefix)?;
                for byte in self.0 { write!(out, "{byte:02X}")?; }
                Ok(())
            }
        }
        impl norito::json::JsonSerialize for $name {
            fn json_serialize(&self, out: &mut String) {
                norito::json::write_with_unbounded_sink(out, |sink| write_json_literal(&self.0, $prefix, sink));
            }
            fn json_serialize_to(&self, out: &mut dyn norito::json::JsonWriteSink) -> Result<(), norito::json::BoundedJsonError> {
                write_json_literal(&self.0, $prefix, out)
            }
        }
        impl norito::json::JsonDeserialize for $name {
            fn json_deserialize(parser: &mut norito::json::Parser<'_>) -> Result<Self, norito::json::Error> {
                parse_json_literal(parser, $prefix).map(Self)
            }
            fn json_from_value(value: &norito::json::Value) -> Result<Self, norito::json::Error> {
                match value {
                    norito::json::Value::String(text) => text.parse().map_err(|_| norito::json::Error::Message("noncanonical game certificate literal".into())),
                    _ => Err(norito::json::Error::Message("noncanonical game certificate literal".into())),
                }
            }
        }
    };
}

fixed_game_bytes!(
    /// Exactly 48 arbitrary SHA3-384 bytes; never a marked hash or six field elements.
    GameCommitmentV1, 48, "game384:"
);
fixed_game_bytes!(
    /// Exactly 32 opaque bytes. Honest participants generate fresh CSPRNG nonces.
    GameNonceV1, 32, "nonce32:"
);

macro_rules! typed_commitment {
    ($(#[$meta:meta])* $name:ident) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Decode, Encode, IntoSchema)]
        pub struct $name(GameCommitmentV1);
        impl $name {
            /// Tag a retained commitment with this schema's semantic purpose.
            #[must_use]
            pub const fn from_commitment(value: GameCommitmentV1) -> Self { Self(value) }
            /// Borrow the exact commitment, without converting through a ledger hash.
            #[must_use]
            pub const fn commitment(&self) -> &GameCommitmentV1 { &self.0 }
        }
        impl norito::json::JsonSerialize for $name {
            fn json_serialize(&self, out: &mut String) { norito::json::JsonSerialize::json_serialize(&self.0, out); }
            fn json_serialize_to(&self, out: &mut dyn norito::json::JsonWriteSink) -> Result<(), norito::json::BoundedJsonError> {
                norito::json::JsonSerialize::json_serialize_to(&self.0, out)
            }
        }
        impl norito::json::JsonDeserialize for $name {
            fn json_deserialize(parser: &mut norito::json::Parser<'_>) -> Result<Self, norito::json::Error> {
                <GameCommitmentV1 as norito::json::JsonDeserialize>::json_deserialize(parser).map(Self)
            }
            fn json_from_value(value: &norito::json::Value) -> Result<Self, norito::json::Error> {
                <GameCommitmentV1 as norito::json::JsonDeserialize>::json_from_value(value).map(Self)
            }
        }
    };
}

typed_commitment!(/// Commitment to an exact input preimage.
    GameInputDigestV1);
typed_commitment!(/// Commitment to an accepted transcript prefix.
    GameTranscriptRootV1);
typed_commitment!(/// Domain-separated append-chain head; not a sealed transcript root.
    GameTranscriptChainHeadV1);
typed_commitment!(/// Commitment to complete canonical adapter state.
    GameStateRootV1);
typed_commitment!(/// Commitment to an immutable complete game manifest.
    GameManifestCommitmentV1);
typed_commitment!(/// Commitment to the frozen original admission.
    GameAdmissionCommitmentV1);
typed_commitment!(/// Commitment to the complete retained dispute projection.
    GameDisputeCommitmentV1);
typed_commitment!(/// Commitment to the adapter's complete proved outcome.
    GameOutcomeCommitmentV1);
typed_commitment!(/// Checkpoint packet association identifier, not signing bytes.
    GameCheckpointIdV1);
typed_commitment!(/// Certified frontier packet association identifier, not signing bytes.
    GameFrontierIdV1);
typed_commitment!(/// Commitment to exact NFT metadata and its game role.
    GameResourceContentCommitmentV1);

/// The frozen manifest and original roster under which gameplay was authorized.
#[derive(
    Debug,
    Clone,
    Copy,
    PartialEq,
    Eq,
    PartialOrd,
    Ord,
    Decode,
    Encode,
    IntoSchema,
    crate::DeriveJsonSerialize,
    crate::DeriveJsonDeserialize,
)]
#[norito(deny_unknown_fields)]
pub struct GameActiveScopeV1 {
    /// Complete immutable manifest commitment.
    pub manifest: GameManifestCommitmentV1,
    /// Frozen original admission commitment; lobby absence cannot be a gameplay scope.
    pub admission: GameAdmissionCommitmentV1,
}

/// Closed purpose catalog. Numeric identifiers cannot select arbitrary verifier code.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u16)]
pub enum GameCertificatePurposeV1 {
    /// Input preimage commitment.
    Input = 1,
    /// Adapter state commitment.
    State = 3,
    /// Complete manifest commitment.
    Manifest = 4,
    /// Frozen original admission commitment.
    Admission = 5,
    /// Retained dispute projection commitment.
    Dispute = 6,
    /// Proved outcome commitment.
    Outcome = 7,
    /// Checkpoint packet identifier.
    CheckpointId = 8,
    /// Frontier packet identifier.
    FrontierId = 9,
    /// Exact resource metadata commitment.
    ResourceContent = 10,
    /// Frozen transcript scope and geometry seed.
    TranscriptSeed = 11,
    /// Complete accepted input batch link.
    TranscriptBatchLink = 12,
    /// Ordered permanent-removal event link.
    TranscriptRemovalLink = 13,
    /// Transcript checkpoint or accepted-history root seal.
    TranscriptRoot = 14,
    /// Signed input commitment.
    InputCommitment = 101,
    /// Signed peer reveal; not required for permissionless matching ledger reveals.
    InputReveal = 102,
    /// Signed commitment set.
    CommitmentSet = 103,
    /// Signed checkpoint.
    Checkpoint = 104,
    /// Signed challenge request.
    Challenge = 105,
    /// Signed entry invitation.
    Invitation = 106,
    /// Wallet approval of complete entry terms.
    WalletEntry = 107,
    /// Wallet approval of exact item wager terms.
    WalletItemWager = 108,
    /// Wallet approval of complete creation terms.
    WalletOpen = 109,
}

impl GameCertificatePurposeV1 {
    /// Fixed operation byte: commitment (0) or directly signed message (1).
    #[must_use]
    pub const fn operation(self) -> u8 {
        match self {
            Self::Input
            | Self::State
            | Self::Manifest
            | Self::Admission
            | Self::Dispute
            | Self::Outcome
            | Self::CheckpointId
            | Self::FrontierId
            | Self::ResourceContent
            | Self::TranscriptSeed
            | Self::TranscriptBatchLink
            | Self::TranscriptRemovalLink
            | Self::TranscriptRoot => 0,
            Self::InputCommitment
            | Self::InputReveal
            | Self::CommitmentSet
            | Self::Checkpoint
            | Self::Challenge
            | Self::Invitation
            | Self::WalletEntry
            | Self::WalletItemWager
            | Self::WalletOpen => 1,
        }
    }
}

impl TryFrom<u16> for GameCertificatePurposeV1 {
    type Error = GameCertificateVerdictV1;
    fn try_from(value: u16) -> Result<Self, Self::Error> {
        match value {
            1 => Ok(Self::Input),
            3 => Ok(Self::State),
            4 => Ok(Self::Manifest),
            5 => Ok(Self::Admission),
            6 => Ok(Self::Dispute),
            7 => Ok(Self::Outcome),
            8 => Ok(Self::CheckpointId),
            9 => Ok(Self::FrontierId),
            10 => Ok(Self::ResourceContent),
            11 => Ok(Self::TranscriptSeed),
            12 => Ok(Self::TranscriptBatchLink),
            13 => Ok(Self::TranscriptRemovalLink),
            14 => Ok(Self::TranscriptRoot),
            101 => Ok(Self::InputCommitment),
            102 => Ok(Self::InputReveal),
            103 => Ok(Self::CommitmentSet),
            104 => Ok(Self::Checkpoint),
            105 => Ok(Self::Challenge),
            106 => Ok(Self::Invitation),
            107 => Ok(Self::WalletEntry),
            108 => Ok(Self::WalletItemWager),
            109 => Ok(Self::WalletOpen),
            _ => Err(GameCertificateVerdictV1::Frame),
        }
    }
}

/// Trusted network/session context supplied independently of an untrusted packet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GameCertificateContextV1 {
    /// Pinned genesis identity.
    pub network: NetworkId,
    /// Unique retained ledger lookup identity.
    pub session_id: Hash,
}

/// Exact shared body for input commitments and signed peer reveals.
#[derive(Debug, Clone, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameInputPreimageV1 {
    scope: GameActiveScopeV1,
    epoch: u64,
    start_tick: u32,
    slot: u8,
    payload: Vec<u8>,
    nonce: GameNonceV1,
}

impl GameInputPreimageV1 {
    /// Borrow the exact frozen scope claimed by this preimage.
    #[must_use]
    pub const fn scope(&self) -> &GameActiveScopeV1 {
        &self.scope
    }

    /// Consensus epoch claimed by the input authority.
    #[must_use]
    pub const fn epoch(&self) -> u64 {
        self.epoch
    }

    /// First tick controlled by this preimage.
    #[must_use]
    pub const fn start_tick(&self) -> u32 {
        self.start_tick
    }

    /// Permanent original roster slot claimed by the signer.
    #[must_use]
    pub const fn slot(&self) -> u8 {
        self.slot
    }

    /// Borrow the exact adapter input bytes without normalization.
    #[must_use]
    pub fn payload(&self) -> &[u8] {
        &self.payload
    }

    /// Borrow the exact commitment nonce without marking or entropy checks.
    #[must_use]
    pub const fn nonce(&self) -> &GameNonceV1 {
        &self.nonce
    }

    /// Construct only after the payload length and permanent slot have been bounded.
    pub fn new(
        scope: GameActiveScopeV1,
        epoch: u64,
        start_tick: u32,
        slot: u8,
        payload: &[u8],
        nonce: GameNonceV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_input_geometry(slot, payload.len())?;
        let mut owned =
            allocate_certificate_vec(payload.len(), "game certificate game_certificates owned")?;
        owned.extend_from_slice(payload);
        Ok(Self {
            scope,
            epoch,
            start_tick,
            slot,
            payload: owned,
            nonce,
        })
    }

    /// Commit to the complete original bounded canonical input body.
    pub fn commitment(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameInputDigestV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_input_geometry(self.slot, self.payload.len())?;
        let length = checked_body_length(self)?;
        let mut state = Sha3_384State::new();
        state.update(&frame_header(
            context,
            GameCertificatePurposeV1::Input,
            length,
        )?);
        let mut sink = DigestWriter {
            state,
            remaining: length,
        };
        norito::core::write_canonical_to_writer(self, &mut sink).map_err(|source| {
            computed_codec_failure(
                source,
                "game certificate game_certificates::commitment encode",
            )
        })?;
        if sink.remaining != 0 {
            return Err(native_failure(norito::NativeCodecFailure::Invariant {
                context: "game certificate encoding did not fill its measured destination",
            }));
        }
        Ok(GameInputDigestV1(GameCommitmentV1(sink.state.finalize())))
    }

    /// Build owned directly signed peer-reveal bytes, not a hash of those bytes.
    pub fn reveal_message(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        validate_input_geometry(self.slot, self.payload.len())?;
        encode_message(context, GameCertificatePurposeV1::InputReveal, self)
    }

    /// Build an input commitment certificate containing the exact computed input digest.
    pub fn commitment_message(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        let body = GameInputCommitmentCertificateBodyV1 {
            scope: self.scope,
            epoch: self.epoch,
            start_tick: self.start_tick,
            slot: self.slot,
            commitment: self.commitment(context)?,
        };
        encode_message(context, GameCertificatePurposeV1::InputCommitment, &body)
    }

    /// Decode one exact framed peer reveal with strict allocation and count budgets.
    ///
    /// The trusted context must be selected before inspecting the packet. The
    /// returned body is still untrusted until its scope and authority are checked.
    pub fn decode_reveal_message(
        context: &GameCertificateContextV1,
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let body = decode_message_body(context, GameCertificatePurposeV1::InputReveal, bytes)?;
        let limits = norito::DecodeLimits::new(
            GAME_CERTIFICATE_MAX_INPUT_BYTES_V1,
            GAME_CERTIFICATE_MAX_DIRECT_BODY_BYTES_V1,
            GAME_CERTIFICATE_MAX_INPUT_BYTES_V1 + 256,
            GAME_CERTIFICATE_MAX_DIRECT_BODY_BYTES_V1,
            16,
        );
        let decoded: Self =
            norito::decode_canonical_with_limits(body, limits).map_err(|source| {
                received_codec_failure(
                    source,
                    "game certificate game_certificates::decode_reveal_message decode",
                )
            })?;
        validate_input_geometry(decoded.slot, decoded.payload.len())?;
        Ok(decoded)
    }
}

/// Exact scope-bound commitment claim, constructible from an already retained digest.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameInputCommitmentCertificateBodyV1 {
    scope: GameActiveScopeV1,
    epoch: u64,
    start_tick: u32,
    slot: u8,
    commitment: GameInputDigestV1,
}

impl GameInputCommitmentCertificateBodyV1 {
    /// Construct a claim without requiring the still-hidden input preimage.
    pub fn new(
        scope: GameActiveScopeV1,
        epoch: u64,
        start_tick: u32,
        slot: u8,
        commitment: GameInputDigestV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_input_geometry(slot, 0)?;
        Ok(Self {
            scope,
            epoch,
            start_tick,
            slot,
            commitment,
        })
    }
    /// Exact frozen scope claimed by the signer.
    pub const fn scope(&self) -> &GameActiveScopeV1 {
        &self.scope
    }
    /// Claimed consensus epoch.
    pub const fn epoch(&self) -> u64 {
        self.epoch
    }
    /// First logical input tick.
    pub const fn start_tick(&self) -> u32 {
        self.start_tick
    }
    /// Permanent original slot.
    pub const fn slot(&self) -> u8 {
        self.slot
    }
    /// Exact retained input commitment.
    pub const fn commitment(&self) -> &GameInputDigestV1 {
        &self.commitment
    }
    /// Exact directly signed purpose-101 frame.
    pub fn message(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        validate_input_geometry(self.slot, 0)?;
        encode_message(context, GameCertificatePurposeV1::InputCommitment, self)
    }
    /// Decode one exact purpose-101 frame, before ledger scope and authority checks.
    pub fn decode_message(
        context: &GameCertificateContextV1,
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let body = decode_message_body(context, GameCertificatePurposeV1::InputCommitment, bytes)?;
        let decoded: Self = norito::decode_canonical_with_limits(
            body,
            norito::DecodeLimits::new(
                0,
                GAME_CERTIFICATE_MAX_DIRECT_BODY_BYTES_V1,
                0,
                1024 * 1024,
                16,
            ),
        )
        .map_err(|source| {
            received_codec_failure(
                source,
                "game certificate game_certificates::decode_message decode",
            )
        })?;
        validate_input_geometry(decoded.slot, 0)?;
        Ok(decoded)
    }
}

/// An owned, typed, bounded message. Construction never accepts an arbitrary byte vector.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameCertificateMessageV1(Vec<u8>);

impl GameCertificateMessageV1 {
    /// Exact bytes to sign with pure Ed25519, including the complete protocol frame.
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    /// Verify directly with canonical strict Ed25519, bypassing persistent caches.
    ///
    /// Account policy, slot membership, network trust, scope and phase authority
    /// are checked by the caller; a valid signature alone grants none of them.
    pub fn verify(
        &self,
        public_key: &PublicKey,
        signature: &Signature,
    ) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        if public_key.try_algorithm().map_err(|source| {
            ExecutionFailure::Aborted(GameCertificateAbortV1::PublicKey { source })
        })? != Algorithm::Ed25519
            || signature.payload().len() != 64
        {
            return Err(GameCertificateVerdictV1::Signature.into());
        }
        iroha_crypto::verify_signature_for_admission(signature, public_key, &self.0).map_err(
            |source| {
                crate::signature_verification::SignatureExecutionAbort::verification_failure(
                    source,
                    GameCertificateVerdictV1::Signature,
                )
                .map_abort(GameCertificateAbortV1::Signature)
            },
        )
    }
}

fn validate_input_geometry(
    slot: u8,
    payload_length: usize,
) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
    if slot >= 32 {
        return Err(GameCertificateVerdictV1::Slot.into());
    }
    if payload_length > GAME_CERTIFICATE_MAX_INPUT_BYTES_V1 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    Ok(())
}

fn checked_body_length<T: norito::NoritoSerialize>(
    body: &T,
) -> ExecutionResult<usize, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let length = norito::canonical_frame_len(body).map_err(|source| {
        computed_codec_failure(
            source,
            "game certificate game_certificates::checked_body_length count",
        )
    })?;
    if length > GAME_CERTIFICATE_MAX_DIRECT_BODY_BYTES_V1 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    Ok(length)
}

fn frame_header(
    context: &GameCertificateContextV1,
    purpose: GameCertificatePurposeV1,
    length: usize,
) -> ExecutionResult<
    [u8; GAME_CERTIFICATE_FRAME_OVERHEAD_V1],
    GameCertificateVerdictV1,
    GameCertificateAbortV1,
> {
    if length > u32::MAX as usize {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    let length = u32::try_from(length).map_err(|source| {
        ExecutionFailure::Aborted(GameCertificateAbortV1::Length {
            context: "game certificate computed counter",
            source,
        })
    })?;
    let mut header = [0; GAME_CERTIFICATE_FRAME_OVERHEAD_V1];
    header[..26].copy_from_slice(GAME_CERTIFICATE_PREFIX_V1);
    header[26] = purpose.operation();
    header[27..29].copy_from_slice(&(purpose as u16).to_le_bytes());
    header[29..61].copy_from_slice(context.network.as_bytes());
    header[61..93].copy_from_slice(context.session_id.as_ref());
    header[93..97].copy_from_slice(&length.to_le_bytes());
    Ok(header)
}

struct DigestWriter {
    state: Sha3_384State,
    remaining: usize,
}
impl std::io::Write for DigestWriter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        if bytes.len() > self.remaining {
            return Err(std::io::Error::other("certificate body overflow"));
        }
        self.state.update(bytes);
        self.remaining -= bytes.len();
        Ok(bytes.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn encode_message<T: norito::NoritoSerialize>(
    context: &GameCertificateContextV1,
    purpose: GameCertificatePurposeV1,
    body: &T,
) -> ExecutionResult<GameCertificateMessageV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
    if purpose.operation() != 1 {
        return Err(GameCertificateVerdictV1::Frame.into());
    }
    let length = checked_body_length(body)?;
    let total = GAME_CERTIFICATE_FRAME_OVERHEAD_V1
        .checked_add(length)
        .ok_or_else(|| {
            native_failure(norito::NativeCodecFailure::CapacityOverflow {
                context: "game certificate computed capacity",
            })
        })?;
    let mut bytes = allocate_certificate_vec(total, "game certificate game_certificates bytes")?;
    bytes.extend_from_slice(&frame_header(context, purpose, length)?);
    // A fixed destination slice prevents a serializer from exceeding the counted allocation.
    bytes.resize(total, 0);
    let mut destination = &mut bytes[GAME_CERTIFICATE_FRAME_OVERHEAD_V1..];
    norito::core::write_canonical_to_writer(body, &mut destination).map_err(|source| {
        computed_codec_failure(
            source,
            "game certificate game_certificates::encode_message encode",
        )
    })?;
    if !destination.is_empty() {
        return Err(native_failure(norito::NativeCodecFailure::Invariant {
            context: "game certificate encoding did not fill its measured destination",
        }));
    }
    Ok(GameCertificateMessageV1(bytes))
}

fn decode_message_body<'a>(
    context: &GameCertificateContextV1,
    purpose: GameCertificatePurposeV1,
    bytes: &'a [u8],
) -> ExecutionResult<&'a [u8], GameCertificateVerdictV1, GameCertificateAbortV1> {
    if bytes.len() < GAME_CERTIFICATE_FRAME_OVERHEAD_V1 {
        return Err(GameCertificateVerdictV1::Frame.into());
    }
    let length = bytes.len() - GAME_CERTIFICATE_FRAME_OVERHEAD_V1;
    if length > GAME_CERTIFICATE_MAX_DIRECT_BODY_BYTES_V1 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    if bytes[..GAME_CERTIFICATE_FRAME_OVERHEAD_V1] != frame_header(context, purpose, length)? {
        return Err(GameCertificateVerdictV1::Frame.into());
    }
    Ok(&bytes[GAME_CERTIFICATE_FRAME_OVERHEAD_V1..])
}

// Fixture expectations are pure categories, never production error aliases.
// Operational failures must fail these assertions instead of entering exported
// malformed-input fixture rows.
#[cfg(test)]
#[derive(Debug, Clone, Copy)]
enum ExpectedCertificateRejection {
    Bound,
    Frame,
    Codec,
    Slot,
    Geometry,
    Signature,
}
#[cfg(test)]
fn assert_certificate_rejection<T>(
    actual: ExecutionResult<T, GameCertificateVerdictV1, GameCertificateAbortV1>,
    expected: ExpectedCertificateRejection,
) {
    match actual {
        Err(failure) => assert_certificate_failure(failure, expected),
        Ok(_) => panic!("expected {expected:?}, but the certificate was accepted"),
    }
}
#[cfg(test)]
fn assert_certificate_failure(
    actual: ExecutionFailure<GameCertificateVerdictV1, GameCertificateAbortV1>,
    expected: ExpectedCertificateRejection,
) {
    let ExecutionFailure::Deterministic(verdict) = actual else {
        panic!("expected completed {expected:?} rejection, got operational {actual:?}");
    };
    let matched = match (&verdict, expected) {
        (GameCertificateVerdictV1::Bound, ExpectedCertificateRejection::Bound)
        | (GameCertificateVerdictV1::Frame, ExpectedCertificateRejection::Frame)
        | (GameCertificateVerdictV1::Slot, ExpectedCertificateRejection::Slot)
        | (GameCertificateVerdictV1::Geometry, ExpectedCertificateRejection::Geometry)
        | (GameCertificateVerdictV1::Signature, ExpectedCertificateRejection::Signature) => true,
        (GameCertificateVerdictV1::Codec(source), ExpectedCertificateRejection::Codec) => {
            assert!(!source.source().is_operational());
            true
        }
        _ => false,
    };
    assert!(matched, "expected {expected:?}, got {verdict:?}");
}

#[cfg(test)]
fn assert_certificate_decode_allocation_failure<T>(
    actual: ExecutionResult<T, GameCertificateVerdictV1, GameCertificateAbortV1>,
) {
    let failure = match actual {
        Ok(_) => panic!("zero allocation budget must refuse owned certificate decoding"),
        Err(failure) => failure,
    };
    let ExecutionFailure::Aborted(GameCertificateAbortV1::Decode {
        source:
            norito::Error::Native(norito::NativeCodecFailure::AllocationBudget { attempted, limit }),
        ..
    }) = failure
    else {
        panic!("the decoder must preserve its actual allocation failure: {failure:?}");
    };
    assert!(attempted > 0);
    assert_eq!(limit, 0);
}

#[cfg(test)]
mod tests;
