// The Worker `webcockpit` (wrangler.jsonc, ADR 0144): the entry the
// Workers runtime calls. Static files are served without it; it runs for
// /api/* (`run_worker_first`) and for requests that match no file.
import { type Env, handle } from './router.ts';

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
