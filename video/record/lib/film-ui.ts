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
      await pointer.clickAt(mb('panes'), open);
      marks.markAt(await pointer.clickAt(page.locator(`.wc-pop-row[data-pane="${pane}"]`), pick, { quick: true }), 'pane', pane);
      await new Promise((r) => setTimeout(r, 220));
      await close();
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
