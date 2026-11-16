// Link previews of shared logs (ADR 0158). Crawlers (Discord, Slack,
// iMessage, Messenger…) run no script, so the Worker writes the Open Graph
// and Twitter meta tags into the watch page's HTML itself, and serves the
// log's preview image.
//
//   GET /r/<id>               index.html with the log's meta tags (router.ts `watchPage`)
//   GET /r/<id>/preview.png   the log's preview image (R2 `pubprev/<id>`), or the
//                             generic one when it has none; 404 for a log that is
//                             not `active` (hidden, removed, pending, unknown)
//
// The image is uploaded by the sender after the link is made
// (`PUT /api/u/pub/<id>/preview`, worker/pub.ts). A log that is hidden,
// removed or unknown gets the site's generic tags and image only: none of
// its words and none of its image.

import { PUB_ID_PATTERN } from '../shared/cloud/api.ts';
import { FALLBACK_PREVIEW_PATH, PREVIEW_HEIGHT, PREVIEW_TYPE, PREVIEW_WIDTH, SITE_NAME, ogDescription, ogTitle } from '../shared/cloud/preview.ts';
import { addressKey } from './address.ts';
import { flags } from './flags.ts';
import { type PubRow, previewKeyOf, pubWithSender } from './pub.ts';
import type { Deps, Env } from './runtime.ts';

/** The generic title of a page whose log is not shown. */
export const GENERIC_TITLE = 'A shared MUME log';
const GENERIC_DESCRIPTION = 'Watch it in MUME Cockpit, the MUME client in the browser.';
/** How long a preview image may be kept: short, so a hidden log's image goes out of caches soon. */
const IMAGE_MAX_AGE = 3600;

/** `s` safe inside an HTML attribute value in double quotes (and in text). */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export interface OgInfo {
  /** The page's absolute URL. */
  url: string;
  title: string;
  description: string;
  /** The image's absolute URL. */
  image: string;
  imageAlt: string;
}

/** The meta tags, one per line. Facebook's layout: `twitter:card` is `summary` (a thumbnail beside the text). */
export function ogTags(o: OgInfo): string {
  const tags: [string, string, string][] = [
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:type', 'website'],
    ['property', 'og:url', o.url],
    ['property', 'og:title', o.title],
    ['property', 'og:image', o.image],
    ['property', 'og:image:type', PREVIEW_TYPE],
    ['property', 'og:image:width', String(PREVIEW_WIDTH)],
    ['property', 'og:image:height', String(PREVIEW_HEIGHT)],
    ['property', 'og:image:alt', o.imageAlt],
    ['name', 'twitter:card', 'summary'],
    ['name', 'twitter:title', o.title],
    ['name', 'twitter:image', o.image],
  ];
  if (o.description !== '') {
    tags.splice(4, 0, ['property', 'og:description', o.description]);
    tags.push(['name', 'twitter:description', o.description]);
  }
  return tags.map(([k, n, v]) => `<meta ${k}="${n}" content="${escapeHtml(v)}">`).join('\n    ');
}

/** `html` with `tags` before its `</head>` (and its `<title>` the og title); unchanged when it has no head. */
export function injectOg(html: string, tags: string, title: string): string {
  const at = html.search(/<\/head>/i);
  if (at < 0) return html;
  const titled = html.slice(0, at).replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  return `${titled}  ${tags}\n  ${html.slice(at)}`;
}

/** The meta of a log's page: its own for an active log, the generic one otherwise. `imageVersion`: the stored image's upload time, null when it has none. */
export function ogInfoOf(origin: string, id: string, row: (PubRow & { sender: string | null }) | null, imageVersion: number | null): OgInfo {
  const url = `${origin}/r/${id}`;
  const fallback = `${origin}${FALLBACK_PREVIEW_PATH}`;
  if (!row || row.state !== 'active') {
    return { url, title: GENERIC_TITLE, description: GENERIC_DESCRIPTION, image: fallback, imageAlt: SITE_NAME };
  }
  const title = ogTitle(row.title, row.character);
  return {
    url,
    title,
    description: ogDescription(row.description),
    image: imageVersion === null ? fallback : `${url}/preview.png?v=${imageVersion.toString(36)}`,
    imageAlt: `The start of the log ${title}`,
  };
}

/**
 * The watch page's HTML for log `id` with its meta tags, or null to serve
 * the page as it is (the flag `share` off, no database, an error).
 */
export async function watchHtml(env: Env, html: string, origin: string, id: string, now: number): Promise<string | null> {
  try {
    if (!env.DB || !(await flags(env, now)).share) return null;
    const row = await pubWithSender(env.DB, id);
    let version: number | null = null;
    if (row?.state === 'active' && env.FILES) {
      const head = await env.FILES.head(previewKeyOf(id));
      version = head ? (head.uploaded?.getTime() ?? 0) : null;
    }
    const info = ogInfoOf(origin, id, row, version);
    return injectOg(html, ogTags(info), info.title);
  } catch {
    return null;
  }
}

const IMAGE_PATH = /^\/r\/([^/]+)\/preview\.png$/;

/** True for `/r/<anything>/preview.png`. */
export function isPreviewPath(path: string): boolean {
  return IMAGE_PATH.test(path);
}

const notFound = (): Response => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

/** `GET /r/<id>/preview.png`: the image of an active log (its own or the generic one); 404 otherwise. */
export async function previewImage(request: Request, env: Env, url: URL, deps: Deps): Promise<Response> {
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const id = IMAGE_PATH.exec(url.pathname)?.[1] ?? '';
  if (!PUB_ID_PATTERN.test(id)) return notFound();
  const db = env.DB;
  if (!db) return notFound();
  try {
    if (!(await flags(env, deps.now())).share) return notFound();
    const address = addressKey(request.headers.get('cf-connecting-ip'));
    if (env.API_LIMITER && !(await env.API_LIMITER.limit({ key: `a|${address}` })).success) {
      return new Response(null, { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' } });
    }
    const row = await db.prepare('SELECT state FROM publication WHERE id = ?1').bind(id).first<{ state: string }>();
    if (row?.state !== 'active') return notFound();
    const headers: Record<string, string> = {
      'Content-Type': PREVIEW_TYPE,
      'Cache-Control': `public, max-age=${IMAGE_MAX_AGE}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    };
    const obj = env.FILES ? await env.FILES.get(previewKeyOf(id)) : null;
    if (obj) {
      headers['Content-Length'] = String(obj.size);
      return new Response(method === 'HEAD' ? null : obj.body, { headers });
    }
    const file = await env.ASSETS.fetch(new URL(FALLBACK_PREVIEW_PATH, url));
    if (!file.ok) return notFound();
    return new Response(method === 'HEAD' ? null : file.body, { headers });
  } catch {
    return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
