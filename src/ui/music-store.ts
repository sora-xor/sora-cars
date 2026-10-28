import type { RaceChainClient } from '../chain/client';
import { musicInventory, type MusicNft, type MusicOffer } from '../chain/inventory';
import { sameAccountIdentity } from '../chain/account-identity';
import { MUSIC_ITEMS, MUSIC_LICENSE, musicItem, type MusicFile } from '../game/music-catalog';

const esc = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const dual = (ja: string, en: string) => `<span lang="ja">${esc(ja)}</span><small lang="en">${esc(en)}</small>`;
const time = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
const url = (path: string) => `${import.meta.env.BASE_URL}${path}`;
interface MusicHost {
  client: () => RaceChainClient; screen: HTMLElement; active: () => boolean;
  showDialog: (html: string) => void; closeDialog: () => void; notify: (message: string) => void;
}
interface Checkout {
  quote: MusicOffer['quote']; client: RaceChainClient; owner: string; sku: string;
  feeAsset: string; field: HTMLInputElement; consent: HTMLInputElement; dialog: HTMLDialogElement;
}
/** Release-pinned files and fresh wallet inventory; local playback never grants a license. */
export class MusicStore {
  #host: MusicHost;
  #selected = MUSIC_ITEMS[0]!.sku;
  #items: MusicNft[] = []; #offers: MusicOffer[] = [];
  #client: RaceChainClient | null = null; #owner: string | null = null;
  #generation = 0; #sessionEpoch = 0; #review = 0; #loading = false; #purchasing = false; #downloading = false;
  #cursor: string | null = null; #status = ''; #checkout: Checkout | null = null;
  #receipt: { hash: string; nftId: string; sku: string } | null = null;
  #player = new Audio(); #playRevision = 0; #previewSku: string | null = null;
  #abort: AbortController | null = null;
  constructor(host: MusicHost) {
    this.#host = host; this.#player.preload = 'none'; this.#player.volume = .7;
    document.querySelector('#app')!.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-record]');
      if (target && !target.disabled && host.active()) void this.action(target.dataset.record!).catch(e => host.notify(e instanceof Error ? e.message : String(e)));
    });
    host.screen.addEventListener('input', event => {
      const target = event.target as HTMLInputElement;
      if (target.id === 'record-seek' && Number.isFinite(this.#player.duration)) this.#player.currentTime = Number(target.value);
      if (target.id === 'record-volume') this.#player.volume = Number(target.value) / 100;
    });
    for (const name of ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended']) this.#player.addEventListener(name, () => this.#updatePlayer());
    this.#player.addEventListener('error', () => { if (this.#previewSku && host.active()) host.notify('試聴を読み込めませんでした。 / Preview could not be loaded.'); });
    const dialog = document.querySelector<HTMLDialogElement>('#dialog');
    dialog?.addEventListener('cancel', () => this.#clearCheckout());
    dialog?.addEventListener('close', () => { if (!dialog.open) this.#clearCheckout(); });
  }
  get state() {
    this.invalidate();
    return { selected: this.#selected, tracks: MUSIC_ITEMS.length, owned: this.#items.map(i => i.nftId), loading: this.#loading, downloading: this.#downloading, preview: { sku: this.#previewSku, playing: !this.#player.paused, seconds: this.#player.currentTime }, purchase: this.#receipt ? { ...this.#receipt, received: this.#items.some(i => i.nftId === this.#receipt!.nftId), verification: 'endpoint_reported' } : null };
  }
  #clearCheckout(): void { this.#checkout = null; ++this.#review; }
  invalidate(): void {
    const client = this.#host.client();
    if (client === this.#client && client.state.account === this.#owner) return;
    ++this.#generation; ++this.#sessionEpoch; this.#abort?.abort(); this.#client = client; this.#owner = client.state.account;
    this.#clearCheckout(); this.#items = []; this.#offers = []; this.#cursor = null; this.#status = ''; this.#receipt = null; this.#loading = false;
  }
  close(): void {
    ++this.#generation; ++this.#sessionEpoch; ++this.#playRevision; this.#player.pause(); this.#player.removeAttribute('src'); this.#player.load(); this.#previewSku = null;
    this.#abort?.abort(); this.#clearCheckout(); this.#loading = false;
  }
  render(): void {
    if (!this.#host.active()) return;
    this.invalidate();
    const item = musicItem(this.#selected)!, client = this.#host.client();
    const owned = this.#items.find(n => n.sku === item.sku), offers = this.#offers.filter(o => o.item.sku === item.sku);
    const configured = client.config.nftCatalog?.items.some(i => i.kind === 'music');
    const scroll = this.#host.screen.querySelector('.record-shop')?.scrollTop ?? 0;
    const focused = (document.activeElement as HTMLElement | null)?.dataset.record;
    const receipt = this.#receipt, received = receipt && this.#items.some(n => n.nftId === receipt.nftId);
    this.#host.screen.innerHTML = `<div class="record-shop" data-bilingual><div class="record-masthead"><div><span>SORA</span><h1>RECORDS<span>レコード</span></h1></div><p>ORIGINAL SOUNDTRACK<br>JAPAN, 1986 — VOL. 01</p></div>
      <section class="record-feature" aria-label="Selected recording"><figure class="record-sleeve"><img src="${url(item.assets?.cover.path ?? `assets/music/covers/${item.file}-v1.png`)}" alt="${esc(item.name.en)} — illustrated record sleeve" width="1254" height="1254" fetchpriority="high"><figcaption><span>SR—${String(item.track + 1).padStart(3, '0')}</span><span>STEREO / ${esc(item.collection.toUpperCase())}</span></figcaption></figure>
      <div class="record-copy"><p class="record-kicker">${esc(item.artist)} / THE SOUND OF TAKING THE LONG WAY HOME.</p><h2>${dual(item.name.ja, item.name.en)}</h2><p class="record-story">${dual(item.description.ja, item.description.en)}</p><p class="record-spec">${time(item.durationSeconds)} &nbsp; / &nbsp; ${item.bpm === null ? esc(item.collection.toUpperCase()) : `${item.bpm} BPM`} &nbsp; / &nbsp; WAV + MP3</p>
      ${item.provenance.kind === 'supplied-lossy-recording' ? `<p class="record-small">${dual('提供されたAAC音源から変換。WAVは元のロスレス録音ではありません。', 'Converted from the supplied AAC recording. The WAV is not an original lossless master.')}</p>` : ''}
      <div class="record-actions"><button class="record-primary" data-record="preview" ${!item.assets ? 'disabled' : ''}>${dual('30秒の試聴', 'LISTEN · 30 SEC')}<b aria-hidden="true">▶</b></button><div class="record-price">1 <b>XOR</b><small>${dual('1曲・NFTと利用許諾', 'PER SONG · NFT + LICENSE')}</small></div></div>
      <p class="record-grant">${dual('好きな場所で、何度でも。', 'YOURS TO USE. AGAIN AND AGAIN.')}</p><p class="record-license-short">${dual('個人・商用利用、リミックス、配信。期間・回数の制限なし、追加ロイヤリティなし。', 'Personal and commercial use, remixes and releases. Unlimited projects. No recurring royalties.')}</p><a class="record-link" href="${url(MUSIC_LICENSE.path)}" target="_blank" rel="noopener">利用許諾の全文 / READ THE LICENSE ↗</a>
      ${owned ? `<div class="record-owned"><h3>${dual('あなたのレコード', 'YOUR RECORD')}</h3><div class="record-downloads">${(['mp3', 'wav', 'cover', 'license'] as const).map(format => `<button data-record="download:${format}" ${this.#downloading ? 'disabled' : ''}>${format === 'cover' ? 'ARTWORK' : format.toUpperCase()} ↓</button>`).join('')}</div><p>${dual('ダウンロード時に現在の所有を確認します。', 'Current ownership is checked for each download.')}</p></div>` : offers.length ? `<div class="record-offers">${offers.slice(0, 4).map(o => `<button class="record-buy" data-record="review:${esc(o.quote.offer.offer_id)}">${dual('NFTを購入', 'REVIEW PURCHASE')} <b>1 XOR ↗</b></button>`).join('')}</div><p class="record-small">${dual('ネットワーク手数料は別途、購入前に確認。', 'Network fees are separate and reviewed before purchase.')}</p>` : `<div class="record-availability"><span class="record-dot"></span><p>${configured ? dual('出品を更新して購入できるNFTを確認。', 'Refresh listings to find available editions.') : dual('発売準備中。全曲を試聴できます。', 'RELEASE IN PREPARATION · LISTEN TO THE COLLECTION')}</p></div>`}
      ${configured ? `<div class="record-release-actions">${!client.state.account ? `<button class="record-secondary" data-action="wallet">${dual('ウォレットを接続', 'CONNECT WALLET')} ↗</button>` : ''}<button class="record-secondary" data-record="refresh" ${this.#loading ? 'disabled' : ''}>${dual(this.#loading ? '読み込み中…' : '購入できるエディションを確認', this.#loading ? 'LOADING…' : 'LOAD EDITIONS · 1 XOR EACH')} ↻</button>${this.#status ? `<p class="record-status" role="status">${esc(this.#status)}</p>` : ''}</div>` : ''}
      </div></section>
      ${receipt ? `<section class="record-receipt" role="status"><h3>${dual(received ? '接続先で受取を確認' : 'NFTの受取を確認中', received ? 'NFT RECEIPT REPORTED BY ENDPOINT' : 'CHECKING NFT DELIVERY')}</h3><p>${dual(received ? '所有一覧に表示されました。ダウンロードを選べます。' : '取引の受理だけではダウンロードは開きません。所有一覧を更新してください。', received ? 'The NFT is in your reported inventory. Downloads are available.' : 'Transaction acceptance alone does not unlock downloads. Refresh inventory to check delivery.')}</p><code>${esc(receipt.hash)}</code><small>${dual('確定は独立検証されていません。', 'Ledger finality is not independently authenticated.')}</small></section>` : ''}
      <section class="record-tracklist" aria-label="All recordings"><div class="record-section-heading"><div><p>THE COMPLETE COLLECTION</p><h2>全${MUSIC_ITEMS.length}曲。<small>FIND YOUR FREQUENCY.</small></h2></div><span>01—${String(MUSIC_ITEMS.length).padStart(2, '0')} / 1 XOR EACH</span></div>
      <div class="record-rows">${MUSIC_ITEMS.map(song => `<button class="record-row ${song.sku === item.sku ? 'selected' : ''}" data-record="select:${song.sku}" aria-pressed="${song.sku === item.sku}"><span class="record-number">${String(song.track + 1).padStart(2, '0')}</span><img src="${url(song.assets?.cover.path ?? `assets/music/covers/${song.file}-v1.png`)}" loading="lazy" width="56" height="56" alt=""><span class="record-name">${dual(song.name.ja, song.name.en)}</span><span class="record-row-meta">${song.bpm === null ? esc(song.collection.toUpperCase()) : `${song.bpm} BPM`}</span><span class="record-row-time">${time(song.durationSeconds)}</span><span class="record-row-price">${this.#items.some(n => n.sku === song.sku) ? 'OWNED' : '1 XOR'}</span><span aria-hidden="true">↗</span></button>`).join('')}</div></section>
      <section class="record-bottom"><div><p class="record-kicker">ONE RECORD. UNLIMITED POSSIBILITIES.</p><h2>${dual('あなたの作品にも、この音を。', 'MAKE SOMETHING WITH IT.')}</h2><p>${dual('音源・楽曲・ジャケットを使える、永久・非独占の利用許諾。NFTを譲った後も取得済みの利用許諾は続きます。著作権や独占権の譲渡ではありません。', 'A perpetual, non-exclusive license for the recording, composition and sleeve. Your grant survives NFT transfer. Copyright and exclusivity are not transferred.')}</p><p>${dual('ゲーム楽曲と提供された録音を収録。複数のライセンス付きエディションを発行できます。ジャケットはAI支援で制作。', 'Includes game compositions and supplied recordings. Multiple licensed editions may be issued. Cover artwork created with AI assistance.')}</p><a class="record-link" href="${url(MUSIC_LICENSE.path)}" target="_blank" rel="noopener">利用許諾を読む / FULL LICENSE ↗</a></div><div class="record-wallet"><h3>${dual('コレクションを開く', 'YOUR COLLECTION')}</h3><p>${dual('ウォレットを接続して、所有する楽曲と出品を確認。', 'Connect your wallet to load owned recordings and listings.')}</p>${!client.state.account ? `<button class="record-secondary" data-action="wallet">${dual('ウォレットを接続', 'CONNECT WALLET')} ↗</button>` : ''}<button class="record-secondary" data-record="refresh" ${!configured || this.#loading ? 'disabled' : ''}>${dual(this.#loading ? '読み込み中…' : '所有・出品を更新', this.#loading ? 'LOADING…' : 'REFRESH INVENTORY & LISTINGS')} ↻</button>${this.#cursor ? `<button class="record-secondary" data-record="more" ${this.#loading ? 'disabled' : ''}>${dual('次の出品', 'MORE LISTINGS')} →</button>` : ''}<p class="record-status" role="status">${esc(this.#status)}</p></div></section><div class="record-signoff">SORA RECORDS<span>音楽は、次の道へ。</span>© SORA CARS</div></div>
      <div class="record-player" data-bilingual aria-label="Preview player"><button data-record="preview" class="record-player-toggle" aria-label="Play or pause preview" ${!item.assets ? 'disabled' : ''}>▶</button><div class="record-player-title">${dual(item.name.ja, item.name.en)}</div><span id="record-clock">0:00 / 0:30</span><input type="range" id="record-seek" min="0" max="30" step="0.1" value="0" aria-label="Preview position"><label class="record-volume">VOL<input type="range" id="record-volume" min="0" max="100" value="${Math.round(this.#player.volume * 100)}" aria-label="Preview volume"></label><span class="record-player-label">30 SEC PREVIEW</span></div>`;
    this.#host.screen.querySelector('.record-shop')!.scrollTop = scroll;
    if (focused) [...this.#host.screen.querySelectorAll<HTMLElement>('[data-record]')].find(n => n.dataset.record === focused)?.focus({ preventScroll: true });
    this.#updatePlayer();
  }
  #updatePlayer(): void {
    if (!this.#host.active()) return;
    const player = this.#player, current = this.#previewSku === this.#selected;
    const clock = this.#host.screen.querySelector('#record-clock');
    if (clock) clock.textContent = `${time(current ? player.currentTime : 0)} / ${time(current && Number.isFinite(player.duration) ? player.duration : 30)}`;
    const seek = this.#host.screen.querySelector<HTMLInputElement>('#record-seek');
    if (seek) { seek.max = String(current && Number.isFinite(player.duration) ? player.duration : 30); seek.value = String(current ? player.currentTime : 0); }
    const toggle = this.#host.screen.querySelector('.record-player-toggle');
    if (toggle) { toggle.textContent = current && !player.paused ? 'Ⅱ' : '▶'; toggle.setAttribute('aria-label', current && !player.paused ? 'Pause preview' : 'Play preview'); }
  }
  async refresh(more = false): Promise<void> {
    this.invalidate(); if (this.#loading) return;
    const client = this.#host.client(), owner = client.state.account, catalog = client.config.nftCatalog;
    if (!catalog?.items.some(i => i.kind === 'music')) throw new Error('発売準備中です。 / Music release is in preparation.');
    const generation = ++this.#generation; this.#loading = true; this.#status = ''; this.render();
    try {
      // Ownership is useful even while the sale endpoint is unavailable.
      const [inventory, listing] = await Promise.allSettled([owner ? client.listOwnedNfts() : Promise.resolve(null), client.listNftOffers(undefined, more ? this.#cursor ?? undefined : undefined)]);
      const reviews: MusicOffer[] = [];
      if (listing.status === 'fulfilled') for (let i = 0; i < listing.value.items.length; i += 4) {
        const batch = await Promise.allSettled(listing.value.items.slice(i, i + 4).map(o => client.reviewMusicNftOffer(o)));
        batch.forEach(r => { if (r.status === 'fulfilled') reviews.push(r.value); });
      }
      if (generation !== this.#generation || client !== this.#host.client() || owner !== client.state.account) return;
      this.#items = inventory.status === 'fulfilled' && inventory.value ? musicInventory(inventory.value, catalog).items : [];
      this.#offers = listing.status === 'fulfilled' ? (more ? [...new Map([...this.#offers, ...reviews].map(o => [o.quote.offer.offer_id, o])).values()].slice(-256) : reviews) : [];
      this.#cursor = listing.status === 'fulfilled' ? listing.value.nextCursor : null;
      this.#status = inventory.status === 'rejected' || listing.status === 'rejected' ? '一部の情報を読み込めませんでした。再度更新してください。 / Some records could not be loaded. Refresh to retry.' : '接続先が報告した所有・出品です。 / Ownership and listings reported by the connected endpoint.';
    } finally { if (generation === this.#generation) { this.#loading = false; this.render(); } }
  }
  async action(action: string): Promise<void> {
    this.invalidate();
    const [kind, ...rest] = action.split(':'), id = rest.join(':');
    if (kind === 'select' && musicItem(id)) {
      ++this.#playRevision; this.#player.pause(); this.#selected = id; this.#clearCheckout(); this.render();
      this.#host.screen.querySelector('.record-feature')?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    } else if (kind === 'preview') {
      const item = musicItem(this.#selected)!; if (!item.assets) return;
      if (this.#previewSku === item.sku && !this.#player.paused) { ++this.#playRevision; this.#player.pause(); return; }
      if (this.#previewSku !== item.sku) { this.#player.src = url(item.assets.preview.path); this.#previewSku = item.sku; }
      const revision = ++this.#playRevision;
      try { await this.#player.play(); } catch (error) { if (revision === this.#playRevision) throw error; }
    } else if (kind === 'refresh' || kind === 'more') await this.refresh(kind === 'more');
    else if (kind === 'review') await this.#reviewOffer(id);
    else if (kind === 'buy') await this.#buy(id);
    else if (kind === 'download' && ['mp3', 'wav', 'cover', 'license'].includes(id)) await this.#download(id as 'mp3' | 'wav' | 'cover' | 'license');
  }
  async #reviewOffer(id: string): Promise<void> {
    if (!this.#offers.some(o => o.quote.offer.offer_id === id)) throw new Error('出品を更新してください。 / Refresh this listing.');
    this.#clearCheckout();
    const revision = this.#review, client = this.#host.client(), owner = client.state.account;
    if (!owner) throw new Error('ウォレットを接続してください。 / Connect your wallet first.');
    const sharedDialog = document.querySelector('#dialog'); let modalChanged = false;
    const observer = new MutationObserver(() => { modalChanged = true; });
    if (sharedDialog) observer.observe(sharedDialog, { attributes: true, childList: true, subtree: true });
    let fresh: MusicOffer, ready: Awaited<ReturnType<RaceChainClient['probeNftMarket']>>;
    try {
      fresh = await client.reviewMusicNftOffer(await client.getNftOffer(id));
      ready = await client.probeNftMarket();
      if (modalChanged || observer.takeRecords().length) throw new Error('別の画面が開かれました。出品を確認し直してください。 / Another dialog was opened. Review this listing again.');
    } finally { observer.disconnect(); }
    const item = musicItem(fresh.item.sku)!;
    if (revision !== this.#review || client !== this.#host.client() || owner !== client.state.account || !this.#host.active() || !client.config.nftCatalog) throw new Error('確認画面を開き直してください。 / Wallet or review changed. Review again.');
    const quote = Object.freeze({ ...fresh.quote, offer: Object.freeze({ ...fresh.quote.offer }), status: Object.freeze({ ...fresh.quote.status }) });
    const reviewedItem = client.config.nftCatalog.items.find(entry => entry.sku === fresh.item.sku && entry.kind === 'music');
    const sellerLabel = (reviewedItem?.sellers ?? client.config.nftCatalog.sellers).find(seller => sameAccountIdentity(seller, quote.offer.seller));
    if (!sellerLabel) throw new Error('出品者を確認できません。 / Seller does not match the reviewed collection.');
    this.#host.showDialog(`<div class="record-checkout" data-bilingual><p class="record-kicker">SORA RECORDS / PURCHASE REVIEW</p><h2>${dual(item.name.ja, item.name.en)}</h2><p>${dual('1 XORでNFTと永久・非独占の無制限利用許諾を購入します。', '1 XOR buys this NFT and a perpetual, non-exclusive unlimited-use license.')}</p><dl class="checkout-terms">${[
      ['購入価格 / PRICE', '1 XOR'], ['権利許諾者 / LICENSOR', fresh.item.licensor], ['出品者 / SELLER', sellerLabel], ['購入者 / BUYER', owner], ['NFT', quote.offer.nft_id], ['ネットワーク / NETWORK', quote.offer.network_id], ['XOR ASSET', quote.offer.payment_asset], ['有効期限の高さ / EXPIRY HEIGHT', quote.offer.expires_at_height], ['出品ハッシュ / OFFER HASH', quote.offer_hash], ['LICENSE SHA-256', MUSIC_LICENSE.sha256],
    ].map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><p>${dual('WAV・MP3・ジャケット・利用許諾。商用利用とリミックス可。追加ロイヤリティなし。著作権や独占権は移りません。', 'Includes WAV, MP3, cover and license. Commercial use and remixes allowed, without recurring royalties. Copyright and exclusivity stay with the rights holder.')}</p><a href="${url(MUSIC_LICENSE.path)}" target="_blank" rel="noopener">利用許諾の全文 / READ FULL LICENSE ↗</a><label class="record-consent"><input type="checkbox" id="record-license-consent">${dual('利用許諾の条件を確認しました。', 'I have reviewed the license terms.')}</label><label class="live-field">${dual('取引手数料の上限（1 XORの購入価格とは別）', 'MAXIMUM NETWORK FEE · SEPARATE FROM THE 1 XOR PRICE')}<input id="record-fee-cap" inputmode="decimal" value="1"><span>XOR</span></label><p>${esc(ready.reason ?? '')}</p><button class="primary" data-record="buy:${esc(id)}" ${ready.ready ? '' : 'disabled'}>${dual('ウォレットで確認', 'CONTINUE IN WALLET')} ↗</button><p class="record-small">${dual('支払いとNFT受取は同一の取引です。受取確認後にダウンロードできます。', 'Payment and NFT delivery are atomic. Downloads open after ownership is reported.')}</p></div>`);
    const field = document.querySelector<HTMLInputElement>('#record-fee-cap'), consent = document.querySelector<HTMLInputElement>('#record-license-consent'), dialog = field?.closest('dialog');
    if (!field || !consent || !dialog?.open) throw new Error('購入画面を開き直してください。 / Reopen checkout.');
    this.#checkout = Object.freeze({ quote, client, owner, sku: item.sku, feeAsset: client.config.nftCatalog.xorAssetDefinition, field, consent, dialog });
  }
  async #buy(id: string): Promise<void> {
    if (this.#purchasing) throw new Error('ウォレットの確認を完了してください。 / Complete the current wallet request.');
    const c = this.#checkout, client = this.#host.client(), cap = c?.field.value.trim();
    if (!c || c.quote.offer.offer_id !== id || c.client !== client || c.owner !== client.state.account || !c.dialog.open || !c.field.isConnected || !c.dialog.contains(c.field) || !c.consent.isConnected || !c.dialog.contains(c.consent) || !this.#host.active() || c.feeAsset !== client.config.nftCatalog?.xorAssetDefinition || !cap || !/^(?:0|[1-9]\d*)(?:\.\d{1,28})?$/.test(cap)) { this.#clearCheckout(); throw new Error('購入条件を確認し直してください。 / Review the quote and fee limit again.'); }
    if (!c.consent.checked) throw new Error('利用許諾を確認してください。 / Please review the license terms.');
    const epoch = this.#sessionEpoch;
    const current = () => epoch === this.#sessionEpoch && c.client === this.#host.client() && c.owner === c.client.state.account && this.#host.active();
    this.#clearCheckout(); this.#purchasing = true;
    c.dialog.querySelector<HTMLButtonElement>('[data-record^="buy:"]')?.setAttribute('disabled', '');
    try {
      const result = await c.client.purchaseNft(c.quote, { payer: 'authority', chargeLimits: [{ kind: 'nexus', assetDefinitionId: c.feeAsset, maxAmount: cap }] });
      if (!current()) return;
      this.#receipt = { hash: result.hash, nftId: c.quote.offer.nft_id, sku: c.sku };
      if (c.field.isConnected && c.dialog.contains(c.field)) this.#host.closeDialog();
      this.#host.notify('取引を受理。NFTの受取を確認しています。 / Transaction accepted by endpoint. Checking NFT delivery.');
      await this.refresh();
    } catch (error) {
      if (!current()) return;
      if (c.field.isConnected && c.dialog.contains(c.field)) this.#host.closeDialog();
      throw error;
    } finally { this.#purchasing = false; }
  }
  async #download(format: 'mp3' | 'wav' | 'cover' | 'license'): Promise<void> {
    if (this.#downloading) return;
    const client = this.#host.client(), owner = client.state.account, item = musicItem(this.#selected)!, known = this.#items.find(n => n.sku === item.sku);
    if (!owner || !known || !item.assets) throw new Error('所有一覧を更新してください。 / Refresh your owned records.');
    const epoch = this.#sessionEpoch, controller = new AbortController(); this.#abort = controller; this.#downloading = true; this.render();
    const current = () => epoch === this.#sessionEpoch && client === this.#host.client() && owner === client.state.account && this.#host.active();
    try {
      const nft = await client.getOwnedMusicNft(known.nftId);
      if (!current() || nft.sku !== item.sku) throw new Error('所有状況が変わりました。 / Ownership changed.');
      const file: MusicFile = format === 'license' ? { ...MUSIC_LICENSE, bytes: 64_000 } : item.assets[format];
      const response = await fetch(url(file.path), { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error('ダウンロードできませんでした。 / Download unavailable.');
      const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > file.bytes) { await reader.cancel(); throw new Error('ファイルのサイズが一致しません。 / File size mismatch.'); } chunks.push(new Uint8Array(value)); }
      const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
      if (hash !== file.sha256 || format !== 'license' && size !== file.bytes) throw new Error('ファイルの内容が一致しません。 / File integrity check failed.');
      // Recheck after a potentially slow WAV transfer, before creating a download.
      const latest = await client.getOwnedMusicNft(nft.nftId);
      if (!current() || latest.sku !== item.sku || latest.contentHash !== nft.contentHash) throw new Error('所有状況が変わりました。 / Ownership changed.');
      const certificate = `SORA RECORDS — LICENSE RECORD\nSong: ${item.name.en} / ${item.name.ja}\nArtist: ${item.artist}\nLicensor: ${nft.licensor}\nNFT: ${nft.nftId}\nWallet: ${owner}\nNFT metadata hash: ${nft.contentHash}\nLicense SHA-256: ${MUSIC_LICENSE.sha256}\nOwnership reported by: ${client.config.toriiUrl}\nDownloaded: ${new Date().toISOString()}\nThis records an endpoint ownership report, not independently verified finality. Keep your on-chain acquisition transaction as evidence.\n\n`;
      const blob = format === 'license' ? new Blob([certificate, bytes], { type: 'text/plain;charset=utf-8' }) : new Blob([bytes], { type: format === 'mp3' ? 'audio/mpeg' : format === 'wav' ? 'audio/wav' : 'image/png' });
      const objectUrl = URL.createObjectURL(blob), anchor = document.createElement('a');
      anchor.href = objectUrl; anchor.download = `${item.file}${format === 'license' ? '-license.txt' : format === 'cover' ? '-artwork.png' : `.${format}`}`;
      document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
      this.#host.notify('ダウンロードを開始しました。 / Download started.');
    } finally { this.#downloading = false; if (this.#abort === controller) this.#abort = null; if (this.#host.active()) this.render(); }
  }
}
