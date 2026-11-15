// The admin's moderation API (spec §7.9, ADR 0148, ADR 0154 "Admin"; the
// contract is the admin's side of "Share links" in shared/cloud/api.ts).
// Reached from worker/router.ts only after the Access check (access.ts);
// writes need `X-WC: 1` and the site's own `Origin`, as the flag switch.
// Not behind the flag `share`: the admin can still clean up with it off.
//
//   GET  /api/admin/reports              open reports by item, the published runs' and the community's totals
//   POST /api/admin/pub/<id>             {action: hide|restore|dismiss|delete, note?} → 204
//   POST /api/admin/account/<name>       {action: suspend|restore|delete, confirm?, note?} → 204
//   GET  /api/admin/log                  the newest 100 entries of admin_log
//   GET  /api/admin/pub/<id>             PubMeta, also of a hidden run
//   GET  /api/admin/pub/<id>/payload     its payload, also of a hidden run
//   POST /api/admin/comment/<id>         {action: hide|restore|dismiss|delete, note?} → 204 (stage 65)
//   POST /api/admin/note/<id>            the same for a note on Random Runes (stage 65)
//
// Every action writes `admin_log(ts, who, action, target, note)` in the
// same transaction; `who` is an HMAC of the Access e-mail (under
// AUTH_PEPPER), never the address. An action on a run marks its reports
// handled; deleting an account marks the reports on its runs handled.
import {
  ADMIN_ACCOUNT_ACTIONS,
  ADMIN_ITEM_ACTIONS,
  COMMUNITY_ID_PATTERN,
  ADMIN_PUB_ACTIONS,
  type AdminLogEntry,
  type AdminReportItem,
  type AdminReports,
  PUB_ID_PATTERN,
  type PubState,
  REPORT_TEXT_MAX,
  type ReportKind,
  type ReportReason,
} from '../shared/cloud/api.ts';
import { accountByKey, hasKeys, nameOf } from './accounts.ts';
import { sameSite } from './auth.ts';
import { hmac, sha256, toB64url, utf8 } from './bytes.ts';
import { stateChange } from './community.ts';
import { afterDeletion, deletedBy, deletionBatch } from './deletion.ts';
import { dropObjects, keyOf, payloadResponse, pubMeta, pubWithSender, textOf, tombstones } from './pub.ts';
import { type D1, type D1Statement, type Deps, type Env, dayStart, error, json, utcDay } from './runtime.ts';
import { readCapped } from './stats.ts';

const MAX_ACTION_BYTES = 4096;
/** Items the report queue lists at most. */
const QUEUE_MAX = 200;
export const LOG_ENTRIES = 100;

const PUB_PREFIX = '/api/admin/pub/';
const ACCOUNT_PREFIX = '/api/admin/account/';
const ITEM_PREFIXES = { comment: '/api/admin/comment/', note: '/api/admin/note/' } as const;

const done = (): Response => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** What the log keeps of the admin: a hash of the e-mail. */
export async function whoOf(env: Env, email: string): Promise<string> {
  const pepper = env.AUTH_PEPPER ?? '';
  const mac = pepper.length >= 16 ? await hmac(utf8(pepper), `wc-admin|${email}`) : await sha256(utf8(`wc-admin|${email}`));
  return toB64url(mac).slice(0, 22);
}

async function bodyOf(request: Request, required: string[], optional: string[]): Promise<Record<string, unknown> | null> {
  const text = await readCapped(request, MAX_ACTION_BYTES);
  let b: unknown = null;
  try {
    b = text === null ? null : JSON.parse(text);
  } catch {
    b = null;
  }
  return hasKeys(b, required, optional) ? b : null;
}

/** An action's note: text of at most REPORT_TEXT_MAX characters, '' when absent; null when it is not one. */
function noteOf(v: unknown): string | null {
  return v === undefined ? '' : textOf(v, 0, REPORT_TEXT_MAX, { newlines: true });
}

export function isModerationPath(path: string): boolean {
  return (
    path === '/api/admin/reports' ||
    path === '/api/admin/log' ||
    path.startsWith(PUB_PREFIX) ||
    path.startsWith(ACCOUNT_PREFIX) ||
    path.startsWith(ITEM_PREFIXES.comment) ||
    path.startsWith(ITEM_PREFIXES.note)
  );
}

type AdminHandler = (request: Request, env: Env, url: URL, deps: Deps, who: string) => Promise<Response>;

/** The route of a moderation path: method → handler, or undefined (404). */
export function moderationRoute(path: string): Record<string, AdminHandler> | undefined {
  if (path === '/api/admin/reports') return { GET: guarded(reports) };
  if (path === '/api/admin/log') return { GET: guarded(log) };
  if (path.startsWith(PUB_PREFIX)) {
    const rest = path.slice(PUB_PREFIX.length);
    if (/^[^/]+$/.test(rest)) return { GET: guarded(pubGet), POST: guarded(pubAction) };
    if (/^[^/]+\/payload$/.test(rest)) return { GET: guarded(pubPayload) };
    return undefined;
  }
  if (path.startsWith(ACCOUNT_PREFIX) && /^[^/]+$/.test(path.slice(ACCOUNT_PREFIX.length))) return { POST: guarded(accountAction) };
  for (const kind of ['comment', 'note'] as const) {
    const prefix = ITEM_PREFIXES[kind];
    if (path.startsWith(prefix) && /^[^/]+$/.test(path.slice(prefix.length))) return { POST: guarded((...a) => itemAction(kind, ...a)) };
  }
  return undefined;
}

/** The database, the CSRF rule on writes, and a failing database as 503. */
function guarded(h: (request: Request, env: Env, db: D1, url: URL, now: number, who: string) => Promise<Response>): AdminHandler {
  return async (request, env, url, deps, who) => {
    if (request.method !== 'GET' && request.method !== 'HEAD' && !sameSite(request, url)) return error('forbidden', 403);
    const db = env.DB;
    if (!db) return error('unavailable', 503);
    try {
      return await h(request, env, db, url, deps.now(), who);
    } catch {
      return error('unavailable', 503);
    }
  };
}

// --- GET /api/admin/reports ---

async function reports(_request: Request, _env: Env, db: D1, _url: URL, now: number): Promise<Response> {
  const [items, comments, notes, reasons, texts, totals, noteCount] = await db.batch<Record<string, unknown>>([
    db
      .prepare(
        `SELECT r.kind, r.target, COUNT(DISTINCT r.account) AS reporters, MAX(r.created) AS newest,
                p.title, p.state, p.hidden_reason, COALESCE(a.name, '') AS sender
         FROM report r JOIN publication p ON r.kind = 'run' AND p.id = r.target
         LEFT JOIN account a ON a.id = p.account
         WHERE r.handled = 0 AND p.state IN ('active', 'hidden')
         GROUP BY r.kind, r.target ORDER BY reporters DESC, newest DESC LIMIT ?1`,
      )
      .bind(QUEUE_MAX),
    // Stage 65: comments (with their run) and notes, with the reported text.
    db
      .prepare(
        `SELECT r.kind, r.target, COUNT(DISTINCT r.account) AS reporters, MAX(r.created) AS newest,
                COALESCE(p.title, '') AS title, c.state, c.hidden_reason, COALESCE(a.name, '') AS sender, c.text AS content, c.publication AS pub
         FROM report r JOIN comment c ON r.kind = 'comment' AND c.id = r.target
         LEFT JOIN publication p ON p.id = c.publication LEFT JOIN account a ON a.id = c.account
         WHERE r.handled = 0 AND c.state IN ('active', 'hidden')
         GROUP BY r.kind, r.target ORDER BY reporters DESC, newest DESC LIMIT ?1`,
      )
      .bind(QUEUE_MAX),
    db
      .prepare(
        `SELECT r.kind, r.target, COUNT(DISTINCT r.account) AS reporters, MAX(r.created) AS newest,
                '' AS title, n.state, n.hidden_reason, COALESCE(a.name, '') AS sender, n.text AS content
         FROM report r JOIN note n ON r.kind = 'note' AND n.id = r.target LEFT JOIN account a ON a.id = n.account
         WHERE r.handled = 0 AND n.state IN ('active', 'hidden')
         GROUP BY r.kind, r.target ORDER BY reporters DESC, newest DESC LIMIT ?1`,
      )
      .bind(QUEUE_MAX),
    db.prepare('SELECT kind, target, reason, COUNT(*) AS n FROM report WHERE handled = 0 GROUP BY kind, target, reason'),
    // The newest text of each item's open reports.
    db.prepare(
      `SELECT kind, target, text FROM report r WHERE handled = 0 AND text <> ''
       AND created = (SELECT MAX(created) FROM report q WHERE q.handled = 0 AND q.text <> '' AND q.kind = r.kind AND q.target = r.target)`,
    ),
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN state IN ('active', 'hidden') THEN 1 ELSE 0 END), 0) AS count,
                COALESCE(SUM(CASE WHEN state IN ('active', 'hidden') THEN bytes ELSE 0 END), 0) AS bytes,
                COALESCE(SUM(CASE WHEN state <> 'pending' AND created >= ?1 THEN 1 ELSE 0 END), 0) AS today,
                COALESCE(SUM(CASE WHEN state = 'active' AND listed = 1 THEN 1 ELSE 0 END), 0) AS listed,
                COALESCE(SUM(CASE WHEN state IN ('active', 'hidden') THEN comment_count ELSE 0 END), 0) AS comments,
                COALESCE(SUM(CASE WHEN state IN ('active', 'hidden') THEN vote_count ELSE 0 END), 0) AS votes
         FROM publication`,
      )
      .bind(dayStart(utcDay(now))),
    // Stage 65 C4: the active notes (the index note_state; notes live 30 days).
    db.prepare(`SELECT COUNT(*) AS n FROM note WHERE state = 'active'`),
  ]);
  const key = (r: Record<string, unknown>): string => `${String(r.kind)}|${String(r.target)}`;
  const byItem = new Map<string, Partial<Record<ReportReason, number>>>();
  for (const r of reasons?.results ?? []) {
    const m = byItem.get(key(r)) ?? {};
    m[r.reason as ReportReason] = r.n as number;
    byItem.set(key(r), m);
  }
  const textOfItem = new Map<string, string>();
  for (const r of texts?.results ?? []) textOfItem.set(key(r), r.text as string);
  const all = [...(items?.results ?? []), ...(comments?.results ?? []), ...(notes?.results ?? [])]
    .sort((x, y) => Number(y.reporters) - Number(x.reporters) || Number(y.newest) - Number(x.newest))
    .slice(0, QUEUE_MAX);
  const out: AdminReportItem[] = all.map((r) => {
    const item: AdminReportItem = {
      kind: r.kind as ReportKind,
      target: r.target as string,
      title: r.title as string,
      sender: r.sender as string,
      state: r.state as PubState,
      reasons: byItem.get(key(r)) ?? {},
      reporters: r.reporters as number,
      newest: r.newest as number,
    };
    const text = textOfItem.get(key(r));
    if (text) item.text = text;
    if (typeof r.content === 'string') item.content = r.content;
    if (typeof r.pub === 'string') item.pub = r.pub;
    if (r.state === 'hidden' && (r.hidden_reason === 'reports' || r.hidden_reason === 'admin')) item.hiddenReason = r.hidden_reason;
    return item;
  });
  const t = totals?.results[0] ?? {};
  return json({
    items: out,
    pubs: { count: Number(t.count ?? 0), bytes: Number(t.bytes ?? 0), today: Number(t.today ?? 0) },
    community: { listed: Number(t.listed ?? 0), comments: Number(t.comments ?? 0), notes: Number(noteCount?.results[0]?.n ?? 0), votes: Number(t.votes ?? 0) },
  } satisfies AdminReports);
}

// --- GET /api/admin/log ---

async function log(_request: Request, _env: Env, db: D1): Promise<Response> {
  const { results } = await db.prepare('SELECT ts, action, target, note FROM admin_log ORDER BY ts DESC, id DESC LIMIT ?1').bind(LOG_ENTRIES).all<AdminLogEntry>();
  return json({ entries: results } satisfies { entries: AdminLogEntry[] });
}

const logEntry = (db: D1, now: number, who: string, action: string, target: string, note: string) =>
  db.prepare('INSERT INTO admin_log (ts, who, action, target, note) VALUES (?1, ?2, ?3, ?4, ?5)').bind(now, who, action, target, note);

// --- /api/admin/pub/<id> ---

function pubIdOf(url: URL): string | null {
  const id = url.pathname.slice(PUB_PREFIX.length).split('/')[0] ?? '';
  return PUB_ID_PATTERN.test(id) ? id : null;
}

/** A run the admin may look at (active or hidden), or the answer. */
async function adminRow(db: D1, url: URL) {
  const id = pubIdOf(url);
  const row = id ? await pubWithSender(db, id) : null;
  if (!row || row.state === 'pending') return error('not_found', 404);
  if (row.state === 'removed') return error('gone', 410);
  return row;
}

async function pubGet(_request: Request, _env: Env, db: D1, url: URL): Promise<Response> {
  const row = await adminRow(db, url);
  return row instanceof Response ? row : json(pubMeta(row, row.sender ?? '', true));
}

async function pubPayload(_request: Request, env: Env, db: D1, url: URL): Promise<Response> {
  const row = await adminRow(db, url);
  if (row instanceof Response) return row;
  const bucket = env.FILES;
  if (!bucket) return error('unavailable', 503);
  const obj = await bucket.get(keyOf(row.id));
  return obj ? payloadResponse(obj, 'none') : error('unavailable', 503);
}

async function pubAction(request: Request, env: Env, db: D1, url: URL, now: number, who: string): Promise<Response> {
  const b = await bodyOf(request, ['action'], ['note']);
  const note = b ? noteOf(b.note) : null;
  if (!b || note === null || !(ADMIN_PUB_ACTIONS as readonly unknown[]).includes(b.action)) return error('bad_request', 400);
  const action = b.action as (typeof ADMIN_PUB_ACTIONS)[number];
  const row = await adminRow(db, url);
  if (row instanceof Response) return row;
  const id = row.id;
  const entry = logEntry(db, now, who, `pub.${action}`, id, note);
  if (action === 'delete') {
    // (`tombstones` marks the run's reports handled.)
    await db.batch([...tombstones(db, now, 'id = ?2', [id]), entry]);
    await dropObjects(env, [id]);
    return done();
  }
  const handled = db.prepare(`UPDATE report SET handled = ?2 WHERE handled = 0 AND kind = 'run' AND target = ?1`).bind(id, now);
  // Restore and Dismiss mark the run reviewed (review fix S3): later reports
  // queue it for the admin but never hide it by themselves. Dismiss leaves
  // the state as it is: a hidden run stays hidden (CR6).
  const change =
    action === 'hide'
      ? db.prepare(`UPDATE publication SET state = 'hidden', hidden_reason = 'admin', updated = ?2 WHERE id = ?1 AND state IN ('active', 'hidden')`).bind(id, now)
      : action === 'restore'
        ? db.prepare(`UPDATE publication SET state = 'active', hidden_reason = NULL, reviewed = 1, updated = ?2 WHERE id = ?1 AND state IN ('active', 'hidden')`).bind(id, now)
        : db.prepare(`UPDATE publication SET reviewed = 1 WHERE id = ?1 AND state IN ('active', 'hidden')`).bind(id);
  await db.batch([change, handled, entry]);
  return done();
}

// --- POST /api/admin/account/<name> ---

async function accountAction(request: Request, env: Env, db: D1, url: URL, now: number, who: string): Promise<Response> {
  let raw: string;
  try {
    raw = decodeURIComponent(url.pathname.slice(ACCOUNT_PREFIX.length));
  } catch {
    // A broken escape (`%E0%A4%A`) names no account (review fix CR5; was a 503).
    return error('not_found', 404);
  }
  const name = nameOf(raw);
  if (!name) return error('not_found', 404);
  const b = await bodyOf(request, ['action'], ['confirm', 'note']);
  const note = b ? noteOf(b.note) : null;
  if (!b || note === null || !(ADMIN_ACCOUNT_ACTIONS as readonly unknown[]).includes(b.action)) return error('bad_request', 400);
  if (b.confirm !== undefined && typeof b.confirm !== 'string') return error('bad_request', 400);
  const action = b.action as (typeof ADMIN_ACCOUNT_ACTIONS)[number];
  const row = await accountByKey(db, name.key);
  if (!row) return error('not_found', 404);
  if (action === 'delete') {
    // The name typed (in any case) is the confirmation.
    if (typeof b.confirm !== 'string' || b.confirm.toLowerCase() !== row.name_key) return error('confirm_required', 400);
    // The log entry holds only while the account does (the batch's guard).
    const guardedEntry = db
      .prepare('INSERT INTO admin_log (ts, who, action, target, note) SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM account WHERE id = ?6 AND auth_hash = ?7)')
      .bind(now, who, 'account.delete', row.name, note, row.id, row.auth_hash);
    const results = await db.batch(deletionBatch(db, row, row.auth_hash, now, [guardedEntry]));
    const { deleted, pubs } = deletedBy(results);
    // The password changed between the read and the batch: nothing was done.
    if (!deleted) return error('conflict', 409);
    await afterDeletion(env, row.id, pubs);
    return done();
  }
  const state = action === 'suspend' ? 'suspended' : 'active';
  // Stage 65: the account's votes leave both sums with Suspend and come back with Restore (only on a change).
  await db.batch([...stateChange(db, row.id, state), logEntry(db, now, who, `account.${action}`, row.name, note)]);
  return done();
}

// --- /api/admin/comment/<id>, /api/admin/note/<id> (stage 65) ---

async function itemAction(kind: 'comment' | 'note', request: Request, _env: Env, db: D1, url: URL, now: number, who: string): Promise<Response> {
  const b = await bodyOf(request, ['action'], ['note']);
  const note = b ? noteOf(b.note) : null;
  if (!b || note === null || !(ADMIN_ITEM_ACTIONS as readonly unknown[]).includes(b.action)) return error('bad_request', 400);
  const action = b.action as (typeof ADMIN_ITEM_ACTIONS)[number];
  const id = url.pathname.slice(ITEM_PREFIXES[kind].length);
  if (!COMMUNITY_ID_PATTERN.test(id)) return error('not_found', 404);
  const row = await db.prepare(`SELECT state FROM ${kind} WHERE id = ?1`).bind(id).first<{ state: string }>();
  if (!row || (row.state !== 'active' && row.state !== 'hidden')) return error('not_found', 404);
  const live = "state IN ('active', 'hidden')";
  const statements: D1Statement[] = [];
  // A comment's run counts its visible comments: the count moves with the state.
  const count = (sign: '+' | '-', from: string): void => {
    if (kind === 'comment') {
      statements.push(db.prepare(`UPDATE publication SET comment_count = comment_count ${sign} 1 WHERE id = (SELECT publication FROM comment WHERE id = ?1 AND state = '${from}')`).bind(id));
    }
  };
  if (action === 'delete') {
    count('-', 'active');
    statements.push(db.prepare(`DELETE FROM ${kind} WHERE id = ?1 AND ${live}`).bind(id));
  } else if (action === 'hide') {
    count('-', 'active');
    statements.push(db.prepare(`UPDATE ${kind} SET state = 'hidden', hidden_reason = 'admin' WHERE id = ?1 AND ${live}`).bind(id));
  } else if (action === 'restore') {
    count('+', 'hidden');
    statements.push(db.prepare(`UPDATE ${kind} SET state = 'active', hidden_reason = NULL, reviewed = 1 WHERE id = ?1 AND ${live}`).bind(id));
  } else {
    statements.push(db.prepare(`UPDATE ${kind} SET reviewed = 1 WHERE id = ?1 AND ${live}`).bind(id));
  }
  statements.push(db.prepare(`UPDATE report SET handled = ?2 WHERE handled = 0 AND kind = ?3 AND target = ?1`).bind(id, now, kind));
  statements.push(logEntry(db, now, who, `${kind}.${action}`, id, note));
  await db.batch(statements);
  return done();
}
