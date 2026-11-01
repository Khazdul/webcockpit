import { chromium } from '/home/ole/proj/webcockpit/node_modules/@playwright/test/index.mjs';
import { gameFeed, gmcpBytes, IAC, WILL, GMCP } from './feed.ts';
export const BASE = 'http://localhost:5199';
export const OUT = process.env.OUT ?? './phone-shots/'; // was a session scratchpad path
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export { chromium };
export async function phoneCtx(b, o: { w?: number; h?: number } = {}) {
  const ctx = await b.newContext({ baseURL: BASE, viewport: { width: o.w ?? 390, height: o.h ?? 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  PAGEERROR', e.message));
  return { ctx, page };
}
export async function startPage(page, q = '?phone=1') {
  await page.goto('/' + q);
  await page.locator('.wc-start .wc-mrow.is-sel').first().waitFor();
}
export async function live(page) {
  let server = null;
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    server = ws;
    ws.onMessage((m) => { if (Buffer.from(m).includes('Core.Ping')) ws.send(gmcpBytes('Core.Ping')); });
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  await startPage(page);
  await page.locator('.wc-start .wc-mrow[data-key="enter"] .wc-label').tap();
  await page.waitForFunction(() => /^login/.test(document.querySelector('.wc-app')?.getAttribute('data-status') ?? ''));
  const input = page.locator('.wc-input-field');
  for (const s of gameFeed('mid')) {
    if ('cmd' in s) { await input.focus(); await page.keyboard.insertText(s.cmd); await page.keyboard.press('Enter'); await sleep(20); }
    else { server.send(s.out); await sleep(25); }
  }
  await input.fill('');
  await input.blur();
  return server;
}
