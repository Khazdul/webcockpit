// The browser a scene is recorded in: Playwright's Chromium in one of the
// capture modes measured for ADR 0133, a page at 1600×900 CSS px with
// MUME's date pinned and the user's keys and pointer logged for overlays.
import { type Browser, type BrowserContext, type Page, chromium } from '@playwright/test';
import { pinGameMoment } from '../../../scripts/lib/mume-feed.ts';

export const VIEWPORT = { width: 1600, height: 900 };

export interface CaptureMode {
  /** Headed: a real window (XWayland or Wayland), drawn on the GPU. */
  headed: boolean;
  /** Device pixel ratio: the recording is VIEWPORT × dpr. */
  dpr: number;
  /** Playwright's channel: undefined = the headless shell (headless) or Chromium (headed); 'chromium' = Chromium's new headless mode. */
  channel?: 'chromium';
  /** Extra Chromium switches. */
  args?: string[];
  /** The screencast's image format. */
  format: 'jpeg' | 'png';
  /** JPEG quality, 0–100. */
  quality?: number;
}

/**
 * The discrete GPU (NVIDIA) for a headless Chromium: ANGLE on Vulkan without
 * a window surface. Plain `--use-angle=vulkan` leaves the page without
 * WebGL2 (the map then shows "WebGL2 is not available"); `gpu-probe.ts`
 * lists what each flag set gives.
 */
const NVIDIA = ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--disable-vulkan-surface', '--enable-gpu-rasterization'];
/** The integrated GPU (Intel, Mesa) for a headless Chromium: ANGLE on OpenGL ES (what a headed window uses here too). */
const INTEL = ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--enable-gpu-rasterization'];

/** The capture modes (measured in ADR 0133); DEFAULT_MODE is the one it chose. */
export const MODES: Record<string, CaptureMode> = {
  // Playwright's headless shell as it comes: SwiftShader (CPU) for WebGL and raster.
  'headless-2': { headed: false, dpr: 2, format: 'jpeg', quality: 95 },
  'headless-1.5': { headed: false, dpr: 1.5, format: 'jpeg', quality: 95 },
  // Chromium's new headless mode on a GPU.
  'nvidia-2': { headed: false, dpr: 2, channel: 'chromium', args: NVIDIA, format: 'jpeg', quality: 95 },
  'nvidia-2-png': { headed: false, dpr: 2, channel: 'chromium', args: NVIDIA, format: 'png' },
  'nvidia-2-q100': { headed: false, dpr: 2, channel: 'chromium', args: NVIDIA, format: 'jpeg', quality: 100 },
  'intel-2': { headed: false, dpr: 2, channel: 'chromium', args: INTEL, format: 'jpeg', quality: 95 },
  'intel-1.5': { headed: false, dpr: 1.5, channel: 'chromium', args: INTEL, format: 'jpeg', quality: 95 },
  'intel-2-png': { headed: false, dpr: 2, channel: 'chromium', args: INTEL, format: 'png' },
  'intel-2-q90': { headed: false, dpr: 2, channel: 'chromium', args: INTEL, format: 'jpeg', quality: 90 },
  'intel-2-novsync': { headed: false, dpr: 2, channel: 'chromium', args: [...INTEL, '--disable-gpu-vsync'], format: 'jpeg', quality: 95 },
  'intel-shell-2': { headed: false, dpr: 2, args: [...INTEL.slice(0, 2), '--use-angle=gl-egl', '--enable-gpu-rasterization'], format: 'jpeg', quality: 95 },
  // A real window (XWayland/Wayland, the Intel GPU). Under a tiling compositor (Hyprland) its size is not ours to set.
  'headed-2': { headed: true, dpr: 2, format: 'jpeg', quality: 95 },
  'headed-2-png': { headed: true, dpr: 2, format: 'png' },
};
export const DEFAULT_MODE = 'intel-2';

export async function launch(mode: CaptureMode): Promise<Browser> {
  return chromium.launch({
    headless: !mode.headed,
    ...(mode.channel ? { channel: mode.channel } : {}),
    args: [
      ...(mode.args ?? []),
      // The screencast captures at the screen's scale, not the context's emulated one: the screen gets the same.
      `--force-device-scale-factor=${mode.dpr}`,
      // A recording must not be throttled when its window is covered or unfocused.
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      ...(mode.headed ? [`--window-size=${VIEWPORT.width},${VIEWPORT.height + 120}`] : []),
    ],
  });
}

/**
 * Keys and pointer events in the page, epoch ms: the same wall clock as the
 * screencast's frame timestamps, so the recorder turns them into the
 * timeline's `input` (s from the first frame, video px).
 */
export interface InputEvent {
  at: number;
  type: string;
  key?: string;
  x?: number;
  y?: number;
}

export async function newPage(browser: Browser, mode: CaptureMode, baseURL: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: mode.dpr, baseURL });
  await pinGameMoment(ctx);
  await ctx.addInitScript(() => {
    const log: { at: number; type: string; key?: string; x?: number; y?: number }[] = [];
    (window as unknown as { __recInput: typeof log }).__recInput = log;
    const opt = { capture: true, passive: true };
    addEventListener('keydown', (e) => log.push({ at: Date.now(), type: 'key', key: e.key }), opt);
    addEventListener('pointerdown', (e) => log.push({ at: Date.now(), type: 'down', x: e.clientX, y: e.clientY }), opt);
    addEventListener('pointerup', (e) => log.push({ at: Date.now(), type: 'up', x: e.clientX, y: e.clientY }), opt);
    // Every move: a later scene's cursor overlay follows the pointer through the Settings popup.
    addEventListener('pointermove', (e) => log.push({ at: Date.now(), type: 'move', x: e.clientX, y: e.clientY }), opt);
    addEventListener('wheel', (e) => log.push({ at: Date.now(), type: 'wheel', x: e.clientX, y: e.clientY }), opt);
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn(`  page error: ${e.message}`));
  return { ctx, page };
}

/** The input events logged since the page loaded. */
export async function inputEvents(page: Page): Promise<InputEvent[]> {
  return page.evaluate(() => (window as unknown as { __recInput?: InputEvent[] }).__recInput ?? []);
}
