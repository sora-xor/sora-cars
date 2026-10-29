import { CHAPTERS, CREW, storyProgress, type Bilingual } from './story';

interface WorkshopVisit { speaker: string; sku: string; line: Bilingual }
/** Narrative recommendations only: neither chapter progress nor a visit grants an NFT. By chapter id. */
const VISITS: readonly WorkshopVisit[] = [
  { speaker: 'aki', sku: 'aki-first-light', line: { ja: '父は、朝焼けの赤に少し黄色を混ぜてた。この塗装にも、その色を残したんだ。標準の白で走ってもいいし、自分の朝を選んでもいい。ゆっくり見ていって。', en: 'Dad mixed a little yellow into his sunrise red. I kept that color in this livery. The standard white is lovely too, or you can choose a dawn of your own. Take your time.' } },
  { speaker: 'daichi', sku: 'daichi-harbor-line', line: { ja: '配達が終わると、弟を連れて海を見るんだ。この青は、その帰り道。車体の色が変わるだけで、速さは同じ。値段と持ち主を確かめて、気に入ったら選んでよ。', en: 'After deliveries, I take my brother to see the sea. This blue is our road home. It changes the livery, with the same performance. Check the price and owner, and choose it if it feels right.' } },
  { speaker: 'mei', sku: 'mei-sakura-film', line: { ja: '写真の見せ方で、同じ街が別のものに見える。この桜色には、写っていた人の笑顔を残したかった。車に着せる色だから、見本を眺めるだけでもいいの。', en: 'How you frame a photograph can change the whole city. I wanted this blossom pink to keep the smiles of the people who were there. It is a color for your car; enjoying the preview is enough.' } },
  { speaker: 'ren', sku: 'ren-radio-night', line: { ja: '今夜の周波数は、紺と金。アキには「深夜番組にしては派手」って言われたけどね。車の塗装だよ、受信感度は上がらない。そこだけは、ちゃんと言っておく。', en: 'Tonight’s frequency is blue and gold. Aki says it is loud for a late-night show. It is a livery; it will not improve radio reception. That much I can promise.' } },
  { speaker: 'yui', sku: 'yui-solar-grid', line: { ja: '雨でも見えるように、設計図の線を明るくしたの。太陽で動く工房は、まだ夢の途中。この塗装に発電機能はないけど、次に作りたいものを思い出せる。', en: 'I brightened the blueprint lines so they show in the rain. The solar workshop is still a dream in progress. This livery does not generate power, but it reminds me what I want to build next.' } },
  { speaker: 'aki', sku: 'club-aero-86', line: { ja: 'ユイと削って作ったウイング。ガラスのビルに飾るより、夜の道に似合うと思う。見た目のパーツだから、速さも曲がり方も変わらない。横からも見てみて。', en: 'Yui and I shaped this wing together. I think it belongs on a night road, not in a glass tower. It is a visual body kit; speed and handling stay the same. Have a look from the side.' } },
  { speaker: 'jun', sku: 'club-neon-pulse', line: { ja: '次の放送に向けて、色の見本も並べたよ。このパーツはブーストの炎をシンセみたいな色にするだけ。壊れた機械を直したり、速くしたりはできない。修理の続きは、僕らの手でやろう。', en: 'I set out the color samples while preparing the next broadcast. This part gives boost flames synthesizer colors. It cannot repair equipment or add speed. The repair work is still ours to do.' } },
  { speaker: 'ren', sku: 'ren-radio-night', line: { ja: '見本の埃を払っておいたよ。紺と金、前と同じ色。アキの「深夜番組にしては派手」って声まで思い出した。今日はここに並べておく。見ていって。', en: 'I dusted the samples. The same blue and gold. I can still hear Aki saying it is loud for a late-night show. I will leave them here. Take a look.' } },
  { speaker: 'yui', sku: 'yui-solar-grid', line: { ja: '設計図に仲間の赤ペンが入ったら、私の見落としが見えた。この塗装は元の図面の色のままだけど、見るたびに思い出す。自分で選ぶことと、ひとりで作ることは違うね。', en: 'Other people’s red pen showed me what I had missed. The livery still uses the original blueprint colors, but now it reminds me: choosing for yourself does not mean building alone.' } },
  { speaker: 'mei', sku: 'mei-sakura-film', line: { ja: '明日は、撮っていいか先に聞く。好きな色の車と、その隣に立つ顔を残したいから。この桜色も候補にどうぞ。買い物は後にして、今夜は休んでもいいのよ。', en: 'Tomorrow I will ask before taking the picture. I want the car in its favorite colors, and the face beside it. Blossom pink is one option. Shopping can wait if you need some sleep tonight.' } },
  { speaker: 'aki', sku: 'club-aero-86', line: { ja: 'このウイングで天宮に勝てる、とは言えない。速さも曲がり方も同じだから。好きな姿でスタートに立つためのパーツだよ。勝負の準備は、ブレーキとラインを確かめてから。', en: 'I cannot promise this wing will beat Amamiya. Speed and handling are unchanged. It is a way to arrive at the grid looking like yourself. Race preparation still means checking your braking and your line.' } },
  { speaker: 'jun', sku: 'jun-transistor', line: { ja: '昔、途中で止めた曲。今度は最後まで弾くよ。この四角い模様は、その頃から好きなリズム。車の塗装も、自分の音も、好きなままで続けていいんだな。', en: 'That song I once abandoned—I will play it to the end this time. These square patterns are a rhythm I have loved since then. A livery, a sound: perhaps we are allowed to keep what we love.' } },
  // The street-race chapters (ids 12-16).
  { speaker: 'yui', sku: 'yui-solar-grid', line: { ja: '峠の茶屋で、充電の話ばかりしてた。この塗装の線は、山の向こうからでも読める太さにしたの。発電はしないけど、遠くからでもSORAだって分かる。', en: 'At the teahouse I talked about nothing but charging. I drew these lines thick enough to read from across a mountain. The livery generates no power, but you can tell it is SORA from a distance.' } },
  { speaker: 'mei', sku: 'mei-sakura-film', line: { ja: '東京の朝は、新聞の紙の色だった。この桜色は、九段の大鳥居の前で迷ってから残したの。車に着せる色だから、眺めて決めればいい。', en: 'Tokyo’s morning was the colour of newsprint. I kept this blossom pink after a long think beneath the great torii in Kudan. It is a colour for your car; decide by looking.' } },
  { speaker: 'ren', sku: 'ren-radio-night', line: { ja: '会津の工房で、本物の漆の黒を見せてもらった。この紺は、それに比べたら軽い。塗装は謝罪の代わりにならない。それだけは、先に言っておく。', en: 'In Aizu they showed me true lacquer black. This navy is light by comparison. A livery is no substitute for an apology. I will say that first.' } },
  { speaker: 'daichi', sku: 'daichi-harbor-line', line: { ja: '京都の疏水の色、港の青に少し似てた。この塗装で走っても、速さは同じ。弟には、水の流れに沿った道の話をするよ。', en: 'The Kyoto canal looked a little like our harbor blue. This livery runs at the same speed. I will tell my brother about the road beside the water.' } },
  { speaker: 'jun', sku: 'club-neon-pulse', line: { ja: '奈良の喫茶店で、昔の仲間とブーストの炎の色の話をした。シンセみたいな色になるだけで、速くはならない。続きの四小節は、僕らの手で書く。', en: 'In a Nara coffee shop, my old bandmate and I argued about boost-flame colours. They only turn synthesizer colours; nothing gets faster. The next four bars are ours to write.' } },
];

export function storyWorkshop(chapter: number) {
  const visit = Number.isInteger(chapter) ? VISITS[CHAPTERS[chapter]?.id ?? -1] : undefined;
  if (!visit) throw new Error('Unknown workshop chapter.');
  return { chapter: CHAPTERS[chapter]!, character: CREW.find(c => c.id === visit.speaker)!, sku: visit.sku, line: visit.line };
}

/** Hash-local context survives CID hosting and reload; it confers no purchase entitlement. */
export function storyWorkshopRoute(route: string, progress: number): number | null {
  const match = /^shop\/story\/(0|[1-9]\d?)$/.exec(route);
  if (!match) return null;
  const chapter = Number(match[1]);
  return chapter < CHAPTERS.length && chapter <= storyProgress(progress) ? chapter : null;
}
