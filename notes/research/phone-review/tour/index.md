# WebCockpit phone screenshot tour (2026-11-01, v0.2.1 dev)

Chromium, 390x844 CSS px (landscape 844x390), deviceScaleFactor 3, isMobile,
hasTouch, `?phone=1`, fresh browser profile (new-player defaults). Logged-in
state = mocked `wss://mume.org/ws-play/` playing the feed from
`scripts/screenshots.ts` (map-demo + timers-demo + channel talk + half the
ruffian fight). History/Spotlights use the restored demo runs
(`runs-demo.jsonl.gz`). Scripts: `tour.ts` (main), `extra.ts` (retakes 01/54,
adds 55-58, DOM measurements), `lib.ts`, `feed.ts`.

Marked "(not viewed)" = captured but not opened one by one; it is a
continuation of the shot above it.

## Start page and its menu

| File | Shows | Problems seen |
|---|---|---|
| 01-start-dark.png | Banner, start menu, quote, dark | Menu rows are 15 px tall. The menu fills the top 40 %, the rest is empty, so everything is out of thumb reach |
| 02-start-paper.png | Same on Paper (light) | Fine. Menu text is low-contrast grey-brown |
| 03-start-profile.png | Profile list + button column | Buttons and rows are 15 px tall. Footer shows only keyboard hints (Tab/←→ Cycle) |
| 04-start-profile-edit.png | Profile Editor LITE (Actions tab) | Title cut to "Profile Editor: de…". The fullscreen button covers HELP. Tabs cut ("HIGHLIG…", "SUBSTIT…"). Empty-state text "Press n to add one" is off-centre to the right and tells the user to press a key |
| 05-start-profile-new.png | Create New Profile prompt | No visible input box or caret, only a ">". The hint wraps badly |
| 06-start-scripts.png | Scripts list | [ ] toggles and EDIT are 15 px targets. Five lines of keyboard-only footer |
| 07-start-scripts-edit.png | Script editor (almanac, read-only) | The fullscreen button covers DUPLICATE. Title cut to "al…". Wrapped lines lose the comment indent |
| 08/09-start-scripts-edit-scroll*.png | Editor scrolled | (09 not viewed) |
| 10-start-scripts-manual.png | Script Manual | Readable. Text mentions "the panel on the right" and the menu bar, which the phone does not have |
| 11/12-start-scripts-manual-scroll*.png | Manual scrolled | (not viewed) |
| 13-start-history.png | History table + action column | The table runs to the screen edge with no right margin, and the RUN LOG button touches "Char". Rows are 15 px |
| 14-start-history-scroll1.png | History after a scroll | Body overflows by about 13 px. One swipe scrolls the All/Gittan/Rasta filter strip out of view (only its underline stays) and shows the "Storage" line that was hidden before |
| 15-start-history-runlog.png | Run log player | The log starts at x=0 with no margin. A stray orange glyph at the top-left. The fullscreen button sits on top of the log text. The control box is fine |
| 16-start-history-stats.png | Session details (stats) | The fullscreen button covers "18:40". ALLIES and ACHIEVEMENTS show empty headings with no "none". Footer is keyboard only (Tab switch table) |
| 17-start-history-rate.png | Rate the session | The stars are 8x15 px, faint and tiny. Footer is keyboard only (0-5 Rate, ←→) |
| 18-start-spotlights.png | Spotlight reel, card | The card hides the top. Large empty black gap between card and text. The fullscreen button overlaps the card corner |
| 19-start-spotlights-controls.png | Reel after tapping the stage | Event markers on the right edge. The control box covers the last game lines |
| 20-start-credits.png | Credits | Nearly empty black screen, very dim text at the bottom. The fullscreen button covers "Escape to exit". No visible way to leave by touch |
| 21-start-about.png | About | The version text crowds the fullscreen button. Text says "the menu bar along the top", which is wrong on a phone |
| 22-24-start-about-scroll*.png | About scrolled | Two-column credit table wastes about 40 % of the width at 390 px (22/23 not viewed) |

## Game view (portrait)

| File | Shows | Problems seen |
|---|---|---|
| 25-game-tab.png | GAME tab with fight text | Tab strip is 15 px tall (tabs 40-48x15). Input row is 14 px. The ☰ button is 16x14. The fullscreen button (44x44, the only full-size target) floats over the game text ("To") |
| 26-tab-character.png | CHAR pane | No HP/mana/move bars in this feed. SNEAK/RIDE/CLIMB/SWIM are near-invisible dark-on-dark. MOOD/ALERTNESS bars are empty. About 80 % of the pane is blank. The fullscreen button covers "L25" |
| 27-tab-map.png | MAP pane | Renders well, player box visible. Edge labels clipped ("Con") |
| 28-tab-group.png | GRP pane | Bars have no labels or numbers. The fullscreen button covers the right end of the bars |
| 29-tab-timers.png | TIME pane | The pane's "+" button sits under the fullscreen button |
| 30-tab-comm.png | COMM pane | The fullscreen button covers the "Soc" filter. Filters are tiny text chips |
| 31-game-keyboard-up.png | Input focused, viewport 390x480 | Works: tabs and input stay visible |
| 32-comm-keyboard-up.png | COMM with keyboard up | (not viewed) |

## ESC menu (☰)

| File | Shows | Problems seen |
|---|---|---|
| 33-esc-menu.png | ESC menu | Rows 15 px, top half only. Header Link shown |
| 34-esc-stats.png | Statistics (live run) | The fullscreen button covers "Run 0m". Empty kill rows leave gaps. XP/h axis reads "0 0 0" |
| 35-esc-profile.png | Profile → goes straight to the editor | Profile name cut completely ("Profile Editor: …"). "Comman…" cut. The fullscreen button covers HELP |
| 36-esc-options.png | Options list | (not viewed; same layout as the explore shot: Panes, Mapper, Appearance, Text input, Scripts, Weather) |
| 37-esc-options-panes.png | Panes submenu | Fine apart from the small rows |
| 38-esc-options-mapper.png | Mapper options | "Room info on hover" and "Hover text size" make no sense on touch |
| 39-esc-options-appearance.png | Appearance | Values change only through `<< >>` arrows (about 24x15 px). Tapping the row selects it and two taps do nothing, so it is not discoverable. The preview box runs off the right edge. Colour 0 swatch missing or invisible |
| 40-esc-options-textinput.png | Text input options | Fine apart from the small rows |
| 41-esc-options-scripts.png | Scripts (same as 06) | Same as 06 |
| 42-esc-options-weather.png | Weather effects | Fine apart from the small rows |
| 43-esc-exit-confirm.png | Exit session confirm | The only touch confirm is the footer word "Y Exit". It is a button but looks the same as the keyboard hints around it. Stars are 8 px |
| 55-esc-options-panes-appearance.png | Pane appearance grid | The Grey column touches the frame edge. Checkboxes are about 24x15 |
| 56-esc-options-panes-timers.png | Timers pane options | (not viewed) |
| 57-esc-options-panes-comm.png | Comm pane options | Fine apart from the small rows |
| 58-esc-options-panes-group.png | Group pane options | (not viewed) |

## Paper theme, disconnect, landscape

| File | Shows | Problems seen |
|---|---|---|
| 44-game-paper.png | GAME on Paper | Readable |
| 45-tab-character-paper.png | CHAR on Paper | On Paper SNEAK etc. look fully on, unlike the dark theme, so the on/off state is unclear |
| 46-esc-menu-paper.png | ESC menu on Paper | Fine |
| 47-disconnected-menu.png | Server drop: menu with Reconnect | The header still says "Link: 1ms" after the drop |
| 48-disconnected-game.png | Game after closing the menu | "Press Enter to reconnect" assumes a keyboard |
| 49-landscape-game.png | Landscape game | Same 15 px tab strip and input. The right half of the screen is unused (no side pane) |
| 50-landscape-map.png | Landscape map | Fine |
| 51-landscape-esc-menu.png | Landscape ESC menu | Fits. "Link: —" in red right after login |
| 52-landscape-esc-options.png | Landscape Options | (not viewed) |
| 53-landscape-esc-appearance.png | Landscape Appearance | The preview box is cut off and its text runs under or over the footer hint line |
| 54-landscape-start.png | Landscape start page | Fits |
