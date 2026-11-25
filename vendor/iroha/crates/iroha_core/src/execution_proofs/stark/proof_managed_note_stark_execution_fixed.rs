//! Native execution proof driver; privacy proofs use their separate implementation.
//! Exact selected-query evaluation of execution profiles' public fixed polynomials.
//!
//! The values are the same degree-<N interpolants used by the prover's IFFT/LDE.
//! All inputs come from the compiled adapter; proof bytes supply neither these
//! polynomials nor their evaluations. Privacy profiles retain their original path.

use super::super::transparent_stark::{
    GOLDILOCKS_GENERATOR_V1, goldilocks_batch_invert_v1, goldilocks_primitive_root_v1,
};
use super::{E, F, ProofManagedNoteStarkErrorV1, checked_trace_size_v1, map_transparent_error_v1};
use rayon::prelude::*;
use std::collections::BTreeMap;

/// At most four independent inversion buffers are resident, regardless of Rayon width.
const QUERY_BATCH: usize = 4;

enum Column {
    Constant(F),
    Dense { offset: F, deltas: Vec<F> },
    Sparse { offset: F, deltas: Vec<(usize, F)> },
    Shift { source: usize, offset: F },
}
impl Column {
    fn delta_at(&self, row: usize) -> F {
        match self {
            Self::Dense { deltas, .. } => deltas[row],
            Self::Sparse { deltas, .. } => deltas
                .binary_search_by_key(&row, |(index, _)| *index)
                .map_or(F::ZERO, |index| deltas[index].1),
            Self::Constant(_) | Self::Shift { .. } => {
                unreachable!("only unique nonconstant columns are indexed")
            }
        }
    }
    fn offset(&self) -> F {
        match self {
            Self::Dense { offset, .. } | Self::Sparse { offset, .. } => *offset,
            Self::Constant(_) | Self::Shift { .. } => {
                unreachable!("only unique nonconstant columns are indexed")
            }
        }
    }
}

struct Oracle {
    columns: Vec<Column>,
    roots: Vec<F>,
    inverse_size: F,
}
impl Oracle {
    fn new(columns: Vec<Vec<F>>, trace_log2: u8) -> Result<Self, ProofManagedNoteStarkErrorV1> {
        let size = checked_trace_size_v1(trace_log2)?;
        if columns.is_empty()
            || columns.iter().any(|column| {
                column.len() != size || column.iter().any(|value| F::canonical(value.0).is_none())
            })
        {
            return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
        }
        let root = goldilocks_primitive_root_v1(trace_log2).map_err(map_transparent_error_v1)?;
        let mut roots = Vec::new();
        roots
            .try_reserve_exact(size)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        let mut power = F::ONE;
        for _ in 0..size {
            roots.push(power);
            power = power.mul(root);
        }
        let mut packed = Vec::<Column>::new();
        packed
            .try_reserve_exact(columns.len())
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        let mut fingerprints = BTreeMap::<u64, Vec<usize>>::new();
        for mut column in columns {
            let offset = column[0];
            let mut nonzero = 0;
            let mut fingerprint = 0xcbf2_9ce4_8422_2325_u64;
            for value in &mut column {
                *value = value.sub(offset);
                nonzero += usize::from(*value != F::ZERO);
                fingerprint = (fingerprint ^ value.0).wrapping_mul(0x0000_0100_0000_01b3);
            }
            if nonzero == 0 {
                packed.push(Column::Constant(offset));
                continue;
            }
            // Fingerprints only select candidates. Exact equality is mandatory,
            // so a collision cannot change a polynomial or its evaluation.
            let source = fingerprints.get(&fingerprint).and_then(|candidates| {
                candidates.iter().copied().find(|index| {
                    column
                        .iter()
                        .enumerate()
                        .all(|(row, value)| *value == packed[*index].delta_at(row))
                })
            });
            if let Some(source) = source {
                packed.push(Column::Shift {
                    source,
                    offset: offset.sub(packed[source].offset()),
                });
                continue;
            }
            fingerprints
                .entry(fingerprint)
                .or_default()
                .push(packed.len());
            if nonzero <= size / 4 {
                let mut deltas = Vec::new();
                deltas
                    .try_reserve_exact(nonzero)
                    .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
                deltas.extend(
                    column
                        .into_iter()
                        .enumerate()
                        .filter(|(_, value)| *value != F::ZERO),
                );
                packed.push(Column::Sparse { offset, deltas });
            } else {
                packed.push(Column::Dense {
                    offset,
                    deltas: column,
                });
            }
        }
        Ok(Self {
            columns: packed,
            roots,
            inverse_size: F(size as u64)
                .inv()
                .ok_or(ProofManagedNoteStarkErrorV1::InvalidProfile)?,
        })
    }

    /// Evaluate the same degree-<N public interpolants at an Fp4 point.
    /// One extension-field inversion and two N-element buffers are sufficient;
    /// these public buffers exist only for this single OOD evaluation.
    fn evaluate_fp4(&self, x: E) -> Result<Vec<E>, ProofManagedNoteStarkErrorV1> {
        let size = self.roots.len();
        validate_deep_point_v1(x, size)?;
        let factor = x.pow(size as u128).sub(E::ONE).mul_base(self.inverse_size);
        let mut denominators = Vec::new();
        let mut prefixes = Vec::new();
        denominators
            .try_reserve_exact(size)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        prefixes
            .try_reserve_exact(size)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        let mut product = E::ONE;
        for root in &self.roots {
            let denominator = x.sub(E::from_base(*root));
            prefixes.push(product);
            denominators.push(denominator);
            product = product.mul(denominator);
        }
        let mut inverse = product
            .inv()
            .ok_or(ProofManagedNoteStarkErrorV1::InvalidTrace)?;
        for index in (0..size).rev() {
            let denominator = denominators[index];
            denominators[index] = inverse.mul(prefixes[index]);
            inverse = inverse.mul(denominator);
        }
        drop(prefixes);
        for (weight, root) in denominators.iter_mut().zip(&self.roots) {
            *weight = weight.mul_base(*root).mul(factor);
        }
        let mut result = Vec::<E>::new();
        result
            .try_reserve_exact(self.columns.len())
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        for column in &self.columns {
            result.push(match column {
                Column::Constant(value) => E::from_base(*value),
                Column::Shift { source, offset } => result[*source].add(E::from_base(*offset)),
                Column::Dense { offset, deltas } => deltas.iter().zip(&denominators).fold(
                    E::from_base(*offset),
                    |sum, (delta, weight)| {
                        if *delta == F::ZERO {
                            sum
                        } else {
                            sum.add(weight.mul_base(*delta))
                        }
                    },
                ),
                Column::Sparse { offset, deltas } => deltas
                    .iter()
                    .fold(E::from_base(*offset), |sum, (index, delta)| {
                        sum.add(denominators[*index].mul_base(*delta))
                    }),
            });
        }
        Ok(result)
    }

    fn evaluate(&self, x: F) -> Result<Vec<F>, ProofManagedNoteStarkErrorV1> {
        let size = self.roots.len();
        let factor = x.pow(size as u128).sub(F::ONE).mul(self.inverse_size);
        if factor == F::ZERO {
            return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
        }
        let mut weights = Vec::new();
        weights
            .try_reserve_exact(size)
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        weights.extend(self.roots.iter().map(|root| x.sub(*root)));
        goldilocks_batch_invert_v1(&mut weights).map_err(map_transparent_error_v1)?;
        // L_j(x) = (x^N-1) * omega^j / (N * (x-omega^j)).
        for (weight, root) in weights.iter_mut().zip(&self.roots) {
            *weight = weight.mul(*root).mul(factor);
        }
        let mut result = Vec::<F>::new();
        result
            .try_reserve_exact(self.columns.len())
            .map_err(|_| ProofManagedNoteStarkErrorV1::Allocation)?;
        for column in &self.columns {
            result.push(match column {
                Column::Constant(value) => *value,
                Column::Shift { source, offset } => result[*source].add(*offset),
                Column::Dense { offset, deltas } => {
                    deltas
                        .iter()
                        .zip(&weights)
                        .fold(*offset, |sum, (delta, weight)| {
                            if *delta == F::ZERO {
                                sum
                            } else {
                                sum.add(delta.mul(*weight))
                            }
                        })
                }
                Column::Sparse { offset, deltas } => {
                    deltas.iter().fold(*offset, |sum, (index, delta)| {
                        sum.add(delta.mul(weights[*index]))
                    })
                }
            });
        }
        Ok(result)
    }
}

/// Evaluate precisely the authenticated query indices; no LDE-sized matrix is allocated.
fn query_rows_with_deep_v1(
    columns: Vec<Vec<F>>,
    trace_log2: u8,
    lde_log2: u8,
    query_indices: &[usize],
    deep_point: Option<E>,
) -> Result<(Vec<E>, BTreeMap<usize, Vec<F>>), ProofManagedNoteStarkErrorV1> {
    let lde_size = checked_trace_size_v1(lde_log2)?;
    if lde_log2 <= trace_log2
        || query_indices.is_empty()
        || query_indices.len() > 136
        || query_indices.iter().any(|index| *index >= lde_size)
    {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    if let Some(point) = deep_point {
        validate_deep_point_v1(point, checked_trace_size_v1(trace_log2)?)?;
    }
    let mut sorted = query_indices.to_vec();
    sorted.sort_unstable();
    if sorted.windows(2).any(|pair| pair[0] == pair[1]) {
        return Err(ProofManagedNoteStarkErrorV1::InvalidProfile);
    }
    if columns.is_empty() {
        // No Oracle, domain-sized roots or inversion buffers exist without
        // fixed polynomials. Still reject every invalid domain/query shape.
        checked_trace_size_v1(trace_log2)?;
        goldilocks_primitive_root_v1(trace_log2).map_err(map_transparent_error_v1)?;
        goldilocks_primitive_root_v1(lde_log2).map_err(map_transparent_error_v1)?;
        return Ok((
            Vec::new(),
            sorted
                .into_iter()
                .map(|index| (index, Vec::new()))
                .collect(),
        ));
    }
    let oracle = Oracle::new(columns, trace_log2)?;
    let fixed_deep = deep_point
        .map(|point| oracle.evaluate_fp4(point))
        .transpose()?
        .unwrap_or_default();
    let lde_root = goldilocks_primitive_root_v1(lde_log2).map_err(map_transparent_error_v1)?;
    let mut rows = BTreeMap::new();
    for batch in query_indices.chunks(QUERY_BATCH) {
        let results = batch
            .par_iter()
            .map(|index| {
                let x = F(GOLDILOCKS_GENERATOR_V1).mul(lde_root.pow(*index as u128));
                oracle.evaluate(x)
            })
            .collect::<Vec<_>>();
        for (index, row) in batch.iter().copied().zip(results) {
            rows.insert(index, row?);
        }
    }
    Ok((fixed_deep, rows))
}

fn validate_deep_point_v1(point: E, size: usize) -> Result<(), ProofManagedNoteStarkErrorV1> {
    if !point.is_canonical() || point == E::ZERO || point.pow(size as u128) == E::ONE {
        return Err(ProofManagedNoteStarkErrorV1::InvalidTrace);
    }
    Ok(())
}

/// Public fixed columns determine both DEEP and authenticated query evaluations.
/// No proof-supplied fixed values are accepted and the column matrix is packed once.
pub(super) fn query_rows_and_deep_v1(
    columns: Vec<Vec<F>>,
    trace_log2: u8,
    lde_log2: u8,
    query_indices: &[usize],
    deep_point: E,
) -> Result<(Vec<E>, BTreeMap<usize, Vec<F>>), ProofManagedNoteStarkErrorV1> {
    query_rows_with_deep_v1(
        columns,
        trace_log2,
        lde_log2,
        query_indices,
        Some(deep_point),
    )
}

#[cfg(test)]
pub(super) fn query_rows_v1(
    columns: Vec<Vec<F>>,
    trace_log2: u8,
    lde_log2: u8,
    query_indices: &[usize],
) -> Result<BTreeMap<usize, Vec<F>>, ProofManagedNoteStarkErrorV1> {
    query_rows_with_deep_v1(columns, trace_log2, lde_log2, query_indices, None)
        .map(|(_, rows)| rows)
}

#[cfg(test)]
pub(super) fn fixed_at_deep_v1(
    columns: Vec<Vec<F>>,
    trace_log2: u8,
    point: E,
) -> Result<Vec<E>, ProofManagedNoteStarkErrorV1> {
    let size = checked_trace_size_v1(trace_log2)?;
    goldilocks_primitive_root_v1(trace_log2).map_err(map_transparent_error_v1)?;
    validate_deep_point_v1(point, size)?;
    if columns.is_empty() {
        return Ok(Vec::new());
    }
    Oracle::new(columns, trace_log2)?.evaluate_fp4(point)
}

#[cfg(test)]
mod deep_tests {
    use super::super::{evaluate_base_coefficients_at_fp4_v1, goldilocks_ifft_v1};
    use super::*;

    #[test]
    fn fixed_deep_matches_exact_ifft_for_all_public_column_encodings() {
        let dense = vec![F(2), F(5), F(11), F(19), F(23), F(29), F(31), F(37)];
        let columns = vec![
            vec![F(17); 8],
            dense.clone(),
            vec![F(3), F(3), F(13), F(3), F(3), F(3), F(3), F(3)],
            dense.iter().map(|x| x.add(F(7))).collect(),
        ];
        let oracle = Oracle::new(columns.clone(), 3).unwrap();
        let root = goldilocks_primitive_root_v1(3).unwrap();
        for point in [
            E::canonical([2, 3, 5, 7]).unwrap(),
            E::canonical([0, 1, 0, 0]).unwrap(),
            E::from_base(F(13)),
        ] {
            let expected = columns
                .iter()
                .map(|column| {
                    let mut coefficients = column.clone();
                    goldilocks_ifft_v1(&mut coefficients, root).unwrap();
                    evaluate_base_coefficients_at_fp4_v1(&coefficients, point)
                })
                .collect::<Vec<_>>();
            assert_eq!(oracle.evaluate_fp4(point).unwrap(), expected);
        }
    }

    #[test]
    fn fixed_deep_uses_verifier_columns_and_rejects_native_points() {
        let point = E::canonical([2, 1, 0, 0]).unwrap();
        assert_eq!(
            fixed_at_deep_v1(vec![vec![F(7); 8]], 3, point).unwrap(),
            vec![E::from_base(F(7))]
        );
        assert_ne!(
            fixed_at_deep_v1(vec![vec![F(8); 8]], 3, point).unwrap(),
            vec![E::from_base(F(7))]
        );
        assert_eq!(fixed_at_deep_v1(vec![], 3, point).unwrap(), Vec::<E>::new());
        assert!(fixed_at_deep_v1(vec![], 3, E::ONE).is_err());
        assert!(fixed_at_deep_v1(vec![vec![F::ONE; 7]], 3, point).is_err());
        assert!(fixed_at_deep_v1(vec![vec![F::ONE; 8]], 3, E::ZERO).is_err());
        assert!(fixed_at_deep_v1(vec![vec![F::ONE; 8]], 3, E::ONE).is_err());
    }

    #[test]
    fn fixed_deep_and_queries_share_the_same_public_oracle() {
        let columns = vec![(0..8).map(F).collect::<Vec<_>>()];
        let point = E::canonical([4, 2, 1, 3]).unwrap();
        let (deep, rows) =
            query_rows_and_deep_v1(columns.clone(), 3, 4, &[0, 7, 15], point).unwrap();
        assert_eq!(deep, fixed_at_deep_v1(columns.clone(), 3, point).unwrap());
        assert_eq!(rows, query_rows_v1(columns, 3, 4, &[0, 7, 15]).unwrap());
    }
}
