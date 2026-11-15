// The Worker `webcockpit` (wrangler.jsonc, ADR 0144): the entry the
// Workers runtime calls. Static files are served without it; it runs for
// /api/*, /admin and /admin/* (`run_worker_first`), for requests that
// match no file, and for the cron triggers (ADR 0147): the 5-minute sample
// and the daily roll-up. It hands the router what only workerd has: the
// request's `waitUntil` and `cloudflare:email`'s EmailMessage (the
// owner's mail on reports, worker/mail.ts) and `cloudflare:sockets`'
// connect() (the MSSP probe of MUME's player count, worker/mume.ts).
import { EmailMessage } from 'cloudflare:email';
import { connect } from 'cloudflare:sockets';
import { type Env, handle } from './router.ts';
import { DEFAULT_DEPS, type Deps } from './runtime.ts';
import { runCron } from './stats.ts';

const depsOf = (ctx: ExecutionContext): Deps => ({
  ...DEFAULT_DEPS,
  waitUntil: (work) => ctx.waitUntil(work),
  emailMessage: (from, to, raw) => new EmailMessage(from, to, raw),
  connect: (address) => connect(address, { secureTransport: 'off', allowHalfOpen: false }),
});

export default {
  fetch: (request, env, ctx) => handle(request, env, depsOf(ctx)),
  scheduled: (controller, env, ctx) => {
    ctx.waitUntil(runCron(env, controller.cron, controller.scheduledTime, depsOf(ctx)));
  },
} satisfies ExportedHandler<Env>;
