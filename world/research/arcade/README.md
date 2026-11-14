# The Arcade courses' real roads

On 2026-11-11 the user asked for the race maps to be "more realistic about the areas they are geographically placed
in for 1986", from old maps and photographs, keeping slopes and hills in mind. The five street routes were already
traced from real roads and match the GSI elevation model to within a metre on average (Tokyo within 2.6 m; see
[its notes](../routes/tokyo-1986.md)). The three Arcade courses were not: each was a level road past repeating
blocks of district, with landmarks in no real order. This folder sets each of them on one real road.

## How a course maps to its road

An Arcade course is three laps drawn end to end. That whole length follows one stretch of real road **at true
scale**: course progress `p` metres is `startM + p` metres along the traced road.

| Course | Real road | Length | `startM` | Heights | Bends |
|---|---|---|---|---|---|
| Midnight Circuit | National Route 1, Hakone-Yumoto station to Miyanoshita ([notes](hakone-route-1.md)) | 6.0 km | 200 | 95 → 415 m, up to 9% | 4,416°, the Ōhiradai hairpin (legs 28 m apart) |
| Harbor Run | Sakuragichō station, Honchō-dōri, Bankoku-bashi, Shinkō Pier, Kaigan-dōri, Yamashita Park, Route 82 to Honmoku D pier ([notes](yokohama-waterfront.md)) | 7.2 km | 100 | quay level, bridges within 3 m | 1,757°, a sharp left at Kominato |
| Sakura Pass | Routes 119 and 120, JNR Nikkō station to the rise before Kiyotaki ([notes](nikko-route-119-120.md)) | 5.4 km | 100 | 532 → 707 m, up to 6% | 716°, the turn at Shinkyō |

What follows the real road: its plan (every bend and hairpin), the height at every metre, the order and spacing of
places, which side each landmark stands on, where the land rises and where it falls away, and the bearings of the
far mountains, placed from their real summits. The course's road is wider than the real ones (12 m against
Kanrei-dōmon's 5.8 m carriageway).

**Local races and live races.** Local practice and story races run on the driving model, which takes the real plan
(since the evening of 2026-11-11, when the user answered "go" to taking the real bends and hairpins). Live and staked
races run RaceV1, whose bends (rules.ts) Iroha's native rules and proofs mirror; they keep them until those move to
the real roads, and the world draws them on the same heights and places. Nothing has launched, so the earlier level
courses and replays recorded on them were dropped rather than kept compatible.

## Pipeline

1. `npx tsx scripts/trace-arcade-road.ts <id> <overpass.json> <lat,lon> <lat,lon> … [name=lat,lon …] [without=name,…]`
   chains OpenStreetMap ways through the waypoints, preferring main roads (a metre of residential street counts three,
   of a service road four) and following one-way carriageways, resamples the centreline every 5 m and reads the ground
   height at each station from the GSI elevation tiles (5 m laser model, then the 10 m model). `without=` leaves out
   roads built after 1986 (Yokohama: Route 357, the Minato Mirai avenues). It writes `<id>.road.json` here and prints
   how far along the road each named place lies. The Overpass downloads are in `output/arcade-roads/` (not tracked);
   elevation tiles are cached in `output/gsi-elevation-tiles/`.
2. `npx tsx scripts/build-arcade-geography.ts [--check]` writes `src/game/generated/arcade-roads.json`:
   - **Heights**, every 20 m: a 35 m median drops strays onto cut walls, a closing over 100 m spans bridges (the
     elevation model shows the river bed, not the deck: Nikkō's Arasawa bridge reads 16 m low for 40 m), and a
     Gaussian (σ 30 m) leaves vertical curves.
   - **Plan**, a heading every 5 m: each station takes the bearing of the next 5 m of the traced line, smoothed over
     σ 7.5 m (OpenStreetMap draws a curve as straight pieces 10–30 m long) and eased wherever it would turn tighter
     than a 15 m radius, the tightest a 12 m road takes. Easing spreads a corner onto its neighbours and keeps its
     total turn, so the road leaves every corner on its real bearing; the drawn line strays from the map by tens of
     metres over a course, which only far scenery (kilometres off) could notice. The build refuses a plan with a
     tighter bend or two stretches of road within 24 m of each other.
3. `src/game/arcade-geography.ts` serves both. The driving model (`src/game/drive/course.ts`) runs a local race on
   one stretch of road from 100 m before the line to the end of the run-off (500 m; Yokohama's road ends 300 m past
   its finish at D pier), and the 3D world draws exactly that course (`courseDrawing`), so a car takes the hairpin and
   climbs the hill it is drawn on.
4. `src/game/three/period-city/layout.ts` lays the places out in order (`ARCADE_1986_STRETCHES`, with landmarks,
   crossings, street plans and the bank factor either side), `skyline.ts` stands the far mountains at their real
   summits, and `road-structures.ts` builds what the roads pass through and beside. On the real plan the ground is
   one grid round the whole road with the asphalt cut out (`three/arcade-ground.ts`): each station says how the land
   stands beside it and nearby stations blend, so the hairpin's two legs share one hillside and no bank folds over
   a bend.
5. The garage's balance is measured on the driving model, so it is re-measured whenever the courses change
   (`npm run balance:garage`).

### What the real bends changed in play

- Races are longer: eight stock cars take 2:44–2:56 over Hakone's bends (1:22–1:26 on RaceV1's), 2:24–2:38 along
  Yokohama's streets (1:38–1:43) and 1:23–1:30 at Nikkō (1:14–1:17). A local race may run five minutes; RaceV1 keeps
  its three.
- The AI follows its racing line through every hairpin: the whole field finishes each course with no wrecks.
- The HUD's corner cue reads the real road: it warns of each bend the car is too fast for (about 0.95 g of grip,
  7 m/s² of braking, 0.6 s to react) and names the hairpins.
- The garage's keyboard reference drivers brake for the bends they see. Overrating every bend by 15%, as on the
  street routes, wrecked the rookie on Hakone within 3.2–4.9 km (it slid into the rail at bend after bend of 60–80 m),
  and a regular at 7% wrecked Act 3's tuned car on every try at Hakone; with the cue a rookie reads them to within 5%
  and a regular to within 3%.
- Arcade replays always run the real road. Nothing has launched, so replays saved on RaceV1's bends were dropped rather
  than kept compatible.
- The garage and story were rebalanced for these roads on 2026-11-12: grip decides Hakone and top speed and boost
  decide Nikkō, so parts were re-priced by what they are worth here and the crew's plans start from each road's
  needs ([garage-tech-tree.md](../../../docs/garage-tech-tree.md)).

## Checked against

- GSI aerial photographs: 1984–86 (`gazo3`) where it exists (Tokyo); Yokohama has only 1974–78 (`gazo1`) and
  1988–90 (`gazo4`), which bracket the year.
- GSI standard map and elevation tiles; OpenStreetMap geometry (2026) for centrelines and for which side of the road
  a place stands on.
- Published histories for dates and appearance, listed in each course's notes.

## Decisions and open questions

- **Seasons.** The story is set in August 1986, but Midnight Circuit keeps its snow and Sakura Pass its spring
  sunrise: those moods were chosen earlier and are not geography. On Sakura Pass the cherries now stand only where
  they plausibly would (by the Daiya, round the Tamozawa villa, wild on the hillsides); Nikkō's main street never had
  a cherry avenue.
- **Yokohama's far shore** was a dense skyline of towers, after the cutscenes. In 1986 the shore across the harbour was
  piers, refineries and a low city with a handful of tall buildings, so on the real road it is now low lights with a
  few towers. The cutscene art itself is unchanged.
- **Mt. Fuji** was removed from Midnight Circuit: it cannot be seen from Route 1 between Yumoto and Miyanoshita.
- **The Bay Bridge** stays absent: in August 1986 it had no towers yet, only foundations off Honmoku's A pier.
- Modelled in a second pass the same day: Shin-Asahi-bashi beside Asahi-bashi; Tōnosawa's wooden ryokan (Fukuzumirō,
  Kansuirō, Ichinoyu); the Silk Center and Ōsanbashi with its 1964 terminal; Yamashita Park's sea wall with Hikawa
  Maru alongside in her 1986 marine blue; the Bund Hotel and its blue neon; the Tarō-sugi; the Tamozawa villa's wall
  and gate.
- Not modelled: Tamanoo-bashi; the Tenkai and Itagaki bronzes at Shinkyō; the Kanaya Hotel
  on its bluff; Kiyotaki's works; the Bay Bridge's foundation works and floating cranes off Honmoku A pier.
- Unconfirmed for 1986 (see each note): guard rails, lamps and signs on Route 1; the Deyama bridge's colour; the
  Symbol Tower's height (48.2 m or 58.5 m) and night lighting; Hikawa Maru's night lighting; whether any Kannai
  building was floodlit by August; Honmoku's cleared base land; Tōbu Nikkō station's colours; Kiyotaki's street.
- The Tokyo route's road table is the ledger member and was not re-traced; its presentation was corrected instead
  (the [Tokyo notes](../routes/tokyo-1986.md)).
