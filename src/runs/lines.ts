// The lines of a run as the runs backup writes them (ADR 0018; src/runs/
// library.ts, `backup` / `restore`), shared by the backup and by a run's
// body in the cloud (ADR 0153, src/cloud/runs/body.ts). Pure: no IndexedDB,
// no DOM, so the body's Web Worker can use it.
//
//   {"type":"run","run":{…RunMeta}}
//   {"type":"event","runId":…,"seq":…,"event":{…}}      (that run's events)
//   {"type":"chunk","runId":…,"seq":…,"firstUs":…,"lastUs":…,"text":…}
//   {"type":"export","doc":{…ExportDoc}}                (the backup only)
//
// `checkRecord` is the one check of a line both readers apply; `toRunMeta`,
// `toEvent` and `toChunk` turn a checked line into what the stores hold
// (`restore()` writes them with `putWholeRun`).

import type { RunChunk, RunMeta } from '../capture/store';
import { normalizeExportDoc } from '../share/edits';
import type { RunEvent } from './events';
import type { RunEventRecord } from './store';

export const BACKUP_TYPE = 'webcockpit-runs';
export const BACKUP_SCHEMA = 1;

/** Thrown for a line or a file that is not a readable backup (or run body). */
export class BadBackupError extends Error {
  override name = 'BadBackupError';
}

/** A whole run as the stores hold it: what `putWholeRun` writes. */
export interface RunRows {
  meta: RunMeta;
  events: RunEventRecord[];
  chunks: RunChunk[];
}

export type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

/** A line as JSON, or `BadBackupError`. */
export function parseLine(text: string, n: number): Rec {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    throw new BadBackupError(`Line ${n} is not JSON.`);
  }
  if (!isRec(o)) throw new BadBackupError(`Line ${n} is not a record.`);
  return o;
}

/** Why a run meta is not one, or null when it is (the backup's rules). */
export function runMetaProblem(m: unknown): string | null {
  if (!isRec(m)) return 'run without meta';
  if (!isStr(m.runId) || !m.runId || !isStr(m.character) || !isNum(m.startedUs)) return 'bad run meta';
  if (!(m.endedUs === null || isNum(m.endedUs)) || typeof m.sealed !== 'boolean') return 'bad run meta';
  if (!isNum(m.bytes) || !isNum(m.lines)) return 'bad run meta';
  if (m.summary !== undefined && m.summary !== null && !(isRec(m.summary) && isNum(m.summary.startUs) && isNum(m.summary.lastEventUs))) return 'bad run summary';
  return null;
}

/** Checks one record line; returns the run the following lines belong to. */
export function checkRecord(o: Rec, cur: string | null, n: number): string | null {
  const bad = (what: string): never => {
    throw new BadBackupError(`Line ${n}: ${what}.`);
  };
  switch (o.type) {
    case 'run': {
      const problem = runMetaProblem(o.run);
      if (problem) return bad(problem);
      return (o.run as RunMeta).runId;
    }
    case 'event':
      if (o.runId !== cur || cur === null) return bad('event outside its run');
      if (!isNum(o.seq) || !isRec(o.event) || !isStr(o.event.type) || !isNum(o.event.us)) return bad('bad event');
      return cur;
    case 'chunk':
      if (o.runId !== cur || cur === null) return bad('chunk outside its run');
      if (!isNum(o.seq) || !isNum(o.firstUs) || !isNum(o.lastUs) || !isStr(o.text)) return bad('bad chunk');
      return cur;
    case 'export':
      if (!normalizeExportDoc(o.doc)) return bad('bad export doc');
      return null;
    default:
      return bad('unknown record');
  }
}

/** The meta of a checked `run` line as it is stored: a run that was not sealed is sealed at its start. */
export function toRunMeta(o: Rec): RunMeta {
  const meta = { ...(o.run as RunMeta) };
  if (!meta.sealed) {
    meta.sealed = true;
    meta.endedUs ??= meta.startedUs;
  }
  return meta;
}

/** A checked `event` line as it is stored. */
export function toEvent(o: Rec): RunEventRecord {
  return { runId: o.runId as string, seq: o.seq as number, event: o.event as RunEvent };
}

/** A checked `chunk` line as it is stored. */
export function toChunk(o: Rec): RunChunk {
  return { runId: o.runId as string, seq: o.seq as number, firstUs: o.firstUs as number, lastUs: o.lastUs as number, text: o.text as string };
}

/** A run's lines, each ending in `\n`: its meta, its events, its chunks. */
export function* runLines(rows: RunRows): Generator<string> {
  yield JSON.stringify({ type: 'run', run: rows.meta }) + '\n';
  for (const e of rows.events) yield JSON.stringify({ type: 'event', ...e }) + '\n';
  for (const c of rows.chunks) yield JSON.stringify({ type: 'chunk', ...c }) + '\n';
}

/** The lines of a text stream, without their `\n`. */
export async function* streamLines(stream: ReadableStream<string>): AsyncGenerator<string> {
  const reader = stream.getReader();
  let rest = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += value;
      let start = 0;
      for (let i = rest.indexOf('\n'); i >= 0; i = rest.indexOf('\n', start)) {
        yield rest.slice(start, i);
        start = i + 1;
      }
      rest = rest.slice(start);
    }
    if (rest) yield rest;
  } finally {
    reader.cancel().catch(() => {});
  }
}
