// ADR 0105: the profile editor's edits rebased onto a newer stored text.
import { describe, expect, it } from 'vitest';
import {
  addEntry,
  alignDoc,
  editEntry,
  listEntries,
  parseProfile,
  rebaseDoc,
  removeEntry,
  serialize,
  setVariable,
} from '../../src/script/doc';

const BASE = '#nop mine\n#alias {a} {one}\n#alias {b} {two}\n\n#variable {hp} {10}\n#action {^x} {y}\n';

/** The editor's three documents: base, a local edit of it, and `stored` aligned to base. */
function rebase(local: (base: ReturnType<typeof parseProfile>) => ReturnType<typeof parseProfile>, stored: string): string {
  const base = parseProfile(BASE);
  return serialize(rebaseDoc(base, local(base), alignDoc(base, parseProfile(stored))));
}

const entry = (doc: ReturnType<typeof parseProfile>, pattern: string) => listEntries(doc).find((e) => e.pattern === pattern)!;

describe('alignDoc', () => {
  it('keeps the base ids of equal nodes and of entries rewritten in place', () => {
    const base = parseProfile(BASE);
    const same = alignDoc(base, parseProfile(BASE));
    expect(same.nodes.map((n) => n.id)).toEqual(base.nodes.map((n) => n.id));
    const changed = alignDoc(base, parseProfile(BASE.replace('{two}', '{deux}').replace('{10}', '{7}')));
    expect(changed.nodes.map((n) => n.id)).toEqual(base.nodes.map((n) => n.id));
    expect(entry(changed, 'b').body).toBe('deux');
  });

  it('gives inserted nodes ids no document hands out', () => {
    const base = parseProfile(BASE);
    const more = alignDoc(base, parseProfile(BASE.replace('#alias {b} {two}\n', '#alias {b} {two}\n#alias {zz} {say hi}\n')));
    const zz = entry(more, 'zz');
    expect(zz.id).toBeLessThan(-1);
    expect(base.nodes.some((n) => n.id === zz.id)).toBe(false);
  });
});

describe('rebaseDoc', () => {
  it('keeps a typed alias saved meanwhile beside a local edit', () => {
    const stored = BASE.replace('#alias {b} {two}\n', '#alias {b} {two}\n#alias {zz} {say hi}\n');
    expect(rebase((b) => editEntry(b, entry(b, 'a').id, { body: 'uno' }), stored)).toBe(
      '#nop mine\n#alias {a} {uno}\n#alias {b} {two}\n#alias {zz} {say hi}\n\n#variable {hp} {10}\n#action {^x} {y}\n',
    );
  });

  it('keeps a variable written back meanwhile', () => {
    const stored = serialize(setVariable(parseProfile(BASE), 'hp', '3'));
    expect(rebase((b) => editEntry(b, entry(b, '^x').id, { body: 'z' }), stored)).toBe(
      '#nop mine\n#alias {a} {one}\n#alias {b} {two}\n\n#variable {hp} {3}\n#action {^x} {z}\n',
    );
  });

  it('keeps both a local new entry and an outside one at the same place', () => {
    const stored = BASE.replace('#alias {b} {two}\n', '#alias {b} {two}\n#alias {zz} {say hi}\n');
    const out = rebase((b) => addEntry(b, { kind: 'alias', pattern: 'c', body: 'three' }).doc, stored);
    expect(out).toContain('#alias {zz} {say hi}\n');
    expect(out).toContain('#alias {c} {three}\n');
    expect(out.indexOf('#alias {c}')).toBeGreaterThan(out.indexOf('#alias {b}'));
    expect(out).toContain('\n\n#variable {hp} {10}\n#action {^x} {y}\n');
  });

  it('removes what local deleted, also when it changed outside', () => {
    expect(rebase((b) => removeEntry(b, entry(b, 'a').id), BASE)).toBe(BASE.replace('#alias {a} {one}\n', ''));
    expect(rebase((b) => removeEntry(b, entry(b, 'a').id), BASE.replace('{one}', '{1}'))).toBe(BASE.replace('#alias {a} {one}\n', ''));
  });

  it('lets a local edit win over an outside change to the same entry', () => {
    expect(rebase((b) => editEntry(b, entry(b, 'a').id, { body: 'mine' }), BASE.replace('{one}', '{theirs}'))).toBe(
      BASE.replace('{one}', '{mine}'),
    );
  });

  it('puts an edited entry back that was removed outside (#unalias)', () => {
    const out = rebase((b) => editEntry(b, entry(b, 'b').id, { body: 'kept' }), BASE.replace('#alias {b} {two}\n', ''));
    expect(out).toBe(BASE.replace('{two}', '{kept}'));
  });

  it('does not repeat edits that the new base already holds (after an apply)', () => {
    const base = parseProfile(BASE);
    const { doc: added, id } = addEntry(base, { kind: 'alias', pattern: 'c', body: 'three' });
    const local = editEntry(added, entry(added, 'a').id, { body: 'uno' });
    // What was applied: the local edits rebased onto the stored text.
    const applied = rebaseDoc(base, local, alignDoc(base, parseProfile(BASE)));
    // The user typed on meanwhile: the new entry's body.
    const later = editEntry(local, id, { body: 'tres' });
    const next = rebaseDoc(base, later, applied);
    expect(serialize(next)).toBe(serialize(later));
    // And against the new base only the later edit is left.
    expect(serialize(rebaseDoc(applied, applied, alignDoc(applied, parseProfile(serialize(applied)))))).toBe(serialize(applied));
  });

  it('rebases a whole edited text (EDITOR) by its alignment', () => {
    const base = parseProfile(BASE);
    const buffer = BASE.replace('{one}', '{uno}') + '#alias {k} {kill}\n';
    const stored = serialize(setVariable(parseProfile(BASE), 'hp', '4'));
    const out = serialize(rebaseDoc(base, alignDoc(base, parseProfile(buffer)), alignDoc(base, parseProfile(stored))));
    expect(out).toBe(buffer.replace('{10}', '{4}'));
  });

  it('adds a line break where a node no longer ends the text', () => {
    const base = parseProfile('#alias {a} {one}');
    const { doc } = addEntry(base, { kind: 'alias', pattern: 'b', body: 'two' });
    const out = serialize(rebaseDoc(base, doc, alignDoc(base, parseProfile('#alias {a} {one}\n#alias {zz} {hi}'))));
    expect(out).toBe('#alias {a} {one}\n#alias {b} {two}\n#alias {zz} {hi}');
  });
});
