//! Bounded ordered transcript commitments for SORA Nexus and other native games.
//!
//! Purpose 11 seeds frozen geometry, 12 appends a complete batch, 13 appends a
//! permanent-removal event, and 14 seals a root. The prepared owner validates one
//! complete source and eagerly seals a closed set of cuts; queries never hash.
//! Adapter controls remain opaque: the compiled adapter must validate every
//! payload, including the unused suffix of a terminal batch, before proof use.
use super::super::*;
use crate::game::{GameDnfEventV1, GameTranscriptBatchV1, GameTranscriptV1};
use core::mem::size_of;

/// Maximum number of complete rows, including a partial terminal row's suffix.
pub const GAME_TRANSCRIPT_COMMITMENT_MAX_BATCHES_V1: usize = 4096;
/// Maximum removal events (each removes at least one distinct original slot).
pub const GAME_TRANSCRIPT_COMMITMENT_MAX_REMOVAL_EVENTS_V1: usize = 32;
/// Aggregate accepted payload ceiling.
pub const GAME_TRANSCRIPT_COMMITMENT_MAX_INPUT_BYTES_V1: usize = 4 * 1024 * 1024;
/// Full claim frame ceiling plus the reserved 97-byte certificate header.
pub const GAME_TRANSCRIPT_COMMITMENT_MAX_FRAME_BYTES_V1: usize = 8 * 1024 * 1024;
/// Bounded reconstruction allocation ceiling; not a measured memory estimate.
pub const GAME_TRANSCRIPT_COMMITMENT_DECODE_ALLOCATION_BYTES_V1: usize = 64 * 1024 * 1024;
/// Maximum complete seed, removal-link or root-seal frame.
pub const GAME_TRANSCRIPT_SMALL_FRAME_BYTES_V1: usize = 4096;
/// Maximum complete batch-link frame.
pub const GAME_TRANSCRIPT_BATCH_FRAME_BYTES_V1: usize = 256 * 1024;
const MAX_TICKS: u32 = 1_000_000;
const MAX_LINKS: u32 = 4096 + 32;

fn add(
    a: usize,
    b: usize,
) -> ExecutionResult<usize, GameCertificateVerdictV1, GameCertificateAbortV1> {
    a.checked_add(b).ok_or_else(|| {
        native_failure(norito::NativeCodecFailure::CapacityOverflow {
            context: "game certificate computed capacity",
        })
    })
}
fn mul(
    a: usize,
    b: usize,
) -> ExecutionResult<usize, GameCertificateVerdictV1, GameCertificateAbortV1> {
    a.checked_mul(b).ok_or_else(|| {
        native_failure(norito::NativeCodecFailure::CapacityOverflow {
            context: "game certificate computed capacity",
        })
    })
}

/// Frozen generic geometry; carries no authority to choose an adapter relation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameTranscriptGeometryV1 {
    /// Complete controls per input batch, in simulation ticks.
    pub batch_ticks: u16,
    /// Frozen maximum simulation duration, divisible by the batch width.
    pub max_ticks: u32,
    /// Permanent original roster width, including later removed slots.
    pub slots: u8,
    /// Maximum opaque payload length per original slot and batch.
    pub max_input_bytes: u16,
}
impl GameTranscriptGeometryV1 {
    /// Validate independent cardinality, divisibility and aggregate admission bounds.
    pub fn validate(
        &self,
    ) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        if self.slots == 0 || self.slots > 32 {
            return Err(GameCertificateVerdictV1::Slot.into());
        }
        if self.batch_ticks == 0 || self.max_ticks == 0 || self.max_input_bytes == 0 {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        if self.batch_ticks > 256 || self.max_ticks > MAX_TICKS || self.max_input_bytes > 4096 {
            return Err(GameCertificateVerdictV1::Bound.into());
        }
        if self.max_ticks % u32::from(self.batch_ticks) != 0 {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        let batches =
            usize::try_from(self.max_ticks / u32::from(self.batch_ticks)).map_err(|source| {
                ExecutionFailure::Aborted(GameCertificateAbortV1::Length {
                    context: "game certificate computed counter",
                    source,
                })
            })?;
        if batches > GAME_TRANSCRIPT_COMMITMENT_MAX_BATCHES_V1
            || mul(
                mul(batches, usize::from(self.slots))?,
                usize::from(self.max_input_bytes),
            )? > GAME_TRANSCRIPT_COMMITMENT_MAX_INPUT_BYTES_V1
        {
            return Err(GameCertificateVerdictV1::Bound.into());
        }
        Ok(())
    }
}

/// Exact seed body. Geometry is bound once, before any accepted event.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameTranscriptSeedBodyV1 {
    scope: GameActiveScopeV1,
    batch_ticks: u16,
    max_ticks: u32,
    slots: u8,
    max_input_bytes: u16,
}
impl GameTranscriptSeedBodyV1 {
    /// Construct a seed with independently bounded geometry.
    pub fn new(
        scope: GameActiveScopeV1,
        geometry: GameTranscriptGeometryV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        geometry.validate()?;
        Ok(Self {
            scope,
            batch_ticks: geometry.batch_ticks,
            max_ticks: geometry.max_ticks,
            slots: geometry.slots,
            max_input_bytes: geometry.max_input_bytes,
        })
    }
    /// Frozen manifest/admission scope.
    pub const fn scope(&self) -> &GameActiveScopeV1 {
        &self.scope
    }
    /// Exact seed geometry.
    pub const fn geometry(&self) -> GameTranscriptGeometryV1 {
        GameTranscriptGeometryV1 {
            batch_ticks: self.batch_ticks,
            max_ticks: self.max_ticks,
            slots: self.slots,
            max_input_bytes: self.max_input_bytes,
        }
    }
    fn validate(&self) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        self.geometry().validate()
    }
}

/// One complete input row linked to an exact prior head and total event ordinal.
#[derive(Debug, Clone, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameTranscriptBatchLinkBodyV1 {
    previous: GameTranscriptChainHeadV1,
    ordinal: u32,
    batch: GameTranscriptBatchV1,
}
impl GameTranscriptBatchLinkBodyV1 {
    /// Own a bounded row; complete-history geometry is checked by the prepared owner.
    pub fn new(
        previous: GameTranscriptChainHeadV1,
        ordinal: u32,
        batch: GameTranscriptBatchV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let body = Self {
            previous,
            ordinal,
            batch,
        };
        body.validate()?;
        Ok(body)
    }
    /// Previous ordered chain head.
    pub const fn previous(&self) -> GameTranscriptChainHeadV1 {
        self.previous
    }
    /// Zero-based ordinal among all batch and removal links.
    pub const fn ordinal(&self) -> u32 {
        self.ordinal
    }
    /// Exact complete row, without normalization.
    pub const fn batch(&self) -> &GameTranscriptBatchV1 {
        &self.batch
    }
    fn validate(&self) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        if self.ordinal >= MAX_LINKS
            || self.batch.start_tick >= MAX_TICKS
            || self.batch.inputs.len() > 32
            || self.batch.inputs.iter().any(|x| x.len() > 4096)
        {
            return Err(GameCertificateVerdictV1::Bound.into());
        }
        if self.batch.inputs.is_empty() {
            return Err(GameCertificateVerdictV1::Slot.into());
        }
        Ok(())
    }
}

/// One ordered permanent-removal event, before any input row at the same tick.
#[derive(Debug, Clone, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameTranscriptRemovalLinkBodyV1 {
    previous: GameTranscriptChainHeadV1,
    ordinal: u32,
    event: GameDnfEventV1,
}
impl GameTranscriptRemovalLinkBodyV1 {
    /// Own a locally bounded event; alignment and uniqueness across events need geometry.
    pub fn new(
        previous: GameTranscriptChainHeadV1,
        ordinal: u32,
        event: GameDnfEventV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let body = Self {
            previous,
            ordinal,
            event,
        };
        body.validate()?;
        Ok(body)
    }
    /// Previous ordered chain head.
    pub const fn previous(&self) -> GameTranscriptChainHeadV1 {
        self.previous
    }
    /// Zero-based ordinal among all links.
    pub const fn ordinal(&self) -> u32 {
        self.ordinal
    }
    /// Exact removal event.
    pub const fn event(&self) -> &GameDnfEventV1 {
        &self.event
    }
    fn validate(&self) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        if self.ordinal >= MAX_LINKS || self.event.tick >= MAX_TICKS || self.event.slots.len() > 32
        {
            return Err(GameCertificateVerdictV1::Bound.into());
        }
        if self.event.slots.iter().any(|&s| s >= 32) {
            return Err(GameCertificateVerdictV1::Slot.into());
        }
        if self.event.slots.is_empty() || self.event.slots.windows(2).any(|x| x[0] >= x[1]) {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        Ok(())
    }
}

/// Root seal. Equal scope, tick, counts and ordered head always produce equal roots.
/// There is no hidden checkpoint/accepted mode bit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameTranscriptRootBodyV1 {
    scope: GameActiveScopeV1,
    through_tick: u32,
    batch_count: u32,
    removal_count: u32,
    head: GameTranscriptChainHeadV1,
}
impl GameTranscriptRootBodyV1 {
    /// Construct a local seal claim; only preparation verifies the claimed chain.
    pub fn new(
        scope: GameActiveScopeV1,
        through_tick: u32,
        batch_count: u32,
        removal_count: u32,
        head: GameTranscriptChainHeadV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let body = Self {
            scope,
            through_tick,
            batch_count,
            removal_count,
            head,
        };
        body.validate()?;
        Ok(body)
    }
    /// Frozen manifest/admission scope.
    pub const fn scope(&self) -> &GameActiveScopeV1 {
        &self.scope
    }
    /// Exact cut tick, possibly the single partial terminal frontier.
    pub const fn through_tick(&self) -> u32 {
        self.through_tick
    }
    /// Number of complete rows committed, including a terminal row's full suffix.
    pub const fn batch_count(&self) -> u32 {
        self.batch_count
    }
    /// Number of included removal events.
    pub const fn removal_count(&self) -> u32 {
        self.removal_count
    }
    /// Exact append-chain head, not itself a sealed root.
    pub const fn head(&self) -> GameTranscriptChainHeadV1 {
        self.head
    }
    fn validate(&self) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        if self.through_tick > MAX_TICKS || self.batch_count > 4096 || self.removal_count > 32 {
            return Err(GameCertificateVerdictV1::Bound.into());
        }
        if (self.batch_count == 0) != (self.through_tick == 0) {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        Ok(())
    }
}

fn length<T: norito::NoritoSerialize>(
    body: &T,
    cap: usize,
) -> ExecutionResult<usize, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let len = norito::canonical_frame_len(body).map_err(|source| {
        computed_codec_failure(source, "game certificate transcript::length count")
    })?;
    if len > cap - GAME_CERTIFICATE_FRAME_OVERHEAD_V1 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    Ok(len)
}
fn hash<T: norito::NoritoSerialize>(
    ctx: &GameCertificateContextV1,
    purpose: GameCertificatePurposeV1,
    body: &T,
    cap: usize,
) -> ExecutionResult<(GameCommitmentV1, usize), GameCertificateVerdictV1, GameCertificateAbortV1> {
    let len = length(body, cap)?;
    let mut state = Sha3_384State::new();
    state.update(&frame_header(ctx, purpose, len)?);
    let mut sink = DigestWriter {
        state,
        remaining: len,
    };
    norito::core::write_canonical_to_writer(body, &mut sink).map_err(|source| {
        computed_codec_failure(source, "game certificate transcript::hash encode")
    })?;
    if sink.remaining != 0 {
        return Err(native_failure(norito::NativeCodecFailure::Invariant {
            context: "game certificate encoding did not fill its measured destination",
        }));
    }
    Ok((
        GameCommitmentV1::from_bytes(sink.state.finalize()),
        add(GAME_CERTIFICATE_FRAME_OVERHEAD_V1, len)?,
    ))
}
fn decode_link<T>(
    ctx: &GameCertificateContextV1,
    purpose: GameCertificatePurposeV1,
    bytes: &[u8],
    cap: usize,
) -> ExecutionResult<T, GameCertificateVerdictV1, GameCertificateAbortV1>
where
    T: norito::NoritoSerialize + for<'de> norito::NoritoDeserialize<'de>,
{
    let len = bytes
        .len()
        .checked_sub(GAME_CERTIFICATE_FRAME_OVERHEAD_V1)
        .ok_or_else(|| ExecutionFailure::Deterministic(GameCertificateVerdictV1::Frame))?;
    if bytes.len() > cap {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    if bytes[..GAME_CERTIFICATE_FRAME_OVERHEAD_V1] != frame_header(ctx, purpose, len)? {
        return Err(GameCertificateVerdictV1::Frame.into());
    }
    // Per-body bounds are additionally checked after bounded canonical reconstruction.
    norito::decode_canonical_with_limits(
        &bytes[GAME_CERTIFICATE_FRAME_OVERHEAD_V1..],
        norito::DecodeLimits::new(4096, cap, 32 * 4096 + 32, 8 * 1024 * 1024, 32),
    )
    .map_err(|source| {
        received_codec_failure(source, "game certificate transcript::decode_link decode")
    })
}
macro_rules! body_api {
    ($ty:ident, $purpose:ident, $cap:ident, $result:ident) => {
        impl $ty {
            /// Revalidate a locally bounded claim and hash its exact purpose frame.
            pub fn commitment(
                &self,
                context: &GameCertificateContextV1,
            ) -> ExecutionResult<$result, GameCertificateVerdictV1, GameCertificateAbortV1> {
                self.validate()?;
                hash(context, GameCertificatePurposeV1::$purpose, self, $cap)
                    .map(|(digest, _)| $result::from_commitment(digest))
            }
            /// Decode one exact canonical body under an independently supplied context.
            pub fn decode_framed(
                context: &GameCertificateContextV1,
                bytes: &[u8],
            ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
                let body: Self =
                    decode_link(context, GameCertificatePurposeV1::$purpose, bytes, $cap)?;
                body.validate()?;
                Ok(body)
            }
        }
    };
}
body_api!(
    GameTranscriptSeedBodyV1,
    TranscriptSeed,
    GAME_TRANSCRIPT_SMALL_FRAME_BYTES_V1,
    GameTranscriptChainHeadV1
);
body_api!(
    GameTranscriptBatchLinkBodyV1,
    TranscriptBatchLink,
    GAME_TRANSCRIPT_BATCH_FRAME_BYTES_V1,
    GameTranscriptChainHeadV1
);
body_api!(
    GameTranscriptRemovalLinkBodyV1,
    TranscriptRemovalLink,
    GAME_TRANSCRIPT_SMALL_FRAME_BYTES_V1,
    GameTranscriptChainHeadV1
);
body_api!(
    GameTranscriptRootBodyV1,
    TranscriptRoot,
    GAME_TRANSCRIPT_SMALL_FRAME_BYTES_V1,
    GameTranscriptRootV1
);

/// Owned public transcript claim. Deserialization conveys no valid-history capability.
#[derive(Debug, Clone, PartialEq, Eq, Decode, Encode, IntoSchema)]
pub struct GameTranscriptClaimV1 {
    scope: GameActiveScopeV1,
    geometry: GameTranscriptGeometryV1,
    through_tick: u32,
    transcript: GameTranscriptV1,
}
impl GameTranscriptClaimV1 {
    /// Own a complete source after bounded generic shape checks, without hashing it.
    pub fn new(
        scope: GameActiveScopeV1,
        geometry: GameTranscriptGeometryV1,
        through_tick: u32,
        transcript: GameTranscriptV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_source(geometry, through_tick, &transcript)?;
        let body = Self {
            scope,
            geometry,
            through_tick,
            transcript,
        };
        body.check_frame()?;
        Ok(body)
    }
    /// Decode one canonical claim under fixed allocation and element ceilings.
    /// This validates generic shape; adapter semantics and ledger origin remain separate.
    pub fn decode_canonical(
        bytes: &[u8],
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        let cap =
            GAME_TRANSCRIPT_COMMITMENT_MAX_FRAME_BYTES_V1 - GAME_CERTIFICATE_FRAME_OVERHEAD_V1;
        if bytes.len() > cap {
            return Err(GameCertificateVerdictV1::Bound.into());
        }
        let body: Self = norito::decode_canonical_with_limits(
            bytes,
            norito::DecodeLimits::new(
                4096,
                cap,
                GAME_TRANSCRIPT_COMMITMENT_MAX_INPUT_BYTES_V1 + 4096 * 32 + 4096 + 32 + 32,
                GAME_TRANSCRIPT_COMMITMENT_DECODE_ALLOCATION_BYTES_V1,
                32,
            ),
        )
        .map_err(|source| {
            received_codec_failure(
                source,
                "game certificate transcript::decode_canonical decode",
            )
        })?;
        validate_source(body.geometry, body.through_tick, &body.transcript)?;
        Ok(body)
    }
    /// Frozen scope claimed by this untrusted public object.
    pub const fn scope(&self) -> &GameActiveScopeV1 {
        &self.scope
    }
    /// Exact claimed generic geometry.
    pub const fn geometry(&self) -> GameTranscriptGeometryV1 {
        self.geometry
    }
    /// Complete accepted frontier, independent of the final simulation tick.
    pub const fn through_tick(&self) -> u32 {
        self.through_tick
    }
    /// Exact unnormalized transcript.
    pub const fn transcript(&self) -> &GameTranscriptV1 {
        &self.transcript
    }
    fn check_frame(&self) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        length(self, GAME_TRANSCRIPT_COMMITMENT_MAX_FRAME_BYTES_V1).map(|_| ())
    }
    /// Recheck decoded claims, then build the immutable closed root cache.
    pub fn prepare(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<
        PreparedGameTranscriptV1<'_>,
        GameCertificateVerdictV1,
        GameCertificateAbortV1,
    > {
        validate_source(self.geometry, self.through_tick, &self.transcript)?;
        self.check_frame()?;
        PreparedGameTranscriptV1::from_validated_source(
            context,
            self.scope,
            self.geometry,
            self.through_tick,
            &self.transcript,
        )
    }
    /// Commit accepted history, including boundary removals at the frontier.
    pub fn commitment(
        &self,
        context: &GameCertificateContextV1,
    ) -> ExecutionResult<GameTranscriptRootV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        Ok(self.prepare(context)?.accepted_root())
    }
}

fn validate_source(
    g: GameTranscriptGeometryV1,
    through: u32,
    t: &GameTranscriptV1,
) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
    g.validate()?;
    if through > g.max_ticks {
        return Err(GameCertificateVerdictV1::Geometry.into());
    }
    if t.batches.len() > 4096 || t.dnf_events.len() > 32 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    let width = u32::from(g.batch_ticks);
    let count = through.div_ceil(width) as usize;
    if t.batches.len() != count {
        return Err(GameCertificateVerdictV1::Geometry.into());
    }
    let mut removed = [false; 32];
    let mut previous = None;
    for e in &t.dnf_events {
        if e.slots.len() > 32 {
            return Err(GameCertificateVerdictV1::Bound.into());
        }
        if e.tick % width != 0
            || e.tick > through
            || e.tick >= g.max_ticks
            || previous.is_some_and(|p| p >= e.tick)
            || e.slots.is_empty()
            || e.slots.windows(2).any(|s| s[0] >= s[1])
        {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        for &slot in &e.slots {
            if slot >= g.slots {
                return Err(GameCertificateVerdictV1::Slot.into());
            }
            if removed[usize::from(slot)] {
                return Err(GameCertificateVerdictV1::Geometry.into());
            }
            removed[usize::from(slot)] = true;
        }
        previous = Some(e.tick);
    }
    removed.fill(false);
    let mut event = 0;
    let mut payload = 0;
    for (index, row) in t.batches.iter().enumerate() {
        let start = u32::try_from(index)
            .map_err(|source| {
                ExecutionFailure::Aborted(GameCertificateAbortV1::Length {
                    context: "game certificate computed counter",
                    source,
                })
            })?
            .checked_mul(width)
            .ok_or_else(|| {
                native_failure(norito::NativeCodecFailure::CapacityOverflow {
                    context: "game certificate computed capacity",
                })
            })?;
        if row.start_tick != start {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        if row.inputs.len() != usize::from(g.slots) {
            return Err(GameCertificateVerdictV1::Slot.into());
        }
        if event < t.dnf_events.len() && t.dnf_events[event].tick == start {
            for &slot in &t.dnf_events[event].slots {
                removed[usize::from(slot)] = true;
            }
            event += 1;
        }
        for (slot, input) in row.inputs.iter().enumerate() {
            if input.len() > usize::from(g.max_input_bytes) {
                return Err(GameCertificateVerdictV1::Bound.into());
            }
            if removed[slot] && !input.is_empty() {
                return Err(GameCertificateVerdictV1::Geometry.into());
            }
            payload = add(payload, input.len())?;
        }
    }
    if payload > GAME_TRANSCRIPT_COMMITMENT_MAX_INPUT_BYTES_V1 {
        return Err(GameCertificateVerdictV1::Bound.into());
    }
    Ok(())
}

/// Exact transcript frame work, excluding adapter checks, allocations and proof work.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
pub struct GameTranscriptHashWorkV1 {
    /// Seed, link and seal frames actually hashed during preparation.
    pub frames: usize,
    /// Complete canonical frame bytes absorbed by SHA3-384.
    pub hashed_bytes: usize,
    /// SHA3-384 rate-block permutations including padding (104-byte rate).
    pub sha3_permutations: usize,
}
impl GameTranscriptHashWorkV1 {
    fn record(
        &mut self,
        bytes: usize,
    ) -> ExecutionResult<(), GameCertificateVerdictV1, GameCertificateAbortV1> {
        self.frames = add(self.frames, 1)?;
        self.hashed_bytes = add(self.hashed_bytes, bytes)?;
        self.sha3_permutations = add(self.sha3_permutations, add(bytes / 104, 1)?)?;
        Ok(())
    }
}

/// Prepared consistency owner borrowing the exact validated complete source.
///
/// Only aligned cuts through the frontier and its single partial cut are exposed.
/// A checkpoint excludes same-tick removals; the accepted root includes them.
/// Equal included events produce equal roots, preserving certificate parent equality.
#[derive(Debug)]
pub struct PreparedGameTranscriptV1<'a> {
    context: GameCertificateContextV1,
    scope: GameActiveScopeV1,
    geometry: GameTranscriptGeometryV1,
    through_tick: u32,
    transcript: &'a GameTranscriptV1,
    aligned: Vec<GameTranscriptRootV1>,
    partial: Option<GameTranscriptRootV1>,
    accepted: GameTranscriptRootV1,
    work: GameTranscriptHashWorkV1,
    temporary_payload_bytes: usize,
}
impl<'a> PreparedGameTranscriptV1<'a> {
    /// Validate every source row/removal, then hash each ordered event exactly once.
    pub fn new(
        context: &GameCertificateContextV1,
        scope: GameActiveScopeV1,
        geometry: GameTranscriptGeometryV1,
        through_tick: u32,
        transcript: &'a GameTranscriptV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        validate_source(geometry, through_tick, transcript)?;
        Self::from_validated_source(context, scope, geometry, through_tick, transcript)
    }
    // Private: every caller has validated the exact borrowed source first.
    fn from_validated_source(
        context: &GameCertificateContextV1,
        scope: GameActiveScopeV1,
        geometry: GameTranscriptGeometryV1,
        through_tick: u32,
        transcript: &'a GameTranscriptV1,
    ) -> ExecutionResult<Self, GameCertificateVerdictV1, GameCertificateAbortV1> {
        // No full transcript clone or full canonical serialization is required.
        // Source geometry bounds the public claim below its 8 MiB frame ceiling.
        let width = u32::from(geometry.batch_ticks);
        let aligned_count = add((through_tick / width) as usize, 1)?;
        let mut aligned =
            allocate_certificate_vec(aligned_count, "game certificate transcript aligned")?;
        let mut work = GameTranscriptHashWorkV1::default();
        let seed = GameTranscriptSeedBodyV1::new(scope, geometry)?;
        let (digest, bytes) = hash(
            context,
            GameCertificatePurposeV1::TranscriptSeed,
            &seed,
            GAME_TRANSCRIPT_SMALL_FRAME_BYTES_V1,
        )?;
        work.record(bytes)?;
        let mut head = GameTranscriptChainHeadV1::from_commitment(digest);
        let mut temp = size_of::<GameTranscriptSeedBodyV1>();
        let mut ordinal = 0_u32;
        let mut event = 0_usize;
        for index in 0..aligned_count {
            let tick = (index as u32).checked_mul(width).ok_or_else(|| {
                native_failure(norito::NativeCodecFailure::CapacityOverflow {
                    context: "game certificate computed capacity",
                })
            })?;
            aligned.push(seal(context, scope, tick, index, event, head, &mut work)?);
            if event < transcript.dnf_events.len() && transcript.dnf_events[event].tick == tick {
                let source = &transcript.dnf_events[event];
                let mut slots = allocate_certificate_vec(
                    source.slots.len(),
                    "game certificate transcript slots",
                )?;
                slots.extend_from_slice(&source.slots);
                let body = GameTranscriptRemovalLinkBodyV1::new(
                    head,
                    ordinal,
                    GameDnfEventV1 { tick, slots },
                )?;
                temp = temp.max(add(
                    size_of::<GameTranscriptRemovalLinkBodyV1>(),
                    body.event.slots.capacity(),
                )?);
                let (digest, bytes) = hash(
                    context,
                    GameCertificatePurposeV1::TranscriptRemovalLink,
                    &body,
                    GAME_TRANSCRIPT_SMALL_FRAME_BYTES_V1,
                )?;
                work.record(bytes)?;
                head = GameTranscriptChainHeadV1::from_commitment(digest);
                ordinal = ordinal.checked_add(1).ok_or_else(|| {
                    native_failure(norito::NativeCodecFailure::CapacityOverflow {
                        context: "game certificate computed capacity",
                    })
                })?;
                event += 1;
            }
            if index < transcript.batches.len() {
                let batch = clone_row(&transcript.batches[index])?;
                let body = GameTranscriptBatchLinkBodyV1::new(head, ordinal, batch)?;
                temp = temp.max(batch_owned_bytes(&body)?);
                let (digest, bytes) = hash(
                    context,
                    GameCertificatePurposeV1::TranscriptBatchLink,
                    &body,
                    GAME_TRANSCRIPT_BATCH_FRAME_BYTES_V1,
                )?;
                work.record(bytes)?;
                head = GameTranscriptChainHeadV1::from_commitment(digest);
                ordinal = ordinal.checked_add(1).ok_or_else(|| {
                    native_failure(norito::NativeCodecFailure::CapacityOverflow {
                        context: "game certificate computed capacity",
                    })
                })?;
            }
        }
        let partial = if through_tick % width != 0 {
            Some(seal(
                context,
                scope,
                through_tick,
                transcript.batches.len(),
                event,
                head,
                &mut work,
            )?)
        } else {
            None
        };
        let accepted = seal(
            context,
            scope,
            through_tick,
            transcript.batches.len(),
            event,
            head,
            &mut work,
        )?;
        if event != transcript.dnf_events.len() {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        temp = temp.max(size_of::<GameTranscriptRootBodyV1>());
        Ok(Self {
            context: *context,
            scope,
            geometry,
            through_tick,
            transcript,
            aligned,
            partial,
            accepted,
            work,
            temporary_payload_bytes: temp,
        })
    }
    /// Cached pre-removal root at an aligned cut or the sole partial frontier.
    pub fn checkpoint_root(
        &self,
        tick: u32,
    ) -> ExecutionResult<GameTranscriptRootV1, GameCertificateVerdictV1, GameCertificateAbortV1>
    {
        if tick > self.through_tick {
            return Err(GameCertificateVerdictV1::Geometry.into());
        }
        let width = u32::from(self.geometry.batch_ticks);
        if tick % width == 0 {
            return self
                .aligned
                .get((tick / width) as usize)
                .copied()
                .ok_or_else(|| {
                    ExecutionFailure::Deterministic(GameCertificateVerdictV1::Geometry)
                });
        }
        if tick == self.through_tick {
            return self.partial.ok_or_else(|| {
                ExecutionFailure::Deterministic(GameCertificateVerdictV1::Geometry)
            });
        }
        Err(GameCertificateVerdictV1::Geometry.into())
    }
    /// Cached accepted root including every supplied event through the frontier.
    pub const fn accepted_root(&self) -> GameTranscriptRootV1 {
        self.accepted
    }
    /// Exact source borrowed for the owner's lifetime.
    pub const fn transcript(&self) -> &GameTranscriptV1 {
        self.transcript
    }
    /// Context under which every seed, link and root was hashed.
    pub const fn context(&self) -> &GameCertificateContextV1 {
        &self.context
    }
    /// Exact immutable manifest and admission scope.
    pub const fn scope(&self) -> GameActiveScopeV1 {
        self.scope
    }
    /// Validated generic geometry.
    pub const fn geometry(&self) -> GameTranscriptGeometryV1 {
        self.geometry
    }
    /// Closed accepted frontier.
    pub const fn through_tick(&self) -> u32 {
        self.through_tick
    }
    /// Inline owner plus actual retained root-vector allocation capacity.
    /// Borrowed transcript storage is counted by its independent source owner.
    pub fn owned_payload_bytes(
        &self,
    ) -> ExecutionResult<usize, GameCertificateVerdictV1, GameCertificateAbortV1> {
        add(
            size_of::<Self>(),
            mul(self.aligned.capacity(), size_of::<GameTranscriptRootV1>())?,
        )
    }
    /// Owner plus maximum single cloned typed body and fixed hash scratch.
    /// Includes all row Vec headers/capacities; excludes allocator metadata,
    /// canonical encoder stack frames, borrowed input and process RSS.
    pub fn peak_preparation_payload_bytes(
        &self,
    ) -> ExecutionResult<usize, GameCertificateVerdictV1, GameCertificateAbortV1> {
        add(
            add(self.owned_payload_bytes()?, self.temporary_payload_bytes)?,
            add(
                size_of::<DigestWriter>(),
                GAME_CERTIFICATE_FRAME_OVERHEAD_V1,
            )?,
        )
    }
    /// Work already paid; repeated root queries do not change these counters.
    pub const fn hash_work(&self) -> GameTranscriptHashWorkV1 {
        self.work
    }
}
fn seal(
    context: &GameCertificateContextV1,
    scope: GameActiveScopeV1,
    tick: u32,
    batches: usize,
    removals: usize,
    head: GameTranscriptChainHeadV1,
    work: &mut GameTranscriptHashWorkV1,
) -> ExecutionResult<GameTranscriptRootV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let body = GameTranscriptRootBodyV1::new(
        scope,
        tick,
        u32::try_from(batches).map_err(|source| {
            ExecutionFailure::Aborted(GameCertificateAbortV1::Length {
                context: "game certificate computed counter",
                source,
            })
        })?,
        u32::try_from(removals).map_err(|source| {
            ExecutionFailure::Aborted(GameCertificateAbortV1::Length {
                context: "game certificate computed counter",
                source,
            })
        })?,
        head,
    )?;
    let (digest, bytes) = hash(
        context,
        GameCertificatePurposeV1::TranscriptRoot,
        &body,
        GAME_TRANSCRIPT_SMALL_FRAME_BYTES_V1,
    )?;
    work.record(bytes)?;
    Ok(GameTranscriptRootV1::from_commitment(digest))
}
fn clone_row(
    source: &GameTranscriptBatchV1,
) -> ExecutionResult<GameTranscriptBatchV1, GameCertificateVerdictV1, GameCertificateAbortV1> {
    let mut inputs =
        allocate_certificate_vec(source.inputs.len(), "game certificate transcript inputs")?;
    for input in &source.inputs {
        let mut owned = allocate_certificate_vec(input.len(), "game certificate transcript owned")?;
        owned.extend_from_slice(input);
        inputs.push(owned);
    }
    Ok(GameTranscriptBatchV1 {
        start_tick: source.start_tick,
        inputs,
    })
}
fn batch_owned_bytes(
    body: &GameTranscriptBatchLinkBodyV1,
) -> ExecutionResult<usize, GameCertificateVerdictV1, GameCertificateAbortV1> {
    body.batch.inputs.iter().try_fold(
        add(
            size_of::<GameTranscriptBatchLinkBodyV1>(),
            mul(body.batch.inputs.capacity(), size_of::<Vec<u8>>())?,
        )?,
        |total, input| add(total, input.capacity()),
    )
}

#[cfg(test)]
mod tests;
