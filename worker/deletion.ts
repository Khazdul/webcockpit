// Deleting an account (spec §7.2, ADR 0145, ADR 0153, ADR 0154): the
// player's own (`DELETE /api/u/account`, worker/auth.ts) and the admin's
// (`POST /api/admin/account/<name>` {action: 'delete'}, worker/moderation.ts)
// share these statements.
//
// Everything the account owns goes in one transaction, and its name is
// reserved in the same one, so it is never free in between. Every
// statement holds only while the account's `auth_hash` is still `hash`
// (the player proved the password; the admin read the row): the account
// row goes last, so the guard sees it until then.
import type { AccountRow } from './accounts.ts';
import { deletionStatements } from './community.ts';
import { TOMBSTONE_SET, dropObjects, tombstones } from './pub.ts';
import { emptyPrefix, prefixOf } from './runs.ts';
import type { D1, D1Result, D1Statement, Env } from './runtime.ts';
import { ended } from './sessions.ts';

const STILL = 'EXISTS (SELECT 1 FROM account WHERE id = ?1 AND auth_hash = ?2)';

/**
 * The batch that deletes the account `row`. `extra` statements (bound by
 * the caller) go before the account row's delete. The first statement
 * reads the account's live publications (their payloads go after the
 * transaction); `deletedBy` reads the results.
 */
export function deletionBatch(db: D1, row: Pick<AccountRow, 'id' | 'name_key'>, hash: string, now: number, extra: D1Statement[] = []): D1Statement[] {
  const pubWhere = `account = ?2 AND EXISTS (SELECT 1 FROM account WHERE id = ?2 AND auth_hash = ?3)`;
  return [
    // The live runs only: a pending one's object may still be on its way to
    // R2, so its tombstone keeps its bytes for the upload or the cron
    // (review fix CR7).
    db.prepare(`SELECT id FROM publication WHERE account = ?1 AND state IN ('active', 'hidden') AND ${STILL}`).bind(row.id, hash),
    db.prepare(`INSERT OR IGNORE INTO reserved_name (name_key) SELECT ?3 WHERE ${STILL}`).bind(row.id, hash, row.name_key),
    ...ended(db, `account = ?1 AND ${STILL}`, [row.id, hash], 'deleted', now),
    db.prepare(`DELETE FROM item WHERE account = ?1 AND ${STILL}`).bind(row.id, hash),
    // Stage 63: the run bodies' rows, and the R2 prefix noted for the
    // daily sweep (R2 is not in the transaction; the objects go after it).
    db.prepare(`DELETE FROM run_body WHERE account = ?1 AND ${STILL}`).bind(row.id, hash),
    db.prepare(`INSERT OR REPLACE INTO r2_sweep (prefix, at) SELECT ?3, ?4 WHERE ${STILL}`).bind(row.id, hash, prefixOf(row.id), now),
    // Stage 64: the published runs become tombstones (their links answer
    // 410), their reports handled; a pending one (an upload in flight)
    // too, which makes that upload fail and delete its object. The
    // objects go after the transaction (`afterDeletion`), and the daily
    // cron deletes what R2 failed on (a tombstone keeps its bytes until then).
    ...tombstones(db, now, pubWhere, [row.id, hash]),
    db.prepare(`UPDATE publication SET ${TOMBSTONE_SET}, updated = ?3 WHERE account = ?1 AND state = 'pending' AND ${STILL}`).bind(row.id, hash, now),
    // The account's own reports (review fix S4): the open ones go, the
    // handled ones stay for the record without their text or the account.
    db.prepare(`DELETE FROM report WHERE account = ?1 AND handled = 0 AND ${STILL}`).bind(row.id, hash),
    db.prepare(`UPDATE report SET text = '', account = NULL WHERE account = ?1 AND ${STILL}`).bind(row.id, hash),
    // Stage 65: the votes the account cast (out of both sums unless it is
    // suspended), its comments (the counts adjusted) and notes, and the
    // reports on them handled.
    ...deletionStatements(db, STILL, row.id, hash, now),
    ...extra,
    db.prepare('DELETE FROM account WHERE id = ?1 AND auth_hash = ?2').bind(row.id, hash),
  ];
}

/** Whether the batch deleted the account, and the ids of the publications whose payloads are to go. */
export function deletedBy(results: D1Result<unknown>[]): { deleted: boolean; pubs: string[] } {
  const pubs = ((results[0]?.results ?? []) as { id: string }[]).map((r) => r.id);
  return { deleted: results.at(-1)?.meta.changes === 1, pubs };
}

/**
 * After the transaction: the account's R2 objects, a list page of 1000 at
 * a time, and its publications' payloads. A failure half-way (or an upload
 * that raced this) leaves objects that belong to no account; the r2_sweep
 * row and the tombstones' bytes make the daily cron delete them again.
 */
export async function afterDeletion(env: Env, accountId: string, pubs: string[]): Promise<void> {
  if (env.FILES) await emptyPrefix(env.FILES, prefixOf(accountId)).catch(() => {});
  await dropObjects(env, pubs);
}
