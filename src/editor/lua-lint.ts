// Live errors in the script editor (stage 10 feedback round 1), on
// `@codemirror/lint`: a red `●` in a one-cell gutter, a red band on the
// line, an underline where the message names a token, and the message on
// hover (gutter or text).
//
// - Syntax and header: the buffer is checked 300 ms after the last change
//   (and once when the editor opens): the header parser, then a
//   compile-only `LuaRuntime.check` (nothing runs). A fix clears the mark
//   on the next check. An error that is most likely the code being typed
//   (on the cursor's line, right after the cursor, `near <eof>`) is held
//   back while typing (lua-holdback.ts): it shows when the cursor leaves
//   its line, 1.5 s after the last edit, or on save.
// - Runtime: the library's `lastError` of the saved script
//   (`name:line: message`), marked on that line of the saved text mapped
//   through the edits since the save, dashed and labelled "Runtime error
//   (saved version)". It is dropped once that line is edited, after a
//   save (until the script reports an error again), or when the library
//   clears it (a successful reload).

import { type Diagnostic, forEachDiagnostic, lintGutter, setDiagnostics } from '@codemirror/lint';
import { ChangeSet, type Extension, Facet, RangeSetBuilder, Text } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, type PluginValue, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import {
  SOURCE_LABEL,
  type ScriptDiagnostic,
  headerDiagnostics,
  runtimeDiagnostic,
  syntaxDiagnostic,
} from './lua-diagnostics';
import { HoldBack } from './lua-holdback';

/** Compiles `source` as `name` without running it: null when it compiles, else the message. */
export type SyntaxChecker = (name: string, source: string) => Promise<string | null>;

export interface ScriptLintOptions {
  /** The script's name now (messages read `name:line:`). */
  name: () => string;
  check: SyntaxChecker;
  /** The diagnostics after each check, in line order (current line numbers). */
  onDiagnostics: (ds: readonly ScriptDiagnostic[]) => void;
}

export const CHECK_DELAY_MS = 300;

class ScriptLint implements PluginValue {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private version = 0;
  private destroyed = false;
  private saved: Text;
  private sinceSaved: ChangeSet;
  private lastError: string | null = null;
  /** The error that was showing at the last save: not shown again. */
  private dismissed: string | null = null;
  private readonly hold: HoldBack;
  /** The last check's diagnostics (all, before the hold-back), its version and lines. */
  private all: { version: number; ds: ScriptDiagnostic[]; lines: string[] } | null = null;
  private cursorLine = 1;
  /** What was last published (to skip a dispatch that changes nothing). */
  private published = { version: -1, key: '' };
  private publishQueued = false;

  constructor(
    private readonly view: EditorView,
    private readonly opts: ScriptLintOptions,
  ) {
    this.saved = view.state.doc;
    this.sinceSaved = ChangeSet.empty(view.state.doc.length);
    this.hold = new HoldBack(() => this.publish());
    this.schedule(0);
  }

  update(u: ViewUpdate): void {
    const line = u.state.doc.lineAt(u.state.selection.main.head).number;
    const moved = line !== this.cursorLine;
    this.cursorLine = line;
    if (u.docChanged) {
      this.sinceSaved = this.sinceSaved.compose(u.changes);
      this.version++;
      this.hold.edited();
      this.schedule(CHECK_DELAY_MS);
    } else if (moved && this.all) {
      // The cursor left a line: what was held there may show. Not inside an update: queued.
      if (!this.publishQueued) {
        this.publishQueued = true;
        queueMicrotask(() => {
          this.publishQueued = false;
          this.publish();
        });
      }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.hold.dispose();
    if (this.timer) clearTimeout(this.timer);
  }

  /** `source` was saved: the baseline of runtime errors. */
  markSaved(source: string): void {
    const doc = this.view.state.doc;
    if (doc.toString() === source) {
      this.saved = doc;
      this.sinceSaved = ChangeSet.empty(doc.length);
    } else {
      // Typed while saving: treat every line as edited.
      this.saved = Text.of(source.split('\n'));
      this.sinceSaved = ChangeSet.of([{ from: 0, to: source.length, insert: doc }], source.length);
    }
    this.dismissed = this.lastError;
    this.hold.reveal();
    this.schedule(0);
  }

  setLastError(e: string | null): void {
    if (e === this.lastError) return;
    this.lastError = e;
    if (e === null) this.dismissed = null;
    this.schedule(0);
  }

  private schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.run();
    }, ms);
  }

  private async run(): Promise<void> {
    const version = this.version;
    const name = this.opts.name();
    const source = this.view.state.doc.toString();
    let error: string | null = null;
    try {
      error = await this.opts.check(name, source);
    } catch {
      error = null; // no runtime: no syntax marks, the rest still shows
    }
    if (this.destroyed || version !== this.version) return;
    const lines = source.split('\n');
    const ds: ScriptDiagnostic[] = headerDiagnostics(source);
    if (error) ds.push(syntaxDiagnostic(name, error, lines));
    const rt = this.runtime(name);
    if (rt && !ds.some((d) => d.line === rt.line && d.message === rt.message)) ds.push(rt);
    ds.sort((a, b) => a.line - b.line);
    this.all = { version, ds, lines };
    this.publish();
  }

  /** Shows the last check's diagnostics that are not held back (lua-holdback.ts). */
  private publish(): void {
    const all = this.all;
    if (this.destroyed || !all || all.version !== this.version) return;
    const state = this.view.state;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const ds = this.hold.filter(all.ds, { line: line.number, col: head - line.from }, all.lines);
    const key = ds.map((d) => `${d.source}:${d.line}:${d.from ?? ''}:${d.message}`).join('\n');
    if (key === this.published.key && all.version === this.published.version) return;
    this.published = { version: all.version, key };
    const doc = state.doc;
    const out: Diagnostic[] = ds.map((d) => toDiagnostic(doc, d));
    this.view.dispatch(setDiagnostics(state, out));
    this.opts.onDiagnostics(ds);
  }

  /** The runtime error on its line of the buffer now, or null (none, dismissed, or its line was edited). */
  private runtime(name: string): ScriptDiagnostic | null {
    if (!this.lastError || this.lastError === this.dismissed) return null;
    const savedLines = this.saved.toString().split('\n');
    const d = runtimeDiagnostic(name, this.lastError, savedLines);
    if (!d) return null;
    const line = this.saved.line(d.line);
    if (this.sinceSaved.touchesRange(line.from, line.to)) return null;
    const at = this.sinceSaved.mapPos(line.from, 1);
    return { ...d, line: this.view.state.doc.lineAt(at).number };
  }
}

/** A diagnostic of ours as a lint `Diagnostic` in `doc`. */
export function toDiagnostic(doc: Text, d: ScriptDiagnostic): Diagnostic {
  const line = doc.line(Math.max(1, Math.min(d.line, doc.lines)));
  let from: number;
  let to: number;
  if (d.from !== undefined && d.to !== undefined) {
    from = line.from + Math.min(d.from, line.length);
    to = line.from + Math.min(d.to, line.length);
  } else {
    const lead = line.text.length - line.text.trimStart().length;
    from = line.from + lead;
    to = line.from + line.text.trimEnd().length;
    if (to <= from) to = from = line.from; // a blank line: the gutter and the band only
  }
  const label = SOURCE_LABEL[d.source];
  return {
    from,
    to,
    severity: 'error',
    markClass: `wc-diag-${d.source}`,
    message: `${label}: ${d.message}`,
    renderMessage: (view) => {
      const doc = view.dom.ownerDocument;
      const el = doc.createElement('div');
      el.className = `wc-diag wc-diag-is-${d.source}`;
      const head = doc.createElement('div');
      head.className = 'wc-diag-label';
      head.textContent = label;
      const text = doc.createElement('div');
      text.className = 'wc-diag-text';
      text.textContent = d.message;
      el.append(head, text);
      return el;
    },
  };
}

const lineMark = Decoration.line({ class: 'wc-diag-line' });

/** The red band on every line with a diagnostic. */
const diagnosticLines = ViewPlugin.fromClass(
  class implements PluginValue {
    decorations: DecorationSet = Decoration.none;
    private key = '';
    constructor(view: EditorView) {
      this.build(view);
    }
    update(u: ViewUpdate): void {
      if (u.docChanged || u.transactions.length > 0) this.build(u.view);
    }
    build(view: EditorView): void {
      const starts = new Set<number>();
      forEachDiagnostic(view.state, (_d, from) => {
        starts.add(view.state.doc.lineAt(from).from);
      });
      const sorted = [...starts].sort((a, b) => a - b);
      const key = sorted.join(',');
      if (key === this.key) return;
      this.key = key;
      const b = new RangeSetBuilder<Decoration>();
      for (const p of sorted) b.add(p, p, lineMark);
      this.decorations = b.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

/** The frame's options (one per buffer). */
const lintOptions = Facet.define<ScriptLintOptions, ScriptLintOptions | null>({ combine: (v) => v[0] ?? null });

const scriptLintPlugin = ViewPlugin.define((view) => new ScriptLint(view, view.state.facet(lintOptions)!));

/** The live error checks of a script buffer. */
export function scriptLint(opts: ScriptLintOptions): Extension {
  return [lintOptions.of(opts), lintGutter({ hoverTime: 150 }), diagnosticLines, scriptLintPlugin];
}

/** The library's last error of this script (null: none). */
export function setScriptLastError(view: EditorView, e: string | null): void {
  view.plugin(scriptLintPlugin)?.setLastError(e);
}

/** `source` was saved (the library's text from now on). */
export function markScriptSaved(view: EditorView, source: string): void {
  view.plugin(scriptLintPlugin)?.markSaved(source);
}
