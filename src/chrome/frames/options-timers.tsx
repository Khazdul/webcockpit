// Options → Panes → Timers (Inv §2.6.3, ADR 0122): the Timers gear popup's
// settings on the TUI page.
//
//   ─── Timers ───
//      << Style: Bars >>
//      << Layout: Flow >>
//      << Grid columns: Auto >>
//         [X] Group headers
//         [X] Time text
//      << Ending soon: Time text >>
//      << Warn at: 20s >>
//         [X] Soonest first
//
//         [X] Sanctuary  colour: Auto
//      << Sanctuary layout: Default >>
//         …  (one pair per group)
//
//      << Back >>
//          ↑↓ Move · ←→ Adjust · Enter Toggle · ESC Back
//
// A group's first row shows or hides it (Enter) and steps its colour (←→)
// through Auto and the twelve picker colours (`colorCycle`, shared with the
// Group page); the second steps its layout. Every change goes to the
// settings store at once, so the pane follows live on both surfaces. The
// choices and labels are shared with the Timers gear popup
// (../pane-options-model.ts).

import type { VNode } from 'preact';
import { TIMER_GROUP_LAYOUTS, TIMER_LAYOUTS, TIMER_SIGNALS, TIMER_STYLES, TIMER_WARN_CHOICES } from '../../settings';
import { TIMER_GROUPS, TIMER_GROUP_LABELS } from '../../timers/entry';
import { useServices, useSettings } from '../kit/hooks';
import { cycle } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { type MenuItem, MenuRows, Page, menuKey, useMenuCursor } from '../kit/widgets';
import {
  TIMER_COLS_CHOICES,
  TIMER_GROUP_LAYOUT_LABEL,
  TIMER_LAYOUT_LABEL,
  TIMER_SIGNAL_LABEL,
  TIMER_STYLE_LABEL,
  colsLabel,
  patchTimerGroup,
  setTimers,
} from '../pane-options-model';
import { colorCycle, colorName } from './options-group';

export function TimersOptionsFrame(): VNode {
  const { settings } = useServices();
  const t = useSettings().timers;
  const nav = useNav();
  const flip = (k: 'headers' | 'timeText' | 'soonestFirst') => (): void => setTimers(settings, { [k]: !settings.get().timers[k] });
  const items: MenuItem[] = [
    { key: 'style', label: `Style: ${TIMER_STYLE_LABEL[t.style]}`, adjust: (d) => setTimers(settings, { style: cycle(TIMER_STYLES, t.style, d) }) },
    { key: 'layout', label: `Layout: ${TIMER_LAYOUT_LABEL[t.layout]}`, adjust: (d) => setTimers(settings, { layout: cycle(TIMER_LAYOUTS, t.layout, d) }) },
    { key: 'cols', label: `Grid columns: ${colsLabel(t.cols)}`, adjust: (d) => setTimers(settings, { cols: cycle(TIMER_COLS_CHOICES, t.cols, d) }) },
    { key: 'headers', glyph: t.headers ? '[X]' : '[ ]', label: 'Group headers', activate: flip('headers'), adjust: flip('headers') },
    { key: 'timetext', glyph: t.timeText ? '[X]' : '[ ]', label: 'Time text', activate: flip('timeText'), adjust: flip('timeText') },
    { key: 'signal', label: `Ending soon: ${TIMER_SIGNAL_LABEL[t.signal]}`, adjust: (d) => setTimers(settings, { signal: cycle(TIMER_SIGNALS, t.signal, d) }) },
    { key: 'warn', label: `Warn at: ${t.warnAt}s`, adjust: (d) => setTimers(settings, { warnAt: cycle(TIMER_WARN_CHOICES, t.warnAt, d) }) },
    { key: 'soonest', glyph: t.soonestFirst ? '[X]' : '[ ]', label: 'Soonest first', activate: flip('soonestFirst'), adjust: flip('soonestFirst') },
    { key: 'sp1', spacer: true },
    ...TIMER_GROUPS.flatMap((g): MenuItem[] => {
      const gs = t.groups[g];
      const name = TIMER_GROUP_LABELS[g];
      const show = (): void => patchTimerGroup(settings, g, { enabled: !settings.get().timers.groups[g].enabled });
      return [
        {
          key: `g-${g}`,
          glyph: gs.enabled ? '[X]' : '[ ]',
          label: `${name.padEnd(9)} colour: ${colorName(gs.color)}`,
          activate: show,
          adjust: (d) => {
            const list = colorCycle(gs.color);
            const at = list.findIndex((c) => c.toLowerCase() === gs.color.toLowerCase());
            patchTimerGroup(settings, g, { color: list[(at + d + list.length) % list.length]! });
          },
        },
        {
          key: `l-${g}`,
          label: `${name} layout: ${TIMER_GROUP_LAYOUT_LABEL[gs.layout]}`,
          dim: !gs.enabled,
          adjust: (d) => patchTimerGroup(settings, g, { layout: cycle(TIMER_GROUP_LAYOUTS, gs.layout, d) }),
        },
      ];
    }),
    { key: 'sp2', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));
  return (
    <Page title="Timers" footer={['↑↓ Move', '←→ Adjust', 'Enter Toggle', 'ESC Back']}>
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} hoverMoves />
    </Page>
  );
}
