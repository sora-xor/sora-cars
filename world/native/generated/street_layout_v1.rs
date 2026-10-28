//! Portable Street scalar layout shared with checked graph generation.
//!
//! This module uses only the Rust standard library. Its bounds and codecs do
//! not establish reachability, consensus authority or compiled-profile admission.

/// Number of persistent global words before the car records.
pub const STATE_HEADER_FIELDS: [&str; 3] = ["tick", "done", "worldBrokenMask"];
/// Exact persistent car word order in the checked Street relation.
pub const CAR_FIELDS: [&str; 11] = [
    "progressMm",
    "lateralMm",
    "speedMmPerTick",
    "bodyYawMicroturn",
    "velocityYawMicroturn",
    "energy",
    "nextGate",
    "status",
    "finishTick",
    "finishNumerator",
    "finishDenominator",
];
/// Minimum multiplayer roster size.
pub const MIN_ROSTER: usize = 2;
/// Maximum multiplayer roster size.
pub const MAX_ROSTER: usize = 8;
/// Literal control bytes per complete commitment/reveal batch.
pub const CONTROL_BATCH_TICKS: usize = 6;
/// Permitted throttle/brake/left/right/drift/boost bits.
pub const CONTROL_MASK: u8 = 63;
/// Running status tag.
pub const RUNNING: i64 = 0;
/// Finished status tag.
pub const FINISHED: i64 = 1;
/// Removed status tag.
pub const FORFEIT: i64 = 2;
/// Timed-out status tag.
pub const TIMEOUT: i64 = 3;
/// Native Goldilocks prime; scalar words must be strictly smaller.
pub const GOLDILOCKS_MODULUS: u64 = 0xffff_ffff_0000_0001;
/// Largest positive integer in the unique centered field representation.
pub const MAX_SIGNED_REPRESENTATIVE: i64 = ((GOLDILOCKS_MODULUS - 1) / 2) as i64;

/// Invalid bounded layout, scalar encoding, or literal input payload.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LayoutError {
    /// Roster or permanent slot lies outside the shared layout.
    Roster,
    /// Tick cap or milestone count lies outside LifecycleSpec bounds.
    Dimensions,
    /// A field word is noncanonical or outside its requested integer interval.
    Scalar,
    /// A signed integer has no admitted centered representative.
    Signed,
    /// A control payload is not exactly six literal six-bit bytes.
    Controls,
    /// Bounded allocation failed.
    Allocation,
}
impl std::fmt::Display for LayoutError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Street layout: {self:?}")
    }
}
impl std::error::Error for LayoutError {}

/// Exact car input intervals used by every valid Street LifecycleSpec.
pub fn car_bounds(max_ticks: i64, gate_count: usize) -> Result<[(i64, i64); 11], LayoutError> {
    if !(30..=9_000).contains(&max_ticks) || !(2..=64).contains(&gate_count) {
        return Err(LayoutError::Dimensions);
    }
    Ok([
        (-12_000, 80_006_000),
        (-16_000, 16_000),
        (0, 3_000),
        (-500_000, 499_999),
        (-500_000, 499_999),
        (0, 1_000),
        (0, gate_count as i64),
        (RUNNING, TIMEOUT),
        (0, max_ticks),
        (0, 6_000),
        (1, 6_000),
    ])
}

/// Exact original car state for one permanent slot, without action ports.
pub fn initial_car(slot: usize) -> Result<[i64; 11], LayoutError> {
    if slot >= MAX_ROSTER {
        return Err(LayoutError::Roster);
    }
    let row = (slot / 2) as i64;
    let lateral = if slot % 2 == 0 { -950 } else { 950 };
    Ok([
        -1 - 3_999 * row,
        lateral,
        0,
        0,
        0,
        1_000,
        0,
        RUNNING,
        0,
        0,
        1,
    ])
}

/// Exact persistent word count, excluding action and ranking ports.
pub fn state_words(roster: usize) -> Result<usize, LayoutError> {
    if !(MIN_ROSTER..=MAX_ROSTER).contains(&roster) {
        return Err(LayoutError::Roster);
    }
    Ok(STATE_HEADER_FIELDS.len() + CAR_FIELDS.len() * roster)
}

/// Exact terminal boundary word count, including flags and ordered rank/winner pairs.
pub fn terminal_words(roster: usize) -> Result<usize, LayoutError> {
    Ok(state_words(roster)? + 2 + 2 * roster)
}

/// Build the original signed persistent genesis, before any boundary removal.
pub fn genesis(roster: usize) -> Result<Vec<i64>, LayoutError> {
    let count = state_words(roster)?;
    let mut values = Vec::new();
    values
        .try_reserve_exact(count)
        .map_err(|_| LayoutError::Allocation)?;
    values.extend([0, 0, 0]);
    for slot in 0..roster {
        values.extend(initial_car(slot)?);
    }
    Ok(values)
}

/// Encode one signed centered representative, rejecting values that would alias.
pub fn signed_to_word(value: i64) -> Result<u64, LayoutError> {
    if !(-MAX_SIGNED_REPRESENTATIVE..=MAX_SIGNED_REPRESENTATIVE).contains(&value) {
        return Err(LayoutError::Signed);
    }
    Ok(if value < 0 {
        GOLDILOCKS_MODULUS - value.unsigned_abs()
    } else {
        value as u64
    })
}

/// Decode a canonical field word to its unique centered signed representative.
pub fn word_to_signed(word: u64) -> Result<i64, LayoutError> {
    if word >= GOLDILOCKS_MODULUS {
        return Err(LayoutError::Scalar);
    }
    Ok(if word <= MAX_SIGNED_REPRESENTATIVE as u64 {
        word as i64
    } else {
        -((GOLDILOCKS_MODULUS - word) as i64)
    })
}

/// Decode a scalar only if it is also inside the exact logical input interval.
pub fn decode_word(word: u64, low: i64, high: i64) -> Result<i64, LayoutError> {
    if low > high || low < -MAX_SIGNED_REPRESENTATIVE || high > MAX_SIGNED_REPRESENTATIVE {
        return Err(LayoutError::Scalar);
    }
    let value = word_to_signed(word)?;
    if !(low..=high).contains(&value) {
        return Err(LayoutError::Scalar);
    }
    Ok(value)
}

/// Build genesis in canonical Goldilocks words; there is no alternate signed-byte wire.
pub fn genesis_words(roster: usize) -> Result<Vec<u64>, LayoutError> {
    let count = state_words(roster)?;
    let mut words = Vec::new();
    words
        .try_reserve_exact(count)
        .map_err(|_| LayoutError::Allocation)?;
    words.extend([0, 0, 0]);
    for slot in 0..roster {
        for value in initial_car(slot)? {
            words.push(signed_to_word(value)?);
        }
    }
    Ok(words)
}

/// Accept only a complete literal six-u6 batch, never the stock twelve-byte encoding.
pub fn validate_controls(payload: &[u8]) -> Result<[u8; CONTROL_BATCH_TICKS], LayoutError> {
    if payload.len() != CONTROL_BATCH_TICKS || payload.iter().any(|&word| word > CONTROL_MASK) {
        return Err(LayoutError::Controls);
    }
    payload.try_into().map_err(|_| LayoutError::Controls)
}
