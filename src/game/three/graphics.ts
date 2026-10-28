const PIXEL_FINISH_KEY = 'sora-cars:pixel-finish:v1';
let pixelFinish: boolean | undefined;

/**
 * The pixel finish is on by default. For picture reviews, ?picture=clean and
 * ?picture=pixel override the saved choice when the page first reads it.
 * An explicit settings change wins for the rest of that page visit; a reload
 * reapplies the URL override. Neither URL option changes the saved preference.
 */
export function getPixelFinish(): boolean {
  if (pixelFinish !== undefined) return pixelFinish;
  try {
    const picture = new URLSearchParams(window.location.search).get('picture');
    if (picture === 'clean' || picture === 'pixel') return pixelFinish = picture === 'pixel';
    const saved = window.localStorage.getItem(PIXEL_FINISH_KEY);
    if (saved === 'true' || saved === 'false') return pixelFinish = saved === 'true';
  } catch { /* The picture controls also work without browser storage. */ }
  return pixelFinish = true;
}

export function setPixelFinish(enabled: boolean): void {
  pixelFinish = enabled;
  try { window.localStorage.setItem(PIXEL_FINISH_KEY, String(enabled)); }
  catch { /* Keep the choice for this visit when storage is unavailable. */ }
}
