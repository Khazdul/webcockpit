import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Plugin, defineConfig } from 'vite';

// Cross-origin isolation (spec §1.5) stays possible from day one: `vite`
// and `vite preview` send these headers (GitHub Pages cannot, ADR 0028).
// COEP does not apply to WebSocket connections, so the direct
// wss://mume.org/ws-play/ socket (ADR 0002) is unaffected.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/** Default location of the owner's Cockpit raw logs (ADR 0007). */
export const DEFAULT_FIXTURES = '/home/ole/MUME/data/runs';
/** Fixtures kept in the repository (the GMCP demo, ADR 0016); searched first. */
export const REPO_FIXTURES = fileURLToPath(new URL('./tests/fixtures', import.meta.url));

/** Fixture roots in lookup order: the repository, then $WEBCOCKPIT_FIXTURES. */
function fixtureRoots(): string[] {
  return [REPO_FIXTURES, resolve(process.env.WEBCOCKPIT_FIXTURES ?? DEFAULT_FIXTURES)];
}

/** Resolves `rel` inside `root` (symlinks included), or null if outside or missing. */
function fixtureFile(root: string, rel: string): string | null {
  try {
    const realRoot = realpathSync(root);
    const file = realpathSync(resolve(realRoot, rel));
    return file.startsWith(realRoot + sep) && statSync(file).isFile() ? file : null;
  } catch {
    return null;
  }
}

/** Every `.log` under `root`, as `/`-separated paths relative to it. */
function listLogs(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const p = join(dir, name);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (st.isFile() && name.endsWith('.log')) out.push(relative(root, p).split(sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

/**
 * Dev-only, read-only access to replay fixtures (ADR 0007, ADR 0016):
 *   GET /__fixtures/list        JSON array of relative `.log` paths (all roots)
 *   GET /__fixtures/<rel path>  the log text, from the first root that has it
 *                               (also `.jsonl.gz` run backups, as bytes)
 * Roots: `tests/fixtures` in the repository, then $WEBCOCKPIT_FIXTURES
 * (default the owner's Cockpit runs). Paths are resolved (symlinks
 * included) and must stay inside their root. `apply: 'serve'` keeps this
 * out of `vite build` and `vite preview`.
 */
function fixturesPlugin(): Plugin {
  return {
    name: 'webcockpit-fixtures',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__fixtures', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();
        const roots = fixtureRoots();
        const send = (code: number, type: string, body: string | Buffer): void => {
          const r = res as ServerResponse;
          r.statusCode = code;
          r.setHeader('Content-Type', type);
          r.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
          r.setHeader('Cache-Control', 'no-store');
          r.end(req.method === 'HEAD' ? undefined : body);
        };
        const url = new URL(req.url ?? '/', 'http://x');
        let rel: string;
        try {
          rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        } catch {
          return send(400, 'text/plain', 'bad path');
        }
        if (rel === 'list') {
          const all = [...new Set(roots.flatMap((r) => listLogs(r)))].sort();
          return send(200, 'application/json', JSON.stringify(all));
        }
        const gz = rel.endsWith('.jsonl.gz');
        if (!(rel.endsWith('.log') || gz) || rel.includes('\0')) return send(404, 'text/plain', 'not found');
        for (const root of roots) {
          const file = fixtureFile(root, rel);
          if (file) return send(200, gz ? 'application/gzip' : 'text/plain; charset=utf-8', readFileSync(file));
        }
        return send(404, 'text/plain', 'not found');
      });
    },
  };
}

/**
 * The git short commit of a build (ADR 0025); `dev` when git is
 * unavailable. The dev server always says `dev`.
 */
function gitCommit(): string {
  try {
    const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[0-9a-f]{4,40}$/.test(out) ? out : 'dev';
  } catch {
    return 'dev';
  }
}

/** Set by the config function: the commit `vite build` embeds (`dev` when serving). */
let buildCommit = 'dev';

/**
 * Size of the bundled map (src/map/store.ts BUNDLED_MAP_BYTES): the byte
 * progress total when the host serves it content-encoded (ADR 0083).
 */
function bundledMapBytes(): number {
  try {
    return statSync(fileURLToPath(new URL('./public/map/arda.mm2', import.meta.url))).size;
  } catch {
    return 0;
  }
}

/** `define` of the app and the replay bundle (src/core/build-info.ts). */
function defines(): Record<string, string> {
  return {
    __WC_VERSION__: JSON.stringify(pkg.version),
    __WC_COMMIT__: JSON.stringify(buildCommit),
    __WC_MAP_BYTES__: JSON.stringify(bundledMapBytes()),
  };
}
// Preact JSX for the chrome (src/chrome, ADR 0013).
const oxc = { jsx: { runtime: 'automatic', importSource: 'preact' } } as const;

/** Where the HTML replay bundle is served and emitted (src/replay/export.ts REPLAY_BUNDLE_PATH). */
const REPLAY_BUNDLE = 'replay/replay.js';
const ROOT = fileURLToPath(new URL('.', import.meta.url));
/** The licence text at the site root (src/chrome/frames/about.tsx links it). */
const LICENCE_FILE = 'LICENSE.txt';

/**
 * Bundles the HTML replay runtime (src/replay/main.ts) into one IIFE with
 * its CSS inlined (a `<style>` added when it runs): the text that
 * `buildReplayHtml` embeds in every exported file (ADR 0019).
 *
 * The map (ADR 0020): `__WC_REPLAY__` is true here, and
 * src/map/spawn-worker.ts is swapped for spawn-worker-inline.ts, which
 * embeds the map worker (`?worker&inline`, an IIFE worker started from a
 * blob: URL) because a single file cannot load a worker by URL.
 */
async function bundleReplay(): Promise<string> {
  const { build } = await import('vite');
  const inlineCss: Plugin = {
    name: 'webcockpit-replay-inline-css',
    enforce: 'post',
    generateBundle(_, bundle) {
      let css = '';
      for (const [name, file] of Object.entries(bundle)) {
        if (file.type === 'asset' && name.endsWith('.css')) {
          css += typeof file.source === 'string' ? file.source : new TextDecoder().decode(file.source);
          delete bundle[name];
        }
      }
      const entry = Object.values(bundle).find((f) => f.type === 'chunk' && f.isEntry);
      if (entry?.type === 'chunk' && css) {
        entry.code =
          `(()=>{const s=document.createElement("style");s.textContent=${JSON.stringify(css)};document.head.appendChild(s)})();\n` +
          entry.code;
      }
    },
  };
  const out = await build({
    configFile: false,
    root: ROOT,
    mode: 'production',
    logLevel: 'warn',
    publicDir: false,
    define: { ...defines(), __WC_REPLAY__: 'true' },
    oxc,
    plugins: [inlineCss],
    resolve: {
      alias: [{ find: /^\.\/spawn-worker$/, replacement: resolve(ROOT, 'src/map/spawn-worker-inline.ts') }],
    },
    worker: { format: 'iife' },
    build: {
      write: false,
      target: 'es2022',
      copyPublicDir: false,
      emptyOutDir: false,
      lib: {
        entry: resolve(ROOT, 'src/replay/main.ts'),
        formats: ['iife'],
        name: 'WebCockpitReplay',
        fileName: () => 'replay.js',
      },
    },
  });
  const outputs = (Array.isArray(out) ? out : [out]) as Array<{ output?: Array<{ type: string; isEntry?: boolean; code?: string }> }>;
  for (const o of outputs) {
    const chunk = o.output?.find((f) => f.type === 'chunk' && f.isEntry);
    if (chunk?.code) return chunk.code;
  }
  throw new Error('replay bundle: no entry chunk');
}

/**
 * The HTML replay bundle (ADR 0019): `vite build` emits it as
 * `dist/replay/replay.js`; `vite` (dev) builds it on the first request of
 * `/replay/replay.js` and keeps it until a file under src/ changes. The
 * app never loads it as a script (only as text, at export), so its cold
 * start is unaffected.
 */
function replayBundlePlugin(): Plugin {
  let cached: Promise<string> | null = null;
  return {
    name: 'webcockpit-replay-bundle',
    configureServer(server) {
      const src = resolve(ROOT, 'src') + sep;
      const drop = (file: string): void => {
        if (resolve(file).startsWith(src)) cached = null;
      };
      server.watcher.on('change', drop);
      server.watcher.on('add', drop);
      server.watcher.on('unlink', drop);
      const path = `${server.config.base.replace(/\/?$/, '/')}${REPLAY_BUNDLE}`;
      server.middlewares.use((req, res, next) => {
        if ((req.method !== 'GET' && req.method !== 'HEAD') || req.url?.split('?')[0] !== path) return next();
        const r = res as ServerResponse;
        const p = (cached ??= bundleReplay());
        p.then(
          (code) => {
            r.statusCode = 200;
            r.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            r.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
            r.setHeader('Cache-Control', 'no-store');
            r.end(req.method === 'HEAD' ? undefined : code);
          },
          (err: unknown) => {
            if (cached === p) cached = null;
            server.config.logger.error(`replay bundle: ${err instanceof Error ? err.message : String(err)}`);
            r.statusCode = 500;
            r.setHeader('Content-Type', 'text/plain');
            r.end('replay bundle failed');
          },
        );
      });
    },
    async generateBundle() {
      if (this.environment?.config.consumer !== undefined && this.environment.config.consumer !== 'client') return;
      this.emitFile({ type: 'asset', fileName: REPLAY_BUNDLE, source: await bundleReplay() });
    },
  };
}

/**
 * `release.json` at the site root (ADR 0025): `{ version, commit }` of the
 * build, what the running app's update check compares itself with.
 * `npm run build:pages` rewrites it with the full manifest (ADR 0028).
 */
function releaseManifestPlugin(): Plugin {
  return {
    name: 'webcockpit-release-manifest',
    apply: 'build',
    generateBundle() {
      if (this.environment?.config.consumer !== undefined && this.environment.config.consumer !== 'client') return;
      const release = { version: pkg.version, commit: buildCommit };
      this.emitFile({ type: 'asset', fileName: 'release.json', source: `${JSON.stringify(release, null, 2)}\n` });
    },
  };
}

/**
 * `LICENSE.txt` at the site root: the repository's GPL-2 `LICENSE`
 * (ADR 0027), linked from About, so every copy of the app carries the
 * licence text (GPL-2 §1). `vite` (dev) serves the same file.
 */
function licencePlugin(): Plugin {
  const file = resolve(ROOT, 'LICENSE');
  return {
    name: 'webcockpit-licence',
    configureServer(server) {
      const path = `${server.config.base.replace(/\/?$/, '/')}${LICENCE_FILE}`;
      server.middlewares.use((req, res, next) => {
        if ((req.method !== 'GET' && req.method !== 'HEAD') || req.url?.split('?')[0] !== path) return next();
        const r = res as ServerResponse;
        r.statusCode = 200;
        r.setHeader('Content-Type', 'text/plain; charset=utf-8');
        r.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        r.end(req.method === 'HEAD' ? undefined : readFileSync(file));
      });
    },
    generateBundle() {
      if (this.environment?.config.consumer !== undefined && this.environment.config.consumer !== 'client') return;
      this.emitFile({ type: 'asset', fileName: LICENCE_FILE, source: readFileSync(file) });
    },
  };
}

/**
 * The public path the app is served under: `$WEBCOCKPIT_BASE`, default `/`
 * (GitHub Pages at mumecockpit.com, ADR 0029). A subpath works too
 * (ADR 0028). Always with a leading and a trailing slash.
 */
export function siteBase(raw = process.env.WEBCOCKPIT_BASE): string {
  const trimmed = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  return trimmed ? `/${trimmed}/` : '/';
}

export default defineConfig(({ command }) => {
  buildCommit = command === 'build' ? gitCommit() : 'dev';
  return {
    base: siteBase(),
    define: defines(),
    oxc,
    plugins: [fixturesPlugin(), replayBundlePlugin(), releaseManifestPlugin(), licencePlugin()],
    // The map worker is a module worker (src/map/spawn-worker.ts, ADR 0020).
    worker: { format: 'es' as const },
    server: { headers: isolationHeaders },
    preview: { headers: isolationHeaders },
    build: {
      target: 'es2022',
      rolldownOptions: {
        // wasmoon's emscripten glue (src/lua, ADR 0051) imports `module`
        // and `url` in its Node-only branch; the browser stubs are correct.
        onwarn(warning, warn) {
          if (/externalized for browser compatibility/.test(warning.message) && warning.message.includes('/wasmoon/')) return;
          warn(warning);
        },
      },
    },
  };
});
