# Payload sizes: what a share link stores

Stage 64, part A2, 2026-11-15. Input to the 5 MiB per published run
(`payloadMaxBytes`, ADR 0154 "What is uploaded") and to the room 150
links per account take on R2. Scripts in the session scratchpad (`ps/
measure.mjs`, `fullmap.mjs`, `summary.cjs`, not in the repo). This note
has no game text and no character or player names.

## Material

The same as stage 63 (`notes/research/run-sizes.md`), read only:

- **WebCockpit's backups** of the owner's runs (`~/Downloads/
  webcockpit-runs-*.jsonl.gz`, the four files stage 63 used; the fifth,
  `…-10-07.jsonl(1).gz`, holds no run the others lack), merged by
  `runId`, newest file wins.
- **Cockpit's run records** (`/home/ole/MUME/data/runs/`), converted as
  stage 63 did (log lines as they are, a VIEW and a SIZE record first,
  events mapped to `RunEvent`). They have **no GMCP**, so no map either.

Stitched into sessions with the app's `stitchChains`: 48 sessions, 28.9
hours of session span (gaps between a session's runs included), 16 of
them at least 0.25 h. Kills are in 6 WebCockpit sessions and in the two
long Cockpit ones.

## Method

- **The payload** is the app's own code, bundled with esbuild:
  `buildReplayPayload(chain, events, doc, defaultSettings())` (src/share/
  payload.ts), chain texts joined from the chunks as `chainLog` does.
  Then `JSON.stringify` and gzip (node zlib, default level). The byte
  count was checked against the real `encodePayload` (CompressionStream
  gzip, base64 decoded): identical.
- **With the map**: the real `embedReplayMap` (src/replay/map-embed.ts)
  with the map tool run inline (`runMapToolRequest`) on the bundled
  `public/map/arda.mm2` (30 074 rooms), its tiles and fonts read from
  `public/map/` (the default tiles, as the export editor uses). Margin 16,
  ring 1 (the defaults).
- **A fight cut**: for each kill (at most 12 per session, spread evenly:
  56 cuts from 6 WebCockpit sessions, 26 from the 2 Cockpit ones), an
  export doc that excludes everything but **3 minutes** (150 s before the
  kill, 30 s after) or **10 minutes** (480 s before, 120 s after). The
  payload's own exclusion logic does the rest (folding, the excluded
  tail, left-out runs, the map only of the kept stretches).
- **A whole session**: the chain with an empty export doc.
- **Cockpit runs' GMCP** is estimated with stage 63's factor (gzip with
  GMCP over gzip without: median 1.42, largest seen 2.81). Their maps are
  not estimated from their own data (no Room.Info); the bound below is
  used instead.
- KB = 1 000 bytes, MB = 10^6. **5 MiB = 5 243 KB.**

## Figures

### Fight cuts (WebCockpit, measured, 56 cuts each)

| Cut | Without map: median (q1–q3), max | With map: median (q1–q3), max | Rooms visited, median (max) |
|---|---|---|---|
| 3 min | **61 KB** (34–110), 131 KB | **563 KB** (410–781), 1 161 KB | 13 (202) |
| 10 min | 102 KB (50–143), 175 KB | 860 KB (686–1 189), 1 960 KB | 74 (508) |

Cockpit fight cuts (text only, ×1.42 for GMCP): 3 min median 24 KB (max
47), 10 min 59 KB (max 122): fewer records than WebCockpit's (no SPANE,
less GMCP), so the WebCockpit figures are the ones to plan with.

Uncompressed JSON of a 3-minute cut: 0.41 MB without the map, 1.47 MB
with it (median).

### Where a cut's bytes go (3-minute cut, median)

| Part | Gzip |
|---|---|
| Capture texts, settings, markers (the payload without `map`) | 61 KB |
| `map.mm2` (the subset, already deflated, base64) | ≈ 120 KB |
| `map.files` (tiles and fonts as base64 data URIs, 87 files) | ≈ 330 KB |
| **The map's share of the payload** | **90 %** (74–95 %) |

The map has a floor of about **260 KB** even for one visited room (the
fonts, the character pixmaps and the tiles of the surrounding area),
because base64 of PNG and deflate data does not compress again.

### Whole sessions (WebCockpit with GMCP, ≥ 0.25 h, 14 sessions)

| | Median (q1–q3) | Max |
|---|---|---|
| Without map | 92 KB (37–354) | 600 KB |
| Without map, per hour | 117 KB/h (43–241) | 417 KB/h |
| With map | **632 KB** (476–1 470) | **3 614 KB** (2.1 h, 1 476 rooms visited) |

All 26 sessions with map data (short ones included): median 519 KB with
the map, the map part 459 KB (258–3 015 KB).

The two long Cockpit sessions (text only, no map): 2.4 h → 638 KB, ×1.42
= 0.91 MB [×2.81 = 1.79 MB]; 5.0 h, 137 kills → 851 KB, ×1.42 = 1.21 MB
[2.39 MB].

### The largest

- **Measured: 3.61 MB** (a 2.1 h session, 14 617 rooms in the subset),
  **69 % of 5 MiB**. Everything else measured is below 2.2 MB.
- **The map's ceiling**: visits spread over the whole map saturate the
  subset at about 20 600 rooms (the rest is out of reach of the margin);
  that subset embeds as **4.0 MB** gzip (mm2 3.45 MB, tiles and fonts
  0.55 MB). The whole `arda.mm2` would be 5.83 MB in base64 gzip, over
  5 MiB alone, but no visit set reaches it.
- **Estimated worst session**: the 5-hour Cockpit session with GMCP
  (1.2–2.4 MB) and a map like the largest measured one (3.0 MB) or the
  ceiling (4.0 MB): **4.2–6.4 MB**. A long session with wide travel can
  pass 5 MiB; a cut cannot come near it (the largest 10-minute cut is
  2.0 MB).
- The bounds `validatePayload` sets (ADR 0154) hold: the saturated
  subset's mm2 is 4.6 MB of base64 (≤ 8 MiB); at most 121 map files
  (≤ 2 000).

### 150 links per account and R2's free 10 GB

| Per published run | 150 × it per account | Accounts in 10 GB (links only) | Beside full run storage (50 MiB each) |
|---|---|---|---|
| 3-min cut with map, median 563 KB | 84 MB | 118 | **73** |
| Whole session with map, median 632 KB | 95 MB | 105 | 68 |
| 10-min cut with map, median 860 KB | 129 MB | 77 | 55 |
| 3-min cut without map, 61 KB | 9 MB | 1 090 | 162 |
| Every link at the 5 MiB ceiling | 786 MB | 12 | 11 |

Beyond the free storage R2 costs $0.015 per GB-month: an account with
150 median cuts costs about $0.0013 a month; 1 000 such accounts about
$1.10 a month. Requests are no matter (one PUT per link; one GET per
watch, cached privately for a week).

## Conclusion

- **A typical shared fight is about 0.56 MB** (3 minutes) to 0.86 MB (10
  minutes), **nine tenths of it the map**. Without the map it is 60–100
  KB.
- **Keep 5 MiB.** Every measured cut and session fits (the largest 3.61
  MB, 69 %); a cut is under 2 MB in the worst case seen. Only an uncut
  multi-hour session with wide travel can pass it (estimated up to 6.4
  MB), and that is not what a link is for; the dialog's refusal ("cut it
  shorter") covers it. A higher limit would mostly raise the worst case
  of storage (150 × the limit) without helping the cuts that are shared.
- **Storage is no concern at the medians**: 150 median cuts are 84 MB
  per account, as much again as a full run library; about 70 accounts
  with full runs and 150 links each fit in the free 10 GB, and real
  accounts will hold a handful of links.
- **Where to save if it ever matters** (not needed now): the tiles and
  fonts (≈ 330 KB of a 563 KB cut) are the app's own static files. The
  watch page already hands the frame its fonts from its own origin
  (ADR 0154 "The handshake"); handing it the map's tiles and fonts the
  same way, and leaving `map.files` out of an uploaded payload, would
  bring a typical link to about 0.2 MB. That changes the wire form and
  `validatePayload`, so it belongs before schema-1 links exist in
  production or as a schema 2.
