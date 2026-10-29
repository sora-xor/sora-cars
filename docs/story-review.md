# Campaign continuity review

Reviewed September 22, 2026 against the revised three-act screenplay. This pass combines two independent narrative reads, Japanese/English dialogue review, and the production CutscenePlayer checks described below. Chapter IDs are zero-based.

## Revisions checked

| Issue | Implemented resolution |
| --- | --- |
| Booked work seemed to solve a sudden demand for the whole loan. | ID 0 distinguishes ordinary installments from the three-week accelerated demand. Extra van inspections support cash flow; documentary review supplies the later standstill and withdrawal. The original debt remains. |
| The sponsor could apparently switch off arbitrary buildings. | Ren borrowed mobile relay kits and secretly supplied the hosts’ locations. Celeste threatens coordinated collection if the programme airs. The garage’s borrowed unit powered its relay and work lamps; taking it darkens the work area. Copies and exchange records survive. |
| Ren promised to confess before the broadcast but never explained the missed opportunity. | He explicitly admits choosing silence on the drive home. Aki’s earlier interruption does not excuse him. Public disclosure, corrected reports and sustainable repair shifts precede their reconciliation. |
| Several corporate visits and race rewards repeated the same exchange. | The first visit offers a dream garage, the second demands a retraction before investors, and the final offer targets Aki’s actual inherited workshop. Meets now gather witnesses, carry records, reconnect repairers and celebrate, alongside the initial publicity and Toru’s challenge. |
| Accountability remained abstract. | Mei names selling a photograph while excluding the displaced shopkeeper. Rei describes omitted fuel costs and longer delivery routes. Toru connects those costs to his father’s factory and admits his race condition still reflects pride. |
| The cassette changed hands without explanation. | It is a gift for the new sign, left with Ren before the harbor date and taken back by Aki before the final trip. Side B remains blank until after the private, mutually agreed kiss. |
| The finale placed Ren and Jun in Yokohama and Nikko at once. | The programme is recorded the previous morning and played by the shop sitter while the crew listens at Nikko at dawn. Bilingual setting captions distinguish the recorded studio scene, the present overlook and the portable terminal. Reopening follows their return that afternoon. |
| Emotional payoffs repeated declarations about freedom and choice. | Aki’s early help remains reluctant; Ren’s fear appears before the rupture. Later scenes use a passenger-seat nap, a shared repair shift, lunch duties and a day off together. The romance recalls Aki’s wish to meet Ren without his microphone. |

## Preserved contracts

- Six adult crew members and three rivals retain their roles. Japanese dialogue and English subtitles carry the same events and intentions. Daichi’s self-reference and his brother’s unlicensed first ride now agree across scenes.
- All chapters require a podium; ID 10 also requires finishing ahead of the actual Toru opponent. Toru risks only his declared personal purchase options. Aki does not wager residents’ rights, and a finishing order does not authenticate evidence.
- The lender and local investors act after examining records and the hearing. The early demand is paused before the one-week time jump, then withdrawn separately from the race. CROWN continues elsewhere; Rei’s inquiry and normal debt repayment continue.
- Aki gives up the sole recovery key; Yui publishes repair knowledge. Using the fictional exchange remains voluntary. The modern cosmetic shop remains a separate wallet-approved flow and does not buy story progress or forgiveness.
- Camera and beat-art positions retain all 54 illustrations. Music cue labels match the revised scenes while the 25 compositions, developed entrances and camera-dependent arrangements remain intact.

## Verification

The current source passed the production build and all 15 focused story, art, music-cue and MIDI tests. The art fixture traversed 301 lines in 25 sequences, exercising all 54 illustrations and pause/cut/Back. The unchanged web-game skill client also exercised the actual scene player; its image and state were inspected.

`artifacts/story-readability.json` pins the current screenplay, player and styles. It records 602 checks: every campaign and retry line at 320×740 and 390×844. Both languages, setting captions, paragraph scroll reachability and horizontal bounds passed with no browser errors or source changes. The long corporate and lender explanations, recorded premiere and present-day confession were visually inspected.

The complete application traversal passed at 2026-09-22 07:12:30 UTC. `artifacts/story-browser.json` matches the final source hashes and records all twelve introductions and twelve aftermaths, 305 music observations, ten pivotal desktop/390px/320px capture sets, six explicit caption-history checks, real local AI result/retry, keyboard/gamepad/touch, pause/log/Back and reduced motion, with no browser errors. The recorded → present → ordinary-location captions also survive Back and the 320px log without revealing future dialogue.

An earlier run timed out creating a fresh touch page while the desktop 3D race was still rendering. A separate mobile boot and the complete rerun passed; `output/browser/touch-startup-audit/report.json` retains the diagnostic. This was not a dialogue or caption failure. This review does not claim a human-earned full campaign, a live transaction, NFT delivery or deployment.

## October 29, 2026: clarity and story-mode pass

A first-time-player read of all 24 sequences beside every cut's illustration, followed by a play-through of story mode. Chapter numbers in this section are player-facing (one-based).

### Story clarity

| Problem | Resolution |
| --- | --- |
| Conversations cut between the garage, the harbor and the radio room while people kept answering each other, so characters seemed to teleport (chapters 1, 2, 5, 6, 10 and 11). The hearing hall was labelled "shopping street" and the harbor pit "SORA Garage". | Time/place captions mark phone calls, the chapter 2 flashback, montage cuts and time jumps, and give the hearing and pit their real places. A caption now holds until the next camera cut (`resolveStorySetting`), which also stops chapter 11's pre-race broadcast caption flipping back mid-shot. Lines that answered someone elsewhere now make the call or the move explicit. |
| Chapter 3 showed Aki at a boardroom table with Celeste and Toru while Rei explained CROWN, a chapter before Aki meets them. | Four new office frames for cuts 5–8; see [the artwork record](cutscene-art.md). |
| CROWN, SORA X.O.R., the recovery key and Toru's "purchase options" were never put in plain words. | Rei explains the lend-then-call-in scheme in one line, Yui explains the exchange ("three terminals write down every exchange"), Aki says what the recovery key does, and Toru holds "rights to buy the land". The deadline is consistently "the three-week deadline". |
| Missing links: the crown on the bank notice, why Ren keeps the cassette, the broadcast Celeste threatens, the "briefing" versus the hearing, the "venue's line", and why the garage "reopens". | Each is set up in the line before it matters. |

Line counts, stage directions (except chapter 3 lines 5–8, now `office`), music cues and the 228 distinct cut images are unchanged.

### Story mode

| Problem | Fix |
| --- | --- |
| Only the small Next link advanced dialogue; clicking the picture or the dialogue box did nothing. | Clicking or tapping either advances like Next, except while text is selected. |
| After clicking a toolbar button (Pause, Music, Log), Enter or Space pressed that button again instead of advancing. | A pointer click releases the button's focus; keyboard activation of buttons is unchanged. |
| One Escape or Skip tap discarded the whole scene. | Skip needs a second press within four seconds. The button shows もう一度でスキップ / PRESS AGAIN TO SKIP, and advancing cancels it. |
| The after-race scene gave no result, so the retry scene was unexplained. | The toolbar states the placing and either 章クリア / CHAPTER CLEARED or the objective that was missed. |
| Nothing showed that the last line would end the scene. | Its button names what follows: 出走前の整備へ / TO THE PRE-RACE GARAGE or 結果を見る / SEE THE RESULTS. |
| Story results said PRACTICE COMPLETE, headlined もう一度、走ろう。 even after a podium cleared the chapter, and put Retry before Next chapter. | Results name the chapter and whether it was cleared, show the objective, and lead with Next chapter after a clear or Retry after a miss. |
| Retrying a missed race replayed the whole introduction. | Retry (button or R) goes straight to the pre-race garage; Replay the chapter still offers the introduction. |
| Screen readers heard nothing as lines changed. | A polite live region announces each line. |
