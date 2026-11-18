// Entry of the HTML replay bundle (`replay/replay.js`, one IIFE with its
// CSS inlined; vite.config.ts `replayBundle`). The exported file loads it
// after the payload element (src/replay/export.ts, page.ts).

import '../ui/ui.css';
import './replay.css';
import './poster.css';
import { startReplay } from './page';

// `window.__wcReplay`: the running page (the browser tests, the console).
void startReplay(document).then((page) => {
  (window as unknown as { __wcReplay?: unknown }).__wcReplay = page;
});
