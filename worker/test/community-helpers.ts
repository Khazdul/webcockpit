// Shared by the community's tests (community.test.ts, votes.test.ts,
// comments.test.ts, runes.test.ts): the flags `share`, `gallery` and
// `runes` on, listed runs, votes, comments and notes through the router,
// and the sums recounted from the vote table.
import { expect } from 'vitest';
import type { CommentWritten, NoteWritten, VoteAnswer } from '../../shared/cloud/api.ts';
import type { Env } from '../runtime.ts';
import { db } from './helpers.ts';
import { DAY, META, NOW, type Opts, call, envOf, ok, payload, publish } from './share-helpers.ts';

export const CENV = envOf({ FLAG_GALLERY: true, FLAG_RUNES: true });
/** The community env with other bindings or vars replaced. */
export const cenvOf = (over: Partial<Record<keyof Env, unknown>>): Env => envOf({ FLAG_GALLERY: true, FLAG_RUNES: true, ...over });

/** A call with the community's flags on (unless `o.env` says otherwise). */
export const ccall = (method: string, path: string, json?: unknown, o: Opts = {}): Promise<Response> => call(method, path, json, { env: CENV, ...o });

/** Publishes a listed run (at `now`) and returns its id. */
export async function list(cookie: string, o: { now?: number; title?: string; seed?: number } = {}): Promise<string> {
  return publish(cookie, payload(100, o.seed ?? 1), { ...META, title: o.title ?? META.title, listed: true }, { env: CENV, now: o.now ?? NOW });
}

export function vote(cookie: string, id: string, stars: number, o: Opts = {}): Promise<Response> {
  return ccall('PUT', `/api/u/pub/${id}/vote`, { stars }, { cookie, ...o });
}

export async function voted(cookie: string, id: string, stars: number, o: Opts = {}): Promise<VoteAnswer> {
  return ok<VoteAnswer>(await vote(cookie, id, stars, o));
}

export function comment(cookie: string, id: string, text: string, o: Opts = {}): Promise<Response> {
  return ccall('POST', `/api/u/pub/${id}/comments`, { text }, { cookie, ...o });
}

export async function commented(cookie: string, id: string, text = 'Nice fight.', o: Opts = {}): Promise<string> {
  return (await ok<CommentWritten>(await comment(cookie, id, text, o))).comment.id;
}

export function note(cookie: string, text: string, o: Opts = {}): Promise<Response> {
  return ccall('POST', '/api/u/runes', { text }, { cookie, ...o });
}

export async function noted(cookie: string, text = 'Orcs at the ford.', o: Opts = {}): Promise<string> {
  return (await ok<NoteWritten>(await note(cookie, text, o))).note.id;
}

/** Makes an account `days` old (registration takes the test clock). */
export async function ageAccount(name: string, days: number): Promise<void> {
  await db.prepare('UPDATE account SET created = ?2 WHERE name_key = ?1').bind(name, NOW - days * DAY).run();
}

/**
 * The run's stored sums against a recount from the vote table: every vote
 * of an account that is not suspended in `vote_*`, the ranking ones in `top_*`.
 */
export async function expectSums(id: string): Promise<{ vote_sum: number; vote_count: number; top_sum: number; top_count: number }> {
  const stored = await db.prepare('SELECT vote_sum, vote_count, top_sum, top_count FROM publication WHERE id = ?1').bind(id).first<Record<string, number>>();
  const recount = await db
    .prepare(
      `SELECT COALESCE(SUM(v.stars), 0) AS vote_sum, COUNT(*) AS vote_count,
              COALESCE(SUM(v.stars * v.ranks), 0) AS top_sum, COALESCE(SUM(v.ranks), 0) AS top_count
       FROM vote v JOIN account a ON a.id = v.account WHERE v.publication = ?1 AND a.state <> 'suspended'`,
    )
    .bind(id)
    .first<Record<string, number>>();
  expect(stored, `sums of ${id}`).toEqual(recount);
  return stored as { vote_sum: number; vote_count: number; top_sum: number; top_count: number };
}

export { DAY, NOW, ok };
