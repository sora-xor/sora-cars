> **Provenance.** Authoring research for `kyoto-1986`, delivered on 2026-10-29 and kept here as written. Since then the route has been registered in `scripts/lib/street-routes.ts`, exported by the native compiler and packaged for practice. It now has its own song, *Kamogawa Lights / 鴨川ライト* (3:29), so `targetMs` is 209,080; figures below that quote an earlier `targetMs` or call the soundtrack a placeholder predate that. The shipped authoring is [`world/authoring/kyoto-1986.json`](../../authoring/kyoto-1986.json) with its `.objects.json`. "This folder" below is the research working folder. Its tools, OSM and DEM extracts and aerial overlays are kept locally, untracked, in `output/street-routes/research/kyoto-1986/`.

# Kyoto 1986 — 蹴上・煉瓦の余韻 / Keage Brick Echo (`kyoto-1986`)

Draft street route for SORA CARS, catalog code 26. It is authoring research, not a qualified track. Nothing here was written into the repository.

| | |
|---|---|
| Topology | circuit, **1 lap**, counter-clockwise (interior on the driver's left) |
| Length | **13.176 km** (2,637 samples, 56 control points) |
| Gates | **14** |
| Elevation | 26.4–62.0 m; max grade 5.0 % (Keage hairpin exit); steepest 100 m 4.4 % |
| Corners | tightest sampled radius about 20 m; Keage hairpin is a 24 m-radius arc; curvature × half-width peak 72.4 M of the 79 M bound |
| Pace | single car 3:24.7 / 3:28.9 (two grid lanes); Tokyo-calibrated eight-car estimate 3:26–4:15 |
| targetMs / maxTicks | 207,000 / 9,000 |

Files in this folder:
- `route.json` and `objects.json` are the deliverables.
- `check.ts` compiles both with the repository compilers and prints the statistics.
- `pace.ts` runs the pace model.
- `tools/` holds the helper scripts.
- `data/` holds the OSM extracts, DEM samples, design table and cached tiles.
- `img/` holds the aerial overlays.

---

## (a) Route summary and why this alignment

**Order of travel:**
1. Start on **Shiokōji-dōri in front of the 1952 Kyoto Station**.
2. Turn left at the **Kyoto Tower** corner and run north on **Karasuma-dōri**, past **Higashi Honganji**.
3. At **Shijō-Karasuma**, turn right and run east down **Shijō-dōri** through the department-store blocks. Cross **Shijō Ōhashi** and the at-grade **Keihan level crossing**, then pass **Minamiza** and **Gion**. **Yasaka Shrine's vermilion west gate** stands dead ahead at the T.
4. Turn left (north) up **Higashiōji-dōri**.
5. At **Higashiyama-Sanjō**, turn right and climb **Sanjō-dōri** beside the **Keishin line's street track** to **Keage**.
6. Take the **Keage hairpin** into the south end of Shirakawa-dōri. The **1912 brick power station** is on the left and the **incline** on the right.
7. Turn left along **Niōmon-dōri**, with the **Biwa canal** on the right.
8. Turn right up **Jingū-michi**, under **Heian Jingū's great torii** and between the museums.
9. Turn left onto **Nijō-dōri** and right up **Higashiōji-dōri**.
10. Turn left onto **Marutamachi-dōri**, cross the **Kamo**, and pass the **Kyoto Gyoen** wall.
11. Turn left down **Horikawa-dōri**, past **Nijō Castle's** east front and **Nishi Honganji**.
12. Turn left onto **Shiokōji-dōri** back to the station.

**Why this shape:**
- **A lap is the only fully legal option.** The compiler forbids self-crossings, and Shijō-dōri has to be driven eastbound for the Yasaka gate reveal. The return to the station therefore has to pass west of Karasuma. Horikawa-dōri is the wide two-way arterial that does that, and it adds Nijō Castle and Nishi Honganji.
- **Every major site from the brief is on the road except Tōji.** Tōji's pagoda is only a far skyline object, about 0.9 km off the Horikawa–Shiokōji corner.
- **Keage stays central.** Code 26's Keage brief (power station, incline, canal) is preserved.
- **Rejected options:**
  - Kawabata-dōri: it would cross the Shijō leg, and south of Sanjō it is a post-1987 road.
  - Two laps of a 6–7 km east-side loop: it loses the station, the tower or Keage.
  - Running the forecourt in front of Heian Jingū: it was a road in 1986, but its 1986 regulation is unknown.
  - Ninenzaka and any other pedestrian lane.
- **It fits the time limit.** One 13.2 km lap repeats nothing and fits the 5:00 cap comfortably (see "Pace").

**Method:**
1. **Geometry.**
   - OpenStreetMap (Overpass, 29 Oct 2026) named-road paths; dual carriageways were averaged into one road axis (`tools/osm_paths.py`, `tools/axis.py`).
   - The axis was simplified into corner and bend vertices (`tools/simplify.py`, `data/design.json`).
2. **1980s check.** The compiled samples were overlaid on GSI aerial tiles (`tools/mosaic.mjs`, `tools/dump-samples.ts`, `img/check_*.png`).
   - **gazo3 (1984–86) and gazo4 (1988–90) return HTTP 404 for every central-Kyoto tile at z14–18.** The nearest dated evidence is therefore **gazo2 (1979–83)**, with **gazo1 (1974–78)** used at Keage.
   - The alignment matches the 1979–83 roads at Karasuma, Shijō, Gion, Higashiōji, Sanjō, Keage, Okazaki, Marutamachi, Horikawa and Shiokōji.
3. **Elevation.** GSI DEM5A PNG tiles were sampled every 10 m (`tools/dem.mjs`) and smoothed over ±40 m. The bridge spans were interpolated, and the Keage hairpin was hand-set.

**Pace (`pace.ts`):**
- **Model.** The repository's own single-car handling graph (`output/qualification/street-handling/handling.graph.json`, read-only) and practice AI (`streetDriver`) are run on the compiled track.
  - The model includes the four oil zones and treats the other grid slot as a ghost.
  - It omits car contacts and props, so it is a single-car estimate.
- **Calibration against Tokyo.**
  - On Tokyo the same model gives 3:46.3 in lane +1 and 4:24.7 in lane −1.
  - Replaying the recorded two-car Tokyo bundle (`tools/tokyo-race.ts`, read-only) gives 3:48.0 and 4:36.1.
  - The recorded eight-car range is 6,841–8,462 ticks.
- **Kyoto result.**
  - Single car: 6,142 / 6,267 ticks (3:24.7 / 3:28.9).
  - Tokyo-scaled eight-car field: 6,189–7,656 ticks (3:26–4:15), leaving at least 45 s under the 9,000-tick cap.
- **Weak spots.**
  - The practice AI looks only 20 m ahead and pins itself on the inside wall at very sharp corners. That is why the Keage hairpin uses a 24 m arc 18 m wide, and Okazaki's narrow corners use 24–30 m trims (`tools/hairpin_variants.py`, `tools/walls.ts`).
  - Tighter, more literal geometry (16–20 m arc, 11 m wide) left the AI stuck for 5–17 s.
- **Gate splits** (single car, lane −1):

  | Gate | Split |
  |---|---|
  | higashi-honganji | 0:10 |
  | shijo-karasuma | 0:30 |
  | shijo-ohashi | 0:45 |
  | yasaka-gate | 0:53 |
  | higashiyama-sanjo | 1:03 |
  | keage | 1:18 |
  | nanzenji | 1:24 |
  | great-torii | 1:32 |
  | marutamachi-bashi | 2:05 |
  | sakaimachi-gomon | 2:16 |
  | nijo-castle | 2:38 |
  | nishi-honganji | 3:11 |
  | horikawa-shiokoji | 3:18 |
  | finish | 3:25 |

**Gates and cues:**

| Gate (km) | Place |
|---|---|
| station-front 0.000 (start/finish) | Shiokōji, at the station plaza |
| higashi-honganji 0.545 | Karasuma, opposite the Goei-dō-mon |
| shijo-karasuma 1.944 | corner |
| shijo-ohashi 3.014 | over the Kamo |
| yasaka-gate 3.534 | Higashiōji T corner |
| higashiyama-sanjo 4.164 | corner, tram stop |
| keage 5.199 | hairpin apex |
| nanzenji 5.528 | bend at the Funadamari |
| great-torii 6.038 | under the torii |
| marutamachi-bashi 7.548 | over the Kamo |
| sakaimachi-gomon 8.303 | Gyoen gate |
| nijo-castle 9.832 | opposite the Higashi Ōtemon |
| nishi-honganji 12.212 | opposite the Goei-dō-mon |
| horikawa-shiokoji 12.691 | corner |

- Sound cues (ms): 0, 45 800 (Shijō Ōhashi and Gion), 63 300 (Sanjō tram climb), 93 400 (Okazaki torii), 126 500 (Kamo at Marutamachi), 159 500 (Nijō Castle and the Horikawa home run).
- The sound asset and hash are placeholders.

---

## (b) 1986 road facts

### Directions and one-way rules

- **Arterials.** Karasuma, Shijō, Higashiōji, Sanjō, Marutamachi, Horikawa and Shiokōji are two-way arterials; Karasuma, Horikawa and Shiokōji are divided. All are driven here in the legal direction on the left-hand carriageway.
- **Higashiōji, Shijō, Marutamachi, Karasuma; Sanjō.** The first four carried double-track city tramways until 1972–78 and Sanjō carried the Keishin tramway (see below). All are two-way today, and no evidence of a one-way rule on any of them in 1986 was found.
- **Minor roads.** In the modern OSM data, every minor road on the route is tagged two-way:
  - the Keage connector (south end of Shirakawa-dōri);
  - Niōmon-dōri between the connector and Jingū-michi;
  - Jingū-michi;
  - Okazaki Nijō-dōri.

  Their **1986 signage is unconfirmed**.
- **Avoided one-way streets.** Niōmon-dōri west of Higashiōji, Higashinotōin, Nishinotōin and Aburanokōji are all one-way today and none are used.
- **Keage left turn.** Today the Sanjō-eastbound → connector-northbound left turn at Keage has its own slip link. Whether the movement was permitted in 1986 is **unconfirmed**.

### Lanes and widths (authored half-widths in brackets)

| Road | 1986 evidence | Authored |
|---|---|---|
| Karasuma-dōri | 2018 MLIT cross-section, Gojō–Shichijō: 4 lanes of 3.25–3.30 m, 2.0 m median, 2.5–2.75 m stopping strips, 20.3 m kerb to kerb. Assumed similar after the 1981 subway reinstatement (unconfirmed). Bends east around Higashi Honganji: the 1912 tram widening, with a tree-lined island in the triangle (1979–83 aerial). | 10.0 m |
| Shijō-dōri | 15 m carriageway, two lanes each way, until the 2015 narrowing of the 1.1 km shopping section (trafficnews). Sidewalks 3.5 m each (JSCE / Kyoto search summary). | 7.5 m |
| Shijō Ōhashi | Current bridge 1942 (built after the 1935 flood). | 7.5 m |
| Higashiōji-dōri | 4 lanes today. 1986 lane marking unconfirmed. | 7.0 m |
| Sanjō-dōri, Higashiōji–Keage | Keishin double track in the middle of the street. General-traffic lanes beside it not documented; probably one each way (unconfirmed). Widened to 4 lanes after 1997 (OSM lanes=4 today; date unconfirmed). | 7.0 m |
| Keage junction | Open Y-junction (1974–78 and 1979–83 aerials). Modelled as a 24 m arc, 18 m wide. | 9.0 m |
| Connector beside the incline | Two-lane road visible on gazo1 and gazo2. | 6.0 m |
| Niōmon-dōri (east) | Two lanes. City tram Keage line on Niōmon until 10 July 1965. | 5.0–5.5 m |
| Jingū-michi, through the torii | Two lanes; the torii is 18.18 m wide overall. | 5.5 m |
| Nijō-dōri (Okazaki) | Two lanes. | 5.5–6.0 m |
| Marutamachi-dōri | 4 lanes. | 7.5 m |
| Horikawa-dōri | Up to 8 lanes, with an 8–10 m median north of Imadegawa. Divided; the dry Horikawa channel on the east side from Marutamachi to Oike. | 12.0 m (the cap) |
| Shiokōji-dōri | 4 lanes, divided. | 8.0–9.0 m |

### Rail crossings and street tramways

| Where (track km) | What | Dates and evidence |
|---|---|---|
| Shijō-dōri at the east end of Shijō Ōhashi (≈3.03–3.09 km) | **Keihan main line at grade**: the "四条通り踏切", between the Kamo and the canal. Keihan **四条** station had staggered platforms: Kyoto-bound north of Shijō-dōri, Osaka-bound south (moved there November 1982, when barriers were also fitted). | Opened 1915. Line underground **24 May 1987** (8 crossings removed; works from about March 1979). Kawabata-dōri built over the old track bed afterwards. Station renamed 祇園四条 in 2008. The 1979–83 aerial shows the line and works along the east bank. |
| Sanjō-dōri, Higashiōji corner → Keage (≈4.16–5.10 km) | **Keihan Keishin line street track** in the middle of the road. Stops with safety islands at **東山三条** (0.6 km from the 三条 terminal, at the Higashiōji corner) and **蹴上** (1.6 km, just west of the Keage junction, near the power station). East of Keage the line left the road on its own right-of-way to Kujōyama (66.7‰). Locals were 80形 cars; expresses passed through Keage unless the junction signal was red. | Street track on Sanjō from 20 February 1931. Keage–Hinooka moved to private way 1933. Line closed after **11 October 1997**, replaced by the Tōzai subway on **12 October 1997**. The terminal was called 三条 until it was renamed 京津三条 in 1987. |
| Karasuma-dōri | Subway Karasuma line below, Kitaōji–Kyoto. Entrances on the sidewalks; no surface rail. | Opened 29 May 1981. |
| Everywhere else | **No city trams.** | Shijō line closed 23 January 1972; Marutamachi 1 April 1976; Karasuma 1 October 1977; Higashiyama (Higashiōji) 1 October 1978; total abolition **30 September 1978**; Keage (Niōmon) line 1965; Horikawa line 1961. |
| Horikawa–Shiokōji | JNR Tōkaidō main line tracks lie south of Shiokōji, beside the 1952 station. Not crossed. | JNR until **1 April 1987**, when JR West took over. |

---

## (c) Sector table

The loop runs counter-clockwise, so the driver's left is the loop interior. District names are the nearest `docs/period-city.md` districts. *New* marks something the current period city cannot yet draw.

| Sector (length) | Left | Right | What is really there |
|---|---|---|---|
| 0 Station front → Kyoto Tower corner (115 m) | office | open plaza → station (*new*: 1952 station plus plaza) | Start line on Shiokōji. To the right, the station plaza with its bus terminal, and the long two-storey 1952 station with its eight-storey central tower 80–100 m back. To the left, Kyoto Tower on its 31 m, 9-storey base at the NW corner of Karasuma, plus 1960s–80s hotels and offices. |
| 1 Karasuma: Kyoto Tower → Higashi Honganji → Shōmen (1,005 m) | shrine (*new*: temple wall and gates) | kanda | On the left: Kyoto Tower, then Higashi Honganji. The road bends east around a tree-lined median island; behind the island are the temple's long wall, the 27 m Goei-dō-mon (about 70 m off) and the huge roofs of the Goei-dō and Amida-dō. On the right: a temple-town of pilgrim inns, Buddhist-goods shops and low offices. Subway entrances. |
| 2 Karasuma: Gojō → Shijō (825 m) | office | office | Banks, insurance and trading offices of 8–10 storeys, held to the 31 m line; tile and curtain-wall facades; footbridges at the big crossings (unconfirmed). |
| 3 Shijō: Karasuma → Kawaramachi (1,070 m) | kanda | kanda | The four-lane shopping canyon. Daimaru on the north side (left) near Takakura. Fujii Daimaru at Teramachi (unconfirmed). Takashimaya at the SW corner of Kawaramachi (right) and the 1976 Shijō-Kawaramachi Hankyu at the SE corner. Narrow 3.5 m pavements packed with shoppers; zakkyo, banks and record shops. |
| 4 Shijō Ōhashi, Kawabata crossing, Minamiza (345 m) | river (moat-like open run), then shophouse | river, then theatre (*new*) | The Kamo, with its dry riverbanks. Tōka-saikan (1926, Vories) at the right-hand bridgehead and Kikusui (1926) at the left. Then the Keihan level crossing with its barriers and platforms, and **Minamiza** on the right: the 1929 Momoyama-style gabled front with its licence turret. |
| 5 Gion: Hanamikōji → Yasaka (175 m) | kanda, machiya-heavy (nikko-like) | kanda, machiya-heavy | Ochaya and old shops with bengara lattices and lanterns; Ichiriki's red wall on the right at Hanamikōji. The vermilion two-storey west gate on its stone steps fills the windscreen at the T. |
| 6 Higashiōji: Yasaka → Sanjō (630 m) | kanda | shrine, then kanda | On the right: the Yasaka/Maruyama precinct trees for the first 100–150 m, then a temple-town with the Chion-in approach (its 1621 Sanmon about 380 m up the side street). On the left: shops and machiya. |
| 7 Sanjō: Higashiyama-Sanjō → Awataguchi (680 m) | nikko-style shophouses | nikko-style shophouses | Two-storey machiya and shophouses with the double tram track in the road. Higashiyama-Sanjō safety-island stop. Shōren-in's wall and giant camphors down Jingū-michi on the right. The street starts to climb. |
| 8 Keage climb, hairpin, incline (645 m) | residential/forest, then power station (*new*: brick industrial) | forest | Climbing to about 62 m. On the right: the Higashiyama slope and the Miyako Hotel on the hill. The Keage tram stop, then the hairpin. On the connector: the red-brick 1912 power station 28 m to the left; the restored incline embankment with rails and a boat cradle, lined with cherry trees, 15–20 m to the right. |
| 9 Nanzen-ji Funadamari, Niōmon canal (475 m) | residential (villa walls) | moat (canal) | The canal basin at the incline foot, then the canal along the right with the zoo (1903) beyond. Walled villa gardens on the left. Narrow two-lane road. |
| 10 Okazaki: Jingū-michi, Nijō-dōri (565 m) | park | park | Over the canal bridge and under the 24.4 m great torii. The new MoMAK and the 1909 Prefectural Library on the left; the 1933 Museum of Art on the right. At the Nijō corner Heian Jingū's vermilion Ōtenmon stands about 180 m ahead. After the turn, the 1960 Kyoto Kaikan is on the right. |
| 11 Higashiōji north, Marutamachi east (1,020 m) | residential | kanda | Shōgoin's mixed blocks. Kumano Jinja at the Marutamachi corner, on the right after the turn. University-hospital district north of Marutamachi. |
| 12 Marutamachi-bashi (380 m) | river | river | The Kamo again, with views up to Kitayama and Daimonji (Mt. Nyoigatake) behind. Then the Kawaramachi crossing. |
| 13 Marutamachi: Teramachi → Karasuma → Horikawa (1,415 m) | office/kanda | park, then office | The Gyoen's south side on the right as far as Karasuma: stone-faced bank, the Sakaimachi gate, pines and the start of the gravel avenues. West of Karasuma, offices and housing. |
| 14 Horikawa: Marutamachi → Oike (715 m) | dry channel, then residential | moat (castle) | Nijō Castle on the right: outer moat, battered stone wall, white plastered wall, the Higashi Ōtemon gate-turret (57 m off) and the SE corner turret. On the left, the sunken, dry concrete Horikawa channel. |
| 15 Horikawa: Oike → Gojō (1,640 m) | office | office | Wide divided avenue of 1960s–80s offices and hotels. Crosses Gojō-dōri, a wartime-widened avenue (width unconfirmed). |
| 16 Horikawa: Gojō → Shichijō (995 m) | kanda | shrine (temple wall and gates, *new*) | On the right: Nishi Honganji's long wall and the Goei-dō-mon (33 m off) and Amida-dō-mon, with the 1636 Goei-dō roof behind. On the left: Buddhist-goods shops. The avenue jogs east near Hanayachō. |
| 17 Shiokōji: Horikawa → station (485 m) | office | office | Hotels and offices on the left. The Central Post Office and the west end of the station on the right. Kyoto Tower ahead-left; Tōji's pagoda far to the right-rear. |

---

## (d) Landmarks

- **Side** is the driver's side in the direction of travel.
- **Distance** is measured from the centreline at the nearest sample (`tools/landmark-sides.ts`); positions are OSM centroids.
- **Prominence:** A = hero, modelled and floodlit; B = modelled; C = background or skyline.

| id | 名称 / Name | lon, lat | Track km, side, distance | Footprint, height | 1986 appearance | Prom. |
|---|---|---|---|---|---|---|
| kyoto-station-1952 | 京都駅（3代目駅舎）/ Kyoto Station, 1952 building | ≈135.7590, 34.9863 (approx.) | 0.05, right, ≈100 m (across the plaza) | Long two-storey RC block with an 8-storey central tower; length unconfirmed (~200 m+) | Completed 27 May 1952, functionalist concrete; used until 1993. Signs read 国鉄 / JNR (JR only from 1 April 1987). Colour and lettering unconfirmed. | A |
| kyoto-tower | 京都タワー / Kyoto Tower | 135.75933, 34.98755 | 0.15, left, 40 m | Base about 60×40 m (approx.), 31 m (9 storeys); tower to 131 m | Opened 28 December 1964. Milky-white monocoque shaft; red deck and top. "Kyoto Tower Hotel" in the base. No "Nidec" name (that came in 2024). | A |
| higashi-honganji | 東本願寺 御影堂門・御影堂 / Higashi Honganji | gate 135.75943, 34.99100; hall 135.7584, 34.9914 | 0.54, left; gate 70 m, hall 163 m | Gate 27 m tall; Goei-dō about 76×58 m (unconfirmed), about 38 m high (unconfirmed) | Halls 1880–1895. No scaffolding: the hall retrofit was 2004–09 and the gate repair about 2011. A tree-lined median island in front; no 2023 plaza. | A |
| daimaru | 大丸京都店 / Daimaru | ≈135.7618, 35.0040 | ≈2.15, left | Block-long department store | Present on Shijō; 1986 facade details unconfirmed. | C |
| takashimaya-hankyu | 高島屋京都店・四条河原町阪急 / Takashimaya, Kawaramachi Hankyu | ≈135.7685 / 135.7693, 35.0035 | ≈2.70, right (SW and SE corners) | Department stores | Hankyu in the rebuilt Sumitomo building, open 15 October 1976 to 22 August 2010. Takashimaya's 1986 frontage unconfirmed. | B |
| toka-saikan | 東華菜館 / Tōka-saikan | ≈135.77095, 35.00355 | 2.96, right, ≈29 m | Five storeys | Vories, December 1926. Spanish Baroque terracotta front (style per secondary sources). Beijing restaurant since after the war. | B |
| shijo-ohashi | 四条大橋 / Shijō Ōhashi | 135.7715, 35.0038 | 2.90–2.97, the road itself | About 65 m span | The 1942 bridge. | B |
| kikusui | レストラン菊水 / Kikusui | ≈135.7722, 35.0041 | 3.08, left, ≈30 m | 5 storeys incl. roof | 1926 building at the Kawabata corner: triangular corner bay, mask reliefs, summer roof beer garden (closed in November). | B |
| keihan-shijo | 京阪 四条駅・四条通り踏切 / Keihan Shijō station and crossing | ≈135.7721, 35.0038 | 3.03–3.09, across the road | Double track; platforms north (left) and south (right) | Barriers since November 1982; underground works hoarded along the bank. Two-tone green commuter trains and orange/red limited expresses. | A |
| minamiza | 南座 / Minamiza | 135.7724, 35.00349 | 3.10, right, 37 m | 1,952 m² site; 4 storeys plus licence turret | Present building 1929: Momoyama-style karahafu gables and the licence turret. In late November–December, the maneki boards for kaomise. | A |
| ichiriki | 一力亭 / Ichiriki | 135.77522, 35.0036 | 3.35, right, 26 m | Two-storey ochaya | Red bengara walls at the Hanamikōji corner (traditional; no 1986 change known). | B |
| yasaka-nishiromon | 八坂神社 西楼門 / Yasaka west gate | ≈135.77775, 35.00385 | 3.55, ahead then right, 44 m | Two-storey gate on a stone stair; about 15 m tall (unconfirmed) | Rebuilt 1497; moved 6 m east and 3 m north in 1913. Vermilion. Important Cultural Property. Precinct trees behind. | A |
| chion-in-sanmon | 知恩院 三門 / Chion-in Sanmon | 135.78182, 35.00504 | 3.71, right, ≈380 m up the side street | About 24 m | 1621 gate seen up the approach. | C |
| keishin-trams | 京阪京津線 東山三条・蹴上停留場 / Keishin stops | ≈135.7790, 35.0094; ≈135.7883, 35.0093 | 4.2 and 5.08, in the road | Safety islands | 80形 two-car sets: light-green body, dark blue-green bands, no air conditioning (fitted from 1989). Stops with islands and signals. | A |
| shoren-in | 青蓮院（楠）/ Shōren-in camphors | ≈135.7830, 35.0085 (approx.) | ≈4.52, right, ≈80–150 m down Jingū-michi | Huge camphors on the wall | Camphors on a stone wall at the Jingū-michi frontage (location from secondary sources; unconfirmed in detail). | C |
| miyako-hotel | 都ホテル / Miyako Hotel | ≈135.7880, 35.0085 (approx.) | ≈5.0, right, uphill | Hillside blocks, 6–8 storeys (unconfirmed) | Founded 1890; 1960 Murano Tōgo main building; called 都ホテル in 1986 (Westin only from 2002). Any centenary wing is post-1986 (unconfirmed). | B |
| keage-power-station | 第2期蹴上発電所 / Keage power station (1912) | 135.78887, 35.00977 | 5.27, left, 28 m | Long two-storey hall (about 60×20 m, unconfirmed) | Red brick with arched openings; built March 1910–May 1912; still Kansai Electric property. | A |
| keage-incline | 蹴上インクライン / Keage incline | 135.79106, 35.00742 → 135.78818, 35.01147 | 5.20–5.45, right, 15–20 m | 582 m long, 36 m drop | Boats carried 1890–1948. Rails and a boat cradle restored in 1977. No historic-site plaques (designated 1996). Cherry trees (bare in late November). | A |
| funadamari-canal | 南禅寺船溜・琵琶湖疏水 / Nanzen-ji basin and canal | ≈135.7865, 35.0122 | 5.45–5.95, right, 20–60 m | Basin and canal | First canal completed 1890; stone-edged channel. No Biwa Canal Museum (opened August 1989). | A |
| kyoto-zoo | 京都市動物園 / Kyoto City Zoo | 135.78662, 35.01285 | 5.6, right, about 110 m across the canal | Park | Opened 1903; 1986 enclosures unconfirmed. | C |
| great-torii | 平安神宮 大鳥居 / Heian Jingū great torii | 135.78272, 35.01257 | 6.04, spans the road | 24.42 m high, 18.18 m wide | Concrete myōjin torii, completed 6 October 1928 (ceremony 10 April 1929). Red-orange on the 1979–83 aerial; text sources here give no colour. Registered property only later. | A |
| momak | 京都国立近代美術館 / National Museum of Modern Art | 135.78196, 35.01235 | 6.02, left, 67 m | 4 storeys, kept lower than the torii | **Maki building completed 15 September 1986, opened 25 October 1986.** Before that, a construction site (works from February 1984). Pale stone and aluminium grid (style unconfirmed in source). | B |
| museum-of-art | 京都市美術館 / Kyoto City Museum of Art | 135.78355, 35.01286 | 6.06, right, 81 m | Large, about 100×120 m | 1933 Imperial-Crown-style hall. No Kyocera name and no glass "ribbon" entrance (both 2020). | B |
| prefectural-library | 京都府立図書館 / Kyoto Prefectural Library | 135.78201, 35.01296 | 6.08, left, 58 m | Three storeys | Original 1909 Takeda Goichi building of brick and granite, entire. Rebuilt behind the kept facade in 2001. | C |
| heian-otenmon | 平安神宮 應天門 / Ōtenmon | 135.78245, 35.01543 | 6.17, ahead at the Nijō corner, ≈180–200 m | Two-storey vermilion gate, green tiles | Built for the 1895 founding; Important Cultural Property. | B |
| kyoto-kaikan | 京都会館 / Kyoto Kaikan | 135.78101, 35.01435 | 6.29, right, 77 m | Concert hall | Maekawa Kunio, 1960, with its heavy eaves. ROHM Theatre only from January 2016. | B |
| kumano-jinja | 熊野神社 / Kumano Jinja | 135.77804, 35.01771 | 6.96, right after the turn, 36 m | Small precinct | Corner shrine. | C |
| marutamachi-bashi | 丸太町橋 / Marutamachi bridge | 135.7715, 35.01756 | 7.55, the road itself | — | Bridge date unconfirmed. No Keihan Marutamachi station (that came in 1989, underground). | B |
| sakaimachi-gomon | 堺町御門 / Sakaimachi gate | 135.76316, 35.01769 | 8.31, right, 31 m | Gate in the Gyoen boundary | Gyoen's south gate; pines; the Imperial Palace's own walls are about 600 m inside and not visible. | B |
| nijo-castle | 二条城 東大手門・東南隅櫓 / Nijō Castle | gate 135.75106, 35.01289; turret 135.75101, 35.01226 | 9.83 / 9.90, right, 57–64 m | Outer moat, stone walls, gate-turret | Gate about 1663; turret an Important Cultural Property. No World Heritage signs (inscribed 1994). | A |
| horikawa-channel | 堀川（空堀）/ dry Horikawa channel | east side of the avenue, Marutamachi–Oike | 9.4–10.1, left, ≈20 m | Sunken concrete channel | Water cut off in the 1955–64 flood works; dry except in storms. Water restored March 2009. | B |
| nishi-honganji | 西本願寺 御影堂門・御影堂 / Nishi Honganji | gate 135.75267, 34.99150 | 12.22, right, 33 m (gate) | Hall from 1636; long temple wall | No scaffolding (the Heisei restoration ran about 1999–2009). No World Heritage signs (inscribed 1994). | A |
| central-post-office | 京都中央郵便局 / Central Post Office | 135.75675, 34.98665 | 13.02, right, 59 m | Mid-rise | Its 1986 building date (about 1961–62?) is unconfirmed. | C |
| toji-pagoda | 東寺 五重塔 / Tōji pagoda | 135.7476, 34.9806 | 12.70, right-rear, ≈890 m | About 55 m | Rebuilt 1644; skyline only, over the railway. Visibility from the road is unconfirmed. | C |

---

## (e) Later landmarks and changes to exclude

| Do not show | Date | What 1986 had instead |
|---|---|---|
| JR names and logos | 1 April 1987 | 国鉄 / JNR |
| Present Kyoto Station building and the Granvia hotel | temporary station 1993; new building completed 12 July 1997 | 1952 building |
| "Nidec Kyoto Tower" name | 1 April 2024 | Kyoto Tower |
| Underground Keihan stations and the 4-lane Kawabata-dōri beside the Kamo | 24 May 1987 (works complete 10 May 1988) | At-grade line, level crossing and works hoarding |
| Name 祇園四条 | 19 October 2008 | 四条 |
| Name 京津三条 | 1987 | 三条 |
| Keihan Ōtō line and Keihan Marutamachi / Demachiyanagi stations | 1989 | — |
| Tōzai subway (Keage, Higashiyama, Sanjō-Keihan, Kyoto-Shiyakusho-mae, Nijōjō-mae stations) and the end of Sanjō tram running | 12 October 1997 | Trams on Sanjō |
| Karasuma subway south of Kyoto Station and north of Kitaōji | 1988 / 1990 / 1997 | — |
| Shijō-dōri at 2 lanes with 6.5 m sidewalks and 4 bus bays | 2015 | 4 lanes, 3.5 m sidewalks |
| Kyoto Marui and Kyoto Kawaramachi Garden at Shijō-Kawaramachi | 2011 / 2021 | Kawaramachi Hankyu (1976–2010) |
| Higashi Honganji "お東さん広場" plaza on the Karasuma triangle | March 2023 | Tree-lined island and curve |
| Goei-dō and gate restoration scaffolds | 2004–09, about 2011 | None |
| Nishi Honganji and Nijō Castle World Heritage signage | 1994 | None |
| Minamiza registered-property plaques and 2018 renovation details (exterior unchanged) | 1996 / 2018 | — |
| Kyoto City Museum of Art as "京都市京セラ美術館" with its glass "ribbon" | 2020 | — |
| ROHM Theatre Kyoto | January 2016 | Kyoto Kaikan |
| Rebuilt Prefectural Library behind the old facade | 2001 | Original 1909 building |
| Miyako Messe | 1996 | Older exhibition hall; details unconfirmed |
| Pedestrianized Jingū-michi forecourt in front of Heian Jingū | plan March 2014, works after | A road with on-street parking |
| Biwa Canal Museum | August 1989 | — |
| Canal historic-site plaques | 1996 | — |
| Westin name | 2002 | 都ホテル |
| Water in the Horikawa channel | 2009 | Dry concrete channel |
| Kyoto Hotel Okura tower at Kawaramachi-Oike | 1994 | Off-route; keep it off the skyline too |
| Post-1986 high-rise hotels around the station (APA, Granvia and others) | — | — |
| Any MoMAK hoarding | — | Late-1986 setting: the new building stands. Before September 1986 it was a construction site. |

---

## (f) Period details worth showing

- **Rail**
  - **Keihan main line at Shijō** ([祇園四条駅](https://ja.wikipedia.org/wiki/祇園四条駅)): staggered platforms, barrier crossing, hoardings and temporary works.
  - **Keihan trains** ([trafficnews](https://trafficnews.jp/post/66204/), [tetsudo-ch](https://tetsudo-ch.com/11071152.html)): two-tone green commuter cars and mandarin-orange and carmine limited expresses (the 3000-series "TV cars"; the series is unconfirmed).
  - **Keishin 80形** two-car trams on Sanjō: light green with dark blue-green window band and skirt, low roofs with no air conditioning, twin sealed-beam headlights. Express sets pass the Keage stop. Safety islands with signals.
  - **JNR at the station**: 国鉄 signage; blue-and-cream local trains and Shinkansen out of sight behind the building (unconfirmed which classes would be visible).
- **Road**
  - Late-'80s cars of all classes; taxis in fleet colours (specific Kyoto liveries unconfirmed); tour buses parked at Higashi Honganji's frontage road (visible on the 1979–83 aerial).
  - Blue guide signs to 京都駅 / 四条河原町 / 祇園 / 平安神宮 / 南禅寺 / 二条城 / 大津 (国道1号) — wording invented and unconfirmed.
  - Footbridges on Horikawa and Karasuma (positions unconfirmed).
- **Shops and signs**
  - Department-store year-end sale banners (歳末大売出し) on Shijō in late November.
  - Minamiza's kaomise maneki boards: raised around 25–26 November, date varies by year; 1986 date unconfirmed.
  - Souvenir and yatsuhashi shops at Gion and Higashiōji; kimono and Buddhist-goods shops at the Honganji temple-towns; ochaya lanterns in Gion.
  - Kawaramachi record and fashion stores; pachinko and coffee-shop neon on Shijō and Kawaramachi side streets.
- **People**
  - Autumn school trips (修学旅行) in uniform at Gion, Higashiōji and Okazaki; foreign and domestic tourists with cameras.
  - Maiko and geiko in Gion at dusk; monks at the Honganji gates.
  - Salarymen and office ladies at Shijō-Karasuma; students near Kyoto University and Okazaki.
  - SORA fans at the station start; police at the Shijō crossing.
- **Season**: late-November momiji on the Higashiyama slope, at Keage, Nanzen-ji, Okazaki and the Gyoen; bare cherries along the incline and canal; ginkgo yellow (street-tree species unconfirmed).
- **SORA branding** (always the exact emblem, centred): SORA ⦿ CARS banners across Shijō-dōri and Karasuma, banners on the Keage climb and over Horikawa, ad balloons over Kawaramachi, and the airship ahead of the leaders down Horikawa toward Kyoto Tower.
- **Breakaway objects** (`objects.json`):
  - SORA signs: Karasuma before Shijō, Gion before the Yasaka T, the outside of the Keage approach, the Gyoen frontage, Shiokōji.
  - Planters: Honganji frontage, Higashiōji, the incline side, the torii approach, the Nijō Castle side.
  - Oil: the Keihan crossing, the Sanjō tram track, the Marutamachi approach, Horikawa before Nishi Honganji.

## (g) Time of day, season and weather

- **Proposal: a clear, dry, cold late-November 1986 afternoon, about 15:50 to 16:55 (around sunset).** This is distinct from Tokyo's rainy night-to-dawn.
- **Light through the lap:**
  1. Low golden sun from the south-west at the station; the tower's shadow falls across Shiokōji.
  2. Shop lights come on in Shijō's canyon.
  3. Gion's lanterns are lit and Yasaka's gate is floodlit.
  4. The Higashiyama slope and Keage's maples glow in the last direct light.
  5. Okazaki is in twilight with the torii silhouetted.
  6. Marutamachi and Horikawa run under sodium lamps.
  7. Blue hour at the finish, with Kyoto Tower lit (its 1986 lighting scheme is unconfirmed).
- **Why late November:**
  - The new MoMAK has been open since 25 October 1986.
  - The maneki boards may be up on Minamiza.
  - Autumn colour is at its best.
  - The riverbank yuka are not built (they are a summer custom).
- **Unsafe choices:** Spring would put cherry blossom on the incline and canal, but MoMAK would be a building site. Summer brings Gion Matsuri crowds and the street closures that come with them.

## (h) Still unconfirmed

1. **Traffic regulations:**
   - 1986 directions and turn permissions on the Keage connector, Niōmon-dōri east, Jingū-michi and Okazaki Nijō-dōri.
   - The 1986 Sanjō-eastbound → connector left turn and kerb layout at Keage. The hairpin is modelled as a 24 m arc 18 m wide, which is AI-friendly but generous.
2. **Lane counts and widths** on Higashiōji, Sanjō (with the tramway), Marutamachi, Shiokōji and the Karasuma frontage road at Higashi Honganji in 1986. The date Sanjō was widened after 1997.
3. **No 1984–86 aerial.** GSI gazo3 and gazo4 have no central-Kyoto tiles. The individual 1985–87 photos on the GSI photo service (mapps) were not checked.
4. **Keishin geometry:** exact positions of the Higashiyama-Sanjō and Keage safety islands; where the Keage–Kujōyama right-of-way left the road; and which high-floor express classes ran in 1986.
5. **Colours and lettering:**
   - The 1952 station's colour and lettering, its exact facade extent, and any "観光デパート" signs.
   - The Central Post Office building date.
   - Kyoto Tower's 1986 night lighting.
   - The great torii's 1986 paint (it appears red-orange on the 1979–83 aerial).
   - Kyoto bus and taxi liveries in 1986.
6. **Building details:**
   - Miyako Hotel wings and dates.
   - Shōren-in camphor visibility from Sanjō.
   - Daimaru, Fujii Daimaru and Takashimaya frontages in 1986.
   - Whether Shijō had sidewalk arcades in 1986.
   - The 1986 exhibition hall on the Miyako Messe site.
   - The Marutamachi bridge date.
7. **Season items:**
   - Whether Minamiza's 1986 kaomise and maneki boards were up on a given late-November date.
   - Street-tree species and autumn colour on Karasuma and Horikawa.
8. **Elevations** come from the modern DEM (no historic survey), and the bridge decks are interpolated.
9. **Pacing** is single-car, using the repository's handling graph and practice AI scaled to the recorded Tokyo race. It is not a native eight-car race on this track (that needs a native bundle export, which writes to `output/`) and not a human drive.
10. **Sources taken from search-engine summaries** (the URL is recorded, but the page was not opened):
    - Kyoto Kaikan 1960 / ROHM 2016
    - Museum of Art 1933 / 2020
    - Prefectural Library 1909 / 2001
    - Tōka-saikan 1926
    - Kikusui 1926
    - Hankyu 1976–2010
    - Miyako Hotel 1890 / 1960 / 2002
    - Honganji restorations
    - Horikawa water 2009
    - Incline 1891 / 1948 / 1977 / 1996
    - Canal museum 1989
    - JR 1987
    - Subway 1981
    - Shijō Ōhashi 1942
    - Zoo 1903
    - Heian Jingū 1895
    - Tōji 1644

---

## Sources

**Opened and read:**
- [GSI tiles gazo2 / gazo1](https://maps.gsi.go.jp/development/ichiran.html): 1979–83 and 1974–78 alignment checks. gazo3 and gazo4 return 404 for central Kyoto.
- [GSI DEM5A tiles](https://maps.gsi.go.jp/development/ichiran.html): elevations.
- OpenStreetMap via Overpass (29 October 2026): geometry and modern one-way and lane tags.
- [京阪京津線 (ja.wikipedia)](https://ja.wikipedia.org/wiki/京阪京津線)
- [蹴上駅 (京阪) (ja.wikipedia)](https://ja.wikipedia.org/wiki/蹴上駅_(京阪))
- [京阪80型電車 (ja.wikipedia)](https://ja.wikipedia.org/wiki/京阪80型電車)
- [trafficnews 131441](https://trafficnews.jp/post/131441): Keishin street-running sections, 66.7‰.
- [Keihan 湖都から古都へ 04](https://www.keihan.co.jp/recommend/mizunomichi/michiannai/04/): Keage stop by the power station; 京津三条 renamed 1987.
- [祇園四条駅 (ja.wikipedia)](https://ja.wikipedia.org/wiki/祇園四条駅)
- [tetsudo-ch 12822](https://tetsudo-ch.com/12822.html): underground 24 May 1987; eight crossings.
- [京都市電 (ja.wikipedia)](https://ja.wikipedia.org/wiki/京都市電)
- [京都駅 (ja.wikipedia)](https://ja.wikipedia.org/wiki/京都駅)
- [京都タワー (ja.wikipedia)](https://ja.wikipedia.org/wiki/京都タワー)
- [trafficnews 92160](https://trafficnews.jp/post/92160): Shijō before and after 2015.
- [MLIT Kyoto, Karasuma cross-section 2018](https://www.kkr.mlit.go.jp/kyoto/project/kyougikaiiinkai/hokousyajitensya/grt3670000002q2j-att/07_shiryou4.pdf)
- [trafficnews 129290](https://trafficnews.jp/post/129290): Karasuma bend (1912) and the 2023 plaza.
- [八坂神社 (ja.wikipedia)](https://ja.wikipedia.org/wiki/八坂神社)
- [tabi-mag ky0730](https://tabi-mag.jp/ky0730): great torii.
- [MoMAK history](https://www.momak.go.jp/Japanese/about/history.html)
- [Kyoto City: Keage power station](https://kyoto-irodoru.city.kyoto.lg.jp/sakyo/keagehydropowerplant.html)
- [nippon.com: Biwa canal and incline](https://www.nippon.com/ja/guide-to-japan/gu003014/)
- [Shochiku press release, 7 February 2018](https://www.shochiku.co.jp/wp-content/uploads/2018/01/20180207pdf.pdf): Minamiza.
- The catalog's code-26 sources: [都市史27](https://www2.city.kyoto.lg.jp/somu/rekishi/fm/nenpyou/htmlsheet/toshi27.html).

**Search-summary level only:**
- [Kyoto City: Kyoto Kaikan / ROHM](https://www.city.kyoto.lg.jp/templates/shingikai_kekka/cmsfiles/contents/0000211/211186/(sankou1)uneizyoukyou_.pdf)
- [bijutsutecho: Kyoto City Museum of Art](https://bijutsutecho.com/museums-galleries/868)
- [Prefectural Library (Okazaki park)](https://www.library.pref.kyoto.jp/contents/wp-content/uploads/2019/04/okazakikouen.pdf)
- [Kyoto City 2014 Jingū-michi plan](https://www.city.kyoto.lg.jp/templates/pubcomment/cmsfiles/contents/0000161/161655/kihonkeikaku(A4).pdf)
- [Ritsumeikan: Tōka-saikan](https://www.ritsumei.ac.jp/acd/cg/lt/rb/672/672PDF/kato.pdf)
- [gentosha: Kikusui and the Prefectural Library](https://gentosha-go.com/articles/-/59102)
- [TECTURE: Westin Miyako](https://mag.tecture.jp/project/20210827-the-westin-miyako-kyoto/)
- [fashionsnap: Kawaramachi Hankyu / Garden](https://www.fashionsnap.com/article/2020-10-16/kyoto-kawaramachi-garden/)
- [Kyoto City: Higashi Honganji retrofit](https://www.city.kyoto.lg.jp/tokei/cmsfiles/contents/0000273/273764/005_jirei.pdf)
- [bunka.go.jp: Nishi Honganji](https://online.bunka.go.jp/heritages/detail/189663)
- [tabi-mag ky0675: Nijō Castle](https://tabi-mag.jp/ky0675/)
- [Kyoto Prefecture: Horikawa water](https://www.pref.kyoto.jp/rekisaikan/documents/shiryoguide042.pdf)
- [trafficnews 67452: JNR → JR](https://trafficnews.jp/post/67452/3)
- [trafficnews 119268: subway 1981](https://trafficnews.jp/post/119268)
- [smtrc: Shijō Ōhashi 1942](https://smtrc.jp/town-archives/city/kyoto/p02.html?id=a04)
- [Kyoto zoo plan: 1903](https://zoo.city.kyoto.lg.jp/zoo/uploads/file/seibikousou211120.pdf)
- [walkerplus: Heian Jingū](https://www.walkerplus.com/article/1006771/)
- [walkerplus: maneki-age](https://www.walkerplus.com/article/213587)
- [tabi-mag ky0530: Tōji](https://tabi-mag.jp/ky0530/)
