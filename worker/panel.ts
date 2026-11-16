// The admin panel's API (stage 66, spec §7.9, ADR 0157; the contract is
// "The admin panel" in shared/cloud/api.ts). Reached from worker/router.ts
// only after the Access check (access.ts); writes need `X-WC: 1` and the
// site's own `Origin` (moderation.ts `guarded`).
//
//   GET  /api/admin/accounts                 the account list, 50 a page
//   GET  /api/admin/account/<name>           one account in full (its POST is moderation.ts')
//   PUT  /api/admin/account/<name>/limits    {limits, note?}: the account's own limits
//   GET  /api/admin/limits                   the built-in and the default limits
//   PUT  /api/admin/limits                   {defaults, note?}: the defaults for everyone (pick 4b)
//   GET  /api/admin/graphs?range=            the graph views' series (worker/stats.ts)
//   GET  /api/admin/log?before=&kind=&q=     the audit log with the chain's check (worker/auditlog.ts)
//   GET  /api/admin/log?chain=0&limit=       the newest entries without it (the Reports view's card)
//
// Every write is logged in its own transaction through `sealedBatch`.
import {
  ADMIN_ACCOUNTS_PAGE,
  ADMIN_ACCOUNT_SORTS,
  ADMIN_GRAPH_RANGES,
  ADMIN_LOG_KINDS,
  ADMIN_LOG_LIMIT_MAX,
  type AccountLimits,
  type AdminAccountDetail,
  type AdminAccountRow,
  type AdminAccounts,
  type AdminAccountSort,
  type AdminGraphRange,
  type AdminLimits,
  type AdminLogKind,
} from '../shared/cloud/api.ts';
import { type AccountRow, limitsOf, nameOf, ownLimitsOf } from './accounts.ts';
import { LOG_COLUMNS, type LogRecord, logPage, recentPage, rowOf, sealedBatch } from './auditlog.ts';
import { builtInLimits, changeNote, currentDefaults, differing, forgetLimitDefaults, limitsInput, loadLimitDefaults } from './limits.ts';
import { bodyOf, guarded, noteOf } from './moderation.ts';
import { type D1, type Deps, type Env, error, json, oneOf } from './runtime.ts';
import { adminGraphs } from './stats.ts';

const ACCOUNT_PREFIX = '/api/admin/account/';
/** The longest `q` of the account list and of the log. */
export const QUERY_MAX = { accounts: 20, log: 64 };
/** Log entries on one account's page. */
export const ACCOUNT_LOG_ENTRIES = 20;

type AdminHandler = (request: Request, env: Env, url: URL, deps: Deps, who: string) => Promise<Response>;

export function isPanelPath(path: string): boolean {
  return panelRoute(path) !== undefined;
}

/** The route of a panel path: method → handler, or undefined. `/api/admin/account/<name>` has only its GET here (router.ts merges moderation's POST). */
export function panelRoute(path: string): Record<string, AdminHandler> | undefined {
  if (path === '/api/admin/accounts') return { GET: guarded(accounts) };
  if (path === '/api/admin/limits') return { GET: guarded(defaultsGet), PUT: guarded(defaultsPut) };
  if (path === '/api/admin/graphs') return { GET: guarded(graphs) };
  if (path === '/api/admin/log') return { GET: guarded(log) };
  if (path.startsWith(ACCOUNT_PREFIX)) {
    const rest = path.slice(ACCOUNT_PREFIX.length);
    if (/^[^/]+$/.test(rest)) return { GET: guarded(accountGet) };
    if (/^[^/]+\/limits$/.test(rest)) return { PUT: guarded(limitsPut) };
  }
  return undefined;
}

// --- The account list ---

const SORT_SQL: Record<AdminAccountSort, string> = {
  name: 'a.name_key',
  created: 'a.created',
  seen: 'a.last_seen',
  items: 'a.item_count',
  bytes: '(a.item_bytes + a.run_bytes + a.pub_bytes)',
  runs: 'runs',
  pubs: 'a.pub_count',
  state: 'a.state',
};

/** A row's columns: `?1` is now (live sessions). Run bodies and sessions counted by a subquery on their key's prefix. */
const ROW_SQL = `SELECT a.id, a.name, a.created, a.last_seen, a.state, a.item_count, a.item_bytes, a.run_bytes, a.pub_count, a.pub_bytes,
  a.limits IS NOT NULL AS own,
  (SELECT COUNT(*) FROM run_body r WHERE r.account = a.id) AS runs,
  (SELECT COUNT(*) FROM session s WHERE s.account = a.id AND s.expires > ?1) AS sessions
  FROM account a`;

interface ListRow {
  id: string;
  name: string;
  created: number;
  last_seen: number;
  state: string;
  item_count: number;
  item_bytes: number;
  run_bytes: number;
  pub_count: number;
  pub_bytes: number;
  own: number;
  runs: number;
  sessions: number;
}

function accountRowOf(r: ListRow): AdminAccountRow {
  return {
    name: r.name,
    created: r.created,
    lastSeen: r.last_seen,
    state: r.state === 'suspended' ? 'suspended' : 'active',
    items: r.item_count,
    itemBytes: r.item_bytes,
    runs: r.runs,
    runBytes: r.run_bytes,
    pubs: r.pub_count,
    pubBytes: r.pub_bytes,
    bytes: r.item_bytes + r.run_bytes + r.pub_bytes,
    sessions: r.sessions,
    ownLimits: r.own !== 0,
  };
}

const likeEscaped = (q: string): string => q.replace(/[\\%_]/g, (c) => `\\${c}`);

async function accounts(_request: Request, _env: Env, db: D1, url: URL, now: number): Promise<Response> {
  const p = url.searchParams;
  const q = (p.get('q') ?? '').trim().toLowerCase();
  const state = oneOf(['all', 'active', 'suspended'] as const, p.get('state'), 'all');
  const sort = oneOf(ADMIN_ACCOUNT_SORTS, p.get('sort'), 'seen');
  const dir = oneOf(['asc', 'desc'] as const, p.get('dir'), 'desc');
  const pageText = p.get('page') ?? '1';
  const page = /^[1-9]\d{0,5}$/.test(pageText) ? Number(pageText) : null;
  if (q.length > QUERY_MAX.accounts || !state || !sort || !dir || page === null) return error('bad_request', 400);
  const where = `WHERE (?2 = '' OR a.name_key LIKE ?3 ESCAPE '\\') AND (?4 = 'all' OR a.state = ?4)`;
  const binds = [now, q, `%${likeEscaped(q)}%`, state];
  const [rows, matching, totals] = await db.batch<Record<string, unknown>>([
    db
      .prepare(`${ROW_SQL} ${where} ORDER BY ${SORT_SQL[sort]} ${dir === 'asc' ? 'ASC' : 'DESC'}, a.name_key ASC LIMIT ?5 OFFSET ?6`)
      .bind(...binds, ADMIN_ACCOUNTS_PAGE, (page - 1) * ADMIN_ACCOUNTS_PAGE),
    db.prepare(`SELECT COUNT(*) AS n FROM account a ${where}`).bind(...binds),
    db.prepare('SELECT COUNT(*) AS accounts, COALESCE(SUM(item_bytes + run_bytes + pub_bytes), 0) AS bytes FROM account'),
  ]);
  const t = totals?.results[0] ?? {};
  return json({
    total: Number(matching?.results[0]?.n ?? 0),
    page,
    pageSize: ADMIN_ACCOUNTS_PAGE,
    accounts: ((rows?.results ?? []) as unknown as ListRow[]).map(accountRowOf),
    totals: { accounts: Number(t.accounts ?? 0), bytes: Number(t.bytes ?? 0) },
  } satisfies AdminAccounts);
}

// --- One account ---

/** The account a path names (`/api/admin/account/<name>[/…]`), or null (404). */
async function accountOfPath(db: D1, url: URL): Promise<AccountRow | null> {
  let raw: string;
  try {
    raw = decodeURIComponent(url.pathname.slice(ACCOUNT_PREFIX.length).split('/')[0] ?? '');
  } catch {
    return null;
  }
  const name = nameOf(raw);
  if (!name) return null;
  return db.prepare('SELECT id, name, name_key, limits FROM account WHERE name_key = ?1').bind(name.key).first<AccountRow>();
}

/** The limits as the admin sees them, the router having loaded the defaults. */
function adminLimits(env: Env, row?: Pick<AccountRow, 'limits'>): AdminLimits {
  const out: AdminLimits = { builtIn: builtInLimits(env), defaults: currentDefaults(env) };
  if (row) {
    out.own = ownLimitsOf(row);
    out.effective = limitsOf(row, env);
  }
  return out;
}

async function accountGet(_request: Request, env: Env, db: D1, url: URL, now: number): Promise<Response> {
  const found = await accountOfPath(db, url);
  if (!found) return error('not_found', 404);
  const id = found.id;
  const mine = `(r.kind = 'run' AND r.target IN (SELECT id FROM publication WHERE account = ?1))
     OR (r.kind = 'comment' AND r.target IN (SELECT id FROM comment WHERE account = ?1))
     OR (r.kind = 'note' AND r.target IN (SELECT id FROM note WHERE account = ?1))`;
  const [row, sessions, community, log] = await db.batch<Record<string, unknown>>([
    db.prepare(`${ROW_SQL} WHERE a.id = ?2`).bind(now, id),
    db.prepare('SELECT COUNT(*) AS n, COALESCE(MAX(last_used), 0) AS last FROM session WHERE account = ?1 AND expires > ?2').bind(id, now),
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM publication WHERE account = ?1 AND state = 'active' AND listed = 1) AS listed,
                (SELECT COUNT(*) FROM vote WHERE account = ?1) AS votes,
                (SELECT COUNT(*) FROM comment WHERE account = ?1 AND state IN ('active', 'hidden')) AS comments,
                (SELECT COUNT(*) FROM note WHERE account = ?1 AND state IN ('active', 'hidden')) AS notes,
                (SELECT COUNT(*) FROM report WHERE account = ?1) AS made,
                (SELECT COUNT(*) FROM report r WHERE r.handled = 0 AND (${mine})) AS open`,
      )
      .bind(id),
    // Its entries (review fix S6): an account action by its name (any case,
    // as names are), or an action on one of its runs, comments or notes by
    // the thing's id (exact case). A name may equal another one's public
    // id, so a name never matches a thing's entry.
    db
      .prepare(
        `SELECT ${LOG_COLUMNS} FROM admin_log WHERE
            (action LIKE 'account.%' AND target = ?2 COLLATE NOCASE)
         OR (action LIKE 'pub.%' AND target IN (SELECT id FROM publication WHERE account = ?1))
         OR (action LIKE 'comment.%' AND target IN (SELECT id FROM comment WHERE account = ?1))
         OR (action LIKE 'note.%' AND target IN (SELECT id FROM note WHERE account = ?1))
         ORDER BY id DESC LIMIT ?3`,
      )
      .bind(id, found.name_key, ACCOUNT_LOG_ENTRIES),
  ]);
  const r = row?.results[0] as unknown as ListRow | undefined;
  if (!r) return error('not_found', 404);
  const s = sessions?.results[0] ?? {};
  const c = community?.results[0] ?? {};
  const n = (v: unknown): number => Number(v ?? 0);
  const limits = adminLimits(env, found) as AdminAccountDetail['limits'];
  return json({
    account: accountRowOf(r),
    limits,
    sessions: { count: n(s.n), lastUsed: n(s.last) },
    community: { listed: n(c.listed), votes: n(c.votes), comments: n(c.comments), notes: n(c.notes), reportsMade: n(c.made), reportsOpen: n(c.open) },
    log: ((log?.results ?? []) as unknown as LogRecord[]).map(rowOf),
  } satisfies AdminAccountDetail);
}

/** The admin's note after the changes. */
const noteWith = (changes: string, note: string): string => (note ? `${changes} — ${note}` : changes);

async function limitsPut(request: Request, env: Env, db: D1, url: URL, now: number, who: string): Promise<Response> {
  const b = await bodyOf(request, ['limits'], ['note']);
  const note = b ? noteOf(b.note) : null;
  const builtIn = builtInLimits(env);
  const input = b && b.limits !== null ? limitsInput(b.limits, builtIn) : {};
  if (!b || note === null || input === null) return error('bad_request', 400);
  const row = await accountOfPath(db, url);
  if (!row) return error('not_found', 404);
  // The defaults as they are now (not up to 30 s old): a field equal to them is not stored.
  forgetLimitDefaults(db);
  await loadLimitDefaults(env, now);
  const defaults = currentDefaults(env);
  const own = differing(input, defaults);
  const stored = Object.keys(own).length ? JSON.stringify(own) : null;
  const before = limitsOf(row, env);
  const after: AccountLimits = { ...defaults, ...own };
  await sealedBatch(env, db, { ts: now, who, action: 'account.limits', target: row.name, note: noteWith(changeNote(before, after), note) }, (entry) => [
    db.prepare('UPDATE account SET limits = ?2 WHERE id = ?1').bind(row.id, stored),
    entry,
  ]);
  return json(adminLimits(env, { limits: stored }));
}

// --- The defaults (pick 4b) ---

async function defaultsGet(_request: Request, env: Env, db: D1, _url: URL, now: number): Promise<Response> {
  forgetLimitDefaults(db);
  await loadLimitDefaults(env, now);
  return json(adminLimits(env));
}

async function defaultsPut(request: Request, env: Env, db: D1, _url: URL, now: number, who: string): Promise<Response> {
  const b = await bodyOf(request, ['defaults'], ['note']);
  const note = b ? noteOf(b.note) : null;
  const builtIn = builtInLimits(env);
  const input = b && b.defaults !== null ? limitsInput(b.defaults, builtIn) : {};
  if (!b || note === null || input === null) return error('bad_request', 400);
  forgetLimitDefaults(db);
  await loadLimitDefaults(env, now);
  const before = currentDefaults(env);
  const overrides = differing(input, builtIn);
  const after: AccountLimits = { ...builtIn, ...overrides };
  await sealedBatch(env, db, { ts: now, who, action: 'limits.default', target: 'defaults', note: noteWith(changeNote(before, after), note) }, (entry) => [
    db.prepare('DELETE FROM limit_default'),
    ...Object.entries(overrides).map(([k, v]) => db.prepare('INSERT INTO limit_default (name, value) VALUES (?1, ?2)').bind(k, v)),
    entry,
  ]);
  forgetLimitDefaults(db);
  await loadLimitDefaults(env, now);
  return json(adminLimits(env));
}

// --- Graphs and the log ---

async function graphs(_request: Request, _env: Env, db: D1, url: URL, now: number): Promise<Response> {
  const range = oneOf(ADMIN_GRAPH_RANGES, url.searchParams.get('range'), '30d' as AdminGraphRange);
  if (!range) return error('bad_request', 400);
  return json(await adminGraphs(db, range, now));
}

async function log(_request: Request, env: Env, db: D1, url: URL): Promise<Response> {
  const p = url.searchParams;
  const beforeText = p.get('before');
  const before = beforeText === null || beforeText === '' ? null : /^[1-9]\d{0,15}$/.test(beforeText) ? Number(beforeText) : NaN;
  const kind = oneOf(ADMIN_LOG_KINDS, p.get('kind'), '' as AdminLogKind);
  const q = (p.get('q') ?? '').trim();
  const chain = oneOf(['1', '0'] as const, p.get('chain'), '1');
  const limitText = p.get('limit');
  const limit = limitText === null ? ADMIN_LOG_LIMIT_MAX : /^[1-9]\d{0,2}$/.test(limitText) && Number(limitText) <= ADMIN_LOG_LIMIT_MAX ? Number(limitText) : NaN;
  if (Number.isNaN(before) || kind === null || q.length > QUERY_MAX.log || chain === null || Number.isNaN(limit)) return error('bad_request', 400);
  // Without the check (review fix S4): only `limit` rows read; the filters and `limit` belong to one kind of read each.
  if (chain === '0') return kind || q ? error('bad_request', 400) : json(await recentPage(db, { before, limit }));
  if (limitText !== null) return error('bad_request', 400);
  return json(await logPage(env, db, { before, kind: kind || null, q }));
}
