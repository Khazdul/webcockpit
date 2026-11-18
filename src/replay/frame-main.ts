// Entry of the shared replay's frame document `r/frame.html` (ADR 0154;
// vite.config.ts `frameDocumentPlugin`): the replay runtime in frame mode.
// Its CSS goes into the document's one inline `<style>`, this script into
// its one inline `<script>`; the frame's CSP names both by hash.

import '../ui/ui.css';
import './replay.css';
import './poster.css';
import { startFrame } from './frame';

// `window.__wcReplay`: the running page, once playing (the browser tests),
// as in the HTML replay file; inside the frame only.
startFrame({
  win: window,
  onPlay: (page) => {
    (window as unknown as { __wcReplay?: unknown }).__wcReplay = page;
  },
});
