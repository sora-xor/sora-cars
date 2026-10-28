import type { Character } from '../game/story';

// Fixed face crops from the established 1672px-wide cutscene illustrations.
// Keeping the crop independent of the current camera shot makes each speaker
// recognizable even when they are off screen or the player goes Back.
const portraits: Readonly<Record<string, { art: string; crop: readonly [number, number, number] }>> = {
  aki: { art: 'radio-right-v2.png', crop: [535, 105, 290] },
  ren: { art: 'radio-left-v2.png', crop: [805, 115, 330] },
  mei: { art: 'ledger-left-v2.png', crop: [990, 175, 300] },
  daichi: { art: 'harbor-left-v3.png', crop: [835, 155, 310] },
  yui: { art: 'ledger-right-v2.png', crop: [610, 140, 380] },
  jun: { art: 'ledger-right-v2.png', crop: [1110, 55, 420] },
  rei: { art: 'office-right-v3.png', crop: [780, 45, 395] },
  toru: { art: 'boardroom-right-v3.png', crop: [445, 65, 325] },
  celeste: { art: 'boardroom-right-v3.png', crop: [880, 65, 370] },
};

export function speakerPortrait(character: Character): string {
  const { art, crop: [x, y, size] } = portraits[character.id]!;
  // The adjacent bilingual name identifies the speaker for assistive technology.
  return `<div class="cutscene-portrait" data-speaker="${character.id}" aria-hidden="true"><img src="${import.meta.env.BASE_URL}assets/story/angles/${art}" alt="" draggable="false" style="width:${1672 / size * 100}%;left:${-x / size * 100}%;top:${-y / size * 100}%"></div>`;
}

export function preloadSpeakerPortraits(speakers: readonly string[]): void {
  for (const art of new Set(speakers.map(id => portraits[id]!.art))) {
    const image = new Image();
    image.fetchPriority = 'low';
    image.src = `${import.meta.env.BASE_URL}assets/story/angles/${art}`;
  }
}
