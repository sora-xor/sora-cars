//! Native execution proof driver; privacy proofs use their separate implementation.
//! Transparent execution STARK driver with relation-owned columns and constraints.
//!
//! The driver owns masking, fixed preprocessing, composition, commitments, DEEP,
//! FRI and canonical proof transport. Auxiliary oracles exist only when the closed
//! relation declares nonzero auxiliary width. There is no inherited byte-copy chip.
//! Adapters own every carry, boundary, range and cross-stage relation obligation.
//!
//! Internal Rust names retain their original spelling in this scoped refactor;
//! transcript domains and the sole execution geometry are explicitly distinct
//! from privacy. There is no compatibility decoder or ledger activation path.
#[cfg(test)]
use super::transparent_stark::masked_trace_lde_column_with_mask_v1;
use super::{
    aggregate_stark::{self as aggregate, AggregateOpenedRowEvaluatorV1},
    transparent_stark::{
        GOLDILOCKS_GENERATOR_V1, GoldilocksDigest384V1, GoldilocksFieldV1 as F,
        GoldilocksFp4V1 as E, GoldilocksMerkleTreeV1, ReplayableTraceMaskV1,
        TransparentStarkErrorV1, TransparentTranscriptV1, goldilocks_digest384_frame_v1,
        goldilocks_fft_v1, goldilocks_ifft_v1, goldilocks_primitive_root_v1, grind_nonce_v1,
        masked_trace_coefficients_with_mask_v1, sample_trace_mask_v1,
        transparent_stark_zk_mask_geometry_v1, verify_grinding_nonce_v1,
    },
};

use rand::TryRngCore;
use rayon::prelude::*;
use thiserror::Error;
#[path = "proof_managed_note_stark_deep_air.rs"]
mod deep_air;
#[path = "proof_managed_note_stark_execution_fixed.rs"]
mod execution_fixed;
const NOTE_CONSTRAINT_ALPHA_LABEL_V1: &[u8] = b"iroha:execution:stark:constraint-alpha-v1";
const NOTE_DEEP_BASE_CURRENT_MIX_LABEL_V1: &[u8] =
    b"iroha:execution:stark:deep-base-current-mix-v1";
const NOTE_DEEP_BASE_NEXT_MIX_LABEL_V1: &[u8] = b"iroha:execution:stark:deep-base-next-mix-v1";
const NOTE_DEEP_AUX_CURRENT_MIX_LABEL_V1: &[u8] = b"iroha:execution:stark:deep-aux-current-mix-v1";
const NOTE_DEEP_AUX_NEXT_MIX_LABEL_V1: &[u8] = b"iroha:execution:stark:deep-aux-next-mix-v1";
const NOTE_DEEP_COMPOSITION_MIX_LABEL_V1: &[u8] = b"iroha:execution:stark:deep-composition-mix-v1";
const NOTE_GRINDING_LABEL_V1: &[u8] = b"iroha:execution:stark:grinding-nonce-v1";
const NOTE_SHARED_PROFILE_BINDING_LABEL_V1: &[u8] =
    b"iroha:execution:stark:shared-profile-binding-v1";
const NOTE_COMBINED_PROFILE_DIGEST_DOMAIN_V1: &[u8] = b"iroha.execution.stark.combined-profile.v1";
/// Sole first-release proof-system identity for execution computations.
pub(crate) const PROOF_MANAGED_NOTE_STARK_SUITE_V1: &[u8] = b"StarkFriPoseidonX7Goldilocks6x64";
/// Independent composition and FRI lanes in the first-release profile.
pub(crate) const PROOF_MANAGED_NOTE_SECURITY_LANES_V1: usize = 1;
/// Unique shared extension-domain queries in the first-release profile.
pub(crate) const PROOF_MANAGED_NOTE_QUERY_COUNT_V1: usize = 136;
/// Trace-to-LDE blow-up logarithm in the first-release profile.
pub(crate) const PROOF_MANAGED_NOTE_BLOWUP_LOG2_V1: u8 = 3;
/// Terminal FRI vector logarithm in the first-release profile.
pub(crate) const PROOF_MANAGED_NOTE_TERMINAL_LOG2_V1: u8 = 10;
/// Exact terminal FRI polynomial-degree bound.
pub(crate) const PROOF_MANAGED_NOTE_TERMINAL_DEGREE_BOUND_V1: usize = 143;
/// Coefficient chunks used to normalize degree-four quotient polynomials.
pub(crate) const PROOF_MANAGED_NOTE_COMPOSITION_DEGREE_CHUNKS_V1: usize = 4;
/// One out-of-domain DEEP-ALI query binds each neighboring-row AIR.
pub(crate) const PROOF_MANAGED_NOTE_DEEP_QUERY_COUNT_V1: usize = 1;
/// Largest native trace supported by the shared first-release soundness proof.
pub(crate) const PROOF_MANAGED_NOTE_MAX_NATIVE_TRACE_LOG2_V1: u8 = 19;
/// Inclusive trace zero-knowledge mask degree.
pub(crate) const PROOF_MANAGED_NOTE_MASK_DEGREE_V1: usize = 975;
/// Largest constraint degree supported by the first-release FRI profile.
pub(crate) const PROOF_MANAGED_NOTE_MAX_CONSTRAINT_DEGREE_V1: u8 = 4;
/// Exact transcript grinding target.
pub(crate) const PROOF_MANAGED_NOTE_GRINDING_BITS_V1: u8 = 20;
/// Required non-grinding soundness floor for every execution profile.
pub(crate) const PROOF_MANAGED_NOTE_TARGET_SOUNDNESS_BITS_V1: u16 = 128;
/// Machine-checked affine-batched FRI query-error exponent at 136 queries.
pub(crate) const PROOF_MANAGED_NOTE_FRI_QUERY_ERROR_BITS_V1: u16 = 160;
/// Worst-case commitment-error exponent at the maximum native trace.
pub(crate) const PROOF_MANAGED_NOTE_FRI_COMMITMENT_ERROR_BITS_MIN_V1: u16 = 187;
/// Affine batching parameter in the sole first-release FRI theorem instance.
pub(crate) const PROOF_MANAGED_NOTE_FRI_BATCHING_PARAMETER_M_V1: u8 = 3;
/// Exact effective FRI code-rate numerator.
pub(crate) const PROOF_MANAGED_NOTE_FRI_RATE_NUMERATOR_V1: u8 = 1;
/// Exact effective FRI code-rate denominator.
pub(crate) const PROOF_MANAGED_NOTE_FRI_RATE_DENOMINATOR_V1: u8 = 7;
/// Complete affine arities whose sum enters the commitment-error term.
// Binary fold arities are derived from the full actual domain/terminal schedule.
/// Proven lower-bound exponent for the Goldilocks quartic extension field.
pub(crate) const PROOF_MANAGED_NOTE_EXTENSION_FIELD_LOWER_BOUND_BITS_V1: u16 = 252;
/// Complete relation-neutral first-release proof-driver geometry.
///
/// Protocol adapters bind a separate relation descriptor. The canonical
/// profile digest frames this shared descriptor first and the relation
/// descriptor second, so neither layer can silently restate stale geometry.
pub(crate) const PROOF_MANAGED_NOTE_STARK_GEOMETRY_DESCRIPTOR_V1: &[u8] = b"iroha:execution:stark:geometry-v1:proof=StarkFriPoseidon2X7GoldilocksW16R8C8Output6:base-field=goldilocks:challenge-field=goldilocks-fp4:merkle=poseidon2-x7-goldilocks-w16-r8-c8-output6:transcript=poseidon2-x7-goldilocks-w16-r8-c8-output6:aux-oracle=verifier-width-derived-absent-or-committed:copy-chip=none:security-lanes=1:queries=136:lde-blowup=8:composition-degree-chunks=4:deep-points=1:deep-openings=base-current,base-next,aux-current,aux-next,composition:deep-air-identity=weighted-compiled-fp4-verifier-fixed-polynomials:deep-mixes=independent:max-native-trace-log2=19:trace-mask-degree=975:trace-mask-coefficients=976:max-constraint-degree=4:fri-terminal=1024:fri-degree=143:fri-input=deep-ali:fri-theorem=affine-batched-theorem2:l-minus-one=3/2:batching-m=3:rho-upper-bound=1/7:affine-arities=every-binary-fold:folds=lde-log2-minus-terminal-log2:max-folds=12:extension-field-lower-bound-bits=252:query-error-bits=160:commitment-error-bits-min=187:target-soundness-bits=128:grinding=20-nonadditive:codec=fixed-shape-be-integers-le-digest384-aux-roots-if-present";
/// Derive the canonical digest of shared proof geometry plus one relation.
pub(crate) fn proof_managed_note_stark_profile_digest_v1(
    domains: aggregate::AggregateStarkDomainsV1,
    relation_descriptor: &[u8],
) -> Result<GoldilocksDigest384V1, ProofManagedNoteStarkErrorV1> {
    goldilocks_digest384_frame_v1(
        domains.digest_context,
        NOTE_COMBINED_PROFILE_DIGEST_DOMAIN_V1,
        b"compiled-profile",
        0,
        0,
        0,
        &[
            PROOF_MANAGED_NOTE_STARK_GEOMETRY_DESCRIPTOR_V1,
            relation_descriptor,
        ],
    )
    .map_err(map_transparent_error_v1)
}
/// Derive the protocol-bound digest of the shared proof geometry.
pub(crate) fn proof_managed_note_stark_geometry_digest_v1(
    domains: aggregate::AggregateStarkDomainsV1,
) -> Result<GoldilocksDigest384V1, ProofManagedNoteStarkErrorV1> {
    goldilocks_digest384_frame_v1(
        domains.digest_context,
        NOTE_COMBINED_PROFILE_DIGEST_DOMAIN_V1,
        b"shared-geometry",
        0,
        0,
        0,
        &[PROOF_MANAGED_NOTE_STARK_GEOMETRY_DESCRIPTOR_V1],
    )
    .map_err(map_transparent_error_v1)
}
/// Execution proof-driver failure.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Error)]
pub(crate) enum ProofManagedNoteStarkErrorV1 {
    /// The compiled profile or verifier-derived trace shape is invalid.
    #[error("execution STARK profile is invalid")]
    InvalidProfile,
    /// A prover trace does not have the exact compiled shape.
    #[error("execution STARK trace shape is invalid")]
    InvalidTrace,
    /// A profile-specific algebraic residue failed.
    #[error("execution STARK relation constraint is invalid")]
    Constraint,
    /// The proof wire is empty, malformed, non-canonical, or oversized.
    #[error("execution STARK proof wire is invalid")]
    ProofWire,
    /// A committed trace opening failed.
    #[error("execution STARK trace opening is invalid")]
    TraceOpening,
    /// A quotient or composition opening failed.
    #[error("execution STARK composition opening is invalid")]
    Composition,
    /// A FRI opening or degree check failed.
    #[error("execution STARK FRI relation is invalid")]
    Fri,
    /// Transcript challenges, grinding, or query positions differ.
    #[error("execution STARK transcript is invalid")]
    Transcript,
    /// Masking entropy is unavailable.
    #[error("execution STARK masking entropy is unavailable")]
    Randomness,
    /// A bounded allocation could not be reserved on this node; never a verdict on a proof.
    #[error("execution STARK bounded allocation failed")]
    Allocation,
    /// An adapter could not compute a value it owns (for example its own canonical
    /// statement encoding); never a verdict on a proof.
    #[error("execution STARK local computation failed")]
    LocalInvariant,
    /// A checked dimension calculation exceeded its bound.
    #[error("execution STARK resource bound is exceeded")]
    Resource,
    /// A checked internal invariant failed.
    #[error("execution STARK internal invariant failed")]
    Internal,
}
fn map_transparent_error_v1(error: TransparentStarkErrorV1) -> ProofManagedNoteStarkErrorV1 {
    match error {
        TransparentStarkErrorV1::RandomnessUnavailable => ProofManagedNoteStarkErrorV1::Randomness,
        TransparentStarkErrorV1::AllocationFailure => ProofManagedNoteStarkErrorV1::Allocation,
        TransparentStarkErrorV1::NonCanonicalField | TransparentStarkErrorV1::MalformedProof => {
            ProofManagedNoteStarkErrorV1::ProofWire
        }
        TransparentStarkErrorV1::FriDegree => ProofManagedNoteStarkErrorV1::Fri,
        TransparentStarkErrorV1::InvalidMerkleShape => ProofManagedNoteStarkErrorV1::TraceOpening,
        TransparentStarkErrorV1::ChallengeSamplingExhausted
        | TransparentStarkErrorV1::QuerySamplingExhausted
        | TransparentStarkErrorV1::InvalidGrinding => ProofManagedNoteStarkErrorV1::Transcript,
        _ => ProofManagedNoteStarkErrorV1::Internal,
    }
}
fn map_aggregate_error_v1(error: aggregate::AggregateStarkErrorV1) -> ProofManagedNoteStarkErrorV1 {
    match error {
        aggregate::AggregateStarkErrorV1::InvalidLayout => {
            ProofManagedNoteStarkErrorV1::InvalidProfile
        }
        aggregate::AggregateStarkErrorV1::InvalidProofShape => {
            ProofManagedNoteStarkErrorV1::ProofWire
        }
        aggregate::AggregateStarkErrorV1::MalformedProof
        | aggregate::AggregateStarkErrorV1::ProofTooLarge
        | aggregate::AggregateStarkErrorV1::NonCanonicalField => {
            ProofManagedNoteStarkErrorV1::ProofWire
        }
        aggregate::AggregateStarkErrorV1::TraceOpening => {
            ProofManagedNoteStarkErrorV1::TraceOpening
        }
        aggregate::AggregateStarkErrorV1::ConstraintOpening => {
            ProofManagedNoteStarkErrorV1::Composition
        }
        aggregate::AggregateStarkErrorV1::DeepOpening => ProofManagedNoteStarkErrorV1::Composition,
        aggregate::AggregateStarkErrorV1::FriOpening
        | aggregate::AggregateStarkErrorV1::FriDegree => ProofManagedNoteStarkErrorV1::Fri,
        aggregate::AggregateStarkErrorV1::TranscriptMismatch => {
            ProofManagedNoteStarkErrorV1::Transcript
        }
        aggregate::AggregateStarkErrorV1::AllocationFailure => {
            ProofManagedNoteStarkErrorV1::Allocation
        }
        aggregate::AggregateStarkErrorV1::RandomnessUnavailable => {
            ProofManagedNoteStarkErrorV1::Randomness
        }
        aggregate::AggregateStarkErrorV1::InternalInvariant => {
            ProofManagedNoteStarkErrorV1::Internal
        }
    }
}
/// Closed protocol data supplied by one compiled private-note profile.
///
/// The generic driver fixes every cryptographic primitive and security dimension. A profile may
/// only choose its exact wire magic/version, bounded trace range, widths, byte ceiling, transcript
/// domains, and compiled descriptor/digest.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct ProofManagedNoteStarkProtocolV1 {
    /// Exact aggregate proof dimensions and wire limits.
    pub(crate) parameters: aggregate::AggregateStarkParametersV1,
    /// Complete wide Poseidon2 Merkle and transcript domains.
    pub(crate) domains: aggregate::AggregateStarkDomainsV1,
    /// Maximum algebraic degree across shared and profile constraints.
    pub(crate) maximum_constraint_degree: u8,
    /// Transcript label binding the human-auditable compiled descriptor.
    pub(crate) profile_binding_label: &'static [u8],
    /// Complete immutable profile descriptor.
    pub(crate) profile_descriptor: &'static [u8],
    /// Relation-specific domain embedded in the ordered layout frame.
    pub(crate) relation_layout_domain: &'static [u8],
}
fn validate_note_fri_soundness_v1(
    parameters: aggregate::AggregateStarkParametersV1,
) -> Result<aggregate::AggregateFriTheorem2BoundV1, ProofManagedNoteStarkErrorV1> {
    let layout = aggregate::AggregateProofLayoutV1::new(
        parameters,
        vec![aggregate::AggregateTraceGroupLayoutV1 {
            native_trace_log2: parameters.maximum_trace_log2,
            segment_instances: 1,
            base_width: parameters.maximum_base_columns_per_instance,
            aux_width: parameters.maximum_aux_columns_per_instance,
        }],
    )
    .map_err(map_aggregate_error_v1)?;
    let fold_count = u8::try_from(
        layout
            .fri_rounds(parameters)
            .map_err(map_aggregate_error_v1)?,
    )
    .map_err(|_| ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    let terminal_degree_bound = u16::try_from(parameters.terminal_degree_bound)
        .map_err(|_| ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    let query_count = u8::try_from(parameters.query_count)
        .map_err(|_| ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    let certificate = aggregate::AggregateFriTheorem2CertificateV1 {
        l_minus_one_numerator: 3,
        l_minus_one_denominator: 2,
        batching_parameter_m: PROOF_MANAGED_NOTE_FRI_BATCHING_PARAMETER_M_V1,
        rho_numerator: PROOF_MANAGED_NOTE_FRI_RATE_NUMERATOR_V1,
        rho_denominator: PROOF_MANAGED_NOTE_FRI_RATE_DENOMINATOR_V1,
        affine_arities: vec![
            2;
            layout
                .fri_rounds(parameters)
                .map_err(map_aggregate_error_v1)?
        ],
        domain_log2: layout.common_lde_log2(),
        extension_field_lower_bound_bits: PROOF_MANAGED_NOTE_EXTENSION_FIELD_LOWER_BOUND_BITS_V1,
        base_field_two_adicity: 32,
        trace_domains_are_smooth_subgroups: true,
        evaluation_domain_is_smooth_generator_coset: true,
        evaluation_domain_is_disjoint_from_trace_domains: true,
        fold_count,
        terminal_log2: parameters.terminal_log2,
        terminal_degree_bound,
        query_count,
        distinct_queries_without_replacement: true,
        uniform_rejection_sampling: true,
        claimed_query_error_bits: PROOF_MANAGED_NOTE_FRI_QUERY_ERROR_BITS_V1,
    };
    aggregate::validate_affine_batched_fri_theorem2_v1(parameters, &layout, certificate)
        .map_err(map_aggregate_error_v1)
}
impl ProofManagedNoteStarkProtocolV1 {
    /// Enforce the sole first-release security profile and unique domains.
    pub(crate) fn validate(self) -> Result<(), ProofManagedNoteStarkErrorV1> {
        self.parameters.validate().map_err(map_aggregate_error_v1)?;
        self.domains.validate().map_err(map_aggregate_error_v1)?;
        // Reject caller-controlled degrees before deriving mask geometry, whose
        // zero-degree error would otherwise be misclassified as internal.
        if !(2..=PROOF_MANAGED_NOTE_MAX_CONSTRAINT_DEGREE_V1)
            .contains(&self.maximum_constraint_degree)
        {
            return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
        }
        let fri_soundness = validate_note_fri_soundness_v1(self.parameters)?;
        let mask_geometry = transparent_stark_zk_mask_geometry_v1(
            usize::from(
                self.maximum_constraint_degree
                    .checked_sub(1)
                    .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?,
            ),
            4,
            PROOF_MANAGED_NOTE_DEEP_QUERY_COUNT_V1,
            self.parameters.query_count,
        )
        .map_err(map_transparent_error_v1)?;
        let consensus_proof_cap = self.domains.digest_context.maximum_proof_bytes_v1();
        // This retained driver is execution-only; privacy remains in its original module.
        let maximum_native_log = PROOF_MANAGED_NOTE_MAX_NATIVE_TRACE_LOG2_V1;
        let minimum_commitment_bits = PROOF_MANAGED_NOTE_FRI_COMMITMENT_ERROR_BITS_MIN_V1;
        let _combined_profile_digest =
            proof_managed_note_stark_profile_digest_v1(self.domains, self.profile_descriptor)?;
        if self.parameters.security_lanes != PROOF_MANAGED_NOTE_SECURITY_LANES_V1
            || self.parameters.query_count != PROOF_MANAGED_NOTE_QUERY_COUNT_V1
            || self.parameters.blowup_log2 != PROOF_MANAGED_NOTE_BLOWUP_LOG2_V1
            || self.parameters.terminal_log2 != PROOF_MANAGED_NOTE_TERMINAL_LOG2_V1
            || self.parameters.terminal_degree_bound != PROOF_MANAGED_NOTE_TERMINAL_DEGREE_BOUND_V1
            || self.parameters.composition_degree_chunks
                != PROOF_MANAGED_NOTE_COMPOSITION_DEGREE_CHUNKS_V1
            || self.parameters.maximum_trace_log2 > maximum_native_log
            || self.parameters.maximum_trace_groups != 1
            || self.parameters.maximum_segment_instances != 1
            || self.parameters.maximum_proof_bytes > consensus_proof_cap
            || PROOF_MANAGED_NOTE_MASK_DEGREE_V1 < mask_geometry.minimum_mask_degree
            || fri_soundness.query_error_bits != PROOF_MANAGED_NOTE_FRI_QUERY_ERROR_BITS_V1
            || fri_soundness.commitment_error_bits < minimum_commitment_bits
            || fri_soundness.query_error_bits < PROOF_MANAGED_NOTE_TARGET_SOUNDNESS_BITS_V1
            || fri_soundness.commitment_error_bits < PROOF_MANAGED_NOTE_TARGET_SOUNDNESS_BITS_V1
            || self.profile_binding_label.is_empty()
            || self.profile_descriptor.is_empty()
            || self.relation_layout_domain.is_empty()
        {
            return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
        }
        let extra_domains = [
            NOTE_SHARED_PROFILE_BINDING_LABEL_V1,
            self.profile_binding_label,
            self.relation_layout_domain,
            NOTE_CONSTRAINT_ALPHA_LABEL_V1,
            NOTE_DEEP_BASE_CURRENT_MIX_LABEL_V1,
            NOTE_DEEP_BASE_NEXT_MIX_LABEL_V1,
            NOTE_DEEP_AUX_CURRENT_MIX_LABEL_V1,
            NOTE_DEEP_AUX_NEXT_MIX_LABEL_V1,
            NOTE_DEEP_COMPOSITION_MIX_LABEL_V1,
            NOTE_GRINDING_LABEL_V1,
        ];
        if extra_domains
            .iter()
            .any(|domain| domain.is_empty() || u16::try_from(domain.len()).is_err())
        {
            return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
        }
        for (index, domain) in extra_domains.iter().enumerate() {
            if extra_domains[..index].contains(domain) {
                return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
            }
        }
        let aggregate_domains = [
            self.domains.base_leaf,
            self.domains.base_node,
            self.domains.aux_leaf,
            self.domains.aux_node,
            self.domains.composition_leaf,
            self.domains.composition_node,
            self.domains.fri_leaf,
            self.domains.fri_node,
            self.domains.layout_label,
            self.domains.base_root_label,
            self.domains.aux_root_label,
            self.domains.composition_root_label,
            self.domains.fri_root_label,
            self.domains.fri_beta_label,
            self.domains.query_seed,
        ];
        if extra_domains.iter().any(|domain| {
            aggregate_domains.contains(domain)
                || aggregate::aggregate_stark_domain_is_reserved_v1(domain)
        }) {
            return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
        }
        Ok(())
    }
}
/// Statement-derived relation adapter consumed by the shared proof driver.
///
/// Relation-owned execution columns and polynomial residues.
///
/// No base, auxiliary or fixed prefix is reserved by the driver. An adapter with
/// no auxiliary relation declares width zero and returns an empty column set.
/// Carry and continuity equations remain mandatory adapter constraints.
pub(crate) trait ProofManagedNoteStarkAdapterV1: Sync {
    /// Relation-specific Fiat-Shamir challenges derived after base commitments.
    type ProfileChallenges: Clone + Sync;
    /// Closed proof protocol.
    fn protocol_v1(&self) -> ProofManagedNoteStarkProtocolV1;
    /// Exact digest of all public statement fields.
    fn public_input_digest_v1(&self)
    -> Result<GoldilocksDigest384V1, ProofManagedNoteStarkErrorV1>;
    /// Binary logarithm of the sole native trace group.
    fn trace_log2_v1(&self) -> u8;
    /// Exact relation-owned base-trace width.
    fn base_width_v1(&self) -> usize;
    /// Exact auxiliary width; zero means a genuinely absent oracle.
    fn profile_aux_width_v1(&self) -> usize;
    /// Exact verifier-fixed width; zero means no fixed polynomials.
    fn profile_fixed_width_v1(&self) -> usize;
    /// Exact relation algebraic residue count.
    fn profile_constraint_count_v1(&self) -> usize;
    /// Reconstruct profile-only fixed columns on the native domain.
    fn profile_fixed_columns_v1(&self) -> Result<Vec<Vec<F>>, ProofManagedNoteStarkErrorV1>;
    /// Derive relation challenges after base roots are bound.
    fn derive_profile_challenges_v1(
        &self,
        transcript: &mut TransparentTranscriptV1,
    ) -> Result<Self::ProfileChallenges, ProofManagedNoteStarkErrorV1>;
    /// Build profile-only auxiliary columns on the native domain.
    fn build_profile_aux_columns_v1(
        &self,
        base_columns: &[Vec<F>],
        fixed_columns: &[Vec<F>],
        profile_challenges: &Self::ProfileChallenges,
    ) -> Result<Vec<Vec<F>>, ProofManagedNoteStarkErrorV1>;
    /// Evaluate profile-only polynomial residues at one current/next row pair.
    fn profile_constraint_residues_v1(
        &self,
        current_base: &[F],
        next_base: &[F],
        current_aux: &[F],
        next_aux: &[F],
        fixed: &[F],
        profile_challenges: &Self::ProfileChallenges,
    ) -> Result<Vec<F>, ProofManagedNoteStarkErrorV1>;
    /// Evaluate exactly the same ordered AIR at extension-field current/next
    /// openings and verifier-derived fixed values, weighted by this lane's alphas.
    /// The immutable compiler must define the polynomial before challenges exist.
    fn profile_constraint_sum_fp4_v1(
        &self,
        current_base: &[E],
        next_base: &[E],
        current_aux: &[E],
        next_aux: &[E],
        fixed: &[E],
        profile_challenges: &Self::ProfileChallenges,
        alphas: &[E],
    ) -> Result<E, ProofManagedNoteStarkErrorV1>;
    /// Prepare `sum_k alphas[k] * residue_k` for repeated base-field rows.
    ///
    /// The default evaluates the original ordered residue vector. A compiled
    /// adapter may instead bind its challenge-independent weighted plan once; it
    /// must return the identical field element at every row.
    fn prepare_constraint_sum_v1<'s>(
        &'s self,
        profile_challenges: &'s Self::ProfileChallenges,
        alphas: &'s [E],
    ) -> Result<Box<dyn ConstraintSumV1 + 's>, ProofManagedNoteStarkErrorV1> {
        Ok(Box::new(ResidueDotV1 {
            adapter: self,
            profile_challenges,
            alphas,
        }))
    }
}
/// A challenge-bound weighted constraint sum at base-field rows.
pub(crate) trait ConstraintSumV1: Sync {
    /// `sum_k alphas[k] * residue_k` at one current/next row pair.
    fn constraint_sum_v1(
        &self,
        current_base: &[F],
        next_base: &[F],
        current_aux: &[F],
        next_aux: &[F],
        fixed: &[F],
    ) -> Result<E, ProofManagedNoteStarkErrorV1>;
}
/// The original residue-vector evaluation, weighted after the fact.
struct ResidueDotV1<'s, A: ProofManagedNoteStarkAdapterV1 + ?Sized> {
    adapter: &'s A,
    profile_challenges: &'s A::ProfileChallenges,
    alphas: &'s [E],
}
impl<A: ProofManagedNoteStarkAdapterV1 + ?Sized> ConstraintSumV1 for ResidueDotV1<'_, A> {
    fn constraint_sum_v1(
        &self,
        current_base: &[F],
        next_base: &[F],
        current_aux: &[F],
        next_aux: &[F],
        fixed: &[F],
    ) -> Result<E, ProofManagedNoteStarkErrorV1> {
        let residues = ZeroizingBaseFieldValuesV1::from(self.adapter.profile_constraint_residues_v1(
            current_base,
            next_base,
            current_aux,
            next_aux,
            fixed,
            self.profile_challenges,
        )?);
        if residues.len() != self.alphas.len() {
            return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
        }
        Ok(residues
            .iter()
            .zip(self.alphas)
            .fold(E::ZERO, |sum, (residue, alpha)| sum.add(alpha.mul_base(*residue))))
    }
}
#[derive(Clone)]
struct PreparedNoteProfileV1 {
    protocol: ProofManagedNoteStarkProtocolV1,
    trace_log2: u8,
    trace_size: usize,
    base_width: usize,
    aux_width: usize,
    fixed_width: usize,
    constraint_count: usize,
    layout: aggregate::AggregateProofLayoutV1,
    fixed_columns: Vec<Vec<F>>,
}
fn canonical_columns_v1(
    columns: &[Vec<F>],
    width: usize,
    rows: usize,
) -> Result<(), ProofManagedNoteStarkErrorV1> {
    if columns.len() != width
        || columns.iter().any(|column| {
            column.len() != rows || column.iter().any(|value| F::canonical(value.0).is_none())
        })
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    Ok(())
}
fn checked_trace_size_v1(trace_log2: u8) -> Result<usize, ProofManagedNoteStarkErrorV1> {
    1_usize
        .checked_shl(u32::from(trace_log2))
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)
}
fn maximum_masked_trace_degree_v1(
    trace_size: usize,
) -> Result<usize, ProofManagedNoteStarkErrorV1> {
    trace_size
        .checked_add(PROOF_MANAGED_NOTE_MASK_DEGREE_V1)
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)
}
fn maximum_quotient_degree_v1(
    trace_size: usize,
    constraint_degree: u8,
) -> Result<usize, ProofManagedNoteStarkErrorV1> {
    usize::from(constraint_degree)
        .checked_mul(maximum_masked_trace_degree_v1(trace_size)?)
        .and_then(|degree| degree.checked_sub(trace_size))
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)
}
fn maximum_fri_input_degree_v1(
    layout: &aggregate::AggregateProofLayoutV1,
    parameters: aggregate::AggregateStarkParametersV1,
) -> Result<usize, ProofManagedNoteStarkErrorV1> {
    let fri_rounds = layout
        .fri_rounds(parameters)
        .map_err(map_aggregate_error_v1)?;
    let shift =
        u32::try_from(fri_rounds).map_err(|_| ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    let fold_factor = 1_usize
        .checked_shl(shift)
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    parameters
        .terminal_degree_bound
        .checked_add(1)
        .and_then(|terminal_coefficients| terminal_coefficients.checked_mul(fold_factor))
        .and_then(|coefficient_capacity| coefficient_capacity.checked_sub(1))
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)
}
fn prepare_note_profile_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
) -> Result<PreparedNoteProfileV1, ProofManagedNoteStarkErrorV1> {
    prepare_note_profile_with_fixed_v1(adapter, true)
}
fn prepare_note_profile_with_fixed_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
    materialize_fixed: bool,
) -> Result<PreparedNoteProfileV1, ProofManagedNoteStarkErrorV1> {
    let protocol = adapter.protocol_v1();
    protocol.validate()?;
    let trace_log2 = adapter.trace_log2_v1();
    let trace_size = checked_trace_size_v1(trace_log2)?;
    let base_width = adapter.base_width_v1();
    let aux_width = adapter.profile_aux_width_v1();
    let fixed_width = adapter.profile_fixed_width_v1();
    let constraint_count = adapter.profile_constraint_count_v1();
    if base_width == 0
        || adapter.profile_constraint_count_v1() == 0
        || fixed_width > usize::from(u16::MAX)
        || constraint_count > usize::from(u16::MAX)
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    let layout = aggregate::AggregateProofLayoutV1::new(
        protocol.parameters,
        vec![aggregate::AggregateTraceGroupLayoutV1 {
            native_trace_log2: trace_log2,
            segment_instances: 1,
            base_width,
            aux_width,
        }],
    )
    .map_err(map_aggregate_error_v1)?;
    if layout.common_lde_log2()
        != trace_log2
            .checked_add(PROOF_MANAGED_NOTE_BLOWUP_LOG2_V1)
            .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    let maximum_trace_degree = maximum_masked_trace_degree_v1(trace_size)?;
    let maximum_quotient_degree =
        maximum_quotient_degree_v1(trace_size, protocol.maximum_constraint_degree)?;
    let maximum_fri_input_degree = maximum_fri_input_degree_v1(&layout, protocol.parameters)?;
    let maximum_composition_degree = layout
        .maximum_composition_degree(protocol.parameters)
        .map_err(map_aggregate_error_v1)?;
    let maximum_encoded_proof_bytes =
        aggregate::maximum_encoded_proof_with_deep_bytes_v1(protocol.parameters, &layout)
            .map_err(map_aggregate_error_v1)?;
    if maximum_trace_degree > maximum_fri_input_degree
        || maximum_quotient_degree > maximum_composition_degree
        || maximum_encoded_proof_bytes > protocol.parameters.maximum_proof_bytes
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    let fixed_columns = if materialize_fixed {
        prepare_fixed_columns_v1(adapter, trace_size, fixed_width)?
    } else {
        Vec::new()
    };
    Ok(PreparedNoteProfileV1 {
        protocol,
        trace_log2,
        trace_size,
        base_width,
        aux_width,
        fixed_width,
        constraint_count,
        layout,
        fixed_columns,
    })
}
fn prepare_fixed_columns_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
    trace_size: usize,
    fixed_width: usize,
) -> Result<Vec<Vec<F>>, ProofManagedNoteStarkErrorV1> {
    let fixed_columns = adapter.profile_fixed_columns_v1()?;
    canonical_columns_v1(&fixed_columns, fixed_width, trace_size)?;
    Ok(fixed_columns)
}
fn row_at_columns_v1(
    columns: &[Vec<F>],
    row: usize,
) -> Result<Vec<F>, ProofManagedNoteStarkErrorV1> {
    let mut values = ZeroizingBaseFieldValuesV1::from(Vec::new());
    values
        .0
        .try_reserve_exact(columns.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    for column in columns {
        values.0.push(
            column
                .get(row)
                .copied()
                .ok_or(ProofManagedNoteStarkErrorV1::InvalidTrace)?,
        );
    }
    Ok(values.into_inner())
}
struct ZeroizingBaseFieldValuesV1(Vec<F>);
impl From<Vec<F>> for ZeroizingBaseFieldValuesV1 {
    fn from(values: Vec<F>) -> Self {
        Self(values)
    }
}
impl ZeroizingBaseFieldValuesV1 {
    fn into_inner(mut self) -> Vec<F> {
        core::mem::take(&mut self.0)
    }

    fn zeroize_v1(&mut self) {
        for value in &mut self.0 {
            value.zeroize_v1();
        }
    }
}
impl core::ops::Deref for ZeroizingBaseFieldValuesV1 {
    type Target = [F];

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl core::ops::DerefMut for ZeroizingBaseFieldValuesV1 {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
impl Drop for ZeroizingBaseFieldValuesV1 {
    fn drop(&mut self) {
        self.zeroize_v1();
    }
}
struct ZeroizingBaseFieldMatrixV1(Vec<Vec<F>>);
impl From<Vec<Vec<F>>> for ZeroizingBaseFieldMatrixV1 {
    fn from(values: Vec<Vec<F>>) -> Self {
        Self(values)
    }
}
impl ZeroizingBaseFieldMatrixV1 {
    fn into_inner(mut self) -> Vec<Vec<F>> {
        core::mem::take(&mut self.0)
    }

    fn append(&mut self, other: &mut Self) {
        self.0.append(&mut other.0);
    }

    fn zeroize_v1(&mut self) {
        for column in &mut self.0 {
            for value in column {
                value.zeroize_v1();
            }
        }
    }
}
impl core::ops::Deref for ZeroizingBaseFieldMatrixV1 {
    type Target = Vec<Vec<F>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl core::ops::DerefMut for ZeroizingBaseFieldMatrixV1 {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
impl Drop for ZeroizingBaseFieldMatrixV1 {
    fn drop(&mut self) {
        self.zeroize_v1();
    }
}
struct ZeroizingExtensionFieldValuesV1(Vec<E>);
impl From<Vec<E>> for ZeroizingExtensionFieldValuesV1 {
    fn from(values: Vec<E>) -> Self {
        Self(values)
    }
}
impl ZeroizingExtensionFieldValuesV1 {
    fn into_inner(mut self) -> Vec<E> {
        core::mem::take(&mut self.0)
    }

    fn zeroize_v1(&mut self) {
        for value in &mut self.0 {
            value.zeroize_v1();
        }
    }
}
impl core::ops::Deref for ZeroizingExtensionFieldValuesV1 {
    type Target = [E];

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl core::ops::DerefMut for ZeroizingExtensionFieldValuesV1 {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
impl Drop for ZeroizingExtensionFieldValuesV1 {
    fn drop(&mut self) {
        self.zeroize_v1();
    }
}
struct ZeroizingExtensionFieldMatrixV1(Vec<Vec<E>>);
impl From<Vec<Vec<E>>> for ZeroizingExtensionFieldMatrixV1 {
    fn from(values: Vec<Vec<E>>) -> Self {
        Self(values)
    }
}
impl ZeroizingExtensionFieldMatrixV1 {
    fn zeroize_v1(&mut self) {
        for column in &mut self.0 {
            for value in column {
                value.zeroize_v1();
            }
        }
    }
}
impl core::ops::Deref for ZeroizingExtensionFieldMatrixV1 {
    type Target = Vec<Vec<E>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl core::ops::DerefMut for ZeroizingExtensionFieldMatrixV1 {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
impl Drop for ZeroizingExtensionFieldMatrixV1 {
    fn drop(&mut self) {
        self.zeroize_v1();
    }
}
struct ZeroizingExtensionFieldCubeV1(Vec<Vec<Vec<E>>>);
impl From<Vec<Vec<Vec<E>>>> for ZeroizingExtensionFieldCubeV1 {
    fn from(values: Vec<Vec<Vec<E>>>) -> Self {
        Self(values)
    }
}
impl ZeroizingExtensionFieldCubeV1 {
    fn into_inner(mut self) -> Vec<Vec<Vec<E>>> {
        core::mem::take(&mut self.0)
    }

    fn zeroize_v1(&mut self) {
        for matrix in &mut self.0 {
            for column in matrix {
                for value in column {
                    value.zeroize_v1();
                }
            }
        }
    }
}
impl core::ops::Deref for ZeroizingExtensionFieldCubeV1 {
    type Target = Vec<Vec<Vec<E>>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
impl core::ops::DerefMut for ZeroizingExtensionFieldCubeV1 {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.0
    }
}
impl Drop for ZeroizingExtensionFieldCubeV1 {
    fn drop(&mut self) {
        self.zeroize_v1();
    }
}
struct ZeroizingExtensionFieldRowV1<const N: usize>([E; N]);
impl<const N: usize> ZeroizingExtensionFieldRowV1<N> {
    fn iter(&self) -> core::slice::Iter<'_, E> {
        self.0.iter()
    }

    fn zeroize_v1(&mut self) {
        for value in &mut self.0 {
            value.zeroize_v1();
        }
    }
}
impl<const N: usize> Drop for ZeroizingExtensionFieldRowV1<N> {
    fn drop(&mut self) {
        self.zeroize_v1();
    }
}
fn collect_bounded_parallel_columns_v1<T, Transform>(
    column_count: usize,
    transform: Transform,
) -> Result<Vec<T>, ProofManagedNoteStarkErrorV1>
where
    T: Send,
    Transform: Fn(usize) -> Result<T, ProofManagedNoteStarkErrorV1> + Sync,
{
    let mut output = Vec::new();
    output
        .try_reserve_exact(column_count)
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    // Sequential source-ordered batches make the resident transform count independent of the
    // process-global Rayon width. Indexed collection and serial reduction preserve both output
    // order and the lowest-column error.
    for batch_start in (0..column_count).step_by(aggregate::MASKED_TRACE_LDE_COLUMN_BATCH_V1) {
        let batch_end = batch_start
            .checked_add(aggregate::MASKED_TRACE_LDE_COLUMN_BATCH_V1)
            .map_or(column_count, |end| end.min(column_count));
        let batch = (batch_start..batch_end)
            .into_par_iter()
            .map(&transform)
            .collect::<Vec<_>>();
        for transformed in batch {
            output.push(transformed?);
        }
    }
    Ok(output)
}
#[cfg(test)]
fn fixed_lde_columns_v1(
    columns: &[Vec<F>],
    trace_log2: u8,
    lde_log2: u8,
) -> Result<Vec<Vec<F>>, ProofManagedNoteStarkErrorV1> {
    let trace_size = checked_trace_size_v1(trace_log2)?;
    let lde_size = checked_trace_size_v1(lde_log2)?;
    if lde_size <= trace_size || columns.iter().any(|column| column.len() != trace_size) {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    let trace_root = goldilocks_primitive_root_v1(trace_log2).map_err(map_transparent_error_v1)?;
    let lde_root = goldilocks_primitive_root_v1(lde_log2).map_err(map_transparent_error_v1)?;
    // Empty fixed width is genuine absence. Geometry and both primitive roots
    // are validated above; an empty collection allocates no transform matrix.
    let shift = F(GOLDILOCKS_GENERATOR_V1);
    collect_bounded_parallel_columns_v1(columns.len(), |column_index| {
        let column = &columns[column_index];
        let mut coefficients = column.clone();
        goldilocks_ifft_v1(&mut coefficients, trace_root).map_err(map_transparent_error_v1)?;
        coefficients.resize(lde_size, F::ZERO);
        let mut shift_power = F::ONE;
        for coefficient in &mut coefficients {
            *coefficient = coefficient.mul(shift_power);
            shift_power = shift_power.mul(shift);
        }
        goldilocks_fft_v1(&mut coefficients, lde_root).map_err(map_transparent_error_v1)?;
        Ok(coefficients)
    })
}
#[cfg(test)]
/// Compare selected execution evaluations against the original native full-LDE path.
pub(crate) fn execution_fixed_query_parity_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
    query_indices: &[usize],
) -> Result<bool, ProofManagedNoteStarkErrorV1> {
    let prepared = prepare_note_profile_v1(adapter)?;
    let reference = fixed_lde_columns_v1(
        &prepared.fixed_columns,
        prepared.trace_log2,
        prepared.layout.common_lde_log2(),
    )?;
    let queries = execution_fixed::query_rows_v1(
        prepared.fixed_columns,
        prepared.trace_log2,
        prepared.layout.common_lde_log2(),
        query_indices,
    )?;
    for index in query_indices {
        if queries.get(index) != Some(&row_at_columns_v1(&reference, *index)?) {
            return Ok(false);
        }
    }
    Ok(true)
}
#[cfg(test)]
fn masked_lde_columns_v1<R: TryRngCore>(
    columns: &[Vec<F>],
    trace_log2: u8,
    lde_log2: u8,
    rng: &mut R,
) -> Result<(Vec<Vec<F>>, Vec<ReplayableTraceMaskV1>), ProofManagedNoteStarkErrorV1> {
    if columns.is_empty() {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    // Reject every semantic transform failure before consuming masking entropy. Once these
    // checks pass, the generated masks are canonical and every worker has the same valid FFT/coset
    // geometry; only a bounded allocation failure can still stop an individual transform.
    let trace_size = checked_trace_size_v1(trace_log2)?;
    let lde_size = checked_trace_size_v1(lde_log2)?;
    let mask_len = PROOF_MANAGED_NOTE_MASK_DEGREE_V1
        .checked_add(1)
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    let coefficient_count = trace_size
        .checked_add(mask_len)
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    if lde_size <= trace_size
        || coefficient_count > lde_size
        || columns.iter().any(|column| column.len() != trace_size)
    {
        return Err(map_transparent_error_v1(
            TransparentStarkErrorV1::InvalidDomain,
        ));
    }
    if columns
        .iter()
        .flatten()
        .any(|value| F::canonical(value.0).is_none())
    {
        return Err(map_transparent_error_v1(
            TransparentStarkErrorV1::NonCanonicalField,
        ));
    }
    goldilocks_primitive_root_v1(trace_log2).map_err(map_transparent_error_v1)?;
    goldilocks_primitive_root_v1(lde_log2).map_err(map_transparent_error_v1)?;
    let shift = F(GOLDILOCKS_GENERATOR_V1);
    if shift.pow(trace_size as u128) == F::ONE || shift.pow(lde_size as u128) == F::ONE {
        return Err(map_transparent_error_v1(
            TransparentStarkErrorV1::InvalidDomain,
        ));
    }
    let mut masks = Vec::new();
    masks
        .try_reserve_exact(columns.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    // Preserve the exact canonical RNG-consumption order before any parallel work begins.
    for _ in columns {
        masks.push(
            sample_trace_mask_v1(PROOF_MANAGED_NOTE_MASK_DEGREE_V1, rng)
                .map_err(map_transparent_error_v1)?,
        );
    }
    // Masks live until every bounded transform succeeds, so their Drop implementation wipes the
    // sampled coefficients on success, ordinary error, and unwind. The transform itself likewise
    // guards and wipes the witness-interpolating coefficient vector.
    let lde_columns = collect_bounded_parallel_columns_v1(columns.len(), |column_index| {
        masked_trace_lde_column_with_mask_v1(
            &columns[column_index],
            trace_log2,
            lde_log2,
            masks[column_index].coefficients(),
        )
        .map(ZeroizingBaseFieldValuesV1::from)
        .map_err(map_transparent_error_v1)
    })?;
    let mut protected_columns = ZeroizingBaseFieldMatrixV1(Vec::new());
    protected_columns
        .try_reserve_exact(lde_columns.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    for column in lde_columns {
        protected_columns.push(column.into_inner());
    }
    Ok((protected_columns.into_inner(), masks))
}
/// Sample masks exactly as `masked_lde_columns_v1` does, retaining the masked trace
/// coefficients `T(X) + r(X) (X^n - 1)` instead of their full-domain evaluations.
fn masked_coefficient_columns_v1<R: TryRngCore>(
    columns: &[Vec<F>],
    trace_log2: u8,
    lde_log2: u8,
    rng: &mut R,
) -> Result<(ZeroizingBaseFieldMatrixV1, Vec<ReplayableTraceMaskV1>), ProofManagedNoteStarkErrorV1>
{
    if columns.is_empty() {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    // The same semantic checks precede the same entropy consumption as the full-domain path.
    let trace_size = checked_trace_size_v1(trace_log2)?;
    let lde_size = checked_trace_size_v1(lde_log2)?;
    let mask_len = PROOF_MANAGED_NOTE_MASK_DEGREE_V1
        .checked_add(1)
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    let coefficient_count = trace_size
        .checked_add(mask_len)
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    if lde_size <= trace_size
        || coefficient_count > lde_size
        || columns.iter().any(|column| column.len() != trace_size)
    {
        return Err(map_transparent_error_v1(
            TransparentStarkErrorV1::InvalidDomain,
        ));
    }
    if columns
        .iter()
        .flatten()
        .any(|value| F::canonical(value.0).is_none())
    {
        return Err(map_transparent_error_v1(
            TransparentStarkErrorV1::NonCanonicalField,
        ));
    }
    goldilocks_primitive_root_v1(trace_log2).map_err(map_transparent_error_v1)?;
    goldilocks_primitive_root_v1(lde_log2).map_err(map_transparent_error_v1)?;
    let shift = F(GOLDILOCKS_GENERATOR_V1);
    if shift.pow(trace_size as u128) == F::ONE || shift.pow(lde_size as u128) == F::ONE {
        return Err(map_transparent_error_v1(
            TransparentStarkErrorV1::InvalidDomain,
        ));
    }
    let mut masks = Vec::new();
    masks
        .try_reserve_exact(columns.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    for _ in columns {
        masks.push(
            sample_trace_mask_v1(PROOF_MANAGED_NOTE_MASK_DEGREE_V1, rng)
                .map_err(map_transparent_error_v1)?,
        );
    }
    let coefficient_columns = collect_bounded_parallel_columns_v1(columns.len(), |column_index| {
        masked_trace_coefficients_with_mask_v1(
            &columns[column_index],
            trace_log2,
            masks[column_index].coefficients(),
        )
        .map(ZeroizingBaseFieldValuesV1::from)
        .map_err(map_transparent_error_v1)
    })?;
    let mut protected_columns = ZeroizingBaseFieldMatrixV1(Vec::new());
    protected_columns
        .try_reserve_exact(coefficient_columns.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    for column in coefficient_columns {
        protected_columns.push(column.into_inner());
    }
    Ok((protected_columns, masks))
}
/// Interpolate verifier-fixed columns in place; coset evaluations replace their full LDE.
fn fixed_coefficient_columns_v1(
    mut columns: Vec<Vec<F>>,
    trace_log2: u8,
    lde_log2: u8,
) -> Result<Vec<Vec<F>>, ProofManagedNoteStarkErrorV1> {
    let trace_size = checked_trace_size_v1(trace_log2)?;
    let lde_size = checked_trace_size_v1(lde_log2)?;
    if lde_size <= trace_size || columns.iter().any(|column| column.len() != trace_size) {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    let trace_root = goldilocks_primitive_root_v1(trace_log2).map_err(map_transparent_error_v1)?;
    for batch in columns.chunks_mut(aggregate::MASKED_TRACE_LDE_COLUMN_BATCH_V1) {
        batch
            .par_iter_mut()
            .map(|column| goldilocks_ifft_v1(column, trace_root).map_err(map_transparent_error_v1))
            .collect::<Vec<_>>()
            .into_iter()
            .collect::<Result<(), _>>()?;
    }
    Ok(columns)
}
/// Binary logarithm of the largest coset that streamed commitments and composition evaluate at
/// once; smaller native traces use native-size cosets.
const STREAMING_COSET_LOG2_V1: u8 = 16;
/// Lowest retained level of trace commitment trees. Opened `2^level`-leaf blocks are rebuilt
/// from reconstructed rows when frontiers are extracted.
const TRACE_TREE_FIRST_LEVEL_V1: usize = 3;
/// The common LDE coset split into equal multiplicative cosets.
///
/// Natural LDE index `i` is the point `g * omega_lde^i`. With `K` cosets of size `m = lde / K`
/// and `i = r + K * j`, the indices with residue `r` are the points `s_r * omega_m^j` of the
/// coset with shift `s_r = g * omega_lde^r`. The next trace row of index `i` is `i + B` for
/// blowup `B = lde / n`. With native-size cosets (`K = B`) that is row `j + 1 mod m` of the same
/// coset; with smaller cosets it is row `j` of coset `r + B`, or row `j + 1` of coset
/// `r + B - K` when `r + B >= K`.
struct LdeCosetsV1 {
    trace_size: usize,
    blowup: usize,
    count: usize,
    coset_size: usize,
    coset_root: F,
    lde_root: F,
}
/// `s_r^k` for every row of one coset, and `s_r^m`.
struct CosetPowersV1 {
    coset: usize,
    powers: Vec<F>,
    wrap: F,
}
impl LdeCosetsV1 {
    fn new(
        trace_log2: u8,
        lde_log2: u8,
        coset_log2: u8,
    ) -> Result<Self, ProofManagedNoteStarkErrorV1> {
        let trace_size = checked_trace_size_v1(trace_log2)?;
        let lde_size = checked_trace_size_v1(lde_log2)?;
        let coset_size = checked_trace_size_v1(coset_log2)?;
        if lde_size <= trace_size || coset_size > trace_size || coset_size < 4 {
            return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
        }
        Ok(Self {
            trace_size,
            blowup: lde_size / trace_size,
            count: lde_size / coset_size,
            coset_size,
            coset_root: goldilocks_primitive_root_v1(coset_log2)
                .map_err(map_transparent_error_v1)?,
            lde_root: goldilocks_primitive_root_v1(lde_log2).map_err(map_transparent_error_v1)?,
        })
    }
    fn lde_size(&self) -> usize {
        self.coset_size * self.count
    }
    fn powers(&self, coset: usize) -> Result<CosetPowersV1, ProofManagedNoteStarkErrorV1> {
        let shift = F(GOLDILOCKS_GENERATOR_V1).mul(self.lde_root.pow(coset as u128));
        Ok(CosetPowersV1 {
            coset,
            powers: super::fft::power_table(shift, self.coset_size)
                .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?,
            wrap: shift.pow(self.coset_size as u128),
        })
    }
    /// Evaluate every coefficient column on one coset into the equally wide `out`.
    fn evaluate<V: super::fft::FftValue>(
        &self,
        coefficients: &[Vec<V>],
        powers: &CosetPowersV1,
        out: &mut [Vec<V>],
    ) -> Result<(), ProofManagedNoteStarkErrorV1> {
        if coefficients.len() != out.len()
            || out.iter().any(|column| column.len() != self.coset_size)
        {
            return Err(ProofManagedNoteStarkErrorV1::Internal);
        }
        out.par_iter_mut()
            .zip(coefficients.par_iter())
            .for_each(|(out, coefficients)| {
                super::fft::coset_evaluate_folded_into(
                    coefficients,
                    &powers.powers,
                    powers.wrap,
                    self.coset_root,
                    out,
                );
            });
        Ok(())
    }
}
/// Zeroed `width` columns of `rows` values for one coset's evaluations.
fn coset_scratch_v1(
    width: usize,
    rows: usize,
) -> Result<ZeroizingBaseFieldMatrixV1, ProofManagedNoteStarkErrorV1> {
    let columns = (0..width)
        .into_par_iter()
        .map(|_| {
            let mut column = Vec::new();
            column
                .try_reserve_exact(rows)
                .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
            column.resize(rows, F::ZERO);
            Ok(column)
        })
        .collect::<Result<Vec<_>, ProofManagedNoteStarkErrorV1>>()?;
    Ok(ZeroizingBaseFieldMatrixV1(columns))
}
/// Commit retained trace polynomials one LDE coset at a time.
///
/// Each coset is evaluated into `scratch` and its rows are hashed into their natural leaf
/// positions, so the tree equals `aggregate::row_tree_v1` over the full-domain columns.
fn commit_trace_cosets_v1(
    context: super::transparent_stark::TransparentStarkDigestContextV1,
    leaf_role: &[u8],
    node_role: &'static [u8],
    coefficients: &[Vec<F>],
    cosets: &LdeCosetsV1,
    scratch: &mut [Vec<F>],
) -> Result<GoldilocksMerkleTreeV1, ProofManagedNoteStarkErrorV1> {
    let mut leaves = Vec::new();
    leaves
        .try_reserve_exact(cosets.lde_size())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    leaves.resize(cosets.lde_size(), GoldilocksDigest384V1::default());
    for coset in 0..cosets.count {
        let powers = cosets.powers(coset)?;
        cosets.evaluate(coefficients, &powers, scratch)?;
        aggregate::coset_row_leaves_v1(
            context,
            leaf_role,
            0,
            scratch,
            coset,
            cosets.count,
            &mut leaves,
        )
        .map_err(map_aggregate_error_v1)?;
    }
    GoldilocksMerkleTreeV1::from_leaves_retaining(
        leaves,
        context,
        node_role,
        TRACE_TREE_FIRST_LEVEL_V1,
    )
    .map_err(map_transparent_error_v1)
}
/// The retained trace tree's nodes plus the rebuilt nodes of every opened leaf block.
///
/// `rows` holds the reconstructed rows of every index in those blocks.
fn trace_tree_nodes_v1(
    context: super::transparent_stark::TransparentStarkDigestContextV1,
    leaf_role: &[u8],
    node_role: &[u8],
    tree: &GoldilocksMerkleTreeV1,
    rows: &std::collections::BTreeMap<usize, Vec<F>>,
) -> Result<
    std::collections::BTreeMap<(usize, usize), GoldilocksDigest384V1>,
    ProofManagedNoteStarkErrorV1,
> {
    let mut blocks = std::collections::BTreeMap::<usize, Vec<(usize, &Vec<F>)>>::new();
    for (index, row) in rows {
        blocks
            .entry(index >> TRACE_TREE_FIRST_LEVEL_V1)
            .or_default()
            .push((*index, row));
    }
    let leaves = blocks
        .into_par_iter()
        .map(|(block, rows)| {
            let leaves = rows
                .into_iter()
                .map(|(index, row)| {
                    aggregate::row_leaf_hash_v1(context, leaf_role, 0, index, row)
                        .map_err(map_aggregate_error_v1)
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok((block, leaves))
        })
        .collect::<Result<std::collections::BTreeMap<_, _>, ProofManagedNoteStarkErrorV1>>()?;
    aggregate::recompute_merkle_blocks_v1(
        context,
        node_role,
        tree,
        TRACE_TREE_FIRST_LEVEL_V1,
        &leaves,
    )
    .map_err(map_aggregate_error_v1)
}
/// Commit one composition lane from its retained chunk coefficients, one LDE coset at a time.
///
/// The tree equals `aggregate::composition_tree_v1` over the chunk codewords, which are never
/// materialized on the full domain.
fn commit_composition_cosets_v1(
    domains: aggregate::AggregateStarkDomainsV1,
    lane: usize,
    chunk_coefficients: &[Vec<E>],
    cosets: &LdeCosetsV1,
) -> Result<GoldilocksMerkleTreeV1, ProofManagedNoteStarkErrorV1> {
    let mut scratch = ZeroizingExtensionFieldMatrixV1(Vec::new());
    scratch
        .0
        .try_reserve_exact(chunk_coefficients.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    for _ in chunk_coefficients {
        let mut column = Vec::new();
        column
            .try_reserve_exact(cosets.coset_size)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        column.resize(cosets.coset_size, E::ZERO);
        scratch.0.push(column);
    }
    let mut leaves = Vec::new();
    leaves
        .try_reserve_exact(cosets.lde_size())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    leaves.resize(cosets.lde_size(), GoldilocksDigest384V1::default());
    for coset in 0..cosets.count {
        let powers = cosets.powers(coset)?;
        cosets.evaluate(chunk_coefficients, &powers, &mut scratch)?;
        aggregate::coset_composition_leaves_v1(
            domains,
            lane,
            &scratch,
            coset,
            cosets.count,
            &mut leaves,
        )
        .map_err(map_aggregate_error_v1)?;
    }
    GoldilocksMerkleTreeV1::from_leaves(leaves, domains.digest_context, domains.composition_node)
        .map_err(map_transparent_error_v1)
}
/// Values of `width` polynomials at sorted unique LDE indices, one column at a time.
///
/// `coefficients(c)` supplies column `c`'s coefficients. Each column is evaluated only on the
/// cosets that contain a requested index, and only the requested values survive, so the
/// transient footprint is one column and one coset per worker.
fn values_at_lde_indices_with_v1<V: super::fft::FftValue>(
    width: usize,
    coefficients: impl Fn(usize) -> Result<zeroize::Zeroizing<Vec<V>>, ProofManagedNoteStarkErrorV1>
    + Sync,
    indices: &[usize],
    cosets: &LdeCosetsV1,
) -> Result<aggregate::ZeroizingOpenedRowsV1<V>, ProofManagedNoteStarkErrorV1> {
    let mut rows = aggregate::ZeroizingOpenedRowsV1(std::collections::BTreeMap::new());
    if width == 0 {
        return Ok(rows);
    }
    if indices.iter().any(|index| *index >= cosets.lde_size()) {
        return Err(ProofManagedNoteStarkErrorV1::Internal);
    }
    let mut needed = vec![Vec::new(); cosets.count];
    for (position, index) in indices.iter().enumerate() {
        needed[index % cosets.count].push((position, index / cosets.count));
    }
    let powers = (0..cosets.count)
        .filter(|coset| !needed[*coset].is_empty())
        .map(|coset| cosets.powers(coset))
        .collect::<Result<Vec<_>, _>>()?;
    let columns = collect_bounded_parallel_columns_v1(width, |column| {
        let column_coefficients = coefficients(column)?;
        let mut scratch = zeroize::Zeroizing::new(Vec::new());
        scratch
            .try_reserve_exact(cosets.coset_size)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        scratch.resize(cosets.coset_size, V::default());
        let mut values = zeroize::Zeroizing::new(Vec::new());
        values
            .try_reserve_exact(indices.len())
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        values.resize(indices.len(), V::default());
        for coset in &powers {
            super::fft::coset_evaluate_folded_into(
                &column_coefficients,
                &coset.powers,
                coset.wrap,
                cosets.coset_root,
                &mut scratch,
            );
            for (position, row) in &needed[coset.coset] {
                values[*position] = scratch[*row];
            }
        }
        Ok(values)
    })?;
    for (position, index) in indices.iter().enumerate() {
        let mut row = Vec::new();
        row.try_reserve_exact(width)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        row.extend(columns.iter().map(|column| column[position]));
        rows.insert(*index, row);
    }
    Ok(rows)
}
/// [`values_at_lde_indices_with_v1`] for retained coefficient columns.
fn values_at_lde_indices_v1<V: super::fft::FftValue>(
    coefficients: &[Vec<V>],
    indices: &[usize],
    cosets: &LdeCosetsV1,
) -> Result<aggregate::ZeroizingOpenedRowsV1<V>, ProofManagedNoteStarkErrorV1> {
    values_at_lde_indices_with_v1(
        coefficients.len(),
        |column| {
            let mut retained = zeroize::Zeroizing::new(Vec::new());
            retained.try_reserve_exact(coefficients[column].len())
                .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
            retained.extend_from_slice(&coefficients[column]);
            Ok(retained)
        },
        indices,
        cosets,
    )
}
/// Masked trace rows at sorted unique LDE indices, re-interpolated from native columns.
///
/// Each worker rebuilds one column's masked coefficients from its native values and replayable
/// mask, so retained trace coefficients can be released before queries are known.
fn masked_rows_at_lde_indices_v1(
    columns: &[Vec<F>],
    masks: &[ReplayableTraceMaskV1],
    trace_log2: u8,
    indices: &[usize],
    cosets: &LdeCosetsV1,
) -> Result<aggregate::ZeroizingOpenedRowsV1<F>, ProofManagedNoteStarkErrorV1> {
    if columns.len() != masks.len() {
        return Err(ProofManagedNoteStarkErrorV1::Internal);
    }
    values_at_lde_indices_with_v1(
        columns.len(),
        |column| {
            masked_trace_coefficients_with_mask_v1(
                &columns[column],
                trace_log2,
                masks[column].coefficients(),
            )
            .map(zeroize::Zeroizing::new)
            .map_err(map_transparent_error_v1)
        },
        indices,
        cosets,
    )
}
fn evaluate_base_coefficients_at_fp4_v1(coefficients: &[F], point: E) -> E {
    coefficients
        .iter()
        .rev()
        .copied()
        .fold(E::ZERO, |value, coefficient| {
            value.mul(point).add(E::from_base(coefficient))
        })
}
/// `(z^n - 1) / n * omega^i / (z - omega^i)` for every native row, or `None`
/// when `z` lies in the native subgroup.
fn barycentric_weights_v1(point: E, trace_log2: u8, native_root: F) -> Option<Vec<E>> {
    let size = 1_usize << trace_log2;
    let scale = point
        .pow(size as u128)
        .sub(E::ONE)
        .mul_base(F::reduce(size as u128).inv()?);
    let mut weights = vec![E::ZERO; size];
    const BLOCK: usize = 1 << 12;
    let ok = weights
        .par_chunks_mut(BLOCK)
        .enumerate()
        .map(|(block, chunk)| {
            let mut root_power = native_root.pow((block * BLOCK) as u128);
            let mut powers = Vec::with_capacity(chunk.len());
            for slot in chunk.iter_mut() {
                *slot = point.sub(E::from_base(root_power));
                powers.push(root_power);
                root_power = root_power.mul(native_root);
            }
            if chunk.iter().any(|value| *value == E::ZERO) {
                return false;
            }
            if aggregate::batch_invert_fp4_nonzero_v1(chunk).is_err() {
                return false;
            }
            for (slot, power) in chunk.iter_mut().zip(powers) {
                *slot = slot.mul_base(power).mul(scale);
            }
            true
        })
        .collect::<Vec<_>>()
        .into_iter()
        .all(|ok| ok);
    ok.then_some(weights)
}
fn evaluate_masked_native_columns_at_deep_v1(
    columns: &[Vec<F>],
    masks: &[ReplayableTraceMaskV1],
    trace_log2: u8,
    point: E,
) -> Result<(Vec<E>, Vec<E>), ProofManagedNoteStarkErrorV1> {
    let trace_size = checked_trace_size_v1(trace_log2)?;
    if columns.is_empty()
        || columns.len() != masks.len()
        || columns.iter().any(|column| column.len() != trace_size)
        || masks
            .iter()
            .any(|mask| mask.coefficients().len() != PROOF_MANAGED_NOTE_MASK_DEGREE_V1 + 1)
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    let native_root = goldilocks_primitive_root_v1(trace_log2).map_err(map_transparent_error_v1)?;
    let next_point = point.mul_base(native_root);
    let (Some(current_weights), Some(next_weights)) = (
        barycentric_weights_v1(point, trace_log2, native_root),
        barycentric_weights_v1(next_point, trace_log2, native_root),
    ) else {
        return evaluate_masked_native_columns_by_coefficients_v1(
            columns, masks, trace_log2, point,
        );
    };
    // The interpolant of the native column is evaluated exactly by its barycentric
    // form; the randomizer adds `(X^n - 1) r(X)` as in the coefficient path.
    let inner = |values: &[F], weights: &[E]| {
        let mut lanes = [0_u128; 4];
        for (value, weight) in values.iter().zip(weights) {
            let value = u128::from(value.0);
            for (lane, coefficient) in lanes.iter_mut().zip(weight.coefficients()) {
                *lane += u128::from(F::reduce(u128::from(coefficient.0) * value).0);
            }
        }
        E::from_coefficients(lanes.map(F::reduce)).expect("reduced residues")
    };
    let current_vanishing = point.pow(trace_size as u128).sub(E::ONE);
    let next_vanishing = next_point.pow(trace_size as u128).sub(E::ONE);
    let evaluations = collect_bounded_parallel_columns_v1(columns.len(), |column_index| {
        let column = &columns[column_index];
        let mask = masks[column_index].coefficients();
        let current = inner(column, &current_weights).add(
            current_vanishing.mul(evaluate_base_coefficients_at_fp4_v1(mask, point)),
        );
        let next = inner(column, &next_weights).add(
            next_vanishing.mul(evaluate_base_coefficients_at_fp4_v1(mask, next_point)),
        );
        Ok((current, next))
    })?;
    Ok(evaluations.into_iter().unzip())
}
fn evaluate_masked_native_columns_by_coefficients_v1(
    columns: &[Vec<F>],
    masks: &[ReplayableTraceMaskV1],
    trace_log2: u8,
    point: E,
) -> Result<(Vec<E>, Vec<E>), ProofManagedNoteStarkErrorV1> {
    let trace_size = checked_trace_size_v1(trace_log2)?;
    if columns.is_empty()
        || columns.len() != masks.len()
        || columns.iter().any(|column| column.len() != trace_size)
        || masks
            .iter()
            .any(|mask| mask.coefficients().len() != PROOF_MANAGED_NOTE_MASK_DEGREE_V1 + 1)
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    let native_root = goldilocks_primitive_root_v1(trace_log2).map_err(map_transparent_error_v1)?;
    let next_point = point.mul_base(native_root);
    let mut current = Vec::new();
    let mut next = Vec::new();
    current
        .try_reserve_exact(columns.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    next.try_reserve_exact(columns.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    // Columns are independent and occupy fixed output indices. The temporary coefficient copy is
    // owned by one worker and is zeroized before that worker returns on both success and failure.
    // Results are reduced serially in column order so malformed inputs retain deterministic error
    // precedence as well as deterministic successful output.
    let evaluations = collect_bounded_parallel_columns_v1(columns.len(), |column_index| {
        let column = &columns[column_index];
        let mask = &masks[column_index];
        let mut trace_coefficients = ZeroizingBaseFieldValuesV1::from(Vec::new());
        trace_coefficients
            .0
            .try_reserve_exact(column.len())
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        trace_coefficients.0.extend_from_slice(column);
        goldilocks_ifft_v1(&mut trace_coefficients, native_root)
            .map_err(map_transparent_error_v1)?;
        let evaluate = |evaluation_point| {
            let trace = evaluate_base_coefficients_at_fp4_v1(&trace_coefficients, evaluation_point);
            let randomizer =
                evaluate_base_coefficients_at_fp4_v1(mask.coefficients(), evaluation_point);
            trace.add(
                evaluation_point
                    .pow(trace_size as u128)
                    .sub(E::ONE)
                    .mul(randomizer),
            )
        };
        Ok((evaluate(point), evaluate(next_point)))
    })?;
    for (current_value, next_value) in evaluations {
        current.push(current_value);
        next.push(next_value);
    }
    Ok((current, next))
}
fn new_note_transcript_v1(
    prepared: &PreparedNoteProfileV1,
    public_digest: &GoldilocksDigest384V1,
) -> Result<TransparentTranscriptV1, ProofManagedNoteStarkErrorV1> {
    let profile_digest = proof_managed_note_stark_profile_digest_v1(
        prepared.protocol.domains,
        prepared.protocol.profile_descriptor,
    )?;
    let geometry_digest = proof_managed_note_stark_geometry_digest_v1(prepared.protocol.domains)?;
    let geometry_digest = geometry_digest.to_le_bytes();
    let mut transcript = TransparentTranscriptV1::new(
        prepared.protocol.domains.digest_context,
        PROOF_MANAGED_NOTE_STARK_SUITE_V1,
        &profile_digest,
        public_digest,
    )
    .map_err(map_transparent_error_v1)?;
    let maximum_constraint_degree = [prepared.protocol.maximum_constraint_degree];
    transcript
        .absorb(
            NOTE_SHARED_PROFILE_BINDING_LABEL_V1,
            &[
                PROOF_MANAGED_NOTE_STARK_GEOMETRY_DESCRIPTOR_V1,
                &geometry_digest,
            ],
        )
        .map_err(map_transparent_error_v1)?;
    transcript
        .absorb(
            prepared.protocol.profile_binding_label,
            &[
                prepared.protocol.profile_descriptor,
                &maximum_constraint_degree,
            ],
        )
        .map_err(map_transparent_error_v1)?;
    aggregate::absorb_layout_v1(
        &mut transcript,
        prepared.protocol.parameters,
        prepared.protocol.domains,
        prepared.protocol.relation_layout_domain,
        &prepared.layout,
    )
    .map_err(map_aggregate_error_v1)?;
    Ok(transcript)
}
fn challenge_extension_vector_v1(
    transcript: &mut TransparentTranscriptV1,
    label: &[u8],
    count: usize,
) -> Result<Vec<E>, ProofManagedNoteStarkErrorV1> {
    (0..count)
        .map(|_| {
            transcript
                .challenge_fp4(label)
                .map_err(map_transparent_error_v1)
        })
        .collect()
}
fn derive_constraint_alphas_v1(
    transcript: &mut TransparentTranscriptV1,
    constraint_count: usize,
) -> Result<Vec<Vec<E>>, ProofManagedNoteStarkErrorV1> {
    (0..PROOF_MANAGED_NOTE_SECURITY_LANES_V1)
        .map(|_| {
            challenge_extension_vector_v1(
                transcript,
                NOTE_CONSTRAINT_ALPHA_LABEL_V1,
                constraint_count,
            )
        })
        .collect()
}
fn derive_deep_mixes_v1(
    transcript: &mut TransparentTranscriptV1,
    base_width: usize,
    aux_width: usize,
    composition_degree_chunks: usize,
    parameters: aggregate::AggregateStarkParametersV1,
    layout: &aggregate::AggregateProofLayoutV1,
) -> Result<Vec<aggregate::AggregateDeepLaneMixV1>, ProofManagedNoteStarkErrorV1> {
    let mixes = (0..PROOF_MANAGED_NOTE_SECURITY_LANES_V1)
        .map(|_| {
            Ok(aggregate::AggregateDeepLaneMixV1 {
                trace_groups: vec![aggregate::AggregateDeepTraceGroupMixV1 {
                    base_current: challenge_extension_vector_v1(
                        transcript,
                        NOTE_DEEP_BASE_CURRENT_MIX_LABEL_V1,
                        base_width,
                    )?,
                    base_next: challenge_extension_vector_v1(
                        transcript,
                        NOTE_DEEP_BASE_NEXT_MIX_LABEL_V1,
                        base_width,
                    )?,
                    aux_current: challenge_extension_vector_v1(
                        transcript,
                        NOTE_DEEP_AUX_CURRENT_MIX_LABEL_V1,
                        aux_width,
                    )?,
                    aux_next: challenge_extension_vector_v1(
                        transcript,
                        NOTE_DEEP_AUX_NEXT_MIX_LABEL_V1,
                        aux_width,
                    )?,
                }],
                composition: challenge_extension_vector_v1(
                    transcript,
                    NOTE_DEEP_COMPOSITION_MIX_LABEL_V1,
                    composition_degree_chunks,
                )?,
            })
        })
        .collect::<Result<Vec<_>, ProofManagedNoteStarkErrorV1>>()?;
    aggregate::validate_deep_lane_mixes_v1(&mixes, parameters, layout)
        .map_err(map_aggregate_error_v1)?;
    Ok(mixes)
}
fn all_constraint_residues_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
    prepared: &PreparedNoteProfileV1,
    current_base: &[F],
    next_base: &[F],
    current_aux: &[F],
    next_aux: &[F],
    fixed: &[F],
    profile_challenges: &A::ProfileChallenges,
) -> Result<ZeroizingBaseFieldValuesV1, ProofManagedNoteStarkErrorV1> {
    if current_base.len() != prepared.base_width
        || next_base.len() != prepared.base_width
        || current_aux.len() != prepared.aux_width
        || next_aux.len() != prepared.aux_width
        || fixed.len() != prepared.fixed_width
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    let residues = ZeroizingBaseFieldValuesV1::from(adapter.profile_constraint_residues_v1(
        current_base,
        next_base,
        current_aux,
        next_aux,
        fixed,
        profile_challenges,
    )?);
    if residues.len() != prepared.constraint_count {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    Ok(residues)
}
fn validate_native_constraints_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
    prepared: &PreparedNoteProfileV1,
    base_columns: &[Vec<F>],
    aux_columns: &[Vec<F>],
    profile_challenges: &A::ProfileChallenges,
) -> Result<(), ProofManagedNoteStarkErrorV1> {
    // Native rows are immutable and independently constrained. Indexed collection plus serial
    // reduction retains the lowest-row error while successful validation has no output ordering
    // to perturb.
    let results = (0..prepared.trace_size)
        .into_par_iter()
        .map(|row| -> Result<(), ProofManagedNoteStarkErrorV1> {
            let next = (row + 1) % prepared.trace_size;
            let current_base =
                ZeroizingBaseFieldValuesV1::from(row_at_columns_v1(base_columns, row)?);
            let next_base =
                ZeroizingBaseFieldValuesV1::from(row_at_columns_v1(base_columns, next)?);
            let current_aux =
                ZeroizingBaseFieldValuesV1::from(row_at_columns_v1(aux_columns, row)?);
            let next_aux = ZeroizingBaseFieldValuesV1::from(row_at_columns_v1(aux_columns, next)?);
            let fixed =
                ZeroizingBaseFieldValuesV1::from(row_at_columns_v1(&prepared.fixed_columns, row)?);
            let residues = all_constraint_residues_v1(
                adapter,
                prepared,
                &current_base,
                &next_base,
                &current_aux,
                &next_aux,
                &fixed,
                profile_challenges,
            )?;
            if residues.iter().any(|residue| *residue != F::ZERO) {
                return Err(ProofManagedNoteStarkErrorV1::Constraint);
            }
            Ok(())
        })
        .collect::<Vec<_>>();
    results.into_iter().collect()
}
#[cfg(test)]
fn composition_lanes_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
    prepared: &PreparedNoteProfileV1,
    base_lde: &[Vec<F>],
    aux_lde: &[Vec<F>],
    fixed_lde: &[Vec<F>],
    profile_challenges: &A::ProfileChallenges,
    alphas: &[Vec<E>],
) -> Result<(Vec<Vec<Vec<E>>>, Vec<Vec<Vec<E>>>), ProofManagedNoteStarkErrorV1> {
    if alphas.len() != PROOF_MANAGED_NOTE_SECURITY_LANES_V1
        || alphas
            .iter()
            .any(|lane| lane.len() != prepared.constraint_count)
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    let lde_size = prepared.layout.common_lde_size();
    canonical_columns_v1(base_lde, prepared.base_width, lde_size)?;
    canonical_columns_v1(aux_lde, prepared.aux_width, lde_size)?;
    canonical_columns_v1(fixed_lde, prepared.fixed_width, lde_size)?;
    // The honest quotient has degree at most `d (n + mask) - n`. When that is below half
    // the LDE size, its values on the even-index half of the coset determine the same
    // coefficients, so only that half is evaluated. Commitments are unchanged.
    let maximum_quotient_degree = maximum_quotient_degree_v1(
        prepared.trace_size,
        prepared.protocol.maximum_constraint_degree,
    )?;
    let evaluation_stride = if maximum_quotient_degree < lde_size / 2
        && (lde_size / prepared.trace_size) % 2 == 0
    {
        2
    } else {
        1
    };
    let evaluated_size = lde_size / evaluation_stride;
    let lde_root = goldilocks_primitive_root_v1(prepared.layout.common_lde_log2())
        .map_err(map_transparent_error_v1)?;
    let next_stride = prepared
        .layout
        .trace_groups()
        .first()
        .ok_or(ProofManagedNoteStarkErrorV1::Internal)?
        .next_stride(prepared.layout.common_lde_log2())
        .map_err(map_aggregate_error_v1)?;
    let mut lanes = ZeroizingExtensionFieldMatrixV1::from(
        (0..PROOF_MANAGED_NOTE_SECURITY_LANES_V1)
            .map(|_| Vec::new())
            .collect::<Vec<_>>(),
    );
    for lane in lanes.iter_mut() {
        lane.try_reserve_exact(evaluated_size)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    }
    // x^n - 1 on the LDE coset takes only `lde / n` distinct values, indexed by row modulo
    // that ratio: x_i^n = g^n * omega_lde^(i * n). Invert each once.
    let ratio = lde_size / prepared.trace_size;
    let shift_power = F(GOLDILOCKS_GENERATOR_V1).pow(prepared.trace_size as u128);
    let ratio_root = lde_root.pow(prepared.trace_size as u128);
    let mut inverse_vanishing = Vec::with_capacity(ratio);
    let mut point = shift_power;
    for _ in 0..ratio {
        inverse_vanishing.push(
            point
                .sub(F::ONE)
                .inv()
                .ok_or(ProofManagedNoteStarkErrorV1::Internal)?,
        );
        point = point.mul(ratio_root);
    }
    let evaluators = alphas
        .iter()
        .map(|lane| adapter.prepare_constraint_sum_v1(profile_challenges, lane))
        .collect::<Result<Vec<_>, _>>()?;
    let (base_width, aux_width, fixed_width) =
        (prepared.base_width, prepared.aux_width, prepared.fixed_width);
    let gather = |columns: &[Vec<F>], index: usize, out: &mut [F]| {
        for (slot, column) in out.iter_mut().zip(columns) {
            *slot = column[index];
        }
    };
    for lane in lanes.iter_mut() {
        lane.resize(evaluated_size, E::ZERO);
    }
    let mut lane_slices = lanes.iter_mut().map(|lane| lane.as_mut_slice()).collect::<Vec<_>>();
    if lane_slices.len() != 1 {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    let output = lane_slices.pop().ok_or(ProofManagedNoteStarkErrorV1::Internal)?;
    let evaluator = &evaluators[0];
    const COMPOSITION_ROWS_PER_TASK: usize = 1 << 10;
    // Rows are independent and written to disjoint indexed slots; errors keep row order.
    let outcomes = output
        .par_chunks_mut(COMPOSITION_ROWS_PER_TASK)
        .enumerate()
        .map(|(task, slots)| -> Result<(), ProofManagedNoteStarkErrorV1> {
            // Witness-derived row scratch is reused per task and zeroized on drop.
            let mut current_base = ZeroizingBaseFieldValuesV1::from(vec![F::ZERO; base_width]);
            let mut next_base = ZeroizingBaseFieldValuesV1::from(vec![F::ZERO; base_width]);
            let mut current_aux = ZeroizingBaseFieldValuesV1::from(vec![F::ZERO; aux_width]);
            let mut next_aux = ZeroizingBaseFieldValuesV1::from(vec![F::ZERO; aux_width]);
            let mut fixed = ZeroizingBaseFieldValuesV1::from(vec![F::ZERO; fixed_width]);
            for (local, slot) in slots.iter_mut().enumerate() {
                let index = (task * COMPOSITION_ROWS_PER_TASK + local) * evaluation_stride;
                let next = (index + next_stride) % lde_size;
                gather(base_lde, index, &mut current_base);
                gather(base_lde, next, &mut next_base);
                gather(aux_lde, index, &mut current_aux);
                gather(aux_lde, next, &mut next_aux);
                gather(fixed_lde, index, &mut fixed);
                let numerator = evaluator.constraint_sum_v1(
                    &current_base,
                    &next_base,
                    &current_aux,
                    &next_aux,
                    &fixed,
                )?;
                *slot = numerator.mul_base(inverse_vanishing[index % ratio]);
            }
            Ok(())
        })
        .collect::<Vec<_>>();
    for outcome in outcomes {
        outcome?;
    }
    let mut compositions = ZeroizingExtensionFieldCubeV1(Vec::new());
    let mut coefficients = ZeroizingExtensionFieldCubeV1(Vec::new());
    compositions
        .try_reserve_exact(lanes.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    coefficients
        .try_reserve_exact(lanes.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    for lane in lanes.iter() {
        let (codewords, chunk_coefficients) =
            aggregate::split_composition_evaluations_with_coefficients_v1(
                lane,
                prepared.protocol.parameters,
                &prepared.layout,
            )
            .map_err(map_aggregate_error_v1)?;
        compositions.push(codewords);
        coefficients.push(chunk_coefficients);
    }
    Ok((compositions.into_inner(), coefficients.into_inner()))
}
/// `composition_lanes_v1` evaluated one LDE coset at a time from retained coefficients.
///
/// The evaluated points are the same: every coset whose residue `r` is a multiple of the
/// evaluation stride, whose rows land at evaluated indices `(r + K j) / stride`. Next rows of
/// coset `r` are the same rows of coset `r + B`, so the cosets of each residue modulo `B` are
/// visited as a chain `r, r + B, ...` holding only the chain's first, current and next cosets;
/// the last coset's next rows are the first coset's rows shifted by one. `x^n - 1` is constant
/// on each native-size coset and hence on every smaller coset inside it.
fn composition_lanes_from_cosets_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
    prepared: &PreparedNoteProfileV1,
    cosets: &LdeCosetsV1,
    base_coefficients: &[Vec<F>],
    aux_coefficients: &[Vec<F>],
    fixed_coefficients: &[Vec<F>],
    profile_challenges: &A::ProfileChallenges,
    alphas: &[Vec<E>],
) -> Result<ZeroizingExtensionFieldMatrixV1, ProofManagedNoteStarkErrorV1> {
    if alphas.len() != PROOF_MANAGED_NOTE_SECURITY_LANES_V1
        || alphas
            .iter()
            .any(|lane| lane.len() != prepared.constraint_count)
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    let lde_size = prepared.layout.common_lde_size();
    if base_coefficients.len() != prepared.base_width
        || aux_coefficients.len() != prepared.aux_width
        || fixed_coefficients.len() != prepared.fixed_width
        || cosets.lde_size() != lde_size
        || cosets.trace_size != prepared.trace_size
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    let maximum_quotient_degree = maximum_quotient_degree_v1(
        prepared.trace_size,
        prepared.protocol.maximum_constraint_degree,
    )?;
    let evaluation_stride =
        if maximum_quotient_degree < lde_size / 2 && (lde_size / prepared.trace_size) % 2 == 0 {
            2
        } else {
            1
        };
    let next_stride = prepared
        .layout
        .trace_groups()
        .first()
        .ok_or(ProofManagedNoteStarkErrorV1::Internal)?
        .next_stride(prepared.layout.common_lde_log2())
        .map_err(map_aggregate_error_v1)?;
    if next_stride != cosets.blowup || cosets.count % cosets.blowup != 0 {
        return Err(ProofManagedNoteStarkErrorV1::Internal);
    }
    let chain = cosets.count / cosets.blowup;
    let rows = cosets.coset_size;
    let evaluated_size = lde_size / evaluation_stride;
    let slots_per_row = cosets.count / evaluation_stride;
    let mut lanes = ZeroizingExtensionFieldMatrixV1::from(
        (0..PROOF_MANAGED_NOTE_SECURITY_LANES_V1)
            .map(|_| Vec::new())
            .collect::<Vec<_>>(),
    );
    for lane in lanes.iter_mut() {
        lane.try_reserve_exact(evaluated_size)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        lane.resize(evaluated_size, E::ZERO);
    }
    let evaluators = alphas
        .iter()
        .map(|lane| adapter.prepare_constraint_sum_v1(profile_challenges, lane))
        .collect::<Result<Vec<_>, _>>()?;
    let (base_width, aux_width, fixed_width) = (
        prepared.base_width,
        prepared.aux_width,
        prepared.fixed_width,
    );
    // Chain-first, current and next cosets of the trace oracles; one coset of fixed values.
    let mut base_window = [
        coset_scratch_v1(base_width, rows)?,
        coset_scratch_v1(base_width, rows)?,
        coset_scratch_v1(base_width, rows)?,
    ];
    let mut aux_window = [
        coset_scratch_v1(aux_width, rows)?,
        coset_scratch_v1(aux_width, rows)?,
        coset_scratch_v1(aux_width, rows)?,
    ];
    let mut fixed_scratch = coset_scratch_v1(fixed_width, rows)?;
    let gather = |columns: &[Vec<F>], index: usize, out: &mut [F]| {
        for (slot, column) in out.iter_mut().zip(columns) {
            *slot = column[index];
        }
    };
    let mut lane_slices = lanes
        .iter_mut()
        .map(|lane| lane.as_mut_slice())
        .collect::<Vec<_>>();
    if lane_slices.len() != 1 {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    let output = lane_slices
        .pop()
        .ok_or(ProofManagedNoteStarkErrorV1::Internal)?;
    let evaluator = &evaluators[0];
    const COMPOSITION_ROWS_PER_TASK: usize = 1 << 10;
    for residue in (0..cosets.blowup).step_by(evaluation_stride) {
        let mut current_powers = cosets.powers(residue)?;
        cosets.evaluate(base_coefficients, &current_powers, &mut base_window[0])?;
        cosets.evaluate(aux_coefficients, &current_powers, &mut aux_window[0])?;
        let mut current = 0;
        for step in 0..chain {
            let coset = residue + cosets.blowup * step;
            let next_powers = (step + 1 < chain)
                .then(|| cosets.powers(coset + cosets.blowup))
                .transpose()?;
            let (next, wrap) = if let Some(powers) = &next_powers {
                let slot = if current == 1 { 2 } else { 1 };
                cosets.evaluate(base_coefficients, powers, &mut base_window[slot])?;
                cosets.evaluate(aux_coefficients, powers, &mut aux_window[slot])?;
                (slot, 0)
            } else {
                (0, 1)
            };
            cosets.evaluate(fixed_coefficients, &current_powers, &mut fixed_scratch)?;
            // `x^n = s^n` on the native-size coset containing this coset.
            let inverse_vanishing = F(GOLDILOCKS_GENERATOR_V1)
                .mul(cosets.lde_root.pow(coset as u128))
                .pow(prepared.trace_size as u128)
                .sub(F::ONE)
                .inv()
                .ok_or(ProofManagedNoteStarkErrorV1::Internal)?;
            let (current_base, next_base) = (&*base_window[current], &*base_window[next]);
            let (current_aux, next_aux) = (&*aux_window[current], &*aux_window[next]);
            let fixed = &*fixed_scratch;
            let slot_in_row = coset / evaluation_stride;
            // Rows are independent and written to disjoint indexed slots; errors keep row order.
            let outcomes = output
                .par_chunks_mut(COMPOSITION_ROWS_PER_TASK * slots_per_row)
                .enumerate()
                .map(
                    |(task, slots)| -> Result<(), ProofManagedNoteStarkErrorV1> {
                        // Witness-derived row scratch is reused per task and zeroized on drop.
                        let mut row_base =
                            ZeroizingBaseFieldValuesV1::from(vec![F::ZERO; base_width]);
                        let mut row_next_base =
                            ZeroizingBaseFieldValuesV1::from(vec![F::ZERO; base_width]);
                        let mut row_aux =
                            ZeroizingBaseFieldValuesV1::from(vec![F::ZERO; aux_width]);
                        let mut row_next_aux =
                            ZeroizingBaseFieldValuesV1::from(vec![F::ZERO; aux_width]);
                        let mut row_fixed =
                            ZeroizingBaseFieldValuesV1::from(vec![F::ZERO; fixed_width]);
                        for (local, row_slots) in slots.chunks_mut(slots_per_row).enumerate() {
                            let row = task * COMPOSITION_ROWS_PER_TASK + local;
                            let next_row = (row + wrap) % rows;
                            gather(current_base, row, &mut row_base);
                            gather(next_base, next_row, &mut row_next_base);
                            gather(current_aux, row, &mut row_aux);
                            gather(next_aux, next_row, &mut row_next_aux);
                            gather(fixed, row, &mut row_fixed);
                            let numerator = evaluator.constraint_sum_v1(
                                &row_base,
                                &row_next_base,
                                &row_aux,
                                &row_next_aux,
                                &row_fixed,
                            )?;
                            row_slots[slot_in_row] = numerator.mul_base(inverse_vanishing);
                        }
                        Ok(())
                    },
                )
                .collect::<Vec<_>>();
            for outcome in outcomes {
                outcome?;
            }
            current = next;
            if let Some(powers) = next_powers {
                current_powers = powers;
            }
        }
    }
    drop(lane_slices);
    Ok(lanes)
}
/// Exact quotient `(P(X) - value) / (X - point)` by synthetic division.
/// Rejects inconsistent openings and preserves recoverable allocation failures.
fn divide_by_linear_v1(
    coefficients: &[E],
    value: E,
    point: E,
) -> Result<ZeroizingExtensionFieldValuesV1, ProofManagedNoteStarkErrorV1> {
    let (constant, higher) = coefficients
        .split_first()
        .ok_or(ProofManagedNoteStarkErrorV1::Internal)?;
    let mut quotient = ZeroizingExtensionFieldValuesV1(Vec::new());
    quotient
        .0
        .try_reserve_exact(higher.len())
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    quotient.0.resize(higher.len(), E::ZERO);
    let mut carry = E::ZERO;
    for (slot, coefficient) in quotient.0.iter_mut().zip(higher).rev() {
        carry = coefficient.add(carry.mul(point));
        *slot = carry;
    }
    if constant.add(carry.mul(point)) != value {
        return Err(ProofManagedNoteStarkErrorV1::Internal);
    }
    Ok(quotient)
}
/// `mixed_deep_fri_base_v1` computed in coefficient space.
///
/// With `P_cur = sum_c m_c f_c + sum_k mu_k H_k` and `P_next = sum_c m'_c f_c`, the pointwise
/// quotient is `Q = (P_cur - P_cur(z)) / (X - z) + (P_next - P_next(z w)) / (X - z w)`. The
/// opened values are exact evaluations of these polynomials, so both divisions are exact and
/// `Q` agrees with the pointwise quotient at every LDE point. Mixing trace coefficients, two
/// synthetic divisions and one extension-field coset transform replace a pass over every trace
/// column on the full domain.
///
/// `trace_column(c)` supplies the masked coefficients of base columns `0..base_width` and then
/// auxiliary columns, each of `trace_len` coefficients; bounded batches of columns are
/// requested in order, so callers may rebuild each column on demand.
#[allow(clippy::too_many_arguments)]
fn mixed_deep_fri_base_from_coefficients_v1(
    base_width: usize,
    aux_width: usize,
    trace_len: usize,
    trace_column: impl Fn(usize) -> Result<zeroize::Zeroizing<Vec<F>>, ProofManagedNoteStarkErrorV1>
    + Sync,
    composition_coefficients: &[Vec<E>],
    deep: &aggregate::AggregateDeepProofV1,
    deep_point: E,
    mix: &aggregate::AggregateDeepLaneMixV1,
    lane: usize,
    parameters: aggregate::AggregateStarkParametersV1,
    layout: &aggregate::AggregateProofLayoutV1,
) -> Result<Vec<E>, ProofManagedNoteStarkErrorV1> {
    aggregate::validate_deep_proof_shape_v1(deep, parameters, layout)
        .map_err(map_aggregate_error_v1)?;
    let deep_trace = aggregate::canonical_deep_trace_groups_v1(deep, parameters, layout)
        .map_err(map_aggregate_error_v1)?
        .into_iter()
        .next()
        .ok_or(ProofManagedNoteStarkErrorV1::Internal)?;
    let deep_composition = aggregate::canonical_fp4_fields_v1(
        deep.composition_values
            .get(lane)
            .ok_or(ProofManagedNoteStarkErrorV1::Internal)?,
        parameters.composition_degree_chunks,
    )
    .map_err(map_aggregate_error_v1)?;
    let trace_mix = mix
        .trace_groups
        .first()
        .filter(|_| mix.trace_groups.len() == 1)
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    let lde_size = layout.common_lde_size();
    let composition_len = composition_coefficients
        .iter()
        .map(Vec::len)
        .max()
        .unwrap_or(0);
    let length = trace_len.max(composition_len);
    if base_width == 0
        || trace_len == 0
        || base_width != trace_mix.base_current.len()
        || base_width != trace_mix.base_next.len()
        || aux_width != trace_mix.aux_current.len()
        || aux_width != trace_mix.aux_next.len()
        || composition_coefficients.len() != mix.composition.len()
        || deep_trace.base_current.len() != base_width
        || deep_trace.base_next.len() != base_width
        || deep_trace.aux_current.len() != aux_width
        || deep_trace.aux_next.len() != aux_width
        || deep_composition.len() != composition_coefficients.len()
        || length > lde_size
    {
        return Err(ProofManagedNoteStarkErrorV1::Internal);
    }
    let native_log2 = layout
        .trace_groups()
        .first()
        .filter(|_| layout.trace_groups().len() == 1)
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?
        .native_trace_log2;
    let native_root =
        goldilocks_primitive_root_v1(native_log2).map_err(map_transparent_error_v1)?;
    let deep_next_point = deep_point.mul_base(native_root);
    let lde_root =
        goldilocks_primitive_root_v1(layout.common_lde_log2()).map_err(map_transparent_error_v1)?;
    let weighted_openings = |values: &[E], mixes: &[E]| {
        values
            .iter()
            .zip(mixes)
            .fold(E::ZERO, |sum, (value, mix)| sum.add(value.mul(*mix)))
    };
    let current_constant = weighted_openings(&deep_trace.base_current, &trace_mix.base_current)
        .add(weighted_openings(
            &deep_trace.aux_current,
            &trace_mix.aux_current,
        ))
        .add(weighted_openings(&deep_composition, &mix.composition));
    let next_constant = weighted_openings(&deep_trace.base_next, &trace_mix.base_next)
        .add(weighted_openings(&deep_trace.aux_next, &trace_mix.aux_next));
    let mix_words = |mixes: &[E]| -> Vec<[u128; 4]> {
        mixes
            .iter()
            .map(|mix| mix.coefficients().map(|c| u128::from(c.0)))
            .collect()
    };
    let current_mix = mix_words(&trace_mix.base_current)
        .into_iter()
        .chain(mix_words(&trace_mix.aux_current))
        .collect::<Vec<_>>();
    let next_mix = mix_words(&trace_mix.base_next)
        .into_iter()
        .chain(mix_words(&trace_mix.aux_next))
        .collect::<Vec<_>>();
    // Witness-derived mixing accumulators; reduced products below 2^64 accumulate exactly in
    // u128 for any column count below 2^64.
    let mut current_sums = zeroize::Zeroizing::new(Vec::new());
    let mut next_sums = zeroize::Zeroizing::new(Vec::new());
    for sums in [&mut current_sums, &mut next_sums] {
        sums.try_reserve_exact(trace_len)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        sums.resize(trace_len, [0_u128; 4]);
    }
    let width = base_width + aux_width;
    let batch_rows = aggregate::DEEP_FRI_BASE_BATCH_ROWS_V1;
    for batch_start in (0..width).step_by(aggregate::MASKED_TRACE_LDE_COLUMN_BATCH_V1) {
        let batch_end = (batch_start + aggregate::MASKED_TRACE_LDE_COLUMN_BATCH_V1).min(width);
        let columns = collect_bounded_parallel_columns_v1(batch_end - batch_start, |offset| {
            let column = trace_column(batch_start + offset)?;
            if column.len() != trace_len {
                return Err(ProofManagedNoteStarkErrorV1::Internal);
            }
            Ok(column)
        })?;
        let weights = &current_mix[batch_start..batch_end];
        let next_weights = &next_mix[batch_start..batch_end];
        // Coefficient batches are independent and write disjoint accumulators.
        current_sums
            .par_chunks_mut(batch_rows)
            .zip(next_sums.par_chunks_mut(batch_rows))
            .enumerate()
            .for_each(|(block, (current, next))| {
                let start = block * batch_rows;
                for ((column, current_weights), next_weights) in
                    columns.iter().zip(weights).zip(next_weights)
                {
                    for ((value, current), next) in column[start..start + current.len()]
                        .iter()
                        .zip(current.iter_mut())
                        .zip(next.iter_mut())
                    {
                        let value = u128::from(value.0);
                        for lane in 0..4 {
                            current[lane] += u128::from(F::reduce(current_weights[lane] * value).0);
                            next[lane] += u128::from(F::reduce(next_weights[lane] * value).0);
                        }
                    }
                }
            });
    }
    let to_e =
        |words: [u128; 4]| E::from_coefficients(words.map(F::reduce)).expect("reduced residues");
    let mut current = ZeroizingExtensionFieldValuesV1(Vec::new());
    let mut next = ZeroizingExtensionFieldValuesV1(Vec::new());
    for polynomial in [&mut current, &mut next] {
        polynomial
            .0
            .try_reserve_exact(length)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        polynomial.0.resize(length, E::ZERO);
    }
    current
        .0
        .par_chunks_mut(batch_rows)
        .zip(next.0.par_chunks_mut(batch_rows))
        .enumerate()
        .for_each(|(block, (current, next))| {
            let start = block * batch_rows;
            for (local, (current_slot, next_slot)) in
                current.iter_mut().zip(next.iter_mut()).enumerate()
            {
                let index = start + local;
                let mut sum = current_sums.get(index).copied().map_or(E::ZERO, to_e);
                for (chunk, coefficient) in composition_coefficients.iter().zip(&mix.composition) {
                    if let Some(value) = chunk.get(index) {
                        sum = sum.add(value.mul(*coefficient));
                    }
                }
                *current_slot = sum;
                *next_slot = next_sums.get(index).copied().map_or(E::ZERO, to_e);
            }
        });
    drop(current_sums);
    drop(next_sums);
    let current_quotient = divide_by_linear_v1(&current, current_constant, deep_point)?;
    drop(current);
    let mut quotient = divide_by_linear_v1(&next, next_constant, deep_next_point)?;
    drop(next);
    quotient
        .0
        .par_iter_mut()
        .zip(current_quotient.0.par_iter())
        .for_each(|(slot, current)| *slot = slot.add(*current));
    drop(current_quotient);
    super::fft::try_coset_evaluate(&quotient, lde_size, lde_root, F(GOLDILOCKS_GENERATOR_V1))
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)
}
fn try_for_each_ordered_deep_batch_v1<Batch>(
    rows: usize,
    mut batch: Batch,
) -> Result<(), ProofManagedNoteStarkErrorV1>
where
    Batch: FnMut(usize, usize) -> Result<(), ProofManagedNoteStarkErrorV1>,
{
    let mut start = 0_usize;
    while start < rows {
        let end = start
            .checked_add(aggregate::DEEP_FRI_BASE_BATCH_ROWS_V1)
            .map_or(rows, |end| end.min(rows));
        if end <= start {
            return Err(ProofManagedNoteStarkErrorV1::Internal);
        }
        batch(start, end)?;
        start = end;
    }
    Ok(())
}
#[cfg(test)]
#[allow(clippy::too_many_arguments)]
fn mixed_deep_fri_base_v1(
    base_lde: &[Vec<F>],
    aux_lde: &[Vec<F>],
    composition: &[Vec<E>],
    deep: &aggregate::AggregateDeepProofV1,
    deep_point: E,
    mix: &aggregate::AggregateDeepLaneMixV1,
    lane: usize,
    parameters: aggregate::AggregateStarkParametersV1,
    layout: &aggregate::AggregateProofLayoutV1,
) -> Result<Vec<E>, ProofManagedNoteStarkErrorV1> {
    aggregate::validate_deep_proof_shape_v1(deep, parameters, layout)
        .map_err(map_aggregate_error_v1)?;
    let deep_trace = aggregate::canonical_deep_trace_groups_v1(deep, parameters, layout)
        .map_err(map_aggregate_error_v1)?
        .into_iter()
        .next()
        .ok_or(ProofManagedNoteStarkErrorV1::Internal)?;
    let deep_composition = aggregate::canonical_fp4_fields_v1(
        deep.composition_values
            .get(lane)
            .ok_or(ProofManagedNoteStarkErrorV1::Internal)?,
        parameters.composition_degree_chunks,
    )
    .map_err(map_aggregate_error_v1)?;
    let trace_mix = mix
        .trace_groups
        .first()
        .filter(|_| mix.trace_groups.len() == 1)
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?;
    let rows = composition
        .first()
        .map(Vec::len)
        .ok_or(ProofManagedNoteStarkErrorV1::Internal)?;
    if base_lde.len() != trace_mix.base_current.len()
        || base_lde.len() != trace_mix.base_next.len()
        || aux_lde.len() != trace_mix.aux_current.len()
        || aux_lde.len() != trace_mix.aux_next.len()
        || composition.len() != mix.composition.len()
        || deep_trace.base_current.len() != base_lde.len()
        || deep_trace.base_next.len() != base_lde.len()
        || deep_trace.aux_current.len() != aux_lde.len()
        || deep_trace.aux_next.len() != aux_lde.len()
        || deep_composition.len() != composition.len()
        || rows != layout.common_lde_size()
        || composition.iter().any(|chunk| chunk.len() != rows)
        || base_lde
            .iter()
            .chain(aux_lde)
            .any(|column| column.len() != rows)
    {
        return Err(ProofManagedNoteStarkErrorV1::Internal);
    }
    let native_log2 = layout
        .trace_groups()
        .first()
        .filter(|_| layout.trace_groups().len() == 1)
        .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?
        .native_trace_log2;
    let native_root =
        goldilocks_primitive_root_v1(native_log2).map_err(map_transparent_error_v1)?;
    let deep_next_point = deep_point.mul_base(native_root);
    let lde_root =
        goldilocks_primitive_root_v1(layout.common_lde_log2()).map_err(map_transparent_error_v1)?;
    // The quotient is regrouped exactly:
    //   sum_c m_c (f_c(x) - a_c) / (x - z) = (sum_c m_c f_c(x) - sum_c m_c a_c) / (x - z),
    // so each trace value needs one base-by-extension product per denominator and
    // the opened values contribute one precomputed constant per denominator.
    let weighted_openings = |values: &[E], mixes: &[E]| {
        values
            .iter()
            .zip(mixes)
            .fold(E::ZERO, |sum, (value, mix)| sum.add(value.mul(*mix)))
    };
    let current_constant = weighted_openings(&deep_trace.base_current, &trace_mix.base_current)
        .add(weighted_openings(&deep_trace.aux_current, &trace_mix.aux_current))
        .add(weighted_openings(&deep_composition, &mix.composition));
    let next_constant = weighted_openings(&deep_trace.base_next, &trace_mix.base_next)
        .add(weighted_openings(&deep_trace.aux_next, &trace_mix.aux_next));
    let mix_words = |mixes: &[E]| -> Vec<[u128; 4]> {
        mixes
            .iter()
            .map(|mix| mix.coefficients().map(|c| u128::from(c.0)))
            .collect()
    };
    let current_mix = mix_words(&trace_mix.base_current)
        .into_iter()
        .chain(mix_words(&trace_mix.aux_current))
        .collect::<Vec<_>>();
    let next_mix = mix_words(&trace_mix.base_next)
        .into_iter()
        .chain(mix_words(&trace_mix.aux_next))
        .collect::<Vec<_>>();
    let trace_columns = base_lde.iter().chain(aux_lde).collect::<Vec<_>>();
    let mut result = ZeroizingExtensionFieldValuesV1(Vec::new());
    result
        .0
        .try_reserve_exact(rows)
        .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
    result.0.resize(rows, E::ZERO);
    let batch_rows = aggregate::DEEP_FRI_BASE_BATCH_ROWS_V1;
    // Batches are independent: each derives its first domain point exactly, inverts its own
    // denominators and writes disjoint output. Errors are reported in batch order.
    let outcomes = result
        .0
        .par_chunks_mut(batch_rows)
        .enumerate()
        .map(|(batch, output)| -> Result<(), ProofManagedNoteStarkErrorV1> {
            let start = batch * batch_rows;
            let mut inverse_denominators = Vec::new();
            inverse_denominators
                .try_reserve_exact(output.len() * 2)
                .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
            let exponent =
                u128::try_from(start).map_err(|_| ProofManagedNoteStarkErrorV1::Internal)?;
            let mut x = F(GOLDILOCKS_GENERATOR_V1).mul(lde_root.pow(exponent));
            for _ in 0..output.len() {
                let query_point = E::from_base(x);
                inverse_denominators.push(query_point.sub(deep_point));
                inverse_denominators.push(query_point.sub(deep_next_point));
                x = x.mul(lde_root);
            }
            aggregate::batch_invert_fp4_nonzero_v1(&mut inverse_denominators)
                .map_err(map_aggregate_error_v1)?;
            // Witness-derived DEEP accumulators are zeroized on drop.
            let mut current = zeroize::Zeroizing::new(vec![[0_u128; 4]; output.len()]);
            let mut next = zeroize::Zeroizing::new(vec![[0_u128; 4]; output.len()]);
            for ((column, current_weights), next_weights) in
                trace_columns.iter().zip(&current_mix).zip(&next_mix)
            {
                for ((value, current), next) in column[start..start + output.len()]
                    .iter()
                    .zip(current.iter_mut())
                    .zip(next.iter_mut())
                {
                    let value = u128::from(value.0);
                    for lane in 0..4 {
                        // Reduced products below 2^64 accumulate exactly in u128.
                        current[lane] +=
                            u128::from(F::reduce(current_weights[lane] * value).0);
                        next[lane] += u128::from(F::reduce(next_weights[lane] * value).0);
                    }
                }
            }
            for (local_index, quotient_slot) in output.iter_mut().enumerate() {
                let index = start + local_index;
                let to_e = |words: [u128; 4]| {
                    E::from_coefficients(words.map(F::reduce)).expect("reduced residues")
                };
                let mut current_sum = to_e(current[local_index]);
                for (chunk, coefficient) in composition.iter().zip(&mix.composition) {
                    current_sum = current_sum.add(chunk[index].mul(*coefficient));
                }
                let current_term = current_sum
                    .sub(current_constant)
                    .mul(inverse_denominators[2 * local_index]);
                let next_term = to_e(next[local_index])
                    .sub(next_constant)
                    .mul(inverse_denominators[2 * local_index + 1]);
                *quotient_slot = current_term.add(next_term);
            }
            Ok(())
        })
        .collect::<Vec<_>>();
    for outcome in outcomes {
        outcome?;
    }
    Ok(result.into_inner())
}
fn absorb_grinding_nonce_v1(
    transcript: &mut TransparentTranscriptV1,
    nonce: u64,
) -> Result<(), ProofManagedNoteStarkErrorV1> {
    transcript
        .absorb(NOTE_GRINDING_LABEL_V1, &[&nonce.to_be_bytes()])
        .map_err(map_transparent_error_v1)
}
/// Construct the sole canonical proof wire with injected masking entropy.
///
/// The caller supplies exact native base columns; the adapter reconstructs all
/// statement-derived fixed policy and deterministic auxiliary columns. The
/// emitted proof is self-verified before it is returned.
pub(crate) fn prove_proof_managed_note_stark_v1_with_rng<
    A: ProofManagedNoteStarkAdapterV1,
    R: TryRngCore,
>(
    adapter: &A,
    base_columns: &[Vec<F>],
    rng: &mut R,
) -> Result<Vec<u8>, ProofManagedNoteStarkErrorV1> {
    let mut prepared = prepare_note_profile_v1(adapter)?;
    canonical_columns_v1(base_columns, prepared.base_width, prepared.trace_size)?;
    let public_digest = adapter.public_input_digest_v1()?;
    let lde_log2 = prepared.layout.common_lde_log2();
    let lde_size = prepared.layout.common_lde_size();
    // Trace oracles are retained as masked polynomials and evaluated one bounded LDE coset at a
    // time; no full-domain trace matrix is ever resident. Queries use native-size cosets.
    let cosets = LdeCosetsV1::new(
        prepared.trace_log2,
        lde_log2,
        STREAMING_COSET_LOG2_V1.min(prepared.trace_log2),
    )?;
    let query_cosets = LdeCosetsV1::new(prepared.trace_log2, lde_log2, prepared.trace_log2)?;
    let (base_coefficients, base_masks) =
        masked_coefficient_columns_v1(base_columns, prepared.trace_log2, lde_log2, rng)?;
    let mut base_scratch = coset_scratch_v1(prepared.base_width, cosets.coset_size)?;
    let base_tree = commit_trace_cosets_v1(
        prepared.protocol.domains.digest_context,
        prepared.protocol.domains.base_leaf,
        prepared.protocol.domains.base_node,
        &base_coefficients,
        &cosets,
        &mut base_scratch,
    )?;
    let mut transcript = new_note_transcript_v1(&prepared, &public_digest)?;
    let mut trace_group_proofs = vec![aggregate::AggregateTraceGroupProofV1 {
        base_root: base_tree.root(),
        aux_root: None,
        base_frontier: Vec::new(),
        aux_frontier: Vec::new(),
    }];
    aggregate::absorb_base_roots_v1(
        &mut transcript,
        prepared.protocol.domains,
        &trace_group_proofs,
    )
    .map_err(map_aggregate_error_v1)?;
    let profile_challenges = adapter.derive_profile_challenges_v1(&mut transcript)?;
    let aux_columns = ZeroizingBaseFieldMatrixV1::from(adapter.build_profile_aux_columns_v1(
        base_columns,
        &prepared.fixed_columns,
        &profile_challenges,
    )?);
    canonical_columns_v1(&aux_columns, prepared.aux_width, prepared.trace_size)?;
    validate_native_constraints_v1(
        adapter,
        &prepared,
        base_columns,
        &aux_columns,
        &profile_challenges,
    )?;
    let (aux_coefficients, aux_masks) = if prepared.aux_width == 0 {
        // No auxiliary polynomials means no auxiliary masking entropy is consumed.
        (ZeroizingBaseFieldMatrixV1(Vec::new()), Vec::new())
    } else {
        masked_coefficient_columns_v1(&aux_columns, prepared.trace_log2, lde_log2, rng)?
    };
    let mut aux_scratch = coset_scratch_v1(prepared.aux_width, cosets.coset_size)?;
    let aux_tree = if prepared.aux_width == 0 {
        None
    } else {
        Some(commit_trace_cosets_v1(
            prepared.protocol.domains.digest_context,
            prepared.protocol.domains.aux_leaf,
            prepared.protocol.domains.aux_node,
            &aux_coefficients,
            &cosets,
            &mut aux_scratch,
        )?)
    };
    trace_group_proofs[0].aux_root = aux_tree.as_ref().map(|tree| tree.root());
    aggregate::absorb_aux_roots_v1(
        &mut transcript,
        prepared.protocol.domains,
        &prepared.layout,
        &trace_group_proofs,
    )
    .map_err(map_aggregate_error_v1)?;
    let alphas = derive_constraint_alphas_v1(&mut transcript, prepared.constraint_count)?;
    // Native fixed columns are not needed after validation and auxiliary construction, so they
    // are interpolated in place.
    // Commitment scratch is released before composition allocates its coset window.
    drop(base_scratch);
    drop(aux_scratch);
    let fixed_coefficients = fixed_coefficient_columns_v1(
        core::mem::take(&mut prepared.fixed_columns),
        prepared.trace_log2,
        lde_log2,
    )?;
    let lanes = composition_lanes_from_cosets_v1(
        adapter,
        &prepared,
        &cosets,
        &base_coefficients,
        &aux_coefficients,
        &fixed_coefficients,
        &profile_challenges,
        &alphas,
    )?;
    // Retained trace and fixed polynomials serve only commitments and composition evaluation;
    // DEEP and query openings rebuild trace columns from native values and masks. Release them
    // before splitting and before Merkle/FRI allocations.
    drop(base_coefficients);
    drop(aux_coefficients);
    drop(fixed_coefficients);
    // Only the chunk coefficients are retained; chunk codewords exist one coset at a time.
    let mut composition_coefficients = ZeroizingExtensionFieldCubeV1(Vec::new());
    for lane in lanes.iter() {
        composition_coefficients.push(
            aggregate::split_composition_coefficients_v1(
                lane,
                prepared.protocol.parameters,
                &prepared.layout,
            )
            .map_err(map_aggregate_error_v1)?,
        );
    }
    drop(lanes);
    let mut composition_trees = Vec::with_capacity(PROOF_MANAGED_NOTE_SECURITY_LANES_V1);
    let mut composition_roots = Vec::with_capacity(PROOF_MANAGED_NOTE_SECURITY_LANES_V1);
    for lane in 0..PROOF_MANAGED_NOTE_SECURITY_LANES_V1 {
        let tree = commit_composition_cosets_v1(
            prepared.protocol.domains,
            lane,
            &composition_coefficients[lane],
            &cosets,
        )?;
        composition_roots.push(tree.root());
        composition_trees.push(tree);
    }
    aggregate::absorb_composition_roots_v1(
        &mut transcript,
        prepared.protocol.parameters,
        prepared.protocol.domains,
        &composition_roots,
    )
    .map_err(map_aggregate_error_v1)?;
    let fri_masks = aggregate::build_fri_mask_oracles_v1(
        prepared.protocol.parameters,
        prepared.protocol.domains,
        &prepared.layout,
        rng,
    )
    .map_err(map_aggregate_error_v1)?;
    let fri_mask_roots = fri_masks
        .iter()
        .map(|mask| mask.tree.root())
        .collect::<Vec<_>>();
    aggregate::absorb_fri_mask_roots_v1(
        &mut transcript,
        prepared.protocol.parameters,
        prepared.protocol.domains,
        &fri_mask_roots,
    )
    .map_err(map_aggregate_error_v1)?;
    let deep_point = aggregate::derive_deep_point_v1(
        &mut transcript,
        prepared.protocol.parameters,
        &prepared.layout,
    )
    .map_err(map_aggregate_error_v1)?;
    let (base_current, base_next) = evaluate_masked_native_columns_at_deep_v1(
        base_columns,
        &base_masks,
        prepared.trace_log2,
        deep_point,
    )?;
    let (aux_current, aux_next) = if prepared.aux_width == 0 {
        (Vec::new(), Vec::new())
    } else {
        evaluate_masked_native_columns_at_deep_v1(
            &aux_columns,
            &aux_masks,
            prepared.trace_log2,
            deep_point,
        )?
    };
    let deep_compositions = aggregate::evaluate_composition_chunk_coefficients_at_deep_v1(
        &composition_coefficients,
        deep_point,
    );
    let deep = aggregate::AggregateDeepProofV1 {
        trace_groups: vec![aggregate::AggregateDeepTraceGroupOpeningV1 {
            base_current: base_current
                .into_iter()
                .map(|value| value.coefficients().map(F::value))
                .collect(),
            base_next: base_next
                .into_iter()
                .map(|value| value.coefficients().map(F::value))
                .collect(),
            aux_current: aux_current
                .into_iter()
                .map(|value| value.coefficients().map(F::value))
                .collect(),
            aux_next: aux_next
                .into_iter()
                .map(|value| value.coefficients().map(F::value))
                .collect(),
        }],
        composition_values: deep_compositions
            .into_iter()
            .map(|lane| {
                lane.into_iter()
                    .map(|value| value.coefficients().map(F::value))
                    .collect()
            })
            .collect(),
    };
    aggregate::validate_deep_proof_shape_v1(&deep, prepared.protocol.parameters, &prepared.layout)
        .map_err(map_aggregate_error_v1)?;
    aggregate::absorb_deep_openings_v1(
        &mut transcript,
        &deep,
        prepared.protocol.parameters,
        &prepared.layout,
    )
    .map_err(map_aggregate_error_v1)?;
    let mixes = derive_deep_mixes_v1(
        &mut transcript,
        prepared.base_width,
        prepared.aux_width,
        prepared.protocol.parameters.composition_degree_chunks,
        prepared.protocol.parameters,
        &prepared.layout,
    )?;
    // Every lane's DEEP quotient is formed before any FRI commitment, which binds the
    // transcript in lane order, so the retained trace polynomials can be released first.
    let mut fri_bases = Vec::with_capacity(PROOF_MANAGED_NOTE_SECURITY_LANES_V1);
    for lane in 0..PROOF_MANAGED_NOTE_SECURITY_LANES_V1 {
        let mut fri_base =
            ZeroizingExtensionFieldValuesV1::from(mixed_deep_fri_base_from_coefficients_v1(
                prepared.base_width,
                prepared.aux_width,
                prepared.trace_size + PROOF_MANAGED_NOTE_MASK_DEGREE_V1 + 1,
                |column| {
                    let (columns, masks, index) = if column < prepared.base_width {
                        (base_columns, &base_masks, column)
                    } else {
                        (&aux_columns[..], &aux_masks, column - prepared.base_width)
                    };
                    masked_trace_coefficients_with_mask_v1(
                        &columns[index],
                        prepared.trace_log2,
                        masks[index].coefficients(),
                    )
                    .map(zeroize::Zeroizing::new)
                    .map_err(map_transparent_error_v1)
                },
                &composition_coefficients[lane],
                &deep,
                deep_point,
                &mixes[lane],
                lane,
                prepared.protocol.parameters,
                &prepared.layout,
            )?);
        aggregate::add_fri_mask_oracle_v1(&mut fri_base, &fri_masks[lane])
            .map_err(map_aggregate_error_v1)?;
        fri_bases.push(fri_base);
    }
    let mut fri_lanes = Vec::with_capacity(PROOF_MANAGED_NOTE_SECURITY_LANES_V1);
    for (lane, fri_base) in fri_bases.into_iter().enumerate() {
        fri_lanes.push(
            aggregate::build_fri_lane_v1(
                prepared.protocol.parameters,
                prepared.protocol.domains,
                &prepared.layout,
                lane,
                fri_base.into_inner(),
                &mut transcript,
            )
            .map_err(map_aggregate_error_v1)?,
        );
    }
    let grinding_state = transcript.state();
    let grinding_nonce = grind_nonce_v1(
        prepared.protocol.domains.digest_context,
        &grinding_state,
        PROOF_MANAGED_NOTE_GRINDING_BITS_V1,
    )
    .map_err(map_transparent_error_v1)?;
    absorb_grinding_nonce_v1(&mut transcript, grinding_nonce)?;
    let query_indices = aggregate::query_indices_v1(
        &transcript,
        prepared.protocol.parameters,
        prepared.protocol.domains,
        &prepared.layout,
    )
    .map_err(map_aggregate_error_v1)?;
    // Query positions are fixed only now; reconstruct exactly the opened current/next rows.
    let next_stride = prepared
        .layout
        .trace_groups()
        .first()
        .ok_or(ProofManagedNoteStarkErrorV1::Internal)?
        .next_stride(lde_log2)
        .map_err(map_aggregate_error_v1)?;
    // Rows of every opened index's aligned leaf block also rebuild the trace trees' dropped
    // levels for the frontier.
    let block_indices = query_indices
        .iter()
        .flat_map(|index| [*index, (index + next_stride) % lde_size])
        .map(|index| index >> TRACE_TREE_FIRST_LEVEL_V1)
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .flat_map(|block| {
            (block << TRACE_TREE_FIRST_LEVEL_V1)..((block + 1) << TRACE_TREE_FIRST_LEVEL_V1)
        })
        .collect::<Vec<_>>();
    let trace_rows = vec![aggregate::AggregateOpenedTraceRowsV1 {
        base: masked_rows_at_lde_indices_v1(
            base_columns,
            &base_masks,
            prepared.trace_log2,
            &block_indices,
            &query_cosets,
        )?,
        aux: masked_rows_at_lde_indices_v1(
            &aux_columns,
            &aux_masks,
            prepared.trace_log2,
            &block_indices,
            &query_cosets,
        )?,
    }];
    drop(base_masks);
    drop(aux_masks);
    let base_nodes = trace_tree_nodes_v1(
        prepared.protocol.domains.digest_context,
        prepared.protocol.domains.base_leaf,
        prepared.protocol.domains.base_node,
        &base_tree,
        &trace_rows[0].base,
    )?;
    let aux_nodes = match &aux_tree {
        Some(tree) => trace_tree_nodes_v1(
            prepared.protocol.domains.digest_context,
            prepared.protocol.domains.aux_leaf,
            prepared.protocol.domains.aux_node,
            tree,
            &trace_rows[0].aux,
        )?,
        None => std::collections::BTreeMap::new(),
    };
    let mut sorted_query_indices = query_indices.clone();
    sorted_query_indices.sort_unstable();
    let composition_rows = composition_coefficients
        .iter()
        .map(|chunks| values_at_lde_indices_v1(chunks, &sorted_query_indices, &query_cosets))
        .collect::<Result<Vec<_>, _>>()?;
    drop(composition_coefficients);
    let queries = query_indices
        .into_iter()
        .map(|index| {
            aggregate::build_query_from_rows_v1(
                prepared.protocol.parameters,
                &prepared.layout,
                index,
                &trace_rows,
                &composition_rows,
                &fri_masks,
                &fri_lanes,
            )
            .map_err(map_aggregate_error_v1)
        })
        .collect::<Result<Vec<_>, _>>()?;
    drop(trace_rows);
    drop(composition_rows);
    let (trace_frontiers, composition_frontiers, fri_mask_frontiers, fri_round_frontiers) =
        aggregate::build_all_frontiers_from_trees_v1(
            prepared.protocol.parameters,
            &prepared.layout,
            &queries,
            &[(
                aggregate::MerkleNodesV1 {
                    tree: &base_tree,
                    recomputed: Some(&base_nodes),
                },
                aux_tree.as_ref().map(|tree| aggregate::MerkleNodesV1 {
                    tree,
                    recomputed: Some(&aux_nodes),
                }),
            )],
            &composition_trees,
            &fri_masks,
            &fri_lanes,
        )
        .map_err(map_aggregate_error_v1)?;
    for (group, (base_frontier, aux_frontier)) in trace_group_proofs.iter_mut().zip(trace_frontiers)
    {
        group.base_frontier = base_frontier;
        group.aux_frontier = aux_frontier;
    }
    let proof = aggregate::AggregateStarkProofV1 {
        version: prepared.protocol.parameters.proof_version,
        trace_groups: trace_group_proofs,
        composition_roots,
        composition_frontiers,
        fri_mask_roots,
        fri_mask_frontiers,
        fri_lanes: fri_lanes
            .into_iter()
            .zip(fri_round_frontiers)
            .map(
                |(lane, round_frontiers)| aggregate::AggregateFriLaneProofV1 {
                    roots: lane.roots,
                    terminal_values: lane
                        .terminal_values
                        .into_iter()
                        .map(|value| value.coefficients().map(F::value))
                        .collect(),
                    round_frontiers,
                },
            )
            .collect(),
        queries,
        grinding_nonce,
    };
    let encoded = aggregate::encode_proof_with_deep_v1(
        &proof,
        &deep,
        prepared.protocol.parameters,
        &prepared.layout,
    )
    .map_err(map_aggregate_error_v1)?;
    verify_proof_managed_note_stark_v1(adapter, &encoded)?;
    Ok(encoded)
}
/// Construct a canonical proof with operating-system masking entropy.
#[allow(dead_code)]
pub(crate) fn prove_proof_managed_note_stark_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
    base_columns: &[Vec<F>],
) -> Result<Vec<u8>, ProofManagedNoteStarkErrorV1> {
    prove_proof_managed_note_stark_v1_with_rng(adapter, base_columns, &mut rand::rngs::OsRng)
}
struct NoteOpenedRowEvaluatorV1<'a, A: ProofManagedNoteStarkAdapterV1> {
    adapter: &'a A,
    prepared: &'a PreparedNoteProfileV1,
    fixed_openings: FixedOpeningsV1<'a>,
    profile_challenges: &'a A::ProfileChallenges,
    alphas: &'a [Vec<E>],
    lde_root: F,
}
struct FixedOpeningsV1<'a>(&'a std::collections::BTreeMap<usize, Vec<F>>);
impl FixedOpeningsV1<'_> {
    fn row(&self, index: usize) -> Result<Vec<F>, ProofManagedNoteStarkErrorV1> {
        self.0
            .get(&index)
            .cloned()
            .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)
    }
}
impl<A: ProofManagedNoteStarkAdapterV1> AggregateOpenedRowEvaluatorV1
    for NoteOpenedRowEvaluatorV1<'_, A>
{
    fn evaluate_opened_row_v1(
        &mut self,
        query_index: usize,
        lane: usize,
        trace_groups: &[aggregate::AggregateOpenedTraceGroupV1],
        _composition_chunks: &[E],
    ) -> Result<aggregate::AggregateExpectedOpeningV1, aggregate::AggregateStarkErrorV1> {
        let opening = trace_groups
            .first()
            .filter(|_| trace_groups.len() == 1)
            .ok_or(aggregate::AggregateStarkErrorV1::ConstraintOpening)?;
        let alphas = self
            .alphas
            .get(lane)
            .filter(|alphas| alphas.len() == self.prepared.constraint_count)
            .ok_or(aggregate::AggregateStarkErrorV1::ConstraintOpening)?;
        let fixed = self
            .fixed_openings
            .row(query_index)
            .map_err(|_| aggregate::AggregateStarkErrorV1::ConstraintOpening)?;
        let residues = all_constraint_residues_v1(
            self.adapter,
            self.prepared,
            &opening.base_current,
            &opening.base_next,
            &opening.aux_current,
            &opening.aux_next,
            &fixed,
            self.profile_challenges,
        )
        .map_err(|_| aggregate::AggregateStarkErrorV1::ConstraintOpening)?;
        let x = F(GOLDILOCKS_GENERATOR_V1).mul(self.lde_root.pow(query_index as u128));
        let inverse_vanishing = x
            .pow(self.prepared.trace_size as u128)
            .sub(F::ONE)
            .inv()
            .ok_or(aggregate::AggregateStarkErrorV1::ConstraintOpening)?;
        let composition = residues
            .iter()
            .zip(alphas)
            .fold(E::ZERO, |sum, (residue, alpha)| {
                sum.add(alpha.mul_base(*residue))
            })
            .mul_base(inverse_vanishing);
        Ok(aggregate::AggregateExpectedOpeningV1 {
            composition,
            // The DEEP verifier derives the FRI base from all authenticated
            // trace/composition openings after this callback has checked the
            // AIR quotient. Returning zero prevents a stale raw-row mix from
            // becoming an accidental second FRI relation.
            fri_base: E::ZERO,
        })
    }
}
/// Verify the exact canonical proof wire against one statement-derived adapter.
pub(crate) fn verify_proof_managed_note_stark_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
    proof_bytes: &[u8],
) -> Result<(), ProofManagedNoteStarkErrorV1> {
    // Execution profiles can have much larger public traces than privacy
    // profiles. Reject malformed wire, transcript and Merkle paths before
    // materializing any execution fixed-column matrix.
    let prepared = prepare_note_profile_with_fixed_v1(adapter, false)?;
    let (proof, deep) = aggregate::decode_proof_with_deep_v1(
        proof_bytes,
        prepared.protocol.parameters,
        &prepared.layout,
    )
    .map_err(map_aggregate_error_v1)?;
    let public_digest = adapter.public_input_digest_v1()?;
    let mut transcript = new_note_transcript_v1(&prepared, &public_digest)?;
    aggregate::absorb_base_roots_v1(
        &mut transcript,
        prepared.protocol.domains,
        &proof.trace_groups,
    )
    .map_err(map_aggregate_error_v1)?;
    let profile_challenges = adapter.derive_profile_challenges_v1(&mut transcript)?;
    aggregate::absorb_aux_roots_v1(
        &mut transcript,
        prepared.protocol.domains,
        &prepared.layout,
        &proof.trace_groups,
    )
    .map_err(map_aggregate_error_v1)?;
    let alphas = derive_constraint_alphas_v1(&mut transcript, prepared.constraint_count)?;
    aggregate::absorb_composition_roots_v1(
        &mut transcript,
        prepared.protocol.parameters,
        prepared.protocol.domains,
        &proof.composition_roots,
    )
    .map_err(map_aggregate_error_v1)?;
    aggregate::absorb_fri_mask_roots_v1(
        &mut transcript,
        prepared.protocol.parameters,
        prepared.protocol.domains,
        &proof.fri_mask_roots,
    )
    .map_err(map_aggregate_error_v1)?;
    let deep_point = aggregate::derive_deep_point_v1(
        &mut transcript,
        prepared.protocol.parameters,
        &prepared.layout,
    )
    .map_err(map_aggregate_error_v1)?;
    aggregate::absorb_deep_openings_v1(
        &mut transcript,
        &deep,
        prepared.protocol.parameters,
        &prepared.layout,
    )
    .map_err(map_aggregate_error_v1)?;
    let mixes = derive_deep_mixes_v1(
        &mut transcript,
        prepared.base_width,
        prepared.aux_width,
        prepared.protocol.parameters.composition_degree_chunks,
        prepared.protocol.parameters,
        &prepared.layout,
    )?;
    let (fri_betas, terminals) = aggregate::verify_fri_commitments_v1(
        &proof,
        prepared.protocol.parameters,
        prepared.protocol.domains,
        &prepared.layout,
        &mut transcript,
    )
    .map_err(map_aggregate_error_v1)?;
    let grinding_state = transcript.state();
    verify_grinding_nonce_v1(
        prepared.protocol.domains.digest_context,
        &grinding_state,
        PROOF_MANAGED_NOTE_GRINDING_BITS_V1,
        proof.grinding_nonce,
    )
    .map_err(|_| ProofManagedNoteStarkErrorV1::Transcript)?;
    absorb_grinding_nonce_v1(&mut transcript, proof.grinding_nonce)?;
    let expected_indices = aggregate::query_indices_v1(
        &transcript,
        prepared.protocol.parameters,
        prepared.protocol.domains,
        &prepared.layout,
    )
    .map_err(map_aggregate_error_v1)?;
    aggregate::verify_all_merkle_openings_v1(
        &proof,
        prepared.protocol.parameters,
        prepared.protocol.domains,
        &prepared.layout,
        &expected_indices,
    )
    .map_err(map_aggregate_error_v1)?;
    let (fixed_deep, execution_rows) = execution_fixed::query_rows_and_deep_v1(
        prepare_fixed_columns_v1(adapter, prepared.trace_size, prepared.fixed_width)?,
        prepared.trace_log2,
        prepared.layout.common_lde_log2(),
        &expected_indices,
        deep_point,
    )?;
    let fixed_openings = FixedOpeningsV1(&execution_rows);
    // The DEEP claims were canonically bound before mixing. Check their AIR
    // identity after cheap wire/transcript/Merkle rejection, reusing the same
    // verifier-owned fixed polynomials as base-domain queries. This ordering
    // avoids allocating the public matrix for unauthenticated malformed wire.
    deep_air::verify_deep_air_v1(
        adapter,
        &prepared,
        &deep,
        deep_point,
        &fixed_deep,
        &profile_challenges,
        &alphas,
    )?;
    let lde_root = goldilocks_primitive_root_v1(prepared.layout.common_lde_log2())
        .map_err(map_transparent_error_v1)?;
    let mut evaluator = NoteOpenedRowEvaluatorV1 {
        adapter,
        prepared: &prepared,
        fixed_openings,
        profile_challenges: &profile_challenges,
        alphas: &alphas,
        lde_root,
    };
    aggregate::verify_opened_query_relations_with_deep_v1(
        &proof,
        &deep,
        deep_point,
        &mixes,
        prepared.protocol.parameters,
        &prepared.layout,
        &expected_indices,
        &fri_betas,
        &terminals,
        &mut evaluator,
    )
    .map_err(map_aggregate_error_v1)
}
/// Deterministic affine-line audits for declared AIR polynomial degrees.
///
/// This test-only helper varies every evaluator input independently along
/// random affine lines and computes finite differences over the Goldilocks
/// field.  A polynomial of declared degree `d` must have an identically zero
/// `(d + 1)`st difference on every sampled line.  Callers separately assert
/// that degree `d` is actually observed, preventing a stale overstatement as
/// well as an unsound understatement.
#[cfg(test)]
pub(crate) mod degree_audit {
    use super::F;
    use core::fmt::Debug;
    use rand::{RngCore as _, SeedableRng as _, rngs::StdRng};
    fn random_field_v1(rng: &mut StdRng) -> F {
        F::reduce(u128::from(rng.next_u64()))
    }
    fn random_nonzero_field_v1(rng: &mut StdRng) -> F {
        let value = random_field_v1(rng);
        if value == F::ZERO { F::ONE } else { value }
    }
    fn affine_vector_v1(origin: &[F], direction: &[F], point: F) -> Vec<F> {
        origin
            .iter()
            .copied()
            .zip(direction.iter().copied())
            .map(|(origin, direction)| origin.add(direction.mul(point)))
            .collect()
    }
    /// Measure and enforce the maximum total degree of a residue evaluator.
    pub(crate) fn measured_maximum_affine_degree_v1<E>(
        seed: [u8; 32],
        widths: [usize; 5],
        trial_count: usize,
        declared_maximum_degree: u8,
        mut evaluate: impl FnMut(&[F], &[F], &[F], &[F], &[F]) -> Result<Vec<F>, E>,
    ) -> usize
    where
        E: Debug,
    {
        assert!(trial_count > 0, "degree audit requires at least one trial");
        assert!(
            declared_maximum_degree > 0,
            "degree audit requires a positive declared degree"
        );
        let mut rng = StdRng::from_seed(seed);
        let mut measured_maximum = 0;
        let terminal_order = usize::from(declared_maximum_degree) + 1;
        for trial in 0..trial_count {
            let origins = widths.map(|width| {
                (0..width)
                    .map(|_| random_field_v1(&mut rng))
                    .collect::<Vec<_>>()
            });
            let directions = widths.map(|width| {
                (0..width)
                    .map(|_| random_nonzero_field_v1(&mut rng))
                    .collect::<Vec<_>>()
            });
            let mut differences = (0..=terminal_order)
                .map(|point| {
                    let point = F(u64::try_from(point).expect("small degree-audit point fits u64"));
                    let arguments: [Vec<F>; 5] = core::array::from_fn(|index| {
                        affine_vector_v1(&origins[index], &directions[index], point)
                    });
                    evaluate(
                        &arguments[0],
                        &arguments[1],
                        &arguments[2],
                        &arguments[3],
                        &arguments[4],
                    )
                    .unwrap_or_else(|error| {
                        panic!("degree-audit evaluator failed in trial {trial}: {error:?}")
                    })
                })
                .collect::<Vec<_>>();
            let residue_count = differences
                .first()
                .map(Vec::len)
                .expect("degree audit has evaluation points");
            assert!(residue_count > 0, "degree audit requires residues");
            assert!(
                differences
                    .iter()
                    .all(|residues| residues.len() == residue_count),
                "degree-audit residue width changed within trial {trial}"
            );
            for order in 1..=terminal_order {
                differences = differences
                    .windows(2)
                    .map(|pair| {
                        pair[1]
                            .iter()
                            .copied()
                            .zip(pair[0].iter().copied())
                            .map(|(after, before)| after.sub(before))
                            .collect::<Vec<_>>()
                    })
                    .collect();
                let any_nonzero = differences
                    .iter()
                    .flatten()
                    .any(|residue| *residue != F::ZERO);
                if any_nonzero {
                    measured_maximum = measured_maximum.max(order);
                }
                if order == terminal_order {
                    assert!(
                        !any_nonzero,
                        "trial {trial} has nonzero order-{terminal_order} finite difference; \
                         declared maximum degree is {declared_maximum_degree}"
                    );
                }
            }
        }
        measured_maximum
    }
}

#[cfg(test)]
#[path = "execution_driver_optional_aux_tests.rs"]
mod optional_aux_tests;

/// Exercise the actual adapter's mandatory OOD equation independently of the
/// sampled-row callback. Synthetic openings isolate this predicate; they are not
/// a complete proof or an assertion about Merkle/FRI acceptance.
#[cfg(test)]
pub(crate) fn assert_adapter_deep_identity_v1<
    A: ProofManagedNoteStarkAdapterV1<ProfileChallenges = ()>,
>(
    adapter: &A,
) {
    let prepared = prepare_note_profile_with_fixed_v1(adapter, false).unwrap();
    let point = E::canonical([3, 5, 7, 11]).unwrap();
    let (fixed, query_rows) = execution_fixed::query_rows_and_deep_v1(
        prepare_fixed_columns_v1(adapter, prepared.trace_size, prepared.fixed_width).unwrap(),
        prepared.trace_log2,
        prepared.layout.common_lde_log2(),
        &[0],
        point,
    )
    .unwrap();
    let row = |width, offset| {
        (0..width)
            .map(|i| E::canonical([i as u64 + offset, 1, 2, 3]).unwrap())
            .collect::<Vec<_>>()
    };
    let current = row(prepared.base_width, 1);
    let next = row(prepared.base_width, 2);
    let aux = row(prepared.aux_width, 3);
    let next_aux = row(prepared.aux_width, 4);
    let alphas = (0..prepared.protocol.parameters.security_lanes)
        .map(|_| row(prepared.constraint_count, 5))
        .collect::<Vec<_>>();
    let vanishing_inverse = point
        .pow(prepared.trace_size as u128)
        .sub(E::ONE)
        .inv()
        .unwrap();
    let encode = |values: &[E]| {
        values
            .iter()
            .map(|value| value.coefficients().map(F::value))
            .collect::<Vec<_>>()
    };
    let mut deep = aggregate::AggregateDeepProofV1 {
        trace_groups: vec![aggregate::AggregateDeepTraceGroupOpeningV1 {
            base_current: encode(&current),
            base_next: encode(&next),
            aux_current: encode(&aux),
            aux_next: encode(&next_aux),
        }],
        composition_values: Vec::new(),
    };
    for weights in &alphas {
        let sum = adapter
            .profile_constraint_sum_fp4_v1(&current, &next, &aux, &next_aux, &fixed, &(), weights)
            .unwrap();
        let mut chunks = vec![[0; 4]; prepared.protocol.parameters.composition_degree_chunks];
        chunks[0] = sum.mul(vanishing_inverse).coefficients().map(F::value);
        deep.composition_values.push(chunks);
    }
    let old_opened_row = aggregate::AggregateOpenedTraceGroupV1 {
        base_current: vec![F(3); prepared.base_width],
        base_next: vec![F(5); prepared.base_width],
        aux_current: vec![F(7); prepared.aux_width],
        aux_next: vec![F(11); prepared.aux_width],
    };
    let mut query_evaluator = NoteOpenedRowEvaluatorV1 {
        adapter,
        prepared: &prepared,
        fixed_openings: FixedOpeningsV1(&query_rows),
        profile_challenges: &(),
        alphas: &alphas,
        lde_root: goldilocks_primitive_root_v1(prepared.layout.common_lde_log2()).unwrap(),
    };
    let query_before = query_evaluator
        .evaluate_opened_row_v1(0, 0, std::slice::from_ref(&old_opened_row), &[])
        .unwrap()
        .composition;
    assert_eq!(
        deep_air::verify_deep_air_v1(adapter, &prepared, &deep, point, &fixed, &(), &alphas),
        Ok(())
    );
    let delta = E::canonical([0, 1, 0, 0]).unwrap();
    for role in 0..4 {
        let mut changed = deep.clone();
        let mut changed_fixed = fixed.clone();
        let alter = |value: &mut [u64; 4]| {
            *value = E::canonical(*value)
                .unwrap()
                .add(delta)
                .coefficients()
                .map(F::value);
        };
        match role {
            0 => alter(&mut changed.trace_groups[0].base_current[0]),
            1 => alter(&mut changed.trace_groups[0].base_next[0]),
            2 => {
                assert!(!changed_fixed.is_empty());
                changed_fixed[0] = changed_fixed[0].add(delta);
            }
            _ => alter(&mut changed.composition_values[0][0]),
        }
        assert!(
            deep_air::verify_deep_air_v1(
                adapter,
                &prepared,
                &changed,
                point,
                &changed_fixed,
                &(),
                &alphas
            )
            .is_err(),
            "non-base OOD mutation role {role}"
        );
        assert_eq!(
            query_evaluator
                .evaluate_opened_row_v1(0, 0, std::slice::from_ref(&old_opened_row), &[])
                .unwrap()
                .composition,
            query_before,
            "base-query AIR identity is unchanged"
        );
    }
}
