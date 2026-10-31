// Statistics pane (stage 30 S7, ADR 0109): the live Statistics view as a
// built-in pane. This file is only the shell: the pane's content element
// is the host the chrome chunk's view (src/chrome/stats-pane.tsx) is
// mounted into on the pane's first show, through `ctx.statsView`, so the
// cockpit chunk and the HTML replay bundle do not carry the view.
//
// - The view follows the content size (`resize(cols, rows)`); hidden, the
//   pane tells it 0 × 0 and the view stops its timers and subscriptions.
// - No keys: the pane never takes the focus (the view prevents the
//   mousedown, the cockpit's mouseup gives the keys to the game input).
// - Without `ctx.statsView` (the log player, tests) it stays empty.

import type { PaneContext, StatsPaneView } from './context';
import { PaneShell } from './pane';

export class StatsPane extends PaneShell {
  private view: StatsPaneView | null = null;
  private mounting = false;
  private disposedView = false;

  constructor(ctx: PaneContext) {
    super(ctx, 'statistics');
    this.content.classList.add('wc-stats-host');
    this.own(
      this.onResize((cols, rows) => {
        // Hidden: tell the view now (render does not run while hidden).
        if (cols === 0 || rows === 0) this.view?.resize(0, 0);
      }),
    );
  }

  protected override render(): void {
    if (this.view) {
      this.view.resize(this.cols, this.rows);
      return;
    }
    const mount = this.ctx.statsView;
    if (!mount || this.mounting) return;
    this.mounting = true;
    mount(this.content).then(
      (v) => {
        if (this.disposedView) {
          v.dispose();
          return;
        }
        this.view = v;
        v.resize(this.visible ? this.cols : 0, this.visible ? this.rows : 0);
      },
      () => {
        // The chunk did not load: try again on the next show.
        this.mounting = false;
      },
    );
  }

  override dispose(): void {
    this.disposedView = true;
    this.view?.dispose();
    this.view = null;
    super.dispose();
  }
}
