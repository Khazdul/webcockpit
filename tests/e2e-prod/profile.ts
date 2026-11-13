// Which host the smoke test runs against (playwright.prod.config.ts sets
// WC_PROD_PROFILE): `cloudflare`, the Worker with static assets (ADR 0144),
// or `pages`, GitHub Pages (ADR 0028).
export type Profile = 'cloudflare' | 'pages';

export const profile: Profile = process.env.WC_PROD_PROFILE === 'pages' ? 'pages' : 'cloudflare';
export const cloudflare = profile === 'cloudflare';
