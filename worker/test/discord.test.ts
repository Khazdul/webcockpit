// Hall of Fame logs in Discord's #log-status (worker/discord.ts, stage 72,
// ADR 0161), against a fake Discord: the stubbed fetch records every
// request and answers as each test says. No test reaches the network.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DELETES_PER_TICK,
  POSTS_PER_TICK,
  POST_DELAY_MS,
  discordTick,
  escapeMarkdown,
  oneLine,
  postBody,
  webhookBase,
} from '../discord.ts';
import { forgetFlags } from '../flags.ts';
import type { Deps, Env, FetchInit } from '../runtime.ts';
import { SAMPLE_CRON, runCron } from '../stats.ts';
import { list } from './community-helpers.ts';
import { T, db, emptyTables, envWith } from './helpers.ts';
import { call, signUp } from './share-helpers.ts';

const MIN = 60_000;
const T0 = T('2026-11-18T10:00:00Z');
const HOOK = 'https://discord.com/api/webhooks/1440000000000000001/tok-EN_secret123';
const ORIGIN = 'https://mumecockpit.com';
const ENV = envWith({ DISCORD_WEBHOOK_URL: HOOK, FLAG_DISCORD: true, SITE_ORIGIN: ORIGIN, FLAG_MUME: false });
const envOf = (over: Partial<Record<keyof Env, unknown>>): Env => envWith({ DISCORD_WEBHOOK_URL: HOOK, FLAG_DISCORD: true, SITE_ORIGIN: ORIGIN, FLAG_MUME: false, ...over });

interface Req {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

/** A fake Discord: `answer` decides each response (default: a post gets the next message id, a delete 204). */
function fakeDiscord(answer?: (r: Req, n: number) => Response | Promise<Response>) {
  const requests: Req[] = [];
  let ids = 0;
  const fetch: Deps['fetch'] = async (url: string, init?: FetchInit) => {
    const r: Req = { url, method: init?.method ?? 'GET', body: init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : null };
    requests.push(r);
    if (answer) return answer(r, requests.length);
    if (r.method === 'POST') return Response.json({ id: String(9000000000000000000n + BigInt(++ids)), type: 0 });
    return new Response(null, { status: 204 });
  };
  return { requests, fetch };
}

const depsOf = (now: number, fetch: Deps['fetch']): Deps => ({ now: () => now, fetch });

let accounts = 0;
async function account(name: string): Promise<string> {
  const id = `acc${++accounts}`;
  await db
    .prepare("INSERT INTO account (id, name, name_key, created, last_seen, salt, kdf, auth_hash, recovery_hash, wrap_pw, wrap_rc) VALUES (?1, ?2, ?3, ?4, ?4, 's', '{}', 'h', 'r', 'w', 'w')")
    .bind(id, name, name.toLowerCase(), T0 - 30 * 24 * 60 * MIN)
    .run();
  return id;
}

/** A listed active log, listed (and last changed) at `listedAt`. */
async function log(id: string, acc: string, listedAt: number, o: { title?: string; character?: string; listed?: boolean; state?: string } = {}): Promise<string> {
  await db
    .prepare(
      `INSERT INTO publication (id, account, title, character, listed, listed_at, state, created, updated)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?6, ?6)`,
    )
    .bind(id, acc, o.title ?? `Log ${id}`, o.character ?? 'Olev', o.listed === false ? 0 : 1, listedAt, o.state ?? 'active')
    .run();
  return id;
}

async function postRows(): Promise<{ pub: string; message: string | null; posted: number | null }[]> {
  return (await db.prepare('SELECT pub, message, posted FROM discord_post ORDER BY pub').all<{ pub: string; message: string | null; posted: number | null }>()).results;
}

async function cutoff(): Promise<number | null> {
  return (await db.prepare("SELECT value FROM discord_state WHERE key = 'cutoff'").first<{ value: number }>())?.value ?? null;
}

/** The first tick: sets the cut-off at T0 (no logs yet). */
async function start(): Promise<void> {
  const d = fakeDiscord();
  await discordTick(ENV, depsOf(T0, d.fetch), T0);
  expect(d.requests).toEqual([]);
  expect(await cutoff()).toBe(T0);
}

let alice: string;
beforeEach(async () => {
  await emptyTables();
  alice = await account('Alice');
});

describe('the webhook secret', () => {
  it('accepts discord.com and discordapp.com webhook URLs only', () => {
    expect(webhookBase(HOOK)).toBe(HOOK);
    expect(webhookBase('https://discordapp.com/api/webhooks/12/abc')).toBe('https://discordapp.com/api/webhooks/12/abc');
    expect(webhookBase(' https://discord.com/api/v10/webhooks/12/abc ')).toBe('https://discord.com/api/webhooks/12/abc');
    for (const bad of [
      undefined,
      '',
      'not a url',
      'http://discord.com/api/webhooks/12/abc',
      'https://evil.example/api/webhooks/12/abc',
      'https://discord.com.evil.example/api/webhooks/12/abc',
      'https://ptb.discord.com/api/webhooks/12/abc',
      'https://discord.com:444/api/webhooks/12/abc',
      'https://u:p@discord.com/api/webhooks/12/abc',
      'https://discord.com/api/webhooks/12/abc?thread_id=1',
      'https://discord.com/api/webhooks/12/abc#x',
      'https://discord.com/api/webhooks/abc/abc',
      'https://discord.com/api/webhooks/12/abc/slack',
      'https://discord.com/api/webhooks/12',
    ]) {
      expect(webhookBase(bad), String(bad)).toBeNull();
    }
  });

  it('no secret, or an invalid one: no request at all, nothing stored', async () => {
    await log('L1', alice, T0 - 10 * MIN);
    for (const env of [envOf({ DISCORD_WEBHOOK_URL: undefined }), envOf({ DISCORD_WEBHOOK_URL: 'https://evil.example/api/webhooks/1/x' })]) {
      const d = fakeDiscord();
      await discordTick(env, depsOf(T0, d.fetch), T0);
      await discordTick(env, depsOf(T0 + 10 * MIN, d.fetch), T0 + 10 * MIN);
      expect(d.requests).toEqual([]);
      expect(await cutoff()).toBeNull();
    }
  });
});

describe('the message', () => {
  it('escapes markdown, mentions and links; one line; capped', () => {
    expect(escapeMarkdown('**a** _b_ `c` ~d~ |e| > # - [x](y) <@1> :e: !')).toBe('\\*\\*a\\*\\* \\_b\\_ \\`c\\` \\~d\\~ \\|e\\| \\> \\# \\- \\[x\\]\\(y\\) \\<\\@1\\> \\:e\\: \\!');
    expect(escapeMarkdown('back\\slash')).toBe('back\\\\slash');
    expect(oneLine('a\nb\r\n\tc\u2028d   e ', 100)).toBe('a b c d e');
    expect(oneLine('x'.repeat(150), 100)).toBe(`${'x'.repeat(99)}…`);
    expect([...oneLine('é'.repeat(150), 100)]).toHaveLength(100);
  });

  it('has the name, the logo, the text, the link and no mentions', () => {
    expect(postBody(ORIGIN, { id: 'Ab3dEf6hIj9k', title: 'Orc fight', sender: 'Alice', character: 'Olev' })).toEqual({
      username: 'MUME Cockpit',
      avatar_url: 'https://mumecockpit.com/apple-touch-icon.png',
      content: 'The log **Orc fight** has been posted by **Alice** (Olev) on MUME Cockpit:\nhttps://mumecockpit.com/r/Ab3dEf6hIj9k',
      allowed_mentions: { parse: [] },
    });
    expect(postBody(ORIGIN, { id: 'x', title: 'T', sender: 'Alice', character: '' }).content).toBe('The log **T** has been posted by **Alice** on MUME Cockpit:\nhttps://mumecockpit.com/r/x');
  });

  it('a hostile title cannot ping, link, format or break lines', () => {
    const body = postBody(ORIGIN, { id: 'x', title: '@everyone **gold** at https://evil.example\n# Head', sender: 'B_b', character: '<@123>' });
    const content = body.content as string;
    expect(content.split('\n')).toHaveLength(2);
    expect(content).toContain('\\@everyone \\*\\*gold\\*\\* at https\\://evil.example \\# Head');
    expect(content).toContain('**B\\_b** (\\<\\@123\\>)');
    expect(content).not.toMatch(/(^|[^\\])@everyone/);
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });
});

describe('posting', () => {
  it('only new: logs listed before the cut-off are never posted by themselves', async () => {
    await log('OLD', alice, T0 - 60 * MIN);
    const d = fakeDiscord();
    await discordTick(ENV, depsOf(T0, d.fetch), T0);
    expect(await cutoff()).toBe(T0);
    await discordTick(ENV, depsOf(T0 + 10 * MIN, d.fetch), T0 + 10 * MIN);
    await discordTick(ENV, depsOf(T0 + 60 * MIN, d.fetch), T0 + 60 * MIN);
    expect(d.requests).toEqual([]);
    expect(await postRows()).toEqual([]);
  });

  it('posts a new listed log with ?wait=true after two minutes, and keeps the message id', async () => {
    await start();
    await log('NEW', alice, T0 + MIN, { title: 'The ford', character: 'Olev' });
    const d = fakeDiscord();
    // Under two minutes old: not yet (its preview may still be on its way).
    await discordTick(ENV, depsOf(T0 + MIN + POST_DELAY_MS - 1, d.fetch), T0 + MIN + POST_DELAY_MS - 1);
    expect(d.requests).toEqual([]);
    const t = T0 + MIN + POST_DELAY_MS;
    const res = await discordTick(ENV, depsOf(t, d.fetch), t);
    expect(res).toEqual({ posted: 1, deleted: 0, stopped: false });
    expect(d.requests).toEqual([
      {
        url: `${HOOK}?wait=true`,
        method: 'POST',
        body: {
          username: 'MUME Cockpit',
          avatar_url: `${ORIGIN}/apple-touch-icon.png`,
          content: `The log **The ford** has been posted by **Alice** (Olev) on MUME Cockpit:\n${ORIGIN}/r/NEW`,
          allowed_mentions: { parse: [] },
        },
      },
    ]);
    expect(await postRows()).toEqual([{ pub: 'NEW', message: '9000000000000000001', posted: t }]);
    // Never twice.
    await discordTick(ENV, depsOf(t + 5 * MIN, d.fetch), t + 5 * MIN);
    expect(d.requests).toHaveLength(1);
  });

  it('a log changed (or listed again) under two minutes ago waits', async () => {
    await start();
    await log('L', alice, T0 + MIN);
    await db.prepare('UPDATE publication SET updated = ?1').bind(T0 + 10 * MIN).run();
    const d = fakeDiscord();
    await discordTick(ENV, depsOf(T0 + 11 * MIN, d.fetch), T0 + 11 * MIN);
    expect(d.requests).toEqual([]);
    await discordTick(ENV, depsOf(T0 + 12 * MIN, d.fetch), T0 + 12 * MIN);
    expect(d.requests).toHaveLength(1);
  });

  it('never posts an unlisted, hidden, pending or removed log', async () => {
    await start();
    await log('U', alice, T0 + MIN, { listed: false });
    await log('H', alice, T0 + MIN, { state: 'hidden' });
    await log('P', alice, T0 + MIN, { state: 'pending' });
    await log('R', alice, T0 + MIN, { state: 'removed' });
    const d = fakeDiscord();
    await discordTick(ENV, depsOf(T0 + 10 * MIN, d.fetch), T0 + 10 * MIN);
    expect(d.requests).toEqual([]);
  });

  it(`at most ${POSTS_PER_TICK} a tick, oldest first; the rest next tick`, async () => {
    await start();
    for (let i = 0; i < 7; i++) await log(`L${i}`, alice, T0 + (7 - i) * 1000);
    const d = fakeDiscord();
    const t = T0 + 10 * MIN;
    expect((await discordTick(ENV, depsOf(t, d.fetch), t)).posted).toBe(POSTS_PER_TICK);
    expect(d.requests.map((r) => (r.body?.content as string).split('/r/')[1])).toEqual(['L6', 'L5', 'L4', 'L3', 'L2']);
    expect((await discordTick(ENV, depsOf(t + 5 * MIN, d.fetch), t + 5 * MIN)).posted).toBe(2);
    expect(d.requests.slice(5).map((r) => (r.body?.content as string).split('/r/')[1])).toEqual(['L1', 'L0']);
  });

  it('a 429 stops the tick and the log is posted at the next', async () => {
    await start();
    await log('A', alice, T0 + MIN);
    await log('B', alice, T0 + 2 * MIN);
    const limited = fakeDiscord(() => Response.json({ message: 'You are being rate limited.', retry_after: 1.5 }, { status: 429 }));
    const t = T0 + 10 * MIN;
    expect(await discordTick(ENV, depsOf(t, limited.fetch), t)).toEqual({ posted: 0, deleted: 0, stopped: true });
    expect(limited.requests).toHaveLength(1);
    expect(await postRows()).toEqual([]);
    const d = fakeDiscord();
    expect((await discordTick(ENV, depsOf(t + 5 * MIN, d.fetch), t + 5 * MIN)).posted).toBe(2);
  });

  it('a 5xx or a network failure: left for the next tick', async () => {
    await start();
    await log('A', alice, T0 + MIN);
    const t = T0 + 10 * MIN;
    const down = fakeDiscord(() => new Response('bad gateway', { status: 502 }));
    expect((await discordTick(ENV, depsOf(t, down.fetch), t)).stopped).toBe(true);
    const offline = fakeDiscord(() => {
      throw new TypeError('network');
    });
    expect((await discordTick(ENV, depsOf(t, offline.fetch), t)).stopped).toBe(true);
    expect(await postRows()).toEqual([]);
    const d = fakeDiscord();
    expect((await discordTick(ENV, depsOf(t + 5 * MIN, d.fetch), t + 5 * MIN)).posted).toBe(1);
  });

  it('a 400 for one message is recorded without an id and does not block the next', async () => {
    await start();
    await log('A', alice, T0 + MIN);
    await log('B', alice, T0 + 2 * MIN);
    const d = fakeDiscord((r, n) => (n === 1 ? Response.json({ code: 50006 }, { status: 400 }) : Response.json({ id: '77' })));
    const t = T0 + 10 * MIN;
    expect(await discordTick(ENV, depsOf(t, d.fetch), t)).toEqual({ posted: 1, deleted: 0, stopped: false });
    expect(await postRows()).toEqual([
      { pub: 'A', message: null, posted: t },
      { pub: 'B', message: '77', posted: t },
    ]);
    await discordTick(ENV, depsOf(t + 5 * MIN, d.fetch), t + 5 * MIN);
    expect(d.requests).toHaveLength(2);
  });

  it('a log asked for by hand is posted though listed before the cut-off', async () => {
    await log('OLD', alice, T0 - 24 * 60 * MIN, { title: 'First log' });
    await start();
    await db.prepare("INSERT INTO discord_post (pub) VALUES ('OLD') ON CONFLICT DO NOTHING").run();
    const d = fakeDiscord();
    const t = T0 + 5 * MIN;
    expect((await discordTick(ENV, depsOf(t, d.fetch), t)).posted).toBe(1);
    expect(d.requests[0]!.body!.content).toContain('**First log**');
    expect(await postRows()).toEqual([{ pub: 'OLD', message: '9000000000000000001', posted: t }]);
  });

  it('a log asked for by hand that is not listed is not posted, and its row goes', async () => {
    await start();
    await log('U', alice, T0 - MIN, { listed: false });
    await db.prepare("INSERT INTO discord_post (pub) VALUES ('U')").run();
    const d = fakeDiscord();
    await discordTick(ENV, depsOf(T0 + 5 * MIN, d.fetch), T0 + 5 * MIN);
    expect(d.requests).toEqual([]);
    expect(await postRows()).toEqual([]);
  });

  it('never writes the webhook to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
    try {
      await start();
      await log('A', alice, T0 + MIN);
      const failing = fakeDiscord(() => {
        throw new TypeError(`fetch to ${HOOK} failed`);
      });
      await discordTick(ENV, depsOf(T0 + 10 * MIN, failing.fetch), T0 + 10 * MIN);
      for (const s of spies) for (const args of s.mock.calls) expect(JSON.stringify(args)).not.toContain('secret123');
    } finally {
      for (const s of spies) s.mockRestore();
    }
  });
});

describe('deleting', () => {
  async function posted(): Promise<{ t: number }> {
    await start();
    await log('A', alice, T0 + MIN);
    await log('B', alice, T0 + 2 * MIN);
    const t = T0 + 10 * MIN;
    expect((await discordTick(ENV, depsOf(t, fakeDiscord().fetch), t)).posted).toBe(2);
    return { t: t + 5 * MIN };
  }

  for (const [how, sql] of [
    ['unlisted', "UPDATE publication SET listed = 0 WHERE id = 'A'"],
    ['hidden (reports or the admin)', "UPDATE publication SET state = 'hidden', hidden_reason = 'reports' WHERE id = 'A'"],
    ['removed (the sender, the admin, Delete account)', "UPDATE publication SET state = 'removed', listed = 0 WHERE id = 'A'"],
    ['its row gone', "DELETE FROM publication WHERE id = 'A'"],
  ] as const) {
    it(`deletes the post of a log ${how}, and drops the row`, async () => {
      const { t } = await posted();
      await db.prepare(sql).run();
      const d = fakeDiscord();
      expect(await discordTick(ENV, depsOf(t, d.fetch), t)).toEqual({ posted: 0, deleted: 1, stopped: false });
      expect(d.requests).toEqual([{ url: `${HOOK}/messages/9000000000000000001`, method: 'DELETE', body: null }]);
      expect((await postRows()).map((r) => r.pub)).toEqual(['B']);
    });
  }

  it('the sender removing a listed log through the API takes its post away', async () => {
    const cookie = await signUp('bob');
    const now = T('2026-11-15T12:00:00Z');
    await discordTick(ENV, depsOf(now - MIN, fakeDiscord().fetch), now - MIN);
    const id = await list(cookie, { now });
    const d = fakeDiscord();
    expect((await discordTick(ENV, depsOf(now + 5 * MIN, d.fetch), now + 5 * MIN)).posted).toBe(1);
    expect(d.requests[0]!.body!.content).toContain('by **bob** (Olev)');
    expect((await call('DELETE', `/api/u/pub/${id}`, undefined, { cookie, now: now + 6 * MIN })).status).toBe(204);
    expect((await discordTick(ENV, depsOf(now + 10 * MIN, d.fetch), now + 10 * MIN)).deleted).toBe(1);
    expect(d.requests[1]).toEqual({ url: `${HOOK}/messages/9000000000000000001`, method: 'DELETE', body: null });
    expect(await postRows()).toEqual([]);
  });

  it('a 404 (deleted by hand in Discord) drops the row too', async () => {
    const { t } = await posted();
    await db.prepare("UPDATE publication SET listed = 0 WHERE id = 'A'").run();
    const d = fakeDiscord(() => Response.json({ message: 'Unknown Message', code: 10008 }, { status: 404 }));
    expect(await discordTick(ENV, depsOf(t, d.fetch), t)).toEqual({ posted: 0, deleted: 0, stopped: false });
    expect((await postRows()).map((r) => r.pub)).toEqual(['B']);
  });

  it('a 429 or a 5xx on a delete stops the tick and keeps the row', async () => {
    const { t } = await posted();
    await db.prepare("UPDATE publication SET listed = 0 WHERE id IN ('A', 'B')").run();
    for (const status of [429, 503]) {
      const d = fakeDiscord(() => new Response(null, { status }));
      expect(await discordTick(ENV, depsOf(t, d.fetch), t)).toEqual({ posted: 0, deleted: 0, stopped: true });
      expect(d.requests).toHaveLength(1);
      expect(await postRows()).toHaveLength(2);
    }
    const d = fakeDiscord();
    expect((await discordTick(ENV, depsOf(t + 5 * MIN, d.fetch), t + 5 * MIN)).deleted).toBe(2);
  });

  it(`at most ${DELETES_PER_TICK} deletions a tick`, async () => {
    for (let i = 0; i < 7; i++) await db.prepare("INSERT INTO discord_post (pub, message, posted) VALUES (?1, ?2, ?3)").bind(`G${i}`, String(100 + i), T0).run();
    const d = fakeDiscord();
    expect((await discordTick(ENV, depsOf(T0, d.fetch), T0)).deleted).toBe(DELETES_PER_TICK);
    expect((await discordTick(ENV, depsOf(T0 + 5 * MIN, d.fetch), T0 + 5 * MIN)).deleted).toBe(2);
    expect(await postRows()).toEqual([]);
  });
});

describe('the flag discord', () => {
  it('off: nothing is posted, removals still take posts away, and the cut-off is cleared', async () => {
    await start();
    await log('A', alice, T0 + MIN);
    await discordTick(ENV, depsOf(T0 + 10 * MIN, fakeDiscord().fetch), T0 + 10 * MIN);
    await db.prepare("UPDATE publication SET listed = 0 WHERE id = 'A'").run();
    await log('B', alice, T0 + 11 * MIN);
    const off = envOf({ FLAG_DISCORD: false });
    const d = fakeDiscord();
    expect(await discordTick(off, depsOf(T0 + 20 * MIN, d.fetch), T0 + 20 * MIN)).toEqual({ posted: 0, deleted: 1, stopped: false });
    expect(d.requests.map((r) => r.method)).toEqual(['DELETE']);
    expect(await cutoff()).toBeNull();
    // On again: a new cut-off, so B (listed while it was off) is not posted; a later log is.
    const t = T0 + 30 * MIN;
    await discordTick(ENV, depsOf(t, d.fetch), t);
    expect(await cutoff()).toBe(t);
    await log('C', alice, t + MIN);
    await discordTick(ENV, depsOf(t + 10 * MIN, d.fetch), t + 10 * MIN);
    expect(d.requests.slice(1).map((r) => (r.body?.content as string).split('/r/')[1])).toEqual(['C']);
  });

  it('turned off from /admin (a flag row) stops posting', async () => {
    await start();
    await log('A', alice, T0 + MIN);
    await db.prepare("INSERT INTO flag (name, value) VALUES ('discord', 0)").run();
    forgetFlags(db);
    const d = fakeDiscord();
    await discordTick(ENV, depsOf(T0 + 10 * MIN, d.fetch), T0 + 10 * MIN);
    expect(d.requests).toEqual([]);
  });

  it('off by default (no FLAG_DISCORD): no cut-off, nothing posted', async () => {
    await log('A', alice, T0 + MIN);
    const d = fakeDiscord();
    await discordTick(envOf({ FLAG_DISCORD: undefined }), depsOf(T0 + 10 * MIN, d.fetch), T0 + 10 * MIN);
    expect(d.requests).toEqual([]);
    expect(await cutoff()).toBeNull();
  });
});

describe('the cron', () => {
  afterEach(() => forgetFlags(db));

  it('the 5-minute cron runs the poster; the daily one does not', async () => {
    const d = fakeDiscord();
    await runCron(ENV, SAMPLE_CRON, T0, depsOf(T0, d.fetch));
    expect(await cutoff()).toBe(T0);
    await log('A', alice, T0 + MIN);
    await runCron(ENV, '10 0 * * *', T0 + 10 * MIN, depsOf(T0 + 10 * MIN, d.fetch));
    expect(d.requests).toEqual([]);
    await runCron(ENV, SAMPLE_CRON, T0 + 10 * MIN, depsOf(T0 + 10 * MIN, d.fetch));
    expect(d.requests.map((r) => r.url)).toEqual([`${HOOK}?wait=true`]);
  });

  it('a missing table never throws out of the cron', async () => {
    await db.prepare('ALTER TABLE discord_post RENAME TO discord_post_away').run();
    try {
      const d = fakeDiscord();
      await expect(runCron(ENV, SAMPLE_CRON, T0, depsOf(T0, d.fetch))).resolves.toBeUndefined();
      expect(d.requests).toEqual([]);
    } finally {
      await db.prepare('ALTER TABLE discord_post_away RENAME TO discord_post').run();
    }
  });
});
