# Menu bar clock mockups (stage 31a)

Two design-canvas artboards from 2026-11-01, in a new column on the
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
