# ネイティブNFTガレージ / Native NFT garage

The generic Iroha marketplace uses `OfferNftV1`, `BuyNftV1`, and
`CancelNftOfferV1`. It does not depend on racing, an operator settlement server,
or a buyer permission that could transfer the NFT without paying.

The authenticated current owner lists one NFT with a positive exact fungible
price, an optional reserved buyer, and a consensus-height expiry. Listing moves
the NFT into a derived non-signable custody account and freezes its complete
native metadata commitment. While reserved, ordinary NFT transfers, metadata
changes, deletion, and domain deletion are rejected, including operations by
the NFT domain owner. Original wallets and custody identities are protected
against account deletion and rekeying. Custody purpose separates sale offers
from generic game stakes.

`BuyNftV1` contains the entire immutable `NftSaleOfferV1`: network, offer ID,
NFT ID, seller, payment asset, exact price, expiry, reserved buyer, and metadata
hash. Consensus compares these terms with the retained open offer, preflights
NFT delivery, then executes the buyer's exact payment and delivery atomically.
Native fungible issuer controls remain in force. A failed payment preserves
the open listing and its reserved NFT; sellers can cancel. After the expiry
height anyone can return the NFT to the original owner. Permanent terminal
records reject duplicate purchase and reused offer IDs.

Inventory and offers come directly from Torii. These reads are explicitly
endpoint-reported, and pagination is bounded. A successful locally validated
wallet signature does not itself authenticate ledger inclusion or finality.
The existing native NFT model also permits domain-owner transfers after an
NFT has left custody; purchased ownership does not remove that issuer policy.

The release catalog pins the application ID, canonical NFT domain, XOR asset
definition, approved primary sellers, SKU, item kind, and exact content hash.
Metadata must identify the SKU under
`sora_cars: {version: 1, application_id, sku, kind}`. The entire metadata map is
hashed using canonical native Norito bytes through `nftContentHashV1`.
Presentation uses reviewed local assets only. An arbitrary NFT or image URL
cannot enable a garage item. Performance effects additionally require the
appropriate versioned native simulation/proof relation.

`RaceChainClient` exposes `listOwnedNfts`, `listNftOffers`, `getNftOffer`,
`reviewNftOffer`, `purchaseNft`, `transferOwnedNft`, and `submitJoinWithItem`. `ChainConfig.nftCatalog`
contains the reviewed catalog. `purchaseNft` refreshes the exact terms and
custody/content before constructing `BuyNftV1` locally. Transaction fees remain
separate signed wallet limits.

`submitJoinWithItem` accepts exactly one `JoinGameSessionV1` followed by one
`StakeGameItemV1` for the same session. It refreshes NFT ownership and pins the
wallet generation before signing both instructions in one atomic transaction.
It is not a general batch-signing interface.

Checkout also requires `nftMarketQualified: true`, the exact reviewed
`nftMarketProfileId`, and a matching qualified response from
`/v1/nft-offers/capabilities`. None is inferred from offer endpoint existence.
The native qualification flag remains false pending custody/atomicity regression
execution and rollout review. Native codec parity has passed against the actual
compiled Rust model: values, all three instruction archives, explicit tagged-unit
JSON content, native metadata hashing, and immutable offer hashing. Existing owned-item
transfers remain available independently of marketplace qualification.

Native gates:

- `cargo iroha-fast -- test -p iroha_data_model --test iroha_data_model_group_02 nft_market_v1_codec`
- `cargo iroha-fast -- test -p iroha_core --lib smartcontracts::isi::nft_market::tests`
- `node --test test/nft.browser.test.js` inside the JavaScript SDK.
- `npx tsx --test tests/inventory.test.ts tests/chain.test.ts` inside SORA CARS.
- `npm run test:wallet` inside SORA CARS.

The browser wallet test uses the real `RaceChainClient` and Connect SDK, actual
WebSockets, X25519/HKDF/ChaCha20-Poly1305 transport, canonical Norito signable
validation, and Ed25519 signatures. Its local Torii and test wallet counterpart
are explicit mocks. It checks atomic join/item signing, the exact 7.5 XOR purchase
with a separate 0.25 XOR fee cap, changed ownership and quotes, stale wallet
generation, cross-session and extra instructions, invalid transaction signatures,
and a signed approval bound to another network. Its report is
`output/playwright/wallet/qualification.json`; it does not authenticate the mock
ledger's reported transaction status.

Source and browser tests do not establish a completed native runtime gate,
deployed wallet interoperability, or live Taira activation.
