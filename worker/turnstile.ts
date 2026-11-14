// The Turnstile check (spec §7.10, ADR 0145), as Cloudflare's "Validate the
// token" page describes
// (developers.cloudflare.com/turnstile/get-started/server-side-validation/):
//
//   POST https://challenges.cloudflare.com/turnstile/v0/siteverify
//   { secret, response } → { success, hostname, "error-codes", … }
//
// A token is at most 2048 characters, lives 300 seconds and works once.
// The visitor's address is not sent (`remoteip` is optional).
//
// Anything that is not a clear answer about the token is `unavailable`,
// never a pass and never the visitor's fault: the network, a timeout, a
// status that is not 200, a body that is not the contract's, and the error
// codes that say our own request or secret is wrong.
//
// `TURNSTILE_HOSTNAMES` (optional, comma separated) are the host names a
// passed challenge may come from. Cloudflare's test keys answer with
// `example.com`, so an environment on the test keys leaves it unset.
import { TURNSTILE_MAX_LENGTH } from '../shared/cloud/api.ts';
import type { Deps, Env } from './runtime.ts';

export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const SITEVERIFY_TIMEOUT_MS = 5000;

export type TurnstileResult = 'ok' | 'fail' | 'unavailable';

/** Error codes that are about our request, not about the visitor's token. */
const OUR_FAULT = ['missing-input-secret', 'invalid-input-secret', 'bad-request', 'internal-error'];

/** A token as it may be sent on: a non-empty string within Cloudflare's length. */
export function isToken(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= TURNSTILE_MAX_LENGTH;
}

function hostnames(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export async function verifyTurnstile(env: Env, deps: Deps, token: string): Promise<TurnstileResult> {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return 'unavailable';
  let body: unknown;
  try {
    const res = await deps.fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (res.status !== 200) return 'unavailable';
    body = await res.json();
  } catch {
    return 'unavailable';
  }
  if (typeof body !== 'object' || body === null) return 'unavailable';
  const { success, hostname } = body as { success?: unknown; hostname?: unknown };
  const codes = (body as { 'error-codes'?: unknown })['error-codes'];
  if (success === true) {
    const allowed = hostnames(env.TURNSTILE_HOSTNAMES);
    if (allowed.length > 0 && !(typeof hostname === 'string' && allowed.includes(hostname.toLowerCase()))) return 'fail';
    return 'ok';
  }
  if (success !== false) return 'unavailable';
  if (Array.isArray(codes) && codes.some((c) => OUR_FAULT.includes(c as string))) return 'unavailable';
  return 'fail';
}
