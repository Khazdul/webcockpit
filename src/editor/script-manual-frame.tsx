// The script MANUAL (stage 10 feedback rounds 1 and 3): a full-screen
// frame with the guide, the A–Z API reference and the Lua reference
// (script-reference.ts; the Lua index's names are links) in the
// profile editor's HELP layout (manual-view.tsx). Opened from the script
// editor (MANUAL, F1 at the name under the cursor) and from the Scripts
// page; ESC goes back, and the editor below keeps its buffer, cursor and
// search. Ctrl+F finds in the manual (ADR 0070; ESC closes the panel first).

import type { VNode } from 'preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useGrid } from '../chrome/kit/hooks';
import { escHints } from '../chrome/kit/esc';
import { cellLen, centreLeft, truncate } from '../chrome/kit/nav';
import { type Nav, useKeys } from '../chrome/kit/stack';
import { indent } from '../chrome/kit/widgets';
import { helpFrame, helpMenu, helpMenuWidth } from './help';
import { type ManualControl, type ManualZone, ManualView } from './manual-view';
import { indexLinkOf, manualSectionOf, scriptManualLayout, scriptManualSections } from './script-reference';

/** Footer hints, longest first; the first that fits is shown. */
const BODY_HINTS = [
  '↑↓ Scroll · ← Menu · PgUp/PgDn Page · n/p Heading · Ctrl+F Find · Tab Cycle · ESC Back',
  '↑↓ Scroll · ← Menu · PgUp/PgDn Page · n/p Heading · Tab Cycle · ESC Back',
  '↑↓ Scroll · ← Menu · n/p Heading · Ctrl+F Find · ESC Back',
  '↑↓ Scroll · ← Menu · n/p Heading · ESC Back',
  '↑↓ Scroll · ESC Back',
];
const MENU_HINTS = [
  '↑↓ Section · → Manual · PgUp/PgDn Page · n/p Heading · Ctrl+F Find · Tab Cycle · ESC Back',
  '↑↓ Section · → Manual · PgUp/PgDn Page · n/p Heading · Tab Cycle · ESC Back',
  '↑↓ Section · → Manual · Ctrl+F Find · ESC Back',
  '↑↓ Section · → Manual · ESC Back',
  '↑↓ Section · ESC Back',
];
const NARROW_HINTS = [
  '↑↓ Scroll · PgUp/PgDn Page · n/p Heading · Ctrl+F Find · ESC Back',
  '↑↓ Scroll · PgUp/PgDn Page · n/p Heading · ESC Back',
  '↑↓ Scroll · Ctrl+F Find · ESC Back',
  '↑↓ Scroll · ESC Back',
];

/** Pushes the manual, at the reference entry or section of `name` when there is one. */
export function openScriptManual(nav: Nav, name?: string): void {
  const i = name ? manualSectionOf(name) : -1;
  nav.push(<ScriptManual section={i >= 0 ? i : 0} />);
}

export function ScriptManual({ section: initial = 0 }: { section?: number }): VNode {
  const { cols, rows, surface } = useGrid();
  const [zone, setZone] = useState<ManualZone>('help');
  const ctl = useRef<ManualControl | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const sections = scriptManualSections();
  const menu = useMemo(() => helpMenu(sections), [sections]);
  const menuW = useMemo(() => helpMenuWidth(menu), [menu]);
  const hf = helpFrame(cols, menuW);
  const layout = useMemo(() => scriptManualLayout(hf.width - 2), [hf.width]);
  const gap = surface === 'start' ? 2 : 1;
  // gap + title + blank + manual + blank + footer
  const height = Math.max(3, rows - gap - 4);
  const z: ManualZone = hf.menu ? zone : 'help';

  // The root holds the keyboard, unless the find field has it.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const active = root?.ownerDocument.activeElement;
    if (!root || active === root || (active && root.contains(active) && active.closest('.wc-search'))) return;
    root.focus({ preventScroll: true });
  });

  useKeys((e, nk) => {
    // Find in the manual: Ctrl+F, the panel's keys; ESC closes it first.
    const found = ctl.current?.findKey(e) ?? null;
    if (found !== null) return found;
    if ((nk === 'tab' || nk === 'backtab') && hf.menu) {
      setZone(z === 'menu' ? 'help' : 'menu');
      return true;
    }
    const r = ctl.current?.key(e, nk, z) ?? false;
    return r === 'up-out' ? true : r;
  });

  const title = truncate('─── Script Manual ───', cols);
  const hints = !hf.menu ? NARROW_HINTS : z === 'menu' ? MENU_HINTS : BODY_HINTS;
  const hint = truncate(hints.find((h) => cellLen(h) <= cols) ?? hints.at(-1)!, cols);

  /** A Lua index line's name as a link to its entry. */
  function indexLinks(text: string): string | (string | VNode)[] {
    const hit = indexLinkOf(text);
    if (!hit) return text;
    return [
      '- ',
      <a
        class="wc-about-link"
        href={`#${hit.name}`}
        onClick={(e) => {
          e.preventDefault();
          ctl.current?.goto(hit.section);
        }}
      >
        {hit.name}
      </a>,
      text.slice(2 + hit.name.length),
    ];
  }

  return (
    <div class="wc-page wc-ped wc-sman" ref={rootRef} tabIndex={-1} data-zone={z}>
      <div class="wc-line" style={{ height: `calc(var(--cell-h) * ${gap})` }} />
      <div class="wc-line wc-ped-title">
        <span style={indent(centreLeft(cols, cellLen(title)))} class="wc-c-section">
          {title}
        </span>
      </div>
      <div class="wc-line" />
      <ManualView
        layout={layout}
        menu={hf.menu ? menu : null}
        menuW={menuW}
        width={hf.width}
        height={height}
        focus={z}
        onZone={setZone}
        ctl={ctl}
        initial={initial}
        text={indexLinks}
      />
      <div class="wc-ped-spacer" />
      <div class="wc-line" />
      <div class="wc-line wc-footer wc-ped-footer wc-c-hint" style={indent(centreLeft(cols, cellLen(hint)))}>
        {escHints(hint)}
      </div>
    </div>
  );
}
