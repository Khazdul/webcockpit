// The import receipt (stage 43c, direction C "Importsidan", ADR 0128 and
// the ADR 0073 addendum; spec §2.11): the import page replaces itself by
// this frame after a successful import, so the box stays and morphs to
// the receipt's size (a tall normal box when there is a list to read).
//
//   [Back]                ( Import )
//     GIBUR   a new profile from gibur.set and 2 more files
//     JMC  (.set file name) (JMC state header)
//     ! JMC fires only the first matching action …     (file-wide warnings)
//     ✕ Missing files: spells.set
//     412 settings were translated, 9 kept as #nop, 6 skipped, and 4 need a look.
//     › KEPT AS #NOP                                    9
//         gibur.set:12  JScript
//         #scriptlet {…} …
//     › SKIPPED                                         6
//     › TRANSLATED WITH A WARNING                       4
//                                              [ OK ]
//
// A native profile that needed no change gets the short form ("TinTin++,
// 214 lines, nothing changed."). OK only (owner, 2026-11-07: no Edit; the
// new profile is selected and highlighted on the list, one key away).
//
// Keys: ↑↓ PgUp PgDn Home End scroll; Tab / Shift+Tab walk the group
// headers and OK (the keyboard's `is-sel`; nothing takes the DOM focus);
// Space, or Enter on a header, opens or closes that group; Enter
// elsewhere, O, Esc and Back are OK. OK pops the receipt (the list is
// below it) and `onOk` puts the list's cursor and flash on the profile.

import { Fragment, type VNode } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import type { ImportItem, ImportResult } from '../../import/types';
import { Box, BoxBody, BoxFoot, BoxHead, GlassButton, Icon, LookFlash, letterAction, lookFrame } from '../kit/look';
import { useKeys, useNav } from '../kit/stack';
import {
  type ImportGroup,
  formatName,
  itemAt,
  itemWhy,
  moreFiles,
  plural,
  reportGroups,
  sourceLine,
  summaryJoin,
  summaryParts,
  unchangedText,
} from './import-model';
import './import.css';

export interface ImportReceiptProps {
  result: ImportResult;
  /** The stored profile's name (after collisions). */
  name: string;
  /** The names of the files the user chose (or dropped). */
  files: readonly string[];
  /** Called after OK (or Esc) popped the receipt. */
  onOk?: () => void;
}

/** Scroll step of ↑ ↓ (px). */
const STEP = 44;

function Item(p: { it: ImportItem }): VNode {
  const it = p.it;
  return (
    <div class="wc-imp-it">
      <span class="wc-imp-at">{itemAt(it)}</span>
      <span class="wc-imp-why">
        {itemWhy(it)}
        {it.warning && (
          <>
            {'; '}
            <span class="wc-imp-w">{it.warning}</span>
          </>
        )}
      </span>
      <span class="wc-imp-src">{sourceLine(it.source)}</span>
    </div>
  );
}

/**
 * A collapsible group: a header button (the title, the count at the
 * right; `aria-expanded`) and its items while open. The kit's `Fold` has
 * no slot for the count, hence this local one (reported for wave 3).
 */
function Group(p: { g: ImportGroup; open: boolean; sel: boolean; onToggle(): void }): VNode {
  return (
    <section class={'wc-imp-grp' + (p.open ? ' is-open' : '') + (p.sel ? ' is-sel' : '')} data-grp={p.g.id}>
      <button
        type="button"
        class="wc-imp-grp-h"
        tabIndex={-1}
        aria-expanded={p.open ? 'true' : 'false'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          p.onToggle();
        }}
      >
        <i class="wc-imp-chev" aria-hidden="true" />
        <span class="wc-imp-grp-t">{p.g.title}</span>
        <span class="wc-imp-grp-n">{p.g.items.length}</span>
      </button>
      {p.open && (
        <div class="wc-imp-grp-b">
          {p.g.items.map((it, i) => (
            <Item key={i} it={it} />
          ))}
        </div>
      )}
    </section>
  );
}

export const ImportReceipt = lookFrame(function ImportReceipt(p: ImportReceiptProps): VNode {
  const nav = useNav();
  const r = p.result;
  const groups = useMemo(() => (r.unchanged ? [] : reportGroups(r)), [r]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(groups.slice(0, 1).map((g) => g.id)));
  /** The keyboard's stop: a group header (its index) or OK (`groups.length`). */
  const [stop, setStop] = useState(groups.length);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tall = groups.length > 0;

  const ok = (): void => {
    nav.pop();
    p.onOk?.();
  };
  const toggle = (i: number): void => {
    const g = groups[i];
    if (!g) return;
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(g.id)) n.delete(g.id);
      else n.add(g.id);
      return n;
    });
  };
  const scroll = (to: (el: HTMLElement) => number): boolean => {
    const el = bodyRef.current;
    if (el) el.scrollTop = to(el);
    return true;
  };
  const moveStop = (to: number): void => {
    setStop(to);
    // A header the keyboard lands on comes into view.
    const g = groups[to];
    const h = g && bodyRef.current?.querySelector<HTMLElement>(`[data-grp="${g.id}"] > .wc-imp-grp-h`);
    if (h && typeof h.scrollIntoView === 'function') h.scrollIntoView({ block: 'nearest' });
  };

  useKeys((e, nk) => {
    if (letterAction(e, { o: ok })) return true;
    const page = (el: HTMLElement): number => Math.max(STEP, el.clientHeight - 40);
    const n = groups.length + 1;
    switch (nk) {
      case 'back':
        ok();
        return true;
      case 'tab':
      case 'backtab':
        moveStop((stop + (nk === 'tab' ? 1 : n - 1)) % n);
        return true;
      case 'up':
        return scroll((el) => el.scrollTop - STEP);
      case 'down':
        return scroll((el) => el.scrollTop + STEP);
      case 'pgup':
        return scroll((el) => el.scrollTop - page(el));
      case 'pgdn':
        return scroll((el) => el.scrollTop + page(el));
      case 'home':
        return scroll(() => 0);
      case 'end':
        return scroll((el) => el.scrollHeight);
      case 'activate':
        if (stop < groups.length) toggle(stop);
        else ok();
        return true;
    }
    return false;
  });

  const more = moreFiles(p.files);
  const parts = summaryParts(r.counts);
  const notes = r.fileWarnings.length > 0 || r.missingFiles.length > 0;
  return (
    <Box title="Import" onBack={ok} tall={tall} class="wc-imp wc-imp-rc" winClass="wc-imp-win">
      <BoxHead class="wc-imp-head">
        <div class="wc-imp-who">
          <span class="wc-imp-name">{p.name}</span>
          <span class="wc-imp-from">
            a new profile from <b>{r.entry}</b>
            {more > 0 && ` and ${plural(more, 'more file')}`}
          </span>
        </div>
        <div class="wc-imp-fmt">
          <span class="wc-imp-f">{formatName(r.format)}</span>
          {r.signals.map((s) => (
            <span class="wc-imp-chip" key={s}>
              {s}
            </span>
          ))}
        </div>
      </BoxHead>
      <BoxBody class="wc-imp-body" bodyRef={bodyRef}>
        {notes && (
          <ul class="wc-imp-notes">
            {r.fileWarnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {r.missingFiles.length > 0 && (
              <li class="is-miss">
                Missing files: <span class="wc-imp-mono">{r.missingFiles.join(', ')}</span>
              </li>
            )}
          </ul>
        )}
        {r.unchanged ? (
          <div class="wc-imp-ok">
            <Icon name="check" class="wc-imp-ok-ic" />
            <span>
              {unchangedText(r)}
              <span class="wc-imp-ok-note">A WebCockpit profile as it is: every setting kept as written.</span>
            </span>
          </div>
        ) : (
          <>
            <p
              class="wc-imp-sum"
              data-translated={r.counts.translated}
              data-kept={r.counts.kept}
              data-skipped={r.counts.skipped}
              data-warnings={r.counts.warnings}
            >
              {parts.map((s, i) => (
                <Fragment key={i}>
                  {summaryJoin(i, parts.length)}
                  <b>{s.n}</b> {s.text}
                </Fragment>
              ))}
              .
            </p>
            {groups.length > 0 ? (
              <div class="wc-imp-acc">
                {groups.map((g, i) => (
                  <Group
                    key={g.id}
                    g={g}
                    open={open.has(g.id)}
                    sel={stop === i}
                    onToggle={() => {
                      setStop(i);
                      toggle(i);
                    }}
                  />
                ))}
              </div>
            ) : (
              <p class="wc-imp-fine">Every setting was translated as it was.</p>
            )}
          </>
        )}
      </BoxBody>
      <BoxFoot class="wc-imp-foot">
        <LookFlash class="wc-imp-flash" />
        <GlassButton
          id="OK"
          label="OK"
          letter="o"
          icon="check"
          primary
          selected={stop === groups.length}
          onClick={ok}
        />
      </BoxFoot>
    </Box>
  );
});
