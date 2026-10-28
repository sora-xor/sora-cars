import assert from 'node:assert/strict';
import test from 'node:test';
import { ART_SHORT_SIDE, pixelArtGrid, sameGrid } from '../src/game/three/pixel-art/grid';

test('1080p uses the cutscene 560x315 art grid with a 3x scene supersample', () => {
  const grid = pixelArtGrid(1920, 1080);
  assert.deepEqual([grid.artWidth, grid.artHeight, grid.supersample], [560, 315, 3]);
  assert.deepEqual([grid.sceneWidth, grid.sceneHeight], [1680, 945]);
  assert.ok(Math.abs(grid.cellWidth - 1920 / 560) < 1e-9 && Math.abs(grid.cellHeight - 1080 / 315) < 1e-9);
});

test('the short side stays 315 art pixels and the grid scales with the window', () => {
  for (const [w, h] of [[960, 640], [1821, 1138], [1280, 720], [2560, 1440]] as const) {
    const grid = pixelArtGrid(w, h);
    assert.equal(grid.artHeight, ART_SHORT_SIDE, `${w}x${h}`);
    assert.equal(grid.artWidth, Math.round(ART_SHORT_SIDE * w / h), `${w}x${h}`);
    assert.equal(grid.supersample, Math.min(3, Math.max(2, Math.round(h / ART_SHORT_SIDE))), `${w}x${h}`);
    assert.equal(grid.sceneWidth, grid.artWidth * grid.supersample);
    assert.equal(grid.sceneHeight, grid.artHeight * grid.supersample);
  }
  assert.deepEqual([pixelArtGrid(960, 640).artWidth, pixelArtGrid(960, 640).supersample], [473, 2]);
});

test('cells never get smaller than two backing pixels', () => {
  const street = pixelArtGrid(1067, 600);
  assert.deepEqual([street.artWidth, street.artHeight, street.supersample], [533, 300, 2]);
  const small = pixelArtGrid(600, 400);
  assert.deepEqual([small.artWidth, small.artHeight, small.supersample], [300, 200, 2]);
  for (let h = 2; h <= 1400; h += 37) {
    const grid = pixelArtGrid(Math.round(h * 1.6), h);
    assert.ok(grid.cellHeight >= 2 - 1e-9, `${h}: ${grid.cellHeight}`);
    assert.ok(grid.cellWidth >= 2 - 1e-9 || grid.artWidth === 1, `${h}: ${grid.cellWidth}`);
  }
});

test('portrait windows keep the short side (width) at the art density', () => {
  const phone = pixelArtGrid(390, 844);
  assert.deepEqual([phone.artWidth, phone.artHeight, phone.supersample], [195, 422, 2]);
  const tall = pixelArtGrid(781, 1688);
  assert.deepEqual([tall.artWidth, tall.artHeight], [315, Math.round(315 * 1688 / 781)]);
});

test('supersample is clamped to 2..3 and degenerate sizes stay valid', () => {
  assert.equal(pixelArtGrid(3840, 2160).supersample, 3);
  assert.deepEqual([pixelArtGrid(3840, 2160).sceneWidth, pixelArtGrid(3840, 2160).sceneHeight], [1680, 945]);
  for (const [w, h] of [[0, 0], [1, 1], [3, 2], [Number.NaN, 5], [-4, 10]] as const) {
    const grid = pixelArtGrid(w, h);
    assert.ok(grid.artWidth >= 1 && grid.artHeight >= 1 && grid.supersample >= 2, `${w}x${h}`);
    assert.ok(Number.isFinite(grid.cellWidth) && Number.isFinite(grid.cellHeight));
  }
});

test('sameGrid detects only real dimension changes', () => {
  const a = pixelArtGrid(1920, 1080);
  assert.equal(sameGrid(null, a), false);
  assert.equal(sameGrid(a, pixelArtGrid(1920, 1080)), true);
  assert.equal(sameGrid(a, pixelArtGrid(1920, 1081)), false);
});
