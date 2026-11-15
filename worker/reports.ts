// Reports (spec §7.7, §7.10, ADR 0148, ADR 0154; the contract is
// `ReportRequest` in shared/cloud/api.ts). Behind the flag `share`.
//
//   POST /api/u/report   {kind, target, reason, text?} → 204
//
// Reached through worker/auth.ts (the flag `accounts`, the limits, the
// CSRF rule, the session); the flag `share` is checked there. One report
// per account and item (UNIQUE in `report`), 30 a UTC day per account, not
// one's own run, not from a suspended account. When an item has unhandled
// reports from REPORTS_TO_HIDE different accounts it is hidden
// (`hidden_reason` 'reports') until the admin acts: in the same
// transaction as the report that makes the fifth. Only accounts that still
// exist and are not suspended count, and a run the admin has restored or
// whose reports were dismissed (`reviewed`) is never hidden by reports
// again: they queue it for the admin (review fix S3).
//
// Each stored report starts the owner's mail (worker/mail.ts) after the
// answer: it never fails or delays the 204.
import { PUB_ID_PATTERN, REPORT_KINDS, REPORT_KINDS_OPEN, REPORT_REASONS, REPORT_TEXT_MAX, REPORTS_PER_DAY, REPORTS_TO_HIDE, type ReportKind, type ReportReason } from '../shared/cloud/api.ts';
import { hasKeys } from './accounts.ts';
import { mailReport } from './mail.ts';
import { type PubCtx, type PubRowState, textOf } from './pub.ts';
import { dayStart, error, utcDay } from './runtime.ts';
import type { Authed } from './sessions.ts';
import { readCapped } from './stats.ts';

const MAX_REPORT_BYTES = 4096;

function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

export async function report(c: PubCtx): Promise<Response> {
  const { account } = c.auth as Authed;
  if (account.state === 'suspended') return error('suspended', 403);
  const text = await readCapped(c.request, MAX_REPORT_BYTES);
  let b: unknown = null;
  try {
    b = text === null ? null : JSON.parse(text);
  } catch {
    b = null;
  }
  if (!hasKeys(b, ['kind', 'target', 'reason'], ['text'])) return error('bad_request', 400);
  if (!oneOf<ReportKind>(REPORT_KINDS, b.kind) || !oneOf<ReportReason>(REPORT_REASONS, b.reason) || typeof b.target !== 'string') return error('bad_request', 400);
  const note = b.text === undefined ? '' : textOf(b.text, 0, REPORT_TEXT_MAX, { newlines: true });
  if (note === null) return error('bad_request', 400);
  // `comment` and `note` come with stage 65.
  if (!REPORT_KINDS_OPEN.includes(b.kind)) return error('kind_closed', 400);
  if (!PUB_ID_PATTERN.test(b.target)) return error('not_found', 404);
  const target = b.target;
  const pub = await c.db.prepare('SELECT account, state FROM publication WHERE id = ?1').bind(target).first<{ account: string; state: PubRowState }>();
  if (!pub || (pub.state !== 'active' && pub.state !== 'hidden')) return error('not_found', 404);
  if (pub.account === account.id) return error('own', 403);

  const since = dayStart(utcDay(c.now));
  const dup = async (): Promise<boolean> =>
    (await c.db.prepare('SELECT 1 AS x FROM report WHERE kind = ?1 AND target = ?2 AND account = ?3').bind(b.kind, target, account.id).first()) !== null;
  if (await dup()) return error('already_reported', 409);
  // The insert holds only while the day's count is under the limit (two at
  // once cannot both be the 30th), and the hiding is in the same transaction.
  const [inserted] = await c.db.batch([
    c.db
      .prepare(
        `INSERT OR IGNORE INTO report (kind, target, account, reason, text, created)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE (SELECT COUNT(*) FROM report WHERE account = ?3 AND created >= ?7) < ?8`,
      )
      .bind(b.kind, target, account.id, b.reason, note, c.now, since, REPORTS_PER_DAY),
    c.db
      .prepare(
        // Review fix S3: never a run the admin has looked at (`reviewed`), and
        // only reporters that still exist and are not suspended count.
        `UPDATE publication SET state = 'hidden', hidden_reason = 'reports', updated = ?2
         WHERE id = ?1 AND state = 'active' AND reviewed = 0
         AND (SELECT COUNT(DISTINCT r.account) FROM report r JOIN account a ON a.id = r.account
              WHERE r.kind = 'run' AND r.target = ?1 AND r.handled = 0 AND a.state <> 'suspended') >= ?3`,
      )
      .bind(target, c.now, REPORTS_TO_HIDE),
  ]);
  if (inserted?.meta.changes !== 1) return (await dup()) ? error('already_reported', 409) : error('too_many', 429);
  mailReport(c.env, c.deps, c.url.origin, { target, reason: b.reason, text: note });
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
