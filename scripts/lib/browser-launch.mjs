import { chromium } from 'playwright';

/**
 * Launches Chromium for a browser test with exactly the caller's options. If
 * Playwright's bundled browser is not installed, it retries once with the
 * system Chrome channel, as tmp/pixel-art/capture.mjs does, adding ANGLE's
 * Metal backend on macOS so WebGL runs on the real GPU. Any other launch
 * failure is rethrown unchanged.
 *
 * A browser that did launch is probed once for its WebGL renderer: Playwright's
 * headless shell (installed alongside the full browser) runs WebGL on
 * SwiftShader, where the race takes minutes per frame and tests time out. Such
 * a browser is replaced by system Chrome on the real GPU when one is available.
 */
export async function launchChromium(options = {}) {
  let browser;
  try {
    browser = await chromium.launch(options);
  } catch (error) {
    if (!String(error).includes("Executable doesn't exist") || options.channel === 'chrome') throw error;
    console.warn(`Playwright's bundled Chromium is not installed; using system Chrome (${gpuArgs(options).join(' ') || 'no extra flags'}).`);
    return chromium.launch({ ...options, channel: 'chrome', args: gpuArgs(options) });
  }
  if (options.channel === 'chrome' || options.channel === 'msedge') return browser;
  const renderer = await webglRenderer(browser).catch(() => '');
  if (!/swiftshader|llvmpipe|software/i.test(renderer)) return browser;
  try {
    const chrome = await chromium.launch({ ...options, channel: 'chrome', args: gpuArgs(options) });
    console.warn(`Playwright's browser renders WebGL in software (${renderer}); using system Chrome (${gpuArgs(options).join(' ')}).`);
    await browser.close();
    return chrome;
  } catch {
    return browser;
  }
}

function gpuArgs(options) {
  const args = [...(options.args ?? [])];
  if (process.platform === 'darwin' && !args.some(arg => arg.startsWith('--use-angle='))) args.push('--use-angle=metal');
  return args;
}

async function webglRenderer(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    return await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      if (!gl) return 'no webgl';
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    });
  } finally {
    await context.close();
  }
}
