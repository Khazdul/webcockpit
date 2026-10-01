// The self-hosted URL of wasmoon's `glue.wasm` (ADR 0051 "Self-hosted
// wasm"): Vite emits it as a hashed asset. Imported only in the browser,
// by load.ts, because Node cannot import `?url`.

import url from 'wasmoon/dist/glue.wasm?url';

export default url;
