// The notice indicator in the cockpit's input row, left of the menu bar
// (ADR 0099) or, on a phone, the clock strip (ADR 0025, src/app/notices.ts): e.g. `Update: 0.1.3` (C_YELLOW) and
// `Storage: not saved` (C_ERR), each with a tooltip. Empty (and taking no
// room) while there is nothing to say. Informational: clicking does
// nothing, since a reload would disconnect from the game.

import { type Notices, noticeIndicators } from '../app/notices';

export class NoticeIndicator {
  readonly el: HTMLSpanElement;
  private readonly off: () => void;

  constructor(doc: Document, notices: Notices, running: string) {
    this.el = doc.createElement('span');
    this.el.className = 'wc-input-notice';
    const draw = (): void => {
      const items = noticeIndicators(notices.get(), running);
      this.el.hidden = items.length === 0;
      this.el.replaceChildren(
        ...items.map((it) => {
          const s = doc.createElement('span');
          s.className = `wc-notice wc-notice-${it.key}`;
          s.textContent = it.text;
          s.title = it.title;
          return s;
        }),
      );
    };
    draw();
    this.off = notices.subscribe(draw);
  }

  dispose(): void {
    this.off();
    this.el.remove();
  }
}
