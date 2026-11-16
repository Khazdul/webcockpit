// Stage 65 C2: the watch page's stars and comments (src/watch/api.ts,
// src/watch/model.ts): the contract's values written out, the meta's new
// fields, the vote and comment requests, the comment field's cleaning, the
// words and where Back goes.
import { describe, expect, it } from 'vitest';
import { COMMENT_MAX, COMMENT_NEWLINES_MAX, COMMENTS_PAGE_SIZE } from '../../shared/cloud/api.ts';
import { isPublicText } from '../../shared/cloud/text.ts';
import { deleteComment, fetchComments, fetchVote, parseComment, parseMeta, parseStars, postComment, sendVote, type WatchFetch } from '../../src/watch/api';
import {
  COMMENT_BREAKS,
  COMMENT_LIMIT,
  COMMENTS_PER_PAGE,
  ageText,
  backTarget,
  commentFailText,
  commentField,
  commentToSend,
  meanStars,
  meanText,
  reportFailText,
  starWord,
  voteFailText,
  votesText,
} from '../../src/watch/model';

const META = {
  id: 'Ab3dE5fG7hJk',
  title: 'Clearing the ranger camp',
  description: '',
  sender: 'fenwick',
  character: 'Rasta',
  lengthS: 4500,
  created: Date.UTC(2026, 8, 26, 12),
  views: 37,
  bytes: 1_200,
};

describe("the contract's values, written out (stage 65)", () => {
  it('are the contract\'s', () => {
    expect(COMMENT_LIMIT).toBe(COMMENT_MAX);
    expect(COMMENT_BREAKS).toBe(COMMENT_NEWLINES_MAX);
    expect(COMMENTS_PER_PAGE).toBe(COMMENTS_PAGE_SIZE);
  });
});

describe('the meta with the community', () => {
  it('reads listed, stars and comments when they are there, and only well formed', () => {
    expect(parseMeta({ ...META, listed: true, stars: { sum: 13, count: 3 }, comments: 4 })).toEqual({ ...META, listed: true, stars: { sum: 13, count: 3 }, comments: 4 });
    // Without them (the flag `gallery` off): stage 64's meta.
    expect(parseMeta(META)).toEqual(META);
    // Bad stars or count are left out (the page then shows no stars), not the run.
    expect(parseMeta({ ...META, stars: { sum: 30, count: 2 }, comments: 1.5 })).toEqual(META);
    expect(parseStars({ sum: 0, count: 0 })).toEqual({ sum: 0, count: 0 });
    expect(parseStars({ sum: -1, count: 0 })).toBeUndefined();
    expect(parseStars([1, 2])).toBeUndefined();
  });

  it('reads a comment strictly', () => {
    const c = { id: 'Cm3dE5fG7hJk', writer: 'Norsy', text: 'Nice <b>run</b>', created: 1 };
    expect(parseComment({ ...c, extra: 1 })).toEqual(c);
    expect(parseComment({ ...c, text: 5 })).toBeUndefined();
    expect(parseComment({ ...c, created: -1 })).toBeUndefined();
  });
});

describe('the requests (stage 65)', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const answer =
    (status: number, body: unknown): WatchFetch =>
    async (url, init) => {
      calls.push({ url, init });
      return new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    };
  const headers = (i: number): Record<string, string> => calls[i]!.init.headers as Record<string, string>;

  it('asks for, gives and takes back one\'s vote with the session and X-WC', async () => {
    calls.length = 0;
    const v = { stars: { sum: 9, count: 2 }, mine: 4 };
    expect(await fetchVote('Ab3dE5fG7hJk', answer(200, v))).toEqual({ ok: true, value: v });
    expect(await sendVote('Ab3dE5fG7hJk', 5, answer(200, { ...v, mine: 5 }))).toEqual({ ok: true, value: { ...v, mine: 5 } });
    expect(await sendVote('Ab3dE5fG7hJk', null, answer(200, { stars: { sum: 5, count: 1 }, mine: null }))).toEqual({
      ok: true,
      value: { stars: { sum: 5, count: 1 }, mine: null },
    });
    expect(calls.map((c) => [c.url, c.init.method ?? 'GET', c.init.credentials])).toEqual([
      ['/api/u/pub/Ab3dE5fG7hJk/vote', 'GET', 'same-origin'],
      ['/api/u/pub/Ab3dE5fG7hJk/vote', 'PUT', 'same-origin'],
      ['/api/u/pub/Ab3dE5fG7hJk/vote', 'DELETE', 'same-origin'],
    ]);
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ stars: 5 });
    expect(headers(1)['X-WC']).toBe('1');
    expect(headers(1)['Content-Type']).toBe('application/json');
    expect(headers(2)['X-WC']).toBe('1');
    expect(calls[2]!.init.body).toBeUndefined();
    // The server's refusals, and an answer that is not one.
    expect(await sendVote('x', 3, answer(403, { error: 'own' }))).toEqual({ ok: false, status: 403, code: 'own' });
    expect(await sendVote('x', 3, answer(200, { stars: { sum: 1, count: 1 }, mine: 9 }))).toEqual({ ok: false, status: 200, code: 'bad_answer' });
    expect(await fetchVote('x', () => Promise.reject(new Error('down')))).toEqual({ ok: false, status: 0, code: 'offline' });
  });

  it('reads the comments publicly (no cookie), the newest page by default, older ones by cursor; posts and removes with the session', async () => {
    calls.length = 0;
    const c = { id: 'Cm3dE5fG7hJk', writer: 'Norsy', text: 'Hi', created: 5 };
    const page = { comments: [c, { id: 1 }], total: 51, more: true, before: '5.Cm3dE5fG7hJk' };
    expect(await fetchComments('Ab3dE5fG7hJk', null, answer(200, page))).toEqual({ ok: true, value: { ...page, comments: [c] } });
    await fetchComments('Ab3dE5fG7hJk', '5.Cm3dE5fG7hJk', answer(200, page));
    // No cursor: nothing more to ask for; a bad cursor is a bad answer.
    expect(await fetchComments('x', null, answer(200, { comments: [], total: 0, more: true }))).toEqual({ ok: true, value: { comments: [], total: 0, more: false } });
    expect((await fetchComments('x', null, answer(200, { comments: [], total: 0, more: true, before: 'x' }))).ok).toBe(false);
    expect(await postComment('Ab3dE5fG7hJk', 'Hi', answer(200, { comment: c }))).toEqual({ ok: true, value: c });
    expect(await deleteComment('Cm3dE5fG7hJk', answer(204, null))).toEqual({ ok: true, value: null });
    expect(calls.map((x) => [x.url, x.init.method ?? 'GET', x.init.credentials])).toEqual([
      ['/api/pub/Ab3dE5fG7hJk/comments', 'GET', 'omit'],
      ['/api/pub/Ab3dE5fG7hJk/comments?before=5.Cm3dE5fG7hJk', 'GET', 'omit'],
      ['/api/pub/x/comments', 'GET', 'omit'],
      ['/api/pub/x/comments', 'GET', 'omit'],
      ['/api/u/pub/Ab3dE5fG7hJk/comments', 'POST', 'same-origin'],
      ['/api/u/comments/Cm3dE5fG7hJk', 'DELETE', 'same-origin'],
    ]);
    expect(JSON.parse(calls[4]!.init.body as string)).toEqual({ text: 'Hi' });
    expect(headers(4)['X-WC']).toBe('1');
    expect(headers(5)['X-WC']).toBe('1');
    expect(await postComment('x', 'Hi', answer(429, { error: 'too_many' }))).toEqual({ ok: false, status: 429, code: 'too_many' });
    expect(await deleteComment('x', answer(404, { error: 'not_found' }))).toEqual({ ok: false, status: 404, code: 'not_found' });
  });
});

describe('the comment field', () => {
  it('cleans as the player types and sends trimmed text the Worker takes', () => {
    const raw = '  Hi​ the­\r\nford' + 'é́́́́' + '\n'.repeat(30) + 'end ‮ ';
    const field = commentField(raw);
    expect(field.startsWith('  Hi the\nford')).toBe(true);
    const sent = commentToSend(raw);
    expect(sent).toBe(sent.trim());
    expect(isPublicText(sent, { newlines: COMMENT_NEWLINES_MAX })).toBe(true);
    expect([...sent].filter((ch) => ch === '\n')).toHaveLength(20);
    expect(commentToSend(' \n \t ')).toBe('');
  });

  it('cuts at 1 000 code points (an emoji is one)', () => {
    const s = commentField('😀'.repeat(1200));
    expect([...s]).toHaveLength(1000);
    expect(commentField('a'.repeat(999))).toHaveLength(999);
  });
});

describe('the words', () => {
  it('the stars', () => {
    expect(meanText({ sum: 13, count: 3 })).toBe('4.3');
    expect(meanText({ sum: 10, count: 2 })).toBe('5.0');
    expect(meanText({ sum: 0, count: 0 })).toBeNull();
    expect(meanStars({ sum: 13, count: 3 })).toBe(4);
    expect(meanStars({ sum: 0, count: 0 })).toBe(0);
    expect(votesText(0)).toBe('No votes yet');
    expect(votesText(1)).toBe('1 vote');
    expect(votesText(1200)).toBe('1,200 votes');
    expect(starWord(4)).toBe('four');
    expect(starWord(1)).toBe('one');
  });

  it('a comment\'s age', () => {
    const now = Date.UTC(2026, 10, 15, 12);
    expect(ageText(now - 10_000, now)).toBe('just now');
    expect(ageText(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(ageText(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(ageText(now - 30 * 3_600_000, now)).toBe('yesterday');
    expect(ageText(now - 4 * 86_400_000, now)).toBe('4 days ago');
    expect(ageText(Date.UTC(2026, 8, 26, 12), now)).toBe('26 September 2026');
    expect(ageText(now + 60_000, now)).toBe('just now');
  });

  it('the refusals', () => {
    expect(voteFailText(429, 'too_many')).toBe('You have rated many logs this hour. Try again later.');
    expect(voteFailText(403, 'own')).toBe('This is your own log.');
    expect(voteFailText(0, 'offline')).toBe('Offline: the stars were not saved.');
    expect(commentFailText(409, 'full')).toBe('This log has as many comments as it can hold.');
    expect(commentFailText(400, 'bad_text')).toBe('The comment has characters that cannot be posted.');
    expect(commentFailText(403, 'suspended')).toBe('This account is suspended: it cannot comment.');
    expect(reportFailText(403, 'own', 'comment')).toBe('This is your own comment.');
    expect(reportFailText(404, 'not_found', 'comment')).toBe('This comment is no longer there.');
    expect(reportFailText(404, 'not_found')).toBe('This log is no longer there.');
  });
});

describe('where Back goes', () => {
  it('to the Community when the run was opened from it, else the start page', () => {
    expect(backTarget('?from=community')).toBe('community');
    expect(backTarget('?from=community&cloudtest')).toBe('community');
    expect(backTarget('?cloudtest')).toBe('start');
    expect(backTarget('?from=x')).toBe('start');
    expect(backTarget('')).toBe('start');
  });
});
