import type { Browser, LaunchOptions } from 'playwright';

export function launchChromium(options?: LaunchOptions): Promise<Browser>;
