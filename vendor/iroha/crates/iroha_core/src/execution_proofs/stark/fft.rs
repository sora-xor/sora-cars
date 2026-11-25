//! Exact radix-two DFT kernels with cached twiddles, cache blocking and Rayon parallelism.
//!
//! Every transform computes `out[k] = sum_j in[j] * root^(j * k)` in natural order,
//! the same values as the reference in-place Cooley-Tukey loop. Field arithmetic
//! is exact, so the evaluation order does not change any output element.
use super::transparent_stark::{GoldilocksFieldV1 as F, GoldilocksFp4V1 as E};
use rayon::prelude::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

/// Values transformed with base-field twiddles.
///
/// Transform inputs can be witness-derived, so every scratch copy is zeroized on drop.
pub(crate) trait FftValue: Copy + Send + Sync + Default + zeroize::Zeroize {
    fn add(self, rhs: Self) -> Self;
    fn sub(self, rhs: Self) -> Self;
    fn mul_base(self, rhs: F) -> Self;
}
impl FftValue for F {
    #[inline(always)]
    fn add(self, rhs: Self) -> Self {
        F::add(self, rhs)
    }
    #[inline(always)]
    fn sub(self, rhs: Self) -> Self {
        F::sub(self, rhs)
    }
    #[inline(always)]
    fn mul_base(self, rhs: F) -> Self {
        self.mul(rhs)
    }
}
impl FftValue for E {
    #[inline(always)]
    fn add(self, rhs: Self) -> Self {
        E::add(self, rhs)
    }
    #[inline(always)]
    fn sub(self, rhs: Self) -> Self {
        E::sub(self, rhs)
    }
    #[inline(always)]
    fn mul_base(self, rhs: F) -> Self {
        E::mul_base(self, rhs)
    }
}

/// Contiguous per-stage twiddles: stage `s` (half width `2^s`) holds `root^(j * n / 2^(s+1))`.
pub(crate) struct Twiddles {
    log_size: u32,
    stages: Vec<Vec<F>>,
}

type TwiddleSlot = Arc<OnceLock<Arc<Twiddles>>>;

fn twiddle_cache() -> &'static Mutex<HashMap<(u64, u32), TwiddleSlot>> {
    static CACHE: OnceLock<Mutex<HashMap<(u64, u32), TwiddleSlot>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Cached twiddles for an already validated primitive `2^log_size`-th root.
pub(crate) fn twiddles(root: F, log_size: u32) -> Arc<Twiddles> {
    let slot = Arc::clone(
        twiddle_cache()
            .lock()
            .expect("twiddle cache")
            .entry((root.0, log_size))
            .or_default(),
    );
    Arc::clone(slot.get_or_init(|| {
        let half = (1_usize << log_size) / 2;
        let mut powers = Vec::with_capacity(half.max(1));
        let mut value = F::ONE;
        for _ in 0..half.max(1) {
            powers.push(value);
            value = value.mul(root);
        }
        let stages = (0..log_size)
            .map(|stage| {
                let half_width = 1_usize << stage;
                let stride = half / half_width;
                (0..half_width).map(|j| powers[j * stride]).collect()
            })
            .collect();
        Arc::new(Twiddles { log_size, stages })
    }))
}

#[inline(always)]
fn butterfly_stage<V: FftValue>(block: &mut [V], twiddles: &[F]) {
    let half = twiddles.len();
    for chunk in block.chunks_exact_mut(2 * half) {
        let (left, right) = chunk.split_at_mut(half);
        for ((even, odd), twiddle) in left.iter_mut().zip(right.iter_mut()).zip(twiddles) {
            let scaled = odd.mul_base(*twiddle);
            let original = *even;
            *even = original.add(scaled);
            *odd = original.sub(scaled);
        }
    }
}

/// Elements per cache-resident block for the small stages.
const BLOCK_LOG: u32 = 12;
/// Transforms smaller than this run serially.
const PARALLEL_LOG: u32 = 14;

/// In-place DFT of bit-reversed input, producing natural-order output.
fn dit_from_bit_reversed<V: FftValue>(values: &mut [V], tw: &Twiddles) {
    let log_size = tw.log_size;
    debug_assert_eq!(values.len(), 1 << log_size);
    let block_log = BLOCK_LOG.min(log_size);
    let block = 1_usize << block_log;
    let small = |chunk: &mut [V]| {
        for stage in 0..block_log as usize {
            butterfly_stage(chunk, &tw.stages[stage]);
        }
    };
    if log_size >= PARALLEL_LOG {
        values.par_chunks_mut(block).for_each(small);
    } else {
        values.chunks_mut(block).for_each(small);
    }
    for stage in block_log..log_size {
        let half = 1_usize << stage;
        let twiddles = &tw.stages[stage as usize];
        if log_size >= PARALLEL_LOG {
            // Split every butterfly group into independent twiddle ranges.
            let groups = values.len() / (2 * half);
            let pieces = (rayon::current_num_threads() * 4).div_ceil(groups).max(1);
            let piece = half.div_ceil(pieces).max(1 << 10).min(half);
            values.par_chunks_mut(2 * half).for_each(|group| {
                let (left, right) = group.split_at_mut(half);
                left.par_chunks_mut(piece)
                    .zip(right.par_chunks_mut(piece))
                    .enumerate()
                    .for_each(|(index, (left, right))| {
                        let twiddles = &twiddles[index * piece..index * piece + left.len()];
                        for ((even, odd), twiddle) in
                            left.iter_mut().zip(right.iter_mut()).zip(twiddles)
                        {
                            let scaled = odd.mul_base(*twiddle);
                            let original = *even;
                            *even = original.add(scaled);
                            *odd = original.sub(scaled);
                        }
                    });
            });
        } else {
            butterfly_stage(values, twiddles);
        }
    }
}

#[inline(always)]
fn reverse_bits(index: usize, log_size: u32) -> usize {
    if log_size == 0 {
        0
    } else {
        index.reverse_bits() >> (usize::BITS - log_size)
    }
}

/// In-place natural-order DFT with the given validated primitive root.
pub(crate) fn fft_in_place<V: FftValue>(values: &mut [V], root: F) {
    let size = values.len();
    let log_size = size.trailing_zeros();
    let tw = twiddles(root, log_size);
    if log_size >= PARALLEL_LOG {
        let input = zeroize::Zeroizing::new(values.to_vec());
        values
            .par_iter_mut()
            .enumerate()
            .for_each(|(index, slot)| *slot = input[reverse_bits(index, log_size)]);
    } else {
        for index in 0..size {
            let reversed = reverse_bits(index, log_size);
            if index < reversed {
                values.swap(index, reversed);
            }
        }
    }
    dit_from_bit_reversed(values, &tw);
}

/// Evaluate `coefficients[k] * shift^k` (zero-padded to `size`) on the natural-order domain.
///
/// The bit-reversal gather and coset scaling are fused into the destination allocation.
#[cfg(test)]
pub(crate) fn coset_evaluate<V: FftValue>(
    coefficients: &[V],
    size: usize,
    root: F,
    shift: F,
) -> Vec<V> {
    try_coset_evaluate(coefficients, size, root, shift).expect("coset evaluation allocation")
}

/// Evaluate a coset while retaining recoverable allocation failures for prover callers.
pub(crate) fn try_coset_evaluate<V: FftValue>(
    coefficients: &[V],
    size: usize,
    root: F,
    shift: F,
) -> Result<Vec<V>, std::collections::TryReserveError> {
    // Reserve the large result before twiddle preparation or copying any witness values.
    let mut values = Vec::new();
    values.try_reserve_exact(size)?;
    values.resize(size, V::default());
    let mut scaled = zeroize::Zeroizing::new(Vec::new());
    scaled.try_reserve_exact(coefficients.len())?;
    scaled.resize(coefficients.len(), V::default());
    let log_size = size.trailing_zeros();
    let tw = twiddles(root, log_size);
    const BLOCK: usize = 1 << 12;
    scaled
        .par_chunks_mut(BLOCK)
        .zip(coefficients.par_chunks(BLOCK))
        .enumerate()
        .for_each(|(block, (out, input))| {
            let mut power = shift.pow((block * BLOCK) as u128);
            for (slot, value) in out.iter_mut().zip(input) {
                *slot = value.mul_base(power);
                power = power.mul(shift);
            }
        });
    let gather = |(index, slot): (usize, &mut V)| {
        let source = reverse_bits(index, log_size);
        if source < scaled.len() {
            *slot = scaled[source];
        }
    };
    if log_size >= PARALLEL_LOG {
        values.par_iter_mut().enumerate().for_each(gather);
    } else {
        values.iter_mut().enumerate().for_each(gather);
    }
    dit_from_bit_reversed(&mut values, &tw);
    Ok(values)
}

/// `base^k` for every `k < count`, computed in independent parallel blocks.
pub(crate) fn power_table(
    base: F,
    count: usize,
) -> Result<Vec<F>, std::collections::TryReserveError> {
    const BLOCK: usize = 1 << 12;
    let mut powers = Vec::new();
    powers.try_reserve_exact(count)?;
    powers.resize(count, F::ZERO);
    powers
        .par_chunks_mut(BLOCK)
        .enumerate()
        .for_each(|(block, chunk)| {
            let mut power = base.pow((block * BLOCK) as u128);
            for slot in chunk {
                *slot = power;
                power = power.mul(base);
            }
        });
    Ok(powers)
}

/// Natural-order evaluations of `sum_k coefficients[k] X^k` on the coset `shift * <root>` of
/// size `out.len()`, written into `out`.
///
/// Coefficients at or beyond the coset size are folded modulo `X^size - shift^size` first:
/// `b_k = shift^k * sum_t wrap^t * coefficients[k + t * size]` with `wrap = shift^size`, which
/// agrees with the polynomial at every coset point. `shift_powers[k]` is `shift^k` for every
/// `k < size`. Each call is serial apart from the large butterfly stages, so callers transform
/// many independent columns in parallel.
pub(crate) fn coset_evaluate_folded_into<V: FftValue>(
    coefficients: &[V],
    shift_powers: &[F],
    wrap: F,
    root: F,
    out: &mut [V],
) {
    let size = out.len();
    debug_assert!(size.is_power_of_two() && shift_powers.len() >= size);
    let log_size = size.trailing_zeros();
    let low = coefficients.len().min(size);
    let (head, tail) = coefficients.split_at(low);
    for ((slot, value), power) in out.iter_mut().zip(head).zip(shift_powers) {
        *slot = value.mul_base(*power);
    }
    for slot in &mut out[low..] {
        *slot = V::default();
    }
    let mut wrap_power = wrap;
    for chunk in tail.chunks(size) {
        for ((slot, value), power) in out.iter_mut().zip(chunk).zip(shift_powers) {
            *slot = slot.add(value.mul_base(wrap_power.mul(*power)));
        }
        wrap_power = wrap_power.mul(wrap);
    }
    for index in 0..size {
        let reversed = reverse_bits(index, log_size);
        if index < reversed {
            out.swap(index, reversed);
        }
    }
    dit_from_bit_reversed(out, &twiddles(root, log_size));
}

#[cfg(test)]
#[path = "fft_tests.rs"]
mod tests;
