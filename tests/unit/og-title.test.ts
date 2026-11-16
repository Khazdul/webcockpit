// The link preview's title and PNG head check (shared/cloud/preview.ts, ADR 0158).
import { describe, expect, it } from 'vitest';
import { OG_TITLE_MAX, clip, isPreviewPng, ogDescription, ogTitle } from '../../shared/cloud/preview';

const len = (s: string): number => [...s].length;

describe('ogTitle', () => {
  it('title and character as they are when they fit', () => {
    expect(ogTitle('Orc fight at the ford', 'Olev')).toBe('Orc fight at the ford (Olev)');
  });
  it('cuts a long title with an ellipsis and keeps the character', () => {
    const t = ogTitle('x'.repeat(100), 'Rasta');
    expect(len(t)).toBe(OG_TITLE_MAX);
    expect(t.endsWith('x… (Rasta)')).toBe(true);
  });
  it('trims before the ellipsis and counts code points', () => {
    const t = ogTitle(`${'é🐉 '.repeat(30)}`, 'Ö');
    expect(len(t)).toBeLessThanOrEqual(OG_TITLE_MAX);
    expect(t).toMatch(/\S… \(Ö\)$/u);
  });
  it('a very long character name is cut too, leaving room for the title', () => {
    const t = ogTitle('Title', 'N'.repeat(60));
    expect(len(t)).toBeLessThanOrEqual(OG_TITLE_MAX);
    expect(t.startsWith('Title (N')).toBe(true);
  });
  it('no character: the title alone; no title: the character; line breaks become spaces', () => {
    expect(ogTitle('A\nB', '')).toBe('A B');
    expect(ogTitle('', 'Olev')).toBe('Olev');
    expect(ogTitle('', '')).toBe('MUME Cockpit');
  });
});

describe('clip and ogDescription', () => {
  it('clip', () => {
    expect(clip('abc', 3)).toBe('abc');
    expect(clip('abcd', 3)).toBe('ab…');
  });
  it('ogDescription is one line', () => {
    expect(ogDescription('Two orcs.\n\nOne troll. ')).toBe('Two orcs. One troll.');
    expect(len(ogDescription('y'.repeat(500)))).toBe(200);
  });
});

describe('isPreviewPng', () => {
  const head = (w: number, h: number, colour = 6): Uint8Array => {
    const b = new Uint8Array(40);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    b[24] = 8;
    b[25] = colour;
    return b;
  };
  it('accepts the size, refuses others', () => {
    expect(isPreviewPng(head(1200, 900))).toBe(true);
    expect(isPreviewPng(head(1200, 900, 2))).toBe(true);
    expect(isPreviewPng(head(1200, 630))).toBe(false);
    expect(isPreviewPng(head(1200, 900, 3))).toBe(false);
    expect(isPreviewPng(head(1200, 900).slice(0, 20))).toBe(false);
  });
});
