// Stage 65's review fixes on the client (ADR 0155 "As built (stage 65,
// review fixes)"): one describe per finding. The Worker's are in
// worker/test/review65.test.ts.
import { describe, expect, it } from 'vitest';
import { isPublicText } from '../../shared/cloud/text.ts';
import { cleanDescription, cleanTitle, linkMeta, typedTitle } from '../../src/share/link';
import { createFailureWords, pubFailureWords } from '../../src/chrome/frames/share-words';
import { HIDDEN_TEXT, commentFailText } from '../../src/watch/model';

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

describe('S7: a hidden comment or note says why it cannot be removed', () => {
  it('403 hidden is the line of its own', () => {
    expect(HIDDEN_TEXT).toBe('Hidden after reports; the admin will look at it.');
    expect(commentFailText(403, 'hidden')).toBe(HIDDEN_TEXT);
    expect(commentFailText(403, 'suspended')).not.toBe(HIDDEN_TEXT);
  });
});

describe('CR2: an answer asked before a mark does not bring back what the mark cleared', () => {
  it('the counts the mark covers stay 0; a count with newer items stays', async () => {
    const { communityNews, markCommunitySeen, refreshCommunityNews, setNewsDepsForTest } = await import('../../src/cloud/community/news');
    let release: (v: unknown) => void = () => undefined;
    const answers: Promise<unknown>[] = [new Promise((r) => (release = r))];
    setNewsDepsForTest({
      enabled: async () => true,
      fetch: async (url) => (url.endsWith('/news') ? { ok: true, json: () => answers.shift() ?? Promise.resolve(null) } : { ok: true, json: async () => ({}) }),
    });
    const asked = refreshCommunityNews();
    // The page shows the runs up to 500 and the reactions up to 900 while the answer is on its way.
    await new Promise((r) => setTimeout(r, 0));
    expect(await markCommunitySeen({ gallery: 500, reactions: 900 })).toBe(true);
    release({ runs: 3, reactions: 2, newestRun: 500, newestReaction: 950 });
    await asked;
    expect(communityNews()).toEqual({ runs: 0, reactions: 2, newestRun: 500, newestReaction: 950 });
    setNewsDepsForTest({});
  });
});

describe('CR6: one formatter set for the mean, the stars and the age', () => {
  it('the Community page, the watch page and Published runs round alike', async () => {
    const cm = await import('../../src/chrome/frames/community-model');
    const wm = await import('../../src/watch/model');
    const sw = await import('../../src/chrome/frames/share-words');
    for (const s of [{ sum: 87, count: 20 }, { sum: 13, count: 3 }, { sum: 72, count: 15 }, { sum: 0, count: 0 }]) {
      expect(cm.meanText(s)).toBe(wm.meanText(s));
      expect(sw.meanWords(s)).toBe(wm.meanText(s));
      expect(cm.starsShown(s)).toBe(wm.meanStars(s));
    }
    // 4.35: half up everywhere (the Community page said 4.3 before).
    expect(cm.meanText({ sum: 87, count: 20 })).toBe('4.4');
    const now = Date.UTC(2026, 10, 15, 12);
    for (const ago of [10_000, 5 * 60_000, 3 * 3_600_000, 30 * 3_600_000, 4 * 86_400_000]) {
      expect(wm.ageText(now - ago, now).replace(/ ago$/, '')).toBe(cm.noteAge(now - ago, now));
    }
  });
});
