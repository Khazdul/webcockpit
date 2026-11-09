import { describe, expect, it } from 'vitest';
import { commPlain, isGroupTell } from '../../src/gmcp/comm';
import { prependedCount } from '../../src/panes/anchored-list';
import {
  COMM_LIST_MIN_PANE,
  ago,
  autoListWidth,
  bubbleText,
  channelInk,
  columnLayout,
  personInk,
  railWidth,
  snippet,
  spineSnap,
  spineStep,
  splitHits,
} from '../../src/panes/comm-view';
import { contrast } from '../../src/theme/color';

const msg = (channel: string, talker: string, text: string, destination: string | null = null) => ({
  channel,
  talker,
  talkerType: null,
  destination,
  text,
});

describe('Comm pane layout (ADR 0134)', () => {
  it('the column: a rail under 380 px, a share of the pane above, the dragged width, folded', () => {
    expect(columnLayout(COMM_LIST_MIN_PANE - 1, null, false, 17)).toEqual({ mode: 'rail', width: railWidth(17) });
    expect(columnLayout(COMM_LIST_MIN_PANE, null, false, 17)).toEqual({ mode: 'list', width: 129 });
    expect(columnLayout(1000, null, false, 17)).toEqual({ mode: 'list', width: 184 });
    expect(autoListWidth(300)).toBe(124);
    expect(columnLayout(500, 60, false, 17).mode).toBe('rail');
    expect(columnLayout(500, 150, false, 17)).toEqual({ mode: 'list', width: 150 });
    expect(columnLayout(300, 400, false, 17)).toEqual({ mode: 'list', width: 151 });
    expect(columnLayout(500, 150, true, 17)).toEqual({ mode: 'folded', width: 0 });
  });

  it('the spine snaps folded, rail or a list width, and its keys step', () => {
    expect(spineSnap(10, 500, 17).mode).toBe('folded');
    expect(spineSnap(60, 500, 17)).toEqual({ mode: 'rail', width: railWidth(17) });
    expect(spineSnap(100, 500, 17)).toEqual({ mode: 'list', width: 110 });
    expect(spineSnap(900, 500, 17)).toEqual({ mode: 'list', width: 240 });
    expect(spineStep('list', -1)).toBe('rail');
    expect(spineStep('rail', -1)).toBe('folded');
    expect(spineStep('folded', -1)).toBe('folded');
    expect(spineStep('folded', 1)).toBe('rail');
  });

  it('ages, bubble text, snippets and search hits', () => {
    expect(ago(1000, 5000)).toBe('now');
    expect(ago(0, 30_000)).toBe('30s');
    expect(ago(0, 5 * 60_000)).toBe('5m');
    expect(ago(0, 125 * 60_000)).toBe('2h5m');
    expect(ago(0, 72 * 3600_000)).toBe('3d');
    expect(bubbleText(msg('tells', 'Gibur', "Gibur tells you 'hi there'"))).toEqual({ action: false, text: 'hi there' });
    expect(bubbleText(msg('tells', 'you', 'ok', 'Gibur'))).toEqual({ action: false, text: 'ok' });
    expect(bubbleText(msg('emotes', 'Gibur', 'Gibur grins.'))).toEqual({ action: true, text: 'Gibur grins.' });
    expect(snippet(msg('tells', 'you', 'ok', 'Gibur'), true)).toBe('You: ok');
    expect(snippet(msg('says', 'Dori the Dwarf', "Dori says 'yes'"), false, true)).toBe('Dori: yes');
    expect(splitHits('Troll and troll', 'troll')).toEqual(['', 'Troll', ' and ', 'troll', '']);
    expect(splitHits('none', 'x')).toEqual(['none']);
  });

  it('inks: fitted to 4.5:1 on Paper; you take the pane colour', () => {
    const paper = '#f4ecd8';
    for (let i = 0; i < 10; i++) expect(contrast(personInk(i, true, paper, 'x'), paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(personInk('enemy', true, paper, 'x'), paper)).toBeGreaterThanOrEqual(4.5);
    expect(personInk('you', true, paper, 'var(--cm-self)')).toBe('var(--cm-self)');
    expect(channelInk('tales', false, '#000000')).toBe('#d2ca5c');
    expect(contrast(channelInk('tales', true, paper), paper)).toBeGreaterThanOrEqual(4.5);
  });

  it('group tells (ADR 0134): read as "tells the group", not "tells you"', () => {
    const inn = msg('tells', 'Lindir', "Lindir tells the group 'wait'");
    expect(isGroupTell(inn)).toBe(true);
    expect(commPlain(inn)).toBe("Lindir tells the group 'wait'");
    const out = msg('tells', 'you', 'coming', 'group');
    expect(isGroupTell(out)).toBe(true);
    expect(commPlain(out)).toBe("You tell the group 'coming'");
    expect(isGroupTell(msg('tells', 'Lindir', "Lindir tells you 'hi'"))).toBe(false);
    expect(isGroupTell(msg('says', 'Lindir', "Lindir says 'tells the group 'x''"))).toBe(false);
  });

  it('prependedCount: items put in front of the previous ones', () => {
    const a = { n: 1 }, b = { n: 2 }, c = { n: 3 }, d = { n: 4 };
    expect(prependedCount([b, c], [a, b, c])).toBe(1);
    expect(prependedCount([b, c], [a, b, c, d])).toBe(1);
    expect(prependedCount([b, c], [b, c, d])).toBe(0);
    expect(prependedCount([b, c], [a, c])).toBe(-1);
    expect(prependedCount([], [a])).toBe(-1);
  });
});
