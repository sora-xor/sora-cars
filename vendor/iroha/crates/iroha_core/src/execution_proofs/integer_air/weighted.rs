//! Exact weighted evaluation, compiled independently of all transcript challenges.
//!
//! This helper is not a proof driver. A caller must bind the closed relation and its
//! descriptor before sampling the ordered constraint weights. Preparing weights does
//! not authenticate that binding. The source graph is borrowed immutably for the
//! lifetime of the plan. No witness-dependent simplification or row branching occurs.

use std::collections::BTreeMap;

use super::{Constraint, F, IntegerAirV1, PackedIntegerAirV1, Source, Value, field};
use crate::execution_proofs::stark::transparent_stark::GoldilocksFp4V1 as E;

/// A shape, encoding, or allocation failure in a compiled weighted evaluator.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(in crate::execution_proofs) enum WeightedAirErrorV1 {
    /// An input, gate, weight, or source index has the wrong shape.
    Shape,
    /// A supplied field element is not canonical.
    NonCanonical,
    /// Checked resource arithmetic failed.
    Resource,
    /// A fallible allocation could not be reserved on this node.
    Allocation,
}

/// The two concrete fields supported by this exact polynomial evaluator.
pub(in crate::execution_proofs) trait EvaluationFieldV1: Copy {
    /// Additive identity.
    const ZERO: Self;
    /// Multiplicative identity.
    const ONE: Self;
    /// Embed the already canonical base field.
    fn base(value: F) -> Self;
    /// Field addition.
    fn add(self, other: Self) -> Self;
    /// Field subtraction.
    fn sub(self, other: Self) -> Self;
    /// Field multiplication.
    fn mul(self, other: Self) -> Self;
    /// Canonical residue check before evaluation.
    fn canonical(self) -> bool;
}

impl EvaluationFieldV1 for F {
    const ZERO: Self = F::ZERO;
    const ONE: Self = F::ONE;
    fn base(value: F) -> Self {
        value
    }
    fn add(self, other: Self) -> Self {
        F::add(self, other)
    }
    fn sub(self, other: Self) -> Self {
        F::sub(self, other)
    }
    fn mul(self, other: Self) -> Self {
        F::mul(self, other)
    }
    fn canonical(self) -> bool {
        F::canonical(self.0).is_some()
    }
}
impl EvaluationFieldV1 for E {
    const ZERO: Self = E::ZERO;
    const ONE: Self = E::ONE;
    fn base(value: F) -> Self {
        E::from_base(value)
    }
    fn add(self, other: Self) -> Self {
        E::add(self, other)
    }
    fn sub(self, other: Self) -> Self {
        E::sub(self, other)
    }
    fn mul(self, other: Self) -> Self {
        E::mul(self, other)
    }
    fn canonical(self) -> bool {
        self.is_canonical()
    }
}

/// Multiply a challenge-field coefficient by a point-field polynomial value.
/// The supported pairs are F/F, Fp4/F, and Fp4/Fp4; no downcast is provided.
pub(in crate::execution_proofs) trait WeightedPointV1<P: EvaluationFieldV1>:
    EvaluationFieldV1
{
    /// Multiply in the challenge field using the canonical embedding of the point.
    fn mul_point(self, point: P) -> Self;
}
impl WeightedPointV1<F> for F {
    fn mul_point(self, point: F) -> Self {
        self.mul(point)
    }
}
impl WeightedPointV1<F> for E {
    fn mul_point(self, point: F) -> Self {
        self.mul_base(point)
    }
}
impl WeightedPointV1<E> for E {
    fn mul_point(self, point: E) -> Self {
        self.mul(point)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum Operand {
    Constant(i64),
    Current(usize),
    Next(usize),
    Fixed(usize),
}
impl Operand {
    fn read<P: EvaluationFieldV1>(self, row: &[P], next: &[P], fixed: &[P]) -> P {
        match self {
            Self::Constant(value) => P::base(field(value)),
            Self::Current(index) => row[index],
            Self::Next(index) => next[index],
            Self::Fixed(index) => fixed[index],
        }
    }
}

enum Scalar<'a> {
    Existing(&'a Constraint),
    Boolean(usize),
    RadixFour(usize),
}
struct Group<'a> {
    gate: Option<usize>,
    mapping: Option<&'a [usize]>,
    scalars: Vec<(usize, Scalar<'a>)>,
    outputs: Vec<(usize, Operand)>,
    products: Vec<((Operand, Operand), Vec<(usize, i64)>)>,
}

/// Closed, challenge-independent shape with original residue weight positions.
/// Each ROM operand pair is combined only within its own stage namespace.
pub(in crate::execution_proofs) struct CompiledWeightedAirV1<'a> {
    groups: Vec<Group<'a>>,
    width: usize,
    next_width: usize,
    fixed_width: usize,
    gate_count: usize,
    constraint_count: usize,
    original_rom_terms: usize,
}

fn reserve<T>(values: &mut Vec<T>, count: usize) -> Result<(), WeightedAirErrorV1> {
    values
        .try_reserve_exact(count)
        .map_err(|_| WeightedAirErrorV1::Allocation)
}

impl<'a> CompiledWeightedAirV1<'a> {
    /// Compile a standalone graph before obtaining any constraint challenges.
    pub(in crate::execution_proofs) fn integer(
        air: &'a IntegerAirV1,
    ) -> Result<Self, WeightedAirErrorV1> {
        let mut plan = Self {
            groups: Vec::new(),
            width: air.width(),
            next_width: air.width(),
            fixed_width: 0,
            gate_count: 0,
            constraint_count: 0,
            original_rom_terms: 0,
        };
        plan.add_program(air, None, None, false)?;
        Ok(plan)
    }

    /// Compile packed range banks followed by each program's non-range equations.
    /// Packed `Next` operands are local to the same bank, matching `residues`.
    pub(in crate::execution_proofs) fn packed(
        air: &'a PackedIntegerAirV1,
    ) -> Result<Self, WeightedAirErrorV1> {
        let mut plan = Self {
            groups: Vec::new(),
            width: air.width(),
            next_width: 0,
            fixed_width: 0,
            gate_count: air.programs.len(),
            constraint_count: 0,
            original_rom_terms: 0,
        };
        let mut range = Group {
            gate: None,
            mapping: None,
            scalars: Vec::new(),
            outputs: Vec::new(),
            products: Vec::new(),
        };
        reserve(&mut range.scalars, air.boolean_width + air.digit_width)?;
        for index in air.normal_width..air.normal_width + air.boolean_width {
            range
                .scalars
                .push((plan.constraint_count, Scalar::Boolean(index)));
            plan.constraint_count += 1;
        }
        for index in air.normal_width + air.boolean_width..air.width() {
            range
                .scalars
                .push((plan.constraint_count, Scalar::RadixFour(index)));
            plan.constraint_count += 1;
        }
        reserve(
            &mut plan.groups,
            air.programs
                .len()
                .checked_add(1)
                .ok_or(WeightedAirErrorV1::Resource)?,
        )?;
        plan.groups.push(range);
        for (stage, (program, mapping)) in air.programs.iter().zip(&air.mappings).enumerate() {
            plan.add_program(program, Some(mapping), Some(stage), true)?;
        }
        Ok(plan)
    }

    fn add_program(
        &mut self,
        air: &'a IntegerAirV1,
        mapping: Option<&'a [usize]>,
        gate: Option<usize>,
        skip_ranges: bool,
    ) -> Result<(), WeightedAirErrorV1> {
        let mut group = Group {
            gate,
            mapping,
            scalars: Vec::new(),
            outputs: Vec::new(),
            products: Vec::new(),
        };
        let mut products: BTreeMap<(Operand, Operand), Vec<(usize, i64)>> = BTreeMap::new();
        reserve(&mut group.scalars, air.constraints.len())?;
        reserve(&mut group.outputs, air.constraints.len())?;
        for constraint in &air.constraints {
            if skip_ranges
                && matches!(
                    constraint,
                    Constraint::Boolean(_) | Constraint::RadixFour(_)
                )
            {
                continue;
            }
            let index = self.constraint_count;
            self.constraint_count = index.checked_add(1).ok_or(WeightedAirErrorV1::Resource)?;
            let mut source = |value: Value| -> Result<Operand, WeightedAirErrorV1> {
                match value.source {
                    Source::Constant(value) => Ok(Operand::Constant(value)),
                    Source::Fixed(index) => {
                        self.fixed_width = self
                            .fixed_width
                            .max(index.checked_add(1).ok_or(WeightedAirErrorV1::Resource)?);
                        Ok(Operand::Fixed(index))
                    }
                    Source::Column(index) | Source::Next(index) => {
                        if index >= air.width() {
                            return Err(WeightedAirErrorV1::Shape);
                        }
                        if let Some(mapping) = mapping {
                            let mapped = *mapping.get(index).ok_or(WeightedAirErrorV1::Shape)?;
                            if mapped >= self.width {
                                return Err(WeightedAirErrorV1::Shape);
                            }
                            Ok(Operand::Current(mapped))
                        } else if matches!(value.source, Source::Next(_)) {
                            Ok(Operand::Next(index))
                        } else {
                            Ok(Operand::Current(index))
                        }
                    }
                }
            };
            if let Constraint::FixedRom(out, terms) = constraint {
                group.outputs.push((index, source(*out)?));
                for term in terms.iter() {
                    let (a, b) = (source(term.left)?, source(term.right)?);
                    let key = if a <= b { (a, b) } else { (b, a) };
                    let list = products.entry(key).or_default();
                    reserve(list, 1)?;
                    list.push((index, term.coefficient));
                }
                self.original_rom_terms = self
                    .original_rom_terms
                    .checked_add(terms.len())
                    .ok_or(WeightedAirErrorV1::Resource)?;
            } else {
                // Validate every referenced source once. Evaluation uses the original scalar
                // expression and the same mapping, without allocating logical rows.
                match constraint {
                    Constraint::Equation(a, b) => {
                        source(*a)?;
                        source(*b)?;
                    }
                    Constraint::Add(a, b, c)
                    | Constraint::Sub(a, b, c)
                    | Constraint::Mul(a, b, c)
                    | Constraint::GatedEquation(a, b, c) => {
                        source(*a)?;
                        source(*b)?;
                        source(*c)?;
                    }
                    Constraint::Select(a, b, c, d) => {
                        source(*a)?;
                        source(*b)?;
                        source(*c)?;
                        source(*d)?;
                    }
                    Constraint::Boolean(a) | Constraint::RadixFour(a) => {
                        source(*a)?;
                    }
                    Constraint::Decompose(a, bits) => {
                        source(*a)?;
                        for bit in bits {
                            source(*bit)?;
                        }
                    }
                    Constraint::FixedRom(..) => return Err(WeightedAirErrorV1::Shape),
                }
                group.scalars.push((index, Scalar::Existing(constraint)));
            }
        }
        reserve(&mut group.products, products.len())?;
        group.products.extend(products);
        reserve(&mut self.groups, 1)?;
        self.groups.push(group);
        Ok(())
    }

    /// Exact number and order of required original residue weights.
    pub(in crate::execution_proofs) fn constraint_count(&self) -> usize {
        self.constraint_count
    }

    /// Original table coefficient products versus shared operand-pair products per point.
    /// This arithmetic count is not a runtime or memory benchmark.
    pub(in crate::execution_proofs) fn rom_product_counts(&self) -> (usize, usize) {
        (
            self.original_rom_terms,
            self.groups.iter().map(|g| g.products.len()).sum(),
        )
    }

    /// Bind exact ordered weights after the caller's relation-binding transcript step.
    /// No randomness is sampled here, and zero weights keep their original positions.
    pub(in crate::execution_proofs) fn prepare<W: EvaluationFieldV1>(
        &self,
        weights: &[W],
    ) -> Result<PreparedWeightedAirV1<'_, 'a, W>, WeightedAirErrorV1> {
        if weights.len() != self.constraint_count {
            return Err(WeightedAirErrorV1::Shape);
        }
        if weights.iter().any(|value| !value.canonical()) {
            return Err(WeightedAirErrorV1::NonCanonical);
        }
        let mut owned = Vec::new();
        reserve(&mut owned, weights.len())?;
        owned.extend_from_slice(weights);
        let mut coefficients = Vec::new();
        reserve(&mut coefficients, self.groups.len())?;
        for group in &self.groups {
            let mut combined = Vec::new();
            reserve(&mut combined, group.products.len())?;
            for (_, terms) in &group.products {
                combined.push(terms.iter().fold(W::ZERO, |sum, (index, value)| {
                    sum.add(weights[*index].mul(W::base(field(*value))))
                }));
            }
            coefficients.push(combined);
        }
        Ok(PreparedWeightedAirV1 {
            plan: self,
            weights: owned,
            coefficients,
        })
    }
}

/// One challenge assignment to a closed graph; reusable at arbitrary field points.
pub(in crate::execution_proofs) struct PreparedWeightedAirV1<'p, 'a, W> {
    plan: &'p CompiledWeightedAirV1<'a>,
    weights: Vec<W>,
    coefficients: Vec<Vec<W>>,
}

fn scalar<P: EvaluationFieldV1>(constraint: &Constraint, read: &impl Fn(Value) -> P) -> P {
    match constraint {
        Constraint::Equation(a, b) => read(*a).sub(read(*b)),
        Constraint::Add(out, a, b) => read(*out).sub(read(*a).add(read(*b))),
        Constraint::Sub(out, a, b) => read(*out).sub(read(*a).sub(read(*b))),
        Constraint::Mul(out, a, b) => read(*out).sub(read(*a).mul(read(*b))),
        Constraint::Select(out, c, a, b) => {
            read(*out).sub(read(*b).add(read(*c).mul(read(*a).sub(read(*b)))))
        }
        Constraint::Boolean(a) => boolean(read(*a)),
        Constraint::RadixFour(a) => radix_four(read(*a)),
        Constraint::Decompose(a, bits) => {
            read(*a).sub(bits.iter().enumerate().fold(P::ZERO, |sum, (i, bit)| {
                sum.add(read(*bit).mul(P::base(field(1_i64 << i))))
            }))
        }
        Constraint::GatedEquation(g, a, b) => read(*g).mul(read(*a).sub(read(*b))),
        Constraint::FixedRom(out, terms) => read(*out).sub(terms.iter().fold(P::ZERO, |sum, t| {
            sum.add(
                P::base(field(t.coefficient))
                    .mul(read(t.left))
                    .mul(read(t.right)),
            )
        })),
    }
}
fn boolean<P: EvaluationFieldV1>(value: P) -> P {
    value.mul(value.sub(P::ONE))
}
fn radix_four<P: EvaluationFieldV1>(value: P) -> P {
    value
        .mul(value.sub(P::ONE))
        .mul(value.sub(P::base(field(2))))
        .mul(value.sub(P::base(field(3))))
}

/// A challenge assignment that owns its closed plan, for reuse across many rows.
pub(in crate::execution_proofs) struct OwnedPreparedWeightedAirV1<'a, W> {
    plan: CompiledWeightedAirV1<'a>,
    weights: Vec<W>,
    coefficients: Vec<Vec<W>>,
}
impl<'a> CompiledWeightedAirV1<'a> {
    /// Bind exact ordered weights and keep the plan with them.
    pub(in crate::execution_proofs) fn into_prepared<W: EvaluationFieldV1>(
        self,
        weights: &[W],
    ) -> Result<OwnedPreparedWeightedAirV1<'a, W>, WeightedAirErrorV1> {
        let PreparedWeightedAirV1 {
            weights,
            coefficients,
            ..
        } = self.prepare(weights)?;
        Ok(OwnedPreparedWeightedAirV1 {
            plan: self,
            weights,
            coefficients,
        })
    }
}
impl<W: EvaluationFieldV1> OwnedPreparedWeightedAirV1<'_, W> {
    /// Exactly [`PreparedWeightedAirV1::evaluate`] for the owned plan.
    pub(in crate::execution_proofs) fn evaluate<P: EvaluationFieldV1>(
        &self,
        current: &[P],
        next: &[P],
        fixed: &[P],
        gates: &[P],
    ) -> Result<W, WeightedAirErrorV1>
    where
        W: WeightedPointV1<P>,
    {
        PreparedWeightedAirV1 {
            plan: &self.plan,
            weights: Vec::new(),
            coefficients: Vec::new(),
        }
        .evaluate_with(&self.weights, &self.coefficients, current, next, fixed, gates)
    }
}

impl<W: EvaluationFieldV1> PreparedWeightedAirV1<'_, '_, W> {
    /// Evaluate without constructing a residue vector. `current` has exact compiled
    /// width; standalone `next` has that width, packed `next` is empty. Fixed values
    /// cover every referenced fixed column, and gate count is exact. Extra fixed
    /// columns are allowed, as in the original graph, but all inputs must be canonical.
    pub(in crate::execution_proofs) fn evaluate<P: EvaluationFieldV1>(
        &self,
        current: &[P],
        next: &[P],
        fixed: &[P],
        gates: &[P],
    ) -> Result<W, WeightedAirErrorV1>
    where
        W: WeightedPointV1<P>,
    {
        self.evaluate_with(&self.weights, &self.coefficients, current, next, fixed, gates)
    }
    fn evaluate_with<P: EvaluationFieldV1>(
        &self,
        weights: &[W],
        coefficients: &[Vec<W>],
        current: &[P],
        next: &[P],
        fixed: &[P],
        gates: &[P],
    ) -> Result<W, WeightedAirErrorV1>
    where
        W: WeightedPointV1<P>,
    {
        let plan = self.plan;
        if current.len() != plan.width
            || next.len() != plan.next_width
            || fixed.len() < plan.fixed_width
            || gates.len() != plan.gate_count
        {
            return Err(WeightedAirErrorV1::Shape);
        }
        if current
            .iter()
            .chain(next)
            .chain(fixed)
            .chain(gates)
            .any(|x| !x.canonical())
        {
            return Err(WeightedAirErrorV1::NonCanonical);
        }
        let mut result = W::ZERO;
        for (group, coefficients) in plan.groups.iter().zip(coefficients) {
            let read = |value: Value| match value.source {
                Source::Constant(value) => P::base(field(value)),
                Source::Fixed(index) => fixed[index],
                Source::Column(index) => current[group.mapping.map_or(index, |m| m[index])],
                Source::Next(index) => match group.mapping {
                    Some(m) => current[m[index]],
                    None => next[index],
                },
            };
            let mut sum = W::ZERO;
            for (index, expression) in &group.scalars {
                let value = match expression {
                    Scalar::Existing(constraint) => scalar(constraint, &read),
                    Scalar::Boolean(index) => boolean(current[*index]),
                    Scalar::RadixFour(index) => radix_four(current[*index]),
                };
                sum = sum.add(weights[*index].mul_point(value));
            }
            for (index, operand) in &group.outputs {
                sum = sum.add(weights[*index].mul_point(operand.read(current, next, fixed)));
            }
            for (((left, right), _), coefficient) in group.products.iter().zip(coefficients) {
                let product = left
                    .read(current, next, fixed)
                    .mul(right.read(current, next, fixed));
                sum = sum.sub(coefficient.mul_point(product));
            }
            result = result.add(match group.gate {
                Some(index) => sum.mul_point(gates[index]),
                None => sum,
            });
        }
        Ok(result)
    }
}

#[cfg(test)]
mod tests;
