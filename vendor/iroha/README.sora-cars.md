# Iroha inputs for SORA Cars

The JavaScript SDK, native-generated game fixtures, Taira runtime configuration and Rust files referenced by the game's Stock and Touring parity inventories come from signed Iroha commit `7667e62b72bb48d3891269d39e69fc4437f43439`. The full original `javascript/iroha_js` tree at this commit has Git object ID `4cbbe970315e0b416795ac8b18038687d63d52d7`. The repository retains the runtime source, its declarations, build and test inputs, and Apache-2.0 licenses. `npm ci` builds `dist/` from those sources. The source-bound Stock proof profile begins with `d0061f99`.

The Node address and transaction codec uses a platform-specific addon. The `vendor/iroha-js-native` Git submodule pins its publicly retrievable Iroha source at `c000f91384ff1b1d82a3c9e5c3b10f30139763e4`. The `crates/iroha_js_host` subtree is identical in the two revisions. `npm run prepare:native` runs the upstream build and publication scripts against the clean public checkout and checks the addon's digest and source revision before reuse. The game proof bytes come from the signed SDK revision above.

Generating new game exports requires a full Iroha checkout and an independently pinned native game CLI. The game's generation commands verify their source and executable inputs separately. Production qualification and live staking retain their existing release checks.
