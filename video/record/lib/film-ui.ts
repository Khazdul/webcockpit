// The films' menu-bar and pane steps with the hand-like pointer (take A of
// film 1, film2-a of film 2): a pane on from Panes, a pane's gear with its
// tooltip, a setting chosen after a rest. Every time is epoch ms (the
// scene's `T(s)`).
import type { Locator, Page } from '@playwright/test';
import type { Pointer } from './mouse.ts';
import type { Marks } from './timeline.ts';

export interface FilmUi {
  /** A menu-bar button. */
  mb(id: string): Locator;
  /** Escape: the open popup or window closes. */
  close(): Promise<void>;
  /** Panes pressed at `open`, the pane's row at `pick` (a `pane` marker), the popup closed. */
  paneOn(pane: string, open: number, pick: number): Promise<void>;
  /**
   * A pane's gear: the pointer onto the pane (its buttons show), onto the gear, which shows its
   * tooltip (`tip` marker: the page's own tooltip is the browser's, which a headless capture
   * does not draw, so the composition draws it from the marker), held, then the press.
   */
  gear(pane: string, tipAt: number, pressAt: number): Promise<Locator>;
  /** A setting: the pointer onto it, a pause of `wait` s so the eye finds it, then the press. */
  choose(el: Locator, at: number, kind: string, label: string, wait?: number): Promise<void>;
}

export function filmUi(page: Page, pointer: Pointer, marks: Marks): FilmUi {
  const mb = (id: string): Locator => page.locator(`.wc-mb[data-mb="${id}"]`);
  const close = async (): Promise<void> => {
    await page.keyboard.press('Escape');
  };
  return {
    mb,
    close,
    async paneOn(pane, open, pick) {
      const ons = (): Promise<Record<string, boolean>> =>
        page.evaluate(() => {
          const st = (window as unknown as { __wc: { settings: { get(): { panes: Record<string, { on?: boolean }> } } } }).__wc.settings.get();
          return Object.fromEntries(Object.entries(st.panes).map(([k, v]) => [k, v.on === true]));
        });
      const before = await ons();
      await pointer.clickAt(mb('panes'), open);
      // the popup morphs in (0.21): its rows move until it has landed, so the row's box is taken once it is still
      const row = page.locator(`.wc-pop-row[data-pane="${pane}"]`);
      await row.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {});
      let prev = await row.boundingBox();
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 40));
        const b = await row.boundingBox();
        if (b && prev && Math.abs(b.x - prev.x) < 0.3 && Math.abs(b.y - prev.y) < 0.3 && Math.abs(b.height - prev.height) < 0.3) break;
        prev = b;
      }
      marks.markAt(await pointer.clickAt(row, Math.max(pick, Date.now() + 150), { quick: true }), 'pane', pane);
      await new Promise((r) => setTimeout(r, 220));
      await close();
      const after = await ons();
      const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
      if (changed.length !== 1 || changed[0] !== pane) console.warn(`  Panes: ${pane} pressed, changed: ${changed.join(', ') || 'nothing'}`);
    },
    async gear(pane, tipAt, pressAt) {
      await pointer.hoverAt(page.locator(`.wc-pane-${pane} .wc-pane-content`), tipAt - 900);
      const g = page.locator(`.wc-pane-${pane} > .wc-pane-btn-gear`);
      await pointer.hoverAt(g, tipAt);
      const bx = await g.boundingBox();
      const title = (await g.getAttribute('title')) ?? `${pane[0]!.toUpperCase()}${pane.slice(1)} settings`;
      marks.mark('tip', title, bx ? { x: bx.x, y: bx.y, w: bx.width, h: bx.height } : null);
      marks.markAt(await pointer.pressAt(pressAt), 'tip-end', title);
      return page.locator(`.wc-sp-gear-${pane}`);
    },
    async choose(el, at, kind, label, wait = 2.0) {
      await pointer.hoverAt(el, at - wait * 1000);
      marks.markAt(await pointer.pressAt(at), kind, label);
    },
  };
}
