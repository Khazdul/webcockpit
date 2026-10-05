// The import corpus (tests/fixtures/import, hand-written in the style of
// the public files cited in notes/research/import): every translated
// profile must load in the script engine, and every source command (for
// Mudlet: every item element outside a package) must have a report item.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ImportFile, ImportResult } from '../../../src/import/types';
import { type XmlElement, childText, parseXml } from '../../../src/import/xml';
import { countsMatch, fixture, load, run } from './helpers';

const CORPUS: Array<{ format: ImportResult['format']; files: ImportFile[]; entry: string }> = [
  { format: 'tintin', files: [fixture('tintin', 'mume.tin'), fixture('tintin', 'aliases.tin'), fixture('tintin', 'gmcp.tin')], entry: 'mume.tin' },
  { format: 'tintin', files: [fixture('tintin', 'plain.tin')], entry: 'plain.tin' },
  { format: 'jmc', files: [fixture('jmc', 'global.set'), fixture('jmc', 'mume.set'), fixture('jmc', 'jmc_actions.txt')], entry: 'mume.set' },
  { format: 'powwow', files: [fixture('powwow', 'mume')], entry: 'mume' },
];

/** Lines that start a command or text and are not comments: each must have an item. */
function commandLines(f: ImportFile, format: string): number[] {
  const text = new TextDecoder().decode(f.bytes);
  const out: number[] = [];
  let depth = 0;
  let inComment = false;
  text.split('\n').forEach((l, i) => {
    const t = l.trim();
    const top = depth === 0;
    for (let k = 0; k < l.length; k++) {
      if (l[k] === '\\') k++;
      else if (l[k] === '{') depth++;
      else if (l[k] === '}') depth--;
    }
    if (format === 'tintin' && t.startsWith('/*')) inComment = !t.includes('*/');
    else if (inComment) inComment = !t.includes('*/');
    else if (top && t !== '' && !t.startsWith('{') && !/^#(?:nop\b|#|\(")/.test(t)) out.push(i + 1);
    if (format === 'powwow') depth = 0;
  });
  return out;
}

const MUDLET = ['profile.xml', 'package.xml'];

const ITEM = /^(?:Trigger|Alias|Key|Timer|Script|Action)$/;

/** Start lines of the Mudlet item elements outside packages (and of variables). */
function mudletItemLines(f: ImportFile): number[] {
  const root = parseXml(new TextDecoder().decode(f.bytes));
  const host = root.children.find((c) => c.name === 'HostPackage');
  const installed = new Set<string>();
  const walkAll = (e: XmlElement, fn: (x: XmlElement) => void): void => {
    fn(e);
    e.children.forEach((c) => walkAll(c, fn));
  };
  if (host) walkAll(host, (x) => x.name === 'string' && installed.add(x.text));
  const tops = root.children.flatMap((s) => (s.name.endsWith('Package') ? s.children : []));
  const isPkg = (e: XmlElement) => {
    const p = childText(e, 'packageName');
    return p !== '' && ((e.name.endsWith('Group') && p === childText(e, 'name')) || installed.has(p));
  };
  const exported = !host && tops.filter((t) => /Group$|^(?:Trigger|Alias|Key|Timer|Script|Action)$/.test(t.name)).every(isPkg);
  const out: number[] = [];
  for (const t of tops) {
    if (!exported && isPkg(t)) continue;
    walkAll(t, (x) => {
      if (ITEM.test(x.name) || x.name === 'Variable' || (x.name === 'VariableGroup' && x !== t)) out.push(x.line);
    });
    if (t.name === 'Variable' || t.name === 'VariableGroup') out.push(t.line);
  }
  return out;
}

describe('import corpus: Mudlet', () => {
  for (const name of MUDLET) {
    describe(name, () => {
      const f = fixture('mudlet', name);
      const r = run(f);

      it('detects Mudlet', () => {
        expect(r.format).toBe('mudlet');
        expect(r.entry).toBe(name);
        expect(r.signals[0]).toMatch(/^MudletPackage version /);
      });

      it('the profile loads in the script engine without errors or warnings', () => {
        expect(load(r.profileText)).toEqual({ ok: true, warnings: [] });
        expect(r.profileText.split('\n')[0]).toMatch(/^#nop \{Imported from Mudlet file \S+ on 2026-10-04\. See the import report\.\}$/);
      });

      it('every item outside a package has a report item; counts match', () => {
        const lines = new Set(r.items.map((i) => i.line));
        const missing = mudletItemLines(f).filter((n) => !lines.has(n));
        expect(missing).toEqual([]);
        expect(countsMatch(r)).toBe(true);
        for (const it of r.items) {
          expect(it.source.length).toBeGreaterThan(0);
          if (it.outcome !== 'translated') expect(it.reason).toBeTruthy();
        }
      });
    });
  }
});

describe('import corpus', () => {
  for (const c of CORPUS) {
    describe(`${c.format}: ${c.files.map((f) => f.name).join(', ')}`, () => {
      const r = run(...c.files);

      it('detects the format and the entry file', () => {
        expect(r.format).toBe(c.format);
        expect(r.entry).toBe(c.entry);
        expect(r.signals.length).toBeGreaterThan(0);
        expect(r.signals.length).toBeLessThanOrEqual(3);
      });

      it('the profile loads in the script engine without errors', () => {
        const res = load(r.profileText);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        // Foreign formats: no warnings at all. tt++: only the hints of inert commands kept in place.
        const unexpected = res.warnings.filter((w) => c.format !== 'tintin' || !/: #(?:read|map): /.test(w));
        expect(unexpected).toEqual([]);
      });

      it('every source command has an item; counts match the items', () => {
        for (const f of c.files) {
          const lines = new Set(r.items.filter((i) => i.file === f.name).map((i) => i.line));
          const missing = commandLines(f, c.format).filter((n) => !lines.has(n));
          expect(missing, f.name).toEqual([]);
        }
        expect(countsMatch(r)).toBe(true);
        for (const it of r.items) {
          expect(it.source.length).toBeGreaterThan(0);
          if (it.outcome !== 'translated') expect(it.reason).toBeTruthy();
        }
      });

      it('the profile starts with the import header unless nothing changed', () => {
        if (r.unchanged) expect(r.profileText).toBe(new TextDecoder().decode(c.files[0]!.bytes));
        else expect(r.profileText.split('\n')[0]).toMatch(/^#nop \{Imported from (TinTin\+\+|JMC|Powwow) file \S+ on 2026-10-04\. See the import report\.\}$/);
      });
    });
  }

  it('the bundled profiles import unchanged (a WebCockpit export is tt++)', () => {
    for (const name of ['khazdul.tin', 'template.tin']) {
      const bytes = new Uint8Array(readFileSync(new URL(`../../../src/profiles/${name}`, import.meta.url)));
      const r = run({ name, bytes });
      expect(r.format).toBe('tintin');
      expect(r.unchanged).toBe(true);
      expect(r.profileText).toBe(new TextDecoder().decode(bytes));
      expect(r.counts.kept + r.counts.skipped + r.counts.warnings).toBe(0);
    }
  });

  it('the tt++ set reports the missing #read file', () => {
    expect(run(...CORPUS[0]!.files).missingFiles).toEqual(['missing.tin']);
  });

  it('a windows-1251 JMC file decodes and translates', () => {
    // "#alias {пр} {сказать привет}" in cp1251 (А–я are 0xC0–0xFF).
    const cp1251 = (s: string) => Uint8Array.from([...s].map((ch) => (ch >= 'А' && ch <= 'я' ? ch.charCodeAt(0) - 0x410 + 0xc0 : ch.charCodeAt(0))));
    const r = run({ name: 'rus.set', bytes: cp1251('#alias {пр} {сказать привет}\n') });
    expect(r.profileText).toContain('#alias {пр} {сказать привет}');
    expect(r.fileWarnings).toContain('rus.set was read as windows-1251.');
    expect(load(r.profileText).ok).toBe(true);
  });
});
