# Menu bar clock mockups (stage 31a)

Four design-canvas artboards from 2026-11-01, in a new column on the
owner's canvas https://claude.ai/artifact/Bap2VJPNro2qcKTDrXXmaj (private
to the owner; the stage 30 mockups are on the same canvas). Each shows the
bar zoomed 2.5× (day and night) and at 1:1 under a game line, at a 15 px
font and 9×17 px cells. `gen.mjs` generates both (static markup); run it
with a folder that has `canvas/project/` to regenerate. Reference
material, not code to copy into `src/`.

Today's clock (measured in Firefox and Chromium, 2026-11-01): the time is
bold white at the full terminal font, the icon a 2-stroke sun or moon in
full colour (`#ffb000`, `#4a90e2`). All boxes are centred on the bar, but
the bold digits' ink is taller than the 13 px icons' and the moon's ink sits
low in its box, so the moon reads low.

| Variant | Direction |
|---|---|
| Nu | Today, for comparison. |
| A · Tonad | Regular weight, smaller (13/15), light grey like game text; sun and moon as thin as the other icons, colour slightly muted, optically centred. |
| B · Spökgrå | The clock as a ghost icon: grey time, faintly tinted sun/moon; lights up (white, full colour) on hover. |
| C · Periodens färg | No white: time and icon in the period's colour (muted amber by day, blue by night). |
| D · Lugn tills skiftet | All grey, icon first like the buttons; lights up in the period's colour in the last minute before the change. |
| E · Horisontlinje | No icon: a 5-cell line where a sun or moon dot travels left to right over the period; small grey time in front. 2 cells wider. |
| F · Solbåge | A tiny sundial: the sun or moon dot follows an arc over the horizon; grey time after it. Same width as today. |
| G · Bricka | The clock in a faintly recessed chip, like a small display: muted icon and small time. |
| H · Ring som räknar ner | Owner's idea (2026-11-01): a smaller sun or moon (filled disc, filled crescent) inside a time-left ring that vanishes clockwise from 12 o'clock as the period runs out; toned time as in A. Same width as today. |
| H2 · Ring utan siffror | H without the time beside it (time in the tooltip). About half as wide. |
| H3 · Ring med spår | H with the vanished part kept as a faint track. |
| I1 · Strålsol | Icon and ring only, no time (time in the tooltip). Ring as tall as the cell and thinner; a filled sun with eight short rays; a larger moon. |
| I2 · Spöksol | I1 with the sun drawn in lines like the bar's other icons. |
| I3 · Glödande sol | No rays: a larger sun disc with a soft glow inside the ring. |
| I4 · Strålkransen räknar ner | No separate ring: the sun's twelve rays are the ring and go out one by one clockwise from 12; at night twelve small stars around the moon. |
| I5 · Strålsol med spår | I1 with the vanished part as a faint track. |
| Jämförelse · I1 med tid | I1 with the toned time kept, for comparison. |
