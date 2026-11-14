// The admin's identity (ADR 0148, addendum of 2026-11-14): Cloudflare
// Access stands in front of /admin and /api/admin/*, and the Worker checks
// the token Access adds to every request it lets through, as Cloudflare's
// "Validate JWTs" page describes
// (developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/):
//
//   - the token is the `Cf-Access-Jwt-Assertion` header (not the cookie,
//     which is not guaranteed to be passed on)
//   - RS256, signed by one of the keys at
//     https://<team>.cloudflareaccess.com/cdn-cgi/access/certs, found by
//     `kid` (Access rotates its key every 6 weeks; the old one stays valid
//     for 7 days, so keys are never hard-coded)
//   - `iss` is https://<team>.cloudflareaccess.com, `aud` holds the
//     application's audience tag, `exp` (and `nbf`) are honoured
//   - and the token's `email` is in the Worker secret ADMIN_EMAILS.
//
// The check also covers the Worker's workers.dev address, which a path
// application on our zone does not guard: there no token arrives, and the
// answer is 403.
import { type Deps, type Env, error } from './runtime.ts';

/** The keys are fetched again after this long, or when a token names a key we do not have. */
export const CERTS_TTL_MS = 60 * 60_000;
/** An unknown `kid` fetches the keys again at most this often. */
export const CERTS_REFETCH_MS = 60_000;
/** Clock skew allowed on `exp` and `nbf`. */
export const LEEWAY_S = 30;

interface Jwk {
  kid?: string;
  kty?: string;
  alg?: string;
  n?: string;
  e?: string;
}

const keyCache = new Map<string, { at: number; keys: Map<string, CryptoKey> }>();

/** Drops the cached keys (tests). */
export function forgetAccessKeys(): void {
  keyCache.clear();
}

/** The team domain as a bare host name, or null when it is not one. */
function teamHost(v: string | undefined): string | null {
  const host = (v ?? '').trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/+$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

function emails(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

function b64url(s: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function jsonPart(s: string): Record<string, unknown> | null {
  const bytes = b64url(s);
  if (!bytes) return null;
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function fetchKeys(host: string, deps: Deps): Promise<Map<string, CryptoKey>> {
  const res = await deps.fetch(`https://${host}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`certs: ${res.status}`);
  const body = (await res.json()) as { keys?: Jwk[] } | null;
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body?.keys ?? []) {
    if (!jwk.kid || jwk.kty !== 'RSA' || !jwk.n || !jwk.e) continue;
    const key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    keys.set(jwk.kid, key);
  }
  return keys;
}

async function keyFor(host: string, kid: string, deps: Deps): Promise<CryptoKey | null> {
  const now = deps.now();
  let hit = keyCache.get(host);
  const stale = !hit || now - hit.at > CERTS_TTL_MS || now < hit.at;
  const unknown = hit && !hit.keys.has(kid) && now - hit.at > CERTS_REFETCH_MS;
  if (stale || unknown) {
    try {
      hit = { at: now, keys: await fetchKeys(host, deps) };
      keyCache.set(host, hit);
    } catch {
      // Keep what we had, if anything.
    }
  }
  return hit?.keys.get(kid) ?? null;
}

export type AccessResult = { ok: true; email: string } | { ok: false; response: Response };

const deny = (): AccessResult => ({ ok: false, response: error('forbidden', 403) });

/**
 * Checks the Access token of a request to /admin or /api/admin/*. 503
 * `admin_not_configured` while the team domain, the audience or
 * ADMIN_EMAILS is missing; 403 `forbidden` for anything wrong with the
 * token or its e-mail.
 */
export async function verifyAccess(request: Request, env: Env, deps: Deps): Promise<AccessResult> {
  const host = teamHost(env.ACCESS_TEAM_DOMAIN);
  const aud = (env.ACCESS_AUD ?? '').trim();
  const admins = emails(env.ADMIN_EMAILS);
  if (!host || !aud || admins.length === 0) return { ok: false, response: error('admin_not_configured', 503) };

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return deny();
  const parts = token.split('.');
  if (parts.length !== 3) return deny();
  const [h, p, s] = parts as [string, string, string];
  const header = jsonPart(h);
  const claims = jsonPart(p);
  const sig = b64url(s);
  if (!header || !claims || !sig) return deny();
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return deny();

  const key = await keyFor(host, header.kid, deps);
  if (!key) return deny();
  const signed = new TextEncoder().encode(`${h}.${p}`);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed))) return deny();

  const now = deps.now() / 1000;
  if (claims.iss !== `https://${host}`) return deny();
  const auds = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!auds.includes(aud)) return deny();
  if (typeof claims.exp !== 'number' || claims.exp + LEEWAY_S <= now) return deny();
  if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf - LEEWAY_S > now)) return deny();
  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  if (!email || !admins.includes(email)) return deny();
  return { ok: true, email };
}
