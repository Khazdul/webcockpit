// Hall of Fame logs in MUME's Discord #log-status (stage 72, ADR 0161).
// The 5-minute cron posts each log newly listed in the Hall of Fame to a
// Discord webhook (the secret DISCORD_WEBHOOK_URL) and deletes the post
// again once the log leaves it, by whatever path (its sender, the admin,
// reports, Delete account, the daily cron, unlisting). The posts and the
// cut-off are kept in D1 (migration 0008).
//
// Never throws into the cron, and never writes the webhook's URL or token
// anywhere (no log line carries it).
import { flags } from './flags.ts';
import type { D1, Deps, Env } from './runtime.ts';

/** At most this many posts a tick, and at most this many deletions. */
export const POSTS_PER_TICK = 5;
export const DELETES_PER_TICK = 5;
/** A log is posted only this long after it was listed or last changed: its preview PNG is uploaded by then (Discord caches the unfurl). */
export const POST_DELAY_MS = 2 * 60_000;
/** Each request to Discord gives up after this long (the next tick tries again). */
export const DISCORD_TIMEOUT_MS = 10_000;

/** The name and the avatar each post shows (set per message; the webhook's own are not used). */
export const DISCORD_USERNAME = 'MUME Cockpit';
export const AVATAR_PATH = '/apple-touch-icon.png';

/** Longest title, sender and character in a post, in code points (before escaping). */
export const MAX_TITLE = 100;
export const MAX_NAME = 40;

const WEBHOOK_HOSTS = new Set(['discord.com', 'discordapp.com']);
const WEBHOOK_PATH = /^\/api\/(?:v\d{1,2}\/)?webhooks\/(\d{1,25})\/([A-Za-z0-9_-]{1,200})$/;
const SNOWFLAKE = /^\d{1,25}$/;

/**
 * The webhook's base URL (`https://discord.com/api/webhooks/<id>/<token>`)
 * from the secret, or null when it is missing or not such a URL: https,
 * discord.com or discordapp.com, no port, user, query or fragment.
 */
export function webhookBase(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !WEBHOOK_HOSTS.has(u.hostname) || u.port !== '' || u.username !== '' || u.password !== '' || u.search !== '' || u.hash !== '') return null;
  const m = WEBHOOK_PATH.exec(u.pathname);
  if (!m) return null;
  return `https://${u.hostname}/api/webhooks/${m[1]}/${m[2]}`;
}

/** One line of public text for a post: control characters and line breaks as spaces, runs of space as one, cut to `max` code points with "…". */
export function oneLine(s: string, max: number): string {
  const flat = s.replace(/[\p{Cc}\u2028\u2029]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const cps = [...flat];
  return cps.length <= max ? flat : `${cps.slice(0, max - 1).join('').trimEnd()}…`;
}

/**
 * `s` with Discord's markdown escaped: every character that can start
 * formatting, a heading, a quote, a list, a masked link, a mention, an
 * emoji or an autolinked URL (`https\://` is not a link) gets a backslash.
 */
export function escapeMarkdown(s: string): string {
  return s.replace(/[\\*_~`|>#\-[\]()<:@!]/g, '\\$&');
}

export interface PostFacts {
  id: string;
  title: string;
  sender: string;
  character: string;
}

/** The JSON body of a post. */
export function postBody(origin: string, f: PostFacts): Record<string, unknown> {
  const title = escapeMarkdown(oneLine(f.title, MAX_TITLE)) || 'Untitled';
  const sender = escapeMarkdown(oneLine(f.sender, MAX_NAME));
  const character = escapeMarkdown(oneLine(f.character, MAX_NAME));
  const who = character ? `**${sender}** (${character})` : `**${sender}**`;
  return {
    username: DISCORD_USERNAME,
    avatar_url: `${origin}${AVATAR_PATH}`,
    content: `The log **${title}** has been posted by ${who} on MUME Cockpit:\n${origin}/r/${f.id}`,
    allowed_mentions: { parse: [] },
  };
}

/** What a tick did (for the tests). */
export interface DiscordTick {
  posted: number;
  deleted: number;
  /** True when a 429, an error of Discord's or the network stopped the tick. */
  stopped: boolean;
}

type Outcome = 'ok' | 'stop' | 'skip';

/** A 429, a 5xx, a refused webhook (401, 403, 404 on a post) or the network: stop the tick and try again at the next. */
function stopsTick(status: number): boolean {
  return status === 429 || status >= 500 || status === 401 || status === 403;
}

async function send(deps: Deps, url: string, method: 'POST' | 'DELETE', body?: unknown): Promise<Response | null> {
  try {
    return await deps.fetch(url, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

/** Deletes the posts of logs no longer listed and active (whatever the flag). */
async function deletions(deps: Deps, db: D1, base: string, out: DiscordTick): Promise<void> {
  const { results } = await db
    .prepare(
      `SELECT d.pub, d.message FROM discord_post d LEFT JOIN publication p ON p.id = d.pub
       WHERE p.id IS NULL OR p.state <> 'active' OR p.listed <> 1 ORDER BY d.posted, d.pub LIMIT ?1`,
    )
    .bind(DELETES_PER_TICK)
    .all<{ pub: string; message: string | null }>();
  for (const r of results) {
    if (r.message !== null && SNOWFLAKE.test(r.message)) {
      const res = await send(deps, `${base}/messages/${r.message}`, 'DELETE');
      if (!res || stopsTick(res.status)) {
        out.stopped = true;
        return;
      }
      // A 2xx; a 404 (the message is gone already); another 4xx (Discord
      // will not delete it, asking again would not help): the row goes.
      if (res.ok) out.deleted++;
    }
    await db.prepare('DELETE FROM discord_post WHERE pub = ?1').bind(r.pub).run();
  }
}

/** The cut-off: set now when there is none (the poster begins to run). */
async function cutoffOf(db: D1, now: number): Promise<number> {
  await db.prepare("INSERT INTO discord_state (key, value) VALUES ('cutoff', ?1) ON CONFLICT (key) DO NOTHING").bind(now).run();
  const row = await db.prepare("SELECT value FROM discord_state WHERE key = 'cutoff'").first<{ value: number }>();
  return row?.value ?? now;
}

async function postOne(deps: Deps, db: D1, base: string, origin: string, f: PostFacts, now: number): Promise<Outcome> {
  const res = await send(deps, `${base}?wait=true`, 'POST', postBody(origin, f));
  if (!res || stopsTick(res.status) || res.status === 404) return 'stop';
  let message: string | null = null;
  if (res.ok) {
    try {
      const id = ((await res.json()) as { id?: unknown }).id;
      if (typeof id === 'string' && SNOWFLAKE.test(id)) message = id;
    } catch {
      // Posted, but no id to delete it by.
    }
  }
  // A 2xx is recorded with its id; another 4xx (Discord refused this one
  // message) is recorded without, so it never blocks the logs behind it.
  await db
    .prepare('INSERT INTO discord_post (pub, message, posted) VALUES (?1, ?2, ?3) ON CONFLICT (pub) DO UPDATE SET message = excluded.message, posted = excluded.posted')
    .bind(f.id, message, now)
    .run();
  return res.ok ? 'ok' : 'skip';
}

/** Posts listed active logs listed after the cut-off (or asked for by hand), oldest first. */
async function posts(deps: Deps, db: D1, base: string, origin: string, now: number, out: DiscordTick): Promise<void> {
  const cutoff = await cutoffOf(db, now);
  const ready = now - POST_DELAY_MS;
  const { results } = await db
    .prepare(
      `SELECT p.id, p.title, a.name AS sender, p.character FROM publication p
       JOIN account a ON a.id = p.account
       LEFT JOIN discord_post d ON d.pub = p.id
       WHERE p.state = 'active' AND p.listed = 1 AND p.listed_at <= ?1 AND p.updated <= ?1
         AND ((d.pub IS NULL AND p.listed_at >= ?2) OR (d.pub IS NOT NULL AND d.posted IS NULL))
       ORDER BY p.listed_at, p.id LIMIT ?3`,
    )
    .bind(ready, cutoff, POSTS_PER_TICK)
    .all<PostFacts>();
  for (const r of results) {
    const outcome = await postOne(deps, db, base, origin, r, now);
    if (outcome === 'stop') {
      out.stopped = true;
      return;
    }
    if (outcome === 'ok') out.posted++;
  }
}

/**
 * The cron's part (every 5 minutes): nothing without a database or a
 * valid webhook secret. Deletions run whatever the flag `discord` says,
 * so a removal is honoured while posting is off; posting needs the flag
 * and SITE_ORIGIN. With the flag off the cut-off is cleared, so turning
 * it on again posts only logs listed from then on.
 */
export async function discordTick(env: Env, deps: Deps, now: number): Promise<DiscordTick> {
  const out: DiscordTick = { posted: 0, deleted: 0, stopped: false };
  const db = env.DB;
  const base = webhookBase(env.DISCORD_WEBHOOK_URL);
  if (!db || !base) return out;
  try {
    await deletions(deps, db, base, out);
    if (out.stopped) return out;
    if (!(await flags(env, now)).discord) {
      await db.prepare("DELETE FROM discord_state WHERE key = 'cutoff'").run();
      return out;
    }
    const origin = (env.SITE_ORIGIN ?? '').replace(/\/+$/, '');
    if (!/^https?:\/\/[^/]+$/.test(origin)) return out;
    await posts(deps, db, base, origin, now, out);
  } catch {
    // A missing table (the migration not yet applied) or a failing
    // database: nothing this tick.
  }
  return out;
}
