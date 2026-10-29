/** Menu copy, chapter titles and HUD labels for each packaged street route.
 * Presentation only: none of this enters the native computation or a replay. */
export type StreetStage = '序' | '破' | '急';
export interface StreetChapter { readonly stage: StreetStage; readonly japanese: string; readonly english: string }
export interface StreetRouteStyle {
  readonly id: string;
  /** Short place name for headlines and the HUD, e.g. 東京 / TOKYO. */
  readonly place: { readonly ja: string; readonly en: string };
  readonly title: { readonly ja: string; readonly en: string };
  /** The route's real course, start to finish. */
  readonly path: { readonly ja: string; readonly en: string };
  readonly facts: { readonly ja: string; readonly en: string };
  readonly song: string;
  readonly finish: { readonly ja: string; readonly en: string };
  readonly provisional: { readonly ja: string; readonly en: string };
  /** One chapter per authored soundtrack cue, in order. */
  readonly chapters: readonly StreetChapter[];
  /** Tokyo's chapters sweep its sky from night to sunrise. */
  readonly dawnArc: boolean;
  /** Particles drawn over the race frame, and the sectors they fall in
   * (everywhere when absent). */
  readonly atmosphere: 'blossom' | 'snow' | 'leaves' | null;
  readonly atmosphereSectors?: readonly number[];
  /** How the native weather window (lower grip, 1:00–4:00 of the clock) is drawn. */
  readonly precipitation: 'rain' | 'snow';
}

const TOKYO: StreetRouteStyle = {
  id: 'tokyo-1986',
  place: { ja: '東京', en: 'TOKYO' },
  title: { ja: '暁の街道。', en: 'ROAD TO DAWN' },
  path: { ja: '俎橋 → 靖国通り → 国会議事堂', en: 'Manaita-bashi · Yasukuni-dori · National Diet' },
  facts: { ja: '7.01 km × 2周 · 8台 · 雨の東京', en: 'Two laps · Eight cars · Wet streets' },
  song: '靖國神社で会おう',
  finish: { ja: '夜明けに、また。', en: 'SEE YOU AT DAWN.' },
  provisional: { ja: '1986年の街並みを描く試作コース', en: 'A provisional interpretation of 1986 Tokyo' },
  // Authored chapter names for the packaged soundtrack. These are creative
  // markers, not a claim that its tempo or musical structure has been measured.
  chapters: [
    { stage: '序', japanese: '序・静かな点火', english: 'QUIET IGNITION' },
    { stage: '破', japanese: '破・街の鼓動', english: 'CITY PULSE' },
    { stage: '破', japanese: '破・交錯', english: 'CROSSCURRENTS' },
    { stage: '急', japanese: '急・解放', english: 'BREAK FREE' },
    { stage: '急', japanese: '急・暁へ', english: 'INTO THE DAWN' },
  ],
  dawnArc: true,
  atmosphere: 'blossom',
  atmosphereSectors: [2],
  precipitation: 'rain',
};

const IROHAZAKA: StreetRouteStyle = {
  id: 'irohazaka-1986',
  place: { ja: '日光', en: 'NIKKO' },
  title: { ja: 'いろは、空への四十八。', en: 'FORTY-EIGHT TO THE SKY' },
  path: { ja: '馬返 → 第二いろは坂 → 明智平', en: 'Umagaeshi · Second Irohazaka · Akechidaira' },
  facts: { ja: '7.17 km 上り一方通行 · 20のヘアピン · 標高差410 m', en: 'One-way climb · Twenty kana hairpins · 410 m of height' },
  song: '四十八の曲がり角',
  finish: { ja: '明智平に着いた。', en: 'MADE IT TO AKECHIDAIRA.' },
  provisional: { ja: '1986年の第二いろは坂を描く試作コース', en: 'A provisional interpretation of the 1986 Second Irohazaka' },
  chapters: [
    { stage: '序', japanese: '序・馬返', english: 'UMAGAESHI' },
    { stage: '破', japanese: '破・いろはの坂', english: 'THE IROHA BENDS' },
    { stage: '破', japanese: '破・紅葉の壁', english: 'WALLS OF MAPLE' },
    { stage: '急', japanese: '急・黒髪平', english: 'KUROKAMIDAIRA' },
    { stage: '急', japanese: '急・明智平へ', english: 'TO AKECHIDAIRA' },
  ],
  dawnArc: false,
  atmosphere: 'leaves',
  precipitation: 'rain',
};

const AIZU: StreetRouteStyle = {
  id: 'aizu-wakamatsu-1986',
  place: { ja: '会津若松', en: 'AIZU-WAKAMATSU' },
  title: { ja: '城を望む丘へ。', en: 'TO THE HILL FACING THE CASTLE' },
  path: { ja: '会津若松駅 → 鶴ヶ城 → 飯盛山', en: 'Aizu-Wakamatsu Sta. · Tsuruga-jō · Iimoriyama' },
  facts: { ja: '8.06 km 一方向 · 8台 · 秋の夕暮れ', en: 'Point to point · Eight cars · Autumn evening' },
  song: '鶴ヶ城の夕べ',
  finish: { ja: '丘の上から、城が見える。', en: 'FROM THE HILL, THE CASTLE.' },
  provisional: { ja: '1986年の会津若松を描く試作コース', en: 'A provisional interpretation of 1986 Aizu-Wakamatsu' },
  chapters: [
    { stage: '序', japanese: '序・駅前通り', english: 'STATION STREET' },
    { stage: '破', japanese: '破・七日町', english: 'NANOKAMACHI' },
    { stage: '破', japanese: '破・鶴ヶ城', english: 'TSURUGA CASTLE' },
    { stage: '急', japanese: '急・飯盛山へ', english: 'TOWARD IIMORIYAMA' },
    { stage: '急', japanese: '急・丘の上から', english: 'FROM THE HILL' },
  ],
  dawnArc: false,
  atmosphere: 'leaves',
  atmosphereSectors: [9, 10, 11, 12],
  precipitation: 'rain',
};

const KYOTO: StreetRouteStyle = {
  id: 'kyoto-1986',
  place: { ja: '京都', en: 'KYOTO' },
  title: { ja: '蹴上、煉瓦の余韻。', en: 'KEAGE BRICK ECHO' },
  path: { ja: '京都駅 → 四条 → 祇園 → 蹴上 → 平安神宮 → 堀川', en: 'Kyoto Sta. · Shijō · Gion · Keage · Heian Jingū · Horikawa' },
  facts: { ja: '13.18 km × 1周 · 8台 · 晩秋の夕暮れ', en: 'One lap · Eight cars · Late-autumn dusk' },
  song: '鴨川ライト',
  finish: { ja: '京都の灯が、ともる。', en: 'KYOTO LIGHTS UP.' },
  provisional: { ja: '1986年の京都を描く試作コース', en: 'A provisional interpretation of 1986 Kyoto' },
  chapters: [
    { stage: '序', japanese: '序・京都駅', english: 'KYOTO STATION' },
    { stage: '破', japanese: '破・四条の灯', english: 'SHIJO LIGHTS' },
    { stage: '破', japanese: '破・蹴上', english: 'KEAGE' },
    { stage: '急', japanese: '急・平安の鳥居', english: 'THE GREAT TORII' },
    { stage: '急', japanese: '急・堀川を南へ', english: 'DOWN HORIKAWA' },
  ],
  dawnArc: false,
  atmosphere: 'leaves',
  atmosphereSectors: [8, 9, 10],
  precipitation: 'rain',
};

const NARA: StreetRouteStyle = {
  id: 'nara-1986',
  place: { ja: '奈良', en: 'NARA' },
  title: { ja: '春日、空色の稜線。', en: 'KASUGA SKY RIDGE' },
  path: { ja: '国鉄奈良駅 → 猿沢池 → 東大寺 → 若草山', en: 'JNR Nara Sta. · Sarusawa-ike · Tōdai-ji · Wakakusa-yama' },
  facts: { ja: '6.22 km 一方向 · 14のヘアピン · 晩秋の午後', en: 'Point to point · Fourteen hairpins · Late-autumn afternoon' },
  song: '鹿の夕映え',
  finish: { ja: '若草山の頂へ。', en: 'ON TOP OF WAKAKUSA-YAMA.' },
  provisional: { ja: '1986年の奈良を描く試作コース', en: 'A provisional interpretation of 1986 Nara' },
  chapters: [
    { stage: '序', japanese: '序・三条通り', english: 'SANJO-DORI' },
    { stage: '破', japanese: '破・猿沢池', english: 'SARUSAWA POND' },
    { stage: '破', japanese: '破・大仏池', english: 'THE GREAT BUDDHA HALL' },
    { stage: '急', japanese: '急・若草のつづら折り', english: 'WAKAKUSA SWITCHBACKS' },
    { stage: '急', japanese: '急・山頂へ', english: 'TO THE SUMMIT' },
  ],
  dawnArc: false,
  atmosphere: 'leaves',
  atmosphereSectors: [4, 5, 6, 7, 8, 9, 10],
  precipitation: 'rain',
};

export const STREET_ROUTE_STYLES: readonly StreetRouteStyle[] = [TOKYO, IROHAZAKA, AIZU, KYOTO, NARA];

/** The route's presentation; unknown routes fall back to Tokyo's wording. */
export function streetRouteStyle(id: string): StreetRouteStyle {
  return STREET_ROUTE_STYLES.find(route => route.id === id) ?? TOKYO;
}
