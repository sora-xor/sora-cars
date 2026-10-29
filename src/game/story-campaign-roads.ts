import type { StoryChapter } from './story';
import { line } from './story-dialogue';

/**
 * The five street-race chapters, woven into the three acts before the finale
 * (story-campaign.ts sets their place). Ids 12–16 are stable identities for art,
 * music and dossiers; the player sees each chapter's position in play order.
 * Each runs on a 1986 street route rather than an Arcade circuit.
 */

/** After ID 3: the Nikko club invites the crew up the forty-eight turns. */
export const IROHAZAKA: StoryChapter = {
  id: 12, act: 1,
  title: { ja: 'いろは、空への四十八', en: 'Forty-eight to the sky' },
  place: { ja: '三日後　日光・馬返 → いろは坂', en: 'Three days later · Nikko, Umagaeshi → Irohazaka' },
  route: 'irohazaka-1986', art: 'angles/iroha-wide-v1.png',
  synopsis: { ja: '日光の走り屋たちが、四十八の坂の上の茶屋に端末を置きたいと言う。峠の灯を、王冠の許可につながせないために。', en: 'Nikko’s hill-climb drivers want a terminal in the teahouse above the forty-eight turns, so the mountain never needs a crown’s permission.' },
  dossier: { ja: '明智平の茶屋が、街の外で初めての端末を引き受けた。中継器はレンが借りてきた機材。日光のクラブは、港の配達便と荷物と書類を運び合う約束をした。', en: 'The Akechidaira teahouse hosts the first terminal outside the city, relayed through equipment Ren borrowed. The Nikko club agrees to carry parcels and papers with the harbor couriers.' },
  intro: [
    line('daichi', '日光のクラブから招待状。「馬返、午後四時。上り専用の第二いろは坂を、一緒に」だって。', 'An invitation from the Nikko club. “Umagaeshi, four p.m. Climb the uphill-only Second Irohazaka with us.”', 'iroha', 'wide'),
    line('aki', '表彰台で話してから、まだ三日だよ。返事が早いね。', 'It has only been three days since the podium. They answer fast.'),
    line('yui', '峠の上の茶屋の人が、先週クラウンの端末を勧められて断ったんだって。代わりに、私たちのを見たいって。', 'The teahouse at the top of the pass turned down a CROWN terminal last week. They want to see ours instead.', undefined, 'detail'),
    line('aki', '見せるなら、壊れても自分で直せる形で。山の上じゃ、修理屋は呼べないから。', 'Then we show them one they can repair themselves. Nobody can call a repairman to the top of a mountain.'),
    line('ren', '中継器は、僕が借りてきたのを使って。峠の上まで、ちゃんと届く。', 'Use the relay I borrowed. It reaches all the way to the top.', undefined, 'left'),
    line('aki', '借り物なら、貸主の名前を箱に書いておいて。返す時に迷わないように。', 'If it is borrowed, write the owner’s name on the case. So we know where it goes back.'),
    line('ren', '……うん。あとで書く。', 'Right. I’ll write it later.'),
    line('daichi', '上りは一方通行で、カーブが二十。い、ろ、は……最後が「ね」。曲がるたびに、看板に一文字ずつ。', 'One way uphill, twenty curves. I, ro, ha… the last one is ne. Every bend has its own letter on a board.', undefined, 'right'),
    line('jun', 'いろは歌か。「色は匂へど散りぬるを」。いい曲は、最初の一音じゃ決まらない。最後まで登らないと。', 'The iroha poem. “Though colours glow, they scatter.” A good song is never decided by its first note. You have to climb to the end.'),
    line('mei', '頂上の明智平から、中禅寺湖と男体山が見えるって。茶屋の人には、撮る前に聞くね。', 'From Akechidaira at the top you can see Lake Chūzenji and Mount Nantai. I’ll ask the teahouse people before I take any pictures.', undefined, 'wide', undefined, { ja: '馬返・スタート前', en: 'UMAGAESHI · BEFORE THE START' }),
    line('aki', '茶屋が上で待ってる。端末を届けよう。……四十八じゃなくて、上りの二十を。', 'The teahouse is waiting at the top. Let us take it the terminal. Not forty-eight turns: the twenty going up.'),
  ],
  victory: [
    line('mei', '茶屋のおばあさん、端末を置いてくれるって。表彰台より先に、修理の手順書を読んでた。', 'The old lady at the teahouse will host the terminal. Before the podium, she was already reading the repair instructions.', 'iroha', 'wide', undefined, { ja: '明智平・峠の展望台', en: 'AKECHIDAIRA · THE PASS OVERLOOK' }),
    line('yui', '中継器、峠の上でも受信できた。借りた電源箱のおかげ。', 'The relay works even up here. Thanks to the borrowed power unit.'),
    line('daichi', '日光のクラブ、港の配達便と組みたいって。週末の荷物を運ぶ代わりに、こっちの書類も運んでくれる。', 'The Nikko club wants to team up with the harbor couriers. They will carry our papers if we carry their weekend parcels.', undefined, 'detail'),
    line('aki', '一人で全部運ぶって言わないの、珍しいね。', 'That is new. You did not offer to carry it all yourself.'),
    line('daichi', '言いかけた。ユイににらまれた。', 'I nearly did. Yui glared at me.'),
    line('ren', 'アキ。三日前に言った「話したいこと」なんだけど……。', 'Aki. What I said three days ago, about something I needed to tell you…', undefined, 'left'),
    line('aki', 'うん。聞いてる。', 'Yes. I am listening.'),
    line('ren', '……ここ、夜明けはもっときれいなんだって。いつか、一緒に見たい。', '…They say it is even more beautiful here at dawn. I would like to see it with you someday.'),
    line('aki', 'それが「話したいこと」？ ……いいよ。夜明けの約束は、預かっておく。', 'Was that what you needed to tell me? …All right. I will keep that dawn promise for later.'),
    line('jun', '降りる前に工具を数えよう。峠に忘れ物をすると、取りに来るまで下り二十八、上り二十。合わせて四十八回、曲がることになる。', 'Count the tools before we head down. Forget one up here and it is twenty-eight bends down and twenty back up. Forty-eight turns to fetch it.', undefined, 'right'),
  ],
};

/** After ID 4: a dawn run around the palace puts CROWN in front of Tokyo’s first readers. */
export const TOKYO: StoryChapter = {
  id: 13, act: 2,
  title: { ja: '靖國神社で会おう', en: 'Meet me at Yasukuni' },
  place: { ja: '二日後・夜明け前　東京・九段 → 皇居一周', en: 'Two days later · Before dawn · Tokyo, Kudan → around the Palace' },
  route: 'tokyo-1986', art: 'angles/kudan-wide-v1.png',
  synopsis: { ja: '王冠の名を消せば載せる、と雑誌社は言った。九段の大鳥居に集まる夜明け前の走り屋たちが、メイの原稿を東京じゅうへ運ぶ。', en: 'A magazine will print Mei’s article if she cuts the crown’s name. Tokyo’s pre-dawn drivers, gathered at the great torii in Kudan, carry it across the city instead.' },
  dossier: { ja: '夜明けの会の印刷屋が三百部を刷り、丸の内の新聞スタンドとタクシーに置いた。レイは本店の前を走るコースを、自分の名前ごと選んだ。その朝、評議会から呼び出しが来た。', en: 'The dawn club’s printer ran three hundred copies for Marunouchi news stands and taxis. Rei chose a course past her own head office, name and all. That morning, the Council summoned the crew.' },
  intro: [
    line('ren', 'SORAラジオ出張版、九段坂下から。……東京の夜明け前って、こんなに静かなんだ。', 'SORA Radio on the road, from the foot of Kudanzaka. I never knew Tokyo was this quiet before dawn.', 'kudan', 'wide'),
    line('daichi', '新聞配達とタクシーの人たちの走行会。合言葉は「靖國神社で会おう」。大鳥居の前に、四時集合。', 'It is a meet for newspaper deliverers and cab drivers. Their password is “Meet me at Yasukuni.” Four a.m., in front of the great torii.'),
    line('mei', '昨日、神保町の雑誌社に原稿を持っていった。……王冠の名前を消せば、載せるって。', 'Yesterday I took my article to a magazine in Jimbōchō. They will print it if I cut the crown’s name.', undefined, 'detail'),
    line('aki', 'それで、消すの？', 'And will you cut it?'),
    line('mei', '消さない。前に、写っていた人を枠の外へ出したことがある。今度は、名前を外へ出さない。', 'No. I once pushed a person out of the frame. This time I will not push the name out.'),
    line('rei', 'その原稿、私も読みました。融資の決裁は大手町の本店。夜明けに、このコースはその前を通ります。', 'I read your article too. The loans are approved at the head office in Ōtemachi. At dawn, this course runs right past it.', undefined, 'left'),
    line('aki', '危なくないの？ 自分の本店の前で、その名前を出して。', 'Isn’t that dangerous for you? Naming it outside your own head office?'),
    line('rei', '署名したのは私です。黙っていても、危なさは消えません。', 'I am the one who signed. Keeping quiet will not make me safe.'),
    line('yui', 'クラブの印刷屋さんが、夜明けまでに三百部刷ってくれる。', 'The club’s printer will run three hundred copies by dawn.', undefined, 'right'),
    line('jun', '丸の内の新聞スタンドと、タクシーの後ろの座席に置くんだって。東京でいちばん早い読者だな。', 'They will leave them at the Marunouchi news stands and on the back seats of cabs. Tokyo’s earliest readers.'),
    line('ren', '放送は……メイが読んでくれないかな。君の記事だし、僕より声がいい。', 'For the broadcast… could you read it, Mei? It is your article, and your voice is better than mine.', 'kudan', 'left'),
    line('aki', 'レン？ 自分の番組なのに。', 'Ren? It is your own show.'),
    line('ren', 'ミニFMだよ。届くのは五百メートル。……それより、出走の時間だ。', 'It is mini-FM. It only reaches five hundred metres. Anyway, it is time to start.'),
    line('aki', '大鳥居から皇居を回って、夜明けまでに戻ってくる。……みんなで帰ってこよう。', 'From the great torii, around the Palace, and back before sunrise. Let us all come home together.', undefined, 'wide', undefined, { ja: '九段・大鳥居の前', en: 'KUDAN · BEFORE THE GREAT TORII' }),
  ],
  victory: [
    line('mei', '丸の内の新聞スタンド、三百部が全部なくなった。始発の人たちが持っていったって。', 'All three hundred copies are gone from the Marunouchi stands. The first-train commuters took them.', 'kudan', 'wide', undefined, { ja: '夜明け・丸の内の濠端', en: 'SUNRISE · MARUNOUCHI MOAT' }),
    line('daichi', 'タクシーの運転手さん、後ろの客に読ませるってさ。銀行の人がよく乗るらしい。', 'The cab drivers will pass them to their passengers. Apparently plenty of bankers ride with them.'),
    line('rei', '本店の朝礼で、もう話題になっているそうです。……私の名前も、記事に残っています。', 'It is already the talk of the head office’s morning meeting. My name is still in the article.', undefined, 'detail'),
    line('aki', '後悔してる？', 'Do you regret it?'),
    line('rei', 'いいえ。怖いだけです。それは、別のことですから。', 'No. I am only afraid. That is a different thing.'),
    line('celeste', '空井さん。東京の新聞スタンドで、うちの名前を見かけたわ。明日、天際開発のタワーへ。全員で、と伝えて。', 'Mr. Sorai. I saw our name on the news stands in Tokyo. Tomorrow, the Tensai tower. Tell them all to come.', 'boardroom', 'left', undefined, { ja: '電話・メリディアン評議会', en: 'ON THE PHONE · MERIDIAN COUNCIL' }),
    line('ren', '……伝えます。', 'I will tell them.'),
    line('aki', '誰から？ また機材屋？', 'Who was that? The equipment company again?', 'kudan', 'right'),
    line('ren', '天際開発。明日、みんなで来いって。……機材屋のことは、また今度話す。', 'Tensai Development. They want all of us tomorrow. The equipment company… I will tell you about that another time.'),
    line('aki', 'その「今度」、ちゃんと来るんだよね。', 'That “another time” is going to come, isn’t it?'),
    line('jun', '帰りに秋葉原で真空管を買っていこう。東京まで来て、手ぶらで帰るのは寂しい。', 'Let us stop at Akihabara for vacuum tubes on the way home. Coming all the way to Tokyo empty-handed would be sad.', undefined, 'detail'),
  ],
};

/** After ID 7: Ren answers to a relay host; the castle, seen from the hill, is still standing. */
export const AIZU: StoryChapter = {
  id: 14, act: 2,
  title: { ja: '城を望む丘へ', en: 'To the hill facing the castle' },
  place: { ja: '三日後　会津若松・七日町 → 飯盛山', en: 'Three days later · Aizu-Wakamatsu, Nanokamachi → Iimoriyama' },
  route: 'aizu-wakamatsu-1986', art: 'angles/aizu-wide-v1.png',
  synopsis: { ja: '午前二時に中継器を回収された店のひとつは、会津の漆の工房だった。レンは謝りに行き、アキは城を望む丘で、遠くから決めつける怖さを知る。', en: 'One of the shops whose relay was seized at two a.m. is an Aizu lacquer workshop. Ren goes to apologize; on the hill facing the castle, Aki learns the cost of judging from a distance.' },
  dossier: { ja: 'レンは漆の工房に損失の書面を置いた。訂正は工房主の赤で返ってくる。ユイは中継器を、電源まで置く人のものにすると決めた。会津のクラブが、次の町への便を引き受けた。', en: 'Ren left a written account of the losses with the lacquer workshop; corrections will come back in the owner’s red. Yui decides relays will belong to their hosts, power and all. The Aizu club takes on the run to the next town.' },
  intro: [
    line('daichi', '七日町の漆の工房。中継器を置いてくれた店のひとつだ。午前二時、回収の人が戸を叩いたって。', 'The lacquer workshop in Nanokamachi. One of the shops that hosted our relays. At two a.m., the collectors knocked on their door.', 'aizu', 'wide'),
    line('ren', '僕が渡した一覧で来たんだ。……謝るのは、僕から。', 'They came because of the list I gave. I will be the one to apologize.'),
    line('aki', '謝って、それで終わり？', 'And after the apology, that’s it?'),
    line('ren', 'いや。止まった分の損を書いて、ここに置いていく。直すのは、工房の人の赤ペンで。', 'No. I will write down what they lost and leave it here. The workshop gets to correct it in red.'),
    line('yui', '棚に、中継器の形の埃だけ残ってる。ここに置いたのは、私の設計だった。', 'There is only a relay-shaped outline in the dust. I designed what sat here.', undefined, 'detail'),
    line('jun', '漆は、湿気で乾くんだってさ。乾かないうちに触ると、全部やり直し。', 'Lacquer cures in the damp, apparently. Touch it too soon and you start over.'),
    line('ren', 'SORAラジオの空井レンです。皆さんの住所を、スポンサーに渡しました。', 'I am Ren Sorai of SORA Radio. I gave your address to the sponsor.', undefined, 'left'),
    line('mei', 'ご主人、黙って聞いてる。……怒鳴られるより、つらいね。', 'The owner is just listening. That is harder than being shouted at.'),
    line('aki', 'レン、最後まで逃げなかった。……それでも、まだ許すとは言えない。', 'Ren did not run, all the way to the end. I still cannot say I forgive him.', undefined, 'right'),
    line('mei', '言わなくていい。今日は、見ただけで十分。', 'You do not have to. Seeing it is enough for today.'),
    line('daichi', '会津のクラブが走行会を開いてくれる。城の濠を回って、飯盛山へ上る道。', 'The Aizu club is holding a meet for us. Around the castle moats, then up to Iimoriyama.'),
    line('aki', '工房の人たちも見に来るって。……今夜は、借りを返す走りにしよう。', 'The workshop people are coming to watch. Tonight, let us drive like we are paying something back.', 'aizu', 'wide', undefined, { ja: '会津若松駅前・スタート', en: 'AIZU-WAKAMATSU STATION · THE START' }),
  ],
  victory: [
    line('jun', 'ここが飯盛山。白虎隊の少年たちが、城を見た丘だ。', 'This is Iimoriyama. The hill where the Byakkotai boys looked back at the castle.', 'aizu', 'wide', undefined, { ja: '飯盛山・城を望む丘', en: 'IIMORIYAMA · THE HILL FACING THE CASTLE' }),
    line('mei', '城下の煙を見て、城が落ちたと思い込んだ。……本当は、まだ立っていたのに。', 'They saw smoke over the town and believed the castle had fallen. It was still standing.'),
    line('aki', '停電の夜、私もそう思った。全部なくなったって。メイは「全部は失ってない」って言ってくれたのに。', 'On the night of the blackout, I thought the same. That everything was gone. Even after you told me we had not lost it all.'),
    line('ren', '工房のご主人から。「書面は読む。間違いは赤で返す」って。', 'From the workshop owner: “I will read your account. The mistakes come back in red.”', undefined, 'detail'),
    line('yui', '次の中継器は、電源まで全部、置く人のもの。貸主が一人の機材は、もう使わない。', 'The next relays will belong to their hosts, power and all. No more equipment with a single owner.'),
    line('aki', 'レン。今日の謝り方、ちゃんと見てた。', 'Ren. I watched how you apologized today.', undefined, 'left'),
    line('ren', '点数をつけるなら、まだ赤点だよ。', 'If you are grading it, it is still a fail.'),
    line('aki', '点数はつけない。……帰りの運転、交代しよう。眠そうだから。', 'I am not grading. Let us take turns driving home. You look tired.'),
    line('daichi', '会津の人たちが、次の町まで書類を運ぶって。……僕が全部運ばなくても、いいんだな。', 'The Aizu drivers will carry the papers to the next town. I do not have to carry everything myself.', undefined, 'right'),
  ],
};

/** After ID 8: the records reach Kyoto, where a city once built its own power. */
export const KYOTO: StoryChapter = {
  id: 15, act: 3,
  title: { ja: '蹴上、煉瓦の余韻', en: 'Keage brick echo' },
  place: { ja: '二日後　京都・祇園 → 蹴上 → 一周', en: 'Two days later · Kyoto, Gion → Keage → the loop' },
  route: 'kyoto-1986', art: 'angles/gion-wide-v1.png',
  synopsis: { ja: '書類の便が京都に着くと、町家の格子にも同じ王冠の通知が貼られていた。ユイは蹴上の発電所で、自分たちの電気をつくった町の話を聞く。', en: 'When the records reach Kyoto, the same crown notices are already posted on its townhouse lattices. At Keage, Yui hears how a city once built its own power.' },
  dossier: { ja: '祇園と四条の町家に、クラウンの買い取り通知。疏水と蹴上発電所は、明治の京都が自分で引いた水と電気。ユイは中継器を、置く人の電池と小さな太陽板で動く形に作り直す。', en: 'CROWN purchase notices on Gion and Shijō townhouses. The canal and the Keage power station gave Meiji Kyoto its own water and electricity. Yui redesigns the relays to run on each host’s battery and a small solar panel.' },
  intro: [
    line('mei', '祇園の町家に、王冠の通知。横浜と同じ紙、同じ文面。', 'Crown notices on the Gion townhouses. The same paper, the same words as in Yokohama.', 'gion', 'wide'),
    line('rei', '京都の分は、私の審査ではありません。でも、同じ計画表の形です。貸して、値上がりを待って、一斉に回収する。', 'The Kyoto cases were not my assessments. But the schedule is the same: lend, wait for prices to rise, then call it all in at once.'),
    line('aki', '通知の隣に、手書きの紙。「この家は売りません」。', 'Beside the notice, a handwritten sign: “This house is not for sale.”', undefined, 'detail'),
    line('mei', '撮る前に、家の人に聞いてくる。……舞妓さんにも、カメラを向けずに通り過ぎよう。', 'I will ask the family before I take a picture. And let us walk past the maiko without pointing a camera at them.'),
    line('yui', '蹴上の発電所。明治の京都は、琵琶湖から水を引いて、自分たちで電気をつくったんだって。', 'The Keage power station. Meiji-era Kyoto brought water from Lake Biwa and made its own electricity.', undefined, 'left', undefined, { ja: '京都・蹴上の煉瓦の発電所', en: 'KYOTO · THE BRICK POWER STATION AT KEAGE' }),
    line('jun', '町の人がお金を出して、若い技師が設計した。借りた電源箱とは、話が逆だな。', 'The townspeople paid for it, and a young engineer designed it. The opposite story to our borrowed power unit.'),
    line('yui', '中継器も、置く人の電池と小さな太陽板で動くように作り直す。一軒が止まっても、ほかは止まらない。', 'I will rebuild the relays to run on each host’s battery and a small solar panel. If one house goes dark, the others keep going.'),
    line('daichi', '京都のクラブは、塩小路の駅前から一周。烏丸、四条、蹴上、平安神宮の大鳥居をくぐって、堀川へ。', 'The Kyoto club starts at the station on Shiokōji. Karasuma, Shijō, Keage, under the great torii of Heian Shrine, then down Horikawa.', undefined, 'right'),
    line('ren', '十三キロで一周。……京都の人の前で、変な冗談は言わないよ。', 'Thirteen kilometres, one lap. I promise no strange jokes in front of the Kyoto people.'),
    line('aki', '通知の写しを預かったら、説明会に持って帰ろう。……さあ、京都を一周。', 'Once we have copies of those notices, we take them home for the hearing. Now, once around Kyoto.', 'gion', 'wide', undefined, { ja: '塩小路・京都タワーの前', en: 'SHIOKŌJI · BELOW KYOTO TOWER' }),
  ],
  victory: [
    line('mei', '町家の人たち、通知の写しを預けてくれた。写真は、家の名前を伏せて。', 'The townhouse families gave us copies of their notices. In the photographs, the house names are covered.', 'gion', 'wide', undefined, { ja: '夜・四条大橋', en: 'NIGHT · SHIJŌ BRIDGE' }),
    line('rei', '説明会で、京都の分も並べます。ひとつの港の話ではない、と分かるように。', 'At the hearing, I will lay out the Kyoto notices too. So people can see this is not one harbor’s story.'),
    line('yui', '設計図、できた。箱には貸主じゃなくて、持ち主の名前を書く。', 'The design is done. The case carries its owner’s name, not a lender’s.', undefined, 'detail'),
    line('ren', '鴨川の川べり、二人ずつ等間隔に座ってる。', 'Look at the riverbank. Couples sitting at perfectly even distances.', undefined, 'left'),
    line('aki', '私たちは、その間隔の外。……今は、それでいい。', 'We are outside the spacing. For now, that is fine.'),
    line('ren', 'この前のコーヒー、おいしかった。', 'That coffee the other night was good.'),
    line('aki', '選曲の相談は、まだ終わってないからね。', 'We have not finished arguing about your playlist.'),
    line('jun', '奈良から電話だ。昔のバンドのドラムが、春日の近くで喫茶店をやってる。……会いに行っても、いいかな。', 'A call from Nara. My old band’s drummer runs a coffee shop near Kasuga. Would it be all right if I went to see her?', undefined, 'right'),
    line('daichi', '明日の便は奈良行き。ちょうどいい。みんなで寄ろう。', 'Tomorrow’s run goes to Nara anyway. Perfect. We will all stop by.'),
  ],
};

/** After Kyoto: Jun returns to his old drummer, and a great work is built a handful at a time. */
export const NARA: StoryChapter = {
  id: 16, act: 3,
  title: { ja: '春日・空色の稜線', en: 'Kasuga sky ridge' },
  place: { ja: '翌日　奈良・三条通 → 若草山', en: 'The next day · Nara, Sanjō-dōri → Wakakusa-yama' },
  route: 'nara-1986', art: 'angles/nara-wide-v1.png',
  synopsis: { ja: 'ジュンが黙って抜けたバンドのドラマーは、奈良で喫茶店を開いていた。大仏殿の前で、ひと握りの土から大きなものをつくる話を聞く。', en: 'The drummer Jun walked out on now runs a coffee shop in Nara. Before the Great Buddha Hall, the crew hears how something vast was built from handfuls of earth.' },
  dossier: { ja: '聖武天皇の詔：一枝の草、一把の土を持って像づくりを助けたい者がいれば、許せ。ジュンは途中の曲のテープを昔の仲間に渡し、二人で四小節を書いた。説明会の音響は、ジュンが引き受けた。', en: 'From Emperor Shōmu’s edict: let anyone who wishes help build the image, even with a blade of grass or a handful of earth. Jun gave his unfinished tape to his old bandmate, and they wrote four bars together. He will run the sound at the hearing.' },
  intro: [
    line('daichi', '書類の便、奈良まで届いた。……鹿が、封筒を食べようとしてる。', 'The papers made it to Nara. A deer is trying to eat the envelope.', 'nara', 'wide'),
    line('mei', '鹿せんべいと間違えてるのかな。封筒は高く持って。', 'It thinks it is a deer cracker. Hold the envelopes up high.'),
    line('yui', 'お辞儀した！ ……お辞儀されたら、渡すしかないね。', 'It bowed! Well, if it bows, you have to give it one.', undefined, 'detail'),
    line('jun', 'ここだ。昔のドラムがやってる店。……僕は、録音の前の晩に、何も言わずにバンドを抜けた。', 'This is it. My old drummer’s shop. I left the band the night before we were due to record. Without a word.', undefined, 'left'),
    line('aki', '一人で入る？ それとも、一緒に？', 'Going in alone? Or together?'),
    line('jun', '……一緒に。頼むよ。', 'Together. Please.'),
    line('jun', '途中までの曲。続きを聴いてほしい。……いや、一緒に作ってほしい。', 'It is an unfinished song. I want you to hear the rest… No. I want you to help me write it.', undefined, 'right', undefined, { ja: '猿沢池のほとり・喫茶店', en: 'BY SARUSAWA POND · A COFFEE SHOP' }),
    line('ren', '店主さん、うなずいてる。……ジュン、泣いてる？', 'She is nodding. Jun, are you crying?'),
    line('jun', '埃だよ。喫茶店は、コーヒー豆の埃がすごいんだ。', 'It is dust. Coffee shops are full of coffee-bean dust.'),
    line('rei', '大仏は、国じゅうの人の寄進で造られました。「一枝の草、一把の土」でも、手伝いたい人は手伝っていい、と。', 'The Great Buddha was built with gifts from all over the country. Even “a blade of grass, a handful of earth”: anyone who wished to help could.', 'nara', 'wide', undefined, { ja: '東大寺・大仏殿の前', en: 'TŌDAI-JI · BEFORE THE GREAT BUDDHA HALL' }),
    line('yui', 'SORA X.O.R.も、それでいい。大きな一台じゃなくて、ひと握りずつ。', 'SORA X.O.R. can be like that. Not one giant machine, a handful at a time.'),
    line('aki', '若草山の上まで走る。……ジュン、着いたら一曲、聴かせて。', 'We race to the top of Wakakusa-yama. Jun, when we get there, play us something.'),
  ],
  victory: [
    line('jun', '途中までの曲、テープで流すよ。……続きは、昼に二人で書いた四小節。', 'I will play the unfinished song from the tape. The new part is the four bars we wrote this afternoon.', 'nara', 'wide', undefined, { ja: '夜・若草山の山頂', en: 'NIGHT · THE SUMMIT OF WAKAKUSA-YAMA' }),
    line('daichi', '奈良の町が、全部見える。灯りの数だけ、家があるんだな。', 'You can see the whole of Nara. A home for every light.'),
    line('mei', '鹿まで聴いてる。……写真、撮っていい？ ジュンに聞いてるんだよ。', 'Even the deer are listening. Can I take a picture? I am asking you, Jun.', undefined, 'detail'),
    line('jun', 'いいよ。泣いてないやつにしてね。', 'Sure. One where I am not crying.'),
    line('rei', '説明会は三日後。私は、自分の署名から説明します。……逃げずに。', 'The hearing is in three days. I will begin with my own signature. Without running.', undefined, 'left'),
    line('aki', 'ジュンも、今日は逃げなかったね。', 'Jun did not run today either.'),
    line('ren', '説明会の音響、ジュンに頼んでいい？', 'Can we ask you to run the sound at the hearing, Jun?', undefined, 'right'),
    line('jun', '……ああ。今度は、最後まで舞台の横にいる。', 'Yes. This time, I will stay beside the stage until the end.'),
    line('aki', '帰ろう。説明会の準備が待ってる。', 'Let us go home. The hearing will not prepare itself.'),
  ],
};
