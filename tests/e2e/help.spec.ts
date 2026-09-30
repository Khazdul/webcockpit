// `#help` on the input line (ADR 0037): the manual's list and one section
// in the game window, in the HELP view's colours. Replay mode; nothing
// reaches the real server.
import { type Locator, type Page, expect, test } from '@playwright/test';

const rows = (page: Page) => page.locator('.wc-rows .wc-row');
const field = (page: Page) => page.locator('.wc-input-field');
const color = (l: Locator) => l.evaluate((el) => getComputedStyle(el).color);
/** A theme token as the browser resolves it for the game pane. */
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${n})`;
    document.querySelector('.wc-rows')!.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, name);

async function type(page: Page, text: string): Promise<void> {
  await field(page).fill(text);
  await page.keyboard.press('Enter');
}

test('#help lists the commands and topics; #help al shows the section in the HELP colours', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The editor chunk must not be fetched for #help: the manual has its own.
  const scripts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname);
  });
  await page.goto('/?replay');
  await expect(rows(page).first()).toHaveText(/Offline replay mode/);

  // A user action and a highlight that would match help text: they must not fire.
  await type(page, '#action {pattern} {#showme {FIRED}};#highlight {Commands} {red}');
  const before = scripts.length;
  await type(page, '#help');
  const head = rows(page).filter({ hasText: /^Commands$/ });
  await expect(head).toHaveCount(1);
  await expect(head).toHaveClass(/wc-help-heading/);
  expect(await color(head)).toBe(await token(page, '--c-title'));
  await expect(head.locator('span')).toHaveCount(0);
  const list = head.locator('xpath=following-sibling::*[1]');
  await expect(list).toHaveText(/^ {4}#action +#alias +#class +#delay/);
  expect(await color(list.locator('.wc-syn-cmd').first())).toBe(await token(page, '--c-syn-cmd'));
  await expect(rows(page).filter({ hasText: /^Topics$/ })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: /^ {4}braces +arguments +variables +patterns/ })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: '#help <command> or #help <topic> shows the details' })).toHaveCount(1);
  await expect(page.locator('.wc-rows .wc-help').filter({ hasText: /#(connect|disconnect|reconnect|replay|runlog)/ })).toHaveCount(0);
  if (!info.project.use.baseURL?.includes('4173')) {
    // Dev serves modules one by one; the editor's own are never among them.
    expect(scripts.slice(before).filter((s) => /\/editor\/(frame|cm|index|logic)\./.test(s))).toEqual([]);
  }
  await page.screenshot({ path: info.outputPath('help-list.png') });

  // Two in a row keep their order; short forms resolve as commands do.
  await type(page, '#help al');
  await type(page, '#help foreach');
  await expect(rows(page).last()).toHaveText('[SYSTEM] #foreach: Not supported yet; kept in the profile as written.');
  const heading = rows(page).filter({ hasText: /^#alias$/ });
  await expect(heading).toHaveCount(1);
  await expect(heading).toHaveClass(/wc-help-heading/);
  const syntax = rows(page).filter({ hasText: /^ {4}#alias \{pattern\} \{commands\} \{priority\}$/ });
  await expect(syntax).toHaveCount(1);
  await expect(syntax).toHaveClass(/wc-help-syntax/);
  expect(await color(syntax)).toBe(await token(page, '--c-active'));
  expect(await syntax.evaluate((el) => getComputedStyle(el).fontWeight)).toBe('700');
  await expect(rows(page).filter({ hasText: /^ {4}#unalias \{pattern\}$/ })).toHaveCount(1);
  const body = rows(page).filter({ hasText: /^Replaces a command you type/ });
  await expect(body).toHaveClass(/wc-help-text/);
  expect(await color(body)).toBe(await token(page, '--c-body'));
  // A syntax-highlighted example, coloured as in the editor.
  const example = rows(page).filter({ hasText: /^ {4}#alias \{look\} \{look;exits\}$/ });
  await expect(example).toHaveClass(/wc-help-code/);
  const cmd = example.locator('span.wc-syn-cmd');
  await expect(cmd).toHaveText('#alias');
  expect(await color(cmd)).toBe(await token(page, '--c-syn-cmd'));
  expect(await color(example.locator('span.wc-syn-brace').first())).toBe(await token(page, '--c-syn-brace'));
  expect(await color(example.locator('span.wc-syn-delim'))).toBe(await token(page, '--c-syn-delim'));
  expect(await token(page, '--c-syn-cmd')).not.toBe(await token(page, '--c-body'));
  await page.screenshot({ path: info.outputPath('help-alias.png') });

  // No row is wider than the pane (nothing wraps on its own).
  const tall = await rows(page).evaluateAll((els) => {
    const h = Math.min(...els.map((e) => e.getBoundingClientRect().height).filter((x) => x > 0));
    return els.filter((e) => e.classList.contains('wc-help') && e.getBoundingClientRect().height > h * 1.5).length;
  });
  expect(tall).toBe(0);

  // "pattern" and "Commands" stand in the help text: the action did not
  // fire and the highlight did not colour it.
  // (The typed #action is confirmed with a row that shows its body, ADR 0039.)
  await expect(rows(page).filter({ hasText: /^FIRED$/ })).toHaveCount(0);

  await type(page, '#help colours');
  await expect(rows(page).filter({ hasText: /^Colours$/ })).toHaveCount(1);
  await type(page, '#help blah');
  await expect(rows(page).last()).toHaveText('[SYSTEM] No help for "blah". Type #help for the list.');
  expect(errors).toEqual([]);
});
