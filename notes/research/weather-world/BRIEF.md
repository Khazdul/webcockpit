# Weather world (v3) — brief for module builders

WebCockpit is a browser MUD client for MUME (TUI look: black background, monospace
text, grey-bordered panes). Round 2 produced 14 separate effect experiments; the
owner picked favourites and wrote down how every GMCP signal should look. Round 3
combines them into ONE living scene: several modules run at once and react to the
game state together.

## Files
Dir: /home/ole/proj/webcockpit/notes/research/weather-world   (NOT in /tmp: a reboot wiped /tmp once)
- index.html — client mock + controls. DO NOT EDIT.
- harness.js — READ THE HEADER COMMENT: the module contract, env.raw / env.settled / env.mix,
  events, env.shared. DO NOT EDIT. If you truly need a harness change, say so in your report.
- modules/<yours>.js — the only file(s) you write. Call WX.module({...}) once per module.
- ref-effects/*.js — round-2 effects. REUSE their code freely (copy and adapt): they were
  approved visually. Their contract was slightly different (one effect at a time, env.state,
  own clearing) — adapt to the v3 contract (harness clears both canvases each frame; use env.mix).
- shot.mjs — `node shot.mjs '<state json>' <abs out.png> [waitMs] [js] [modules]`
  e.g. `node shot.mjs '{"weather":"\"","light":")","clock":"night"}' /tmp/claude-1000/-home-ole-proj-webcockpit/76ac4d70-bf49-456d-be2d-c12f3cf2397c/scratchpad/shots3/w-1.png 3000 "WX.emit('strike')" weather`
  The state json is applied with WX.jump (raw, settled and mix set instantly). The 5th arg
  limits which modules run (comma list of ids), useful to test yours alone; ALSO test with all
  modules together. Screenshots go to the scratchpad shots3/ dir above (prefix with your module id).
  It prints perf (total and per module) and JS errors. Look at shots with the Read tool.
  Note: playwright screenshots are slow (~100 ms); for short moments pause/step or use waits.

## Owner verdict on round 2
- Loved: "Blixtnedslag" (ref storm.js, id storm-bolt) — the bolt AND its rain.
- Loved: "Takdropp" (ref rain.js, id rain-ledge) — rain dripping along pane edges.
- Loved: the moon rising in "Natthimmel" (ref sky.js, sky-night); its clouds are interesting.
- Loved: sunrise/sunset in "Gryning" (ref sky.js, sky-dawn).
- Snowflakes: the flakes in "Frost" (ref snow.js, snow-frost) are the nicest — but NO ice crystals.
- Missing: a fog effect.

## Owner's mapping (authoritative)
position:
- sleeping → "z z z". resting → (nothing required; something very calm is optional).
- stunned → a direct "impact" indicator, like a flashbang in Counter-Strike but subtler.
- dying / incapacitated → red blood spatters here and there on the screen, subtle.
light (changes very fast while running through rooms — the harness already dwells 3 s and
mix values ease ~2 s; never react to env.raw for light/weather/fog, use env.mix/settled):
- `*` sunlight → outdoors: the top of the screen gets light, a sky-coloured gradient.
- `!` artificial light → indoors: no sky. (Harness detail: outdoors is decided by weather !== null,
  because `!` also occurs outdoors with a torch at night. So: no sky when mix.outdoors is 0; when
  outdoors with a torch at night, show the night sky.)
- `)` moonlight → top of the screen lit, but with a moonlight feel.
- `o` darkness → something indicating evil: a slightly reddish sky. (Harness splits this:
  mix.evil = `o` in daytime = unnatural darkness → ominous red; mix.dark = `o` at night =
  ordinary dark night sky, NOT red.)
Event.Sun (each game hour; rise/set are the dramatic ones) → sun rays at dawn/dusk.
Event.Moon → a BIG moon showing its phase (crescent / half / gibbous / full, env.moonPhase),
  rises slowly on one side, drifts slowly across while up, sets on the other side.
Event.Darkness (start/grow/shrink/end-soon/end; a global darkness level in the game) → a short
  animation that turns the sky reddish and ominous when darkness grows; otherwise darkness is
  driven by light in the current room.
fog → a misty effect, but very little at the bottom-left; light vs dense fog clearly different.
weather: ` ` nice → no effect · `~` clouds float across the sky · `'` light rain falls and drips
  over panes · `"` heavy rain: more rain, more drips (+ lightning, decorative) · `*` snowflakes ·
  null → indoors: no sky effects.

## Hard constraints
- Latency must not be affected: ALL modules together avg <= 1.0 ms, p95 <= 2 ms per frame.
  Your module's budget is stated in your task. No DOM access per frame. No per-frame
  allocations in hot loops. Cache sprites; render slow layers at low rate into an offscreen
  canvas and blit each frame. No ctx.filter / shadowBlur per particle per frame.
- Readability first: text must stay readable; the bottom rows and far left are masked by the
  harness, keep strong things away from text lines (env.lines) anyway.
- Smooth everything: no snapping. Ambient = discreet; drama = short moments.
- Plain JS, no libraries, no network.
- Iterate with screenshots in many states (day/night, indoors/outdoors, each weather, events,
  all modules on) until it is beautiful. Better fewer things done stunningly.

## Report back (max ~250 words)
What you built, which owner wishes it covers, perf (avg/p95 alone and with all modules),
best screenshot paths, anything you need changed in the harness, open questions for the owner.

## Round 4 (v4) — owner feedback on v3. THIS OVERRIDES the sections above where they conflict.
Sky logic (harness already changed, read its header): light no longer picks the sky. The latest
Event.Sun / Event.Moon decides (sun up -> day sky; night + moon up -> moonlit; night, no moon ->
starry night). Light 'o' overrides everything with the "darkness sky" (mix.evil). Moon size/phase
comes from the client (env.moonPhase).
Lightning: MUME has NO thunder/lightning weather value (help weather: ' ' ~ ' " * only). So NO
automatic lightning in rain at all. Lightning only on the 'strike' event (in the real client a
text trigger will fire it).

sky.js:
- Fewer, larger clouds that feel distant and move slower; feel of being UNDER the clouds (cloud
  base seen from below, perspective toward the horizon) rather than clouds entering from the side.
  Keep clouds in the top ~35 % of the screen.
- Sky less blue (more muted / desaturated, realistic). Gradient reaches further down: fades out at
  ~40–45 % of screen height. Vary the gradient slightly horizontally (lighter toward one side, like
  a real sky). Add a very subtle sky texture: faint thin streaks of tiny high clouds (cirrus), very
  subtle, must not clash with the real clouds (fade them out when mix.clouds rises).
- Shooting stars on the starry night sky were a nice touch: let them cross the WHOLE screen
  (long paths, can pass behind/over panes) and glide past the edge.
- Darkness.start/grow: remove the ink tendrils; keep the red ominous bleed.
- Darkness sky (mix.evil, light 'o'): dark, ominous, slight red; works day and night.

weather.js:
- Remove automatic lightning (keep the bolt + flash on 'strike', it is loved).
- Snow: when snow starts it should fall IN FROM ABOVE (flakes enter at the top and travel down;
  never fade in over the whole screen). Build up gradually: first a few flakes, then more and more
  (ramp over ~20–30 s). When snow stops, stop spawning and let flakes fall out. Add gusts of wind:
  occasional puffs where flakes swirl / eddy and drift sideways, then calm. Keep the Frost flakes.
- Rain the same principle is welcome (starts from the top, not fading in everywhere).

body.js:
- incapacitated/dying: somewhat larger blood spatters and a bit more blood. Also a large part of
  the screen gets slightly reddish and PULSES with colour shifts in time with the heartbeat
  (incap slower/weaker, dying stronger). Text must stay readable.
- stunned: the white full-screen flash is unpleasant. Make it felt instantly but not blinding:
  something in the CORNERS / edges of the screen instead of a white screen, plus a subtle shake
  feel (e.g. a brief jolt / double-image of the edge vignette, a quick displacement of the overlay;
  do NOT move the real DOM text). Subtle.
