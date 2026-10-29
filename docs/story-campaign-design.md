# SORA CARS — campaign implementation

A seventeen-chapter, three-act racing story with six adult crew members and three named rivals. The visual direction is a warm Japanese electronic-music serial: working garages, paper records, borrowed machinery, rainy radio rooms and a lake at dawn. [The story bible](story-bible.md) defines plot, character and continuity; the three `story-campaign-act*.ts` files and `story-campaign-roads.ts` hold the bilingual screenplay.

## Narrative and progression

The fictional Meridian Council's CROWN project links the garage's accelerated loan demand to the threatened harbor. The crew investigates its own involvement as well as the antagonists': Mei sold the photograph, Rei signed the assessment, and Ren concealed the relay sponsorship. Their alternative, SORA X.O.R., grows through useful exchanges, shared recovery knowledge and voluntary participation.

The early repayment demand is paused after chapter ID 7, before the following week's time jump. Its later withdrawal follows a lender review; normal installments remain. The two-a.m. blackout results from collection of sponsor-owned relay kits and the borrowed unit feeding the garage work lamps. The finale's studio images depict a programme recorded the preceding morning, heard at Nikko at dawn; the garage opens after the crew returns that afternoon.

Twelve chapters race the three Arcade circuits (Hakone, Yokohama harbor and Nikko). Five race 1986 street routes: Irohazaka, Tokyo, Aizu-Wakamatsu, Kyoto and Nara. The campaign has seventeen ordered introductions and aftermaths and one retry scene: 408 dialogue lines in 35 sequences. Each chapter has a synopsis and a completion-gated dossier. Locked chapter synopses are concealed.

**Chapter identity and play order.** A chapter's `id` is its stable identity: its cut art (`chNN-intro` is id + 1), its cue sheet, its workshop visit, its rival budgets and its dossier. Its index in `CHAPTERS` (`story-campaign.ts`) is its place in play order. That index drives the menu numbering, unlocks, objectives and saved progress. The street-race chapters have ids 12–16 and are woven in before the finale. Only the showdown (ID 10) asks for more than a podium.

**Street-race chapters.** These run with equal cars. The introduction leads straight to the start line, with no pre-race garage, because parts never reach street runs. The street session races the chapter's own grid: Aki, the crew and two drivers from the host club. Its finish decides the chapter, which then plays the aftermath or the retry scene. The results show the finishing order and lead on to the next chapter; the recorded run can be verified and replayed from the street history. Street-race chapters pay no prize money, so the Arcade economy and rival budgets are exactly as tuned for the twelve circuit chapters, which keep their ids.

**Saved progress.** Saves from the twelve-chapter campaign carry a progress count in the old order. On first load, `migrateStoryProgress` moves that count to the new place of the save's next chapter, and `sora-cars:story:order` records the new order. Street-race chapters placed before that point open as playable.

All objectives require a podium. ID 10 also requires a result strictly ahead of the actual Toru driver; ties or a missing rival result do not clear it. Toru's declared stake is his own purchase options, while the inquiry and residents' rights remain independent of the race. Earlier meets build attention, gather witnesses and carry document handoffs. The final Nikko run celebrates the crew's return. Results retain chapter context for retry and unlocked continuation.

## Artwork and dialogue

Eight location settings each have four independent compositions: wide, left, right and detail. These 32 angle images plus 22 illustrations for particular story moments make **54 cutscene images**. Previous location posters remain menu artwork. Built-in image generation produced the assets; [the artwork record](cutscene-art.md) links their exact prompts and provenance under `docs/art-prompts/`.

`resolveStoryFrame` selects the composition from explicit scene, shot and art directions. A special illustration holds through its dialogue; an explicit camera cut resets it. Back resolves the same original direction. Optional bilingual time/place captions mark phone calls, a flashback, montage cuts, time jumps and the recorded studio performance heard at the present-day Nikko overlook. A caption holds until the next camera cut (`resolveStorySetting`) and is retained in the dialogue log.

The cinema loads the opening frame and looks two lines ahead. It keeps the last ready frame visible until the new image is available, then crossfades. Camera angles are drawn into the images, with subtle drift and limited atmospheric effects. Narrow screens contain the full composition to preserve faces and props. Motion pause and reduced motion keep the illustration still while allowing manual cuts. The former fixed reel, needle, steam and window overlays are no longer part of this presentation.

Keyboard, gamepad and touch support advancing, returning, skipping and opening a log of reached dialogue. Clicking or tapping the picture or the dialogue box advances like Next, and a pointer click on a toolbar button releases its focus so Enter keeps advancing. Skip (button or Escape) needs a second press within four seconds. The last line's button names what follows (the pre-race garage or the results), an aftermath's toolbar states the placing and whether the chapter was cleared, and a polite live region announces each line to screen readers. Story results lead to the next chapter after a clear; Retry after a miss returns to the pre-race garage without the introduction. There is a motion pause and an in-scene music toggle, including the M shortcut. Presentation clocks do not advance race physics. Individual subtitles must remain readable at narrow widths.

## Adaptive score

The library contains **25 original compositions**, including the three existing race songs and sixteen added story themes. Each theme has its own melody, harmony and rhythm within the game's 1980s Japanese electronic vocabulary. The local synthesizer and downloadable MIDI files share the written notes; the soundtrack does not use commercial recordings or sampled melodies.

Every intro, aftermath and retry has authored music cues. Story changes can select another song with a short crossfade. Camera changes adjust instrument balance, stereo width and brightness while the same song continues. Held dialogue, text reveal, motion pause and the log do not restart it. Back restores the appropriate cue. Returning themes can enter later phrases; Jun's motif progresses from a tentative first note to the completed premiere. Race entry restores its course's song. See [the score and cue sheet](cutscene-music.md) for composition and scheduling details.

## Workshop boundary

Twelve optional workshop conversations connect character designs to the modern cosmetic shop through `#/shop/story/<chapter>`. They retain chapter context and reject future-chapter routes. Browsing or buying a cosmetic does not clear a chapter, change driving performance or settle a fictional obligation. Actual purchases remain separate wallet-approved transactions, and local story progress grants no funds, spending authority or NFT ownership.

## Verification scope

The focused story, artwork and music tests check cast and script completeness, local image coverage, inherited directions, progress gates, rival results and authored score transitions. `scripts/test-story.mjs` exercises the production scene player, introductions, aftermath fixtures, local AI race transitions, controls and bilingual layouts. `scripts/test-cutscene-art.mjs` covers all scripted illustrations and dialogue across desktop and narrow viewports. `scripts/test-cutscene-music.mjs` renders the real synthesizer to PCM and checks transitions, developed entrances, mute and output ownership.

These are the relevant verification tools, not a claim that a current run has passed. Consult the corresponding reports in `artifacts/` and `output/` together with their source hashes. Automated fixtures are distinct from a full human-earned campaign playthrough, and no story test demonstrates live settlement or NFT delivery.
