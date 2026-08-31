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
  render-pdf.js   jsPDF drawing, text or outlined
  glyphs.js       TrueType glyf parser -> vector outlines
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

`jsPDF` with vector primitives (`rect`, `line`, `text`/paths) — no html2canvas,
no screenshot-based export. The sheet is almost entirely hairlines and 2.3mm
type, which is exactly where rasterising fails at A3. Output is one page,
420 × 297mm.

There are two export modes, toggled by **Outline text for print**:

**Outlined (default).** Every glyph is read out of the TTF by `glyphs.js` and
drawn as filled vector paths, and the font resource dictionary is emptied, so
the PDF references no fonts whatsoever — `pdffonts` on the result prints an
empty table. Still fully vector; hairlines and small type stay crisp. This is
what to send a printer.

**Text.** Text stays selectable and searchable with both TTFs embedded. About
10× smaller, but see below.

### Why outlining is the default

jsPDF always declares the 14 standard PDF fonts (Helvetica, Courier, Times,
Symbol, ZapfDingbats) in the page resource dictionary, whether or not the
content stream ever selects one. They are *not* embedded, because they are
assumed present in the viewer. A print shop's preflight walks that dictionary,
sees fonts marked "not embedded", and either rejects the job or silently
substitutes — and that substitution is what replaces the display face on
output, even though the real fonts were embedded correctly all along.

Outlining removes the entire class of problem: no fonts referenced, nothing to
substitute. The outlined and text renders are metrically identical — the same
`layout.js` scene, the same advance widths from `metrics.js`; a rendered
"SEPTEMBER" measures 113.792mm either way. Only edge antialiasing differs,
since filled paths are not hinted.

Emptying the font dictionary is done by padding the replacement back to the
original byte length, so every offset in the cross-reference table stays valid,
and it skips stream bodies so compressed page data is never touched.

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
