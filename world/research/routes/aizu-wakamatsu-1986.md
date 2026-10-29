> **Provenance.** Authoring research for `aizu-wakamatsu-1986`, delivered on 2026-10-29 and kept here as written. Since then the route has been registered in `scripts/lib/street-routes.ts`, exported by the native compiler and packaged for practice. It now has its own song, *Evening over Tsuruga / 鶴ヶ城の夕べ* (2:41), so `targetMs` is 161,080; figures below that quote an earlier `targetMs` or call the soundtrack a placeholder predate that. The shipped authoring is [`world/authoring/aizu-wakamatsu-1986.json`](../../authoring/aizu-wakamatsu-1986.json) with its `.objects.json`. "This folder" below is the research working folder. Its tools, OSM and DEM extracts and aerial overlays are kept locally, untracked, in `output/street-routes/research/aizu-wakamatsu-1986/`.

# aizu-wakamatsu-1986 — 会津、城を望む丘へ / Aizu: To the Hill Facing the Castle

This is a research draft for a new 1986 street sprint. Nothing in the repository has been changed. The files are:

- `route.json`: an AuthoredStreetTrack in the Tokyo format, with 52 control points and 15 gates.
- `objects.json`: 14 objects (6 SORA breakaway signs, 4 tree planters, 4 oil patches).
- `check.ts`: compiles both files with the repo's own `compileStreetTrack` and `compileStreetObjects`.
- `tools/`: the helper scripts. They read OSM, GSI and the topographic map tiles and render overlays. They write only into this folder.

`check.ts` reports these figures for the compiled track:

| Item | Value |
|---|---|
| Length | 8.056 km since the forest-road corners were opened (see the last section); the trace compiled to 8.059 km |
| Topology | sprint, 1 lap |
| Samples | 1,613 |
| Gates | 15 |
| Elevation | 214.3–297.2 m (start 214.9 m, finish 297.2 m) |
| Maximum grade | 13.97 % at 7.82 km, on the forest road (limit 18 %) |
| Tightest radius | 13.5 m: the lane’s two corners onto the forest road are circular arcs since they were opened. The trace had 7.6 m at 7.68 km, where the lane turns onto the forest road; half-width 2.8 m, 74.7 % of the compiler bound. |
| Town corners | peak 70 % of the curvature × width bound |
| Centreline vs OSM | within 3 m, except at corner fillets (up to 6.4 m) |

Pacing is an estimate, not a drive. I wrote a speed-profile model and calibrated its grip so that the Tokyo draft averages 200 km/h:

- Computer cars: about 153 s.
- With 70 % of that grip: 162 s.
- `targetMs` is set to 165,000 (2:45) as the good-driver estimate.
- `maxTicks` is 9,000, so the 300 s cap leaves about 135 s for slow cars.

The model ignores road width and traffic, so treat it as a lower bound.

## How 1986 was checked

GSI has no 1979–1990 aerial coverage of Aizu-Wakamatsu. I tested tiles for `gazo2`, `gazo3` and `gazo4` at z13–17 over the station, castle, Nanokamachi and Iimoriyama, and all of them came back empty. I bracketed 1986 with five sources:

1. **GSI `gazo1` aerial photos (1974–78)**, z16–17. Every leg was overlaid and inspected.
2. **1:25,000 topographic maps** from 今昔マップ on the web (谷謙二), dataset 会津:
   - era 02: 若松, 昭和49年改測 (1974 resurvey);
   - era 03: 若松, 昭和63年修正 (1988 revision, published 1 February 1990), and 会津広田, 平成3年修正, for the station strip;
   - era 00: the 1908–10 survey, for street age.
3. **GSI `ort_old10` (1961–69)**, used for context only.
4. **Today**: OSM (Overpass snapshot of 29 October 2026), GSI 道路中心線 vector tiles and the GSI seamless photo, for geometry.
5. **GSI DEM** (`getelevation.php`) at 20 m spacing along the route. There are no bridges or tunnels on the route (none in OSM or GSI 道路中心線), so the ground DEM is valid throughout.

The 1988-revised map draws every leg of the route, including the Iimori 1-chōme block and a light road climbing Iimoriyama's south flank. It also labels the new 博物館 on the Sannomaru.

---

## (a) Route summary and why this alignment

**Route.** JNR Aizu-Wakamatsu Station → Ōmachi-dōri (south) → Ōmachi-yotsukado → Nanokamachi-dōri (west, 220 m) → prefectural road 59 (south) → Yonedai → Jōnan-dōri (east) → National Route 118 north along the Nishi-demaru moat → the castle north street east (past Kita-demaru, the Sannomaru and the new Fukushima Museum) → Tenneiji-machi → Iimoriyama-dōri north along the foot of the hills → Iimori 1-chōme lanes → the Keizan forest road (林道慶山線) up Iimoriyama's south flank → finish on the south shoulder, 297 m.

**Why this alignment.**

- **Start.** The sprint starts at the station plaza, with the 1961 JNR station building behind the grid.
- **Old town first.** It runs the old merchant axis: Ōmachi-dōri, Ōmachi-yotsukado (the town's road-origin crossroads) and the head of Nanokamachi-dōri. This is the period town, before the 1990s retro restorations.
- **Castle from the west, on the driver's right.** The western loop through Yonedai and Jōnan-dōri brings the race onto National Route 118 heading north. The castle is then on the right-hand side:
  - The Nishi-demaru west moat and stone walls lie directly beside the road for about 230 m (3.42–3.66 km). North of that, an institutional block (a pool and buildings on the 1974–78 photo, use unconfirmed) stands between the road and the castle.
  - The 1965 keep stands 285–300 m across the Nishi-demaru and the inner moat.
  - This is the only public road on a sensible line that runs right beside open moat. The north street has a row of buildings between the road and the moat, and the south side has houses.
- **Castle north side.** The north street keeps the castle on the right for another 0.9 km: Kita-demaru, then the Sannomaru with the Fukushima Museum, which opened on 18 October 1986.
- **The hill.** Iimoriyama-dōri runs straight north along the foot of the hills for 1.6 km, with Iimoriyama rising ahead and to the right.
- **The finish.** The finish is the highest point of Iimoriyama that a road reaches. The castle lies 2.85 km behind, on bearing 237°: the Byakkotai's view.

**Where the drivable roads on Iimoriyama go (researched; stairs and conveyor excluded).**

1. **Approach street at the north-west foot** (飯盛山下, off 白虎通り/飯盛山通り): about 252–260 m. It ends at the stone stairs and the paid slope conveyor; above that it is foot access only.
2. **Canal track along the west foot** (OSM 239383138): flat, at 270–272 m along the 戸ノ口堰 canal. It is a canal service track, so it is excluded.
3. **Keizan forest road (林道慶山線, OSM 173230619, reached via 394732248):** the only road that climbs Iimoriyama itself.
   - It leaves the Iimori 1-chōme block at 264 m and climbs north-east and east along the south flank.
   - It crests the south shoulder at 297–298 m (GSI DEM). That is level with the Byakkotai graves (about 297 m) and the suicide site (about 296 m), and about 175 m south of the 371 m summit.
   - At that point it bends south, away from Iimoriyama, and keeps climbing into the Keizan hills to 322 m where OSM ends.
   - A footpath to the summit leaves at the bend.
   - GSI classes the road 市区町村道等, width under 3 m.
4. **Valley road** (OSM 214582616), south of Iimoriyama in the valley toward Keizan: reaches 308 m, but it is not on Iimoriyama.

So the finish is at the forest road's south-shoulder bend: 37.501916 N, 139.956768 E, about 297 m. It is the highest point on Iimoriyama a car can reach, and from there the slope opens south-west over the town to the castle. The part beyond the bend is excluded because it leaves Iimoriyama, loses the castle view and is a forest track.

**Rejected alternatives.**

- **Castle park road from Kita-demaru to Nishi-demaru (OSM 35603117).** GSI classes it 庭園路 (park road); it is one-way westbound today and serves the castle car park. It is closer to the keep (about 125 m), but it is not a public road.
- **The narrow lane along the south moat** (under 3 m).
- **Extending west along Nanokamachi-dōri to JNR Nanokamachi Station.** This adds about 1 km and Amida-ji, but needs several narrow unclassified streets whose 1986 status I have not checked.
- **A Shinmei-dōri variant** (中央通り/神明通り to the castle west side, then the south side). It is 1.1 km shorter but has less castle frontage.

## (b) 1986 road facts

Leg lengths below are along the OSM path; the compiled route trims corners. "70s photo" means GSI `gazo1` (1974–78). The map columns are 今昔マップ era 02 (1974) and era 03 (1988). All legs are two-way today except Ōmachi-dōri (see the note after the table).

| Leg (km) | Road | Width today | Direction driven | 1986 existence evidence |
|---|---|---|---|---|
| 0–0.97 | 大町通り Ōmachi-dōri. OSM 44768709. | 5.5–13 m class | South | Old castle-town street, on the 1908–10 map; clear on the 70s photo and the 1988 map |
| 0.97–1.19 | 七日町通り Nanokamachi-dōri. National Route 252, OSM 44769537, 2 lanes. | 5.5–13 m class | West | On the 1908–10 map; 70s photo; 1988 map |
| 1.19–1.75 | 会津若松三島線, prefectural road 59. OSM 1560659008. | 5.5–13 m class | South | 70s photo (overlay check); 1988 map |
| 1.75–2.76 | Unnamed tertiary continuing south through 本町/米代 to 南花畑. OSM 25058326. | 5.5–13 m class | SSW | Visible on the 70s photo; drawn on the 1988 map (not on the 1908 map) |
| 2.76–3.36 | 城南通り Jōnan-dōri, prefectural road 211. OSM 23946287. | 13–19.5 m class | East | 70s photo; 1988 map |
| 3.36–3.96 | 国道118号 National Route 118, west side of the castle. OSM 44769536, 2 lanes. | 13–19.5 m at the south end, 5.5–13 m by the moat | North | 70s photo; 1988 map |
| 3.96–6.00 | Castle north street (追手町–城前–宝町–花春町–天寧寺町). OSM 207434606 + 25056639, unnamed. | 5.5–13 m class | East | On the 1908–10 map; 70s photo; 1988 map |
| 6.00–7.60 | 飯盛山通り Iimoriyama-dōri. OSM 26386736. | 5.5–13 m class | North | 70s photo (a straight road through the then-new 和田/飯盛 housing); 1974 and 1988 maps |
| 7.60–7.75 | Iimori 1-chōme lanes. OSM 173230695/173230690/173230649. | 3–5.5 m | East then south | **Not** on the 1974 map or 70s photo (orchards); on the 1988 map (block with perimeter road). 1986 likely, unconfirmed |
| 7.75–8.13 | 394732248 + 林道慶山線 Keizan forest road. | Under 3 m | East/NE | A track on the 70s photo; a light road on the 1988 map; road today. Public car access in 1986 unconfirmed |

**One-way streets.**

- **Ōmachi-dōri** is one-way southbound today (OSM `oneway=yes`). The route drives it southbound. I found no source for its 1986 regulation.
- **Other one-way streets in the old town today:**
  - 甲賀町通り: southbound.
  - 馬場町通り: northbound.
  - 博労町通り: northbound.
  - 野口英世青春通り: southbound.
  - The station-plaza loop.
  - The castle park road (westbound).

  The route avoids all of them.
- **千石通り/小田橋通り** (prefectural road 64) is now a dual carriageway mapped as two one-way ways. The route only crosses it, at about 5.21 km (宝町). It does **not** appear on the 1974–78 photos. A north–south road there appears on the 1988 map, but the 1986 form of the junction is unconfirmed.

**Bridges and tunnels.** None. The route crosses the 戸ノ口堰 irrigation canal at about 7.75 km, at the foot of the forest road. No bridge is mapped there in OSM or GSI, so it is a culvert or a short deck. This is the canal whose tunnel on Iimoriyama's north side the Byakkotai used. It also crosses small field channels on Iimoriyama-dōri.

**Lane counts.** OSM tags 2 lanes on Routes 252 and 118. The other legs are untagged.

**Half-widths used.**

| Section | Half-width |
|---|---|
| Ōmachi | 4.2 m |
| Nanokamachi | 4.4–4.6 m |
| Prefectural road 59 and Yonedai | 4.8 m |
| Jōnan-dōri and Route 118 | 5.2–5.6 m |
| Castle north street | 5.0 m |
| East street and Iimoriyama-dōri | 4.6 m |
| Lanes | 3.0 m |
| Forest road | 2.6 m |

The forest-road half-width makes a 5.2 m corridor on a road narrower than 3 m. That is the compiler minimum, and it is a known distortion.

**Elevation profile.**

| Section | Elevation |
|---|---|
| Town | 214–222 m |
| East street | rises to 245 m at Tenneiji-machi |
| Iimoriyama-dōri | hump to 254 m over the 慶山/大龍寺 spur at 6.6 km, dip to 245 m at 和田, then 258 m at Iimori 1-chōme |
| Climb | 264 → 297 m in 380 m, about 9 % average, 14 % maximum |

## (c) Sectors

Left and right are the driver's, in the direction of travel. "District" means the closest district in `docs/period-city.md`.

| Sector | Range (km), heading | Left | Right |
|---|---|---|---|
| 0 | 0–0.72, SSW | **Kanda mixed.** East side of Ōmachi: Ekimae shop-houses, inns (旅館), banks (会津信用金庫), post office, small makers | **Kanda mixed.** Station plaza and 駅前交番 behind the grid; west side of Ōmachi: shops, inns, a petrol station |
| 1 | 0.72–1.18, SSW then WNW | **Nikko old street / Kanda mixed.** Old merchant houses and kura on Ōmachi (呉服, 漆器, 茶舗, 時計店), the 大町四ツ角 road-origin marker, banks at the crossroads; on Nanokamachi-dōri, the south side | **Nikko old street.** 融通寺 behind the frontage; the 1914 Shirokiya lacquerware building on the north side of Nanokamachi-dōri |
| 2 | 1.18–2.11, SSW | **Kanda mixed / backstreets.** Old shops (満田屋 miso at the turn), 日新町/西栄町 houses, 西栄町 park | **Backstreets.** 末廣 sake kura about 110 m back, shops, 佐藤病院, 諏訪公園 |
| 3 | 2.11–2.73, SSW | **Ichibancho residential.** 竹田綜合病院 (about 80 m), 米代 municipal flats, schools (a driving school about 250 m east) | **Ichibancho residential.** Houses with glazed blue/brown tile or painted sheet roofs, a kindergarten |
| 4 | 2.73–3.33, E | **Residential and shops.** 米代二丁目 and 南町; the castle's woods appear ahead-left | **Residential and shops.** 南花畑, a petrol station, the 湯川 river about 150 m south |
| 5 | 3.33–3.92, N | **Offices/schools.** 日新館跡 monument (11 m), school grounds, 山鹿町 | **Moat**, 3.42–3.66 km: Nishi-demaru west moat and battered stone walls right beside the road, the open interior, the keep 285–300 m across. Then an institutional block (pool and buildings) to 3.92 km |
| 6 | 3.92–4.58, E | **Government.** 会津若松合同庁舎, courts, legal-affairs bureau, 城前交番, tax office, samurai-house site markers (西郷頼母邸跡) | **Moat behind a frontage.** Kita-demaru moat and walls 60–120 m back, partly behind a row of buildings; 鶴ヶ城会館 |
| 7 | 4.58–5.15, E | **Ichibancho residential.** 城前 houses and a public bath | **Kitanomaru park analog.** Sannomaru park ground: the new Fukushima Museum (95 m), the 鶴ヶ城体育館 octagon, stadium, tennis courts |
| 8 | 5.15–5.95, ESE then NE | **Backstreets.** 宝町/花春町 old town; 御薬園 garden about 280 m north | **Backstreets / temple front.** 浄光寺 (25 m), houses, small factories; Tenneiji-machi |
| 9 | 5.95–6.93, N | **Ichibancho residential.** 東千石/和田 houses | **Shrine front + forest hills.** 天寧寺 and 正法寺 on the hillside, 慶山 with 愛宕神社, 大龍寺 (114 m), wooded slopes |
| 10 | 6.93–7.54, N | **Residential.** 和田一丁目, the 飯盛 housing estate | **Hill edge.** Houses against the wooded foot of Iimoriyama; Iimoriyama fills the view ahead-right |
| 11 | 7.54–7.68, E then S | **Residential.** The 1980s 飯盛一丁目 block | **Residential / hill.** Orchards and fields, the foot of Iimoriyama |
| 12 | 7.68–8.06, E/NE | **Forest.** Iimoriyama's upper slope and the summit (cedar and broadleaf); the graves and suicide site are 160–300 m away, unseen | **Forest / fields.** Terraced fields and orchards on the south slope, the valley; the town and castle open behind-right |

## (d) Landmarks

Positions are WGS84 to tens of metres. Distance is from the compiled centreline at the nearest station. Side is the driver's side at that station.

| Landmark | Lat, lon | Side, distance (at km) | Footprint and height | 1986 appearance | Prominence |
|---|---|---|---|---|---|
| `jnr-aizu-wakamatsu-station`<br>国鉄 会津若松駅<br>JNR Aizu-Wakamatsu Station | 37.5079, 139.9304 | Behind-right, about 140 m (0.0) | Long low station building about 90 × 20 m, 2 storeys (unconfirmed) | **The 1961 building (rebuilt 2 May 1961).** No castle styling (that came in April 2001). JNR signage and switchback terminus, 3 platforms and 5 tracks. Freight sidings | High (start backdrop) |
| `wakamatsu-road-origin-marker`<br>若松市道路元標<br>Wakamatsu road-origin marker | 37.49874, 139.92769 | Left, 6 m (0.95) | Stone post about 0.3 × 0.3 × 1 m | Present; date unconfirmed | Medium (corner detail) |
| `shirokiya-lacquer`<br>白木屋漆器店<br>Shirokiya lacquerware shop | 37.49920, 139.92648 | Right, about 29 m (1.07) | About 10 × 20 m, 3 storeys, about 12 m | **1914** Western-influenced dozō storehouse building | Medium |
| `mitsutaya`<br>満田屋<br>Mitsutaya miso shop | 37.49893, 139.92511 | Left, 7 m (1.21) | Machiya about 10 × 15 m | Old merchant frontage; founding date unconfirmed | Low–medium |
| `yuzuji-temple`<br>融通寺 (西軍墳墓)<br>Yūzū-ji (imperial-army graves) | 37.50258, 139.92853 | Right, 66 m (0.52) | Temple hall behind houses | Present | Low |
| `suehiro-kura`<br>末廣酒造 嘉永蔵<br>Suehiro Kaei-gura | 37.49793, 139.92317 | Right, 113 m (1.38) | Kura complex | Brewery kura; date unconfirmed | Low |
| `nisshinkan-site`<br>日新館跡<br>Nisshinkan school site | 37.48829, 139.92651 | Left, 11 m (3.66) | Stone monument | **Monument only.** The reconstructed Nisshinkan is elsewhere | Low–medium |
| `nishidemaru-moat`<br>西出丸 堀・石垣<br>Nishi-demaru moat and walls | Strip at about 139.9269, 37.4861–37.4882 | Right, 15–40 m (3.42–3.66) | Moat about 30 m wide; walls several metres high (unconfirmed) | Water, battered stone walls, trees on the walls | **High** |
| `tsurugajo-keep`<br>鶴ヶ城 天守<br>Tsuruga-jō keep | 37.48775, 139.92980 | Right, 285–300 m (3.6–4.2); 2.85 km on bearing 237° from the finish | 5 storeys; about 36 m including an about 11 m stone base (often quoted, unconfirmed) | **1965 reinforced-concrete exterior reconstruction, white plaster, black/dark-grey tiles.** Red tiles only from 2010–11 (grey per the MLIT text) | **Highest** |
| `tetsumon-hashiri-nagaya`<br>鉄門・走長屋<br>Tetsumon gate and Hashiri-nagaya | 37.4872, 139.9297 | Right, about 280 m (3.58) | Low wing south of the keep | 1965 gate with the keep (EN Wikipedia: "a gate"). The 1974–78 photo shows the wing. **No Hoshii-yagura or Minami-hashiri-nagaya.** Black tiles | Low (behind trees) |
| `kitademaru`<br>北出丸<br>Kita-demaru | 37.4896, 139.9298 | Right, 60–120 m (4.0–4.3) | Walled bastion | Moat and stone walls, partly screened by a row of buildings | Medium |
| `aizu-joint-govt-bldg`<br>会津若松合同庁舎<br>Aizu-Wakamatsu joint government building | 37.49083, 139.92809 | Left, 36 m (4.0) | Office block | Present in 1986 unconfirmed | Low |
| `fukushima-museum`<br>福島県立博物館<br>Fukushima Museum | 37.48887, 139.93463 | Right, 95 m (4.60) | U-plan, 2 storeys, open south | **Completed 1986, opened 18 October 1986.** Kura-style panels in plaster and smoked-tile colours, smoked-tile-coloured steel roof, low eaves | Medium–high (opening banners) |
| `tsurugajo-gym`<br>鶴ヶ城体育館<br>Tsuruga-jō gymnasium | 37.48575, 139.93520 | Right, about 430 m (4.7) | Octagonal hall | White octagonal roof (1974–78 photo) | Low |
| `joko-ji`<br>浄光寺<br>Jōkō-ji | 37.48868, 139.94135 | Right, 25 m (5.19) | Temple | Present | Low–medium |
| `oyakuen`<br>御薬園<br>Oyakuen garden | 37.49108, 139.94392 | Left, about 280 m (5.36) | Walled garden | Present (on the 1908 and 1988 maps) | Low |
| `tenneiji`<br>天寧寺<br>Tennei-ji | 37.49037, 139.95283 | Right, about 270 m (6.16) | Hillside temple | Present | Low |
| `keizan-atago`<br>慶山・愛宕神社<br>Keizan and Atago Shrine | 37.49205, 139.95283 | Right, about 280 m (6.35) | Wooded hill, 367 m | Present | Low–medium (skyline) |
| `dairyuji`<br>大龍寺<br>Dairyū-ji | 37.49523, 139.95078 | Right, 114 m (6.72) | Temple | Present | Low |
| `iimoriyama`<br>飯盛山<br>Iimoriyama | Summit 37.50359, 139.95593 | Ahead-right on Iimoriyama-dōri; left, 174 m at the finish | Hill to 371 m (GSI) | Mixed cedar and broadleaf forest. Some sources give 314 m (see h) | **High** |
| `byakkotai-graves`<br>白虎隊十九士の墓<br>Byakkotai graves | 37.50416, 139.95448 | Left, about 240 m (finish area) | Row of 19 small graves | Plot laid out 1890. Rome column (1928) and German monument stand nearby | Story element; not visible from the road |
| `byakkotai-jijin`<br>白虎隊自刃の地<br>Byakkotai suicide site | 37.50323, 139.95407 | Left, about 160 m (7.9) | Small terrace and statue | The view the boys had toward the castle (they saw smoke and believed it had fallen) | Story element only |
| `sazaedo`<br>会津さざえ堂<br>Aizu Sazaedō | 37.50450, 139.95393 | Left, about 290 m (7.9) | Hexagonal hall, about 3.4 m per side, 16.5 m high | **Built 1796.** Unpainted wood; Important Cultural Property only from 1995. Copper roof today, 1986 roofing unconfirmed | Not visible (west slope); cutscene only |
| `tonokuchi-canal`<br>戸ノ口堰<br>Tonokuchi-zeki canal | 37.50140, 139.95355 | Left, 4 m (7.75) | Canal about 2–3 m wide | Present | Medium (crossing detail) |

## (e) Later landmarks and changes to exclude

| Exclude | Date | Use instead (1986) |
|---|---|---|
| Red keep tiles | Re-roofed 2010; completed March 2011 | Black/dark-grey tiles on the keep and its wing |
| 干飯櫓 Hoshii-yagura and 南走長屋 Minami-hashiri-nagaya | Wooden reconstruction 2000, opened 2001 | Bare walls south-west of the keep |
| 茶室麟閣 Rinkaku in the honmaru | Returned 12 September 1990 | Absent |
| Castle-style station facade | April 2001; also the 2004 renovation | 1961 JNR building |
| JR East and JR Freight names and logos | From 1 April 1987 | JNR |
| Aizu Railway branding on the Aizu Line | From 16 July 1987 | JNR Aizu Line |
| SL Banetsu Monogatari | From 29 April 1999 | No steam service |
| 少年武士慰霊碑 on Iimoriyama | Reported 2001 (unconfirmed) | Exclude |
| 千石通り dual carriageway | Absent on the 1974–78 photos; 1986 form unconfirmed | Draw at most a plain crossing |
| Museums and halls of unconfirmed date: 会津若松市歴史資料センター まなべこ, 會津風雅堂, 会津町方伝承館, レオ氏郷南蛮館, 鶴ヶ城会館 | Unconfirmed | Generic 1986 buildings |
| 第四北越銀行 | Name from 2021 | 北越銀行 |
| 大東銀行 | Probably still 大東相互銀行 in 1986 (unconfirmed) | — |
| 2007 street-name signs (通り名), the あかべぇ town loop bus, NHK 八重の桜 (2013) markers such as 山本覚馬・新島八重生誕の地, modern convenience-store chains | Later than 1986 | Exclude |
| 1990s Taishō-retro restorations on Nanokamachi-dōri (and the later Nanokamachi Station rebuild) | Exact dates unconfirmed | 1986 shopfronts: plain kanban-kenchiku and kura |
| Today's 竹田綜合病院 towers | Date unconfirmed | Low-rise 1986 hospital |

## (f) Period details worth showing

- **Rail at the start.**
  - JNR 455-series EMUs in cream and red, on Ban'etsu West Line rapids after the express Bandai became a rapid in 1984.
  - ED77 electric locomotives (1967–1993) with red 50-series coaches.
  - Kiha 40, 45, 52 and 58 diesel cars on the Tadami and Aizu lines.
  - Freight sidings.
  - The 485-series limited express "Aizu" to Ueno began in 1968 under another name. Its 1986 running is likely but unconfirmed.
  - No SL and no JR markings.
- **Vehicles.**
  - Mid-1980s Corolla, Sunny, Civic and Familia sedans; Crown and Cedric taxis.
  - Kei trucks (Carry, Sambar) carrying crates of persimmons near Iimori and 和田.
  - Super Cub delivery bikes; 会津乗合自動車 buses (livery unconfirmed).
  - Tour coaches parked at the foot of Iimoriyama: the 1974–78 photo shows the big bus parks there.
- **Shops and signs.**
  - Hand-painted kanji signboards on Ōmachi: 呉服, 漆器 (会津塗), 茶舗, 時計, 自転車, 酒.
  - Bank fronts at Ōmachi-yotsukado: 東邦銀行, 北越銀行, 大東相互銀行(?).
  - Sake-brewery names on kura (末廣); miso (満田屋); 赤べこ and 起き上がり小法師 in shop windows.
- **SORA.** SORA banners across Ōmachi and on the 1986 museum's banner poles, using the exact emblem.
- **The new museum.** On 18 October 1986 the Fukushima Museum opens: 祝 開館 banners, nobori, and crowds at the Sannomaru.
- **People.**
  - Shoppers and obaachan in aprons on Ōmachi; salarymen and office ladies at the 合同庁舎 and courts; police at 城前交番.
  - School groups and camera-carrying tourists heading for Iimoriyama.
  - Farmers in 手ぬぐい at the orchards on the forest road; a monk at Tennei-ji; cats on kura steps.
- **Season** (late October):
  - Castle cherries turning bronze, maples and broadleaves on Iimoriyama and Keizan turning.
  - Rice straw stooks and burning-straw smoke in the fields east of 和田.
  - Persimmons on the trees and peeled persimmons drying under eaves.

## (g) Time, season and weather

**Saturday 18 October 1986**, the Fukushima Museum's opening day. The race runs from about **16:10 to 16:35 JST**, a clear autumn afternoon into golden hour.

**The sun** (my solar calculation for the castle):

| Time (JST) | Altitude | Azimuth |
|---|---|---|
| 16:00 | 10.6° | 249° |
| 16:30 | 5.0° | 254° |

Geometric sunset is about 16:56, and the western mountains hide the sun a little earlier.

**At the finish,** the castle lies on bearing 237°, so the low sun stands about 17° to the right of the keep's silhouette. The town below is in long shadow and smoke haze.

**Conditions:** dry roads, about 10–13 °C, high clear sky with a little haze. This is plausible for the season but not checked against 1986 weather records.

**Contrast with Tokyo:** Tokyo's draft is a rainy night into dawn. This is a dry golden afternoon in autumn colours.

## (h) Still unconfirmed

1. **Forest road (林道慶山線) in 1986:** whether it was a public road open to cars (and not gated), and its surface and width. The evidence:
   - a track on the 1974–78 photos;
   - a light road on the 1988-revised map;
   - a road under 3 m today (GSI 市区町村道等).

   No municipal forest-road register was found online. **Fallback:** if it is ruled out, move the finish to the `forest-road-foot` gate (264 m) or to the Iimoriyama-dōri approach (飯盛山下, about 255 m). Neither has a castle view.
2. **Iimori 1-chōme lanes:** absent in 1974–78, present on the 1988-revised map, so built 1975–88. 1986 existence is likely but not proven.
3. **One-way regulations in 1986:** Ōmachi-dōri southbound (today's direction), and whether any of the streets used carried other 1986 restrictions, such as turn bans at Ōmachi-yotsukado.
4. **The 1965 reconstruction:** which wing and gate were included. A gate is confirmed (EN Wikipedia); 鉄門 and 走長屋 as 1965 RC is the likely reading.
5. **Keep height:** 36 m is often quoted but not sourced here.
6. **Sazaedō's 1986 roof** (copper today).
7. **The suicide-site statue:** its date.
8. **The German monument:** its date. The Rome column of 1928 is sourced.
9. **The 1900 date of the 31 graves.**
10. **Opening dates:** the slope conveyor (it exists today; date unknown), 鶴ヶ城会館, 会津若松合同庁舎, the road-origin marker, and 満田屋's founding.
11. **Iimoriyama's height:** 371 m by GSI (summit point 372 on the GSI map). Some tourist sources say 314 m, and I could not tell which point that figure refers to.
12. **Ban'etsu West Line services in 1986:** whether the limited express "Aizu" and through Aizu Line trains ran to Aizu-Wakamatsu, and the 1961 station's exact facade.
13. **Exact 1986 widths, kerbs and road furniture** on every leg. The half-widths are game corridors.
14. **Aerial imagery from 1979–90:** GSI has none for this area. The individual 1980s photos in GSI's 地図・空中写真閲覧サービス were not checked and would settle items 1–3.
15. **Pacing:** the 165 s target needs a real drive in the street lab.

## (i) Corners opened, 2026-10-29

The lane's 91° turn onto the forest road at forest-road-foot compiled to 7.6 m at a 2.8 m half-width. Native steering cannot hold a path tighter than about 10.6 m at any speed, so no car could take that corner. A scripted driver that brakes to each bend's steerable speed scraped the wall there, and the practice field logged 559 car-ticks of wall contact at it.

`scripts/street-open-bends.ts` applies `aizu-wakamatsu-1986.bends.json` to the trace, kept beside this note as `aizu-wakamatsu-1986.trace.json`. The corners at canal-lane (83°) and forest-road-foot (91°) became single 13.5 m circular arcs tangent to their legs. The gate forest-road-foot moved 5.7 m to the nearest new point. Both corners now allow at least 76 km/h on their widest lines.

- The route is 8.056 km.
- The scripted driver takes it in 131 s without touching a wall.
- The eight-car field finishes in 141.2–168.3 s (before: 148.3–161.8 s). The wider spread comes from the town bends, which did not change.
