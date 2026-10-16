# Weather atelier — brief for effect builders

You build decorative weather effects for WebCockpit, a browser MUD client for MUME
(TUI look: black background, monospace text, grey-bordered panes). The goal is to
make the owner say "WOW" while staying discreet enough to play with all evening.

## Where things are
Dir: /tmp/claude-1000/-home-ole-proj-webcockpit/76ac4d70-bf49-456d-be2d-c12f3cf2397c/scratchpad/wx
- index.html  — the client mock (layout copied from a real screenshot) + control dock. DO NOT EDIT.
- harness.js  — READ THE HEADER COMMENT FIRST: it is the effect contract (env, layers, panes,
                lines, protect zones, cell metrics, state, events). DO NOT EDIT.
- effects/<yours>.js — the ONLY file you write. Call WX.register({...}) once per effect.
- shot.mjs    — headless screenshot: `node shot.mjs <effectId> <out.png> [waitMs] [jsBeforeWait]`
                run it from the wx dir with an absolute out path inside the wx dir, e.g.
                `cd <wx> && node shot.mjs rain-glass /…/wx/shots/rain-glass-1.png 3000`
                It prints the measured frame cost and any JS errors. Use the 4th arg to
                change state, e.g. "document.querySelector('#gWeather [data-v=\"\\\"\"]').click()"
                or "document.querySelector('[data-e=strike]').click()". Put screenshots in wx/shots/
                with a prefix of your effect ids. Look at them with the Read tool.
- effects/_probe.js shows the pane/line geometry if you want to see it.

## Owner feedback on round 1 (soft canvas rain/snow/fog/haze-clouds over the client)
- Liked: rain and snow, "looked interesting".
- Disliked: fog and clouds — they read as a grey haze, not as clouds.
- Wants: lightning that actually STRIKES now and then — an electric bolt that moves fast and branches.
- Wants more out-of-the-box ideas, cooler "retro" TUI effects, and to play with what lies
  ABOVE and BELOW panes: the back layer shows through the output area, empty pane interiors
  and gaps; the front layer is above everything; pane top borders are natural ledges
  (snow can settle, rain can splash and drip), panes can cast/catch light, etc.
- Keep effects away from the bottom rows and the far left where the player types
  (the harness masks that automatically; also don't put bright stuff right under text).

## Hard constraints
- Latency: gameplay must not be affected. frame() average <= 0.5 ms and p95 <= 1.2 ms at the
  1600x1000 screenshot size (shot.mjs prints it). No DOM access per frame. Avoid per-frame
  allocation in hot loops (preallocate typed arrays / object pools). Cache sprites on offscreen
  canvases. Use the `fps` cap (30 or 15) where the look allows it — a TUI/retro look often
  looks BETTER at 12-15 fps. Never use ctx.filter or shadowBlur per particle per frame.
- Readability: text must stay readable. Default intensity is discreet; drama comes in short
  moments (a strike, a sunrise sweep), not as a permanent veil.
- Every effect must react sensibly to the GMCP state: weather " " clear, "~" cloudy, "'" rain,
  "\"" heavy rain, "*" snow; fog "" / "-" / "="; light "*" sun, ")" moon, "o" dark, "!" torch-lit.
  Changes should transition over a few seconds, not snap. It is fine for an effect to show
  nothing in states outside its family (e.g. a snow effect in clear weather), but then fade out.
  Set `preset` so selecting the effect shows it at its best.
- Plain JS, no libraries, no network. Swedish `title` (1-3 words), Swedish `note` (one sentence
  the owner reads: what it is and what to try), Swedish `family` label.
- Quality bar: iterate with screenshots (several moments in time, several states) until it is
  genuinely beautiful. Compare against how a good designer/demoscener would do it. Remove
  anything that looks cheap. Better 2 stunning effects than 4 ok ones.

## Report back (max ~250 words)
Effect ids + one line each, measured perf per effect (avg/p95), best screenshot paths,
which GMCP states each uses, ideas you did not build. Do not paste code.
