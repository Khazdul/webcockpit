// What `cloudflare:workers` exports for this Worker (`env`, `exports`):
// the bindings of wrangler.jsonc and the entry module. Written by hand
// (`wrangler types` would generate the same from the config); keep it in
// step with wrangler.jsonc when a binding is added.
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index.ts');
  }
  interface Env {
    ASSETS: Fetcher;
  }
}
