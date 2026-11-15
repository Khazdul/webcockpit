// The run body worker (ADR 0153, §7.0 rule 1): a run's body is gzipped and
// sealed, or opened and read, off the page's thread. Started on demand by
// body-client.ts and ended by it when idle. Given the data key (a
// `CryptoKey` crosses `postMessage` by structured clone) and the rows or
// the body; answers with a `Blob` or the rows.

import { decodeRunBody, encodeRunBody, isRunBodyError } from './body';
import type { RunBodyRequest, RunBodyResponse } from './body-client';

interface BodyScope {
  postMessage(m: RunBodyResponse): void;
  addEventListener(type: 'message', fn: (e: MessageEvent<RunBodyRequest>) => void): void;
}

const scope = self as unknown as BodyScope;

scope.addEventListener('message', (e) => {
  const req = e.data;
  const work: Promise<RunBodyResponse> =
    req.op === 'encode'
      ? encodeRunBody(req.dataKey, req.serverId, req.rows).then((blob) => ({ id: req.id, ok: true, blob }))
      : decodeRunBody(req.dataKey, req.serverId, req.runId, req.body).then((rows) => ({ id: req.id, ok: true, rows }));
  work.then(
    (res) => scope.postMessage(res),
    (err: unknown) =>
      scope.postMessage({
        id: req.id,
        ok: false,
        code: isRunBodyError(err) ? err.code : null,
        message: err instanceof Error ? err.message : String(err),
      }),
  );
});
