import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const url = process.env.GAME_URL ?? 'http://127.0.0.1:4186';
const seconds = Number(process.env.SORA_CARS_FRAME_SECONDS ?? 8);
if (!Number.isFinite(seconds) || seconds < 5 || seconds > 30) throw new Error('Frame sampling must span5–30seconds.');
const output = process.env.SORA_CARS_FRAME_OUTPUT ?? 'output/performance/browser-frames';
await mkdir(output, { recursive: true });
const results = [];
for (const mode of (process.env.SORA_CARS_FRAME_MODES ?? 'normal,swiftshader').split(',')) {
  const browser = await chromium.launch({ headless: true, args: mode === 'swiftshader' ? ['--use-gl=angle', '--use-angle=swiftshader'] : [] });
  try {
    for (const track of (process.env.SORA_CARS_FRAME_TRACKS ?? '0,1,2').split(',').map(Number)) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ cpuCanvas }) => {
        if (cpuCanvas) {
          const getContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(kind, options) {
            return getContext.call(this, kind, kind === '2d' ? { ...options, willReadFrequently: true } : options);
          };
        }
        const data = { enabled: false, submitted: [], intervals: [], callbackMs: [], lastFrame: null };
        window.__frameTiming = data;
        const request = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => request(time => {
          const start = performance.now(); callback(time);
          if (data.enabled) {
            if (data.lastFrame !== null) data.intervals.push(time - data.lastFrame);
            data.lastFrame = time; data.callbackMs.push(performance.now() - start);
          }
        });
        const fillRect = CanvasRenderingContext2D.prototype.fillRect;
        CanvasRenderingContext2D.prototype.fillRect = function(x, y, width, height) {
          if (data.enabled && this.canvas.id === 'race-canvas' && x === 0 && y === 0 && width === this.canvas.width && height === this.canvas.height) {
            data.submitted.push(performance.now());
          }
          return fillRect.call(this, x, y, width, height);
        };
      }, { cpuCanvas: process.env.SORA_CARS_FRAME_CPU_CANVAS === '1' });
      await page.goto(url);
      await page.waitForFunction(() => !!window.soraCars && document.fonts.status === 'loaded');
      const bundle = await page.locator('script[type="module"]').getAttribute('src');
      const bundleResponse = await page.request.get(new URL(bundle, url).href);
      const bundleSha256 = createHash('sha256').update(await bundleResponse.body()).digest('hex');
      await page.evaluate(track => window.soraCars.setTrack(track), track);
      await page.locator('#start-btn').click();
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).tick >= 12, null, { timeout: 90_000 });
      const start = await page.evaluate(() => {
        Object.assign(window.__frameTiming, { enabled: true, submitted: [], intervals: [], callbackMs: [], lastFrame: null });
        return { at: performance.now(), state: JSON.parse(window.render_game_to_text()) };
      });
      // Real elapsed time and the production animation loop: no advanceTime,
      // fake timers, stepped simulation, or synthetic rAF timestamps.
      await page.waitForTimeout(seconds * 1000);
      const finish = await page.evaluate(() => {
        window.__frameTiming.enabled = false;
        return { at: performance.now(), state: JSON.parse(window.render_game_to_text()), timing: window.__frameTiming };
      });
      await page.keyboard.up('ArrowUp');
      await page.screenshot({ path: `${output}/${mode}-track-${track}.png` });
      const duration = (finish.at - start.at) / 1000;
      const quantile = (values, portion) => values.length ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * portion)] : null;
      const row = { mode, track, cpuCanvas: process.env.SORA_CARS_FRAME_CPU_CANVAS === '1', browserVersion: browser.version(), seconds: duration, bundle, bundleSha256,
        viewport: { width: 1440, height: 900 },
        submittedFrames: finish.timing.submitted.length, submittedFramesPerSecond: finish.timing.submitted.length / duration,
        simulationTicksPerSecond: (finish.state.tick - start.state.tick) / duration,
        animationIntervalMs: { median: quantile(finish.timing.intervals, 0.5), p95: quantile(finish.timing.intervals, 0.95), max: Math.max(...finish.timing.intervals) },
        callbackCpuMs: { median: quantile(finish.timing.callbackMs, 0.5), p95: quantile(finish.timing.callbackMs, 0.95), max: Math.max(...finish.timing.callbackMs) },
        startState: start.state, finalState: finish.state, errors,
        limitation: 'Headless Chromium on this machine. CPU callback time excludes asynchronous GPU presentation; rAF cadence and canvas submission are measured, not display scanout. Concurrent host work is recorded separately.',
      };
      results.push(row); await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2) + '\n');
      console.log(JSON.stringify({ mode, track, submittedFps: row.submittedFramesPerSecond, simulationHz: row.simulationTicksPerSecond,
        frameP95Ms: row.animationIntervalMs.p95, cpuP95Ms: row.callbackCpuMs.p95, errors }));
      await page.close();
    }
  } finally { await browser.close(); }
}
