// Which Chromium launch flags give the page a GPU WebGL2 (the map needs it
// in a worker, on OffscreenCanvas) on this machine (ADR 0133):
//
//   node record/gpu-probe.ts
//
// Prints, per flag set, the WebGL2 renderer in the page and in a worker.
import { chromium } from '@playwright/test';

const SETS: Record<string, { channel?: 'chromium'; headless?: boolean; args: string[] }> = {
  'shell default': { args: [] },
  'new headless default': { channel: 'chromium', args: [] },
  'new headless angle=vulkan': { channel: 'chromium', args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] },
  'new headless angle=vulkan, no surface': { channel: 'chromium', args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan', '--disable-vulkan-surface'] },
  'new headless angle=gl': { channel: 'chromium', args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl'] },
  'new headless angle=gl-egl': { channel: 'chromium', args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl-egl'] },
  'new headless egl': { channel: 'chromium', args: ['--ignore-gpu-blocklist', '--use-gl=egl'] },
  'shell angle=vulkan': { args: ['--ignore-gpu-blocklist', '--use-angle=vulkan', '--enable-features=Vulkan'] },
  'shell angle=gl-egl': { args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl-egl'] },
  headed: { headless: false, args: [] },
};

const probe = (): string => {
  const c = new OffscreenCanvas(4, 4);
  const gl = c.getContext('webgl2');
  if (!gl) return 'no webgl2';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'webgl2 (renderer hidden)';
};

for (const [name, s] of Object.entries(SETS)) {
  try {
    const b = await chromium.launch({ headless: s.headless ?? true, ...(s.channel ? { channel: s.channel } : {}), args: s.args });
    const page = await b.newPage();
    await page.goto('about:blank');
    const main = await page.evaluate(probe);
    const worker = await page.evaluate(
      (src) =>
        new Promise<string>((resolve) => {
          const w = new Worker(URL.createObjectURL(new Blob([`postMessage((${src})())`], { type: 'text/javascript' })));
          w.onmessage = (e) => resolve(String(e.data));
          w.onerror = (e) => resolve(`worker error: ${e.message}`);
        }),
      probe.toString(),
    );
    console.log(`${name.padEnd(40)} page: ${main}\n${''.padEnd(40)} worker: ${worker}`);
    await b.close();
  } catch (err) {
    console.log(`${name.padEnd(40)} FAILED: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  }
}
