// The admin's part of the directory of shared looks (stage 80 part E, spec
// §7.14, ADR 0173). Reached from worker/router.ts only after the Access
// check; writes need `X-WC: 1` and the site's own Origin (moderation.ts
// `guarded`).
//
//   GET    /api/admin/look/<name>   the row (AdminLookRow), 404 without one
//   DELETE /api/admin/look/<name>   {note?}: removes the row, logged as `look.remove`
//
// The count of rows is in `GET /api/admin/stats` (`looks`). Removal is the
// only remedy when a stranger holds a name its player never reported: the
// owner rule refuses the player's own reports for 30 days.
import { type AdminLookRow, LOOK_NAME_PATTERN } from '../shared/cloud/api.ts';
import { sealedBatch } from './auditlog.ts';
import { bodyOf, guarded, noteOf } from './moderation.ts';
import { type D1, type Deps, type Env, error, json } from './runtime.ts';

const PREFIX = '/api/admin/look/';

type AdminHandler = (request: Request, env: Env, url: URL, deps: Deps, who: string) => Promise<Response>;

function nameOf(url: URL): string | null {
  let raw: string;
  try {
    raw = decodeURIComponent(url.pathname.slice(PREFIX.length));
  } catch {
    return null;
  }
  return LOOK_NAME_PATTERN.test(raw) ? raw.toLowerCase() : null;
}

async function get(_request: Request, _env: Env, db: D1, url: URL): Promise<Response> {
  const name = nameOf(url);
  if (!name) return error('not_found', 404);
  const row = await db.prepare('SELECT name, race, subrace, sex, token, updated FROM look_dir WHERE name = ?1').bind(name).first<AdminLookRow>();
  return row ? json(row satisfies AdminLookRow) : error('not_found', 404);
}

async function remove(request: Request, env: Env, db: D1, url: URL, now: number, who: string): Promise<Response> {
  const name = nameOf(url);
  if (!name) return error('not_found', 404);
  const b = await bodyOf(request, [], ['note']);
  const note = b ? noteOf(b.note) : null;
  if (!b || note === null) return error('bad_request', 400);
  // The entry only when there is a row to remove (the guard), in the same transaction.
  const results = await sealedBatch(env, db, { ts: now, who, action: 'look.remove', target: name, note }, (entry) => [entry, db.prepare('DELETE FROM look_dir WHERE name = ?1').bind(name)], {
    where: 'EXISTS (SELECT 1 FROM look_dir WHERE name = ?8)',
    binds: [name],
  });
  if ((results[1]?.meta.changes ?? 0) === 0) return error('not_found', 404);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

/** The route of an admin look path, or undefined. */
export function lookAdminRoute(path: string): Record<string, AdminHandler> | undefined {
  if (!path.startsWith(PREFIX) || !/^[^/]+$/.test(path.slice(PREFIX.length))) return undefined;
  return { GET: guarded(get), DELETE: guarded(remove) };
}

/** Rows in the directory (the admin page's count). */
export async function lookCount(db: D1): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM look_dir').first<{ n: number }>();
  return r?.n ?? 0;
}
