# SORA CARS — the 1986 period city

Status (2026-10-29): the default city for the Tokyo street route and all
three Arcade courses. The race's pixel-art renderer
([notes](pixel-art-renderer.md)) still draws the final frame; this is the 3D
content under it. `?city=classic` restores the earlier template city on any
course for comparison.

## Why

The Tokyo route circles the Imperial Palace, from Manaita Bridge through
Kudanshita, Yasukuni-dori, Chidorigafuchi, Hanzomon, the Diet front,
Kasumigaseki, Sakuradamon, Hibiya and Wadakura to Takebashi. The classic
city cloned four two-storey shop-house templates and two apartment blocks
along all 7 km, so every sector looked the same and none looked like 1986
central Tokyo. The period city generates every building from its own seed,
in the district it stands in.

## What it draws

Code: `src/game/three/period-city/`.

| File | Role |
|---|---|
| `layout.ts` | Pure layout: districts per route sector, lots in up to four depth rows per side, open runs (moat, park, shrine), the river crossing, the ground cut, planting tests. Unit-tested. |
| `buildings.ts` | Nine typologies, each generated from continuous parameters. |
| `open-ground.ts` | Moat, park and shrine cross-sections that follow the route; the expressway crossing; the yagura and the torii. |
| `signs.ts` | Two canvas atlases of original period signage: shop signs, boards and guide signs; then neon tube signs, nobori and street banners. Every SORA design draws the exact emblem (`branding/sora-emblem-source.png`), clipped to its circle and centred on its object. |
| `materials.ts` | Twelve shared materials, the lit-window shader, the mood-driven emitters and the render clock for neon, chasing bulbs and cloth. |
| `nightlife.ts` | Neon blades and rooftop neon, nobori, hanging banners, window neon and aviation lights, each from the lot's second random stream so a building keeps its look. |
| `people.ts` | The 1986 street people as camera-facing pixel-art sprites with soft ground shadows: per-district casts, walkers and friends, knots at the crossings, police signalling, fans cheering at the start, bosozoku gangs by their bikes, cats and cyclists. |
| `street-sprites.ts` | The sprite atlas layout (`public/assets/sprites/street-people.png`): rows, frame columns per layout, scale and baseline. |
| `sprites.ts` | Code-drawn fallback sprites, used by the atlas build for any sheet not yet generated. |
| `street.ts` | Crossings, footbridges, guide signs, shopping-street lamps and SORA's banners across the road. |
| `skyline.ts` | Distant real towers placed in their true directions. |
| `sky.ts` | SORA's airship over the road ahead, ad balloons trailing banners over tall roofs, and searchlights at night. |
| `index.ts` | `PeriodCity`: per-chunk streaming, shop-light fixtures, planting tests. |

**Districts** (`TOKYO_1986_DISTRICTS`, by the route's own `sector` field; the loop runs counter-clockwise, so the palace is on the driver's left):

| Sector | Right | Left |
|---|---|---|
| 0 Manaita Bridge – Kudanshita | Kanda mixed | Kanda mixed |
| 1 Yasukuni-dori | Shrine front (stone fence, lanterns, the Shinmei-style great steel torii 神明鳥居) | Kitanomaru park |
| 2 Chidorigafuchi | Ichibancho residential | Moat |
| 3 Hanzomon – Miyakezaka | Offices | Moat |
| 4 Diet front | Government | Government |
| 5 Kasumigaseki – Sakuradamon | Government | Moat |
| 6 Hibiya | Offices | Moat |
| 7 Wadakura – Takebashi | Offices (Marunouchi, Otemachi) | Moat |
| 8 Back into Kanda | Kanda mixed | Kanda mixed |

**Typologies:**
- Kanban-kenchiku shop-houses: copper, mortar, tile or sheet false fronts.
- Machiya: timber lattice, pent roof, tiled eaves.
- Zakkyo tenant buildings: a stacked vertical sign with one panel per floor, tenant names on the glass, rooftop tanks and billboards, escape stairs.
- Offices: ribbon, punched or curtain-wall facades, held to the Marunouchi 31 m line in the frontage.
- Mansions: balconies, air-conditioner units, futons.
- Ministries: stone or 1890s red brick, a portico and a forecourt wall.
- Others: pachinko halls, petrol stations and monthly car parks.

Back rows stand progressively taller, so the skyline layers. Lot frontages, depths, storeys, cladding, window rhythm, signage and rooftop plant are all drawn from each lot's own seed. On the full route, 787 lots give 787 distinct envelopes (a unit test holds this above 97%).

**Moats:**
- A grass verge and a dressed-stone curb with a rail.
- A bank down to dark water 3.2 m below the road.
- The battered stone wall (石垣) up to 6.2 m, with white plaster walls (塀) along some stretches.
- A white turret (櫓) halfway along each long run.
- Woods on the far bank and pines on the curb, from the existing tree pools.

The urban ground is cut under moats, parks and the river (`createUrbanGround(..., exclude)`). The pixel pass treats the water as wet ground, so lamp columns and reflections appear on it. The water shares the road's specular ceilings, so the key light never mirrors as a sheet.

**Manaita Bridge crossing** (`TOKYO_1986_CROSSINGS`): the Shuto Expressway rode above the Nihonbashi River, which the route crosses at the start line.
- A walled river channel, with ornamental lamps at the bridge corners.
- T-piers stand in the river, never in the street.
- Sodium lamps line the deck.
- A SORA board on the fascia faces arriving drivers.

**Skyline:**
- Tokyo Tower: its 1986 edge bulbs (the floodlighting came in 1989), decks and aviation lights.
- Kasumigaseki Building, World Trade Center, ARK Mori Building (1986), Akasaka Prince, Hotel New Otani, Sunshine 60 and eight Shinjuku west-side towers.

Each tower is drawn at most 520 m from the camera in its true direction, scaled to its true angular size, so it never meets the 600 m far plane or the fog. Positions are approximate (WGS84, tens of metres). The route projection itself matches real gate positions to within 40–220 m.

**Light** (`setPeriodCityLighting`, called with the existing `WINDOW_LIGHTS` mood values):
- Window panes carry a seed and a class: home (warm, a few TV-blue), office (lavender fluorescent, lit floor by floor), shop, or a dim lobby.
- Large panes are held dimmer, so lit floors and shop fronts quantise to amber and lavender palette entries, not cream boards.
- Signs are lit acrylic (`PERIOD_SIGN_GAIN`).
- Bulbs, red lanterns, canopy lights and vending machines use the lamp material.
- Shop fronts publish fixtures that feed the race's five shop spot lights, so their pools reach the pavement.

## 1986 landmarks

`landmarks.ts` builds famous buildings that stood in 1986. Each is simplified to the massing, rhythm and colour that read at the art grid. They stand at their places on the routes (`TOKYO_1986_LANDMARKS`, `ARCADE_1986_LANDMARKS`), each with its footprint reserved before any lot is placed.

Tokyo:

| Building | Route place |
|---|---|
| Kudan Kaikan (1934): the "imperial crown" style | by Kudanshita |
| Nippon Budokan (1964): an octagonal hall, gold giboshi | inside Kitanomaru Park |
| Hanzomon (palace gate) | across a moat causeway |
| National Theatre (1966): the battened storehouse | Hayabusacho |
| National Diet Building (1936): granite wings, portico, stepped-pyramid tower, a forecourt with lawns | the Diet front |
| Ministry of Justice (1895): red brick, slate, dormers | Kasumigaseki |
| Metropolitan Police headquarters (1980): slab and antenna mast | Sakuradamon |
| Sakuradamon: Korai-mon and white gatehouse | across a moat causeway |
| Nijubashi: the double-arched granite bridge to the main gate, six lit iron lanterns, the Fushimi turret | across the moat beyond Sakuradamon |
| Dai-ichi Seimei Building (1938): granite colonnade | the Hibiya moat |
| Tokyo Kaijo Building (1974): the dark red-brown tower above the 31 m line | Marunouchi |
| Palace Side Building (1966): louvres, white cylinders | Takebashi |

On the skyline, Mt. Fuji now stands about 95 km away in its true direction, and Nikolai Cathedral's green dome (1891, dome rebuilt 1929) stands at Surugadai.

Arcade:

- Yokohama:
  - the "three towers": Jack (1917, red brick and clock), Queen (1934, Customs, green dome) and King (1928, Prefectural Office), ahead of the Marine Tower and the liner;
  - the Hotel New Grand (1927), with its arched ground floor and cornice;
  - Chinatown's Zenrinmon gate: red pillars and green-tiled roofs.
- Nikko:
  - the 1912 JR Nikko Station (white clapboard, green trim, clock gable);
  - a five-storey pagoda among the cedars, and Nantai-san on the horizon.
- Hakone: the Fujiya Hotel (1891), a Western hotel under Japanese roofs, with its 1936 Flower Palace wing; Mt. Fuji over the pass.

The Palace Side Building is shortened (about 104 m against its real 200 m) to fit the route's bend at Takebashi. Positions follow the route's authored gates, not a survey.

**Floodlighting.** The `floodlit` material washes upright faces warm, brightest at their foot and fading up the facade, on with the night lights and off toward sunrise (`PERIOD_FLOODLIGHTS`). It covers the Diet, the Budokan, Kudan Kaikan, Dai-ichi, the Justice ministry, the palace gatehouse and turret, the Yokohama towers, the Marine Tower, the pagoda and the Shinkyo. These landmarks read at night as the cutscenes' lit buildings do.

## Weather, seasons and street life

- **Hakone, winter night:** snowfall on the art grid (`drawAtmosphere(..., 'snow')`: three depth layers swaying on the course wind). Lying snow whitens every upward face the city builds (`CityMeshBuilder.snow`): roofs, awnings, slabs, sills and parked cars. Plowed snow banks line both roadsides.
- **Nikko, spring sunrise:** cherry trees in a blossom material line the roads. They glow softly when backlit at sunrise and when lit at night. Petals blow across the frame in gusts, tumbling between cell shapes (`'blossom'`).
- **Tokyo, Chidorigafuchi:** the moat curb is planted with the cherries, and petals drift there, easing in and out over 120 m (`chidorigafuchi()`, street renderer).
- **Street life:** in front of street-level shops:
  - lit green-roofed phone booths;
  - red post boxes;
  - lit standing signs (電飾看板);
  - potted plants;
  - in Kanda, Jimbocho booksellers' carts of spines with 古書 boards.
- **Weathering:** 1980s concrete and tile carry rain streaks below the sills.
- **Shop interiors:** shop fronts and petrol-station kiosks are lit with fluorescent tubes and shelves of softly glowing, colourful goods. Office ribbon windows have mullions.
- **Route furniture** (`street.ts`):
  - **Zebra crossings:** with horizontal signals showing green, on straights away from landmarks, rivers and footbridges, at least 120 m apart (a neighbourhood rule that is chunk-independent): 10 on Tokyo's loop, 4 each on Hakone and Yokohama, 1 on Nikko.
  - **Footbridges (歩道橋):** blue steel, with stairs and a place-name plate, at hand-placed spots (`TOKYO_1986_STREET`, `ARCADE_1986_STREET`).
  - **Overhead guide signs:** blue, with real destinations (九段下 / 皇居, 半蔵門, 霞が関 / 日比谷, 大手町 / 東京駅, 神保町 / 御茶ノ水, 箱根 / 小田原, 山下公園 / 横浜駅, 日光 / 中禅寺湖).
  - **Shopping-street lamps:** globes and banners along Kanda, Hakone's onsen streets and Nikko's street.

Overlays draw only over the race (not in the mood captures, which grab the WebGL layer). Rain still takes precedence, and reduced motion freezes the particles.

## Neon, crowds and SORA on the street

The cutscenes' streets are busy, lit and branded; the race's now are too.

- **Street people** (`people.ts`) are pixel-art sprites in the cutscenes' style, one instanced quad each (up to 420 within 40 m behind and 230 m ahead of the player) with a soft shadow at the feet. Each sprite turns to the camera and shows its front, back or side for the way it faces (the side mirrored for the other direction), walking, cheering, signalling and pedalling on the render clock. They keep to the pavement (1 to 1.6 m beyond the road edge, behind the guard rail) or stand before the shop fronts. Each station is seeded by course position, so the same lap shows the same people.
  - **The cast** (`street-sprites.ts`): salarymen in suits and trench coats, a drunk one with his tie round his head and a boxed sushi gift, office ladies, police officers, sailor-uniform schoolgirls and a long-skirted sukeban, gakuran schoolboys, bosozoku in embroidered tokkofuku (white and black), SORA's crew in teal and fans in SORA tees, an 80s girl in a pastel jacket, a denim boy, obaachan in apron and headscarf, a housewife with leeks, an old man in a flat cap, yukata strollers, dock workers in hard hats, tourists with cameras, calico, orange-tabby and black cats, mamachari cyclists and two bosozoku bikes.
  - **By district:** Kanda's shopping streets are busiest and most mixed; offices and ministries are salarymen, office ladies and police; the backstreets have shoppers, obaachan, schoolchildren and more cats; Hakone strolls in yukata; Nikko has tourists and school trips; Yokohama's quay has dock workers. Friends walk side by side on opposite feet; others stop in twos and threes to talk.
  - **At the crossings:** three to six people wait at every zebra crossing; at a third of them a police officer signals traffic from the corner, and the odd fan cheers the race.
  - **At the start:** fans line both kerbs two deep, most waving SORA's flag overhead, with the crew among them.
  - **Bosozoku** gather at least 150 m apart in Kanda, the backstreets and the harbour: one or two parked bikes (tall backrests, takeyari pipes) with two to four of the gang squatting or standing about.
  - **Cats** sit, curl up or prowl before the shops, drawn half as large again as life so they read from the road. **Cyclists** ride the town pavements either way.
  - At night the shop light and signs lift the sprites a little (`cityNight`).
- **Neon** (`nightlife.ts`, second atlas): tube signs (BAR, スナック, カラオケ, COFFEE, GAME, DISCO, HOTEL, CLUB, PUB, 麻雀, 焼肉, パチンコ, LIVE, 喫茶, ラーメン and SORA, the emblem centred in a neon ring) on dark boards.
  - Tenant buildings hang **neon blades** from the corner, floor above floor, thickest in Kanda, the onsen town, the harbour and the backstreets.
  - **Rooftop neon** stands on steel frames turned toward approaching drivers, with chasing bulbs along the catwalk. Pachinko halls carry パチンコ or GAME.
  - Coffee shops and bars show **window neon** inside the glass.
  - **Vertical neon** (縦型ネオン): bar buildings in Kanda, the backstreets, the onsen town and the harbour hang tall vertical signs at the corner (スナック, カラオケ, 喫茶, 麻雀, 居酒屋, 中古レコード, ホテル, クラブ, ディスコ and SORA's, the emblem in a neon ring above the name). Pachinko halls add a tall パチンコ down the far corner.
  - Neon flickers, drops out for a moment now and then, and some signs blink. More than half the vertical signs, and about a third of the blades and rooftop boards, **spell themselves out** letter by letter (down a vertical sign, left to right on a board), hold, flash, go dark and start again (`neonSignMaterial`, mode 2 or 3 in the vertex colour's green).
- **Animation:** pachinko marquees and rooftop catwalks run **chasing bulbs** (the lamp material's UV channel carries phase and mode). Offices taller than 28 m blink red **aviation lights**. **Nobori** ripple from their poles, street banners sway between their ties, and hanging banners barely stir. Reduced motion stops the clock.
- **Nobori** (幟) before street-level shops, by district and trade: Kanda's ラーメン, 焼き鳥 and 大売出し; Hakone's 温泉, 饅頭 and 寄木; Nikko's 湯波 and 羊羹. Pachinko halls line the pavement with 新装開店, petrol stations fly sale flags, and ryokan gates fly 温泉.
- **SORA everywhere**, always the exact emblem, centred:
  - cloth banners strung across the road (`SORA ⦿ CARS`, `SORA ⦿ 1986`, `ソラ ⦿ SORA`, `SORA ⦿ RACING`), at least 120 m apart in town (16 on Tokyo's loop);
  - every other shopping-street lamp flies a red SORA banner turned to face drivers;
  - about a quarter of the nobori, a seventh of the neon, and three in ten rooftop neons are SORA's;
  - SORA boards on footbridge railings either side of the name plate;
  - SORA banners hung down office fronts (懸垂幕);
  - a larger share of SORA boards on rooftop billboards;
  - on the cars, a SORA roundel on the roof (read from the chase camera) and the bonnet, beside the existing door flags, and a club strip across the top of the rear window, `SORA ⦿ MOTOR CLUB` with the emblem centred (`src/game/three/sora-emblem.ts`, `asset-car.ts`);
  - fans' hand flags are SORA's flag, and the crew's and fans' backs carry the emblem, centred;
  - **SORA's airship** (飛行船, `sky.ts`) holds over the road 260-420 m ahead of the leaders, about 90 m up, like a broadcast blimp following the race. It has a white envelope, red tail fins and a gondola. Each flank carries `SORA ⦿ CARS` with the exact emblem centred, reading the right way from either side. After dark the print glows, the gondola windows light and the tail strobe blinks. It is drawn at most 460 m from the camera in its true direction, scaled to its true size, as the skyline is;
  - **ad balloons** (アドバルーン) ride 38-50 m above tall frontage roofs in Kanda, the offices, backstreets, harbour and onsen town, at least 240 m apart. Each trails a banner, SORA's on every other one and shops' sale banners on the rest. They sway on their tethers, the cloth ripples, and after dark balloon and banner are floodlit. They are a little larger than life (6 m) so they read above the roofline from far down the road.
- **Searchlights:** after dark, pairs of beams sweep and cross the sky from club roofs in Kanda, the harbour and the onsen town. They are soft-edged additive cones, brightest where they face the camera, fading upward.

### How the sprites are made

The user asked for the street people as sprites of Japanese archetypes. The
29 sheets in `art/street-sprites/` were drawn by Codex's image model
(`gpt-6-astra`, `image_gen`, transparent background) from the cutscenes
`community-dawn-v1.png` and `angles/harbor-wide-v3.png` as style references,
with the SORA flag and emblem as references for the fans and crew, and earlier
sheets as references for each character's action sheet. Prompts, sources and
references are in `docs/art-prompts/street-sprites-v1.json`.

- **Walk sheets** are 4 x 3: front (standing, left foot, passing, right foot), back, then a four-frame side walk.
- **Action sheets** carry fans' cheers, police signals, bosozoku squats, extra cat poses, cyclists and bikes; each includes a standing figure for scale.
- `npx tsx scripts/build-street-sprites.ts [--review out.png]` builds the atlas:
  1. It cuts each sheet along the emptiest lines near its nominal grid lines, because image models keep only roughly to a grid.
  2. It box-filters each figure down to the atlas scale: a 1.70 m adult is 78 pixels in a 48 x 96 cell, and wide poses take two cells.
  3. It sets the feet on row 93 and centres the head.
  4. Any sheet not yet made falls back to the code-drawn sprites (`sprites.ts`), enlarged x1.5. The script will not overwrite the atlas while a sheet is missing unless given `--allow-stand-ins`.

## Arcade courses

Each Arcade course is three laps unrolled, so `ARCADE_1986_DISTRICTS` repeats
blocks of district (300-360 m) that never line up with a lap.

- **Midnight Circuit (Hakone, night):** onsen towns between the pass's forests. Ryokan have lit shoji, verandas, tiled pent roofs, noren, red lanterns and 旅館, 民宿 or ♨ signs. Concrete 1970s hot-spring hotels carry rooftop neon (ホテル 湯の花) and stacked ホテル signs. There are yosegi and manjū souvenir shops and farm hamlets.
- **Harbor Run (Yokohama, night):** the left side is mostly quay: bollards, a dressed-stone edge and dark water out to the painted harbour shore and cranes. The right side has red-brick, corrugated and concrete warehouses carrying operators' names (三栄海運, 北辰物産, SORA 海運), container yards under floodlight masts, crates and drums on the aprons, and a Kannai block. `ARCADE_1986_LANDMARKS` adds the Marine Tower (1961), red and white with its lit deck and beacon, and a moored liner, みなと丸 after the harbour cutscene, dressed overall in strings of bulbs. The Bay Bridge (1989) is deliberately absent.
- **Sakura Pass (Nikko, sunrise):** the old street of machiya, shop-houses and ryokan (湯波 and 羊羹 shops), 1980s houses with glazed blue or brown tile roofs and block walls, cedar and broadleaf forest. Near the start, the vermilion Shinkyo (神橋) arches over a rocky gorge beside the road bridge.

Towns stand on the flat strip before the banks rise (18 m), and back rows follow the terrain. Forest districts keep the race's own tree pools and their stone retaining walls. In harbour districts the hills are skipped (`createTerrain(..., skip)`) and the flat ribbon stops at the quay edge. The Nikko gorge cuts both ribbon and banks.

## Streaming and cost

- The layout is built once per course.
- Geometry is built per 80 m chunk, one merged mesh per material, nearest chunk first, at most one chunk per frame (all at once on a course start or seek).
- Hidden chunks are kept for reversing and laps, then disposed.
- One `compileAsync` per course, against an HDR target and after `prepareSpotlightEarlyOut`, compiles every pooled material up front. Trees, understory and distant cars no longer compile on first sight mid-lap.

Measured with `tmp/pixel-art/capture.mjs --modes street --sizes 1920x1080 --query picture=pixel --timing-steps 150` (M4 Max, both runs in one session):

| City | Median frame | GPU | Draw calls | Triangles |
|---|---|---|---|---|
| Classic (`?city=classic`) | 29.4 ms | 21.7 ms | ~2,020 | ~17.6 M |
| Period | 20.2 ms | 15.0 ms | ~540 | ~4.7 M |

After the crowds, neon and banners (2026-10-29, host load average about 22-26, so read loosely): period 18.9 ms median frame, 13.7 ms GPU, about 590 draw calls and 5.6 M triangles at 1080p. At 1280x720, Tokyo ran 16.5 ms (8.2 ms GPU) and Midnight Circuit 18.6 ms (12.2 ms GPU), both at 60 fps.

With the airship, balloons, searchlights and vertical neon (2026-10-29, host load average about 24-28): at 1280x720, Tokyo ran 60 fps (9.6 ms median frame callback, 11 ms GPU, about 400 draw calls in the live loop). Midnight Circuit ran 55.7 fps with the sky and 55.7 fps without it (19.5 ms against 20.3 ms GPU): the sky adds about 24 draw calls and no measurable GPU time.

With the sprite crowd (2026-10-29, host load average about 60, so read loosely): at 1280x720, Tokyo held 59 fps in the real loop (14.9 ms median frame callback, 10.7 ms GPU, about 594 draw calls and 5.6 M triangles, the same as before). Midnight Circuit dropped to 42 fps, with 15-20 M triangles there, mostly the cars. The sprites add two instanced draws, and the old 3D figures are gone.

On Midnight Circuit, measured the same way under heavy host load (1-minute load average about 10, so read the ratio rather than the times), the median frame went from 58.9 ms (classic) to 49.9 ms (period), with draw calls from about 710 to 575.

## Verification

- `npx tsx --test tests/period-city.test.ts` checks: determinism, no overlapping lots (an independent SAT check), nothing on the road or its sidewalk, the open palace side, the ground cut, district character, envelope variety, Kanda frontage continuity, the river corridor, and per-chunk geometry budgets. For each Arcade course it also checks clearance from the road and between lots, open forests and quays, reserved landmark ground, Yokohama's left-hand quays, and landmark geometry.
- The city, ground, tree, road-finish and pixel-art suites still pass. The exception is `pixel-art-linework`'s night-clump palette test, which also fails without these changes: its expected `#2d3252` is no longer in the palette.
- Captures of all nine Tokyo sectors at night, dusk and sunrise, every landmark, the Hakone onsen street in snow, the Yokohama quay, liner, towers and Marine Tower, and Nikko's street, cherries, Shinkyo and pagoda (with overlays, in full-page captures) were judged against the cutscene art.
- A landmark test checks that every landmark keeps clear of the route and of all lots, and draws its geometry.
- Street-life tests check several things:
  - The crowd keeps to the pavements (measured to the centre line between poses), is busiest in Kanda, is placed the same for the same clock and moves with it.
  - People wait at every crossing.
  - Kanda builds neon and cloth within the chunk budget (street furniture counts toward it), with at least ten street banners on the loop.
  - The SORA shares of nobori and neon.
  - Each district brings its people: salarymen, police signalling, schoolchildren, fans, crew, bosozoku, cats and cyclists in Tokyo, and yukata, dock workers and tourists in the Arcade towns.
  - The shipped atlas has every frame the shader can pick, each standing on the baseline.
  - Kanda hangs vertical neon, and at least a sixth of its neon faces spell themselves out.
  - The sky flies at least three ad balloons, each more than 20 m above the street, and at least one searchlight on Tokyo's loop. The same clock places the same sky, and the balloons sway.
  - 18 tests in all.

## Known limits

- Tokyo Tower and Mt. Fuji are mostly hidden by the palace woods or the city, as they largely were in life; they show only down open avenues.
- The shrine front is dark at night apart from its stone lanterns.
- The street people are flat sprites. Up close, a turn of the camera switches a sprite between its front, back and side, with no angles between, and their pixels show larger than the screen's art pixels. Nobody crosses the road, and parked cars are not modelled.
- The ad balloons hang over the roadside buildings, so the nearer roofs hide them until they are a few hundred metres ahead, where they are small. The airship keeps station with the leaders rather than flying a fixed course of its own.
- The emblem on the generated fans' and crew's clothes and flags was drawn by the image model from the exact emblem as a reference. It reads correctly at sprite size, but it is not a paste of the source file.
- The opponent cars' paint compiles about eight seconds into a race in both cities (a car-material key change). That is outside the city.
