//! Complete retained generic-session history validation, without ledger authority.
//!
//! A receipt binds every canonical field of the supplied native session record,
//! the complete accepted transcript and exact current
//! commitment/reveal evidence. Signatures authenticate original gameplay keys;
//! they do not prove that a block, deadline expiry, removal or payment occurred.
//! `require_snapshot` compares a complete record pin; it does not verify finality.
//!
//! Input-prefix commitments belong to the selected compiled application. Its
//! callback receives the exact immutable session, policy and complete transcript;
//! this generic validator supplies no default domain or compatibility fallback.
//! Computation identity is independent of its observation height or future carrier.
//! Finality and exact execution-state provenance are separate outer associations.
//! Native Hash is a 255-bit index; this layer makes no 128-bit composition claim.
//!
//! Sources are borrowed immutably after validation. Public accessors expose
//! controls only before the selected terminal tick and removals only through
//! that boundary. Later accepted data is still fully checked and committed.

use super::super::game_binding;
use super::super::stark::transparent_stark::{
    GoldilocksDigest384V1, TransparentStarkDigestContextV1, TransparentStarkErrorV1,
    goldilocks_digest384_frame_v1,
};
use iroha_crypto::{Algorithm, Hash, PublicKey, derive_non_signing_ed25519_public_key};
use iroha_data_model::game_certificates::{lifecycle::*, *};
use iroha_data_model::{account::AccountId, game::*, nft::NftId, nft_market::NftCustodyPurposeV1};
use iroha_primitives::numeric::{MAX_DECIMAL_SCALE, Numeric, Quantity, RoundingMode};
use norito::codec::Encode;
use std::collections::{BTreeMap, BTreeSet};

const DOMAIN: &[u8] = b"iroha:execution:accepted-record:v1\0";
const MAX_TICKS: u32 = 1_000_000;
const MAX_BATCHES: usize = 4096;
const MAX_PAYLOAD: usize = 4096;
const MAX_INPUT_BYTES: usize = 4_194_304;
const MAX_RECORD_BYTES: usize = iroha_data_model::execution_proofs::EXECUTION_RECORD_MAX_BYTES_V1;
const MAX_EVIDENCE_BYTES: usize = 8 << 20;
const MAX_ACCOUNT_BYTES: usize = 32 << 10;
const MAX_OUTCOME_BYTES: usize = 65536;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct Policy {
    pub(crate) application_id: Hash,
    pub(crate) profile_id: Hash,
    pub(crate) compiled_relation: Hash,
    pub(crate) genesis_state_root: GameStateRootV1,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ObservationContext {
    /// Chronology bound supplied by the observing ledger or finalized wrapper.
    /// It never changes accepted controls and is excluded from proof identity.
    /// A caller supplying this height does not gain ledger or finality authority.
    pub(crate) height: u64,
}
pub(crate) type Evidence = iroha_data_model::execution_proofs::game_bundle::GameReplayEvidenceV1;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Mode {
    /// A structurally valid started snapshot selected for computation.
    Selection,
    /// A retained settled record; its outcome is metadata, not freshly proved here.
    ArchivedSettled,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Error {
    Resource(&'static str),
    Bounds(&'static str),
    Shape(&'static str),
    Signature(&'static str),
    Identity(&'static str),
    Phase(&'static str),
    Input(&'static str),
    SnapshotPin,
    Access(&'static str),
    /// A shared certificate or proof helper could not decide locally; never a verdict.
    Aborted(iroha_primitives::execution::ExecutionAbort),
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "accepted history: {self:?}")
    }
}
impl std::error::Error for Error {}
impl Error {
    /// Whether this is a local failure rather than a verdict on the history.
    pub(crate) fn is_resource(&self) -> bool {
        matches!(self, Self::Resource(_) | Self::Aborted(_))
    }
    /// The local abort that kept this check from deciding, if any.
    pub(crate) fn local_abort(&self) -> Option<iroha_primitives::execution::ExecutionAbort> {
        match self {
            Self::Resource(context) => {
                Some(iroha_primitives::execution::ExecutionAbort::Resource { context })
            }
            Self::Aborted(abort) => Some(*abort),
            _ => None,
        }
    }
}
/// A failure from a shared certificate, admission, proof or digest helper.
trait LocalAbort {
    /// The local abort it carries, if it is not a verdict.
    fn local_abort(self) -> Option<iroha_primitives::execution::ExecutionAbort>;
}
impl LocalAbort for crate::execution_proofs::ExecutionProofErrorV1 {
    fn local_abort(self) -> Option<iroha_primitives::execution::ExecutionAbort> {
        match self {
            Self::Aborted(abort) => Some(abort),
            _ => None,
        }
    }
}
impl LocalAbort
    for iroha_primitives::execution::ExecutionFailure<GameCertificateVerdictV1, GameCertificateAbortV1>
{
    fn local_abort(self) -> Option<iroha_primitives::execution::ExecutionAbort> {
        match self {
            Self::Deterministic(_) => None,
            Self::Aborted(abort) => {
                Some(crate::smartcontracts::execution::game_certificate_abort(abort))
            }
            Self::RecoveryFailed(_) => Some(iroha_primitives::execution::ExecutionAbort::Invariant {
                context: "game certificate recovery failed",
            }),
        }
    }
}
impl LocalAbort
    for iroha_primitives::execution::ExecutionFailure<GameAdmissionVerdictV1, GameAdmissionAbortV1>
{
    fn local_abort(self) -> Option<iroha_primitives::execution::ExecutionAbort> {
        match self {
            Self::Deterministic(_) => None,
            Self::Aborted(abort) => {
                Some(crate::smartcontracts::execution::game_admission_abort(abort))
            }
            Self::RecoveryFailed(_) => Some(iroha_primitives::execution::ExecutionAbort::Invariant {
                context: "game admission recovery failed",
            }),
        }
    }
}
impl LocalAbort for TransparentStarkErrorV1 {
    fn local_abort(self) -> Option<iroha_primitives::execution::ExecutionAbort> {
        matches!(self, Self::AllocationFailure).then_some(
            iroha_primitives::execution::ExecutionAbort::Resource {
                context: "accepted history digest",
            },
        )
    }
}
/// Keep a helper's local abort; any other failure is `verdict`.
fn or_verdict<E: LocalAbort>(verdict: Error) -> impl FnOnce(E) -> Error {
    move |error| error.local_abort().map_or(verdict, Error::Aborted)
}
/// Encoding an admitted in-memory value fails only locally (allocation, writer); a
/// structural codec refusal stays a shape verdict.
fn encoding_error(error: norito::Error, context: &'static str) -> Error {
    if error.is_operational() {
        Error::Resource(context)
    } else {
        Error::Shape(context)
    }
}
fn add(a: usize, b: usize) -> Result<usize, Error> {
    a.checked_add(b).ok_or(Error::Bounds("addition"))
}
fn bounded_encode<T: norito::NoritoSerialize>(value: &T, cap: usize) -> Result<Vec<u8>, Error> {
    // Native codec's length pass precedes its bulk output allocation. Container
    // cardinalities and individual dynamic fields have already been admitted.
    let length = norito::canonical_frame_len(value)
        .map_err(|error| encoding_error(error, "canonical encoding"))?;
    if length > cap {
        return Err(Error::Bounds("canonical encoding"));
    }
    let bytes = norito::encode_canonical(value)
        .map_err(|error| encoding_error(error, "canonical encoding"))?;
    if bytes.len() != length {
        return Err(Error::Shape("canonical encoding length"));
    }
    Ok(bytes)
}
fn key_bound(key: &PublicKey) -> Result<usize, Error> {
    let (_, payload) = key.try_to_bytes().map_err(|_| Error::Shape("public key"))?;
    if payload.len() > MAX_ACCOUNT_BYTES {
        return Err(Error::Bounds("public key"));
    }
    Ok(payload.len())
}
fn account_bound(account: &AccountId) -> Result<(), Error> {
    if let Some(policy) = account.multisig_policy() {
        if policy.members().len() > MAX_ACCOUNT_BYTES {
            return Err(Error::Bounds("account members"));
        }
        let mut raw = 0;
        for member in policy.members() {
            raw = add(raw, key_bound(member.public_key())?)?;
            if raw > MAX_ACCOUNT_BYTES {
                return Err(Error::Bounds("account key payload"));
            }
        }
    } else if let Some(key) = account.controller().single_signatory() {
        key_bound(key)?;
    }
    bounded_encode(account, MAX_ACCOUNT_BYTES)?;
    Ok(())
}
fn signature_bounds(signatures: &[GameSlotSignatureV1]) -> Result<(), Error> {
    if signatures.len() > GAME_MAX_PARTICIPANTS_V1 {
        return Err(Error::Bounds("certificate signatures"));
    }
    if signatures.iter().any(|s| s.signature.payload().len() != 64) {
        return Err(Error::Signature("Ed25519 length"));
    }
    Ok(())
}
fn payload_rows(rows: impl IntoIterator<Item = impl AsRef<[Vec<u8>]>>) -> Result<(), Error> {
    let mut total = 0;
    for inputs in rows {
        let inputs = inputs.as_ref();
        if inputs.len() > GAME_MAX_PARTICIPANTS_V1 {
            return Err(Error::Bounds("input slots"));
        }
        for input in inputs {
            if input.len() > MAX_PAYLOAD {
                return Err(Error::Bounds("input payload"));
            }
            total = add(total, input.len())?;
            if total > MAX_INPUT_BYTES {
                return Err(Error::Bounds("aggregate inputs"));
            }
        }
    }
    Ok(())
}
fn transcript_bounds(transcript: &GameTranscriptV1) -> Result<(), Error> {
    if transcript.batches.len() > MAX_BATCHES
        || transcript.dnf_events.len() > GAME_MAX_PARTICIPANTS_V1
    {
        return Err(Error::Bounds("transcript cardinality"));
    }
    if transcript
        .dnf_events
        .iter()
        .any(|event| event.slots.len() > GAME_MAX_PARTICIPANTS_V1)
    {
        return Err(Error::Bounds("event slots"));
    }
    payload_rows(
        transcript
            .batches
            .iter()
            .map(|batch| batch.inputs.as_slice()),
    )
}
fn preflight(session: &GameSessionRecordV1) -> Result<(), Error> {
    let m = &session.manifest;
    if session.participants.len() > GAME_MAX_PARTICIPANTS_V1
        || session.item_stakes.len() > GAME_MAX_PARTICIPANTS_V1
        || session.resources.len() > GAME_MAX_RESOURCE_RECORDS_V1
        || session.payout_claims.len() > GAME_MAX_PARTICIPANTS_V1
        || session.forced_batches.len() > MAX_BATCHES
        || session.checkpoint_history.len() > MAX_BATCHES
        || session.certified_batches.len() > MAX_BATCHES
        || add(
            session.certified_batches.len(),
            session.forced_batches.len(),
        )? > MAX_BATCHES
        || session.input_commitments.len() > GAME_MAX_PARTICIPANTS_V1
        || session.input_reveals.len() > GAME_MAX_PARTICIPANTS_V1
        || m.application_parameters.len() > 65536
    {
        return Err(Error::Bounds("record cardinality"));
    }
    for p in &session.participants {
        if p.application_data.len() > MAX_PAYLOAD {
            return Err(Error::Bounds("participant data"));
        }
        account_bound(&p.account)?;
        key_bound(&p.input_key)?;
    }
    account_bound(&session.custody)?;
    bounded_encode(&session.asset_definition, 32768)?;
    if let GameAccessV1::Invite(key) = &m.access {
        key_bound(key)?;
    }
    for item in &session.item_stakes {
        bounded_encode(&item.nft_id, GAME_ADMISSION_MAX_NFT_ENCODED_BYTES_V1)?;
        account_bound(&item.custody)?;
        if let Some(recipient) = &item.recipient {
            account_bound(recipient)?;
        }
    }
    for resource in &session.resources {
        bounded_encode(&resource.nft_id, GAME_ADMISSION_MAX_NFT_ENCODED_BYTES_V1)?;
        account_bound(&resource.original_owner)?;
        account_bound(&resource.custody)?;
    }
    if let Some(signed) = &session.checkpoint {
        signature_bounds(&signed.signatures)?;
    }
    if let Some(pending) = &session.pending_certificate {
        if pending.commitments.len() > GAME_MAX_PARTICIPANTS_V1 {
            return Err(Error::Bounds("pending commitments"));
        }
        signature_bounds(&pending.signatures)?;
    }
    for batch in &session.forced_batches {
        if batch.dnf_slots.len() > GAME_MAX_PARTICIPANTS_V1 {
            return Err(Error::Bounds("forced removal slots"));
        }
    }
    payload_rows(
        session
            .forced_batches
            .iter()
            .map(|batch| batch.inputs.as_slice())
            .chain(
                session
                    .certified_batches
                    .iter()
                    .map(|batch| batch.inputs.as_slice()),
            ),
    )?;
    if session
        .input_reveals
        .iter()
        .flatten()
        .any(|v| v.len() > MAX_PAYLOAD)
    {
        return Err(Error::Bounds("current reveal"));
    }
    if let Some(outcome) = &session.result {
        if outcome.winner_slots.len() > GAME_MAX_PARTICIPANTS_V1
            || outcome.result.len() > MAX_OUTCOME_BYTES
        {
            return Err(Error::Bounds("outcome"));
        }
    }
    if norito::canonical_frame_len(session)
        .map_err(|error| encoding_error(error, "canonical record encoding"))?
        > MAX_RECORD_BYTES
    {
        return Err(Error::Bounds("full record"));
    }
    Ok(())
}
pub(crate) fn evidence_bounds(evidence: &Evidence) -> Result<(), Error> {
    transcript_bounds(&evidence.transcript)?;
    if evidence.current_reveals.len() > GAME_MAX_PARTICIPANTS_V1
        || evidence.current_commitments.len() > GAME_MAX_PARTICIPANTS_V1
    {
        return Err(Error::Bounds("frontier sidecars"));
    }
    if evidence
        .current_reveals
        .iter()
        .any(|r| r.payload.len() > MAX_PAYLOAD)
    {
        return Err(Error::Bounds("reveal sidecar"));
    }
    if evidence
        .current_commitments
        .iter()
        .any(|c| c.signature.payload().len() != 64)
    {
        return Err(Error::Signature("commitment sidecar length"));
    }
    Ok(())
}

/// Complete bounded canonical native record, including revision, phase, pending
/// evidence, economics and resources. No carrier hash or observation height enters
/// this identity, so proof preparation never depends on its future containing block.
/// This computes a commitment, not proof validity, ledger inclusion or currentness.
pub(crate) fn canonical_record_bytes(session: &GameSessionRecordV1) -> Result<Vec<u8>, Error> {
    preflight(session)?;
    bounded_encode(session, MAX_RECORD_BYTES)
}
/// Native ledger projection of the complete record; not a wide execution binding.
pub(crate) fn record_root(session: &GameSessionRecordV1) -> Result<Hash, Error> {
    let bytes = canonical_record_bytes(session)?;
    Ok(Hash::new_from_chunks(&[
        DOMAIN,
        b"complete-record\0",
        &(bytes.len() as u64).to_be_bytes(),
        &bytes,
    ]))
}
/// Bind complete public replay plus every exact current commitment/reveal sidecar.
pub(crate) fn evidence_root(
    session: &GameSessionRecordV1,
    policy: &Policy,
    terminal: u32,
    evidence: &Evidence,
) -> Result<Hash, Error> {
    evidence_bounds(evidence)?;
    let transcript = bounded_encode(&evidence.transcript, MAX_EVIDENCE_BYTES)?;
    let reveals = bounded_encode(&evidence.current_reveals, 1 << 20)?;
    let commitments = bounded_encode(&evidence.current_commitments, 1 << 20)?;
    if add(add(transcript.len(), reveals.len())?, commitments.len())? > MAX_EVIDENCE_BYTES {
        return Err(Error::Bounds("complete evidence"));
    }
    Ok(Hash::new_from_chunks(&[
        DOMAIN,
        b"evidence\0",
        session.network_id.as_bytes(),
        session.session_id.as_ref(),
        policy.application_id.as_ref(),
        policy.profile_id.as_ref(),
        policy.compiled_relation.as_ref(),
        policy.genesis_state_root.commitment().as_bytes(),
        &terminal.to_be_bytes(),
        &(transcript.len() as u64).to_be_bytes(),
        &transcript,
        &(reveals.len() as u64).to_be_bytes(),
        &reveals,
        &(commitments.len() as u64).to_be_bytes(),
        &commitments,
    ]))
}
/// Exact scoped native dispute projection; complete record binding separately includes pending inputs.
pub(crate) fn native_dispute_commitment(
    session: &GameSessionRecordV1,
) -> Result<GameDisputeCommitmentV1, Error> {
    preflight(session)?;
    GameDisputeCommitmentBodyV1::from_ledger(&session.network_id, session)
        .and_then(|body| {
            body.commitment(&game_binding::context(
                &session.network_id,
                session.session_id,
            ))
        })
        .map_err(or_verdict(Error::Identity("native dispute commitment")))
}
fn verify_joint(
    session: &GameSessionRecordV1,
    signatures: &[GameSlotSignatureV1],
    body: &GameCertificateMessageV1,
) -> Result<(), Error> {
    if signatures.len() != session.participants.len() || signatures.is_empty() {
        return Err(Error::Signature("all original slots required"));
    }
    for (slot, (signature, participant)) in signatures.iter().zip(&session.participants).enumerate()
    {
        if usize::from(signature.slot) != slot {
            return Err(Error::Signature("ordered original Ed25519 slots"));
        }
        body.verify(&participant.input_key, &signature.signature)
            .map_err(or_verdict(Error::Signature(
                "direct canonical certificate verification",
            )))?;
    }
    Ok(())
}

fn sorted_slots(slots: &[u8], players: usize) -> bool {
    slots.iter().all(|&s| usize::from(s) < players) && slots.windows(2).all(|w| w[0] < w[1])
}
fn rows_valid(
    session: &GameSessionRecordV1,
    start: u32,
    inputs: &[Vec<u8>],
    validate_input: &impl Fn(&[u8]) -> Result<(), Error>,
) -> Result<(), Error> {
    if inputs.len() != session.participants.len() {
        return Err(Error::Shape("exact batch roster"));
    }
    for (slot, input) in inputs.iter().enumerate() {
        if input.len() > usize::from(session.manifest.max_input_bytes) {
            return Err(Error::Bounds("manifest payload"));
        }
        if session.participants[slot]
            .dnf_at_tick
            .is_some_and(|tick| tick <= start)
        {
            if !input.is_empty() {
                return Err(Error::Input("removed input must be empty"));
            }
        } else {
            validate_input(input)?;
        }
    }
    Ok(())
}
fn pool(session: &GameSessionRecordV1) -> Result<Quantity, Error> {
    let mut total = Quantity::zero();
    for _ in &session.participants {
        total = total
            .checked_add(&session.stake)
            .map_err(|_| Error::Shape("stake pool overflow"))?;
    }
    Ok(total)
}
fn award_amounts(
    session: &GameSessionRecordV1,
    winners: &[u8],
) -> Result<Vec<(u8, Quantity)>, Error> {
    let pool = pool(session)?;
    if pool.is_zero() {
        return Ok(Vec::new());
    }
    if winners.is_empty() {
        return Ok((0..session.participants.len())
            .map(|s| (s as u8, session.stake.clone()))
            .collect());
    }
    if winners.len() == 1 {
        return Ok(vec![(winners[0], pool)]);
    }
    let share = pool
        .try_mul_div_decimal_round(
            &Numeric::one(),
            &Numeric::from(winners.len() as u64),
            session.payout_scale,
            RoundingMode::Floor,
        )
        .map_err(|_| Error::Shape("award division"))?;
    let quantum = Quantity::try_from_numeric(
        Numeric::try_new(1_u32, session.payout_scale).map_err(|_| Error::Shape("award quantum"))?,
    )
    .map_err(|_| Error::Shape("award quantum"))?;
    let mut amounts = vec![share; winners.len()];
    let mut remaining = pool;
    for amount in &amounts {
        remaining = remaining
            .checked_sub(amount)
            .map_err(|_| Error::Shape("award subtraction"))?;
    }
    for amount in &mut amounts {
        if remaining.is_zero() {
            break;
        }
        remaining = remaining
            .checked_sub(&quantum)
            .map_err(|_| Error::Shape("award precision"))?;
        *amount = amount
            .checked_add(&quantum)
            .map_err(|_| Error::Shape("award addition"))?;
    }
    if !remaining.is_zero() {
        return Err(Error::Shape("award remainder"));
    }
    Ok(winners
        .iter()
        .copied()
        .zip(amounts)
        .filter(|(_, amount)| !amount.is_zero())
        .collect())
}
/// Check the native non-signable account identities before accepting a record.
/// These pure checks establish neither an account's ledger existence nor its
/// balance, NFT ownership, reservation indexes or finalized inclusion.
fn custody_identities(session: &GameSessionRecordV1) -> Result<(), Error> {
    let stake_custody = AccountId::new(derive_non_signing_ed25519_public_key(
        b"iroha:game:custody:v1",
        &[
            session.network_id.as_bytes(),
            session.session_id.as_ref(),
            session.asset_definition.to_string().as_bytes(),
        ],
    ));
    if session.custody != stake_custody {
        return Err(Error::Identity("session custody"));
    }
    let nft_custody = |purpose: NftCustodyPurposeV1, nft_id: &NftId| {
        AccountId::new(derive_non_signing_ed25519_public_key(
            b"iroha:nft:custody:v1",
            &[
                session.network_id.as_bytes(),
                session.session_id.as_ref(),
                &purpose.encode(),
                &nft_id.encode(),
            ],
        ))
    };
    for item in &session.item_stakes {
        if item.custody != nft_custody(NftCustodyPurposeV1::GameWager, &item.nft_id) {
            return Err(Error::Identity("item custody"));
        }
    }
    for resource in &session.resources {
        if resource.custody != nft_custody(NftCustodyPurposeV1::GameResource, &resource.nft_id) {
            return Err(Error::Identity("resource custody"));
        }
    }
    // Admission already requires distinct participant accounts. Include every
    // original participant, even after a forfeit or archived settlement, and
    // reject aliases across custody purposes as well as aliases with wallets.
    let mut accounts: BTreeSet<&AccountId> = session
        .participants
        .iter()
        .map(|participant| &participant.account)
        .collect();
    for custody in std::iter::once(&session.custody)
        .chain(session.item_stakes.iter().map(|item| &item.custody))
        .chain(session.resources.iter().map(|resource| &resource.custody))
    {
        if !accounts.insert(custody) {
            return Err(Error::Identity("custody account alias"));
        }
    }
    Ok(())
}

pub(crate) fn metadata(
    session: &GameSessionRecordV1,
    context: &ObservationContext,
    terminal: u32,
) -> Result<Mode, Error> {
    let settled = session.phase == GamePhaseV1::Settled;
    if context.height == 0 || session.revision == 0 || session.deadline_height == 0 {
        return Err(Error::Shape("started snapshot metadata"));
    }
    if session.payout_scale > MAX_DECIMAL_SCALE
        || session.stake.scale() > session.payout_scale
        || (session.stake.is_zero() && session.payout_scale != 0)
        || (session.manifest.payout_policy == GamePayoutPolicyV1::NoPayout
            && !session.stake.is_zero())
    {
        return Err(Error::Shape("frozen stake precision"));
    }
    if !settled {
        if session.result.is_some()
            || session.terminal_at_height.is_some()
            || !session.payout_claims.is_empty()
            || session
                .item_stakes
                .iter()
                .any(|i| i.claimed || i.recipient.is_some())
            || session
                .resources
                .iter()
                .any(|r| r.released_at_height.is_some())
        {
            return Err(Error::Phase("nonterminal outcome metadata"));
        }
        if session.liability != pool(session)? {
            return Err(Error::Shape("retained stake liability"));
        }
    } else {
        let height = session
            .terminal_at_height
            .ok_or(Error::Phase("settled terminal height"))?;
        let result = session
            .result
            .as_ref()
            .ok_or(Error::Phase("settled outcome"))?;
        if session.verification_id.is_none()
            || height == 0
            || height > context.height
            || result.terminal_tick != terminal
            || !sorted_slots(&result.winner_slots, session.participants.len())
            || result.winner_slots.iter().any(|&slot| {
                session.participants[usize::from(slot)]
                    .dnf_at_tick
                    .is_some()
            })
        {
            return Err(Error::Phase("settled outcome metadata"));
        }
        let expected = award_amounts(session, &result.winner_slots)?;
        if expected.len() != session.payout_claims.len() {
            return Err(Error::Shape("award claim cardinality"));
        }
        let mut unpaid = Quantity::zero();
        for (claim, (slot, amount)) in session.payout_claims.iter().zip(expected) {
            if claim.slot != slot || claim.amount != amount || claim.remaining > claim.amount {
                return Err(Error::Shape("retained award claim"));
            }
            unpaid = unpaid
                .checked_add(&claim.remaining)
                .map_err(|_| Error::Shape("unpaid claim sum"))?;
        }
        if unpaid != session.liability {
            return Err(Error::Shape("unpaid liability"));
        }
        for item in &session.item_stakes {
            let recipient = if result.winner_slots.len() == 1 {
                &session.participants[usize::from(result.winner_slots[0])].account
            } else {
                &session.participants[usize::from(item.slot)].account
            };
            if !item.claimed || item.recipient.as_ref() != Some(recipient) {
                return Err(Error::Shape("settled item recipient"));
            }
        }
        if session
            .resources
            .iter()
            .any(|r| r.released_at_height != Some(height))
        {
            return Err(Error::Shape("atomic resource release metadata"));
        }
    }
    let owners: Vec<_> = session
        .participants
        .iter()
        .map(|p| p.account.clone())
        .collect();
    let set = GameResourceReservationSetV1 {
        version: 1,
        network_id: session.network_id.clone(),
        session_id: session.session_id,
        records: session.resources.clone(),
    };
    set.validate_for_owners(&owners)
        .map_err(|_| Error::Shape("retained resource records"))?;
    if set.records.iter().any(|r| {
        r.reserved_at_height > context.height
            || r.released_at_height.is_some_and(|h| h > context.height)
    }) {
        return Err(Error::Shape("resource snapshot heights"));
    }
    Ok(if settled {
        Mode::ArchivedSettled
    } else {
        Mode::Selection
    })
}

pub(crate) struct ValidatedHistory<'a> {
    session: &'a GameSessionRecordV1,
    evidence: &'a Evidence,
    policy: Policy,
    certificates: GameSessionCertificateContextV1,
    context: ObservationContext,
    terminal: u32,
    snapshot: Hash,
    evidence_id: Hash,
    binding: Hash,
    mode: Mode,
    record_binding: iroha_data_model::execution_proofs::ExecutionRecordBindingV1,
    evidence_binding: GoldilocksDigest384V1,
    accepted_transcript_root: GameTranscriptRootV1,
}
impl ValidatedHistory<'_> {
    pub(crate) fn snapshot_root(&self) -> Hash {
        self.snapshot
    }
    pub(crate) fn evidence_root(&self) -> Hash {
        self.evidence_id
    }
    pub(crate) fn binding_root(&self) -> Hash {
        self.binding
    }
    pub(crate) fn checkpoint(&self) -> &GameCheckpointV1 {
        &self
            .session
            .checkpoint
            .as_ref()
            .expect("validated checkpoint")
            .checkpoint
    }
    pub(crate) fn selected_checkpoint(&self) -> &GameCheckpointV1 {
        self.checkpoint()
    }
    /// All retained state assertions, in increasing tick order, including the
    /// selected checkpoint. Adapters must constrain every pre-removal state;
    /// generic history validation authenticates no application state computation.
    pub(crate) fn state_checkpoints(&self) -> impl Iterator<Item = GameCheckpointAnchorV1> + '_ {
        let selected = self.checkpoint();
        self.session
            .checkpoint_history
            .iter()
            .cloned()
            .chain(std::iter::once(GameCheckpointAnchorV1 {
                epoch: selected.epoch,
                tick: selected.tick,
                transcript_root: selected.transcript_root,
                state_root: selected.state_root,
            }))
    }
    /// Certificate context checked against this exact borrowed record during validation.
    /// Reusing it authenticates no ledger authority beyond the history's existing claim.
    pub(crate) fn certificates(&self) -> &GameSessionCertificateContextV1 {
        &self.certificates
    }
    pub(crate) fn evidence(&self) -> &Evidence {
        self.evidence
    }
    /// Accepted root derived from the exact complete validated source, including final-boundary removals.
    pub(crate) fn accepted_transcript_root(&self) -> GameTranscriptRootV1 {
        self.accepted_transcript_root
    }
    pub(crate) fn transcript(&self) -> &GameTranscriptV1 {
        &self.evidence.transcript
    }
    pub(crate) fn terminal(&self) -> u32 {
        self.terminal
    }
    pub(crate) fn session(&self) -> &GameSessionRecordV1 {
        self.session
    }
    pub(crate) fn roster(&self) -> usize {
        self.session.participants.len()
    }
    pub(crate) fn batch_ticks(&self) -> u16 {
        self.session.manifest.batch_ticks
    }
    pub(crate) fn mode(&self) -> Mode {
        self.mode
    }
    pub(crate) fn policy(&self) -> &Policy {
        &self.policy
    }
    pub(crate) fn observation_context(&self) -> ObservationContext {
        self.context
    }
    pub(crate) fn require_snapshot(&self, expected: Hash) -> Result<(), Error> {
        if expected == self.snapshot {
            Ok(())
        } else {
            Err(Error::SnapshotPin)
        }
    }
    pub(crate) fn context_bytes(&self) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(264);
        bytes.extend_from_slice(b"IWARCTX1");
        for id in [
            self.policy.application_id,
            self.policy.profile_id,
            self.policy.compiled_relation,
        ] {
            bytes.extend_from_slice(id.as_ref());
        }
        bytes.extend_from_slice(self.policy.genesis_state_root.commitment().as_bytes());
        bytes.extend_from_slice(&self.record_binding.bytes);
        bytes.extend_from_slice(&self.evidence_binding.to_le_bytes());
        bytes.extend_from_slice(&self.terminal.to_be_bytes());
        bytes.extend_from_slice(&self.batch_ticks().to_be_bytes());
        bytes.push(u8::from(self.mode == Mode::ArchivedSettled));
        bytes
    }
    /// Return one complete accepted batch payload. The application interprets
    /// offset tick % batch_ticks; no pending or merely revealed data is exposed.
    pub(crate) fn accepted_payload(&self, tick: u32, slot: usize) -> Result<Option<&[u8]>, Error> {
        if tick >= self.terminal || slot >= self.roster() {
            return Err(Error::Access("control outside selected prefix"));
        }
        let batch =
            &self.evidence.transcript.batches[(tick / u32::from(self.batch_ticks())) as usize];
        if self.session.participants[slot]
            .dnf_at_tick
            .is_some_and(|at| at <= tick)
        {
            Ok(None)
        } else {
            Ok(Some(&batch.inputs[slot]))
        }
    }
    /// Exact supplied consensus-marker slots at a selected boundary. This does
    /// not establish that consensus authorized those marker values.
    pub(crate) fn removals_at(&self, tick: u32) -> Result<&[u8], Error> {
        if tick > self.terminal {
            return Err(Error::Access("removal after selected terminal"));
        }
        Ok(self
            .evidence
            .transcript
            .dnf_events
            .binary_search_by_key(&tick, |event| event.tick)
            .ok()
            .map(|i| self.evidence.transcript.dnf_events[i].slots.as_slice())
            .unwrap_or(&[]))
    }
    pub(crate) fn ledger_authority_verified(&self) -> bool {
        false
    }
    pub(crate) fn deadline_expiry_proved(&self) -> bool {
        false
    }
}

/// A complete-source semantic contract compiled into the selected application.
/// It authenticates no supplied digest and runs once before generic root preparation.
pub(crate) type ValidateSource = fn(
    &GameSessionRecordV1,
    &Policy,
    &GameSessionCertificateContextV1,
    &GameTranscriptV1,
) -> Result<(), Error>;

/// Validate one complete retained snapshot. The input callback must validate the whole
/// immutable application batch payload, including any unused intrabatch suffix.
/// Application manifest/participant semantics and ledger inclusion remain caller
/// obligations; native admission geometry and exact manifest/roster identities
/// are checked here without normalizing or dropping any source occurrence.
pub(crate) fn validate<'a>(
    session: &'a GameSessionRecordV1,
    context: &ObservationContext,
    policy: &Policy,
    terminal: u32,
    evidence: &'a Evidence,
    validate_input: impl Fn(&[u8]) -> Result<(), Error>,
    validate_source: ValidateSource,
) -> Result<ValidatedHistory<'a>, Error> {
    preflight(session)?;
    evidence_bounds(evidence)?;
    let m = &session.manifest;
    let players = session.participants.len();
    let batch = u32::from(m.batch_ticks);
    if session.version != 1
        || m.version != 1
        || batch == 0
        || batch > 256
        || m.max_ticks == 0
        || m.max_ticks > MAX_TICKS
        || m.max_ticks % batch != 0
        || m.max_ticks / batch > MAX_BATCHES as u32
        || m.max_input_bytes == 0
        || usize::from(m.max_input_bytes) > MAX_PAYLOAD
        || usize::from(m.max_participant_data_bytes) > MAX_PAYLOAD
        || m.min_participants == 0
        || m.min_participants > m.max_participants
        || usize::from(m.max_participants) > GAME_MAX_PARTICIPANTS_V1
        || players < usize::from(m.min_participants)
        || players > usize::from(m.max_participants)
        || u64::from(m.max_ticks / batch)
            * u64::from(m.max_participants)
            * u64::from(m.max_input_bytes)
            > MAX_INPUT_BYTES as u64
        || terminal > m.max_ticks
        || session.next_tick > m.max_ticks
        || terminal > session.next_tick
        || session.input_commitments.len() != players
        || session.input_reveals.len() != players
        || add(
            session.certified_batches.len(),
            session.forced_batches.len(),
        )? > (m.max_ticks / batch) as usize
        || session.checkpoint_history.len() >= (m.max_ticks / batch) as usize
        || session.epoch != session.forced_batches.len() as u64
        || evidence.transcript.batches.len() != session.next_tick.div_ceil(batch) as usize
    {
        return Err(Error::Shape("complete bounded started geometry"));
    }
    // Admission reserves the worst allowed history before stakes. Verification
    // repeats that check before constructing the context or hashing prefixes.
    game_history_budget_v1(m).map_err(|_| Error::Bounds("admitted history work budget"))?;
    if matches!(session.phase, GamePhaseV1::Lobby | GamePhaseV1::Cancelled) {
        return Err(Error::Phase("not a started computation history"));
    }
    if m.application_id != policy.application_id
        || m.profile_id != policy.profile_id
        || session.profile_id != policy.profile_id
    {
        return Err(Error::Identity("manifest/profile policy"));
    }
    if let GameAccessV1::Invite(key) = &m.access {
        if key
            .try_algorithm()
            .map_err(|_| Error::Shape("invite key algorithm"))?
            != Algorithm::Ed25519
        {
            return Err(Error::Shape("invite key algorithm"));
        }
    }
    if session
        .participants
        .iter()
        .any(|p| p.application_data.len() > usize::from(m.max_participant_data_bytes))
    {
        return Err(Error::Bounds("manifest participant data"));
    }
    let admission = GameAdmissionBodyV1::from_session(session);
    admission
        .validate()
        .map_err(or_verdict(Error::Shape("native immutable admission")))?;
    let certificates = game_binding::retained(session).map_err(or_verdict(Error::Identity(
        "exact frozen manifest/admission/dispute",
    )))?;
    drop(admission);
    custody_identities(session)?;
    let mode = metadata(session, context, terminal)?;
    let signed = session
        .checkpoint
        .as_ref()
        .ok_or(Error::Shape("started checkpoint"))?;
    let cp = &signed.checkpoint;
    if cp.scope != certificates.scope()
        || cp.session_id != session.session_id
        || cp.epoch > session.epoch
        || cp.tick > terminal
        || (!cp.terminal && cp.tick % batch != 0)
        || (!cp.terminal && cp.tick == m.max_ticks)
        || (cp.terminal && cp.tick != terminal)
    {
        return Err(Error::Shape("selected checkpoint geometry"));
    }
    if cp.tick == 0 {
        if cp.epoch != 0 || cp.terminal || cp.state_root != policy.genesis_state_root {
            return Err(Error::Identity("exact raw genesis checkpoint"));
        }
        if !signed.signatures.is_empty() {
            verify_joint(
                session,
                &signed.signatures,
                &certificates
                    .checkpoint_message(cp)
                    .map_err(or_verdict(Error::Signature("checkpoint scope")))?,
            )?;
        }
    } else {
        verify_joint(
            session,
            &signed.signatures,
            &certificates
                .checkpoint_message(cp)
                .map_err(or_verdict(Error::Signature("checkpoint scope")))?,
        )?;
    }
    let mut removals = BTreeMap::<u32, Vec<u8>>::new();
    for (slot, participant) in session.participants.iter().enumerate() {
        if let Some(tick) = participant.dnf_at_tick {
            if tick >= m.max_ticks || tick % batch != 0 {
                return Err(Error::Shape("aligned removal below cap"));
            }
            removals.entry(tick).or_default().push(slot as u8);
        }
    }
    if evidence.transcript.dnf_events.len() != removals.len()
        || evidence
            .transcript
            .dnf_events
            .iter()
            .zip(&removals)
            .any(|(event, (&tick, slots))| event.tick != tick || event.slots != *slots)
    {
        return Err(Error::Shape("complete exact removal map"));
    }
    let active_before = |tick| {
        session
            .participants
            .iter()
            .filter(|p| p.dnf_at_tick.is_none_or(|at| at >= tick))
            .count()
    };
    for (index, row) in evidence.transcript.batches.iter().enumerate() {
        if row.start_tick != index as u32 * batch
            || active_before(row.start_tick) < usize::from(m.min_participants)
        {
            return Err(Error::Shape("ordered input interval and prior quorum"));
        }
        rows_valid(session, row.start_tick, &row.inputs, &validate_input)?;
    }
    validate_source(session, policy, &certificates, &evidence.transcript)?;
    let prepared = game_binding::prepare_transcript(
        certificates.context(),
        certificates.scope(),
        game_binding::transcript_geometry(m, players as u8),
        session.next_tick,
        &evidence.transcript,
    )
    .map_err(or_verdict(Error::Identity("complete bounded linear transcript")))?;
    let prefix = |tick| {
        prepared
            .checkpoint_root(tick)
            .map_err(or_verdict(Error::Identity("allowed pre-removal checkpoint cut")))
    };
    if cp.transcript_root != prefix(cp.tick)? {
        return Err(Error::Identity("checkpoint full input prefix"));
    }
    let mut previous_end = 0;
    let mut tail = cp.tick;
    let mut observed_removals = 0;
    for (epoch, forced) in session.forced_batches.iter().enumerate() {
        let end = forced
            .start_tick
            .checked_add(batch)
            .ok_or(Error::Bounds("forced end"))?;
        if forced.epoch != epoch as u64
            || forced.start_tick % batch != 0
            || forced.start_tick < previous_end
            || forced.start_tick >= m.max_ticks
            || end > m.max_ticks
            || active_before(forced.start_tick) < usize::from(m.min_participants)
            || (cp.terminal && forced.epoch >= cp.epoch)
            || (forced.epoch < cp.epoch && end > cp.tick)
            || (forced.epoch >= cp.epoch && forced.start_tick < cp.tick)
            || !sorted_slots(&forced.dnf_slots, players)
            || forced.dnf_slots.as_slice()
                != removals
                    .get(&forced.start_tick)
                    .map(Vec::as_slice)
                    .unwrap_or(&[])
        {
            return Err(Error::Shape("forced chronology/epoch/removal bijection"));
        }
        if !forced.dnf_slots.is_empty() {
            observed_removals += 1;
        }
        rows_valid(session, forced.start_tick, &forced.inputs, &validate_input)?;
        if evidence
            .transcript
            .batches
            .get((forced.start_tick / batch) as usize)
            .map(|b| &b.inputs)
            != Some(&forced.inputs)
        {
            return Err(Error::Identity(
                "every forced batch including retained suffix",
            ));
        }
        if forced.epoch >= cp.epoch {
            if forced.start_tick != tail {
                return Err(Error::Shape("gap after selected checkpoint"));
            }
            tail = end;
        }
        previous_end = end;
    }
    if observed_removals != removals.len() || tail != session.next_tick {
        return Err(Error::Shape("complete forced tail or orphan removal"));
    }
    // Every superseded cooperative checkpoint survives, independently of
    // whether a forced round removed a player. The current checkpoint remains
    // separately signed; no duplicate shrink-only archive is needed.
    let anchors = &session.checkpoint_history;
    if anchors.windows(2).any(|pair| pair[0].tick >= pair[1].tick) {
        return Err(Error::Shape("ordered immutable checkpoint history"));
    }
    let epoch_at = |tick: u32| {
        session.forced_batches.partition_point(|forced| {
            // Every forced end was checked for overflow and ordering above.
            forced.start_tick + batch <= tick
        }) as u64
    };
    if cp.epoch != epoch_at(cp.tick) {
        return Err(Error::Shape("selected checkpoint forced epoch"));
    }
    for anchor in anchors {
        if anchor.tick == 0
            || anchor.tick >= cp.tick
            || anchor.tick % batch != 0
            || anchor.epoch != epoch_at(anchor.tick)
            || anchor.transcript_root != prefix(anchor.tick)?
        {
            return Err(Error::Identity("immutable checkpoint prefix and epoch"));
        }
    }
    if session
        .certified_batches
        .windows(2)
        .any(|pair| pair[0].start_tick >= pair[1].start_tick)
    {
        return Err(Error::Shape("ordered certified input archive"));
    }
    for accepted in &session.certified_batches {
        let end = accepted
            .start_tick
            .checked_add(batch)
            .ok_or(Error::Bounds("certified end"))?;
        if accepted.start_tick % batch != 0
            || end > cp.tick.div_ceil(batch) * batch
            || accepted.epoch != epoch_at(accepted.start_tick)
            || session
                .forced_batches
                .binary_search_by_key(&accepted.start_tick, |forced| forced.start_tick)
                .is_ok()
            || (accepted.start_tick != 0
                && anchors
                    .binary_search_by_key(&accepted.start_tick, |anchor| anchor.tick)
                    .is_err())
            || accepted.parent_transcript_root != prefix(accepted.start_tick)?
        {
            return Err(Error::Shape("certified input archive chronology"));
        }
        rows_valid(
            session,
            accepted.start_tick,
            &accepted.inputs,
            &validate_input,
        )?;
        if evidence
            .transcript
            .batches
            .get((accepted.start_tick / batch) as usize)
            .map(|batch| &batch.inputs)
            != Some(&accepted.inputs)
        {
            return Err(Error::Identity("immutable certified inputs"));
        }
        // Core checked every opening against the certificate before recording
        // these bytes. Its frontier identifier is bound by the complete record;
        // this supplied-record validator does not independently authenticate
        // the prior transaction, just as for consensus-owned forced batches.
    }
    for forced in &session.forced_batches {
        if forced.certified_frontier_id.is_some() {
            let checkpoint_epoch = if forced.start_tick == cp.tick {
                Some(cp.epoch)
            } else if forced.start_tick == 0 {
                Some(0)
            } else {
                anchors
                    .binary_search_by_key(&forced.start_tick, |anchor| anchor.tick)
                    .ok()
                    .map(|index| anchors[index].epoch)
            };
            if checkpoint_epoch != Some(forced.epoch) {
                return Err(Error::Shape("forced certified frontier checkpoint"));
            }
        }
    }
    if cp.terminal && (tail != cp.tick || session.epoch != cp.epoch) {
        return Err(Error::Shape(
            "no forced progress after terminal certificate",
        ));
    }
    if let Some(frontier) = &session.pending_certificate {
        if frontier.session_id != session.session_id
            || frontier.epoch != session.epoch
            || frontier.epoch != cp.epoch
            || frontier.start_tick != cp.tick
            || frontier.start_tick != session.next_tick
            || frontier.start_tick < terminal
            || frontier.start_tick >= m.max_ticks
            || frontier.parent_transcript_root != cp.transcript_root
            || cp.terminal
            || frontier.commitments.len() != players
        {
            return Err(Error::Shape("exact pending frontier"));
        }
        verify_joint(
            session,
            &frontier.signatures,
            &certificates
                .commitment_set_message(frontier)
                .map_err(or_verdict(Error::Signature("frontier scope")))?,
        )?;
    }
    let live: Vec<_> = session
        .participants
        .iter()
        .enumerate()
        .filter_map(|(s, p)| p.dnf_at_tick.is_none().then_some(s))
        .collect();
    let all_none_commit = session.input_commitments.iter().all(Option::is_none);
    let all_none_reveal = session.input_reveals.iter().all(Option::is_none);
    let all_live_commit = live.iter().all(|&s| session.input_commitments[s].is_some());
    let all_live_reveal = live.iter().all(|&s| session.input_reveals[s].is_some());
    let pending = session.pending_certificate.as_ref();
    let live_round = !cp.terminal
        && session.next_tick < m.max_ticks
        && live.len() >= usize::from(m.min_participants);
    let exact_pending_commitments = pending.is_some_and(|p| {
        session
            .input_commitments
            .iter()
            .zip(&p.commitments)
            .all(|(a, b)| a.as_ref() == Some(b))
    });
    let shape = |phase| match phase {
        GamePhaseV1::Playing => {
            live_round
                && cp.epoch == session.epoch
                && cp.tick == session.next_tick
                && all_none_commit
                && all_none_reveal
        }
        GamePhaseV1::SelectingCheckpoint => {
            cp.epoch == session.epoch
                && cp.tick == session.next_tick
                && live.len() >= usize::from(m.min_participants)
                && all_none_commit
                && all_none_reveal
        }
        GamePhaseV1::ForcedCommit => {
            live_round && pending.is_none() && all_none_reveal && !all_live_commit
        }
        GamePhaseV1::ForcedReveal => {
            live_round && !all_live_reveal && (pending.is_none() || exact_pending_commitments)
        }
        GamePhaseV1::AwaitingProof => {
            (cp.terminal
                || session.next_tick == m.max_ticks
                || live.len() < usize::from(m.min_participants))
                && pending.is_none()
                && all_none_commit
                && all_none_reveal
        }
        _ => false,
    };
    if mode == Mode::ArchivedSettled {
        if ![
            GamePhaseV1::AwaitingProof,
            GamePhaseV1::ForcedCommit,
            GamePhaseV1::ForcedReveal,
        ]
        .into_iter()
        .any(shape)
        {
            return Err(Error::Phase("retained legal settlement predecessor"));
        }
    } else if !shape(session.phase) {
        return Err(Error::Phase("native current phase/frontier"));
    }
    let copied_pending = exact_pending_commitments
        && (session.phase == GamePhaseV1::ForcedReveal || mode == Mode::ArchivedSettled);
    for (slot, participant) in session.participants.iter().enumerate() {
        if participant.dnf_at_tick.is_some()
            && (session.input_reveals[slot].is_some()
                || (!copied_pending && session.input_commitments[slot].is_some()))
        {
            return Err(Error::Phase("inactive frontier authority"));
        }
        if session.input_reveals[slot].is_some() && session.input_commitments[slot].is_none() {
            return Err(Error::Shape("reveal lacks retained commitment"));
        }
    }
    // Sidecars use canonical sorted, exact sets. A pending copied certificate
    // supplies ALL commitment authentication; redundant individual envelopes
    // are excluded. Reveals always require their exact nonce-bearing envelope.
    let needed_commitments: Vec<_> = if copied_pending {
        Vec::new()
    } else {
        session
            .input_commitments
            .iter()
            .enumerate()
            .filter_map(|(s, c)| c.is_some().then_some(s))
            .collect()
    };
    if evidence.current_commitments.len() != needed_commitments.len() {
        return Err(Error::Shape("exact commitment sidecar set"));
    }
    for (&slot, commitment) in needed_commitments.iter().zip(&evidence.current_commitments) {
        if usize::from(commitment.slot) != slot
            || commitment.session_id != session.session_id
            || commitment.epoch != session.epoch
            || commitment.start_tick != session.next_tick
            || Some(commitment.commitment) != session.input_commitments[slot]
            || commitment.signature.payload().len() != 64
        {
            return Err(Error::Shape("current signed commitment envelope"));
        }
        certificates
            .input_commitment_message(commitment)
            .and_then(|message| {
                message.verify(&session.participants[slot].input_key, &commitment.signature)
            })
            .map_err(or_verdict(Error::Signature(
                "individual canonical input commitment",
            )))?;
    }
    let needed_reveals: Vec<_> = session
        .input_reveals
        .iter()
        .enumerate()
        .filter_map(|(s, r)| r.is_some().then_some(s))
        .collect();
    if evidence.current_reveals.len() != needed_reveals.len() {
        return Err(Error::Shape("exact reveal sidecar set"));
    }
    for (&slot, reveal) in needed_reveals.iter().zip(&evidence.current_reveals) {
        if usize::from(reveal.slot) != slot
            || reveal.session_id != session.session_id
            || reveal.epoch != session.epoch
            || reveal.start_tick != session.next_tick
            || session.input_reveals[slot].as_deref() != Some(reveal.payload.as_slice())
            || reveal.payload.len() > usize::from(m.max_input_bytes)
            || session.input_commitments[slot]
                != Some(
                    certificates
                        .input_preimage(reveal)
                        .and_then(|body| body.commitment(certificates.context()))
                        .map_err(or_verdict(Error::Identity("exact nonce-bearing reveal")))?,
                )
        {
            return Err(Error::Identity("exact nonce-bearing current reveal"));
        }
        validate_input(&reveal.payload)?;
    }
    if session.dispute_commitment != native_dispute_commitment(session)? {
        return Err(Error::Identity("native retained dispute projection"));
    }
    let accepted_transcript_root = prepared.accepted_root();
    // Drop cached roots before allocating complete evidence frames or any proof trace.
    drop(prepared);
    let snapshot = record_root(session)?;
    let evidence_id = evidence_root(session, policy, terminal, evidence)?;
    let record_binding = super::super::record_binding::execution_record_binding_v1(session)
        .map_err(or_verdict(Error::Identity("complete wide record binding")))?;
    let transcript_bytes = bounded_encode(&evidence.transcript, MAX_EVIDENCE_BYTES)?;
    let reveal_bytes = bounded_encode(&evidence.current_reveals, 1 << 20)?;
    let commitment_bytes = bounded_encode(&evidence.current_commitments, 1 << 20)?;
    let evidence_binding = goldilocks_digest384_frame_v1(
        TransparentStarkDigestContextV1::execution_v1(b"accepted-game-history-v1"),
        b"complete-public-evidence",
        b"source",
        0,
        0,
        0,
        &[
            &record_binding.bytes,
            &terminal.to_le_bytes(),
            &transcript_bytes,
            &reveal_bytes,
            &commitment_bytes,
        ],
    )
    .map_err(or_verdict(Error::Identity("wide complete evidence binding")))?;
    let mut receipt = ValidatedHistory {
        session,
        evidence,
        policy: *policy,
        certificates,
        context: *context,
        terminal,
        snapshot,
        evidence_id,
        binding: snapshot,
        mode,
        record_binding,
        evidence_binding,
        accepted_transcript_root,
    };
    receipt.binding =
        Hash::new_from_chunks(&[DOMAIN, b"validated-context\0", &receipt.context_bytes()]);
    Ok(receipt)
}

// Borrowed record/evidence pointers; policy(three hashes and root), trusted
// session certificate context(network/session/scope/epoch/slots), chronology,
// terminal/mode, three lookup hashes and three48-byte semantic commitments.
impl crate::execution_proofs::arithmetic::logical_payload::LogicalSize for ValidatedHistory<'_> {
    const BYTES: usize =
        2 * 8 + (3 * 32 + 48) + (2 * 32 + 2 * 48 + 2 * 8) + 3 * 8 + 3 * 32 + 3 * 48;
}
