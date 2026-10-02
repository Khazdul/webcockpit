// Options (Inv §3.5, §3.7, §4.4, §2.1), shared by the start page and the
// ESC menu. Every change is written to the settings store at once and
// applies live (ADR 0010: one store, no launcher/popup asymmetry), so
// there is no Apply and Back never discards.
//
//   Options hub:  Panes · Mapper · Appearance · Spotlights · Scripts · Back
//                 (Scripts only with a script library)
//   Panes hub:    General · Timers · Communication · Group · Back
//                 (Cockpit's order)
//   General:      pane × colour grid with a Border column, reset layout
//   Timers:       options-timers.tsx
//   Communication: comm-options.tsx
//   Group:        options-group.tsx
//   Mapper:       options-mapper.tsx (ADR 0020)
//   Appearance:   font, size, padding, cursor, colours, scrollback, ANSI palette,
//                 live preview box
//   Spotlights:   options-spotlights.tsx
//   Scripts:      scripts.tsx (ADR 0051)

import type { VNode } from 'preact';
import { useState } from 'preact/hooks';
import { PANE_COLORS, PANE_IDS, PANE_LABELS, type PaneColor, type PaneId, defaultLayout } from '../../layout/types';
import {
  CURSOR_STYLES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  PADDING_MAX,
  PADDING_MIN,
  PADDING_STEP,
  SCROLLBACK_CHOICES,
  defaultSettings,
} from '../../settings';
import { FONTS, effectiveFont, fontChoices } from '../../theme/fonts';
import {
  ANSI_NAMES,
  DOS_PALETTE,
  INPUT_COLORS,
  INPUT_COLOR_IDS,
  type NamedColor,
  TERMINAL_BG_PRESETS,
  TERMINAL_FG_PRESETS,
  presetName,
} from '../../theme/presets';
import { useGrid, useServices, useSettings } from '../kit/hooks';
import { CommOptionsFrame } from './comm-options';
import { GroupOptionsFrame } from './options-group';
import { MapperOptionsFrame } from './options-mapper';
import { ScriptsFrame } from './scripts';
import { SpotlightsOptionsFrame } from './options-spotlights';
import { TimersOptionsFrame } from './options-timers';
import { centreLeft, cycle, stepValue } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import {
  Blank,
  Centered,
  CheckCell,
  FlashRow,
  Line,
  type MenuItem,
  MenuRows,
  Page,
  TextField,
  ensureVisible,
  menuKey,
  useMenuCursor,
} from '../kit/widgets';

const MENU_FOOTER = ['↑↓ Navigate', 'Enter Select', 'ESC Back'];

// ------------------------------------------------------------------ hub

export function OptionsHub(): VNode {
  const nav = useNav();
  const { scripts } = useServices();
  const items: MenuItem[] = [
    { key: 'panes', label: 'Panes', activate: () => nav.push(<PanesHub />) },
    { key: 'mapper', label: 'Mapper', activate: () => nav.push(<MapperOptionsFrame />) },
    { key: 'appearance', label: 'Appearance', activate: () => nav.push(<AppearanceFrame />) },
    { key: 'spotlights', label: 'Spotlights', activate: () => nav.push(<SpotlightsOptionsFrame />) },
    ...(scripts ? [{ key: 'scripts', label: 'Scripts', activate: () => nav.push(<ScriptsFrame />) }] : []),
    { key: 'sp', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));
  return (
    <Page title="Options" footer={MENU_FOOTER}>
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
    </Page>
  );
}

// ------------------------------------------------------------ panes hub

/** Options → Panes: one entry per page (ADR 0016 P1). */
export function PanesHub(): VNode {
  const nav = useNav();
  const items: MenuItem[] = [
    { key: 'general', label: 'General', activate: () => nav.push(<PanesFrame />) },
    { key: 'timers', label: 'Timers', activate: () => nav.push(<TimersOptionsFrame />) },
    { key: 'comm', label: 'Communication', activate: () => nav.push(<CommOptionsFrame />) },
    { key: 'group', label: 'Group', activate: () => nav.push(<GroupOptionsFrame />) },
    { key: 'sp', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));
  return (
    <Page title="Panes" footer={MENU_FOOTER}>
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
    </Page>
  );
}

// -------------------------------------------------------- panes: general

/** Grid columns: the seven tints, then Border. */
const GRID_COLS = PANE_COLORS.length + 1;
const BORDER_COL = PANE_COLORS.length;
const LABEL_W = 12;
/** `[X]███` plus one space. */
const CELL_W = 7;

/** The next pane state after clicking column `col` of `id`'s row (Inv §2.1 grid rules). */
export function gridToggle(
  pane: { on: boolean; color: PaneColor; border: boolean },
  col: number,
): { on: boolean; color: PaneColor; border: boolean } {
  if (col === BORDER_COL) return { ...pane, border: !pane.border };
  const color = PANE_COLORS[col]!;
  if (pane.on && pane.color === color) return { ...pane, on: false };
  return { ...pane, on: true, color };
}

export function PanesFrame(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const nav = useNav();
  const { cols } = useGrid();
  const [row, setRow] = useState(0);
  const [col, setCol] = useState(0);

  const toggle = (id: PaneId, c: number): void => {
    settings.update((d) => {
      d.panes[id] = gridToggle(d.panes[id], c);
    });
  };
  const resetLayout = (): void => {
    settings.update({ layout: defaultLayout() });
    nav.flash('Layout reset.');
  };
  const tail: MenuItem[] = [
    { key: 'reset', label: 'Reset layout', activate: resetLayout },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const tailIdx = row - PANE_IDS.length;
  // Rows: the panes, then the tail (Reset layout, Back).
  const ROWS = PANE_IDS.length + tail.length;

  useKeys((_e, nk) => {
    switch (nk) {
      case 'up':
        setRow(Math.max(0, row - 1));
        return true;
      case 'down':
        setRow(Math.min(ROWS - 1, row + 1));
        return true;
      case 'tab':
        setRow((row + 1) % ROWS);
        return true;
      case 'backtab':
        setRow((row + ROWS - 1) % ROWS);
        return true;
      case 'left':
      case 'right': {
        const d = nk === 'left' ? -1 : 1;
        if (row < PANE_IDS.length) setCol(Math.max(0, Math.min(GRID_COLS - 1, col + d)));
        else tail[tailIdx]?.adjust?.(d);
        return true;
      }
      case 'activate':
        if (row < PANE_IDS.length) toggle(PANE_IDS[row]!, col);
        else menuKey(tail, tailIdx, () => {}, 'activate');
        return true;
    }
    return false;
  });

  const gridW = LABEL_W + PANE_COLORS.length * CELL_W + 'Border'.length;
  const at = centreLeft(cols, gridW);
  const header =
    ' '.repeat(LABEL_W) +
    PANE_COLORS.map((c) => PANE_TINT_LABEL[c].padEnd(CELL_W)).join('') +
    'Border';
  return (
    <Page title="General" footer={['↑↓←→ Move', 'Enter Toggle', 'ESC Back']}>
      <Line at={at} class="wc-c-hint">
        {header}
      </Line>
      {PANE_IDS.map((id, r) => {
        const p = s.panes[id];
        const off = !p.on;
        return (
          <Line at={at} class="wc-grid-row">
            <span class={off ? 'wc-c-off' : 'wc-c-item'}>{PANE_LABELS[id].padEnd(LABEL_W)}</span>
            {PANE_COLORS.map((c, ci) => (
              <>
                <CheckCell
                  checked={p.on && p.color === c}
                  cursor={row === r && col === ci}
                  swatch={c === 'black' ? '' : `var(--pane-bg-${c})`}
                  off={off}
                  title={`${PANE_LABELS[id]}: ${PANE_TINT_LABEL[c]}`}
                  onHover={() => {
                    setRow(r);
                    setCol(ci);
                  }}
                  onClick={() => {
                    setRow(r);
                    setCol(ci);
                    toggle(id, ci);
                  }}
                />{' '}
              </>
            ))}
            <CheckCell
              checked={p.border}
              cursor={row === r && col === BORDER_COL}
              off={off}
              title={`${PANE_LABELS[id]}: border`}
              onHover={() => {
                setRow(r);
                setCol(BORDER_COL);
              }}
              onClick={() => {
                setRow(r);
                setCol(BORDER_COL);
                toggle(id, BORDER_COL);
              }}
            />
          </Line>
        );
      })}
      <Blank />
      <MenuRows
        items={tail}
        cursor={tailIdx}
        setCursor={(i) => setRow(PANE_IDS.length + i)}
        hoverMoves
      />
      <Blank />
      <FlashRow />
    </Page>
  );
}

const PANE_TINT_LABEL: Readonly<Record<PaneColor, string>> = {
  black: 'None',
  red: 'Red',
  green: 'Green',
  blue: 'Blue',
  grey: 'Grey',
  orange: 'Orange',
  purple: 'Purple',
};

// ----------------------------------------------------------- appearance

/** Cycle list for a colour: the presets, with an off-palette value first. */
export function colorChoices(presets: readonly NamedColor[], cur: string): string[] {
  const hexes = presets.map((p) => p.hex);
  return hexes.includes(cur.toLowerCase()) ? hexes : [cur.toLowerCase(), ...hexes];
}

const colorName = (presets: readonly NamedColor[], hex: string): string => presetName(presets, hex) ?? hex;

/** `20000` → `20 000`. */
export function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+$)/g, ' ');
}

/** `#rgb`, `#rrggbb` or without `#` → `#rrggbb`, else null. */
export function parseHex(s: string): string | null {
  const t = s.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{6}$/.test(t)) return '#' + t;
  if (/^[0-9a-f]{3}$/.test(t)) return '#' + [...t].map((c) => c + c).join('');
  return null;
}

const PREVIEW = [
  'A Quiet Glade',
  'Tall beeches ring a small clearing carpeted',
  'with moss. A thin stream winds between the',
  'roots and vanishes into the ferns to the south.',
  'Exits: north, south.',
];
/** The last preview line: a game prompt and an echoed command (the input colour). */
const PREVIEW_PROMPT = '*> ';
const PREVIEW_ECHO = 'north';
const PREVIEW_W = 50;

export function AppearanceFrame(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const a = s.appearance;
  const nav = useNav();
  const { cols } = useGrid();
  const [palCol, setPalCol] = useState(0);

  const set = (patch: Partial<typeof a>): void => settings.update({ appearance: patch });
  const pal = (row: 0 | 1): MenuItem => ({
    key: `pal${row}`,
    adjust: (d) => setPalCol(Math.max(0, Math.min(7, palCol + d))),
    activate: () => nav.push(<HexFrame index={row * 8 + palCol} />),
  });
  const items: MenuItem[] = [
    {
      key: 'font',
      // A stored font that is not installed here shows (and renders) as
      // DejaVu Sans Mono (ADR 0049).
      label: `Font: ${FONTS[effectiveFont(a.font)].label}`,
      activate: () => nav.push(<FontPicker />),
      adjust: (d) => set({ font: cycle(fontChoices(), effectiveFont(a.font), d) }),
    },
    {
      key: 'size',
      label: `Size: ${a.size}`,
      stepper: true,
      adjust: (d) => set({ size: stepValue(a.size, d, FONT_SIZE_MIN, FONT_SIZE_MAX) }),
    },
    {
      key: 'padding',
      label: `Padding: ${a.padding}`,
      stepper: true,
      adjust: (d) => set({ padding: stepValue(a.padding, d, PADDING_MIN, PADDING_MAX, PADDING_STEP) }),
    },
    {
      key: 'cursor',
      label: `Cursor style: ${a.cursorStyle}`,
      adjust: (d) => set({ cursorStyle: cycle(CURSOR_STYLES, a.cursorStyle, d) }),
    },
    { key: 'blink', label: `Cursor blink: ${a.cursorBlink ? 'On' : 'Off'}`, adjust: () => set({ cursorBlink: !a.cursorBlink }) },
    {
      key: 'fg',
      label: `Font color: ${colorName(TERMINAL_FG_PRESETS, a.fg)}`,
      adjust: (d) => set({ fg: cycle(colorChoices(TERMINAL_FG_PRESETS, a.fg), a.fg.toLowerCase(), d) }),
    },
    {
      key: 'bg',
      label: `Background: ${colorName(TERMINAL_BG_PRESETS, a.bg)}`,
      adjust: (d) => set({ bg: cycle(colorChoices(TERMINAL_BG_PRESETS, a.bg), a.bg.toLowerCase(), d) }),
    },
    {
      key: 'input',
      label: `Input color: ${INPUT_COLORS[a.inputColor].label}`,
      adjust: (d) => set({ inputColor: cycle(INPUT_COLOR_IDS, a.inputColor, d) }),
    },
    {
      key: 'scrollback',
      label: `Scrollback: ${groupDigits(s.output.scrollback)} lines`,
      adjust: (d) => settings.update({ output: { scrollback: cycle(SCROLLBACK_CHOICES, s.output.scrollback, d) } }),
    },
    { key: 'sp1', spacer: true },
    pal(0),
    pal(1),
    {
      key: 'resetpal',
      label: 'Reset palette',
      activate: () => {
        set({ ansi: DOS_PALETTE.slice() });
        nav.flash('Palette reset.');
      },
    },
    {
      key: 'reset',
      label: 'Reset appearance',
      activate: () => {
        settings.update({ appearance: defaultSettings().appearance });
        nav.flash('Appearance reset.');
      },
    },
    { key: 'sp2', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));

  const P = items.findIndex((it) => it.key === 'pal0'); // the two palette rows
  const before = items.slice(0, P);
  const after = items.slice(P + 2);
  const palAt = centreLeft(cols, 8 * 5 - 1);
  const onPal = cursor === P || cursor === P + 1;
  const palIndex = (cursor === P + 1 ? 8 : 0) + palCol;
  const boxAt = centreLeft(cols, PREVIEW_W + 2);
  const footer = onPal
    ? ['↑↓←→ Move', 'Enter Edit', 'ESC Back']
    : ['↑↓ Navigate', '←→ Adjust', 'Enter Select', 'ESC Back'];

  return (
    <Page title="Appearance" footer={footer}>
      <MenuRows items={before} cursor={cursor} setCursor={setCursor} />
      <Centered text="ANSI palette" class="wc-c-body" />
      {[0, 1].map((row) => (
        <PaletteRow
          row={row}
          at={palAt}
          ansi={a.ansi}
          cursorCol={cursor === P + row ? palCol : -1}
          onPick={(c) => {
            setCursor(P + row);
            setPalCol(c);
          }}
          onOpen={(c) => nav.push(<HexFrame index={row * 8 + c} />)}
        />
      ))}
      <Centered
        text={onPal ? `${palIndex} ${ANSI_NAMES[palIndex]}  ${a.ansi[palIndex]}` : ''}
        class="wc-c-hint"
      />
      <MenuRows
        items={after}
        cursor={cursor - P - 2}
        setCursor={(i) => setCursor(P + 2 + i)}
      />
      <Blank />
      <FlashRow />
      <Blank />
      <div class="wc-preview">
        <Line at={boxAt} class="wc-box">
          {'┌' + '─'.repeat(PREVIEW_W) + '┐'}
        </Line>
        {PREVIEW.map((l, i) => (
          <Line at={boxAt}>
            <span class="wc-box">│</span>
            <span class="wc-preview-text" style={{ color: i === 0 ? 'var(--ansi-2)' : 'var(--term-fg)' }}>
              {(' ' + l).padEnd(PREVIEW_W)}
            </span>
            <span class="wc-box">│</span>
          </Line>
        ))}
        <Line at={boxAt}>
          <span class="wc-box">│</span>
          <span class="wc-preview-text" style={{ color: 'var(--term-fg)' }}>
            {' ' + PREVIEW_PROMPT}
          </span>
          <span class="wc-preview-echo" style={{ color: 'var(--term-echo)' }}>
            {PREVIEW_ECHO.padEnd(PREVIEW_W - 1 - PREVIEW_PROMPT.length)}
          </span>
          <span class="wc-box">│</span>
        </Line>
        <Line at={boxAt} class="wc-box">
          {'└' + '─'.repeat(PREVIEW_W) + '┘'}
        </Line>
      </div>
    </Page>
  );
}

function PaletteRow(p: {
  row: number;
  at: number;
  ansi: readonly string[];
  cursorCol: number;
  onPick: (col: number) => void;
  onOpen: (col: number) => void;
}): VNode {
  return (
    <Line at={p.at}>
      {Array.from({ length: 8 }, (_, c) => {
        const i = p.row * 8 + c;
        const cur = c === p.cursorCol;
        return (
          <>
            {c > 0 && ' '}
            <span
              class={'wc-pal' + (cur ? ' is-cursor' : '')}
              data-ansi={i}
              title={`${i} ${ANSI_NAMES[i]} ${p.ansi[i]}`}
              ref={(el) => {
                if (cur && el) ensureVisible(el);
              }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                if (cur) p.onOpen(c);
                else p.onPick(c);
              }}
            >
              <span class="wc-pal-br">{cur ? '[' : ' '}</span>
              <span style={{ color: `var(--ansi-${i})` }}>██</span>
              <span class="wc-pal-br">{cur ? ']' : ' '}</span>
            </span>
          </>
        );
      })}
    </Line>
  );
}

/**
 * Font picker (Inv §3.7 `terminal_font_picker`): the bundled families, and
 * Lucida Console where it is installed (ADR 0049).
 */
function FontPicker(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const nav = useNav();
  const current = effectiveFont(s.appearance.font);
  const items: MenuItem[] = [
    ...fontChoices().map((id) => ({
      key: id,
      glyph: current === id ? '(•)' : '( )',
      label: FONTS[id].label,
      activate: () => {
        settings.update({ appearance: { font: id } });
        nav.pop();
      },
    })),
    { key: 'sp', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items, current);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));
  return (
    <Page title="Font" footer={MENU_FOOTER}>
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
    </Page>
  );
}

/** One ANSI colour as a hex value. */
function HexFrame(p: { index: number }): VNode {
  const { settings } = useServices();
  const nav = useNav();
  const { cols } = useGrid();
  const cur = settings.get().appearance.ansi[p.index]!;
  const [value, setValue] = useState(cur);
  const [error, setError] = useState('');
  const confirm = (): void => {
    const hex = parseHex(value);
    if (!hex) return setError('Use #rrggbb, e.g. #ff5f5f.');
    settings.update((d) => {
      d.appearance.ansi[p.index] = hex;
    });
    nav.pop();
    nav.flash(`ANSI ${p.index} set to ${hex}.`);
  };
  useKeys((e, nk) => {
    if (nk === 'activate' && e.key === 'Enter') {
      confirm();
      return true;
    }
    return false;
  });
  const w = 14;
  return (
    <Page
      title={`ANSI ${p.index}: ${ANSI_NAMES[p.index]}`}
      footer={[
        { text: 'Enter Confirm', onClick: confirm },
        { text: 'ESC Cancel', onClick: () => nav.pop() },
      ]}
    >
      <Centered text={`Now ${cur}  ███`} width={cur.length + 9}>
        <span class="wc-c-body">{`Now ${cur}  `}</span>
        <span style={{ color: `var(--ansi-${p.index})` }}>███</span>
      </Centered>
      <Blank />
      <TextField
        value={value}
        onInput={(v) => {
          setValue(v);
          setError('');
        }}
        width={w}
        at={centreLeft(cols, w)}
        maxLength={7}
        label={`ANSI colour ${p.index}`}
      />
      <Centered text="#rrggbb" class="wc-c-hint" />
      {error ? <Centered text={error} class="wc-c-danger" /> : <Blank />}
    </Page>
  );
}
