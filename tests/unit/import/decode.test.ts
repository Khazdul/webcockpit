import { describe, expect, it } from 'vitest';
import { decodeBytes, looksCyrillic } from '../../../src/import/decode';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('decodeBytes', () => {
  it('reads strict UTF-8 and strips a BOM', () => {
    const r = decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('#alias {å} {say ö}')]));
    expect(r).toEqual({ text: '#alias {å} {say ö}', encoding: 'utf-8' });
  });

  it('turns CRLF and CR into LF', () => {
    expect(decodeBytes(new TextEncoder().encode('a\r\nb\rc\n')).text).toBe('a\nb\nc\n');
  });

  it('normalises to NFC', () => {
    expect(decodeBytes(new TextEncoder().encode('é')).text).toBe('é');
  });

  it('falls back to windows-1252 for Western single-byte text', () => {
    // "café crème" in latin-1
    const r = decodeBytes(bytes(0x63, 0x61, 0x66, 0xe9, 0x20, 0x63, 0x72, 0xe8, 0x6d, 0x65));
    expect(r).toEqual({ text: 'café crème', encoding: 'windows-1252' });
  });

  it('picks windows-1251 for Russian text', () => {
    // "#alias {пр} {привет}" in cp1251
    const r = decodeBytes(bytes(0x23, 0x61, 0x20, 0xef, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2));
    expect(r.encoding).toBe('windows-1251');
    expect(r.text).toBe('#a привет');
  });

  it('decodes UTF-16 with a BOM', () => {
    expect(decodeBytes(bytes(0xff, 0xfe, 0x23, 0, 0x61, 0)).text).toBe('#a');
    expect(decodeBytes(bytes(0xfe, 0xff, 0, 0x23, 0, 0x61)).encoding).toBe('utf-16be');
  });

  it('looksCyrillic needs letters in 0xC0–0xFF and a Cyrillic word', () => {
    expect(looksCyrillic(bytes(0xef, 0xf0, 0xe8))).toBe(true);
    expect(looksCyrillic(bytes(0x61, 0xe9, 0x61))).toBe(false);
    expect(looksCyrillic(bytes(0x80, 0x81, 0x82, 0xe9))).toBe(false);
  });
});
