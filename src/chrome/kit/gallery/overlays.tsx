// The kit gallery's "Overlays" section (stage 42c, ADR 0127): every dialog
// shape as an overlay frame (a question with Y / N / Esc, an input dialog
// with a Field, an error dialog, an any-key dialog, the keys box), an
// inline dialog, a popover with controls, a list and a grid with their
// cursors, and a button zone. Dev only (the gallery is not in a normal
// build). Layout by inline styles: the section has no stylesheet of its own.
//
// Keys (outside text fields): Q I E A K the dialogs, L the inline dialog,
// P the popover, G the keys to the list or the grid, O R D the zone's
// buttons; Tab the button zone, the arrows the list (or the grid).

import type { Ref, VNode } from 'preact';
import { useRef, useState } from 'preact/hooks';
import {
  Dialog,
  Field,
  GlassButton,
  LookFlash,
  Popover,
  Rule,
  Seg,
  Toggle,
  letterAction,
  lookFrame,
  openKeyHelp,
  useButtonZone,
  useGridCursor,
  useListCursor,
} from '../look';
import { useNav } from '../stack';
import { type KitSection, useKitKeys } from './kit';

type Done = (out: string) => void;

const QuestionFrame = lookFrame(function QuestionFrame(p: { done: Done }): VNode {
  const nav = useNav();
  const end = (out: string, flash?: string): void => {
    if (flash) nav.flash(flash);
    nav.pop();
    p.done(out);
  };
  return (
    <Dialog
      title="Delete"
      dlg="question"
      onCancel={() => end('question: cancelled')}
      buttons={[
        { id: 'YES', label: 'Yes', letter: 'y', primary: true, danger: true, run: () => end('question: yes', 'Deleted “gibur”.') },
        { id: 'NO', label: 'No', letter: 'n', run: () => end('question: no') },
      ]}
    >
      <p class="wc-lk-q">Delete the profile “gibur”?</p>
      <p class="wc-lk-qn">Its triggers, aliases and keys go with it.</p>
    </Dialog>
  );
});

const InputFrame = lookFrame(function InputFrame(p: { done: Done }): VNode {
  const nav = useNav();
  const [name, setName] = useState('gibur');
  const [error, setError] = useState<string | null>(null);
  const end = (out: string): void => {
    nav.pop();
    p.done(out);
  };
  const ok = (): void => {
    const n = name.trim();
    if (!n) return setError('A name is needed.');
    if (n.toLowerCase() === 'default') return setError('“default” is taken.');
    end(`input: ${n}`);
  };
  return (
    <Dialog
      title="Rename"
      dlg="input"
      error={error}
      onCancel={() => end('input: cancelled')}
      buttons={[
        { id: 'OK', label: 'Rename', primary: true, run: ok },
        { id: 'CANCEL', label: 'Cancel', letter: 'c', run: () => end('input: cancelled') },
      ]}
    >
      <p class="wc-lk-qn">A new name for “gibur”.</p>
      <Field
        label="Name"
        id="name"
        value={name}
        onInput={(v) => {
          setName(v);
          setError(null);
        }}
        maxLength={40}
        autoFocus
        selectAll
      />
    </Dialog>
  );
});

const ErrorFrame = lookFrame(function ErrorFrame(p: { done: Done }): VNode {
  const nav = useNav();
  const end = (): void => {
    nav.pop();
    p.done('error: ok');
  };
  return (
    <Dialog
      title="Import"
      dlg="error"
      error="The file is not a profile backup."
      onCancel={end}
      buttons={[{ id: 'OK', label: 'OK', primary: true, run: end }]}
    >
      <p class="wc-lk-qn">gibur-2026-11-07.txt</p>
    </Dialog>
  );
});

const AnyKeyFrame = lookFrame(function AnyKeyFrame(p: { done: Done }): VNode {
  const nav = useNav();
  const end = (): void => {
    nav.pop();
    p.done('anykey: closed');
  };
  return (
    <Dialog title="Saved" dlg="anykey" anyKeyCancels onCancel={end} buttons={[]}>
      <p class="wc-lk-q">The backup is saved.</p>
      <p class="wc-lk-qn">Any key closes this.</p>
    </Dialog>
  );
});

const ROWS = Array.from({ length: 30 }, (_, i) => `Row ${String(i + 1).padStart(2, '0')}`);
const CELLS = Array.from({ length: 23 }, (_, i) => `Cell ${i + 1}`);
const ZONE = ['OPEN', 'RENAME', 'DELETE'] as const;
const ZONE_LABEL: Record<(typeof ZONE)[number], [label: string, letter: string]> = {
  OPEN: ['Open', 'o'],
  RENAME: ['Rename', 'r'],
  DELETE: ['Delete', 'd'],
};

function OverlaysSection(): VNode {
  const nav = useNav();
  const [out, setOut] = useState('—');
  const [inline, setInline] = useState(false);
  const [pop, setPop] = useState(false);
  const [paper, setPaper] = useState(false);
  const [speed, setSpeed] = useState('1');
  const [loop, setLoop] = useState(false);
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('');
  const [renameOn, setRenameOn] = useState(true);
  const [target, setTarget] = useState<'list' | 'grid'>('list');
  const popAnchor = useRef<HTMLSpanElement>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const rows = ROWS.filter((r) => r.toLowerCase().includes(filter.trim().toLowerCase()));
  const list = useListCursor({ count: rows.length, onActivate: (i) => setOut(`list: ${rows[i]}`), activateOn: 'click', touch: 'tap-selects' });
  const grid = useGridCursor({
    count: CELLS.length,
    columns: () => {
      const el = gridRef.current;
      if (!el || typeof getComputedStyle !== 'function') return 4;
      return getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length || 4;
    },
    onActivate: (i) => setOut(`grid: ${CELLS[i]}`),
  });
  const pressZone = (id: string): void => {
    if (id === 'RENAME' && !renameOn) return;
    setOut(`zone: ${id.toLowerCase()} ${rows[list.i] ?? '—'}`);
  };
  const zone = useButtonZone({ ids: ZONE, enabled: (id) => id !== 'RENAME' || renameOn, press: pressZone });

  const open = (F: typeof QuestionFrame): void => nav.push(<F done={setOut} />, { overlay: true });
  const keys = (): void =>
    openKeyHelp(nav, 'Keys', [
      ['↑ ↓', 'Move the cursor'],
      ['PgUp PgDn', 'A page up or down'],
      ['Home End', 'The first or last row'],
      ['Enter', 'Open the row'],
      ['Tab', 'The buttons, and back'],
      ['Esc', 'Back'],
    ]);
  const actions: Record<string, () => void> = {
    q: () => open(QuestionFrame),
    i: () => open(InputFrame),
    e: () => open(ErrorFrame),
    a: () => open(AnyKeyFrame),
    k: keys,
    l: () => setInline(true),
    p: () => setPop((v) => !v),
    g: () => setTarget((t) => (t === 'list' ? 'grid' : 'list')),
    o: () => pressZone('OPEN'),
    r: () => pressZone('RENAME'),
    d: () => pressZone('DELETE'),
  };

  useKitKeys((e, nk) => {
    if (letterAction(e, actions)) return true;
    if (target === 'grid') return grid.key(e, nk);
    if (zone.key(e, nk)) return true;
    return zone.zone === 'list' && list.key(e, nk);
  });

  const listKeys = target === 'list' && zone.zone === 'list';
  const btn = (id: string, label: string, letter: string, run: () => void, extra: object = {}): VNode => (
    <GlassButton id={id} label={label} letter={letter} small onClick={run} {...extra} />
  );

  return (
    <div class="wc-kit-ov" style={{ position: 'relative', display: 'grid', gap: '10px', paddingBottom: '18px' }}>
      <Rule title="Dialogs" />
      <p class="wc-lk-txt wc-lk-dim" style={{ margin: 0 }}>
        Each opens over the box as an overlay frame: the box stays drawn and inert under the veil.
      </p>
      <div class="wc-lk-btns" style={{ margin: '4px 0' }}>
        {btn('Q', 'Question', 'q', actions.q!)}
        {btn('I', 'Input', 'i', actions.i!)}
        {btn('E', 'Error', 'e', actions.e!)}
        {btn('A', 'Any key', 'a', actions.a!)}
        {btn('K', 'Keys box', 'k', keys)}
        {btn('L', 'Inline', 'l', actions.l!)}
        <span ref={popAnchor} style={{ display: 'inline-flex' }}>
          {btn('P', 'Popover', 'p', actions.p!, pop ? { selected: true } : {})}
        </span>
      </div>
      <p class="wc-lk-txt" style={{ margin: 0, textAlign: 'center' }}>
        Last: <span data-kit-out="">{out}</span>
      </p>
      <LookFlash />
      {pop && (
        <Popover anchor={() => popAnchor.current} onClose={() => setPop(false)} label="Display">
          <div style={{ display: 'grid', gap: '10px' }}>
            <Seg
              label="Speed"
              value={speed}
              onChange={setSpeed}
              options={[
                { value: '0.5', label: '½×' },
                { value: '1', label: '1×' },
                { value: '2', label: '2×' },
              ]}
            />
            <Toggle id="loop" label="Loop" on={loop} onChange={setLoop} />
            <Field id="note" label="Note" value={note} onInput={setNote} placeholder="Typed keys stay here" />
          </div>
        </Popover>
      )}

      <Rule title="Inline dialog">
        <Toggle id="paper" label="Paper" on={paper} onChange={setPaper} />
      </Rule>
      <div
        class={'wc-kit-ov-inline' + (paper ? ' wc-look' : '')}
        data-light={paper ? '' : undefined}
        style={{
          position: 'relative',
          minHeight: '260px',
          padding: '14px 18px',
          borderRadius: '4px',
          border: '1px solid rgba(255, 214, 160, 0.14)',
          background: paper ? '#f4ecd8' : 'rgba(10, 8, 6, 0.55)',
          color: paper ? '#2a2116' : undefined,
        }}
      >
        <p class="wc-lk-txt" style={{ margin: 0 }}>
          A page's own content. The inline dialog covers this panel only and takes the keys through a key layer; the
          page's keys (the gallery's [ and ]) wait until it closes.
        </p>
        {inline && (
          <Dialog
            inline
            title="Apply changes?"
            dlg="inline"
            width={420}
            onCancel={() => {
              setInline(false);
              setOut('inline: cancelled');
            }}
            buttons={[
              { id: 'APPLY', label: 'Apply', letter: 'a', primary: true, run: () => (setInline(false), setOut('inline: apply')) },
              { id: 'DISCARD', label: 'Discard', letter: 'd', danger: true, run: () => (setInline(false), setOut('inline: discard')) },
              { id: 'KEEP', label: 'Keep editing', letter: 'k', run: () => (setInline(false), setOut('inline: keep')) },
            ]}
          >
            <p class="wc-lk-q">The profile has changes.</p>
          </Dialog>
        )}
      </div>

      <Rule title="List cursor and button zone">
        <Seg
          label="Keys to"
          value={target}
          onChange={(v) => setTarget(v as 'list' | 'grid')}
          options={[
            { value: 'list', label: 'List' },
            { value: 'grid', label: 'Grid', letter: 'g' },
          ]}
        />
      </Rule>
      <Field id="filter" label="Filter" value={filter} onInput={setFilter} placeholder="Esc lets go of the field" />
      <ul
        ref={list.scrollRef as unknown as Ref<HTMLUListElement>}
        class="wc-lk-rows is-flat"
        data-kit-list=""
        aria-label="Rows"
        style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '220px', overflowY: 'auto' }}
      >
        {rows.map((r, i) => {
          const on = i === list.i;
          return (
            <li
              key={r}
              {...list.rowProps(i)}
              class={'wc-lk-row' + (on ? ' is-on' : '') + (on && !listKeys ? ' is-idle' : '') + (on && listKeys ? ' is-cur' : '')}
              aria-current={on ? 'true' : undefined}
              style={{ padding: '4px 10px', cursor: 'default' }}
            >
              {r}
            </li>
          );
        })}
        {rows.length === 0 && <li class="wc-lk-empty">No rows match.</li>}
      </ul>
      <div class="wc-lk-btns" style={{ margin: '4px 0' }}>
        {ZONE.map((id) => {
          const [label, letter] = ZONE_LABEL[id];
          return (
            <GlassButton
              key={id}
              id={id}
              label={label}
              letter={letter}
              small
              {...(zone.sel === id && target === 'list' ? { selected: true } : {})}
              {...(id === 'RENAME' && !renameOn ? { disabled: true, title: 'Off by the toggle' } : {})}
              {...(id === 'DELETE' ? { danger: true } : {})}
              onClick={() => pressZone(id)}
            />
          );
        })}
        <Toggle id="rename-on" label="Rename" on={renameOn} onChange={setRenameOn} />
      </div>

      <Rule title="Grid cursor" />
      <div
        ref={gridRef}
        data-kit-grid=""
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: '8px' }}
      >
        {CELLS.map((c, i) => {
          const on = i === grid.i;
          return (
            <div
              key={c}
              {...grid.rowProps(i)}
              class={'wc-lk-row' + (on ? ' is-on' : '') + (on && target === 'grid' ? ' is-cur' : on ? ' is-idle' : '')}
              style={{
                padding: '14px 8px',
                textAlign: 'center',
                borderRadius: '4px',
                border: `1px solid rgba(255, 214, 160, ${on ? 0.4 : 0.1})`,
              }}
            >
              {c}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default {
  title: 'Overlays',
  View: OverlaysSection,
} satisfies KitSection;
