// The profile editor's apply model (src/editor/profile/model.ts, stage 43a,
// ADR 0128; ADR 0105): the commit points' outcomes, held entries, the
// rebase on an outside save, the discard on leave, savedAny. No DOM.
import { describe, expect, it } from 'vitest';
import type { CommitResult } from '../../src/profiles';
import { type ProfileDoc, addEntry, editEntry, listEntries, parseProfile, serialize } from '../../src/script/doc';
import { type EditorHost, type ModelView, type Mode, type Outcome, ProfileModel } from '../../src/editor/profile/model';

/** A stored profile with a commit that builds on it, and outside saves. */
function store(initial: string, opts: { live?: boolean; fail?: CommitResult } = {}) {
  let text = initial;
  const subs = new Set<(t: string) => void>();
  let commits = 0;
  const host: EditorHost = {
    name: 'gibur',
    text: initial,
    isLive: () => opts.live ?? false,
    load: async () => text,
    commit: async (build) => {
      commits++;
      if (opts.fail) {
        build(text);
        return opts.fail;
      }
      const next = build(text);
      const changed = next !== text;
      text = next;
      return { ok: true, changed, warnings: [], added: [] };
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
  return {
    host,
    stored: () => text,
    commits: () => commits,
    /** A save from outside (a typed #alias): stored, then the subscribers hear it. */
    outside(t: string) {
      text = t;
      for (const f of subs) f(t);
    },
  };
}

/** The open view: a lite document or a buffer, as the editor keeps them. */
function viewOf(doc: ProfileDoc) {
  const st = { mode: 'lite' as Mode, doc, buffer: '', reports: [] as [Outcome, string][], bases: 0 };
  const view: ModelView = {
    mode: () => st.mode,
    doc: () => st.doc,
    setDoc: (f) => {
      st.doc = f(st.doc);
    },
    buffer: () => st.buffer,
    setBuffer: (t) => {
      st.buffer = t;
    },
    baseChanged: () => {
      st.bases++;
    },
    report: (o, w) => st.reports.push([o, w]),
  };
  return { st, view };
}

function setup(text: string, opts: { live?: boolean; fail?: CommitResult } = {}) {
  const s = store(text, opts);
  const initial = parseProfile(text);
  const v = viewOf(initial);
  const model = new ProfileModel(s.host, v.view, initial);
  return { ...s, ...v, model };
}

const aliasId = (doc: ProfileDoc, pattern: string): number => listEntries(doc, 'alias').find((e) => e.pattern === pattern)!.id;
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('the apply model (ADR 0105)', () => {
  it('applies a finished lite edit at a commit point and remembers that it stored something', async () => {
    const t = setup('#alias {a} {b}\n');
    expect(t.model.unapplied()).toBe(false);
    t.st.doc = editEntry(t.st.doc, aliasId(t.st.doc, 'a'), { body: 'bee' });
    expect(t.model.unapplied()).toBe(true);
    const out = await t.model.commit('auto');
    expect(out).toEqual({ kind: 'clean', changed: true, added: [] });
    expect(t.stored()).toBe('#alias {a} {bee}\n');
    expect(t.model.unapplied()).toBe(false);
    expect(t.model.savedAny).toBe(true);
    expect(t.st.reports.map(([o, w]) => [o.kind, w])).toEqual([['clean', 'auto']]);
    expect(t.st.bases).toBe(1);
  });

  it('reports nothing to apply on Ctrl+S with no edits, and stores nothing', async () => {
    const t = setup('#alias {a} {b}\n');
    const out = await t.model.commit('save');
    expect(out).toEqual({ kind: 'clean', changed: false, added: [] });
    expect(t.commits()).toBe(0);
    expect(t.st.reports[0]![1]).toBe('save');
    expect(t.model.savedAny).toBe(false);
  });

  it('holds back an entry that does not validate and applies the rest', async () => {
    const t = setup('#alias {a} {b}\n#alias {gv} {x}\n');
    let d = editEntry(t.st.doc, aliasId(t.st.doc, 'a'), { body: 'bee' });
    d = editEntry(d, aliasId(d, 'gv'), { body: 'give {to' });
    t.st.doc = d;
    const out = await t.model.commit('auto');
    expect(out).toEqual({ kind: 'held', message: 'Not applied: Unbalanced braces in Commands (alias gv)' });
    expect(t.stored()).toBe('#alias {a} {bee}\n#alias {gv} {x}\n');
    expect(t.model.unapplied()).toBe(true);
    // The same held text is not tried (and reported) again by the next automatic apply.
    const again = await t.model.commit('auto');
    expect(again).toEqual({ kind: 'held', message: '' });
    expect(t.st.reports).toHaveLength(1);
    // Ctrl+S always tries.
    const save = await t.model.commit('save');
    expect(save.kind).toBe('held');
    expect(t.st.reports).toHaveLength(2);
    // Nothing left that could be applied: the prompt says why.
    expect(t.model.nothingApplicable()).toBe('Not applied: Unbalanced braces in Commands (alias gv)');
  });

  it('leaves an empty new entry out silently (it waits for its pattern)', async () => {
    const t = setup('#alias {a} {b}\n');
    t.st.doc = addEntry(t.st.doc, { kind: 'alias', pattern: '', body: '' }).doc;
    expect(t.model.unapplied()).toBe(false);
    const out = await t.model.commit('auto');
    expect(out.kind).toBe('clean');
    expect(t.commits()).toBe(0);
  });

  it('lays an outside save under the open edits, and applies both', async () => {
    const t = setup('#alias {a} {b}\n');
    const off = t.model.follow();
    t.st.doc = editEntry(t.st.doc, aliasId(t.st.doc, 'a'), { body: 'bee' });
    t.outside('#alias {a} {b}\n#alias {z} {zed}\n');
    await t.model.settle();
    await flush();
    await t.model.settle();
    // The base is the stored text; the edit is still open and the outside alias shows.
    expect(serialize(t.model.base)).toBe('#alias {a} {b}\n#alias {z} {zed}\n');
    expect(serialize(t.st.doc)).toBe('#alias {a} {bee}\n#alias {z} {zed}\n');
    const out = await t.model.commit('auto');
    expect(out.kind).toBe('clean');
    expect(t.stored()).toBe('#alias {a} {bee}\n#alias {z} {zed}\n');
    off();
  });

  it('rebases onto a stored text that changed since the last read', async () => {
    const t = setup('#alias {a} {b}\n');
    t.st.doc = editEntry(t.st.doc, aliasId(t.st.doc, 'a'), { body: 'bee' });
    // Stored behind the editor's back, without a subscriber hearing it.
    t.outside('#alias {a} {b}\n#action {x} {y}\n');
    const out = await t.model.commit('modal');
    expect(out.kind).toBe('clean');
    expect(t.stored()).toBe('#alias {a} {bee}\n#action {x} {y}\n');
  });

  it('applies nothing once the editor is leaving (a discard)', async () => {
    const t = setup('#alias {a} {b}\n');
    t.st.doc = editEntry(t.st.doc, aliasId(t.st.doc, 'a'), { body: 'bee' });
    t.model.closing = true;
    const out = await t.model.commit('auto');
    expect(out).toEqual({ kind: 'gone' });
    expect(t.stored()).toBe('#alias {a} {b}\n');
    expect(t.model.savedAny).toBe(false);
    t.model.dispose();
    expect(await t.model.commit('save')).toEqual({ kind: 'gone' });
  });

  it('applies the buffer in Editor on Ctrl+S, and keeps a text that does not load', async () => {
    const t = setup('#alias {a} {b}\n');
    t.st.mode = 'editor';
    t.st.buffer = '#alias {a} {b}\n#alias {k} {kill}\n';
    expect(t.model.unapplied()).toBe(true);
    const out = await t.model.commit('save');
    expect(out.kind).toBe('clean');
    expect(t.stored()).toBe('#alias {a} {b}\n#alias {k} {kill}\n');
    expect(t.model.unapplied()).toBe(false);
  });

  it('reports a failed save as failed, and the edits stay unapplied', async () => {
    const t = setup('#alias {a} {b}\n', { fail: { ok: false, reason: 'The disk is full.', stage: 'save' } });
    t.st.doc = editEntry(t.st.doc, aliasId(t.st.doc, 'a'), { body: 'bee' });
    const out = await t.model.commit('close');
    expect(out).toEqual({ kind: 'failed', message: 'The disk is full.', save: true });
    expect(t.model.unapplied()).toBe(true);
    expect(t.model.savedAny).toBe(false);
    // A close's outcome is the prompt's, not the flash's.
    expect(t.st.reports).toHaveLength(0);
  });

  it('turns a refused live apply into a held outcome', async () => {
    const t = setup('#alias {a} {b}\n', { live: true, fail: { ok: false, reason: 'The profile does not load.', stage: 'apply' } });
    t.st.doc = editEntry(t.st.doc, aliasId(t.st.doc, 'a'), { body: 'bee' });
    const out = await t.model.commit('save');
    expect(out).toEqual({ kind: 'held', message: 'Not applied: The profile does not load.' });
  });

  it('runs one apply at a time, each on the base the one before left', async () => {
    const t = setup('#alias {a} {b}\n#alias {c} {d}\n');
    t.st.doc = editEntry(t.st.doc, aliasId(t.st.doc, 'a'), { body: 'one' });
    const first = t.model.commit('auto');
    expect(t.model.busy()).toBe(true);
    t.st.doc = editEntry(t.st.doc, aliasId(t.st.doc, 'c'), { body: 'two' });
    const second = t.model.commit('auto');
    expect((await first).kind).toBe('clean');
    expect((await second).kind).toBe('clean');
    expect(t.model.busy()).toBe(false);
    expect(t.stored()).toBe('#alias {a} {one}\n#alias {c} {two}\n');
  });
});
