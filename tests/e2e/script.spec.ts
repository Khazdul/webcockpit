// The script engine in the browser (stage 3, ADR 0015): aliases and macros
// against a mocked MUME WebSocket, and highlights/gags/#showme in replay
// mode. Nothing reaches the real server.
import { type Page, expect, test } from '@playwright/test';

const IAC = 255;
const WILL = 251;
const GMCP = 201;

const rows = (page: Page) => page.locator('.wc-rows .wc-row');

test('the default profile macros and a typed alias send to the game', async ({ page }) => {
  const received: Buffer[] = [];
  await page.routeWebSocket('wss://mume.org/ws-play/', (ws) => {
    ws.onMessage((m) => received.push(typeof m === 'string' ? Buffer.from(m) : m));
    ws.send(Buffer.from([IAC, WILL, GMCP]));
  });
  const sentText = () => Buffer.concat(received).toString('utf8');
  await page.goto('/');
  await expect(page.locator('.wc-start .wc-mrow.is-sel')).toHaveText('<< Enter MUME >>');
  await page.keyboard.press('Enter');
  await expect(page.locator('.wc-app')).toHaveAttribute('data-status', /^login/);
  await expect(rows(page).filter({ hasText: '[SYSTEM] Profile default loaded.' })).toHaveCount(1);

  // The template binds the numpad: Numpad8 → north (with or without NumLock).
  await page.keyboard.press('Numpad8');
  await expect.poll(sentText).toContain('north\r\n');
  await expect(page.locator('.wc-input-field')).toHaveValue('');

  // A runtime alias with a variable and ; splitting; the sends are echoed.
  await page.keyboard.type('#var t orc;#alias {kk} {kill %1.$t;#showme {<Fff0000>Target: %1}}');
  await page.keyboard.press('Enter');
  await page.keyboard.type('kk big');
  await page.keyboard.press('Enter');
  await expect.poll(sentText).toContain('kill big.orc\r\n');
  await expect(rows(page).filter({ hasText: /^kill big.orc$/ })).toHaveCount(1);
  const shown = rows(page).filter({ hasText: /^Target: big$/ });
  await expect(shown).toHaveCount(1);
  expect(await shown.locator('span').first().evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 0, 0)');
});

test('macros on printable keys win over typing (ADR 0026)', async ({ page }) => {
  await page.goto('/?replay');
  await expect(rows(page).first()).toHaveText(/Offline replay mode/);
  const r = await page.evaluate(() =>
    window.__wc!.app.applyProfile(['#macro {a} {#showme bare-a}', '#macro {Shift+B} {#showme shift-b}', '#macro {Shift+1} {#showme shift-1}'].join('\n')),
  );
  expect(r).toEqual({ ok: true, warnings: [] });
  const input = page.locator('.wc-input-field');
  await input.focus();
  await page.keyboard.press('KeyA');
  await page.keyboard.press('Shift+KeyB');
  await page.keyboard.press('Shift+Digit1');
  await page.keyboard.press('KeyB');
  await page.keyboard.press('Digit1');
  await expect(rows(page).filter({ hasText: /^bare-a$/ })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: /^shift-b$/ })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: /^shift-1$/ })).toHaveCount(1);
  await expect(input).toHaveValue('b1');
});

test('macros on dead keys fire once and leave no accent (ADR 0026)', async ({ page, browserName }) => {
  await page.goto('/?replay');
  await expect(rows(page).first()).toHaveText(/Offline replay mode/);
  const r = await page.evaluate(() =>
    window.__wc!.app.applyProfile(['#macro {Equal} {#showme acute}', '#macro {BracketRight} {#showme diaeresis}'].join('\n')),
  );
  expect(r).toEqual({ ok: true, warnings: [] });
  const input = page.locator('.wc-input-field');
  await input.focus();
  await page.keyboard.type('ab');

  // The owner's Firefox/Linux log, replayed as synthetic events: ´ (Equal)
  // then ¨ (BracketRight), both dead keys, the browser's text simulated.
  await page.evaluate(() => {
    const i = document.querySelector<HTMLInputElement>('.wc-input-field')!;
    const from = i.value.length;
    const down = (code: string, key: string, isComposing = false) =>
      i.dispatchEvent(new KeyboardEvent('keydown', { code, key, isComposing, bubbles: true, cancelable: true }));
    const up = (code: string) =>
      i.dispatchEvent(new KeyboardEvent('keyup', { code, key: 'Dead', isComposing: true, bubbles: true, cancelable: true }));
    const comp = (type: string, data: string) => i.dispatchEvent(new CompositionEvent(type, { data, bubbles: true }));
    const text = (t: string, isComposing = true) => {
      i.value = i.value.slice(0, from) + t;
      i.dispatchEvent(new InputEvent('input', { inputType: 'insertCompositionText', data: t, isComposing, bubbles: true }));
    };
    down('Equal', 'Dead');
    comp('compositionstart', '');
    down('Equal', 'Dead', true);
    comp('compositionupdate', '´');
    text('´');
    up('Equal');
    down('BracketRight', 'Dead', true);
    comp('compositionupdate', '´¨');
    text('´¨');
    up('BracketRight');
    down('', 'Process', true);
    comp('compositionend', '');
    text('', false);
  });
  await expect(rows(page).filter({ hasText: /^acute$/ })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: /^diaeresis$/ })).toHaveCount(1);
  await expect(input).toHaveValue('ab');
  await expect(input).toBeFocused();

  if (browserName === 'chromium') {
    // A real composition through the DevTools protocol: the dead keydown,
    // then the IME's text. The macro ends the composition; no ´ lands.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Dead', code: 'Equal', windowsVirtualKeyCode: 187 });
    await cdp.send('Input.imeSetComposition', { text: '´', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Dead', code: 'Equal', windowsVirtualKeyCode: 187 });
    await expect(rows(page).filter({ hasText: /^acute$/ })).toHaveCount(2);
    await expect(input).toHaveValue('ab');
    await page.keyboard.type('c');
    await expect(input).toHaveValue('abc');
    await expect(input).toBeFocused();

    // An unbound dead key (Shift+Equal, `) still composes: ` + e → è.
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Dead', code: 'Equal', modifiers: 8, windowsVirtualKeyCode: 187 });
    await cdp.send('Input.imeSetComposition', { text: '`', selectionStart: 1, selectionEnd: 1 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Dead', code: 'Equal', modifiers: 8, windowsVirtualKeyCode: 187 });
    await expect(input).toHaveValue('abc`');
    await cdp.send('Input.insertText', { text: 'è' });
    await expect(input).toHaveValue('abcè');
    await expect(rows(page).filter({ hasText: /^acute$/ })).toHaveCount(2);
  }
});

test('highlights, substitutes and gags change only the display in a replay', async ({ page }) => {
  await page.goto('/?replay');
  await expect(rows(page).first()).toHaveText(/Offline replay mode/);
  const r = await page.evaluate(() =>
    window.__wc!.app.applyProfile(
      [
        '#highlight {- sanctuary} {Magenta}',
        '#gag {^You hear some noise}',
        '#substitute {^%1 is stunned!} {<F23aaee>STUNNED: %1}',
        '#action {^Bob waves} {#showme {waved back}}',
      ].join('\n'),
    ),
  );
  expect(r).toEqual({ ok: true, warnings: [] });
  const log = [
    'You feel - sanctuary.',
    'You hear some noise to the east.',
    'An orc is stunned!',
    'Bob waves.',
    'The end.',
  ]
    .map((l, i) => `${1790366274272195 + i * 1000} ${l}`)
    .join('\n');
  await page.evaluate((t) => window.__wc!.app.startReplay(t, 'script.log', 0), log + '\n');
  await expect(rows(page).filter({ hasText: '[SYSTEM] Replay finished.' })).toHaveCount(1);
  const text = await rows(page).allTextContents();
  const i = text.indexOf('You feel - sanctuary.');
  expect(text.slice(i, i + 5)).toEqual(['You feel - sanctuary.', 'STUNNED: An orc', 'waved back', 'Bob waves.', 'The end.']);
  const hi = rows(page).filter({ hasText: 'You feel - sanctuary.' }).locator('span.wc-f13');
  await expect(hi).toHaveText('- sanctuary');
});
