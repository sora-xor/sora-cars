//! Raw, streaming FIPS 202 SHA3-384, without ledger hash marking or field reduction.
//!
//! Callers must supply unambiguous protocol framing and enforce input bounds.
//! Chunk boundaries do not domain-separate otherwise identical concatenations.

use sha3::{Digest as _, Sha3_384};

/// Unfinished SHA3-384 state; finalization consumes the complete state.
pub struct Sha3_384State(Sha3_384);

impl std::fmt::Debug for Sha3_384State {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Sha3_384State")
            .finish_non_exhaustive()
    }
}

impl Default for Sha3_384State {
    fn default() -> Self {
        Self::new()
    }
}

impl Sha3_384State {
    /// Start hashing an empty byte string.
    #[must_use]
    pub fn new() -> Self {
        Self(Sha3_384::new())
    }

    /// Append all supplied bytes, without allocating an input-sized buffer.
    pub fn update(&mut self, bytes: &[u8]) {
        self.0.update(bytes);
    }

    /// Return the exact 48 raw SHA3-384 bytes, with no bit masking or conversion.
    #[must_use]
    pub fn finalize(self) -> [u8; 48] {
        self.0.finalize().into()
    }
}

/// Hash the concatenation of the supplied byte strings using SHA3-384.
#[must_use]
pub fn sha3_384(parts: &[&[u8]]) -> [u8; 48] {
    let mut state = Sha3_384State::new();
    for part in parts {
        state.update(part);
    }
    state.finalize()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fips_202_empty_and_abc_vectors() {
        for (message, expected) in [
            (
                &b""[..],
                "0c63a75b845e4f7d01107d852e4c2485c51a50aaaa94fc61995e71bbee983a2ac3713831264adb47fb6bd1e058d5f004",
            ),
            (
                &b"abc"[..],
                "ec01498288516fc926459f58e2c6ad8df9b473cb0fc08c2596da7cf0e49be4b298d88cea927ac7f539f1edf228376d25",
            ),
        ] {
            assert_eq!(hex::encode(sha3_384(&[message])), expected);
        }
    }

    #[test]
    fn independently_computed_multiblock_vector_and_every_split() {
        // Python hashlib.sha3_384/OpenSSL, 200 ASCII 'a' bytes; crosses the 104-byte rate.
        let message = [b'a'; 200];
        let expected = "f97756776c1874724c94a8008f7f155553b4bf00fbf8fbeac246624ad59c258a3c0977d9f2543d7cbd75b9ac8fdc0d40";
        for split in 0..=message.len() {
            let mut state = Sha3_384State::default();
            state.update(&message[..split]);
            state.update(&[]);
            state.update(&message[split..]);
            assert_eq!(hex::encode(state.finalize()), expected);
        }
    }
}
