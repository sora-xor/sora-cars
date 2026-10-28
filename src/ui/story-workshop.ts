import { storyWorkshop } from '../game/story-workshop';

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function storyWorkshopPanel(chapter: number, insideShop = false): string {
  const visit = storyWorkshop(chapter), number = String(chapter + 1).padStart(2, '0');
  return `<section class="story-workshop" style="--workshop-color:${visit.character.color}" aria-label="工房の寄り道 / Workshop pit stop">
    <img class="workshop-scene" src="${import.meta.env.BASE_URL}assets/story/garage-dusk-branded.png" alt="SORA工房の夕暮れ / Dusk at SORA Workshop" loading="lazy">
    <div class="workshop-conversation"><p class="eyebrow">SORA CUSTOM WORKS · CH. ${number}</p><h2>工房の寄り道 <small lang="en">A PIT STOP WITH THE CREW</small></h2>
    <p class="workshop-speaker">${esc(visit.character.name.ja)} <span lang="en">${esc(visit.character.name.en)}</span></p>
    <blockquote><p>${esc(visit.line.ja)}</p><p lang="en">${esc(visit.line.en)}</p></blockquote>
    <div class="workshop-actions">${insideShop ? `<button class="small-button" data-garage="collection">アイテムを見る <small lang="en">BROWSE DESIGNS ↓</small></button><button class="text-button" data-action="chapter-${chapter}">第${number}章へ戻る <small lang="en">CONTINUE CHAPTER ${number} →</small></button><button class="text-button" data-action="story">物語の一覧 <small lang="en">CHAPTER SELECT</small></button>` : `<button class="small-button" data-action="story-workshop-${chapter}">仲間のデザインを見に行く <small lang="en">VISIT THE XOR / NFT WORKSHOP →</small></button>`}</div>
    <p class="workshop-note">好きな外装をXORで購入し、ウォレットのNFTとして持ち歩く。物語は購入なしで最後まで遊べます。<span lang="en">Buy a favorite design with XOR and keep it as a wallet NFT. The full story is playable without a purchase.</span></p></div></section>`;
}
