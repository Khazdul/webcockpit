// The highlight entry's detail (stage 43a, ADR 0128): the styles as kit
// checks, the Text and Background swatch grids (7 colours × dark /
// bright, the page's own drawing in the terminal's palette), the "Kept as
// written" note for a body the picker cannot read, and "Shows as", the
// pattern in its colours on the game's background.

import type { VNode } from 'preact';
import { Check } from '../../chrome/kit/look';
import { HL_COLORS, HL_STYLES, HL_STYLE_NAMES, type HighlightSpec, ansiIndex, highlightStyle, parseHighlight, showsAs } from '../logic';

export interface GridPos {
  r: number;
  c: number;
}

export type HlDim = 'fg' | 'bg';

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

/** Presses never move the DOM focus (the frame stack keeps it). */
const keepFocus = (e: MouseEvent): void => e.preventDefault();

export function HighlightDetail(p: {
  pattern: string;
  body: string;
  /** The keyboard is on the styles (`style`), a grid (`text`, `bg`), or elsewhere. */
  at: 'style' | 'text' | 'bg' | null;
  styleCur: number;
  textCur: GridPos;
  bgCur: GridPos;
  onStyle(i: number): void;
  onPick(dim: HlDim, pos: GridPos): void;
}): VNode {
  const parsed = parseHighlight(p.body);
  const s: HighlightSpec = parsed ?? { styles: [], fg: null, bg: null };
  const css = highlightStyle(p.body);
  const grid = (dim: HlDim, cap: string): VNode => {
    const cur = dim === 'fg' ? p.textCur : p.bgCur;
    const kb = p.at === (dim === 'fg' ? 'text' : 'bg');
    const pick = s[dim];
    return (
      <div class="wc-pe-swgrid" data-dim={dim} role="group" aria-label={cap}>
        <span class="wc-pe-swcap">{cap}</span>
        {HL_COLORS.map((name, r) =>
          [0, 1].map((c) => {
            const on = !!pick && pick.row === r && pick.bright === c;
            return (
              <button
                type="button"
                key={`${r}-${c}`}
                class={cx('wc-pe-sw', on && 'is-on', kb && cur.r === r && cur.c === c && 'is-sel')}
                data-swatch={`${dim}-${r}-${c}`}
                tabIndex={-1}
                title={`${c ? 'light ' : ''}${name}`}
                aria-pressed={on ? 'true' : 'false'}
                style={{ background: `var(--ansi-${ansiIndex({ row: r, bright: c ? 1 : 0 })})` }}
                onMouseDown={keepFocus}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onPick(dim, { r, c });
                }}
              />
            );
          }),
        )}
      </div>
    );
  };
  return (
    <div class="wc-pe-hl">
      {parsed === null && p.body.trim() !== '' && (
        <p class="wc-pe-verb">
          Kept as written: <code>{p.body}</code>. Choosing a style or colour replaces it.
        </p>
      )}
      <span class="wc-lk-lbl">Style</span>
      <div class="wc-pe-styles" role="group" aria-label="Style">
        {HL_STYLES.map((st, i) => (
          <span key={st} class={cx('wc-pe-style', p.at === 'style' && p.styleCur === i && 'is-sel')} data-style={st}>
            <Check checked={s.styles.includes(st)} label={HL_STYLE_NAMES[st]} onChange={() => p.onStyle(i)} />
          </span>
        ))}
      </div>
      <div class="wc-pe-swatches">
        {grid('fg', 'Text')}
        {grid('bg', 'Background')}
      </div>
      <div class="wc-pe-shows">
        <span class="wc-lk-lbl">Shows as</span>
        <span class="wc-pe-sample" style={css ?? undefined}>
          {showsAs(p.pattern)}
        </span>
      </div>
    </div>
  );
}
