// The Worker `webcockpit` (wrangler.jsonc, ADR 0144): the entry the
// Workers runtime calls. Static files are served without it; it runs for
// /api/*, /admin and /admin/* (`run_worker_first`), for requests that
// match no file, and for the cron triggers (ADR 0147): the 5-minute sample
// and the daily roll-up.
import { type Env, handle } from './router.ts';
import { runCron } from './stats.ts';

export default {
  fetch: (request, env) => handle(request, env),
  scheduled: (controller, env, ctx) => {
    ctx.waitUntil(runCron(env, controller.cron, controller.scheduledTime));
  },
} satisfies ExportedHandler<Env>;
