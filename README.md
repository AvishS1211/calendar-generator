# Daily Four — habit calendar generator

A small web tool that generates a printable **A3 landscape** habit calendar.
Type up to four habit labels, pick a month, download a print-ready PDF.

The sheet is filled in with a pen. No accounts, no saving, no digital ticking.

## Running it

No build step. Open `index.html` from the filesystem, or serve the folder:

```bash
python3 -m http.server 8137
```

## How it fits together

```
index.html
src/
  calendar.js     month maths — leading blanks, row count, ISO week
  layout.js       design tokens, every measurement, scene builder
  render-dom.js   live preview (SVG)
  render-pdf.js   jsPDF drawing
  metrics.js      generated font advance widths
  fonts/          TTFs + generated base64
tools/
  build-fonts.js  regenerates metrics.js + fonts-base64.js
  otf2ttf.py      CFF OpenType -> TrueType, for jsPDF
vendor/
  jspdf.umd.min.js
```

`calendar.js` is pure month maths, shared by both renderers, so the preview and
the PDF can never disagree about which day falls where.

`layout.js` goes further: it turns the model into a flat list of drawing
primitives, and `render-dom.js` (SVG) and `render-pdf.js` (jsPDF) are dumb
painters for that same list. The preview and the PDF are the same drawing
program with two backends, not two implementations that happen to agree.
Text widths come from `metrics.js`, extracted from the shipped TTFs, so neither
renderer consults its own font engine. The SVG disables kerning and ligatures
because jsPDF applies neither.

## PDF export

`jsPDF` with vector primitives (`rect`, `line`, `text`) — no html2canvas, no
screenshot-based export. The sheet is almost entirely hairlines and 2.3mm type,
which is exactly where rasterising fails at A3. Output is one page,
420 × 297mm, with both fonts embedded as subsetted TrueType.

`window.print()` is kept as a secondary path via
`@page { size: A3 landscape; margin: 0 }`, so the preview is directly printable.
Nothing on the sheet is a solid fill except the hatch, so it prints correctly
with "background graphics" off.

## Fonts

| Role | Font |
|---|---|
| Masthead | Akira Expanded |
| Numbers, labels, all small type | JetBrains Mono |

To change a font, drop a TTF in `src/fonts/`, update the map at the top of
`tools/build-fonts.js`, and run:

```bash
node tools/build-fonts.js
```

jsPDF can only embed TrueType (`glyf`) outlines. A CFF/PostScript OpenType file
(magic `OTTO`) must be converted first — `tools/otf2ttf.py` does this via
fontTools. `build-fonts.js` refuses a CFF font with instructions rather than
producing a broken PDF.

> **Font licensing:** Akira Expanded is used here from the free *demo* release,
> which its author licenses for **personal use only**. Commercial use requires a
> licence from [Creative Market](https://creativemarket.com/typologic/4868098-Akira-Expanded).
> JetBrains Mono is OFL and free for any use.
