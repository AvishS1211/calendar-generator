/* render-pdf.js — paints the same scene from layout.js with jsPDF's vector
   primitives (rect, line, text). No html2canvas, no rasterisation: this sheet
   is almost entirely hairlines and 2.3mm type, which is exactly where a
   screenshot-based export falls apart at A3. */
(function (global) {
  'use strict';

  var PT_PER_MM = 72 / 25.4;
  var mm2pt = function (mm) { return mm * PT_PER_MM; };

  var FONT = { mono: 'DFMono', display: 'DFDisplay' };

  function hexToRGB(hex) {
    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)];
  }

  /* Embed the TTFs so the sheet keeps its character; without this jsPDF
     silently falls back to Helvetica. */
  function embedFonts(doc) {
    var F = global.DF_FONTS;
    var defs = [
      ['DFDisplay.ttf', FONT.display, F.AKIRA_EXPANDED],
      ['DFMono.ttf', FONT.mono, F.JETBRAINS_MONO]
    ];
    for (var i = 0; i < defs.length; i++) {
      doc.addFileToVFS(defs[i][0], defs[i][2]);
      doc.addFont(defs[i][0], defs[i][1], 'normal');
    }
  }

  function build(model) {
    var jsPDFCtor = (global.jspdf && global.jspdf.jsPDF) || global.jsPDF;
    if (!jsPDFCtor) throw new Error('jsPDF not loaded');

    var doc = new jsPDFCtor({ unit: 'mm', format: 'a3', orientation: 'landscape' });
    embedFonts(doc);

    var scene = global.DFLayout.buildScene(model);
    var curDraw = null, curFill = null, curLW = null, curFont = null,
      curSize = null, curSpace = null;

    for (var i = 0; i < scene.length; i++) {
      var p = scene[i];

      if (p.t === 'line' || p.t === 'rect') {
        if (p.color !== curDraw) {
          var c = hexToRGB(p.color);
          doc.setDrawColor(c[0], c[1], c[2]);
          curDraw = p.color;
        }
        if (p.lw !== curLW) { doc.setLineWidth(p.lw); curLW = p.lw; }
        if (p.t === 'line') doc.line(p.x1, p.y1, p.x2, p.y2);
        else doc.rect(p.x, p.y, p.w, p.h, 'S');   // stroke only, never filled
        continue;
      }

      if (p.t === 'text') {
        var fname = FONT[p.font];
        if (fname !== curFont) { doc.setFont(fname, 'normal'); curFont = fname; }
        var pt = mm2pt(p.size);
        if (pt !== curSize) { doc.setFontSize(pt); curSize = pt; }
        if (p.color !== curFill) {
          var fc = hexToRGB(p.color);
          doc.setTextColor(fc[0], fc[1], fc[2]);
          curFill = p.color;
        }
        var space = p.track || 0;
        if (space !== curSpace) { doc.setCharSpace(space); curSpace = space; }

        var opts = { baseline: 'alphabetic', align: 'left' };
        if (p.angle) opts.angle = p.angle;
        doc.text(p.str, p.x, p.y, opts);
      }
    }
    return doc;
  }

  function download(model) {
    build(model).save(model.filename);
  }

  function blobURL(model) {
    return build(model).output('bloburl');
  }

  global.DFRenderPDF = { build: build, download: download, blobURL: blobURL, mm2pt: mm2pt };
})(window);
