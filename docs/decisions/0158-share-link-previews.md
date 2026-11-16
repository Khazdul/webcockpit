# 0158 — Link previews of shared logs

Date: 2026-11-17. Status: accepted (built on `feat/share-link-previews`).

## Context

A share link (`/r/<id>`, ADR 0154) or a Hall of Fame log (ADR 0155; it
opens at the same `/r/<id>`) pasted into Discord, Slack, iMessage or
Messenger unfurled as the bare site. The owner wants the unfurl of a
Facebook reel in Discord: "MUME Cockpit" small on top, a blue title
"<log title> (<character>)", an optional description, and a thumbnail of
the log with a play button and a small mark. Crawlers run no script.

## Decision

- **The image is drawn on the sender's device** after the link is made
  (`src/share/preview-image.ts`, a lazy chunk the share dialog imports):
  the payload's first lines as the replay prints them (`playerEntries`,
  cuts left out, `parseSgr` styles, commands after their prompt in the
  input colour, system lines dimmed) in the payload's font, palette,
  background and bold rule; a soft shade in the middle, a play button
  (white triangle in a translucent dark circle with a light ring), and the
  favicon's M with "MUME COCKPIT" in Cinzel on a dark pill bottom right.
  No server-side rendering: the Worker never parses a payload (ADR 0154).
- **Size 1200 x 900 (4:3), PNG.** Discord shows the `og:image` of a
  `summary` card as a side thumbnail fitted into about 80 px: 4:3 gives a
  larger thumbnail than 1.91:1 (80 x 60 against 80 x 42), with the play
  button still central. 23 lines of 28 px text fill it. Facebook's large
  card crops to 1.91:1 from the middle (the button stays; the mark may be
  cut): accepted, Discord is the target. A sample is ~145 KB.
- **Facebook's layout:** `twitter:card` is `summary`, never
  `summary_large_image`, so Discord puts the image beside the text.
- **Upload:** `PUT /api/u/pub/<id>/preview` after the POST, in the
  background (the link works without it). Checks: the session, the CSRF
  rule (X-WC and Origin), the flag `share`; `Content-Type: image/png`; a
  Content-Length, at most 768 KB (`PREVIEW_MAX_BYTES`), read capped; the
  PNG signature and an IHDR of exactly 1200 x 900, 8-bit RGB/RGBA, no
  interlace (the image is never decoded server-side); only the sender's
  own active run (a hidden one: 403 `hidden`); a second PUT replaces it.
  Not counted in `pub_bytes` (one bounded image per run). R2 key
  `pubprev/<id>`; `dropObjects` deletes it with the payload (removal by
  the sender, the admin, Delete account, the cron).
- **Serving:** `GET /r/<id>/preview.png` (under `run_worker_first`
  `/r/*`): the general API limiter by address; 404 unless the run is
  `active` (hidden, removed, pending and unknown runs serve no image);
  the stored image, else the generic one; `image/png`, `nosniff`,
  `default-src 'none'`, `public, max-age=3600` (short, so a hidden log's
  image leaves caches soon).
- **Meta tags:** `watchPage` injects `og:site_name`, `og:type`,
  `og:url`, `og:title`, `og:description` (when the log has one, one line,
  200 chars), `og:image` (+ type, width, height, alt) and the
  `twitter:` twins before `</head>`, and the `<title>`; every value
  HTML-escaped (`& < > " '`). `og:title` is `ogTitle` (shared/cloud/
  preview.ts): at most 70 code points; the title is cut with "…" so the
  character always survives (a name over 35 is cut too). The image URL
  is `/r/<id>/preview.png?v=<upload time>` when R2 has one (one `head`),
  else `/share-preview.png`. A log not active gets generic tags only
  ("A shared MUME log"), none of its words. With `share` off or no
  database the page is served unchanged. A log's page drops the ETag and
  conditional headers (`no-cache`), so no cached copy keeps old tags.
- **Fallback:** `public/share-preview.png`, the same drawing with no
  lines in the default look, made by `scripts/build-share-preview.ts`.
- No D1 migration: whether a run has an image is R2's `head`.

## Consequences

- Logs shared before this have the generic image with their own title.
- Discord caches unfurls; a preview uploaded seconds after a paste may
  show the generic image there until its cache expires.
- The CSP and the sandboxed watch frame are untouched: the image is drawn
  in the app's document (same-origin favicon and fonts), not the frame.

**Addendum 2026-11-17:** the mark is the logo alone (no "MUME COCKPIT"
wordmark or pill), about 96 px, at the bottom right.
