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
// - The character (ADR 0134): name, level and XP to the next level from
//   `Char.*` (the Character pane's model), told to the view only when one
//   of them changed (a Char.Vitals with only HP in it costs a compare).
// - The pane's colours (ADR 0134): the shade ramp's text, label and track
//   shades and light or dark on the content element, as Timers sets its
//   `--tm-*`; the view's CSS reads them.

import { xpToNextLevel } from '../gmcp/levels';
import type { PaneContext, StatsChar, StatsPaneView } from './context';
import { PaneShell } from './pane';
import { paneShade } from './shade';

export class StatsPane extends PaneShell {
  private view: StatsPaneView | null = null;
  private mounting = false;
  private disposedView = false;

  constructor(ctx: PaneContext) {
    super(ctx, 'statistics');
    this.content.classList.add('wc-stats-host');
    this.own(ctx.settings.subscribe(() => this.markDirty()));
    this.own(
      ctx.game.subscribe((part) => {
        if (part === 'char' && this.readChar()) this.markDirty();
      }),
    );
    this.readChar();
    this.own(
      this.onResize((cols, rows) => {
        // Hidden: tell the view now (render does not run while hidden).
        if (cols === 0 || rows === 0) this.view?.resize(0, 0);
      }),
    );
  }

  protected override render(): void {
    this.paint();
    if (this.view) {
      this.pushChar();
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
        this.pushChar();
        v.resize(this.visible ? this.cols : 0, this.visible ? this.rows : 0);
      },
      () => {
        // The chunk did not load: try again on the next show.
        this.mounting = false;
      },
    );
  }

  /** The character now, and what the view was last told. */
  private char: StatsChar = { name: null, level: null, tnl: null };
  private toldChar: StatsChar | null = null;

  /** Reads the character from the game state; true when it changed. */
  private readChar(): boolean {
    const c = this.ctx.game.char;
    const v = c.view();
    const xp = c.vitals.get('xp');
    const tnl = typeof xp === 'number' && Number.isFinite(xp) ? xpToNextLevel(xp) : null;
    const n = this.char;
    if (n.name === v.name && n.level === v.level && n.tnl === tnl) return false;
    this.char = { name: v.name, level: v.level, tnl };
    return true;
  }

  private pushChar(): void {
    if (!this.view?.setChar || this.toldChar === this.char) return;
    this.toldChar = this.char;
    this.view.setChar(this.char);
  }

  /** The shade of this pane on the content element (written only when it changes). */
  private shadeKey = '';
  private paint(): void {
    const shade = paneShade(this.ctx.settings.get(), 'statistics');
    const key = `${shade.light ? 1 : 0}|${shade.ramp.vtext}|${shade.ramp.label}|${shade.ramp.track}`;
    if (key === this.shadeKey) return;
    this.shadeKey = key;
    const c = this.content;
    c.toggleAttribute('data-light', shade.light);
    c.style.setProperty('--st-fg', shade.ramp.vtext);
    c.style.setProperty('--st-dim', shade.ramp.label);
    c.style.setProperty('--st-track', shade.ramp.track);
  }

  override dispose(): void {
    this.disposedView = true;
    this.view?.dispose();
    this.view = null;
    super.dispose();
  }
}
