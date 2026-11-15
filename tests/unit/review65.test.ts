// Stage 65's review fixes on the client (ADR 0155 "As built (stage 65,
// review fixes)"): one describe per finding. The Worker's are in
// worker/test/review65.test.ts.
import { describe, expect, it } from 'vitest';
import { isPublicText } from '../../shared/cloud/text.ts';
import { cleanDescription, cleanTitle, linkMeta, typedTitle } from '../../src/share/link';
import { createFailureWords, pubFailureWords } from '../../src/chrome/frames/share-words';

const cp = String.fromCodePoint;

describe('S3: the listed form cleans by the free public text rules', () => {
  const nasty = `Orc${cp(0x200b)}s${cp(0x00ad)} at the ford${cp(0x0310)}${cp(0x0311)}${cp(0x0312)}${cp(0x200d)}${cp(0x0313)}`;

  it('linkMeta with listed: title, description and character pass the Worker’s listed check', () => {
    const m = linkMeta({ title: nasty, description: `${nasty} ${cp(0x2800)}`, character: `Ole${cp(0x2060)}v`, lengthS: 3, listed: true });
    expect(m.title).toBe(`Orcs at the ford${cp(0x0310)}${cp(0x0311)}${cp(0x0312)}`);
    expect(isPublicText(m.title, { newlines: 0 })).toBe(true);
    expect(isPublicText(m.description, { newlines: 0 })).toBe(true);
    expect(m.character).toBe('Olev');
    // Link only: stage 64's rules (the zero width space stays).
    expect(linkMeta({ title: nasty, description: '', character: 'Olev', lengthS: 3 }).title).toContain(cp(0x200b));
  });

  it('a listed title with nothing visible is empty (Publish stays off)', () => {
    expect(cleanTitle(cp(0x3164), true)).toBe('');
    expect(cleanTitle(`${cp(0x200d)}${cp(0x200d)}`, true)).toBe('');
    expect(cleanDescription(cp(0x2800), true)).toBe('');
    expect(typedTitle(`a${cp(0x200b)}b`, true)).toBe('ab');
  });

  it('a 400 bad_text has words of its own', () => {
    expect(createFailureWords('bad_text')).toMatch(/characters the Community does not show/);
    expect(pubFailureWords('bad_text', 'edit')).toMatch(/characters the Community does not show/);
  });
});
