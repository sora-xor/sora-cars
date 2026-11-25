//! Execution-only Poseidon2 Goldilocks sponge, width 16 / rate 8 / capacity 8.
//!
//! This is a single established sponge construction, not a concatenation of narrow sponges.
//! The six canonical output coordinates retain the native 48-byte digest encoding.
//! Parameters and the permutation KAT are pinned to Plonky3; see POSEIDON2_PROVENANCE.md.
//! Whole-proof qualification remains separate from this primitive's parameter target.

#[cfg(test)]
pub(crate) use fastpq_isi::GoldilocksDigest384LastFieldStreamErrorV1 as StreamError;
use fastpq_isi::{GoldilocksDigest384V1, GoldilocksDigestDomainV1};
#[path = "poseidon2_constants.rs"]
mod constants;
use constants::{EXTERNAL_FINAL, EXTERNAL_INITIAL, INTERNAL, INTERNAL_DIAGONAL};

const MODULUS: u64 = 0xffff_ffff_0000_0001;
const WIDTH: usize = 16;
const RATE: usize = 8;
const FRAME: &[u8] = b"iroha:execution:poseidon2-goldilocks-w16-r8-c8:frame:v1";

/// Branch-free reduction of any `u128` to a congruent value below `2^64`.
///
/// `2^64 = 2^32 - 1` and `2^96 = -1` modulo p. The result is not canonicalized:
/// permutation words stay below `2^64` and are canonicalized only on output.
#[inline(always)]
fn reduce_lazy(value: u128) -> u64 {
    const EPSILON: u64 = 0xffff_ffff;
    let low = value as u64;
    let high = (value >> 64) as u64;
    let (low, borrowed) = low.overflowing_sub(high >> 32);
    // A borrow added 2^64; subtracting epsilon leaves `low - high_high + p`, which cannot underflow.
    let low = low.wrapping_sub(u64::from(borrowed).wrapping_neg() & EPSILON);
    let (value, carried) = low.overflowing_add((high & EPSILON) * EPSILON);
    // The folded term is below 2^64 - 2^33, so one correction cannot overflow again.
    value.wrapping_add(u64::from(carried).wrapping_neg() & EPSILON)
}

/// Canonical reduction of any `u128`.
#[inline(always)]
fn reduce(value: u128) -> u64 {
    canonicalize(reduce_lazy(value))
}

/// Map `[0, 2^64)` to the canonical residue.
#[inline(always)]
fn canonicalize(value: u64) -> u64 {
    let (reduced, borrowed) = value.overflowing_sub(MODULUS);
    if borrowed { value } else { reduced }
}

/// `a + b` for any `a < 2^64` and canonical `b`, congruent and below `2^64`.
#[inline(always)]
fn add_lazy(a: u64, b: u64) -> u64 {
    debug_assert!(b < MODULUS);
    let (value, carry) = a.overflowing_add(b);
    // A wrap omitted 2^64 = epsilon; since b < p the corrected value stays below 2^64.
    value.wrapping_add(u64::from(carry).wrapping_neg() & 0xffff_ffff)
}

/// Canonical field addition.
#[inline(always)]
fn add(a: u64, b: u64) -> u64 {
    canonicalize(add_lazy(a, b))
}

#[inline(always)]
fn mul_lazy(a: u64, b: u64) -> u64 {
    reduce_lazy(u128::from(a) * u128::from(b))
}

/// `a^7` with a depth-three multiplication chain, congruent and below `2^64`.
#[inline(always)]
fn pow7(a: u64) -> u64 {
    let square = mul_lazy(a, a);
    let cube = mul_lazy(square, a);
    let fourth = mul_lazy(square, square);
    mul_lazy(cube, fourth)
}

/// Plonky3 `MDSMat4` circulant(2,3,1,1) blocks followed by the inter-block layer.
///
/// Every output is the same integer combination as the block-wise reduced
/// reference; it is accumulated exactly (below 35 * 2^64) and reduced once.
#[inline(always)]
fn external(state: &mut [u64; WIDTH]) {
    let mut mixed = [0_u128; WIDTH];
    for block in 0..4 {
        let a = u128::from(state[4 * block]);
        let b = u128::from(state[4 * block + 1]);
        let c = u128::from(state[4 * block + 2]);
        let d = u128::from(state[4 * block + 3]);
        let sum = a + b + c + d;
        mixed[4 * block] = sum + a + b + b;
        mixed[4 * block + 1] = sum + b + c + c;
        mixed[4 * block + 2] = sum + c + d + d;
        mixed[4 * block + 3] = sum + d + a + a;
    }
    let mut sums = [0_u128; 4];
    for (column, sum) in sums.iter_mut().enumerate() {
        *sum = mixed[column] + mixed[4 + column] + mixed[8 + column] + mixed[12 + column];
    }
    for (index, word) in state.iter_mut().enumerate() {
        *word = reduce_lazy(mixed[index] + sums[index % 4]);
    }
}

#[inline(always)]
fn full_round(state: &mut [u64; WIDTH], constants: &[u64; WIDTH]) {
    for (word, constant) in state.iter_mut().zip(constants) {
        *word = pow7(add_lazy(*word, *constant));
    }
    external(state);
}

/// The specialized internal layer below hard-codes exactly this diagonal.
const fn internal_diagonal_is(expected: [u64; WIDTH]) -> bool {
    let mut index = 0;
    while index < WIDTH {
        if INTERNAL_DIAGONAL[index] != expected[index] {
            return false;
        }
        index += 1;
    }
    true
}
const _: () = assert!(internal_diagonal_is([
    0xffff_fffe_ffff_ffff,
    1,
    2,
    0x7fff_ffff_8000_0001,
    3,
    4,
    0x7fff_ffff_8000_0000,
    0xffff_fffe_ffff_fffe,
    0xffff_fffe_ffff_fffd,
    0xdfff_ffff_2000_0001,
    0xefff_ffff_1000_0001,
    0xf7ff_ffff_0800_0001,
    0x1fff_ffff_e000_0000,
    0x0fff_ffff_f000_0000,
    0x07ff_ffff_f800_0000,
    0xffff_fffe_0000_0002,
]));

/// `x / 2`, congruent and below `2^64` for any `x < 2^64`.
///
/// An odd `x` becomes `(x + p) / 2 = (x >> 1) + (p + 1) / 2`.
#[inline(always)]
fn halve(x: u64) -> u64 {
    (x >> 1) + ((x & 1).wrapping_neg() & 0x7fff_ffff_8000_0001)
}

/// `x * 2^-k` for `1 <= k <= 32`, congruent, non-negative and below `2^65`.
///
/// Modulo p, `2^-k = 2^(32-k) - 2^(64-k)`. With `x = q 2^k + r` this is
/// `q + r 2^(32-k) - r 2^(64-k)`; adding p keeps it non-negative since `r 2^(64-k) < p`.
#[inline(always)]
fn mul_inv_pow2(x: u64, k: u32) -> u128 {
    let q = u128::from(x >> k);
    let r = u128::from(x & ((1_u64 << k) - 1));
    q + (r << (32 - k)) + u128::from(MODULUS) - (r << (64 - k))
}

/// `-(x * 2^-k)` for `1 <= k <= 32`, congruent, non-negative and below `2^66`.
#[inline(always)]
fn mul_neg_inv_pow2(x: u64, k: u32) -> u128 {
    let q = u128::from(x >> k);
    let r = u128::from(x & ((1_u64 << k) - 1));
    2 * u128::from(MODULUS) + (r << (64 - k)) - q - (r << (32 - k))
}

/// `x * INTERNAL_DIAGONAL[index] + sum` without general multiplications.
///
/// The diagonal is `[-2, 1, 2, 1/2, 3, 4, -1/2, -3, -4, 1/8, 1/16, 1/32, -1/8, -1/16,
/// -1/32, 2^-32]`; negative terms add a multiple of p exceeding the subtrahend.
#[inline(always)]
fn internal_diagonal_word(index: usize, x: u64, sum: u64) -> u64 {
    let s = u128::from(sum);
    let w = u128::from(x);
    let p = u128::from(MODULUS);
    reduce_lazy(match index {
        0 => s + 4 * p - (w << 1),
        1 => s + w,
        2 => s + (w << 1),
        3 => s + u128::from(halve(x)),
        4 => s + 3 * w,
        5 => s + (w << 2),
        6 => s + 2 * p - u128::from(halve(x)),
        7 => s + 6 * p - 3 * w,
        8 => s + 8 * p - (w << 2),
        9 => s + mul_inv_pow2(x, 3),
        10 => s + mul_inv_pow2(x, 4),
        11 => s + mul_inv_pow2(x, 5),
        12 => s + mul_neg_inv_pow2(x, 3),
        13 => s + mul_neg_inv_pow2(x, 4),
        14 => s + mul_neg_inv_pow2(x, 5),
        _ => s + mul_inv_pow2(x, 32),
    })
}

#[inline(always)]
fn internal_round(state: &mut [u64; WIDTH], constant: u64) {
    state[0] = pow7(add_lazy(state[0], constant));
    let sum = reduce_lazy(state.iter().map(|word| u128::from(*word)).sum());
    // Literal indices let every diagonal case fold at compile time.
    macro_rules! diagonal {
        ($($index:literal)*) => {
            $(state[$index] = internal_diagonal_word($index, state[$index], sum);)*
        };
    }
    diagonal!(0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15);
}

/// The permutation on congruent words below `2^64`; outputs are canonical.
fn permute(state: &mut [u64; WIDTH]) {
    external(state);
    for constants in &EXTERNAL_INITIAL {
        full_round(state, constants);
    }
    for constant in INTERNAL {
        internal_round(state, constant);
    }
    for constants in &EXTERNAL_FINAL {
        full_round(state, constants);
    }
    for word in state.iter_mut() {
        *word = canonicalize(*word);
    }
}

#[derive(Clone)]
pub(crate) struct Sponge {
    state: [u64; WIDTH],
    position: usize,
}

impl Sponge {
    fn new() -> Self {
        Self {
            state: [0; WIDTH],
            position: 0,
        }
    }
    #[inline(always)]
    fn absorb(&mut self, value: u64) {
        debug_assert!(value < MODULUS);
        self.state[self.position] = add(self.state[self.position], value);
        self.position += 1;
        if self.position == RATE {
            permute(&mut self.state);
            self.position = 0;
        }
    }
    fn bytes(&mut self, tag: u64, bytes: &[u8]) {
        self.absorb(tag);
        self.absorb(bytes.len() as u64);
        let mut chunks = bytes.chunks_exact(7);
        for chunk in &mut chunks {
            let mut word = [0; 8];
            word[..7].copy_from_slice(chunk);
            self.absorb(u64::from_le_bytes(word));
        }
        let rest = chunks.remainder();
        let mut word = [0; 8];
        word[..rest.len()].copy_from_slice(rest);
        word[rest.len()] = 1;
        self.absorb(u64::from_le_bytes(word));
    }
    /// Exactly `bytes(tag, concat(values[i].to_be_bytes()))`, without materializing the bytes.
    fn be_u64_bytes(&mut self, tag: u64, values: impl ExactSizeIterator<Item = u64>) {
        const LOW56: u128 = (1 << 56) - 1;
        self.absorb(tag);
        self.absorb((values.len() * 8) as u64);
        // Pending stream bytes as a little-endian integer; fewer than seven remain after each push.
        let mut pending = 0_u128;
        let mut pending_bytes = 0_u32;
        for value in values {
            pending |= u128::from(value.swap_bytes()) << (8 * pending_bytes);
            pending_bytes += 8;
            while pending_bytes >= 7 {
                self.absorb((pending & LOW56) as u64);
                pending >>= 56;
                pending_bytes -= 7;
            }
        }
        self.absorb((pending | (1_u128 << (8 * pending_bytes))) as u64);
    }
    fn finish(mut self) -> GoldilocksDigest384V1 {
        // pad10*: a final nonzero field delimiter, zero fill, then one permutation.
        self.absorb(1);
        if self.position != 0 {
            permute(&mut self.state);
        }
        GoldilocksDigest384V1::new(core::array::from_fn(|i| self.state[i]))
            .expect("permutation outputs canonical residues")
    }
}

/// The sponge after absorbing the constant frame and five domain fields.
///
/// Cached per thread by exact field contents, so a hit reproduces precisely the
/// state the one-shot path would reach by re-absorbing the same prefix.
#[derive(Clone)]
struct CachedPrefix {
    fields: [Vec<u8>; 5],
    sponge: Sponge,
}

const PREFIX_CACHE_ENTRIES: usize = 16;

thread_local! {
    static PREFIXES: core::cell::RefCell<Vec<CachedPrefix>> =
        const { core::cell::RefCell::new(Vec::new()) };
}

fn prefix_sponge(domain_fields: [&[u8]; 5]) -> Sponge {
    PREFIXES.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some(position) = cache.iter().position(|entry| {
            entry
                .fields
                .iter()
                .zip(domain_fields)
                .all(|(stored, field)| stored.as_slice() == field)
        }) {
            if position != 0 {
                let entry = cache.remove(position);
                cache.insert(0, entry);
            }
            return cache[0].sponge.clone();
        }
        let mut sponge = Sponge::new();
        sponge.bytes(1, FRAME);
        for (index, bytes) in domain_fields.into_iter().enumerate() {
            sponge.bytes(2 + index as u64, bytes);
        }
        if cache.len() == PREFIX_CACHE_ENTRIES {
            cache.pop();
        }
        cache.insert(
            0,
            CachedPrefix {
                fields: domain_fields.map(<[u8]>::to_vec),
                sponge: sponge.clone(),
            },
        );
        sponge
    })
}

fn framed_sponge(domain: &GoldilocksDigestDomainV1<'_>, field_count: usize) -> Sponge {
    let mut sponge = prefix_sponge([
        domain.catalog,
        domain.protocol,
        domain.profile,
        domain.role,
        domain.phase,
    ]);
    sponge.bytes(7, &domain.level.to_le_bytes());
    sponge.bytes(8, &domain.index.to_le_bytes());
    sponge.bytes(9, &domain.counter.to_le_bytes());
    sponge.absorb(10);
    sponge.absorb(field_count as u64);
    sponge
}

fn domain_fits(domain: &GoldilocksDigestDomainV1<'_>, field_count: usize) -> bool {
    u32::try_from(field_count).is_ok()
        && [
            domain.catalog,
            domain.protocol,
            domain.profile,
            domain.role,
            domain.phase,
        ]
        .iter()
        .all(|field| u32::try_from(field.len()).is_ok())
}

/// Hash a canonically framed execution message under the execution sponge suite.
pub(crate) fn hash_bytes_384_v1(
    domain: GoldilocksDigestDomainV1<'_>,
    fields: &[&[u8]],
) -> Option<GoldilocksDigest384V1> {
    if !domain_fits(&domain, fields.len())
        || fields.iter().any(|field| u32::try_from(field.len()).is_err())
    {
        return None;
    }
    let mut sponge = framed_sponge(&domain, fields.len());
    for (index, bytes) in fields.iter().enumerate() {
        sponge.bytes(11 + index as u64, bytes);
    }
    Some(sponge.finish())
}

/// Exactly `hash_bytes_384_v1(domain, [leading..., concat(values.to_be_bytes())])`.
pub(crate) fn hash_fields_then_be_u64s_384_v1(
    domain: GoldilocksDigestDomainV1<'_>,
    leading: &[&[u8]],
    values: impl ExactSizeIterator<Item = u64>,
) -> Option<GoldilocksDigest384V1> {
    let field_count = leading.len() + 1;
    if !domain_fits(&domain, field_count)
        || leading.iter().any(|field| u32::try_from(field.len()).is_err())
        || values
            .len()
            .checked_mul(8)
            .is_none_or(|bytes| u32::try_from(bytes).is_err())
    {
        return None;
    }
    let mut sponge = framed_sponge(&domain, field_count);
    for (index, bytes) in leading.iter().enumerate() {
        sponge.bytes(11 + index as u64, bytes);
    }
    sponge.be_u64_bytes(11 + leading.len() as u64, values);
    Some(sponge.finish())
}

/// Independent sponges hashed in lockstep; all lanes share one frame layout.
pub(crate) const LANES: usize = 4;
type State4 = [[u64; LANES]; WIDTH];

#[inline(always)]
fn external_x4(state: &mut State4) {
    let mut mixed = [[0_u128; LANES]; WIDTH];
    for block in 0..4 {
        for lane in 0..LANES {
            let a = u128::from(state[4 * block][lane]);
            let b = u128::from(state[4 * block + 1][lane]);
            let c = u128::from(state[4 * block + 2][lane]);
            let d = u128::from(state[4 * block + 3][lane]);
            let sum = a + b + c + d;
            mixed[4 * block][lane] = sum + a + b + b;
            mixed[4 * block + 1][lane] = sum + b + c + c;
            mixed[4 * block + 2][lane] = sum + c + d + d;
            mixed[4 * block + 3][lane] = sum + d + a + a;
        }
    }
    for column in 0..4 {
        for lane in 0..LANES {
            let sum = mixed[column][lane]
                + mixed[4 + column][lane]
                + mixed[8 + column][lane]
                + mixed[12 + column][lane];
            for block in 0..4 {
                state[4 * block + column][lane] =
                    reduce_lazy(mixed[4 * block + column][lane] + sum);
            }
        }
    }
}

#[inline(always)]
fn full_round_x4(state: &mut State4, constants: &[u64; WIDTH]) {
    for (words, constant) in state.iter_mut().zip(constants) {
        for word in words.iter_mut() {
            *word = pow7(add_lazy(*word, *constant));
        }
    }
    external_x4(state);
}

#[inline(always)]
fn internal_round_x4(state: &mut State4, constant: u64) {
    for word in state[0].iter_mut() {
        *word = pow7(add_lazy(*word, constant));
    }
    let mut sums = [0_u64; LANES];
    for (lane, sum) in sums.iter_mut().enumerate() {
        *sum = reduce_lazy(state.iter().map(|words| u128::from(words[lane])).sum());
    }
    macro_rules! diagonal {
        ($($index:literal)*) => {
            $(for (word, sum) in state[$index].iter_mut().zip(sums) {
                *word = internal_diagonal_word($index, *word, sum);
            })*
        };
    }
    diagonal!(0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15);
}

fn permute_x4(state: &mut State4) {
    external_x4(state);
    for constants in &EXTERNAL_INITIAL {
        full_round_x4(state, constants);
    }
    for constant in INTERNAL {
        internal_round_x4(state, constant);
    }
    for constants in &EXTERNAL_FINAL {
        full_round_x4(state, constants);
    }
    for words in state.iter_mut() {
        for word in words.iter_mut() {
            *word = canonicalize(*word);
        }
    }
}

struct Sponge4 {
    state: State4,
    position: usize,
}

impl Sponge4 {
    fn from_single(sponge: &Sponge) -> Self {
        Self {
            state: core::array::from_fn(|word| [sponge.state[word]; LANES]),
            position: sponge.position,
        }
    }
    #[inline(always)]
    fn absorb_lanes(&mut self, values: [u64; LANES]) {
        for (word, value) in self.state[self.position].iter_mut().zip(values) {
            debug_assert!(value < MODULUS);
            *word = add(*word, value);
        }
        self.position += 1;
        if self.position == RATE {
            permute_x4(&mut self.state);
            self.position = 0;
        }
    }
    fn absorb_same(&mut self, value: u64) {
        self.absorb_lanes([value; LANES]);
    }
    /// `bytes(tag, ...)` for per-lane slices of one common length.
    fn bytes_lanes(&mut self, tag: u64, bytes: [&[u8]; LANES]) {
        let length = bytes[0].len();
        debug_assert!(bytes.iter().all(|lane| lane.len() == length));
        self.absorb_same(tag);
        self.absorb_same(length as u64);
        let full = length / 7;
        for chunk in 0..full {
            self.absorb_lanes(core::array::from_fn(|lane| {
                let mut word = [0; 8];
                word[..7].copy_from_slice(&bytes[lane][7 * chunk..7 * chunk + 7]);
                u64::from_le_bytes(word)
            }));
        }
        let rest = length - 7 * full;
        self.absorb_lanes(core::array::from_fn(|lane| {
            let mut word = [0; 8];
            word[..rest].copy_from_slice(&bytes[lane][7 * full..]);
            word[rest] = 1;
            u64::from_le_bytes(word)
        }));
    }
    /// `bytes(tag, concat(values.to_be_bytes()))` with `count` values per lane.
    fn be_u64_bytes_lanes(&mut self, tag: u64, count: usize, value: impl Fn(usize) -> [u64; LANES]) {
        const LOW56: u128 = (1 << 56) - 1;
        self.absorb_same(tag);
        self.absorb_same((count * 8) as u64);
        let mut pending = [0_u128; LANES];
        let mut pending_bytes = 0_u32;
        for index in 0..count {
            let values = value(index);
            for (pending, value) in pending.iter_mut().zip(values) {
                *pending |= u128::from(value.swap_bytes()) << (8 * pending_bytes);
            }
            pending_bytes += 8;
            while pending_bytes >= 7 {
                self.absorb_lanes(pending.map(|pending| (pending & LOW56) as u64));
                for pending in pending.iter_mut() {
                    *pending >>= 56;
                }
                pending_bytes -= 7;
            }
        }
        self.absorb_lanes(pending.map(|pending| (pending | (1_u128 << (8 * pending_bytes))) as u64));
    }
    fn finish(mut self) -> [GoldilocksDigest384V1; LANES] {
        self.absorb_same(1);
        if self.position != 0 {
            permute_x4(&mut self.state);
        }
        core::array::from_fn(|lane| {
            GoldilocksDigest384V1::new(core::array::from_fn(|word| self.state[word][lane]))
                .expect("permutation outputs canonical residues")
        })
    }
}

fn framed_sponge_x4(
    domain: &GoldilocksDigestDomainV1<'_>,
    indices: [u64; LANES],
    field_count: usize,
) -> Sponge4 {
    let prefix = prefix_sponge([
        domain.catalog,
        domain.protocol,
        domain.profile,
        domain.role,
        domain.phase,
    ]);
    let mut sponge = Sponge4::from_single(&prefix);
    let level = domain.level.to_le_bytes();
    sponge.bytes_lanes(7, [&level; LANES]);
    let index_bytes = indices.map(u64::to_le_bytes);
    sponge.bytes_lanes(8, core::array::from_fn(|lane| index_bytes[lane].as_slice()));
    let counter = domain.counter.to_le_bytes();
    sponge.bytes_lanes(9, [&counter; LANES]);
    sponge.absorb_same(10);
    sponge.absorb_same(field_count as u64);
    sponge
}

/// Four [`hash_bytes_384_v1`] calls that differ only in `index` and field contents.
///
/// Every lane must supply the same number of fields with equal lengths.
pub(crate) fn hash_bytes_384_x4_v1(
    domain: GoldilocksDigestDomainV1<'_>,
    indices: [u64; LANES],
    fields: [&[&[u8]]; LANES],
) -> Option<[GoldilocksDigest384V1; LANES]> {
    let count = fields[0].len();
    if fields.iter().any(|lane| lane.len() != count)
        || (0..count).any(|field| fields.iter().any(|lane| lane[field].len() != fields[0][field].len()))
        || !domain_fits(&domain, count)
        || fields[0].iter().any(|field| u32::try_from(field.len()).is_err())
    {
        return None;
    }
    let mut sponge = framed_sponge_x4(&domain, indices, count);
    for field in 0..count {
        sponge.bytes_lanes(11 + field as u64, core::array::from_fn(|lane| fields[lane][field]));
    }
    Some(sponge.finish())
}

/// Four [`hash_fields_then_be_u64s_384_v1`] calls with shared leading fields and value count.
pub(crate) fn hash_fields_then_be_u64s_384_x4_v1(
    domain: GoldilocksDigestDomainV1<'_>,
    indices: [u64; LANES],
    leading: &[&[u8]],
    count: usize,
    value: impl Fn(usize) -> [u64; LANES],
) -> Option<[GoldilocksDigest384V1; LANES]> {
    let field_count = leading.len() + 1;
    if !domain_fits(&domain, field_count)
        || leading.iter().any(|field| u32::try_from(field.len()).is_err())
        || count
            .checked_mul(8)
            .is_none_or(|bytes| u32::try_from(bytes).is_err())
    {
        return None;
    }
    let mut sponge = framed_sponge_x4(&domain, indices, field_count);
    for (index, bytes) in leading.iter().enumerate() {
        sponge.bytes_lanes(11 + index as u64, [*bytes; LANES]);
    }
    sponge.be_u64_bytes_lanes(11 + leading.len() as u64, count, value);
    Some(sponge.finish())
}

/// Incremental final field under exactly the same execution framing as the one-shot function.
#[cfg(test)]
#[derive(Clone)]
pub(crate) struct LastFieldStream {
    sponge: Sponge,
    expected: usize,
    received: usize,
    pending: [u8; 7],
    pending_len: usize,
}
#[cfg(test)]
impl LastFieldStream {
    pub(crate) fn new(
        domain: GoldilocksDigestDomainV1<'_>,
        prefix: &[&[u8]],
        expected: usize,
    ) -> Result<Self, StreamError> {
        let domain_fields = [
            domain.catalog,
            domain.protocol,
            domain.profile,
            domain.role,
            domain.phase,
        ];
        let total = prefix
            .len()
            .checked_add(1)
            .ok_or(StreamError::FramingLimitExceeded)?;
        if u32::try_from(total).is_err()
            || u32::try_from(expected).is_err()
            || domain_fields
                .iter()
                .chain(prefix.iter())
                .any(|field| u32::try_from(field.len()).is_err())
        {
            return Err(StreamError::FramingLimitExceeded);
        }
        let mut sponge = Sponge::new();
        sponge.bytes(1, FRAME);
        for (index, bytes) in domain_fields.into_iter().enumerate() {
            sponge.bytes(2 + index as u64, bytes);
        }
        sponge.bytes(7, &domain.level.to_le_bytes());
        sponge.bytes(8, &domain.index.to_le_bytes());
        sponge.bytes(9, &domain.counter.to_le_bytes());
        sponge.absorb(10);
        sponge.absorb(total as u64);
        for (index, bytes) in prefix.iter().enumerate() {
            sponge.bytes(11 + index as u64, bytes);
        }
        sponge.absorb(11 + prefix.len() as u64);
        sponge.absorb(expected as u64);
        Ok(Self {
            sponge,
            expected,
            received: 0,
            pending: [0; 7],
            pending_len: 0,
        })
    }
    pub(crate) fn update(&mut self, bytes: &[u8]) -> Result<(), StreamError> {
        if bytes.len() > self.expected - self.received {
            return Err(StreamError::InputOverrun {
                expected: self.expected,
                received: self.received,
                additional: bytes.len(),
            });
        }
        for byte in bytes {
            self.pending[self.pending_len] = *byte;
            self.pending_len += 1;
            if self.pending_len == 7 {
                let mut word = [0; 8];
                word[..7].copy_from_slice(&self.pending);
                self.sponge.absorb(u64::from_le_bytes(word));
                self.pending = [0; 7];
                self.pending_len = 0;
            }
        }
        self.received += bytes.len();
        Ok(())
    }
    pub(crate) fn finalize(mut self) -> Result<GoldilocksDigest384V1, StreamError> {
        if self.received != self.expected {
            return Err(StreamError::InputUnderrun {
                expected: self.expected,
                received: self.received,
            });
        }
        let mut word = [0; 8];
        word[..self.pending_len].copy_from_slice(&self.pending[..self.pending_len]);
        word[self.pending_len] = 1;
        self.sponge.absorb(u64::from_le_bytes(word));
        Ok(self.sponge.finish())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn published_plonky3_width16_permutation_vector() {
        let mut state = constants::UPSTREAM_INPUT;
        permute(&mut state);
        assert_eq!(state, constants::UPSTREAM_OUTPUT);
    }
    /// The original permutation: canonical reductions after every operation.
    #[test]
    fn specialized_internal_diagonal_matches_generic_products() {
        let mut seed = 0x9e37_79b9_7f4a_7c15_u64;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        let edges = [
            0,
            1,
            2,
            MODULUS - 1,
            MODULUS,
            MODULUS + 1,
            u64::MAX,
            u64::MAX - 1,
            1 << 32,
            (1 << 32) - 1,
            1 << 63,
        ];
        for index in 0..WIDTH {
            let mut words: Vec<u64> = edges.to_vec();
            words.extend((0..20_000).map(|_| next()));
            for x in words {
                let mut sums: Vec<u64> = edges.to_vec();
                sums.extend([next(), next()]);
                for sum in sums {
                    let generic = canonicalize(reduce_lazy(
                        u128::from(x) * u128::from(INTERNAL_DIAGONAL[index]) + u128::from(sum),
                    ));
                    assert_eq!(
                        canonicalize(internal_diagonal_word(index, x, sum)),
                        generic,
                        "index {index} x {x:#x} sum {sum:#x}"
                    );
                }
            }
        }
    }

    fn reference_permute(state: &mut [u64; WIDTH]) {
        fn reference_external(state: &mut [u64; WIDTH]) {
            for block in state.chunks_exact_mut(4) {
                let before: [u64; 4] = block.try_into().expect("four-word block");
                for row in 0..4 {
                    block[row] = [2_u64, 3, 1, 1]
                        .into_iter()
                        .enumerate()
                        .fold(0, |sum, (col, weight)| {
                            add(sum, reduce(u128::from(weight) * u128::from(before[(row + col) % 4])))
                        });
                }
            }
            let sums: [u64; 4] = core::array::from_fn(|column| {
                (column..WIDTH)
                    .step_by(4)
                    .fold(0, |sum, index| add(sum, state[index]))
            });
            for (index, word) in state.iter_mut().enumerate() {
                *word = add(*word, sums[index % 4]);
            }
        }
        let mul = |a: u64, b: u64| reduce(u128::from(a) * u128::from(b));
        let pow7 = |a: u64| {
            let square = mul(a, a);
            mul(mul(mul(square, square), square), a)
        };
        reference_external(state);
        for constants in EXTERNAL_INITIAL {
            for (word, constant) in state.iter_mut().zip(constants) {
                *word = pow7(add(*word, constant));
            }
            reference_external(state);
        }
        for constant in INTERNAL {
            state[0] = pow7(add(state[0], constant));
            let sum = state.iter().copied().fold(0, add);
            for (word, diagonal) in state.iter_mut().zip(INTERNAL_DIAGONAL) {
                *word = add(mul(*word, diagonal), sum);
            }
        }
        for constants in EXTERNAL_FINAL {
            for (word, constant) in state.iter_mut().zip(constants) {
                *word = pow7(add(*word, constant));
            }
            reference_external(state);
        }
    }
    fn random_canonical(rng: &mut u64) -> u64 {
        loop {
            *rng ^= *rng << 13;
            *rng ^= *rng >> 7;
            *rng ^= *rng << 17;
            if *rng < MODULUS {
                return *rng;
            }
        }
    }
    #[test]
    fn lazy_and_lockstep_permutations_match_the_canonical_reference() {
        let mut rng = 0x9e37_79b9_7f4a_7c15_u64;
        let edge = [0, 1, MODULUS - 1, MODULUS - 2, 0xffff_ffff, 0x1_0000_0000];
        for round in 0..256 {
            let states: [[u64; WIDTH]; LANES] = core::array::from_fn(|lane| {
                core::array::from_fn(|word| {
                    if round < 4 {
                        edge[(lane + word + round) % edge.len()]
                    } else {
                        random_canonical(&mut rng)
                    }
                })
            });
            let mut lockstep: State4 =
                core::array::from_fn(|word| core::array::from_fn(|lane| states[lane][word]));
            permute_x4(&mut lockstep);
            for (lane, state) in states.iter().enumerate() {
                let (mut fast, mut reference) = (*state, *state);
                permute(&mut fast);
                reference_permute(&mut reference);
                assert_eq!(fast, reference);
                assert_eq!(core::array::from_fn::<_, WIDTH, _>(|word| lockstep[word][lane]), reference);
            }
        }
    }
    #[test]
    fn lazy_reduction_is_congruent_and_below_two_to_sixty_four() {
        let mut rng = 0x2545_f491_4f6c_dd1d_u64;
        let mut values = vec![0, 1, u128::MAX, u128::from(MODULUS) * u128::from(MODULUS)];
        values.extend((0..100_000).map(|_| {
            let high = random_canonical(&mut rng) as u128 | ((rng & 1) as u128) << 63;
            (high << 64) | u128::from(rng)
        }));
        for value in values {
            let lazy = reduce_lazy(value);
            assert_eq!(u128::from(lazy) % u128::from(MODULUS), value % u128::from(MODULUS));
            assert_eq!(u128::from(reduce(value)), value % u128::from(MODULUS));
        }
    }
    #[test]
    fn lockstep_and_streamed_frames_match_one_shot_hashes() {
        let mut rng = 0x6a09_e667_f3bc_c908_u64;
        for size in [0_usize, 1, 6, 7, 8, 13, 14, 55, 56, 57, 392] {
            let roles: [&[u8]; 3] = [b"leaf-a", b"node-b", b"leaf-c"];
            for (counter, role) in roles.iter().enumerate() {
                let domain = GoldilocksDigestDomainV1 {
                    catalog: b"catalog",
                    protocol: b"execution-v1",
                    profile: b"race-v1",
                    role,
                    phase: b"row",
                    level: 3,
                    index: 0,
                    counter: counter as u64,
                };
                let indices: [u64; LANES] = core::array::from_fn(|lane| (size * 31 + lane) as u64);
                let values: [Vec<u64>; LANES] =
                    core::array::from_fn(|_| (0..size).map(|_| random_canonical(&mut rng)).collect());
                let bytes: [Vec<u8>; LANES] = core::array::from_fn(|lane| {
                    values[lane].iter().flat_map(|value| value.to_be_bytes()).collect()
                });
                let lead = [b"ab".as_slice(), b"cdefghij".as_slice()];
                let fields: [[&[u8]; 3]; LANES] =
                    core::array::from_fn(|lane| [lead[0], lead[1], bytes[lane].as_slice()]);
                let lockstep = hash_bytes_384_x4_v1(
                    domain,
                    indices,
                    core::array::from_fn(|lane| &fields[lane][..]),
                )
                .unwrap();
                let streamed = hash_fields_then_be_u64s_384_x4_v1(domain, indices, &lead, size, |k| {
                    core::array::from_fn(|lane| values[lane][k])
                })
                .unwrap();
                for lane in 0..LANES {
                    let one_shot = hash_bytes_384_v1(
                        GoldilocksDigestDomainV1 {
                            index: indices[lane],
                            ..domain
                        },
                        &fields[lane],
                    )
                    .unwrap();
                    let single = hash_fields_then_be_u64s_384_v1(
                        GoldilocksDigestDomainV1 {
                            index: indices[lane],
                            ..domain
                        },
                        &lead,
                        values[lane].iter().copied(),
                    )
                    .unwrap();
                    assert_eq!(lockstep[lane], one_shot);
                    assert_eq!(streamed[lane], one_shot);
                    assert_eq!(single, one_shot);
                }
            }
        }
    }
    #[test]
    fn prefix_cache_eviction_never_changes_a_digest() {
        let profiles: Vec<Vec<u8>> = (0..PREFIX_CACHE_ENTRIES * 2 + 3)
            .map(|index| format!("profile-{index}").into_bytes())
            .collect();
        let digest = |profile: &[u8]| {
            hash_bytes_384_v1(
                GoldilocksDigestDomainV1 {
                    catalog: b"catalog",
                    protocol: b"execution-v1",
                    profile,
                    role: b"leaf",
                    phase: b"row",
                    level: 0,
                    index: 9,
                    counter: 0,
                },
                &[b"payload"],
            )
            .unwrap()
        };
        let first: Vec<_> = profiles.iter().map(|profile| digest(profile)).collect();
        for _ in 0..3 {
            for (index, profile) in profiles.iter().enumerate().rev() {
                assert_eq!(digest(profile), first[index]);
            }
        }
    }
    #[test]
    fn reduction_matches_full_width_modulo_reference() {
        let mut rng = 0x6a09_e667_f3bc_c908_u64;
        for _ in 0..100_000 {
            rng ^= rng << 13;
            rng ^= rng >> 7;
            rng ^= rng << 17;
            let high = rng;
            rng ^= rng << 13;
            rng ^= rng >> 7;
            rng ^= rng << 17;
            let value = u128::from(high) << 64 | u128::from(rng);
            assert_eq!(reduce(value), (value % u128::from(MODULUS)) as u64);
        }
    }
    #[test]
    fn frame_separates_fields_domains_and_padding() {
        let domain = GoldilocksDigestDomainV1 {
            catalog: b"catalog",
            protocol: b"execution-v1",
            profile: b"race-v1",
            role: b"leaf",
            phase: b"row",
            level: 0,
            index: 0,
            counter: 0,
        };
        let empty = hash_bytes_384_v1(domain, &[]).unwrap();
        assert_ne!(empty, hash_bytes_384_v1(domain, &[b""]).unwrap());
        for size in 0..130 {
            let bytes = vec![0; size];
            let zero_extended = vec![0; size + 1];
            let digest = hash_bytes_384_v1(domain, &[&bytes]).unwrap();
            assert_ne!(
                digest,
                hash_bytes_384_v1(domain, &[&zero_extended]).unwrap()
            );
            assert_ne!(digest, hash_bytes_384_v1(domain, &[&bytes, b""]).unwrap());
            assert_ne!(
                digest,
                hash_bytes_384_v1(GoldilocksDigestDomainV1 { index: 1, ..domain }, &[&bytes])
                    .unwrap()
            );
        }
    }
    #[test]
    fn incremental_field_matches_every_split_and_fails_atomically() {
        let domain = GoldilocksDigestDomainV1 {
            catalog: b"catalog",
            protocol: b"execution-v1",
            profile: b"race-v1",
            role: b"leaf",
            phase: b"row",
            level: 0,
            index: u64::MAX,
            counter: u64::MAX,
        };
        for size in 0..130 {
            let bytes: Vec<_> = (0..size).map(|i| i as u8).collect();
            let expected = hash_bytes_384_v1(domain, &[b"prefix", &bytes]).unwrap();
            for split in 0..=size {
                let mut stream = LastFieldStream::new(domain, &[b"prefix"], size).unwrap();
                assert!(stream.update(&vec![0; size + 1]).is_err());
                stream.update(&bytes[..split]).unwrap();
                if split != size {
                    assert!(stream.clone().finalize().is_err());
                }
                stream.update(&bytes[split..]).unwrap();
                assert_eq!(stream.finalize().unwrap(), expected);
            }
        }
    }
}
