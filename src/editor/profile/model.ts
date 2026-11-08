// The profile editor's apply model (ADR 0105; extracted from frame.tsx in
// stage 43a, ADR 0128). No DOM and no Preact: the editor's view (lite
// document or CodeMirror buffer) is reached through `ModelView`, so the
// commit points, held entries, the rebase on an outside save and the
// discard on leave are unit-tested without a page.
//
// `base` is the text last stored (and applied, when live) as a document
// whose node ids the lite document shares; what the open view differs from
// it in is unapplied. Each apply rebases the edits onto the latest stored
// text (`rebaseDoc`), and a save from outside (a typed `#alias`, a script
// variable) is laid under the open edits as it happens (`refresh`), so
// neither side is lost. An entry that does not validate is held back
// (`applicableDoc`); a text that does not load is not applied. Applies run
// one at a time on `chain`.

import type { CommitResult } from '../../profiles';
import { type ProfileDoc, alignDoc, checkBraces, parseProfile, rebaseDoc, serialize } from '../../script/doc';
import { applicableDoc, heldText, pendingDoc } from '../logic';

/** What the editor needs from whoever opened it (ADR 0015 "Editor host", ADR 0105, ADR 0128). */
export interface EditorHost {
  /** Profile name, for the head and the flash. */
  name: string;
  /** The stored profile text at open. */
  text: string;
  /** True while a live session runs the profile: an apply swaps the running rules, ESC asks first. */
  isLive(): boolean;
  /** The latest stored text (an outside change is followed with it). */
  load(): Promise<string>;
  /**
   * Stores, and while live applies, what `build` makes of the latest stored
   * text. `quiet`: no UI pane line for a success (the editor reports it).
   */
  commit(build: (stored: string) => string, opts: { quiet: boolean }): Promise<CommitResult>;
  /** Calls `fn` with the new text after every save of the profile, from any source. */
  subscribe?(fn: (text: string) => void): () => void;
  /**
   * Calls `fn` whenever `isLive()` may have changed (the head's line in the
   * game: connected or not); returns the unsubscribe. Absent: read at render.
   */
  onLiveChange?(fn: () => void): () => void;
}

/** How an apply ended (`commit`). */
export type Outcome =
  /** Nothing unapplied is left. `changed`: something was stored. */
  | { kind: 'clean'; changed: boolean; added: string[] }
  /** What validates was applied; held entries (or a text that does not load) remain. */
  | { kind: 'held'; message: string }
  /** Reading or saving failed (`save`), or the live apply refused the text. */
  | { kind: 'failed'; message: string; save: boolean }
  /** The editor is closed or closing. */
  | { kind: 'gone' };

/** Why an apply runs: a commit point, Ctrl+S / Save, the prompt's Yes, leaving (not live). */
export type CommitWhy = 'auto' | 'save' | 'modal' | 'close';

export type Mode = 'lite' | 'editor';

/** What the model reads from and lays edits onto: the open view. */
export interface ModelView {
  mode(): Mode;
  /** The lite document as it is now. */
  doc(): ProfileDoc;
  /** Changes the lite document (a functional update: it may not be rendered yet). */
  setDoc(f: (d: ProfileDoc) => ProfileDoc): void;
  /** The buffer's text as it is now (EDITOR). */
  buffer(): string;
  /** Replaces the buffer's text (keeping what it can of the cursor). */
  setBuffer(text: string): void;
  /** The base moved (a render: the list order, Modified, the status). */
  baseChanged(b: ProfileDoc): void;
  /** An automatic apply or Ctrl+S ended: the flash and the status. */
  report(out: Outcome, why: CommitWhy): void;
}

/** The open view's edits at a commit point, against the base of that moment. */
interface Snapshot {
  from: ProfileDoc;
  local: ProfileDoc;
  editor: boolean;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class ProfileModel {
  /** What is stored (and applied) as far as the editor knows. */
  base: ProfileDoc;
  /** Something was stored during this visit (the flash on leaving). */
  savedAny = false;
  /** Set once the editor leaves (a discard must not apply on the way out). */
  closing = false;
  /** False once the editor is unmounted. */
  alive = true;
  private chain: Promise<unknown> = Promise.resolve();
  private inflight = 0;
  private refreshQueued = false;
  /** The unapplied text an automatic apply last held back: not tried (and flashed) again. */
  private lastHeld: string | null = null;

  constructor(
    private readonly host: EditorHost,
    private readonly view: ModelView,
    initial: ProfileDoc,
  ) {
    this.base = initial;
  }

  /** The open view's edits as a document that shares its ids with `b`. */
  private localNow(b: ProfileDoc): ProfileDoc {
    return this.view.mode() === 'editor' ? alignDoc(b, parseProfile(this.view.buffer())) : this.view.doc();
  }

  /** True while the open view holds changes that are not applied. */
  unapplied(): boolean {
    const bt = serialize(this.base);
    return this.view.mode() === 'editor' ? this.view.buffer() !== bt : serialize(pendingDoc(this.base, this.view.doc())) !== bt;
  }

  /** True while an apply or a refresh runs or waits. */
  busy(): boolean {
    return this.inflight > 0;
  }

  /** Resolves once every apply and refresh queued so far has run. */
  async settle(): Promise<void> {
    await this.chain;
  }

  /**
   * LITE with nothing left that could be applied (every change held back):
   * the first held entry's message, else null. The prompt then says why
   * instead of offering Yes.
   */
  nothingApplicable(): string | null {
    if (this.view.mode() !== 'lite') return null;
    const b = this.base;
    const r = applicableDoc(b, this.view.doc());
    return r.held[0] && serialize(r.doc) === serialize(b) ? `Not applied: ${heldText(r.held[0])}` : null;
  }

  private putBase(b: ProfileDoc): void {
    this.base = b;
    this.view.baseChanged(b);
  }

  /**
   * Lays the open view's edits (made against `from`) over `onto`, the new
   * base. EDITOR's text is lined up with `ref` (default `from`): after an
   * apply that is the applied snapshot, so the nodes it added keep the ids
   * they have in `onto` and are not added twice.
   */
  private relayLocal(from: ProfileDoc, onto: ProfileDoc, ref: ProfileDoc = from): void {
    if (this.view.mode() === 'editor') {
      const t = this.view.buffer();
      this.view.setBuffer(serialize(rebaseDoc(from, alignDoc(ref, parseProfile(t)), onto)));
    } else this.view.setDoc((d) => rebaseDoc(from, d, onto));
  }

  /** Runs `fn` after every apply and refresh queued before it. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    this.inflight++;
    const p = this.chain.then(fn).finally(() => {
      this.inflight--;
    });
    this.chain = p.catch(() => {});
    return p;
  }

  private snapshot(): Snapshot {
    const from = this.base;
    return { from, local: this.localNow(from), editor: this.view.mode() === 'editor' };
  }

  private snapText(s: Snapshot): string {
    return serialize(s.editor ? s.local : pendingDoc(s.from, s.local));
  }

  /** One apply: the snapshot's applicable edits, rebased onto the latest stored text. */
  private async run(why: CommitWhy, snap: Snapshot): Promise<Outcome> {
    if (!this.alive || this.closing) return { kind: 'gone' };
    const from = this.base;
    const editor = snap.editor;
    // An apply that ran meanwhile moved the base: the snapshot's edits go over it.
    const local = snap.from === from ? snap.local : rebaseDoc(snap.from, snap.local, from);
    const baseText = serialize(from);
    const pending = serialize(editor ? local : pendingDoc(from, local));
    if (pending === baseText) return { kind: 'clean', changed: false, added: [] };
    const { doc: appl, held } = editor ? { doc: local, held: [] } : applicableDoc(from, local);
    const heldMessage = held[0] ? `Not applied: ${heldText(held[0])}` : 'Not applied.';
    if (serialize(appl) === baseText) return { kind: 'held', message: heldMessage };
    const got: { onto?: ProfileDoc; applied?: ProfileDoc } = {};
    let res: CommitResult;
    try {
      res = await this.host.commit(
        (stored) => {
          got.onto = alignDoc(from, parseProfile(stored));
          got.applied = rebaseDoc(from, appl, got.onto);
          return serialize(got.applied);
        },
        { quiet: why !== 'modal' },
      );
    } catch (e) {
      res = { ok: false, reason: errText(e), stage: 'save' };
    }
    if (!this.alive) return { kind: 'gone' };
    if (!res.ok) {
      // The outside changes read meanwhile still show; the edits stay unapplied.
      if (got.onto) {
        this.putBase(got.onto);
        this.relayLocal(from, got.onto, local);
      }
      return res.stage === 'apply' ? { kind: 'held', message: `Not applied: ${res.reason}` } : { kind: 'failed', message: res.reason, save: true };
    }
    this.putBase(got.applied!);
    this.relayLocal(from, got.applied!, local);
    if (res.changed) this.savedAny = true;
    if (held.length) return { kind: 'held', message: heldMessage };
    return { kind: 'clean', changed: res.changed, added: res.added };
  }

  /**
   * Applies the edits as they are now (queued behind a running apply) and
   * reports an automatic apply or Ctrl+S to the view. The snapshot is taken
   * here, at the commit point, so a key typed while an apply runs is not
   * applied with it.
   */
  commit(why: CommitWhy): Promise<Outcome> {
    const snap = this.snapshot();
    const text = this.snapText(snap);
    return this.enqueue(async () => {
      // An automatic apply does not try (and flash) again what it held back last time.
      if (why === 'auto' && this.lastHeld !== null && this.lastHeld === text) return { kind: 'held', message: '' } as Outcome;
      const out = await this.run(why, snap);
      if (out.kind === 'gone' || !this.alive) return out;
      this.lastHeld = out.kind === 'held' ? text : null;
      if (why === 'auto' || why === 'save') this.view.report(out, why);
      return out;
    });
  }

  /** Follows a save from outside (typed settings, script variables): read, lay the edits over it. */
  refresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    void this.enqueue(async () => {
      this.refreshQueued = false;
      if (!this.alive) return;
      let stored: string;
      try {
        stored = await this.host.load();
      } catch {
        return;
      }
      const from = this.base;
      if (!this.alive || stored === serialize(from)) return;
      // A buffer with open braces cannot be lined up; the next apply rebases it.
      if (this.view.mode() === 'editor' && !checkBraces(this.view.buffer()).ok) return;
      const onto = alignDoc(from, parseProfile(stored));
      this.putBase(onto);
      this.relayLocal(from, onto);
      this.lastHeld = null;
    });
  }

  /** Follows the host's saves from outside; returns the unsubscribe. */
  follow(): () => void {
    return this.host.subscribe?.((text) => text !== serialize(this.base) && this.refresh()) ?? (() => {});
  }

  /** The view flipped (LITE ⇄ EDITOR): what was held back is tried again. */
  flipped(): void {
    this.lastHeld = null;
  }

  dispose(): void {
    this.alive = false;
  }
}
