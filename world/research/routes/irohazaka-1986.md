> **Provenance.** Authoring research for `irohazaka-1986`, delivered on 2026-10-29 and kept here as written. Since then the route has been registered in `scripts/lib/street-routes.ts`, exported by the native compiler and packaged for practice. It now has its own song, *Forty-Eight Turns / 四十八の曲がり角* (3:07), so `targetMs` is 187,080; figures below that quote an earlier `targetMs` or call the soundtrack a placeholder predate that. The shipped authoring is [`world/authoring/irohazaka-1986.json`](../../authoring/irohazaka-1986.json) with its `.objects.json`. "This folder" below is the research working folder. Its tools, OSM and DEM extracts and aerial overlays are kept locally, untracked, in `output/street-routes/research/irohazaka-1986/`.

# 09 栃木 — いろは、空への四十八 / Iroha: Forty-eight to the Sky (`irohazaka-1986`)

Draft authoring research, 2026-10-29. Nothing here is surveyed or qualified. Every claim carries a source; anything I could not confirm is marked **unconfirmed**.

Files in this folder:

- `route.json`: the AuthoredStreetTrack.
- `objects.json`: 14 roadside objects.
- `check.ts`: compiles both files with the repository's compilers and prints the key figures. Run it from the repo root with `npx tsx <this folder>/check.ts`. It writes nothing.
- `tools/`: the generator, timing simulation and placement helpers. They read the repo by absolute path and write only inside this folder.
- `data/`: OSM and DEM extracts, the kana table and caches.
- `tiles/`: the GSI 1974–78 aerial mosaics with the compiled road drawn over them (`check_*.png`).

---

## (a) Route summary and why this alignment

**Route.** An uphill sprint on the Second Irohazaka (第二いろは坂, uphill-only since 1965). It starts at the Umagaeshi junction (馬返, 864 m), where the downhill First Irohazaka ends and the uphill Second begins. It crosses the Daiya (大谷川) on Ōya-bashi (大谷橋) and a side ravine on Chichinoki-bashi (乳ノ木橋). It then climbs all twenty numbered curves, い to ね, passes the Kurokamidaira rest area (黒髪平) at curve れ, and finishes in the Akechidaira ropeway car park (明智平, 1,274 m).

| Figure | Value |
|---|---|
| Topology | sprint, 1 lap, distinct endpoints |
| Compiled length | 7.169 km since curve た was opened (see the last section). The trace compiled to 7.187 km (7.29 km along the OSM centreline; the quadratic fillets cut about 100 m from the hairpins). |
| Climb | 863.9 → 1,274.7 m (+410 m). Maximum grade 10.2% over 5 m and 10.0% over 20 m (the bound is 18%). |
| Control points | 243 (the trace: 237), every kana curve a named point |
| Samples | 1,435 (the trace: 1,439) |
| Gates | 14: start, い, は, に, へ, ち, ぬ, を, か, た, Kurokamidaira (れ), そ, ね, Akechidaira |
| Half-width | 4.0 m throughout, widening to 5.0 m in the last 40 m into the car park |
| Tightest bend | 13.2 m radius averaged over 20 m (curve た), 8.3 m in a single 5 m cell. Curvature × width headroom is 1.03× the compiler bound. |
| `targetMs` / `maxTicks` | 185,000 (3:05.0, 139.9 km/h average) / 9,000 |
| Sound cues | 0 start · 18,000 い · 65,500 into the staircase at へ · 127,000 Kurokamidaira and the Nantai view · 158,500 ね, the last numbered curve |

**Why not the catalog loop (up the Second, down the First)?** The two roads total 15.8 km per Tochigi Prefecture ([pref.tochigi](https://www.pref.tochigi.lg.jp/h53/system/desaki/desaki/1182157078006.html)): the First is 6.5 km and the Second 9.5 km ([MLIT multilingual text](https://www.mlit.go.jp/tagengo-db/common/001556131.pdf)). At the pace this terrain allows in the native handling (below), a good driver averages about 140 km/h and the slowest finisher about 90 km/h. A 16 km loop would take about 6:50 and 10:40, so it cannot fit in 5:00. It would also need the 1932 road at the top (next paragraph).

**Why stop at Akechidaira rather than the lake?** The Second Irohazaka as built in 1965 ran from Umagaeshi to Akechidaira ([ja.wikipedia いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82), citing the JH toll notice of 4 Oct 1965). In 1986 the road on to the lake was different:

- It was the 2.2 km Akechidaira–Chūgūshi motor road, opened on 26 August 1932 by the Nikkō Tozan Railway ([東武日光鋼索鉄道線](https://ja.wikipedia.org/wiki/%E6%9D%B1%E6%AD%A6%E6%97%A5%E5%85%89%E9%8B%BC%E7%B4%A2%E9%89%84%E9%81%93%E7%B7%9A)).
- It ran through the low-ceilinged Akechi and Hakuun tunnels. The 1994 Akechidaira bypass replaced it, and the old road and its tunnels were sealed ([いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82)).
- It carried two-way traffic, one lane each way, until 1 October 2019 ([jorudan](https://sp.jorudan.co.jp/leaf/news/jrd_191108_1.html), [tabi-mag](https://tabi-mag.jp/tg0130/)).

It is a legal 1986 road, but I left it out for three reasons:

1. **Time.** It adds about 2.1 km (about 9.3 km in all). I estimated rather than simulated this: the "good" setting would take about 3:50 and the 50% setting about 5:00, leaving slower cars no margin.
2. **Evidence.** Its 1986 line through the tunnels rests only on OSM's `abandoned:highway` trace (ways 1416520106–1416520113). Tunnels are invisible on aerials.
3. **Traffic.** It had oncoming traffic in 1986.

The finish is therefore the 1986 top of the one-way uphill road: "uphill-only from Umagaeshi to the Akechidaira ropeway car park, two-way beyond" ([tabi-mag](https://tabi-mag.jp/tg0130/)).

**Alignment evidence.**

- **Geometry.** The geometry comes from OpenStreetMap: ways 426182285, 426182284 (大谷橋), 986511510, 986511511 (乳ノ木橋) and 48049510, which is oneway with two lanes ([OSM](https://www.openstreetmap.org/way/48049510)). Fetched 2026-10-29.
- **1974–78 check.** I overlaid it on the GSI 1974–1978 aerial layer (`gazo1`, [maps.gsi.go.jp](https://maps.gsi.go.jp/#16/36.7320/139.5240/&base=std&ls=gazo1&disp=1)). The overlays are in `tiles/check_hairpins.png`, `check_umagaeshi.png` and `check_akechi.png`. Every hairpin, the Ōya-bashi loop and the Akechidaira approach coincide with the 1970s road within a few metres.
- **No 1979–90 imagery.** The 1979–83 (`gazo2`), 1984–86 (`gazo3`) and 1988–90 (`gazo4`) layers, and `ort_old10`/`ort_USA10`, return no tiles for this mountain area. The line is therefore evidenced for 1974–78 and for today, and unchanged between the two. The 1986 alignment is inferred from that, not seen directly.
- **Compiled fit.** The compiled centreline stays within 2.3 m of the OSM line.

**Timing and drivability (evidence for `targetMs`).** The repo's street engine is a road-coordinate integrator, and steering authority is 9000 − 2v microturns per tick. That gives a minimum car-path radius of about 10.6 m at a crawl, 12 m at 65 km/h and 23 m at 108 km/h. Hairpins are therefore steering-limited, not grip-limited.

I drove the route through the existing 8-car Tokyo native graph, used only as the motion engine (`tools/sim.ts`, read-only bundle). The driver (`tools/driver.ts`) plans speed from the compiled curvature. Its "skill" is the fraction of the yaw-limited corner speed it attempts, and it runs solo or with a delayed second car.

| Skill | Time | Average |
|---|---|---|
| 0.90 | 2:44.7 | 157 km/h |
| 0.80 | 2:56.2 | 147 km/h |
| **0.75** | **3:05.1** | **140 km/h (→ `targetMs` 185,000)** |
| 0.70 | 3:14.4 | 133 km/h |
| 0.65 | 3:25.5 | 126 km/h |
| 0.60 | 3:36.8 | 119 km/h |
| 0.55 | 3:53.6 | 111 km/h |
| 0.50 | 4:12.6 | 102 km/h |
| 0.45 | 4:36.4 | 94 km/h |
| 0.42 | over 5:00 | — |

The 300 s cap requires at least 86.2 km/h average, which this driver reaches at a skill of about 0.43. The Tokyo graph's rain schedule and its four oil zones were active, so dry Irohazaka times would be slightly faster.

**Finding for integration:** the repository practice AI (`streetDriver` in `src/game/street/test-driver.ts`, as it stood in the working tree during this session, which by the end included a new `HAIRPIN_TURN` branch) did not finish this route in 8-car runs.

- On an earlier draft with narrowed bridge decks, every car pinned itself to a wall within the first kilometre: at the Ōya-bashi loop around 105 m and at い/ろ. Each recorded 4,300–7,500 wall-contact ticks.
- On the final geometry, the leading car reached ち at 4:43 and then timed out.
- One trap is general: when the corridor narrows, the native wall solver stops a car pressed against the outside wall. That is why the draft keeps a constant 4.0 m half-width and does not model hairpin widening.

**First Irohazaka, key facts for a later downhill route.**

- Downhill-only since 1965.
- 6.5 km, 28 curves な to ん (kana 21–48) ([MLIT](https://www.mlit.go.jp/tagengo-db/common/001556131.pdf); [いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82)).
- Rebuilt as Japan's second toll road, tolled from 1 Oct 1954, free from 1 Oct 1984 (same sources). It is legal downhill from Chūgūshi to Umagaeshi in 1986.
- OSM lists it as one lane on some sections, and a 43 m avalanche/rock gallery, 馬返洞門, near the bottom. The gallery's date is **unconfirmed**.
- It passes 剣ヶ峰 (Kengamine), where the OSM guideposts for な–ん are mapped.
- Exclude its 2023 melody road ([いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82)).

---

## (b) 1986 road facts

| Item | 1986 fact | Source |
|---|---|---|
| Opening | Construction began 30 Jul 1963 and finished 22 Sep 1965. Opened 7 Oct 1965 from Umagaeshi to Akechidaira as the uphill line of the toll road 日光道路. One source gives 6 Oct 1965. | [いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82) (JH notices); 6 Oct per [東武日光鋼索鉄道線](https://ja.wikipedia.org/wiki/%E6%9D%B1%E6%AD%A6%E6%97%A5%E5%85%89%E9%8B%BC%E7%B4%A2%E9%89%84%E9%81%93%E7%B7%9A) |
| Direction | Uphill one-way from 1965; the First Irohazaka downhill one-way | [いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82), [MLIT](https://www.mlit.go.jp/tagengo-db/common/001556131.pdf) |
| One-way extent in 1986 | Umagaeshi → Akechidaira ropeway car park. The ~2 km beyond to the lake was two-way, one lane each way, until 1 Oct 2019. The 1974–78 aerial (`tiles/akechi_junction_1970s_x3.png`) shows one road from the old-road junction up to a car park with a turning loop. Our last ~200 m above that junction may therefore have carried two-way traffic in 1986 (**unconfirmed**); uphill driving is legal either way. | [tabi-mag](https://tabi-mag.jp/tg0130/), [jorudan](https://sp.jorudan.co.jp/leaf/news/jrd_191108_1.html), [travel.watch](https://travel.watch.impress.co.jp/docs/news/1155014.html) |
| Toll | Tolled (日光道路) from 7 Oct 1965 (the First from 1 Oct 1954). **Free from 1 Oct 1984, so no tolls in 1986.** | [いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82) |
| Toll gate | The 1974–78 aerial shows a canopy-like structure across the carriageway at the Umagaeshi junction, consistent with a toll plaza (my reading, `tiles/umagaeshi_zoom_x2.png`). Whether any booth still stood in 1986 is **unconfirmed**. Never show one operating. | GSI gazo1 |
| Lanes | Two uphill lanes today: OSM `lanes=2`, "ほぼ２車線". The 1974–78 carriageway looks wide enough for two. The 1986 lane markings are **unconfirmed**. Authored corridor 8.0 m (lanes + shoulders), not surveyed. | [OSM](https://www.openstreetmap.org/way/48049510), [いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82) |
| Length | 9.5 km to the lake. This sprint covers Umagaeshi → Akechidaira, 7.29 km along OSM. | [MLIT](https://www.mlit.go.jp/tagengo-db/common/001556131.pdf) |
| Curves | Twenty, い to ね: the first twenty letters of the iroha poem. The First carries な–ん. Each curve has a kana plate (positions in (d)). | [MLIT](https://www.mlit.go.jp/tagengo-db/common/001556131.pdf), [Tochigi](https://www.pref.tochigi.lg.jp/h53/system/desaki/desaki/1182157078006.html) |
| Bridges | 大谷橋 (OSM bridge, 65 m) over the Daiya at 136–201 m; 乳ノ木橋 (49 m) over a side ravine at about 630–680 m. Both appear on the 1974–78 aerial. Readings, structure types and build years are **unconfirmed**; probably 1965 with the road. | OSM ways 426182284, 986511511; GSI gazo1 |
| Tunnels, rock and snow galleries | **None between Umagaeshi and Akechidaira.** OSM tags none, and no covered section shows on the 1974–78 aerial. Beyond Akechidaira (not raced): the 1932 road's old Akechi (明智) and Hakuun (白雲) tunnels, in use in 1986 and sealed after 1994. OSM traces three tunnel bores of 244 m, 30 m and 436 m on that road; which name belongs to which is **unconfirmed**. | [いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82), OSM 1416520106/09/13 |
| Later tunnels (exclude) | Akechidaira bypass, 1,800 m, 9 m wide, built 1989 – 30 Mar 1994: 明智第1トンネル 42.1 m and 明智第2トンネル 926 m, each 7.5 m wide and 4.5 m high. Its portals and its separate return carriageway from the car park lie 13–25 m left of our last 350 m (OSM). They do not cross the route. The GSI DEM shows a +8 m artefact beside the portals, which I interpolated out. | [いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82) (広報にっこう 1994), OSM 415392666, 415392665, 70168832, 70168817 |
| Elevation | 863.9 m at the junction to 1,274.7 m in the car park | [GSI DEM API](https://maps.gsi.go.jp/development/elevation_s.html) (1 m laser) |
| Speed limit | 40 km/h today (OSM `maxspeed`); **1986 value unconfirmed** | OSM |

---

## (c) Sectors

Driver's left/right throughout. "District" is the nearest `docs/period-city.md` / `layout.ts` district. Sides follow `PeriodSide`: +1 is left and −1 is right, as in `scripts/street-landmark-placement.ts`. Station ranges come from `check.ts`.

| Sector | Compiled stations | Left (district: what is there) | Right (district: what is there) |
|---:|---|---|---|
| 0 Umagaeshi junction | 0–120 m | `forest`: the Daiya's wide boulder riverbed below the road | `rural`: the junction apron where the First Irohazaka's downhill lane joins. The Umagaeshi hamlet and bus stop are just behind the start; the bus stop is 12 m right at 32 m. |
| 1 Daiya gorge and bridges | 120–695 m | `forest`: the river gorge, crossed on 大谷橋 at the start of the loop, then below on the left | `forest`: a steep cut slope; the abandoned funicular's straight incline runs 46 m away at about 565 m. 乳ノ木橋 crosses a ravine at about 630–680 m. |
| 2 First switchbacks い ろ は | 695–1,385 m | `forest`: mixed broadleaf and conifer plantation | `forest`. The outside of each hairpin drops toward the valley. Nantai-san is visible to the north-west and the First Irohazaka across the gorge (DEM line of sight). |
| 3 South flank に ほ | 1,385–2,275 m | `forest` | `forest`. Long climbing legs; the Akechidaira observation station is visible on the ridge above. |
| 4 Ridge traverse to へ | 2,275–3,070 m | `forest` | `forest`. Nyohō-san (女峰山) is visible to the north from about 3 km. |
| 5 The staircase と ち り ぬ る を わ か よ | 3,070–4,840 m | `forest` | `forest`. Ten stacked hairpins on one slope, so road levels show above and below through the trees. Nantai is hidden. |
| 6 Kurokamidaira た れ | 4,840–5,230 m | `park`: the Kurokamidaira car park and viewpoint on the outside of れ, 5 m left at 5,018 m (a paved bay is visible on the 1974–78 aerial; today about 50 spaces) | `forest`. Nantai-san reappears to the north-west, with the observation station ahead. |
| 7 Upper traverse | 5,230–5,725 m | `forest` | `forest`. A long rising traverse. |
| 8 Upper hairpins そ つ ね | 5,725–6,215 m | `forest` | `forest`. An unnumbered left-hand bend lies between そ and つ. |
| 9 Akechidaira approach | 6,215–6,905 m | `forest`: the old 1932 tunnel portal is 30 m left at 6,852 m | `forest`. Final climb beneath the Akechidaira ridge. |
| 10 Akechidaira | 6,905–7,187 m | `forest`: the junction with the two-way 1932 road (14 m left at 6,992 m), the ridge and the observation station 128 m left and about 95 m up | `park`: the car park (6 m right at 7,177 m). The ropeway station and rest house stand 77 m ahead-right of the finish; the ropeway cable climbs west toward the ridge. |

Scene suggestions for the repo's new `StreetScene`:

- **Ground style.** One of the forest-bank styles (0–2) rather than the paved city (3).
- **Trees.** `trees: { kind: 'momiji', sectors: [1…10], bothSides: true }`.
- **Atmosphere.** `atmosphere: 'leaves'`.
- **Distant silhouettes** (bearings from the start, via `realBearing`):
  - Nantai-san: 4.36 km at 312°, 3,255 m west and 2,901 m north. Use 2,484 m, its 1986 height.
  - Nyohō-san: 8.0 km at 2°.
  - The Akechidaira ridge.

---

## (d) Landmarks

Positions are WGS84 from OSM unless stated. Progress, side and offset are measured against the compiled route (`tools/place.ts`).

| id | 日本語 / English | lon, lat | Side, offset | Footprint / height | 1986 appearance | Prominence |
|---|---|---|---|---|---|---|
| `umagaeshi` | 馬返 / Umagaeshi junction | 139.527285, 36.738763 | start, both sides | apron about 60 × 20 m | The meeting of the downhill First and uphill Second. One-way signs, and a small hamlet of roadside buildings along Route 120 east of the junction (1974–78 aerial). Their trades in 1986 are **unconfirmed**; plausibly tea houses and souvenir stalls. The Tobu bus stop 馬返 is here today; its 1986 sign is **unconfirmed**. | High: start grid |
| `umagaeshi-toll-canopy` | 旧日光道路料金所（推定） / former toll plaza (inferred) | about 139.5268, 36.7391 | start apron | a canopy across the road (1974–78) | Toll collection ended 1 Oct 1984. Whether the structure survived to 1986 is **unconfirmed**. | Low: only if confirmed |
| `oya-bridge` | 大谷橋 / Ōya-bashi | 139.525775, 36.739275 | on route, 136–201 m | 65 m deck, two lanes | A road bridge (type **unconfirmed**) over the Daiya's wide boulder riverbed, as on the 1974–78 aerial | Medium |
| `chichinoki-bridge` | 乳ノ木橋 / Chichinoki-bashi | 139.528930, 36.736540 | on route, about 630–680 m | 49 m | A short bridge over a wooded ravine (type **unconfirmed**) | Low |
| `funicular-trace` | 東武日光鋼索鉄道線跡 / abandoned Tobu Nikkō funicular | nearest 139.527861, 36.736536 | right, 46 m at 565 m | 1.2 km straight incline at 250–500‰, with tunnels of 170 m and 60 m | Opened 28 Aug 1932, closed 1 Apr 1970. In 1986 it was a 16-year-old abandoned cutting; whether rails or cables remained is **unconfirmed**. | Low: a straight scar up the right-hand hillside |
| kana plates | いろは坂カーブ標識 / curve signs い…ね | table below | outside of each hairpin, 5–15 m from the centreline | plates on posts (size **unconfirmed**) | **The 1986 design is unconfirmed.** The signs replaced in 2023 had been installed in March 1995 with a single Yashio-azalea picture, and the 2023 set has 48 pictures ([Tochigi](https://www.pref.tochigi.lg.jp/h53/r5kikaku/hyoushikigaiyou.html)). So neither the 1995 nor the 2023 design may be shown. | High: the key visual |
| `kurokamidaira` | 黒髪平 / Kurokamidaira rest area and viewpoint | 139.521067, 36.728147 (car park) | left, 5 m at 5,018 m (outside of れ) | car park about 50 × 20 m (50 spaces today, [tabi-mag](https://tabi-mag.jp/tg0130/)) | A paved bay at this hairpin shows on the 1974–78 aerial (`tiles/kurokami_1970s.png`). 1986 facilities are **unconfirmed**. A 日本の道100選 monument stands here today; the road was selected in 1986, but the monument's date is **unconfirmed**, so leave it out. | Medium |
| `akechidaira-car-park` | 明智平駐車場 / Akechidaira car park | 139.516981, 36.736673 | right, 6 m at 7,177 m | about 100 × 30 m (estimate) | A large paved car park with a turning loop at its west end, as on the 1974–78 aerial. Today's marked bays, split carriageways and prefectural car park are later or **unconfirmed**. Parking was free; paid parking began 1 Jul 2021 ([明智平ロープウェイ](https://ja.wikipedia.org/wiki/%E6%98%8E%E6%99%BA%E5%B9%B3%E3%83%AD%E3%83%BC%E3%83%97%E3%82%A6%E3%82%A7%E3%82%A4)). | High: the finish |
| `akechidaira-rest-house` | 明智平駅・レストハウス / ropeway station and rest house (former 1932 funicular station) | 139.517698, 36.737194 | right, 77 m (ahead of the finish) | roughly 30–40 × 15–20 m, 2–3 storeys (estimate from the 1974–78 aerial; **unconfirmed**) | A drive-in and rest house built in and around the funicular's 1932 station, with the ropeway boarding below. It was demolished 2017–2018 ([明智平ロープウェイ](https://ja.wikipedia.org/wiki/%E6%98%8E%E6%99%BA%E5%B9%B3%E3%83%AD%E3%83%BC%E3%83%97%E3%82%A6%E3%82%A7%E3%82%A4)). Its 1986 name, cladding and roof colour are **unconfirmed**; "明智平パノラマレストハウス" is attested only later. | High |
| `akechidaira-ropeway` | 明智平ロープウェイ / Akechidaira Ropeway | station to 139.514484, 36.737346 | cable passes 50–100 m left of the last 300 m, along a cleared line visible on the 1974–78 aerial | 300 m long, 86 m rise, max 30°, two 16-person cabins on a shuttle (交走式) | Opened 3 Nov 1933, removed in 1943, reopened 5 Oct 1950, run by Nikkō Kōtsū from 1 Apr 1985. A cabin used until 2001 is preserved at the Tobu Museum, but whether that type already ran in 1986 is **unconfirmed**, and so is the 1986 livery. The 2024 Spacia X wrap is wrong for 1986. | High: finish backdrop |
| `akechidaira-deck` | 展望台駅 / observation station | 139.514484, 36.737346 | left, 128 m at 7,022 m, about 95 m above the road | two-storey station with a roof deck | Present in 1986 (the ropeway terminus); the building's date is **unconfirmed** | Medium |
| `old-akechi-road` | 明智平–中宮祠旧道・旧明智トンネル / the 1932 road and old Akechi tunnel | junction 139.514921, 36.736269; portal 139.514336, 36.735605 | left: junction 14 m at 6,992 m, portal 30 m at 6,852 m | portal for a low two-way tunnel | **Open and two-way in 1986.** The branch to the lake and Chūzenji-onsen leaves left just before the car park. Portal design is **unconfirmed**. | Medium |
| `nantai-san` | 男体山 / Nantai-san | 139.4908, 36.7650 | left/ahead, north-west, 3.9–4.9 km | 2,486 m today; **2,484 m was the official height in 1986** (raised after the 2003 GSI survey) | A broad stratovolcano cone, wooded on its flanks with a barer summit; a dusting of early snow in late October is possible but **unconfirmed**. DEM line of sight shows it at 0–3.0 km, around 4.9–5.1 km at Kurokamidaira, and from the finish. | High: skyline |
| `nyoho-san` | 女峰山 / Nyohō-san | 139.5307, 36.8114 | north, about 8–9 km | 2,483 m | visible from about 3.0–4.0 km, 5.0–5.5 km, 6.2–6.6 km and the finish | Medium |
| `first-irohazaka` | 第一いろは坂（剣ヶ峰） / the First Irohazaka across the gorge | 139.515263, 36.744309 | left/north, 0.85–1.6 km | hairpins on the far slope | Visible at the start and from Akechidaira (DEM). In 1986 it carried downhill traffic only. | Medium |
| `kegon-falls`, `lake-chuzenji` | 華厳滝 / Kegon Falls, 中禅寺湖 / Lake Chūzenji | 139.501968, 36.738009; lake surface 1,269 m | 1.15 km and about 2.4 km west of the finish | falls 97 m high, 7 m wide | **Not visible anywhere on the route** (DEM line of sight); only from the observation deck. A large part of the falls' lip collapsed in **October 1986** (about 30 × 20 × 4 m, 4,000 m³); the day is **unconfirmed** ([Tochigi sabō](https://www.pref.tochigi.lg.jp/h02/pref/seisakuhyouka/documents/h250909_09_sabou_daiyagawa.pdf)). Keep to a finish cutscene. | Cutscene only |

**The twenty kana curves.** Generated by `tools/kana-table.ts`. "Turn" is the heading change over ±40 m of compiled road. "20 m radius" is the tightest compiled radius averaged over 20 m. The sign positions are the 2023 sign posts in OSM; the 1986 posts are assumed to stand at the same curves, which is **unconfirmed**. On every curve the plate stands on the outside of the bend.

| No. | Kana | Control point | Gate | Progress (m) | Bend | Turn | 20 m radius (m) | Sign lon, lat (OSM 2023) | Sign side, offset |
|---:|:---:|---|:---:|---:|:---:|---:|---:|---|---|
| 1 | い | `curve-i` | yes | 790 | right | 154° | 15 | 139.530383, 36.736365 | left, 9 m |
| 2 | ろ | `curve-ro` |  | 900 | left | 174° | 14 | 139.529568, 36.735675 | right, 7 m |
| 3 | は | `curve-ha` | yes | 1259 | right | 151° | 19 | 139.533116, 36.735969 | left, 9 m |
| 4 | に | `curve-ni` | yes | 1919 | left | 183° | 15 | 139.528250, 36.732543 | right, 11 m |
| 5 | ほ | `curve-ho` |  | 2179 | right | 175° | 15 | 139.530747, 36.734089 | left, 8 m |
| 6 | へ | `curve-he` | yes | 2989 | left | 178° | 18 | 139.523977, 36.730402 | right, 7 m |
| 7 | と | `curve-to` |  | 3234 | right | 143° | 16 | 139.525565, 36.728988 | left, 8 m |
| 8 | ち | `curve-chi` | yes | 3494 | left | 196° | 15 | 139.523171, 36.730000 | right, 9 m |
| 9 | り | `curve-ri` |  | 3698 | right | 156° | 18 | 139.524456, 36.728726 | left, 10 m |
| 10 | ぬ | `curve-nu` | yes | 3918 | left | 190° | 15 | 139.522105, 36.729584 | right, 9 m |
| 11 | る | `curve-ru` |  | 4048 | right | 189° | 18 | 139.523190, 36.728908 | left, 9 m |
| 12 | を | `curve-wo` | yes | 4233 | left | 200° | 16 | 139.521192, 36.729328 | right, 9 m |
| 13 | わ | `curve-wa` |  | 4318 | right | 165° | 18 | 139.522084, 36.728972 | left, 10 m |
| 14 | か | `curve-ka` | yes | 4518 | left | 191° | 16 | 139.520423, 36.729057 | right, 15 m |
| 15 | よ | `curve-yo` |  | 4718 | right | 190° | 17 | 139.521709, 36.727993 | left, 7 m |
| 16 | た | `curve-ta` | yes | 4908 | left | 198° | 13 | 139.519970, 36.728251 | right, 11 m |
| 17 | れ | `kurokamidaira` | yes | 5013 | right | 118° | 27 | 139.521000, 36.728191 | left, 5 m |
| 18 | そ | `curve-so` | yes | 5748 | right | 139° | 16 | 139.516317, 36.729678 | left, 10 m |
| 19 | つ | `curve-tsu` |  | 5913 | right | 116° | 19 | 139.516140, 36.730780 | left, 9 m |
| 20 | ね | `curve-ne` | yes | 6147 | left | 124° | 16 | 139.518420, 36.731268 | right, 11 m |

**Objects** (`objects.json`, 14 of a possible 16):

- Six SORA breakaway signs: at the start, the entry to い, the exit of へ, after か, after ね and on the Akechidaira run-in.
- Four potted planters (portable maple saplings set out for the event): after は, inside を, at the Kurokamidaira bay and before the finish.
- Four oil zones: the gorge run before 乳ノ木橋, the braking zone before に, between ち and り, and the upper traverse before そ.

They can be dressed as wet leaf mats or a coach's oil leak. Lateral offsets keep every footprint inside the 4.0 m half-width. Each SORA board must carry the exact emblem, centred.

---

## (e) Later landmarks and changes to exclude

| Item | Date | Source |
|---|---|---|
| 日本ロマンチック街道 (Japan Romantic Road) signs on Route 120 | designated April 1987 | [いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82) |
| JR branding (JR日光駅 on guide signs) | JNR until 31 Mar 1987; use 国鉄 / 日光駅 | general knowledge (JNR privatisation 1 Apr 1987) |
| Akechidaira bypass: the 明智第1 and 明智第2 tunnel portals, retaining walls and the separate return carriageway, 13–25 m left of the route's last 350 m | 1989–30 Mar 1994 | [いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82) |
| Sealing of the old Akechi and Hakuun tunnels. They are open in 1986. | after 1994 | same |
| Kana curve plates with the Yashio-azalea design | March 1995 | [Tochigi](https://www.pref.tochigi.lg.jp/h53/r5kikaku/hyoushikigaiyou.html) |
| Kana curve plates with 48 illustrations | 26 May 2023 | same |
| Ropeway cabins of the post-2001 type; Spacia X wrap | 2001; by 2024 | [明智平ロープウェイ](https://ja.wikipedia.org/wiki/%E6%98%8E%E6%99%BA%E5%B9%B3%E3%83%AD%E3%83%BC%E3%83%97%E3%82%A6%E3%82%A7%E3%82%A4) |
| Rest house demolished; 2018 viewing terrace and new small snack/toilet building | 2017–18; 2018 | same |
| Paid parking at Akechidaira | 1 Jul 2021 | same |
| One-way order from Akechidaira to the lake (two-way in 1986) | 1 Oct 2019 | [jorudan](https://sp.jorudan.co.jp/leaf/news/jrd_191108_1.html) |
| Nantai-san shown as 2,486 m (it was 2,484 m in 1986) | 2003 | [男体山](https://ja.wikipedia.org/wiki/%E7%94%B7%E4%BD%93%E5%B1%B1) |
| JSCE Civil Engineering Heritage plaque (土木学会選奨土木遺産) | 2020 | [JSCE](https://www.jsce.or.jp/contents/isan/files/2020_07.shtml) |
| Melody road (First Irohazaka) | April 2023 | [いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82) |
| Ropeway renewal works and closure | from 16 Jan 2026 | [明智平ロープウェイ](https://ja.wikipedia.org/wiki/%E6%98%8E%E6%99%BA%E5%B9%B3%E3%83%AD%E3%83%BC%E3%83%97%E3%82%A6%E3%82%A7%E3%82%A4) |
| Kegon Falls rock-anchor works | phases 1990–2007 | [Tochigi sabō](https://www.pref.tochigi.lg.jp/h02/pref/seisakuhyouka/documents/h250909_09_sabou_daiyagawa.pdf) |
| Not visible from the route, but never in any skyline: Chūzenji's new hotels, for example the Ritz-Carlton Nikkō | post-1986 (exact years **unconfirmed** here) | OSM 7818348608 |

Things already gone by 1986, which must **not** appear working:

- **Tobu Nikkō tram to Umagaeshi.** Closed 1968, so no rails or wires at Umagaeshi.
- **Funicular.** Closed 1 Apr 1970 ([東武日光鋼索鉄道線](https://ja.wikipedia.org/wiki/%E6%9D%B1%E6%AD%A6%E6%97%A5%E5%85%89%E9%8B%BC%E7%B4%A2%E9%89%84%E9%81%93%E7%B7%9A)).
- **Toll collection.** Ended 1 Oct 1984.

---

## (f) Period details worth showing

- **Season and foliage.** The Irohazaka foliage is usually given as mid to late October, mid-October to early November in wider ranges. Colour descends the mountain: Akechidaira at about 1,270 m turns before Umagaeshi at about 860 m (modern guidance: [walkerplus](https://koyo.walkerplus.com/detail/ar0309e12983/data.html), [rurubu](https://rurubu.jp/andmore/spot/80007025/koyo)). The 1986 timing itself is **unconfirmed**. Show red and orange maples and yellow broadleaves. The 1974–78 aerial shows darker patches on the lower slopes that look like conifer plantations.
- **Traffic and vehicles.** Autumn weekends brought heavy jams ([いろは坂](https://ja.wikipedia.org/wiki/%E3%81%84%E3%82%8D%E3%81%AF%E5%9D%82)). Parked at Akechidaira or queued at Umagaeshi: mid-1980s Japanese cars (Corolla AE86, Skyline R31, RX-7 FC, Civic, Mark II, kei cars and vans), sightseeing coaches, Tobu route buses to Chūzenji-onsen, and touring motorcycles. Tobu's 1986 bus livery is **unconfirmed**.
- **Rail echoes.** The 1932 funicular station now serves as the rest house; the straight incline scars the right-hand slope in sector 1; Umagaeshi carries the name of the old tram terminus (closed 1968).
- **Akechidaira in 1986.** One road climbs from the junction with the two-way lake road to a large car park with a turning loop. The station and rest-house block stands at its north-east end, and the ropeway's cleared line runs west to the ridge-top station (all on the 1974–78 aerial). Today's split carriageways and the bypass portals are later.
- **Signage.**
  - The kana curve plates, in a pre-1995 design (**unconfirmed**).
  - Route 120 shields and blue guide signs to 中禅寺湖, 湯元 and 明智平, with 国鉄 rather than JR.
  - 一方通行 and 進入禁止 at Umagaeshi, yellow diamond curve and 落石注意 warnings, and chain-control boards.
  - Guardrails were probably white steel; this road's 1986 rail colour is **unconfirmed**.
  - Any sign giving Nantai's height reads 2,484 m.
- **Shops and people.**
  - **Akechidaira.** The rest house (souvenirs, food) and the ropeway queue.
  - **Visitors.** Crowds of leaf-peepers, school trips and tour groups behind guides' flags.
  - **Umagaeshi.** The roadside hamlet.
  - **Monkeys.** Japanese macaques along the road and at Akechidaira are plausible for 1986: Nikkō's monkey problem predates the city's later feeding ban (ordinance date **unconfirmed** here).
  - **SORA.** Fans with SORA's flag at the start and finish; SORA cloth banners at Umagaeshi and Akechidaira, with the exact emblem centred.
- **Distant sky.** Nantai-san (2,484 m) and Nyohō-san on the skyline; the ropeway cabin climbing the ridge above the finish.

---

## (g) Time of day, season and weather

**A clear, dry late-October 1986 afternoon at peak colour, about 14:30–16:15 JST.**

- **Sun.** On 25 Oct the sun stands at about 237° azimuth and 20° elevation at 15:00 JST, and about 9.5° at 16:00. It sets around 16:54 on a flat horizon, earlier behind the ridges. These are my own solar-geometry figures (NOAA approximation), not a source.
- **Shade.** The climb is cut into a north-east-facing slope, so the road and the gorge fall into cool blue shade through the afternoon.
- **Glow.** Across the gorge, the First Irohazaka's south-facing slope, the ridgelines and Nantai-san glow orange.
- **Light breaks.** Light reaches the road at the ridge sections: Kurokamidaira, the upper traverse and Akechidaira.
- **Air.** Cold and crisp, around 10 °C at the top. Leaves blow across the road.

This differs from Tokyo's rainy night-to-dawn, the Nikkō Arcade course's spring sunrise and Hakone's winter night. It fits the repo's new `momiji` trees and `leaves` atmosphere.

Suggested daylight per cue, on the `StreetSceneMood.daylight` 0–1 scale: 0.95 at the start, 0.9, 0.85, 0.75 at Kurokamidaira, and 0.65 at the Akechidaira finish, with the sun low behind the ridge.

Chapter suggestion, one per cue:

1. 序・馬返 *UMAGAESHI*
2. 破・いの字 *FIRST LETTER*
3. 破・四十八の階段 *THE STAIRCASE*
4. 急・黒髪平 *NANTAI RISES*
5. 急・空へ *INTO THE SKY*

These are creative markers, not measured music.

A plausible alternative is early-morning valley fog (雲海) burning off below Akechidaira. It is also distinct, but it hides the foliage.

---

## (h) Unconfirmed

1. The **1986 design of the kana curve plates**: colours, size, fonts, whether a number was shown, and whether each plate stood at exactly today's post. Only the 1995 and 2023 designs are documented.
2. **Lane markings and widths in 1986.** Two uphill lanes are the current state and fit the 1974–78 carriageway. No 1986 survey or cross-section was found. The 8.0 m corridor is an estimate.
3. **The 1986 speed limit.**
4. **Toll plaza at Umagaeshi.** Whether any structure remained in 1986; its exact location; and that the 1974–78 canopy was a toll plaza at all, which is my reading of the aerial.
5. **Bridges.** Names' readings (大谷橋, 乳ノ木橋), structure types and construction years.
6. **The two old tunnels on the 1932 road**: which OSM bore is 明智 and which is 白雲, their exact lengths, and the role of the 30 m bore. Not raced, but the junction and a portal are visible near the finish.
7. **The Akechidaira rest house in 1986**: name, footprint, storeys, materials and roof colour. Likewise the ropeway cabins' 1986 livery and the observation station building's date.
8. **Kurokamidaira facilities in 1986**, and the date of the 日本の道100選 stone. The road's selection itself was in 1986; the month is unknown.
9. **The Umagaeshi hamlet's buildings and trades in 1986**, and the bus-stop sign.
10. **The day in October 1986 when the Kegon lip collapsed.** It only matters for a finish cutscene, since the falls are not visible from the road.
11. **Foliage timing in 1986.** Only modern typical windows are sourced.
12. **The exact opening day**: 6 or 7 October 1965, as the sources differ.
13. **The last ~200 m.** Whether the stretch from the old-road junction to the car park was one-way uphill or two-way in 1986. The 1974–78 aerial shows a single road to a turning loop; uphill is legal either way.
14. **Other roadside elements.** Whether the transmission line now beside the road (OSM towers) existed in 1986, and the guardrail colour.
15. **Elevations** come from the modern 1 m DEM, smoothed. Bridge decks are interpolated, not surveyed. The +8 m DEM artefact beside the 1994 bypass portals was removed by interpolation.
16. **Timing.** The `targetMs` and the 5:00 margin come from a scripted driver in the Tokyo graph, not from human players or a native bundle for this route. A native generation for `irohazaka-1986` and tuned AI opponents are needed before pacing is qualified.

## (i) Curve た opened, 2026-10-29

Curve た compiled to 8.4 m in one 5 m cell; the 13 m under `cornerGeometry` is its 20 m average. Native steering cannot hold a path tighter than about 10.6 m, so a car could take た only at 37 km/h, and only on the very outside line. A scripted driver that brakes to each bend's steerable speed scraped the wall there.

`scripts/street-open-bends.ts` applies `irohazaka-1986.bends.json` to the trace, kept beside this note as `irohazaka-1986.trace.json`. The points kurokamidaira-4946 to kurokamidaira-4989, curve-ta among them, became a shortest 12.5 m-radius path between the curve's legs. The gate curve-ta moved 8.6 m to the nearest new point, and た now allows 79 km/h on its widest line.

- **Length.** The route is 7.169 km, 18 m shorter, so the kana boards from た onward moved with it in the scene.
- **Other hairpins.** Re-sampling the shorter road shifts the other hairpins' 5 m readings by up to 3 km/h. The lowest is now curve を, at 68 km/h.
- **Drives.** The scripted driver takes the route in 183 s without touching a wall. The eight-car field finishes in 173.3–184.7 s (before: 172.4–184.1 s).
