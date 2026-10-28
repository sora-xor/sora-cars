import type { RaceChainClient } from '../chain/client';
import { garageInventory, type GarageNft, type GarageOffer } from '../chain/inventory';
import { CLUB_ITEMS, clubItem, emptyAppearance, type ClubAppearance } from '../game/catalog';
import { storyWorkshop } from '../game/story-workshop';
import { storyWorkshopPanel } from './story-workshop';

const esc = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const subtitle = (ja: string, en: string) => `${esc(ja)}<small lang="en">${esc(en)}</small>`;
interface GarageHost {
  client: () => RaceChainClient; screen: HTMLElement; active: () => boolean;
  showDialog: (html: string) => void; closeDialog: () => void; notify: (message: string) => void;
}
interface CheckoutSnapshot {
  readonly quote: GarageOffer['quote'];
  readonly client: RaceChainClient;
  readonly owner: string | null;
  readonly feeAsset: string;
  readonly sku: string;
  readonly feeField: HTMLInputElement;
  readonly dialog: HTMLDialogElement;
}
/** A catalog preview never confers ownership. Equip requires a fresh wallet inventory. */
export class ClubGarage {
  #host: GarageHost;
  #selected = CLUB_ITEMS[0]!.sku;
  #items: GarageNft[] = [];
  #offers: GarageOffer[] = [];
  #owner: string | null = null;
  #client: RaceChainClient | null = null;
  #loading = false;
  #generation = 0;
  #reviewRevision = 0;
  #checkout: CheckoutSnapshot | null = null;
  #cursor: string | null = null;
  #ignored = 0;
  #status = '';
  #appearance: ClubAppearance = emptyAppearance();
  #storyChapter: number | null = null;
  #receipt: { hash: string; nftId: string; sku: string } | null = null;
  #purchasing = false;
  constructor(host: GarageHost) {
    this.#host = host;
    document.querySelector('#app')!.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-garage]');
      if (target && !target.hasAttribute('disabled')) void this.action(target.dataset.garage!).catch(error => host.notify(error instanceof Error ? error.message : String(error)));
    });
    const dialog = document.querySelector<HTMLDialogElement>('#dialog');
    dialog?.addEventListener('cancel', () => this.#clearCheckout());
    dialog?.addEventListener('close', () => { if (!dialog.open) this.#clearCheckout(); });
  }
  get appearance(): ClubAppearance {
    this.invalidate();
    return { ...this.#appearance };
  }
  get state() { this.invalidate(); return { selected: this.#selected, owned: this.#items.map(i => i.nftId), equipped: this.appearance, loading: this.#loading, verification: 'endpoint_reported', storyChapter: this.#storyChapter, purchase: this.#receipt ? { ...this.#receipt, received: this.#items.some(i => i.nftId === this.#receipt!.nftId) } : null }; }
  /** A route is narrative context, never a source of catalog or wallet authority. */
  setStoryChapter(chapter: number | null): void {
    const visit = chapter === null ? null : storyWorkshop(chapter);
    if (this.#checkout?.dialog.open) this.#checkout.dialog.close();
    this.#clearCheckout();
    this.#storyChapter = chapter;
    if (visit) this.#selected = visit.sku;
  }
  invalidate(): void {
    const client = this.#host.client();
    if (this.#client === client && this.#owner === client.state.account) return;
    ++this.#generation; this.#client = client; this.#owner = client.state.account;
    this.#clearCheckout();
    this.#items = []; this.#offers = []; this.#appearance = emptyAppearance(); this.#cursor = null; this.#loading = false; this.#status = ''; this.#receipt = null;
  }
  #clearCheckout(): void { this.#checkout = null; ++this.#reviewRevision; }
  #receiptView(): string {
    if (!this.#receipt) return '';
    const received = this.#items.some(i => i.nftId === this.#receipt!.nftId), item = clubItem(this.#receipt.sku)!;
    return `<section class="shop-transaction-status" aria-live="polite"><h3>${subtitle(received ? '接続先でNFTの受取を確認' : 'NFTの受取を確認中', received ? 'NFT RECEIPT REPORTED BY ENDPOINT' : 'CHECKING NFT RECEIPT')}</h3><p>${subtitle(item.name.ja, item.name.en)}</p><code>${esc(this.#receipt.hash)}</code><p>${subtitle(received ? '所有一覧に表示されました。「愛車に装着する」で物語の車にも反映できます。' : '取引の受理だけでは装着できません。所有一覧を更新して、受取を確認してください。', received ? 'Your inventory lists the item. Equip it below to use it in story races.' : 'Transaction acceptance alone does not equip an item. Refresh inventory to check delivery.')}</p><p>${subtitle('これは接続先の報告です。台帳の確定は独立検証されていません。', 'This is an endpoint report. Ledger finality is not independently authenticated.')}</p></section>`;
  }
  render(): void {
    if (!this.#host.active()) return;
    this.invalidate();
    const client = this.#host.client(), selected = clubItem(this.#selected)!, owned = this.#items.filter(i => i.sku === this.#selected);
    const offers = this.#offers.filter(o => o.item.sku === this.#selected);
    const flag = `${import.meta.env.BASE_URL}assets/sora-flag.png`, sun = `${import.meta.env.BASE_URL}assets/sora-retro-sun.png`;
    this.#host.screen.innerHTML = `<div class="club-shop workspace ${this.#storyChapter !== null ? 'shop-story-context' : ''}">${this.#storyChapter !== null ? storyWorkshopPanel(this.#storyChapter, true) : ''}${this.#receiptView()}<div class="section-heading"><div><p class="eyebrow">SORA MOTOR CLUB / 1986</p><h1>車庫から、未来へ。<small class="english-subtitle" lang="en">MADE IN OUR GARAGE.</small></h1></div><button class="small-button" data-action="garage">${subtitle('愛車へ戻る', 'BACK TO YOUR CAR')}</button></div><p class="shop-intro">仲間が描いたカラーと、自慢のパーツ。君の一台に、SORAの物語を。<span class="english-subtitle" lang="en">Colors by your crew. Parts with a story. Make your SORA machine your own.</span></p><div class="shop-layout"><section class="shop-feature"><div class="shop-art" style="--body:${selected.color};--dark:${selected.dark};--light:${selected.light};--accent:${selected.accent}"><span class="shop-stamp">SORA CARS<br>天 / CUSTOM WORKS</span><img class="shop-sun" src="${sun}" alt="SORA retro sun"><div class="pixel-car ${selected.pattern}"><i class="pixel-roof"></i><i class="pixel-window"></i><i class="pixel-body"></i><i class="pixel-stripe"></i><i class="pixel-wheel rear"></i><i class="pixel-wheel front"></i><img src="${flag}" alt="SORA emblem"></div><span class="preview-label">${subtitle('デザイン見本', 'DESIGN PREVIEW')}</span></div><p class="eyebrow">${esc(selected.designer)} / SORA CUSTOM WORKS</p><h2>${subtitle(selected.name.ja, selected.name.en)}</h2><p class="item-story">${esc(selected.story.ja)}<span lang="en">${esc(selected.story.en)}</span></p><p class="fine-print">${subtitle(selected.kind === 'skin' ? 'カラーとデカールのみ。走行性能は同じです。' : '見た目専用のアップグレード。走行性能は変わりません。', 'Cosmetic only. RaceV1 performance stays equal.')}</p>${owned.length ? `<button class="primary" data-garage="equip:${esc(selected.sku)}">${subtitle(this.#appearance[selected.kind === 'skin' ? 'skin' : 'upgrade'] === selected.sku ? '装着中' : '愛車に装着する', this.#appearance[selected.kind === 'skin' ? 'skin' : 'upgrade'] === selected.sku ? 'EQUIPPED' : 'EQUIP OWNED ITEM')}</button><p class="fine-print">${subtitle('所有状況は接続先の報告です。', 'Ownership is endpoint-reported.')} ${owned.map(i => `<code>${esc(i.nftId)}</code>`).join(' ')}</p>` : `<p class="item-ownership">${subtitle('このウォレットでの所有は未確認です。', 'Ownership has not been established for this wallet.')}</p>`}${offers.length ? `<div class="shop-offers">${offers.map(o => `<button class="offer-row" data-garage="review:${esc(o.quote.offer.offer_id)}"><span>${subtitle('出品を確認', 'REVIEW OFFER')}</span><b>${esc(o.quote.offer.price)} XOR</b></button>`).join('')}</div>` : `<p class="fine-print">${subtitle('現在、確認済みの出品はありません。', 'No reviewed offers are currently loaded.')}</p>`}</section><section class="shop-collection"><div class="collection-heading"><h2>${subtitle('仲間のコレクション', 'THE CREW COLLECTION')}</h2><img src="${flag}" alt="SORA flag"></div><div class="item-shelf">${CLUB_ITEMS.map(item => `<button class="item-swatch ${item.sku === selected.sku ? 'selected' : ''}" data-garage="select:${esc(item.sku)}" aria-pressed="${item.sku === selected.sku}" style="--body:${item.color};--accent:${item.accent}"><span class="item-chip ${item.pattern}"><img src="${flag}" alt=""></span><span>${subtitle(item.name.ja, item.name.en)}</span><em>${this.#items.some(i => i.sku === item.sku) ? '所有 / OWNED' : item.kind === 'skin' ? 'カラー / LIVERY' : '外装 / VISUAL KIT'}</em></button>`).join('')}</div><div class="shop-network"><h3>${subtitle('ウォレットの車庫', 'YOUR WALLET GARAGE')}</h3><p class="fine-print">${client.config.nftCatalog ? subtitle('承認済みコレクションと出品をToriiから読み込みます。価格と手数料は購入前に別々に表示します。', 'Load the reviewed collection from Torii. Price and transaction fees are shown separately before purchase.') : subtitle('この開発版はコレクション未設定です。デザインを見て楽しめます。購入はまだできません。', 'This development build has no released collection. Browse the designs; purchases are unavailable.')}</p><button class="small-button" data-garage="refresh" ${this.#loading || !client.config.nftCatalog ? 'disabled' : ''}>${subtitle(this.#loading ? '読み込み中…' : '所有・出品を更新', this.#loading ? 'LOADING…' : 'REFRESH INVENTORY & OFFERS')}</button>${!client.state.account ? `<button class="small-button" data-action="wallet">${subtitle('ウォレットを接続', 'CONNECT WALLET')}</button>` : ''}${this.#cursor ? `<button class="small-button" data-garage="more" ${this.#loading ? 'disabled' : ''}>${subtitle('次の出品を読み込む', 'LOAD NEXT OFFERS')}</button>` : ''}<p class="fine-print" role="status">${esc(this.#status)}</p>${this.#ignored ? `<p class="fine-print">${this.#ignored}件の対象外・未確認出品を除外 / ${this.#ignored} unrecognized offers omitted</p>` : ''}<button class="text-button" data-garage="clear">${subtitle('標準仕様に戻す', 'RESTORE STANDARD APPEARANCE')}</button></div><p class="shop-promise">SORA — 走る夢を、みんなで。<small lang="en">A SHARED DREAM, ONE ROAD AT A TIME.</small></p></section></div><p class="fine-print">${subtitle('性能アップグレードは別の認定クラスで導入予定です。対戦で移るのは、参加前に自分で選んで預けたNFTだけです。', 'Performance upgrades need a separately qualified class. Only NFTs explicitly deposited for a session can transfer to its winner.')}</p></div>`;
  }
  async refresh(more = false): Promise<void> {
    this.invalidate(); if (this.#loading) return;
    const client = this.#host.client(), catalog = client.config.nftCatalog;
    if (!catalog) throw new Error('コレクションは準備中です。 / Collection is not configured.');
    const generation = ++this.#generation;
    this.#loading = true; this.#status = ''; this.render();
    try {
      const [inventory, page] = await Promise.all([client.state.account ? client.listOwnedNfts() : Promise.resolve(null), client.listNftOffers(undefined, more ? this.#cursor ?? undefined : undefined)]);
      const reviews: GarageOffer[] = []; let ignored = 0;
      // Bounded batches avoid flooding a self-hosted endpoint with per-NFT lookups.
      for (let i = 0; i < page.items.length; i += 4) {
        const batch = await Promise.allSettled(page.items.slice(i, i + 4).map(offer => client.reviewNftOffer(offer)));
        for (const item of batch) if (item.status === 'fulfilled') reviews.push(item.value); else ignored++;
      }
      if (generation !== this.#generation || this.#host.client() !== client || this.#owner !== client.state.account) return;
      this.#items = inventory ? garageInventory(inventory, catalog).items : [];
      for (const kind of ['skin', 'upgrade'] as const) if (!this.#items.some(i => i.sku === this.#appearance[kind])) this.#appearance[kind] = null;
      this.#offers = more ? [...new Map([...this.#offers, ...reviews].map(o => [o.quote.offer.offer_id, o])).values()].slice(-256) : reviews;
      this.#ignored = more ? this.#ignored + ignored : ignored; this.#cursor = page.nextCursor;
      this.#status = '接続先が報告した所有・出品です。確定検証は未完了です。 / Endpoint-reported inventory and offers; finality is not independently verified.';
    } catch (error) {
      if (generation === this.#generation) { this.#items = []; this.#appearance = emptyAppearance(); this.#status = error instanceof Error ? error.message : String(error); }
    } finally { if (generation === this.#generation) { this.#loading = false; this.render(); } }
  }
  async action(action: string): Promise<void> {
    this.invalidate();
    const separator = action.indexOf(':');
    const kind = separator < 0 ? action : action.slice(0, separator), id = separator < 0 ? undefined : action.slice(separator + 1);
    if (kind === 'select' && clubItem(id)) { this.#selected = id!; this.render(); }
    else if (kind === 'collection') this.#host.screen.querySelector('.shop-feature')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    else if (kind === 'refresh' || kind === 'more') await this.refresh(kind === 'more');
    else if (kind === 'clear') { this.#appearance = emptyAppearance(); this.render(); }
    else if (kind === 'equip') {
      await this.refresh();
      const item = this.#items.find(i => i.sku === id);
      if (!item) throw new Error('このアイテムの所有を確認できません。 / Item ownership could not be established.');
      this.#appearance[item.kind] = item.sku; this.render();
    } else if (kind === 'review') {
      const offered = this.#offers.find(o => o.quote.offer.offer_id === id);
      if (!offered) throw new Error('出品を再読み込みしてください。 / Reload this offer.');
      this.#clearCheckout();
      const client = this.#host.client(), owner = client.state.account, revision = this.#reviewRevision;
      const fresh = await client.reviewNftOffer(await client.getNftOffer(id!)), item = clubItem(fresh.item.sku)!;
      const readiness = await client.probeNftMarket();
      if (revision !== this.#reviewRevision || client !== this.#host.client() || owner !== client.state.account || !this.#host.active() || !client.config.nftCatalog) throw new Error('接続または確認画面が変更されました。出品を確認し直してください。 / Wallet or review changed. Review the offer again.');
      // Listings can refresh independently. Only this detached, frozen quote
      // supplies both the displayed terms and the eventual purchase request.
      const quote = Object.freeze({ ...fresh.quote, offer: Object.freeze({ ...fresh.quote.offer }), status: Object.freeze({ ...fresh.quote.status }) });
      this.#host.showDialog(`<p class="eyebrow">SORA CUSTOM WORKS</p><h2>${subtitle('この一台に、物語を。', 'MAKE IT YOURS.')}</h2><h3>${subtitle(item.name.ja, item.name.en)}</h3><dl class="checkout-terms"><div><dt>${subtitle('承認済みネットワーク', 'RELEASE-PINNED NETWORK')}</dt><dd>${esc(quote.offer.network_id)}</dd></div><div><dt>${subtitle('購入ウォレット', 'BUYER WALLET')}</dt><dd>${esc(owner ?? '未接続 / DISCONNECTED')}</dd></div><div><dt>${subtitle('XOR資産ID', 'XOR ASSET ID')}</dt><dd>${esc(quote.offer.payment_asset)}</dd></div><div><dt>${subtitle('購入価格', 'PURCHASE PRICE')}</dt><dd>${esc(quote.offer.price)} XOR</dd></div><div><dt>NFT</dt><dd>${esc(quote.offer.nft_id)}</dd></div><div><dt>${subtitle('出品者', 'SELLER')}</dt><dd>${esc(quote.offer.seller)}</dd></div><div><dt>${subtitle('有効期限のブロック高', 'EXPIRY BLOCK HEIGHT')}</dt><dd>${esc(quote.offer.expires_at_height)}</dd></div><div><dt>${subtitle('出品条件のハッシュ', 'IMMUTABLE OFFER HASH')}</dt><dd>${esc(quote.offer_hash)}</dd></div></dl><label class="live-field shop-fee">${subtitle('取引手数料の上限（購入価格とは別）', 'MAXIMUM TRANSACTION FEE — SEPARATE FROM PRICE')}<input id="shop-fee-cap" inputmode="decimal" value="1"><span>XOR</span></label><p class="fine-print">${subtitle('購入はXORの支払いとNFTの受取を同じ取引で行います。ウォレットで条件を確認してください。', 'Payment and NFT delivery occur atomically. Review the exact terms in your wallet.')}</p><p class="fine-print">${esc(readiness.reason ?? '')}</p><button class="primary" data-garage="buy:${esc(id)}" ${readiness.ready && client.state.account ? '' : 'disabled'}>${subtitle('条件を確認してウォレットへ', 'REVIEW IN WALLET')}</button>`);
      const feeField = document.querySelector<HTMLInputElement>('#shop-fee-cap'), dialog = feeField?.closest('dialog');
      if (!feeField || !dialog?.open) throw new Error('購入画面を開き直してください。 / Reopen the purchase review.');
      this.#checkout = Object.freeze({ quote, client, owner, sku: item.sku, feeAsset: client.config.nftCatalog.xorAssetDefinition, feeField, dialog });
    } else if (kind === 'buy') {
      if (this.#purchasing) throw new Error('ウォレットの確認を完了してください。 / Complete the current wallet request first.');
      const checkout = this.#checkout, client = this.#host.client(), cap = checkout?.feeField.value.trim();
      if (!checkout || checkout.quote.offer.offer_id !== id || checkout.client !== client || checkout.owner === null || checkout.owner !== client.state.account || !checkout.dialog.open || !checkout.feeField.isConnected || !checkout.dialog.contains(checkout.feeField) || !this.#host.active() || checkout.feeAsset !== client.config.nftCatalog?.xorAssetDefinition || !cap || !/^(?:0|[1-9]\d*)(?:\.\d{1,28})?$/.test(cap)) {
        this.#clearCheckout();
        throw new Error('購入条件と手数料上限を確認してください。 / Review the quote and fee limit.');
      }
      this.#clearCheckout();
      checkout.dialog.querySelector<HTMLButtonElement>('[data-garage^="buy:"]')?.setAttribute('disabled', '');
      this.#purchasing = true;
      try {
        const result = await checkout.client.purchaseNft(checkout.quote, { payer: 'authority', chargeLimits: [{ kind: 'nexus', assetDefinitionId: checkout.feeAsset, maxAmount: cap }] });
        // A completed request must not place another wallet's receipt or items into this view.
        if (checkout.client !== this.#host.client() || checkout.owner !== checkout.client.state.account) return;
        this.#receipt = { hash: result.hash, nftId: checkout.quote.offer.nft_id, sku: checkout.sku };
        if (checkout.feeField.isConnected && checkout.dialog.contains(checkout.feeField)) this.#host.closeDialog();
        this.#host.notify(`接続先が取引を受理しました。 / Endpoint-reported transaction: ${result.hash}`);
        await this.refresh();
      } finally { this.#purchasing = false; }
    }
  }
}
