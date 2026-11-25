//! Extension-field AIR identity at the transcript-derived DEEP point.
//!
//! This is a verifier predicate, not a soundness qualification. It uses the
//! profile's exact compiled polynomial and public fixed-column interpolants.

use super::*;

/// Check the unsplit AIR quotient using the exact FRI coefficient chunk stride.
/// `chunk_size` is a coefficient count: chunk j is multiplied by z^(j*K).
fn verify_quotient_identity_v1(
    point: E,
    trace_size: usize,
    chunk_size: usize,
    chunks: &[E],
    expected_chunk_count: usize,
    weighted_air: E,
) -> Result<(), ProofManagedNoteStarkErrorV1> {
    if trace_size == 0
        || !trace_size.is_power_of_two()
        || chunk_size == 0
        || expected_chunk_count == 0
        || chunks.len() != expected_chunk_count
        || !point.is_canonical()
        || point == E::ZERO
        || !weighted_air.is_canonical()
        || chunks.iter().any(|value| !value.is_canonical())
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    let vanishing = point.pow(trace_size as u128).sub(E::ONE);
    if vanishing == E::ZERO {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    let stride = point.pow(chunk_size as u128);
    let quotient = chunks
        .iter()
        .rev()
        .fold(E::ZERO, |value, chunk| value.mul(stride).add(*chunk));
    if vanishing.mul(quotient) != weighted_air {
        return Err(map_aggregate_error_v1(
            aggregate::AggregateStarkErrorV1::ConstraintOpening,
        ));
    }
    Ok(())
}

pub(super) fn verify_deep_air_v1<A: ProofManagedNoteStarkAdapterV1>(
    adapter: &A,
    prepared: &PreparedNoteProfileV1,
    deep: &aggregate::AggregateDeepProofV1,
    point: E,
    fixed: &[E],
    profile_challenges: &A::ProfileChallenges,
    alphas: &[Vec<E>],
) -> Result<(), ProofManagedNoteStarkErrorV1> {
    let parameters = prepared.protocol.parameters;
    if deep.composition_values.len() != parameters.security_lanes {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    let groups = aggregate::canonical_deep_trace_groups_v1(deep, parameters, &prepared.layout)
        .map_err(map_aggregate_error_v1)?;
    if groups.len() != 1
        || fixed.len() != prepared.fixed_width
        || fixed.iter().any(|value| !value.is_canonical())
        || alphas.len() != parameters.security_lanes
        || alphas.iter().any(|lane| {
            lane.len() != prepared.constraint_count
                || lane.iter().any(|value| !value.is_canonical())
        })
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    let opening = &groups[0];
    let chunk_size = prepared
        .layout
        .fri_degree_cap(parameters)
        .map_err(map_aggregate_error_v1)?;
    for (lane, weights) in alphas.iter().enumerate() {
        let chunks = aggregate::canonical_fp4_fields_v1(
            &deep.composition_values[lane],
            parameters.composition_degree_chunks,
        )
        .map_err(map_aggregate_error_v1)?;
        let weighted_air = adapter.profile_constraint_sum_fp4_v1(
            &opening.base_current,
            &opening.base_next,
            &opening.aux_current,
            &opening.aux_next,
            fixed,
            profile_challenges,
            weights,
        )?;
        verify_quotient_identity_v1(
            point,
            prepared.trace_size,
            chunk_size,
            &chunks,
            parameters.composition_degree_chunks,
            weighted_air,
        )?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn point() -> E {
        E::canonical([3, 5, 7, 11]).unwrap()
    }
    fn chunks() -> [E; 4] {
        [
            E::canonical([1, 2, 0, 1]).unwrap(),
            E::from_base(F(9)),
            E::canonical([4, 0, 3, 0]).unwrap(),
            E::canonical([0, 6, 1, 2]).unwrap(),
        ]
    }
    fn exact_air(z: E, n: usize, k: usize, chunks: &[E]) -> E {
        // Independent explicit-power recomposition checks the helper's Horner order.
        chunks
            .iter()
            .enumerate()
            .fold(E::ZERO, |sum, (j, value)| {
                sum.add(value.mul(z.pow((j * k) as u128)))
            })
            .mul(z.pow(n as u128).sub(E::ONE))
    }

    #[test]
    fn deep_air_quotient_accepts_exact_extension_identity() {
        let z = point();
        let values = chunks();
        assert_eq!(
            verify_quotient_identity_v1(z, 8, 9, &values, 4, exact_air(z, 8, 9, &values)),
            Ok(())
        );
        assert_eq!(
            verify_quotient_identity_v1(z, 8, 9, &[E::ZERO; 4], 4, E::ZERO),
            Ok(())
        );
    }

    #[test]
    fn deep_air_quotient_rejects_changed_chunk_residue_and_stride() {
        let z = point();
        let values = chunks();
        let air = exact_air(z, 8, 9, &values);
        for index in 0..4 {
            let mut changed = values;
            changed[index] = changed[index].add(E::ONE);
            assert!(verify_quotient_identity_v1(z, 8, 9, &changed, 4, air).is_err());
        }
        assert!(verify_quotient_identity_v1(z, 8, 9, &values, 4, air.add(E::ONE)).is_err());
        assert!(verify_quotient_identity_v1(z, 8, 8, &values, 4, air).is_err());
    }

    #[test]
    fn deep_air_quotient_rejects_wrong_shape_and_native_domain_points() {
        let z = point();
        let values = chunks();
        assert!(verify_quotient_identity_v1(z, 8, 9, &values[..3], 4, E::ZERO).is_err());
        assert!(verify_quotient_identity_v1(z, 8, 0, &values, 4, E::ZERO).is_err());
        assert!(verify_quotient_identity_v1(z, 7, 9, &values, 4, E::ZERO).is_err());
        assert!(verify_quotient_identity_v1(E::ZERO, 8, 9, &values, 4, E::ZERO).is_err());
        assert!(verify_quotient_identity_v1(E::ONE, 8, 9, &values, 4, E::ZERO).is_err());
    }
}
