// Options → Text input (ADR 0066): how the command line behaves and how
// its caret looks.
//
//   ─── Text input ───
//      [X] Auto-clear input
//      [X] Input autosuggest
//      << Cursor style: block >>
//      << Cursor blink: Off >>
//
//      << Back >>
//
// The settings keys are unchanged: `input.autoClear`, `input.autosuggest`
// (ADR 0063) and `appearance.cursorStyle`, `appearance.cursorBlink`. Every
// change is written to the store at once and applies live.

import type { VNode } from 'preact';
import { CURSOR_STYLES } from '../../settings';
import { useServices, useSettings } from '../kit/hooks';
import { cycle } from '../kit/nav';
import { useKeys, useNav } from '../kit/stack';
import { type MenuItem, MenuRows, Page, menuKey, useMenuCursor } from '../kit/widgets';

export function TextInputOptionsFrame(): VNode {
  const { settings } = useServices();
  const s = useSettings();
  const nav = useNav();
  const { input, appearance: a } = s;
  const toggleClear = (): void => settings.update({ input: { autoClear: !input.autoClear } });
  const toggleSuggest = (): void => settings.update({ input: { autosuggest: !input.autosuggest } });
  const items: MenuItem[] = [
    {
      key: 'autoclear',
      glyph: input.autoClear ? '[X]' : '[ ]',
      label: 'Auto-clear input',
      activate: toggleClear,
      adjust: toggleClear,
    },
    {
      key: 'autosuggest',
      glyph: input.autosuggest ? '[X]' : '[ ]',
      label: 'Input autosuggest',
      activate: toggleSuggest,
      adjust: toggleSuggest,
    },
    {
      key: 'cursor',
      label: `Cursor style: ${a.cursorStyle}`,
      adjust: (d) => settings.update({ appearance: { cursorStyle: cycle(CURSOR_STYLES, a.cursorStyle, d) } }),
    },
    {
      key: 'blink',
      label: `Cursor blink: ${a.cursorBlink ? 'On' : 'Off'}`,
      adjust: () => settings.update({ appearance: { cursorBlink: !a.cursorBlink } }),
    },
    { key: 'sp', spacer: true },
    { key: 'back', label: 'Back', activate: () => nav.pop() },
  ];
  const [cursor, setCursor] = useMenuCursor(items);
  useKeys((_e, nk) => menuKey(items, cursor, setCursor, nk));
  return (
    <Page title="Text input" footer={['↑↓ Navigate', '←→ Adjust', 'Enter Select', 'ESC Back']}>
      <MenuRows items={items} cursor={cursor} setCursor={setCursor} />
    </Page>
  );
}
