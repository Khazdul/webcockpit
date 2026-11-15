// The owner's mail on reports (ADR 0154, "As built ... mail on reports";
// notes/research/cloudflare-email.md). One mail per report to the owner,
// through the `send_email` binding REPORT_MAIL, to the secret
// REPORT_MAIL_TO (a verified destination address of Email Routing: the
// address is never in the repository), from REPORT_MAIL_FROM (an address
// on mumecockpit.com, where Email Routing is on).
//
// At most MAIL_PER_HOUR single mails a clock hour per Worker (its own D1):
// the counters are rows of the table `attempt` (no migration):
//   mail|sent          start: the hour, count: the mails claimed in it
//   mail|over|<hour>   start: the hour, count: reports past the cap in it
// A `mail|over|` row of an hour that has ended is claimed (deleted) by the
// first report or 5-minute cron after it, which sends one collected mail
// "N more reports". A mail that fails is logged and lost: the report is
// stored first and its answer never waits for the mail (Deps.waitUntil).
//
// The message is a hand-built RFC 5322 text: every header value has CR,
// LF and the other control characters replaced, the subject is RFC 2047
// encoded when it is not plain ASCII, and what users wrote (the title,
// the names, the report's text) is only in the subject (encoded) and in
// the base64 UTF-8 text/plain body. Stage 65 (ADR 0155): a reported
// comment or note has a mail of its own kind, with its text in full in the
// body (never in a header); the subject carries a comment's run title or a
// note's writer's name (encoded).
//
// Review fix S5: the body starts with the links (Admin, the run), before
// anything a user wrote, and every line of user-written text (a title, the
// reported text, the reporter's text) is quoted with "> ", so a text that
// imitates the mail's own lines cannot pass for them.
import { REPORTS_TO_HIDE, type ReportKind } from '../shared/cloud/api.ts';
import { randomBytes } from './bytes.ts';
import { type D1, type Deps, type Env, later, truthy } from './runtime.ts';

export const MAIL_PER_HOUR = 20;
export const HOUR_MS = 3_600_000;
export const DEFAULT_MAIL_FROM = 'reports@mumecockpit.com';

const SENT_KEY = 'mail|sent';
const OVER_PREFIX = 'mail|over|';

// --- The message ---

/** A header value on one line: CR, LF, the other control characters and the Unicode line breaks become spaces. */
export function headerSafe(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, ' ').trim();
}

const ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

/** A plain address (`a@b.c`) and nothing more, or null. */
export function addressOf(s: string | undefined): string | null {
  const a = (s ?? '').trim();
  return ADDRESS.test(a) ? a : null;
}

const encoder = new TextEncoder();

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * RFC 2047: a header text as itself when it is printable ASCII without
 * `=?`, else as `=?UTF-8?B?...?=` words of at most 39 bytes each (never
 * splitting a character), folded onto continuation lines.
 */
export function encodeWords(text: string): string {
  const s = headerSafe(text);
  if (/^[\x20-\x7e]*$/.test(s) && !s.includes('=?')) return s;
  const words: string[] = [];
  let chunk: number[] = [];
  for (const ch of s) {
    const b = encoder.encode(ch);
    if (chunk.length + b.length > 39) {
      words.push(`=?UTF-8?B?${base64(Uint8Array.from(chunk))}?=`);
      chunk = [];
    }
    chunk.push(...b);
  }
  if (chunk.length) words.push(`=?UTF-8?B?${base64(Uint8Array.from(chunk))}?=`);
  return words.join('\r\n ');
}

/** RFC 5322's date: `Sun, 15 Nov 2026 12:00:00 +0000`. */
export function mailDate(ms: number): string {
  return new Date(ms).toUTCString().replace(/GMT$/, '+0000');
}

export interface Mail {
  from: string;
  to: string;
  subject: string;
  text: string;
  now: number;
}

/** The raw message: headers, then the text as base64 UTF-8 in lines of 76. */
export function composeMail(m: Mail): string {
  const from = headerSafe(m.from);
  const domain = from.slice(from.lastIndexOf('@') + 1);
  const id = [...randomBytes(16)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const body = base64(encoder.encode(m.text.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n')));
  const lines = body.match(/.{1,76}/g) ?? [];
  return [
    `From: WebCockpit <${from}>`,
    `To: <${headerSafe(m.to)}>`,
    `Subject: ${encodeWords(m.subject)}`,
    `Date: ${mailDate(m.now)}`,
    `Message-ID: <${id}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated',
    '',
    ...lines,
    '',
  ].join('\r\n');
}

// --- Sending ---

interface Sender {
  db: D1;
  send(subject: string, text: string, now: number): Promise<void>;
  tag: string;
  origin: string;
}

/** The sender when everything is there, else null after one log line. */
function senderOf(env: Env, deps: Deps, origin: string): Sender | null {
  const to = addressOf(env.REPORT_MAIL_TO);
  const from = addressOf(env.REPORT_MAIL_FROM ?? DEFAULT_MAIL_FROM);
  const binding = env.REPORT_MAIL;
  const make = deps.emailMessage;
  if (!env.DB || !binding || !to || !from || !make) {
    console.log('report mail: skipped (REPORT_MAIL or REPORT_MAIL_TO not configured)');
    return null;
  }
  return {
    db: env.DB,
    tag: truthy(env.NOINDEX) ? '[staging] ' : '',
    origin: (env.SITE_ORIGIN ?? origin).replace(/\/+$/, ''),
    async send(subject, text, now) {
      await binding.send(make(from, to, composeMail({ from, to, subject, text, now })));
    },
  };
}

function logFailure(e: unknown): void {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : e instanceof Error ? e.message : String(e);
  console.error(`report mail: send failed (${headerSafe(code).slice(0, 200)})`);
}

const hourOf = (ms: number): number => Math.floor(ms / HOUR_MS) * HOUR_MS;
const hhmm = (ms: number): string => new Date(ms).toISOString().slice(11, 16);

/** Claims a single mail of this hour: true while under the cap; past it the hour's `over` count grows. */
async function claim(db: D1, now: number): Promise<boolean> {
  const hour = hourOf(now);
  const row = await db
    .prepare(
      `INSERT INTO attempt (key, start, count, until) VALUES (?1, ?2, 1, 0)
       ON CONFLICT (key) DO UPDATE SET count = CASE WHEN attempt.start = ?2 THEN attempt.count + 1 ELSE 1 END, start = ?2
       RETURNING count`,
    )
    .bind(SENT_KEY, hour)
    .first<{ count: number }>();
  if ((row?.count ?? 0) <= MAIL_PER_HOUR) return true;
  await db
    .prepare('INSERT INTO attempt (key, start, count, until) VALUES (?1, ?2, 1, 0) ON CONFLICT (key) DO UPDATE SET count = attempt.count + 1')
    .bind(`${OVER_PREFIX}${hour}`, hour)
    .run();
  return false;
}

/** Sends one "N more reports" mail for the hours that have ended with reports past the cap (claimed atomically). */
async function flush(s: Sender, now: number): Promise<void> {
  const { results } = await s.db
    .prepare(`DELETE FROM attempt WHERE key LIKE '${OVER_PREFIX}%' AND start < ?1 RETURNING start, count`)
    .bind(hourOf(now))
    .all<{ start: number; count: number }>();
  const n = results.reduce((sum, r) => sum + r.count, 0);
  if (n === 0) return;
  const hours = results.map((r) => `${new Date(r.start).toISOString().slice(0, 10)} ${hhmm(r.start)}–${hhmm(r.start + HOUR_MS)} UTC: ${r.count}`).sort();
  const text = [
    `${n} more ${n === 1 ? 'report' : 'reports'} came in after the ${MAIL_PER_HOUR} mails of the hour, with no mail of their own.`,
    '',
    ...hours,
    '',
    `Admin: ${s.origin}/admin`,
    '',
  ].join('\n');
  try {
    await s.send(`${s.tag}WebCockpit: ${n} more ${n === 1 ? 'report' : 'reports'}`, text, now);
  } catch (e) {
    logFailure(e);
  }
}

export interface ReportFacts {
  /** Stage 65: what was reported (a run when absent). */
  kind?: ReportKind;
  target: string;
  reason: string;
  text: string;
}

interface RunFacts {
  title: string;
  state: string;
  hidden_reason: string | null;
  sender: string | null;
  accounts: number;
  open: number;
}

/** User-written text quoted line by line ("> "; review fix S5); `none` when it is empty. */
export function quoted(text: string, none = '(none)'): string[] {
  return text === '' ? [none] : text.split(/\r\n|\r|\n|\u0085|\u2028|\u2029/).map((l) => `> ${l}`);
}

/** The text of a report's mail. */
export function reportText(r: ReportFacts, run: RunFacts, origin: string): string {
  const hidden = run.state === 'hidden' ? `yes (${run.hidden_reason === 'reports' ? 'by reports' : 'by the admin'})` : 'no';
  return [
    'A run was reported.',
    '',
    `Admin:    ${origin}/admin`,
    `Run:      ${origin}/r/${r.target}?admin`,
    '',
    `Id:       ${r.target}`,
    `Sender:   ${run.sender ?? '(account deleted)'}`,
    `Reason:   ${r.reason}`,
    `Reported: by ${run.accounts} ${run.accounts === 1 ? 'account' : 'accounts'} in all; ${run.open} open (${REPORTS_TO_HIDE} open hide a run)`,
    `Hidden:   ${hidden}`,
    '',
    "The run's title:",
    ...quoted(run.title),
    '',
    "The reporter's text:",
    ...quoted(r.text),
    '',
  ].join('\n');
}

/** What a comment's or a note's mail says of it (stage 65). */
interface ItemFacts {
  text: string;
  state: string;
  hidden_reason: string | null;
  writer: string | null;
  /** A comment's run. */
  pub: string | null;
  title: string | null;
  accounts: number;
  open: number;
}

/** The text of a comment's or a note's report mail: the kind, the reported text in full, its writer, a comment's run, the links. */
export function itemReportText(r: ReportFacts, kind: 'comment' | 'note', item: ItemFacts, origin: string): string {
  const hidden = item.state === 'hidden' ? `yes (${item.hidden_reason === 'reports' ? 'by reports' : 'by the admin'})` : 'no';
  return [
    kind === 'comment' ? 'A comment was reported.' : 'A note on Random Runes was reported.',
    '',
    `Admin:    ${origin}/admin`,
    ...(kind === 'comment' && item.pub ? [`Run:      ${origin}/r/${item.pub}?admin`] : []),
    '',
    `Kind:     ${kind}`,
    `Id:       ${r.target}`,
    `Writer:   ${item.writer ?? '(account deleted)'}`,
    ...(kind === 'comment' ? [`Run id:   ${item.pub ?? ''}`] : []),
    `Reason:   ${r.reason}`,
    `Reported: by ${item.accounts} ${item.accounts === 1 ? 'account' : 'accounts'} in all; ${item.open} open (${REPORTS_TO_HIDE} open hide it)`,
    `Hidden:   ${hidden}`,
    '',
    ...(kind === 'comment' ? ["The run's title:", ...quoted(item.title ?? ''), ''] : []),
    `The reported ${kind}:`,
    ...quoted(item.text, '(removed)'),
    '',
    "The reporter's text:",
    ...quoted(r.text),
    '',
  ].join('\n');
}

const counts = (kind: string, id: string): string =>
  `(SELECT COUNT(DISTINCT r.account) FROM report r WHERE r.kind = '${kind}' AND r.target = ${id}) AS accounts,
   (SELECT COUNT(*) FROM report r WHERE r.kind = '${kind}' AND r.target = ${id} AND r.handled = 0) AS open`;

/** The subject and text of a comment's or a note's mail, or null when the item is gone. */
async function itemMail(db: D1, r: ReportFacts, kind: 'comment' | 'note', origin: string): Promise<{ subject: string; text: string } | null> {
  const item =
    kind === 'comment'
      ? await db
          .prepare(
            `SELECT c.text, c.state, c.hidden_reason, a.name AS writer, p.id AS pub, p.title, ${counts('comment', 'c.id')}
             FROM comment c LEFT JOIN account a ON a.id = c.account LEFT JOIN publication p ON p.id = c.publication WHERE c.id = ?1`,
          )
          .bind(r.target)
          .first<ItemFacts>()
      : await db
          .prepare(
            `SELECT n.text, n.state, n.hidden_reason, a.name AS writer, NULL AS pub, NULL AS title, ${counts('note', 'n.id')}
             FROM note n LEFT JOIN account a ON a.id = n.account WHERE n.id = ?1`,
          )
          .bind(r.target)
          .first<ItemFacts>();
  if (!item) return null;
  const subject = kind === 'comment' ? `WebCockpit report: comment on "${item.title ?? ''}"` : `WebCockpit report: note by ${item.writer ?? '(account deleted)'}`;
  return { subject, text: itemReportText(r, kind, item, origin) };
}

/** The mail of one stored report (or its share of the hour's count past the cap). Never throws. */
export async function reportMail(env: Env, deps: Deps, origin: string, r: ReportFacts): Promise<void> {
  try {
    const s = senderOf(env, deps, origin);
    if (!s) return;
    const now = deps.now();
    await flush(s, now);
    if (!(await claim(s.db, now))) return;
    if (r.kind === 'comment' || r.kind === 'note') {
      const m = await itemMail(s.db, r, r.kind, s.origin);
      if (m) await s.send(`${s.tag}${m.subject}`, m.text, now);
      return;
    }
    const run = await s.db
      .prepare(
        `SELECT p.title, p.state, p.hidden_reason, a.name AS sender,
           (SELECT COUNT(DISTINCT r.account) FROM report r WHERE r.kind = 'run' AND r.target = p.id) AS accounts,
           (SELECT COUNT(*) FROM report r WHERE r.kind = 'run' AND r.target = p.id AND r.handled = 0) AS open
         FROM publication p LEFT JOIN account a ON a.id = p.account WHERE p.id = ?1`,
      )
      .bind(r.target)
      .first<RunFacts>();
    if (!run) return;
    await s.send(`${s.tag}WebCockpit report: ${run.title}`, reportText(r, run, s.origin), now);
  } catch (e) {
    logFailure(e);
  }
}

/** Starts a report's mail after the answer (worker/reports.ts). */
export function mailReport(env: Env, deps: Deps, origin: string, r: ReportFacts): void {
  later(deps, reportMail(env, deps, origin, r));
}

/** The 5-minute cron's part: the collected mail of an hour that has ended. Never throws. */
export async function flushReportMail(env: Env, deps: Deps, now: number): Promise<void> {
  try {
    if (!env.DB || !env.REPORT_MAIL || !env.REPORT_MAIL_TO || !deps.emailMessage) return;
    const s = senderOf(env, deps, 'https://mumecockpit.com');
    if (s) await flush(s, now);
  } catch (e) {
    logFailure(e);
  }
}
