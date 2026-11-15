// The free public text rules of stage 65 (shared/cloud/text.ts, ADR 0155):
// the Worker's check and the client's cleaner agree; what the cleaner
// makes (and the player trims) always passes the check.
import { describe, expect, it } from 'vitest';
import { MAX_MARKS, cleanPublicText, isPublicText, publicTextToSend } from '../../shared/cloud/text.ts';

const cp = String.fromCodePoint;
const COMMENT = { newlines: 20 };
const NOTE = { newlines: 0 };

describe('isPublicText', () => {
  it('refuses invisible and smuggling characters, tags, bidi controls, control characters and lone surrogates', () => {
    const refused = [0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x17b4, 0x17b5, 0x180b, 0x180e, 0x180f, 0x200b, 0x200c, 0x200e, 0x200f, 0x2028, 0x2029, 0x2060, 0x2064, 0x3164, 0xfeff, 0xffa0, 0xfff9, 0xe0000, 0xe0041, 0xe007f, 0x202a, 0x202e, 0x2066, 0x2069, 0x0000, 0x0009, 0x000d, 0x007f, 0x0085];
    for (const c of refused) expect(isPublicText(`a${cp(c)}b`, COMMENT), c.toString(16)).toBe(false);
    expect(isPublicText(`a${String.fromCharCode(0xd800)}b`, COMMENT)).toBe(false);
  });

  it('keeps emoji: ZWJ sequences, variation selectors, skin tones, keycaps', () => {
    for (const s of [`${cp(0x1f468)}${cp(0x200d)}${cp(0x1f469)}${cp(0x200d)}${cp(0x1f467)}`, `${cp(0x2764)}${cp(0xfe0f)}`, `${cp(0x1f44d)}${cp(0x1f3fd)}`, `1${cp(0xfe0f)}${cp(0x20e3)}`]) {
      expect(isPublicText(s, NOTE), s).toBe(true);
    }
  });

  it('allows at most MAX_MARKS combining marks in a row; wants NFC', () => {
    const marks = (n: number): string => `x${Array.from({ length: n }, (_, i) => cp(0x0300 + i)).join('')}`;
    expect(isPublicText(marks(MAX_MARKS), NOTE)).toBe(true);
    expect(isPublicText(marks(MAX_MARKS + 1), NOTE)).toBe(false);
    expect(isPublicText(`e${cp(0x0301)}`, NOTE)).toBe(false);
    expect(isPublicText(`e${cp(0x0301)}`.normalize('NFC'), NOTE)).toBe(true);
  });

  it('counts the marks per base character, a ZWJ between them or not (review fix S1)', () => {
    const tower = `x${`${cp(0x0310)}${cp(0x0311)}${cp(0x0312)}${cp(0x200d)}`.repeat(200)}`;
    expect(isPublicText(tower, COMMENT)).toBe(false);
    expect(isPublicText(`x${cp(0x0310)}${cp(0x0311)}${cp(0x200d)}${cp(0x0312)}${cp(0x0313)}`, NOTE)).toBe(false);
    for (const f of [0x206a, 0x206f]) expect(isPublicText(`x${cp(0x0310)}${cp(0x0311)}${cp(0x0312)}${cp(f)}${cp(0x0313)}`, NOTE)).toBe(false);
    expect(isPublicText(`x${cp(0x0310)}${cp(0x0311)}${cp(0x0312)} y${cp(0x0313)}`, NOTE)).toBe(true);
    expect(cleanPublicText(tower, NOTE)).toBe(`x${cp(0x0310)}${cp(0x0311)}${cp(0x0312)}`);
  });

  it('refuses the other format characters, private use, unassigned, noncharacters, U+2800 and U+FFFC (review fix S2)', () => {
    const refused = [0x0600, 0x0605, 0x06dd, 0x070f, 0x0890, 0x08e2, 0x206a, 0x206f, 0x110bd, 0x110cd, 0x13430, 0x1bca0, 0x1d173, 0x2800, 0xfffc, 0xe000, 0xf8ff, 0xf0000, 0x10fffd, 0xfffe, 0xffff, 0x10ffff, 0xfdd0, 0x0378];
    for (const c of refused) expect(isPublicText(`a${cp(c)}b`, COMMENT), c.toString(16)).toBe(false);
  });

  it('keeps a ZWJ only inside an emoji-like sequence, never two in a row (review fix S2)', () => {
    const z = cp(0x200d);
    for (const s of [z, `${z}${z}`, `a${z}${z}b`, `${z}a`, `a${z}`, `a ${z}b`, `a${cp(0x0301)}${z}b`, `a${z}${cp(0x0301)}`]) expect(isPublicText(s, NOTE), JSON.stringify(s)).toBe(false);
    for (const s of [`${cp(0x2764)}${cp(0xfe0f)}${z}${cp(0x1f525)}`, `${cp(0x1f3f3)}${cp(0xfe0f)}${z}${cp(0x1f308)}`, `${cp(0x1f469)}${cp(0x1f3fd)}${z}${cp(0x1f4bb)}`]) {
      expect(isPublicText(s, NOTE), s).toBe(true);
    }
  });

  it('wants a visible character (review fix S2)', () => {
    for (const s of [cp(0x200d), `${cp(0x200d)}${cp(0x200d)}`, cp(0x2800), ' ', cp(0x3000), cp(0x0301), `${cp(0x0301)} ${cp(0x0302)}`]) expect(isPublicText(s, NOTE), JSON.stringify(s)).toBe(false);
    for (const s of ['a', '.', '7', cp(0x1f600), 'é']) expect(isPublicText(s, NOTE), s).toBe(true);
  });

  it('counts the line breaks', () => {
    expect(isPublicText('a\nb', NOTE)).toBe(false);
    expect(isPublicText(Array(21).fill('l').join('\n'), COMMENT)).toBe(true);
    expect(isPublicText(Array(22).fill('l').join('\n'), COMMENT)).toBe(false);
  });
});

describe('cleanPublicText', () => {
  it('takes out what the rules refuse, cuts towers, makes CRLF and the breaks past the limit spaces, and does not trim', () => {
    expect(cleanPublicText(`a${cp(0x200b)}b${cp(0xe0041)}c${cp(0x202e)}`, NOTE)).toBe('abc');
    expect(cleanPublicText(`x${cp(0x0300)}${cp(0x0301)}${cp(0x0302)}${cp(0x0303)}${cp(0x0304)}y`, NOTE)).toBe(`x${cp(0x0300)}${cp(0x0301)}${cp(0x0302)}y`);
    expect(cleanPublicText('one\r\ntwo\rthree', NOTE)).toBe('one two three');
    expect(cleanPublicText('a\nb\nc', { newlines: 1 })).toBe('a\nb c');
    expect(cleanPublicText(' typing ', NOTE)).toBe(' typing ');
    expect(cleanPublicText(`e${cp(0x0301)}`, NOTE)).toBe(`e${cp(0x0301)}`.normalize('NFC'));
  });

  it('what it sends passes the check, for hostile input (review fixes S1, S2: the fuzz)', () => {
    const pieces = ['a', ' ', '\n', '\r', '\t', cp(0x0301), cp(0x0300), cp(0x0310), cp(0x034f), cp(0x200b), cp(0x200d), cp(0x200d), cp(0x202e), cp(0x2066), cp(0xe0041), cp(0xfeff), cp(0x1f600), cp(0x1f525), cp(0x2764), cp(0xfe0f), String.fromCharCode(0xd800), 'e', cp(0x00ad), cp(0x2028), cp(0x0007), cp(0x206a), cp(0x0600), cp(0x2800), cp(0xfffc), cp(0xe000), cp(0xfffe), cp(0x0378), cp(0x3164), cp(0x1d173), cp(0x3000), '.'];
    let seed = 7;
    const next = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648);
    let sent = 0;
    for (let n = 0; n < 20_000; n++) {
      let s = '';
      for (let i = 0; i < 1 + (next() % 30); i++) s += pieces[next() % pieces.length];
      for (const rules of [NOTE, COMMENT, { newlines: 2 }]) {
        const out = publicTextToSend(s, rules);
        // '' : nothing visible left, nothing to send.
        if (out === '') continue;
        sent++;
        expect(out).toBe(out.trim());
        expect(isPublicText(out, rules), JSON.stringify(s)).toBe(true);
      }
    }
    expect(sent).toBeGreaterThan(10_000);
  });
});
