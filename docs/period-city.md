# SORA CARS — the 1986 period city

Status (2026-10-29): the default city for the five street routes (Tokyo,
Irohazaka, Aizu-Wakamatsu, Kyoto and Nara) and all three Arcade courses. The race's pixel-art renderer
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
| `open-ground.ts` | Moat, park, shrine, temple and pond cross-sections that follow the route; the expressway, river and gorge crossings; the yagura and the torii. |
| `signs.ts` | Two canvas atlases of original period signage: shop signs, boards and guide signs; then neon tube signs, nobori and street banners. Every SORA design draws the exact emblem (`branding/sora-emblem-source.png`), clipped to its circle and centred on its object. |
| `materials.ts` | Twelve shared materials, the lit-window shader, the mood-driven emitters and the render clock for neon, chasing bulbs and cloth. |
| `nightlife.ts` | Neon blades and rooftop neon, nobori, hanging banners, window neon and aviation lights, each from the lot's second random stream so a building keeps its look. |
| `people.ts` | The 1986 street people as camera-facing pixel-art sprites with soft ground shadows: per-district casts, walkers and friends, knots at the crossings, police signalling, fans cheering at the start, bosozoku gangs by their bikes, cats and cyclists. |
| `street-sprites.ts` | The sprite atlas layout (`public/assets/sprites/street-people.png`): rows, frame columns per layout, scale and baseline. |
| `sprites.ts` | Code-drawn fallback sprites, used by the atlas build for any sheet not yet generated. |
| `street.ts` | Crossings, footbridges, guide signs, kana curve boards, arches over the road, shopping-street lamps and SORA's banners across the road. |
| `skyline.ts` | Distant real towers, mountains and far landmark silhouettes placed in their true directions. |
| `sky.ts` | SORA's airship over the road ahead, ad balloons trailing banners over tall roofs, and searchlights at night. |
| `index.ts` | `PeriodCity`: per-chunk streaming, shop-light fixtures, planting tests. |
| `street-scenes.ts` | How each street route is dressed: districts by sector, landmarks, crossings, street furniture, far silhouettes, trees, sign pool and light. |

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
- Hibiya's three towers beyond the park: Fukoku Seimei (1980), Hibiya Kokusai (1981) and the Imperial Hotel's tower (1983), heights approximate. From the route they show only between Kasumigaseki's buildings.

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
37 sheets in `art/street-sprites/` were drawn by Codex's image model
(`gpt-6-astra`, `image_gen`, transparent background) from the cutscenes
`community-dawn-v1.png` and `angles/harbor-wide-v3.png` as style references,
with the SORA flag and emblem as references for the fans and crew, and earlier
sheets as references for each character's action sheet. Prompts, sources and
references are in `docs/art-prompts/street-sprites-v1.json`.

- **Walk sheets** are 4 x 3: front (standing, left foot, passing, right foot), back, then a four-frame side walk.
- **Action sheets** carry fans' cheers, police signals, bosozoku squats, extra cat poses, cyclists and bikes; each includes a standing figure for scale.
- `npx tsx scripts/build-street-sprites.ts [--review out.png]` builds the atlas:
  1. It cuts each sheet along the emptiest lines near its nominal grid lines, because image models keep only roughly to a grid.
  2. It box-filters each figure down to the atlas scale: a 1.70 m adult is 78 pixels in a 64 x 96 cell, and wide poses take two cells.
  3. It sets the feet on row 93 and centres the head.
  4. Any sheet not yet made falls back to the code-drawn sprites (`sprites.ts`), enlarged x1.5. The script will not overwrite the atlas while a sheet is missing unless given `--allow-stand-ins`.

## Refine round 4: closer to the rain-night target (2026-10-29)

Measured against the user's target image (`art/reference/rain-night-target.png`; renderer changes are in [the pixel-art notes](pixel-art-renderer.md)):

- **Wall finishes** (`geometry.ts` `WALL_PATTERN`): tile (二丁掛け), brick, vertical seams, cladding panels, mosaic tile and siding.
  - Each typology picks one: tile and mosaic tenant buildings and offices, seamed copper and sheet fronts, brick ministries and warehouses, mosaic mansions, sided houses.
  - The wall shader draws the joints at least one art cell wide, so they survive the pixel pass as courses. Each tile is a shade apart, and the joints fade out where they would fall closer than about four cells.
  - Walls darken by up to 42% at night, so the lit windows and signs carry the night. Floodlit landmark stone shows staggered blocks under a softer wash.
- **Lit windows** draw their rooms in flat steps:
  - offices have a bright ceiling band over the desks, some with blinds;
  - homes have curtains drawn to the sides, a plant on some sills and blinds on others;
  - every window has its cross mullion;
  - lit panes no longer mirror the sky, and office windows are now mostly warm, about a quarter fluorescent blue.
- **Street trees:** a row of young trees along Kanda's kerbs, clear of the shopping-street lamps.
- **Windows as the concept paints them (fourth pass):** a window small on screen is warm amber light with one clear silhouette (a potted plant on the sill, someone at a desk, a standard lamp, or drawn curtains) and the evening sky caught in soft streaks across its upper glass. Only shop windows, and windows very near the camera, show a whole room from the interiors atlas; shrunk to a few cells a room turned to noise. Office light is a paler warm white, never blue; a few homes keep the TV's blue.
- **Shop-front lights** (fifth pass), from two new rows of the neon atlas (`signs.ts`):
  - **Paper lanterns** (赤提灯) printed with やきとり, 酒, おでん, 居酒屋, ラーメン, 焼肉, 寿司 or SORA (the exact emblem, centred), drawn as eight-sided prisms lit from within. They burn steadily: the neon material's mode 4 skips the tube flicker and dropout. More doors on the shopping streets and in the nightlife districts hang them.
  - **Lit box signs** (行灯看板) of one or two characters (酒, 焼鳥, 喫茶, 質, 湯, 麺, 薬, 本, 酒場, BAR and others, and SORA) stand out from the shop's outer edge on half the shops in those districts, clear of the awning.
  - The vertical neon's reveal now reads its row's own top and bottom (`VNEON_TOP_V`, `VNEON_BOTTOM_V`), since the new rows sit below it.
  - The shopping and nightlife streets hang lanterns at about four in five shophouse and zakkyo doors (the street-life stream, so buildings are unchanged): rows of red lights down the street, as in the concept.
- **Utility poles and overhead wires** (電柱と電線, eighteenth pass, `street.ts`). Every cutscene street is strung with poles and wires, silhouetted against the sky. Kanda, the backstreets, towns, onsen streets, Nikko and the harbour now carry a concrete pole at the kerb every 32 m on each side (the two sides staggered), with its crossarm and insulators, a transformer can on about a third, and a number plate at eye height; three wires run from each crossarm to the next pole on its side and a heavier cable below, sagging between, and from about half the left poles a wire crosses the road to the next pole opposite. The wires are screen-space lines (`wires.ts`, three's `LineSegments2`, eight segments per sagging span) kept 1.3 art cells wide at every distance, fitted to the target being drawn: as modelled ribbons (4.5-7 cm) they fell below an art cell beyond about 30 m and broke up, where the cutscenes draw unbroken one-pixel wires to the vanishing point. Poles keep clear of crossings, footbridges and guide signs, and of a landmark's front only on its own side and only where it comes within 2 m of the kerb (the first rule barred both pavements for Kudan Kaikan's whole 70 m front). Marunouchi and Kasumigaseki, whose lines ran underground, have none. On the autumn routes' town streets (Aizu, Kyoto, Nara) two lower telephone and cable-TV lines run from pole to pole as well, at 5.6 and 5.1 m on clamps, sagging more than the power lines, as their cutscenes and repaints string five or six wires over every street. About a third of those poles also carry a crime-prevention light (防犯灯) on a short arm over the kerb, lit after dark, as the Nanokamachi repaint hangs one on its pole. These extras are kept off Tokyo's streets.
- **Facade fittings** (eighteenth pass): a rain downpipe with brackets down one front corner of three in five frontage buildings, and small rain hoods (霧除け) over the windows of a third of the homes, chosen by the lot's seed (no draw from its streams, so buildings and street life are otherwise unchanged).
- **More fittings and clutter** (nineteenth pass): an air conditioner under about a fifth of the frontage's upper home windows (one in twelve on offices), by a hash of the lot, floor and window; every air conditioner has its covered refrigerant pipe up the wall and a drain hose down it. Shop fronts wider than 3.2 m take clutter by their corners from the street-life stream: a mamachari parked along the facade (flat octagonal wheels, step-through frame, saddle, basket, drawn as thin quads), stacked beer crates, a blue bin, or an A-board with a vertical print. Walls carry a darker, ragged splash band along their foot and faint vertical run-off streaks (`pigmented`). The clutter mostly sits below the pavement's guard rail from the chase camera, so it shows most where the rail breaks.
- **Matching every environment** (twenty-third pass; see [the renderer](pixel-art-renderer.md)). Hakone's inns light their street floors: either side of the entrance, warm shoji (a lamp face) behind a timber lattice of bars 24 cm apart with a rail across, where a timber wall read as a long dark front against the repaint's lit arcade. Stone walls (the palace moat's ishigaki) draw staggered blocks about a metre high in their own shader, and both stone and tiled walls fade their upright joints and their courses on separate footprints, so a wall seen at a grazing angle along the road keeps its horizontal courses where the upright joints crowd out. Frontage flanks carry windows on seven in ten grid positions (was two in five).
- **Rooms in the lit windows** (twenty-second pass, the glass material). Against the repaint's windows, each a lit room, ours were flat amber panes with a faint silhouette and pale glare streaks. Small windows (those the interiors atlas does not fill) now draw a room: a ceiling lamp (a bright oval near the top of one sash, its light spread round it), the room darker toward the floor, and in place of the dark silhouettes their own colours: potted plants with lacy dark-green leaves lit on top over a terracotta pot (a second pot on some windows), curtains of warm fabric with folds (cream-gold, pink or green), a standard lamp whose shade glows, a sideboard along the bottom catching the lamp, or someone at a table. The glare streaks fade to a quarter after dark. Measured, the lit windows' colour already matched the repaint's (OKLab L 0.79, chroma 0.10, hue 72 against 0.78, 0.13, 69).
- **Facade relief** (twentieth pass, `pigmented` in `materials.ts`). The cutscenes' facades are corrugated sheet, lapped boards and weathered mortar; ours were flat colour with joints. Sheet-metal fronts (`WALL_PATTERN.seams`) now draw corrugated ribs between their seams, 16 cm apart (coarser than real sheet, as the cutscenes draw it, so they read to about 40 m): a lit crest, its flank, a shadowed valley. Wooden siding draws each board's shadow on the one below and grain streaks along it. Plain mortar and timber take broad, bilinear weathering stains about a metre across. Relief fades out wherever it would crowd closer than about three art cells a period, and is stronger after dark (as the tile grid is), so lamps and shop light pick it out of the dark walls.
- **Vertical Japanese** (`verticalCharacter` in `signs.ts`). Canvas text has no vertical writing mode, and stacking characters one under another left ラーメン's long-vowel mark lying across the nobori. In every vertical print (shop signs, nobori, lanterns, box signs, vertical neon) the long-vowel mark, dashes, wave dashes, ellipses and brackets now turn upright, and small kana and punctuation move toward the upper right of their cell, as vertical type sets them. Horizontal prints (awnings, noren, banners) keep the horizontal forms.
- **Noren** (fifteenth pass, `awnings.ts`, `shopNoren` in `buildings.ts`). The cutscene-style repaint hangs a split cloth curtain in its eatery's doorway. Twelve noren designs share the awning atlas and material: solid cloth (indigo most of all, then maroon, plum, dark green, brown), one cream character per panel with a dark outline, slits cut through the alpha, a one-character word (酒) spanning two panels with the slit through it. Each print is the left part of its cell at the cloth's own proportions (panels of 0.55 m, 0.72 m tall), so the characters are never stretched. An open eatery (its fascia title names a trade: そば, 寿司, やきとり, 居酒屋, ラーメン, おでん, 天ぷら, うどん, 甘味, 食堂, 酒) hangs its own noren from a rod just inside the doorway; on the shopping and nightlife streets two in five other open shops hang a generic one (酒, めし, おでん, やきとり, そば). Only where no awning hangs: a steep awning hid the doorway, so an eatery on the shopping street now takes its noren instead of the street's extra awning. All from the street-life stream, so buildings are unchanged. In the first 1.2 km of the route, eleven shops hang noren; from the road they often sit behind the street banners and lanterns, and read clearly within about 20 m.
- **Slate facades at night** (twelfth pass). A cutscene-style repaint of a race frame (`art/reference/mockups/kanda-night-l095-v1.png`) paints unlit facades as dark indigo-slate tile (OKLab L about 0.24, chroma 0.05, hue 285) whose grid reads all over; ours fell to flat dark plum (hue 339) where the grid vanished. After dark the wall pigment now turns 90% of the way to a cool slate grey (`wallSlate`; it was half way to grey-brown), the facades take a cool slate fill from the city's glow (`wallAmbient` 0.07, 0.075, 0.125 linear), and they lose 60% of their albedo (`wallNightCut`; it was 35%). The lamp wash dropped to 1.2 and less orange, since the repaint keeps the wall beside a lamp mostly slate. Windows are warmer (the office tone 1, 0.66, 0.38, so no pane reads cream-white), and two in five windows carry a plant on the sill (was three in ten).
- **Lamp wash** (ninth pass). The concept's tile glows warm around each street lamp while the wall above and between the lamps stays dark. Ours stayed dark: the lamps' pool lights are spots pointing down (60° half-angle), and a facade 4 m back and 1.6 m below the head lies about 68° off their axis. Widening the cones would wash the road orange (refine round 1 rejected that for the harbour). Instead the wall material takes an analytic wash from the six nearest lamp heads (`setPeriodCityLampHeads`, from world.ts each frame): warm sodium light on the faces turned toward a head, falling off over 9 m and fading out 3 m above the head (a cobra head throws its light down), at full strength (`lampWash` 2) at night and none by day. It lights the tile grid beside the lamps, and costs six distance checks per wall pixel. Landmarks keep their own floodlit material and its wash.
- **Tile at night** (eighth pass). After dark a wall's finish grid carries more of the facade: the grout a shade deeper (34% → 50%), the tiles further apart (±5% → ±11%), and a lit cell under each course's upper joint, where lamps above catch the tile's edge. Unlit walls stay near-dark, so it reads where the shops, windows and lamps light the wall.
- **Lit flanks** (seventh pass). Down a straight street the camera sees the flanks of buildings that rise above their neighbours. "Japanese flanks are mostly blank" left those as dark slabs, where the concept paints the far city as layers of lit windows. The back rows (2-4: offices and mansions behind the street) now carry a window on every grid position of their flanks above 3.2 m, floor by floor; frontage flanks carry two in five, besides their stair windows; a flank with a painted advertisement keeps it clear. The glass lights them at night like the fronts (offices whole floors at a time). They come from the street-life stream, so each building is otherwise unchanged; the chunk triangle budget still holds.
- **Far lights** (`far-lights.ts`, sixth pass). The concept's street glows with lamp heads, lanterns and signs all the way to the vanishing point. Ours went dark in the distance, because a lamp globe 100 m away covers well under one art cell and the cell resolve averaged it into the night.
  - Every shopping-street globe, lantern and box sign now also leaves a beacon (`CityMeshBuilder.beacon`): a position, a linear HDR colour and the light's size.
  - Each chunk draws its beacons as one additive points object, at least two art cells across and bright enough for the glow stage's halo. The race's own street lamps get the same through `MovingFarLights`, refilled each frame.
  - Beacons fade in from 24 to 55 m, where a light's own geometry starts to fall below a few cells. They are pulled just in front of their globe or lantern so it never hides them, are depth tested so buildings do, and burn with the street's ground-floor light (`cityGroundLights`, 0 by day, 1 at night).
  - The globes themselves are HDR sodium gold (they were cream, below the glow stage's emitter threshold, so they never took a halo). Colours stay below the tone curve's shoulder so they read gold, not cream; the first try took the sign gain (`cityNight`, up to 2.4) and washed every far light to cream.
- **Every awning prints its trade**, now including 不動産, 歯科, 旅館, 墨 and SORA (the SORA garage); only warehouses keep plain stripes.
- **Vertical shop signs** stand a third deeper than life, so their lettering reads far down the street, as the concept paints them.
- **Night walls** lose half their warm colour toward a cool grey-brown, and so does floodlit landmark stone (Kudan Kaikan stood orange at the start); the lamps and shops put the warmth back where they shine. The floodlight wash is softer (0.55) and gone by 14 m.
- **Rooms behind the glass:** lit windows show a room from `public/assets/sprites/window-interiors.png`, built by `scripts/build-window-interiors.ts` from a Codex sheet (`art/interiors/window-interiors.png`, prompt in `docs/art-prompts/window-interiors-v1.json`). The atlas holds four offices, four homes, four eateries and bars, and four shops; each window picks one by its kind and seed. Homes lit by the television turn blue. Pachinko halls and station concourses are a separate `hall` kind that stays flat lit.
- **At night:** walls lose the dusk sky map's warm ambient light and a little albedo, so unlit facades fall to dark tile. Landmark floodlights now fade out by about 16 m up the facade, lighting landmarks from the foot instead of washing them orange to the roof.
- **Washing** hangs over balcony rails as separate shirts, towels and futons in their own colours (one big sheet under a street lamp read as a blank board). Awnings draw as plain canvas, not the facade's tiles.
- **Shop fronts** (the user asked to fix them against the concept's yakitori shop):
  - **Canvas awnings** (`awnings.ts`, the `awning` material) are mounted where the fascia would be. They are striped in the awning's colour over cream, printed with the shop's trade (やきとり, 寿司, そば, 喫茶, 居酒屋, and on the routes 漬物, 甘味, 扇子 and more, matched from the fascia's title), with a scalloped valance and an underside in shadow. The atlas holds masks (stripes, lettering, shading, scallops), so one design takes any awning colour.
  - Awnings slope about 52°, as real ones do. A gentler slope faced up enough for the pixel-art ground stage to treat it as wet road, which smeared it into sideways streaks at speed. A test keeps every awning normal below 0.8.
  - Shophouses keep their awning odds, tenant buildings theirs; on the shopping streets other open shops take one from their own random stream, so the rest of each building is unchanged.
  - The shop's room is the glass's (the interiors atlas). The tubes and shelves of glowing boxes in front of it are gone; they read as one cream band. Closed shutters are darker steel.
  - At night street lamps light facades and awnings less (direct light ×0.55 on walls, ×0.65 on awnings), so their pools stay on the pavement and road.
- **Sharper street people:** the sprite atlas is drawn at 1.5x (`SPRITE_SCALE`; a 1.70 m adult is 117 pixels in a 96 x 144 cell), so faces stay clear on the finer art grid.
- **Umbrellas:** two more Codex sheets, a salaryman under a black umbrella and an office worker under a clear vinyl one (`docs/art-prompts/street-sprites-v1.json`). When the road is wetter than 0.7, most salarymen, office ladies and housewives walk under them (Tokyo's night, Yokohama). The sprite cells are now 64 px wide so the canopies fit.
- A test checks that umbrellas open on a wet Kanda night and fold away on a drying road (19 city tests in all).

## Arcade courses

Each Arcade course is three laps unrolled, so `ARCADE_1986_DISTRICTS` repeats
blocks of district (300-360 m) that never line up with a lap.

- **Midnight Circuit (Hakone, night):** onsen towns between the pass's forests. Ryokan have lit shoji, verandas, tiled pent roofs, noren, red lanterns and 旅館, 民宿 or ♨ signs. Concrete 1970s hot-spring hotels carry rooftop neon (ホテル 湯の花) and stacked ホテル signs. There are yosegi and manjū souvenir shops and farm hamlets.
- **Harbor Run (Yokohama, night):** the left side is mostly quay: bollards, a dressed-stone edge and dark water out to the painted harbour shore and cranes. The right side has red-brick, corrugated and concrete warehouses carrying operators' names (三栄海運, 北辰物産, SORA 海運), container yards under floodlight masts, crates and drums on the aprons, and a Kannai block. `ARCADE_1986_LANDMARKS` adds the Marine Tower (1961), red and white with its lit deck and beacon, and a moored liner, みなと丸 after the harbour cutscene, dressed overall in strings of bulbs. The Bay Bridge (1989) is deliberately absent.
- **Sakura Pass (Nikko, sunrise):** the old street of machiya, shop-houses and ryokan (湯波 and 羊羹 shops), 1980s houses with glazed blue or brown tile roofs and block walls, cedar and broadleaf forest. Near the start, the vermilion Shinkyo (神橋) arches over a rocky gorge beside the road bridge.

Towns stand on the flat strip before the banks rise (18 m), and back rows follow the terrain. Forest districts keep the race's own tree pools and their stone retaining walls. In harbour districts the hills are skipped (`createTerrain(..., skip)`) and the flat ribbon stops at the quay edge. The Nikko gorge cuts both ribbon and banks.

## Local routes

The four routes added on 2026-10-29 (Irohazaka, Aizu-Wakamatsu, Kyoto and Nara; see [the world notes](../world/README.md#local-routes)) are dressed from `street-scenes.ts`. Each route has a `StreetScene` holding:

- the districts right and left of the road, indexed by the route's own `sector` field;
- landmarks, crossings and street furniture;
- far silhouettes;
- flowering or autumn trees;
- a regional sign pool;
- a light mood.

Only `world.ts` reads the scenes; the native road table and the physics never do. Tokyo's scene points at its existing tables, so Tokyo keeps its districts, landmarks, crossings and light.

**New districts** (`layout.ts`):

- **Town:** the low-rise provincial street. Shop-houses, machiya and houses stand in front, with a few tenant buildings, car parks and offices, two to four storeys high. Houses and mansions stand behind. Tokyo's residential district was too tall for these towns.
- **Temple** (`open-ground.ts` `temple()`): a Buddhist frontage. A tile-capped earthen wall (築地塀) with the five white rules of a high-ranking temple's 筋塀 runs behind a granite curb, with stone lanterns inside. It has no torii, so a temple never shows Yasukuni's.
- **Pond:** a stone edge, open water below the road, willows leaning over it and a grassy far bank (Sarusawa-ike and Daibutsu-ike in Nara, the castle park in Aizu).

The urban ground is cut under ponds and under forest runs, as it is under moats and parks.

**Crossings** now come in three kinds:

| Kind | What it draws | Where |
|---|---|---|
| Expressway | Tokyo's Manaita Bridge | Tokyo |
| `river` | A broad shallow city river between stone revetments and dry riverside walks (河原), with low parapets and bridge lamps | Kyoto: the Kamo at Shijō Ōhashi and at Marutamachi |
| `gorge` | A rocky ravine under the road bridge, its width set by the crossing's `half` | Irohazaka: Ōya-bashi over the Daiya and Chichinoki-bashi |

**Slope terrain** (`terrain.ts` `createSlopeTerrain`). A road that folds back on itself, like Irohazaka's stacked hairpins and Nara's Wakakusa switchbacks, cannot use the Arcade banks: the bank beside each leg would roof over the legs above and below it. Instead the ground is interpolated from every nearby road station (inverse-distance weighted, on a 6 m grid), so each leg sits just above its own cut and the hillside runs on between them. Gorges sink it under the bridges. Trees and lots are kept off the other legs (`clearOfOtherLegs`).

**Far silhouettes** (`skyline.ts` `PeriodDistant`) take a ground elevation `y`, because Irohazaka starts at 864 m. They can also take a `hideWithin` distance: a silhouette disappears inside that distance, where the real landmark of the same name is drawn instead, as Kyoto Tower is.

| Route | Silhouettes, at their real bearings |
|---|---|
| Irohazaka | Nantai-san (2,486 m) and Nyohō-san |
| Aizu-Wakamatsu | Bandai-san, and Tsuruga-jō's keep, which is still in view from the finish on Iimoriyama, where the Byakkotai looked back to it |
| Kyoto | Tōji's pagoda, Kyoto Tower, Yasaka's pagoda (Hōkan-ji, 1440) over Higashiyama's roofs, and Hiei-zan |
| Nara | The Ikoma ridge and its broadcast towers with their red lights; Yakushi-ji's two pagodas (the west one rebuilt in 1981) and Nara Dreamland's castle (1961–2006) out in the basin; from the summit, the Great Buddha Hall and Kōfuku-ji's pagoda below |

**Far land** (`far-land.ts`). The slope terrain and the town ground end 110–130 m from the road. From Nara's upper driveway and summit, from Aizu's finish on Iimoriyama and from Irohazaka's hairpins over the Daiya valley, the camera used to look past them at the sky's own lower half: a level plane that read as a calm sea, or on Irohazaka's sunlit afternoon a flat pink sheet below the guard walls. A far-land plan now draws the real ground there out to the horizon. It is a `PeriodDistant` entry with `land`, so it travels with the scene's far silhouettes.

- **Ground.** `scripts/build-far-land.ts` resamples GSI DEM10B elevation tiles (国土地理院 標高タイル, zoom 10) into a 250 m grid and writes it to `generated/<route>-land.ts`.
  - Nara's grid covers 34.50–34.82°N and 135.64–136.00°E, from the Kizu valley to Kashihara and from past the Ikoma ridge to the eastern highlands.
  - Aizu's covers 37.38–37.70°N and 139.74–140.10°E: the whole Aizu basin, Kitakata and Bandai-san.
  - Irohazaka's covers 36.60–36.88°N and 139.33–139.72°E: Nantai-san and Nyohō-san, Lake Chūzenji, and the Daiya valley falling east to Nikko, whose town and Route 120 are lit.
  - Within 130 m of the road the script holds the land 3 m under it, rising at most 25% out to 400 m. The camera looks down on its own road, and land above the camera would face away and vanish.
  - Positions use the track compiler's projection, so the land meets the road where it should.
- **Colour.** The plan's floor height divides late-autumn paddies from wooded hills. Ellipses mark the towns' grey roofs, dark parks (Nara Park, and the Heijō palace site, open fields in 1986) and Wakakusa-yama's golden lawns. Aizu darkens Tsuruga-jō's grounds and moats.
  - `autumn` turns that share of the wooded hills, in patches about a kilometre across, crimson, rust and gold among the dark conifers, as the route cutscenes paint every hillside (Aizu 0.5, Nara 0.4).
  - `light`, a compass bearing, lights the slopes that face the route's low sun (Irohazaka 245°, Nara 240°). Without it, east-facing slopes catch the light, as before.
  - `canopy` draws the near wooded slopes crown by crown, within about 3 km, where a crown spans two art cells or more. It uses cellular noise in 3D, so crowns keep their shape on a steep face. Crowns gather in stands about 90 m across: broadleaf or dark conifer. Broadleaf crowns take their colour by the grove, from a colour field about 70 m across with a little play from crown to crown: crimson, orange or gold, a few still green. One random tone per crown read as polka dots on the mountainside at Umagaeshi. Broadleaf crowns are rounded and conifers are narrow spires. Each crown takes its own size, so some overlap and others leave shaded gaps, and clumps of leaves light and shade its inside. An earlier lattice of equal crowns with even seams read as cobblestones. Irohazaka's start at Umagaeshi used to show its own mountainside as one flat, near-black sheet filling the sky.
  - `dayGain` brightens the near land in full afternoon light (Irohazaka 2.5). The far land is unlit, and its colours were tuned for dusk basins. The gain fades out between 1.2 and 3.5 km, so the far ridges keep their depth in the haze; lifted alike, they washed out pale where the repaints paint blue-violet ranges.
  - Tried and set aside: a ceiling on the gain for sunlit slopes, a gain weighted to the shaded side of each crown, and clear air before the haze begins. The last brings out the warm canopy that the haze turns pale pink at the Iroha bends, but every variant scored worse against the repaints there (0.202 to 0.210–0.213).
- **Lights.** Points scatter through the 1986 built-up areas, along the main roads (Routes 24 and 25 at Nara, 49 and 121 at Aizu) and in farm-village clusters: fluorescent, mercury, sodium and incandescent. Each is at least two art cells across, and they come on with the street lamps (`cityGroundLights`).
- **Placement.** Every vertex keeps its direction from the camera but moves onto a shell 560–596 m out, ordered by true distance. That is inside the camera's 600 m far plane and behind the skyline's 520 m. Everything the route builds is nearer and wins the depth test, the sky stays behind, and the land's nearer hills still hide what lies beyond them.
- **Haze.** The land fades with true distance toward the far ridges' tone. Like the silhouettes, it skips the street fog, which would blank it out beyond 400 m. A plan's `haze` sets the daylight tone away from and toward its `light` and the distance over which it takes hold. Irohazaka fades into blue-violet (#7a6c9c) over 3 km, so its ranges step back ridge by ridge as the repaints of the hairpins paint them. A darker plum, a stronger autumn and a sun-warmed haze were tried and rejected: the first read as a dark slab, and the others as a flat glowing sheet again. Nara keeps lavender away from its sun and peach toward it.
- **Finish line.** A sprint that finishes in a park or forest on a hill no longer lays town paving past its finish line (`periodCityGroundCut`). That paving ran on level with the road and was itself the lake at Aizu's finish.

The slope terrain's own straight edge still shows near Nara's summit, now against the hillside instead of the sky.

**Landmarks** (`landmarks.ts`). Each is simplified as Tokyo's are:

| Building | Route place |
|---|---|
| Kyoto Tower (1964), 131 m: a white shaft on the tower building, with its ringed drum and red-tipped mast | Shiokōji, opposite Kyoto Station |
| Kyoto Station's third building (1952): a long, low concrete block with a tall central block, across its forecourt. It was JNR's until April 1987 | Shiokōji, at the start |
| Higashi Honganji's great gate, drawn with the Nandaimon builder: unpainted timber under two tiled roofs | Karasuma-dōri |
| Higashi Honganji's Goei-dō (1895), 76 m across and 38 m high, and its Amida-dō: column verandas under skirt roofs and vast tiled roofs | Behind the gate, their roofs over the temple wall |
| Minami-za (1929): a white front under tiled eaves and karahafu, the yagura turret on the roof, the kaomise maneki boards | The east end of Shijō Ōhashi, across an open Kawabata-dōri from the river |
| Yasaka Shrine's west gate (西楼門, 1497): vermilion, two storeys, up its stone steps | The head of Shijō-dōri |
| Keage power station (1912): red brick, stone string courses, a slate hipped roof | Sanjō-dōri at Keage |
| The Kyoto City Museum of Art (1933): tan wings and a central block under tiled roofs | Jingū-michi, beside the torii |
| Heian Jingū's great torii (1929): vermilion pillars 24.4 m high, a black kasagi 33.9 m long | Across Jingū-michi, as an arch over the road |
| Heian Jingū's Ōtenmon (1895): vermilion, two storeys, green-glazed tiles | At the head of Jingū-michi, seen ahead before the turn into Niōmon-dōri |
| A castle gate standing in for Nijō-jō's Higashi Ōte-mon, using the Sakuradamon builder | Horikawa-dōri |
| Nishi Honganji's Goei-dō (1636) behind its gate | Horikawa-dōri, near the finish |
| JNR Nara Station (1934): a temple-roofed hall with its sōrin between low white wings | The start |
| Kōfuku-ji's five-storey pagoda (1426), 50 m, unpainted timber with plaster in a band under the beams | Above Sarusawa-ike |
| Kasuga Taisha's first torii (一之鳥居, 1634): vermilion, 6.75 m, the straight Kasuga kasagi | Where Sanjō-dōri enters Nara Park |
| The Great Buddha Hall (大仏殿, 1709): 57 m wide and 49 m high, with its karahafu and gold shibi | 270 m back across Nara Park |

The unpainted pagodas (Tōji, Yasaka, Kōfuku-ji, Yakushi-ji) share one builder, as the Nara cutscene paints Kōfuku-ji over Sarusawa-ike:
- dark timber on every face: posts, a plank door, latticed side bays, and plaster only in a band under the beams;
- a railed veranda round each storey;
- a stepped ring of bracket sets under deep grey-tiled eaves, whose corners turn up (反り) over a thick tile edge.

Plaster walls with posts on one face read as a white tower at Sarusawa.

Tsuruga-jō's keep (rebuilt in concrete, 1965) and Tōji's pagoda (1644, 55 m) are drawn only as far silhouettes. The keep stands 276 m inside its moats at the nearest point. `landmarks.ts` also builds Sazaedō on Iimoriyama (1796), which no scene places. The research puts it on the west slope, out of sight of the road.

**1986 landmark audit (2026-10-29).** Each route was checked for buildings that stood in 1986 and that a driver would see. Some were left out:
- Kegon Falls and Lake Chūzenji, which are not in view from the Irohazaka road.
- Sazaedō, on the far slope of Iimoriyama.
- Tōdai-ji's Nandaimon, behind the park's trees on Nara's route.
- Anything built later, such as Kyoto's present station (1997) and Heijō's Suzaku-mon (1998).

Two footprints run past their buildings to keep lots out of the view: Kyoto Station's forecourt, and Kawabata-dōri between the Kamo and the Minami-za.

**Street furniture** (`street.ts`, `signs.ts`):

- **Kana curve boards:** all twenty of the Second Irohazaka's numbered curves get a board, い to ね, on its post at the outside of the bend, 20 m before the apex. The kana are drawn in a third atlas region (`KANA`, the 48 iroha kana).
- **Guide signs:** these carry the routes' destinations, such as 中禅寺湖, 鶴ヶ城, 飯盛山, 四条通, 祇園, 蹴上, 京都御所, 京都駅, 奈良公園 and 東大寺.
- **Arches:** these span the road. The first is Heian Jingū's torii.
- **Regional signs** (`SIGN_REGIONS`): each local route draws its shop signs from its own pool instead of Kanda's. Kyoto's, Nara's and Aizu's pools add their towns' trades to the common ones:
  - Kyoto: 京菓子, 漬物, 湯葉, 扇子, 西陣織 and 茶舗;
  - Nara: 奈良漬, 鹿せんべい, 墨, 筆 and 仏具;
  - Aizu: 酒蔵, 赤べこ and 会津塗.

  Irohazaka uses a mountain-resort pool of its own (そば, 民宿, 旅館, 湯波, 羊羹 and the like). Shop names are invented.

**Trees and season.** The scene's `trees` line the given sectors with flowering trees on both sides. On these routes they are autumn maples (`momiji`): all of Irohazaka's climb, Iimoriyama's flank, the Keage and Okazaki stretch in Kyoto, and Nara from Sarusawa-ike through the park and up the driveway. They use the blossom material in maple tones. With the street plan's `autumn`, the authored broadleaf trees of the forest banks and hillsides turn too (`autumn-foliage.ts`). Each tree takes one tone from its own position, at the hues of the repaints' crowns: mostly crimson (two in five, and a deep crimson one in six), then vermilion, orange and gold, with one in sixteen still green.

**Crown light** (`autumn-foliage.ts` `crownLightGlsl`). A crown keeps its own hue through light and shade. Its sunlit leaves warm toward gold (crimson through vermilion to orange, the repaints' highlights), and its highlights are held under the race tone curve's shoulder. Plain lighting paled sunlit maples to peach and sank their shade toward maroon under the dusk sky: at Umagaeshi the crowns' chroma was .11–.14 against the repaint's .14–.16. Plants holding more green than half their red (sugi, pines, willows, susuki, grass) keep their hue unwarmed. The authored trees, the modelled plants and, by day, the roadside momiji (world.ts) all use it.

**Modelled plants** (`flora.ts`). The autumn wood behind the verge is real geometry, built once per variant and drawn per chunk as two batched meshes (bark and foliage), each plant tinted on its own:
- **Japanese maples** (イロハモミジ): a trunk forking low into spreading limbs, each limb's outer half bending flatter and splitting into twigs that carry layered pads of maple-leaf cards, so the crown is the broad, tiered dome the cutscenes paint. About 500 triangles. Their tints follow the repaints' crowns: crimson the largest share, then vermilion, a deep crimson, orange, gold and a few still green.
- **Sugi** (杉): a straight russet trunk, about 24 m tall, and whorls of five or six branches every 0.7 m narrowing to the top. Each branch carries three drooping needle sprays, darker toward the trunk, in a dark, cool green. About 650 triangles. Two sprays of up to 2.8 m a branch read up close as flat green leaves (Iroha bends).
- **Susuki** (薄): clumps of arching straw and tawny blades with tawny autumn plumes at the wood's edge. Paler plumes read as white bushes under Akechidaira's low sun.
- **Grass tufts**: low tufts of amber and gold grass, three crossed cards (6 triangles), about five a metre on each wooded bank, thickest near the road. The repaints' banks are golden grass over dark litter, where the slope terrain alone was a smooth orange plane (Umagaeshi).
- **Weeping willows** (枝垂れ柳) on the temple ponds, and **black pines** (黒松) along the top of the castle moats (Tsuruga-jō, Nijō-jō), leaning over the water with flat cloud pads of needles.
- Leaves, needles and blades are alpha-cut cards on one painted atlas. A card's lighting normal leans toward its crown's surface, so each crown shades as one mass.

The wood grows only on forest, park and rural ground: behind a temple or shrine wall, or at a pond's curb, only the grass verge before it takes leaves. Four rows of trees stand 4.5–56 m beyond the road edge (the far rows climb the slope up to 30 m above or below the road): maples, with sugi among them on the mountain roads (`street.cedars`). Turned shrubs (clusters of leaf plates) and susuki grow at the wood's edge, and grass tufts carpet the bank (their own seeded stream, so the planting after them is unchanged). Everything stands on the hillside under it, read from the layout's ground sampler, and stops short of any other leg of the road.

**Forest banks on the city routes** (`street.forestBanks`: Aizu and Kyoto). A city route's forest districts rise as banks (terrain.ts `createTerrain`), which begin 18 m past the road edge; the town paving was cut from the shoulder (1.7 m), so the verge between was a 16 m hole. The sky dome's dusk showed through it as a flat maroon plane, most plainly beside Kyoto's Keage stretch, where a ray from the camera hit nothing. The paving now runs up to the bank (`periodCityGroundCut`'s `forestBanks`), and the verge takes its understory on it: fallen leaves, turned shrubs, susuki and grass, but no modelled trees, since the race's own forest pools stand on the bank. Lots still keep off the verge from the shoulder, so the towns stand exactly where they did (a test checks the lot lists). Nara is a city route too, but its forests are one hillside that covers the verge, so it is cut from the shoulder as before; paving it too brought the verge undergrowth onto Nara Park, whose lawns the deer graze open (that frame went from 0.163 to 0.199).

**Nara's forest hillside planting.** The city originally passed only the clipped paving's height sampler to the autumn planting, so its shrubs, grass and susuki found no ground beyond the forest shoulder even where the hillside was visible. A separate `vegetationGroundHeightAt` now falls back to the hillside only for leaves and understory on the nearest road frame's forest side, with finite-height and other-road-leg checks. It keeps clear of buildings and reserved landmarks. The race already supplies the hillside's trees: applying the fallback to the modelled tree rows too closed the valley views and worsened the Nara Park comparison, so those rows retain their original sampler. Lots and roadside walls also retain their original ground sampler; park lawns, ponds and temple precincts gain no hillside planting. The reference labelled Nara Park at lap 0.6 is the forest on both sides of sector 8; Wakakusa at lap 0.95 has park on one side and forest on the other, so the distinction matters.

**Mountain roads.** Where the hillside stands more than 2.5 m over the road 6 m out, the road is cut into it, and a battered masonry retaining wall (擁壁) with a concrete coping holds the cut, as tall as the bank. The verge planting starts at its top. A lower bank stays a grassy, leaf-strewn slope, as the repaint draws it at Umagaeshi. An orange curve mirror (カーブミラー) stands just behind the guard rail on the outside of every hairpin. Where the hillside instead falls more than 0.4 m below the road 6 m out, a stone parapet a metre high runs along the verge, with a concrete coping and its outer face falling to the slope. The wood on that side thins to a sparse near row, so the valley, the far land and the mountains stay in view over the parapet, as the Irohazaka repaints draw the valley side of every bend and the top at Akechidaira.

**Temples and ponds** (`open-ground.ts`).
- Temple walls (築地塀) carry a small tiled roof as their coping, its eaves out both sides under a ridge of round tiles.
- A Kasuga stone lantern (春日灯籠) stands every 16 m along a temple wall. Each is about 2.3 m tall: a hexagonal footing, a round post with a collar, a lotus platform, a lit firebox, and a hexagonal roof with curled corners under a jewel finial.
- Ponds such as Sarusawa-ike alternate weeping willows and lanterns along their stone edge. The water runs out about 40 m to a steep far bank, where two-storey townhouses stand every 12 m or so: lit shoji on the street floor, glazed rooms above, a red lantern, under tiled roofs. Willows lean over the water between them, as the cutscene and its repaint show Naramachi across Sarusawa-ike. Nara keeps its roadside maples off Sanjō-dōri and Sarusawa-ike, so Kōfuku-ji's pagoda rises over the temple wall there.

**Machiya** (`buildings.ts`). The machiya is a kyō-machiya:
- The ground floor is a lit room behind a fine timber lattice with head and middle rails. A curved bamboo inuyarai (犬矢来) sweeps out from its foot either side of the doorway, under a three-panel noren and a lantern on a bracket.
- A tiled pent roof runs across between the storeys, with its tile edge and a dark soffit.
- The upper floor is one of three: slatted plaster mushiko-mado over a dim room, a lit wooden lattice band with bamboo blinds over half of them, or glazed windows behind a timber railing.
- The main roof carries a ridge cap, the street eave's tile edge and soffit.
- The new detail draws from the lot's own hash, so every other building and the street life are placed as before.
- On Kyoto's streets about half the machiya wear bengara (紅殻): red-ochre lattices and timber, some with a red plaster wall, as the Gion cutscenes paint Hanamikoji's teahouses.

**The Keage power station** (`landmarks.ts`, 1912) is Meiji red brick on a stone plinth: pilasters, stone string courses and a cornice, two storeys of tall arched windows lit from the machine hall in stone surrounds with keystones, a low hipped roof, and the Biwako canal along its front behind a rail, with stone embankments, stairs down to the water and period lamps, as the Keage cutscene shows it.

**Inns, storehouses and houses** (`buildings.ts`).
- **Ryokan** are timber inns, as the Nikko repaint draws them:
  - weathered board walls, with plaster only on the gable ends;
  - each upper bay a pair of full-width glazed sliding doors with a lit room behind;
  - dark posts, a balcony 1.15 m deep on balusters every 0.2 m, and a tiled pent roof with its tile edge and soffit over every floor.
  - The window seeds are the same draws the punched windows took, so nothing else moves.
  - The flanks carry the inn's side rooms: glazed windows between timber posts on every upper floor, with a beam at each floor, lit like the front (their own stream). Blank, the flanks of the inns standing behind Gion's lower machiya read as dark grey blocks where the repaint paints lit timber inns. Shijō–Gion went from .162 to .155.
- **Shop-kura** (店蔵) line Aizu's merchant streets:
  - On any street with Aizu's own sign pools, about 45% of machiya and 20% of shophouses of three storeys or fewer build as kura.
  - The upper storey is thick white shikkui with small windows whose iron shutters stand open, under two moulded bands and a heavy black-tiled roof with a tall ridge and end tiles (鬼瓦).
  - The street floor is the lit shop behind a timber front, with its name on a board, a noren, and piers in namako-kabe: black diagonal tiles with raised white joints, modelled as strips.
- **Taishō brick shops** (大正の洋風商家) stand among them, as on Nanokamachi, where the repaint paints one at the street's bend. About 20% of Aizu's machiya and 40% of its low shophouses build as one. The lot at the bend now builds one where a kura's blank gable stood (Nanokamachi 0.183 to 0.176). Each one has:
  - two or three storeys of red-brown brick (stucco in three in ten) between stone quoins;
  - tall sash windows under stone lintels with keystones, a string course at each floor;
  - a moulded cornice with dentils under a brick parapet, its coping and a name panel;
  - the lit shop between brick piers under an awning or a fascia board, with a bracket lamp either side;
  - plain rendered party walls.
- **Shophouses** with a first-floor balcony set potted plants along one end of it about half the time (the other session's `balconyPlants`, fed from the lot's own hash so the street life is unchanged).
- **Houses** carry a ridge cap with end tiles, and an eave edge over a dark soffit. Their gable ends now rise to the roof's own pitch; they stopped at 1.5 m, leaving a gap under steeper roofs.
  - A carport's car, and every car in a monthly car park (月極駐車場), is a modelled 1980s saloon (`parkedCar`, about 150 triangles): body between black bumpers, raked windscreens and side glass round a pillared roof, lamps, a grille, and octagonal tyres with hubcaps. Two boxes read as white blocks.
  - Their entrance (玄関) has a concrete step and a small canopy (庇), and its porch lamp glows at night. Storm-shutter cases (戸袋) in bronze or dark-stained wood stand beside the upper windows, with the shutters' rails over and under them. This applies to houses on every route, drawn from the lot's own hash.
  - In the old towns (Kyoto, Nara, Aizu) the siding is weathered, in cool greys and greige, as the Iimoriyama repaint paints its hillside houses. The new-build palette lit them warmer and brighter: Iimoriyama's right side measured 0.24, and 0.15 with weathered siding (the frame 0.253 to 0.241).
  - On the autumn towns' frontage (Kyoto, Nara, Aizu), a garden tree stands behind the block wall: a dark evergreen, or a crimson maple. That follows the Iimoriyama repaint's houses: dark shutters, shrubs behind the wall, a lit porch. Beige cases and gold maples read brighter and warmer than the repaint there (right side 0.25 to 0.28); dark ones brought it to 0.256 from 0.259.

**Fallen leaves** (`street.ts` `leafLitter`, from the plan's `street.litter` progress ranges). Under the maples, fallen leaves drift in both gutters, scatter across the carriageway and carpet the open verges (forest, park, rural and temple ground, level with the road; town pavements stand above it). Every autumn cutscene and every repaint of these routes paints the ground so. The slope terrain under the climbs carries the same litter in its own material (`terrain.ts`, `createSlopeTerrain`'s `autumn`): drifts over the moss, world-anchored, with the moss showing between them. Most of it has browned on the forest floor, with fresh crimson, orange and gold the lesser share, so the slopes read as dark russet ground under their golden grass rather than a bright orange plane (Umagaeshi's bank: lightness .43 against the repaint's .34). Where the road's district is a park (`createSlopeTerrain`'s `lawn`; on Nara, Wakakusa-yama's summit lawns), the hillside is open grass gone to straw instead: the far land's golden tan, with tufts and a few fresh leaves near the car that fade with distance (see *Wakakusa-yama's summit lawn* in [the pixel-art renderer notes](pixel-art-renderer.md)).
- Each leaf is one small diamond on the city's `ground` material: crimson, scarlet, vermilion, orange or browned, mostly crimson as the repaints strew them. Gold leaves, a fifth of them, turned the lamp-lit night verges at Iimoriyama into a gold speckle. Its vertex colour is divided by the forest-floor scan's mean colour, so the leaf keeps its own colour and the scan's grain reads as veins.
- On the afternoon routes (`street.afternoonLeaves`: Nara, and Irohazaka until its last chapter's dusk), a fifth of the leaves are gold and each kerb drift takes twelve more leaves a metre, from its own stream. The repaints with the sun behind the camera pile the kerbs thick with red, orange and gold leaves. Nara Park went from 0.186 to 0.175, Wakakusa from 0.202 to 0.191, and the Iroha bends and maples by 0.004 and 0.006. At Akechidaira's dusk end they would have cost 0.022, so they stop there.
- About 25 leaves a metre in towns and 40 on open ground are drawn from one seeded stream per metre, so chunk seams never move them. Ten a side drift against the kerb, thinning into the lane; those across the carriageway lie thickest toward its edges, as traffic sweeps the crown of the road. Dimming the leaves on the asphalt for the dusk lamp pools (a suggestion from the renderer work) moved Akechidaira by .002 and cost the daylight frames .003–.005, so they keep their colour.
- An Irohazaka chunk window drew 130k city triangles with the first two-quad leaves at twice this density, and draws 43k now. Leaves blow across the frame there (`'leaves'` in the pixel overlay; everywhere on Irohazaka). The native recipe's wet stretch, from a fifth to four-fifths of `maxTicks` (1:00 to 4:00), falls as rain. A route's style can turn it to snow; none does yet.

**Route locals** (`people.ts`, from each scene's `locals`). Each route has people or animals found only there. Codex drew them in the same style on six more sheets; the prompts are in `docs/art-prompts/street-sprites-v1.json`.

- **Gion's maiko:**
  - They wear November's maple kanzashi, a vermilion hikizuri and the long darari obi, on tall okobo.
  - They make up about a third of the walkers in Gion itself (sector 5), with fewer on Shijō Ōhashi and Higashiōji. They walk in pairs.
  - On a wet night they open a red janome-gasa.
- **Nara's deer:**
  - Does and stags. The stags' antlers have been sawn to stumps at the October antler-cutting, as they would be in November.
  - They graze, lie down, stand about, amble along the pavement and bow, dipping and rising again.
  - They range from Sanjō-dōri by Kōfuku-ji through the park to Tōdai-ji. A few are in the hill forest and more on the summit lawns.
  - Deer have their own sprite layout. Side views take double-width cells (standing, two strides, grazing, bowing, lying), followed by front and back views, standing and walking.
- **Irohazaka's monkeys:**
  - Troops of Japanese macaques, some of them mothers with babies on their backs.
  - Some perch on the guard rail, 0.84 m up and with no shadow, watching the traffic. The rest sit, eat (a rice cracker or a persimmon) or amble on the verge behind it.
  - Troops are sparse on the climb and thickest at Kurokamidaira and Akechidaira.
  - Monkeys use the cats' sprite layout, eating in place of curling up.

Locals are placed from their own random stream, so the routes' other people still stand where they did. The deer are drawn a little larger than life and the monkeys a third larger, as the cats are drawn half again as large. The atlas build clears stray specks from the deer sheets (`despeck`).

**Light.** Each scene's mood sets the night palette (mountain or city), the stars, the dry-road dampness, the lamp colour and a daylight value at the start of each soundtrack chapter and at the finish:

| Route | Light |
|---|---|
| Tokyo | Keeps its night-to-sunrise arc |
| Irohazaka | Late-afternoon gold for most of the climb (daylight 1 to 0.9), then fading toward sunset at Akechidaira (0.52). The road is a wet evening's (damp 0.75), so the dusk at Akechidaira stays dark between its lamps' streaks, as the repaint paints it (0.318 to 0.252 there). The sun stands at its true late-afternoon bearing, 245°. |
| Aizu-Wakamatsu | Dusk with every light on (0.6 to 0.38), as its cutscenes and repaints paint the merchant streets and the moat, on a wet road (damp 0.75) that stays dark between its lamps' streaks |
| Kyoto | Dusk into night (0.55 to 0.22) |
| Nara | Late-afternoon gold throughout (0.9 to 0.97), on a dry road. The sun is at its true bearing, 240°: Sanjō-dōri runs east, so the street is lit gold from behind under a rose and violet sky ahead. |

A route's `sun` bearing swings the key light and the painted sun there by afternoon light; the low sun stands on the horizon (world.ts). `sunHeight` raises it for a route whose own hills stand higher toward the sun: Irohazaka sets it to 9°, hidden behind the valley's ridges low on the climb and visible over them higher up. Such a route takes no golden extra key light (November 1: the far land's elevation grid has Irohazaka's ridges 14-28° high toward the sun the whole climb). `ridges` gives the colour the sky paints its far ridges by day: Irohazaka's are hazed blue-violet, `#5f4a88`. `ridgeHeight` sets their height against Tokyo's low ridge, where the night keyframe's would stand wrong: Nara's basin is rimmed by low hills, 1.6 against the mountain night's 2.6. `windows` sets the share of windows lit at dusk where a town's cutscenes light nearly every room by evening: Aizu and Kyoto, 0.9. world.ts reads it.

**Against their repaints (2026-10-30).** Codex (`gpt-6-astra`, ultra reasoning) repainted thirteen race frames of the four routes in the cutscene style, with our camera and layout kept. The repaints are in `art/reference/mockups/` and their prompts in `docs/art-prompts/race-mockups-street-routes-v1.json`. Each frame was measured against its repaint region by region: OKLab lightness quantiles, chroma, and the warm and lit shares over sky, horizon, both sides, the near road and the middle road. The route dressing above came from those gaps; the renderer, sky and road gaps went to the pixel-art renderer ([refine round 4](pixel-art-renderer.md#implementation-notes-refine-round-4-2026-10-29)).
- **Mixed result.** The metric is crude: it compares value and colour, not drawing. On the seven frames captured at the start whose repaints have the right light, it barely moved (0.210 to 0.206):
  - Irohazaka's maple hairpins closed from 0.31 to 0.23, and Kyoto's Shijō from 0.29 to 0.19: the dusk mosaic was gone, with dry golden afternoon roads and maple crowns. The wet roads now draw separate gold streaks over navy.
  - The renderer's day chroma lift (×1.2) oversaturated the dusk skies, and the sky now keeps its authored chroma. That matches the dusk repaints (Aizu 0.141 and 0.149 against 0.125 and 0.146). A saturation lift on the low-sun routes' afternoon sky brought Irohazaka's hairpins to 0.125–0.143 against 0.138–0.139. Facing the sun (lap 0.12), the sky stays too pale: a cream-peach glow where the repaint paints deep orange-red clouds.
  - The near road under the low sun is darker since the afternoon lamps went out (Irohazaka, lap 0.12: L 0.32 against 0.48).
- **Modelling round (2026-10-30).** On the ten frames whose repaints have the right light, the mean gap went from 0.212 to 0.204, measured with the renderer's own changes landing alongside. It reached 0.197 once wet kerbs and pavements took the road's lamp-pool dims ([renderer](pixel-art-renderer.md)): Iimoriyama 0.290 to 0.260, Akechidaira 0.228 to 0.202 and Nanokamachi 0.185 to 0.173.
  - Iroha bends 0.251 to 0.202, and Akechidaira 0.252 to 0.228.
  - Shijō–Gion 0.170 to 0.155, from the inns' lit flanks.
  - A census of the crowns by hue band showed the near crowns at Umagaeshi two-thirds orange and gold, with the repaint's about 70% crimson. Most of those near crowns are the roadside momiji, whose tones went crimson with this census. The far land's sunlit near slopes still read pale pink at the bends, where the repaint has warm orange hills. A ceiling on its day gain and a longer haze both scored worse, so it stays as it is.
- Nara's first three repaints were asked for a low sun ahead, in the east; their light direction is wrong, and they are kept for composition. Codex's usage limit lifted early, and on 2026-10-30 Nara was repainted with the true sun behind the camera: Sanjō, Sarusawa, Wakakusa and a new frame in Nara Park (lap 0.6), all in `art/reference/mockups/`. Against them Nara scores 0.153, 0.125, 0.175 and 0.191: its light was right all along. With them, the fourteen frames average 0.180, and 0.174 after the renderer's golden-hour work that followed (golden shadows opened with the sun behind except on Irohazaka, whose mountains shade its valley roads; front-lit clouds; lit shop windows): Nara 0.114, 0.113, 0.144 and 0.188. The largest remaining gaps are renderer and sky work: sunlit asphalt reads too dark and cold with the sun behind the camera (Nara Park road L 0.26 against 0.35), and the sky over the park is more violet than the repaint's.
- Still short of the repaints: the dusk roads of Kyoto and Aizu carry fewer gold streaks than the repaints (lit share of the middle road 0.05–0.27 against 0.21–0.35), and a dusk-road dim tuned on Tokyo darkened them further (Kyoto Shijō near road 0.32 against 0.38).

The chapter titles and HUD place name come from each route's style (`src/game/street/routes.ts`).

## Streaming and cost

- The layout is built once per course.
- Geometry is built per 80 m chunk, one merged mesh per material, nearest chunk first, at most one chunk per frame (all at once on a course start or seek).
- Hidden chunks are kept for reversing and laps, then disposed.
- One `compileAsync` per course, against an HDR target and after `prepareSpotlightEarlyOut`, compiles every pooled material up front. Trees, understory and distant cars no longer compile on first sight mid-lap.
- The warm-up also covers the programs that used to compile mid-race (2026-11-01; `shader-warmup.ts`, `reflections.ts` `warm`). In the first 20 s after the countdown, 11 programs compiled on Hakone and 12 on Tokyo, each freezing the frame for 80-560 ms; now none do, on Hakone, Harbor Run or Tokyo (`tmp/perf/programs.mjs` logs each new program and the draw that made it). The causes were:
  - The cars' paint and glass are compiled on both the scene environment and the local reflection probe. A car leaving the probe's 24 m radius had switched to a program never built (a different cube-UV size).
  - The shadow pass's depth programs, one per kind of caster, compile from stand-ins that wear the depth material `WebGLShadowMap` gives each surface, with fog off as the shadow pass draws. The tree batch's hidden sources count, for the hazard trees cloned from them later, and each period-city chunk compiles its surfaces and their shadows as it is built, hundreds of metres ahead.
  - Oil slicks share one film material, compiled up front, instead of building their own on first sight.
  - The reflection capture no longer switches the renderer's output colour space. A render target always receives linear light, but three.js keys every program on that setting, so each material the probe saw compiled twice.
  - A knocked-down tree keeps its custom shadow materials (`Object3D.clone` drops them), so its falling shadow keeps the leaf cutouts and canopy gaps instead of compiling a plain one.
  A new car body (a build change) warms again. A hitch of about 300 ms remains some 3 s after GO on every route; it is not a shader compile.
- One matrix update per frame: the scene's ~12,000 matrices were recomposed by every render of it (a forced update before the tree batch, the reflection face and the pixel-art pass), about a fifth of the frame's CPU time.
- The pixel-art pass lets three.js clear its multisampled scene target after drawing the shadow map; clearing first opened the scene pass and the shadow pass split it, storing and reloading every sample. The reflection probe gathers the scene's LODs once per six-face capture instead of walking the whole scene each face.
- The race canvas is a GPU canvas. `willReadFrequently` had made it a CPU canvas, so every frame read the whole WebGL image back and the CPU waited for the GPU before drawing the HUD.
- The mature trees switch LOD at 19, 51 and 90 m (were 32, 85 and 150 m), sized for the pixel-art scene target, and their leaves cut out at alpha 0.25 (was 0.4) for full crowns. Measured on Hakone at 1080p with the scene alternating frame by frame (load average 300-1000 from other work, so read the ratios): the trees were about 45% of the GPU frame, the new switch distances took 5.4 ms (about 14%) off it, and matched frozen frames keep the crowns' shape and density. 4× MSAA on the scene target costs about 9 ms of a 24 ms GPU frame. Without it, fine detail goes (a shop curtain's pattern, lamp heads), so it stays.

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
  - Umbrellas open on a wet night and fold away when the road dries.
  - Shops in Kanda hang awnings printed with their trade, all steep enough never to read as wet road.
  - 20 tests in all.
- `npx tsx --test tests/street-routes.test.ts` checks the local routes:
  - each route has its own wording and a chapter for each soundtrack cue;
  - each route has a scene covering every one of its sectors;
  - each route has its own song, cued on its sections;
  - every packaged route is a catalog route;
  - Nara Park has grazing, bowing and lying deer, both does and stags, and the station front has none;
  - maiko walk in Gion, open janome-gasa on a wet night, and stay off Horikawa;
  - monkeys gather toward Akechidaira, some on the guard rail;
  - Tokyo has none of the three;
  - the far land of Nara, Aizu and Irohazaka covers each route and stays under its road (Nantai-san rises over Irohazaka's);
  - fallen leaves lie only inside a route's litter ranges, and chunk seams do not move them.
- Each local route was driven in the browser and judged at night, dusk and daylight against the period city's Tokyo look:
  - Irohazaka: the hairpins, kana boards, maples and gorge bridges;
  - Aizu-Wakamatsu: the town and the moat;
  - Kyoto: Kyoto Tower, the temple wall, Gion with Yasaka's gate, the Heian torii and Shijō Ōhashi;
  - Nara: the station, Kōfuku-ji's pagoda and the Wakakusa switchbacks.

## Known limits

- Tokyo Tower and Mt. Fuji are mostly hidden by the palace woods or the city, as they largely were in life; they show only down open avenues.
- The shrine front is dark at night apart from its stone lanterns.
- The street people are flat sprites. Up close, a turn of the camera switches a sprite between its front, back and side, with no angles between, and their pixels show larger than the screen's art pixels. Nobody crosses the road. Parked cars in carports and monthly car parks are modelled 1980s saloons; they remain static scenery.
- The ad balloons hang over the roadside buildings, so the nearer roofs hide them until they are a few hundred metres ahead, where they are small. The airship keeps station with the leaders rather than flying a fixed course of its own.
- The emblem on the generated fans' and crew's clothes and flags was drawn by the image model from the exact emblem as a reference. It reads correctly at sprite size, but it is not a paste of the source file.
- Local routes:
  - Tsuruga-jō's keep is rarely in view from the road. Beside the moat it stands 69–111° off the car's nose. On the Jōnan-dōri approach, where it is about 27° off, houses and walls hide it.
  - Irohazaka's kana boards are a plain provisional design. The 1986 boards are unconfirmed, and neither the 1995 nor the 2023 set may be shown.
  - Kyoto's Keage junction is modelled as a 24 m arc 18 m wide, more generous than the real Y-junction, so that the practice AI can take it.
  - Kyoto Tower's drum is drawn white. The research describes a red deck and top, and the tower's 1986 night lighting is unconfirmed.
  - Two Kyoto gates are stand-ins drawn with other builders: Higashi Honganji's gate uses the Nandaimon builder, and Nijō-jō's gate uses the Sakuradamon builder.
  - Public car access in 1986 is unconfirmed for Aizu's Keizan forest road and for Nara's Tōdai-ji lane. The Wakakusa driveway's 1986 operation (one-way or two-way climb, hours, toll booth) is also unconfirmed.
  - The locals keep to the pavements and verges. Nara's deer never step into the road, though in life they stop the traffic. Nobody sells or feeds them shika senbei, and the Irohazaka monkeys never raid a car.
  - The research notes list every remaining open question (`world/research/routes/`).
