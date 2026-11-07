// The Lite view of the profile editor B "Ryggen" (stage 43a, ADR 0128):
// the rail's kinds (icons, counts, the kinds' letters), the entry list
// (two lines per row: the flag and the pattern, the body's first line;
// macros show the key as a chip) and the entry's detail (no card: the
// fields and notes per kind). Presentational: the editor (editor.tsx)
// holds the state and the keys.

import { Component, type Ref, type VNode } from 'preact';
import { Field, GlassButton, Icon, type IconName, KeyLabel, TextArea } from '../../chrome/kit/look';
import { type EntryNode, FIELD_LABELS, validateEntry } from '../../script/doc';
import {
  KINDS,
  KIND_LABELS,
  KIND_LETTERS,
  KIND_ONE,
  type LiteKind,
  entryWarning,
  highlightStyle,
  keyLabel,
  previewLine,
  sentinelPrompt,
} from '../logic';
import { type GridPos, type HlDim, HighlightDetail } from './detail-highlight';

const cx = (...c: (string | false | null | undefined)[]): string => c.filter(Boolean).join(' ');

/** Presses never move the DOM focus (the frame stack keeps it). */
const keepFocus = (e: MouseEvent): void => e.preventDefault();

const KIND_ICON: Readonly<Record<LiteKind, IconName>> = {
  action: 'action',
  alias: 'alias',
  highlight: 'highlight',
  macro: 'macro',
  substitute: 'substitute',
};

// ------------------------------------------------------------ the rail

/** The rail in Lite: "Kinds" and the five kinds with their icons, letters and counts. */
export function KindRail(p: {
  kind: LiteKind;
  counts: Readonly<Record<LiteKind, number>>;
  /** The keyboard is in the rail. */
  active: boolean;
  onPick(k: LiteKind): void;
}): VNode {
  return (
    <>
      <div class="wc-pe-railh">Kinds</div>
      {KINDS.map((k) => (
        <button
          type="button"
          key={k}
          class={cx('wc-pe-rit', k === p.kind && 'is-on', k === p.kind && p.active && 'is-cur')}
          data-rail={k}
          role="tab"
          aria-selected={k === p.kind ? 'true' : 'false'}
          aria-keyshortcuts={KIND_LETTERS[k].toUpperCase()}
          tabIndex={-1}
          onMouseDown={keepFocus}
          onClick={(e) => {
            e.stopPropagation();
            p.onPick(k);
          }}
        >
          <Icon name={KIND_ICON[k]} />
          <KeyLabel class="wc-pe-rlabel" text={KIND_LABELS[k]} letter={KIND_LETTERS[k]} />
          <span class="wc-pe-rn">{p.counts[k]}</span>
        </button>
      ))}
    </>
  );
}

// ------------------------------------------------------------ the list

interface RowProps {
  e: EntryNode;
  i: number;
  on: boolean;
  idle: boolean;
  /** The pattern was visited (a new entry's empty pattern is not flagged while it is first typed). */
  visited: boolean;
}

/**
 * One entry: the flag and the pattern (a key chip for macros), the body's
 * first line. It re-renders only when its entry or its marks change, so a
 * key typed in a field re-renders one row, not the list.
 */
class Row extends Component<RowProps> {
  override shouldComponentUpdate(n: RowProps): boolean {
    const p = this.props;
    return n.e !== p.e || n.i !== p.i || n.on !== p.on || n.idle !== p.idle || n.visited !== p.visited;
  }

  override render(p: RowProps): VNode {
    return rowView(p);
  }
}

function rowView(p: RowProps): VNode {
  const e = p.e;
  const bad = validateEntry(e, { patternVisited: p.visited });
  const warn = bad ? null : entryWarning(e);
  const body = previewLine(e.kind, e.body);
  const hl = e.kind === 'highlight' ? highlightStyle(e.body) : null;
  let pat: VNode;
  if (e.kind === 'macro') {
    const k = keyLabel(e.pattern);
    pat = <span class={cx('wc-pe-kc', (e.pattern === '' || k.custom) && 'is-custom')}>{e.pattern === '' ? 'unbound' : k.custom ? e.pattern : k.text}</span>;
  } else pat = <span class="wc-pe-pat">{e.pattern || ' '}</span>;
  return (
    <div
      class={cx('wc-lk-row wc-pe-row', p.on && 'is-on', p.idle && 'is-idle')}
      role="option"
      aria-selected={p.on ? 'true' : 'false'}
      data-i={p.i}
      data-id={e.id}
    >
      <div class="wc-pe-l1">
        {bad ? <i class="wc-pe-flag is-bad" title={bad} /> : warn ? <i class="wc-pe-flag is-warn" title={warn} /> : null}
        {pat}
      </div>
      <div class="wc-pe-bod">{hl ? <span style={hl}>{body || ' '}</span> : body || ' '}</div>
    </div>
  );
}

/** The entry list: every row of the kind, then `+ New <kind>`. Native scrolling; a click selects, the editor decides what opens. */
export function EntryList(p: {
  kind: LiteKind;
  list: readonly EntryNode[];
  idx: number;
  /** The keyboard is in the list (else the chosen row is dimmer, `.is-idle`). */
  focused: boolean;
  visited(id: number): boolean;
  listRef: Ref<HTMLDivElement>;
  onRow(i: number, how: 'click' | 'dblclick'): void;
}): VNode {
  const rowOf = (e: MouseEvent): number | null => {
    const el = (e.target as Element | null)?.closest?.('[data-i]');
    return el ? Number(el.getAttribute('data-i')) : null;
  };
  const n = p.list.length;
  return (
    <div
      ref={p.listRef}
      class="wc-lk-rows is-flat wc-pe-list wc-lk-scroll"
      role="listbox"
      aria-label={KIND_LABELS[p.kind]}
      onMouseDown={keepFocus}
      onClick={(e) => {
        const i = rowOf(e);
        if (i !== null) p.onRow(i, 'click');
      }}
      onDblClick={(e) => {
        const i = rowOf(e);
        if (i !== null) p.onRow(i, 'dblclick');
      }}
    >
      {p.list.map((e, i) => (
        <Row key={e.id} e={e} i={i} on={i === p.idx} idle={i === p.idx && !p.focused} visited={p.visited(e.id)} />
      ))}
      <div
        key="new"
        class={cx('wc-lk-row wc-pe-row wc-pe-new', p.idx === n && 'is-on', p.idx === n && !p.focused && 'is-idle')}
        role="option"
        aria-selected={p.idx === n ? 'true' : 'false'}
        data-i={n}
        data-row="new"
      >
        <Icon name="plus" />
        <span>New {KIND_ONE[p.kind]}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ the detail

export type DetailField = 'pattern' | 'body' | 'key' | 'style' | 'text' | 'bg';

export interface DetailProps {
  kind: LiteKind;
  cur: EntryNode | undefined;
  /** Entries of the kind (the sentinel's prompt). */
  count: number;
  /** The body as the Commands box shows it (the draft while typing). */
  bodyText: string;
  visited: boolean;
  /** The keyboard's place in the detail, or null when the keyboard is elsewhere. */
  at: DetailField | null;
  styleCur: number;
  textCur: GridPos;
  bgCur: GridPos;
  /** Key capture: a phone has none. */
  phone: boolean;
  patternRef: Ref<HTMLInputElement>;
  bodyRef: Ref<HTMLTextAreaElement>;
  onPattern(v: string): void;
  onBody(v: string): void;
  onCapture(): void;
  onStyle(i: number): void;
  onPick(dim: HlDim, pos: GridPos): void;
  onNew(): void;
  onSheetBack(): void;
}

/** The entry being edited (no card): its fields per kind, the notes; the sentinel's prompt on the New row. */
export function Detail(p: DetailProps): VNode {
  const back = (
    <div class="wc-pe-sheetbar">
      <GlassButton id="SHEET" small keepIcon icon="back" label={KIND_LABELS[p.kind]} title="Back to the list (Esc)" onClick={p.onSheetBack} />
    </div>
  );
  const e = p.cur;
  if (!e) {
    return (
      <>
        {back}
        <div class="wc-pe-prompt">
          <p>{sentinelPrompt(p.kind, p.count)}</p>
          <GlassButton id="PROMPT-NEW" small icon="plus" label={`New ${KIND_ONE[p.kind]}`} letter="n" onClick={p.onNew} />
        </div>
      </>
    );
  }
  const labels = FIELD_LABELS[e.kind];
  const msg = validateEntry(e, { patternVisited: p.visited });
  const warn = entryWarning(e);
  let head: VNode;
  if (e.kind === 'macro') {
    const k = keyLabel(e.pattern);
    head = (
      <div class="wc-pe-keyrow">
        <span class="wc-lk-lbl">{labels.pattern}</span>
        <div class="wc-pe-keyline">
          <button
            type="button"
            class={cx('wc-pe-keycap', k.hint && 'is-hint', p.at === 'key' && 'is-sel')}
            data-field="key"
            tabIndex={-1}
            onMouseDown={keepFocus}
            onClick={(ev) => {
              ev.stopPropagation();
              p.onCapture();
            }}
          >
            {k.text}
          </button>
          <span class="wc-pe-keyhint">{p.phone ? 'Key capture: desktop only.' : 'Choose it, then press the key.'}</span>
        </div>
      </div>
    );
  } else {
    head = <Field id="pattern" label={labels.pattern} mono value={e.pattern} inputRef={p.patternRef} onInput={(v) => p.onPattern(v.replace(/[\r\n]+/g, ' '))} />;
  }
  return (
    <>
      {back}
      <div class="wc-pe-fields" data-kind={e.kind}>
        {head}
        {e.kind === 'highlight' ? (
          <HighlightDetail
            pattern={e.pattern}
            body={e.body}
            at={p.at === 'style' || p.at === 'text' || p.at === 'bg' ? p.at : null}
            styleCur={p.styleCur}
            textCur={p.textCur}
            bgCur={p.bgCur}
            onStyle={p.onStyle}
            onPick={p.onPick}
          />
        ) : (
          <TextArea id="body" label={labels.body} mono value={p.bodyText} rows={6} inputRef={p.bodyRef} onInput={p.onBody} />
        )}
        <div class="wc-pe-notes">
          {msg && <p class="wc-pe-note wc-pe-msg">{msg}</p>}
          {warn && <p class="wc-pe-note wc-pe-warn">{warn}</p>}
        </div>
      </div>
    </>
  );
}
