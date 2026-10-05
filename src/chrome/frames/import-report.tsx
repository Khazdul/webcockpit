// Import report (ADR 0073 §Report frame, spec §2.11): pushed over the
// profile picker after IMPORT. The header names the profile, the detected
// format with its deciding signals, the counts, file-wide warnings and the
// missing `#read` files. Below it a scrollable list grouped by outcome
// (kept, skipped, then translated with a warning), each item a row
// `file:line  reason` and its source text dimmed on the next row, cut to
// one line. A native profile that needed no change gets the short form
// ("TinTin++, N lines, nothing changed").
//
// Keys: Tab/Shift+Tab move between the list and the buttons; ↑↓ PgUp/PgDn
// Home/End scroll the list; ←→ pick a button; Enter presses it (in the
// list, Enter pages). ESC is OK. Buttons: EDIT (the profile editor for the
// new profile) and OK (back to the picker).

import type { VNode } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import type { ImportFormat, ImportItem, ImportResult } from '../../import/types';
import { useGrid, useServices } from '../kit/hooks';
import { centreLeft, truncate, wrapText } from '../kit/nav';
import { TuiScrollbar, useScrollBox } from '../kit/scroll';
import { useKeys, useNav } from '../kit/stack';
import { Blank, Button, FlashRow, Page, cellsWide, indent, useBodyRows } from '../kit/widgets';
import { editProfile } from './profile-edit';

/** One coloured run of a report row. */
export interface ReportSeg {
  text: string;
  cls: string;
}

export type ReportRow = ReportSeg[];

const FORMAT_NAMES: Record<ImportFormat, string> = { tintin: 'TinTin++', jmc: 'JMC', powwow: 'Powwow', mudlet: 'Mudlet' };

export const formatName = (f: ImportFormat): string => FORMAT_NAMES[f];

const lineCount = (text: string): number => {
  const t = text.replace(/\n+$/, '');
  return t === '' ? 0 : t.split('\n').length;
};

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** The counts line: `Translated n · Kept n · Skipped n · Warnings n`. */
export function countsText(r: ImportResult): string {
  const c = r.counts;
  return `Translated ${c.translated} · Kept ${c.kept} · Skipped ${c.skipped} · Warnings ${c.warnings}`;
}

/** The fixed rows above the list, wrapped to `width`. */
export function reportHeader(r: ImportResult, name: string, width: number): ReportRow[] {
  const out: ReportRow[] = [];
  const wrapped = (text: string, cls: string, mark = ''): void =>
    wrapText(text, Math.max(10, width - mark.length)).forEach((l, i) =>
      out.push([
        { text: i === 0 ? mark : ' '.repeat(mark.length), cls: 'wc-c-yellow' },
        { text: l, cls },
      ]),
    );
  out.push([
    { text: 'Profile  ', cls: 'wc-c-body' },
    { text: name, cls: 'wc-c-accent' },
  ]);
  if (r.unchanged) {
    out.push([
      { text: 'Format   ', cls: 'wc-c-body' },
      { text: `${formatName(r.format)}, ${plural(lineCount(r.profileText), 'line')}, nothing changed`, cls: 'wc-c-active' },
    ]);
    return out;
  }
  const signals = r.signals.length > 0 ? ` (${r.signals.join(', ')})` : '';
  out.push([
    { text: 'Format   ', cls: 'wc-c-body' },
    { text: formatName(r.format), cls: 'wc-c-active' },
    { text: truncate(signals, Math.max(0, width - 9 - formatName(r.format).length)), cls: 'wc-c-hint' },
  ]);
  out.push([{ text: countsText(r), cls: 'wc-c-body' }]);
  for (const w of r.fileWarnings) wrapped(w, 'wc-c-body', '! ');
  if (r.missingFiles.length > 0) wrapped(`Missing files: ${r.missingFiles.join(', ')}`, 'wc-c-danger');
  return out;
}

/** The items worth a row, grouped: kept, skipped, translated with a warning. */
export function reportGroups(r: ImportResult): { title: string; items: ImportItem[] }[] {
  const kept = r.items.filter((i) => i.outcome === 'kept');
  const skipped = r.items.filter((i) => i.outcome === 'skipped');
  const warned = r.items.filter((i) => i.outcome === 'translated' && i.warning);
  return [
    { title: 'KEPT', items: kept },
    { title: 'SKIPPED', items: skipped },
    { title: 'WARNINGS', items: warned },
  ].filter((g) => g.items.length > 0);
}

/** The scrollable list: a heading per group, two rows per item. */
export function reportRows(r: ImportResult, width: number): ReportRow[] {
  const out: ReportRow[] = [];
  if (r.unchanged) return out;
  const groups = reportGroups(r);
  groups.forEach((g, gi) => {
    if (gi > 0) out.push([]);
    out.push([{ text: `${g.title} (${g.items.length})`, cls: 'wc-c-title' }]);
    for (const it of g.items) {
      const at = `${it.file}:${it.line}  `;
      const why = [it.reason, it.warning].filter(Boolean).join('; ') || it.outcome;
      const lines = wrapText(why, Math.max(10, width - at.length));
      lines.forEach((l, i) =>
        out.push(i === 0 ? [{ text: at, cls: 'wc-c-item' }, { text: l, cls: 'wc-c-body' }] : [{ text: ' '.repeat(at.length) + l, cls: 'wc-c-body' }]),
      );
      const src = it.source.split('\n').find((l) => l.trim() !== '') ?? '';
      const more = it.source.trim().includes('\n') ? ' …' : '';
      out.push([{ text: truncate('    ' + src.trim() + more, width), cls: 'wc-c-hint' }]);
    }
  });
  if (groups.length === 0) out.push([{ text: 'Every setting was translated as it was.', cls: 'wc-c-hint' }]);
  return out;
}

const BUTTONS = ['EDIT', 'OK'] as const;
type ButtonId = (typeof BUTTONS)[number];
const BUTTON_W = 8;
const BUTTON_GAP = 4;

export interface ImportReportProps {
  result: ImportResult;
  /** The stored profile's name (after collisions). */
  name: string;
  /** Called after OK (or ESC) popped the frame. */
  onClose?: () => void;
}

export function ImportReportFrame(p: ImportReportProps): VNode {
  const { profiles, onProfileSaved } = useServices();
  const nav = useNav();
  const { cols } = useGrid();
  const bodyRows = useBodyRows();
  const width = Math.max(20, Math.min(cols - 4, 96));
  const header = useMemo(() => reportHeader(p.result, p.name, width), [p.result, p.name, width]);
  const rows = useMemo(() => reportRows(p.result, width), [p.result, width]);
  const hasList = rows.length > 0;
  const [zone, setZone] = useState<'list' | 'buttons'>('buttons');
  const [btn, setBtn] = useState(1);
  const box = useScrollBox();

  // Header, blank, list, blank, buttons, blank, flash.
  const listRows = hasList ? Math.max(3, Math.min(rows.length, bodyRows - header.length - 5)) : 0;
  const at = centreLeft(cols, width + 2);

  const close = (): void => {
    nav.pop();
    p.onClose?.();
  };
  const press = (b: ButtonId): void => {
    if (b === 'OK') return close();
    void editProfile(nav, profiles, p.name, { isLive: () => false, onSaved: onProfileSaved });
  };

  useKeys((_e, nk) => {
    switch (nk) {
      case 'back':
        close();
        return true;
      case 'tab':
      case 'backtab':
        if (hasList) setZone(zone === 'list' ? 'buttons' : 'list');
        return true;
      case 'left':
      case 'right':
        setZone('buttons');
        setBtn(nk === 'left' ? 0 : 1);
        return true;
      case 'up':
        box.by(-1);
        return true;
      case 'down':
        box.by(1);
        return true;
      case 'pgup':
        box.page(-1);
        return true;
      case 'pgdn':
        box.page(1);
        return true;
      case 'home':
        box.home();
        return true;
      case 'end':
        box.end();
        return true;
      case 'activate':
        if (zone === 'list') box.page(1);
        else press(BUTTONS[btn]!);
        return true;
    }
    return false;
  });

  const line = (r: ReportRow, i: number): VNode => (
    <div class="wc-line" key={i}>
      {r.map((s) => (
        <span class={s.cls}>{s.text}</span>
      ))}
    </div>
  );
  const btnW = BUTTONS.length * BUTTON_W + (BUTTONS.length - 1) * BUTTON_GAP;
  const height = `calc(var(--cell-h) * ${listRows})`;

  return (
    <Page
      title="IMPORT REPORT"
      footer={hasList ? ['↑↓ Scroll', 'Tab/←→ Cycle', 'Enter Select', 'ESC OK'] : ['←→ Cycle', 'Enter Select', 'ESC OK']}
    >
      <div class="wc-import-head" style={indent(at)}>
        {header.map(line)}
      </div>
      <Blank />
      {hasList && (
        <>
          <div
            class={'wc-import-list wc-scrollrow' + (zone === 'list' ? ' is-focus' : '')}
            style={{ ...indent(at), height }}
            onMouseDown={() => setZone('list')}
          >
            <div class="wc-scrollbox" ref={box.ref} style={{ ...cellsWide(width), height }}>
              {rows.map(line)}
            </div>
            <div class="wc-cell-gap" />
            <TuiScrollbar target={box.ref} rows={listRows} />
          </div>
          <Blank />
        </>
      )}
      <div class="wc-line wc-import-btns" style={indent(centreLeft(cols, btnW))}>
        {BUTTONS.map((b, i) => (
          <>
            {i > 0 && ' '.repeat(BUTTON_GAP)}
            <Button
              label={b}
              width={BUTTON_W}
              selected={i === btn}
              focused={zone === 'buttons'}
              onClick={() => {
                setBtn(i);
                setZone('buttons');
                press(b);
              }}
            />
          </>
        ))}
      </div>
      <Blank />
      <FlashRow />
    </Page>
  );
}
