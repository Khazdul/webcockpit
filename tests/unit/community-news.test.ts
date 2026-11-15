// Stage 65 C3 (ADR 0155, "The counter and the reactions mark"): the
// community's news module (src/cloud/community/news.ts) against a fake
// fetch: the answer read against the contract, one request at a time,
// the last answer kept on a failure, nothing asked while it may not be,
// `seen` posted with X-WC and the counts it covers cleared at once, and
// the cadence (now, every 5 minutes, when the tab is visible again, not
// while a game is the view).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NEWS_MAX } from '../../shared/cloud/api';
import { COUNT_CAP } from '../../src/chrome/frames/start-menu-model';
import {
  NEWS_CAP,
  NEWS_EVERY_MS,
  communityNews,
  markCommunitySeen,
  onCommunityNews,
  parseCommunityNews,
  refreshCommunityNews,
  setNewsDepsForTest,
  watchCommunityNews,
} from '../../src/cloud/community/news';
import { resetPlayingForTests, setPlaying } from '../../src/core/playing';

type Call = { url: string; init: RequestInit };

function fake(answers: (() => { ok: boolean; body?: unknown } | 'throw')[], enabled = true) {
  const calls: Call[] = [];
  let i = 0;
  setNewsDepsForTest({
    enabled: async () => enabled,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const a = answers[Math.min(i++, answers.length - 1)]!();
      if (a === 'throw') throw new Error('offline');
      return { ok: a.ok, json: async () => a.body };
    },
  });
  return calls;
}

const NEWS = { runs: 3, reactions: 2, newestRun: 1000, newestReaction: 2000 };

beforeEach(() => resetPlayingForTests());
afterEach(() => {
  setNewsDepsForTest({});
  vi.useRealTimers();
});

describe('the answer', () => {
  it('is read against the contract; counts capped at NEWS_MAX', () => {
    expect(NEWS_CAP).toBe(NEWS_MAX);
    expect(COUNT_CAP).toBe(NEWS_MAX);
    expect(parseCommunityNews(NEWS)).toEqual(NEWS);
    expect(parseCommunityNews({ ...NEWS, newestRun: null, newestReaction: null })).toMatchObject({ newestRun: null });
    expect(parseCommunityNews({ ...NEWS, reactions: 400 })!.reactions).toBe(99);
    for (const bad of [null, [], { ...NEWS, runs: -1 }, { ...NEWS, reactions: 1.5 }, { ...NEWS, newestRun: 'x' }, { runs: 1 }]) expect(parseCommunityNews(bad)).toBeNull();
  });
});

describe('refreshCommunityNews', () => {
  it('GET /api/u/community/news, same-origin, no-store; the listeners hear it', async () => {
    const calls = fake([() => ({ ok: true, body: NEWS })]);
    const heard: unknown[] = [];
    onCommunityNews((n) => heard.push(n));
    expect(await refreshCommunityNews()).toEqual(NEWS);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/api/u/community/news');
    expect(calls[0]!.init).toMatchObject({ credentials: 'same-origin', cache: 'no-store' });
    expect(calls[0]!.init.method).toBeUndefined();
    expect(communityNews()).toEqual(NEWS);
    expect(heard).toEqual([NEWS]);
  });

  it('one request at a time: a second call while one is out shares it', async () => {
    const calls = fake([() => ({ ok: true, body: NEWS })]);
    const [a, b] = await Promise.all([refreshCommunityNews(), refreshCommunityNews()]);
    expect(a).toEqual(NEWS);
    expect(b).toEqual(NEWS);
    expect(calls).toHaveLength(1);
  });

  it('a failure keeps the last answer; nothing is asked while it may not be', async () => {
    fake([() => ({ ok: true, body: NEWS }), () => ({ ok: false }), () => 'throw', () => ({ ok: true, body: { nonsense: 1 } })]);
    await refreshCommunityNews();
    expect(await refreshCommunityNews()).toEqual(NEWS);
    expect(await refreshCommunityNews()).toEqual(NEWS);
    expect(await refreshCommunityNews()).toEqual(NEWS);
    const calls = fake([() => ({ ok: true, body: NEWS })], false);
    expect(await refreshCommunityNews()).toBeNull();
    expect(calls).toHaveLength(0);
  });
});

describe('markCommunitySeen', () => {
  it('POSTs the times with X-WC; the counts it covers clear at once', async () => {
    const calls = fake([() => ({ ok: true, body: NEWS }), () => ({ ok: true, body: { gallery: 0, reactions: 2000 } })]);
    await refreshCommunityNews();
    const heard: unknown[] = [];
    onCommunityNews((n) => heard.push(n));
    expect(await markCommunitySeen({ reactions: 2000 })).toBe(true);
    expect(communityNews()).toEqual({ ...NEWS, reactions: 0 });
    expect(heard).toEqual([{ ...NEWS, reactions: 0 }]);
    const post = calls[1]!;
    expect(post.url).toBe('/api/u/community/seen');
    expect(post.init.method).toBe('POST');
    expect(post.init.headers).toMatchObject({ 'X-WC': '1', 'Content-Type': 'application/json' });
    expect(JSON.parse(post.init.body as string)).toEqual({ reactions: 2000 });
  });

  it('an older time leaves the count; nothing to send sends nothing', async () => {
    const calls = fake([() => ({ ok: true, body: NEWS }), () => ({ ok: true, body: {} })]);
    await refreshCommunityNews();
    await markCommunitySeen({ reactions: 1500 });
    expect(communityNews()!.reactions).toBe(2);
    expect(await markCommunitySeen({})).toBe(false);
    expect(await markCommunitySeen({ reactions: -1 })).toBe(false);
    expect(calls).toHaveLength(2);
  });
});

describe('the cadence', () => {
  it('asks at once, every 5 minutes, not while a game is the view, and again when the start page is back; one timer for two watchers', async () => {
    vi.useFakeTimers();
    const calls = fake([() => ({ ok: true, body: NEWS })]);
    const stopA = watchCommunityNews();
    const stopB = watchCommunityNews();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(NEWS_EVERY_MS);
    expect(calls).toHaveLength(2);
    setPlaying(true);
    await vi.advanceTimersByTimeAsync(NEWS_EVERY_MS);
    expect(calls).toHaveLength(2);
    setPlaying(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(3);
    stopA();
    await vi.advanceTimersByTimeAsync(NEWS_EVERY_MS);
    expect(calls).toHaveLength(4);
    stopB();
    stopB();
    await vi.advanceTimersByTimeAsync(NEWS_EVERY_MS * 3);
    expect(calls).toHaveLength(4);
  });
});
